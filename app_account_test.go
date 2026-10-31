package main

import (
	"os"
	"testing"

	"finstrel/internal/database"

	"github.com/stretchr/testify/require"
)

func setupTempDBAppForAccount(t *testing.T) func() {
	t.Helper()
	tmpDir, err := os.MkdirTemp("", "vm-app-account-test-*")
	require.NoError(t, err)
	prevDir, err := os.Getwd()
	require.NoError(t, err)
	require.NoError(t, os.Chdir(tmpDir))
	require.NoError(t, database.InitDB())
	return func() {
		database.CloseDB()
		_ = os.Chdir(prevDir)
		_ = os.RemoveAll(tmpDir)
	}
}

func TestApp_DeleteAccount(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()

	app := NewApp()

	// Create an account
	acc, err := app.AddAccount("Test Account", "Checking", 1000)
	require.NoError(t, err)
	require.NotZero(t, acc.ID)

	// Verify it exists
	accounts, err := app.GetAccounts()
	require.NoError(t, err)
	require.Len(t, accounts, 1)

	// Delete it
	err = app.DeleteAccount(acc.ID)
	require.NoError(t, err)

	// Verify it's gone
	accounts, err = app.GetAccounts()
	require.NoError(t, err)
	require.Len(t, accounts, 0)
}

func TestApp_DeleteAccount_Cascading(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()

	app := NewApp()

	// Create account
	acc, err := app.AddAccount("Test Account", "Checking", 1000)
	require.NoError(t, err)

	// Create category
	cat, err := app.AddCategory("Test Cat", "Expense", nil)
	require.NoError(t, err)

	// Add transaction
	// Note: AddTransaction expects date string in RFC3339 or YYYY-MM-DD
	_, err = app.AddTransaction("2023-01-01", -50, "Expense", "Test Tx", cat.ID, acc.ID, "", "Cleared")
	require.NoError(t, err)

	// Verify transaction exists
	txs, err := app.GetTransactions()
	require.NoError(t, err)
	require.Len(t, txs, 1)

	// Delete account
	err = app.DeleteAccount(acc.ID)
	require.NoError(t, err)

	// Verify transaction is gone (cascading delete)
	txs, err = app.GetTransactions()
	require.NoError(t, err)
	require.Len(t, txs, 0)
}
