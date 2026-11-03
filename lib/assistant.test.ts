import assert from 'node:assert/strict';
import test from 'node:test';

import { applyFollowUp, interpret, isShortFollowUp, previewReady, type AssistantContext } from './assistant';
import { isDuplicateSms, parseSms } from './smsParser';
import { isSpending, periodBounds, spendingAnomalies, summarizePeriod } from './reports';

const today = '2026-10-28';

function context(partial: Partial<AssistantContext> = {}): AssistantContext {
  return {
    today,
    month: '2026-10',
    transactions: [],
    dues: [],
    ...partial,
  };
}

test('previews a Marathi loan without counting it as an expense', () => {
  const reply = interpret('Mi Rahul la kal 500 rupaye dile.', context());
  assert.equal(reply.preview?.record, 'lent');
  assert.equal(reply.preview?.person, 'Rahul');
  assert.equal(reply.preview?.amount, 500);
  assert.equal(reply.preview?.dateExplicit, false);
  assert.match(reply.message, /not be counted as an expense/i);
  assert.equal(previewReady(reply.preview!), false);
});

test('previews an English grocery expense', () => {
  const reply = interpret('I paid Priya ₹1,200 for groceries.', context());
  assert.equal(reply.preview?.record, 'expense');
  assert.equal(reply.preview?.person, 'Priya');
  assert.equal(reply.preview?.amount, 1200);
  assert.equal(reply.preview?.category, 'Groceries');
});

test('asks before recording money still to be collected', () => {
  const reply = interpret('Rahul kadun mala 2,000 rupaye ghayche aahet', context());
  assert.equal(reply.preview?.record, 'lent');
  assert.equal(reply.preview?.person, 'Rahul');
  assert.equal(reply.preview?.amount, 2000);
  assert.match(reply.message, /not income/i);
});

test('does not invent a loan that was never saved', () => {
  const reply = interpret('How much did I lend to Rahul this month?', context());
  assert.equal(reply.kind, 'answer');
  assert.equal(reply.preview, null);
  assert.match(reply.message, /don't have a saved loan/i);
});

test('answers a lending question from saved dues only', () => {
  const reply = interpret('How much did I lend to Rahul this month?', context({
    dues: [
      {
        id: 1, personName: 'Rahul', personKey: 'rahul', kind: 'lent', amount: 500, date: '2026-10-12',
        note: '', reminderDate: null, rawPhrase: null, createdAt: today,
      },
      {
        id: 2, personName: 'Rahul', personKey: 'rahul', kind: 'lent', amount: 100, date: '2026-09-02',
        note: '', reminderDate: null, rawPhrase: null, createdAt: today,
      },
    ],
  }));
  assert.match(reply.message, /500/);
  assert.equal(reply.matches.length, 1);
});

test('separates expenses and loans when listing payments', () => {
  const reply = interpret('Show all payments I made to Rahul.', context({
    transactions: [
      { id: 1, type: 'debit', amount: 80, date: '2026-10-01', merchant: 'Rahul Stores', category: 'Groceries', notes: '' },
    ],
    dues: [
      {
        id: 2, personName: 'Rahul', personKey: 'rahul', kind: 'lent', amount: 500, date: '2026-10-02',
        note: '', reminderDate: null, rawPhrase: null, createdAt: today,
      },
    ],
  }));
  assert.match(reply.matches[0].title, /Expense/);
  assert.match(reply.matches[1].title, /Loan/);
});

test('says when a bill was not saved', () => {
  const reply = interpret('Did I pay the electricity bill this month?', context());
  assert.match(reply.message, /don't have a saved electricity payment/i);
});

test('confirms a collection reminder before saving', () => {
  const reply = interpret('Remind me to collect ₹500 from Amit tomorrow.', context());
  assert.equal(reply.preview?.record, 'lent');
  assert.equal(reply.preview?.person, 'Amit');
  assert.equal(reply.preview?.amount, 500);
  assert.equal(reply.preview?.reminderDate, '2026-10-29');
  assert.match(reply.message, /Confirming will record/i);
});

test('answers how much is left to collect from saved credit only', () => {
  const empty = interpret('How much money do I need to collect?', context());
  assert.equal(empty.preview, null);
  assert.match(empty.message, /don't have a saved amount/i);

  const reply = interpret('How much money do I need to collect?', context({
    dues: [
      {
        id: 1, personName: 'Rahul', personKey: 'rahul', kind: 'lent', amount: 500, date: '2026-10-12',
        note: '', reminderDate: null, rawPhrase: null, createdAt: today,
      },
      {
        id: 2, personName: 'Rahul', personKey: 'rahul', kind: 'repayment', amount: 200, date: '2026-10-20',
        note: '', reminderDate: null, rawPhrase: null, createdAt: today,
      },
    ],
  }));
  assert.equal(reply.preview, null);
  assert.match(reply.message, /300/);
  assert.match(reply.message, /not income/i);
  assert.equal(reply.matches[0]?.title, 'Rahul');
});

test('a new question is not treated as a missing name', () => {
  assert.equal(isShortFollowUp('500'), true);
  assert.equal(isShortFollowUp('Rahul'), true);
  assert.equal(isShortFollowUp('How much money do I need to collect?'), false);
});

test('day and week follow the selected month', () => {
  assert.deepEqual(periodBounds('day', '2026-10-28', '2026-09'), { from: '2026-09-30', to: '2026-09-30' });
  assert.deepEqual(periodBounds('day', '2026-10-28', '2026-10'), { from: '2026-10-28', to: '2026-10-28' });
  assert.equal(periodBounds('month', '2026-10-28', '2026-09').from, '2026-09-01');
});

test('follow-up fills a missing amount instead of guessing earlier', () => {
  const first = interpret('Mi Rahul la rupaye dile', context());
  assert.equal(first.preview?.amount, null);
  const next = applyFollowUp(first.preview!, '500', today);
  assert.equal(next.preview?.amount, 500);
  assert.equal(next.preview?.person, 'Rahul');
});

test('period totals ignore transfers and loans are not in the cash list', () => {
  const summary = summarizePeriod(
    [
      { type: 'credit', amount: 1000, date: '2026-10-01', category: 'Income' },
      { type: 'debit', amount: 200, date: '2026-10-02', category: 'Groceries' },
      { type: 'debit', amount: 900, date: '2026-10-03', category: 'Transfers' },
    ],
    '2026-10-01',
    '2026-10-31',
  );
  assert.equal(summary.income, 1000);
  assert.equal(summary.expenses, 200);
  assert.equal(summary.balance, 800);
  assert.equal(isSpending({ type: 'debit', category: 'Transfers' }), false);
});

test('flags a category only when it exceeds 1.5 times the recent average', () => {
  const rows = [
    { type: 'debit' as const, amount: 100, date: '2026-08-02', category: 'Groceries' },
    { type: 'debit' as const, amount: 100, date: '2026-09-02', category: 'Groceries' },
    { type: 'debit' as const, amount: 400, date: '2026-10-02', category: 'Groceries' },
  ];
  const flags = spendingAnomalies(rows, '2026-10');
  assert.equal(flags.length, 1);
  assert.match(flags[0].detail, /1\.5×/);
});

test('rejects unfinished or secret SMS and detects duplicates', () => {
  const failed = parseSms('INR 500 debited but the transaction failed at ATM.');
  assert.equal(failed.type, null);
  assert.match(failed.blockedReason ?? '', /completed/i);

  const secret = parseSms('Your OTP is 123456 for UPI PIN verification.');
  assert.equal(secret.amount, null);

  const parsed = parseSms('HDFC Bank: INR 100.00 debited from A/c XX4521 on 12-OCT-26 to SWIGGY. UPI Ref 123456789012.');
  assert.equal(parsed.accountMasked, 'XX4521');
  assert.equal(parsed.reference, '123456789012');
  assert.equal(
    isDuplicateSms(parsed, [
      { amount: 100, date: '2026-10-12', type: 'debit', merchant: 'SWIGGY', rawMessage: parsed.raw },
    ]),
    true,
  );
});
