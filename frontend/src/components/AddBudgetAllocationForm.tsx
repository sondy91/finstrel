import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { models } from '../../wailsjs/go/models';
import { AddBudgetAllocation, UpdateBudgetAllocation } from '../wailsAdapter';

interface AddBudgetAllocationFormProps {
  budgetPeriodId: number;
  categories: models.Category[];
  onAllocationModified: () => void;
  existingAllocations: models.BudgetAllocation[];
  allocationToEdit?: models.BudgetAllocation | null;
  onCreateCategory: () => void;
}

const AddBudgetAllocationForm: React.FC<AddBudgetAllocationFormProps> = ({
  budgetPeriodId,
  categories,
  onAllocationModified,
  existingAllocations,
  allocationToEdit,
  onCreateCategory,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [allocatedAmount, setAllocatedAmount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const isEditMode = !!allocationToEdit;

  useEffect(() => {
    if (isEditMode && allocationToEdit) {
      setSelectedCategoryId(allocationToEdit.categoryId.toString());
      setAllocatedAmount(allocationToEdit.allocatedAmount.toString());
    } else {
      setSelectedCategoryId('');
      setAllocatedAmount('');
    }
  }, [allocationToEdit, isEditMode]);

  // Filter out categories that are already allocated, UNLESS it's the category of the item being edited.
  const availableCategories = categories.filter(
    (category) =>
      (isEditMode && allocationToEdit?.categoryId === category.id) || // Always allow the category being edited
      !existingAllocations.some((alloc) => alloc.categoryId === category.id)
  );

  // Reset category selection if available categories change and not in edit mode, or if switching from edit to add mode.
  useEffect(() => {
    if (!isEditMode) {
      setSelectedCategoryId('');
    }
  }, [availableCategories.length, isEditMode, allocationToEdit]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!selectedCategoryId && !isEditMode) {
      // Category selection is vital for add mode
      setError('Please select a category.');
      return;
    }
    // In edit mode, categoryId comes from allocationToEdit, amount is from state
    const categoryIdNum =
      isEditMode && allocationToEdit
        ? allocationToEdit.categoryId
        : parseInt(selectedCategoryId, 10);
    const amountNum = parseFloat(allocatedAmount);

    if (isNaN(amountNum) || amountNum < 0) {
      // Allow 0 for clearing out an allocation, or enforce >0 if preferred
      setError('Please enter a valid, non-negative amount.');
      return;
    }

    // Prevent adding a duplicate category if NOT in edit mode
    if (!isEditMode && existingAllocations.some((alloc) => alloc.categoryId === categoryIdNum)) {
      setError('This category is already allocated for this budget period.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditMode && allocationToEdit) {
        const updatedAllocation: models.BudgetAllocation = {
          ...allocationToEdit,
          allocatedAmount: amountNum,
        };
        await UpdateBudgetAllocation(updatedAllocation.id, updatedAllocation.allocatedAmount);
      } else {
        await AddBudgetAllocation(budgetPeriodId, categoryIdNum, amountNum);
      }
      onAllocationModified();
      if (!isEditMode) {
        setSelectedCategoryId('');
        setAllocatedAmount('');
      }
    } catch (err: unknown) {
      console.error(`Error ${isEditMode ? 'updating' : 'adding'} budget allocation:`, err);
      setError(
        (err instanceof Error ? err.message : typeof err === 'string' ? err : '') ||
          `Failed to ${isEditMode ? 'update' : 'add'} budget allocation`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}

      <div className="space-y-2">
        <Label htmlFor="ba-category">Category</Label>
        <Select
          id="ba-category"
          value={selectedCategoryId}
          onChange={(e) => {
            const categoryID = e.target.value;
            setSelectedCategoryId(categoryID);
            const category = categories.find((item) => item.id === Number(categoryID));
            setAllocatedAmount(category ? String(category.defaultAmount || 0) : '');
          }}
          required
          disabled={isEditMode}
        >
          <option value="" disabled={!isEditMode}>
            Select a category
          </option>
          {availableCategories.length === 0 && !isEditMode && (
            <option value="" disabled>
              All categories allocated
            </option>
          )}
          {availableCategories.map((category) => (
            <option key={category.id} value={category.id.toString()}>
              {category.name} ({category.type})
            </option>
          ))}
        </Select>
        {!isEditMode && (
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Don’t see the category you need?</span>
            <Button type="button" variant="link" className="h-auto p-0" onClick={onCreateCategory}>
              Create a category
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ba-amount">Allocated Amount</Label>
        <Input
          id="ba-amount"
          type="number"
          value={allocatedAmount}
          onChange={(e) => setAllocatedAmount(e.target.value)}
          placeholder="0.00"
          step="0.01"
          min="0"
          required
        />
      </div>

      <Button
        type="submit"
        disabled={
          isSubmitting || (!isEditMode && availableCategories.length === 0 && !selectedCategoryId)
        }
        className="w-full"
      >
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isSubmitting
          ? isEditMode
            ? 'Updating...'
            : 'Adding...'
          : isEditMode
            ? 'Update Allocation'
            : 'Add Allocation'}
      </Button>
    </form>
  );
};

export default AddBudgetAllocationForm;
