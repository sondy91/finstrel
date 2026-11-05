package main

import (
	"testing"
	"time"

	"finstrel/internal/bankfeed"
	"finstrel/internal/database"
	"finstrel/internal/models"
	"github.com/stretchr/testify/require"
)

func TestCarryForwardAndAuditedReconciliation(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()
	app := NewApp()
	category, err := app.AddCategoryWithDefault("Food", "Expense", nil, 100)
	require.NoError(t, err)
	period, err := app.AddBudgetPeriod("October", "2026-10-01", "2026-10-31", "Open")
	require.NoError(t, err)
	readFeeds := func() (bankfeed.View, error) {
		return bankfeed.View{Items: []bankfeed.Item{{Transactions: []bankfeed.Transaction{{Date: "2026-10-15", Currency: "USD", Amount: -30, BudgetCategoryID: category.ID}}}}}, nil
	}
	review, err := reviewBudget(period.ID, readFeeds)
	require.NoError(t, err)
	balances, err := carryBalances(period.ID, review)
	require.NoError(t, err)
	require.Equal(t, 70.0, balances[category.ID])
	next, err := database.StartNextBudget(period.ID, models.BudgetPeriod{Name: "November", StartDate: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC), EndDate: time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)}, balances)
	require.NoError(t, err)
	allocation, err := app.GetBudgetAllocation(next.ID, category.ID)
	require.NoError(t, err)
	require.Equal(t, 170.0, allocation.AllocatedAmount)
	state, err := database.GetCarryState(next.ID)
	require.NoError(t, err)
	require.Equal(t, 70.0, state.Amounts[category.ID])
	require.Error(t, app.DeleteBudgetAllocation(allocation.ID))
	_, err = database.StartNextBudget(period.ID, models.BudgetPeriod{Name: "Duplicate", StartDate: time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC), EndDate: time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)}, balances)
	require.Error(t, err)
	require.NoError(t, app.UpdateBudgetPeriodStatus(period.ID, "Open"))
	sourceAllocation, err := app.GetBudgetAllocation(period.ID, category.ID)
	require.NoError(t, err)
	_, err = app.UpdateBudgetAllocation(sourceAllocation.ID, 120)
	require.NoError(t, err)
	review, err = reviewBudget(period.ID, readFeeds)
	require.NoError(t, err)
	updated, err := carryBalances(period.ID, review)
	require.NoError(t, err)
	require.Error(t, database.ReconcileCarry(next.ID, updated))
	require.NoError(t, app.UpdateBudgetPeriodStatus(period.ID, "Closed"))
	require.NoError(t, database.ReconcileCarry(next.ID, updated))
	require.NoError(t, database.ReconcileCarry(next.ID, updated))
	allocation, err = app.GetBudgetAllocation(next.ID, category.ID)
	require.NoError(t, err)
	require.Equal(t, 190.0, allocation.AllocatedAmount)
	var entries int
	require.NoError(t, database.GetDB().QueryRow(`SELECT count(*) FROM budget_carry_entries`).Scan(&entries))
	require.Equal(t, 2, entries)
}

func TestCarryKeepsOverspendingAndRejectsIncompleteHistory(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()
	app := NewApp()
	category, err := app.AddCategoryWithDefault("Food", "Expense", nil, 20)
	require.NoError(t, err)
	period, err := app.AddBudgetPeriod("October", "2026-10-01", "2026-10-31", "Open")
	require.NoError(t, err)
	values, err := carryBalances(period.ID, models.BudgetReview{SpentByCategory: map[int64]float64{category.ID: 35}})
	require.NoError(t, err)
	require.Equal(t, -15.0, values[category.ID])
	_, err = carryBalances(period.ID, models.BudgetReview{UncategorizedCount: 1})
	require.Error(t, err)
	_, err = carryBalances(period.ID, models.BudgetReview{UnsupportedCurrencyCount: 1})
	require.Error(t, err)
}

func TestLinkedBudgetDatesCannotOverlap(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()
	app := NewApp()
	_, err := app.AddCategoryWithDefault("Food", "Expense", nil, 100)
	require.NoError(t, err)
	first, err := app.AddBudgetPeriod("October", "2026-10-01", "2026-10-31", "Open")
	require.NoError(t, err)
	next, err := database.StartNextBudget(first.ID, models.BudgetPeriod{Name: "November", StartDate: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC), EndDate: time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)}, map[int64]float64{})
	require.NoError(t, err)
	_, err = app.UpdateBudgetPeriod(first.ID, "October", "2026-10-01", "2026-11-01")
	require.ErrorContains(t, err, "overlap")
	_, err = app.UpdateBudgetPeriod(next.ID, "November", "2026-10-31", "2026-11-30")
	require.ErrorContains(t, err, "overlap")
	_, err = app.UpdateBudgetPeriod(first.ID, "October edited", "2026-10-02", "2026-10-30")
	require.NoError(t, err)
	periods, err := app.GetBudgetPeriods()
	require.NoError(t, err)
	require.Len(t, periods, 2)
	for _, p := range periods {
		if p.ID == next.ID {
			require.Equal(t, "2026-11-01", p.StartDate.Format("2006-01-02"))
		}
	}
}
