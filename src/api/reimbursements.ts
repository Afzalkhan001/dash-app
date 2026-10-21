// Accounts > Reimbursement (reimbursements.js; web: ReimbursementHub / MyReimbursements /
// ReimbursementForm, dash.html ~L33420–33700). An employee claims money they spent: Keka Code,
// amount, purpose and the bill. Keka Code Owner approves → Accounts authorizes → Accounts starts
// processing → the CLAIMANT confirms Received / Not Received.
//
//   GET  /reimbursements/mine                    → { reimbursements }
//   GET  /reimbursements/keka-all                → { reimbursements }  (claims against codes I own)
//   POST /reimbursements                         { kekaCode, projectId, purpose, amount, fileData, fileName }
//   GET  /reimbursements/:id/receipt             → { fileData: data URL, fileName }
//   POST /reimbursements/:id/reupload            { amount, fileData, fileName }       (only when rejected)
//   POST /reimbursements/:id/payment/respond     { response: 'received'|'not_received', note }
//   POST /reimbursements/:id/keka-approve        {}
//   POST /reimbursements/:id/keka-reject         { reason }
//   GET  /projects                               → Keka Codes (Project rows)

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, apiFetch, isApiError, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

export type ReimbursementStatus =
  | 'pending_keka_approval'
  | 'pending_accounts_approval'
  | 'ready_for_payment'
  | 'payment_processing'
  | 'received'
  | 'not_received'
  | 'rejected';

export type ReimbursementPurpose = 'food' | 'fuel' | 'accommodation' | 'transportation';

export const PURPOSE_LABEL: Record<string, string> = {
  food: 'Food',
  fuel: 'Fuel',
  accommodation: 'Accommodation',
  transportation: 'Transportation',
};

export type HistoryEntry = {
  event: string;
  status?: string;
  at?: string;
  byId?: string;
  byName?: string;
  note?: string;
  amount?: number;
  previousAmount?: number;
  purpose?: string;
  paymentDate?: string;
  reference?: string;
  method?: string;
  followUp?: boolean;
  [k: string]: unknown;
};

export type Payment = {
  paymentDate?: string;
  reference?: string;
  method?: string;
  note?: string;
  startedAt?: string;
  startedByName?: string;
  response?: { response: 'received' | 'not_received'; at: string; byName?: string; note?: string } | null;
};

// Real columns (sql/reimbursements.sql), snake_case as returned.
export type Reimbursement = {
  id: string;
  tenant_id?: string | null;
  employee_id: string;
  employee_name: string;
  employee_number?: string;
  keka_code: string;
  project_id?: string;
  project_name?: string;
  keka_owner_user_id?: string;
  keka_owner_name?: string;
  purpose: ReimbursementPurpose | string;
  amount: number | string;
  status: ReimbursementStatus | string;
  receipt_name?: string;
  history?: HistoryEntry[];
  payment?: Payment | null;
  created_at: string;
  updated_at?: string;
  keka_approved_at?: string | null;
  keka_approved_by_name?: string | null;
  approved_at?: string | null;
  approved_by_name?: string | null;
  rejected_stage?: 'keka' | 'accounts' | null;
  rejected_at?: string | null;
  rejected_by_name?: string | null;
  rejection_reason?: string | null;
};

export type Project = {
  id: string;
  name?: string;
  kekaCode?: string;
  status?: string;
  costCodeOwner?: string;
  empNo?: string;
  [k: string]: unknown;
};

export const reimbursementKeys = {
  mine: (userId?: string) => ['reimb-mine', userId] as const,
  keka: (userId?: string) => ['reimb-keka', userId] as const,
  projects: (userId?: string) => ['reimb-projects', userId] as const,
};

// The server refuses a body over ~12 MB and a data URL is ~4/3 of the file (web: PETTY_CASH_MAX_DATA_URL_CHARS).
export const MAX_DATA_URL_CHARS = 11 * 1024 * 1024;

export function useMyReimbursements() {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: reimbursementKeys.mine(userId),
    enabled: !!userId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ ok: true; reimbursements: Reimbursement[] }>('/reimbursements/mine', signal));
      return Array.isArray(r.reimbursements) ? r.reimbursements : [];
    },
  });
}

// Claims against Keka Codes the signed-in person owns (Super Admin sees the company's).
export function useKekaReimbursements(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: reimbursementKeys.keka(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ ok: true; reimbursements: Reimbursement[] }>('/reimbursements/keka-all', signal));
      return Array.isArray(r.reimbursements) ? r.reimbursements : [];
    },
  });
}

// Keka Codes. Deactivated ones are kept in the list (history references them) but never offered
// for new work — see activeProjects().
export function useProjects(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: reimbursementKeys.projects(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<Project[]>('/projects', signal));
      return Array.isArray(r) ? r : [];
    },
    staleTime: 5 * 60_000,
  });
}

export const projectIsActive = (p?: Project | null) => !!p && String(p.status || 'active').toLowerCase() !== 'inactive';
export const activeProjects = (list?: Project[] | null) => (list || []).filter(projectIsActive);

// Uploads carry the whole file as base64, so they get far longer than the 12 s default — a phone on
// mobile data needs it. The body is the website's (withActor adds performedById there too).
function postLong<T>(path: string, body: Record<string, unknown>) {
  const actor = useSession.getState().user?.id;
  return apiFetch<T>(path, { method: 'POST', body: actor ? { ...body, performedById: actor } : body, timeoutMs: 120_000 });
}

export type SubmitInput = { kekaCode: string; projectId: string; purpose: string; amount: number; fileData: string; fileName: string };

export function useSubmitReimbursement() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  return useMutation({
    mutationFn: (input: SubmitInput) => unwrap(postLong<{ ok: true; reimbursement: Reimbursement }>('/reimbursements', input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: reimbursementKeys.mine(userId) }),
  });
}

export function useReuploadReimbursement() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; amount: number; fileData: string; fileName: string }) =>
      unwrap(postLong<{ ok: true; status: string; kekaApprovalRequired: boolean }>(`/reimbursements/${encodeURIComponent(id)}/reupload`, body)),
    onSettled: () => qc.invalidateQueries({ queryKey: reimbursementKeys.mine(userId) }),
  });
}

export function useRespondPayment() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  return useMutation({
    mutationFn: ({ id, response, note }: { id: string; response: 'received' | 'not_received'; note: string }) =>
      unwrap(api.post<{ ok: true; status: string }>(`/reimbursements/${encodeURIComponent(id)}/payment/respond`, { response, note })),
    onSettled: () => qc.invalidateQueries({ queryKey: reimbursementKeys.mine(userId) }),
  });
}

export function useKekaDecision() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  return useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: 'approve' | 'reject'; reason?: string }) =>
      decision === 'approve'
        ? unwrap(api.post<{ ok: true; status: string }>(`/reimbursements/${encodeURIComponent(id)}/keka-approve`, {}))
        : unwrap(api.post<{ ok: true; status: string }>(`/reimbursements/${encodeURIComponent(id)}/keka-reject`, { reason: reason ?? '' })),
    // The Inbox keeps its own copy of this queue (['inbox', 'keka', …]) — refresh that too.
    onSettled: () =>
      Promise.all([qc.invalidateQueries({ queryKey: reimbursementKeys.keka(userId) }), qc.invalidateQueries({ queryKey: ['inbox', 'keka'] })]),
  });
}

// The stored bill as a data URL. Only PDFs and raster images are ever shown (web: PettyCashReceiptLink).
export async function fetchReceipt(id: string): Promise<{ fileData: string; fileName: string; mime: string }> {
  const r = await apiFetch<{ ok: true; fileData: string; fileName: string }>(`/reimbursements/${encodeURIComponent(id)}/receipt`, { timeoutMs: 60_000 });
  if (isApiError(r)) throw new Error(r.error);
  const src = r.fileData || '';
  const m = /^data:(image\/[a-z0-9.+-]+|application\/pdf);base64,/i.exec(src);
  if (!m || /svg/i.test(src.slice(0, 40))) throw new Error('This receipt could not be shown.');
  return { fileData: src, fileName: r.fileName || 'receipt', mime: m[1]!.toLowerCase() };
}
