import { categorizeTransaction } from './categories';
import type { DueEntry, DueKind } from './dues';
import { personKey, summarizeDues } from './dues';
import { parseDuePhrase } from './duesParser';
import { addDays, endOfMonth, startOfMonth, toISODate } from './format';
import type { Category } from './types';

export type CashRecord = {
  id: number;
  type: 'debit' | 'credit';
  amount: number;
  date: string;
  merchant: string;
  category: string;
  notes: string;
};

export type AssistantContext = {
  today: string;
  month: string;
  transactions: CashRecord[];
  dues: DueEntry[];
};

export type AssistantRecord =
  | 'expense'
  | 'income'
  | 'lent'
  | 'borrowed'
  | 'repayment'
  | 'settled'
  | 'reminder';

export type AssistantPreview = {
  record: AssistantRecord;
  person: string | null;
  amount: number | null;
  date: string | null;
  dateExplicit: boolean;
  category: Category | null;
  note: string;
  reminderDate: string | null;
  explanation: string;
};

export type AssistantMatch = { title: string; subtitle: string };

export type AssistantReply = {
  kind: 'answer' | 'preview' | 'clarify';
  message: string;
  questions: string[];
  preview: AssistantPreview | null;
  matches: AssistantMatch[];
};

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

function normalize(raw: string): string {
  return raw
    .replace(/[०-९]/g, (digit) => String(DEVANAGARI_DIGITS.indexOf(digit)))
    .replace(/₹/g, ' rs ')
    .replace(/\s+/g, ' ')
    .trim();
}

function money(value: string): number {
  return Number(value.replace(/,/g, ''));
}

function inMonth(date: string, month: string): boolean {
  return date >= startOfMonth(month) && date <= endOfMonth(month);
}

function none(message: string): AssistantReply {
  return { kind: 'answer', message, questions: [], preview: null, matches: [] };
}

function answer(message: string, matches: AssistantMatch[]): AssistantReply {
  return { kind: 'answer', message, questions: [], preview: null, matches };
}

function previewReply(preview: AssistantPreview, questions: string[]): AssistantReply {
  return {
    kind: questions.length ? 'clarify' : 'preview',
    message: preview.explanation,
    questions,
    preview,
    matches: [],
  };
}

function queryLent(text: string, ctx: AssistantContext): AssistantReply | null {
  const match = text.match(/how much did i lend to\s+([\p{L}][\p{L}'.-]{1,40})/iu);
  if (!match) return null;
  const name = match[1];
  const key = personKey(name);
  const rows = ctx.dues.filter(
    (entry) => entry.personKey === key && entry.kind === 'lent' && inMonth(entry.date, ctx.month),
  );
  if (!rows.length) {
    return none(`I don't have a saved loan to ${name} in ${ctx.month}.`);
  }
  const total = rows.reduce((sum, entry) => sum + entry.amount, 0);
  return answer(
    `You lent ${name} ${total} in ${ctx.month}. This is not counted as an expense.`,
    rows.map((entry) => ({ title: `Lent ${entry.amount}`, subtitle: entry.date })),
  );
}

function queryPayments(text: string, ctx: AssistantContext): AssistantReply | null {
  const match = text.match(/show all payments i made to\s+([\p{L}][\p{L}'.-]{1,40})/iu);
  if (!match) return null;
  const name = match[1].replace(/[.?!,]+$/g, '');
  const key = personKey(name);
  const spent = ctx.transactions.filter(
    (item) => item.type === 'debit' && item.merchant.toLowerCase().includes(name.toLowerCase()),
  );
  const lent = ctx.dues.filter((entry) => entry.personKey === key && entry.kind === 'lent');
  if (!spent.length && !lent.length) {
    return none(`I don't have a saved payment or loan to ${name}.`);
  }
  return answer(`Saved records for ${name}. Expenses and loans are listed separately.`, [
    ...spent.map((item) => ({ title: `Expense ${item.amount} · ${item.category}`, subtitle: item.date })),
    ...lent.map((item) => ({ title: `Loan ${item.amount}`, subtitle: item.date })),
  ]);
}

function queryOutstanding(text: string, ctx: AssistantContext): AssistantReply | null {
  if (!/how much money do i need to collect|how much do i (?:still )?need to collect|money to collect/i.test(text)) {
    return null;
  }
  const people = summarizeDues(ctx.dues).people.filter((person) => person.outstanding > 0);
  if (!people.length) {
    return none("I don't have a saved amount left to collect.");
  }
  const total = people.reduce((sum, person) => sum + person.outstanding, 0);
  return answer(
    `You still need to collect ${total} from saved credit records. This is not income.`,
    people.map((person) => ({ title: person.personName, subtitle: `Outstanding ${person.outstanding}` })),
  );
}

function queryBill(text: string, ctx: AssistantContext): AssistantReply | null {
  const match = text.match(/did i pay (?:the )?(.+?)(?: bill)? this month\??$/iu);
  if (!match) return null;
  const subject = match[1].replace(/\bbill\b/gi, '').trim().toLowerCase();
  if (!subject || subject === 'how much') return null;
  const rows = ctx.transactions.filter(
    (item) =>
      item.type === 'debit' &&
      inMonth(item.date, ctx.month) &&
      `${item.merchant} ${item.category} ${item.notes}`.toLowerCase().includes(subject),
  );
  if (!rows.length) return none(`I don't have a saved ${subject} payment in ${ctx.month}.`);
  return answer(`Yes. I found ${rows.length} saved ${subject} payment${rows.length === 1 ? '' : 's'} in ${ctx.month}.`, rows.map((item) => ({
    title: `${item.merchant} · ${item.amount}`,
    subtitle: `${item.date} · ${item.category}`,
  })));
}

function reminder(text: string, ctx: AssistantContext): AssistantReply | null {
  const match = text.match(/remind me to collect\s+(?:rs\.?\s*)?([0-9,]+(?:\.\d{1,2})?)\s+from\s+([\p{L}][\p{L}'.-]{1,40})\s+(tomorrow|today)/iu);
  if (!match) return null;
  const amount = money(match[1]);
  const person = match[2].charAt(0).toUpperCase() + match[2].slice(1);
  const when = match[3].toLowerCase() === 'tomorrow' ? addDays(ctx.today, 1) : ctx.today;
  const owed = summarizeDues(ctx.dues).people.find((item) => item.personKey === personKey(person));
  const explanation = owed && owed.outstanding > 0
    ? `Set a reminder to collect from ${person} on ${when}. This does not create a new transaction.`
    : `${person} has no outstanding balance. Confirming will record ${amount} as money ${person} owes you and remind you on ${when}.`;
  return previewReply(
    {
      record: owed && owed.outstanding > 0 ? 'reminder' : 'lent',
      person,
      amount,
      date: ctx.today,
      dateExplicit: true,
      category: null,
      note: 'Collection reminder',
      reminderDate: when,
      explanation,
    },
    [],
  );
}

function collectPhrase(text: string): AssistantReply | null {
  if (!/ghayche|घ्यायचे|कडून|\bkadun\b/i.test(text)) return null;
  const parsed = parseDuePhrase(text);
  const amountMatch = text.match(/([0-9][0-9,]*(?:\.\d{1,2})?)/);
  const person = parsed.personName ?? text.match(/^([\p{L}]+)\s+kadun/iu)?.[1] ?? null;
  const amount = parsed.amount ?? (amountMatch ? money(amountMatch[1]) : null);
  const questions: string[] = [];
  if (!person) questions.push('Who should you collect this from?');
  if (amount == null) questions.push('How much should you collect?');
  return previewReply(
    {
      record: 'lent',
      person,
      amount,
      date: parsed.date,
      dateExplicit: parsed.dateExplicit,
      category: null,
      note: text,
      reminderDate: null,
      explanation: 'This sounds like money to collect, not income or an expense. Confirm to record it as money lent.',
    },
    questions,
  );
}

function fromDue(text: string, ctx: AssistantContext): AssistantReply | null {
  const parsed = parseDuePhrase(text);
  if (!parsed.kind) return null;
  const questions = parsed.questions.filter((question) => !/date/i.test(question));
  if (!parsed.dateExplicit) questions.push('Choose the date before saving.');
  return previewReply(
    {
      record: parsed.kind,
      person: parsed.personName,
      amount: parsed.amount,
      date: parsed.date ?? ctx.today,
      dateExplicit: parsed.dateExplicit,
      category: null,
      note: text,
      reminderDate: null,
      explanation: explanationFor(parsed.kind),
    },
    questions,
  );
}

function explanationFor(kind: DueKind): string {
  if (kind === 'lent') return 'This will be saved as money you lent. It will not be counted as an expense.';
  if (kind === 'borrowed') return 'This will be saved as money you borrowed. It will not be counted as income.';
  if (kind === 'repayment') return 'This will reduce what this person owes you. It will not be counted as income.';
  return 'This will reduce what you owe this person. It will not be counted as an expense.';
}

function paidPhrase(text: string, ctx: AssistantContext): AssistantReply | null {
  if (/paid me back|borrowed|wapas|parat/i.test(text)) return null;
  const match = text.match(/(?:i\s+)?paid\s+([\p{L}][\p{L} ]{0,40}?)\s+(?:rs\.?\s*)?([0-9,]+(?:\.\d{1,2})?)(?:\s+(?:rupees|rupaye))?(?:\s+for\s+(.+))?/iu);
  if (!match) return null;
  const person = match[1].trim();
  const amount = money(match[2]);
  const reason = match[3]?.trim() ?? '';
  const category = categorizeTransaction(`${person} ${reason}`, 'debit');
  const explicit = /\b(today|yesterday|aaj)\b|आज/i.test(text);
  let date = ctx.today;
  if (/\byesterday\b/i.test(text)) date = addDays(ctx.today, -1);
  return previewReply(
    {
      record: 'expense',
      person,
      amount,
      date,
      dateExplicit: explicit,
      category: category.category,
      note: reason,
      reminderDate: null,
      explanation: `This will be saved as an expense${reason ? ` for ${reason}` : ''}, not as a loan.`,
    },
    explicit ? [] : ['No date was spoken. Choose the date before saving.'],
  );
}

export function interpret(raw: string, ctx: AssistantContext): AssistantReply {
  const text = normalize(raw);
  if (!text) {
    return { kind: 'clarify', message: 'Type or speak a finance command.', questions: [], preview: null, matches: [] };
  }
  return (
    queryLent(text, ctx) ??
    queryPayments(text, ctx) ??
    queryBill(text, ctx) ??
    queryOutstanding(text, ctx) ??
    reminder(text, ctx) ??
    collectPhrase(text) ??
    fromDue(text, ctx) ??
    paidPhrase(text, ctx) ?? {
      kind: 'clarify',
      message: 'I could not tell whether this is an expense, a loan, or a question about saved records.',
      questions: ['Say who it was, the amount, and whether you paid, lent, borrowed, or want a lookup.'],
      preview: null,
      matches: [],
    }
  );
}

export function isShortFollowUp(raw: string): boolean {
  const text = raw.trim();
  if (!text || text.length > 40) return false;
  if (/^[0-9,]+(?:\.\d{1,2})?$/.test(text)) return true;
  if (/^(today|aaj|आज)$/i.test(text)) return true;
  return /^[\p{L}][\p{L}'.-]{1,40}$/u.test(text);
}

export function applyFollowUp(preview: AssistantPreview, raw: string, today = toISODate()): AssistantReply {
  const text = normalize(raw);
  const next = { ...preview };
  const amount = text.match(/^[0-9,]+(?:\.\d{1,2})?$/)?.[0];
  if (!next.amount && amount) next.amount = money(amount);
  if (!next.person && /^[\p{L}][\p{L} .'-]{1,40}$/u.test(text)) {
    next.person = text.charAt(0).toUpperCase() + text.slice(1);
  }
  if (!next.dateExplicit && /\b(today|aaj)\b|आज/i.test(text)) {
    next.date = today;
    next.dateExplicit = true;
  }
  const questions: string[] = [];
  if (!next.person && next.record !== 'expense') questions.push('Who is this person?');
  if (next.record === 'expense' && !next.person) questions.push('Who did you pay?');
  if (next.amount == null) questions.push('What is the amount?');
  if (!next.dateExplicit) questions.push('Choose the date before saving.');
  return previewReply(next, questions);
}

export function previewReady(preview: AssistantPreview): boolean {
  if (!preview.person || preview.amount == null || preview.amount <= 0 || !preview.dateExplicit || !preview.date) {
    return false;
  }
  return true;
}
