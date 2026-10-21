package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestCashFlowSummaryUsesSpendableCashBillsAndPeriodScopedEnvelopes(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()
	app := NewApp()

	checking, err := app.AddAccount("Checking", "Checking", 1000)
	require.NoError(t, err)
	savings, err := app.AddAccount("Emergency fund", "Savings", 500)
	require.NoError(t, err)
	require.NoError(t, app.UpdateAccountCashFlowInclusion(savings.ID, false))
	groceries, err := app.AddCategory("Groceries", "Expense", nil)
	require.NoError(t, err)
	now := time.Now().UTC()
	period, err := app.AddBudgetPeriod("Current plan", now.AddDate(0, 0, -1).Format("2006-01-02"), now.AddDate(0, 0, 10).Format("2006-01-02"), "Open")
	require.NoError(t, err)
	allocation, err := app.GetBudgetAllocation(period.ID, groceries.ID)
	require.NoError(t, err)
	_, err = app.UpdateBudgetAllocation(allocation.ID, 300)
	require.NoError(t, err)
	_, err = app.AddTransaction(now.Format("2006-01-02"), -100, "Expense", "Food", groceries.ID, checking.ID, "", "Cleared")
	require.NoError(t, err)
	_, err = app.AddBill("Rent", 200, groceries.ID, now.Day(), nil, true)
	require.NoError(t, err)
	require.NoError(t, app.UpdateCashFlowSettings(now.AddDate(0, 0, 7).Format("2006-01-02"), 100))

	summary, err := app.GetCashFlowSummary()
	require.NoError(t, err)
	require.Equal(t, 900.0, summary.CashAvailable)
	require.Equal(t, 200.0, summary.UpcomingBills)
	require.Equal(t, 200.0, summary.FlexibleSpendingRemaining)
	require.Equal(t, 500.0, summary.ProjectedBalance)
	require.Equal(t, 400.0, summary.SafeToSpend)
	require.Equal(t, "On track", summary.Status)
}
