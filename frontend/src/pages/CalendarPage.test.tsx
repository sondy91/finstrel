import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import CalendarPage from "./CalendarPage";
import * as api from "@/wailsAdapter";
import { todayKey } from "@/lib/planning";
vi.mock("@/wailsAdapter", () => ({
  GetBills: vi.fn(),
  GetCategories: vi.fn(),
  GetIncomeSchedules: vi.fn(),
  GetPlanningCalendar: vi.fn(),
  SaveBillSchedule: vi.fn(),
  SaveIncomeSchedule: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.GetBills).mockResolvedValue([]);
  vi.mocked(api.GetIncomeSchedules).mockResolvedValue([]);
  vi.mocked(api.GetCategories).mockResolvedValue([
    { id: 7, name: "Payment plans", type: "Expense" },
  ]);
  vi.mocked(api.GetPlanningCalendar).mockResolvedValue([
    {
      date: todayKey(),
      kind: "income",
      sourceId: 1,
      name: "Weekly pay",
      amount: 400,
    },
  ]);
  vi.mocked(api.SaveBillSchedule).mockResolvedValue({});
  vi.mocked(api.SaveIncomeSchedule).mockResolvedValue({});
});
it("saves a weekly earner independently of the household budget", async () => {
  const user = userEvent.setup();
  render(<CalendarPage />);
  await screen.findByRole("button", { name: "Income schedule" });
  await user.click(screen.getByRole("button", { name: "Income schedule" }));
  await user.type(screen.getByLabelText("Name"), "Weekly paycheck");
  await user.clear(screen.getByLabelText("Take-home amount per paycheck"));
  await user.type(
    screen.getByLabelText("Take-home amount per paycheck"),
    "450.25",
  );
  await user.selectOptions(screen.getByLabelText("Frequency"), "weekly");
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() =>
    expect(api.SaveIncomeSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Weekly paycheck",
        amount: 450.25,
        schedule: expect.objectContaining({ cadence: "weekly" }),
      }),
    ),
  );
  expect(api.SaveBillSchedule).not.toHaveBeenCalled();
});
it("saves a finite two-week payment plan and preserves the final date", async () => {
  const user = userEvent.setup();
  render(<CalendarPage />);
  await screen.findByRole("button", { name: "Bill or payment plan" });
  await user.click(
    screen.getByRole("button", { name: "Bill or payment plan" }),
  );
  await user.type(screen.getByLabelText("Name"), "Affirm");
  await user.selectOptions(screen.getByLabelText("Expense category"), "7");
  await user.clear(screen.getByLabelText("First occurrence date"));
  await user.type(screen.getByLabelText("First occurrence date"), "2026-10-02");
  await user.type(
    screen.getByLabelText("Last occurrence date (optional)"),
    "2026-11-13",
  );
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() =>
    expect(api.SaveBillSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Affirm",
        categoryId: 7,
        schedule: {
          cadence: "biweekly",
          anchorDate: "2026-10-02",
          secondDay: 16,
          endDate: "2026-11-13",
        },
      }),
    ),
  );
});
