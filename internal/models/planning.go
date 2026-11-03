package models

import "finstrel/internal/schedule"

type IncomeSchedule struct {
	ID       int64         `json:"id"`
	Name     string        `json:"name"`
	Amount   float64       `json:"amount"`
	Active   bool          `json:"active"`
	Schedule schedule.Rule `json:"schedule"`
}

type CalendarEvent struct {
	Date     string  `json:"date"`
	Kind     string  `json:"kind"`
	SourceID int64   `json:"sourceId"`
	Name     string  `json:"name"`
	Amount   float64 `json:"amount"`
}

type BudgetWindow struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

type BudgetReview struct {
	SpentByCategory     map[int64]float64   `json:"spentByCategory"`
	UncategorizedCount  int                 `json:"uncategorizedCount"`
	ManualCount         int                 `json:"manualCount"`
	ManualPending       int                 `json:"manualPending"`
	ManualExpenses      float64             `json:"manualExpenses"`
	PlannedExpenses     float64             `json:"plannedExpenses"`
	ImportedCount       int                 `json:"importedCount"`
	ImportedPending     int                 `json:"importedPending"`
	ImportedExpensesUSD float64             `json:"importedExpensesUSD"`
	Environment         string              `json:"environment"`
	BankNotice          string              `json:"bankNotice"`
	Imported            []ReviewTransaction `json:"imported"`
}
type ReviewTransaction struct {
	Date        string  `json:"date"`
	Institution string  `json:"institution"`
	Description string  `json:"description"`
	Category    string  `json:"category"`
	Currency    string  `json:"currency"`
	Amount      float64 `json:"amount"`
	Pending     bool    `json:"pending"`
}
