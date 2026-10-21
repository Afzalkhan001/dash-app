// Excel domain — how values are written INTO the sheets. Always India time, whatever the phone's
// timezone (the website writes the browser's local time, which for DASH's people is IST).
//   date      '21 Oct 2026'          (the website's en-IN / en-GB long dates)
//   time      '10:42 AM'
//   stamp     '21 Oct 2026, 10:42 AM'
//   hours     '7:50'                 (the website's fmtHrs: h:mm, '0:00' under a minute)
// Pure helpers: callers pass every instant; nothing here reads the clock.

import { istParts, MONTHS } from '@/lib/dates';

const instant = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return NaN;
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(t) ? t : NaN;
};

const hm12 = (h: number, m: number) => `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;

/** 'YYYY-MM-DD' or an instant → '21 Oct 2026' (IST); '' when empty, the raw text when unreadable. */
export function xDate(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
  const t = instant(v);
  if (!Number.isFinite(t)) return s;
  const d = istParts(new Date(t)).date;
  return xDate(d);
}

/** An instant → '10:42 AM' (IST). */
export function xTime(v: unknown): string {
  const t = instant(v);
  if (!Number.isFinite(t)) return '';
  const p = istParts(new Date(t));
  return hm12(p.hour, p.minute);
}

/** An instant → '21 Oct 2026, 10:42 AM' (IST); '—' when missing. */
export function xStamp(v: unknown): string {
  const t = instant(v);
  if (!Number.isFinite(t)) return '—';
  return `${xDate(new Date(t).toISOString())}, ${xTime(v)}`;
}

/** A stored 'HH:MM' → '9:30 AM'; '—' when missing (the website's fmtTime). */
export function xHm(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '—';
  const [hRaw, mRaw] = s.split(':');
  const h = parseInt(hRaw ?? '', 10);
  if (Number.isNaN(h)) return s;
  return hm12(h % 24, parseInt(mRaw ?? '0', 10) || 0);
}

/** Hours (decimal) → 'h:mm' (fmtHrs). */
export function xHrs(h: number): string {
  if (!h) return '0:00';
  const s = Math.round(h * 3600);
  if (s < 60) return '0:00';
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

/** Seconds → 'hh:mm:ss' (fmtHMS). */
export function xHms(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':');
}

/** Minutes since midnight of an instant, in IST. */
export function istMinutes(v: unknown): number | null {
  const t = instant(v);
  if (!Number.isFinite(t)) return null;
  const p = istParts(new Date(t));
  return p.hour * 60 + p.minute;
}

/** 'HH:MM' → minutes; null when unreadable. */
export function hmMinutes(v: unknown): number | null {
  if (!v) return null;
  const [h, m] = String(v).split(':');
  const hh = parseInt(h ?? '', 10);
  if (Number.isNaN(hh)) return null;
  return hh * 60 + (parseInt(m ?? '0', 10) || 0);
}

/** A file-name stamp: '2026-10-21'. */
export const fileDay = (today: string) => today;

/** The Indian financial year containing `today` (1 Apr – 31 Mar), the subscriptions hub default. */
export function fyRange(today: string) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}
