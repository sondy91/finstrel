//go:build darwin

package household

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"regexp"
)

var macShortName = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

// CreateSharedDirectory creates an empty private directory with inherited ACLs
// for the current user and the specified second local account. It never
// changes an existing path. A failure can leave an empty directory behind;
// callers must not populate it unless this function succeeds.
func CreateSharedDirectory(path, partner string) error {
	if !filepath.IsAbs(path) || !macShortName.MatchString(partner) {
		return errors.New("a valid absolute path and macOS account name are required")
	}
	current, err := user.Current()
	if err != nil || !macShortName.MatchString(current.Username) {
		return errors.New("current macOS account could not be identified")
	}
	other, err := user.Lookup(partner)
	if err != nil || other.Uid == current.Uid {
		return errors.New("choose a different existing macOS account")
	}
	if err = os.Mkdir(path, 0700); err != nil {
		return fmt.Errorf("create household directory: %w", err)
	}
	// The empty directory may have inherited entries from its parent. Remove
	// all of them before placing household data inside it.
	if err = exec.Command("/bin/chmod", "-N", path).Run(); err != nil {
		return errors.New("could not clear inherited household permissions")
	}
	if err = os.Chmod(path, 0700); err != nil {
		return errors.New("could not restrict household permissions")
	}
	// writesecurity is needed because vault saves chmod the shared vault
	// directory; either trusted household member can maintain the ACL.
	rights := "allow read,write,append,execute,delete,readattr,writeattr,readextattr,writeextattr,readsecurity,writesecurity,list,search,add_file,add_subdirectory,delete_child,file_inherit,directory_inherit"
	for _, name := range []string{current.Username, partner} {
		if err = exec.Command("/bin/chmod", "+a", "user:"+name+" "+rights, path).Run(); err != nil {
			return errors.New("could not grant household access")
		}
	}
	return nil
}
