package database

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCreateSnapshotPreservesWALAndOriginal(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "old data #1.db")
	destination := filepath.Join(dir, "new data #2.db")
	db, err := sql.Open("sqlite3", source)
	require.NoError(t, err)
	defer db.Close()
	_, err = db.Exec("PRAGMA journal_mode=WAL")
	require.NoError(t, err)
	_, err = db.Exec("CREATE TABLE ledger (description TEXT); INSERT INTO ledger VALUES ('original')")
	require.NoError(t, err)
	require.NoError(t, CreateSnapshot(context.Background(), source, destination))
	_, err = db.Exec("INSERT INTO ledger VALUES ('later')")
	require.NoError(t, err)
	copyDB, err := sql.Open("sqlite3", destination)
	require.NoError(t, err)
	defer copyDB.Close()
	var count int
	require.NoError(t, copyDB.QueryRow("SELECT count(*) FROM ledger").Scan(&count))
	require.Equal(t, 1, count)
	require.NoError(t, db.QueryRow("SELECT count(*) FROM ledger").Scan(&count))
	require.Equal(t, 2, count)
	info, err := os.Stat(destination)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0600), info.Mode().Perm())
}

func TestCreateSnapshotNeverOverwritesOrCreatesSource(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "source.db")
	db, err := sql.Open("sqlite3", source)
	require.NoError(t, err)
	_, err = db.Exec("CREATE TABLE ledger (id INTEGER)")
	require.NoError(t, err)
	require.NoError(t, db.Close())
	destination := filepath.Join(dir, "destination.db")
	require.NoError(t, os.WriteFile(destination, []byte("existing"), 0600))
	require.Error(t, CreateSnapshot(context.Background(), source, destination))
	data, err := os.ReadFile(destination)
	require.NoError(t, err)
	require.Equal(t, "existing", string(data))
	missing := filepath.Join(dir, "missing.db")
	require.Error(t, CreateSnapshot(context.Background(), missing, filepath.Join(dir, "copy.db")))
	_, err = os.Stat(missing)
	require.ErrorIs(t, err, os.ErrNotExist)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	require.Error(t, CreateSnapshot(ctx, source, filepath.Join(dir, "canceled.db")))
	_, err = os.Stat(filepath.Join(dir, "canceled.db"))
	require.ErrorIs(t, err, os.ErrNotExist)
}
