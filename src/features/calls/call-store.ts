// The one call in progress, held outside React so the screen renders purely from a snapshot.
// The call screen opens it on mount and releases it on unmount; the release waits a tick, so React's
// development double-mount (or a quick remount) keeps the same call instead of leaving and rejoining.
// While a call is open, chatBus.callLive is true: chat notices stay silent and the ring is ignored
// (meetsBus.callLive on the website, dash.html:7333).

import { useSyncExternalStore } from 'react';

import { type CallEngine, type CallState, DemoEngine, LiveEngine } from '@/features/calls/engine';
import { loadRtc } from '@/features/calls/rtc';
import { chatBus } from '@/features/chat/realtime';

let active: CallEngine | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of [...listeners]) fn();
}

/** Opens (or keeps) the call for this meeting. Returns null when this build cannot place calls. */
export function openCall(meetingId: string, demo: boolean): CallEngine | null {
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  if (active && active.meetingId === meetingId) return active;
  if (active) {
    active.stop();
    active = null;
  }
  let engine: CallEngine | null = null;
  if (demo) engine = new DemoEngine(meetingId);
  else {
    const rtc = loadRtc();
    if (rtc) engine = new LiveEngine(meetingId, rtc);
  }
  if (!engine) return null;
  active = engine;
  chatBus.callLive = true;
  engine.subscribe(notify);
  engine.start();
  notify();
  return engine;
}

/** Leaves the call (after a tick, see above). */
export function releaseCall(meetingId: string) {
  if (!active || active.meetingId !== meetingId) return;
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    if (!active || active.meetingId !== meetingId) return;
    active.stop();
    active = null;
    chatBus.callLive = false;
    notify();
  }, 0);
}

export function activeCall(): CallEngine | null {
  return active;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** The live snapshot of the call for this meeting, or null when none is open for it. */
export function useCallState(meetingId: string): CallState | null {
  return useSyncExternalStore(
    subscribe,
    () => (active && active.meetingId === meetingId ? active.getState() : null),
    () => null,
  );
}

/** True while any call is open (the ring stays silent then). */
export function useInCall(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => active != null,
    () => false,
  );
}
