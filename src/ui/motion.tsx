// Motion primitives — every screen moves the same way (docs/DESIGN.md §13):
//   Reveal         content fades up 12 dp into place on mount, staggered 40 ms by index (capped at 5)
//   PressableScale anything tappable sinks slightly under the finger (100 ms) and snaps back (spring)
//   useCountUp     big numbers count up on first show; later big changes glide, small ones jump
//   GrowIn         charts grow up from their baseline
// Everything except useCountUp runs on the UI thread through Reanimated (works in Expo Go), so it stays
// smooth while the JS thread is busy rendering data. With the OS "Reduce Motion" setting on, Reanimated
// jumps timing/spring animations to their end, and the JS-driven bits here check useReducedMotion().

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Plain numbers captured by the worklets below (worklets copy what they capture, so keep it small).
const ENTER_OFFSET = motion.enterOffset;
const ENTER_MOVE_MS = motion.enter;
const ENTER_FADE_MS = motion.base;
const SNAP = motion.snap;

// ── Reveal ───────────────────────────────────────────────────────────────────
function fadeUp(delay: number) {
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: ENTER_OFFSET }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: ENTER_FADE_MS, easing: Easing.out(Easing.quad) })),
        transform: [{ translateY: withDelay(delay, withTiming(0, { duration: ENTER_MOVE_MS, easing: Easing.out(Easing.cubic) })) }],
      },
    };
  };
}

/**
 * Fades its children up into place once, on mount. `index` staggers siblings by 40 ms (capped at 5).
 * `collapseGap`: the parent's `gap`. While the content renders nothing (0 high) the Reveal pulls itself
 * up by that much, so an empty child (a component that returned null) never leaves a double gap.
 */
export function Reveal({
  index = 0,
  delay,
  collapseGap,
  children,
  style,
}: {
  index?: number;
  delay?: number;
  collapseGap?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const wait = delay ?? Math.min(Math.max(index, 0), motion.staggerMax) * motion.stagger;
  const [empty, setEmpty] = useState(false);
  const onLayout = collapseGap
    ? (e: LayoutChangeEvent) => {
        const none = e.nativeEvent.layout.height < 0.5;
        if (none !== empty) setEmpty(none);
      }
    : undefined;
  return (
    <Animated.View entering={fadeUp(wait)} onLayout={onLayout} style={[style, empty && collapseGap ? { marginTop: -collapseGap } : null]}>
      {children}
    </Animated.View>
  );
}

// ── PressableScale ───────────────────────────────────────────────────────────
/** A Pressable that scales to `scaleTo` while pressed (buttons 0.97, icon buttons 0.92, cards 0.985). */
export function PressableScale({
  scaleTo = 0.97,
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & { scaleTo?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const still = reduced || scaleTo === 1;
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        if (!still) scale.set(withTiming(scaleTo, { duration: motion.instant, easing: Easing.out(Easing.quad) }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!still) scale.set(withSpring(1, SNAP));
        onPressOut?.(e);
      }}
      style={[style, animated]}>
      {children}
    </AnimatedPressable>
  );
}

// ── useCountUp ───────────────────────────────────────────────────────────────
// First show: 0 → value over 700 ms (or `duration`; 0 disables). Later changes animate from the shown
// value over 400 ms only when the change is ≥ 5 % and the value is ≥ 10; anything smaller jumps.
// Reduce Motion: always jumps. Render stays pure: the shown value is derived from state only.
type CountFrame = { v: number; to: number };

function shouldAnimate(from: number, to: number, first: boolean, firstMs: number, reduced: boolean) {
  if (reduced || from === to || firstMs <= 0) return false; // duration 0 = never animate
  if (first) return true;
  return Math.abs(to) >= 10 && Math.abs(to - from) >= Math.abs(from) * 0.05;
}

/** Animated number for big figures (JS-driven, the only per-frame JS work in the kit). */
export function useCountUp(target: number, duration?: number) {
  const reduced = useReducedMotion();
  const firstMs = duration ?? motion.countUp;
  const safe = Number.isFinite(target) ? target : 0;
  const [frame, setFrame] = useState<CountFrame | null>(null);
  const shownRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const first = shownRef.current === null;
    const from = shownRef.current ?? 0;
    let raf = 0;
    if (!shouldAnimate(from, target, first, firstMs, reduced)) {
      shownRef.current = target;
      raf = requestAnimationFrame(() => setFrame({ v: target, to: target }));
      return () => cancelAnimationFrame(raf);
    }
    const ms = first ? firstMs : motion.countUpdate;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = p >= 1 ? target : from + (target - from) * eased;
      shownRef.current = v;
      setFrame({ v, to: target });
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, firstMs, reduced]);

  if (frame && frame.to === safe) return frame.v;
  // The target just changed and the effect hasn't produced a frame yet: hold the previous value if an
  // animation is about to start, otherwise show the new value straight away (no flash either way).
  const prev = frame ? frame.v : 0;
  return shouldAnimate(prev, safe, frame === null, firstMs, reduced) ? prev : safe;
}

// ── GrowIn ───────────────────────────────────────────────────────────────────
function growUp(delay: number) {
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ scaleY: 0.04 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: 200 })),
        transform: [{ scaleY: withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) })) }],
      },
    };
  };
}

/** Scales its children up from the bottom edge once — used for bar charts (600 ms, delay 120). */
export function GrowIn({ delay = 120, children, style }: { delay?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={growUp(delay)} style={[{ transformOrigin: 'bottom' }, style]}>
      {children}
    </Animated.View>
  );
}
