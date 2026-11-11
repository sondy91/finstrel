//go:build !darwin

package household

import "errors"

// CreateSharedDirectory is only available on macOS.
func CreateSharedDirectory(path, partner string) error {
	return errors.New("shared households require macOS")
}
