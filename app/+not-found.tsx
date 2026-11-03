import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Body, Heading } from '@/components/ui/Typography';
import { useAppTheme } from '@/context/ThemeContext';

export default function NotFoundScreen() {
  const { colors } = useAppTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Heading>This screen does not exist.</Heading>
        <Link href="/" style={styles.link}>
          <Body style={{ color: colors.tint }}>Go to dashboard</Body>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  link: { marginTop: 16, paddingVertical: 12 },
});
