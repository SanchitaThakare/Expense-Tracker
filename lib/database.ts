import * as SQLite from 'expo-sqlite';

import { CATEGORY_COLORS } from './categories';
import { personKey, roundMoney, type DueDraft, type DueEntry, type DueKind } from './dues';
import { endOfMonth, monthKey, nowIso, startOfMonth } from './format';
import {
  CATEGORIES,
  type Budget,
  type BudgetAlert,
  type Category,
  type CategorySpend,
  type MonthlySummary,
  type Transaction,
  type TransactionDraft,
  type TransactionFilters,
  type TransactionSource,
  type TransactionType,
} from './types';

const DB_NAME = 'expense-tracker.db';

let db: SQLite.SQLiteDatabase | null = null;
let opening: Promise<void> | null = null;

type TransactionRow = {
  id: number;
  type: TransactionType;
  amount: number;
  date: string;
  merchant: string;
  category: Category;
  notes: string;
  source: TransactionSource;
  raw_message: string | null;
  category_locked: number;
  created_at: string;
  updated_at: string;
};

type BudgetRow = {
  id: number;
  month: string;
  category: string;
  amount: number;
};

function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Database is not initialized');
  }
  return db;
}

function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    date: row.date,
    merchant: row.merchant,
    category: row.category,
    notes: row.notes ?? '',
    source: row.source,
    rawMessage: row.raw_message,
    categoryLocked: Boolean(row.category_locked),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function initDatabase(): Promise<void> {
  if (!opening) {
    opening = openDatabase().catch((error) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}

async function openDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('debit', 'credit')),
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      merchant TEXT NOT NULL,
      category TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      raw_message TEXT,
      category_locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      UNIQUE(month, category)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_name TEXT NOT NULL,
      person_key TEXT NOT NULL,
      entry_type TEXT NOT NULL CHECK(entry_type IN ('lent', 'repayment')),
      amount REAL NOT NULL CHECK(amount > 0),
      date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      reminder_date TEXT,
      raw_phrase TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dues_person ON dues(person_key);
    CREATE TABLE IF NOT EXISTS people (
      person_key TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target REAL NOT NULL,
      saved REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS recurring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      next_date TEXT NOT NULL,
      category TEXT NOT NULL
    );
  `);
  await migrateDuesTable();
  await removeAutomaticSamples();
}

async function migrateDuesTable(): Promise<void> {
  const row = await getDb().getFirstAsync<{ sql: string | null }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'dues'",
  );
  if (!row?.sql || row.sql.includes("'borrowed'")) return;
  await getDb().execAsync(`
    CREATE TABLE dues_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_name TEXT NOT NULL,
      person_key TEXT NOT NULL,
      entry_type TEXT NOT NULL CHECK(entry_type IN ('lent', 'repayment', 'borrowed', 'settled')),
      amount REAL NOT NULL CHECK(amount > 0),
      date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      reminder_date TEXT,
      raw_phrase TEXT,
      created_at TEXT NOT NULL
    );
    INSERT INTO dues_next (id, person_name, person_key, entry_type, amount, date, note, reminder_date, raw_phrase, created_at)
    SELECT id, person_name, person_key, entry_type, amount, date, note, reminder_date, raw_phrase, created_at FROM dues;
    DROP TABLE dues;
    ALTER TABLE dues_next RENAME TO dues;
    CREATE INDEX IF NOT EXISTS idx_dues_person ON dues(person_key);
  `);
}

async function getSetting(key: string): Promise<string | null> {
  const row = await getDb().getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await getDb().runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

async function removeAutomaticSamples(): Promise<void> {
  const done = await getSetting('removed_auto_samples_v1');
  if (done === '1') return;
  await getDb().runAsync(
    `DELETE FROM transactions WHERE source = 'sms_sample' AND notes LIKE 'Imported from % sample SMS'`,
  );
  const remaining = await getDb().getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM transactions',
  );
  if ((remaining?.count ?? 0) === 0) {
    await getDb().runAsync(
      `DELETE FROM budgets
       WHERE (category = 'Overall' AND amount = 25000)
          OR (category = 'Food & Dining' AND amount = 4000)
          OR (category = 'Shopping' AND amount = 5000)`,
    );
  }
  await setSetting('removed_auto_samples_v1', '1');
}

function assertTransactionDraft(draft: TransactionDraft): void {
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
    throw new Error('Amount must be greater than 0.');
  }
  if (!draft.merchant.trim()) {
    throw new Error('A merchant or description is required.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(new Date(`${draft.date}T12:00:00`).getTime())) {
    throw new Error('A valid date is required.');
  }
  if (!CATEGORIES.includes(draft.category)) {
    throw new Error('Choose a category.');
  }
}

export async function insertTransaction(draft: TransactionDraft): Promise<number> {
  assertTransactionDraft(draft);
  const now = nowIso();
  const result = await getDb().runAsync(
    `INSERT INTO transactions
      (type, amount, date, merchant, category, notes, source, raw_message, category_locked, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      draft.type,
      draft.amount,
      draft.date,
      draft.merchant.trim(),
      draft.category,
      draft.notes ?? '',
      draft.source ?? 'manual',
      draft.rawMessage ?? null,
      draft.categoryLocked ? 1 : 0,
      now,
      now,
    ],
  );
  return Number(result.lastInsertRowId);
}

export async function updateTransaction(id: number, draft: TransactionDraft): Promise<void> {
  assertTransactionDraft(draft);
  await getDb().runAsync(
    `UPDATE transactions
     SET type = ?, amount = ?, date = ?, merchant = ?, category = ?, notes = ?,
         source = ?, raw_message = ?, category_locked = ?, updated_at = ?
     WHERE id = ?`,
    [
      draft.type,
      draft.amount,
      draft.date,
      draft.merchant.trim(),
      draft.category,
      draft.notes ?? '',
      draft.source ?? 'manual',
      draft.rawMessage ?? null,
      draft.categoryLocked ? 1 : 0,
      nowIso(),
      id,
    ],
  );
}

export async function deleteTransaction(id: number): Promise<void> {
  await getDb().runAsync('DELETE FROM transactions WHERE id = ?', [id]);
}

export async function getTransaction(id: number): Promise<Transaction | null> {
  const row = await getDb().getFirstAsync<TransactionRow>(
    'SELECT * FROM transactions WHERE id = ?',
    [id],
  );
  return row ? mapTransaction(row) : null;
}

export async function getTransactions(filters: TransactionFilters = {}): Promise<Transaction[]> {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filters.from) {
    clauses.push('date >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push('date <= ?');
    params.push(filters.to);
  }
  if (filters.type && filters.type !== 'all') {
    clauses.push('type = ?');
    params.push(filters.type);
  }
  if (filters.category && filters.category !== 'all') {
    clauses.push('category = ?');
    params.push(filters.category);
  }
  if (filters.query?.trim()) {
    const q = `%${filters.query.trim()}%`;
    clauses.push('(merchant LIKE ? OR category LIKE ? OR notes LIKE ? OR IFNULL(raw_message, "") LIKE ?)');
    params.push(q, q, q, q);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await getDb().getAllAsync<TransactionRow>(
    `SELECT * FROM transactions ${where} ORDER BY date DESC, id DESC`,
    params,
  );
  return rows.map(mapTransaction);
}

export async function getMonthlySummary(month: string): Promise<MonthlySummary> {
  const row = await getDb().getFirstAsync<{ income: number; expenses: number; count: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'credit' AND category != 'Transfers' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'debit' AND category != 'Transfers' THEN amount ELSE 0 END), 0) AS expenses,
       COUNT(*) AS count
     FROM transactions
     WHERE date >= ? AND date <= ?`,
    [startOfMonth(month), endOfMonth(month)],
  );
  const income = row?.income ?? 0;
  const expenses = row?.expenses ?? 0;
  return {
    month,
    income,
    expenses,
    balance: income - expenses,
    count: row?.count ?? 0,
  };
}

export async function getCategoryBreakdown(month: string): Promise<CategorySpend[]> {
  const rows = await getDb().getAllAsync<{ category: Category; amount: number }>(
    `SELECT category, COALESCE(SUM(amount), 0) AS amount
     FROM transactions
     WHERE type = 'debit' AND category != 'Transfers' AND date >= ? AND date <= ?
     GROUP BY category
     HAVING amount > 0
     ORDER BY amount DESC`,
    [startOfMonth(month), endOfMonth(month)],
  );
  return rows.map((row) => ({
    category: row.category,
    amount: row.amount,
    color: CATEGORY_COLORS[row.category] ?? CATEGORY_COLORS.Other,
  }));
}

export async function getMonthlyTrend(currentMonth: string, count = 6): Promise<MonthlySummary[]> {
  const [year, month] = currentMonth.split('-').map(Number);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(monthKey(new Date(year, month - 1 - i, 1)));
  }
  return Promise.all(keys.map((key) => getMonthlySummary(key)));
}

export async function getBudgets(month: string): Promise<Budget[]> {
  const rows = await getDb().getAllAsync<BudgetRow>(
    'SELECT * FROM budgets WHERE month = ? ORDER BY category',
    [month],
  );
  return rows.map((row) => ({
    id: row.id,
    month: row.month,
    category: row.category as Budget['category'],
    amount: row.amount,
  }));
}

export async function upsertBudget(input: {
  month: string;
  category: Budget['category'];
  amount: number;
}): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO budgets (month, category, amount)
     VALUES (?, ?, ?)
     ON CONFLICT(month, category) DO UPDATE SET amount = excluded.amount`,
    [input.month, input.category, input.amount],
  );
}

export async function deleteBudget(id: number): Promise<void> {
  await getDb().runAsync('DELETE FROM budgets WHERE id = ?', [id]);
}

export async function getBudgetAlerts(month: string): Promise<BudgetAlert[]> {
  const [budgets, summary, breakdown] = await Promise.all([
    getBudgets(month),
    getMonthlySummary(month),
    getCategoryBreakdown(month),
  ]);
  const spendByCategory = Object.fromEntries(breakdown.map((item) => [item.category, item.amount]));
  const alerts: BudgetAlert[] = [];

  for (const budget of budgets) {
    const spent =
      budget.category === 'Overall'
        ? summary.expenses
        : spendByCategory[budget.category] ?? 0;
    if (budget.amount <= 0) continue;
    const percent = (spent / budget.amount) * 100;
    if (percent >= 80) {
      alerts.push({
        category: budget.category,
        spent,
        limit: budget.amount,
        percent,
        level: percent >= 100 ? 'over' : 'warning',
      });
    }
  }

  return alerts.sort((a, b) => b.percent - a.percent);
}

type DueRow = {
  id: number;
  person_name: string;
  person_key: string;
  entry_type: DueKind;
  amount: number;
  date: string;
  note: string;
  reminder_date: string | null;
  raw_phrase: string | null;
  created_at: string;
};

function mapDue(row: DueRow): DueEntry {
  return {
    id: row.id,
    personName: row.person_name,
    personKey: row.person_key,
    kind: row.entry_type,
    amount: row.amount,
    date: row.date,
    note: row.note ?? '',
    reminderDate: row.reminder_date,
    rawPhrase: row.raw_phrase,
    createdAt: row.created_at,
  };
}

export async function getDues(): Promise<DueEntry[]> {
  const rows = await getDb().getAllAsync<DueRow>(
    'SELECT * FROM dues ORDER BY date DESC, id DESC',
  );
  return rows.map(mapDue);
}

export async function insertDue(draft: DueDraft): Promise<number> {
  const name = draft.personName.trim().replace(/\s+/g, ' ');
  if (name.length < 2) throw new Error('A person name is required.');
  if (!Number.isFinite(draft.amount) || roundMoney(draft.amount) <= 0) {
    throw new Error('Amount must be greater than 0.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) throw new Error('A valid date is required.');
  const result = await getDb().runAsync(
    `INSERT INTO dues
      (person_name, person_key, entry_type, amount, date, note, reminder_date, raw_phrase, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      personKey(name),
      draft.kind,
      roundMoney(draft.amount),
      draft.date,
      draft.note?.trim() ?? '',
      draft.kind === 'lent' ? draft.reminderDate ?? null : null,
      draft.rawPhrase ?? null,
      nowIso(),
    ],
  );
  return Number(result.lastInsertRowId);
}

export async function updateDue(id: number, draft: DueDraft): Promise<void> {
  const name = draft.personName.trim().replace(/\s+/g, ' ');
  if (name.length < 2) throw new Error('A person name is required.');
  if (!Number.isFinite(draft.amount) || roundMoney(draft.amount) <= 0) {
    throw new Error('Amount must be greater than 0.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) throw new Error('A valid date is required.');
  await getDb().runAsync(
    `UPDATE dues
     SET person_name = ?, person_key = ?, entry_type = ?, amount = ?, date = ?, note = ?, reminder_date = ?, raw_phrase = ?
     WHERE id = ?`,
    [
      name,
      personKey(name),
      draft.kind,
      roundMoney(draft.amount),
      draft.date,
      draft.note?.trim() ?? '',
      draft.kind === 'lent' ? draft.reminderDate ?? null : null,
      draft.rawPhrase ?? null,
      id,
    ],
  );
}

export async function deleteDue(id: number): Promise<void> {
  await getDb().runAsync('DELETE FROM dues WHERE id = ?', [id]);
}

export async function getPersonNotes(personKeyValue: string): Promise<string> {
  const row = await getDb().getFirstAsync<{ notes: string }>(
    'SELECT notes FROM people WHERE person_key = ?',
    [personKeyValue],
  );
  return row?.notes ?? '';
}

export async function savePersonNotes(personKeyValue: string, displayName: string, notes: string): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO people (person_key, display_name, notes) VALUES (?, ?, ?)
     ON CONFLICT(person_key) DO UPDATE SET display_name = excluded.display_name, notes = excluded.notes`,
    [personKeyValue, displayName, notes.trim()],
  );
}

export async function getGoals(): Promise<import('./types').SavingsGoal[]> {
  const rows = await getDb().getAllAsync<{ id: number; name: string; target: number; saved: number }>(
    'SELECT * FROM goals ORDER BY id DESC',
  );
  return rows;
}

export async function insertGoal(name: string, target: number): Promise<void> {
  await getDb().runAsync('INSERT INTO goals (name, target, saved) VALUES (?, ?, 0)', [name.trim(), target]);
}

export async function addGoalProgress(id: number, amount: number): Promise<void> {
  await getDb().runAsync('UPDATE goals SET saved = saved + ? WHERE id = ?', [amount, id]);
}

export async function deleteGoal(id: number): Promise<void> {
  await getDb().runAsync('DELETE FROM goals WHERE id = ?', [id]);
}

export async function getRecurring(): Promise<import('./types').RecurringBill[]> {
  const rows = await getDb().getAllAsync<{
    id: number;
    name: string;
    amount: number;
    next_date: string;
    category: import('./types').Category;
  }>('SELECT * FROM recurring ORDER BY next_date ASC');
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    amount: row.amount,
    nextDate: row.next_date,
    category: row.category,
  }));
}

export async function insertRecurring(input: {
  name: string;
  amount: number;
  nextDate: string;
  category: import('./types').Category;
}): Promise<void> {
  await getDb().runAsync(
    'INSERT INTO recurring (name, amount, next_date, category) VALUES (?, ?, ?, ?)',
    [input.name.trim(), input.amount, input.nextDate, input.category],
  );
}

export async function deleteRecurring(id: number): Promise<void> {
  await getDb().runAsync('DELETE FROM recurring WHERE id = ?', [id]);
}

export async function deleteAllFinancialData(): Promise<void> {
  await getDb().execAsync(`
    DELETE FROM transactions;
    DELETE FROM dues;
    DELETE FROM budgets;
    DELETE FROM goals;
    DELETE FROM recurring;
    DELETE FROM people;
  `);
}

export async function setDueReminder(personKeyValue: string, reminderDate: string | null): Promise<void> {
  const row = await getDb().getFirstAsync<{ id: number }>(
    `SELECT id FROM dues
     WHERE person_key = ? AND entry_type = 'lent'
     ORDER BY date DESC, id DESC
     LIMIT 1`,
    [personKeyValue],
  );
  if (!row) return;
  await getDb().runAsync('UPDATE dues SET reminder_date = ? WHERE id = ?', [reminderDate, row.id]);
}
