package bankfeed

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"github.com/zalando/go-keyring"
)

// Credentials and the encryption key live in the OS credential store, never in
// the ledger, the feed file, or a Wails response. No plaintext fallback exists.
type credentials interface {
	Get(string, string) (string, error)
	Set(string, string, string) error
	Delete(string, string) error
}

type systemCredentials struct{}

func (systemCredentials) Get(s, u string) (string, error) { return keyring.Get(s, u) }
func (systemCredentials) Set(s, u, p string) error        { return keyring.Set(s, u, p) }
func (systemCredentials) Delete(s, u string) error        { return keyring.Delete(s, u) }

var errStorage = errors.New("Bank data could not be unlocked or saved. Check access to your system credential store and try again; existing data was kept.")

type vault struct {
	path, namespace string
	credentials     credentials
	key             []byte
}

func newVault(dir, environment string, secrets credentials) *vault {
	abs, _ := filepath.Abs(dir)
	scope := sha256.Sum256([]byte(abs + ":" + environment))
	return &vault{path: filepath.Join(dir, "feed.enc"), namespace: "vestramaximus.plaid." + hex.EncodeToString(scope[:12]), credentials: secrets}
}

func (v *vault) cipher(create bool) (cipher.AEAD, error) {
	if v.key == nil {
		encoded, err := v.credentials.Get(v.namespace, "master")
		if errors.Is(err, keyring.ErrNotFound) && create {
			v.key = make([]byte, 32)
			if _, err = rand.Read(v.key); err != nil {
				v.key = nil
				return nil, errStorage
			}
			if err = v.credentials.Set(v.namespace, "master", base64.StdEncoding.EncodeToString(v.key)); err != nil {
				v.key = nil
				return nil, errStorage
			}
		} else if err != nil {
			return nil, errStorage
		} else {
			v.key, err = base64.StdEncoding.DecodeString(encoded)
			if err != nil || len(v.key) != 32 {
				v.key = nil
				return nil, errStorage
			}
		}
	}
	block, err := aes.NewCipher(v.key)
	if err != nil {
		return nil, errStorage
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, errStorage
	}
	return aead, nil
}

func (v *vault) load() (snapshot, error) {
	state := snapshot{Version: 1, Items: []record{}}
	data, err := os.ReadFile(v.path)
	if errors.Is(err, os.ErrNotExist) {
		return state, nil
	}
	if err != nil {
		return state, errStorage
	}
	aead, err := v.cipher(false)
	if err != nil {
		return state, err
	}
	if len(data) < 4+aead.NonceSize() || string(data[:4]) != "VBF1" {
		return state, errStorage
	}
	plain, err := aead.Open(nil, data[4:4+aead.NonceSize()], data[4+aead.NonceSize():], []byte(v.namespace))
	if err != nil || json.Unmarshal(plain, &state) != nil || state.Version != 1 {
		return snapshot{}, errStorage
	}
	return state, nil
}

func (v *vault) save(state snapshot) error {
	_, err := os.Stat(v.path)
	aead, err := v.cipher(errors.Is(err, os.ErrNotExist))
	if err != nil {
		return err
	}
	plain, err := json.Marshal(state)
	if err != nil {
		return errStorage
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return errStorage
	}
	data := append([]byte("VBF1"), nonce...)
	data = aead.Seal(data, nonce, plain, []byte(v.namespace))
	dir := filepath.Dir(v.path)
	if err = os.MkdirAll(dir, 0700); err != nil {
		return errStorage
	}
	if err = os.Chmod(dir, 0700); err != nil {
		return errStorage
	}
	f, err := os.CreateTemp(dir, ".feed-*.enc")
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
	if err = os.Rename(name, v.path); err != nil {
		return errStorage
	}
	if d, err := os.Open(dir); err == nil {
		_ = d.Sync()
		_ = d.Close()
	}
	return nil
}

func (v *vault) token(id string) (string, error) {
	connection, err := v.connection(id)
	if err != nil {
		return "", errStorage
	}
	return connection.Token, nil
}

type connectionCredential struct {
	Token      string `json:"token"`
	ProviderID string `json:"providerId"`
}

func (v *vault) connection(id string) (connectionCredential, error) {
	encoded, err := v.credentials.Get(v.namespace, "item:"+id)
	var value connectionCredential
	if errors.Is(err, keyring.ErrNotFound) {
		return value, keyring.ErrNotFound
	}
	if err != nil || json.Unmarshal([]byte(encoded), &value) != nil || value.Token == "" {
		return value, errStorage
	}
	return value, nil
}

func (v *vault) putToken(id, token string) error {
	return v.putConnection(id, connectionCredential{Token: token})
}

func (v *vault) putConnection(id string, value connectionCredential) error {
	encoded, err := json.Marshal(value)
	if err != nil || v.credentials.Set(v.namespace, "item:"+id, string(encoded)) != nil {
		return errStorage
	}
	return nil
}

func (v *vault) deleteToken(id string) error {
	err := v.credentials.Delete(v.namespace, "item:"+id)
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return errStorage
	}
	return nil
}
