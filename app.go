package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
	"vestramaximus/internal/bankfeed"
	"vestramaximus/internal/database"
	"vestramaximus/internal/models"
)

// App struct
type App struct {
	ctx       context.Context
	bankMu    sync.Mutex
	bankFeeds *bankfeed.Service
}

// UpdateBudgetPeriodStatus updates a budget period's status.
// When closing or archiving, it enforces that the period has at least one envelope (allocation).
func (a *App) UpdateBudgetPeriodStatus(periodID int64, status string) error {
	log.Printf("Received UpdateBudgetPeriodStatus call: PeriodID=%d, Status=%s", periodID, status)
	if periodID <= 0 {
		return fmt.Errorf("invalid budget period ID")
	}
	if err := validateBudgetPeriodStatus(status); err != nil {
		return err
	}
	if err := ensureHasEnvelopesForStatus(periodID, status); err != nil {
		return err
	}
	if err := database.UpdateBudgetPeriodStatus(periodID, status); err != nil {
		log.Printf("Error updating budget period %d status to %s: %v", periodID, status, err)
		return fmt.Errorf("failed to update budget period status: %w", err)
	}
	return nil
}

func validateBudgetPeriodStatus(status string) error {
	switch status {
	case "Open", "Closed", "Archived":
		return nil
	default:
		return fmt.Errorf("invalid budget period status: %s", status)
	}
}

func ensureHasEnvelopesForStatus(periodID int64, status string) error {
	if status != "Closed" && status != "Archived" {
		return nil
	}
	cnt, err := database.CountBudgetAllocations(periodID)
	if err != nil {
		log.Printf("Error counting allocations for period %d: %v", periodID, err)
		return fmt.Errorf("failed to validate budget period envelopes: %w", err)
	}
	if cnt == 0 {
		return fmt.Errorf("budget period must have at least one envelope to set status %s", status)
	}
	return nil
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	err := database.InitDB()
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
}

// shutdown is called when the app terminates.
func (a *App) shutdown(ctx context.Context) {
	log.Println("App shutting down...")
	database.CloseDB()
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// AddAccount adds a new financial account.
// It receives the account data (without ID) from the frontend,
// calls the database function, and returns the created account (with ID).
func (a *App) AddAccount(name string, accountType string, initialBalance float64) (models.Account, error) {
	log.Printf("Received AddAccount call: Name=%s, Type=%s, Balance=%.2f", name, accountType, initialBalance)
	newAccount := models.Account{
		Name:              name,
		Type:              accountType,
		InitialBalance:    initialBalance,
		CurrentBalance:    initialBalance, // Current balance starts same as initial
		IncludeInCashFlow: true,
	}
	createdAccount, err := database.AddAccount(newAccount)
	if err != nil {
		log.Printf("Error calling database.AddAccount: %v", err)
		// Return the error to the frontend
		return models.Account{}, fmt.Errorf("failed to add account: %w", err)
	}
	return createdAccount, nil
}

// UpdateAccountCashFlowInclusion marks whether an account is spendable cash for forecasts.
func (a *App) UpdateAccountCashFlowInclusion(id int64, include bool) error {
	if id <= 0 {
		return fmt.Errorf("invalid account ID")
	}
	if err := database.UpdateAccountCashFlowInclusion(id, include); err != nil {
		return fmt.Errorf("failed to update account cash-flow inclusion: %w", err)
	}
	return nil
}

// GetAccounts retrieves all financial accounts.
// Called by the frontend to populate account lists.
func (a *App) GetAccounts() ([]models.Account, error) {
	log.Println("Received GetAccounts call")
	accounts, err := database.GetAccounts()
	if err != nil {
		log.Printf("Error calling database.GetAccounts: %v", err)
		// Return the error to the frontend
		return nil, fmt.Errorf("failed to retrieve accounts: %w", err)
	}
	return accounts, nil
}

// DeleteAccount deletes a financial account.
func (a *App) DeleteAccount(id int64) error {
	log.Printf("Received DeleteAccount call: ID=%d", id)
	if id <= 0 {
		return fmt.Errorf("invalid account ID")
	}
	err := database.DeleteAccount(id)
	if err != nil {
		log.Printf("Error calling database.DeleteAccount for ID %d: %v", id, err)
		return fmt.Errorf("failed to delete account: %w", err)
	}
	return nil
}

// AddCategory adds a new income or expense category.
// parentCategoryID can be nil or 0 to indicate a top-level category.
func (a *App) AddCategory(name string, categoryType string, parentCategoryID *int64) (models.Category, error) {
	return a.AddCategoryWithDefault(name, categoryType, parentCategoryID, 0)
}

// AddCategoryWithDefault creates a reusable category template for future periods.
func (a *App) AddCategoryWithDefault(name string, categoryType string, parentCategoryID *int64, defaultAmount float64) (models.Category, error) {
	log.Printf("Received AddCategory call: Name=%s, Type=%s, ParentID=%v", name, categoryType, parentCategoryID)
	// Basic validation
	if categoryType != "Income" && categoryType != "Expense" {
		return models.Category{}, fmt.Errorf("invalid category type: %s", categoryType)
	}
	if name == "" {
		return models.Category{}, fmt.Errorf("category name cannot be empty")
	}
	if defaultAmount < 0 {
		return models.Category{}, fmt.Errorf("category default amount cannot be negative")
	}

	newCategory := models.Category{
		Name:             name,
		Type:             categoryType,
		ParentCategoryID: parentCategoryID, // Pass the pointer directly
		DefaultAmount:    defaultAmount,
	}

	createdCategory, err := database.AddCategory(newCategory)
	if err != nil {
		log.Printf("Error calling database.AddCategory: %v", err)
		// Consider checking for specific DB errors like UNIQUE constraint violation
		return models.Category{}, fmt.Errorf("failed to add category: %w", err)
	}
	return createdCategory, nil
}

func (a *App) UpdateCategoryDefaultAmount(id int64, amount float64) error {
	if id <= 0 || amount < 0 {
		return fmt.Errorf("invalid category default amount")
	}
	if err := database.UpdateCategoryDefaultAmount(id, amount); err != nil {
		return fmt.Errorf("failed to update category default amount: %w", err)
	}
	return nil
}

func (a *App) UpdateCategory(id int64, name string, categoryType string, parentCategoryID *int64, defaultAmount float64) (models.Category, error) {
	if id <= 0 || strings.TrimSpace(name) == "" || defaultAmount < 0 {
		return models.Category{}, fmt.Errorf("invalid category details")
	}
	if categoryType != "Income" && categoryType != "Expense" {
		return models.Category{}, fmt.Errorf("invalid category type: %s", categoryType)
	}
	if parentCategoryID != nil && *parentCategoryID == id {
		return models.Category{}, fmt.Errorf("a category cannot be its own parent")
	}
	updated, err := database.UpdateCategory(models.Category{ID: id, Name: name, Type: categoryType, ParentCategoryID: parentCategoryID, DefaultAmount: defaultAmount})
	if err != nil {
		return models.Category{}, fmt.Errorf("failed to update category: %w", err)
	}
	return updated, nil
}

// DeleteCategory deletes an income or expense category.
func (a *App) DeleteCategory(id int64) error {
	log.Printf("Received DeleteCategory call: ID=%d", id)
	if id <= 0 {
		return fmt.Errorf("invalid category ID")
	}
	err := database.DeleteCategory(id)
	if err != nil {
		log.Printf("Error calling database.DeleteCategory for ID %d: %v", id, err)
		if strings.Contains(err.Error(), "FOREIGN KEY constraint failed") {
			return fmt.Errorf("cannot delete category: it is still used by one or more transactions")
		}
		return fmt.Errorf("failed to delete category: %w", err)
	}
	return nil
}

// GetCategories retrieves all categories.
func (a *App) GetCategories() ([]models.Category, error) {
	log.Println("Received GetCategories call")
	categories, err := database.GetCategories()
	if err != nil {
		log.Printf("Error calling database.GetCategories: %v", err)
		return nil, fmt.Errorf("failed to retrieve categories: %w", err)
	}
	return categories, nil
}

// AddTransaction adds a new transaction and updates the relevant account balance.
// dateString should be in a recognizable format, e.g., RFC3339 or "YYYY-MM-DD".
// We'll parse it and store consistently in the DB.
func (a *App) AddTransaction(
	dateString string,
	amount float64,
	transactionType string, // "Income" or "Expense"
	description string,
	categoryID int64,
	accountID int64,
	notes string,
	status string,
) (models.Transaction, error) {

	log.Printf("Received AddTransaction call: Date=%s, Amount=%.2f, Type=%s, Desc=%s, CatID=%d, AccID=%d, Status=%s",
		dateString, amount, transactionType, description, categoryID, accountID, status)

	// Validate Transaction Type
	if transactionType != "Income" && transactionType != "Expense" {
		return models.Transaction{}, fmt.Errorf("invalid transaction type: %s", transactionType)
	}
	// Ensure amount sign matches type (optional but good practice)
	if (transactionType == "Income" && amount < 0) || (transactionType == "Expense" && amount > 0) {
		// Or automatically flip the sign based on type? For now, enforce consistency.
		return models.Transaction{}, fmt.Errorf("amount sign does not match transaction type '%s'", transactionType)
	}
	if status == "" { // Default status if needed
		status = "Cleared"
	} else if status != "Cleared" && status != "Pending" {
		return models.Transaction{}, fmt.Errorf("invalid status: %s", status)
	}

	// Parse the date string. Wails often sends dates in RFC3339 format (like JS Date.toISOString())
	// Or it might be simpler like "YYYY-MM-DD". Let's try RFC3339 first.
	parsedDate, err := time.Parse(time.RFC3339, dateString)
	if err != nil {
		// Fallback: try parsing as YYYY-MM-DD if RFC3339 fails
		parsedDate, err = time.Parse("2006-01-02", dateString)
		if err != nil {
			log.Printf("Error parsing date string '%s': %v", dateString, err)
			return models.Transaction{}, fmt.Errorf("invalid date format: %s", dateString)
		}
	}

	newTransaction := models.Transaction{
		Date:        parsedDate,
		Amount:      amount, // Store amount as received (positive income, negative expense)
		Type:        transactionType,
		Description: description,
		CategoryID:  categoryID,
		AccountID:   accountID,
		Notes:       notes,
		Status:      status,
	}

	createdTransaction, err := database.AddTransaction(newTransaction)
	if err != nil {
		log.Printf("Error calling database.AddTransaction: %v", err)
		return models.Transaction{}, fmt.Errorf("failed to add transaction: %w", err)
	}
	return createdTransaction, nil
}

// GetTransactions retrieves all transactions.
func (a *App) GetTransactions() ([]models.Transaction, error) {
	log.Println("Received GetTransactions call")
	transactions, err := database.GetTransactions()
	if err != nil {
		log.Printf("Error calling database.GetTransactions: %v", err)
		return nil, fmt.Errorf("failed to retrieve transactions: %w", err)
	}
	// Note: The models.Transaction struct has Date as time.Time. Wails should handle
	// the automatic JSON marshalling to a string format (likely RFC3339) for the frontend.
	return transactions, nil
}

func (a *App) AddBill(name string, amount float64, categoryID int64, dueDay int, accountID *int64, active bool) (models.Bill, error) {
	if strings.TrimSpace(name) == "" {
		return models.Bill{}, fmt.Errorf("bill name cannot be empty")
	}
	if amount < 0 || categoryID <= 0 || dueDay < 1 || dueDay > 31 {
		return models.Bill{}, fmt.Errorf("invalid bill details")
	}
	return database.AddBill(models.Bill{Name: name, Amount: amount, CategoryID: categoryID, DueDay: dueDay, AccountID: accountID, Active: active})
}

func (a *App) GetBills() ([]models.Bill, error) { return database.GetBills() }

func (a *App) UpdateBill(id int64, name string, amount float64, categoryID int64, dueDay int, accountID *int64, active bool) (models.Bill, error) {
	if id <= 0 || strings.TrimSpace(name) == "" || amount < 0 || categoryID <= 0 || dueDay < 1 || dueDay > 31 {
		return models.Bill{}, fmt.Errorf("invalid bill details")
	}
	return database.UpdateBill(models.Bill{ID: id, Name: name, Amount: amount, CategoryID: categoryID, DueDay: dueDay, AccountID: accountID, Active: active})
}

func (a *App) DeleteBill(id int64) error {
	if id <= 0 {
		return fmt.Errorf("invalid bill ID")
	}
	return database.DeleteBill(id)
}

func (a *App) GetCashFlowSettings() (models.CashFlowSettings, error) {
	return database.GetCashFlowSettings()
}

// UpdateCashFlowSettings takes an empty payday to clear it. It is separate from
// budget periods because a planning period is not inherently a payroll cycle.
func (a *App) UpdateCashFlowSettings(nextPaycheckDate string, desiredCashBuffer float64) error {
	if desiredCashBuffer < 0 {
		return fmt.Errorf("desired cash buffer cannot be negative")
	}
	settings := models.CashFlowSettings{DesiredCashBuffer: desiredCashBuffer}
	if nextPaycheckDate != "" {
		parsed, err := time.Parse("2006-01-02", nextPaycheckDate)
		if err != nil {
			return fmt.Errorf("invalid next paycheck date: %w", err)
		}
		settings.NextPaycheckDate = &parsed
	}
	return database.UpdateCashFlowSettings(settings)
}

func (a *App) GetCashFlowSummary() (models.CashFlowSummary, error) {
	return database.GetCashFlowSummary(time.Now())
}

// AddBudgetPeriod adds a new budget period.
// startDateString and endDateString should be in a recognizable format (e.g., RFC3339 or "YYYY-MM-DD").
func (a *App) AddBudgetPeriod(name string, startDateString string, endDateString string, status string) (models.BudgetPeriod, error) {
	log.Printf("Received AddBudgetPeriod call: Name=%s, StartDate=%s, EndDate=%s, Status=%s", name, startDateString, endDateString, status)

	if name == "" {
		return models.BudgetPeriod{}, fmt.Errorf("budget period name cannot be empty")
	}
	if status == "" { // Default status if not provided or handle validation
		status = "Open" // As per DB schema default
	} else if status != "Open" && status != "Closed" && status != "Archived" { // Validate against known statuses
		return models.BudgetPeriod{}, fmt.Errorf("invalid budget period status: %s", status)
	}

	parsedStartDate, err := time.Parse(time.RFC3339, startDateString)
	if err != nil {
		parsedStartDate, err = time.Parse("2006-01-02", startDateString) // Fallback to YYYY-MM-DD
		if err != nil {
			log.Printf("Error parsing start date string '%s': %v", startDateString, err)
			return models.BudgetPeriod{}, fmt.Errorf("invalid start date format: %s", startDateString)
		}
	}

	parsedEndDate, err := time.Parse(time.RFC3339, endDateString)
	if err != nil {
		parsedEndDate, err = time.Parse("2006-01-02", endDateString) // Fallback to YYYY-MM-DD
		if err != nil {
			log.Printf("Error parsing end date string '%s': %v", endDateString, err)
			return models.BudgetPeriod{}, fmt.Errorf("invalid end date format: %s", endDateString)
		}
	}

	if !parsedEndDate.After(parsedStartDate) {
		return models.BudgetPeriod{}, fmt.Errorf("end date must be after start date")
	}

	newPeriod := models.BudgetPeriod{
		Name:      name,
		StartDate: parsedStartDate,
		EndDate:   parsedEndDate,
		Status:    status,
	}

	createdPeriod, err := database.AddBudgetPeriod(newPeriod)
	if err != nil {
		log.Printf("Error calling database.AddBudgetPeriod: %v", err)
		return models.BudgetPeriod{}, fmt.Errorf("failed to add budget period: %w", err)
	}
	return createdPeriod, nil
}

func (a *App) PopulateBudgetPeriodFromDefaults(periodID int64) error {
	if periodID <= 0 {
		return fmt.Errorf("invalid budget period ID")
	}
	if err := database.PopulateBudgetPeriodFromDefaults(periodID); err != nil {
		return fmt.Errorf("failed to populate budget period defaults: %w", err)
	}
	return nil
}

// CloseAndCreateBudgetPeriod closes the selected open period and starts a new,
// editable period from category defaults as one database operation.
func (a *App) CloseAndCreateBudgetPeriod(previousPeriodID int64, name string, startDateString string, endDateString string) (models.BudgetPeriod, error) {
	if previousPeriodID <= 0 || strings.TrimSpace(name) == "" {
		return models.BudgetPeriod{}, fmt.Errorf("invalid next budget period")
	}
	start, err := parseBudgetPeriodDate(startDateString)
	if err != nil {
		return models.BudgetPeriod{}, err
	}
	end, err := parseBudgetPeriodDate(endDateString)
	if err != nil {
		return models.BudgetPeriod{}, err
	}
	if !end.After(start) {
		return models.BudgetPeriod{}, fmt.Errorf("end date must be after start date")
	}
	return database.CloseAndAddBudgetPeriod(previousPeriodID, models.BudgetPeriod{Name: name, StartDate: start, EndDate: end, Status: "Open"})
}

func parseBudgetPeriodDate(value string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339, value)
	if err == nil {
		return parsed, nil
	}
	parsed, err = time.Parse("2006-01-02", value)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid budget period date: %s", value)
	}
	return parsed, nil
}

// UpdateBudgetPeriod updates an existing budget period.
func (a *App) UpdateBudgetPeriod(id int64, name string, startDateString string, endDateString string) (models.BudgetPeriod, error) {
	log.Printf("Received UpdateBudgetPeriod call: ID=%d, Name=%s, StartDate=%s, EndDate=%s", id, name, startDateString, endDateString)

	if id <= 0 {
		return models.BudgetPeriod{}, fmt.Errorf("invalid budget period ID")
	}
	if name == "" {
		return models.BudgetPeriod{}, fmt.Errorf("budget period name cannot be empty")
	}

	// Parse dates
	parsedStartDate, err := time.Parse(time.RFC3339, startDateString)
	if err != nil {
		parsedStartDate, err = time.Parse("2006-01-02", startDateString) // Fallback to YYYY-MM-DD
		if err != nil {
			log.Printf("Error parsing start date string '%s': %v", startDateString, err)
			return models.BudgetPeriod{}, fmt.Errorf("invalid start date format: %s", startDateString)
		}
	}

	parsedEndDate, err := time.Parse(time.RFC3339, endDateString)
	if err != nil {
		parsedEndDate, err = time.Parse("2006-01-02", endDateString) // Fallback to YYYY-MM-DD
		if err != nil {
			log.Printf("Error parsing end date string '%s': %v", endDateString, err)
			return models.BudgetPeriod{}, fmt.Errorf("invalid end date format: %s", endDateString)
		}
	}

	if !parsedEndDate.After(parsedStartDate) {
		return models.BudgetPeriod{}, fmt.Errorf("end date must be after start date")
	}

	periodToUpdate := models.BudgetPeriod{
		ID:        id,
		Name:      name,
		StartDate: parsedStartDate,
		EndDate:   parsedEndDate,
		// Status is not updated via this method, it has its own UpdateBudgetPeriodStatus
	}

	updatedPeriod, err := database.UpdateBudgetPeriod(periodToUpdate)
	if err != nil {
		log.Printf("Error calling database.UpdateBudgetPeriod for ID %d: %v", id, err)
		return models.BudgetPeriod{}, fmt.Errorf("failed to update budget period: %w", err)
	}
	return updatedPeriod, nil
}

// GetBudgetPeriods retrieves all budget periods.
func (a *App) GetBudgetPeriods() ([]models.BudgetPeriod, error) {
	log.Println("Received GetBudgetPeriods call")
	periods, err := database.GetBudgetPeriods()
	if err != nil {
		log.Printf("Error calling database.GetBudgetPeriods: %v", err)
		return nil, fmt.Errorf("failed to retrieve budget periods: %w", err)
	}
	return periods, nil
}

// AddBudgetAllocation adds a new budget allocation.
func (a *App) AddBudgetAllocation(budgetPeriodID int64, categoryID int64, allocatedAmount float64) (models.BudgetAllocation, error) {
	log.Printf("Received AddBudgetAllocation call: PeriodID=%d, CategoryID=%d, Amount=%.2f", budgetPeriodID, categoryID, allocatedAmount)

	if budgetPeriodID <= 0 || categoryID <= 0 {
		return models.BudgetAllocation{}, fmt.Errorf("invalid budget period ID or category ID")
	}
	if allocatedAmount < 0 {
		// Or allow 0 if that makes sense for the application (e.g. zero-based budgeting placeholder)
		return models.BudgetAllocation{}, fmt.Errorf("allocated amount cannot be negative")
	}

	newAllocation := models.BudgetAllocation{
		BudgetPeriodID:  budgetPeriodID,
		CategoryID:      categoryID,
		AllocatedAmount: allocatedAmount,
	}

	createdAllocation, err := database.AddBudgetAllocation(newAllocation)
	if err != nil {
		log.Printf("Error calling database.AddBudgetAllocation: %v", err)
		return models.BudgetAllocation{}, fmt.Errorf("failed to add budget allocation: %w", err)
	}
	return createdAllocation, nil
}

// GetBudgetAllocationsByBudgetPeriodID retrieves all allocations for a given budget period.
func (a *App) GetBudgetAllocationsByBudgetPeriodID(budgetPeriodID int64) ([]models.BudgetAllocation, error) {
	log.Printf("Received GetBudgetAllocationsByBudgetPeriodID call: PeriodID=%d", budgetPeriodID)
	if budgetPeriodID <= 0 {
		return nil, fmt.Errorf("invalid budget period ID")
	}
	allocations, err := database.GetBudgetAllocationsByBudgetPeriodID(budgetPeriodID)
	if err != nil {
		log.Printf("Error calling database.GetBudgetAllocationsByBudgetPeriodID for period %d: %v", budgetPeriodID, err)
		return nil, fmt.Errorf("failed to retrieve budget allocations: %w", err)
	}
	return allocations, nil
}

// GetBudgetAllocation retrieves a specific budget allocation.
func (a *App) GetBudgetAllocation(budgetPeriodID int64, categoryID int64) (models.BudgetAllocation, error) {
	log.Printf("Received GetBudgetAllocation call: PeriodID=%d, CategoryID=%d", budgetPeriodID, categoryID)
	if budgetPeriodID <= 0 || categoryID <= 0 {
		return models.BudgetAllocation{}, fmt.Errorf("invalid budget period ID or category ID")
	}
	allocation, err := database.GetBudgetAllocation(budgetPeriodID, categoryID)
	if err != nil {
		log.Printf("Error calling database.GetBudgetAllocation for PeriodID %d, CategoryID %d: %v", budgetPeriodID, categoryID, err)
		// Check for sql.ErrNoRows and return a more specific error or empty struct with nil error if preferred by frontend
		if err.Error() == "sql: no rows in result set" { // Basic error string check; could be database.ErrNotFound if we define it
			return models.BudgetAllocation{}, fmt.Errorf("budget allocation not found")
		}
		return models.BudgetAllocation{}, fmt.Errorf("failed to retrieve budget allocation: %w", err)
	}
	return allocation, nil
}

// UpdateBudgetAllocation updates an existing budget allocation.
// It requires the ID of the allocation and the new allocatedAmount.
func (a *App) UpdateBudgetAllocation(id int64, allocatedAmount float64) (models.BudgetAllocation, error) {
	log.Printf("Received UpdateBudgetAllocation call: ID=%d, Amount=%.2f", id, allocatedAmount)
	if id <= 0 {
		return models.BudgetAllocation{}, fmt.Errorf("invalid budget allocation ID")
	}
	if allocatedAmount < 0 {
		return models.BudgetAllocation{}, fmt.Errorf("allocated amount cannot be negative")
	}

	// To update, we technically only need ID and the fields to update.
	// However, the database function might expect a full model, or we might want to fetch existing first.
	// For simplicity, assuming database.UpdateBudgetAllocation takes a model with ID and new Amount.
	// If it needed BudgetPeriodID and CategoryID, we'd have to pass them or fetch the existing allocation first.
	// Current DB function UpdateBudgetAllocation takes models.BudgetAllocation, so we must provide all fields required by it or that make sense.
	// Let's assume for now that the frontend will pass the ID and new amount, and the DB layer handles the update based on ID.
	// The current DB function is: func UpdateBudgetAllocation(alloc models.BudgetAllocation) (models.BudgetAllocation, error)
	// So we need to construct it. This means the frontend must know or send these. Or we fetch first here.
	// To keep it simple, for now, let's assume the caller of this App method knows the details, or this method should fetch them.
	// A better approach for the App method might be: UpdateBudgetAllocationAmount(id int64, newAmount float64)
	// For now, we match the DB layer which takes the full struct, but it only uses ID and AllocatedAmount for the update.
	// This means the other fields in `updatedAllocation` (BudgetPeriodID, CategoryID) would be zero if not set.
	// This is a potential issue. Let's adjust the expectation or the DB function.

	// Option 1: Fetch the existing allocation first to get other details if DB needs them (safer for general Update)
	// existingAlloc, err := database.GetBudgetAllocationByID(id) // Assumes this function exists
	// if err != nil { ... }
	// existingAlloc.AllocatedAmount = allocatedAmount
	// return database.UpdateBudgetAllocation(existingAlloc)

	// Option 2: DB function only updates amount based on ID (current implementation)
	updatedAllocation := models.BudgetAllocation{
		ID:              id,
		AllocatedAmount: allocatedAmount,
		// BudgetPeriodID and CategoryID will be zero if not provided, which is fine for the current SQL UPDATE statement.
	}

	resultAllocation, err := database.UpdateBudgetAllocation(updatedAllocation)
	if err != nil {
		log.Printf("Error calling database.UpdateBudgetAllocation for ID %d: %v", id, err)
		return models.BudgetAllocation{}, fmt.Errorf("failed to update budget allocation: %w", err)
	}
	return resultAllocation, nil
}

// DeleteBudgetAllocation deletes a budget allocation by its ID.
func (a *App) DeleteBudgetAllocation(id int64) error {
	log.Printf("Received DeleteBudgetAllocation call: ID=%d", id)
	if id <= 0 {
		return fmt.Errorf("invalid budget allocation ID")
	}
	err := database.DeleteBudgetAllocation(id)
	if err != nil {
		log.Printf("Error calling database.DeleteBudgetAllocation for ID %d: %v", id, err)
		// Check for specific errors like "not found" if the DB layer returns them distinctly
		return fmt.Errorf("failed to delete budget allocation: %w", err)
	}
	return nil
}

// ClearAllData deletes all data from the database (for development/reset purposes).
// WARNING: This is destructive and cannot be undone.
func (a *App) ClearAllData() error {
	log.Println("Received ClearAllData call - WARNING: This will delete all data")
	err := database.ClearAllData()
	if err != nil {
		log.Printf("Error clearing all data: %v", err)
		return fmt.Errorf("failed to clear all data: %w", err)
	}
	log.Println("All data cleared successfully")
	return nil
}
