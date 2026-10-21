// Lightweight SVG charts in the Lendora style (no chart library): warm sunset / coral marks with a
// soft fill, on white glass. Every chart takes a `color` (a token: palette.* or moduleTone[x].fg) for
// when it sits in a module's own colour.
//   HairlineBars  groups of thin vertical lines per period, the highlighted period in coral, the rest
//                 a soft sunset; an optional mirrored series below the baseline in red
//   DotMatrix     stacked dots per day in a coral → sunset ramp
//   BarStrip      a row of rounded bars (e.g. days present out of working days), sunset → coral fill
//   LineChart     smooth coral line with a soft sunset fill under it, guide lines and a highlighted point
//   AreaChart     Lendora glow line (GlowLineChart in viz.tsx: sunset → coral ramp, halo, white pill on
//                 the highlighted point), muted x labels and at most one faint dashed guide
//   ProgressBar   one rounded bar (0–1) on a tint of its own colour
//   SplitBar      one rounded bar split into coloured parts (salary components, gross vs deductions)
//   ChartLegend   dot + label (+ value) chips that wrap, for SplitBar and friends
// Bars grow up from the baseline (or out from the left) when they first appear.

import { useId, useState } from 'react';
import { type LayoutChangeEvent, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { Easing, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { font, lightPalette, moduleTone, palette, space } from '@/theme/tokens';
import { GrowIn } from '@/ui/motion';
import { Text } from '@/ui/text';
import { type GlowGuide, GlowLineChart, type GlowPoint } from '@/ui/viz';

import { themedStyles } from '@/theme/themed';
function useWidth() {
  const [w, setW] = useState(0);
  return [w, (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)] as const;
}

// An SVG id that is unique per chart instance, so two charts never share one gradient definition.
function useSvgId(prefix: string) {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

// API data is guarded here so a missing array or a NaN never crashes a chart (docs/DESIGN.md T11).
function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)) : [];
}

/**
 * Categorical colours for charts with several series (salary components, project codes…): the brand
 * and the warm family first, then the cooler module tones. All are tokens, read when called (so they
 * follow light / dark); `seriesColor(i)` wraps around.
 */
function seriesColors(): readonly string[] {
  return [
    palette.primary,
    palette.sunset,
    palette.coral,
    palette.gold,
    moduleTone.visitors.fg,
    moduleTone.leave.fg,
    moduleTone.tasks.fg,
    moduleTone.support.fg,
  ];
}
export function seriesColor(i: number) {
  const series = seriesColors();
  const n = series.length;
  return series[((Math.trunc(Number.isFinite(i) ? i : 0) % n) + n) % n]!;
}

// ── HairlineBars ─────────────────────────────────────────────────────────────
export function HairlineBars({
  values: rawValues,
  labels: rawLabels,
  highlight,
  negative: rawNegative,
  height = 120,
  lines = 6,
  formatTop,
  formatBottom,
  onDark,
  color,
  idleColor,
}: {
  values: number[];
  labels?: string[];
  highlight?: number;
  negative?: number[];
  height?: number; // height of the top half
  lines?: number; // hairlines per period
  formatTop?: (v: number) => string;
  formatBottom?: (v: number) => string;
  onDark?: boolean;
  /** The highlighted period's lines (coral by default; white on dark). */
  color?: string;
  /** The other periods' lines (a soft sunset by default). */
  idleColor?: string;
}) {
  const [w, onLayout] = useWidth();
  const values = nums(rawValues);
  const negative = rawNegative == null ? undefined : nums(rawNegative);
  const labels = Array.isArray(rawLabels) ? rawLabels.map((t) => String(t ?? '')) : undefined;
  const n = Math.max(values.length, 1);
  const max = Math.max(1, ...values, ...(negative ?? []));
  const labelH = labels ? 22 : 0;
  const negH = negative ? height * 0.8 : 0;
  const total = height + labelH + negH;
  const groupW = w / n;
  const pad = Math.max(2, groupW * 0.12);
  const step = (groupW - pad * 2) / Math.max(lines - 1, 1);
  const hiStroke = color ?? (onDark ? palette.onPrimary : palette.coral);
  const idle = idleColor ?? (onDark ? palette.onPrimary : palette.sunset);
  const idleOpacity = idleColor ? 1 : onDark ? 0.3 : 0.45;
  // Figures and labels stay in ink (coloured marks, readable words).
  const ink = onDark ? palette.onPrimary : palette.text;
  const labelColor = onDark ? palette.onPrimaryMuted : palette.textMuted;
  const negIdle = onDark ? palette.onPrimary : palette.danger;
  // The bottom figure on a dark hero sits on the brand gradient (the same in both themes), so it keeps
  // the light theme's soft pink — dark mode's dangerSoft is a dark tint.
  const negInk = onDark ? lightPalette.dangerSoft : palette.dangerInk;
  const hi = highlight ?? -1;

  return (
    <View onLayout={onLayout} style={{ height: total }}>
      {w > 0 && (
        <>
          <GrowIn style={{ position: 'absolute', left: 0, top: 0 }}>
            <Svg width={w} height={height}>
              {values.map((v, g) =>
                Array.from({ length: lines }).map((_, l) => {
                  const h = Math.max(2, (v / max) * (height - 18));
                  const x = g * groupW + pad + l * step;
                  const on = g === hi;
                  return (
                    <Line
                      key={`${g}-${l}`}
                      x1={x}
                      x2={x}
                      y1={height}
                      y2={height - h}
                      stroke={on ? hiStroke : idle}
                      strokeOpacity={on ? 1 : idleOpacity}
                      strokeWidth={on ? 1.8 : 1.3}
                      strokeLinecap="round"
                    />
                  );
                }),
              )}
              {hi >= 0 && hi < values.length && formatTop ? (
                <SvgText
                  x={Math.min(w - 4, hi * groupW + groupW + 4)}
                  y={Math.max(12, height - Math.max(2, (values[hi]! / max) * (height - 18)) + 10)}
                  fontSize={11}
                  fill={ink}
                  fontFamily={font.medium}
                  textAnchor={hi * groupW + groupW + 70 > w ? 'end' : 'start'}>
                  {formatTop(values[hi]!)}
                </SvgText>
              ) : null}
            </Svg>
          </GrowIn>
          {labels ? (
            <Svg width={w} height={labelH} style={{ position: 'absolute', top: height, left: 0 }}>
              {labels.map((t, g) => (
                <SvgText
                  key={t + g}
                  x={g * groupW + groupW / 2}
                  y={15}
                  fontSize={11}
                  textAnchor="middle"
                  fill={g === hi ? ink : labelColor}
                  fontFamily={g === hi ? font.medium : font.regular}>
                  {t}
                </SvgText>
              ))}
            </Svg>
          ) : null}
          {negative ? (
            <View style={{ position: 'absolute', top: height + labelH, left: 0, transform: [{ scaleY: -1 }] }}>
              <GrowIn delay={220}>
                <Svg width={w} height={negH}>
                  {negative.map((v, g) =>
                    Array.from({ length: lines }).map((_, l) => {
                      const h = Math.max(2, (v / max) * negH);
                      const x = g * groupW + pad + l * step;
                      const on = g === hi;
                      return (
                        <Line
                          key={`n${g}-${l}`}
                          x1={x}
                          x2={x}
                          y1={negH}
                          y2={negH - h}
                          stroke={on ? palette.danger : negIdle}
                          strokeOpacity={on ? 0.85 : onDark ? 0.16 : 0.22}
                          strokeWidth={on ? 1.8 : 1.3}
                          strokeLinecap="round"
                        />
                      );
                    }),
                  )}
                </Svg>
              </GrowIn>
            </View>
          ) : null}
          {negative && hi >= 0 && hi < negative.length && formatBottom ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: height + labelH + Math.max(2, (negative[hi]! / max) * negH) - 8, left: 0, width: Math.max(0, hi * groupW - 4) }}>
              <Svg width={Math.max(1, hi * groupW - 4)} height={16}>
                <SvgText x={Math.max(1, hi * groupW - 6)} y={12} fontSize={11} fill={negInk} fontFamily={font.medium} textAnchor="end">
                  {formatBottom(negative[hi]!)}
                </SvgText>
              </Svg>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

// ── DotMatrix ────────────────────────────────────────────────────────────────
// Each column is a value 0..max drawn as stacked dots; filled dots in a 3-step coral → sunset ramp (or
// three strengths of `color`), empty ones a faint tint of the same colour.
export function DotMatrix({ values: rawValues, max, rows = 4, onDark, color }: { values: number[]; max: number; rows?: number; onDark?: boolean; color?: string }) {
  const [w, onLayout] = useWidth();
  const values = nums(rawValues);
  const cols = Math.max(values.length, 1);
  const gap = 6;
  const d = w ? Math.min(18, (w - gap * (cols - 1)) / cols) : 0;
  const h = rows * d + (rows - 1) * gap;
  const shades: { fill: string; opacity: number }[] = onDark
    ? [
        { fill: palette.onPrimary, opacity: 1 },
        { fill: palette.onPrimary, opacity: 0.72 },
        { fill: palette.onPrimary, opacity: 0.45 },
      ]
    : color
      ? [
          { fill: color, opacity: 1 },
          { fill: color, opacity: 0.7 },
          { fill: color, opacity: 0.45 },
        ]
      : [
          { fill: palette.coral, opacity: 1 },
          { fill: palette.sunset, opacity: 1 },
          { fill: palette.sunset, opacity: 0.55 },
        ];
  const empty = onDark ? palette.onPrimary : (color ?? palette.sunset);
  const emptyOpacity = onDark ? 0.12 : 0.14;
  return (
    <View onLayout={onLayout} style={{ height: h || rows * 24 }}>
      {w > 0 && (
        <GrowIn>
          <Svg width={w} height={h}>
            {values.map((v, c) => {
              const filled = max > 0 ? Math.round((Math.min(v, max) / max) * rows) : 0;
              return Array.from({ length: rows }).map((_, r) => {
                const fromBottom = rows - 1 - r;
                const on = fromBottom < filled;
                const shade = shades[(c + r) % shades.length]!;
                const cx = c * (d + gap) + d / 2 + (w - (cols * d + (cols - 1) * gap)) / 2;
                const cy = r * (d + gap) + d / 2;
                return (
                  <Circle key={`${c}-${r}`} cx={cx} cy={cy} r={d / 2} fill={on ? shade.fill : empty} fillOpacity={on ? shade.opacity : emptyOpacity} />
                );
              });
            })}
          </Svg>
        </GrowIn>
      )}
    </View>
  );
}

// ── BarStrip ─────────────────────────────────────────────────────────────────
// A row of rounded bars; the first `filled` are drawn with a sunset → coral fill (or solid `color`),
// the rest in a faint tint of the same colour.
export function BarStrip({ total, filled, height = 64, color }: { total: number; filled: number; height?: number; color?: string }) {
  const [w, onLayout] = useWidth();
  const gid = useSvgId('strip');
  const n = Number.isFinite(total) ? Math.min(Math.max(Math.round(total), 1), 62) : 1;
  const gap = 6;
  const bw = w ? (w - gap * (n - 1)) / n : 0;
  return (
    <View onLayout={onLayout} style={{ height }}>
      {w > 0 && (
        <GrowIn>
          <Svg width={w} height={height}>
            <Defs>
              <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color ?? palette.sunset} stopOpacity={1} />
                <Stop offset="1" stopColor={color ?? palette.coral} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            {Array.from({ length: n }).map((_, i) => {
              const on = i < filled;
              return (
                <Rect
                  key={i}
                  x={i * (bw + gap)}
                  y={0}
                  width={bw}
                  height={height}
                  rx={Math.min(bw / 2, 8)}
                  fill={on ? `url(#${gid})` : (color ?? palette.sunset)}
                  fillOpacity={on ? 1 : 0.16}
                />
              );
            })}
          </Svg>
        </GrowIn>
      )}
    </View>
  );
}

// ── LineChart ────────────────────────────────────────────────────────────────
export function LineChart({
  values: rawValues,
  height = 160,
  guides = [4, 6, 8, 10],
  highlight,
  formatGuide = (v: number) => `${v} H`,
  color = palette.coral,
  fillColor,
}: {
  values: number[];
  height?: number;
  guides?: number[];
  highlight?: number; // index to mark
  formatGuide?: (v: number) => string;
  /** The line and the highlighted point (coral by default). */
  color?: string;
  /** The soft fill under the line (sunset by default, or `color` when one is given). */
  fillColor?: string;
}) {
  const [w, onLayout] = useWidth();
  const gid = useSvgId('area');
  const values = nums(rawValues);
  const left = 34;
  const pad = 10;
  const min = Math.min(...guides, ...values);
  const max = Math.max(...guides, ...values);
  const span = max - min || 1;
  const x = (i: number) => left + (values.length <= 1 ? 0 : (i / (values.length - 1)) * (w - left - pad));
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  let path = '';
  values.forEach((v, i) => {
    if (i === 0) path = `M ${x(0)} ${y(v)}`;
    else {
      const cx = (x(i - 1) + x(i)) / 2;
      path += ` C ${cx} ${y(values[i - 1]!)}, ${cx} ${y(v)}, ${x(i)} ${y(v)}`;
    }
  });
  const area = values.length ? `${path} L ${x(values.length - 1)} ${height} L ${x(0)} ${height} Z` : '';
  const fill = fillColor ?? (color === palette.coral ? palette.sunset : color);
  return (
    <View onLayout={onLayout} style={{ height }}>
      {w > 0 && values.length > 0 && (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={fill} stopOpacity={0.38} />
              <Stop offset="0.7" stopColor={fill} stopOpacity={0.08} />
              <Stop offset="1" stopColor={fill} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {guides.map((g) => (
            <Line key={g} x1={left} x2={w} y1={y(g)} y2={y(g)} stroke={palette.separator} strokeDasharray="3 6" />
          ))}
          {guides.map((g) => (
            <SvgText key={`t${g}`} x={0} y={y(g) + 4} fontSize={11} fill={palette.textMuted} fontFamily={font.regular}>
              {formatGuide(g)}
            </SvgText>
          ))}
          <Path d={area} fill={`url(#${gid})`} />
          <Path d={path} stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {highlight != null && values[highlight] != null && (
            <>
              <Circle cx={x(highlight)} cy={y(values[highlight]!)} r={12} fill={color} fillOpacity={0.14} />
              <Circle cx={x(highlight)} cy={y(values[highlight]!)} r={6} fill={palette.surface} stroke={color} strokeWidth={2.4} />
            </>
          )}
        </Svg>
      )}
    </View>
  );
}

// ── AreaChart (Lendora) ──────────────────────────────────────────────────────
/**
 * One smooth line with Lendora's glow (drawn by GlowLineChart in viz.tsx): a sunset → coral ramp along
 * the line, a soft halo and a faint fill fading to transparent. Optional: one highlighted point
 * (`highlight` index; latest or peak) with a white floating pill from `formatPoint` and a dashed
 * drop-line, muted x labels (`labels`; the highlighted one in ink), and at most one dashed guide line
 * (`guide`, e.g. a daily target, with an optional tiny `guideLabel`). Pass a token as `color` for a
 * module's own colour (one colour instead of the ramp). The baseline is 0 unless `zeroBased={false}`
 * (the range then hugs the data, for series like monthly take-home). Spoken as "label value, …" when
 * there are labels and a `formatPoint`, or pass `accessibilityLabel`.
 *   <AreaChart values={hours} labels={days} highlight={todayIndex} formatPoint={(v) => durationLabel(v * 60)} guide={8} />
 */
export function AreaChart({
  values: rawValues,
  labels,
  highlight,
  formatPoint,
  guide,
  guideLabel,
  color = palette.sunset,
  height = 140,
  zeroBased = true,
  accessibilityLabel,
  style,
}: {
  values: number[];
  labels?: string[];
  highlight?: number | null;
  /** Text of the highlighted point's pill (and of each point for screen readers). */
  formatPoint?: (v: number, i: number) => string;
  /** Value of the one dashed guide line. */
  guide?: number | null;
  guideLabel?: string;
  color?: string;
  /** Height of the plot (the x labels add 22 below it). */
  height?: number;
  zeroBased?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const values = nums(rawValues);
  const n = values.length;
  const hi = highlight != null && Number.isInteger(highlight) && highlight >= 0 && highlight < n ? highlight : -1;
  const points: GlowPoint[] = hi >= 0 ? [{ index: hi, value: formatPoint ? formatPoint(values[hi]!, hi) : undefined }] : [];
  const guides: GlowGuide[] = guide != null && Number.isFinite(guide) ? [{ value: guide, label: guideLabel }] : [];
  return (
    <GlowLineChart
      values={values}
      labels={labels}
      points={points}
      guides={guides}
      // The default sunset keeps the Lendora ramp; any other token draws the line in that one colour.
      color={color === palette.sunset ? undefined : color}
      height={height}
      zeroBased={zeroBased}
      formatValue={formatPoint}
      accessibilityLabel={accessibilityLabel}
      style={style}
    />
  );
}

// ── ProgressBar / SplitBar ───────────────────────────────────────────────────
// Horizontal bars grow out from the left edge once (600 ms, like GrowIn).
function growRight(delay: number) {
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ scaleX: 0.02 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: 200 })),
        transform: [{ scaleX: withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) })) }],
      },
    };
  };
}

/**
 * One rounded bar, `value` 0–1, on a faint tint of its own colour (or `trackColor`, e.g. white on a
 * tinted tile). Coral by default; on a dark hero pass `onDark` (white track) and a `color`.
 * Decorative unless you pass an `accessibilityLabel` (then it is a progressbar for screen readers).
 *   <ProgressBar value={left / total} color={moduleTone.leave.fg} trackColor={palette.surface} />
 */
export function ProgressBar({
  value,
  color,
  trackColor,
  height = 6,
  onDark,
  style,
  accessibilityLabel,
}: {
  value: number;
  color?: string;
  trackColor?: string;
  height?: number;
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const pct = Math.round(v * 100);
  const fill = color ?? (onDark ? palette.onPrimary : palette.coral);
  const r = height / 2;
  const labelled = !!accessibilityLabel;
  return (
    <View
      style={[{ height, borderRadius: r, overflow: 'hidden' }, style]}
      accessible={labelled}
      accessibilityRole={labelled ? 'progressbar' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={labelled ? { min: 0, max: 100, now: pct } : undefined}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}>
      <View
        style={[
          StyleSheet.absoluteFill,
          trackColor ? { backgroundColor: trackColor } : { backgroundColor: onDark ? palette.onPrimary : fill, opacity: onDark ? 0.18 : 0.16 },
        ]}
      />
      {pct > 0 ? (
        <Animated.View entering={growRight(120)} style={{ width: `${pct}%`, height, borderRadius: r, backgroundColor: fill, transformOrigin: 'left' }} />
      ) : null}
    </View>
  );
}

export type SplitSegment = { key: string; value: number; color: string };

/**
 * One rounded bar split into parts by value (2 dp gaps between them), e.g. a salary's components or
 * gross pay as take-home vs deductions. Parts ≤ 0 are left out; nothing renders without a total.
 * Decorative unless given an `accessibilityLabel`; pair it with a ChartLegend.
 */
export function SplitBar({
  segments,
  height = 10,
  style,
  accessibilityLabel,
}: {
  segments: SplitSegment[];
  height?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const parts = (Array.isArray(segments) ? segments : []).filter((s) => s && Number.isFinite(s.value) && s.value > 0);
  const total = parts.reduce((t, s) => t + s.value, 0);
  if (!total) return null;
  const labelled = !!accessibilityLabel;
  return (
    <Animated.View
      entering={growRight(120)}
      style={[{ flexDirection: 'row', gap: 2, height, borderRadius: height / 2, overflow: 'hidden', transformOrigin: 'left' }, style]}
      accessible={labelled}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}>
      {parts.map((s) => (
        <View key={s.key} style={{ flexGrow: s.value, flexBasis: 0, minWidth: 4, backgroundColor: s.color }} />
      ))}
    </Animated.View>
  );
}

export type LegendItem = { key: string; label: string; color: string; value?: string | null };

/** Dot + label (+ a bold value) chips that wrap onto as many lines as they need. */
export function ChartLegend({ items, style }: { items: LegendItem[]; style?: StyleProp<ViewStyle> }) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!list.length) return null;
  return (
    <View style={[legendStyles.wrap, style]}>
      {list.map((it) => (
        <View key={it.key} style={legendStyles.item} accessible accessibilityLabel={[it.label, it.value].filter(Boolean).join(' ')}>
          <View style={[legendStyles.dot, { backgroundColor: it.color }]} />
          <Text variant="caption" muted numberOfLines={1} style={legendStyles.label}>
            {it.label}
          </Text>
          {it.value ? (
            <Text variant="caption" tabular numberOfLines={1} style={{ fontFamily: font.semibold }}>
              {it.value}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const legendStyles = themedStyles(() => ({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: space.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  label: { flexShrink: 1 },
}));
