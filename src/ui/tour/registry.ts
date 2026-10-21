// The tour's target registry and measuring helpers. A target (<TourTarget> / useTourTarget) registers
// here from an effect and unregisters on unmount; the engine looks targets up by id while a tour runs.
// Nothing here holds colours, so module-level state is safe across light / dark remounts.

import type { ComponentRef } from 'react';
import type { View } from 'react-native';

import type { TourRect, TourShape } from '@/ui/tour/types';

export type TourTargetEntry = {
  /** The target's rect in window coordinates, or null when it can't be measured right now. */
  measure: () => Promise<TourRect | null>;
  /** Scroll the target's scroll area(s) so it is in view. Absent outside a TourScrollProvider. */
  scrollIntoView?: () => Promise<void>;
  shape?: TourShape;
  radius?: number;
  padding?: number;
  /** Tap-through action (see TourTargetOptions.activate). */
  activate?: () => void;
};

const targets = new Map<string, TourTargetEntry>();
const listeners = new Set<(id: string) => void>();

function emit(id: string) {
  listeners.forEach((fn) => {
    try {
      fn(id);
    } catch {
      // a listener never breaks registration
    }
  });
}

/** Register a target. Returns the unregister function (it only removes this exact entry). */
export function registerTourTarget(id: string, entry: TourTargetEntry): () => void {
  targets.set(id, entry);
  emit(id);
  return () => {
    if (targets.get(id) === entry) {
      targets.delete(id);
      emit(id);
    }
  };
}

export function getTourTarget(id: string): TourTargetEntry | undefined {
  return targets.get(id);
}

/** Tell the engine a target moved or changed size (its onLayout fired). */
export function notifyTourTarget(id: string) {
  if (listeners.size) emit(id);
}

/** Listen for targets registering, unregistering or laying out. Returns the unsubscribe function. */
export function onTourTargetChange(fn: (id: string) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Any host view (a View ref, a ScrollView ref, a DOM node on web). */
export type TourViewRef = ComponentRef<typeof View>;
type Measurable = Pick<TourViewRef, 'measureInWindow'>;
type LayoutMeasurable = Pick<TourViewRef, 'measureLayout'>;

const MEASURE_TIMEOUT_MS = 300;

const valid = (r: TourRect) => [r.x, r.y, r.width, r.height].every((n) => Number.isFinite(n));

/** measureInWindow as a promise. Never throws; null when the view is gone or the call never answers. */
export function measureInWindow(node: Measurable | null | undefined): Promise<TourRect | null> {
  return new Promise((resolve) => {
    if (!node || typeof node.measureInWindow !== 'function') {
      resolve(null);
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, MEASURE_TIMEOUT_MS);
    try {
      node.measureInWindow((x, y, width, height) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const r = { x, y, width, height };
        resolve(valid(r) ? r : null);
      });
    } catch {
      settled = true;
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** measureLayout (relative to an ancestor host view) as a promise. Never throws. */
export function measureLayout(node: LayoutMeasurable | null | undefined, ancestor: unknown): Promise<TourRect | null> {
  return new Promise((resolve) => {
    if (!node || !ancestor || typeof node.measureLayout !== 'function') {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (r: TourRect | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r && valid(r) ? r : null);
    };
    const timer = setTimeout(() => done(null), MEASURE_TIMEOUT_MS);
    try {
      node.measureLayout(
        ancestor as Parameters<TourViewRef['measureLayout']>[0],
        (x, y, width, height) => done({ x, y, width, height }),
        () => done(null),
      );
    } catch {
      done(null);
    }
  });
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
