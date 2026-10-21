// One shape for everything that waits on Accounts — petty cash, old petty cash bills, expense claims and
// vendor bills — and the one stage vocabulary the website's Bill Approvals uses for all of them
// (dash.html:16960 PAYMENT_STAGE_META, :16968 pettyCashStage, :16980 vendorBillStage, :17202
// reimbursementStage), in the app's plain words (docs/DESIGN.md §0B).
//
//   awaiting      waiting for Accounts to approve ("Awaiting Authorization")
//   ready         approved, payment not started yet ("Ready for Processing")
//   processing    payment started, waiting for the person to confirm ("Processing")
//   received      the person confirmed they got the money
//   not_received  the person said they didn't — Accounts starts the payment again
//   rejected      rejected by Accounts
//
// Pure functions only (they run during render).

import { Banknote, FileText, type LucideIcon, Receipt, ReceiptText } from 'lucide-react-native';

import type { AccountsBill, BillPayment, BillVendor, PayKind } from '@/api/accounts';
import type { PettyCashBill, PettyCashRequest } from '@/api/petty-cash';
import { PURPOSE_LABEL, type Reimbursement } from '@/api/reimbursements';
import type { StaffUser } from '@/auth/session';
import { isOwnBill, isOwnClaim, isOwnPetty } from '@/features/accounts/access';
import { pettyCashRef } from '@/features/petty-cash/logic';
import { reimbursementRef } from '@/features/reimbursements/format';
import type { ModuleKey, StatusTone } from '@/theme/tokens';

export type Stage = 'awaiting' | 'ready' | 'processing' | 'received' | 'not_received' | 'rejected';
export const STAGES: Stage[] = ['awaiting', 'ready', 'processing', 'not_received', 'received', 'rejected'];
export const PAYMENT_STAGES: Stage[] = ['ready', 'processing', 'not_received', 'received'];

export const STAGE_META: Record<Stage, { label: string; tone: StatusTone; hint: string }> = {
  awaiting: { label: 'Waiting', tone: 'pending', hint: 'To approve' },
  ready: { label: 'Ready to pay', tone: 'info', hint: 'Approved, not started' },
  processing: { label: 'Being paid', tone: 'info', hint: 'Waiting for them to confirm' },
  not_received: { label: 'Not received', tone: 'failed', hint: 'Start it again' },
  received: { label: 'Received', tone: 'done', hint: 'Confirmed' },
  rejected: { label: 'Rejected', tone: 'failed', hint: 'By Accounts' },
};
export const isStage = (s: unknown): s is Stage => typeof s === 'string' && (STAGES as string[]).includes(s);

export function pettyStage(r: Pick<PettyCashRequest, 'status' | 'rejectedStage'>): Stage | null {
  switch (r?.status) {
    case 'pending_accounts_approval':
      return 'awaiting';
    case 'ready_for_payment':
    case 'approved':
      return 'ready';
    case 'payment_processing':
    case 'paid':
      return 'processing';
    case 'received':
      return 'received';
    case 'not_received':
      return 'not_received';
    case 'rejected':
      return r.rejectedStage === 'accounts' ? 'rejected' : null;
    default:
      return null;
  }
}

export function claimStage(r: Pick<Reimbursement, 'status' | 'rejected_stage'>): Stage | null {
  switch (r?.status) {
    case 'pending_accounts_approval':
      return 'awaiting';
    case 'ready_for_payment':
      return 'ready';
    case 'payment_processing':
      return 'processing';
    case 'received':
      return 'received';
    case 'not_received':
      return 'not_received';
    case 'rejected':
      return r.rejected_stage === 'accounts' ? 'rejected' : null;
    default:
      return null;
  }
}

export function billStage(b: Pick<AccountsBill, 'status'>): Stage | null {
  switch (b?.status) {
    case 'pending_accounts_approval':
      return 'awaiting';
    case 'accepted':
      return 'ready';
    case 'payment_processing':
      return 'processing';
    case 'received':
      return 'received';
    case 'not_received':
      return 'not_received';
    case 'rejected_accounts':
      return 'rejected';
    default:
      return null;
  }
}

/** An old-flow petty cash bill: pending ones wait on Accounts; approved / rejected are history. */
export const pcBillStage = (b: Pick<PettyCashBill, 'status'>): Stage | null =>
  b?.status === 'pending' ? 'awaiting' : b?.status === 'rejected' ? 'rejected' : null;

// ── The one item shape ───────────────────────────────────────────────────────
export type ItemType = 'petty' | 'pcbill' | 'claim' | 'bill';
export const ITEM_TYPES: ItemType[] = ['petty', 'pcbill', 'claim', 'bill'];
export const isItemType = (s: unknown): s is ItemType => typeof s === 'string' && (ITEM_TYPES as string[]).includes(s);

export const TYPE_META: Record<ItemType, { label: string; title: string; module: ModuleKey; icon: LucideIcon }> = {
  petty: { label: 'Petty cash', title: 'Petty cash', module: 'pettyCash', icon: Banknote },
  pcbill: { label: 'Petty cash bill', title: 'Petty cash bill', module: 'pettyCash', icon: ReceiptText },
  claim: { label: 'Expense claim', title: 'Expense claim', module: 'expenses', icon: Receipt },
  bill: { label: 'Vendor bill', title: 'Vendor bill', module: 'vendor', icon: FileText },
};

export const PAY_KIND: Record<ItemType, PayKind | null> = { petty: 'petty', pcbill: null, claim: 'claim', bill: 'bill' };

export type AccountsItem = {
  key: string;
  type: ItemType;
  id: string;
  stage: Stage;
  amount: number;
  /** The person the money is for (or who submitted the vendor bill). */
  person: string;
  /** Row title: the person, or the vendor for a vendor bill. */
  title: string;
  /** "Expense claim · Food", "Vendor bill · Advance". */
  what: string;
  kekaCode: string;
  project: string;
  /** When it was raised (ISO) — the list's order and the date filter. */
  at: string;
  /** When the payment last moved (started / answered), for the payments list. */
  movedAt: string;
  ref: string;
  /** The viewer raised it or is paid by it — "someone else in Accounts has to". */
  own: boolean;
  row: PettyCashRequest | PettyCashBill | Reimbursement | AccountsBill;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** What a vendor bill is worth to Accounts: the project owner's approved amount, else the bill (web vendorBillAmount). */
export const billAmount = (b: AccountsBill) => num(b.version?.keka_approved_amount || b.version?.amount);

export const vendorName = (vendors: Map<string, BillVendor>, id: string) => vendors.get(id)?.legalEntityName || 'Vendor';

export function billRef(b: AccountsBill) {
  const n = b.version?.version_no ?? b.current_version;
  return `${b.version?.file_name || 'Bill'}${n && n > 1 ? ` · version ${n}` : ''}`;
}

export function pettyItem(r: PettyCashRequest, user: StaffUser | null | undefined): AccountsItem | null {
  const stage = r && typeof r === 'object' ? pettyStage(r) : null;
  if (!stage) return null;
  return {
    key: `petty:${r.id}`,
    type: 'petty',
    id: r.id,
    stage,
    amount: num(r.amount),
    person: str(r.employeeName) || 'Employee',
    title: str(r.employeeName) || 'Employee',
    what: r.kind === 'excess' ? 'Petty cash · Extra' : 'Petty cash',
    kekaCode: str(r.kekaCode),
    project: str(r.projectName),
    at: str(r.createdAt),
    movedAt: str(r.userResponse?.at) || str(r.processingAt) || str(r.approvedAt) || str(r.createdAt),
    ref: pettyCashRef('request', r),
    own: isOwnPetty(user, r),
    row: r,
  };
}

export function pcBillItem(b: PettyCashBill, user: StaffUser | null | undefined): AccountsItem | null {
  const stage = b && typeof b === 'object' ? pcBillStage(b) : null;
  if (!stage) return null;
  return {
    key: `pcbill:${b.id}`,
    type: 'pcbill',
    id: b.id,
    stage,
    amount: num(b.amount),
    person: str(b.employeeName) || 'Employee',
    title: str(b.employeeName) || 'Employee',
    what: 'Petty cash bill',
    kekaCode: str(b.kekaCode),
    project: str(b.projectName),
    at: str(b.createdAt),
    movedAt: str(b.rejectedAt) || str(b.createdAt),
    ref: pettyCashRef('bill', b),
    own: !!user && (b.uploadedById === user.id || b.employeeId === user.id),
    row: b,
  };
}

export function claimItem(r: Reimbursement, user: StaffUser | null | undefined): AccountsItem | null {
  const stage = r && typeof r === 'object' ? claimStage(r) : null;
  if (!stage) return null;
  return {
    key: `claim:${r.id}`,
    type: 'claim',
    id: r.id,
    stage,
    amount: num(r.amount),
    person: str(r.employee_name) || 'Employee',
    title: str(r.employee_name) || 'Employee',
    what: `Expense claim · ${PURPOSE_LABEL[str(r.purpose)] || str(r.purpose) || 'Other'}`,
    kekaCode: str(r.keka_code),
    project: str(r.project_name),
    at: str(r.created_at),
    movedAt: str(r.payment?.response?.at) || str(r.payment?.startedAt) || str(r.approved_at) || str(r.updated_at) || str(r.created_at),
    ref: reimbursementRef(r),
    own: isOwnClaim(user, r),
    row: r,
  };
}

export function billItem(b: AccountsBill, user: StaffUser | null | undefined, vendors: Map<string, BillVendor>): AccountsItem | null {
  const stage = b && typeof b === 'object' ? billStage(b) : null;
  if (!stage) return null;
  return {
    key: `bill:${b.id}`,
    type: 'bill',
    id: b.id,
    stage,
    amount: billAmount(b),
    person: str(b.submitted_by_name) || 'Someone',
    title: vendorName(vendors, b.vendor_id),
    what: b.is_advance ? 'Vendor bill · Vendor advance' : 'Vendor bill',
    kekaCode: str(b.keka_code),
    project: '',
    at: str(b.created_at),
    movedAt: str(b.payment?.response?.at) || str(b.payment?.startedAt) || str(b.updated_at) || str(b.created_at),
    ref: billRef(b),
    own: isOwnBill(user, b),
    row: b,
  };
}

// ── Payments (dash.html:17233 paymentInfo) ───────────────────────────────────
export type PaymentInfo = { startedAt: string; by: string; date: string; ref: string; method: string; note: string; response: BillPayment['response']; whoConfirms: string };

export function paymentInfo(it: AccountsItem): PaymentInfo {
  if (it.type === 'petty') {
    const r = it.row as PettyCashRequest;
    return {
      startedAt: str(r.processingAt) || str(r.paidAt),
      by: str(r.processingByName),
      date: str(r.paymentDate),
      ref: str(r.paymentReference),
      method: str(r.paymentMethod),
      note: '',
      response: r.userResponse ?? null,
      whoConfirms: str(r.employeeName) || str(r.requestedByName) || 'the person it is for',
    };
  }
  if (it.type === 'claim' || it.type === 'bill') {
    const row = it.row as Reimbursement | AccountsBill;
    const p: BillPayment = row.payment ?? {};
    return {
      startedAt: str(p.startedAt),
      by: str(p.startedByName),
      date: str(p.paymentDate),
      ref: str(p.reference),
      method: str(p.method),
      note: str(p.note),
      response: p.response ?? null,
      whoConfirms: it.type === 'claim' ? str((row as Reimbursement).employee_name) || 'the claimant' : str((row as AccountsBill).submitted_by_name) || 'the person who sent it',
    };
  }
  return { startedAt: '', by: '', date: '', ref: '', method: '', note: '', response: null, whoConfirms: '' };
}

export const METHOD_LABEL: Record<string, string> = { bank_transfer: 'Bank transfer', upi: 'UPI', cash: 'Cash', cheque: 'Cheque', other: 'Other' };

/** Payment can be started (or started again) on this item at all — the role and own checks come on top. */
export const canStartPayment = (it: AccountsItem) => it.type !== 'pcbill' && (it.stage === 'ready' || it.stage === 'not_received');

// ── Filters ──────────────────────────────────────────────────────────────────
export type DatePreset = '' | 'today' | '7d' | '30d' | 'month';
export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: '', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
];

/** baInDateRange (dash.html:17109), in India time: `today` is useTodayIst(), `now` is useNow(). */
export function inDateRange(iso: string, preset: DatePreset, today: string, now: number) {
  if (!preset) return true;
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const day = 86400000;
  const istDay = new Date(t + 330 * 60000).toISOString().slice(0, 10);
  if (preset === 'today') return istDay === today;
  if (preset === 'month') return istDay.slice(0, 7) === today.slice(0, 7);
  return t >= now - (preset === '7d' ? 7 : 30) * day;
}

export function matches(it: AccountsItem, needle: string) {
  if (!needle) return true;
  return [it.title, it.person, it.kekaCode, it.project, it.ref, it.what, String(it.amount)].join(' ').toLowerCase().includes(needle);
}

export const sumOf = (items: AccountsItem[]) => items.reduce((s, i) => s + (Number.isFinite(i.amount) ? i.amount : 0), 0);
