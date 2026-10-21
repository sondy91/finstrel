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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from '@/lib/utils';
import { Edit2, Plus, Save, Trash2, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { models } from '../../wailsjs/go/models';
import AddBudgetAllocationForm from '../components/AddBudgetAllocationForm';
import AddCategoryForm from '../components/AddCategoryForm';
import AddBudgetPeriodForm from '../components/AddBudgetPeriodForm';
import BudgetPeriodItem from '../components/BudgetPeriodItem';
import {
  DeleteBudgetAllocation,
  GetBudgetAllocationsByBudgetPeriodID,
  GetBudgetPeriods,
  GetCategories,
  UpdateBudgetAllocation,
  UpdateBudgetPeriod,
	PopulateBudgetPeriodFromDefaults,
	CloseAndCreateBudgetPeriod,
} from '../wailsAdapter';

const BudgetPage: React.FC = () => {
  const [budgetPeriods, setBudgetPeriods] = useState<models.BudgetPeriod[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPeriod, setSelectedPeriod] = useState<models.BudgetPeriod | null>(null);
  const [allocations, setAllocations] = useState<models.BudgetAllocation[]>([]);
  const [isLoadingAllocations, setIsLoadingAllocations] = useState<boolean>(false);
  const [allocationsError, setAllocationsError] = useState<string | null>(null);

  const [categories, setCategories] = useState<models.Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState<boolean>(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [showAddAllocationForm, setShowAddAllocationForm] = useState<boolean>(false);
  const [isCreatePeriodOpen, setIsCreatePeriodOpen] = useState<boolean>(false);
	const [isHandoffOpen, setIsHandoffOpen] = useState<boolean>(false);
	const [nextPeriodName, setNextPeriodName] = useState('');
	const [nextPeriodStart, setNextPeriodStart] = useState('');
	const [nextPeriodEnd, setNextPeriodEnd] = useState('');
	const [handoffError, setHandoffError] = useState<string | null>(null);
	const [isHandingOff, setIsHandingOff] = useState(false);
	const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState<boolean>(false);

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [allocationToDelete, setAllocationToDelete] = useState<number | null>(null);

  // Inline editing state
  const [editingAllocationId, setEditingAllocationId] = useState<number | null>(null);
  const [editingAmount, setEditingAmount] = useState<string>("");

  // Period editing state
  const [isEditPeriodOpen, setIsEditPeriodOpen] = useState<boolean>(false);
  const [editPeriodName, setEditPeriodName] = useState<string>("");
  const [editPeriodStart, setEditPeriodStart] = useState<string>("");
  const [editPeriodEnd, setEditPeriodEnd] = useState<string>("");

  const fetchBudgetPeriods = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const periods = await GetBudgetPeriods();
      setBudgetPeriods(periods || []);
      // If we have a selected period, update it with the latest data
      if (selectedPeriod) {
        const updated = periods.find((p: models.BudgetPeriod) => p.id === selectedPeriod.id);
        if (updated) setSelectedPeriod(updated);
      }
    } catch (err: any) {
      console.error('Error fetching budget periods:', err);
      setError(err.message || 'Failed to fetch budget periods');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCategories = async () => {
    setIsLoadingCategories(true);
    setCategoriesError(null);
    try {
      const cats = await GetCategories();
      setCategories(cats || []);
    } catch (err: any) {
      console.error('Error fetching categories:', err);
      setCategoriesError(err.message || 'Failed to fetch categories');
    } finally {
      setIsLoadingCategories(false);
    }
  };

  useEffect(() => {
    fetchBudgetPeriods();
    fetchCategories();
  }, []);

  const handleBudgetPeriodAdded = () => {
    fetchBudgetPeriods();
    setIsCreatePeriodOpen(false);
  };

	const openHandoff = () => {
		if (!selectedPeriod) return;
		const currentEnd = new Date(selectedPeriod.endDate);
		const start = new Date(currentEnd); start.setDate(start.getDate() + 1);
		const durationDays = Math.max(1, Math.round((currentEnd.getTime() - new Date(selectedPeriod.startDate).getTime()) / 86400000));
		const end = new Date(start); end.setDate(end.getDate() + durationDays);
		// Budget dates are shown as local calendar days. Do not serialize through
		// UTC here or evening offsets can advance the suggested period by one day.
		const toInputDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
		setNextPeriodName(''); setNextPeriodStart(toInputDate(start)); setNextPeriodEnd(toInputDate(end)); setHandoffError(null); setIsHandoffOpen(true);
	};

	const completeHandoff = async () => {
		if (!selectedPeriod) return;
		setHandoffError(null); setIsHandingOff(true);
		try {
			const next = await CloseAndCreateBudgetPeriod(selectedPeriod.id, nextPeriodName, nextPeriodStart, nextPeriodEnd);
			await fetchBudgetPeriods(); setSelectedPeriod(next); setIsHandoffOpen(false);
		} catch (err: any) { setHandoffError(err.message || 'Unable to start the next period'); }
		finally { setIsHandingOff(false); }
	};

  const handlePeriodSelect = (period: models.BudgetPeriod) => {
    setSelectedPeriod(period);
    setShowAddAllocationForm(false);
    setEditingAllocationId(null);
  };

  const fetchAllocationsForSelectedPeriod = async () => {
    if (!selectedPeriod) return;
    setIsLoadingAllocations(true);
    setAllocationsError(null);
    try {
      const fetchedAllocations = await GetBudgetAllocationsByBudgetPeriodID(selectedPeriod.id);
      setAllocations(fetchedAllocations || []);
    } catch (err: any) {
      console.error(`Error fetching allocations for period ${selectedPeriod.id}:`, err);
      setAllocationsError(err.message || 'Failed to fetch allocations');
    } finally {
      setIsLoadingAllocations(false);
    }
  };

  useEffect(() => {
    if (selectedPeriod) {
      fetchAllocationsForSelectedPeriod();
    } else {
      setAllocations([]);
    }
  }, [selectedPeriod]);

  const handleAllocationModified = () => {
    setShowAddAllocationForm(false);
    if (selectedPeriod) {
      fetchAllocationsForSelectedPeriod();
    }
  };

	const handleCategoryCreatedFromBudget = () => {
		fetchCategories();
		setIsCreateCategoryOpen(false);
	};

	const populateFromDefaults = async () => {
		if (!selectedPeriod) return;
		try { await PopulateBudgetPeriodFromDefaults(selectedPeriod.id); fetchAllocationsForSelectedPeriod(); }
		catch (err: any) { setAllocationsError(err.message || 'Failed to populate defaults'); }
	};

  const getCategoryName = (categoryId: number): string => {
    const category = categories.find(cat => cat.id === categoryId);
    return category ? category.name : 'Unknown Category';
  };

	const allocationType = (allocation: models.BudgetAllocation) => categories.find(category => category.id === allocation.categoryId)?.type || 'Expense';
	const displayAllocations = [...allocations].sort((a, b) => allocationType(a).localeCompare(allocationType(b)) || getCategoryName(a.categoryId).localeCompare(getCategoryName(b.categoryId)));

  const requestDeleteAllocation = (id: number) => {
    setAllocationToDelete(id);
    setIsConfirmModalOpen(true);
  };

  const confirmDeleteAllocation = async () => {
    if (allocationToDelete === null) return;
    try {
      await DeleteBudgetAllocation(allocationToDelete);
      fetchAllocationsForSelectedPeriod();
    } catch (err: any) {
      console.error(`Error deleting allocation ${allocationToDelete}:`, err);
      setAllocationsError(err.message || 'Failed to delete allocation');
    } finally {
      setIsConfirmModalOpen(false);
      setAllocationToDelete(null);
    }
  };

  // Inline Editing Handlers
  const startEditingAllocation = (allocation: models.BudgetAllocation) => {
    setEditingAllocationId(allocation.id);
    setEditingAmount(allocation.allocatedAmount.toString());
  };

  const cancelEditingAllocation = () => {
    setEditingAllocationId(null);
    setEditingAmount("");
  };

  const saveAllocation = async (id: number) => {
    const amount = parseFloat(editingAmount);
    if (isNaN(amount)) {
      // Could show toast error here
      return;
    }
    try {
      await UpdateBudgetAllocation(id, amount);
      setEditingAllocationId(null);
      fetchAllocationsForSelectedPeriod();
    } catch (err: any) {
      console.error("Failed to update allocation", err);
      setAllocationsError(err.message || "Failed to update allocation");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (e.key === 'Enter') {
      saveAllocation(id);
    } else if (e.key === 'Escape') {
      cancelEditingAllocation();
    }
  };

  // Period Editing Handlers
  const openEditPeriodDialog = () => {
    if (!selectedPeriod) return;
    setEditPeriodName(selectedPeriod.name);
    // Format dates for input (YYYY-MM-DD)
    setEditPeriodStart(new Date(selectedPeriod.startDate).toISOString().split('T')[0]);
    setEditPeriodEnd(new Date(selectedPeriod.endDate).toISOString().split('T')[0]);
    setIsEditPeriodOpen(true);
  };

  const handleSavePeriod = async () => {
    if (!selectedPeriod) return;
    try {
      await UpdateBudgetPeriod(selectedPeriod.id, editPeriodName, editPeriodStart, editPeriodEnd);
      setIsEditPeriodOpen(false);
      fetchBudgetPeriods(); // Refresh list and selected period
    } catch (err: any) {
      console.error("Failed to update period", err);
      // Show error in dialog if possible, or alert
      alert("Failed to update period: " + err.message);
    }
  };

  return (
    <div className="page-container max-w-7xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Budget Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage your budget periods and envelope allocations.
          </p>
        </div>
        <Dialog open={isCreatePeriodOpen} onOpenChange={setIsCreatePeriodOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create New Period
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Budget Period</DialogTitle>
            </DialogHeader>
            <AddBudgetPeriodForm onBudgetPeriodAdded={handleBudgetPeriodAdded} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Carousel of Budget Periods */}
      <div className="mb-8">
        {isLoading && <p className="text-muted-foreground">Loading budget periods...</p>}
        {!isLoading && budgetPeriods.length === 0 && (
          <p className="text-muted-foreground">No budget periods found. Create one to get started!</p>
        )}
        {!isLoading && budgetPeriods.length > 0 && (
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
            {budgetPeriods.map((period) => (
              <div key={period.id} className="min-w-[280px] snap-start">
                <BudgetPeriodItem
                  period={period}
                  isSelected={selectedPeriod?.id === period.id}
                  onClick={handlePeriodSelect}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Period Details */}
      <div className="space-y-6">
        {selectedPeriod ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-4">
                <CardTitle>Envelopes for: {selectedPeriod.name}</CardTitle>
                <Button variant="ghost" size="icon" onClick={openEditPeriodDialog}>
                  <Edit2 className="h-4 w-4" />
                </Button>
              </div>
			  {!showAddAllocationForm && <div className="flex gap-2">{selectedPeriod.status === 'Open' && <Button variant="outline" onClick={openHandoff} size="sm">Start next period</Button>}<Button variant="outline" onClick={populateFromDefaults} size="sm">Populate defaults</Button><Button onClick={() => setShowAddAllocationForm(true)} size="sm"><Plus className="h-4 w-4 mr-2" />Add Envelope</Button></div>}
            </CardHeader>
            <CardContent>
              {isLoadingAllocations && <p className="text-muted-foreground">Loading envelopes...</p>}
              {allocationsError && <p className="text-destructive">Error: {allocationsError}</p>}

              {showAddAllocationForm ? (
                <div className="bg-muted/30 p-6 rounded-lg border mb-6">
                  <h4 className="text-lg font-semibold mb-4">Add Envelope</h4>
                  {isLoadingCategories && <p>Loading categories for form...</p>}
                  {categoriesError && <p className="text-destructive">{categoriesError}</p>}
                  {!isLoadingCategories && !categoriesError && (
                    <AddBudgetAllocationForm
                      budgetPeriodId={selectedPeriod.id}
                      categories={categories}
                      existingAllocations={allocations}
                      onAllocationModified={handleAllocationModified}
                      allocationToEdit={null}
					  onCreateCategory={() => setIsCreateCategoryOpen(true)}
                    />
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => setShowAddAllocationForm(false)}
                    className="mt-4"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  {!isLoadingAllocations && !allocationsError && allocations.length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground mb-4">No envelopes found for this period.</p>
                      <Button onClick={() => setShowAddAllocationForm(true)} variant="outline">
                        Create your first envelope
                      </Button>
                    </div>
                  )}
				  {!isLoadingAllocations && !allocationsError && allocations.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead>Budgeted Amount</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
						{displayAllocations.map((alloc, index) => (
						  <React.Fragment key={alloc.id}>
							{index === 0 || allocationType(displayAllocations[index - 1]) !== allocationType(alloc) ? <TableRow className="bg-muted/40 hover:bg-muted/40"><TableCell colSpan={3} className="font-semibold">{allocationType(alloc) === 'Income' ? 'Planned Income' : 'Expense Envelopes'}</TableCell></TableRow> : null}
						  <TableRow>
                            <TableCell className="font-medium">{getCategoryName(alloc.categoryId)}</TableCell>
                            <TableCell>
                              {editingAllocationId === alloc.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    value={editingAmount}
                                    onChange={(e) => setEditingAmount(e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(e, alloc.id)}
                                    className="w-32 h-8"
                                    autoFocus
                                  />
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => saveAllocation(alloc.id)}>
                                    <Save className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={cancelEditingAllocation}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div
                                  className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded group"
                                  onClick={() => startEditingAllocation(alloc)}
                                >
                                  <span>${formatMoney(alloc.allocatedAmount)}</span>
                                  <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                aria-label={`Delete ${getCategoryName(alloc.categoryId)} envelope`}
                                onClick={() => requestDeleteAllocation(alloc.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
						  </TableRow>
						  </React.Fragment>
						))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <h3 className="text-lg font-semibold mb-2">No Period Selected</h3>
              <p className="text-muted-foreground">Select a budget period from the list above to view its envelopes.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Period Dialog */}
		<Dialog open={isHandoffOpen} onOpenChange={setIsHandoffOpen}>
		  <DialogContent>
			<DialogHeader><DialogTitle>Close and start next period</DialogTitle></DialogHeader>
			<p className="text-sm text-muted-foreground">This closes {selectedPeriod?.name} and creates an editable new period from your category defaults.</p>
			{handoffError && <p className="text-sm text-destructive">{handoffError}</p>}
			<div className="space-y-4"><div className="space-y-2"><Label htmlFor="next-period-name">New period name</Label><Input id="next-period-name" value={nextPeriodName} onChange={e => setNextPeriodName(e.target.value)} placeholder="e.g., October Budget" /></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="next-period-start">Start</Label><Input id="next-period-start" type="date" value={nextPeriodStart} onChange={e => setNextPeriodStart(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="next-period-end">End</Label><Input id="next-period-end" type="date" value={nextPeriodEnd} onChange={e => setNextPeriodEnd(e.target.value)} /></div></div><Button onClick={completeHandoff} disabled={isHandingOff || !nextPeriodName || !nextPeriodStart || !nextPeriodEnd} className="w-full">{isHandingOff ? 'Starting…' : 'Close current and start next period'}</Button></div>
		  </DialogContent>
		</Dialog>

      <Dialog open={isCreateCategoryOpen} onOpenChange={setIsCreateCategoryOpen}>
		  <DialogContent>
			<DialogHeader><DialogTitle>Create a category</DialogTitle></DialogHeader>
			<AddCategoryForm categories={categories} onCategoryAdded={handleCategoryCreatedFromBudget} />
		  </DialogContent>
		</Dialog>

      <Dialog open={isEditPeriodOpen} onOpenChange={setIsEditPeriodOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Budget Period</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editPeriodName}
                onChange={(e) => setEditPeriodName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-start">Start Date</Label>
                <Input
                  id="edit-start"
                  type="date"
                  value={editPeriodStart}
                  onChange={(e) => setEditPeriodStart(e.target.value)}
                  className="dark:[color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-end">End Date</Label>
                <Input
                  id="edit-end"
                  type="date"
                  value={editPeriodEnd}
                  onChange={(e) => setEditPeriodEnd(e.target.value)}
                  className="dark:[color-scheme:dark]"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsEditPeriodOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePeriod}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the envelope allocation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAllocationToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteAllocation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BudgetPage;
