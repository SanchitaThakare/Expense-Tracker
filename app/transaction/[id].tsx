import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { CategoryFilter } from '@/components/ui/CategoryFilter';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Body, Heading } from '@/components/ui/Typography';
import { useFinance } from '@/context/FinanceContext';
import { useAppTheme } from '@/context/ThemeContext';
import { categorizeTransaction } from '@/lib/categories';
import { formatDisplayDate, monthKey, toISODate } from '@/lib/format';
import { CATEGORIES, type Category, type TransactionType } from '@/lib/types';

export default function TransactionFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { addTransaction, saveTransaction, removeTransaction, findTransaction, setMonth } = useFinance();

  const [type, setType] = useState<TransactionType>('debit');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState<Category>('Other');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(toISODate());
  const [showPicker, setShowPicker] = useState(false);
  const [categoryLocked, setCategoryLocked] = useState(false);
  const [source, setSource] = useState<'manual' | 'sms_sample' | 'sms_paste'>('manual');
  const [rawMessage, setRawMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: isNew ? 'Add transaction' : 'Edit transaction' });
  }, [isNew, navigation]);

  useEffect(() => {
    if (isNew) return;
    findTransaction(Number(id)).then((tx) => {
      if (!tx) {
        Alert.alert('Not found', 'This transaction is no longer available.');
        router.back();
        return;
      }
      setType(tx.type);
      setAmount(String(tx.amount));
      setMerchant(tx.merchant);
      setCategory(tx.category);
      setNotes(tx.notes);
      setDate(tx.date);
      setCategoryLocked(tx.categoryLocked);
      setSource(tx.source);
      setRawMessage(tx.rawMessage);
      setLoaded(true);
    });
  }, [findTransaction, id, isNew, router]);

  const suggested = useMemo(() => {
    if (!merchant.trim()) return null;
    return categorizeTransaction(merchant, type);
  }, [merchant, type]);

  function onDateChange(_event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selected) setDate(toISODate(selected));
  }

  async function onSave() {
    if (saving) return;
    const value = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Amount required', 'Enter a valid amount greater than 0.');
      return;
    }
    if (!merchant.trim()) {
      Alert.alert('Merchant required', 'Add a merchant or description.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Date required', 'Choose a valid date.');
      return;
    }
    if (!CATEGORIES.includes(category)) {
      Alert.alert('Category required', 'Choose a category before saving.');
      return;
    }

    const draft = {
      type,
      amount: value,
      date,
      merchant: merchant.trim(),
      category,
      notes: notes.trim(),
      source,
      rawMessage,
      categoryLocked,
    };

    setSaving(true);
    try {
      if (isNew) {
        await addTransaction(draft);
      } else {
        await saveTransaction(Number(id), draft);
      }
      setMonth(monthKey(date));
      router.back();
    } catch (error) {
      setSaving(false);
      Alert.alert('Not saved', error instanceof Error ? error.message : 'Could not save this transaction.');
    }
  }

  function onDelete() {
    Alert.alert('Delete transaction?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeTransaction(Number(id));
          router.back();
        },
      },
    ]);
  }

  if (!loaded) {
    return <Screen><Body>Loading…</Body></Screen>;
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets>
          <SegmentedControl
            value={type}
            onChange={setType}
            options={[
              { label: 'Debit', value: 'debit' },
              { label: 'Credit', value: 'credit' },
            ]}
          />

          <Field label="Amount">
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
          </Field>

          <Field label="Merchant">
            <TextInput
              value={merchant}
              onChangeText={(value) => {
                setMerchant(value);
                if (!categoryLocked) {
                  const next = categorizeTransaction(value, type);
                  setCategory(next.category);
                }
              }}
              placeholder="Swiggy, Amazon, Salary…"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
          </Field>

          <Field label="Date">
            <Pressable
              onPress={() => setShowPicker(true)}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' }]}>
              <Body>{formatDisplayDate(date)}</Body>
            </Pressable>
            {showPicker ? (
              <DateTimePicker
                value={new Date(`${date}T12:00:00`)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateChange}
              />
            ) : null}
          </Field>

          <Field label="Category">
            <CategoryFilter
              layout="wrap"
              value={category}
              onChange={(item) => {
                if (item === 'all') return;
                setCategory(item);
                setCategoryLocked(true);
              }}
            />
            {suggested && suggested.category !== category ? (
              <Pressable
                onPress={() => {
                  setCategory(suggested.category);
                  setCategoryLocked(false);
                }}>
                <Body style={{ color: colors.tint, marginTop: 8 }}>
                  Use suggested: {suggested.category}
                </Body>
              </Pressable>
            ) : null}
          </Field>

          <Field label="Notes">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[
                styles.input,
                styles.notes,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            />
          </Field>

          {rawMessage ? (
            <Field label="Original message">
              <Body>{rawMessage}</Body>
            </Field>
          ) : null}

          <Pressable onPress={onSave} disabled={saving} style={[styles.save, { backgroundColor: saving ? colors.surfaceMuted : colors.tint }]}>
            <Heading style={{ color: '#fff' }}>{isNew ? 'Save transaction' : 'Update transaction'}</Heading>
          </Pressable>
          {!isNew ? (
            <Pressable onPress={onDelete} style={styles.delete}>
              <Body style={{ color: colors.debit, fontWeight: '700' }}>Delete</Body>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Heading>{label}</Heading>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 40 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 16,
  },
  notes: { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 },
  save: { alignItems: 'center', borderRadius: 16, minHeight: 48, justifyContent: 'center' },
  delete: { alignItems: 'center', paddingVertical: 8 },
});
