import { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GetBudgetReview, UpdateBudgetPeriodStatus } from '@/wailsAdapter';
import { dayLabel, errorText, todayKey } from '@/lib/planning';
import { bankMoney, type TransactionFilter } from '@/lib/transactionBrowser';
import { models } from '../../wailsjs/go/models';

type Review = {
  manualCount: number;
  manualPending: number;
  manualExpenses: number;
  spentByCategory: Record<string, number>;
  uncategorizedCount: number;
  unsupportedCurrencyCount: number;
  plannedExpenses: number;
  importedCount: number;
  importedPending: number;
  importedExpensesUSD: number;
  environment: string;
  bankNotice: string;
  imported: {
    date: string;
    institution: string;
    description: string;
    category: string;
    currency: string;
    amount: number;
    pending: boolean;
  }[];
};
export default function BudgetCloseoutPanel({
  periods,
  selected,
  onSelect,
  onClosed,
  revision = 0,
  onBrowseTransactions,
}: {
  periods: models.BudgetPeriod[];
  selected: models.BudgetPeriod | null;
  onSelect: (p: models.BudgetPeriod) => void;
  onClosed: () => void;
  revision?: number;
  onBrowseTransactions?: (filter: TransactionFilter) => void;
}) {
  const queue = periods
    .filter((p) => p.status === 'Open' && String(p.endDate).slice(0, 10) < todayKey())
    .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));
  const [reviewId, setReviewId] = useState<number | null>(null);
  const reviewPeriod = queue.find((p) => p.id === reviewId);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setReview(null);
    setChecked(false);
    setError('');
    if (reviewPeriod)
      GetBudgetReview(reviewPeriod.id)
        .then((v: Review) => {
          if (active) setReview(v);
        })
        .catch((e: unknown) => {
          if (active) setError(errorText(e));
        });
    return () => {
      active = false;
    };
  }, [reviewPeriod?.id, reviewPeriod?.startDate, reviewPeriod?.endDate, revision]);
  const close = async () => {
    if (!reviewPeriod || !checked || busy) return;
    setBusy(true);
    try {
      await UpdateBudgetPeriodStatus(reviewPeriod.id, 'Closed');
      setReviewId(null);
      onClosed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const browse = () => {
    if (!reviewPeriod || !onBrowseTransactions) return;
    const filter: TransactionFilter = {
      source: 'connected',
      from: String(reviewPeriod.startDate).slice(0, 10),
      to: String(reviewPeriod.endDate).slice(0, 10),
    };
    setReviewId(null);
    onBrowseTransactions(filter);
  };
  if (!queue.length) return null;
  const spent = review
    ? Object.values(review.spentByCategory || {}).reduce((sum, amount) => sum + amount, 0)
    : 0;
  const remaining = review ? review.plannedExpenses - spent : 0;
  return (
    <section
      className="mb-6 rounded-lg border bg-muted/20 px-4 py-3"
      aria-label="Budget closeout queue"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Clock3 className="h-4 w-4 text-muted-foreground" />
          Finish past budgets{' '}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{queue.length}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {queue.map((p) => (
            <Button
              key={p.id}
              variant={selected?.id === p.id ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                onSelect(p);
                setReviewId(p.id);
              }}
            >
              Review {p.name}
            </Button>
          ))}
        </div>
      </div>
      <Dialog
        open={!!reviewPeriod}
        onOpenChange={(open) => {
          if (!open && !busy) setReviewId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Finish {reviewPeriod?.name}</DialogTitle>
            <DialogDescription>
              {reviewPeriod
                ? `${dayLabel(String(reviewPeriod.startDate))} – ${dayLabel(String(reviewPeriod.endDate))}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!review && !error && (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
              Loading review…
            </p>
          )}
          {review && (
            <div className="space-y-6">
              <section aria-label="Expense summary">
                <div className="grid grid-cols-3 divide-x rounded-lg border bg-muted/20 py-5">
                  {[
                    ['Planned', review.plannedExpenses],
                    ['Spent', spent],
                    ['Remaining', remaining],
                  ].map(([label, value]) => (
                    <div key={label} className="px-4">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p
                        className={`mt-1 text-xl font-semibold tabular-nums ${label === 'Remaining' && remaining < 0 ? 'text-destructive' : ''}`}
                      >
                        {bankMoney(Number(value), 'USD')}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Categorized USD transactions count toward spending.
                </p>
              </section>
              <section className="space-y-3" aria-label="Bank history">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Bank history{' '}
                      <span className="ml-1 font-normal text-muted-foreground">
                        {review.importedCount} transactions
                      </span>
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {bankMoney(review.importedExpensesUSD, 'USD')} USD outflows
                    </p>
                  </div>
                  {onBrowseTransactions && (
                    <Button variant="outline" size="sm" onClick={browse}>
                      Review bank transactions <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {review.uncategorizedCount > 0 && (
                    <span className="rounded bg-amber-500/10 px-2 py-1 text-xs">
                      {review.uncategorizedCount} uncategorized
                    </span>
                  )}
                  {review.unsupportedCurrencyCount > 0 && (
                    <span className="rounded bg-amber-500/10 px-2 py-1 text-xs">
                      {review.unsupportedCurrencyCount} non-USD excluded
                    </span>
                  )}
                  {review.environment === 'sandbox' && (
                    <span className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-300">
                      Test bank data
                    </span>
                  )}
                  {review.manualPending + review.importedPending > 0 && (
                    <span className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-300">
                      {review.manualPending + review.importedPending} pending records
                    </span>
                  )}
                </div>
                {review.bankNotice?.includes('could not be opened') && (
                  <p role="alert" className="text-sm text-destructive">
                    Bank history unavailable. Check Accounts before closing.
                  </p>
                )}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Source details</summary>
                  <p className="mt-2 max-w-prose leading-relaxed">
                    {review.bankNotice} {review.manualCount} manual records ({review.manualPending}{' '}
                    pending); {review.importedCount} bank records ({review.importedPending}{' '}
                    pending). Bank and manual records may overlap.{' '}
                    {review.environment === 'sandbox' ? 'Test bank data is simulated.' : ''}
                  </p>
                </details>
              </section>
              <footer className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                  />
                  I’ve checked this period.
                </label>
                <Button disabled={!checked || busy} onClick={() => void close()}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {busy ? 'Closing…' : 'Close budget'}
                </Button>
              </footer>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
