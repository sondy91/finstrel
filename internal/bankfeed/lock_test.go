package bankfeed

import (
	"context"
	"os"
	"os/exec"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestVaultLockAcrossProcesses(t *testing.T) {
	if dir := os.Getenv("FINSTREL_LOCK_TEST_DIR"); dir != "" {
		v := newVault(dir, "sandbox", nil)
		ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
		defer cancel()
		unlock, err := v.lock(ctx)
		if err == nil {
			unlock()
			os.Exit(2)
		}
		if err != errBusy {
			os.Exit(3)
		}
		return
	}
	dir := t.TempDir()
	v := newVault(dir, "sandbox", nil)
	unlock, err := v.lock(context.Background())
	require.NoError(t, err)
	cmd := exec.Command(os.Args[0], "-test.run=^TestVaultLockAcrossProcesses$")
	cmd.Env = append(os.Environ(), "FINSTREL_LOCK_TEST_DIR="+dir)
	output, err := cmd.CombinedOutput()
	require.NoError(t, err, string(output))
	unlock()
	second := newVault(dir, "sandbox", nil)
	next, err := second.lock(context.Background())
	require.NoError(t, err)
	next()
}

func TestConcurrentSessionsPreserveBankEdits(t *testing.T) {
	dir := t.TempDir()
	creds := &memoryCredentials{values: map[string]string{}}
	first := &Service{vault: newVault(dir, "sandbox", creds)}
	item := emptyItem("bank", "Bank")
	item.Transactions = []Transaction{{ID: "tx", Currency: "USD"}}
	require.NoError(t, first.vault.save(snapshot{Version: 1, Items: []record{{Item: item}}}))
	second := &Service{vault: newVault(dir, "sandbox", creds)}
	second.vault.key = append([]byte(nil), first.vault.key...)
	start := make(chan struct{})
	results := make(chan error, 2)
	go func() { <-start; _, err := first.SetTransactionCategory("bank", "tx", 7); results <- err }()
	go func() { <-start; _, err := second.SetTransactionExcluded("bank", "tx", true); results <- err }()
	close(start)
	require.NoError(t, <-results)
	require.NoError(t, <-results)
	view, err := first.View()
	require.NoError(t, err)
	require.Equal(t, int64(7), view.Items[0].Transactions[0].BudgetCategoryID)
	require.True(t, view.Items[0].Transactions[0].ExcludeFromBudget)
}
