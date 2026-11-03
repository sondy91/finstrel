import { AlertTriangle } from 'lucide-react';
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
import { ClearAllData, GetCashFlowSettings, UpdateCashFlowSettings } from '@/wailsAdapter';

export default function SettingsPage({
  onCalendar,
  onPractice,
}: {
  onCalendar?: () => void;
  onPractice?: () => void;
}) {
  const { theme, setTheme, accentColor, setAccentColor } = useTheme();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [payday, setPayday] = useState('');
  const [buffer, setBuffer] = useState('0');
  const [cashFlowMessage, setCashFlowMessage] = useState('');
  const loadCashFlow = async () => {
    const settings = await GetCashFlowSettings();
    setPayday(settings?.nextPaycheckDate ? String(settings.nextPaycheckDate).slice(0, 10) : '');
    setBuffer(String(settings?.desiredCashBuffer || 0));
  };
  useEffect(() => {
    loadCashFlow().catch((error) => console.error('Failed to load cash-flow settings:', error));
  }, []);
  const saveCashFlow = async () => {
    try {
      await UpdateCashFlowSettings(payday, Number(buffer) || 0);
      setCashFlowMessage('Forecast settings saved.');
    } catch {
      setCashFlowMessage('Unable to save forecast settings.');
    }
  };

  const accentColors = [
    { id: 'indigo', name: 'Indigo', hex: '#6366f1' },
    { id: 'blue', name: 'Blue', hex: '#3b82f6' },
    { id: 'green', name: 'Green', hex: '#10b981' },
    { id: 'purple', name: 'Purple', hex: '#a855f7' },
    { id: 'pink', name: 'Pink', hex: '#ec4899' },
    { id: 'gold', name: 'Gold', hex: '#a88656' },
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
        <p className="text-muted-foreground mt-2">Manage your preferences and application data</p>
      </div>

      <div className="space-y-6">
        {onPractice && (
          <Card>
            <CardHeader>
              <CardTitle>Try a practice household</CardTitle>
              <CardDescription>
                Explore budget review and your next pay period using sample entries and cached Plaid
                test history. Changes stay in practice.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={onPractice}>Open practice household</Button>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Paycheck forecast</CardTitle>
            <CardDescription>
              These settings are independent from your budget periods.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Income schedules in Calendar determine the next payday when active. This date is a
              fallback when no income schedule is active.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="payday">Fallback next paycheck date</Label>
                <Input
                  id="payday"
                  type="date"
                  value={payday}
                  onChange={(e) => setPayday(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="buffer">Desired cash buffer</Label>
                <Input
                  id="buffer"
                  type="number"
                  min="0"
                  step="0.01"
                  value={buffer}
                  onChange={(e) => setBuffer(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={saveCashFlow}>Save forecast settings</Button>
            {cashFlowMessage && (
              <span className="ml-3 text-sm text-muted-foreground">{cashFlowMessage}</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Income, bills and payment plans</CardTitle>
            <CardDescription>
              Manage weekly, every-two-week and monthly schedules in your household calendar.
              Existing monthly bills are already included.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onCalendar}>Open calendar</Button>
          </CardContent>
        </Card>

        {/* Appearance Section */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Customize the look and feel of your application</CardDescription>
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
            <CardDescription>Irreversible actions that affect your data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-destructive mb-2">Clear Manual Budget Data</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Permanently delete manually tracked accounts, categories, transactions, budgets,
                  and settings. This action cannot be undone and will restart the onboarding wizard.
                  Manage connected banks and remove imported bank data with Disconnect on the
                  Accounts page.
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
              <strong className="text-foreground">Finstrel</strong> - Local-first envelope budgeting
            </p>
            <p>Privacy-focused personal finance management</p>
            <p className="text-xs">
              Budgets are stored on your device. Optional bank imports retrieve data through Plaid.
            </p>
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
              <p>
                Bank connections and imported bank data are managed separately with Disconnect on
                the Accounts page.
              </p>
              <p className="text-destructive font-semibold">
                This action cannot be undone. You will need to complete the onboarding wizard again.
              </p>
              <div className="space-y-2 pt-4">
                <Label htmlFor="confirm-delete" className="text-foreground">
                  Type <span className="font-mono font-bold text-destructive">DELETE</span> to
                  confirm:
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
