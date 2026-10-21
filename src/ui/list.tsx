// List rows in the reference's "Transactions" style (docs/DESIGN.md §7.12): round icon/avatar on the
// left, a title over a muted subtitle, and a value / status on the right. Group rows in a ListCard to
// get the frosted rounded container with hairline separators; in a FlashList wrap each row in
// GroupedRow and use GroupedSeparator.
//
//   [ left 40 ] 12 [ text: flex 1, minWidth 0 ] 12 [ right: flexShrink 0, maxWidth 45 % ] [ chevron ]
//
// Payno "recent transactions" look (docs/REFERENCE-COMPONENTS.md item 8): ActivityList = a
// SectionHeader (regular title + muted "See all" link) over ONE frosted card; ActivityRow = a ListRow
// with an avatar photo / initials, a medium 2-line name over a muted subtitle, the amount on the right
// (a leading "+" turns it green) over a muted time or a StatusPill, inset hairlines between rows, and
// the right column moving under the text at very large text sizes so nothing gets squeezed.

import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Children, Fragment, type ReactNode } from 'react';
import { Platform, Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { font, type ModuleKey, moduleTone, palette, radius, shadow, space, type StatusTone } from '@/theme/tokens';
import { shouldStack, useLayout } from '@/ui/layout';
import { themedStyles } from '@/theme/themed';
import { Avatar, FROST_SHADOW, Skeleton, StatusPill } from '@/ui/primitives';
import { isDarkScheme, withAlpha } from '@/ui/surface';
import { Text } from '@/ui/text';
import { SectionHeader } from '@/ui/tiles';

const IOS = Platform.OS === 'ios';
// Theme colours are read when these run (render time / a themedStyles factory), never frozen at load.
// Payno frost (Card tone="frost"): translucent white 0.58 on iOS, 0.80 on Android (no blur or shadow there).
const glassFill = () => (IOS ? palette.frost : palette.frostStrong);
const rim = () => (IOS ? palette.glassEdge : palette.glassLine);
/** Separator inset: 16 padding + 40 left element + 12 gap. */
export const LIST_INSET = space.md + 40 + space.sm;

/** Card fills: frost (`glass`, the kit default, 0.58) or the stronger frost (`surface`, 0.80). */
export type ListTone = 'glass' | 'surface';

/**
 * The Payno card for lists and long text: frosted-strong white (0.80 on iOS, 0.88 on Android) with the
 * bright rim. ListCard / SkeletonList / ActivityList `tone="surface"` and GroupedRow `tone="surface"` use
 * it; pass it to a kit Card (`tone="accent"`) so a content card matches them:
 * `<Card tone="accent" style={[WHITE_CARD, …]}>`. (The name is historical: it was solid white.)
 */
export const WHITE_CARD: ViewStyle = {
  // Getters, so a module-level reference (style={[WHITE_CARD, …]}) still follows the live theme.
  get backgroundColor() {
    return IOS ? palette.frostStrong : palette.glassStrong;
  },
  get borderColor() {
    return rim();
  },
};

/**
 * One list row. Title 1 line (`numberOfLines`), subtitle `subtitleLines` (defaults to numberOfLines),
 * meta 1 line. Right side: pass `value` (+ `valueMeta`) for a tabular figure, or `right` for one
 * StatusPill / IconButton. Pressable rows are a single screen-reader stop and tint when pressed.
 * Heights: 56 title only, 64 with subtitle, 72 with `size="lg"` (avatar 40 + two lines).
 * `stackRight` moves the right column (value, valueMeta, right) under the text as one wrapping line,
 * for very large text where a side column would squeeze the title. `below` adds one element (e.g. a
 * StatusPill) at the bottom of the text column.
 */
export function ListRow({
  left,
  title,
  subtitle,
  meta,
  below,
  right,
  onPress,
  chevron,
  numberOfLines = 1,
  subtitleLines,
  size = 'md',
  value,
  valueMeta,
  valueColor,
  titleColor,
  titleWeight = 'semibold',
  valueWeight = 'semibold',
  disabled,
  accessibilityLabel,
  accessibilityHint,
  stackRight,
}: {
  left?: ReactNode;
  title: string;
  subtitle?: string | null;
  meta?: string | null; // small line under the subtitle
  /** One element under the text (e.g. a StatusPill when the right column already holds a figure). */
  below?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  numberOfLines?: number;
  subtitleLines?: number;
  size?: 'md' | 'lg';
  /** Right-aligned figure (bodyStrong, tabular, 1 line). */
  value?: string | null;
  /** Caption under `value`. */
  valueMeta?: string | null;
  valueColor?: string;
  titleColor?: string;
  /** Title weight: semibold (default) or medium (ActivityRow, the calmer Payno name). */
  titleWeight?: 'medium' | 'semibold';
  /** Value weight: semibold (default) or medium (ActivityRow, Payno's calm amounts). */
  valueWeight?: 'medium' | 'semibold';
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Put the right column under the text (left-aligned, wrapping) instead of beside it. */
  stackRight?: boolean;
}) {
  const minHeight = size === 'lg' ? 72 : subtitle || meta ? 64 : 56;
  const hasRight = !!value || !!valueMeta || right != null;
  const rightCol = hasRight ? (
    <View style={stackRight ? styles.rightStacked : styles.right}>
      {value ? (
        <Text
          variant="bodyStrong"
          color={valueColor}
          tabular
          numberOfLines={1}
          style={[stackRight ? styles.shrink : styles.rightText, valueWeight === 'medium' && styles.titleMedium]}>
          {value}
        </Text>
      ) : null}
      {valueMeta ? (
        <Text variant="caption" muted numberOfLines={1} style={stackRight ? styles.shrink : styles.rightText}>
          {valueMeta}
        </Text>
      ) : null}
      {right}
    </View>
  ) : null;
  const body = (
    <View style={[styles.row, { minHeight }]}>
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.text}>
        <Text variant="bodyStrong" color={titleColor} numberOfLines={numberOfLines} style={[styles.shrink, titleWeight === 'medium' && styles.titleMedium]}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="label" muted numberOfLines={subtitleLines ?? numberOfLines} style={styles.shrink}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" muted numberOfLines={1} style={styles.shrink}>
            {meta}
          </Text>
        ) : null}
        {below != null ? <View style={styles.below}>{below}</View> : null}
        {stackRight ? rightCol : null}
      </View>
      {stackRight ? null : rightCol}
      {chevron ? <ChevronRight size={18} color={palette.textFaint} style={{ flexShrink: 0 }} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessible
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, value, valueMeta].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.pressable, pressed && { backgroundColor: palette.pressedTint }, disabled && { opacity: 0.4 }]}>
      {body}
    </Pressable>
  );
}

/**
 * Rounded container (radius 24) that draws hairline separators between its rows. Payno frost by
 * default (translucent white, bright rim, soft wide shadow); `tone="surface"` is the stronger frost.
 */
export function ListCard({
  children,
  title,
  right,
  separatorInset = LIST_INSET,
  tone = 'glass',
  style,
}: {
  children: ReactNode;
  title?: string;
  right?: ReactNode;
  /** Left inset of the separators (68 = past a 40 dp icon). */
  separatorInset?: number;
  tone?: ListTone;
  style?: StyleProp<ViewStyle>;
}) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.card, tone === 'surface' && WHITE_CARD, style]}>
      {title ? (
        <View style={styles.cardHead}>
          <Text variant="heading" style={{ flex: 1, minWidth: 0 }} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {right ? <View style={styles.cardHeadRight}>{right}</View> : null}
        </View>
      ) : null}
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={[styles.sep, { marginLeft: separatorInset }]} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

/** Round icon holder (40, icon 20) at the left of rows and in menus — a soft white disc with a rim. */
export function IconBadge({ children, bg, size = 40, style }: { children: ReactNode; bg?: string; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          // Default disc: bright white in light mode, the opaque card colour in dark mode.
          backgroundColor: bg ?? (isDarkScheme() ? palette.surface : withAlpha(palette.surface, 0.85)),
          borderWidth: 1,
          borderColor: rim(),
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          ...(IOS ? shadow.soft : null),
        },
        style,
      ]}>
      {children}
    </View>
  );
}

/**
 * Round tinted badge in a module's own colour (theme/tokens moduleTone): soft tint behind, coloured
 * icon on top. Use it as the leading icon of rows and tiles so every module is recognisable by colour.
 */
export function ModuleBadge({ module, icon: Icon, size = 40, style }: { module: ModuleKey; icon: LucideIcon; size?: number; style?: StyleProp<ViewStyle> }) {
  const tone = moduleTone[module];
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
        style,
      ]}>
      <Icon size={Math.round(size * 0.5)} color={tone.fg} strokeWidth={2} />
    </View>
  );
}

/**
 * A FlashList row painted as part of one rounded card (FlashList rows can't sit inside a ListCard):
 * frosted glass, or the solid white card with `tone="surface"`. `first` / `last` round the corners.
 * For the hairlines either pass `hairline` (every row after the first draws its own inset hairline on
 * top, so no ItemSeparatorComponent is needed and section labels in the same list never get a stray
 * one), or use `ItemSeparatorComponent={GroupedSeparator}` with glass rows:
 *   renderItem={({ item, index }) => (
 *     <GroupedRow tone="surface" hairline first={index === 0} last={index === rows.length - 1}><ActivityRow … /></GroupedRow>
 *   )}
 */
export function GroupedRow({
  first,
  last,
  tone = 'glass',
  hairline,
  inset = LIST_INSET,
  children,
  style,
}: {
  first?: boolean;
  last?: boolean;
  tone?: ListTone;
  /** Draw an inset hairline on top of this row unless it is the `first`. */
  hairline?: boolean;
  /** Left inset of that hairline (68 = past a 40 dp avatar or badge). */
  inset?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.grouped, tone === 'surface' && WHITE_CARD, first && styles.groupedFirst, last && styles.groupedLast, style]}>
      {hairline && !first ? <View style={[styles.sep, { marginLeft: inset }]} /> : null}
      {children}
    </View>
  );
}

/** Separator between GroupedRows: same fill, inset hairline (68). */
export function GroupedSeparator() {
  return (
    <View style={styles.groupedSepWrap}>
      <View style={[styles.sep, { marginLeft: LIST_INSET }]} />
    </View>
  );
}

/** Loading placeholder for a list: `rows` rows (64 high, 72 with `avatar`) inside a glass (or white) card. */
export function SkeletonList({
  rows = 3,
  avatar,
  tone = 'glass',
  style,
}: {
  rows?: number;
  avatar?: boolean;
  tone?: ListTone;
  style?: StyleProp<ViewStyle>;
}) {
  const count = Math.max(1, Math.min(rows, 12));
  return (
    <View style={[styles.card, tone === 'surface' && WHITE_CARD, style]} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: count }).map((_, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={[styles.sep, { marginLeft: LIST_INSET }]} /> : null}
          <View style={[styles.row, { minHeight: avatar ? 72 : 64 }]}>
            <Skeleton width={40} height={40} radius={20} />
            <View style={{ flex: 1, gap: space.xs }}>
              <Skeleton width="60%" height={12} radius={6} />
              <Skeleton width="40%" height={12} radius={6} />
            </View>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

// ── Payno "recent transactions" ──────────────────────────────────────────────

/**
 * Quiet "See all" text link (Payno): labelStrong in the brand ink, 44 dp tall with a 48 dp touch
 * target, dims while pressed. Sits on the right of an ActivityList / section header.
 *   <SeeAllLink onPress={() => router.push('/inbox')} accessibilityLabel="See all 5 waiting in your inbox" />
 */
export function SeeAllLink({ label = 'See all', onPress, accessibilityLabel }: { label?: string; onPress?: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={{ top: 2, bottom: 2, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.seeAll, pressed && { opacity: 0.55 }]}>
      <Text variant="labelStrong" color={palette.primaryText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A titled list section in the Payno style, as ONE Screen child: a SectionHeader (regular 17 px
 * title, up to 2 lines, optional muted overline) with a muted "See all" text link on the right
 * (`onSeeAll`, or your own single control in `right`), over ONE frosted card (`tone="surface"`, the
 * default stronger frost; `"glass"` for the lighter frost) holding ActivityRows with inset hairlines.
 * `loading` shows skeleton rows in the same card. With no rows and no `empty`, nothing renders (but
 * prefer leaving the section out in the screen, so it doesn't take a stack gap).
 *   <ActivityList title="Needs you" onSeeAll={() => router.push('/inbox')}>
 *     <ActivityRow person={{ name }} title="Priya Sharma" subtitle="12–14 Oct · Leave" value="3 days" meta="2h ago" onPress={…} />
 *   </ActivityList>
 */
export function ActivityList({
  title,
  overline,
  onSeeAll,
  seeAllLabel = 'See all',
  seeAllAccessibilityLabel,
  right,
  loading,
  loadingRows = 3,
  empty,
  tone = 'surface',
  separatorInset = LIST_INSET,
  style,
  children,
}: {
  title?: string;
  overline?: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  seeAllAccessibilityLabel?: string;
  /** Replaces the "See all" link (one control at most). */
  right?: ReactNode;
  loading?: boolean;
  loadingRows?: number;
  /** Shown inside the card when there are no rows (a string becomes a muted line). */
  empty?: ReactNode;
  tone?: ListTone;
  separatorInset?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const rows = Children.toArray(children).filter(Boolean);
  if (!loading && !rows.length && empty == null) return null;
  const control = right ?? (onSeeAll ? <SeeAllLink label={seeAllLabel} onPress={onSeeAll} accessibilityLabel={seeAllAccessibilityLabel} /> : null);
  return (
    <View style={[styles.activity, style]}>
      {title ? (
        <SectionHeader
          title={title}
          overline={overline}
          actionLabel={seeAllLabel}
          onAction={onSeeAll}
          actionAccessibilityLabel={seeAllAccessibilityLabel}
          right={right}
        />
      ) : control ? (
        <View style={styles.activityHead}>
          <View style={styles.text}>
            {overline ? (
              <Text variant="label" muted numberOfLines={1} style={styles.shrink}>
                {overline}
              </Text>
            ) : null}
          </View>
          <View style={styles.cardHeadRight}>{control}</View>
        </View>
      ) : null}
      {loading ? (
        <SkeletonList rows={loadingRows} avatar tone={tone} />
      ) : (
        <ListCard tone={tone} separatorInset={separatorInset}>
          {rows.length ? (
            rows
          ) : typeof empty === 'string' ? (
            <View style={styles.emptyLine}>
              <Text variant="label" muted numberOfLines={3}>
                {empty}
              </Text>
            </View>
          ) : (
            empty
          )}
        </ListCard>
      )}
    </View>
  );
}

export type ActivityRowProps = {
  title: string;
  /** Muted line under the title (1–2 lines). */
  subtitle?: string | null;
  /** Optional small caption under the subtitle (one line), e.g. a short note. */
  note?: string | null;
  /** Leading slot. Or pass `module` + `icon` (ModuleBadge 40) or `person` (initials / photo, 40). */
  left?: ReactNode;
  module?: ModuleKey;
  icon?: LucideIcon;
  person?: { name?: string | null; uri?: string | null } | null;
  /** Right column: the figure (bodyStrong, tabular, 1 line; a leading "+" shows it in successInk)… */
  value?: string | null;
  valueColor?: string;
  /** …with a small muted time / meta under it… */
  meta?: string | null;
  /** …and/or one StatusPill under it. */
  status?: { label: string; tone: StatusTone } | null;
  /** Anything else for the right column (one IconButton at most). */
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  titleLines?: number;
  subtitleLines?: number;
  titleColor?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/**
 * One Payno "transaction" row (72 dp min): 40 dp avatar photo / initials or ModuleBadge, a medium
 * name (2 lines) over a muted subtitle (2 lines), and on the right the amount (a leading "+" = money
 * in, shown in successInk unless `valueColor` says otherwise) over a muted time or a StatusPill. Built on
 * ListRow, so paddings, press tint, the 68 dp separator inset and the single screen-reader stop are
 * the same everywhere. Below 360 dp a row with both a value and a status puts the pill under the
 * text (so the title keeps its width); above 130 % text the whole right column moves under the text.
 */
export function ActivityRow({
  left,
  module,
  icon,
  person,
  status,
  right,
  note,
  meta,
  titleLines = 2,
  subtitleLines = 2,
  accessibilityLabel,
  ...rest
}: ActivityRowProps) {
  const l = useLayout();
  // Stack the right column above 130 % text, or already above 115 % on narrow phones (< 360 dp).
  const stack = shouldStack(l, { below: 'narrow', belowText: 'large', text: 'huge' });
  // Below 360 dp a row with both a value and a status shows the pill under the text (T5).
  const pillLeft = !!status && !stack && !!rest.value && shouldStack(l, { below: 'narrow', text: false });
  const lead =
    left ??
    (module && icon ? (
      <ModuleBadge module={module} icon={icon} />
    ) : person ? (
      <Avatar name={person.name ?? undefined} uri={person.uri} size={40} ring={false} />
    ) : null);
  // The pill keeps its own width when the right column is right-aligned.
  const statusPill = status ? (
    <View>
      <StatusPill label={status.label} tone={status.tone} />
    </View>
  ) : null;
  const pill = pillLeft ? null : statusPill;
  const trailing =
    pill && right != null ? (
      <>
        {pill}
        {right}
      </>
    ) : (
      (pill ?? right)
    );
  // Payno: money in (+₹…) reads green; everything else stays ink.
  const valueColor = rest.valueColor ?? (rest.value && rest.value.trim().startsWith('+') ? palette.successInk : undefined);
  return (
    <ListRow
      {...rest}
      valueColor={valueColor}
      titleWeight="medium"
      valueWeight="medium"
      size="lg"
      left={lead}
      meta={note}
      below={pillLeft ? statusPill : undefined}
      valueMeta={meta}
      right={trailing}
      numberOfLines={titleLines}
      subtitleLines={subtitleLines}
      stackRight={stack}
      accessibilityLabel={accessibilityLabel ?? [rest.title, rest.subtitle, note, rest.value, meta, status?.label].filter(Boolean).join(', ')}
    />
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md },
  left: { flexShrink: 0 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  shrink: { flexShrink: 1 },
  titleMedium: { fontFamily: font.medium },
  right: { flexShrink: 0, maxWidth: '45%', alignItems: 'flex-end', gap: 2 },
  rightStacked: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.xs, rowGap: space.xxs, marginTop: 2 },
  rightText: { textAlign: 'right' },
  below: { flexDirection: 'row', marginTop: space.xxs },
  pressable: { borderRadius: radius.md },
  card: {
    backgroundColor: glassFill(),
    borderRadius: radius.xl,
    paddingVertical: space.xxs,
    borderWidth: 1,
    borderColor: rim(),
    ...FROST_SHADOW,
  },
  activity: { gap: space.xxs },
  activityHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  seeAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xxs, flexShrink: 0 },
  emptyLine: { paddingHorizontal: space.md, paddingVertical: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.xs },
  cardHeadRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 0 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: palette.separator, marginRight: space.md },
  grouped: { backgroundColor: glassFill(), borderLeftWidth: 1, borderRightWidth: 1, borderColor: rim() },
  groupedFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.xxs },
  groupedLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, paddingBottom: space.xxs },
  groupedSepWrap: { backgroundColor: glassFill(), borderLeftWidth: 1, borderRightWidth: 1, borderColor: rim() },
}));
