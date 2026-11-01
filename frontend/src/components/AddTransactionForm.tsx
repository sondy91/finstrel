import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatMoney } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { models } from '../../wailsjs/go/models';
import { AddTransaction, GetAccounts, GetCategories } from '../wailsAdapter';

type Account = models.Account;
type Category = models.Category;

interface AddTransactionFormProps {
    onTransactionAdded: () => void;
    categories?: Category[];
    accounts?: Account[];
}

interface TransactionFormData {
    dateString: string;
    amount: string;
    type: 'Income' | 'Expense';
    description: string;
    categoryID: string;
    accountID: string;
    notes: string;
    status: 'Cleared' | 'Pending';
}

const AddTransactionForm: React.FC<AddTransactionFormProps> = ({
    onTransactionAdded,
    categories: propCategories,
    accounts: propAccounts
}) => {
    const [formData, setFormData] = useState<TransactionFormData>({
        dateString: new Date().toISOString().split('T')[0],
        amount: '0.00',
        type: 'Expense',
        description: '',
        categoryID: '',
        accountID: '',
        notes: '',
        status: 'Cleared',
    });

    const [accounts, setAccounts] = useState<Account[]>(propAccounts || []);
    const [categories, setCategories] = useState<Category[]>(propCategories || []);
    const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);

    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Fetch data if not provided via props
    useEffect(() => {
        const fetchDataForDropdowns = async () => {
            if (!propAccounts || !propCategories) {
                try {
                    if (!propAccounts) {
                        const accs = await GetAccounts();
                        setAccounts(accs || []);
                        if (accs && accs.length > 0 && !formData.accountID) {
                            setFormData(prev => ({ ...prev, accountID: accs[0].id.toString() }));
                        }
                    }
                    if (!propCategories) {
                        const cats = await GetCategories();
                        setCategories(cats || []);
                    }
                } catch (err) {
                    console.error("Error fetching data for transaction form:", err);
                    setError("Could not load accounts/categories for the form.");
                }
            } else {
                // If props are provided, ensure we set initial account ID
                if (propAccounts.length > 0 && !formData.accountID) {
                    setFormData(prev => ({ ...prev, accountID: propAccounts[0].id.toString() }));
                }
            }
        };
        fetchDataForDropdowns();
    }, [propAccounts, propCategories]);

    // Filter categories based on selected transaction type
    useEffect(() => {
        const currentTypeCategories = categories.filter(cat => cat.type === formData.type);
        setFilteredCategories(currentTypeCategories);
        // If current categoryID is not in the filtered list, reset it
        if (formData.categoryID && !currentTypeCategories.find(cat => cat.id.toString() === formData.categoryID)) {
            setFormData(prev => ({ ...prev, categoryID: currentTypeCategories.length > 0 ? currentTypeCategories[0].id.toString() : "" }));
        } else if (!formData.categoryID && currentTypeCategories.length > 0) {
            setFormData(prev => ({ ...prev, categoryID: currentTypeCategories[0].id.toString() }));
        }
    }, [formData.type, categories, formData.categoryID]);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prevData) => ({
            ...prevData,
            [name]: value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        setSuccessMessage(null);

        if (!formData.accountID) {
            setError('Please select an account.');
            setIsSubmitting(false);
            return;
        }
        if (!formData.categoryID) {
            setError('Please select a category.');
            setIsSubmitting(false);
            return;
        }

        let transactionAmount = parseFloat(formData.amount);
        if (isNaN(transactionAmount)) {
            setError('Amount must be a valid number.');
            setIsSubmitting(false);
            return;
        }
        if (transactionAmount === 0) {
            setError('Amount cannot be zero.');
            setIsSubmitting(false);
            return;
        }

        // Ensure amount has correct sign based on type
        if (formData.type === 'Expense' && transactionAmount > 0) {
            transactionAmount = -transactionAmount;
        } else if (formData.type === 'Income' && transactionAmount < 0) {
            transactionAmount = Math.abs(transactionAmount);
        }


        try {
            await AddTransaction(
                formData.dateString,
                transactionAmount,
                formData.type,
                formData.description,
                parseInt(formData.categoryID, 10),
                parseInt(formData.accountID, 10),
                formData.notes,
                formData.status
            );

            setSuccessMessage(`Transaction added successfully!`);
            setFormData({
                dateString: new Date().toISOString().split('T')[0],
                amount: '0.00',
                type: 'Expense',
                description: '',
                categoryID: filteredCategories.length > 0 ? filteredCategories[0].id.toString() : "",
                accountID: accounts.length > 0 ? accounts[0].id.toString() : "",
                notes: '',
                status: 'Cleared',
            });
            onTransactionAdded();
        } catch (err: any) {
            console.error("Error adding transaction:", err);
            setError(err.message || 'Failed to add transaction.');
        } finally {
            setIsSubmitting(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Add New Transaction</h3>
            </div>

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            {successMessage && <p className="text-sm font-medium text-green-600 dark:text-green-400">{successMessage}</p>}

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="dateString">Date</Label>
                    <Input type="date" id="dateString" name="dateString" value={formData.dateString} onChange={handleInputChange} required />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select id="type" name="type" value={formData.type} onChange={handleInputChange}>
                        <option value="Expense">Expense</option>
                        <option value="Income">Income</option>
                    </Select>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input type="text" id="description" name="description" value={formData.description} onChange={handleInputChange} placeholder="e.g., Grocery Shopping" required />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="amount">Amount</Label>
                    <Input type="number" id="amount" name="amount" value={formData.amount} onChange={handleInputChange} step="0.01" required />
                    <p className="text-xs text-muted-foreground">
                        {formData.type === 'Expense' ? '(Enter as positive)' : '(Enter as positive)'}
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select id="status" name="status" value={formData.status} onChange={handleInputChange}>
                        <option value="Cleared">Cleared</option>
                        <option value="Pending">Pending</option>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="accountID">Account</Label>
                    <Select id="accountID" name="accountID" value={formData.accountID} onChange={handleInputChange} required>
                        <option value="">-- Select Account --</option>
                        {accounts.map(acc => (
                            <option key={acc.id} value={acc.id.toString()}>{acc.name} (${formatMoney(acc.currentBalance)})</option>
                        ))}
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="categoryID">Category</Label>
                    <Select id="categoryID" name="categoryID" value={formData.categoryID} onChange={handleInputChange} required disabled={filteredCategories.length === 0}>
                        <option value="">-- Select Category --</option>
                        {filteredCategories.map(cat => (
                            <option key={cat.id} value={cat.id.toString()}>{cat.name}</option>
                        ))}
                    </Select>
                    {categories.length > 0 && filteredCategories.length === 0 && formData.type && (
                        <p className="text-xs text-orange-500 mt-1">No {formData.type.toLowerCase()} categories available.</p>
                    )}
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Input id="notes" name="notes" value={formData.notes} onChange={handleInputChange} />
            </div>

            <Button type="submit" disabled={isSubmitting || (categories.length > 0 && filteredCategories.length === 0)} className="w-full">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Adding...' : 'Add Transaction'}
            </Button>
        </form>
    );
};

export default AddTransactionForm;
