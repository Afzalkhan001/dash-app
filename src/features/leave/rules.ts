// Leave rules and labels shared by the Leave screens. The counting helpers are ports of the server's
// (hr_common.js eachDate/weekday/countWorkingDays, hr_leave.js leaveYearOf) so the app's estimate and
// the server's final count can only differ where the app cannot see an input (e.g. a holiday list).
// Labels follow the web (dash.html HR_HALF 4824, HR_REQ_STATUS 4624, MyLeaveRequests 4875).

import type { HalfDay, LeaveBalanceRow, LeaveKind, LeaveRequest, LeaveStatus } from '@/api/leave';
import { dateLabel, dayLabel, stampLabel as libStampLabel, todayIst } from '@/lib/dates';
import type { StatusTone } from '@/theme/tokens';

// ── Calendar maths on 'YYYY-MM-DD' strings, in UTC so the phone's own time zone never leaks in ──
// A real calendar date string. Everything that formats or steps through dates checks this first, so a
// malformed value from the API shows "—" instead of throwing (Intl.format throws on an Invalid Date).
// An impossible date such as '2026-13-40' fails too (it would be an Invalid Date).
export const isYmd = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

// A bad date or step (e.g. a missing setting) returns the date unchanged instead of throwing.
export function addDays(ymd: string, n: number) {
  const t = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || !Number.isFinite(n)) return ymd;
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export const weekdayOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

export function eachDate(from: string | null, to: string | null) {
  const out: string[] = [];
  if (!isYmd(from) || !isYmd(to) || to < from) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// hr_common.js countWorkingDays: calendar days minus weekly offs and mandatory holidays; a half day is 0.5.
export function countWorkingDays(from: string, to: string, weeklyOff: number[], holidays: Set<string>, half: HalfDay) {
  const off = Array.isArray(weeklyOff) ? weeklyOff : [];
  let n = 0;
  for (const d of eachDate(from, to)) if (!off.includes(weekdayOf(d)) && !holidays.has(d)) n += 1;
  if (half !== 'none') n = n > 0 ? 0.5 : 0;
  return n;
}

// hr_leave.js leaveYearOf: a leave year is labelled by the calendar year in which it starts.
export function leaveYearOf(ymd: string, startMonth: number) {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  return m >= startMonth ? y : y - 1;
}

// The server's cancel rule (hr_leave.js ~L420), which is also when the web shows its Cancel button.
export function canCancel(r: LeaveRequest, today = todayIst()) {
  return r.status === 'pending' || (r.status === 'approved' && r.kind !== 'comp_off' && r.from_date > today);
}

// Pending/approved leave or WFH on any of these dates — the server refuses those (hr_leave.js overlapping()).
export function overlaps(requests: LeaveRequest[], from: string, to: string) {
  return (Array.isArray(requests) ? requests : []).filter(
    (r) => r.kind !== 'comp_off' && (r.status === 'pending' || r.status === 'approved') && r.from_date <= to && r.to_date >= from,
  );
}

// The web shows a balance number only for paid and comp-off types; unpaid (loss of pay) shows '—'.
export const countsBalance = (b: Pick<LeaveBalanceRow, 'paid' | 'is_comp_off'>) => b.paid || b.is_comp_off;

// ── Labels ──
// The button that starts a request of each kind (Me › Leave, the empty request history).
export const APPLY_TITLE: Record<LeaveKind, string> = { leave: 'Apply leave', wfh: 'Work from home', comp_off: 'Claim comp-off' };

// Same words as the form's Full day | 1st half | 2nd half switch.
export const HALF_LABEL: Record<HalfDay, string> = { none: 'Full day', first: '1st half', second: '2nd half' };

// Plain status words used across the app: Waiting / Approved / Rejected / Cancelled.
export const STATUS_META: Record<LeaveStatus, { label: string; tone: StatusTone }> = {
  pending: { label: 'Waiting', tone: 'pending' },
  approved: { label: 'Approved', tone: 'done' },
  rejected: { label: 'Rejected', tone: 'failed' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const statusMeta = (s: string) => STATUS_META[s as LeaveStatus] ?? { label: String(s ?? '') || 'Unknown', tone: 'neutral' as StatusTone };

// Row title: the leave type's name when known (the request only carries its code), else the web's label.
export function requestTitle(r: LeaveRequest, typeName?: string | null) {
  if (r.kind === 'wfh') return 'Work from home';
  if (r.kind === 'comp_off') return 'Comp-off claim';
  return typeName || r.leave_code || 'Leave';
}

// Status filter on the full list (/leave/requests): rejected and cancelled are both "closed".
export type RequestFilter = 'all' | 'pending' | 'approved' | 'closed';

export function matchesFilter(r: LeaveRequest, f: RequestFilter) {
  if (f === 'all') return true;
  if (f === 'closed') return r.status === 'rejected' || r.status === 'cancelled';
  return r.status === f;
}

export const isRequestFilter = (v: unknown): v is RequestFilter => v === 'all' || v === 'pending' || v === 'approved' || v === 'closed';

// One short line each (empty states never explain more than that).
const EMPTY_COPY: Record<RequestFilter, { title: string; message: string }> = {
  all: { title: 'No requests yet', message: 'Your leave, work from home and comp-off requests show up here.' },
  pending: { title: 'Nothing waiting', message: 'Requests waiting for approval show up here.' },
  approved: { title: 'Nothing approved yet', message: 'Approved requests show up here.' },
  closed: { title: 'Nothing rejected or cancelled', message: 'Rejected and cancelled requests show up here.' },
};

export const emptyCopy = (f: RequestFilter, hasAny: boolean) => EMPTY_COPY[hasAny ? f : 'all'];

// ── Numbers and dates ──
// Monthly accrual gives values like 5.83, so keep up to two decimals (the server rounds to two).
export function fmtNum(n: number | null | undefined) {
  const v = Number(n);
  if (n == null || !Number.isFinite(v)) return '—';
  return String(Math.round(v * 100) / 100);
}

export const dayCount = (n: number) => `${fmtNum(n)} ${Number(n) === 1 ? 'day' : 'days'}`;

// How long a request is, in the form's words: "Half a day" for 0.5, else "3 days".
export const requestDays = (n: number) => (Number(n) === 0.5 ? 'Half a day' : dayCount(n));

// How many decimals fmtNum shows for n (0–2) — for <Metric decimals> so 5.83 keeps its greyed ".83".
export function decimalsOf(n: number | null | undefined) {
  const s = fmtNum(n);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : Math.min(2, s.length - dot - 1);
}

// The app's one date style: "Mon, 19 Oct" for a day, "12 – 14 Oct" for a range, "9:42 AM" for a time;
// the year only when it isn't this year. `today` decides that. Components pass the date from
// useTodayIst() so render never reads the clock (the default is for event handlers and non-React
// callers only).
const withYear = (on: boolean): Intl.DateTimeFormatOptions => (on ? { year: 'numeric' } : {});

export function rangeLabel(from: string, toDate: string, today = todayIst()) {
  if (!isYmd(from)) return '—';
  const to = isYmd(toDate) ? toDate : from;
  const thisYear = today.slice(0, 4);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const showYear = !sameYear || from.slice(0, 4) !== thisYear;
  if (from === to) return shortDate(from, today);
  const end = dayLabel(to, { day: 'numeric', month: 'short', ...withYear(showYear) });
  // Same month: "12 – 14 Oct".
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8, 10))} – ${end}`;
  return `${dayLabel(from, { day: 'numeric', month: 'short', ...withYear(!sameYear) })} – ${end}`;
}

/** 'YYYY-MM-DD' → "Mon, 19 Oct" ("Sun, 19 Oct 2025" outside this year). */
export function shortDate(ymd: string, today = todayIst()) {
  return isYmd(ymd) ? dateLabel(ymd, today) : '—';
}

/** A server timestamp → "Mon, 19 Oct, 9:42 AM" (India time; the year only when it isn't this year). */
export function stampLabel(iso: string | null | undefined, today = todayIst()) {
  return libStampLabel(iso, today);
}

// "Jan – Dec 2026" or "Apr 2026 – Mar 2027".
export function periodLabel(p?: { from: string; to: string } | null) {
  if (!p || !isYmd(p.from) || !isYmd(p.to)) return null;
  const sameYear = p.from.slice(0, 4) === p.to.slice(0, 4);
  const to = dayLabel(p.to, { month: 'short', year: 'numeric' });
  return `${dayLabel(p.from, sameYear ? { month: 'short' } : { month: 'short', year: 'numeric' })} – ${to}`;
}
