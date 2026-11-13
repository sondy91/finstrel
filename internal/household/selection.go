package household

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
)

// Selection stores only the shared directory location, never a passphrase.
// An absent selection is distinct from a damaged or unreadable selection.
type Selection struct {
	Version int    `json:"version"`
	Path    string `json:"path"`
}

func validSelection(s Selection) bool {
	return s.Version == 1 && filepath.IsAbs(s.Path) && filepath.Clean(s.Path) == s.Path && s.Path != string(filepath.Separator)
}

// ReadSelection returns nil if no household was selected. Invalid selection
// files fail closed, so they cannot silently open a different empty budget.
func ReadSelection(path string) (*Selection, error) {
	f, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, 8193))
	if err != nil || len(data) > 8192 {
		return nil, errors.New("household selection cannot be read")
	}
	var selection Selection
	if json.Unmarshal(data, &selection) != nil || !validSelection(selection) {
		return nil, errors.New("household selection is invalid")
	}
	return &selection, nil
}

// WriteSelection creates a selection without replacing an existing choice.
// The caller is responsible for verifying the target household first.
func WriteSelection(path, householdDir string) error {
	selection := Selection{Version: 1, Path: householdDir}
	if !filepath.IsAbs(path) || !validSelection(selection) {
		return errors.New("household selection path is invalid")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".household-selection-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	data, err := json.Marshal(selection)
	if err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Link(f.Name(), path)
}
