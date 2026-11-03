import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { deleteDue, getDues, initDatabase, insertDue, setDueReminder, updateDue } from '@/lib/database';
import {
  iOweFor,
  outstandingFor,
  repaymentFits,
  summarizeDues,
  type DueDraft,
  type DueEntry,
  type DueTotals,
} from '@/lib/dues';

type DuesContextValue = {
  ready: boolean;
  entries: DueEntry[];
  totals: DueTotals;
  refresh: () => Promise<void>;
  addDue: (draft: DueDraft) => Promise<number>;
  editDue: (id: number, draft: DueDraft) => Promise<void>;
  removeDue: (id: number) => Promise<void>;
  saveReminder: (personKey: string, reminderDate: string | null) => Promise<void>;
};

const DuesContext = createContext<DuesContextValue | null>(null);

const emptyTotals: DueTotals = {
  lent: 0,
  repaid: 0,
  borrowed: 0,
  settled: 0,
  outstanding: 0,
  iOwe: 0,
  people: [],
};

export function DuesProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<DueEntry[]>([]);

  const refresh = useCallback(async () => {
    await initDatabase();
    setEntries(await getDues());
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const totals = useMemo(() => summarizeDues(entries), [entries]);

  const assertLedger = useCallback(
    (draft: DueDraft, ignoreId?: number) => {
      const scoped = ignoreId == null ? entries : entries.filter((entry) => entry.id !== ignoreId);
      if (draft.kind === 'repayment' && !repaymentFits(outstandingFor(scoped, draft.personName), draft.amount)) {
        throw new Error('That repayment is larger than the amount this person still owes you.');
      }
      if (draft.kind === 'settled' && !repaymentFits(iOweFor(scoped, draft.personName), draft.amount)) {
        throw new Error('That repayment is larger than the amount you still owe this person.');
      }
    },
    [entries],
  );

  const addDue = useCallback(
    async (draft: DueDraft) => {
      assertLedger(draft);
      const id = await insertDue(draft);
      await refresh();
      return id;
    },
    [assertLedger, refresh],
  );

  const editDue = useCallback(
    async (id: number, draft: DueDraft) => {
      assertLedger(draft, id);
      await updateDue(id, draft);
      await refresh();
    },
    [assertLedger, refresh],
  );

  const removeDue = useCallback(
    async (id: number) => {
      await deleteDue(id);
      await refresh();
    },
    [refresh],
  );

  const saveReminder = useCallback(
    async (key: string, reminderDate: string | null) => {
      await setDueReminder(key, reminderDate);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ ready, entries, totals, refresh, addDue, editDue, removeDue, saveReminder }),
    [ready, entries, totals, refresh, addDue, editDue, removeDue, saveReminder],
  );

  return <DuesContext.Provider value={value}>{children}</DuesContext.Provider>;
}

export function useDues(): DuesContextValue {
  const context = useContext(DuesContext);
  if (!context) {
    throw new Error('useDues must be used within DuesProvider');
  }
  return context;
}
