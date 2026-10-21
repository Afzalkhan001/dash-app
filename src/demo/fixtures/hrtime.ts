// Demo API for the hrtime domain (HR setup): offices and the company clock-in policy, per-person
// clock-in rules, shifts and who works them, holidays, leave types and rules, company leave balances
// with adjustments and carry forward, and writing policies. Shapes and refusals mirror the handlers:
//   hr.js           hrAdminGate ~L599 (Super Admin and HR only, module on), normaliseAttendanceSettings
//                   ~L125, /locations ~L624–672, /attendance/people ~L674–720
//   hr_time.js      /holidays ~L38–84 (409 on a duplicate date), /shifts ~L105–195 (assignments before :id)
//   hr_leave.js     settings ~L99, types ~L137–178, balances ~L230, adjustments ~L246, carry-forward ~L267
//   hr_policies.js  list/detail/acknowledge ~L80–165, create/update (version bump, archived 409) ~L105–137,
//                   publish/archive ~L139, -meta/departments ~L174, acks ~L183
// These routes win over the built-in fixtures (demo/fixtures/index.ts), so the employee screens see
// every change: offices and policy hours feed the clock card (the shared LOCATIONS / SETTINGS objects
// are changed in place), leave types and rules feed Apply leave (LEAVE_TYPES / LEAVE_SETTINGS), and the
// policies list, detail and acknowledge are answered here from one store seeded with the built-in ones.
// "Me" is DEMO_USER (demo/server.ts swaps it with the active persona), so self-checks compare with it.

import type { AttendanceSettings, MyShift, OfficeLocation, Shift } from '@/api/attendance';
import type { Holiday } from '@/api/hr';
import type { ClockMode, ClockRulePerson, CompanyBalance, CompanyBalances, PolicyAcks, ShiftPerson } from '@/api/hrtime';
import type { LeaveBalanceRow, LeaveSettings, LeaveType } from '@/api/leave';
import type { Policy, PolicySummary } from '@/api/policies';
import { DEMO_USER } from '@/demo/config';
import { MY_SHIFT, SETTINGS } from '@/demo/fixtures/attendance';
import { LEAVE_SETTINGS, LEAVE_TYPES, leaveRoutes } from '@/demo/fixtures/leave';
import { allPeople, DEPARTMENTS, deptIdOf } from '@/demo/fixtures/org';
import { policyRoutes } from '@/demo/fixtures/policies';
import { currentPersona } from '@/demo/personas';
import { addDays, daysAgo, fail, holidaysFor, newId, nowIso, rand, today, type Route } from '@/demo/state';
import { LOCATIONS } from '@/demo/timeline';

const ME = () => DEMO_USER.id;
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (d: unknown): d is string => typeof d === 'string' && DATE_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const round2 = (n: number) => Math.round(n * 100) / 100;
const isHalfStep = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.round(n * 2) === n * 2;
const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const hhmm = (s: unknown) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// ── Gates (hr.js gate / hrAdminGate, with the server's own words) ────────────
function moduleOff(module: string) {
  const p = currentPersona();
  if (!p.tenant) return fail('HR is not available for this account.', 403);
  if (!p.hr.enabled || !p.hr.modules.includes(module)) return fail('This HR feature is not enabled for your department. Ask your Super Admin (Config → HR Access).', 403);
  return null;
}
const gate = (module: string) => moduleOff(module);
function admin(what: string, module = 'attendance') {
  const p = currentPersona();
  if (!['super_admin', 'hr'].includes(p.role)) return fail(`You do not have permission to ${what}.`, 403);
  return moduleOff(module);
}
const isHrAdmin = () => ['super_admin', 'hr'].includes(currentPersona().role);

// ── The company's people (hr_common.js listCompanyPeople: every punch role, by name) ──
// hr.js PUNCH_ROLES = EMPLOYEE_ROLES without master_admin.
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

// ── Offices and the company clock-in policy ──────────────────────────────────
function readOffice(b: Record<string, unknown>) {
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > 80) return { error: 'Name is required (80 characters max).' };
  const { lat, lng } = b;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: 'Pick a valid point on the map.' };
  }
  const r = b.radius_m;
  if (typeof r !== 'number' || !Number.isInteger(r) || r < 25 || r > 5000) return { error: 'Radius must be a whole number of metres between 25 and 5000.' };
  const address = typeof b.address === 'string' ? b.address.trim().slice(0, 200) : '';
  return { value: { name, lat, lng, radius_m: r, address } };
}

function readAttendanceSettings(src: Record<string, unknown>): { value: AttendanceSettings } | { error: string } {
  const out: AttendanceSettings = { ...SETTINGS, weeklyOff: [...SETTINGS.weeklyOff] };
  for (const k of ['requireGeofence', 'allowRemote'] as const) {
    if (k in src) {
      if (typeof src[k] !== 'boolean') return { error: `${k} must be true or false.` };
      out[k] = src[k] as boolean;
    }
  }
  const ints: [keyof AttendanceSettings, number, number][] = [
    ['maxAccuracyM', 10, 1000],
    ['graceMinutes', 0, 240],
    ['halfDayMinutes', 30, 1440],
    ['fullDayMinutes', 60, 1440],
    ['regularizationWindowDays', 1, 365],
  ];
  for (const [k, lo, hi] of ints) {
    if (!(k in src)) continue;
    const n = src[k];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < lo || n > hi) return { error: `${k} must be a whole number between ${lo} and ${hi}.` };
    (out as Record<string, unknown>)[k] = n;
  }
  if ('weeklyOff' in src) {
    const w = src.weeklyOff;
    if (!Array.isArray(w) || w.length > 6 || !w.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return { error: 'weeklyOff must be a list of weekdays 0–6 (0 = Sunday).' };
    out.weeklyOff = [...new Set(w as number[])].sort((a, b) => a - b);
  }
  for (const k of ['shiftStart', 'shiftEnd'] as const) {
    if (k in src) {
      if (hhmm(src[k]) === null) return { error: `${k} must be HH:MM (24-hour).` };
      out[k] = String(src[k]);
    }
  }
  if (out.halfDayMinutes >= out.fullDayMinutes) return { error: 'Half-day minutes must be less than full-day minutes.' };
  if ((hhmm(out.shiftEnd) ?? 0) <= (hhmm(out.shiftStart) ?? 0)) return { error: 'Shift end must be after shift start (overnight shifts are not supported yet).' };
  return { value: out };
}

// ── Per-person clock-in rules (three samples; everyone else on the company default) ──
const RULES = new Map<string, { mode: Exclude<ClockMode, 'default'>; location_ids: string[] }>([
  ['u-zoya', { mode: 'remote', location_ids: [] }],
  ['u-farhan', { mode: 'flexible', location_ids: ['loc-hq', 'loc-studio'] }],
  ['u-imran', { mode: 'geofence', location_ids: ['loc-studio'] }],
]);

function clockPeople(): ClockRulePerson[] {
  return companyPeople().map((p) => {
    const r = RULES.get(p.id);
    return { id: p.id, name: p.name, role: p.role, department: p.department, mode: r?.mode ?? 'default', location_ids: r ? [...r.location_ids] : [] };
  });
}

function setRules(b: Record<string, unknown>) {
  const ids = b.employee_ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 500) return fail('Choose between 1 and 500 employees.');
  const uniq = [...new Set(ids)];
  if (!uniq.every((i) => typeof i === 'string' && ID_RE.test(i))) return fail('Invalid employee selection.');
  const mode = b.mode;
  if (mode !== 'default' && mode !== 'geofence' && mode !== 'flexible' && mode !== 'remote') return fail('Clock-in mode must be default, geofence, flexible or remote.');
  let locs: string[] = [];
  if (mode === 'geofence' || mode === 'flexible') {
    const raw = b.location_ids === undefined ? [] : b.location_ids;
    if (!Array.isArray(raw) || raw.length > 50 || !raw.every((i) => typeof i === 'string' && ID_RE.test(i))) return fail('Invalid location selection.');
    locs = [...new Set(raw as string[])];
    if (locs.some((i) => !LOCATIONS.some((l) => l.id === i))) return fail('One of the chosen locations does not exist.');
  }
  const known = new Set(companyPeople().map((p) => p.id));
  if (!uniq.every((i) => known.has(i as string))) return fail('One or more selected people are not in your company.', 404);
  for (const id of uniq as string[]) {
    if (mode === 'default') RULES.delete(id);
    else RULES.set(id, { mode, location_ids: locs });
  }
  return { ok: true, updated: uniq.length };
}

// ── Shifts (hr_time.js) ──────────────────────────────────────────────────────
const SHIFTS: Shift[] = [
  { ...MY_SHIFT, weekly_off: [...MY_SHIFT.weekly_off], half_day_minutes: 240, full_day_minutes: 480 },
  { id: 'hs-late-edit', name: 'Late Edit Shift', start_time: '12:00', end_time: '21:00', grace_minutes: 15, half_day_minutes: 240, full_day_minutes: 480, weekly_off: [0, 6] },
  { id: 'hs-shoot', name: 'Shoot Crew (Tue–Sat)', start_time: '07:00', end_time: '16:00', grace_minutes: 10, half_day_minutes: 240, full_day_minutes: 480, weekly_off: [0, 1] },
];
const ON_SHIFT = new Map<string, string>([
  [DEMO_USER.id, 'hs-general'],
  ['u-sanjay', 'hs-general'],
  ['u-sneha', 'hs-general'],
  ['u-kavya', 'hs-general'],
  ['u-nikhil', 'hs-general'],
  ['u-rahul', 'hs-late-edit'],
  ['u-anita', 'hs-late-edit'],
  ['u-deepa', 'hs-shoot'],
  ['u-farhan', 'hs-shoot'],
  ['u-imran', 'hs-shoot'],
]);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function readShift(b: Record<string, unknown>): { value: Omit<Shift, 'id'> } | { error: string } {
  const name = cleanText(b.name, 60);
  if (name.length < 2) return { error: 'Shift name is required (60 characters max).' };
  for (const k of ['start_time', 'end_time'] as const) if (hhmm(b[k]) === null) return { error: `${k.replace('_', ' ')} must be HH:MM (24-hour).` };
  if ((hhmm(b.end_time) ?? 0) <= (hhmm(b.start_time) ?? 0)) return { error: 'Shift end must be after shift start (overnight shifts are not supported yet).' };
  const int = (k: string, lo: number, hi: number) => typeof b[k] === 'number' && Number.isInteger(b[k]) && (b[k] as number) >= lo && (b[k] as number) <= hi;
  if (!int('grace_minutes', 0, 240)) return { error: 'Grace minutes must be a whole number 0–240.' };
  if (!int('half_day_minutes', 30, 1440) || !int('full_day_minutes', 60, 1440) || (b.half_day_minutes as number) >= (b.full_day_minutes as number)) {
    return { error: 'Half-day minutes must be less than full-day minutes (30–1440).' };
  }
  const w = b.weekly_off;
  if (!Array.isArray(w) || w.length > 6 || !w.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return { error: 'Weekly off must be a list of weekdays (at most 6).' };
  return {
    value: {
      name,
      start_time: String(b.start_time),
      end_time: String(b.end_time),
      grace_minutes: b.grace_minutes as number,
      half_day_minutes: b.half_day_minutes as number,
      full_day_minutes: b.full_day_minutes as number,
      weekly_off: [...new Set(w as number[])].sort((x, y) => x - y),
    },
  };
}

function myShift(): MyShift | null {
  const s = SHIFTS.find((x) => x.id === ON_SHIFT.get(ME()));
  return s ? { id: s.id, name: s.name, start_time: s.start_time, end_time: s.end_time, grace_minutes: s.grace_minutes, weekly_off: s.weekly_off } : null;
}

function assignShift(b: Record<string, unknown>) {
  const ids = b.employee_ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 500) return fail('Choose between 1 and 500 employees.');
  const known = new Set(companyPeople().map((p) => p.id));
  const uniq = [...new Set(ids)] as string[];
  if (!uniq.every((i) => typeof i === 'string' && known.has(i))) return fail('One or more selected people are not in your company.', 404);
  if (b.shift_id === null) {
    for (const id of uniq) ON_SHIFT.delete(id);
  } else {
    if (typeof b.shift_id !== 'string' || !ID_RE.test(b.shift_id)) return fail('Choose a shift.');
    const s = SHIFTS.find((x) => x.id === b.shift_id);
    if (!s) return fail('That shift does not exist.', 404);
    for (const id of uniq) ON_SHIFT.set(id, s.id);
  }
  return { ok: true, updated: uniq.length };
}

// ── Holidays: each year's list starts from the company calendar, then changes in place ──
const HOLIDAY_YEARS = new Map<string, Holiday[]>();
function holidayYear(year: string): Holiday[] {
  let list = HOLIDAY_YEARS.get(year);
  if (!list) {
    list = holidaysFor(year);
    HOLIDAY_YEARS.set(year, list);
  }
  return list;
}
const sortHolidays = (list: Holiday[]) => list.sort((a, b) => a.date.localeCompare(b.date));
function findHoliday(id: string) {
  for (const list of HOLIDAY_YEARS.values()) {
    const h = list.find((x) => x.id === id);
    if (h) return { h, list };
  }
  // A base id ('hh-2026-10-20') from a year nobody has opened yet.
  const y = /^hh-(\d{4})-/.exec(id)?.[1];
  if (y) {
    const list = holidayYear(y);
    const h = list.find((x) => x.id === id);
    if (h) return { h, list };
  }
  return null;
}
function readHoliday(b: Record<string, unknown>): { value: Omit<Holiday, 'id'> } | { error: string } {
  if (!realDate(b.date)) return { error: 'Pick a valid date.' };
  const name = cleanText(b.name, 80);
  if (name.length < 2) return { error: 'Holiday name is required (80 characters max).' };
  if (b.optional !== undefined && typeof b.optional !== 'boolean') return { error: 'optional must be true or false.' };
  return { value: { date: b.date, name, optional: !!b.optional } };
}

// ── Leave types and rules ────────────────────────────────────────────────────
const CODE_RE = /^[A-Z][A-Z0-9_]{1,11}$/;
function readType(b: Record<string, unknown>): { value: Omit<LeaveType, 'id'> } | { error: string } {
  const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : '';
  if (!CODE_RE.test(code)) return { error: 'Code must be 2–12 capital letters/digits, starting with a letter (e.g. CL, SL, EL).' };
  const name = cleanText(b.name, 60);
  if (name.length < 2) return { error: 'Name is required (60 characters max).' };
  for (const k of ['paid', 'allow_half_day', 'is_comp_off']) if (b[k] !== undefined && typeof b[k] !== 'boolean') return { error: `${k} must be true or false.` };
  if (b.accrual !== 'annual' && b.accrual !== 'monthly') return { error: 'Accrual must be annual or monthly.' };
  for (const k of ['annual_quota', 'carry_forward_max']) {
    const n = b[k];
    if (!isHalfStep(n) || n < 0 || n > 365) return { error: `${k.replace(/_/g, ' ')} must be 0–365 days in steps of 0.5.` };
  }
  if (b.is_comp_off && (b.annual_quota !== 0 || b.carry_forward_max !== 0)) {
    return { error: 'The comp-off type earns credit from worked days only: quota and carry-forward must be 0.' };
  }
  return {
    value: {
      code,
      name,
      paid: b.paid !== false,
      annual_quota: b.annual_quota as number,
      accrual: b.accrual,
      carry_forward_max: b.carry_forward_max as number,
      allow_half_day: b.allow_half_day !== false,
      is_comp_off: !!b.is_comp_off,
    },
  };
}
const sortTypes = () => LEAVE_TYPES.sort((a, b) => a.code.localeCompare(b.code));

function readLeaveSettings(src: Record<string, unknown>): { value: LeaveSettings } | { error: string } {
  const out: LeaveSettings = { ...LEAVE_SETTINGS };
  const rules: [keyof LeaveSettings, number, number][] = [
    ['leaveYearStartMonth', 1, 12],
    ['compOffExpiryDays', 1, 730],
    ['compOffClaimWindowDays', 1, 365],
    ['backdateDays', 0, 365],
    ['maxSpanDays', 1, 366],
  ];
  for (const [k, lo, hi] of rules) {
    if (!(k in src)) continue;
    const n = src[k];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < lo || n > hi) return { error: `${k} must be a whole number between ${lo} and ${hi}.` };
    out[k] = n;
  }
  return { value: out };
}

// ── Company balances ─────────────────────────────────────────────────────────
type Adjustment = { id: string; employee_id: string; leave_type_id: string; year: number; days: number; kind: 'manual' | 'carry_forward'; reason: string };
const ADJUSTMENTS: Adjustment[] = [
  // An opening balance HR keyed in for the newest joiner this year.
  { id: 'hla-demo-1', employee_id: 'u-nikhil', leave_type_id: 'lt-cl', year: Number(today().slice(0, 4)), days: 2, kind: 'manual', reason: 'Joining bonus: 2 extra casual days' },
];
const adjustedFor = (pid: string, tid: string, year: number) => round2(ADJUSTMENTS.filter((a) => a.employee_id === pid && a.leave_type_id === tid && a.year === year).reduce((s, a) => s + a.days, 0));

function leavePeriod(year: number) {
  const mm = String(LEAVE_SETTINGS.leaveYearStartMonth).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: addDays(`${year + 1}-${mm}-01`, -1) };
}
function monthsStarted(year: number, t: string) {
  const p = leavePeriod(year);
  if (t < p.from) return 0;
  if (t > p.to) return 12;
  const [fy, fm] = p.from.split('-').map(Number) as [number, number];
  const [ty, tm] = t.split('-').map(Number) as [number, number];
  return Math.min(12, (ty - fy) * 12 + (tm - fm) + 1);
}
const halfFloor = (n: number) => Math.floor(n * 2) / 2;

/** A colleague's balance for one type and year: plausible, and the same every time it is asked. */
function colleagueBalance(pid: string, t: LeaveType, year: number, at: string, approvedOnly = false): CompanyBalance {
  const adjusted = adjustedFor(pid, t.id, year);
  if (t.is_comp_off) {
    const earned = rand(`co:${pid}:${year}`) < 0.3 ? 1 : 0;
    return { leave_type_id: t.id, entitlement: 0, adjusted: round2(adjusted + earned), used: 0, pending: 0, available: round2(adjusted + earned) };
  }
  const months = monthsStarted(year, at);
  const entitlement = t.accrual === 'monthly' ? round2((t.annual_quota * months) / 12) : months > 0 || year >= Number(at.slice(0, 4)) ? t.annual_quota : 0;
  const share = months / 12;
  const used = t.paid ? halfFloor(Math.min(entitlement, rand(`u:${pid}:${t.id}:${year}`) * entitlement * 0.7 * Math.max(share, 0.2))) : rand(`lop:${pid}:${year}`) < 0.12 ? 1 : 0;
  const pending = approvedOnly || !t.paid ? 0 : rand(`p:${pid}:${t.id}:${year}`) < 0.12 ? 1 : 0;
  return { leave_type_id: t.id, entitlement, adjusted, used, pending, available: round2(entitlement + adjusted - used - pending) };
}

/** My own row: exactly what Apply leave shows me (fixtures/leave.ts /hr/leave/balances/mine). */
function myBalances(year: number): CompanyBalance[] {
  const route = leaveRoutes.find(([m, re]) => m === 'GET' && re.test('/hr/leave/balances/mine'));
  const out = route?.[2](['/hr/leave/balances/mine'], {}, new URLSearchParams({ year: String(year) })) as { balances?: LeaveBalanceRow[] } | undefined;
  return (out?.balances ?? []).map((b) => ({ leave_type_id: b.id, available: b.available, used: b.used, pending: b.pending, entitlement: b.entitlement, adjusted: b.adjusted }));
}

function companyBalances(yearParam: string | null): (CompanyBalances & { ok: true }) | ReturnType<typeof fail> {
  const t = today();
  // hr_leave.js readYear: no year = the leave year today falls in (labelled by the year it starts).
  const sm = LEAVE_SETTINGS.leaveYearStartMonth;
  const year = yearParam == null || yearParam === '' ? (Number(t.slice(5, 7)) >= sm ? Number(t.slice(0, 4)) : Number(t.slice(0, 4)) - 1) : /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
  if (year == null) return fail('year must be YYYY.');
  const types = [...LEAVE_TYPES];
  const people = companyPeople().map((p) => ({
    ...p,
    balances: p.id === ME() ? myBalances(year) : types.map((ty) => colleagueBalance(p.id, ty, year, t)),
  }));
  return { ok: true, year, types, people };
}

function adjust(b: Record<string, unknown>) {
  const emp = companyPeople().find((p) => p.id === b.employee_id);
  if (!emp) return fail('Employee not found in your company.', 404);
  const type = LEAVE_TYPES.find((x) => x.id === b.leave_type_id);
  if (!type) return fail('Leave type not found.', 404);
  if (type.is_comp_off) return fail('Comp-off credit comes from approved comp-off requests, not manual adjustments.');
  const year = b.year;
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) return fail('year must be a leave-year number like 2026.');
  const d = b.days;
  if (!isHalfStep(d) || d === 0 || Math.abs(d) > 365) return fail('days must be a non-zero amount up to ±365, in steps of 0.5.');
  const reason = cleanText(b.reason, 300);
  if (reason.length < 3) return fail('Give a reason for the adjustment.');
  if (emp.id === ME()) return fail('You cannot adjust your own leave balance.', 403);
  const row: Adjustment = { id: newId('hla'), employee_id: emp.id, leave_type_id: type.id, year, days: d, kind: 'manual', reason };
  ADJUSTMENTS.push(row);
  return { ok: true, adjustment: { id: row.id, days: row.days, year: row.year } };
}

function carryForward(b: Record<string, unknown>) {
  const from = b.from_year;
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 2000 || from > 2100) return fail('from_year must be a leave-year number.');
  const end = leavePeriod(from).to;
  if (end >= today()) return fail('That leave year has not ended yet.');
  const types = LEAVE_TYPES.filter((t) => !t.is_comp_off && t.carry_forward_max > 0);
  let credits = 0;
  for (const p of companyPeople()) {
    // My own carry forward is already in (fixtures/leave.ts CARRIED).
    if (p.id === ME()) continue;
    for (const t of types) {
      if (ADJUSTMENTS.some((a) => a.kind === 'carry_forward' && a.employee_id === p.id && a.leave_type_id === t.id && a.year === from + 1)) continue;
      const bal = colleagueBalance(p.id, t, from, end, true);
      const days = halfFloor(Math.max(0, Math.min(bal.available, t.carry_forward_max)));
      if (days > 0) {
        ADJUSTMENTS.push({ id: newId('hla'), employee_id: p.id, leave_type_id: t.id, year: from + 1, days, kind: 'carry_forward', reason: `Carried forward from ${from}` });
        credits += 1;
      }
    }
  }
  return { ok: true, credits };
}

// ── Policies: one store, seeded from the built-in published ones plus a draft and an archived one ──
type StoredPolicy = Policy & { versionAt: string };
function seedPolicies(): StoredPolicy[] {
  const list = policyRoutes.find(([m, re]) => m === 'GET' && re.test('/hr/policies'));
  const detail = policyRoutes.find(([m, re]) => m === 'GET' && re.test('/hr/policies/x'));
  const summaries = ((list?.[2](['/hr/policies'], {}, new URLSearchParams()) as { policies?: PolicySummary[] })?.policies ?? []) as PolicySummary[];
  const seeded = summaries
    .map((s) => (detail?.[2](['', s.id], {}, new URLSearchParams()) as { policy?: Policy })?.policy)
    .filter((p): p is Policy => !!p)
    .map((p) => ({ ...JSON.parse(JSON.stringify(p)), versionAt: p.published_at ?? p.updated_at }) as StoredPolicy);
  const draft: StoredPolicy = {
    id: 'hpo-demo-perdiem',
    title: 'Travel & Per Diem 2027',
    category: 'Finance',
    version: 1,
    requires_ack: true,
    status: 'draft',
    audience: ['dept-production', 'dept-creative'],
    published_at: null,
    updated_at: daysAgo(2, '16:10'),
    link_url: '',
    acked_at: null,
    versionAt: daysAgo(2, '16:10'),
    body: `Purpose

New daily allowances for outstation shoots from 1 January 2027.

Daily allowance

- Metro cities: ₹1,200 a day for food and local travel.
- Other cities: ₹900 a day.
- Shoots that end after 10 pm: one extra meal, up to ₹400.

How to claim

Claim the allowance in DASH against the shoot's project code within 30 days of coming back.`,
  };
  const archived: StoredPolicy = {
    id: 'hpo-demo-wfh-2025',
    title: 'Work From Home (2025)',
    category: 'Attendance',
    version: 3,
    requires_ack: true,
    status: 'archived',
    audience: [],
    published_at: daysAgo(420, '11:00'),
    updated_at: daysAgo(40, '10:00'),
    link_url: '',
    acked_at: null,
    versionAt: daysAgo(420, '11:00'),
    body: 'Replaced by "Work From Home & Remote Attendance". Kept for the record.\n\nUp to 2 WFH days a month, applied for by email to your manager.',
  };
  return [...seeded, draft, archived];
}
const POLICIES: StoredPolicy[] = seedPolicies();

const myDeptId = () => currentPersona().deptId;
const visibleToMe = (p: StoredPolicy) => p.status === 'published' && (isHrAdmin() || !p.audience.length || (!!myDeptId() && p.audience.includes(myDeptId()!)));
const summaryOf = ({ body: _b, versionAt: _v, ...p }: StoredPolicy): PolicySummary => p;
const fullOf = ({ versionAt: _v, ...p }: StoredPolicy): Policy => p;

function cleanBody(v: unknown) {
  return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim() : '';
}
function cleanLink(v: unknown): string | null {
  if (v == null || v === '') return '';
  if (typeof v !== 'string' || v.length > 500) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}
function readPolicy(b: Record<string, unknown>, cur: StoredPolicy | null) {
  const title = cleanText(b.title, 120);
  if (title.length < 3) return { error: 'Title is required (3–120 characters).' };
  const category = cleanText(b.category, 40);
  const body = cleanBody(b.body);
  if (body.length < 10) return { error: 'Policy text is required (at least 10 characters).' };
  if (body.length > 60000) return { error: 'Policy text is too long (60000 characters max).' };
  const link = cleanLink(b.link_url);
  if (link === null) return { error: 'The link must be a full https:// address.' };
  if (b.requires_ack !== undefined && typeof b.requires_ack !== 'boolean') return { error: 'requires_ack must be true or false.' };
  const aud = b.audience === undefined ? (cur?.audience ?? []) : b.audience;
  if (!Array.isArray(aud) || aud.length > 200 || !aud.every((i) => typeof i === 'string' && ID_RE.test(i))) return { error: 'Audience must be a list of departments (empty = everyone).' };
  if (!aud.every((i) => DEPARTMENTS.some((d) => d.id === i))) return { notFound: 'One of the chosen departments is not in your company.' };
  return {
    value: {
      title,
      category,
      body,
      link_url: link,
      requires_ack: b.requires_ack === undefined ? (cur ? cur.requires_ack : true) : (b.requires_ack as boolean),
      audience: [...new Set(aud as string[])],
    },
  };
}

function savePolicy(id: string | null, b: Record<string, unknown>) {
  const cur = id ? POLICIES.find((p) => p.id === id) ?? null : null;
  if (id && !cur) return fail('Policy not found.', 404);
  if (cur?.status === 'archived') return fail('Archived policies cannot be edited.', 409);
  const v = readPolicy(cur ? { ...fullOf(cur), ...b } : b, cur);
  if ('error' in v && v.error) return fail(v.error);
  if ('notFound' in v && v.notFound) return fail(v.notFound, 404);
  const value = (v as { value: Omit<PolicySummary, 'id' | 'version' | 'status' | 'published_at' | 'updated_at' | 'acked_at'> & { body: string } }).value;
  const now = nowIso();
  if (!cur) {
    const row: StoredPolicy = { id: newId('hpo'), ...value, version: 1, status: 'draft', published_at: null, updated_at: now, acked_at: null, versionAt: now };
    POLICIES.unshift(row);
    return { ok: true, policy: fullOf(row) };
  }
  const material = value.title !== cur.title || value.body !== cur.body || (value.link_url || '') !== (cur.link_url || '');
  const bump = cur.status === 'published' && material;
  Object.assign(cur, value, { updated_at: now }, bump ? { version: cur.version + 1, versionAt: now, acked_at: null } : null);
  return { ok: true, policy: fullOf(cur), newVersion: bump };
}

function moveStatus(id: string, action: 'publish' | 'archive') {
  const cur = POLICIES.find((p) => p.id === id);
  if (!cur) return fail('Policy not found.', 404);
  const from = action === 'publish' ? ['draft'] : ['draft', 'published'];
  if (!from.includes(cur.status)) return fail(`This policy is ${cur.status}.`, 409);
  const now = nowIso();
  cur.status = action === 'publish' ? 'published' : 'archived';
  cur.updated_at = now;
  if (action === 'publish') {
    cur.published_at = now;
    cur.versionAt = now;
    cur.acked_at = null;
  }
  return { ok: true, policy: fullOf(cur) };
}

function acks(id: string): (PolicyAcks & { ok: true }) | ReturnType<typeof fail> {
  const p = POLICIES.find((x) => x.id === id);
  if (!p) return fail('Policy not found.', 404);
  const age = (Date.now() - Date.parse(p.versionAt)) / 86_400_000;
  // Most people read a new version within the first week.
  const rate = p.status === 'draft' ? 0 : Math.min(0.94, Math.max(0, age) * 0.22);
  const people = companyPeople()
    .filter((x) => !p.audience.length || (!!x.departmentId && p.audience.includes(x.departmentId)))
    .map((x) => {
      if (x.id === ME()) return { id: x.id, name: x.name, department: x.department, acked_at: p.acked_at };
      const r = rand(`ack:${p.id}:${p.version}:${x.id}`);
      const at = r < rate ? new Date(Date.parse(p.versionAt) + (0.1 + r * Math.max(age, 0.2) * 0.9) * 86_400_000).toISOString() : null;
      return { id: x.id, name: x.name, department: x.department, acked_at: at && at < nowIso() ? at : null };
    });
  return { ok: true, version: p.version, total: people.length, acknowledged: people.filter((x) => x.acked_at).length, people };
}

function acknowledge(id: string, body: Record<string, unknown>) {
  if (currentPersona().role === 'master_admin') return fail('Not available for this account.', 403);
  const p = POLICIES.find((x) => x.id === id);
  if (!p || !visibleToMe(p)) return fail('Policy not found.', 404);
  if (!p.requires_ack) return fail('This policy does not need an acknowledgement.', 409);
  const v = body.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v !== p.version) return fail('This policy was updated since you opened it. Please read the latest version.', 409);
  if (p.acked_at) return { ok: true, already: true };
  p.acked_at = nowIso();
  return { ok: true, acked_at: p.acked_at, version: p.version };
}

// ── Routes (specific before generic, as on the server) ───────────────────────
const B = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});

export const hrtimeRoutes: Route[] = [
  // Attendance setup
  [
    'PUT',
    /^\/hr\/attendance\/settings$/,
    (_p, b) => {
      const g = admin('change attendance settings');
      if (g) return g;
      const n = readAttendanceSettings(B(b));
      if ('error' in n) return fail(n.error);
      Object.assign(SETTINGS, n.value);
      return { ok: true, settings: SETTINGS };
    },
  ],
  ['GET', /^\/hr\/locations$/, () => gate('attendance') ?? { ok: true, locations: LOCATIONS }],
  [
    'POST',
    /^\/hr\/locations$/,
    (_p, b) => {
      const g = admin('manage work locations');
      if (g) return g;
      const v = readOffice(B(b));
      if (v.error || !v.value) return fail(v.error ?? 'Invalid location.');
      const loc: OfficeLocation = { id: newId('hl'), ...v.value };
      LOCATIONS.push(loc);
      return { ok: true, location: loc };
    },
  ],
  [
    'PUT',
    /^\/hr\/locations\/([^/]+)$/,
    ([, id], b) => {
      const g = admin('manage work locations');
      if (g) return g;
      const cur = LOCATIONS.find((l) => l.id === id);
      if (!cur) return fail('Location not found.', 404);
      const v = readOffice({ ...cur, ...B(b) });
      if (v.error || !v.value) return fail(v.error ?? 'Invalid location.');
      Object.assign(cur, v.value);
      return { ok: true, location: cur };
    },
  ],
  [
    'DELETE',
    /^\/hr\/locations\/([^/]+)$/,
    ([, id]) => {
      const g = admin('manage work locations');
      if (g) return g;
      const i = LOCATIONS.findIndex((l) => l.id === id);
      if (i < 0) return fail('Location not found.', 404);
      LOCATIONS.splice(i, 1);
      return { ok: true };
    },
  ],
  ['GET', /^\/hr\/attendance\/people$/, () => admin('manage employee clock-in rules') ?? { ok: true, people: clockPeople() }],
  ['PUT', /^\/hr\/attendance\/people$/, (_p, b) => admin('manage employee clock-in rules') ?? setRules(B(b))],

  // Shifts
  ['GET', /^\/hr\/shifts$/, () => gate('shifts') ?? { ok: true, shifts: [...SHIFTS].sort(byName) }],
  ['GET', /^\/hr\/shifts\/mine$/, () => gate('shifts') ?? { ok: true, shift: myShift() }],
  [
    'POST',
    /^\/hr\/shifts$/,
    (_p, b) => {
      const g = admin('manage shifts', 'shifts');
      if (g) return g;
      const v = readShift(B(b));
      if ('error' in v) return fail(v.error);
      const s: Shift = { id: newId('hs'), ...v.value };
      SHIFTS.push(s);
      return { ok: true, shift: s };
    },
  ],
  [
    'GET',
    /^\/hr\/shifts\/assignments$/,
    () =>
      admin('assign shifts', 'shifts') ?? {
        ok: true,
        people: companyPeople().map((p): ShiftPerson => ({ ...p, shift_id: ON_SHIFT.get(p.id) ?? null })),
      },
  ],
  ['PUT', /^\/hr\/shifts\/assignments$/, (_p, b) => admin('assign shifts', 'shifts') ?? assignShift(B(b))],
  [
    'PUT',
    /^\/hr\/shifts\/([^/]+)$/,
    ([, id], b) => {
      const g = admin('manage shifts', 'shifts');
      if (g) return g;
      const cur = SHIFTS.find((s) => s.id === id);
      if (!cur) return fail('Shift not found.', 404);
      const v = readShift({ ...cur, ...B(b) });
      if ('error' in v) return fail(v.error);
      Object.assign(cur, v.value);
      return { ok: true, shift: cur };
    },
  ],
  [
    'DELETE',
    /^\/hr\/shifts\/([^/]+)$/,
    ([, id]) => {
      const g = admin('manage shifts', 'shifts');
      if (g) return g;
      const i = SHIFTS.findIndex((s) => s.id === id);
      if (i < 0) return fail('Shift not found.', 404);
      SHIFTS.splice(i, 1);
      // The server hard-deletes every assignment to it: those people go back to company hours.
      for (const [pid, sid] of [...ON_SHIFT]) if (sid === id) ON_SHIFT.delete(pid);
      return { ok: true };
    },
  ],

  // Holidays
  [
    'GET',
    /^\/hr\/holidays$/,
    (_p, _b, q) => {
      const g = gate('holidays');
      if (g) return g;
      const year = q.get('year') ?? today().slice(0, 4);
      if (!/^\d{4}$/.test(year)) return fail('year must be YYYY.');
      return { ok: true, year, holidays: sortHolidays([...holidayYear(year)]) };
    },
  ],
  [
    'POST',
    /^\/hr\/holidays$/,
    (_p, b) => {
      const g = admin('manage holidays', 'holidays');
      if (g) return g;
      const v = readHoliday(B(b));
      if ('error' in v) return fail(v.error);
      const list = holidayYear(v.value.date.slice(0, 4));
      if (list.some((h) => h.date === v.value.date)) return fail('There is already a holiday on that date.', 409);
      const h: Holiday = { id: newId('hh'), ...v.value };
      list.push(h);
      sortHolidays(list);
      return { ok: true, holiday: h };
    },
  ],
  [
    'PUT',
    /^\/hr\/holidays\/([^/]+)$/,
    ([, id], b) => {
      const g = admin('manage holidays', 'holidays');
      if (g) return g;
      const found = findHoliday(id!);
      if (!found) return fail('Holiday not found.', 404);
      const v = readHoliday({ ...found.h, ...B(b) });
      if ('error' in v) return fail(v.error);
      const target = holidayYear(v.value.date.slice(0, 4));
      if (target.some((h) => h.date === v.value.date && h.id !== id)) return fail('There is already a holiday on that date.', 409);
      Object.assign(found.h, v.value);
      if (target !== found.list) {
        found.list.splice(found.list.indexOf(found.h), 1);
        target.push(found.h);
      }
      sortHolidays(target);
      return { ok: true, holiday: { ...found.h } };
    },
  ],
  [
    'DELETE',
    /^\/hr\/holidays\/([^/]+)$/,
    ([, id]) => {
      const g = admin('manage holidays', 'holidays');
      if (g) return g;
      const found = findHoliday(id!);
      if (!found) return fail('Holiday not found.', 404);
      found.list.splice(found.list.indexOf(found.h), 1);
      return { ok: true };
    },
  ],

  // Leave setup
  [
    'PUT',
    /^\/hr\/leave\/settings$/,
    (_p, b) => {
      const g = admin('change leave settings', 'leave');
      if (g) return g;
      const n = readLeaveSettings(B(b));
      if ('error' in n) return fail(n.error);
      Object.assign(LEAVE_SETTINGS, n.value);
      return { ok: true, settings: LEAVE_SETTINGS };
    },
  ],
  [
    'POST',
    /^\/hr\/leave\/types$/,
    (_p, b) => {
      const g = admin('manage leave types', 'leave');
      if (g) return g;
      const v = readType(B(b));
      if ('error' in v) return fail(v.error);
      if (v.value.is_comp_off && LEAVE_TYPES.some((t) => t.is_comp_off)) return fail('There is already a comp-off leave type.', 409);
      if (LEAVE_TYPES.some((t) => t.code === v.value.code)) return fail('A leave type with that code already exists.', 409);
      const t: LeaveType = { id: newId('hlt'), ...v.value };
      LEAVE_TYPES.push(t);
      sortTypes();
      return { ok: true, type: t };
    },
  ],
  [
    'PUT',
    /^\/hr\/leave\/types\/([^/]+)$/,
    ([, id], b) => {
      const g = admin('manage leave types', 'leave');
      if (g) return g;
      const cur = LEAVE_TYPES.find((t) => t.id === id);
      if (!cur) return fail('Leave type not found.', 404);
      const v = readType({ ...cur, ...B(b), is_comp_off: cur.is_comp_off });
      if ('error' in v) return fail(v.error);
      if (LEAVE_TYPES.some((t) => t.code === v.value.code && t.id !== id)) return fail('A leave type with that code already exists.', 409);
      Object.assign(cur, v.value);
      sortTypes();
      return { ok: true, type: cur };
    },
  ],
  [
    'DELETE',
    /^\/hr\/leave\/types\/([^/]+)$/,
    ([, id]) => {
      const g = admin('manage leave types', 'leave');
      if (g) return g;
      const i = LEAVE_TYPES.findIndex((t) => t.id === id);
      if (i < 0) return fail('Leave type not found.', 404);
      LEAVE_TYPES.splice(i, 1);
      return { ok: true };
    },
  ],
  ['GET', /^\/hr\/leave\/balances$/, (_p, _b, q) => admin('view leave balances', 'leave') ?? companyBalances(q.get('year'))],
  ['POST', /^\/hr\/leave\/adjustments$/, (_p, b) => admin('adjust leave balances', 'leave') ?? adjust(B(b))],
  ['POST', /^\/hr\/leave\/carry-forward$/, (_p, b) => admin('carry forward leave', 'leave') ?? carryForward(B(b))],

  // Policies (the employee side too: one store)
  [
    'GET',
    /^\/hr\/policies$/,
    (_p, _b, q) => {
      const g = gate('policies');
      if (g) return g;
      const all = q.get('all') === '1' && isHrAdmin();
      const list = POLICIES.filter((p) => (all ? true : visibleToMe(p))).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return { ok: true, policies: list.map(summaryOf) };
    },
  ],
  ['GET', /^\/hr\/policies-meta\/departments$/, () => admin('manage HR policies', 'policies') ?? { ok: true, departments: DEPARTMENTS.map((d) => ({ id: d.id, name: d.name })).sort(byName) }],
  ['GET', /^\/hr\/policies\/([^/]+)\/acks$/, ([, id]) => admin('manage HR policies', 'policies') ?? acks(id!)],
  [
    'GET',
    /^\/hr\/policies\/([^/]+)$/,
    ([, id]) => {
      const g = gate('policies');
      if (g) return g;
      const p = POLICIES.find((x) => x.id === id);
      if (!p || !(isHrAdmin() || visibleToMe(p))) return fail('Policy not found.', 404);
      return { ok: true, policy: fullOf(p) };
    },
  ],
  ['POST', /^\/hr\/policies$/, (_p, b) => admin('manage HR policies', 'policies') ?? savePolicy(null, B(b))],
  ['PUT', /^\/hr\/policies\/([^/]+)$/, ([, id], b) => admin('manage HR policies', 'policies') ?? savePolicy(id!, B(b))],
  ['POST', /^\/hr\/policies\/([^/]+)\/publish$/, ([, id]) => admin('manage HR policies', 'policies') ?? moveStatus(id!, 'publish')],
  ['POST', /^\/hr\/policies\/([^/]+)\/archive$/, ([, id]) => admin('manage HR policies', 'policies') ?? moveStatus(id!, 'archive')],
  ['POST', /^\/hr\/policies\/([^/]+)\/acknowledge$/, ([, id], b) => gate('policies') ?? acknowledge(id!, B(b))],
];
