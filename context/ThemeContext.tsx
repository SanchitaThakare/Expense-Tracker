import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme as useSystemColorScheme } from 'react-native';

import { Palette, type ThemeColors, type ThemeName } from '@/constants/theme';

type ThemePreference = ThemeName | 'system';

type ThemeContextValue = {
  preference: ThemePreference;
  scheme: ThemeName;
  colors: ThemeColors;
  setPreference: (value: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemColorScheme() === 'dark' ? 'dark' : 'light';
  const [preference, setPreference] = useState<ThemePreference>('system');
  const scheme: ThemeName = preference === 'system' ? system : preference;

  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
  }, [preference]);

  const value = useMemo(
    () => ({
      preference,
      scheme,
      colors: Palette[scheme],
      setPreference,
    }),
    [preference, scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return context;
}
