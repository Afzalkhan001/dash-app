// Petty Cash endpoints (server.js ~L3240-4553, sql/petty_cash_tables.sql,
// sql/petty_cash_bill_submissions.sql). Request flow:
//   pending_confirmation (on-behalf OTP) -> pending_approval (Keka Code Owner) -> pending_accounts_approval
//   -> ready_for_payment -> payment_processing -> received | not_received        (rejected at either approval)
// The first approval is the Keka Code Owner's alone (Accounts stands in only on a code with no owner)
// and always moves the request on to Accounts; whoever gave it cannot also authorize it.
// Bill Submission is a separate expense log against a Keka Code; bills that add up to more than the
// employee's petty cash raise an automatic "extra" request (kind: 'excess') server-side. A bill
// Accounts rejects or the employee withdraws stays on record but never counts as spent.
//
// Receipts are never part of these lists (the server strips fileData); they are fetched on demand.

import { useQuery } from '@tanstack/react-query';

import { api, isApiError, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

export type PettyCashHeadLine = { departmentId: string; departmentName: string; amount: number };

export type PettyCashHistoryEntry = {
  status: string;
  at?: string;
  byId?: string;
  byName?: string;
  note?: string;
  paymentDate?: string;
  reference?: string;
  method?: string;
  followUp?: boolean;
};

export type PettyCashRequest = {
  id: string;
  kind?: 'excess' | string;
  kekaCode: string;
  projectId?: string | null;
  projectName?: string;
  costCodeOwnerId?: string | null;
  costCodeOwnerName?: string;
  employeeId: string;
  employeeName?: string;
  employeeDept?: string;
  requestedById: string;
  requestedByName?: string;
  onBehalf?: boolean;
  departments?: PettyCashHeadLine[];
  amount: number;
  remarks?: string;
  status: string;
  createdAt?: string;
  confirmedAt?: string;
  kekaApprovedAt?: string;
  kekaApprovedById?: string;
  kekaApprovedByName?: string;
  /** 'accounts' when Accounts gave the first approval because the code has no owner (with kekaStageNote saying so). */
  kekaStageBy?: 'accounts' | string;
  kekaStageNote?: string;
  approvedAt?: string; // = authorized by Accounts
  approvedByName?: string;
  rejectedAt?: string;
  rejectedByName?: string;
  rejectionReason?: string;
  // 'withdrawn': an extra claim closed because every bill in it was withdrawn; 'pool': no longer needed
  // because a bill sharing the petty cash was pulled out.
  rejectedStage?: 'keka' | 'accounts' | 'withdrawn' | 'pool' | string;
  processingAt?: string;
  processingByName?: string;
  paidAt?: string;
  paymentDate?: string;
  paymentReference?: string;
  paymentMethod?: string;
  userResponse?: { response: string; at?: string; byName?: string; note?: string } | null;
  paymentHistory?: PettyCashHistoryEntry[];
  billsTotal?: number;
  allocatedTotal?: number;
};

// Bills uploaded against one request (the older flow — the website no longer creates these, but shows them).
export type PettyCashBill = {
  id: string;
  requestId: string;
  kekaCode?: string;
  projectName?: string;
  employeeId: string;
  employeeName?: string;
  uploadedById?: string;
  uploadedByName?: string;
  amount: number;
  description?: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  createdAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  hasFile?: boolean;
};

// Petty Cash Bill Submission rows.
export type PettyCashSubmission = {
  id: string;
  batchId?: string;
  employeeId: string;
  employeeName?: string;
  projectId?: string;
  projectName?: string;
  kekaCode?: string;
  billDate?: string | null;
  departmentId?: string;
  departmentName?: string;
  description?: string;
  paidTo?: string;
  amount: number;
  voucherNumber?: string;
  fileName?: string;
  hasFile?: boolean;
  createdAt?: string;
  status?: 'rejected' | 'withdrawn' | string; // 'rejected' by Accounts, 'withdrawn' by the employee; otherwise unset
  rejectionReason?: string;
  rejectedByName?: string;
  rejectedAt?: string;
  withdrawnAt?: string;
  withdrawnByName?: string;
  excessRequestId?: string;
};

// The "extra" claims raised when submitted bills exceed the petty cash (reconcile / submit responses).
export type PettyCashExcess = {
  requestId: string;
  kekaCode: string;
  amount: number;
  billsTotal: number;
  allocated: number;
  status: string;
  ownerName?: string;
  selfOwned?: boolean;
};

export type ExpenseHead = { id: string; name: string; active?: boolean; sortOrder?: number };
export type KekaProject = { id: string; name?: string; kekaCode?: string; status?: string; costCodeOwner?: string; empNo?: string };
export type Teammate = { id: string; name: string; dept?: string; employeeNumber?: string; email?: string };

export type PettyCashStatementLine = {
  id: string;
  hasFile: boolean;
  voucherNumber?: string;
  head: string;
  amount: number;
  date: string;
  project: string;
  description: string;
  paidTo: string;
  status: 'active' | 'rejected' | 'withdrawn';
  canReject?: boolean;
  /** Mine, still counted, and not inside an extra claim that has been decided. */
  canWithdraw?: boolean;
  rejectionReason?: string;
  rejectedByName?: string;
  rejectedAt?: string;
  withdrawnAt?: string;
  withdrawnByName?: string;
};
export type PettyCashStatementSheet = {
  kekaCode: string;
  projectName: string;
  startDate: string;
  days: number;
  submittedAt: string;
  heads: { id: string; name: string; total: number }[];
  total: number;
  inflow: { date: string; amount: number; reference?: string }[];
  advance: number;
  balance: number;
  lines: PettyCashStatementLine[];
};
export type PettyCashStatement = {
  batchId: string;
  employee: { name: string; employeeNumber: string; designation: string; location: string };
  statements: PettyCashStatementSheet[];
};

export type PettyCashOverview = {
  requests: PettyCashRequest[];
  bills: PettyCashBill[];
  subs: PettyCashSubmission[];
  excess: PettyCashExcess[];
};

const arr = <T>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : []);

// ── Reads ────────────────────────────────────────────────────────────────────

// Everything the Petty Cash screens show, loaded the way the website loads it: first the
// over-petty-cash catch-up (POST /reconcile raises any extra claim still owed, so it is in the list),
// then requests, old-flow bills and my submitted bills together.
export function usePettyCashOverview(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['petty', 'overview', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }): Promise<PettyCashOverview> => {
      const rc = await api.post<{ excess?: PettyCashExcess[] }>('/petty_cash_bill_submissions/reconcile', {});
      const [requests, bills, subs] = await Promise.all([
        unwrap(api.get<PettyCashRequest[]>('/petty_cash_requests', signal)),
        unwrap(api.get<PettyCashBill[]>('/petty_cash_bills', signal)),
        unwrap(api.get<{ bills: PettyCashSubmission[] }>('/petty_cash_bill_submissions/mine', signal)),
      ]);
      return {
        requests: arr<PettyCashRequest>(requests),
        bills: arr<PettyCashBill>(bills),
        subs: arr<PettyCashSubmission>(subs?.bills),
        excess: isApiError(rc) ? [] : arr<PettyCashExcess>(rc.excess),
      };
    },
  });
}

// Expense heads ("departments" server-side) — only active ones are offered.
export function useExpenseHeads(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['petty', 'heads', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) =>
      arr<ExpenseHead>(await unwrap(api.get('/petty_cash_departments', signal))).filter((d) => d.active !== false),
    staleTime: 10 * 60_000,
  });
}

// Keka Codes = projects. A deactivated code is never offered for new work (dash.html activeProjects).
export function useKekaProjects(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['petty', 'projects', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) =>
      arr<KekaProject>(await unwrap(api.get('/projects', signal)))
        .filter((p) => String(p.status || 'active').toLowerCase() !== 'inactive')
        .map((p) => ({ id: p.id, name: p.name, kekaCode: p.kekaCode, status: p.status, costCodeOwner: p.costCodeOwner, empNo: p.empNo })),
    staleTime: 10 * 60_000,
  });
}

// "Raise for a team member": the server only accepts someone in the requester's own department.
export function useTeammates(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  const dept = useSession((s) => s.user?.dept);
  return useQuery({
    queryKey: ['petty', 'teammates', userId, dept],
    enabled: enabled && !!userId && !!dept,
    queryFn: async ({ signal }) =>
      arr<Teammate & { dept?: string }>(await unwrap(api.get('/users', signal)))
        .filter((u) => u.id !== userId && String(u.dept || '') === String(dept))
        .map((u) => ({ id: u.id, name: u.name || 'Unnamed', dept: u.dept, employeeNumber: u.employeeNumber, email: u.email }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    staleTime: 10 * 60_000,
  });
}

// One submission's Statement of Expenses, or (for an extra claim) the bills claimed in it.
export function usePettyCashStatement(batchId: string, requestId?: string) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['petty', 'statement', userId, batchId, requestId ?? ''],
    enabled: !!userId && (!!batchId || !!requestId),
    queryFn: ({ signal }) =>
      unwrap(
        api.get<PettyCashStatement>(
          `/petty_cash_bill_submissions/statement/${encodeURIComponent(batchId || '_')}${requestId ? `?request=${encodeURIComponent(requestId)}` : ''}`,
          signal,
        ),
      ),
  });
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type NewPettyCashRequest = {
  kekaCode: string;
  projectId: string;
  projectName: string;
  departments: PettyCashHeadLine[];
  remarks: string;
  employeeId: string;
};
export const createPettyCashRequest = (body: NewPettyCashRequest) =>
  api.post<{ request: PettyCashRequest }>('/petty_cash_requests', body);

// The on-behalf OTP: confirmed by the teammate it is for, or by the raiser reading it out.
export const confirmPettyCashRequest = (id: string, code: string) =>
  api.post(`/petty_cash_requests/${encodeURIComponent(id)}/confirm`, { code });
export const resendPettyCashOtp = (id: string) => api.post(`/petty_cash_requests/${encodeURIComponent(id)}/resend-otp`, {});

// Only while the teammate has not confirmed yet (server-enforced).
export const deletePettyCashRequest = (id: string) => api.del(`/petty_cash_requests/${encodeURIComponent(id)}`);

// The payee's answer once Accounts has started paying.
export const respondPettyCashPayment = (id: string, response: 'received' | 'not_received', note: string) =>
  api.post(`/petty_cash_requests/${encodeURIComponent(id)}/payment/respond`, { response, note });

// Keka Code Owner's stage.
export const approvePettyCashRequest = (id: string) => api.post(`/petty_cash_requests/${encodeURIComponent(id)}/approve`, {});
export const rejectPettyCashRequest = (id: string, reason: string) =>
  api.post(`/petty_cash_requests/${encodeURIComponent(id)}/reject`, { reason });

export type NewPettyCashBill = {
  projectId: string;
  kekaCode: string;
  projectName: string;
  departmentId: string;
  billDate: string;
  description: string;
  paidTo: string;
  amount: number;
  fileName: string;
  mimeType: string;
  fileData: string;
};
// voucherNumber and the submission time are stamped by the server. The same bill twice (in this batch,
// or one already sent and still counted) is answered 409 { error, needsConfirmation: true, duplicates };
// sending again with confirmDuplicates: true goes through.
export type PettyCashDuplicateWarning = { error: string; status?: number; needsConfirmation?: boolean; duplicates?: string[] };
export const submitPettyCashBills = (bills: NewPettyCashBill[], confirmDuplicates = false) =>
  api.post<{ bills: PettyCashSubmission[]; batchId: string; excess: PettyCashExcess[] }>(
    '/petty_cash_bill_submissions',
    confirmDuplicates ? { bills, confirmDuplicates: true } : { bills },
  );

// The employee withdraws a bill they sent by mistake (only theirs; not once its extra claim is decided).
// `claim` is how the bill's own extra claim changed (null when it had none or nothing changed).
export type PettyCashWithdrawResult = {
  bill: { id: string; status: 'withdrawn' };
  claim: { before: number; after: number; closed: boolean } | null;
  otherClaimsChanged: number;
};
export const withdrawPettyCashBill = (id: string) => api.del<PettyCashWithdrawResult>(`/petty_cash_bill_submissions/${encodeURIComponent(id)}`);

// Receipts (data URLs) — fetched only when someone asks to see one.
export const fetchSubmissionReceipt = (id: string) =>
  api.get<{ fileData: string; fileName: string }>(`/petty_cash_bill_submissions/${encodeURIComponent(id)}/receipt`);
export const fetchBillReceipt = (id: string) =>
  api.get<{ fileData: string; fileName: string }>(`/petty_cash_bills/${encodeURIComponent(id)}/receipt`);
