// The phone's answer to the website's wide tables (dash.html `StickyScrollTable` / `overflowX:auto`
// grids): one vertical scroll for the whole screen, a header row that sticks to the top, a first column
// that stays put while the other columns scroll sideways, and three text sizes instead of pinch-zoom.
//
//   <GridView top={<Toolbar/>} first={nameCol} columns={cols} rows={rows} rowKey={(r) => r.id}
//             zoom={zoom} onRowPress={open} bottom={<ShareButton/>} />
//
// How it is built (no virtualised lists to keep in sync):
//   ScrollView (vertical, stickyHeaderIndices = [1])
//     0  `top`                       scrolls away (summary, search, filters)
//     1  header row                  sticks; its scrolling part is moved by the body's sideways offset
//     2  body: first column │ horizontal ScrollView (every other column)
//     3  `bottom`                    "Show more", notes, share
// The body's sideways offset is a Reanimated shared value; the header strip follows it on the UI thread.
// Rows come in pages of PAGE (Show N more), so a 300-person month sheet never renders 10,000 cells at once.
//
// Rows and cells have one fixed height (from the text size and the system font scale, capped at 1.3×),
// so the first column and the scrolling part always line up. Screen readers get one stop per row (the
// first cell, which reads the row's own summary) instead of hundreds of cells; the row opens a sheet
// with every column in plain words.

import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { themedStyles } from '@/theme/themed';
import { font, palette, radius, space } from '@/theme/tokens';
import { Button, Text, useLayout } from '@/ui';

// ── Types ────────────────────────────────────────────────────────────────────
export type GridTone = 'good' | 'bad' | 'warn' | 'muted' | 'brand' | 'faint';
export type GridFill = 'good' | 'bad' | 'warn' | 'brand' | 'off';
export type GridCell = {
  text: string;
  /** A second, smaller line (only drawn when the grid has `lines={2}`). */
  sub?: string;
  tone?: GridTone;
  fill?: GridFill;
  strong?: boolean;
};
export type CellInput = GridCell | string | number | null | undefined;

export type GridColumn<T> = {
  key: string;
  /** Header text: short, it wraps onto 2 lines at most. */
  label: string;
  /** The full name, for the row sheet and screen readers ("Paid days" for "Paid"). */
  long?: string;
  /** Width at the normal text size, in dp. */
  width: number;
  align?: 'left' | 'right' | 'center';
  cell: (row: T) => CellInput;
  /** Tapping the header sorts by this (numbers high first, text A → Z first). */
  sort?: (row: T) => number | string;
  /** Leave the column out of the row sheet (day columns of a month sheet, say). */
  inSheet?: boolean;
};

/** Text sizes: smaller, normal, bigger — the phone's pinch-free zoom. */
export type Zoom = 0 | 1 | 2;
export const ZOOM_SCALE: Record<Zoom, number> = { 0: 0.85, 1: 1, 2: 1.2 };
export const ZOOM_LABEL: Record<Zoom, string> = { 0: 'Small', 1: 'Normal', 2: 'Large' };

const PAGE = 50;
const CELL_MAX_SCALE = 1.3;
const NBSP = String.fromCharCode(0xa0);

export const cellOf = (v: CellInput): GridCell =>
  v == null ? { text: '—', tone: 'faint' } : typeof v === 'object' ? v : { text: String(v) === '' ? '—' : String(v), tone: String(v) === '' ? 'faint' : undefined };

/** Plain text of a cell, for the row sheet, screen readers and CSV. */
export const cellText = (v: CellInput) => {
  const c = cellOf(v);
  return c.sub ? `${c.text} (${c.sub})` : c.text;
};

function toneColor(t?: GridTone) {
  switch (t) {
    case 'good':
      return palette.successInk;
    case 'bad':
      return palette.dangerInk;
    case 'warn':
      return palette.warningInk;
    case 'brand':
      return palette.primaryText;
    case 'muted':
      return palette.textMuted;
    case 'faint':
      return palette.textFaint;
    default:
      return palette.text;
  }
}
function fillColor(f?: GridFill) {
  switch (f) {
    case 'good':
      return palette.successSoft;
    case 'bad':
      return palette.dangerSoft;
    case 'warn':
      return palette.warningSoft;
    case 'brand':
      return palette.primarySoft;
    case 'off':
      return palette.surfaceMuted;
    default:
      return undefined;
  }
}

// ── Geometry ─────────────────────────────────────────────────────────────────
export function useGridMetrics(zoom: Zoom, lines: 1 | 2) {
  const l = useLayout();
  const z = ZOOM_SCALE[zoom];
  const fs = Math.min(Math.max(l.fontScale || 1, 1), CELL_MAX_SCALE);
  const main = { fontSize: Math.round(13 * z * 10) / 10, lineHeight: Math.round(18 * z) };
  const sub = { fontSize: Math.max(11, Math.round(11.5 * z * 10) / 10), lineHeight: Math.round(15 * z) };
  const padV = Math.round(8 * z);
  const padH = Math.round(10 * z);
  const rowH = Math.ceil(main.lineHeight * fs + (lines === 2 ? sub.lineHeight * fs : 0) + padV * 2 + 2);
  const headH = Math.ceil(2 * sub.lineHeight * fs + padV * 2 + 2);
  // Wider columns as the text grows, so a figure keeps fitting on one line.
  const w = (base: number) => Math.round(base * z * (1 + (fs - 1) * 0.7));
  return { ...l, z, fs, main, sub, padV, padH, rowH, headH, w };
}

// ── Sorting ──────────────────────────────────────────────────────────────────
type SortState = { key: string; dir: 1 | -1 } | null;

function sortRows<T>(rows: T[], cols: GridColumn<T>[], s: SortState): T[] {
  if (!s) return rows;
  const col = cols.find((c) => c.key === s.key);
  if (!col?.sort) return rows;
  const get = col.sort;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (typeof x === 'number' && typeof y === 'number') return (y - x) * s.dir;
    return String(x).localeCompare(String(y), 'en-IN', { sensitivity: 'base', numeric: true }) * s.dir;
  });
}

// ── The grid ─────────────────────────────────────────────────────────────────
export type GridViewProps<T> = {
  rows: T[];
  rowKey: (row: T) => string;
  /** The column that stays put on the left (usually the person). */
  first: GridColumn<T>;
  columns: GridColumn<T>[];
  zoom: Zoom;
  lines?: 1 | 2;
  /** One summary row at the end, always shown (totals). Cells by column key; `first` is its label. */
  totals?: { first: string; cells: Record<string, CellInput> } | null;
  onRowPress?: (row: T) => void;
  /** What a screen reader says for a row (default: the first cell). */
  rowLabel?: (row: T) => string;
  /** Scrolls away above the header row. */
  top?: ReactNode;
  /** After the rows (and the "Show more" button). */
  bottom?: ReactNode;
  /** Shown instead of the grid when there are no rows (loading skeleton, error, empty state). */
  empty?: ReactNode;
  onRefresh?: () => Promise<unknown>;
};

export function GridView<T>({
  rows,
  rowKey,
  first,
  columns,
  zoom,
  lines = 1,
  totals,
  onRowPress,
  rowLabel,
  top,
  bottom,
  empty,
  onRefresh,
}: GridViewProps<T>) {
  const insets = useSafeAreaInsets();
  const m = useGridMetrics(zoom, lines);
  const [sort, setSort] = useState<SortState>(null);
  const [limit, setLimit] = useState(PAGE);
  const [refreshing, setRefreshing] = useState(false);
  const x = useSharedValue(0);
  const onScrollX = useAnimatedScrollHandler({
    onScroll: (e) => {
      x.set(e.contentOffset.x);
    },
  });
  const stripStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -x.get() }] }));

  const cardW = Math.max(240, m.width - m.gutter * 2);
  const firstW = Math.min(m.w(first.width), Math.round(cardW * 0.44));
  const widths = columns.map((c) => m.w(c.width));
  const totalW = widths.reduce((a, b) => a + b, 0);
  const all = [first, ...columns];
  const sorted = sortRows(rows, all, sort);
  const shown = sorted.slice(0, limit);
  const more = sorted.length - shown.length;
  const hasRows = rows.length > 0;

  const tapHeader = (c: GridColumn<T>) => {
    if (!c.sort) return;
    setSort((s) => (s?.key !== c.key ? { key: c.key, dir: 1 } : s.dir === 1 ? { key: c.key, dir: -1 } : null));
  };
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;

  const headerCell = (c: GridColumn<T>, w: number, isFirst: boolean) => {
    const on = sort?.key === c.key;
    const Arrow = on && sort?.dir === -1 ? ArrowUp : ArrowDown;
    const align = isFirst ? 'left' : (c.align ?? 'right');
    return (
      <Pressable
        key={c.key}
        onPress={c.sort ? () => tapHeader(c) : undefined}
        disabled={!c.sort}
        accessibilityRole={c.sort ? 'button' : 'header'}
        accessibilityLabel={c.sort ? `Sort by ${c.long ?? c.label}${on ? (sort?.dir === 1 ? ', sorted' : ', sorted the other way') : ''}` : (c.long ?? c.label)}
        style={[
          styles.headCell,
          { width: w, height: m.headH, paddingHorizontal: m.padH, justifyContent: align === 'left' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end' },
        ]}>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={CELL_MAX_SCALE}
          color={on ? palette.primaryText : palette.textMuted}
          align={align}
          style={[{ fontSize: m.sub.fontSize, lineHeight: m.sub.lineHeight, fontFamily: font.semibold, flexShrink: 1 }]}>
          {c.label}
        </Text>
        {on ? <Arrow size={Math.round(12 * m.z)} color={palette.primaryText} strokeWidth={2.2} /> : null}
      </Pressable>
    );
  };

  const bodyCell = (c: GridColumn<T>, v: CellInput, w: number, isFirst: boolean, total: boolean, key: string) => {
    const cell = cellOf(v);
    const align = isFirst ? 'left' : (c.align ?? 'right');
    return (
      <View
        key={key}
        style={[
          styles.cell,
          { width: w, height: m.rowH, paddingHorizontal: m.padH, alignItems: align === 'left' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end' },
          cell.fill ? { backgroundColor: fillColor(cell.fill) } : null,
        ]}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={CELL_MAX_SCALE}
          tabular
          color={toneColor(cell.tone)}
          align={align}
          style={{ fontSize: m.main.fontSize, lineHeight: m.main.lineHeight, fontFamily: cell.strong || total || isFirst ? font.semibold : font.regular }}>
          {isFirst ? cell.text : cell.text.replace(/ /g, NBSP)}
        </Text>
        {lines === 2 && cell.sub ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={CELL_MAX_SCALE}
            tabular
            color={palette.textMuted}
            align={align}
            style={{ fontSize: m.sub.fontSize, lineHeight: m.sub.lineHeight }}>
            {cell.sub}
          </Text>
        ) : null}
      </View>
    );
  };

  const rowBg = (i: number) => (i % 2 === 1 ? styles.zebra : null);

  return (
    <ScrollView
      style={styles.flex}
      stickyHeaderIndices={hasRows ? [1] : undefined}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      refreshControl={
        refresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primaryText} colors={[palette.primaryText]} progressBackgroundColor={palette.surface} />
        ) : undefined
      }>
      <View style={[styles.top, { paddingHorizontal: m.gutter, gap: m.gap }]}>{top}</View>

      {hasRows ? (
        <View style={[styles.headWrap, { marginHorizontal: m.gutter }]}>
          <View style={styles.headRow}>
            <View style={[styles.firstCol, styles.headFirst]}>{headerCell(first, firstW, true)}</View>
            <View style={[styles.flex, styles.clip]} importantForAccessibility="no">
              <Animated.View style={[styles.row, { width: totalW }, stripStyle]}>{columns.map((c, i) => headerCell(c, widths[i]!, false))}</Animated.View>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ paddingHorizontal: m.gutter }}>{empty}</View>
      )}

      {hasRows ? (
        <View style={[styles.body, { marginHorizontal: m.gutter }]}>
          <View style={[styles.firstCol, { width: firstW }]}>
            {shown.map((r, i) => {
              const label = rowLabel ? rowLabel(r) : cellText(first.cell(r));
              return (
                <Pressable
                  key={rowKey(r)}
                  onPress={onRowPress ? () => onRowPress(r) : undefined}
                  disabled={!onRowPress}
                  accessibilityRole={onRowPress ? 'button' : 'text'}
                  accessibilityLabel={label}
                  accessibilityHint={onRowPress ? 'Opens every column for this row' : undefined}
                  style={({ pressed }) => [rowBg(i), pressed && styles.pressed]}>
                  {bodyCell(first, first.cell(r), firstW, true, false, 'first')}
                </Pressable>
              );
            })}
            {totals ? <View style={styles.totalRow}>{bodyCell(first, { text: totals.first, strong: true }, firstW, true, true, 'first')}</View> : null}
          </View>
          <Animated.ScrollView
            horizontal
            style={styles.flex}
            onScroll={onScrollX}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator
            bounces={false}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden>
            <View style={{ width: totalW }}>
              {shown.map((r, i) => (
                <Pressable
                  key={rowKey(r)}
                  onPress={onRowPress ? () => onRowPress(r) : undefined}
                  disabled={!onRowPress}
                  style={({ pressed }) => [styles.row, rowBg(i), pressed && styles.pressed]}>
                  {columns.map((c, j) => bodyCell(c, c.cell(r), widths[j]!, false, false, c.key))}
                </Pressable>
              ))}
              {totals ? <View style={[styles.row, styles.totalRow]}>{columns.map((c, j) => bodyCell(c, totals.cells[c.key], widths[j]!, false, true, c.key))}</View> : null}
            </View>
          </Animated.ScrollView>
        </View>
      ) : null}

      <View style={[styles.bottom, { paddingHorizontal: m.gutter, gap: m.gap }]}>
        {more > 0 ? <Button title={`Show ${Math.min(more, PAGE)} more`} variant="accent" onPress={() => setLimit((n) => n + PAGE)} /> : null}
        {hasRows ? (
          <Text variant="caption" muted align="center">
            {`${sorted.length} ${sorted.length === 1 ? 'row' : 'rows'}${more > 0 ? `, ${shown.length} shown` : ''} · swipe the table sideways for more columns${all.some((c) => c.sort) ? ' · tap a heading to sort' : ''}`}
          </Text>
        ) : null}
        {bottom}
      </View>
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  clip: { overflow: 'hidden' },
  top: { paddingTop: space.xxs, paddingBottom: space.sm },
  bottom: { paddingTop: space.md },
  row: { flexDirection: 'row' },
  headWrap: {
    backgroundColor: palette.surfaceMuted,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.hairline,
    overflow: 'hidden',
  },
  headRow: { flexDirection: 'row' },
  headFirst: { backgroundColor: palette.surfaceMuted },
  headCell: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  firstCol: { borderRightWidth: 1, borderRightColor: palette.hairline, backgroundColor: palette.surface, zIndex: 1 },
  body: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: palette.hairline,
    overflow: 'hidden',
  },
  cell: { justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: palette.separator },
  zebra: { backgroundColor: palette.pressedTint },
  pressed: { backgroundColor: palette.track },
  totalRow: { backgroundColor: palette.surfaceMuted },
}));
