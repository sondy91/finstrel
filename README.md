# Finstrel

> **A privacy-focused, local-first personal finance application.**

Finstrel is designed to replace spreadsheet-based budgeting with a streamlined, secure desktop application. Budgeting works locally without a bank connection. Optional Plaid imports retrieve bank data through Plaid and store the imported records encrypted on your device.

## 🚀 Key Features

*   **Envelope Budgeting**: Set allocations for categories and track your spending against them in real-time.
*   **Local Storage**: No app cloud sync or tracking. Imported bank feeds use an authenticated encrypted file with a key in the system credential store. The existing manual SQLite ledger is not encrypted yet.
*   **Manual Transaction Management**: Quick and easy entry for income and expenses with detailed categorization.
*   **Visual Dashboard**: Interactive charts and graphs to visualize your spending habits and budget health.
*   **Crossover Support**: Available for Windows, macOS, and Linux.
*   **Themeable**: Full support for both **Light** and **Dark** modes.

## 🛠 Tech Stack

*   **Backend**: [Go](https://go.dev/) (powered by [Wails](https://wails.io/))
*   **Frontend**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/)
*   **Database**: SQLite

## 🏁 Getting Started

### Prerequisites

*   [Go 1.21+](https://go.dev/doc/install)
*   [Node.js 18+](https://nodejs.org/en/download/)
*   [Wails CLI](https://wails.io/docs/gettingstarted/installation)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/sondy91/finstrel.git
    cd finstrel
    ```

2.  Install frontend dependencies:
    ```bash
    cd frontend
    pnpm install
    ```

3.  Run the application in development mode:
    ```bash
    wails dev
    ```

4.  Build the application for your platform:
    ```bash
    wails build
    ```

If you have some issues and are on Ubuntu 24.04, check out the [contributing](CONTRIBUTING.md) file for some helpful tips.

## 📸 Screenshots

### Setup Wizard

| Intro | Customization |
| :---: | :---: |
| ![SetupWizard](docs/screenshots/homepage-intro.png) | ![Step2 Darkmode](docs/screenshots/wizard2-customize.png) |

| Goals | Categories |
| :---: | :---: |
| ![Step 3](docs/screenshots/wizard3-goals.png) | ![Step 4](docs/screenshots/wizard4-categories.png) |

### Application Views

**Dashboard**
![Homepage](docs/screenshots/dashboard.png)

**Budgets**
![Budgets](docs/screenshots/budgets.png)

**Transactions**
![Transactions](docs/screenshots/transactions.png)

**Categories**
![Categories](docs/screenshots/categories.png)

**Accounts**
![Accounts](docs/screenshots/accounts.png)

**Settings**
![Settings](docs/screenshots/settings.png)

## 🏗 Data Model

```text
+----------------+          +--------------------+
| BudgetPeriod   |1        *| BudgetAllocation   |
|----------------|          |--------------------|
| id PK          |<--+   +--| id PK             |
| name           |   |   |  | period_id FK -----+
| start_date     |   |   |  | category_id FK     |
| end_date       |   |   |  | planned_amount     |
| status         |   |   |  +--------------------+
+----------------+   |   |
                     |   |     +----------------+
                     |   +----<| BudgetCategory |
                     |         |----------------|
                     |         | id PK          |
                     |         | name           |
                     |         | type (enum)    |
                     |         | parent_id FK?  |
                     |         +----------------+
                     |
                     |   +----------------+
                     |   +--<| Transaction    |
                         |----------------|
                         | id PK          |
                         | date           |
                         | amount (signed)|
                         | payee          |
                         | notes          |
                         | category_id FK |
                         | period_id FK   |
                         +----------------+

Backup(id PK, timestamp, filepath, status)
AuditLog(id PK, timestamp, action, entity, entity_id, summary)
```
> Note: `Transaction.period_id` is redundant but speeds up queries for “current budget.”
## Optional Plaid Sandbox connections

The Accounts page can connect US Sandbox accounts, import available bank/card transactions and balances, show supported debt terms and investments, reconnect, and revoke a connection. These imported feeds remain separate from the manual ledger and forecasts. Use **Disconnect** to revoke a bank connection and remove its local feed. Settings’ manual-budget reset does not remove bank feeds.

API calls and credentials stay in Go. The backend reads `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV` from process settings or the private `finstrel/plaid/.env` inside the operating system’s application settings directory; the project `.env` is a development fallback. Use Plaid’s official CLI, `plaid keys write --env sandbox --gitignore`, in the selected settings directory to provision keys without displaying them. Never put credentials in frontend variables or source files. On macOS, the private settings directory is `~/Library/Application Support/finstrel/plaid`. Existing data under the former name is not loaded; connect Plaid again to start fresh.

The current version uses explicit manual imports. Real-bank/Production use, OAuth-institution setup, scheduled imports, posting imported activity into envelopes, and forecasting from bank feeds remain separate follow-up work. See [PLAID_PLAN.md](PLAID_PLAN.md) for the checked scope, test evidence, and pending browser verification.
