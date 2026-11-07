# Sharing a household on one Mac

Finstrel needs to let two separate macOS login accounts use the same household without requiring cloud sync. Both people should retain their own macOS logins and see and manage the same connected banks and imported transactions; single-user households must continue to work.

## Current boundaries

- The SQLite database is named `finstrel.db` relative to the app's working directory. It is not yet in a stable shared location.
- Connected-bank snapshots are stored separately in an authenticated encrypted file under the current user's configuration directory. The encryption key and Plaid access tokens are in that user's credential store. The vault namespace depends on its absolute path.
- Bank-feed operations use a mutex within one Finstrel process. Two processes cannot safely share the encrypted snapshot by pointing them at the same file: concurrent read-modify-write operations can overwrite one another.
- Practice mode is in-memory and is not evidence that two native user accounts can share persisted data.

## Design requirements

1. Provision an explicit household directory with access restricted to the two intended macOS users. Do not rely on the default permissions of `/Users/Shared`. Verify permissions on newly created SQLite journal and temporary files as well as existing files.
2. Give the household a stable identifier and path independent of the working directory. Detect an existing local database and preserve a recoverable backup. Do not silently replace, merge, or delete either account's existing data.
3. Define and test concurrent access before allowing two app processes to write. SQLite updates need bounded busy handling and transaction boundaries; encrypted bank snapshots need a cross-process lock covering the whole read-modify-write operation, including sync and disconnect. A process-local mutex or atomic file replacement alone is insufficient.
4. Design how the second user receives access to shared bank data and authorized bank credentials. macOS login keychains are separate; moving the encrypted file alone does not share its key. Never put plaintext Plaid tokens or encryption keys in a shared folder. Both accounts must show consistent balances and transaction history, and either person must be able to manage the connections.
5. Handle macOS fast user switching, locked sessions, revoked access, backups and recovery. Stop with a clear error if access, keys, or locks are unavailable; never initialize a blank replacement household in their place.
6. Use disposable macOS accounts and synthetic data to verify allowed and denied access, simultaneous edits and imports, interrupted migration, restart, backup restoration and rollback. No existing household should be migrated until those checks pass.

## Delivery order

First establish a stable data path and a reversible migration for one user. Then build protected same-Mac enrollment and cross-process coordination. Complete bank sharing after its key and credential ownership model is settled and tested; the household feature is not complete until both users can manage the same banks. Email invitations and cross-device sharing remain separate work.
