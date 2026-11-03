import { Text, type TextProps } from 'react-native';

import { useAppTheme } from '@/context/ThemeContext';

export function Title({ style, ...props }: TextProps) {
  const { colors } = useAppTheme();
  return (
    <Text
      {...props}
      style={[{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.4 }, style]}
    />
  );
}

export function Heading({ style, ...props }: TextProps) {
  const { colors } = useAppTheme();
  return (
    <Text {...props} style={[{ color: colors.text, fontSize: 18, fontWeight: '700' }, style]} />
  );
}

export function Body({ style, ...props }: TextProps) {
  const { colors } = useAppTheme();
  return <Text {...props} style={[{ color: colors.text, fontSize: 15, lineHeight: 22 }, style]} />;
}

export function Muted({ style, ...props }: TextProps) {
  const { colors } = useAppTheme();
  return <Text {...props} style={[{ color: colors.textMuted, fontSize: 13 }, style]} />;
}
