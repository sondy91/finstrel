import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App';
import { setPracticeSession } from './lib/practice';

const original = window.go;
afterEach(() => {
  cleanup();
  setPracticeSession(null);
  window.go = original;
  vi.restoreAllMocks();
});
it('lets a new user practice review, close, start the next period, reset, and return without seeding or changing their ledger', async () => {
  const native = vi.fn((name: string) => {
    if (name === 'GetAccounts' || name === 'GetBudgetPeriods') return [];
    if (name === 'GetBankFeedView') return { configured: true, environment: 'sandbox', items: [] };
    throw new Error(`Unexpected native action: ${name}`);
  });
  window.go = {
    main: {
      App: new Proxy(original.main.App, {
        get:
          (_target, key) =>
          (..._args: unknown[]) =>
            Promise.resolve(native(String(key))),
      }),
    },
  };
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Try a practice household' }));
  expect(
    await screen.findByRole('heading', { name: 'Try finishing a pay period' })
  ).toBeInTheDocument();
  await user.click(await screen.findByRole('button', { name: 'Review Previous two weeks' }));
  const review = await screen.findByRole('dialog');
  expect(await within(review).findByText('Spent')).toBeInTheDocument();
  expect(review).toHaveTextContent('$318.00');
  await user.click(within(review).getByRole('button', { name: /Review bank transactions/ }));
  await user.click(await screen.findByRole('button', { name: 'View transaction Example dinner' }));
  await user.selectOptions(screen.getByLabelText('Budget category'), '3');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Practice budgets' }));
  await user.click(await screen.findByRole('button', { name: 'Review Previous two weeks' }));
  const updatedReview = await screen.findByRole('dialog');
  expect(updatedReview).toHaveTextContent('$342.00');
  await user.click(within(updatedReview).getByRole('button', { name: /Review bank transactions/ }));
  await user.click(
    await screen.findByRole('button', { name: 'View transaction Example grocery purchase' })
  );
  expect(screen.getByRole('region', { name: 'Possible duplicate transactions' })).toHaveTextContent(
    'Example duplicate grocery entry'
  );
  await user.click(screen.getByRole('checkbox', { name: 'Include in budget' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Practice budgets' }));
  await user.click(await screen.findByRole('button', { name: 'Review Previous two weeks' }));
  const reconciledReview = await screen.findByRole('dialog');
  expect(reconciledReview).toHaveTextContent('$307.00');
  expect(within(reconciledReview).getByRole('button', { name: 'Close budget' })).toBeDisabled();
  await user.click(within(reconciledReview).getByRole('checkbox'));
  await user.click(within(reconciledReview).getByRole('button', { name: 'Close budget' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await user.click(await screen.findByRole('button', { name: 'Start next period' }));
  const next = await screen.findByRole('dialog');
  await user.type(within(next).getByLabelText('New period name'), 'Our next two weeks');
  await user.click(await within(next).findByRole('button', { name: 'Create next period' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(await screen.findByText('Envelopes for: Our next two weeks')).toBeInTheDocument();
  expect(localStorage.getItem('vestra-onboarding-complete')).toBeNull();
  expect(localStorage.getItem('vestra-budget-seeded')).toBeNull();
  expect(native.mock.calls.map(([name]) => name)).toEqual([
    'GetAccounts',
    'GetBudgetPeriods',
    'GetBankFeedView',
  ]);
  await user.click(screen.getByRole('button', { name: 'Reset practice' }));
  expect(
    await screen.findByRole('button', { name: 'Review Previous two weeks' })
  ).toBeInTheDocument();
  expect(screen.queryByText('Our next two weeks')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Return to my budget' }));
  expect(await screen.findByRole('heading', { name: 'Welcome to Finstrel' })).toBeInTheDocument();
  expect(localStorage.getItem('vestra-onboarding-complete')).toBeNull();
  expect(
    native.mock.calls.every(([name]) =>
      ['GetAccounts', 'GetBudgetPeriods', 'GetBankFeedView'].includes(name)
    )
  ).toBe(true);
});
