// Service desk (web: ServiceDesk dash.html:21036–21410, ITTaskOnBehalf dash.html:6842–6987). Server:
// routes/tickets.js, routes/tasks.js. Existing endpoints only.
//
//   GET  /tickets               → every ticket in the company (tenant only; the slice is the app's job,
//                                 features/servicedesk/access baseItems)
//   GET  /tasks                 → the tasks behind tickets (source 'ticket'): a completed one shows its
//                                 ticket as resolved (reconcileTickets, display only — the website's
//                                 write-back "heal" and orphan-task "System Repair" are NOT ported)
//   GET  /departments, /users   → the IT & Admin department: its members (who can be assigned) and
//                                 its adminId (who approves asset requests)
//   GET  /whitelist             → people invited but not signed up yet (Raise for someone)
//   POST /tasks                 { id, title, desc, assignee: NAME, creator, status: 'pending', source:
//                                 'ticket', ticketId, startDate, requester…, dept, kekaCode, urgency,
//                                 category }  — de-duplicated by ticketId; emails + WhatsApps the assignee
//   PUT  /tickets/:id           { status: 'in_progress', assignedTo: NAME, acceptedAt, approvedBy?, approvedAt? }
//                               { status, statusUpdatedBy, statusUpdatedAt, acceptedAt? | resolvedAt? }
//                                 (admin requests / complaints: the raiser is messaged on every change)
//   POST /tickets/:id/reject    { performedById, reason }  — 409 when already rejected / cancelled / resolved
//   POST /tickets               the full record, raised on someone's behalf (identityFor dash.html:6862)
//
// Every list here is the whole company's (complaints included), so none of it is kept on the phone's
// disk (meta.persist false).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { Ticket } from '@/api/support';
import { useSession } from '@/auth/session';
import { todayIst } from '@/lib/dates';

/** A ticket as the desk reads it (routes/tickets.js stores the client's record as sent). */
export type DeskTicket = Ticket & {
  deptName?: string;
  raisedOnBehalfBy?: string;
  raisedOnBehalfById?: string;
  approvedBy?: string;
  approvedAt?: string;
  statusUpdatedBy?: string;
  statusUpdatedAt?: string;
  rejectedById?: string;
  /** Set by reconcileTickets: shown as resolved because its task is completed. */
  _resolvedFromTask?: boolean;
};

/** The parts of a ticket's task the desk reads (GET /tasks is large; only these are kept). */
export type TicketTask = { id: string; ticketId: string; status: string; completedAt?: string; completedBy?: string; assignee?: string };

export type DeskDepartment = { id: string; name: string; adminId?: string | null };

/** A whitelist row (people invited to DASH who may not have signed up yet). */
export type WhitelistPerson = { id: string; name?: string; email?: string; role?: string; dept?: string; deptName?: string; mobile?: string; phone?: string };

export const deskKeys = {
  // Under the Inbox prefix, so the Inbox's focus refresh, pull to refresh and one-minute poll cover it.
  tickets: (userId?: string) => ['inbox', 'desk-it', userId ?? '', 'tickets'] as const,
  departments: (userId?: string) => ['servicedesk', 'departments', userId ?? ''] as const,
  tasks: (userId?: string) => ['servicedesk', 'ticket-tasks', userId ?? ''] as const,
  whitelist: (userId?: string) => ['servicedesk', 'whitelist', userId ?? ''] as const,
};

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** GET /tickets — the whole company's tickets (rows that aren't objects are dropped). */
export function useDeskTickets(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: deskKeys.tickets(userId),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }): Promise<DeskTicket[]> => {
      const r = await unwrap(api.get<DeskTicket[]>('/tickets', signal));
      if (!Array.isArray(r)) throw new Error('The service desk could not be loaded.');
      return r.filter((t): t is DeskTicket => !!t && typeof t === 'object' && typeof t.id === 'string' && !!t.id);
    },
    staleTime: 30_000,
  });
}

/** GET /tasks, slimmed to the tasks raised from tickets (for reconcileTickets). */
export function useTicketTasks(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: deskKeys.tasks(userId),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }): Promise<TicketTask[]> => {
      const r = await unwrap(api.get<Record<string, unknown>[]>('/tasks', signal));
      if (!Array.isArray(r)) return [];
      return r
        .filter((k) => !!k && typeof k === 'object' && k.source === 'ticket' && !!k.ticketId)
        .map((k) => ({
          id: str(k.id),
          ticketId: str(k.ticketId),
          status: str(k.status),
          completedAt: str(k.completedAt) || undefined,
          completedBy: str(k.completedBy) || undefined,
          assignee: str(k.assignee) || undefined,
        }));
    },
    staleTime: 2 * 60_000,
  });
}

/** GET /departments with the admin of each (the IT & Admin department's admin approves assets). */
export function useDeskDepartments(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: deskKeys.departments(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }): Promise<DeskDepartment[]> => {
      const r = await unwrap(api.get<Record<string, unknown>[]>('/departments', signal));
      return (Array.isArray(r) ? r : [])
        .filter((d) => !!d && typeof d === 'object' && d.id != null)
        .map((d) => ({ id: str(d.id), name: str(d.name), adminId: d.adminId ? str(d.adminId) : null }));
    },
    staleTime: 10 * 60_000,
  });
}

/** GET /whitelist — invited people, for "Raise for someone" (contact details: never on disk). */
export function useWhitelist(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: deskKeys.whitelist(userId),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }): Promise<WhitelistPerson[]> => {
      const r = await unwrap(api.get<Record<string, unknown>[]>('/whitelist', signal));
      return (Array.isArray(r) ? r : [])
        .filter((w) => !!w && typeof w === 'object' && w.id != null)
        .map((w) => ({
          id: str(w.id),
          name: str(w.name) || undefined,
          email: str(w.email) || undefined,
          role: str(w.role) || undefined,
          dept: str(w.dept) || undefined,
          deptName: str(w.deptName) || undefined,
          mobile: str(w.mobile) || undefined,
          phone: str(w.phone) || undefined,
        }));
    },
    staleTime: 10 * 60_000,
  });
}

/**
 * dash.html:20999 reconcileTickets — a ticket whose (latest completed) task is completed reads as
 * resolved. Rejected, cancelled and already-resolved tickets are left exactly as they are. Display
 * only: the app never writes the correction back.
 */
export function reconcileTickets<T extends DeskTicket>(tickets: T[], tasks: TicketTask[] | undefined): T[] {
  const done = new Map<string, TicketTask>();
  for (const k of Array.isArray(tasks) ? tasks : []) {
    if (!k || k.status !== 'completed' || !k.ticketId) continue;
    const prev = done.get(k.ticketId);
    if (!prev || String(k.completedAt || '') > String(prev.completedAt || '')) done.set(k.ticketId, k);
  }
  return (Array.isArray(tickets) ? tickets : []).map((t) => {
    const k = done.get(t.id);
    if (!k) return t;
    if (t.status === 'resolved' || t.status === 'rejected' || t.status === 'cancelled') return t;
    return {
      ...t,
      status: 'resolved',
      resolvedBy: t.resolvedBy || k.completedBy || k.assignee || t.assignedTo || '',
      resolvedAt: t.resolvedAt || k.completedAt || '',
      _resolvedFromTask: true,
    };
  });
}

/** The task title the website gives a ticket's task (dash.html:21268). */
export const taskTitleFor = (t: DeskTicket) => (t.category === 'ticket' ? t.subject || 'IT Support Task' : `${t.quantity}x ${t.assetType} — Asset Request`);

/** Thrown when the task was created but the ticket could not be marked as assigned. */
export class HalfAssignedError extends Error {
  constructor(
    public assignee: string,
    message: string,
  ) {
    super(message);
  }
}

function useInvalidateDesk() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: deskKeys.tickets(userId) }),
      qc.invalidateQueries({ queryKey: deskKeys.tasks(userId) }),
      // The employee's own Support list and My Tasks (the assignee may be the viewer).
      qc.invalidateQueries({ queryKey: ['support-tickets'] }),
      qc.invalidateQueries({ queryKey: ['tasks-mine'] }),
    ]);
}

/**
 * Accept & assign / Approve & assign (dash.html:21261 acceptAndAssign): create the task first —
 * if that fails nothing else happens — then mark the ticket in progress with the assignee's NAME
 * (an asset still waiting for approval also gets approvedBy / approvedAt: this one step IS the
 * approval). When the second write fails the task already exists: HalfAssignedError says so.
 */
export function useAssignTicket() {
  const user = useSession((s) => s.user);
  const invalidate = useInvalidateDesk();
  return useMutation({
    mutationFn: async ({ ticket: t, assignee }: { ticket: DeskTicket; assignee: string }) => {
      const now = new Date().toISOString();
      const task = {
        id: `tk${Date.now()}`,
        title: taskTitleFor(t),
        desc: t.desc || t.reason || '',
        assignee,
        creator: user?.name || 'IT Admin',
        status: 'pending',
        source: 'ticket',
        ticketId: t.id,
        startDate: todayIst(),
        timestamps: {},
        requesterName: t.from || t.raisedByName || '',
        requesterPhone: t.fromPhone || '',
        requesterEmail: t.fromEmail || '',
        dept: t.dept || t.deptName || '',
        kekaCode: t.kekaCode || '',
        urgency: t.urgency || t.priority || '',
        category: t.category || '',
      };
      const res = await unwrap(api.post<{ ok?: boolean; task?: { id?: string }; deduped?: boolean }>('/tasks', task));
      const approval = t.category === 'asset' && t.status === 'pending_approval';
      const upd = { status: 'in_progress', assignedTo: assignee, acceptedAt: now, ...(approval ? { approvedBy: user?.name || '', approvedAt: now } : {}) };
      try {
        await unwrap(api.put<{ ok: true }>(`/tickets/${encodeURIComponent(t.id)}`, upd));
      } catch (e) {
        throw new HalfAssignedError(assignee, (e instanceof Error && e.message) || 'The ticket could not be updated.');
      }
      return { deduped: !!res?.deduped, approval };
    },
    onSettled: () => invalidate(),
  });
}

/** Reject with the reason the requester sees (POST /tickets/:id/reject; performedById is added by the client). */
export function useRejectTicket() {
  const invalidate = useInvalidateDesk();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      unwrap(api.post<{ ok?: boolean; ticket?: DeskTicket }>(`/tickets/${encodeURIComponent(id)}/reject`, { reason: reason.trim() })),
    onSettled: () => invalidate(),
  });
}

/** An admin request's / complaint's status (dash.html:21224 updateReqStatus). */
export function useSetRequestStatus() {
  const user = useSession((s) => s.user);
  const invalidate = useInvalidateDesk();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => {
      const now = new Date().toISOString();
      const upd: Record<string, string> = { status, statusUpdatedBy: user?.name || '', statusUpdatedAt: now };
      if (status === 'in_progress') upd.acceptedAt = now;
      if (status === 'resolved') upd.resolvedAt = now;
      return unwrap(api.put<{ ok: true }>(`/tickets/${encodeURIComponent(id)}`, upd));
    },
    onSettled: () => invalidate(),
  });
}

/** Raise a ticket / asset request on someone's behalf (POST /tickets, the record as the website builds it). */
export function useRaiseForSomeone() {
  const invalidate = useInvalidateDesk();
  return useMutation({
    mutationFn: (record: DeskTicket) => unwrap(api.post<{ ok?: boolean; t?: DeskTicket }>('/tickets', record)),
    onSettled: () => invalidate(),
  });
}
