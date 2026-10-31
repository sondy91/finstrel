package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"finstrel/internal/database"
	"finstrel/internal/models"
)

func TestApp_UpdateBudgetPeriodStatus_Table(t *testing.T) {
	cleanup := setupTempDBApp(t)
	defer cleanup()

	a := NewApp()

	// Seed periods
	pWith := models.BudgetPeriod{Name: "WithEnv", StartDate: time.Now(), EndDate: time.Now().AddDate(0, 0, 30), Status: "Open"}
	pWith, err := database.AddBudgetPeriod(pWith)
	require.NoError(t, err)

	pEmpty := models.BudgetPeriod{Name: "Empty", StartDate: time.Now(), EndDate: time.Now().AddDate(0, 0, 30), Status: "Open"}
	pEmpty, err = database.AddBudgetPeriod(pEmpty)
	require.NoError(t, err)

	// Seed allocation for pWith
	cat, err := database.AddCategory(models.Category{Name: "Groceries", Type: "Expense"})
	require.NoError(t, err)
	_, err = database.AddBudgetAllocation(models.BudgetAllocation{BudgetPeriodID: pWith.ID, CategoryID: cat.ID, AllocatedAmount: 100})
	require.NoError(t, err)

	tests := []struct{
		name string
		periodID int64
		status string
		expectErr bool
	}{
		{ name: "close_ok_when_has_envelope", periodID: pWith.ID, status: "Closed", expectErr: false },
		{ name: "close_fail_when_empty", periodID: pEmpty.ID, status: "Closed", expectErr: true },
		{ name: "invalid_status_rejected", periodID: pWith.ID, status: "Freeze", expectErr: true },
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := a.UpdateBudgetPeriodStatus(tc.periodID, tc.status)
			if tc.expectErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			// Verify DB updated
			periods, err := database.GetBudgetPeriods()
			require.NoError(t, err)
			var found *models.BudgetPeriod
			for i := range periods { if periods[i].ID == tc.periodID { found = &periods[i]; break } }
			require.NotNil(t, found)
			require.Equal(t, tc.status, found.Status)
		})
	}
}
