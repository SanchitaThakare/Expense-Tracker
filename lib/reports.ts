import { addDays, endOfMonth, monthKey, startOfMonth, toISODate } from './format';

export type ReportPeriod = 'day' | 'week' | 'month' | 'year';

export type CashRow = {
  type: 'debit' | 'credit';
  amount: number;
  date: string;
  category: string;
};

export type PeriodSummary = {
  from: string;
  to: string;
  income: number;
  expenses: number;
  balance: number;
  count: number;
};

export type SpendingAnomaly = {
  category: string;
  current: number;
  baseline: number;
  detail: string;
};

export function isSpending(row: { type: string; category: string }): boolean {
  return row.type === 'debit' && row.category !== 'Transfers';
}

export function isIncome(row: { type: string; category: string }): boolean {
  return row.type === 'credit' && row.category !== 'Transfers';
}

export function periodBounds(period: ReportPeriod, today: string, month: string): { from: string; to: string } {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const anchor = today >= monthStart && today <= monthEnd ? today : monthEnd;
  if (period === 'day') return { from: anchor, to: anchor };
  if (period === 'week') return { from: addDays(anchor, -6), to: anchor };
  if (period === 'year') {
    const year = month.slice(0, 4);
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  return { from: monthStart, to: monthEnd };
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function summarizePeriod(rows: CashRow[], from: string, to: string): PeriodSummary {
  const inside = rows.filter((row) => row.date >= from && row.date <= to);
  const income = round(inside.filter(isIncome).reduce((sum, row) => sum + row.amount, 0));
  const expenses = round(inside.filter(isSpending).reduce((sum, row) => sum + row.amount, 0));
  return { from, to, income, expenses, balance: round(income - expenses), count: inside.length };
}

export function spendingAnomalies(rows: CashRow[], month: string): SpendingAnomaly[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const priorMonths = [1, 2, 3]
    .map((offset) => monthKey(new Date(year, monthNumber - 1 - offset, 1)))
    .filter((key) => rows.some((row) => row.date.startsWith(key) && isSpending(row)));
  if (priorMonths.length < 2) return [];

  const categories = new Set(rows.filter(isSpending).map((row) => row.category));
  const anomalies: SpendingAnomaly[] = [];
  for (const category of categories) {
    const current = round(
      rows
        .filter((row) => isSpending(row) && row.category === category && row.date.startsWith(month))
        .reduce((sum, row) => sum + row.amount, 0),
    );
    const prior = priorMonths.map((key) =>
      round(
        rows
          .filter((row) => isSpending(row) && row.category === category && row.date.startsWith(key))
          .reduce((sum, row) => sum + row.amount, 0),
      ),
    );
    const baseline = round(prior.reduce((sum, value) => sum + value, 0) / prior.length);
    if (baseline > 0 && current > baseline * 1.5) {
      anomalies.push({
        category,
        current,
        baseline,
        detail: `${category} is ${current.toFixed(0)} this month, above 1.5× the recent average of ${baseline.toFixed(0)}.`,
      });
    }
  }
  return anomalies.sort((a, b) => b.current - a.current);
}

export function todayIso(): string {
  return toISODate();
}
