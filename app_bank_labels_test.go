package main

import (
	"testing"

	"finstrel/internal/bankfeed"
	"finstrel/internal/database"
	"github.com/stretchr/testify/require"
)

func TestBankAccountLabelsArePerAccountAndEditable(t *testing.T) {
	cleanup := setupTempDBAppForAccount(t)
	defer cleanup()
	app := NewApp()
	app.bankView = func() (bankfeed.View, error) {
		return bankfeed.View{Items: []bankfeed.Item{{ID: "bank", Accounts: []bankfeed.Account{{ID: "checking"}, {ID: "card"}}}}}, nil
	}
	labels, err := app.GetBankAccountLabels()
	require.NoError(t, err)
	require.Empty(t, labels)
	require.NoError(t, app.SetBankAccountLabel("bank", "checking", " Shared "))
	require.NoError(t, app.SetBankAccountLabel("bank", "card", "Alex"))
	labels, err = app.GetBankAccountLabels()
	require.NoError(t, err)
	require.Len(t, labels, 2)
	require.Equal(t, "Alex", labels[0].Label)
	require.Equal(t, "Shared", labels[1].Label)
	database.CloseDB()
	require.NoError(t, database.InitDB())
	labels, err = app.GetBankAccountLabels()
	require.NoError(t, err)
	require.Len(t, labels, 2)
	require.Equal(t, "Shared", labels[1].Label)
	require.Error(t, app.SetBankAccountLabel("bank", "missing", "Shared"))
	require.Error(t, app.SetBankAccountLabel("bank", "checking", "Bad\nlabel"))
	require.NoError(t, app.SetBankAccountLabel("bank", "checking", ""))
	labels, err = app.GetBankAccountLabels()
	require.NoError(t, err)
	require.Len(t, labels, 1)
	require.Equal(t, "card", labels[0].AccountID)
}
