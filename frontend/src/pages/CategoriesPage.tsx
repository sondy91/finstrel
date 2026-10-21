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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Edit2, FolderTree, Plus, Tag, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { models } from '../../wailsjs/go/models';
import AddCategoryForm from '../components/AddCategoryForm';
import { DeleteCategory, GetCategories } from '../wailsAdapter';

type Category = models.Category;

const CategoriesPage: React.FC = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState<boolean>(false);
	const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);
    const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const fetchCategories = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await GetCategories();
            setCategories(result || []);
        } catch (err: any) {
            console.error("Error fetching categories:", err);
            setError(err.message || 'Failed to fetch categories');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    const handleCategoryAdded = (keepOpen: boolean) => {
        fetchCategories();
		if (!keepOpen) { setShowAddForm(false); setCategoryToEdit(null); }
    };

    const confirmDeleteCategory = async () => {
        if (!categoryToDelete) return;
        setDeleteError(null);
        try {
            await DeleteCategory(categoryToDelete.id);
            fetchCategories();
        } catch (err: any) {
            console.error("Error deleting category:", err);
            setDeleteError(err.message || 'Failed to delete category');
        } finally {
            setCategoryToDelete(null);
        }
    };

    const getParentCategoryName = (parentId: number | null | undefined): string => {
        if (!parentId) return '-';
        const parent = categories.find(cat => cat.id === parentId);
        return parent ? parent.name : 'Unknown';
    };

    return (
        <div className="page-container max-w-7xl mx-auto py-8 px-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
                    <p className="text-muted-foreground mt-2">
                        Manage your income and expense categories.
                    </p>
                </div>
                <Button onClick={() => { setCategoryToEdit(null); setShowAddForm(true); }}>
                    <Plus className="mr-2 h-4 w-4" /> Add Category
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Categories</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading && <p className="text-muted-foreground">Loading categories...</p>}
                    {error && <p className="text-destructive">Error: {error}</p>}
                    {deleteError && <p className="text-destructive">Error: {deleteError}</p>}

                    {!isLoading && !error && categories.length === 0 && (
                        <div className="text-center py-12">
                            <Tag className="h-12 w-12 text-muted-foreground mb-4 mx-auto" />
                            <p className="text-muted-foreground mb-4">No categories found.</p>
                            <Button onClick={() => { setCategoryToEdit(null); setShowAddForm(true); }} variant="outline">
                                Create your first category
                            </Button>
                        </div>
                    )}

                    {!isLoading && !error && categories.length > 0 && (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Parent Category</TableHead>
                                    <TableHead>Default per Period</TableHead>
                                    <TableHead className="w-10"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {categories.map((category) => (
                                    <TableRow key={category.id}>
                                        <TableCell className="font-medium flex items-center">
                                            <Tag className="mr-2 h-4 w-4 text-muted-foreground" />
                                            {category.name}
                                        </TableCell>
                                        <TableCell>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                category.type === 'Income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                            }`}>
                                                {category.type}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {category.parentCategoryId ? (
                                                <div className="flex items-center text-muted-foreground">
                                                    <FolderTree className="mr-2 h-3 w-3" />
                                                    {getParentCategoryName(category.parentCategoryId)}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
										${category.defaultAmount.toFixed(2)}
                                        </TableCell>
                                        <TableCell>
										<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => { setCategoryToEdit(category); setShowAddForm(true); }} aria-label={`Edit ${category.name}`}><Edit2 className="h-4 w-4" /></Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                onClick={() => setCategoryToDelete(category)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{categoryToEdit ? 'Edit category' : 'Create a category'}</DialogTitle></DialogHeader>
                    <AddCategoryForm onCategoryAdded={handleCategoryAdded} categories={categories} categoryToEdit={categoryToEdit} />
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the category <strong>{categoryToDelete?.name}</strong>.
                            Any sub-categories will become top-level categories, and any budget allocations
                            for it will be removed. Categories still used by transactions cannot be deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setCategoryToDelete(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDeleteCategory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete Category
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default CategoriesPage;
