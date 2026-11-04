package main

import (
	"fmt"
	"math"
	"strings"

	"finstrel/internal/database"
	"finstrel/internal/models"
)

func carryBalances(periodID int64, review models.BudgetReview) (map[int64]float64, error) {
	if strings.Contains(review.BankNotice, "could not be opened") {
		return nil, fmt.Errorf("bank history is unavailable; try again before carrying balances")
	}
	if review.UncategorizedCount > 0 || review.UnsupportedCurrencyCount > 0 {
		return nil, fmt.Errorf("categorize or exclude unbudgeted bank transactions before carrying balances")
	}
	allocations, err := database.GetBudgetAllocationsByBudgetPeriodID(periodID)
	if err != nil {
		return nil, err
	}
	categories, err := database.GetCategories()
	if err != nil {
		return nil, err
	}
	amounts := map[int64]float64{}
	for _, category := range categories {
		if category.Type != "Expense" {
			continue
		}
		value := -review.SpentByCategory[category.ID]
		for _, allocation := range allocations {
			if allocation.CategoryID == category.ID {
				value += allocation.AllocatedAmount
			}
		}
		amounts[category.ID] = math.Round(value*100) / 100
	}
	return amounts, nil
}

func (a *App) StartNextBudget(sourceID int64, name, startString, endString string) (models.BudgetPeriod, error) {
	if sourceID <= 0 || strings.TrimSpace(name) == "" {
		return models.BudgetPeriod{}, fmt.Errorf("invalid next budget")
	}
	start, err := parseBudgetPeriodDate(startString)
	if err != nil {
		return models.BudgetPeriod{}, err
	}
	end, err := parseBudgetPeriodDate(endString)
	if err != nil || !end.After(start) {
		return models.BudgetPeriod{}, fmt.Errorf("choose a valid budget date range")
	}
	previous, err := a.GetCarryStatus(sourceID)
	if err != nil {
		return models.BudgetPeriod{}, err
	}
	if previous != nil && (previous.SourceStatus != "Closed" || previous.ReviewError != "" || len(previous.Changes) > 0) {
		return models.BudgetPeriod{}, fmt.Errorf("resolve the previous budget's carry-forward before starting another budget")
	}
	review, err := a.GetBudgetReview(sourceID)
	if err != nil {
		return models.BudgetPeriod{}, err
	}
	balances, err := carryBalances(sourceID, review)
	if err != nil {
		return models.BudgetPeriod{}, err
	}
	return database.StartNextBudget(sourceID, models.BudgetPeriod{Name: name, StartDate: start, EndDate: end}, balances)
}

func (a *App) GetCarryStatus(targetID int64) (*models.CarryStatus, error) {
	state, err := database.GetCarryState(targetID)
	if err != nil || state == nil {
		return nil, err
	}
	periods, err := database.GetBudgetPeriods()
	if err != nil {
		return nil, err
	}
	result := &models.CarryStatus{SourceID: state.SourceID, Amounts: state.Amounts, Changes: map[int64]float64{}}
	for _, p := range periods {
		if p.ID == state.SourceID {
			result.SourceName = p.Name
			result.SourceStatus = p.Status
			break
		}
	}
	review, err := a.GetBudgetReview(state.SourceID)
	if err != nil {
		return nil, err
	}
	expected, err := carryBalances(state.SourceID, review)
	if err != nil {
		result.ReviewError = err.Error()
		return result, nil
	}
	for id, value := range expected {
		delta := math.Round((value-state.Amounts[id])*100) / 100
		if delta != 0 {
			result.Changes[id] = delta
		}
	}
	for id, value := range state.Amounts {
		if _, found := expected[id]; !found && value != 0 {
			result.Changes[id] = -value
		}
	}
	return result, nil
}

func (a *App) ReconcileBudgetCarry(targetID int64) error {
	state, err := database.GetCarryState(targetID)
	if err != nil {
		return err
	}
	if state == nil {
		return fmt.Errorf("no carry-forward found")
	}
	review, err := a.GetBudgetReview(state.SourceID)
	if err != nil {
		return err
	}
	expected, err := carryBalances(state.SourceID, review)
	if err != nil {
		return err
	}
	return database.ReconcileCarry(targetID, expected)
}
