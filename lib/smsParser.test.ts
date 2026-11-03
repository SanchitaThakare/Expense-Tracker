import assert from 'node:assert/strict';
import test from 'node:test';

import { categorizeTransaction } from './categories';
import { SAMPLE_MESSAGES } from './sampleMessages';
import { parseSms } from './smsParser';

test('parses HDFC debit to Swiggy', () => {
  const parsed = parseSms(SAMPLE_MESSAGES[0].body);
  assert.equal(parsed.amount, 1249);
  assert.equal(parsed.type, 'debit');
  assert.equal(parsed.date, '2026-10-12');
  assert.match(parsed.merchant ?? '', /swiggy/i);
  assert.ok(parsed.confidence >= 0.85);
  assert.equal(categorizeTransaction(parsed.merchant ?? '', parsed.type!).category, 'Food & Dining');
});

test('parses SBI Amazon debit with slash date', () => {
  const parsed = parseSms(SAMPLE_MESSAGES[1].body);
  assert.equal(parsed.amount, 850);
  assert.equal(parsed.type, 'debit');
  assert.equal(parsed.date, '2026-10-15');
  assert.match(parsed.merchant ?? '', /amazon/i);
});

test('parses ICICI salary credit with Indian grouping', () => {
  const parsed = parseSms(SAMPLE_MESSAGES[2].body);
  assert.equal(parsed.amount, 75000);
  assert.equal(parsed.type, 'credit');
  assert.equal(parsed.date, '2026-10-01');
  assert.match(parsed.merchant ?? '', /salary/i);
  assert.equal(categorizeTransaction(parsed.merchant ?? '', parsed.type!).category, 'Income');
});

test('parses Axis card spend at Netflix', () => {
  const parsed = parseSms(SAMPLE_MESSAGES[3].body);
  assert.equal(parsed.amount, 499);
  assert.equal(parsed.type, 'debit');
  assert.equal(parsed.date, '2026-10-08');
  assert.match(parsed.merchant ?? '', /netflix/i);
  assert.equal(categorizeTransaction(parsed.merchant ?? '', parsed.type!).category, 'Entertainment');
});

test('parses Yes Bank ATM withdrawal', () => {
  const parsed = parseSms(SAMPLE_MESSAGES[4].body);
  assert.equal(parsed.amount, 2340);
  assert.equal(parsed.type, 'debit');
  assert.equal(parsed.date, '2026-10-20');
  assert.match(parsed.merchant ?? '', /atm/i);
});

test('parses PhonePe UPI to Jio', () => {
  const parsed = parseSms(SAMPLE_MESSAGES[5].body);
  assert.equal(parsed.amount, 199);
  assert.equal(parsed.type, 'debit');
  assert.equal(parsed.date, '2026-10-18');
  assert.match(parsed.merchant ?? '', /jio/i);
  assert.equal(categorizeTransaction(parsed.merchant ?? '', parsed.type!).category, 'Bills & Utilities');
});

test('parses Kotak credit from person', () => {
  const parsed = parseSms(SAMPLE_MESSAGES[6].body);
  assert.equal(parsed.amount, 3499);
  assert.equal(parsed.type, 'credit');
  assert.equal(parsed.date, '2026-10-05');
});

test('parses PNB BigBasket debit with 4-digit year', () => {
  const parsed = parseSms(SAMPLE_MESSAGES[7].body);
  assert.equal(parsed.amount, 1120);
  assert.equal(parsed.type, 'debit');
  assert.equal(parsed.date, '2026-10-22');
  assert.match(parsed.merchant ?? '', /bigbasket/i);
  assert.equal(categorizeTransaction(parsed.merchant ?? '', parsed.type!).category, 'Groceries');
});

test('parses Paytm IRCTC payment', () => {
  const parsed = parseSms(SAMPLE_MESSAGES[8].body);
  assert.equal(parsed.amount, 67.5);
  assert.equal(parsed.type, 'debit');
  assert.equal(parsed.date, '2026-10-11');
  assert.match(parsed.merchant ?? '', /irctc/i);
  assert.equal(categorizeTransaction(parsed.merchant ?? '', parsed.type!).category, 'Transport');
});

test('parses Canara IMPS transfer', () => {
  const parsed = parseSms(SAMPLE_MESSAGES[9].body);
  assert.equal(parsed.amount, 12500);
  assert.equal(parsed.type, 'debit');
  assert.equal(parsed.date, '2026-10-03');
});

test('every sample message extracts amount and type', () => {
  for (const sample of SAMPLE_MESSAGES) {
    const parsed = parseSms(sample.body);
    assert.ok(parsed.amount && parsed.amount > 0, `${sample.id} missing amount`);
    assert.ok(parsed.type, `${sample.id} missing type`);
    assert.ok(parsed.confidence >= 0.7, `${sample.id} low confidence ${parsed.confidence}`);
  }
});
