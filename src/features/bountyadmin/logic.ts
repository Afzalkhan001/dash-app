// Pure helpers for Bounty admin: balances the way the website computes them, the phase-wise reward
// validation (dash.html:12627 create / :12769 edit-reward, the same checks the server makes), the
// ledger's labels and the plain summary that replaces the website's XLSX / PDF report.

import type { BountyTask, BountyTxn } from '@/api/bounty';
import type { AdminClaim, CreatorSummary, LedgerTxn } from '@/api/bountyadmin';
import { num } from '@/features/bounty/logic';
import { titleCase } from '@/lib/format';
import type { StatusTone } from '@/theme/tokens';

// ── Balances ─────────────────────────────────────────────────────────────────
type Funds = { allocated?: number; reserved?: number; spent?: number };
/** What a creator can still fund tasks with (dash.html:12624) — never their earned coins. */
export const creatorAvailable = (w: Funds | null | undefined) => Math.max(0, num(w?.allocated) - num(w?.reserved) - num(w?.spent));
/** What Super Admin may revoke (dash.html:12221): the unused allocated pool only. */
export const revocableOf = (c: Funds | null | undefined) => creatorAvailable(c);
type RefFunds = { referralAllocated?: number; referralReserved?: number; referralSpent?: number };
export const referralAvailable = (c: RefFunds | null | undefined) => Math.max(0, num(c?.referralAllocated) - num(c?.referralReserved) - num(c?.referralSpent));

/** A typed whole number, or null when the field is blank / not a number. */
export function wholeNumber(v: string): number | null {
  const t = String(v ?? '').trim();
  if (!t) return null;
  const n = Math.round(Number(t));
  return Number.isFinite(n) ? n : null;
}
/** Keeps digits only (number fields). */
export const digitsOnly = (v: string) => String(v ?? '').replace(/[^\d]/g, '').slice(0, 7);

// ── Phase-wise coins ─────────────────────────────────────────────────────────
export type PhaseDraft = { name: string; upTo: string; coins: string };
export const newPhase = (i: number): PhaseDraft => ({ name: `Phase ${i + 1}`, upTo: '', coins: '' });

/** The website's phase checks, word for word (dash.html:12631-12643). null = fine. */
export function phaseProblem(phases: PhaseDraft[]): string | null {
  if (!phases.length) return 'Add at least one reward phase, or turn off Phase-wise Coins.';
  let prevUpTo = 0;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i]!;
    const c = Math.round(Number(p.coins));
    if (!c || c <= 0) return `Phase ${i + 1}: coins per person must be a positive number.`;
    const isLast = i === phases.length - 1;
    if (p.upTo !== '' && p.upTo != null) {
      const upTo = Math.round(Number(p.upTo));
      if (!Number.isFinite(upTo) || upTo <= prevUpTo) return `Phase ${i + 1}: “Up to” must be more than the phase before.`;
      prevUpTo = upTo;
    } else if (!isLast) {
      return `Phase ${i + 1}: only the last phase can be left without a limit.`;
    }
  }
  return null;
}

export const cheapestPhase = (phases: PhaseDraft[]) => Math.min(...phases.map((p) => Math.round(Number(p.coins)) || 0));

/** "Up to #50 · 100 coins" for a phase draft or a saved phase. */
export const phaseLine = (p: { upTo?: string | number | null; coins: string | number }) =>
  `${p.upTo !== '' && p.upTo != null ? `Up to #${p.upTo}` : 'No limit'} · ${num(p.coins).toLocaleString('en-IN')} coins`;

/** Saved phases as drafts for the reward editor (dash.html:12754). */
export const phaseDrafts = (t: Pick<BountyTask, 'phases'>): PhaseDraft[] =>
  Array.isArray(t.phases) && t.phases.length
    ? t.phases.map((p, i) => ({ name: String(p?.name || `Phase ${i + 1}`), upTo: p?.upTo == null ? '' : String(p.upTo), coins: p?.coins == null ? '' : String(p.coins) }))
    : [newPhase(0)];

// ── Claims ───────────────────────────────────────────────────────────────────
/** The Inbox / route id of one claim: "<taskId>~<employeeId>" (both url-safe once encoded). */
export const claimKey = (taskId: string, employeeId: string) => `${taskId}~${employeeId}`;
export function parseClaimKey(key: string): { taskId: string; employeeId: string } | null {
  const i = String(key ?? '').lastIndexOf('~');
  if (i <= 0 || i === key.length - 1) return null;
  return { taskId: key.slice(0, i), employeeId: key.slice(i + 1) };
}

const CLAIM_ORDER: Record<string, number> = { submitted: 0, in_progress: 1, claimed: 2, completed: 3, rejected: 4, expired: 5 };
/** Waiting for review first, then in progress, then paid / rejected; newest first inside each. */
export const sortClaims = <C extends Pick<AdminClaim, 'status' | 'submittedAt' | 'claimedAt'>>(list: C[]) =>
  [...list].sort(
    (a, b) =>
      (CLAIM_ORDER[a.status] ?? 9) - (CLAIM_ORDER[b.status] ?? 9) || String(b.submittedAt || b.claimedAt || '').localeCompare(String(a.submittedAt || a.claimedAt || '')),
  );

export const waitingCount = (t: Pick<BountyTask, 'claims'>) => (Array.isArray(t.claims) ? t.claims : []).filter((c) => c?.status === 'submitted').length;

// ── Ledger ───────────────────────────────────────────────────────────────────
/** BOUNTY_TXN_TYPES (dash.html:12005), in plain words. */
export const LEDGER_TYPES: { value: string; label: string }[] = [
  { value: 'COMPANY_CREDIT', label: 'Company top-up' },
  { value: 'COIN_DISTRIBUTION', label: 'Coins given' },
  { value: 'COIN_RETURN', label: 'Returned to company' },
  { value: 'BOUNTY_RESERVE', label: 'Held for a task' },
  { value: 'BOUNTY_RELEASE', label: 'Released from a task' },
  { value: 'BOUNTY_REWARD_TRANSFER', label: 'Task reward paid' },
  { value: 'REDEMPTION', label: 'Coins used' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
  { value: 'REFERRAL_COIN_DISTRIBUTION', label: 'Referral coins given' },
  { value: 'REFERRAL_RESERVE', label: 'Held for a referral' },
  { value: 'REFERRAL_RELEASE', label: 'Released from a referral' },
  { value: 'REFERRAL_BONUS_TRANSFER', label: 'Referral bonus paid' },
];
export const ledgerTypeLabel = (type: string) => LEDGER_TYPES.find((t) => t.value === type)?.label || titleCase(String(type || '').toLowerCase().replace(/_/g, ' ')) || 'Coins';

/** bountyFromLabel (dash.html:12009): a company top-up has no source wallet — show who did it. */
export const ledgerFrom = (t: BountyTxn) => t.fromWalletName || (t.type === 'COMPANY_CREDIT' ? t.performedBy : '') || '—';

/** A row's status pill: cancelled, a reserve's own lifecycle (dash.html:13321), else its status. */
export function ledgerStatus(t: LedgerTxn): { label: string; tone: StatusTone } {
  if (t.reversedAt) return { label: 'Cancelled', tone: 'failed' };
  if (t.type === 'BOUNTY_RESERVE') {
    if (t.status === 'cancelled' || t.status === 'released') return { label: 'Released', tone: 'neutral' };
    if (t.approvedAt || t.status === 'approved') return { label: 'Paid', tone: 'done' };
    return { label: 'Waiting for approval', tone: 'pending' };
  }
  const s = String(t.status || 'completed');
  return s === 'completed' ? { label: 'Done', tone: 'done' } : { label: titleCase(s), tone: 'neutral' };
}

/** BountyReportsView buildSummary (dash.html:13395) + CoinFlowSummary (:12115), from the same ledger, reversed rows left out. */
export function ledgerSummary(rows: LedgerTxn[]) {
  const live = rows.filter((t) => !!t && !t.reversedAt);
  const sum = (type: string) => live.filter((t) => t.type === type).reduce((s, t) => s + num(t.amount), 0);
  const count = (type: string) => live.filter((t) => t.type === type).length;
  return {
    added: sum('COMPANY_CREDIT'),
    distributed: sum('COIN_DISTRIBUTION'),
    reserved: sum('BOUNTY_RESERVE'),
    released: sum('BOUNTY_RELEASE'),
    rewards: sum('BOUNTY_REWARD_TRANSFER'),
    rewardCount: count('BOUNTY_REWARD_TRANSFER'),
    referralPaid: sum('REFERRAL_BONUS_TRANSFER'),
    referralCount: count('REFERRAL_BONUS_TRANSFER'),
    redeemed: sum('REDEMPTION'),
    redeemedCount: count('REDEMPTION'),
  };
}

// ── Creators ─────────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  ceo: 'CEO',
  coo: 'COO',
  hr: 'HR',
  manager: 'Manager',
  admin: 'Admin',
  employee: 'Employee',
  professional: 'Professional',
  it_admin: 'IT Admin',
  app_manager: 'App Manager',
  accounts: 'Accounts',
};
export const roleLabel = (r?: string) => ROLE_LABEL[String(r || '')] || titleCase(String(r || '').replace(/_/g, ' '));

/** Which pools a recipient can receive (server.js:5086-5087): bounty → a creator, referral → a job-opening creator. */
export function poolsOf(c: CreatorSummary, isCreator: boolean) {
  const referral = ['hr', 'super_admin', 'ceo', 'coo'].includes(String(c.role || ''));
  return { bounty: isCreator, referral };
}
