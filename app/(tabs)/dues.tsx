import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { CreditVoiceDock, type VoiceStatus } from '@/components/ui/CreditVoiceDock';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Body, Heading, Muted } from '@/components/ui/Typography';
import { useDues } from '@/context/DuesContext';
import { useAppTheme } from '@/context/ThemeContext';
import { iOweFor, outstandingFor, repaymentFits, type DueKind } from '@/lib/dues';
import { parseDuePhrase } from '@/lib/duesParser';
import { formatDisplayDate, formatINR, toISODate } from '@/lib/format';
import {
  cancelListening,
  capturePhrase,
  isSpeechModuleLinked,
  stopListening,
  type SpeechLanguage,
} from '@/lib/speechCapture';

type Filter = 'all' | 'owes' | 'iowe' | 'clear';

type Draft = {
  phrase: string;
  person: string;
  amount: string;
  kind: DueKind | null;
  date: string;
  dateConfirmed: boolean;
  ambiguousKal: boolean;
};

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Owes you', value: 'owes' },
  { label: 'You owe', value: 'iowe' },
  { label: 'Settled', value: 'clear' },
];

const KINDS: { label: string; value: DueKind }[] = [
  { label: 'Lent', value: 'lent' },
  { label: 'Repaid', value: 'repayment' },
  { label: 'Borrowed', value: 'borrowed' },
  { label: 'I repaid', value: 'settled' },
];

export default function DuesScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const { entries, totals, addDue } = useDues();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [language, setLanguage] = useState<SpeechLanguage>('mr-IN');
  const [phrase, setPhrase] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voice, setVoice] = useState<VoiceStatus>('idle');
  const [voiceMessage, setVoiceMessage] = useState(
    isSpeechModuleLinked()
      ? 'Speak or type, then preview. Nothing is saved until you confirm the amount.'
      : 'Type a phrase and preview it. The microphone needs the Android development build because Expo Go does not include speech recognition.',
  );
  const mounted = useRef(true);
  const narrow = width < 360;
  const today = toISODate();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelListening();
    };
  }, []);

  useEffect(() => {
    if (voice !== 'success') return;
    const timer = setTimeout(() => {
      if (mounted.current) setVoice('idle');
    }, 1200);
    return () => clearTimeout(timer);
  }, [voice]);

  const people = totals.people.filter((person) => {
    if (filter === 'owes' && person.outstanding <= 0) return false;
    if (filter === 'iowe' && person.iOwe <= 0) return false;
    if (filter === 'clear' && (person.outstanding > 0 || person.iOwe > 0)) return false;
    if (!query.trim()) return true;
    return person.personName.toLocaleLowerCase('en-IN').includes(query.trim().toLocaleLowerCase('en-IN'));
  });

  const amountValue = Number((draft?.amount ?? '').replace(/,/g, ''));
  const limit = draft
    ? draft.kind === 'settled'
      ? iOweFor(entries, draft.person)
      : outstandingFor(entries, draft.person)
    : 0;
  const repaymentTooLarge = Boolean(
    draft &&
      (draft.kind === 'repayment' || draft.kind === 'settled') &&
      Number.isFinite(amountValue) &&
      amountValue > 0 &&
      !repaymentFits(limit, amountValue),
  );

  const questions = useMemo(() => {
    if (!draft) return [];
    const pending: string[] = [];
    if (!draft.person.trim()) pending.push('Who is this person? The name was not clear.');
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      pending.push('How much money? Use digits, such as 500 or ५००.');
    }
    if (!draft.kind) pending.push('Was this money you gave, or money they returned? That was not clear.');
    if (!draft.dateConfirmed) {
      pending.push(
        draft.ambiguousKal
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
  }, [draft, amountValue, repaymentTooLarge, limit]);

  const canSave = Boolean(draft && questions.length === 0 && draft.kind && amountValue > 0 && draft.dateConfirmed);

  function openPreview(raw: string) {
    const parsed = parseDuePhrase(raw);
    setDraft({
      phrase: raw,
      person: parsed.personName ?? '',
      amount: parsed.amount == null ? '' : String(parsed.amount),
      kind: parsed.kind,
      date: parsed.date ?? toISODate(),
      dateConfirmed: parsed.dateExplicit,
      ambiguousKal: parsed.questions.some((question) => question.includes('काल')),
    });
    setShowDate(false);
  }

  async function onMic() {
    if (voice === 'processing') return;
    if (voice === 'listening') {
      setVoice('processing');
      setVoiceMessage('Turning speech into text…');
      stopListening();
      return;
    }
    if (!isSpeechModuleLinked()) {
      setVoice('error');
      setVoiceMessage(
        'ExpoSpeechRecognition is not in this app. Expo Go cannot load it. With the Android SDK installed, run npx expo run:android. Typing still works.',
      );
      return;
    }
    setVoice('listening');
    setVoiceMessage('Listening…');
    try {
      const transcript = await capturePhrase(language, (text) => {
        if (mounted.current) setPhrase(text);
      });
      if (!mounted.current) return;
      setPhrase(transcript);
      openPreview(transcript);
      setVoice('success');
      setVoiceMessage('Check the preview. Nothing is saved until you confirm.');
    } catch (error) {
      if (!mounted.current) return;
      setVoice('error');
      setVoiceMessage(error instanceof Error ? error.message : 'Speech recognition failed.');
    }
  }

  function onDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowDate(false);
    if (event.type === 'dismissed' || !selected || !draft) return;
    setDraft({ ...draft, date: toISODate(selected), dateConfirmed: true, ambiguousKal: false });
  }

  async function onSave() {
    if (saving || !draft?.kind || !canSave) return;
    setSaving(true);
    try {
      await addDue({
        personName: draft.person.trim(),
        kind: draft.kind,
        amount: amountValue,
        date: draft.date,
        rawPhrase: draft.phrase.trim() || null,
      });
      setDraft(null);
      setPhrase('');
      setVoice('success');
      setVoiceMessage('Saved. Outstanding credit was recalculated.');
    } catch (error) {
      setVoice('error');
      setVoiceMessage(error instanceof Error ? error.message : 'Could not save this entry.');
    } finally {
      setSaving(false);
    }
  }

  const summaries = [
    { label: 'Total lent', value: totals.lent, icon: 'arrow-up-circle' as const, color: colors.debit },
    { label: 'Amount repaid', value: totals.repaid, icon: 'checkmark-circle' as const, color: colors.credit },
    { label: 'Outstanding', value: totals.outstanding, icon: 'wallet' as const, color: colors.tint },
  ];

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View>
            <Muted>Separate from income and expenses</Muted>
            <Heading>Credit</Heading>
          </View>

          <View style={[styles.summaries, narrow && styles.summariesStacked]}>
            {summaries.map((item) => (
              <Card key={item.label} style={styles.summaryCard}>
                <Ionicons name={item.icon} size={18} color={item.color} />
                <Muted numberOfLines={2} style={styles.summaryLabel}>
                  {item.label}
                </Muted>
                <Body numberOfLines={1} style={{ color: item.color, fontWeight: '800', marginTop: 4 }}>
                  {formatINR(item.value, width < 420)}
                </Body>
              </Card>
            ))}
          </View>
          {totals.iOwe > 0 ? (
            <Muted>You still owe {formatINR(totals.iOwe, width < 420)} to other people.</Muted>
          ) : null}

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Search people"
            style={[styles.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {FILTERS.map((item) => (
              <Chip
                key={item.value}
                label={item.label}
                active={filter === item.value}
                onPress={() => setFilter(item.value)}
              />
            ))}
          </ScrollView>

          {people.length ? (
            people.map((person) => {
              const progressBase = person.lent > 0 ? person.lent : person.borrowed;
              const progressValue = person.lent > 0 ? person.repaid : person.settled;
              const ratio = progressBase > 0 ? Math.min(1, progressValue / progressBase) : 0;
              const reminderDue = Boolean(
                person.reminderDate && person.outstanding > 0 && person.reminderDate <= today,
              );
              return (
                <Card key={person.personKey} style={styles.personCard}>
                  <View style={styles.personRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open history for ${person.personName}`}
                      onPress={() =>
                        router.push({ pathname: '/person/[name]', params: { name: person.personKey } })
                      }
                      style={styles.personMain}>
                      <View style={[styles.avatar, { backgroundColor: colors.tintMuted }]}>
                        <Body style={{ color: colors.tint, fontWeight: '800' }}>
                          {person.personName.slice(0, 1).toUpperCase()}
                        </Body>
                      </View>
                      <View style={styles.personCopy}>
                        <Body numberOfLines={1} style={{ fontWeight: '800' }}>
                          {person.personName}
                        </Body>
                        <Muted numberOfLines={1}>
                          {person.lent > 0
                            ? `Repaid ${formatINR(person.repaid, true)} of ${formatINR(person.lent, true)}`
                            : person.borrowed > 0
                              ? `You repaid ${formatINR(person.settled, true)} of ${formatINR(person.borrowed, true)}`
                              : 'No open credit'}
                        </Muted>
                        <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
                          <View
                            style={[styles.fillBar, { width: `${Math.round(ratio * 100)}%`, backgroundColor: colors.tint }]}
                          />
                        </View>
                        {person.iOwe > 0 ? (
                          <Muted numberOfLines={1}>You owe {formatINR(person.iOwe, true)}</Muted>
                        ) : null}
                        {person.reminderDate ? (
                          <Muted numberOfLines={1} style={{ color: reminderDue ? colors.warning : colors.textMuted }}>
                            Due {formatDisplayDate(person.reminderDate)}
                            {reminderDue ? ' · now' : ''}
                          </Muted>
                        ) : null}
                      </View>
                    </Pressable>
                    <View style={styles.personSide}>
                      <Body
                        numberOfLines={1}
                        style={{ color: person.outstanding > 0 ? colors.debit : colors.credit, fontWeight: '800' }}>
                        {formatINR(person.outstanding, true)}
                      </Body>
                      {person.outstanding > 0 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Record a repayment from ${person.personName}`}
                          onPress={() =>
                            router.push({
                              pathname: '/due-entry',
                              params: { person: person.personName, kind: 'repayment' },
                            })
                          }>
                          <Muted style={{ color: colors.tint, fontWeight: '800' }}>Repay</Muted>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </Card>
              );
            })
          ) : (
            <Card>
              <EmptyState
                title={query.trim() || filter !== 'all' ? 'No matching people' : 'No credit yet'}
                message='Try “Mi Rahul la 500 rupaye dile” or “राहुलला ५०० रुपये दिले.” Confirm the amount before it is saved.'
              />
            </Card>
          )}
        </ScrollView>

        {draft ? (
          <ScrollView
            style={[styles.previewScroll, { backgroundColor: colors.background, borderColor: colors.border }]}
            contentContainerStyle={styles.previewContent}
            keyboardShouldPersistTaps="handled">
            <View style={styles.previewHeader}>
              <Heading>Confirm</Heading>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss preview" onPress={() => setDraft(null)}>
                <Muted style={{ color: colors.textMuted, fontWeight: '700' }}>Dismiss</Muted>
              </Pressable>
            </View>
            {questions.map((question) => (
              <Muted key={question} style={{ color: colors.warning }}>
                {question}
              </Muted>
            ))}
            <View style={styles.previewFields}>
              <TextInput
                value={draft.person}
                onChangeText={(person) => setDraft({ ...draft, person })}
                placeholder="Person"
                placeholderTextColor={colors.textMuted}
                style={[styles.field, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
              <TextInput
                value={draft.amount}
                onChangeText={(amount) => setDraft({ ...draft, amount })}
                keyboardType="decimal-pad"
                placeholder="Amount"
                placeholderTextColor={colors.textMuted}
                style={[styles.field, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {KINDS.map((item) => (
                <Chip
                  key={item.value}
                  label={item.label}
                  active={draft.kind === item.value}
                  onPress={() => setDraft({ ...draft, kind: item.value })}
                />
              ))}
            </ScrollView>
            <View style={styles.previewHeader}>
              <Pressable onPress={() => setShowDate(true)}>
                <Body style={{ color: colors.tint, fontWeight: '700' }}>{formatDisplayDate(draft.date)}</Body>
              </Pressable>
              {!draft.dateConfirmed ? (
                <Pressable
                  onPress={() => setDraft({ ...draft, date: toISODate(), dateConfirmed: true, ambiguousKal: false })}>
                  <Muted style={{ color: colors.tint, fontWeight: '800' }}>Use today</Muted>
                </Pressable>
              ) : (
                <Muted>Date confirmed</Muted>
              )}
            </View>
            {showDate ? (
              <DateTimePicker
                value={new Date(`${draft.date}T12:00:00`)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateChange}
              />
            ) : null}
            <Pressable
              onPress={onSave}
              disabled={!canSave || saving}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              style={[styles.save, { backgroundColor: canSave ? colors.tint : colors.surfaceMuted }]}>
              <Body style={{ color: canSave ? '#fff' : colors.textMuted, fontWeight: '800' }}>Save credit entry</Body>
            </Pressable>
          </ScrollView>
        ) : null}

        <CreditVoiceDock
          language={language}
          onLanguage={setLanguage}
          phrase={phrase}
          onPhrase={setPhrase}
          status={voice}
          message={voiceMessage}
          onMic={() => {
            void onMic();
          }}
          onPreview={() => {
            if (!phrase.trim()) {
              setVoice('error');
              setVoiceMessage('Type or speak a phrase before previewing.');
              return;
            }
            openPreview(phrase);
            setVoiceMessage('Check the preview. Nothing is saved until you confirm.');
          }}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: 12, paddingBottom: 16 },
  summaries: { flexDirection: 'row', gap: 8 },
  summariesStacked: { flexDirection: 'column' },
  summaryCard: { flex: 1, minWidth: 0, padding: 12, borderRadius: 16 },
  summaryLabel: { marginTop: 6 },
  search: { borderWidth: 1, borderRadius: 14, minHeight: 46, paddingHorizontal: 12 },
  filters: { gap: 8, paddingRight: 4 },
  personCard: { padding: 12, borderRadius: 16 },
  personRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  personMain: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 10 },
  personCopy: { flex: 1, minWidth: 0, gap: 3 },
  personSide: { alignItems: 'flex-end', gap: 6, maxWidth: 110 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 99, overflow: 'hidden', marginTop: 2 },
  fillBar: { height: 6, borderRadius: 99 },
  previewScroll: { maxHeight: 280, borderTopWidth: 1 },
  previewContent: { gap: 8, paddingVertical: 10 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  previewFields: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 10 },
  save: { alignItems: 'center', borderRadius: 14, paddingVertical: 12 },
});
