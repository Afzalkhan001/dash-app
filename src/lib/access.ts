// Who sees what. Ported line-for-line from the web app so both clients agree; the server re-checks
// every request regardless, so these only decide what is SHOWN.
//   dash.html:913  RL (role labels)          dash.html:4627 hrHas / hrApproves / hrIsAdmin
//   dash.html:4637 HR_SYSTEM_ROLES           dash.html:4641 canSeeHrNav
//   dash.html:4784 HR_APPROVAL_KINDS         dash.html:5299 HR_SECTIONS
//   dash.html:1406 tenantFeatureOn
//   dash.html:1433 navFor / :1508 navForRaw → webNavList / webNav (the website's whole sidebar, every
//                  module id, for the domain plug-ins; see the section at the end of this file)
// Integrator-owned (docs/port/PLAN.md §2.1): domain gates live in features/<domain>/access.ts and are
// promoted here only when two domains need them.

import type { HrMe, Tenant } from '@/api/me';
import type { StaffUser } from '@/auth/session';

export const ROLE_LABEL: Record<string, string> = {
  master_admin: 'Master Admin',
  super_admin: 'Super Admin',
  ceo: 'CEO',
  coo: 'COO',
  admin: 'Admin',
  hr: 'HR',
  it_admin: 'IT Admin',
  manager: 'Manager',
  employee: 'Employee',
  professional: 'Professional',
  accounts: 'Accounts',
  app_manager: 'Application Manager',
  announcement_viewer: 'Announcements (Display)',
  visitor_manager: 'Visitor Manager',
};

export const HR_SYSTEM_ROLES = ['super_admin', 'ceo', 'coo', 'hr', 'it_admin'];
export const hrIsSystemRole = (u?: StaffUser | null) => !!u && HR_SYSTEM_ROLES.includes(u.role);

export const hrHas = (hr: HrMe, m: string) => hr.enabled && hr.modules.includes(m);
export const hrApproves = (hr: HrMe, m: string) =>
  hr.enabled && hr.approverModules.includes(m) && (hr.isHrAdmin || hr.adminsDepts.length > 0);
export const hrIsAdmin = (hr: HrMe, u?: StaffUser | null) => hr.isHrAdmin && !!u && u.role !== 'master_admin';

export function canSeeHr(hr: HrMe, u?: StaffUser | null) {
  return (
    !!u &&
    u.role !== 'master_admin' &&
    hr.enabled &&
    (hr.modules.length > 0 || (hr.approverModules.length > 0 && (hr.isHrAdmin || hr.adminsDepts.length > 0)))
  );
}

// HR_SECTIONS.show — which parts of HR this person gets.
export function hrSections(hr: HrMe, u?: StaffUser | null) {
  const sys = hrIsSystemRole(u);
  return {
    attendance: hrHas(hr, 'attendance') && (!sys || hr.isHrAdmin || hr.adminsDepts.length > 0),
    // System roles never clock in (and therefore never file timesheets).
    clock: hrHas(hr, 'attendance') && !sys,
    regularization: hrHas(hr, 'regularization') && !sys,
    shifts: hrHas(hr, 'shifts'),
    holidays: hrHas(hr, 'holidays'),
    leave: (hrHas(hr, 'leave') || hrHas(hr, 'wfh') || hrHas(hr, 'comp_off')) && (!sys || hrIsAdmin(hr, u)),
    policies: hrHas(hr, 'policies'),
    pay: !sys && (hrHas(hr, 'salary') || hrHas(hr, 'payslips') || hrHas(hr, 'reimbursements')),
    timesheets: canSeeHr(hr, u) && !sys,
  };
}

// HR_APPROVAL_KINDS — the approvals inbox, one queue per kind. The labels are the Inbox's plain words
// (features/inbox/format KIND_COPY is what the screens show); keys, modules and paths are the server's.
export const HR_APPROVAL_KINDS = [
  { key: 'regularization', module: 'regularization', label: 'Attendance fix', list: '/hr/regularizations/inbox', decide: (id: string) => `/hr/regularizations/${id}/decide` },
  { key: 'leave', module: 'leave', label: 'Leave', list: '/hr/leave/inbox?kind=leave', decide: (id: string) => `/hr/leave/requests/${id}/decide` },
  { key: 'wfh', module: 'wfh', label: 'Work from home', list: '/hr/leave/inbox?kind=wfh', decide: (id: string) => `/hr/leave/requests/${id}/decide` },
  { key: 'comp_off', module: 'comp_off', label: 'Comp-off', list: '/hr/leave/inbox?kind=comp_off', decide: (id: string) => `/hr/leave/requests/${id}/decide` },
  { key: 'reimbursements', module: 'reimbursements', label: 'Salary claims', list: '/hr/claims/inbox', decide: (id: string) => `/hr/claims/${id}/decide` },
  { key: 'loans', module: 'reimbursements', label: 'Salary advance', adminOnly: true, list: '/hr/loans/inbox', decide: (id: string) => `/hr/loans/${id}/decide` },
] as const;

export function approvalKinds(hr: HrMe, u?: StaffUser | null) {
  return HR_APPROVAL_KINDS.filter((k) => hrApproves(hr, k.module) && (!('adminOnly' in k) || hrIsAdmin(hr, u)));
}

// Company feature switches (Config → Company Features). Absent means on.
export function tenantFeatureOn(t: Tenant | null | undefined, id: string) {
  if (!t) return true;
  if (id === 'bounty') return t.bountyEnabled !== false;
  const ff = t.featureFlags;
  return !ff || ff[id] !== false;
}

export const STAFF_ROLES = ['employee', 'professional'];
export const LEADERSHIP_ROLES = ['super_admin', 'ceo', 'coo'];

// ── The website's sidebar, as a pure function (Wave 0 extension point) ────────
// webNavList() is dash.html navFor (:1433) over navForRaw (:1508), every branch copied:
//   - the per-role table, with ceo/coo = super_admin and an unknown role falling back to employee;
//   - bounty (bountySystemOn), referrals (job-opening creator, or at least one opening exists), audit
//     (super_admin or a tenant.auditAccess grant), subscriptions (SUBSCRIPTION_ADMIN_ROLES or a
//     tenant.subscriptionAccess grant; master_admin never), each placed where navForRaw puts it;
//   - navFor's injections in its order: devices (TM360 roles), org (unless orgEnabled === false),
//     teamroster (a Team-Roster department I administer or manage), attendance + timesheets (HR),
//     visitors / visitors-desk, trmytasks (I have Team Roster tasks);
//   - the company feature switches (FEATURE_REGISTRY), never for master_admin;
//   - Sidebar's own append (:1609): a Config project creator always gets `projects`, even past a switch.
// The Accounts group's children (accounts-vendor, accounts-keka-approvals, accounts-bill-review,
// accounts-pettycash, accounts-reimbursement) are listed right after `accounts`.
// Two ids differ from the web so they read as what they are: master_admin's "bounty" item (Company
// Wallets) is `wallets`, never `bounty`; and `payroll` is not a sidebar item on the web (it is a tab of
// the HR page) — it is answered from /hr/me (PayrollAdminPanel, dash.html:5289) so domains can ask.
// What the web reads from data loaded at boot (JOB_OPENINGS, DEPARTMENTS, MY_TR_*, PROJECTS) comes in
// through `extra`; when a caller leaves it out, the item it gates stays hidden (never shown on a guess).
// VISIBILITY ONLY: the server re-checks every request.

/** Every id navFor can produce, plus `wallets` and `payroll` (see above). */
export type WebNavId =
  | 'home' | 'dashboard' | 'users' | 'roster' | 'departments' | 'employees' | 'managers'
  | 'projects' | 'clients' | 'tasks' | 'mytasks' | 'requests' | 'booking' | 'rooms' | 'assets' | 'servicedesk'
  | 'announcements' | 'bounty' | 'wallets' | 'referrals' | 'reports' | 'config' | 'audit' | 'subscriptions' | 'devices'
  | 'accounts' | 'accounts-vendor' | 'accounts-keka-approvals' | 'accounts-bill-review' | 'accounts-pettycash' | 'accounts-reimbursement'
  | 'vendors' | 'vendormaster' | 'agreements'
  | 'visitors' | 'visitors-desk' | 'visitors-dashboard' | 'visitors-kiosk' | 'visitors-log' | 'visitors-invites' | 'visitors-qr'
  | 'tenants' | 'features' | 'overrides'
  | 'org' | 'teamroster' | 'trmytasks' | 'attendance' | 'timesheets' | 'payroll' | 'profile' | 'support';

/** What navFor reads besides the user and the company. Leave a field out and the item it gates stays hidden. */
export type WebNavExtra = {
  /** GET /hr/me (useAccess().hr) — attendance, timesheets, payroll. */
  hr?: HrMe;
  /** isKekaCodeOwner: some project's empNo is my employeeNumber || kekaCode (api/inbox useKekaOwnership). */
  ownsProjectCode?: boolean;
  /** JOB_OPENINGS.length — referrals, for people who cannot post openings. */
  jobOpenings?: number;
  /** DEPARTMENTS (id, adminId, teamRosterEnabled) — teamroster. */
  departments?: { id: string; adminId?: string | null; teamRosterEnabled?: boolean }[];
  /** MY_TR_MANAGER_DEPT_IDS (GET /team-roster/managers?mine=1) — teamroster. */
  teamRosterManagerDeptIds?: string[];
  /** MY_TR_TASKS.length (GET /team-roster/tasks?mine=1) — trmytasks. */
  teamRosterTasks?: number;
};

/** The parts of a user the gates read. A StaffUser fits. */
export type NavUser = Pick<StaffUser, 'id' | 'role'> & Partial<Pick<StaffUser, 'name' | 'employeeNumber' | 'kekaCode' | 'tenantId'>>;

// FEATURE_REGISTRY ids (dash.html:1373): the items a company can switch off.
export const FEATURE_IDS: readonly string[] = [
  'users', 'roster', 'departments', 'employees', 'managers', 'projects', 'clients', 'tasks', 'mytasks', 'requests',
  'booking', 'rooms', 'assets', 'servicedesk', 'announcements', 'bounty', 'referrals', 'vendors', 'vendormaster',
  'subscriptions', 'meets', 'devices', 'reports', 'audit', 'config',
];

// Role lists the web keeps next to each gate (copied here; the server has its own copies).
export const TM360_ADMIN_ROLES = ['it_admin', 'super_admin', 'ceo', 'coo', 'master_admin'];
export const TM360_MANAGER_ROLES = ['manager', 'admin'];
export const SUBSCRIPTION_ADMIN_ROLES = ['it_admin', 'super_admin', 'ceo', 'coo', 'master_admin'];
export const ANNOUNCEMENT_CREATOR_ROLES = ['hr', 'it_admin', 'super_admin', 'ceo', 'coo'];
export const BOUNTY_CREATOR_ROLES = ['super_admin', 'ceo', 'coo'];
export const JOB_OPENING_CREATOR_ROLES = ['hr', 'super_admin', 'ceo', 'coo'];
export const VISIT_DESK_ROLES = ['visitor_manager', 'super_admin'];
// lib/authz.js (the server's user-admin rules). Promoted in integrator pass 1: the people domain
// (roster) and the company domain (User Management) both need them; import from here from wave 2 on.
/** Who may edit other people's accounts and invitations (USER_ADMIN_ROLES). */
export const USER_ADMIN_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo', 'hr', 'admin', 'it_admin', 'app_manager'];
/** Who may change someone's role (ROLE_ASSIGNER_ROLES). */
export const ROLE_ASSIGNER_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo', 'hr'];
/** Who may remove an account for good (DESTRUCTIVE_ROLES). */
export const DESTRUCTIVE_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo'];

const low = (v: unknown) => String(v ?? '').trim().toLowerCase();
const empNoOf = (u?: Partial<NavUser> | null) => String((u && (u.employeeNumber || u.kekaCode)) || '').trim();

/**
 * Does a Config grant name this person? canSeeSubscriptionsNav (dash.html:11174): the grant's userId,
 * else employee number, else exact name, ignoring case. The creator lists (isAnnouncementCreator
 * :11867, isBountyCreator :11908, isProjectCreator :11957) never look at userId: pass `byId: false`.
 * Audit grants are stricter (canSeeAuditNav).
 */
export function grantMatches(grants: unknown, u?: Partial<NavUser> | null, byId = true): boolean {
  if (!u || !Array.isArray(grants)) return false;
  const uEmp = low(empNoOf(u));
  const uName = low(u.name);
  return grants.some((g) => {
    if (!g || typeof g !== 'object') return false;
    const gr = g as { userId?: unknown; empNo?: unknown; name?: unknown };
    if (byId && gr.userId && gr.userId === u.id) return true;
    const gEmp = low(gr.empNo);
    const gName = low(gr.name);
    return (!!gEmp && !!uEmp && gEmp === uEmp) || (!!gName && !!uName && gName === uName);
  });
}

export const isAnnouncementCreator = (u: NavUser | null | undefined, t: Tenant | null | undefined) =>
  !!u && (ANNOUNCEMENT_CREATOR_ROLES.includes(u.role) || grantMatches(t?.announcementCreators, u, false));
export const isBountyCreator = (u: NavUser | null | undefined, t: Tenant | null | undefined) =>
  !!u && (BOUNTY_CREATOR_ROLES.includes(u.role) || grantMatches(t?.bountyCreators, u, false));
export const isProjectCreator = (u: NavUser | null | undefined, t: Tenant | null | undefined) => !!u && grantMatches(t?.projectCreators, u, false);
export const isJobOpeningCreator = (u: NavUser | null | undefined) => !!u && JOB_OPENING_CREATOR_ROLES.includes(u.role);
export const canSeeTm360 = (u: NavUser | null | undefined) => !!u && (TM360_ADMIN_ROLES.includes(u.role) || TM360_MANAGER_ROLES.includes(u.role));
export const canSeeSubscriptions = (u: NavUser | null | undefined, t: Tenant | null | undefined) =>
  !!u && (SUBSCRIPTION_ADMIN_ROLES.includes(u.role) || grantMatches(t?.subscriptionAccess, u));
/** canSeeAuditNav (dash.html:11946): a grant by userId, or by the exact employee number (no name match). */
export function canSeeAuditNav(u: NavUser | null | undefined, t: Tenant | null | undefined) {
  if (!u) return false;
  const emp = empNoOf(u);
  const grants = Array.isArray(t?.auditAccess) ? t.auditAccess : [];
  return grants.some((g) => !!g && ((!!g.userId && g.userId === u.id) || (!!g.empNo && g.empNo === emp)));
}
/** PayrollAdminPanel (dash.html:5289): an HR admin with the payroll, salary or tax module. */
export const canSeePayrollAdmin = (hr: HrMe, u?: NavUser | null) =>
  hrIsAdmin(hr, u as StaffUser | null | undefined) && (hrHas(hr, 'payroll') || hrHas(hr, 'salary') || hrHas(hr, 'tax'));

type NavItem = { id: string; children?: string[] };
const item = (id: string): NavItem => ({ id });

function navForRaw(u: NavUser, t: Tenant | null, x: WebNavExtra): NavItem[] {
  const role = u.role;
  const kekaKid = x.ownsProjectCode ? ['accounts-keka-approvals'] : [];
  const ACN: NavItem = { id: 'accounts', children: ['accounts-vendor', ...kekaKid, 'accounts-pettycash', 'accounts-reimbursement'] };
  const ACN_REVIEWER: NavItem = { id: 'accounts', children: ['accounts-vendor', ...kekaKid, 'accounts-bill-review', 'accounts-pettycash', 'accounts-reimbursement'] };
  const ids = (...list: (string | NavItem)[]) => list.map((v) => (typeof v === 'string' ? item(v) : v));
  const SUPER = ids('dashboard', 'users', 'roster', 'departments', 'projects', 'booking', ACN_REVIEWER, 'bounty', 'referrals', 'announcements', 'servicedesk', 'support', 'reports', 'config', 'audit');
  const n: Record<string, NavItem[]> = {
    // master_admin's 'bounty' is Company Wallets: reported as `wallets`.
    master_admin: ids('tenants', 'wallets', 'features', 'overrides'),
    super_admin: SUPER,
    ceo: SUPER,
    coo: SUPER,
    admin: ids('dashboard', 'managers', 'requests', 'servicedesk', 'tasks', 'employees', 'roster', 'projects', 'clients', 'booking', 'announcements', 'bounty', 'referrals', 'reports', 'profile', ACN, 'support'),
    hr: ids('roster', 'departments', 'projects', 'booking', 'announcements', 'servicedesk', 'bounty', 'referrals', 'reports', ACN, 'support'),
    it_admin: ids('assets', 'roster', 'tasks', 'servicedesk', 'rooms', 'announcements', 'bounty', 'referrals', ACN, 'support'),
    manager: ids('home', 'requests', 'tasks', 'mytasks', 'clients', 'projects', 'employees', 'booking', 'announcements', 'bounty', 'referrals', 'reports', 'profile', ACN, 'support'),
    employee: ids('home', 'mytasks', 'clients', 'booking', 'announcements', 'bounty', 'referrals', 'profile', ACN, 'support'),
    professional: ids('home', 'mytasks', 'clients', 'booking', 'announcements', 'bounty', 'referrals', 'profile', ACN, 'support'),
    accounts: ids('vendors', 'vendormaster', 'accounts-bill-review', 'agreements', 'profile', ACN, 'support'),
    visitor_manager: ids('visitors-dashboard', 'visitors-kiosk', 'visitors-log', 'visitors-invites', 'visitors-qr', 'profile', 'support'),
    app_manager: ids('home', 'dashboard', 'managers', 'requests', 'servicedesk', 'tasks', 'employees', 'roster', 'projects', 'clients', 'booking', 'announcements', 'bounty', 'referrals', 'reports', 'profile', ACN, 'support'),
    announcement_viewer: [],
  };
  const list = n[role] ?? n.employee!;
  // bountyVisible: master_admin keeps its wallets item; everyone else needs the company's bounty on
  // (canSeeBountyNav is true for every signed-in person).
  const filtered = t?.bountyEnabled !== false ? list : list.filter((i) => i.id !== 'bounty');
  const referralsVisible = isJobOpeningCreator(u) || Number(x.jobOpenings) > 0;
  const withReferrals = referralsVisible ? filtered : filtered.filter((i) => i.id !== 'referrals');
  const auditVisible = role === 'super_admin' || canSeeAuditNav(u, t);
  const withAudit = !auditVisible
    ? withReferrals.filter((i) => i.id !== 'audit')
    : withReferrals.some((i) => i.id === 'audit')
      ? withReferrals
      : [...withReferrals, item('audit')];
  const SUBN = item('subscriptions');
  if (role === 'master_admin' || !canSeeSubscriptions(u, t)) return withAudit.filter((i) => i.id !== 'subscriptions');
  if (withAudit.some((i) => i.id === 'subscriptions')) return withAudit;
  if (role === 'it_admin') {
    const i = withAudit.findIndex((it) => it.id === 'assets');
    return i < 0 ? [SUBN, ...withAudit] : [...withAudit.slice(0, i + 1), SUBN, ...withAudit.slice(i + 1)];
  }
  if (role === 'super_admin') {
    const i = withAudit.findIndex((it) => it.id === 'accounts');
    return i < 0 ? [...withAudit, SUBN] : [...withAudit.slice(0, i + 1), SUBN, ...withAudit.slice(i + 1)];
  }
  return [...withAudit, SUBN];
}

// navFor's insert: right after the first of `anchors` found, else at the end.
function insertAfter(list: NavItem[], anchors: string[], it: NavItem) {
  for (const a of anchors) {
    const i = list.findIndex((x) => x.id === a);
    if (i >= 0) return [...list.slice(0, i + 1), it, ...list.slice(i + 1)];
  }
  return [...list, it];
}

// canSeeTeamRosterNav (dash.html:11985).
function canSeeTeamRoster(u: NavUser, t: Tenant | null, x: WebNavExtra) {
  if (!t?.teamRosterEnabled) return false;
  const depts = Array.isArray(x.departments) ? x.departments : [];
  if (depts.some((d) => !!d && d.adminId === u.id && !!d.teamRosterEnabled)) return true;
  const granted = Array.isArray(x.teamRosterManagerDeptIds) ? x.teamRosterManagerDeptIds : [];
  return granted.some((id) => depts.some((d) => !!d && d.id === id && !!d.teamRosterEnabled));
}

/**
 * The website's sidebar for this person, flat and in the web's order (navFor plus Sidebar's
 * project-creator append), the Accounts children right after `accounts`, then `payroll` when it
 * applies. Empty without a user.
 */
export function webNavList(user: NavUser | null | undefined, tenant: Tenant | null | undefined, extra: WebNavExtra = {}): WebNavId[] {
  if (!user || typeof user.role !== 'string') return [];
  const t = tenant ?? null;
  const x = extra ?? {};
  const hr = x.hr;
  let list = navForRaw(user, t, x);
  if (canSeeTm360(user) && !list.some((i) => i.id === 'devices')) {
    const i = list.findIndex((it) => it.id === 'assets');
    list = i < 0 ? [...list, item('devices')] : [...list.slice(0, i + 1), item('devices'), ...list.slice(i + 1)];
  }
  if (t?.orgEnabled !== false && !list.some((i) => i.id === 'org')) {
    const i = list.findIndex((it) => it.id === 'support');
    list = i < 0 ? [...list, item('org')] : [...list.slice(0, i), item('org'), ...list.slice(i)];
  }
  if (canSeeTeamRoster(user, t, x) && !list.some((i) => i.id === 'teamroster')) list = insertAfter(list, ['tasks'], item('teamroster'));
  const hrNav = !!hr && canSeeHr(hr, user as StaffUser);
  if (hrNav && !list.some((i) => i.id === 'attendance')) list = insertAfter(list, ['mytasks', 'tasks'], item('attendance'));
  if (hrNav && !hrIsSystemRole(user as StaffUser) && !list.some((i) => i.id === 'timesheets')) list = insertAfter(list, ['attendance'], item('timesheets'));
  if (!['master_admin', 'announcement_viewer', 'visitor_manager'].includes(user.role)) {
    const add: NavItem[] = [];
    if (!list.some((i) => i.id === 'visitors')) add.push(item('visitors'));
    if (VISIT_DESK_ROLES.includes(user.role) && !list.some((i) => i.id === 'visitors-desk')) add.push(item('visitors-desk'));
    if (add.length) {
      const i = list.findIndex((it) => it.id === 'profile');
      list = i < 0 ? [...list, ...add] : [...list.slice(0, i + 1), ...add, ...list.slice(i + 1)];
    }
  }
  if (Number(x.teamRosterTasks) > 0 && !list.some((i) => i.id === 'trmytasks')) list = insertAfter(list, ['teamroster', 'mytasks', 'tasks'], item('trmytasks'));
  if (user.role !== 'master_admin' && t) list = list.filter((i) => !FEATURE_IDS.includes(i.id) || tenantFeatureOn(t, i.id));
  // Sidebar (dash.html:1609): a Config project creator gets Projects whatever the role, after the switches.
  if (isProjectCreator(user, t) && !list.some((i) => i.id === 'projects')) list = [...list, item('projects')];
  const flat = list.flatMap((i) => [i.id, ...(i.children ?? [])]);
  if (hr && canSeePayrollAdmin(hr, user)) flat.push('payroll');
  return flat as WebNavId[];
}

/** Would the website show this person the `id` item? (webNavList, above.) Pass `extra` for the data-driven ids. */
export function webNav(user: NavUser | null | undefined, id: WebNavId, tenant: Tenant | null | undefined, extra?: WebNavExtra) {
  return webNavList(user, tenant, extra).includes(id);
}
