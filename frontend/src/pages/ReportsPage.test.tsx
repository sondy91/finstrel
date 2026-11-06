import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import ReportsPage from './ReportsPage';
import * as api from '@/wailsAdapter';

vi.mock('@/wailsAdapter', () => ({
  GetTransactions: vi.fn(),
  GetCategories: vi.fn(),
  GetBankFeedView: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(api.GetTransactions).mockResolvedValue([]);
  vi.mocked(api.GetCategories).mockResolvedValue([]);
  vi.mocked(api.GetBankFeedView).mockResolvedValue({ items: [], archivedItems: [] });
});
it('shows clear empty states instead of empty charts', async () => {
  render(<ReportsPage />);
  expect(await screen.findByText('No transactions yet.')).toBeInTheDocument();
  expect(screen.getByText('No categorized spending yet.')).toBeInTheDocument();
});
it('shows an error when a source cannot be read', async () => {
  vi.mocked(api.GetBankFeedView).mockRejectedValue(new Error('unavailable'));
  render(<ReportsPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load report data.');
});
it('shows complete category names and percentages alongside the chart', async () => {
  vi.mocked(api.GetCategories).mockResolvedValue([
    { id: 1, name: 'Bills and payment plans', type: 'Expense' },
    { id: 2, name: 'Groceries', type: 'Expense' },
  ]);
  vi.mocked(api.GetTransactions).mockResolvedValue([
    { date: '2026-11-01', categoryId: 1, type: 'Expense', amount: -75 },
    { date: '2026-11-02', categoryId: 2, type: 'Expense', amount: -25 },
  ]);
  render(<ReportsPage />);
  expect(await screen.findByText('Bills and payment plans 75%')).toBeInTheDocument();
  expect(screen.getByText('Groceries 25%')).toBeInTheDocument();
});
