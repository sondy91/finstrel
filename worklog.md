# Finstrel Development Worklog

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
