//go:build darwin

package bankfeed

import (
	"context"
	"database/sql"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPrepareSharedHouseholdStagesProtectedCopies(t *testing.T) {
	if _, err := user.Lookup("nobody"); err != nil {
		t.Skip("no disposable nobody account available")
	}
	root := t.TempDir()
	secrets := &memoryCredentials{values: map[string]string{}}
	s := &Service{environment: "sandbox", vault: newVault(filepath.Join(root, "source-bank"), "sandbox", secrets)}
	seed(t, s, record{Item: emptyItem("one", "Bank")})
	source := filepath.Join(root, "source.db")
	db, err := sql.Open("sqlite3", source)
	require.NoError(t, err)
	_, err = db.Exec("CREATE TABLE budget_periods (value TEXT); INSERT INTO budget_periods VALUES ('budget')")
	require.NoError(t, err)
	require.NoError(t, db.Close())
	shared := filepath.Join(root, "shared")
	require.NoError(t, s.PrepareSharedHousehold(context.Background(), shared, "nobody", source, []byte("test passphrase")))
	for _, name := range []string{"finstrel.db", "bank/feed.enc", "bank/credentials.enc", "bank/household.key"} {
		output, err := exec.Command("/bin/ls", "-le", filepath.Join(shared, name)).CombinedOutput()
		require.NoError(t, err, string(output))
		require.Contains(t, strings.ToLower(string(output)), "nobody")
		require.Contains(t, string(output), "inherited")
	}
	_, err = openSharedVault(filepath.Join(shared, "bank"), "sandbox", []byte("test passphrase"))
	require.NoError(t, err)
	require.Error(t, s.PrepareSharedHousehold(context.Background(), shared, "nobody", source, []byte("test passphrase")))
	_, err = os.Stat(source)
	require.NoError(t, err)
}
