package bankfeed

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"finstrel/internal/household"

	"github.com/stretchr/testify/require"
	"github.com/zalando/go-keyring"
)

func TestSharedCredentialsEncryptAndFailClosed(t *testing.T) {
	dir := t.TempDir()
	key := bytes.Repeat([]byte{7}, 32)
	path := filepath.Join(dir, "credentials.enc")
	store, err := newSharedCredentials(path, "household-sandbox", key)
	require.NoError(t, err)
	_, err = store.Get("household-sandbox", "master")
	require.ErrorIs(t, err, errStorage)
	require.NoError(t, store.create())
	require.Error(t, store.create())
	require.NoError(t, store.Set("household-sandbox", "item:one", "fictional-token"))
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	require.NotContains(t, data, []byte("fictional-token"))
	second, err := newSharedCredentials(path, "household-sandbox", key)
	require.NoError(t, err)
	token, err := second.Get("household-sandbox", "item:one")
	require.NoError(t, err)
	require.Equal(t, "fictional-token", token)
	require.Error(t, second.Set("other-household", "item:one", "replacement"))
	wrong, err := newSharedCredentials(path, "household-sandbox", bytes.Repeat([]byte{8}, 32))
	require.NoError(t, err)
	_, err = wrong.Get("household-sandbox", "item:one")
	require.ErrorIs(t, err, errStorage)
	data[len(data)-1] ^= 1
	require.NoError(t, os.WriteFile(path, data, 0600))
	require.ErrorIs(t, second.Set("household-sandbox", "item:two", "other"), errStorage)
	require.NoError(t, os.Remove(path))
	require.ErrorIs(t, second.Set("household-sandbox", "item:two", "other"), errStorage)
	_, err = os.Stat(path)
	require.ErrorIs(t, err, os.ErrNotExist)
}

func TestSharedCredentialsDeleteAndVaultAccess(t *testing.T) {
	dir := t.TempDir()
	key := bytes.Repeat([]byte{9}, 32)
	wrapped, err := household.WrapKey([]byte("fictional shared passphrase"), key)
	require.NoError(t, err)
	v := newVault(dir, "sandbox", nil)
	v.shared = true
	store, err := newSharedCredentials(filepath.Join(dir, "credentials.enc"), v.namespace, key)
	require.NoError(t, err)
	require.NoError(t, store.create())
	v.credentials = store
	item := emptyItem("bank", "Example")
	item.Transactions = []Transaction{{ID: "tx", Currency: "USD"}}
	require.NoError(t, v.save(snapshot{Version: 1, Items: []record{{Item: item}}}))
	require.NoError(t, v.putConnection("bank", connectionCredential{Token: "fictional-bank-token", ProviderID: "provider"}))
	read, err := v.connection("bank")
	require.NoError(t, err)
	require.Equal(t, "fictional-bank-token", read.Token)
	// A second unlocked session can use the same encrypted snapshot and credentials.
	v2 := newVault(dir, "sandbox", nil)
	v2.shared = true
	unlocked, err := household.UnwrapKey([]byte("fictional shared passphrase"), wrapped)
	require.NoError(t, err)
	second, err := newSharedCredentials(store.path, v2.namespace, unlocked)
	require.NoError(t, err)
	v2.credentials = second
	// An older reader must reject the shared snapshot even when it has the key.
	legacy := newVault(dir, "sandbox", second)
	_, err = legacy.load()
	require.ErrorIs(t, err, errStorage)
	require.ErrorIs(t, legacy.save(snapshot{Version: 3}), errStorage)
	view, err := (&Service{vault: v2}).View()
	require.NoError(t, err)
	require.Len(t, view.Items, 1)
	firstService := &Service{vault: v}
	secondService := &Service{vault: v2}
	start := make(chan struct{})
	results := make(chan error, 2)
	go func() { <-start; _, e := firstService.SetTransactionCategory("bank", "tx", 7); results <- e }()
	go func() { <-start; _, e := secondService.SetTransactionExcluded("bank", "tx", true); results <- e }()
	close(start)
	require.NoError(t, <-results)
	require.NoError(t, <-results)
	view, err = secondService.View()
	require.NoError(t, err)
	require.Equal(t, int64(7), view.Items[0].Transactions[0].BudgetCategoryID)
	require.True(t, view.Items[0].Transactions[0].ExcludeFromBudget)
	read, err = v2.connection("bank")
	require.NoError(t, err)
	require.Equal(t, "fictional-bank-token", read.Token)
	require.NoError(t, v2.deleteToken("bank"))
	_, err = v.connection("bank")
	require.ErrorIs(t, err, keyring.ErrNotFound)
}

func TestSharedVaultRejectsLegacySnapshot(t *testing.T) {
	dir := t.TempDir()
	key := bytes.Repeat([]byte{5}, 32)
	legacy := newVault(dir, "sandbox", nil)
	store, err := newSharedCredentials(filepath.Join(dir, "credentials.enc"), legacy.namespace, key)
	require.NoError(t, err)
	require.NoError(t, store.create())
	legacy.credentials = store
	require.NoError(t, legacy.save(snapshot{Version: 2}))
	shared := newVault(dir, "sandbox", store)
	shared.shared = true
	_, err = shared.load()
	require.ErrorIs(t, err, errStorage)
}
