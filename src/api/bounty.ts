// Bounty System endpoints (server.js ~L5017-6900). Shapes come from the handlers and from
// sql/bounty_coins_tables.sql (wallet + ledger rows). Every coin movement happens server-side in a
// Postgres function; the app only reads balances/ledger rows and calls the action routes, exactly
// like the website (dash.html BountyHub ~L14869).
//
// Heavy payloads stay OUT of TanStack Query on purpose: the query cache is persisted to disk, and
// a submission or reference file can be a multi-MB data URL. Those are fetched on demand with the
// plain functions at the bottom of this file.

import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

export type BountySubmissionType = 'text' | 'link' | 'image' | 'video' | 'document';
export type BountyClaimStatus = 'claimed' | 'in_progress' | 'submitted' | 'completed' | 'rejected' | 'expired';

export type BountyPhase = { name?: string; upTo?: number | string | null; coins: number };

export type BountyClaim = {
  employeeId: string;
  employeeName?: string;
  status: BountyClaimStatus | string;
  reward?: number | null; // locked in at acceptance (phase-wise tasks)
  position?: number | null;
  claimedAt?: string;
  claimExpiresAt?: string;
  startedAt?: string;
  submittedAt?: string;
  submitNote?: string;
  hasSubmission?: boolean;
  rejectReason?: string;
};

// GET /bounty_tasks row (bountyTaskListRow): submissions and the reference file are stripped.
export type BountyTask = {
  id: string;
  title: string;
  desc?: string;
  category?: string;
  deptId?: string;
  deptIds?: string[];
  deadline?: string; // YYYY-MM-DD
  reward: number;
  eligibility?: string;
  targetProfType?: string;
  submissionType?: BountySubmissionType;
  requiresApproval?: boolean;
  maxAccepts?: number | null;
  maxAttachments?: number | null;
  phaseWiseCoins?: boolean;
  phases?: BountyPhase[];
  referenceFileName?: string;
  referenceUrl?: string;
  hasReferenceFile?: boolean;
  creatorId?: string;
  creatorName?: string;
  tenantId?: string | null;
  status: 'open' | 'closed' | string;
  cancelledAt?: string | null;
  cancelReason?: string;
  createdAt?: string;
  claims?: BountyClaim[];
};

export type BountyWallet = {
  id?: string;
  name?: string;
  allocated?: number;
  reserved?: number;
  spent?: number;
  earned?: number;
  redeemed?: number;
  available?: number;
  referralAllocated?: number;
  referralReserved?: number;
  referralSpent?: number;
  referralEarned?: number;
};

export type BountyTxn = {
  id: string;
  type: string;
  amount: number;
  fromWalletId?: string;
  fromWalletName?: string;
  toWalletId?: string;
  toWalletName?: string;
  taskId?: string;
  taskName?: string;
  reason?: string;
  performedBy?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  toBalanceAfter?: number;
  status?: string;
  reversedAt?: string;
  createdAt?: string;
};

export type BountyRedemption = {
  id: string;
  userId: string;
  userName?: string;
  coins: number;
  status: 'pending' | 'approved' | 'declined' | string;
  requestedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  amazonLink?: string;
  couponCode?: string;
  codeRevealedAt?: string;
  codeExpiresAt?: string;
  declineReason?: string;
  declinedAt?: string;
};

export type BountyLeaderRow = {
  rank: number;
  employeeId: string;
  name: string;
  hasAvatar?: boolean;
  source?: string; // 'users' | 'whitelist' — which table the lazy avatar lives in
  total: number;
};
export type BountyLeaderboard = { top: BountyLeaderRow[]; me: BountyLeaderRow | null; totalRanked: number };

// GET /bounty_tasks/my_claims — accepted and not yet started (status 'claimed').
export type BountyClaimReminder = {
  id: string;
  title: string;
  category: string;
  reward: number;
  deadline: string;
  claimedAt: string;
  claimExpiresAt: string;
};

export type BountyCapStatus = { cap: number; earned: number; capped: boolean };

export type BountySubmissionFile = { fileData: string; fileName?: string };
export type BountySubmission = {
  text?: string;
  linkUrl?: string;
  links?: string[];
  fileData?: string;
  fileName?: string;
  files?: BountySubmissionFile[];
};
export type BountyMySubmission = BountyClaim & {
  submission?: BountySubmission;
  submissionType?: BountySubmissionType;
  taskTitle?: string;
};

export type Department = { id: string; name: string };

// The minimum redeemable amount (server.js BOUNTY_REDEEM_MIN); requests must be multiples of it.
export const BOUNTY_REDEEM_MIN = 500;

const arr = <T>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : []);

function useIds() {
  const userId = useSession((s) => s.user?.id);
  const tenantId = useSession((s) => s.user?.tenantId);
  return { userId, tenantId };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export function useBountyTasks(enabled = true) {
  const { userId, tenantId } = useIds();
  return useQuery({
    queryKey: ['bounty', 'tasks', userId],
    enabled: enabled && !!userId,
    // The server scopes to the caller's own company regardless; the web still sends it.
    queryFn: async ({ signal }) =>
      arr<BountyTask>(await unwrap(api.get(`/bounty_tasks${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`, signal))),
  });
}

export function useBountyWallet(enabled = true) {
  const { userId } = useIds();
  return useQuery({
    queryKey: ['bounty', 'wallet', userId],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => unwrap(api.get<BountyWallet>(`/bounty/wallet/${userId}`, signal)),
  });
}

// The server limits this to rows the caller's own wallet is one side of (unless they oversee the ledger).
export function useBountyTransactions(enabled = true) {
  const { userId } = useIds();
  return useQuery({
    queryKey: ['bounty', 'txns', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) =>
      arr<BountyTxn>(await unwrap(api.get(`/bounty_transactions?employeeId=${encodeURIComponent(userId!)}`, signal))),
  });
}

// The list route returns the whole company's requests; like the website, keep only my own.
export function useMyBountyRedemptions(enabled = true) {
  const { userId } = useIds();
  return useQuery({
    queryKey: ['bounty', 'redemptions', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) =>
      arr<BountyRedemption>(await unwrap(api.get('/bounty_redemptions', signal)))
        .filter((r) => r.userId === userId)
        .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || '')),
  });
}

export function useBountyLeaderboard(limit = 20, enabled = true) {
  const { userId, tenantId } = useIds();
  return useQuery({
    queryKey: ['bounty', 'leaderboard', userId, limit],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const q = new URLSearchParams();
      if (tenantId) q.set('tenantId', tenantId);
      q.set('employeeId', userId!);
      q.set('limit', String(limit));
      const r = await unwrap(api.get<BountyLeaderboard>(`/bounty/leaderboard?${q.toString()}`, signal));
      return { top: arr<BountyLeaderRow>(r.top), me: r.me ?? null, totalRanked: Number(r.totalRanked) || 0 };
    },
    staleTime: 60_000,
  });
}

export function useBountyClaimReminders(enabled = true) {
  const { userId } = useIds();
  return useQuery({
    queryKey: ['bounty', 'my-claims', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => arr<BountyClaimReminder>(await unwrap(api.get('/bounty_tasks/my_claims', signal))),
  });
}

export function useBountyCapStatus(enabled = true) {
  const { userId } = useIds();
  return useQuery({
    queryKey: ['bounty', 'cap', userId],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => unwrap(api.get<BountyCapStatus>(`/bounty/monthly-status/${userId}`, signal)),
    staleTime: 5 * 60_000,
  });
}

// Department names for the "kept for a department" label.
export function useBountyDepartments(enabled = true) {
  const { userId } = useIds();
  return useQuery({
    queryKey: ['bounty', 'departments', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) =>
      arr<Department>(await unwrap(api.get('/departments', signal))).map((d) => ({ id: String(d.id), name: String(d.name || '') })),
    staleTime: 30 * 60_000,
  });
}

// ── Actions (same bodies as the website; the server takes the claimant from the session) ──────

const me = () => useSession.getState().user;

// No claim yet: accept AND submit in one call (the website's only claim path since claim_and_submit).
export const claimAndSubmitBounty = (taskId: string, submitNote: string, submission: BountySubmission) =>
  api.post<BountyTask & { autoApprovalPending?: boolean; autoApprovalError?: string }>(
    `/bounty_tasks/${encodeURIComponent(taskId)}/claim_and_submit`,
    { userId: me()?.id, submitNote, submission },
  );

// Finishing an existing claim (legacy 'claimed'/'in_progress', or one sent back for revision).
export const submitBountyClaim = (taskId: string, submitNote: string, submission: BountySubmission) =>
  api.post<BountyTask & { autoApprovalPending?: boolean; autoApprovalError?: string }>(
    `/bounty_tasks/${encodeURIComponent(taskId)}/submit`,
    { userId: me()?.id, submitNote, submission },
  );

// Legacy claims accepted under the old Claim → Start → Submit flow.
export const startBountyClaim = (taskId: string) =>
  api.post<BountyTask>(`/bounty_tasks/${encodeURIComponent(taskId)}/start`, { userId: me()?.id });

export const requestBountyRedemption = (coins: number) =>
  api.post<BountyRedemption>('/bounty_redemptions', { userId: me()?.id, userName: me()?.name, coins });

// First reveal emails/WhatsApps the coupon and starts its 20-hour window.
export const revealBountyRedemption = (id: string) =>
  api.post<{ request?: BountyRedemption }>(`/bounty_redemptions/${encodeURIComponent(id)}/reveal`, { userId: me()?.id });

// On-demand (never cached): these can carry large data URLs.
export const fetchBountyReference = (taskId: string) =>
  api.get<{ fileData: string; fileName: string }>(`/bounty_tasks/${encodeURIComponent(taskId)}/reference`);

export const fetchMyBountySubmission = (taskId: string) =>
  api.get<BountyMySubmission>(`/bounty_tasks/${encodeURIComponent(taskId)}/my_submission`);

// A fresh 2-minute download link (or the inline data URL of an older submission).
export const fetchBountySubmissionFileLink = (taskId: string, employeeId: string, index: number) =>
  api.get<{ url: string; fileName?: string; inline?: boolean }>(
    `/bounty_tasks/${encodeURIComponent(taskId)}/submissions/${encodeURIComponent(employeeId)}/files/${index}/download`,
  );
