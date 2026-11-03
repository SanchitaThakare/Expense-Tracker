import { StyleSheet, View } from 'react-native';

import { Heading, Muted } from './Typography';

export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View style={styles.wrap}>
      <Heading>{title}</Heading>
      <Muted style={styles.message}>{message}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 28, alignItems: 'center', gap: 6 },
  message: { textAlign: 'center', maxWidth: 280 },
});
