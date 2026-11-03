import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import TransactionsPage from './TransactionsPage';
import * as api from '@/wailsAdapter';
import { onBankFeedsUpdated } from '@/lib/bankUpdates';
vi.mock('@/lib/bankUpdates', () => ({ onBankFeedsUpdated: vi.fn() }));
vi.mock('@/wailsAdapter', () => ({
  GetAccounts: vi.fn(),
  GetBankFeedView: vi.fn(),
  GetCategories: vi.fn(),
  GetTransactions: vi.fn(),
  SetBankTransactionCategory: vi.fn(),
}));
const account = {
  id: 'checking',
  name: 'Bank checking',
  mask: '1234',
  type: 'depository',
  subtype: 'checking',
  currency: 'USD',
  current: 100,
  available: 100,
  limit: null,
};
const tx = {
  id: 'same-id',
  accountId: 'checking',
  date: '2026-10-16',
  description: 'Grocery store',
  currency: 'USD',
  category: 'FOOD_AND_DRINK',
  amount: -25,
  pending: true,
};
const alpha = {
  id: 'alpha',
  institution: 'Alpha Bank',
  status: 'connected',
  lastImported: '',
  notice: '',
  accounts: [account],
  transactions: [
    tx,
    {
      ...tx,
      id: 'older',
      date: '2026-10-01',
      description: 'Older purchase',
      pending: false,
    },
  ],
  liabilities: [],
  holdings: [],
  investmentTransactions: [],
};
const beta = {
  ...alpha,
  id: 'beta',
  institution: 'Beta Bank',
  accounts: [{ ...account, name: 'Euro checking', currency: 'EUR' }],
  transactions: [
    {
      ...tx,
      description: 'Coffee abroad',
      currency: 'EUR',
      amount: -10,
      pending: false,
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(onBankFeedsUpdated).mockReturnValue(() => {});
  vi.mocked(api.GetAccounts).mockResolvedValue([
    { id: 1, name: 'Manual checking', type: 'Checking', currentBalance: 100 },
  ]);
  vi.mocked(api.GetCategories).mockResolvedValue([{ id: 1, name: 'Food', type: 'Expense' }]);
  vi.mocked(api.GetTransactions).mockResolvedValue([
    {
      id: 1,
      date: '2026-10-16T00:00:00Z',
      description: 'Manual grocery entry',
      amount: -25,
      categoryId: 1,
      accountId: 1,
      type: 'Expense',
      status: 'Cleared',
      notes: 'Manually recorded',
    },
  ]);
  vi.mocked(api.GetBankFeedView).mockResolvedValue({
    configured: true,
    environment: 'sandbox',
    items: [alpha, beta],
  });
});
it('saves a budget category for a connected transaction', async () => {
  const user = userEvent.setup();
  vi.mocked(api.SetBankTransactionCategory).mockResolvedValue({
    configured: true,
    environment: 'sandbox',
    items: [{ ...alpha, transactions: [{ ...tx, budgetCategoryId: 1 }] }],
  });
  render(<TransactionsPage />);
  await user.click(await screen.findByText('Grocery store'));
  await user.selectOptions(screen.getByLabelText('Budget category'), '1');
  expect(api.SetBankTransactionCategory).toHaveBeenCalledWith('alpha', 'same-id', 1);
});
it('keeps connected/manual records and currencies separate', async () => {
  const user = userEvent.setup();
  render(<TransactionsPage />);
  const table = await screen.findByRole('table', {
    name: 'Connected account transactions',
  });
  expect(within(table).getByText('Coffee abroad')).toBeInTheDocument();
  expect(within(table).queryByText('Manual grocery entry')).not.toBeInTheDocument();
  const summary = screen.getByRole('complementary', {
    name: 'Filtered transaction summary',
  });
  expect(summary).toHaveTextContent('USD');
  expect(summary).toHaveTextContent('EUR');
  expect(summary).toHaveTextContent('$50.00');
  expect(summary).toHaveTextContent('€10.00');
  await user.click(screen.getByRole('button', { name: /Manual ledger 1/ }));
  expect(screen.getByRole('table', { name: 'Manual ledger transactions' })).toHaveTextContent(
    'Manual grocery entry'
  );
});
it('uses institution-safe account IDs and inclusive dates that can be cleared', async () => {
  const user = userEvent.setup();
  render(
    <TransactionsPage
      initialFilter={{
        source: 'connected',
        itemId: 'alpha',
        accountId: 'checking',
        from: '2026-10-16',
        to: '2026-10-16',
      }}
    />
  );
  const table = await screen.findByRole('table', {
    name: 'Connected account transactions',
  });
  expect(within(table).getByText('Grocery store')).toBeInTheDocument();
  expect(within(table).queryByText('Coffee abroad')).not.toBeInTheDocument();
  expect(within(table).queryByText('Older purchase')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(within(table).getByText('Coffee abroad')).toBeInTheDocument();
  expect(within(table).getByText('Older purchase')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Search'), 'Coffee');
  expect(within(table).queryByText('Grocery store')).not.toBeInTheDocument();
});
it('opens transaction details and focuses on that account', async () => {
  const user = userEvent.setup();
  render(<TransactionsPage />);
  await user.click(
    await screen.findByRole('button', {
      name: 'View transaction Coffee abroad',
    })
  );
  const detail = screen.getByRole('dialog');
  expect(detail).toHaveTextContent('Beta Bank');
  expect(detail).toHaveTextContent('EUR');
  expect(detail).toHaveTextContent('Categorized USD transactions count toward budgets');
  expect(within(detail).queryByRole('textbox')).not.toBeInTheDocument();
  await user.click(
    within(detail).getByRole('button', {
      name: 'View this account’s transactions',
    })
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.getByRole('table', { name: 'Connected account transactions' })
  ).not.toHaveTextContent('Grocery store');
});
it('keeps manual entries accessible when bank history is locked', async () => {
  vi.mocked(api.GetBankFeedView).mockRejectedValue(new Error('Bank history locked'));
  render(<TransactionsPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Bank history locked');
  await userEvent.click(screen.getByRole('button', { name: /Manual ledger 1/ }));
  expect(
    await screen.findByRole('table', { name: 'Manual ledger transactions' })
  ).toHaveTextContent('Manual grocery entry');
});
it('paginates and resets the page after searching', async () => {
  vi.mocked(api.GetBankFeedView).mockResolvedValue({
    configured: true,
    environment: 'sandbox',
    items: [
      {
        ...alpha,
        transactions: Array.from({ length: 26 }, (_, i) => ({
          ...tx,
          id: String(i).padStart(2, '0'),
          description: `Purchase ${i}`,
        })),
      },
    ],
  });
  const user = userEvent.setup();
  render(<TransactionsPage />);
  const table = await screen.findByRole('table', {
    name: 'Connected account transactions',
  });
  expect(within(table).queryByText('Purchase 25')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next transactions page' }));
  expect(within(table).getByText('Purchase 25')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Search'), 'Purchase 0');
  expect(within(table).getByText('Purchase 0')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next transactions page' })).toBeDisabled();
});

it('shows the manual ledger while a bank read remains pending', async () => {
  vi.mocked(api.GetBankFeedView).mockImplementation(() => new Promise(() => {}));
  render(<TransactionsPage />);
  await userEvent.click(await screen.findByRole('button', { name: /Manual ledger 1/ }));
  expect(
    await screen.findByRole('table', { name: 'Manual ledger transactions' })
  ).toHaveTextContent('Manual grocery entry');
});
