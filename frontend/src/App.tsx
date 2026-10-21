import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import AppShell from './components/layout/AppShell';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { getOnboardingData, hasCompletedOnboarding, hasSeededBudget, markBudgetSeeded } from './lib/onboarding';
import { seedInitialBudget } from './lib/seedBudget';
import AccountsPage from './pages/AccountsPage';
import BudgetPage from './pages/BudgetPage';
import CategoriesPage from './pages/CategoriesPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import TransactionsPage from './pages/TransactionsPage';
import WelcomePage from './pages/WelcomePage';
import { GetAccounts, GetBudgetPeriods } from './wailsAdapter';

// Define possible views/pages
type View = 'Dashboard' | 'Accounts' | 'Categories' | 'Transactions' | 'Budgets' | 'Reports' | 'Settings';

function App() {
    const [hasOnboarded, setHasOnboarded] = useState(() => hasCompletedOnboarding());
    const [currentView, setCurrentView] = useState<View>('Dashboard');
    const [isSeeding, setIsSeeding] = useState(false);
    const [isCheckingLedger, setIsCheckingLedger] = useState(true);
    const [startupError, setStartupError] = useState('');
    const [startupAttempt, setStartupAttempt] = useState(0);
    const [maySeedBudget, setMaySeedBudget] = useState(false);
    const seedingStarted = useRef(false);

    // The native webview may have fresh browser storage beside an existing ledger.
    // Check the ledger before offering onboarding or creating its starter budget.
    useEffect(() => {
        let active = true;
        Promise.all([GetAccounts(), GetBudgetPeriods()]).then(([accounts, periods]) => {
            if (!active) return;
            const hasExistingLedger = (accounts?.length || 0) > 0 || (periods?.length || 0) > 0;
            setMaySeedBudget(!hasExistingLedger);
            if (hasExistingLedger) {
                setHasOnboarded(true);
                // Resuming the ledger does not require writing browser preferences.
                try { markBudgetSeeded(); } catch { /* The ledger check also guards this session. */ }
            }
            setStartupError('');
            setIsCheckingLedger(false);
        }).catch(() => {
            if (!active) return;
            setStartupError('Your existing accounts and budgets could not be checked. Try again to open your budget safely.');
            setIsCheckingLedger(false);
        });
        return () => { active = false; };
    }, [startupAttempt]);

    // Seed initial budget on first app entry after onboarding
    useEffect(() => {
        async function initializeBudget() {
            if (!isCheckingLedger && !startupError && maySeedBudget && hasOnboarded && !hasSeededBudget() && !seedingStarted.current) {
                seedingStarted.current = true;
                setIsSeeding(true);
                try {
                    const data = getOnboardingData();
                    if (data) {
                        await seedInitialBudget(data);
                        markBudgetSeeded();
                        console.log('Initial budget seeded successfully');
                    }
                } catch (error) {
                    console.error('Failed to seed initial budget:', error);
                    // Don't block app, user can manually create budget
                } finally {
                    setIsSeeding(false);
                }
            }
        }
        initializeBudget();
    }, [hasOnboarded, isCheckingLedger, maySeedBudget, startupError]);

    const content = useMemo(() => {
        switch (currentView) {
            case 'Dashboard':
                return <DashboardPage onNavigate={setCurrentView} />;
            case 'Accounts':
                return <AccountsPage />;
            case 'Categories':
                return <CategoriesPage />;
            case 'Transactions':
                return <TransactionsPage />;
            case 'Budgets':
                return <BudgetPage />;
            case 'Reports':
                return <ReportsPage />;
            case 'Settings':
                return <SettingsPage />;
            default:
                return <DashboardPage onNavigate={setCurrentView} />;
        }
    }, [currentView]);

    if (isCheckingLedger || startupError) {
        return (
            <ThemeProvider>
                <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
                    <div className="max-w-md text-center">
                        {startupError ? <>
                            <p role="alert" className="mb-4 text-destructive">{startupError}</p>
                            <button type="button" className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => {
                                setStartupError('');
                                setIsCheckingLedger(true);
                                setStartupAttempt(attempt => attempt + 1);
                            }}>Try again</button>
                        </> : <p role="status">Opening your budget...</p>}
                    </div>
                </div>
            </ThemeProvider>
        );
    }

    if (!hasOnboarded) {
        return (
            <ThemeProvider>
                <WelcomePage onGetStarted={() => setHasOnboarded(true)} />
            </ThemeProvider>
        );
    }

    if (isSeeding) {
        return (
            <ThemeProvider>
                <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
                    <div className="text-center">
                        <h2 className="text-2xl font-semibold mb-2">Setting up your budget...</h2>
                        <p className="text-muted-foreground">This will only take a moment.</p>
                    </div>
                </div>
            </ThemeProvider>
        );
    }

    return (
        <ThemeProvider>
            <AppShell currentView={currentView} onNavigate={setCurrentView}>
                {content}
            </AppShell>
        </ThemeProvider>
    );
}

export default App;
