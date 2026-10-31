import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import BudgetDateFields from "./BudgetDateFields";
import { PreviewBudgetWindow } from "@/wailsAdapter";
vi.mock("@/wailsAdapter", () => ({ PreviewBudgetWindow: vi.fn() }));
function Form() {
  const [start, setStart] = useState("2026-10-23");
  const [end, setEnd] = useState("");
  return (
    <BudgetDateFields
      prefix="test"
      start={start}
      end={end}
      onStart={setStart}
      onEnd={setEnd}
    />
  );
}
it("previews a two-week budget and allows explicit custom dates", async () => {
  vi.mocked(PreviewBudgetWindow).mockResolvedValue({
    start: "2026-10-23",
    end: "2026-11-05",
  });
  const user = userEvent.setup();
  render(<Form />);
  await waitFor(() =>
    expect(screen.getByLabelText("End Date")).toHaveValue("2026-11-05"),
  );
  expect(PreviewBudgetWindow).toHaveBeenCalledWith("2026-10-23", "biweekly");
  await user.selectOptions(
    screen.getByLabelText("Budget period length"),
    "custom",
  );
  await user.clear(screen.getByLabelText("End Date"));
  await user.type(screen.getByLabelText("End Date"), "2026-11-12");
  expect(screen.getByLabelText("End Date")).toHaveValue("2026-11-12");
});
