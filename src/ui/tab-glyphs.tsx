// The tab bar's own icon set (docs/NAVBAR-MOTION.md §4–§5): Home, Me, Inbox, More (staff) and Home, Bills,
// Agreements, Profile (vendor; Profile is the Me drawing). Each glyph is drawn on a 24 grid at 1:1 (1 SVG
// unit = 1 dp) and rendered at 24 × 24 dp. Idle = muted outline (1.8, round caps). Active = filled in brand
// with white details at 1.6, so a selection changes shape, not only colour.
//
// Colour never animates: every glyph is a stack of small layers (an outline copy and an active copy) that
// cross-fade by opacity on `on` (0 → 1, owned by TabButton). Movement is a transform on the Animated.View
// that holds a layer (transformOrigin is in dp, so it equals the SVG coordinates). The only animated SVG
// prop is strokeDashoffset (the draw-on lines). Everything runs on the UI thread; nothing re-renders per
// frame.
//
// Each glyph plays one short "beat" (≤ 450 ms) when it becomes selected after mount, then rests. Its rest
// values are the final active pose, so Reduce Motion (no beat, only the fade) and every frame after the
// beat are already correct. Deselecting fades back to outline in 100 ms with no movement. A beat never
// plays on mount, on app start or when a cached route is restored.
//
// Light / dark: colours are read at render time (the tokens are live; the app remounts on a scheme
// change). The active fill is `primaryText` (the brand itself in light mode, the lifted coral that reads
// on dark surfaces in dark mode). Details are white in light mode and knocked out in the pill's own tint
// (`primarySoft`) in dark mode, where white on the coral would be too faint (5.6:1 instead of 2.3:1).

import { type ComponentProps, type ComponentType, type ReactNode, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { themedStyles } from '@/theme/themed';
import { motion, palette, themeVersion } from '@/theme/tokens';
import { isDarkScheme } from '@/ui/surface';

export type TabGlyphName = 'home' | 'me' | 'inbox' | 'more' | 'bills' | 'agreements' | 'profile';
export const TAB_GLYPH_NAMES: readonly TabGlyphName[] = ['home', 'me', 'inbox', 'more', 'bills', 'agreements', 'profile'];

/** What every glyph gets from TabButton: the shared selection fade, the focus flag and Reduce Motion. */
export type GlyphProps = { on: SharedValue<number>; focused: boolean; reduced: boolean };

// ── Motion constants (docs/NAVBAR-MOTION.md §3, all from `motion` in tokens.ts) ─────────────────────
// Plain numbers and objects: worklets copy what they capture.
const SLIDE = { stiffness: motion.layout.stiffness, damping: motion.layout.damping, mass: motion.layout.mass };
const SNAP = { stiffness: motion.snap.stiffness, damping: motion.snap.damping, mass: motion.snap.mass };
const POP = { stiffness: motion.celebrate.stiffness, damping: motion.celebrate.damping, mass: motion.celebrate.mass };
const IN_MS = motion.fast; // 160
const OUT_MS = motion.instant; // 100
const STAGGER = motion.stagger; // 40
const OUT_QUAD = Easing.out(Easing.quad);
const OUT_CUBIC = Easing.out(Easing.cubic);
const IN_QUAD = Easing.in(Easing.quad);
const INOUT_QUAD = Easing.inOut(Easing.quad);

// ── Colours and stroke presets ───────────────────────────────────────────────
// Built per scheme (cached on themeVersion) and read in render, never frozen at module load.
const CAPS = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function makePaint() {
  const muted = palette.textMuted;
  const brand = palette.primaryText;
  const detail = isDarkScheme() ? palette.primarySoft : palette.onPrimary;
  return {
    /** White details / knock-outs on the brand fill (the pill's tint in dark mode). */
    detail,
    OUTLINE: { ...CAPS, stroke: muted, strokeWidth: 1.8, fill: 'none' },
    BRAND_LINE: { ...CAPS, stroke: brand, strokeWidth: 1.8, fill: 'none' },
    BRAND_FILL: { ...CAPS, stroke: brand, strokeWidth: 1.8, fill: brand },
    DETAIL: { ...CAPS, stroke: detail, strokeWidth: 1.6, fill: 'none' },
  } as const;
}
let paintCache: { v: number; p: ReturnType<typeof makePaint> } | null = null;
/** The current scheme's glyph colours (call it in render). */
function paint() {
  const v = themeVersion();
  if (!paintCache || paintCache.v !== v) paintCache = { v, p: makePaint() };
  return paintCache.p;
}

// ── Geometry (docs/NAVBAR-MOTION.md §4) ──────────────────────────────────────
const HOME_BODY = 'M5 8.6 L12 3 L19 8.6 V18 A2.5 2.5 0 0 1 16.5 20.5 H7.5 A2.5 2.5 0 0 1 5 18 Z';
const HOME_ROOF = 'M2.75 10.4 L12 3 L21.25 10.4';
const HOME_DOOR_LINE = 'M9.75 20.5 V16.25 A2.25 2.25 0 0 1 14.25 16.25 V20.5';
const HOME_DOOR_FILL = 'M9.75 19.7 V16.25 A2.25 2.25 0 0 1 14.25 16.25 V19.7 Z';

const ME_BUST = 'M5 20.5 C4.4 20.5 4.1 20 4.2 19.4 C4.9 16.2 8.1 14 12 14 C15.9 14 19.1 16.2 19.8 19.4 C19.9 20 19.6 20.5 19 20.5 Z';
const ME_COLLAR = 'M10.2 14.9 L12 16.9 L13.8 14.9';
const ME_LEFT = 'M12 14 C8.1 14 4.9 16.2 4.2 19.4 C4.1 20 4.4 20.5 5 20.5 H12';
const ME_RIGHT = 'M12 14 C15.9 14 19.1 16.2 19.8 19.4 C19.9 20 19.6 20.5 19 20.5 H12';
const ME_HALF_L = 18.9;

const INBOX_SHELL = 'M5.39 5.83 A2 2 0 0 1 7.28 4.5 H16.72 A2 2 0 0 1 18.61 5.83 L21 12.5 V18 A2.5 2.5 0 0 1 18.5 20.5 H5.5 A2.5 2.5 0 0 1 3 18 V12.5 Z';
const INBOX_RIM = 'M3 12.5 H7.7 L9.3 15.5 H14.7 L16.3 12.5 H21';
const INBOX_RIM_IN = 'M4.6 12.5 H7.7 L9.3 15.5 H14.7 L16.3 12.5 H19.4';

const BILL_PAPER = 'M5 21 V5 A2 2 0 0 1 7 3 H17 A2 2 0 0 1 19 5 V21 L16.67 19.5 L14.33 21 L12 19.5 L9.67 21 L7.33 19.5 Z';
const BILL_LINES = ['M8.5 7.5 H15.5', 'M8.5 11 H15.5', 'M8.5 14.5 H12.5'] as const;
const BILL_LINE_L = [7, 7, 4] as const;

const AG_PAGE_OPEN = 'M17.5 12.5 V5.5 A2.5 2.5 0 0 0 15 3 H7 A2.5 2.5 0 0 0 4.5 5.5 V18.5 A2.5 2.5 0 0 0 7 21 H13.5';
const AG_PAGE_FULL = 'M7 3 H15 A2.5 2.5 0 0 1 17.5 5.5 V18.5 A2.5 2.5 0 0 1 15 21 H7 A2.5 2.5 0 0 1 4.5 18.5 V5.5 A2.5 2.5 0 0 1 7 3 Z';
const AG_LINES = 'M8 7.5 H14 M8 10.5 H11.5';
const AG_SIGN = 'M7.4 15.2 C8.2 13.2 9.2 13.2 9.4 14.6 C9.6 16 10.6 16 11.2 14.8 C11.5 14.2 12 14.1 12.6 14.4';
const AG_SIGN_L = 8.0;
const AG_PEN = 'M13 14.2 L15.44 14.59 L18.69 17.84 A1.45 1.45 0 0 1 18.69 19.89 A1.45 1.45 0 0 1 16.64 19.89 L13.39 16.64 Z';
const AG_BAND = 'M15.44 14.59 L13.39 16.64';
// The pen's path along the signature (§5 Agreements): over [0, T0] it slides back to the start, over
// [T0, 1] it writes, sampled at equal arc-length steps so the speed is steady.
const AG_MS = 380;
const T0 = 120 / AG_MS;
const AG_T = [0, T0, ...[1, 2, 3, 4, 5, 6, 7].map((k) => T0 + k * 0.125 * (1 - T0)), 1];
const AG_DX = [0, -5.6, -5.15, -4.44, -3.71, -3.47, -2.74, -1.96, -1.36, 0];
const AG_DY = [0, 1.0, 0.11, -0.56, -0.05, 0.91, 1.47, 0.89, 0.12, 0];

// More: four 6.6 × 6.6 squares (rx 1.9) drawn as plain Views. With the 1.8 stroke each is an 8.4 box,
// radius 2.8, 2 dp apart, so the grid spans 2.6–21.4. Four solid squares carry more weight than the
// other shapes, so the grid sits a little inside the 2–22 live area to match them optically.
// Numbered clockwise: top-left, top-right, bottom-right, bottom-left.
const TILE = 8.4;
const TILE_AT = [
  [2.6, 2.6],
  [13, 2.6],
  [13, 13],
  [2.6, 13],
] as const;

// transformOrigin in dp (= SVG units at 24 dp).
const origins = StyleSheet.create({
  door: { transformOrigin: [12, 19.7, 0] },
  head: { transformOrigin: [12, 7.5, 0] },
  tray: { transformOrigin: [12, 20.5, 0] },
  receipt: { transformOrigin: [12, 3, 0] },
});

// ── Shared helpers ───────────────────────────────────────────────────────────
const AnimatedPath = Animated.createAnimatedComponent(Path);
type LayerStyle = ComponentProps<typeof Animated.View>['style'];

/** One 24 × 24 SVG layer stacked in the glyph box; animate the View, never the SVG node. */
function Layer({ style, children }: { style?: LayerStyle; children: ReactNode }) {
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={24} height={24} viewBox="0 0 24 24">
        {children}
      </Svg>
    </Animated.View>
  );
}

/** A moving group of layers (a part's outline and active copies move together, so no ghost stays). */
function Group({ style, children }: { style?: LayerStyle; children: ReactNode }) {
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {children}
    </Animated.View>
  );
}

function Box({ children }: { children: ReactNode }) {
  return (
    <View style={styles.box} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {children}
    </View>
  );
}

function useFades(on: SharedValue<number>) {
  const outFade = useAnimatedStyle(() => ({ opacity: 1 - on.get() }));
  const inFade = useAnimatedStyle(() => ({ opacity: on.get() }));
  return { outFade, inFade };
}

/** strokeDashoffset driver for a draw-on path of length L: hidden (cap included) at d = 0, drawn at 1. */
function useDraw(d: SharedValue<number>, L: number) {
  return useAnimatedProps(() => ({ strokeDashoffset: (L + 1) * (1 - d.get()) }));
}
const dash = (L: number) => `${L} ${L + 2}`;

/** The house "pop": a short timing overshoot, then a spring back to rest. */
const pop = (peak: number, ms: number, rest = 1) => withSequence(withTiming(peak, { duration: ms, easing: OUT_QUAD }), withSpring(rest, POP));
/** Deselect: whatever still moves goes to rest quietly, no bounce. */
const settle = (v: SharedValue<number>, rest: number) => v.set(withTiming(rest, { duration: OUT_MS, easing: OUT_QUAD }));
/** Start an "active-only" value from `from` and run it to 1. */
const runFrom = (v: SharedValue<number>, from: number, delay: number, ms: number, easing = OUT_CUBIC) => {
  v.set(from);
  v.set(withDelay(delay, withTiming(1, { duration: ms, easing })));
};

/**
 * Plays `play` when the tab becomes selected after mount and `settle` when it loses selection. Never on
 * mount (the ref starts at the mount value, which also makes StrictMode's double effects safe). With
 * Reduce Motion nothing plays: TabButton's `on` cross-fade is the whole transition.
 */
function useGlyphBeat(focused: boolean, reduced: boolean, play: () => void, settleAll: () => void) {
  const prev = useRef(focused);
  useEffect(() => {
    if (prev.current === focused) return;
    prev.current = focused;
    if (reduced) return;
    if (focused) play();
    else settleAll();
  }, [focused, reduced, play, settleAll]);
}

/**
 * The selection fade every tab shares: 0 → 1 in 160 ms (out cubic) on select, 1 → 0 in 100 ms on deselect.
 * Kept under Reduce Motion (a fade is not movement), so it never jumps.
 */
export function useTabOn(focused: boolean) {
  const on = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    on.set(
      focused
        ? withTiming(1, { duration: IN_MS, easing: OUT_CUBIC, reduceMotion: ReduceMotion.Never })
        : withTiming(0, { duration: OUT_MS, easing: OUT_QUAD, reduceMotion: ReduceMotion.Never }),
    );
  }, [focused, on]);
  return on;
}

// ── Home: the roof hops and the door fills up from the threshold ────────────
function HomeGlyph({ on, focused, reduced }: GlyphProps) {
  const { OUTLINE, BRAND_LINE, BRAND_FILL, detail } = paint();
  const roofY = useSharedValue(0);
  const door = useSharedValue(1);
  const { outFade, inFade } = useFades(on);
  const roof = useAnimatedStyle(() => ({ transform: [{ translateY: roofY.get() }] }));
  const doorStyle = useAnimatedStyle(() => ({ opacity: on.get(), transform: [{ scaleY: door.get() }] }));

  useGlyphBeat(
    focused,
    reduced,
    () => {
      roofY.set(pop(-2, 110, 0));
      runFrom(door, 0, 90, 220);
    },
    () => {
      settle(roofY, 0);
      door.set(1);
    },
  );

  return (
    <Box>
      <Layer style={outFade}>
        <Path d={HOME_BODY} {...OUTLINE} />
        <Path d={HOME_DOOR_LINE} {...OUTLINE} />
      </Layer>
      <Layer style={inFade}>
        <Path d={HOME_BODY} {...BRAND_FILL} />
      </Layer>
      <Group style={roof}>
        <Layer style={outFade}>
          <Path d={HOME_ROOF} {...OUTLINE} />
        </Layer>
        <Layer style={inFade}>
          <Path d={HOME_ROOF} {...BRAND_LINE} />
        </Layer>
      </Group>
      <Layer style={[origins.door, doorStyle]}>
        <Path d={HOME_DOOR_FILL} fill={detail} />
      </Layer>
    </Box>
  );
}

// ── Me / Profile: the head pops, the shoulders draw on, the body floods in, the collar last ─────────
function MeGlyph({ on, focused, reduced }: GlyphProps) {
  const { OUTLINE, BRAND_LINE, BRAND_FILL, DETAIL } = paint();
  const head = useSharedValue(1);
  const draw = useSharedValue(1);
  const fill = useSharedValue(1);
  const collar = useSharedValue(1);
  const { outFade, inFade } = useFades(on);
  const headStyle = useAnimatedStyle(() => ({ transform: [{ scale: head.get() }] }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: on.get() * fill.get() }));
  const collarStyle = useAnimatedStyle(() => ({ opacity: on.get() * collar.get() }));
  const drawLeft = useDraw(draw, ME_HALF_L);
  const drawRight = useDraw(draw, ME_HALF_L);

  useGlyphBeat(
    focused,
    reduced,
    () => {
      head.set(pop(1.16, 120));
      runFrom(draw, 0, 40, 240);
      runFrom(fill, 0, 160, 160, OUT_QUAD);
      runFrom(collar, 0, 240, 120, OUT_QUAD);
    },
    () => {
      settle(head, 1);
      draw.set(1);
      fill.set(1);
      collar.set(1);
    },
  );

  return (
    <Box>
      <Group style={[origins.head, headStyle]}>
        <Layer style={outFade}>
          <Circle cx={12} cy={7.5} r={3.7} {...OUTLINE} />
        </Layer>
        <Layer style={inFade}>
          <Circle cx={12} cy={7.5} r={3.7} {...BRAND_FILL} />
        </Layer>
      </Group>
      <Layer style={outFade}>
        <Path d={ME_BUST} {...OUTLINE} />
      </Layer>
      <Layer style={fillStyle}>
        <Path d={ME_BUST} {...BRAND_FILL} />
      </Layer>
      <Layer style={inFade}>
        <AnimatedPath d={ME_LEFT} {...BRAND_LINE} strokeDasharray={dash(ME_HALF_L)} animatedProps={drawLeft} />
        <AnimatedPath d={ME_RIGHT} {...BRAND_LINE} strokeDasharray={dash(ME_HALF_L)} animatedProps={drawRight} />
      </Layer>
      <Layer style={collarStyle}>
        <Path d={ME_COLLAR} {...DETAIL} />
      </Layer>
    </Box>
  );
}

// ── Inbox: a white letter drops in and the tray tilts as it lands ────────────
function InboxGlyph({ on, focused, reduced }: GlyphProps) {
  const { OUTLINE, BRAND_FILL, DETAIL, detail } = paint();
  const tilt = useSharedValue(0);
  const letterY = useSharedValue(0);
  const letterO = useSharedValue(1);
  const { outFade, inFade } = useFades(on);
  const tray = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.get()}deg` }] }));
  const letter = useAnimatedStyle(() => ({ opacity: on.get() * letterO.get(), transform: [{ translateY: letterY.get() }] }));

  useGlyphBeat(
    focused,
    reduced,
    () => {
      letterY.set(-6);
      letterY.set(withTiming(0, { duration: 150, easing: IN_QUAD }));
      letterO.set(0);
      letterO.set(withTiming(1, { duration: 90, easing: OUT_QUAD }));
      tilt.set(withDelay(150, withSequence(withTiming(-6, { duration: 70, easing: OUT_QUAD }), withSpring(0, SNAP))));
    },
    () => {
      settle(tilt, 0);
      letterY.set(0);
      letterO.set(1);
    },
  );

  return (
    <Box>
      <Group style={[origins.tray, tray]}>
        <Layer style={outFade}>
          <Path d={INBOX_SHELL} {...OUTLINE} />
          <Path d={INBOX_RIM} {...OUTLINE} />
        </Layer>
        <Layer style={inFade}>
          <Path d={INBOX_SHELL} {...BRAND_FILL} />
          <Path d={INBOX_RIM_IN} {...DETAIL} />
        </Layer>
        <Layer style={letter}>
          <Rect x={8.6} y={6.6} width={6.8} height={4.2} rx={1.2} fill={detail} />
        </Layer>
      </Group>
    </Box>
  );
}

// ── More: the tiles pop in clockwise while the grid turns a quarter back to 0° ─────────────────────
function MoreTile({ index, on, outFade, focused, reduced }: GlyphProps & { index: number; outFade: LayerStyle }) {
  const scale = useSharedValue(1);
  const fill = useSharedValue(1);
  const fillStyle = useAnimatedStyle(() => ({ opacity: on.get() * fill.get(), transform: [{ scale: scale.get() }] }));
  const at = TILE_AT[index] ?? TILE_AT[0];
  const pos = { left: at[0], top: at[1] };

  useGlyphBeat(
    focused,
    reduced,
    () => {
      const wait = index * STAGGER;
      scale.set(0.6);
      scale.set(withDelay(wait, withSpring(1, POP)));
      runFrom(fill, 0, wait, 120, OUT_QUAD);
    },
    () => {
      scale.set(1);
      fill.set(1);
    },
  );

  return (
    <>
      <Animated.View style={[styles.tile, styles.tileLine, pos, outFade]} />
      <Animated.View style={[styles.tile, styles.tileFill, pos, fillStyle]} />
    </>
  );
}

function MoreGlyph({ on, focused, reduced }: GlyphProps) {
  const turn = useSharedValue(0);
  const { outFade } = useFades(on);
  const grid = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));

  useGlyphBeat(
    focused,
    reduced,
    () => {
      // A 2 × 2 grid looks the same at −90°, so the jump to the start pose is invisible.
      turn.set(-90);
      turn.set(withSpring(0, SLIDE));
    },
    () => settle(turn, 0),
  );

  return (
    <Box>
      <Group style={grid}>
        {TILE_AT.map((_, i) => (
          <MoreTile key={i} index={i} on={on} outFade={outFade} focused={focused} reduced={reduced} />
        ))}
      </Group>
    </Box>
  );
}

// ── Bills: the receipt swings from its top and the lines print one by one ───────────────────────────
function BillsGlyph({ on, focused, reduced }: GlyphProps) {
  const { OUTLINE, BRAND_FILL, DETAIL } = paint();
  const swing = useSharedValue(0);
  const l0 = useSharedValue(1);
  const l1 = useSharedValue(1);
  const l2 = useSharedValue(1);
  const { outFade, inFade } = useFades(on);
  const receipt = useAnimatedStyle(() => ({ transform: [{ rotate: `${swing.get()}deg` }] }));
  const p0 = useDraw(l0, BILL_LINE_L[0]);
  const p1 = useDraw(l1, BILL_LINE_L[1]);
  const p2 = useDraw(l2, BILL_LINE_L[2]);

  useGlyphBeat(
    focused,
    reduced,
    () => {
      swing.set(
        withSequence(
          withTiming(-7, { duration: 80, easing: OUT_QUAD }),
          withTiming(5, { duration: 100, easing: INOUT_QUAD }),
          withTiming(-2.5, { duration: 90, easing: INOUT_QUAD }),
          withSpring(0, SNAP),
        ),
      );
      runFrom(l0, 0, 60, 160);
      runFrom(l1, 0, 100, 160);
      runFrom(l2, 0, 140, 160);
    },
    () => {
      settle(swing, 0);
      l0.set(1);
      l1.set(1);
      l2.set(1);
    },
  );

  return (
    <Box>
      <Group style={[origins.receipt, receipt]}>
        <Layer style={outFade}>
          <Path d={BILL_PAPER} {...OUTLINE} />
          {BILL_LINES.map((d) => (
            <Path key={d} d={d} {...OUTLINE} />
          ))}
        </Layer>
        <Layer style={inFade}>
          <Path d={BILL_PAPER} {...BRAND_FILL} />
          <AnimatedPath d={BILL_LINES[0]} {...DETAIL} strokeDasharray={dash(BILL_LINE_L[0])} animatedProps={p0} />
          <AnimatedPath d={BILL_LINES[1]} {...DETAIL} strokeDasharray={dash(BILL_LINE_L[1])} animatedProps={p1} />
          <AnimatedPath d={BILL_LINES[2]} {...DETAIL} strokeDasharray={dash(BILL_LINE_L[2])} animatedProps={p2} />
        </Layer>
      </Group>
    </Box>
  );
}

// ── Agreements: the pen slides back and writes the signature, ink following the nib ────────────────
function AgreementsGlyph({ on, focused, reduced }: GlyphProps) {
  const { OUTLINE, BRAND_FILL, DETAIL, detail } = paint();
  const t = useSharedValue(1);
  const { outFade, inFade } = useFades(on);
  const pen = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.get(), AG_T, AG_DX, Extrapolation.CLAMP) },
      { translateY: interpolate(t.get(), AG_T, AG_DY, Extrapolation.CLAMP) },
    ],
  }));
  const ink = useAnimatedProps(() => ({
    strokeDashoffset: (AG_SIGN_L + 1) * (1 - interpolate(t.get(), [T0, 1], [0, 1], Extrapolation.CLAMP)),
  }));

  useGlyphBeat(
    focused,
    reduced,
    () => {
      t.set(0);
      t.set(withTiming(1, { duration: AG_MS, easing: Easing.linear }));
    },
    () => settle(t, 1),
  );

  return (
    <Box>
      <Layer style={outFade}>
        <Path d={AG_PAGE_OPEN} {...OUTLINE} />
        <Path d={AG_LINES} {...OUTLINE} />
        <Path d={AG_SIGN} {...OUTLINE} />
      </Layer>
      <Layer style={inFade}>
        <Path d={AG_PAGE_FULL} {...BRAND_FILL} />
        <Path d={AG_LINES} {...DETAIL} />
        <AnimatedPath d={AG_SIGN} {...DETAIL} strokeDasharray={dash(AG_SIGN_L)} animatedProps={ink} />
      </Layer>
      <Group style={pen}>
        <Layer style={outFade}>
          <Path d={AG_PEN} {...OUTLINE} />
          <Path d={AG_BAND} {...OUTLINE} />
        </Layer>
        <Layer style={inFade}>
          {/* A halo in the detail colour first, so a 0.8 dp gap separates the brand pen from the brand page. */}
          <Path d={AG_PEN} {...CAPS} stroke={detail} strokeWidth={3.4} fill="none" />
          <Path d={AG_PEN} {...BRAND_FILL} />
          <Path d={AG_BAND} {...CAPS} stroke={detail} strokeWidth={1.4} fill="none" />
        </Layer>
      </Group>
    </Box>
  );
}

/** The glyph components by name, for layouts and the kit gallery. `profile` reuses the Me drawing. */
export const TAB_GLYPHS: Record<TabGlyphName, ComponentType<GlyphProps>> = {
  home: HomeGlyph,
  me: MeGlyph,
  inbox: InboxGlyph,
  more: MoreGlyph,
  bills: BillsGlyph,
  agreements: AgreementsGlyph,
  profile: MeGlyph,
};

/** One 24 × 24 dp tab icon that cross-fades with `on` and plays its beat when `focused` turns on. */
export function TabGlyph({ name, on, focused, reduced }: GlyphProps & { name: TabGlyphName }) {
  switch (name) {
    case 'home':
      return <HomeGlyph on={on} focused={focused} reduced={reduced} />;
    case 'me':
    case 'profile':
      return <MeGlyph on={on} focused={focused} reduced={reduced} />;
    case 'inbox':
      return <InboxGlyph on={on} focused={focused} reduced={reduced} />;
    case 'more':
      return <MoreGlyph on={on} focused={focused} reduced={reduced} />;
    case 'bills':
      return <BillsGlyph on={on} focused={focused} reduced={reduced} />;
    case 'agreements':
      return <AgreementsGlyph on={on} focused={focused} reduced={reduced} />;
    default:
      return <View style={styles.box} />;
  }
}

const styles = themedStyles(() => ({
  box: { width: 24, height: 24 },
  tile: { position: 'absolute', width: TILE, height: TILE, borderRadius: 2.8 },
  tileLine: { borderWidth: 1.8, borderColor: palette.textMuted },
  tileFill: { backgroundColor: palette.primaryText },
}));
