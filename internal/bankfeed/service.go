package bankfeed

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
	plaid "github.com/plaid/plaid-go/v49"
	"github.com/zalando/go-keyring"
)

type Service struct {
	mu          sync.Mutex
	provider    *provider
	vault       *vault
	environment string
	openURL     func(string) error
}

// New loads backend-only environment settings without replacing process env.
// A packaged app can use process settings; local development loads .env in cwd.
func New(openURL func(string) error) (*Service, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, errStorage
	}
	// Finder launches have no project working directory. Prefer one private
	// backend settings file, with the repo .env as a development fallback.
	for _, file := range []string{filepath.Join(dir, "finstrel", "plaid", ".env"), ".env"} {
		if _, err := os.Stat(file); errors.Is(err, os.ErrNotExist) {
			continue
		} else if err != nil {
			return nil, errors.New("Plaid settings could not be read. Check file permissions.")
		}
		if godotenv.Load(file) != nil {
			return nil, errors.New("Plaid settings could not be loaded. Check the backend .env file.")
		}
		break
	}
	environment := os.Getenv("PLAID_ENV")
	if environment == "" {
		environment = "sandbox"
	}
	if environment != "sandbox" && environment != "production" {
		return nil, errors.New("PLAID_ENV must be sandbox or production.")
	}
	s := &Service{environment: environment, openURL: openURL, vault: newVault(filepath.Join(dir, "finstrel", "plaid", environment), environment, systemCredentials{})}
	clientID, secret := os.Getenv("PLAID_CLIENT_ID"), os.Getenv("PLAID_SECRET")
	if clientID != "" && secret != "" {
		s.provider = newProvider(clientID, secret, environment)
	}
	return s, nil
}

func (s *Service) view(state snapshot) View {
	v := View{Configured: s.provider != nil, Environment: s.environment, Items: []Item{}, ArchivedItems: state.ArchivedItems}
	if state.Session != nil {
		v.PendingSession = state.Session.ID
	}
	for _, r := range state.Items {
		v.Items = append(v.Items, r.Item)
	}
	return v
}

func (s *Service) View() (View, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	unlock, err := s.vault.lock(context.Background())
	if err != nil {
		return View{}, err
	}
	defer unlock()
	state, err := s.vault.load()
	if err != nil {
		return View{}, err
	}
	return s.view(state), nil
}

// SetTransactionCategory stores a user-selected category alongside the encrypted feed.
func (s *Service) SetTransactionCategory(itemID, transactionID string, categoryID int64) (View, error) {
	return s.updateTransaction(itemID, transactionID, func(t *Transaction) { t.BudgetCategoryID = categoryID })
}

func (s *Service) SetTransactionExcluded(itemID, transactionID string, excluded bool) (View, error) {
	return s.updateTransaction(itemID, transactionID, func(t *Transaction) { t.ExcludeFromBudget = excluded })
}

func (s *Service) updateTransaction(itemID, transactionID string, update func(*Transaction)) (View, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	unlock, err := s.vault.lock(context.Background())
	if err != nil {
		return View{}, err
	}
	defer unlock()
	state, err := s.vault.load()
	if err != nil {
		return View{}, err
	}
	for i := range state.Items {
		item := &state.Items[i].Item
		if item.ID != itemID {
			continue
		}
		for j := range item.Transactions {
			if item.Transactions[j].ID == transactionID {
				update(&item.Transactions[j])
				if err := s.vault.save(state); err != nil {
					return View{}, err
				}
				return s.view(state), nil
			}
		}
	}
	for i := range state.ArchivedItems {
		item := &state.ArchivedItems[i]
		if item.ID != itemID {
			continue
		}
		for j := range item.Transactions {
			if item.Transactions[j].ID == transactionID {
				update(&item.Transactions[j])
				if err := s.vault.save(state); err != nil {
					return View{}, err
				}
				return s.view(state), nil
			}
		}
	}
	return View{}, errors.New("Bank transaction not found. Refresh and try again.")
}

func (s *Service) ready() error {
	if s.provider == nil {
		return errors.New("Set up Plaid Sandbox keys for the Go backend, then restart the app.")
	}
	return nil
}

func hostedURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Host == "secure.plaid.com" && u.User == nil && strings.HasPrefix(u.Path, "/hl/")
}

// StartLink returns an opaque local ID; even the hosted URL stays out of Wails.
func (s *Service) StartLink(ctx context.Context, itemID string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	unlock, err := s.vault.lock(ctx)
	if err != nil {
		return "", err
	}
	defer unlock()
	if err := s.ready(); err != nil {
		return "", err
	}
	state, err := s.vault.load()
	if err != nil {
		return "", err
	}
	if state.Session != nil && (time.Now().Before(state.Session.Expires) || state.Session.NewItemID != "") {
		if itemID != "" && itemID != state.Session.ItemID {
			return "", errors.New("Finish the current bank sign-in before reconnecting another account.")
		}
		if state.Session.NewItemID != "" {
			return state.Session.ID, nil
		}
		if err := s.openURL(state.Session.URL); err != nil {
			return "", errors.New("Could not open bank sign-in. Try Connect again to reopen it.")
		}
		return state.Session.ID, nil
	}
	// Reopening an expired update session must retain its original connection.
	// The UI sends no Item ID for its generic Open sign-in again action.
	if itemID == "" && state.Session != nil {
		itemID = state.Session.ItemID
	}
	if state.UserID == "" {
		state.UserID = uuid.NewString()
	}
	var access string
	if itemID != "" {
		found := false
		for _, r := range state.Items {
			if r.Item.ID == itemID && !r.Revoked {
				found = true
			}
		}
		if !found {
			return "", errors.New("Choose an existing connection to reconnect.")
		}
		access, err = s.vault.token(itemID)
		if err != nil {
			return "", err
		}
	}
	// Verify secure local storage is available before creating a remote session.
	state.Session = nil
	if err = s.vault.save(state); err != nil {
		return "", err
	}
	result, err := s.provider.createLink(ctx, state.UserID, access)
	if err != nil {
		return "", err
	}
	if result.HostedLinkURL == nil || !hostedURL(*result.HostedLinkURL) {
		return "", errors.New("Plaid did not return a valid secure sign-in page. Check Hosted Link setup and try again.")
	}
	state.Session = &linkSession{ID: uuid.NewString(), Token: result.LinkToken, URL: *result.HostedLinkURL, ItemID: itemID, Expires: result.Expiration}
	if err = s.vault.save(state); err != nil {
		return "", err
	}
	if err = s.openURL(*result.HostedLinkURL); err != nil {
		return "", errors.New("Could not open bank sign-in. Try Connect again to reopen it.")
	}
	return state.Session.ID, nil
}

func (s *Service) FinishLink(ctx context.Context, sessionID string) (View, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	unlock, err := s.vault.lock(ctx)
	if err != nil {
		return View{}, err
	}
	defer unlock()
	if err := s.ready(); err != nil {
		return View{}, err
	}
	state, err := s.vault.load()
	if err != nil {
		return View{}, err
	}
	if state.Session == nil || state.Session.ID != sessionID {
		return View{}, errors.New("No matching sign-in session. Start a new connection.")
	}
	session := *state.Session
	// The stable local ID is committed BEFORE a single-use exchange. A failed
	// snapshot write can resume from the credential-store receipt after restart.
	if session.NewItemID != "" {
		for i := range state.Items {
			r := &state.Items[i]
			if r.Item.ID != session.NewItemID {
				continue
			}
			if r.RecoveryToken != "" {
				if err = s.vault.putConnection(r.Item.ID, connectionCredential{Token: r.RecoveryToken, ProviderID: r.ProviderID}); err != nil {
					return View{}, err
				}
				r.RecoveryToken = ""
			}
			if receipt, e := s.vault.connection(r.Item.ID); e == nil && receipt.ProviderID != "" {
				r.ProviderID = receipt.ProviderID
				r.Item.Status = "connected"
				state.Session = nil
				if err = s.vault.save(state); err != nil {
					return View{}, err
				}
				return s.importState(ctx, state)
			} else if e != nil && !errors.Is(e, keyring.ErrNotFound) {
				return View{}, errStorage
			}
		}
	}
	if time.Now().After(session.Expires.Add(6 * time.Hour)) {
		if err = s.discardPending(&state); err != nil {
			return View{}, err
		}
		return View{}, errors.New("This sign-in session expired. Start a new connection.")
	}
	result, err := s.provider.linkResult(ctx, session.Token)
	if err != nil {
		if codeIs(err, "INVALID_LINK_TOKEN") {
			if saveErr := s.discardPending(&state); saveErr != nil {
				return View{}, saveErr
			}
		}
		return View{}, err
	}
	var added []*plaid.LinkSessionItemAddResult
	success, finished := false, false
	lastSessionID := ""
	for _, link := range result.LinkSessions {
		if link == nil {
			continue
		}
		if link.FinishedAt != nil {
			finished = true
		}
		if link.OnSuccess != nil {
			lastSessionID = link.LinkSessionID
			success = true
		}
		if link.Results != nil {
			added = append(added, link.Results.ItemAddResults...)
			if len(link.Results.ItemAddResults) > 0 {
				lastSessionID = link.LinkSessionID
			}
		}
	}
	if len(added) == 0 && !(session.ItemID != "" && success) {
		if finished || time.Now().After(session.Expires) {
			if err = s.discardPending(&state); err != nil {
				return View{}, err
			}
			return View{}, errors.New("Bank sign-in was not completed. Start a new connection when you are ready.")
		}
		// An unfinished sign-in is a normal state while the browser is open.
		return s.view(state), nil
	}
	supportID("link_session_id", lastSessionID)
	if session.ItemID != "" {
		// Update mode keeps the original access token; never exchange another one.
		state.Session = nil
		for i := range state.Items {
			if state.Items[i].Item.ID == session.ItemID {
				state.Items[i].LinkSessionID = lastSessionID
				state.Items[i].Item.Status = "connected"
				state.Items[i].Item.Notice = "Sign-in updated. Import updates to retrieve the latest available data."
			}
		}
		if err = s.vault.save(state); err != nil {
			return View{}, err
		}
		return s.importState(ctx, state)
	}
	if len(added) != 1 || added[0] == nil || added[0].PublicToken == "" {
		return View{}, errors.New("Plaid returned an incomplete connection result. Reopen sign-in and try again.")
	}
	addition := added[0]
	if duplicate(state, addition) {
		if err = s.discardPending(&state); err != nil {
			return View{}, err
		}
		return View{}, errors.New("That account is already connected. Use Import updates or Reconnect on the existing connection.")
	}
	id := session.NewItemID
	if id == "" {
		id = uuid.NewString()
		institution, institutionID := "Connected bank", ""
		if addition.Institution != nil {
			institution = text(addition.Institution.Name, institution)
			institutionID = text(addition.Institution.InstitutionID, "")
		}
		r := record{Item: emptyItem(id, institution), InstitutionID: institutionID, PersistentIDs: map[string]string{}}
		r.LinkSessionID = lastSessionID
		r.Item.Status = "connecting"
		state.Items = append(state.Items, r)
		state.Session.NewItemID = id
		if err = s.vault.save(state); err != nil {
			return View{}, err
		}
	}
	exchanged, err := s.provider.exchange(ctx, addition.PublicToken)
	if err != nil {
		if codeIs(err, "INVALID_PUBLIC_TOKEN", "PUBLIC_TOKEN_EXPIRED") {
			state.Items = removePlaceholder(state.Items, id)
			state.Session = nil
			if saveErr := s.vault.save(state); saveErr != nil {
				return View{}, saveErr
			}
			return View{}, errors.New("This sign-in token expired or was already used. The incomplete attempt was cleared. Check the Plaid Dashboard for an incomplete connection before starting again.")
		}
		return View{}, err
	}
	index := len(state.Items) - 1
	for i := range state.Items {
		if state.Items[i].Item.ID == id {
			index = i
			break
		}
	}
	state.Items[index].ProviderID = exchanged.ItemID
	if err = s.vault.putConnection(id, connectionCredential{Token: exchanged.AccessToken, ProviderID: exchanged.ItemID}); err != nil {
		if s.provider.remove(ctx, exchanged.AccessToken) == nil {
			state.Items = append(state.Items[:index], state.Items[index+1:]...)
			state.Session = nil
			if saveErr := s.vault.save(state); saveErr != nil {
				return View{}, saveErr
			}
		} else {
			// If the credential store becomes unavailable mid-exchange, retain an
			// encrypted recovery receipt so this live connection stays reachable.
			state.Items[index].RecoveryToken = exchanged.AccessToken
			if saveErr := s.vault.save(state); saveErr != nil {
				return View{}, errors.New("Bank sign-in completed, but local storage and remote cleanup failed. Remove the connection in the Plaid Dashboard before connecting again.")
			}
		}
		return View{}, err
	}
	state.Items[index].Item.Status = "connected"
	state.Session = nil
	if err = s.vault.save(state); err != nil {
		return View{}, err
	}
	// A successfully persisted Item remains available even when its first import
	// is not ready. The user can resume with Import updates without relinking.
	return s.importState(ctx, state)
}

func removePlaceholder(items []record, id string) []record {
	for i, r := range items {
		if r.Item.ID == id && r.ProviderID == "" && r.RecoveryToken == "" {
			return append(items[:i], items[i+1:]...)
		}
	}
	return items
}

// CancelLink abandons a pre-exchange sign-in only. A durable exchange receipt
// must be completed/revoked through the normal flow so no live Item is lost.
func (s *Service) CancelLink(sessionID string) (View, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	unlock, err := s.vault.lock(context.Background())
	if err != nil {
		return View{}, err
	}
	defer unlock()
	state, err := s.vault.load()
	if err != nil {
		return View{}, err
	}
	if state.Session == nil {
		return s.view(state), nil
	}
	if state.Session.ID != sessionID {
		return View{}, errors.New("Choose the current sign-in session to cancel.")
	}
	if id := state.Session.NewItemID; id != "" {
		for _, r := range state.Items {
			if r.Item.ID == id && (r.ProviderID != "" || r.RecoveryToken != "") {
				return View{}, errors.New("Bank sign-in already created a connection. Choose I finished sign-in, then Disconnect if you want to remove it.")
			}
		}
		if _, err := s.vault.connection(id); !errors.Is(err, keyring.ErrNotFound) {
			if err != nil {
				return View{}, err
			}
			return View{}, errors.New("Bank sign-in already created a connection. Choose I finished sign-in, then Disconnect if you want to remove it.")
		}
		state.Items = removePlaceholder(state.Items, id)
	}
	state.Session = nil
	if err = s.vault.save(state); err != nil {
		return View{}, err
	}
	return s.view(state), nil
}

func duplicate(state snapshot, addition *plaid.LinkSessionItemAddResult) bool {
	institution := ""
	if addition.Institution != nil {
		institution = text(addition.Institution.InstitutionID, "")
	}
	for _, r := range state.Items {
		if r.Revoked {
			continue
		}
		for _, account := range addition.Accounts {
			if account == nil {
				continue
			}
			for _, existing := range r.Item.Accounts {
				if text(account.ID, "") != "" && existing.ID == *account.ID {
					return true
				}
				if institution != "" && institution == r.InstitutionID && existing.Mask != "" && existing.Mask == text(account.Mask, "") && existing.Subtype == text(account.Subtype, "") {
					return true
				}
			}
		}
	}
	return false
}

func emptyItem(id, institution string) Item {
	return Item{ID: id, Institution: institution, Status: "connected", Accounts: []Account{}, Transactions: []Transaction{}, Liabilities: []Liability{}, Holdings: []Holding{}, InvestmentTransactions: []InvestmentTransaction{}}
}

func (s *Service) Import(ctx context.Context) (View, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	unlock, err := s.vault.lock(ctx)
	if err != nil {
		return View{}, err
	}
	defer unlock()
	if err := s.ready(); err != nil {
		return View{}, err
	}
	state, err := s.vault.load()
	if err != nil {
		return View{}, err
	}
	return s.importState(ctx, state)
}

// AutoImport runs once on launch, without interrupting a pending Link session.
func (s *Service) AutoImport(ctx context.Context) (View, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	unlock, err := s.vault.lock(ctx)
	if err != nil {
		return View{}, err
	}
	defer unlock()
	state, err := s.vault.load()
	if err != nil {
		return View{}, err
	}
	if s.provider == nil || state.Session != nil || len(state.Items) == 0 {
		return s.view(state), nil
	}
	return s.importState(ctx, state)
}

// ImportItem updates only the selected connection.
func (s *Service) ImportItem(ctx context.Context, itemID string) (View, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	unlock, err := s.vault.lock(ctx)
	if err != nil {
		return View{}, err
	}
	defer unlock()
	if err := s.ready(); err != nil {
		return View{}, err
	}
	state, err := s.vault.load()
	if err != nil {
		return View{}, err
	}
	if state.Session != nil {
		return View{}, errors.New("Finish or cancel the current bank sign-in before importing updates.")
	}
	for _, record := range state.Items {
		if record.Item.ID == itemID && !record.Revoked {
			return s.importSelected(ctx, state, itemID)
		}
	}
	return View{}, errors.New("This bank connection is no longer available. Refresh and try again.")
}

func (s *Service) importState(ctx context.Context, state snapshot) (View, error) {
	return s.importSelected(ctx, state, "")
}

func (s *Service) importSelected(ctx context.Context, state snapshot, itemID string) (View, error) {
	for i, old := range state.Items {
		if itemID != "" && old.Item.ID != itemID {
			continue
		}
		if old.Revoked {
			if err := s.vault.deleteToken(old.Item.ID); err != nil {
				return View{}, err
			}
			continue
		}
		updated, err := s.importItem(ctx, old)
		if err != nil {
			old.Item.Status = "error"
			if codeIs(err, "ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN") {
				old.Revoked = true
				old.Item.Status = "revoked"
			}
			if codeIs(err, "ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "ITEM_PENDING_EXPIRATION") {
				old.Item.Status = "reconnect"
			}
			old.Item.Notice = err.Error()
			state.Items[i] = old
		} else {
			state.Items[i] = updated
		}
		// Each Item's records and cursor commit together. Never update the manual
		// ledger: historical transactions must not be added to a current balance.
		if err = s.vault.save(state); err != nil {
			return View{}, err
		}
		if state.Items[i].Revoked {
			if err = s.vault.deleteToken(state.Items[i].Item.ID); err != nil {
				return View{}, err
			}
		}
	}
	return s.view(state), nil
}

func (s *Service) importItem(ctx context.Context, old record) (record, error) {
	// Deep copy so a failed pagination/product call cannot mutate old slices/maps.
	data, _ := json.Marshal(old)
	var r record
	if json.Unmarshal(data, &r) != nil {
		return old, errStorage
	}
	token, err := s.vault.token(r.Item.ID)
	if err != nil {
		return old, err
	}
	live, err := s.provider.item(ctx, token)
	if err != nil {
		return old, err
	}
	if live.Item == nil {
		return old, errors.New("Plaid did not return connection status. Try importing again.")
	}
	if live.Item.Error != nil {
		return old, sanitizeError(&itemStatusError{body: live.Item.Error})
	}
	r.ProviderID = live.Item.ItemID
	r.InstitutionID = text(live.Item.InstitutionID, r.InstitutionID)
	accounts, err := s.provider.accounts(ctx, token)
	if err != nil {
		return old, err
	}
	remapAccounts(&r, accounts.Accounts)
	r.Item.Status, r.Item.Notice = "connected", ""
	if r.InstitutionID != "" {
		label, e := s.provider.institution(ctx, r.InstitutionID)
		if e == nil && label.Institution != nil {
			r.Item.Institution = label.Institution.Name
		} else {
			r.Item.Notice = "Bank display details could not be refreshed. "
		}
	}
	if live.Item.ConsentExpirationTime != nil && live.Item.ConsentExpirationTime.Before(time.Now().Add(7*24*time.Hour)) {
		r.Item.Status = "reconnect"
		r.Item.Notice += "Bank permission expires soon. Choose Reconnect to renew it. "
	}
	// Readiness is communicated to the user; no busy polling or paid refresh.
	spending := false
	for _, a := range r.Item.Accounts {
		if a.Type == "depository" || a.Type == "credit" {
			spending = true
		}
	}
	if spending {
		if err = s.syncTransactions(ctx, token, &r); err != nil {
			if codeIs(err, "PRODUCTS_NOT_SUPPORTED", "PRODUCT_NOT_SUPPORTED", "NO_ACCOUNTS", "PRODUCT_NOT_READY", "ADDITIONAL_CONSENT_REQUIRED", "CONSENT_REQUIRED") {
				r.Item.Notice += "Transactions: " + err.Error() + " "
			} else {
				return old, err
			}
		}
	}
	debt, investments := false, false
	for _, a := range r.Item.Accounts {
		if a.Type == "credit" || a.Type == "loan" {
			debt = true
		}
		if a.Type == "investment" {
			investments = true
		}
	}
	if debt {
		response, e := s.provider.liabilities(ctx, token)
		if e != nil {
			if codeIs(e, "ITEM_LOGIN_REQUIRED") {
				return old, e
			}
			r.Item.Notice += "Debt details: " + e.Error() + " "
		} else {
			r.Item.Liabilities, e = normalizeLiabilities(response)
			if e != nil {
				return old, e
			}
		}
	} else {
		r.Item.Liabilities = []Liability{}
	}
	if investments {
		response, e := s.provider.holdings(ctx, token)
		if e != nil {
			if codeIs(e, "ITEM_LOGIN_REQUIRED") {
				return old, e
			}
			r.Item.Notice += "Investments: " + e.Error() + " "
		} else {
			r.Item.Holdings = normalizeHoldings(response)
			activity, e := s.investmentActivity(ctx, token)
			if e != nil {
				if codeIs(e, "ITEM_LOGIN_REQUIRED") {
					return old, e
				}
				r.Item.Notice += "Investment activity: " + e.Error() + " "
			} else {
				r.Item.InvestmentTransactions = activity
			}
		}
	} else {
		r.Item.Holdings = []Holding{}
		r.Item.InvestmentTransactions = []InvestmentTransaction{}
	}
	r.Item.LastImported = time.Now().UTC().Format(time.RFC3339)
	r.Item.Notice = strings.TrimSpace(r.Item.Notice)
	return r, nil
}

func remapAccounts(r *record, accounts []*plaid.AccountBase) {
	previous := map[string]string{}
	for id, persistent := range r.PersistentIDs {
		if persistent != "" {
			previous[persistent] = id
		}
	}
	oldAccounts := r.Item.Accounts
	r.Item.Accounts = []Account{}
	r.PersistentIDs = map[string]string{}
	for _, a := range accounts {
		if a == nil {
			continue
		}
		persistent := text(a.PersistentAccountID, "")
		oldID := previous[persistent]
		if persistent == "" || oldID == "" {
			// Fallback only when mask/type/subtype identify ONE old and ONE new
			// account. Never merge ambiguous accounts sharing their final digits.
			matches, newMatches := []string{}, 0
			if text(a.Mask, "") != "" {
				for _, old := range oldAccounts {
					if old.Mask == *a.Mask && old.Type == string(a.Type) && old.Subtype == enumText(a.Subtype) {
						matches = append(matches, old.ID)
					}
				}
				for _, next := range accounts {
					if next != nil && text(next.Mask, "") == *a.Mask && next.Type == a.Type && enumText(next.Subtype) == enumText(a.Subtype) {
						newMatches++
					}
				}
			}
			if len(matches) == 1 && newMatches == 1 {
				oldID = matches[0]
			}
		}
		if oldID != "" && oldID != a.AccountID {
			for i := range r.Item.Transactions {
				if r.Item.Transactions[i].AccountID == oldID {
					r.Item.Transactions[i].AccountID = a.AccountID
				}
			}
			for i := range r.Item.Liabilities {
				if r.Item.Liabilities[i].AccountID == oldID {
					r.Item.Liabilities[i].AccountID = a.AccountID
				}
			}
			for i := range r.Item.Holdings {
				if r.Item.Holdings[i].AccountID == oldID {
					r.Item.Holdings[i].AccountID = a.AccountID
				}
			}
			for i := range r.Item.InvestmentTransactions {
				if r.Item.InvestmentTransactions[i].AccountID == oldID {
					r.Item.InvestmentTransactions[i].AccountID = a.AccountID
				}
			}
		}
		r.PersistentIDs[a.AccountID] = persistent
		n := Account{ID: a.AccountID, Name: a.Name, Mask: text(a.Mask, ""), Type: string(a.Type), Subtype: enumText(a.Subtype)}
		if a.Balances != nil {
			n.Current, n.Available, n.Limit = a.Balances.Current, a.Balances.Available, a.Balances.Limit
			n.Currency = currency(a.Balances.IsoCurrencyCode, a.Balances.UnofficialCurrencyCode)
		}
		r.Item.Accounts = append(r.Item.Accounts, n)
	}
}

func (s *Service) syncTransactions(ctx context.Context, token string, r *record) error {
	// Restart the ENTIRE pagination from the previously committed cursor on
	// mutation. Keep all pages in memory until has_more=false (TXN-002).
	for restart := 0; restart < 3; restart++ {
		cursor := r.Cursor
		added, modified := []*plaid.Transaction{}, []*plaid.Transaction{}
		removed := []string{}
		pendingRemoval := map[string]bool{}
		mutated, complete := false, false
		for page := 0; page < 1000; page++ {
			result, err := s.provider.sync(ctx, token, cursor)
			if err != nil {
				if codeIs(err, "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") {
					mutated = true
					break
				}
				return err
			}
			added = append(added, result.Added...)
			modified = append(modified, result.Modified...)
			for _, tx := range result.Removed {
				if tx != nil {
					removed = append(removed, tx.TransactionID)
				}
			}
			for _, tx := range result.Added {
				if tx != nil && tx.PendingTransactionID != nil {
					pendingRemoval[*tx.PendingTransactionID] = true
				}
			}
			for _, tx := range result.Modified {
				if tx != nil && tx.PendingTransactionID != nil {
					pendingRemoval[*tx.PendingTransactionID] = true
				}
			}
			if result.HasMore && result.NextCursor == cursor {
				return errors.New("Transaction import did not advance. Existing data was kept; try importing again.")
			}
			cursor = result.NextCursor
			if !result.HasMore {
				complete = true
				if strings.Contains(string(result.TransactionsUpdateStatus), "NOT_READY") || (cursor == "" && len(added) == 0) {
					r.Item.Notice += "The bank is preparing transaction history. Import updates again in a few minutes. "
				}
				break
			}
		}
		if mutated {
			continue
		}
		if !complete {
			return errors.New("Transaction import exceeded its page limit. Existing data was kept; try importing again.")
		}
		transactions := map[string]Transaction{}
		for _, t := range r.Item.Transactions {
			transactions[t.ID] = t
		}
		for _, t := range append(added, modified...) {
			if t != nil {
				normalized := normalizeTransaction(t)
				previous, exists := transactions[t.TransactionID]
				if !exists && t.PendingTransactionID != nil {
					previous = transactions[*t.PendingTransactionID]
				}
				normalized.BudgetCategoryID = previous.BudgetCategoryID
				normalized.ExcludeFromBudget = previous.ExcludeFromBudget
				transactions[t.TransactionID] = normalized
			}
		}
		for _, id := range removed {
			delete(transactions, id)
		}
		for id := range pendingRemoval {
			delete(transactions, id)
		}
		r.Item.Transactions = []Transaction{}
		for _, t := range transactions {
			r.Item.Transactions = append(r.Item.Transactions, t)
		}
		sort.Slice(r.Item.Transactions, func(i, j int) bool {
			a, b := r.Item.Transactions[i], r.Item.Transactions[j]
			if a.Date == b.Date {
				return a.ID < b.ID
			}
			return a.Date > b.Date
		})
		r.Cursor = cursor
		return nil
	}
	return errors.New("The bank changed transactions during import. Existing data was kept; import updates again.")
}

func normalizeTransaction(t *plaid.Transaction) Transaction {
	category := ""
	if t.PersonalFinanceCategory != nil {
		category = t.PersonalFinanceCategory.Detailed
	}
	return Transaction{ID: t.TransactionID, AccountID: t.AccountID, Date: t.Date.Format("2006-01-02"), Description: text(t.MerchantName, text(t.OriginalDescription, t.Name)), Currency: currency(t.IsoCurrencyCode, t.UnofficialCurrencyCode), Category: category, Amount: -t.Amount, Pending: t.Pending}
}

func normalizeHoldings(result *plaid.InvestmentsHoldingsGetResponse) []Holding {
	securities := map[string]*plaid.Security{}
	for _, s := range result.Securities {
		if s != nil {
			securities[s.SecurityID] = s
		}
	}
	out := []Holding{}
	for _, h := range result.Holdings {
		if h == nil {
			continue
		}
		row := Holding{AccountID: h.AccountID, SecurityID: h.SecurityID, Name: "Unknown security", Quantity: h.Quantity, Value: h.InstitutionValue, Currency: currency(h.IsoCurrencyCode, h.UnofficialCurrencyCode)}
		if sec := securities[h.SecurityID]; sec != nil {
			row.Name = text(sec.Name, row.Name)
			row.Ticker = text(sec.TickerSymbol, "")
		}
		out = append(out, row)
	}
	return out
}

func (s *Service) investmentActivity(ctx context.Context, token string) ([]InvestmentTransaction, error) {
	end := time.Now().UTC()
	start := end.AddDate(0, 0, -90)
	out := []InvestmentTransaction{}
	seen := map[string]bool{}
	for offset := 0; offset < 500000; {
		result, err := s.provider.investmentTransactions(ctx, token, start, end, offset)
		if err != nil {
			return nil, err
		}
		for _, t := range result.InvestmentTransactions {
			if t == nil || seen[t.InvestmentTransactionID] {
				continue
			}
			seen[t.InvestmentTransactionID] = true
			out = append(out, InvestmentTransaction{ID: t.InvestmentTransactionID, AccountID: t.AccountID, Date: t.Date.Format("2006-01-02"), Description: t.Name, Type: string(t.Type) + " / " + string(t.Subtype), Currency: currency(t.IsoCurrencyCode, t.UnofficialCurrencyCode), Amount: t.Amount, Quantity: t.Quantity})
		}
		offset += len(result.InvestmentTransactions)
		if offset >= result.TotalInvestmentTransactions {
			return out, nil
		}
		if len(result.InvestmentTransactions) == 0 {
			return nil, errors.New("Investment activity pagination stopped early. Try importing again.")
		}
	}
	return nil, errors.New("Investment activity exceeded its page limit. Try importing again.")
}

func (s *Service) Disconnect(ctx context.Context, itemID string) (View, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	unlock, err := s.vault.lock(ctx)
	if err != nil {
		return View{}, err
	}
	defer unlock()
	if err := s.ready(); err != nil {
		return View{}, err
	}
	state, err := s.vault.load()
	if err != nil {
		return View{}, err
	}
	for i := range state.Items {
		r := &state.Items[i]
		if r.Item.ID != itemID {
			continue
		}
		if !r.Revoked {
			token, err := s.vault.token(itemID)
			if err != nil {
				return View{}, err
			}
			if err = s.provider.remove(ctx, token); err != nil && !codeIs(err, "INVALID_ACCESS_TOKEN", "ITEM_NOT_FOUND") {
				return View{}, err
			}
			r.Revoked = true
			r.Item.Status = "revoked"
			r.Item.Notice = "Access revoked. Choose Disconnect again if local cleanup did not finish."
			if err = s.vault.save(state); err != nil {
				return View{}, err
			}
		}
		if err = s.vault.deleteToken(itemID); err != nil {
			return View{}, err
		}
		if len(r.Item.Transactions) > 0 {
			archive := emptyItem(r.Item.ID, r.Item.Institution)
			archive.Status = "disconnected"
			archive.Transactions = r.Item.Transactions
			archive.Accounts = append([]Account(nil), r.Item.Accounts...)
			for j := range archive.Accounts {
				archive.Accounts[j].Current = nil
				archive.Accounts[j].Available = nil
				archive.Accounts[j].Limit = nil
			}
			state.ArchivedItems = append(state.ArchivedItems, archive)
			state.Version = 2
		}
		state.Items = append(state.Items[:i], state.Items[i+1:]...)
		if state.Session != nil && state.Session.ItemID == itemID {
			state.Session = nil
		}
		if err = s.vault.save(state); err != nil {
			return View{}, err
		}
		return s.view(state), nil
	}
	return View{}, errors.New("This connection was already removed. Reload the Accounts page.")
}

func text(value *string, fallback string) string {
	if value != nil && *value != "" {
		return *value
	}
	return fallback
}
func enumText[T ~string](value *T) string {
	if value != nil {
		return string(*value)
	}
	return ""
}
func currency(iso, unofficial *string) string { return text(iso, text(unofficial, "")) }

func (s *Service) discardPending(state *snapshot) error {
	if state.Session != nil && state.Session.NewItemID != "" {
		id := state.Session.NewItemID
		if _, err := s.vault.connection(id); !errors.Is(err, keyring.ErrNotFound) {
			if err != nil {
				return errStorage
			}
			return errors.New("Bank sign-in already created a connection. Finish connecting before starting again.")
		}
		state.Items = removePlaceholder(state.Items, id)
	}
	state.Session = nil
	return s.vault.save(*state)
}
