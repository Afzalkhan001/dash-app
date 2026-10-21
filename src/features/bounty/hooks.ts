// Screen-level helpers for Bounty: label lookups for a task (department / professional category)
// and folding the one task row an action returns back into the cached board — the website does the
// same instead of re-downloading every task after each click (dash.html BountyTasksBoard act()).

import { useQueryClient } from '@tanstack/react-query';

import { type BountyTask, useBountyDepartments } from '@/api/bounty';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';

import { asArray, canClaimBounty, isBountyCreator, profTypeLabel, taskDepartments } from './logic';

export function useBountyLabels() {
  const user = useSession((s) => s.user);
  const tenant = useMyTenant().data ?? null;
  const depts = asArray<{ id: string; name: string }>(useBountyDepartments().data);
  const deptName = (t: BountyTask) => {
    const ids = taskDepartments(t);
    if (!ids.length) return null;
    const names = ids.map((id) => depts.find((d) => d?.id === id)?.name).filter(Boolean);
    return names.length ? names.join(', ') : 'one department';
  };
  const profLabel = (t: BountyTask) => (t.targetProfType ? profTypeLabel(t.targetProfType, tenant) : null);
  return {
    user,
    tenant,
    deptName,
    profLabel,
    canClaim: canClaimBounty(user, tenant),
    isCreator: isBountyCreator(user, tenant),
  };
}

type ActionRow = BountyTask & { ok?: boolean; autoApprovalPending?: boolean; autoApprovalError?: string };

export function useMergeBountyTask() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  return (r: ActionRow | null | undefined) => {
    // A persisted cache from an older build may not hold an array: then just refetch the board.
    const cached = qc.getQueryData<unknown>(['bounty', 'tasks', userId]);
    if (r && r.id && Array.isArray(cached)) {
      const { ok: _ok, autoApprovalPending: _p, autoApprovalError: _e, ...row } = r;
      qc.setQueryData<BountyTask[]>(['bounty', 'tasks', userId], (ts) => (Array.isArray(ts) ? ts.map((t) => (t?.id === row.id ? row : t)) : ts));
    } else {
      void qc.invalidateQueries({ queryKey: ['bounty', 'tasks'] });
    }
    // Cheap reads whose numbers an action can change.
    void qc.invalidateQueries({ queryKey: ['bounty', 'my-claims'] });
    void qc.invalidateQueries({ queryKey: ['bounty', 'wallet'] });
    void qc.invalidateQueries({ queryKey: ['bounty', 'txns'] });
    void qc.invalidateQueries({ queryKey: ['bounty', 'cap'] });
    void qc.invalidateQueries({ queryKey: ['bounty', 'leaderboard'] });
  };
}
