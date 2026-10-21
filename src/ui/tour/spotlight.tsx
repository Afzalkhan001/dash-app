// The dimmed screen with a hole in it (docs/TOUR.md §3.2): one SVG path, the window rect plus a rounded
// rect, filled with fillRule="evenodd" so the hole is a true cut-out on iOS, Android and web. The hole's
// x / y / width / height / radius are shared values, so it glides between steps on the UI thread. A 2 dp
// white ring sits just outside the hole, and a soft second ring pulses out once per step.
// Decorative: hidden from screen readers and never touchable (the overlay handles touches).

import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { themedStyles } from '@/theme/themed';
import { palette } from '@/theme/tokens';
import { isDarkScheme, withAlpha } from '@/ui/surface';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const DECOR = { pointerEvents: 'none', accessible: false, importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;
const RING = 2;
const PULSE_GROW = 14;

/** The hole's geometry, animated. */
export type TourHoleValues = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  w: SharedValue<number>;
  h: SharedValue<number>;
  r: SharedValue<number>;
};

/** The scrim colour (light / dark), read at render time. Darker than a sheet's backdrop so the hole pops. */
export function tourScrimColor() {
  return isDarkScheme() ? 'rgba(6,4,3,0.76)' : 'rgba(28,18,12,0.66)';
}

function scrimPath(W: number, H: number, x: number, y: number, w: number, h: number, rr: number) {
  'worklet';
  const outer = `M-1 -1H${W + 1}V${H + 1}H-1Z`;
  if (w < 0.5 || h < 0.5) return outer;
  const r = Math.max(0, Math.min(rr, w / 2, h / 2));
  const x1 = x + w;
  const y1 = y + h;
  return (
    `${outer}M${x + r} ${y}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y + r}V${y1 - r}` +
    `A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x + r}A${r} ${r} 0 0 1 ${x} ${y1 - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

export function TourSpotlight({ hole, pulse, width, height }: { hole: TourHoleValues; pulse: SharedValue<number>; width: number; height: number }) {
  const { x, y, w, h, r } = hole;
  const path = useAnimatedProps(() => ({ d: scrimPath(width, height, x.get(), y.get(), w.get(), h.get(), r.get()) }));
  const ring = useAnimatedStyle(() => {
    const open = w.get() > 1 && h.get() > 1;
    return {
      opacity: open ? 1 : 0,
      left: x.get() - RING,
      top: y.get() - RING,
      width: Math.max(w.get(), 0) + RING * 2,
      height: Math.max(h.get(), 0) + RING * 2,
      borderRadius: Math.max(Math.min(r.get(), w.get() / 2, h.get() / 2), 0) + RING,
    };
  });
  const wave = useAnimatedStyle(() => {
    const p = pulse.get();
    const grow = PULSE_GROW * p;
    const open = w.get() > 1 && h.get() > 1 && p > 0 && p < 1;
    return {
      opacity: open ? 0.5 * (1 - p) : 0,
      left: x.get() - RING - grow,
      top: y.get() - RING - grow,
      width: Math.max(w.get(), 0) + (RING + grow) * 2,
      height: Math.max(h.get(), 0) + (RING + grow) * 2,
      borderRadius: Math.max(Math.min(r.get(), w.get() / 2, h.get() / 2), 0) + RING + grow,
    };
  });
  return (
    <View {...DECOR} style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <AnimatedPath animatedProps={path} fill={tourScrimColor()} fillRule="evenodd" />
      </Svg>
      <Animated.View style={[styles.ring, wave]} />
      <Animated.View style={[styles.ring, ring]} />
    </View>
  );
}

const styles = themedStyles(() => ({
  ring: { position: 'absolute', borderWidth: RING, borderColor: withAlpha(palette.onPrimary, 0.9) },
}));
