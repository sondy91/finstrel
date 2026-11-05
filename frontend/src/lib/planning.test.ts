import { describe, expect, it } from 'vitest';
import { nextBudgetDates } from './planning';

describe('nextBudgetDates', () => {
  it('keeps calendar month budgets aligned across shorter months and leap years', () => {
    expect(nextBudgetDates('2026-10-01', '2026-10-31')).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    });
    expect(nextBudgetDates('2028-01-01', '2028-01-31')).toEqual({
      start: '2028-02-01',
      end: '2028-02-29',
    });
  });
  it('preserves the inclusive length of pay-period budgets across daylight saving changes', () => {
    expect(nextBudgetDates('2026-10-20', '2026-11-02')).toEqual({
      start: '2026-11-03',
      end: '2026-11-16',
    });
    expect(nextBudgetDates('2026-01-01', '2026-01-01')).toEqual({
      start: '2026-01-02',
      end: '2026-01-03',
    });
  });
});
