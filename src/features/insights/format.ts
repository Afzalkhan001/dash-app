// Small pure helpers for the insights screens: IST day maths for Reports, and the TM360 formatting the
// website uses (tmParse, tmDur, tmDept, the hour grouping of Tm360Activity — dash.html:10404–10560).

import type { Tm360Activity, Tm360Employee, Tm360Live } from '@/api/insights';
import { addDaysYmd, monthBounds, weekdayOfYmd } from '@/lib/ist';
import { dayLabel, istParts, monthYear } from '@/lib/dates';
import type { StatusTone } from '@/theme/tokens';

// ── Days ─────────────────────────────────────────────────────────────────────
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** GRID_DOW (23741) for a 'YYYY-MM-DD'. */
export const weekdayShort = (ymd: string) => DOW[weekdayOfYmd(ymd)] ?? '';

export function daysInMonthYm(ym: string) {
  const b = monthBounds(ym);
  return b ? Number(b.to.slice(8, 10)) : 30;
}

export type RangeKey = 'today' | 'week' | 'month' | 'lastMonth' | 'custom';
export type DateRange = { key: RangeKey; from: string; to: string };

/** The range presets (the website has Today and This month; the phone adds this week and last month). */
export function presetRange(key: Exclude<RangeKey, 'custom'>, today: string): DateRange {
  if (key === 'today') return { key, from: today, to: today };
  if (key === 'week') {
    const back = (weekdayOfYmd(today) + 6) % 7; // Monday first
    return { key, from: addDaysYmd(today, -back), to: today };
  }
  if (key === 'month') return { key, from: `${today.slice(0, 7)}-01`, to: today };
  const first = `${today.slice(0, 7)}-01`;
  const lastDay = addDaysYmd(first, -1);
  return { key, from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
}

const RANGE_NAME: Record<RangeKey, string> = { today: 'Today', week: 'This week', month: 'This month', lastMonth: 'Last month', custom: '' };

export function rangeLabel(r: DateRange, today: string) {
  if (r.key !== 'custom') return RANGE_NAME[r.key];
  const y = today.slice(0, 4);
  const opts = (d: string): Intl.DateTimeFormatOptions => ({ day: 'numeric', month: 'short', ...(d.slice(0, 4) !== y && { year: 'numeric' }) });
  return r.from === r.to ? dayLabel(r.from, opts(r.from)) : `${dayLabel(r.from, opts(r.from))} – ${dayLabel(r.to, opts(r.to))}`;
}

export const shortDay = (ymd: string, today: string) =>
  ymd ? dayLabel(ymd, { weekday: 'short', day: 'numeric', month: 'short', ...(ymd.slice(0, 4) !== today.slice(0, 4) && { year: 'numeric' }) }) : '—';

// ── TM360 ────────────────────────────────────────────────────────────────────
/**
 * tmParse (10416): TM360 stores UTC as `timestamp without time zone`, so a bare "2026-09-22 11:58:05"
 * has no zone; read it as UTC. A value with a zone is left alone; a bare date is UTC midnight.
 */
export function tmParse(v: unknown): Date | null {
  if (!v) return null;
  const raw = String(v);
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  const hasTime = /\d{2}:\d{2}/.test(raw);
  const d = new Date(hasZone || !hasTime ? raw : `${raw.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** tmDur (10441): 3725 → '1h 2m', 300 → '5m'. */
export function tmDur(secs: unknown) {
  const n = Math.max(0, Number(secs) || 0);
  const h = Math.floor(n / 3600);
  const m = Math.round((n % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

const p2 = (n: number) => String(n).padStart(2, '0');
function hm12(h: number, m: number) {
  return `${((h + 11) % 12) + 1}:${p2(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** An instant as 'Tue, 20 Oct, 9:42 AM' in India time; '—' when missing. */
export function tmWhen(v: unknown, today: string) {
  const d = tmParse(v);
  if (!d) return '—';
  const p = istParts(d);
  return `${shortDay(p.date, today)}, ${hm12(p.hour, p.minute)}`;
}

/** Only the India time ('9:42 AM'), or the day too when it is not today. */
export function tmSeen(v: unknown, today: string) {
  const d = tmParse(v);
  if (!d) return '';
  const p = istParts(d);
  return p.date === today ? hm12(p.hour, p.minute) : `${shortDay(p.date, today)}, ${hm12(p.hour, p.minute)}`;
}

/** tmDept (10431): a department id → its name; an unknown id shows nothing rather than itself. */
export function tmDept(v: unknown, depts: readonly { id: string; name: string }[] | undefined) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const list = depts ?? [];
  const byId = list.find((d) => String(d.id) === raw);
  if (byId?.name) return byId.name;
  const byName = list.find((d) => String(d.name || '').toLowerCase() === raw.toLowerCase());
  if (byName?.name) return byName.name;
  return /^d\d{8,}/.test(raw) || /^dept-/.test(raw) ? '' : raw;
}

/** TM_STATUS_STYLE (10446): the pairing state of one machine. */
export function deviceStatus(status: string): { label: string; tone: StatusTone } {
  if (status === 'ACTIVE') return { label: 'Paired', tone: 'done' };
  if (status === 'PENDING') return { label: 'Awaiting pairing', tone: 'pending' };
  if (status === 'REVOKED') return { label: 'Unpaired', tone: 'failed' };
  return { label: status || '—', tone: 'neutral' };
}

/** TM_LIVE_STYLE (10845): what the person's machine is doing right now. */
export function liveState(state: string | undefined): { label: string; tone: StatusTone } {
  if (state === 'online') return { label: 'Active', tone: 'done' };
  if (state === 'idle') return { label: 'Idle', tone: 'pending' };
  if (state === 'unpaired') return { label: 'Not paired', tone: 'neutral' };
  return { label: 'Offline', tone: 'neutral' };
}

/** The last time a paired machine was seen (Tm360Hub 11106). */
export const lastSeenOf = (e: Tm360Employee) =>
  e.devices
    .filter((x) => x.status === 'ACTIVE')
    .map((x) => x.lastSeenAt)
    .filter(Boolean)
    .sort()
    .pop() ?? '';

export type RosterFilter = 'linked' | 'tracked' | 'online' | 'idle' | 'unpaired' | 'paired' | 'unlinked' | 'all';

/** The roster filter (Tm360Hub 10943–10954), exactly as the website applies it. */
export function rosterMatches(e: Tm360Employee, f: RosterFilter, live: Tm360Live['status']) {
  const s = live[e.email];
  if (f === 'linked') return e.matched;
  if (f === 'unlinked') return !e.matched;
  if (f === 'paired') return e.devices.some((x) => x.status === 'ACTIVE');
  if (f === 'tracked') return !!s;
  if (f === 'online') return s?.state === 'online';
  if (f === 'idle') return !!s && ['idle', 'offline'].includes(s.state);
  if (f === 'unpaired') return s?.state === 'unpaired';
  return true;
}

/** Search across name, email, department, job title and employee number (10951). */
export function rosterSearch(e: Tm360Employee, needle: string, deptName: string) {
  if (!needle) return true;
  return [e.name, e.email, deptName, e.jobTitle, e.employeeNumber].some((v) => String(v || '').toLowerCase().includes(needle));
}

export type HourItem = { app: string; where: string; idle: boolean; seconds: number; count: number; category: string };
export type HourGroup = { key: string; start: number; entries: number; active: number; idle: number; items: HourItem[] };

const HOUR = 3_600_000;
const IST_MS = 330 * 60_000;
/** The start of the India-time hour an instant falls in (the website buckets in the viewer's clock). */
const istHourStart = (ms: number) => Math.floor((ms + IST_MS) / HOUR) * HOUR - IST_MS;

/**
 * Tm360Activity's hour grouping (10512–10549): each block is split across the hours it spans (at most
 * 48), summed per application + site, idle and active kept apart; newest hour first.
 */
export function groupByHour(rows: readonly Tm360Activity[]): HourGroup[] {
  const map = new Map<number, { entries: number; active: number; idle: number; items: Map<string, HourItem> }>();
  for (const r of rows) {
    const d = tmParse(r.occurredAt);
    if (!d) continue;
    const secs = Math.max(0, Number(r.durationSeconds) || 0);
    const startMs = d.getTime();
    const endMs = startMs + secs * 1000;
    const app = r.appName || '—';
    const where = r.domain || r.windowTitle || '';
    const ik = `${app}\u0000${where}\u0000${r.isIdle ? 'i' : 'a'}`;
    let pos = startMs;
    let guard = 0;
    let first = true;
    do {
      const bStart = istHourStart(pos);
      const bEnd = bStart + HOUR;
      const slice = Math.max(0, Math.min(endMs, bEnd) - pos) / 1000;
      let h = map.get(bStart);
      if (!h) {
        h = { entries: 0, active: 0, idle: 0, items: new Map() };
        map.set(bStart, h);
      }
      if (first) {
        h.entries++;
        first = false;
      }
      if (r.isIdle) h.idle += slice;
      else h.active += slice;
      const it = h.items.get(ik) ?? { app, where, idle: !!r.isIdle, seconds: 0, count: 0, category: r.category || '' };
      it.seconds += slice;
      it.count++;
      h.items.set(ik, it);
      pos = bEnd;
    } while (pos < endMs && ++guard < 48);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([start, h]) => ({ key: String(start), start, entries: h.entries, active: h.active, idle: h.idle, items: [...h.items.values()].sort((a, b) => b.seconds - a.seconds) }));
}

/** '20 Oct, 9:00 AM – 10:00 AM' (hourLabel 10555), in India time. */
export function hourLabel(start: number, today: string) {
  const a = istParts(new Date(start));
  const b = istParts(new Date(start + HOUR));
  return `${shortDay(a.date, today)}, ${hm12(a.hour, a.minute)} – ${hm12(b.hour, b.minute)}`;
}

/** tmDefaultRange (10446): the last 7 days, in IST days. */
export const tmDefaultRange = (today: string) => ({ from: addDaysYmd(today, -7), to: today });

/** 'YYYY-MM' → 'October 2026'. */
export const monthLabelOf = (ym: string) => monthYear(ym);
