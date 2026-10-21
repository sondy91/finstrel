import { AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTheme } from '@/components/theme/ThemeProvider';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clearBudgetSeeded, clearOnboardingData } from '@/lib/onboarding';
import { AddBill, ClearAllData, DeleteBill, GetBills, GetCashFlowSettings, GetCategories, UpdateBill, UpdateCashFlowSettings } from '@/wailsAdapter';
import { models } from '../../wailsjs/go/models';

export default function SettingsPage() {
  const { theme, setTheme, accentColor, setAccentColor } = useTheme();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [payday, setPayday] = useState('');
  const [buffer, setBuffer] = useState('0');
  const [cashFlowMessage, setCashFlowMessage] = useState('');
  const [bills, setBills] = useState<models.Bill[]>([]);
  const [categories, setCategories] = useState<models.Category[]>([]);
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billCategory, setBillCategory] = useState('');
  const [billDueDay, setBillDueDay] = useState('');
  const [editingBill, setEditingBill] = useState<models.Bill | null>(null);

  const loadCashFlow = async () => {
    const [settings, loadedBills, loadedCategories] = await Promise.all([GetCashFlowSettings(), GetBills(), GetCategories()]);
    setPayday(settings?.nextPaycheckDate ? String(settings.nextPaycheckDate).slice(0, 10) : '');
    setBuffer(String(settings?.desiredCashBuffer || 0)); setBills(loadedBills || []);
    setCategories((loadedCategories || []).filter((c: models.Category) => c.type === 'Expense'));
  };
  useEffect(() => { loadCashFlow().catch(error => console.error('Failed to load cash-flow settings:', error)); }, []);

  const saveCashFlow = async () => {
    try { await UpdateCashFlowSettings(payday, Number(buffer) || 0); setCashFlowMessage('Forecast settings saved.'); }
    catch (error) { console.error(error); setCashFlowMessage('Unable to save forecast settings.'); }
  };
  const addBill = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!billName.trim() || !billCategory || !billDueDay || Number(billAmount) < 0) return;
    if (editingBill) await UpdateBill(editingBill.id, billName, Number(billAmount), Number(billCategory), Number(billDueDay), editingBill.accountId || null, editingBill.active);
    else await AddBill(billName, Number(billAmount), Number(billCategory), Number(billDueDay), null, true);
    setBillName(''); setBillAmount(''); setBillCategory(''); setBillDueDay(''); setEditingBill(null); await loadCashFlow();
  };
  const updateBill = async (bill: models.Bill, active: boolean) => { await UpdateBill(bill.id, bill.name, bill.amount, bill.categoryId, bill.dueDay, bill.accountId || null, active); await loadCashFlow(); };

  const accentColors = [
    { id: 'indigo', name: 'Indigo', hex: '#6366f1' },
    { id: 'blue', name: 'Blue', hex: '#3b82f6' },
    { id: 'green', name: 'Green', hex: '#10b981' },
    { id: 'purple', name: 'Purple', hex: '#a855f7' },
    { id: 'pink', name: 'Pink', hex: '#ec4899' },
  ];

  const handleClearAllData = async () => {
    if (confirmText !== 'DELETE') {
      return;
    }

    setIsDeleting(true);
    try {
      // Clear backend data
      await ClearAllData();
      
      // Clear frontend state
      clearOnboardingData();
      clearBudgetSeeded();
      
      // Reload to reset app state
      window.location.reload();
    } catch (error) {
      console.error('Failed to clear data:', error);
      alert('Failed to clear data. Check console for details.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="page-container max-w-4xl mx-auto py-8 px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your preferences and application data
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Paycheck forecast</CardTitle><CardDescription>These settings are independent from your budget periods.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="payday">Next paycheck date</Label><Input id="payday" type="date" value={payday} onChange={e => setPayday(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="buffer">Desired cash buffer</Label><Input id="buffer" type="number" min="0" step="0.01" value={buffer} onChange={e => setBuffer(e.target.value)} /></div></div>
            <Button onClick={saveCashFlow}>Save forecast settings</Button>{cashFlowMessage && <span className="ml-3 text-sm text-muted-foreground">{cashFlowMessage}</span>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Scheduled bills</CardTitle><CardDescription>Expected obligations only. Recording a bill payment still requires a normal transaction.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={addBill} className="grid gap-3 md:grid-cols-5"><Input placeholder="Bill name" value={billName} onChange={e => setBillName(e.target.value)} /><Input type="number" min="0" step="0.01" placeholder="Amount" value={billAmount} onChange={e => setBillAmount(e.target.value)} /><select className="h-10 rounded-md border bg-background px-3 text-sm" value={billCategory} onChange={e => setBillCategory(e.target.value)}><option value="">Expense category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Input type="number" min="1" max="31" placeholder="Due day" value={billDueDay} onChange={e => setBillDueDay(e.target.value)} /><div className="flex gap-2"><Button type="submit">{editingBill ? 'Save bill' : 'Add bill'}</Button>{editingBill && <Button type="button" variant="outline" onClick={() => { setEditingBill(null); setBillName(''); setBillAmount(''); setBillCategory(''); setBillDueDay(''); }}>Cancel</Button>}</div></form>
            <div className="space-y-2">{bills.length === 0 ? <p className="text-sm text-muted-foreground">No scheduled bills yet.</p> : bills.map(bill => <div key={bill.id} className="flex items-center justify-between rounded border p-3"><div><p className="font-medium">{bill.name} · ${bill.amount.toFixed(2)}</p><p className="text-xs text-muted-foreground">Due on day {bill.dueDay} · {categories.find(c => c.id === bill.categoryId)?.name || 'Expense'}</p></div><div className="flex items-center gap-3"><label className="text-sm"><input type="checkbox" checked={bill.active} onChange={e => updateBill(bill, e.target.checked)} /> Active</label><Button variant="ghost" size="icon" onClick={() => { setEditingBill(bill); setBillName(bill.name); setBillAmount(String(bill.amount)); setBillCategory(String(bill.categoryId)); setBillDueDay(String(bill.dueDay)); }} aria-label={`Edit ${bill.name}`}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={async () => { await DeleteBill(bill.id); await loadCashFlow(); }} aria-label={`Delete ${bill.name}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div>)}</div>
          </CardContent>
        </Card>

        {/* Appearance Section */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Customize the look and feel of your application
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Theme Mode */}
            <div className="space-y-3">
              <Label>Theme Mode</Label>
              <div className="flex gap-3">
                <Button
                  variant={theme === 'light' ? 'default' : 'outline'}
                  onClick={() => setTheme('light')}
                  className="flex-1"
                >
                  Light
                </Button>
                <Button
                  variant={theme === 'dark' ? 'default' : 'outline'}
                  onClick={() => setTheme('dark')}
                  className="flex-1"
                >
                  Dark
                </Button>
              </div>
            </div>

            {/* Accent Color */}
            <div className="space-y-3">
              <Label>Accent Color</Label>
              <div className="flex gap-3">
                {accentColors.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => setAccentColor(color.id)}
                    className={`h-10 w-10 rounded-full transition-all ${
                      accentColor === color.id
                        ? 'ring-2 ring-offset-2 ring-primary scale-110'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color.hex }}
                    aria-label={`Select ${color.name}`}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Management Section */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible actions that affect your data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-destructive mb-2">Clear Manual Budget Data</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Permanently delete manually tracked accounts, categories, transactions, budgets, and settings.
                  This action cannot be undone and will restart the onboarding wizard. Manage connected banks and remove imported bank data with Disconnect on the Accounts page.
                </p>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  className="font-semibold"
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Clear Manual Budget Data
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* About Section */}
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">VestraMaximus</strong> - Local-first envelope budgeting
            </p>
            <p>Privacy-focused personal finance management</p>
            <p className="text-xs">Budgets are stored on your device. Optional bank imports retrieve data through Plaid.</p>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="border-destructive">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p className="font-semibold text-foreground">
                This will permanently delete your manual budget data including:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>All manually tracked financial accounts</li>
                <li>All categories and transactions</li>
                <li>All budget periods and allocations</li>
                <li>All settings and preferences</li>
              </ul>
              <p>Bank connections and imported bank data are managed separately with Disconnect on the Accounts page.</p>
              <p className="text-destructive font-semibold">
                This action cannot be undone. You will need to complete the onboarding wizard again.
              </p>
              <div className="space-y-2 pt-4">
                <Label htmlFor="confirm-delete" className="text-foreground">
                  Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm:
                </Label>
                <Input
                  id="confirm-delete"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type DELETE here"
                  className="border-destructive focus-visible:ring-destructive"
                  autoComplete="off"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmText('');
                setShowDeleteDialog(false);
              }}
              disabled={isDeleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAllData}
              disabled={confirmText !== 'DELETE' || isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Manual Budget Data'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
