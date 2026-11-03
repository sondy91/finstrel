export type DuplicateCandidate = {
  key: string;
  date: string;
  amount: number;
  currency: string;
  description: string;
  source: 'connected' | 'manual';
  bankName?: string;
  accountMask?: string;
  disconnected?: boolean;
};

// Suggestions require exact date, signed amount and currency. Bank-to-bank
// comparisons also require the same institution, account mask and merchant.
export function findPossibleDuplicates<T extends DuplicateCandidate>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  const result = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.currency || !row.date || !Number.isFinite(row.amount) || row.amount === 0) continue;
    const key = JSON.stringify([row.date.slice(0, 10), row.currency, Math.round(row.amount * 100)]);
    const group = groups.get(key) || [];
    for (const other of group) {
      const manualAndBank = row.source !== other.source;
      const sameBankHistory =
        row.source === 'connected' &&
        other.source === 'connected' &&
        row.disconnected !== other.disconnected &&
        !!row.accountMask &&
        row.accountMask === other.accountMask &&
        !!row.bankName &&
        row.bankName === other.bankName &&
        !!row.description.trim() &&
        row.description.trim().toLowerCase() === other.description.trim().toLowerCase();
      if (!manualAndBank && !sameBankHistory) continue;
      result.set(row.key, [...(result.get(row.key) || []), other]);
      result.set(other.key, [...(result.get(other.key) || []), row]);
    }
    group.push(row);
    groups.set(key, group);
  }
  return result;
}
