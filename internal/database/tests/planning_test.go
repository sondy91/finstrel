package tests

import (
	"github.com/stretchr/testify/require"
	"testing"
	"time"
	"finstrel/internal/database"
	"finstrel/internal/models"
	"finstrel/internal/schedule"
)

func TestMixedIncomeAndFiniteBillCalendar(t *testing.T) {
	cleanup := setupTempDB(t)
	defer cleanup()
	category := seedCategory(t, "Payment plans", "Expense")
	_, err := database.AddBill(models.Bill{Name: "Legacy monthly", Amount: 50, CategoryID: category.ID, DueDay: 31, Active: true})
	require.NoError(t, err)
	bills, err := database.GetBills()
	require.NoError(t, err)
	require.Equal(t, "monthly", bills[0].Schedule.Cadence)
	_, err = database.SaveIncomeSchedule(models.IncomeSchedule{Name: "Weekly", Amount: 400, Active: true, Schedule: schedule.Rule{Cadence: "weekly", AnchorDate: "2026-10-02"}})
	require.NoError(t, err)
	_, err = database.SaveIncomeSchedule(models.IncomeSchedule{Name: "Biweekly", Amount: 1000, Active: true, Schedule: schedule.Rule{Cadence: "biweekly", AnchorDate: "2026-10-09"}})
	require.NoError(t, err)
	plan, err := database.SaveBillSchedule(models.Bill{Name: "Finite", Amount: 25, CategoryID: category.ID, Active: true, Schedule: schedule.Rule{Cadence: "biweekly", AnchorDate: "2026-10-02", EndDate: "2026-10-16"}})
	require.NoError(t, err)
	events, err := database.GetPlanningCalendar("2026-10-01", "2026-10-31")
	require.NoError(t, err)
	counts := map[string]int{}
	for _, e := range events {
		counts[e.Name]++
	}
	require.Equal(t, 5, counts["Weekly"])
	require.Equal(t, 2, counts["Biweekly"])
	require.Equal(t, 2, counts["Finite"])
	require.Equal(t, 1, counts["Legacy monthly"])
	require.NoError(t, database.DeleteBill(plan.ID))
	var rules int
	require.NoError(t, database.GetDB().QueryRow("SELECT count(*) FROM bill_recurrences").Scan(&rules))
	require.Zero(t, rules)
	// Repeated initialization preserves legacy rows and schedule identities.
	database.CloseDB()
	require.NoError(t, database.InitDB())
	bills, err = database.GetBills()
	require.NoError(t, err)
	require.Len(t, bills, 1)
	require.Equal(t, 31, bills[0].DueDay)
	incomes, err := database.GetIncomeSchedules()
	require.NoError(t, err)
	require.Len(t, incomes, 2)
	summary, err := database.GetCashFlowSummary(time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	require.Equal(t, "2026-10-09", summary.NextPaycheckDate.Format(schedule.Layout))
}
func TestForecastCountsBiweeklyBillsAndIgnoresExpiredBudget(t *testing.T) {
	cleanup := setupTempDB(t)
	defer cleanup()
	c := seedCategory(t, "Bills", "Expense")
	_, err := database.SaveBillSchedule(models.Bill{Name: "Weekly plan", Amount: 20, CategoryID: c.ID, Active: true, Schedule: schedule.Rule{Cadence: "weekly", AnchorDate: "2026-10-01"}})
	require.NoError(t, err)
	payday := time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC)
	require.NoError(t, database.UpdateCashFlowSettings(models.CashFlowSettings{NextPaycheckDate: &payday}))
	summary, err := database.GetCashFlowSummary(time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	require.Equal(t, float64(60), summary.UpcomingBills)
}
