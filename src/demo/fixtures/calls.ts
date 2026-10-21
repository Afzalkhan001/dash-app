// Demo API for the calls domain (Meets audio / video calls; docs/port/meets.md §2.2, §7). Owner: the
// calls agent. Already in the fixtures barrel (demo/fixtures/index.ts). Every route mirrors meets.js —
// host_id, invites and removals decide, never a role — and responses use the app's own types
// (api/calls.ts), so tsc checks them. "Me" is DEMO_USER (the demo server shows it as whichever Afzal
// persona is exploring), so every staff persona can start, answer, host and end calls.
//
// The demo has no media and no signalling: features/calls/engine.ts DemoEngine plays colleagues
// answering on timers, and /signal simply answers { delivered: true }.
// Live feel: `callsDemoEvents` is the demo's stand-in for the stream's `meeting` (ring) event;
// `ringFromColleague()` starts a call from Priya Sharma in the "Priya Sharma" chat (c-priya, demo chat
// fixtures) so the incoming-call sheet, Accept and Decline can be tried.

import type { CallPerson, CallsConfig, CreatedMeeting, HeartbeatResponse, JoinResponse, MeetingInfo, PeerCard, RingEvent } from '@/api/calls';
import { DEMO_USER } from '@/demo/config';
import { personById } from '@/demo/fixtures/org';
import { selfAs } from '@/demo/personas';
import { fail, hex6, notFound, nowIso, type Route } from '@/demo/state';

const ME = DEMO_USER.id;

type Meeting = {
  id: string;
  conversationId: string | null;
  hostId: string;
  title: string | null;
  createdAt: string;
  endedAt: string | null;
  screenShareAllowed: boolean;
  /** Who is in the room now (user id → joinedAt). */
  live: Map<string, string>;
  invited: Set<string>;
  removed: Set<string>;
};

const meetings = new Map<string, Meeting>();
let seq = 0;
// The server's ids are 32 base64url characters (meets.js:2054); canJoinMeeting wants 22–64.
const meetingId = () => `demo${Date.now().toString(36)}${hex6(`m${++seq}`)}${hex6(`n${seq}:${Math.random()}`)}`.slice(0, 32).padEnd(24, '0');

function publicUser(id: string): CallPerson {
  if (id === ME) return { id: ME, name: DEMO_USER.name ?? 'You', email: DEMO_USER.email ?? null, dept: DEMO_USER.dept ?? null, jobTitle: DEMO_USER.jobTitle ?? null };
  const p = personById(id);
  if (!p) return { id, name: 'Former employee' };
  return { id: p.id, name: p.name, email: p.email ?? null, dept: p.dept ?? null, jobTitle: (p.jobTitle as string | undefined) ?? null };
}
const card = (id: string, joinedAt: string): PeerCard => ({ ...publicUser(id), joinedAt });

const CONFIG: CallsConfig = {
  configured: true,
  iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
  hasStun: true,
  hasTurn: false,
  ownStun: false,
  turnState: 'off',
  maxParticipants: 8,
  heartbeatSeconds: 15,
};

// canJoinMeeting (meets.js:1849), with the conversation check left to the chat fixtures' membership.
function joinable(id: string): Meeting | { error: string; status: number } {
  const m = meetings.get(id);
  if (!m) return fail('That meeting link is not valid.', 404);
  if (m.endedAt) return fail('This meeting has ended.', 410);
  if (m.removed.has(ME)) return fail('You were removed from this meeting.', 403);
  return m;
}
const isMeeting = (x: Meeting | { error: string }): x is Meeting => !('error' in x);

const peersOf = (m: Meeting) => [...m.live.entries()].filter(([id]) => id !== ME).map(([id, at]) => card(id, at));

// ── The ring emitter ─────────────────────────────────────────────────────────
type DemoListener = (name: string, data: unknown) => void;
const listeners = new Set<DemoListener>();
export const callsDemoEvents = {
  on(fn: DemoListener) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
function emit(name: string, data: unknown) {
  // Events skip the demo server's id swap, so "me" is rewritten to the persona here.
  const me = selfAs();
  const out = JSON.parse(JSON.stringify(data), (_k, v) => (v === ME ? me.id : v === DEMO_USER.name ? me.name : v));
  for (const fn of [...listeners]) fn(name, out);
}

/** Priya Sharma calls me from our direct chat: the demo's "Try an incoming call". */
export function ringFromColleague(fromId = 'u-priya', conversationId = 'c-priya'): RingEvent {
  const at = nowIso();
  const m: Meeting = {
    id: meetingId(),
    conversationId,
    hostId: fromId,
    title: null,
    createdAt: at,
    endedAt: null,
    screenShareAllowed: true,
    live: new Map([[fromId, at]]),
    invited: new Set(),
    removed: new Set(),
  };
  meetings.set(m.id, m);
  const ring: RingEvent = { conversationId, meetingId: m.id, title: null, startedBy: publicUser(fromId), startedAt: at };
  setTimeout(() => emit('meeting', ring), 600);
  return ring;
}

const re = (s: string) => new RegExp(`^${s}$`);
const MEET = '/meets/meetings/([A-Za-z0-9_-]{22,64})';

export const callsRoutes: Route[] = [
  ['GET', re('/meets/calls/config'), (): CallsConfig => CONFIG],

  [
    'POST',
    re('/meets/meetings'),
    (_p, body): CreatedMeeting | { error: string; status: number } => {
      const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : null;
      const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 100) : null;
      const at = nowIso();
      const m: Meeting = { id: meetingId(), conversationId, hostId: ME, title, createdAt: at, endedAt: null, screenShareAllowed: true, live: new Map(), invited: new Set(), removed: new Set() };
      meetings.set(m.id, m);
      return { meeting: { id: m.id, conversation_id: conversationId, host_id: ME, title, created_at: at, expires_at: null, screen_share_allowed: true } };
    },
  ],

  [
    'GET',
    re(MEET),
    (p): MeetingInfo | { error: string; status: number } => {
      const m = joinable(p[1]!);
      if (!isMeeting(m)) return m;
      return {
        meeting: {
          id: m.id,
          title: m.title,
          conversationId: m.conversationId,
          host: publicUser(m.hostId),
          isHost: m.hostId === ME,
          screenShareAllowed: m.screenShareAllowed,
          expiresAt: null,
          maxParticipants: CONFIG.maxParticipants,
        },
        participants: [...m.live.entries()].map(([id, at]) => card(id, at)),
      };
    },
  ],

  [
    'POST',
    re(`${MEET}/join`),
    (p): JoinResponse | { error: string; status: number } => {
      const m = joinable(p[1]!);
      if (!isMeeting(m)) return m;
      const before = peersOf(m);
      const at = m.live.get(ME) ?? nowIso();
      m.live.set(ME, at);
      return {
        self: card(ME, at),
        peers: before,
        iceServers: CONFIG.iceServers,
        ownStun: false,
        isHost: m.hostId === ME,
        screenShareAllowed: m.hostId === ME || m.screenShareAllowed,
        maxParticipants: CONFIG.maxParticipants,
        expected: [],
        heartbeatSeconds: CONFIG.heartbeatSeconds,
      };
    },
  ],

  ['POST', re(`${MEET}/decline`), (p) => (meetings.has(p[1]!) ? { declined: true } : notFound('That meeting link is not valid.'))],

  [
    'POST',
    re(`${MEET}/heartbeat`),
    (p): HeartbeatResponse | { error: string; status: number } => {
      const m = joinable(p[1]!);
      if (!isMeeting(m)) return m;
      return { peers: peersOf(m), screenShareAllowed: m.screenShareAllowed, maxParticipants: CONFIG.maxParticipants, expected: [] };
    },
  ],

  // No media in the demo: signals are accepted and go nowhere.
  ['POST', re(`${MEET}/signal`), () => ({ delivered: true })],

  [
    'POST',
    re(`${MEET}/leave`),
    (p) => {
      meetings.get(p[1]!)?.live.delete(ME);
      return { left: true };
    },
  ],

  [
    'POST',
    re(`${MEET}/invite`),
    (p, body) => {
      const m = joinable(p[1]!);
      if (!isMeeting(m)) return m;
      if (m.hostId !== ME) return fail('Only the host can add people to this meeting.', 403);
      const userId = typeof body?.userId === 'string' ? body.userId : '';
      if (!userId || !personById(userId)) return fail('That person is not available.', 404);
      if (m.removed.has(userId)) return fail('That person was removed from this meeting and cannot be invited back.', 409);
      m.invited.add(userId);
      return { invited: publicUser(userId) };
    },
  ],

  [
    'PATCH',
    re(MEET),
    (p, body) => {
      const m = joinable(p[1]!);
      if (!isMeeting(m)) return m;
      if (m.hostId !== ME) return fail('Only the host can change this.', 403);
      if (typeof body?.screenShareAllowed !== 'boolean') return fail('screenShareAllowed must be true or false.', 400);
      m.screenShareAllowed = body.screenShareAllowed;
      return { screenShareAllowed: m.screenShareAllowed };
    },
  ],

  [
    'POST',
    re(`${MEET}/remove`),
    (p, body) => {
      const m = joinable(p[1]!);
      if (!isMeeting(m)) return m;
      if (m.hostId !== ME) return fail('Only the host can remove people.', 403);
      const userId = typeof body?.userId === 'string' ? body.userId : '';
      if (!userId || userId === ME) return fail('The host cannot be removed.', 400);
      m.removed.add(userId);
      m.live.delete(userId);
      return { userId };
    },
  ],

  [
    'POST',
    re(`${MEET}/end`),
    (p) => {
      const m = meetings.get(p[1]!);
      if (!m) return notFound('That meeting link is not valid.');
      if (m.hostId !== ME) return fail('Only the host can end this meeting.', 403);
      m.endedAt = nowIso();
      m.live.clear();
      return { meetingId: m.id };
    },
  ],
];
