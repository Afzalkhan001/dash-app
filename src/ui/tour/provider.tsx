// TourProvider and the overlay (docs/TOUR.md §2–4). Mount TourProvider once, around the app's Stack
// (src/app/_layout.tsx, inside ThemeProvider): it renders the app, then the tour overlay above it as a
// plain absolute layer — not a Modal — so the floating tab bar is dimmed too and tap-through targets do
// their real thing. The app lock and the toast host render later, so they stay on top.
//
//   const { start, stop, isActive } = useTour();
//   start('manager', steps, { intro, skipToast: 'You can see the tour again in More.', onEnd });
//
// While a tour shows: the app behind is hidden from screen readers, touches on the dimmed area do
// nothing, the card holds focus, and Skip / Android back / Esc / the escape gesture all end it.

import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { motion } from '@/theme/tokens';
import { haptic } from '@/ui/haptics';
import { TourArrow } from '@/ui/tour/arrow';
import { TourCoachCard, TourIntroCard } from '@/ui/tour/card';
import { cardWidth, holeFor, placeCard, type TourViewport } from '@/ui/tour/placement';
import { measureInWindow, onTourTargetChange } from '@/ui/tour/registry';
import { TourSpotlight } from '@/ui/tour/spotlight';
import {
  beginTour,
  nextTourStep,
  prevTourStep,
  remeasureTour,
  setTourOffset,
  setTourViewport,
  skipTour,
  startTour,
  stopTour,
  tapTourHole,
  tourNeighbours,
  tourProgress,
  useTourStore,
} from '@/ui/tour/store';

type ViewRef = ComponentRef<typeof View>;

const NEVER = ReduceMotion.Never;
const SPRING = motion.layout;
const FADE_IN = { duration: motion.fast, easing: Easing.out(Easing.quad), reduceMotion: NEVER };
const FADE_OUT = { duration: motion.instant, easing: Easing.in(Easing.quad), reduceMotion: NEVER };
const SHUT = { duration: motion.fast, easing: Easing.in(Easing.quad), reduceMotion: NEVER };
const PULSE_MS = 450;
const REMEASURE_MS = 700;
const FOCUS_DELAY_MS = 450;
const WEB = Platform.OS === 'web';

// ── Public API ───────────────────────────────────────────────────────────────
/** Start / stop tours from anywhere (also outside React, e.g. a deep-link handler). */
export const tour = {
  start: startTour,
  stop: stopTour,
  next: nextTourStep,
  back: prevTourStep,
  skip: skipTour,
  /** True while a tour is showing (not while it fades out). */
  isActive: () => {
    const s = useTourStore.getState();
    return s.run != null && s.phase !== 'closing';
  },
};

/** The tour controls, plus whether one is showing (re-renders when that changes). */
export function useTour() {
  const isActive = useTourStore((s) => s.run != null && s.phase !== 'closing');
  const tourId = useTourStore((s) => (s.run && s.phase !== 'closing' ? s.run.tourId : null));
  return { start: startTour, stop: stopTour, next: nextTourStep, back: prevTourStep, skip: skipTour, isActive, tourId };
}

/**
 * Mount once around the app (inside ThemeProvider and SafeAreaProvider). Renders `children`, then the
 * tour overlay. While a tour shows, `children` are hidden from screen readers.
 */
export function TourProvider({ children }: { children?: ReactNode }) {
  const hidden = useTourStore((s) => s.run != null && s.phase !== 'closing');
  return (
    <>
      <View
        style={base.app}
        aria-hidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={hidden}>
        {children}
      </View>
      <TourOverlay />
    </>
  );
}

/** The overlay alone (TourProvider already renders it). Nothing is rendered while no tour runs. */
export function TourOverlay() {
  const runId = useTourStore((s) => s.run?.id ?? 0);
  if (!runId) return null;
  return <TourRunView key={runId} />;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Whether VoiceOver / TalkBack is on (follows changes). Web can't tell, so it is ignored there. */
function useScreenReader() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (WEB) return;
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => {
        if (alive) setOn(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (v: boolean) => setOn(v));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

function focusOn(node: ViewRef | null) {
  if (!node || WEB) return;
  try {
    AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
  } catch {
    // focus stays where it was
  }
}

type WebKeyTarget = { addEventListener: (t: 'keydown', f: (e: { key: string }) => void) => void; removeEventListener: (t: 'keydown', f: (e: { key: string }) => void) => void };

// ── One running tour ─────────────────────────────────────────────────────────
function TourRunView() {
  const run = useTourStore((s) => s.run);
  const phase = useTourStore((s) => s.phase);
  const shown = useTourStore((s) => s.shown);
  const collapse = useTourStore((s) => s.collapse);
  const dropped = useTourStore((s) => s.dropped);
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const screenReader = useScreenReader();
  const still = reducedMotion || screenReader;

  const rootRef = useRef<ViewRef>(null);
  const titleRef = useRef<ViewRef>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [card, setCard] = useState<{ key: string; h: number } | null>(null);

  const W = size?.width ?? win.width;
  const H = size?.height ?? win.height;
  const vp: TourViewport = { width: W, height: H, top: insets.top, bottom: insets.bottom };

  const fade = useSharedValue(0);
  const cardFade = useSharedValue(0);
  const hx = useSharedValue(0);
  const hy = useSharedValue(0);
  const hw = useSharedValue(0);
  const hh = useSharedValue(0);
  const hr = useSharedValue(0);
  const pulse = useSharedValue(0);

  const closing = phase === 'closing';
  const showing = phase === 'showing';
  const step = run && shown ? run.steps[shown.index] : undefined;
  const hole = shown?.rect && shown.target ? holeFor(shown.rect, shown.target, vp) : null;
  const key = shown ? `s${shown.seq}` : 'none';
  const measuredHere = card?.key === key;
  const ready = showing && measuredHere && !!step;
  const place = placeCard(hole, card?.h ?? 200, vp);
  const progress = run && shown ? tourProgress(run, dropped, shown.index) : { position: 0, total: 0 };
  const near = run && shown ? tourNeighbours(run, dropped, shown.index) : { canBack: false, isLast: true };
  const introOn = !!run?.options.intro && !shown && (phase === 'intro' || phase === 'seeking');
  const o = run?.options;
  const labels = { next: o?.labels?.next ?? 'Next', back: o?.labels?.back ?? 'Back', done: o?.labels?.done ?? 'Done', skip: o?.labels?.skip ?? 'Skip' };
  const targetId = step?.target ?? null;
  const spoken = step ? `Step ${progress.position} of ${progress.total}. ${step.title}. ${step.body}` : '';

  // Tell the engine where the card must stay (it checks targets against this).
  useEffect(() => {
    setTourViewport({ width: W, height: H, top: insets.top, bottom: insets.bottom });
  }, [W, H, insets.top, insets.bottom]);

  // The whole layer: in over 240 ms, out over 200 ms (a fade even with Reduce Motion).
  useEffect(() => {
    fade.set(withTiming(closing ? 0 : 1, { duration: closing ? 200 : 240, easing: Easing.out(Easing.quad), reduceMotion: NEVER }));
  }, [closing, fade]);

  // The spotlight: glide to the target (spring), close before a screen change, jump with Reduce Motion.
  const hasHole = !!hole;
  const tx = hole?.x ?? 0;
  const ty = hole?.y ?? 0;
  const tw = hole?.width ?? 0;
  const th = hole?.height ?? 0;
  const tr = hole?.r ?? 0;
  useEffect(() => {
    const shut = () => {
      const cx = hx.get() + hw.get() / 2;
      const cy = hy.get() + hh.get() / 2;
      if (still) {
        hx.set(cx);
        hy.set(cy);
        hw.set(0);
        hh.set(0);
        hr.set(0);
        return;
      }
      hx.set(withTiming(cx, SHUT));
      hy.set(withTiming(cy, SHUT));
      hw.set(withTiming(0, SHUT));
      hh.set(withTiming(0, SHUT));
      hr.set(withTiming(0, SHUT));
    };
    if (phase === 'seeking') {
      if (collapse) shut();
      return;
    }
    if (phase !== 'showing') return;
    if (!hasHole) {
      shut();
      return;
    }
    if (still) {
      hx.set(tx);
      hy.set(ty);
      hw.set(tw);
      hh.set(th);
      hr.set(tr);
      return;
    }
    if (hw.get() < 1 || hh.get() < 1) {
      // Opening from nothing: grow out of the target's centre.
      hx.set(tx + tw / 2);
      hy.set(ty + th / 2);
      hw.set(0);
      hh.set(0);
      hr.set(Math.min(tr, 12));
    }
    hx.set(withSpring(tx, SPRING));
    hy.set(withSpring(ty, SPRING));
    hw.set(withSpring(tw, SPRING));
    hh.set(withSpring(th, SPRING));
    hr.set(withSpring(tr, SPRING));
  }, [phase, collapse, hasHole, tx, ty, tw, th, tr, still, hx, hy, hw, hh, hr]);

  // The card: fades out while the next step is looked for, in once it has been measured and placed.
  useEffect(() => {
    if (phase === 'intro') cardFade.set(withTiming(1, { ...FADE_IN, duration: motion.base }));
    else if (phase === 'seeking') cardFade.set(withTiming(0, FADE_OUT));
    else if (ready) cardFade.set(withTiming(1, FADE_IN));
  }, [phase, ready, cardFade]);

  // One pulse per step, after the spotlight lands.
  useEffect(() => {
    if (!ready || !hasHole || still) return;
    pulse.set(0);
    pulse.set(withDelay(260, withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.quad) })));
  }, [ready, hasHole, still, pulse, key]);

  // Screen readers: read the step, then move focus to its title.
  useEffect(() => {
    if (!ready || !spoken) return;
    AccessibilityInfo.announceForAccessibility(spoken);
    const t = setTimeout(() => focusOn(titleRef.current), FOCUS_DELAY_MS);
    return () => clearTimeout(t);
  }, [ready, spoken, key]);

  const introTitle = introOn ? (run?.options.intro?.title ?? '') : '';
  const introBody = introOn ? (run?.options.intro?.body ?? '') : '';
  useEffect(() => {
    if (phase !== 'intro' || !introTitle) return;
    AccessibilityInfo.announceForAccessibility(`${introTitle}. ${introBody}`);
    const t = setTimeout(() => focusOn(titleRef.current), FOCUS_DELAY_MS);
    return () => clearTimeout(t);
  }, [phase, introTitle, introBody]);

  // Android back, Esc on web: Skip. Back never navigates the app while the tour is open.
  useEffect(() => {
    if (closing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      skipTour();
      return true;
    });
    const doc = WEB ? (globalThis as { document?: WebKeyTarget }).document : undefined;
    const onKey = (e: { key: string }) => {
      if (e.key === 'Escape') skipTour();
    };
    doc?.addEventListener('keydown', onKey);
    return () => {
      sub.remove();
      doc?.removeEventListener('keydown', onKey);
    };
  }, [closing]);

  // Keep the spotlight on its target: on the target's own layout, on a window change, and every 700 ms.
  useEffect(() => {
    if (!showing || !targetId) return;
    void remeasureTour();
    const timer = setInterval(() => void remeasureTour(), REMEASURE_MS);
    const off = onTourTargetChange((id) => {
      if (id === targetId) void remeasureTour();
    });
    return () => {
      clearInterval(timer);
      off();
    };
  }, [showing, targetId, W, H]);

  const layerStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardFade.get(),
    transform: [{ translateY: still ? 0 : (1 - cardFade.get()) * 8 }],
  }));

  const onRootLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    void measureInWindow(rootRef.current).then((r) => {
      if (r) setTourOffset(r.x, r.y);
    });
  };

  const onCardLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setCard((prev) => (prev && prev.key === key && Math.abs(prev.h - h) < 1 ? prev : { key, h }));
  };

  if (!run) return null;

  return (
    <Animated.View
      pointerEvents={closing ? 'none' : 'auto'}
      accessibilityViewIsModal
      aria-modal
      role="dialog"
      onAccessibilityEscape={skipTour}
      style={[StyleSheet.absoluteFill, layerStyle]}>
      {/* Swallows touches on the dimmed area (they do nothing); also measures the overlay's size and offset. */}
      <View
        ref={rootRef}
        onLayout={onRootLayout}
        collapsable={false}
        style={StyleSheet.absoluteFill}
        accessible={false}
        importantForAccessibility="no"
        onStartShouldSetResponder={() => true}
      />
      <TourSpotlight hole={{ x: hx, y: hy, w: hw, h: hh, r: hr }} pulse={pulse} width={W} height={H} />

      {showing && hole ? (
        // Inside the spotlight: Next, or the target's own action (tap-through), which also ends the tour.
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={onHolePress}
          style={[base.abs, { left: hole.x, top: hole.y, width: hole.width, height: hole.height, borderRadius: hole.r }]}
        />
      ) : null}

      {ready && place.arrow ? <TourArrow key={`arrow-${key}`} place={place.arrow} fade={cardFade} still={still} /> : null}

      {introOn ? (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, base.center, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
          <Animated.View style={[{ width: cardWidth(vp) }, cardStyle]}>
            <TourIntroCard
              title={run.options.intro?.title ?? ''}
              body={run.options.intro?.body ?? ''}
              startLabel={run.options.intro?.startLabel ?? 'Show me around'}
              skipLabel={run.options.intro?.skipLabel ?? labels.skip}
              maxHeight={Math.max(H - insets.top - insets.bottom - 32, 200)}
              titleRef={titleRef}
              onStart={() => {
                haptic.select();
                beginTour();
              }}
              onSkip={() => {
                haptic.select();
                skipTour();
              }}
            />
          </Animated.View>
        </View>
      ) : null}

      {step && shown ? (
        <Animated.View
          key={`card-${key}`}
          onLayout={onCardLayout}
          style={[base.abs, { left: place.left, width: place.width }, place.top != null ? { top: place.top } : { bottom: place.bottom }, cardStyle]}>
          <TourCoachCard
            title={step.title}
            body={step.body}
            position={progress.position}
            total={progress.total}
            canBack={near.canBack}
            isLast={near.isLast}
            labels={labels}
            maxHeight={place.maxHeight}
            titleRef={titleRef}
            onNext={() => {
              haptic.select();
              nextTourStep();
            }}
            onBack={() => {
              haptic.select();
              prevTourStep();
            }}
            onSkip={() => {
              haptic.select();
              skipTour();
            }}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** A tap inside the spotlight: Next (with a selection haptic) or the target's own action. */
function onHolePress() {
  if (tapTourHole() === 'next') haptic.select();
}

const base = StyleSheet.create({
  app: { flex: 1 },
  abs: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
