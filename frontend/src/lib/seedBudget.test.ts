import { afterEach, expect, it, vi } from 'vitest';
import { SeedOnboarding } from '../wailsAdapter';
import { seedInitialBudget } from './seedBudget';

vi.mock('../wailsAdapter', () => ({
  SeedOnboarding: vi.fn().mockResolvedValue(undefined),
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
    paychecks: [
      { name: 'Pay', amount: 500, cadence: 'weekly', anchorDate: '2026-10-23', secondDay: 0 },
    ],
  });
  expect(SeedOnboarding).toHaveBeenLastCalledWith(
    'October 2026 Budget',
    '2026-10-23',
    '2026-11-05',
    [],
    [
      {
        name: 'Pay',
        amount: 500,
        active: true,
        schedule: { cadence: 'weekly', anchorDate: '2026-10-23', secondDay: 0, endDate: '' },
      },
    ]
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
  expect(SeedOnboarding).toHaveBeenCalledWith(
    'November 2026 Budget',
    '2026-11-01',
    '2026-11-30',
    [],
    []
  );
});
