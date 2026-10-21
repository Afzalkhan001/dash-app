// Labels for Support requests — categories, ticket types, statuses and the visible reference number
// (web: SupportView ~L29187, refNo ~L1793, SB ~L956). India time throughout. Every formatter tolerates
// missing or oddly-typed fields (Intl throws on an invalid date, which would crash a render).

import { ClipboardList, type LucideIcon, MessageSquareWarning, Package, Ticket as TicketIcon } from 'lucide-react-native';

import type { Ticket } from '@/api/support';
import { dateLabel, stampLabel } from '@/features/visitors/format';
import type { StatusTone } from '@/theme/tokens';

// Values are what the server stores; labels are sentence case for the phone.
export const TICKET_TYPES = [
  { value: 'technical', label: 'Technical issue' },
  { value: 'hardware', label: 'Hardware problem' },
  { value: 'software', label: 'Software request' },
  { value: 'access', label: 'Access & permissions' },
  { value: 'other', label: 'Other' },
];
export const PRIORITIES = ['low', 'medium', 'high', 'critical'].map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }));
export const ASSET_TYPES = ['Laptop', 'Monitor', 'Keyboard', 'Mouse', 'Headset', 'Camera', 'Microphone', 'Hard Drive', 'USB Hub', 'Other'].map((a) => ({ value: a, label: a }));
export const URGENCIES = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent' },
];

// Plain names and line icons for the four kinds of request (category keys are the server's). Their
// colour is the Support module's (ModuleBadge / SelectTiles), read at render time — never stored here,
// so a light / dark switch can't leave a stale colour behind.
export const CATEGORY: Record<string, { label: string; short: string; icon: LucideIcon }> = {
  ticket: { label: 'IT help', short: 'IT help', icon: TicketIcon },
  asset: { label: 'Equipment', short: 'Equipment', icon: Package },
  admin_request: { label: 'Office request', short: 'Office', icon: ClipboardList },
  complaint: { label: 'Complaint', short: 'Complaint', icon: MessageSquareWarning },
};
export const categoryOf = (t: Pick<Ticket, 'category'>) => CATEGORY[t.category || ''] ?? { label: 'Request', short: 'Request', icon: TicketIcon };

const ticketTypeLabel = (v?: string) => TICKET_TYPES.find((x) => x.value === v)?.label || v || '—';

// The "Type" column of the web's History table.
export function typeLabel(t: Ticket) {
  if (t.category === 'ticket') return ticketTypeLabel(t.type);
  if (t.category === 'asset') return t.assetType || '—';
  if (t.category === 'admin_request') return t.itemType || '—';
  return t.type || '—';
}

// The "Subject / Item" column.
export function subjectLabel(t: Ticket) {
  if (t.category === 'asset') return `${t.quantity ?? 1}x ${t.assetType || ''}`.trim();
  if (t.category === 'admin_request') return `${t.quantity ?? 1}x ${t.itemType || ''}`.trim();
  return t.subject || '—';
}

const cap = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  return s ? s[0]!.toUpperCase() + s.slice(1) : '';
};

// The "Priority / Urgency" column.
export function priorityLabel(t: Ticket) {
  const v = t.category === 'ticket' ? t.priority : t.category === 'asset' || t.category === 'admin_request' ? t.urgency : '';
  return cap(v);
}

const STATUS_TONE: Record<string, StatusTone> = {
  open: 'info',
  pending_approval: 'pending',
  in_progress: 'info',
  resolved: 'done',
  closed: 'done',
  rejected: 'failed',
  cancelled: 'neutral',
};
// Plain words: never "Pending" on screen (an unexpected bare 'pending' reads "Waiting" too).
const STATUS_LABEL: Record<string, string> = { pending_approval: 'Waiting for approval', pending: 'Waiting' };
export function ticketStatus(s?: string): { label: string; tone: StatusTone } {
  const label = STATUS_LABEL[s || ''] || cap(String(s || '—').replace(/_/g, ' ')) || '—';
  return { label, tone: STATUS_TONE[s || ''] ?? 'pending' };
}

// History filter buckets (the web's HIST_OPEN_STATUSES / HIST_CLOSED_STATUSES).
export const OPEN_STATUSES = ['open', 'pending_approval', 'in_progress'];
export const CLOSED_STATUSES = ['resolved', 'closed'];
export const isCancellable = (t: Pick<Ticket, 'status'>) => !['resolved', 'closed', 'rejected', 'cancelled'].includes(t.status);

// Which filter bucket a status falls in (the chips on the Support screen).
export const isOpenStatus = (s?: string) => OPEN_STATUSES.includes(String(s || ''));
export const isClosedStatus = (s?: string) => CLOSED_STATUSES.includes(String(s || ''));

// Human-readable reference, derived from the record id exactly as the web does (TKT-…, AST-…).
const REF_PREFIX: Record<string, string> = { ticket: 'TKT', asset: 'AST', admin_request: 'ADM', complaint: 'CMP', task: 'TSK', booking: 'BKG' };
export function refNo(id: string, category?: string) {
  const prefix = REF_PREFIX[category || ''] || 'REQ';
  const digits = (String(id || '').match(/\d+/g) || []).join('');
  const n = digits ? parseInt(digits.slice(0, 15), 10) : 0;
  return `${prefix}-${n ? n.toString(36).toUpperCase() : '000000'}`;
}

// Newest first: when it was raised (createdAt, else date), then id.
export const byNewest = (a: Ticket, b: Ticket) => {
  const ka = a.createdAt || a.date || '';
  const kb = b.createdAt || b.date || '';
  if (ka !== kb) return ka < kb ? 1 : -1;
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
};

// "Mon, 19 Oct, 9:42 AM" for a timestamp ('' when missing or malformed). Pass `today` (useTodayIst())
// from render.
export const dayTime = (iso?: string | null, today?: string) => stampLabel(iso, today);

const hasDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

// When it was raised, in full: the timestamp, else the calendar date it was raised on.
export function raisedOn(t: Ticket, today?: string) {
  return dayTime(t.createdAt, today) || (hasDate(t.date) ? dateLabel(t.date.slice(0, 10), today) : '—');
}

// "Mon, 19 Oct" (no time) for list rows; the detail screen shows the full stamp. Falls back to `date`
// when createdAt is missing or unparseable, like raisedOn().
export function raisedShort(t: Ticket, today?: string) {
  const d = dateLabel(t.createdAt, today);
  if (d !== '—') return d;
  return hasDate(t.date) ? dateLabel(t.date.slice(0, 10), today) : '';
}

// Free-text branch/designation fields are matched trimmed and case-insensitively (web: normKey).
export const normKey = (v?: string) => String(v || '').trim().toLowerCase();
export function uniqueLabels(values: (string | undefined)[]) {
  const m = new Map<string, string>();
  for (const v of Array.isArray(values) ? values : []) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const k = normKey(v);
    if (!m.has(k)) m.set(k, v.trim());
  }
  return [...m.values()].sort((a, b) => a.localeCompare(b));
}
