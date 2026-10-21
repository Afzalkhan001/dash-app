// The demo's staff roles: one "Afzal <Role>" per DASH role (CEO and COO are left out on purpose —
// Kiran and Arvind hold those roles in the demo company). After 123456 the role picker
// (features/demo/role-picker.tsx) signs in as one of these; the token says which, so the choice
// survives an app restart:
//   Afzal Employee  → 'demo-session-token'            (the demo's original token)
//   everyone else   → 'demo-session-token:<persona>'
// None of these people exist in the DASH database — they live only in this file and the fixtures.
//
// Each persona is what hr.js /hr/me, routes/users.js and the role menus would give that role in the
// demo company (the role map in docs: modules, approvals, department admin, Keka Code owner). The
// fixtures read currentPersona() at request time and react to a switch through onPersonaChange().
//
// Integrator-owned (docs/port/PLAN.md §2.1.2): a domain that needs a persona tweak lists it in its
// HANDOFF.md. Wave 0 gave Afzal HR and Afzal Super Admin the `payroll` and `tax` modules; the Config
// grants (audit, subscriptions, creators) and Team Roster live on the company (fixtures/org.ts TENANT).
// The owner's rule stands: no CEO or COO persona.

import type { LucideIcon } from 'lucide-react-native';
import {
  AppWindow,
  Banknote,
  Building2,
  Clapperboard,
  DoorOpen,
  Factory,
  HeartHandshake,
  Megaphone,
  MonitorCog,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react-native';

import type { HrMe } from '@/api/me';
import type { StaffUser } from '@/auth/session';
import { DEMO_EMAIL, DEMO_PHONE, DEMO_TENANT_ID, DEMO_TOKEN, DEMO_USER, isDemoToken, VENDOR_DEMO_TOKEN_PREFIX } from '@/demo/config';
import { HR_SYSTEM_ROLES } from '@/lib/access';
import type { ModuleKey } from '@/theme/tokens';

export type StaffPersonaId =
  | 'employee'
  | 'professional'
  | 'manager'
  | 'hr'
  | 'accounts'
  | 'super_admin'
  | 'admin'
  | 'it_admin'
  | 'visitor_manager'
  | 'announcements'
  | 'app_manager'
  | 'master_admin';

export type StaffPersona = {
  id: StaffPersonaId;
  role: string;
  /** "Afzal HR" — the persona's name everywhere in the app. */
  label: string;
  /** The DEMO pill: "DEMO · HR". */
  short: string;
  /** One plain-words line for the picker: what this role sees. */
  note: string;
  module: ModuleKey;
  icon: LucideIcon;
  jobTitle: string;
  dept: string;
  deptId: string | null;
  employeeNumber: string;
  /** [id, name] of the person this one reports to. */
  manager: [string, string] | null;
  /** False only for the master admin, who belongs to no company. */
  tenant: boolean;
  /** Departments this persona is the admin of (departments.adminId). */
  runs: string[];
  /** Owns the Nimbus and Showreel Keka Codes (project empNo = this persona's employee number). */
  ownsCodes: boolean;
  /** GET /hr/me for this role. */
  hr: HrMe;
  bio: string;
};

// The company's HR modules (the demo company has every one switched on).
const ALL = ['attendance', 'regularization', 'shifts', 'holidays', 'leave', 'wfh', 'comp_off', 'policies', 'salary', 'payslips', 'reimbursements'];
// HR admins also hold payroll runs and income tax (hr.js module ids `payroll`, `tax`): the Payroll
// screens (PayrollAdminPanel, dash.html:5289) need one of payroll / salary / tax. Not approval queues.
const ADMIN_ALL = [...ALL, 'payroll', 'tax'];
// What a department admin approves (hr.js: the union of their departments' modules that have a queue).
const QUEUES = ['regularization', 'leave', 'wfh', 'comp_off', 'reimbursements'];
// The IT & Admin department's modules (no shifts: a system role that is not an HR admin would get a
// Shifts link that opens an empty page).
const IT_MODULES = ['attendance', 'regularization', 'holidays', 'leave', 'wfh', 'policies', 'payslips'];

const hr = (modules: string[], extra: Partial<HrMe> = {}): HrMe => ({
  enabled: true,
  modules,
  canConfigure: false,
  isHrAdmin: false,
  adminsDepts: [],
  approverModules: [],
  ...extra,
});

const base = {
  tenant: true,
  runs: [] as string[],
  ownsCodes: false,
};

export const STAFF_PERSONAS: StaffPersona[] = [
  {
    ...base,
    id: 'employee',
    role: 'employee',
    label: 'Afzal Employee',
    short: 'Employee',
    note: 'Clocks in, applies for leave and sees payslips',
    module: 'attendance',
    icon: UserRound,
    jobTitle: 'Video Editor',
    dept: 'Creative',
    deptId: 'dept-creative',
    employeeNumber: 'TM-1091',
    manager: ['u-priya', 'Priya Sharma'],
    hr: hr(ALL),
    bio: 'Video editor in the Creative team — brand films, explainers and the occasional music video. Premiere Pro, After Effects and DaVinci Resolve.',
  },
  {
    ...base,
    id: 'professional',
    role: 'professional',
    label: 'Afzal Professional',
    short: 'Professional',
    note: 'Freelance crew: shoot bookings, tasks and payslips',
    module: 'tasks',
    icon: Clapperboard,
    jobTitle: 'Freelance Cinematographer',
    dept: 'Production',
    deptId: 'dept-production',
    employeeNumber: 'TM-1096',
    manager: ['u-deepa', 'Deepa Menon'],
    hr: hr(['attendance', 'regularization', 'holidays', 'leave', 'policies', 'payslips']),
    bio: 'Freelance cinematographer booked by the Production team for shoots and on-set edits.',
  },
  {
    ...base,
    id: 'manager',
    role: 'manager',
    label: 'Afzal Manager',
    short: 'Manager',
    note: 'Approves the team’s leave and claims, assigns tasks and books crew',
    module: 'leave',
    icon: Users,
    jobTitle: 'Creative Manager',
    dept: 'Creative',
    deptId: 'dept-creative',
    employeeNumber: 'TM-1042',
    manager: ['u-kiran', 'Kiran Rao'],
    runs: ['dept-creative'],
    ownsCodes: true,
    hr: hr(ALL, { adminsDepts: ['dept-creative'], approverModules: QUEUES }),
    bio: 'Runs the Creative team’s edit floor and owns the Nimbus and Showreel Keka Codes.',
  },
  {
    ...base,
    id: 'hr',
    role: 'hr',
    label: 'Afzal HR',
    short: 'HR',
    note: 'Approves company-wide leave, runs payroll, hiring and HR setup',
    module: 'people',
    icon: HeartHandshake,
    jobTitle: 'HR Executive',
    dept: 'Human Resources',
    deptId: 'dept-hr',
    employeeNumber: 'TM-1095',
    manager: ['u-lakshmi', 'Lakshmi Prasad'],
    hr: hr(ADMIN_ALL, { isHrAdmin: true, approverModules: ALL }),
    bio: 'HR executive — leave, attendance, salary advances and onboarding for every team.',
  },
  {
    ...base,
    id: 'accounts',
    role: 'accounts',
    label: 'Afzal Accounts',
    short: 'Accounts',
    note: 'Runs the Accounts desk: petty cash, claims, vendor bills',
    module: 'pettyCash',
    icon: Banknote,
    jobTitle: 'Accounts Officer',
    dept: 'Accounts',
    deptId: 'dept-accounts',
    employeeNumber: 'TM-1097',
    manager: ['u-ramesh', 'Ramesh Gupta'],
    hr: hr(ALL),
    bio: 'Accounts officer — petty cash, expense claims and vendor bills.',
  },
  {
    ...base,
    id: 'super_admin',
    role: 'super_admin',
    label: 'Afzal Super Admin',
    short: 'Super Admin',
    note: 'Oversees every team, plus company settings and users',
    module: 'security',
    icon: ShieldCheck,
    jobTitle: 'Head of Operations',
    dept: 'Leadership',
    deptId: 'dept-leadership',
    employeeNumber: 'TM-1092',
    manager: ['u-kiran', 'Kiran Rao'],
    hr: hr(ADMIN_ALL, { isHrAdmin: true, canConfigure: true, approverModules: ALL }),
    bio: 'Head of operations — sets the company up on DASH and keeps an eye on every approval.',
  },
  {
    ...base,
    id: 'admin',
    role: 'admin',
    label: 'Afzal Admin',
    short: 'Admin',
    note: 'Runs the Production team’s approvals',
    module: 'shifts',
    icon: Factory,
    jobTitle: 'Production Admin',
    dept: 'Production',
    deptId: 'dept-production',
    employeeNumber: 'TM-1093',
    manager: ['u-arvind', 'Arvind Menon'],
    runs: ['dept-production'],
    hr: hr(ALL, { adminsDepts: ['dept-production'], approverModules: QUEUES }),
    bio: 'Production admin — crew schedules, shoot logistics and the Production team’s requests.',
  },
  {
    ...base,
    id: 'it_admin',
    role: 'it_admin',
    label: 'Afzal IT Admin',
    short: 'IT Admin',
    note: 'Runs the service desk, assets, rooms and the IT team’s requests',
    module: 'support',
    icon: MonitorCog,
    jobTitle: 'IT Administrator',
    dept: 'IT & Admin',
    deptId: 'dept-it',
    employeeNumber: 'TM-1094',
    manager: ['u-arvind', 'Arvind Menon'],
    runs: ['dept-it'],
    hr: hr(IT_MODULES, { adminsDepts: ['dept-it'], approverModules: IT_MODULES }),
    bio: 'IT administrator — edit workstations, storage, the office network and the IT help desk.',
  },
  {
    ...base,
    id: 'visitor_manager',
    role: 'visitor_manager',
    label: 'Afzal Visitor Manager',
    short: 'Visitors',
    note: 'Runs reception: the visitor desk, kiosk, log, invites and check-in link',
    module: 'visitors',
    icon: DoorOpen,
    jobTitle: 'Front Office Executive',
    dept: '',
    deptId: null,
    employeeNumber: 'TM-1099',
    manager: ['u-naveen', 'Naveen Kumar'],
    hr: hr([]),
    bio: 'Front office — welcomes guests and runs the visitor desk at reception.',
  },
  {
    ...base,
    id: 'announcements',
    role: 'announcement_viewer',
    label: 'Afzal Announcements',
    short: 'Display',
    // The app gives this role no news screen (features/more/menu: no menu); the news display is the TV.
    note: 'The office TV account — its news shows on the TV, not in the app',
    module: 'news',
    icon: Megaphone,
    jobTitle: 'Reception display',
    dept: '',
    deptId: null,
    employeeNumber: '',
    manager: null,
    hr: hr([]),
    bio: 'Shared display account for the reception TV.',
  },
  {
    ...base,
    id: 'app_manager',
    role: 'app_manager',
    label: 'Afzal App Manager',
    short: 'App Manager',
    note: 'Watches tasks, booking reviews and the bounty board',
    module: 'bounty',
    icon: AppWindow,
    jobTitle: 'Application Manager',
    dept: 'IT & Admin',
    deptId: 'dept-it',
    employeeNumber: 'TM-1098',
    manager: ['u-naveen', 'Naveen Kumar'],
    hr: hr(['attendance', 'regularization', 'holidays', 'leave', 'wfh', 'policies', 'salary', 'payslips']),
    bio: 'Application manager — looks after DASH itself and oversees tasks and bounties.',
  },
  {
    ...base,
    id: 'master_admin',
    role: 'master_admin',
    label: 'Afzal Master Admin',
    short: 'Master Admin',
    note: 'Runs every company on DASH: companies, their wallets and features',
    module: 'policies',
    icon: Building2,
    jobTitle: 'Platform owner',
    dept: '',
    deptId: null,
    employeeNumber: '',
    manager: null,
    tenant: false,
    // A user with no company: hr.js answers { enabled: false } and the company query never runs.
    hr: { enabled: false, modules: [], canConfigure: false, isHrAdmin: false, adminsDepts: [], approverModules: [] },
    bio: 'Owns the DASH platform: companies, wallets and features.',
  },
];

const DEFAULT = STAFF_PERSONAS[0]!;

export const staffPersona = (id: string | null | undefined) => STAFF_PERSONAS.find((p) => p.id === id) ?? null;

// ── Tokens and the signed-in user ────────────────────────────────────────────
export const personaToken = (p: StaffPersona) => (p.id === 'employee' ? DEMO_TOKEN : `${DEMO_TOKEN}:${p.id}`);

/** The staff persona a token signs in as, or null (not a staff demo token). */
export function personaFromToken(token: string | null | undefined): StaffPersona | null {
  if (!isDemoToken(token)) return null;
  if (token === DEMO_TOKEN) return DEFAULT;
  if (!token.startsWith(`${DEMO_TOKEN}:`)) return null;
  return staffPersona(token.slice(DEMO_TOKEN.length + 1));
}

/** Each persona has its own user id, so the saved query cache never mixes two roles. */
export const personaUserId = (p: StaffPersona) => (p.id === 'employee' ? DEMO_USER.id : `demo-${p.id.replace(/_/g, '-')}`);

/** The session user the picker signs in with (GET /users/:id fills in the rest). */
export function personaUser(p: StaffPersona): StaffUser {
  const phone = `+91${DEMO_PHONE}`;
  return {
    id: personaUserId(p),
    name: p.label,
    email: DEMO_EMAIL,
    role: p.role,
    ...(p.tenant ? { tenantId: DEMO_TENANT_ID } : {}),
    dept: p.dept,
    departmentId: p.deptId,
    kekaCode: p.employeeNumber,
    employeeNumber: p.employeeNumber,
    mobile: phone,
    phone,
    jobTitle: p.jobTitle,
    reportingTo: p.manager?.[0] ?? '',
    reportingManager: p.manager?.[1] ?? '',
    dateJoined: DEMO_USER.dateJoined,
    location: 'Hyderabad',
    bloodGroup: DEMO_USER.bloodGroup,
    timesheetCadence: 'daily',
  };
}

/** The gold pill's text: "DEMO · HR" for a staff persona, "DEMO · Vendor" for the vendor portal. */
export function demoPillLabel(token: string | null | undefined): string | null {
  if (!isDemoToken(token)) return null;
  const p = personaFromToken(token);
  if (p) return `DEMO · ${p.short}`;
  if (token.startsWith(VENDOR_DEMO_TOKEN_PREFIX)) return 'DEMO · Vendor';
  return 'DEMO';
}

// ── What the demo server is answering as ─────────────────────────────────────
// Roles the server never lets clock in (hr.js PUNCH_ROLES), plus the system roles the app never
// offers it to (lib/access HR_SYSTEM_ROLES): none of them have attendance of their own in the demo.
const NO_PUNCH = ['master_admin', 'visitor_manager', 'announcement_viewer'];
export const clocksIn = (p: StaffPersona) =>
  !NO_PUNCH.includes(p.role) && !HR_SYSTEM_ROLES.includes(p.role) && p.hr.enabled && p.hr.modules.includes('attendance');

let current: StaffPersona = DEFAULT;
let applied = false;
type Listener = (next: StaffPersona, prev: StaffPersona) => void;
const listeners: Listener[] = [];

export const currentPersona = () => current;

/** Fixtures register here to follow a switch (department admins, Keka Code owners, the profile…). */
export function onPersonaChange(fn: Listener) {
  listeners.push(fn);
  // A fixture that registers after a persona is in place — Fast Refresh re-running it while the app
  // is open — starts from DEMO_USER again; bring it to the current role now, or "Afzal HR" would be
  // answered with the employee's profile until the next switch. Every listener is idempotent.
  if (applied) fn(current, current);
}

/** Make `p` the persona the demo answers as (a no-op when it already is). */
export function applyPersona(p: StaffPersona) {
  if (applied && p === current) return;
  const prev = current;
  current = p;
  applied = true;
  for (const fn of listeners) fn(p, prev);
}

/** The demo person as the app sees them right now (demo/server.ts maps DEMO_USER to and from this). */
export const selfAs = () => ({ id: personaUserId(current), name: current.label });
