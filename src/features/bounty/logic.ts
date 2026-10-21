// Bounty rules ported from the website so both clients show the same thing. The server re-checks
// every action; these only decide what is offered.
//   dash.html:11881 BOUNTY_CREATOR_ROLES / canClaimBounty   dash.html:11908 isBountyCreator
//   dash.html:12391 phase-wise coins helpers                 dash.html:12351 bountyAttachmentCap
//   dash.html:26225 bountyTaskExpired                        dash.html:28496 BountyCoinsProfileCard

import {
  BOUNTY_REDEEM_MIN,
  type BountyClaim,
  type BountyPhase,
  type BountyRedemption,
  type BountySubmissionType,
  type BountyTask,
  type BountyTxn,
} from '@/api/bounty';
import type { Tenant } from '@/api/me';
import type { StaffUser } from '@/auth/session';
import { dateLabel, stampLabel } from '@/features/visitors/format';
import { thisMonthIst, todayIst } from '@/lib/dates';
import { titleCase } from '@/lib/format';
import type { StatusTone } from '@/theme/tokens';

// Roles whose web menu has "Bounty System" (dash.html navForRaw ~L1531: BN is absent from the
// accounts, visitor_manager and announcement_viewer menus; master_admin's entry is Company Wallets,
// not this employee-side screen). Unknown roles get the employee menu, which has it.
const NO_BOUNTY_MENU_ROLES = ['accounts', 'visitor_manager', 'announcement_viewer', 'master_admin'];
export const roleSeesBounty = (u?: StaffUser | null) => !!u && !NO_BOUNTY_MENU_ROLES.includes(u.role);

export const BOUNTY_CREATOR_ROLES = ['super_admin', 'ceo', 'coo'];
// Creators fund bounties and normally can't claim them; these roles may anyway (server mirrors this).
export const BOUNTY_CREATOR_CAN_CLAIM_ROLES = ['ceo', 'coo', 'manager', 'admin'];

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

// ── Guards ───────────────────────────────────────────────────────────────────
// The query cache is persisted to disk and the server occasionally sends null / an object where a
// list is expected, so every list and number read from the API goes through these first.
export const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function isBountyCreator(user: StaffUser | null | undefined, tenant: Tenant | null | undefined) {
  if (!user) return false;
  if (BOUNTY_CREATOR_ROLES.includes(user.role)) return true;
  const list = (Array.isArray(tenant?.bountyCreators) ? tenant!.bountyCreators : []) as { empNo?: string; name?: string }[];
  if (!list.length) return false;
  const uEmpNo = norm(user.employeeNumber || user.kekaCode);
  const uName = norm(user.name);
  return list.some((c) => {
    const cEmpNo = norm(c.empNo);
    const cName = norm(c.name);
    return (!!cEmpNo && !!uEmpNo && cEmpNo === uEmpNo) || (!!cName && !!uName && cName === uName);
  });
}

export function canClaimBounty(user: StaffUser | null | undefined, tenant: Tenant | null | undefined) {
  if (!user) return false;
  if (user.role === 'app_manager') return false; // read-only oversight role, no wallet
  if (BOUNTY_CREATOR_CAN_CLAIM_ROLES.includes(user.role)) return true;
  return !isBountyCreator(user, tenant);
}

// A deadline of the 1st is good for all of the 1st (India time, as the server checks it).
// Screens pass `today` from useTodayIst() so render stays pure and the answer flips at midnight.
export function taskExpired(t: Pick<BountyTask, 'deadline'> | null | undefined, today: string = todayIst()) {
  const dl = String(t?.deadline || '').trim();
  return !!dl && dl < today;
}

export const claimsOf = (t: Pick<BountyTask, 'claims'> | null | undefined): BountyClaim[] => asArray<BountyClaim>(t?.claims).filter(Boolean);

export const myClaimOf = (t: BountyTask, userId?: string | null): BountyClaim | undefined =>
  userId ? claimsOf(t).find((c) => c.employeeId === userId) : undefined;

const upToOf = (p: BountyPhase) => (p.upTo === '' || p.upTo == null ? Infinity : Number(p.upTo));

// For someone who has NOT accepted yet: which phase the next acceptance falls into.
export function currentPhase(t: BountyTask) {
  const phases = asArray<BountyPhase>(t.phases).filter(Boolean);
  if (!t.phaseWiseCoins || !phases.length) return null;
  const accepted = claimsOf(t).length;
  const position = accepted + 1;
  const idx = phases.findIndex((p) => position <= upToOf(p));
  const currentIndex = idx === -1 ? phases.length - 1 : idx;
  const current = phases[currentIndex]!;
  const upTo = current.upTo === '' || current.upTo == null ? null : Number(current.upTo);
  const remaining = upTo == null ? null : Math.max(0, upTo - accepted);
  const next = phases[currentIndex + 1] ?? null;
  return { current, currentIndex, remaining, next, position };
}

// The single figure shown on a card: the current phase's coins, or the flat reward.
export const headlineReward = (t: BountyTask) => currentPhase(t)?.current.coins ?? t.reward;

// The reward an accepted claim pays (locked in at acceptance), else the task's headline figure.
export const claimReward = (t: BountyTask, c?: BountyClaim) => (c?.reward != null ? c.reward : headlineReward(t));

export const phaseRangeLabel = (p: BountyPhase) => (p.upTo != null && p.upTo !== '' ? `up to #${p.upTo}` : 'unlimited');

// How many links/files ONE person may submit (1–10, default 1).
export function attachmentCap(t: Pick<BountyTask, 'maxAttachments'>) {
  const n = Math.floor(Number(t.maxAttachments));
  return !n || n < 1 ? 1 : Math.min(n, 10);
}

export const SUBMISSION_TYPE_LABEL: Record<BountySubmissionType, string> = {
  text: 'Text',
  link: 'Link',
  image: 'Image',
  video: 'Video',
  document: 'Document',
};
export const submissionTypeOf = (t: Pick<BountyTask, 'submissionType'>): BountySubmissionType =>
  t.submissionType && t.submissionType in SUBMISSION_TYPE_LABEL ? t.submissionType : 'text';

// Departments a task is kept for (deptIds and/or the single deptId).
export const taskDepartments = (t: BountyTask) =>
  ([] as unknown[])
    .concat(t.deptIds || [], t.deptId || [])
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);

const PROF_TYPE_DEFAULTS: Record<string, string> = {
  cinematographer: 'Cinematographer',
  editor: 'Editor',
  graphic_designer: 'Graphic Designer',
};
export function profTypeLabel(id: string, tenant: Tenant | null | undefined) {
  const custom = (Array.isArray(tenant?.profTypes) ? tenant!.profTypes : []) as { id?: string; label?: string }[];
  return custom.find((t) => t.id === id)?.label || PROF_TYPE_DEFAULTS[id] || titleCase(id) || 'Professional';
}

// ── Status presentation ──────────────────────────────────────────────────────

export function claimStatusMeta(_t: BountyTask, c: BountyClaim): { label: string; tone: StatusTone } {
  switch (c?.status) {
    case 'claimed':
      return { label: 'Not started', tone: 'pending' };
    case 'in_progress':
      return c.rejectReason ? { label: 'Sent back', tone: 'pending' } : { label: 'In progress', tone: 'info' };
    case 'submitted':
      return { label: 'Waiting', tone: 'pending' };
    case 'completed':
      return { label: 'Paid', tone: 'done' };
    case 'rejected':
      return { label: 'Rejected', tone: 'failed' };
    case 'expired':
      return { label: 'Expired', tone: 'neutral' };
    default:
      return { label: titleCase(c?.status) || 'Unknown', tone: 'neutral' };
  }
}

export function taskStatusMeta(t: BountyTask, today?: string): { label: string; tone: StatusTone } {
  if (t.cancelledAt) return { label: 'Cancelled', tone: 'failed' };
  if (taskExpired(t, today)) return { label: 'Expired', tone: 'failed' };
  if (t.status === 'open') return { label: 'Open', tone: 'done' };
  if (t.status === 'closed') return { label: 'Full', tone: 'neutral' };
  return { label: titleCase(t.status), tone: 'neutral' };
}

// ── Lists ────────────────────────────────────────────────────────────────────

const newestFirst = (a: BountyTask, b: BountyTask) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

/** Every usable task on the board, newest first (rows that are not objects or have no id are dropped). */
export const boardTasks = (data: unknown): BountyTask[] =>
  asArray<BountyTask>(data)
    .filter((t) => !!t && typeof t === 'object' && !!t.id)
    .sort(newestFirst);

/**
 * Open tasks: open, not cancelled, before the deadline. For people who can take part (`canClaim`,
 * the default) it also leaves out tasks I already joined or posted myself, so it is "tasks I can still
 * join". People who can't take part (task posters, read-only roles) see every open task, their own too.
 */
export const tasksToFind = (tasks: BountyTask[], userId: string | null | undefined, today: string, canClaim = true) =>
  tasks.filter(
    (t) =>
      t.status === 'open' &&
      !t.cancelledAt &&
      !taskExpired(t, today) &&
      (!canClaim || (!myClaimOf(t, userId) && !(!!userId && t.creatorId === userId))),
  );

// My tasks: things to do first, then waiting for review, then finished.
const CLAIM_ORDER: Record<string, number> = { claimed: 0, in_progress: 1, submitted: 2, rejected: 3, completed: 4, expired: 5 };
const ACTIVE_CLAIMS = ['claimed', 'in_progress', 'submitted'];
export const claimIsActive = (c: BountyClaim | undefined) => !!c && ACTIVE_CLAIMS.includes(c.status);

/** Tasks I have joined, sorted to-do → waiting → finished, newest first inside each. */
export function myClaimTasks(tasks: BountyTask[], userId: string | null | undefined): BountyTask[] {
  return tasks
    .filter((t) => !!myClaimOf(t, userId))
    .sort((a, b) => {
      const ca = myClaimOf(a, userId)!;
      const cb = myClaimOf(b, userId)!;
      const o = (CLAIM_ORDER[ca.status] ?? 9) - (CLAIM_ORDER[cb.status] ?? 9);
      if (o) return o;
      return String(cb.submittedAt || cb.claimedAt || b.createdAt || '').localeCompare(String(ca.submittedAt || ca.claimedAt || a.createdAt || ''));
    });
}

// ── Wallet / ledger ──────────────────────────────────────────────────────────

export const coins = (n: number | string | null | undefined) => num(n).toLocaleString('en-IN');

const TXN_LABEL: Record<string, string> = {
  BOUNTY_REWARD_TRANSFER: 'Task reward',
  REDEMPTION: 'Used for a reward',
  COIN_DISTRIBUTION: 'Coins received',
  COIN_RETURN: 'Returned to company',
  BOUNTY_RESERVE: 'Reserved for a task',
  BOUNTY_RELEASE: 'Returned from a task',
  ADJUSTMENT: 'Adjustment',
  COMPANY_CREDIT: 'Company credit',
  REFERRAL_COIN_DISTRIBUTION: 'Referral coins received',
  REFERRAL_RESERVE: 'Reserved for a referral',
  REFERRAL_RELEASE: 'Returned from a referral',
  REFERRAL_BONUS_TRANSFER: 'Referral bonus',
};
export const txnLabel = (type: string) => TXN_LABEL[type] || titleCase(String(type || '').toLowerCase()) || 'Coins';

// Credit/debit from the viewer's side, exactly as the web's My Wallet table reads a row.
export function txnDirection(t: BountyTxn, userId: string) {
  const credit = t.toWalletId === userId;
  const debit = t.fromWalletId === userId && t.type !== 'BOUNTY_REWARD_TRANSFER';
  return { credit, debit };
}
export function txnBalance(t: BountyTxn, userId: string): number | null {
  if (t.type === 'COIN_DISTRIBUTION' && t.toWalletId === userId) return t.toBalanceAfter ?? null;
  if (t.fromWalletId === userId || t.toWalletId === userId) return t.balanceAfter ?? null;
  return null;
}

// Coins earned this calendar month (India time) — task rewards and referral bonuses paid to me.
const EARNING_TYPES = ['BOUNTY_REWARD_TRANSFER', 'REFERRAL_BONUS_TRANSFER'];
// `month` is YYYY-MM (India time); screens pass useTodayIst().slice(0, 7) so render stays pure.
export function earnedThisMonth(txns: BountyTxn[] | null | undefined, userId: string, month: string = thisMonthIst()) {
  const since = Date.parse(`${month}-01T00:00:00+05:30`);
  return asArray<BountyTxn>(txns)
    .filter((t) => !!t && !t.reversedAt && EARNING_TYPES.includes(t.type) && t.toWalletId === userId && Date.parse(t.createdAt || '') >= since)
    .reduce((s, t) => s + num(t.amount), 0);
}

// ── Redemptions (BountyCoinsProfileCard) ─────────────────────────────────────

// An approved coupon stays live until 20h after it was first revealed. `now` comes from useNow().
export const isLiveApproved = (r: BountyRedemption, now: number = Date.now()) =>
  r.status === 'approved' && (!r.codeExpiresAt || new Date(r.codeExpiresAt).getTime() > now);

export function redemptionState(reqs: BountyRedemption[] | null | undefined, now: number = Date.now()) {
  const list = asArray<BountyRedemption>(reqs).filter(Boolean);
  const readyToUse = list.find((r) => isLiveApproved(r, now)) ?? null;
  const pending = list.some((r) => r.status === 'pending');
  return { readyToUse, hasActive: pending || !!readyToUse, pending };
}

export function redeemError(amount: number, redeemable: number): string | null {
  if (!amount || amount < BOUNTY_REDEEM_MIN) return `Use at least ${coins(BOUNTY_REDEEM_MIN)} coins.`;
  if (amount % BOUNTY_REDEEM_MIN !== 0) return `Use coins in steps of ${coins(BOUNTY_REDEEM_MIN)} (${coins(BOUNTY_REDEEM_MIN)}, ${coins(BOUNTY_REDEEM_MIN * 2)}, ${coins(BOUNTY_REDEEM_MIN * 3)}…).`;
  if (amount > redeemable) return `You have ${coins(redeemable)} coins to use.`;
  return null;
}

// Quick amounts for "Use coins": steps of BOUNTY_REDEEM_MIN up to what I have (at most 4 chips,
// always ending with the most I can use).
export function coinChoices(redeemable: number): number[] {
  const max = Math.floor(num(redeemable) / BOUNTY_REDEEM_MIN) * BOUNTY_REDEEM_MIN;
  if (max < BOUNTY_REDEEM_MIN) return [];
  const steps = [BOUNTY_REDEEM_MIN, BOUNTY_REDEEM_MIN * 2, BOUNTY_REDEEM_MIN * 4].filter((n) => n < max);
  return [...steps, max];
}

export function redemptionStatusMeta(r: BountyRedemption): { label: string; tone: StatusTone } {
  // Once revealed, the code has gone to WhatsApp; it may still be live, so don't call it "Used".
  if (r?.status === 'approved') return { label: r.codeRevealedAt ? 'Coupon sent' : 'Approved', tone: 'done' };
  if (r?.status === 'declined') return { label: 'Rejected', tone: 'failed' };
  if (r?.status === 'pending') return { label: 'Waiting', tone: 'pending' };
  return { label: titleCase(r?.status) || 'Unknown', tone: 'neutral' };
}

// ── Dates ────────────────────────────────────────────────────────────────────

// The app's one way to write dates: "Sat, 25 Oct" (the year only outside this year), and a moment
// "Sat, 25 Oct, 9:42 AM". A bad date from the server must never throw (Intl throws on an invalid
// Date), so the shape is checked first. Pass `today` (useTodayIst()) from render.
const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const deadlineLabel = (ymd: string, today?: string) => (isYmd(ymd) ? dateLabel(ymd, today) : String(ymd ?? ''));
/** The same as deadlineLabel — kept for list rows. */
export const shortDayLabel = deadlineLabel;

export const dateTimeLabel = (iso?: string | null, today?: string) => stampLabel(iso, today) || '—';

// How long an accepted claim ('claimed' or 'in_progress') has before it auto-expires unless the work is
// sent (24h after acceptance; server.js processBountyClaimExpiry).
// `now` comes from useNow() so the countdown ticks and render stays pure.
export function claimTimeLeft(iso?: string | null, now: number = Date.now()) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return 'Expires very soon';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left to send` : `${m}m left to send`;
}
