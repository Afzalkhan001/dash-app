// Where the spotlight and the coach card go (docs/TOUR.md §3.2–3.3). Pure functions of the target's
// rect, the card's measured height and the overlay's size, so render stays pure.

import { radius } from '@/theme/tokens';
import type { TourRect, TourShape } from '@/ui/tour/types';

/** The overlay's size and the safe-area insets the card must stay inside. */
export type TourViewport = { width: number; height: number; top: number; bottom: number };

/** The spotlight: the target plus padding, at least 48 × 48, with its corner radius. */
export type TourHole = { x: number; y: number; width: number; height: number; r: number };

/** The arrow's box (ARROW × ARROW) and which way it is drawn. */
export type TourArrowPlacement = { left: number; top: number; flipY: boolean; mirror: boolean };

export type TourCardPlacement = {
  /** below / above the hole, centred (no target), or docked to the bottom (no room either side). */
  mode: 'below' | 'above' | 'center' | 'dock';
  left: number;
  width: number;
  /** Exactly one of top / bottom is set (bottom is measured from the overlay's bottom edge). */
  top?: number;
  bottom?: number;
  /** The card never grows past this; its text scrolls inside. */
  maxHeight: number;
  arrow: TourArrowPlacement | null;
};

export const ARROW = 40; // the arrow's square box
export const ARROW_GAP = 6; // ring → arrow and arrow → card
const ZONE = ARROW + ARROW_GAP * 2;
const GUTTER = 16;
const CARD_MAX = 360;
const MIN_CARD = 160; // below this the card docks instead of squeezing beside the target
const TALL_HOLE = 0.4; // a hole this share of the safe area or taller docks the card rather than squeezing it
const MIN_HOLE = 48;
const EDGE = 4; // the ring stays this far inside the screen edges
/** Where the arrow's tip sits inside its box (un-mirrored); see arrow.tsx. */
export const ARROW_TIP_X = 26;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** The spotlight around a target rect (overlay coordinates). */
export function holeFor(rect: TourRect, opts: { shape?: TourShape; radius?: number; padding?: number }, vp: TourViewport): TourHole {
  const pad = opts.padding ?? 6;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  if (opts.shape === 'circle') {
    const d = Math.max(rect.width, rect.height, MIN_HOLE - pad * 2) + pad * 2;
    return { x: cx - d / 2, y: cy - d / 2, width: d, height: d, r: d / 2 };
  }
  const w = Math.max(rect.width + pad * 2, MIN_HOLE);
  const h = Math.max(rect.height + pad * 2, MIN_HOLE);
  // Full-bleed targets: keep the ring on screen.
  const x0 = Math.max(cx - w / 2, EDGE);
  const x1 = Math.min(cx + w / 2, vp.width - EDGE);
  const y0 = Math.max(cy - h / 2, EDGE);
  const y1 = Math.min(cy + h / 2, vp.height - EDGE);
  const width = Math.max(x1 - x0, 0);
  const height = Math.max(y1 - y0, 0);
  const r = Math.min((opts.radius ?? radius.md) + pad, width / 2, height / 2);
  return { x: x0, y: y0, width, height, r: Math.max(r, 0) };
}

/** Card width: min(window − 32, 360). */
export function cardWidth(vp: TourViewport) {
  return Math.max(Math.min(vp.width - GUTTER * 2, CARD_MAX), 0);
}

/**
 * Below the hole when it fits, else above, else (a tall target) docked to the bottom of the safe area
 * with no arrow, else on the roomier side with the text scrolling (at least 160 high), else docked. Horizontally centred on the hole
 * and kept 16 dp inside the screen edges; the arrow sits between hole and card, its tip over the hole.
 */
export function placeCard(hole: TourHole | null, cardH: number, vp: TourViewport): TourCardPlacement {
  const width = cardWidth(vp);
  const rTop = vp.top + 8;
  const rBottom = vp.height - vp.bottom - 8;
  const rH = Math.max(rBottom - rTop, 0);
  const centred = (vp.width - width) / 2;
  if (!hole || hole.width < 1 || hole.height < 1) {
    return { mode: 'center', left: centred, width, top: rTop + Math.max((rH - cardH) / 2, 0), maxHeight: rH, arrow: null };
  }
  const cx = hole.x + hole.width / 2;
  const left = clamp(cx - width / 2, GUTTER, vp.width - GUTTER - width);
  const below = rBottom - (hole.y + hole.height) - ZONE;
  const above = hole.y - rTop - ZONE;

  let mode: 'below' | 'above' | 'dock';
  if (below >= cardH) mode = 'below';
  else if (above >= cardH) mode = 'above';
  // A target filling much of the screen (a whole list on a small phone): the card docks at the bottom at
  // its full height rather than squeezing its text beside the target.
  else if (hole.height >= rH * TALL_HOLE) mode = 'dock';
  else if (Math.max(below, above) >= MIN_CARD) mode = below >= above ? 'below' : 'above';
  else mode = 'dock';

  if (mode === 'dock') {
    return { mode, left: centred, width, bottom: vp.height - rBottom, maxHeight: Math.max(Math.round(rH * 0.55), MIN_CARD), arrow: null };
  }

  const tipX = clamp(cx, left + 28, left + width - 28);
  const mirror = cx < left + width / 2;
  const arrowLeft = tipX - (mirror ? ARROW - ARROW_TIP_X : ARROW_TIP_X);
  if (mode === 'below') {
    return {
      mode,
      left,
      width,
      top: hole.y + hole.height + ZONE,
      maxHeight: below,
      arrow: { left: arrowLeft, top: hole.y + hole.height + ARROW_GAP, flipY: false, mirror },
    };
  }
  return {
    mode,
    left,
    width,
    bottom: vp.height - (hole.y - ZONE),
    maxHeight: above,
    arrow: { left: arrowLeft, top: hole.y - ARROW_GAP - ARROW, flipY: true, mirror },
  };
}

/** True when two rects differ by less than a pixel everywhere. */
export function sameRect(a: TourRect | null | undefined, b: TourRect | null | undefined, eps = 1) {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.width - b.width) < eps && Math.abs(a.height - b.height) < eps;
}

/**
 * How much of `rect` is inside the safe area: `full` when all of it, `enough` when at least `share` of
 * it (or 48 dp of a target taller than the safe area, with `share` of its width).
 */
export function visibility(rect: TourRect, vp: TourViewport, share: number) {
  const top = vp.top;
  const bottom = vp.height - vp.bottom;
  const ix = Math.max(0, Math.min(rect.x + rect.width, vp.width) - Math.max(rect.x, 0));
  const iy = Math.max(0, Math.min(rect.y + rect.height, bottom) - Math.max(rect.y, top));
  const full = ix >= rect.width - 1 && iy >= rect.height - 1;
  const tall = rect.height > bottom - top;
  const enough = full || (tall ? iy >= 48 && ix >= rect.width * share : ix * iy >= rect.width * rect.height * share);
  return { full, enough };
}
