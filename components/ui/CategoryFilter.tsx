import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { CATEGORY_COLORS } from '@/lib/categories';
import { CATEGORIES, type Category } from '@/lib/types';
import { useAppTheme } from '@/context/ThemeContext';

import { Muted } from './Typography';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const CATEGORY_ICONS: Record<Category, IconName> = {
  'Food & Dining': 'restaurant',
  Groceries: 'basket',
  Transport: 'car',
  Shopping: 'bag-handle',
  'Bills & Utilities': 'receipt',
  Entertainment: 'film',
  Health: 'medkit',
  Travel: 'airplane',
  Education: 'school',
  Transfers: 'swap-horizontal',
  Income: 'wallet',
  Other: 'ellipsis-horizontal',
};

export function CategoryFilter({
  value,
  onChange,
  includeAll = false,
  layout = 'scroll',
}: {
  value: Category | 'all';
  onChange: (value: Category | 'all') => void;
  includeAll?: boolean;
  layout?: 'scroll' | 'wrap';
}) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const items = includeAll ? (['all', ...CATEGORIES] as const) : CATEGORIES;
  const maxPill = Math.max(140, Math.min(width - 64, 240));

  const pills = items.map((item) => {
    const active = value === item;
    const tint = item === 'all' ? colors.tint : CATEGORY_COLORS[item];
    const label = item === 'all' ? 'All' : item;
    return (
      <Pressable
        key={item}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={item === 'all' ? 'All categories' : item}
        onPress={() => onChange(item)}
        style={({ pressed }) => [
          styles.pill,
          {
            maxWidth: layout === 'wrap' ? '100%' : maxPill,
            opacity: pressed ? 0.72 : 1,
            backgroundColor: active ? colors.tintMuted : colors.surface,
            borderColor: active ? colors.tint : colors.border,
          },
        ]}>
        <View style={[styles.icon, { backgroundColor: `${tint}22` }]}>
          <Ionicons name={item === 'all' ? 'apps' : CATEGORY_ICONS[item]} size={16} color={tint} />
        </View>
        <Muted
          numberOfLines={2}
          maxFontSizeMultiplier={1.35}
          style={{
            flexShrink: 1,
            color: active ? colors.text : colors.textMuted,
            fontWeight: active ? '700' : '600',
          }}>
          {label}
        </Muted>
      </Pressable>
    );
  });

  if (layout === 'wrap') {
    return <View style={styles.wrap}>{pills}</View>;
  }

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={styles.scrollContent}>
      {pills}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { flexGrow: 0 },
  scrollContent: { gap: 8, paddingRight: 8, paddingVertical: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    minHeight: 44,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
