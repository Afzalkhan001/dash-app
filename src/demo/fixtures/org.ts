// The demo company: people, departments, the company record (feature switches), Keka Codes
// (projects) and the demo person's own profile. Shapes follow the handlers:
//   routes/users.js   GET /users (stripAvatar rows), GET /users/:id, PUT /users/:id (self-edit,
//                     filterUserWrite), GET /users/:id/avatar, GET /org/directory (restricted rows for
//                     an employee + roster rows of people who have not signed up, `pending: true`)
//   routes/tenants.js, routes/departments.js, routes/projects.js — getAll() plain arrays
//   hr.js GET /hr/me
// Everyone else in the company exists only here; the demo person is DEMO_USER (demo/config.ts), and
// which role they are is the persona (demo/personas.ts): the profile, /hr/me, the department they
// run, who reports to them and which Keka Codes they own all follow it (onPersonaChange below).
//
// Wave 0 (docs/port/EXTENSION-POINTS.md §10) — exported for the domain fixtures, which must change this
// data only through these and never edit this file:
//   stores    PEOPLE, profile, DEPARTMENTS, PROJECTS, TENANT, allPeople(), personById, personByName
//   mutators  upsertPerson, removePerson, upsertProject, upsertDepartment, removeDepartment, patchTenant
// Seeds for the ported screens: Team Roster on for the company and for Creative + Production; three
// bookable professionals (Sanjay editor, Sneha graphic designer, Farhan cinematographer); the
// company's professional categories; one grant in each Config "Who can…" list.

import type { HrMe, Tenant } from '@/api/me';
import type { Department, DirectoryPerson, ProfileRecord } from '@/api/people';
import type { Project } from '@/api/reimbursements';
import { DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { currentPersona, onPersonaChange } from '@/demo/personas';
import { addDays, clone, DEMO_CODE, fail, notFound, today, workingDayFrom, type Route } from '@/demo/state';

export type Person = ProfileRecord & { id: string; name: string; dept: string; employeeNumber: string; email: string };

const T0 = today();
const yearsAgo = (n: number, ymd: string) => `${Number(ymd.slice(0, 4)) - n}${ymd.slice(4)}`;

// ── Departments (stored on a person by name, as DEMO_USER's `dept` is) ─────────
export type DemoDepartment = Department & {
  tenantId: string;
  adminId: string;
  managerIds: string[];
  managerId: string;
  mode: string;
  /** Team Roster on for this department (routes/departments.js; the company switch is TENANT.teamRosterEnabled). */
  teamRosterEnabled: boolean;
};

// Team Roster is on for Creative (Afzal Manager runs it) and Production (Afzal Admin runs it).
export const DEPARTMENTS: DemoDepartment[] = [
  { id: 'dept-creative', name: 'Creative', adminId: DEMO_USER.id, managerIds: ['u-priya'], managerId: 'u-priya', teamRosterEnabled: true },
  { id: 'dept-production', name: 'Production', adminId: 'u-deepa', managerIds: ['u-deepa'], managerId: 'u-deepa', teamRosterEnabled: true },
  { id: 'dept-marketing', name: 'Marketing', adminId: 'u-vikram', managerIds: ['u-vikram'], managerId: 'u-vikram', teamRosterEnabled: false },
  { id: 'dept-leadership', name: 'Leadership', adminId: 'u-kiran', managerIds: [], managerId: '', teamRosterEnabled: false },
  { id: 'dept-accounts', name: 'Accounts', adminId: 'u-ramesh', managerIds: [], managerId: '', teamRosterEnabled: false },
  { id: 'dept-hr', name: 'Human Resources', adminId: 'u-lakshmi', managerIds: [], managerId: '', teamRosterEnabled: false },
  { id: 'dept-it', name: 'IT & Admin', adminId: 'u-naveen', managerIds: [], managerId: '', teamRosterEnabled: false },
].map((d) => ({ ...d, tenantId: DEMO_TENANT_ID, mode: 'regular' }));

// Who runs each department when the demo person doesn't (the persona's `runs` takes these over).
const USUAL_ADMIN: Record<string, string> = {
  'dept-creative': 'u-priya',
  'dept-production': 'u-deepa',
  'dept-marketing': 'u-vikram',
  'dept-leadership': 'u-kiran',
  'dept-accounts': 'u-ramesh',
  'dept-hr': 'u-lakshmi',
  'dept-it': 'u-naveen',
};

export const deptIdOf = (name: string) => DEPARTMENTS.find((d) => d.name === name)?.id ?? null;

// ── People ───────────────────────────────────────────────────────────────────
type Seed = [id: string, name: string, role: string, jobTitle: string, dept: string, reportingTo: string, empNo: string, joined: string, blood: string, gender: string, dob: string];

const SEEDS: Seed[] = [
  ['u-kiran', 'Kiran Rao', 'ceo', 'Chief Executive Officer', 'Leadership', '', 'TM-1001', '2016-08-01', 'A+ (A Positive)', 'Male', '1978-01-09'],
  ['u-arvind', 'Arvind Menon', 'coo', 'Chief Operating Officer', 'Leadership', 'u-kiran', 'TM-1002', '2017-04-10', 'O+ (O Positive)', 'Male', '1981-06-30'],
  ['u-deepa', 'Deepa Menon', 'manager', 'Production Manager', 'Production', 'u-arvind', 'TM-1003', '2018-11-05', 'A+ (A Positive)', 'Female', '1986-12-02'],
  // The heads of HR, Accounts and IT are line managers (role 'manager'), so they are on the directory
  // and the org chart like the real company's heads; the console roles are the Afzal personas.
  ['u-lakshmi', 'Lakshmi Prasad', 'manager', 'HR Manager', 'Human Resources', 'u-arvind', 'TM-1005', '2018-03-12', 'A+ (A Positive)', 'Female', '1985-04-18'],
  ['u-priya', 'Priya Sharma', 'manager', 'Head of Post-Production', 'Creative', 'u-kiran', 'TM-1007', '2019-02-04', 'O+ (O Positive)', 'Female', '1987-08-25'],
  ['u-vikram', 'Vikram Singh', 'manager', 'Marketing Lead', 'Marketing', 'u-arvind', 'TM-1011', '2020-07-20', 'A- (A Negative)', 'Male', '1988-02-14'],
  ['u-ramesh', 'Ramesh Gupta', 'manager', 'Accounts Manager', 'Accounts', 'u-arvind', 'TM-1015', '2020-01-06', 'O+ (O Positive)', 'Male', '1983-10-03'],
  ['u-naveen', 'Naveen Kumar', 'manager', 'IT Manager', 'IT & Admin', 'u-arvind', 'TM-1019', '2021-05-24', 'B+ (B Positive)', 'Male', '1990-07-11'],
  ['u-rahul', 'Rahul Verma', 'employee', 'Colourist', 'Creative', 'u-priya', 'TM-1035', yearsAgo(5, addDays(T0, 3)), 'B- (B Negative)', 'Male', '1992-11-27'],
  ['u-anita', 'Anita Desai', 'employee', 'Sound Engineer', 'Creative', 'u-priya', 'TM-1048', yearsAgo(4, T0), 'B+ (B Positive)', 'Female', '1993-05-06'],
  ['u-sneha', 'Sneha Iyer', 'employee', 'Motion Designer', 'Creative', 'u-priya', 'TM-1061', '2023-01-16', 'AB+ (AB Positive)', 'Female', yearsAgo(29, T0)],
  ['u-farhan', 'Farhan Ali', 'employee', 'Camera Operator', 'Production', 'u-deepa', 'TM-1066', '2023-09-11', 'O+ (O Positive)', 'Male', '1995-03-15'],
  ['u-meera', 'Meera Nair', 'employee', 'Content Strategist', 'Marketing', 'u-vikram', 'TM-1069', '2024-04-08', 'O- (O Negative)', 'Female', '1996-09-21'],
  ['u-imran', 'Imran Shaikh', 'employee', 'Gaffer', 'Production', 'u-deepa', 'TM-1074', '2024-11-18', 'B+ (B Positive)', 'Male', '1991-01-30'],
  ['u-sanjay', 'Sanjay Kumar', 'employee', 'Senior Video Editor', 'Creative', 'u-priya', 'TM-1077', '2025-03-03', 'AB- (AB Negative)', 'Male', '1998-08-08'],
  ['u-zoya', 'Zoya Khan', 'employee', 'Social Media Executive', 'Marketing', 'u-vikram', 'TM-1080', '2025-01-20', 'B+ (B Positive)', 'Female', '1999-12-12'],
  // The two juniors work under Sanjay (under the demo person when Afzal runs Creative; see below).
  ['u-kavya', 'Kavya Reddy', 'employee', 'Junior Video Editor', 'Creative', 'u-sanjay', 'TM-1083', '2025-07-01', 'O+ (O Positive)', 'Female', yearsAgo(26, addDays(T0, 2))],
  ['u-nikhil', 'Nikhil Jain', 'employee', 'Assistant Editor', 'Creative', 'u-sanjay', 'TM-1086', '2025-09-15', 'A+ (A Positive)', 'Male', '2000-04-04'],
  // The IT & Admin team Afzal IT Admin approves for.
  ['u-ravi', 'Ravi Teja', 'employee', 'IT Support Engineer', 'IT & Admin', 'u-naveen', 'TM-1088', '2024-06-03', 'O+ (O Positive)', 'Male', '1994-10-19'],
  ['u-pooja', 'Pooja Rao', 'employee', 'Office Administrator', 'IT & Admin', 'u-naveen', 'TM-1089', '2025-02-10', 'B+ (B Positive)', 'Female', '1997-07-07'],
  // The HR and Accounts teams (Afzal HR's and Afzal Accounts' teammates).
  ['u-farah', 'Farah Siddiqui', 'employee', 'Recruiter', 'Human Resources', 'u-lakshmi', 'TM-1078', '2024-08-19', 'A+ (A Positive)', 'Female', '1995-06-02'],
  ['u-gopal', 'Gopal Krishna', 'employee', 'Payroll Executive', 'Human Resources', 'u-lakshmi', 'TM-1081', '2023-05-08', 'O+ (O Positive)', 'Male', '1990-02-26'],
  ['u-harish', 'Harish Babu', 'employee', 'Accounts Assistant', 'Accounts', 'u-ramesh', 'TM-1084', '2024-12-02', 'B+ (B Positive)', 'Male', '1996-11-14'],
];
// The Creative edit floor: under Priya (Kavya and Nikhil under Sanjay) for everyone else, and under
// the demo person when Afzal is the Creative manager, so Afzal Manager has five direct reports and
// Afzal Employee sees them as peers. The console-role personas get no reports (they are not on the
// directory, so the chart would have to draw a placeholder card for them).
const CREATIVE_FLOOR = ['u-rahul', 'u-sneha', 'u-sanjay', 'u-kavya', 'u-nikhil'];

const mobileOf = (empNo: string) => `+9190001${empNo.slice(-5).replace('-', '0')}`;
const emailOf = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.demo@tamadamedia.com`;

export const PEOPLE: Person[] = SEEDS.map(([id, name, role, jobTitle, dept, reportingTo, empNo, joined, blood, gender, dob]) => ({
  id,
  name,
  email: emailOf(name),
  role,
  tenantId: DEMO_TENANT_ID,
  dept,
  departmentId: deptIdOf(dept),
  kekaCode: empNo,
  employeeNumber: empNo,
  mobile: mobileOf(empNo),
  phone: mobileOf(empNo),
  jobTitle,
  reportingTo,
  reportingManager: '',
  dateJoined: joined,
  dob,
  bloodGroup: blood,
  gender,
  location: 'Hyderabad',
  status: 'active',
  resigned: false,
}));

// The demo person's own record: DEMO_USER plus what a full profile carries. Edited in place by
// PUT /users/demo-user, so the profile screen and the session user (refreshed from GET /users/:id)
// show the change.
export const profile: Person = {
  ...(DEMO_USER as Person),
  dept: 'Creative',
  deptName: 'Creative',
  employeeNumber: 'TM-1042',
  email: String(DEMO_USER.email),
  name: String(DEMO_USER.name),
  gender: 'Male',
  dob: '1994-03-21',
  city: 'Hyderabad',
  jobRole: 'Video Editing',
  additionalManager: '',
  bio: 'Senior video editor in the Creative team — brand films, explainers and the occasional music video. Premiere Pro, After Effects and DaVinci Resolve.',
  workLinks: [],
  bankAccountNumber: '50100234567812',
  bankIfscCode: 'HDFC0001234',
  avatar: '',
  status: 'active',
  resigned: false,
};
// A salary account belongs to a staff member: the display and platform-owner accounts (no employee
// number) have none.
const MY_BANK = { bankAccountNumber: profile.bankAccountNumber, bankIfscCode: profile.bankIfscCode };

const byId = new Map<string, Person>();
const everyone = () => [profile, ...PEOPLE];
export const personById = (id: string) => (id === profile.id ? profile : byId.get(id) ?? PEOPLE.find((p) => p.id === id));
export const personByName = (name: string) => everyone().find((p) => p.name === name);
for (const p of PEOPLE) byId.set(p.id, p);
// Manager names, from the ids above (the web stores both).
for (const p of PEOPLE) p.reportingManager = p.reportingTo ? personById(p.reportingTo)?.name ?? '' : '';

// Bookable professionals (Book a professional, dash.html availProfsBase: professionalAvailable &&
// professionalType, matched on city). Sanjay and Sneha are on the Creative floor; Farhan is Production.
// Farhan is away two days next week (leaveDates), so a booking for those days shows him as away.
const BOOKABLE: Record<string, Record<string, unknown>> = {
  'u-sanjay': {
    professionalType: 'editor',
    designation: 'Senior Video Editor',
    specializations: ['Brand films', 'Music videos'],
    skills: ['Premiere Pro', 'DaVinci Resolve', 'After Effects'],
  },
  'u-sneha': {
    professionalType: 'graphic_designer',
    designation: 'Motion Designer',
    specializations: ['Explainers', 'Title design'],
    skills: ['After Effects', 'Illustrator', 'Figma'],
  },
  'u-farhan': {
    professionalType: 'cinematographer',
    designation: 'Camera Operator',
    specializations: ['Product shoots', 'Interviews'],
    skills: ['Sony FX6', 'Gimbal', 'Lighting'],
    leaveDates: [workingDayFrom(T0, -3), workingDayFrom(T0, -4)],
  },
};
for (const [id, extra] of Object.entries(BOOKABLE)) {
  const p = byId.get(id);
  if (p) Object.assign(p, { professionalAvailable: true, location: 'Hyderabad', city: 'Hyderabad', workLinks: [], ...extra });
}
// A second manager on one of the Creative floor (routes/users.js additionalManager is a display name).
{
  const rahul = byId.get('u-rahul');
  if (rahul) rahul.additionalManager = 'Deepa Menon';
}
// Who each of the Creative floor reports to when the demo person does not run Creative.
const SEED_MANAGER = new Map(CREATIVE_FLOOR.map((id) => [id, String(byId.get(id)?.reportingTo || 'u-priya')]));

export const teammatesOf = (dept: string) => everyone().filter((p) => p.dept === dept && p.id !== profile.id);
/** Everyone in the demo company: the demo person first, then PEOPLE (live arrays, read-only use). */
export const allPeople = () => everyone();

// Roster rows of people invited to DASH who have not signed up yet (whitelist).
const PENDING_ROSTER: DirectoryPerson[] = [
  {
    id: 'wl:wl-tejas',
    name: 'Tejas Kulkarni',
    role: 'employee',
    jobTitle: 'Motion Graphics Intern',
    reportingManager: 'Priya Sharma',
    reportingTo: 'u-priya',
    email: 'tejas.kulkarni.demo@tamadamedia.com',
    mobile: '+919000188041',
    bloodGroup: '',
    dateJoined: addDays(T0, 7),
    pending: true,
  },
];

// ── The company ──────────────────────────────────────────────────────────────
// The Config "Who can…" grants name personas by their own ids and employee numbers, never by the demo
// person's stored id / name (DEMO_USER): demo/server.ts rewrites those to whichever persona is
// active, which would hand the grant to every role.
export const TENANT: Tenant = {
  id: DEMO_TENANT_ID,
  name: 'Tamada Media (Demo)',
  logo: 'TM',
  status: 'active',
  address: 'Plot 42, Road No. 36, Jubilee Hills, Hyderabad, Telangana 500033',
  phone: '+91 40 4012 3456',
  superAdmin: 'kiran.rao.demo@tamadamedia.com',
  maxUsers: 60,
  bountyEnabled: true,
  bountyMonthlyEarnCap: 3000,
  // Afzal Manager may post bounty tasks (and still take part: managers are exempt, dash.html:11893).
  bountyCreators: [{ name: 'Afzal Manager', empNo: 'TM-1042', userId: 'demo-manager' }],
  announcementCreators: [{ name: 'Priya Sharma', empNo: 'TM-1007' }],
  projectCreators: [{ name: 'Vikram Singh', empNo: 'TM-1011' }],
  // Afzal HR may read the activity audit (not download it); Afzal Accounts may see subscriptions.
  auditAccess: [
    {
      name: 'Afzal HR',
      empNo: 'TM-1095',
      userId: 'demo-hr',
      permissions: { viewLogs: true, searchUsers: true, viewDetail: true, downloadReports: false },
    },
  ],
  subscriptionAccess: [{ name: 'Afzal Accounts', empNo: 'TM-1097', userId: 'demo-accounts' }],
  // dash.html PROF_TYPE_DEFAULTS (:1703).
  profTypes: [
    { id: 'cinematographer', label: 'Cinematographer', dayStart: '07:00', dayEnd: '22:00', gapMinutes: 60, active: true },
    { id: 'editor', label: 'Editor', dayStart: '07:00', dayEnd: '22:00', gapMinutes: 0, active: true },
    { id: 'graphic_designer', label: 'Graphic Designer', dayStart: '07:00', dayEnd: '22:00', gapMinutes: 0, active: true },
  ],
  orgEnabled: true,
  teamRosterEnabled: true,
  appManagerBountyApprovalsOn: false,
  birthdayAutoOn: true,
  anniversaryAutoOn: true,
  visitorApprovalTimeoutMin: 10,
  visitorPhotoRetentionDays: 30,
  featureFlags: {},
};

// hr.js GET /hr/me for the persona: its modules, and what it approves (department admin or HR admin).
export const hrMe = (): HrMe & { ok: true } => ({ ok: true, ...currentPersona().hr });

// ── Keka Codes (projects). empNo is the Cost Code Owner's employee number: Afzal Manager (TM-1042)
// owns the Nimbus and Showreel codes, so the Keka Code Owner approval queues have work in them; for
// every other persona Priya (TM-1007) owns them. ──
type ProjectSeed = [id: string, name: string, m1: string, m2: string, m3: string, ownerEmpNo: string, status: string, date: string];
const PROJECT_SEEDS: ProjectSeed[] = [
  ['p-sjw-diwali', 'Sunrise Jewellers — Diwali Brand Film', 'TM', 'SJW', 'DIWALI26', 'TM-1007', 'active', '2026-08-18'],
  ['p-aarogya', 'Aarogya Hospitals — Brand Campaign', 'TM', 'AAR', 'BRAND26', 'TM-1011', 'active', '2026-07-02'],
  ['p-kathalu', 'Kathalu — Telugu Web Series S2', 'TM', 'KTH', 'S2', 'TM-1003', 'active', '2026-05-12'],
  ['p-kisan', 'Kisan Agro — Product Launch Film', 'TM', 'KAG', 'LAUNCH', 'TM-1003', 'active', '2026-08-01'],
  ['p-nimbus', 'Nimbus Fintech — Explainer Series', 'TM', 'NIM', 'EXPL', 'TM-1042', 'active', '2026-06-20'],
  ['p-reel', 'Tamada Showreel 2026 (Internal)', 'TM', 'INT', 'REEL26', 'TM-1042', 'active', '2026-04-01'],
  ['p-admin', 'Internal — Admin, Training & Pitches', 'TM', 'INT', 'ADMIN', 'TM-1002', 'active', '2025-04-01'],
  ['p-spice', 'Spice Route Travel Vlogs (2024)', 'TM', 'SRT', 'VLOG24', 'TM-1003', 'inactive', '2024-02-10'],
];

export const PROJECTS: (Project & { id: string; name: string; kekaCode: string; status: string; costCodeOwner: string; empNo: string })[] =
  PROJECT_SEEDS.map(([id, name, meta1, meta2, meta3, empNo, status, date]) => ({
    id,
    name,
    meta1,
    meta2,
    meta3,
    kekaCode: [meta1, meta2, meta3].join('_'),
    status,
    costCodeOwner: everyone().find((p) => p.employeeNumber === empNo)?.name ?? '',
    empNo,
    date,
    createdAt: date,
    tenantId: DEMO_TENANT_ID,
  }));

export const projectById = (id: string | null | undefined) => PROJECTS.find((p) => p.id === id);
export const projectByCode = (code: string) => PROJECTS.find((p) => p.kekaCode.toLowerCase() === String(code || '').trim().toLowerCase());
// The Keka Code Owner, re-derived from the project's empNo (reimbursements.js resolveOwner).
export const ownerOf = (p: { empNo?: string } | undefined) => (p?.empNo ? everyone().find((u) => u.employeeNumber === p.empNo) ?? null : null);
/** The Keka Codes that belong to the demo person when the persona owns codes. */
export const MY_CODE_PROJECTS = ['p-nimbus', 'p-reel'];

// ── The persona ──────────────────────────────────────────────────────────────
// Registered before any other fixture's listener (every fixture imports this module), so they see
// the new owners and admins.
onPersonaChange((p) => {
  Object.assign(profile, {
    role: p.role,
    jobTitle: p.jobTitle,
    // "Video Editing" is the Creative team's line; anyone else shows just their title.
    jobRole: p.dept === 'Creative' ? 'Video Editing' : '',
    dept: p.dept,
    deptName: p.dept,
    departmentId: p.deptId,
    employeeNumber: p.employeeNumber,
    kekaCode: p.employeeNumber,
    reportingTo: p.manager?.[0] ?? '',
    reportingManager: p.manager?.[1] ?? '',
    tenantId: p.tenant ? DEMO_TENANT_ID : undefined,
    bio: p.bio,
    ...(p.employeeNumber ? MY_BANK : { bankAccountNumber: '', bankIfscCode: '' }),
  });
  for (const d of DEPARTMENTS) d.adminId = p.runs.includes(d.id) ? profile.id : (USUAL_ADMIN[d.id] ?? d.adminId);
  const runsCreative = p.runs.includes('dept-creative');
  for (const id of CREATIVE_FLOOR) {
    const r = byId.get(id);
    if (!r) continue;
    const to = runsCreative ? profile.id : (SEED_MANAGER.get(id) ?? 'u-priya');
    r.reportingTo = to;
    r.reportingManager = runsCreative ? profile.name : (personById(to)?.name ?? '');
  }
  for (const pr of PROJECTS) {
    if (!MY_CODE_PROJECTS.includes(pr.id)) continue;
    pr.empNo = p.ownsCodes ? p.employeeNumber : 'TM-1007';
    pr.costCodeOwner = ownerOf(pr)?.name ?? '';
  }
});

// ── Mutators for the domain fixtures (Wave 0) ─────────────────────────────────
// Each changes the live store the built-in routes read, so every screen agrees. They never touch the
// demo person's role, id or persona fields (the persona owns those).

/** Add a person, or merge into an existing one by id (the demo person's own record included). */
export function upsertPerson(patch: Partial<Person> & { id: string }): Person {
  const { id } = patch;
  if (id === profile.id) {
    const { role: _r, id: _i, tenantId: _t, employeeNumber: _e, kekaCode: _k, ...rest } = patch;
    Object.assign(profile, rest);
    return profile;
  }
  const cur = byId.get(id);
  if (cur) {
    Object.assign(cur, patch);
    if (patch.dept !== undefined) cur.departmentId = deptIdOf(String(patch.dept));
    return cur;
  }
  const name = String(patch.name || 'New person');
  const empNo = String(patch.employeeNumber || '');
  const person: Person = {
    role: 'employee',
    tenantId: DEMO_TENANT_ID,
    email: emailOf(name),
    status: 'active',
    resigned: false,
    location: 'Hyderabad',
    ...patch,
    id,
    name,
    dept: String(patch.dept || ''),
    employeeNumber: empNo,
    kekaCode: String(patch.kekaCode || empNo),
    departmentId: deptIdOf(String(patch.dept || '')),
  } as Person;
  PEOPLE.push(person);
  byId.set(id, person);
  return person;
}

/** Remove a person (never the demo person). True when someone was removed. */
export function removePerson(id: string): boolean {
  if (id === profile.id) return false;
  const i = PEOPLE.findIndex((p) => p.id === id);
  if (i < 0) return false;
  PEOPLE.splice(i, 1);
  byId.delete(id);
  return true;
}

type DemoProject = (typeof PROJECTS)[number];
/** Add a project (Keka Code) or merge into one by id; the code and owner name are re-derived. */
export function upsertProject(patch: Partial<DemoProject> & { id: string }): DemoProject {
  const cur = PROJECTS.find((p) => p.id === patch.id);
  const next = (cur ? Object.assign(cur, patch) : { status: 'active', tenantId: DEMO_TENANT_ID, createdAt: new Date().toISOString(), ...patch }) as DemoProject;
  if (next.meta1 || next.meta2 || next.meta3) next.kekaCode = [next.meta1, next.meta2, next.meta3].filter(Boolean).join('_');
  next.costCodeOwner = ownerOf(next)?.name ?? next.costCodeOwner ?? '';
  if (!cur) PROJECTS.push(next);
  return next;
}

/**
 * Add a department or merge into one by id. A new admin given here also becomes the department's usual
 * admin, so it survives a demo role switch (the persona listener above only hands the departments the
 * persona runs to the demo person).
 */
export function upsertDepartment(patch: Partial<DemoDepartment> & { id: string }): DemoDepartment {
  const cur = DEPARTMENTS.find((d) => d.id === patch.id);
  if (typeof patch.adminId === 'string' && patch.adminId !== profile.id) USUAL_ADMIN[patch.id] = patch.adminId;
  if (cur) return Object.assign(cur, patch);
  const d: DemoDepartment = { name: 'New department', adminId: '', managerIds: [], managerId: '', teamRosterEnabled: false, tenantId: DEMO_TENANT_ID, mode: 'regular', ...patch };
  DEPARTMENTS.push(d);
  return d;
}

/** Remove a department by id (routes/departments.js DELETE). False when there is none. */
export function removeDepartment(id: string): boolean {
  const i = DEPARTMENTS.findIndex((d) => d.id === id);
  if (i < 0) return false;
  DEPARTMENTS.splice(i, 1);
  delete USUAL_ADMIN[id];
  return true;
}

/**
 * PUT /tenants/:id as routes/tenants.js:53 applies it: a shallow merge, `featureFlags` deep-merged,
 * every array replaced whole. Role rules (featureFlags only for master_admin, the earn cap only for
 * super/master) are the caller's to apply, exactly as the route does.
 */
export function patchTenant(patch: Partial<Tenant>): Tenant {
  const { featureFlags, id: _id, ...rest } = patch ?? {};
  Object.assign(TENANT, rest);
  if (featureFlags && typeof featureFlags === 'object') TENANT.featureFlags = { ...(TENANT.featureFlags ?? {}), ...featureFlags };
  return TENANT;
}

// ── Responses ────────────────────────────────────────────────────────────────
const stripAvatar = ({ avatar, ...rest }: Person) => ({ ...rest, hasAvatar: !!avatar });

// routes/users.js ORG_NON_STAFF_ROLES: shared logins and console roles are not on the directory.
const NON_STAFF = ['master_admin', 'super_admin', 'accounts', 'hr', 'it_admin', 'app_manager', 'announcement_viewer'];
// routes/users.js ORG_FULL_VIEW_ROLES (+ master_admin): the whole record, not the restricted row.
const FULL_VIEW = ['super_admin', 'ceo', 'coo', 'hr', 'master_admin'];
const BANK_FIELDS = ['bankAccountNumber', 'bankIfscCode'];

// An employee gets the restricted directory row (name, role, title, manager, contact, blood group,
// joining date) — never the department, office or employee number. HR, the super admin and the
// master admin get the whole record (department, employee number, office…).
function directory(): DirectoryPerson[] {
  const staff = everyone().filter((u) => !NON_STAFF.includes(u.role));
  if (FULL_VIEW.includes(currentPersona().role)) {
    const full = staff.map((u) => {
      const row: Record<string, unknown> = { ...stripAvatar(u), mobile: u.mobile || u.phone || '' };
      for (const k of BANK_FIELDS) delete row[k];
      return row as DirectoryPerson;
    });
    return [...full, ...PENDING_ROSTER];
  }
  const rows = staff
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      jobTitle: u.jobTitle,
      reportingManager: String(u.reportingManager || ''),
      reportingTo: u.reportingTo,
      email: u.email,
      mobile: u.mobile || u.phone || '',
      bloodGroup: String(u.bloodGroup || ''),
      dateJoined: String(u.dateJoined || ''),
      hasAvatar: !!u.avatar,
      resigned: !!u.resigned,
      status: String(u.status || 'active'),
    }));
  return [...rows, ...PENDING_ROSTER];
}

// lib/authz.js: never writable by anyone, and the fields only user admins may change.
const NOT_SELF_WRITABLE = ['password', 'id', '_id', 'timesheetWeeklySince', 'role', 'tenantId', 'email', 'source', 'employeeNumber', 'kekaCode', 'permissions', 'timesheetCadence', 'performedById', 'actorId'];

export const orgRoutes: Route[] = [
  ['GET', /^\/hr\/me$/, () => hrMe()],
  ['GET', /^\/tenants$/, () => [TENANT]],
  ['GET', /^\/departments$/, () => DEPARTMENTS],
  ['GET', /^\/projects$/, () => PROJECTS],
  ['GET', /^\/users$/, () => everyone().map(stripAvatar)],
  ['GET', /^\/org\/directory$/, () => directory()],
  [
    'GET',
    /^\/users\/([^/]+)\/avatar$/,
    ([, id]) => {
      const u = personById(id!);
      return u ? { avatar: typeof u.avatar === 'string' ? u.avatar : '' } : notFound('User not found');
    },
  ],
  ['GET', /^\/whitelist\/([^/]+)\/avatar$/, () => ({ avatar: '' })],
  [
    'GET',
    /^\/users\/([^/]+)$/,
    ([, id]) => {
      const u = personById(id!);
      return u ? { ok: true, user: clone(u) } : notFound('User not found');
    },
  ],
  [
    'PUT',
    /^\/users\/([^/]+)$/,
    ([, id], body) => {
      if (id !== profile.id) return fail('You can only edit your own profile.', 403);
      const patch: Record<string, unknown> = { ...(body || {}) };
      for (const k of NOT_SELF_WRITABLE) delete patch[k];
      // One number, two fields (routes/users.js keeps mobile and phone in step).
      if (patch.mobile !== undefined || patch.phone !== undefined) {
        const next = patch.mobile !== undefined ? patch.mobile : patch.phone;
        patch.mobile = next;
        patch.phone = next;
      }
      Object.assign(profile, patch);
      return { ok: true };
    },
  ],
  [
    'POST',
    /^\/auth\/change-password$/,
    (_p, body) => {
      if (!body?.currentPassword || !body?.newPassword) return fail('userId, currentPassword, newPassword required');
      if (String(body.newPassword).length < 4) return fail('New password must be at least 4 characters');
      return { ok: true };
    },
  ],
];

// Kept for anything that wants the demo code alongside the people (e.g. petty cash on-behalf).
export const ON_BEHALF_CODE = DEMO_CODE;
