// Package household provides building blocks for local household enrollment.
package household

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"io"

	"golang.org/x/crypto/argon2"
)

// The format fixes Argon2id parameters rather than accepting untrusted costs.
// Parameters follow RFC 9106's memory-constrained recommendation.
const (
	keySize    = 32
	saltSize   = 16
	nonceSize  = 12
	headerSize = 4 + saltSize + nonceSize
	tagSize    = 16
)

var envelopeMagic = [4]byte{'F', 'H', 'K', '1'}
var errUnlock = errors.New("household key could not be unlocked")

// WrapKey protects a randomly generated 256-bit vault key using a shared
// passphrase. No bank tokens, passwords, or plaintext key are written to disk.
func WrapKey(passphrase, key []byte) ([]byte, error) {
	if len(passphrase) == 0 || len(key) != keySize {
		return nil, errUnlock
	}
	header := make([]byte, headerSize)
	copy(header, envelopeMagic[:])
	if _, err := io.ReadFull(rand.Reader, header[4:]); err != nil {
		return nil, errUnlock
	}
	aead, err := deriveCipher(passphrase, header[4:4+saltSize])
	if err != nil {
		return nil, errUnlock
	}
	return aead.Seal(header, header[4+saltSize:headerSize], key, header), nil
}

// UnwrapKey verifies the entire envelope before returning the vault key.
func UnwrapKey(passphrase, envelope []byte) ([]byte, error) {
	if len(passphrase) == 0 || len(envelope) != headerSize+keySize+tagSize {
		return nil, errUnlock
	}
	for i, value := range envelopeMagic {
		if envelope[i] != value {
			return nil, errUnlock
		}
	}
	aead, err := deriveCipher(passphrase, envelope[4:4+saltSize])
	if err != nil {
		return nil, errUnlock
	}
	key, err := aead.Open(nil, envelope[4+saltSize:headerSize], envelope[headerSize:], envelope[:headerSize])
	if err != nil || len(key) != keySize {
		return nil, errUnlock
	}
	return key, nil
}

func deriveCipher(passphrase, salt []byte) (cipher.AEAD, error) {
	derived := argon2.IDKey(passphrase, salt, 3, 64*1024, 4, keySize)
	defer func() {
		for i := range derived {
			derived[i] = 0
		}
	}()
	block, err := aes.NewCipher(derived)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
