import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Body, Heading, Muted } from '@/components/ui/Typography';
import { useDues } from '@/context/DuesContext';
import { useAppTheme } from '@/context/ThemeContext';
import { iOweFor, outstandingFor, repaymentFits, type DueKind } from '@/lib/dues';
import { parseDuePhrase } from '@/lib/duesParser';
import { formatDisplayDate, formatINR, toISODate } from '@/lib/format';
import { capturePhrase, stopListening, type SpeechLanguage } from '@/lib/speechCapture';

const LANGUAGES: { label: string; value: SpeechLanguage }[] = [
  { label: 'Marathi', value: 'mr-IN' },
  { label: 'Hindi', value: 'hi-IN' },
  { label: 'English', value: 'en-IN' },
];

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

const DUE_KINDS: DueKind[] = ['lent', 'repayment', 'borrowed', 'settled'];

export default function DueEntryScreen() {
  const params = useLocalSearchParams<{ person?: string; kind?: string; id?: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { entries, addDue, editDue } = useDues();
  const kindParam = firstParam(params.kind);
  const initialKind = DUE_KINDS.includes(kindParam as DueKind) ? (kindParam as DueKind) : null;
  const editingId = Number(firstParam(params.id));
  const editing = Number.isFinite(editingId) && editingId > 0 ? entries.find((entry) => entry.id === editingId) : undefined;

  const [language, setLanguage] = useState<SpeechLanguage>('mr-IN');
  const [phrase, setPhrase] = useState('');
  const [listening, setListening] = useState(false);
  const [speechNote, setSpeechNote] = useState(
    'Voice uses the phone speech service. It works in the Android development build, and it has not been verified on a device yet. Typing works now.',
  );
  const [person, setPerson] = useState(firstParam(params.person));
  const [hydrated, setHydrated] = useState(false);
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<DueKind | null>(initialKind);
  const [date, setDate] = useState(toISODate());
  const [dateConfirmed, setDateConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const [reminder, setReminder] = useState('');
  const [showDate, setShowDate] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [ambiguousKal, setAmbiguousKal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing || hydrated) return;
    setPerson(editing.personName);
    setAmount(String(editing.amount));
    setKind(editing.kind);
    setDate(editing.date);
    setDateConfirmed(true);
    setNote(editing.note);
    setReminder(editing.reminderDate ?? '');
    setPhrase(editing.rawPhrase ?? '');
    setHydrated(true);
  }, [editing, hydrated]);

  const amountValue = Number(amount.replace(/,/g, ''));
  const scopedEntries = editing ? entries.filter((entry) => entry.id !== editing.id) : entries;
  const owed = person.trim() ? outstandingFor(scopedEntries, person) : 0;
  const owedByMe = person.trim() ? iOweFor(scopedEntries, person) : 0;
  const limit = kind === 'settled' ? owedByMe : owed;
  const repaymentTooLarge =
    (kind === 'repayment' || kind === 'settled') &&
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    !repaymentFits(limit, amountValue);

  const questions = useMemo(() => {
    const pending: string[] = [];
    if (!person.trim()) pending.push('Who is this person? The name was not clear.');
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      pending.push('How much money? Use digits, such as 500 or ५००.');
    }
    if (!kind) pending.push('Was this money you gave, or money they returned? That was not clear.');
    if (!dateConfirmed) {
      pending.push(
        ambiguousKal
          ? 'काल can mean yesterday or tomorrow. Choose the date.'
          : 'No date was spoken. Choose the date before saving.',
      );
    }
    if (repaymentTooLarge) {
      pending.push(
        limit > 0
          ? `The open balance is ${formatINR(limit)}. Enter that amount or less.`
          : 'There is no open balance for this side of the ledger.',
      );
    }
    return pending;
  }, [person, amountValue, kind, dateConfirmed, ambiguousKal, repaymentTooLarge, limit]);

  function applyPhrase(raw: string) {
    const parsed = parseDuePhrase(raw);
    if (parsed.personName) setPerson(parsed.personName);
    if (parsed.amount != null) setAmount(String(parsed.amount));
    if (parsed.kind) setKind(parsed.kind);
    if (parsed.date) setDate(parsed.date);
    setDateConfirmed(parsed.dateExplicit);
    setAmbiguousKal(parsed.questions.some((question) => question.includes('काल')));
    setPhrase(raw);
  }

  async function onListen() {
    if (listening) {
      stopListening();
      return;
    }
    setSpeechNote('Listening…');
    setListening(true);
    try {
      const transcript = await capturePhrase(language, setPhrase);
      applyPhrase(transcript);
      setSpeechNote('Check the details below. Nothing is saved until you confirm.');
    } catch (error) {
      setSpeechNote(error instanceof Error ? error.message : 'Speech recognition did not start.');
    } finally {
      setListening(false);
    }
  }

  function onDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowDate(false);
    if (event.type === 'dismissed' || !selected) return;
    setDate(toISODate(selected));
    setDateConfirmed(true);
  }

  function onReminderChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowReminder(false);
    if (event.type === 'dismissed' || !selected) return;
    setReminder(toISODate(selected));
  }

  async function onSave() {
    if (saving || !person.trim() || !kind || !Number.isFinite(amountValue) || amountValue <= 0 || !dateConfirmed || questions.length) {
      if (!saving) Alert.alert('Confirm the details', 'Fill every highlighted question before saving.');
      return;
    }
    setSaving(true);
    try {
      const draft = {
        personName: person.trim(),
        kind,
        amount: amountValue,
        date,
        note,
        reminderDate: kind === 'lent' && reminder ? reminder : null,
        rawPhrase: phrase.trim() || null,
      };
      if (editing) await editDue(editing.id, draft);
      else await addDue(draft);
      router.back();
    } catch (error) {
      setSaving(false);
      Alert.alert('Not saved', error instanceof Error ? error.message : 'Could not save this entry.');
    }
  }

  const canSave = Boolean(person.trim() && kind && amountValue > 0 && dateConfirmed && questions.length === 0);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card>
            <Heading>{editing ? 'Edit entry' : 'Speak or type'}</Heading>
            <Muted style={{ marginTop: 6 }}>{speechNote}</Muted>
            <View style={{ marginTop: 12 }}>
              <SegmentedControl value={language} onChange={setLanguage} options={LANGUAGES} />
            </View>
            <TextInput
              value={phrase}
              onChangeText={setPhrase}
              multiline
              placeholder='Mi Rahul la 500 rupaye dile'
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.phrase, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
            />
            <View style={styles.actions}>
              <Pressable
                onPress={onListen}
                accessibilityRole="button"
                accessibilityLabel={listening ? 'Stop listening' : 'Start microphone'}
                style={[styles.mic, { backgroundColor: listening ? colors.warning : colors.tint }]}>
                <Ionicons name={listening ? 'stop' : 'mic'} size={22} color="#fff" />
              </Pressable>
              <Pressable onPress={() => applyPhrase(phrase)} style={[styles.secondary, { backgroundColor: colors.tintMuted, borderColor: colors.tint }]}>
                <Body style={{ fontWeight: '800', color: colors.tint }}>Read phrase</Body>
              </Pressable>
            </View>
          </Card>

          <Card>
            <Heading>Confirm before saving</Heading>
            {questions.map((question) => (
              <Body key={question} style={{ color: colors.warning, marginTop: 8 }}>
                {question}
              </Body>
            ))}

            <Field label="Person">
              <TextInput
                value={person}
                onChangeText={setPerson}
                placeholder="Name"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
              />
            </Field>
            <Field label="Amount">
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
              />
            </Field>
            <Field label="Type">
              <SegmentedControl
                value={kind}
                onChange={setKind}
                options={[
                  { label: 'I gave', value: 'lent' },
                  { label: 'Returned', value: 'repayment' },
                  { label: 'Borrowed', value: 'borrowed' },
                  { label: 'I repaid', value: 'settled' },
                ]}
              />
              {!kind ? <Muted style={{ marginTop: 6 }}>Choose one. It is not selected yet.</Muted> : null}
            </Field>
            <Field label="Date">
              <Pressable
                onPress={() => setShowDate(true)}
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, justifyContent: 'center' }]}>
                <Body>{formatDisplayDate(date)}</Body>
              </Pressable>
              {!dateConfirmed ? (
                <Pressable onPress={() => setDateConfirmed(true)} style={{ marginTop: 8 }}>
                  <Body style={{ color: colors.tint, fontWeight: '800' }}>Use {formatDisplayDate(date)}</Body>
                </Pressable>
              ) : (
                <Muted style={{ marginTop: 6 }}>Date confirmed.</Muted>
              )}
              {showDate ? (
                <DateTimePicker
                  value={new Date(`${date}T12:00:00`)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onDateChange}
                />
              ) : null}
            </Field>
            {kind === 'lent' ? (
              <Field label="Reminder (optional)">
                <Pressable onPress={() => setShowReminder(true)}>
                  <Body style={{ color: colors.tint, fontWeight: '700' }}>
                    {reminder ? formatDisplayDate(reminder) : 'No reminder'}
                  </Body>
                </Pressable>
                {showReminder ? (
                  <DateTimePicker
                    value={reminder ? new Date(`${reminder}T12:00:00`) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onReminderChange}
                  />
                ) : null}
              </Field>
            ) : null}
            <Field label="Note (optional)">
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Optional"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
              />
            </Field>
          </Card>

          <Pressable
            onPress={onSave}
            disabled={!canSave || saving}
            style={[styles.save, { backgroundColor: canSave ? colors.tint : colors.surfaceMuted }]}>
            <Heading style={{ color: canSave ? '#fff' : colors.textMuted }}>Save entry</Heading>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 14, gap: 8 }}>
      <Heading>{label}</Heading>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 36 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 48, fontSize: 16 },
  phrase: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12, marginTop: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  secondary: { flex: 1, borderWidth: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 12 },
  mic: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  save: { alignItems: 'center', borderRadius: 16, paddingVertical: 14 },
});
