import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  addGoalProgress,
  deleteAllFinancialData,
  deleteBudget,
  deleteTransaction,
  getBudgetAlerts,
  deleteGoal,
  deleteRecurring,
  getBudgets,
  getCategoryBreakdown,
  getGoals,
  getMonthlySummary,
  getMonthlyTrend,
  getRecurring,
  getTransaction,
  getTransactions,
  initDatabase,
  insertGoal,
  insertRecurring,
  insertTransaction,
  updateTransaction,
  upsertBudget,
} from '@/lib/database';
import { endOfMonth, monthKey, startOfMonth } from '@/lib/format';
import type {
  Budget,
  BudgetAlert,
  CategorySpend,
  MonthlySummary,
  RecurringBill,
  SavingsGoal,
  Transaction,
  TransactionDraft,
  TransactionFilters,
} from '@/lib/types';

type FinanceContextValue = {
  ready: boolean;
  error: string | null;
  month: string;
  setMonth: (month: string) => void;
  transactions: Transaction[];
  history: Transaction[];
  goals: SavingsGoal[];
  bills: RecurringBill[];
  summary: MonthlySummary;
  breakdown: CategorySpend[];
  trend: MonthlySummary[];
  budgets: Budget[];
  alerts: BudgetAlert[];
  refresh: () => Promise<void>;
  addTransaction: (draft: TransactionDraft) => Promise<number>;
  saveTransaction: (id: number, draft: TransactionDraft) => Promise<void>;
  removeTransaction: (id: number) => Promise<void>;
  findTransaction: (id: number) => Promise<Transaction | null>;
  saveBudget: (category: Budget['category'], amount: number) => Promise<void>;
  removeBudget: (id: number) => Promise<void>;
  addGoal: (name: string, target: number) => Promise<void>;
  progressGoal: (id: number, amount: number) => Promise<void>;
  removeGoal: (id: number) => Promise<void>;
  addBill: (input: { name: string; amount: number; nextDate: string; category: RecurringBill['category'] }) => Promise<void>;
  removeBill: (id: number) => Promise<void>;
  eraseAll: () => Promise<void>;
  searchTransactions: (filters?: TransactionFilters) => Promise<Transaction[]>;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

const emptySummary = (month: string): MonthlySummary => ({
  month,
  income: 0,
  expenses: 0,
  balance: 0,
  count: 0,
});

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(monthKey());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [summary, setSummary] = useState<MonthlySummary>(emptySummary(month));
  const [breakdown, setBreakdown] = useState<CategorySpend[]>([]);
  const [trend, setTrend] = useState<MonthlySummary[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const loadId = useRef(0);

  const refresh = useCallback(async (nextMonth = month) => {
    const request = ++loadId.current;
    const [list, all, nextSummary, nextBreakdown, nextTrend, nextBudgets, nextAlerts, nextGoals, nextBills] =
      await Promise.all([
        getTransactions({ from: startOfMonth(nextMonth), to: endOfMonth(nextMonth) }),
        getTransactions(),
        getMonthlySummary(nextMonth),
        getCategoryBreakdown(nextMonth),
        getMonthlyTrend(nextMonth),
        getBudgets(nextMonth),
        getBudgetAlerts(nextMonth),
        getGoals(),
        getRecurring(),
      ]);
    if (request !== loadId.current) return;
    setTransactions(list);
    setHistory(all);
    setGoals(nextGoals);
    setBills(nextBills);
    setSummary(nextSummary);
    setBreakdown(nextBreakdown);
    setTrend(nextTrend);
    setBudgets(nextBudgets);
    setAlerts(nextAlerts);
  }, [month]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initDatabase();
        if (cancelled) return;
        await refresh();
        if (!cancelled) {
          setReady(true);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to open local database');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const addTransaction = useCallback(
    async (draft: TransactionDraft) => {
      const id = await insertTransaction(draft);
      await refresh();
      return id;
    },
    [refresh],
  );

  const saveTransaction = useCallback(
    async (id: number, draft: TransactionDraft) => {
      await updateTransaction(id, draft);
      await refresh();
    },
    [refresh],
  );

  const removeTransaction = useCallback(
    async (id: number) => {
      await deleteTransaction(id);
      await refresh();
    },
    [refresh],
  );

  const saveBudget = useCallback(
    async (category: Budget['category'], amount: number) => {
      await upsertBudget({ month, category, amount });
      await refresh();
    },
    [month, refresh],
  );

  const removeBudget = useCallback(
    async (id: number) => {
      await deleteBudget(id);
      await refresh();
    },
    [refresh],
  );

  const addGoal = useCallback(async (name: string, target: number) => {
    await insertGoal(name, target);
    await refresh();
  }, [refresh]);

  const progressGoal = useCallback(async (id: number, amount: number) => {
    await addGoalProgress(id, amount);
    await refresh();
  }, [refresh]);

  const removeGoal = useCallback(async (id: number) => {
    await deleteGoal(id);
    await refresh();
  }, [refresh]);

  const addBill = useCallback(async (input: { name: string; amount: number; nextDate: string; category: RecurringBill['category'] }) => {
    await insertRecurring(input);
    await refresh();
  }, [refresh]);

  const removeBill = useCallback(async (id: number) => {
    await deleteRecurring(id);
    await refresh();
  }, [refresh]);

  const eraseAll = useCallback(async () => {
    await deleteAllFinancialData();
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ready,
      error,
      month,
      setMonth,
      transactions,
      history,
      goals,
      bills,
      summary,
      breakdown,
      trend,
      budgets,
      alerts,
      refresh: () => refresh(),
      addTransaction,
      saveTransaction,
      removeTransaction,
      findTransaction: getTransaction,
      saveBudget,
      removeBudget,
      addGoal,
      progressGoal,
      removeGoal,
      addBill,
      removeBill,
      eraseAll,
      searchTransactions: getTransactions,
    }),
    [
      ready,
      error,
      month,
      transactions,
      history,
      goals,
      bills,
      summary,
      breakdown,
      trend,
      budgets,
      alerts,
      refresh,
      addTransaction,
      saveTransaction,
      removeTransaction,
      saveBudget,
      removeBudget,
      addGoal,
      progressGoal,
      removeGoal,
      addBill,
      removeBill,
      eraseAll,
    ],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within FinanceProvider');
  }
  return context;
}
