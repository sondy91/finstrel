package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"time"

	sqlite3 "github.com/mattn/go-sqlite3"
)

// CreateSnapshot creates a consistent SQLite copy without modifying the source
// or replacing an existing destination. It does not activate the new copy.
func CreateSnapshot(ctx context.Context, source, destination string) error {
	src, err := filepath.Abs(source)
	if err != nil {
		return err
	}
	dst, err := filepath.Abs(destination)
	if err != nil {
		return err
	}
	if src == dst {
		return errors.New("source and destination must differ")
	}
	u := &url.URL{Scheme: "file", Path: filepath.ToSlash(src)}
	q := u.Query()
	q.Set("mode", "ro")
	q.Set("_busy_timeout", "5000")
	u.RawQuery = q.Encode()
	sourceDB, err := sql.Open("sqlite3", u.String())
	if err != nil {
		return err
	}
	defer sourceDB.Close()
	if err = sourceDB.PingContext(ctx); err != nil {
		return fmt.Errorf("open source: %w", err)
	}
	temp, err := os.CreateTemp(filepath.Dir(dst), ".finstrel-snapshot-*.db")
	if err != nil {
		return err
	}
	name := temp.Name()
	defer os.Remove(name)
	if err = temp.Chmod(0600); err != nil {
		temp.Close()
		return err
	}
	if err = temp.Close(); err != nil {
		return err
	}
	targetURL := &url.URL{Scheme: "file", Path: filepath.ToSlash(name)}
	targetDB, err := sql.Open("sqlite3", targetURL.String())
	if err != nil {
		return err
	}
	defer targetDB.Close()
	sourceConn, err := sourceDB.Conn(ctx)
	if err != nil {
		return err
	}
	defer sourceConn.Close()
	targetConn, err := targetDB.Conn(ctx)
	if err != nil {
		return err
	}
	defer targetConn.Close()
	err = sourceConn.Raw(func(sourceDriver any) error {
		return targetConn.Raw(func(targetDriver any) (result error) {
			backup, err := targetDriver.(*sqlite3.SQLiteConn).Backup("main", sourceDriver.(*sqlite3.SQLiteConn), "main")
			if err != nil {
				return err
			}
			defer func() {
				if err := backup.Finish(); result == nil && err != nil {
					result = err
				}
			}()
			for {
				if err := ctx.Err(); err != nil {
					return err
				}
				done, err := backup.Step(128)
				if err != nil {
					return err
				}
				if done {
					return nil
				}
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(10 * time.Millisecond):
				}
			}
		})
	})
	if err != nil {
		return fmt.Errorf("copy database: %w", err)
	}
	var check string
	if err = targetConn.QueryRowContext(ctx, "PRAGMA quick_check").Scan(&check); err != nil {
		return err
	}
	if check != "ok" {
		return fmt.Errorf("snapshot integrity check failed: %s", check)
	}
	if err = targetConn.Close(); err != nil {
		return err
	}
	if err = targetDB.Close(); err != nil {
		return err
	}
	f, err := os.OpenFile(name, os.O_RDWR, 0)
	if err != nil {
		return err
	}
	err = f.Sync()
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err = os.Link(name, dst); err != nil {
		return fmt.Errorf("publish snapshot: %w", err)
	}
	if d, err := os.Open(filepath.Dir(dst)); err == nil {
		_ = d.Sync()
		_ = d.Close()
	}
	return nil
}
