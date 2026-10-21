// My Pay (hr_payroll.js): current salary breakup (publicSalary), locked payslips, the FY summary,
// HR expense claims (publicClaim) and salary advances (publicLoan). Money is in rupees.
//
// The numbers hang together: ₹14.4 L CTC → ₹1,20,000 a month; gross ₹1,15,891; deductions are
// employee PF (12% of the ₹15,000 wage ceiling), Telangana professional tax, TDS under the new
// regime, and the salary-advance EMI from the month its recovery started.

import type { FySummary, HrClaim, HrLoan, MySalary, PayslipSummary } from '@/api/pay';
import { DEMO_USER } from '@/demo/config';
import { addMonths, daysAgo, fail, istIso, nowIso, today, workingDayFrom, type Route } from '@/demo/state';

const T0 = today();
const THIS_MONTH = T0.slice(0, 7);
const wd = (n: number) => workingDayFrom(T0, n);
const fyOf = (month: string) => (Number(month.slice(5, 7)) >= 4 ? Number(month.slice(0, 4)) : Number(month.slice(0, 4)) - 1);

// ── Salary ───────────────────────────────────────────────────────────────────
const effectiveFrom = `${fyOf(THIS_MONTH)}-04-01`;
const SALARY: MySalary & { employee_id: string } = {
  id: 'hes-demo-2026',
  employee_id: DEMO_USER.id,
  structure_id: 'hss-creative',
  structure_name: 'Creative — Senior',
  effective_from: effectiveFrom,
  annual_ctc: 1440000,
  monthly_ctc: 120000,
  monthly_gross: 115891,
  lines: [
    { code: 'BASIC', name: 'Basic', kind: 'earning', taxable: true, pf_wage: true, amount: 48000 },
    { code: 'HRA', name: 'House Rent Allowance', kind: 'earning', taxable: true, pf_wage: false, amount: 24000 },
    { code: 'CONV', name: 'Conveyance Allowance', kind: 'earning', taxable: true, pf_wage: false, amount: 1600 },
    { code: 'MED', name: 'Medical Allowance', kind: 'earning', taxable: true, pf_wage: false, amount: 1250 },
    { code: 'SPL', name: 'Special Allowance', kind: 'earning', taxable: true, pf_wage: false, amount: 41041 },
    { code: 'EPF_ER', name: 'Employer PF', kind: 'employer', taxable: false, pf_wage: false, amount: 1800 },
    { code: 'GRAT', name: 'Gratuity', kind: 'employer', taxable: false, pf_wage: false, amount: 2309 },
  ],
};

// ── Advances ─────────────────────────────────────────────────────────────────
const LOAN_START = addMonths(THIS_MONTH, -4);
const LOANS: (HrLoan & { employee_id: string; employee_name: string })[] = [
  {
    id: 'hln-demo-02',
    employee_id: DEMO_USER.id,
    employee_name: String(DEMO_USER.name),
    principal: 60000,
    emi: 10000,
    start_month: LOAN_START,
    reason: 'Laptop upgrade for home editing (M3 MacBook Pro)',
    status: 'approved',
    recovered: 0,
    outstanding: 60000,
    decided_by_name: 'Lakshmi Prasad',
    decision_note: 'Approved — recovered over six months.',
    created_at: istIso(`${addMonths(LOAN_START, -1)}-20`, '11:30'),
  },
  {
    id: 'hln-demo-01',
    employee_id: DEMO_USER.id,
    employee_name: String(DEMO_USER.name),
    principal: 25000,
    emi: 5000,
    start_month: addMonths(THIS_MONTH, -16),
    reason: 'Medical expenses for my father',
    status: 'closed',
    recovered: 25000,
    outstanding: 0,
    decided_by_name: 'Lakshmi Prasad',
    decision_note: '',
    created_at: istIso(`${addMonths(THIS_MONTH, -17)}-08`, '10:00'),
  },
];

// ── Payslips: the last six locked months ─────────────────────────────────────
const PF = 1800;
const PT = 200;
const TDS = 6704;
const LOP_MONTH = addMonths(THIS_MONTH, -3); // half a day's loss of pay that month
const CLAIM_MONTH = addMonths(THIS_MONTH, -2); // an HR claim reimbursed with that month's salary

type Slip = PayslipSummary & { pf: number; pt: number; tds: number; taxable_gross: number };
const SLIPS: Slip[] = Array.from({ length: 6 }, (_, i) => addMonths(THIS_MONTH, -1 - i)).map((month) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const gross = month === LOP_MONTH ? Math.round(SALARY.monthly_gross - (SALARY.monthly_gross / dim) * 0.5) : SALARY.monthly_gross;
  const emi = month >= LOAN_START ? 10000 : 0;
  const deductions = PF + PT + TDS + emi;
  const reimbursed = month === CLAIM_MONTH ? 1840 : 0;
  return { id: `hpi-demo-${month}`, month, gross, deductions, net: gross - deductions + reimbursed, pf: PF, pt: PT, tds: TDS, taxable_gross: gross };
});

// Recovered so far = one EMI per locked month since the advance started (never a stored counter).
for (const l of LOANS) {
  if (l.status !== 'approved') continue;
  const months = SLIPS.filter((s) => s.month >= l.start_month).length;
  l.recovered = Math.min(l.principal, months * l.emi);
  l.outstanding = l.principal - l.recovered;
}

function fySummary(fyParam: string | null): (FySummary & { ok: true }) | ReturnType<typeof fail> {
  const fy = fyParam == null ? fyOf(THIS_MONTH) : Number(fyParam);
  if (!Number.isInteger(fy) || fy < 2000 || fy > 2100) return fail('fy must be the starting year, e.g. 2026 for 2026-27.');
  const items = SLIPS.filter((s) => s.month >= `${fy}-04` && s.month <= `${fy + 1}-03`);
  const sum = (f: (s: Slip) => number) => items.reduce((n, s) => n + f(s), 0);
  return {
    ok: true,
    fy,
    months: items.map((s) => s.month).sort(),
    gross: sum((s) => s.gross),
    taxable_gross: sum((s) => s.taxable_gross),
    tds: sum((s) => s.tds),
    pf: sum((s) => s.pf),
    esi: 0,
    pt: sum((s) => s.pt),
    net: sum((s) => s.net),
  };
}

// ── HR expense claims ────────────────────────────────────────────────────────
const claim = (c: Partial<HrClaim> & Pick<HrClaim, 'id' | 'category' | 'claim_date' | 'amount' | 'description' | 'status' | 'created_at'>): HrClaim & { employee_id: string } => ({
  employee_id: DEMO_USER.id,
  receipt_ref: '',
  decided_by_name: null,
  decided_at: null,
  decision_note: '',
  paid_at: null,
  ...c,
});

const CLAIMS = [
  claim({ id: 'hrc-demo-01', category: 'internet', claim_date: wd(3), amount: 1179, description: 'Broadband for WFH editing days (September)', receipt_ref: 'ACT-INV-88213', status: 'pending', created_at: daysAgo(2, '18:20') }),
  claim({ id: 'hrc-demo-02', category: 'travel', claim_date: `${CLAIM_MONTH}-09`, amount: 1840, description: 'Rapido and Ola to the Aarogya hospital shoot', receipt_ref: 'OLA-CRN-33190', status: 'paid', created_at: istIso(`${CLAIM_MONTH}-10`, '10:00'), decided_by_name: 'Priya Sharma', decided_at: istIso(`${CLAIM_MONTH}-11`, '12:00'), paid_at: istIso(`${addMonths(CLAIM_MONTH, 1)}-01`, '09:00') }),
  claim({ id: 'hrc-demo-03', category: 'food', claim_date: wd(9), amount: 640, description: 'Dinner during the late Kathalu teaser session', receipt_ref: 'SWG-55102', status: 'approved', created_at: daysAgo(12, '22:10'), decided_by_name: 'Priya Sharma', decided_at: daysAgo(11, '10:30') }),
  claim({ id: 'hrc-demo-04', category: 'office', claim_date: wd(30), amount: 3499, description: 'Portable SSD for client handover', receipt_ref: 'AMZ-40551', status: 'rejected', created_at: daysAgo(43, '15:00'), decided_by_name: 'Priya Sharma', decided_at: daysAgo(42, '11:00'), decision_note: 'Storage is issued by IT — please raise an asset request instead.' }),
  claim({ id: 'hrc-demo-05', category: 'phone', claim_date: wd(40), amount: 399, description: 'Recharge for client calls', receipt_ref: '', status: 'cancelled', created_at: daysAgo(57, '09:15') }),
];

const CATEGORIES = ['travel', 'food', 'internet', 'phone', 'medical', 'fuel', 'office', 'other'];
const rupees = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= max && Math.round(n * 100) === n * 100 ? n : null;
};

function newClaim(body: unknown) {
  const b = (body || {}) as Record<string, unknown>;
  if (!CATEGORIES.includes(String(b.category))) return fail(`Category must be one of: ${CATEGORIES.join(', ')}.`);
  const date = String(b.claim_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today()) return fail('The expense date must be within the last year.');
  const amount = rupees(b.amount, 1000000);
  if (!amount) return fail('Amount must be more than zero and at most ₹10,00,000.');
  const description = String(b.description || '').trim().slice(0, 500);
  if (description.length < 3) return fail('Describe the expense.');
  const c = claim({ id: `hrc${Date.now()}`, category: String(b.category), claim_date: date, amount, description, receipt_ref: String(b.receipt_ref || '').slice(0, 100), status: 'pending', created_at: nowIso() });
  CLAIMS.unshift(c);
  return { ok: true, claim: c };
}

function newLoan(body: unknown) {
  const b = (body || {}) as Record<string, unknown>;
  const principal = rupees(b.principal, 10000000);
  const emi = rupees(b.emi, 10000000);
  if (!principal) return fail('Amount must be more than zero (at most ₹1,00,00,000).');
  if (!emi || emi > principal) return fail('Monthly recovery must be more than zero and not more than the amount.');
  if (Math.ceil(principal / emi) > 60) return fail('Recovery must finish within 60 months — increase the monthly amount.');
  const start = String(b.start_month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(start) || start < THIS_MONTH) return fail('Recovery must start this month or later (YYYY-MM).');
  const reason = String(b.reason || '').trim().slice(0, 500);
  if (reason.length < 3) return fail('Give a reason.');
  if (LOANS.some((l) => l.status === 'pending')) return fail('You already have a pending loan request.', 409);
  const loan = { id: `hln${Date.now()}`, employee_id: DEMO_USER.id, employee_name: String(DEMO_USER.name), principal, emi, start_month: start, reason, status: 'pending' as const, recovered: 0, outstanding: principal, decided_by_name: null, decision_note: '', created_at: nowIso() };
  LOANS.unshift(loan);
  return { ok: true, loan };
}

const payslips = (): PayslipSummary[] => SLIPS.map(({ id, month, gross, deductions, net }) => ({ id, month, gross, deductions, net }));

export const payRoutes: Route[] = [
  ['GET', /^\/hr\/salary\/mine$/, () => ({ ok: true, salary: SALARY })],
  ['GET', /^\/hr\/payslips\/mine$/, () => ({ ok: true, payslips: payslips() })],
  ['GET', /^\/hr\/payslips\/fy-summary$/, (_p, _b, q) => fySummary(q.get('fy'))],
  ['GET', /^\/hr\/claims\/mine$/, () => ({ ok: true, claims: CLAIMS })],
  ['POST', /^\/hr\/claims$/, (_p, body) => newClaim(body)],
  [
    'POST',
    /^\/hr\/claims\/([^/]+)\/cancel$/,
    ([, id]) => {
      const c = CLAIMS.find((x) => x.id === id && x.status === 'pending');
      if (!c) return fail('No pending claim of yours with that id.', 404);
      c.status = 'cancelled';
      return { ok: true, claim: c };
    },
  ],
  ['GET', /^\/hr\/loans\/mine$/, () => ({ ok: true, loans: LOANS })],
  ['POST', /^\/hr\/loans$/, (_p, body) => newLoan(body)],
  [
    'POST',
    /^\/hr\/loans\/([^/]+)\/cancel$/,
    ([, id]) => {
      const l = LOANS.find((x) => x.id === id && x.status === 'pending');
      if (!l) return fail('No pending loan request of yours with that id.', 404);
      l.status = 'cancelled';
      return { ok: true, loan: l };
    },
  ],
];

// ── Exports for the domain fixtures (Wave 0, docs/port/EXTENSION-POINTS.md §10) ──
// The demo person's salary, payslips, HR claims and salary advances. Locking a payroll run in the demo
// (payroll domain) calls addPayslip, so the month appears in Afzal Employee's Pay › Payslips.
export type DemoPayslip = Slip;
export const salaryStore = SALARY;
export const payslipStore: Slip[] = SLIPS;
export const hrClaimStore = CLAIMS;
export const loanStore = LOANS;

/**
 * Add (or replace) the demo person's payslip for a 'YYYY-MM' month. Missing figures follow the salary:
 * gross = monthly gross, deductions = PF + PT + TDS (+ the advance EMI while it is being recovered).
 * Keeps the list newest first. Returns the stored slip.
 */
export function addPayslip(month: string, figures: Partial<Pick<Slip, 'gross' | 'deductions' | 'net' | 'pf' | 'pt' | 'tds'>> = {}): Slip {
  const gross = figures.gross ?? SALARY.monthly_gross;
  const emi = LOANS.some((l) => l.status === 'approved' && month >= l.start_month && (l.outstanding ?? 0) > 0) ? 10000 : 0;
  const deductions = figures.deductions ?? PF + PT + TDS + emi;
  const slip: Slip = {
    id: `hpi-demo-${month}`,
    month,
    gross,
    deductions,
    net: figures.net ?? gross - deductions,
    pf: figures.pf ?? PF,
    pt: figures.pt ?? PT,
    tds: figures.tds ?? TDS,
    taxable_gross: gross,
  };
  const i = SLIPS.findIndex((s) => s.month === month);
  if (i >= 0) SLIPS.splice(i, 1);
  SLIPS.push(slip);
  SLIPS.sort((a, b) => b.month.localeCompare(a.month));
  return slip;
}
