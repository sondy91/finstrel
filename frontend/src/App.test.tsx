import { StrictMode, type ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as Onboarding from './lib/onboarding';
import { seedInitialBudget } from './lib/seedBudget';
import { GetAccounts, GetBudgetPeriods } from './wailsAdapter';

vi.mock('./wailsAdapter', () => ({ GetAccounts: vi.fn(), GetBudgetPeriods: vi.fn() }));
vi.mock('./lib/onboarding', () => ({
  getOnboardingData: vi.fn(),
  hasCompletedOnboarding: vi.fn(),
  hasSeededBudget: vi.fn(),
  markBudgetSeeded: vi.fn(),
  saveOnboardingData: vi.fn(),
}));
vi.mock('./lib/seedBudget', () => ({ seedInitialBudget: vi.fn() }));
vi.mock('./components/layout/AppShell', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('./components/theme/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./pages/WelcomePage', () => ({
  default: ({ onGetStarted }: { onGetStarted: () => void }) => (
    <button onClick={onGetStarted}>Complete welcome</button>
  ),
}));
vi.mock('./pages/DashboardPage', () => ({ default: () => <h1>Existing dashboard</h1> }));
vi.mock('./pages/AccountsPage', () => ({ default: () => null }));
vi.mock('./pages/BudgetPage', () => ({ default: () => null }));
vi.mock('./pages/CategoriesPage', () => ({ default: () => null }));
vi.mock('./pages/ReportsPage', () => ({ default: () => null }));
vi.mock('./pages/SettingsPage', () => ({ default: () => null }));
vi.mock('./pages/TransactionsPage', () => ({ default: () => null }));

const onboardingData: Onboarding.OnboardingData = {
  accentColor: 'indigo',
  themeMode: 'dark',
  goals: ['save'],
  categories: ['groceries'],
  defaultAmounts: { groceries: 200 },
};

beforeEach(() => {
  vi.resetAllMocks();
  let seeded = false;
  vi.mocked(Onboarding.hasCompletedOnboarding).mockReturnValue(false);
  vi.mocked(Onboarding.hasSeededBudget).mockImplementation(() => seeded);
  vi.mocked(Onboarding.markBudgetSeeded).mockImplementation(() => {
    seeded = true;
  });
  vi.mocked(Onboarding.getOnboardingData).mockReturnValue(onboardingData);
  vi.mocked(GetAccounts).mockResolvedValue([]);
  vi.mocked(GetBudgetPeriods).mockResolvedValue([]);
  vi.mocked(seedInitialBudget).mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App startup with an existing local ledger', () => {
  it.each([
    { name: 'accounts', accounts: [{ id: 1 }], periods: [] },
    { name: 'budget periods', accounts: [], periods: [{ id: 2 }] },
  ])(
    'resumes existing $name when the native webview has fresh onboarding flags',
    async ({ accounts, periods }) => {
      vi.mocked(GetAccounts).mockResolvedValue(accounts);
      vi.mocked(GetBudgetPeriods).mockResolvedValue(periods);
      render(<App />);
      expect(
        await screen.findByRole('heading', { name: 'Existing dashboard' })
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Complete welcome' })).not.toBeInTheDocument();
      expect(Onboarding.markBudgetSeeded).toHaveBeenCalledOnce();
      expect(Onboarding.getOnboardingData).not.toHaveBeenCalled();
      expect(Onboarding.saveOnboardingData).not.toHaveBeenCalled();
      expect(seedInitialBudget).not.toHaveBeenCalled();
    }
  );

  it('checks the ledger before seeding when only the onboarding-complete flag survived', async () => {
    vi.mocked(Onboarding.hasCompletedOnboarding).mockReturnValue(true);
    let resolvePeriods!: (value: unknown[]) => void;
    vi.mocked(GetAccounts).mockResolvedValue([{ id: 1 }]);
    vi.mocked(GetBudgetPeriods).mockImplementation(
      () =>
        new Promise<unknown[]>((resolve) => {
          resolvePeriods = resolve;
        })
    );
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Opening your budget');
    expect(GetAccounts).toHaveBeenCalledOnce();
    expect(GetBudgetPeriods).toHaveBeenCalledOnce();
    expect(seedInitialBudget).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    resolvePeriods([]);
    expect(await screen.findByRole('heading', { name: 'Existing dashboard' })).toBeInTheDocument();
    expect(seedInitialBudget).not.toHaveBeenCalled();
  });

  it('allows deliberate onboarding for a genuinely empty ledger and seeds once', async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    const welcome = await screen.findByRole('button', { name: 'Complete welcome' });
    expect(seedInitialBudget).not.toHaveBeenCalled();
    expect(Onboarding.markBudgetSeeded).not.toHaveBeenCalled();
    let finishSeed!: () => void;
    vi.mocked(seedInitialBudget).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSeed = resolve;
        })
    );
    await user.click(welcome);
    expect(await screen.findByText('Setting up your budget...')).toBeInTheDocument();
    expect(seedInitialBudget).toHaveBeenCalledOnce();
    expect(seedInitialBudget).toHaveBeenCalledWith(onboardingData);
    finishSeed();
    expect(await screen.findByRole('heading', { name: 'Existing dashboard' })).toBeInTheDocument();
    expect(seedInitialBudget).toHaveBeenCalledOnce();
    expect(Onboarding.markBudgetSeeded).toHaveBeenCalledOnce();
  });

  it('offers a retry on startup read failure without showing onboarding or creating data', async () => {
    const user = userEvent.setup();
    vi.mocked(Onboarding.hasCompletedOnboarding).mockReturnValue(true);
    vi.mocked(GetBudgetPeriods).mockRejectedValueOnce(new Error('Database could not be opened'));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your existing accounts and budgets could not be checked'
    );
    expect(screen.queryByRole('button', { name: 'Complete welcome' })).not.toBeInTheDocument();
    expect(seedInitialBudget).not.toHaveBeenCalled();
    expect(Onboarding.markBudgetSeeded).not.toHaveBeenCalled();
    vi.mocked(GetBudgetPeriods).mockResolvedValue([{ id: 2 }]);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Existing dashboard' })).toBeInTheDocument();
    await waitFor(() => expect(GetBudgetPeriods).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(seedInitialBudget).not.toHaveBeenCalled();
  });

  it('surfaces setup failures and can retry without duplicating successful setup', async () => {
    const user = userEvent.setup();
    vi.mocked(Onboarding.hasCompletedOnboarding).mockReturnValue(true);
    vi.mocked(seedInitialBudget)
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(undefined);
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'starter budget and paycheck schedules could not be created'
    );
    expect(Onboarding.markBudgetSeeded).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(seedInitialBudget).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(Onboarding.markBudgetSeeded).toHaveBeenCalledOnce());
  });
});
