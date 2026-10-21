// Insights domain (wave 2) — gates for Reports and Device monitoring, ported from dash.html.
//
// Reports (`reports`): navForRaw (dash.html:1508–1532) gives it to super_admin / ceo / coo (SUPER),
// admin, hr, manager and app_manager (through AdminViews, 25943), behind the company's `reports`
// feature switch (FEATURE_REGISTRY 1373, tenantFeatureOn 1407). access.web('reports') is exactly that.
// The scope comes from the per-role router: SuperAdminDash 2610, CeoCooDash 2624 and HRViews 5490
// render ReportsView scope="global"; AdminViews 22161 and ManagerViews 23497 scope="team".
//
// Device monitoring (`devices`): navFor 1448–1452 injects it for canSeeTm360Nav (10407) —
// TM360_ADMIN_ROLES (10404) or TM360_MANAGER_ROLES (10405) — behind the `devices` feature switch.
// access.web('devices') is exactly that. Who may pair, unpair and link is the server's `canPair`
// (tm360.js visibilityFor 309); before the roster loads the website guesses with isTm360Admin (10406).

import type { Access } from '@/features/plugin-types';
import { TM360_ADMIN_ROLES, type NavUser } from '@/lib/access';

/** ReportsView scope="global" (2610, 2624, 5490): every employee and professional in the company. */
export const REPORT_GLOBAL_ROLES = ['super_admin', 'ceo', 'coo', 'hr'];

export type ReportScope = 'global' | 'team';

export const canSeeReports = (a: Pick<Access, 'web' | 'user'>) => !!a.user && a.web('reports');

export const reportScopeOf = (u: Pick<NavUser, 'role'> | null | undefined): ReportScope =>
  REPORT_GLOBAL_ROLES.includes(String(u?.role ?? '')) ? 'global' : 'team';

export const canSeeDevices = (a: Pick<Access, 'web' | 'user'>) => !!a.user && a.web('devices');

/** isTm360Admin (dash.html:10406) — only a hint until the server's `canPair` arrives. */
export const isTm360Admin = (u: Pick<NavUser, 'role'> | null | undefined) => !!u && TM360_ADMIN_ROLES.includes(String(u.role));
