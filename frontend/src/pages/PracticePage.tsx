import { useState } from 'react';
import { Button } from '@/components/ui/button';
import BudgetPage from './BudgetPage';
import TransactionsPage from './TransactionsPage';
import type { TransactionFilter } from '@/lib/transactionBrowser';
import type { PracticeSession } from '@/lib/practice';

export default function PracticePage({ session, onReset, onExit }: { session: PracticeSession; onReset: () => void; onExit: () => void }) {
  const [view, setView] = useState<'budgets' | 'transactions'>('budgets');
  const [filter, setFilter] = useState<TransactionFilter>();
  return <div className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-40 border-b bg-background px-6 py-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div><p className="font-semibold">Practice household</p><p className="text-xs text-muted-foreground">Changes stay here until you reset or leave. Your own budget is separate.</p></div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={onReset}>Reset practice</Button><Button size="sm" onClick={onExit}>Return to my budget</Button></div>
      </div>
    </header>
    <section className="mx-auto max-w-7xl px-6 pt-6" aria-label="Practice guide">
      <h1 className="text-xl font-semibold">Try finishing a pay period</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Review “Previous two weeks,” check its transactions, then close it and start the next period. Change an envelope amount and see what carries forward.</p>
      <p className="mt-2 text-xs text-muted-foreground">{session.hasPlaidData ? 'Plaid test dates are shifted to the present for practice. No bank requests are made.' : 'No cached Plaid test data is available. Fictional manual entries are ready to try.'} Category defaults carry forward; past spending does not.</p>
      <nav aria-label="Practice views" className="mt-4 flex gap-2 border-b pb-3"><Button size="sm" variant={view === 'budgets' ? 'default' : 'outline'} aria-pressed={view === 'budgets'} onClick={() => setView('budgets')}>Practice budgets</Button><Button size="sm" variant={view === 'transactions' ? 'default' : 'outline'} aria-pressed={view === 'transactions'} onClick={() => { setFilter(undefined); setView('transactions'); }}>Practice transactions</Button></nav>
    </section>
    {view === 'budgets' ? <BudgetPage onBrowseTransactions={next => { setFilter(next); setView('transactions'); }} /> : <TransactionsPage key={JSON.stringify(filter) || 'all'} initialFilter={filter} />}
  </div>;
}
