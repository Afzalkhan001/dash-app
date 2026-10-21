// Admin advanced (wave 3, "everything in the website should be in the app") — the gates for the last
// admin features the earlier waves left on the website. Pure: no hooks, no clock.
//
//   Delete a company     MasterAdmin's Tenants grid → Delete (dash.html:2479 → deleteTenant :2413). Only the
//                        platform owner has that page (navForRaw :1531 master_admin 'tenants'). The server's
//                        DELETE /tenants/:id checks nothing beyond sign-in (routes/tenants.js:163), so this
//                        gate is the only guard.
//   Delete all assets    AssetCatalog ⋮ menu → "Delete all assets…" (dash.html:20600 → deleteAllAssets :20415).
//                        The page is the IT Admin's `assets` item (navForRaw :1531, `assets` switch :1386),
//                        which is exactly access.web('assets'). DELETE /assets/:id checks no role.
//   Delete a request     DELETE /tickets/:id (routes/tickets.js:346) has no button on the website at all
//                        (team-ops §5: "not used by the Service Desk UI"). The owner asked for it; it is
//                        offered to the two roles that run the whole desk and can decide requests
//                        (canDecide, tickets.js:109: it_admin, super_admin — admin and app_manager only
//                        see their own slice, CEO/COO are read-only there), behind web('servicedesk').
//   TV playlists         TvDisplaysCard → Playlists (dash.html:2936 / TvPlaylistModal :3096), inside Config,
//                        whose menu is super_admin's (ceo/coo share it) — the newsroom domain's Office TVs
//                        gate. The server allows every USER_ADMIN role (tv.js:533–590); the app stays with
//                        the website.
//   Office map           AttendanceSetup's office editor map (OsmMap dash.html:3634) — the hrtime domain's
//                        canSetUpAttendance (Super Admin and HR with the attendance module).
//   Managers             AdminManagersView (dash.html:22097), sidebar id `managers`: admin, app_manager.
//   Employees            EmpListView (dash.html:22166), sidebar id `employees`: admin, manager, app_manager.

import type { HrMe, Tenant } from '@/api/me';
import type { StaffUser } from '@/auth/session';
import { canSeeOfficeTvs } from '@/features/newsroom/access';
import { canSetUpAttendance } from '@/features/hrtime/access';
import type { Access } from '@/lib/use-access';

type U = StaffUser | null | undefined;
type T = Tenant | null | undefined;
const role = (u: U) => String(u?.role ?? '');

/** dash.html:2479 — the Tenants grid's Delete button. */
export const canDeleteCompanies = (u: U) => role(u) === 'master_admin';

/** dash.html:20600 — the asset catalogue's "Delete all assets…". */
export const canDeleteAllAssets = (access: Pick<Access, 'web'>) => access.web('assets');

/** Who may delete one service request (no website button; see the header). */
export const TICKET_DELETE_ROLES = ['it_admin', 'super_admin'];
export const canDeleteTickets = (access: Pick<Access, 'web' | 'user'>) => access.web('servicedesk') && TICKET_DELETE_ROLES.includes(role(access.user));

/** dash.html:2936 — Config › TV Displays › Playlists. */
export const canEditPlaylists = (u: U, t: T) => canSeeOfficeTvs(u, t);

/** dash.html:3634 — the office map inside Attendance → Setup. */
export const canUseOfficeMap = (hr: HrMe, u: U) => !!u && canSetUpAttendance(hr, u);

/** dash.html:22097 / navForRaw :1531 — admin, app_manager. */
export const canSeeManagers = (access: Pick<Access, 'web'>) => access.web('managers');

/** dash.html:22166 / navForRaw :1531 — admin, manager, app_manager. */
export const canSeeEmployees = (access: Pick<Access, 'web'>) => access.web('employees');

/** Any of the delete tools (the "Delete data" hub). */
export function deleteTools(access: Pick<Access, 'web' | 'user'>) {
  const t = { company: canDeleteCompanies(access.user), assets: canDeleteAllAssets(access), ticket: canDeleteTickets(access) };
  return { ...t, any: t.company || t.assets || t.ticket };
}

// ── EmpListView / AdminManagersView rules (dash.html:22117–22122, 22298–22313) ──────────────
/** dash.html:919–920 */
export const STAFF_ROLES = ['employee', 'professional'];
export const STAFF_MGR_ROLES = ['employee', 'professional', 'manager'];
/** dash.html:22298 — EmpListView's "admin" roles. */
export const EMP_ADMIN_ROLES = ['admin', 'super_admin', 'ceo', 'coo', 'app_manager'];

type Dept = { id: string; name: string; adminId: string };
type Person = { id: string; name: string; role: string; dept: string; reportingManager: string; additionalManager: string };

/** dash.html:1759 userInDepts — by id, or by the department's name (old rows store the name). */
export function userInDepts(p: Pick<Person, 'dept'>, deptIds: string[], depts: Dept[]) {
  if (!deptIds.length) return false;
  return deptIds.some((id) => {
    if (p.dept === id) return true;
    const d = depts.find((x) => x.id === id);
    return !!d && !!p.dept && p.dept.toLowerCase() === d.name.toLowerCase();
  });
}

/** resolveDeptIds: a person's `dept` is an id or (older rows) a name. */
export function deptIdsOf(dept: string, depts: Dept[]) {
  if (!dept) return [];
  const byId = depts.find((d) => d.id === dept);
  if (byId) return [byId.id];
  return depts.filter((d) => d.name.toLowerCase() === dept.toLowerCase()).map((d) => d.id);
}

/** EmpListView's list (dash.html:22298–22313): a manager's own reports; an admin's department(s); else everyone. */
export function employeesFor<P extends Person>(me: Pick<Person, 'id' | 'name' | 'role' | 'dept'>, people: P[], depts: Dept[]) {
  const isAdmin = EMP_ADMIN_ROLES.includes(me.role);
  const isManager = me.role === 'manager';
  const valid = isAdmin || isManager ? STAFF_MGR_ROLES : STAFF_ROLES;
  const adminDeptIds = isAdmin ? depts.filter((d) => d.adminId === me.id).map((d) => d.id) : [];
  const myDeptIds = [...new Set([...deptIdsOf(me.dept, depts), ...adminDeptIds].filter(Boolean))];
  const list = isManager
    ? people.filter((u) => valid.includes(u.role) && (u.reportingManager === me.name || u.additionalManager === me.name))
    : myDeptIds.length
      ? people.filter((u) => valid.includes(u.role) && userInDepts(u, myDeptIds, depts))
      : people.filter((u) => valid.includes(u.role));
  const scope = isManager ? 'Your team' : depts.filter((d) => myDeptIds.includes(d.id)).map((d) => d.name).join(' · ');
  return { list, scope };
}

/** AdminManagersView's list (dash.html:22117–22122): managers in the departments I run, else my own department, else all. */
export function managersFor<P extends Person>(me: Pick<Person, 'id' | 'dept'>, people: P[], depts: Dept[]) {
  const all = people.filter((u) => u.role === 'manager');
  const mine = depts.filter((d) => d.adminId === me.id);
  const ids = mine.map((d) => d.id);
  const names = mine.map((d) => d.name.toLowerCase());
  if (ids.length) return all.filter((m) => ids.includes(m.dept) || names.includes(m.dept.toLowerCase()));
  return me.dept ? all.filter((m) => m.dept === me.dept) : all;
}

/** AdminManagersView team (dash.html:22127): staff and managers who report to this manager. */
export const teamOf = <P extends Person>(m: Pick<Person, 'name'>, people: P[]) =>
  people.filter((u) => STAFF_MGR_ROLES.includes(u.role) && (u.reportingManager === m.name || u.additionalManager === m.name));
