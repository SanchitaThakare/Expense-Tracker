import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/context/ThemeContext';
import { Body } from './Typography';

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | null;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.item,
              active && { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <Body style={{ fontWeight: active ? '800' : '600', color: active ? colors.text : colors.textMuted }}>
              {option.label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    gap: 4,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
