import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { models } from '../../wailsjs/go/models';
import { AddAccount } from '../wailsAdapter';

interface AddAccountFormProps {
    onAccountAdded: () => void;
}

interface AccountFormData {
    name: string;
    type: string;
    initialBalance: string;
}

const AccountTypes = ["Checking", "Savings", "Credit Card", "Loan", "Cash", "Investment", "Other"];

const AddAccountForm: React.FC<AddAccountFormProps> = ({ onAccountAdded }) => {
    const [formData, setFormData] = useState<AccountFormData>({
        name: '',
        type: AccountTypes[0],
        initialBalance: '0.00',
    });
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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

        const balance = parseFloat(formData.initialBalance);
        if (isNaN(balance)) {
            setError('Initial balance must be a valid number.');
            setIsSubmitting(false);
            return;
        }
        if (!formData.name.trim()) {
            setError('Account name cannot be empty.');
            setIsSubmitting(false);
            return;
        }

        try {
            const newAccountData = {
                name: formData.name,
                accountType: formData.type,
                initialBalance: balance,
            };

            const createdAccount: models.Account = await AddAccount(
                newAccountData.name,
                newAccountData.accountType,
                newAccountData.initialBalance
            );

            setSuccessMessage(`Account "${createdAccount.name}" added successfully!`);
            setFormData({ name: '', type: AccountTypes[0], initialBalance: '0.00' });
            onAccountAdded();
        } catch (err: any) {
            console.error("Error adding account:", err);
            setError(err.message || 'Failed to add account.');
        } finally {
            setIsSubmitting(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Add New Account</h3>
            </div>

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            {successMessage && <p className="text-sm font-medium text-green-600 dark:text-green-400">{successMessage}</p>}

            <div className="space-y-2">
                <Label htmlFor="name">Account Name</Label>
                <Input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., Main Checking"
                    required
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="type">Account Type</Label>
                    <Select
                        id="type"
                        name="type"
                        value={formData.type}
                        onChange={handleInputChange}
                    >
                        {AccountTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="initialBalance">Initial Balance</Label>
                    <Input
                        type="number"
                        id="initialBalance"
                        name="initialBalance"
                        value={formData.initialBalance}
                        onChange={handleInputChange}
                        step="0.01"
                        required
                    />
                </div>
            </div>

            <p className="text-xs text-muted-foreground">New accounts are included in spendable cash by default. You can exclude savings from the forecast on the Accounts page.</p>

            <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Adding...' : 'Add Account'}
            </Button>
        </form>
    );
};

export default AddAccountForm;
