// My Pay — the signed-in employee's own salary, payslips, FY summary, HR claims and salary advances.
// Endpoints and shapes are taken from the handlers in hr_payroll.js:
//   GET  /hr/salary/mine          ~L257  current salary breakup (null until HR assigns one)
//   GET  /hr/payslips/mine        ~L533  LOCKED payslips only: { id, month, gross, deductions, net }
//   GET  /hr/payslips/fy-summary  ~L542  ?fy=<start year>; totals from locked payslips (not Form 16)
//   GET  /hr/payslips/:itemId/pdf ~L554  binary PDF (bearer header) — see lib/files downloadAuthed
//   GET  /hr/claims/mine          ~L638  POST /hr/claims/:id/cancel ~L646
//   GET  /hr/loans/mine           ~L716  POST /hr/loans ~L694, POST /hr/loans/:id/cancel ~L725
// Money comes back in rupees (the server keeps integer paise internally and converts).
//
// Salary data is sensitive: nothing in the pay feature logs it. Every pay query is tagged
// `meta.persist = false` so the root persister can leave it out of the on-disk cache.

import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

export type SalaryLine = {
  code: string;
  name: string;
  kind: 'earning' | 'employer';
  taxable?: boolean;
  pf_wage?: boolean;
  amount: number; // monthly rupees
};

export type MySalary = {
  id: string;
  structure_id: string;
  structure_name: string;
  effective_from: string; // YYYY-MM-DD
  annual_ctc: number;
  monthly_ctc: number;
  monthly_gross: number;
  lines: SalaryLine[];
};

// The employee API only exposes these totals; the line-by-line breakup (earnings, deductions, paid
// and loss-of-pay days) is only in the PDF.
export type PayslipSummary = { id: string; month: string; gross: number; deductions: number; net: number };

export type FySummary = {
  fy: number; // starting year: 2026 = FY 2026-27
  months: string[]; // YYYY-MM with a locked payslip
  gross: number;
  taxable_gross: number;
  tds: number;
  pf: number;
  esi: number;
  pt: number;
  net: number;
};

export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'paid';
export type HrClaim = {
  id: string;
  category: string; // travel | food | internet | phone | medical | fuel | office | other
  claim_date: string; // YYYY-MM-DD
  amount: number;
  description: string;
  receipt_ref: string;
  status: ClaimStatus;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string;
  paid_at: string | null;
  created_at: string;
};

export type LoanStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'closed';
export type HrLoan = {
  id: string;
  principal: number;
  emi: number; // recovered per month
  start_month: string; // YYYY-MM
  reason: string;
  status: LoanStatus;
  recovered: number;
  outstanding: number;
  decided_by_name: string | null;
  decision_note: string;
  created_at: string;
};

export type LoanRequest = { principal: number; emi: number; start_month: string; reason: string };

const NO_PERSIST = { persist: false };

export function useMySalary(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['pay', 'salary', userId],
    enabled: enabled && !!userId,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ salary: MySalary | null }>('/hr/salary/mine', signal))).salary ?? null,
  });
}

// Newest month first (the server orders by month desc).
export function useMyPayslips(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['pay', 'payslips', userId],
    enabled: enabled && !!userId,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ payslips: PayslipSummary[] }>('/hr/payslips/mine', signal))).payslips ?? [],
  });
}

// fy = starting year of the financial year; null = the current one (the server's default).
export function useFySummary(fy: number | null, enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['pay', 'fy', userId, fy ?? 'current'],
    enabled: enabled && !!userId,
    meta: NO_PERSIST,
    queryFn: ({ signal }) => unwrap(api.get<FySummary>(`/hr/payslips/fy-summary${fy == null ? '' : `?fy=${fy}`}`, signal)),
  });
}

export function useMyClaims(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['pay', 'claims', userId],
    enabled: enabled && !!userId,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ claims: HrClaim[] }>('/hr/claims/mine', signal))).claims ?? [],
  });
}

export function useMyLoans(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['pay', 'loans', userId],
    enabled: enabled && !!userId,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ loans: HrLoan[] }>('/hr/loans/mine', signal))).loans ?? [],
  });
}

// Same body as the website's MyClaims → sendLoan (dash.html ~L5078).
export const requestLoan = (body: LoanRequest) => api.post<{ ok: true; loan: HrLoan }>('/hr/loans', body);
export const cancelLoan = (id: string) => api.post<{ ok: true; loan: HrLoan }>(`/hr/loans/${encodeURIComponent(id)}/cancel`, {});
export const cancelClaim = (id: string) => api.post<{ ok: true; claim: HrClaim }>(`/hr/claims/${encodeURIComponent(id)}/cancel`, {});

// Path for downloadAuthed(); the server names the file payslip-<month>.pdf.
export const payslipPdfPath = (itemId: string) => `/hr/payslips/${encodeURIComponent(itemId)}/pdf`;
