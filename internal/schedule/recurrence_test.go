package schedule

import (
	"reflect"
	"testing"
)

func TestCalendarRecurrences(t *testing.T) {
	for _, tc := range []struct {
		name     string
		rule     Rule
		from, to string
		want     []string
	}{
		{"weekly", Rule{Cadence: "weekly", AnchorDate: "2026-10-02"}, "2026-10-01", "2026-10-31", []string{"2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"}},
		{"biweekly is not semi monthly", Rule{Cadence: "biweekly", AnchorDate: "2026-10-02"}, "2026-10-01", "2026-10-31", []string{"2026-10-02", "2026-10-16", "2026-10-30"}},
		{"semi monthly", Rule{Cadence: "semimonthly", AnchorDate: "2026-01-15", SecondDay: 31}, "2026-02-01", "2026-03-31", []string{"2026-02-15", "2026-02-28", "2026-03-15", "2026-03-31"}},
		{"month end no drift", Rule{Cadence: "monthly", AnchorDate: "2024-01-31"}, "2024-02-01", "2024-04-30", []string{"2024-02-29", "2024-03-31", "2024-04-30"}},
		{"finite plan", Rule{Cadence: "biweekly", AnchorDate: "2026-12-18", EndDate: "2027-01-15"}, "2026-12-01", "2027-02-28", []string{"2026-12-18", "2027-01-01", "2027-01-15"}},
		{"every two months", Rule{Cadence: "bimonthly", AnchorDate: "2026-01-31"}, "2026-01-01", "2026-04-30", []string{"2026-01-31", "2026-03-31"}},
		{"once", Rule{Cadence: "once", AnchorDate: "2026-10-25"}, "2026-10-01", "2026-12-31", []string{"2026-10-25"}},
		{"clamped duplicates", Rule{Cadence: "semimonthly", AnchorDate: "2026-01-30", SecondDay: 31}, "2026-02-01", "2026-02-28", []string{"2026-02-28"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Dates(tc.rule, tc.from, tc.to)
			if err != nil || !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %v, %v; want %v", got, err, tc.want)
			}
		})
	}
}
func TestRejectInvalidRules(t *testing.T) {
	for _, r := range []Rule{{Cadence: "weekly", AnchorDate: "2026-02-30"}, {Cadence: "semimonthly", AnchorDate: "2026-10-15", SecondDay: 10}, {Cadence: "monthly", AnchorDate: "2026-10-15", EndDate: "2026-10-01"}, {Cadence: "unknown", AnchorDate: "2026-10-15"}} {
		if r.Validate() == nil {
			t.Fatal("invalid rule accepted")
		}
	}
}
