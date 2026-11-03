package bankfeed

import "time"

// View is the only data exposed through Wails. Provider tokens and sync cursors
// are deliberately absent. Imported snapshots do not mutate manual balances.
type View struct {
	Configured     bool   `json:"configured"`
	Environment    string `json:"environment"`
	PendingSession string `json:"pendingSession"`
	Items          []Item `json:"items"`
}

type Item struct {
	ID                     string                  `json:"id"`
	Institution            string                  `json:"institution"`
	Status                 string                  `json:"status"`
	LastImported           string                  `json:"lastImported"`
	Notice                 string                  `json:"notice"`
	Accounts               []Account               `json:"accounts"`
	Transactions           []Transaction           `json:"transactions"`
	Liabilities            []Liability             `json:"liabilities"`
	Holdings               []Holding               `json:"holdings"`
	InvestmentTransactions []InvestmentTransaction `json:"investmentTransactions"`
}

type Account struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Mask      string   `json:"mask"`
	Type      string   `json:"type"`
	Subtype   string   `json:"subtype"`
	Currency  string   `json:"currency"`
	Current   *float64 `json:"current"`
	Available *float64 `json:"available"`
	Limit     *float64 `json:"limit"`
}

type Transaction struct {
	ID                string  `json:"id"`
	AccountID         string  `json:"accountId"`
	Date              string  `json:"date"`
	Description       string  `json:"description"`
	Currency          string  `json:"currency"`
	Category          string  `json:"category"`
	BudgetCategoryID  int64   `json:"budgetCategoryId,omitempty"`
	ExcludeFromBudget bool    `json:"excludeFromBudget,omitempty"`
	Amount            float64 `json:"amount"` // Positive = inflow, matching the existing ledger.
	Pending           bool    `json:"pending"`
}

type APR struct {
	Percent *float64 `json:"percent"`
	Kind    string   `json:"kind"`
}
type Liability struct {
	AccountID       string   `json:"accountId"`
	Kind            string   `json:"kind"`
	MinimumPayment  *float64 `json:"minimumPayment"`
	NextPaymentDate string   `json:"nextPaymentDate"`
	APRs            []APR    `json:"aprs"`
}

type Holding struct {
	AccountID  string  `json:"accountId"`
	SecurityID string  `json:"securityId"`
	Name       string  `json:"name"`
	Ticker     string  `json:"ticker"`
	Currency   string  `json:"currency"`
	Quantity   float64 `json:"quantity"`
	Value      float64 `json:"value"`
}

type InvestmentTransaction struct {
	ID          string  `json:"id"`
	AccountID   string  `json:"accountId"`
	Date        string  `json:"date"`
	Description string  `json:"description"`
	Type        string  `json:"type"`
	Currency    string  `json:"currency"`
	Amount      float64 `json:"amount"`
	Quantity    float64 `json:"quantity"`
}

type record struct {
	LinkSessionID string            `json:"linkSessionId,omitempty"`
	Item          Item              `json:"item"`
	ProviderID    string            `json:"providerId"`
	InstitutionID string            `json:"institutionId"`
	Cursor        string            `json:"cursor"`
	PersistentIDs map[string]string `json:"persistentIds"`
	Revoked       bool              `json:"revoked"`
	RecoveryToken string            `json:"recoveryToken,omitempty"`
}

type linkSession struct {
	ID        string    `json:"id"`
	Token     string    `json:"token"`
	URL       string    `json:"url"`
	ItemID    string    `json:"itemId"`
	Expires   time.Time `json:"expires"`
	NewItemID string    `json:"newItemId,omitempty"`
}

type snapshot struct {
	Version int          `json:"version"`
	UserID  string       `json:"userId"`
	Items   []record     `json:"items"`
	Session *linkSession `json:"session,omitempty"`
}
