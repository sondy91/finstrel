package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestCloseAndCreateBudgetPeriodCreatesPopulatedSuccessor(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()
	app := NewApp()
	category, err := app.AddCategoryWithDefault("Groceries", "Expense", nil, 400)
	require.NoError(t, err)
	now := time.Now()
	current, err := app.AddBudgetPeriod("Current", now.Format("2006-01-02"), now.AddDate(0, 0, 14).Format("2006-01-02"), "Open")
	require.NoError(t, err)

	next, err := app.CloseAndCreateBudgetPeriod(current.ID, "Next", now.AddDate(0, 0, 15).Format("2006-01-02"), now.AddDate(0, 0, 29).Format("2006-01-02"))
	require.NoError(t, err)
	require.Equal(t, "Open", next.Status)

	periods, err := app.GetBudgetPeriods()
	require.NoError(t, err)
	var closedStatus string
	for _, period := range periods {
		if period.ID == current.ID {
			closedStatus = period.Status
		}
	}
	require.Equal(t, "Closed", closedStatus)
	allocation, err := app.GetBudgetAllocation(next.ID, category.ID)
	require.NoError(t, err)
	require.Equal(t, 400.0, allocation.AllocatedAmount)
}
