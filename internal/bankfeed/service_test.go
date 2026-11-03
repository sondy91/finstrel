package bankfeed

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	plaid "github.com/plaid/plaid-go/v49"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	plaidclient "github.com/plaid/plaid-go/v49/client"
	"github.com/plaid/plaid-go/v49/option"
	"github.com/zalando/go-keyring"
)

type memoryCredentials struct {
	values     map[string]string
	failDelete bool
}

func (m *memoryCredentials) Get(s, u string) (string, error) {
	v, ok := m.values[s+u]
	if !ok {
		return "", keyring.ErrNotFound
	}
	return v, nil
}
func (m *memoryCredentials) Set(s, u, v string) error { m.values[s+u] = v; return nil }
func (m *memoryCredentials) Delete(s, u string) error {
	if m.failDelete {
		return errors.New("locked")
	}
	delete(m.values, s+u)
	return nil
}

type handler func(string, map[string]any) (int, any)

func fixtureService(t *testing.T, handle handler, overrides ...handler) (*Service, *memoryCredentials) {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request map[string]any
		if json.NewDecoder(r.Body).Decode(&request) != nil {
			t.Error("invalid SDK JSON")
		}
		if len(overrides) > 0 {
			status, response := overrides[0](r.URL.Path, request)
			if status != 0 {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(status)
				_ = json.NewEncoder(w).Encode(response)
				return
			}
		}
		var status int
		var response any
		switch r.URL.Path {
		case "/item/get":
			status, response = 200, map[string]any{"item": map[string]any{"item_id": "fixture-provider", "institution_id": "fixture-ins", "error": nil}, "request_id": "fixture"}
		case "/institutions/get_by_id":
			if request["options"].(map[string]any)["include_optional_metadata"] != true {
				t.Error("institution metadata was not requested")
			}
			status, response = 200, map[string]any{"institution": map[string]any{"institution_id": "fixture-ins", "name": "Fixture Bank"}, "request_id": "fixture"}
		default:
			status, response = handle(r.URL.Path, request)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(response)
	}))
	t.Cleanup(server.Close)
	secrets := &memoryCredentials{values: map[string]string{}}
	s := &Service{environment: "sandbox", vault: newVault(t.TempDir(), "sandbox", secrets), openURL: func(string) error { return nil }}
	s.provider = &provider{sdk: plaidclient.NewClient(option.WithCustomEndpoint(server.URL, server.Client()), option.WithoutRetries())}
	return s, secrets
}

func seed(t *testing.T, s *Service, r record) {
	t.Helper()
	if r.Item.ID == "" {
		r.Item = emptyItem("local-item", "Fixture Bank")
	}
	if err := s.vault.putToken(r.Item.ID, "fictional-test-credential"); err != nil {
		t.Fatal(err)
	}
	if err := s.vault.save(snapshot{Version: 1, UserID: "local-user", Items: []record{r}}); err != nil {
		t.Fatal(err)
	}
}

func apiFailure(code string) (int, any) {
	return 400, map[string]any{"error_type": "ITEM_ERROR", "error_code": code, "error_message": "DO_NOT_EXPOSE_RAW_BODY", "request_id": "fixture-request"}
}
func syncPage(next string, more bool, added, modified, removed []map[string]any) map[string]any {
	return map[string]any{"next_cursor": next, "has_more": more, "added": added, "modified": modified, "removed": removed, "accounts": []any{}, "transactions_update_status": "HISTORICAL_UPDATE_COMPLETE", "request_id": "fixture-request"}
}
func tx(id string, amount float64) map[string]any {
	return map[string]any{"transaction_id": id, "account_id": "checking", "date": "2026-10-15", "amount": amount, "name": "Statement description", "merchant_name": nil, "pending": false, "iso_currency_code": "USD", "personal_finance_category": map[string]any{"primary": "FOOD_AND_DRINK", "detailed": "FOOD_AND_DRINK_GROCERIES"}}
}
func accountFixture(kind, id string) map[string]any {
	return map[string]any{"account_id": id, "name": "Fixture " + kind, "type": kind, "subtype": "checking", "mask": "1234", "persistent_account_id": "stable-" + id, "balances": map[string]any{"current": 123.45, "available": nil, "iso_currency_code": "USD"}}
}

func TestSyncRestartsWholePaginationAndReconcilesLifecycle(t *testing.T) {
	var cursors []string
	baseCalls := 0
	s, _ := fixtureService(t, func(path string, req map[string]any) (int, any) {
		if path == "/accounts/get" {
			return 200, map[string]any{"accounts": []any{accountFixture("depository", "checking")}}
		}
		if path != "/transactions/sync" {
			t.Errorf("unexpected %s", path)
			return apiFailure("UNEXPECTED")
		}
		cursor, _ := req["cursor"].(string)
		cursors = append(cursors, cursor)
		if req["count"] != float64(500) {
			t.Error("page size")
		}
		if req["options"].(map[string]any)["personal_finance_category_version"] != "v2" {
			t.Error("category version")
		}
		switch cursor {
		case "base":
			baseCalls++
			next := "first"
			id := "discarded"
			if baseCalls > 1 {
				next = "second"
				id = "posted"
			}
			row := tx(id, 12.5)
			row["pending_transaction_id"] = "pending"
			return 200, syncPage(next, true, []map[string]any{row}, nil, nil)
		case "first":
			return apiFailure("TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION")
		case "second":
			return 200, syncPage("committed", false, []map[string]any{tx("deposit", -20)}, []map[string]any{tx("changed", 9)}, []map[string]any{{"transaction_id": "removed"}})
		default:
			t.Errorf("unexpected cursor %q", cursor)
			return apiFailure("UNEXPECTED")
		}
	})
	r := record{Item: emptyItem("local-item", "Old bank name"), Cursor: "base"}
	r.Item.Transactions = []Transaction{{ID: "pending", Amount: -10, Pending: true, BudgetCategoryID: 7, ExcludeFromBudget: true}, {ID: "removed"}, {ID: "changed", Amount: -1, BudgetCategoryID: 8, ExcludeFromBudget: true}}
	seed(t, s, r)
	v, err := s.Import(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(cursors, []string{"base", "first", "base", "second"}) {
		t.Fatalf("cursor restart: %v", cursors)
	}
	state, err := s.vault.load()
	if err != nil {
		t.Fatal(err)
	}
	if v.Items[0].Institution != "Fixture Bank" {
		t.Fatal("stale Link institution name retained")
	}
	if state.Items[0].Cursor != "committed" || len(v.Items[0].Transactions) != 3 {
		t.Fatal("batch not committed correctly")
	}
	amounts := map[string]float64{}
	for _, row := range v.Items[0].Transactions {
		amounts[row.ID] = row.Amount
		if (row.ID == "posted" && row.BudgetCategoryID != 7) || (row.ID == "changed" && row.BudgetCategoryID != 8) {
			t.Fatalf("category lost during bank sync: %+v", row)
		}
		if (row.ID == "posted" || row.ID == "changed") && !row.ExcludeFromBudget {
			t.Fatalf("exclusion lost during bank sync: %+v", row)
		}
		if row.Description != "Statement description" {
			t.Error("nullable merchant fallback")
		}
	}
	if !reflect.DeepEqual(amounts, map[string]float64{"posted": -12.5, "deposit": 20, "changed": -9}) {
		t.Fatalf("lifecycle/signs: %v", amounts)
	}
}

func TestTransactionCategoryPersistsInSnapshot(t *testing.T) {
	s, _ := fixtureService(t, func(string, map[string]any) (int, any) { return 500, nil })
	r := record{Item: emptyItem("local-item", "Bank")}
	r.Item.Transactions = []Transaction{{ID: "purchase"}}
	seed(t, s, r)
	_, err := s.SetTransactionCategory("local-item", "purchase", 7)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.SetTransactionExcluded("local-item", "purchase", true)
	if err != nil {
		t.Fatal(err)
	}
	view, err := s.View()
	if err != nil || view.Items[0].Transactions[0].BudgetCategoryID != 7 || !view.Items[0].Transactions[0].ExcludeFromBudget {
		t.Fatalf("category not persisted: %+v %v", view, err)
	}
	if _, err := s.SetTransactionCategory("local-item", "missing", 7); err == nil {
		t.Fatal("missing transaction accepted")
	}
}

func TestFailedPageKeepsCommittedDataAndCursor(t *testing.T) {
	s, _ := fixtureService(t, func(path string, req map[string]any) (int, any) {
		if path == "/accounts/get" {
			return 200, map[string]any{"accounts": []any{accountFixture("depository", "checking")}}
		}
		if req["cursor"] == "base" {
			return 200, syncPage("halfway", true, []map[string]any{tx("uncommitted", 5)}, nil, nil)
		}
		return apiFailure("INSTITUTION_DOWN")
	})
	r := record{Item: emptyItem("local-item", "Fixture Bank"), Cursor: "base"}
	r.Item.Transactions = []Transaction{{ID: "kept", Amount: 42}}
	seed(t, s, r)
	v, err := s.Import(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	state, _ := s.vault.load()
	if state.Items[0].Cursor != "base" || len(v.Items[0].Transactions) != 1 || v.Items[0].Transactions[0].ID != "kept" {
		t.Fatal("partial page was persisted")
	}
	if strings.Contains(v.Items[0].Notice, "DO_NOT_EXPOSE") || v.Items[0].Status != "error" {
		t.Fatal("unsafe/missing failure state")
	}
}

func TestEncryptedSnapshotFailsClosed(t *testing.T) {
	s, secrets := fixtureService(t, func(string, map[string]any) (int, any) { t.Fatal("no network expected"); return 0, nil })
	r := record{Item: emptyItem("local-item", "PRIVATE_FINANCIAL_NAME"), Cursor: "PRIVATE_CURSOR"}
	seed(t, s, r)
	data, err := os.ReadFile(s.vault.path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte("PRIVATE_")) || bytes.Contains(data, []byte("fictional-test-credential")) {
		t.Fatal("plaintext persisted")
	}
	info, _ := os.Stat(s.vault.path)
	if info.Mode().Perm() != 0600 {
		t.Fatal("file permissions")
	}
	v, _ := s.View()
	encoded, _ := json.Marshal(v)
	if bytes.Contains(encoded, []byte("PRIVATE_CURSOR")) || bytes.Contains(encoded, []byte("fictional-test-credential")) {
		t.Fatal("private state exposed through Wails")
	}
	fresh := newVault(strings.TrimSuffix(s.vault.path, "/feed.enc"), "sandbox", secrets)
	if _, err = fresh.load(); err != nil {
		t.Fatal("encrypted restart", err)
	}
	data[len(data)-1] ^= 1
	_ = os.WriteFile(s.vault.path, data, 0600)
	if _, err = fresh.load(); err == nil {
		t.Fatal("tamper accepted")
	}
	delete(secrets.values, s.vault.namespace+"master")
	fresh.key = nil
	if _, err = fresh.load(); err == nil {
		t.Fatal("missing master key accepted")
	}
	if len(secrets.values) != 1 {
		t.Fatal("must not replace a missing master key")
	}
}

func TestHostedLinkConnectImportDuplicateReconnectAndDisconnect(t *testing.T) {
	exchanges, removes := 0, 0
	update, duplicateRun, needsLogin := false, false, false
	var linkBodies []map[string]any
	s, secrets := fixtureService(t, func(path string, req map[string]any) (int, any) {
		switch path {
		case "/link/token/create":
			linkBodies = append(linkBodies, req)
			return 200, map[string]any{"link_token": "fictional-link", "expiration": time.Now().Add(time.Hour).UTC(), "hosted_link_url": "https://secure.plaid.com/hl/fictional-test-session", "request_id": "fixture"}
		case "/link/token/get":
			if update {
				return 200, map[string]any{"link_sessions": []any{map[string]any{"finished_at": time.Now().UTC(), "on_success": map[string]any{}}}}
			}
			return 200, map[string]any{"link_sessions": []any{map[string]any{"finished_at": time.Now().UTC(), "results": map[string]any{"item_add_results": []any{map[string]any{"public_token": "fictional-public", "institution": map[string]any{"institution_id": "fixture-ins", "name": "Fixture Bank"}, "accounts": []any{map[string]any{"id": "checking", "mask": "1234", "subtype": "checking"}}}}}}}}
		case "/item/public_token/exchange":
			exchanges++
			if duplicateRun {
				t.Error("duplicate exchanged")
			}
			return 200, map[string]any{"access_token": "fictional-exchanged", "item_id": "fixture-provider-item"}
		case "/accounts/get":
			if needsLogin {
				return apiFailure("ITEM_LOGIN_REQUIRED")
			}
			return 200, map[string]any{"accounts": []any{accountFixture("depository", "checking"), accountFixture("credit", "card"), accountFixture("investment", "brokerage")}}
		case "/transactions/sync":
			return 200, syncPage("saved", false, []map[string]any{tx("expense", 10)}, nil, nil)
		case "/liabilities/get":
			return 200, map[string]any{"liabilities": map[string]any{"credit": []any{map[string]any{"account_id": "card", "minimum_payment_amount": nil, "next_payment_due_date": nil, "aprs": []any{map[string]any{"apr_percentage": 12.3, "apr_type": "purchase_apr"}, map[string]any{"apr_percentage": 20.1, "apr_type": "cash_apr"}}}}}}
		case "/investments/holdings/get":
			return 200, map[string]any{"holdings": []any{map[string]any{"account_id": "brokerage", "security_id": "security", "quantity": 1.25, "institution_value": 77.7, "iso_currency_code": "USD"}}, "securities": []any{map[string]any{"security_id": "security", "name": "Fixture Fund", "ticker_symbol": "FXT"}}}
		case "/investments/transactions/get":
			offset := req["options"].(map[string]any)["offset"].(float64)
			id := "investment-first"
			if offset > 0 {
				id = "investment-second"
			}
			return 200, map[string]any{"total_investment_transactions": 2, "investment_transactions": []any{map[string]any{"investment_transaction_id": id, "account_id": "brokerage", "date": "2026-10-15", "name": "Fixture dividend", "type": "cash", "subtype": "dividend", "amount": 2.1, "quantity": 0, "price": 0, "iso_currency_code": "USD"}}}
		case "/item/remove":
			removes++
			return 200, map[string]any{"request_id": "fixture"}
		default:
			t.Errorf("unexpected endpoint %s", path)
			return apiFailure("UNEXPECTED")
		}
	})
	ctx := context.Background()
	session, err := s.StartLink(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	if session == "" || session == "fictional-link" {
		t.Fatal("UI must receive only local session ID")
	}
	v, err := s.FinishLink(ctx, session)
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Items) != 1 || len(v.Items[0].Transactions) != 1 || len(v.Items[0].InvestmentTransactions) != 2 {
		t.Fatal("missing product results")
	}
	if v.Items[0].Holdings[0].Name != "Fixture Fund" || v.Items[0].Liabilities[0].MinimumPayment != nil || len(v.Items[0].Liabilities[0].APRs) != 2 {
		t.Fatal("holding join/debt nulls")
	}
	id := v.Items[0].ID
	if got := linkBodies[0]["products"]; !reflect.DeepEqual(got, []any{"transactions"}) {
		t.Fatalf("required products: %v", got)
	}
	if got := linkBodies[0]["additional_consented_products"]; !reflect.DeepEqual(got, []any{"liabilities", "investments"}) {
		t.Fatalf("additional products: %v", got)
	}
	v, err = s.Import(ctx)
	if err != nil || len(v.Items[0].Transactions) != 1 {
		t.Fatal("duplicate import changed count")
	}
	duplicateRun = true
	session, err = s.StartLink(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.FinishLink(ctx, session); err == nil || exchanges != 1 {
		t.Fatal("duplicate connection accepted")
	}
	needsLogin = true
	v, err = s.Import(ctx)
	if err != nil || v.Items[0].Status != "reconnect" {
		t.Fatal("missing reconnect state")
	}
	update = true
	needsLogin = false
	session, err = s.StartLink(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	last := linkBodies[len(linkBodies)-1]
	if last["access_token"] == nil || last["products"] != nil || last["transactions"] != nil {
		t.Fatal("invalid update-mode request")
	}
	v, err = s.FinishLink(ctx, session)
	if err != nil || exchanges != 1 || v.Items[0].Status != "connected" {
		t.Fatal("update must preserve token", err)
	}
	secrets.failDelete = true
	if _, err = s.Disconnect(ctx, id); err == nil {
		t.Fatal("keychain cleanup error hidden")
	}
	state, _ := s.vault.load()
	if !state.Items[0].Revoked {
		t.Fatal("revocation not persisted")
	}
	secrets.failDelete = false
	v, err = s.Disconnect(ctx, id)
	if err != nil || len(v.Items) != 0 || removes != 1 {
		t.Fatal("disconnect retry must not revoke twice", err)
	}
}

func TestPendingSessionResumesAfterRestartAndClearsCancelledSession(t *testing.T) {
	finished := false
	s, _ := fixtureService(t, func(path string, req map[string]any) (int, any) {
		if path == "/link/token/create" {
			return 200, map[string]any{"link_token": "fictional-link", "expiration": time.Now().Add(time.Hour).UTC(), "hosted_link_url": "https://secure.plaid.com/hl/fixture"}
		}
		if finished {
			return 200, map[string]any{"link_sessions": []any{map[string]any{"finished_at": time.Now().UTC(), "exit": map[string]any{}}}}
		}
		return 200, map[string]any{"link_sessions": []any{}}
	})
	session, err := s.StartLink(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if pending, err := s.FinishLink(context.Background(), session); err != nil || pending.PendingSession != session || len(pending.Items) != 0 {
		t.Fatalf("unfinished session should remain pending: %+v, %v", pending, err)
	}
	v, err := s.View()
	if err != nil || v.PendingSession != session {
		t.Fatal("session cannot resume")
	}
	finished = true
	if _, err = s.FinishLink(context.Background(), session); err == nil {
		t.Fatal("exit must be actionable")
	}
	v, _ = s.View()
	if v.PendingSession != "" {
		t.Fatal("cancelled session did not clear")
	}
}

func TestHostedURLRejectsUntrustedOrigins(t *testing.T) {
	for _, raw := range []string{"http://secure.plaid.com/hl/x", "https://secure.plaid.com.evil.test/hl/x", "https://secure.plaid.com:443/hl/x", "https://user@secure.plaid.com/hl/x", "https://evil.test/hl/x"} {
		if hostedURL(raw) {
			t.Fatalf("trusted %s", raw)
		}
	}
	if !hostedURL("https://secure.plaid.com/hl/fixture") {
		t.Fatal("valid hosted link rejected")
	}
}

func TestExchangeReceiptSurvivesSnapshotSaveFailure(t *testing.T) {
	var s *Service
	exchanges := 0
	block := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(block, []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	s, _ = fixtureService(t, func(path string, request map[string]any) (int, any) {
		switch path {
		case "/link/token/create":
			return 200, map[string]any{"link_token": "fictional-link", "expiration": time.Now().Add(time.Hour).UTC(), "hosted_link_url": "https://secure.plaid.com/hl/fixture"}
		case "/link/token/get":
			return 200, map[string]any{"link_sessions": []any{map[string]any{"results": map[string]any{"item_add_results": []any{map[string]any{"public_token": "fictional-public", "accounts": []any{}, "institution": map[string]any{"name": "Fixture"}}}}}}}
		case "/item/public_token/exchange":
			exchanges++
			s.vault.path = filepath.Join(block, "feed.enc")
			return 200, map[string]any{"access_token": "fictional-token", "item_id": "fixture-provider"}
		case "/accounts/get":
			return 200, map[string]any{"accounts": []any{accountFixture("depository", "checking")}}
		case "/transactions/sync":
			return 200, syncPage("done", false, []map[string]any{tx("recovered", 3)}, nil, nil)
		default:
			t.Errorf("unexpected endpoint %s", path)
			return apiFailure("UNEXPECTED")
		}
	})
	path := s.vault.path
	session, err := s.StartLink(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.FinishLink(context.Background(), session); err == nil {
		t.Fatal("save failure hidden")
	}
	s.vault.path = path
	v, err := s.FinishLink(context.Background(), session)
	if err != nil {
		t.Fatal(err)
	}
	if exchanges != 1 || len(v.Items) != 1 || len(v.Items[0].Transactions) != 1 || v.PendingSession != "" {
		t.Fatal("single-use exchange did not recover")
	}
}

func TestAccountRotationRemapsAllDataAndRefusesAmbiguity(t *testing.T) {
	r := record{Item: emptyItem("local", "Bank"), PersistentIDs: map[string]string{}}
	r.Item.Accounts = []Account{{ID: "old", Mask: "1234", Type: "depository", Subtype: "checking"}}
	r.Item.Transactions = []Transaction{{AccountID: "old"}}
	r.Item.Liabilities = []Liability{{AccountID: "old"}}
	r.Item.Holdings = []Holding{{AccountID: "old"}}
	r.Item.InvestmentTransactions = []InvestmentTransaction{{AccountID: "old"}}
	var account plaid.AccountBase
	encoded, _ := json.Marshal(accountFixture("depository", "new"))
	if err := json.Unmarshal(encoded, &account); err != nil {
		t.Fatal(err)
	}
	account.PersistentAccountID = nil
	remapAccounts(&r, []*plaid.AccountBase{&account})
	if r.Item.Transactions[0].AccountID != "new" || r.Item.Liabilities[0].AccountID != "new" || r.Item.Holdings[0].AccountID != "new" || r.Item.InvestmentTransactions[0].AccountID != "new" {
		t.Fatal("dependent records orphaned")
	}
	r.Item.Accounts = append(r.Item.Accounts, Account{ID: "ambiguous", Mask: "1234", Type: "depository", Subtype: "checking"})
	account.AccountID = "next"
	remapAccounts(&r, []*plaid.AccountBase{&account})
	if r.Item.Transactions[0].AccountID != "new" {
		t.Fatal("ambiguous accounts merged")
	}
}

func TestLoanAndInvestmentOnlyConnectionDoesNotRequireTransactions(t *testing.T) {
	s, _ := fixtureService(t, func(path string, req map[string]any) (int, any) {
		switch path {
		case "/accounts/get":
			return 200, map[string]any{"accounts": []any{accountFixture("loan", "loan"), accountFixture("investment", "investment")}}
		case "/liabilities/get":
			return 200, map[string]any{"liabilities": map[string]any{"loan": []any{map[string]any{"account_id": "loan", "next_payment_amount": 50, "next_payment_due_date": "2026-11-01", "interest_rate": map[string]any{"percentage": 7, "type": "fixed"}}}}}
		case "/investments/holdings/get":
			return 200, map[string]any{"holdings": []any{}, "securities": []any{}}
		case "/investments/transactions/get":
			return 200, map[string]any{"total_investment_transactions": 0, "investment_transactions": []any{}}
		default:
			t.Errorf("unneeded endpoint %s", path)
			return apiFailure("PRODUCTS_NOT_SUPPORTED")
		}
	})
	seed(t, s, record{Item: emptyItem("local", "Loan and investments")})
	v, err := s.Import(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if v.Items[0].Status != "connected" || len(v.Items[0].Accounts) != 2 || len(v.Items[0].Liabilities) != 1 {
		t.Fatal("unsupported spending blocked other data")
	}
}

func TestAbandonUnopenedSignInAndTerminalExchangeFailure(t *testing.T) {
	s, _ := fixtureService(t, func(path string, request map[string]any) (int, any) {
		switch path {
		case "/link/token/create":
			return 200, map[string]any{"link_token": "fictional-link", "expiration": time.Now().Add(time.Hour).UTC(), "hosted_link_url": "https://secure.plaid.com/hl/fixture"}
		case "/link/token/get":
			return 200, map[string]any{"link_sessions": []any{map[string]any{"results": map[string]any{"item_add_results": []any{map[string]any{"public_token": "fictional-expired", "accounts": []any{}}}}}}}
		case "/item/public_token/exchange":
			return apiFailure("INVALID_PUBLIC_TOKEN")
		default:
			t.Fatalf("unexpected endpoint %s", path)
			return 500, nil
		}
	})
	ctx := context.Background()
	session, err := s.StartLink(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	v, err := s.CancelLink(session)
	if err != nil || v.PendingSession != "" {
		t.Fatal("unopened sign-in could not be cancelled", err)
	}
	session, err = s.StartLink(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.FinishLink(ctx, session); err == nil {
		t.Fatal("expired exchange succeeded")
	}
	v, err = s.View()
	if err != nil || len(v.Items) != 0 || v.PendingSession != "" {
		t.Fatal("failed exchange left ghost connection", err)
	}
	if _, err = s.StartLink(ctx, ""); err != nil {
		t.Fatal("new connection remained blocked", err)
	}
}

func TestAuthoritativeItemErrorsPrecedeProductCalls(t *testing.T) {
	for _, code := range []string{"ITEM_LOGIN_REQUIRED", "ITEM_NOT_FOUND"} {
		t.Run(code, func(t *testing.T) {
			s, secrets := fixtureService(t, func(path string, request map[string]any) (int, any) {
				t.Errorf("product call despite Item error: %s", path)
				return 500, nil
			}, func(path string, request map[string]any) (int, any) {
				if path == "/item/get" {
					return 200, map[string]any{"item": map[string]any{"item_id": "fixture-provider", "error": map[string]any{"error_type": "ITEM_ERROR", "error_code": code, "error_message": "DO_NOT_EXPOSE_RAW_BODY"}}}
				}
				return 0, nil
			})
			seed(t, s, record{Item: emptyItem("local", "Fixture")})
			v, err := s.Import(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			expected := "reconnect"
			if code == "ITEM_NOT_FOUND" {
				expected = "revoked"
				if _, err := secrets.Get(s.vault.namespace, "item:local"); !errors.Is(err, keyring.ErrNotFound) {
					t.Fatal("revoked token retained")
				}
			}
			if v.Items[0].Status != expected || strings.Contains(v.Items[0].Notice, "DO_NOT_EXPOSE") {
				t.Fatal("unsafe or stale Item error")
			}
		})
	}
}

func TestExpiredSessionClearsPlaceholderAfterTransientExchangeFailure(t *testing.T) {
	s, _ := fixtureService(t, func(path string, request map[string]any) (int, any) {
		switch path {
		case "/link/token/create":
			return 200, map[string]any{"link_token": "fictional-link", "expiration": time.Now().Add(time.Hour).UTC(), "hosted_link_url": "https://secure.plaid.com/hl/fixture"}
		case "/link/token/get":
			return 200, map[string]any{"link_sessions": []any{map[string]any{"results": map[string]any{"item_add_results": []any{map[string]any{"public_token": "fictional-public", "accounts": []any{}}}}}}}
		case "/item/public_token/exchange":
			return apiFailure("INSTITUTION_DOWN")
		default:
			t.Errorf("unexpected endpoint %s", path)
			return 500, nil
		}
	})
	ctx := context.Background()
	session, err := s.StartLink(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.FinishLink(ctx, session); err == nil {
		t.Fatal("transient error hidden")
	}
	state, err := s.vault.load()
	if err != nil {
		t.Fatal(err)
	}
	state.Session.Expires = time.Now().Add(-7 * time.Hour)
	if err = s.vault.save(state); err != nil {
		t.Fatal(err)
	}
	if _, err = s.FinishLink(ctx, session); err == nil {
		t.Fatal("expired session accepted")
	}
	state, err = s.vault.load()
	if err != nil || state.Session != nil || len(state.Items) != 0 {
		t.Fatal("expired placeholder became a ghost", err)
	}
}

func TestRevokedCredentialIsRetainedUntilMarkerCommits(t *testing.T) {
	var s *Service
	block := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(block, []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	fail := true
	s, secrets := fixtureService(t, func(path string, request map[string]any) (int, any) {
		if path == "/item/remove" {
			return apiFailure("ITEM_NOT_FOUND")
		}
		t.Errorf("unexpected endpoint %s", path)
		return 500, nil
	}, func(path string, request map[string]any) (int, any) {
		if path == "/item/get" {
			if fail {
				s.vault.path = filepath.Join(block, "feed.enc")
			}
			return apiFailure("ITEM_NOT_FOUND")
		}
		return 0, nil
	})
	seed(t, s, record{Item: emptyItem("local", "Fixture")})
	path := s.vault.path
	if _, err := s.Import(context.Background()); err == nil {
		t.Fatal("save failure hidden")
	}
	if _, err := secrets.Get(s.vault.namespace, "item:local"); err != nil {
		t.Fatal("credential deleted before marker committed")
	}
	s.vault.path = path
	fail = false
	v, err := s.Disconnect(context.Background(), "local")
	if err != nil || len(v.Items) != 0 {
		t.Fatal("failed save made disconnect impossible", err)
	}
}

func TestReopenExpiredReconnectKeepsExistingItem(t *testing.T) {
	var linkRequest map[string]any
	s, _ := fixtureService(t, func(path string, req map[string]any) (int, any) {
		if path != "/link/token/create" {
			t.Errorf("unexpected endpoint %s", path)
			return 500, nil
		}
		linkRequest = req
		return 200, map[string]any{"link_token": "fictional-renewed-link", "expiration": time.Now().Add(time.Hour).UTC(), "hosted_link_url": "https://secure.plaid.com/hl/fixture-renewed"}
	})
	seed(t, s, record{})
	state, err := s.vault.load()
	if err != nil {
		t.Fatal(err)
	}
	state.Session = &linkSession{ID: "expired-reconnect", ItemID: "local-item", Expires: time.Now().Add(-time.Hour)}
	if err = s.vault.save(state); err != nil {
		t.Fatal(err)
	}
	// The UI's Open sign-in again action passes no Item ID after restart.
	session, err := s.StartLink(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if linkRequest["access_token"] != "fictional-test-credential" || linkRequest["products"] != nil {
		t.Fatal("expired reconnect became a new-bank Link flow")
	}
	state, err = s.vault.load()
	if err != nil || state.Session.ItemID != "local-item" || state.Session.ID != session || len(state.Items) != 1 {
		t.Fatal("renewed reconnect lost the original Item", err)
	}
}
