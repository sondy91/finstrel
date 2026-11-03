package database

import (
	"encoding/json"
	"fmt"

	"finstrel/internal/models"
)

// SeedOnboarding creates the starter household atomically, without changing an existing ledger.
func SeedOnboarding(period models.BudgetPeriod, categories []models.Category, incomes []models.IncomeSchedule) error {
	tx, err := GetDB().Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var count int
	if err = tx.QueryRow(`SELECT (SELECT COUNT(*) FROM accounts) + (SELECT COUNT(*) FROM budget_periods) + (SELECT COUNT(*) FROM categories) + (SELECT COUNT(*) FROM income_schedules)`).Scan(&count); err != nil {
		return err
	}
	if count != 0 {
		return fmt.Errorf("starter setup requires an empty household")
	}
	for _, c := range categories {
		if _, err = tx.Exec(`INSERT INTO categories(name,type,default_amount) VALUES(?,?,?)`, c.Name, c.Type, c.DefaultAmount); err != nil {
			return err
		}
	}
	result, err := tx.Exec(`INSERT INTO budget_periods(name,start_date,end_date,status) VALUES(?,?,?,'Open')`, period.Name, period.StartDate.Format("2006-01-02 15:04:05"), period.EndDate.Format("2006-01-02 15:04:05"))
	if err != nil {
		return err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	if err = populateBudgetPeriodFromDefaults(tx, id); err != nil {
		return err
	}
	for _, income := range incomes {
		rule, e := json.Marshal(income.Schedule)
		if e != nil {
			return e
		}
		if _, err = tx.Exec(`INSERT INTO income_schedules(name,amount,active,rule) VALUES(?,?,?,?)`, income.Name, income.Amount, true, string(rule)); err != nil {
			return err
		}
	}
	return tx.Commit()
}
