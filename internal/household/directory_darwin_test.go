//go:build darwin

package household

import (
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCreateSharedDirectoryInheritsPermissions(t *testing.T) {
	if _, err := user.Lookup("nobody"); err != nil {
		t.Skip("no disposable nobody account available")
	}
	dir := filepath.Join(t.TempDir(), "household")
	require.NoError(t, CreateSharedDirectory(dir, "nobody"))
	info, err := os.Stat(dir)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0700), info.Mode().Perm())
	subdir := filepath.Join(dir, "bank")
	require.NoError(t, os.Mkdir(subdir, 0700))
	require.NoError(t, os.Chmod(subdir, 0700))
	file := filepath.Join(subdir, "feed.enc")
	require.NoError(t, os.WriteFile(file, []byte("fixture"), 0600))
	output, err := exec.Command("/bin/ls", "-le", file).CombinedOutput()
	require.NoError(t, err, string(output))
	require.Contains(t, strings.ToLower(string(output)), "nobody")
	require.Contains(t, string(output), "inherited")
	require.Error(t, CreateSharedDirectory(dir, "nobody"))
	contents, err := os.ReadFile(file)
	require.NoError(t, err)
	require.Equal(t, "fixture", string(contents))
}

func TestCreateSharedDirectoryRejectsInvalidAccount(t *testing.T) {
	parent := t.TempDir()
	path := filepath.Join(parent, "household")
	require.Error(t, CreateSharedDirectory(path, "nobody allow read"))
	_, err := os.Stat(path)
	require.ErrorIs(t, err, os.ErrNotExist)
}
