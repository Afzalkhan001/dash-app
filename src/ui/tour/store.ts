// The tour engine's state machine (docs/TOUR.md §2). It lives in a zustand store, outside React, so the
// async step loop (onEnter → wait for the target → scroll → measure → show) never sets React state
// from an effect, and a light / dark remount of the overlay picks up exactly where it was.
//
//   idle ──start──▶ intro ──begin──▶ seeking ──found──▶ showing ──next/back──▶ seeking …
//                     │                 │ (not found in time: drop the step, move on)
//                     └──── skip / done / tap-through / stop ──▶ closing (200 ms fade) ──▶ idle

import { create } from 'zustand';

import { toast } from '@/ui/toast';
import { sameRect, type TourViewport, visibility } from '@/ui/tour/placement';
import { getTourTarget, type TourTargetEntry, wait } from '@/ui/tour/registry';
import type { TourEndReason, TourRect, TourResult, TourShape, TourStartOptions, TourStep } from '@/ui/tour/types';

export type TourPhase = 'idle' | 'intro' | 'seeking' | 'showing' | 'closing';

export type TourRun = { id: number; tourId: string; steps: TourStep[]; options: TourStartOptions };

/** What the target told the engine when it was found (step overrides already applied). */
export type TourShownTarget = { shape?: TourShape; radius?: number; padding?: number; tapThrough: boolean };

/** The step on screen (kept while the next one is being looked for, so its card can fade out). */
export type TourShown = { index: number; rect: TourRect | null; target: TourShownTarget | null; seq: number };

type TourState = {
  run: TourRun | null;
  phase: TourPhase;
  /** The step being shown or looked for (index into run.steps). */
  index: number;
  /** Steps dropped at run time (target missing, or not on screen). */
  dropped: number[];
  shown: TourShown | null;
  /** While seeking: close the spotlight first (a screen change is coming, or the next step has no target). */
  collapse: boolean;
  viewport: TourViewport | null;
  /** The overlay's own position in the window (normally 0, 0); subtracted from measured targets. */
  offset: { x: number; y: number };
};

const IDLE = { run: null, phase: 'idle' as const, index: 0, dropped: [], shown: null, collapse: false };

export const useTourStore = create<TourState>()(() => ({ ...IDLE, viewport: null, offset: { x: 0, y: 0 } }));

const get = () => useTourStore.getState();
const set = (patch: Partial<TourState>) => useTourStore.setState(patch);

const EXIT_MS = 200; // the overlay's fade-out
const HIDE_MS = 110; // let the old card fade before the screen changes
const TIMEOUT_MS = 600; // wait this long for a step's target
const POLL_MS = 50;
const SETTLE_MS = 60;
const SETTLE_TRIES = 8;
const SCROLL_GRACE_MS = 450;
const SCROLL_TRIES = 2;
const MISSING_MS = 1200; // a shown target gone this long: look for it again (or move on)

let runSeq = 0;
let seekSeq = 0;
let showSeq = 0;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let missingSince: { seq: number; at: number } | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
function liveIndices(run: TourRun, dropped: number[]) {
  const out: number[] = [];
  for (let i = 0; i < run.steps.length; i += 1) if (!dropped.includes(i)) out.push(i);
  return out;
}

/** The next index from `from` in `dir` that isn't dropped, or null. */
function nextLive(run: TourRun, dropped: number[], from: number, dir: 1 | -1) {
  for (let i = from + dir; i >= 0 && i < run.steps.length; i += dir) if (!dropped.includes(i)) return i;
  return null;
}

/** 1-based position of `index` among the live steps, and how many are live. */
export function tourProgress(run: TourRun, dropped: number[], index: number) {
  const live = liveIndices(run, dropped);
  return { position: live.filter((i) => i <= index).length, total: live.length };
}

/** Whether `index` has a live step before it (Back) and after it (otherwise Next reads Done). */
export function tourNeighbours(run: TourRun, dropped: number[], index: number) {
  return { canBack: nextLive(run, dropped, index, -1) != null, isLast: nextLive(run, dropped, index, 1) == null };
}

const stepKey = (run: TourRun, index: number) => run.steps[index]?.key ?? String(index);

function viewport(): TourViewport {
  const vp = get().viewport;
  if (vp) return vp;
  return { width: 10000, height: 10000, top: 0, bottom: 0 };
}

function toOverlay(r: TourRect): TourRect {
  const { offset } = get();
  return { x: r.x - offset.x, y: r.y - offset.y, width: r.width, height: r.height };
}

function targetInfo(step: TourStep, entry: TourTargetEntry): TourShownTarget {
  return {
    shape: step.shape ?? entry.shape,
    radius: step.radius ?? entry.radius,
    padding: step.padding ?? entry.padding,
    tapThrough: typeof entry.activate === 'function',
  };
}

async function measured(entry: TourTargetEntry): Promise<TourRect | null> {
  const raw = await entry.measure();
  return raw && raw.width > 0 && raw.height > 0 ? toOverlay(raw) : null;
}

/** Measure until two readings agree (an entrance animation or a scroll still moving it). */
async function settle(entry: TourTargetEntry, first: TourRect, stale: () => boolean): Promise<TourRect | null> {
  let prev = first;
  for (let i = 0; i < SETTLE_TRIES; i += 1) {
    await wait(SETTLE_MS);
    if (stale()) return null;
    const next = await measured(entry);
    if (!next) return null;
    if (sameRect(prev, next)) return next;
    prev = next;
  }
  return prev;
}

/** Wait for the step's target to register, scroll it into view, and measure it; null when it never shows. */
async function findTarget(step: TourStep, id: string, stale: () => boolean): Promise<{ rect: TourRect; target: TourShownTarget } | null> {
  const share = step.minVisible ?? 0.8;
  const canScroll = step.scroll !== false;
  let deadline = Date.now() + (step.timeout ?? TIMEOUT_MS);
  // Always ask the scroll area: it knows what covers its edges (the floating tab bar, a sticky footer),
  // which the window check below can't see, and does nothing when the target is already clear. Twice,
  // so a list still growing under the first scroll (a screen just opened) is caught up.
  let scrolls = 0;
  for (;;) {
    if (stale()) return null;
    const entry = getTourTarget(id);
    if (entry) {
      const rect = await measured(entry);
      if (stale()) return null;
      if (rect) {
        const vis = visibility(rect, viewport(), share);
        if (scrolls < SCROLL_TRIES && canScroll && entry.scrollIntoView) {
          scrolls += 1;
          try {
            await entry.scrollIntoView();
          } catch {
            // measure where it is
          }
          if (scrolls < SCROLL_TRIES) await wait(SETTLE_MS);
          deadline = Math.max(deadline, Date.now() + SCROLL_GRACE_MS);
          continue;
        }
        if (vis.enough) {
          const still = await settle(entry, rect, stale);
          if (stale()) return null;
          if (still && visibility(still, viewport(), share).enough) return { rect: still, target: targetInfo(step, entry) };
        }
      }
    }
    if (Date.now() > deadline) return null;
    await wait(POLL_MS);
  }
}

// ── The step loop ────────────────────────────────────────────────────────────
async function seek(index: number, dir: 1 | -1) {
  const s = get();
  const run = s.run;
  if (!run || s.phase === 'closing') return;
  const step = run.steps[index];
  if (!step) return;
  seekSeq += 1;
  const token = seekSeq;
  const stale = () => token !== seekSeq || get().run?.id !== run.id || get().phase === 'closing';
  const wasShowing = s.phase === 'showing';
  const crossing = !!step.onEnter || !step.target || !s.shown?.rect;
  set({ phase: 'seeking', index, collapse: crossing });
  if (wasShowing) await wait(HIDE_MS);
  if (stale()) return;
  if (step.onEnter) {
    try {
      await step.onEnter();
    } catch {
      // the step still looks for its target
    }
    if (stale()) return;
  }
  if (!step.target) {
    show(run, index, null, null);
    return;
  }
  const found = await findTarget(step, step.target, stale);
  if (stale()) return;
  if (!found) {
    dropAndMove(index, dir);
    return;
  }
  show(run, index, found.rect, found.target);
}

function show(run: TourRun, index: number, rect: TourRect | null, target: TourShownTarget | null) {
  showSeq += 1;
  missingSince = null;
  set({ phase: 'showing', index, shown: { index, rect, target, seq: showSeq }, collapse: false });
  const { position, total } = tourProgress(run, get().dropped, index);
  try {
    run.options.onStep?.(run.steps[index]!, position, total);
  } catch {
    // a callback never breaks the tour
  }
}

function dropAndMove(index: number, dir: 1 | -1) {
  const s = get();
  const run = s.run;
  if (!run) return;
  const dropped = s.dropped.includes(index) ? s.dropped : [...s.dropped, index];
  set({ dropped });
  const next = nextLive(run, dropped, index, dir) ?? (dir === -1 ? nextLive(run, dropped, index, 1) : null);
  if (next != null) {
    void seek(next, next > index ? 1 : -1);
    return;
  }
  endRun(s.shown ? 'done' : 'empty');
}

function endRun(reason: TourEndReason) {
  const s = get();
  const run = s.run;
  if (!run || s.phase === 'closing') return;
  seekSeq += 1; // cancels a step being looked for
  const showing = s.shown && s.phase !== 'intro' ? s.shown.index : null;
  const progress = showing != null ? tourProgress(run, s.dropped, showing) : { position: 0, total: liveIndices(run, s.dropped).length };
  const result: TourResult = {
    tourId: run.tourId,
    reason,
    stepKey: showing != null ? stepKey(run, showing) : null,
    position: progress.position,
    total: progress.total,
  };
  set({ phase: 'closing' });
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    closeTimer = null;
    if (get().run?.id === run.id) set({ ...IDLE });
  }, EXIT_MS);
  if (reason === 'skipped' && run.options.skipToast) toast.show(run.options.skipToast, 'info');
  try {
    run.options.onEnd?.(result);
  } catch {
    // a callback never breaks the tour
  }
}

// ── Public actions ───────────────────────────────────────────────────────────
/**
 * Start a tour. Steps whose `when()` is false are left out (and out of the dot count). Starting while
 * another tour runs ends that one with reason 'stopped'. With no steps left, onEnd gets 'empty' at once.
 */
export function startTour(tourId: string, steps: TourStep[], options: TourStartOptions = {}) {
  const s = get();
  if (s.run && s.phase !== 'closing') endRun('stopped');
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  const startAt = Math.max(0, options.startAt ?? 0);
  const kept: TourStep[] = [];
  let first = -1;
  (Array.isArray(steps) ? steps : []).forEach((step, i) => {
    let ok = true;
    try {
      ok = step.when ? step.when() !== false : true;
    } catch {
      ok = false;
    }
    if (!ok) return;
    if (first < 0 && i >= startAt) first = kept.length;
    kept.push(step);
  });
  if (!kept.length) {
    set({ ...IDLE });
    try {
      options.onEnd?.({ tourId, reason: 'empty', stepKey: null, position: 0, total: 0 });
    } catch {
      // ignore
    }
    return;
  }
  runSeq += 1;
  seekSeq += 1;
  const index = first < 0 ? 0 : first;
  set({ run: { id: runSeq, tourId, steps: kept, options }, phase: options.intro ? 'intro' : 'seeking', index, dropped: [], shown: null, collapse: false });
  if (!options.intro) void seek(index, 1);
}

/** The intro card's "Show me around". */
export function beginTour() {
  const s = get();
  if (!s.run || s.phase !== 'intro') return;
  void seek(s.index, 1);
}

export function nextTourStep() {
  const s = get();
  if (!s.run) return;
  if (s.phase === 'intro') {
    beginTour();
    return;
  }
  if (s.phase !== 'showing') return;
  const next = nextLive(s.run, s.dropped, s.index, 1);
  if (next == null) endRun('done');
  else void seek(next, 1);
}

export function prevTourStep() {
  const s = get();
  if (!s.run || s.phase !== 'showing') return;
  const prev = nextLive(s.run, s.dropped, s.index, -1);
  if (prev != null) void seek(prev, -1);
}

export function skipTour() {
  endRun('skipped');
}

/** End the tour now (sign-out, a deep link, another flow taking over). */
export function stopTour() {
  endRun('stopped');
}

/** A tap inside the spotlight. Returns what it did, so the overlay can give the right haptic. */
export function tapTourHole(): 'next' | 'activate' | 'none' {
  const s = get();
  if (s.phase !== 'showing' || !s.run || !s.shown) return 'none';
  const step = s.run.steps[s.shown.index];
  if (!step) return 'none';
  const mode = step.holeTap ?? (s.shown.target?.tapThrough ? 'activate' : 'next');
  if (mode === 'none') return 'none';
  if (mode === 'next') {
    nextTourStep();
    return 'next';
  }
  const entry = step.target ? getTourTarget(step.target) : undefined;
  endRun('activated');
  try {
    entry?.activate?.();
  } catch {
    // the tour has ended either way
  }
  return 'activate';
}

// ── Overlay → engine ─────────────────────────────────────────────────────────
export function setTourViewport(vp: TourViewport) {
  const prev = get().viewport;
  if (prev && prev.width === vp.width && prev.height === vp.height && prev.top === vp.top && prev.bottom === vp.bottom) return;
  set({ viewport: vp });
}

export function setTourOffset(x: number, y: number) {
  const prev = get().offset;
  if (Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5) return;
  set({ offset: { x, y } });
}

/**
 * Re-measure the shown target (layout change, rotation, data arriving above it). A target that has gone
 * for over 1.2 s is looked for again, and dropped if it doesn't come back.
 */
export async function remeasureTour() {
  const s = get();
  if (s.phase !== 'showing' || !s.run || !s.shown?.rect) return;
  const step = s.run.steps[s.shown.index];
  if (!step?.target) return;
  const seq = s.shown.seq;
  const entry = getTourTarget(step.target);
  const rect = entry ? await measured(entry) : null;
  const now = get();
  if (now.phase !== 'showing' || now.shown?.seq !== seq) return;
  if (!rect) {
    const t = Date.now();
    if (!missingSince || missingSince.seq !== seq) missingSince = { seq, at: t };
    else if (t - missingSince.at > MISSING_MS) {
      missingSince = null;
      void seek(now.shown.index, 1);
    }
    return;
  }
  missingSince = null;
  if (!sameRect(rect, now.shown.rect)) set({ shown: { ...now.shown, rect } });
}
