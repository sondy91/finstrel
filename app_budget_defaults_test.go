package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestNewPeriodCopiesCategoryDefaultsAndPopulatePreservesEdits(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()
	app := NewApp()

	expense, err := app.AddCategoryWithDefault("Groceries", "Expense", nil, 500)
	require.NoError(t, err)
	income, err := app.AddCategoryWithDefault("Paycheck", "Income", nil, 2500)
	require.NoError(t, err)
	now := time.Now()
	period, err := app.AddBudgetPeriod("October", now.Format("2006-01-02"), now.AddDate(0, 0, 30).Format("2006-01-02"), "Open")
	require.NoError(t, err)

	allocations, err := app.GetBudgetAllocationsByBudgetPeriodID(period.ID)
	require.NoError(t, err)
	require.Len(t, allocations, 2)
	amounts := map[int64]float64{}
	for _, allocation := range allocations {
		amounts[allocation.CategoryID] = allocation.AllocatedAmount
	}
	require.Equal(t, 500.0, amounts[expense.ID])
	require.Equal(t, 2500.0, amounts[income.ID])

	groceriesAllocation, err := app.GetBudgetAllocation(period.ID, expense.ID)
	require.NoError(t, err)
	_, err = app.UpdateBudgetAllocation(groceriesAllocation.ID, 450)
	require.NoError(t, err)
	updatedCategory, err := app.UpdateCategory(expense.ID, "Food", "Expense", nil, 600)
	require.NoError(t, err)
	require.Equal(t, "Food", updatedCategory.Name)
	require.NoError(t, app.PopulateBudgetPeriodFromDefaults(period.ID))
	groceriesAllocation, err = app.GetBudgetAllocation(period.ID, expense.ID)
	require.NoError(t, err)
	require.Equal(t, 450.0, groceriesAllocation.AllocatedAmount, "period edits must not be overwritten")

	secondPeriod, err := app.AddBudgetPeriod("November", now.AddDate(0, 1, 0).Format("2006-01-02"), now.AddDate(0, 1, 30).Format("2006-01-02"), "Open")
	require.NoError(t, err)
	secondGroceries, err := app.GetBudgetAllocation(secondPeriod.ID, expense.ID)
	require.NoError(t, err)
	require.Equal(t, 600.0, secondGroceries.AllocatedAmount)
}
