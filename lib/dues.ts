export type DueKind = 'lent' | 'repayment' | 'borrowed' | 'settled';

export type DueEntry = {
  id: number;
  personName: string;
  personKey: string;
  kind: DueKind;
  amount: number;
  date: string;
  note: string;
  reminderDate: string | null;
  rawPhrase: string | null;
  createdAt: string;
};

export type DueDraft = {
  personName: string;
  kind: DueKind;
  amount: number;
  date: string;
  note?: string;
  reminderDate?: string | null;
  rawPhrase?: string | null;
};

export type PersonDues = {
  personKey: string;
  personName: string;
  lent: number;
  repaid: number;
  borrowed: number;
  settled: number;
  /** Money this person still owes you. */
  outstanding: number;
  /** Money you still owe this person. */
  iOwe: number;
  reminderDate: string | null;
  entries: DueEntry[];
};

export type DueTotals = {
  lent: number;
  repaid: number;
  borrowed: number;
  settled: number;
  outstanding: number;
  iOwe: number;
  people: PersonDues[];
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function personKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN');
}

export function summarizeDues(entries: DueEntry[]): DueTotals {
  const groups = new Map<string, PersonDues>();

  for (const entry of entries) {
    let group = groups.get(entry.personKey);
    if (!group) {
      group = {
        personKey: entry.personKey,
        personName: entry.personName,
        lent: 0,
        repaid: 0,
        borrowed: 0,
        settled: 0,
        outstanding: 0,
        iOwe: 0,
        reminderDate: null,
        entries: [],
      };
      groups.set(entry.personKey, group);
    }
    group.entries.push(entry);
    if (entry.kind === 'lent') group.lent = roundMoney(group.lent + entry.amount);
    if (entry.kind === 'repayment') group.repaid = roundMoney(group.repaid + entry.amount);
    if (entry.kind === 'borrowed') group.borrowed = roundMoney(group.borrowed + entry.amount);
    if (entry.kind === 'settled') group.settled = roundMoney(group.settled + entry.amount);
  }

  const people = [...groups.values()]
    .map((group) => {
      group.entries.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      group.personName = group.entries[0]?.personName ?? group.personName;
      const reminder = group.entries.find((entry) => entry.reminderDate);
      group.reminderDate = reminder?.reminderDate ?? null;
      group.outstanding = roundMoney(group.lent - group.repaid);
      group.iOwe = roundMoney(group.borrowed - group.settled);
      return group;
    })
    .sort((a, b) => b.outstanding - a.outstanding || a.personName.localeCompare(b.personName));

  const lent = roundMoney(people.reduce((sum, person) => sum + person.lent, 0));
  const repaid = roundMoney(people.reduce((sum, person) => sum + person.repaid, 0));
  const borrowed = roundMoney(people.reduce((sum, person) => sum + person.borrowed, 0));
  const settled = roundMoney(people.reduce((sum, person) => sum + person.settled, 0));

  return {
    lent,
    repaid,
    borrowed,
    settled,
    outstanding: roundMoney(lent - repaid),
    iOwe: roundMoney(borrowed - settled),
    people,
  };
}

export function outstandingFor(entries: DueEntry[], name: string): number {
  const key = personKey(name);
  return summarizeDues(entries).people.find((person) => person.personKey === key)?.outstanding ?? 0;
}

export function repaymentFits(outstanding: number, amount: number): boolean {
  return roundMoney(amount) > 0 && roundMoney(amount) <= roundMoney(outstanding);
}

export function iOweFor(entries: DueEntry[], name: string): number {
  const key = personKey(name);
  return summarizeDues(entries).people.find((person) => person.personKey === key)?.iOwe ?? 0;
}
