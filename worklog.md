# Finstrel Development Worklog

## Workflow iteration — October 26, 2026

- [x] Add an in-memory practice household using the existing Budgets/Transactions screens and cached Plaid Sandbox data only. Available from Settings and the initial welcome screen, with reset and exit controls.
- [x] Allow a reviewed, closed budget to start the next period without reopening; keep existing close-and-start behavior for open budgets.
- [x] Normalize suggested successor dates to local calendar days, preserving a 14-day inclusive window.
- [ ] Next: first-budget cadence/date selection and guided mixed-pay/bill setup before full spreadsheet migration. See [practice workflow and migration priorities](docs/PRACTICE.md).

## Backlog: Local categorization and recurring-transaction detection

Added October 25, 2026. Status: planned; no implementation or model selection yet.

User decision: automate categorization and recurring detection locally, with manual corrections as a fallback. Do not purchase or enable paid Plaid add-ons for this feature, including Recurring Transactions. No hosted Jev integration.

- [ ] Map existing Plaid categories into household budget categories; retain provider category and confidence separately from the user's final category.
- [ ] Remember user-approved merchant/category rules. Explicit corrections take precedence over provider or model suggestions and survive future imports.
- [ ] Evaluate a small local model or classifier for ambiguous descriptions and category choices. Clef Lite is a user-suggested candidate to investigate, not a verified selection. Check local runtime support, license, hardware needs, accuracy, and latency before choosing a model. Do not send transaction data to a hosted model.
- [ ] Detect recurring income and expenses from imported history locally, using merchant/account identity, dates, amounts, and cadence. Support weekly, every-two-week, twice-monthly, and monthly patterns, including variable amounts and shifted posting dates.
- [ ] Present proposed recurring schedules for confirmation, then connect accepted schedules to the existing calendar and forecast. Keep inferred next payment dates distinct from confirmed due dates; support separate installment plans and finite end dates for Klarna/Affirm-style payments.
- [ ] Keep manual categorization, one-off overrides, and split transactions available. Show uncertain cases in a concise review queue instead of forcing a guess.

Acceptance conditions:

- Categorization and recurring detection run locally after import without a paid add-on or hosted inference dependency.
- Evaluate automatic decisions against representative labeled transactions; report coverage and errors, including ambiguous merchants, transfers, refunds, and multiple payment plans at one merchant.
- Corrections persist; re-importing does not duplicate transactions or erase user decisions. Pending-to-posted transitions preserve decisions where the provider supplies a reliable match.
- Recurring suggestions do not silently create expenses or alter budgets. Counting imported transactions toward budget actuals depends on reconciliation with manual entries and transfer/payment handling to prevent double counting.

## Phase 0: Setup & Project Initialization (DONE)

- [x] Install Go
- [x] Install Node.js & pnpm
- [x] Install Wails CLI
- [x] Install Platform Dependencies (`wails doctor`)
- [x] Create Wails Project (`wails init -n finstrel -t react-ts`)
- [x] Initial Run (`wails dev` / `wails dev -tags webkit2_41`)
- [x] Initialize Git Repo & Initial Commit

## Phase 1: Core Data Models & Database Setup (Go Backend) (DONE)

- [x] Define Core Go Structs (`Account`, `Category`, `Transaction`)
- [x] Setup SQLite (add driver, create `internal/database` package)
- [x] Implement DB Initialization Logic (create tables if not exist)
- [x] Basic CRUD Functions (Go) for `Account`, `Category` (Create, Read)
- [x] Basic Functions (Go) for `Transaction` (Create, Read)
- [x] Expose necessary Go functions to Frontend (Wails Binding)

## Phase 2: Basic UI Shell & Account/Category Management (React Frontend) (DONE)

- [x] Basic Layout (Sidebar, Content Area)
- [x] Account Management UI (List, Add/Edit Form) - Add done, Edit later
- [x] Connect Account UI to Go backend functions
- [x] Category Management UI (List, Add/Edit Form) - Add done, Edit later
- [x] Connect Category UI to Go backend functions

## Phase 3: Manual Transaction Entry & Listing (DONE)

- [x] Transaction Entry Form (React) - (Includes Account/Category dropdowns)
- [x] Save Transaction Logic (Go - Insert Transaction, Update Account Balance) - (Already done in Phase 1)
- [x] Bind Save Transaction function (Go -> React) - (Already done in Phase 1)
- [x] Transaction List View (React)
- [x] Backend function to retrieve transactions (Go) - (Already done in Phase 1)
- [x] Bind transaction retrieval function (Go -> React) - (Already done in Phase 1)

## Phase 4: Refactoring & Envelope Budgeting (IN PROGRESS)

### Phase 4.1: Testing Infrastructure

- [ ] Set up table-driven tests for Go backend
- [ ] Configure React Testing Library for frontend tests
- [ ] Add code coverage reporting

### Phase 4.2: Data Model Updates

- [ ] Update models to support envelope budgeting
- [ ] Add envelope-specific fields and relationships
- [ ] Implement transaction categorization rules

### Phase 4.3: Core Features

- [ ] Implement envelope creation and management
- [ ] Add allocation tracking
- [ ] Create budget period management
- [ ] Enhance transaction entry with envelope assignment

### Phase 4.4: UI/UX Updates

- [ ] Create budget overview dashboard
- [ ] Add envelope status visualization
- [ ] Implement transaction history with filtering
- [ ] Build envelope allocation interface

### Phase 4.5: Polish

- [ ] Perform cross-browser testing
- [ ] Optimize performance for large datasets
- [ ] Update documentation

## Phase 4.6: Budgeting Fundamentals

- [ ] Budget Models (Go: `BudgetPeriod`, `BudgetAllocation`)
- [ ] Budget Setup UI (React: Define periods, allocate amounts)
- [ ] Budget Backend Logic (Go: Create periods/allocations, calculate spent amounts)
- [ ] Bind budget functions (Go -> React)
- [ ] Budget Display (React: Show allocated, spent, remaining)

## Phase 5: Income & Recurring Transactions (Basic)

- [ ] Income Source Model (Go: `IncomeSource`)
- [ ] Recurring Rule Model (Go: `RecurringRule`)
- [ ] Backend Logic (Go: Create/manage sources/rules, generate basic forecast)
- [ ] UI (React: Forms for income sources, recurring expenses)

## Phase 6: Dashboard & Basic Reporting

- [ ] Dashboard Widgets (React: Total balance, Income/Expense summary)
- [ ] Spending by Category Report (React: Chart component)
- [ ] Backend Go functions for dashboard/report data aggregation
- [ ] Bind aggregation functions (Go -> React)

## Phase 7: Essential Non-Functional Requirements

- [ ] Data Encryption (Go: Encrypt/decrypt data before/after SQLite interaction)
- [ ] Basic Backup/Restore (Go & React: Functions and UI buttons)

## Phase 8: Testing, Refinement & Build

- [ ] Manual Testing (Covering MVP User Stories)
- [ ] Bug Fixing & UI Polish
- [ ] Build distributable application (`wails build`)
