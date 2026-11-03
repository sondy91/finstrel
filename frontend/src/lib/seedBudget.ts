/**
 * Initial budget seeding from onboarding wizard selections
 * Creates default budget period and categories based on user choices
 */

import { SeedOnboarding } from '../wailsAdapter';
import type { OnboardingData } from './onboarding';
import { dateKey } from './planning';

/**
 * Category mapping from wizard IDs to display names
 */
const CATEGORY_MAP: Record<string, string> = {
  groceries: 'Groceries',
  rent: 'Rent/Mortgage',
  utilities: 'Utilities',
  transportation: 'Transportation',
  entertainment: 'Entertainment',
  savings: 'Savings',
};

/**
 * Generate default budget period name for current month
 */
function getDefaultPeriodName(startDate?: string): string {
  const now = startDate ? new Date(`${startDate}T12:00:00`) : new Date();
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${monthNames[now.getMonth()]} ${now.getFullYear()} Budget`;
}

/**
 * Get start and end dates for current month
 */
function getCurrentMonthDates(): { startDate: string; endDate: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const startDate = dateKey(new Date(year, month, 1));
  const endDate = dateKey(new Date(year, month + 1, 0));

  return { startDate, endDate };
}

/**
 * Seed initial budget from onboarding data
 * Creates:
 * 1. Categories and their reusable default amounts
 * 2. Default budget period, which atomically copies those defaults
 */
export async function seedInitialBudget(data: OnboardingData): Promise<void> {
  try {
    const fallback = getCurrentMonthDates();
    const startDate = data.budgetStartDate || fallback.startDate;
    const endDate = data.budgetEndDate || fallback.endDate;
    const categories = data.categories
      .filter((id) => CATEGORY_MAP[id])
      .map((id) => ({
        name: CATEGORY_MAP[id],
        type: 'Expense',
        defaultAmount: data.defaultAmounts?.[id] ?? 0,
      }));
    const incomes = (data.paychecks || []).map((paycheck) => ({
      name: paycheck.name,
      amount: paycheck.amount,
      active: true,
      schedule: {
        cadence: paycheck.cadence,
        anchorDate: paycheck.anchorDate,
        secondDay: paycheck.secondDay,
        endDate: '',
      },
    }));
    await SeedOnboarding(getDefaultPeriodName(startDate), startDate, endDate, categories, incomes);

    console.log('Initial budget seeding complete');
  } catch (error) {
    console.error('Failed to seed initial budget:', error);
    throw new Error(
      `Budget seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
