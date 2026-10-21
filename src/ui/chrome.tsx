// Screen chrome in the Payno / Lendora style (docs/REFERENCE-COMPONENTS.md items 3–4):
//   NavHeader      pushed (stack) screens — a round frosted back button on the left, the title centred
//                  in a light regular weight (24), and 0–2 round frosted action buttons on the right
//                  (bell with a red dot, search, filter, calendar)
//   TabRootHeader  tab roots — the same bar without a back button: centred title, actions on the right
//   IconPillGroup  Lendora's header pill — ONE frosted capsule holding 2 icon buttons, each with an
//                  optional red unread dot (Home: bell + inbox, next to the avatar)
//   DemoChip       the small gold "DEMO · HR" pill shown for the demo session (with the demo role)
// Fit: the title stays centred only while it fits between two mirrored sides; a long title, or two
// actions on a narrow phone (< 360 dp or text > 115 %), starts it after the back button instead, and it
// shrinks a little (to 80 %) before truncating. Above 130 % text the title moves under the button row
// and may wrap to two lines. Every button is ≥ 44 dp with its touch target padded to 48.

import { useRouter } from 'expo-router';
import { ChevronLeft, type LucideIcon } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, Platform, type StyleProp, View, type ViewStyle } from 'react-native';

import { useSession } from '@/auth/session';
import { isDemoToken } from '@/demo/config';
import { demoPillLabel } from '@/demo/personas';
import { layout, palette, radius, shadow, space } from '@/theme/tokens';
import { hitSlopFor, shouldStack, useLayout } from '@/ui/layout';
import { PressableScale } from '@/ui/motion';
import { IconButton } from '@/ui/primitives';
import { MAX_FONT_SCALE, Text } from '@/ui/text';
import { TourTarget } from '@/ui/tour/target';

import { themedStyles } from '@/theme/themed';
const IOS = Platform.OS === 'ios';
// Payno's centred stack title is large and regular ("Transactions", "Pay Bills"): 24, or 22 on a
// compact phone (< 380 dp or text > 115 %) so a 2-action bar still fits a two-word title.
const TITLE_PX = 24;
const TITLE_PX_COMPACT = 22;
const TITLE_EM = 0.56; // Plus Jakarta Sans Regular: average glyph width ≈ 0.56 em

/** One round header action: a line icon, its spoken label, and an optional red unread dot. */
export type NavAction = {
  key?: string;
  icon: LucideIcon;
  /** Spoken label ("Search", "Inbox, 3 waiting"). Required: the button is icon-only. */
  label: string;
  onPress: () => void;
  dot?: boolean;
  disabled?: boolean;
  /** Marks this button as a tour target (docs/TOUR.md, e.g. 'inbox.history'). */
  tourId?: string;
};

/**
 * Small gold "DEMO" pill, shown for the demo session (or forced on / off with `show`). It names the
 * demo role being explored ("DEMO · HR", "DEMO · Vendor"); `label` overrides the text.
 */
export function DemoChip({ show, label }: { show?: boolean; label?: string }) {
  const pill = useSession((s) => demoPillLabel(s.token));
  if (!(show ?? !!pill)) return null;
  const text = label ?? pill ?? 'DEMO';
  return (
    <View style={styles.demoChip} accessibilityLabel={text === 'DEMO' ? 'Demo account' : `Demo account, ${text.replace(/^DEMO · /, '')}`}>
      <Text variant="micro" color={palette.goldInk} numberOfLines={1} maxFontSizeMultiplier={1}>
        {text}
      </Text>
    </View>
  );
}

function ActionButton({ action, size }: { action: NavAction; size: number }) {
  const Icon = action.icon;
  const button = (
    <IconButton tone="muted" size={size} dot={action.dot} disabled={action.disabled} accessibilityLabel={action.label} onPress={action.onPress}>
      <Icon size={20} color={palette.text} strokeWidth={1.8} />
    </IconButton>
  );
  if (!action.tourId) return button;
  return (
    <TourTarget id={action.tourId} shape="circle">
      {button}
    </TourTarget>
  );
}

type HeaderProps = {
  title: string;
  /** A muted line under the title ("Updated 9:00 AM"). */
  subtitle?: string;
  /** Up to two round frosted actions on the right (more go into a ••• MenuSheet). */
  actions?: NavAction[];
  /** Custom right content instead of `actions` (measured, so the title stays centred). */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

function HeaderBar({
  title,
  subtitle,
  actions,
  right,
  style,
  back,
  overline,
}: HeaderProps & { back?: { label: string; onPress: () => void } | null; overline?: ReactNode }) {
  const l = useLayout();
  const size = l.compact ? layout.control.md - 4 : layout.control.md; // 40 compact / 44
  const list = (Array.isArray(actions) ? actions : []).filter(Boolean).slice(0, 2);
  const [rightMeasured, setRightMeasured] = useState(0);
  const rightW = right != null ? rightMeasured : list.length ? list.length * size + (list.length - 1) * space.xs : 0;
  const leftW = back ? size : 0;
  // > 130 % text: the title gets its own line under the buttons.
  const below = shouldStack(l, { text: 'huge' });
  // The title stays centred only while it fits between two mirrored sides; otherwise (two actions on a
  // narrow phone, a long title, larger text) it starts after the back button and keeps the room the
  // mirrored side would take. Width is estimated (≈ 0.56 em per glyph at 24 px, × text size).
  const side0 = Math.max(leftW, rightW);
  const centredRoom = l.width - l.gutter * 2 - side0 * 2 - space.xs * 2;
  const titlePx = l.compact ? TITLE_PX_COMPACT : TITLE_PX;
  const titleW = String(title ?? '').length * titlePx * TITLE_EM * Math.min(Math.max(l.fontScale, 1), MAX_FONT_SCALE.title);
  const tightPair = list.length + (right != null ? 1 : 0) >= 2 && shouldStack(l, { below: 'narrow' });
  const centred = !below && !tightPair && titleW <= centredRoom;
  const side = centred ? side0 : undefined;
  const onRightLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== rightMeasured) setRightMeasured(w);
  };

  const backButton = back ? (
    <IconButton tone="muted" size={size} accessibilityLabel={back.label} onPress={back.onPress}>
      <ChevronLeft size={22} color={palette.text} strokeWidth={1.8} />
    </IconButton>
  ) : null;
  const rightContent =
    right != null ? (
      <View onLayout={onRightLayout} style={styles.rightRow}>
        {right}
      </View>
    ) : list.length ? (
      <View style={styles.rightRow}>
        {list.map((a, i) => (
          <ActionButton key={a.key ?? `${a.label}-${i}`} action={a} size={size} />
        ))}
      </View>
    ) : null;
  const titleBlock = (
    <View style={[styles.titleBlock, !below && styles.flex, centred ? styles.centre : styles.start]}>
      {overline}
      <Text
        variant="title"
        align={centred ? 'center' : 'left'}
        numberOfLines={below ? 2 : 1}
        adjustsFontSizeToFit={!below}
        minimumFontScale={0.8}
        accessibilityRole="header"
        style={[styles.title, l.compact && styles.titleCompact]}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="caption" muted align={centred ? 'center' : 'left'} numberOfLines={below ? 2 : 1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (below) {
    return (
      <View style={[styles.wrap, { paddingHorizontal: l.gutter }, style]}>
        {backButton || rightContent ? (
          <View style={styles.row}>
            {backButton}
            <View style={styles.flex} />
            {rightContent}
          </View>
        ) : null}
        {titleBlock}
      </View>
    );
  }
  return (
    <View style={[styles.wrap, styles.row, { paddingHorizontal: l.gutter }, style]}>
      {centred ? <View style={[styles.side, { width: side }]}>{backButton}</View> : backButton}
      {titleBlock}
      {centred ? <View style={[styles.side, styles.sideRight, { minWidth: side }]}>{rightContent}</View> : rightContent}
    </View>
  );
}

/**
 * Pushed-screen header (Payno): round frosted back button (→ `onBack`, default router.back()), the
 * title centred in a light regular weight, and 0–2 round frosted actions on the right.
 *   <NavHeader title="Expense claims" actions={[{ icon: Search, label: 'Search', onPress: openSearch },
 *     { icon: Bell, label: 'Inbox, 2 waiting', dot: true, onPress: () => router.push('/inbox') }]} />
 */
export function NavHeader({ onBack, backLabel = 'Back', ...props }: HeaderProps & { onBack?: () => void; backLabel?: string }) {
  const router = useRouter();
  return <HeaderBar {...props} back={{ label: backLabel, onPress: onBack ?? (() => router.back()) }} />;
}

/**
 * Tab-root header: the NavHeader bar without a back button — centred title (an optional small muted
 * overline and the DEMO pill above it) and up to two round frosted actions on the right.
 *   <TabRootHeader title="Inbox" overline="Tamada Media" actions={[{ icon: SlidersHorizontal, label: 'Filter', onPress }]} />
 */
export function TabRootHeader({ overline, demo, ...props }: HeaderProps & { overline?: string; demo?: boolean }) {
  const demoSession = useSession((s) => isDemoToken(s.token));
  const showDemo = demo ?? demoSession;
  const over =
    overline || showDemo ? (
      <View style={styles.overline}>
        {overline ? (
          <Text variant="label" muted numberOfLines={1} style={styles.shrink}>
            {overline}
          </Text>
        ) : null}
        <DemoChip show={showDemo} />
      </View>
    ) : null;
  return <HeaderBar {...props} back={null} overline={over} />;
}

/**
 * Lendora's header pill: one frosted capsule (48 high) holding up to 3 icon buttons (2 reads best),
 * each 48 × 48 with an optional red unread dot. Every button needs its own spoken `label`.
 *   <IconPillGroup items={[
 *     { icon: Bell, label: 'Notifications', dot: true, onPress: … },
 *     { icon: Inbox, label: 'Inbox, 3 waiting', dot: true, onPress: () => router.push('/inbox') },
 *   ]} />
 */
export function IconPillGroup({ items, style }: { items: NavAction[]; style?: StyleProp<ViewStyle> }) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean).slice(0, 3);
  if (!list.length) return null;
  return (
    <View style={[styles.pill, style]}>
      {list.map((it, i) => {
        const Icon = it.icon;
        const key = it.key ?? `${it.label}-${i}`;
        const button = (
          <PressableScale
            key={key}
            onPress={it.onPress}
            disabled={it.disabled}
            scaleTo={it.disabled ? 1 : 0.9}
            hitSlop={hitSlopFor(PILL_BTN - 2)} // the 46 dp button inside the 48 pill still gets a 48 dp target
            accessibilityRole="button"
            accessibilityLabel={it.label}
            accessibilityState={{ disabled: !!it.disabled }}
            style={[styles.pillBtn, it.disabled && styles.disabled]}>
            <View>
              <Icon size={20} color={palette.text} strokeWidth={1.8} />
              {it.dot ? <View style={styles.pillDot} pointerEvents="none" /> : null}
            </View>
          </PressableScale>
        );
        // A tour can point at one button of the group (NavAction.tourId), as it can at a NavButton.
        return it.tourId ? (
          <TourTarget key={key} id={it.tourId} shape="circle">
            {button}
          </TourTarget>
        ) : (
          button
        );
      })}
    </View>
  );
}

const PILL_BTN = layout.hit; // 48

const styles = themedStyles(() => ({
  wrap: { minHeight: 56, paddingTop: space.xs, paddingBottom: space.sm, gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
  side: { flexShrink: 0, flexDirection: 'row', alignItems: 'center' },
  sideRight: { justifyContent: 'flex-end' },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 0 },
  titleBlock: { minWidth: 0, gap: 2 },
  centre: { alignItems: 'center' },
  start: { alignItems: 'flex-start' },
  title: { fontSize: TITLE_PX, lineHeight: 30, letterSpacing: -0.5, maxWidth: '100%' },
  titleCompact: { fontSize: TITLE_PX_COMPACT, lineHeight: 28, letterSpacing: -0.4 },
  overline: { flexDirection: 'row', alignItems: 'center', gap: space.xs, maxWidth: '100%' },
  shrink: { flexShrink: 1 },
  demoChip: { backgroundColor: palette.goldSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, flexShrink: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PILL_BTN,
    borderRadius: PILL_BTN / 2,
    paddingHorizontal: 2,
    backgroundColor: IOS ? palette.frost : palette.frostStrong,
    borderWidth: 1,
    borderColor: IOS ? palette.glassEdge : palette.glassLine,
    flexShrink: 0,
    ...(IOS ? { ...shadow.soft, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } } : null),
  },
  pillBtn: { width: PILL_BTN - 2, height: PILL_BTN - 2, alignItems: 'center', justifyContent: 'center' },
  pillDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: palette.danger,
    borderWidth: 1.5,
    borderColor: palette.canvasTop,
  },
  disabled: { opacity: 0.4 },
}));
