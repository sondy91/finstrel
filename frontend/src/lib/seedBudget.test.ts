import { afterEach, expect, it, vi } from 'vitest';
import { AddBudgetPeriod } from '../wailsAdapter';
import { seedInitialBudget } from './seedBudget';

vi.mock('../wailsAdapter', () => ({
  AddBudgetPeriod: vi.fn().mockResolvedValue({ id: 1 }),
  AddCategoryWithDefault: vi.fn(),
}));

afterEach(() => {
  vi.useRealTimers();
});

it('uses the chosen first period rather than the current month', async () => {
  await seedInitialBudget({
    accentColor: '',
    themeMode: 'dark',
    goals: [],
    categories: [],
    defaultAmounts: {},
    budgetStartDate: '2026-10-23',
    budgetEndDate: '2026-11-05',
  });
  expect(AddBudgetPeriod).toHaveBeenLastCalledWith(
    'October 2026 Budget',
    '2026-10-23',
    '2026-11-05',
    'Open'
  );
});

it('creates the initial budget with calendar dates through the last day of the month', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 2, 12));
  await seedInitialBudget({
    accentColor: '',
    themeMode: 'dark',
    goals: [],
    categories: [],
    defaultAmounts: {},
  });
  expect(AddBudgetPeriod).toHaveBeenCalledWith(
    'November 2026 Budget',
    '2026-11-01',
    '2026-11-30',
    'Open'
  );
});
