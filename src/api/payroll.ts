// Payroll admin (the payroll domain): payroll runs, run lines, locking, the salary register, salaries
// and tax profiles, salary structures (read and preview) and statutory settings (read only). Every route
// already exists on the server (docs/port/hr-setup-payroll.md §2.5), hr_payroll.js:
//   GET/PUT /hr/statutory ~L62–73 ('tax')           GET/PUT /hr/payroll/settings ~L75–87 ('payroll')
//   GET /hr/salary/structures ~L106, POST …/preview ~L109, DELETE …/:id ~L151   ('salary')
//   GET /hr/salary/people ~L217, POST /hr/salary/assign ~L173, DELETE /hr/salary/assign/:id ~L194,
//   PUT /hr/salary/people/:employeeId/profile ~L228                               ('salary')
//   GET/POST /hr/payroll/runs ~L365–387, GET …/:id ~L389, POST …/:id/recompute ~L397,
//   PUT …/:id/items/:itemId ~L408, DELETE …/:id ~L443, POST …/:id/lock ~L454, POST …/:id/finalise ~L502,
//   GET …/:id/register.csv ~L512                                                  ('payroll')
//   GET /hr/payslips/:itemId/pdf ~L554 (HR admins with 'payroll' get drafts too, stamped DRAFT)
// Writes are hrAdminGate: Super Admin and HR only, module switched on, never on your own pay (notSelf).
// Money is sent and received in rupees (the server keeps integer paise).
//
// Everyone's pay is in these answers: every query is `meta.persist = false` (kept out of the on-disk
// cache, like api/pay.ts) and nothing here logs a response. No route sends any message (spec §0).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';
import { haptic } from '@/ui';

const useUid = () => useSession((s) => s.user?.id);
const enc = encodeURIComponent;
const NO_PERSIST = { persist: false };

// ── Types (the handlers' own shapes) ─────────────────────────────────────────
export type CompKind = 'earning' | 'employer';
export type CompCalc = 'fixed' | 'pct_ctc' | 'pct_basic' | 'balance';
/** A structure component (publicStructure): `value` is ₹/month for fixed, a percentage otherwise. */
export type SalaryComponent = { code: string; name: string; kind: CompKind; calc: CompCalc; value: number; taxable: boolean; pf_wage: boolean };
export type SalaryStructure = { id: string; name: string; description: string; components: SalaryComponent[] };
export type BreakupLine = { code: string; name: string; kind: CompKind; taxable: boolean; pf_wage: boolean; amount: number };
export type Breakup = { annualCtc: number; monthlyCtc: number; gross: number; employer: number; lines: BreakupLine[] };

export type PersonSalary = {
  id: string;
  employee_id: string;
  structure_id: string;
  structure_name: string;
  effective_from: string; // YYYY-MM-DD
  annual_ctc: number;
  monthly_ctc: number;
  monthly_gross: number;
  lines: BreakupLine[];
};
export type SalaryRevision = { id: string; effective_from: string; annual_ctc: number; structure_name: string };
export type TaxRegime = 'new' | 'old';
export type TaxProfile = { regime: TaxRegime | null; declarations: number; pt_state: string; pf_enabled: boolean; tds_monthly: number };
export type SalaryPerson = {
  id: string;
  name: string;
  role: string;
  departmentId: string | null;
  department: string;
  salary: PersonSalary | null;
  revisions: SalaryRevision[];
  profile: TaxProfile;
};

export type LopSource = 'unpaid_leave' | 'unpaid_leave_and_absence';
export type PayrollSettings = { lopSource: LopSource };

export type RunStatus = 'draft' | 'locked';
export type RunTotals = { employees: number; gross: number; deductions: number; reimbursements: number; net: number; warnings: number };
export type PayrollRun = {
  id: string;
  month: string; // YYYY-MM
  status: RunStatus;
  totals: RunTotals | null;
  created_by_name: string;
  created_at: string;
  locked_by_name: string | null;
  locked_at: string | null;
};
export type PayLine = { code: string; name: string; amount: number; full?: number; taxable?: boolean };
export type Adjustment = { id?: string; label: string; type: 'earning' | 'deduction'; amount: number; taxable?: boolean };
export type PayrollItem = {
  id: string;
  employee_id: string;
  employee_name: string;
  department: string;
  structure_name: string;
  days_in_month: number;
  lop_days: number;
  pre_start_days: number;
  payable_days: number;
  lop_override: number | null;
  earnings: PayLine[];
  reimbursements: PayLine[];
  deductions: PayLine[];
  employer: PayLine[];
  adjustments: Adjustment[];
  gross: number;
  total_deductions: number;
  reimbursement_total: number;
  net: number;
  tds: number;
  warnings: string[];
};
export type RunDetail = { run: PayrollRun; items: PayrollItem[] };

type PfCfg = { enabled: boolean; employeeRatePct: number | null; employerRatePct: number | null; wageCeiling: number | null; capAtCeiling: boolean; rounding: 'nearest' | 'up' | null };
type EsiCfg = { enabled: boolean; employeeRatePct: number | null; employerRatePct: number | null; grossLimit: number | null; rounding: 'nearest' | 'up' | null };
export type PtSlab = { state: string; minGross: number | null; maxGross: number | null; amount: number | null; monthOverrides?: Record<string, number> };
export type TdsRegime = { standardDeduction: number | null; rebateLimit: number | null; rebateMax: number | null; cessPct: number | null; slabs: { upto: number | null; ratePct: number }[] };
export type Statutory = {
  pf: PfCfg;
  esi: EsiCfg;
  pt: { enabled: boolean; slabs: PtSlab[] };
  tds: { mode: 'off' | 'manual' | 'slab'; defaultRegime: TaxRegime | null; regimes: { new: TdsRegime | null; old: TdsRegime | null } };
};
export type StatutoryAnswer = { statutory: Statutory; missing: string[] };

export type AssignInput = { employee_id: string; structure_id: string; annual_ctc: number; effective_from: string };
export type ProfileInput = { regime: TaxRegime | null; declarations: number; pt_state: string; pf_enabled: boolean; tds_monthly: number };
export type LineInput = { lop_override: number | null; adjustments: Adjustment[] };

// ── Query keys ───────────────────────────────────────────────────────────────
export const payrollKeys = {
  all: ['payroll'] as const,
  runs: ['payroll', 'runs'] as const,
  run: ['payroll', 'run'] as const,
  settings: ['payroll', 'settings'] as const,
  people: ['payroll', 'people'] as const,
  structures: ['payroll', 'structures'] as const,
  statutory: ['payroll', 'statutory'] as const,
};

// ── Paths for downloadAuthed ─────────────────────────────────────────────────
export const registerCsvPath = (runId: string) => `/hr/payroll/runs/${enc(runId)}/register.csv`;
export const adminPayslipPath = (itemId: string) => `/hr/payslips/${enc(itemId)}/pdf`;

// ── Reads ────────────────────────────────────────────────────────────────────
export function usePayrollRuns(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: [...payrollKeys.runs, userId],
    enabled: enabled && !!userId,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ runs: PayrollRun[] }>('/hr/payroll/runs', signal))).runs ?? [],
  });
}

/** One run with every line (up to 20,000 in one answer on the server). */
export function usePayrollRun(id: string | undefined, enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: [...payrollKeys.run, userId, id],
    enabled: enabled && !!userId && !!id,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<RunDetail>(`/hr/payroll/runs/${enc(id!)}`, signal));
      return { run: r.run, items: Array.isArray(r.items) ? r.items : [] } as RunDetail;
    },
  });
}

export function usePayrollSettings(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: [...payrollKeys.settings, userId],
    enabled: enabled && !!userId,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ settings: PayrollSettings }>('/hr/payroll/settings', signal))).settings,
  });
}

export function useSalaryPeople(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: [...payrollKeys.people, userId],
    enabled: enabled && !!userId,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ people: SalaryPerson[] }>('/hr/salary/people', signal))).people ?? [],
  });
}

export function useSalaryStructures(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: [...payrollKeys.structures, userId],
    enabled: enabled && !!userId,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ structures: SalaryStructure[] }>('/hr/salary/structures', signal))).structures ?? [],
  });
}

export function useStatutory(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: [...payrollKeys.statutory, userId],
    enabled: enabled && !!userId,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<StatutoryAnswer>('/hr/statutory', signal));
      return { statutory: r.statutory, missing: Array.isArray(r.missing) ? r.missing : [] } as StatutoryAnswer;
    },
  });
}

/** A structure's breakup for a sample CTC (read-only on the server). */
export function useStructurePreview(components: SalaryComponent[] | null | undefined, annualCtc: number | null, enabled = true) {
  const userId = useUid();
  const comps = Array.isArray(components) ? components : [];
  return useQuery({
    queryKey: ['payroll', 'preview', userId, JSON.stringify(comps), annualCtc],
    enabled: enabled && !!userId && comps.length > 0 && !!annualCtc && annualCtc > 0,
    meta: NO_PERSIST,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () =>
      (await unwrap(api.post<{ breakup: Breakup }>('/hr/salary/structures/preview', { components: comps.map(({ code, name, kind, calc, value, taxable, pf_wage }) => ({ code, name, kind, calc, value: calc === 'balance' ? 0 : value, taxable, pf_wage })), annual_ctc: annualCtc }))).breakup,
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────
// Each mutation unwraps `{ error }` into a thrown Error with the server's own words, gives one haptic
// and refreshes every payroll screen (plus the employee's own pay screens, which a lock changes).

function useRefresh() {
  const qc = useQueryClient();
  return (...keys: readonly (readonly string[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [...k] })));
}
const ok = () => haptic.success();
const bad = () => haptic.error();

export function usePayrollRunActions() {
  const refresh = useRefresh();
  const after = () => refresh(payrollKeys.runs, payrollKeys.run);
  return {
    create: useMutation({
      mutationFn: (month: string) => unwrap(api.post<{ run: PayrollRun }>('/hr/payroll/runs', { month })),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    recompute: useMutation({
      mutationFn: (id: string) => unwrap(api.post<{ totals: RunTotals }>(`/hr/payroll/runs/${enc(id)}/recompute`, {})),
      onSuccess: () => (ok(), after()),
      onError: () => (bad(), after()),
    }),
    saveLine: useMutation({
      mutationFn: ({ runId, itemId, input }: { runId: string; itemId: string; input: LineInput }) =>
        unwrap(api.put<{ item: PayrollItem | null; totals: RunTotals }>(`/hr/payroll/runs/${enc(runId)}/items/${enc(itemId)}`, input)),
      onSuccess: () => (ok(), after()),
      onError: () => (bad(), after()),
    }),
    discard: useMutation({
      mutationFn: (id: string) => unwrap(api.del(`/hr/payroll/runs/${enc(id)}`)),
      onSuccess: () => (ok(), after()),
      onError: () => (bad(), after()),
    }),
    lock: useMutation({
      mutationFn: ({ id, confirm }: { id: string; confirm: string }) => unwrap(api.post<{ run: PayrollRun }>(`/hr/payroll/runs/${enc(id)}/lock`, { confirm })),
      onSuccess: () => (ok(), refresh(payrollKeys.runs, payrollKeys.run, ['pay'])),
      onError: () => (bad(), after()),
    }),
    finalise: useMutation({
      mutationFn: (id: string) => unwrap(api.post(`/hr/payroll/runs/${enc(id)}/finalise`, {})),
      onSuccess: () => (ok(), refresh(payrollKeys.runs, payrollKeys.run, ['pay'])),
      onError: bad,
    }),
    setLopSource: useMutation({
      mutationFn: (lopSource: LopSource) => unwrap(api.put<{ settings: PayrollSettings }>('/hr/payroll/settings', { lopSource })),
      onSuccess: () => (ok(), refresh(payrollKeys.settings)),
      onError: bad,
    }),
  };
}

export function useSalaryActions() {
  const refresh = useRefresh();
  const after = () => refresh(payrollKeys.people);
  return {
    assign: useMutation({
      mutationFn: (input: AssignInput) => unwrap(api.post<{ salary: PersonSalary; warning: string | null }>('/hr/salary/assign', input)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    removeRevision: useMutation({
      mutationFn: (id: string) => unwrap(api.del(`/hr/salary/assign/${enc(id)}`)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    saveProfile: useMutation({
      mutationFn: ({ employeeId, input }: { employeeId: string; input: ProfileInput }) =>
        unwrap(api.put<{ profile: TaxProfile }>(`/hr/salary/people/${enc(employeeId)}/profile`, input)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    retireStructure: useMutation({
      mutationFn: (id: string) => unwrap(api.del(`/hr/salary/structures/${enc(id)}`)),
      onSuccess: () => (ok(), refresh(payrollKeys.structures)),
      onError: bad,
    }),
  };
}
