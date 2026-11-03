import type { DueKind } from './dues';
import { roundMoney } from './dues';
import { toISODate } from './format';

export type DueParse = {
  personName: string | null;
  amount: number | null;
  date: string | null;
  dateExplicit: boolean;
  kind: DueKind | null;
  questions: string[];
  raw: string;
};

const DEVANAGARI_DIGITS = '०१२३४५६७८९';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const REJECTED_NAMES = new Set([
  'mi', 'me', 'main', 'maine', 'i', 'rupaye', 'rupee', 'rupees', 'rs', 'inr', 'money', 'cash',
  'paise', 'paisa', 'aaj', 'today', 'yesterday', 'kal', 'ne', 'la', 'ko', 'na', 'dile', 'diya',
  'diye', 'dila', 'gave', 'given', 'lent', 'the', 'to', 'from', 'back', 'paid', 'wapas', 'parat',
  'मैं', 'मी', 'मि', 'रुपये', 'रुपया', 'आज', 'काल', 'दिले', 'दिए', 'दिया',
]);

const REPAYMENT_RE = /(wapas|vapis|vaapas|parat|परत|वापस|वापिस|paid me back|paid back|repaid|returned|received from)/i;
const BORROWED_RE = /\b(borrowed|ghetle)\b|घेतले|उधार घेत/i;
const LENT_RE = /(dile|dila|diye|diya|दिले|दिला|दिलं|दिए|दिया|gave|given|\blent\b)/i;
const OTHER_PERSON_RE = /\b[\p{L}]{2,}\s+ne\b|[\u0900-\u097F]{2,}\s*ने/iu;
const SELF_RE = /\b(mi|maine|main)\b|^i\b|मैंने|मी\s/i;

function normalizePhrase(raw: string): string {
  return raw
    .replace(/[०-९]/g, (digit) => String(DEVANAGARI_DIGITS.indexOf(digit)))
    .replace(/[।|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fromParts(day: number, month: number, year: number): string | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return toISODate(date);
}

function cleanName(value: string): string | null {
  const trimmed = value.replace(/[.'’"-]+$/g, '').replace(/\s+/g, ' ').trim();
  if (trimmed.length < 2) return null;
  if (REJECTED_NAMES.has(trimmed) || REJECTED_NAMES.has(trimmed.toLocaleLowerCase('en-IN'))) return null;
  if (/^\d+$/.test(trimmed)) return null;
  if (/[\u0900-\u097F]/.test(trimmed)) return trimmed;
  return trimmed
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function parseName(text: string): string | null {
  const patterns = [
    /(?:^|\b)(?:mi|maine|main|i)\s+([\p{L}][\p{L}'.-]{1,40}?)\s+(?:la|ko|na)\b/giu,
    /([\p{L}][\p{L}'.-]{1,40}?)\s+(?:la|ko)\b/giu,
    /(?:gave|lent|given)\s+(?:to\s+)?([\p{L}][\p{L}'.-]{1,40})\b/giu,
    /([\p{L}][\p{L}'.-]{1,40}?)\s+paid me back\b/giu,
    /\bfrom\s+([\p{L}][\p{L}'.-]{1,40})\b/giu,
    /([\u0900-\u097F]{2,}?)\s*(?:ला|को|ने|कडून)/gu,
    /\b([\p{L}][\p{L}'.-]{1,40}?)\s+ne\b/giu,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const name = cleanName(match[1] ?? '');
      if (name) return name;
    }
  }
  return null;
}

function parseKind(text: string): DueKind | null {
  const repayment = REPAYMENT_RE.test(text);
  const lent = LENT_RE.test(text);
  const self = SELF_RE.test(text);
  const other = OTHER_PERSON_RE.test(text);
  if (BORROWED_RE.test(text) && !repayment) return 'borrowed';
  if (repayment && /paid me back|received from/i.test(text)) return 'repayment';
  if (repayment && self && !other) return 'settled';
  if (repayment && other) return 'repayment';
  if (repayment) return null;
  if (lent && other && !self) return null;
  if (lent) return 'lent';
  return null;
}

function parseAmount(text: string): number | null {
  const withoutDates = text
    .replace(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{4}\b/g, ' ');
  const matches = [...withoutDates.matchAll(/(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?/g)];
  const values = matches
    .map((match) => Number(`${match[1].replace(/,/g, '')}${match[2] ? `.${match[2]}` : ''}`))
    .filter((value) => value > 0 && value < 100000000 && (value < 1900 || value > 2099));
  if (!values.length) return null;
  return roundMoney(values[values.length - 1]);
}

function parseDate(text: string): { date: string | null; explicit: boolean; ambiguousKal: boolean } {
  if (/(?:^|\s)(today|aaj)(?:\s|$)|आज/i.test(text)) {
    return { date: toISODate(), explicit: true, ambiguousKal: false };
  }
  if (/\byesterday\b/i.test(text)) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return { date: toISODate(date), explicit: true, ambiguousKal: false };
  }
  const monthMatch = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
  if (monthMatch) {
    const month = MONTHS.indexOf(monthMatch[2].slice(0, 3).toLowerCase());
    const iso = fromParts(Number(monthMatch[1]), month, Number(monthMatch[3]));
    if (iso) return { date: iso, explicit: true, ambiguousKal: false };
  }
  const numeric = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (numeric) {
    const year = numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    const iso = fromParts(Number(numeric[1]), Number(numeric[2]) - 1, year);
    if (iso) return { date: iso, explicit: true, ambiguousKal: false };
  }
  if (/\bkal\b|काल/i.test(text)) {
    return { date: null, explicit: false, ambiguousKal: true };
  }
  return { date: null, explicit: false, ambiguousKal: false };
}

export function parseDuePhrase(raw: string): DueParse {
  const text = normalizePhrase(raw);
  const personName = parseName(text);
  const amount = parseAmount(text);
  const kind = parseKind(text);
  const date = parseDate(text);
  const questions: string[] = [];

  if (!personName) questions.push('Who is this person? The name was not clear.');
  if (amount == null) questions.push('How much money? Use digits, such as 500 or ५००.');
  if (!kind) questions.push('Was this money you gave, or money they returned? That was not clear.');
  if (date.ambiguousKal) questions.push('काल can mean yesterday or tomorrow. Choose the date.');
  else if (!date.explicit) questions.push('No date was spoken. Choose the date before saving.');

  return {
    personName,
    amount,
    date: date.date,
    dateExplicit: date.explicit,
    kind,
    questions,
    raw,
  };
}
