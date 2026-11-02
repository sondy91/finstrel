import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BankConnectionsPanel, { type BankFeedItem, type BankFeedView } from './BankConnectionsPanel';
import * as Adapter from '../wailsAdapter';
import { onBankFeedsUpdated } from '@/lib/bankUpdates';
vi.mock('@/lib/bankUpdates', () => ({ onBankFeedsUpdated: vi.fn() }));

vi.mock('../wailsAdapter', () => ({
  GetBankFeedView: vi.fn(),
  StartBankLink: vi.fn(),
  FinishBankLink: vi.fn(),
  CancelBankLink: vi.fn(),
  ImportBankFeed: vi.fn(),
  ImportBankFeeds: vi.fn(),
  DisconnectBankFeed: vi.fn(),
}));

const emptyView: BankFeedView = { configured: true, environment: 'sandbox', items: [] };
const bank: BankFeedItem = {
  id: 'local-item-1',
  institution: 'Test Bank',
  status: 'connected',
  lastImported: '2026-10-17T12:00:00Z',
  notice: 'Updates may take a few minutes.',
  accounts: [
    {
      id: 'checking',
      name: 'Household checking',
      mask: '1234',
      type: 'depository',
      subtype: 'checking',
      currency: 'USD',
      current: 1250.5,
      available: null,
      limit: null,
    },
    {
      id: 'card',
      name: 'Household card',
      mask: '5678',
      type: 'credit',
      subtype: 'credit card',
      currency: 'USD',
      current: null,
      available: null,
      limit: 5000,
    },
  ],
  transactions: [
    {
      id: 'tx-1',
      accountId: 'checking',
      date: '2026-10-16',
      description: 'Groceries',
      currency: 'USD',
      category: 'FOOD_AND_DRINK',
      amount: -25,
      pending: true,
    },
  ],
  liabilities: [
    {
      accountId: 'card',
      kind: 'credit_card',
      minimumPayment: null,
      nextPaymentDate: '',
      aprs: [
        { percent: 19.99, kind: 'purchase' },
        { percent: null, kind: 'cash' },
      ],
    },
  ],
  holdings: [
    {
      accountId: 'checking',
      securityId: 'sec-1',
      name: 'Example Fund',
      ticker: 'EXMP',
      currency: 'USD',
      quantity: 2.125,
      value: 100,
    },
  ],
  investmentTransactions: [
    {
      id: 'inv-1',
      accountId: 'checking',
      date: '2026-10-15',
      description: 'Example fund purchase',
      type: 'buy',
      currency: 'USD',
      amount: 100,
      quantity: 2.125,
    },
  ],
};

async function load(view: BankFeedView = emptyView) {
  vi.mocked(Adapter.GetBankFeedView).mockResolvedValueOnce(view);
  render(<BankConnectionsPanel />);
  await waitFor(() =>
    expect(screen.queryByText('Loading bank connections…')).not.toBeInTheDocument()
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(onBankFeedsUpdated).mockReturnValue(() => {});
});
afterEach(cleanup);

describe('BankConnectionsPanel', () => {
  it('explains backend setup without asking for secrets', async () => {
    await load({ ...emptyView, configured: false });
    expect(screen.getByText(/Plaid is not configured yet/)).toBeInTheDocument();
    expect(screen.queryByText('Test data')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connect a bank' })).not.toBeInTheDocument();
    expect(Adapter.StartBankLink).not.toHaveBeenCalled();
  });

  it('checks sign-in automatically and shows success only after connection', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(Adapter.GetBankFeedView).mockResolvedValueOnce(emptyView);
      await act(async () => {
        render(<BankConnectionsPanel />);
      });
      vi.mocked(Adapter.StartBankLink).mockResolvedValueOnce('opaque-session');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Connect a bank' }));
      });
      expect(screen.getByText(/waiting for bank sign-in/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'I finished sign-in' })).not.toBeInTheDocument();
      vi.mocked(Adapter.FinishBankLink)
        .mockResolvedValueOnce({ ...emptyView, pendingSession: 'opaque-session' })
        .mockResolvedValueOnce({ ...emptyView, items: [bank] });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(Adapter.FinishBankLink).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/bank connected successfully/i)).not.toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.getByText(/bank connected successfully/i)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Test Bank' })).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(Adapter.FinishBankLink).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not overlap checks or keep checking after leaving', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(Adapter.GetBankFeedView).mockResolvedValueOnce({
        ...emptyView,
        pendingSession: 'restored-session',
      });
      let finish!: (view: BankFeedView) => void;
      vi.mocked(Adapter.FinishBankLink).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      let unmount!: () => void;
      await act(async () => {
        ({ unmount } = render(<BankConnectionsPanel />));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(Adapter.FinishBankLink).toHaveBeenCalledTimes(1);
      unmount();
      await act(async () => {
        finish({ ...emptyView, pendingSession: 'restored-session' });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(Adapter.FinishBankLink).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops checking on an error and allows retry', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(Adapter.GetBankFeedView).mockResolvedValueOnce({
        ...emptyView,
        pendingSession: 'restored-session',
      });
      await act(async () => {
        render(<BankConnectionsPanel />);
      });
      vi.mocked(Adapter.FinishBankLink).mockRejectedValueOnce(new Error('Network unavailable'));
      vi.mocked(Adapter.GetBankFeedView).mockResolvedValueOnce({
        ...emptyView,
        pendingSession: 'restored-session',
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(Adapter.FinishBankLink).toHaveBeenCalledTimes(1);
      vi.mocked(Adapter.FinishBankLink).mockResolvedValueOnce({ ...emptyView, items: [bank] });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Try checking again' }));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.getByText(/bank connected successfully/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears an expired session and leaves the error actionable', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(Adapter.GetBankFeedView).mockResolvedValueOnce({
        ...emptyView,
        pendingSession: 'restored-session',
      });
      await act(async () => {
        render(<BankConnectionsPanel />);
      });
      vi.mocked(Adapter.FinishBankLink).mockRejectedValueOnce(
        new Error('This sign-in expired. Please start again.')
      );
      vi.mocked(Adapter.GetBankFeedView).mockResolvedValueOnce(emptyView);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This sign-in expired. Please start again.'
      );
      expect(screen.queryByText(/waiting for bank sign-in/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Connect a bank' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows connected institution and account names without detailed financial data', async () => {
    await load({ ...emptyView, items: [bank] });
    expect(screen.getByRole('heading', { name: 'Test Bank' })).toBeInTheDocument();
    expect(screen.getByText('Test Bank').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Connected')).toHaveClass('text-green-800');
    expect(screen.getByText('Test data')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect Test Bank' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Test Bank'));
    expect(screen.getByRole('list', { name: 'Test Bank accounts' })).toHaveTextContent(
      'Household checking'
    );
    expect(screen.getByRole('list', { name: 'Test Bank accounts' })).toHaveTextContent(
      'Household card'
    );
    expect(screen.queryByText('$1,250.50')).not.toBeInTheDocument();
    expect(screen.queryByText(/Debt payments and rates/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Investment holdings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bank and card transactions/i)).not.toBeInTheDocument();
  });

  it('does not label production connections as test data', async () => {
    await load({ ...emptyView, environment: 'production', items: [bank] });
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.queryByText('Test data')).not.toBeInTheDocument();
  });

  it('reloads the bank view after startup sync finishes', async () => {
    let notify!: () => void;
    vi.mocked(onBankFeedsUpdated).mockImplementation((listener) => {
      notify = listener;
      return () => {};
    });
    await load({ ...emptyView, items: [bank] });
    vi.mocked(Adapter.GetBankFeedView).mockResolvedValueOnce({
      ...emptyView,
      items: [{ ...bank, status: 'reconnect', notice: 'Sign in again.' }],
    });
    await act(async () => {
      notify();
    });
    expect(screen.getByText('Sign-in required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconnect Test Bank' })).toBeInTheDocument();
  });

  it('offers connect before refresh all above the bank list', async () => {
    const user = userEvent.setup();
    await load({ ...emptyView, items: [bank] });
    const connect = screen.getByRole('button', { name: 'Connect a bank' });
    const refresh = screen.getByRole('button', { name: 'Refresh all banks' });
    expect(
      connect.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      screen.queryByText('Manage your bank connections and import transactions.')
    ).not.toBeInTheDocument();
    vi.mocked(Adapter.ImportBankFeeds).mockResolvedValueOnce({ ...emptyView, items: [bank] });
    await user.click(refresh);
    expect(Adapter.ImportBankFeeds).toHaveBeenCalledOnce();
  });

  it('prevents conflicting changes during import and supports reconnect', async () => {
    const user = userEvent.setup();
    await load({ ...emptyView, items: [bank] });
    let resolveImport!: (value: BankFeedView) => void;
    vi.mocked(Adapter.ImportBankFeed).mockImplementationOnce(
      () =>
        new Promise<BankFeedView>((resolve) => {
          resolveImport = resolve;
        })
    );
    await user.click(screen.getByRole('button', { name: 'Refresh Test Bank' }));
    expect(Adapter.ImportBankFeed).toHaveBeenCalledWith(bank.id);
    expect(screen.getByRole('button', { name: 'Connect a bank' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh Test Bank' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disconnect Test Bank' })).toBeDisabled();
    resolveImport({ ...emptyView, items: [{ ...bank, status: 'reconnect' }] });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reconnect Test Bank' })).toBeEnabled()
    );
    vi.mocked(Adapter.StartBankLink).mockResolvedValueOnce('update-session');
    await user.click(screen.getByRole('button', { name: 'Reconnect Test Bank' }));
    expect(Adapter.StartBankLink).toHaveBeenCalledWith(bank.id);
    expect(await screen.findByText(/waiting for bank sign-in/i)).toBeInTheDocument();
  });

  it('requires confirmation before revoking and removing an imported connection', async () => {
    const user = userEvent.setup();
    await load({ ...emptyView, items: [bank] });
    await user.click(screen.getByRole('button', { name: 'Disconnect Test Bank' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Your manually entered accounts and budget will remain.'
    );
    await user.click(screen.getByRole('button', { name: 'Keep connected' }));
    expect(Adapter.DisconnectBankFeed).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Disconnect Test Bank' }));
    vi.mocked(Adapter.DisconnectBankFeed).mockResolvedValueOnce(emptyView);
    await user.click(screen.getByRole('button', { name: 'Disconnect bank' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Test Bank' })).not.toBeInTheDocument()
    );
    expect(Adapter.DisconnectBankFeed).toHaveBeenCalledWith(bank.id);
  });
});

it('lets an unopened sign-in be cancelled so imports can resume', async () => {
  vi.mocked(Adapter.CancelBankLink).mockResolvedValue({ ...emptyView, items: [bank] });
  await load({ ...emptyView, pendingSession: 'abandoned-sign-in', items: [bank] });
  expect(screen.getByRole('button', { name: 'Refresh Test Bank' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'I finished sign-in' })).not.toBeInTheDocument()
  );
  expect(Adapter.CancelBankLink).toHaveBeenCalledWith('abandoned-sign-in');
  expect(screen.getByRole('button', { name: 'Refresh Test Bank' })).toBeEnabled();
});

it('opens the correct institution and account in the transaction workspace', async () => {
  const browse = vi.fn();
  vi.mocked(Adapter.GetBankFeedView).mockResolvedValueOnce({ ...emptyView, items: [bank] });
  render(<BankConnectionsPanel onBrowseTransactions={browse} />);
  await userEvent.click(await screen.findByText('Test Bank'));
  await userEvent.click(
    screen.getByRole('button', { name: 'View Household checking transactions' })
  );
  expect(browse).toHaveBeenCalledWith({
    source: 'connected',
    itemId: 'local-item-1',
    accountId: 'checking',
  });
  expect(Adapter.ImportBankFeed).not.toHaveBeenCalled();
});

it('shows investment account names without exposing investment detail', async () => {
  const browse = vi.fn();
  const investment = {
    ...bank.accounts[0],
    id: 'ira',
    name: 'Retirement IRA',
    type: 'investment',
    subtype: 'ira',
  };
  vi.mocked(Adapter.GetBankFeedView).mockResolvedValueOnce({
    ...emptyView,
    items: [
      {
        ...bank,
        accounts: [investment],
        transactions: [],
        investmentTransactions: [{ ...bank.investmentTransactions[0], accountId: 'ira' }],
      },
    ],
  });
  render(<BankConnectionsPanel onBrowseTransactions={browse} />);
  await userEvent.click(await screen.findByText('Test Bank'));
  expect(screen.getByText(/Retirement IRA/)).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'View Retirement IRA transactions' })
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Investment activity (1)')).not.toBeInTheDocument();
});
