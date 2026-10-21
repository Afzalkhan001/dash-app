// IT desk — the gates, ported from the website. Pure: no hooks, no clock.
//
//   Assets             the website's sidebar `assets` item: only the IT Admin has it (navForRaw
//                      dash.html:1531), behind the company's `assets` switch (FEATURE_REGISTRY :1386).
//                      access.web('assets') is exactly that test (lib/access webNav).
//   Rooms & locations  the `rooms` item: only the IT Admin (dash.html:1531), `rooms` switch (:1385).
//                      Its four tabs (rooms, locations, booking requests, purposes) have no further gate.
//   Support centre     SupportView (dash.html:29187), reached through the `support` item, which every
//                      role but master_admin and the announcements viewer has:
//                        isITAdmin  (:29219) it_admin, super_admin, ceo, coo → Wi-Fi, office staff, temp staff
//                        isAdminMgr (:29207) admin, super_admin, ceo, coo, app_manager → office request items
//                                   and complaint types (support_branches)
//
// None of the write routes behind these check a role on the server (routes/assets.js, rooms.js,
// locations.js, room_purposes.js, support.js — spec §7 risk 1), so these gates are the only guard.

import type { Access } from '@/lib/use-access';

type Role = string | null | undefined;

/** dash.html:29219 */
export const SUPPORT_IT_ROLES = ['it_admin', 'super_admin', 'ceo', 'coo'];
/** dash.html:29207 */
export const SUPPORT_LIST_ROLES = ['admin', 'super_admin', 'ceo', 'coo', 'app_manager'];
/** dash.html:921 STAFF_MGR_ADMIN_ROLES — who an asset can be assigned to (and the Fix-link pool). */
export const ASSIGNABLE_ROLES = ['employee', 'professional', 'manager', 'admin'];
/** dash.html:21426 — who can approve a shooting location's bookings. */
export const LOCATION_APPROVER_ROLES = ['manager', 'admin'];

export const canSeeAssets = (access: Pick<Access, 'web'>) => access.web('assets');
export const canSeeRooms = (access: Pick<Access, 'web'>) => access.web('rooms');

export const isSupportItAdmin = (role: Role) => SUPPORT_IT_ROLES.includes(String(role));
export const isSupportListAdmin = (role: Role) => SUPPORT_LIST_ROLES.includes(String(role));

/** Who gets the Support centre admin screen at all: the `support` item plus either admin slice. */
export const canManageSupport = (access: Pick<Access, 'web' | 'user'>) => {
  const role = access.user?.role;
  return access.web('support') && (isSupportItAdmin(role) || isSupportListAdmin(role));
};
