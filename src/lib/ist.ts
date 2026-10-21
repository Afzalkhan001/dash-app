// India-time arithmetic that lib/dates.ts does not have (Wave 0 shared helper, integrator-owned; any
// domain may import it). lib/dates.ts stays the one place for how a date or time is WRITTEN on screen
// (dateLabel, timeOf, stampLabel, durationLabel, monthYear); this file only does the sums.
//
// Every 'YYYY-MM-DD' here is an India calendar date and is handled as UTC midnight, so no phone
// timezone can shift a day. Functions that read the clock say so — never call those during render
// (take `today` from useTodayIst() in features/attendance/use-now instead).

import { istParts, todayIst } from '@/lib/dates';

const pad = (n: number) => String(n).padStart(2, '0');

/** A real 'YYYY-MM-DD' calendar date (not just the pattern: '2026-02-30' is false). */
export function isYmd(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** 'YYYY-MM-DD' plus `n` days (negative goes back). '' when the date is not valid. */
export function addDaysYmd(ymd: string, n: number) {
  if (!isYmd(ymd)) return '';
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.trunc(n));
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b − a); NaN when either is not a date. */
export function daysBetween(a: string, b: string) {
  if (!isYmd(a) || !isYmd(b)) return NaN;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Every date from `from` to `to`, both included (at most `max`, default 400). [] when invalid or reversed. */
export function ymdRange(from: string, to: string, max = 400) {
  const out: string[] = [];
  if (!isYmd(from) || !isYmd(to)) return out;
  for (let d = from; d <= to && out.length < max; d = addDaysYmd(d, 1)) out.push(d);
  return out;
}

/** Day of the week of a date: 0 Sunday … 6 Saturday (NaN when invalid). */
export const weekdayOfYmd = (ymd: string) => (isYmd(ymd) ? new Date(`${ymd}T00:00:00Z`).getUTCDay() : NaN);

/** The ISO instant of an India wall-clock time on a date: ('2026-10-21', '09:30') → '2026-10-21T04:00:00.000Z'. '' when invalid. */
export function istIsoAt(ymd: string, hm: string) {
  const m = /^(\d{1,2}):(\d{2})/.exec(typeof hm === 'string' ? hm.trim() : '');
  if (!isYmd(ymd) || !m || Number(m[1]) > 23 || Number(m[2]) > 59) return '';
  return new Date(`${ymd}T${pad(Number(m[1]))}:${m[2]}:00+05:30`).toISOString();
}

/** An instant's India wall clock as 'HH:MM' (24-hour, what the server stores). '' when invalid. */
export function istHmOf(iso?: string | null) {
  const t = typeof iso === 'string' && iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const p = istParts(new Date(t));
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** 'HH:MM' → minutes since midnight (NaN when invalid). */
export function hmToMinutes(hm?: string | null) {
  const m = /^(\d{1,2}):(\d{2})/.exec(typeof hm === 'string' ? hm.trim() : '');
  return m && Number(m[1]) <= 23 && Number(m[2]) <= 59 ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** Minutes since midnight → 'HH:MM' (wraps past 24 h). */
export function minutesToHm(min: number) {
  const m = (((Math.round(min) || 0) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Minutes since India midnight right now. Reads the clock: not during render. */
export function nowIstMinutes() {
  const p = istParts();
  return p.hour * 60 + p.minute;
}

/** The first and last date of a 'YYYY-MM' month: { from: '2026-10-01', to: '2026-10-31' }. null when invalid. */
export function monthBounds(ym: string) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(typeof ym === 'string' ? ym.trim() : '');
  if (!m) return null;
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${pad(last)}` };
}

/** 'YYYY-MM' plus `n` months. '' when invalid. */
export function addMonthsYm(ym: string, n: number) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(typeof ym === 'string' ? ym.trim() : '');
  if (!m) return '';
  const t = Number(m[1]) * 12 + (Number(m[2]) - 1) + Math.trunc(n);
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

/**
 * The Indian financial year (1 April – 31 March) a date falls in: { start: 2026, label: '2026-27',
 * from: '2026-04-01', to: '2027-03-31' }. On screen say "Financial year 2026-27" (docs/DESIGN.md §0B).
 * Without a date it uses today (reads the clock: pass `today` during render).
 */
export function financialYear(ymd?: string) {
  const d = isYmd(ymd) ? ymd : todayIst();
  const y = Number(d.slice(0, 4));
  const start = Number(d.slice(5, 7)) >= 4 ? y : y - 1;
  return { start, label: `${start}-${String((start + 1) % 100).padStart(2, '0')}`, from: `${start}-04-01`, to: `${start + 1}-03-31` };
}
