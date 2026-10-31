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
  ["weekly", "Weekly"],
  ["biweekly", "Every 2 weeks"],
  ["semimonthly", "Twice a month (two dates)"],
  ["monthly", "Monthly"],
  ["bimonthly", "Every 2 months"],
  ["once", "One time"],
] as const;
export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayKey = () => dateKey(new Date());
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
export const dayLabel = (s: string) =>
  new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export const frequencyLabel = (r: Rule) =>
  frequencies.find((f) => f[0] === r.cadence)?.[1] || r.cadence;
