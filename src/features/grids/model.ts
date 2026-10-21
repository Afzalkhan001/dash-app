// Pure builders for the grids: rows and columns from the server's own answers, ported from the website
// tables they replace (each function cites its source). No hooks, no clock: `today` comes from
// useTodayIst(). Cell tones are names ('good', 'bad'…), never colours — the grid picks the live token.

import type { AttendanceRow } from '@/api/attendance';
import type { CompanyBalances, BalancePerson } from '@/api/hrtime';
import type { LeaveType } from '@/api/leave';
import type { Department, RosterRecord } from '@/api/people';
import type { PayrollItem, PayLine, SalaryPerson } from '@/api/payroll';
import type { PettyCashBill, PettyCashRequest, PettyCashSubmission } from '@/api/petty-cash';
import { PURPOSE_LABEL, type Reimbursement } from '@/api/reimbursements';
import { DAY_STATE, WEEKDAYS } from '@/features/attendance/format';
import type { CellInput, GridColumn } from '@/features/grids/data-grid';
import { reimbursementRef } from '@/features/inbox/format';
import { pettyCashRef, statusMeta } from '@/features/petty-cash/logic';
import { ROLE_LABEL } from '@/lib/access';
import { dateLabel, durationLabel, timeOf } from '@/lib/dates';
import { inr } from '@/lib/format';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const rupees = (n: unknown) => inr(num(n), { decimals: false });
const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const has = (q: string, ...parts: unknown[]) => !q || parts.map(str).join(' ').toLowerCase().includes(q);

// ═════════════════════════════════════════════════════════════════════════════
// Attendance month sheet (people × days). The website shows one day at a time (TeamAttendance,
// dash.html:4436); the sheet lays those days side by side with the same states (HR_STATE).
// ═════════════════════════════════════════════════════════════════════════════
export type SheetPerson = {
  id: string;
  name: string;
  department: string;
  days: Record<string, AttendanceRow>;
  present: number;
  late: number;
  half: number;
  short: number;
  open: number;
  absent: number;
  worked: number;
  counted: number;
};
export type DayInfo = { ymd: string; d: number; weekday: number; off: boolean; holiday: string | null; future: boolean; today: boolean };

export function monthDays(ym: string, today: string, weeklyOff: number[], holidays: { date: string; name: string; optional?: boolean }[]): DayInfo[] {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const hol = new Map(holidays.filter((h) => h && !h.optional).map((h) => [h.date, h.name]));
  return Array.from({ length: n }, (_, i) => {
    const ymd = `${ym}-${String(i + 1).padStart(2, '0')}`;
    const weekday = new Date(`${ymd}T00:00:00Z`).getUTCDay();
    return { ymd, d: i + 1, weekday, off: weeklyOff.includes(weekday), holiday: hol.get(ymd) ?? null, future: ymd > today, today: ymd === today };
  });
}

export function buildSheet(days: DayInfo[], byDate: Record<string, AttendanceRow[] | null>, everyone: { id: string; name: string; department: string }[]): SheetPerson[] {
  const people = new Map<string, SheetPerson>();
  const blank = (id: string, name: string, department: string): SheetPerson => ({ id, name, department, days: {}, present: 0, late: 0, half: 0, short: 0, open: 0, absent: 0, worked: 0, counted: 0 });
  for (const p of everyone) if (p?.id) people.set(p.id, blank(p.id, p.name || 'Unnamed', p.department || ''));
  for (const day of days) {
    for (const r of byDate[day.ymd] ?? []) {
      if (!r || typeof r !== 'object') continue;
      const id = str(r.employee_id) || str(r.employee_name);
      if (!id) continue;
      if (!people.has(id)) people.set(id, blank(id, str(r.employee_name) || 'Unnamed', ''));
      people.get(id)!.days[day.ymd] = r;
    }
  }
  const loaded = days.filter((d) => !d.future && byDate[d.ymd] != null);
  for (const p of people.values()) {
    for (const d of loaded) {
      const r = p.days[d.ymd];
      if (!r) {
        if (!d.off && !d.holiday && !d.today) p.absent += 1;
        continue;
      }
      const s = str(r.state);
      if (s === 'present') p.present += 1;
      if (s === 'half_day') p.half += 1;
      if (s === 'short') p.short += 1;
      if (s === 'incomplete') p.open += 1;
      if (r.late) p.late += 1;
      if (typeof r.worked_minutes === 'number' && r.worked_minutes > 0) {
        p.worked += r.worked_minutes;
        p.counted += 1;
      }
    }
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'en-IN', { sensitivity: 'base' }));
}

/** One day's cell: P present · L late · H half day · S short hours · N no clock-out · W working now. */
export function dayCell(r: AttendanceRow | undefined, day: DayInfo, loaded: boolean): CellInput {
  if (r) {
    const s = str(r.state);
    if (s === 'in_progress') return { text: 'W', tone: 'brand', fill: 'brand', strong: true };
    if (s === 'present') return r.late ? { text: 'L', tone: 'warn', fill: 'warn', strong: true } : { text: 'P', tone: 'good', fill: 'good', strong: true };
    if (s === 'half_day') return { text: 'H', tone: 'warn', fill: 'warn', strong: true };
    if (s === 'short') return { text: 'S', tone: 'bad', fill: 'bad', strong: true };
    if (s === 'incomplete') return { text: 'N', tone: 'bad', fill: 'bad', strong: true };
    return { text: '•', tone: 'muted' };
  }
  if (day.holiday) return { text: 'Hol', tone: 'muted', fill: 'off' };
  if (day.off) return { text: 'Off', tone: 'faint', fill: 'off' };
  if (day.future || !loaded) return { text: '', tone: 'faint' };
  if (day.today) return { text: '·', tone: 'faint' };
  return { text: '–', tone: 'faint' };
}

export const SHEET_LEGEND = 'P present · L late · H half day · S short hours · N no clock-out · W working now · – not in · Off weekly off · Hol holiday';

export function sheetColumns(days: DayInfo[], byDate: Record<string, unknown>): { first: GridColumn<SheetPerson>; columns: GridColumn<SheetPerson>[] } {
  const first: GridColumn<SheetPerson> = {
    key: 'name',
    label: 'Employee',
    width: 150,
    cell: (p) => p.name,
    sort: (p) => p.name,
  };
  const dayCols: GridColumn<SheetPerson>[] = days.map((d) => ({
    key: d.ymd,
    label: `${d.d}\n${WEEKDAYS[d.weekday]}`,
    long: `${WEEKDAYS[d.weekday]} ${d.d}`,
    width: 44,
    align: 'center',
    inSheet: false,
    cell: (p) => dayCell(p.days[d.ymd], d, byDate[d.ymd] != null),
  }));
  const sum: GridColumn<SheetPerson>[] = [
    { key: 'present', label: 'Present', long: 'Days present (late ones too)', width: 70, cell: (p) => ({ text: String(p.present), tone: p.present ? 'good' : 'faint', strong: true }), sort: (p) => p.present },
    { key: 'late', label: 'Late', long: 'Days late', width: 56, cell: (p) => ({ text: String(p.late), tone: p.late ? 'warn' : 'faint' }), sort: (p) => p.late },
    { key: 'half', label: 'Half day', long: 'Half days', width: 64, cell: (p) => ({ text: String(p.half), tone: p.half ? 'warn' : 'faint' }), sort: (p) => p.half },
    { key: 'short', label: 'Short', long: 'Short-hours days', width: 58, cell: (p) => ({ text: String(p.short), tone: p.short ? 'bad' : 'faint' }), sort: (p) => p.short },
    { key: 'open', label: 'No clock-out', long: 'Days with no clock-out', width: 76, cell: (p) => ({ text: String(p.open), tone: p.open ? 'bad' : 'faint' }), sort: (p) => p.open },
    { key: 'absent', label: 'Not in', long: 'Working days not clocked in', width: 60, cell: (p) => ({ text: String(p.absent), tone: p.absent ? 'muted' : 'faint' }), sort: (p) => p.absent },
    { key: 'worked', label: 'Worked', long: 'Hours worked', width: 84, cell: (p) => (p.worked ? durationLabel(p.worked) : null), sort: (p) => p.worked },
    { key: 'avg', label: 'Avg / day', long: 'Average a day', width: 80, cell: (p) => (p.counted ? durationLabel(Math.round(p.worked / p.counted)) : null), sort: (p) => (p.counted ? p.worked / p.counted : 0) },
  ];
  return { first, columns: [...sum, ...dayCols] };
}

/** The person's days, newest first, in plain words (the row sheet). */
export function sheetDayLines(p: SheetPerson, days: DayInfo[], today: string) {
  return days
    .filter((d) => p.days[d.ymd])
    .reverse()
    .map((d) => {
      const r = p.days[d.ymd]!;
      const st = DAY_STATE[str(r.state)]?.label ?? 'Clocked in';
      const span = `${timeOf(r.in_at)}${r.out_at ? ` – ${timeOf(r.out_at)}` : ''}`;
      return {
        key: d.ymd,
        label: dateLabel(d.ymd, today),
        value: [st, r.late ? 'late' : null, span, r.worked_minutes ? durationLabel(r.worked_minutes) : null].filter(Boolean).join(' · '),
      };
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// Leave balances: people × leave types (LeaveSetup "Company balances", dash.html:4945). The website
// shows `available` with used / pending in a tooltip; here they are the cell's second line.
// ═════════════════════════════════════════════════════════════════════════════
export function balanceColumns(data: CompanyBalances | undefined): { first: GridColumn<BalancePerson>; columns: GridColumn<BalancePerson>[]; types: LeaveType[] } {
  const types: LeaveType[] = Array.isArray(data?.types) ? data.types : [];
  const bal = (p: BalancePerson, id: string) => (Array.isArray(p.balances) ? p.balances : []).find((b) => b.leave_type_id === id);
  const first: GridColumn<BalancePerson> = { key: 'name', label: 'Employee', width: 150, cell: (p) => ({ text: p.name || 'Unnamed', sub: p.department || 'No team' }), sort: (p) => p.name };
  const columns: GridColumn<BalancePerson>[] = [
    { key: 'dept', label: 'Team', long: 'Team', width: 110, align: 'left', cell: (p) => p.department || null, sort: (p) => p.department || '' },
    ...types.map(
      (t): GridColumn<BalancePerson> => ({
        key: t.id,
        label: t.code || t.name,
        long: `${t.name}${t.code ? ` (${t.code})` : ''}`,
        width: 92,
        cell: (p) => {
          const b = bal(p, t.id);
          if (!b) return null;
          const sub = [`used ${fmtDays(num(b.used))}`, num(b.pending) ? `waiting ${fmtDays(num(b.pending))}` : null].filter(Boolean).join(' · ');
          return { text: fmtDays(num(b.available)), sub, tone: num(b.available) < 0 ? 'bad' : num(b.available) === 0 ? 'muted' : undefined, strong: true };
        },
        sort: (p) => num(bal(p, t.id)?.available),
      }),
    ),
  ];
  return { first, columns, types };
}

export const filterBalances = (people: BalancePerson[], q: string) => people.filter((p) => p && p.id && has(q, p.name, p.department));

// ═════════════════════════════════════════════════════════════════════════════
// Payroll register (PayrollRunView, dash.html:5136, and register.csv hr_payroll.js:512): one row per
// person, a column per earning / deduction / employer code that appears in the run.
// ═════════════════════════════════════════════════════════════════════════════
const lines = (v: PayLine[] | null | undefined) => (Array.isArray(v) ? v : []);
function codesOf(items: PayrollItem[], pick: (i: PayrollItem) => PayLine[] | null | undefined) {
  const seen = new Map<string, string>();
  for (const i of items) for (const l of lines(pick(i))) if (l && l.code && !seen.has(l.code)) seen.set(l.code, l.name || l.code);
  return [...seen.entries()].map(([code, name]) => ({ code, name }));
}
const lineAmount = (v: PayLine[] | null | undefined, code: string) => lines(v).filter((l) => l.code === code).reduce((t, l) => t + num(l.amount), 0);

export const MASKED = '₹ ••••';

export function registerColumns(items: PayrollItem[], hidden = false) {
  const show = (n: number) => (hidden ? MASKED : rupees(n));
  const earn = codesOf(items, (i) => i.earnings);
  const reimb = codesOf(items, (i) => i.reimbursements);
  const ded = codesOf(items, (i) => i.deductions);
  const emp = codesOf(items, (i) => i.employer);
  const money = (key: string, label: string, long: string, get: (i: PayrollItem) => number, strong = false): GridColumn<PayrollItem> => ({
    key,
    label,
    long,
    width: 96,
    cell: (i) => ({ text: show(get(i)), tone: get(i) === 0 ? 'faint' : undefined, strong }),
    sort: get,
  });
  const lop = (i: PayrollItem) => (i.lop_override != null ? num(i.lop_override) : num(i.lop_days));
  const first: GridColumn<PayrollItem> = { key: 'name', label: 'Employee', width: 150, cell: (i) => i.employee_name || 'Unnamed', sort: (i) => i.employee_name || '' };
  const columns: GridColumn<PayrollItem>[] = [
    { key: 'dept', label: 'Team', width: 110, align: 'left', cell: (i) => i.department || null, sort: (i) => i.department || '' },
    { key: 'structure', label: 'Structure', long: 'Salary structure', width: 110, align: 'left', cell: (i) => i.structure_name || null },
    { key: 'dim', label: 'Days', long: 'Days in the month', width: 52, cell: (i) => String(num(i.days_in_month)) },
    { key: 'lop', label: 'Unpaid', long: 'Unpaid days (loss of pay)', width: 62, cell: (i) => ({ text: fmtDays(lop(i)), tone: lop(i) ? 'warn' : 'faint', sub: i.lop_override != null ? 'set by hand' : undefined }), sort: lop },
    { key: 'paid', label: 'Paid days', long: 'Paid days', width: 64, cell: (i) => fmtDays(num(i.payable_days)), sort: (i) => num(i.payable_days) },
    ...earn.map((c) => money(`e:${c.code}`, c.code, `${c.name} (earning)`, (i) => lineAmount(i.earnings, c.code))),
    money('gross', 'Gross', 'Gross pay', (i) => num(i.gross), true),
    ...reimb.map((c) => money(`r:${c.code}`, c.code, `${c.name} (paid back)`, (i) => lineAmount(i.reimbursements, c.code))),
    money('reimb', 'Paid back', 'Expenses paid back', (i) => num(i.reimbursement_total)),
    ...ded.map((c) => money(`d:${c.code}`, c.code, `${c.name} (deduction)`, (i) => lineAmount(i.deductions, c.code))),
    money('ded', 'Deductions', 'Total deductions', (i) => num(i.total_deductions), true),
    money('tds', 'Tax (TDS)', 'Income tax (TDS)', (i) => num(i.tds)),
    money('net', 'Net pay', 'Net pay', (i) => num(i.net), true),
    ...emp.map((c) => money(`x:${c.code}`, c.code, `${c.name} (company pays)`, (i) => lineAmount(i.employer, c.code))),
    {
      key: 'warn',
      label: 'Warnings',
      width: 76,
      cell: (i) => (Array.isArray(i.warnings) && i.warnings.length ? { text: `⚠ ${i.warnings.length}`, tone: 'warn', strong: true } : null),
      sort: (i) => (Array.isArray(i.warnings) ? i.warnings.length : 0),
    },
  ];
  // Totals: every money column summed.
  const totals: Record<string, CellInput> = {};
  for (const c of columns) {
    if (!c.sort || ['dept', 'structure', 'dim', 'lop', 'paid', 'warn'].includes(c.key)) continue;
    const t = items.reduce((s, i) => s + num(c.sort!(i)), 0);
    totals[c.key] = { text: show(t), strong: true };
  }
  totals.warn = { text: String(items.filter((i) => Array.isArray(i.warnings) && i.warnings.length).length), strong: true };
  return { first, columns, totals };
}

export const filterItems = (items: PayrollItem[], q: string, warningsOnly: boolean) =>
  items.filter((i) => i && i.id && has(q, i.employee_name, i.department, i.structure_name) && (!warningsOnly || (Array.isArray(i.warnings) && i.warnings.length > 0)));

// ═════════════════════════════════════════════════════════════════════════════
// Salaries (SalaryPeople, dash.html:5232): who is on which structure, at what pay, under which tax.
// ═════════════════════════════════════════════════════════════════════════════
export function salaryColumns(today: string, hidden = false) {
  const show = (n: unknown) => (hidden ? MASKED : rupees(n));
  const first: GridColumn<SalaryPerson> = { key: 'name', label: 'Employee', width: 150, cell: (p) => p.name || 'Unnamed', sort: (p) => p.name || '' };
  const columns: GridColumn<SalaryPerson>[] = [
    { key: 'dept', label: 'Team', width: 110, align: 'left', cell: (p) => p.department || null, sort: (p) => p.department || '' },
    { key: 'structure', label: 'Structure', long: 'Salary structure', width: 116, align: 'left', cell: (p) => p.salary?.structure_name || { text: 'Not set', tone: 'warn' }, sort: (p) => p.salary?.structure_name || '' },
    { key: 'ctc', label: 'Annual (CTC)', long: 'Annual salary (CTC)', width: 104, cell: (p) => (p.salary ? { text: show(p.salary.annual_ctc), strong: true } : null), sort: (p) => num(p.salary?.annual_ctc) },
    { key: 'mctc', label: 'Monthly CTC', long: 'Monthly salary (CTC)', width: 96, cell: (p) => (p.salary ? show(p.salary.monthly_ctc) : null), sort: (p) => num(p.salary?.monthly_ctc) },
    { key: 'gross', label: 'Monthly gross', long: 'Monthly gross', width: 96, cell: (p) => (p.salary ? show(p.salary.monthly_gross) : null), sort: (p) => num(p.salary?.monthly_gross) },
    { key: 'since', label: 'Since', long: 'Salary since', width: 104, align: 'left', cell: (p) => (p.salary?.effective_from ? dateLabel(p.salary.effective_from, today) : null), sort: (p) => p.salary?.effective_from || '' },
    { key: 'regime', label: 'Tax regime', long: 'Income tax regime', width: 84, align: 'left', cell: (p) => (p.profile?.regime ? (p.profile.regime === 'old' ? 'Old' : 'New') : { text: 'Company default', tone: 'muted' }) },
    { key: 'decl', label: 'Declared', long: 'Tax-saving declarations a year', width: 96, cell: (p) => (num(p.profile?.declarations) ? show(p.profile.declarations) : null), sort: (p) => num(p.profile?.declarations) },
    { key: 'tds', label: 'Monthly TDS', long: 'Income tax (TDS) set by hand a month', width: 96, cell: (p) => (num(p.profile?.tds_monthly) ? show(p.profile.tds_monthly) : null), sort: (p) => num(p.profile?.tds_monthly) },
    { key: 'pf', label: 'PF', long: 'Provident fund', width: 56, align: 'center', cell: (p) => (p.profile ? (p.profile.pf_enabled ? 'Yes' : { text: 'No', tone: 'muted' }) : null) },
    { key: 'pt', label: 'PT state', long: 'Professional tax state', width: 96, align: 'left', cell: (p) => p.profile?.pt_state || null },
    { key: 'rev', label: 'Changes', long: 'Salary changes on record', width: 70, cell: (p) => String(Array.isArray(p.revisions) ? p.revisions.length : 0), sort: (p) => (Array.isArray(p.revisions) ? p.revisions.length : 0) },
  ];
  return { first, columns };
}

export const filterSalaries = (people: SalaryPerson[], q: string, unset: boolean) =>
  people.filter((p) => p && p.id && has(q, p.name, p.department, p.salary?.structure_name) && (!unset || !p.salary));

// ═════════════════════════════════════════════════════════════════════════════
// Petty cash ledger (PettyCashLedger, dash.html:17243; pettyCashLedger :17165 and
// pettyCashSubmissionsAsBills :17144, ported line for line).
// ═════════════════════════════════════════════════════════════════════════════
export type LedgerBill = (PettyCashBill & { submission?: false }) | (Omit<PettyCashSubmission, 'status'> & { requestId: string; status: string; submission: true; uploadedByName?: string; uploadedById?: string });
export type LedgerRow = {
  r: PettyCashRequest;
  bills: LedgerBill[];
  raised: number;
  approved: number;
  awaiting: number;
  rejected: number;
  submitted: number;
  outstanding: number;
  over: number;
  complete: boolean;
  count: number;
};

/** Bills from the Bill Submission tab, laid against that person's received petty cash for the code, oldest first. */
export function submissionsAsBills(requests: PettyCashRequest[], subs: PettyCashSubmission[]): LedgerBill[] {
  const out: LedgerBill[] = [];
  const pools = new Map<string, PettyCashRequest[]>();
  for (const r of requests) {
    if (r.status !== 'received' || r.kind === 'excess') continue;
    const k = `${r.employeeId}|${str(r.kekaCode).toLowerCase()}`;
    if (!pools.has(k)) pools.set(k, []);
    pools.get(k)!.push(r);
  }
  pools.forEach((a) => a.sort((x, y) => str(x.createdAt).localeCompare(str(y.createdAt))));
  const used = new Map<string, number>();
  [...subs]
    .filter((b) => b && b.status !== 'rejected')
    .sort((a, b) => str(a.createdAt).localeCompare(str(b.createdAt)))
    .forEach((b) => {
      const list = pools.get(`${b.employeeId}|${str(b.kekaCode).toLowerCase()}`);
      if (!list || !list.length) return;
      let i = 0;
      while (i < list.length - 1 && (used.get(list[i]!.id) || 0) >= num(list[i]!.amount)) i++;
      const r = list[i]!;
      used.set(r.id, (used.get(r.id) || 0) + num(b.amount));
      out.push({ ...b, requestId: r.id, status: 'approved', uploadedByName: b.employeeName, uploadedById: b.employeeId, submission: true });
    });
  return out;
}

export function buildLedger(requests: PettyCashRequest[], bills: LedgerBill[]): LedgerRow[] {
  const byReq = new Map<string, LedgerBill[]>();
  const seen = new Set<string>();
  for (const b of bills) {
    if (!b || !b.requestId || seen.has(b.id)) continue;
    seen.add(b.id);
    if (!byReq.has(b.requestId)) byReq.set(b.requestId, []);
    byReq.get(b.requestId)!.push(b);
  }
  return requests
    .filter((r) => r && r.status === 'received' && r.kind !== 'excess')
    .map((r) => {
      const mine = (byReq.get(r.id) || []).slice().sort((a, b) => str(b.createdAt).localeCompare(str(a.createdAt)));
      const sum = (st: string) => round2(mine.filter((b) => b.status === st).reduce((t, b) => t + num(b.amount), 0));
      const approved = sum('approved');
      const awaiting = sum('pending');
      const rejected = sum('rejected');
      const raised = round2(num(r.amount));
      const submitted = round2(approved + awaiting);
      return {
        r,
        bills: mine,
        raised,
        approved,
        awaiting,
        rejected,
        submitted,
        outstanding: Math.max(0, round2(raised - submitted)),
        over: Math.max(0, round2(submitted - raised)),
        complete: raised > 0 && submitted >= raised,
        count: mine.filter((b) => b.status !== 'rejected').length,
      };
    });
}

export type DatePreset = '' | 'today' | '7d' | '30d' | 'month' | 'custom';
/**
 * The ledger's date filter, on the IST day the request was raised (ledgerInRange / baInDateRange).
 * 'custom' is an inclusive From / To, either of which may be blank.
 */
export function inRange(iso: string | undefined | null, preset: DatePreset, today: string, istDay: (iso: string) => string, from = '', to = '') {
  if (!preset) return true;
  if (preset === 'custom') {
    const c = iso ? istDay(iso) : '';
    if (!c) return !from && !to;
    return (!from || c >= from) && (!to || c <= to);
  }
  if (!iso) return false;
  const d = istDay(iso);
  if (!d) return false;
  if (preset === 'today') return d === today;
  if (preset === 'month') return d.slice(0, 7) === today.slice(0, 7);
  const back = preset === '7d' ? 6 : 29;
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - back);
  return d >= start.toISOString().slice(0, 10) && d <= today;
}

export function ledgerColumns(today: string) {
  const first: GridColumn<LedgerRow> = {
    key: 'who',
    label: 'Requester',
    width: 150,
    cell: (L) => ({ text: L.r.employeeName || 'Unnamed', sub: L.r.onBehalf && L.r.requestedByName ? `raised by ${L.r.requestedByName}` : L.r.employeeDept || undefined }),
    sort: (L) => L.r.employeeName || '',
  };
  const columns: GridColumn<LedgerRow>[] = [
    { key: 'ref', label: 'Request', long: 'Request number', width: 150, align: 'left', cell: (L) => ({ text: pettyCashRef('request', L.r), sub: [L.r.kekaCode, L.r.projectName].filter(Boolean).join(' · ') || undefined, tone: 'brand' }) },
    { key: 'date', label: 'Raised on', long: 'Request date', width: 104, align: 'left', cell: (L) => (L.r.createdAt ? dateLabel(L.r.createdAt, today) : null), sort: (L) => str(L.r.createdAt) },
    { key: 'raised', label: 'Raised', long: 'Money given', width: 96, cell: (L) => ({ text: rupees(L.raised), strong: true }), sort: (L) => L.raised },
    {
      key: 'submitted',
      label: 'Bills in',
      long: 'Bills submitted (approved and waiting)',
      width: 110,
      cell: (L) => ({ text: rupees(L.submitted), tone: 'good', strong: true, sub: `${L.count} ${L.count === 1 ? 'bill' : 'bills'}${L.raised > 0 ? ` · ${Math.min(100, Math.round((L.submitted / L.raised) * 100))}%` : ''}` }),
      sort: (L) => L.submitted,
    },
    { key: 'awaiting', label: 'Waiting review', long: 'Bills waiting for review', width: 96, cell: (L) => (L.awaiting ? { text: rupees(L.awaiting), tone: 'warn' } : null), sort: (L) => L.awaiting },
    { key: 'rejected', label: 'Rejected', long: 'Bills rejected (not counted)', width: 92, cell: (L) => (L.rejected ? { text: rupees(L.rejected), tone: 'muted' } : null), sort: (L) => L.rejected },
    { key: 'outstanding', label: 'Bills to come', long: 'Still to be covered by bills', width: 100, cell: (L) => ({ text: rupees(L.outstanding), tone: L.outstanding > 0 ? 'warn' : 'good', strong: true }), sort: (L) => L.outstanding },
    { key: 'over', label: 'Over', long: 'Over the money given', width: 88, cell: (L) => (L.over ? { text: rupees(L.over), tone: 'bad', strong: true } : null), sort: (L) => L.over },
    { key: 'status', label: 'Payment', long: 'Payment', width: 92, align: 'left', cell: (L) => ({ text: statusMeta(L.r.status).label, tone: 'good' }) },
  ];
  return { first, columns };
}

export const filterLedger = (rows: LedgerRow[], q: string) =>
  rows.filter((L) => has(q, L.r.employeeName, L.r.requestedByName, pettyCashRef('request', L.r), L.r.id, L.r.kekaCode, L.r.projectName));

export function ledgerTotals(rows: LedgerRow[]) {
  const sum = (k: 'raised' | 'submitted' | 'outstanding' | 'awaiting' | 'rejected' | 'over') => round2(rows.reduce((t, L) => t + L[k], 0));
  return { raised: sum('raised'), submitted: sum('submitted'), outstanding: sum('outstanding'), awaiting: sum('awaiting'), rejected: sum('rejected'), over: sum('over') };
}

export function billLines(L: LedgerRow, today: string) {
  return L.bills.map((b) => ({
    key: b.id,
    label: `${pettyCashRef('bill', b)} · ${b.createdAt ? dateLabel(b.createdAt, today) : ''}`,
    value: `${rupees(b.amount)} · ${b.status === 'rejected' ? 'Rejected, not counted' : b.status === 'pending' ? 'Waiting review' : 'Counted'}`,
    hint: [b.description, b.status === 'rejected' && 'rejectionReason' in b && b.rejectionReason ? `Rejected: ${b.rejectionReason}` : null].filter(Boolean).join(' · ') || null,
  }));
}

/** Expense claims paid and confirmed received (the ledger's own "Reimbursements" tab — not petty cash). */
export const receivedClaims = (list: Reimbursement[]) => list.filter((m) => m && m.status === 'received');

export function claimColumns(today: string) {
  const first: GridColumn<Reimbursement> = { key: 'who', label: 'Employee', width: 150, cell: (m) => m.employee_name || 'Unnamed', sort: (m) => m.employee_name || '' };
  const columns: GridColumn<Reimbursement>[] = [
    { key: 'ref', label: 'Claim', long: 'Claim number', width: 150, align: 'left', cell: (m) => ({ text: reimbursementRef(m), sub: [m.keka_code, m.project_name].filter(Boolean).join(' · ') || undefined, tone: 'brand' }) },
    { key: 'purpose', label: 'For', long: 'Purpose', width: 104, align: 'left', cell: (m) => PURPOSE_LABEL[str(m.purpose)] || str(m.purpose) || null },
    { key: 'date', label: 'Sent on', long: 'Submitted', width: 104, align: 'left', cell: (m) => (m.created_at ? dateLabel(m.created_at, today) : null), sort: (m) => str(m.created_at) },
    { key: 'amount', label: 'Amount', width: 96, cell: (m) => ({ text: rupees(m.amount), strong: true }), sort: (m) => num(m.amount) },
    { key: 'got', label: 'Received on', long: 'Received on', width: 104, align: 'left', cell: (m) => (m.payment?.response?.at ? dateLabel(m.payment.response.at, today) : null), sort: (m) => str(m.payment?.response?.at) },
    { key: 'via', label: 'Paid via', long: 'Payment reference', width: 130, align: 'left', cell: (m) => [m.payment?.reference ? `Ref ${m.payment.reference}` : null, m.payment?.method].filter(Boolean).join(' · ') || null },
  ];
  return { first, columns };
}

export const filterClaims = (rows: Reimbursement[], q: string) => rows.filter((m) => has(q, m.employee_name, reimbursementRef(m), m.keka_code, m.project_name, m.purpose));

// ═════════════════════════════════════════════════════════════════════════════
// Employee roster (EmpRoster table, dash.html:5871) — every column except the photo.
// ═════════════════════════════════════════════════════════════════════════════
export function deptOf(dept: string, departments: Department[] | undefined) {
  if (!dept) return '';
  return (departments ?? []).find((d) => d.id === dept)?.name ?? dept;
}

export function rosterColumns(today: string, departments: Department[] | undefined) {
  const status = (r: RosterRecord): CellInput =>
    r.invited ? { text: 'Not signed up', tone: 'warn' } : r.resigned ? { text: 'Resigned', tone: 'muted' } : { text: 'Active', tone: 'good' };
  const day = (v: string) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? dateLabel(v.slice(0, 10), today) : v || null);
  const first: GridColumn<RosterRecord> = { key: 'name', label: 'Name', width: 150, cell: (r) => r.name, sort: (r) => r.name };
  const columns: GridColumn<RosterRecord>[] = [
    { key: 'emp', label: 'Emp no.', long: 'Employee number', width: 90, align: 'left', cell: (r) => r.employeeNumber || null, sort: (r) => r.employeeNumber },
    { key: 'email', label: 'Work email', width: 200, align: 'left', cell: (r) => r.email || null, sort: (r) => r.email },
    { key: 'gender', label: 'Gender', width: 76, align: 'left', cell: (r) => r.gender || null },
    { key: 'mobile', label: 'Mobile', width: 120, align: 'left', cell: (r) => r.mobile || null },
    { key: 'location', label: 'Location', width: 110, align: 'left', cell: (r) => r.location || null, sort: (r) => r.location },
    { key: 'dept', label: 'Team', long: 'Department', width: 120, align: 'left', cell: (r) => deptOf(r.dept, departments) || null, sort: (r) => deptOf(r.dept, departments) },
    { key: 'title', label: 'Job title', width: 130, align: 'left', cell: (r) => r.jobTitle || null, sort: (r) => r.jobTitle },
    { key: 'mgr', label: 'Reports to', long: 'Reporting manager', width: 130, align: 'left', cell: (r) => r.reportingManager || null, sort: (r) => r.reportingManager },
    { key: 'joined', label: 'Joined', long: 'Date joined', width: 104, align: 'left', cell: (r) => day(r.dateJoined), sort: (r) => r.dateJoined },
    { key: 'dob', label: 'Birthday', long: 'Date of birth', width: 104, align: 'left', cell: (r) => day(r.dob) },
    { key: 'blood', label: 'Blood', long: 'Blood group', width: 62, align: 'center', cell: (r) => r.bloodGroup || null },
    { key: 'status', label: 'Status', width: 104, align: 'left', cell: status, sort: (r) => (r.invited ? 2 : r.resigned ? 1 : 0) },
    { key: 'role', label: 'Role', width: 110, align: 'left', cell: (r) => ROLE_LABEL[r.role] ?? r.role, sort: (r) => ROLE_LABEL[r.role] ?? r.role },
  ];
  return { first, columns };
}

export type RosterFilter = 'all' | 'active' | 'resigned' | 'invited';
export const filterRoster = (rows: RosterRecord[], q: string, f: RosterFilter, departments: Department[] | undefined) =>
  rows.filter(
    (r) =>
      r &&
      has(q, r.name, r.email, r.employeeNumber, r.jobTitle, r.mobile, r.location, deptOf(r.dept, departments), r.reportingManager) &&
      (f === 'all' || (f === 'invited' ? r.invited : f === 'resigned' ? !r.invited && r.resigned : !r.invited && !r.resigned)),
  );
