import React, { useEffect, useId, useRef, useState } from 'react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
    CancelBankLink, DisconnectBankFeed, FinishBankLink, GetBankFeedView, ImportBankFeeds, StartBankLink,
} from '../wailsAdapter';

export interface BankFeedAccount {
    id: string; name: string; mask: string; type: string; subtype: string; currency: string;
    current: number | null; available: number | null; limit: number | null;
}
export interface BankFeedTransaction {
    id: string; accountId: string; date: string; description: string; currency: string;
    category: string; amount: number; pending: boolean;
}
export interface BankFeedLiability {
    accountId: string; kind: string; minimumPayment: number | null; nextPaymentDate: string;
    aprs: { percent: number | null; kind: string }[];
}
export interface BankFeedHolding {
    accountId: string; securityId: string; name: string; ticker: string; currency: string;
    quantity: number; value: number;
}
export interface BankFeedInvestmentTransaction {
    id: string; accountId: string; date: string; description: string; type: string;
    currency: string; amount: number; quantity: number;
}
export interface BankFeedItem {
    id: string; institution: string; status: string; lastImported: string; notice: string;
    accounts: BankFeedAccount[]; transactions: BankFeedTransaction[];
    liabilities: BankFeedLiability[]; holdings: BankFeedHolding[];
    investmentTransactions: BankFeedInvestmentTransaction[];
}
export interface BankFeedView {
    configured: boolean; environment: string; items: BankFeedItem[]; pendingSession?: string;
}

const PAGE_SIZE = 25;
const cellClass = 'px-3 py-2 text-left align-top';

function money(value: number | null | undefined, currency: string): string {
    if (value == null || !Number.isFinite(value)) return '—';
    if (currency) {
        try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
        catch { /* Some institutions use non-ISO currency codes. */ }
    }
    return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || '(currency unknown)'}`;
}

function dateLabel(value: string, withTime = false): string {
    if (!value || value.startsWith('0001-')) return '—';
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
    if (Number.isNaN(date.getTime())) return '—';
    return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

function safeMessage(reason: unknown): string {
    if (typeof reason === 'string') return reason;
    if (reason instanceof Error) return reason.message;
    return 'The bank connection could not be updated. Please try again.';
}

function Pagination({ page, count, onPage, label }: {
    page: number; count: number; onPage: (page: number) => void; label: string;
}) {
    const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    return <nav aria-label={`${label} pages`} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{count ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, count)} of ${count}` : '0 records'}</span>
        <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label={`Previous ${label.toLowerCase()} page`}>Previous</Button>
            <span>Page {page + 1} of {pages}</span>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} aria-label={`Next ${label.toLowerCase()} page`}>Next</Button>
        </div>
    </nav>;
}

function ConnectionData({ item }: { item: BankFeedItem }) {
    const selectId = useId();
    const [accountFilter, setAccountFilter] = useState('');
    const [transactionPage, setTransactionPage] = useState(0);
    const [investmentPage, setInvestmentPage] = useState(0);
    const accounts = item.accounts || [];
    const transactions = (item.transactions || []).filter(tx => !accountFilter || tx.accountId === accountFilter)
        .slice().sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    const activities = (item.investmentTransactions || []).slice().sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    const page = Math.min(transactionPage, Math.max(0, Math.ceil(transactions.length / PAGE_SIZE) - 1));
    const activityPage = Math.min(investmentPage, Math.max(0, Math.ceil(activities.length / PAGE_SIZE) - 1));
    const accountName = (id: string) => accounts.find(account => account.id === id)?.name || 'Unavailable account';
    const accountCurrency = (id: string) => accounts.find(account => account.id === id)?.currency || '';

    return <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map(account => <div key={account.id} className="rounded-lg border p-4">
                <h4 className="font-semibold">{account.name}{account.mask ? ` · ••${account.mask}` : ''}</h4>
                <p className="mb-3 text-xs text-muted-foreground">{account.subtype || account.type}</p>
                <dl className="space-y-1 text-sm">
                    <div className="flex justify-between gap-3"><dt>Current balance</dt><dd className="font-medium">{money(account.current, account.currency)}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Available</dt><dd>{money(account.available, account.currency)}</dd></div>
                    {account.limit != null && <div className="flex justify-between gap-3"><dt>Credit limit</dt><dd>{money(account.limit, account.currency)}</dd></div>}
                </dl>
            </div>)}
        </div>
        {!accounts.length && <p className="text-sm text-muted-foreground">No accounts have been imported yet.</p>}

        <details className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">Bank and card transactions ({(item.transactions || []).length})</summary>
            <div className="mt-4">
                <label htmlFor={selectId} className="mr-3 text-sm">Filter transactions by account</label>
                <select id={selectId} value={accountFilter} onChange={event => { setAccountFilter(event.target.value); setTransactionPage(0); }} className="rounded-md border bg-background px-3 py-2 text-sm">
                    <option value="">All accounts</option>
                    {accounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.mask ? ` · ••${account.mask}` : ''}</option>)}
                </select>
                <p className="my-3 text-xs text-muted-foreground">Positive amounts are money received; negative amounts are money spent. Pending transactions may change.</p>
                {!transactions.length ? <p className="text-sm text-muted-foreground">No transactions available for this selection.</p> : <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{item.institution} bank and card transactions</caption>
                        <thead className="border-b bg-muted/30"><tr><th scope="col" className={cellClass}>Date</th><th scope="col" className={cellClass}>Description</th><th scope="col" className={cellClass}>Account</th><th scope="col" className={cellClass}>Category</th><th scope="col" className={cellClass}>Amount</th></tr></thead>
                        <tbody>{transactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(tx => <tr key={tx.id} className="border-b last:border-0">
                            <td className={cellClass}>{dateLabel(tx.date)}</td><td className={cellClass}>{tx.description}{tx.pending && <span className="ml-2 text-xs text-muted-foreground">Pending</span>}</td>
                            <td className={cellClass}>{accountName(tx.accountId)}</td><td className={cellClass}>{tx.category || 'Uncategorized'}</td><td className={`${cellClass} whitespace-nowrap tabular-nums`}>{money(tx.amount, tx.currency)}</td>
                        </tr>)}</tbody>
                    </table>
                </div>}
                <Pagination page={page} count={transactions.length} onPage={setTransactionPage} label="Transactions" />
            </div>
        </details>

        <details className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">Debt payments and rates ({(item.liabilities || []).length})</summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(item.liabilities || []).map((debt, index) => <div key={`${debt.accountId}-${debt.kind}-${index}`} className="rounded-md bg-muted/30 p-3 text-sm">
                    <h4 className="font-semibold">{accountName(debt.accountId)}</h4>
                    <p className="text-xs text-muted-foreground">{debt.kind.replace(/_/g, ' ')}</p>
                    <dl className="mt-2 space-y-1">
                        <div className="flex justify-between gap-3"><dt>Minimum / next payment</dt><dd>{money(debt.minimumPayment, accountCurrency(debt.accountId))}</dd></div>
                        <div className="flex justify-between gap-3"><dt>Next payment due</dt><dd>{dateLabel(debt.nextPaymentDate)}</dd></div>
                        {(debt.aprs || []).map((apr, aprIndex) => <div key={aprIndex} className="flex justify-between gap-3"><dt>{apr.kind ? `${apr.kind.replace(/_/g, ' ')} APR` : 'APR'}</dt><dd>{apr.percent == null ? '—' : `${apr.percent.toLocaleString(undefined, { maximumFractionDigits: 4 })}%`}</dd></div>)}
                        {!(debt.aprs || []).length && <div className="flex justify-between gap-3"><dt>APR</dt><dd>—</dd></div>}
                    </dl>
                </div>)}
                {!(item.liabilities || []).length && <p className="text-sm text-muted-foreground">No debt terms available. Coverage varies by institution and account.</p>}
            </div>
        </details>

        <details className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">Investment holdings ({(item.holdings || []).length})</summary>
            <div className="mt-4 overflow-x-auto">
                {!(item.holdings || []).length ? <p className="text-sm text-muted-foreground">No holdings available yet.</p> : <table className="w-full text-sm">
                    <caption className="sr-only">{item.institution} investment holdings</caption>
                    <thead className="border-b bg-muted/30"><tr><th scope="col" className={cellClass}>Investment</th><th scope="col" className={cellClass}>Account</th><th scope="col" className={cellClass}>Quantity</th><th scope="col" className={cellClass}>Reported value</th></tr></thead>
                    <tbody>{(item.holdings || []).map((holding, index) => <tr key={`${holding.accountId}-${holding.securityId}-${index}`} className="border-b last:border-0"><td className={cellClass}>{holding.name || holding.ticker || 'Unknown security'}{holding.name && holding.ticker ? ` (${holding.ticker})` : ''}</td><td className={cellClass}>{accountName(holding.accountId)}</td><td className={cellClass}>{holding.quantity.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td><td className={cellClass}>{money(holding.value, holding.currency)}</td></tr>)}</tbody>
                </table>}
            </div>
        </details>

        <details className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">Investment activity ({activities.length})</summary>
            <div className="mt-4">
                <p className="mb-3 text-xs text-muted-foreground">Investment activity is separate from everyday spending. Amounts are shown as reported by the institution.</p>
                {!activities.length ? <p className="text-sm text-muted-foreground">No investment activity available yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm">
                    <caption className="sr-only">{item.institution} investment activity</caption>
                    <thead className="border-b bg-muted/30"><tr><th scope="col" className={cellClass}>Date</th><th scope="col" className={cellClass}>Description</th><th scope="col" className={cellClass}>Account</th><th scope="col" className={cellClass}>Type</th><th scope="col" className={cellClass}>Amount</th><th scope="col" className={cellClass}>Quantity</th></tr></thead>
                    <tbody>{activities.slice(activityPage * PAGE_SIZE, (activityPage + 1) * PAGE_SIZE).map(tx => <tr key={tx.id} className="border-b last:border-0"><td className={cellClass}>{dateLabel(tx.date)}</td><td className={cellClass}>{tx.description}</td><td className={cellClass}>{accountName(tx.accountId)}</td><td className={cellClass}>{tx.type}</td><td className={cellClass}>{money(tx.amount, tx.currency)}</td><td className={cellClass}>{tx.quantity.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td></tr>)}</tbody>
                </table></div>}
                <Pagination page={activityPage} count={activities.length} onPage={setInvestmentPage} label="Investment activity" />
            </div>
        </details>
    </div>;
}

const BankConnectionsPanel: React.FC = () => {
    const [view, setView] = useState<BankFeedView | null>(null);
    const [busy, setBusy] = useState('Loading bank connections…');
    const [error, setError] = useState('');
    const [pendingSession, setPendingSession] = useState('');
    const [disconnectItem, setDisconnectItem] = useState<BankFeedItem | null>(null);
    const operationLock = useRef(false);
    const mounted = useRef(true);
    const applyView = (result: BankFeedView) => {
        setView(result);
        setPendingSession(result.pendingSession || '');
    };

    useEffect(() => {
        mounted.current = true;
        GetBankFeedView().then(result => {
            if (mounted.current) applyView(result);
        }).catch(reason => {
            if (mounted.current) setError(safeMessage(reason));
        }).finally(() => {
            if (mounted.current) setBusy('');
        });
        return () => { mounted.current = false; };
    }, []);

    const run = async (message: string, operation: () => Promise<void>) => {
        if (operationLock.current || busy) return;
        operationLock.current = true;
        setBusy(message);
        setError('');
        try { await operation(); }
        catch (reason) { if (mounted.current) setError(safeMessage(reason)); }
        finally { operationLock.current = false; if (mounted.current) setBusy(''); }
    };

    const startLink = (itemId = '') => run('Opening bank sign-in…', async () => {
        const session = await StartBankLink(itemId);
        if (mounted.current) setPendingSession(session);
    });

    const finishLink = () => run('Checking bank sign-in…', async () => {
        try {
            const result = await FinishBankLink(pendingSession);
            if (mounted.current) applyView(result);
        } catch (reason) {
            // Refresh pending state after expiry; a not-ready session remains resumable.
            try { const result = await GetBankFeedView(); if (mounted.current) applyView(result); } catch { /* Keep the original safe connection error. */ }
            throw reason;
        }
    });

    const cancelLink = () => run('Cancelling bank sign-in…', async () => {
        const result = await CancelBankLink(pendingSession);
        if (mounted.current) applyView(result);
    });

    const importFeeds = () => run('Importing available bank updates…', async () => {
        const result = await ImportBankFeeds();
        if (mounted.current) applyView(result);
    });

    const confirmDisconnect = () => {
        if (!disconnectItem) return;
        const id = disconnectItem.id;
        setDisconnectItem(null);
        void run('Disconnecting bank…', async () => {
            const result = await DisconnectBankFeed(id);
            if (mounted.current) applyView(result);
        });
    };

    const items = view?.items || [];
    return <section aria-labelledby="bank-connections-title" className="mb-8 space-y-4">
        <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 id="bank-connections-title" className="text-xl font-semibold">Connected banks</h2>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Bring balances, transactions, debt terms, and investments together with Plaid.</p>
                </div>
                {view?.configured && <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="outline" disabled={!!busy || !!pendingSession || !items.length} onClick={() => void importFeeds()}>Import available updates</Button>
                    <Button disabled={!!busy || !!pendingSession} onClick={() => void startLink()}>Connect a bank</Button>
                </div>}
            </CardHeader>
            <CardContent className="space-y-4">
                {view?.environment === 'sandbox' && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><strong>Sandbox — test accounts only.</strong> These balances and transactions are simulated.</div>}
                <p className="text-sm text-muted-foreground">Imported bank data is stored encrypted on this device. Bank connections stay separate from manually entered accounts, budgets, and forecasts. Importing does not change those amounts. Bank figures may lag recent activity.</p>
                {view && !view.configured && <p className="rounded-md bg-muted p-3 text-sm">Plaid is not configured yet. Set up the backend Sandbox credentials on this device, then restart the app. Bank sign-in opens in your browser; this app does not ask for your bank password or API keys.</p>}
                {pendingSession && <div className="space-y-3 rounded-md border p-4">
                    <p className="text-sm">Complete the bank sign-in in your browser, then return here to finish connecting.</p>
                    <div className="flex flex-wrap gap-2"><Button disabled={!!busy} onClick={() => void finishLink()}>I finished sign-in</Button><Button variant="outline" disabled={!!busy} onClick={() => void startLink()}>Open sign-in again</Button><Button variant="ghost" disabled={!!busy} onClick={() => void cancelLink()}>Cancel sign-in</Button></div>
                </div>}
                {busy && <p role="status" className="text-sm text-muted-foreground">{busy}</p>}
                {error && <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
                {!busy && !view && <Button variant="outline" onClick={() => void run('Loading bank connections…', async () => { const result = await GetBankFeedView(); if (mounted.current) applyView(result); })}>Try again</Button>}
                {view?.configured && !items.length && !pendingSession && !busy && <p className="text-sm text-muted-foreground">No banks connected yet. Connect a Sandbox test bank to try an import.</p>}
            </CardContent>
        </Card>

        {items.map(item => <Card key={item.id}>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h3 className="text-lg font-semibold">{item.institution || 'Connected institution'}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{(item.status || 'connected').replace(/_/g, ' ')} · Last imported: {dateLabel(item.lastImported, true)}</p>
                    {item.notice && <p role="status" className="mt-2 max-w-2xl text-sm text-muted-foreground">{item.notice}</p>}
                </div>
                <div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" disabled={!!busy || !!pendingSession} onClick={() => void startLink(item.id)} aria-label={`Reconnect ${item.institution || 'institution'}`}>Reconnect</Button><Button variant="ghost" size="sm" disabled={!!busy || !!pendingSession} onClick={() => setDisconnectItem(item)} aria-label={`Disconnect ${item.institution || 'institution'}`}>Disconnect</Button></div>
            </CardHeader>
            <CardContent><ConnectionData item={item} /></CardContent>
        </Card>)}

        <AlertDialog open={!!disconnectItem} onOpenChange={open => { if (!open) setDisconnectItem(null); }}>
            <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Disconnect {disconnectItem?.institution || 'this institution'}?</AlertDialogTitle><AlertDialogDescription>This will revoke this app’s access and remove its locally imported bank data. Your manually entered accounts and budget will remain.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Keep connected</AlertDialogCancel><AlertDialogAction disabled={!!busy} onClick={confirmDisconnect}>Disconnect bank</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </section>;
};

export default BankConnectionsPanel;
