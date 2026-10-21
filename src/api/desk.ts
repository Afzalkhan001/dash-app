// The visitor desk (visitors.js DESK section, :556-665): the reception side of Visitor Management.
// Only `visitor_manager` and `super_admin` may call these (server DESK_ROLES; features/desk/access.ts).
//
//   GET  /visitors/today              → { visits: Visit[], stats: { total, waiting, inside, rejected, noResponse } }
//                                       tenant-wide, work_date = today (IST), newest first
//   GET  /visitors/log?from&to&status&q → { visits: Visit[] }  (on work_date, newest first, max 2000)
//   POST /visitors/:id/check-out      {} → { id, status: 'checked_out' }   (409 when already out; no undo)
//   POST /visitors/:id/decide         { decision }  (the host OR a desk role; WhatsApps the visitor)
//   GET  /visitors/qr                 → { tenantId, token, path, companyName }   (mints the token on first call)
//   POST /visitors/qr/regenerate      {} → { token, path }   (every printed poster and running kiosk stops working)
//
// Privacy (spec §7.9): the desk shows every visitor's face and mobile, so none of these reads is written
// to the persisted query cache (meta: { persist: false }) — a lobby phone keeps nothing on disk.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { type Visit, visitorKeys } from '@/api/visitors';
import { useSession } from '@/auth/session';
import { DASH_URL } from '@/config';

export type DeskStats = { total: number; waiting: number; inside: number; rejected: number; noResponse: number };
export type DeskToday = { visits: Visit[]; stats: DeskStats };
export type DeskQr = { tenantId: string; token: string; path: string; companyName: string };
export type VisitorLogFilter = { from: string; to: string; status: string; q: string };

/** The server's VISIT_STATUSES (visitors.js) — the log's status filter accepts exactly these. */
export const VISIT_STATUSES = ['pending', 'approved', 'rejected', 'no_response', 'checked_out'] as const;

/** The server returns at most this many log rows (visitors.js:594 `.limit(2000)`). */
export const LOG_LIMIT = 2000;

const PRIVATE = { persist: false } as const;

export const deskKeys = {
  // Under ['inbox', 'desk', …]: the Inbox's focus refresh, pull to refresh and one-minute poll cover it.
  today: (userId?: string) => ['inbox', 'desk', userId] as const,
  logAll: (userId?: string) => ['desk-log', userId] as const,
  log: (userId: string | undefined, f: VisitorLogFilter) => ['desk-log', userId, f.from, f.to, f.status, f.q] as const,
  qr: (userId?: string) => ['desk-qr', userId] as const,
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const visitsOf = (x: unknown): Visit[] => (Array.isArray(x) ? x.filter((v): v is Visit => !!v && typeof v === 'object' && typeof v.id === 'string') : []);

/** Fetches today's board. Shared by the Inbox plug-in, Home's hero and the board itself. */
export async function fetchDeskToday(signal?: AbortSignal): Promise<DeskToday> {
  const r = await unwrap(api.get<{ ok: true; visits: Visit[]; stats: Partial<DeskStats> }>('/visitors/today', signal));
  const s = (r.stats && typeof r.stats === 'object' ? r.stats : {}) as Partial<DeskStats>;
  return {
    visits: visitsOf(r.visits),
    stats: { total: num(s.total), waiting: num(s.waiting), inside: num(s.inside), rejected: num(s.rejected), noResponse: num(s.noResponse) },
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
 * Let in / turn away for the host (POST /visitors/:id/decide). Recorded as the desk user, and the
 * visitor gets a WhatsApp (visitorApproved / visitorRejected). A 409 means someone already decided —
 * the lists reload either way, as on the web.
 */
export function useDeskDecide() {
  const refresh = useRefreshDesk();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) =>
      unwrap(api.post<{ ok: true; id: string; status: string }>(`/visitors/${encodeURIComponent(id)}/decide`, { decision })),
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
