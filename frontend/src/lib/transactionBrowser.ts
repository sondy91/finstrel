export type TransactionFilter = {
  source: "connected" | "manual";
  itemId?: string;
  accountId?: string;
  from?: string;
  to?: string;
};

export function bankMoney(
  value: number | null | undefined,
  currency: string,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(value);
    } catch {
      /* Keep non-ISO currency labels from the bank visible. */
    }
  }
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || "(currency unknown)"}`;
}
export function categoryLabel(value: string) {
  if (!value) return "Uncategorized";
  if (!value.includes("_")) return value;
  const text = value.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function supportsBankHistory(account: {id:string;type:string}, transactions: {accountId:string}[]) {
  return account.type !== 'investment' && (account.type === 'depository' || account.type === 'credit' || transactions.some(tx=>tx.accountId===account.id));
}
