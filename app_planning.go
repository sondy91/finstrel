package main

import (
	"finstrel/internal/bankfeed"
	"finstrel/internal/database"
	"finstrel/internal/models"
	"finstrel/internal/schedule"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

func (a *App) GetIncomeSchedules() ([]models.IncomeSchedule, error) {
	return database.GetIncomeSchedules()
}
func validPlannedAmount(name string, amount float64) error {
	if strings.TrimSpace(name) == "" || amount < 0 || math.IsNaN(amount) || math.IsInf(amount, 0) {
		return fmt.Errorf("enter a name and a finite, non-negative amount")
	}
	return nil
}
func (a *App) SaveIncomeSchedule(i models.IncomeSchedule) (models.IncomeSchedule, error) {
	if i.ID < 0 {
		return i, fmt.Errorf("invalid income schedule")
	}
	if err := validPlannedAmount(i.Name, i.Amount); err != nil {
		return i, err
	}
	if err := i.Schedule.Validate(); err != nil {
		return i, err
	}
	return database.SaveIncomeSchedule(i)
}
func (a *App) SaveBillSchedule(b models.Bill) (models.Bill, error) {
	if b.ID < 0 || b.CategoryID <= 0 {
		return b, fmt.Errorf("choose an expense category")
	}
	if err := validPlannedAmount(b.Name, b.Amount); err != nil {
		return b, err
	}
	if err := b.Schedule.Validate(); err != nil {
		return b, err
	}
	cats, err := database.GetCategories()
	if err != nil {
		return b, err
	}
	valid := false
	for _, c := range cats {
		if c.ID == b.CategoryID && c.Type == "Expense" {
			valid = true
		}
	}
	if !valid {
		return b, fmt.Errorf("choose an expense category")
	}
	return database.SaveBillSchedule(b)
}
func (a *App) GetPlanningCalendar(from, to string) ([]models.CalendarEvent, error) {
	start, err := time.Parse(schedule.Layout, from)
	if err != nil {
		return nil, err
	}
	end, err := time.Parse(schedule.Layout, to)
	if err != nil || end.Before(start) || end.Sub(start) > 366*24*time.Hour {
		return nil, fmt.Errorf("choose a calendar range of one year or less")
	}
	return database.GetPlanningCalendar(from, to)
}

// Inclusive budget dates; semi-monthly budgets run 1–15 and 16–month-end.
func (a *App) PreviewBudgetWindow(start, cadence string) (models.BudgetWindow, error) {
	d, err := time.Parse(schedule.Layout, start)
	if err != nil {
		return models.BudgetWindow{}, err
	}
	if cadence == "monthly" && d.Day() != 1 {
		return models.BudgetWindow{}, fmt.Errorf("monthly budgets start on the 1st; use custom dates for other boundaries")
	}
	rule := schedule.Rule{Cadence: cadence, AnchorDate: start}
	if cadence == "semimonthly" {
		if d.Day() != 1 && d.Day() != 16 {
			return models.BudgetWindow{}, fmt.Errorf("semi-monthly budgets start on the 1st or 16th; use custom dates for other boundaries")
		}
		rule.AnchorDate = time.Date(d.Year(), d.Month(), 1, 0, 0, 0, 0, time.UTC).Format(schedule.Layout)
		rule.SecondDay = 16
	}
	dates, err := schedule.Dates(rule, d.AddDate(0, 0, 1).Format(schedule.Layout), d.AddDate(0, 3, 1).Format(schedule.Layout))
	if err != nil {
		return models.BudgetWindow{}, err
	}
	if len(dates) == 0 {
		return models.BudgetWindow{}, fmt.Errorf("no next period for this frequency")
	}
	next, _ := time.Parse(schedule.Layout, dates[0])
	return models.BudgetWindow{Start: start, End: next.AddDate(0, 0, -1).Format(schedule.Layout)}, nil
}

// Review reads imported snapshots only. It does not sync, post transactions,
// infer reconciliation, or claim that available history covers the whole period.
func (a *App) GetBudgetReview(periodID int64) (models.BudgetReview, error) {
	return reviewBudget(periodID, a.GetBankFeedView)
}

func reviewBudget(periodID int64, readFeeds func() (bankfeed.View, error)) (models.BudgetReview, error) {
	result := models.BudgetReview{Imported: []models.ReviewTransaction{}, SpentByCategory: map[int64]float64{}, IncomeByCategory: map[int64]float64{}}
	periods, err := database.GetBudgetPeriods()
	if err != nil {
		return result, err
	}
	var period *models.BudgetPeriod
	for i := range periods {
		if periods[i].ID == periodID {
			period = &periods[i]
			break
		}
	}
	if period == nil {
		return result, fmt.Errorf("budget period not found")
	}
	start, end := period.StartDate.Format(schedule.Layout), period.EndDate.Format(schedule.Layout)
	incomes, err := database.GetIncomeSchedules()
	if err != nil {
		return result, err
	}
	for _, income := range incomes {
		if !income.Active {
			continue
		}
		result.ActiveIncomeSchedules++
		for chunkStart := period.StartDate; !chunkStart.After(period.EndDate); {
			chunkEnd := chunkStart.AddDate(5, 0, -1)
			if chunkEnd.After(period.EndDate) {
				chunkEnd = period.EndDate
			}
			dates, err := schedule.Dates(income.Schedule, chunkStart.Format(schedule.Layout), chunkEnd.Format(schedule.Layout))
			if err != nil {
				return result, fmt.Errorf("cannot calculate income schedule: %w", err)
			}
			result.ExpectedScheduledIncome += float64(len(dates)) * income.Amount
			chunkStart = chunkEnd.AddDate(0, 0, 1)
		}
	}
	txs, err := database.GetTransactions()
	if err != nil {
		return result, err
	}
	for _, tx := range txs {
		d := tx.Date.Format(schedule.Layout)
		if d < start || d > end {
			continue
		}
		result.ManualCount++
		if tx.Status == "Pending" {
			result.ManualPending++
		}
		if tx.Type == "Expense" {
			result.ManualExpenses += math.Abs(tx.Amount)
			result.SpentByCategory[tx.CategoryID] += math.Abs(tx.Amount)
		}
		if tx.Type == "Income" {
			result.IncomeByCategory[tx.CategoryID] += math.Abs(tx.Amount)
		}
	}
	allocations, err := database.GetBudgetAllocationsByBudgetPeriodID(periodID)
	if err != nil {
		return result, err
	}
	categories, err := database.GetCategories()
	if err != nil {
		return result, err
	}
	for _, v := range allocations {
		for _, c := range categories {
			if c.ID == v.CategoryID && c.Type == "Expense" {
				result.PlannedExpenses += v.AllocatedAmount
			}
		}
	}
	feeds, err := readFeeds()
	if err != nil {
		result.BankNotice = "Imported bank history could not be opened. Review it in Accounts before closing."
		return result, nil
	}
	result.Environment = feeds.Environment
	result.PossibleBankOverlap = len(feeds.Items) > 0 && len(feeds.ArchivedItems) > 0
	result.BankNotice = "Available bank history may be incomplete. Manual entries and bank transactions may overlap."
	for _, item := range append(feeds.Items, feeds.ArchivedItems...) {
		for _, tx := range item.Transactions {
			if tx.Date < start || tx.Date > end {
				continue
			}
			result.ImportedCount++
			if tx.Currency != "USD" && !tx.ExcludeFromBudget {
				result.UnsupportedCurrencyCount++
			}
			found := false
			for _, category := range categories {
				if category.ID == tx.BudgetCategoryID {
					found = true
					if category.Type == "Expense" && tx.Currency == "USD" && !tx.ExcludeFromBudget {
						result.SpentByCategory[category.ID] -= tx.Amount
					}
					if category.Type == "Income" && tx.Currency == "USD" && !tx.ExcludeFromBudget {
						result.IncomeByCategory[category.ID] += tx.Amount
					}
					break
				}
			}
			if !found && !tx.ExcludeFromBudget {
				result.UncategorizedCount++
			}
			if tx.Pending {
				result.ImportedPending++
			}
			if tx.Amount < 0 && tx.Currency == "USD" {
				result.ImportedExpensesUSD -= tx.Amount
			}
			result.Imported = append(result.Imported, models.ReviewTransaction{Date: tx.Date, Institution: item.Institution, Description: tx.Description, Category: tx.Category, Currency: tx.Currency, Amount: tx.Amount, Pending: tx.Pending})
		}
	}
	sort.SliceStable(result.Imported, func(i, j int) bool { return result.Imported[i].Date > result.Imported[j].Date })
	if len(result.Imported) > 100 {
		result.Imported = result.Imported[:100]
	}
	return result, nil
}
