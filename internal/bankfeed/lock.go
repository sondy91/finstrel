package bankfeed

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"time"
)

var errBusy = errors.New("Bank data is in use by another Finstrel session. Try again shortly.")

// lock serializes each complete vault read-modify-write across app processes.
// Lock the separate stable file: the encrypted snapshot is replaced on save.
func (v *vault) lock(ctx context.Context) (func(), error) {
	dir := filepath.Dir(v.path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, errStorage
	}
	f, err := os.OpenFile(filepath.Join(dir, ".feed.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, errStorage
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	for {
		ok, err := tryLockFile(f)
		if err != nil {
			f.Close()
			return nil, errStorage
		}
		if ok {
			return func() { _ = unlockFile(f); _ = f.Close() }, nil
		}
		select {
		case <-ctx.Done():
			f.Close()
			return nil, errBusy
		case <-time.After(50 * time.Millisecond):
		}
	}
}
