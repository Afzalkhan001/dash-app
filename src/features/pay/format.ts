// Formatting and small rules shared by the My Pay screens. Month names match the website's
// hrMonthName (dash.html ~L5045); the request-status labels and colours follow HR_REQ_STATUS (~L4624).

import type { PayslipSummary } from '@/api/pay';
import { dateLabel, monthYear } from '@/lib/dates';
import { titleCase } from '@/lib/format';
import type { StatusTone } from '@/theme/tokens';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// 'YYYY-MM' → 'September 2026' (or 'Sep 2026' with style 'short').
export const monthName = (m?: string | null, style: 'long' | 'short' = 'long') => monthYear(m, style);

// 'YYYY-MM' → 'Sep' (chart labels, "vs Aug").
export const monthOnly = (m?: string | null) => monthName(m, 'short').split(' ')[0] ?? '';

// Indian financial year (April–March), identified by its starting year — same as the server's fyStart.
// NaN for anything that isn't a YYYY-MM month (callers skip those rows).
export function fyOf(month: string) {
  if (typeof month !== 'string' || !MONTH_RE.test(month)) return NaN;
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m >= 4 ? y : y - 1;
}

// ── API guards (docs/DESIGN.md T11) ──────────────────────────────────────────
// A list from the API as a real array of objects — a missing list, an object or a null row never
// reaches .map / .filter.
export function rowsOf<T extends object>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v.filter((x): x is T => x != null && typeof x === 'object') : [];
}

// A money / count field as a finite number (0 when missing or malformed), so sums never turn into NaN.
export function amountOf(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// The same, but null when the field is missing — for "nothing to show yet" decisions.
export function amountOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
// Plain words (no "FY"): 'Financial year 2026-27', or just '2026-27' where space is tight.
export const fyShort = (fy: number) => `${fy}-${String(fy + 1).slice(2)}`;
export const fyLabel = (fy: number) => `Financial year ${fyShort(fy)}`;

// The next `count` months starting at `from` (YYYY-MM), for the advance "recovery starts" picker.
export function nextMonths(from: string, count: number) {
  const y = Number(from.slice(0, 4));
  const m = Number(from.slice(5, 7)) - 1;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

// Two YYYY-MM months as a short range: 'Apr – Sep 2026', 'Nov 2026 – Feb 2027', or one month
// ('Sep 2026'); '' when either is missing.
export function monthRange(first?: string | null, last?: string | null) {
  if (!first || !last) return '';
  if (first === last) return monthName(first, 'short');
  if (first.slice(0, 4) === last.slice(0, 4)) return `${monthOnly(first)} – ${monthName(last, 'short')}`;
  return `${monthName(first, 'short')} – ${monthName(last, 'short')}`;
}

// The month before a YYYY-MM month ('2026-01' → '2025-12').
export function prevMonth(ym: string) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// Payslips grouped by financial year, newest year first (the API already sorts months newest first).
export function groupByFy(slips: PayslipSummary[]) {
  const map = new Map<number, PayslipSummary[]>();
  for (const s of rowsOf(slips)) {
    const fy = fyOf(s.month);
    if (!Number.isFinite(fy)) continue;
    map.set(fy, [...(map.get(fy) ?? []), s]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([fy, items]) => ({ fy, items, net: items.reduce((t, s) => t + amountOf(s.net), 0) }));
}

// The app's one date style: 'Mon, 5 Oct', with the year only when it isn't this year. `today`
// (YYYY-MM-DD, from useTodayIst() during render) decides that, so render never reads the clock.

// A YYYY-MM-DD calendar date (anything after the date is ignored): 'Mon, 5 Oct' ('Sun, 5 Oct 2025'
// outside this year); '—' when it is not a real date.
export function ymdLabel(ymd: string | null | undefined, today: string) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return '—';
  return dateLabel(ymd.slice(0, 10), today);
}

// An ISO timestamp as its India-time calendar date, in the same style.
export const istDate = (iso: string | null | undefined, today: string) => dateLabel(iso, today);

// App-wide status words: Waiting, Approved, Rejected, Cancelled, Paid. A closed salary advance has
// been fully paid back, so it reads "Repaid".
const REQ_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: 'Waiting', tone: 'pending' },
  approved: { label: 'Approved', tone: 'done' },
  rejected: { label: 'Rejected', tone: 'failed' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  paid: { label: 'Paid', tone: 'info' },
  closed: { label: 'Repaid', tone: 'neutral' },
};
export const reqStatus = (s: unknown) =>
  (typeof s === 'string' ? REQ_STATUS[s] : undefined) ?? { label: (typeof s === 'string' && titleCase(s)) || 'Unknown', tone: 'neutral' as StatusTone };

// "1,23,456.50" → 123456.5. null unless it is a positive amount with at most 2 decimals — the
// server's rupeesToPaise refuses anything finer (hr_common.js).
export function parseRupees(s: string): number | null {
  const t = s.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : null;
}
export const toPaise = (rupees: number) => Math.round(rupees * 100);
