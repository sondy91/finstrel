# Finstrel Functional Specification

> Implementation-agnostic specification capturing all functionality of the Finstrel personal finance application as built. This document describes WHAT the app does, not how it's implemented, enabling identical behavior on any technology stack.

**Version:** 1.0  
**Date:** 2026-04-26  
**Status:** Current Implementation

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [Glossary of Domain Terms](#2-glossary-of-domain-terms)
3. [Application Lifecycle](#3-application-lifecycle)
4. [Onboarding / Setup Wizard](#4-onboarding--setup-wizard)
5. [Navigation Model](#5-navigation-model)
6. [Account Management](#6-account-management)
7. [Category Management](#7-category-management)
8. [Transaction Management](#8-transaction-management)
9. [Budget Period Management](#9-budget-period-management)
10. [Envelope (Budget Allocation) Management](#10-envelope-budget-allocation-management)
11. [Dashboard](#11-dashboard)
12. [Reports](#12-reports)
13. [Settings](#13-settings)
14. [Theming Requirements](#14-theming-requirements)
15. [Data Model (Conceptual)](#15-data-model-conceptual)
16. [Validation Rules](#16-validation-rules)
17. [Cross-Cutting Requirements](#17-cross-cutting-requirements)
18. [Audit & Error Handling](#18-audit--error-handling)
19. [Out-of-Scope (Deferred)](#19-out-of-scope-deferred)
20. [Verification Checklist](#20-verification-checklist)

---

## 1. Purpose & Scope

### Product Summary

Finstrel is a **local-first, privacy-focused personal finance desktop application** implementing envelope-style budgeting. All financial data remains exclusively on the user's device with no network connectivity, cloud sync, or external API integrations. Users manually enter income and expense transactions, create budget periods with allocated envelopes, and track spending against those allocations with visual progress indicators.

### Target User

Single individual managing personal finances with one or two income sources. The user prefers manual transaction entry over automated bank imports and prioritizes data privacy over convenience features.

### Explicit Non-Goals (MVP)

- Cloud synchronization or multi-device sync
- Bank API integration or automated transaction import
- Multi-currency support (single implicit currency only)
- Household or multi-user management
- Recurring transaction automation
- Investment or asset tracking

---

## 2. Glossary of Domain Terms

| Term | Definition |
|------|------------|
| **Account** | A container representing a financial instrument (checking, savings, credit card, etc.) with a tracked balance. |
| **Category** | A classification label for transactions. Categories have a type (Income or Expense) and may optionally reference a parent category for hierarchical organization. |
| **Transaction** | A single financial movement: income (positive amount) or expense (negative amount), tied to an account and category. |
| **BudgetPeriod** | A named time window (typically monthly) with start/end dates during which budget allocations are tracked. Has status: `Open`, `Closed`, or `Archived`. |
| **BudgetAllocation** (Envelope) | A planned spending ceiling for a specific category within a specific budget period. Tracks the `allocatedAmount` only; actual spending is computed from transactions. |
| **Spent** | The sum of negative-amount (expense) transactions for a category within a budget period date range. Displayed as a positive number. |
| **Remaining** | `AllocatedAmount + Σ(transactions.amount)` for the envelope. Since expenses are negative, this correctly yields the unspent budget. |

> **Known issue:** Two parallel envelope models exist in the codebase—`BudgetAllocation` (actively used by UI) and `Envelope` (a richer model with status/lifecycle defined in backend but never wired to UI). Status vocabulary differs: `BudgetPeriod` uses `Open|Closed|Archived`; the unused `Envelope` model uses `active|paused|archived`.
> 
> **Suggested improvement:** Pick one model and one casing convention. Either expose the `Envelope` lifecycle (pause/resume/archive) to the UI, or delete the dead `Envelope` model, repository, and handler entirely.

---

## 3. Application Lifecycle

### First-Run Detection

On startup, the application checks for a persisted onboarding completion flag. If absent or false, the user is directed to the onboarding wizard. Otherwise, the main application shell loads.

### Startup Actions

1. Open or create the local data store.
2. Run schema migrations/table creation if needed.
3. Check onboarding completion status.
4. Load persisted theme and accent color preferences.

### Shutdown Actions

1. Close the data store connection.
2. Persist any pending state.

### Window Requirements

- **Minimum dimensions:** 1080×720 pixels
- **Initial state:** Starts maximized
- **Chrome:** Standard OS window decorations (not frameless)
- **Background color:** Dark default (`#1B2636`)

---

## 4. Onboarding / Setup Wizard

A four-step guided flow for first-time users.

### Step 1: Welcome

- Displays product branding and tagline ("Streamline your budgets, track envelopes, and stay in control—all offline")
- Single CTA: "Get started"

### Step 2: Customize Experience

- **Theme mode selection:** Light or Dark (applied immediately)
- **Accent color selection:** Five choices (Indigo, Blue, Green, Purple, Pink)
- Changes are previewed live and persisted

### Step 3: Goals Selection

- Multi-select from five options:
  - Pay off debt
  - Build an emergency fund
  - Save for a goal
  - Create a budget
  - Something else
- **Validation:** At least one goal must be selected to proceed

### Step 4: Starter Categories

- Multi-select from six preset expense categories:
  - Groceries
  - Rent/Mortgage
  - Utilities
  - Transportation
  - Entertainment
  - Savings
- **Validation:** At least one category must be selected to proceed

### Post-Completion Seeding

Upon completing onboarding:
1. Save onboarding data (goals, categories, theme preferences) to local storage
2. Create a budget period for the current month (name: "{Month Name} {Year} Budget")
3. Create an Expense category for each selected starter category
4. Create a $0.00 budget allocation for each category in the new period
5. Mark onboarding as complete

> **Known issue:** Starter categories and goal IDs are hardcoded in the client. The seed flow can race with UI rendering, potentially showing partial data.
> 
> **Suggested improvement:** Move the preset list to a configuration asset. Gate dashboard rendering on seed completion confirmation.

---

## 5. Navigation Model

Seven primary destinations accessible via persistent navigation:

1. **Dashboard** — Overview and KPIs
2. **Budgets** — Budget period and envelope management
3. **Accounts** — Financial account management
4. **Transactions** — Transaction list and entry
5. **Categories** — Category management
6. **Reports** — Visual analytics
7. **Settings** — Preferences and data management

### Requirements

- Active route is visually highlighted
- Navigation collapses/adapts on smaller viewports
- All destinations are reachable within one click from any screen

---

## 6. Account Management

### Create Account

**Inputs:**
- Name (required, free-text)
- Type (required, select from: Checking, Savings, Credit Card, Loan, Cash, Investment, Other)
- Initial balance (required, numeric, may be negative)

**Behavior:**
- Current balance is initialized to equal initial balance
- Account appears immediately in the list

### List Accounts

- Display all accounts as cards showing: name, type (with icon), current balance, initial balance
- Balance is color-coded: positive = primary color, negative = destructive color

### Delete Account

- Requires confirmation dialog
- **Warning displayed:** "This will permanently delete the account and ALL associated transactions"
- Deletion cascades to remove all transactions linked to that account

### Side Effects

- When a transaction is added, the associated account's `currentBalance` is mutated by the transaction amount (atomically with transaction insert)

> **Known issue:** No update-account operation exists. Account types are hardcoded in the UI. Balances are stored as floating-point (precision risk). Deleting an account silently destroys all its transactions even if referenced by budget reports.
> 
> **Suggested improvement:** Add account update functionality. Centralize account-type list as configuration. Use fixed-point decimal for money. Consider requiring zero balance or "transfer transactions to another account" before delete.

---

## 7. Category Management

### Create Category

**Inputs:**
- Name (required, must be unique across all categories)
- Type (required, select: Income or Expense)
- Parent Category (optional, select from existing categories)

**Validation:**
- Name cannot be empty
- Type must be "Income" or "Expense"

### List Categories

- Display as table with columns: Name, Type (badge), Parent Category
- Type badge is color-coded: Income = green, Expense = red
- Parent reference shows parent name or "-" if none

### Hierarchy

- Categories form a self-referential hierarchy via optional parent reference
- Any category may reference any other as parent (no type constraint)

> **Known issue:** No update or delete operations in the UI. No cycle detection on parent assignment (A→B→A is possible). No depth limit. Nesting an Income category under an Expense is permitted but semantically meaningless.
> 
> **Suggested improvement:** Add update/delete with safe-delete semantics (block if referenced by transactions). Validate parent assignments are acyclic. Optionally enforce parent.type == child.type.

---

## 8. Transaction Management

### Create Transaction

**Inputs:**
- Date (required, parsed flexibly from RFC3339 or YYYY-MM-DD)
- Amount (required, numeric)
- Type (required, select: Income or Expense)
- Description (required, free-text)
- Category (required, select from existing categories)
- Account (required, select from existing accounts)
- Status (optional, default "Cleared", select: Cleared or Pending)
- Notes (optional, free-text)

**Validation:**
- Amount sign must match type: Income requires amount ≥ 0; Expense requires amount ≤ 0
- Invalid combinations are rejected with error

**Side Effects:**
- Transaction insert and account balance update occur atomically
- Account's `currentBalance` is adjusted by the transaction amount

### List Transactions

- Display as table with columns: Date, Description, Category, Account, Amount
- Ordered by date descending (newest first), then by ID descending
- Amount is color-coded with direction icon: positive (green, arrow-up-right), negative (red, arrow-down-left)

> **Known issue:** No edit, no delete, no filtering, no pagination, no search. Loads entire transaction history into memory. The `type` field is redundant with the amount sign. No way to correct a misposted transaction.
> 
> **Suggested improvement:** Add full CRUD with balance reversal on edit/delete inside the same atomic operation. Add server-side pagination and filters (date range, category, account, text search). Drop redundant `type` field or compute it from amount sign.

---

## 9. Budget Period Management

### Create Period

**Inputs:**
- Name (required, unique across all periods)
- Start Date (required)
- End Date (required, must be strictly after start date)
- Status (optional, defaults to "Open", values: Open, Closed, Archived)

**Validation:**
- Name cannot be empty
- End date must be after start date
- Status must be valid enum value

### Edit Period

**Editable fields:** Name, Start Date, End Date (status edited separately)

**Validation:** Same as create

### Update Period Status

**Transition rules:**
- A period can transition to "Closed" or "Archived" **only if it has at least one allocation**
- Attempting to close/archive an empty period returns an error

### List Periods

- Displayed in a horizontally scrollable carousel
- Each card shows: Name, Start Date, End Date, Status badge
- Clicking a period selects it for envelope management

> **Known issue:** No delete operation. No "duplicate previous period" action—every period must be set up from scratch.
> 
> **Suggested improvement:** Add delete (with cascade warning for allocations). Add "copy allocations from period X" action.

---

## 10. Envelope (Budget Allocation) Management

### Uniqueness Constraint

One envelope per (period, category) pair. Attempting to create a duplicate is rejected.

### Create Envelope

**Inputs:**
- Budget Period ID (required, from selected period)
- Category ID (required, select from existing categories not already allocated in this period)
- Allocated Amount (required, numeric, must be ≥ 0)

### Update Envelope

- Inline editing of allocated amount
- Supports keyboard: Enter to save, Escape to cancel

### Delete Envelope

- Requires confirmation dialog
- Removes allocation; does not affect linked transactions

### Spent Calculation

Sum of negative-amount transactions where:
- `transaction.categoryId` = envelope's `categoryId`
- `transaction.date` falls within the budget period's date range

Displayed as a positive number.

### Remaining Calculation

`allocatedAmount + Σ(transactions.amount)` where transactions match the envelope's category and period date range.

Since expenses are negative, this correctly yields: `allocated - spent`.

### Visual Indicators

- Progress bar showing percentage used
- Color zones:
  - Green: < 80% spent
  - Yellow: 80–100% spent
  - Red: > 100% spent (overspent)
- For zero-allocation envelopes: "Not Allocated" label with inline "Allocate" button

> **Known issue:** Spent/Remaining are recomputed client-side from the full transaction list on every render. Color-only status indication is an accessibility concern. No bulk operations (allocate-from-template, copy-from-previous).
> 
> **Suggested improvement:** Add server-side aggregate endpoints returning per-envelope spent/remaining. Pair color cues with iconography or text labels for accessibility. Add bulk allocation tooling.

---

## 11. Dashboard

### KPI Cards (4 cards)

1. **Total Allocated:** Sum of `allocatedAmount` across all envelopes in the current period. Subtitle shows envelope count.
2. **Budget Periods:** Count of all periods. Subtitle shows current period name or "No active period".
3. **Income:** Sum of all Income-type transactions (all-time). Label: "Total income recorded".
4. **Expenses:** Sum of all Expense-type transactions (all-time, displayed as positive). Label: "Total expenses recorded".

### Active Period Summary

If an open budget period exists:
- List all envelopes for that period
- For each: category name, spent/allocated, remaining, progress bar
- Zero-allocation envelopes show "Not Allocated" with inline allocate action

### Goals Display

If onboarding goals exist, display them as chips with human-readable labels.

### Empty States

- No budget period: Card with message "No Budget Period Found" and prompt to visit Budgets page
- No allocations: Message "No envelopes created yet"

> **Known issue:** Income and Expenses KPIs are all-time, not scoped to the active period. Zero-allocation envelopes require discovering the inline "Allocate" button.
> 
> **Suggested improvement:** Default income/expense KPIs to active period with toggle for "All time". Surface a prominent "set up envelopes" empty-state when allocations are uniformly zero.

---

## 12. Reports

### Income vs. Expenses Bar Chart

- X-axis: Month (format: "MMM YYYY")
- Y-axis: Amount
- Two bars per month: Income (green), Expenses (red)
- Data source: All transactions, grouped by month

### Spending by Category Pie Chart

- Segments: Each expense category with transactions
- Label: Category name and percentage
- Ordered: By amount descending
- Tooltip: Dollar amount formatted

> **Known issue:** Months sort lexicographically (e.g., "Apr 2024" before "Feb 2024"), not chronologically. No date-range filter, no budget-vs-actual comparison, no CSV export (despite original MVP requirement). Chart palette is hardcoded and doesn't adapt to dark mode or accent color.
> 
> **Suggested improvement:** Sort by actual date. Add date-range picker, category filter, and CSV export. Drive chart colors from the theme system.

---

## 13. Settings

### Appearance

- **Theme Mode Toggle:** Light / Dark
- **Accent Color Picker:** Five color options (Indigo, Blue, Green, Purple, Pink)
- Changes apply immediately and persist across sessions

### Danger Zone

**Clear All Data:**
- Destructive action requiring confirmation
- User must type "DELETE" to confirm
- Clears all: accounts, categories, transactions, budget periods, allocations, onboarding state
- After clearing, triggers app reload which returns to onboarding wizard

### About Panel

Displays:
- Product name: "Finstrel"
- Tagline: "Local-first envelope budgeting"
- Privacy note: "All data stored locally on your device"

> **Known issue:** No PIN/password protection (in original MVP scope, never built). No backup/restore (also in original MVP scope, never built). No encryption-at-rest. No data export.
> 
> **Suggested improvement:** These were always in scope and gate the "privacy-focused" claim—implement before any public release. At minimum: manual file backup/restore and a PIN-derived key for the data file.

---

## 14. Theming Requirements

### Modes

- **Light:** Full surface coverage including form inputs, cards, backgrounds
- **Dark:** Full surface coverage, default mode

### Accent Colors

Five choices affecting primary action colors throughout the app:
- Indigo (#6366f1)
- Blue (#3b82f6)
- Green (#10b981)
- Purple (#a855f7)
- Pink (#ec4899)

### Persistence

Theme mode and accent color persist across application restarts via local storage.

### Native Widget Compatibility

Date pickers and other native inputs must respect the selected theme mode.

> **Known issue:** Date inputs only work properly in dark mode via a CSS workaround (`dark:[color-scheme:dark]`). Chart colors don't react to theme or accent selection.
> 
> **Suggested improvement:** Use a unified themed input component. Expose accent and text colors as tokens consumed by the chart layer.

---

## 15. Data Model (Conceptual)

### Entities and Fields

**Account**
| Field | Semantic Type | Constraints |
|-------|--------------|-------------|
| id | identifier | auto-generated |
| name | free-text | required |
| type | enum | required |
| initialBalance | money-amount | required |
| currentBalance | money-amount | maintained by transaction mutations |

**Category**
| Field | Semantic Type | Constraints |
|-------|--------------|-------------|
| id | identifier | auto-generated |
| name | free-text | required, unique |
| type | enum (Income/Expense) | required |
| parentCategoryId | identifier | optional, references Category |

**Transaction**
| Field | Semantic Type | Constraints |
|-------|--------------|-------------|
| id | identifier | auto-generated |
| date | timestamp | required |
| amount | money-amount | required, sign must match type |
| type | enum (Income/Expense) | required |
| description | free-text | required |
| categoryId | identifier | required, references Category |
| accountId | identifier | required, references Account |
| notes | free-text | optional |
| status | enum (Cleared/Pending) | required, default Cleared |

**BudgetPeriod**
| Field | Semantic Type | Constraints |
|-------|--------------|-------------|
| id | identifier | auto-generated |
| name | free-text | required, unique |
| startDate | timestamp | required |
| endDate | timestamp | required, must be after startDate |
| status | enum (Open/Closed/Archived) | required, default Open |

**BudgetAllocation**
| Field | Semantic Type | Constraints |
|-------|--------------|-------------|
| id | identifier | auto-generated |
| budgetPeriodId | identifier | required, references BudgetPeriod |
| categoryId | identifier | required, references Category |
| allocatedAmount | money-amount | required, must be ≥ 0 |
| (composite unique) | | (budgetPeriodId, categoryId) |

**Envelope** (dormant—defined but not wired to UI)
| Field | Semantic Type | Constraints |
|-------|--------------|-------------|
| id | identifier | auto-generated |
| name | free-text | required |
| categoryId | identifier | references Category |
| budgetedAmount | money-amount | |
| budgetPeriodId | identifier | references BudgetPeriod |
| status | enum (active/paused/archived) | default active |

### Cardinalities

- Account 1—* Transaction
- Category 1—* Transaction
- Category 0..1—* Category (self-referential parent)
- BudgetPeriod 1—* BudgetAllocation
- BudgetAllocation *—1 Category
- BudgetAllocation *—1 BudgetPeriod

### Referential Integrity

- Deleting an Account cascades to delete its Transactions
- Deleting a BudgetPeriod cascades to delete its BudgetAllocations
- Deleting a Category: parent reference SET NULL on children (categories still exist); transactions and allocations referencing it are cascaded (deleted)

> **Known issue:** Money is stored as floating-point (precision risk for financial calculations). Status enums aren't centralized—"Open/Closed/Archived" vs "active/paused/archived" coexist.
> 
> **Suggested improvement:** Specify money as fixed-point decimal with at least 4 decimal places. Standardize enum casing (recommend PascalCase).

---

## 16. Validation Rules

| Entity | Field | Rule | Error Guidance |
|--------|-------|------|----------------|
| Account | name | Required, non-empty | "Account name is required" |
| Account | type | Must be valid enum value | "Invalid account type" |
| Account | initialBalance | Must be numeric | "Initial balance must be a number" |
| Category | name | Required, non-empty, unique | "Category name is required" / "Category name already exists" |
| Category | type | Must be "Income" or "Expense" | "Invalid category type" |
| Transaction | date | Required, valid date format | "Invalid date format" |
| Transaction | amount | Required, sign must match type | "Amount sign does not match transaction type" |
| Transaction | type | Must be "Income" or "Expense" | "Invalid transaction type" |
| Transaction | categoryId | Must reference existing category | "Category not found" |
| Transaction | accountId | Must reference existing account | "Account not found" |
| Transaction | status | Must be "Cleared" or "Pending" | "Invalid status" |
| BudgetPeriod | name | Required, non-empty, unique | "Budget period name is required" / "Name already exists" |
| BudgetPeriod | startDate | Required, valid date | "Invalid start date format" |
| BudgetPeriod | endDate | Required, valid date, after startDate | "End date must be after start date" |
| BudgetPeriod | status | Must be "Open", "Closed", or "Archived" | "Invalid budget period status" |
| BudgetPeriod | (transition) | Closing/archiving requires ≥1 allocation | "Budget period must have at least one envelope" |
| BudgetAllocation | budgetPeriodId | Must be positive, reference existing period | "Invalid budget period ID" |
| BudgetAllocation | categoryId | Must be positive, reference existing category | "Invalid category ID" |
| BudgetAllocation | allocatedAmount | Must be numeric, ≥ 0 | "Allocated amount cannot be negative" |
| BudgetAllocation | (uniqueness) | (periodId, categoryId) must be unique | "Category already allocated in this period" |

---

## 17. Cross-Cutting Requirements

### Atomicity

Any operation that mutates two related rows (e.g., insert transaction + update account balance) must be all-or-nothing. If any step fails, the entire operation rolls back.

### Consistency

Status transitions must enforce documented preconditions (e.g., cannot close an empty budget period).

### Accessibility

- Color must not be the sole signal for status (budget progress, transaction direction)
- Keyboard navigation through forms and lists
- Sufficient color contrast in all themes

### Performance Targets

- Dashboard loads ≤ 2 seconds for up to 50,000 transactions
- Transaction insert is near-instant
- Report generation for 1-year range completes within a few seconds

### Privacy

- All data stored locally—no outbound network calls
- No telemetry, analytics, or crash reporting

### Platforms

- Windows (primary)
- macOS
- Linux

---

## 18. Audit & Error Handling

### Audit Requirements (Not Implemented)

- Local audit log of create/update/delete events
- Fields: entity type, entity ID, timestamp, summary of change

### Error Handling

- Errors must not crash the application
- User feedback via non-blocking notifications or inline error messages
- Input validation with clear messaging on all form fields

> **Known issue:** Audit log table is described in the original MVP spec but not implemented. Several error paths use blocking `alert()` dialogs.
> 
> **Suggested improvement:** Implement the audit table on every mutation. Replace blocking alerts with toast/snackbar notifications.

---

## 19. Out-of-Scope (Deferred)

The following items from the original MVP spec remain unimplemented:

| Feature | Notes |
|---------|-------|
| PIN/password protection | Defined in spec, never built |
| Encryption at rest | Defined in spec, never built |
| Manual backup/restore | Defined in spec, never built |
| CSV report export | Defined in spec, never built |
| Budget threshold alerts | Defined in spec, never built |
| Transaction edit/delete | Partially implied, not built |
| Transaction filtering/search | Not built |
| Custom report date range filters | Not built |
| Drill-down from charts to transactions | Not built |
| Spending trend comparison across periods | Not built |

### Post-MVP Features (from original spec)

- Multi-user/household management
- Recurring transactions
- Bulk import (CSV, OFX, QIF)
- Split transactions
- Inter-account transfers
- Cash flow forecasting
- Savings/debt goals
- Investment tracking
- Bank API integration (opt-in)
- Multi-currency support
- Cloud sync (self-hosted)

---

## 20. Verification Checklist

A re-implementer can use this checklist to confirm functional parity:

- [ ] **Onboarding completes and seeds correctly:** After completing the 4-step wizard, a budget period for the current month exists with one allocation per selected category (all at $0.00)
- [ ] **Transaction affects balance atomically:** Adding an expense transaction decreases the account balance AND the envelope remaining by the same amount in a single operation
- [ ] **Empty period cannot close:** Attempting to set status to "Closed" or "Archived" on a period with zero allocations returns an error
- [ ] **Account deletion cascades:** Deleting an account deletes all its transactions
- [ ] **Category uniqueness enforced:** Creating a category with an existing name fails
- [ ] **Allocation uniqueness enforced:** Creating a second allocation for the same (period, category) fails
- [ ] **Theme persists:** Setting theme to Dark and accent to Pink, then restarting the app, retains both settings
- [ ] **Clear all data resets to onboarding:** After typing DELETE and confirming, the app reloads to the welcome screen with no data
- [ ] **Progress bar colors:** <80% = green, 80-100% = yellow, >100% = red
- [ ] **Transaction ordering:** Transactions list shows newest first
- [ ] **Date validation:** Budget period with end date before start date is rejected

---

## Reference Implementation Notes

The current implementation uses:
- **Backend:** Go with Wails framework
- **Frontend:** React with TypeScript, Tailwind CSS, shadcn/ui components
- **Data Store:** SQLite with foreign key constraints enabled
- **Charts:** Recharts library

This information is provided for historical reference only. The specification above is intentionally technology-agnostic.

---

*Document generated from codebase analysis. Last verified against commit history through 2026-04-26.*
