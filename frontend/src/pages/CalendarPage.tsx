import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  GetBills,
  GetCategories,
  GetIncomeSchedules,
  GetPlanningCalendar,
  SaveBillSchedule,
  SaveIncomeSchedule,
} from "@/wailsAdapter";
import {
  CalendarEvent,
  dateKey,
  dayLabel,
  errorText,
  frequencies,
  frequencyLabel,
  IncomeSchedule,
  Rule,
  ScheduledBill,
  todayKey,
} from "@/lib/planning";
import { formatMoney } from "@/lib/utils";

type Entry = IncomeSchedule | ScheduledBill;
type Draft = { kind: "income" | "bill"; entry: Entry };
const blank = (): IncomeSchedule => ({
  id: 0,
  name: "",
  amount: 0,
  active: true,
  schedule: {
    cadence: "biweekly",
    anchorDate: todayKey(),
    secondDay: 16,
    endDate: "",
  },
});

export default function CalendarPage() {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState(todayKey());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [incomes, setIncomes] = useState<IncomeSchedule[]>([]);
  const [bills, setBills] = useState<ScheduledBill[]>([]);
  const [categories, setCategories] = useState<
    { id: number; name: string; type: string }[]
  >([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const from = dateKey(month),
    to = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const load = async () => {
    if (!mounted.current) return;
    setEvents([]);
    const version = ++request.current;
    setLoading(true);
    setError("");
    try {
      const [e, i, b, c] = await Promise.all([
        GetPlanningCalendar(from, to),
        GetIncomeSchedules(),
        GetBills(),
        GetCategories(),
      ]);
      if (version === request.current) {
        setEvents(e || []);
        setIncomes(i || []);
        setBills(b || []);
        setCategories(c || []);
      }
    } catch (e) {
      if (version === request.current) setError(errorText(e));
    } finally {
      if (version === request.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [from, to]);
  const save = async (kind: Draft["kind"], entry: Entry) =>
    kind === "income" ? SaveIncomeSchedule(entry) : SaveBillSchedule(entry);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setFormError("");
    try {
      await save(draft.kind, draft.entry);
      if (!mounted.current) return;
      setDraft(null);
      await load();
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const toggle = async (kind: Draft["kind"], entry: Entry) => {
    setBusy(true);
    try {
      await save(kind, { ...entry, active: !entry.active });
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const open = (kind: Draft["kind"], entry?: Entry) => {
    setFormError("");
    setDraft({
      kind,
      entry: entry
        ? { ...entry, schedule: { ...entry.schedule } }
        : kind === "bill"
          ? { ...blank(), categoryId: 0, dueDay: 1, accountId: null }
          : blank(),
    });
  };
  const patch = (value: Partial<Entry>) =>
    setDraft((d) => (d ? { ...d, entry: { ...d.entry, ...value } } : d));
  const patchRule = (value: Partial<Rule>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            entry: { ...d.entry, schedule: { ...d.entry.schedule, ...value } },
          }
        : d,
    );
  const move = (delta: number) => {
    const d = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(d);
    setSelected(dateKey(d));
  };
  const cells = Array.from(
    { length: month.getDay() + Number(to.slice(-2)) },
    (_, n) =>
      n < month.getDay()
        ? null
        : dateKey(
            new Date(
              month.getFullYear(),
              month.getMonth(),
              n - month.getDay() + 1,
            ),
          ),
  );
  const selectedEvents = events.filter((e) => e.date === selected);
  return (
    <div className="mx-auto max-w-7xl space-y-7 px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Household calendar</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Paychecks, bills and budget boundaries on their actual dates. Each
            paycheck and payment plan can follow its own schedule.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => open("income")}>
            <Plus className="mr-2 h-4 w-4" />
            Income schedule
          </Button>
          <Button onClick={() => open("bill")}>
            <Plus className="mr-2 h-4 w-4" />
            Bill or payment plan
          </Button>
        </div>
      </header>
      {error && (
        <p role="alert" className="text-destructive">
          {error}{" "}
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            disabled={busy}
            onClick={() => move(-1)}
          >
            <ChevronLeft />
          </Button>
          <h2 className="min-w-44 text-xl font-semibold">
            {month.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            disabled={busy}
            onClick={() => move(1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading…"
            : `Expected income $${formatMoney(events.filter((e) => e.kind === "income").reduce((a, e) => a + e.amount, 0))} · Bills due $${formatMoney(Math.abs(events.filter((e) => e.kind === "bill").reduce((a, e) => a + e.amount, 0)))}`}
        </p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[650px]" aria-label="Monthly planning calendar">
          <div className="grid grid-cols-7 text-center text-sm text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
            {cells.map((day, n) =>
              day ? (
                <button
                  key={day}
                  aria-label={dayLabel(day)}
                  aria-pressed={day === selected}
                  onClick={() => setSelected(day)}
                  className={`flex min-h-28 flex-col items-stretch justify-start space-y-1 bg-background p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${day === selected ? "ring-2 ring-inset ring-primary" : ""}`}
                >
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${day === todayKey() ? "bg-primary text-primary-foreground" : "font-medium"}`}
                  >
                    {Number(day.slice(-2))}
                  </span>
                  {events
                    .filter((e) => e.date === day)
                    .slice(0, 3)
                    .map((e, i) => (
                      <span
                        key={`${e.kind}-${e.sourceId}-${i}`}
                        className={`block truncate rounded px-1 py-0.5 text-xs ${e.kind === "income" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : e.kind === "bill" ? "bg-orange-500/15 text-orange-800 dark:text-orange-300" : "bg-muted text-muted-foreground"}`}
                      >
                        {e.kind === "income"
                          ? "+"
                          : e.kind === "bill"
                            ? "−"
                            : ""}
                        {e.amount ? `$${formatMoney(Math.abs(e.amount))} ` : ""}
                        {e.kind === "budget start" ? "Starts: " : e.kind === "budget end" ? "Ends: " : ""}{e.name}
                      </span>
                    ))}
                  {events.filter((e) => e.date === day).length > 3 && (
                    <span className="block text-xs text-muted-foreground">
                      More in day details
                    </span>
                  )}
                </button>
              ) : (
                <div key={`blank-${n}`} className="bg-muted" />
              ),
            )}
          </div>
        </div>
      </div>
      <section className="rounded-lg border p-4" aria-label="Selected day">
        <h2 className="mb-3 text-lg font-semibold">{dayLabel(selected)}</h2>
        {!loading && !selectedEvents.length ? (
          <p className="text-sm text-muted-foreground">
            Nothing scheduled for this day.
          </p>
        ) : (
          <ul className="divide-y">
            {selectedEvents.map((e, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span>
                  <span className="mr-2 text-xs text-muted-foreground">
                    {e.kind}
                  </span>
                  {e.name}
                </span>
                <strong>
                  {e.amount !== 0
                    ? `${e.amount > 0 ? "+" : "−"}$${formatMoney(Math.abs(e.amount))}`
                    : ""}
                </strong>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Scheduled amounts are expectations, not confirmed deposits or
          payments. They do not post transactions or alter account balances.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-xl font-semibold">Your schedules</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Every 2 weeks means a fixed 14-day cycle. Twice a month uses two dates
          and can have different gaps. A last occurrence date stops a finite
          payment plan.
        </p>
        {!incomes.length && !bills.length && !loading && (
          <p>
            Add one income schedule for each earner, then add your bills and
            payment plans.
          </p>
        )}
        <div className="divide-y">
          {[
            ...incomes.map((entry) => ({ kind: "income" as const, entry })),
            ...bills.map((entry) => ({ kind: "bill" as const, entry })),
          ].map(({ kind, entry }) => (
            <div
              key={`${kind}-${entry.id}`}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium">
                  {entry.name}{" "}
                  <span className="text-muted-foreground">
                    ${formatMoney(entry.amount)}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {kind === "income" ? "Income" : "Bill"} ·{" "}
                  {frequencyLabel(entry.schedule)}
                  {entry.schedule.cadence === "semimonthly"
                    ? ` (${Number(entry.schedule.anchorDate.slice(-2))} & ${entry.schedule.secondDay})`
                    : ""}
                  {entry.schedule.endDate
                    ? ` · Ends ${dayLabel(entry.schedule.endDate)}`
                    : ""}
                  {!entry.active ? " · Paused" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => open(kind, entry)}
                >
                  Edit {entry.name}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void toggle(kind, entry)}
                >
                  {entry.active ? "Pause" : "Resume"} {entry.name}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <Dialog
        open={!!draft}
        onOpenChange={(v) => {
          if (!v && !busy) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {draft?.entry.id ? "Edit" : "Add"}{" "}
              {draft?.kind === "income"
                ? "income schedule"
                : "bill or payment plan"}
            </DialogTitle>
            <DialogDescription>
              Choose the amount and exact recurrence. This schedules expected
              events without posting transactions.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <form onSubmit={submit} className="space-y-4">
              {formError && (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              )}
              <div>
                <Label htmlFor="schedule-name">Name</Label>
                <Input
                  id="schedule-name"
                  required
                  value={draft.entry.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder={
                    draft.kind === "income"
                      ? "Wife’s weekly paycheck"
                      : "Affirm payment plan"
                  }
                />
              </div>
              <div>
                <Label htmlFor="schedule-amount">
                  {draft.kind === "income"
                    ? "Take-home amount per paycheck"
                    : "Amount per payment"}
                </Label>
                <Input
                  id="schedule-amount"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={draft.entry.amount}
                  onChange={(e) => patch({ amount: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="schedule-frequency">Frequency</Label>
                <Select
                  id="schedule-frequency"
                  value={draft.entry.schedule.cadence}
                  onChange={(e) => patchRule({ cadence: e.target.value })}
                >
                  {frequencies.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="schedule-start">First occurrence date</Label>
                <Input
                  id="schedule-start"
                  type="date"
                  required
                  value={draft.entry.schedule.anchorDate}
                  onChange={(e) => patchRule({ anchorDate: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Use a known payday or payment due date. Monthly dates keep
                  their original day, clamped to month end when needed.
                </p>
              </div>
              {draft.entry.schedule.cadence === "semimonthly" && (
                <div>
                  <Label htmlFor="schedule-second">
                    Second day of month (31 means month end in short months)
                  </Label>
                  <Input
                    id="schedule-second"
                    type="number"
                    min="2"
                    max="31"
                    required
                    value={draft.entry.schedule.secondDay}
                    onChange={(e) =>
                      patchRule({ secondDay: Number(e.target.value) })
                    }
                  />
                </div>
              )}
              <div>
                <Label htmlFor="schedule-end">
                  Last occurrence date (optional)
                </Label>
                <Input
                  id="schedule-end"
                  type="date"
                  min={draft.entry.schedule.anchorDate}
                  value={draft.entry.schedule.endDate}
                  onChange={(e) => patchRule({ endDate: e.target.value })}
                />
              </div>
              {draft.kind === "bill" && (
                <div>
                  <Label htmlFor="schedule-category">Expense category</Label>
                  <Select
                    id="schedule-category"
                    required
                    value={(draft.entry as ScheduledBill).categoryId || ""}
                    onChange={(e) =>
                      patch({ categoryId: Number(e.target.value) })
                    }
                  >
                    <option value="">Choose category</option>
                    {categories
                      .filter((c) => c.type === "Expense")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </Select>
                </div>
              )}
              <Button className="w-full" disabled={busy} type="submit">
                {busy ? "Saving…" : "Save schedule"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
