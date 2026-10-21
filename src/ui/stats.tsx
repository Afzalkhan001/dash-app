// Stat tiles (docs/DESIGN.md §7.10): a label, a big light tabular figure with a muted unit, and a
// caption. StatGrid lays them out 2 per row on compact screens (and whenever a value is longer than
// 4 characters), 3–4 per row only when everything is short. A light tile can carry a module's colour
// (`module` + `icon`: a ModuleBadge by the label and the figure in the module's ink); the dark tile is
// the teal brand hero with its gold glow, or a module's own `gradient`.
//
// Lendora light tiles (`variant="light"`, docs/LAYOUT-REFS.md): a solid white card with one big light
// numeral (an optional small superscript prefix such as ₹ and unit such as h, greyed decimals), a tiny
// DeltaTag under it and the label as a muted caption. TwoUp puts two tiles side by side at equal
// height and stacks them below 340 dp or with large text.

import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from 'lucide-react-native';
import { Children, cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Platform, Text as RNText, type StyleProp, StyleSheet, type TextStyle, View, type ViewStyle } from 'react-native';

import { font, gradient as gradients, type ModuleKey, moduleTone, palette, radius, shadow, space } from '@/theme/tokens';
import { type Breakpoint, shouldStack, useLayout } from '@/ui/layout';
import { ModuleBadge } from '@/ui/list';
import { PressableScale } from '@/ui/motion';
import { Text } from '@/ui/text';

import { themedStyles } from '@/theme/themed';
const IOS = Platform.OS === 'ios';

export type StatTileProps = {
  label: string;
  value: string | number;
  unit?: string;
  caption?: string | null;
  /** Optional slot under the caption, e.g. a 6 dp split bar. */
  footer?: ReactNode;
  tone?: 'surface' | 'primary';
  /** Ink colour for a status figure, e.g. palette.warningInk for a late count. */
  valueColor?: string;
  /** Light tiles: the module whose colour the tile carries (figure ink, and the badge with `icon`). */
  module?: ModuleKey;
  /** With `module`: a 28 dp ModuleBadge before the label. */
  icon?: LucideIcon;
  /** Dark tiles: a module's hero gradient instead of the teal brand one. */
  gradient?: readonly [string, string];
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** `'light'` = the Lendora white tile (figure first, label as the caption under it). `tone` is ignored. */
  variant?: 'default' | 'light';
  /** Light tiles: a small superscript before the figure, e.g. '₹'. */
  prefix?: string;
  /** Light tiles, numeric `value`: decimals to show (default 0 for whole numbers, else 1); they are greyed. */
  decimals?: number;
  /** Light tiles: a tiny change tag under the figure, a signed % or your own label (see DeltaTag). */
  delta?: number | DeltaSpec | null;
};

/**
 *   <StatTile label="Days present" value="18" unit="/ 21" caption="2 half days" tone="primary" />
 *   <StatTile variant="light" label="Hours this week" value={38.5} unit="h" delta={{ label: '+2h 10m', direction: 'up' }} />
 */
export function StatTile(props: StatTileProps) {
  if (props.variant === 'light') return <LightStatTile {...props} />;
  return <ClassicStatTile {...props} />;
}

function ClassicStatTile({ label, value, unit, caption, footer, tone = 'surface', valueColor, module, icon, gradient, onPress, style }: StatTileProps) {
  const dark = tone === 'primary';
  const shown = typeof value === 'number' ? (Number.isFinite(value) ? value.toLocaleString('en-IN') : '—') : value || '—';
  const fill = gradient ?? gradients.brand;
  const tint = !dark && module ? moduleTone[module] : null;
  const labelEl = (
    <Text variant="label" color={dark ? palette.onPrimaryMuted : palette.textMuted} numberOfLines={1} style={styles.shrink}>
      {label}
    </Text>
  );
  const body = (
    <View style={[styles.tile, dark ? [styles.tileDark, { backgroundColor: fill[1] }] : styles.tileGlass, onPress ? { flexGrow: 1 } : style]}>
      {dark ? (
        <LinearGradient
          colors={fill}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
          pointerEvents="none"
        />
      ) : null}
      {dark && !gradient ? (
        <LinearGradient
          colors={gradients.glow}
          start={{ x: 0.35, y: 0.3 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
          pointerEvents="none"
        />
      ) : null}
      {tint && module && icon ? (
        <View style={styles.labelRow}>
          <ModuleBadge module={module} icon={icon} size={28} />
          {labelEl}
        </View>
      ) : (
        labelEl
      )}
      <View style={styles.figureRow}>
        <Text
          variant="hero"
          color={valueColor ?? (dark ? palette.onPrimary : (tint?.fg ?? palette.text))}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{ flexShrink: 1 }}>
          {shown}
        </Text>
        {unit ? (
          <Text variant="label" color={dark ? palette.onPrimaryMuted : palette.textMuted} numberOfLines={1} style={{ flexShrink: 0 }}>
            {unit}
          </Text>
        ) : null}
      </View>
      {caption ? (
        <Text variant="caption" color={dark ? palette.onPrimaryMuted : palette.textMuted} numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
      {footer}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={`${label}: ${shown}${unit ? ` ${unit}` : ''}`} style={style}>
      {body}
    </PressableScale>
  );
}

// ── Lendora light tile ───────────────────────────────────────────────────────

// "38.5" → "38" + ".5" (the decimals are greyed). Strings are split only when they are a plain number.
function figureParts(value: string | number, decimals?: number): { int: string; dec: string } {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { int: '—', dec: '' };
    const d = Math.max(0, Math.min(4, decimals ?? (Number.isInteger(value) ? 0 : 1)));
    const fixed = Math.abs(value).toFixed(d);
    const [i, dec] = fixed.split('.');
    const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
    return { int: `${sign}${Number(i).toLocaleString('en-IN')}`, dec: dec ? `.${dec}` : '' };
  }
  const s = String(value ?? '').trim() || '—';
  const m = /^(-?[\d,]+)(\.\d+)$/.exec(s);
  return m ? { int: m[1]!, dec: m[2]! } : { int: s, dec: '' };
}

// Start size by length (then adjustsFontSizeToFit, down to 70 %), so "₹1,24,500" fits a two-up tile
// at 320 dp. Light weight only at 24 px and up.
function figureStyle(chars: number): TextStyle {
  if (chars <= 5) return { fontSize: 40, lineHeight: 46, letterSpacing: -1 };
  if (chars <= 8) return { fontSize: 32, lineHeight: 38, letterSpacing: -0.8 };
  if (chars <= 10) return { fontSize: 26, lineHeight: 32, letterSpacing: -0.5 };
  return { fontSize: 24, lineHeight: 30, letterSpacing: -0.4 };
}

function LightStatTile({ label, value, unit, caption, footer, valueColor, module, icon, onPress, style, prefix, decimals, delta }: StatTileProps) {
  const { cardPad } = useLayout();
  const parts = figureParts(value, decimals);
  const fig = figureStyle(parts.int.length + parts.dec.length + (prefix ? 1 : 0));
  const supTop = Math.round((fig.fontSize ?? 40) * 0.12);
  const spec: DeltaSpec | null = delta == null ? null : typeof delta === 'number' ? deltaFromValue(delta) : delta;
  const figureText = `${prefix ?? ''}${parts.int}${parts.dec}${unit ? ` ${unit}` : ''}`;
  const a11y = [`${label}: ${figureText}`, spec ? deltaWords(spec) : null, caption].filter(Boolean).join(', ');
  const body = (
    <View
      style={[styles.light, { padding: cardPad }, onPress ? { flexGrow: 1 } : style]}
      accessible={!onPress}
      accessibilityLabel={onPress ? undefined : a11y}>
      {module && icon ? <ModuleBadge module={module} icon={icon} size={32} style={styles.lightBadge} /> : null}
      <View style={styles.lightFigure}>
        {prefix ? (
          <Text variant="body" muted numberOfLines={1} style={[styles.sup, { marginTop: supTop }]}>
            {prefix}
          </Text>
        ) : null}
        <Text
          variant="display"
          color={valueColor ?? palette.ink}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[fig, styles.shrink]}>
          {parts.int}
          {parts.dec ? <RNText style={{ color: palette.textFaint }}>{parts.dec}</RNText> : null}
        </Text>
        {unit ? (
          <Text variant="body" muted numberOfLines={1} style={[styles.sup, { marginTop: supTop }]}>
            {unit}
          </Text>
        ) : null}
      </View>
      {spec ? <DeltaTag label={spec.label} direction={spec.direction} good={spec.good} /> : null}
      <Text variant="label" muted numberOfLines={2} style={spec ? styles.lightLabel : null}>
        {label}
      </Text>
      {caption ? (
        <Text variant="caption" muted numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
      {footer}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={a11y} style={style}>
      {body}
    </PressableScale>
  );
}

// ── DeltaTag ─────────────────────────────────────────────────────────────────

export type DeltaDirection = 'up' | 'down' | 'flat';
/** A change to show: the words ("+2.4%", "+1h 20m"), its direction, and whether it is good news. */
export type DeltaSpec = { label: string; direction?: DeltaDirection; good?: boolean };

function deltaFromValue(v: number): DeltaSpec | null {
  if (!Number.isFinite(v)) return null;
  return { label: `${v > 0 ? '+' : ''}${v.toFixed(1)}%`, direction: v > 0 ? 'up' : v < 0 ? 'down' : 'flat' };
}

function deltaWords({ label, direction = 'flat' }: DeltaSpec) {
  return direction === 'up' ? `up ${label}` : direction === 'down' ? `down ${label}` : `no change, ${label}`;
}

/**
 * Tiny change tag (Lendora): an arrow and a short figure on a soft tint. Green (successInk on
 * successSoft) when the change is good, red (dangerInk on dangerSoft) when bad, grey when flat.
 * Pass `value` (a signed %, shown as "+2.4%") or your own `label` with a `direction`. Up counts as
 * good unless you say otherwise: `good={false}` for figures where more is worse (late days).
 *   <DeltaTag value={2.4} />   <DeltaTag label="2 more late" direction="up" good={false} />
 */
export function DeltaTag({
  value,
  label,
  direction,
  good,
  style,
}: {
  value?: number;
  label?: string;
  direction?: DeltaDirection;
  good?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fromValue = typeof value === 'number' ? deltaFromValue(value) : null;
  const dir: DeltaDirection = direction ?? fromValue?.direction ?? 'flat';
  const text = label ?? fromValue?.label ?? '';
  if (!text) return null;
  const positive = good ?? dir === 'up';
  const tone =
    dir === 'flat'
      ? { fg: palette.textMuted, bg: palette.surfaceMuted }
      : positive
        ? { fg: palette.successInk, bg: palette.successSoft }
        : { fg: palette.dangerInk, bg: palette.dangerSoft };
  const Arrow = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : ArrowRight;
  return (
    <View style={[styles.delta, { backgroundColor: tone.bg }, style]} accessible accessibilityLabel={deltaWords({ label: text, direction: dir })}>
      <Arrow size={12} color={tone.fg} strokeWidth={2.6} />
      <Text variant="caption" color={tone.fg} tabular numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.deltaText}>
        {text}
      </Text>
    </View>
  );
}

// ── TwoUp ────────────────────────────────────────────────────────────────────

/**
 * Two equal tiles side by side (gap 12), stretched to the same height; stacked full width below
 * 340 dp (`stackBelow`: a breakpoint or a window width in dp) or with text larger than 115 %. For
 * StatTile pairs and the Lendora two-up mini cards. Each child gets `flexGrow: 1` so it fills its half.
 *   <TwoUp>
 *     <StatTile variant="light" label="Hours this week" value={38.5} unit="h" delta={4.2} />
 *     <StatTile variant="light" label="On time this month" value="18" unit="/ 21" />
 *   </TwoUp>
 */
export function TwoUp({ children, stackBelow = 'tight', style }: { children: ReactNode; stackBelow?: Breakpoint | number; style?: StyleProp<ViewStyle> }) {
  const stacked = shouldStack(useLayout(), { below: stackBelow });
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[stacked ? styles.twoStack : styles.twoRow, style]}>
      {items.map((child, i) => (
        <View key={isValidElement(child) && child.key != null ? child.key : i} style={stacked ? null : styles.twoCell}>
          {isValidElement(child) && child.type !== Fragment
            ? cloneElement(child as ReactElement<{ style?: StyleProp<ViewStyle> }>, {
                style: [(child.props as { style?: StyleProp<ViewStyle> }).style, styles.fill],
              })
            : child}
        </View>
      ))}
    </View>
  );
}

const BASIS: Record<2 | 3 | 4, ViewStyle['flexBasis']> = { 2: '47%', 3: '30%', 4: '22%' };

/**
 * Wrapping grid of StatTiles (gap 12).
 *   <StatGrid columns={2}>{tiles}</StatGrid>
 * Effective columns: 2 when compact or when any value is longer than 4 characters; otherwise `columns`.
 */
export function StatGrid({ columns = 2, children, style }: { columns?: 2 | 3 | 4; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { compact } = useLayout();
  const tiles = Children.toArray(children).filter(isValidElement) as ReactElement<StatTileProps>[];
  const long = tiles.some((t) => String(t.props.value ?? '').length > 4);
  const cols: 2 | 3 | 4 = compact || long ? 2 : columns;
  return (
    <View style={[styles.grid, style]}>
      {tiles.map((t, i) => cloneElement(t, { key: t.key ?? i, style: [t.props.style, { flexGrow: 1, flexBasis: BASIS[cols], minWidth: 0 }] }))}
    </View>
  );
}

const styles = themedStyles(() => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { borderRadius: radius.lg, padding: space.md, gap: space.xxs, overflow: IOS ? 'visible' : 'hidden' },
  tileGlass: {
    backgroundColor: IOS ? palette.glass : palette.glassAndroid,
    borderWidth: 1,
    borderColor: IOS ? palette.glassEdge : palette.glassLine,
    ...(IOS ? shadow.soft : null),
  },
  tileDark: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  shrink: { flexShrink: 1 },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.xxs },
  light: {
    borderRadius: radius.xl,
    gap: 6,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassLine,
    ...(IOS ? shadow.soft : null),
  },
  lightBadge: { marginBottom: space.xxs },
  lightFigure: { flexDirection: 'row', alignItems: 'flex-start', gap: 2, maxWidth: '100%' },
  lightLabel: { marginTop: 2 },
  sup: { flexShrink: 0 },
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    flexShrink: 0,
    maxWidth: '100%',
    paddingLeft: 6,
    paddingRight: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  deltaText: { fontFamily: font.semibold, flexShrink: 1 },
  twoRow: { flexDirection: 'row', alignItems: 'stretch', gap: space.sm },
  twoStack: { gap: space.sm },
  twoCell: { flex: 1, minWidth: 0 },
  fill: { flexGrow: 1 },
}));
