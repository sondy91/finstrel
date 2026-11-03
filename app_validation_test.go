package main

import (
	"math"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCategoryAndEnvelopeValidation(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()
	app := NewApp()
	_, err := app.AddCategory(" ", "Expense", nil)
	require.Error(t, err)
	_, err = app.AddCategoryWithDefault("Food", "Expense", nil, math.NaN())
	require.Error(t, err)
	category, err := app.AddCategory("Food", "Expense", nil)
	require.NoError(t, err)
	_, err = app.AddCategory("Food", "Expense", nil)
	require.ErrorContains(t, err, "already exists")
	other, err := app.AddCategory("Rent", "Expense", nil)
	require.NoError(t, err)
	_, err = app.UpdateCategory(other.ID, "Food", "Expense", nil, 0)
	require.ErrorContains(t, err, "already exists")
	period, err := app.AddBudgetPeriod("Month", "2026-10-01", "2026-10-31", "Open")
	require.NoError(t, err)
	_, err = app.AddBudgetAllocation(period.ID, category.ID, 20)
	require.ErrorContains(t, err, "already has an envelope")
	_, err = app.AddBudgetAllocation(period.ID, category.ID, math.Inf(1))
	require.Error(t, err)
}

func TestTransactionRejectsInvalidSignsAndCategoryReferences(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()
	app := NewApp()
	account, err := app.AddAccount("Checking", "Checking", 100)
	require.NoError(t, err)
	category, err := app.AddCategory("Food", "Expense", nil)
	require.NoError(t, err)
	_, err = app.AddTransaction("2026-10-01", 10, "Expense", "Wrong sign", category.ID, account.ID, "", "Cleared")
	require.Error(t, err)
	_, err = app.AddTransaction("2026-10-01", math.Inf(-1), "Expense", "Invalid amount", category.ID, account.ID, "", "Cleared")
	require.Error(t, err)
	_, err = app.AddTransaction("2026-10-01", -10, "Expense", "Unknown category", 999999, account.ID, "", "Cleared")
	require.Error(t, err)
	transactions, err := app.GetTransactions()
	require.NoError(t, err)
	require.Empty(t, transactions)
}
