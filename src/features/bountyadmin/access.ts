// Bounty admin gates, ported from dash.html line for line. The server re-checks every write; these
// decide what the phone offers, exactly as the website does.
//
//   BountyHub (dash.html:14869-14899)          which parts of Bounty admin a person sees
//   canManageBountyCreators (:11941)            super_admin, ceo, coo, hr
//   BountyCreatorsCard readOnly (:3240)         app_manager sees the list, never changes it
//   BountyMonthlyCapCard (:14926)               shown to super_admin only
//   canManageRedemptions (:13449)               super_admin, hr, master_admin
//   BountyRedemptionsView actions (:13499)      not app_manager unless appManagerBountyApprovalsOn (:11975)
//   BountyDistribution canRevoke (:12217)       super_admin, master_admin
//   BountyTasksBoard (:12547, :12863-12895)     isAdminRole = master_admin / super_admin; canManage =
//                                               creator or isAdminRole; canReview adds app_manager;
//                                               approve / reject (:13114) adds app_manager with the switch
//   BountyTransactionsView (:13331, :13361)     ledger overseers, the employee filter, Cancel rules
//
// Master Admin's Bounty page is "Company Wallets" (the platform domain), so nothing here opens for it.

import type { BountyTask } from '@/api/bounty';
import type { Tenant } from '@/api/me';
import { isBountyCreator, type NavUser } from '@/lib/access';

/** BountyHub isSuperTier (dash.html:14871). */
export const BOUNTY_SUPER_TIER = ['super_admin', 'ceo', 'coo'];
/** BountyTasksBoard isAdminRole (dash.html:12549) — may manage and review any task. */
export const BOUNTY_ADMIN_ROLES = ['master_admin', 'super_admin'];
/** canManageBountyCreators (dash.html:11941). */
export const BOUNTY_CREATOR_MANAGER_ROLES = ['super_admin', 'ceo', 'coo', 'hr'];
/** canManageRedemptions (dash.html:13449). */
export const REDEMPTION_MANAGER_ROLES = ['super_admin', 'hr', 'master_admin'];
/** BountyTransactionsView isLedgerOverseer (dash.html:13336) — gets the employee filter. */
export const LEDGER_OVERSEER_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo'];
/** Who may revoke a creator's unused coins / cancel a distribution (dash.html:12217, :13353). */
export const COIN_RECALL_ROLES = ['super_admin', 'master_admin'];

const roleOf = (u: NavUser | null | undefined) => String(u?.role ?? '');

/** bountySystemOn (dash.html:11969): absent means on. */
export const bountySystemOn = (t: Tenant | null | undefined) => t?.bountyEnabled !== false;

export const canManageBountyCreators = (u: NavUser | null | undefined) => BOUNTY_CREATOR_MANAGER_ROLES.includes(roleOf(u));
export const canManageRedemptions = (u: NavUser | null | undefined) => REDEMPTION_MANAGER_ROLES.includes(roleOf(u));

export type BountyAdminGates = {
  /** The company has Bounty on and this is a company person (not Master Admin). */
  on: boolean;
  superTier: boolean;
  overseer: boolean;
  /** master_admin / super_admin: manage and review any task. */
  adminRole: boolean;
  creator: boolean;
  /** appManagerBountyApprovalsOn — the App Manager may approve and reject. */
  amSwitch: boolean;
  /** "Coin Distribution" tab (super-tier). The server lets only super_admin / master_admin send. */
  distribute: boolean;
  revoke: boolean;
  /** "Bounty Creators" tab; `editCreators` false = read-only (app_manager). */
  creators: boolean;
  editCreators: boolean;
  /** "Monthly Earning Cap" card (super_admin only). */
  cap: boolean;
  /** "Bounty Tasks" admin side: the person can post, manage or review tasks. */
  tasks: boolean;
  create: boolean;
  /** "My Wallet" (creators or super-tier). */
  wallet: boolean;
  /** "Redemption Requests" tab, and whether its Approve / Decline show. */
  redemptions: boolean;
  decideRedemptions: boolean;
  /** "Transactions" / "My Coin History" tab. `ledgerAll` = the company's ledger (overseers). */
  ledger: boolean;
  ledgerAll: boolean;
  ledgerEmployeeFilter: boolean;
  /** Cancel a COIN_DISTRIBUTION (dash.html:13353). */
  cancelDistribution: boolean;
  /** "Reports" (master, super-tier, overseer) — the phone shows a plain summary. */
  summary: boolean;
};

export function bountyAdminGates(u: NavUser | null | undefined, t: Tenant | null | undefined): BountyAdminGates {
  const role = roleOf(u);
  const isMaster = role === 'master_admin';
  const superTier = BOUNTY_SUPER_TIER.includes(role);
  const overseer = role === 'app_manager';
  const creator = isBountyCreator(u, t);
  const amSwitch = !!t?.appManagerBountyApprovalsOn;
  const on = !!u && !isMaster && bountySystemOn(t);
  const g = (v: boolean) => on && v;
  return {
    on,
    superTier,
    overseer,
    adminRole: BOUNTY_ADMIN_ROLES.includes(role),
    creator,
    amSwitch,
    distribute: g(superTier),
    revoke: g(COIN_RECALL_ROLES.includes(role)),
    creators: g(canManageBountyCreators(u) || overseer),
    editCreators: g(canManageBountyCreators(u) && !overseer),
    cap: g(role === 'super_admin'),
    tasks: g(creator || superTier || overseer || BOUNTY_ADMIN_ROLES.includes(role)),
    create: g(creator),
    wallet: g(creator || superTier),
    redemptions: g(canManageRedemptions(u) || overseer),
    decideRedemptions: g((canManageRedemptions(u) && !overseer) || (overseer && amSwitch)),
    ledger: g(superTier || creator || overseer),
    ledgerAll: g(superTier || overseer),
    ledgerEmployeeFilter: g(LEDGER_OVERSEER_ROLES.includes(role)),
    cancelDistribution: g(COIN_RECALL_ROLES.includes(role)),
    summary: g(superTier || overseer),
  };
}

/** Whether "Bounty admin" opens at all for this person (any admin part of BountyHub besides the board). */
export const canOpenBountyAdmin = (g: BountyAdminGates) =>
  g.on && (g.distribute || g.creators || g.wallet || g.redemptions || g.ledger || g.summary || g.create || g.tasks);

// ── One task (BountyTasksBoard row actions, dash.html:12863-12895) ──────────
const ACTIVE = ['claimed', 'in_progress', 'submitted'];
type TaskLike = Pick<BountyTask, 'creatorId' | 'status' | 'cancelledAt' | 'deadline'> & { claims?: { status: string }[] };

/** canManage: the task's creator, or Master / Super Admin. */
export const canManageTask = (t: TaskLike, u: NavUser | null | undefined) => !!u && (String(t.creatorId) === String(u.id) || BOUNTY_ADMIN_ROLES.includes(roleOf(u)));
/** canReview: canManage, or the App Manager (view only). */
export const canReviewTask = (t: TaskLike, u: NavUser | null | undefined) => canManageTask(t, u) || roleOf(u) === 'app_manager';
/** Approve & pay / Reject on a submitted claim (dash.html:13127, server.js:6563 / 6592). */
export const canDecideClaim = (t: TaskLike, u: NavUser | null | undefined, tenant: Tenant | null | undefined) =>
  canManageTask(t, u) || (roleOf(u) === 'app_manager' && !!tenant?.appManagerBountyApprovalsOn);

export const hasActiveClaims = (t: TaskLike) => (Array.isArray(t.claims) ? t.claims : []).some((c) => !!c && ACTIVE.includes(c.status));

/** dash.html:12891: Remind — open, not cancelled, deadline not passed. `expired` from taskExpired(t, today). */
export const canRemindTask = (t: TaskLike, u: NavUser | null | undefined, expired: boolean) => canManageTask(t, u) && !t.cancelledAt && t.status === 'open' && !expired;
/** dash.html:12892: Edit — not cancelled. */
export const canEditTask = (t: TaskLike, u: NavUser | null | undefined) => canManageTask(t, u) && !t.cancelledAt;
/** dash.html:12893-12894: Extend / Cancel — not cancelled, and open or with active claims. */
export const canExtendOrCancel = (t: TaskLike, u: NavUser | null | undefined) =>
  canManageTask(t, u) && !t.cancelledAt && (t.status === 'open' || hasActiveClaims(t));

/** dash.html:13346 canCancelType — only a COIN_DISTRIBUTION, not yet reversed (COMPANY_CREDIT is Master Admin's). */
export const canCancelTxn = (g: BountyAdminGates, t: { type: string; reversedAt?: string | null }) => g.cancelDistribution && !t.reversedAt && t.type === 'COIN_DISTRIBUTION';
