// Excel domain — who may import and export what, copied from the website's buttons. Pure: reads
// `access` only. Every gate is the website's own test for the button, plus the test for the page the
// button sits on (the app has no page of its own for these, so both are checked here).
//
// IMPORTS (bulk uploads)
//   employees    EmpRoster "Bulk Upload" (dash.html:5813 canBulkUpload): super_admin, hr, it_admin, admin
//                — on the Roster page (`roster` item). Upload, Update and History are tabs of one modal.
//   projects     ProjectsView "Bulk Upload" (:22730, canCreate :22616): super_admin or a Config
//                project creator — on the Projects page (`projects`). CEO and COO cannot.
//   clients      ClientsView "Bulk Upload CSV" (:23435): anyone on the Clients page (`clients`).
//   assets       AssetCatalog "Bulk Add Inventory" (:20599): the Assets page (`assets`, IT Admin).
//   subscriptions SubscriptionsHub "Upload past data" tab (:11805): the hub (`subscriptions`) AND the
//                server's `canManage` (read on the screen; grantees who only read get no import).
// EXPORTS (Excel files)
//   roster       "Download Roster" (:5811 canDownloadRoster): super_admin, hr, it_admin
//   assets       Assets page reports (:20565, :20703): the `assets` item
//   subscriptions "Export Excel" (:11599): the hub
//   audit        AuditView Excel (:15102): the `audit` item + the `downloadReports` permission
//                (server.js hasAuditPermission; Super Admin always)
//   bounty       BountyReportsView (:13388): the "Reports" tab — super-tier and the App Manager
//                (bountyAdminGates.summary) — and Master Admin (company top-ups only)
//   servicedesk  ServiceDesk "Export → Excel" (:21207): the `servicedesk` item
//   reports      ReportsView export (:23814): the `reports` item
//   devices      DeviceMonitoring "Export" (:11011) and the per-employee TM360 sheet (:10690): `devices`
//   vendors      Vendor Master Excel (:25802): the `vendormaster` item
//   payroll      Payroll register (:5118, GET …/register.csv): the payroll runs admin
//   timesheet    "My Timesheet" (:29084, every profile) and EmpProfileModal's timesheet (:29914
//                canViewTimesheet): super_admin, hr, it_admin, ceo, coo for anyone; manager, admin,
//                app_manager for people who report to them
//   bookings     EmpProfileModal's booking summary (:30032): same people as the timesheet
//   keka         KekaCodeReportModal (:22370, from the Projects list): the `projects` item, own codes
//                unless the person sees every project
//   chat         Meets "Export → Excel" (:10104): anyone in Chat & calls

import { canSeeAudit, canSeeSubscriptionsHub, auditPermission } from '@/features/company/access';
import { bountyAdminGates } from '@/features/bountyadmin/access';
import { canSeeMeets } from '@/features/chat/access';
import { canSeeDevices, canSeeReports } from '@/features/insights/access';
import { canSeeAssets } from '@/features/itdesk/access';
import { payrollGates } from '@/features/payroll/access';
import { canBulkUpload, canSeeRoster } from '@/features/people/access';
import { canEditProjects, canSeeAllProjects, canSeeClients, canSeeProjects } from '@/features/work/access';
import type { Access } from '@/lib/use-access';

type Role = string | null | undefined;

/** canDownloadRoster (dash.html:5811). */
export const ROSTER_EXPORT_ROLES = ['super_admin', 'hr', 'it_admin'];
/** canViewTimesheet (dash.html:5914): these see anyone's timesheet… */
export const TIMESHEET_ALL_ROLES = ['super_admin', 'hr', 'it_admin', 'ceo', 'coo'];
/** …these only for the people who report to them (reportingManager / additionalManager = my name). */
export const TIMESHEET_TEAM_ROLES = ['manager', 'admin', 'app_manager'];
/** Roles without a profile page (no "My Timesheet"). */
const NO_PROFILE_ROLES = ['master_admin', 'announcement_viewer'];

export const canViewTimesheetOf = (viewer: { role?: Role; name?: string } | null | undefined, emp: { reportingManager?: string; additionalManager?: string }) => {
  if (!viewer) return false;
  const role = String(viewer.role ?? '');
  if (TIMESHEET_ALL_ROLES.includes(role)) return true;
  if (!TIMESHEET_TEAM_ROLES.includes(role) || !viewer.name) return false;
  return emp.reportingManager === viewer.name || emp.additionalManager === viewer.name;
};

export type ImportKey = 'employees' | 'projects' | 'clients' | 'assets' | 'subscriptions';
export type ExportKey =
  | 'roster'
  | 'assets'
  | 'subscriptions'
  | 'audit'
  | 'bounty'
  | 'servicedesk'
  | 'reports'
  | 'devices'
  | 'tm360'
  | 'vendors'
  | 'payroll'
  | 'timesheet'
  | 'people-timesheet'
  | 'bookings'
  | 'keka'
  | 'chat';

export type ExcelGates = { imports: Record<ImportKey, boolean>; exports: Record<ExportKey, boolean>; any: boolean };

export function excelGates(a: Access): ExcelGates {
  const u = a.user;
  const t = a.tenant;
  const role = String(u?.role ?? '');
  const bounty = bountyAdminGates(u, t);
  const roster = canSeeRoster(u, t);
  const imports: Record<ImportKey, boolean> = {
    employees: !!u && roster && canBulkUpload(u),
    projects: !!u && canSeeProjects(a) && canEditProjects(u, t),
    clients: !!u && canSeeClients(a),
    assets: !!u && canSeeAssets(a),
    // The server's canManage decides the rest on the screen (subscriptions.js:553).
    subscriptions: !!u && canSeeSubscriptionsHub(u, t),
  };
  const exports: Record<ExportKey, boolean> = {
    roster: !!u && roster && ROSTER_EXPORT_ROLES.includes(role),
    assets: !!u && canSeeAssets(a),
    subscriptions: !!u && canSeeSubscriptionsHub(u, t),
    audit: !!u && canSeeAudit(u, t) && auditPermission(u, t, 'downloadReports'),
    bounty: !!u && (role === 'master_admin' || bounty.summary),
    servicedesk: !!u && a.web('servicedesk'),
    reports: canSeeReports(a),
    devices: canSeeDevices(a),
    tm360: canSeeDevices(a),
    vendors: !!u && a.web('vendormaster'),
    payroll: !!u && payrollGates(a.hr, u).runs,
    timesheet: !!u && !NO_PROFILE_ROLES.includes(role),
    'people-timesheet': !!u && (TIMESHEET_ALL_ROLES.includes(role) || TIMESHEET_TEAM_ROLES.includes(role)),
    bookings: !!u && (TIMESHEET_ALL_ROLES.includes(role) || TIMESHEET_TEAM_ROLES.includes(role)),
    keka: !!u && canSeeProjects(a),
    chat: !!u && canSeeMeets(u, t),
  };
  const any = Object.values(imports).some(Boolean) || Object.values(exports).some(Boolean);
  return { imports, exports, any };
}

/** Keka codes this person may report on (ProjectsView scopedProjects, dash.html:22652). */
export const seesAllCodes = (a: Access) => canSeeAllProjects(a.user, a.tenant);
