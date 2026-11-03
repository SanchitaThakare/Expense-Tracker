import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Body, Heading, Muted, Title } from '@/components/ui/Typography';
import { useFinance } from '@/context/FinanceContext';
import { useAppTheme } from '@/context/ThemeContext';
import { categorizeTransaction } from '@/lib/categories';
import { formatINR, monthKey, toISODate } from '@/lib/format';
import { SAMPLE_MESSAGES } from '@/lib/sampleMessages';
import { isDuplicateSms, parseSms } from '@/lib/smsParser';

export default function InboxScreen() {
  const { colors } = useAppTheme();
  const { addTransaction, searchTransactions, setMonth } = useFinance();
  const [paste, setPaste] = useState('');
  const [selectedId, setSelectedId] = useState(SAMPLE_MESSAGES[0]?.id);

  const selected = SAMPLE_MESSAGES.find((item) => item.id === selectedId) ?? SAMPLE_MESSAGES[0];
  const parsedSample = useMemo(() => parseSms(selected.body), [selected.body]);
  const parsedPaste = useMemo(() => (paste.trim() ? parseSms(paste) : null), [paste]);

  async function importParsed(
    raw: string,
    source: 'sms_sample' | 'sms_paste',
  ) {
    const parsed = parseSms(raw);
    if (!parsed.amount || !parsed.type) {
      Alert.alert('Could not parse', 'Amount or debit/credit type was not found.');
      return;
    }
    if (parsed.blockedReason) {
      Alert.alert('Not saved', parsed.blockedReason);
      return;
    }
    if (!parsed.date) {
      Alert.alert('Date missing', 'Choose a manual transaction if the message has no date.');
      return;
    }
    const merchant = parsed.merchant ?? 'Unknown merchant';
    const existing = await searchTransactions();
    if (isDuplicateSms(parsed, existing)) {
      Alert.alert('Possible duplicate', 'A saved transaction already matches this message. It was not imported again.');
      return;
    }
    const { category, auto } = categorizeTransaction(merchant, parsed.type);
    try {
    await addTransaction({
      type: parsed.type,
      amount: parsed.amount,
      date: parsed.date ?? toISODate(),
      merchant,
      category,
      notes: auto ? 'Auto-categorized from SMS parser' : 'Needs category review',
      source,
      rawMessage: raw,
      categoryLocked: !auto,
    });
    setMonth(monthKey(parsed.date ?? toISODate()));
    Alert.alert('Saved locally', `${merchant} · ${formatINR(parsed.amount)} was added on this device.`);
    } catch (error) {
      Alert.alert('Not saved', error instanceof Error ? error.message : 'Could not save this message.');
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>SMS Lab</Title>
        <Body>
          Test the Indian bank SMS parser with sample messages. Real inbox access is not requested.
          Paste a message only if you chose to share it.
        </Body>

        <Card>
          <Heading>Sample banks</Heading>
          <View style={styles.bankRow}>
            {SAMPLE_MESSAGES.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setSelectedId(item.id)}
                style={[
                  styles.bank,
                  {
                    backgroundColor: selectedId === item.id ? colors.tintMuted : colors.surfaceMuted,
                    borderColor: selectedId === item.id ? colors.tint : colors.border,
                  },
                ]}>
                <Muted style={{ color: selectedId === item.id ? colors.tint : colors.textMuted, fontWeight: '700' }}>
                  {item.bank}
                </Muted>
              </Pressable>
            ))}
          </View>
          <Muted style={{ marginTop: 12 }}>{selected.body}</Muted>
          <ParsePreview
            amount={parsedSample.amount}
            type={parsedSample.type}
            date={parsedSample.date}
            merchant={parsedSample.merchant}
            account={parsedSample.accountMasked}
            reference={parsedSample.reference}
            blocked={parsedSample.blockedReason}
            confidence={parsedSample.confidence}
          />
          <Pressable
            onPress={() => importParsed(selected.body, 'sms_sample')}
            style={[styles.cta, { backgroundColor: colors.tint }]}>
            <Body style={{ color: '#fff', fontWeight: '800' }}>Import this sample</Body>
          </Pressable>
        </Card>

        <Card>
          <Heading>Paste a message</Heading>
          <Muted style={{ marginBottom: 8 }}>
            Optional and local only. Do not paste real statements unless you intend to store them on this device.
          </Muted>
          <TextInput
            value={paste}
            onChangeText={setPaste}
            placeholder="Paste a transaction SMS…"
            placeholderTextColor={colors.textMuted}
            multiline
            style={[
              styles.paste,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
            ]}
          />
          {parsedPaste ? (
            <ParsePreview
              amount={parsedPaste.amount}
              type={parsedPaste.type}
              date={parsedPaste.date}
              merchant={parsedPaste.merchant}
              account={parsedPaste.accountMasked}
              reference={parsedPaste.reference}
              blocked={parsedPaste.blockedReason}
              confidence={parsedPaste.confidence}
            />
          ) : null}
          <Pressable
            onPress={() => importParsed(paste, 'sms_paste')}
            style={[styles.cta, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderWidth: 1 }]}>
            <Body style={{ fontWeight: '800' }}>Parse and save locally</Body>
          </Pressable>
        </Card>

        <Card>
          <Heading>Android SMS access</Heading>
          <Body style={{ marginTop: 8 }}>
            This build does not request READ_SMS or RECEIVE_SMS. On Android, reading the SMS inbox is a restricted permission. Play policy generally allows it only for the default SMS app, not expense trackers. Expo Go also cannot read the inbox.
          </Body>
          <Body style={{ marginTop: 8 }}>
            A future development build could add an explicit, user-consented import flow. Until then, use samples or paste. Financial data is stored in on-device SQLite and is not uploaded.
          </Body>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function ParsePreview({
  amount,
  type,
  date,
  merchant,
  account,
  reference,
  blocked,
  confidence,
}: {
  amount: number | null;
  type: string | null;
  date: string | null;
  merchant: string | null;
  account: string | null;
  reference: string | null;
  blocked: string | null;
  confidence: number;
}) {
  return (
    <View style={{ marginTop: 12, gap: 4 }}>
      <Body>Amount: {amount == null ? '—' : formatINR(amount)}</Body>
      <Body>Type: {type ?? '—'}</Body>
      <Body>Date: {date ?? '—'}</Body>
      <Body>Merchant: {merchant ?? '—'}</Body>
      <Body>Account: {account ?? '—'}</Body>
      <Body>Reference: {reference ?? '—'}</Body>
      {blocked ? <Body>{blocked}</Body> : null}
      <Muted>Confidence {(confidence * 100).toFixed(0)}%</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 32 },
  bankRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  bank: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  cta: { marginTop: 14, alignItems: 'center', borderRadius: 14, paddingVertical: 12 },
  paste: { minHeight: 110, borderWidth: 1, borderRadius: 14, padding: 12, textAlignVertical: 'top' },
});
