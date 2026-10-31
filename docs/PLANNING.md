# Household schedules and budget closeout

## Using it

- Open **Calendar**. Add an income schedule for each earner, with a known payday and take-home amount per check. Weekly and every-two-week schedules coexist; the shared budget does not create competing envelopes for each earner.
- Add bills or payment plans with an amount per occurrence, a first due date and frequency. Weekly means seven days, every two weeks means fourteen days, twice monthly uses two day numbers, and every two months is a separate option. One-time bills are supported. An optional inclusive last-occurrence date stops a finite plan. Pause a schedule to stop future events without deleting it.
- Monthly due days clamp to the end of shorter months and return to the original day afterward. Dates are calendar days, with no automatic weekend or holiday shifts. The second twice-monthly day must follow the first; when both clamp to the same short-month date, it occurs once.
- The calendar shows expected income, bills, and budget start/end markers. Day details show every event, including overflow from busy calendar cells. These expectations do not post payments, alter bank balances, or mark bills paid.
- Under **Budgets**, expired open periods appear in **Ready for review**, oldest first. Select a period to see its manual expenses, planned expenses, available imported outflows and pending counts. Imported detail is capped at the latest 100 matching transactions. Imported USD outflows are shown separately; other currencies retain their labels in transaction detail. No deduplication or reconciliation with manual entries is inferred. Sparse or missing imported history does not prove there was no spending. Sandbox imports are explicitly identified as simulated.
- Review the actual records and envelope amounts, then acknowledge and close a period. The budget and allocations stay in history. Use **Reopen for review** on a closed budget to correct it. Closing does not change balances or post imported transactions. Changes to dates or allocations refresh the review and clear acknowledgement.
- **Create New Period** and **Start next period** offer weekly, every-two-week, twice-monthly (1–15 and 16–month-end), monthly (calendar month), or custom dates. Dates include the final day. The next period copies category defaults, not the old period's actual spending or unused balance. Defaults remain whole-period amounts without automatic prorating. Review them when changing budget duration.
- Active income schedules determine the next household payday for the dashboard; Settings' single date remains a fallback when no income schedule is active. The forecast is conservative before the next deposit: expected paychecks are not added to current account balances. Bank feed balances remain separate from manual cash-flow accounts.

## Preservation and compatibility

Two new SQLite tables hold income schedules and per-bill recurrence rules. Existing bill IDs, amounts, due days, categories, accounts, budget periods, transactions and allocations are preserved. A bill without a stored recurrence keeps its monthly due-day behavior. Schema expansion is transactional and idempotent. Existing monthly APIs remain available; the UI's schedule editor lives in Calendar.

Rollback retains all old and new data, but older builds do not understand new income or non-monthly bill schedules. Do not use an older build for forecasting after configuring those schedules. No destructive schema contraction or live budget closeout was performed by this feature implementation. New schedule records use the existing manual ledger's storage protections; imported bank snapshots retain their existing encryption. This change does not encrypt the manual ledger.

## Verification

- Recurrence cases: weekly versus fourteen-day versus twice-monthly, leap-year month ends without drift, finite final dates, one-time events, every-two-month rules and duplicate short-month clamping.
- Database cases: independent weekly/biweekly earners, legacy monthly bills, persisted schedules after repeated initialization, finite plan events and rule cleanup through bill deletion.
- App cases: inclusive budget presets, validation, manual closeout date boundaries and unchanged balances during review.
- Interface cases: independent weekly income creation, finite payment-plan dates, explicit review before closing, missing-history errors, stale acknowledgement reset and custom date override.


Native verification used a separate sample SQLite ledger (schema only copied; no manual financial records copied). Created and edited a weekly income schedule, added an every-two-week bill through the running Wails bridge, and observed November totals of five weekly checks and two biweekly bills. Reviewed and closed an expired sample budget, reopened it, and completed Close and start next period. The handoff persisted Oct 29–Nov 11 (14 inclusive days), copied the $100 sample default and left the sample account balance unchanged. Calendar and budget day labels were visually checked; UTC-midnight display shifts were corrected. The user's actual periods were not closed or rewritten during these tests.

Final automated checks: 39 interface tests pass, `go test -race ./...` passes, and `wails build -debug` builds with TypeScript checking. The reviewed stale-closeout issue has a regression test: editing a budget refreshes evidence and resets acknowledgement. Existing Plaid work remains separate from this planning feature.
