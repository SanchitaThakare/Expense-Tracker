import type { Category, TransactionType } from './types';

export const CATEGORY_COLORS: Record<Category, string> = {
  'Food & Dining': '#F97316',
  Groceries: '#84CC16',
  Transport: '#38BDF8',
  Shopping: '#A855F7',
  'Bills & Utilities': '#F59E0B',
  Entertainment: '#EC4899',
  Health: '#14B8A6',
  Travel: '#6366F1',
  Education: '#0EA5E9',
  Transfers: '#64748B',
  Income: '#22C55E',
  Other: '#94A3B8',
};

const RULES: { category: Category; keywords: string[] }[] = [
  { category: 'Food & Dining', keywords: ['swiggy', 'zomato', 'dominos', 'pizza', 'starbucks', 'cafe', 'restaurant', 'eats', 'dunzo'] },
  { category: 'Groceries', keywords: ['bigbasket', 'blinkit', 'zepto', 'dmart', 'jiomart', 'grofers', 'more supermarket', 'groceries'] },
  { category: 'Transport', keywords: ['uber', 'ola', 'rapido', 'irctc', 'metro', 'fastag', 'petrol', 'fuel', 'indian oil', 'hpcl', 'bpcl'] },
  { category: 'Shopping', keywords: ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa'] },
  { category: 'Bills & Utilities', keywords: ['jio', 'airtel', 'vi ', 'vodafone', 'bsnl', 'electricity', 'bescom', 'tata power', 'gas', 'broadband', 'recharge'] },
  { category: 'Entertainment', keywords: ['netflix', 'spotify', 'hotstar', 'sony liv', 'prime video', 'youtube', 'bookmyshow'] },
  { category: 'Health', keywords: ['pharmeasy', '1mg', 'apollo', 'pharmacy', 'hospital', 'clinic'] },
  { category: 'Travel', keywords: ['makemytrip', 'goibibo', 'airbnb', 'indigo', 'air india', 'hotel'] },
  { category: 'Education', keywords: ['udemy', 'coursera', 'byju', 'unacademy', 'school', 'college'] },
  { category: 'Transfers', keywords: ['imps', 'neft', 'rtgs', 'atm', 'transferred', 'self'] },
];

export function categorizeTransaction(
  merchant: string,
  type: TransactionType,
): { category: Category; auto: boolean } {
  if (type === 'credit') {
    const lower = merchant.toLowerCase();
    if (lower.includes('salary') || lower.includes('payroll')) {
      return { category: 'Income', auto: true };
    }
  }

  const haystack = merchant.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return { category: rule.category, auto: true };
    }
  }

  return { category: type === 'credit' ? 'Income' : 'Other', auto: type === 'credit' };
}
