import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PreviewBudgetWindow } from "@/wailsAdapter";
import { errorText } from "@/lib/planning";

export default function BudgetDateFields({
  prefix,
  start,
  end,
  onStart,
  onEnd,
}: {
  prefix: string;
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  const [cadence, setCadence] = useState("biweekly");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    if (cadence === "custom" || !start) return;
    onEnd("");
    PreviewBudgetWindow(start, cadence)
      .then((v: { end: string }) => {
        if (active) onEnd(v.end);
      })
      .catch((e: unknown) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [cadence, start, onEnd]);
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor={`${prefix}-cadence`}>Budget period length</Label>
        <Select
          id={`${prefix}-cadence`}
          value={cadence}
          onChange={(e) => setCadence(e.target.value)}
        >
          <option value="weekly">Weekly (7 days)</option>
          <option value="biweekly">Every 2 weeks (14 days)</option>
          <option value="semimonthly">
            Twice monthly (1–15 and 16–month end)
          </option>
          <option value="monthly">Monthly</option>
          <option value="custom">Custom dates</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${prefix}-start-date`}>Start Date</Label>
          <Input
            id={`${prefix}-start-date`}
            type="date"
            required
            value={start}
            onChange={(e) => onStart(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`${prefix}-end-date`}>End Date</Label>
          <Input
            id={`${prefix}-end-date`}
            type="date"
            required
            value={end}
            readOnly={cadence !== "custom"}
            onChange={(e) => onEnd(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Category defaults are copied as amounts for this whole budget, without
        prorating. Review them when changing period length. Income schedules
        stay independent.
      </p>
    </div>
  );
}
