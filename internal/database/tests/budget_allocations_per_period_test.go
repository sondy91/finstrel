package tests

import (
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"finstrel/internal/database"
	"finstrel/internal/models"
)

func setupTempDB(t *testing.T) func() {
	t.Helper()
	tmpDir, err := os.MkdirTemp("", "vm-dbtest-*")
	require.NoError(t, err)
	prevDir, err := os.Getwd()
	require.NoError(t, err)
	require.NoError(t, os.Chdir(tmpDir))
	require.NoError(t, database.InitDB())
	return func() {
		database.CloseDB()
		_ = os.Chdir(prevDir)
		_ = os.RemoveAll(tmpDir)
	}
}

func seedPeriod(t *testing.T, name string) models.BudgetPeriod {
	t.Helper()
	p := models.BudgetPeriod{
		Name:      name,
		StartDate: time.Now().AddDate(0, 0, -1),
		EndDate:   time.Now().AddDate(0, 0, 30),
		Status:    "Open",
	}
	created, err := database.AddBudgetPeriod(p)
	require.NoError(t, err)
	return created
}

func seedCategory(t *testing.T, name, ctype string) models.Category {
	t.Helper()
	c := models.Category{Name: name, Type: ctype}
	created, err := database.AddCategory(c)
	require.NoError(t, err)
	return created
}

func seedAllocation(t *testing.T, periodID, categoryID int64, amt float64) models.BudgetAllocation {
	t.Helper()
	alloc := models.BudgetAllocation{
		BudgetPeriodID:  periodID,
		CategoryID:      categoryID,
		AllocatedAmount: amt,
	}
	created, err := database.AddBudgetAllocation(alloc)
	require.NoError(t, err)
	return created
}

func TestGetBudgetAllocationsByBudgetPeriodID_Table(t *testing.T) {
	cleanup := setupTempDB(t)
	defer cleanup()

	period1 := seedPeriod(t, "P1")
	period2 := seedPeriod(t, "P2")

	catFood := seedCategory(t, "Groceries", "Expense")
	catEnt := seedCategory(t, "Entertainment", "Expense")

	seedAllocation(t, period1.ID, catFood.ID, 200)
	seedAllocation(t, period1.ID, catEnt.ID, 100)
	// No allocations for period2

	tests := []struct {
		name    string
		period  int64
		expectN int
		expectErr bool
	}{
		{ name: "happy_path_period1", period: period1.ID, expectN: 2 },
		{ name: "empty_period2", period: period2.ID, expectN: 0 },
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			allocs, err := database.GetBudgetAllocationsByBudgetPeriodID(tc.period)
			require.NoError(t, err)
			require.Len(t, allocs, tc.expectN)
		})
	}
}

func TestGetBudgetAllocationsByBudgetPeriodID_DBError(t *testing.T) {
	cleanup := setupTempDB(t)
	defer cleanup()

	p := seedPeriod(t, "Perr")
	// Close DB to simulate error
	database.CloseDB()

	_, err := database.GetBudgetAllocationsByBudgetPeriodID(p.ID)
	require.Error(t, err)
}
