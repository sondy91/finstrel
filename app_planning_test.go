package main

import (
	"finstrel/internal/bankfeed"
	"finstrel/internal/models"
	"finstrel/internal/schedule"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestBudgetPresetsUseInclusiveDateRanges(t *testing.T) {
	app := NewApp()
	for _, tc := range []struct{ start, cadence, end string }{{"2026-10-23", "weekly", "2026-10-29"}, {"2026-10-23", "biweekly", "2026-11-05"}, {"2024-02-16", "semimonthly", "2024-02-29"}, {"2026-02-01", "monthly", "2026-02-28"}} {
		v, err := app.PreviewBudgetWindow(tc.start, tc.cadence)
		require.NoError(t, err)
		require.Equal(t, tc.end, v.End)
	}
	_, err := app.PreviewBudgetWindow("2026-10-09", "semimonthly")
	require.Error(t, err)
}

func TestReviewIncludesCategorizedBankTransactions(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()
	app := NewApp()
	category, err := app.AddCategoryWithDefault("Food", "Expense", nil, 100)
	require.NoError(t, err)
	period, err := app.AddBudgetPeriod("January", "2020-01-01", "2020-01-31", "Open")
	require.NoError(t, err)
	review, err := reviewBudget(period.ID, func() (bankfeed.View, error) {
		return bankfeed.View{Items: []bankfeed.Item{{Transactions: []bankfeed.Transaction{
			{Date: "2020-01-20", Currency: "USD", Amount: -35, BudgetCategoryID: category.ID},
			{Date: "2020-01-21", Currency: "USD", Amount: 5, BudgetCategoryID: category.ID},
			{Date: "2020-01-22", Currency: "USD", Amount: -20},
			{Date: "2020-02-01", Currency: "USD", Amount: -100, BudgetCategoryID: category.ID},
		}}}}, nil
	})
	require.NoError(t, err)
	require.Equal(t, 30.0, review.SpentByCategory[category.ID])
	require.Equal(t, 1, review.UncategorizedCount)
}
func TestScheduledWritesRejectInvalidAmountsAndIncomeCategories(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()
	app := NewApp()
	income, err := app.AddCategory("Pay", "Income", nil)
	require.NoError(t, err)
	rule := schedule.Rule{Cadence: "weekly", AnchorDate: "2026-10-02"}
	_, err = app.SaveBillSchedule(models.Bill{Name: "Plan", Amount: 20, CategoryID: income.ID, Schedule: rule, Active: true})
	require.Error(t, err)
	_, err = app.SaveIncomeSchedule(models.IncomeSchedule{Name: "Pay", Amount: -20, Schedule: rule})
	require.Error(t, err)
}

func TestReviewScopesManualSpendingToInclusivePeriod(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()
	app := NewApp()
	account, err := app.AddAccount("Test", "Checking", 1000)
	require.NoError(t, err)
	category, err := app.AddCategoryWithDefault("Food", "Expense", nil, 100)
	require.NoError(t, err)
	period, err := app.AddBudgetPeriod("Old period", "2020-01-01", "2020-01-14", "Open")
	require.NoError(t, err)
	_, err = app.AddTransaction("2020-01-14T23:00:00Z", -25, "Expense", "Final day", category.ID, account.ID, "", "Pending")
	require.NoError(t, err)
	_, err = app.AddTransaction("2020-01-15", -30, "Expense", "Next period", category.ID, account.ID, "", "Cleared")
	require.NoError(t, err)
	review, err := reviewBudget(period.ID, func() (bankfeed.View, error) {
		return bankfeed.View{Environment: "sandbox", Items: []bankfeed.Item{}}, nil
	})
	require.NoError(t, err)
	require.Equal(t, 1, review.ManualCount)
	require.Equal(t, 1, review.ManualPending)
	require.Equal(t, float64(25), review.ManualExpenses)
	require.Equal(t, float64(100), review.PlannedExpenses)
	accounts, err := app.GetAccounts()
	require.NoError(t, err)
	require.Equal(t, float64(945), accounts[0].CurrentBalance)
}
