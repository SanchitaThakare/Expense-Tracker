import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAppTheme } from '@/context/ThemeContext';
import { formatINR } from '@/lib/format';

import { Body, Muted } from './Typography';

export function DueTotalsRow({
  lent,
  repaid,
  outstanding,
}: {
  lent: number;
  repaid: number;
  outstanding: number;
}) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const stacked = width < 360;
  const items = [
    { label: 'Lent', value: lent, color: colors.debit },
    { label: 'Returned', value: repaid, color: colors.credit },
    { label: 'Outstanding', value: outstanding, color: colors.tint },
  ];

  return (
    <View style={[styles.row, stacked && styles.stacked]}>
      {items.map((item) => (
        <View key={item.label} style={[styles.item, stacked && styles.itemStacked]}>
          <Muted>{item.label}</Muted>
          <Body style={{ color: item.color, fontWeight: '800', marginTop: 4 }}>
            {formatINR(item.value, width < 420)}
          </Body>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  stacked: { flexDirection: 'column' },
  item: { flex: 1, minWidth: 96 },
  itemStacked: { flexBasis: 'auto' },
});
