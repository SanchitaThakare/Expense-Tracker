export type ThemeName = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  tint: string;
  tintMuted: string;
  credit: string;
  debit: string;
  warning: string;
  overlay: string;
  tabBar: string;
  cardShadow: string;
};

export const Palette: Record<ThemeName, ThemeColors> = {
  light: {
    background: '#F3F5FA',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF2F7',
    text: '#0F172A',
    textMuted: '#64748B',
    border: '#E2E8F0',
    tint: '#0F766E',
    tintMuted: '#CCFBF1',
    credit: '#15803D',
    debit: '#BE123C',
    warning: '#C2410C',
    overlay: 'rgba(15, 23, 42, 0.45)',
    tabBar: '#FFFFFF',
    cardShadow: 'rgba(15, 23, 42, 0.08)',
  },
  dark: {
    background: '#0B1220',
    surface: '#151D2E',
    surfaceMuted: '#1C2740',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    border: '#243049',
    tint: '#2DD4BF',
    tintMuted: '#134E4A',
    credit: '#4ADE80',
    debit: '#FB7185',
    warning: '#FDBA74',
    overlay: 'rgba(0, 0, 0, 0.55)',
    tabBar: '#101827',
    cardShadow: 'rgba(0, 0, 0, 0.35)',
  },
};
