import PracticePage from './pages/PracticePage';
import { createPracticeSession, setPracticeSession, type PracticeSession } from './lib/practice';
import { GetBankFeedView } from './wailsAdapter';
import { type TransactionFilter } from './lib/transactionBrowser';
import CalendarPage from './pages/CalendarPage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
type View = 'Dashboard' | 'Accounts' | 'Categories' | 'Transactions' | 'Budgets' | 'Reports' | 'Settings' | 'Calendar';

function BudgetApp({onPractice}:{onPractice:()=>void}) {
    const [hasOnboarded, setHasOnboarded] = useState(() => hasCompletedOnboarding());
    const [transactionFilter,setTransactionFilter]=useState<TransactionFilter|undefined>();
    const browseTransactions=useCallback((filter:TransactionFilter)=>{setTransactionFilter(filter);setCurrentView('Transactions');},[]);
    const navigate=useCallback((view:View)=>{if(view==='Transactions')setTransactionFilter(undefined);setCurrentView(view);},[]);
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
                return <DashboardPage onNavigate={navigate} />;
            case 'Calendar':
                return <CalendarPage />;
            case 'Accounts':
                return <AccountsPage onBrowseTransactions={browseTransactions} />;
            case 'Categories':
                return <CategoriesPage />;
            case 'Transactions':
                return <TransactionsPage key={JSON.stringify(transactionFilter)||'default'} initialFilter={transactionFilter} />;
            case 'Budgets':
                return <BudgetPage onBrowseTransactions={browseTransactions} />;
            case 'Reports':
                return <ReportsPage />;
            case 'Settings':
                return <SettingsPage onCalendar={()=>setCurrentView('Calendar')} onPractice={onPractice} />;
            default:
                return <DashboardPage onNavigate={navigate} />;
        }
    }, [currentView,transactionFilter,browseTransactions,onPractice]);

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
                <WelcomePage onGetStarted={() => setHasOnboarded(true)} onPractice={onPractice} />
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
            <AppShell currentView={currentView} onNavigate={navigate}>
                {content}
            </AppShell>
        </ThemeProvider>
    );
}

export default function App() {
    const [practice, setPractice] = useState<PracticeSession | null>(null);
    const [practiceRevision, setPracticeRevision] = useState(0);
    const [openingPractice, setOpeningPractice] = useState(false);
    const opening = useRef(false);
    const startPractice = useCallback(async () => {
        if (opening.current) return;
        opening.current = true; setOpeningPractice(true);
        let cached;
        try { cached = await GetBankFeedView(); } catch { /* Manual practice remains usable. */ }
        const next = createPracticeSession(cached);
        setPracticeSession(next); setPractice(next);
        opening.current = false; setOpeningPractice(false);
    }, []);
    if (practice) return <ThemeProvider><PracticePage key={practiceRevision} session={practice} onReset={() => {
        const reset = practice.reset();
        setPracticeSession(reset); setPractice(reset); setPracticeRevision(n => n + 1);
    }} onExit={() => { setPracticeSession(null); setPractice(null); }} /></ThemeProvider>;
    return <><BudgetApp onPractice={() => void startPractice()} />{openingPractice && <p role="status" className="fixed bottom-4 right-4 rounded border bg-background px-4 py-3 text-sm text-foreground shadow">Opening practice household…</p>}</>;
}
