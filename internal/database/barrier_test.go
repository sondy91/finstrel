package database

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWriteBarrierBlocksWritersWhileSnapshotIsTaken(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "source.db")
	db, err := sql.Open("sqlite3", source+"?_busy_timeout=1")
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	_, err = db.Exec("CREATE TABLE budget_periods (value TEXT); INSERT INTO budget_periods VALUES ('before')")
	require.NoError(t, err)
	destination := filepath.Join(dir, "copy.db")
	err = WithWriteBarrier(context.Background(), source, func() error {
		_, writeErr := db.Exec("UPDATE budget_periods SET value = 'after'")
		require.ErrorContains(t, writeErr, "locked")
		return CreateSnapshot(context.Background(), source, destination)
	})
	require.NoError(t, err)
	_, err = db.Exec("UPDATE budget_periods SET value = 'after'")
	require.NoError(t, err)
	copyDB, err := sql.Open("sqlite3", destination+"?mode=ro")
	require.NoError(t, err)
	t.Cleanup(func() { _ = copyDB.Close() })
	var value string
	require.NoError(t, copyDB.QueryRow("SELECT value FROM budget_periods").Scan(&value))
	require.Equal(t, "before", value)
}

func TestWriteBarrierRejectsMissingOrUnrecognizedLedger(t *testing.T) {
	dir := t.TempDir()
	called := false
	fn := func() error { called = true; return nil }
	require.Error(t, WithWriteBarrier(context.Background(), filepath.Join(dir, "missing.db"), fn))
	path := filepath.Join(dir, "other.db")
	db, err := sql.Open("sqlite3", path)
	require.NoError(t, err)
	_, err = db.Exec("CREATE TABLE other (value TEXT)")
	require.NoError(t, err)
	require.NoError(t, db.Close())
	require.ErrorContains(t, WithWriteBarrier(context.Background(), path, fn), "not recognized")
	require.False(t, called)
}
