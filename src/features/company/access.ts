// Company domain gates, ported from dash.html. VISIBILITY ONLY — the server re-checks every request,
// but several of these routes have no server-side role check (DELETE /whitelist/:id, PUT /tenants/:id
// across companies), so the app never offers more than the website does.
//
//   The sidebar items (navFor, dash.html:1433 / navForRaw :1508) come from lib/access webNav:
//     dashboard  super_admin / ceo / coo (also admin and app_manager, whose "dashboard" is their own
//                AdminDash — not this one, so the company dashboard is LEADERSHIP_ROLES only, :30500)
//     users      the same Super Admin menu, switchable per company (feature `users`)
//     config     the same, switchable (`config`)
//     audit      super_admin always; anyone in tenant.auditAccess (canSeeAuditNav :11946); switchable
//     subscriptions  SUBSCRIPTION_ADMIN_ROLES or a tenant.subscriptionAccess grant (:11174); switchable
//   Inside the screens:
//     role list for Edit Role (:2750) and Provision (:2779)       USER_ADMIN_ROLES may open Users; the
//     server keeps `role` only for ROLE_ASSIGNER_ROLES (lib/authz.js:29) and deletes only for
//     DESTRUCTIVE_ROLES (:31). super_admin rows are "Owner — cannot remove" (:2715).
//     hasAuditPermission (server.js:7231): super_admin / master_admin always; others per grant.
//     subscriptions canManage (subscriptions.js:21): the admin roles only; grantees read and export.
//     HR access (hr.js:527, :585) and Team Roster departments (team_roster.js:163): super_admin.
//     Monthly earning cap (routes/tenants.js:60): super_admin / master_admin.

import type { HrMe, Tenant } from '@/api/me';
import { LEADERSHIP_ROLES, type NavUser, SUBSCRIPTION_ADMIN_ROLES, webNav } from '@/lib/access';

export const USER_ADMIN_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo', 'hr', 'admin', 'it_admin', 'app_manager'];
export const ROLE_ASSIGNER_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo', 'hr'];
export const DESTRUCTIVE_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo'];

/** UserMgmt SYSTEM_ROLES (dash.html:2633): the logins this screen manages (employees live in the roster). */
export const SYSTEM_ROLES = ['super_admin', 'ceo', 'coo', 'admin', 'hr', 'it_admin', 'manager', 'accounts', 'app_manager', 'announcement_viewer', 'visitor_manager'];

/** Edit Role options, in the website's order (dash.html:2750). Accounts is only offered when adding. */
export const EDIT_ROLES = ['ceo', 'coo', 'admin', 'hr', 'it_admin', 'manager', 'app_manager', 'visitor_manager', 'announcement_viewer'];
/** Provision User options (dash.html:2779). */
export const PROVISION_ROLES = ['ceo', 'coo', 'admin', 'hr', 'it_admin', 'manager', 'accounts', 'app_manager', 'visitor_manager', 'announcement_viewer'];

type U = NavUser | null | undefined;
type T = Tenant | null | undefined;

const role = (u: U) => (u && typeof u.role === 'string' ? u.role : '');

/** The company dashboard (SAHome via SuperAdminDash / CeoCooDash). */
export const canSeeCompanyDashboard = (u: U) => LEADERSHIP_ROLES.includes(role(u));
export const canSeeUsers = (u: U, t: T) => webNav(u, 'users', t);
export const canSeeCompanySettings = (u: U, t: T) => webNav(u, 'config', t);
export const canSeeAudit = (u: U, t: T) => webNav(u, 'audit', t);
export const canSeeSubscriptionsHub = (u: U, t: T) => webNav(u, 'subscriptions', t);

/** The server keeps a role change only from these (lib/authz.js filterUserWrite). */
export const canAssignRoles = (u: U) => ROLE_ASSIGNER_ROLES.includes(role(u));
/** DELETE /users/:id (routes/users.js:383). */
export const canRemoveUsers = (u: U) => DESTRUCTIVE_ROLES.includes(role(u));
/** A row nobody may edit or remove here: the company owner, and yourself (nobody changes their own role). */
export const isLockedRow = (rowRole: string, rowId: string, u: U) => rowRole === 'super_admin' || (!!u && rowId === u.id);

export type AuditPermission = 'viewLogs' | 'searchUsers' | 'viewDetail' | 'downloadReports';

/** hasAuditPermission (server.js:7231): the same grant lookup the server makes (userId, else exact employee number). */
export function auditPermission(u: U, t: T, perm: AuditPermission) {
  const r = role(u);
  if (r === 'super_admin' || r === 'master_admin') return true;
  if (!u) return false;
  const emp = String(u.employeeNumber || u.kekaCode || '');
  const grants = Array.isArray(t?.auditAccess) ? t.auditAccess : [];
  const g = grants.find((x) => !!x && ((!!x.userId && x.userId === u.id) || (!!x.empNo && x.empNo === emp)));
  return !!g?.permissions?.[perm];
}

/** subscriptions.js canManage: add, edit, delete, record payments. Grantees read only. */
export const canManageSubscriptions = (u: U) => SUBSCRIPTION_ADMIN_ROLES.includes(role(u));

/** Monthly earning cap (routes/tenants.js:60 keeps it only from super_admin / master_admin). */
export const canSetEarnCap = (u: U) => role(u) === 'super_admin';
/** HR by department: GET /hr/config/overview is master/super; PUT only super (hr.js:585). */
export const canConfigureHr = (u: U, hr: HrMe | null | undefined) => role(u) === 'super_admin' && !!hr?.canConfigure;
/** Team Roster by department: GET /team-roster/departments is master/super (team_roster.js:163). */
export const canSeeTeamRosterAccess = (u: U) => role(u) === 'super_admin';
