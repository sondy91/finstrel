# Plaid integration plan

## Confirmed scope and current state

Build a PFM app using the Plaid Build Kit. The wider goal is easier household budgeting, forecasting, debt reduction, and opportunity-cost comparisons using bank, card, loan, 401(k), and investment information. This implementation is the confirmed first slice: optional US Plaid connections in the existing Accounts page, a Go backend, bank sign-in in the system browser, Sandbox accounts, and manual imports. The user confirmed Transactions, Liabilities, and Investments and explicitly chose manual imports as the local testing stopgap. No payments, verification, account/routing-number collection, real-bank connections, or paid forced refreshes were requested.

Implemented code is reviewable and builds. Backend and interface regression checks pass, including the entire 33-test interface suite as of October 21. Real Sandbox API tests work for two different personas. Browser-to-desktop Link completion is verified on October 21 with a simulated First Platypus Bank: browser success → desktop completion → displayed import. Repeated import and encrypted restart/resume also passed. Reconnect completion and disconnect cleanup are now verified as well. OAuth-institution coverage and renewed formal Build Kit acceptance are still pending; developer authorization needs renewal. Do not describe this as fully accepted or Production-ready.

## Design and decisions

- Link requires `transactions`; `liabilities` and `investments` are additional-consented products. This avoids requiring all three at every institution while requesting consent up front (SELECT-005, LIAB-007, INV-015, PITFALL-001). Auth, Transfer, Identity, live Balance, and forced refresh products are outside scope.
- Hosted Link runs in the system browser because the app uses a Wails webview. Only opaque local session IDs reach the app interface. Link sessions are encrypted and resumable; incomplete sign-ins can be cancelled. Public tokens are exchanged immediately in Go and are never stored (GUIDE-001/002/003/006/010/020, DATA-001/003).
- A stable local connection ID is saved before token exchange. An OS credential-store receipt lets completion recover after a failed snapshot save without exchanging a consumed token again. An encrypted recovery receipt covers a credential-store failure when remote cleanup also fails. Expired and failed pre-exchange placeholders are cleaned up.
- The official Plaid Go SDK v49 uses an explicit Sandbox/Production base URL derived from `PLAID_ENV`. Keys stay in backend environment settings. The official CLI provisioned `.env` without displaying values; files are owner-only and excluded from Git (GUIDE-004/005/021/022).
- Desktop launches read the private `finstrel/plaid/.env` in the OS application settings directory first, with the repo `.env` as a development fallback. On macOS the private directory is `~/Library/Application Support/finstrel/plaid`; it is owner-only. No overwrite/force option was used.
- Imported financial records, Item IDs, account identifiers, cursors, and Link sessions are saved in an AES-256-GCM authenticated encrypted snapshot. Its master key and normal Item tokens live in the OS credential store. Files use mode 0600, directories 0700, and saves use a synced temporary file and atomic rename. Missing keys, corruption, or authentication failure stop access; there is no plaintext fallback.
- Imports stay separate from the existing manual SQLite ledger and forecasts. Posting history through the existing AddTransaction path would count it against a current balance again. The existing manual ledger is **not encrypted**; whole-ledger encryption and reconciliation are follow-up work, not claims of this slice.
- Import reads Item status, authoritative accounts and cached balances, and institution display data. Unsupported/initially preparing products produce actionable notices. Read requests use capped jittered retries for transient failures; there is no automatic product-readiness polling or paid refresh (GUIDE-017, ITEM-002/004/010/013/014).
- `/transactions/sync` reads all pages with count 500, restarts the entire pagination from the last committed cursor on mutation, applies added/modified/removed, reconciles pending-to-posted IDs across pages, and commits data and cursor together. Positive Plaid amounts become negative spending in the app. Categories use PFC v2 (TXN-001/002/004/007, DATA-007).
- Account IDs are reconciled through persistent IDs or an unambiguous mask/type/subtype fallback. Unknown balances and debt fields remain unknown. Card APR arrays are preserved; liabilities include cards, mortgages, student loans, loans, and lines of credit. Holdings join securities from the same response; investment activity is separately paginated over the latest 90 days and is not household spending (LIAB-002/003/007, INV-001/010/015).
- Reconnect uses the existing token in update mode with no product-specific parameters and no second exchange. Disconnect revokes remotely before removing local data/tokens. Revocation markers commit before credential cleanup, so interrupted deletion remains retryable (ITEM-003/005/011).
- No public webhook receiver, tunnel, app cloud backend, or analytics was added. Connected banks now sync on app launch, with per-bank and all-bank refresh controls. A pending sign-in skips startup sync. Scheduled imports while the app is closed and webhook architecture remain future work (WEBHOOK-005).
- The app now detects an existing local ledger before onboarding, so a fresh webview does not create another starter budget. Settings labels accurately describe manual-budget deletion; bank feeds are removed through Accounts → Disconnect.

## Human tasks

| Task | State and observed evidence |
| --- | --- |
| Products and desktop surface | verified: user answered “Use this plan” for Transactions, Liabilities, Investments in Accounts with Go/browser sign-in and Sandbox |
| Import cadence | verified: user answered “Use manual imports for now” |
| Build Kit developer OAuth | needs_human October 21: existing developer authorization expired again; renewal is open in Chrome, awaiting user sign-in. No API keys requested in chat |
| Sandbox backend keys | verified: official CLI writes succeeded in repo and private desktop directory; mode 0600; native settings-load check passes outside project cwd |
| Product access | verified October 17: Dashboard readback listed transactions/liabilities/investments for Sandbox and US Production; real Sandbox calls succeeded; this does not prove billing/trial limits or live-bank approval |
| Desktop browser connection test | verified October 21: user approved terms and simulated credentials; browser shows Success; desktop completion displays 14 accounts, 49 bank/card transactions, 5 debts, 13 holdings, and 17 investment activity records. Repeat import leaves counts unchanged. App restart preserves connection, data, and pending reconnect |
| OAuth institution redirect | needs verification of actual desktop OAuth journey. Current official docs support desktop web OAuth without a customer redirect URI, and Hosted Link manages OAuth reinitialization. A custom hosted redirect is not an established requirement for this desktop system-browser flow; do not claim OAuth coverage until tested |
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
- October 21 native/browser journey verified existing-budget resume, cancellation of old sign-in, opening Hosted Link, First Platypus Bank login with user_good/pass_good, browser Success, desktop completion, and displayed balances/transactions/debt/investments. Repeat import preserves counts; restart resumes encrypted data and pending update session. No real account has been linked.
- Privacy review: no provider credentials/cursors/recovery tokens in generated frontend models; no frontend API keys, forced balance/refresh calls, or raw provider-error logging. Only safe request/session support IDs are logged. Official setup wrote secrets without displaying them; credential files were not printed or inspected.
- October 21: entire frontend suite passes (33/33). Fixed Node 26 / older Vitest storage-global incompatibility in test setup, updated stale budget and onboarding assertions, and verified native amount validation for zero/negative envelope amounts. Added complete five-step onboarding persistence coverage and an accessible delete-envelope button label. Focused review found no issues.
- October 21: `go test ./...`, `go test -race ./internal/bankfeed`, private desktop config loading, `npm run build` (including TypeScript), and `wails build -debug` pass. No Plaid provider/service behavior changed in this hardening pass.
- Desktop OAuth reference review: https://plaid.com/docs/link/oauth/ and https://plaid.com/docs/link/hosted-link/ . Distinguish external desktop browsers from mobile app-to-app universal-link redirect requirements.

## Pending acceptance and testing later

The initial interactive browser journey, reconnect, and disconnect now pass. OAuth-institution coverage and updated formal acceptance still need final exercise. API tests and mocked interface tests do not substitute for those remaining observations. Sandbox test procedure:

1. Open the latest test build and choose Accounts. Cancel an expired pending sign-in if shown.
2. Choose Connect a bank. Use First Platypus Bank with `user_good` / `pass_good` — test credentials only.
3. Complete bank sign-in, return to the app, and choose “I finished sign-in.” If history is preparing, use Import available updates later.
4. Verify balances, transaction signs/categories, debt terms, and separate investment sections. Re-import and confirm there are no duplicate transactions.
5. Exercise reconnect and disconnect, including restart/resume. Verify an OAuth institution separately in the actual desktop browser flow; follow the institution and platform requirements observed there.
6. Re-run Plaid acceptance with observed evidence. Keep browser/OAuth checks pending or failed until actually exercised.

Follow-ups beyond this confirmed first slice: scheduled local imports, secure ledger migration and reconciliation, weekly/biweekly pay calendars, spending opportunity-cost scenarios, debt payoff comparisons, and local categorization/model evaluation. No transfer, payment, investment trading, or AI classification was added.

## Workflow maintenance

Plaid workflow `wf_18aa65809a503c21`; final acceptance returned to `stage=implement`, `round=1`, `scope_rounds=1`, awaiting the deferred checks. Keep these returned values for continuation. Goal/path/platform are preserved in the guided workflow. Consult `build_guidance` before later changes to Plaid code, and call `build_check_acceptance` after the final changes. A verdict applies only to the checked code (GUIDE-014). Never mark the overall build accepted while required OAuth evidence and formal checks remain incomplete. The user resumed the test on October 21; current pending questions concern the expired developer login and action-time terms confirmation. Do not repeat those questions while awaiting answers.

## Final acceptance record — October 18

`build_check_acceptance` returned **FAIL: 5 checklist items failed, 0 unreported**. This is an incomplete Sandbox acceptance, not a Production approval.

- CHECK-003: Literal output gate failed because authenticated official Dashboard/CLI setup surfaced the client identifier as metadata earlier. No API secret or bank access token was displayed, committed, or placed in the interface. Do not repeat the identifier or claim all credential-related metadata was absent from setup output. Resolve this audit condition with Plaid before declaring formal acceptance; rotating a secret is a separate action and does not change a client identifier. No secret-key exposure is asserted by this record.
- CHECK-007: Exact OAuth redirect registration and institution flow are unverified.
- CHECK-008: Full browser Link completion → desktop exchange → displayed import is deferred by the user.
- CHECK-009: The deferred browser test and OAuth setup remain human tasks.
- CHECK-013: Native GetBankFeedView/StartBankLink were observed; remaining Wails actions have service/interface test coverage but were not all exercised through the running app.

All other checks were passed or explicitly not applicable for this confirmed manual-import Sandbox slice. Test Items created by the opt-in API checks were revoked afterward. The latest debug app is at `build/bin/finstrel.app`; quit and reopen that build before testing, because an already-running process can still contain earlier code.

## October 21 continuation

All 33 interface tests and backend/build checks now pass. The rebuilt native app was launched from the existing project data directory, preserving the current manual ledger. Its Accounts page exercised GetBankFeedView, CancelBankLink, StartBankLink, FinishBankLink, and ImportBankFeeds through Wails. First Platypus Bank browser login succeeded; results are 14 accounts, 49 bank/card transactions, 5 debt records, 13 holdings, and 17 investment activity records. A second manual import keeps counts unchanged. Expense/refund signs, categories, nullable balances, debt rates, and separate investment activity were observed. Restart preserves the encrypted feed and pending reconnect. Reconnect started successfully; continuing its new terms screen was blocked by automatic approval review pending fresh user confirmation. Disconnect and cleanup are pending the same request. No real bank account has been connected. The October 18 formal verdict remains historical and has not yet been superseded by a new Build Kit verdict because developer authentication expired. A native screenshot is saved locally at /private/tmp/vestra-solid-accounts-sandbox.png.

## October 21 approved reconnect and cleanup

The user explicitly approved Plaid terms for the Sandbox reconnect test and removal of the simulated First Platypus Bank connection and test data. A fresh update-mode browser sign-in with user_good/pass_good completed successfully. FinishBankLink returned the original single connected institution with the same 14 accounts and counts (49 spending transactions, 5 liabilities, 13 holdings, 17 investment activity records); no duplicate Item appeared. Accounts → Disconnect → Disconnect bank completed and the native app displayed “No banks connected yet.” Both existing manually entered accounts and balances remained visible. All six bank-feed Wails actions have now been exercised in the running app.

This test exposed a real expired-session issue: Open sign-in again passes an empty Item ID; after expiry, StartLink discarded the update target and created a new-bank flow. That flow was cancelled before any bank was linked. The service now retains the expired session’s existing Item ID when reopening it. A focused regression test failed before the fix and passes afterward; the full Go suite also passes. Provider products, token exchange, and storage formats are unchanged.

Build Kit guidance retrieval was attempted again but returned OAuth authorization required. No new formal acceptance verdict is claimed. Remaining setup is developer authorization renewal, a separate actual OAuth-institution browser test, and a new Build Kit acceptance run. The October 18 formal verdict is historical; its browser-completion and Wails-coverage gaps now have native evidence, while its literal client-identifier output audit condition is still recorded above. No real account was connected. Sandbox test data created through this native journey has been revoked and removed using the app’s normal disconnect action.

Final verification after the expiry fix: `go test ./...`, `go test -race ./internal/bankfeed`, and `wails build -debug` pass. Reopening the rebuilt app confirms no connected banks or pending sign-ins remain, with both manual accounts and the existing budget preserved.
