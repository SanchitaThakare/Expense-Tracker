import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { DuesProvider } from '@/context/DuesContext';
import { FinanceProvider, useFinance } from '@/context/FinanceContext';
import { AppThemeProvider, useAppTheme } from '@/context/ThemeContext';
import { Body } from '@/components/ui/Typography';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <FinanceProvider>
        <DuesProvider>
          <RootLayoutNav />
        </DuesProvider>
      </FinanceProvider>
    </AppThemeProvider>
  );
}

function RootLayoutNav() {
  const { scheme, colors } = useAppTheme();
  const { ready, error } = useFinance();

  useEffect(() => {
    if (ready || error) {
      SplashScreen.hideAsync();
    }
  }, [ready, error]);

  const navTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 }}>
        <Body style={{ textAlign: 'center' }}>{error}</Body>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.tint} size="large" />
      </View>
    );
  }

  return (
    <ThemeProvider
      value={{
        ...navTheme,
        colors: {
          ...navTheme.colors,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          border: colors.border,
          primary: colors.tint,
        },
      }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShadowVisible: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="transaction/[id]"
          options={{ title: 'Transaction', presentation: 'modal' }}
        />
        <Stack.Screen name="due-entry" options={{ title: 'Record due', presentation: 'modal' }} />
        <Stack.Screen name="person/[name]" options={{ title: 'Person' }} />
      </Stack>
    </ThemeProvider>
  );
}
