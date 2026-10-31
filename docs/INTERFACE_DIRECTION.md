# Budget review and connected accounts

The supplied Monarch screenshots are visual references, not instructions or seed financial data. Reviewed all 50 references; account rows, source-visible transaction lists, budget planned/actual columns, and the transaction detail panel were the strongest patterns for this app. No screenshot balances, merchants, personal profile values, or logos are copied into the application.

Retain Nunito typography and the user-selected accent. Existing charcoal/light surfaces and muted borders keep lists quiet; indigo remains the main action color, emerald denotes inflows, and amber denotes pending/test data. Names align left, amounts align right with tabular figures. Compact rows replace repeated account cards, while a transaction opens in a detail panel beside the list. No fabricated balance-history charts are added.

Budget closeout becomes a compact queue and an on-demand dialog: Planned / Spent (manual) / Remaining, a bank-history link, a short review checkbox and Close budget. Source explanations are disclosed separately; test data and unavailable history remain visible. A changed period or allocation refreshes evidence and clears acknowledgement.

Accounts and budget review both open the same Transactions workspace with account or inclusive date filters. Connected accounts and Manual ledger are separate views; totals never combine overlapping sources, and different currencies are summarized separately. Connected history is read-only. Investment activity remains separate from everyday bank/card transactions.

This delivers navigation and visual integration. Automatic category mapping, reconciliation with manual entries, and using approved bank transactions as budget actuals remain a separate data-model change. No automatic merges, new bank API calls, or balance writes are part of this interface pass. Two-week household budgets and mixed pay schedules are unchanged.


Validation: all 48 interface tests pass, TypeScript checking passes, and the Go suite passes. Review fixes cover a bank read remaining pending while manual history loads, and investment accounts retaining their dedicated activity rather than entering a bank-only view. Native read-only checks verified compact review, inclusive period navigation into bank history, and the transaction detail panel. No budget was closed, bank account connected/disconnected, or financial record edited during this interface verification.

## Card readability — October 27, 2026

Monarch's separate canvas and panel surfaces informed a focused contrast update. Dark mode uses a #181818 page, #2b2b2b cards/dialogs, #383838 inset surfaces, #4d4d4d dividers, and #bdbdbd secondary text. Amounts and headings remain bright; the user's accent is unchanged. Light mode uses a pale-gray canvas behind white cards. Native controls follow the active color scheme, and the root background follows the same palette. Transaction history and its summary use the shared card surface; dialogs use the elevated popover surface. No layout or financial behavior changed.
