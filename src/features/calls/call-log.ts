// Call history, kept on this phone.
//
// The server keeps none: meets.js writes no chat message for a call, has no call list, and
// `/meets/unread` always answers missedCalls: 0. The website shows nothing in a thread either (dash.html
// MeetsHub only reloads the thread on `meeting` / `meeting-ended`). So the app remembers what THIS
// phone saw and shows it the way a phone does:
//   - in the chat thread, a call row between the messages (who called, voice or video, how long or
//     "Missed", the time), with a Join pill while the call is still going (features/calls/call-row.tsx);
//   - as the chat list's preview line when a call is newer than the last message;
//   - under "Recent calls" on the Calls screen.
//
// What fills it:
//   - a ring (`meeting` from the stream, features/calls/incoming-call.tsx) → 'ringing'
//   - Decline → 'declined'; X / Not now / the ring running out leave it 'ringing' (the call can still
//     be joined from the "Call in progress" bar, features/calls/call-bar.tsx)
//   - a call I start (start-call.tsx) or join (call-store.ts) → 'in-call', then 'answered' with the
//     time spent with someone else, or 'no-answer' / 'missed' when nobody was there
//   - `meeting-ended`, or the bar's check finding the call over → a 'ringing' call becomes 'missed'
// A call this phone never heard about (the app was closed) is not here. One list per person under
// `dash.calls.log` (AsyncStorage), newest first, at most 80. Signing out does not clear it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { RingEvent } from '@/api/calls';
import { isDemoSession } from '@/api/client';
import { useSession } from '@/auth/session';
import { demoCallHistory } from '@/demo/fixtures/calls';
import { hms } from '@/features/attendance/format';

export type CallOutcome = 'ringing' | 'in-call' | 'answered' | 'missed' | 'declined' | 'no-answer';

export type CallLogEntry = {
  meetingId: string;
  conversationId: string | null;
  /** The meeting's own title, when it has one. */
  title: string | null;
  /** 'in' = someone rang me; 'out' = I started it. */
  direction: 'in' | 'out';
  /** Who rang me (incoming only). */
  by: { id: string; name: string } | null;
  /** When it rang, or when I started it (ISO). */
  at: string;
  outcome: CallOutcome;
  /** Seconds spent with someone else in the call. */
  seconds?: number;
  /** A camera was on at some point. */
  video?: boolean;
  /** The floating "Call in progress" bar was closed for this call (the chat still offers Join). */
  hidden?: boolean;
};

const MAX = 80;

type LogState = {
  byUser: Record<string, CallLogEntry[]>;
  /** The call whose ring sheet is on screen (not stored). */
  ringing: string | null;
};

const useCallLogStore = create<LogState>()(
  persist(() => ({ byUser: {}, ringing: null }) as LogState, {
    name: 'dash.calls.log',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (s) => ({ byUser: s.byUser }),
    onRehydrateStorage: () => () => settleStale(),
  }),
);

/** A call that was open when the app was closed (or stopped) is over now; how long it lasted is unknown. */
function settleStale() {
  const { byUser } = useCallLogStore.getState();
  let changed = false;
  const next: Record<string, CallLogEntry[]> = {};
  for (const [uid, list] of Object.entries(byUser)) {
    next[uid] = list.map((e) => {
      if (e.outcome !== 'in-call') return e;
      changed = true;
      return { ...e, outcome: 'answered' as const, hidden: true };
    });
  }
  if (changed) useCallLogStore.setState({ byUser: next });
}

const me = () => {
  const s = useSession.getState();
  return s.kind === 'staff' ? (s.user?.id ?? null) : null;
};

const find = (list: CallLogEntry[], id: string) => list.find((e) => e.meetingId === id);

/** Changes my list. `fn` gets the current entry (or undefined) and returns the new one, or null to leave it. */
function change(meetingId: string, fn: (e: CallLogEntry | undefined) => CallLogEntry | null) {
  const uid = me();
  if (!uid || !meetingId || meetingId === 'test') return;
  useCallLogStore.setState((s) => {
    const list = s.byUser[uid] ?? [];
    const next = fn(find(list, meetingId));
    if (!next) return s;
    const rest = list.filter((e) => e.meetingId !== meetingId);
    const sorted = [next, ...rest].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, MAX);
    return { byUser: { ...s.byUser, [uid]: sorted } };
  });
}

const over = (o: CallOutcome) => o === 'answered' || o === 'missed' || o === 'declined' || o === 'no-answer';

/** Someone rang me. A new invite to a call I let ring (or declined) rings again and shows the bar again. */
export function logRing(r: RingEvent) {
  change(r.meetingId, (e) => {
    if (e && (e.outcome === 'in-call' || e.outcome === 'answered')) return null;
    const by = r.startedBy?.id ? { id: String(r.startedBy.id), name: r.startedBy.name || 'A colleague' } : (e?.by ?? null);
    return {
      meetingId: r.meetingId,
      conversationId: r.conversationId ?? e?.conversationId ?? null,
      title: r.title ?? e?.title ?? null,
      direction: 'in',
      by,
      at: e?.at ?? r.startedAt ?? new Date().toISOString(),
      outcome: 'ringing',
      hidden: false,
    };
  });
}

/** I declined (the caller was told). */
export function logDecline(meetingId: string) {
  change(meetingId, (e) => (e && e.outcome === 'ringing' ? { ...e, outcome: 'declined' } : null));
}

/** I closed the floating bar for this call. */
export function logHideBar(meetingId: string) {
  change(meetingId, (e) => (e && !e.hidden ? { ...e, hidden: true } : null));
}

/** I started a call (POST /meets/meetings answered). */
export function logStart(meetingId: string, conversationId: string | null, title: string | null) {
  change(meetingId, (e) => e ?? { meetingId, conversationId, title, direction: 'out', by: null, at: new Date().toISOString(), outcome: 'in-call' });
}

/** I am in the call now (the call screen went live). */
export function logJoined(meetingId: string, info: { conversationId: string | null; title: string | null; isHost: boolean }) {
  change(meetingId, (e) => {
    if (e?.outcome === 'in-call') return null;
    return {
      meetingId,
      conversationId: e?.conversationId ?? info.conversationId,
      title: e?.title ?? info.title,
      direction: e?.direction ?? (info.isHost ? 'out' : 'in'),
      by: e?.by ?? null,
      at: e?.at ?? new Date().toISOString(),
      outcome: 'in-call',
      hidden: true,
    };
  });
}

/** The call's chat and title, once the call screen has looked them up. */
export function logInfo(meetingId: string, conversationId: string | null, title: string | null) {
  change(meetingId, (e) => {
    if (!e || ((e.conversationId || !conversationId) && (e.title || !title))) return null;
    return { ...e, conversationId: e.conversationId ?? conversationId, title: e.title ?? title };
  });
}

/** I left (or the call ended) after joining. */
export function logFinished(meetingId: string, r: { joined: boolean; seconds: number; video: boolean }) {
  change(meetingId, (e) => {
    if (!e || over(e.outcome)) return null;
    if (!r.joined) return e.outcome === 'in-call' ? { ...e, outcome: e.direction === 'out' ? 'no-answer' : 'missed' } : null;
    const outcome: CallOutcome = r.seconds > 0 ? 'answered' : e.direction === 'out' ? 'no-answer' : 'missed';
    return { ...e, outcome, seconds: r.seconds, video: !!(e.video || r.video), hidden: true };
  });
}

/** The call is over and I never joined: a ring becomes a missed call. */
export function logOver(meetingId: string) {
  change(meetingId, (e) => (e && e.outcome === 'ringing' ? { ...e, outcome: 'missed' } : null));
}

/** The ring sheet on screen (the bar stays out of its way). */
export function setRingingCall(meetingId: string | null) {
  if (useCallLogStore.getState().ringing !== meetingId) useCallLogStore.setState({ ringing: meetingId });
}

const EMPTY: CallLogEntry[] = [];

/** My calls, newest first (in the demo, with a few sample calls from the past). */
export function useCallHistory(): CallLogEntry[] {
  const uid = useSession((s) => (s.kind === 'staff' ? (s.user?.id ?? null) : null));
  const mine = useCallLogStore((s) => (uid ? (s.byUser[uid] ?? EMPTY) : EMPTY));
  const demo = !!uid && isDemoSession();
  return useMemo(() => {
    if (!demo) return mine;
    const seen = new Set(mine.map((e) => e.meetingId));
    return [...mine, ...demoCallHistory().filter((e) => !seen.has(e.meetingId))].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [mine, demo]);
}

/** Calls I was rung for that are still going and that I have not joined: they can be joined. */
export function useLiveCalls(): CallLogEntry[] {
  const all = useCallHistory();
  return useMemo(() => all.filter((e) => e.outcome === 'ringing'), [all]);
}

export function useRingingCall() {
  return useCallLogStore((s) => s.ringing);
}

/** The latest call per chat. */
export function useLatestCallByChat(): Map<string, CallLogEntry> {
  const all = useCallHistory();
  return useMemo(() => {
    const m = new Map<string, CallLogEntry>();
    for (const e of all) if (e.conversationId && !m.has(e.conversationId)) m.set(e.conversationId, e);
    return m;
  }, [all]);
}

// ── Words ────────────────────────────────────────────────────────────────────
/** '45s', '4m 12s', '1h 02m 05s'. */
export const callLength = (seconds: number) => (seconds < 60 ? `${Math.max(0, Math.round(seconds))}s` : hms(seconds));

const kindOf = (e: CallLogEntry) => (e.video ? 'Video call' : 'Voice call');

/** 'Voice call', 'Missed voice call', 'Declined call', 'No answer', 'Call in progress'. */
export function callHeadline(e: CallLogEntry) {
  switch (e.outcome) {
    case 'ringing':
      return 'Call in progress';
    case 'in-call':
      return 'In the call now';
    case 'missed':
      return e.video ? 'Missed video call' : 'Missed voice call';
    case 'declined':
      return 'Declined call';
    case 'no-answer':
      return 'No answer';
    default:
      return kindOf(e);
  }
}

const firstName = (n?: string | null) => (n || 'Someone').trim().split(/\s+/)[0] || 'Someone';

/** Who called: 'You called', 'Priya called'. */
export const callerLine = (e: CallLogEntry) => (e.direction === 'out' ? 'You called' : `${firstName(e.by?.name)} called`);

/** The chat list's preview line for a call: 'Missed voice call', 'Rahul: Video call · 18m 40s'. */
export function callPreview(e: CallLogEntry, group: boolean) {
  const body = e.outcome === 'answered' && e.seconds ? `${callHeadline(e)} · ${callLength(e.seconds)}` : callHeadline(e);
  if (!group) return body;
  return `${e.direction === 'out' ? 'You' : firstName(e.by?.name)}: ${body}`;
}
