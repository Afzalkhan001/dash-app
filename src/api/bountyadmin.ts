// Bounty administration endpoints (server.js ~L5032-6790), the admin half of the website's BountyHub
// (dash.html:14869): the company wallet, coin distribution and revoke, creators' balances, the admin
// task board (create, edit, reward, remind, review, cancel), use-coins approvals and the ledger.
// The employee half (board, claims, my wallet, redeem) stays in src/api/bounty.ts.
//
// Every write sends the same body as the website; the API client adds `performedById` (the server
// overwrites it with the session user anyway). Coins only ever move inside the server's Postgres
// functions — the app never computes or sends a balance.
//
// Cache keys:
//   ['inbox', 'bounty-claim', uid]      the board's light rows (GET /bounty_tasks) — shared with the
//                                       Inbox kind, so its poll and pull to refresh cover the board too
//   ['inbox', 'bounty-coins', uid]      the company's use-coins requests — shared with the Inbox kind
//   ['bountyadmin', 'task', uid, id]    one task WITH submissions (never persisted: data URLs)
//   ['bountyadmin', …]                  company wallet, creators summary, ledger

import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { BountyClaim, BountyPhase, BountyRedemption, BountySubmission, BountySubmissionType, BountyTask, BountyTxn } from '@/api/bounty';
import { api, ApiRequestError, isApiError, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

// ── Types ────────────────────────────────────────────────────────────────────
/** GET /bounty/wallet/company (server.js:5032). */
export type CompanyWallet = { id?: string; tenantId?: string; name?: string; available?: number; totalAdded?: number; totalDistributed?: number };

/** GET /bounty/creators-summary row (server.js:5289): bounty creators + job-opening creators. */
export type CreatorSummary = {
  id: string;
  name: string;
  employeeNumber?: string;
  role?: string;
  allocated?: number;
  reserved?: number;
  spent?: number;
  earned?: number;
  available?: number;
  referralAllocated?: number;
  referralReserved?: number;
  referralSpent?: number;
  referralEarned?: number;
  tasksCreated?: number;
};

export type AdminClaim = BountyClaim & { submission?: BountySubmission; approvedAt?: string };
/** GET /bounty_tasks/:id — the full task with every claim's submission (creator, admin, app_manager). */
export type AdminTask = Omit<BountyTask, 'claims'> & { claims?: AdminClaim[]; referenceFileData?: string; lastRemindedAt?: string | null };

/** GET /bounty_tasks/:id/remind-preview (server.js:5843). */
export type RemindPreview = {
  canSend: boolean;
  blockedReason?: string;
  willRemind: number;
  viaWhatsApp: number;
  emailOnly: number;
  noContact: number;
  alreadyTookPart: number;
  audience?: { departments: string[]; professionalTypes: string[] };
  lastRemindedAt?: string | null;
};
export type RemindResult = { sent?: number; failed?: number; noContact?: number; message?: string };

export type LedgerTxn = BountyTxn & { tenantId?: string; approvedAt?: string; approvedBy?: string };
export type LedgerFilters = { dateFrom?: string; dateTo?: string; type?: string; employeeId?: string; direction?: '' | 'credit' | 'debit' };

export type CompanyRedemption = BountyRedemption & { tenantId?: string; declinedBy?: string };

/** The fields the create form sends (dash.html:12645 create()). */
export type NewTaskInput = {
  title: string;
  desc: string;
  category: string;
  deptId: string;
  deadline: string;
  reward: number;
  eligibility: string;
  targetProfType: string;
  submissionType: BountySubmissionType;
  requiresApproval: boolean;
  maxAccepts: number | null;
  maxAttachments: string;
  phaseWiseCoins: boolean;
  phases: { name: string; upTo: string; coins: string }[];
  referenceFileData: string;
  referenceFileName: string;
  referenceUrl: string;
};

/** PUT /bounty_tasks/:id plain fields (dash.html:12801 confirmEdit). */
export type EditTaskInput = {
  title: string;
  desc: string;
  category: string;
  deptId: string;
  deadline: string;
  eligibility: string;
  targetProfType: string;
  maxAccepts: number | null;
  referenceUrl: string;
};

/** POST /bounty_tasks/:id/edit-reward (dash.html:12769). */
export type RewardInput = { phaseWiseCoins: false; reward: number } | { phaseWiseCoins: true; phases: { name: string; upTo: string; coins: string }[] };

export type { BountyPhase };

// ── Helpers ──────────────────────────────────────────────────────────────────
const arr = <T>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : []);
const enc = encodeURIComponent;

/** A write that resolves the server's answer or throws its own words. */
async function write<T = { ok: true }>(p: Promise<unknown>): Promise<T> {
  const r = await p;
  if (isApiError(r)) throw new ApiRequestError(r);
  return r as T;
}

function useIds() {
  const uid = useSession((s) => s.user?.id) ?? '';
  const tenantId = useSession((s) => s.user?.tenantId) ?? '';
  return { uid, tenantId };
}

export const bountyAdminKeys = {
  tasks: (uid: string) => ['inbox', 'bounty-claim', uid] as const,
  redemptions: (uid: string) => ['inbox', 'bounty-coins', uid] as const,
  task: (uid: string, id: string) => ['bountyadmin', 'task', uid, id] as const,
  company: (uid: string) => ['bountyadmin', 'company', uid] as const,
  creators: (uid: string) => ['bountyadmin', 'creators', uid] as const,
  ledger: (uid: string, f: LedgerFilters) => ['bountyadmin', 'ledger', uid, f.dateFrom ?? '', f.dateTo ?? '', f.type ?? '', f.employeeId ?? '', f.direction ?? ''] as const,
};

// ── Reads ────────────────────────────────────────────────────────────────────
/** The board's light rows (submissions stripped), the website's load() (dash.html:12611). */
export function useAdminTasks(enabled = true) {
  const { uid, tenantId } = useIds();
  return useQuery({
    queryKey: bountyAdminKeys.tasks(uid),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => arr<BountyTask>(await unwrap(api.get(`/bounty_tasks${tenantId ? `?tenantId=${enc(tenantId)}` : ''}`, signal))),
  });
}

/** One task with every submission. Never persisted: older submissions carry files as data URLs. */
export function useAdminTask(id: string, enabled = true) {
  const { uid } = useIds();
  return useQuery({
    queryKey: bountyAdminKeys.task(uid, id),
    enabled: enabled && !!uid && !!id,
    queryFn: ({ signal }) => unwrap(api.get<AdminTask>(`/bounty_tasks/${enc(id)}`, signal)),
    meta: { persist: false },
    gcTime: 5 * 60_000,
  });
}

export function useCompanyWallet(enabled = true) {
  const { uid, tenantId } = useIds();
  return useQuery({
    queryKey: bountyAdminKeys.company(uid),
    enabled: enabled && !!uid && !!tenantId,
    queryFn: ({ signal }) => unwrap(api.get<CompanyWallet>(`/bounty/wallet/company?tenantId=${enc(tenantId)}`, signal)),
  });
}

export function useCreatorsSummary(enabled = true) {
  const { uid, tenantId } = useIds();
  return useQuery({
    queryKey: bountyAdminKeys.creators(uid),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) =>
      arr<CreatorSummary>(await unwrap(api.get(`/bounty/creators-summary${tenantId ? `?tenantId=${enc(tenantId)}` : ''}`, signal))).filter(
        (c) => !!c && typeof c === 'object' && !!c.id,
      ),
  });
}

/** The company's use-coins requests, newest first (dash.html:13464: filtered to my company).
 *  Never persisted: approved rows carry other people's live voucher coupon codes. */
export function useCompanyRedemptions(enabled = true) {
  const { uid, tenantId } = useIds();
  return useQuery({
    queryKey: bountyAdminKeys.redemptions(uid),
    enabled: enabled && !!uid,
    meta: { persist: false },
    queryFn: async ({ signal }) =>
      arr<CompanyRedemption>(await unwrap(api.get('/bounty_redemptions', signal)))
        .filter((r) => !!r && typeof r === 'object' && !!r.id && (!tenantId || !r.tenantId || r.tenantId === tenantId))
        .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || ''))),
  });
}

/** The ledger (server.js:5506 scopes it by the caller: overseers see the company, others their own rows). */
export function useLedger(f: LedgerFilters, enabled = true) {
  const { uid, tenantId } = useIds();
  return useQuery({
    queryKey: bountyAdminKeys.ledger(uid, f),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(f)) if (v) q.set(k, String(v));
      if (tenantId) q.set('tenantId', tenantId);
      return arr<LedgerTxn>(await unwrap(api.get(`/bounty_transactions?${q.toString()}`, signal))).filter((t) => !!t && typeof t === 'object' && !!t.id);
    },
    staleTime: 30_000,
  });
}

// ── Writes (same bodies as the website) ─────────────────────────────────────
export const distributeCoins = (employeeId: string, bountyAmount: number, referralAmount: number, reason: string) =>
  write(api.post('/bounty/distribute', { employeeId, bountyAmount, referralAmount, reason }));

export const revokeCoins = (employeeId: string, amount: number, reason: string) => write(api.post('/bounty/revoke-from-creator', { employeeId, amount, reason }));

export const returnCoinsToCompany = (amount: number, reason: string) => write(api.post('/bounty/return-to-company', { amount, reason }));

export const reverseTxn = (id: string, reason: string) => write(api.post(`/bounty_transactions/${enc(id)}/reverse`, { reason }));

export const createBountyTask = (input: NewTaskInput, creatorId: string) => write<BountyTask>(api.post('/bounty_tasks', { ...input, creatorId }));

export const editBountyTask = (id: string, input: Partial<EditTaskInput>) => write<BountyTask>(api.put(`/bounty_tasks/${enc(id)}`, input));

export const editBountyReward = (id: string, input: RewardInput) => write<BountyTask>(api.post(`/bounty_tasks/${enc(id)}/edit-reward`, input));

export const fetchRemindPreview = (id: string) => write<RemindPreview>(api.get(`/bounty_tasks/${enc(id)}/remind-preview`));

export const sendRemind = (id: string) => write<RemindResult>(api.post(`/bounty_tasks/${enc(id)}/remind`, {}));

export const approveClaim = (taskId: string, employeeId: string) => write<BountyTask>(api.post(`/bounty_tasks/${enc(taskId)}/approve`, { employeeId }));

export const rejectClaim = (taskId: string, employeeId: string, reason: string, allowResubmit: boolean) =>
  write<BountyTask>(api.post(`/bounty_tasks/${enc(taskId)}/reject`, { employeeId, reason, allowResubmit }));

export const cancelBountyTask = (id: string, reason: string) => write<BountyTask>(api.post(`/bounty_tasks/${enc(id)}/cancel`, { reason }));

export const approveRedemption = (id: string, amazonLink: string, couponCode: string) =>
  write<{ request?: CompanyRedemption }>(api.post(`/bounty_redemptions/${enc(id)}/approve`, { amazonLink, couponCode }));

export const declineRedemption = (id: string, reason: string) => write<{ request?: CompanyRedemption }>(api.post(`/bounty_redemptions/${enc(id)}/decline`, { reason }));

/** A fresh 2-minute link to one submitted file (or the inline data URL of an older submission). */
export const fetchClaimFileLink = (taskId: string, employeeId: string, index: number) =>
  write<{ url: string; fileName?: string; inline?: boolean }>(api.get(`/bounty_tasks/${enc(taskId)}/submissions/${enc(employeeId)}/files/${index}/download`));

/** After any bounty admin write: the admin caches, the two Inbox queues and the employee screens' caches. */
export function useInvalidateBountyAdmin() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['bountyadmin'] }),
      qc.invalidateQueries({ queryKey: ['inbox', 'bounty-claim'] }),
      qc.invalidateQueries({ queryKey: ['inbox', 'bounty-coins'] }),
      qc.invalidateQueries({ queryKey: ['bounty'] }),
    ]);
}
