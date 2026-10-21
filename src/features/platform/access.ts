// Platform domain gates (master_admin), ported from dash.html. VISIBILITY ONLY — the server re-checks
// most of these, but POST /tenants and DELETE /tenants/:id have no role check at all (routes/tenants.js:31,
// :163), so the app never offers more than the website does, and never offers delete.
//
//   navForRaw (dash.html:1531)  n.master_admin = Tenants, Company Wallets (its `bounty` item, lib/access
//                               `wallets`), Company Features, Overrides. Feature switches never filter
//                               master admin (:1503). Overrides has no screen (MasterAdmin :2456) — not ported.
//   Inside the screens:
//     Register company / edit       MasterAdmin (:2384) is master_admin's view only.
//     HR for a company              hr.js:486 / :494 refuse everyone but master_admin.
//     Add coins / cancel a credit   server.js:5046 (actor must be master_admin), :5254 (COMPANY_CREDIT: master only).
//     featureFlags                  routes/tenants.js:67 strips them unless master_admin.

import type { Tenant } from '@/api/me';
import { type NavUser, tenantFeatureOn, webNav } from '@/lib/access';

type U = NavUser | null | undefined;

const role = (u: U) => (u && typeof u.role === 'string' ? u.role : '');

/** The platform owner. */
export const isPlatformOwner = (u: U) => role(u) === 'master_admin';
/** Tenant Management (the `tenants` sidebar item). */
export const canSeeCompanies = (u: U) => webNav(u, 'tenants', null);
/** Company Wallets (master_admin's `bounty` item). */
export const canSeeCompanyWallets = (u: U) => webNav(u, 'wallets', null);
/** Company Features (`features`). */
export const canSeeCompanyFeatures = (u: U) => webNav(u, 'features', null);
/** Registering a company: the website shows "+ Register Company" only in MasterAdmin. */
export const canRegisterCompany = (u: U) => isPlatformOwner(u) && canSeeCompanies(u);
/** add-coins and cancelling a COMPANY_CREDIT: master_admin only (server.js:5046, :5254). */
export const canMoveCompanyCoins = (u: U) => isPlatformOwner(u) && canSeeCompanyWallets(u);

// ── FEATURE_REGISTRY (dash.html:1373–1399) ───────────────────────────────────
// The features the platform owner may switch off for one company, in the website's order and groups.
// `label` is the phone's plain-words name; `web` is the website's label.
export type FeatureGroup = 'People' | 'Work' | 'Workplace' | 'Communication' | 'Programmes' | 'Finance' | 'Oversight';
export type FeatureDef = { id: string; label: string; web: string; group: FeatureGroup; sub: string };

export const FEATURE_REGISTRY: readonly FeatureDef[] = [
  { id: 'users', web: 'Users', label: 'Users', group: 'People', sub: 'System logins for HR, IT, Accounts and admins' },
  { id: 'roster', web: 'Employee Roster', label: 'Employee roster', group: 'People', sub: 'Adding, editing and removing employees' },
  { id: 'departments', web: 'Departments', label: 'Departments', group: 'People', sub: 'Departments and who runs them' },
  { id: 'employees', web: 'Employees', label: 'Employees', group: 'People', sub: 'A manager’s list of their people' },
  { id: 'managers', web: 'Managers', label: 'Managers', group: 'People', sub: 'The list of managers' },
  { id: 'projects', web: 'Projects', label: 'Projects', group: 'Work', sub: 'Project codes work is booked against' },
  { id: 'clients', web: 'Clients', label: 'Clients', group: 'Work', sub: 'The client list' },
  { id: 'tasks', web: 'Tasks', label: 'Tasks', group: 'Work', sub: 'Assigning and reviewing team tasks' },
  { id: 'mytasks', web: 'My Tasks', label: 'My tasks', group: 'Work', sub: 'Everyone’s own task list' },
  { id: 'requests', web: 'Requests', label: 'Requests', group: 'Work', sub: 'The booking requests tracker' },
  { id: 'booking', web: 'Booking', label: 'Booking', group: 'Workplace', sub: 'Booking people, rooms and locations' },
  { id: 'rooms', web: 'Rooms & Locations', label: 'Rooms and locations', group: 'Workplace', sub: 'Setting up rooms and shoot locations' },
  { id: 'assets', web: 'Assets', label: 'Assets', group: 'Workplace', sub: 'Laptops, cameras and other company kit' },
  { id: 'servicedesk', web: 'Service Desk', label: 'Service desk', group: 'Workplace', sub: 'IT and admin tickets' },
  { id: 'announcements', web: 'Announcements', label: 'News', group: 'Communication', sub: 'Company news and announcements' },
  { id: 'bounty', web: 'Bounty System', label: 'Bounty coins', group: 'Programmes', sub: 'Bounty tasks, coin wallets and rewards' },
  { id: 'referrals', web: 'Referral Program', label: 'Refer and earn', group: 'Programmes', sub: 'Job openings and referrals' },
  { id: 'vendors', web: 'Vendor Registrations', label: 'Vendor sign-ups', group: 'Finance', sub: 'New vendors registering and being checked' },
  { id: 'vendormaster', web: 'Vendor Master', label: 'Vendor master', group: 'Finance', sub: 'Approved vendors, bills and agreements' },
  { id: 'subscriptions', web: 'Subscriptions', label: 'Subscriptions', group: 'Finance', sub: 'Software the company pays for' },
  { id: 'meets', web: 'Meets (chat & calls)', label: 'Chat and calls', group: 'Programmes', sub: 'Meets: chats, groups and calls' },
  { id: 'devices', web: 'Device Monitoring', label: 'Device monitoring', group: 'Oversight', sub: 'TM360 laptop activity' },
  { id: 'reports', web: 'Reports', label: 'Reports', group: 'Oversight', sub: 'People, project and month reports' },
  { id: 'audit', web: 'User Activity Audit', label: 'Activity audit', group: 'Oversight', sub: 'Who did what in DASH, and when' },
  { id: 'config', web: 'Config', label: 'Company settings', group: 'Oversight', sub: 'The company’s own switches and access lists' },
];

/** The registry's groups, in the website's order (first appearance). */
export const FEATURE_GROUPS: FeatureGroup[] = FEATURE_REGISTRY.reduce<FeatureGroup[]>((acc, f) => (acc.includes(f.group) ? acc : [...acc, f.group]), []);

/** tenantFeatureOn (dash.html:1407): absent = on; `bounty` reads `bountyEnabled`. */
export const featureOn = (t: Tenant | null | undefined, id: string) => tenantFeatureOn(t ?? null, id);

/** How many registry features are off for a company. */
export const featuresOff = (t: Tenant | null | undefined) => (t ? FEATURE_REGISTRY.filter((f) => !featureOn(t, f.id)).length : 0);

/** The write for one switch: `bounty` lives in its own field, the rest in featureFlags (only that key: the server merges). */
export const featurePatch = (id: string, on: boolean): Partial<Tenant> => (id === 'bounty' ? { bountyEnabled: on } : { featureFlags: { [id]: on } });

/**
 * The HR catalogue's descriptions in plain words (DESIGN §0B). The server's own text ("Attendance
 * Regularization", "Geofenced clock in/out on OpenStreetMap") is kept as the fallback for new modules.
 */
const HR_MODULE_DESC: Record<string, string> = {
  attendance: 'Clock in and out at the office, daily attendance, and late or early-out marks.',
  regularization: 'Requests to fix a missed or wrong clock-in, approved by the manager.',
  shifts: 'Shift times, rotations and weekly offs.',
  holidays: 'Each office’s holiday calendar, with optional holidays.',
  leave: 'Leave types, balances, carry-forward and approvals.',
  wfh: 'Work-from-home requests and approvals.',
  comp_off: 'Days earned for working on a weekly off or a holiday.',
  policies: 'Policy documents people read and accept.',
  salary: 'Salary details and annual salary (CTC).',
  payroll: 'The monthly payroll run.',
  tax: 'Income tax (TDS) and PF deductions.',
  payslips: 'Payslips people can open and download.',
  reimbursements: 'Expense claims and salary advance.',
};
export const hrModuleDesc = (id: string, fallback?: string) => HR_MODULE_DESC[id] ?? fallback ?? '';
