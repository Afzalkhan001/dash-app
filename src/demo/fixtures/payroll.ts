// Demo API for the payroll domain: payroll runs (run, recompute, edit a line, discard, lock, finalise),
// the loss-of-pay setting, salaries and tax profiles, salary structures (list, preview, retire) and the
// statutory settings (read). Shapes, refusals and the server's own words mirror the handlers:
//   hr.js            hrAdminGate ~L599 (Super Admin and HR only, module on), checkAccess ~L327
//   hr_payroll.js    statutory ~L62, payroll settings ~L75, structures ~L106–160, assign ~L173–203,
//                    people + profile ~L217–255, runs ~L365–512 (buildItems ~L286, lock ~L454,
//                    finaliseRun ~L479), notSelf ~L37
//   hr_payroll_calc.js  validateComponents, computeBreakup, statutoryMissing, computeItem — ported below
//                    line for line (integer paise inside, rupees on the wire), so every figure is real.
//
// The seed hangs together with the employee side (fixtures/pay.ts): the demo person's current salary is
// `salaryStore` (₹14.4 L, gross ₹1,15,891), the last three months are locked runs whose lines for the demo
// person ARE that person's payslips (written back with `addPayslip`, same ids, so Pay › Payslips and the
// FY summary agree), the half-day loss of pay, the reimbursed claim and the advance EMI show in the same
// months as on the payslips, and this month has no run yet so "Run payroll" can be tried.
// Locking a run marks the included HR claims paid (`hrClaimStore`), records the advance EMI
// (`loanStore`) and adds the month to the demo person's payslips (`addPayslip`): switch to Afzal
// Employee to see it. "Me" is DEMO_USER (demo/server.ts swaps it with the active persona), so the
// notSelf checks compare with it — Afzal HR can't change Afzal HR's own pay, exactly as on the server.

import type {
  Breakup,
  CompCalc,
  CompKind,
  LopSource,
  PayLine,
  PayrollItem,
  PayrollRun,
  PersonSalary,
  RunTotals,
  SalaryPerson,
  SalaryStructure,
  Statutory,
  TaxProfile,
  TdsRegime,
} from '@/api/payroll';
import { DEMO_USER } from '@/demo/config';
import { allPeople, DEPARTMENTS, deptIdOf } from '@/demo/fixtures/org';
import { addPayslip, hrClaimStore, loanStore, salaryStore } from '@/demo/fixtures/pay';
import { currentPersona } from '@/demo/personas';
import { addMonths, daysAgo, daysInMonth, fail, istIso, newId, nowIso, today, type Route } from '@/demo/state';

const ME = () => DEMO_USER.id;
const T0 = today();
const THIS_MONTH = T0.slice(0, 7);
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (d: unknown): d is string =>
  typeof d === 'string' && DATE_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// ── Money (hr_common.js rupeesToPaise / paiseToRupees) ───────────────────────
function rupeesToPaise(v: unknown, max = 1e10): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) return null;
  const p = Math.round(v * 100);
  return p / 100 !== v ? null : p;
}
const R = (p: number) => Math.round(p) / 100;

// ── Gates (hr.js hrAdminGate / checkAccess, with the server's own words) ─────
function admin(what: string, module: string) {
  const p = currentPersona();
  if (!['super_admin', 'hr'].includes(p.role)) return fail(`You do not have permission to ${what}.`, 403);
  if (!p.tenant) return fail('HR is not available for this account.', 403);
  // super_admin and hr skip the department check (DEPT_GATE_BYPASS), so only the company switch counts.
  if (!p.hr.enabled || !p.hr.modules.includes(module)) return fail('HR is not enabled for your company. Ask your administrator.', 403);
  return null;
}
const notSelf = (employeeId: string) => (employeeId === ME() ? fail('You cannot change your own pay records. Ask another HR admin.', 403) : null);
const moduleOn = (m: string) => currentPersona().hr.modules.includes(m);

// ── The engine (hr_payroll_calc.js, integer paise) ───────────────────────────
type Comp = { code: string; name: string; kind: CompKind; calc: CompCalc; value: number; taxable: boolean; pf_wage: boolean }; // fixed value in paise
type BLine = { code: string; name: string; kind: CompKind; taxable: boolean; pf_wage: boolean; amount: number };
type Bk = { annualCtc: number; monthlyCtc: number; gross: number; employer: number; lines: BLine[] };
const COMP_CODE_RE = /^[A-Z][A-Z0-9_]{1,11}$/;
const CALCS: CompCalc[] = ['fixed', 'pct_ctc', 'pct_basic', 'balance'];
const isPct = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 && Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

function validateComponents(list: unknown): { error: string } | { value: Comp[] } {
  if (!Array.isArray(list) || list.length < 1 || list.length > 20) return { error: 'A structure needs 1–20 components.' };
  const out: Comp[] = [];
  const seen = new Set<string>();
  for (const c of list as Record<string, unknown>[]) {
    if (!c || typeof c !== 'object') return { error: 'Invalid component.' };
    const code = typeof c.code === 'string' ? c.code.trim().toUpperCase() : '';
    if (!COMP_CODE_RE.test(code)) return { error: 'Component codes are 2–12 capital letters/digits (e.g. BASIC, HRA).' };
    if (seen.has(code)) return { error: `Component ${code} appears twice.` };
    seen.add(code);
    const name = typeof c.name === 'string' ? c.name.trim().slice(0, 40) : '';
    if (name.length < 2) return { error: `Component ${code} needs a name.` };
    if (c.kind !== 'earning' && c.kind !== 'employer') return { error: `${code}: kind must be earning or employer (employer = part of CTC paid by the company, not to the employee).` };
    if (!CALCS.includes(c.calc as CompCalc)) return { error: `${code}: calc must be fixed, pct_ctc, pct_basic or balance.` };
    const calc = c.calc as CompCalc;
    let value = 0;
    if (calc === 'fixed') {
      const p = rupeesToPaise(c.value, 1e8);
      if (p === null) return { error: `${code}: fixed amount must be rupees with at most 2 decimals.` };
      value = p;
    } else if (calc === 'pct_ctc' || calc === 'pct_basic') {
      if (!isPct(c.value)) return { error: `${code}: percentage must be 0–100 with at most 2 decimals.` };
      value = c.value;
    }
    if (calc === 'balance' && c.kind !== 'earning') return { error: `${code}: only an earning can take the balance.` };
    if (code === 'BASIC' && !['fixed', 'pct_ctc'].includes(calc)) return { error: 'BASIC must be a fixed amount or a % of CTC.' };
    if (code === 'BASIC' && c.kind !== 'earning') return { error: 'BASIC must be an earning.' };
    for (const k of ['taxable', 'pf_wage']) if (c[k] !== undefined && typeof c[k] !== 'boolean') return { error: `${code}: ${k} must be true or false.` };
    out.push({ code, name, kind: c.kind, calc, value, taxable: c.taxable !== false, pf_wage: c.pf_wage === undefined ? code === 'BASIC' : !!c.pf_wage });
  }
  if (!out.some((c) => c.code === 'BASIC')) return { error: 'A structure must have a BASIC component.' };
  if (out.filter((c) => c.calc === 'balance').length > 1) return { error: 'Only one component can take the balance.' };
  return { value: out };
}

function computeBreakup(annualCtc: number, components: Comp[]): { error: string } | { value: Bk } {
  if (!Number.isInteger(annualCtc) || annualCtc <= 0) return { error: 'Annual CTC must be more than zero.' };
  const monthlyCtc = Math.round(annualCtc / 12);
  const basicC = components.find((c) => c.code === 'BASIC');
  const amt = (c: Comp | undefined) => (!c ? 0 : c.calc === 'fixed' ? c.value : c.calc === 'pct_ctc' ? Math.round((monthlyCtc * c.value) / 100) : 0);
  const basic = amt(basicC);
  const lines = components.map((c) => {
    let a = 0;
    if (c.code === 'BASIC') a = basic;
    else if (c.calc === 'fixed' || c.calc === 'pct_ctc') a = amt(c);
    else if (c.calc === 'pct_basic') a = Math.round((basic * c.value) / 100);
    return { code: c.code, name: c.name, kind: c.kind, taxable: c.taxable, pf_wage: c.pf_wage, calc: c.calc, amount: a };
  });
  const allocated = lines.filter((l) => l.calc !== 'balance').reduce((s, l) => s + l.amount, 0);
  const bal = lines.find((l) => l.calc === 'balance');
  if (bal) {
    bal.amount = monthlyCtc - allocated;
    if (bal.amount < 0) return { error: `The components add up to more than the monthly CTC (₹${(allocated / 100).toFixed(2)} > ₹${(monthlyCtc / 100).toFixed(2)}).` };
  } else if (allocated !== monthlyCtc) {
    return { error: `The components add up to ₹${(allocated / 100).toFixed(2)} but the monthly CTC is ₹${(monthlyCtc / 100).toFixed(2)}. Add a balance component or change the amounts.` };
  }
  const gross = lines.filter((l) => l.kind === 'earning').reduce((s, l) => s + l.amount, 0);
  const employer = lines.filter((l) => l.kind === 'employer').reduce((s, l) => s + l.amount, 0);
  return { value: { annualCtc, monthlyCtc, gross, employer, lines: lines.map(({ calc: _c, ...l }) => l) } };
}

function statutoryMissing(cfg: Statutory) {
  const miss: string[] = [];
  if (cfg.pf.enabled) for (const k of ['employeeRatePct', 'employerRatePct', 'rounding'] as const) if (cfg.pf[k] == null) miss.push(`PF ${k}`);
  if (cfg.pf.enabled && cfg.pf.capAtCeiling && cfg.pf.wageCeiling == null) miss.push('PF wageCeiling');
  if (cfg.esi.enabled) for (const k of ['employeeRatePct', 'employerRatePct', 'grossLimit', 'rounding'] as const) if (cfg.esi[k] == null) miss.push(`ESI ${k}`);
  if (cfg.pt.enabled && !cfg.pt.slabs.length) miss.push('PT slabs');
  if (cfg.tds.mode === 'slab') {
    if (!cfg.tds.defaultRegime) miss.push('TDS defaultRegime');
    for (const k of ['new', 'old'] as const) {
      const r = cfg.tds.regimes[k];
      if (!r) {
        miss.push(`TDS ${k} regime`);
        continue;
      }
      for (const f of ['standardDeduction', 'rebateLimit', 'rebateMax', 'cessPct'] as const) if (r[f] == null) miss.push(`TDS ${k} ${f}`);
      if (!r.slabs.length) miss.push(`TDS ${k} slabs`);
    }
  }
  return miss;
}

const P = (r: number | null | undefined) => Math.round(Number(r ?? 0) * 100);
const prorate = (amount: number, payable: number, dim: number) => Math.round((amount * payable) / dim);
const roundRupee = (paise: number, mode: string | null) => (mode === 'up' ? Math.ceil(paise / 100) * 100 : Math.round(paise / 100) * 100);
type Profile = { regime: 'new' | 'old' | null; declarations: number; pt_state: string; pf_enabled: boolean; tds_monthly: number }; // paise
type ELine = { code: string; name: string; taxable: boolean; pf_wage: boolean; full: number; amount: number; adjustment_id?: string };
type Line = { code: string; name: string; amount: number; full?: number; taxable?: boolean; adjustment_id?: string; loan_id?: string; reimbursement_id?: string };
type Adj = { id: string; label: string; type: 'earning' | 'deduction'; amount: number; taxable?: boolean };

function slabTax(taxable: number, slabs: TdsRegime['slabs']) {
  let tax = 0;
  let lower = 0;
  for (const s of slabs) {
    const upper = s.upto === null ? Infinity : P(s.upto);
    if (taxable > lower) tax += ((Math.min(taxable, upper) - lower) * s.ratePct) / 100;
    lower = upper;
    if (taxable <= upper) break;
  }
  return Math.round(tax);
}
function annualTax(annualTaxable: number, r: TdsRegime) {
  const income = Math.max(0, annualTaxable);
  let tax = slabTax(income, r.slabs);
  if (income <= P(r.rebateLimit)) tax = Math.max(0, tax - P(r.rebateMax));
  return Math.round(tax * (1 + Number(r.cessPct ?? 0) / 100));
}
const fyStart = (month: string) => (Number(month.slice(5, 7)) >= 4 ? Number(month.slice(0, 4)) : Number(month.slice(0, 4)) - 1);
const monthsLeftInFy = (month: string) => {
  const m = Number(month.slice(5, 7));
  return m >= 4 ? 16 - m : 4 - m;
};
function regimeOf(cfg: Statutory, profile: Profile | undefined) {
  const regime = (profile && profile.regime) || cfg.tds.defaultRegime || 'new';
  return { regime, r: cfg.tds.regimes[regime] };
}
function tdsCalc(cfg: Statutory, profile: Profile | undefined, month: string, monthTaxable: number, ytdTaxable: number, ytdTds: number) {
  if (cfg.tds.mode === 'off') return 0;
  if (cfg.tds.mode === 'manual') return profile ? profile.tds_monthly : 0;
  const { regime, r } = regimeOf(cfg, profile);
  if (!r) return 0;
  const left = monthsLeftInFy(month);
  const projected = ytdTaxable + monthTaxable * left;
  const deductions = P(r.standardDeduction) + (regime === 'old' && profile ? profile.declarations : 0);
  const annual = annualTax(projected - deductions, r);
  const remaining = Math.max(0, annual - ytdTds);
  return Math.round(remaining / left / 100) * 100;
}
function ptCalc(paidGross: number, state: string | undefined, month: string, cfg: Statutory) {
  if (!cfg.pt.enabled) return { amount: 0, warning: null as string | null };
  if (!state) return { amount: 0, warning: 'No Professional Tax state set for this employee — PT not deducted.' };
  const st = state.toUpperCase();
  const slabs = cfg.pt.slabs.filter((s) => s.state === st);
  if (!slabs.length) return { amount: 0, warning: `No PT slabs configured for ${st}.` };
  const s = slabs.find((x) => paidGross >= P(x.minGross) && (x.maxGross === null || paidGross <= P(x.maxGross)));
  if (!s) return { amount: 0, warning: `No PT slab matches a gross of ₹${(paidGross / 100).toFixed(2)} in ${st}.` };
  const mm = month.slice(5, 7);
  return { amount: P(s.monthOverrides && s.monthOverrides[mm] !== undefined ? s.monthOverrides[mm] : s.amount), warning: null };
}

type Calc = {
  days_in_month: number;
  lop_days: number;
  pre_start_days: number;
  payable_days: number;
  earnings: Line[];
  reimbursements: Line[];
  deductions: Line[];
  employer: Line[];
  gross: number;
  taxable_gross: number;
  total_deductions: number;
  reimbursement_total: number;
  net: number;
  tds: number;
  warnings: string[];
};
function computeItem(inp: {
  breakup: Bk;
  dim: number;
  lopDays: number;
  preStartDays: number;
  statutory: Statutory;
  profile: Profile | undefined;
  month: string;
  adjustments: Adj[];
  reimbursements: { id: string; category: string; amount: number }[];
  loans: { loan_id: string; amount: number }[];
  ytd: { taxable: number; tds: number };
}): Calc {
  const { breakup, dim, statutory: cfg, profile, month } = inp;
  const unpaid = Math.min(dim, (Number(inp.lopDays) || 0) + (Number(inp.preStartDays) || 0));
  const payable = Math.round((dim - unpaid) * 100) / 100;
  const earnings: ELine[] = breakup.lines
    .filter((l) => l.kind === 'earning')
    .map((l) => ({ code: l.code, name: l.name, taxable: l.taxable, pf_wage: l.pf_wage, full: l.amount, amount: prorate(l.amount, payable, dim) }));
  const employer: Line[] = breakup.lines.filter((l) => l.kind === 'employer').map((l) => ({ code: l.code, name: l.name, amount: prorate(l.amount, payable, dim) }));
  for (const a of inp.adjustments.filter((x) => x.type === 'earning')) earnings.push({ code: 'ADJ', name: a.label, taxable: a.taxable !== false, pf_wage: false, full: a.amount, amount: a.amount, adjustment_id: a.id });
  const paidGross = earnings.reduce((s, l) => s + l.amount, 0);
  const taxableGross = earnings.filter((l) => l.taxable).reduce((s, l) => s + l.amount, 0);
  const deductions: Line[] = [];
  const warnings: string[] = [];
  if (cfg.pf.enabled && !(profile && profile.pf_enabled === false)) {
    const wage = earnings.filter((l) => l.pf_wage).reduce((s, l) => s + l.amount, 0);
    const base = cfg.pf.capAtCeiling ? Math.min(wage, P(cfg.pf.wageCeiling)) : wage;
    deductions.push({ code: 'PF', name: 'Provident Fund (employee)', amount: roundRupee((base * Number(cfg.pf.employeeRatePct)) / 100, cfg.pf.rounding) });
    employer.push({ code: 'PF_ER', name: 'Provident Fund (employer)', amount: roundRupee((base * Number(cfg.pf.employerRatePct)) / 100, cfg.pf.rounding) });
  }
  if (cfg.esi.enabled && breakup.gross <= P(cfg.esi.grossLimit)) {
    deductions.push({ code: 'ESI', name: 'ESI (employee)', amount: roundRupee((paidGross * Number(cfg.esi.employeeRatePct)) / 100, cfg.esi.rounding) });
    employer.push({ code: 'ESI_ER', name: 'ESI (employer)', amount: roundRupee((paidGross * Number(cfg.esi.employerRatePct)) / 100, cfg.esi.rounding) });
  }
  const pt = ptCalc(paidGross, profile?.pt_state, month, cfg);
  if (pt.warning) warnings.push(pt.warning);
  if (pt.amount) deductions.push({ code: 'PT', name: 'Professional Tax', amount: pt.amount });
  const tds = tdsCalc(cfg, profile, month, taxableGross, inp.ytd.taxable, inp.ytd.tds);
  if (tds) deductions.push({ code: 'TDS', name: 'Income Tax (TDS)', amount: tds });
  for (const l of inp.loans) if (l.amount > 0) deductions.push({ code: 'LOAN', name: 'Loan / advance recovery', amount: l.amount, loan_id: l.loan_id });
  for (const a of inp.adjustments.filter((x) => x.type === 'deduction')) deductions.push({ code: 'ADJ', name: a.label, amount: a.amount, adjustment_id: a.id });
  const reimb: Line[] = inp.reimbursements.map((r) => ({ code: 'REIMB', name: `Reimbursement: ${r.category}`, amount: r.amount, reimbursement_id: r.id }));
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const reimbTotal = reimb.reduce((s, r) => s + r.amount, 0);
  const net = paidGross + reimbTotal - totalDeductions;
  if (net < 0) warnings.push('Net pay is negative — reduce deductions or recoveries before locking.');
  return {
    days_in_month: dim,
    lop_days: Number(inp.lopDays) || 0,
    pre_start_days: Number(inp.preStartDays) || 0,
    payable_days: payable,
    earnings: earnings.map(({ pf_wage: _p, ...e }) => e),
    reimbursements: reimb,
    deductions,
    employer,
    gross: paidGross,
    taxable_gross: taxableGross,
    total_deductions: totalDeductions,
    reimbursement_total: reimbTotal,
    net,
    tds,
    warnings,
  };
}

// ── Company configuration (the company's own values; nothing statutory is built in on the server) ──
const STATUTORY: Statutory = {
  pf: { enabled: true, employeeRatePct: 12, employerRatePct: 12, wageCeiling: 15000, capAtCeiling: true, rounding: 'nearest' },
  esi: { enabled: false, employeeRatePct: null, employerRatePct: null, grossLimit: null, rounding: null },
  pt: {
    enabled: true,
    slabs: [
      { state: 'TELANGANA', minGross: 0, maxGross: 15000, amount: 0 },
      { state: 'TELANGANA', minGross: 15000.01, maxGross: 20000, amount: 150 },
      { state: 'TELANGANA', minGross: 20000.01, maxGross: null, amount: 200 },
    ],
  },
  tds: {
    mode: 'slab',
    defaultRegime: 'new',
    regimes: {
      new: {
        standardDeduction: 75000,
        rebateLimit: 1200000,
        rebateMax: 60000,
        cessPct: 4,
        slabs: [
          { upto: 400000, ratePct: 0 },
          { upto: 800000, ratePct: 5 },
          { upto: 1200000, ratePct: 10 },
          { upto: 1600000, ratePct: 15 },
          { upto: 2000000, ratePct: 20 },
          { upto: 2400000, ratePct: 25 },
          { upto: null, ratePct: 30 },
        ],
      },
      old: {
        standardDeduction: 50000,
        rebateLimit: 500000,
        rebateMax: 12500,
        cessPct: 4,
        slabs: [
          { upto: 250000, ratePct: 0 },
          { upto: 500000, ratePct: 5 },
          { upto: 1000000, ratePct: 20 },
          { upto: null, ratePct: 30 },
        ],
      },
    },
  },
};
const SETTINGS: { lopSource: LopSource } = { lopSource: 'unpaid_leave' };

// ── Structures (fixed values in paise inside, like the server's rows) ────────
type StructRow = { id: string; name: string; description: string; components: Comp[]; active: boolean };
const comp = (code: string, name: string, kind: CompKind, calc: CompCalc, value: number, extra: Partial<Comp> = {}): Comp => ({
  code,
  name,
  kind,
  calc,
  value: calc === 'fixed' ? Math.round(value * 100) : value,
  taxable: kind === 'earning',
  pf_wage: code === 'BASIC',
  ...extra,
});
const STRUCTURES: StructRow[] = [
  {
    id: 'hss-creative',
    name: 'Creative — Senior',
    description: 'Editors, designers, managers and office staff',
    active: true,
    components: [
      comp('BASIC', 'Basic', 'earning', 'pct_ctc', 40),
      comp('HRA', 'House Rent Allowance', 'earning', 'pct_basic', 50),
      comp('CONV', 'Conveyance Allowance', 'earning', 'fixed', 1600),
      comp('MED', 'Medical Allowance', 'earning', 'fixed', 1250),
      comp('EPF_ER', 'Employer PF', 'employer', 'fixed', 1800, { taxable: false }),
      comp('GRAT', 'Gratuity', 'employer', 'pct_basic', 4.81, { taxable: false }),
      comp('SPL', 'Special Allowance', 'earning', 'balance', 0),
    ],
  },
  {
    id: 'hss-crew',
    name: 'Production crew',
    description: 'Camera, light and sound crew on shoots',
    active: true,
    components: [
      comp('BASIC', 'Basic', 'earning', 'pct_ctc', 50),
      comp('HRA', 'House Rent Allowance', 'earning', 'pct_basic', 40),
      comp('CONV', 'Conveyance Allowance', 'earning', 'fixed', 1600),
      comp('SPL', 'Special Allowance', 'earning', 'balance', 0),
    ],
  },
  {
    id: 'hss-intern',
    name: 'Interns',
    description: 'Stipend — no PF',
    active: true,
    components: [comp('BASIC', 'Stipend', 'earning', 'pct_ctc', 60), comp('SPL', 'Special Allowance', 'earning', 'balance', 0)],
  },
];
const publicStructure = (s: StructRow): SalaryStructure => ({
  id: s.id,
  name: s.name,
  description: s.description,
  components: s.components.map((c) => ({ ...c, value: c.calc === 'fixed' ? R(c.value) : c.value })),
});
const activeStructures = () => STRUCTURES.filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name));

// ── People, salaries and tax profiles ────────────────────────────────────────
// hr.js PUNCH_ROLES = EMPLOYEE_ROLES without master_admin (hr_common.js listCompanyPeople).
const PUNCH_ROLES = ['super_admin', 'ceo', 'coo', 'admin', 'hr', 'it_admin', 'manager', 'employee', 'professional', 'accounts', 'app_manager'];
type CompanyPerson = { id: string; name: string; role: string; departmentId: string | null; department: string };
function companyPeople(): CompanyPerson[] {
  return allPeople()
    .filter((p) => p.id && PUNCH_ROLES.includes(String(p.role || 'employee')))
    .map((p) => {
      const departmentId = (p.departmentId as string | null | undefined) ?? deptIdOf(String(p.dept || ''));
      return { id: p.id, name: p.name, role: String(p.role || 'employee'), departmentId, department: DEPARTMENTS.find((d) => d.id === departmentId)?.name ?? '' };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

type SalRec = { id: string; employee_id: string; structure_id: string; structure_name: string; effective_from: string; annual_ctc: number; breakup: Bk; created_at: string };
const FY = fyStart(THIS_MONTH);
const FY_FROM = `${FY}-04-01`;
const PREV_FY_FROM = `${FY - 1}-04-01`;
const SALARIES: SalRec[] = [];
function seedSalary(employeeId: string, structureId: string, ctcRupees: number, effective: string, id?: string) {
  const st = STRUCTURES.find((s) => s.id === structureId)!;
  const bk = computeBreakup(ctcRupees * 100, st.components);
  if ('error' in bk) return;
  SALARIES.push({
    id: id ?? `hes-${employeeId}-${effective}`,
    employee_id: employeeId,
    structure_id: st.id,
    structure_name: st.name,
    effective_from: effective,
    annual_ctc: ctcRupees * 100,
    breakup: bk.value,
    created_at: istIso(effective < T0 ? effective : T0, '10:00'),
  });
}
// The demo person: last year's salary, then this year's — exactly `salaryStore` (fixtures/pay.ts), so
// the breakup HR sees is the one Pay › Salary shows.
seedSalary(ME(), 'hss-creative', 1260000, PREV_FY_FROM, 'hes-demo-prev');
{
  const s = salaryStore;
  const lines: BLine[] = s.lines.map((l) => ({ code: l.code, name: l.name, kind: l.kind, taxable: l.taxable !== false && l.kind === 'earning', pf_wage: !!l.pf_wage, amount: Math.round(l.amount * 100) }));
  SALARIES.push({
    id: s.id,
    employee_id: ME(),
    structure_id: s.structure_id,
    structure_name: s.structure_name,
    effective_from: s.effective_from,
    annual_ctc: Math.round(s.annual_ctc * 100),
    breakup: {
      annualCtc: Math.round(s.annual_ctc * 100),
      monthlyCtc: Math.round(s.monthly_ctc * 100),
      gross: Math.round(s.monthly_gross * 100),
      employer: lines.filter((l) => l.kind === 'employer').reduce((n, l) => n + l.amount, 0),
      lines,
    },
    created_at: istIso(s.effective_from, '10:00'),
  });
}
// [id, structure, CTC this year, CTC last year (a revision) or 0]. Nikhil has no salary yet: try "Set salary".
const SEED_PAY: [string, string, number, number][] = [
  ['u-kiran', 'hss-creative', 4800000, 4200000],
  ['u-arvind', 'hss-creative', 4200000, 0],
  ['u-deepa', 'hss-crew', 1800000, 1560000],
  ['u-lakshmi', 'hss-creative', 1500000, 0],
  ['u-priya', 'hss-creative', 2000000, 1750000],
  ['u-vikram', 'hss-creative', 1600000, 0],
  ['u-ramesh', 'hss-creative', 1400000, 0],
  ['u-naveen', 'hss-creative', 1300000, 0],
  ['u-rahul', 'hss-creative', 900000, 780000],
  ['u-anita', 'hss-creative', 840000, 0],
  ['u-sneha', 'hss-creative', 720000, 0],
  ['u-farhan', 'hss-crew', 600000, 540000],
  ['u-meera', 'hss-creative', 660000, 0],
  ['u-imran', 'hss-crew', 480000, 0],
  ['u-sanjay', 'hss-creative', 960000, 0],
  ['u-zoya', 'hss-creative', 420000, 0],
  ['u-kavya', 'hss-intern', 300000, 0],
  ['u-ravi', 'hss-creative', 540000, 0],
  ['u-pooja', 'hss-creative', 400000, 0],
  ['u-farah', 'hss-creative', 600000, 0],
  ['u-gopal', 'hss-creative', 720000, 660000],
  ['u-harish', 'hss-creative', 450000, 0],
];
for (const [id, st, ctc, prev] of SEED_PAY) {
  if (prev) seedSalary(id, st, prev, PREV_FY_FROM);
  seedSalary(id, st, ctc, FY_FROM);
}

const PROFILES = new Map<string, Profile>();
const profileOf = (id: string): Profile => PROFILES.get(id) ?? { regime: null, declarations: 0, pt_state: '', pf_enabled: true, tds_monthly: 0 };
for (const p of [ME(), ...SEED_PAY.map(([id]) => id), 'u-nikhil']) PROFILES.set(p, { regime: null, declarations: 0, pt_state: 'TELANGANA', pf_enabled: true, tds_monthly: 0 });
// Zoya moved from Bengaluru and has no PT state yet: her line carries the engine's own warning.
PROFILES.set('u-zoya', { ...profileOf('u-zoya'), pt_state: '' });
// The old regime with declarations, and an intern without PF.
PROFILES.set('u-ramesh', { ...profileOf('u-ramesh'), regime: 'old', declarations: 250000 * 100 });
PROFILES.set('u-kavya', { ...profileOf('u-kavya'), pf_enabled: false });
const publicProfile = (p: Profile | undefined): TaxProfile => ({
  regime: p?.regime ?? null,
  declarations: p ? R(p.declarations) : 0,
  pt_state: p?.pt_state ?? '',
  pf_enabled: !(p && p.pf_enabled === false),
  tds_monthly: p ? R(p.tds_monthly) : 0,
});

const recordsOf = (employeeId: string) => SALARIES.filter((r) => r.employee_id === employeeId).sort((a, b) => a.effective_from.localeCompare(b.effective_from));
const currentRecord = (records: SalRec[], onDate: string) => records.filter((r) => r.effective_from <= onDate).pop() ?? null;
const publicSalary = (r: SalRec | null): PersonSalary | null =>
  r && {
    id: r.id,
    employee_id: r.employee_id,
    structure_id: r.structure_id,
    structure_name: r.structure_name,
    effective_from: r.effective_from,
    annual_ctc: R(r.annual_ctc),
    monthly_ctc: R(r.breakup.monthlyCtc),
    monthly_gross: R(r.breakup.gross),
    lines: r.breakup.lines.map((l) => ({ ...l, amount: R(l.amount) })),
  };

function salaryPeople(): SalaryPerson[] {
  return companyPeople().map((p) => {
    const mine = recordsOf(p.id);
    const cur = currentRecord(mine, T0) ?? mine[0] ?? null;
    return {
      ...p,
      salary: publicSalary(cur),
      revisions: mine.map((r) => ({ id: r.id, effective_from: r.effective_from, annual_ctc: R(r.annual_ctc), structure_name: r.structure_name })),
      profile: publicProfile(PROFILES.get(p.id)),
    };
  });
}

// ── What a month brings in: unpaid leave, absence, claims, advances ─────────
// Unpaid (LOP) days per person per month, from approved unpaid leave; and days with no attendance,
// counted only when "Loss of pay from" includes absence. Offsets are months from now.
const UNPAID: Record<string, Record<number, number>> = {
  [ME()]: { [-3]: 0.5 }, // the half day on the employee's own payslip (fixtures/pay.ts LOP_MONTH)
  'u-sneha': { [-2]: 2 },
  'u-imran': { [-1]: 1 },
  'u-farhan': { 0: 1.5 },
  'u-rahul': { 0: 1 },
};
const ABSENT: Record<string, Record<number, number>> = {
  'u-imran': { 0: 1 },
  'u-meera': { 0: 0.5, [-1]: 1 },
};
const offsetOf = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const [ty, tm] = THIS_MONTH.split('-').map(Number) as [number, number];
  return (y - ty) * 12 + (m - tm);
};
const lopFor = (employeeId: string, month: string) => {
  const o = offsetOf(month);
  const leave = UNPAID[employeeId]?.[o] ?? 0;
  return leave + (SETTINGS.lopSource === 'unpaid_leave_and_absence' ? (ABSENT[employeeId]?.[o] ?? 0) : 0);
};

// Approved HR claims are paid with salary: the demo person's (fixtures/pay.ts hrClaimStore) and the
// crew's own. `payroll_run_id` as on the server: set when a run that included the claim is locked.
type ClaimRow = { id: string; employee_id: string; category: string; amount: number; status: string; decided_at: string | null; paid_at: string | null };
const CREW_CLAIMS: ClaimRow[] = [
  { id: 'hrc-farhan-01', employee_id: 'u-farhan', category: 'travel', amount: 2350, status: 'approved', decided_at: daysAgo(6, '12:15'), paid_at: null },
  { id: 'hrc-imran-01', employee_id: 'u-imran', category: 'fuel', amount: 1200, status: 'paid', decided_at: daysAgo(40, '11:00'), paid_at: daysAgo(20, '09:00') },
];
const CLAIM_RUN = new Map<string, string>();
const allClaims = (): ClaimRow[] => [
  ...hrClaimStore.map((c) => ({ id: c.id, employee_id: DEMO_USER.id, category: c.category, amount: c.amount, status: c.status, decided_at: c.decided_at, paid_at: c.paid_at })),
  ...CREW_CLAIMS,
];
const istDay = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 10) : '');

// ── Runs ─────────────────────────────────────────────────────────────────────
type Item = Calc & {
  id: string;
  run_id: string;
  month: string;
  employee_id: string;
  employee_name: string;
  department: string;
  salary_id: string;
  structure_name: string;
  lop_override: number | null;
  adjustments: Adj[];
  reimbursement_ids: string[];
  loan_recoveries: { loan_id: string; amount: number }[];
  locked: boolean;
};
type Totals = { employees: number; gross: number; deductions: number; reimbursements: number; net: number; warnings: number };
type Run = { id: string; month: string; status: 'draft' | 'locked'; totals: Totals | null; created_by_name: string; created_at: string; locked_by_name: string | null; locked_at: string | null; items: Item[] };
const RUNS: Run[] = [];
const SEED_FIRST = addMonths(THIS_MONTH, -3);

const lockedItemsFor = (employeeId: string, from: string, before: string) =>
  RUNS.filter((r) => r.status === 'locked' && r.month >= from && r.month < before).flatMap((r) => r.items.filter((i) => i.employee_id === employeeId));

/** Taxable pay and TDS already taken this financial year (earlier LOCKED months; hr_payroll.js buildItems). */
function ytdFor(employeeId: string, month: string, records: SalRec[]) {
  const fy = fyStart(month);
  const fyFrom = `${fy}-04`;
  const prior = lockedItemsFor(employeeId, fyFrom, month);
  const ytd = prior.reduce((a, x) => ({ taxable: a.taxable + x.taxable_gross, tds: a.tds + x.tds }), { taxable: 0, tds: 0 });
  // Months of this FY before the demo's first seeded run were paid in full, at a steady TDS.
  for (let m = fyFrom; m < SEED_FIRST && m < month; m = addMonths(m, 1)) {
    const rec = currentRecord(records, `${m}-${String(daysInMonth(m)).padStart(2, '0')}`);
    if (!rec) continue;
    const taxable = rec.breakup.lines.filter((l) => l.kind === 'earning' && l.taxable).reduce((s, l) => s + l.amount, 0);
    ytd.taxable += taxable;
    ytd.tds += steadyTds(employeeId, taxable);
  }
  return ytd;
}
function steadyTds(employeeId: string, monthlyTaxable: number) {
  const cfg = STATUTORY;
  const profile = PROFILES.get(employeeId);
  if (cfg.tds.mode === 'off') return 0;
  if (cfg.tds.mode === 'manual') return profile ? profile.tds_monthly : 0;
  const { regime, r } = regimeOf(cfg, profile);
  if (!r) return 0;
  const ded = P(r.standardDeduction) + (regime === 'old' && profile ? profile.declarations : 0);
  return Math.round(annualTax(monthlyTaxable * 12 - ded, r) / 12 / 100) * 100;
}

function buildItems(run: Run, existing: Item[]): Item[] {
  const month = run.month;
  const mFrom = `${month}-01`;
  const dim = daysInMonth(month);
  const mTo = `${month}-${String(dim).padStart(2, '0')}`;
  if (moduleOn('tax')) {
    const missing = statutoryMissing(STATUTORY);
    if (missing.length) throw new Error(`Statutory settings are switched on but incomplete: ${missing.join(', ')}. Fill them in (HR → Payroll → Statutory) or switch those sections off.`);
  }
  const prevBy = new Map(existing.map((i) => [i.employee_id, i]));
  const items: Item[] = [];
  for (const p of companyPeople()) {
    const mine = recordsOf(p.id);
    const rec = currentRecord(mine, mTo);
    if (!rec) continue; // no salary effective by month end → not in this run
    const prev = prevBy.get(p.id);
    const first = mine[0]?.id === rec.id;
    const preStart = first && rec.effective_from > mFrom ? Math.min(dim, Number(rec.effective_from.slice(8, 10)) - 1) : 0;
    let lop = lopFor(p.id, month);
    if (prev && prev.lop_override != null) lop = Number(prev.lop_override);
    const claims = allClaims().filter(
      (c) => c.employee_id === p.id && ((c.status === 'approved' && !CLAIM_RUN.has(c.id) && istDay(c.decided_at) <= mTo) || CLAIM_RUN.get(c.id) === run.id),
    );
    const loans =
      p.id === ME()
        ? loanStore
            .filter((l) => (l.status === 'approved' || l.status === 'closed') && l.start_month <= month)
            .map((l) => ({ loan_id: l.id, amount: l.status === 'approved' ? Math.round(Math.min(l.emi, Math.max(0, l.outstanding)) * 100) : 0 }))
            .filter((l) => l.amount > 0)
        : [];
    const calc = computeItem({
      breakup: rec.breakup,
      dim,
      lopDays: lop,
      preStartDays: preStart,
      statutory: moduleOn('tax') ? STATUTORY : { ...STATUTORY, pf: { ...STATUTORY.pf, enabled: false }, esi: { ...STATUTORY.esi, enabled: false }, pt: { enabled: false, slabs: [] }, tds: { ...STATUTORY.tds, mode: 'off' } },
      profile: PROFILES.get(p.id),
      month,
      adjustments: prev?.adjustments ?? [],
      reimbursements: claims.map((c) => ({ id: c.id, category: c.category, amount: Math.round(c.amount * 100) })),
      loans,
      ytd: ytdFor(p.id, month, mine),
    });
    items.push({
      ...calc,
      id: prev ? prev.id : p.id === ME() ? `hpi-demo-${month}` : `hpi-${month}-${p.id}`,
      run_id: run.id,
      month,
      employee_id: p.id,
      employee_name: p.name,
      department: p.department,
      salary_id: rec.id,
      structure_name: rec.structure_name,
      lop_override: prev && prev.lop_override != null ? prev.lop_override : null,
      adjustments: prev?.adjustments ?? [],
      reimbursement_ids: claims.map((c) => c.id),
      loan_recoveries: loans,
      locked: false,
    });
  }
  return items.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}
const totalsOf = (items: Item[]): Totals => ({
  employees: items.length,
  gross: items.reduce((s, i) => s + i.gross, 0),
  deductions: items.reduce((s, i) => s + i.total_deductions, 0),
  reimbursements: items.reduce((s, i) => s + i.reimbursement_total, 0),
  net: items.reduce((s, i) => s + i.net, 0),
  warnings: items.filter((i) => i.warnings.length).length,
});
const totalsToRupees = (t: Totals | null): RunTotals | null => t && { ...t, gross: R(t.gross), deductions: R(t.deductions), reimbursements: R(t.reimbursements), net: R(t.net) };
const publicRun = (r: Run): PayrollRun => ({
  id: r.id,
  month: r.month,
  status: r.status,
  totals: totalsToRupees(r.totals),
  created_by_name: r.created_by_name,
  created_at: r.created_at,
  locked_by_name: r.locked_by_name,
  locked_at: r.locked_at,
});
const lineRupees = (l: Line): PayLine => ({ code: l.code, name: l.name, amount: R(l.amount), ...(l.full !== undefined ? { full: R(l.full) } : {}), ...(l.taxable !== undefined ? { taxable: l.taxable } : {}) });
const publicItem = (i: Item): PayrollItem => ({
  id: i.id,
  employee_id: i.employee_id,
  employee_name: i.employee_name,
  department: i.department,
  structure_name: i.structure_name,
  days_in_month: i.days_in_month,
  lop_days: i.lop_days,
  pre_start_days: i.pre_start_days,
  payable_days: i.payable_days,
  lop_override: i.lop_override,
  earnings: i.earnings.map(lineRupees),
  reimbursements: i.reimbursements.map(lineRupees),
  deductions: i.deductions.map(lineRupees),
  employer: i.employer.map(lineRupees),
  adjustments: i.adjustments.map((a) => ({ ...a, amount: R(a.amount) })),
  gross: R(i.gross),
  total_deductions: R(i.total_deductions),
  reimbursement_total: R(i.reimbursement_total),
  net: R(i.net),
  tds: R(i.tds),
  warnings: i.warnings,
});

/** The demo person's line becomes that month's payslip on the employee side (same id). */
function syncPayslip(i: Item) {
  if (i.employee_id !== ME()) return;
  const by = (code: string) => R(i.deductions.filter((d) => d.code === code).reduce((s, d) => s + d.amount, 0));
  addPayslip(i.month, { gross: R(i.gross), deductions: R(i.total_deductions), net: R(i.net), pf: by('PF'), pt: by('PT'), tds: by('TDS') });
}

// Side effects of a lock (hr_payroll.js finaliseRun): claims paid, advance recoveries, payslips live.
function finalise(run: Run, opts: { seeded?: boolean } = {}) {
  const now = opts.seeded ? (run.locked_at ?? nowIso()) : nowIso();
  for (const i of run.items) {
    i.locked = true;
    for (const id of i.reimbursement_ids) {
      CLAIM_RUN.set(id, run.id);
      if (opts.seeded) continue; // the seeded months' claims are already paid on the employee side
      const own = hrClaimStore.find((c) => c.id === id && c.status === 'approved');
      if (own) {
        own.status = 'paid';
        own.paid_at = now;
      }
      const crew = CREW_CLAIMS.find((c) => c.id === id && c.status === 'approved');
      if (crew) {
        crew.status = 'paid';
        crew.paid_at = now;
      }
    }
    if (!opts.seeded) {
      for (const l of i.loan_recoveries) {
        const loan = loanStore.find((x) => x.id === l.loan_id);
        if (!loan) continue;
        loan.recovered = Math.min(loan.principal, loan.recovered + R(l.amount));
        loan.outstanding = loan.principal - loan.recovered;
        if (loan.outstanding <= 0 && loan.status === 'approved') loan.status = 'closed';
      }
    }
    syncPayslip(i);
  }
}

// Seed: the last three months, locked by Lakshmi Prasad on the 2nd of the next month. The demo
// person's reimbursed claim (fixtures/pay.ts CLAIM_MONTH, "hrc-demo-02") rides with its month.
{
  const CLAIM_MONTH = addMonths(THIS_MONTH, -2);
  const paidClaim = hrClaimStore.find((c) => c.id === 'hrc-demo-02');
  for (let k = 3; k >= 1; k--) {
    const month = addMonths(THIS_MONTH, -k);
    const next = addMonths(month, 1);
    const run: Run = {
      id: `hpr-seed-${month}`,
      month,
      status: 'draft',
      totals: null,
      created_by_name: 'Lakshmi Prasad',
      created_at: istIso(`${next}-01`, '11:00'),
      locked_by_name: null,
      locked_at: null,
      items: [],
    };
    if (paidClaim && month === CLAIM_MONTH) CLAIM_RUN.set(paidClaim.id, run.id);
    // Seeded months are built as the HR persona would see them (statutory on).
    run.items = buildSeed(run);
    run.totals = totalsOf(run.items);
    run.status = 'locked';
    run.locked_by_name = 'Lakshmi Prasad';
    run.locked_at = istIso(`${next}-02`, '16:30');
    finalise(run, { seeded: true });
    RUNS.unshift(run);
  }
}
function buildSeed(run: Run) {
  // `moduleOn` reads the active persona; at load that may be anyone, so build with the company switch on.
  const items: Item[] = [];
  const month = run.month;
  const dim = daysInMonth(month);
  const mTo = `${month}-${String(dim).padStart(2, '0')}`;
  for (const p of companyPeople()) {
    const mine = recordsOf(p.id);
    const rec = currentRecord(mine, mTo);
    if (!rec) continue;
    const claims = allClaims().filter((c) => c.employee_id === p.id && CLAIM_RUN.get(c.id) === run.id);
    const loans =
      p.id === ME()
        ? loanStore.filter((l) => l.start_month <= month && l.id === 'hln-demo-02').map((l) => ({ loan_id: l.id, amount: l.emi * 100 }))
        : [];
    const calc = computeItem({
      breakup: rec.breakup,
      dim,
      lopDays: UNPAID[p.id]?.[offsetOf(month)] ?? 0,
      preStartDays: 0,
      statutory: STATUTORY,
      profile: PROFILES.get(p.id),
      month,
      adjustments: [],
      reimbursements: claims.map((c) => ({ id: c.id, category: c.category, amount: Math.round(c.amount * 100) })),
      loans,
      ytd: ytdFor(p.id, month, mine),
    });
    items.push({
      ...calc,
      id: p.id === ME() ? `hpi-demo-${month}` : `hpi-${month}-${p.id}`,
      run_id: run.id,
      month,
      employee_id: p.id,
      employee_name: p.name,
      department: p.department,
      salary_id: rec.id,
      structure_name: rec.structure_name,
      lop_override: null,
      adjustments: [],
      reimbursement_ids: claims.map((c) => c.id),
      loan_recoveries: loans,
      locked: false,
    });
  }
  return items.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

const runById = (id: string) => (ID_RE.test(id) ? RUNS.find((r) => r.id === id) : undefined);
function ownRun(id: string, draft = false) {
  const run = runById(id);
  if (!run) return { err: fail('Payroll run not found.', 404) };
  if (draft && run.status !== 'draft') return { err: fail('This payroll is locked and cannot be changed. Make corrections in a later month.', 409) };
  return { run };
}
const rebuild = (run: Run, existing: Item[]) => {
  try {
    return { items: buildItems(run, existing) };
  } catch (e) {
    return { err: fail(e instanceof Error ? e.message : 'Could not calculate payroll.', 409) };
  }
};

// ── Handlers ─────────────────────────────────────────────────────────────────
function createRun(body: Record<string, unknown>) {
  const month = body.month;
  if (typeof month !== 'string' || !MONTH_RE.test(month)) return fail('month must be YYYY-MM.');
  if (month > THIS_MONTH) return fail('Payroll cannot be run for a future month.');
  if (RUNS.some((r) => r.month === month)) return fail(`Payroll for ${month} already exists.`, 409);
  const run: Run = { id: newId('hpr'), month, status: 'draft', totals: null, created_by_name: String(DEMO_USER.name), created_at: nowIso(), locked_by_name: null, locked_at: null, items: [] };
  const b = rebuild(run, []);
  if (b.err) return b.err;
  run.items = b.items;
  run.totals = totalsOf(run.items);
  RUNS.push(run);
  RUNS.sort((a, c) => c.month.localeCompare(a.month));
  return { ok: true, run: publicRun(run) };
}

function saveLine(runId: string, itemId: string, body: Record<string, unknown>) {
  const { run, err } = ownRun(runId, true);
  if (err) return err;
  const item = ID_RE.test(itemId) ? run.items.find((i) => i.id === itemId) : undefined;
  if (!item) return fail('Payroll line not found.', 404);
  const self = notSelf(item.employee_id);
  if (self) return self;
  const patch: Partial<Item> = {};
  if (body.lop_override !== undefined) {
    const v = body.lop_override;
    if (v !== null && (typeof v !== 'number' || v < 0 || v > item.days_in_month || Math.round(v * 2) !== v * 2)) {
      return fail(`Loss-of-pay days must be 0–${item.days_in_month} in steps of 0.5, or null to use the calculated value.`);
    }
    patch.lop_override = v as number | null;
  }
  if (body.adjustments !== undefined) {
    if (!Array.isArray(body.adjustments) || body.adjustments.length > 20) return fail('Up to 20 adjustments per line.');
    const adj: Adj[] = [];
    for (const a of body.adjustments as Record<string, unknown>[]) {
      const label = cleanText(a && a.label, 60);
      if (label.length < 3) return fail('Each adjustment needs a label (e.g. "Arrears for August").');
      if (a.type !== 'earning' && a.type !== 'deduction') return fail('Adjustment type must be earning or deduction.');
      const amt = rupeesToPaise(a.amount, 1e8);
      if (!amt) return fail('Adjustment amounts must be more than zero (rupees, 2 decimals).');
      adj.push({ id: typeof a.id === 'string' && ID_RE.test(a.id) ? a.id : newId('adj'), label, type: a.type, amount: amt, taxable: a.type === 'earning' ? a.taxable !== false : undefined });
    }
    patch.adjustments = adj;
  }
  const merged = { ...item, ...patch };
  const b = rebuild(run, run.items.map((i) => (i.id === item.id ? merged : i)));
  if (b.err) return b.err;
  run.items = b.items;
  run.totals = totalsOf(run.items);
  const updated = run.items.find((i) => i.id === item.id);
  return { ok: true, item: updated ? publicItem(updated) : null, totals: totalsToRupees(run.totals) };
}

function lockRun(runId: string, body: Record<string, unknown>) {
  const { run, err } = ownRun(runId, true);
  if (err) return err;
  if (body.confirm !== `LOCK ${run.month}`) return fail(`Type LOCK ${run.month} to confirm. A locked payroll cannot be changed.`);
  const b = rebuild(run, run.items);
  if (b.err) return b.err;
  if (!b.items.length) return fail('There is nobody to pay in this run.', 409);
  const neg = b.items.filter((i) => i.net < 0);
  if (neg.length) return fail(`Net pay is negative for ${neg.map((i) => i.employee_name).join(', ')}. Fix those lines first.`, 409);
  run.items = b.items;
  run.totals = totalsOf(run.items);
  run.status = 'locked';
  run.locked_by_name = String(DEMO_USER.name);
  run.locked_at = nowIso();
  finalise(run);
  return { ok: true, run: publicRun(run) };
}

function assignSalary(body: Record<string, unknown>) {
  const emp = companyPeople().find((p) => p.id === body.employee_id);
  if (!emp) return fail('Employee not found in your company.', 404);
  const self = notSelf(emp.id);
  if (self) return self;
  const st = activeStructures().find((s) => s.id === body.structure_id);
  if (!st) return fail('Choose a salary structure.', 404);
  const ctc = rupeesToPaise(body.annual_ctc, 1e9);
  if (!ctc) return fail('Annual CTC must be rupees with at most 2 decimals.');
  if (!realDate(body.effective_from)) return fail('Pick the date this salary takes effect.');
  const eff = body.effective_from;
  const bk = computeBreakup(ctc, st.components);
  if ('error' in bk) return fail(bk.error);
  if (SALARIES.some((r) => r.employee_id === emp.id && r.effective_from === eff)) return fail('This employee already has a salary revision on that date.', 409);
  const locked = RUNS.filter((r) => r.status === 'locked' && r.month >= eff.slice(0, 7)).sort((a, c) => a.month.localeCompare(c.month))[0];
  const row: SalRec = { id: newId('hes'), employee_id: emp.id, structure_id: st.id, structure_name: st.name, effective_from: eff, annual_ctc: ctc, breakup: bk.value, created_at: nowIso() };
  SALARIES.push(row);
  return {
    ok: true,
    salary: publicSalary(row),
    warning: locked ? `Payroll for ${locked.month} is already locked. Pay any difference for locked months as an arrears adjustment.` : null,
  };
}

function removeRevision(id: string) {
  const row = ID_RE.test(id) ? SALARIES.find((r) => r.id === id) : undefined;
  if (!row) return fail('Salary record not found.', 404);
  const self = notSelf(row.employee_id);
  if (self) return self;
  if (RUNS.some((r) => r.items.some((i) => i.salary_id === row.id && i.locked))) return fail('This salary was used in a locked payroll and cannot be removed. Add a new revision instead.', 409);
  SALARIES.splice(SALARIES.indexOf(row), 1);
  return { ok: true };
}

function saveProfile(employeeId: string, b: Record<string, unknown>) {
  const emp = companyPeople().find((p) => p.id === employeeId);
  if (!emp) return fail('Employee not found in your company.', 404);
  const self = notSelf(emp.id);
  if (self) return self;
  if (b.regime !== undefined && b.regime !== null && b.regime !== 'new' && b.regime !== 'old') return fail('regime must be new or old.');
  const decl = b.declarations === undefined ? undefined : rupeesToPaise(b.declarations, 1e9);
  if (decl === null) return fail('declarations must be rupees.');
  const tdsM = b.tds_monthly === undefined ? undefined : rupeesToPaise(b.tds_monthly, 1e8);
  if (tdsM === null) return fail('tds_monthly must be rupees.');
  if (b.pt_state !== undefined && !(b.pt_state === '' || (typeof b.pt_state === 'string' && /^[A-Za-z][A-Za-z .-]{1,29}$/.test(b.pt_state.trim())))) return fail('pt_state must be a state name or code.');
  if (b.pf_enabled !== undefined && typeof b.pf_enabled !== 'boolean') return fail('pf_enabled must be true or false.');
  const prev = PROFILES.get(emp.id);
  const row: Profile = {
    regime: b.regime !== undefined ? (b.regime as Profile['regime']) : (prev?.regime ?? null),
    declarations: decl !== undefined ? decl : (prev?.declarations ?? 0),
    pt_state: typeof b.pt_state === 'string' ? b.pt_state.trim().toUpperCase() : (prev?.pt_state ?? ''),
    pf_enabled: typeof b.pf_enabled === 'boolean' ? b.pf_enabled : prev ? prev.pf_enabled !== false : true,
    tds_monthly: tdsM !== undefined ? tdsM : (prev?.tds_monthly ?? 0),
  };
  PROFILES.set(emp.id, row);
  return { ok: true, profile: publicProfile(row) };
}

function preview(b: Record<string, unknown>) {
  const v = validateComponents(b.components);
  if ('error' in v) return fail(v.error);
  const ctc = rupeesToPaise(b.annual_ctc, 1e9);
  if (!ctc) return fail('annual_ctc must be rupees.');
  const bk = computeBreakup(ctc, v.value);
  if ('error' in bk) return fail(bk.error);
  const out: Breakup = {
    annualCtc: R(bk.value.annualCtc),
    monthlyCtc: R(bk.value.monthlyCtc),
    gross: R(bk.value.gross),
    employer: R(bk.value.employer),
    lines: bk.value.lines.map((l) => ({ ...l, amount: R(l.amount) })),
  };
  return { ok: true, breakup: out };
}

const guard =
  (what: string, module: string, fn: (p: string[], body: Record<string, unknown>) => unknown) =>
  (p: string[], body: unknown) =>
    admin(what, module) ?? fn(p, (body && typeof body === 'object' ? body : {}) as Record<string, unknown>);

export const payrollRoutes: Route[] = [
  // Statutory & TDS (read here; editing stays on the website).
  ['GET', /^\/hr\/statutory$/, guard('view statutory settings', 'tax', () => ({ ok: true, statutory: STATUTORY, missing: statutoryMissing(STATUTORY) }))],
  // Payroll settings.
  ['GET', /^\/hr\/payroll\/settings$/, guard('view payroll settings', 'payroll', () => ({ ok: true, settings: { ...SETTINGS } }))],
  [
    'PUT',
    /^\/hr\/payroll\/settings$/,
    guard('change payroll settings', 'payroll', (_p, b) => {
      if (b.lopSource !== 'unpaid_leave' && b.lopSource !== 'unpaid_leave_and_absence') return fail('lopSource must be unpaid_leave or unpaid_leave_and_absence.');
      SETTINGS.lopSource = b.lopSource;
      return { ok: true, settings: { ...SETTINGS } };
    }),
  ],
  // Structures.
  ['GET', /^\/hr\/salary\/structures$/, guard('view salary structures', 'salary', () => ({ ok: true, structures: activeStructures().map(publicStructure) }))],
  ['POST', /^\/hr\/salary\/structures\/preview$/, guard('preview salary structures', 'salary', (_p, b) => preview(b))],
  [
    'DELETE',
    /^\/hr\/salary\/structures\/([^/]+)$/,
    guard('manage salary structures', 'salary', ([, id]) => {
      const s = STRUCTURES.find((x) => x.id === id && x.active);
      if (!s) return fail('Structure not found.', 404);
      s.active = false;
      return { ok: true };
    }),
  ],
  // Salaries and tax profiles.
  ['GET', /^\/hr\/salary\/people$/, guard('view salaries', 'salary', () => ({ ok: true, people: salaryPeople() }))],
  ['POST', /^\/hr\/salary\/assign$/, guard('assign salaries', 'salary', (_p, b) => assignSalary(b))],
  ['DELETE', /^\/hr\/salary\/assign\/([^/]+)$/, guard('assign salaries', 'salary', ([, id]) => removeRevision(String(id)))],
  ['PUT', /^\/hr\/salary\/people\/([^/]+)\/profile$/, guard('edit tax profiles', 'salary', ([, id], b) => saveProfile(String(id), b))],
  // Runs.
  ['GET', /^\/hr\/payroll\/runs$/, guard('view payroll', 'payroll', () => ({ ok: true, runs: [...RUNS].sort((a, b) => b.month.localeCompare(a.month)).map(publicRun) }))],
  ['POST', /^\/hr\/payroll\/runs$/, guard('run payroll', 'payroll', (_p, b) => createRun(b))],
  [
    'POST',
    /^\/hr\/payroll\/runs\/([^/]+)\/recompute$/,
    guard('run payroll', 'payroll', ([, id]) => {
      const { run, err } = ownRun(String(id), true);
      if (err) return err;
      const b = rebuild(run, run.items);
      if (b.err) return b.err;
      run.items = b.items;
      run.totals = totalsOf(run.items);
      return { ok: true, totals: totalsToRupees(run.totals) };
    }),
  ],
  ['PUT', /^\/hr\/payroll\/runs\/([^/]+)\/items\/([^/]+)$/, guard('edit payroll', 'payroll', ([, id, itemId], b) => saveLine(String(id), String(itemId), b))],
  ['POST', /^\/hr\/payroll\/runs\/([^/]+)\/lock$/, guard('lock payroll', 'payroll', ([, id], b) => lockRun(String(id), b))],
  [
    'POST',
    /^\/hr\/payroll\/runs\/([^/]+)\/finalise$/,
    guard('lock payroll', 'payroll', ([, id]) => {
      const { run, err } = ownRun(String(id));
      if (err) return err;
      if (run.status !== 'locked') return fail('Only a locked payroll can be finalised.', 409);
      return { ok: true };
    }),
  ],
  [
    'GET',
    /^\/hr\/payroll\/runs\/([^/]+)$/,
    guard('view payroll', 'payroll', ([, id]) => {
      const { run, err } = ownRun(String(id));
      if (err) return err;
      return { ok: true, run: publicRun(run), items: run.items.map(publicItem) };
    }),
  ],
  [
    'DELETE',
    /^\/hr\/payroll\/runs\/([^/]+)$/,
    guard('run payroll', 'payroll', ([, id]) => {
      const { run, err } = ownRun(String(id), true);
      if (err) return err;
      RUNS.splice(RUNS.indexOf(run), 1);
      return { ok: true };
    }),
  ],
];
