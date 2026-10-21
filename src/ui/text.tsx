// The one Text component. Picks a type style from tokens, caps how far each style grows with the
// system font size (big figures barely grow, body text grows a lot), removes Android's extra font
// padding so labels sit centred in pills and buttons, and uses tabular digits for figures so numbers
// don't jitter while they count or tick.
//
// Web: react-native-web ignores `adjustsFontSizeToFit`, so a one-line figure would be cut with an
// ellipsis in the web preview where a phone shrinks it. On web a one-line Text with
// `adjustsFontSizeToFit` measures its own content (a DOM Range) against its box after every render and
// whenever its parent resizes, and scales its font size (and tracking) down — never below
// `minimumFontScale` — the way iOS / Android do. Nested runs follow the same factor (FitScaleContext;
// kit runs with their own size read it through useTextFitScale()).

import { createContext, type Ref, useContext, useLayoutEffect, useRef, useState } from 'react';
import { Platform, Text as RNText, StyleSheet, type StyleProp, type TextProps, type TextStyle } from 'react-native';

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

const WEB = Platform.OS === 'web';
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };
const ANDROID_PAD: TextStyle | null = Platform.OS === 'android' ? { includeFontPadding: false } : null;

/** The font-size factor a fitting parent Text applies (web only; always 1 on iOS / Android). */
const FitScaleContext = createContext(1);

/** The shrink factor of the fitting Text this run sits in (1 when none). For nested runs with their own `fontSize`. */
export function useTextFitScale(): number {
  return useContext(FitScaleContext);
}

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  color?: string;
  muted?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Tabular (fixed-width) digits — timers, clocks, amounts in rows, counts. display/hero always are. */
  tabular?: boolean;
  ref?: Ref<RNText>;
};

/** fontSize / letterSpacing of the resolved style times `s` (lineHeight stays, so the row never jumps). */
function scaled(style: StyleProp<TextStyle>, s: number): TextStyle | null {
  if (s >= 0.999) return null;
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const out: TextStyle = {};
  if (typeof flat.fontSize === 'number') out.fontSize = Math.round(flat.fontSize * s * 10) / 10;
  if (typeof flat.letterSpacing === 'number') out.letterSpacing = flat.letterSpacing * s;
  return out;
}

export function Text(props: AppTextProps) {
  if (WEB && props.adjustsFontSizeToFit && props.numberOfLines === 1) return <WebFitText {...props} />;
  return <BaseText {...props} />;
}

function BaseText({
  variant = 'body',
  color,
  muted,
  align,
  tabular,
  style,
  maxFontSizeMultiplier,
  fit = 1,
  ...rest
}: AppTextProps & { fit?: number }) {
  const parent = useContext(FitScaleContext);
  const figures = tabular || variant === 'display' || variant === 'hero';
  const base: StyleProp<TextStyle> = [
    typeScale[variant],
    ANDROID_PAD,
    { color: color ?? (muted ? palette.textMuted : palette.text) },
    figures ? TABULAR : null,
    align ? { textAlign: align } : null,
    style,
  ];
  const s = fit * parent;
  const node = <RNText maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE[variant]} {...rest} style={[base, scaled(base, s)]} />;
  return s < 0.999 && s !== parent ? <FitScaleContext.Provider value={s}>{node}</FitScaleContext.Provider> : node;
}

/** Web: shrink a one-line Text to fit its box (see the file header). */
function WebFitText({ minimumFontScale, ref: userRef, ...props }: AppTextProps) {
  const el = useRef<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);
  const state = useRef({ scale: 1, key: '', tries: 0 });
  const min = Math.min(1, Math.max(0.3, minimumFontScale ?? 0.5));

  const fit = () => {
    const node = el.current;
    if (!node || !node.isConnected || typeof document === 'undefined') return;
    const box = node.clientWidth;
    if (!box) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    const natural = range.getBoundingClientRect().width;
    const s = state.current.scale;
    // What we fit for: the text and the window. (Not our own box or our parent's: a shrink-wrapped box
    // changes with the scale itself, and keying on it would loop.)
    const key = `${node.textContent ?? ''}|${typeof window !== 'undefined' ? window.innerWidth : 0}`;
    const changed = key !== state.current.key;
    state.current.key = key;
    if (changed) state.current.tries = 0;
    if (natural > box + 0.5) {
      // Overflowing: shrink straight to the size that fits (natural width scales with the font size).
      if (state.current.tries > 3) return;
      state.current.tries += 1;
      const next = Math.max(min, Math.floor((box / (natural / s)) * 0.99 * 100) / 100);
      if (next < s - 0.004) setScale(next);
      return;
    }
    if (s >= 1) return;
    if (box > natural + 1) {
      // Room to spare inside our own box: grow back towards full size.
      const next = Math.min(1, Math.floor((box / (natural / s)) * 0.99 * 100) / 100);
      if (next > s + 0.004) setScale(next);
    } else if (changed) {
      // Shrink-wrapped and fitting: the content or the room changed, so measure again at full size.
      setScale(1);
    }
  };
  const fitRef = useRef<() => void>(() => {});

  // After every render: remember the applied scale, then check the fit again.
  useLayoutEffect(() => {
    state.current.scale = scale;
    fitRef.current = fit;
    fit();
  });

  useLayoutEffect(() => {
    const parent = el.current?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fitRef.current());
    ro.observe(parent);
    // Web fonts can land after the first measure.
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    fonts?.ready.then(() => fitRef.current()).catch(() => {});
    return () => ro.disconnect();
  }, []);

  const setRef = (node: RNText | null) => {
    el.current = node as unknown as HTMLElement | null;
    if (typeof userRef === 'function') userRef(node);
    else if (userRef && typeof userRef === 'object') (userRef as { current: RNText | null }).current = node;
  };

  return <BaseText {...props} ref={setRef} minimumFontScale={minimumFontScale} fit={scale} />;
}
