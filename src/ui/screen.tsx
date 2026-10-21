// Screen scaffolding shared by every screen: the backdrop (Payno vertical wash — near-white at the top
// deepening to a warm wash at the bottom, a white glow at the top), safe areas, pull-to-refresh, an optional sticky footer
// (ActionBar), and the header styles:
//   GreetingHeader  tab roots — small overline over the title, ≤ 2 round actions on the right
//   HomeHeader      Home (Payno) — avatar left, small muted greeting over the name, an IconPillGroup
//                   (bell + optional actions) right; no logo
//   BrandHeader     (older Home header) — round avatar left, logo centred, round bell right
//   TitleHeader     pushed screens — round back button, centred title, optional right action(s)
// Direct children of <Screen> fade up into place one after another when the screen opens, so every
// screen gets the same entrance without doing anything. Gutter and gaps come from useLayout(), so a
// 360 dp phone or large text gets the compact numbers.

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Bell, ChevronLeft } from 'lucide-react-native';
import { Children, isValidElement, type ReactNode, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { themedStyles } from '@/theme/themed';
import { layout, palette, space } from '@/theme/tokens';
import { DemoChip, IconPillGroup, type NavAction } from '@/ui/chrome';
import { useLayout } from '@/ui/layout';
import { PressableScale, Reveal } from '@/ui/motion';
import { Avatar, IconButton } from '@/ui/primitives';
import { Text } from '@/ui/text';
import { TourScrollProvider, type TourScrollRef, TourTarget, useTourScrollHandle } from '@/ui/tour/target';

const WEB = Platform.OS === 'web';

/** Clearance for the floating tab bar (bar 64 + 24). Screen adds Math.max(insets.bottom − 4, 10). */
export const TAB_BAR_SPACE = layout.tabBarSpace;

/**
 * The canvas every screen sits on (Payno wash): near-white `canvasTop` at the top, through the ivory
 * canvas, deepening to the warm `canvasWash` at the very bottom (where the tab bar / sticky bar sit, so
 * body text is rarely on the deepest tone), with a soft white glow and a faint warm haze at the top.
 */
export function Backdrop() {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[palette.canvasTop, palette.canvas, palette.canvasBottom, palette.canvasWash]}
        locations={[0, 0.42, 0.74, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Svg width={width} height={height * 0.6} style={{ position: 'absolute', top: 0 }}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="8%" rx="70%" ry="45%">
            <Stop offset="0" stopColor={palette.surface} stopOpacity={0.95} />
            <Stop offset="0.55" stopColor={palette.surface} stopOpacity={0.35} />
            <Stop offset="1" stopColor={palette.surface} stopOpacity={0} />
          </RadialGradient>
          {/* A faint warm haze of the logo gold in the top-right corner. */}
          <RadialGradient id="sunset" cx="100%" cy="0%" rx="75%" ry="50%">
            <Stop offset="0" stopColor={palette.sunset} stopOpacity={0.22} />
            <Stop offset="0.6" stopColor={palette.sunset} stopOpacity={0.06} />
            <Stop offset="1" stopColor={palette.sunset} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height * 0.6} fill="url(#glow)" />
        <Rect x={0} y={0} width={width} height={height * 0.6} fill="url(#sunset)" />
      </Svg>
    </View>
  );
}

/**
 * The page. Scrolls by default (`scroll={false}` for FlashList screens — the gutter is still applied).
 * `withTabBar` on tab roots keeps content clear of the floating tab bar. `footer` (an <ActionBar>) is
 * pinned to the bottom, measured, and rides above the keyboard; the content gets footer height + 24
 * of bottom padding. Never combine `footer` with `withTabBar`.
 */
export function Screen({
  children,
  onRefresh,
  scroll = true,
  withTabBar = false,
  header,
  footer,
  contentStyle,
  animate = true,
  ...rest
}: ScrollViewProps & {
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  scroll?: boolean;
  withTabBar?: boolean;
  header?: ReactNode;
  /** Sticky bottom bar (ActionBar) for pushed detail / form screens. */
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  animate?: boolean; // staggered fade-up of the direct children on mount
}) {
  const insets = useSafeAreaInsets();
  const { gutter, gap } = useLayout();
  // Web only: a tab screen there isn't held to the window (expo-router's tab slot lets it grow with its
  // content), so the page itself would scroll instead of this ScrollView. Clamp it to the window.
  const winH = useWindowDimensions().height;
  const webClamp = WEB ? { maxHeight: winH } : null;
  const [refreshing, setRefreshing] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);
  const hasFooter = footer != null && footer !== false;
  const bottom = hasFooter ? footerHeight + space.xl : withTabBar ? TAB_BAR_SPACE + Math.max(insets.bottom - 4, 10) : space.xl + insets.bottom;
  // The tour (src/ui/tour) scrolls a target into view through this, keeping it clear of the floating
  // tab bar or the sticky footer, and a little above the middle so its card fits under it on a small phone.
  const scrollRef = useRef<TourScrollRef>(null);
  const tourScroll = useTourScrollHandle(scrollRef, {
    anchor: 0.3,
    insetEnd: hasFooter ? footerHeight + space.xs : withTabBar ? TAB_BAR_SPACE + Math.max(insets.bottom - 4, 10) : space.xs + insets.bottom,
  });

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

  let body: ReactNode;
  if (!scroll) {
    const padded = [{ flex: 1, paddingHorizontal: gutter }, hasFooter && { paddingBottom: footerHeight }, contentStyle];
    body = animate ? <Reveal style={padded}>{children}</Reveal> : <View style={padded}>{children}</View>;
  } else {
    // Children.toArray keys each child by its original position, so a section that appears later
    // (data loaded) never re-keys — and re-animates — the sections around it.
    const items = animate
      ? Children.toArray(children).map((child, i) => (
          <Reveal key={isValidElement(child) && child.key != null ? child.key : i} index={i}>
            {child}
          </Reveal>
        ))
      : children;
    body = (
      <TourScrollProvider handle={tourScroll}>
        <ScrollView
          ref={scrollRef}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          {...rest}
          style={[{ flex: 1 }, rest.style]}
          contentContainerStyle={[
            {
              paddingHorizontal: gutter,
              paddingTop: space.xxs,
              paddingBottom: bottom,
              gap,
            },
            contentStyle,
          ]}
          refreshControl={
            refresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={palette.primaryText}
                colors={[palette.primaryText]}
                progressBackgroundColor={palette.surface}
              />
            ) : undefined
          }>
          {items}
        </ScrollView>
      </TourScrollProvider>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }, webClamp]}>
      <Backdrop />
      {header}
      {hasFooter ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flex: 1 }}>
            {body}
            <View style={styles.footer} onLayout={(e) => setFooterHeight(Math.round(e.nativeEvent.layout.height))}>
              {footer}
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

/** Tab-root header: muted overline over a one-line title; at most 2 IconButtons (40) on the right. */
export function GreetingHeader({ overline, title, actions }: { overline: string; title: string; actions?: ReactNode }) {
  const { gutter } = useLayout();
  return (
    <View style={[styles.greeting, { paddingHorizontal: gutter }]}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Text variant="label" muted numberOfLines={1} style={{ flexShrink: 1 }}>
            {overline}
          </Text>
          <DemoChip />
        </View>
        <Text variant="title" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const HOME_AVATAR = 48;

/**
 * Home's header in the Payno style (min 64 high): the person's avatar (coloured initials or photo,
 * 48 with a white ring, → `onAvatarPress`) on the left; a small muted greeting ("Good morning 👋") over
 * the name in a larger regular weight (22, one line, the full text kept for screen readers), with the
 * small gold DEMO pill beside the name in the demo account; and on the right a Lendora IconPillGroup:
 * the bell (→ `onBellPress`, red dot when `bellDot`) plus any extra `actions` (2 in the pill reads
 * best). No centred logo or wordmark. Pass the greeting in (from `greeting(new Date(useNow()))`) so
 * render stays pure. `right` replaces the pill.
 *   <HomeHeader greeting={hello} name={firstName(user?.name)} avatarName={user?.name}
 *     onAvatarPress={() => router.push('/profile')} bellDot={inbox > 0}
 *     bellLabel={inbox > 0 ? `Inbox, ${inbox} waiting` : 'Inbox'} onBellPress={() => router.push('/inbox')} />
 */
export function HomeHeader({
  greeting,
  name,
  avatarName,
  avatarUri,
  onAvatarPress,
  avatarLabel = 'Your profile',
  onBellPress,
  bellDot,
  bellLabel = 'Inbox',
  actions,
  wave = true,
  right,
  demo,
  avatarTourId,
}: {
  /** The small muted first line, e.g. "Good morning". */
  greeting: string;
  /** The larger second line, usually the first name. */
  name?: string | null;
  /** Name for the avatar's initials and colour (defaults to `name`). */
  avatarName?: string | null;
  avatarUri?: string | null;
  onAvatarPress?: () => void;
  avatarLabel?: string;
  onBellPress?: () => void;
  bellDot?: boolean;
  bellLabel?: string;
  /** More round actions in the pill after the bell (e.g. Inbox with a dot); 1 extra reads best. */
  actions?: NavAction[];
  /** Adds a 👋 after the greeting (visual only, not read out). Default true. */
  wave?: boolean;
  /** Replaces the pill (one 44 IconButton or a small group at most). */
  right?: ReactNode;
  /** Force the DEMO pill on or off; by default it shows for the demo session. */
  demo?: boolean;
  /** Marks the avatar as a tour target (docs/TOUR.md, e.g. 'home.avatar'). */
  avatarTourId?: string;
}) {
  const { gutter } = useLayout();
  const shownName = String(name ?? '').trim();
  const avatar = <Avatar name={(avatarName ?? shownName) || undefined} uri={avatarUri} size={HOME_AVATAR} />;
  const pill: NavAction[] = [
    ...(onBellPress
      ? [
          {
            key: 'bell',
            icon: Bell,
            label: bellLabel,
            dot: bellDot,
            onPress: onBellPress,
          },
        ]
      : []),
    ...(Array.isArray(actions) ? actions : []),
  ];
  const trailing = right ?? (pill.length ? <IconPillGroup items={pill} /> : null);
  return (
    <View style={[styles.home, { paddingHorizontal: gutter }]}>
      <TourTarget id={avatarTourId} shape="circle">
        {onAvatarPress ? (
          <PressableScale onPress={onAvatarPress} scaleTo={0.92} hitSlop={4} accessibilityRole="button" accessibilityLabel={avatarLabel}>
            {avatar}
          </PressableScale>
        ) : (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {avatar}
          </View>
        )}
      </TourTarget>
      <View style={styles.homeText} accessible accessibilityRole="header" accessibilityLabel={shownName ? `${greeting}, ${shownName}` : greeting}>
        <Text variant="label" muted numberOfLines={1}>
          {greeting}
          {wave ? ' 👋' : ''}
        </Text>
        {shownName ? (
          <View style={styles.homeNameRow}>
            <Text variant="title" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.homeName}>
              {shownName}
            </Text>
            <DemoChip show={demo} />
          </View>
        ) : (
          <DemoChip show={demo} />
        )}
      </View>
      {trailing ? <View style={styles.actions}>{trailing}</View> : null}
    </View>
  );
}

/** Home's older header (56 high): 48 dp left slot (avatar), centred brand, 48 dp right slot (bell). */
export function BrandHeader({ left, center, right }: { left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  const { gutter } = useLayout();
  return (
    <View style={[styles.brandBar, { paddingHorizontal: gutter }]}>
      <View style={styles.side}>{left}</View>
      <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }}>
        {center}
        <DemoChip />
      </View>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

/**
 * Pushed-screen header: back button, centred one-line title, right slot. With two right icons pass
 * `rightSlots={2}` so both sides are 88 wide and the title stays centred. More than 2 actions go into
 * a MoreHorizontal IconButton + MenuSheet.
 */
export function TitleHeader({ title, right, onBack, rightSlots = 1 }: { title: string; right?: ReactNode; onBack?: () => void; rightSlots?: 1 | 2 }) {
  const router = useRouter();
  const { gutter } = useLayout();
  const slot = rightSlots === 2 ? 88 : 40;
  return (
    <View style={[styles.titleBar, { paddingHorizontal: gutter }]}>
      <View style={{ width: slot, flexShrink: 0 }}>
        <IconButton accessibilityLabel="Back" onPress={onBack ?? (() => router.back())}>
          <ChevronLeft size={22} color={palette.text} />
        </IconButton>
      </View>
      <Text variant="heading" align="center" numberOfLines={1} accessibilityRole="header" style={{ flex: 1, minWidth: 0 }}>
        {title}
      </Text>
      <View style={[styles.titleRight, { minWidth: slot }]}>{right}</View>
    </View>
  );
}

/** Section heading inside a screen: optional overline, one-line title, at most one control on the right. */
export function SectionTitle({ overline, title, right }: { overline?: string; title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {overline ? (
          <Text variant="label" muted numberOfLines={1}>
            {overline}
          </Text>
        ) : null}
        <Text variant="heading" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {right ? <View style={styles.sectionRight}>{right}</View> : null}
    </View>
  );
}

/**
 * A SectionTitle and its content as ONE Screen child (they animate together; title-to-content 12):
 *   <Section title="My requests" right={<ViewAllPill … />}>…</Section>
 */
export function Section({
  title,
  overline,
  right,
  children,
  style,
}: {
  title: string;
  overline?: string;
  right?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: space.sm }, style]}>
      <SectionTitle title={title} overline={overline} right={right} />
      {children}
    </View>
  );
}

/**
 * The small muted label over a white card (Payno, docs/LAYOUT-REFS.md): labelStrong, muted, up to 2
 * lines, nudged 4 dp in from the card edge so it reads as the label of the card under it. At most one
 * control on the right (a month switcher, a SeeAllLink); the row is then 44 high so it fits. Use it
 * alone as a FlashList section header (`style` for its margins), or through LabelledSection.
 */
export function SectionLabel({ title, right, style }: { title: string; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.label, right ? styles.labelWithControl : null, style]}>
      <Text variant="labelStrong" muted numberOfLines={2} accessibilityRole="header" style={styles.labelText}>
        {title}
      </Text>
      {right ? <View style={styles.sectionRight}>{right}</View> : null}
    </View>
  );
}

/**
 * A SectionLabel over its content (one card) as ONE Screen child, so they fade in together and the
 * screen's gap sits between sections, never between a label and its card (label-to-card 8):
 *   <LabelledSection title="Today"><ActivityList>…</ActivityList></LabelledSection>
 *   <LabelledSection title="October 2026" right={switcher}>…</LabelledSection>
 */
export function LabelledSection({ title, right, style, children }: { title: string; right?: ReactNode; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    <View style={[styles.labelled, style]}>
      <SectionLabel title={title} right={right} />
      {children}
    </View>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: palette.canvas },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  greeting: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: space.xs,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  actions: { flexDirection: 'row', gap: space.xs, flexShrink: 0 },
  brandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: space.xxs,
  },
  home: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
  homeText: { flex: 1, minWidth: 0, gap: 2 },
  // The DEMO pill wraps under the name when the row is tight (320 dp with a 2-button pill), so the name never truncates to "P…".
  homeNameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.xs,
    rowGap: 2,
  },
  homeName: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  side: { width: 48, flexShrink: 0 },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.xs,
    gap: space.xs,
  },
  titleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.xs,
    flexShrink: 0,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: space.xs,
    gap: space.sm,
  },
  sectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexShrink: 0,
  },
  labelled: { gap: space.xs },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.xxs,
  },
  labelWithControl: { minHeight: 44 },
  labelText: { flex: 1, minWidth: 0 },
}));
