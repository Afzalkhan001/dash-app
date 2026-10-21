// Responsive layout values. Every size that depends on the window (screen gutter, card padding, gaps
// between cards) comes from here, so a 360 dp phone or large text gets the compact numbers and the
// layout changes shape instead of cramping. useWindowDimensions is a hook, so this is safe under the
// React Compiler (no reads of mutable globals during render).
//
// shouldStack() is the one "stack on a narrow phone or with large text" rule: every layout that
// changes shape with the window (kit compact, TwoUp, FieldPair, ActivityRow, the feature rows and
// heroes) asks it, with a named breakpoint from tokens (layout.breakpoint / layout.textScale).

import { useWindowDimensions } from 'react-native';

import { layout } from '@/theme/tokens';

/** Window widths where layouts change shape: compact 380, narrow 360, tight 340, tiny 300 (dp). */
export type Breakpoint = keyof typeof layout.breakpoint;
/** System text sizes where layouts change shape: large 115 %, huge 130 %. */
export type TextSize = keyof typeof layout.textScale;

export type StackRule = {
  /** Stack in a window narrower than this (a breakpoint or dp)… */
  below?: Breakpoint | number;
  /** …but there only above this text size (default: at any text size). */
  belowText?: TextSize;
  /** At any width, stack above this text size (default 'large'); false: never because of text alone. */
  text?: TextSize | false;
  /** Compare `below` with the width the text really gets (window width ÷ font scale, at least 1). */
  perText?: boolean;
};

/**
 * Whether a layout should change shape (stack, move a pill under the text, …) in this window.
 *   shouldStack(l, { below: 'narrow' })                                  < 360 dp or text > 115 %
 *   shouldStack(l, { below: 'compact' })                                 the kit's `compact`
 *   shouldStack(l, { text: 'huge' })                                     text > 130 %
 *   shouldStack(l, { below: 'tight', text: false })                      < 340 dp only
 *   shouldStack(l, { below: 'narrow', belowText: 'large', text: 'huge' }) ActivityRow: > 130 %, or > 115 % under 360 dp
 */
export function shouldStack({ width, fontScale }: { width: number; fontScale: number }, rule: StackRule = {}): boolean {
  const { below, belowText, text = 'large', perText } = rule;
  const limit = typeof below === 'number' ? below : below ? layout.breakpoint[below] : 0;
  const w = perText ? width / Math.max(1, fontScale) : width;
  if (w < limit) return belowText ? fontScale > layout.textScale[belowText] : true;
  return text !== false && fontScale > layout.textScale[text];
}

export type LayoutInfo = {
  width: number;
  height: number;
  fontScale: number;
  /** true below 380 dp wide or with text larger than 115 % (shouldStack below 'compact'). */
  compact: boolean;
  /** Screen side padding: 16 compact / 20 regular. */
  gutter: number;
  /** Card padding: 16 / 20. */
  cardPad: number;
  /** Dark hero card padding: 20 / 24. */
  heroPad: number;
  /** Gap between Screen children / stacked cards: 12 / 16. */
  gap: number;
};

/** Window-dependent layout numbers (docs/DESIGN.md §2.1). */
export function useLayout(): LayoutInfo {
  const { width, height, fontScale } = useWindowDimensions();
  const compact = shouldStack({ width, fontScale }, { below: 'compact' });
  return {
    width,
    height,
    fontScale,
    compact,
    gutter: compact ? layout.gutterCompact : layout.gutter,
    cardPad: compact ? layout.cardPadCompact : layout.cardPad,
    heroPad: compact ? layout.heroPadCompact : layout.heroPad,
    gap: compact ? layout.stackGapCompact : layout.stackGap,
  };
}

/** Effective hitSlop per side so a control of `size` dp gets a 48 dp touch target (min 4). */
export function hitSlopFor(size: number, min = 0) {
  return Math.max(min, Math.round((layout.hit - size) / 2));
}
