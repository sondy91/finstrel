// Package schedule expands calendar-day rules without timezone or month-end drift.
package schedule

import (
	"fmt"
	"time"
)

const Layout = "2006-01-02"

type Rule struct {
	Cadence    string `json:"cadence"`
	AnchorDate string `json:"anchorDate"`
	SecondDay  int    `json:"secondDay"`
	EndDate    string `json:"endDate"`
}

func (r Rule) Validate() error {
	anchor, err := time.Parse(Layout, r.AnchorDate)
	if err != nil {
		return fmt.Errorf("choose a valid first occurrence date")
	}
	switch r.Cadence {
	case "once", "weekly", "biweekly", "threeweekly", "monthly", "bimonthly", "yearly":
	case "semimonthly":
		if r.SecondDay <= anchor.Day() || r.SecondDay > 31 {
			return fmt.Errorf("second monthly day must be after the first day and at most 31")
		}
	default:
		return fmt.Errorf("choose a supported frequency")
	}
	if r.EndDate != "" {
		end, e := time.Parse(Layout, r.EndDate)
		if e != nil || end.Before(anchor) {
			return fmt.Errorf("last occurrence date must be on or after the first")
		}
	}
	return nil
}

// Dates includes both endpoints; a short month clamps each original day, never
// the previous occurrence. Duplicate clamped semi-monthly days occur only once.
func Dates(r Rule, from, to string) ([]string, error) {
	if err := r.Validate(); err != nil {
		return nil, err
	}
	start, err := time.Parse(Layout, from)
	if err != nil {
		return nil, err
	}
	end, err := time.Parse(Layout, to)
	if err != nil || end.Before(start) {
		return nil, fmt.Errorf("invalid calendar date range")
	}
	if end.Sub(start) > 5*366*24*time.Hour {
		return nil, fmt.Errorf("choose a range of five years or less")
	}
	anchor, _ := time.Parse(Layout, r.AnchorDate)
	result := []string{}
	for day := start; !day.After(end); day = day.AddDate(0, 0, 1) {
		date := day.Format(Layout)
		if day.Before(anchor) || (r.EndDate != "" && date > r.EndDate) {
			continue
		}
		match := false
		switch r.Cadence {
		case "once":
			match = date == r.AnchorDate
		case "weekly", "biweekly", "threeweekly":
			interval := 7
			if r.Cadence == "biweekly" {
				interval = 14
			}
			if r.Cadence == "threeweekly" {
				interval = 21
			}
			match = int(day.Sub(anchor).Hours()/24)%interval == 0
		case "monthly", "bimonthly", "semimonthly", "yearly":
			last := time.Date(day.Year(), day.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
			matchesDay := day.Day() == min(anchor.Day(), last)
			months := (day.Year()-anchor.Year())*12 + int(day.Month()-anchor.Month())
			match = matchesDay
			if r.Cadence == "bimonthly" {
				match = match && months%2 == 0
			}
			if r.Cadence == "yearly" {
				match = match && months%12 == 0
			}
			if r.Cadence == "semimonthly" {
				match = matchesDay || day.Day() == min(r.SecondDay, last)
			}
		}
		if match {
			result = append(result, date)
		}
	}
	return result, nil
}
