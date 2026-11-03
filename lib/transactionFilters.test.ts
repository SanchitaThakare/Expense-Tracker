import assert from 'node:assert/strict';
import test from 'node:test';

import type { Transaction } from './types';
import { filterActivity, movementOf, sortActivity } from './transactionFilters';

function row(partial: Pick<Transaction, 'id' | 'type' | 'amount' | 'date' | 'merchant' | 'category'> & Partial<Transaction>): Transaction {
  return {
    notes: '',
    source: 'manual',
    rawMessage: null,
    categoryLocked: false,
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
    ...partial,
  };
}

const rows = [
  row({ id: 1, type: 'debit', amount: 200, date: '2026-10-02', merchant: 'Swiggy', category: 'Food & Dining' }),
  row({ id: 2, type: 'credit', amount: 50000, date: '2026-10-28', merchant: 'Salary', category: 'Income', notes: 'October pay' }),
  row({ id: 3, type: 'debit', amount: 1000, date: '2026-10-20', merchant: 'ATM', category: 'Transfers' }),
  row({ id: 4, type: 'debit', amount: 80, date: '2026-10-28', merchant: 'Metro', category: 'Transport' }),
];

test('filters by category, type, and search together', () => {
  const food = filterActivity(rows, { category: 'Food & Dining' });
  assert.deepEqual(food.map((item) => item.id), [1]);

  const credits = filterActivity(rows, { type: 'credit' });
  assert.deepEqual(credits.map((item) => item.id), [2]);

  const notes = filterActivity(rows, { query: 'october pay' });
  assert.deepEqual(notes.map((item) => item.id), [2]);
});

test('date bounds and sorts update which rows are visible', () => {
  const today = filterActivity(rows, { from: '2026-10-28', to: '2026-10-28', sort: 'amount' });
  assert.deepEqual(today.map((item) => item.id), [2, 4]);

  const oldest = sortActivity(rows, 'oldest').map((item) => item.id);
  assert.deepEqual(oldest, [1, 3, 2, 4]);
});

test('marks credits, debits, and transfers differently', () => {
  assert.equal(movementOf(rows[1]).label, 'Received');
  assert.equal(movementOf(rows[0]).label, 'Spent');
  assert.equal(movementOf(rows[2]).key, 'transfer');
  assert.equal(movementOf(rows[2]).symbol, '');
});
