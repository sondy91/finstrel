package bankfeed

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/zalando/go-keyring"
)

// sharedCredentials is a staged credential backend. It must only be used while
// the vault's cross-process lock is held. It does not provision cross-user file
// permissions or activate shared households.
type sharedCredentials struct {
	path      string
	namespace string
	master    [32]byte
}

const sharedCredentialMagic = "FSC1"
const maxCredentialBytes = 4 << 20

func newSharedCredentials(path, namespace string, master []byte) (*sharedCredentials, error) {
	if path == "" || namespace == "" || len(master) != 32 {
		return nil, errStorage
	}
	s := &sharedCredentials{path: path, namespace: namespace}
	copy(s.master[:], master)
	return s, nil
}

func (s *sharedCredentials) cipher() (cipher.AEAD, error) {
	key, err := hkdf.Key(sha256.New, s.master[:], nil, "finstrel/shared-bank-credentials/v1", 32)
	if err != nil {
		return nil, errStorage
	}
	defer func() {
		for i := range key {
			key[i] = 0
		}
	}()
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, errStorage
	}
	return cipher.NewGCM(block)
}

func (s *sharedCredentials) seal(values map[string]string) ([]byte, error) {
	plain, err := json.Marshal(values)
	if err != nil || len(plain) > maxCredentialBytes {
		return nil, errStorage
	}
	defer func() {
		for i := range plain {
			plain[i] = 0
		}
	}()
	aead, err := s.cipher()
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return nil, errStorage
	}
	result := append([]byte(sharedCredentialMagic), nonce...)
	return aead.Seal(result, nonce, plain, []byte(s.namespace)), nil
}

func (s *sharedCredentials) load() (map[string]string, error) {
	f, err := os.Open(s.path)
	if err != nil {
		return nil, errStorage
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxCredentialBytes+1024))
	if err != nil || len(data) >= maxCredentialBytes+1024 {
		return nil, errStorage
	}
	aead, err := s.cipher()
	if err != nil {
		return nil, err
	}
	n := aead.NonceSize()
	if len(data) < 4+n+aead.Overhead() || string(data[:4]) != sharedCredentialMagic {
		return nil, errStorage
	}
	plain, err := aead.Open(nil, data[4:4+n], data[4+n:], []byte(s.namespace))
	if err != nil {
		return nil, errStorage
	}
	defer func() {
		for i := range plain {
			plain[i] = 0
		}
	}()
	var values map[string]string
	if json.Unmarshal(plain, &values) != nil || values == nil {
		return nil, errStorage
	}
	return values, nil
}

// create initializes only a new credential file. Existing data is never replaced.
func (s *sharedCredentials) create() error {
	data, err := s.seal(map[string]string{})
	if err != nil {
		return err
	}
	f, err := os.OpenFile(s.path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return errStorage
	}
	if _, err = f.Write(data); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil || closeErr != nil {
		return errStorage
	}
	return nil
}

func (s *sharedCredentials) save(values map[string]string) error {
	data, err := s.seal(values)
	if err != nil {
		return err
	}
	dir := filepath.Dir(s.path)
	f, err := os.CreateTemp(dir, ".credentials-*.enc")
	if err != nil {
		return errStorage
	}
	name := f.Name()
	defer os.Remove(name)
	defer f.Close()
	if err = f.Chmod(0600); err != nil {
		return errStorage
	}
	if _, err = f.Write(data); err != nil {
		return errStorage
	}
	if err = f.Sync(); err != nil {
		return errStorage
	}
	if err = f.Close(); err != nil {
		return errStorage
	}
	if err = os.Rename(name, s.path); err != nil {
		return errStorage
	}
	if d, err := os.Open(dir); err == nil {
		_ = d.Sync()
		_ = d.Close()
	}
	return nil
}

func (s *sharedCredentials) Get(namespace, name string) (string, error) {
	if namespace != s.namespace {
		return "", errStorage
	}
	values, err := s.load()
	if err != nil {
		return "", err
	}
	if name == "master" {
		return base64.StdEncoding.EncodeToString(s.master[:]), nil
	}
	value, ok := values[name]
	if !ok {
		return "", keyring.ErrNotFound
	}
	return value, nil
}

func (s *sharedCredentials) Set(namespace, name, value string) error {
	if namespace != s.namespace || !strings.HasPrefix(name, "item:") || len(name) > 512 || value == "" {
		return fmt.Errorf("invalid shared bank credential")
	}
	values, err := s.load()
	if err != nil {
		return err
	}
	values[name] = value
	return s.save(values)
}

func (s *sharedCredentials) Delete(namespace, name string) error {
	if namespace != s.namespace || !strings.HasPrefix(name, "item:") {
		return errStorage
	}
	values, err := s.load()
	if err != nil {
		return err
	}
	if _, ok := values[name]; !ok {
		return keyring.ErrNotFound
	}
	delete(values, name)
	return s.save(values)
}
