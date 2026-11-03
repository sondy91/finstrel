import type { BankFeedView } from '@/components/BankConnectionsPanel';
import type { models } from '../../wailsjs/go/models';

export function buildReportData(
  transactions: models.Transaction[],
  categories: models.Category[],
  feeds: BankFeedView
) {
  const monthly = new Map<string, { key: string; name: string; income: number; expense: number }>();
  const spending = new Map<number, number>();
  let excluded = 0;
  let includedBank = 0;
  const add = (date: string, categoryId: number, type: string, amount: number) => {
    const key = date.slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key) || !Number.isFinite(amount)) return;
    const name = new Date(`${key}-01T12:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
    });
    const entry = monthly.get(key) || { key, name, income: 0, expense: 0 };
    if (type === 'Income') entry.income += amount;
    else if (type === 'Expense') {
      entry.expense -= amount;
      spending.set(categoryId, (spending.get(categoryId) || 0) - amount);
    } else return;
    monthly.set(key, entry);
  };
  for (const tx of transactions) add(String(tx.date), tx.categoryId, tx.type, tx.amount);
  for (const item of [...(feeds.items || []), ...(feeds.archivedItems || [])])
    for (const tx of item.transactions || []) {
      if (tx.excludeFromBudget) continue;
      const category = categories.find((c) => c.id === tx.budgetCategoryId);
      if (tx.currency !== 'USD' || !category) {
        excluded++;
        continue;
      }
      includedBank++;
      add(tx.date, category.id, category.type, tx.amount);
    }
  const categoryData = [...spending.entries()]
    .filter(([, value]) => value > 0)
    .map(([id, value]) => ({
      name: categories.find((c) => c.id === id)?.name || `Category ${id}`,
      value,
    }))
    .sort((a, b) => b.value - a.value);
  return {
    monthlyData: [...monthly.values()].sort((a, b) => a.key.localeCompare(b.key)),
    categoryData,
    excluded,
    possibleOverlap:
      (transactions.length > 0 && includedBank > 0) ||
      ((feeds.items || []).length > 0 && (feeds.archivedItems || []).length > 0),
  };
}
