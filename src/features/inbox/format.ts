// How Inbox items read: list rows, status pills and the detail screen's fields, all in India time and
// in plain words (no "Regularization", "Keka Code" or "Pending" on screen). The data and the
// rules behind it are the web's: HR_REQ_STATUS / HR_APPROVAL_KINDS rows (dash.html ~4636, ~4784),
// hrMonthName, and for project claims reimbursementRef / reimbursementEvents (dash.html ~17196, ~33428).
//
// A row reads as one sentence: "Sneha Iyer · 27 – 28 Oct · Casual Leave · 2 days" (who, the fact that
// identifies it, what it is, and the figure on the right) — the fact first, so a narrow screen cuts
// the kind word, never the dates. The detail screen never says a thing twice: whatever its hero card
// shows (the figure, the dates, when it was sent) is not listed again underneath.
//
// Claim names match the rest of the app: "Expense claims" are the ones filed from Home / More
// (/reimbursements, approved by the project owner — `keka` here; their chip says "Project expense
// claims", since they reach you for projects you own); "Salary claims" are the older HR claims paid
// with salary (Pay uses the same name — `reimbursements` here).
//
// Formats are the app's one way: dates "Mon, 19 Oct" (the year only when it isn't this year), times
// "9:42 AM", money in list rows without paise (₹1,24,500) and with paise on the detail screen.
//
// EXTENSION POINT (Wave 0): domain plug-ins' items are the `PluginInboxItem` variant (kind 'plugin');
// they bring their own row and look, and are filtered by chipKeyOf(). Plug-ins may import the helpers
// here (ago, shortDay, rangeLabel, rowInr, dateTime…) — this file never imports a domain.

import type { LucideIcon } from 'lucide-react-native';

import type { HrKindKey, HrRequest, KekaHistoryEntry, KekaReimbursement, WaitingVisitor } from '@/api/inbox';
import type { PettyCashRequest } from '@/api/petty-cash';
import { dateLabel, dayLabel, hmLabel, istParts, monthYear, timeOf, todayIst } from '@/lib/dates';
import { days as daysText, inr, titleCase } from '@/lib/format';
import type { ModuleKey, StatusTone } from '@/theme/tokens';

// Server text, whatever an old cache or an odd row handed us: titleCase() calls string methods, so a
// number or an object there would throw during render.
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const title = (v: unknown) => titleCase(str(v));
// A lookup-table hit that a status like 'constructor' can't fake.
const has = (table: object, key: string) => Object.prototype.hasOwnProperty.call(table, key);

// ── What is waiting ──────────────────────────────────────────────────────────
/** Every kind of thing that can wait on someone: the HR approval kinds, project claims, petty cash, visitors. */
export type InboxKind = HrKindKey | 'keka' | 'petty' | 'visitors';

/** The chip label and the detail screen's title for each kind. */
export const KIND_COPY: Record<InboxKind, { chip: string; title: string }> = {
  visitors: { chip: 'Visitors', title: 'Visitor' },
  leave: { chip: 'Leave', title: 'Leave request' },
  wfh: { chip: 'Work from home', title: 'Work from home' },
  comp_off: { chip: 'Comp-off', title: 'Comp-off' },
  regularization: { chip: 'Attendance fix', title: 'Attendance fix' },
  reimbursements: { chip: 'Salary claims', title: 'Salary claim' },
  loans: { chip: 'Salary advance', title: 'Salary advance' },
  keka: { chip: 'Project expense claims', title: 'Expense claim' },
  petty: { chip: 'Petty cash', title: 'Petty cash' },
};

/** Chip order: people at reception first, then the everyday requests, then money. */
export const KIND_ORDER: InboxKind[] = ['visitors', 'leave', 'wfh', 'comp_off', 'regularization', 'reimbursements', 'loans', 'keka', 'petty'];

type ItemBase = {
  /** Unique across kinds (`<kind>:<id>`). */
  key: string;
  id: string;
  /** When it came in (ISO), for ordering and "2h ago". */
  at: string;
  /** The person asking (or the visitor). */
  who: string;
  /** The detail screen, where it is decided. */
  href: string;
};

/**
 * A domain plug-in's item (features/plugin-types InboxKindPlugin, collected by use-inbox): `kind` is
 * always 'plugin' and `plugin` is the plug-in's key, which is also its chip / filter key (chipKeyOf).
 * It carries its own look and row, so nothing here needs to know the domains.
 */
export type PluginInboxItem = ItemBase & {
  kind: 'plugin';
  plugin: string;
  record: unknown;
  look: { module: ModuleKey; icon: LucideIcon };
  /** False for notices (people at a desk): not a request to decide. */
  decides: boolean;
  /** Its own pinned group at the top of the list (like visitors "At reception"). */
  pin?: { key: string; label: string };
  row: (ctx: { today: string; now: number }) => RowModel;
};

/** One thing waiting on the signed-in person, with the server's own record. */
export type InboxItem =
  | (ItemBase & { kind: HrKindKey; record: HrRequest })
  | (ItemBase & { kind: 'keka'; record: KekaReimbursement })
  | (ItemBase & { kind: 'petty'; record: PettyCashRequest })
  | (ItemBase & { kind: 'visitors'; record: WaitingVisitor })
  | PluginInboxItem;

/** The key an item is filtered and counted by: its kind, or a plug-in's own key. */
export const chipKeyOf = (item: InboxItem): string => (item.kind === 'plugin' ? item.plugin : item.kind);

/** Built-in kinds (not plug-ins), for narrowing a chip key. */
export const isBuiltInKind = (key: string): key is InboxKind => Object.prototype.hasOwnProperty.call(KIND_COPY, key);

// ── Dates ────────────────────────────────────────────────────────────────────
const D_M: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const WD_D_M: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };

const yearOf = (ymd: string) => ymd.slice(0, 4);
// lib/dates dayLabel writes the app's one format from fixed month names: 'Sun, 19 Oct 2025'.
const withYearIf = (opts: Intl.DateTimeFormatOptions, yes: boolean): Intl.DateTimeFormatOptions => (yes ? { ...opts, year: 'numeric' } : opts);
/** 'Mon, 19 Oct', or 'Mon, 19 Oct 2025' with `withYear` (a valid 'YYYY-MM-DD' only). */
const weekdayDay = (ymd: string, withYear: boolean) => dayLabel(ymd, withYearIf(WD_D_M, withYear));
const dayMonth = (ymd: string, withYear: boolean) => dayLabel(ymd, withYearIf(D_M, withYear));
// Pass `today` (useTodayIst()) whenever a label is built during render: render must not read the
// clock, and a memoized argument-less call would keep last year's "this year" past New Year.
const isThisYear = (ymd: string, today?: string) => yearOf(ymd) === (today ?? todayIst()).slice(0, 4);
// A real calendar date: the pattern alone would let '2026-13-45' through, and Intl throws a
// RangeError ("Invalid time value") on the Date it makes — that would take the whole screen down.
const validYmd = (ymd?: string | null): ymd is string =>
  typeof ymd === 'string' && /^\d{4}-\d{2}-\d{2}/.test(ymd) && Number.isFinite(Date.parse(`${ymd.slice(0, 10)}T00:00:00+05:30`));
const instant = (iso?: string | null) => (typeof iso === 'string' && iso ? Date.parse(iso) : NaN);
const istDateOf = (iso?: string | null) => {
  const t = instant(iso);
  return Number.isFinite(t) ? istParts(new Date(t)).date : null;
};
/** A server timestamp as milliseconds, 0 when missing or malformed (for sorting). */
export const timeValue = (iso?: string | null) => {
  const t = instant(iso);
  return Number.isFinite(t) ? t : 0;
};
// The app's one clock format for a server timestamp: '9:42 AM' ('—' when missing or malformed).
export const safeTime = (iso?: string | null) => timeOf(iso);

// 'YYYY-MM-DD' → 'Mon, 12 Oct' ('Mon, 12 Oct 2025' outside this year) — the app's one date format.
export function shortDay(ymd?: string | null, today?: string) {
  if (!validYmd(ymd)) return '—';
  return weekdayDay(ymd.slice(0, 10), !isThisYear(ymd, today));
}

/** 'Mon, 19 Oct 2026' — always with the year, for documents that are kept (a printed expense report). */
export function dayWithYear(ymd?: string | null) {
  if (!validYmd(ymd)) return '';
  return weekdayDay(ymd.slice(0, 10), true);
}

// A date range as briefly as it reads: 'Mon, 12 Oct' · '12 – 14 Oct' · '28 Sep – 2 Oct'.
export function rangeLabel(from?: string | null, to?: string | null, today?: string) {
  if (!validYmd(from)) return '—';
  const a = from.slice(0, 10);
  const b = validYmd(to) ? to.slice(0, 10) : a;
  if (a === b) return weekdayDay(a, !isThisYear(a, today));
  const withYear = yearOf(a) !== yearOf(b) || !isThisYear(b, today);
  const end = dayMonth(b, withYear);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8, 10))} – ${end}`;
  return `${dayMonth(a, yearOf(a) !== yearOf(b))} – ${end}`;
}

// An ISO instant (or a 'YYYY-MM-DD' date) → 'Mon, 12 Oct' (IST calendar date).
export function shortDate(iso?: string | null, today?: string) {
  const d = istDateOf(iso);
  return d ? shortDay(d, today) : '—';
}

// An ISO instant → 'Mon, 12 Oct, 10:42 AM' (IST).
export function dateTime(iso?: string | null, today?: string) {
  const d = istDateOf(iso);
  if (!d || !iso) return '—';
  return `${shortDay(d, today)}, ${safeTime(iso)}`;
}

// For list rows: 'just now', '5m ago', '3h ago', '2d ago', then 'on 12 Oct'. Pass `now` from useNow()
// when calling during render (render must not read the clock, and the label then ticks every minute).
export function ago(iso?: string | null, now?: number) {
  const t = instant(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, ((now ?? Date.now()) - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  // "This year" is judged against the same `now`, never a fresh clock read.
  return `on ${shortDate(iso, now != null ? istParts(new Date(now)).date : undefined)}`;
}

// ── Day groups (the Inbox and Past decisions lists) ──────────────────────────
// The calendar day before a 'YYYY-MM-DD' ('' when it is not one). Pure date arithmetic on the given
// string, never a clock read.
const dayBefore = (ymd: string) => {
  const t = Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t - 86400000).toISOString().slice(0, 10) : '';
};

/** A list group's title: 'Today', 'Yesterday', else the app's one date format ('Mon, 12 Oct'). Pass `today` (useTodayIst()). */
export function dayGroupLabel(ymd: string, today: string) {
  if (!validYmd(ymd)) return 'Earlier';
  const day = ymd.slice(0, 10);
  if (day === today) return 'Today';
  if (day === dayBefore(today)) return 'Yesterday';
  return dateLabel(day, today);
}

export type DayGroup<T> = { key: string; label: string; items: T[] };

/**
 * Splits a list that is already in display order into day groups (India calendar day of `when`),
 * keeping that order: groups come in the order their first item does. `pin` puts an item in a fixed
 * group of its own instead (visitors at reception); items without a usable time go under 'Earlier'.
 */
export function groupByDay<T>(
  items: readonly T[],
  when: (item: T) => string | null | undefined,
  today: string,
  pin?: (item: T) => { key: string; label: string } | null,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  const byKey = new Map<string, DayGroup<T>>();
  for (const item of Array.isArray(items) ? items : []) {
    const fixed = pin?.(item) ?? null;
    const day = fixed ? null : istDateOf(when(item));
    const key = fixed ? `pin:${fixed.key}` : (day ?? 'undated');
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: fixed ? fixed.label : day ? dayGroupLabel(day, today) : 'Earlier', items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/**
 * The last `n` India calendar days up to and including `today`, oldest first ('YYYY-MM-DD'), for the
 * Inbox summary's 7-day sparklines. Pure date arithmetic on the given string, never a clock read.
 */
export function lastDays(today: string, n: number): string[] {
  const out: string[] = [];
  let day = validYmd(today) ? today.slice(0, 10) : '';
  for (let i = 0; i < n && day; i++) {
    out.unshift(day);
    day = dayBefore(day);
  }
  return out;
}

/** The India calendar day ('YYYY-MM-DD') of a server timestamp, '' when missing or malformed. */
export const istDay = (iso?: string | null) => istDateOf(iso) ?? '';

// 'HH:MM' (24-hour IST wall clock, as attendance fixes store it) → '9:30 AM'.
export const hm12 = (hm?: string | null) => hmLabel(hm);

// 'YYYY-MM' → 'October 2026' (the web's hrMonthName) or 'Oct 2026'.
export const monthLabel = (ym?: string | null, month: 'long' | 'short' = 'long') => monthYear(ym, month);

// ── HR statuses (HR_REQ_STATUS) ──────────────────────────────────────────────
const HR_STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  paid: 'Paid',
  // Only salary advances close: the last instalment has come out of salary.
  closed: 'Paid back',
};
const HR_STATUS_TONE: Record<string, StatusTone> = {
  pending: 'pending',
  approved: 'done',
  paid: 'done',
  rejected: 'failed',
  cancelled: 'neutral',
  closed: 'neutral',
};
export const hrStatusLabel = (s: string) => (typeof s === 'string' && has(HR_STATUS_LABEL, s) ? HR_STATUS_LABEL[s]! : title(s) || '—');
export const hrStatusTone = (s: string): StatusTone => (typeof s === 'string' && has(HR_STATUS_TONE, s) ? HR_STATUS_TONE[s]! : 'neutral');

const HALF_DAY: Record<string, string> = { first: 'First half', second: 'Second half' };

// ── Leave type names ─────────────────────────────────────────────────────────
/** Leave type names by code ('CL' → 'Casual Leave'), from useLeaveNames() (features/inbox/leave-names). */
export type LeaveNames = ReadonlyMap<string, string>;

/**
 * 'Casual Leave' when the type's name is known, else plain 'Leave' — a bare code ('CL', 'LOP') is
 * not a word. The names come from what the Leave screens already loaded (useLeaveNames). `withCode`
 * ('Leave (CL)') is kept for callers that want it; the Inbox never passes it.
 */
export function leaveTypeLabel(code?: string | null, names?: LeaveNames, withCode = false) {
  const c = str(code).trim();
  const name = c ? names?.get(c) : undefined;
  if (name) return /leave/i.test(name) ? name : `${name} leave`;
  return withCode && c ? `Leave (${c})` : 'Leave';
}

// ── List rows ────────────────────────────────────────────────────────────────
// Money in a list row's one-line right column, without paise ('₹1,50,000' fits at 1.3x on a 360 dp
// phone, '₹1,50,000.00' doesn't). The detail screen shows the exact amount, paise included.
export const rowInr = (n?: number | string | null) => inr(n, { decimals: false });

/** One list row: who, what (plain words), a one-line note, the figure on the right and how long ago. */
export type RowModel = { title: string; subtitle: string; meta?: string; value?: string; age?: string };

// One row per request — the same facts as the web table (HR_APPROVAL_KINDS[].row): who, then
// "when · what" (the identifying fact first, the short kind word after it, so a mixed list still
// reads on its own), the figure on the right and the employee's reason underneath. A half day needs
// no marker of its own: the figure says "0.5 days". Pass `today` (useTodayIst()) when calling during
// render, and `names` (useLeaveNames()) so a leave row says "Casual Leave" when the name is known.
export function hrRow(kind: HrKindKey, r: HrRequest, today?: string, names?: LeaveNames): RowModel {
  const who = str(r.employee_name) || 'Employee';
  const reason = str(r.reason) || undefined;
  switch (kind) {
    case 'regularization':
      return { title: who, subtitle: `${shortDay(r.work_date, today)} · Attendance fix`, meta: reason };
    case 'leave':
      return {
        title: who,
        subtitle: `${rangeLabel(r.from_date, r.to_date, today)} · ${leaveTypeLabel(r.leave_code, names)}`,
        meta: reason,
        value: daysText(r.days),
      };
    case 'wfh':
      return { title: who, subtitle: `${rangeLabel(r.from_date, r.to_date, today)} · Work from home`, meta: reason, value: daysText(r.days) };
    case 'comp_off':
      return { title: who, subtitle: `Worked ${shortDay(r.from_date, today)} · Comp-off`, meta: reason, value: `+${daysText(r.days)}` };
    case 'reimbursements':
      return { title: who, subtitle: `${title(r.category) || 'Other'} · Salary claim`, meta: str(r.description) || undefined, value: rowInr(r.amount) };
    case 'loans':
      return { title: who, subtitle: `${rowInr(r.emi)} a month · Salary advance`, meta: reason, value: rowInr(r.principal) };
  }
}

// Under a decided row: who decided and what they said (the web's "decided_by_name — decision_note").
// The server stamps decided_by only on approve / reject, so a claim since paid or an advance since paid
// back says "Approved by …" — never "By …" next to a "Paid" pill, which would read as who paid it.
export function decidedLine(r: { status?: string; decided_by_name?: string | null; decision_note?: string }) {
  const by = str(r.decided_by_name);
  const who = by ? (r.status === 'paid' || r.status === 'closed' ? `Approved by ${by}` : `By ${by}`) : '';
  return [who, str(r.decision_note)].filter(Boolean).join(' — ');
}

/** The row for anything in the Inbox list. Pass `today` (useTodayIst()), `now` (useNow()) and `names` (useLeaveNames()). */
export function itemRow(item: InboxItem, today: string, now: number, names?: LeaveNames): RowModel {
  switch (item.kind) {
    case 'keka':
      return kekaRow(item.record, now);
    case 'petty': {
      const r = item.record;
      const raisedBy = r.onBehalf ? str(r.requestedByName) : '';
      return {
        title: item.who,
        // The readable project name first; the code only when there is no name.
        subtitle: `${str(r.projectName) || str(r.kekaCode) || '—'} · Petty cash`,
        meta: str(r.remarks) || (raisedBy ? `Raised by ${raisedBy}` : undefined),
        value: rowInr(r.amount),
        age: ago(r.createdAt, now),
      };
    }
    case 'visitors': {
      const v = item.record;
      return {
        title: item.who,
        subtitle: `Visitor · ${str(v.purpose) || 'Here to see you'}`,
        meta: v.status === 'no_response' ? 'No answer yet. You can still decide.' : undefined,
        age: ago(v.createdAt, now),
      };
    }
    case 'plugin': {
      // A plug-in's own words; a broken one still shows who and when instead of taking the list down.
      let m: RowModel;
      try {
        m = item.row({ today, now });
      } catch {
        m = { title: item.who, subtitle: '' };
      }
      return { ...m, title: str(m?.title) || item.who, subtitle: str(m?.subtitle), age: m?.age ?? ago(item.at, now) };
    }
    default:
      return { ...hrRow(item.kind, item.record, today, names), age: ago(item.record.created_at, now) };
  }
}

/** The hero's "when" line: 'Sent just now', 'Sent 3h ago', 'Sent on 12 Oct'. Pass `now` (useNow()). */
export function sentLine(iso?: string | null, now?: number) {
  const when = ago(iso, now);
  return when ? `Sent ${when}` : '';
}

// ── Detail screen ────────────────────────────────────────────────────────────
export type Field = { label: string; value?: string | null; hint?: string; tone?: 'danger' | 'muted' };
export type HrDetail = {
  noun: string; // 'Leave request'
  value: string; // the big number on the hero card
  amount?: number; // set when the big number is money — the hero then draws it as an Amount
  figure?: number; // set when it is a plain count (leave / WFH days) — the hero then draws it as a Metric
  unit?: string;
  caption: string;
  fields: Field[];
  note?: { label: string; text: string }; // the employee's own words
};

const finite = (n: unknown) => {
  const v = Number(n);
  return n != null && n !== '' && Number.isFinite(v) ? v : undefined;
};
const num = (n?: number | null) => (n == null || !Number.isFinite(Number(n)) ? '—' : String(Number(n)));
const dayUnit = (n?: number | null) => (Number(n) === 1 ? 'day' : 'days');

// The hero carries the figure, the dates and (in its overline, sentLine()) when it was sent, so the
// fields only hold what it doesn't — often nothing, and the details card is then left out. Pass
// `today` (useTodayIst()) when calling during render, and `names` (useLeaveNames()).
export function hrDetail(kind: HrKindKey, r: HrRequest, today?: string, names?: LeaveNames): HrDetail {
  const reason = str(r.reason) ? { label: 'Reason', text: str(r.reason) } : undefined;
  switch (kind) {
    case 'regularization': {
      const prev = r.previous && typeof r.previous === 'object' ? r.previous : null;
      return {
        noun: 'Attendance fix',
        // 'Mon, 12 Oct' already names the weekday, so there is no caption under it.
        value: shortDay(r.work_date, today),
        caption: '',
        // The new times, then what was recorded before, so the two read as a before / after.
        fields: [
          { label: 'Clock in', value: r.in_time ? hm12(r.in_time) : 'No change' },
          { label: 'Clock out', value: r.out_time ? hm12(r.out_time) : 'No change' },
          ...(prev
            ? [
                {
                  label: 'Before the fix',
                  value: prev.in_at ? `${safeTime(prev.in_at)} – ${prev.out_at ? safeTime(prev.out_at) : 'no clock out'}` : 'Nothing recorded',
                  tone: 'muted' as const,
                },
              ]
            : []),
        ],
        note: reason,
      };
    }
    case 'leave': {
      const half = typeof r.half_day === 'string' && has(HALF_DAY, r.half_day) ? HALF_DAY[r.half_day] : undefined;
      // The server sends the balance before this request; the approver wants what is left after it,
      // so nobody has to subtract. Display only: the server re-checks a paid type's balance on approve.
      const before = finite(r.balance_available);
      const asked = finite(r.days);
      const after = before != null && asked != null ? Math.round((before - asked) * 100) / 100 : undefined;
      return {
        noun: 'Leave request',
        value: num(r.days),
        figure: finite(r.days),
        unit: dayUnit(r.days),
        // An unknown type reads 'Leave', never a bare code: 'Leave · 27 – 28 Oct'.
        caption: `${leaveTypeLabel(r.leave_code, names)} · ${rangeLabel(r.from_date, r.to_date, today)}`,
        fields: [
          ...(half ? [{ label: 'Half day', value: half }] : []),
          ...(after != null
            ? [{ label: 'Left after this', value: after < 0 ? `${daysText(-after)} short` : daysText(after), tone: after < 0 ? ('danger' as const) : undefined }]
            : []),
        ],
        note: reason,
      };
    }
    case 'wfh':
      return {
        noun: 'Work from home',
        value: num(r.days),
        figure: finite(r.days),
        unit: dayUnit(r.days),
        caption: rangeLabel(r.from_date, r.to_date, today),
        fields: [],
        note: reason,
      };
    case 'comp_off':
      return {
        noun: 'Comp-off',
        value: `+${num(r.days)}`,
        unit: dayUnit(r.days),
        caption: `A day off for working on ${shortDay(r.from_date, today)}`,
        fields: [],
        note: reason,
      };
    case 'reimbursements':
      return {
        noun: 'Salary claim',
        value: inr(r.amount),
        amount: finite(r.amount),
        caption: `${title(r.category) || 'Other'} · spent ${shortDay(r.claim_date, today)}`,
        fields: [
          ...(str(r.receipt_ref) ? [{ label: 'Bill number', value: str(r.receipt_ref) }] : []),
          ...(r.paid_at ? [{ label: 'Paid', value: dateTime(r.paid_at, today) }] : []),
        ],
        note: str(r.description) ? { label: 'What for', text: str(r.description) } : undefined,
      };
    case 'loans': {
      const p = Number(r.principal);
      const e = Number(r.emi);
      const months = p > 0 && e > 0 ? Math.ceil(p / e) : null;
      return {
        noun: 'Salary advance',
        value: inr(r.principal),
        amount: finite(r.principal),
        caption: `${inr(r.emi)} a month from ${monthLabel(r.start_month)}`,
        fields: [
          ...(months ? [{ label: 'Paid back in', value: `${months} ${months === 1 ? 'month' : 'months'}` }] : []),
          ...(r.status === 'approved' || r.status === 'closed'
            ? [
                { label: 'Paid back so far', value: inr(r.recovered) },
                { label: 'Still owed', value: inr(r.outstanding) },
              ]
            : []),
        ],
        note: reason,
      };
    }
  }
}

// ── Project claims (reimbursements against a project code I own) ─────────────
const PURPOSE_LABEL: Record<string, string> = { food: 'Food', fuel: 'Fuel', accommodation: 'Accommodation', transportation: 'Transportation' };
export const purposeLabel = (p?: string | null) => (typeof p === 'string' && has(PURPOSE_LABEL, p) ? PURPOSE_LABEL[p] : title(p)) || '—';

// 'rmb' + epoch ms + 6 hex → RMB-20261012-A1B2C3, exactly as the web derives it.
export function reimbursementRef(r: { id?: string }) {
  if (!r?.id) return '—';
  const id = String(r.id);
  const m = /^rmb(\d{13})([0-9a-f]{6})$/i.exec(id);
  if (!m) return id.toUpperCase();
  return `RMB-${new Date(Number(m[1])).toISOString().slice(0, 10).replace(/-/g, '')}-${m[2]!.toUpperCase()}`;
}

export function kekaStatus(r: KekaReimbursement): { label: string; tone: StatusTone } {
  switch (r.status) {
    case 'pending_keka_approval':
      return { label: 'Waiting', tone: 'pending' };
    case 'pending_accounts_approval':
      return { label: 'With Accounts', tone: 'info' };
    case 'ready_for_payment':
      return { label: 'Approved', tone: 'info' };
    case 'payment_processing':
      return { label: 'Being paid', tone: 'info' };
    case 'received':
      return { label: 'Paid', tone: 'done' };
    case 'not_received':
      return { label: 'Not received', tone: 'pending' };
    case 'rejected':
      // The same short word as Expense claims' pill; who rejected it is in the history.
      return { label: 'Rejected', tone: 'failed' };
    default:
      return { label: title(r.status) || '—', tone: 'neutral' };
  }
}

// The claim's history entries, whatever the server (or an old persisted cache) handed us.
const historyOf = (r: KekaReimbursement) =>
  (Array.isArray(r.history) ? r.history : []).filter((h): h is KekaHistoryEntry => !!h && typeof h === 'object');

export const lastReupload = (r: KekaReimbursement) => [...historyOf(r)].reverse().find((h) => h.event === 'reuploaded') ?? null;

/** When the project owner's step was decided (approved, rejected or skipped) — Past decisions' "when". */
export function kekaDecidedAt(r: KekaReimbursement) {
  const last = [...historyOf(r)].reverse().find((h) => h.event === 'keka_approved' || h.event === 'keka_rejected' || h.event === 'keka_skipped');
  return str(last?.at) || str(r.keka_approved_at) || str(r.created_at);
}

// "Food · Expense claim": what it was for, then the kind — the same "fact · kind" as every other row
// (the chip and the detail title say "Expense claim" too). `meta` is the re-upload note when there
// is one, otherwise the project (its name, or its code when it has no name); `age` is when it was
// submitted ('2d ago').
export function kekaRow(r: KekaReimbursement, now?: number): RowModel {
  const re = lastReupload(r);
  const purpose = purposeLabel(r.purpose);
  return {
    title: str(r.employee_name) || 'Employee',
    subtitle: `${purpose === '—' ? 'Other' : purpose} · Expense claim`,
    meta: re ? `Amount changed · was ${rowInr(re.previousAmount)}` : str(r.project_name) || str(r.keka_code) || undefined,
    value: rowInr(r.amount),
    age: ago(r.created_at, now),
  };
}

// The timeline, oldest first, ending with what it is waiting on (reimbursementEvents). Pass the
// viewer's `userId` so a claim waiting on them says "Waiting for you to approve", not their own name.
export type TimelineEvent = { key: string; label: string; at?: string; by?: string; note?: string; detail?: string; tone: 'neutral' | 'good' | 'bad' | 'info' | 'wait' };

export function kekaEvents(r: KekaReimbursement, userId?: string): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  historyOf(r).forEach((h, i) => {
    const base = { key: String(i), at: h.at, by: h.byName, note: h.note };
    switch (h.event) {
      case 'submitted':
        out.push({ ...base, label: 'Sent', tone: 'neutral', detail: `${inr(h.amount ?? r.amount)} · ${purposeLabel(r.purpose)}` });
        break;
      case 'keka_skipped':
        out.push({ ...base, label: 'Project owner step skipped', tone: 'neutral' });
        break;
      case 'keka_approved':
        out.push({ ...base, label: 'Approved by the project owner', tone: 'good' });
        break;
      case 'keka_rejected':
        out.push({ ...base, label: 'Rejected by the project owner', tone: 'bad' });
        break;
      case 'reuploaded':
        out.push({ ...base, label: 'Amount changed', tone: 'neutral', detail: `${inr(h.previousAmount)} → ${inr(h.amount)}` });
        break;
      case 'authorized':
        out.push({ ...base, label: 'Approved by Accounts', tone: 'good' });
        break;
      case 'accounts_rejected':
        out.push({ ...base, label: 'Rejected by Accounts', tone: 'bad' });
        break;
      default:
        if (h.status === 'ready_for_payment') break;
        if (h.status === 'payment_processing')
          out.push({ ...base, label: h.followUp ? 'Payment sent again' : 'Payment sent', tone: 'info', detail: str(h.reference) ? `Reference ${str(h.reference)}` : undefined });
        else if (h.status === 'received') out.push({ ...base, label: 'Money received', tone: 'good' });
        else if (h.status === 'not_received') out.push({ ...base, label: 'Money not received', tone: 'bad' });
        else out.push({ ...base, label: title(h.status || h.event) || 'Updated', tone: 'neutral' });
    }
  });
  const mine = !!userId && str(r.keka_owner_user_id) === userId;
  const waits: Record<string, string> = {
    pending_keka_approval: mine ? 'Waiting for you to approve' : `Waiting for ${str(r.keka_owner_name) || 'the project owner'} to approve`,
    pending_accounts_approval: 'Waiting for Accounts to approve',
    ready_for_payment: 'Waiting for Accounts to pay',
    payment_processing: `Waiting for ${str(r.employee_name) || 'the employee'} to confirm they got the money`,
    not_received: 'Accounts is following up on the payment',
  };
  const wait = typeof r.status === 'string' && has(waits, r.status) ? waits[r.status] : undefined;
  if (wait) out.push({ key: 'waiting', label: wait, tone: 'wait' });
  return out;
}

// ── Petty cash ───────────────────────────────────────────────────────────────
// Where a petty cash request stands, in the Inbox's status words (the Petty cash screen keeps its own).
export function pettyStatus(r: Pick<PettyCashRequest, 'status'>): { label: string; tone: StatusTone } {
  switch (r.status) {
    case 'pending_approval':
      return { label: 'Waiting', tone: 'pending' };
    case 'pending_confirmation':
      return { label: 'Not confirmed yet', tone: 'pending' };
    case 'pending_accounts_approval':
      return { label: 'With Accounts', tone: 'info' };
    case 'ready_for_payment':
    case 'approved':
      return { label: 'Approved', tone: 'info' };
    case 'payment_processing':
    case 'paid':
      return { label: 'Being paid', tone: 'info' };
    case 'received':
      return { label: 'Paid', tone: 'done' };
    case 'not_received':
      return { label: 'Not received', tone: 'pending' };
    case 'rejected':
      return { label: 'Rejected', tone: 'failed' };
    default:
      return { label: title(r.status) || '—', tone: 'neutral' };
  }
}

// ── Visitors ─────────────────────────────────────────────────────────────────
// 'Arrived 10:42 AM' ('Arrived Mon, 12 Oct, 10:42 AM' on an earlier day), plus ' · no answer yet' once the
// visit has timed out waiting — the only no-answer cue Home's "Needs you" row has. Pass
// `{ noAnswer: false }` where a status pill already says it (the Inbox detail hero). Pass `today`
// (useTodayIst()) when calling during render.
export function visitorArrived(
  v: Pick<WaitingVisitor, 'createdAt'> & { status?: string | null },
  today?: string,
  { noAnswer = true }: { noAnswer?: boolean } = {},
) {
  const day = istDateOf(v.createdAt);
  const when = day && day !== (today ?? todayIst()) ? `${shortDay(day, today)}, ${safeTime(v.createdAt)}` : safeTime(v.createdAt);
  return `Arrived ${when}${noAnswer && v.status === 'no_response' ? ' · no answer yet' : ''}`;
}
