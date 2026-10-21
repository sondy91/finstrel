# Plaid integration plan

## Confirmed scope and current state

Build a PFM app using the Plaid Build Kit. The wider goal is easier household budgeting, forecasting, debt reduction, and opportunity-cost comparisons using bank, card, loan, 401(k), and investment information. This implementation is the confirmed first slice: optional US Plaid connections in the existing Accounts page, a Go backend, bank sign-in in the system browser, Sandbox accounts, and manual imports. The user confirmed Transactions, Liabilities, and Investments and explicitly chose manual imports as the local testing stopgap. No payments, verification, account/routing-number collection, real-bank connections, or paid forced refreshes were requested.

Implemented code is reviewable and builds. Backend and interface regression checks pass. Real Sandbox API tests work for two different personas. Browser-to-desktop Link completion is **pending**: computer controls timed out, and on October 18 the user chose to test it later. Do not describe this as fully accepted or Production-ready.

## Design and decisions

- Link requires `transactions`; `liabilities` and `investments` are additional-consented products. This avoids requiring all three at every institution while requesting consent up front (SELECT-005, LIAB-007, INV-015, PITFALL-001). Auth, Transfer, Identity, live Balance, and forced refresh products are outside scope.
- Hosted Link runs in the system browser because the app uses a Wails webview. Only opaque local session IDs reach the app interface. Link sessions are encrypted and resumable; incomplete sign-ins can be cancelled. Public tokens are exchanged immediately in Go and are never stored (GUIDE-001/002/003/006/010/020, DATA-001/003).
- A stable local connection ID is saved before token exchange. An OS credential-store receipt lets completion recover after a failed snapshot save without exchanging a consumed token again. An encrypted recovery receipt covers a credential-store failure when remote cleanup also fails. Expired and failed pre-exchange placeholders are cleaned up.
- The official Plaid Go SDK v49 uses an explicit Sandbox/Production base URL derived from `PLAID_ENV`. Keys stay in backend environment settings. The official CLI provisioned `.env` without displaying values; files are owner-only and excluded from Git (GUIDE-004/005/021/022).
- Desktop launches read the private `vestramaximus/plaid/.env` in the OS application settings directory first, with the repo `.env` as a development fallback. On macOS the private directory is `~/Library/Application Support/vestramaximus/plaid`; it is owner-only. No overwrite/force option was used.
- Imported financial records, Item IDs, account identifiers, cursors, and Link sessions are saved in an AES-256-GCM authenticated encrypted snapshot. Its master key and normal Item tokens live in the OS credential store. Files use mode 0600, directories 0700, and saves use a synced temporary file and atomic rename. Missing keys, corruption, or authentication failure stop access; there is no plaintext fallback.
- Imports stay separate from the existing manual SQLite ledger and forecasts. Posting history through the existing AddTransaction path would count it against a current balance again. The existing manual ledger is **not encrypted**; whole-ledger encryption and reconciliation are follow-up work, not claims of this slice.
- Import reads Item status, authoritative accounts and cached balances, and institution display data. Unsupported/initially preparing products produce actionable notices. Read requests use capped jittered retries for transient failures; there is no automatic product-readiness polling or paid refresh (GUIDE-017, ITEM-002/004/010/013/014).
- `/transactions/sync` reads all pages with count 500, restarts the entire pagination from the last committed cursor on mutation, applies added/modified/removed, reconciles pending-to-posted IDs across pages, and commits data and cursor together. Positive Plaid amounts become negative spending in the app. Categories use PFC v2 (TXN-001/002/004/007, DATA-007).
- Account IDs are reconciled through persistent IDs or an unambiguous mask/type/subtype fallback. Unknown balances and debt fields remain unknown. Card APR arrays are preserved; liabilities include cards, mortgages, student loans, loans, and lines of credit. Holdings join securities from the same response; investment activity is separately paginated over the latest 90 days and is not household spending (LIAB-002/003/007, INV-001/010/015).
- Reconnect uses the existing token in update mode with no product-specific parameters and no second exchange. Disconnect revokes remotely before removing local data/tokens. Revocation markers commit before credential cleanup, so interrupted deletion remains retryable (ITEM-003/005/011).
- No public webhook receiver, tunnel, app cloud backend, or analytics was added. Imports are explicit user actions. The user accepted manual imports; scheduled local imports and any webhook architecture remain explicit future decisions (WEBHOOK-005).
- The app now detects an existing local ledger before onboarding, so a fresh webview does not create another starter budget. Settings labels accurately describe manual-budget deletion; bank feeds are removed through Accounts → Disconnect.

## Human tasks

| Task | State and observed evidence |
| --- | --- |
| Products and desktop surface | verified: user answered “Use this plan” for Transactions, Liabilities, Investments in Accounts with Go/browser sign-in and Sandbox |
| Import cadence | verified: user answered “Use manual imports for now” |
| Build Kit developer OAuth | verified: initial authorization succeeded; expired authorization renewed successfully on October 18 without exposing keys |
| Sandbox backend keys | verified: official CLI writes succeeded in repo and private desktop directory; mode 0600; native settings-load check passes outside project cwd |
| Product access | verified October 17: Dashboard readback listed transactions/liabilities/investments for Sandbox and US Production; real Sandbox calls succeeded; this does not prove billing/trial limits or live-bank approval |
| Desktop browser connection test | needs_human, deferred: user chose “I can test it later” October 18. Hosted Link opened from Accounts, but final sign-in → exchange → display is not verified |
| OAuth institution redirect | not_applicable to the completed non-OAuth/backend checks; exact Dashboard allowlist is empty. Configure and verify an exact redirect before claiming OAuth institution support or testing Production |
| Public webhook receiver | not_applicable to current manual-import stopgap. Revisit freshness delivery architecture before unattended updates; do not claim webhook coverage |
| Dashboard-configured webhooks/Layer/Android | not_applicable: readback lists were empty; this desktop slice uses none |
| Production prerequisites and cost | not_applicable to Sandbox acceptance. Before live use, verify Trial terms, limits, billing, company/security requirements, OAuth/institution approvals, and end-to-end coverage |

## Observed validation

- `go test ./...` passes, including the existing app/database/model suites.
- `go test -race ./internal/bankfeed` passes.
- New interface coverage: 8 bank-panel tests and 5 existing-ledger/startup tests pass. Tests cover pending sign-in/retry/cancellation, nullable debt/account values, investment separation, pagination/filtering, disconnect confirmation, fresh onboarding, and avoiding duplicate seeding.
- Backend fixtures exercise real SDK request serialization against a local test server: complete/repeated import, all sync lifecycle changes, mutation restart, failed-page rollback, account-ID changes, secure URL validation, reconnect without exchange, encrypted restart/tamper/missing-key behavior, receipt recovery after save failure, terminal/expired session cleanup, and interrupted remote revocation cleanup.
- `VESTRA_PLAID_CONFIG_TEST=1 go test ./internal/bankfeed -run TestDesktopSandboxConfig -v` proves private Sandbox settings load outside the repo working directory without displaying values.
- `wails build -debug` succeeds; Wails generated all bank-feed bindings. This is a local test build, not an App Store release.
- Real opt-in Sandbox API tests create simulated Items and revoke them afterward. Final completed run after the metadata/status fixes: standard `user_good` → 14 accounts, 48 spending transactions on a later import, 5 debt records, 13 holdings, 146 investment activity records. Dynamic `user_transactions_dynamic` → 7 accounts, 331 spending transactions on a later import, 2 debt records; no investment holdings/activity in that persona. The first import can legitimately show history preparing; a later explicit import returned the transactions.
- Native desktop observation verified existing-budget resume, the Accounts panel, Sandbox banner, backend-configured state, and opening Hosted Link from its button. Browser controls then stalled/timed out. No real account has been linked.
- Privacy review: no provider credentials/cursors/recovery tokens in generated frontend models; no frontend API keys, forced balance/refresh calls, or raw provider-error logging. Only safe request/session support IDs are logged. Official setup wrote secrets without displaying them; credential files were not printed or inspected.
- Prior frontend baseline had 11 failing tests out of 18 before this work (Welcome/localStorage runtime failures and older budget/envelope assertions). Do not attribute those to the new slice or claim the entire frontend suite is green. Final run: 11 pre-existing failures and 20 passing tests out of 31; all 13 newly added tests passed.

## Pending acceptance and testing later

The interactive browser journey and all Wails actions in the running application still need final exercise. API tests and mocked interface tests do not substitute for that evidence. Complete this in Sandbox before live accounts:

1. Open the latest test build and choose Accounts. Cancel an expired pending sign-in if shown.
2. Choose Connect a bank. Use First Platypus Bank with `user_good` / `pass_good` — test credentials only.
3. Complete bank sign-in, return to the app, and choose “I finished sign-in.” If history is preparing, use Import available updates later.
4. Verify balances, transaction signs/categories, debt terms, and separate investment sections. Re-import and confirm there are no duplicate transactions.
5. Exercise reconnect and disconnect, including restart/resume. Verify any OAuth institution separately after exact redirect setup.
6. Re-run Plaid acceptance with observed evidence. Keep browser/OAuth checks pending or failed until actually exercised.

Follow-ups beyond this confirmed first slice: scheduled local imports, secure ledger migration and reconciliation, weekly/biweekly pay calendars, spending opportunity-cost scenarios, debt payoff comparisons, and local categorization/model evaluation. No transfer, payment, investment trading, or AI classification was added.

## Workflow maintenance

Plaid workflow `wf_18aa65809a503c21`; final acceptance returned to `stage=implement`, `round=1`, `scope_rounds=1`, awaiting the deferred checks. Keep these returned values for continuation. Goal/path/platform are preserved in the guided workflow. Consult `build_guidance` before later changes to Plaid code, and call `build_check_acceptance` after the final changes. A verdict applies only to the checked code (GUIDE-014). Never mark the overall build accepted while browser completion remains unverified. The user deferred that test; do not repeatedly ask for it during this session.

## Final acceptance record — October 18

`build_check_acceptance` returned **FAIL: 5 checklist items failed, 0 unreported**. This is an incomplete Sandbox acceptance, not a Production approval.

- CHECK-003: Literal output gate failed because authenticated official Dashboard/CLI setup surfaced the client identifier as metadata earlier. No API secret or bank access token was displayed, committed, or placed in the interface. Do not repeat the identifier or claim all credential-related metadata was absent from setup output. Resolve this audit condition with Plaid before declaring formal acceptance; rotating a secret is a separate action and does not change a client identifier. No secret-key exposure is asserted by this record.
- CHECK-007: Exact OAuth redirect registration and institution flow are unverified.
- CHECK-008: Full browser Link completion → desktop exchange → displayed import is deferred by the user.
- CHECK-009: The deferred browser test and OAuth setup remain human tasks.
- CHECK-013: Native GetBankFeedView/StartBankLink were observed; remaining Wails actions have service/interface test coverage but were not all exercised through the running app.

All other checks were passed or explicitly not applicable for this confirmed manual-import Sandbox slice. Test Items created by the opt-in API checks were revoked afterward. The latest debug app is at `build/bin/vestramaximus.app`; quit and reopen that build before testing, because an already-running process can still contain earlier code.
