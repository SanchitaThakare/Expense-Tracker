import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useAppTheme } from '@/context/ThemeContext';
import type { SpeechLanguage } from '@/lib/speechCapture';

import { Chip } from './Chip';
import { Muted } from './Typography';

const LANGUAGES: { label: string; value: SpeechLanguage }[] = [
  { label: 'मराठी', value: 'mr-IN' },
  { label: 'हिंदी', value: 'hi-IN' },
  { label: 'English', value: 'en-IN' },
];

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'success' | 'error';

export function CreditVoiceDock({
  language,
  onLanguage,
  phrase,
  onPhrase,
  status,
  message,
  onMic,
  onPreview,
}: {
  language: SpeechLanguage;
  onLanguage: (language: SpeechLanguage) => void;
  phrase: string;
  onPhrase: (phrase: string) => void;
  status: VoiceStatus;
  message: string;
  onMic: () => void;
  onPreview: () => void;
}) {
  const { colors } = useAppTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const listening = status === 'listening';
  const processing = status === 'processing';
  const buttonColor =
    status === 'error' ? colors.debit : status === 'success' ? colors.credit : listening ? colors.warning : colors.tint;
  const iconName =
    status === 'error' ? 'mic-off' : status === 'success' ? 'checkmark' : listening || processing ? 'stop' : 'mic';

  useEffect(() => {
    if (!listening) {
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
  }, [listening, scale]);

  return (
    <View style={[styles.dock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.languages}>
        {LANGUAGES.map((item) => (
          <Chip
            key={item.value}
            label={item.label}
            active={language === item.value}
            onPress={() => onLanguage(item.value)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <TextInput
          value={phrase}
          onChangeText={onPhrase}
          onSubmitEditing={onPreview}
          multiline
          placeholder="Mi Rahul la 500 rupaye dile"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Credit phrase"
          style={[
            styles.input,
            { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
          ]}
        />
        <Animated.View style={{ transform: [{ scale }] }}>
          <Pressable
            onPress={onMic}
            disabled={processing}
            accessibilityRole="button"
            accessibilityLabel={listening ? 'Stop listening' : 'Start microphone'}
            accessibilityState={{ busy: listening || processing, disabled: processing }}
            style={[styles.mic, { backgroundColor: buttonColor, opacity: processing ? 0.7 : 1 }]}>
            <Ionicons name={iconName} size={24} color="#fff" />
          </Pressable>
        </Animated.View>
      </View>
      <View style={styles.footer}>
        <Muted numberOfLines={2} style={{ flex: 1, color: status === 'error' ? colors.debit : colors.textMuted }}>
          {message}
        </Muted>
        <Pressable
          onPress={onPreview}
          accessibilityRole="button"
          accessibilityLabel="Preview phrase before saving"
          style={[styles.preview, { borderColor: colors.tint }]}>
          <Muted style={{ color: colors.tint, fontWeight: '800' }}>Preview</Muted>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    borderTopWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  languages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    maxHeight: 88,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  mic: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  preview: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
