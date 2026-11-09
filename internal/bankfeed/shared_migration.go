package bankfeed

import (
	"context"
	"crypto/rand"
	"errors"
	"os"
	"path/filepath"

	"finstrel/internal/household"

	"github.com/zalando/go-keyring"
)

// stageSharedVault creates an inactive copy in a new directory at its final
// path. It does not switch the app, remove source credentials, or establish
// cross-user access. The caller must keep writes to the source stopped until
// activation; the bank lock only protects the copy itself.
func (s *Service) stageSharedVault(ctx context.Context, dir string, passphrase []byte) error {
	if len(passphrase) == 0 || dir == "" {
		return errStorage
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.vault.shared {
		return errStorage
	}
	unlock, err := s.vault.lock(ctx)
	if err != nil {
		return err
	}
	defer unlock()
	state, err := s.vault.load()
	if err != nil {
		return err
	}
	if state.Session != nil {
		return errors.New("Finish or cancel the bank connection before sharing the household.")
	}
	// Read every live credential before creating the destination. Revoked
	// connections may already have had their credential removed.
	connections := make(map[string]connectionCredential, len(state.Items))
	seen := make(map[string]bool, len(state.Items))
	for _, item := range state.Items {
		id := item.Item.ID
		if id == "" || seen[id] {
			return errStorage
		}
		seen[id] = true
		credential, err := s.vault.connection(id)
		if item.Revoked && errors.Is(err, keyring.ErrNotFound) {
			continue
		}
		if err != nil {
			return errStorage
		}
		connections[id] = credential
	}
	key := make([]byte, 32)
	defer clear(key)
	if _, err = rand.Read(key); err != nil {
		return errStorage
	}
	envelope, err := household.WrapKey(passphrase, key)
	if err != nil {
		return errStorage
	}
	// Never replace an existing, potentially incomplete migration.
	if err = os.Mkdir(dir, 0700); err != nil {
		return errStorage
	}
	target := newVault(dir, s.environment, nil)
	target.shared = true
	store, err := newSharedCredentials(filepath.Join(dir, "credentials.enc"), target.namespace, key)
	if err != nil {
		return errStorage
	}
	target.credentials = store
	if err = store.create(); err != nil {
		return err
	}
	for id, credential := range connections {
		if err = target.putConnection(id, credential); err != nil {
			return err
		}
	}
	if err = target.save(state); err != nil {
		return err
	}
	// Verify the copy with a fresh vault and the supplied passphrase.
	unwrapped, err := household.UnwrapKey(passphrase, envelope)
	if err != nil {
		return errStorage
	}
	defer clear(unwrapped)
	verify := newVault(dir, s.environment, nil)
	verify.shared = true
	verify.credentials, err = newSharedCredentials(store.path, verify.namespace, unwrapped)
	if err != nil {
		return errStorage
	}
	if _, err = verify.load(); err != nil {
		return errStorage
	}
	for id, expected := range connections {
		actual, err := verify.connection(id)
		if err != nil || actual != expected {
			return errStorage
		}
	}
	if err = ctx.Err(); err != nil {
		return err
	}
	// Publish the complete envelope last. Its absence identifies an incomplete stage.
	f, err := os.CreateTemp(dir, ".household-key-*")
	if err != nil {
		return errStorage
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(envelope); err == nil {
		err = f.Sync()
	}
	if closeErr := f.Close(); err != nil || closeErr != nil {
		return errStorage
	}
	if err = os.Link(f.Name(), filepath.Join(dir, "household.key")); err != nil {
		return errStorage
	}
	return nil
}
