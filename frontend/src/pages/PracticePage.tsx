import { useState } from 'react';
import { Button } from '@/components/ui/button';
import BudgetPage from './BudgetPage';
import TransactionsPage from './TransactionsPage';
import ReportsPage from './ReportsPage';
import type { TransactionFilter } from '@/lib/transactionBrowser';
import type { PracticeSession } from '@/lib/practice';

export default function PracticePage({
  session,
  onReset,
  onExit,
}: {
  session: PracticeSession;
  onReset: () => void;
  onExit: () => void;
}) {
  const [view, setView] = useState<'budgets' | 'transactions' | 'reports'>('budgets');
  const [filter, setFilter] = useState<TransactionFilter>();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background px-6 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Practice household</p>
            <p className="text-xs text-muted-foreground">
              Changes stay here until you reset or leave. Your own budget is separate.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onReset}>
              Reset practice
            </Button>
            <Button size="sm" onClick={onExit}>
              Return to my budget
            </Button>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-6 pt-6" aria-label="Practice guide">
        <h1 className="text-xl font-semibold">Try finishing a pay period</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Review “Previous two weeks,” categorize the example dinner, and check the possible
          duplicate grocery purchase.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {session.hasPlaidData
            ? 'Your Plaid Sandbox history is copied with dates shifted for practice.'
            : 'Example bank data is included.'}{' '}
          Changes stay in practice. Unspent and overspent balances carry forward.
        </p>
        <nav aria-label="Practice views" className="mt-4 flex gap-2 border-b pb-3">
          <Button
            size="sm"
            variant={view === 'budgets' ? 'default' : 'outline'}
            aria-pressed={view === 'budgets'}
            onClick={() => setView('budgets')}
          >
            Practice budgets
          </Button>
          <Button
            size="sm"
            variant={view === 'transactions' ? 'default' : 'outline'}
            aria-pressed={view === 'transactions'}
            onClick={() => {
              setFilter(undefined);
              setView('transactions');
            }}
          >
            Practice transactions
          </Button>
          <Button
            size="sm"
            variant={view === 'reports' ? 'default' : 'outline'}
            aria-pressed={view === 'reports'}
            onClick={() => setView('reports')}
          >
            Practice reports
          </Button>
        </nav>
      </section>
      {view === 'budgets' ? (
        <BudgetPage
          onBrowseTransactions={(next) => {
            setFilter(next);
            setView('transactions');
          }}
        />
      ) : view === 'transactions' ? (
        <TransactionsPage key={JSON.stringify(filter) || 'all'} initialFilter={filter} />
      ) : (
        <ReportsPage />
      )}
    </div>
  );
}
