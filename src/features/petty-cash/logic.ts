// Petty cash rules and wording ported from the website (dash.html ~L16240-17760) so both clients
// describe a request the same way. The server enforces every rule independently.

import type { KekaProject, PettyCashBill, PettyCashRequest, PettyCashStatement, PettyCashSubmission } from '@/api/petty-cash';
import type { Tenant } from '@/api/me';
import type { StaffUser } from '@/auth/session';
import { dateTime as inboxDateTime, dayWithYear, shortDate as inboxShortDate } from '@/features/inbox/format';
import { todayIst } from '@/lib/dates';
import { inr } from '@/lib/format';
import type { StatusTone } from '@/theme/tokens';

// Every list from the server is checked before it is walked: a field that comes back as an object,
// null or a string must never crash a screen ("undefined is not a function").
export const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);
const amountOf = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Roles whose web menu has Accounts → Petty Cash (dash.html navForRaw ~L1531: every staff menu
// except visitor_manager, announcement_viewer and master_admin). Unknown roles get the employee menu.
const NO_PETTY_CASH_MENU_ROLES = ['visitor_manager', 'announcement_viewer', 'master_admin'];
export const roleSeesPettyCash = (u?: StaffUser | null) => !!u && !NO_PETTY_CASH_MENU_ROLES.includes(u.role);

export const PETTY_CASH_ADMIN_ROLES = ['accounts', 'super_admin', 'master_admin', 'ceo', 'coo'];
export const isPettyCashAdmin = (u?: StaffUser | null) => !!u && PETTY_CASH_ADMIN_ROLES.includes(u.role);
// Accounts gives the second sign-off (server.js PETTY_CASH_APPROVER_ROLES).
export const isPettyCashApprover = (u?: StaffUser | null) => !!u && u.role === 'accounts';

export const AUTHORIZED_STATES = ['approved', 'ready_for_payment', 'payment_processing', 'paid', 'received', 'not_received'];
export const AWAITING_RESPONSE = ['payment_processing', 'paid'];
export const UNPAID_AUTHORIZED = ['ready_for_payment', 'approved', 'payment_processing', 'paid', 'not_received'];
export const isAuthorized = (r?: PettyCashRequest | null) => !!r && AUTHORIZED_STATES.includes(r.status);

export const isOwnRequest = (u: StaffUser | null | undefined, r: PettyCashRequest) => !!u && (r.employeeId === u.id || r.requestedById === u.id);

// A bill Accounts rejected or the employee withdrew stays on record but never counts as spent
// (server.js pettyCashBillCounts).
export const billCounts = (b: { status?: string } | null | undefined) => !!b && b.status !== 'rejected' && b.status !== 'withdrawn';
// Claims still waiting to be authorized: a bill inside one can still be pulled out (PETTY_CASH_BILL_REJECTABLE_REQUEST).
export const BILL_PULLABLE_CLAIM = ['pending_approval', 'pending_accounts_approval'];
/**
 * Whether I can withdraw a bill I sent (dash.html canWithdraw): it still counts, and it is not part of
 * an extra claim that has been authorized or rejected. `claim` is that extra claim, when there is one.
 */
export const canWithdrawBill = (b: PettyCashSubmission, claim?: PettyCashRequest | null) =>
  billCounts(b) && (!b.excessRequestId || (!!claim && BILL_PULLABLE_CLAIM.includes(claim.status)));

// The first (project owner's) approval belongs to the Keka Code Owner alone; Accounts stands in only
// on a code with no owner (server.js canActAtPettyCashOwnerStage). Accounts may still reject at that stage.
export function canApprove(u: StaffUser | null | undefined, r: PettyCashRequest) {
  if (!u) return false;
  if (r.costCodeOwnerId) return String(r.costCodeOwnerId) === String(u.id);
  return isPettyCashApprover(u);
}
// Rejecting at that stage is the owner's or anyone in Accounts', even on a code that has an owner
// (server.js isPettyCashApprover on /reject). So on an owned code Accounts gets Reject only.
export const canRejectAtOwnerStage = (u: StaffUser | null | undefined, r: PettyCashRequest) => canApprove(u, r) || isPettyCashApprover(u);

// Requests waiting on this person as project owner (the Inbox's petty cash queue). Extra claims are handled by Accounts.
export const awaitingMyApproval = (u: StaffUser | null | undefined, requests: PettyCashRequest[]) =>
  list(requests).filter((r) => !!r && r.status === 'pending_approval' && r.kind !== 'excess' && canApprove(u, r) && !isOwnRequest(u, r));

// Requests I asked for or that are for me, newest first.
export function myRequests(meId: string | undefined, requests: PettyCashRequest[]) {
  return list(requests)
    .filter((r) => !!r && !!meId && (r.employeeId === meId || r.requestedById === meId))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// The two things only the person the money is FOR can do: say whether a payment arrived, and confirm
// (with the emailed code) a request a teammate raised for them.
export function myPettyTasks(meId: string | undefined, requests: PettyCashRequest[]) {
  const rows = list(requests).filter((r) => !!r && !!meId && r.employeeId === meId);
  return {
    answer: rows.filter((r) => AWAITING_RESPONSE.includes(r.status)),
    confirm: rows.filter((r) => r.status === 'pending_confirmation'),
  };
}

// Someone who owns at least one Keka Code (project.empNo is their employee number).
export function isKekaCodeOwner(u: StaffUser | null | undefined, projects: KekaProject[]) {
  if (!u) return false;
  const mine = [u.employeeNumber, u.kekaCode].filter(Boolean).map((v) => String(v).trim());
  return !!mine.length && list(projects).some((p) => !!p?.empNo && mine.includes(String(p.empNo).trim()));
}

// ── Labels ───────────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  pending_confirmation: { label: 'Not confirmed yet', tone: 'pending' },
  pending_approval: { label: 'Waiting', tone: 'pending' },
  pending_accounts_approval: { label: 'With Accounts', tone: 'info' },
  ready_for_payment: { label: 'Approved', tone: 'info' },
  approved: { label: 'Approved', tone: 'info' },
  payment_processing: { label: 'Being paid', tone: 'info' },
  paid: { label: 'Being paid', tone: 'info' },
  received: { label: 'Paid', tone: 'done' },
  not_received: { label: 'Not received', tone: 'pending' },
  rejected: { label: 'Rejected', tone: 'failed' },
};
/** The groups the requests list filters by: waiting for a decision, approved (paying), paid, rejected. */
export type RequestGroup = 'waiting' | 'approved' | 'paid' | 'rejected';
export function requestGroup(status: string): RequestGroup {
  if (status === 'received') return 'paid';
  if (status === 'rejected') return 'rejected';
  if (UNPAID_AUTHORIZED.includes(status)) return 'approved';
  return 'waiting';
}

export const statusMeta = (s: string) => STATUS_META[s] ?? { label: String(s ?? '').replace(/_/g, ' ') || 'Unknown', tone: 'neutral' as StatusTone };

// PCR-20260911-A1B2C3 / PCB-… from the immutable id; a submitted bill is known by its bill number
// (the server's voucherNumber).
export function pettyCashRef(kind: 'request' | 'bill', row: { id?: string; voucherNumber?: string } | null | undefined) {
  if (!row?.id) return '—';
  if (row.voucherNumber) return row.voucherNumber;
  const m = /^pc[rb](\d{13})([0-9a-f]{6})$/i.exec(row.id);
  if (!m) return String(row.id).toUpperCase();
  return `${kind === 'bill' ? 'PCB-' : 'PCR-'}${new Date(Number(m[1])).toISOString().slice(0, 10).replace(/-/g, '')}-${m[2]!.toUpperCase()}`;
}

// Money, the app's one way: exact (with paise) on detail screens, sheets and sentences; whole rupees
// in list rows, where the amount shares a narrow right column.
export const money = (n: number | null | undefined) => inr(amountOf(n));
/** An amount in a list row: '₹1,24,500' (no paise). */
export const rowMoney = (n: number | null | undefined) => inr(amountOf(n), { decimals: false });
/** A finite number for figures (NaN / strings / null become 0). */
export const amount = amountOf;

// Dates and times in the app's one format (features/inbox/format): 'Mon, 19 Oct' (the year only when
// it isn't this year), 'Mon, 19 Oct, 9:42 AM'. Both take an ISO instant or a 'YYYY-MM-DD' date, and
// `today` (useTodayIst()) so a screen never reads the clock while it renders.
export function shortDate(iso?: string | null, today?: string) {
  if (!iso) return '—';
  return inboxShortDate(iso, today);
}

export function dateTime(iso?: string | null, today?: string) {
  if (!iso) return '';
  const s = inboxDateTime(iso, today);
  return s === '—' ? '' : s;
}

// One short line saying where the payment stands (dash.html pettyCashPaymentLine, in plain words and
// the same words as an expense claim's). Pass `today` (useTodayIst()).
export function paymentLine(r: PettyCashRequest, today?: string) {
  const who = r.employeeName || r.requestedByName || 'the requester';
  const at = (iso?: string | null) => (iso ? ` on ${shortDate(iso, today)}` : '');
  switch (r.status) {
    case 'received':
      return `${r.userResponse?.byName || who} got the money${at(r.userResponse?.at)}`;
    case 'not_received':
      return `Reported not received${at(r.userResponse?.at)} · Accounts is following up`;
    case 'payment_processing':
      return `Payment sent${at(r.processingAt)}`;
    case 'paid':
      return `Accounts marked it paid${at(r.paymentDate || r.paidAt)}`;
    case 'ready_for_payment':
      return `Approved${at(r.approvedAt)} · waiting for Accounts to pay`;
    case 'approved':
      return `Approved${at(r.approvedAt)} · not paid yet`;
    default:
      return '';
  }
}

// Where an automatic "extra" request has got to (dash.html pettyCashExcessStatusText).
export function excessStatusText(req?: PettyCashRequest | null) {
  if (!req) return 'Extra amount sent for approval';
  switch (req.status) {
    case 'pending_approval':
      return `Waiting for ${req.costCodeOwnerName || 'the project owner'} to approve`;
    case 'pending_accounts_approval':
      return 'Approved by the project owner · waiting for Accounts';
    case 'ready_for_payment':
      return 'Approved · not paid yet';
    case 'payment_processing':
      return 'Being paid · confirm once you get it';
    case 'received':
      return 'Paid';
    case 'not_received':
      return 'Not received · Accounts is following up';
    case 'rejected':
      return `Rejected${req.rejectionReason ? ` · ${req.rejectionReason}` : ''}`;
    default:
      return statusMeta(req.status).label;
  }
}

// The employee's petty cash against one Keka Code is one pool: what was authorized vs what their bills add up to.
export function pettyCashPool(requests: PettyCashRequest[], subs: PettyCashSubmission[], r: PettyCashRequest) {
  const code = String(r.kekaCode || '').toLowerCase();
  const same = (x: { employeeId: string; kekaCode?: string }) => !!x && x.employeeId === r.employeeId && String(x.kekaCode || '').toLowerCase() === code;
  const reqs = list(requests);
  const allocated = reqs.filter((x) => same(x) && x.kind !== 'excess' && isAuthorized(x)).reduce((s, x) => s + amountOf(x.amount), 0);
  const spent = list(subs)
    .filter((b) => same(b) && billCounts(b))
    .reduce((s, b) => s + amountOf(b.amount), 0);
  const extras = reqs.filter((x) => same(x) && x.kind === 'excess');
  const extra: 'none' | 'open' | 'rejected' = !extras.length ? 'none' : extras.some((x) => x.status !== 'rejected') ? 'open' : 'rejected';
  return { allocated: Math.round(allocated * 100) / 100, spent: Math.round(spent * 100) / 100, extra };
}

// The Tracking board's money totals — the viewer's OWN petty cash only.
export function myTotals(userId: string, requests: PettyCashRequest[], bills: PettyCashBill[], subs: PettyCashSubmission[]) {
  const mine = list(requests).filter((r) => !!r && r.employeeId === userId);
  const sum = (rows: { amount: number }[]) => rows.reduce((s, x) => s + amountOf(x.amount), 0);
  const authorized = sum(mine.filter(isAuthorized));
  const awaitingPayment = sum(mine.filter((r) => UNPAID_AUTHORIZED.includes(r.status)));
  const received = sum(mine.filter((r) => r.status === 'received'));
  const spent =
    sum(list(subs).filter((b) => !!b && b.employeeId === userId && billCounts(b))) +
    sum(list(bills).filter((b) => !!b && b.status === 'approved' && b.employeeId === userId));
  const advance = sum(mine.filter((r) => r.kind !== 'excess' && isAuthorized(r)));
  const extra = sum(mine.filter((r) => r.kind === 'excess' && r.status !== 'rejected'));
  return { authorized, awaitingPayment, received, spent, advance, extra, remaining: advance - spent };
}

// ── History (dash.html PettyCashHistoryModal + paymentEvents) ─────────────────
export type HistoryEvent = { kind: 'step' | 'authorized' | 'payment' | 'ok' | 'bad' | 'waiting'; label: string; at?: string; by?: string; note?: string; detail?: [string, string][] };
const METHOD_LABEL: Record<string, string> = { bank_transfer: 'Bank transfer', upi: 'UPI', cash: 'Cash', cheque: 'Cheque', other: 'Other' };

// The payment steps use the same words as an expense claim's history (features/reimbursements/format).
// Pass `today` (useTodayIst()).
export function historyEvents(r: PettyCashRequest, today?: string): HistoryEvent[] {
  const ev: HistoryEvent[] = [];
  ev.push({ kind: 'step', label: 'Requested', at: r.createdAt, by: r.requestedByName, note: r.onBehalf ? `For ${r.employeeName || 'a teammate'}` : undefined });
  if (r.confirmedAt) ev.push({ kind: 'step', label: 'Confirmed with the code', at: r.confirmedAt, by: r.employeeName });
  if (r.kekaApprovedAt)
    ev.push({
      kind: 'step',
      label: r.kekaStageBy === 'accounts' ? 'First approval by Accounts' : 'Approved by the project owner',
      at: r.kekaApprovedAt,
      by: r.kekaApprovedByName,
      note: r.kekaStageNote,
    });
  if (r.status === 'rejected')
    ev.push({
      kind: 'bad',
      label:
        r.rejectedStage === 'withdrawn'
          ? 'Closed – every bill withdrawn'
          : r.rejectedStage === 'pool'
            ? 'No longer needed'
            : `Rejected${r.rejectedStage === 'accounts' ? ' by Accounts' : r.rejectedStage === 'keka' ? ' by the project owner' : ''}`,
      at: r.rejectedAt,
      by: r.rejectedByName,
      note: r.rejectionReason,
    });
  if (r.approvedAt)
    ev.push({
      kind: 'authorized',
      label: r.status === 'approved' ? 'Approved by Accounts (older request, not paid)' : 'Approved by Accounts',
      at: r.approvedAt,
      by: r.approvedByName,
    });
  for (const h of list(r.paymentHistory)) {
    if (!h || h.status === 'ready_for_payment') continue;
    const detail = (
      [
        ['Paid on', h.paymentDate ? shortDate(h.paymentDate, today) : ''],
        ['Reference', h.reference || ''],
        ['Method', METHOD_LABEL[h.method || ''] || ''],
      ] as [string, string][]
    ).filter(([, v]) => v && v !== '—');
    if (h.status === 'payment_processing') ev.push({ kind: 'payment', label: h.followUp ? 'Payment sent again' : 'Payment sent', at: h.at, by: h.byName, note: h.note, detail });
    else if (h.status === 'paid') ev.push({ kind: 'payment', label: 'Marked paid by Accounts', at: h.at, by: h.byName, note: h.note, detail });
    else if (h.status === 'received') ev.push({ kind: 'ok', label: 'Money received', at: h.at, by: h.byName, note: h.note });
    else if (h.status === 'not_received') ev.push({ kind: 'bad', label: 'Money not received', at: h.at, by: h.byName, note: h.note });
    else ev.push({ kind: 'step', label: statusMeta(String(h.status || '')).label, at: h.at, by: h.byName, note: h.note });
  }
  if (AWAITING_RESPONSE.includes(r.status)) ev.push({ kind: 'waiting', label: `Waiting for ${r.employeeName || 'the requester'} to confirm they got the money` });
  if (r.status === 'not_received') ev.push({ kind: 'waiting', label: 'Accounts is following up on the payment' });
  return ev;
}

// ── Bill submission batches (one expense report each) ────────────────────────
/** `rejected` and `withdrawn` are counted apart: neither adds to `total`. */
export type BillBatch = { batchId: string; submittedAt: string; count: number; total: number; rejected: number; withdrawn: number; codes: string[]; projects: string[] };
export function billBatches(subs: PettyCashSubmission[]): BillBatch[] {
  const map = new Map<string, BillBatch>();
  for (const b of list(subs)) {
    if (!b?.batchId) continue;
    const cur = map.get(b.batchId) ?? { batchId: b.batchId, submittedAt: '', count: 0, total: 0, rejected: 0, withdrawn: 0, codes: [], projects: [] };
    cur.count++;
    if (b.status === 'rejected') cur.rejected++;
    else if (b.status === 'withdrawn') cur.withdrawn++;
    else cur.total += amountOf(b.amount);
    if ((b.createdAt || '') > cur.submittedAt) cur.submittedAt = b.createdAt || '';
    if (b.kekaCode && !cur.codes.includes(b.kekaCode)) cur.codes.push(b.kekaCode);
    if (b.projectName && !cur.projects.includes(b.projectName)) cur.projects.push(b.projectName);
    map.set(b.batchId, cur);
  }
  return [...map.values()].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export const localToday = () => todayIst();

// How old a bill's date may be (server.js PETTY_CASH_MAX_BILL_AGE_DAYS, dash.html PETTY_CASH_MAX_BILL_AGE_DAYS_UI).
export const MAX_BILL_AGE_DAYS = 180;
/** The oldest bill date accepted, from `today` ('YYYY-MM-DD'). */
export function oldestBillDate(today: string) {
  const d = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - MAX_BILL_AGE_DAYS);
  return d.toISOString().slice(0, 10);
}

// ── Expense report as a printable HTML page (the website's print layout, in plain words) ──
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
// Figures with Indian grouping (1,24,500), as everywhere in the app; dates in the app's one format,
// always with the year since this is a document that is kept ('Mon, 19 Oct 2026').
const num = (n: number) => (Number(n || 0) ? Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-');
const money2 = (n: number) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dDay = (iso: string) => dayWithYear(typeof iso === 'string' ? iso : '');
const CSS =
  '.pcs{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;background:#fff;padding:14px;max-width:820px;margin:0 auto}' +
  '.pcs table{width:100%;border-collapse:collapse}.pcs td{border:1px solid #000;padding:2px 5px;vertical-align:middle;line-height:1.35}' +
  '.pcs .c{text-align:center}.pcs .r{text-align:right}.pcs .b{font-weight:700}.pcs .g{background:#c8c8c8;font-weight:700}.pcs .red{color:#d9261c;font-weight:700}' +
  '.pcs .sec{color:#d9261c;font-weight:700;margin:14px 0 2px}.pcs .sign td{height:42px}.pcs .tot td{font-weight:700;border-top:2px solid #000}' +
  '.pcs .sheet{page-break-after:always;margin-bottom:26px}.pcs .sheet:last-child{page-break-after:auto}';

export function statementHtml(d: PettyCashStatement, tenant: Tenant | null | undefined) {
  const t = (tenant || {}) as { name?: string; address?: string };
  const e = d.employee || ({} as PettyCashStatement['employee']);
  const sheets = list(d.statements)
    .filter(Boolean)
    .map((st) => {
      const submitted = (st.submittedAt || '').slice(0, 10);
      const head = `<table>
<tr><td colspan="4" class="c b" style="font-size:13px">${esc(t.name)}</td></tr>
<tr><td colspan="4" class="c b">${esc(t.address)}</td></tr>
<tr><td colspan="4" class="c b">EXPENSE REPORT</td></tr>
<tr><td class="b">Employee name</td><td>${esc(e.name)}</td><td class="b">Start date</td><td class="c b">${dDay(st.startDate)}</td></tr>
<tr><td class="b">Employee ID</td><td class="r">${esc(e.employeeNumber)}</td><td class="b">Sent on</td><td class="c b">${dDay(submitted)}</td></tr>
<tr><td class="b">Designation</td><td>${esc(e.designation)}</td><td class="b">Number of days</td><td class="c b">${st.days || 1}</td></tr>
<tr><td class="b">Location</td><td>${esc(e.location)}</td><td class="g">Petty cash</td><td class="g c">Day ${st.days || 1}</td></tr>
<tr><td class="b">Project</td><td colspan="3" class="c">${esc(st.projectName || st.kekaCode)}${st.projectName && st.kekaCode ? ` (${esc(st.kekaCode)})` : ''}</td></tr>
<tr><td colspan="3" class="g c">Summary</td><td class="g c">Amount</td></tr>
<tr><td colspan="3" class="r b">Money given (petty cash)</td><td class="red c">${money2(st.advance)}</td></tr>
<tr><td colspan="3" class="r b">Total spent</td><td class="red c">${money2(st.total)}</td></tr>
<tr><td colspan="3" class="r b">Balance to pay the employee</td><td class="red c">${money2(st.balance)}</td></tr>
<tr><td colspan="4" class="c b">Spent more than you were given? Ask Accounts to pay you the extra.</td></tr>
</table>
<table class="sign"><tr class="b c"><td>Employee</td><td>Manager</td><td>GM-Accounts</td><td>CEO</td><td>Director</td></tr><tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr></table>`;
      const outflow = `<div class="sec">1. Spent, by expense type</div><table><tr class="b"><td>Expense type</td><td>Total</td></tr>${list(st.heads)
        .filter(Boolean)
        .map((h) => `<tr><td>${esc(h.name)}</td><td class="r">${num(h.total)}</td></tr>`)
        .join('')}<tr class="tot"><td>Total</td><td class="r">${num(st.total)}</td></tr></table>`;
      const inflowRows = list(st.inflow).filter(Boolean);
      const inflow = `<div class="sec">2. Petty cash received</div><table><tr class="b"><td>Date</td><td>Amount</td></tr>${
        inflowRows.length ? inflowRows.map((i) => `<tr><td class="r">${dDay(i.date)}</td><td class="r">${num(i.amount)}</td></tr>`).join('') : '<tr><td>&nbsp;</td><td>&nbsp;</td></tr>'
      }<tr class="tot"><td>Total</td><td class="r">${num(st.advance)}</td></tr></table>`;
      const allLines = list(st.lines).filter(Boolean);
      const active = allLines.filter((l) => l.status !== 'rejected' && l.status !== 'withdrawn');
      const annex = `<div class="sec" style="color:#000">3. Every bill</div><table><tr class="b c"><td>Expense type</td><td>Amount</td><td>Date</td><td>Project</td><td>What for / paid to</td></tr>${active
        .map((l) => `<tr><td>${esc(l.head)}</td><td class="r">${num(l.amount)}</td><td class="r">${dDay(l.date)}</td><td>${esc(l.project)}</td><td>${esc(l.description)}${l.paidTo ? ` — ${esc(l.paidTo)}` : ''}</td></tr>`)
        .join('')}</table>`;
      const rejected = allLines.filter((l) => l.status === 'rejected');
      const rej = rejected.length
        ? `<div class="sec" style="color:#000">Rejected by Accounts (not counted above)</div><table><tr class="b c"><td>Expense type</td><td>Amount</td><td>Date</td><td>What for / paid to</td><td>Rejected by</td><td>Reason</td></tr>${rejected
            .map((l) => `<tr><td>${esc(l.head)}</td><td class="r">${num(l.amount)}</td><td class="r">${dDay(l.date)}</td><td>${esc(l.description)}${l.paidTo ? ` — ${esc(l.paidTo)}` : ''}</td><td>${esc(l.rejectedByName)}</td><td>${esc(l.rejectionReason)}</td></tr>`)
            .join('')}</table>`
        : '';
      const withdrawn = allLines.filter((l) => l.status === 'withdrawn');
      const wd = withdrawn.length
        ? `<div class="sec" style="color:#000">Withdrawn by the employee – not counted above</div><table><tr class="b c"><td>Expense type</td><td>Amount</td><td>Date</td><td>What for / paid to</td><td>Withdrawn on</td></tr>${withdrawn
            .map((l) => `<tr><td>${esc(l.head)}</td><td class="r">${num(l.amount)}</td><td class="r">${dDay(l.date)}</td><td>${esc(l.description)}${l.paidTo ? ` — ${esc(l.paidTo)}` : ''}</td><td class="r">${dDay(String(l.withdrawnAt || '').slice(0, 10))}</td></tr>`)
            .join('')}</table>`
        : '';
      return `<div class="sheet">${head}${outflow}${inflow}${annex}${rej}${wd}</div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Expense report</title><style>@page{size:A4;margin:10mm}body{margin:0}${CSS}</style></head><body><div class="pcs">${sheets}</div></body></html>`;
}
