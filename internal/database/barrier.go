package database

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"path/filepath"
)

// WithWriteBarrier temporarily prevents other SQLite connections from writing
// the existing ledger while fn runs. It does not prevent later writes after fn
// returns and therefore does not by itself make a staged migration active.
func WithWriteBarrier(ctx context.Context, path string, fn func() error) error {
	if path == "" || fn == nil {
		return fmt.Errorf("ledger path and operation are required")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	u := &url.URL{Scheme: "file", Path: filepath.ToSlash(abs)}
	q := u.Query()
	q.Set("mode", "rw")
	q.Set("_busy_timeout", "5000")
	u.RawQuery = q.Encode()
	db, err := sql.Open("sqlite3", u.String())
	if err != nil {
		return err
	}
	defer db.Close()
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	if _, err = conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return fmt.Errorf("lock source ledger: %w", err)
	}
	defer conn.ExecContext(context.Background(), "ROLLBACK")
	var recognized int
	if err = conn.QueryRowContext(ctx, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='budget_periods'").Scan(&recognized); err != nil || recognized != 1 {
		return fmt.Errorf("source household database is not recognized")
	}
	return fn()
}
