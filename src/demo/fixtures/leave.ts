// Leave, work from home and comp-off for the demo person (hr_leave.js): types (publicType), settings,
// balances (computeBalances, computed — never stored), my requests (publicReq), apply (POST
// /requests with the server's own checks and wording) and cancel. Also GET /leaves, the company leave
// calendar (routes/leaves.js): colleagues' days off (team-leave.ts) plus one row per working day of my
// own approved leave, as hr_leave.js writeLegacyLeaves writes them.

import type { HalfDay, LeaveBalanceRow, LeaveBalances, LeaveRequest, LeaveSettings, LeaveType } from '@/api/leave';
import { DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { teamLeaveRows, type TeamLeaveRow } from '@/demo/fixtures/team-leave';
import { currentPersona } from '@/demo/personas';
import { addDays, countWorkingDays, eachDate, fail, isMandatoryHoliday, isWeeklyOff, isWorkingDay, nowIso, today, type Route } from '@/demo/state';
import { type LeaveSeed, LEAVE_SEEDS, myRecord } from '@/demo/timeline';

export const LEAVE_TYPES: LeaveType[] = [
  { id: 'lt-cl', code: 'CL', name: 'Casual Leave', paid: true, annual_quota: 12, accrual: 'annual', carry_forward_max: 0, allow_half_day: true, is_comp_off: false },
  { id: 'lt-co', code: 'CO', name: 'Comp-off', paid: true, annual_quota: 0, accrual: 'annual', carry_forward_max: 0, allow_half_day: true, is_comp_off: true },
  { id: 'lt-el', code: 'EL', name: 'Earned Leave', paid: true, annual_quota: 15, accrual: 'monthly', carry_forward_max: 30, allow_half_day: false, is_comp_off: false },
  { id: 'lt-lop', code: 'LOP', name: 'Loss of Pay', paid: false, annual_quota: 0, accrual: 'annual', carry_forward_max: 0, allow_half_day: true, is_comp_off: false },
  { id: 'lt-sl', code: 'SL', name: 'Sick Leave', paid: true, annual_quota: 8, accrual: 'annual', carry_forward_max: 0, allow_half_day: true, is_comp_off: false },
];

export const LEAVE_SETTINGS: LeaveSettings = { leaveYearStartMonth: 1, compOffExpiryDays: 90, compOffClaimWindowDays: 30, backdateDays: 30, maxSpanDays: 60 };

const round2 = (n: number) => Math.round(n * 100) / 100;

function toRequest(s: LeaveSeed): LeaveRequest {
  const type = LEAVE_TYPES.find((t) => t.id === s.type);
  const decided = s.status === 'approved' || s.status === 'rejected';
  return {
    id: s.id,
    kind: s.kind,
    employee_id: DEMO_USER.id,
    employee_name: String(DEMO_USER.name),
    department_id: 'dept-creative',
    leave_type_id: s.kind === 'leave' ? (s.type ?? null) : null,
    leave_code: s.kind === 'leave' ? (type?.code ?? null) : null,
    from_date: s.from,
    to_date: s.to,
    half_day: s.half,
    days: s.kind === 'comp_off' ? 1 : countWorkingDays(s.from, s.to, s.half),
    reason: s.reason,
    status: s.status,
    created_at: s.created,
    decided_by_name: decided ? (s.decidedBy ?? 'Priya Sharma') : null,
    decided_at: decided ? (s.decidedAt ?? s.created) : null,
    decision_note: s.note ?? '',
  };
}

const REQUESTS: LeaveRequest[] = LEAVE_SEEDS.map(toRequest).sort((a, b) => b.created_at.localeCompare(a.created_at));

// The EL carried forward from last year (an HR carry-forward adjustment), for the current leave year.
const CARRIED: Record<string, number> = { 'lt-el': 6 };

function monthsStarted(year: number, t: string) {
  const ty = Number(t.slice(0, 4));
  if (ty < year) return 0;
  if (ty > year) return 12;
  return Number(t.slice(5, 7));
}

// hr_leave.js compOffAvailable: oldest unexpired credit earned on/before the leave date is used first.
function compOffAvailable(credits: { days: number; earned: string; exp: string }[], uses: { date: string; days: number }[], t: string) {
  const pool = credits.map((c) => ({ left: c.days, earned: c.earned, exp: c.exp })).sort((a, b) => a.earned.localeCompare(b.earned));
  for (const u of [...uses].sort((a, b) => a.date.localeCompare(b.date))) {
    let need = u.days;
    for (const c of pool) {
      if (need <= 0) break;
      if (c.left <= 0 || c.earned > u.date || c.exp < u.date) continue;
      const take = Math.min(c.left, need);
      c.left = round2(c.left - take);
      need = round2(need - take);
    }
  }
  return round2(pool.filter((c) => c.exp >= t).reduce((s, c) => s + c.left, 0));
}

function balancesFor(year: number): LeaveBalanceRow[] {
  const t = today();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  return LEAVE_TYPES.map((type) => {
    const mineOfType = REQUESTS.filter((r) => r.kind === 'leave' && r.leave_type_id === type.id);
    if (type.is_comp_off) {
      const credits = REQUESTS.filter((r) => r.kind === 'comp_off' && r.status === 'approved').map((r) => ({
        days: r.days,
        earned: r.from_date,
        exp: addDays(r.from_date, LEAVE_SETTINGS.compOffExpiryDays),
      }));
      const uses = mineOfType.filter((r) => r.status === 'approved').map((r) => ({ date: r.from_date, days: r.days }));
      const pending = round2(mineOfType.filter((r) => r.status === 'pending').reduce((s, r) => s + r.days, 0));
      const avail = compOffAvailable(credits, uses, t);
      return {
        ...type,
        year,
        entitlement: 0,
        adjusted: round2(credits.reduce((s, c) => s + c.days, 0)),
        used: round2(uses.reduce((s, u) => s + u.days, 0)),
        pending,
        available: round2(avail - pending),
        expiring: credits.filter((c) => c.exp >= t).map((c) => c.exp).sort()[0] ?? null,
      };
    }
    const inYear = (r: LeaveRequest) => r.from_date >= from && r.from_date <= to;
    const entitlement = type.accrual === 'monthly' ? round2((type.annual_quota * monthsStarted(year, t)) / 12) : type.annual_quota;
    const adjusted = year === Number(t.slice(0, 4)) ? (CARRIED[type.id] ?? 0) : 0;
    const used = round2(mineOfType.filter((r) => r.status === 'approved' && inYear(r)).reduce((s, r) => s + r.days, 0));
    const pending = round2(mineOfType.filter((r) => r.status === 'pending' && inYear(r)).reduce((s, r) => s + r.days, 0));
    return { ...type, year, entitlement, adjusted, used, pending, available: round2(entitlement + adjusted - used - pending) };
  });
}

function balances(yearParam: string | null): (LeaveBalances & { ok: true }) | ReturnType<typeof fail> {
  const year = yearParam == null ? Number(today().slice(0, 4)) : /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
  if (year == null) return fail('year must be YYYY.');
  return { ok: true, year, period: { from: `${year}-01-01`, to: `${year}-12-31` }, balances: balancesFor(year) };
}

const realDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

function apply(body: unknown) {
  const b = (body || {}) as Record<string, unknown>;
  const kind = b.kind;
  if (kind !== 'leave' && kind !== 'wfh' && kind !== 'comp_off') return fail('kind must be leave, wfh or comp_off.');
  const t = today();
  const reason = String(b.reason || '').trim().slice(0, 500);
  if (reason.length < 3) return fail('Give a reason (at least 3 characters).');
  const base = {
    id: `hlr${Date.now()}`,
    kind,
    employee_id: DEMO_USER.id,
    employee_name: String(DEMO_USER.name),
    department_id: 'dept-creative',
    leave_type_id: null,
    leave_code: null,
    reason,
    status: 'pending',
    created_at: nowIso(),
    decided_by_name: null,
    decided_at: null,
    decision_note: '',
  } as const;

  let req: LeaveRequest;
  if (kind === 'comp_off') {
    const wd = b.worked_date;
    if (!realDate(wd) || wd > t) return fail('Pick the past date you worked.');
    if (wd < addDays(t, -LEAVE_SETTINGS.compOffClaimWindowDays)) return fail(`Comp-off can be claimed only within ${LEAVE_SETTINGS.compOffClaimWindowDays} days of the day worked.`);
    if (!isWeeklyOff(wd) && !isMandatoryHoliday(wd)) return fail('Comp-off is earned only for work on a weekly off or a company holiday.');
    const rec = myRecord(wd);
    const st = rec?.out_at ? rec.status : null;
    const days = st === 'present' ? 1 : st === 'half_day' ? 0.5 : 0;
    if (!days) return fail('No completed attendance (half day or more) is recorded for that day.');
    if (REQUESTS.some((r) => r.kind === 'comp_off' && r.from_date === wd && (r.status === 'pending' || r.status === 'approved'))) {
      return fail('You have already claimed comp-off for that day.', 409);
    }
    req = { ...base, from_date: wd, to_date: wd, half_day: 'none', days };
  } else {
    const from = b.from_date;
    const to = b.to_date === undefined ? b.from_date : b.to_date;
    if (!realDate(from) || !realDate(to) || to < from) return fail('Pick a valid date range.');
    if (from < addDays(t, -LEAVE_SETTINGS.backdateDays)) return fail(`Requests can go back at most ${LEAVE_SETTINGS.backdateDays} days.`);
    if (to > addDays(t, 366)) return fail('Requests can be made at most a year ahead.');
    if (eachDate(from, to).length > LEAVE_SETTINGS.maxSpanDays) return fail(`One request can cover at most ${LEAVE_SETTINGS.maxSpanDays} days.`);
    const halfRaw = b.half_day === undefined ? 'none' : b.half_day;
    if (halfRaw !== 'none' && halfRaw !== 'first' && halfRaw !== 'second') return fail('half_day must be none, first or second.');
    const half = halfRaw as HalfDay;
    if (half !== 'none' && from !== to) return fail('A half day must be a single date.');
    if (kind === 'wfh' && half !== 'none') return fail('Work from home is requested in whole days.');
    const days = countWorkingDays(from, to, half);
    if (days <= 0) return fail('Those dates are all weekly offs or holidays — nothing to request.');
    const clash = REQUESTS.some((r) => r.kind !== 'comp_off' && (r.status === 'pending' || r.status === 'approved') && r.from_date <= to && r.to_date >= from);
    if (clash) return fail('You already have a leave or WFH request on some of those dates.', 409);
    req = { ...base, from_date: from, to_date: to, half_day: half, days };
    if (kind === 'leave') {
      const type = LEAVE_TYPES.find((x) => x.id === b.leave_type_id);
      if (!type) return fail('Choose a leave type.');
      if (half !== 'none' && !type.allow_half_day) return fail(`${type.name} cannot be taken as a half day.`);
      if (!type.is_comp_off && from.slice(0, 4) !== to.slice(0, 4)) return fail('A request cannot cross into the next leave year. Split it into two.');
      const bal = balancesFor(Number(from.slice(0, 4))).find((x) => x.id === type.id);
      if (type.paid && (!bal || bal.available < days)) {
        return fail(`Not enough ${type.name} balance: ${bal ? bal.available : 0} day(s) available, ${days} requested.`, 409);
      }
      req = { ...req, leave_type_id: type.id, leave_code: type.code };
    }
  }
  REQUESTS.unshift(req);
  return { ok: true, request: req };
}

function cancel(id: string) {
  const r = REQUESTS.find((x) => x.id === id);
  if (!r) return fail('Request not found.', 404);
  const cancellable = r.status === 'pending' || (r.status === 'approved' && r.kind !== 'comp_off' && r.from_date > today());
  if (!cancellable) return fail(r.status === 'approved' ? 'Leave that has started cannot be cancelled here — ask HR.' : `This request is already ${r.status}.`, 409);
  r.status = 'cancelled';
  return { ok: true, request: r };
}

// GET /leaves: tenant-scoped, so the master admin (no company) gets nothing in the demo.
function leaveCalendar(): TeamLeaveRow[] {
  if (!currentPersona().tenant) return [];
  const mine = REQUESTS.filter((r) => r.kind === 'leave' && r.status === 'approved').flatMap((r) =>
    eachDate(String(r.from_date).slice(0, 10), String(r.to_date).slice(0, 10))
      .filter(isWorkingDay)
      .map(
        (date): TeamLeaveRow => ({
          id: `lvhr${r.id.slice(-12)}${date.replace(/-/g, '')}`,
          employee: String(DEMO_USER.name),
          employeeId: DEMO_USER.id,
          date,
          type: String(r.leave_code || 'leave').toLowerCase(),
          reason: r.half_day && r.half_day !== 'none' ? `Half day (${r.half_day})` : 'HR leave',
          markedBy: String(r.decided_by_name || 'Priya Sharma'),
          markedAt: String(r.decided_at || r.created_at),
          tenantId: DEMO_TENANT_ID,
          source: 'hr',
          hrRequestId: r.id,
        }),
      ),
  );
  return [...teamLeaveRows(), ...mine];
}

export const leaveRoutes: Route[] = [
  ['GET', /^\/leaves$/, () => leaveCalendar()],
  ['GET', /^\/hr\/leave\/types$/, () => ({ ok: true, types: LEAVE_TYPES })],
  ['GET', /^\/hr\/leave\/settings$/, () => ({ ok: true, settings: LEAVE_SETTINGS })],
  ['GET', /^\/hr\/leave\/balances\/mine$/, (_p, _b, q) => balances(q.get('year'))],
  ['GET', /^\/hr\/leave\/requests\/mine$/, () => ({ ok: true, requests: REQUESTS })],
  ['POST', /^\/hr\/leave\/requests$/, (_p, body) => apply(body)],
  ['POST', /^\/hr\/leave\/requests\/([^/]+)\/cancel$/, ([, id]) => cancel(id!)],
];
