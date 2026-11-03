import { expect, it } from 'vitest';
import { findPossibleDuplicates, type DuplicateCandidate } from './duplicateSuggestions';

it('suggests exact manual matches and matching disconnected bank history only', () => {
  const bank: DuplicateCandidate = {
    key: 'bank',
    date: '2026-11-02',
    amount: -25,
    currency: 'USD',
    description: 'Market',
    source: 'connected',
    bankName: 'Chase',
    accountMask: '1234',
    disconnected: false,
  };
  const rows: DuplicateCandidate[] = [
    bank,
    { ...bank, key: 'manual', source: 'manual', description: 'Groceries' },
    { ...bank, key: 'old', disconnected: true },
    { ...bank, key: 'other account', disconnected: true, accountMask: '4321' },
    { ...bank, key: 'other date', source: 'manual', date: '2026-11-03' },
    { ...bank, key: 'other currency', source: 'manual', currency: 'EUR' },
    { ...bank, key: 'refund', source: 'manual', amount: 25 },
  ];
  const matches = findPossibleDuplicates(rows);
  expect(matches.get('bank')?.map((row) => row.key)).toEqual(['manual', 'old']);
  expect(matches.get('bank')?.some((row) => row.key === 'other account')).toBe(false);
  expect(matches.get('bank')?.some((row) => row.key === 'refund')).toBe(false);
});
