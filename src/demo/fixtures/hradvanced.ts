// Demo API for the hradvanced domain (wave 3): the salary-structure editor, the statutory/TDS editor,
// the HR database check, and today's shoots for "Extend a shoot". Shapes, refusals and the server's
// own words mirror the handlers:
//   hr_payroll.js     POST /hr/salary/structures ~L121 (409 duplicate name), PUT …/:id ~L140,
//                     PUT /hr/statutory ~L65 (normaliseStatutory), readStructure ~L98
//   hr_payroll_calc.js  validateComponents ~L26, normaliseRegime / normaliseStatutory ~L90–150,
//                     statutoryMissing ~L152 — ported below
//   hr.js:437         GET /hr/admin/db-check (HR_ADMIN_ROLES)
// Branding and professional categories need nothing here: company.ts already answers PUT /tenants/:id
// for every key (logoUrl, logoText, reportLogoUrl, profTypes). Extending a shoot uses booking.ts's
// GET/PUT /bookings and holds; this file only adds today's shoots for Afzal Manager's team.
//
// payroll.ts keeps its structures and statutory settings private, so:
//   - PUT /hr/statutory changes payroll.ts's own settings object in place (its GET handler hands out
//     the live object), so the next payroll run and the read-only screen use the new values;
//   - structures created or edited here live in an overlay that GET /hr/salary/structures merges over
//     payroll.ts's list. That needs these routes in front of payroll.ts's in the barrel (HANDOFF.md).
//     A structure created here can be shown, edited, previewed and retired; payroll.ts's own
//     POST /hr/salary/assign only knows its three seeded structures (HANDOFF.md asks for an export).

import type { CompCalc, CompKind, SalaryComponent, SalaryStructure, Statutory, StatutoryAnswer, TdsRegime } from '@/api/payroll';
import { DEMO_USER } from '@/demo/config';
import { payrollRoutes } from '@/demo/fixtures/payroll';
import { bookingStore, type DemoBooking } from '@/demo/fixtures/tasks';
import { currentPersona } from '@/demo/personas';
import { clone, daysAgo, fail, newId, today, type DemoError, type Route } from '@/demo/state';

// ── Gates (hr.js hrAdminGate, the server's words) ────────────────────────────
function admin(what: string, module: string): DemoError | null {
  const p = currentPersona();
  if (!['super_admin', 'hr'].includes(p.role)) return fail(`You do not have permission to ${what}.`, 403);
  if (!p.tenant) return fail('HR is not available for this account.', 403);
  if (!p.hr.enabled || !p.hr.modules.includes(module)) return fail('HR is not enabled for your company. Ask your administrator.', 403);
  return null;
}
const isError = (x: unknown): x is DemoError => !!x && typeof x === 'object' && typeof (x as DemoError).error === 'string' && typeof (x as DemoError).status === 'number';

/** payroll.ts's own handler for a request (first route that matches), called directly. */
function payrollHandler(method: Route[0], path: string) {
  for (const [m, re, h] of payrollRoutes) {
    const hit = m === method ? re.exec(path) : null;
    if (hit) return (body: unknown = {}) => h(hit.map((x) => (x === undefined ? '' : decodeURIComponent(x))), body, new URLSearchParams());
  }
  return null;
}

// ── validateComponents (hr_payroll_calc.js ~L26), in rupees on the wire ─────
const CODE_RE = /^[A-Z][A-Z0-9_]{1,11}$/;
const CALCS: CompCalc[] = ['fixed', 'pct_ctc', 'pct_basic', 'balance'];
const isPct = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 && Math.abs(Math.round(v * 100) - v * 100) < 1e-6;
const isRupees = (v: unknown, max = 1e6): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max && Math.abs(Math.round(v * 100) - v * 100) < 1e-6;
const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function validateComponents(list: unknown): { error: string } | { value: SalaryComponent[] } {
  if (!Array.isArray(list) || list.length < 1 || list.length > 20) return { error: 'A structure needs 1–20 components.' };
  const out: SalaryComponent[] = [];
  const seen = new Set<string>();
  for (const c of list as Record<string, unknown>[]) {
    if (!c || typeof c !== 'object') return { error: 'Invalid component.' };
    const code = typeof c.code === 'string' ? c.code.trim().toUpperCase() : '';
    if (!CODE_RE.test(code)) return { error: 'Component codes are 2–12 capital letters/digits (e.g. BASIC, HRA).' };
    if (seen.has(code)) return { error: `Component ${code} appears twice.` };
    seen.add(code);
    const name = typeof c.name === 'string' ? c.name.trim().slice(0, 40) : '';
    if (name.length < 2) return { error: `Component ${code} needs a name.` };
    if (c.kind !== 'earning' && c.kind !== 'employer') return { error: `${code}: kind must be earning or employer (employer = part of CTC paid by the company, not to the employee).` };
    if (!CALCS.includes(c.calc as CompCalc)) return { error: `${code}: calc must be fixed, pct_ctc, pct_basic or balance.` };
    const calc = c.calc as CompCalc;
    let value = 0;
    if (calc === 'fixed') {
      if (!isRupees(c.value)) return { error: `${code}: fixed amount must be rupees with at most 2 decimals.` };
      value = c.value;
    } else if (calc === 'pct_ctc' || calc === 'pct_basic') {
      if (!isPct(c.value)) return { error: `${code}: percentage must be 0–100 with at most 2 decimals.` };
      value = c.value;
    }
    if (calc === 'balance' && c.kind !== 'earning') return { error: `${code}: only an earning can take the balance.` };
    if (code === 'BASIC' && !['fixed', 'pct_ctc'].includes(calc)) return { error: 'BASIC must be a fixed amount or a % of CTC.' };
    if (code === 'BASIC' && c.kind !== 'earning') return { error: 'BASIC must be an earning.' };
    for (const k of ['taxable', 'pf_wage']) if (c[k] !== undefined && typeof c[k] !== 'boolean') return { error: `${code}: ${k} must be true or false.` };
    out.push({ code, name, kind: c.kind as CompKind, calc, value, taxable: c.taxable !== false, pf_wage: c.pf_wage === undefined ? code === 'BASIC' : !!c.pf_wage });
  }
  if (!out.some((c) => c.code === 'BASIC')) return { error: 'A structure must have a BASIC component.' };
  if (out.filter((c) => c.calc === 'balance').length > 1) return { error: 'Only one component can take the balance.' };
  return { value: out };
}

function readStructure(b: Record<string, unknown>): { error: string } | { value: { name: string; description: string; components: SalaryComponent[] } } {
  const name = cleanText(b.name, 60);
  if (name.length < 2) return { error: 'Structure name is required (60 characters max).' };
  const v = validateComponents(b.components);
  if ('error' in v) return v;
  return { value: { name, description: cleanText(b.description, 300), components: v.value } };
}

// ── The structures overlay ───────────────────────────────────────────────────
const ADDED: SalaryStructure[] = [];
const EDITED = new Map<string, SalaryStructure>(); // payroll.ts structures changed here
const RETIRED = new Set<string>(); // payroll.ts structures retired after an edit here

function baseStructures(): SalaryStructure[] | DemoError {
  const h = payrollHandler('GET', '/hr/salary/structures');
  const r = h ? (h() as { structures?: SalaryStructure[] } | DemoError) : { structures: [] };
  if (isError(r)) return r;
  return Array.isArray(r.structures) ? r.structures : [];
}
function activeStructures(): SalaryStructure[] {
  const base = baseStructures();
  const list = (isError(base) ? [] : base).filter((s) => !RETIRED.has(s.id)).map((s) => EDITED.get(s.id) ?? s);
  return [...list, ...ADDED].sort((a, b) => a.name.localeCompare(b.name));
}
const nameTaken = (name: string, exceptId?: string) => activeStructures().some((s) => s.id !== exceptId && s.name.toLowerCase() === name.toLowerCase());

// ── normaliseStatutory (hr_payroll_calc.js ~L108) ────────────────────────────
const EMPTY: Statutory = {
  pf: { enabled: false, employeeRatePct: null, employerRatePct: null, wageCeiling: null, capAtCeiling: true, rounding: null },
  esi: { enabled: false, employeeRatePct: null, employerRatePct: null, grossLimit: null, rounding: null },
  pt: { enabled: false, slabs: [] },
  tds: { mode: 'off', defaultRegime: null, regimes: { new: null, old: null } },
};
const money = (v: unknown) => v === null || isRupees(v, 1e10);
const pctOrNull = (v: unknown) => v === null || isPct(v);

function normaliseRegime(r: unknown): { error: string } | { value: TdsRegime | null } {
  if (r === null || r === undefined) return { value: null };
  if (typeof r !== 'object') return { error: 'Tax regime must be an object.' };
  const x = r as Record<string, unknown>;
  for (const k of ['standardDeduction', 'rebateLimit', 'rebateMax']) if (x[k] !== undefined && !money(x[k])) return { error: `TDS ${k} must be rupees.` };
  if (x.cessPct !== undefined && !pctOrNull(x.cessPct)) return { error: 'TDS cess must be a percentage.' };
  const slabs = x.slabs === undefined ? [] : x.slabs;
  if (!Array.isArray(slabs) || slabs.length > 15) return { error: 'TDS slabs must be a list (15 max).' };
  let prev = -1;
  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i] as Record<string, unknown> | null;
    if (!s || !isPct(s.ratePct)) return { error: 'Each TDS slab needs a rate (0–100%).' };
    const last = i === slabs.length - 1;
    if (last ? s.upto !== null : !(money(s.upto) && s.upto !== null && (s.upto as number) > prev)) return { error: 'TDS slab limits must increase, and the last slab must have no upper limit (upto: null).' };
    if (!last) prev = s.upto as number;
  }
  return {
    value: {
      standardDeduction: (x.standardDeduction as number | null) ?? null,
      rebateLimit: (x.rebateLimit as number | null) ?? null,
      rebateMax: (x.rebateMax as number | null) ?? null,
      cessPct: (x.cessPct as number | null) ?? null,
      slabs: (slabs as { upto: number | null; ratePct: number }[]).map((s) => ({ upto: s.upto, ratePct: s.ratePct })),
    },
  };
}

function normaliseStatutory(input: unknown, base: Statutory): { error: string } | { value: Statutory } {
  const cur = clone(base);
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, Record<string, unknown> | undefined>;
  const bool = (v: unknown, n: string) => (v === undefined || typeof v === 'boolean' ? null : `${n} must be true or false.`);
  const pick = <T extends object>(p: Record<string, unknown>, keysOf: T) => Object.fromEntries(Object.entries(p).filter(([k]) => k in keysOf)) as Partial<T>;
  if (src.pf !== undefined) {
    const p = src.pf || {};
    const e = bool(p.enabled, 'PF enabled') || bool(p.capAtCeiling, 'PF cap');
    if (e) return { error: e };
    for (const k of ['employeeRatePct', 'employerRatePct']) if (p[k] !== undefined && !pctOrNull(p[k])) return { error: `PF ${k} must be a percentage.` };
    if (p.wageCeiling !== undefined && !money(p.wageCeiling)) return { error: 'PF wage ceiling must be rupees.' };
    if (p.rounding !== undefined && ![null, 'nearest', 'up'].includes(p.rounding as string | null)) return { error: 'PF rounding must be nearest or up.' };
    Object.assign(cur.pf, pick(p, EMPTY.pf));
  }
  if (src.esi !== undefined) {
    const p = src.esi || {};
    const e = bool(p.enabled, 'ESI enabled');
    if (e) return { error: e };
    for (const k of ['employeeRatePct', 'employerRatePct']) if (p[k] !== undefined && !pctOrNull(p[k])) return { error: `ESI ${k} must be a percentage.` };
    if (p.grossLimit !== undefined && !money(p.grossLimit)) return { error: 'ESI gross limit must be rupees.' };
    if (p.rounding !== undefined && ![null, 'nearest', 'up'].includes(p.rounding as string | null)) return { error: 'ESI rounding must be nearest or up.' };
    Object.assign(cur.esi, pick(p, EMPTY.esi));
  }
  if (src.pt !== undefined) {
    const p = src.pt || {};
    const e = bool(p.enabled, 'PT enabled');
    if (e) return { error: e };
    if (p.slabs !== undefined) {
      if (!Array.isArray(p.slabs) || p.slabs.length > 100) return { error: 'PT slabs must be a list (100 max).' };
      for (const s of p.slabs as Record<string, unknown>[]) {
        if (!s || typeof s.state !== 'string' || !/^[A-Za-z][A-Za-z .-]{1,29}$/.test(s.state.trim())) return { error: 'Each PT slab needs a state name or code.' };
        if (!money(s.minGross) || s.minGross === null || !(s.maxGross === null || (money(s.maxGross) && (s.maxGross as number) >= (s.minGross as number))) || !money(s.amount) || s.amount === null)
          return { error: `PT slab for ${s.state}: min/max gross and amount must be rupees (max may be null = no limit).` };
      }
      cur.pt.slabs = (p.slabs as Record<string, unknown>[]).map((s) => ({
        state: String(s.state).trim().toUpperCase(),
        minGross: s.minGross as number,
        maxGross: s.maxGross as number | null,
        amount: s.amount as number,
        ...(s.monthOverrides ? { monthOverrides: s.monthOverrides as Record<string, number> } : {}),
      }));
    }
    if (p.enabled !== undefined) cur.pt.enabled = p.enabled as boolean;
  }
  if (src.tds !== undefined) {
    const p = src.tds || {};
    if (p.mode !== undefined && !['off', 'manual', 'slab'].includes(p.mode as string)) return { error: 'TDS mode must be off, manual or slab.' };
    if (p.defaultRegime !== undefined && ![null, 'new', 'old'].includes(p.defaultRegime as string | null)) return { error: 'Default regime must be new or old.' };
    if (p.mode !== undefined) cur.tds.mode = p.mode as Statutory['tds']['mode'];
    if (p.defaultRegime !== undefined) cur.tds.defaultRegime = p.defaultRegime as Statutory['tds']['defaultRegime'];
    if (p.regimes !== undefined) {
      if (typeof p.regimes !== 'object' || p.regimes === null) return { error: 'regimes must be an object.' };
      const rs = p.regimes as Record<string, unknown>;
      for (const k of ['new', 'old'] as const) {
        if (rs[k] === undefined) continue;
        const r = normaliseRegime(rs[k]);
        if ('error' in r) return r;
        cur.tds.regimes[k] = r.value;
      }
    }
  }
  return { value: cur };
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

/** payroll.ts's live settings object (its GET handler returns it as is). */
function liveStatutory(): Statutory | DemoError {
  const h = payrollHandler('GET', '/hr/statutory');
  const r = h ? (h() as StatutoryAnswer | DemoError) : fail('Statutory settings are not available.', 404);
  return isError(r) ? r : r.statutory;
}

// ── HR database check (hr.js:437) ────────────────────────────────────────────
const HR_SQL_FILES = ['sql/hr_core.sql', 'sql/hr_time.sql', 'sql/hr_leave.sql', 'sql/hr_policies.sql', 'sql/hr_payroll.sql', 'sql/hr_timesheet.sql'];
const HR_TABLES: [string, number][] = [
  ['hr_tenant_access', 0],
  ['hr_department_access', 0],
  ['hr_attendance', 1],
  ['hr_shifts', 1],
  ['hr_holidays', 1],
  ['hr_leave_types', 2],
  ['hr_leave_requests', 2],
  ['hr_policies', 3],
  ['hr_salary_structures', 4],
  ['hr_payroll_runs', 4],
  ['hr_timesheets', 5],
];

// ── Today's shoots for Afzal Manager's team (Extend a shoot) ─────────────────
// Sanjay (editor) is booked 10:00–13:00 and again 14:00–17:30, so his first shoot can only run to
// 14:00; Sneha (graphic designer) is booked 11:00–15:00 with nothing after, so hers can run long.
const T0 = today();
// The demo person (demo/server.ts shows the active persona's name): Afzal Manager approved these.
const ME = String(DEMO_USER.name);
const SHOOTS: DemoBooking[] = [
  {
    id: 'bkx-sanjay-am',
    type: 'professionals',
    status: 'approved',
    resource: 'Sanjay Kumar',
    resourceId: 'u-sanjay',
    profType: 'editor',
    profDept: 'Creative',
    profDeptName: 'Creative',
    requestedBy: 'Priya Sharma',
    requestedById: 'u-priya',
    date: T0,
    dates: [T0],
    startTime: '10:00',
    endTime: '13:00',
    project: 'Sunrise Jewellers — Diwali Brand Film',
    kekaCode: 'TM_SJW_DIWALI26',
    comments: 'On-set rough cut for the client review at lunch.',
    reason: '',
    reviews: [],
    approvedBy: ME,
    approvedAt: daysAgo(1, '17:10'),
    createdAt: daysAgo(2, '11:05'),
  },
  {
    id: 'bkx-sanjay-pm',
    type: 'professionals',
    status: 'approved',
    resource: 'Sanjay Kumar',
    resourceId: 'u-sanjay',
    profType: 'editor',
    profDept: 'Creative',
    profDeptName: 'Creative',
    requestedBy: 'Vikram Singh',
    requestedById: 'u-vikram',
    date: T0,
    dates: [T0],
    startTime: '14:00',
    endTime: '17:30',
    project: 'Nimbus Fintech — Explainer Series',
    kekaCode: 'TM_NMB_EXPL',
    comments: 'Episode 3 colour pass.',
    reason: '',
    reviews: [],
    approvedBy: ME,
    approvedAt: daysAgo(1, '18:00'),
    createdAt: daysAgo(3, '15:40'),
  },
  {
    id: 'bkx-sneha',
    type: 'professionals',
    status: 'approved',
    resource: 'Sneha Iyer',
    resourceId: 'u-sneha',
    profType: 'graphic_designer',
    profDept: 'Creative',
    profDeptName: 'Creative',
    requestedBy: 'Deepa Menon',
    requestedById: 'u-deepa',
    date: T0,
    dates: [T0],
    startTime: '11:00',
    endTime: '15:00',
    project: 'Kisan Agro — Product Launch Film',
    kekaCode: 'TM_KAG_LAUNCH',
    comments: 'Lower thirds and the end card for the launch film.',
    reason: '',
    reviews: [],
    approvedBy: ME,
    approvedAt: daysAgo(1, '12:30'),
    createdAt: daysAgo(2, '09:50'),
  },
];
for (const s of SHOOTS) if (!bookingStore.some((b) => b.id === s.id)) bookingStore.push(s);

// ── Routes ───────────────────────────────────────────────────────────────────
const guard =
  (what: string, module: string, fn: (p: string[], body: Record<string, unknown>) => unknown) =>
  (p: string[], body: unknown) =>
    admin(what, module) ?? fn(p, (body && typeof body === 'object' ? body : {}) as Record<string, unknown>);

export const hradvancedRoutes: Route[] = [
  // Structures: the overlay over payroll.ts's list.
  ['GET', /^\/hr\/salary\/structures$/, guard('view salary structures', 'salary', () => ({ ok: true, structures: clone(activeStructures()) }))],
  [
    'POST',
    /^\/hr\/salary\/structures$/,
    guard('manage salary structures', 'salary', (_p, b) => {
      const v = readStructure(b);
      if ('error' in v) return fail(v.error);
      if (nameTaken(v.value.name)) return fail('A structure with that name already exists.', 409);
      const s: SalaryStructure = { id: newId('hss'), ...v.value };
      ADDED.push(s);
      return { ok: true, structure: clone(s) };
    }),
  ],
  [
    'PUT',
    /^\/hr\/salary\/structures\/([^/]+)$/,
    guard('manage salary structures', 'salary', ([, id], b) => {
      const cur = activeStructures().find((s) => s.id === id);
      if (!cur) return fail('Structure not found.', 404);
      const v = readStructure({ ...cur, ...b });
      if ('error' in v) return fail(v.error);
      if (nameTaken(v.value.name, cur.id)) return fail('A structure with that name already exists.', 409);
      const next: SalaryStructure = { id: cur.id, ...v.value };
      const i = ADDED.findIndex((s) => s.id === cur.id);
      if (i >= 0) ADDED[i] = next;
      else EDITED.set(cur.id, next);
      return { ok: true, structure: clone(next) };
    }),
  ],
  [
    'DELETE',
    /^\/hr\/salary\/structures\/([^/]+)$/,
    guard('manage salary structures', 'salary', ([, id]) => {
      const i = ADDED.findIndex((s) => s.id === id);
      if (i >= 0) {
        ADDED.splice(i, 1);
        return { ok: true };
      }
      if (!activeStructures().some((s) => s.id === id)) return fail('Structure not found.', 404);
      const h = payrollHandler('DELETE', `/hr/salary/structures/${id}`);
      const r = h ? h() : { ok: true };
      if (isError(r)) return r;
      EDITED.delete(String(id));
      RETIRED.add(String(id));
      return { ok: true };
    }),
  ],
  // Statutory & TDS: changes payroll.ts's live settings, so runs use them at once.
  [
    'PUT',
    /^\/hr\/statutory$/,
    guard('change statutory settings', 'tax', (_p, b) => {
      const live = liveStatutory();
      if (isError(live)) return live;
      const n = normaliseStatutory(b, live);
      if ('error' in n) return fail(n.error);
      // In place, so anything in payroll.ts holding these objects sees the new values.
      Object.assign(live.pf, n.value.pf);
      Object.assign(live.esi, n.value.esi);
      live.pt.enabled = n.value.pt.enabled;
      live.pt.slabs = n.value.pt.slabs;
      live.tds.mode = n.value.tds.mode;
      live.tds.defaultRegime = n.value.tds.defaultRegime;
      live.tds.regimes = n.value.tds.regimes;
      return { ok: true, statutory: clone(live), missing: statutoryMissing(live) };
    }),
  ],
  // HR database check: every table is there in the demo.
  [
    'GET',
    /^\/hr\/admin\/db-check$/,
    () => {
      if (!['master_admin', 'super_admin', 'hr'].includes(currentPersona().role)) return fail('Only HR admins can run the HR database check.', 403);
      return { ok: true, runFiles: [], order: HR_SQL_FILES, results: HR_TABLES.map(([table, f]) => ({ table, ok: true, file: HR_SQL_FILES[f] })) };
    },
  ],
];
