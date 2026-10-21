// Team board gates, ported from dash.html (pure functions):
//
//   canSeeTeamBoard  canSeeTeamRosterNav (11985) through lib/access webNav('teamroster'): the company's
//                    teamRosterEnabled AND (a Team-Roster department I administer OR one I am a granted
//                    manager of). Super Admin passes the server's check on any department, but the
//                    website's sidebar still needs the admin / grant, so the app does too (parity).
//   canSeeTeamTasks  canSeeMyTeamTasksNav (11995) through webNav('trmytasks'): at least one Team Roster
//                    task assigned to me. No tenant switch on the website either.
//   boardDepts       TeamRosterHub's department list (13565–13571): departments I administer first,
//                    then the ones I am only a granted manager of, each Team-Roster enabled.
//
// The website loads the data these need once at boot (GET /departments, /team-roster/managers?mine=1,
// /team-roster/tasks?mine=1 — 30303). The app does the same from the Inbox plug-in's hook
// (features/teamboard/inbox), and the pure plug-in functions (More, tour) read that cache through
// gateSnapshot(): never on a guess — with nothing loaded yet, nothing is shown.

import { tbKeys, type TrDept, type TrTask } from '@/api/teamboard';
import { queryClient } from '@/api/query';
import type { Access } from '@/lib/use-access';

/** Roles the server's EMPLOYEE_ROLES gate lets into /team-roster at all (team_roster.js:49). */
const NO_ROSTER_ROLES = ['visitor_manager', 'announcement_viewer'];

/** Whether to ask the server at all: a staff member of a company the routes would answer. */
export function rosterReachable(user: { role?: string; tenantId?: string | null } | null | undefined) {
  return !!user && !!user.tenantId && typeof user.role === 'string' && !NO_ROSTER_ROLES.includes(user.role);
}

export type BoardDept = TrDept & { admin: boolean };

/** TeamRosterHub's "my departments": admin ones first, then manager-only (13565–13571). */
export function boardDepts(userId: string | undefined, depts: TrDept[] | undefined, grantIds: string[] | undefined): BoardDept[] {
  if (!userId) return [];
  const list = Array.isArray(depts) ? depts : [];
  const grants = Array.isArray(grantIds) ? grantIds : [];
  const admin = list.filter((d) => d.adminId === userId && d.teamRosterEnabled);
  const managerOnly = list.filter((d) => grants.includes(d.id) && d.teamRosterEnabled && !admin.some((a) => a.id === d.id));
  return [...admin.map((d) => ({ ...d, admin: true })), ...managerOnly.map((d) => ({ ...d, admin: false }))];
}

/** canSeeTeamRosterNav, exactly (lib/access webNav adds the company switch and the sidebar rules). */
export function canSeeTeamBoard(access: Access, depts: TrDept[] | undefined, grantIds: string[] | undefined) {
  if (!Array.isArray(depts)) return false;
  return access.web('teamroster', {
    departments: depts,
    teamRosterManagerDeptIds: Array.isArray(grantIds) ? grantIds : [],
  });
}

/** canSeeMyTeamTasksNav, exactly: I have at least one Team Roster task. */
export function canSeeTeamTasks(access: Access, mine: TrTask[] | undefined) {
  return access.web('trmytasks', {
    teamRosterTasks: Array.isArray(mine) ? mine.length : 0,
  });
}

/**
 * What the boot-time loads have found so far, read from the query cache (filled by the Inbox
 * plug-in's hook and by the Team board screens). `null` parts are not loaded yet.
 */
export function gateSnapshot(userId: string | undefined) {
  if (!userId) return { depts: undefined, grants: undefined, mine: undefined };
  return {
    depts: queryClient.getQueryData<TrDept[]>(tbKeys.depts(userId)),
    grants: queryClient.getQueryData<string[]>(tbKeys.grants(userId)),
    mine: queryClient.getQueryData<TrTask[]>(tbKeys.mine(userId)),
  };
}

/** The pure plug-in gates (More row, tour), from the cache snapshot. */
export function boardVisible(access: Access) {
  const s = gateSnapshot(access.user?.id);
  return !!s.depts && !!s.grants && canSeeTeamBoard(access, s.depts, s.grants);
}

export function teamTasksVisible(access: Access) {
  const s = gateSnapshot(access.user?.id);
  return !!s.mine && canSeeTeamTasks(access, s.mine);
}
