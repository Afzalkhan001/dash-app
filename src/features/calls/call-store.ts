// The one call in progress, held outside React so the screen renders purely from a snapshot.
// The call screen opens it on mount and releases it on unmount; the release waits a tick, so React's
// development double-mount (or a quick remount) keeps the same call instead of leaving and rejoining.
// While a call is open, chatBus.callLive is true: chat notices stay silent and the ring is ignored
// (meetsBus.callLive on the website, dash.html:7333).
// It also feeds the phone's call log (call-log.ts): joined once the call is live, then how long I was
// with someone else (from the first person in until the last one left, or until I left) and whether a
// camera was on.

import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { logFinished, logInfo, logJoined } from '@/features/calls/call-log';
import { type CallEngine, type CallState, DemoEngine, LiveEngine } from '@/features/calls/engine';
import { loadRtc } from '@/features/calls/rtc';
import { chatBus, stopChatStream } from '@/features/chat/realtime';

let active: CallEngine | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of [...listeners]) fn();
}

// ── The call log's view of the open call ────────────────────────────────────
type Track = { meetingId: string; joined: boolean; togetherAt: number | null; aloneSince: number | null; video: boolean; info: string; done: boolean };
let track: Track | null = null;

function observe(engine: CallEngine) {
  const t = track;
  if (!t || t.done || t.meetingId !== engine.meetingId) return;
  const s = engine.getState();
  if (s.phase === 'live' && !t.joined) {
    t.joined = true;
    logJoined(t.meetingId, { conversationId: s.conversationId, title: s.title, isHost: s.isHost });
  }
  const info = `${s.conversationId ?? ''}|${s.title ?? ''}`;
  if (t.joined && info !== t.info) {
    t.info = info;
    logInfo(t.meetingId, s.conversationId, s.title);
  }
  if (s.phase === 'live' && s.peers.length > 0) {
    t.togetherAt ??= Date.now();
    t.aloneSince = null;
  } else if (t.togetherAt != null && t.aloneSince == null) t.aloneSince = Date.now();
  if (s.cam || s.peers.some((p) => p.camLive || p.state.cam)) t.video = true;
  if (s.phase === 'ended' || s.phase === 'error') finish(t);
}

function finish(t: Track | null) {
  if (!t || t.done) return;
  t.done = true;
  const end = t.aloneSince ?? Date.now();
  const seconds = t.togetherAt != null ? Math.round((end - t.togetherAt) / 1000) : 0;
  logFinished(t.meetingId, { joined: t.joined, seconds, video: t.video });
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
    finish(track);
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
  const opened = engine;
  track = { meetingId, joined: false, togetherAt: null, aloneSince: null, video: false, info: '', done: false };
  engine.subscribe(() => observe(opened));
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
    finish(track);
    active = null;
    chatBus.callLive = false;
    // The chat stream was kept open in the background for the call (chat/meets-watcher.tsx).
    if (AppState.currentState === 'background') stopChatStream();
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
