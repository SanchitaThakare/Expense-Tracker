export type TransactionType = 'debit' | 'credit';

export type TransactionSource = 'manual' | 'sms_sample' | 'sms_paste';

export const CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Transport',
  'Shopping',
  'Bills & Utilities',
  'Entertainment',
  'Health',
  'Travel',
  'Education',
  'Transfers',
  'Income',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Transaction = {
  id: number;
  type: TransactionType;
  amount: number;
  date: string;
  merchant: string;
  category: Category;
  notes: string;
  source: TransactionSource;
  rawMessage: string | null;
  categoryLocked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TransactionDraft = {
  type: TransactionType;
  amount: number;
  date: string;
  merchant: string;
  category: Category;
  notes?: string;
  source?: TransactionSource;
  rawMessage?: string | null;
  categoryLocked?: boolean;
};

export type TransactionFilters = {
  query?: string;
  type?: TransactionType | 'all';
  category?: Category | 'all';
  from?: string;
  to?: string;
};

export type Budget = {
  id: number;
  month: string;
  category: Category | 'Overall';
  amount: number;
};

export type BudgetAlert = {
  category: Category | 'Overall';
  spent: number;
  limit: number;
  percent: number;
  level: 'warning' | 'over';
};

export type ParsedSms = {
  amount: number | null;
  type: TransactionType | null;
  date: string | null;
  merchant: string | null;
  accountMasked: string | null;
  reference: string | null;
  blockedReason: string | null;
  confidence: number;
  raw: string;
};

export type SavingsGoal = {
  id: number;
  name: string;
  target: number;
  saved: number;
};

export type RecurringBill = {
  id: number;
  name: string;
  amount: number;
  nextDate: string;
  category: Category;
};

export type MonthlySummary = {
  month: string;
  income: number;
  expenses: number;
  balance: number;
  count: number;
};

export type CategorySpend = {
  category: Category;
  amount: number;
  color: string;
};
