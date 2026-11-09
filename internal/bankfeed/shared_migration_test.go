package bankfeed

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"finstrel/internal/household"

	"github.com/stretchr/testify/require"
)

func TestStageSharedVaultPreservesSourceAndCredentials(t *testing.T) {
	secrets := &memoryCredentials{values: map[string]string{}}
	s := &Service{environment: "sandbox", vault: newVault(t.TempDir(), "sandbox", secrets)}
	item := emptyItem("one", "Bank")
	item.Transactions = []Transaction{{ID: "purchase", Currency: "USD"}}
	seed(t, s, record{Item: item, Cursor: "cursor"})
	before, err := os.ReadFile(s.vault.path)
	require.NoError(t, err)
	dir := filepath.Join(t.TempDir(), "shared")
	passphrase := []byte("fictional household passphrase")
	require.NoError(t, s.stageSharedVault(context.Background(), dir, passphrase))
	after, err := os.ReadFile(s.vault.path)
	require.NoError(t, err)
	require.Equal(t, before, after)
	old, err := s.vault.token("one")
	require.NoError(t, err)
	require.Equal(t, "fictional-test-credential", old)
	envelope, err := os.ReadFile(filepath.Join(dir, "household.key"))
	require.NoError(t, err)
	_, err = household.UnwrapKey([]byte("wrong"), envelope)
	require.Error(t, err)
	key, err := household.UnwrapKey(passphrase, envelope)
	require.NoError(t, err)
	v := newVault(dir, "sandbox", nil)
	v.shared = true
	v.credentials, err = newSharedCredentials(filepath.Join(dir, "credentials.enc"), v.namespace, key)
	require.NoError(t, err)
	state, err := v.load()
	require.NoError(t, err)
	require.Equal(t, 3, state.Version)
	require.Equal(t, "cursor", state.Items[0].Cursor)
	require.Equal(t, "purchase", state.Items[0].Item.Transactions[0].ID)
	token, err := v.token("one")
	require.NoError(t, err)
	require.Equal(t, old, token)
	require.Error(t, s.stageSharedVault(context.Background(), dir, passphrase))
	unchanged, err := os.ReadFile(filepath.Join(dir, "household.key"))
	require.NoError(t, err)
	require.Equal(t, envelope, unchanged)
}

func TestStageSharedVaultFailsBeforeCreatingDestination(t *testing.T) {
	secrets := &memoryCredentials{values: map[string]string{}}
	s := &Service{environment: "sandbox", vault: newVault(t.TempDir(), "sandbox", secrets)}
	seed(t, s, record{Item: emptyItem("one", "Bank")})
	dir := filepath.Join(t.TempDir(), "shared")
	require.NoError(t, s.vault.deleteToken("one"))
	require.Error(t, s.stageSharedVault(context.Background(), dir, []byte("passphrase")))
	_, err := os.Stat(dir)
	require.ErrorIs(t, err, os.ErrNotExist)
	require.NoError(t, s.vault.putToken("one", "fictional"))
	state, err := s.vault.load()
	require.NoError(t, err)
	state.Session = &linkSession{ID: "pending"}
	require.NoError(t, s.vault.save(state))
	require.ErrorContains(t, s.stageSharedVault(context.Background(), dir, []byte("passphrase")), "Finish or cancel")
	_, err = os.Stat(dir)
	require.ErrorIs(t, err, os.ErrNotExist)
}

func TestOpenSharedVaultFailsClosed(t *testing.T) {
	secrets := &memoryCredentials{values: map[string]string{}}
	s := &Service{environment: "sandbox", vault: newVault(t.TempDir(), "sandbox", secrets)}
	seed(t, s, record{Item: emptyItem("one", "Bank")})
	dir := filepath.Join(t.TempDir(), "shared")
	passphrase := []byte("fictional household passphrase")
	require.NoError(t, s.stageSharedVault(context.Background(), dir, passphrase))
	v, err := openSharedVault(dir, "sandbox", passphrase)
	require.NoError(t, err)
	token, err := v.token("one")
	require.NoError(t, err)
	require.Equal(t, "fictional-test-credential", token)
	_, err = openSharedVault(dir, "sandbox", []byte("wrong"))
	require.ErrorIs(t, err, errStorage)
	_, err = openSharedVault(dir, "production", passphrase)
	require.ErrorIs(t, err, errStorage)
	require.NoError(t, os.Remove(filepath.Join(dir, "feed.enc")))
	_, err = openSharedVault(dir, "sandbox", passphrase)
	require.ErrorIs(t, err, errStorage)
	_, err = v.load()
	require.ErrorIs(t, err, errStorage)
	_, err = os.Stat(filepath.Join(dir, "feed.enc"))
	require.ErrorIs(t, err, os.ErrNotExist)
}
