import { toISODate } from './format';
import type { ParsedSms, TransactionType } from './types';

const AMOUNT_RE = /(?:INR|Rs\.?|₹)\s*([0-9,]+(?:\.\d{1,2})?)/i;

const CREDIT_RE = /\b(credited|credit(?:ed)?|deposited|received|has been credited)\b/i;
const DEBIT_RE =
  /\b(debited|debit|spent|withdrawn|sent|paid|transferred|purchase|purchased)\b/i;

const DATE_PATTERNS: { re: RegExp; parse: (match: RegExpMatchArray) => string | null }[] = [
  {
    re: /\b(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{2,4})\b/,
    parse: ([, d, mon, y]) => fromParts(Number(d), monthIndex(mon), normalizeYear(y)),
  },
  {
    re: /\b(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})\b/,
    parse: ([, d, m, y]) => fromParts(Number(d), Number(m) - 1, normalizeYear(y)),
  },
];

const MERCHANT_PATTERNS = [
  /\bsent to\s+([^.]{2,40}?)(?=\s+via\b|[.]|$)/i,
  /\bpaid\s+(?:rs\.?|inr)?\s*[0-9,.]+\s+to\s+([^.]{2,40}?)(?=\s+at\b|[.]|$)/i,
  /\binfo:\s*([^.]{2,60})/i,
  /\b(?:to|at|towards)\s+([^.]{2,40}?)(?=\s+(?:on|via|upi|avl|ref|info)\b|[.]|$)/i,
  /\bby\s+([^.]{2,50})/i,
];

function monthIndex(value: string): number {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return months.indexOf(value.slice(0, 3).toLowerCase());
}

function normalizeYear(raw: string): number {
  const year = Number(raw);
  if (raw.length === 2) {
    return year >= 70 ? 1900 + year : 2000 + year;
  }
  return year;
}

function fromParts(day: number, month: number, year: number): string | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const date = new Date(year, month, day);
  if (date.getMonth() !== month || date.getDate() !== day) return null;
  return toISODate(date);
}

function parseAmount(text: string): number | null {
  const match = text.match(AMOUNT_RE);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

function parseType(text: string): TransactionType | null {
  const creditIndex = text.search(CREDIT_RE);
  const debitIndex = text.search(DEBIT_RE);

  if (creditIndex === -1 && debitIndex === -1) return null;
  if (creditIndex === -1) return 'debit';
  if (debitIndex === -1) return 'credit';
  return creditIndex < debitIndex ? 'credit' : 'debit';
}

function parseDate(text: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern.re);
    if (match) {
      return pattern.parse(match);
    }
  }
  return null;
}

function cleanMerchant(value: string): string {
  return value
    .replace(/\b(avl(?:\s+bal(?:ance)?)?|available balance|ref(?:erence)?|upi ref)\b.*$/i, '')
    .replace(/[./]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMerchant(text: string): string | null {
  for (const pattern of MERCHANT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const merchant = cleanMerchant(match[1]);
      if (merchant.length >= 2) return merchant;
    }
  }
  return null;
}

function maskAccount(text: string): string | null {
  const match = text.match(/\b(?:a\/c|acct|account|card)\s*(?:no\.?|number)?\s*((?:XX|\*+|x+)\d{2,4}|\d{6,})/i);
  if (!match) return null;
  const token = match[1];
  if (/[Xx*]/.test(token)) return token.toUpperCase();
  return `XXXX${token.slice(-4)}`;
}

function parseReference(text: string): string | null {
  const match = text.match(/\b(?:upi(?:\s*ref(?:erence)?)?|ref(?:erence)?|imps)\s*[:.]?\s*([A-Z0-9]{6,})/i);
  return match?.[1] ?? null;
}

function blockedReason(text: string): string | null {
  if (/\b(otp|one[-\s]?time password|upi\s*pin|password|cvv)\b/i.test(text)) {
    return 'This message looks like a secret. It was not saved.';
  }
  if (/\b(failed|declined|unsuccessful|could not|not completed)\b/i.test(text)) {
    return 'This message does not show a completed transaction.';
  }
  return null;
}

function score(parsed: ParsedSms): number {
  let confidence = 0;
  if (parsed.amount != null) confidence += 0.4;
  if (parsed.type) confidence += 0.3;
  if (parsed.date) confidence += 0.15;
  if (parsed.merchant) confidence += 0.15;
  return Number(confidence.toFixed(2));
}

export function parseSms(raw: string): ParsedSms {
  const text = raw.replace(/\s+/g, ' ').trim();
  const blocked = blockedReason(text);
  const parsed: ParsedSms = {
    amount: blocked ? null : parseAmount(text),
    type: blocked ? null : parseType(text),
    date: blocked ? null : parseDate(text),
    merchant: blocked ? null : parseMerchant(text),
    accountMasked: maskAccount(text),
    reference: blocked ? null : parseReference(text),
    blockedReason: blocked,
    confidence: 0,
    raw,
  };
  parsed.confidence = blocked ? 0 : score(parsed);
  return parsed;
}

export function isDuplicateSms(
  parsed: ParsedSms,
  existing: { amount: number; date: string; type: string; merchant: string; rawMessage: string | null }[],
): boolean {
  const raw = parsed.raw.replace(/\s+/g, ' ').trim().toLowerCase();
  return existing.some((item) => {
    if (item.rawMessage && item.rawMessage.replace(/\s+/g, ' ').trim().toLowerCase() === raw) return true;
    if (parsed.reference && item.rawMessage?.includes(parsed.reference)) return true;
    return (
      parsed.amount != null &&
      parsed.type != null &&
      parsed.date != null &&
      parsed.merchant != null &&
      item.amount === parsed.amount &&
      item.type === parsed.type &&
      item.date === parsed.date &&
      item.merchant.toLowerCase() === parsed.merchant.toLowerCase()
    );
  });
}

export function parseSmsBatch(messages: string[]): ParsedSms[] {
  return messages.map(parseSms);
}
