// Demo API for the work domain (wave 1): team tasks, the review queues, project codes and clients.
// Shapes follow the real handlers:
//   routes/tasks.js     DELETE /tasks/:id (hard delete); GET / POST / PUT stay in fixtures/tasks.ts,
//                       which read the same taskStore the rows below are added to
//   server.js           GET / PUT /time_corrections[/:id] (getAll + merge)
//   routes/projects.js  POST /projects ({ ok, project }), PUT /projects/:id (merge)
//   routes/clients.js   GET / POST / PUT / DELETE /clients[/:id]
//   routes/whitelist.js GET /whitelist (roster people who have not signed up)
// Rows carry `onlyFor` (the personas that see them), like fixtures/tasks.ts, so each Afzal persona finds
// its own team's work: Afzal Manager the Creative floor (Rahul, Sneha, Sanjay, Kavya, Nikhil), Afzal
// Admin Production (Farhan, Imran, Deepa), Afzal App Manager IT & Admin (Ravi, Pooja). Every task the
// demo person "created" names DEMO_USER, which the demo server shows as the active persona.

import type { TimeCorrection, WorkClient } from '@/api/work';
import { DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { upsertPerson, upsertProject } from '@/demo/fixtures/org';
import { bookingStore, clientStore, createTask, type DemoTask, removeTask } from '@/demo/fixtures/tasks';
import { currentPersona, type StaffPersonaId } from '@/demo/personas';
import { addDays, daysAgo, fail, istIso, minutesAgo, notFound, nowIso, today, workingDayFrom, type Route } from '@/demo/state';

const ME = String(DEMO_USER.name);
const T0 = today();
const TOMORROW = addDays(T0, 1);
const wd = (n: number) => workingDayFrom(T0, n);
const forPersona = (onlyFor?: StaffPersonaId[]) => !onlyFor || onlyFor.includes(currentPersona().id);

// ── Team tasks (added to the shared task store once) ────────────────────────
type Seed = Partial<DemoTask> & { id: string; title: string; assignee: string; onlyFor: StaffPersonaId[] };
const mineToGive = (t: Seed): Partial<DemoTask> => ({
  creator: ME,
  createdBy: DEMO_USER.id,
  managerId: DEMO_USER.id,
  status: 'pending',
  elapsedSeconds: 0,
  startedAt: null,
  timestamps: {},
  ...t,
});

const MANAGER: StaffPersonaId[] = ['manager'];
const ADMIN: StaffPersonaId[] = ['admin'];
const APP_MANAGER: StaffPersonaId[] = ['app_manager'];

const SEEDS: Seed[] = [
  // Afzal Manager — the Creative floor.
  {
    id: 'tkw1760900000101',
    onlyFor: MANAGER,
    title: 'Grade the hero shots — Sunrise Jewellers Diwali film',
    assignee: 'Rahul Verma',
    assigneeId: 'u-rahul',
    project: 'Sunrise Jewellers — Diwali Brand Film',
    kekaCode: 'TM_SJW_DIWALI26',
    dept: 'Creative',
    startDate: T0,
    startTime: '11:00',
    endTime: '14:00',
    desc: 'Warm, golden look for the six hero shots in the necklace sequence. Match skin tones to the reference stills in the grade folder.',
    createdAt: daysAgo(1, '18:20'),
  },
  {
    id: 'tkw1760900000102',
    onlyFor: MANAGER,
    title: 'Online edit — Nimbus explainer #4',
    assignee: 'Sanjay Kumar',
    assigneeId: 'u-sanjay',
    project: 'Nimbus Fintech — Explainer Series',
    kekaCode: 'TM_NIM_EXPL',
    dept: 'Creative',
    status: 'in_progress',
    startDate: T0,
    startTime: '10:00',
    endTime: '16:00',
    elapsedSeconds: 3600,
    firstStartedAt: daysAgo(0, '10:10'),
    startedAt: minutesAgo(48),
    desc: 'Conform the locked offline, swap in the final graphics from Sneha and prepare the review export.',
    createdAt: daysAgo(2, '17:45'),
  },
  {
    id: 'tkw1760900000103',
    onlyFor: MANAGER,
    title: 'Title cards — Kathalu S2, Episode 2',
    assignee: 'Sneha Iyer',
    assigneeId: 'u-sneha',
    project: 'Kathalu — Telugu Web Series S2',
    kekaCode: 'TM_KTH_S2',
    dept: 'Creative',
    startDate: wd(2),
    desc: 'Episode title, the three chapter cards and the end card, in the series font.',
    createdAt: daysAgo(5, '11:30'),
  },
  {
    id: 'tkw1760900000104',
    onlyFor: MANAGER,
    title: 'Colour pass — Aarogya social cutdowns',
    assignee: 'Rahul Verma',
    assigneeId: 'u-rahul',
    project: 'Aarogya Hospitals — Brand Campaign',
    kekaCode: 'TM_AAR_BRAND26',
    dept: 'Creative',
    status: 'submitted',
    startDate: wd(1),
    startTime: '10:00',
    endTime: '13:00',
    elapsedSeconds: 2 * 3600 + 15 * 60,
    firstStartedAt: istIso(wd(1), '10:05'),
    lastEndedAt: istIso(wd(1), '17:20'),
    completedBy: 'Rahul Verma',
    completedAt: istIso(wd(1), '17:20'),
    completionRemarks: 'All six cutdowns graded and exported to Review/Aarogya. The 1:1 versions needed a little extra lift in the shadows.',
    createdAt: daysAgo(3, '10:00'),
  },
  {
    id: 'tkw1760900000105',
    onlyFor: MANAGER,
    title: 'Logo sting — Tamada Showreel 2026',
    assignee: 'Sanjay Kumar',
    project: 'Tamada Showreel 2026 (Internal)',
    kekaCode: 'TM_INT_REEL26',
    dept: 'Creative',
    status: 'submitted',
    startDate: wd(2),
    elapsedSeconds: 3 * 3600 + 40 * 60,
    firstStartedAt: istIso(wd(2), '11:00'),
    lastEndedAt: daysAgo(0, '09:50'),
    completedBy: 'Sanjay Kumar',
    completedAt: daysAgo(0, '09:50'),
    completionRemarks: 'Two options in the showreel folder: the clean one and the glitch one. Sound is a temp track.',
    // Made on the website, which never sends assigneeId: approving it messages no one.
    managerId: undefined,
    createdBy: undefined,
    createdAt: daysAgo(4, '15:10'),
  },
  {
    id: 'tkw1760900000106',
    onlyFor: MANAGER,
    title: 'Sync dailies — Kisan Agro shoot day 1',
    assignee: 'Nikhil Jain',
    assigneeId: 'u-nikhil',
    project: 'Kisan Agro — Product Launch Film',
    kekaCode: 'TM_KAG_LAUNCH',
    dept: 'Creative',
    status: 'completed',
    startDate: wd(4),
    elapsedSeconds: 4 * 3600 + 5 * 60,
    firstStartedAt: istIso(wd(4), '10:00'),
    completedBy: 'Nikhil Jain',
    completedAt: istIso(wd(4), '16:30'),
    completionRemarks: 'All cards synced and backed up twice.',
    approvedBy: ME,
    approvedAt: istIso(wd(3), '10:15'),
    createdAt: daysAgo(6, '09:30'),
  },
  {
    id: 'tkw1760900000107',
    onlyFor: MANAGER,
    title: 'Lower thirds — Nimbus explainer #3',
    assignee: 'Sneha Iyer',
    assigneeId: 'u-sneha',
    project: 'Nimbus Fintech — Explainer Series',
    kekaCode: 'TM_NIM_EXPL',
    dept: 'Creative',
    status: 'completed',
    startDate: wd(6),
    elapsedSeconds: 2 * 3600 + 30 * 60,
    completedBy: 'Sneha Iyer',
    completedAt: istIso(wd(6), '15:00'),
    approvedBy: ME,
    approvedAt: istIso(wd(5), '11:00'),
    createdAt: daysAgo(9, '12:00'),
  },
  {
    id: 'tkw1760900000108',
    onlyFor: MANAGER,
    title: 'Subtitle pass — Aarogya walkthrough film',
    assignee: 'Nikhil Jain',
    assigneeId: 'u-nikhil',
    project: 'Aarogya Hospitals — Brand Campaign',
    kekaCode: 'TM_AAR_BRAND26',
    dept: 'Creative',
    startDate: TOMORROW,
    startTime: '10:00',
    endTime: '12:00',
    desc: 'English and Telugu subtitles from the approved transcript; burn-in for the social versions only.',
    createdAt: minutesAgo(180),
  },
  {
    id: 'tkw1760900000109',
    onlyFor: MANAGER,
    title: 'Assemble selects — Kathalu S2, Episode 3',
    assignee: 'Kavya Reddy',
    assigneeId: 'u-kavya',
    project: 'Kathalu — Telugu Web Series S2',
    kekaCode: 'TM_KTH_S2',
    dept: 'Creative',
    startDate: TOMORROW,
    startTime: '14:00',
    endTime: '18:00',
    createdAt: minutesAgo(150),
  },
  // Afzal Admin — Production.
  {
    id: 'tkw1760900000201',
    onlyFor: ADMIN,
    title: 'Recce — Kisan Agro farm location',
    assignee: 'Farhan Ali',
    assigneeId: 'u-farhan',
    project: 'Kisan Agro — Product Launch Film',
    kekaCode: 'TM_KAG_LAUNCH',
    dept: 'Production',
    startDate: T0,
    startTime: '09:00',
    endTime: '13:00',
    desc: 'Photos of the three field angles at golden hour, power points and a parking plan for the crew van.',
    createdAt: daysAgo(1, '16:00'),
  },
  {
    id: 'tkw1760900000202',
    onlyFor: ADMIN,
    title: 'Lighting plan — Kathalu S2 night exteriors',
    assignee: 'Imran Shaikh',
    assigneeId: 'u-imran',
    project: 'Kathalu — Telugu Web Series S2',
    kekaCode: 'TM_KTH_S2',
    dept: 'Production',
    status: 'in_progress',
    startDate: T0,
    elapsedSeconds: 90 * 60,
    firstStartedAt: daysAgo(0, '09:30'),
    lastEndedAt: daysAgo(0, '11:00'),
    createdAt: daysAgo(2, '10:30'),
  },
  {
    id: 'tkw1760900000203',
    onlyFor: ADMIN,
    title: 'Camera prep and test shoot — Aarogya day 2',
    assignee: 'Farhan Ali',
    assigneeId: 'u-farhan',
    project: 'Aarogya Hospitals — Brand Campaign',
    kekaCode: 'TM_AAR_BRAND26',
    dept: 'Production',
    status: 'submitted',
    startDate: wd(1),
    elapsedSeconds: 3 * 3600,
    completedBy: 'Farhan Ali',
    completedAt: istIso(wd(1), '18:05'),
    completionRemarks: 'FX6 and both lenses checked. Test footage is on the shared drive, folder AAR_D2_TEST.',
    createdAt: daysAgo(3, '09:00'),
  },
  {
    id: 'tkw1760900000204',
    onlyFor: ADMIN,
    title: 'Return rented lights to Vasavi Rentals',
    assignee: 'Imran Shaikh',
    assigneeId: 'u-imran',
    project: 'Internal — Admin, Training & Pitches',
    kekaCode: 'TM_INT_ADMIN',
    dept: 'Production',
    status: 'completed',
    startDate: wd(5),
    elapsedSeconds: 75 * 60,
    completedBy: 'Imran Shaikh',
    completedAt: istIso(wd(5), '13:00'),
    approvedBy: ME,
    approvedAt: istIso(wd(4), '09:40'),
    createdAt: daysAgo(8, '12:00'),
  },
  {
    id: 'tkw1760900000205',
    onlyFor: ADMIN,
    title: 'Crew call sheet — Kathalu S2 week 3',
    assignee: 'Deepa Menon',
    assigneeId: 'u-deepa',
    project: 'Kathalu — Telugu Web Series S2',
    kekaCode: 'TM_KTH_S2',
    dept: 'Production',
    startDate: wd(2),
    createdAt: daysAgo(4, '14:00'),
  },
  // Afzal App Manager — IT & Admin (their own department: they run none).
  {
    id: 'tkw1760900000301',
    onlyFor: APP_MANAGER,
    title: 'Replace the UPS batteries in Edit Suites 1–3',
    assignee: 'Ravi Teja',
    assigneeId: 'u-ravi',
    project: 'Internal — Admin, Training & Pitches',
    kekaCode: 'TM_INT_ADMIN',
    dept: 'IT & Admin',
    startDate: T0,
    createdAt: daysAgo(1, '12:00'),
  },
  {
    id: 'tkw1760900000302',
    onlyFor: APP_MANAGER,
    title: 'Monthly stock check — office supplies',
    assignee: 'Pooja Rao',
    assigneeId: 'u-pooja',
    project: 'Internal — Admin, Training & Pitches',
    kekaCode: 'TM_INT_ADMIN',
    dept: 'IT & Admin',
    status: 'submitted',
    startDate: wd(1),
    elapsedSeconds: 100 * 60,
    completedBy: 'Pooja Rao',
    completedAt: istIso(wd(1), '16:40'),
    completionRemarks: 'Stock sheet updated; we need printer toner and A4 paper this week.',
    createdAt: daysAgo(2, '10:00'),
  },
  {
    id: 'tkw1760900000303',
    onlyFor: APP_MANAGER,
    title: 'Set up the new visitor laptop',
    assignee: 'Ravi Teja',
    assigneeId: 'u-ravi',
    project: 'Internal — Admin, Training & Pitches',
    kekaCode: 'TM_INT_ADMIN',
    dept: 'IT & Admin',
    status: 'completed',
    startDate: wd(3),
    elapsedSeconds: 2 * 3600,
    completedBy: 'Ravi Teja',
    completedAt: istIso(wd(3), '17:00'),
    approvedBy: ME,
    approvedAt: istIso(wd(2), '09:30'),
    createdAt: daysAgo(5, '11:00'),
  },
];
for (const seed of SEEDS) createTask(mineToGive(seed) as Partial<DemoTask>);

// One approved booking for Sanjay tomorrow (the manager's Tomorrow card and "Team today" sheet), and
// Rahul away tomorrow (user.leaveDates, as the web reads it).
if (!bookingStore.some((b) => b.id === 'bk-work-sanjay')) {
  bookingStore.push({
    id: 'bk-work-sanjay',
    type: 'professionals',
    status: 'approved',
    resource: 'Sanjay Kumar',
    resourceId: 'u-sanjay',
    requestedBy: 'Meera Nair',
    requestedById: 'u-meera',
    date: TOMORROW,
    dates: [TOMORROW],
    startTime: '10:00',
    endTime: '14:00',
    project: 'Aarogya Hospitals — Brand Campaign',
    kekaCode: 'TM_AAR_BRAND26',
    comments: 'Edit the Doctors’ Day interviews into a 90-second film.',
    profDept: 'Creative',
    createdAt: daysAgo(2, '12:30'),
  });
}
upsertPerson({ id: 'u-rahul', leaveDates: [TOMORROW] });

// ── Time corrections (stored with a tenantId here; see docs/port/manager-work.md §8) ─────
type Correction = TimeCorrection & { tenantId: string; onlyFor: StaffPersonaId[] };
const CORRECTIONS: Correction[] = [
  {
    id: 'tc1760900000001',
    onlyFor: MANAGER,
    tenantId: DEMO_TENANT_ID,
    taskId: 'tkw1760900000106',
    taskTitle: 'Sync dailies — Kisan Agro shoot day 1',
    taskDate: wd(4),
    assignee: 'Nikhil Jain',
    assigneeId: 'u-nikhil',
    project: 'TM_KAG_LAUNCH',
    requestedHours: 1.5,
    reason: 'The timer was paused while the backup copy ran after hours — I stayed to check it finished.',
    status: 'pending',
    createdAt: daysAgo(1, '10:20'),
  },
  {
    id: 'tc1760900000002',
    onlyFor: ADMIN,
    tenantId: DEMO_TENANT_ID,
    taskId: 'tkw1760900000204',
    taskTitle: 'Return rented lights to Vasavi Rentals',
    taskDate: wd(5),
    assignee: 'Imran Shaikh',
    assigneeId: 'u-imran',
    project: 'TM_INT_ADMIN',
    requestedHours: 2,
    reason: 'Forgot to start the timer before leaving for the rental office.',
    status: 'pending',
    createdAt: daysAgo(2, '09:15'),
  },
];

// ── Clients (the demo person's own; the four unowned ones in fixtures/tasks.ts stay) ─────
type DemoClient = WorkClient & { onlyFor: StaffPersonaId[] };
const MY_CLIENTS: DemoClient[] = [
  { id: 'cl-work-zenith', onlyFor: MANAGER, name: 'Zenith Motors', channelName: 'Zenith Drive', email: 'marketing@zenithmotors.example', phone: '+919000177011', managerId: DEMO_USER.id, managerName: ME, createdAt: daysAgo(40) },
  { id: 'cl-work-annapurna', onlyFor: MANAGER, name: 'Annapurna Foods', channelName: 'Annapurna Kitchen', email: 'brand@annapurna.example', phone: '+919000177012', managerId: DEMO_USER.id, managerName: ME, createdAt: daysAgo(25) },
  { id: 'cl-work-vidya', onlyFor: MANAGER, name: 'Vidya Learning', channelName: 'Vidya Telugu', email: 'content@vidya.example', phone: '', managerId: DEMO_USER.id, managerName: ME, createdAt: daysAgo(10) },
  { id: 'cl-work-greenleaf', onlyFor: ['employee'], name: 'Greenleaf Organics', channelName: 'Greenleaf Daily', email: 'hello@greenleaf.example', phone: '+919000177021', managerId: DEMO_USER.id, managerName: ME, createdAt: daysAgo(30) },
  { id: 'cl-work-skyline', onlyFor: ['employee'], name: 'Skyline Realty', channelName: '', email: 'sales@skyline.example', phone: '+919000177022', managerId: DEMO_USER.id, managerName: ME, createdAt: daysAgo(12) },
  { id: 'cl-work-ramoji', onlyFor: ADMIN, name: 'Lakeview Studios', channelName: 'Lakeview', email: 'bookings@lakeview.example', phone: '+919000177031', managerId: DEMO_USER.id, managerName: ME, createdAt: daysAgo(20) },
];
const ADDED: (WorkClient & { onlyFor?: StaffPersonaId[] })[] = [];
const clientsNow = () => [...clientStore, ...MY_CLIENTS.filter((c) => forPersona(c.onlyFor)), ...ADDED.filter((c) => forPersona(c.onlyFor))];
const findClient = (id: string) => MY_CLIENTS.find((c) => c.id === id) ?? ADDED.find((c) => c.id === id) ?? clientStore.find((c) => c.id === id);
const stripOnly = <T extends { onlyFor?: unknown }>({ onlyFor: _o, ...rest }: T) => rest;

// ── Roster people who have not signed up (routes/whitelist.js, avatars stripped) ──
const WHITELIST = [{ id: 'wl-tejas', name: 'Tejas Kulkarni', email: 'tejas.kulkarni.demo@tamadamedia.com', employeeNumber: 'TM-1101', role: 'employee', hasAvatar: false }];

const str = (v: unknown) => (v == null ? '' : String(v));

export const workRoutes: Route[] = [
  [
    'DELETE',
    /^\/tasks\/([^/]+)$/,
    ([, id]) => (removeTask(id!) ? { ok: true } : notFound('Task not found')),
  ],

  ['GET', /^\/time_corrections$/, () => CORRECTIONS.filter((c) => forPersona(c.onlyFor)).map(stripOnly)],
  [
    'PUT',
    /^\/time_corrections\/([^/]+)$/,
    ([, id], body) => {
      const c = CORRECTIONS.find((x) => x.id === id);
      if (!c) return notFound('Not found');
      const { performedById: _p, actorId: _a, ...changes } = (body || {}) as Record<string, unknown>;
      Object.assign(c, changes);
      return { ok: true };
    },
  ],

  [
    'POST',
    /^\/projects$/,
    (_p, body) => {
      const b = (body || {}) as Record<string, unknown>;
      const { performedById: _pp, tenantId: _t, ...rest } = b;
      const project = upsertProject({ status: 'active', ...rest, id: str(rest.id) || `p${Date.now()}` } as Parameters<typeof upsertProject>[0]);
      return { ok: true, project };
    },
  ],
  [
    'PUT',
    /^\/projects\/([^/]+)$/,
    ([, id], body) => {
      const { performedById: _p, tenantId: _t, ...changes } = (body || {}) as Record<string, unknown>;
      upsertProject({ ...changes, id: id! } as Parameters<typeof upsertProject>[0]);
      return { ok: true };
    },
  ],
  ['DELETE', /^\/projects\/([^/]+)$/, () => fail('Project codes are never deleted from the app.', 400)],

  ['GET', /^\/clients$/, () => clientsNow().map((c) => stripOnly(c as WorkClient & { onlyFor?: unknown }))],
  [
    'POST',
    /^\/clients$/,
    (_p, body) => {
      const b = (body || {}) as Record<string, unknown>;
      if (!str(b.name).trim()) return fail('Name is required');
      const c: WorkClient & { onlyFor?: StaffPersonaId[] } = {
        id: str(b.id) || `cl${Date.now()}`,
        name: str(b.name).trim(),
        channelName: str(b.channelName),
        email: str(b.email),
        phone: str(b.phone),
        managerId: str(b.managerId),
        managerName: str(b.managerName),
        createdAt: str(b.createdAt) || nowIso(),
        onlyFor: [currentPersona().id],
      };
      ADDED.push(c);
      return { ok: true, client: stripOnly(c) };
    },
  ],
  [
    'PUT',
    /^\/clients\/([^/]+)$/,
    ([, id], body) => {
      const c = findClient(id!);
      if (!c) return notFound('Client not found');
      const { performedById: _p, tenantId: _t, id: _i, ...changes } = (body || {}) as Record<string, unknown>;
      Object.assign(c, changes);
      return { ok: true };
    },
  ],
  [
    'DELETE',
    /^\/clients\/([^/]+)$/,
    ([, id]) => {
      for (const list of [MY_CLIENTS, ADDED, clientStore] as { id: string }[][]) {
        const i = list.findIndex((c) => c.id === id);
        if (i >= 0) {
          list.splice(i, 1);
          return { ok: true };
        }
      }
      return notFound('Client not found');
    },
  ],

  ['GET', /^\/whitelist$/, () => WHITELIST],
];
