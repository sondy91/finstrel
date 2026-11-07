package database

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestInitDBAtUsesExactPathAndEnforcesForeignKeys(t *testing.T) {
	path := filepath.Join(t.TempDir(), "household #1", "finstrel ? ledger.db")
	require.NoError(t, InitDBAt(path))
	t.Cleanup(CloseDB)
	_, err := os.Stat(path)
	require.NoError(t, err)
	other := filepath.Join(t.TempDir(), "other.db")
	require.ErrorContains(t, InitDBAt(other), "close the current household")
	_, err = os.Stat(other)
	require.ErrorIs(t, err, os.ErrNotExist)
	var enabled int
	require.NoError(t, GetDB().QueryRow("PRAGMA foreign_keys").Scan(&enabled))
	require.Equal(t, 1, enabled)
	var wait int
	require.NoError(t, GetDB().QueryRow("PRAGMA busy_timeout").Scan(&wait))
	require.Equal(t, 5000, wait)
	_, err = GetDB().Exec("INSERT INTO budget_allocations(budget_period_id,category_id,allocated_amount) VALUES(999,999,0)")
	require.Error(t, err)
	_, err = GetDB().Exec("INSERT INTO categories(name,type) VALUES('Persisted','Expense')")
	require.NoError(t, err)
	CloseDB()
	require.NoError(t, OpenExistingDBAt(path))
	var name string
	require.NoError(t, GetDB().QueryRow("SELECT name FROM categories WHERE name='Persisted'").Scan(&name))
	require.Equal(t, "Persisted", name)
}
func TestInitDBAtRejectsEmptyPath(t *testing.T) {
	require.Error(t, InitDBAt("  "))
}

func TestOpenExistingDoesNotCreateOrReplaceMissingLedger(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "missing", "ledger.db")
	require.Error(t, OpenExistingDBAt(path))
	_, err := os.Stat(filepath.Dir(path))
	require.ErrorIs(t, err, os.ErrNotExist)
	blank := filepath.Join(dir, "empty.db")
	require.NoError(t, os.WriteFile(blank, nil, 0600))
	require.ErrorContains(t, OpenExistingDBAt(blank), "not recognized")
	info, err := os.Stat(blank)
	require.NoError(t, err)
	require.Zero(t, info.Size())
}
