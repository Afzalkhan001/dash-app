// Attendance-only helpers: state labels (dash.html HR_STATE / HR_REQ_STATUS), the app's one way of
// writing durations ("7h 50m"), clock times ("9:42 AM") and dates ("Mon, 19 Oct") under the names
// attendance uses (the formatting itself is lib/dates, shared by every screen), and date-only
// arithmetic. Dates are bare 'YYYY-MM-DD' strings parsed as UTC, so no timezone can shift a day — the
// server does the same (hr_timesheet.js addDays).

import type { AttendanceRow, Ping } from '@/api/attendance';
import { durationLabel, hmLabel, MONTHS, monthYear, timeOf } from '@/lib/dates';
import type { StatusTone } from '@/theme/tokens';

// ── States ───────────────────────────────────────────────────────────────────
export const DAY_STATE: Record<string, { label: string; tone: StatusTone }> = {
  in_progress: { label: 'Working', tone: 'info' },
  present: { label: 'Present', tone: 'done' },
  half_day: { label: 'Half day', tone: 'pending' },
  short: { label: 'Short hours', tone: 'failed' },
  incomplete: { label: 'No clock-out', tone: 'failed' },
  absent: { label: 'Absent', tone: 'neutral' },
};
export const dayState = (s?: string | null) => DAY_STATE[s ?? ''] ?? DAY_STATE.absent!;

// Plain status words used across the app: Waiting / Approved / Rejected / Cancelled.
export const REQ_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: 'Waiting', tone: 'pending' },
  approved: { label: 'Approved', tone: 'done' },
  rejected: { label: 'Rejected', tone: 'failed' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
export const reqStatus = (s: string) => REQ_STATUS[s] ?? { label: s || 'Unknown', tone: 'neutral' as StatusTone };

// The server's clock-in/out modes in plain words — one vocabulary everywhere (the day sheet's
// subtitle already says "Remote · Fixed"). An unknown mode is shown capitalised, never dropped.
export const MODE_WORD: Record<string, string> = {
  office: 'In office',
  remote: 'Remote',
  outside: 'Outside office area',
  regularized: 'Fixed',
};
const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// 'office' reads as "In office (35 m from centre)", like the web clock card.
export function modeLabel(mode?: string | null, distanceM?: number | null) {
  if (!mode) return '—';
  if (mode === 'office') return distanceM != null ? `In office (${distanceM} m from centre)` : 'In office';
  return MODE_WORD[mode] ?? capitalised(mode);
}
export function modeShort(mode?: string | null) {
  if (!mode) return '—';
  return MODE_WORD[mode] ?? capitalised(mode);
}

// A server message as the app shows it: the server's words, minus the website's menu paths
// ("(Config → HR Access)", "Open Me → Timesheets, fill them in…"), which mean nothing in the app, and
// with the website's jargon in the app's plain words ("pick a Keka Code" → "pick a project code",
// "regularize" → "fix", "Row 2:" → "Entry 2:", "(09:42)" → "(9:42 AM)", "Mon 12 Oct" → "Mon, 12 Oct").
export function plainServerText(msg: string) {
  return String(msg ?? '')
    .replace(/Open Me\s*→\s*Timesheets,\s*fill/i, 'Fill')
    .replace(/\s*\([^()]*→[^()]*\)/g, '')
    .replace(/\b(?:Keka|Cost)\s+Code\s+Owner\b|\bKeka\s+Owner\b/gi, 'project owner')
    .replace(/\b(?:Keka|Cost)\s+Code\b/gi, 'project code')
    .replace(/\bregulari[sz]e\b/gi, 'fix')
    .replace(/^Row (\d+):/, 'Entry $1:')
    .replace(/\((\d{2}:\d{2})\)/g, (_, hm: string) => `(${prettyHm(hm)})`)
    // The server's dates ("Mon 12 Oct, Tue 13 Oct") in the app's format ("Mon, 12 Oct · Tue, 13 Oct").
    .replace(
      /\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))\b(, (?=(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d))?/g,
      (_, wd: string, dm: string, sep?: string) => `${wd}, ${dm}${sep ? ' · ' : ''}`,
    )
    .trim();
}

// ── Date-only arithmetic ─────────────────────────────────────────────────────
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const utc = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
export function addDays(ymd: string, n: number) {
  const d = utc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekdayOf = (ymd: string) => utc(ymd).getUTCDay();
export const mondayOf = (ymd: string) => addDays(ymd, -((weekdayOf(ymd) + 6) % 7));

export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export function daysInMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const monthLabel = (ym: string) => monthYear(ym);
export function eachDate(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// 'Mon, 6 Oct' — the one date format. Pass this year ('2026') to add the year only when it differs:
// 'Sun, 19 Oct 2025'.
export function shortDay(ymd: string, thisYear?: string) {
  const t = utc(ymd);
  if (!Number.isFinite(t.getTime())) return '—';
  const y = String(t.getUTCFullYear());
  return `${WEEKDAYS[t.getUTCDay()]}, ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}${thisYear && y !== thisYear ? ` ${y}` : ''}`;
}
// '6 Oct' — for a range or a heading where the weekday doesn't fit ('13 – 19 Oct'). Same month names
// as shortDay (never the 'Sept' some phones' Intl gives), so one screen never mixes the two.
export function dayMonth(ymd: string, thisYear?: string) {
  const t = utc(ymd);
  if (!Number.isFinite(t.getTime())) return '—';
  const y = String(t.getUTCFullYear());
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}${thisYear && y !== thisYear ? ` ${y}` : ''}`;
}
// 'Oct' — the month under a day number in a date disc.
export const monthShort = (ymd: string) => MONTHS[utc(ymd).getUTCMonth()] ?? '';

// A YYYY-MM-DD prefix out of a free-form stored date ('2024-03-01', '2024-03-01T…'); '' when unreadable.
export const ymdPrefix = (v: unknown) => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? ''));
  return m ? m[1]! : '';
};

// ── Durations and times ──────────────────────────────────────────────────────
// The app-wide helpers in lib/dates, under the names attendance has always used.
// 7h 50m / 50m (web tsFmt) — the one way a duration is written.
export const tsFmt = (m: number) => durationLabel(m);
// The same for a value that may be missing: '—' instead of '0m'.
export const duration = (m?: number | null) => durationLabel(m);
// Minutes from one HH:MM to another (0 when either is not a time).
export function minutesBetween(a?: string | null, b?: string | null) {
  if (!/^\d{2}:\d{2}$/.test(a || '') || !/^\d{2}:\d{2}$/.test(b || '')) return 0;
  return Number(b!.slice(0, 2)) * 60 + Number(b!.slice(3, 5)) - (Number(a!.slice(0, 2)) * 60 + Number(a!.slice(3, 5)));
}
// 7h 42m 05s / 42m 05s — the live, ticking timer on the clock card: a duration, so it never reads like
// a clock time ("7:42").
export function hms(totalSeconds: number) {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}h ${String(m).padStart(2, '0')}m ${sec}s` : `${m}m ${sec}s`;
}
// '09:30' → '9:30 AM'
export const prettyHm = (hm?: string | null) => hmLabel(hm);
// A server timestamp as India time, '9:42 AM' ('—' when missing or unreadable, never a RangeError).
export const clockTime = (iso?: string | null) => timeOf(iso);

// ── Geo ──────────────────────────────────────────────────────────────────────
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (x: number) => (x * Math.PI) / 180;
  const dl = r(lat2 - lat1);
  const dg = r(lng2 - lng1);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dg / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;

// Hourly slots that were due on a remote day but have no check-in (slot n is due at clock-in + n hours,
// up to 9, until clock-out) — dash.html hrMissedSlots.
export function missedSlots(r: AttendanceRow, nowMs: number) {
  if (!r || r.in_mode !== 'remote' || !r.in_at) return { due: 0, missed: [] as { slot: number; at: string }[] };
  const inMs = new Date(r.in_at).getTime();
  const end = Math.min(r.out_at ? new Date(r.out_at).getTime() : nowMs, inMs + (9 * 60 + 5) * 60000);
  const due = Math.max(0, Math.min(9, Math.floor((end - inMs) / 3600000)));
  const have = new Set((r.pings || []).map((p: Ping) => p.slot));
  const missed: { slot: number; at: string }[] = [];
  for (let n = 1; n <= due; n++) if (!have.has(n)) missed.push({ slot: n, at: new Date(inMs + n * 3600000).toISOString() });
  return { due, missed };
}
