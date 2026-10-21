// "My team" for the work screens, from GET /users + GET /departments, with the web's two scopes
// (features/work/access.ts): the Team tasks team (ManagerTasksView) and the review team (RequestsView).

import { useMyTenant } from '@/api/me';
import { useWorkDepts, useWorkUsers, type WorkUser } from '@/api/work';
import { ADMIN_TYPE_ROLES, reviewTeamNames, taskTeam } from '@/features/work/access';
import { useAccess } from '@/lib/use-access';

export function useWorkTeam(enabled = true) {
  const access = useAccess();
  const me = access.user;
  const usersQ = useWorkUsers(enabled && !!me);
  const deptsQ = useWorkDepts(enabled && !!me);
  const users = Array.isArray(usersQ.data) ? usersQ.data : [];
  const depts = Array.isArray(deptsQ.data) ? deptsQ.data : [];
  const meScope = me ? { id: me.id, role: me.role, name: me.name, dept: me.dept } : null;
  // The web's `employees` can include the manager themself (no RM / AM set, same department), and
  // isMine counts their tasks; the picker and the head count leave them out.
  const fullTeam: WorkUser[] = meScope ? taskTeam(meScope, users, depts) : [];
  const team = fullTeam.filter((u) => u.id !== meScope?.id);
  const reviewNames = meScope ? reviewTeamNames(meScope, users, depts) : new Set<string>();
  return {
    access,
    me,
    users,
    depts,
    team,
    teamNames: new Set(fullTeam.map((u) => u.name)),
    reviewNames,
    adminType: !!me && ADMIN_TYPE_ROLES.includes(me.role),
    loading: usersQ.isPending || deptsQ.isPending,
    error: (usersQ.isError && !usersQ.data) || (deptsQ.isError && !deptsQ.data) ? (usersQ.error ?? deptsQ.error) : null,
    refetch: () => Promise.all([usersQ.refetch(), deptsQ.refetch()]),
  };
}

/**
 * Whether the gate is still being worked out: the person's HR access and the company switches
 * (until they load the website's sidebar test has no switches to apply, so a screen must not decide).
 */
export function useGateReady() {
  const access = useAccess();
  const tenantQ = useMyTenant();
  const waiting = access.loading || (!!access.user?.tenantId && tenantQ.isPending);
  return { access, ready: !waiting };
}
