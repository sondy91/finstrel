import type { BankFeedView } from '@/components/BankConnectionsPanel';
import { dateKey } from './planning';

type Period = { id: number; name: string; startDate: string; endDate: string; status: string };
type Category = {
  id: number;
  name: string;
  type: string;
  defaultAmount: number;
  parentCategoryId: number | null;
};
type Allocation = {
  id: number;
  budgetPeriodId: number;
  categoryId: number;
  allocatedAmount: number;
};
type Transaction = {
  id: number;
  date: string;
  amount: number;
  type: string;
  description: string;
  categoryId: number;
  accountId: number;
  notes: string;
  status: string;
};
export interface PracticeSession {
  hasPlaidData: boolean;
  reset: () => PracticeSession;
  call: (name: string, args: any[]) => Promise<any>;
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// The adapter checks this before either native bridge. No unsupported practice
// action may fall through to the real ledger or a bank connection.
let session: PracticeSession | null = null;
export const getPracticeSession = () => session;
export const setPracticeSession = (next: PracticeSession | null) => {
  session = next;
};

// Shift calendar days in UTC arithmetic so DST cannot shorten or lengthen
// the preserved gaps. Keep timestamp suffixes and missing/sentinel dates intact.
const dayNumber = (value: string): number | null => {
  const key = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key.startsWith('0001-')) return null;
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key
    ? date.getTime() / 86400000
    : null;
};
function shiftTimeline(records: { date: string }[], target: string) {
  const days = records
    .map((record) => dayNumber(record.date))
    .filter((day): day is number => day !== null);
  if (!days.length) return;
  const offset = dayNumber(target)! - Math.max(...days);
  records.forEach((record) => {
    const day = dayNumber(record.date);
    if (day !== null)
      record.date =
        new Date((day + offset) * 86400000).toISOString().slice(0, 10) + record.date.slice(10);
  });
}

export function createPracticeSession(cached?: BankFeedView, now = new Date()): PracticeSession {
  const day = (offset: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    d.setDate(d.getDate() + offset);
    return dateKey(d);
  };
  // Only simulated Plaid snapshots can enter the practice household. A real
  // connection is neither copied, updated, nor needed to run this workflow.
  const feeds: BankFeedView =
    cached?.environment === 'sandbox'
      ? copy({
          ...cached,
          pendingSession: '',
          items: (cached.items || []).map((item) => ({
            ...item,
            accounts: item.accounts || [],
            transactions: item.transactions || [],
            liabilities: item.liabilities || [],
            holdings: item.holdings || [],
            investmentTransactions: item.investmentTransactions || [],
          })),
        })
      : { configured: false, environment: 'sandbox', items: [] };
  const hasPlaidData = feeds.items.length > 0;
  feeds.items.forEach((item) =>
    item.transactions.forEach((transaction) => {
      transaction.budgetCategoryId = 0;
    })
  );
  shiftTimeline(
    feeds.items.flatMap((item) => item.transactions),
    day(-1)
  );
  shiftTimeline(
    feeds.items.flatMap((item) => item.investmentTransactions),
    day(-1)
  );
  feeds.items.forEach((item) =>
    item.liabilities.forEach((liability) => {
      if (dayNumber(liability.nextPaymentDate) !== null)
        liability.nextPaymentDate = day(7) + liability.nextPaymentDate.slice(10);
    })
  );
  feeds.items.push({
    id: 'practice-example-bank',
    institution: 'Example bank',
    status: 'connected',
    lastImported: '',
    notice: '',
    accounts: [
      {
        id: 'practice-example-checking',
        name: 'Example checking',
        mask: '1234',
        type: 'depository',
        subtype: 'checking',
        currency: 'USD',
        current: null,
        available: null,
        limit: null,
      },
    ],
    transactions: [
      {
        id: 'practice-example-groceries',
        accountId: 'practice-example-checking',
        date: day(-5),
        description: 'Example grocery purchase',
        currency: 'USD',
        category: 'FOOD_AND_DRINK_GROCERIES',
        amount: -35,
        pending: false,
        budgetCategoryId: 1,
      },
      {
        id: 'practice-example-dinner',
        accountId: 'practice-example-checking',
        date: day(-3),
        description: 'Example dinner',
        currency: 'USD',
        category: 'FOOD_AND_DRINK_RESTAURANT',
        amount: -24,
        pending: false,
        budgetCategoryId: 0,
      },
    ],
    liabilities: [],
    holdings: [],
    investmentTransactions: [],
  });
  let nextId = 100;
  const categories: Category[] = [
    { id: 1, name: 'Groceries', type: 'Expense', defaultAmount: 350, parentCategoryId: null },
    {
      id: 2,
      name: 'Bills and payment plans',
      type: 'Expense',
      defaultAmount: 600,
      parentCategoryId: null,
    },
    { id: 3, name: 'Eating out', type: 'Expense', defaultAmount: 100, parentCategoryId: null },
    { id: 4, name: 'Household pay', type: 'Income', defaultAmount: 2800, parentCategoryId: null },
  ];
  const periods: Period[] = [
    { id: 1, name: 'Previous two weeks', startDate: day(-14), endDate: day(-1), status: 'Open' },
  ];
  const allocations: Allocation[] = categories.map((c) => ({
    id: nextId++,
    budgetPeriodId: 1,
    categoryId: c.id,
    allocatedAmount: c.defaultAmount,
  }));
  const transactions: Transaction[] = [
    {
      id: 1,
      date: day(-10),
      amount: -86,
      type: 'Expense',
      description: 'Practice grocery shop',
      categoryId: 1,
      accountId: 1,
      notes: 'Fictional manual entry',
      status: 'Cleared',
    },
    {
      id: 2,
      date: day(-7),
      amount: -42,
      type: 'Expense',
      description: 'Practice dinner',
      categoryId: 3,
      accountId: 1,
      notes: 'Fictional manual entry',
      status: 'Cleared',
    },
    {
      id: 3,
      date: day(-6),
      amount: -120,
      type: 'Expense',
      description: 'Practice utility bill',
      categoryId: 2,
      accountId: 1,
      notes: 'Fictional manual entry',
      status: 'Cleared',
    },
  ];
  const period = (id: number) => {
    const p = periods.find((p) => p.id === id);
    if (!p) throw new Error('Practice budget not found.');
    return p;
  };
  const populate = (id: number) => {
    period(id);
    categories.forEach((c) => {
      if (!allocations.some((a) => a.budgetPeriodId === id && a.categoryId === c.id))
        allocations.push({
          id: nextId++,
          budgetPeriodId: id,
          categoryId: c.id,
          allocatedAmount: c.defaultAmount,
        });
    });
  };
  const addPeriod = (name: string, startDate: string, endDate: string, status = 'Open') => {
    if (!name.trim() || !startDate || endDate <= startDate)
      throw new Error('Enter a name and an end date after the start date.');
    const p = { id: nextId++, name, startDate, endDate, status };
    periods.push(p);
    populate(p.id);
    return p;
  };
  const review = (id: number) => {
    const p = period(id);
    const inside = (date: string) =>
      date.slice(0, 10) >= p.startDate.slice(0, 10) && date.slice(0, 10) <= p.endDate.slice(0, 10);
    const manual = transactions.filter((t) => inside(t.date));
    const imported = feeds.items.flatMap((item) =>
      item.transactions
        .filter((t) => inside(t.date))
        .map((t) => ({ ...t, institution: item.institution }))
    );
    const spentByCategory: Record<number, number> = {};
    for (const t of manual)
      if (t.type === 'Expense')
        spentByCategory[t.categoryId] = (spentByCategory[t.categoryId] || 0) + Math.abs(t.amount);
    for (const t of imported)
      if (
        t.budgetCategoryId &&
        t.currency === 'USD' &&
        categories.some((c) => c.id === t.budgetCategoryId && c.type === 'Expense')
      )
        spentByCategory[t.budgetCategoryId] = (spentByCategory[t.budgetCategoryId] || 0) - t.amount;
    return {
      manualCount: manual.length,
      manualPending: manual.filter((t) => t.status === 'Pending').length,
      spentByCategory,
      uncategorizedCount: imported.filter((t) => !t.budgetCategoryId).length,
      manualExpenses: manual
        .filter((t) => t.type === 'Expense')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0),
      plannedExpenses: allocations
        .filter(
          (a) =>
            a.budgetPeriodId === id &&
            categories.find((c) => c.id === a.categoryId)?.type === 'Expense'
        )
        .reduce((sum, a) => sum + a.allocatedAmount, 0),
      importedCount: imported.length,
      importedPending: imported.filter((t) => t.pending).length,
      importedExpensesUSD: imported
        .filter((t) => t.currency === 'USD' && t.amount < 0)
        .reduce((sum, t) => sum - t.amount, 0),
      imported,
      environment: 'sandbox',
      bankNotice:
        'Practice manual entries are fictional. Plaid test dates are shifted for practice.',
    };
  };
  const preview = (start: string, cadence: string) => {
    const end = new Date(`${start}T12:00:00`);
    if (!Number.isFinite(end.getTime())) throw new Error('Choose a start date.');
    if (cadence === 'weekly' || cadence === 'biweekly')
      end.setDate(end.getDate() + (cadence === 'weekly' ? 6 : 13));
    else if (cadence === 'monthly' && end.getDate() === 1) end.setMonth(end.getMonth() + 1, 0);
    else if (cadence === 'semimonthly' && [1, 16].includes(end.getDate())) {
      if (end.getDate() === 1) end.setDate(15);
      else end.setMonth(end.getMonth() + 1, 0);
    } else
      throw new Error(
        'Choose the 1st for monthly budgets, or the 1st or 16th for twice-monthly budgets.'
      );
    return { start, end: dateKey(end) };
  };
  const actions: Record<string, (...args: any[]) => unknown> = {
    GetBudgetPeriods: () => periods,
    GetCategories: () => categories,
    GetAccounts: () => [
      {
        id: 1,
        name: 'Practice checking',
        type: 'Checking',
        balance: 2400,
        includeInCashFlow: true,
      },
    ],
    GetTransactions: () => transactions,
    GetBankFeedView: () => feeds,
    GetBudgetAllocationsByBudgetPeriodID: (id: number) =>
      allocations.filter((a) => a.budgetPeriodId === id),
    GetBudgetReview: review,
    PreviewBudgetWindow: preview,
    SetBankTransactionCategory: (itemId: string, transactionId: string, categoryId: number) => {
      const transaction = feeds.items
        .find((item) => item.id === itemId)
        ?.transactions.find((t) => t.id === transactionId);
      if (!transaction || (categoryId && !categories.some((c) => c.id === categoryId)))
        throw new Error('Transaction or category not found.');
      transaction.budgetCategoryId = categoryId;
      return feeds;
    },
    UpdateBudgetPeriodStatus: (id: number, status: string) => {
      if (!['Open', 'Closed'].includes(status)) throw new Error('Choose Open or Closed.');
      period(id).status = status;
    },
    AddBudgetPeriod: addPeriod,
    CloseAndCreateBudgetPeriod: (id: number, name: string, start: string, end: string) => {
      const old = period(id);
      if (old.status !== 'Open') throw new Error('This budget is already closed.');
      const next = addPeriod(name, start, end);
      old.status = 'Closed';
      return next;
    },
    PopulateBudgetPeriodFromDefaults: populate,
    UpdateBudgetPeriod: (id: number, name: string, startDate: string, endDate: string) =>
      Object.assign(period(id), { name, startDate, endDate }),
    AddBudgetAllocation: (budgetPeriodId: number, categoryId: number, allocatedAmount: number) => {
      period(budgetPeriodId);
      if (
        allocations.some((a) => a.budgetPeriodId === budgetPeriodId && a.categoryId === categoryId)
      )
        throw new Error('Category already has an envelope.');
      const a = { id: nextId++, budgetPeriodId, categoryId, allocatedAmount };
      allocations.push(a);
      return a;
    },
    UpdateBudgetAllocation: (id: number, amount: number) => {
      const a = allocations.find((a) => a.id === id);
      if (!a || !Number.isFinite(amount) || amount < 0)
        throw new Error('Enter a valid envelope amount.');
      a.allocatedAmount = amount;
      return a;
    },
    DeleteBudgetAllocation: (id: number) => {
      const i = allocations.findIndex((a) => a.id === id);
      if (i >= 0) allocations.splice(i, 1);
    },
    AddCategoryWithDefault: (
      name: string,
      type: string,
      parentCategoryId: number | null,
      defaultAmount: number
    ) => {
      const c = { id: nextId++, name, type, parentCategoryId, defaultAmount };
      categories.push(c);
      return c;
    },
    AddTransaction: (
      date: string,
      amount: number,
      type: string,
      description: string,
      categoryId: number,
      accountId: number,
      notes: string,
      status: string
    ) => {
      const t = {
        id: nextId++,
        date,
        amount,
        type,
        description,
        categoryId,
        accountId,
        notes,
        status,
      };
      transactions.push(t);
      return t;
    },
  };
  return {
    hasPlaidData,
    reset: (): PracticeSession => createPracticeSession(cached),
    async call(name: string, args: any[]) {
      const action = actions[name];
      if (!action) throw new Error('This action is not available in the practice household.');
      const result = action(...args);
      return result === undefined ? undefined : copy(result);
    },
  };
}
