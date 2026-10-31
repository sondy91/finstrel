import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AddTransactionForm from "@/components/AddTransactionForm";
import { type BankFeedView } from "@/components/BankConnectionsPanel";
import {
  GetAccounts,
  GetBankFeedView,
  GetCategories,
  GetTransactions,
} from "@/wailsAdapter";
import { models } from "../../wailsjs/go/models";
import { dayLabel, errorText } from "@/lib/planning";
import {
  bankMoney,
  categoryLabel,
  supportsBankHistory,
  type TransactionFilter,
} from "@/lib/transactionBrowser";

type Row = {
  key: string;
  id: string;
  date: string;
  description: string;
  category: string;
  account: string;
  accountKey: string;
  institution: string;
  amount: number;
  currency: string;
  pending: boolean;
  notes: string;
  source: "connected" | "manual";
};
const PAGE_SIZE = 25;

export default function TransactionsPage({
  initialFilter,
}: {
  initialFilter?: TransactionFilter;
}) {
  const [manual, setManual] = useState<models.Transaction[]>([]);
  const [accounts, setAccounts] = useState<models.Account[]>([]);
  const [categories, setCategories] = useState<models.Category[]>([]);
  const [feeds, setFeeds] = useState<BankFeedView | null>(null);
  const [source, setSource] = useState<"connected" | "manual">(
    initialFilter?.source || "connected",
  );
  const [accountKey, setAccountKey] = useState(
    initialFilter?.itemId
      ? JSON.stringify(
          initialFilter.accountId
            ? [initialFilter.itemId, initialFilter.accountId]
            : [initialFilter.itemId],
        )
      : "",
  );
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(initialFilter?.from || "");
  const [to, setTo] = useState(initialFilter?.to || "");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [manualLoading, setManualLoading] = useState(true);
  const [bankLoading, setBankLoading] = useState(true);
  const loading = source === "connected" ? bankLoading : manualLoading;
  const [manualError, setManualError] = useState("");
  const [bankError, setBankError] = useState("");
  const mounted = useRef(true);
  const loadNumber = useRef(0);
  const firstLoad = useRef(true);
  const load = async () => {
    const version = ++loadNumber.current;
    const active = () => mounted.current && version === loadNumber.current;
    setManualLoading(true);
    setBankLoading(true);
    const ledger = Promise.all([
      GetTransactions(),
      GetCategories(),
      GetAccounts(),
    ])
      .then(([tx, cats, acc]) => {
        if (!active()) return;
        setManual(tx || []);
        setCategories(cats || []);
        setAccounts(acc || []);
        setManualError("");
      })
      .catch((reason) => {
        if (active()) {
          setManual([]);
          setManualError(errorText(reason));
        }
      })
      .finally(() => {
        if (active()) setManualLoading(false);
      });
    const bank = GetBankFeedView()
      .then((value: BankFeedView) => {
        if (!active()) return;
        setFeeds(value);
        setBankError("");
        if (firstLoad.current && !initialFilter && !(value.items || []).length)
          setSource("manual");
        firstLoad.current = false;
      })
      .catch((reason: unknown) => {
        if (active()) {
          setFeeds(null);
          setBankError(errorText(reason));
          firstLoad.current = false;
        }
      })
      .finally(() => {
        if (active()) setBankLoading(false);
      });
    await Promise.allSettled([ledger, bank]);
  };
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadNumber.current++;
    };
  }, []);
  const connectedRows: Row[] = (feeds?.items || []).flatMap((item) =>
    (item.transactions || []).map((tx) => {
      const account = item.accounts.find((a) => a.id === tx.accountId);
      return {
        key: JSON.stringify([item.id, tx.id]),
        id: tx.id,
        date: tx.date,
        description: tx.description,
        category: categoryLabel(tx.category),
        account: account
          ? `${account.name}${account.mask ? ` · ••${account.mask}` : ""}`
          : "Unavailable account",
        accountKey: JSON.stringify([item.id, tx.accountId]),
        institution: item.institution,
        amount: tx.amount,
        currency: tx.currency,
        pending: tx.pending,
        notes: "",
        source: "connected" as const,
      };
    }),
  );
  const manualRows: Row[] = manual.map((tx) => ({
    key: `manual-${tx.id}`,
    id: String(tx.id),
    date: String(tx.date).slice(0, 10),
    description: tx.description,
    category:
      categories.find((c) => c.id === tx.categoryId)?.name || "Uncategorized",
    account:
      accounts.find((a) => a.id === tx.accountId)?.name ||
      "Unavailable account",
    accountKey: String(tx.accountId),
    institution: "Manual ledger",
    amount: tx.amount,
    currency: "USD",
    pending: tx.status === "Pending",
    notes: tx.notes || "",
    source: "manual",
  }));
  const sourceRows = source === "connected" ? connectedRows : manualRows;
  const accountOptions = new Map<string, string>();
  if (source === "connected") {
    for (const item of feeds?.items || []) {
      accountOptions.set(
        JSON.stringify([item.id]),
        `All accounts — ${item.institution}`,
      );
      for (const a of (item.accounts || []).filter(a=>supportsBankHistory(a,item.transactions||[])))
        accountOptions.set(
          JSON.stringify([item.id, a.id]),
          `${a.name}${a.mask ? ` · ••${a.mask}` : ""} — ${item.institution}`,
        );
    }
  } else {
    for (const a of accounts) accountOptions.set(String(a.id), a.name);
  }
  const rows = sourceRows
    .filter(
      (r) =>
        (!accountKey ||
          (source === "connected" && JSON.parse(accountKey).length === 1
            ? JSON.parse(r.accountKey)[0] === JSON.parse(accountKey)[0]
            : r.accountKey === accountKey)) &&
        (!from || r.date >= from) &&
        (!to || r.date <= to) &&
        (!search ||
          `${r.description} ${r.category} ${r.account} ${r.institution}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1),
  );
  const totals = new Map<string, { incoming: number; outgoing: number }>();
  for (const r of rows) {
    const t = totals.get(r.currency) || { incoming: 0, outgoing: 0 };
    if (r.amount > 0) t.incoming += r.amount;
    else t.outgoing -= r.amount;
    totals.set(r.currency, t);
  }
  const error = source === "connected" ? bankError : manualError;
  const changeSource = (value: "connected" | "manual") => {
    setSource(value);
    setAccountKey("");
    setPage(0);
  };
  const reset = () => {
    setAccountKey("");
    setSearch("");
    setFrom("");
    setTo("");
    setPage(0);
  };
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Follow the spending back to its account.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add manual entry
        </Button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div
          className="flex gap-1"
          role="group"
          aria-label="Transaction source"
        >
          <Button
            variant={source === "connected" ? "secondary" : "ghost"}
            aria-pressed={source === "connected"}
            onClick={() => changeSource("connected")}
          >
            Connected accounts{" "}
            <span className="ml-2 text-xs text-muted-foreground">
              {connectedRows.length}
            </span>
          </Button>
          <Button
            variant={source === "manual" ? "secondary" : "ghost"}
            aria-pressed={source === "manual"}
            onClick={() => changeSource("manual")}
          >
            Manual ledger{" "}
            <span className="ml-2 text-xs text-muted-foreground">
              {manualRows.length}
            </span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {source === "connected"
            ? `${feeds?.environment === "sandbox" ? "Test bank data · " : ""}Imports aren’t included in budget totals yet.`
            : "Manual entries update your budget and balances."}
        </p>
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_1.3fr_1fr_1fr_auto]">
        <div>
          <Label htmlFor="tx-search">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="tx-search"
              className="pl-9"
              placeholder="Merchant, category or account"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="tx-account">Account</Label>
          <Select
            id="tx-account"
            value={accountKey}
            onChange={(e) => {
              setAccountKey(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All accounts</option>
            {Array.from(accountOptions).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="tx-from">From</Label>
          <Input
            id="tx-from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div>
          <Label htmlFor="tx-to">Through</Label>
          <Input
            id="tx-to"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Button variant="ghost" onClick={reset}>
          Clear filters
        </Button>
      </div>
      {from && to && from > to && (
        <p role="alert" className="text-sm text-destructive">
          Choose an end date on or after the start date.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}{" "}
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_230px]">
        <section
          className="overflow-hidden rounded-lg border bg-card text-card-foreground"
          aria-label="Transaction list"
        >
          {loading ? (
            <p role="status" className="p-8 text-sm text-muted-foreground">
              Loading transactions…
            </p>
          ) : !error && rows.length === 0 ? (
            <div className="p-10 text-center">
              <h2 className="font-semibold">No transactions match</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {source === "connected"
                  ? "Import bank updates in Accounts, or adjust your filters."
                  : "Add an entry or adjust your filters."}
              </p>
            </div>
          ) : (
            !error && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    {source === "connected"
                      ? "Connected account"
                      : "Manual ledger"}{" "}
                    transactions
                  </caption>
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .slice(
                        currentPage * PAGE_SIZE,
                        (currentPage + 1) * PAGE_SIZE,
                      )
                      .map((r) => (
                        <tr key={r.key} className="border-t hover:bg-muted/30">
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {dayLabel(r.date)}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              className="text-left font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-primary"
                              onClick={() => setSelected(r)}
                              aria-label={`View transaction ${r.description}`}
                            >
                              {r.description}
                            </button>
                            {r.pending && (
                              <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {r.category}
                          </td>
                          <td className="px-4 py-3">
                            <span className="block">{r.account}</span>
                            {source === "connected" && (
                              <span className="text-xs text-muted-foreground">
                                {r.institution}
                              </span>
                            )}
                          </td>
                          <td
                            className={`whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium ${r.amount > 0 ? "text-emerald-700 dark:text-emerald-300" : ""}`}
                          >
                            {r.amount > 0 ? "+" : ""}
                            {bankMoney(r.amount, r.currency)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )
          )}
          {!loading && !error && rows.length > 0 && (
            <nav
              className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground"
              aria-label="Transaction pages"
            >
              <span>
                {currentPage * PAGE_SIZE + 1}–
                {Math.min((currentPage + 1) * PAGE_SIZE, rows.length)} of{" "}
                {rows.length}
              </span>
              <div className="flex gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Previous transactions page"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Next transactions page"
                  disabled={(currentPage + 1) * PAGE_SIZE >= rows.length}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </nav>
          )}
        </section>
        <aside
          className="space-y-4 rounded-lg border bg-card p-4"
          aria-label="Filtered transaction summary"
        >
          <h2 className="font-semibold">This selection</h2>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Transactions</span>
            <strong>{loading ? "—" : rows.length}</strong>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pending</span>
            <span>{rows.filter((r) => r.pending).length}</span>
          </div>
          {Array.from(totals).map(([currency, t]) => (
            <div key={currency} className="space-y-2 border-t pt-3 text-sm">
              <span className="text-xs text-muted-foreground">
                {currency || "Currency unknown"}
              </span>
              <div className="flex justify-between gap-2">
                <span>Money in</span>
                <span className="tabular-nums text-emerald-700 dark:text-emerald-300">
                  {bankMoney(t.incoming, currency)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Money out</span>
                <span className="tabular-nums">
                  {bankMoney(t.outgoing, currency)}
                </span>
              </div>
            </div>
          ))}
          {rows.some((r) => r.pending) && (
            <p className="text-xs text-muted-foreground">
              Includes pending transactions.
            </p>
          )}
        </aside>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="left-auto right-0 top-0 flex h-full max-h-screen translate-x-0 translate-y-0 flex-col gap-6 overflow-y-auto rounded-none sm:max-w-lg sm:rounded-none">
          <DialogHeader>
            <DialogTitle>{selected?.description || "Transaction"}</DialogTitle>
            <DialogDescription>
              {selected?.source === "connected"
                ? "Connected account transaction"
                : "Manual ledger entry"}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-7">
              <div>
                <p className="text-3xl font-semibold tabular-nums">
                  {bankMoney(selected.amount, selected.currency)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.account}
                </p>
              </div>
              <dl className="space-y-4 text-sm">
                {[
                  ["Date", dayLabel(selected.date)],
                  ["Category", selected.category],
                  ["Institution", selected.institution],
                  ["Status", selected.pending ? "Pending" : "Posted"],
                  ["Currency", selected.currency || "Unknown"],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between gap-4 border-b pb-3"
                  >
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              {selected.notes && (
                <div>
                  <h3 className="text-sm font-medium">Notes</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selected.notes}
                  </p>
                </div>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setSource(selected.source);
                  setAccountKey(selected.accountKey);
                  setSearch("");
                  setPage(0);
                  setSelected(null);
                }}
              >
                View this account’s transactions{" "}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
              {selected.source === "connected" && (
                <p className="text-xs text-muted-foreground">
                  {feeds?.environment === "sandbox"
                    ? "Simulated bank data. "
                    : ""}
                  Imported history is read-only and remains separate from manual
                  budget totals.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add manual entry</DialogTitle>
            <DialogDescription>
              Record income or an expense in your manual ledger.
            </DialogDescription>
          </DialogHeader>
          <AddTransactionForm
            categories={categories}
            accounts={accounts}
            onTransactionAdded={() => {
              setAdding(false);
              setSource("manual");
              setAccountKey("");
              void load();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
