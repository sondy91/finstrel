import { dayLabel } from '@/lib/planning';
import { AlertTriangle, CalendarDays, CheckCircle2, CircleDollarSign, Landmark, Receipt, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/utils';
import { GetBudgetAllocationsByBudgetPeriodID, GetBudgetPeriods, GetCashFlowSummary, GetCategories, GetTransactions } from '@/wailsAdapter';
import { models } from '../../wailsjs/go/models';

function money(value: number) { return `$${formatMoney(Math.abs(value))}`; }

export default function DashboardPage(_props: { onNavigate?: (view: 'Budgets') => void }) {
  const [summary, setSummary] = useState<models.CashFlowSummary | null>(null);
  const [period, setPeriod] = useState<models.BudgetPeriod | null>(null);
  const [allocations, setAllocations] = useState<models.BudgetAllocation[]>([]);
  const [categories, setCategories] = useState<models.Category[]>([]);
  const [transactions, setTransactions] = useState<models.Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { async function load() { try {
    const [cashFlow, periods, cats, txs] = await Promise.all([GetCashFlowSummary(), GetBudgetPeriods(), GetCategories(), GetTransactions()]);
    setSummary(cashFlow); setCategories(cats || []); setTransactions(txs || []);
    const today = new Date(); const key = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const active = (periods || []).filter((p: models.BudgetPeriod) => p.status === 'Open' && String(p.startDate).slice(0,10)<=key && String(p.endDate).slice(0,10)>=key).sort((a: models.BudgetPeriod, b: models.BudgetPeriod) => String(b.startDate).localeCompare(String(a.startDate)))[0];
    setPeriod(active || null); if (active) setAllocations((await GetBudgetAllocationsByBudgetPeriodID(active.id)) || []);
  } catch (error) { console.error('Failed to load cash-flow dashboard:', error); } finally { setLoading(false); } } load(); }, []);

  // Budget details must never pull expenses from outside this selected period.
  const periodTransactions = period ? transactions.filter(t => { const d = String(t.date).slice(0,10); return d >= String(period.startDate).slice(0,10) && d <= String(period.endDate).slice(0,10); }) : [];
  const spentByCategory = periodTransactions.filter(t => t.type === 'Expense').reduce((result, tx) => { result[tx.categoryId] = (result[tx.categoryId] || 0) + Math.abs(tx.amount); return result; }, {} as Record<number, number>);
	const expenseAllocations = allocations.filter(allocation => categories.find(category => category.id === allocation.categoryId)?.type === 'Expense');
  if (loading) return <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">Loading cash-flow forecast…</div>;
  if (!summary) return <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">Unable to load your forecast.</div>;
  const payday = summary.nextPaycheckDate ? dayLabel(String(summary.nextPaycheckDate)) : null;
  const shortfall = summary.status === 'Shortfall'; const tight = summary.status === 'Tight';

  return <div className="page-container mx-auto max-w-7xl px-6 py-8">
    <div className="mb-8"><h1 className="text-3xl font-bold tracking-tight">Are we okay until payday?</h1><p className="mt-2 text-muted-foreground">Spendable cash, scheduled bills, and remaining envelopes—kept separate from your budget plan.</p></div>
    {!payday && <Card className="mb-6 border-yellow-500/50"><CardContent className="flex gap-3 pt-6"><CalendarDays className="h-5 w-5 text-yellow-600" /><div><p className="font-medium">Add your next payday to start a complete forecast.</p><p className="text-sm text-muted-foreground">Add an income schedule in Calendar. Each earner can have a different pay cycle.</p></div></CardContent></Card>}
    <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Stat title="Cash Available" value={money(summary.cashAvailable)} detail="Included accounts only" icon={<Wallet className="h-4 w-4" />} />
      <Stat title="Upcoming Bills" value={`-${money(summary.upcomingBills)}`} detail={payday ? `Due by ${payday}` : 'Set a payday to calculate'} icon={<Receipt className="h-4 w-4" />} />
      <Stat title="Flexible Spending Remaining" value={`-${money(summary.flexibleSpendingRemaining)}`} detail={period ? period.name : 'No open budget'} icon={<CircleDollarSign className="h-4 w-4" />} />
      <Stat title="Projected Balance" value={`${shortfall ? '-' : ''}${money(summary.projectedBalance)}`} detail="Before next deposit" icon={<Landmark className="h-4 w-4" />} emphasis={shortfall} />
    </div>
    <Card className="mb-8"><CardHeader><CardTitle className="flex items-center gap-2">{shortfall || tight ? <AlertTriangle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />} {summary.status}</CardTitle><CardDescription>{payday ? `Next payday: ${payday}` : 'Forecasting begins once a payday is configured.'}</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex justify-between"><span>Projected balance</span><strong>{summary.projectedBalance < 0 ? '-' : ''}{money(summary.projectedBalance)}</strong></div><div className="flex justify-between text-muted-foreground"><span>Desired cash buffer</span><span>-{money(summary.desiredCashBuffer)}</span></div><div className="flex justify-between border-t pt-3 text-lg"><span>Safe to spend</span><strong className={summary.safeToSpend < 0 ? 'text-destructive' : 'text-primary'}>{summary.safeToSpend < 0 ? '-' : ''}{money(summary.safeToSpend)}</strong></div></CardContent></Card>
	{period && <Card><CardHeader><CardTitle>Current envelope progress: {period.name}</CardTitle><CardDescription>Only expenses dated within this budget period are included.</CardDescription></CardHeader><CardContent className="space-y-4">{expenseAllocations.length ? expenseAllocations.map(a => { const spent = spentByCategory[a.categoryId] || 0; const remaining = a.allocatedAmount - spent; const category = categories.find(c => c.id === a.categoryId)?.name || 'Uncategorized'; return <div key={a.id}><div className="mb-1 flex justify-between text-sm"><span className="font-medium">{category}</span><span>{money(spent)} / {money(a.allocatedAmount)}</span></div><div className="h-2 overflow-hidden rounded bg-muted"><div className={remaining < 0 ? 'h-full bg-destructive' : 'h-full bg-primary'} style={{ width: `${Math.min(100, a.allocatedAmount ? spent / a.allocatedAmount * 100 : 0)}%` }} /></div><div className="mt-1 text-right text-xs text-muted-foreground">{remaining < 0 ? `${money(-remaining)} over` : `${money(remaining)} remaining`}</div></div> }) : <p className="text-muted-foreground">No expense envelopes in this budget period.</p>}</CardContent></Card>}
  </div>;
}

function Stat({ title, value, detail, icon, emphasis }: { title: string; value: string; detail: string; icon: React.ReactNode; emphasis?: boolean }) { return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle><span className="text-muted-foreground">{icon}</span></CardHeader><CardContent><div className={`text-2xl font-bold ${emphasis ? 'text-destructive' : ''}`}>{value}</div><p className="text-xs text-muted-foreground">{detail}</p></CardContent></Card>; }
