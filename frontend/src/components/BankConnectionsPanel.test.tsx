import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BankConnectionsPanel, { type BankFeedItem, type BankFeedView } from './BankConnectionsPanel';
import * as Adapter from '../wailsAdapter';

vi.mock('../wailsAdapter', () => ({
    GetBankFeedView: vi.fn(),
    StartBankLink: vi.fn(),
    FinishBankLink: vi.fn(),
    CancelBankLink: vi.fn(),
    ImportBankFeeds: vi.fn(),
    DisconnectBankFeed: vi.fn(),
}));

const emptyView: BankFeedView = { configured: true, environment: 'sandbox', items: [] };
const bank: BankFeedItem = {
    id: 'local-item-1', institution: 'Test Bank', status: 'connected',
    lastImported: '2026-10-17T12:00:00Z', notice: 'Updates may take a few minutes.',
    accounts: [
        { id: 'checking', name: 'Household checking', mask: '1234', type: 'depository', subtype: 'checking', currency: 'USD', current: 1250.50, available: null, limit: null },
        { id: 'card', name: 'Household card', mask: '5678', type: 'credit', subtype: 'credit card', currency: 'USD', current: null, available: null, limit: 5000 },
    ],
    transactions: [{ id: 'tx-1', accountId: 'checking', date: '2026-10-16', description: 'Groceries', currency: 'USD', category: 'FOOD_AND_DRINK', amount: -25, pending: true }],
    liabilities: [{ accountId: 'card', kind: 'credit_card', minimumPayment: null, nextPaymentDate: '', aprs: [{ percent: 19.99, kind: 'purchase' }, { percent: null, kind: 'cash' }] }],
    holdings: [{ accountId: 'checking', securityId: 'sec-1', name: 'Example Fund', ticker: 'EXMP', currency: 'USD', quantity: 2.125, value: 100 }],
    investmentTransactions: [{ id: 'inv-1', accountId: 'checking', date: '2026-10-15', description: 'Example fund purchase', type: 'buy', currency: 'USD', amount: 100, quantity: 2.125 }],
};

async function load(view: BankFeedView = emptyView) {
    vi.mocked(Adapter.GetBankFeedView).mockResolvedValueOnce(view);
    render(<BankConnectionsPanel />);
    await waitFor(() => expect(screen.queryByText('Loading bank connections…')).not.toBeInTheDocument());
}

beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);

describe('BankConnectionsPanel', () => {
    it('explains backend setup without asking for secrets', async () => {
        await load({ ...emptyView, configured: false });
        expect(screen.getByText(/Plaid is not configured yet/)).toBeInTheDocument();
        expect(screen.getByText(/Sandbox — test accounts only/)).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(document.querySelector('input[type="password"]')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Connect a bank' })).not.toBeInTheDocument();
        expect(Adapter.StartBankLink).not.toHaveBeenCalled();
    });

    it('keeps unfinished sign-in resumable and recovers after a completion error', async () => {
        const user = userEvent.setup();
        await load();
        vi.mocked(Adapter.StartBankLink).mockResolvedValueOnce('opaque-session');
        await user.click(screen.getByRole('button', { name: 'Connect a bank' }));
        expect(Adapter.StartBankLink).toHaveBeenCalledWith('');
        const finish = await screen.findByRole('button', { name: 'I finished sign-in' });
        await waitFor(() => expect(finish).toBeEnabled());
        expect(screen.getByRole('button', { name: 'Connect a bank' })).toBeDisabled();

        vi.mocked(Adapter.FinishBankLink).mockRejectedValueOnce(new Error('Sign-in is still waiting for completion.'));
        vi.mocked(Adapter.GetBankFeedView).mockResolvedValueOnce({ ...emptyView, pendingSession: 'opaque-session' });
        await user.click(finish);
        expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in is still waiting for completion.');
        expect(screen.getByRole('button', { name: 'I finished sign-in' })).toBeEnabled();

        vi.mocked(Adapter.FinishBankLink).mockResolvedValueOnce({ ...emptyView, items: [bank] });
        await user.click(screen.getByRole('button', { name: 'I finished sign-in' }));
        expect(await screen.findByRole('heading', { name: 'Test Bank' })).toBeInTheDocument();
        expect(Adapter.FinishBankLink).toHaveBeenNthCalledWith(2, 'opaque-session');
        expect(screen.queryByRole('button', { name: 'I finished sign-in' })).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('restores a persisted sign-in and clears it when the backend reports expiry', async () => {
        const user = userEvent.setup();
        await load({ ...emptyView, pendingSession: 'restored-session' });
        vi.mocked(Adapter.StartBankLink).mockResolvedValueOnce('restored-session');
        await user.click(screen.getByRole('button', { name: 'Open sign-in again' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'I finished sign-in' })).toBeEnabled());
        vi.mocked(Adapter.FinishBankLink).mockRejectedValueOnce(new Error('This sign-in expired. Please start again.'));
        vi.mocked(Adapter.GetBankFeedView).mockResolvedValueOnce(emptyView);
        await user.click(screen.getByRole('button', { name: 'I finished sign-in' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('This sign-in expired. Please start again.');
        expect(screen.queryByRole('button', { name: 'I finished sign-in' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Connect a bank' })).toBeEnabled();
    });

    it('renders nullable balances and debt terms and keeps investments separate from spending', async () => {
        const user = userEvent.setup();
        await load({ ...emptyView, items: [bank] });
        expect(screen.getByText('$1,250.50')).toBeInTheDocument();
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
        expect(screen.getByText(/Importing does not change those amounts/)).toBeInTheDocument();

        await user.click(screen.getByText('Bank and card transactions (1)'));
        const transactions = screen.getByRole('table', { name: 'Test Bank bank and card transactions' });
        expect(within(transactions).getByText('Groceries')).toBeInTheDocument();
        expect(within(transactions).getByText('-$25.00')).toBeInTheDocument();
        expect(within(transactions).getByText('Pending')).toBeInTheDocument();
        expect(within(transactions).queryByText('Example fund purchase')).not.toBeInTheDocument();

        await user.click(screen.getByText('Debt payments and rates (1)'));
        expect(screen.getByText('19.99%')).toBeVisible();
        expect(screen.getByText('cash APR')).toBeVisible();
        await user.click(screen.getByText('Investment holdings (1)'));
        expect(screen.getByRole('table', { name: 'Test Bank investment holdings' })).toHaveTextContent('Example Fund (EXMP)');
        await user.click(screen.getByText('Investment activity (1)'));
        expect(screen.getByRole('table', { name: 'Test Bank investment activity' })).toHaveTextContent('Example fund purchase');
    });

    it('paginates bank transactions and resets the page when filtering accounts', async () => {
        const user = userEvent.setup();
        const transactions = Array.from({ length: 26 }, (_, index) => ({
            ...bank.transactions[0], id: `tx-${String(index).padStart(2, '0')}`,
            description: `Purchase ${index}`, accountId: index === 25 ? 'card' : 'checking',
        }));
        await load({ ...emptyView, items: [{ ...bank, transactions }] });
        await user.click(screen.getByText('Bank and card transactions (26)'));
        const table = screen.getByRole('table', { name: 'Test Bank bank and card transactions' });
        expect(within(table).queryByText('Purchase 25')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Next transactions page' }));
        expect(within(table).getByText('Purchase 25')).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText('Filter transactions by account'), 'checking');
        expect(within(table).getByText('Purchase 0')).toBeInTheDocument();
        expect(within(table).queryByText('Purchase 25')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next transactions page' })).toBeDisabled();
    });

    it('prevents conflicting changes during import and supports reconnect', async () => {
        const user = userEvent.setup();
        await load({ ...emptyView, items: [bank] });
        let resolveImport!: (value: BankFeedView) => void;
        vi.mocked(Adapter.ImportBankFeeds).mockImplementationOnce(() => new Promise<BankFeedView>(resolve => { resolveImport = resolve; }));
        await user.click(screen.getByRole('button', { name: 'Import available updates' }));
        expect(screen.getByRole('button', { name: 'Connect a bank' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Reconnect Test Bank' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Disconnect Test Bank' })).toBeDisabled();
        resolveImport({ ...emptyView, items: [bank] });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Reconnect Test Bank' })).toBeEnabled());
        vi.mocked(Adapter.StartBankLink).mockResolvedValueOnce('update-session');
        await user.click(screen.getByRole('button', { name: 'Reconnect Test Bank' }));
        expect(Adapter.StartBankLink).toHaveBeenCalledWith(bank.id);
        expect(await screen.findByRole('button', { name: 'I finished sign-in' })).toBeInTheDocument();
    });

    it('requires confirmation before revoking and removing an imported connection', async () => {
        const user = userEvent.setup();
        await load({ ...emptyView, items: [bank] });
        await user.click(screen.getByRole('button', { name: 'Disconnect Test Bank' }));
        expect(screen.getByRole('alertdialog')).toHaveTextContent('Your manually entered accounts and budget will remain.');
        await user.click(screen.getByRole('button', { name: 'Keep connected' }));
        expect(Adapter.DisconnectBankFeed).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Disconnect Test Bank' }));
        vi.mocked(Adapter.DisconnectBankFeed).mockResolvedValueOnce(emptyView);
        await user.click(screen.getByRole('button', { name: 'Disconnect bank' }));
        await waitFor(() => expect(screen.queryByRole('heading', { name: 'Test Bank' })).not.toBeInTheDocument());
        expect(Adapter.DisconnectBankFeed).toHaveBeenCalledWith(bank.id);
    });
});

 it('lets an unopened sign-in be cancelled so imports can resume', async () => {
    vi.mocked(Adapter.CancelBankLink).mockResolvedValue({ ...emptyView, items: [bank] });
    await load({ ...emptyView, pendingSession: 'abandoned-sign-in', items: [bank] });
    expect(screen.getByRole('button', { name: 'Import available updates' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'I finished sign-in' })).not.toBeInTheDocument());
    expect(Adapter.CancelBankLink).toHaveBeenCalledWith('abandoned-sign-in');
    expect(screen.getByRole('button', { name: 'Import available updates' })).toBeEnabled();
 });
