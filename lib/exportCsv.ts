import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { formatDisplayDate } from './format';
import type { Transaction } from './types';

function csvEscape(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function transactionsToCsv(transactions: Transaction[]): string {
  const header = ['Date', 'Type', 'Amount', 'Merchant', 'Category', 'Notes', 'Source'];
  const rows = transactions.map((tx) =>
    [
      formatDisplayDate(tx.date),
      tx.type,
      tx.amount.toFixed(2),
      tx.merchant,
      tx.category,
      tx.notes,
      tx.source,
    ].map(csvEscape).join(','),
  );
  return [header.join(','), ...rows].join('\n');
}

export async function shareTransactionsCsv(transactions: Transaction[]): Promise<void> {
  const csv = transactionsToCsv(transactions);
  const file = new File(Paths.cache, `expense-tracker-${Date.now()}.csv`);
  if (file.exists) {
    file.delete();
  }
  file.create();
  await file.write(csv);

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export transactions',
    UTI: 'public.comma-separated-values-text',
  });
}
