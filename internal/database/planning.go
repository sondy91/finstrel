package database

import (
	"database/sql"
	"encoding/json"
	"finstrel/internal/models"
	"finstrel/internal/schedule"
	"fmt"
	"sort"
	"time"
)

// Additive only: old bill rows, IDs, due days and amounts are preserved. Older
// builds must not be used to forecast new non-monthly rules (they cannot read them).
func createPlanningTables(tx *sql.Tx) error {
	for _, q := range []string{
		`CREATE TABLE IF NOT EXISTS bill_recurrences (bill_id INTEGER PRIMARY KEY REFERENCES bills(id) ON DELETE CASCADE, rule TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS income_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, amount REAL NOT NULL CHECK(amount>=0), active INTEGER NOT NULL DEFAULT 1, rule TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS budget_handoffs (id INTEGER PRIMARY KEY AUTOINCREMENT, source_period_id INTEGER NOT NULL UNIQUE REFERENCES budget_periods(id), target_period_id INTEGER NOT NULL UNIQUE REFERENCES budget_periods(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		`CREATE TABLE IF NOT EXISTS budget_carry_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, handoff_id INTEGER NOT NULL REFERENCES budget_handoffs(id), category_id INTEGER NOT NULL REFERENCES categories(id), amount REAL NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
	} {
		if _, err := tx.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

func decodeBillRule(bill *models.Bill, raw string) error {
	if raw == "" {
		bill.Schedule = schedule.Rule{Cadence: "monthly", AnchorDate: fmt.Sprintf("2000-01-%02d", bill.DueDay)}
		return nil
	}
	if err := json.Unmarshal([]byte(raw), &bill.Schedule); err != nil {
		return fmt.Errorf("invalid saved bill schedule: %w", err)
	}
	return bill.Schedule.Validate()
}

func SaveBillSchedule(bill models.Bill) (models.Bill, error) {
	rule, err := json.Marshal(bill.Schedule)
	if err != nil {
		return bill, err
	}
	anchor, _ := time.Parse(schedule.Layout, bill.Schedule.AnchorDate)
	bill.DueDay = anchor.Day()
	tx, err := GetDB().Begin()
	if err != nil {
		return bill, err
	}
	defer tx.Rollback()
	if bill.ID == 0 {
		res, e := tx.Exec(`INSERT INTO bills(name,amount,category_id,due_day,account_id,active) VALUES(?,?,?,?,?,?)`, bill.Name, bill.Amount, bill.CategoryID, bill.DueDay, bill.AccountID, bill.Active)
		if e != nil {
			return bill, e
		}
		bill.ID, err = res.LastInsertId()
		if err != nil {
			return bill, err
		}
	} else {
		res, e := tx.Exec(`UPDATE bills SET name=?,amount=?,category_id=?,due_day=?,account_id=?,active=? WHERE id=?`, bill.Name, bill.Amount, bill.CategoryID, bill.DueDay, bill.AccountID, bill.Active, bill.ID)
		if e != nil {
			return bill, e
		}
		if n, _ := res.RowsAffected(); n != 1 {
			return bill, sql.ErrNoRows
		}
	}
	if _, err = tx.Exec(`INSERT INTO bill_recurrences(bill_id,rule) VALUES(?,?) ON CONFLICT(bill_id) DO UPDATE SET rule=excluded.rule`, bill.ID, string(rule)); err != nil {
		return bill, err
	}
	return bill, tx.Commit()
}

func GetIncomeSchedules() ([]models.IncomeSchedule, error) {
	rows, err := GetDB().Query(`SELECT id,name,amount,active,rule FROM income_schedules ORDER BY name,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	incomes := []models.IncomeSchedule{}
	for rows.Next() {
		var i models.IncomeSchedule
		var raw string
		if err = rows.Scan(&i.ID, &i.Name, &i.Amount, &i.Active, &raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(raw), &i.Schedule); err != nil {
			return nil, err
		}
		incomes = append(incomes, i)
	}
	return incomes, rows.Err()
}
func SaveIncomeSchedule(i models.IncomeSchedule) (models.IncomeSchedule, error) {
	rule, err := json.Marshal(i.Schedule)
	if err != nil {
		return i, err
	}
	if i.ID == 0 {
		res, e := GetDB().Exec(`INSERT INTO income_schedules(name,amount,active,rule) VALUES(?,?,?,?)`, i.Name, i.Amount, i.Active, string(rule))
		if e != nil {
			return i, e
		}
		i.ID, err = res.LastInsertId()
		return i, err
	}
	res, err := GetDB().Exec(`UPDATE income_schedules SET name=?,amount=?,active=?,rule=? WHERE id=?`, i.Name, i.Amount, i.Active, string(rule), i.ID)
	if err != nil {
		return i, err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return i, sql.ErrNoRows
	}
	return i, nil
}

func GetPlanningCalendar(from, to string) ([]models.CalendarEvent, error) {
	events := []models.CalendarEvent{}
	incomes, err := GetIncomeSchedules()
	if err != nil {
		return nil, err
	}
	bills, err := GetBills()
	if err != nil {
		return nil, err
	}
	for _, i := range incomes {
		if !i.Active {
			continue
		}
		dates, e := schedule.Dates(i.Schedule, from, to)
		if e != nil {
			return nil, e
		}
		for _, d := range dates {
			events = append(events, models.CalendarEvent{Date: d, Kind: "income", SourceID: i.ID, Name: i.Name, Amount: i.Amount})
		}
	}
	for _, b := range bills {
		if !b.Active {
			continue
		}
		dates, e := schedule.Dates(b.Schedule, from, to)
		if e != nil {
			return nil, e
		}
		for _, d := range dates {
			events = append(events, models.CalendarEvent{Date: d, Kind: "bill", SourceID: b.ID, Name: b.Name, Amount: -b.Amount})
		}
	}
	periods, err := GetBudgetPeriods()
	if err != nil {
		return nil, err
	}
	for _, p := range periods {
		for _, v := range []struct {
			date time.Time
			kind string
		}{{p.StartDate, "budget start"}, {p.EndDate, "budget end"}} {
			d := v.date.Format(schedule.Layout)
			if d >= from && d <= to {
				events = append(events, models.CalendarEvent{Date: d, Kind: v.kind, SourceID: p.ID, Name: p.Name + " (" + p.Status + ")"})
			}
		}
	}
	sort.SliceStable(events, func(i, j int) bool {
		if events[i].Date == events[j].Date {
			return events[i].Kind < events[j].Kind
		}
		return events[i].Date < events[j].Date
	})
	return events, nil
}
