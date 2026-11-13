package household

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSelectionPreservesExistingChoice(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "config", "household.json")
	selection, err := ReadSelection(file)
	require.NoError(t, err)
	require.Nil(t, selection)
	householdDir := filepath.Join(dir, "shared")
	require.NoError(t, WriteSelection(file, householdDir))
	selection, err = ReadSelection(file)
	require.NoError(t, err)
	require.Equal(t, householdDir, selection.Path)
	info, err := os.Stat(file)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0600), info.Mode().Perm())
	require.Error(t, WriteSelection(file, filepath.Join(dir, "other")))
	selection, err = ReadSelection(file)
	require.NoError(t, err)
	require.Equal(t, householdDir, selection.Path)
}

func TestSelectionRejectsInvalidAndDamagedFiles(t *testing.T) {
	file := filepath.Join(t.TempDir(), "household.json")
	require.Error(t, WriteSelection(file, "relative"))
	for _, contents := range []string{`{}`, `{"version":1,"path":"relative"}`, `{"version":2,"path":"/tmp/example"}`, strings.Repeat("a", 8193)} {
		require.NoError(t, os.WriteFile(file, []byte(contents), 0600))
		_, err := ReadSelection(file)
		require.Error(t, err)
	}
}
