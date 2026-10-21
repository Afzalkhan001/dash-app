// Calls (Meets audio / video) — typed client for the existing /api/meets/meetings routes (meets.js
// :2019–2460; spec docs/port/meets.md §2.2). No server change. Every route sits behind the staff
// Bearer gate and is decided by canJoinMeeting (meets.js:1849), never by a role; the host-only routes
// (invite, PATCH, remove, end) check host_id on the server.
//
//   GET    /meets/calls/config                  ICE servers (TURN credential minted for 1 h), limits
//   POST   /meets/meetings {conversationId}     start a call → SSE `meeting` (the ring) to the other members
//   GET    /meets/meetings/:id                  meeting + who is in it (lobby / Expo Go fallback)
//   POST   /meets/meetings/:id/join             self, peers, iceServers, isHost, expected, heartbeatSeconds
//   POST   /meets/meetings/:id/decline          tells the host "declined" (nothing written)
//   POST   /meets/meetings/:id/heartbeat        presence (lapses after 45 s) + the live peer list
//   POST   /meets/meetings/:id/signal           {to, kind: offer|answer|ice|bye|state, payload ≤ 16 KB}
//   POST   /meets/meetings/:id/leave            left_at, SSE meet-peer-leave
//   POST   /meets/meetings/:id/invite           host: ring one more person (meeting only, no chat access)
//   PATCH  /meets/meetings/:id                  host: {screenShareAllowed}
//   POST   /meets/meetings/:id/remove           host: that person can never rejoin this meeting
//   POST   /meets/meetings/:id/end              host: ends it for everyone (cannot be undone)
//
// Calls go through apiFetch without withActor (the website posts these bodies as they are).

import { useQuery } from '@tanstack/react-query';

import { apiFetch, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

export type CallPerson = { id: string; name?: string | null; email?: string | null; dept?: string | null; jobTitle?: string | null };
/** meets.js peerCard: a public user plus when they joined (the "who calls whom" rule reads it). */
export type PeerCard = CallPerson & { joinedAt?: string | null };

export type IceServer = { urls: string | string[]; username?: string; credential?: string };

export type CallsConfig = {
  configured: boolean;
  iceServers: IceServer[];
  hasStun: boolean;
  hasTurn: boolean;
  ownStun?: boolean;
  turnState?: 'on' | 'off' | 'missing-secret' | 'missing-urls';
  maxParticipants: number;
  heartbeatSeconds: number;
};

export type CreatedMeeting = {
  meeting: { id: string; conversation_id: string | null; host_id: string; title: string | null; created_at: string; expires_at: string | null; screen_share_allowed: boolean };
};

export type MeetingInfo = {
  meeting: {
    id: string;
    title: string | null;
    conversationId: string | null;
    host: CallPerson | null;
    isHost: boolean;
    screenShareAllowed: boolean;
    expiresAt: string | null;
    maxParticipants: number;
  };
  participants: PeerCard[];
};

export type JoinResponse = {
  self: PeerCard;
  peers: PeerCard[];
  iceServers: IceServer[];
  ownStun?: boolean;
  isHost: boolean;
  screenShareAllowed: boolean;
  maxParticipants: number;
  expected: CallPerson[];
  heartbeatSeconds: number;
};

export type HeartbeatResponse = { peers: PeerCard[]; screenShareAllowed: boolean; maxParticipants: number; expected: CallPerson[] };

export type SignalKind = 'offer' | 'answer' | 'ice' | 'bye' | 'state';
/** The `state` courtesy signal: what a peer is sending right now (dash.html:7422). */
export type MediaState = { mic: boolean; cam: boolean; screen: boolean };

/** The SSE `meeting` event (meets.js:2066): the ring. */
export type RingEvent = { conversationId: string | null; meetingId: string; title: string | null; startedBy: CallPerson | null; startedAt?: string };

/** The website's give-up time for a ring (dash.html RING_SECONDS). */
export const RING_SECONDS = 45;
/** The phone's camera size: one stream goes up per peer in the mesh (spec §4.3.8). */
export const CAMERA_CONSTRAINTS = { width: 640, height: 360, frameRate: 15 } as const;

const enc = encodeURIComponent;
export const meetingPath = (id: string, suffix = '') => `/meets/meetings/${enc(id)}${suffix}`;

export const callKeys = {
  config: (me?: string) => ['calls', me ?? '', 'config'] as const,
  meeting: (me: string | undefined, id: string) => ['calls', me ?? '', 'meeting', id] as const,
};

const post = <T>(path: string, body: unknown = {}) => apiFetch<T>(path, { method: 'POST', body });

export const callsApi = {
  config: () => apiFetch<CallsConfig>('/meets/calls/config'),
  start: (conversationId: string, title?: string | null) =>
    post<CreatedMeeting>('/meets/meetings', title ? { conversationId, title } : { conversationId }),
  meeting: (id: string, signal?: AbortSignal) => apiFetch<MeetingInfo>(meetingPath(id), { signal }),
  join: (id: string) => post<JoinResponse>(meetingPath(id, '/join')),
  decline: (id: string) => post<{ declined: boolean }>(meetingPath(id, '/decline')),
  heartbeat: (id: string) => post<HeartbeatResponse>(meetingPath(id, '/heartbeat')),
  signal: (id: string, to: string, kind: SignalKind, payload: unknown) =>
    post<{ delivered: boolean }>(meetingPath(id, '/signal'), { to, kind, payload }),
  leave: (id: string) => post<{ left: boolean }>(meetingPath(id, '/leave')),
  invite: (id: string, userId: string) => post<{ invited: CallPerson }>(meetingPath(id, '/invite'), { userId }),
  setScreenShare: (id: string, screenShareAllowed: boolean) =>
    apiFetch<{ screenShareAllowed: boolean }>(meetingPath(id), { method: 'PATCH', body: { screenShareAllowed } }),
  remove: (id: string, userId: string) => post<{ userId: string }>(meetingPath(id, '/remove'), { userId }),
  end: (id: string) => post<{ meetingId: string }>(meetingPath(id, '/end')),
};

/** The calling configuration (limits shown on the Calls screen). Not persisted: it carries a TURN credential. */
export function useCallsConfig(enabled = true) {
  const me = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: callKeys.config(me),
    enabled: enabled && !!me,
    staleTime: 10 * 60_000,
    meta: { persist: false },
    queryFn: () => unwrap(callsApi.config()),
  });
}

/** One meeting (title, host, who is in it) — the lobby the website never shows; used by the fallback. */
export function useMeeting(id: string, enabled = true) {
  const me = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: callKeys.meeting(me, id),
    enabled: enabled && !!me && !!id,
    meta: { persist: false },
    retry: false,
    queryFn: ({ signal }) => unwrap(callsApi.meeting(id, signal)),
  });
}
