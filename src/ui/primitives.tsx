// Core building blocks shared by every screen (docs/DESIGN.md §6–7). Look: frosted-glass cards with a
// bright rim on a pearl canvas, charcoal for the main action, light tabular figures with greyed
// decimals, soft outlined status pills.
// Component names/props are a stable contract used by every feature — add props, never rename or
// remove them.

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDownRight, ArrowUpRight, ChevronDown, CloudOff, type LucideIcon } from 'lucide-react-native';
import { cloneElement, isValidElement, type ReactElement, type ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  type DimensionValue,
  Platform,
  type PressableProps,
  Text as RNText,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { authHeaders, isDemoSession } from '@/api/client';
import { DASH_URL } from '@/config';
import { font, gradient, type ModuleKey, moduleTone, motion, palette, radius, shadow, space, statusTone, type StatusTone, type as typeScale } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { hitSlopFor, useLayout } from '@/ui/layout';
import { PressableScale, useCountUp } from '@/ui/motion';
import { isDarkScheme, withAlpha } from '@/ui/surface';
import { Text } from '@/ui/text';

const IOS = Platform.OS === 'ios';
// Theme colours are read when these run (render time / a themedStyles factory), never frozen at load.
/** The glass card's whisper of shadow (iOS only). */
const iosShadow = () => (IOS ? shadow.soft : null);
/** The rim colour for glass on this platform (bright edge on iOS, hairline on Android). */
const rim = () => (IOS ? palette.glassEdge : palette.glassLine);

type IconProps = { color?: string; size?: number; strokeWidth?: number };

/** Re-colours / re-sizes an icon element (lucide or any component taking color/size). */
function tintIcon(icon: ReactNode, props: IconProps): ReactNode {
  if (!isValidElement(icon) || typeof icon.type === 'string') return icon;
  return cloneElement(icon as ReactElement<IconProps>, props);
}

// ── Frost (Payno) ────────────────────────────────────────────────────────────
/** Payno's very soft, wide shadow under frosted surfaces (iOS only — Android elevation on a
 * translucent fill looks muddy). */
export const FROST_SHADOW: ViewStyle | null = IOS
  ? {
      // A getter, so the colour follows the live theme (warm ink in light, pure black in dark).
      get shadowColor() {
        return shadow.soft.shadowColor;
      },
      shadowOpacity: 0.06,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 12 },
    }
  : null;

/**
 * The Payno frosted surface as a style: translucent white (`frost` 0.58 / `strong` 0.80 on iOS; one step
 * more body on Android, which has no blur or shadow), a bright 1 px rim (a hairline on Android) and
 * the soft wide shadow. Card tone="frost" / "frostStrong" and ListCard use it; spread it into any
 * frosted tile:  <View style={[frostSurface('strong'), { borderRadius: radius.lg }]} />
 */
export function frostSurface(strength: 'frost' | 'strong' = 'frost'): ViewStyle {
  const fill = strength === 'strong' ? (IOS ? palette.frostStrong : palette.glassStrong) : IOS ? palette.frost : palette.frostStrong;
  return { backgroundColor: fill, borderWidth: 1, borderColor: rim(), ...FROST_SHADOW };
}

// ── Card ─────────────────────────────────────────────────────────────────────
export type CardTone = 'surface' | 'frost' | 'frostStrong' | 'muted' | 'primary' | 'accent' | 'ink';

/** The dark hero gradient for tone primary / ink (read live: the brand hero is a touch quieter in dark mode). */
const heroGradient = (tone: 'primary' | 'ink'): [string, string] => (tone === 'primary' ? gradient.brand : gradient.brandDeep);

function cardSurface(tone: CardTone): ViewStyle {
  switch (tone) {
    case 'surface': // the default card is frosted (Payno)
    case 'frost':
      return frostSurface('frost');
    case 'frostStrong':
      return frostSurface('strong');
    case 'muted':
      // Light: a faint white veil with a bright rim. Dark: the recessed card colour with the glass hairline.
      return isDarkScheme()
        ? { backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.glassLine }
        : { backgroundColor: withAlpha(palette.surface, 0.34), borderWidth: 1, borderColor: withAlpha(palette.surface, 0.75) };
    case 'accent':
      return { backgroundColor: palette.surface, borderWidth: 1, borderColor: rim(), ...iosShadow() };
    case 'primary':
    case 'ink':
      return { backgroundColor: heroGradient(tone)[1], borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' };
  }
}

/**
 * Content card. Frosted (`surface`, the default, = `frost`: translucent white 0.58, bright rim, soft wide
 * shadow), `frostStrong` (0.80, for heroes and summaries), `muted`, solid white (`accent`), or the dark
 * hero (`primary` / `ink`, at most one per screen). Padding comes from useLayout(): 16/20 for light cards,
 * 20/24 for dark heroes. Never nest a Card inside a Card. A dark hero can carry a module's own
 * colours: `<Card tone="primary" gradient={moduleTone.pettyCash.gradient}>` (white text stays).
 */
export function Card({
  tone = 'surface',
  padded = true,
  gradient: colors,
  style,
  children,
  onPress,
  ...rest
}: ViewProps & { tone?: CardTone; padded?: boolean; onPress?: () => void; gradient?: readonly [string, string] }) {
  const { cardPad, heroPad } = useLayout();
  const dark = tone === 'primary' || tone === 'ink';
  const r = dark ? radius.xxl : radius.xl;
  const fill = dark ? (colors ?? heroGradient(tone as 'primary' | 'ink')) : null;
  const body = (
    <View
      {...rest}
      style={[{ borderRadius: r }, cardSurface(tone), fill && colors ? { backgroundColor: fill[1] } : null, padded && { padding: dark ? heroPad : cardPad }, style]}>
      {fill ? (
        <LinearGradient
          colors={fill}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: r }]}
          pointerEvents="none"
        />
      ) : null}
      {tone === 'primary' && !colors ? (
        // A soft glow of the logo gold rising from the bottom-right corner of the teal hero.
        <LinearGradient
          colors={gradient.glow}
          start={{ x: 0.35, y: 0.3 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: r }]}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} accessibilityRole="button">
      {body}
    </PressableScale>
  );
}

// ── Button ───────────────────────────────────────────────────────────────────
export type ButtonVariant = 'primary' | 'accent' | 'ink' | 'ghost' | 'danger' | 'onPrimary' | 'destructive' | 'text';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  /** An icon element without a colour (`<Plus />`); the Button sets its colour, size and stroke. */
  icon?: ReactNode;
  size?: ButtonSize;
  style?: StyleProp<ViewStyle>;
};

type ButtonLook = { bg: string; fg: string; border: string; pressed: string };

/** A variant's colours, read from the live theme at render time. */
function buttonLook(variant: ButtonVariant): ButtonLook {
  const dark = isDarkScheme();
  // A dark hairline in light mode, a light one in dark mode.
  const hairline = withAlpha(palette.ink, 0.08);
  switch (variant) {
    case 'accent':
      return { bg: palette.surface, fg: palette.ink, border: hairline, pressed: palette.surfaceMuted };
    case 'ghost':
      return dark
        ? { bg: palette.frost, fg: palette.text, border: palette.glassEdge, pressed: palette.frostStrong }
        : { bg: withAlpha(palette.surface, 0.55), fg: palette.text, border: IOS ? palette.glassEdge : hairline, pressed: withAlpha(palette.surface, 0.75) };
    case 'onPrimary':
      return { bg: 'rgba(255,255,255,0.12)', fg: palette.onPrimary, border: 'rgba(255,255,255,0.16)', pressed: 'rgba(255,255,255,0.20)' };
    case 'danger':
      return { bg: palette.surface, fg: palette.dangerInk, border: dark ? statusTone.failed.border : 'rgba(198,40,40,0.20)', pressed: palette.dangerSoft };
    case 'destructive':
      // White text needs a deep red fill: dangerInk in light, danger in dark (dangerInk is a light text red there).
      return dark
        ? { bg: palette.danger, fg: palette.onPrimary, border: palette.danger, pressed: '#A82020' }
        : { bg: palette.dangerInk, fg: palette.onPrimary, border: palette.dangerInk, pressed: '#A82020' };
    case 'text':
      // Brand-coloured TEXT: primaryText (the same vermilion in light, lifted for contrast in dark).
      return { bg: 'transparent', fg: palette.primaryText, border: 'transparent', pressed: 'transparent' };
    default: // 'primary', and 'ink' (legacy: same as primary)
      return { bg: palette.charcoal, fg: palette.onPrimary, border: palette.charcoal, pressed: palette.charcoalPressed };
  }
}

const BUTTON_SIZE = {
  lg: { minHeight: 52, padX: 24, icon: 18, gap: 8, hit: 0, label: 'bodyStrong', lineHeight: 20 },
  md: { minHeight: 44, padX: 16, icon: 18, gap: 8, hit: 2, label: 'bodyStrong', lineHeight: 20 },
  sm: { minHeight: 36, padX: 14, icon: 16, gap: 6, hit: 6, label: 'labelStrong', lineHeight: 18 },
} as const;

/**
 * Capsule button. Fill shows priority: `primary` (charcoal, the one main action on light surfaces) →
 * `accent` (white pill; the main action on a dark hero) → `ghost` / `text`. `onPrimary` is the
 * secondary inside a dark hero, `danger` a white pill with red text (Reject, Delete, Sign out) and
 * `destructive` (filled red) only for the confirm button inside a reason/confirm sheet.
 * Sizes lg 52 / md 44 / sm 36 (minHeight, so large text grows instead of clipping). The label is one
 * line and shrinks with the button; loading keeps the width and shows a centred spinner.
 * Put two buttons side by side only through <ActionRow>.
 */
export function Button({
  title,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  size = 'lg',
  onPressIn,
  onPressOut,
  ...rest
}: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const c = buttonLook(variant);
  const s = BUTTON_SIZE[size];
  const isText = variant === 'text';
  const blocked = !!(disabled || loading);
  const dimmed = !!disabled && !loading;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: blocked, busy: !!loading }}
      hitSlop={isText ? 2 : s.hit || undefined}
      scaleTo={isText || blocked ? 1 : 0.97}
      disabled={blocked}
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[
        styles.button,
        { minHeight: s.minHeight, paddingHorizontal: s.padX, backgroundColor: pressed && !isText ? c.pressed : c.bg, borderColor: c.border },
        isText && styles.textButton,
        (variant === 'accent' || variant === 'ghost') && !dimmed ? iosShadow() : null,
        dimmed && { opacity: 0.4 },
        isText && pressed && { opacity: 0.6 },
        style,
      ]}>
      <View style={[styles.buttonContent, { gap: s.gap }, loading && { opacity: 0 }]}>
        {tintIcon(icon, { color: c.fg, size: s.icon, strokeWidth: 2 })}
        <Text variant={s.label} color={c.fg} numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.buttonLabel, { lineHeight: s.lineHeight }]}>
          {title}
        </Text>
      </View>
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color={c.fg} />
        </View>
      ) : null}
    </PressableScale>
  );
}

// ── Round icon button (back on the left, bell/more on the right) ────────────
/**
 * Round icon-only button: 40 by default (52 next to an lg Button in a hero). The touch target is
 * padded to 48. Pass the icon as a child (20 px, strokeWidth 1.8, colour set by the caller) and
 * always an accessibilityLabel. `dot` shows an unread dot.
 */
export function IconButton({
  children,
  dot,
  tone = 'muted',
  size = 40,
  style,
  hitSlop,
  disabled,
  accessibilityLabel,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  dot?: boolean;
  tone?: 'muted' | 'surface' | 'onPrimary';
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  useEffect(() => {
    if (__DEV__ && !accessibilityLabel) console.warn('IconButton: add an accessibilityLabel (icon-only controls need one).');
  }, [accessibilityLabel]);
  const look: ViewStyle =
    tone === 'onPrimary'
      ? { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.16)' }
      : tone === 'surface'
        ? { backgroundColor: palette.surface, borderColor: rim(), ...iosShadow() }
        : { backgroundColor: palette.frost, borderColor: rim(), ...iosShadow() };
  const dotAt = Math.round(size * 0.15);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={hitSlop ?? hitSlopFor(size, 4)}
      scaleTo={disabled ? 1 : 0.92}
      disabled={disabled}
      {...rest}
      style={[
        { width: size, height: size, borderRadius: size / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
        look,
        disabled && { opacity: 0.4 },
        style,
      ]}>
      {children}
      {dot ? <View style={[styles.dot, { top: dotAt, right: dotAt }, tone === 'onPrimary' && { borderColor: palette.primary }]} /> : null}
    </PressableScale>
  );
}

// ── Pill selector ("This month ▾") ──────────────────────────────────────────
/** Small 36 dp pill that opens a picker (date pill on Home, "This month ▾"). Centred by default. */
export function PillButton({
  label,
  icon,
  chevron = true,
  onPress,
  tone = 'glass',
  style,
  accessibilityLabel,
}: {
  label: string;
  icon?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  tone?: 'glass' | 'onPrimary';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const dark = tone === 'onPrimary';
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      scaleTo={0.96}
      hitSlop={6}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.pillBtn, dark ? { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.16)' } : iosShadow(), style]}>
      {icon}
      <Text variant="labelStrong" color={dark ? palette.onPrimary : palette.text} numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ flexShrink: 1 }}>
        {label}
      </Text>
      {chevron ? <ChevronDown size={14} color={dark ? 'rgba(255,255,255,0.7)' : palette.textMuted} strokeWidth={2.4} /> : null}
    </PressableScale>
  );
}

/** "View all" — the outlined frosted pill in card / section headers (32 dp, 48 dp touch target). */
export function ViewAllPill({ label = 'View all', onPress, accessibilityLabel }: { label?: string; onPress?: () => void; accessibilityLabel?: string }) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.95}
      style={styles.viewAll}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}>
      <Text variant="label" color={palette.text} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Card title row: optional overline over a one-line heading, and at most one control on the right. */
export function CardHeader({ title, overline, right, onDark }: { title: string; overline?: string; right?: ReactNode; onDark?: boolean }) {
  return (
    <View style={styles.cardHeader}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {overline ? (
          <Text variant="label" color={onDark ? palette.onPrimaryMuted : palette.textMuted} numberOfLines={1}>
            {overline}
          </Text>
        ) : null}
        <Text variant="heading" color={onDark ? palette.onPrimary : palette.text} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

// ── Numbers: light tabular figures, small muted currency, greyed decimals ──
function splitNumber(v: number, decimals: number) {
  const safe = Number.isFinite(v) ? v : 0;
  const fixed = Math.abs(safe).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  return { sign: safe < 0 ? '-' : '', int: Number(int).toLocaleString('en-IN'), dec };
}

const LIGHT_ON_DARK = /^(#fff\b|#ffffff\b|white$|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i;

/**
 * A nested run inside a parent Text (no lineHeight of its own, so the parent line stays put). A run
 * with its own (smaller) `size` drops the parent's tight tracking — a giant numeral's −1.6 would
 * squash a 15 px unit ("days", "coins") and the ₹ against the digits.
 */
function Span({ color, size, family, children }: { color?: string; size?: number; family?: string; children: ReactNode }) {
  return <RNText style={{ color, fontSize: size, fontFamily: family, letterSpacing: size ? 0 : undefined }}>{children}</RNText>;
}

type FigureVariant = 'display' | 'hero' | 'title' | 'heading' | 'bodyStrong' | 'body';

/**
 * Money figure: "₹48,250.00" with the ₹ at 60 % size (≥ 24 px variants) and muted, greyed decimals,
 * tabular digits, one line that shrinks to fit (never wraps). Counts up on first show.
 * On dark cards pass `color={palette.onPrimary}` (or `onDark`).
 */
export function Amount({
  value,
  currency = '₹',
  decimals = 2,
  variant = 'display',
  color,
  mutedColor,
  animate = true,
  prefix,
  onDark,
  style,
}: {
  value: number;
  currency?: string;
  decimals?: number;
  variant?: FigureVariant;
  color?: string;
  /** Colour of the decimals. */
  mutedColor?: string;
  animate?: boolean;
  prefix?: string; // e.g. '+'
  onDark?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const shown = useCountUp(value, animate ? undefined : 0);
  const n = splitNumber(animate ? shown : value, decimals);
  const exact = splitNumber(value, decimals);
  const dark = onDark ?? (!!color && LIGHT_ON_DARK.test(color));
  const size = typeScale[variant].fontSize;
  const big = size >= 24;
  const curColor = dark ? palette.onPrimaryMuted : palette.textMuted;
  const decColor = mutedColor ?? (dark ? palette.onPrimaryFaint : big ? palette.textFaint : palette.textMuted);
  return (
    <Text
      variant={variant}
      color={color ?? (dark ? palette.onPrimary : undefined)}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      tabular
      accessibilityLabel={`${prefix ?? ''}${exact.sign}${currency}${exact.int}${exact.dec ? `.${exact.dec}` : ''}`}
      style={style}>
      {prefix}
      {n.sign}
      {currency ? (
        <Span color={curColor} size={big ? Math.round(size * 0.6) : undefined}>
          {currency}
        </Span>
      ) : null}
      {n.int}
      {n.dec ? <Span color={decColor}>.{n.dec}</Span> : null}
    </Text>
  );
}

/** A plain number with greyed decimals and a small muted unit: "38.5 h", "92 %". Counts up on first show. */
export function Metric({
  value,
  decimals = 0,
  unit,
  variant = 'display',
  color,
  animate = true,
  onDark,
  style,
}: {
  value: number;
  decimals?: number;
  unit?: string;
  variant?: 'display' | 'hero' | 'title' | 'heading';
  color?: string;
  animate?: boolean;
  onDark?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const shown = useCountUp(value, animate ? undefined : 0);
  const n = splitNumber(animate ? shown : value, decimals);
  const exact = splitNumber(value, decimals);
  const dark = onDark ?? (!!color && LIGHT_ON_DARK.test(color));
  const big = typeScale[variant].fontSize >= 24;
  const unitStyle = big ? typeScale.body : typeScale.label;
  return (
    <Text
      variant={variant}
      color={color ?? (dark ? palette.onPrimary : undefined)}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      tabular
      accessibilityLabel={`${exact.sign}${exact.int}${exact.dec ? `.${exact.dec}` : ''}${unit ? ` ${unit}` : ''}`}
      style={style}>
      {n.sign}
      {n.int}
      {n.dec ? <Span color={dark ? palette.onPrimaryFaint : big ? palette.textFaint : palette.textMuted}>.{n.dec}</Span> : null}
      {unit ? (
        <Span color={dark ? palette.onPrimaryMuted : palette.textMuted} size={unitStyle.fontSize} family={unitStyle.fontFamily}>
          {` ${unit}`}
        </Span>
      ) : null}
    </Text>
  );
}

// ── Status pill (Waiting / Done / Failed) ────────────────────────────────────
/** Outlined status pill: bright dot + the word in the accessible ink. Always carries a word. */
export function StatusPill({ label, tone, style }: { label: string; tone: StatusTone; style?: StyleProp<ViewStyle> }) {
  const t = statusTone[tone] ?? statusTone.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      <View style={[styles.pillDot, { backgroundColor: t.dot }]} />
      <Text variant="caption" color={t.fg} numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontFamily: font.semibold }}>
        {label}
      </Text>
    </View>
  );
}

// ── Delta (+5.2% ↗) ──────────────────────────────────────────────────────────
/** Signed percentage change with an arrow: ink green/red on light, soft green/red on dark. */
export function DeltaChip({ value, onDark }: { value: number; onDark?: boolean }) {
  const v = Number.isFinite(value) ? value : 0;
  const up = v >= 0;
  const fg = onDark ? (up ? '#8EE58D' : '#FF9C94') : up ? palette.successInk : palette.dangerInk;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <View style={styles.delta}>
      <Arrow size={14} color={fg} strokeWidth={2.4} />
      <Text variant="labelStrong" color={fg} tabular numberOfLines={1}>
        {up ? '+' : ''}
        {v.toFixed(1)}%
      </Text>
    </View>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────
// Initials without a photo get a module tone picked from the name, so one person always has the
// same colour and a list of people reads as colourful, not grey.
const AVATAR_TONES: ModuleKey[] = ['attendance', 'leave', 'pay', 'expenses', 'visitors', 'tasks', 'support', 'people', 'news', 'holidays', 'pettyCash', 'policies'];

/** The soft tint + ink for a name's initials (pure: same name, same colour). */
export function avatarTone(name?: string | null) {
  const key = (name || '').trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return moduleTone[AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length]!];
}

// `uri` may be an authenticated /api path (sends the bearer header) or a data:/https URL.
/** Round photo or initials. Sizes: 40 rows, 48 detail headers, 56 profile cards, 88 profile hero. */
export function Avatar({ name, uri, size = 40, ring = true }: { name?: string; uri?: string | null; size?: number; ring?: boolean }) {
  const initials =
    (name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '?';
  const inner = { width: size, height: size, borderRadius: size / 2 };
  // The ring: a bright white rim in light mode, a soft light veil in dark mode (never a white halo).
  const ringFill = isDarkScheme() ? palette.glassEdge : withAlpha(palette.surface, 0.85);
  const frame: ViewStyle = ring ? { padding: 2, borderRadius: size / 2 + 2, backgroundColor: ringFill, ...iosShadow() } : {};
  // Authenticated /api images can't load for the demo account (it has no real token): use initials.
  if (uri && (uri.startsWith('data:') || !isDemoSession())) {
    // The bearer token only ever goes to DASH itself — never to a third-party image host.
    const src = uri.startsWith('/api/') ? `${DASH_URL}${uri}` : uri;
    const toDash = src.startsWith(`${DASH_URL}/`);
    return (
      <View style={frame}>
        <Image
          source={src.startsWith('data:') ? { uri: src } : toDash ? { uri: src, headers: authHeaders() } : { uri: src }}
          style={inner}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      </View>
    );
  }
  const tone = avatarTone(name);
  return (
    <View style={frame}>
      <View style={[inner, { backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }]}>
        <Text
          variant="labelStrong"
          color={tone.fg}
          maxFontSizeMultiplier={1}
          style={{ fontSize: Math.max(11, size * 0.34), lineHeight: Math.max(14, size * 0.42) }}>
          {initials}
        </Text>
      </View>
    </View>
  );
}

/** Overlapping avatars with a "+N" disc: `<AvatarStack people={[{ name, uri }]} max={5} size={32} />`. */
export function AvatarStack({
  people,
  max = 5,
  size = 32,
  style,
}: {
  people: { name?: string; uri?: string | null }[];
  max?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const list = Array.isArray(people) ? people : [];
  const shown = list.slice(0, Math.max(1, max));
  const extra = list.length - shown.length;
  const outer = size + 4;
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center' }, style]}
      accessible
      accessibilityLabel={`${list.length} ${list.length === 1 ? 'person' : 'people'}`}>
      {shown.map((p, i) => (
        <View key={i} style={[styles.stackRing, { borderRadius: outer / 2, marginLeft: i ? -8 : 0 }]}>
          <Avatar name={p.name} uri={p.uri} size={size} ring={false} />
        </View>
      ))}
      {extra > 0 ? (
        <View style={[styles.stackRing, styles.stackMore, { width: outer, height: outer, borderRadius: outer / 2, marginLeft: shown.length ? -8 : 0 }]}>
          <Text variant="micro" color={palette.ink} maxFontSizeMultiplier={1}>
            +{extra}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Round icon action with a caption under it (call, email, WhatsApp, copy on profiles). Up to 4 in a
 * row with justifyContent 'space-around'. Hide an action when its data is missing.
 */
export function IconAction({
  icon: Icon,
  label,
  onPress,
  tone = 'surface',
  size = 48,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  tone?: 'surface' | 'primary' | 'onPrimary';
  size?: number;
  disabled?: boolean;
}) {
  const look: ViewStyle =
    tone === 'primary'
      ? { backgroundColor: palette.charcoal, borderColor: palette.charcoal }
      : tone === 'onPrimary'
        ? { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.16)' }
        : { backgroundColor: palette.surface, borderColor: rim(), ...iosShadow() };
  const iconColor = tone === 'surface' ? palette.text : palette.onPrimary;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || !onPress}
      scaleTo={0.94}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.iconAction, { minWidth: size, maxWidth: size + 40 }, disabled && { opacity: 0.4 }]}>
      <View style={[styles.iconActionCircle, { width: size, height: size, borderRadius: size / 2 }, look]}>
        <Icon size={size >= 52 ? 22 : 20} color={iconColor} strokeWidth={1.8} />
      </View>
      <Text
        variant="caption"
        align="center"
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        color={tone === 'onPrimary' ? palette.onPrimaryMuted : palette.text}
        style={{ fontFamily: font.medium }}>
        {label}
      </Text>
    </PressableScale>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
/** Skeleton block colour: a faint ink wash in light mode, the hairline tone (shows on cards and canvas) in dark. */
const skeletonFill = () => (isDarkScheme() ? palette.hairline : withAlpha(palette.ink, 0.07));

/** Loading placeholder that mirrors the final shape. Pulses 0.45 ↔ 0.9 (1.4 s); static with Reduce Motion. */
export function Skeleton({
  width,
  height,
  style,
  radius: r,
}: {
  width?: DimensionValue;
  height: number;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 0.6 : 0.45);
  useEffect(() => {
    if (reduced) {
      opacity.set(0.6);
      return;
    }
    opacity.set(withRepeat(withSequence(withTiming(0.9, { duration: 700 }), withTiming(0.45, { duration: 700 })), -1, false));
    return () => cancelAnimation(opacity);
  }, [reduced, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: width ?? '100%', height, borderRadius: r ?? radius.sm, backgroundColor: skeletonFill() }, style, animated]}
    />
  );
}

// ── Empty / error states ─────────────────────────────────────────────────────
/**
 * Empty list / nothing-here state: 64 dp icon circle, a heading, a short muted message (write it to
 * fit 2 lines, ~90 characters; up to `messageLines` are shown so nothing important is ever cut) and at
 * most one action — a `<Button size="md" variant="accent" />`.
 */
export function EmptyState({
  title,
  message,
  icon,
  action,
  messageLines = 4,
  style,
}: {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
  messageLines?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.empty, style]}>
      {icon ? (
        <View style={styles.emptyIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {/* An icon passed without a colour gets the muted ink (an uncoloured SVG icon draws black, which vanishes in dark mode). */}
          {tintIcon(icon, isValidElement<IconProps>(icon) && icon.props.color ? { size: 28 } : { size: 28, color: palette.textMuted })}
        </View>
      ) : null}
      <Text variant="heading" align="center" accessibilityRole="header">
        {title}
      </Text>
      {message ? (
        <Text variant="label" muted align="center" numberOfLines={messageLines} style={{ maxWidth: 300 }}>
          {message}
        </Text>
      ) : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

/** Load failure: neutral icon, "Couldn't load this", the server's message (3 lines) and "Try again". */
export function ErrorState({ message, onRetry, title = 'Couldn’t load this' }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <EmptyState
      icon={<CloudOff color={palette.textMuted} strokeWidth={1.8} />}
      title={title}
      message={message || 'Something went wrong. Check your connection and try again.'}
      messageLines={3}
      action={onRetry ? <Button title="Try again" variant="accent" size="md" onPress={onRetry} /> : undefined}
    />
  );
}

/** A horizontal row with centred items. */
export function Row({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[{ flexDirection: 'row', alignItems: 'center' }, style]} />;
}

const styles = themedStyles(() => ({
  button: {
    borderRadius: radius.pill,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    maxWidth: '100%',
    flexShrink: 1,
  },
  textButton: { minHeight: 44, paddingHorizontal: 12, alignSelf: 'flex-start' },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 1, minWidth: 0 },
  buttonLabel: { flexShrink: 1 },
  spinner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.dangerInk,
    borderWidth: 2,
    borderColor: palette.canvasTop,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    maxWidth: '100%',
    paddingHorizontal: 14,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: isDarkScheme() ? palette.frostStrong : withAlpha(palette.surface, 0.7),
    borderWidth: 1,
    borderColor: rim(),
  },
  viewAll: {
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isDarkScheme() ? palette.glassEdge : withAlpha(palette.ink, 0.09),
    backgroundColor: isDarkScheme() ? palette.frost : withAlpha(palette.surface, 0.5),
    flexShrink: 0,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headerRight: { flexDirection: 'row', gap: space.xs, alignItems: 'center', flexShrink: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 24,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', flexShrink: 0 },
  stackRing: { borderWidth: 2, borderColor: palette.canvasTop, backgroundColor: palette.canvasTop },
  stackMore: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  iconAction: { alignItems: 'center', gap: space.xs },
  iconActionCircle: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: space.xs, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: IOS ? palette.glass : palette.glassAndroid,
    borderWidth: 1,
    borderColor: rim(),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  emptyAction: { marginTop: space.xs, alignSelf: 'stretch', alignItems: 'center' },
}));

// Kept for callers that want the motion constants without importing tokens directly.
export { font, motion };
