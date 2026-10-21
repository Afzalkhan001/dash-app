// Words and small pure helpers for the company screens (plain words, docs/DESIGN.md §0B–0C).

import type { GrantListKey, SubRange } from '@/api/company';
import { dateLabel } from '@/lib/dates';
import { addDaysYmd, financialYear } from '@/lib/ist';
import { ROLE_LABEL } from '@/lib/access';
import type { StatusTone } from '@/theme/tokens';

export const roleLabel = (r?: string | null) => (r ? (ROLE_LABEL[r] ?? r.replace(/_/g, ' ')) : '—');

export const ALL_BRANCHES = 'ALL_BRANCHES';
export const branchLabel = (b?: string | null) => (!b || b === ALL_BRANCHES ? 'All branches' : b);

// ── "Who can…" lists (Config grant cards, dash.html:3141–3420, :11817) ────────
export type GrantListMeta = {
  key: GrantListKey;
  /** Route segment: /admin/company/settings/access/<slug>. */
  slug: string;
  title: string;
  /** The row on Company settings. */
  rowLabel: string;
  intro: string;
  always: string;
  empty: string;
  /** audit / subscriptions store userId too (and audit its four permissions). */
  withUserId: boolean;
};

export const GRANT_LISTS: GrantListMeta[] = [
  {
    key: 'announcementCreators',
    slug: 'news',
    title: 'Who can post news',
    rowLabel: 'Post news',
    intro: 'People on this list can post news, whatever their role.',
    always: 'HR, IT Admin, Super Admin, CEO and COO can always post.',
    empty: 'No one added yet.',
    withUserId: false,
  },
  {
    key: 'bountyCreators',
    slug: 'bounty',
    title: 'Who can create bounty tasks',
    rowLabel: 'Create bounty tasks',
    intro: 'People on this list can create bounty tasks, whatever their role.',
    always: 'Super Admin, CEO and COO can always create them.',
    empty: 'No one added yet.',
    withUserId: false,
  },
  {
    key: 'projectCreators',
    slug: 'projects',
    title: 'Who can create projects',
    rowLabel: 'Create projects',
    intro: 'People on this list can add and update projects. They get Projects in their own menu.',
    always: 'Anyone added here gets Projects, whatever their role.',
    empty: 'No one added yet.',
    withUserId: false,
  },
  {
    key: 'auditAccess',
    slug: 'audit',
    title: 'Who can open the activity audit',
    rowLabel: 'Open the activity audit',
    intro: 'People on this list can see what others did in DASH. Choose what each person may do.',
    always: 'The Super Admin always has full access. Changes apply straight away.',
    empty: 'No one added yet.',
    withUserId: true,
  },
  {
    key: 'subscriptionAccess',
    slug: 'subscriptions',
    title: 'Who can see subscriptions',
    rowLabel: 'See subscriptions',
    intro: 'People on this list can read the subscriptions tracker and share it. They can’t change it.',
    always: 'IT Admin, Super Admin, CEO and COO can always see and change it.',
    empty: 'No one outside those roles yet.',
    withUserId: true,
  },
];

export const grantListBySlug = (slug?: string | null) => GRANT_LISTS.find((g) => g.slug === slug) ?? null;

export const AUDIT_PERMISSIONS: { key: 'viewLogs' | 'searchUsers' | 'viewDetail' | 'downloadReports'; label: string; hint: string }[] = [
  { key: 'viewLogs', label: 'See the activity list', hint: 'Who did what, and when' },
  { key: 'searchUsers', label: 'Find a person', hint: 'Search someone’s history' },
  { key: 'viewDetail', label: 'Open an activity', hint: 'Before and after details' },
  { key: 'downloadReports', label: 'Share the list', hint: 'As a CSV file' },
];
export const DEFAULT_AUDIT_PERMS = { viewLogs: true, searchUsers: true, viewDetail: true, downloadReports: false };

// ── Activity audit (dash.html AUDIT_TABS :14955, auditActionClass :14971) ──────
export const AUDIT_TABS: { key: string; label: string; type: string }[] = [
  { key: 'all', label: 'All', type: '' },
  { key: 'bookings', label: 'Bookings', type: 'booking' },
  { key: 'service_requests', label: 'Service requests', type: 'service_request' },
  { key: 'profile', label: 'Profile', type: 'profile' },
  { key: 'tasks', label: 'Tasks', type: 'task' },
  { key: 'approvals', label: 'Approvals', type: 'approval' },
  { key: 'reports', label: 'Reports', type: 'report' },
  { key: 'configuration', label: 'Settings', type: 'configuration' },
  { key: 'other', label: 'Other', type: 'other' },
];

const ACTION_WORDS: Record<string, string> = {
  created: 'Added',
  updated: 'Changed',
  deleted: 'Deleted',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  downloaded: 'Downloaded',
  login: 'Signed in',
  permission_granted: 'Access given',
  permission_revoked: 'Access removed',
  configuration: 'Settings',
  pending: 'Waiting',
};
export const AUDIT_ACTIONS = ['created', 'updated', 'deleted', 'approved', 'rejected', 'cancelled', 'downloaded', 'login', 'permission_granted', 'permission_revoked', 'configuration'];

export const actionLabel = (a?: string | null) => (a ? (ACTION_WORDS[a] ?? a.replace(/_/g, ' ')) : '—');

/** auditActionClass: green for creation / approval, red for removal, amber for cancelled, neutral otherwise. */
export function actionTone(a?: string | null): StatusTone {
  if (a && ['approved', 'created', 'permission_granted', 'login'].includes(a)) return 'done';
  if (a && ['rejected', 'deleted', 'permission_revoked'].includes(a)) return 'failed';
  if (a && ['cancelled', 'pending'].includes(a)) return 'pending';
  return 'neutral';
}

export const auditTypeLabel = (t?: string | null) => AUDIT_TABS.find((x) => x.type === t)?.label ?? (t ? t.replace(/_/g, ' ') : '—');

/** An audit before/after value as one short line. */
export function auditValue(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (typeof v === 'object') {
    try {
      const t = JSON.stringify(v);
      return t.length > 120 ? `${t.slice(0, 117)}…` : t;
    } catch {
      return '—';
    }
  }
  const t = String(v);
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

const camel = (k: string) =>
  k
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bKeka code\b/i, 'Project code');

/** Keys whose value differs first, then the rest of the after (or before) record. */
export function auditChanges(prev: unknown, next: unknown) {
  const a = prev && typeof prev === 'object' && !Array.isArray(prev) ? (prev as Record<string, unknown>) : {};
  const b = next && typeof next === 'object' && !Array.isArray(next) ? (next as Record<string, unknown>) : {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !['password', 'avatar', 'bankAccountNumber', 'bankIfscCode'].includes(k));
  const same = (k: string) => JSON.stringify(a[k]) === JSON.stringify(b[k]);
  const changed = keys.filter((k) => !same(k));
  return changed.map((k) => ({ key: k, label: camel(k), before: k in a ? auditValue(a[k]) : '—', after: k in b ? auditValue(b[k]) : '—' }));
}

// ── Subscriptions (SUB_STATUS_META :11189, renewalTone :11208, currentFyRange :11200) ──
export const SUB_PERIODS: { value: string; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'half_yearly', label: 'Every 6 months' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one_time', label: 'One time' },
];
export const periodLabel = (p?: string | null) => SUB_PERIODS.find((x) => x.value === p)?.label ?? 'Monthly';

export const SUB_STATUSES: { value: string; label: string; tone: StatusTone }[] = [
  { value: 'active', label: 'Active', tone: 'done' },
  { value: 'not_using', label: 'Not in use', tone: 'pending' },
  { value: 'cancelled', label: 'Cancelled', tone: 'neutral' },
];
export const subStatus = (st?: string | null) => SUB_STATUSES.find((x) => x.value === st) ?? SUB_STATUSES[0]!;

/** Renewal urgency: overdue (red), within 7 days, within 30 days; nothing further out. */
export function renewalTone(days: number | null | undefined): { label: string; tone: StatusTone } | null {
  if (days === null || days === undefined || !Number.isFinite(days)) return null;
  if (days < 0) return { label: days === -1 ? 'Overdue by 1 day' : `Overdue by ${-days} days`, tone: 'failed' };
  if (days === 0) return { label: 'Renews today', tone: 'failed' };
  if (days <= 30) return { label: days === 1 ? 'Renews tomorrow' : `Renews in ${days} days`, tone: 'pending' };
  return null;
}

export type RangeKey = 'fy' | 'month' | 'all' | 'custom';

/** The website's presets, in India time: this financial year to date, this month, all time. */
export function rangeFor(key: Exclude<RangeKey, 'custom'>, today: string): SubRange {
  if (key === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  if (key === 'all') return { from: '2000-01-01', to: today };
  return { from: financialYear(today).from, to: today };
}

export function rangeLabel(key: RangeKey, range: SubRange, today: string) {
  if (key === 'fy') return `Financial year ${financialYear(today).label}`;
  if (key === 'month') return 'This month';
  if (key === 'all') return 'All time';
  return `${dateLabel(range.from, today)} – ${dateLabel(range.to, today)}`;
}

/** Audit date presets (dash.html setPreset), in India time. */
export function auditPreset(key: 'today' | 'yesterday' | '7d' | '30d', today: string) {
  if (key === 'today') return { dateFrom: today, dateTo: today };
  if (key === 'yesterday') {
    const y = addDaysYmd(today, -1);
    return { dateFrom: y, dateTo: y };
  }
  if (key === '7d') return { dateFrom: addDaysYmd(today, -6), dateTo: today };
  return { dateFrom: addDaysYmd(today, -29), dateTo: today };
}

// ── HR modules, in plain words (hr.js HR_MODULES :50) ────────────────────────
const HR_MODULE_WORDS: Record<string, string> = {
  attendance: 'Clock in and attendance',
  regularization: 'Fix attendance',
  shifts: 'Shifts',
  holidays: 'Holidays',
  leave: 'Leave',
  wfh: 'Work from home',
  comp_off: 'Comp-off',
  policies: 'Policies',
  salary: 'Salary',
  payroll: 'Payroll',
  tax: 'Income tax (TDS) and PF',
  payslips: 'Payslips',
  reimbursements: 'Expense claims and salary advance',
};
export const hrModuleLabel = (id: string, fallback?: string) => HR_MODULE_WORDS[id] ?? fallback ?? id;
