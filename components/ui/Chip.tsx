import { Pressable, StyleSheet } from 'react-native';

import { useAppTheme } from '@/context/ThemeContext';
import { Muted } from './Typography';

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.tintMuted : colors.surfaceMuted,
          borderColor: active ? colors.tint : colors.border,
        },
      ]}>
      <Muted style={{ color: active ? colors.tint : colors.textMuted, fontWeight: '700' }}>
        {label}
      </Muted>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
});
