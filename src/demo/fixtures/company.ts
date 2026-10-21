// Demo API for the company domain (wave 1): the Super Admin dashboard counts, system logins and
// invitations, the company record's switches and "Who can…" lists, HR and Team Roster by department,
// the activity audit and the subscriptions tracker. Owner: the company agent. Shapes and role rules
// mirror the real handlers (cited per route); responses are built from the app's own API types.
//
// Shared demo data is read and changed only through org.ts / tasks.ts exports (allPeople, DEPARTMENTS,
// TENANT, upsertPerson, patchTenant, taskStore, bookingStore) and people.ts (whitelistStore).
//
// Who sees what in the demo:
//   Afzal Super Admin   everything here (dashboard, users, settings, audit, subscriptions)
//   Afzal HR            the activity audit (a Config grant: view, search, open; no download)
//   Afzal IT Admin      subscriptions (manages them)
//   Afzal Accounts      subscriptions (a Config grant: read and share only)
//   everyone else       refused with the server's own words (403)
//
// Writes made here also add rows to the activity audit, the way the real routes call createAuditLog.

import type {
  AuditRow,
  AuditSummary,
  DashboardSummary,
  HrConfigOverview,
  HrModuleInfo,
  SubDeptRow,
  SubPayment,
  Subscription,
  SubSummary,
  SubTotals,
  TeamRosterDept,
} from '@/api/company';
import type { Tenant } from '@/api/me';
import { DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { allPeople, DEPARTMENTS, deptIdOf, patchTenant, personById, TENANT, upsertPerson } from '@/demo/fixtures/org';
import { type WhitelistRow, whitelistStore } from '@/demo/fixtures/people';
import { bookingStore, taskStore } from '@/demo/fixtures/tasks';
import { currentPersona, personaUserId } from '@/demo/personas';
import { addDays, clone, fail, istIso, newId, notFound, nowIso, nowMinutesIst, rand, type Route, today } from '@/demo/state';

// ── Role lists (lib/authz.js:27–31, subscriptions.js:43, hr.js:39) ───────────
const USER_ADMIN_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo', 'hr', 'admin', 'it_admin', 'app_manager'];
const SUBSCRIPTION_ADMIN_ROLES = ['it_admin', 'super_admin', 'ceo', 'coo', 'master_admin'];
const OVERSEER_ROLES = ['master_admin', 'super_admin'];

const me = () => {
  const p = currentPersona();
  return { id: personaUserId(p), name: p.label, role: p.role, employeeNumber: p.employeeNumber, tenantId: p.tenant ? DEMO_TENANT_ID : null };
};
const T0 = today();
const low = (v: unknown) => String(v ?? '').trim().toLowerCase();

// ── System logins that are not on the people directory (routes/users.js ORG_NON_STAFF_ROLES) ──
// Added through org.ts upsertPerson with no department, so no team, roster or attendance list changes.
const SYSTEM_PEOPLE: [id: string, name: string, role: string, title: string, empNo: string, location?: string][] = [
  ['u-sys-swathi', 'Swathi Reddy', 'hr', 'HR Executive', 'TM-1121'],
  ['u-sys-arjun', 'Arjun Mehta', 'it_admin', 'IT Administrator', 'TM-1122'],
  ['u-sys-anand', 'Anand Rao', 'accounts', 'Accounts Officer', 'TM-1123'],
  ['u-sys-bhavna', 'Bhavna Kapoor', 'app_manager', 'Application Manager', 'TM-1124'],
];
for (const [id, name, role, jobTitle, employeeNumber, location] of SYSTEM_PEOPLE) {
  upsertPerson({ id, name, role, jobTitle, employeeNumber, kekaCode: employeeNumber, dept: '', location: location ?? 'Hyderabad', source: 'system' });
}

// ── Invitations (routes/whitelist.js) ────────────────────────────────────────
// The invitations store and its routes (GET/POST/PUT/DELETE /whitelist) belong to the people domain
// (fixtures/people.ts whitelistStore, exported for User Management), as do PUT/DELETE /users/:id. This
// file only adds the system logins' own invitations and two that nobody has used yet.
const emailOf = (id: string) => personById(id)?.email ?? '';
const invite = (r: Partial<WhitelistRow> & Pick<WhitelistRow, 'id' | 'email' | 'name' | 'role'>): WhitelistRow => ({
  dept: null,
  tenantId: DEMO_TENANT_ID,
  employeeNumber: '',
  kekaCode: '',
  gender: '',
  mobile: '',
  location: 'Hyderabad',
  jobTitle: '',
  reportingManager: null,
  reportingTo: null,
  dateJoined: '',
  source: 'system',
  createdAt: istIso(addDays(T0, -40), '11:00'),
  ...r,
});
const ADD_INVITES: WhitelistRow[] = [
  ...SYSTEM_PEOPLE.map(([id, name, role, jobTitle, empNo, location]) =>
    invite({ id: `wl-${id.slice(6)}`, email: emailOf(id), name, role, jobTitle, employeeNumber: empNo, kekaCode: empNo, location: location ?? 'Hyderabad' }),
  ),
  invite({ id: 'wl-rohit', email: 'rohit.bansal.demo@tamadamedia.com', name: 'Rohit Bansal', role: 'admin', jobTitle: 'Admin', createdAt: istIso(addDays(T0, -2), '16:40') }),
  invite({ id: 'wl-lobby', email: 'lobby.tv.demo@tamadamedia.com', name: 'Lobby TV — Jubilee Hills', role: 'announcement_viewer', jobTitle: 'Reception display', location: 'Hyderabad', createdAt: istIso(addDays(T0, -5), '12:30') }),
  invite({ id: 'wl-reception', email: 'reception.demo@tamadamedia.com', name: 'Reception Desk', role: 'visitor_manager', jobTitle: 'Front office', createdAt: istIso(addDays(T0, -1), '10:15') }),
];
for (const w of ADD_INVITES) if (!whitelistStore.some((x) => low(x.email) === low(w.email))) whitelistStore.push(w);

// ── Activity audit (server.js:7231–7433) ─────────────────────────────────────
type DemoAuditRow = AuditRow & { tenantId: string; actorDept?: string; affectedUserDept?: string; affectedUserRole?: string; affectedUserEmail?: string };
const AUDIT: DemoAuditRow[] = [];

type Who = { id: string; name: string; role: string; dept?: string; empNo?: string; email?: string };
const who = (id: string): Who => {
  const p = personById(id);
  return p
    ? { id: p.id, name: p.name, role: p.role, dept: (typeof p.departmentId === 'string' ? p.departmentId : deptIdOf(p.dept)) ?? undefined, empNo: p.employeeNumber, email: p.email }
    : { id, name: id, role: 'employee' };
};
// Personas other than the active one are not in the people store: these rows name them as text.
const persona = (name: string, role: string, empNo: string, dept?: string): Who => ({ id: `demo-${role.replace(/_/g, '-')}`, name, role, empNo, dept });
const AFZAL_HR = persona('Afzal HR', 'hr', 'TM-1095', 'dept-hr');
const AFZAL_IT = persona('Afzal IT Admin', 'it_admin', 'TM-1094', 'dept-it');
const AFZAL_ACC = persona('Afzal Accounts', 'accounts', 'TM-1097', 'dept-accounts');

function row(at: string, actor: Who, r: Partial<DemoAuditRow> & { module: string; activityType: string; action: string; description: string }, affected?: Who): DemoAuditRow {
  return {
    id: `audit-${Date.parse(at)}-${AUDIT.length}`,
    tenantId: DEMO_TENANT_ID,
    createdAt: at,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    actorEmail: actor.email ?? `${low(actor.name).replace(/[^a-z]+/g, '.')}.demo@tamadamedia.com`,
    actorDept: actor.dept,
    affectedUserId: affected?.id,
    affectedUserName: affected?.name,
    affectedUserEmpId: affected?.empNo,
    affectedUserEmail: affected?.email,
    affectedUserDept: affected?.dept,
    affectedUserRole: affected?.role,
    entityType: r.entityType ?? '',
    entityId: r.entityId ?? null,
    ipAddress: `49.205.${Math.floor(rand(`${at}ip`) * 200) + 20}.${Math.floor(rand(`${at}ip2`) * 250) + 2}`,
    userAgent: rand(at) > 0.5 ? 'DASH mobile (Android)' : 'Chrome on Windows',
    status: 'success',
    ...r,
  };
}

const PICK = ['u-rahul', 'u-anita', 'u-sneha', 'u-farhan', 'u-meera', 'u-imran', 'u-sanjay', 'u-zoya', 'u-kavya', 'u-nikhil', 'u-ravi', 'u-pooja'];
const MANAGERS = ['u-priya', 'u-deepa', 'u-vikram', 'u-lakshmi'];
const pick = <X>(list: X[], i: number) => list[i % list.length]!;

type Template = (i: number, at: string) => DemoAuditRow;
const TEMPLATES: Template[] = [
  (i, at) => {
    const a = who(pick(PICK, i));
    return row(at, a, { module: 'Booking', activityType: 'booking', action: 'created', entityType: 'booking', entityId: `bk-${i}`, description: `${a.name} booked Sanjay Kumar (Editor) for ${addDays(T0, (i % 9) + 1)}` }, a);
  },
  (i, at) => {
    const m = who(pick(MANAGERS, i));
    const a = who(pick(PICK, i + 3));
    return row(at, m, { module: 'Booking', activityType: 'booking', action: 'approved', entityType: 'booking', entityId: `bk-${i}`, description: `${m.name} approved ${a.name}'s booking of Meeting Room 2`, previousData: { status: 'pending' }, newData: { status: 'approved' } }, a);
  },
  (i, at) => {
    const a = who(pick(PICK, i + 1));
    return row(at, a, { module: 'Service Desk', activityType: 'service_request', action: 'created', entityType: 'ticket', entityId: `tk-${i}`, description: `${a.name} raised an IT request: ${pick(['Laptop running slow', 'Need a second monitor', 'VPN keeps dropping', 'Shared drive access'], i)}` }, a);
  },
  (i, at) => {
    const a = who(pick(PICK, i + 2));
    return row(at, AFZAL_IT, { module: 'Service Desk', activityType: 'service_request', action: 'updated', entityType: 'ticket', entityId: `tk-${i - 1}`, description: `Afzal IT Admin accepted ${a.name}'s request and assigned it to Ravi Teja`, previousData: { status: 'open', assignedTo: '' }, newData: { status: 'in_progress', assignedTo: 'Ravi Teja' } }, a);
  },
  (i, at) => {
    const a = who(pick(PICK, i + 4));
    return row(at, a, { module: 'Profile', activityType: 'profile', action: 'updated', entityType: 'user', entityId: a.id, description: `${a.name} updated their profile — changed mobile, city`, previousData: { mobile: '+919000110000', city: 'Secunderabad' }, newData: { mobile: '+919000110042', city: 'Hyderabad' } }, a);
  },
  (i, at) => {
    const m = who(pick(MANAGERS, i + 1));
    const a = who(pick(PICK, i + 5));
    return row(at, m, { module: 'Tasks', activityType: 'task', action: 'created', entityType: 'task', entityId: `t-${i}`, description: `${m.name} assigned "${pick(['Diwali film — rough cut', 'Aarogya teaser colour pass', 'Kathalu S2 ep 4 sound mix', 'Showreel title cards'], i)}" to ${a.name}` }, a);
  },
  (i, at) => {
    const m = who(pick(MANAGERS, i + 2));
    const a = who(pick(PICK, i + 6));
    const ok = i % 4 !== 0;
    return row(
      at,
      m,
      { module: 'Leave', activityType: 'approval', action: ok ? 'approved' : 'rejected', entityType: 'leave', entityId: `lv-${i}`, description: `${m.name} ${ok ? 'approved' : 'rejected'} ${a.name}'s leave (${(i % 3) + 1} days)`, previousData: { status: 'pending' }, newData: { status: ok ? 'approved' : 'rejected' } },
      a,
    );
  },
  (i, at) =>
    row(at, i % 2 ? AFZAL_HR : AFZAL_ACC, {
      module: 'Reports',
      activityType: 'report',
      action: 'downloaded',
      entityType: 'report',
      description: i % 2 ? 'Afzal HR downloaded the attendance report for September' : 'Afzal Accounts downloaded the petty cash statement for September',
    }),
  (i, at) => {
    const a = who(pick(PICK, i + 7));
    return row(at, a, { module: 'Auth', activityType: 'other', action: 'login', entityType: 'session', description: `${a.name} signed in on the DASH app` }, a);
  },
  (i, at) => {
    const a = who(pick(PICK, i + 8));
    return row(
      at,
      AFZAL_HR,
      { module: 'Config', activityType: 'configuration', action: 'updated', entityType: 'whitelist', entityId: `wl-${i}`, description: `Afzal HR updated whitelist entry for ${a.name} — changed job title`, previousData: { jobTitle: 'Video Editor' }, newData: { jobTitle: 'Senior Video Editor' } },
      a,
    );
  },
  (i, at) =>
    row(at, AFZAL_IT, {
      module: 'Subscriptions',
      activityType: 'other',
      action: 'created',
      entityType: 'subscription_payment',
      description: `Recorded a ₹${pick(['4,250', '3,050', '16,800'], i)} payment for ${pick(['ChatGPT Team', 'Frame.io', 'Google Workspace'], i)}`,
    }),
  (i, at) => {
    const a = who(pick(PICK, i + 9));
    return row(at, a, { module: 'Payroll', activityType: 'report', action: 'downloaded', status: 'failed', entityType: 'report', description: `${a.name} tried to download the payroll register — not allowed` }, a);
  },
];

// ~70 rows over the last 30 days, a few of them today; the newest first.
// Today's rows are kept before the current time (the demo's own writes then come out on top).
const NOW_MIN = nowMinutesIst();
for (let i = 0; i < 70; i++) {
  let day = Math.min(29, Math.floor(i / 2.4));
  let minutes = 9 * 60 + 15 + Math.floor(rand(`audit-${i}`) * 9 * 60);
  if (day === 0 && minutes > NOW_MIN - 5) {
    if (NOW_MIN > 9 * 60) minutes = Math.max(0, NOW_MIN - 15 - i * 9);
    else day = 1;
  }
  const at = istIso(addDays(T0, -day), minutes);
  AUDIT.push(pick(TEMPLATES, i)(i, at));
}
// The company's own settings history (permission rows like routes/tenants.js:103 writes).
AUDIT.push(
  row(istIso(addDays(T0, -12), '11:05'), persona('Afzal Super Admin', 'super_admin', 'TM-1092', 'dept-leadership'), {
    module: 'Config',
    activityType: 'configuration',
    action: 'permission_granted',
    entityType: 'tenant',
    entityId: DEMO_TENANT_ID,
    description: 'Gave Afzal HR access to the activity audit',
    previousData: { auditAccess: [] },
    newData: { auditAccess: ['Afzal HR'] },
  }),
);
AUDIT.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

/** createAuditLog for a write made in the demo: the active persona did it, just now. */
function log(r: Partial<DemoAuditRow> & { module: string; activityType: string; action: string; description: string }, affected?: Who) {
  const p = currentPersona();
  AUDIT.unshift(row(nowIso(), { id: DEMO_USER.id, name: String(DEMO_USER.name), role: p.role, dept: p.deptId ?? undefined, empNo: p.employeeNumber }, r, affected));
}

function hasAuditPermission(perm: 'viewLogs' | 'searchUsers' | 'viewDetail' | 'downloadReports') {
  const u = me();
  if (u.role === 'super_admin' || u.role === 'master_admin') return true;
  if (!u.tenantId) return false;
  const grants = Array.isArray(TENANT.auditAccess) ? TENANT.auditAccess : [];
  const g = grants.find((x) => (x.userId && x.userId === u.id) || (x.empNo && x.empNo === u.employeeNumber));
  return !!g?.permissions?.[perm];
}

/** filterAuditRows (server.js:7275). `dept` is a department id; rows store ids too. */
function filterAudit(rows: DemoAuditRow[], q: URLSearchParams | Record<string, string | undefined>) {
  const get = (k: string) => (q instanceof URLSearchParams ? (q.get(k) ?? '') : (q[k] ?? ''));
  let out = rows;
  const f = { dateFrom: get('dateFrom'), dateTo: get('dateTo'), module: get('module'), activityType: get('activityType'), action: get('action'), dept: get('dept'), role: get('role'), status: get('status'), userId: get('userId'), search: get('search') };
  // The real filter compares the stored UTC timestamps with the plain dates; the demo compares India dates.
  const ist = (iso?: string) => (iso ? new Date(Date.parse(iso) + 330 * 60000).toISOString().slice(0, 10) : '');
  if (f.dateFrom) out = out.filter((r) => ist(r.createdAt) >= f.dateFrom);
  if (f.dateTo) out = out.filter((r) => ist(r.createdAt) <= f.dateTo);
  if (f.module) out = out.filter((r) => r.module === f.module);
  if (f.activityType) out = out.filter((r) => r.activityType === f.activityType);
  if (f.action) out = out.filter((r) => r.action === f.action);
  if (f.dept) out = out.filter((r) => r.affectedUserDept === f.dept || r.actorDept === f.dept);
  if (f.role) out = out.filter((r) => r.affectedUserRole === f.role || r.actorRole === f.role);
  if (f.status) out = out.filter((r) => r.status === f.status);
  if (f.userId) out = out.filter((r) => r.affectedUserId === f.userId);
  if (f.search) {
    const s = low(f.search);
    out = out.filter((r) => low([r.actorName, r.affectedUserName, r.affectedUserEmpId, r.affectedUserEmail, r.description, r.module, r.entityId].filter(Boolean).join(' ')).includes(s));
  }
  return [...out].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

const auditRowsFor = (rows: DemoAuditRow[]) => rows.map(({ tenantId: _t, actorDept: _a, affectedUserDept: _d, affectedUserRole: _r, affectedUserEmail: _e, ...r }) => r as AuditRow);

// ── Subscriptions (subscriptions.js) ─────────────────────────────────────────
type SubSeed = {
  id: string;
  name: string;
  department: string;
  plan: string;
  period: string;
  status: string;
  amountInr: number;
  amountUsd: number;
  renewalIn: number | null;
  kekaCode: string;
  accountEmail: string;
  loginUrl: string;
  payee: string;
  paymentMode: string;
  owner: string;
  comments: string;
};
type StoredSub = Omit<SubSeed, 'renewalIn'> & { renewalDate: string; tenantId: string; createdAt: string; createdByName: string; updatedAt: string; updatedByName: string };
type StoredPayment = Omit<SubPayment, 'kekaMissing'> & { tenantId: string; period: string; createdAt: string; createdByName: string };

const PERIODS: Record<string, { label: string; perMonth: number; perYear: number; months: number }> = {
  monthly: { label: 'Monthly', perMonth: 1, perYear: 12, months: 1 },
  quarterly: { label: 'Quarterly', perMonth: 1 / 3, perYear: 4, months: 3 },
  half_yearly: { label: 'Half-Yearly', perMonth: 1 / 6, perYear: 2, months: 6 },
  yearly: { label: 'Yearly', perMonth: 1 / 12, perYear: 1, months: 12 },
  one_time: { label: 'One-Time', perMonth: 0, perYear: 0, months: 0 },
};
const STATUS_LABEL: Record<string, string> = { active: 'Active', not_using: 'Not Using', cancelled: 'Cancelled' };

const SUB_SEEDS: SubSeed[] = [
  { id: 'sub-adobe', name: 'Adobe Creative Cloud', department: 'Creative', plan: 'All Apps (Teams, 4 seats)', period: 'monthly', status: 'active', amountInr: 23600, amountUsd: 0, renewalIn: 12, kekaCode: 'TM_INT_ADMIN', accountEmail: 'creative@tamadamedia.com', loginUrl: 'https://account.adobe.com', payee: 'Tamada', paymentMode: 'CC 9000', owner: 'Priya Sharma', comments: 'Edit floor seats' },
  { id: 'sub-canva', name: 'Canva Pro', department: 'Marketing', plan: 'Teams', period: 'yearly', status: 'active', amountInr: 13500, amountUsd: 0, renewalIn: 5, kekaCode: 'TM_AAR_BRAND26', accountEmail: 'marketing@tamadamedia.com', loginUrl: 'https://www.canva.com/login', payee: 'Tamada', paymentMode: 'UPI', owner: 'Vikram Singh', comments: '' },
  { id: 'sub-frameio', name: 'Frame.io', department: 'Creative', plan: 'Team', period: 'monthly', status: 'active', amountInr: 3050, amountUsd: 37, renewalIn: -4, kekaCode: 'TM_SJW_DIWALI26', accountEmail: 'review@tamadamedia.com', loginUrl: 'https://app.frame.io', payee: 'Tamada', paymentMode: 'CC 9000', owner: 'Sanjay Kumar', comments: 'Client review links' },
  { id: 'sub-gws', name: 'Google Workspace', department: 'IT & Admin', plan: 'Business Standard (14 users)', period: 'monthly', status: 'active', amountInr: 16800, amountUsd: 0, renewalIn: 10, kekaCode: 'TM_INT_ADMIN', accountEmail: 'admin@tamadamedia.com', loginUrl: 'https://admin.google.com', payee: 'Tamada', paymentMode: 'Acc Pay', owner: 'Naveen Kumar', comments: '' },
  { id: 'sub-chatgpt', name: 'ChatGPT Team', department: 'AI Initiatives', plan: 'Team (2 seats)', period: 'monthly', status: 'active', amountInr: 4250, amountUsd: 50, renewalIn: 18, kekaCode: 'TM_NIM_EXPL', accountEmail: 'ai@tamadamedia.com', loginUrl: 'https://chatgpt.com', payee: 'Tamada', paymentMode: 'CC 9000', owner: 'Meera Nair', comments: 'Scripts and research' },
  { id: 'sub-midjourney', name: 'Midjourney', department: 'Creative', plan: 'Standard', period: 'monthly', status: 'not_using', amountInr: 2550, amountUsd: 30, renewalIn: 9, kekaCode: 'TM_INT_REEL26', accountEmail: 'creative@tamadamedia.com', loginUrl: 'https://www.midjourney.com', payee: 'Tamada', paymentMode: 'CC 9000', owner: 'Sneha Iyer', comments: 'Nobody has used it since July' },
  { id: 'sub-dropbox', name: 'Dropbox Business', department: 'Production', plan: 'Advanced', period: 'yearly', status: 'cancelled', amountInr: 28000, amountUsd: 0, renewalIn: null, kekaCode: 'TM_KTH_S2', accountEmail: 'production@tamadamedia.com', loginUrl: 'https://www.dropbox.com/login', payee: 'Tamada', paymentMode: 'Acc Pay', owner: 'Deepa Menon', comments: 'Moved to Google Drive' },
  { id: 'sub-envato', name: 'Envato Elements', department: 'Creative', plan: 'Teams', period: 'yearly', status: 'active', amountInr: 16500, amountUsd: 0, renewalIn: 140, kekaCode: '', accountEmail: 'creative@tamadamedia.com', loginUrl: 'https://elements.envato.com', payee: 'Tamada', paymentMode: 'CC 9000', owner: 'Priya Sharma', comments: 'Stock footage and templates' },
  { id: 'sub-epidemic', name: 'Epidemic Sound', department: 'Creative', plan: 'Commercial', period: 'quarterly', status: 'active', amountInr: 7200, amountUsd: 0, renewalIn: 44, kekaCode: 'TM_KTH_S2', accountEmail: 'audio@tamadamedia.com', loginUrl: 'https://www.epidemicsound.com', payee: 'Tamada', paymentMode: 'UPI', owner: 'Anita Desai', comments: 'Music library' },
  { id: 'sub-zoom', name: 'Zoom Pro', department: 'Leadership', plan: 'Pro', period: 'monthly', status: 'active', amountInr: 1300, amountUsd: 0, renewalIn: 27, kekaCode: '', accountEmail: 'kiran.rao.demo@tamadamedia.com', loginUrl: 'https://zoom.us/signin', payee: 'Tamada', paymentMode: 'CC 9000', owner: 'Kiran Rao', comments: '' },
];

const SUBS: StoredSub[] = SUB_SEEDS.map(({ renewalIn, ...s }) => ({
  ...s,
  renewalDate: renewalIn === null ? '' : addDays(T0, renewalIn),
  tenantId: DEMO_TENANT_ID,
  createdAt: istIso(addDays(T0, -200), '10:00'),
  createdByName: 'Afzal IT Admin',
  updatedAt: istIso(addDays(T0, -30), '12:00'),
  updatedByName: 'Afzal IT Admin',
}));

// The payment ledger: each standing subscription paid on its cycle since January (last financial year
// included, so "All time" differs from this financial year), the cancelled one paid once.
const PAYMENTS: StoredPayment[] = [];
{
  const firstMonth = `${Number(T0.slice(0, 4))}-01`;
  const months: string[] = [];
  for (let ym = firstMonth; ym <= T0.slice(0, 7); ) {
    months.push(ym);
    const [y, m] = ym.split('-').map(Number) as [number, number];
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  for (const s of SUBS) {
    const p = PERIODS[s.period] ?? PERIODS.monthly!;
    const due = s.renewalDate ? Number(s.renewalDate.slice(8, 10)) : 6;
    const day = String(Math.min(28, Math.max(1, due))).padStart(2, '0');
    months.forEach((ym, i) => {
      const paidOn = `${ym}-${day}`;
      if (paidOn > T0) return;
      if (s.status === 'cancelled' ? i !== 1 : p.months === 0 || i % p.months !== (months.length - 1) % p.months) return;
      PAYMENTS.push({
        id: `subpay-${s.id.slice(4)}-${ym}`,
        subscriptionId: s.id,
        name: s.name,
        department: s.department,
        plan: s.plan,
        period: s.period,
        paidOn,
        amountInr: s.amountInr,
        amountUsd: s.amountUsd,
        kekaCode: s.kekaCode,
        comments: s.status === 'cancelled' ? 'Last renewal before cancelling' : i === months.length - 1 ? 'Renewed' : '',
        source: 'manual',
        tenantId: DEMO_TENANT_ID,
        createdAt: istIso(paidOn, '15:00'),
        createdByName: 'Afzal IT Admin',
      });
    });
  }
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
const runRate = (s: { period: string; amountInr: number }) => {
  const p = PERIODS[s.period] ?? PERIODS.monthly!;
  return { monthly: round2(num(s.amountInr) * p.perMonth), yearly: round2(num(s.amountInr) * p.perYear) };
};
const daysUntil = (ymd: string) => (ymd ? Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000) : null);

function publicSub(s: StoredSub): Subscription {
  const r = runRate(s);
  return {
    id: s.id,
    name: s.name,
    department: s.department,
    plan: s.plan,
    period: s.period,
    periodLabel: (PERIODS[s.period] ?? PERIODS.monthly!).label,
    status: s.status,
    statusLabel: STATUS_LABEL[s.status] ?? 'Active',
    accountEmail: s.accountEmail,
    loginUrl: s.loginUrl,
    amountInr: num(s.amountInr),
    amountUsd: num(s.amountUsd),
    monthlyInr: r.monthly,
    yearlyInr: r.yearly,
    renewalDate: s.renewalDate,
    daysToRenewal: daysUntil(s.renewalDate),
    payee: s.payee,
    paymentMode: s.paymentMode,
    kekaCode: s.kekaCode,
    kekaMissing: !str(s.kekaCode),
    owner: s.owner,
    comments: s.comments,
    createdByName: s.createdByName,
    updatedAt: s.updatedAt,
    updatedByName: s.updatedByName,
  };
}

const publicPayment = ({ tenantId: _t, period: _p, createdAt: _c, createdByName: _n, ...p }: StoredPayment): SubPayment => ({ ...p, kekaMissing: !str(p.kekaCode) });

/** summarise (subscriptions.js:404). */
function summarise(subs: StoredSub[], pays: StoredPayment[], from: string, to: string): SubSummary {
  const inRange = (d: string) => !!d && (!from || d >= from) && (!to || d <= to);
  const totals: SubTotals = { activeCount: 0, notUsingCount: 0, cancelledCount: 0, monthlyInr: 0, yearlyInr: 0, wastedMonthlyInr: 0, wastedYearlyInr: 0, kekaMissingCount: 0, spendInRangeInr: 0, spendInRangeUsd: 0, paymentsInRange: 0 };
  const byDept: Record<string, SubDeptRow> = {};
  const dept = (name: string) => {
    const key = str(name) || 'Unassigned';
    byDept[key] ??= { department: key, activeCount: 0, notUsingCount: 0, monthlyInr: 0, yearlyInr: 0, wastedMonthlyInr: 0, spendInRangeInr: 0 };
    return byDept[key]!;
  };
  for (const s of subs) {
    const d = dept(s.department);
    const r = runRate(s);
    if (s.status === 'cancelled') {
      totals.cancelledCount++;
      continue;
    }
    if (!str(s.kekaCode)) totals.kekaMissingCount++;
    if (s.status === 'not_using') {
      totals.notUsingCount++;
      d.notUsingCount++;
      totals.wastedMonthlyInr += r.monthly;
      totals.wastedYearlyInr += r.yearly;
      d.wastedMonthlyInr += r.monthly;
      continue;
    }
    totals.activeCount++;
    d.activeCount++;
    totals.monthlyInr += r.monthly;
    totals.yearlyInr += r.yearly;
    d.monthlyInr += r.monthly;
    d.yearlyInr += r.yearly;
  }
  const byMonth: Record<string, number> = {};
  for (const p of pays) {
    if (!inRange(p.paidOn)) continue;
    totals.paymentsInRange++;
    totals.spendInRangeInr += num(p.amountInr);
    totals.spendInRangeUsd += num(p.amountUsd);
    dept(p.department).spendInRangeInr += num(p.amountInr);
    const k = p.paidOn.slice(0, 7);
    byMonth[k] = round2((byMonth[k] ?? 0) + num(p.amountInr));
  }
  for (const k of Object.keys(totals) as (keyof SubTotals)[]) totals[k] = round2(totals[k]);
  const byDepartment = Object.values(byDept)
    .map((d) => ({ ...d, monthlyInr: round2(d.monthlyInr), yearlyInr: round2(d.yearlyInr), wastedMonthlyInr: round2(d.wastedMonthlyInr), spendInRangeInr: round2(d.spendInRangeInr) }))
    .sort((a, b) => b.yearlyInr - a.yearlyInr || a.department.localeCompare(b.department));
  return { totals, byDepartment, byMonth: Object.keys(byMonth).sort().map((month) => ({ month, amountInr: byMonth[month]! })), range: { from, to } };
}

const DENY_READ = 'You do not have access to the Subscriptions tracker. Ask an IT Admin to grant it in Config → Subscriptions Access.';
const DENY_WRITE = 'Only IT Admin can add or change subscriptions. You have view access.';

/** permissions (subscriptions.js:252): the admin roles, or a subscriptionAccess grant (userId → empNo → name). */
function subPerms() {
  const u = me();
  const admin = SUBSCRIPTION_ADMIN_ROLES.includes(u.role);
  const grants = Array.isArray(TENANT.subscriptionAccess) ? TENANT.subscriptionAccess : [];
  const granted =
    admin ||
    grants.some((g) => (g.userId && g.userId === u.id) || (!!low(g.empNo) && low(g.empNo) === low(u.employeeNumber)) || (!!low(g.name) && low(g.name) === low(u.name)));
  return { canAccess: admin || granted, canManage: admin };
}

const toDateOnly = (v: unknown) => {
  const s = str(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};
const PERIOD_IDS = Object.keys(PERIODS);
const STATUS_IDS = ['active', 'not_using', 'cancelled'];

function buildSub(body: Record<string, unknown>, prev: StoredSub | null): StoredSub {
  const pick = (k: keyof StoredSub, fallback: unknown) => (body[k] === undefined ? (prev && prev[k] !== undefined ? prev[k] : fallback) : body[k]);
  const period = str(pick('period', 'monthly'));
  const status = str(pick('status', 'active'));
  return {
    id: prev?.id ?? newId('sub'),
    tenantId: prev?.tenantId ?? DEMO_TENANT_ID,
    name: str(pick('name', '')),
    department: str(pick('department', '')),
    plan: str(pick('plan', '')),
    period: PERIOD_IDS.includes(period) ? period : 'monthly',
    status: STATUS_IDS.includes(status) ? status : 'active',
    accountEmail: str(pick('accountEmail', '')),
    loginUrl: str(pick('loginUrl', '')),
    amountInr: num(pick('amountInr', 0)),
    amountUsd: num(pick('amountUsd', 0)),
    renewalDate: toDateOnly(pick('renewalDate', '')),
    payee: str(pick('payee', '')),
    paymentMode: str(pick('paymentMode', '')),
    kekaCode: str(pick('kekaCode', '')),
    owner: str(pick('owner', '')),
    comments: str(pick('comments', '')),
    createdAt: prev?.createdAt ?? nowIso(),
    createdByName: prev?.createdByName ?? String(DEMO_USER.name),
    updatedAt: nowIso(),
    updatedByName: String(DEMO_USER.name),
  };
}

// ── HR by department (hr.js:518–596) ─────────────────────────────────────────
const HR_MODULES: Omit<HrModuleInfo, 'granted'>[] = [
  { id: 'attendance', label: 'Clock In / Out & Attendance', group: 'Time', available: true },
  { id: 'regularization', label: 'Attendance Regularization', group: 'Time', available: true },
  { id: 'shifts', label: 'Shifts & Rosters', group: 'Time', available: true },
  { id: 'holidays', label: 'Holiday Calendar', group: 'Time', available: true },
  { id: 'leave', label: 'Leave Management', group: 'Time', available: true },
  { id: 'wfh', label: 'Work From Home', group: 'Time', available: true },
  { id: 'comp_off', label: 'Comp-Off', group: 'Time', available: true },
  { id: 'policies', label: 'HR Policies', group: 'People', available: true },
  { id: 'salary', label: 'Salary Structure & Breakup', group: 'Payroll', available: true },
  { id: 'payroll', label: 'Payroll Processing', group: 'Payroll', available: true },
  { id: 'tax', label: 'Statutory & Tax', group: 'Payroll', available: true },
  { id: 'payslips', label: 'Payslips', group: 'Payroll', available: true },
  { id: 'reimbursements', label: 'Reimbursements & Loans', group: 'Payroll', available: true },
];
const COMPANY_HR_MODULES = HR_MODULES.map((m) => m.id);
const STAFF_MODULES = ['attendance', 'regularization', 'shifts', 'holidays', 'leave', 'wfh', 'comp_off', 'policies', 'salary', 'payslips', 'reimbursements'];
const HR_ACCESS: Record<string, { enabled: boolean; modules: string[] }> = {
  'dept-creative': { enabled: true, modules: [...STAFF_MODULES] },
  'dept-production': { enabled: true, modules: [...STAFF_MODULES] },
  'dept-marketing': { enabled: true, modules: [...STAFF_MODULES] },
  'dept-accounts': { enabled: true, modules: [...STAFF_MODULES] },
  'dept-hr': { enabled: true, modules: [...COMPANY_HR_MODULES] },
  'dept-it': { enabled: true, modules: ['attendance', 'regularization', 'holidays', 'leave', 'wfh', 'policies', 'payslips'] },
  'dept-leadership': { enabled: false, modules: [] },
};

function hrOverview(): HrConfigOverview {
  return {
    tenant: { enabled: true, modules: [...COMPANY_HR_MODULES] },
    catalogue: HR_MODULES.map((m) => ({ ...m, granted: COMPANY_HR_MODULES.includes(m.id) })),
    departments: DEPARTMENTS.map((d) => {
      const a = HR_ACCESS[d.id];
      return { id: d.id, name: d.name, adminName: d.adminId ? (personById(d.adminId)?.name ?? '') : '', enabled: !!a?.enabled, modules: a ? [...a.modules] : [] };
    }).sort((x, y) => x.name.localeCompare(y.name)),
  };
}

function setDeptAccess(ids: unknown[], enabled: unknown, modulesIn: unknown) {
  const p = currentPersona();
  if (p.role === 'master_admin') return fail('A company Super Admin configures departments. Use Company Features to manage the company.', 403);
  if (typeof enabled !== 'boolean') return fail('enabled must be true or false.');
  let modules: string[] | null = null;
  if (modulesIn !== undefined) {
    if (!Array.isArray(modulesIn)) return fail('modules must be a list.');
    const bad = modulesIn.find((m) => !COMPANY_HR_MODULES.includes(String(m)));
    if (bad !== undefined) return fail(`"${String(bad)}" is not available for your company.`);
    modules = modulesIn.map(String);
  }
  const done: { id: string; enabled: boolean; modules: string[] }[] = [];
  for (const id of ids) {
    const dept = DEPARTMENTS.find((d) => d.id === id);
    if (!dept) return fail('Department not found.', 404);
    const prev = HR_ACCESS[dept.id] ?? { enabled: false, modules: [] };
    const next = { enabled, modules: modules ?? (prev.modules.length ? prev.modules : enabled ? [...COMPANY_HR_MODULES] : []) };
    HR_ACCESS[dept.id] = next;
    log({
      module: 'HR',
      activityType: 'configuration',
      action: enabled ? 'permission_granted' : 'permission_revoked',
      entityType: 'hrDepartmentAccess',
      entityId: dept.id,
      description: `${me().name} turned HR ${enabled ? 'ON' : 'OFF'} for department ${dept.name} (modules: ${next.modules.join(', ') || 'none'})`,
      previousData: prev,
      newData: next,
    });
    done.push({ id: dept.id, ...next });
  }
  return { ok: true, departments: done };
}

// Teams per department for the Team Roster access list (team_roster.js keeps them in its own table).
const TEAM_COUNT: Record<string, number> = { 'dept-creative': 3, 'dept-production': 2 };

// ── Grants: keep each one on the persona it names ────────────────────────────
// The demo server reads the active persona's id and name back as DEMO_USER's on the way in, so a grant
// the persona gives themselves would otherwise be stored under DEMO_USER (and then match every role).
const GRANT_KEYS = ['announcementCreators', 'bountyCreators', 'projectCreators', 'auditAccess', 'subscriptionAccess'] as const;
function ownGrants(list: unknown) {
  if (!Array.isArray(list)) return list;
  const u = me();
  return list.map((g) => {
    if (!g || typeof g !== 'object') return g;
    const x = { ...(g as Record<string, unknown>) };
    if (x.userId === DEMO_USER.id) x.userId = u.id;
    if (x.name === DEMO_USER.name) x.name = u.name;
    return x;
  });
}

const names = (list: unknown) => (Array.isArray(list) ? list.map((g) => String((g as { name?: string })?.name ?? '')).filter(Boolean) : []);

// ── Routes ───────────────────────────────────────────────────────────────────
export const companyRoutes: Route[] = [
  // routes/dashboard.js:46 — exact counts, tenant-scoped.
  [
    'GET',
    /^\/dashboard\/summary$/,
    (): DashboardSummary => ({
      users: allPeople().filter((p) => (p.tenantId ?? DEMO_TENANT_ID) === DEMO_TENANT_ID).length,
      departments: DEPARTMENTS.length,
      activeTasks: taskStore.filter((t) => t.status !== 'completed').length,
      pendingBookings: bookingStore.filter((b) => b.status === 'pending').length,
    }),
  ],

  // ── The company record (routes/tenants.js:53). Only the demo company: other ids are the platform's.
  [
    'PUT',
    new RegExp(`^/tenants/(${DEMO_TENANT_ID})$`),
    (_p, body) => {
      const u = me();
      if (!USER_ADMIN_ROLES.includes(u.role)) return fail('You do not have permission to change company settings.', 403);
      const patch: Record<string, unknown> = { ...(body ?? {}) };
      for (const k of ['id', 'performedById', 'actorId', 'visitorPublicToken']) delete patch[k];
      if (u.role !== 'master_admin') delete patch.featureFlags;
      if (u.role !== 'super_admin' && u.role !== 'master_admin') delete patch.bountyMonthlyEarnCap;
      for (const k of GRANT_KEYS) if (k in patch) patch[k] = ownGrants(patch[k]);
      const before: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) before[k] = clone((TENANT as Record<string, unknown>)[k]);
      patchTenant(patch as Partial<Tenant>);
      const changed = Object.keys(patch).filter((k) => JSON.stringify(before[k]) !== JSON.stringify((TENANT as Record<string, unknown>)[k]));
      for (const k of changed) {
        const grant = (GRANT_KEYS as readonly string[]).includes(k);
        const added = grant ? names(patch[k]).filter((n) => !names(before[k]).includes(n)) : [];
        log({
          module: 'Config',
          activityType: 'configuration',
          action: grant ? (added.length ? 'permission_granted' : 'permission_revoked') : 'updated',
          entityType: 'tenant',
          entityId: DEMO_TENANT_ID,
          description: grant
            ? `${me().name} changed who can ${k === 'auditAccess' ? 'open the activity audit' : k === 'subscriptionAccess' ? 'see subscriptions' : k === 'projectCreators' ? 'create projects' : k === 'bountyCreators' ? 'create bounty tasks' : 'post news'}`
            : `${me().name} changed company settings — ${k}`,
          previousData: { [k]: grant ? names(before[k]) : before[k] },
          newData: { [k]: grant ? names(patch[k]) : (TENANT as Record<string, unknown>)[k] },
        });
      }
      return { ok: true };
    },
  ],

  // PUT /departments/:id (Team Roster per department) is the people domain's route (fixtures/people.ts).
  [
    'GET',
    /^\/team-roster\/departments$/,
    () => {
      if (!OVERSEER_ROLES.includes(me().role)) return fail('Only a Super Admin can manage Team Roster access.', 403);
      return {
        globalEnabled: !!TENANT.teamRosterEnabled,
        departments: DEPARTMENTS.map(
          (d): TeamRosterDept => ({
            id: d.id,
            name: d.name,
            adminId: d.adminId,
            adminName: d.adminId ? (personById(d.adminId)?.name ?? '') : '',
            managerCount: d.teamRosterEnabled ? d.managerIds.length : 0,
            teamCount: TEAM_COUNT[d.id] ?? 0,
            teamRosterEnabled: !!d.teamRosterEnabled,
          }),
        ),
      };
    },
  ],

  // ── HR by department (hr.js:524 overview: master/super; :583 / :589 writes: super) ──
  [
    'GET',
    /^\/hr\/config\/overview$/,
    () => (OVERSEER_ROLES.includes(me().role) ? { ok: true, ...hrOverview() } : fail('Only a Super Admin can configure HR.', 403)),
  ],
  [
    'PUT',
    /^\/hr\/config\/departments\/([^/]+)$/,
    ([, id], body) => (OVERSEER_ROLES.includes(me().role) ? setDeptAccess([id], body?.enabled, body?.modules) : fail('Only a Super Admin can configure HR.', 403)),
  ],
  [
    'PUT',
    /^\/hr\/config\/departments$/,
    (_p, body) => {
      if (!OVERSEER_ROLES.includes(me().role)) return fail('Only a Super Admin can configure HR.', 403);
      const ids = body?.departmentIds;
      if (!Array.isArray(ids) || !ids.length || ids.length > 200) return fail('departmentIds must be a list of 1–200 departments.');
      return setDeptAccess(ids, body?.enabled, body?.modules);
    },
  ],

  // ── Activity audit (server.js:7300–7433) ──
  [
    'GET',
    /^\/audit_log$/,
    (_p, _b, q) => {
      if (!hasAuditPermission('viewLogs')) return fail('Not authorised to view audit logs.', 403);
      const page = Math.max(1, parseInt(q.get('page') ?? '', 10) || 1);
      const pageSize = Math.min(500, Math.max(1, parseInt(q.get('pageSize') ?? '', 10) || 50));
      const rows = filterAudit(AUDIT, q);
      return { ok: true, rows: auditRowsFor(rows.slice((page - 1) * pageSize, page * pageSize)), total: rows.length, page, pageSize };
    },
  ],
  [
    'GET',
    /^\/audit_log\/summary$/,
    (_p, _b, q): AuditSummary | ReturnType<typeof fail> => {
      if (!hasAuditPermission('viewLogs')) return fail('Not authorised to view audit logs.', 403);
      const rows = filterAudit(AUDIT, q);
      const t = today();
      const ist = (iso?: string) => (iso ? new Date(Date.parse(iso) + 330 * 60000).toISOString().slice(0, 10) : '');
      return {
        totalActivities: rows.length,
        activitiesToday: rows.filter((r) => ist(r.createdAt) === t).length,
        activeUsers: new Set(rows.map((r) => r.actorId).filter(Boolean)).size,
        bookingsActivity: rows.filter((r) => r.activityType === 'booking').length,
        serviceRequestActivity: rows.filter((r) => r.activityType === 'service_request').length,
        profileChanges: rows.filter((r) => r.activityType === 'profile').length,
        reportDownloads: rows.filter((r) => r.action === 'downloaded').length,
      };
    },
  ],
  [
    'GET',
    /^\/audit_log\/user-search$/,
    (_p, _b, q) => {
      if (!hasAuditPermission('searchUsers')) return fail('Not authorised to search users.', 403);
      const needle = low(q.get('q'));
      const seen = new Set<string>();
      const pool = [...allPeople().map((p) => ({ id: p.id, name: p.name, email: p.email, dept: p.departmentId ?? '', role: p.role, employeeNumber: p.employeeNumber, jobTitle: p.jobTitle })), ...whitelistStore.map((w) => ({ id: w.id, name: w.name, email: w.email, dept: w.dept ?? '', role: w.role, employeeNumber: w.employeeNumber, jobTitle: w.jobTitle ?? '' }))].filter((u) => {
        const k = low(u.email || u.id);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const hits = pool.filter((u) => !needle || low([u.name, u.employeeNumber, u.email, u.dept, u.role].join(' ')).includes(needle)).slice(0, 100);
      // ok(res, array) spreads the array into the object: { ok: true, "0": {…}, "1": {…} }.
      return Object.assign({ ok: true }, clone(hits));
    },
  ],
  [
    'GET',
    /^\/audit_log\/user\/([^/]+)$/,
    ([, id]) => {
      if (!hasAuditPermission('viewLogs')) return fail('Not authorised to view audit logs.', 403);
      const p = personById(id!);
      const w = whitelistStore.find((x) => x.id === id);
      if (!p && !w) return notFound('User not found.');
      const timeline = AUDIT.filter((r) => r.affectedUserId === id);
      const user = p
        ? { id: p.id, name: p.name, email: p.email, role: p.role, dept: p.dept, deptName: p.dept, employeeNumber: p.employeeNumber, jobTitle: p.jobTitle }
        : { id: w!.id, name: w!.name, email: w!.email, role: w!.role, dept: w!.dept ?? '', employeeNumber: w!.employeeNumber, jobTitle: w!.jobTitle ?? '' };
      return { ok: true, user, totalActivities: timeline.length, lastActivityAt: timeline[0]?.createdAt ?? null, timeline: auditRowsFor(timeline.slice(0, 50)) };
    },
  ],
  [
    'POST',
    /^\/audit_log\/export$/,
    (_p, body) => {
      if (!hasAuditPermission('downloadReports')) return fail('Not authorised to download audit reports.', 403);
      const filters = (body?.filters && typeof body.filters === 'object' ? body.filters : {}) as Record<string, string | undefined>;
      const rows = filterAudit(AUDIT, filters);
      const subject = filters.userId ? personById(filters.userId) : null;
      log(
        {
          module: 'Reports',
          activityType: 'report',
          action: 'downloaded',
          entityType: 'audit_report',
          description: subject
            ? `${me().name} downloaded User Activity Audit Report for ${subject.name}`
            : `${me().name} downloaded the User Activity Audit Report${filters.dateFrom ? ` – Date Range: ${filters.dateFrom} to ${filters.dateTo || 'now'}` : ''}`,
        },
        subject ? { id: subject.id, name: subject.name, role: subject.role, empNo: subject.employeeNumber } : undefined,
      );
      return { ok: true, rows: auditRowsFor(rows) };
    },
  ],

  // ── Subscriptions (subscriptions.js; specific paths before /:id) ──
  [
    'GET',
    /^\/subscriptions\/summary$/,
    (_p, _b, q) => {
      if (!subPerms().canAccess) return fail(DENY_READ, 403);
      return { ok: true, ...summarise(SUBS, PAYMENTS, toDateOnly(q.get('from')), toDateOnly(q.get('to'))) };
    },
  ],
  [
    'GET',
    /^\/subscriptions\/payments$/,
    (_p, _b, q) => {
      const perm = subPerms();
      if (!perm.canAccess) return fail(DENY_READ, 403);
      const from = toDateOnly(q.get('from'));
      const to = toDateOnly(q.get('to'));
      const rows = PAYMENTS.filter((p) => (!from || p.paidOn >= from) && (!to || p.paidOn <= to))
        .map(publicPayment)
        .sort((a, b) => b.paidOn.localeCompare(a.paidOn));
      return { ok: true, payments: rows, canManage: perm.canManage };
    },
  ],
  [
    'POST',
    /^\/subscriptions\/payments$/,
    (_p, body) => {
      const perm = subPerms();
      if (!perm.canAccess) return fail(DENY_READ, 403);
      if (!perm.canManage) return fail(DENY_WRITE, 403);
      if (!str(body?.name)) return fail('Which software was this payment for?');
      const paidOn = toDateOnly(body?.paidOn);
      if (!paidOn) return fail('A payment needs a date.');
      const period = str(body?.period);
      const row: StoredPayment = {
        id: newId('subpay'),
        tenantId: DEMO_TENANT_ID,
        subscriptionId: str(body?.subscriptionId),
        name: str(body?.name),
        department: str(body?.department),
        plan: str(body?.plan),
        period: PERIOD_IDS.includes(period) ? period : '',
        paidOn,
        amountInr: num(body?.amountInr),
        amountUsd: num(body?.amountUsd),
        kekaCode: str(body?.kekaCode),
        comments: str(body?.comments),
        source: 'manual',
        createdAt: nowIso(),
        createdByName: String(DEMO_USER.name),
      };
      PAYMENTS.push(row);
      log({ module: 'Subscriptions', activityType: 'other', action: 'created', entityType: 'subscription_payment', entityId: row.id, description: `Recorded a ₹${row.amountInr} payment for ${row.name} on ${row.paidOn}` });
      return { ok: true, payment: publicPayment(row) };
    },
  ],
  [
    'DELETE',
    /^\/subscriptions\/payments\/([^/]+)$/,
    ([, id]) => {
      const perm = subPerms();
      if (!perm.canAccess) return fail(DENY_READ, 403);
      if (!perm.canManage) return fail(DENY_WRITE, 403);
      const i = PAYMENTS.findIndex((p) => p.id === id);
      if (i < 0) return fail('That payment no longer exists.', 404);
      const [gone] = PAYMENTS.splice(i, 1);
      log({ module: 'Subscriptions', activityType: 'other', action: 'deleted', entityType: 'subscription_payment', entityId: id, description: `Deleted the ${gone?.paidOn} payment for ${gone?.name}` });
      return { ok: true, deleted: true };
    },
  ],
  [
    'GET',
    /^\/subscriptions$/,
    () => {
      const perm = subPerms();
      if (!perm.canAccess) return fail(DENY_READ, 403);
      return {
        ok: true,
        subscriptions: SUBS.map(publicSub).sort((a, b) => a.name.localeCompare(b.name)),
        canManage: perm.canManage,
        periods: Object.keys(PERIODS).map((k) => ({ id: k, label: PERIODS[k]!.label })),
        statuses: STATUS_IDS.map((k) => ({ id: k, label: STATUS_LABEL[k] })),
      };
    },
  ],
  [
    'POST',
    /^\/subscriptions$/,
    (_p, body) => {
      const perm = subPerms();
      if (!perm.canAccess) return fail(DENY_READ, 403);
      if (!perm.canManage) return fail(DENY_WRITE, 403);
      if (!str(body?.name)) return fail('Give the subscription a name.');
      const s = buildSub(body ?? {}, null);
      SUBS.push(s);
      log({ module: 'Subscriptions', activityType: 'other', action: 'created', entityType: 'subscription', entityId: s.id, description: `Added subscription ${s.name} (${s.department || 'no department'})` });
      return { ok: true, subscription: publicSub(s) };
    },
  ],
  [
    'PUT',
    /^\/subscriptions\/([^/]+)$/,
    ([, id], body) => {
      const perm = subPerms();
      if (!perm.canAccess) return fail(DENY_READ, 403);
      if (!perm.canManage) return fail(DENY_WRITE, 403);
      const i = SUBS.findIndex((s) => s.id === id);
      if (i < 0) return fail('That subscription no longer exists.', 404);
      const prev = SUBS[i]!;
      const next = buildSub(body ?? {}, prev);
      const changed = (Object.keys(next) as (keyof StoredSub)[]).filter((k) => !['updatedAt', 'updatedByName'].includes(k) && JSON.stringify(next[k]) !== JSON.stringify(prev[k]));
      SUBS[i] = next;
      log({ module: 'Subscriptions', activityType: 'other', action: 'updated', entityType: 'subscription', entityId: next.id, description: `Updated ${next.name}${changed.length ? ` — ${changed.join(', ')}` : ''}`, previousData: prev, newData: next });
      return { ok: true, subscription: publicSub(next) };
    },
  ],
  [
    'DELETE',
    /^\/subscriptions\/([^/]+)$/,
    ([, id]) => {
      const perm = subPerms();
      if (!perm.canAccess) return fail(DENY_READ, 403);
      if (!perm.canManage) return fail(DENY_WRITE, 403);
      const i = SUBS.findIndex((s) => s.id === id);
      if (i < 0) return fail('That subscription no longer exists.', 404);
      const [gone] = SUBS.splice(i, 1);
      log({ module: 'Subscriptions', activityType: 'other', action: 'deleted', entityType: 'subscription', entityId: id, description: `Deleted subscription ${gone?.name}. Its payment history was kept.` });
      return { ok: true, deleted: true };
    },
  ],
];

