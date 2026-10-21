// Code and amount entry (docs/REFERENCE-COMPONENTS.md #25–27, Payno "Verify OTP" and "Send money"):
//   OtpBoxes        six separate rounded frost boxes; the active one has a brand rim and a blinking caret
//   NumericKeypad   4×3 frosted glass keys (1–9, optional ".", 0, ⌫ — long-press clears), white digits
//   KeypadWash      the deep wash the keypad sits on: transparent → gradient.brandDeep, pads the home indicator
//   AmountEntry     muted label, giant light amount (superscript ₹, greyed paise, blinking caret), helper chip
//   useAmountKeypad wires a NumericKeypad to an AmountEntry's string value (max, decimals)
//   useCodeKeypad   wires a NumericKeypad to OtpBoxes (length, onComplete)
// nextAmount / nextCode are the pure key → value rules behind the two hooks. Keys tick with a selection
// haptic. With Reduce Motion the carets stop blinking.

import { LinearGradient } from 'expo-linear-gradient';
import { Info, type LucideIcon } from 'lucide-react-native';
import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, type StyleProp, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { currentColorScheme, font, gradient, palette, radius, shadow, space, type as typeScale } from '@/theme/tokens';
import { FieldMessage } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { shouldStack, useLayout } from '@/ui/layout';
import { PressableScale } from '@/ui/motion';
import { useSurface } from '@/ui/surface';
import { Text } from '@/ui/text';

import { themedStyles } from '@/theme/themed';
type TextInputRef = ComponentRef<typeof TextInput>;

const IOS = Platform.OS === 'ios';
/** The frosted rim: a bright edge on iOS, a hairline on Android (read in the themedStyles factory). */
const rim = () => (IOS ? palette.glassEdge : palette.glassLine);

// ── Blinking caret ───────────────────────────────────────────────────────────
/** A 2 dp brand caret that blinks (530 ms on / off); steady with Reduce Motion or when `blink` is false. */
function Caret({ height, blink = true, color = palette.primaryText }: { height: number; blink?: boolean; color?: string }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced || !blink) {
      cancelAnimation(opacity);
      opacity.set(1);
      return;
    }
    opacity.set(
      withRepeat(withSequence(withTiming(1, { duration: 530 }), withTiming(0, { duration: 1, easing: Easing.linear }), withTiming(0, { duration: 529 }), withTiming(1, { duration: 1 })), -1),
    );
    return () => cancelAnimation(opacity);
  }, [reduced, blink, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View pointerEvents="none" style={[{ width: 2, height, borderRadius: 1, backgroundColor: color }, style]} />;
}

// ── OtpBoxes ─────────────────────────────────────────────────────────────────
export type OtpBoxesProps = {
  value: string;
  onChange: (code: string) => void;
  /** Number of boxes (default 6). */
  length?: number;
  /** Called once the last digit is entered. */
  onComplete?: (code: string) => void;
  /**
   * The code is typed on a NumericKeypad: the active box and caret stay lit without the system
   * keyboard, and nothing auto-focuses. Tapping the boxes still opens the system keyboard, so paste and
   * SMS / one-time-code autofill keep working.
   */
  withKeypad?: boolean;
  /** Focus the hidden input on mount (default: true unless `withKeypad`). */
  autoFocus?: boolean;
  /** Wrong code: every box gets a red rim. */
  error?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/**
 * Six separate rounded boxes backed by one hidden TextInput (textContentType oneTimeCode /
 * autoComplete sms-otp), so paste and the OS's code autofill both work. Empty boxes are white frost,
 * filled ones solid white with the digit, the active one has a brand rim and a blinking caret.
 *   <OtpBoxes value={code} onChange={setCode} onComplete={verify} withKeypad />
 */
export function OtpBoxes({ value, onChange, length = 6, onComplete, withKeypad, autoFocus, error, disabled, accessibilityLabel = 'One-time code' }: OtpBoxesProps) {
  const ref = useRef<TextInputRef>(null);
  const [focused, setFocused] = useState(false);
  const [rowW, setRowW] = useState(0);
  const code = (value ?? '').replace(/\D/g, '').slice(0, length);
  const lit = (focused || !!withKeypad) && !disabled;
  const activeAt = Math.min(code.length, length - 1);
  const complete = code.length >= length;
  // Boxes are square up to 56 dp and shrink to fit the row (gap 8); radius and digit follow the size,
  // so small boxes on a 320 dp phone stay rounded squares, not circles.
  const box = rowW > 0 ? Math.min(56, (rowW - space.xs * (length - 1)) / length) : 48;
  // Payno's boxes are rounded squares (radius ≈ a fifth of the side): 12 at 56 dp.
  const boxRadius = Math.min(radius.sm, Math.round(box * 0.22));
  const digitSize = box < 42 ? 20 : box < 50 ? 22 : 24;

  const set = (t: string) => {
    const next = t.replace(/\D/g, '').slice(0, length);
    onChange(next);
    if (next.length === length && code.length !== length) onComplete?.(next);
  };

  return (
    <Pressable
      onPress={() => ref.current?.focus()}
      disabled={disabled}
      onLayout={(e) => setRowW(Math.round(e.nativeEvent.layout.width))}
      style={[styles.otpRow, disabled && { opacity: 0.5 }]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}, ${code.length} of ${length} digits entered`}
      accessibilityHint="Double-tap to type the code with the keyboard"
      accessibilityState={{ disabled: !!disabled }}>
      {Array.from({ length }).map((_, i) => {
        const ch = code[i] ?? '';
        const active = lit && i === activeAt && !(complete && i === length - 1 && !!ch && !focused);
        return (
          <View
            key={i}
            style={[styles.otpBox, { borderRadius: boxRadius }, ch ? styles.otpBoxFilled : styles.otpBoxEmpty, active && styles.otpBoxActive, error && styles.otpBoxError]}>
            {ch ? (
              <Text variant="title" tabular maxFontSizeMultiplier={1.1} style={{ fontSize: digitSize, lineHeight: digitSize + 6 }}>
                {ch}
              </Text>
            ) : null}
            {active && !ch ? <Caret height={digitSize + 2} color={error ? palette.dangerInk : palette.primaryText} /> : null}
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={code}
        onChangeText={set}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus ?? !withKeypad}
        editable={!disabled}
        caretHidden
        keyboardAppearance={currentColorScheme() === 'dark' ? 'dark' : 'light'}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

// ── NumericKeypad ────────────────────────────────────────────────────────────
export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back' | 'clear';

const ROWS: (KeypadKey | null)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

export type NumericKeypadProps = {
  onKey: (key: KeypadKey) => void;
  /** Show the "." key bottom-left (amounts). Without it the slot is blank (codes). */
  decimal?: boolean;
  /** `dark` (default): frosted glass keys with white digits, for a KeypadWash. `light`: white frost keys with ink digits on the canvas. */
  tone?: 'dark' | 'light';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * 4×3 frosted glass keypad (1–9, optional ".", 0, ⌫). ⌫ long-press sends 'clear'. Each press ticks a
 * selection haptic. Sit it on a <KeypadWash> at the bottom of the screen; keys are ≥ 48 dp everywhere.
 *   <KeypadWash><NumericKeypad onKey={onKey} decimal /></KeypadWash>
 */
export function NumericKeypad({ onKey, decimal, tone = 'dark', disabled, style }: NumericKeypadProps) {
  const { compact, height } = useLayout();
  const keyHeight = compact || height < 700 ? 52 : 56;
  const dark = tone !== 'light';
  const fg = dark ? palette.onPrimary : palette.ink;
  const press = (k: KeypadKey) => {
    haptic.select();
    onKey(k);
  };
  const rows: (KeypadKey | null)[][] = [...ROWS, [decimal ? '.' : null, '0', 'back']];
  return (
    <View style={[styles.pad, disabled && { opacity: 0.5 }, style]}>
      {rows.map((row, r) => (
        <View key={r} style={styles.padRow}>
          {row.map((k, c) =>
            k === null ? (
              <View key={c} style={[styles.key, { minHeight: keyHeight }, styles.keyBlank]} />
            ) : (
              <KeypadButton key={c} k={k} dark={dark} fg={fg} height={keyHeight} disabled={disabled} onPress={press} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function KeypadButton({ k, dark, fg, height, disabled, onPress }: { k: KeypadKey; dark: boolean; fg: string; height: number; disabled?: boolean; onPress: (k: KeypadKey) => void }) {
  const [pressed, setPressed] = useState(false);
  const back = k === 'back';
  const label = back ? 'Delete' : k === '.' ? 'Decimal point' : k;
  return (
    <PressableScale
      scaleTo={0.95}
      disabled={disabled}
      onPress={() => onPress(k)}
      onLongPress={back ? () => onPress('clear') : undefined}
      delayLongPress={450}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="keyboardkey"
      accessibilityLabel={label}
      accessibilityHint={back ? 'Long-press to clear everything' : undefined}
      accessibilityActions={back ? [{ name: 'longpress', label: 'Clear everything' }] : undefined}
      onAccessibilityAction={back ? (e) => e.nativeEvent.actionName === 'longpress' && onPress('clear') : undefined}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.key,
        { minHeight: height },
        dark ? styles.keyDark : styles.keyLight,
        pressed && (dark ? styles.keyDarkPressed : styles.keyLightPressed),
      ]}>
      {back ? (
        <BackspaceGlyph color={fg} knockout={dark ? gradient.brandDeep[0] : palette.surface} />
      ) : (
        <Text variant="title" color={fg} align="center" tabular maxFontSizeMultiplier={1.2} style={styles.keyLabel}>
          {k === '.' ? '·' : k}
        </Text>
      )}
    </PressableScale>
  );
}

/** Payno's ⌫: a solid tag in the digit colour with the × knocked out in the key's backdrop colour. */
function BackspaceGlyph({ color, knockout }: { color: string; knockout: string }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24">
      <Path
        d="M10 5.5a2 2 0 0 0-1.34.52l-5.8 5.26a1 1 0 0 0 0 1.48l5.8 5.22A2 2 0 0 0 10 18.5h9.5a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z"
        fill={color}
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <Path d="M12.25 9.25l5.5 5.5M17.75 9.25l-5.5 5.5" stroke={knockout} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

// ── KeypadWash ───────────────────────────────────────────────────────────────
/**
 * The deep wash a NumericKeypad sits on at the bottom of a screen (Payno's keypad wash): it eases in
 * from transparent over `fade` dp (default 128), so the top keys sit on a slightly softer tone, reaches
 * gradient.brandDeep a little below them and deepens to the wine stop at the bottom. Pads the sides
 * with the gutter and the bottom for the home indicator (`safeArea`, default true). The one dark
 * element on its screen.
 */
export function KeypadWash({ children, fade = 128, safeArea = true, style }: { children: ReactNode; fade?: number; safeArea?: boolean; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const [h, setH] = useState(0);
  const [deepTop, deepBottom] = gradient.brandDeep;
  // An ease-in ramp of the deep colour's alpha (0 → 6 → 22 → 50 → 85 → 100 %), so the edge is long and
  // soft and never turns muddy; the top keys sit on ≥ 85 % (white digits stay ≥ 4.5:1).
  const fadeStop = h > 0 ? Math.min(0.6, fade / h) : 0.3;
  return (
    <View
      onLayout={(e) => setH(Math.round(e.nativeEvent.layout.height))}
      style={[{ paddingTop: fade, paddingHorizontal: gutter, paddingBottom: safeArea ? Math.max(insets.bottom, space.md) : space.md }, style]}>
      <LinearGradient
        colors={[`${deepTop}00`, `${deepTop}0F`, `${deepTop}38`, `${deepTop}80`, `${deepTop}D9`, deepTop, deepBottom]}
        locations={[0, fadeStop * 0.3, fadeStop * 0.55, fadeStop * 0.8, fadeStop, fadeStop + (1 - fadeStop) * 0.25, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

// ── Code entry on the keypad ─────────────────────────────────────────────────
/** The next code after a key press: digits append up to `length`, ⌫ removes one, long-press clears. */
export function nextCode(value: string, key: KeypadKey, length = 6): string {
  const v = (value ?? '').replace(/\D/g, '').slice(0, length);
  if (key === 'clear') return '';
  if (key === 'back') return v.slice(0, -1);
  if (key === '.') return v;
  return v.length >= length ? v : `${v}${key}`;
}

/**
 * Wires a NumericKeypad to OtpBoxes: `onComplete` runs once when the last digit is typed.
 *   const keypad = useCodeKeypad(code, setCode, { onComplete: verify });
 *   <OtpBoxes value={code} onChange={setCode} onComplete={verify} withKeypad />
 *   <KeypadWash><NumericKeypad onKey={keypad.onKey} /></KeypadWash>
 */
export function useCodeKeypad(value: string, setValue: (v: string) => void, { length = 6, onComplete }: { length?: number; onComplete?: (code: string) => void } = {}) {
  const onKey = (key: KeypadKey) => {
    const next = nextCode(value, key, length);
    if (next === value) return;
    setValue(next);
    if (next.length === length && value.length < length) onComplete?.(next);
  };
  return { onKey, complete: (value ?? '').length >= length };
}

// ── Amount entry ─────────────────────────────────────────────────────────────
const INT_MAX_DIGITS = 9;

/**
 * The next amount string after a key press, or null when the key is rejected (too many decimals,
 * a second ".", over `max`, or more than 9 whole digits). Pure — safe to unit-test.
 */
export function nextAmount(value: string, key: KeypadKey, { max, decimals = 2 }: { max?: number; decimals?: number } = {}): string | null {
  const v = value ?? '';
  if (key === 'clear') return '';
  if (key === 'back') return v.slice(0, -1);
  let next: string;
  if (key === '.') {
    if (decimals <= 0 || v.includes('.')) return null;
    next = v === '' ? '0.' : `${v}.`;
  } else {
    const [int, dec] = v.split('.');
    if (dec !== undefined && dec.length >= decimals) return null;
    if (dec === undefined && (int?.length ?? 0) >= INT_MAX_DIGITS) return null;
    next = v === '0' ? key : `${v}${key}`;
  }
  if (max != null && Number(next) > max) return null;
  return next;
}

/** Number value of an AmountEntry string ('' → 0, '12.' → 12). */
export function amountValue(value: string): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Wires a NumericKeypad to an AmountEntry's string value. Rejected keys (over `max`, too many
 * decimals) give a warning haptic instead of changing the value.
 *   const [amount, setAmount] = useState('');
 *   const keypad = useAmountKeypad(amount, setAmount, { max: 25000 });
 *   <AmountEntry value={amount} … />  <NumericKeypad onKey={keypad.onKey} decimal={keypad.decimal} />
 */
export function useAmountKeypad(value: string, setValue: (v: string) => void, { max, decimals = 2 }: { max?: number; decimals?: number } = {}) {
  const onKey = (key: KeypadKey) => {
    const next = nextAmount(value, key, { max, decimals });
    if (next === null) {
      haptic.warning();
      return;
    }
    if (next !== value) setValue(next);
  };
  const amount = amountValue(value);
  return { onKey, decimal: decimals > 0, amount, atMax: max != null && amount >= max };
}

/** "123456.5" → { int: '1,23,456', dec: '5', dot: true } (Indian grouping). */
function splitAmount(value: string) {
  const v = value ?? '';
  const dot = v.includes('.');
  const [rawInt = '', dec = ''] = v.split('.');
  const intNum = Number(rawInt || 0);
  const int = rawInt === '' ? '' : Number.isFinite(intNum) ? intNum.toLocaleString('en-IN') : rawInt;
  return { int, dec, dot };
}

export type AmountEntryProps = {
  /** The raw amount string ('', '250', '250.5'); drive it with useAmountKeypad. */
  value: string;
  /** Muted label at the top-left ("Enter amount"). */
  label?: string;
  /** Prefix shown as a small superscript (default ₹). */
  currency?: string;
  /** Paise digits; missing ones are shown greyed (default 2, 0 for whole rupees). */
  decimals?: number;
  /** Top-right slot (a PillSelector / PillButton, "INR"). */
  right?: ReactNode;
  /** Helper chip text under the amount ("Paid with your May salary"). */
  helper?: string;
  /** Helper chip icon (default ⓘ). */
  helperIcon?: LucideIcon;
  /** Right meta inside the helper chip ("Limit ₹25,000"). */
  meta?: string;
  /** Blinking caret after the typed digits (default true). */
  caret?: boolean;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
};

/**
 * Payno "Enter Amount": a frosted card with a muted label (and a right slot), a giant light amount —
 * superscript ₹, typed digits in ink, greyed placeholder paise, a blinking brand caret — and a helper
 * chip with right meta. Controlled by a string value; the figure shrinks to fit a 320 dp phone.
 *   <AmountEntry label="Claim amount" value={amount} helper="Reimbursed with salary" meta="Limit ₹25,000" />
 */
export function AmountEntry({ value, label = 'Enter amount', currency = '₹', decimals = 2, right, helper, helperIcon: HelperIcon = Info, meta, caret = true, error, style }: AmountEntryProps) {
  const l = useLayout();
  const surface = useSurface();
  const { int, dec, dot } = splitAmount(value);
  const empty = int === '' && !dot;
  const whole = int === '' && dot ? '0' : int;
  // While typing: what was typed in ink, then the missing paise greyed ("250" + ".00"). A read-only
  // figure (caret off) greys all of its paise, Lendora style ("2,349" + ".50"). Empty: a greyed "0.00".
  const paise = decimals > 0 ? `.${dec.padEnd(decimals, '0').slice(0, Math.max(decimals, dec.length))}` : '';
  const ghostDec = decimals > 0 ? '0'.repeat(Math.max(0, decimals - dec.length)) : '';
  const ghost = empty
    ? decimals > 0
      ? `0.${'0'.repeat(decimals)}`
      : '0'
    : !caret
      ? paise
      : `${dot || decimals === 0 ? '' : '.'}${ghostDec}`;
  const typed = empty ? '' : !caret ? whole : `${whole}${dot ? `.${dec}` : ''}`;

  // Size the figure so the whole amount fits the measured line (≥ 36, the numeral floor). Plus Jakarta
  // ExtraLight: tabular digits 0.60 em, "," and "." 0.26 em, the ₹ superscript (0.4 × size) 0.68 em.
  const [lineW, setLineW] = useState(0);
  const scale = Math.min(l.fontScale, 1.1);
  const shown = `${typed}${ghost}`;
  const digits = Math.max(4, (shown.match(/\d/g) ?? []).length);
  const punct = (shown.match(/[.,]/g) ?? []).length;
  const room = (lineW > 0 ? lineW : l.width - 2 * l.gutter - 2 * l.cardPad) - (caret ? 12 : 8);
  const fit = (room + 1.6 * shown.length * scale) / (scale * (0.6 * digits + 0.26 * punct) + 0.4 * 0.68);
  const size = Math.round(Math.max(36, Math.min(56, fit * 0.96)));
  const figure = { ...typeScale.numeral, fontSize: size, lineHeight: Math.round(size * 1.14) };
  const supSize = Math.max(16, Math.round(size * 0.4));
  const spoken = `${label}: ${currency}${whole || '0'}${dec ? `.${dec}` : ''}`;
  const stackChip = shouldStack(l, { below: 'narrow' });

  return (
    <View
      style={[styles.amountCard, surface === 'sheet' ? styles.amountCardSheet : styles.amountCardFrost, { padding: l.cardPad }, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={spoken}
      accessibilityLiveRegion="polite">
      <View style={styles.amountHead}>
        <Text variant="label" muted numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>
          {label}
        </Text>
        {right ? <View style={{ flexShrink: 0 }}>{right}</View> : null}
      </View>
      <View style={styles.amountLine} onLayout={(e) => setLineW(Math.round(e.nativeEvent.layout.width))}>
        <Text
          maxFontSizeMultiplier={1}
          style={[styles.sup, { fontSize: supSize, lineHeight: supSize + 4, marginTop: Math.round(size * 0.14) }, typed ? null : { color: palette.textFaint }]}>
          {currency}
        </Text>
        {typed ? (
          <Text variant="numeral" tabular numberOfLines={1} maxFontSizeMultiplier={1.1} style={[figure, styles.shrink]}>
            {typed}
          </Text>
        ) : null}
        {caret ? (
          <View style={[styles.caretSlot, { height: figure.lineHeight }]}>
            <Caret height={Math.round(size * 0.8)} />
          </View>
        ) : null}
        {ghost ? (
          <Text variant="numeral" tabular numberOfLines={1} maxFontSizeMultiplier={1.1} color={palette.textFaint} style={[figure, styles.shrink]}>
            {ghost}
          </Text>
        ) : null}
      </View>
      {helper || meta ? (
        <View style={[styles.chip, stackChip && styles.chipStacked]}>
          {helper ? (
            <View style={[styles.chipLeft, !stackChip && styles.chipLeftRow]}>
              <HelperIcon size={14} color={palette.textMuted} strokeWidth={1.8} />
              <Text variant="caption" muted numberOfLines={2} style={{ flexShrink: 1 }}>
                {helper}
              </Text>
            </View>
          ) : null}
          {meta ? (
            <Text variant="label" numberOfLines={1} style={stackChip ? null : styles.chipMeta}>
              {meta}
            </Text>
          ) : null}
        </View>
      ) : null}
      {error ? <FieldMessage error={error} /> : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  // OTP
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: space.xs, paddingVertical: space.xxs, alignSelf: 'stretch' },
  otpBox: {
    flex: 1,
    maxWidth: 56,
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxEmpty: { backgroundColor: palette.frost, borderColor: rim() },
  otpBoxFilled: { backgroundColor: palette.surface, borderColor: rim(), ...(IOS ? shadow.soft : null) },
  otpBoxActive: { backgroundColor: palette.frostStrong, borderColor: palette.primaryText, borderWidth: 1.5 },
  otpBoxError: { borderColor: palette.dangerInk, borderWidth: 1.5 },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1, left: 0, top: 0 },

  // Keypad
  pad: { gap: space.xs },
  padRow: { flexDirection: 'row', gap: space.xs },
  key: { flex: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  keyBlank: { borderColor: 'transparent' },
  keyDark: { backgroundColor: palette.frostOnDark, borderColor: palette.frostEdgeOnDark },
  keyDarkPressed: { backgroundColor: palette.frostEdgeOnDark },
  keyLight: { backgroundColor: palette.frost, borderColor: rim(), ...(IOS ? shadow.soft : null) },
  keyLightPressed: { backgroundColor: palette.surface },
  keyLabel: { fontFamily: font.regular, fontSize: 24, lineHeight: 30 },

  // Amount
  amountCard: { borderRadius: radius.xl, borderWidth: 1, gap: space.sm },
  amountCardFrost: { backgroundColor: palette.frostStrong, borderColor: rim(), ...(IOS ? shadow.soft : null) },
  amountCardSheet: { backgroundColor: palette.surface, borderColor: palette.glassLine },
  amountHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 24 },
  amountLine: { flexDirection: 'row', alignItems: 'flex-start' },
  // Regular, not Light: the superscript is 16–22 px and Light is for ≥ 24 px only.
  sup: { fontFamily: font.regular, color: palette.textMuted, marginRight: 4 },
  shrink: { flexShrink: 1 },
  caretSlot: { justifyContent: 'center', marginHorizontal: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 40,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: palette.frost,
    borderWidth: 1,
    borderColor: rim(),
  },
  chipStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 2, borderRadius: radius.md },
  chipLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipLeftRow: { flex: 1, minWidth: 0 },
  chipMeta: { flexShrink: 0, textAlign: 'right' },
}));
