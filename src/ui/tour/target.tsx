// Tour targets and scroll areas (docs/TOUR.md §6).
//
//   <TourTarget id="home.clockButton" activate={clockIn}>…</TourTarget>   a View wrapper (collapsable={false})
//   const { ref, onLayout } = useTourTarget('tabs.inbox', { activate: onPress });   for components that
//   <Pressable ref={ref} onLayout={onLayout} …>                                     can't be wrapped
// (destructure the result: the React Compiler lint rejects `t.ref` in JSX).
//
// A target registers from an effect (cost: one ref and one registry entry) and is measured only while a
// tour is looking at it. Inside a scrolling list, give the ScrollView a handle so the tour can bring a
// target into view before spotlighting it:
//
//   const ref = useRef<TourScrollRef>(null);
//   const handle = useTourScrollHandle(ref, { insetEnd: TAB_BAR_SPACE });
//   <TourScrollProvider handle={handle}><ScrollView ref={ref}>…</ScrollView></TourScrollProvider>
//
// Providers nest: a horizontal chip row inside a vertical screen scrolls the row first, then the screen.

import { type ComponentRef, createContext, type ReactNode, type RefObject, useContext, useEffect, useMemo, useRef } from 'react';
import { Dimensions, type LayoutChangeEvent, type ScrollView, View, type ViewProps } from 'react-native';

import { measureInWindow, measureLayout, notifyTourTarget, registerTourTarget, type TourViewRef, wait } from '@/ui/tour/registry';
import type { TourTargetOptions } from '@/ui/tour/types';

// ── Scroll areas ─────────────────────────────────────────────────────────────
export type TourScrollHandle = {
  /** Scroll so `node` is in view (no-op when it already is). Resolves once the scroll has had time to land. */
  reveal: (node: TourViewRef | null) => Promise<void>;
};

/** A ScrollView ref (or anything with scrollTo + getInnerViewRef + measureInWindow, e.g. a DOM node on web). */
export type TourScrollRef = ComponentRef<typeof ScrollView>;

type ScrollLike = {
  scrollTo: (options: { x?: number; y?: number; animated?: boolean }) => void;
  getInnerViewRef?: () => unknown;
  measureInWindow?: TourViewRef['measureInWindow'];
};

export type TourScrollOptions = {
  /** A horizontal ScrollView (a chip row). Default false. */
  horizontal?: boolean;
  /** Space kept clear at the top / left of the visible area (a sticky header). Default 8. */
  insetStart?: number;
  /** Space kept clear at the bottom / right (the floating tab bar: TAB_BAR_SPACE + inset). Default 8. */
  insetEnd?: number;
  /** Where the target's centre lands in the visible area, 0–1. Default 0.42 vertical, 0.5 horizontal. */
  anchor?: number;
};

const SCROLL_LAND_MS = 320;

export const TourScrollContext = createContext<TourScrollHandle | null>(null);

async function revealIn(sv: ScrollLike | null, node: TourViewRef | null, horizontal: boolean, insetStart: number, insetEnd: number, anchor: number) {
  if (!sv || !node || typeof sv.scrollTo !== 'function') return;
  const inner = typeof sv.getInnerViewRef === 'function' ? sv.getInnerViewRef() : null;
  const [frame, inContent, content, onWindow] = await Promise.all([
    measureInWindow(sv as Pick<TourViewRef, 'measureInWindow'>),
    measureLayout(node, inner),
    measureInWindow(inner as Pick<TourViewRef, 'measureInWindow'> | null),
    measureInWindow(node),
  ]);
  if (!frame || !inContent) return;
  const win = Dimensions.get('window');
  const frameStart = horizontal ? frame.x : frame.y;
  const frameSize = horizontal ? frame.width : frame.height;
  const winSize = horizontal ? win.width : win.height;
  // The part of the scroll view that is on screen, in the scroll view's own coordinates.
  const visStart = Math.max(0, -frameStart) + insetStart;
  const visEnd = Math.min(frameSize, winSize - frameStart) - insetEnd;
  const span = visEnd - visStart;
  if (span <= 0) return;
  const pos = horizontal ? inContent.x : inContent.y;
  const size = horizontal ? inContent.width : inContent.height;
  if (onWindow) {
    const start = (horizontal ? onWindow.x : onWindow.y) - frameStart;
    if (start >= visStart && start + size <= visEnd) return; // already fully in view
  }
  // At the anchor, but never with its top or bottom past the visible area (a tall target at 0.3 would
  // otherwise slide under the header); taller than the area: its top just inside.
  const wanted =
    size <= span ? Math.min(Math.max(pos + size / 2 - (visStart + span * anchor), pos + size - visEnd), pos - visStart) : pos - visStart - 8;
  const max = content ? (horizontal ? content.width : content.height) - frameSize : Number.POSITIVE_INFINITY;
  const offset = Math.round(Math.max(0, Math.min(wanted, Math.max(0, max))));
  try {
    sv.scrollTo(horizontal ? { x: offset, animated: true } : { y: offset, animated: true });
  } catch {
    return;
  }
  await wait(SCROLL_LAND_MS);
}

/**
 * A handle for one ScrollView, for TourScrollProvider. Pass the ScrollView's ref; the handle reads it
 * only when a tour asks for a target to be revealed.
 */
export function useTourScrollHandle(scrollRef: RefObject<ScrollLike | TourScrollRef | null>, options: TourScrollOptions = {}): TourScrollHandle {
  const { horizontal = false, insetStart = 8, insetEnd = 8 } = options;
  const anchor = options.anchor ?? (horizontal ? 0.5 : 0.42);
  return useMemo(
    () => ({
      reveal: (node: TourViewRef | null) => revealIn(scrollRef.current as ScrollLike | null, node, horizontal, insetStart, insetEnd, anchor),
    }),
    [scrollRef, horizontal, insetStart, insetEnd, anchor],
  );
}

/** Makes `handle` the scroll area for every TourTarget inside. Nested providers reveal inner first. */
export function TourScrollProvider({ handle, children }: { handle: TourScrollHandle | null; children?: ReactNode }) {
  const parent = useContext(TourScrollContext);
  const value = useMemo<TourScrollHandle | null>(() => {
    if (!handle) return parent;
    if (!parent) return handle;
    return {
      reveal: async (node) => {
        await handle.reveal(node);
        await parent.reveal(node);
      },
    };
  }, [handle, parent]);
  return <TourScrollContext value={value}>{children}</TourScrollContext>;
}

// ── Targets ──────────────────────────────────────────────────────────────────
/**
 * Registers the element behind `ref` as tour target `id` (null / undefined: not a target). Spread the
 * returned `ref` and `onLayout` onto a host view (View, Pressable…); give a View `collapsable={false}`
 * so Android keeps it. `activate` makes it tap-through (see TourTargetOptions).
 */
export function useTourTarget(id: string | null | undefined, options: TourTargetOptions = {}) {
  const ref = useRef<TourViewRef>(null);
  const scroll = useContext(TourScrollContext);
  const { shape, radius, padding, activate } = options;
  const activateRef = useRef(activate);
  useEffect(() => {
    activateRef.current = activate;
  });
  const tapThrough = typeof activate === 'function';

  useEffect(() => {
    if (!id) return;
    return registerTourTarget(id, {
      measure: () => measureInWindow(ref.current),
      scrollIntoView: scroll ? () => scroll.reveal(ref.current) : undefined,
      shape,
      radius,
      padding,
      activate: tapThrough ? () => activateRef.current?.() : undefined,
    });
  }, [id, scroll, shape, radius, padding, tapThrough]);

  const onLayout = (_e?: LayoutChangeEvent) => {
    if (id) notifyTourTarget(id);
  };
  return { ref, onLayout };
}

export type TourTargetProps = Omit<ViewProps, 'id'> &
  TourTargetOptions & {
    /** The target id the tour steps point at ('tabs.inbox'). */
    id: string | null | undefined;
    children?: ReactNode;
  };

/** Wraps one control so a tour step can spotlight it. Lays out like a plain View (pass `style`). */
export function TourTarget({ id, shape, radius, padding, activate, onLayout, children, ...rest }: TourTargetProps) {
  const { ref, onLayout: onTargetLayout } = useTourTarget(id, { shape, radius, padding, activate });
  return (
    <View
      ref={ref}
      collapsable={false}
      {...rest}
      onLayout={(e) => {
        onTargetLayout(e);
        onLayout?.(e);
      }}>
      {children}
    </View>
  );
}
