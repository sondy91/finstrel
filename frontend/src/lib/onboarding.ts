/**
 * Onboarding data persistence utilities
 * Manages localStorage for wizard completion state and user preferences
 */

const ONBOARDING_COMPLETE_KEY = 'vestra-onboarding-complete';
const ONBOARDING_DATA_KEY = 'vestra-onboarding-data';

export type OnboardingData = {
  accentColor: string;
  themeMode: 'light' | 'dark';
  goals: string[];
  categories: string[];
	defaultAmounts: Record<string, number>;
};

/**
 * Save onboarding data to localStorage and mark wizard as complete
 */
export function saveOnboardingData(data: OnboardingData): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(ONBOARDING_DATA_KEY, JSON.stringify(data));
    localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
  } catch (error) {
    console.error('Failed to save onboarding data:', error);
  }
}

/**
 * Retrieve saved onboarding data from localStorage
 */
export function getOnboardingData(): OnboardingData | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const raw = localStorage.getItem(ONBOARDING_DATA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('Failed to read onboarding data:', error);
    return null;
  }
}

/**
 * Check if user has completed the onboarding wizard
 */
export function hasCompletedOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
}

/**
 * Clear onboarding data (for development/reset)
 */
export function clearOnboardingData(): void {
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem(ONBOARDING_DATA_KEY);
  localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
}

/**
 * Check if initial budget has been seeded
 */
export function hasSeededBudget(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('vestra-budget-seeded') === 'true';
}

/**
 * Mark initial budget as seeded
 */
export function markBudgetSeeded(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('vestra-budget-seeded', 'true');
}

/**
 * Clear budget seeded flag (for development/reset)
 */
export function clearBudgetSeeded(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('vestra-budget-seeded');
}
