// The Inbox's server calls — everything waiting on the signed-in person to decide, asked for exactly
// the way the website asks:
//
//   HR approvals   dash.html ApprovalsPanel (~4798) over HR_APPROVAL_KINDS (lib/access.ts). One list
//                  per kind: GET <list>?status=<s> → { requests }. Decided with POST <decide>
//                  { decision: 'approve' | 'reject', note } — hr_common.js readDecision: the note is
//                  trimmed to 500 chars and must be at least 3 when rejecting. Handlers: hr_time.js
//                  (regularizations), hr_leave.js (leave / WFH / comp-off), hr_payroll.js (claims, loans).
//                  The server never lists your own pending requests, and refuses to let you decide them.
//   Keka claims    dash.html ReimbursementApprovals (~33621), shown to Cost Code owners
//                  (isKekaCodeOwner ~1424: some project's empNo is my employeeNumber || kekaCode), and
//                  to anyone Expense claims already found claims for (features/inbox/use-inbox).
//                  GET /reimbursements/keka-all → { reimbursements } (every status), POST
//                  /:id/keka-approve {} or /:id/keka-reject { reason }; GET /:id/receipt → { fileData }.
//   Visitors       GET /visitors/mine → { pending, history } (visitors.js). Visitors are let in or
//                  turned away on the Visitors screen; the Inbox only counts and names them.
//
// Everything is cached under ['inbox', …], so the tab badge (features/inbox/use-inbox-count) and the
// Inbox screen share one request per queue.

import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { api, apiFetch, unwrap } from '@/api/client';
import { type StaffUser, useSession } from '@/auth/session';
import { HR_APPROVAL_KINDS } from '@/lib/access';

export const INBOX_POLL_MS = 60_000;

// ── HR approval kinds ────────────────────────────────────────────────────────
export type HrKindDef = (typeof HR_APPROVAL_KINDS)[number];
export type HrKindKey = HrKindDef['key'];
export type HrStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'paid' | 'closed';
export type Decision = 'approve' | 'reject';

export const hrKindDef = (key: string): HrKindDef | undefined => HR_APPROVAL_KINDS.find((k) => k.key === key);
export const isHrKind = (key: string): key is HrKindKey => !!hrKindDef(key);

// The Status filter for each queue — the web's `statuses` (claims and loans have their own).
export function hrStatuses(kind: HrKindKey): HrStatus[] {
  if (kind === 'reimbursements') return ['pending', 'approved', 'rejected', 'paid', 'cancelled'];
  if (kind === 'loans') return ['pending', 'approved', 'rejected', 'closed', 'cancelled'];
  return ['pending', 'approved', 'rejected', 'cancelled'];
}

// One row of any HR queue. The fields are the union of the handlers' public shapes: publicReg
// (hr_time.js), publicReq (hr_leave.js), publicClaim and publicLoan (hr_payroll.js).
export type HrRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  department_id?: string | null;
  status: string;
  created_at?: string;
  decided_by_name?: string | null;
  decided_at?: string | null;
  decision_note?: string;
  reason?: string;
  // regularization
  work_date?: string;
  in_time?: string | null; // 'HH:MM' IST
  out_time?: string | null;
  previous?: { in_at?: string | null; out_at?: string | null; worked_minutes?: number | null; status?: string | null } | null;
  // leave / wfh / comp-off
  kind?: 'leave' | 'wfh' | 'comp_off';
  leave_type_id?: string | null;
  leave_code?: string | null;
  from_date?: string;
  to_date?: string;
  half_day?: 'none' | 'first' | 'second';
  days?: number;
  balance_available?: number | null; // pending leave only: the balance BEFORE this request
  // claims
  category?: string;
  claim_date?: string;
  amount?: number;
  description?: string;
  receipt_ref?: string;
  paid_at?: string | null;
  // loans
  principal?: number;
  emi?: number;
  start_month?: string; // 'YYYY-MM'
  recovered?: number;
  outstanding?: number;
};

// ── Keka Code owner claims ───────────────────────────────────────────────────
export type KekaHistoryEntry = {
  event: string;
  status?: string;
  at?: string;
  byName?: string;
  note?: string;
  amount?: number | string;
  previousAmount?: number | string;
  reference?: string;
  followUp?: boolean;
};

export type KekaReimbursement = {
  id: string;
  employee_id: string;
  employee_name: string;
  keka_code: string;
  project_name?: string;
  keka_owner_user_id?: string;
  keka_owner_name?: string;
  purpose: string;
  amount: number | string;
  status: string;
  receipt_name?: string;
  rejected_stage?: 'keka' | 'accounts' | null;
  rejection_reason?: string | null;
  rejected_by_name?: string | null;
  keka_approved_at?: string | null;
  keka_approved_by_name?: string | null;
  approved_at?: string | null;
  payment?: { startedAt?: string; reference?: string; response?: { at?: string } | null } | null;
  history?: KekaHistoryEntry[];
  created_at: string;
};

// reimbursements.js EVERY_ROLE, less master_admin (no company, never reaches Accounts).
export const KEKA_ROLES = ['super_admin', 'ceo', 'coo', 'admin', 'hr', 'it_admin', 'manager', 'employee', 'professional', 'accounts'];
export const kekaEmpNo = (u?: StaffUser | null) => String((u && (u.employeeNumber || u.kekaCode)) || '').trim();

// The owner's "Awaiting your approval" table: waiting on the Keka stage, and not their own claim.
export const kekaIsPending = (r: KekaReimbursement, userId?: string) => r.status === 'pending_keka_approval' && r.employee_id !== userId;
// …and "Already reviewed": everything past the Keka stage.
export const kekaIsReviewed = (r: KekaReimbursement) => r.status !== 'pending_keka_approval';

// ── Visitors ─────────────────────────────────────────────────────────────────
// dash.html navFor: Visitors is for everyone but the platform owner, the display account and the
// Visitor Manager (who runs the whole desk instead).
export const VISITOR_HIDDEN_ROLES = ['master_admin', 'announcement_viewer', 'visitor_manager'];
export const canSeeVisitors = (u?: StaffUser | null) => !!u && !VISITOR_HIDDEN_ROLES.includes(u.role);

export type WaitingVisitor = {
  id: string;
  visitorName: string;
  visitorMobile?: string;
  purpose?: string;
  source?: string;
  status: string; // 'pending' | 'no_response' (timed out waiting for an answer)
  createdAt: string;
};

// ── Query keys ───────────────────────────────────────────────────────────────
export const inboxKeys = {
  all: ['inbox'] as const,
  hrKind: (kind: HrKindKey) => ['inbox', 'hr', kind] as const,
  hrStatus: (kind: HrKindKey, status: string) => ['inbox', 'hr', kind, status] as const,
  hrList: (kind: HrKindKey, status: string, userId?: string) => ['inbox', 'hr', kind, status, userId ?? ''] as const,
  keka: (userId?: string) => ['inbox', 'keka', userId ?? ''] as const,
  kekaPrefix: ['inbox', 'keka'] as const,
  kekaOwner: (userId: string | undefined, empNo: string) => ['inbox', 'keka-owner', userId ?? '', empNo] as const,
  visitors: (userId?: string) => ['inbox', 'visitors', userId ?? ''] as const,
};

// Polling is not set per query: features/inbox/use-inbox.ts refreshes the pending lists once a
// minute through one shared timer.
type ListOpts = { enabled?: boolean };

// ── Queries ──────────────────────────────────────────────────────────────────
function listPath(def: HrKindDef, status: string) {
  return `${def.list}${def.list.includes('?') ? '&' : '?'}status=${encodeURIComponent(status)}`;
}

export function hrListQuery(kind: HrKindKey, status: string, userId: string | undefined, opts: ListOpts = {}) {
  return queryOptions({
    queryKey: inboxKeys.hrList(kind, status, userId),
    enabled: (opts.enabled ?? true) && !!userId,
    queryFn: async ({ signal }): Promise<HrRequest[]> => {
      const def = hrKindDef(kind);
      if (!def) return [];
      const r = await unwrap(api.get<{ requests?: HrRequest[] }>(listPath(def, status), signal));
      return Array.isArray(r.requests) ? r.requests : [];
    },
  });
}

export function useHrList(kind: HrKindKey, status: string, enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery(hrListQuery(kind, status, userId, { enabled }));
}

// "Do I own a Keka Code?" — GET /projects (the web's boot fetch), reduced to the codes I own so the
// persisted cache never holds the company's whole project list.
export function useKekaOwnership() {
  const user = useSession((s) => s.user);
  const empNo = kekaEmpNo(user);
  const allowed = !!user && KEKA_ROLES.includes(user.role) && !!empNo;
  return useQuery({
    queryKey: inboxKeys.kekaOwner(user?.id, empNo),
    enabled: allowed,
    queryFn: async ({ signal }) => {
      const list = await unwrap(api.get<{ empNo?: unknown; kekaCode?: string; name?: string }[]>('/projects', signal));
      const codes = (Array.isArray(list) ? list : [])
        .filter((p) => !!p && String(p.empNo ?? '').trim() === empNo)
        .map((p) => String(p.kekaCode || p.name || '').trim())
        .filter(Boolean);
      return { owns: codes.length > 0, codes };
    },
    staleTime: 10 * 60_000,
  });
}

export function kekaQuery(userId: string | undefined, opts: ListOpts = {}) {
  return queryOptions({
    queryKey: inboxKeys.keka(userId),
    enabled: (opts.enabled ?? true) && !!userId,
    queryFn: async ({ signal }): Promise<KekaReimbursement[]> => {
      const r = await unwrap(api.get<{ reimbursements?: KekaReimbursement[] }>('/reimbursements/keka-all', signal));
      return Array.isArray(r.reimbursements) ? r.reimbursements : [];
    },
  });
}

export function useKekaQueue(opts: ListOpts = {}) {
  const userId = useSession((s) => s.user?.id);
  return useQuery(kekaQuery(userId, opts));
}

export function visitorsQuery(userId: string | undefined, opts: ListOpts = {}) {
  return queryOptions({
    queryKey: inboxKeys.visitors(userId),
    enabled: (opts.enabled ?? true) && !!userId,
    queryFn: async ({ signal }): Promise<WaitingVisitor[]> => {
      const r = await unwrap(api.get<{ pending?: (WaitingVisitor & Record<string, unknown>)[] }>('/visitors/mine', signal));
      // Only who is waiting. The history and the signed photo URLs (they expire within the hour) are
      // the Visitors screen's business.
      return (Array.isArray(r.pending) ? r.pending : []).map((v) => ({
        id: v.id,
        visitorName: v.visitorName,
        visitorMobile: v.visitorMobile,
        purpose: v.purpose,
        source: v.source,
        status: v.status,
        createdAt: v.createdAt,
      }));
    },
  });
}

export function useVisitorsWaiting(opts: ListOpts = {}) {
  const userId = useSession((s) => s.user?.id);
  return useQuery(visitorsQuery(userId, opts));
}

// The detail screen shows the row it was opened from: the HR inboxes and keka-all have no
// single-item route. Looks in the status list it was tapped in first, then every other cached one.
export function findHrRequest(qc: QueryClient, kind: HrKindKey, id: string, status?: string): HrRequest | null {
  const lists = [
    ...(status ? qc.getQueriesData<HrRequest[]>({ queryKey: inboxKeys.hrStatus(kind, status) }) : []),
    ...qc.getQueriesData<HrRequest[]>({ queryKey: inboxKeys.hrKind(kind) }),
  ];
  for (const [, data] of lists) {
    const hit = Array.isArray(data) ? data.find((r) => r.id === id) : undefined;
    if (hit) return hit;
  }
  return null;
}

export function findKekaReimbursement(qc: QueryClient, id: string): KekaReimbursement | null {
  for (const [, data] of qc.getQueriesData<KekaReimbursement[]>({ queryKey: inboxKeys.kekaPrefix })) {
    const hit = Array.isArray(data) ? data.find((r) => r.id === id) : undefined;
    if (hit) return hit;
  }
  return null;
}

// The bill/receipt as a data URL. Up to 8 MB of file, so allow longer than the client's 12 s default.
export function fetchKekaReceipt(id: string) {
  return unwrap(apiFetch<{ fileData?: string; fileName?: string }>(`/reimbursements/${encodeURIComponent(id)}/receipt`, { timeoutMs: 60_000 }));
}

// ── Decisions ────────────────────────────────────────────────────────────────
// Both take the item out of its pending list at once (and put it back if the server says no), then
// refetch the queue so the history statuses pick it up.

export function useDecideHr(kind: HrKindKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision, note }: { id: string; decision: Decision; note: string }) => {
      const def = hrKindDef(kind);
      if (!def) throw new Error('You cannot review this type of request.');
      return unwrap(api.post<{ ok: true; request: HrRequest }>(def.decide(encodeURIComponent(id)), { decision, note }));
    },
    onMutate: async ({ id }) => {
      const pending = inboxKeys.hrStatus(kind, 'pending');
      await qc.cancelQueries({ queryKey: pending });
      const snapshot = qc.getQueriesData<HrRequest[]>({ queryKey: pending });
      qc.setQueriesData<HrRequest[]>({ queryKey: pending }, (old) => old?.filter((r) => r.id !== id));
      return { snapshot };
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    // Approve buzzes "success", reject a softer "warning" (docs/DESIGN.md haptics).
    onSuccess: (_d, v) => {
      void Haptics.notificationAsync(v.decision === 'reject' ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: inboxKeys.hrKind(kind) });
    },
  });
}

export function useDecideKeka() {
  const qc = useQueryClient();
  const myName = useSession((s) => s.user?.name ?? '');
  return useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: Decision; reason?: string }) => {
      const base = `/reimbursements/${encodeURIComponent(id)}`;
      return unwrap(
        decision === 'approve'
          ? api.post<{ ok: true; status: string }>(`${base}/keka-approve`, {})
          : api.post<{ ok: true; status: string }>(`${base}/keka-reject`, { reason }),
      );
    },
    onMutate: async ({ id, decision, reason }) => {
      await qc.cancelQueries({ queryKey: inboxKeys.kekaPrefix });
      const snapshot = qc.getQueriesData<KekaReimbursement[]>({ queryKey: inboxKeys.kekaPrefix });
      const at = new Date().toISOString();
      qc.setQueriesData<KekaReimbursement[]>({ queryKey: inboxKeys.kekaPrefix }, (old) =>
        old?.map((r) => {
          if (r.id !== id) return r;
          return decision === 'approve'
            ? { ...r, status: 'pending_accounts_approval', keka_approved_at: at, keka_approved_by_name: myName }
            : { ...r, status: 'rejected', rejected_stage: 'keka', rejection_reason: reason ?? '', rejected_by_name: myName };
        }),
      );
      return { snapshot };
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSuccess: (_d, v) => {
      void Haptics.notificationAsync(v.decision === 'reject' ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: inboxKeys.kekaPrefix });
      // Expense claims keeps its own copy of keka-all (api/reimbursements reimbursementKeys.keka).
      void qc.invalidateQueries({ queryKey: ['reimb-keka'] });
    },
  });
}
