import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/utils';
import { buildReportData } from '@/lib/reportData';
import { GetBankFeedView, GetCategories, GetTransactions } from '@/wailsAdapter';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const colors = ['#d9a84e', '#54b0a5', '#8d9ed6', '#e18667', '#a484c7', '#8eac65'];
type ReportData = ReturnType<typeof buildReportData>;

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([GetTransactions(), GetCategories(), GetBankFeedView()])
      .then(([transactions, categories, feeds]) => {
        if (active) setData(buildReportData(transactions || [], categories || [], feeds));
      })
      .catch(() => {
        if (active) setError('Could not load report data.');
      });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return (
      <div className="page-container mx-auto max-w-7xl px-6 py-8" role="alert">
        {error}
      </div>
    );
  if (!data)
    return (
      <div
        className="flex min-h-[400px] items-center justify-center text-muted-foreground"
        role="status"
      >
        Loading reports…
      </div>
    );
  return (
    <div className="page-container mx-auto max-w-7xl px-6 py-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Reports</h1>
      {data.excluded > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          {data.excluded} uncategorized or non-USD bank transactions are excluded.
        </p>
      )}
      {data.possibleOverlap && (
        <p className="mb-4 text-sm text-muted-foreground">
          Bank and other transactions may overlap. Review possible duplicates in Transactions.
        </p>
      )}
      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Income vs Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            {data.monthlyData.length ? (
              <div className="h-[300px] w-full min-w-0" aria-label="Income and expenses chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.monthlyData}
                    margin={{ top: 5, right: 15, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `$${formatMoney(value)}`} />
                    <Legend />
                    <Bar dataKey="income" name="Income" fill="#22c55e" />
                    <Bar dataKey="expense" name="Expenses" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No transactions yet.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {data.categoryData.length ? (
              <div aria-label="Spending by category chart">
                <div className="h-[220px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.categoryData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        nameKey="name"
                      >
                        {data.categoryData.map((entry, index) => (
                          <Cell key={entry.name} fill={colors[index % colors.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `$${formatMoney(value)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
                  {data.categoryData.map((entry, index) => (
                    <li key={entry.name} className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: colors[index % colors.length] }}
                      />
                      <span>
                        {entry.name}{' '}
                        {Math.round(
                          (entry.value /
                            data.categoryData.reduce((sum, item) => sum + item.value, 0)) *
                            100
                        )}
                        %
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No categorized spending yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
