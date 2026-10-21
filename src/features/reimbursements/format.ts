// Wording and the timeline for expense claims (reimbursements). Ported from the web's
// ReimbursementStatusBadge / reimbursementStatusLine / reimbursementEvents / reimbursementRef
// (dash.html ~L17025, ~L17196, ~L33428–33473), in plain words: "project code" / "project owner"
// (the web's Keka Code / Keka Code Owner) and the same status words as the Inbox. India time throughout,
// in the app's one format (features/inbox/format): 'Mon, 19 Oct' (the year only when it isn't this
// year) and 'Mon, 19 Oct, 9:42 AM'; money exact here, whole rupees in list rows (rowInr). Every date
// helper takes `today` (useTodayIst()) so a screen never reads the clock while it renders.

import { type HistoryEntry, PURPOSE_LABEL, type Reimbursement } from '@/api/reimbursements';
import { dateTime, shortDate } from '@/features/inbox/format';
import { inr } from '@/lib/format';
import type { StatusTone } from '@/theme/tokens';

export { rowInr } from '@/features/inbox/format';

/** API arrays can arrive as null / an object from an old cached payload — never .map those. */
const arr = <T,>(x: T[] | null | undefined): T[] => (Array.isArray(x) ? x.filter((v) => v != null) : []);

/** 'Mon, 19 Oct' ('—' when missing). Pass `today` (useTodayIst()) when calling during render. */
export function isoDay(iso?: string | null, today?: string) {
  if (!iso) return '—';
  return shortDate(iso, today);
}

/** 'Mon, 19 Oct, 9:42 AM' ('' when missing). Pass `today` (useTodayIst()) when calling during render. */
export function isoDayTime(iso?: string | null, today?: string) {
  if (!iso) return '';
  const s = dateTime(iso, today);
  return s === '—' ? '' : s;
}

export const purposeLabel = (p?: string) => PURPOSE_LABEL[p || ''] || p || '—';

// RMB-20260911-A1B2C3, derived from the id ('rmb' + Date.now() + 6 hex), as on the web.
export function reimbursementRef(r?: Pick<Reimbursement, 'id'> | null) {
  if (!r?.id) return '—';
  const m = /^rmb(\d{13})([0-9a-f]{6})$/i.exec(String(r.id));
  if (!m) return String(r.id).toUpperCase();
  return `RMB-${new Date(Number(m[1])).toISOString().slice(0, 10).replace(/-/g, '')}-${m[2]!.toUpperCase()}`;
}

/** Where a claim stands, in a few words (≤ 13 characters, so it fits a row's pill at 360 dp). */
export function reimbursementStatus(r: Pick<Reimbursement, 'status'>): { label: string; tone: StatusTone } {
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
      return { label: 'Rejected', tone: 'failed' };
    default:
      return { label: String(r.status || '—').replace(/_/g, ' '), tone: 'neutral' };
  }
}

/** The three groups the claims list filters by: still on its way to me, paid back, or rejected. */
export type ClaimGroup = 'open' | 'paid' | 'rejected';
export function claimGroup(r: Pick<Reimbursement, 'status'>): ClaimGroup {
  if (r.status === 'received') return 'paid';
  if (r.status === 'rejected') return 'rejected';
  return 'open';
}

// One short line under the status: what the claim is waiting on. `mine`: I made the claim — the
// payment lines then speak to me; otherwise (an approver or admin looking at someone else's claim)
// they name the claimant. For my own rejected claim it is empty (the screen shows the reason in a
// banner); for anyone else's it is the reason. Pass `today` (useTodayIst()).
export function reimbursementStatusLine(r: Reimbursement, mine = false, today?: string) {
  const p = (r.payment && typeof r.payment === 'object' ? r.payment : {}) as NonNullable<Reimbursement['payment']>;
  const on = (iso?: string | null) => {
    const d = isoDay(iso, today);
    return d === '—' ? '' : ` on ${d}`;
  };
  const who = r.employee_name || 'The employee';
  switch (r.status) {
    case 'pending_keka_approval':
      return `Waiting for ${r.keka_owner_name || 'the project owner'} to approve.`;
    case 'pending_accounts_approval':
      return `${r.keka_approved_by_name ? `${r.keka_approved_by_name} approved it. ` : ''}Waiting for Accounts.`;
    case 'ready_for_payment':
      return 'Accounts approved it. Payment not sent yet.';
    case 'payment_processing':
      // Mine: the bottom bar asks whether it arrived, so the line only says when it was sent.
      return mine ? `Payment sent${on(p.startedAt)}.` : `Payment sent${on(p.startedAt)}. Waiting for ${r.employee_name || 'the employee'} to confirm.`;
    case 'received':
      return `${mine ? 'You' : who} got the money${on(p.response?.at || r.updated_at)}.`;
    case 'not_received':
      return `${mine ? 'You' : who} said it didn’t arrive. Accounts is checking.`;
    case 'rejected':
      return !mine && r.rejection_reason ? `Reason: ${r.rejection_reason}` : '';
    default:
      return '';
  }
}

// ── timeline ────────────────────────────────────────────────────────────────────────────────────
// k: c = neutral step, a = approval, s = payment step, p = paid/received, r = rejected/problem, w = waiting
export type TimelineEvent = { k: 'c' | 'a' | 's' | 'p' | 'r' | 'w'; label: string; at?: string; by?: string; note?: string; detail?: [string, string][] };

const METHOD_LABEL: Record<string, string> = { bank_transfer: 'Bank transfer', upi: 'UPI', cash: 'Cash', cheque: 'Cheque', other: 'Other' };

// The same words as a petty cash payment (features/petty-cash/logic historyEvents).
function paymentEvent(h: HistoryEntry, today?: string): TimelineEvent | null {
  if (h.status === 'ready_for_payment') return null;
  const det = ([
    ['Paid on', h.paymentDate ? isoDay(h.paymentDate, today) : ''],
    ['Reference', h.reference || ''],
    ['Method', METHOD_LABEL[h.method || ''] || ''],
  ] as [string, string][]).filter((x) => x[1] && x[1] !== '—');
  if (h.status === 'payment_processing') return { k: 's', label: h.followUp ? 'Payment sent again' : 'Payment sent', at: h.at, by: h.byName, note: h.note, detail: det };
  if (h.status === 'paid') return { k: 's', label: 'Marked paid by Accounts', at: h.at, by: h.byName, note: h.note, detail: det };
  if (h.status === 'received') return { k: 'p', label: 'Money received', at: h.at, by: h.byName, note: h.note };
  if (h.status === 'not_received') return { k: 'r', label: 'Money not received', at: h.at, by: h.byName, note: h.note };
  return { k: 'c', label: String(h.status || h.event || 'Updated').replace(/_/g, ' '), at: h.at, by: h.byName, note: h.note };
}

/** Everything that happened, oldest first, ending with what it waits on. `mine`: I made the claim. Pass `today` (useTodayIst()). */
export function reimbursementEvents(r: Reimbursement, mine = false, today?: string): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  for (const h of arr(r.history)) {
    switch (h.event) {
      case 'submitted':
        ev.push({ k: 'c', label: 'Sent', at: h.at, by: h.byName, detail: [['Amount', inr(h.amount ?? r.amount)], ['For', purposeLabel(h.purpose || r.purpose)]] });
        break;
      case 'keka_skipped':
        ev.push({ k: 'c', label: 'Project owner step skipped', at: h.at, by: h.byName, note: h.note });
        break;
      case 'keka_approved':
        ev.push({ k: 'a', label: 'Approved by the project owner', at: h.at, by: h.byName, note: h.note });
        break;
      case 'keka_rejected':
        ev.push({ k: 'r', label: 'Rejected by the project owner', at: h.at, by: h.byName, note: h.note });
        break;
      case 'reuploaded':
        ev.push({ k: 'c', label: 'Sent again', at: h.at, by: h.byName, note: h.note, detail: [['Old amount', inr(h.previousAmount)], ['New amount', inr(h.amount)]] });
        break;
      case 'authorized':
        ev.push({ k: 'a', label: 'Approved by Accounts', at: h.at, by: h.byName });
        break;
      case 'accounts_rejected':
        ev.push({ k: 'r', label: 'Rejected by Accounts', at: h.at, by: h.byName, note: h.note });
        break;
      default: {
        const p = paymentEvent(h, today);
        if (p) ev.push(p);
      }
    }
  }
  const waits: Record<string, string> = {
    pending_keka_approval: `Waiting for ${r.keka_owner_name || 'the project owner'} to approve`,
    pending_accounts_approval: 'Waiting for Accounts to approve',
    ready_for_payment: 'Waiting for Accounts to pay',
    payment_processing: mine ? 'Waiting for you to confirm you got the money' : `Waiting for ${r.employee_name || 'the employee'} to confirm they got the money`,
    not_received: 'Accounts is following up on the payment',
  };
  const w = waits[String(r.status)];
  if (w) ev.push({ k: 'w', label: w });
  return ev;
}

// The most recent re-upload, so a changed amount can be pointed out.
export function lastReupload(r: Reimbursement) {
  const h = arr(r.history).filter((x) => x.event === 'reuploaded');
  return h.length ? h[h.length - 1]! : null;
}
