# Practice household

Open **Settings → Open practice household**, or **Try a practice household** on the first welcome screen.

The first workflow reuses the real Budgets and Transactions screens: review **Previous two weeks**, inspect its history, close it, and choose **Start next period**. A closed budget can now start its successor without reopening. Open budgets retain the existing close-and-start action. The next period copies category defaults; editing an old envelope does not change those defaults or carry spending forward.

Practice uses fictional manual entries and a copy of the existing cached Plaid Sandbox view, when available. Production feeds are excluded. No sign-in, refresh, import, disconnect, paid add-on, or model request is made. All practice operations are intercepted before either native bridge; unsupported operations fail locally. Practice data stays in memory. **Reset practice** restores the starting household and the copied test feed. **Return to my budget** discards practice changes and resumes normal startup. No practice completion flags or budgets are saved to the real ledger.

Dates are relative to the day practice starts. In the practice copy, bank and investment timelines are shifted independently so their latest transaction falls yesterday. Relative calendar-day gaps and timestamp times are preserved, including across daylight saving changes. Valid sample liability due dates are placed a week ahead; missing/invalid dates remain unchanged. Actual import timestamps and saved Plaid data retain their original dates. Reset rebuilds from the original cached snapshot to avoid cumulative date drift. Bank history remains separate from manual budget totals; this does not implement reconciliation or automated categorization. This first practice slice covers budget closeout, next-period setup, envelope editing, and transaction browsing. Income/bill schedule simulation and a full onboarding rehearsal are future slices.

## Iteration priorities before leaving the spreadsheet

- [x] Reusable, isolated practice household for closeout → next period.
- [ ] Make onboarding choose the first budget dates and cadence explicitly, including a shared two-week household budget. Current initial seeding still creates a monthly budget.
- [ ] Walk through setup of weekly and biweekly take-home pay, existing bills, and finite payment plans; clarify the next action after each step.
- [ ] Establish category defaults and reconciliation before imported spending contributes to budget actuals. Preserve corrections and prevent duplicate manual/imported entries and transfer/payment double counting.
- [ ] Compare a full pay period against the spreadsheet's **Our Budget** tab, including balances, due dates, debt payments, and available spending. Do not treat simulated bank data as evidence of household totals.

Keep each iteration to one observable workflow and reuse the current screens. Capture Monarch behavior while the trial is available as reference; no private screenshot data or assets are used as fixtures.

## Verification — October 26, 2026

All 53 interface tests and TypeScript checking pass; the desktop build succeeds. Integration coverage exercises welcome → practice → review → close → next period → reset → return, without writing onboarding flags or calling native mutations. Adapter coverage checks every exported operation stays behind the practice boundary, including rejected bank and deletion actions, plus Sandbox-only copying and restoration of normal routing on exit.

The rebuilt native app opened practice from Settings with cached Plaid test history. Review displayed five bank transactions for October 12–25, and its bank-history link opened exactly those five records. Closing the fictional period enabled Start next period directly, with October 26–November 8 as the 14-day window. Creating the successor and resetting practice both worked. No native ledger mutation or bank update was performed in practice. The app was left with a fresh practice household.

Date adjustment follow-up: added regression coverage for 2020 history, separate bank/investment timelines, due dates, leap-day/DST spacing, timestamp suffixes, reset on a later day, and preservation of the source snapshot. The earlier five-record native observation above predates this adjustment.
