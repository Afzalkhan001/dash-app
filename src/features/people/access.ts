// People domain (wave 1) — the gates for the Employee roster, Departments and HR editing someone
// else's profile. Pure functions, ported from dash.html (line numbers below are dash.html unless a
// server file is named). VISIBILITY ONLY: the server re-checks every request, so these decide what is
// shown and never stand in for the server's own checks.
//
// Where the website and the server disagree, the app follows the website's visibility (docs/port/
// hr-people.md §7.2 risk 7), with two deliberate exceptions the spec asks for (§4.2, §1.A, §1.E):
//   - Remove is offered only to DESTRUCTIVE_ROLES. The website shows it to every roster role, and for
//     HR / IT Admin / Admin / App Manager its DELETE /users is refused (403) while the parallel
//     DELETE /whitelist succeeds, half-removing the person.
//   - "Bookable as a professional" and the reporting-manager pick are offered to the website's canAdd
//     roles (:30451) minus `manager`: a manager is not in USER_ADMIN_ROLES (lib/authz.js:27), so the
//     server answers 403 and the website's toggle only looks saved.

import type { Tenant } from '@/api/me';
import { type NavUser, webNav } from '@/lib/access';

type U = NavUser | null | undefined;
type T = Tenant | null | undefined;

// lib/authz.js:27-31 (the server's own lists).
export const USER_ADMIN_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo', 'hr', 'admin', 'it_admin', 'app_manager'];
export const ROLE_ASSIGNER_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo', 'hr'];
export const DESTRUCTIVE_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo'];
// routes/users.js:325: only a Super Admin (or the platform owner) may change these accounts' email.
export const EMAIL_PROTECTED_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo'];

/** navForRaw `roster` (:1531): super_admin, ceo, coo, admin, hr, it_admin, app_manager + the company switch. */
export const canSeeRoster = (u: U, t: T) => webNav(u, 'roster', t);
/** navForRaw `departments` (:1531): super_admin, ceo, coo, hr + the company switch. */
export const canSeeDepartments = (u: U, t: T) => webNav(u, 'departments', t);

/** EmpRoster canAssignRole (:5759) — mirrors ROLE_ASSIGNER_ROLES. */
export const canAssignRole = (u: U) => !!u && ROLE_ASSIGNER_ROLES.includes(u.role);
/** EmpRoster canManageResign (:5754): HR, IT Admin and Super Admin (not CEO / COO, not Admin). */
export const canManageResign = (u: U) => !!u && ['hr', 'it_admin', 'super_admin'].includes(u.role);
/** Remove: DESTRUCTIVE_ROLES only (see the header; the website's :5899 shows it to every roster role). */
export const canRemoveEmployee = (u: U) => !!u && DESTRUCTIVE_ROLES.includes(u.role);
/** POST /employees/change-email (routes/users.js:325): only super/master change a protected account's email. */
export const canChangeEmailOf = (u: U, targetRole: string | null | undefined) =>
  !!u && USER_ADMIN_ROLES.includes(u.role) && (!EMAIL_PROTECTED_ROLES.includes(String(targetRole || '')) || ['master_admin', 'super_admin'].includes(u.role));

/** DeptBrowserView canEdit (:6782): create, rename, set the admin, delete. Everyone else on the nav reads. */
export const canEditDepartments = (u: U) => !!u && ['super_admin', 'ceo', 'coo', 'hr', 'master_admin'].includes(u.role);

/** EmpProfileModal canAdd (:30451) ∩ USER_ADMIN_ROLES: the professional-booking and reporting-manager edits. */
export const canEditBooking = (u: U) =>
  !!u && ['manager', 'admin', 'hr', 'super_admin', 'ceo', 'coo', 'app_manager'].includes(u.role) && USER_ADMIN_ROLES.includes(u.role);

/** Bulk Upload button (:5810) — web only on the phone, but the Banner names who can use it. */
export const canBulkUpload = (u: U) => !!u && ['super_admin', 'hr', 'it_admin', 'admin'].includes(u.role);

/** The account types the Add / Edit form offers (:5947, :5987). */
export const ACCOUNT_TYPES = ['employee', 'professional', 'admin', 'manager', 'hr'] as const;

/** BLOOD_GROUPS (:925). */
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/** STAFF_ROLES (lib/access): who a department's member count counts (:6753). */
export const MEMBER_ROLES = ['employee', 'professional'];

/**
 * isSystemAcct (:5705): a login provisioned through User Management, or the Super Admin. Its role and
 * removal are managed there ("Managed in User Mgmt"), never on the roster. `inviteSource` is the
 * matching whitelist row's `source`, when there is one.
 */
export const isSystemAccount = (row: { role?: string; source?: string }, inviteSource?: string | null) =>
  inviteSource === 'system' || row.source === 'system' || row.role === 'super_admin';

/** Anything in the workspace at all (More › People & HR, the tour). */
export const hasPeopleWorkspace = (u: U, t: T) => canSeeRoster(u, t) || canSeeDepartments(u, t);
