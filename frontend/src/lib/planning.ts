export type Rule = {
  cadence: string;
  anchorDate: string;
  secondDay: number;
  endDate: string;
};
export type IncomeSchedule = {
  id: number;
  name: string;
  amount: number;
  active: boolean;
  schedule: Rule;
};
export type ScheduledBill = IncomeSchedule & {
  categoryId: number;
  dueDay: number;
  accountId: number | null;
};
export type CalendarEvent = {
  date: string;
  kind: string;
  sourceId: number;
  name: string;
  amount: number;
};
export const frequencies = [
  ['weekly', 'Weekly'],
  ['biweekly', 'Every 2 weeks'],
  ['threeweekly', 'Every 3 weeks'],
  ['semimonthly', 'Twice a month (two dates)'],
  ['monthly', 'Monthly'],
  ['bimonthly', 'Every 2 months'],
  ['yearly', 'Yearly'],
  ['once', 'One time'],
] as const;
export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayKey = () => dateKey(new Date());
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const dayLabel = (s: string) =>
  new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
export const frequencyLabel = (r: Rule) =>
  frequencies.find((f) => f[0] === r.cadence)?.[1] || r.cadence;

// Preserve calendar months while keeping fixed-length pay periods the same length.
export function nextBudgetDates(startValue: string, endValue: string) {
  const start = new Date(`${startValue.slice(0, 10)}T12:00:00`);
  const end = new Date(`${endValue.slice(0, 10)}T12:00:00`);
  const nextStart = new Date(end);
  nextStart.setDate(nextStart.getDate() + 1);
  const lastOfMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  let nextEnd: Date;
  if (
    start.getDate() === 1 &&
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear() &&
    end.getDate() === lastOfMonth
  ) {
    nextEnd = new Date(nextStart.getFullYear(), nextStart.getMonth() + 1, 0, 12);
  } else {
    const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    const duration = Math.max(1, Math.round((endDay - startDay) / 86400000));
    nextEnd = new Date(nextStart);
    nextEnd.setDate(nextEnd.getDate() + duration);
  }
  return { start: dateKey(nextStart), end: dateKey(nextEnd) };
}
