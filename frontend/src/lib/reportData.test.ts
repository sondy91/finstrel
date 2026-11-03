import { expect, it } from 'vitest';
import { buildReportData } from './reportData';

it('orders months chronologically and combines categorized budget activity', () => {
  const categories = [
    { id: 1, name: 'Food', type: 'Expense' },
    { id: 2, name: 'Pay', type: 'Income' },
  ] as any;
  const manual = [
    { date: '2026-12-03', categoryId: 1, type: 'Expense', amount: -20 },
    { date: '2026-02-01', categoryId: 2, type: 'Income', amount: 100 },
  ] as any;
  const feeds = {
    items: [
      {
        transactions: [
          { date: '2026-12-04', budgetCategoryId: 1, currency: 'USD', amount: -30 },
          {
            date: '2026-12-05',
            budgetCategoryId: 1,
            currency: 'USD',
            amount: -99,
            excludeFromBudget: true,
          },
          { date: '2026-12-06', budgetCategoryId: 1, currency: 'EUR', amount: -50 },
          { date: '2026-12-07', currency: 'USD', amount: -50 },
        ],
      },
    ],
    archivedItems: [
      { transactions: [{ date: '2026-12-08', budgetCategoryId: 1, currency: 'USD', amount: 5 }] },
    ],
  } as any;
  const report = buildReportData(manual, categories, feeds);
  expect(report.monthlyData.map((month) => month.key)).toEqual(['2026-02', '2026-12']);
  expect(report.monthlyData[0].income).toBe(100);
  expect(report.monthlyData[1].expense).toBe(45);
  expect(report.categoryData).toEqual([{ name: 'Food', value: 45 }]);
  expect(report.excluded).toBe(2);
});
