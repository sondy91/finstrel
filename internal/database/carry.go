package database

import (
	"database/sql"
	"fmt"
	"math"

	"finstrel/internal/models"
)

// CarryState records the balance actually carried, including later adjustments.
type CarryState struct {
	HandoffID int64
	SourceID  int64
	TargetID  int64
	Amounts   map[int64]float64
}

func GetCarryState(targetID int64) (*CarryState, error) {
	s := &CarryState{TargetID: targetID, Amounts: map[int64]float64{}}
	err := GetDB().QueryRow(`SELECT id, source_period_id FROM budget_handoffs WHERE target_period_id=?`, targetID).Scan(&s.HandoffID, &s.SourceID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	rows, err := GetDB().Query(`SELECT category_id, SUM(amount) FROM budget_carry_entries WHERE handoff_id=? GROUP BY category_id`, s.HandoffID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var amount float64
		if err = rows.Scan(&id, &amount); err != nil {
			return nil, err
		}
		s.Amounts[id] = amount
	}
	return s, rows.Err()
}

// StartNextBudget carries signed balances and closes the source in one transaction.
func StartNextBudget(sourceID int64, next models.BudgetPeriod, balances map[int64]float64) (models.BudgetPeriod, error) {
	tx, err := GetDB().Begin()
	if err != nil {
		return models.BudgetPeriod{}, err
	}
	defer tx.Rollback()
	var status, end string
	if err = tx.QueryRow(`SELECT status,COALESCE(date(end_date),'') FROM budget_periods WHERE id=?`, sourceID).Scan(&status, &end); err != nil {
		return models.BudgetPeriod{}, err
	}
	if status != "Open" && status != "Closed" {
		return models.BudgetPeriod{}, fmt.Errorf("select an open or closed budget")
	}
	if len(end) != 10 {
		return models.BudgetPeriod{}, fmt.Errorf("previous budget has an invalid end date")
	}
	if next.StartDate.Format("2006-01-02") <= end {
		return models.BudgetPeriod{}, fmt.Errorf("next budget must start after the previous budget ends")
	}
	var count int
	if err = tx.QueryRow(`SELECT COUNT(*) FROM budget_allocations WHERE budget_period_id=?`, sourceID).Scan(&count); err != nil {
		return models.BudgetPeriod{}, err
	}
	if count == 0 {
		return models.BudgetPeriod{}, fmt.Errorf("add an envelope before starting the next budget")
	}
	if err = tx.QueryRow(`SELECT COUNT(*) FROM budget_periods WHERE date(start_date)<=date(?) AND date(end_date)>=date(?)`, next.EndDate.Format("2006-01-02"), next.StartDate.Format("2006-01-02")).Scan(&count); err != nil {
		return models.BudgetPeriod{}, err
	}
	if count > 0 {
		return models.BudgetPeriod{}, fmt.Errorf("next budget overlaps an existing period")
	}
	res, err := tx.Exec(`INSERT INTO budget_periods(name,start_date,end_date,status) VALUES(?,?,?,'Open')`, next.Name, next.StartDate.Format("2006-01-02 15:04:05"), next.EndDate.Format("2006-01-02 15:04:05"))
	if err != nil {
		return models.BudgetPeriod{}, err
	}
	next.ID, err = res.LastInsertId()
	if err != nil {
		return models.BudgetPeriod{}, err
	}
	next.Status = "Open"
	if err = populateBudgetPeriodFromDefaults(tx, next.ID); err != nil {
		return models.BudgetPeriod{}, err
	}
	res, err = tx.Exec(`INSERT INTO budget_handoffs(source_period_id,target_period_id) VALUES(?,?)`, sourceID, next.ID)
	if err != nil {
		return models.BudgetPeriod{}, fmt.Errorf("this budget already has a next period: %w", err)
	}
	handoff, err := res.LastInsertId()
	if err != nil {
		return models.BudgetPeriod{}, err
	}
	if err = applyCarryEntries(tx, handoff, next.ID, balances, "initial"); err != nil {
		return models.BudgetPeriod{}, err
	}
	if _, err = tx.Exec(`UPDATE budget_periods SET status='Closed', updated_at=CURRENT_TIMESTAMP WHERE id=?`, sourceID); err != nil {
		return models.BudgetPeriod{}, err
	}
	if err = tx.Commit(); err != nil {
		return models.BudgetPeriod{}, err
	}
	return next, nil
}

func applyCarryEntries(tx *sql.Tx, handoff, target int64, changes map[int64]float64, reason string) error {
	for categoryID, value := range changes {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return fmt.Errorf("invalid carry amount")
		}
		value = math.Round(value*100) / 100
		if value == 0 {
			continue
		}
		var kind string
		if err := tx.QueryRow(`SELECT type FROM categories WHERE id=?`, categoryID).Scan(&kind); err != nil {
			return err
		}
		if kind != "Expense" {
			return fmt.Errorf("only expense envelopes can carry balances")
		}
		if _, err := tx.Exec(`INSERT INTO budget_allocations(budget_period_id,category_id,allocated_amount) VALUES(?,?,0) ON CONFLICT(budget_period_id,category_id) DO NOTHING`, target, categoryID); err != nil {
			return err
		}
		res, err := tx.Exec(`UPDATE budget_allocations SET allocated_amount=allocated_amount+? WHERE budget_period_id=? AND category_id=?`, value, target, categoryID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n != 1 {
			return fmt.Errorf("missing target envelope")
		}
		if _, err = tx.Exec(`INSERT INTO budget_carry_entries(handoff_id,category_id,amount,reason) VALUES(?,?,?,?)`, handoff, categoryID, value, reason); err != nil {
			return err
		}
	}
	return nil
}

// ReconcileCarry appends adjustments rather than rewriting previous carry entries.
func ReconcileCarry(targetID int64, expected map[int64]float64) error {
	tx, err := GetDB().Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var handoff int64
	var sourceStatus, targetStatus string
	if err = tx.QueryRow(`SELECT h.id, s.status, t.status FROM budget_handoffs h JOIN budget_periods s ON s.id=h.source_period_id JOIN budget_periods t ON t.id=h.target_period_id WHERE h.target_period_id=?`, targetID).Scan(&handoff, &sourceStatus, &targetStatus); err != nil {
		return err
	}
	if sourceStatus != "Closed" || targetStatus != "Open" {
		return fmt.Errorf("close the previous budget and reopen this budget before updating carry forward")
	}
	rows, err := tx.Query(`SELECT category_id,SUM(amount) FROM budget_carry_entries WHERE handoff_id=? GROUP BY category_id`, handoff)
	if err != nil {
		return err
	}
	current := map[int64]float64{}
	for rows.Next() {
		var id int64
		var amount float64
		if err = rows.Scan(&id, &amount); err != nil {
			rows.Close()
			return err
		}
		current[id] = amount
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	changes := map[int64]float64{}
	for id, amount := range expected {
		changes[id] = amount - current[id]
		delete(current, id)
	}
	for id, amount := range current {
		changes[id] = -amount
	}
	if err = applyCarryEntries(tx, handoff, targetID, changes, "reconcile"); err != nil {
		return err
	}
	return tx.Commit()
}
