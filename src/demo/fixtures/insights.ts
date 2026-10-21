// Demo API for the insights domain (wave 2): Reports' history and Device monitoring (TM360).
// Owner: the insights agent. Shared data is read and changed only through the exported stores
// (org.ts allPeople / PROJECTS, tasks.ts createTask); this file never edits another fixture.
//
// Reports — about fifty sent and completed tasks over last month and this one (never today, so Home and
// Team today are untouched) for the Creative floor, Production, Marketing, IT & Admin and HR, with
// Keka codes from the demo projects and two timers left running for a day (Reports leaves those empty,
// as the website does). Reports itself reads GET /tasks, /users, /departments, /projects and
// /time_corrections from the other fixtures.
//
// TM360 — mirrors tm360.js: visibilityFor (309) — IT Admin, Super Admin and Master Admin see everyone
// and may pair; a manager or admin sees only the people whose reporting manager they are (by name,
// case-insensitive), read-only; anyone else gets 403. Twelve people are linked, eleven have a paired
// machine, two machines are waiting with codes (K7QM-4XPT, R2D8-HN6C; any other XXXX-XXXX code pairs
// a new machine). Link / pair / unpair change this in-memory state until the app restarts.

import type { Tm360Activity, Tm360DailyScore, Tm360Device, Tm360Employee, Tm360Location, Tm360Named, Tm360Restriction } from '@/api/insights';
import { allPeople, PROJECTS, type Person, profile } from '@/demo/fixtures/org';
import { createTask } from '@/demo/fixtures/tasks';
import { currentPersona } from '@/demo/personas';
import { addDays, eachDate, fail, istIso, minutesAgo, rand, today, weekdayOf, workingDayFrom, type Route } from '@/demo/state';

const T0 = today();

// ── Reports: past work ───────────────────────────────────────────────────────
type Plan = { id: string; name: string; projects: string[]; titles: string[] };
const PLANS: Plan[] = [
  { id: 'u-rahul', name: 'Rahul Verma', projects: ['p-kathalu', 'p-nimbus'], titles: ['Grade episode', 'Colour pass', 'Look development', 'Final grade review'] },
  { id: 'u-sneha', name: 'Sneha Iyer', projects: ['p-nimbus', 'p-reel'], titles: ['Motion titles', 'Lower thirds', 'Explainer animation', 'Logo sting'] },
  { id: 'u-sanjay', name: 'Sanjay Kumar', projects: ['p-kathalu', 'p-kisan'], titles: ['Rough cut', 'Fine cut', 'Client changes', 'Online conform'] },
  { id: 'u-kavya', name: 'Kavya Reddy', projects: ['p-reel', 'p-kisan'], titles: ['Assemble selects', 'Social cutdowns', 'Subtitle sync'] },
  { id: 'u-nikhil', name: 'Nikhil Jain', projects: ['p-kisan', 'p-kathalu'], titles: ['Sync dailies', 'Proxy export', 'Organise bins'] },
  { id: 'u-anita', name: 'Anita Desai', projects: ['p-nimbus', 'p-kathalu'], titles: ['Dialogue edit', 'Final mix', 'Foley pass'] },
  { id: 'u-farhan', name: 'Farhan Ali', projects: ['p-kisan', 'p-admin'], titles: ['Shoot day', 'Camera prep', 'Recce'] },
  { id: 'u-imran', name: 'Imran Shaikh', projects: ['p-kisan', 'p-admin'], titles: ['Lighting setup', 'Gear check-in', 'Shoot day'] },
  { id: 'u-meera', name: 'Meera Nair', projects: ['p-reel', 'p-admin'], titles: ['Content calendar', 'Campaign brief', 'Pitch deck'] },
  { id: 'u-zoya', name: 'Zoya Khan', projects: ['p-reel'], titles: ['Schedule posts', 'Community replies', 'Reel captions'] },
  { id: 'u-ravi', name: 'Ravi Teja', projects: ['p-admin'], titles: ['Edit suite maintenance', 'NAS backup check', 'Laptop setup'] },
  { id: 'u-pooja', name: 'Pooja Rao', projects: ['p-admin'], titles: ['Vendor invoices', 'Office supplies order'] },
  { id: 'u-farah', name: 'Farah Siddiqui', projects: ['p-admin'], titles: ['Interview round', 'Job post review'] },
];

const REVIEW_LATER = ['u-meera', 'u-zoya', 'u-farah'];

const isWorkday = (d: string) => weekdayOf(d) !== 0 && weekdayOf(d) !== 6;

function seedReportTasks() {
  const firstLastMonth = `${addDays(`${T0.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
  const yesterday = workingDayFrom(T0, 1);
  if (yesterday < firstLastMonth) return;
  const days = eachDate(firstLastMonth, yesterday).filter(isWorkday);
  if (!days.length) return;
  let n = 0;
  for (const p of PLANS) {
    const count = 3 + Math.floor(rand(`${p.id}:count`) * 3); // 3–5 each
    for (let i = 0; i < count; i++) {
      const seed = `${p.id}:${i}`;
      const date = days[Math.floor(rand(`${seed}:day`) * days.length)]!;
      const project = PROJECTS.find((x) => x.id === p.projects[i % p.projects.length]) ?? PROJECTS[0]!;
      const hours = 1 + Math.floor(rand(`${seed}:h`) * 8); // 1–8 h
      const mins = Math.floor(rand(`${seed}:m`) * 60);
      // Approved, except a few Marketing and HR tasks still waiting on review (their managers are not
      // personas, so no Inbox gains review items from this seed).
      const submitted = REVIEW_LATER.includes(p.id) && i === 0;
      n += 1;
      createTask({
        id: `tki${Date.parse(`${date}T00:00:00Z`)}${String(n).padStart(3, '0')}`,
        title: `${p.titles[i % p.titles.length]} — ${String(project.name).split(' — ')[0]}`,
        assignee: p.name,
        assigneeId: p.id,
        dept: personDept(p.id),
        project: project.name,
        kekaCode: project.kekaCode,
        status: submitted ? 'submitted' : 'completed',
        startDate: date,
        date,
        startTime: '10:00',
        createdAt: istIso(date, '09:30'),
        startedAt: null,
        firstStartedAt: istIso(date, '10:00'),
        lastEndedAt: istIso(date, 10 * 60 + hours * 60 + mins),
        elapsedSeconds: hours * 3600 + mins * 60,
        ...(submitted ? {} : { completedAt: istIso(addDays(date, 1), '11:00'), completedBy: 'Priya Sharma' }),
      });
    }
  }
  // Two timers nobody stopped (≥ 24 h): Reports shows these as empty, exactly like the website.
  const run = [
    ['u-sanjay', 'Sanjay Kumar', 'Export master — Kathalu S2 Ep 4', 'p-kathalu', 26 * 3600 + 120],
    ['u-farhan', 'Farhan Ali', 'Camera prep — Kisan launch', 'p-kisan', 31 * 3600],
  ] as const;
  run.forEach(([id, name, title, pid, secs], i) => {
    const date = days[Math.max(0, days.length - 3 - i * 4)]!;
    const project = PROJECTS.find((x) => x.id === pid) ?? PROJECTS[0]!;
    createTask({
      id: `tki${Date.parse(`${date}T00:00:00Z`)}9${i}`,
      title,
      assignee: name,
      assigneeId: id,
      dept: personDept(id),
      project: project.name,
      kekaCode: project.kekaCode,
      status: 'completed',
      startDate: date,
      date,
      createdAt: istIso(date, '09:00'),
      completedAt: istIso(addDays(date, 2), '10:00'),
      startedAt: null,
      elapsedSeconds: secs,
    });
  });
}

function personDept(id: string) {
  return allPeople().find((p) => p.id === id)?.dept ?? '';
}

seedReportTasks();

// ── TM360 ────────────────────────────────────────────────────────────────────
const TM360_ADMIN_ROLES = ['it_admin', 'super_admin', 'ceo', 'coo', 'master_admin'];
const TM360_MANAGER_ROLES = ['manager', 'admin'];
const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();

type LiveState = 'online' | 'idle' | 'offline';
type TmLink = { tm360Id: string; role: string; devices: Tm360Device[]; state: LiveState; score: number };

const HOST: Record<string, string> = {
  'u-rahul': 'EDIT-WS-07',
  'u-sneha': 'MOTION-MBP-02',
  'u-sanjay': 'EDIT-WS-03',
  'u-kavya': 'EDIT-WS-09',
  'u-anita': 'AUDIO-MAC-01',
  'u-farhan': 'PROD-MBP-02',
  'u-imran': 'PROD-WIN-04',
  'u-deepa': 'PROD-MBP-01',
  'u-meera': 'MKT-LT-03',
  'u-ravi': 'IT-WS-01',
  'u-naveen': 'IT-MBP-02',
};
const STATE: Record<string, LiveState> = {
  'u-rahul': 'online',
  'u-sanjay': 'online',
  'u-ravi': 'online',
  'u-sneha': 'idle',
  'u-farhan': 'idle',
  'u-meera': 'idle',
  'u-kavya': 'idle',
  'u-anita': 'offline',
  'u-imran': 'offline',
  'u-deepa': 'offline',
  'u-naveen': 'offline',
};

const links = new Map<string, TmLink>();
for (const [id, host] of Object.entries(HOST)) {
  const state = STATE[id] ?? 'offline';
  const seen = istIso(workingDayFrom(T0, 1), '19:05');
  const isWin = /WIN|WS|LT/.test(host);
  links.set(id, {
    tm360Id: `tm-${id.slice(2)}`,
    role: ['u-deepa', 'u-naveen'].includes(id) ? 'MANAGER' : 'EMPLOYEE',
    devices: [{ id: `dev-${id.slice(2)}`, hostname: host, status: 'ACTIVE', lastSeenAt: seen, platform: isWin ? 'Windows 11' : 'macOS 15' }],
    state,
    score: 55 + Math.round(rand(`${id}:score`) * 35),
  });
}
// Linked, but their machine has not been paired yet.
links.set('u-vikram', { tm360Id: 'tm-vikram', role: 'MANAGER', devices: [], state: 'offline', score: 0 });
// Sanjay's old machine, unpaired last month.
links.get('u-sanjay')?.devices.push({ id: 'dev-sanjay-old', hostname: 'EDIT-WS-01', status: 'REVOKED', lastSeenAt: istIso(addDays(T0, -34), '18:40'), platform: 'Windows 10' });

const waiting: (Tm360Device & { code: string })[] = [
  { id: 'dev-wait-1', code: 'K7QM-4XPT', hostname: 'EDIT-WS-11', status: 'PENDING', lastSeenAt: minutesAgo(40), platform: 'Windows 11' },
  { id: 'dev-wait-2', code: 'R2D8-HN6C', hostname: 'PROD-MBP-05', status: 'PENDING', lastSeenAt: minutesAgo(180), platform: 'macOS 15' },
];

// Invited to DASH but not signed up yet (tm360.js includes roster rows: "Pending signup").
const PENDING_SIGNUP = {
  id: 'wl:wl-tejas',
  name: 'Tejas Kulkarni',
  email: 'tejas.kulkarni.demo@tamadamedia.com',
  role: 'employee',
  dept: 'Creative',
  jobTitle: 'Motion Graphics Intern',
  employeeNumber: '',
  reportingManager: 'Priya Sharma',
  additionalManager: '',
};

type DashRow = { id: string; name: string; email: string; role: string; dept: string; jobTitle: string; employeeNumber: string; reportingManager: string; additionalManager: string; pending: boolean };

function dashUsers(): DashRow[] {
  const people: DashRow[] = allPeople().map((p: Person) => ({
    id: p.id,
    name: p.name,
    email: lower(p.email),
    role: String(p.role ?? 'employee'),
    dept: p.dept,
    jobTitle: String(p.jobTitle ?? ''),
    employeeNumber: p.employeeNumber,
    reportingManager: String(p.reportingManager ?? ''),
    additionalManager: String(p.additionalManager ?? ''),
    pending: false,
  }));
  return [...people, { ...PENDING_SIGNUP, pending: true }];
}

/** visibilityFor (tm360.js:309). The demo person's stored name is the persona's on the way out. */
function visibility() {
  const role = currentPersona().role;
  const all = dashUsers();
  if (TM360_ADMIN_ROLES.includes(role)) return { kind: 'all' as const, canPair: true, users: all };
  if (TM360_MANAGER_ROLES.includes(role)) {
    const me = lower(profile.name);
    return { kind: 'some' as const, canPair: false, users: all.filter((u) => lower(u.reportingManager) === me || lower(u.additionalManager) === me) };
  }
  return null;
}

const denied = () => fail('You do not have access to Device Monitoring.', 403);
const pairOnly = () => fail('Only IT & Admin can pair, unpair or link TM360 accounts.', 403);

// Online and idle machines were seen moments ago, whenever the request is made.
function freshen(l: TmLink) {
  const at = l.state === 'online' ? minutesAgo(1) : l.state === 'idle' ? minutesAgo(14) : null;
  if (at) for (const d of l.devices) if (d.status === 'ACTIVE') d.lastSeenAt = at;
}

function employeeRow(u: DashRow): Tm360Employee {
  const l = links.get(u.id);
  if (l) freshen(l);
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    dept: u.dept,
    jobTitle: u.jobTitle,
    employeeNumber: u.employeeNumber,
    role: u.role,
    reportingManager: u.reportingManager,
    pendingSignup: u.pending,
    matched: !!l,
    tm360: l ? { id: l.tm360Id, role: l.role, status: 'ACTIVE' } : null,
    devices: l ? l.devices.map((d) => ({ ...d })) : [],
  };
}

const visibleEmail = (vis: NonNullable<ReturnType<typeof visibility>>, email: string) => vis.users.find((u) => u.email === lower(email)) ?? null;

// ── Activity, built the same way every time for one person and day ─────────
type App = { app: string; domain?: string; title: string; category: 'Productive' | 'Neutral' | 'Unproductive' };
const CREATIVE_APPS: App[] = [
  { app: 'Adobe Premiere Pro', title: 'Kathalu_S2_Ep4_FineCut.prproj', category: 'Productive' },
  { app: 'DaVinci Resolve', title: 'Nimbus_Explainer_Grade', category: 'Productive' },
  { app: 'Adobe After Effects', title: 'Titles_v3.aep', category: 'Productive' },
  { app: 'Google Chrome', domain: 'frame.io', title: 'Review — Nimbus explainer #3', category: 'Productive' },
  { app: 'Slack', title: 'Tamada Media — #post-production', category: 'Neutral' },
  { app: 'Google Chrome', domain: 'drive.google.com', title: 'Client deliverables', category: 'Neutral' },
  { app: 'Google Chrome', domain: 'youtube.com', title: 'YouTube', category: 'Unproductive' },
];
const OFFICE_APPS: App[] = [
  { app: 'Google Chrome', domain: 'mail.google.com', title: 'Inbox', category: 'Neutral' },
  { app: 'Microsoft Excel', title: 'Shoot_Schedule_Oct.xlsx', category: 'Productive' },
  { app: 'Google Chrome', domain: 'docs.google.com', title: 'Call sheet — Kisan launch', category: 'Productive' },
  { app: 'WhatsApp', title: 'WhatsApp', category: 'Neutral' },
  { app: 'Slack', title: 'Tamada Media — #production', category: 'Neutral' },
  { app: 'Google Chrome', domain: 'instagram.com', title: 'Instagram', category: 'Unproductive' },
];

function activityFor(u: DashRow, from: string, to: string): Tm360Activity[] {
  const l = links.get(u.id);
  if (!l || !l.devices.some((d) => d.status === 'ACTIVE')) return [];
  const device = l.devices.find((d) => d.status === 'ACTIVE')!;
  const apps = ['Creative'].includes(u.dept) ? CREATIVE_APPS : OFFICE_APPS;
  const out: Tm360Activity[] = [];
  const end = to > T0 ? T0 : to;
  const days = from <= end ? eachDate(from, end).slice(-14) : [];
  for (const day of days) {
    if (!isWorkday(day)) continue;
    let min = 10 * 60 + Math.floor(rand(`${u.id}:${day}:start`) * 25);
    const stop = day === T0 ? Math.min(18 * 60 + 30, nowMinutes() - 5) : 18 * 60 + 30;
    let i = 0;
    while (min < stop) {
      const seed = `${u.id}:${day}:${i}`;
      const idle = rand(`${seed}:idle`) < 0.16 || (min >= 13 * 60 + 15 && min < 14 * 60);
      const a = apps[Math.floor(rand(`${seed}:app`) * apps.length)]!;
      const len = Math.min(stop - min, idle ? 8 + Math.floor(rand(`${seed}:len`) * 30) : 4 + Math.floor(rand(`${seed}:len`) * 26));
      if (len <= 0) break;
      out.push({
        id: `${u.id}-${day}-${i}`,
        occurredAt: istIso(day, min),
        appName: a.app,
        domain: a.domain ?? '',
        windowTitle: a.title,
        url: a.domain ? `https://${a.domain}/` : '',
        durationSeconds: len * 60,
        isIdle: idle,
        category: a.category,
        deviceId: device.id,
      });
      min += len;
      i += 1;
    }
  }
  return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function nowMinutes() {
  const d = new Date(Date.now() + 330 * 60_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function sumBy(rows: Tm360Activity[], key: (r: Tm360Activity) => string): Tm360Named[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.isIdle) continue;
    const k = key(r);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + r.durationSeconds);
  }
  return [...m.entries()].map(([name, seconds]) => ({ name, seconds })).sort((a, b) => b.seconds - a.seconds).slice(0, 8);
}

function summaryFor(u: DashRow, from: string, to: string) {
  const rows = activityFor(u, from, to);
  const active = rows.filter((r) => !r.isIdle).reduce((n, r) => n + r.durationSeconds, 0);
  const idle = rows.filter((r) => r.isIdle).reduce((n, r) => n + r.durationSeconds, 0);
  const byDay = new Map<string, Tm360Activity[]>();
  for (const r of rows) {
    const d = new Date(Date.parse(r.occurredAt) + 330 * 60_000).toISOString().slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const dailyScores: Tm360DailyScore[] = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, rs]) => {
      const m = (c: string) => Math.round(rs.filter((r) => !r.isIdle && r.category === c).reduce((n, r) => n + r.durationSeconds, 0) / 60);
      const idleMin = Math.round(rs.filter((r) => r.isIdle).reduce((n, r) => n + r.durationSeconds, 0) / 60);
      const p = m('Productive');
      const ne = m('Neutral');
      const un = m('Unproductive');
      const act = p + ne + un;
      return { date, score: act ? Math.round(((p + ne * 0.5) / act) * 100) : null, productiveMinutes: p, neutralMinutes: ne, unproductiveMinutes: un, idleMinutes: idleMin, activeMinutes: act };
    });
  return {
    activeSeconds: active,
    idleSeconds: idle,
    sampledRows: rows.length,
    sampleCapped: false,
    topApps: sumBy(rows, (r) => r.appName),
    topDomains: sumBy(rows, (r) => r.domain),
    byCategory: sumBy(rows, (r) => r.category),
    dailyScores,
  };
}

function restrictionsFor(u: DashRow, from: string, to: string): Tm360Restriction[] {
  if (!links.get(u.id)?.devices.some((d) => d.status === 'ACTIVE')) return [];
  const a = workingDayFrom(T0, 1 + Math.floor(rand(`${u.id}:r1`) * 3));
  const b = workingDayFrom(T0, 3 + Math.floor(rand(`${u.id}:r2`) * 3));
  const all: Tm360Restriction[] = [
    { id: `${u.id}-r1`, occurredAt: istIso(a, '15:42'), kind: 'Website', matched: 'https://www.youtube.com/shorts', pattern: 'youtube.com/shorts', outcome: 'Blocked' },
    { id: `${u.id}-r2`, occurredAt: istIso(b, '12:18'), kind: 'Application', matched: 'uTorrent.exe', pattern: 'torrent clients', outcome: 'Flagged' },
  ];
  return all.filter((e) => {
    const d = new Date(Date.parse(e.occurredAt) + 330 * 60_000).toISOString().slice(0, 10);
    return d >= from && d <= to;
  });
}

function locationsFor(u: DashRow): Tm360Location[] {
  const l = links.get(u.id);
  if (!l) return [];
  return l.devices
    .filter((d) => d.status === 'ACTIVE')
    .map((d, i) => ({
      deviceId: d.id,
      hostname: d.hostname,
      status: d.status,
      platform: d.platform,
      address: 'Tamada Media, Road No. 36, Jubilee Hills, Hyderabad, Telangana 500033',
      latitude: 17.4326 + i * 0.0004,
      longitude: 78.4071,
      accuracyMetres: 35,
      source: 'Wi-Fi',
      reportedAt: d.lastSeenAt,
      lastSeenAt: d.lastSeenAt,
    }));
}

// Range from the app: real instants (IST day starts) → IST days.
const istDay = (iso: string | null, fallback: string) => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? new Date(t + 330 * 60_000).toISOString().slice(0, 10) : fallback;
};

const CODE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export const insightsRoutes: Route[] = [
  [
    'GET',
    /^\/tm360\/health$/,
    () => {
      const vis = visibility();
      if (!vis) return denied();
      return { configured: true, canPair: vis.canPair, scope: vis.kind, visibleEmployees: vis.users.length };
    },
  ],
  [
    'GET',
    /^\/tm360\/roster$/,
    () => {
      const vis = visibility();
      if (!vis) return denied();
      const employees = vis.users.map(employeeRow);
      const matched = employees.filter((e) => e.matched).length;
      return {
        scope: vis.kind,
        canPair: vis.canPair,
        employees,
        unassignedDevices: vis.canPair ? waiting.map(({ code: _c, ...d }) => d) : [],
        matchedCount: matched,
        unmatchedCount: employees.length - matched,
        inTm360ButNotVisible: 0,
      };
    },
  ],
  [
    'GET',
    /^\/tm360\/live$/,
    () => {
      const vis = visibility();
      if (!vis) return denied();
      const status: Record<string, { state: string; lastActiveAt: string; productivityScore: number | null }> = {};
      const scores: number[] = [];
      for (const u of vis.users) {
        const l = links.get(u.id);
        if (!l) continue;
        freshen(l);
        const dev = l.devices.find((d) => d.status === 'ACTIVE');
        const state = dev ? l.state : 'unpaired';
        status[u.email] = { state, lastActiveAt: dev?.lastSeenAt ?? '', productivityScore: dev ? l.score : null };
        if (dev) scores.push(l.score);
      }
      const states = Object.values(status).map((s) => s.state);
      return {
        scope: vis.kind,
        tracked: states.length,
        online: states.filter((s) => s === 'online').length,
        idle: states.filter((s) => s === 'idle').length,
        notPaired: states.filter((s) => s === 'unpaired').length,
        avgProductivity: scores.length ? scores.reduce((n, s) => n + s, 0) / scores.length : null,
        status,
      };
    },
  ],
  [
    'GET',
    /^\/tm360\/employee\/(summary|activity|restrictions|location|screenshots)$/,
    ([, kind], _b, q) => {
      const vis = visibility();
      if (!vis) return denied();
      const u = visibleEmail(vis, q.get('email') ?? '');
      if (!u) return fail('That person is not one of the people you can see.', 404);
      if (!links.get(u.id)) return fail(`${u.name} has no TM360 account on that address.`, 404);
      const to = istDay(q.get('to'), T0);
      const from = istDay(q.get('from'), addDays(to, -7));
      if (kind === 'summary') return summaryFor(u, from, to);
      if (kind === 'activity') return { activity: activityFor(u, from, to) };
      if (kind === 'restrictions') return { events: restrictionsFor(u, from, to) };
      if (kind === 'location') return { locations: locationsFor(u) };
      return { screenshots: [] };
    },
  ],
  [
    'POST',
    /^\/tm360\/employees\/link$/,
    (_p, body) => {
      const vis = visibility();
      if (!vis) return denied();
      if (!vis.canPair) return pairOnly();
      const target = vis.users.find((u) => u.id === String(body?.userId ?? ''));
      if (!target) return fail('That person is not in DASH.', 404);
      if (!target.email) return fail('That person has no email address on their DASH record.', 400);
      if (links.has(target.id)) return { created: false, alreadyExisted: true, tm360UserId: links.get(target.id)!.tm360Id, role: links.get(target.id)!.role };
      if (String(target.name).trim().split(/\s+/).length < 2) {
        return fail(`TM360 needs a first and a last name, and "${target.name || target.email}" is one word. Add a surname on their Employee Roster record, then link them.`, 400);
      }
      const role = ['manager', 'admin', 'hr', 'it_admin', 'super_admin', 'ceo', 'coo', 'app_manager'].includes(target.role) ? 'MANAGER' : 'EMPLOYEE';
      if (role === 'EMPLOYEE' && !target.reportingManager) {
        return fail(`${target.name || target.email} has no reporting manager on their DASH record, and TM360 will not create an employee without one. Set it in the Employee Roster first.`, 400);
      }
      const link: TmLink = { tm360Id: `tm-${target.id.replace(/[^a-z0-9]/gi, '')}`, role, devices: [], state: 'offline', score: 0 };
      links.set(target.id, link);
      return { created: true, alreadyExisted: false, tm360UserId: link.tm360Id, role, managerEmail: '' };
    },
  ],
  [
    'POST',
    /^\/tm360\/devices\/claim$/,
    (_p, body) => {
      const vis = visibility();
      if (!vis) return denied();
      if (!vis.canPair) return pairOnly();
      const code = String(body?.code ?? '').trim().toUpperCase();
      const target = visibleEmail(vis, String(body?.employeeEmail ?? ''));
      if (!code) return fail('Enter the code shown on the machine.', 400);
      if (!target) return fail('That person is not in DASH.', 404);
      const link = links.get(target.id);
      if (!link) return fail(`${target.name} has no TM360 account yet. Link them first.`, 409);
      const i = waiting.findIndex((w) => w.code === code);
      if (i < 0 && !CODE.test(code)) return fail('TM360 did not recognise that code. Check it on the machine — it looks like XXXX-XXXX.', 404);
      const w = i >= 0 ? waiting.splice(i, 1)[0]! : null;
      const dev: Tm360Device = {
        id: w?.id ?? `dev-${code.toLowerCase()}`,
        hostname: w?.hostname ?? `NEW-PC-${code.slice(0, 4)}`,
        status: 'ACTIVE',
        lastSeenAt: minutesAgo(0),
        platform: w?.platform ?? 'Windows 11',
      };
      link.devices.unshift(dev);
      link.state = 'online';
      if (!link.score) link.score = 70;
      return { deviceId: dev.id, hostname: dev.hostname, employeeEmail: target.email };
    },
  ],
  [
    'POST',
    /^\/tm360\/devices\/unpair$/,
    (_p, body) => {
      const vis = visibility();
      if (!vis) return denied();
      if (!vis.canPair) return pairOnly();
      const id = String(body?.deviceId ?? '');
      for (const link of links.values()) {
        const dev = link.devices.find((d) => d.id === id);
        if (dev) {
          dev.status = 'REVOKED';
          return { ok: true, deviceId: id, status: 'REVOKED' };
        }
      }
      return fail('That device is not paired.', 404);
    },
  ],
];
