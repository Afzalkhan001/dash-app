// Who opens My tasks (/tasks and a task): the website's sidebar has "My Tasks" / "Tasks" for the role
// (webNav mytasks | tasks, company switches included), or "My Team Tasks" because I have Team Roster
// tasks (trmytasks — the screen's Team tasks switch). The same rule as the More tile. The Team Roster
// part needs my tasks loaded, so `ready` is false until then for roles without the first two that Team Roster reaches.

import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { rosterReachable } from '@/features/teamboard/access';
import { useTeamTasksGate } from '@/features/teamboard/use-board';
import { webNav } from '@/lib/access';

export function useTasksRouteGate() {
  const user = useSession((s) => s.user);
  const tenant = useMyTenant().data;
  const team = useTeamTasksGate();
  const byRole = webNav(user, 'mytasks', tenant) || webNav(user, 'tasks', tenant);
  // A role Team Roster never reaches has nothing to wait for (its tasks query never runs).
  return { ready: byRole || !rosterReachable(user) || team.ready, allow: byRole || team.allowed };
}
