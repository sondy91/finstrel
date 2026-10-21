package bankfeed

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"math/rand/v2"
	"net/http"
	"regexp"
	"time"

	plaid "github.com/plaid/plaid-go/v49"
	plaidclient "github.com/plaid/plaid-go/v49/client"
	"github.com/plaid/plaid-go/v49/core"
	"github.com/plaid/plaid-go/v49/option"
)

type apiError struct {
	code, kind string
	message    string
}

func (e *apiError) Error() string { return e.message }
func codeIs(err error, codes ...string) bool {
	var e *apiError
	if !errors.As(err, &e) {
		return false
	}
	for _, code := range codes {
		if e.code == code {
			return true
		}
	}
	return false
}

var safeID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)

func sanitizeError(err error) error {
	if err == nil {
		return nil
	}
	e := &apiError{message: "Plaid could not complete the request. Try importing again later."}
	var body interface{ GetBody() *plaid.PlaidError }
	if errors.As(err, &body) && body.GetBody() != nil {
		b := body.GetBody()
		e.code, e.kind = b.ErrorCode, string(b.ErrorType)
		if b.RequestID != nil && safeID.MatchString(*b.RequestID) {
			log.Printf("Plaid request failed; request_id=%s", *b.RequestID)
		}
	}
	switch e.code {
	case "ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "ITEM_PENDING_EXPIRATION":
		e.message = "Your bank needs you to sign in again. Choose Reconnect for this connection."
	case "PRODUCT_NOT_READY":
		e.message = "The bank is preparing this data. Use Import updates again in a few minutes."
	case "NO_LIABILITY_ACCOUNTS", "NO_INVESTMENT_ACCOUNTS", "PRODUCTS_NOT_SUPPORTED", "ADDITIONAL_CONSENT_REQUIRED", "CONSENT_REQUIRED":
		e.message = "This connection does not currently provide the requested data. Reconnect to review consent or use manual tracking."
	case "INVALID_API_KEYS", "INVALID_PRODUCT", "INVALID_LINK_CUSTOMIZATION":
		e.message = "Plaid setup needs attention. Check the selected environment, product access, and Link setup in the Plaid Dashboard."
	case "INVALID_LINK_TOKEN":
		e.message = "This sign-in session expired. Start a new connection."
	case "INVALID_ACCESS_TOKEN", "ITEM_NOT_FOUND":
		e.message = "This connection is no longer available. Disconnect it, then connect again."
	}
	return e
}

// Only read/idempotent calls retry. Never retry a single-use public-token exchange.
func invoke[T any](ctx context.Context, retry bool, fn func() (T, error)) (T, error) {
	var zero T
	for attempt := 0; ; attempt++ {
		value, err := fn()
		if err == nil {
			if response, ok := any(value).(interface{ GetRequestID() plaid.RequestID }); ok {
				supportID("request_id", string(response.GetRequestID()))
			}
			return value, nil
		}
		safe := sanitizeError(err)
		var e *apiError
		var transport *core.APIError
		transient := errors.As(safe, &e) && (e.kind == "RATE_LIMIT_EXCEEDED" || e.kind == "API_ERROR" || e.code == "INSTITUTION_DOWN" || e.code == "INSTITUTION_NOT_RESPONDING")
		if errors.As(err, &transport) && transport.StatusCode >= 500 {
			transient = true
		}
		if !retry || !transient || attempt >= 2 {
			return zero, safe
		}
		delay := time.Duration(250*(1<<attempt)+rand.IntN(200)) * time.Millisecond
		select {
		case <-ctx.Done():
			return zero, sanitizeError(ctx.Err())
		case <-time.After(delay):
		}
	}
}

type provider struct{ sdk *plaidclient.Client }

func newProvider(clientID, secret, environment string) *provider {
	base := plaid.Environments.Sandbox
	if environment == "production" {
		base = plaid.Environments.Production
	}
	return &provider{sdk: plaidclient.NewClient(option.WithClientID(&clientID), option.WithSecret(secret), option.WithBaseURL(base), option.WithHTTPClient(&http.Client{Timeout: 150 * time.Second}), option.WithoutRetries())}
}

func (p *provider) createLink(ctx context.Context, userID, token string) (*plaid.LinkTokenCreateResponse, error) {
	r := &plaid.LinkTokenCreateRequest{ClientName: "Vestramaximus", Language: "en", CountryCodes: []plaid.CountryCode{plaid.CountryCodeUs}, User: &plaid.LinkTokenCreateRequestUser{ClientUserID: userID}, HostedLink: &plaid.LinkTokenCreateHostedLink{}}
	if token != "" {
		r.AccessToken = &token
	} else {
		r.Products = []plaid.Products{plaid.ProductsTransactions}
		r.AdditionalConsentedProducts = []plaid.Products{plaid.ProductsLiabilities, plaid.ProductsInvestments}
		days := 90
		r.Transactions = &plaid.LinkTokenTransactions{DaysRequested: &days}
	}
	return invoke(ctx, false, func() (*plaid.LinkTokenCreateResponse, error) { return p.sdk.Link.CreateToken(ctx, r) })
}

func (p *provider) linkResult(ctx context.Context, token string) (*plaid.LinkTokenGetResponse, error) {
	return invoke(ctx, true, func() (*plaid.LinkTokenGetResponse, error) {
		return p.sdk.Link.GetToken(ctx, &plaid.LinkTokenGetRequest{LinkToken: token})
	})
}

func (p *provider) exchange(ctx context.Context, token string) (*plaid.ItemPublicTokenExchangeResponse, error) {
	return invoke(ctx, false, func() (*plaid.ItemPublicTokenExchangeResponse, error) {
		return p.sdk.Item.ExchangePublicToken(ctx, &plaid.ItemPublicTokenExchangeRequest{PublicToken: token})
	})
}

func (p *provider) remove(ctx context.Context, token string) error {
	_, err := invoke(ctx, true, func() (*plaid.ItemRemoveResponse, error) {
		return p.sdk.Item.Remove(ctx, &plaid.ItemRemoveRequest{AccessToken: token})
	})
	return err
}

func (p *provider) accounts(ctx context.Context, token string) (*plaid.AccountsGetResponse, error) {
	return invoke(ctx, true, func() (*plaid.AccountsGetResponse, error) {
		return p.sdk.Accounts.Get(ctx, &plaid.AccountsGetRequest{AccessToken: token})
	})
}

func (p *provider) sync(ctx context.Context, token, cursor string) (*plaid.TransactionsSyncResponse, error) {
	count := 500
	request := &plaid.TransactionsSyncRequest{AccessToken: token, Count: &count, Options: &plaid.TransactionsSyncRequestOptions{PersonalFinanceCategoryVersion: plaid.PersonalFinanceCategoryVersionV2.Ptr()}}
	if cursor != "" {
		request.Cursor = &cursor
	}
	return invoke(ctx, true, func() (*plaid.TransactionsSyncResponse, error) { return p.sdk.Transactions.Sync(ctx, request) })
}

func (p *provider) liabilities(ctx context.Context, token string) (*plaid.LiabilitiesGetResponse, error) {
	return invoke(ctx, true, func() (*plaid.LiabilitiesGetResponse, error) {
		return p.sdk.Liabilities.Get(ctx, &plaid.LiabilitiesGetRequest{AccessToken: token})
	})
}

func (p *provider) holdings(ctx context.Context, token string) (*plaid.InvestmentsHoldingsGetResponse, error) {
	return invoke(ctx, true, func() (*plaid.InvestmentsHoldingsGetResponse, error) {
		return p.sdk.Investments.GetHoldings(ctx, &plaid.InvestmentsHoldingsGetRequest{AccessToken: token})
	})
}

func (p *provider) investmentTransactions(ctx context.Context, token string, start, end time.Time, offset int) (*plaid.InvestmentsTransactionsGetResponse, error) {
	count := 500
	return invoke(ctx, true, func() (*plaid.InvestmentsTransactionsGetResponse, error) {
		page, err := p.sdk.Investments.GetTransactions(ctx, &plaid.InvestmentsTransactionsGetRequest{AccessToken: token, StartDate: start, EndDate: end, Options: &plaid.InvestmentsTransactionsGetRequestOptions{Count: &count, Offset: &offset}})
		if err != nil {
			return nil, err
		}
		return page.Response, nil
	})
}

// Extract only budgeting fields from liability variants. Full SDK payloads also
// contain account numbers and addresses; those are intentionally not retained.
type liabilityWire struct {
	AccountID string   `json:"account_id"`
	Minimum   *float64 `json:"minimum_payment_amount"`
	Next      *float64 `json:"next_payment_amount"`
	Monthly   *float64 `json:"next_monthly_payment"`
	Due       string   `json:"next_payment_due_date"`
	Interest  *struct {
		Percentage *float64 `json:"percentage"`
		Type       string   `json:"type"`
	} `json:"interest_rate"`
	StudentRate *float64 `json:"interest_rate_percentage"`
	APRs        []struct {
		Percent *float64 `json:"apr_percentage"`
		Kind    string   `json:"apr_type"`
	} `json:"aprs"`
}

func normalizeLiabilities(response *plaid.LiabilitiesGetResponse) ([]Liability, error) {
	if response.Liabilities == nil {
		return []Liability{}, nil
	}
	// The SDK's String method uses its original JSON in memory. Decode it
	// without printing so a provider null cannot become a numeric zero during
	// a typed SDK marshal round-trip (some APR/rate fields are non-pointer).
	data := []byte(response.Liabilities.String())
	var groups map[string][]liabilityWire
	if json.Unmarshal(data, &groups) != nil {
		return nil, errors.New("Debt details could not be read. Try importing again.")
	}
	out := []Liability{}
	for _, kind := range []string{"credit", "mortgage", "student", "loan", "line_of_credit"} {
		for _, row := range groups[kind] {
			if row.AccountID == "" {
				continue
			}
			minimum := row.Minimum
			if minimum == nil {
				minimum = row.Next
			}
			if minimum == nil {
				minimum = row.Monthly
			}
			l := Liability{AccountID: row.AccountID, Kind: kind, MinimumPayment: minimum, NextPaymentDate: row.Due, APRs: []APR{}}
			for _, apr := range row.APRs {
				l.APRs = append(l.APRs, APR{apr.Percent, apr.Kind})
			}
			if row.Interest != nil {
				l.APRs = append(l.APRs, APR{row.Interest.Percentage, row.Interest.Type})
			}
			if row.StudentRate != nil {
				l.APRs = append(l.APRs, APR{row.StudentRate, "student loan"})
			}
			out = append(out, l)
		}
	}
	return out, nil
}

// Safe support references only; never log a provider object or err.Error().
func supportID(label, id string) {
	if safeID.MatchString(id) {
		log.Printf("Plaid %s=%s", label, id)
	}
}

type itemStatusError struct{ body *plaid.PlaidError }

func (e *itemStatusError) Error() string              { return "The bank connection needs attention." }
func (e *itemStatusError) GetBody() *plaid.PlaidError { return e.body }
func (p *provider) item(ctx context.Context, token string) (*plaid.ItemGetResponse, error) {
	return invoke(ctx, true, func() (*plaid.ItemGetResponse, error) {
		return p.sdk.Item.Get(ctx, &plaid.ItemGetRequest{AccessToken: token})
	})
}
func (p *provider) institution(ctx context.Context, id string) (*plaid.InstitutionsGetByIDResponse, error) {
	include := true
	return invoke(ctx, true, func() (*plaid.InstitutionsGetByIDResponse, error) {
		return p.sdk.Institutions.GetByID(ctx, &plaid.InstitutionsGetByIDRequest{InstitutionID: id, CountryCodes: []plaid.CountryCode{plaid.CountryCodeUs}, Options: &plaid.InstitutionsGetByIDRequestOptions{IncludeOptionalMetadata: &include}})
	})
}
