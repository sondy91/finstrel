import { models } from '../../wailsjs/go/models';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import BudgetCloseoutPanel from './BudgetCloseoutPanel';
import { GetBudgetReview, UpdateBudgetPeriodStatus } from '@/wailsAdapter';
vi.mock('@/wailsAdapter', () => ({
  GetBudgetReview: vi.fn(),
  UpdateBudgetPeriodStatus: vi.fn(),
}));
const old = new models.BudgetPeriod({
  id: 1,
  name: 'Old plan',
  startDate: '2020-01-01',
  endDate: '2020-01-14',
  status: 'Open',
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(GetBudgetReview).mockResolvedValue({
    manualCount: 2,
    manualPending: 1,
    manualExpenses: 25,
    spentByCategory: { 1: 55 },
    uncategorizedCount: 2,
    plannedExpenses: 100,
    importedCount: 3,
    importedPending: 1,
    importedExpensesUSD: 50,
    environment: 'sandbox',
    bankNotice: 'History may be incomplete.',
    imported: [],
  });
  vi.mocked(UpdateBudgetPeriodStatus).mockResolvedValue(undefined);
});
it('queues only ended open budgets, requiring review before closing without posting spending', async () => {
  const onClosed = vi.fn();
  const user = userEvent.setup();
  render(
    <BudgetCloseoutPanel
      periods={[
        old,
        new models.BudgetPeriod({
          ...old,
          id: 2,
          name: 'Future',
          startDate: '2099-01-01',
          endDate: '2099-01-14',
        }),
        new models.BudgetPeriod({
          ...old,
          id: 3,
          name: 'Closed',
          status: 'Closed',
        }),
      ]}
      selected={old}
      onSelect={vi.fn()}
      onClosed={onClosed}
    />
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(GetBudgetReview).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Review Old plan' }));
  await screen.findByText('Test bank data');
  expect(screen.getByRole('region', { name: 'Expense summary' })).toHaveTextContent('$55.00');
  expect(screen.getByText('2 uncategorized')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /review future/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /review closed/i })).not.toBeInTheDocument();
  const close = screen.getByRole('button', {
    name: 'Close budget',
  });
  expect(close).toBeDisabled();
  expect(UpdateBudgetPeriodStatus).not.toHaveBeenCalled();
  await user.click(screen.getByRole('checkbox'));
  await user.click(close);
  await waitFor(() => expect(UpdateBudgetPeriodStatus).toHaveBeenCalledWith(1, 'Closed'));
  expect(onClosed).toHaveBeenCalledOnce();
});
it('shows errors rather than presenting unread history as reconciled', async () => {
  vi.mocked(GetBudgetReview).mockRejectedValue(new Error('History unavailable'));
  render(
    <BudgetCloseoutPanel periods={[old]} selected={old} onSelect={vi.fn()} onClosed={vi.fn()} />
  );
  await userEvent.click(screen.getByRole('button', { name: 'Review Old plan' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('History unavailable');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('refreshes edited period totals and clears a previous acknowledgement', async () => {
  const user = userEvent.setup();
  const props = {
    periods: [old],
    selected: old,
    onSelect: vi.fn(),
    onClosed: vi.fn(),
  };
  const view = render(<BudgetCloseoutPanel {...props} revision={0} />);
  await user.click(screen.getByRole('button', { name: 'Review Old plan' }));
  await screen.findByRole('checkbox');
  await user.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('checkbox')).toBeChecked();
  view.rerender(<BudgetCloseoutPanel {...props} revision={1} />);
  await waitFor(() => expect(GetBudgetReview).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('checkbox')).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Close budget' })).toBeDisabled();
});

it('opens bank history within the reviewed period without closing it', async () => {
  const browse = vi.fn();
  render(
    <BudgetCloseoutPanel
      periods={[old]}
      selected={old}
      onSelect={vi.fn()}
      onClosed={vi.fn()}
      onBrowseTransactions={browse}
    />
  );
  await userEvent.click(screen.getByRole('button', { name: 'Review Old plan' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Review bank transactions' }));
  expect(browse).toHaveBeenCalledWith({
    source: 'connected',
    from: '2020-01-01',
    to: '2020-01-14',
  });
  expect(UpdateBudgetPeriodStatus).not.toHaveBeenCalled();
});
