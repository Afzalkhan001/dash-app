// Work domain gates — pure functions ported line for line from dash.html (line numbers as of the
// port spec, docs/port/manager-work.md §1.0). The server checks no roles on any of these routes
// (only assertSameTenant), so these rules are the only guard: copy them exactly, never loosen them.
//
//   Team tasks      nav `tasks` for admin, manager, app_manager (it_admin's `tasks` is a different
//                   page, ITTaskOnBehalf) — ManagerTasksView :22977 via navForRaw :1531.
//   Reviews         nav `requests` (admin, manager, app_manager + the `requests` switch) — RequestsView
//                   :24049 holds "submitted tasks" and "time corrections".
//   Projects        nav `projects` (+ Config project creators); who sees all rows :22650; who may
//                   add / edit :22616 (super_admin or a project creator — never CEO / COO).
//   Clients         nav `clients`; every person sees only the clients they added :23346.
//   Manager Home    ManagerHome :22837 is the manager's own home (navForRaw `home` for manager).
//
// Team scope (who "my team" is) follows the two pages exactly:
//   ManagerTasksView :23017  admin-type roles → staff (STAFF_MGR_ROLES) in the departments they run
//                            (departments.adminId), else in their own department; managers → people
//                            whose Reporting / Additional Manager is their name, plus people with
//                            neither set in their own department.
//   RequestsView :24112      admin-type → STAFF_ROLES (no managers) in the departments admin /
//                            app_manager run, else their own department (resolveDeptIds); managers →
//                            STAFF_MGR_ROLES whose Reporting / Additional Manager is their name.
// Departments are stored on a person by id or (older rows) by name; matching uses the web's own
// resolveDeptIds / userInDepts (:1758) so both forms count.

import type { Tenant } from '@/api/me';
import { isProjectCreator, type NavUser } from '@/lib/access';
import type { Access } from '@/lib/use-access';

// dash.html:919–920
export const STAFF_ROLES = ['employee', 'professional'];
export const STAFF_MGR_ROLES = ['employee', 'professional', 'manager'];
/** ManagerTasksView / RequestsView `isAdminRole` / `isAdmin`. */
export const ADMIN_TYPE_ROLES = ['admin', 'super_admin', 'ceo', 'coo', 'app_manager'];
/** The roles whose `tasks` nav item is the team-tasks page (navForRaw :1531). */
export const TEAM_TASK_ROLES = ['admin', 'manager', 'app_manager'];
/** ProjectsView PROJECT_FULL_ACCESS_ROLES (:22649). */
export const PROJECT_FULL_ACCESS_ROLES = ['hr', 'it_admin', 'super_admin', 'ceo', 'coo'];

export type ScopeUser = {
  id: string;
  name?: string;
  role?: string;
  dept?: string | null;
  reportingManager?: string | null;
  additionalManager?: string | null;
};
export type ScopeDept = { id: string; name?: string; adminId?: string | null };
type Me = Pick<NavUser, 'id' | 'role'> & { name?: string; dept?: unknown };

const s = (v: unknown) => (v == null ? '' : String(v));
const low = (v: unknown) => s(v).toLowerCase();

/** resolveDeptIds (dash.html:1758): a department value (id or name) → [id]. */
export function resolveDeptIds(deptVal: unknown, depts: readonly ScopeDept[]): string[] {
  const v = s(deptVal);
  if (!v || !Array.isArray(depts)) return [];
  const byId = depts.find((d) => d.id === v);
  if (byId) return [byId.id];
  const byName = depts.find((d) => !!d.name && low(d.name) === low(v));
  return byName ? [byName.id] : [];
}

/** userInDepts (dash.html:1759). */
export function userInDepts(u: Pick<ScopeUser, 'dept'>, deptIds: readonly string[], depts: readonly ScopeDept[]): boolean {
  if (!deptIds.length) return false;
  return deptIds.some((id) => {
    if (u.dept === id) return true;
    const d = depts.find((x) => x.id === id);
    return !!d && !!u.dept && low(u.dept) === low(d.name);
  });
}

/** Same department as me, whether either side stores the id or the name. */
function sameDept(u: Pick<ScopeUser, 'dept'>, me: Me, depts: readonly ScopeDept[]) {
  if (!u.dept || !me.dept) return false;
  if (u.dept === me.dept) return true;
  return userInDepts(u, resolveDeptIds(me.dept, depts), depts);
}

const isAdminType = (role?: string) => ADMIN_TYPE_ROLES.includes(s(role));

/** The departments this person runs (departments.adminId === me). */
export const deptsIRun = (me: Pick<NavUser, 'id'>, depts: readonly ScopeDept[]) =>
  (Array.isArray(depts) ? depts : []).filter((d) => !!d && d.adminId === me.id).map((d) => d.id);

/** ManagerTasksView `employees` (:23020): the people whose work shows on Team tasks and who can be assigned. */
export function taskTeam<U extends ScopeUser>(me: Me, users: readonly U[], depts: readonly ScopeDept[]): U[] {
  const list = (Array.isArray(users) ? users : []).filter((u): u is U => !!u && typeof u === 'object');
  const admin = isAdminType(me.role);
  const runs = admin ? deptsIRun(me, depts) : [];
  return list.filter((u) => {
    if (!STAFF_MGR_ROLES.includes(s(u.role))) return false;
    if (admin) return runs.length > 0 ? userInDepts(u, runs, depts) : sameDept(u, me, depts);
    const rm = s(u.reportingManager);
    const am = s(u.additionalManager);
    return rm === me.name || am === me.name || (!rm && !am && sameDept(u, me, depts));
  });
}

/** RequestsView `myEmpNames` (:24116): whose submitted tasks and time corrections I decide. */
export function reviewTeamNames(me: Me, users: readonly ScopeUser[], depts: readonly ScopeDept[]): Set<string> {
  const list = (Array.isArray(users) ? users : []).filter((u) => !!u && typeof u === 'object');
  if (isAdminType(me.role)) {
    const owned = me.role === 'admin' || me.role === 'app_manager' ? deptsIRun(me, depts) : [];
    const ids = owned.length > 0 ? owned : resolveDeptIds(me.dept, depts);
    return new Set(list.filter((u) => STAFF_ROLES.includes(s(u.role)) && userInDepts(u, ids, depts)).map((u) => s(u.name)));
  }
  return new Set(
    list.filter((u) => STAFF_MGR_ROLES.includes(s(u.role)) && (u.reportingManager === me.name || u.additionalManager === me.name)).map((u) => s(u.name)),
  );
}

/** ManagerHome `deptEmps` (:22858): a manager's Reporting / Additional Manager reports. */
export function managerReports<U extends ScopeUser>(me: Me, users: readonly U[]): U[] {
  return (Array.isArray(users) ? users : []).filter(
    (u): u is U => !!u && STAFF_MGR_ROLES.includes(s(u.role)) && (u.reportingManager === me.name || u.additionalManager === me.name),
  );
}

// ── Screen gates (from Access; pure) ─────────────────────────────────────────
const roleOf = (a: Access) => s(a.user?.role);

/** Team tasks page (list, detail, create, edit, delete, mark complete). */
export const canSeeTeamTasks = (a: Access) => TEAM_TASK_ROLES.includes(roleOf(a)) && a.web('tasks');
/** The review queues of RequestsView: submitted tasks and time corrections. */
export const canReviewWork = (a: Access) => TEAM_TASK_ROLES.includes(roleOf(a)) && a.web('requests');
export const canSeeProjects = (a: Access) => a.web('projects');
export const canSeeClients = (a: Access) => a.web('clients');
/** ManagerHome is the manager's own home page. */
export const hasManagerHome = (a: Access) => roleOf(a) === 'manager' && !!a.user?.tenantId;

/** ProjectsView `canSeeAllProjects` (:22650). Others see only codes they own (by name). */
export const canSeeAllProjects = (u: NavUser | null | undefined, t: Tenant | null | undefined) =>
  !!u && (PROJECT_FULL_ACCESS_ROLES.includes(u.role) || isProjectCreator(u, t));
/** ProjectsView `canCreate` (:22616): add, edit, deactivate. CEO and COO cannot. */
export const canEditProjects = (u: NavUser | null | undefined, t: Tenant | null | undefined) => !!u && (u.role === 'super_admin' || isProjectCreator(u, t));

/** ProjectsView scopedProjects: costCodeOwner (a name) is mine, ignoring case and spaces. */
export const ownsProject = (p: { costCodeOwner?: unknown }, me: { name?: string } | null | undefined) =>
  !!me?.name && low(s(p.costCodeOwner).trim()) === low(me.name.trim());

/** ClientsView (:23346): every person sees only the clients they added. */
export const isMyClient = (c: { managerId?: unknown; managerName?: unknown }, me: { id: string; name?: string } | null | undefined) =>
  !!me && (c.managerId === me.id || (!!me.name && c.managerName === me.name));
