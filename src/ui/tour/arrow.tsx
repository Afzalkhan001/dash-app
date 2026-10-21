// The tour's curved arrow (docs/TOUR.md §3.2, §3.4): a short white hooked stroke with an open chevron
// head, drawn in a 40 × 40 box between the card and the spotlight. It draws in over 240 ms, nudges 6 dp
// towards the target twice and rests (it never loops). Mirrored when the target is left of the card's
// centre, flipped when the card is above the target. Reduce Motion / screen reader: drawn, still.
// Decorative: hidden from screen readers, no touches.

import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { palette } from '@/theme/tokens';
import { ARROW, ARROW_TIP_X, type TourArrowPlacement } from '@/ui/tour/placement';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const DECOR = { pointerEvents: 'none', accessible: false, importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// The stroke (box coordinates, pointing up and to the right): a tail near the card, a hook, the tip near
// the spotlight. All plain numbers, computed once.
type P = { x: number; y: number };
const TAIL: P = { x: 12, y: 37 };
const C1: P = { x: 8, y: 25 };
const C2: P = { x: 15, y: 15 };
const TIP: P = { x: ARROW_TIP_X, y: 5 };
const HEAD = 9; // chevron arm length
const HEAD_ANGLE = Math.PI / 6;

function cubic(t: number): P {
  const u = 1 - t;
  return {
    x: u * u * u * TAIL.x + 3 * u * u * t * C1.x + 3 * u * t * t * C2.x + t * t * t * TIP.x,
    y: u * u * u * TAIL.y + 3 * u * u * t * C1.y + 3 * u * t * t * C2.y + t * t * t * TIP.y,
  };
}

function strokeLength() {
  let len = 0;
  let prev = cubic(0);
  for (let i = 1; i <= 48; i += 1) {
    const p = cubic(i / 48);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return Math.ceil(len) + 1;
}

function headPath() {
  // Back along the end tangent, turned ±30°.
  const dx = TIP.x - C2.x;
  const dy = TIP.y - C2.y;
  const n = Math.hypot(dx, dy) || 1;
  const bx = -dx / n;
  const by = -dy / n;
  const arm = (a: number) => ({
    x: TIP.x + HEAD * (bx * Math.cos(a) - by * Math.sin(a)),
    y: TIP.y + HEAD * (bx * Math.sin(a) + by * Math.cos(a)),
  });
  const a = arm(HEAD_ANGLE);
  const b = arm(-HEAD_ANGLE);
  const f = (v: number) => v.toFixed(2);
  return `M${f(a.x)} ${f(a.y)}L${TIP.x} ${TIP.y}L${f(b.x)} ${f(b.y)}`;
}

const BODY_D = `M${TAIL.x} ${TAIL.y}C${C1.x} ${C1.y} ${C2.x} ${C2.y} ${TIP.x} ${TIP.y}`;
const BODY_L = strokeLength();
const HEAD_D = headPath();
const DRAW_MS = 240;
const NUDGE_MS = 300;
const NUDGE = 6;
const NEVER = ReduceMotion.Never;

/**
 * The arrow for one step. Mount it fresh for every step (key it by the step), so it draws in again.
 * `fade` is the card's opacity, so arrow and card come and go together.
 */
export function TourArrow({ place, fade, still }: { place: TourArrowPlacement; fade: SharedValue<number>; still: boolean }) {
  const draw = useSharedValue(still ? 1 : 0);
  const nudge = useSharedValue(0);

  useEffect(() => {
    if (still) {
      draw.set(1);
      nudge.set(0);
      return;
    }
    draw.set(0);
    draw.set(withDelay(80, withTiming(1, { duration: DRAW_MS, easing: Easing.out(Easing.cubic), reduceMotion: NEVER })));
    const leg = { duration: NUDGE_MS, easing: Easing.inOut(Easing.quad) };
    nudge.set(withDelay(80 + DRAW_MS + 60, withSequence(withTiming(1, leg), withTiming(0, leg), withTiming(1, leg), withTiming(0, leg))));
  }, [still, draw, nudge]);

  const dir = place.flipY ? 1 : -1; // towards the target
  const box = useAnimatedStyle(() => ({
    opacity: fade.get(),
    transform: [{ translateY: dir * NUDGE * nudge.get() }, { scaleX: place.mirror ? -1 : 1 }, { scaleY: place.flipY ? -1 : 1 }],
  }));
  const body = useAnimatedProps(() => ({ strokeDashoffset: BODY_L * (1 - draw.get()) }));
  const head = useAnimatedProps(() => ({ opacity: Math.min(Math.max((draw.get() - 0.75) / 0.25, 0), 1) }));
  const ink = palette.onPrimary;

  return (
    <Animated.View {...DECOR} style={[styles.box, { left: place.left, top: place.top }, box]}>
      <Svg width={ARROW} height={ARROW} viewBox={`0 0 ${ARROW} ${ARROW}`}>
        <AnimatedPath
          d={BODY_D}
          stroke={ink}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${BODY_L} ${BODY_L + 2}`}
          animatedProps={body}
        />
        <AnimatedPath d={HEAD_D} stroke={ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" animatedProps={head} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', width: ARROW, height: ARROW },
});
