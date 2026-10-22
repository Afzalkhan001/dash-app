// My Tasks, bookings and Start/Completion codes. Shapes follow the handlers:
//   routes/tasks.js     GET /tasks (getAll: every task in the company — the app keeps its own),
//                       POST /tasks (dedupe by ticketId/bookingId), PUT /tasks/:id (merge; a timer that
//                       stops records a segment for the clock-out timesheet), request-otp / verify-otp
//   routes/bookings.js  GET /bookings?since= (getAll), PUT, request/verify-otp, release/reclaim
//   routes/dashboard.js GET /my_pending_otps — live codes on work I raised/requested/created
//   routes/clients.js   GET /clients
// Every code in the demo is 123456 (see state.ts), and one code is always waiting on the demo
// person's Home screen (a teammate asked to start a task they created). Rows with `onlyFor` exist
// only for those personas (demo/personas.ts) — the IT tickets Afzal IT Admin works.

import type { RunningTask, TimesheetEntry } from '@/api/attendance';
import type { Booking, Client, PendingOtp, Task } from '@/api/tasks';
import { DEMO_USER } from '@/demo/config';
import { projectById } from '@/demo/fixtures/org';
import { runningTeamBoardTasks } from '@/demo/fixtures/teamboard';
import { currentPersona, type StaffPersonaId } from '@/demo/personas';
import {
  addDays,
  DEMO_CODE,
  daysAgo,
  fail,
  istHm,
  istIso,
  minutesAgo,
  notFound,
  nowIso,
  today,
  workingDayFrom,
  wrongCode,
  type Route,
} from '@/demo/state';

const ME = String(DEMO_USER.name);
const T0 = today();
const wd = (n: number) => workingDayFrom(T0, n);
const OTP_TTL = 10 * 60_000;

type Otp = { type: 'start' | 'submit'; code: string; generatedAt?: string; expiresAt: number };
type TaskRow = Task & { otp?: Otp | null; assigneeId?: string; onlyFor?: StaffPersonaId[] };
type BookingRow = Booking & { otp?: Otp | null };

const mine = (t: Partial<TaskRow>): TaskRow => ({
  id: '',
  assignee: ME,
  assigneeId: DEMO_USER.id,
  dept: 'Creative',
  timestamps: {},
  elapsedSeconds: 0,
  startedAt: null,
  ...t,
});

const yesterdayWd = wd(1);
// The Creative edit work belongs to the Creative personas; the professional's work is bookings.
const CREATIVE: StaffPersonaId[] = ['employee', 'manager'];

const TASKS: TaskRow[] = [
  mine({
    id: 'tk1760600000101',
    onlyFor: CREATIVE,
    title: 'Rough cut — Sunrise Jewellers Diwali film (60s + 30s)',
    project: 'p-sjw-diwali',
    kekaCode: 'TM_SJW_DIWALI26',
    status: 'in_progress',
    creator: 'Priya Sharma',
    createdBy: 'u-priya',
    managerId: 'u-priya',
    startDate: yesterdayWd,
    endDate: workingDayFrom(T0, -3),
    desc: 'Assemble the 60-second hero film and a 30-second cutdown from the selects in Projects/SJW_Diwali/Selects. Use VO take 3 and the temp track from the music folder; leave 2 seconds of handles on every shot for the colourist.',
    elapsedSeconds: 2 * 3600 + 10 * 60,
    firstStartedAt: istIso(yesterdayWd, '10:05'),
    lastEndedAt: istIso(yesterdayWd, '18:40'),
    createdAt: daysAgo(3, '09:40'),
  }),
  mine({
    id: 'tk1760600000102',
    onlyFor: CREATIVE,
    title: 'Colour-corrected social cutdowns — Aarogya Hospitals (9:16 and 1:1)',
    project: 'p-aarogya',
    kekaCode: 'TM_AAR_BRAND26',
    status: 'pending',
    creator: 'Vikram Singh',
    createdBy: 'u-vikram',
    managerId: 'u-vikram',
    startDate: T0,
    endDate: workingDayFrom(T0, -2),
    desc: 'Six 15-second cutdowns from the approved master for Instagram and LinkedIn. Burn in captions from the shared sheet and export H.264 at 1080×1920 and 1080×1080.',
    createdAt: daysAgo(1, '17:15'),
  }),
  mine({
    id: 'tk1760600000103',
    onlyFor: CREATIVE,
    title: 'Archive Q3 raw footage to the NAS and update the media log',
    project: 'p-admin',
    kekaCode: 'TM_INT_ADMIN',
    status: 'pending',
    creator: ME,
    createdBy: DEMO_USER.id,
    startDate: T0,
    desc: 'Move the July–September card dumps from the edit-suite SSDs to NAS-02/Archive/2026-Q3 and tick them off in the media log.',
    createdAt: daysAgo(2, '12:00'),
  }),
  mine({
    id: 'tk1760600000104',
    onlyFor: CREATIVE,
    title: 'Teaser edit — Kathalu S2, Episode 1',
    project: 'p-kathalu',
    kekaCode: 'TM_KTH_S2',
    status: 'submitted',
    creator: 'Deepa Menon',
    createdBy: 'u-deepa',
    managerId: 'u-deepa',
    startDate: wd(5),
    endDate: wd(2),
    desc: 'A 45-second teaser for the Episode 1 drop: open on the market chase, end on the title card.',
    elapsedSeconds: 5 * 3600 + 20 * 60,
    firstStartedAt: istIso(wd(4), '10:20'),
    lastEndedAt: istIso(wd(2), '17:05'),
    completedBy: ME,
    completedAt: istIso(wd(2), '17:05'),
    completionRemarks: 'Two versions in the review folder — v3 with the alternate music cue. Subtitles are in a separate track.',
    createdAt: daysAgo(8, '11:00'),
  }),
  mine({
    id: 'tk1760600000105',
    onlyFor: CREATIVE,
    title: 'Nimbus explainer #3 — final export and delivery',
    project: 'p-nimbus',
    kekaCode: 'TM_NIM_EXPL',
    status: 'completed',
    creator: 'Priya Sharma',
    createdBy: 'u-priya',
    startDate: wd(7),
    endDate: wd(6),
    desc: 'Final mix from Anita, master export (ProRes 422 HQ + H.264 review copy) and upload to the client’s Drive.',
    elapsedSeconds: 3 * 3600 + 45 * 60,
    firstStartedAt: istIso(wd(7), '11:10'),
    lastEndedAt: istIso(wd(6), '16:30'),
    completedBy: ME,
    completedAt: istIso(wd(6), '16:30'),
    completionRemarks: 'Delivered — client confirmed receipt of all three files.',
    createdAt: daysAgo(12, '10:00'),
  }),
  mine({
    id: 'tk1760600000106',
    onlyFor: CREATIVE,
    title: 'Review notes — Aarogya hospital walkthrough edit',
    project: 'p-aarogya',
    kekaCode: 'TM_AAR_BRAND26',
    status: 'completed',
    creator: 'Vikram Singh',
    startDate: wd(13),
    elapsedSeconds: 1 * 3600 + 25 * 60,
    completedBy: ME,
    completedAt: istIso(wd(13), '15:45'),
    completionRemarks: 'Notes shared in the review doc; flagged two shots for reshoot.',
    createdAt: daysAgo(20, '09:30'),
  }),
  // Booking work: Meera booked the demo person as an editor; done and waiting for her review.
  mine({
    id: 'atk_bk_bk-demo-promo',
    onlyFor: ['professional'],
    title: 'Assigned: Meera Nair — TM_AAR_BRAND26 (10:00–13:00)',
    project: 'TM_AAR_BRAND26',
    kekaCode: 'TM_AAR_BRAND26',
    status: 'submitted',
    source: 'booking',
    bookingId: 'bk-demo-promo',
    bookingDate: wd(4),
    startTime: '10:00',
    endTime: '13:00',
    requestedBy: 'Meera Nair',
    comments: 'Quick promo cut for the hospital’s Doctors’ Day post.',
    elapsedSeconds: 2 * 3600 + 40 * 60,
    completedBy: ME,
    completedAt: istIso(wd(4), '12:55'),
    createdAt: daysAgo(6, '18:00'),
  }),
  // IT tickets assigned to Afzal IT Admin (the tickets themselves are in support.ts). IT starts and
  // ends its own tickets without a code, as on the web.
  mine({
    id: 'tk1760700000901',
    title: 'Wi-Fi keeps dropping in Edit Suite 2',
    status: 'pending',
    source: 'ticket',
    ticketId: 'tk1760700000011',
    category: 'ticket',
    creator: 'Sneha Iyer',
    requesterName: 'Sneha Iyer',
    dept: 'IT & Admin',
    startDate: T0,
    desc: 'The access point near Edit Suite 2 drops every few minutes, so uploads to the client Drive keep failing. Raised by Sneha Iyer.',
    createdAt: minutesAgo(70),
    onlyFor: ['it_admin'],
  }),
  mine({
    id: 'tk1760700000902',
    title: 'Set up a laptop for the Ramoji shoot (DaVinci + LUTs)',
    status: 'in_progress',
    source: 'ticket',
    ticketId: 'tk1760700000012',
    category: 'ticket',
    creator: 'Farhan Ali',
    requesterName: 'Farhan Ali',
    dept: 'IT & Admin',
    startDate: wd(1),
    desc: 'Field laptop for on-set DIT: DaVinci Resolve, the show LUTs and a 2 TB SSD formatted exFAT. Pick-up on Thursday morning.',
    elapsedSeconds: 50 * 60,
    firstStartedAt: istIso(wd(1), '15:10'),
    lastEndedAt: istIso(wd(1), '16:00'),
    createdAt: daysAgo(1, '11:20'),
    onlyFor: ['it_admin'],
  }),
  // Afzal Admin's own Production work.
  mine({
    id: 'tk1760700000903',
    title: 'Call sheet and crew list — Kisan Agro launch shoot',
    project: 'p-kisan',
    kekaCode: 'TM_KAG_LAUNCH',
    status: 'pending',
    creator: 'Arvind Menon',
    createdBy: 'u-arvind',
    dept: 'Production',
    startDate: T0,
    endDate: workingDayFrom(T0, -1),
    desc: 'Lock the two-day Ramoji call sheet, confirm the crew list with Deepa and share it on the Production group.',
    createdAt: daysAgo(1, '18:10'),
    onlyFor: ['admin'],
  }),
  // Not the demo person's: listed by /tasks like every task in the company, kept out by the app.
  {
    id: 'tk1760600000201',
    onlyFor: CREATIVE,
    title: 'Sync interview audio — Nimbus explainer #4',
    assignee: 'Kavya Reddy',
    assigneeId: 'u-kavya',
    project: 'p-nimbus',
    kekaCode: 'TM_NIM_EXPL',
    status: 'pending',
    dept: 'Creative',
    creator: ME,
    createdBy: DEMO_USER.id,
    startDate: T0,
    desc: 'Sync the lav and boom tracks for the founder interview and hand the timeline to Anita.',
    createdAt: daysAgo(1, '16:30'),
    elapsedSeconds: 0,
    startedAt: null,
    otp: null,
  },
  {
    id: 'tk1760600000202',
    title: 'Motion graphics package — Kathalu S2 lower thirds',
    assignee: 'Sneha Iyer',
    assigneeId: 'u-sneha',
    project: 'p-kathalu',
    kekaCode: 'TM_KTH_S2',
    status: 'in_progress',
    dept: 'Creative',
    creator: 'Priya Sharma',
    startDate: wd(2),
    createdAt: daysAgo(5, '10:00'),
    elapsedSeconds: 4 * 3600,
    startedAt: null,
  },
];

const BOOKINGS: BookingRow[] = [
  {
    id: 'bk-demo-dit',
    type: 'professionals',
    status: 'approved',
    resource: ME,
    resourceId: DEMO_USER.id,
    requestedBy: 'Deepa Menon',
    requestedById: 'u-deepa',
    date: T0,
    dates: [T0],
    startTime: '14:00',
    endTime: '18:00',
    project: 'Kisan Agro — Product Launch Film',
    kekaCode: 'TM_KAG_LAUNCH',
    comments: 'On-set DIT and quick assembly edits while the launch film is being shot.',
    shootingLocation: 'Gachibowli Studio, Floor 2',
    profDept: 'Creative',
    createdAt: daysAgo(2, '15:10'),
  },
  {
    id: 'bk-demo-promo',
    type: 'professionals',
    status: 'pending_review',
    resource: ME,
    resourceId: DEMO_USER.id,
    requestedBy: 'Meera Nair',
    requestedById: 'u-meera',
    date: wd(4),
    dates: [wd(4)],
    startTime: '10:00',
    endTime: '13:00',
    project: 'Aarogya Hospitals — Brand Campaign',
    kekaCode: 'TM_AAR_BRAND26',
    comments: 'Quick promo cut for the hospital’s Doctors’ Day post.',
    profDept: 'Creative',
    markedDoneBy: ME,
    markedDoneAt: istIso(wd(4), '12:56'),
    createdAt: daysAgo(6, '17:40'),
  },
  {
    id: 'bk-demo-room',
    type: 'rooms',
    status: 'approved',
    resource: 'Edit Suite 3',
    requestedBy: 'Rahul Verma',
    date: addDays(T0, 1),
    dates: [addDays(T0, 1)],
    startTime: '11:00',
    endTime: '13:00',
    // The room bookings list (IT desk) reads the slots and purpose, like every other room booking; without
    // them this one showed no time at all. Same slots as its room_slot_bookings row (booking.ts).
    startSlot: 22,
    endSlot: 26,
    purpose: 'business_meeting',
    purposeLabel: 'Business Meeting',
    project: 'Sunrise Jewellers — Diwali Brand Film',
    createdAt: daysAgo(1, '10:00'),
  } as BookingRow,
];

const CLIENTS: Client[] = [
  { id: 'cl-sjw', name: 'Sunrise Jewellers', phone: '+919000177001', email: 'marketing@sunrisejewellers.example' },
  { id: 'cl-aarogya', name: 'Aarogya Hospitals', phone: '+919000177002', email: 'brand@aarogya.example' },
  { id: 'cl-nimbus', name: 'Nimbus Fintech', phone: '+919000177003', email: 'growth@nimbusfintech.example' },
  { id: 'cl-kisan', name: 'Kisan Agro', phone: '+919000177004', email: 'comms@kisanagro.example' },
];

// ── Timer segments (team_roster_task_segments) — written when a running timer stops ──
type Segment = { taskId: string; startedAt: string; endedAt: string; seconds: number; workDate: string };
const SEGMENTS: Segment[] = [];

const forPersona = (t: TaskRow) => !t.onlyFor || t.onlyFor.includes(currentPersona().id);
const isMine = (t: TaskRow) => forPersona(t) && (t.assigneeId === DEMO_USER.id || t.assignee === ME);

// hr_timesheet.js lineFor(): one timesheet line from a stretch of a task's timer.
function lineFor(t: TaskRow, startedAt: string, endedAt: string, seconds: number): TimesheetEntry {
  const proj = projectById(t.project) ?? projectById(String(t.project || '').trim());
  return {
    source: 'task',
    taskId: t.id,
    taskSource: 'tasks',
    taskTitle: t.title || '',
    projectId: proj ? proj.id : null,
    kekaCode: t.kekaCode || proj?.kekaCode || '',
    projectName: proj ? proj.name : String(t.project || ''),
    startTime: istHm(startedAt),
    endTime: istHm(endedAt),
    minutes: Math.max(1, Math.round(seconds / 60)),
    comment: '',
  };
}

// The clock-out sheet's prefill for a day: recorded stretches, plus a timer still running now.
export function taskLinesOn(date: string): TimesheetEntry[] {
  const out: TimesheetEntry[] = [];
  for (const s of SEGMENTS) {
    const t = TASKS.find((x) => x.id === s.taskId);
    if (t && s.workDate === date && s.seconds >= 60) out.push(lineFor(t, s.startedAt, s.endedAt, s.seconds));
  }
  if (date === today()) {
    for (const t of TASKS) {
      if (!isMine(t) || !t.startedAt) continue;
      const secs = Math.floor((Date.now() - Date.parse(String(t.startedAt))) / 1000);
      if (secs >= 60) out.push(lineFor(t, String(t.startedAt), nowIso(), secs));
    }
  }
  return out.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** The demo person's running timers: their own tasks, then their Team board tasks (integrator pass 2). */
export function runningTasks(): RunningTask[] {
  return [...ownRunningTasks(), ...runningTeamBoardTasks()];
}

function ownRunningTasks(): RunningTask[] {
  return TASKS.filter((t) => isMine(t) && !!t.startedAt).map((t) => ({
    id: t.id,
    taskSource: 'tasks',
    title: t.title || 'Untitled task',
    elapsedSeconds: Number(t.elapsedSeconds) || 0,
    startedAt: String(t.startedAt),
    startedTime: istHm(String(t.startedAt)),
    runningMinutes: Math.max(0, Math.floor((Date.now() - Date.parse(String(t.startedAt))) / 60000)),
  }));
}

// routes/tasks.js recordLegacyTaskSegment: a running timer that is paused or finished leaves a segment.
function recordSegment(t: TaskRow, changes: Record<string, unknown>) {
  if (!t.startedAt) return;
  const stopped = changes.startedAt === null || changes.startedAt === '';
  const finished = ['completed', 'submitted', 'approved', 'rejected'].includes(String(changes.status || ''));
  if (!stopped && !finished) return;
  const startMs = Date.parse(String(t.startedAt));
  const endParsed = Date.parse(String(changes.lastEndedAt || ''));
  const endMs = Number.isFinite(endParsed) && endParsed >= startMs ? endParsed : Date.now();
  const seconds = Math.floor((endMs - startMs) / 1000);
  if (!Number.isFinite(startMs) || seconds <= 0) return;
  SEGMENTS.push({ taskId: t.id, startedAt: new Date(startMs).toISOString(), endedAt: new Date(endMs).toISOString(), seconds, workDate: new Date(startMs + 330 * 60000).toISOString().slice(0, 10) });
}

// ── OTP (generateOtpFor / verifyOtpFor) ──────────────────────────────────────
const live = (o?: Otp | null) => !!o && Number(o.expiresAt) > Date.now();
const mint = (type: 'start' | 'submit', code = DEMO_CODE): Otp => ({ type, code, generatedAt: nowIso(), expiresAt: Date.now() + OTP_TTL });

function verify(rec: TaskRow | BookingRow | undefined, what: string, type: unknown, otp: unknown) {
  if (!rec) return fail(`${what} not found`, 400);
  if (!rec.otp) return fail('No code requested — tap Resend and ask them for a fresh one.', 400);
  if (rec.otp.type !== type) return fail('Code type mismatch — request a new one.', 400);
  if (!live(rec.otp)) {
    rec.otp = null;
    return fail('Code expired — request a new one.', 400);
  }
  const code = String(otp ?? '').trim();
  if (code !== rec.otp.code && code !== DEMO_CODE) return wrongCode();
  rec.otp = null;
  return { ok: true, verified: true };
}

// Kavya is waiting to start the task the demo person created: a fresh code whenever the last lapsed.
function pendingOtps(): PendingOtp[] {
  const kavya = TASKS.find((t) => t.id === 'tk1760600000201');
  if (kavya && kavya.status === 'pending' && !live(kavya.otp)) kavya.otp = mint('start', '628417');
  const out: PendingOtp[] = [];
  for (const t of TASKS) {
    if (!forPersona(t)) continue;
    const by = t.requesterName || t.requestedBy || t.creator;
    if (by === ME && t.otp && live(t.otp)) out.push({ key: `t_${t.id}`, otp: t.otp, assignee: t.assignee || '—', title: t.title || 'Task' });
  }
  for (const b of BOOKINGS) {
    if (b.requestedBy === ME && b.otp && live(b.otp)) {
      out.push({ key: `b_${b.id}`, otp: b.otp, assignee: b.resource || '—', title: `${b.kekaCode || b.project || 'Booking'}${b.date ? ` · ${b.date}` : ''}` });
    }
  }
  return out;
}

const stripOtp = <T extends { otp?: Otp | null }>({ otp: _otp, ...rest }: T) => rest;
const listRow = ({ onlyFor: _only, ...t }: TaskRow) => stripOtp(t);

export const taskRoutes: Route[] = [
  ['GET', /^\/tasks$/, () => TASKS.filter(forPersona).map(listRow)],
  [
    'POST',
    /^\/tasks$/,
    (_p, body) => {
      const b = { ...(body || {}) } as TaskRow;
      delete (b as Record<string, unknown>).performedById;
      if (b.ticketId) {
        const hit = TASKS.find((t) => t.ticketId === b.ticketId);
        if (hit) return { ok: true, task: stripOtp(hit), deduped: true };
      }
      if (b.bookingId) {
        const hit = TASKS.find((t) => t.bookingId === b.bookingId);
        if (hit) {
          Object.assign(hit, b, { id: hit.id });
          return { ok: true, task: stripOtp(hit), deduped: true };
        }
      }
      const task: TaskRow = { timestamps: {}, createdAt: nowIso(), ...b, id: b.id || `tk${Date.now()}` };
      TASKS.push(task);
      return { ok: true, task: stripOtp(task) };
    },
  ],
  [
    'PUT',
    /^\/tasks\/([^/]+)$/,
    ([, id], body) => {
      const t = TASKS.find((x) => x.id === id);
      if (!t) return notFound('This task no longer exists on the server — refresh My Tasks and try again.');
      const { actorId: _a, performedById: _p, ...changes } = (body || {}) as Record<string, unknown>;
      recordSegment(t, changes);
      Object.assign(t, changes);
      return { ok: true };
    },
  ],
  [
    'POST',
    /^\/tasks\/([^/]+)\/request-otp$/,
    ([, id], body) => {
      const t = TASKS.find((x) => x.id === id);
      if (body?.type !== 'start' && body?.type !== 'submit') return fail('type must be start or submit');
      if (!t) return notFound('Task not found');
      t.otp = mint(body.type);
      return { ok: true, requested: true };
    },
  ],
  ['POST', /^\/tasks\/([^/]+)\/verify-otp$/, ([, id], body) => verify(TASKS.find((x) => x.id === id), 'Task', body?.type, body?.otp)],

  [
    'GET',
    /^\/bookings$/,
    (_p, _b, q) => {
      const since = q.get('since') || '';
      // Only a professional is booked as a resource (Afzal Professional); rooms are anyone's.
      const pro = currentPersona().id === 'professional';
      return BOOKINGS.filter((b) => (pro || b.resourceId !== DEMO_USER.id) && (!/^\d{4}-\d{2}-\d{2}$/.test(since) || String(b.dates?.[0] ?? b.date ?? '') >= since)).map(stripOtp);
    },
  ],
  [
    'PUT',
    /^\/bookings\/([^/]+)$/,
    ([, id], body) => {
      const b = BOOKINGS.find((x) => x.id === id);
      if (!b) return notFound('Booking not found');
      const { performedById: _p, ...changes } = (body || {}) as Record<string, unknown>;
      Object.assign(b, changes);
      return { ok: true };
    },
  ],
  [
    'POST',
    /^\/bookings\/([^/]+)\/request-otp$/,
    ([, id], body) => {
      const b = BOOKINGS.find((x) => x.id === id);
      if (body?.type !== 'start' && body?.type !== 'submit') return fail('type must be start or submit');
      if (!b) return notFound('Booking not found');
      b.otp = mint(body.type);
      return { ok: true, requested: true };
    },
  ],
  ['POST', /^\/bookings\/([^/]+)\/verify-otp$/, ([, id], body) => verify(BOOKINGS.find((x) => x.id === id), 'Booking', body?.type, body?.otp)],
  ['POST', /^\/bookings\/([^/]+)\/release-remaining$/, () => ({ ok: true, released: 0 })],
  ['POST', /^\/bookings\/([^/]+)\/reclaim-remaining$/, () => ({ ok: true, reclaimed: 0 })],

  ['GET', /^\/clients$/, () => CLIENTS],
  ['GET', /^\/my_pending_otps$/, () => pendingOtps()],
];

// ── Exports for the domain fixtures (Wave 0, docs/port/EXTENSION-POINTS.md §10) ──
// The live stores the routes above read, and the writes the routes make, so a domain's own routes
// (team tasks, booking approvals, reports) change the same data My Tasks and Home show. Rows carry
// `onlyFor` (personas that see them) and may hold a live `otp`; the GET routes strip both.
export type DemoTask = TaskRow;
export type DemoBooking = BookingRow;
export const taskStore: TaskRow[] = TASKS;
export const bookingStore: BookingRow[] = BOOKINGS;
export const clientStore: Client[] = CLIENTS;

/** POST /tasks as routes/tasks.js does it (no dedupe: call it once per new task). Returns the stored row. */
export function createTask(row: Partial<TaskRow>): TaskRow {
  const task: TaskRow = { timestamps: {}, elapsedSeconds: 0, startedAt: null, createdAt: nowIso(), ...row, id: row.id || `tk${Date.now()}${Math.floor(Math.random() * 1000)}` } as TaskRow;
  TASKS.push(task);
  return task;
}

/** PUT /tasks/:id as routes/tasks.js does it (a merge; a stopped timer records its timesheet segment). Null when missing. */
export function patchTask(id: string, changes: Partial<TaskRow>): TaskRow | null {
  const t = TASKS.find((x) => x.id === id);
  if (!t) return null;
  recordSegment(t, changes as Record<string, unknown>);
  Object.assign(t, changes);
  return t;
}

/** Remove a task (DELETE /tasks/:id). True when it existed. */
export function removeTask(id: string): boolean {
  const i = TASKS.findIndex((x) => x.id === id);
  if (i < 0) return false;
  TASKS.splice(i, 1);
  return true;
}
