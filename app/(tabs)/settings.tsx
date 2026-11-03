import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Body, Heading, Muted, Title } from '@/components/ui/Typography';
import { useDues } from '@/context/DuesContext';
import { useFinance } from '@/context/FinanceContext';
import { useAppTheme } from '@/context/ThemeContext';
import { shareTransactionsCsv } from '@/lib/exportCsv';
import { formatINR, toISODate } from '@/lib/format';
import { CATEGORIES } from '@/lib/types';

export default function SettingsScreen() {
  const { colors, scheme, setPreference } = useAppTheme();
  const finance = useFinance();
  const dues = useDues();
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');

  async function exportAll() {
    const rows = await finance.searchTransactions();
    if (!rows.length) {
      Alert.alert('Nothing to export', 'There are no saved expenses or income records.');
      return;
    }
    await shareTransactionsCsv(rows);
  }

  function erase() {
    Alert.alert('Delete all local finance data?', 'Transactions, dues, budgets, goals, and reminders on this phone will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await finance.eraseAll();
          await dues.refresh();
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>Settings</Title>
        <Card>
          <Heading>Appearance</Heading>
          <Pressable onPress={() => setPreference(scheme === 'dark' ? 'light' : 'dark')} style={{ marginTop: 8 }}>
            <Body style={{ color: colors.tint, fontWeight: '800' }}>Use {scheme === 'dark' ? 'light' : 'dark'} theme</Body>
          </Pressable>
        </Card>
        <Card>
          <Heading>More tools</Heading>
          <Link href="/budgets" style={{ marginTop: 8 }}>
            <Body style={{ color: colors.tint, fontWeight: '700' }}>Monthly budgets</Body>
          </Link>
          <Link href="/inbox" style={{ marginTop: 8 }}>
            <Body style={{ color: colors.tint, fontWeight: '700' }}>SMS lab</Body>
          </Link>
          <Muted style={{ marginTop: 8 }}>
            SMS parsing stays on this phone. The real inbox is not read, and messages are not sent to an AI service.
          </Muted>
        </Card>
        <Card>
          <Heading>Savings goals</Heading>
          {finance.goals.map((goal) => (
            <View key={goal.id} style={styles.line}>
              <Body style={{ flex: 1 }}>{goal.name}</Body>
              <Muted>{formatINR(goal.saved, true)} / {formatINR(goal.target, true)}</Muted>
              <Pressable onPress={() => finance.progressGoal(goal.id, 100)}><Body style={{ color: colors.tint }}> +100</Body></Pressable>
            </View>
          ))}
          <TextInput value={goalName} onChangeText={setGoalName} placeholder="Goal name" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
          <TextInput value={goalTarget} onChangeText={setGoalTarget} keyboardType="decimal-pad" placeholder="Target" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
          <Pressable
            onPress={() => {
              const target = Number(goalTarget);
              if (!goalName.trim() || target <= 0) return;
              finance.addGoal(goalName, target);
              setGoalName('');
              setGoalTarget('');
            }}>
            <Body style={{ color: colors.tint, fontWeight: '800' }}>Add goal</Body>
          </Pressable>
        </Card>
        <Card>
          <Heading>Recurring bills</Heading>
          {finance.bills.map((bill) => (
            <View key={bill.id} style={styles.line}>
              <Body style={{ flex: 1 }}>{bill.name}</Body>
              <Muted>{formatINR(bill.amount, true)} · {bill.nextDate}</Muted>
              <Pressable onPress={() => finance.removeBill(bill.id)}><Body style={{ color: colors.debit }}> Remove</Body></Pressable>
            </View>
          ))}
          <TextInput value={billName} onChangeText={setBillName} placeholder="Bill name" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
          <TextInput value={billAmount} onChangeText={setBillAmount} keyboardType="decimal-pad" placeholder="Amount" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
          <Pressable
            onPress={() => {
              const amount = Number(billAmount);
              if (!billName.trim() || amount <= 0) return;
              finance.addBill({ name: billName, amount, nextDate: toISODate(), category: CATEGORIES[4] });
              setBillName('');
              setBillAmount('');
            }}>
            <Body style={{ color: colors.tint, fontWeight: '800' }}>Add bill due today</Body>
          </Pressable>
        </Card>
        <Card>
          <Heading>Your data</Heading>
          <Pressable onPress={exportAll} style={{ marginTop: 8 }}>
            <Body style={{ color: colors.tint, fontWeight: '800' }}>Export transactions CSV</Body>
          </Pressable>
          <Pressable onPress={erase} style={{ marginTop: 12 }}>
            <Body style={{ color: colors.debit, fontWeight: '800' }}>Delete all local data</Body>
          </Pressable>
          <Muted style={{ marginTop: 12 }}>
            Records stay on this device. There is no cloud AI key in the app. A hosted assistant, real SMS inbox access, PDF reports, and bank connections are not included.
          </Muted>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 32 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 12, marginVertical: 8 },
});
