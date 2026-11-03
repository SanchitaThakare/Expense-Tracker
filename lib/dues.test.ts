import assert from 'node:assert/strict';
import test from 'node:test';

import { outstandingFor, repaymentFits, roundMoney, summarizeDues, type DueEntry } from './dues';
import { toISODate } from './format';
import { parseDuePhrase } from './duesParser';

function entry(partial: Pick<DueEntry, 'id' | 'personName' | 'personKey' | 'kind' | 'amount'> & Partial<DueEntry>): DueEntry {
  return {
    date: '2026-10-28',
    note: '',
    reminderDate: null,
    rawPhrase: null,
    createdAt: '2026-10-28T00:00:00.000Z',
    ...partial,
  };
}

test('parses Marathi roman lending', () => {
  const parsed = parseDuePhrase('Mi Rahul la 500 rupaye dile');
  assert.equal(parsed.personName, 'Rahul');
  assert.equal(parsed.amount, 500);
  assert.equal(parsed.kind, 'lent');
  assert.equal(parsed.dateExplicit, false);
  assert.ok(parsed.questions.some((question) => /date/i.test(question)));
});

test('parses Devanagari lending with Marathi digits', () => {
  const parsed = parseDuePhrase('राहुलला ५०० रुपये दिले.');
  assert.equal(parsed.personName, 'राहुल');
  assert.equal(parsed.amount, 500);
  assert.equal(parsed.kind, 'lent');
});

test('parses Hindi lending', () => {
  const parsed = parseDuePhrase('मैंने राहुल को 500 रुपये दिए');
  assert.equal(parsed.personName, 'राहुल');
  assert.equal(parsed.amount, 500);
  assert.equal(parsed.kind, 'lent');
});

test('parses Hindi repayment', () => {
  const parsed = parseDuePhrase('राहुल ने 500 रुपये वापस किए');
  assert.equal(parsed.personName, 'राहुल');
  assert.equal(parsed.amount, 500);
  assert.equal(parsed.kind, 'repayment');
});

test('parses roman repayment', () => {
  const parsed = parseDuePhrase('Rahul ne 500 wapas dile');
  assert.equal(parsed.personName, 'Rahul');
  assert.equal(parsed.amount, 500);
  assert.equal(parsed.kind, 'repayment');
});

test('parses English lending with today', () => {
  const parsed = parseDuePhrase('I gave Priya 750 rupees today');
  assert.equal(parsed.personName, 'Priya');
  assert.equal(parsed.amount, 750);
  assert.equal(parsed.kind, 'lent');
  assert.equal(parsed.date, toISODate());
  assert.equal(parsed.dateExplicit, true);
});

test('parses English repayment yesterday', () => {
  const parsed = parseDuePhrase('Priya paid me back 250 yesterday');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  assert.equal(parsed.personName, 'Priya');
  assert.equal(parsed.amount, 250);
  assert.equal(parsed.kind, 'repayment');
  assert.equal(parsed.date, toISODate(yesterday));
});

test('keeps an explicit Indian date and ignores it as the amount', () => {
  const parsed = parseDuePhrase('12/10/2026 Mi Rahul la 1,200 rupaye dile');
  assert.equal(parsed.amount, 1200);
  assert.equal(parsed.date, '2026-10-12');
  assert.equal(parsed.personName, 'Rahul');
  assert.equal(parsed.kind, 'lent');
});

test('asks instead of guessing a missing name, amount, kind, or kal', () => {
  const missingName = parseDuePhrase('500 rupaye dile');
  assert.equal(missingName.personName, null);
  assert.ok(missingName.questions.some((question) => /person/i.test(question)));

  const missingAmount = parseDuePhrase('Mi Rahul la paanchshe rupaye dile');
  assert.equal(missingAmount.amount, null);
  assert.equal(missingAmount.personName, 'Rahul');
  assert.ok(missingAmount.questions.some((question) => /digits/i.test(question)));

  const ambiguous = parseDuePhrase('Rahul ne 500 dile');
  assert.equal(ambiguous.kind, null);
  assert.equal(ambiguous.personName, 'Rahul');
  assert.ok(ambiguous.questions.some((question) => /returned/i.test(question)));

  const kal = parseDuePhrase('Mi Rahul la 500 rupaye kal dile');
  assert.equal(kal.date, null);
  assert.ok(kal.questions.some((question) => /काल/.test(question)));
});

test('keeps each person separate and does not treat repayments as income', () => {
  const entries = [
    entry({ id: 1, personName: 'rahul', personKey: 'rahul', kind: 'lent', amount: 500, date: '2026-10-01' }),
    entry({ id: 2, personName: 'Rahul', personKey: 'rahul', kind: 'lent', amount: 200.2 }),
    entry({ id: 3, personName: 'Rahul', personKey: 'rahul', kind: 'repayment', amount: 150, date: '2026-10-20' }),
    entry({ id: 4, personName: 'Sneha', personKey: 'sneha', kind: 'lent', amount: 1000, reminderDate: '2026-11-02' }),
  ];
  const totals = summarizeDues(entries);

  assert.equal(totals.lent, roundMoney(500 + 200.2 + 1000));
  assert.equal(totals.repaid, 150);
  assert.equal(totals.outstanding, roundMoney(totals.lent - totals.repaid));
  assert.equal(outstandingFor(entries, 'Rahul'), roundMoney(700.2 - 150));
  assert.equal(totals.people.find((person) => person.personKey === 'rahul')?.personName, 'Rahul');
  assert.equal(outstandingFor(entries, 'Sneha'), 1000);
  assert.equal(totals.people.find((person) => person.personKey === 'sneha')?.reminderDate, '2026-11-02');
  assert.equal(outstandingFor(entries, 'Unknown'), 0);
});

test('keeps money borrowed separate from money lent', () => {
  const entries = [
    entry({ id: 1, personName: 'Amit', personKey: 'amit', kind: 'lent', amount: 500 }),
    entry({ id: 2, personName: 'Amit', personKey: 'amit', kind: 'borrowed', amount: 300 }),
    entry({ id: 3, personName: 'Amit', personKey: 'amit', kind: 'settled', amount: 100 }),
  ];
  const person = summarizeDues(entries).people[0];
  assert.equal(person.outstanding, 500);
  assert.equal(person.iOwe, 200);
  assert.equal(summarizeDues(entries).outstanding, 500);
  assert.equal(summarizeDues(entries).iOwe, 200);
});

test('parses borrowing and returning money you owe', () => {
  const borrowed = parseDuePhrase('I borrowed 800 from Neha');
  assert.equal(borrowed.kind, 'borrowed');
  assert.equal(borrowed.personName, 'Neha');
  assert.equal(borrowed.amount, 800);

  const settled = parseDuePhrase('Mi Amit la 200 parat dile');
  assert.equal(settled.kind, 'settled');
  assert.equal(settled.personName, 'Amit');
  assert.equal(settled.amount, 200);
});

test('rejects a repayment larger than what that person still owes', () => {
  assert.equal(repaymentFits(550, 550), true);
  assert.equal(repaymentFits(550, 550.01), false);
  assert.equal(repaymentFits(0, 100), false);
});
