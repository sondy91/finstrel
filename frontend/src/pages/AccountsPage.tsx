import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/utils';
import { Banknote, Building, CreditCard, Plus, Trash2, Wallet } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { models } from '../../wailsjs/go/models';
import AddAccountForm from '../components/AddAccountForm';
import BankConnectionsPanel from '../components/BankConnectionsPanel';
import { DeleteAccount, GetAccounts, UpdateAccountCashFlowInclusion } from '../wailsAdapter';

type Account = models.Account;

const AccountsPage: React.FC = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState<boolean>(false);
    const [accountToDelete, setAccountToDelete] = useState<number | null>(null);

    const fetchAccounts = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await GetAccounts();
            setAccounts(result || []);
        } catch (err: any) {
            console.error("Error fetching accounts:", err);
            setError(err.message || 'Failed to fetch accounts');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    const handleAccountAdded = () => {
        fetchAccounts();
        setShowAddForm(false);
    };

    const confirmDeleteAccount = async () => {
        if (accountToDelete === null) return;
        try {
            await DeleteAccount(accountToDelete);
            fetchAccounts();
        } catch (err: any) {
            console.error("Error deleting account:", err);
            setError(err.message || 'Failed to delete account');
        } finally {
            setAccountToDelete(null);
        }
    };

    const toggleCashFlow = async (account: Account) => {
        try {
            await UpdateAccountCashFlowInclusion(account.id, !account.includeInCashFlow);
            setAccounts(current => current.map(a => a.id === account.id ? { ...a, includeInCashFlow: !a.includeInCashFlow } : a));
        } catch (err: any) { setError(err.message || 'Failed to update cash-flow inclusion'); }
    };

    const getAccountIcon = (type: string) => {
        switch (type.toLowerCase()) {
            case 'checking':
            case 'savings':
                return <Building className="h-5 w-5 text-muted-foreground" />;
            case 'credit card':
                return <CreditCard className="h-5 w-5 text-muted-foreground" />;
            case 'cash':
                return <Banknote className="h-5 w-5 text-muted-foreground" />;
            default:
                return <Wallet className="h-5 w-5 text-muted-foreground" />;
        }
    };

    return (
        <div className="page-container max-w-7xl mx-auto py-8 px-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
                    <p className="text-muted-foreground mt-2">
                        Manage your bank accounts, credit cards, and cash.
                    </p>
                </div>
                <Button onClick={() => setShowAddForm(!showAddForm)}>
                    {showAddForm ? 'Cancel' : <><Plus className="mr-2 h-4 w-4" /> Add Account</>}
                </Button>
            </div>

            <BankConnectionsPanel />

            {showAddForm && (
                <Card className="mb-8 border-primary/20 bg-primary/5">
                    <CardContent className="pt-6">
                        <AddAccountForm onAccountAdded={handleAccountAdded} />
                    </CardContent>
                </Card>
            )}

            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <p className="text-muted-foreground">Loading accounts...</p>
                </div>
            )}

            {error && (
                <div className="p-4 mb-6 text-sm text-destructive bg-destructive/10 rounded-md">
                    Error: {error}
                </div>
            )}

            {!isLoading && !error && accounts.length === 0 && !showAddForm && (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Accounts Found</h3>
                        <p className="text-muted-foreground mb-4 max-w-sm">
                            You haven't added any accounts yet. Add your first account to start tracking your balances.
                        </p>
                        <Button onClick={() => setShowAddForm(true)}>
                            Add New Account
                        </Button>
                    </CardContent>
                </Card>
            )}

            {!isLoading && !error && accounts.length > 0 && (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {accounts.map((account) => (
                        <Card key={account.id} className="overflow-hidden transition-all hover:shadow-md group">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-muted/30">
                                <div className="flex items-center gap-2">
                                    {getAccountIcon(account.type)}
                                    <CardTitle className="text-sm font-medium">
                                        {account.type}
                                    </CardTitle>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => setAccountToDelete(account.id)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </CardHeader>
                            <CardContent className="pt-4">
                                <div className="text-2xl font-bold truncate" title={account.name}>
                                    {account.name}
                                </div>
                                <div className="mt-4 flex items-center justify-between">
                                    <div className="text-sm text-muted-foreground">Current Balance</div>
                                    <div className={`text-lg font-semibold ${account.currentBalance < 0 ? 'text-destructive' : 'text-primary'}`}>
                                        ${formatMoney(account.currentBalance)}
                                    </div>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                                    <span>Initial: ${formatMoney(account.initialBalance)}</span>
                                </div>
                                <label className="mt-4 flex cursor-pointer items-center justify-between border-t pt-3 text-sm">
                                    <span>Include in cash available</span>
                                    <input type="checkbox" checked={account.includeInCashFlow !== false} onChange={() => toggleCashFlow(account)} />
                                </label>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <AlertDialog open={!!accountToDelete} onOpenChange={(open) => !open && setAccountToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the account and
                            <strong> ALL associated transactions</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setAccountToDelete(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDeleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete Account
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default AccountsPage;
