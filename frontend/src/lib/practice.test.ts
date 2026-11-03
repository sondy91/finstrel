import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/wailsAdapter';
import { createPracticeSession, setPracticeSession } from './practice';
import type { BankFeedView } from '@/components/BankConnectionsPanel';

const feeds = (environment: string): BankFeedView => ({
  configured: true,
  environment,
  items: [
    {
      id: 'test-bank',
      institution: 'Plaid test bank',
      status: 'connected',
      lastImported: '',
      notice: '',
      accounts: [],
      transactions: [
        {
          id: 'test-transaction',
          accountId: 'test-account',
          date: '2026-10-20',
          description: 'Sandbox merchant',
          currency: 'USD',
          category: 'FOOD_AND_DRINK_GROCERIES',
          amount: -25,
          pending: false,
        },
      ],
      liabilities: [],
      holdings: [],
      investmentTransactions: [],
    },
  ],
});
afterEach(() => {
  setPracticeSession(null);
  vi.restoreAllMocks();
});
describe('practice household isolation', () => {
  it('shows categorized and uncategorized example spending without changing connected data', async () => {
    const source = feeds('sandbox');
    const practice = createPracticeSession(source, new Date(2026, 9, 26, 12));
    const initial = await practice.call('GetBudgetReview', [1]);
    expect(initial.spentByCategory[1]).toBe(121);
    expect(initial.uncategorizedCount).toBe(2);
    await practice.call('SetBankTransactionCategory', [
      'practice-example-bank',
      'practice-example-dinner',
      3,
    ]);
    const updated = await practice.call('GetBudgetReview', [1]);
    expect(updated.spentByCategory[3]).toBe(66);
    expect(updated.uncategorizedCount).toBe(1);
    await practice.call('SetBankTransactionExcluded', [
      'practice-example-bank',
      'practice-example-dinner',
      true,
    ]);
    expect((await practice.call('GetBudgetReview', [1])).spentByCategory[3]).toBe(42);
    expect(source.items[0].transactions[0].budgetCategoryId).toBeUndefined();
    const reset = await practice.reset().call('GetBankFeedView', []);
    expect(
      reset.items.find((item: { id: string }) => item.id === 'practice-example-bank')
        .transactions[1].budgetCategoryId
    ).toBe(0);
  });
  it('intercepts every adapter operation, including unsupported and dangerous ones, before the native bridge', async () => {
    const original = window.go;
    const native = vi.fn(() => {
      throw new Error('Native bridge reached');
    });
    window.go = { main: { App: new Proxy(original.main.App, { get: () => native }) } };
    try {
      setPracticeSession(createPracticeSession());
      for (const operation of Object.values(api)) {
        await Promise.resolve(operation()).catch(() => undefined);
      }
      expect(native).not.toHaveBeenCalled();
      await expect(api.ClearAllData()).rejects.toThrow('not available');
      await expect(api.StartBankLink()).rejects.toThrow('not available');
      await expect(api.ImportBankFeeds()).rejects.toThrow('not available');
      await expect(api.DisconnectBankFeed('test')).rejects.toThrow('not available');
      expect(native).not.toHaveBeenCalled();
    } finally {
      window.go = original;
    }
  });
  it('copies only Sandbox snapshots, does not mutate the source, and returns independent reads', async () => {
    const source = feeds('sandbox');
    const practice = createPracticeSession(source);
    const view = await practice.call('GetBankFeedView', []);
    view.items[0].transactions[0].description = 'Changed';
    expect((await practice.call('GetBankFeedView', [])).items[0].transactions[0].description).toBe(
      'Sandbox merchant'
    );
    expect(source.items[0].transactions[0].description).toBe('Sandbox merchant');
    const productionPractice = await createPracticeSession(feeds('production')).call(
      'GetBankFeedView',
      []
    );
    expect(productionPractice.items.map((item: { id: string }) => item.id)).toEqual([
      'practice-example-bank',
    ]);
  });
  it('creates 14 inclusive days, copies defaults rather than edited allocations or spending, and resets changes', async () => {
    const practice = createPracticeSession(feeds('sandbox'), new Date(2026, 9, 26, 12));
    setPracticeSession(practice);
    const old = (await api.GetBudgetPeriods())[0];
    const allocations = await api.GetBudgetAllocationsByBudgetPeriodID(old.id);
    await api.UpdateBudgetAllocation(allocations[0].id, 999);
    const window = await api.PreviewBudgetWindow('2026-10-26', 'biweekly');
    expect(window).toEqual({ start: '2026-10-26', end: '2026-11-08' });
    await api.UpdateBudgetPeriodStatus(old.id, 'Closed');
    const next = await api.AddBudgetPeriod('Next two weeks', window.start, window.end, 'Open');
    expect((await api.GetBudgetPeriods())[0].status).toBe('Closed');
    expect((await api.GetBudgetAllocationsByBudgetPeriodID(next.id))[0].allocatedAmount).toBe(350);
    expect((await api.GetBudgetReview(next.id)).manualExpenses).toBe(0);
    const reset = practice.reset();
    expect(await reset.call('GetBudgetPeriods', [])).toHaveLength(1);
    expect((await reset.call('GetBudgetPeriods', []))[0].status).toBe('Open');
    expect(reset.hasPlaidData).toBe(true);
  });
  it('brings old bank and investment timelines forward independently, preserving gaps and source data', async () => {
    const source = feeds('sandbox');
    source.items[0].transactions[0].date = '2020-03-08';
    source.items[0].transactions.push({
      ...source.items[0].transactions[0],
      id: 'older',
      date: '2020-03-01',
    });
    source.items[0].investmentTransactions = [
      {
        id: 'investment',
        accountId: 'ira',
        date: '2020-01-31',
        description: 'Test investment',
        type: 'buy',
        currency: 'USD',
        amount: 10,
        quantity: 1,
      },
    ];
    source.items[0].liabilities = [
      {
        accountId: 'loan',
        kind: 'student',
        minimumPayment: 50,
        nextPaymentDate: '2020-02-01',
        aprs: [],
      },
    ];
    source.items[0].lastImported = '2026-10-21T15:00:00Z';
    const practice = createPracticeSession(source, new Date(2026, 9, 26, 12));
    const view = await practice.call('GetBankFeedView', []);
    expect(view.items[0].transactions.map((t: { date: string }) => t.date)).toEqual([
      '2026-10-25',
      '2026-10-18',
    ]);
    expect(view.items[0].investmentTransactions[0].date).toBe('2026-10-25');
    expect(view.items[0].liabilities[0].nextPaymentDate).toBe('2026-11-02');
    expect(view.items[0].lastImported).toBe('2026-10-21T15:00:00Z');
    expect(view.items[0].transactions[0]).toMatchObject({
      id: 'test-transaction',
      amount: -25,
      category: 'FOOD_AND_DRINK_GROCERIES',
    });
    expect((await practice.call('GetBudgetReview', [1])).importedCount).toBe(4);
    expect(source.items[0].transactions[0].date).toBe('2020-03-08');
    expect(source.items[0].liabilities[0].nextPaymentDate).toBe('2020-02-01');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 9, 27, 12));
      const reset = await practice.reset().call('GetBankFeedView', []);
      expect(reset.items[0].transactions.map((t: { date: string }) => t.date)).toEqual([
        '2026-10-26',
        '2026-10-19',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
  it('keeps missing, invalid and sentinel dates unchanged and preserves timestamp times', async () => {
    const source = feeds('sandbox');
    source.items[0].transactions = ['2020-02-29T15:30:00Z', '', '0001-01-01', '2020-02-30'].map(
      (date, i) => ({ ...source.items[0].transactions[0], id: String(i), date })
    );
    const view = await createPracticeSession(source, new Date(2026, 9, 26, 12)).call(
      'GetBankFeedView',
      []
    );
    expect(view.items[0].transactions.map((t: { date: string }) => t.date)).toEqual([
      '2026-10-25T15:30:00Z',
      '',
      '0001-01-01',
      '2020-02-30',
    ]);
  });
  it('restores normal adapter routing after leaving practice', async () => {
    const original = window.go;
    const native = vi.fn().mockResolvedValue([{ id: 77, name: 'Own budget' }]);
    window.go = { main: { App: { ...original.main.App, GetBudgetPeriods: native } } };
    try {
      setPracticeSession(createPracticeSession());
      expect((await api.GetBudgetPeriods())[0].name).toBe('Previous two weeks');
      expect(native).not.toHaveBeenCalled();
      setPracticeSession(null);
      expect((await api.GetBudgetPeriods())[0].name).toBe('Own budget');
      expect(native).toHaveBeenCalledOnce();
    } finally {
      window.go = original;
    }
  });
});
