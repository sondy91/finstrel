# Finstrel Data Structure Map

## Overview

This document maps the complete data architecture across backend (Go), database (SQLite), and frontend (TypeScript).

---

## Core Entities & Relationships

### 1. **Account**

Represents a financial account (checking, savings, credit card, etc.)

**Backend (Go)**: `internal/models/models.go`

```go
type Account struct {
    ID             int64   `json:"id"`
    Name           string  `json:"name"`
    Type           string  `json:"type"`           // "Checking", "Savings", "Credit Card", "Loan", "Cash"
    InitialBalance float64 `json:"initialBalance"`
    CurrentBalance float64 `json:"currentBalance"`
}
```

**Database (SQLite)**: `accounts` table

```sql
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    initial_balance REAL NOT NULL,
    current_balance REAL NOT NULL
);
```

**Frontend (TypeScript)**: `wailsjs/go/models.ts`

```typescript
export class Account {
    id: number;
    name: string;
    type: string;
    initialBalance: number;
    currentBalance: number;
}
```

**Relationships**:

- `Account` → **1:N** → `Transaction` (via `accountId`)

---

### 2. **Category**

Represents income or expense categories (can be hierarchical)

**Backend (Go)**: `internal/models/models.go`

```go
type Category struct {
    ID               int64  `json:"id"`
    Name             string `json:"name"`             // "Groceries", "Entertainment", etc.
    Type             string `json:"type"`             // "Income" or "Expense"
    ParentCategoryID *int64 `json:"parentCategoryId"` // Nullable for sub-categories
}
```

**Database (SQLite)**: `categories` table

```sql
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,                    -- 'Income' or 'Expense'
    parent_category_id INTEGER,            -- Self-referencing FK for hierarchy
    FOREIGN KEY (parent_category_id) REFERENCES categories(id)
);
```

**Frontend (TypeScript)**: `wailsjs/go/models.ts`

```typescript
export class Category {
    id: number;
    name: string;
    type: string;
    parentCategoryId?: number;
}
```

**Relationships**:

- `Category` → **1:N** → `Transaction` (via `categoryId`)
- `Category` → **1:N** → `BudgetAllocation` (via `categoryId`)
- `Category` → **1:N** → `Category` (self-referencing hierarchy via `parentCategoryId`)

---

### 3. **Transaction**

Represents a single financial movement (income or expense)

**Backend (Go)**: `internal/models/models.go`

```go
type Transaction struct {
    ID          int64     `json:"id"`
    Date        time.Time `json:"date"`
    Amount      float64   `json:"amount"`      // Positive for income, negative for expense
    Type        string    `json:"type"`        // "Income" or "Expense"
    Description string    `json:"description"`
    CategoryID  int64     `json:"categoryId"`
    AccountID   int64     `json:"accountId"`
    Notes       string    `json:"notes"`
    Status      string    `json:"status"`      // "Cleared", "Pending"
}
```

**Database (SQLite)**: `transactions` table

```sql
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    notes TEXT,
    status TEXT NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

**Frontend (TypeScript)**: `wailsjs/go/models.ts`

```typescript
export class Transaction {
    id: number;
    date: any;              // time.Time serialized
    amount: number;
    type: string;
    description: string;
    categoryId: number;
    accountId: number;
    notes: string;
    status: string;
}
```

**Relationships**:

- `Transaction` → **N:1** → `Category` (via `categoryId`)
- `Transaction` → **N:1** → `Account` (via `accountId`)

---

### 4. **BudgetPeriod**

Represents a specific budget timeframe (e.g., "July 2024 Budget")

**Backend (Go)**: `internal/models/models.go`

```go
type BudgetPeriod struct {
    ID        int64     `json:"id"`
    Name      string    `json:"name"`      // "July 2024 Budget", "Q3 2024"
    StartDate time.Time `json:"startDate"`
    EndDate   time.Time `json:"endDate"`
    Status    string    `json:"status"`    // "Open", "Closed", "Archived"
}
```

**Database (SQLite)**: `budget_periods` table

```sql
CREATE TABLE budget_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL
);
```

**Frontend (TypeScript)**: `wailsjs/go/models.ts`

```typescript
export class BudgetPeriod {
    id: number;
    name: string;
    startDate: any;         // time.Time serialized
    endDate: any;
    status: string;
}
```

**Relationships**:

- `BudgetPeriod` → **1:N** → `BudgetAllocation` (via `budgetPeriodId`)

**Business Rules**:

- Must have **at least 1 envelope (BudgetAllocation)** before status can be set to "Closed" or "Archived"
- `name` must be unique

---

### 5. **BudgetAllocation** (Envelope)

Links a budget period to a category with an allocated amount (envelope budgeting)

**Backend (Go)**: `internal/models/models.go`

```go
type BudgetAllocation struct {
    ID              int64   `json:"id"`
    CategoryID      int64   `json:"categoryId"`
    AllocatedAmount float64 `json:"allocatedAmount"`
    BudgetPeriodID  int64   `json:"budgetPeriodId"`
}
```

**Database (SQLite)**: `budget_allocations` table

```sql
CREATE TABLE budget_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    budget_period_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    allocated_amount REAL NOT NULL,
    FOREIGN KEY (budget_period_id) REFERENCES budget_periods(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    UNIQUE(budget_period_id, category_id)  -- One allocation per category per period
);
```

**Frontend (TypeScript)**: `wailsjs/go/models.ts`

```typescript
export class BudgetAllocation {
    id: number;
    categoryId: number;
    allocatedAmount: number;
    budgetPeriodId: number;
}
```

**Relationships**:

- `BudgetAllocation` → **N:1** → `BudgetPeriod` (via `budgetPeriodId`)
- `BudgetAllocation` → **N:1** → `Category` (via `categoryId`)

**Business Rules**:

- **Unique constraint**: One allocation per (budget_period_id, category_id) pair
- No master "Envelope" entity; envelopes are per-period budget line items

---

## Entity Relationship Diagram

```
┌─────────────┐
│   Account   │
│  (1:N)      │
└──────┬──────┘
       │
       │ accountId
       ▼
┌─────────────────┐
│  Transaction    │◄──────┐
│                 │       │
└─────────────────┘       │ categoryId
                          │
                    ┌─────┴──────┐
                    │  Category  │
                    │  (1:N)     │
                    └─────┬──────┘
                          │
                          │ categoryId
                          ▼
                ┌──────────────────────┐
                │ BudgetAllocation     │
                │ (Envelope)           │
                └──────────┬───────────┘
                           │
                           │ budgetPeriodId
                           ▼
                    ┌──────────────┐
                    │ BudgetPeriod │
                    │  (1:N)       │
                    └──────────────┘
```

---

## Onboarding Wizard Data (Frontend Only - Not Yet Persisted)

**Current State**: Stored in React component state during wizard flow

```typescript
type OnboardingData = {
  accentColor: string;           // 'indigo', 'blue', 'green', 'purple', 'pink'
  themeMode: 'light' | 'dark';
  goals: string[];               // ['debt', 'emergency', 'savings', 'budget', 'other']
  categories: string[];          // ['groceries', 'rent', 'utilities', 'transportation', 'entertainment', 'savings']
}
```

**Storage Location**: None (ephemeral)
**Needs**:

1. Persist to `localStorage` with completion flag
2. Map `categories` array to backend `Category` entities
3. Create initial `BudgetPeriod` + `BudgetAllocation` records

---

## Data Flow: Onboarding → Initial Budget

### Phase 1 Implementation Plan

1. **Persist Onboarding Data** (localStorage)

   ```typescript
   // src/lib/onboarding.ts
   const ONBOARDING_COMPLETE_KEY = 'vestra-onboarding-complete';
   const ONBOARDING_DATA_KEY = 'vestra-onboarding-data';

   export function saveOnboardingData(data: OnboardingData): void {
     localStorage.setItem(ONBOARDING_DATA_KEY, JSON.stringify(data));
     localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
   }

   export function getOnboardingData(): OnboardingData | null {
     const raw = localStorage.getItem(ONBOARDING_DATA_KEY);
     return raw ? JSON.parse(raw) : null;
   }

   export function hasCompletedOnboarding(): boolean {
     return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
   }
   ```

2. **Seed Initial Budget** (on first app entry after onboarding)

   ```typescript
   // Pseudo-code flow
   async function seedInitialBudget(onboardingData: OnboardingData) {
     // 1. Create default budget period (current month)
     const period = await AddBudgetPeriod(
       `${monthName} ${year} Budget`,
       startOfMonth,
       endOfMonth,
       'Open'
     );

     // 2. Create categories from wizard selections
     const categoryMap = {
       groceries: 'Groceries',
       rent: 'Rent/Mortgage',
       utilities: 'Utilities',
       transportation: 'Transportation',
       entertainment: 'Entertainment',
       savings: 'Savings'
     };

     for (const catId of onboardingData.categories) {
       const category = await AddCategory(
         categoryMap[catId],
         'Expense',
         null  // No parent category
       );

       // 3. Create $0 allocation for each category
       await AddBudgetAllocation(
         period.id,
         category.id,
         0.00  // User will set amounts later
       );
     }
   }
   ```

---

## Backend API Methods (Wails Bindings)

### Account Operations

- `AddAccount(name, type, initialBalance)` → `Account`
- `GetAccounts()` → `Account[]`

### Category Operations

- `AddCategory(name, type, parentCategoryId)` → `Category`
- `GetCategories()` → `Category[]`

### Transaction Operations

- `AddTransaction(date, amount, type, description, categoryId, accountId, notes, status)` → `Transaction`
- `GetTransactions()` → `Transaction[]`

### Budget Period Operations

- `AddBudgetPeriod(name, startDate, endDate, status)` → `BudgetPeriod`
- `GetBudgetPeriods()` → `BudgetPeriod[]`
- `UpdateBudgetPeriodStatus(periodId, status)` → `error`

### Budget Allocation (Envelope) Operations

- `AddBudgetAllocation(budgetPeriodId, categoryId, allocatedAmount)` → `BudgetAllocation`
- `GetBudgetAllocationsByBudgetPeriodID(periodId)` → `BudgetAllocation[]`
- `UpdateBudgetAllocation(allocationId, allocatedAmount)` → `error`
- `DeleteBudgetAllocation(allocationId)` → `error`

---

## Next Steps (Phase 1 Implementation)

1. ✅ Create `src/lib/onboarding.ts` utility
2. ✅ Update `WelcomePage.tsx` to save data on completion
3. ✅ Update `App.tsx` to check completion flag on mount
4. ✅ Create `src/lib/seedBudget.ts` to initialize budget from wizard data
5. ✅ Add backend method: `ClearAllData()` for development reset
6. ✅ Test full onboarding → budget seeding flow

---

## Storage Summary

| Entity | Backend (Go) | Database (SQLite) | Frontend (TS) | localStorage |
|--------|-------------|-------------------|---------------|--------------|
| Account | ✅ | ✅ | ✅ | ❌ |
| Category | ✅ | ✅ | ✅ | ❌ |
| Transaction | ✅ | ✅ | ✅ | ❌ |
| BudgetPeriod | ✅ | ✅ | ✅ | ❌ |
| BudgetAllocation | ✅ | ✅ | ✅ | ❌ |
| OnboardingData | ❌ | ❌ | ✅ (ephemeral) | **Phase 1** |
| Theme/Accent | ❌ | ❌ | ✅ (ThemeProvider) | ✅ (existing) |
