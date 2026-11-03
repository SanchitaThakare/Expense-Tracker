import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useAppTheme } from '@/context/ThemeContext';
import { CATEGORY_COLORS } from '@/lib/categories';
import { formatDisplayDate, formatINR } from '@/lib/format';
import { movementOf } from '@/lib/transactionFilters';
import type { Transaction } from '@/lib/types';

import { CATEGORY_ICONS } from './CategoryFilter';
import { Body, Muted } from './Typography';

export function TransactionRow({
  item,
  onPress,
}: {
  item: Transaction;
  onPress?: () => void;
}) {
  const { colors } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const movement = movementOf(item);
  const amountColor =
    movement.key === 'received' ? colors.credit : movement.key === 'spent' ? colors.debit : colors.tint;
  const badge = CATEGORY_COLORS[item.category];
  const compact = width < 390 || fontScale > 1.15;
  const label = `${item.merchant}. ${movement.label} ${formatINR(item.amount)}. ${item.category}. ${formatDisplayDate(item.date)}.`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.press, { opacity: pressed ? 0.72 : 1 }]}>
      <View style={[styles.row, { borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: `${badge}22` }]}>
          <Ionicons name={CATEGORY_ICONS[item.category]} size={18} color={badge} />
        </View>
        <View style={styles.meta}>
          <Body numberOfLines={1} maxFontSizeMultiplier={1.4} style={styles.merchant}>
            {item.merchant}
          </Body>
          <Muted numberOfLines={1} maxFontSizeMultiplier={1.35}>
            {formatDisplayDate(item.date)}
          </Muted>
          <Muted numberOfLines={1} maxFontSizeMultiplier={1.35}>
            {item.category}
          </Muted>
        </View>
        <View style={styles.amountWrap}>
          <Body
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={1.3}
            style={[styles.amount, { color: amountColor }]}>
            {movement.symbol}
            {formatINR(item.amount, compact)}
          </Body>
          <View style={styles.kind}>
            <Ionicons
              name={
                movement.key === 'received' ? 'arrow-down' : movement.key === 'spent' ? 'arrow-up' : 'swap-horizontal'
              }
              size={12}
              color={amountColor}
            />
            <Muted numberOfLines={1} maxFontSizeMultiplier={1.25} style={{ color: amountColor, fontWeight: '700' }}>
              {movement.label}
            </Muted>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: { minHeight: 64 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1, minWidth: 0, gap: 1 },
  merchant: { fontWeight: '700' },
  amountWrap: { alignItems: 'flex-end', flexShrink: 0, maxWidth: '42%', gap: 2 },
  amount: { fontWeight: '800', textAlign: 'right' },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
