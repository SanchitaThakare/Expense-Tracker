import type { Category, Transaction, TransactionType } from './types';

export type ActivitySort = 'newest' | 'oldest' | 'amount';

export function movementOf(item: { type: string; category: string }): {
  key: 'received' | 'spent' | 'transfer';
  label: string;
  symbol: string;
} {
  if (item.category === 'Transfers') {
    return { key: 'transfer', label: 'Transfer', symbol: '' };
  }
  if (item.type === 'credit') {
    return { key: 'received', label: 'Received', symbol: '+' };
  }
  return { key: 'spent', label: 'Spent', symbol: '−' };
}

export function filterActivity(
  rows: Transaction[],
  options: {
    query?: string;
    type?: TransactionType | 'all';
    category?: Category | 'all';
    from?: string | null;
    to?: string | null;
    sort?: ActivitySort;
  },
): Transaction[] {
  const query = options.query?.trim().toLowerCase() ?? '';
  const filtered = rows.filter((item) => {
    if (options.type && options.type !== 'all' && item.type !== options.type) return false;
    if (options.category && options.category !== 'all' && item.category !== options.category) return false;
    if (options.from && item.date < options.from) return false;
    if (options.to && item.date > options.to) return false;
    if (!query) return true;
    return `${item.merchant} ${item.category} ${item.notes}`.toLowerCase().includes(query);
  });
  return sortActivity(filtered, options.sort ?? 'newest');
}

export function sortActivity(rows: Transaction[], sort: ActivitySort): Transaction[] {
  const copy = [...rows];
  if (sort === 'oldest') {
    copy.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    return copy;
  }
  if (sort === 'amount') {
    copy.sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date));
    return copy;
  }
  copy.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return copy;
}
