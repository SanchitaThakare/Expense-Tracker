export type SampleMessage = {
  id: string;
  bank: string;
  body: string;
};

/**
 * Synthetic Indian bank SMS examples for parser testing only.
 * These are not real customer messages and contain no personal data.
 */
export const SAMPLE_MESSAGES: SampleMessage[] = [
  {
    id: 'hdfc-swiggy',
    bank: 'HDFC',
    body: 'HDFC Bank: INR 1,249.00 debited from A/c XX4521 on 12-OCT-26 to SWIGGY. UPI Ref 123456789012. Avl Bal INR 32,410.50',
  },
  {
    id: 'sbi-amazon',
    bank: 'SBI',
    body: 'Dear Customer, Rs.850.00 debited from your A/c X7890 on 15/10/26 at AMAZON PAY. Avl Bal Rs.18,220.00.',
  },
  {
    id: 'icici-salary',
    bank: 'ICICI',
    body: 'ICICI Bank Acct XX2190 is credited with Rs 75,000.00 on 01-Oct-26. Info: NEFT/SALARY ACME LABS. Avl Bal: Rs 1,12,340.00',
  },
  {
    id: 'axis-netflix',
    bank: 'Axis',
    body: 'INR 499.00 spent on AXIS BANK Card XX1001 at NETFLIX on 08-Oct-26. Avl Limit INR 1,20,000.00',
  },
  {
    id: 'yes-atm',
    bank: 'Yes Bank',
    body: 'Rs 2,340.00 withdrawn from A/c XX88 at ATM Bandra on 20-10-26. Avl Bal Rs 9,100.00',
  },
  {
    id: 'phonepe-jio',
    bank: 'PhonePe / HDFC',
    body: 'Rs 199.00 sent to JIO PREPAID via UPI from HDFC Bank A/c XX12 on 18-10-26. UPI: 987654321012',
  },
  {
    id: 'kotak-rent',
    bank: 'Kotak',
    body: 'INR 3,499.00 has been credited to your A/c XX5566 on 05-OCT-26 by UPI/RENT from RAHUL SHARMA.',
  },
  {
    id: 'pnb-bigbasket',
    bank: 'PNB',
    body: 'Your a/c XX3344 is debited INR 1,120.00 on 22-10-2026 towards UPI/BIGBASKET. Avl Bal INR 6,540.00',
  },
  {
    id: 'paytm-irctc',
    bank: 'Paytm',
    body: 'Paid Rs.67.50 to IRCTC at 09:41 on 11-Oct-26 from Paytm Wallet.',
  },
  {
    id: 'canara-imps',
    bank: 'Canara',
    body: 'INR 12,500.00 transferred from A/c XX0909 to A/c XX7766 on 03-Oct-26. Ref IMPS 112233445566',
  },
  {
    id: 'hdfc-uber',
    bank: 'HDFC',
    body: 'INR 342.80 debited from A/c XX4521 on 25-OCT-26 to UBER INDIA. Avl Bal INR 28,100.20',
  },
  {
    id: 'sbi-flipkart',
    bank: 'SBI',
    body: 'Rs.2,199.00 spent on SBI Card XX7788 at FLIPKART on 09-Oct-26. Avl Limit Rs.45,000.00',
  },
];
