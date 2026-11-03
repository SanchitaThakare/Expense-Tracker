import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Muted } from '@/components/ui/Typography';
import { useDues } from '@/context/DuesContext';
import { useFinance } from '@/context/FinanceContext';
import { useAppTheme } from '@/context/ThemeContext';
import {
  applyFollowUp,
  interpret,
  isShortFollowUp,
  previewReady,
  type AssistantPreview,
  type AssistantRecord,
  type AssistantReply,
} from '@/lib/assistant';
import { categorizeTransaction } from '@/lib/categories';
import { personKey } from '@/lib/dues';
import { formatDisplayDate, formatINR, monthKey, toISODate } from '@/lib/format';
import {
  cancelListening,
  capturePhrase,
  isSpeechModuleLinked,
  stopListening,
  type SpeechLanguage,
} from '@/lib/speechCapture';

type ChatItem = { id: number; role: 'user' | 'assistant'; reply: AssistantReply };
type VoiceStatus = 'idle' | 'listening' | 'processing' | 'success' | 'error';

const LANGUAGES: { label: string; value: SpeechLanguage }[] = [
  { label: 'मराठी', value: 'mr-IN' },
  { label: 'हिंदी', value: 'hi-IN' },
  { label: 'English', value: 'en-IN' },
];

const EXAMPLES = ['Mi Rahul la 500 rupaye dile', 'How much money do I need to collect?'];

const RECORD_LABEL: Record<AssistantRecord, string> = {
  expense: 'Expense',
  income: 'Income',
  lent: 'Lent',
  borrowed: 'Borrowed',
  repayment: 'Repayment',
  settled: 'You repaid',
  reminder: 'Reminder',
};

export default function AssistantScreen() {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const finance = useFinance();
  const dues = useDues();
  const scrollRef = useRef<{ scrollToEnd: (options?: { animated?: boolean }) => void } | null>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const mounted = useRef(true);
  const cancelled = useRef(false);
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<SpeechLanguage>('mr-IN');
  const [voice, setVoice] = useState<VoiceStatus>('idle');
  const [note, setNote] = useState(
    isSpeechModuleLinked()
      ? 'Speak or type. Edit the words, then send. Nothing is saved until you confirm.'
      : 'Type a phrase. The microphone needs the Android development build because Expo Go does not include speech recognition.',
  );
  const [items, setItems] = useState<ChatItem[]>([]);
  const [pending, setPending] = useState<AssistantPreview | null>(null);
  const [dateConfirmed, setDateConfirmed] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [draftKey, setDraftKey] = useState(0);
  const [lastPhrase, setLastPhrase] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelListening();
    };
  }, []);

  useEffect(() => {
    if (voice !== 'listening') {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.08, duration: 650, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, voice]);

  useEffect(() => {
    if (voice !== 'success') return;
    const timer = setTimeout(() => {
      if (mounted.current) setVoice('idle');
    }, 1200);
    return () => clearTimeout(timer);
  }, [voice]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [items, pending, voice]);

  useEffect(() => {
    setAmountText(pending?.amount == null ? '' : String(pending.amount));
    // Only refresh the amount field when a new reply creates a preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  function context() {
    return {
      today: toISODate(),
      month: finance.month,
      transactions: finance.history.map((item) => ({
        id: item.id,
        type: item.type,
        amount: item.amount,
        date: item.date,
        merchant: item.merchant,
        category: item.category,
        notes: item.notes,
      })),
      dues: dues.entries,
    };
  }

  function push(role: ChatItem['role'], reply: AssistantReply) {
    setItems((current) => [...current, { id: Date.now() + Math.random(), role, reply }]);
  }

  function showReply(phrase: string, reply: AssistantReply) {
    push('user', { kind: 'answer', message: phrase, questions: [], preview: null, matches: [] });
    push('assistant', reply);
    setPending(reply.preview);
    setDateConfirmed(Boolean(reply.preview?.dateExplicit));
    setDraftKey((value) => value + 1);
    setLastPhrase(phrase);
    setText('');
  }

  function onSend(raw: string) {
    const phrase = raw.trim();
    if (!phrase || voice === 'listening' || voice === 'processing') return;
    const reply =
      pending && isShortFollowUp(phrase) ? applyFollowUp(pending, phrase) : interpret(phrase, context());
    showReply(phrase, reply);
  }

  function askExample(phrase: string) {
    if (voice === 'listening' || voice === 'processing') return;
    showReply(phrase, interpret(phrase, context()));
  }

  async function onMic() {
    if (voice === 'processing') return;
    if (voice === 'listening') {
      setVoice('processing');
      setNote('Turning speech into text…');
      stopListening();
      return;
    }
    if (!isSpeechModuleLinked()) {
      setVoice('error');
      setNote(
        'ExpoSpeechRecognition is not in this app. Expo Go cannot load it. With the Android SDK installed, run npx expo run:android. You can type instead.',
      );
      return;
    }
    cancelled.current = false;
    setVoice('listening');
    setNote('Listening…');
    try {
      const transcript = await capturePhrase(language, (partial) => {
        if (mounted.current) setText(partial);
      });
      if (!mounted.current || cancelled.current) return;
      setText(transcript);
      setVoice('success');
      setNote('Edit the text if needed, then send. Nothing is saved until you confirm.');
    } catch (error) {
      if (!mounted.current || cancelled.current) return;
      setVoice('error');
      setNote(error instanceof Error ? error.message : 'Microphone unavailable. Type the phrase instead.');
    }
  }

  function onCancelVoice() {
    cancelled.current = true;
    cancelListening();
    setVoice('idle');
    setNote('Cancelled. Type a phrase or try the microphone again.');
  }

  function onCancelPreview() {
    setPending(null);
    setDateConfirmed(false);
    push('assistant', {
      kind: 'answer',
      message: 'Cancelled. Nothing was saved.',
      questions: [],
      preview: null,
      matches: [],
    });
  }

  async function onConfirm() {
    if (!pending || !ready || saving) return;
    setSaving(true);
    const draft = { ...pending, dateExplicit: true as const, amount: pending.amount };
    try {
      if (draft.record === 'expense' || draft.record === 'income') {
        const category =
          draft.category ??
          categorizeTransaction(draft.person ?? '', draft.record === 'income' ? 'credit' : 'debit').category;
        await finance.addTransaction({
          type: draft.record === 'income' ? 'credit' : 'debit',
          amount: draft.amount ?? 0,
          date: draft.date ?? toISODate(),
          merchant: draft.person ?? 'Unknown',
          category,
          notes: draft.note,
          source: 'manual',
        });
        finance.setMonth(monthKey(draft.date ?? toISODate()));
      } else if (draft.record === 'reminder') {
        await dues.saveReminder(personKey(draft.person ?? ''), draft.reminderDate);
      } else {
        await dues.addDue({
          personName: draft.person ?? '',
          kind: draft.record,
          amount: draft.amount ?? 0,
          date: draft.date ?? toISODate(),
          note: draft.note,
          reminderDate: draft.reminderDate,
          rawPhrase: draft.note,
        });
      }
      push('assistant', {
        kind: 'answer',
        message: 'Saved on this phone. Balances use the existing credit and transaction records.',
        questions: [],
        preview: null,
        matches: [],
      });
      setPending(null);
      setVoice('success');
      setNote('Saved.');
      setSaving(false);
    } catch (error) {
      setSaving(false);
      push('assistant', {
        kind: 'clarify',
        message: error instanceof Error ? error.message : 'Not saved.',
        questions: [],
        preview: null,
        matches: [],
      });
    }
  }

  const ready = pending
    ? previewReady({ ...pending, dateExplicit: dateConfirmed || pending.dateExplicit })
    : false;
  const canSend = Boolean(text.trim()) && voice !== 'listening' && voice !== 'processing';
  const micColor =
    voice === 'error' ? colors.debit : voice === 'success' ? colors.credit : voice === 'listening' ? colors.warning : colors.tint;
  const micIcon =
    voice === 'error' ? 'mic-off' : voice === 'success' ? 'checkmark' : voice === 'listening' || voice === 'processing' ? 'stop' : 'mic';
  const promptWidth = Math.max(160, Math.min(width - 72, 280));

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.body}>
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: colors.tintMuted }]}>
              <Ionicons name="chatbubble-ellipses" size={16} color={colors.tint} />
            </View>
            <View style={styles.headerCopy}>
              <Body numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontWeight: '700' }}>
                Assistant
              </Body>
              <Muted numberOfLines={1} maxFontSizeMultiplier={1.25}>
                Answers come from saved records on this phone
              </Muted>
            </View>
          </View>

          <ScrollView
            ref={(node) => {
              scrollRef.current = node;
            }}
            style={styles.fill}
            contentContainerStyle={styles.thread}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}>
            {items.length === 0 ? (
              <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Muted maxFontSizeMultiplier={1.35}>
                  Ask about saved spending or credit, or describe a payment. A loan is not saved until you confirm the person, amount, and date.
                </Muted>
              </View>
            ) : null}
            {items.map((item) => {
              const mine = item.role === 'user';
              return (
                <View
                  key={item.id}
                  style={[
                    styles.bubble,
                    {
                      alignSelf: mine ? 'flex-end' : 'flex-start',
                      backgroundColor: mine ? colors.tintMuted : colors.surface,
                      borderColor: mine ? colors.tint : colors.border,
                    },
                  ]}>
                  {mine ? null : (
                    <Ionicons name="sparkles" size={14} color={colors.tint} style={{ marginBottom: 4 }} />
                  )}
                  <Body maxFontSizeMultiplier={1.45}>{item.reply.message}</Body>
                  {item.reply.questions.map((question) => (
                    <Body key={question} maxFontSizeMultiplier={1.4} style={{ color: colors.warning, marginTop: 6 }}>
                      {question}
                    </Body>
                  ))}
                  {item.reply.matches.map((match) => (
                    <Muted key={`${match.title}-${match.subtitle}`} maxFontSizeMultiplier={1.35} style={{ marginTop: 6 }}>
                      {match.title} · {match.subtitle}
                    </Muted>
                  ))}
                </View>
              );
            })}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.scroller}
            contentContainerStyle={styles.examples}>
            {EXAMPLES.map((example) => (
              <Pressable
                key={example}
                accessibilityRole="button"
                accessibilityLabel={`Try ${example}`}
                onPress={() => askExample(example)}
                style={[styles.example, { maxWidth: promptWidth, borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Muted numberOfLines={2} maxFontSizeMultiplier={1.3}>
                  {example}
                </Muted>
              </Pressable>
            ))}
          </ScrollView>

          {pending ? (
            <ScrollView
              style={[styles.preview, { borderColor: colors.border, backgroundColor: colors.surface }]}
              contentContainerStyle={styles.previewContent}
              keyboardShouldPersistTaps="handled">
              <Body maxFontSizeMultiplier={1.3} style={{ fontWeight: '700' }}>
                Confirm {RECORD_LABEL[pending.record]}
              </Body>
              <Muted maxFontSizeMultiplier={1.3}>{pending.explanation}</Muted>
              {pending &&
                (dateConfirmed ? [] : ['Choose the date before saving.']).concat(
                  !pending.person ? ['Who is this person?'] : [],
                  pending.amount == null ? ['What is the amount?'] : [],
                ).map((question) => (
                  <Muted key={question} maxFontSizeMultiplier={1.3} style={{ color: colors.warning }}>
                    {question}
                  </Muted>
                ))}
              <TextInput
                value={pending.person ?? ''}
                onChangeText={(person) => setPending({ ...pending, person: person.trim() ? person : null })}
                placeholder="Person"
                placeholderTextColor={colors.textMuted}
                maxFontSizeMultiplier={1.35}
                style={[styles.field, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
              />
              <TextInput
                value={amountText}
                onChangeText={(value) => {
                  setAmountText(value);
                  const amount = Number(value.replace(/,/g, ''));
                  setPending({
                    ...pending,
                    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
                  });
                }}
                keyboardType="decimal-pad"
                placeholder="Amount"
                placeholderTextColor={colors.textMuted}
                maxFontSizeMultiplier={1.35}
                style={[styles.field, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
              />
              <View style={styles.previewActions}>
                <Muted numberOfLines={1} maxFontSizeMultiplier={1.25} style={{ flex: 1 }}>
                  {pending.date ? formatDisplayDate(pending.date) : 'No date'}
                  {pending.category ? ` · ${pending.category}` : ''}
                </Muted>
                {!dateConfirmed && pending.date ? (
                  <Pressable accessibilityRole="button" onPress={() => setDateConfirmed(true)} style={styles.textBtn}>
                    <Muted style={{ color: colors.tint, fontWeight: '800' }}>Use this date</Muted>
                  </Pressable>
                ) : (
                  <Muted>Date confirmed</Muted>
                )}
              </View>
              <View style={styles.previewActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel confirmation"
                  onPress={onCancelPreview}
                  style={[styles.action, { borderColor: colors.border }]}>
                  <Body maxFontSizeMultiplier={1.3}>Cancel</Body>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save confirmed record"
                  disabled={!ready || saving}
                  onPress={() => {
                    void onConfirm();
                  }}
                  style={[styles.action, { backgroundColor: ready ? colors.tint : colors.surfaceMuted, borderColor: 'transparent' }]}>
                  <Body maxFontSizeMultiplier={1.3} style={{ color: ready ? colors.background : colors.textMuted, fontWeight: '800' }}>
                    Save
                  </Body>
                </Pressable>
              </View>
            </ScrollView>
          ) : null}

          <View style={styles.statusRow}>
            <Muted accessibilityLiveRegion="polite" numberOfLines={3} maxFontSizeMultiplier={1.3} style={styles.statusText}>
              {note}
            </Muted>
            {voice === 'error' ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Retry microphone" onPress={() => void onMic()} style={styles.textBtn}>
                <Muted style={{ color: colors.tint, fontWeight: '800' }}>Retry</Muted>
              </Pressable>
            ) : null}
            {voice === 'listening' || voice === 'processing' ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel listening" onPress={onCancelVoice} style={styles.textBtn}>
                <Muted style={{ color: colors.debit, fontWeight: '800' }}>Cancel</Muted>
              </Pressable>
            ) : null}
            {lastPhrase && voice === 'idle' && !pending && items[items.length - 1]?.reply.kind === 'clarify' ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Retry last phrase" onPress={() => askExample(lastPhrase)} style={styles.textBtn}>
                <Muted style={{ color: colors.tint, fontWeight: '800' }}>Retry</Muted>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.langs}>
            {LANGUAGES.map((item) => {
              const active = language === item.value;
              return (
                <Pressable
                  key={item.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setLanguage(item.value)}
                  style={[
                    styles.lang,
                    {
                      backgroundColor: active ? colors.tintMuted : colors.surface,
                      borderColor: active ? colors.tint : colors.border,
                    },
                  ]}>
                  <Muted maxFontSizeMultiplier={1.3} style={{ color: active ? colors.text : colors.textMuted, fontWeight: '700' }}>
                    {item.label}
                  </Muted>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.composer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder="Ask or describe a payment"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Message"
              maxFontSizeMultiplier={1.4}
              style={[styles.input, { color: colors.text }]}
            />
            <Animated.View style={{ transform: [{ scale }] }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={voice === 'listening' ? 'Stop listening' : 'Start microphone'}
                accessibilityState={{ busy: voice === 'listening' || voice === 'processing' }}
                disabled={voice === 'processing'}
                onPress={() => void onMic()}
                style={[styles.mic, { backgroundColor: micColor, opacity: voice === 'processing' ? 0.7 : 1 }]}>
                <Ionicons name={micIcon} size={22} color={colors.background} />
              </Pressable>
            </Animated.View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={!canSend}
              onPress={() => onSend(text)}
              style={[styles.mic, { backgroundColor: canSend ? colors.tint : colors.surfaceMuted }]}>
              <Ionicons name="send" size={18} color={canSend ? colors.background : colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  headerIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  thread: { gap: 8, paddingBottom: 8, flexGrow: 1 },
  empty: { borderWidth: 1, borderRadius: 16, padding: 12 },
  bubble: { maxWidth: '88%', borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10 },
  scroller: { flexGrow: 0, marginBottom: 8 },
  examples: { gap: 8, paddingRight: 8 },
  example: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  preview: { maxHeight: 230, borderWidth: 1, borderRadius: 16, marginBottom: 8 },
  previewContent: { gap: 8, padding: 12 },
  previewActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: { borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 12, fontSize: 16 },
  action: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statusText: { flex: 1 },
  textBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  langs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  lang: { borderWidth: 1, borderRadius: 999, minHeight: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderWidth: 1,
    borderRadius: 22,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: { flex: 1, minWidth: 0, minHeight: 44, maxHeight: 96, fontSize: 16, paddingTop: 10, paddingBottom: 10 },
  mic: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
