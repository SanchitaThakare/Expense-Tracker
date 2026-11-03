import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Body, Heading, Title } from '@/components/ui/Typography';
import { useFinance } from '@/context/FinanceContext';
import { useAppTheme } from '@/context/ThemeContext';
import { CATEGORY_COLORS } from '@/lib/categories';
import { formatINR, monthLabel } from '@/lib/format';
import { CATEGORIES, type Category } from '@/lib/types';

export default function BudgetsScreen() {
  const { colors } = useAppTheme();
  const { month, budgets, summary, breakdown, saveBudget, removeBudget, alerts } = useFinance();
  const [category, setCategory] = useState<Category | 'Overall'>('Overall');
  const [amount, setAmount] = useState('');

  const spendMap = useMemo(() => {
    const map: Record<string, number> = { Overall: summary.expenses };
    for (const item of breakdown) map[item.category] = item.amount;
    return map;
  }, [breakdown, summary.expenses]);

  async function onSave() {
    const value = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Enter a budget', 'Amount must be greater than 0.');
      return;
    }
    await saveBudget(category, value);
    setAmount('');
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>Budgets</Title>
        <Body>{monthLabel(month)}</Body>

        {alerts.length ? (
          <Card>
            <Heading style={{ color: colors.warning }}>Alerts</Heading>
            {alerts.map((alert) => (
              <Body key={alert.category} style={{ marginTop: 6 }}>
                {alert.category} is at {Math.round(alert.percent)}% ({formatINR(alert.spent)} / {formatINR(alert.limit)})
              </Body>
            ))}
          </Card>
        ) : null}

        <Card>
          <Heading>Set a limit</Heading>
          <View style={styles.chips}>
            <Chip label="Overall" active={category === 'Overall'} onPress={() => setCategory('Overall')} />
            {CATEGORIES.filter((item) => item !== 'Income').map((item) => (
              <Chip key={item} label={item} active={category === item} onPress={() => setCategory(item)} />
            ))}
          </View>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="Budget amount"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
          />
          <Pressable onPress={onSave} style={[styles.save, { backgroundColor: colors.tint }]}>
            <Body style={{ color: '#fff', fontWeight: '800' }}>Save budget</Body>
          </Pressable>
        </Card>

        {budgets.length ? (
          budgets.map((budget) => {
            const spent = spendMap[budget.category] ?? 0;
            const percent = Math.min(100, (spent / budget.amount) * 100);
            const over = spent > budget.amount;
            const color =
              budget.category === 'Overall'
                ? colors.tint
                : CATEGORY_COLORS[budget.category as Category] ?? colors.tint;
            return (
              <Card key={budget.id}>
                <View style={styles.row}>
                  <Heading>{budget.category}</Heading>
                  <Pressable onPress={() => removeBudget(budget.id)}>
                    <Body style={{ color: colors.debit }}>Remove</Body>
                  </Pressable>
                </View>
                <Body style={{ marginTop: 4 }}>
                  {formatINR(spent)} of {formatINR(budget.amount)}
                </Body>
                <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${percent}%`,
                        backgroundColor: over ? colors.debit : color,
                      },
                    ]}
                  />
                </View>
              </Card>
            );
          })
        ) : (
          <EmptyState title="No budgets yet" message="Set an overall monthly cap and optional category limits. Alerts appear at 80% and 100%." />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 48, marginBottom: 12 },
  save: { alignItems: 'center', borderRadius: 14, paddingVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 10, borderRadius: 999, overflow: 'hidden', marginTop: 12 },
  fill: { height: '100%', borderRadius: 999 },
});
