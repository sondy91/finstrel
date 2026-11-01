import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import WelcomePage from '../../pages/WelcomePage';
import { ThemeProvider } from '../../components/theme/ThemeProvider';

vi.mock('../../components/BankConnectionsPanel', () => ({ default: () => <div>Bank connection controls</div> }));

describe('WelcomePage', () => {
  beforeAll(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  const renderWelcome = () => {
    const onGetStarted = vi.fn();

    return {
      onGetStarted,
      user: userEvent.setup(),
      ...render(
        <ThemeProvider>
          <WelcomePage onGetStarted={onGetStarted} />
        </ThemeProvider>
      ),
    };
  };

  it('renders hero copy and primary action', async () => {
    const { user } = renderWelcome();

    expect(
      screen.getByRole('heading', { name: /welcome to finstrel/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/plan budgets and track envelopes/i)
    ).toBeInTheDocument();

    const cta = screen.getByRole('button', { name: /get started/i });
    expect(cta).toBeInTheDocument();

    const stepIndicators = screen.getAllByLabelText(/wizard step/i);
    expect(stepIndicators).toHaveLength(7);
    expect(stepIndicators[0]).toHaveAttribute('data-active', 'true');

    await user.click(cta);
    expect(screen.getByText(/customize your experience/i)).toBeInTheDocument();
  });

  it('applies theme changes from step 2 customization', async () => {
    const { user } = renderWelcome();

    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await user.click(screen.getByRole('button', { name: /get started/i }));

    const lightModeBtn = screen.getByRole('button', { name: /light/i });
    await user.click(lightModeBtn);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('vestra-theme')).toBe('light');
  });

  it('navigates to step 2 and allows accent color and theme selection', async () => {
    const { user } = renderWelcome();

    const getStartedBtn = screen.getByRole('button', { name: /get started/i });
    await user.click(getStartedBtn);

    expect(screen.getByText(/customize your experience/i)).toBeInTheDocument();

    const blueAccent = screen.getByLabelText(/select blue accent/i);
    await user.click(blueAccent);
    expect(blueAccent).toHaveClass('scale-110');
    expect(window.localStorage.getItem('vestra-accent')).toBe('blue');

    const lightModeBtn = screen.getByRole('button', { name: /light/i });
    await user.click(lightModeBtn);

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    expect(continueBtn).toBeInTheDocument();
  });

  it('navigates back from step 2 to step 1', async () => {
    const { user } = renderWelcome();

    await user.click(screen.getByRole('button', { name: /get started/i }));
    expect(screen.getByText(/customize your experience/i)).toBeInTheDocument();

    const backBtn = screen.getByRole('button', { name: /back/i });
    await user.click(backBtn);

    expect(screen.getByText(/welcome to finstrel/i)).toBeInTheDocument();
  });

  it('navigates to step 3 and allows goal selection', async () => {
    const { user } = renderWelcome();

    await user.click(screen.getByRole('button', { name: /get started/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByText(/what are your goals\?/i)).toBeInTheDocument();

    const debtGoal = screen.getByLabelText(/select goal: pay off debt/i);
    await user.click(debtGoal);
    expect(debtGoal).toHaveClass('border-primary');

    const budgetGoal = screen.getByLabelText(/select goal: create a budget/i);
    await user.click(budgetGoal);
    expect(budgetGoal).toHaveClass('border-primary');

    await user.click(debtGoal);
    expect(debtGoal).not.toHaveClass('border-primary');
  });
  it('completes setup and saves the chosen category amounts', async () => {
    const {user,onGetStarted}=renderWelcome();
    await user.click(screen.getByRole('button',{name:/get started/i}));
    await user.click(screen.getByRole('button',{name:/continue/i}));
    await user.click(screen.getByLabelText(/select goal: pay off debt/i));
    await user.click(screen.getByRole('button',{name:/continue/i}));
    await user.click(screen.getByRole('button',{name:/^no$/i}));
    await user.click(screen.getByRole('button',{name:/continue/i}));
    await user.click(screen.getByLabelText(/select category: groceries/i));
    await user.click(screen.getByLabelText(/select category: utilities/i));
    await user.click(screen.getByRole('button',{name:/continue/i}));
    await user.type(screen.getByRole('spinbutton',{name:/groceries/i}),'275.50');
    await user.click(screen.getByRole('button',{name:/continue/i}));
    expect(screen.getByText(/bank connection controls/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:/finish setup/i}));
    expect(onGetStarted).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('vestra-onboarding-complete')).toBe('true');
    expect(JSON.parse(window.localStorage.getItem('vestra-onboarding-data')!)).toMatchObject({
      goals:['debt'],categories:['groceries','utilities'],defaultAmounts:{groceries:275.5,utilities:0},
    });
  });

  it('branches for partners and returns to the right step', async () => {
    const { user } = renderWelcome();
    await user.click(screen.getByRole('button', { name: /get started/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByLabelText(/select goal: pay off debt/i));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /^yes$/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText(/email invitations aren't available yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /back/i }));
    await user.click(screen.getByRole('button', { name: /^no$/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('heading', { name: /choose starter categories/i })).toBeInTheDocument();
  });

});
