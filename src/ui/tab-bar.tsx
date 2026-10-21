// Bottom navigation for both tab bars (docs/REFERENCE-COMPONENTS.md item 5, Payno "TabBarWithFab"; motion
// and icons: docs/NAVBAR-MOTION.md): the staff app's Home · Me · (+) · Inbox · More and the vendor portal's
// Home · Bills · Agreements · Profile (no FAB). A frosted capsule floating above the home indicator — real
// blur behind a light frost veil on iOS; on Android (no blur) the bar is solid canvas white, so scrolled
// content never reads through it.
// Every tab gets an equal slot (flex: 1) with its icon and, under it, its name — always shown, so no tab
// is a bare icon. Selection changes shape, not only colour: the icon goes from a muted outline to filled
// brand (src/ui/tab-glyphs.tsx) and plays one short beat, the label cross-fades Medium → SemiBold brand
// and lifts 1 dp, and a soft brand pill behind the icon slides over from the previous tab (stretching a
// little while it travels, passing under the FAB). Deselecting is a quiet 100 ms fade. Pressing squeezes
// the icon; re-tapping the active tab gives a small squeeze and no haptic. Switching gives a selection
// haptic. The Inbox badge zooms in, pops when the count grows and zooms out at 0.
// TabFab is the raised round centre button (brand fill, white +, soft brand-tinted shadow), placed by the
// layout between two triggers; it opens the CreateSheet. While the sheet is open (`open`) its + turns into
// ×; a press squeezes it, deepens its glow and sends out one ring. Reduce Motion: only fades.
// With 4 tabs + the FAB at 320 dp a tab slot is ~55 dp, enough for the short staff labels; the vendor's
// longest label ("Agreements") shrinks to fit (min 85 %). The bar never holds other actions.
// All animation runs on the UI thread (Reanimated shared values written from effects and handlers only).
// Light / dark: every colour is read at render time or through themedStyles (the tokens are live). In dark
// mode the Android bar is the opaque `surface`, the iOS blur is dark, brand icons and labels use
// `primaryText` and the badge fill is `danger` (white text on it; `dangerInk` is a text red there).

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { type TabTriggerSlotProps } from 'expo-router/ui';
import { type LucideIcon, Plus } from 'lucide-react-native';
import { type ComponentRef, createContext, forwardRef, type ReactNode, useContext, useEffect, useId, useMemo, useRef } from 'react';
import { type LayoutChangeEvent, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  Keyframe,
  LayoutAnimationConfig,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { themedStyles } from '@/theme/themed';
import { font, gradient, layout, motion, palette, shadow } from '@/theme/tokens';
import { haptic } from '@/ui/haptics';
import { PressableScale } from '@/ui/motion';
import { isDarkScheme } from '@/ui/surface';
import { TabGlyph, type TabGlyphName, useTabOn } from '@/ui/tab-glyphs';
import { Text } from '@/ui/text';
import { TourTarget, useTourTarget } from '@/ui/tour/target';

type ViewRef = ComponentRef<typeof View>;

const BAR = layout.tabBar;
const IOS = Platform.OS === 'ios';
const WEB = Platform.OS === 'web';
/** The FAB's slot in the bar, its diameter and how far it rises above the bar's centre line. */
const FAB_SLOT = 64;
const FAB = 58;
const FAB_RAISE = 10;

// Slot geometry (docs/NAVBAR-MOTION.md §2): contents are top-aligned with fixed metrics, so the pill's top
// is always the slot's y + 4.
const SLOT_H = 56;
const ZONE_TOP = 4;
const PILL_H = 32;
const PILL_MIN = 44;
const PILL_MAX = 56;
const pillWidth = (slotW: number) => Math.min(PILL_MAX, Math.max(PILL_MIN, slotW - 10));

// Motion constants (docs/NAVBAR-MOTION.md §3, all from `motion` in tokens.ts). Plain numbers and objects:
// worklets copy what they capture.
const SLIDE = { stiffness: motion.layout.stiffness, damping: motion.layout.damping, mass: motion.layout.mass };
const SNAP = { stiffness: motion.snap.stiffness, damping: motion.snap.damping, mass: motion.snap.mass };
const POP = { stiffness: motion.celebrate.stiffness, damping: motion.celebrate.damping, mass: motion.celebrate.mass };
const IN_MS = motion.fast; // 160
const OUT_MS = motion.instant; // 100
const BEAT_MAX = motion.slow; // 450
const GLOW_OUT_MS = motion.base; // 240
const OUT_QUAD = Easing.out(Easing.quad);
const OUT_CUBIC = Easing.out(Easing.cubic);
const IN_QUAD = Easing.in(Easing.quad);
const FADE_IN = { duration: IN_MS, easing: OUT_CUBIC, reduceMotion: ReduceMotion.Never };
const FADE_OUT = { duration: OUT_MS, easing: OUT_QUAD, reduceMotion: ReduceMotion.Never };
const PRESS_IN = { duration: OUT_MS, easing: OUT_QUAD };
/** Press-in scale of the icon / of the pill under a focused tab; the re-tap "nudge" goes a bit deeper. */
const PRESS_ICON = 0.9;
const PRESS_PILL = 0.95;
const NUDGE_ICON = 0.86;
const NUDGE_PILL = 0.92;
/** The FAB glow's peak opacity (= the deeper shadow's strength). */
const GLOW_PEAK = 0.5;

/** Decorative layers: never touchable, never read by a screen reader. */
const DECOR = { pointerEvents: 'none', accessible: false, importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// ── Active indicator (the sliding pill) ──────────────────────────────────────
type Geo = { x: number; y: number; w: number };

/**
 * The bar's one pill, shared with its TabButtons through context. The shared values only ever change from
 * effects and handlers; the owner / last position are JS bookkeeping, never read during render.
 */
type Indicator = {
  x: SharedValue<number>; // pill centre (track coords)
  y: SharedValue<number>; // pill top
  w: SharedValue<number>; // pill base width (changes only on layout)
  stretch: SharedValue<number>; // extra width while travelling (dp)
  press: SharedValue<number>; // 1 at rest; < 1 while the focused tab is pressed / nudged
  shown: SharedValue<number>; // opacity
  /** The focused tab claims the pill: it slides over if another tab held it, else appears in place. */
  place: (id: string, slot: Geo) => void;
  /** A tab that lost focus lets go (after the commit, so a tab claiming it in the same commit wins). */
  release: (id: string) => void;
  owns: (id: string) => boolean;
};

const TabIndicatorContext = createContext<Indicator | null>(null);

function useIndicator(): Indicator {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const stretch = useSharedValue(0);
  const press = useSharedValue(1);
  const shown = useSharedValue(0);
  const book = useRef({ owner: '', cx: 0 });
  return useMemo<Indicator>(
    () => ({
      x,
      y,
      w,
      stretch,
      press,
      shown,
      owns: (id) => book.current.owner === id,
      place: (id, slot) => {
        if (!(slot.w > 0)) return; // not measured yet: its onLayout places it
        const b = book.current;
        const cx = slot.x + slot.w / 2;
        w.set(pillWidth(slot.w));
        y.set(slot.y + ZONE_TOP);
        if (b.owner !== '') {
          // Travel from the tab that held it (or glide to this tab's new slot after a relayout).
          const dist = Math.abs(cx - b.cx);
          x.set(withSpring(cx, SLIDE));
          if (dist > 0.5) stretch.set(withSequence(withTiming(Math.min(0.15 * dist, 12), { duration: OUT_MS, easing: OUT_QUAD }), withSpring(0, SLIDE)));
        } else {
          // First layout, or after it was hidden: no slide-in, just a fade.
          x.set(cx);
          stretch.set(0);
          press.set(1);
        }
        b.owner = id;
        b.cx = cx;
        shown.set(withTiming(1, FADE_IN));
      },
      release: (id) => {
        queueMicrotask(() => {
          const b = book.current;
          if (b.owner !== id) return;
          b.owner = '';
          shown.set(withTiming(0, FADE_OUT));
        });
      },
    }),
    [x, y, w, stretch, press, shown],
  );
}

function TabIndicator({ ind }: { ind: Indicator }) {
  const { x, y, w, stretch, press, shown } = ind;
  const style = useAnimatedStyle(() => {
    const base = w.get();
    const p = press.get();
    // Stretch is a scaleX, not a width, so nothing is laid out per frame.
    const sx = base > 0 ? 1 + stretch.get() / base : 1;
    return {
      width: base,
      top: y.get(),
      opacity: shown.get(),
      transform: [{ translateX: x.get() - base / 2 }, { scaleX: sx * p }, { scaleY: p }],
    };
  });
  return <Animated.View {...DECOR} style={[styles.pill, style]} />;
}

/**
 * The floating frosted capsule. Children are TabButtons (and one TabFab for the staff app). `inline`
 * drops the floating position (kit gallery previews only). Its inner track is the coordinate space every
 * tab measures itself in, and holds the sliding pill as its first child (so the pill passes under the FAB).
 */
export const TabBarFrame = forwardRef<ViewRef, { children: ReactNode; inline?: boolean }>(function TabBarFrame({ children, inline, ...rest }, ref) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const indicator = useIndicator();
  // Reduce Motion: no shared pill; each tab cross-fades its own.
  const ind = reduced ? null : indicator;
  const side = width < layout.breakpoint.narrow ? BAR.insetNarrow : BAR.inset;
  return (
    <View
      pointerEvents="box-none"
      style={inline ? styles.inline : [styles.wrap, { left: side, right: side, bottom: Math.max(insets.bottom - 4, 10) }]}>
      <View ref={ref} {...rest} style={styles.bar} accessibilityRole="tablist">
        {IOS ? <BlurView intensity={45} tint={isDarkScheme() ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, styles.blur]} /> : null}
        <View style={styles.track}>
          {ind ? <TabIndicator ind={ind} /> : null}
          <TabIndicatorContext value={ind}>{children}</TabIndicatorContext>
        </View>
      </View>
    </View>
  );
});

// ── Badge ────────────────────────────────────────────────────────────────────
// Appears: scale 0.4 → 1.15 → spring to 1, opacity in 120 ms. Leaves at 0: scale → 0.5 and fade, 160 ms
// (the last number stays visible while it goes). Custom worklets need native layout animations, so the web
// preview uses an equivalent keyframe.
function badgeEnter() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.4 }] },
    animations: {
      opacity: withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
      transform: [{ scale: withSequence(withTiming(1.15, { duration: 140, easing: Easing.out(Easing.quad) }), withSpring(1, SNAP)) }],
    },
  };
}
const BADGE_IN_WEB = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.4 }] },
  40: { opacity: 1, transform: [{ scale: 1.1 }], easing: OUT_QUAD },
  47: { opacity: 1, transform: [{ scale: 1.15 }], easing: OUT_QUAD },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: OUT_CUBIC },
}).duration(300);
const BADGE_IN = WEB ? BADGE_IN_WEB : badgeEnter;
const BADGE_OUT = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 0.5 }], easing: IN_QUAD },
}).duration(160);
const BADGE_FADE_IN = FadeIn.duration(160).reduceMotion(ReduceMotion.Never);
const BADGE_FADE_OUT = FadeOut.duration(120).reduceMotion(ReduceMotion.Never);

/** The count on a tab's icon. Outside the glyph's moving parts, inside the press squeeze. */
function TabBadge({ count, reduced }: { count: number; reduced: boolean }) {
  const grow = useSharedValue(1);
  const wiggle = useSharedValue(0);
  const prev = useRef(count);
  useEffect(() => {
    const was = prev.current;
    prev.current = count;
    if (reduced || !(count > was && was > 0)) return;
    // More arrived while it was showing: pop and wiggle (never on mount, never when it drops).
    grow.set(withSequence(withTiming(1.22, { duration: 110, easing: OUT_QUAD }), withSpring(1, POP)));
    wiggle.set(withSequence(withTiming(-10, { duration: 70 }), withTiming(8, { duration: 90 }), withTiming(-4, { duration: 80 }), withTiming(0, { duration: 80 })));
  }, [count, reduced, grow, wiggle]);
  const inner = useAnimatedStyle(() => ({ transform: [{ scale: grow.get() }, { rotate: `${wiggle.get()}deg` }] }));
  return (
    // A badge already there when the bar first appears does not animate in, and one whose tab is removed
    // (a vendor losing Bills / Agreements) goes with it instead of zooming out where the tab used to be.
    <LayoutAnimationConfig skipEntering skipExiting>
      {count > 0 ? (
        <Animated.View {...DECOR} entering={reduced ? BADGE_FADE_IN : BADGE_IN} exiting={reduced ? BADGE_FADE_OUT : BADGE_OUT} style={styles.badgeWrap}>
          <Animated.View style={[styles.badge, inner]}>
            <Text variant="micro" color={palette.onPrimary} maxFontSizeMultiplier={1}>
              {count > 99 ? '99+' : count}
            </Text>
          </Animated.View>
        </Animated.View>
      ) : null}
    </LayoutAnimationConfig>
  );
}

// ── TabButton ────────────────────────────────────────────────────────────────
/** The old icon API: a lucide icon as two cross-faded layers (muted outline / brand with a soft fill). */
function LucideGlyph({ icon: Icon, on }: { icon: LucideIcon; on: SharedValue<number> }) {
  const outFade = useAnimatedStyle(() => ({ opacity: 1 - on.get() }));
  const inFade = useAnimatedStyle(() => ({ opacity: on.get() }));
  return (
    <View {...DECOR} style={styles.iconBox}>
      <Animated.View style={[StyleSheet.absoluteFill, outFade]}>
        <Icon size={24} color={palette.textMuted} strokeWidth={1.8} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, inFade]}>
        <Icon size={24} color={palette.primaryText} fill={palette.primarySoft} strokeWidth={2} />
      </Animated.View>
    </View>
  );
}

type TabButtonProps = Omit<TabTriggerSlotProps, 'ref'> & {
  label: string;
  badge?: number;
  /** Marks the tab as a tour target (docs/TOUR.md, e.g. 'tabs.inbox'); tapping its spotlight opens the tab. */
  tourId?: string;
} & (
    | { glyph: TabGlyphName; icon?: LucideIcon }
    | { glyph?: undefined; icon: LucideIcon }
  );

/**
 * One tab: icon over its name. `glyph` picks an animated tab icon (src/ui/tab-glyphs.tsx); `icon` (a lucide
 * icon) still works and cross-fades without a beat. Active = filled brand icon on the soft brand pill +
 * brand SemiBold label.
 */
export const TabButton = forwardRef<ViewRef, TabButtonProps>(function TabButton(
  { glyph, icon, label, badge, tourId, isFocused, onPress, onPressIn, onPressOut, ...props },
  ref,
) {
  const focused = !!isFocused;
  const { width } = useWindowDimensions();
  const big = width >= 412;
  const count = badge && badge > 0 ? badge : 0;
  const reduced = useReducedMotion();
  const ctx = useContext(TabIndicatorContext);
  const ind = reduced ? null : ctx;
  const id = useId();
  const on = useTabOn(focused);
  const zone = useSharedValue(1);
  const localW = useSharedValue(PILL_MAX);
  const slot = useRef<Geo>({ x: 0, y: 0, w: 0 });
  // Tour tap-through: the trigger's own press (its event is optional), so the tab really opens.
  const { ref: tourRef, onLayout: onTourLayout } = useTourTarget(tourId, {
    radius: 28,
    padding: 2,
    activate: () => {
      if (!focused) haptic.select();
      onPress?.(undefined as never);
    },
  });

  // The shared pill follows focus (never animated in on mount: the slot isn't measured yet then). The
  // cleanup lets go when this tab loses focus or unmounts while focused (a vendor's tab disappearing),
  // so the pill never stays behind on a slot that no longer has a focused tab.
  useEffect(() => {
    if (!ind || !focused) return;
    ind.place(id, slot.current);
    return () => ind.release(id);
  }, [ind, focused, id]);

  const zoneStyle = useAnimatedStyle(() => ({ transform: [{ scale: zone.get() }] }));
  const localPill = useAnimatedStyle(() => ({ width: localW.get(), opacity: on.get() }));
  const outFade = useAnimatedStyle(() => ({ opacity: 1 - on.get() }));
  const inFade = useAnimatedStyle(() => ({ opacity: on.get() }));
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -on.get() }] }));

  const onLayout = (e: LayoutChangeEvent) => {
    onTourLayout(e);
    const { x, y, width: w } = e.nativeEvent.layout;
    slot.current = { x, y, w };
    localW.set(pillWidth(w));
    if (ind && focused) ind.place(id, slot.current);
  };

  const labelStyle = [styles.label, big && styles.labelBig];
  return (
    <View ref={tourRef} collapsable={false} style={styles.slot} onLayout={onLayout}>
      <Pressable
        ref={ref}
        {...props}
        onPressIn={(e) => {
          if (!reduced) {
            zone.set(withTiming(PRESS_ICON, PRESS_IN));
            if (focused && ind?.owns(id)) ind.press.set(withTiming(PRESS_PILL, PRESS_IN));
          }
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          if (!reduced) {
            zone.set(withSpring(1, SNAP));
            if (focused && ind?.owns(id)) ind.press.set(withSpring(1, SNAP));
          }
          onPressOut?.(e);
        }}
        onPress={(e) => {
          if (!focused) haptic.select();
          else if (!reduced) {
            // Re-tap on the active tab: a small squeeze of icon and pill, no haptic (nothing changed).
            zone.set(withSequence(withTiming(NUDGE_ICON, { duration: 90, easing: OUT_QUAD }), withSpring(1, POP)));
            if (ind?.owns(id)) ind.press.set(withSequence(withTiming(NUDGE_PILL, { duration: 90, easing: OUT_QUAD }), withSpring(1, POP)));
          }
          onPress?.(e);
        }}
        style={({ pressed }) => [styles.press, reduced && pressed && styles.pressedDim]}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        aria-selected={focused}
        accessibilityLabel={count ? `${label}, ${count} waiting` : label}>
        <Animated.View style={[styles.zone, zoneStyle]}>
          {ind ? null : <Animated.View {...DECOR} style={[styles.localPill, localPill]} />}
          <View style={styles.iconBox}>
            {glyph ? <TabGlyph name={glyph} on={on} focused={focused} reduced={reduced} /> : icon ? <LucideGlyph icon={icon} on={on} /> : null}
            <TabBadge count={count} reduced={reduced} />
          </View>
        </Animated.View>
        <Animated.View style={[styles.labelBox, big && styles.labelBoxBig, !reduced && lift]}>
          <Animated.Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            maxFontSizeMultiplier={1}
            importantForAccessibility="no"
            accessibilityElementsHidden
            style={[labelStyle, styles.labelIdle, outFade]}>
            {label}
          </Animated.Text>
          <Animated.Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            maxFontSizeMultiplier={1}
            importantForAccessibility="no"
            accessibilityElementsHidden
            style={[labelStyle, styles.labelActive, inFade]}>
            {label}
          </Animated.Text>
        </Animated.View>
      </Pressable>
    </View>
  );
});

// ── TabFab ───────────────────────────────────────────────────────────────────
/**
 * The raised round centre button of the staff tab bar (58 dp, brand gradient, white +, soft
 * brand-tinted shadow), rising 10 dp above the bar. Put it between two TabTriggers inside TabBarFrame
 * (expo-router's TabList ignores non-trigger children). Opens the CreateSheet; pass `open` (the sheet's
 * visible state) and the + turns into × while the sheet is up.
 */
export function TabFab({
  onPress,
  open = false,
  accessibilityLabel = 'Create',
  accessibilityHint = 'Shows what you can start: leave, a claim, a ticket and more',
  tourId,
}: {
  onPress: () => void;
  /** Marks the button as a tour target (circle); tapping its spotlight opens the sheet. */
  tourId?: string;
  /** The sheet this button opens is showing: the + turns 45° into ×. */
  open?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const reduced = useReducedMotion();
  const turn = useSharedValue(open ? 1 : 0);
  const ring = useSharedValue(1); // rests at 1 = invisible
  const glow = useSharedValue(0);

  useEffect(() => {
    const to = open ? 1 : 0;
    turn.set(reduced ? withTiming(to, FADE_IN) : withSpring(to, SNAP));
  }, [open, reduced, turn]);

  const turnStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${45 * turn.get()}deg` }] }));
  const plusFade = useAnimatedStyle(() => ({ opacity: 1 - turn.get() }));
  const crossFade = useAnimatedStyle(() => ({ opacity: turn.get() }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.4 * (1 - ring.get()), transform: [{ scale: 1 + 0.45 * ring.get() }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));

  return (
    <View style={styles.fabSlot} pointerEvents="box-none">
      <View style={styles.fabLift} pointerEvents="box-none">
        {reduced ? null : <Animated.View {...DECOR} style={[styles.fabRing, ringStyle]} />}
        <TourTarget
          id={tourId}
          shape="circle"
          padding={4}
          activate={() => {
            haptic.select();
            onPress();
          }}>
          <PressableScale
            onPressIn={() => glow.set(withTiming(GLOW_PEAK, FADE_OUT))}
            onPressOut={() => glow.set(withTiming(0, { duration: GLOW_OUT_MS, easing: OUT_QUAD, reduceMotion: ReduceMotion.Never }))}
            onPress={() => {
              haptic.select();
              if (!reduced) {
                // One ring, once per press: no loop, no idle pulse.
                ring.set(0);
                ring.set(withTiming(1, { duration: BEAT_MAX, easing: OUT_CUBIC }));
              }
              onPress();
            }}
            scaleTo={0.92}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ expanded: open }}
            aria-expanded={open}
            style={styles.fab}>
            {/* The deeper glow: only its opacity animates; the gradient covers its fill, so only its shadow shows. */}
            <Animated.View {...DECOR} style={[styles.fabGlow, glowStyle]} />
            <LinearGradient colors={gradient.brand} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={styles.fabFill} pointerEvents="none" />
            {/* In a View so it paints above the absolute gradient on web too. */}
            {reduced ? (
              <View pointerEvents="none" style={styles.fabGlyph}>
                <Animated.View style={[StyleSheet.absoluteFill, plusFade]}>
                  <Plus size={26} color={palette.onPrimary} strokeWidth={2.2} />
                </Animated.View>
                {/* The same + turned 45° (a static pose, not movement), so the × matches the animated one. */}
                <Animated.View style={[StyleSheet.absoluteFill, styles.fabCross, crossFade]}>
                  <Plus size={26} color={palette.onPrimary} strokeWidth={2.2} />
                </Animated.View>
              </View>
            ) : (
              <Animated.View pointerEvents="none" style={[styles.fabGlyph, turnStyle]}>
                <Plus size={26} color={palette.onPrimary} strokeWidth={2.2} />
              </Animated.View>
            )}
          </PressableScale>
        </TourTarget>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { position: 'absolute', alignItems: 'stretch' },
  inline: { alignItems: 'stretch', paddingTop: FAB_RAISE },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR.height,
    paddingHorizontal: BAR.padX,
    borderRadius: BAR.height / 2,
    // iOS: real blur behind the frost veil, bright rim. Android: solid, so nothing scrolls through under
    // the labels — canvas white in light mode, the raised `surface` in dark mode (canvasTop would sink
    // into the dark canvas) — with a hairline rim.
    backgroundColor: IOS ? palette.frost : isDarkScheme() ? palette.surface : palette.canvasTop,
    borderWidth: 1,
    borderColor: IOS ? palette.glassEdge : palette.glassLine,
    ...shadow.float,
  },
  blur: { borderRadius: BAR.height / 2, overflow: 'hidden' },
  // No padding or border, so a slot's onLayout x/y are exactly the pill's coordinates.
  track: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center' },
  pill: { position: 'absolute', left: 0, top: 0, height: PILL_H, borderRadius: PILL_H / 2, backgroundColor: palette.primarySoft },
  slot: { flex: 1, minWidth: 0, height: SLOT_H },
  // No side padding: the label gets the whole slot ("Agreements" needs ~66 dp at 11 px SemiBold).
  press: { flex: 1, alignItems: 'center', paddingTop: ZONE_TOP, borderRadius: 28 },
  pressedDim: { opacity: 0.7 },
  // The pill's box: 32 high, the 24 dp icon centred in it (icon top = slot y + 8).
  zone: { alignSelf: 'stretch', height: PILL_H, alignItems: 'center', justifyContent: 'center' },
  localPill: { position: 'absolute', top: 0, alignSelf: 'center', height: PILL_H, borderRadius: PILL_H / 2, backgroundColor: palette.primarySoft },
  iconBox: { width: 24, height: 24 },
  labelBox: { alignSelf: 'stretch', marginTop: 2, height: 14 },
  labelBoxBig: { height: 15 },
  label: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0,
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  labelBig: { fontSize: 12, lineHeight: 15 },
  labelIdle: { fontFamily: font.medium, color: palette.textMuted },
  labelActive: { position: 'absolute', top: 0, left: 0, right: 0, fontFamily: font.semibold, color: palette.primaryText },
  badgeWrap: { position: 'absolute', top: -6, left: 14 },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    // White text needs a deep red fill: dangerInk in light, danger in dark (dangerInk is a text red there).
    backgroundColor: isDarkScheme() ? palette.danger : palette.dangerInk,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.surface,
  },
  fabSlot: { width: FAB_SLOT, height: BAR.height, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // The lift lives on a plain wrapper: PressableScale's own transform (the press scale) would replace it.
  fabLift: { transform: [{ translateY: -FAB_RAISE }] },
  fab: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
    // A soft brand-tinted shadow (coloured elevation on Android 9+).
    shadowColor: palette.primary,
    shadowOpacity: 0.34,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fabFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: FAB / 2 },
  // A box shadow (not elevation) so on Android it stays under the gradient instead of being drawn above it.
  fabGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: FAB / 2,
    backgroundColor: palette.primary,
    boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 18, spreadDistance: 0, color: palette.primary }],
  },
  fabRing: { position: 'absolute', top: 0, left: 0, width: FAB, height: FAB, borderRadius: FAB / 2, borderWidth: 2, borderColor: palette.primaryText },
  fabGlyph: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  fabCross: { transform: [{ rotate: '45deg' }] },
}));
