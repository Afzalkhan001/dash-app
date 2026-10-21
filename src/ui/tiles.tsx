// Payno / Lendora lists & tiles — docs/REFERENCE-COMPONENTS.md items 6–15 (ActivityList / ActivityRow,
// item 8, live in list.tsx). Everything here is a frosted surface on the canvas wash: translucent
// white (palette.frost / frostStrong) with a bright rim and a very soft, wide shadow on iOS; Android
// (no blur, no shadow on translucent fills) gets more body and a hairline rim. Inside a Sheet
// (SurfaceContext 'sheet') the frost turns solid white so it still reads on the sheet's ivory.
//
//   SectionHeader  title (regular 17, ink) + a muted "See all" / "View All" link or one control
//   AvatarTiles    horizontal row of frosted 96 × 100 people tiles (+ an optional "Add new" tile)
//   CategoryGrid   4 per row of frosted circles with a thin module-coloured icon and a label under
//                  (QuickActions renders through it)
//   UpcomingCards  horizontal, snapping row of wide frosted cards: icon top, title + value, sub + meta
//   SelectTiles    2–4 equal frosted square tiles, single select (radio group)
//   AccountRow     frosted row: icon circle, title + muted sub, small frosted "Change" pill
//   SummaryCard    frosted key → value rows, optional title, status-pill values and a larger total
//   MetricRow      frosted row: dot + label, light big fraction "6/20", soft status pill, •••
//   PillSelector   small frosted pill: glyph / icon, label, chevron — opens the caller's picker
//
// All of them work at 320 dp and with large text: tiles grow with the text size, rows move their
// right-hand parts under the text, and every touch target is at least 48 dp.

import { Check, ChevronDown, type LucideIcon, MoreHorizontal, Plus } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, Platform, Pressable, Text as RNText, ScrollView, type StyleProp, View, type ViewStyle } from 'react-native';

import { font, layout, type ModuleKey, moduleTone, palette, radius, shadow, space, statusTone, type StatusTone } from '@/theme/tokens';
import { haptic } from '@/ui/haptics';
import { hitSlopFor, type LayoutInfo, shouldStack, useLayout } from '@/ui/layout';
import { PressableScale } from '@/ui/motion';
import { Avatar, frostSurface } from '@/ui/primitives';
import { useSurface } from '@/ui/surface';
import { Text } from '@/ui/text';
import { TourTarget } from '@/ui/tour/target';

import { themedStyles } from '@/theme/themed';
const IOS = Platform.OS === 'ios';
/** Web: let a value with no break points (an email, a URL) wrap anywhere instead of running past the card. Phones already do. */
const BREAK_ANYWHERE = Platform.OS === 'web' ? ({ overflowWrap: 'anywhere' } as object) : null;
// Token reads live in functions (called from the themedStyles factory or at render), never in
// module-level constants, so they follow the light / dark switch.
/** The frosted rim: a bright edge on iOS, a hairline on Android. */
const rim = () => (IOS ? palette.glassEdge : palette.glassLine);
/** Payno's very soft, wide shadow under frosted surfaces (iOS only; the same as primitives' frost shadow). */
const softShadow = (): ViewStyle | null =>
  IOS ? { ...shadow.soft, shadowOpacity: 0.06, shadowRadius: 28, shadowOffset: { width: 0, height: 12 } } : null;
/** Room above and below a horizontal row so the tiles' soft shadows aren't clipped by the ScrollView. */
const SHADOW_ROOM = space.sm;
const GAP = space.xs;

// ── Shared ───────────────────────────────────────────────────────────────────

/** How far a horizontal row bleeds past its parent's padding: the screen gutter, a card's padding, or not at all. */
export type TileBleed = 'screen' | 'card' | 'none';

function bleedPad(bleed: TileBleed, l: LayoutInfo) {
  return bleed === 'card' ? l.cardPad : bleed === 'none' ? 0 : l.gutter;
}

/** The frosted fill for the surface we are on: translucent white with a bright rim on the canvas, solid white with a hairline in a sheet. */
function useFrost(level: 'frost' | 'strong' = 'frost'): ViewStyle {
  const surface = useSurface();
  if (surface === 'sheet') return { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.glassLine };
  return frostSurface(level);
}

/** A fixed tile size grows with the system text size (100–135 %), so large text gets bigger tiles instead of clipped labels. */
function grow(fontScale: number, cap = 1.35) {
  return Math.min(Math.max(fontScale, 1), cap);
}

/** A white round holder with a thin module-coloured line icon (the Payno icon circle). */
function IconCircle({ icon: Icon, module, size = 40, color }: { icon: LucideIcon; module?: ModuleKey; size?: number; color?: string }) {
  const fg = color ?? (module ? (moduleTone[module] ?? moduleTone.profile).fg : palette.ink);
  return (
    <View style={[styles.iconCircle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Icon size={Math.round(size * 0.46)} color={fg} strokeWidth={1.7} />
    </View>
  );
}

// Soft tinted status pills (Lendora: grey Active, yellow Complete, coral Overdue; Payno "• Completed").
function softStatusFill(tone: StatusTone): string {
  switch (tone) {
    case 'pending':
      return palette.warningSoft;
    case 'done':
      return palette.successSoft;
    case 'failed':
      return palette.dangerSoft;
    case 'info':
      return palette.primarySoft;
    default:
      return palette.surfaceSunken;
  }
}

function SoftPill({ label, tone, dot = true }: { label: string; tone: StatusTone; dot?: boolean }) {
  const t = statusTone[tone] ?? statusTone.neutral;
  return (
    <View style={[styles.softPill, { backgroundColor: softStatusFill(tone) }]}>
      {dot ? <View style={[styles.softDot, { backgroundColor: t.dot }]} /> : null}
      <Text variant="caption" color={t.fg} numberOfLines={1} maxFontSizeMultiplier={1.25} style={styles.medium}>
        {label}
      </Text>
    </View>
  );
}

// ── SectionHeader ────────────────────────────────────────────────────────────

/**
 * Section title in the Payno style: regular 17 px ink (up to 2 lines, optional muted overline) with a
 * quiet muted text link on the right ("See all" / "View All", 44 high, 48 dp touch target), or one
 * control of your own in `right`.
 *   <SectionHeader title="Coming up" actionLabel="View All" onAction={() => router.push('/holidays')} />
 */
export function SectionHeader({
  title,
  overline,
  actionLabel = 'See all',
  onAction,
  actionAccessibilityLabel,
  right,
  style,
}: {
  title: string;
  overline?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Spoken label of the link (defaults to "See all, <title>"). */
  actionAccessibilityLabel?: string;
  /** Replaces the link (one control at most). */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const control =
    right ??
    (onAction ? (
      <Pressable
        onPress={onAction}
        hitSlop={{ top: 2, bottom: 2, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={actionAccessibilityLabel ?? `${actionLabel}, ${title}`}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
        <Text variant="label" muted numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {actionLabel}
        </Text>
      </Pressable>
    ) : null);
  return (
    <View style={[styles.sectionHead, style]}>
      <View style={styles.flexText}>
        {overline ? (
          <Text variant="label" muted numberOfLines={1}>
            {overline}
          </Text>
        ) : null}
        <Text variant="heading" color={palette.ink} numberOfLines={2} accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
      </View>
      {control ? <View style={styles.sectionRight}>{control}</View> : null}
    </View>
  );
}

// ── AvatarTiles ──────────────────────────────────────────────────────────────

export type AvatarTileItem = {
  key: string;
  name: string;
  /** Photo (https, data: or an authenticated /api path); initials in the person's own tint without one. */
  uri?: string | null;
  /** A short muted line under the name ("In · 9:12", "Birthday"). */
  sub?: string | null;
  /** A small status dot on the avatar in that tone's colour (done = in, pending = late, neutral = away). */
  dot?: StatusTone | null;
  onPress?: () => void;
  /** Spoken label (defaults to name + sub — say what the dot means here, e.g. "Priya Sharma, in since 9:12"). */
  accessibilityLabel?: string;
  hint?: string;
};

const PERSON_W = 96;
const PERSON_H = 100;
const PERSON_AVATAR = 44;

/**
 * Payno "Recent Recipients": a horizontal row of frosted rounded-square tiles (96 × 100, radius 20),
 * each a 44 dp photo / initials avatar (optional status dot) centred over the name (1–2 lines) and an
 * optional muted line. `onAdd` appends an "Add new" tile with a + circle. The row bleeds to the
 * screen edges (`bleed`), and tiles grow with large text.
 *   <AvatarTiles items={people.map((p) => ({ key: p.id, name: p.name, uri: p.photo, dot: 'done', onPress: … }))} />
 */
export function AvatarTiles({
  items,
  onAdd,
  addLabel = 'Add new',
  addHint,
  bleed = 'screen',
  accessibilityLabel,
  style,
}: {
  items: AvatarTileItem[];
  onAdd?: () => void;
  addLabel?: string;
  addHint?: string;
  bleed?: TileBleed;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const l = useLayout();
  const frost = useFrost('frost');
  const pad = bleedPad(bleed, l);
  const width = Math.round(PERSON_W * grow(l.fontScale));
  const list = (Array.isArray(items) ? items : []).filter((it) => it && it.name);
  if (!list.length && !onAdd) return null;
  const frame = [styles.personTile, frost, { width }];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={accessibilityLabel}
      style={[{ marginHorizontal: -pad, marginVertical: -SHADOW_ROOM, flexGrow: 0 }, style]}
      contentContainerStyle={[styles.hRow, { paddingHorizontal: pad, paddingVertical: SHADOW_ROOM }]}>
      {list.map((it) => (
        <PersonTile key={it.key} item={it} frame={frame} />
      ))}
      {onAdd ? (
        <PressableScale onPress={onAdd} scaleTo={0.96} accessibilityRole="button" accessibilityLabel={addLabel} accessibilityHint={addHint} style={frame}>
          <View style={styles.addCircle}>
            <Plus size={20} color={palette.ink} strokeWidth={1.8} />
          </View>
          <Text variant="label" color={palette.ink} align="center" numberOfLines={2} maxFontSizeMultiplier={1.35} style={styles.medium}>
            {addLabel}
          </Text>
        </PressableScale>
      ) : null}
    </ScrollView>
  );
}

function PersonTile({ item, frame }: { item: AvatarTileItem; frame: StyleProp<ViewStyle> }) {
  const dot = item.dot ? (statusTone[item.dot] ?? statusTone.neutral).dot : null;
  const spoken = item.accessibilityLabel ?? [item.name, item.sub].filter(Boolean).join(', ');
  const body = (
    <>
      <View>
        <Avatar name={item.name} uri={item.uri} size={PERSON_AVATAR} ring={false} />
        {dot ? <View style={[styles.avatarDot, { backgroundColor: dot }]} /> : null}
      </View>
      <View style={styles.personText}>
        <Text variant="label" color={palette.ink} align="center" numberOfLines={2} maxFontSizeMultiplier={1.35} style={[styles.medium, styles.personName]}>
          {item.name}
        </Text>
        {item.sub ? (
          <Text variant="caption" muted align="center" numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {item.sub}
          </Text>
        ) : null}
      </View>
    </>
  );
  if (!item.onPress) {
    return (
      <View style={frame} accessible accessibilityLabel={spoken}>
        {body}
      </View>
    );
  }
  return (
    <PressableScale onPress={item.onPress} scaleTo={0.96} accessibilityRole="button" accessibilityLabel={spoken} accessibilityHint={item.hint} style={frame}>
      {body}
    </PressableScale>
  );
}

// ── CategoryGrid ─────────────────────────────────────────────────────────────

export type CategoryItem = {
  key: string;
  /** One or two words, a verb first where it starts something ("Apply leave", "Payslips"). */
  label: string;
  icon: LucideIcon;
  /** The module whose colour the icon carries (moduleTone[x].fg); none = ink (e.g. "More"). */
  module?: ModuleKey;
  onPress: () => void;
  /** A neutral ink count bubble (hidden at 0, "99+" cap), or `true` for a small brand dot. Never red. */
  badge?: number | boolean;
  /** Screen-reader hint, e.g. "Opens a new expense claim". */
  hint?: string;
  /** Overrides the spoken label (defaults to the label, plus the count). */
  accessibilityLabel?: string;
  disabled?: boolean;
  /** Marks this tile as a tour target (docs/TOUR.md, e.g. 'more.myTeam'). */
  tourId?: string;
};

/** Where the grid sits: 'auto' = frosted circles on the canvas (solid white in a Sheet); 'card' = soft filled circles inside a white or frosted card. */
export type CategorySurface = 'auto' | 'card';

const LABEL_PX = 12;
const FLOOR_PX = 11; // nothing below 11 px anywhere
const MAX_SCALE = 1.3; // labels in a full row never grow past 130 %
const GRID_SCALE = 1.4; // in the 2-per-row fallback they may grow to 140 % (the caption cap)
const EM = 0.58; // Plus Jakarta Sans: average glyph width ≈ 0.58 em (a little generous)
const ROW_GAP = space.md;

// How many lines `label` needs in `width` with glyphs `cw` wide; Infinity when one word would have to
// break mid-word.
function linesNeeded(label: string, width: number, cw: number) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  let lines = 1;
  let used = 0;
  for (const w of words) {
    const len = w.length * cw;
    if (len > width) return Infinity;
    if (used === 0) used = len;
    else if (used + cw + len <= width) used += cw + len;
    else {
      lines += 1;
      used = len;
    }
  }
  return lines;
}

function allFit(labels: string[], width: number, px: number, scale: number) {
  const cw = px * EM * scale;
  return labels.every((l) => linesNeeded(l, width, cw) <= 2);
}

type GridPlan = { columns: number; px: number; maxScale: number };

// Keep the row while every label fits its tile whole in ≤ 2 lines: default text on a very narrow phone
// drops labels to 11 px; a little larger text grows only as far as it still fits. When 4 across can't
// hold them (a 320 dp sheet: "attendance", "Petty cash bill"), try 3 across before falling back to 2
// per row, where labels have room to grow (large text > 115 %).
function fitRow(labels: string[], avail: number, n: number, fontScale: number): GridPlan | null {
  const tile = (avail - GAP * (n - 1)) / n;
  const want = Math.min(Math.max(fontScale, 1), MAX_SCALE);
  if (allFit(labels, tile, LABEL_PX, want)) return { columns: n, px: LABEL_PX, maxScale: MAX_SCALE };
  if (fontScale <= 1 && allFit(labels, tile, FLOOR_PX, 1)) return { columns: n, px: FLOOR_PX, maxScale: 1 };
  if (fontScale <= layout.largeTextScale) {
    for (let s = want; s >= 1; s -= 0.05) {
      if (allFit(labels, tile, LABEL_PX, s)) return { columns: n, px: LABEL_PX, maxScale: Math.max(1, s) };
    }
  }
  return null;
}

function planGrid(labels: string[], avail: number, perRow: number, fontScale: number): GridPlan {
  return (
    fitRow(labels, avail, perRow, fontScale) ??
    (perRow > 3 ? fitRow(labels, avail, 3, fontScale) : null) ?? { columns: Math.min(2, perRow), px: LABEL_PX, maxScale: GRID_SCALE }
  );
}

/**
 * Payno "Bill Pay" grid: up to 4 per row of frosted circles (56) with a thin line icon in the module's
 * colour and a label of one or two words under it (2 lines max, centred). Fewer items than `columns`
 * share one row evenly; more wrap. Badges are neutral (ink count or brand dot), never red. The width
 * is measured, so it also fits inside a card (pass `surface="card"` there). Hide an action the person
 * can't use rather than disabling it. QuickActions renders through this.
 *   <CategoryGrid items={[{ key: 'leave', label: 'Apply leave', icon: CalendarPlus, module: 'leave', onPress }]} />
 */
export function CategoryGrid({
  items,
  columns = 4,
  size = 56,
  surface = 'auto',
  style,
}: {
  items: CategoryItem[];
  /** Most tiles in one row (default 4). */
  columns?: 2 | 3 | 4;
  /** Circle diameter (default 56; 48–60 reads best). */
  size?: number;
  surface?: CategorySurface;
  style?: StyleProp<ViewStyle>;
}) {
  const { width, gutter, fontScale } = useLayout();
  const inSheet = useSurface() === 'sheet';
  const [measured, setMeasured] = useState(0);
  const list = (Array.isArray(items) ? items : []).filter((it) => it && it.label);
  if (!list.length) return null;

  const avail = measured || width - gutter * 2;
  const perRow = Math.min(list.length, columns);
  const p = planGrid(
    list.map((it) => it.label),
    avail,
    perRow,
    fontScale,
  );
  const evenRow = list.length <= p.columns; // one row: the tiles share it with flex 1
  const tileW = (avail - GAP * (p.columns - 1)) / p.columns;
  const disc = surface === 'card' ? styles.discCard : inSheet ? styles.discSheet : styles.discFrost;
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== measured) setMeasured(w);
  };

  return (
    <View onLayout={onLayout} style={[styles.grid, style]}>
      {list.map((it) => (
        <CategoryTile
          key={it.key}
          item={it}
          size={size}
          px={p.px}
          maxScale={p.maxScale}
          disc={disc}
          style={evenRow ? styles.flexTile : { width: Math.max(0, Math.floor(tileW)) }}
        />
      ))}
    </View>
  );
}

function CategoryTile({
  item,
  size,
  px,
  maxScale,
  disc,
  style,
}: {
  item: CategoryItem;
  size: number;
  px: number;
  maxScale: number;
  disc: ViewStyle;
  style: StyleProp<ViewStyle>;
}) {
  const fg = item.module ? (moduleTone[item.module] ?? moduleTone.profile).fg : palette.ink;
  const Icon = item.icon;
  const count = typeof item.badge === 'number' && Number.isFinite(item.badge) && item.badge > 0 ? Math.round(item.badge) : 0;
  const dot = item.badge === true;
  const spoken = item.accessibilityLabel ?? (count ? `${item.label}, ${count}` : item.label);
  // A tour target: the wrapper takes the tile's slot in the grid and the tile fills it.
  const tile = (
    <PressableScale
      onPress={item.onPress}
      disabled={item.disabled}
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={item.hint}
      accessibilityState={{ disabled: !!item.disabled }}
      style={[styles.catTile, item.tourId ? styles.catTileFill : style, item.disabled && styles.disabled]}>
      <View style={[styles.disc, disc, { width: size, height: size, borderRadius: size / 2 }]}>
        <Icon size={Math.round(size * 0.42)} color={fg} strokeWidth={1.6} />
        {count ? (
          <View style={styles.count} pointerEvents="none">
            <Text variant="micro" color={palette.surface} maxFontSizeMultiplier={1}>
              {count > 99 ? '99+' : count}
            </Text>
          </View>
        ) : dot ? (
          <View style={[styles.brandDot, { top: Math.round(size * 0.04), right: Math.round(size * 0.04) }]} pointerEvents="none" />
        ) : null}
      </View>
      <Text
        variant="caption"
        color={palette.text}
        align="center"
        numberOfLines={2}
        maxFontSizeMultiplier={maxScale}
        style={[styles.catLabel, px !== LABEL_PX && { fontSize: px, lineHeight: Math.round(px * 1.36) }]}>
        {item.label}
      </Text>
    </PressableScale>
  );
  if (!item.tourId) return tile;
  return (
    <TourTarget id={item.tourId} radius={radius.lg} style={style}>
      {tile}
    </TourTarget>
  );
}

// ── UpcomingCards ────────────────────────────────────────────────────────────

export type UpcomingItem = {
  key: string;
  title: string;
  /** The figure on the title's line, right-aligned ("₹48,250", "2 days", "Fri 31 Oct"). */
  value?: string | null;
  valueColor?: string;
  /** Muted line under the title ("Credited 30 Oct", "AC •••• 4125"), up to 2 lines. */
  sub?: string | null;
  /** A short muted line under the value, right-aligned ("Due tomorrow", "In 3 days"). */
  meta?: string | null;
  /** Icon circle top-left: a thin module-coloured icon on white… */
  icon?: LucideIcon;
  module?: ModuleKey;
  /** …or your own leading element (a ModuleBadge, an Avatar). */
  left?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  hint?: string;
};

const UP_H = 140;
const UP_ICON = 44;

/**
 * Payno "Upcoming Payments": a horizontal, snapping row of wide frosted cards (about two-thirds of the
 * window, 200–280 × 140, radius 24): an icon circle top-left with empty air under it, and at the
 * bottom the title with the value on the same line (right), then a muted sub with an optional muted
 * `meta` under the value ("Due tomorrow"). The next card always peeks; cards grow with large text,
 * where the value and meta move under the title.
 *   <UpcomingCards items={[{ key: 'pay', icon: Banknote, module: 'pay', title: 'Payday', value: '₹48,250', sub: 'Thu, 30 Oct', meta: 'In 10 days' }]} />
 */
export function UpcomingCards({
  items,
  bleed = 'screen',
  cardWidth,
  accessibilityLabel,
  style,
}: {
  items: UpcomingItem[];
  bleed?: TileBleed;
  /** Card width at 100 % text (default: 64 % of the window, 200–280). */
  cardWidth?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const l = useLayout();
  const frost = useFrost('frost');
  const pad = bleedPad(bleed, l);
  const stack = shouldStack(l, { text: 'large' });
  const base = cardWidth ?? Math.min(280, Math.max(200, l.width * 0.64));
  // Never wider than the window minus a peek of the next card.
  const width = Math.round(Math.max(150, Math.min(base * grow(l.fontScale), l.width - pad - space.xxxl - GAP)));
  const list = (Array.isArray(items) ? items : []).filter((it) => it && it.title);
  if (!list.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={width + space.sm}
      snapToAlignment="start"
      decelerationRate="fast"
      disableIntervalMomentum
      accessibilityLabel={accessibilityLabel}
      style={[{ marginHorizontal: -pad, marginVertical: -SHADOW_ROOM, flexGrow: 0 }, style]}
      contentContainerStyle={[styles.hRow, { paddingHorizontal: pad, paddingVertical: SHADOW_ROOM }]}>
      {list.map((it) => (
        <UpcomingCard key={it.key} item={it} frame={[styles.upCard, frost, { width }]} stack={stack} />
      ))}
    </ScrollView>
  );
}

function UpcomingCard({ item, frame, stack }: { item: UpcomingItem; frame: StyleProp<ViewStyle>; stack: boolean }) {
  const lead = item.left ?? (item.icon ? <IconCircle icon={item.icon} module={item.module} size={UP_ICON} /> : null);
  const value = item.value ? (
    <Text
      variant="body"
      color={item.valueColor ?? palette.ink}
      tabular
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      maxFontSizeMultiplier={1.3}
      align={stack ? 'left' : 'right'}
      style={[styles.medium, stack ? null : styles.upValue]}>
      {item.value}
    </Text>
  ) : null;
  const meta = item.meta ? (
    <Text variant="caption" muted numberOfLines={1} maxFontSizeMultiplier={1.35} align={stack ? 'left' : 'right'} style={stack ? null : styles.upValue}>
      {item.meta}
    </Text>
  ) : null;
  const sub = item.sub ? (
    <Text variant="caption" muted numberOfLines={2} maxFontSizeMultiplier={1.35} style={styles.flexText}>
      {item.sub}
    </Text>
  ) : null;
  const title = (
    <Text variant="body" color={palette.ink} numberOfLines={2} maxFontSizeMultiplier={1.35} style={[styles.medium, styles.flexText]}>
      {item.title}
    </Text>
  );
  const spoken = item.accessibilityLabel ?? [item.title, item.value, item.sub, item.meta].filter(Boolean).join(', ');
  const body = (
    <>
      {lead ? <View style={styles.upTop}>{lead}</View> : null}
      {stack ? (
        <View style={styles.upText}>
          {title}
          {value}
          {sub}
          {meta}
        </View>
      ) : (
        <View style={styles.upText}>
          <View style={styles.upLine}>
            {title}
            {value}
          </View>
          {sub || meta ? (
            <View style={styles.upLine}>
              {sub ?? <View style={styles.flexText} />}
              {meta}
            </View>
          ) : null}
        </View>
      )}
    </>
  );
  if (!item.onPress) {
    return (
      <View style={frame} accessible accessibilityLabel={spoken}>
        {body}
      </View>
    );
  }
  return (
    <PressableScale onPress={item.onPress} scaleTo={0.97} accessibilityRole="button" accessibilityLabel={spoken} accessibilityHint={item.hint} style={frame}>
      {body}
    </PressableScale>
  );
}

// ── SelectTiles ──────────────────────────────────────────────────────────────

export type SelectTileOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Muted line under the label ("4 left", "Geo-fenced"). */
  sub?: string | null;
  disabled?: boolean;
  hint?: string;
};

const SELECT_PX = 13;
const SELECT_MIN_W = 72;
const SELECT_PAD_X = space.xxs; // tight side padding so "Comp-off" / "Bank account" stay whole 4 across
const SELECT_RIM = 1.5;

/**
 * Payno "Select Payment Method": 2–4 equal frosted square tiles, each a bare thin line icon (24) over
 * a label (+ optional muted sub). Single select: the chosen tile gets a brand rim, a subtle
 * primarySoft fill, a brand icon and label and a small ✓ in its top-right corner — so the choice never
 * rests on colour alone. A radio group for screen readers. All in one row while every label fits whole
 * (never broken mid-word); otherwise 2 per row (1 with huge text).
 *   <SelectTiles value={kind} onChange={setKind} accessibilityLabel="Leave type" options={[
 *     { value: 'casual', label: 'Casual', icon: Sun }, { value: 'sick', label: 'Sick', icon: HeartPulse } ]} />
 */
export function SelectTiles<T extends string>({
  options,
  value,
  onChange,
  columns,
  accessibilityLabel,
  style,
}: {
  options: SelectTileOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  /** Tiles in one row (default: all of them, up to 4). */
  columns?: 2 | 3 | 4;
  /** What is being chosen ("Leave type") — read out for the group. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const l = useLayout();
  const frost = useFrost('frost');
  const [measured, setMeasured] = useState(0);
  const list = (Array.isArray(options) ? options : []).filter((o) => o && o.label).slice(0, 4);
  if (!list.length) return null;

  const avail = measured || l.width - l.gutter * 2;
  const labels = list.map((o) => o.label);
  const scale = grow(l.fontScale);
  const fits = (n: number) => {
    const tile = (avail - GAP * (n - 1)) / n;
    return tile >= SELECT_MIN_W && allFit(labels, tile - 2 * (SELECT_PAD_X + SELECT_RIM) - 4, SELECT_PX, scale);
  };
  const want = Math.min(columns ?? list.length, list.length);
  const perRow = fits(want) ? want : want > 2 && fits(2) ? 2 : 1;
  const tileW = Math.floor((avail - GAP * (perRow - 1)) / perRow);
  // Near-square in a 4-up row (Payno ≈ 88 × 92); wider tiles in a 2-up row stop at 100 high.
  const square = perRow > 1 ? Math.min(tileW, 100) : 0;
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== measured) setMeasured(w);
  };

  return (
    <View onLayout={onLayout} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.grid, style]}>
      {list.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <PressableScale
            key={o.value}
            onPress={() => {
              if (on) return;
              haptic.select();
              onChange(o.value);
            }}
            disabled={o.disabled}
            scaleTo={0.96}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !!o.disabled }}
            accessibilityLabel={[o.label, o.sub].filter(Boolean).join(', ')}
            accessibilityHint={o.hint}
            style={[
              styles.selTile,
              frost,
              styles.selRim,
              { minHeight: Math.max(88, square) },
              list.length <= perRow ? styles.flexTile : { width: tileW },
              on && styles.selOn,
              o.disabled && styles.disabled,
            ]}>
            {on ? (
              <View style={styles.selCheck} pointerEvents="none">
                <Check size={10} color={palette.onPrimary} strokeWidth={3.2} />
              </View>
            ) : null}
            {Icon ? <Icon size={24} color={on ? palette.primaryText : palette.text} strokeWidth={1.6} /> : null}
            <Text variant="label" color={on ? palette.primaryText : palette.ink} align="center" numberOfLines={2} maxFontSizeMultiplier={1.35} style={styles.medium}>
              {o.label}
            </Text>
            {o.sub ? (
              <Text variant="caption" muted align="center" numberOfLines={2} maxFontSizeMultiplier={1.35}>
                {o.sub}
              </Text>
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

// ── AccountRow ───────────────────────────────────────────────────────────────

/**
 * Payno "Payno Card •••• 4125 [Change]": a frosted row with an icon circle (or your own `left`), a
 * title over a muted sub (masked numbers, a project code), and a small frosted "Change" pill on the
 * right. `onChange` drives the pill; `onPress` makes the text part a button too (then the pill stays a
 * separate stop). Below 340 dp or above 130 % text the pill moves under the text.
 *   <AccountRow icon={Landmark} module="pay" title="HDFC Bank" sub="Salary account •••• 4125" onChange={openPicker} />
 */
export function AccountRow({
  title,
  sub,
  icon,
  module,
  left,
  actionLabel = 'Change',
  onChange,
  onPress,
  accessibilityLabel,
  actionAccessibilityLabel,
  hint,
  subLines,
  subEllipsize = 'tail',
  style,
}: {
  title: string;
  sub?: string | null;
  icon?: LucideIcon;
  module?: ModuleKey;
  left?: ReactNode;
  actionLabel?: string;
  onChange?: () => void;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Spoken label of the pill (defaults to "Change <title>"). */
  actionAccessibilityLabel?: string;
  hint?: string;
  /** Lines for `sub` (default 2). */
  subLines?: 1 | 2;
  /** How a cut `sub` is shortened: 'tail' (default) or 'middle' — for URLs and file names, which keep both ends. */
  subEllipsize?: 'tail' | 'middle';
  style?: StyleProp<ViewStyle>;
}) {
  const l = useLayout();
  const frost = useFrost('frost');
  const stack = shouldStack(l, { below: 'tight', text: 'huge' });
  const lead = left ?? (icon ? <IconCircle icon={icon} module={module} size={44} /> : null);
  const spoken = accessibilityLabel ?? [title, sub].filter(Boolean).join(', ');
  const pillText = (
    <Text variant="label" color={palette.ink} numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.medium}>
      {actionLabel}
    </Text>
  );
  const action = onChange ? (
    <PressableScale
      onPress={onChange}
      scaleTo={0.95}
      hitSlop={hitSlopFor(32, 4)}
      accessibilityRole="button"
      accessibilityLabel={actionAccessibilityLabel ?? `${actionLabel} ${title}`}
      style={styles.changePill}>
      {pillText}
    </PressableScale>
  ) : onPress ? (
    <View style={styles.changePill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {pillText}
    </View>
  ) : null;
  const text = (
    <View style={styles.flexText}>
      <Text variant="body" color={palette.ink} numberOfLines={2} style={styles.medium}>
        {title}
      </Text>
      {sub ? (
        <Text variant="label" muted tabular numberOfLines={subLines ?? (subEllipsize === 'middle' ? 1 : 2)} ellipsizeMode={subEllipsize}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
  const head = (
    <>
      {lead}
      {text}
    </>
  );
  const under = stack && action ? <View style={[styles.underAction, lead ? { paddingLeft: 44 + space.sm } : null]}>{action}</View> : null;

  // Only onPress: the whole row is one button and the pill is a picture of the action.
  if (onPress && !onChange) {
    return (
      <PressableScale
        onPress={onPress}
        scaleTo={0.985}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint={hint ?? actionLabel}
        style={[styles.accountRow, frost, style]}>
        <View style={styles.rowLine}>
          {head}
          {stack ? null : action}
        </View>
        {under}
      </PressableScale>
    );
  }
  return (
    <View style={[styles.accountRow, frost, style]}>
      <View style={styles.rowLine}>
        {onPress ? (
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={spoken}
            accessibilityHint={hint}
            style={({ pressed }) => [styles.rowLine, styles.flexText, pressed && styles.pressed]}>
            {head}
          </Pressable>
        ) : (
          <View style={[styles.rowLine, styles.flexText]} accessible accessibilityLabel={spoken}>
            {head}
          </View>
        )}
        {stack ? null : action}
      </View>
      {under}
    </View>
  );
}

// ── SummaryCard ──────────────────────────────────────────────────────────────

export type SummaryItem = {
  key?: string;
  label: string;
  value?: string | number | null;
  /** Show the value as a soft status pill in this tone ("• Completed", "• Pending"). */
  status?: StatusTone | null;
  valueColor?: string;
  /** Small muted line under the value. */
  hint?: string | null;
};

function formatValue(v: string | number | null | undefined) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString('en-IN') : '—';
  return String(v);
}

/**
 * Payno "Transfer Summary": a frosted card of key → value rows — muted keys on the left, values on
 * the right (medium, ink, tabular) — with an optional title, status-pill values and one emphasised
 * `total` row (larger, after a dashed rule). Long values, narrow phones (< 360 dp with long values)
 * and very large text put the value under its key, so nothing is ever squeezed.
 *   <SummaryCard title="Leave summary" rows={[{ label: 'Type', value: 'Casual leave' }, { label: 'Status', value: 'Pending', status: 'pending' }]}
 *     total={{ label: 'Days', value: '2' }} />
 */
export function SummaryCard({
  title,
  right,
  rows,
  total,
  hideEmpty,
  style,
}: {
  title?: string;
  /** One control beside the title. */
  right?: ReactNode;
  rows: SummaryItem[];
  total?: { label: string; value: string | number | null | undefined; hint?: string | null } | null;
  /** Drop rows whose value is null, undefined or ''. */
  hideEmpty?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const l = useLayout();
  const frost = useFrost('strong');
  const huge = shouldStack(l, { text: 'huge' });
  const narrow = shouldStack(l, { below: 'narrow' });
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.label && (!hideEmpty || (r.value != null && r.value !== '')));
  // The text width inside the card (a screen-level card; a sheet is a little wider, which only helps).
  const inner = l.width - l.gutter * 2 - l.cardPad * 2;
  return (
    <View style={[styles.summary, frost, { padding: l.cardPad }, style]}>
      {title || right ? (
        <View style={styles.sectionHead}>
          {title ? (
            <Text variant="heading" color={palette.ink} numberOfLines={2} accessibilityRole="header" style={[styles.sectionTitle, styles.flexText]}>
              {title}
            </Text>
          ) : (
            <View style={styles.flexText} />
          )}
          {right ? <View style={styles.sectionRight}>{right}</View> : null}
        </View>
      ) : null}
      {list.map((r, i) => (
        <SummaryLine key={r.key ?? `${r.label}-${i}`} item={r} huge={huge} narrow={narrow} inner={inner} fontScale={l.fontScale} />
      ))}
      {total ? (
        <>
          <View style={styles.dashWrap}>
            <View style={styles.dash} />
          </View>
          <SummaryLine item={{ label: total.label, value: total.value, hint: total.hint }} huge={huge} narrow={narrow} inner={inner} fontScale={l.fontScale} total />
        </>
      ) : null}
    </View>
  );
}

function SummaryLine({
  item,
  huge,
  narrow,
  inner,
  fontScale,
  total,
}: {
  item: SummaryItem;
  huge: boolean;
  narrow: boolean;
  inner: number;
  fontScale: number;
  total?: boolean;
}) {
  const text = formatValue(item.value);
  // Inline while the value fits the value column (up to 60 %; a date like "Mon, 3 Nov 2026" stays inline
  // at 320 dp) and the label's longest word still fits the room the value leaves (no "Reimbursemen/ts").
  // The label takes whatever the value doesn't need, so a short value never leaves the label wrapping.
  const fs = Math.min(Math.max(fontScale, 1), 1.6);
  const valueW = item.status ? text.length * 6.6 * fs + 34 : text.length * 8.4 * fs;
  const labelRoom = inner - space.sm - Math.min(inner * 0.6, valueW);
  const longestWord = Math.max(0, ...item.label.split(/\s+/).map((w) => w.length));
  const labelFits = longestWord * 7.4 * fs <= labelRoom;
  const inline = !huge && labelFits && (item.status ? true : text.length <= (narrow ? 16 : 24));
  const label = (
    <Text variant={total ? 'bodyStrong' : 'label'} color={total ? palette.ink : palette.textMuted} numberOfLines={inline ? 2 : undefined} style={inline ? styles.sumKey : null}>
      {item.label}
    </Text>
  );
  const value = item.status ? (
    <SoftPill label={text} tone={item.status} />
  ) : (
    <Text
      variant={total ? 'heading' : 'body'}
      color={item.valueColor ?? palette.ink}
      tabular
      selectable
      align={inline ? 'right' : 'left'}
      numberOfLines={inline ? 3 : undefined}
      style={[styles.medium, BREAK_ANYWHERE]}>
      {text}
    </Text>
  );
  const hint = item.hint ? (
    <Text variant="caption" muted align={inline ? 'right' : 'left'}>
      {item.hint}
    </Text>
  ) : null;
  return (
    <View style={inline ? styles.sumInline : styles.sumStacked} accessible accessibilityLabel={`${item.label}: ${text}${item.hint ? `, ${item.hint}` : ''}`}>
      {label}
      <View style={inline ? styles.sumValue : styles.sumValueStacked}>
        {value}
        {hint}
      </View>
    </View>
  );
}

// ── MetricRow ────────────────────────────────────────────────────────────────

function formatFigure(v: number | string | null | undefined) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '—';
  return String(v);
}

/**
 * Lendora "Phone Call's 6/20 [Active] •••": a frosted row with a coloured dot + label (+ muted sub),
 * a light big fraction with the denominator greyed ("6/20", optional unit), a soft status pill on the
 * right, and an optional ••• button (`onMore`). `onPress` makes the row a button (••• stays its own).
 *   <MetricRow module="leave" label="Casual leave" value={6} total={12} status={{ label: 'Active', tone: 'neutral' }} onMore={openMenu} />
 */
export function MetricRow({
  label,
  value,
  total,
  unit,
  sub,
  dotColor,
  module,
  status,
  onPress,
  onMore,
  moreAccessibilityLabel,
  accessibilityLabel,
  hint,
  style,
}: {
  label: string;
  value: number | string;
  /** The denominator, greyed ("/20"); leave out for a plain figure. */
  total?: number | string | null;
  /** A small muted unit after the figure ("h", "days"). */
  unit?: string;
  sub?: string | null;
  /** The dot's colour (a token); defaults to the module's colour, else the warm highlight. */
  dotColor?: string;
  module?: ModuleKey;
  status?: { label: string; tone: StatusTone } | null;
  onPress?: () => void;
  onMore?: () => void;
  /** Spoken label of the ••• button (defaults to "More for <label>"). */
  moreAccessibilityLabel?: string;
  accessibilityLabel?: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const frost = useFrost('frost');
  const dot = dotColor ?? (module ? (moduleTone[module] ?? moduleTone.profile).fg : palette.sunset);
  const shown = formatFigure(value);
  const of = total == null || total === '' ? null : formatFigure(total);
  const spoken =
    accessibilityLabel ?? [label, sub, of ? `${shown} of ${of}${unit ? ` ${unit}` : ''}` : `${shown}${unit ? ` ${unit}` : ''}`, status?.label].filter(Boolean).join(', ');
  const main = (
    <>
      <View style={styles.metricHead}>
        <View style={[styles.metricDot, { backgroundColor: dot }]} />
        <Text variant="body" color={palette.ink} numberOfLines={2} style={[styles.medium, styles.flexText]}>
          {label}
        </Text>
      </View>
      {sub ? (
        <Text variant="caption" muted numberOfLines={2} style={styles.metricSub}>
          {sub}
        </Text>
      ) : null}
      <View style={styles.metricLine}>
        <Text variant="hero" color={palette.ink} numberOfLines={1} style={styles.fraction}>
          {shown}
          {of ? <RNText style={{ color: palette.textFaint }}>/{of}</RNText> : null}
          {unit ? <RNText style={[styles.fractionUnit, { color: palette.textMuted }]}> {unit}</RNText> : null}
        </Text>
        {status ? <SoftPill label={status.label} tone={status.tone} dot={false} /> : null}
      </View>
    </>
  );
  const more = onMore ? (
    <PressableScale
      onPress={onMore}
      scaleTo={0.92}
      hitSlop={hitSlopFor(40, 4)}
      accessibilityRole="button"
      accessibilityLabel={moreAccessibilityLabel ?? `More for ${label}`}
      style={styles.moreBtn}>
      <MoreHorizontal size={20} color={palette.text} strokeWidth={1.8} />
    </PressableScale>
  ) : null;
  return (
    <View style={[styles.metricRow, frost, style]}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={spoken}
          accessibilityHint={hint}
          style={({ pressed }) => [styles.metricMain, pressed && styles.pressed]}>
          {main}
        </Pressable>
      ) : (
        <View style={styles.metricMain} accessible accessibilityLabel={spoken}>
          {main}
        </View>
      )}
      {more}
    </View>
  );
}

// ── PillSelector ─────────────────────────────────────────────────────────────

/**
 * Payno "🇮🇳 INR ⌄" / Lendora "This Week ⌄": a small frosted pill (36 high, 48 dp touch target) with
 * an optional leading glyph (text such as "₹" or a flag) or icon, the label and a chevron. It only
 * opens whatever the caller passes in `onPress` (a sheet, a month picker).
 *   <PillSelector icon={CalendarDays} label="October 2026" onPress={() => setPicker(true)} />
 */
export function PillSelector({
  label,
  glyph,
  icon: Icon,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityHint = 'Opens a picker',
  style,
}: {
  label: string;
  /** A short text glyph before the label ("₹", "🇮🇳"). */
  glyph?: string;
  icon?: LucideIcon;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const frost = useFrost('strong');
  const off = disabled || !onPress;
  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      scaleTo={0.96}
      hitSlop={hitSlopFor(36, 4)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off }}
      style={[styles.pillSel, frost, disabled && styles.disabled, style]}>
      {glyph ? (
        <Text variant="label" color={palette.ink} maxFontSizeMultiplier={1.2} importantForAccessibility="no" accessibilityElementsHidden>
          {glyph}
        </Text>
      ) : Icon ? (
        <Icon size={16} color={palette.ink} strokeWidth={1.8} />
      ) : null}
      <Text variant="label" color={palette.ink} numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.medium, styles.shrink]}>
        {label}
      </Text>
      <ChevronDown size={16} color={palette.textMuted} strokeWidth={2} />
    </PressableScale>
  );
}

const styles = themedStyles(() => ({
  flexText: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  medium: { fontFamily: font.medium },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  hRow: { gap: space.sm, alignItems: 'stretch' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', columnGap: GAP, rowGap: ROW_GAP },
  flexTile: { flex: 1, minWidth: 0 },

  iconCircle: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassLine,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  softPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 26,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    flexShrink: 0,
    maxWidth: '100%',
  },
  softDot: { width: 6, height: 6, borderRadius: 3 },

  // SectionHeader
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  sectionTitle: { fontFamily: font.regular, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 0 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xxs },

  // AvatarTiles
  personTile: {
    minHeight: PERSON_H,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    paddingHorizontal: space.xs,
  },
  personText: { alignItems: 'center', gap: 2, alignSelf: 'stretch' },
  // Two name lines are always reserved, so a two-word name that wraps and a one-line name with an
  // ellipsised role give tiles of the same height in one row.
  personName: { minHeight: 36 },
  avatarDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  addCircle: {
    width: PERSON_AVATAR,
    height: PERSON_AVATAR,
    borderRadius: PERSON_AVATAR / 2,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassLine,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // CategoryGrid
  catTile: { alignItems: 'center', gap: space.xs, paddingVertical: space.xxs, minHeight: 48 },
  catTileFill: { flexGrow: 1 },
  catLabel: { maxWidth: '100%' },
  disc: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  discFrost: { backgroundColor: palette.frostStrong, borderWidth: 1, borderColor: rim(), ...softShadow() },
  discSheet: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.glassLine, ...softShadow() },
  discCard: { backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.glassLine },
  count: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    // Neutral count: only the Inbox tab badge is red (DESIGN.md §5). Its digits are palette.surface
    // (white in light, umber in dark, where ink turns parchment).
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.surface,
  },
  brandDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: palette.primaryText, // the brand colour that still reads on dark surfaces
    borderWidth: 2,
    borderColor: palette.surface,
  },

  // UpcomingCards
  upCard: { minHeight: UP_H, borderRadius: radius.xl, padding: space.md, gap: space.lg, justifyContent: 'space-between' },
  upTop: { flexDirection: 'row', alignItems: 'flex-start' },
  upText: { gap: 2 },
  upLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  upValue: { flexShrink: 0, maxWidth: '55%' },

  // SelectTiles
  selTile: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingHorizontal: SELECT_PAD_X, paddingVertical: space.sm },
  selRim: { borderWidth: SELECT_RIM },
  selOn: { borderColor: palette.primaryText, backgroundColor: palette.primarySoft },
  selCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.primary,
    borderWidth: 2,
    borderColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // AccountRow
  accountRow: { borderRadius: radius.lg, paddingVertical: space.sm, paddingHorizontal: space.md, gap: space.xs },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  underAction: { flexDirection: 'row' },
  changePill: {
    minHeight: 32,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.frostStrong,
    borderWidth: 1,
    borderColor: palette.glassLine,
    flexShrink: 0,
    ...softShadow(),
  },

  // SummaryCard
  summary: { borderRadius: radius.xl, gap: space.sm },
  sumInline: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  sumStacked: { gap: 2 },
  // The value column takes what it needs (up to 60 %); the label gets the rest.
  sumKey: { flex: 1, minWidth: 0, paddingTop: 2 },
  sumValue: { flexShrink: 1, maxWidth: '60%', minWidth: 0, alignItems: 'flex-end', gap: 2 },
  sumValueStacked: { alignItems: 'flex-start', gap: 2 },
  dashWrap: { height: 1, overflow: 'hidden', marginVertical: space.xxs },
  dash: { height: 2, borderWidth: 1, borderColor: palette.hairline, borderStyle: 'dashed', borderRadius: 1 },

  // MetricRow
  metricRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, borderRadius: radius.lg, padding: space.md },
  metricMain: { flex: 1, minWidth: 0, gap: space.xxs },
  metricHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  metricDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  metricSub: { paddingLeft: 16 },
  metricLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: space.sm,
    rowGap: space.xxs,
    paddingLeft: 16,
  },
  fraction: { flexShrink: 1 },
  fractionUnit: { fontFamily: font.regular, fontSize: 15 },
  moreBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.frostStrong,
    borderWidth: 1,
    borderColor: palette.glassLine,
    flexShrink: 0,
  },

  // PillSelector
  pillSel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
}));
