package models

import "time"
import "finstrel/internal/schedule"

// Account represents a financial account (e.g., Checking, Savings, Credit Card).
type Account struct {
	ID             int64   `json:"id"`
	Name           string  `json:"name"`
	Type           string  `json:"type"` // e.g., "Checking", "Savings", "Credit Card", "Loan", "Cash"
	InitialBalance float64 `json:"initialBalance"`
	CurrentBalance float64 `json:"currentBalance"`
	// IncludeInCashFlow controls whether this balance is available to cover day-to-day obligations.
	IncludeInCashFlow bool `json:"includeInCashFlow"`
	// Consider adding CreatedAt, UpdatedAt if needed later
}

// Bill is a recurring expected expense. It is deliberately not a transaction;
// a real transaction is only created when the expense actually occurs.
type Bill struct {
	Schedule   schedule.Rule `json:"schedule"`
	ID         int64         `json:"id"`
	Name       string        `json:"name"`
	Amount     float64       `json:"amount"`
	CategoryID int64         `json:"categoryId"`
	DueDay     int           `json:"dueDay"`
	AccountID  *int64        `json:"accountId"`
	Active     bool          `json:"active"`
}

// CashFlowSettings are intentionally independent of a BudgetPeriod.
type CashFlowSettings struct {
	NextPaycheckDate  *time.Time `json:"nextPaycheckDate"`
	DesiredCashBuffer float64    `json:"desiredCashBuffer"`
}

// CashFlowSummary answers whether available cash will cover commitments before payday.
type CashFlowSummary struct {
	CashAvailable             float64    `json:"cashAvailable"`
	IncomeBeforeNextPaycheck  float64    `json:"incomeBeforeNextPaycheck"`
	UpcomingBills             float64    `json:"upcomingBills"`
	FlexibleSpendingRemaining float64    `json:"flexibleSpendingRemaining"`
	ProjectedBalance          float64    `json:"projectedBalance"`
	DesiredCashBuffer         float64    `json:"desiredCashBuffer"`
	SafeToSpend               float64    `json:"safeToSpend"`
	NextPaycheckDate          *time.Time `json:"nextPaycheckDate"`
	Status                    string     `json:"status"`
}

// Category represents an income or expense category.
type Category struct {
	ID               int64   `json:"id"`
	Name             string  `json:"name"`             // "Groceries", "Entertainment", "Utilities", "Car Maintenance"
	Type             string  `json:"type"`             // "Income" or "Expense"
	ParentCategoryID *int64  `json:"parentCategoryId"` // Use pointer for nullable foreign key
	DefaultAmount    float64 `json:"defaultAmount"`    // Reusable planned amount for new budget periods
	// Consider adding CreatedAt, UpdatedAt if needed later
}

// Transaction represents a single financial movement.
type Transaction struct {
	ID          int64     `json:"id"`
	Date        time.Time `json:"date"`
	Amount      float64   `json:"amount"` // Positive for income, negative for expense
	Type        string    `json:"type"`   // "Income" or "Expense" - Can be derived from Amount sign, but explicit might be clearer
	Description string    `json:"description"`
	CategoryID  int64     `json:"categoryId"`
	AccountID   int64     `json:"accountId"`
	Notes       string    `json:"notes"`
	Status      string    `json:"status"` // e.g., "Cleared", "Pending"
	// Consider adding CreatedAt, UpdatedAt if needed later
}

// BudgetPeriod represents a specific instance of a budget (e.g., "June 2025 Budget").
type BudgetPeriod struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"` // e.g., "July 2024 Budget", "Q3 2024"
	StartDate time.Time `json:"startDate"`
	EndDate   time.Time `json:"endDate"`
	Status    string    `json:"status"` // e.g., "Open", "Closed", "Archived"
	// CreatedAt, UpdatedAt can be added if needed
}

// BudgetAllocation (Envelope renaming later) links a BudgetPeriod to a BudgetCategory with an allocated amount.
type BudgetAllocation struct {
	ID              int64   `json:"id"`
	CategoryID      int64   `json:"categoryId"`
	AllocatedAmount float64 `json:"allocatedAmount"`
	BudgetPeriodID  int64   `json:"budgetPeriodId"`
	// Optional: CarryoverFlag bool `json:"carryoverFlag"` (for future enhancement)
	// CreatedAt, UpdatedAt can be added if needed
}
