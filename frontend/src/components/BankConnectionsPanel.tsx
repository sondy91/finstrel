import { Building2, ChevronRight, RefreshCw } from 'lucide-react';
import { supportsBankHistory, type TransactionFilter } from '@/lib/transactionBrowser';
import { onBankFeedsUpdated } from '@/lib/bankUpdates';
import React, { useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  CancelBankLink,
  DisconnectBankFeed,
  FinishBankLink,
  GetBankFeedView,
  ImportBankFeed,
  ImportBankFeeds,
  StartBankLink,
} from '../wailsAdapter';

export interface BankFeedAccount {
  id: string;
  name: string;
  mask: string;
  type: string;
  subtype: string;
  currency: string;
  current: number | null;
  available: number | null;
  limit: number | null;
}
export interface BankFeedTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  currency: string;
  category: string;
  budgetCategoryId?: number;
  amount: number;
  pending: boolean;
}
export interface BankFeedLiability {
  accountId: string;
  kind: string;
  minimumPayment: number | null;
  nextPaymentDate: string;
  aprs: { percent: number | null; kind: string }[];
}
export interface BankFeedHolding {
  accountId: string;
  securityId: string;
  name: string;
  ticker: string;
  currency: string;
  quantity: number;
  value: number;
}
export interface BankFeedInvestmentTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  type: string;
  currency: string;
  amount: number;
  quantity: number;
}
export interface BankFeedItem {
  id: string;
  institution: string;
  status: string;
  lastImported: string;
  notice: string;
  accounts: BankFeedAccount[];
  transactions: BankFeedTransaction[];
  liabilities: BankFeedLiability[];
  holdings: BankFeedHolding[];
  investmentTransactions: BankFeedInvestmentTransaction[];
}
export interface BankFeedView {
  configured: boolean;
  environment: string;
  items: BankFeedItem[];
  pendingSession?: string;
}

function safeMessage(reason: unknown): string {
  if (typeof reason === 'string') return reason;
  if (reason instanceof Error) return reason.message;
  return 'The bank connection could not be updated. Please try again.';
}

const BankConnectionsPanel: React.FC<{
  onBrowseTransactions?: (filter: TransactionFilter) => void;
  centerControls?: boolean;
}> = ({ onBrowseTransactions, centerControls = false }) => {
  const [view, setView] = useState<BankFeedView | null>(null);
  const [busy, setBusy] = useState('Loading bank connections…');
  const [error, setError] = useState('');
  const [connectedNotice, setConnectedNotice] = useState('');
  const [checkingLink, setCheckingLink] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
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
    GetBankFeedView()
      .then((result) => {
        if (mounted.current) applyView(result);
      })
      .catch((reason) => {
        if (mounted.current) setError(safeMessage(reason));
      })
      .finally(() => {
        if (mounted.current) setBusy('');
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(
    () =>
      onBankFeedsUpdated(() => {
        GetBankFeedView()
          .then((result) => {
            if (mounted.current) applyView(result);
          })
          .catch((reason) => {
            if (mounted.current) setError(safeMessage(reason));
          });
      }),
    []
  );

  const run = async (message: string, operation: () => Promise<void>) => {
    if (operationLock.current || busy) return;
    operationLock.current = true;
    setBusy(message);
    setError('');
    try {
      await operation();
    } catch (reason) {
      if (mounted.current) setError(safeMessage(reason));
    } finally {
      operationLock.current = false;
      if (mounted.current) setBusy('');
    }
  };

  const startLink = (itemId = '') =>
    run('Opening bank sign-in…', async () => {
      setConnectedNotice('');
      const session = await StartBankLink(itemId);
      if (mounted.current) setPendingSession(session);
    });

  useEffect(() => {
    if (!pendingSession) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      if (!stopped) timer = setTimeout(check, 5000);
    };
    const check = async () => {
      if (operationLock.current) {
        schedule();
        return;
      }
      operationLock.current = true;
      if (mounted.current) setCheckingLink(true);
      try {
        const result = await FinishBankLink(pendingSession);
        if (stopped || !mounted.current) return;
        applyView(result);
        if (result.pendingSession) {
          schedule();
        } else {
          setError('');
          if ((result.items || []).some((item: BankFeedItem) => item.status === 'connected')) {
            setConnectedNotice('Bank connected successfully.');
          }
        }
      } catch (reason) {
        if (stopped || !mounted.current) return;
        try {
          const result = await GetBankFeedView();
          if (!stopped && mounted.current) applyView(result);
        } catch {
          /* Keep the original safe connection error. */
        }
        if (!stopped && mounted.current) setError(safeMessage(reason));
      } finally {
        operationLock.current = false;
        if (mounted.current) setCheckingLink(false);
      }
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pendingSession, pollAttempt]);

  const cancelLink = () =>
    run('Cancelling bank sign-in…', async () => {
      const result = await CancelBankLink(pendingSession);
      if (mounted.current) applyView(result);
    });

  const importFeed = (itemId: string) =>
    run('Importing bank updates…', async () => {
      const result = await ImportBankFeed(itemId);
      if (mounted.current) applyView(result);
    });

  const importAll = () =>
    run('Importing bank updates…', async () => {
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
  return (
    <section aria-label="Bank connections" className="mb-8 space-y-4">
      {view?.configured && (
        <div className={`flex items-center gap-2 ${centerControls ? 'justify-center py-3' : ''}`}>
          <Button
            disabled={!!busy || checkingLink || !!pendingSession}
            onClick={() => void startLink()}
          >
            Connect a bank
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={!!busy || checkingLink || !!pendingSession || !items.length}
            onClick={() => void importAll()}
            aria-label="Refresh all banks"
            title="Refresh all banks"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      )}
      {view && !view.configured && (
        <p className="rounded-md bg-muted p-3 text-sm">
          Plaid is not configured yet. Set up the backend Sandbox credentials on this device, then
          restart the app. Bank sign-in opens in your browser; this app does not ask for your bank
          password or API keys.
        </p>
      )}
      {connectedNotice && (
        <p
          role="status"
          className="rounded-md border border-green-600/40 bg-green-600/10 p-3 text-sm font-medium"
        >
          {connectedNotice}
        </p>
      )}
      {pendingSession && (
        <div className="space-y-2 text-sm">
          <p role="status">
            Waiting for bank sign-in. We'll connect automatically when it's complete.
          </p>
          {error && (
            <Button
              variant="outline"
              disabled={!!busy || checkingLink}
              onClick={() => {
                setError('');
                setPollAttempt((value) => value + 1);
              }}
            >
              Try checking again
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={!!busy || checkingLink}
            onClick={() => void cancelLink()}
          >
            Cancel sign-in
          </Button>
        </div>
      )}
      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          {busy}
        </p>
      )}
      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {!busy && !view && (
        <Button
          variant="outline"
          onClick={() =>
            void run('Loading bank connections…', async () => {
              const result = await GetBankFeedView();
              if (mounted.current) applyView(result);
            })
          }
        >
          Try again
        </Button>
      )}
      {view?.configured && !items.length && !pendingSession && !busy && (
        <p className="text-sm text-muted-foreground">No banks connected yet.</p>
      )}

      {items.map((item) => {
        const status = item.status || 'unknown';
        const connected = status === 'connected';
        const statusLabel = connected
          ? 'Connected'
          : status === 'reconnect'
            ? 'Sign-in required'
            : status === 'revoked'
              ? 'Disconnected'
              : status === 'connecting'
                ? 'Connecting'
                : 'Needs attention';
        return (
          <Card key={item.id}>
            <CardHeader className="flex-row items-start justify-between space-y-0 gap-2 px-4 py-3">
              <details className="group min-w-0 flex-1">
                <summary className="flex min-h-8 cursor-pointer list-none flex-wrap items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                  />
                  <h3 className="text-lg font-semibold">
                    {item.institution || 'Connected institution'}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${connected ? 'bg-green-600/10 text-green-800 dark:text-green-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}
                  >
                    {statusLabel}
                  </span>
                  {view?.environment === 'sandbox' && (
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                      Test data
                    </span>
                  )}
                </summary>
                {!!item.accounts?.length && (
                  <ul
                    className="ml-6 mt-4 space-y-2 text-sm"
                    aria-label={`${item.institution || 'Connected bank'} accounts`}
                  >
                    {item.accounts.map((account) => (
                      <li key={account.id} className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {onBrowseTransactions &&
                        supportsBankHistory(account, item.transactions || []) ? (
                          <button
                            className="text-left hover:underline"
                            onClick={() =>
                              onBrowseTransactions({
                                source: 'connected',
                                itemId: item.id,
                                accountId: account.id,
                              })
                            }
                            aria-label={`View ${account.name} transactions`}
                          >
                            {account.name}
                            {account.mask ? ` · ••${account.mask}` : ''}
                          </button>
                        ) : (
                          <span>
                            {account.name}
                            {account.mask ? ` · ••${account.mask}` : ''}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {!item.accounts?.length && (
                  <p className="ml-6 mt-3 text-sm text-muted-foreground">
                    No accounts imported yet.
                  </p>
                )}
                {connected && item.notice && (
                  <p role="status" className="ml-6 mt-3 text-sm text-muted-foreground">
                    {item.notice}
                  </p>
                )}
              </details>
              <div className="flex shrink-0 gap-2">
                {(status === 'connected' || status === 'error') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!!busy || checkingLink || !!pendingSession}
                    onClick={() => void importFeed(item.id)}
                    aria-label={`Refresh ${item.institution || 'bank'}`}
                    title="Import available updates"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
                {status === 'reconnect' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!busy || checkingLink || !!pendingSession}
                    onClick={() => void startLink(item.id)}
                    aria-label={`Reconnect ${item.institution || 'institution'}`}
                  >
                    Reconnect
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!busy || checkingLink || !!pendingSession}
                  onClick={() => setDisconnectItem(item)}
                  aria-label={`Disconnect ${item.institution || 'institution'}`}
                >
                  Disconnect
                </Button>
              </div>
            </CardHeader>
            {!connected && item.notice && (
              <CardContent className="px-4 pb-3">
                <p role="status" className="text-sm text-muted-foreground">
                  {item.notice}
                </p>
              </CardContent>
            )}
          </Card>
        );
      })}

      <AlertDialog
        open={!!disconnectItem}
        onOpenChange={(open) => {
          if (!open) setDisconnectItem(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disconnect {disconnectItem?.institution || 'this institution'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke this app’s access and remove its locally imported bank data. Your
              manually entered accounts and budget will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connected</AlertDialogCancel>
            <AlertDialogAction disabled={!!busy} onClick={confirmDisconnect}>
              Disconnect bank
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default BankConnectionsPanel;
