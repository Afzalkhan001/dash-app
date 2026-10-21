// Demo API for the people domain (wave 1): the Employee roster and Departments, answered the way the
// real handlers answer (routes/users.js, routes/whitelist.js, routes/departments.js, lib/authz.js).
// In the barrel (demo/fixtures/index.ts), so these routes win over the built-in fixtures.
//
//   GET    /whitelist                 invitations: 4 people who have not signed up (2 employees, one with a
//                                      reporting manager; 1 professional; 1 system login from User
//                                      Management), plus the invitation every signed-up colleague came in on
//   POST   /whitelist                 USER_ADMIN; upsert by email; role forced to employee unless a role
//                                      assigner; keeps only the server's own field list (no dob, blood group,
//                                      cadence or additional manager — the app follows with a PUT)
//   PUT    /whitelist/:id             USER_ADMIN; email changes dropped; role only for role assigners
//   DELETE /whitelist/:id             no check (the real route has none)
//   PUT    /users/:id (not me)        USER_ADMIN + filterUserWrite; resigning sweeps the bounty wallet into
//                                      the company wallet (users.js:270); weekly stamps timesheetWeeklySince
//   DELETE /users/:id                 DESTRUCTIVE_ROLES only (HR gets the real 403)
//   POST   /employees/change-email    USER_ADMIN; Super Admin / CEO / COO accounts only by a Super Admin;
//                                      refuses an address someone else already uses (409)
//   POST/PUT/DELETE /departments      USER_ADMIN
//   GET    /assets                    3 assets: Farhan Ali holds a camera, so resign / remove are blocked
//                                      for him until it is collected
//   GET    /bounty/wallet/:id (others) USER_ADMIN reads anyone's wallet (server.js:5124): Sneha has 320
//                                      coins, so "Mark as resigned" shows the sweep
//   GET    /org/directory             the built-in directory with these invitations as its "not signed up
//                                      yet" rows (instead of its single sample), so both lists agree
// Seeds added through org.ts's mutators: Dev Patel (resigned last month) and an Interns department with
// no members (so Delete can be tried). Shared data is changed only through the exported stores and
// mutators (org.ts PEOPLE / DEPARTMENTS / upsertPerson / removePerson / upsertDepartment, bounty.ts
// walletOf / addTx). Afzal HR and Afzal Super Admin can run every flow; Afzal IT Admin can resign but
// not change roles or remove; Afzal Admin and Afzal App Manager edit only.

import type { HeldAsset } from '@/api/people';
import { DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { addTx, walletOf } from '@/demo/fixtures/bounty';
import { DEPARTMENTS, orgRoutes, PEOPLE, type Person, personById, profile, removePerson, upsertDepartment, upsertPerson } from '@/demo/fixtures/org';
import { currentPersona } from '@/demo/personas';
import { addDays, clone, daysAgo, fail, newId, notFound, nowIso, type Route, today } from '@/demo/state';

// lib/authz.js:27-31.
const USER_ADMIN = ['master_admin', 'super_admin', 'ceo', 'coo', 'hr', 'admin', 'it_admin', 'app_manager'];
const ROLE_ASSIGNER = ['master_admin', 'super_admin', 'ceo', 'coo', 'hr'];
const DESTRUCTIVE = ['master_admin', 'super_admin', 'ceo', 'coo'];
const NEVER = ['password', 'id', '_id', 'timesheetWeeklySince'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const role = () => currentPersona().role;
const isAdmin = () => USER_ADMIN.includes(role());
const isAssigner = () => ROLE_ASSIGNER.includes(role());
const low = (v: unknown) => String(v ?? '').trim().toLowerCase();

// ── Seeds ────────────────────────────────────────────────────────────────────
const T0 = today();

// Someone who left last month (Production), so the Resigned filter and Rejoin have a row.
upsertPerson({
  id: 'u-dev',
  name: 'Dev Patel',
  email: 'dev.patel.demo@tamadamedia.com',
  role: 'employee',
  jobTitle: 'Production Assistant',
  dept: 'Production',
  employeeNumber: 'TM-1058',
  kekaCode: 'TM-1058',
  mobile: '+919000101058',
  phone: '+919000101058',
  reportingTo: 'u-deepa',
  reportingManager: 'Deepa Menon',
  dateJoined: '2022-11-14',
  dob: '1997-02-11',
  bloodGroup: 'A+ (A Positive)',
  gender: 'Male',
  location: 'Hyderabad',
  resigned: true,
  ...({ resignedAt: daysAgo(34, '17:30'), resignedBy: 'Lakshmi Prasad', resignedById: 'u-lakshmi' } as Partial<Person>),
});

// A department with nobody in it, so Delete can be tried.
upsertDepartment({ id: 'dept-interns', name: 'Interns', adminId: '', managerIds: [], managerId: '', teamRosterEnabled: false });

// Coins a resignation would sweep (the server reads the wallet's `available`).
walletOf('u-sneha').available = 320;
walletOf('u-rahul').available = 140;

export type WhitelistRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  dept: string | null;
  tenantId: string;
  employeeNumber: string;
  kekaCode: string;
  gender: string;
  mobile: string;
  location: string;
  jobTitle: string;
  jobRole?: string;
  reportingManager: string | null;
  reportingTo: string | null;
  additionalManager?: string;
  dateJoined: string;
  dob?: string;
  bloodGroup?: string;
  timesheetCadence?: string;
  source?: string;
  resigned?: boolean;
  resignedAt?: string | null;
  resignedBy?: string | null;
  resignedById?: string | null;
  createdAt: string;
};

const invite = (r: Partial<WhitelistRow> & Pick<WhitelistRow, 'id' | 'email' | 'name'>): WhitelistRow => ({
  role: 'employee',
  dept: null,
  tenantId: DEMO_TENANT_ID,
  employeeNumber: '',
  kekaCode: r.employeeNumber ?? '',
  gender: '',
  mobile: '',
  location: 'Hyderabad',
  jobTitle: '',
  reportingManager: null,
  reportingTo: null,
  dateJoined: '',
  createdAt: daysAgo(3, '11:00'),
  ...r,
});

/** The invitations (routes/whitelist.js). Exported for other domains' fixtures (User Management). */
export const whitelistStore: WhitelistRow[] = [
  // The same person as the directory's sample "not signed up yet" row (org.ts PENDING_ROSTER, wl:wl-tejas).
  invite({
    id: 'wl-tejas',
    email: 'tejas.kulkarni.demo@tamadamedia.com',
    name: 'Tejas Kulkarni',
    jobTitle: 'Motion Graphics Intern',
    dept: 'dept-creative',
    employeeNumber: 'TM-1111',
    kekaCode: 'TM-1111',
    gender: 'Male',
    mobile: '+919000188041',
    reportingManager: 'Priya Sharma',
    reportingTo: 'Priya Sharma',
    dateJoined: addDays(T0, 7),
    timesheetCadence: 'daily',
  }),
  invite({
    id: 'wl-ishita',
    email: 'ishita.bose.demo@tamadamedia.com',
    name: 'Ishita Bose',
    jobTitle: 'Copywriter',
    dept: 'dept-marketing',
    employeeNumber: 'TM-1112',
    kekaCode: 'TM-1112',
    gender: 'Female',
    mobile: '+919000188042',
    dateJoined: addDays(T0, 12),
    createdAt: daysAgo(1, '15:20'),
  }),
  invite({
    id: 'wl-kabir',
    email: 'kabir.sen.demo@tamadamedia.com',
    name: 'Kabir Sen',
    role: 'professional',
    jobTitle: 'Freelance Drone Operator',
    dept: 'dept-production',
    employeeNumber: 'TM-1113',
    kekaCode: 'TM-1113',
    gender: 'Male',
    mobile: '+919000188043',
    reportingManager: 'Deepa Menon',
    reportingTo: 'Deepa Menon',
    dateJoined: addDays(T0, 3),
  }),
  // A login provisioned in User Management (source 'system'): its role and removal are managed there.
  invite({
    id: 'wl-rohan',
    email: 'rohan.mehta.demo@tamadamedia.com',
    name: 'Rohan Mehta',
    role: 'manager',
    jobTitle: 'Studio Operations Manager',
    dept: 'dept-production',
    mobile: '+919000188044',
    source: 'system',
    createdAt: daysAgo(6, '10:05'),
  }),
  // Every signed-up colleague came in on an invitation (same email): the roster mirrors writes to it.
  ...PEOPLE.map((p) =>
    invite({
      id: `wl-${p.id.replace(/^u-/, '')}`,
      email: p.email,
      name: p.name,
      role: p.role,
      dept: String(p.departmentId || p.dept || '') || null,
      employeeNumber: p.employeeNumber,
      kekaCode: p.employeeNumber,
      gender: String(p.gender || ''),
      mobile: String(p.mobile || ''),
      jobTitle: String(p.jobTitle || ''),
      reportingManager: String(p.reportingManager || '') || null,
      reportingTo: String(p.reportingManager || '') || null,
      dateJoined: String(p.dateJoined || ''),
      resigned: !!p.resigned,
      createdAt: `${String(p.dateJoined || '2024-01-01')}T05:00:00.000Z`,
    }),
  ),
];

const wlById = (id: string) => whitelistStore.find((w) => w.id === id);
const signedUp = () => [profile, ...PEOPLE];
const userByEmail = (email: string) => signedUp().find((u) => low(u.email) === low(email));

// IT assets (GET /assets): only what the roster's held-asset check and the person screen read.
const ASSETS: (HeldAsset & { assetType: string; tenantId: string; status: string })[] = [
  { id: 'as-fx6', assetId: 'TM-CAM-014', name: 'Sony FX6 camera body', serial: 'FX6-2209-4471', assignedTo: 'Farhan Ali', assignedToEmpNo: 'TM-1066', type: 'Camera', assetType: 'Camera', condition: 'Good', tenantId: DEMO_TENANT_ID, status: 'assigned' },
  { id: 'as-lat', assetId: 'TM-LAP-031', name: 'Dell Latitude 5440', serial: 'DL5440-88K2', assignedTo: 'Ravi Teja', assignedToEmpNo: 'TM-1088', type: 'Laptop', assetType: 'Laptop', condition: 'Good', tenantId: DEMO_TENANT_ID, status: 'assigned' },
  { id: 'as-mic', assetId: 'TM-AUD-007', name: 'Rode NTG5 shotgun mic', serial: 'NTG5-1123', assignedTo: '', assignedToEmpNo: '', type: 'Audio', assetType: 'Audio', condition: 'Fair', tenantId: DEMO_TENANT_ID, status: 'available' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

// Demo people store their department by name (as DEMO_USER's `dept`); the app writes ids.
const deptNameOf = (v: unknown) => {
  const s = String(v ?? '').trim();
  return DEPARTMENTS.find((d) => d.id === s)?.name ?? s;
};

const trimNames = (body: Record<string, unknown>) => {
  for (const k of ['name', 'reportingManager', 'additionalManager']) if (typeof body[k] === 'string') body[k] = (body[k] as string).trim();
};

/** lib/authz.js filterUserWrite for an admin writing someone else's record. */
function filterWrite(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (k === 'performedById' || k === 'actorId') continue;
    if (NEVER.includes(k)) continue;
    if ((k === 'role' || k === 'tenantId') && !isAssigner()) continue;
    if (k === 'role' && v === 'master_admin' && role() !== 'master_admin') continue;
    out[k] = v;
  }
  return out;
}

/** The resignation sweep (users.js:270 bounty_return_to_company): whatever is left goes to the company. */
function sweepWallet(p: Person) {
  const w = walletOf(p.id, p.name);
  const remaining = Math.round(Number(w.available) || 0);
  if (remaining <= 0) return;
  w.available = 0;
  addTx({
    id: newId('btx'),
    type: 'RETURN_TO_COMPANY',
    amount: remaining,
    fromWalletId: p.id,
    fromWalletName: p.name,
    toWalletId: `company_${DEMO_TENANT_ID}`,
    toWalletName: 'Company wallet',
    reason: `Auto-transferred to the company wallet — ${p.name} was marked Resigned with ${remaining} coin(s) still in their wallet.`,
    performedBy: String(DEMO_USER.name),
    createdAt: nowIso(),
  });
}

function putUser(id: string, body: Record<string, unknown>) {
  if (!isAdmin()) return fail('You can only edit your own profile.', 403);
  const p = personById(id);
  if (!p) return notFound('User not found');
  const patch = filterWrite(body);
  // The login email changes only through POST /employees/change-email.
  if ('email' in patch && low(patch.email) !== low(p.email)) delete patch.email;
  if (patch.mobile !== undefined || patch.phone !== undefined) {
    const next = patch.mobile !== undefined ? patch.mobile : patch.phone;
    patch.mobile = next;
    patch.phone = next;
  }
  trimNames(patch);
  if (patch.dept !== undefined) patch.dept = patch.dept ? deptNameOf(patch.dept) : '';
  if (patch.timesheetCadence === 'weekly' && p.timesheetCadence !== 'weekly') patch.timesheetWeeklySince = today();
  const resigning = patch.resigned === true && !p.resigned;
  upsertPerson({ ...(patch as Partial<Person>), id });
  if (resigning) sweepWallet(p);
  return { ok: true };
}

// routes/whitelist.js:87 — the entry exactly as the server builds it.
function postWhitelist(body: Record<string, unknown>) {
  if (!isAdmin()) return fail('You do not have permission to add people to the whitelist.', 403);
  const email = low(body.email);
  if (!email) return fail('email required');
  let safeRole = String(body.role || 'employee');
  if (!isAssigner()) safeRole = 'employee';
  if (safeRole === 'master_admin' && role() !== 'master_admin') safeRole = 'employee';
  const rm = String(body.reportingManager || body.reportingTo || '').trim() || null;
  const entry = {
    email,
    name: String(body.name || '').trim(),
    role: safeRole,
    dept: (body.dept as string) || null,
    kekaCode: String(body.kekaCode || ''),
    tenantId: String(body.tenantId || DEMO_TENANT_ID),
    employeeNumber: String(body.employeeNumber || ''),
    gender: String(body.gender || ''),
    mobile: String(body.mobile || ''),
    location: String(body.location || ''),
    jobTitle: String(body.jobTitle || ''),
    reportingManager: rm,
    reportingTo: rm,
    dateJoined: String(body.dateJoined || ''),
  };
  const ex = whitelistStore.find((w) => low(w.email) === email);
  if (ex) {
    Object.assign(ex, entry);
    const u = userByEmail(email);
    if (u && u.id !== profile.id) {
      upsertPerson({ id: u.id, name: entry.name, dept: deptNameOf(entry.dept), role: entry.role, employeeNumber: entry.employeeNumber, gender: entry.gender, mobile: entry.mobile, phone: entry.mobile, location: entry.location, jobTitle: entry.jobTitle, reportingManager: rm ?? '', dateJoined: entry.dateJoined });
    }
    return { ok: true, entry: clone(ex) };
  }
  const row: WhitelistRow = { ...entry, id: `wl${Date.now()}`, createdAt: nowIso() };
  whitelistStore.push(row);
  // The real server now sends the welcome email and WhatsApp; the demo sends nothing.
  return { ok: true, entry: clone(row) };
}

function putWhitelist(id: string, body: Record<string, unknown>) {
  if (!isAdmin()) return fail('You do not have permission to edit the whitelist.', 403);
  const w = wlById(id);
  if (!w) return notFound('Not found');
  const patch: Record<string, unknown> = { ...body };
  delete patch.performedById;
  delete patch.actorId;
  delete patch.id;
  if ('email' in patch && low(patch.email) !== low(w.email)) delete patch.email;
  if (('role' in patch || 'tenantId' in patch) && !isAssigner()) {
    delete patch.role;
    delete patch.tenantId;
  }
  if (patch.role === 'master_admin' && role() !== 'master_admin') delete patch.role;
  // Photos live on the account (GET /whitelist/:id/avatar answers '' in the demo).
  delete patch.avatar;
  trimNames(patch);
  Object.assign(w, patch);
  return { ok: true };
}

function changeEmail(body: Record<string, unknown>) {
  if (!isAdmin()) return fail('You do not have permission to change an employee\'s email.', 403);
  const email = low(body.email);
  if (!EMAIL_RE.test(email) || email.length > 254) return fail('Enter a valid email address.');
  const userId = String(body.userId || '');
  const wlId = String(body.whitelistId || '');
  if (!userId && !wlId) return fail('Say which employee to change.');
  const user = userId ? personById(userId) : undefined;
  const wl0 = wlId ? wlById(wlId) : undefined;
  if (userId && !user) return notFound('Employee not found.');
  if (wlId && !wl0) return notFound('Employee not found.');
  const target = (user ?? wl0)!;
  const old = low(target.email);
  if (['master_admin', 'super_admin', 'ceo', 'coo'].includes(String(target.role)) && !['master_admin', 'super_admin'].includes(role())) {
    return fail(`Only a Super Admin can change the email of a ${target.role === 'super_admin' ? 'Super Admin' : String(target.role).toUpperCase()} account.`, 403);
  }
  if (email === old) return { ok: true, email, unchanged: true };
  const wl = wl0 ?? whitelistStore.find((w) => low(w.email) === old);
  const acct = user ?? (old ? userByEmail(old) : undefined);
  const clash = [...signedUp().filter((u) => u !== acct), ...whitelistStore.filter((w) => w !== wl)].find((x) => low(x.email) === email);
  if (clash) return fail(`${email} is already used by ${clash.name || 'another employee'}. Use a different address.`, 409);
  if (acct && acct.id !== profile.id) upsertPerson({ id: acct.id, email });
  if (wl) wl.email = email;
  // The real server emails the old address here.
  return { ok: true, email };
}

// The built-in directory, with these invitations as its "not signed up yet" rows.
const orgDirectory = orgRoutes.find(([m, re]) => m === 'GET' && re.test('/org/directory'))?.[2];
const FULL_VIEW = ['super_admin', 'ceo', 'coo', 'hr', 'master_admin'];
const NON_STAFF = ['master_admin', 'super_admin', 'accounts', 'hr', 'it_admin', 'app_manager', 'announcement_viewer'];

function directory(p: string[], body: unknown, query: URLSearchParams) {
  const base = orgDirectory ? (orgDirectory(p, body, query) as Record<string, unknown>[]) : [];
  const people = (Array.isArray(base) ? base : []).filter((r) => !r.pending);
  const signed = new Set(signedUp().map((u) => low(u.email)));
  const full = FULL_VIEW.includes(role());
  const pending = whitelistStore
    .filter((w) => !signed.has(low(w.email)) && !w.resigned && w.source !== 'system' && !NON_STAFF.includes(w.role))
    .map((w) => ({
      id: `wl:${w.id}`,
      name: w.name,
      role: w.role,
      jobTitle: w.jobTitle,
      reportingManager: w.reportingManager ?? '',
      reportingTo: personByNameId(w.reportingManager) ?? '',
      email: w.email,
      mobile: w.mobile,
      bloodGroup: w.bloodGroup ?? '',
      dateJoined: w.dateJoined,
      pending: true,
      ...(full ? { dept: w.dept ?? '', location: w.location, employeeNumber: w.employeeNumber } : null),
    }));
  return [...people, ...pending];
}
const personByNameId = (name: string | null | undefined) => (name ? signedUp().find((u) => u.name === name)?.id : undefined);

export const peopleRoutes: Route[] = [
  ['GET', /^\/whitelist$/, () => whitelistStore],
  ['POST', /^\/whitelist$/, (_p, body) => postWhitelist(body ?? {})],
  ['PUT', /^\/whitelist\/([^/]+)$/, ([, id], body) => putWhitelist(id!, body ?? {})],
  [
    'DELETE',
    /^\/whitelist\/([^/]+)$/,
    ([, id]) => {
      const i = whitelistStore.findIndex((w) => w.id === id);
      if (i >= 0) whitelistStore.splice(i, 1);
      return { ok: true };
    },
  ],
  // Someone else's record (my own stays with org.ts's self-edit route).
  ['PUT', new RegExp(`^/users/(?!${DEMO_USER.id}$)([^/]+)$`), ([, id], body) => putUser(id!, body ?? {})],
  [
    'DELETE',
    /^\/users\/([^/]+)$/,
    ([, id]) => {
      if (!DESTRUCTIVE.includes(role())) return fail('You do not have permission to delete user accounts.', 403);
      if (id === profile.id) return fail('You cannot delete your own account here.', 400);
      return removePerson(id!) ? { ok: true } : notFound('User not found');
    },
  ],
  ['POST', /^\/employees\/change-email$/, (_p, body) => changeEmail(body ?? {})],
  [
    'POST',
    /^\/departments$/,
    (_p, body) => {
      if (!isAdmin()) return fail('You do not have permission to create departments.', 403);
      const name = String(body?.name || '').trim();
      if (!name) return fail('name required');
      const d = upsertDepartment({ id: String(body?.id || newId('d')), name, adminId: String(body?.adminId || ''), managerId: String(body?.managerId || ''), managerIds: [], teamRosterEnabled: false });
      return { ok: true, dept: clone(d) };
    },
  ],
  [
    'PUT',
    /^\/departments\/([^/]+)$/,
    ([, id], body) => {
      if (!isAdmin()) return fail('You do not have permission to edit departments.', 403);
      if (!DEPARTMENTS.some((d) => d.id === id)) return notFound('Department not found');
      const b = body ?? {};
      upsertDepartment({
        id: id!,
        ...(typeof b.name === 'string' ? { name: b.name.trim() } : null),
        ...(typeof b.adminId === 'string' ? { adminId: b.adminId } : null),
        ...(typeof b.managerId === 'string' ? { managerId: b.managerId } : null),
        ...(Array.isArray(b.managerIds) ? { managerIds: b.managerIds.map(String) } : null),
      });
      return { ok: true };
    },
  ],
  [
    'DELETE',
    /^\/departments\/([^/]+)$/,
    ([, id]) => {
      if (!isAdmin()) return fail('You do not have permission to delete departments.', 403);
      const i = DEPARTMENTS.findIndex((d) => d.id === id);
      if (i < 0) return notFound('Department not found');
      DEPARTMENTS.splice(i, 1);
      return { ok: true };
    },
  ],
  ['GET', /^\/assets$/, () => ASSETS],
  [
    'GET',
    // Another person's wallet only: my own and the company's (company_<tenant>) stay with bounty.ts.
    new RegExp(`^/bounty/wallet/(?!${DEMO_USER.id}$)(?!company)([^/]+)$`),
    ([, id]) => {
      if (!isAdmin()) return fail('You are not authorized to view this wallet.', 403);
      const p = personById(id!);
      // server.js:5137: someone with no wallet row reads as an empty wallet, not a 404.
      if (!p) return { ok: true, id, allocated: 0, reserved: 0, spent: 0, earned: 0, available: 0 };
      return { ok: true, ...walletOf(p.id, p.name) };
    },
  ],
  ['GET', /^\/org\/directory$/, directory],
];
