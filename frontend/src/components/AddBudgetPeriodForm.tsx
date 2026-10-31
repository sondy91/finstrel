import BudgetDateFields from './BudgetDateFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { models } from '../../wailsjs/go/models';
import { AddBudgetPeriod } from '../wailsAdapter';

interface AddBudgetPeriodFormProps {
  onBudgetPeriodAdded: (newPeriod: models.BudgetPeriod) => void;
}

const AddBudgetPeriodForm: React.FC<AddBudgetPeriodFormProps> = ({ onBudgetPeriodAdded }) => {
  const [name, setName] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [status, setStatus] = useState<string>('Open');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (!name.trim()) {
      setError('Budget period name cannot be empty.');
      setIsSubmitting(false);
      return;
    }
    if (!startDate) {
      setError('Start date is required.');
      setIsSubmitting(false);
      return;
    }
    if (!endDate) {
      setError('End date is required.');
      setIsSubmitting(false);
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError('End date must be after start date.');
      setIsSubmitting(false);
      return;
    }

    try {
      const newPeriod = await AddBudgetPeriod(name, startDate, endDate, status);
      onBudgetPeriodAdded(newPeriod);
      setName('');
      setStartDate('');
      setEndDate('');
      setStatus('Open');
    } catch (err: any) {
      console.error('Error adding budget period:', err);
      setError(err.message || 'Failed to add budget period');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}

      <div className="space-y-2">
        <Label htmlFor="bp-name">Name</Label>
        <Input
          id="bp-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., January 2024"
          required
        />
      </div>

      <BudgetDateFields prefix="bp" start={startDate} end={endDate} onStart={setStartDate} onEnd={setEndDate} />

      <div className="space-y-2">
        <Label htmlFor="bp-status">Status</Label>
        <Select
          id="bp-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          required
        >
          <option value="Open">Open</option>
          <option value="Closed">Closed</option>
          <option value="Archived">Archived</option>
        </Select>
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isSubmitting ? 'Adding...' : 'Add Budget Period'}
      </Button>
    </form>
  );
};

export default AddBudgetPeriodForm;