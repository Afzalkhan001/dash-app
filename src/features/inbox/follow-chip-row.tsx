// A horizontally scrolling chip row (same look as the kit's ChipRow: bleeds into the screen gutter,
// 8 dp gaps) that keeps its selected chip on screen. On first layout it jumps (no animation) and when
// the selection changes (a chip tap) it glides — in both cases only as far as needed to show the
// selected chip with its neighbour peeking past the gutter, so as many of the leading chips as
// possible stay in view. A chip already fully visible never moves the row. Once the person drags the
// row themselves, late layout changes (counts arriving) leave it alone until the selection changes.
//
// The row is 48 dp tall: chips are 34 dp with a 7 dp vertical hitSlop, and a ScrollView only
// delivers touches inside its own frame — at 34 dp tall the slop would be cut off and the chips
// would be 34 dp targets. The 7 dp padding above and below gives the slop room.

import { type ReactNode, useEffect, useRef } from 'react';
import { type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { space } from '@/theme/tokens';
import { hitSlopFor, useLayout } from '@/ui';

export type FollowChip = { key: string; chip: ReactNode };

/** The kit Chip's visual height; the row pads it to a 48 dp touch band. */
const CHIP_HEIGHT = 34;
/** Vertical room for the chip's hitSlop (7 dp above and below). */
export const CHIP_ROW_PAD = hitSlopFor(CHIP_HEIGHT);
/** How much of the next chip shows past the gutter after a follow scroll. */
const PEEK = 28;

export function FollowChipRow({ items, selected }: { items: FollowChip[]; selected: string | undefined }) {
  const { gutter } = useLayout();
  const reduceMotion = useReducedMotion();
  const list = Array.isArray(items) ? items : [];

  const scroller = useRef<ScrollView>(null);
  const frames = useRef(new Map<string, { x: number; width: number }>());
  const viewport = useRef(0);
  const content = useRef(0);
  const offset = useRef(0);
  const placed = useRef(false);
  const dragged = useRef(false);

  // Scrolls only when the selected chip is not fully inside the gutters, and then just far enough to
  // show it with the neighbour on that side peeking (clamped to the content).
  const follow = (key: string | undefined) => {
    if (!key || dragged.current) return;
    const frame = frames.current.get(key);
    const view = viewport.current;
    if (!frame || view <= 0) return;
    const left = offset.current + gutter;
    const right = offset.current + view - gutter;
    const start = frame.x;
    const end = frame.x + frame.width;
    if (start >= left - 1 && end <= right + 1) {
      placed.current = true;
      return;
    }
    const margin = gutter + space.xs + PEEK;
    const wanted = end > right ? end + margin - view : start - margin;
    const max = Math.max(0, content.current - view);
    const to = Math.min(max, Math.max(0, wanted));
    scroller.current?.scrollTo({ x: to, animated: placed.current && !reduceMotion });
    offset.current = to;
    placed.current = true;
  };

  // A new selection always wins over an earlier manual drag.
  useEffect(() => {
    dragged.current = false;
    follow(selected);
    // `follow` reads refs only; re-run on a new selection, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={32}
      onLayout={(e: LayoutChangeEvent) => {
        viewport.current = e.nativeEvent.layout.width;
        follow(selected);
      }}
      onContentSizeChange={(w: number) => {
        content.current = w;
        follow(selected);
      }}
      onScrollBeginDrag={() => {
        dragged.current = true;
      }}
      onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
        offset.current = e.nativeEvent.contentOffset.x;
      }}
      style={{ marginHorizontal: -gutter, flexGrow: 0 }}
      contentContainerStyle={{ gap: space.xs, paddingHorizontal: gutter, paddingVertical: CHIP_ROW_PAD, alignItems: 'center' }}>
      {list.map((item) => (
        <View
          key={item.key}
          onLayout={(e: LayoutChangeEvent) => {
            const { x, width } = e.nativeEvent.layout;
            frames.current.set(item.key, { x, width });
            if (item.key === selected) follow(selected);
          }}>
          {item.chip}
        </View>
      ))}
    </ScrollView>
  );
}
