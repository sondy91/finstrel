import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';

vi.mock('@/wailsAdapter', () => ({
  GetBudgetPeriods: vi.fn(async () => [
    { id: 1, name: 'Current', status: 'Open', startDate: '2020-01-01', endDate: '2099-12-31' },
  ]),
  GetBudgetAllocationsByBudgetPeriodID: vi.fn(async () => [
    { id: 1, categoryId: 1, allocatedAmount: 100 },
  ]),
  GetCashFlowSummary: vi.fn(async () => ({
    status: 'On track',
    cashAvailable: 1000,
    upcomingBills: 0,
    flexibleSpendingRemaining: 65,
    projectedBalance: 935,
    safeToSpend: 935,
    desiredCashBuffer: 0,
  })),
  GetCategories: vi.fn(async () => [{ id: 1, type: 'Expense', name: 'Food' }]),
  GetBudgetReview: vi.fn(async () => ({
    spentByCategory: { 1: 35 },
    uncategorizedCount: 2,
    unsupportedCurrencyCount: 1,
    manualCount: 1,
    importedCount: 2,
  })),
}));

it('shows combined spending and flags transactions needing review', async () => {
  render(<DashboardPage />);
  expect(await screen.findByText('$35.00 / $100.00')).toBeInTheDocument();
  expect(screen.getByText('2 bank transactions need a category')).toBeInTheDocument();
  expect(screen.getByText('1 non-USD transactions excluded')).toBeInTheDocument();
  expect(screen.getByText('Manual and bank transactions may overlap')).toBeInTheDocument();
});
