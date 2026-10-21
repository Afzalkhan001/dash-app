// The one Text component. Picks a type style from tokens, caps how far each style grows with the
// system font size (big figures barely grow, body text grows a lot), removes Android's extra font
// padding so labels sit centred in pills and buttons, and uses tabular digits for figures so numbers
// don't jitter while they count or tick.

import { Platform, Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { palette, type as typeScale } from '@/theme/tokens';

export type TextVariant = keyof typeof typeScale;

/** Default maxFontSizeMultiplier per variant (docs/DESIGN.md §4.1). A prop overrides it. */
export const MAX_FONT_SCALE: Record<TextVariant, number> = {
  numeral: 1.1,
  display: 1.15,
  hero: 1.2,
  title: 1.3,
  heading: 1.4,
  body: 1.6,
  bodyStrong: 1.6,
  label: 1.6,
  labelStrong: 1.6,
  caption: 1.4,
  micro: 1.1,
};

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };
const ANDROID_PAD: TextStyle | null = Platform.OS === 'android' ? { includeFontPadding: false } : null;

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  color?: string;
  muted?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Tabular (fixed-width) digits — timers, clocks, amounts in rows, counts. display/hero always are. */
  tabular?: boolean;
};

export function Text({ variant = 'body', color, muted, align, tabular, style, maxFontSizeMultiplier, ...rest }: AppTextProps) {
  const figures = tabular || variant === 'display' || variant === 'hero';
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE[variant]}
      {...rest}
      style={[
        typeScale[variant],
        ANDROID_PAD,
        { color: color ?? (muted ? palette.textMuted : palette.text) },
        figures ? TABULAR : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
