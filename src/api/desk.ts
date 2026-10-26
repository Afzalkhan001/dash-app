// The visitor desk (visitors.js DESK section, :556-665): the reception side of Visitor Management.
// Only `visitor_manager` and `super_admin` may call these (server DESK_ROLES; features/desk/access.ts).
//
//   GET  /visitors/today              → { visits: Visit[], stats: { total, waiting, inside, rejected, noResponse, letIn },
//                                         serverNow, letInAfterMin }   tenant-wide, work_date = today (IST), newest first
//   GET  /visitors/log?from&to&status&q&by → { visits: Visit[], letInAfterMin }  (on work_date, newest first, max 2000;
//                                       by = host | desk | override; q also matches who decided)
//   POST /visitors/:id/check-out      {} → { id, status: 'checked_out' }   (409 when already out; no undo)
//   POST /visitors/:id/decide         { decision } → { id, status, via }  (the host OR a desk role). The desk may turn
//                                       away at any time, but let in only after letInAfterMin (5) minutes without an
//                                       answer (else 409 "Give <host> a chance to answer first …"); that is 'desk_override'
//   GET  /visitors/kiosk/board        → { waiting, recent, serverNow }  (the lobby board: first name + last initial only)
//   GET  /visitors/qr                 → { tenantId, token, path, companyName }   (mints the token on first call)
//   POST /visitors/qr/regenerate      {} → { token, path }   (every printed poster and running kiosk stops working)
//
// Privacy (spec §7.9): the desk shows every visitor's face and mobile, so none of these reads is written
// to the persisted query cache (meta: { persist: false }) — a lobby phone keeps nothing on disk.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, apiFetch, isApiError, unwrap } from '@/api/client';
import { type Visit, visitorKeys } from '@/api/visitors';
import { useSession } from '@/auth/session';
import { DASH_URL } from '@/config';

/** letIn = let in by the desk because the host did not answer (decided_via 'desk_override'). */
export type DeskStats = { total: number; waiting: number; inside: number; rejected: number; noResponse: number; letIn: number };
/** skewMs = the server's clock minus this phone's, at the fetch (web: Date.parse(serverNow) − Date.now()). */
export type DeskToday = { visits: Visit[]; stats: DeskStats; letInAfterMin: number; skewMs: number };
export type DeskQr = { tenantId: string; token: string; path: string; companyName: string };
/** Who decided: '' anyone · host (app / WhatsApp) · desk (any desk decision) · override (let in without the host). */
export type DecidedByFilter = '' | 'host' | 'desk' | 'override';
export type VisitorLogFilter = { from: string; to: string; status: string; q: string; by: DecidedByFilter };

/** The server's LET_IN_AFTER_MIN default, until it says otherwise. */
export const LET_IN_AFTER_MIN = 5;

/** The server's VISIT_STATUSES (visitors.js) — the log's status filter accepts exactly these. */
export const VISIT_STATUSES = ['pending', 'approved', 'rejected', 'no_response', 'checked_out'] as const;

/** The server returns at most this many log rows (visitors.js:594 `.limit(2000)`). */
export const LOG_LIMIT = 2000;

const PRIVATE = { persist: false } as const;

export const deskKeys = {
  // Under ['inbox', 'desk', …]: the Inbox's focus refresh, pull to refresh and one-minute poll cover it.
  today: (userId?: string) => ['inbox', 'desk', userId] as const,
  logAll: (userId?: string) => ['desk-log', userId] as const,
  log: (userId: string | undefined, f: VisitorLogFilter) => ['desk-log', userId, f.from, f.to, f.status, f.q, f.by] as const,
  qr: (userId?: string) => ['desk-qr', userId] as const,
};

/** The server's clock minus this phone's (0 when the server sent no time). */
const skewOf = (serverNow?: unknown) => {
  const t = typeof serverNow === 'string' ? Date.parse(serverNow) : NaN;
  return Number.isFinite(t) ? t - Date.now() : 0;
};
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const visitsOf = (x: unknown): Visit[] => (Array.isArray(x) ? x.filter((v): v is Visit => !!v && typeof v === 'object' && typeof v.id === 'string') : []);

/** Fetches today's board. Shared by the Inbox plug-in, Home's hero and the board itself. */
export async function fetchDeskToday(signal?: AbortSignal): Promise<DeskToday> {
  const r = await unwrap(api.get<{ ok: true; visits: Visit[]; stats: Partial<DeskStats>; serverNow?: string; letInAfterMin?: number }>('/visitors/today', signal));
  const s = (r.stats && typeof r.stats === 'object' ? r.stats : {}) as Partial<DeskStats>;
  return {
    visits: visitsOf(r.visits),
    stats: { total: num(s.total), waiting: num(s.waiting), inside: num(s.inside), rejected: num(s.rejected), noResponse: num(s.noResponse), letIn: num(s.letIn) },
    letInAfterMin: num(r.letInAfterMin) || LET_IN_AFTER_MIN,
    skewMs: skewOf(r.serverNow),
  };
}

/** Today's board. `poll` refetches every 10 s (the web's interval) — pass "is the screen focused". */
export function useDeskToday({ enabled = true, poll = false }: { enabled?: boolean; poll?: boolean } = {}) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: deskKeys.today(userId),
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => fetchDeskToday(signal),
    refetchInterval: poll ? 10_000 : false,
    meta: PRIVATE,
  });
}

export function useVisitorLog(filter: VisitorLogFilter, enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: deskKeys.log(userId, filter),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const p = new URLSearchParams();
      if (filter.from) p.set('from', filter.from);
      if (filter.to) p.set('to', filter.to);
      if (filter.status) p.set('status', filter.status);
      if (filter.q.trim()) p.set('q', filter.q.trim().slice(0, 60));
      if (filter.by) p.set('by', filter.by);
      const r = await unwrap(api.get<{ ok: true; visits: Visit[] }>(`/visitors/log?${p.toString()}`, signal));
      return visitsOf(r.visits);
    },
    // Keep the last list on screen while a new filter loads (no flash of skeleton per keystroke).
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    meta: PRIVATE,
  });
}

/** Everything a desk change can make stale: the board, the log, and the host's own lists. */
function useRefreshDesk() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: deskKeys.today(userId) }),
      qc.invalidateQueries({ queryKey: deskKeys.logAll(userId) }),
      qc.invalidateQueries({ queryKey: ['inbox', 'visitors'] }),
      qc.invalidateQueries({ queryKey: visitorKeys.mine(userId) }),
    ]);
}

/**
 * Let in / turn away for the host (POST /visitors/:id/decide), recorded as the desk user. Turn away
 * works at any time and WhatsApps the visitor (visitorRejected). Let in works only once the visitor has
 * waited letInAfterMin minutes (else a 409 in the server's words) and is 'desk_override'; nobody is
 * messaged then (visitors.js decideVisit). Another 409 means someone already decided — the lists
 * reload either way, as on the web.
 */
export function useDeskDecide() {
  const refresh = useRefreshDesk();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) =>
      unwrap(api.post<{ ok: true; id: string; status: string; via?: string }>(`/visitors/${encodeURIComponent(id)}/decide`, { decision })),
    onSettled: refresh,
  });
}

/** Check a visitor out (no undo; nobody is messaged). Offer it only for approved visits still inside. */
export function useCheckOut() {
  const refresh = useRefreshDesk();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.post<{ ok: true; id: string; status: string }>(`/visitors/${encodeURIComponent(id)}/check-out`, {})),
    onSettled: refresh,
  });
}

/** The check-in link (GET /visitors/qr). The first call ever mints the company's token. */
export function useDeskQr(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: deskKeys.qr(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ ok: true } & Partial<DeskQr>>('/visitors/qr', signal));
      if (typeof r.path !== 'string' || !r.path) throw new Error('Could not load the check-in link.');
      return { tenantId: String(r.tenantId ?? ''), token: String(r.token ?? ''), path: r.path, companyName: String(r.companyName ?? '') } satisfies DeskQr;
    },
    staleTime: 5 * 60_000,
    meta: PRIVATE,
  });
}

/** A new check-in link: the old one (every printed poster, saved QR and running kiosk) stops working. */
export function useRegenerateQr() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  return useMutation({
    mutationFn: () => unwrap(api.post<{ ok: true; token: string; path: string }>('/visitors/qr/regenerate', {})),
    onSettled: () => qc.invalidateQueries({ queryKey: deskKeys.qr(userId) }),
  });
}

/** The public check-in page for a QR path ('/visit/<tenant>/<token>') on this app's DASH server. */
export const checkInUrl = (path?: string | null) => (typeof path === 'string' && path.startsWith('/') ? `${DASH_URL}${path}` : '');

// ── Kiosk mode (web: VisitorKioskPage / VisitKioskOverlay / VisitWizard, dash.html:35318-35922) ─────
// The kiosk is the PUBLIC check-in wizard on a desk phone: it calls the same /public/visit/<tenant>/<token>
// routes a visitor's own phone would (visitors.js:305-530), with the token from GET /visitors/qr. These
// routes never sign anyone out (the server ignores the bearer on them, server.js:1451), they're answered
// by the demo server in the demo, and none of them is cached: visitor names, phones and photos stay in
// memory only. Leaving the kiosk checks the desk user's own DASH password (POST /visitors/kiosk/exit).
//
//   GET  base/employees?q          ≥ 2 letters → { employees ≤ 25, companyName }; no q = "is the link valid"
//   POST base                      { hostUserId, visitorName, visitorMobile, purpose, photo, consent, source:'kiosk' }
//                                  → { visitId, status:'pending', hostName, hostHasMobile }  (WhatsApps the host)
//   GET  base/status/:visitId      → { status, hostName }
//   POST base/invite               { code } → { inviteId, guestName, hostName, timeFrom, timeTo }  (today's only)
//   POST base/invite/:id/arrive    { photo } → { visitId, status:'approved', hostName }  (WhatsApps the host)
// Limits are per network address: 10 check-ins and 12 codes per 10 min, 60 lookups per min (429).

export type KioskHost = { id: string; name: string; jobTitle: string; dept: string };
export type KioskInvite = { inviteId: string; guestName: string; hostName: string; timeFrom: string; timeTo: string };
export type KioskVisit = { visitId: string; status: string; hostName: string; hostHasMobile: boolean };

/** What went wrong on a public call, so the kiosk can say it plainly. */
export type KioskProblem = 'link' | 'busy' | 'offline' | 'other';

export class KioskError extends Error {
  problem: KioskProblem;
  constructor(message: string, status?: number) {
    super(message || 'Something went wrong. Please try again.');
    // 404 from requirePublicTenant = the token was rotated (Make a new link) or is wrong; only that
    // message, because visit / invite 404s carry their own words.
    this.problem =
      status === 404 && /check-in link is not valid/i.test(message) ? 'link' : status === 429 ? 'busy' : status == null ? 'offline' : 'other';
  }
}

/** The public base path for a kiosk, from GET /visitors/qr. */
export const kioskBase = (qr: Pick<DeskQr, 'tenantId' | 'token'>) => `/public/visit/${encodeURIComponent(qr.tenantId)}/${encodeURIComponent(qr.token)}`;

// apiFetch, not api.post: api.post adds the desk user's id to the body, and a visitor's check-in is theirs.
async function kioskCall<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const r = await apiFetch<T>(path, { method, body, signal });
  if (isApiError(r)) throw new KioskError(r.error, r.status);
  return r;
}

const strOf = (v: unknown) => (typeof v === 'string' ? v : '');

/** Checks the link and learns the company name (the wizard's first call, no q). */
export async function kioskCheckLink(base: string, signal?: AbortSignal) {
  const r = await kioskCall<{ companyName?: string }>(`${base}/employees`, 'GET', undefined, signal);
  return { companyName: strOf(r.companyName) };
}

/** People whose name contains `q` (≥ 2 letters, else none), at most 25. Name and job title only. */
export async function kioskFindHosts(base: string, q: string, signal?: AbortSignal): Promise<KioskHost[]> {
  const needle = q.trim().slice(0, 60);
  if (needle.length < 2) return [];
  const r = await kioskCall<{ employees?: unknown }>(`${base}/employees?q=${encodeURIComponent(needle)}`, 'GET', undefined, signal);
  const list = Array.isArray(r.employees) ? r.employees : [];
  return list
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as { id?: unknown }).id === 'string')
    .map((e) => ({ id: String(e.id), name: strOf(e.name) || 'Someone', jobTitle: strOf(e.jobTitle), dept: strOf(e.dept) }))
    .slice(0, 25);
}

export type KioskCheckIn = { hostUserId: string; visitorName: string; visitorMobile: string; purpose: string; photo: string };

/** Sends the check-in: the host gets a WhatsApp with the photo. */
export async function kioskCheckIn(base: string, b: KioskCheckIn): Promise<KioskVisit> {
  const r = await kioskCall<Partial<KioskVisit>>(base, 'POST', { ...b, consent: true, source: 'kiosk' });
  if (!strOf(r.visitId)) throw new KioskError('The check-in didn’t go through. Please try again.');
  return { visitId: strOf(r.visitId), status: strOf(r.status) || 'pending', hostName: strOf(r.hostName), hostHasMobile: !!r.hostHasMobile };
}

/** Polled every 5 s while the visitor waits (the web's interval). */
export async function kioskStatus(base: string, visitId: string, signal?: AbortSignal) {
  const r = await kioskCall<{ status?: string; hostName?: string }>(`${base}/status/${encodeURIComponent(visitId)}`, 'GET', undefined, signal);
  return { status: strOf(r.status) || 'pending', hostName: strOf(r.hostName) };
}

/** Looks up today's invite code. */
export async function kioskInviteCode(base: string, code: string): Promise<KioskInvite> {
  const r = await kioskCall<Partial<KioskInvite>>(`${base}/invite`, 'POST', { code });
  return { inviteId: strOf(r.inviteId), guestName: strOf(r.guestName) || 'Guest', hostName: strOf(r.hostName), timeFrom: strOf(r.timeFrom), timeTo: strOf(r.timeTo) };
}

/** An invited guest arrives: the visit is approved at once and the host gets a WhatsApp. Single use. */
export async function kioskInviteArrive(base: string, inviteId: string, photo: string) {
  const r = await kioskCall<{ visitId?: string; hostName?: string }>(`${base}/invite/${encodeURIComponent(inviteId)}/arrive`, 'POST', { photo });
  return { visitId: strOf(r.visitId), hostName: strOf(r.hostName) };
}

// ── The lobby board on the kiosk (web: VisitKioskBoard, dash.html:36166) ─────────────────────────
// GET /visitors/kiosk/board (the desk session, not the public token): who is still waiting for their
// host, and who was answered in the last 5 minutes and is not checked out. A public screen, so the server
// sends only "First L.", the host's first name, a status and a time. Polled every 5 s while the kiosk runs.

export type KioskBoardWaiting = { id: string; name: string; host: string; createdAt: string };
export type KioskBoardRecent = { id: string; name: string; host: string; status: string; at: string; letIn: boolean };
export type KioskBoard = { waiting: KioskBoardWaiting[]; recent: KioskBoardRecent[]; skewMs: number };

const rowsOf = (x: unknown) =>
  Array.isArray(x) ? x.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string') : [];

export async function fetchKioskBoard(signal?: AbortSignal): Promise<KioskBoard> {
  const r = await unwrap(api.get<{ ok: true; waiting?: unknown; recent?: unknown; serverNow?: string }>('/visitors/kiosk/board', signal));
  return {
    waiting: rowsOf(r.waiting).map((w) => ({ id: String(w.id), name: strOf(w.name) || 'Visitor', host: strOf(w.host), createdAt: strOf(w.createdAt) })),
    recent: rowsOf(r.recent).map((w) => ({ id: String(w.id), name: strOf(w.name) || 'Visitor', host: strOf(w.host), status: strOf(w.status), at: strOf(w.at), letIn: w.letIn === true })),
    skewMs: skewOf(r.serverNow),
  };
}

/** The kiosk's board, every 5 s (the web's interval). Never cached: visitor names stay in memory. */
export function useKioskBoard(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['kiosk', 'board', userId],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => fetchKioskBoard(signal),
    refetchInterval: 5_000,
    gcTime: 0,
    meta: PRIVATE,
  });
}

/** Leave kiosk mode with the desk user's DASH password. 403 = wrong password (never 401: no sign-out).
 *  api.post, like the web's apiPost (dash.html:35880): the desk user's own call, so the body carries the actor. */
export async function kioskExit(password: string) {
  const r = await api.post<{ ok: true }>('/visitors/kiosk/exit', { password });
  if (isApiError(r)) throw new KioskError(r.error, r.status);
  return true;
}
