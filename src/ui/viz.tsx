// Data visualisation kit (docs/REFERENCE-COMPONENTS.md §2, items 16–23): Lendora's giant numerals and
// glowing charts and Payno Wallet's earning pills and striped limit bar — the components and ideas,
// drawn with react-native-svg in the Ember tokens (never the references' colours).
//   Numeral          giant ExtraLight figure: superscript prefix / unit, greyed decimals, a tiny delta
//                    arrow at the top right, a muted caption under it (NumeralRow: 2–3 that wrap)
//   GlowLineChart    smooth monotone line with a sunset → coral ramp along it, a soft wide halo, dashed
//                    guides with tiny y labels, dashed drop-lines and white floating point pills
//                    (AreaChart in charts.tsx draws with it)
//   PillBarChart     7 slim pills; the selected day a brand capsule with a white dot and a value pill,
//                    the rest frosted or hatched; a big figure with a small delta on the left
//   SparkCard        half-width frosted card: title, glowing squiggle with one dot + dotted drop-line,
//                    a 3-figure footer with the centre figure emphasised (sits in a TwoUp)
//   StripedProgress  striped (or solid brand) fill with a round % thumb riding its end, "used / total"
//   RankSlider       centred big rank with a small "No." prefix, a thin sunset track, a ▲ marker, end labels
//   RadialArc        270° gradient arc with a 15/45 centre fraction and legend dots under it
//   WashStatCard     gradient.sunsetLight card: giant Numeral, slider bar with a solid ▲ on it, 0 · 50 · 100 % ticks
// Everything sizes itself from onLayout (works at 320 dp), caps how far figures grow with large text,
// guards API data (NaN, missing arrays) and is one screen-reader stop with a spoken summary.

import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDown, ArrowRight, ArrowUp, TrendingDown, TrendingUp } from 'lucide-react-native';
import { type ReactNode, useEffect, useId, useState } from 'react';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  Platform,
  Text as RNText,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient as SvgGradient, Path, Pattern, Polygon, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { currentColorScheme, font, gradient, palette, radius, shadow, space, type as typeScale } from '@/theme/tokens';
import { haptic } from '@/ui/haptics';
import { shouldStack, useLayout } from '@/ui/layout';
import { GrowIn, PressableScale, useCountUp } from '@/ui/motion';
import { Text } from '@/ui/text';

import { themedStyles } from '@/theme/themed';
const IOS = Platform.OS === 'ios';
// Token reads live in functions (called from the themedStyles factory or at render), never in
// module-level constants, so they follow the light / dark switch.
/** The frosted rim: a bright edge on iOS, a hairline on Android. */
const rim = () => (IOS ? palette.glassEdge : palette.glassLine);
/** The soft shadow under white floating pills (point labels, tooltips, the % thumb). */
const pillShadow = (): ViewStyle =>
  IOS ? { shadowColor: shadow.soft.shadowColor, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } } : { elevation: 3 };
/** …and a hairline rim, so a white pill still reads on a white card where shadows don't render. */
const pillRim = (): ViewStyle => ({ borderWidth: StyleSheet.hairlineWidth, borderColor: palette.glassLine });
const isDark = () => currentColorScheme() === 'dark';
const AnimatedPath = Animated.createAnimatedComponent(Path);
const EASE_OUT = Easing.out(Easing.cubic);

// ── shared helpers ───────────────────────────────────────────────────────────

function useWidth() {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  return [w, onLayout] as const;
}

// An SVG id that is unique per chart instance, so two charts never share one gradient or pattern.
function useSvgId(prefix: string) {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

// API data is guarded so a missing array or a NaN never crashes a chart.
function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)) : [];
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

function unit01(v: number) {
  return Number.isFinite(v) ? clamp(v, 0, 1) : 0;
}

function fmtNumber(v: number | string) {
  return typeof v === 'number' ? (Number.isFinite(v) ? v.toLocaleString('en-IN') : '—') : v || '—';
}

// A colour part-way between two #RRGGBB tokens (dots take the ramp's colour where they sit).
function hexRgb(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** WCAG relative luminance of a #RRGGBB colour (null for anything else). */
function luminance(c: string): number | null {
  const rgb = hexRgb(c);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function mixColor(a: string, b: string, t: number) {
  const x = hexRgb(a);
  const y = hexRgb(b);
  if (!x || !y) return t < 0.5 ? a : b;
  const k = unit01(t);
  const c = x.map((v, i) => Math.round(v + (y[i]! - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

type Pt = { x: number; y: number };

// Monotone cubic interpolation (Fritsch–Carlson, as d3's curveMonotoneX): smooth, and it never
// overshoots the data, so a flat week stays flat and a peak is never drawn higher than it was.
function monotonePath(pts: Pt[]): string {
  const n = pts.length;
  if (!n) return '';
  if (n === 1) return `M ${pts[0]!.x} ${pts[0]!.y}`;
  if (n === 2) return `M ${pts[0]!.x} ${pts[0]!.y} L ${pts[1]!.x} ${pts[1]!.y}`;
  const sign = (v: number) => (v < 0 ? -1 : 1);
  const slope = (a: Pt, b: Pt) => (b.x - a.x === 0 ? 0 : (b.y - a.y) / (b.x - a.x));
  const t: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const h0 = pts[i]!.x - pts[i - 1]!.x;
    const h1 = pts[i + 1]!.x - pts[i]!.x;
    const s0 = slope(pts[i - 1]!, pts[i]!);
    const s1 = slope(pts[i]!, pts[i + 1]!);
    const p = h0 + h1 === 0 ? 0 : (s0 * h1 + s1 * h0) / (h0 + h1);
    t[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  const end = (a: Pt, b: Pt, tb: number) => {
    const h = b.x - a.x;
    return h ? (3 * (b.y - a.y)) / h / 2 - tb / 2 : tb;
  };
  t[0] = end(pts[0]!, pts[1]!, t[1]!);
  t[n - 1] = end(pts[n - 2]!, pts[n - 1]!, t[n - 2]!);
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = (b.x - a.x) / 3;
    d += ` C ${a.x + dx} ${a.y + dx * t[i]!}, ${b.x - dx} ${b.y - dx * t[i + 1]!}, ${b.x} ${b.y}`;
  }
  return d;
}

/**
 * Something small (a pill, a label) centred on an anchor point inside a chart: above it, below it, or
 * above unless that would leave the top ('auto'). It measures itself and stays inside `bounds`, and is
 * hidden until measured so it never flashes off-centre.
 */
function Anchored({
  x,
  y,
  bounds,
  place = 'auto',
  gap = 8,
  delay,
  children,
}: {
  x: number;
  y: number;
  bounds: number;
  place?: 'above' | 'below' | 'auto';
  gap?: number;
  delay?: number;
  children: ReactNode;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const above = place === 'above' || (place === 'auto' && y - gap - size.h >= 0);
  const left = clamp(x - size.w / 2, 0, Math.max(0, bounds - size.w));
  const top = above ? y - gap - size.h : y + gap;
  return (
    <Animated.View
      entering={delay != null ? FadeIn.delay(delay).duration(220) : undefined}
      pointerEvents="none"
      style={[styles.anchored, { left, top }]}>
      {/* Opacity on an inner view: the entering animation owns the outer one's. */}
      <View
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          const h = Math.round(e.nativeEvent.layout.height);
          if (w !== size.w || h !== size.h) setSize({ w, h });
        }}
        style={{ opacity: size.w ? 1 : 0 }}>
        {children}
      </View>
    </Animated.View>
  );
}

// ── Numeral ──────────────────────────────────────────────────────────────────

export type VizDirection = 'up' | 'down' | 'flat';
/** A change shown as a tiny arrow: its direction, whether it is good news, and words for screen readers. */
export type NumeralDelta = { direction: VizDirection; good?: boolean; label?: string };

/** Arrow ink: good news green, bad news red; otherwise up is the warm sunset and down red. */
function deltaInk(d: NumeralDelta, onDark?: boolean) {
  if (onDark) return palette.onPrimary;
  if (d.good === true) return palette.successInk;
  if (d.good === false) return palette.dangerInk;
  return d.direction === 'up' ? palette.sunset : d.direction === 'down' ? palette.dangerInk : palette.textFaint;
}
/** Text ink for a delta's words (sunset is never small text). */
function deltaTextInk(d: NumeralDelta) {
  if (d.good === true) return palette.successInk;
  if (d.good === false) return palette.dangerInk;
  return d.direction === 'down' ? palette.dangerInk : palette.textMuted;
}
function deltaSpoken(d: NumeralDelta) {
  const dir = d.direction === 'up' ? 'up' : d.direction === 'down' ? 'down' : 'no change';
  return d.label ? `${dir} ${d.label}` : dir;
}

type FigureParts = { int: string; dec: string; tail: string; spoken: string };

function autoDecimals(v: number) {
  if (Number.isInteger(v)) return 0;
  const s = String(v);
  const k = s.indexOf('.');
  return k < 0 ? 0 : Math.min(2, s.length - k - 1);
}

// 38.5 → "38" + ".5"; "7.3K" → "7" + ".3" + "K"; "15/45" → "15" + "/45". The decimals and the tail
// are greyed. A string that is not a figure is shown as it is.
function figureParts(value: number | string, decimals: number): FigureParts {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { int: '—', dec: '', tail: '', spoken: 'no value' };
    const fixed = Math.abs(value).toFixed(decimals);
    const [i, dec] = fixed.split('.');
    const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
    const int = `${sign}${Number(i).toLocaleString('en-IN')}`;
    return { int, dec: dec ? `.${dec}` : '', tail: '', spoken: `${int}${dec ? `.${dec}` : ''}` };
  }
  const s = String(value ?? '').trim() || '—';
  const m = /^(\D*?-?[\d,]+)(\.\d+)?(.*)$/.exec(s);
  if (!m) return { int: s, dec: '', tail: '', spoken: s };
  return { int: m[1]!, dec: m[2] ?? '', tail: m[3] ?? '', spoken: s };
}

// Lendora sets the tiny arrow a little apart from the figure (and its unit), level with the cap height.
const NUMERAL_SIZE = {
  lg: { figure: typeScale.numeral as TextStyle, sup: 'label' as const, supTop: 8, arrow: 18, arrowGap: space.xs, minScale: 36 / typeScale.numeral.fontSize },
  md: { figure: { fontSize: 36, lineHeight: 42, letterSpacing: -1.1 } as TextStyle, sup: 'caption' as const, supTop: 6, arrow: 15, arrowGap: 6, minScale: 1 },
};

export type NumeralProps = {
  value: number | string;
  /** A small superscript before the figure: '₹', '%', 'No.'. */
  prefix?: string;
  /** A small superscript after the figure: 'h', '%', 'days'. */
  unit?: string;
  /** Numbers: decimals to show (default: as many as the value has, at most 2); they are greyed. */
  decimals?: number;
  /** lg 48 (default) or md 36. */
  size?: 'lg' | 'md';
  /** A tiny coloured arrow at the top right. */
  delta?: NumeralDelta | null;
  caption?: string | null;
  /** White figure with faint decimals, for dark heroes. */
  onDark?: boolean;
  /** The figure's ink (defaults to palette.ink, or white on dark). */
  color?: string;
  align?: 'left' | 'center';
  /** Count up on first show (numbers only). Default true. */
  animate?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Lendora giant numeral: an ExtraLight figure (type.numeral, 48 or 36) with a small superscript
 * prefix / unit, greyed decimals, an optional tiny delta arrow at the top right (warm sunset up, red
 * down; green / red when you say whether it is `good`) and a muted caption under it. Never wraps; lg
 * shrinks to fit its width down to 36 px (the numeral's floor), md stays 36. Counts up on first show.
 *   <Numeral value={38.5} unit="h" delta={{ direction: 'up', label: '+2h 10m' }} caption="Hours this week" />
 *   <Numeral value={92.4} prefix="%" size="md" caption="Attendance" />
 */
export function Numeral({
  value,
  prefix,
  unit,
  decimals,
  size = 'lg',
  delta,
  caption,
  onDark,
  color,
  align = 'left',
  animate = true,
  accessibilityLabel,
  style,
}: NumeralProps) {
  const numeric = typeof value === 'number' && Number.isFinite(value);
  const target = numeric ? (value as number) : 0;
  const shown = useCountUp(target, numeric && animate ? undefined : 0);
  const d = clamp(Math.round(decimals ?? (numeric ? autoDecimals(target) : 0)), 0, 4);
  const parts = figureParts(numeric ? shown : value, d);
  const exact = figureParts(value, d);
  const s = NUMERAL_SIZE[size] ?? NUMERAL_SIZE.lg;
  const ink = color ?? (onDark ? palette.onPrimary : palette.ink);
  const faint = onDark ? palette.onPrimaryFaint : palette.textFaint;
  const supInk = onDark ? palette.onPrimaryMuted : palette.textMuted;
  const Arrow = delta ? (delta.direction === 'up' ? ArrowUp : delta.direction === 'down' ? ArrowDown : ArrowRight) : null;
  const spoken =
    accessibilityLabel ??
    [`${prefix ?? ''}${exact.spoken}${unit ? ` ${unit}` : ''}`, delta ? deltaSpoken(delta) : null, caption].filter(Boolean).join(', ');
  return (
    <View style={[align === 'center' ? styles.center : null, style]} accessible accessibilityRole="text" accessibilityLabel={spoken}>
      <View style={styles.numRow}>
        {prefix ? (
          <Text variant={s.sup} color={supInk} numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.sup, { marginTop: s.supTop, marginRight: 4 }]}>
            {prefix}
          </Text>
        ) : null}
        {/* Shrinks to fit, but never below 36 px (the ExtraLight numeral's floor): lg only. */}
        <Text
          variant="numeral"
          color={ink}
          numberOfLines={1}
          adjustsFontSizeToFit={s.minScale < 1}
          minimumFontScale={s.minScale}
          tabular
          style={[s.figure, styles.shrink]}>
          {parts.int}
          {parts.dec || parts.tail ? (
            <RNText style={{ color: faint }}>
              {parts.dec}
              {parts.tail}
            </RNText>
          ) : null}
        </Text>
        {unit ? (
          <Text variant={s.sup} color={supInk} numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.sup, { marginTop: s.supTop }]}>
            {unit}
          </Text>
        ) : null}
        {Arrow && delta ? (
          <View style={[styles.sup, { marginTop: s.supTop, marginLeft: s.arrowGap }]}>
            <Arrow size={s.arrow} color={deltaInk(delta, onDark)} strokeWidth={1.6} />
          </View>
        ) : null}
      </View>
      {caption ? (
        <Text variant="label" color={supInk} numberOfLines={2} align={align === 'center' ? 'center' : undefined}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** Two or three Numerals side by side (Lendora "Stable rate · Floating rate"), wrapping cleanly when narrow. */
export function NumeralRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.numeralRow, style]}>{children}</View>;
}

// ── GlowLineChart ────────────────────────────────────────────────────────────

/** A dashed horizontal guide: a value, or a value with its own tiny label. */
export type GlowGuide = number | { value: number; label?: string };

/** A labelled point: a dot, a dashed drop-line to the baseline and (with `value` / `label`) a white pill. */
export type GlowPoint = {
  index: number;
  /** The pill's figure, e.g. "8.2h". */
  value?: string;
  /** A short muted word after it, e.g. "Mon". */
  label?: string;
  /** A tiny arrow before the figure. */
  direction?: VizDirection;
  good?: boolean;
  /** Draw the dashed drop-line (default true). */
  drop?: boolean;
};

export type GlowLineChartProps = {
  values: number[];
  /** Muted x labels under the plot (the labelled points' in ink). */
  labels?: string[];
  guides?: GlowGuide[];
  /** Labels of numeric guides (default: the number). */
  formatGuide?: (v: number) => string;
  points?: GlowPoint[];
  /** The ramp along the line, left → right (default sunset → coral). */
  colors?: readonly [string, string];
  /** One colour instead of the ramp (a module tone). */
  color?: string;
  /** Height of the plot; x labels add 22 below it. */
  height?: number;
  /** Start the range at 0 (default: hug the data). */
  zeroBased?: boolean;
  /** A faint fill fading out under the line (default true). */
  fill?: boolean;
  /** Each point's words for screen readers (with `labels`). */
  formatValue?: (v: number, i: number) => string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Lendora glow chart: a smooth monotone line whose colour ramps along its length (sunset → coral), a
 * soft wide halo under it, dashed horizontal guides with tiny muted y labels, dashed drop-lines from
 * labelled points, white floating point pills with a soft shadow (arrow + figure + short label) and
 * muted x labels. Fills its width; the line draws in from the left once.
 *   <GlowLineChart values={hours} labels={days} guides={[8]} formatGuide={(v) => `${v}h`}
 *     points={[{ index: 1, value: '9.4h', label: 'Mon', direction: 'up' }]} />
 */
export function GlowLineChart({
  values: rawValues,
  labels: rawLabels,
  guides: rawGuides,
  formatGuide,
  points: rawPoints,
  colors,
  color,
  height = 160,
  zeroBased = false,
  fill = true,
  formatValue,
  accessibilityLabel,
  style,
}: GlowLineChartProps) {
  const [w, onLayout] = useWidth();
  const id = useSvgId('glow');
  const reveal = useSharedValue(0);
  const ready = w > 0;
  useEffect(() => {
    if (ready) reveal.set(withDelay(80, withTiming(1, { duration: 900, easing: EASE_OUT })));
  }, [ready, reveal]);
  const revealStyle = useAnimatedStyle(() => ({ width: reveal.get() * w }), [w]);

  const values = nums(rawValues);
  const labels = Array.isArray(rawLabels) ? rawLabels.map((t) => String(t ?? '')) : [];
  const n = values.length;
  const ramp: readonly [string, string] = color ? [color, color] : (colors ?? [palette.sunset, palette.coral]);
  const guides = (Array.isArray(rawGuides) ? rawGuides : [])
    .map((g) => (typeof g === 'number' ? { value: g, label: formatGuide ? formatGuide(g) : String(g) } : { value: g?.value, label: g?.label }))
    .filter((g): g is { value: number; label: string | undefined } => typeof g.value === 'number' && Number.isFinite(g.value));
  const points = (Array.isArray(rawPoints) ? rawPoints : []).filter((p) => p && Number.isInteger(p.index) && p.index >= 0 && p.index < n);
  const pilled = points.some((p) => p.value || p.label);
  const labelH = labels.length ? 22 : 0;
  const pointWords = points.map((p) => [labels[p.index], p.value, p.label].filter(Boolean).join(' ')).filter(Boolean);
  const spoken =
    accessibilityLabel ??
    (formatValue && labels.length === n && n > 0
      ? values.map((v, i) => `${labels[i]} ${formatValue(v, i)}`).join(', ')
      : pointWords.length
        ? pointWords.join(', ')
        : undefined);

  if (!n) return <View style={[{ height: height + labelH }, style]} />;

  const longest = guides.reduce((m, g) => Math.max(m, g.label ? g.label.length : 0), 0);
  const yLabelW = longest ? Math.ceil(longest * 6.2) + 6 : 0;
  const padL = yLabelW + 10;
  const padR = 12;
  const top = pilled ? 46 : 14;
  const bottom = 8;
  const base = height - bottom;
  const pool = [...values, ...guides.map((g) => g.value)];
  const dMax = Math.max(...pool);
  const dMin = Math.min(...pool);
  const spread = dMax - dMin || Math.abs(dMax) * 0.2 || 1;
  const lo = zeroBased ? Math.min(0, dMin) : dMin - spread * 0.18;
  let up = dMax + (dMax - lo) * 0.06;
  if (!(up > lo)) up = lo + 1;
  const plotW = Math.max(1, w - padL - padR);
  const xAt = (i: number) => (n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
  const yAt = (v: number) => top + (1 - (v - lo) / (up - lo)) * (base - top);
  const pts = n === 1 ? [{ x: padL, y: yAt(values[0]!) }, { x: padL + plotW, y: yAt(values[0]!) }] : values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const line = monotonePath(pts);
  const halo = monotonePath(pts.map((p) => ({ x: p.x, y: p.y + 8 })));
  const area =`${line} L ${pts[pts.length - 1]!.x} ${height} L ${pts[0]!.x} ${height} Z`;
  const rampAt = (x: number) => mixColor(ramp[0], ramp[1], (x - padL) / plotW);
  const marked = new Set(points.map((p) => p.index));

  // Thin the x labels when they would crowd (keep the labelled points').
  const slot = labels.length && w ? w / labels.length : 0;
  const every = slot > 0 && slot < 30 ? Math.ceil(30 / slot) : 1;
  const labelX = (i: number) =>
    labels.length === n ? xAt(i) : labels.length <= 1 ? padL + plotW / 2 : padL + (i / (labels.length - 1)) * plotW;

  return (
    <View
      onLayout={onLayout}
      style={[{ height: height + labelH }, style]}
      accessible={!!spoken}
      accessibilityRole={spoken ? 'image' : undefined}
      accessibilityLabel={spoken}>
      {ready ? (
        <>
          <Svg width={w} height={height} style={StyleSheet.absoluteFill}>
            {guides.map((g, k) => {
              const gy = yAt(g.value);
              return (
                <Line
                  key={`g${k}`}
                  x1={yLabelW ? yLabelW + 4 : 0}
                  x2={w}
                  y1={gy}
                  y2={gy}
                  stroke={palette.textFaint}
                  strokeOpacity={0.4}
                  strokeWidth={1}
                  strokeDasharray="4 6"
                />
              );
            })}
            {guides.map((g, k) =>
              g.label ? (
                <SvgText key={`t${k}`} x={0} y={yAt(g.value) + 4} fontSize={11} fill={palette.textMuted} fontFamily={font.regular}>
                  {g.label}
                </SvgText>
              ) : null,
            )}
          </Svg>
          <Animated.View style={[styles.revealLayer, { height }, revealStyle]}>
            <Svg width={w} height={height}>
              <Defs>
                <SvgGradient id={`${id}l`} x1={padL} y1={0} x2={padL + plotW} y2={0} gradientUnits="userSpaceOnUse">
                  <Stop offset="0" stopColor={ramp[0]} stopOpacity={1} />
                  <Stop offset="1" stopColor={ramp[1]} stopOpacity={1} />
                </SvgGradient>
                <SvgGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={ramp[1]} stopOpacity={0.09} />
                  <Stop offset="0.7" stopColor={ramp[0]} stopOpacity={0.02} />
                  <Stop offset="1" stopColor={ramp[0]} stopOpacity={0} />
                </SvgGradient>
              </Defs>
              {fill ? <Path d={area} fill={`url(#${id}f)`} /> : null}
              {/* Lendora's halo is a soft ribbon hanging just under the line: the same curve, wide and
                  faint and shifted down so its top edge rides the line, then a narrower glow on it. */}
              <Path d={halo} stroke={`url(#${id}l)`} strokeOpacity={0.1} strokeWidth={20} fill="none" strokeLinecap="butt" strokeLinejoin="round" />
              <Path d={line} stroke={`url(#${id}l)`} strokeOpacity={0.14} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={line} stroke={`url(#${id}l)`} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((p) => {
                const px = xAt(p.index);
                const py = yAt(values[p.index]!);
                const c = rampAt(px);
                return (
                  <G key={`p${p.index}`}>
                    {p.drop !== false ? (
                      <Line x1={px} x2={px} y1={py + 7} y2={base} stroke={palette.textFaint} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 5" />
                    ) : null}
                    <Circle cx={px} cy={py} r={9} fill={c} fillOpacity={0.2} />
                    <Circle cx={px} cy={py} r={4.5} fill={c} stroke={palette.surface} strokeWidth={2} />
                  </G>
                );
              })}
            </Svg>
          </Animated.View>
          {labels.length ? (
            <Svg width={w} height={labelH} style={[styles.abs, { top: height }]}>
              {labels.map((t, i) => {
                if (!marked.has(i) && i % every !== 0) return null;
                const half = (t.length * 6.4) / 2;
                const on = marked.has(i);
                return (
                  <SvgText
                    key={`${t}${i}`}
                    x={clamp(labelX(i), half, Math.max(half, w - half))}
                    y={15}
                    fontSize={11}
                    textAnchor="middle"
                    fill={on ? palette.text : palette.textMuted}
                    fontFamily={on ? font.medium : font.regular}>
                    {t}
                  </SvgText>
                );
              })}
            </Svg>
          ) : null}
          {points.map((p) =>
            p.value || p.label ? (
              <Anchored key={`pill${p.index}`} x={xAt(p.index)} y={yAt(values[p.index]!)} bounds={w} gap={12} delay={850}>
                <PointPill point={p} />
              </Anchored>
            ) : null,
          )}
        </>
      ) : null}
    </View>
  );
}

/** White floating pill on a chart point: arrow + figure + short muted label. */
function PointPill({ point }: { point: GlowPoint }) {
  const dir = point.direction;
  const Arrow = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : null;
  return (
    <View style={styles.pointPill}>
      {Arrow && dir ? <Arrow size={13} color={deltaInk({ direction: dir, good: point.good })} strokeWidth={2} /> : null}
      {point.value ? (
        <Text variant="caption" color={palette.ink} tabular numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.semibold}>
          {point.value}
        </Text>
      ) : null}
      {point.label ? (
        <Text variant="caption" muted numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {point.label}
        </Text>
      ) : null}
    </View>
  );
}

// ── PillBarChart ─────────────────────────────────────────────────────────────

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEK_SPOKEN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A change in words with its direction (the small "↗ +4.2%" under a figure). */
export type VizDeltaLabel = { label: string; direction: VizDirection; good?: boolean };

export type PillBarChartProps = {
  values: number[];
  /** Letters inside the pills (default S M T W T F S for 7 values). */
  labels?: string[];
  /** What screen readers say for each pill (default the full day names for a week). */
  spokenLabels?: string[];
  /** The selected pill (controlled). Without it the chart keeps its own selection. */
  selected?: number;
  /** First selection when uncontrolled (default the last non-zero value). */
  defaultSelected?: number;
  onSelect?: (index: number) => void;
  /** The selected pill's tooltip, e.g. (v) => `${v}h`. */
  formatValue?: (v: number, i: number) => string;
  /** The big figure on the left (a Numeral, md). */
  value?: number | string;
  prefix?: string;
  unit?: string;
  decimals?: number;
  /** The small change under the figure: ↗ +4.2%. */
  delta?: VizDeltaLabel | null;
  caption?: string;
  /** Unselected pills: frosted (default) or hatched. */
  idle?: 'frost' | 'hatch';
  /** Height of the pills area. */
  height?: number;
  /** The selected capsule (default the brand). */
  color?: string;
  /** What the chart is, for screen readers ("Hours this week"). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Payno "Earning Activity": a big figure with a small delta on the left and 7 slim rounded pills on
 * the right, each with its day letter inside. The selected day is a solid brand capsule with a small
 * white dot at its top and a white value pill above it; the others are frosted (or hatched). Tap the
 * pills or slide a finger along them to pick a day — the whole pills area is the touch target
 * (screen readers: one adjustable element, swipe up / down). The figure moves above the pills on a
 * narrow phone or with large text.
 *   <PillBarChart values={hours} value={41.5} unit="h" delta={{ label: '+4.2%', direction: 'up' }}
 *     formatValue={(v) => `${v}h`} accessibilityLabel="Hours this week" />
 */
export function PillBarChart({
  values: rawValues,
  labels: rawLabels,
  spokenLabels,
  selected,
  defaultSelected,
  onSelect,
  formatValue,
  value,
  prefix,
  unit,
  decimals,
  delta,
  caption,
  idle = 'frost',
  height = 132,
  color = palette.primary,
  accessibilityLabel = 'Bar chart',
  style,
}: PillBarChartProps) {
  const stacked = shouldStack(useLayout(), { below: 'narrow' });
  const [w, onLayout] = useWidth();
  const id = useSvgId('pills');
  const values = nums(rawValues);
  const n = values.length;
  const labels = Array.isArray(rawLabels) ? rawLabels.map((t) => String(t ?? '')) : n === 7 ? WEEK : values.map((_, i) => String(i + 1));
  const spoken = Array.isArray(spokenLabels) ? spokenLabels : !rawLabels && n === 7 ? WEEK_SPOKEN : labels;
  const fallback = (() => {
    for (let i = n - 1; i >= 0; i--) if (values[i]! > 0) return i;
    return n - 1;
  })();
  const [own, setOwn] = useState<number | null>(null);
  const pickIndex = (i: number | null | undefined) => (i != null && Number.isInteger(i) && i >= 0 && i < n ? i : -1);
  const sel = pickIndex(selected) >= 0 ? pickIndex(selected) : pickIndex(own) >= 0 ? pickIndex(own) : pickIndex(defaultSelected) >= 0 ? pickIndex(defaultSelected) : fallback;
  const fmt = (v: number, i: number) => (formatValue ? formatValue(v, i) : v.toLocaleString('en-IN'));
  const pick = (i: number) => {
    if (i < 0 || i >= n) return;
    haptic.select();
    setOwn(i);
    onSelect?.(i);
  };

  const slot = n && w ? w / n : 0;
  // Payno: slim pills close together (≈ 20 dp wide, ≈ 8 dp apart).
  const pw = clamp(slot * 0.7, 12, 24);
  const tipSpace = 36;
  const minH = Math.max(pw + 22, 36);
  const max = Math.max(0, ...values) || 1;
  const barH = (v: number) => minH + clamp(v / max, 0, 1) * Math.max(0, height - tipSpace - minH);
  // Unselected pills: near-white on light; on dark a soft light veil (frost), so they lift off the card.
  const idleFill = isDark() ? palette.frostStrong : palette.surface;
  // The selected capsule's dot and letter are white; on dark a light fill (a module's text tone such as
  // moduleTone[x].fg) would swallow white, so they turn the dark surface colour there.
  const selInk = isDark() && (luminance(color) ?? 0) > 0.3 ? palette.surface : palette.onPrimary;
  const selTop = sel >= 0 ? height - barH(values[sel]!) : 0;

  // Tap a pill, or slide a finger along them, to pick the nearest day (x is relative to the pills
  // area on every platform). `last` dedupes on the UI thread so a slide fires once per new day.
  const last = useSharedValue(-1);
  const tap = Gesture.Tap()
    .maxDuration(600)
    .onEnd((e, success) => {
      if (!success || slot <= 0) return;
      const i = Math.min(n - 1, Math.max(0, Math.floor(e.x / slot)));
      if (i !== sel) scheduleOnRN(pick, i);
    });
  const slide = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      last.set(sel);
    })
    .onUpdate((e) => {
      if (slot <= 0) return;
      const i = Math.min(n - 1, Math.max(0, Math.floor(e.x / slot)));
      if (i !== last.get()) {
        last.set(i);
        scheduleOnRN(pick, i);
      }
    });
  const gesture = Gesture.Race(slide, tap);

  const figure =
    value != null ? (
      <View style={stacked ? styles.pillFigureStacked : styles.pillFigure}>
        <Numeral value={value} prefix={prefix} unit={unit} decimals={decimals} size="md" />
        {delta ? <DeltaLine delta={delta} /> : null}
        {caption ? (
          <Text variant="caption" muted numberOfLines={2}>
            {caption}
          </Text>
        ) : null}
      </View>
    ) : null;

  return (
    <View style={[stacked ? styles.pillStack : styles.pillRow, style]}>
      {figure}
      <GestureHandlerRootView style={[stacked ? styles.pillAreaStacked : styles.pillArea, { height }]}>
        <GestureDetector gesture={gesture}>
          <View
            onLayout={onLayout}
            style={StyleSheet.absoluteFill}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint="Swipe up or down to change the day"
            accessibilityValue={sel >= 0 ? { text: `${spoken[sel] ?? labels[sel] ?? ''}, ${fmt(values[sel]!, sel)}` } : undefined}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e: AccessibilityActionEvent) => {
              if (e.nativeEvent.actionName === 'increment') pick(sel + 1);
              else if (e.nativeEvent.actionName === 'decrement') pick(sel - 1);
            }}>
            {w > 0 && n > 0 ? (
              <>
                <GrowIn style={StyleSheet.absoluteFill}>
                  <Svg width={w} height={height} pointerEvents="none">
                    {idle === 'hatch' ? (
                      <Defs>
                        <Pattern id={`${id}h`} patternUnits="userSpaceOnUse" width={6} height={6}>
                          <Path d="M -1 1 L 1 -1 M 0 6 L 6 0 M 5 7 L 7 5" stroke={palette.textFaint} strokeOpacity={0.35} strokeWidth={1} />
                        </Pattern>
                      </Defs>
                    ) : null}
                    {values.map((v, i) => {
                      const h = barH(v);
                      const x = i * slot + (slot - pw) / 2;
                      const y = height - h;
                      const on = i === sel;
                      return (
                        <G key={i}>
                          <Rect
                            x={x}
                            y={y}
                            width={pw}
                            height={h}
                            rx={pw / 2}
                            fill={on ? color : idleFill}
                            fillOpacity={on ? 1 : 0.92}
                            stroke={on ? color : palette.glassLine}
                            strokeWidth={1}
                          />
                          {!on && idle === 'hatch' ? <Rect x={x} y={y} width={pw} height={h} rx={pw / 2} fill={`url(#${id}h)`} /> : null}
                          {on ? <Circle cx={x + pw / 2} cy={y + pw / 2} r={Math.max(2.5, pw * 0.15)} fill={selInk} /> : null}
                          <SvgText
                            x={x + pw / 2}
                            y={height - 10}
                            fontSize={11}
                            textAnchor="middle"
                            fill={on ? selInk : palette.textMuted}
                            fontFamily={on ? font.semibold : font.medium}>
                            {labels[i] ?? ''}
                          </SvgText>
                        </G>
                      );
                    })}
                  </Svg>
                </GrowIn>
                {sel >= 0 ? (
                  <Anchored key={`tip${sel}`} x={sel * slot + slot / 2} y={selTop} bounds={w} place="above" gap={6} delay={sel === fallback && own == null ? 650 : 0}>
                    <View style={styles.valuePill}>
                      <Text variant="caption" color={palette.ink} tabular numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.semibold}>
                        {fmt(values[sel]!, sel)}
                      </Text>
                    </View>
                  </Anchored>
                ) : null}
              </>
            ) : null}
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </View>
  );
}

/** "↗ +4.2%": a small trend arrow and the change in words. */
function DeltaLine({ delta }: { delta: VizDeltaLabel }) {
  const Icon = delta.direction === 'down' ? TrendingDown : delta.direction === 'up' ? TrendingUp : ArrowRight;
  return (
    <View style={styles.deltaLine}>
      <Icon size={14} color={deltaInk(delta)} strokeWidth={2} />
      <Text variant="caption" color={deltaTextInk(delta)} tabular numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.shrink}>
        {delta.label}
      </Text>
    </View>
  );
}

// ── SparkCard ────────────────────────────────────────────────────────────────

/** One figure of a SparkCard's footer. */
export type SparkFigure = { label: string; value: number | string };

export type SparkCardProps = {
  title: string;
  /** Muted line under the title, e.g. "This month". */
  subtitle?: string;
  values: number[];
  /** The highlighted point (default the peak). */
  highlight?: number;
  /** Left / centre / right figures; the centre one is emphasised. */
  footer?: SparkFigure[];
  /** The squiggle's colour (default sunset). */
  color?: string;
  /**
   * 'columns' (Lendora: three side by side), 'rows' (label left, figure right) or 'auto' (default:
   * columns while every label fits on one line). Pass the same to both cards of a TwoUp to match them.
   */
  footerLayout?: 'auto' | 'columns' | 'rows';
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const SPARK_H = 78;

/**
 * Lendora half-width card ("Prospective Clients"): a title over a muted subtitle, a glowing squiggle
 * sparkline with one highlighted dot and a dotted drop-line, and a 3-figure footer — muted left and
 * right, the centre label in ink and its figure larger (three label · figure rows instead when the
 * labels would not fit on one line; see `footerLayout`). Frosted; sits in a TwoUp (fills its half).
 *   <TwoUp>
 *     <SparkCard title="Leave" subtitle="This year" values={monthly} footer={[{ label: 'Taken', value: 6 }, { label: 'Balance', value: 12 }, { label: 'Planned', value: 2 }]} />
 *     …
 *   </TwoUp>
 */
export function SparkCard({
  title,
  subtitle,
  values: rawValues,
  highlight,
  footer,
  color = palette.sunset,
  footerLayout = 'auto',
  onPress,
  accessibilityLabel,
  style,
}: SparkCardProps) {
  const { cardPad, fontScale } = useLayout();
  const [w, onLayout] = useWidth();
  const values = nums(rawValues);
  const n = values.length;
  const peak = values.reduce((best, v, i) => (v > values[best]! ? i : best), 0);
  const hi = highlight != null && Number.isInteger(highlight) && highlight >= 0 && highlight < n ? highlight : peak;
  const figs = (Array.isArray(footer) ? footer : []).filter(Boolean).slice(0, 3);
  const spoken = accessibilityLabel ?? [title, subtitle, ...figs.map((f) => `${f.label} ${fmtNumber(f.value)}`)].filter(Boolean).join(', ');
  const isCentre = (i: number) => (figs.length === 3 ? i === 1 : figs.length === 1);
  // The footer bleeds half the card padding on each side. Its three columns stay only while every
  // label fits on one line (estimated from its length); otherwise the figures become three rows.
  const footW = w > 0 ? w - 8 + cardPad : 0;
  const need =
    figs.reduce((sum, f, i) => {
      const c = isCentre(i);
      return sum + Math.max(f.label.length * (c ? 7.6 : 7), fmtNumber(f.value).length * (c ? 14 : 9));
    }, 0) *
      Math.max(1, fontScale) +
    space.xxs * 2;
  const columns = footerLayout === 'auto' ? footW === 0 || need <= footW : footerLayout === 'columns';

  const padX = 8;
  const lineTop = 12;
  const lineBottom = 44;
  const dMax = Math.max(...values, 0);
  const dMin = Math.min(...values, dMax);
  const span = dMax - dMin || 1;
  const xAt = (i: number) => (n <= 1 ? w / 2 : padX + (i / (n - 1)) * (w - padX * 2));
  const yAt = (v: number) => (dMax === dMin ? (lineTop + lineBottom) / 2 : lineTop + (1 - (v - dMin) / span) * (lineBottom - lineTop));
  const pts = n > 1 ? values.map((v, i) => ({ x: xAt(i), y: yAt(v) })) : [];
  const line = monotonePath(pts);
  const halo = monotonePath(pts.map((p) => ({ x: p.x, y: p.y + 2 })));
  const dot = pts[hi];

  const body = (
    <View style={[styles.frostCard, { padding: cardPad }, onPress ? styles.grow : style]} accessible={!onPress} accessibilityLabel={onPress ? undefined : spoken}>
      <Text variant="body" color={palette.ink} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="label" muted numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
      <View onLayout={onLayout} style={styles.sparkArea}>
        {w > 0 && pts.length ? (
          <GrowIn style={StyleSheet.absoluteFill}>
            <Svg width={w} height={SPARK_H}>
              <Path d={halo} stroke={color} strokeOpacity={0.12} strokeWidth={14} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={line} stroke={color} strokeOpacity={0.2} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={line} stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {dot ? (
                <>
                  <Line x1={dot.x} x2={dot.x} y1={dot.y + 7} y2={SPARK_H - 12} stroke={palette.textFaint} strokeOpacity={0.6} strokeWidth={1.2} strokeDasharray="2 4" strokeLinecap="round" />
                  <Circle cx={dot.x} cy={dot.y} r={8} fill={color} fillOpacity={0.22} />
                  <Circle cx={dot.x} cy={dot.y} r={4.2} fill={color} stroke={palette.surface} strokeWidth={1.5} />
                </>
              ) : null}
            </Svg>
          </GrowIn>
        ) : null}
      </View>
      {figs.length && columns ? (
        <View style={[styles.sparkFooter, { marginHorizontal: -cardPad / 2 }]}>
          {figs.map((f, i) => {
            const centre = isCentre(i);
            return (
              <View key={`${f.label}${i}`} style={centre ? styles.sparkCentre : styles.sparkSide}>
                <Text
                  variant={centre ? 'label' : 'caption'}
                  color={centre ? palette.ink : palette.textMuted}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  align="center"
                  maxFontSizeMultiplier={1.3}>
                  {f.label}
                </Text>
                <Text
                  variant={centre ? 'title' : 'body'}
                  color={centre ? palette.ink : palette.textMuted}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  tabular
                  align="center"
                  maxFontSizeMultiplier={1.2}
                  style={centre ? styles.sparkCentreFigure : null}>
                  {fmtNumber(f.value)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {figs.length && !columns ? (
        <View style={styles.sparkRows}>
          {figs.map((f, i) => {
            const centre = isCentre(i);
            return (
              <View key={`${f.label}${i}`} style={styles.sparkRow}>
                <Text
                  variant={centre ? 'label' : 'caption'}
                  color={centre ? palette.ink : palette.textMuted}
                  numberOfLines={2}
                  maxFontSizeMultiplier={1.3}
                  style={styles.flexText}>
                  {f.label}
                </Text>
                <Text
                  variant={centre ? 'heading' : 'body'}
                  color={centre ? palette.ink : palette.textMuted}
                  numberOfLines={1}
                  tabular
                  maxFontSizeMultiplier={1.2}
                  style={styles.noShrink}>
                  {fmtNumber(f.value)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={spoken} style={style}>
      {body}
    </PressableScale>
  );
}

// ── StripedProgress ──────────────────────────────────────────────────────────

export type StripedProgressProps = {
  used: number;
  total: number;
  /** Muted caption on the left above the bar, e.g. "Leave used". */
  label?: string;
  /** How `used` and `total` read in the right label (default en-IN numbers): (v) => `₹${…}`. */
  formatValue?: (v: number) => string;
  /** Your own right label instead of "used / total". */
  valueText?: string;
  /** Diagonal stripes (default) or a solid brand fill. */
  variant?: 'striped' | 'solid';
  /** The fill's colour (default the brand: its text tone for the stripes, so they read on dark too). */
  color?: string;
  /** Height of the track (default 20). */
  height?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

// Payno's % thumb is a white disc a little taller than the track (it grows into a pill for "100%").
const THUMB_H = 34;

/**
 * Payno Wallet limit bar ("Transaction Limit $6,400 / $10,000"): a frosted track whose filled part is
 * diagonal-striped (or solid brand), a small white % thumb pill riding at the end of the fill, the
 * "used / total" label above it on the right and an optional muted caption on the left. The fill
 * grows in from the left once.
 *   <StripedProgress label="Leave used" used={8} total={24} formatValue={(v) => `${v} days`} />
 */
export function StripedProgress({
  used,
  total,
  label,
  formatValue,
  valueText,
  variant = 'striped',
  color: colorProp,
  height = 20,
  accessibilityLabel,
  style,
}: StripedProgressProps) {
  const [tw, onLayout] = useWidth();
  const [thumbW, setThumbW] = useState(0);
  const id = useSvgId('stripe');
  const color = colorProp ?? (variant === 'solid' ? palette.primary : palette.primaryText);
  const safeUsed = Number.isFinite(used) ? Math.max(0, used) : 0;
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
  const v = safeTotal > 0 ? unit01(safeUsed / safeTotal) : 0;
  const pct = Math.round(v * 100);
  const fmt = formatValue ?? ((x: number) => x.toLocaleString('en-IN'));
  const right = valueText ?? `${fmt(safeUsed)} / ${fmt(safeTotal)}`;
  const spoken = accessibilityLabel ?? [label, `${fmt(safeUsed)} of ${fmt(safeTotal)}`].filter(Boolean).join(': ');

  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(120, withTiming(v, { duration: 700, easing: EASE_OUT })));
  }, [v, p]);
  const inner = Math.max(0, tw - 2); // inside the track's 1 dp rim
  const fillH = Math.max(2, height - 2);
  const fillStyle = useAnimatedStyle(() => ({ width: p.get() * inner }), [inner]);
  // The % thumb rides just past a short fill (so it never hides it: "11%", "0%") and slides to centre
  // on the fill's end once the fill is twice its width; in between it moves smoothly.
  const thumbStyle = useAnimatedStyle(() => {
    const end = p.get() * tw;
    const t = thumbW > 0 ? Math.min(1, Math.max(0, (end - thumbW) / thumbW)) : 1;
    const x = end + 4 - t * (thumbW / 2 + 4);
    return { transform: [{ translateX: Math.min(Math.max(x, 0), Math.max(0, tw - thumbW)) }] };
  }, [tw, thumbW]);

  return (
    <View
      style={[styles.striped, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={spoken}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}>
      <View style={styles.stripedHead}>
        <Text variant="label" muted numberOfLines={2} style={styles.flexText}>
          {label ?? ''}
        </Text>
        <Text variant="labelStrong" color={palette.ink} tabular numberOfLines={1} style={styles.noShrink}>
          {right}
        </Text>
      </View>
      <View onLayout={onLayout} style={[styles.stripedBody, { height: Math.max(THUMB_H, height) }]}>
        <View style={[styles.stripedTrack, { height, borderRadius: height / 2 }]}>
          {tw > 0 ? (
            <Animated.View style={[styles.stripedFill, { height: fillH, borderRadius: fillH / 2 }, variant === 'solid' ? { backgroundColor: color } : null, fillStyle]}>
              {variant === 'striped' ? (
                <Svg width={inner} height={fillH}>
                  <Defs>
                    <Pattern id={`${id}p`} patternUnits="userSpaceOnUse" width={7} height={7}>
                      <Path d="M -1 1 L 1 -1 M 0 7 L 7 0 M 6 8 L 8 6" stroke={color} strokeWidth={1.6} />
                    </Pattern>
                  </Defs>
                  <Rect x={0} y={0} width={inner} height={fillH} fill={color} fillOpacity={0.08} />
                  <Rect x={0} y={0} width={inner} height={fillH} fill={`url(#${id}p)`} />
                </Svg>
              ) : null}
            </Animated.View>
          ) : null}
        </View>
        {tw > 0 ? (
          <Animated.View
            pointerEvents="none"
            onLayout={(e) => {
              const nw = Math.round(e.nativeEvent.layout.width);
              if (nw !== thumbW) setThumbW(nw);
            }}
            style={[styles.thumb, { opacity: thumbW ? 1 : 0 }, thumbStyle]}>
            <Text variant="caption" color={palette.ink} tabular numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.semibold}>
              {pct}%
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

// ── RankSlider ───────────────────────────────────────────────────────────────

export type RankSliderProps = {
  /** Your rank, e.g. 26. */
  rank: number;
  /** The last place, at the left end (e.g. 50). */
  worst: number;
  /** The first place, at the right end (default 1). */
  best?: number;
  /** The small word before the figures (default "No."). */
  prefix?: string;
  /** Places gained (+) or lost (−) since last time; shown as a small pill. */
  change?: number | null;
  caption?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Lendora "Your Rank": the rank centred big (type.numeral) after a small muted "No.", an optional
 * gold "+6" pill, then a thin track filled in sunset from the last place up to you with a ▲ marker
 * under your spot, and end labels (No. 50 … No. 1; your own under the marker when there is room).
 *   <RankSlider rank={7} worst={48} change={3} caption="Bounty leaderboard · October" />
 */
export function RankSlider({ rank, worst, best = 1, prefix = 'No.', change, caption, accessibilityLabel, style }: RankSliderProps) {
  const [w, onLayout] = useWidth();
  const lo = Number.isFinite(best) ? best : 1;
  const hi = Number.isFinite(worst) && worst > lo ? worst : lo + 1;
  const r = Number.isFinite(rank) ? clamp(Math.round(rank), lo, hi) : hi;
  const pos = (hi - r) / (hi - lo); // 0 = last place (left), 1 = first (right)
  const gained = Number.isFinite(change ?? NaN) && change ? Math.round(change) : 0;
  const spoken =
    accessibilityLabel ??
    [`Rank ${r} of ${hi}`, gained ? `${gained > 0 ? 'up' : 'down'} ${Math.abs(gained)} place${Math.abs(gained) === 1 ? '' : 's'}` : null, caption]
      .filter(Boolean)
      .join(', ');
  const mx = clamp(pos * w, 7, Math.max(7, w - 7));
  const showMid = pos > 0.22 && pos < 0.78;
  return (
    <View style={[styles.rank, style]} accessible accessibilityRole="progressbar" accessibilityLabel={spoken} aria-valuemin={lo} aria-valuemax={hi} aria-valuenow={r}>
      <View style={styles.rankFigure}>
        <Text variant="body" muted numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.rankPrefix}>
          {prefix}
        </Text>
        <Text variant="numeral" color={palette.ink} numberOfLines={1} tabular style={styles.shrink}>
          {r.toLocaleString('en-IN')}
        </Text>
        {gained ? (
          <View style={[styles.changePill, { backgroundColor: gained > 0 ? palette.goldSoft : palette.dangerSoft }]}>
            <Text variant="caption" color={gained > 0 ? palette.goldInk : palette.dangerInk} tabular numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.semibold}>
              {gained > 0 ? `+${gained}` : `−${Math.abs(gained)}`}
            </Text>
          </View>
        ) : null}
      </View>
      {caption ? (
        <Text variant="label" muted align="center" numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
      <View onLayout={onLayout} style={styles.rankTrack}>
        {w > 0 ? (
          <Svg width={w} height={20}>
            <Rect x={0} y={4} width={w} height={4} rx={2} fill={palette.track} />
            <Rect x={0} y={4} width={Math.max(4, pos * w)} height={4} rx={2} fill={palette.sunset} />
            <Polygon points={`${mx} 11 ${mx + 6} 19 ${mx - 6} 19`} fill={palette.ink} />
          </Svg>
        ) : null}
      </View>
      <View style={styles.rankLabels}>
        <Text variant="label" muted tabular numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {`${prefix} ${hi}`}
        </Text>
        <Text variant="label" muted tabular numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {`${prefix} ${lo}`}
        </Text>
        {w > 0 && showMid ? (
          <Anchored x={mx} y={0} bounds={w} place="below" gap={0}>
            <Text variant="labelStrong" color={palette.ink} tabular numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {`${prefix} ${r}`}
            </Text>
          </Anchored>
        ) : null}
      </View>
    </View>
  );
}

// ── RadialArc ────────────────────────────────────────────────────────────────

export type ArcLegendItem = { label: string; value?: string | number; color?: string };

export type RadialArcProps = {
  value: number;
  total: number;
  /** Largest diameter (default 184); it shrinks to the width it gets. */
  size?: number;
  thickness?: number;
  /** Muted words under the fraction, e.g. "days marked". */
  caption?: string;
  /** Dots under the arc (default: done and left). */
  legend?: ArcLegendItem[];
  /** The fill's ramp along the arc (default sunset → coral). */
  colors?: readonly [string, string];
  /** Show the % pill in the arc's opening (default true). */
  showPercent?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/**
 * Lendora "Shuffle Status": a 270° arc (open at the bottom) — a faint track and a gradient fill with a
 * soft glow — around a "15/45" fraction (the denominator greyed) and a caption, a small % pill in the
 * opening, and legend dots under it. The fill sweeps in once.
 *   <RadialArc value={15} total={22} caption="days marked" legend={[{ label: 'Present', value: 15 }, { label: 'Left', value: 7 }]} />
 */
export function RadialArc({
  value,
  total,
  size = 184,
  thickness = 12,
  caption,
  legend,
  colors,
  showPercent = true,
  accessibilityLabel,
  style,
}: RadialArcProps) {
  const [w, onLayout] = useWidth();
  const id = useSvgId('arc');
  const ramp: readonly [string, string] = colors ?? [palette.sunset, palette.coral];
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
  const safeValue = Number.isFinite(value) ? clamp(value, 0, safeTotal || Math.max(0, value)) : 0;
  const f = safeTotal > 0 ? unit01(safeValue / safeTotal) : 0;
  const pct = Math.round(f * 100);
  const s = Math.max(120, w ? Math.min(size, w) : size);
  const c = s / 2;
  const r = c - thickness / 2 - 6;
  const start = polar(c, c, r, 225);
  const end = polar(c, c, r, 135);
  const arc = `M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${end.x} ${end.y}`;
  const len = r * 1.5 * Math.PI;

  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(120, withTiming(1, { duration: 900, easing: EASE_OUT })));
  }, [p]);
  const fillProps = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - f * p.get()) }), [len, f]);

  const items: ArcLegendItem[] = Array.isArray(legend)
    ? legend
    : [
        { label: 'Done', value: safeValue, color: ramp[0] },
        { label: 'Left', value: Math.max(0, safeTotal - safeValue), color: palette.textFaint },
      ];
  const spoken =
    accessibilityLabel ??
    [`${fmtNumber(safeValue)} of ${fmtNumber(safeTotal)}`, `${pct}%`, caption, ...items.map((it) => [it.label, it.value != null ? fmtNumber(it.value) : null].filter(Boolean).join(' '))]
      .filter(Boolean)
      .join(', ');
  const fracStyle: TextStyle = { fontSize: s >= 170 ? 40 : 36, lineHeight: s >= 170 ? 46 : 42 };

  return (
    <View onLayout={onLayout} style={[styles.arcWrap, style]} accessible accessibilityRole="progressbar" accessibilityLabel={spoken} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <View style={{ width: s, height: s }}>
        <Svg width={s} height={s}>
          <Defs>
            <SvgGradient id={`${id}g`} x1={0} y1={0} x2={s} y2={0} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={ramp[0]} stopOpacity={1} />
              <Stop offset="1" stopColor={ramp[1]} stopOpacity={1} />
            </SvgGradient>
          </Defs>
          <Path d={arc} stroke={palette.track} strokeWidth={thickness} fill="none" strokeLinecap="round" />
          {f > 0 ? (
            <>
              <AnimatedPath
                d={arc}
                stroke={`url(#${id}g)`}
                strokeOpacity={0.16}
                strokeWidth={thickness + 10}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${len} ${len}`}
                animatedProps={fillProps}
              />
              <AnimatedPath
                d={arc}
                stroke={`url(#${id}g)`}
                strokeWidth={thickness}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${len} ${len}`}
                animatedProps={fillProps}
              />
            </>
          ) : null}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.arcCentre]} pointerEvents="none">
          <Text
            variant="numeral"
            color={palette.ink}
            numberOfLines={1}
            adjustsFontSizeToFit={s >= 170}
            minimumFontScale={36 / 40}
            tabular
            style={fracStyle}>
            {fmtNumber(safeValue)}
            <RNText style={styles.arcDenominator}>/{fmtNumber(safeTotal)}</RNText>
          </Text>
          {caption ? (
            <Text variant="caption" muted numberOfLines={2} align="center" style={{ maxWidth: r * 1.4 }}>
              {caption}
            </Text>
          ) : null}
        </View>
        {showPercent ? (
          <View style={[styles.arcPillRow, { top: c + r * 0.62 }]} pointerEvents="none">
            <View style={styles.arcPill}>
              <Text variant="caption" color={isDark() ? palette.primaryText : palette.primaryDeep} tabular numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.semibold}>
                {pct}%
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      {items.length ? (
        <View style={styles.legend}>
          {items.map((it, i) => (
            <View key={`${it.label}${i}`} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: it.color ?? (i === 0 ? ramp[0] : palette.textFaint) }]} />
              <Text variant="label" muted numberOfLines={1} style={styles.shrink}>
                {it.label}
              </Text>
              {it.value != null ? (
                <Text variant="labelStrong" color={palette.ink} tabular numberOfLines={1}>
                  {fmtNumber(it.value)}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ── WashStatCard ─────────────────────────────────────────────────────────────

export type WashStatCardProps = {
  value: number | string;
  prefix?: string;
  unit?: string;
  decimals?: number;
  delta?: NumeralDelta | null;
  /** Muted words under the figure. */
  caption?: string;
  /** Where the slider's ▲ sits, 0–1. */
  progress: number;
  /** The three ticks under the slider (default 0% · 50% · 100%). */
  ticks?: readonly [string, string, string];
  /** Muted footer word on the left, e.g. "This month". */
  footerLeft?: string;
  /** Footer words on the right, in ink, e.g. "21 working days". */
  footerRight?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Lendora "65.91" card: a light gradient.sunsetLight wash with a giant Numeral and a caption, a
 * frosted slider bar whose fill ramps warm up to a solid ▲ marker standing on it, 0% · 50% · 100% ticks
 * under it (the middle one in ink), and an optional footer line. Figure and slider sit side by side when the card is wide, stacked on a
 * phone.
 *   <WashStatCard value={92.4} prefix="%" caption="Attendance score this month" progress={0.924} footerLeft="October" footerRight="21 working days" />
 */
export function WashStatCard({
  value,
  prefix,
  unit,
  decimals,
  delta,
  caption,
  progress,
  ticks = ['0%', '50%', '100%'],
  footerLeft,
  footerRight,
  onPress,
  accessibilityLabel,
  style,
}: WashStatCardProps) {
  const { cardPad } = useLayout();
  const [w, onLayout] = useWidth();
  const v = unit01(progress);
  const pct = Math.round(v * 100);
  const wide = w >= 460;
  const parts = figureParts(value, clamp(Math.round(decimals ?? (typeof value === 'number' ? autoDecimals(value) : 0)), 0, 4));
  const spoken =
    accessibilityLabel ??
    [`${prefix ?? ''}${parts.spoken}${unit ? ` ${unit}` : ''}`, caption, `${pct}%`, footerLeft, footerRight].filter(Boolean).join(', ');

  const slider = (
    <View style={wide ? styles.washSliderWide : styles.washSlider}>
      <View style={styles.washTrack}>
        {pct > 0 ? (
          <LinearGradient
            colors={[palette.coralSoft, palette.sunset]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.washFill, { width: `${pct}%` }]}
          />
        ) : null}
        {/* Lendora: a solid ▲ standing on the bar where the fill ends, cut out of it by a white edge. */}
        <View style={[styles.washMarker, { left: `${clamp(pct, 3, 97)}%` }]}>
          <Svg width={22} height={20}>
            <Polygon points="11 2 20 18 2 18" fill={palette.sunset} stroke={palette.surface} strokeWidth={2} strokeLinejoin="round" />
          </Svg>
        </View>
      </View>
      <View style={styles.washTicks}>
        {ticks.map((t, i) => (
          <Text
            key={`${t}${i}`}
            variant="caption"
            muted={i !== 1}
            color={i === 1 ? palette.ink : undefined}
            tabular
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}>
            {t}
          </Text>
        ))}
      </View>
    </View>
  );

  const body = (
    <View onLayout={onLayout} style={[styles.wash, { padding: cardPad }, onPress ? styles.grow : style]} accessible={!onPress} accessibilityLabel={onPress ? undefined : spoken}>
      <LinearGradient colors={gradient.sunsetLight} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={wide ? styles.washWideRow : styles.washStack}>
        <View style={wide ? styles.washFigureWide : null}>
          <Numeral value={value} prefix={prefix} unit={unit} decimals={decimals} delta={delta} caption={caption} />
        </View>
        {slider}
      </View>
      {footerLeft || footerRight ? (
        <View style={styles.washFooter}>
          <Text variant="label" muted numberOfLines={2} style={styles.flexText}>
            {footerLeft ?? ''}
          </Text>
          {footerRight ? (
            <Text variant="label" color={palette.ink} numberOfLines={2} align="right" style={styles.washFooterRight}>
              {footerRight}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={spoken} style={style}>
      {body}
    </PressableScale>
  );
}

const styles = themedStyles(() => ({
  abs: { position: 'absolute', left: 0 },
  anchored: { position: 'absolute' },
  center: { alignItems: 'center' },
  shrink: { flexShrink: 1 },
  noShrink: { flexShrink: 0 },
  flexText: { flex: 1, minWidth: 0 },
  grow: { flexGrow: 1 },
  semibold: { fontFamily: font.semibold },

  // Numeral
  numRow: { flexDirection: 'row', alignItems: 'flex-start', maxWidth: '100%' },
  sup: { flexShrink: 0 },
  numeralRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl, rowGap: space.md },

  // GlowLineChart
  revealLayer: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  pointPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    ...pillRim(),
    ...pillShadow(),
  },

  // PillBarChart
  pillRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  pillStack: { gap: space.md },
  pillFigure: { flexShrink: 1, maxWidth: '46%', gap: 2, paddingBottom: space.xxs },
  pillFigureStacked: { gap: 2 },
  pillArea: { flex: 1, minWidth: 0 },
  pillAreaStacked: { alignSelf: 'stretch' },
  valuePill: { backgroundColor: palette.surface, borderRadius: radius.pill, paddingHorizontal: space.xs, paddingVertical: 3, ...pillRim(), ...pillShadow() },
  deltaLine: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },

  // SparkCard
  frostCard: { backgroundColor: palette.frostStrong, borderWidth: 1, borderColor: rim(), borderRadius: radius.xl, gap: 2, ...(IOS ? shadow.soft : null) },
  sparkArea: { height: SPARK_H, marginTop: space.sm, marginHorizontal: -4 },
  sparkFooter: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xxs, marginTop: space.xs },
  // Columns start at their content width and share what is left, so the fit estimate holds.
  sparkSide: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0, alignItems: 'center', gap: 2 },
  sparkCentre: { flexGrow: 1.3, flexShrink: 1, flexBasis: 'auto', minWidth: 0, alignItems: 'center', gap: 2 },
  sparkCentreFigure: { fontFamily: font.light, fontSize: 24, lineHeight: 30 },
  sparkRows: { gap: 2, marginTop: space.xs },
  sparkRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 24 },

  // StripedProgress
  striped: { gap: space.xs },
  stripedHead: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  stripedBody: { justifyContent: 'center' },
  stripedTrack: { backgroundColor: palette.frostStrong, borderWidth: 1, borderColor: palette.glassLine, overflow: 'hidden' },
  stripedFill: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  thumb: {
    position: 'absolute',
    left: 0,
    height: THUMB_H,
    minWidth: THUMB_H,
    paddingHorizontal: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...pillRim(),
    ...pillShadow(),
  },

  // RankSlider
  rank: { gap: space.xs },
  rankFigure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, maxWidth: '100%', alignSelf: 'center' },
  rankPrefix: { alignSelf: 'flex-end', marginBottom: 8 },
  changePill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, flexShrink: 0 },
  rankTrack: { height: 20, marginTop: space.xs },
  rankLabels: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 20 },

  // RadialArc
  arcWrap: { alignItems: 'center', gap: space.sm },
  arcCentre: { alignItems: 'center', justifyContent: 'center', paddingBottom: space.xs },
  arcDenominator: { fontFamily: font.light, fontSize: 24, color: palette.textFaint, letterSpacing: -0.4 },
  arcPillRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  arcPill: {
    backgroundColor: palette.sunsetSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: space.md, rowGap: space.xs, maxWidth: '100%' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  legendDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },

  // WashStatCard
  wash: { borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: rim(), gap: space.md },
  washStack: { gap: space.md },
  washWideRow: { flexDirection: 'row', alignItems: 'center', gap: space.xl },
  washFigureWide: { flex: 1, minWidth: 0 },
  washSlider: { gap: space.xs, paddingTop: space.xxs },
  washSliderWide: { flex: 1.2, minWidth: 0, gap: space.xs },
  washTrack: { height: 12, borderRadius: 6, backgroundColor: palette.frostStrong, marginTop: space.xs, marginBottom: 2 },
  washFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 6 },
  // The ▲'s base sits on the bar's bottom edge, its tip rises above the bar.
  washMarker: { position: 'absolute', top: -7, marginLeft: -11, width: 22, height: 20 },
  washTicks: { flexDirection: 'row', justifyContent: 'space-between' },
  washFooter: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  washFooterRight: { flexShrink: 1, maxWidth: '60%' },
}));
