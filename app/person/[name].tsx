import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { DueTotalsRow } from '@/components/ui/DueTotals';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Body, Heading, Muted } from '@/components/ui/Typography';
import { useDues } from '@/context/DuesContext';
import { useAppTheme } from '@/context/ThemeContext';
import { getPersonNotes, savePersonNotes } from '@/lib/database';
import { formatDisplayDate, formatINR, toISODate } from '@/lib/format';

export default function PersonDuesScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const key = typeof name === 'string' ? name : '';
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { totals, removeDue, saveReminder } = useDues();
  const person = totals.people.find((item) => item.personKey === key);
  const [showPicker, setShowPicker] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: person?.personName ?? 'Person' });
  }, [navigation, person?.personName]);

  useEffect(() => {
    if (!key) return;
    getPersonNotes(key).then(setNotes);
  }, [key]);

  function onReminderChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'dismissed' || !selected || !person) return;
    saveReminder(person.personKey, toISODate(selected));
  }

  function onDelete(id: number) {
    Alert.alert('Remove this entry?', 'The outstanding amount will be recalculated.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeDue(id) },
    ]);
  }

  if (!person) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <EmptyState title="No history" message="This person has no saved dues." />
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <DueTotalsRow lent={person.lent} repaid={person.repaid} outstanding={person.outstanding} />
        </Card>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push({ pathname: '/due-entry', params: { person: person.personName, kind: 'lent' } })}
            style={[styles.action, { backgroundColor: colors.tint }]}>
            <Body style={styles.actionText}>Gave more</Body>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/due-entry', params: { person: person.personName, kind: 'repayment' } })
            }
            style={[styles.action, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
            <Body style={{ fontWeight: '800' }}>Returned</Body>
          </Pressable>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push({ pathname: '/due-entry', params: { person: person.personName, kind: 'borrowed' } })}
            style={[styles.action, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
            <Body style={{ fontWeight: '800' }}>I borrowed</Body>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/due-entry', params: { person: person.personName, kind: 'settled' } })}
            style={[styles.action, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
            <Body style={{ fontWeight: '800' }}>I repaid</Body>
          </Pressable>
        </View>
        <Card>
          <Heading>Notes</Heading>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional note about this person"
            placeholderTextColor={colors.textMuted}
            style={[styles.notes, { color: colors.text, borderColor: colors.border }]}
          />
          <Pressable onPress={() => savePersonNotes(person.personKey, person.personName, notes)}>
            <Body style={{ color: colors.tint, fontWeight: '800' }}>Save note</Body>
          </Pressable>
        </Card>

        <Card>
          <Heading>Reminder</Heading>
          <Muted style={{ marginTop: 6 }}>
            {person.reminderDate
              ? `Saved for ${formatDisplayDate(person.reminderDate)}. This stays on the phone.`
              : 'Optional. Pick a date to remember an outstanding amount.'}
          </Muted>
          <View style={styles.reminderRow}>
            <Pressable onPress={() => setShowPicker(true)}>
              <Body style={{ color: colors.tint, fontWeight: '800' }}>
                {person.reminderDate ? 'Change date' : 'Add reminder'}
              </Body>
            </Pressable>
            {person.reminderDate ? (
              <Pressable onPress={() => saveReminder(person.personKey, null)}>
                <Body style={{ color: colors.debit }}>Clear</Body>
              </Pressable>
            ) : null}
          </View>
          {showPicker ? (
            <DateTimePicker
              value={person.reminderDate ? new Date(`${person.reminderDate}T12:00:00`) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onReminderChange}
            />
          ) : null}
        </Card>

        <Heading>History</Heading>
        {person.entries.map((entry) => (
          <Card key={entry.id}>
            <View style={styles.personRow}>
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '800' }}>
                  {entry.kind === 'lent' ? 'Given' : entry.kind === 'borrowed' ? 'Borrowed' : entry.kind === 'settled' ? 'Repaid by you' : 'Returned'}
                </Body>
                <Muted>{formatDisplayDate(entry.date)}</Muted>
                {entry.note ? <Muted style={{ marginTop: 4 }}>{entry.note}</Muted> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <Body style={{ color: entry.kind === 'lent' ? colors.debit : colors.credit, fontWeight: '800' }}>
                  {formatINR(entry.amount)}
                </Body>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit this credit entry"
                  onPress={() => router.push({ pathname: '/due-entry', params: { id: String(entry.id) } })}>
                  <Muted style={{ color: colors.tint, fontWeight: '700' }}>Edit</Muted>
                </Pressable>
                <Pressable onPress={() => onDelete(entry.id)}>
                  <Muted style={{ color: colors.debit }}>Remove</Muted>
                </Pressable>
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 32 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 12 },
  actionText: { color: '#fff', fontWeight: '800' },
  reminderRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  personRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  notes: { borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 12, marginVertical: 8 },
});
