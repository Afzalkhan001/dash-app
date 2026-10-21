// My Tasks (web: MyTasks, dash.html ~L26572) and the in-app Start/Completion codes
// (PendingOtpBanner ~L26184). Server: routes/tasks.js, routes/bookings.js, routes/dashboard.js.
//
//   GET  /tasks                          → every task in the company; the web keeps assignee === my name
//   PUT  /tasks/:id                      → start / pause / resume / end (body exactly as the web's doAct)
//   POST /tasks                          → a booking's first Start creates its task (doActBk)
//   POST /tasks/:id/request-otp          { type: 'start' | 'submit' }   code is shown on the requester's Home
//   POST /tasks/:id/verify-otp           { type, otp }
//   POST /bookings/:id/request-otp|verify-otp   same, for a booking that has no task yet
//   GET  /bookings?since=YYYY-MM-DD      → professional bookings assigned to me (approved ones with no task)
//   POST /bookings/:id/release-remaining { excludeTaskId }   POST /bookings/:id/reclaim-remaining {}
//   PUT  /bookings/:id                   { status: 'pending_review', markedDoneBy, markedDoneAt }
//   PUT  /tickets/:id                    { status: 'resolved', resolvedBy, resolvedAt }   (IT ticket tasks)
//   PUT  /users/:id                      { availability: 'busy' | 'available' }
//   GET  /my_pending_otps                → codes I must read out to someone (I raised / requested / created it)

import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';
import { todayIst } from '@/lib/dates';

export type Task = {
  id: string;
  title?: string;
  assignee?: string;
  assigneeId?: string;
  project?: string;
  kekaCode?: string;
  status?: string; // pending | in_progress | submitted | completed | reviewed | rejected …
  dept?: string | null;
  source?: string; // booking | ticket | resource_request | (manual)
  category?: string;
  ticketId?: string;
  bookingId?: string;
  bookingDate?: string;
  startDate?: string;
  endDate?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  requestedBy?: string;
  requesterName?: string;
  requesterPhone?: string;
  requesterEmail?: string;
  creator?: string;
  desc?: string;
  comments?: string;
  reason?: string;
  shootingLocation?: string;
  rejectionNote?: string;
  approvedBy?: string;
  completionRemarks?: string;
  completedBy?: string;
  completedAt?: string;
  createdAt?: string;
  elapsedSeconds?: number;
  startedAt?: string | null;
  firstStartedAt?: string | null;
  lastEndedAt?: string | null;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  referenceLink?: string;
  resourceRequestId?: string;
  [k: string]: unknown;
};

export type Booking = {
  id: string;
  type?: string;
  status?: string;
  resource?: string;
  resourceId?: string;
  requestedBy?: string;
  date?: string;
  dates?: string[];
  startTime?: string;
  endTime?: string;
  project?: string;
  kekaCode?: string;
  comments?: string;
  shootingLocation?: string;
  profDept?: string | null;
  createdAt?: string;
  [k: string]: unknown;
};

export type Client = { id: string; name?: string; phone?: string; email?: string };

export type PendingOtp = {
  key: string;
  otp: { type: 'start' | 'submit'; code: string; generatedAt?: string; expiresAt: number };
  assignee: string;
  title: string;
};

export const taskKeys = {
  mine: (userId?: string) => ['tasks-mine', userId] as const,
  bookings: (userId?: string) => ['tasks-bookings', userId] as const,
  clients: (userId?: string) => ['tasks-clients', userId] as const,
  otps: (userId?: string) => ['tasks-otps', userId] as const,
};

// Safety net for "one request shows up as several tasks" — several old rows can share a ticketId;
// keep the most advanced (then newest) one. Same as the web's dedupeByTicket.
export function dedupeByTicket(list: Task[]) {
  const rank = (s?: string) => ({ completed: 3, submitted: 2, in_progress: 1, pending: 0 } as Record<string, number>)[s || ''] ?? 0;
  const best = new Map<string, Task>();
  for (const t of list) {
    if (!t.ticketId) continue;
    const prev = best.get(t.ticketId);
    if (!prev || rank(t.status) > rank(prev.status) || (rank(t.status) === rank(prev.status) && t.id > prev.id)) best.set(t.ticketId, t);
  }
  const seen = new Set<string>();
  return list.filter((t) => {
    if (!t.ticketId) return true;
    if (best.get(t.ticketId) !== t || seen.has(t.ticketId)) return false;
    seen.add(t.ticketId);
    return true;
  });
}

// The whole company's task list comes down (there is no per-person route), so only mine is kept.
export async function fetchMyTasks(name: string, signal?: AbortSignal) {
  const all = await unwrap(api.get<Task[]>('/tasks', signal));
  return dedupeByTicket((Array.isArray(all) ? all : []).filter((t) => t && t.assignee === name));
}

// Exact key of my task list (the task flow writes optimistic updates into it). Invalidate with
// taskKeys.mine(userId) — it is a prefix of this.
export const myTasksKey = (userId?: string, name?: string) => [...taskKeys.mine(userId), name || ''] as const;

export function useMyTasks() {
  const userId = useSession((s) => s.user?.id);
  const name = useSession((s) => s.user?.name) || '';
  return useQuery({
    queryKey: myTasksKey(userId, name),
    enabled: !!userId && !!name,
    queryFn: ({ signal }) => fetchMyTasks(name, signal),
    staleTime: 60_000,
  });
}

const daysAgoIst = (n: number) => {
  const d = new Date(`${todayIst()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

// Professional bookings where I am the professional. Used for: approved bookings that have no task
// row yet (Start creates it), hiding tasks whose booking was rejected, and the Keka Code of booking
// tasks created without one. Limited to recent dates (the web reads the whole table).
export function useMyProBookings(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  const name = useSession((s) => s.user?.name) || '';
  return useQuery({
    queryKey: [...taskKeys.bookings(userId), name],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const all = await unwrap(api.get<Booking[]>(`/bookings?since=${daysAgoIst(60)}`, signal));
      return (Array.isArray(all) ? all : []).filter(
        (b) => b && b.type === 'professionals' && (b.resourceId === userId || (!!name && b.resource === name)),
      );
    },
    staleTime: 60_000,
  });
}

export function useClients(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: taskKeys.clients(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<Client[]>('/clients', signal));
      return (Array.isArray(r) ? r : []).map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }));
    },
    staleTime: 10 * 60_000,
  });
}

// Codes waiting on ME to read out. The server returns only this person's live codes; expired ones
// are dropped here too so a stale cache never shows one.
export function usePendingOtps({ poll = true }: { poll?: boolean } = {}) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: taskKeys.otps(userId),
    enabled: !!userId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<PendingOtp[]>('/my_pending_otps', signal));
      return Array.isArray(r) ? r : [];
    },
    select: (list) => list.filter((p) => p?.otp && Number(p.otp.expiresAt) > Date.now()),
    refetchInterval: poll ? 20_000 : false,
    staleTime: 10_000,
  });
}

// ── writes (no hooks: the task flow applies these optimistically, like the web) ──────────────────
export const putTask = (id: string, body: Record<string, unknown>) => api.put<{ ok: true }>(`/tasks/${encodeURIComponent(id)}`, body);
export const postTask = (task: Record<string, unknown>) => api.post<{ ok: true; task: Task; deduped?: boolean }>('/tasks', task);

export type OtpMode = 'task' | 'booking';
export const requestOtp = (mode: OtpMode, id: string, type: 'start' | 'submit') =>
  api.post<{ ok: true; requested: true }>(`/${mode === 'booking' ? 'bookings' : 'tasks'}/${encodeURIComponent(id)}/request-otp`, { type });
export const verifyOtp = (mode: OtpMode, id: string, type: 'start' | 'submit', otp: string) =>
  api.post<{ ok: true; verified: true }>(`/${mode === 'booking' ? 'bookings' : 'tasks'}/${encodeURIComponent(id)}/verify-otp`, { type, otp });

export const setAvailability = (userId: string, availability: 'busy' | 'available') =>
  api.put<{ ok: true }>(`/users/${encodeURIComponent(userId)}`, { availability });

export const releaseRemaining = (bookingId: string, excludeTaskId: string) =>
  api.post(`/bookings/${encodeURIComponent(bookingId)}/release-remaining`, { excludeTaskId });
export const reclaimRemaining = (bookingId: string) => api.post(`/bookings/${encodeURIComponent(bookingId)}/reclaim-remaining`, {});
export const putBooking = (bookingId: string, body: Record<string, unknown>) => api.put(`/bookings/${encodeURIComponent(bookingId)}`, body);
export const resolveTicket = (ticketId: string, by: string) =>
  api.put<{ ok: true }>(`/tickets/${encodeURIComponent(ticketId)}`, { status: 'resolved', resolvedBy: by, resolvedAt: new Date().toISOString() });
