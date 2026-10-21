import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { models } from '../../wailsjs/go/models';
import { AddCategoryWithDefault, GetCategories, UpdateCategory } from '../wailsAdapter';

type Category = models.Category;

interface AddCategoryFormProps {
    onCategoryAdded: (keepOpen: boolean) => void;
    categories?: Category[];
	categoryToEdit?: Category | null;
}

interface CategoryFormData {
    name: string;
    type: 'Income' | 'Expense';
    parentCategoryID: string;
	defaultAmount: string;
}

const AddCategoryForm: React.FC<AddCategoryFormProps> = ({ onCategoryAdded, categories: propCategories, categoryToEdit }) => {
    const [formData, setFormData] = useState<CategoryFormData>({
        name: '',
        type: 'Expense',
        parentCategoryID: "0",
		defaultAmount: '0',
    });
    const [existingCategories, setExistingCategories] = useState<Category[]>(propCategories || []);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [addAnother, setAddAnother] = useState<boolean>(false);
    const nameInputRef = useRef<HTMLInputElement>(null);
	const isEditMode = !!categoryToEdit;

    useEffect(() => {
        if (!propCategories) {
            const fetchExistingCategories = async () => {
                try {
                    const cats = await GetCategories();
                    setExistingCategories(cats || []);
                } catch (err) {
                    console.error("Error fetching existing categories for form:", err);
                }
            };
            fetchExistingCategories();
        } else {
            setExistingCategories(propCategories);
        }
    }, [propCategories]);

	useEffect(() => {
		if (!categoryToEdit) return;
		setFormData({ name: categoryToEdit.name, type: categoryToEdit.type as 'Income' | 'Expense', parentCategoryID: categoryToEdit.parentCategoryId ? String(categoryToEdit.parentCategoryId) : '0', defaultAmount: String(categoryToEdit.defaultAmount || 0) });
		setAddAnother(false);
	}, [categoryToEdit]);

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

        if (!formData.name.trim()) {
            setError('Category name cannot be empty.');
            setIsSubmitting(false);
            return;
        }

        let parentID: number | null = parseInt(formData.parentCategoryID, 10);
        if (isNaN(parentID) || parentID === 0) {
            parentID = null;
        }

        try {
            const defaultAmount = Number(formData.defaultAmount);
            if (!Number.isFinite(defaultAmount) || defaultAmount < 0) {
                setError('Default amount must be zero or greater.');
                setIsSubmitting(false);
                return;
            }
            const createdCategory: models.Category = isEditMode && categoryToEdit
				? await UpdateCategory(categoryToEdit.id, formData.name, formData.type, parentID, defaultAmount)
				: await AddCategoryWithDefault(formData.name, formData.type, parentID, defaultAmount);

			setSuccessMessage(`Category "${createdCategory.name}" ${isEditMode ? 'updated' : 'added'} successfully!`);

			if (addAnother && !isEditMode) {
                setFormData((prevData) => ({ ...prevData, name: '' }));
            } else {
			setFormData({ name: '', type: 'Expense', parentCategoryID: "0", defaultAmount: '0' });
            }

            const cats = await GetCategories();
            setExistingCategories(cats || []);

			 onCategoryAdded(addAnother && !isEditMode);

			if (addAnother && !isEditMode) {
                requestAnimationFrame(() => nameInputRef.current?.focus());
            }

        } catch (err: any) {
            console.error("Error adding category:", err);
            setError(err.message || 'Failed to add category. Name might be taken.');
        } finally {
            setIsSubmitting(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">{isEditMode ? 'Edit Category' : 'Add New Category'}</h3>
            </div>

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            {successMessage && <p className="text-sm font-medium text-green-600 dark:text-green-400">{successMessage}</p>}

            <div className="space-y-2">
                <Label htmlFor="name">Category Name</Label>
                <Input
                    ref={nameInputRef}
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., Groceries"
                    required
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="type">Category Type</Label>
                    <Select
                        id="type"
                        name="type"
                        value={formData.type}
                        onChange={handleInputChange}
                    >
                        <option value="Expense">Expense</option>
                        <option value="Income">Income</option>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="parentCategoryID">Parent Category (Optional)</Label>
                    <Select
                        id="parentCategoryID"
                        name="parentCategoryID"
                        value={formData.parentCategoryID}
                        onChange={handleInputChange}
                    >
                        <option value="0">-- No Parent --</option>
						{existingCategories.filter(cat => cat.id !== categoryToEdit?.id).map(cat => (
                            <option key={cat.id} value={cat.id.toString()}>
                                {cat.name} ({cat.type})
                            </option>
                        ))}
                    </Select>
                </div>
            </div>

			<div className="space-y-2">
				<Label htmlFor="defaultAmount">Usual amount per budget period</Label>
				<Input id="defaultAmount" name="defaultAmount" type="number" min="0" step="0.01" value={formData.defaultAmount} onChange={handleInputChange} />
				<p className="text-xs text-muted-foreground">Copied into future budget periods; edits to a period will not change this amount.</p>
			</div>

            {!isEditMode && <div className="flex items-center space-x-2">
                <input
                    type="checkbox"
                    id="addAnother"
                    checked={addAnother}
                    onChange={(e) => setAddAnother(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="addAnother" className="font-normal cursor-pointer">
                    Keep this open to add another category
                </Label>
			</div>}

            <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
				{isSubmitting ? (isEditMode ? 'Saving...' : 'Adding...') : (isEditMode ? 'Save Category' : 'Add Category')}
            </Button>
        </form>
    );
};

export default AddCategoryForm;
