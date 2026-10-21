// Attendance, holidays, shifts, regularization and timesheets for the demo person. Shapes follow:
//   hr.js            GET /attendance/settings, /attendance/today, /attendance/mine, /attendance/team,
//                    POST clock-in / clock-out / ping (the server's own refusals and wording)
//   hr_time.js       GET /holidays, /shifts/mine, /shifts, regularizations (mine, POST, cancel)
//   hr_timesheet.js  GET /timesheet/today, /timesheet/week, /timesheet/mine, POST /timesheet, /timesheet/week
// The geofence is not enforced in the demo (a phone anywhere may clock in "at the office"), and no
// accuracy ceiling applies, so clocking in and out can always be tried.

import type {
  AttendanceSettings,
  AttendanceRow,
  MyShift,
  Regularization,
  Shift,
  TimesheetDay,
  TimesheetEntry,
  TimesheetWeek,
  TimesheetWeekDay,
  TodayFull,
  WeekStatus,
} from '@/api/attendance';
import type { Holiday } from '@/api/hr';
import { DEMO_USER } from '@/demo/config';
import { DEPARTMENTS, PEOPLE, profile, projectById } from '@/demo/fixtures/org';
import { clocksIn, currentPersona } from '@/demo/personas';
import { runningTasks, taskLinesOn } from '@/demo/fixtures/tasks';
import {
  addDays,
  eachDate,
  fail,
  hm,
  holidaysFor,
  istHm,
  istIso,
  mondayOf,
  nowIso,
  nowMinutesIst,
  rand,
  today,
  type Route,
} from '@/demo/state';
import {
  attendanceMinutes,
  buildRecord,
  LEAVE_SEEDS,
  LOCATIONS,
  myMonth,
  myRecord,
  pingStateOf,
  punch,
  REG_DAYS,
  teamRecord,
} from '@/demo/timeline';

const T0 = today();
const ME = { id: DEMO_USER.id, name: String(DEMO_USER.name) };

// ── Policy ───────────────────────────────────────────────────────────────────
export const SETTINGS: AttendanceSettings = {
  requireGeofence: true,
  allowRemote: true,
  maxAccuracyM: 100,
  shiftStart: '09:30',
  shiftEnd: '18:30',
  graceMinutes: 15,
  halfDayMinutes: 240,
  fullDayMinutes: 480,
  weeklyOff: [0, 6],
  regularizationWindowDays: 30,
};

export const MY_SHIFT: MyShift = { id: 'hs-general', name: 'General Shift', start_time: '09:30', end_time: '18:30', grace_minutes: 15, weekly_off: [0, 6] };

const SHIFTS: Shift[] = [
  { ...MY_SHIFT, half_day_minutes: 240, full_day_minutes: 480 },
  { id: 'hs-late-edit', name: 'Late Edit Shift', start_time: '12:00', end_time: '21:00', grace_minutes: 15, half_day_minutes: 240, full_day_minutes: 480, weekly_off: [0, 6] },
  { id: 'hs-shoot', name: 'Shoot Crew (Tue–Sat)', start_time: '07:00', end_time: '16:00', grace_minutes: 10, half_day_minutes: 240, full_day_minutes: 480, weekly_off: [0, 1] },
];

// ── Today ────────────────────────────────────────────────────────────────────
function todayView(): TodayFull & { ok: true } {
  const t = today();
  const wfhToday = LEAVE_SEEDS.some((l) => l.kind === 'wfh' && l.status === 'approved' && l.from <= t && l.to >= t);
  const rec = punch.record && punch.record.work_date === t ? punch.record : null;
  return {
    ok: true,
    ping: pingStateOf(rec),
    serverTime: nowIso(),
    today: t,
    rule: { mode: 'flexible', remoteOnly: false },
    settings: {
      requireGeofence: true,
      allowRemote: true,
      wfhToday,
      maxAccuracyM: SETTINGS.maxAccuracyM,
      shiftStart: MY_SHIFT.start_time,
      shiftEnd: MY_SHIFT.end_time,
      graceMinutes: MY_SHIFT.grace_minutes,
      shiftName: MY_SHIFT.name,
    },
    locations: LOCATIONS,
    record: rec,
  };
}

type Fix = { lat: number; lng: number; accuracy: number };
function readFix(body: unknown): Fix | null {
  const b = (body || {}) as Record<string, unknown>;
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, accuracy: Math.max(0, Math.round(Number(b.accuracy) || 0)) };
}

function clockIn(body: unknown) {
  // hr.js punchGate (and the app never offers it to a system role).
  if (!clocksIn(currentPersona())) return fail('This account cannot clock in.', 403);
  const t = today();
  if (punch.record && punch.record.work_date === t) return fail('You have already clocked in today.', 409);
  const fix = readFix(body);
  if (!fix) return fail('We could not read your location. Allow location access and try again.');
  const remote = (body as { mode?: string })?.mode === 'remote';
  const inMin = nowMinutesIst();
  const rec = buildRecord({
    id: `ha-demo-${t}`,
    who: ME,
    departmentId: String(profile.departmentId || ''),
    date: t,
    inMin,
    outMin: null,
    mode: remote ? 'remote' : 'office',
    // Remote: the phone's own position (the server fills the street address later).
    at: remote ? { lat: fix.lat, lng: fix.lng, address: '' } : undefined,
  });
  rec.in_at = nowIso();
  if (remote) {
    rec.in_lat = fix.lat;
    rec.in_lng = fix.lng;
  }
  punch.record = rec;
  return { ok: true, record: rec };
}

function clockOut(body: unknown) {
  const rec = punch.record;
  if (!rec || rec.out_at) return fail('You have not clocked in, or you already clocked out.', 409);
  const fix = readFix(body);
  if (!fix) return fail('We could not read your location. Allow location access and try again.');
  const worked = Math.max(1, Math.floor((Date.now() - Date.parse(rec.in_at)) / 60000));
  const outMode = rec.in_mode === 'remote' || (body as { mode?: string })?.mode === 'remote' ? 'remote' : 'office';
  const status = worked >= SETTINGS.fullDayMinutes ? 'present' : worked >= SETTINGS.halfDayMinutes ? 'half_day' : 'short';
  Object.assign(rec, {
    out_at: nowIso(),
    out_mode: outMode,
    out_within_fence: outMode === 'office',
    out_distance_m: outMode === 'office' ? 21 : rec.in_distance_m,
    out_address: rec.in_address || '',
    out_lat: fix.lat,
    out_lng: fix.lng,
    worked_minutes: worked,
    status,
    state: status,
    early_out: nowMinutesIst() < 18 * 60 + 30,
  } satisfies Partial<AttendanceRow>);
  return { ok: true, record: rec };
}

function ping(body: unknown) {
  const rec = punch.record;
  if (!rec || rec.out_at) return fail('You are not clocked in.', 409);
  if (rec.in_mode !== 'remote') return fail('Hourly location is only recorded for remote clock-in.', 409);
  const fix = readFix(body);
  if (!fix) return fail('We could not read your location. Allow location access and try again.');
  const elapsedMin = (Date.now() - Date.parse(rec.in_at)) / 60000;
  if (elapsedMin > 9 * 60 + 5) return fail('The 9-hour remote check-in window has ended.', 409);
  const slot = Math.min(9, Math.floor((elapsedMin + 5) / 60));
  if (slot < 1) return fail('Too early for the next hourly check-in.', 429);
  rec.pings = rec.pings ?? [];
  if (rec.pings.some((p) => p.slot === slot)) return { ok: true, duplicate: true };
  const p = { slot, at: nowIso(), lat: fix.lat, lng: fix.lng, accuracy_m: fix.accuracy };
  rec.pings.push(p);
  return { ok: true, ping: p };
}

// ── Team: the departments the persona runs, or the whole company for an HR admin ──
function teamOn(date: string): AttendanceRow[] {
  const all = currentPersona().hr.isHrAdmin;
  const depts = DEPARTMENTS.filter((d) => d.adminId === DEMO_USER.id).map((d) => d.id);
  const inTeam = (deptId: unknown) => all || depts.includes(String(deptId ?? ''));
  const mine = inTeam(profile.departmentId) ? myRecord(date) : null;
  // System logins (User Management, `source: 'system'`, no department) don't clock in: never "in".
  const rows = PEOPLE.filter((p) => (p as { source?: unknown }).source !== 'system' && inTeam(p.departmentId))
    .map((p) => teamRecord(p, date))
    .filter((r): r is AttendanceRow => !!r);
  return (mine ? [mine, ...rows] : rows).sort((a, b) => a.in_at.localeCompare(b.in_at));
}

// ── Regularization ───────────────────────────────────────────────────────────
type Reg = Regularization & { employee_id: string; employee_name: string; department_id: string | null; previous: Record<string, unknown> | null };
const reg = (r: Pick<Reg, 'id' | 'work_date' | 'in_time' | 'out_time' | 'reason' | 'status' | 'created_at'> & Partial<Reg>): Reg => ({
  employee_id: ME.id,
  employee_name: ME.name,
  department_id: profile.departmentId ? String(profile.departmentId) : 'dept-creative',
  decided_by_name: null,
  decided_at: null,
  decision_note: '',
  previous: null,
  ...r,
});

const REGS: Reg[] = [
  reg({
    id: 'hrg-demo-01',
    work_date: REG_DAYS.pending,
    in_time: '09:25',
    out_time: null,
    reason: 'Reached at 9:25 for the client colour review, but the app kept timing out on GPS in the basement studio — my clock-in registered only at 10:07.',
    status: 'pending',
    created_at: istIso(REG_DAYS.pending, '19:41'),
  }),
  reg({
    id: 'hrg-demo-02',
    work_date: REG_DAYS.rejected,
    in_time: null,
    out_time: '19:00',
    reason: 'Worked on the Kathalu teaser in Edit Suite 2 until 7 pm; clocked out early by mistake.',
    status: 'rejected',
    created_at: istIso(addDays(REG_DAYS.rejected, 1), '10:05'),
    decided_by_name: 'Priya Sharma',
    decided_at: istIso(addDays(REG_DAYS.rejected, 1), '15:30'),
    decision_note: 'The edit-suite log shows you left at 5:15 pm. Please apply for a half day instead.',
  }),
  reg({
    id: 'hrg-demo-03',
    work_date: REG_DAYS.cancelled,
    in_time: '09:15',
    out_time: null,
    reason: 'Clock-in did not register at the gate.',
    status: 'cancelled',
    created_at: istIso(REG_DAYS.cancelled, '12:10'),
    decided_at: istIso(REG_DAYS.cancelled, '12:40'),
  }),
  reg({
    id: 'hrg-demo-04',
    work_date: REG_DAYS.approved,
    in_time: null,
    out_time: '20:10',
    reason: 'Stayed back for the Nimbus master export and forgot to clock out before leaving.',
    status: 'approved',
    created_at: istIso(addDays(REG_DAYS.approved, 1), '09:50'),
    decided_by_name: 'Priya Sharma',
    decided_at: istIso(addDays(REG_DAYS.approved, 1), '11:15'),
    decision_note: 'Matches the export log.',
    previous: { in_at: istIso(REG_DAYS.approved, '09:41'), out_at: null, worked_minutes: null, status: null },
  }),
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

function createReg(body: unknown) {
  const b = (body || {}) as Record<string, unknown>;
  const date = String(b.work_date || '');
  const t = today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Pick a valid date.');
  if (date > t) return fail('You cannot regularize a future date.');
  if (date < addDays(t, -SETTINGS.regularizationWindowDays)) return fail(`Requests are allowed only for the last ${SETTINGS.regularizationWindowDays} days.`);
  const inT = b.in_time ? String(b.in_time) : null;
  const outT = b.out_time ? String(b.out_time) : null;
  for (const x of [inT, outT]) if (x !== null && !HHMM.test(x)) return fail('Times must be HH:MM (24-hour).');
  if (!inT && !outT) return fail('Give the clock-in time, the clock-out time, or both.');
  if (inT && outT && toMin(outT) <= toMin(inT)) return fail('Clock-out must be after clock-in.');
  const reason = String(b.reason || '').trim().slice(0, 500);
  if (reason.length < 5) return fail('Give a reason (at least 5 characters).');
  const cur = myRecord(date);
  if (!cur && !inT) return fail('There is no clock-in on that day, so the clock-in time is required.');
  if (cur && !inT && outT && toMin(outT) <= toMin(istHm(cur.in_at))) return fail(`Clock-out must be after your recorded clock-in (${istHm(cur.in_at)}).`);
  if (cur && inT && !outT && cur.out_at && toMin(inT) >= toMin(istHm(cur.out_at))) return fail('Clock-in must be before your recorded clock-out.');
  if (date === t && [inT, outT].some((x) => x && toMin(x) > nowMinutesIst())) return fail('A time later than now cannot be requested.');
  if (REGS.some((r) => r.work_date === date && r.status === 'pending')) return fail('You already have a pending request for that day. Cancel it first to change it.', 409);
  const r = reg({ id: `hrg${Date.now()}`, work_date: date, in_time: inT, out_time: outT, reason, status: 'pending', created_at: nowIso() });
  REGS.unshift(r);
  return { ok: true, request: r };
}

// ── Timesheets ───────────────────────────────────────────────────────────────
type Sheet = { id: string; workDate: string; submittedAt: string; logged: number; filled: number; buffer: number; entries: TimesheetEntry[] };
const SHEETS = new Map<string, Sheet>();

const PLAN: [projectId: string, comments: string[]][] = [
  ['p-sjw-diwali', ['Rough cut — selects pass on the Diwali film', 'Tightened the 60s hero cut after Priya’s notes', 'Synced VO take 3 and laid the temp music']],
  ['p-nimbus', ['Explainer #4 — assembly from the storyboard', 'Exports and upload for the client review', 'Fixed caption timing on explainer #3']],
  ['p-aarogya', ['Social cutdowns — 9:16 versions', 'Colour review with Rahul on the hospital walkthrough']],
  ['p-kathalu', ['Teaser edit — market chase sequence', 'Subtitle pass on the Episode 1 teaser']],
  ['p-reel', ['Showreel 2026 — pulled the best shots from Q3 projects']],
  ['p-admin', ['Team stand-up and planning', 'Reviewed Kavya’s and Nikhil’s cuts', 'Media backup to the NAS']],
];

function entry(projectId: string, from: number, to: number, comment: string, task?: { id: string; title: string }): TimesheetEntry {
  const p = projectById(projectId)!;
  return {
    source: task ? 'task' : 'manual',
    taskId: task?.id ?? null,
    taskTitle: task?.title ?? null,
    projectId: p.id,
    kekaCode: p.kekaCode,
    projectName: p.name,
    startTime: hm(from),
    endTime: hm(to),
    minutes: to - from,
    comment,
  };
}

// A day as it was written down: work blocks from clock-in, a lunch break, and a little left over.
function plannedEntries(rec: AttendanceRow): TimesheetEntry[] {
  const d = rec.work_date;
  const inMin = toMin(istHm(rec.in_at));
  const outMin = inMin + (rec.worked_minutes ?? 0);
  // Client work fills the day; internal admin only ever closes it.
  const pick = (i: number) => PLAN[Math.floor(rand(`${d}plan${i}`) * (PLAN.length - 1))]!;
  const say = (p: [string, string[]], i: number) => p[1][Math.floor(rand(`${d}say${i}`) * p[1].length)]!;
  const main = pick(0);
  const blocks: [number, number, [string, string[]]][] = [];
  let t = inMin + 5;
  const durations = [130 + Math.floor(rand(`${d}b0`) * 40), 95 + Math.floor(rand(`${d}b1`) * 30)];
  blocks.push([t, (t += durations[0]!), main]);
  blocks.push([t, (t += durations[1]!), pick(1)]);
  t += 45; // lunch
  const b3 = Math.min(outMin - 20, t + 120 + Math.floor(rand(`${d}b2`) * 30));
  if (b3 - t >= 30) blocks.push([t, (t = b3), main]);
  if (outMin - 15 - t >= 30) blocks.push([t, outMin - 15, PLAN[5]!]);
  return blocks.map(([a, b, p], i) => entry(p[0], a, b, say(p, i)));
}

// The most recent finished day before today is left for the demo person to write up (shows as
// "To fill in"); every other worked day of the last two weeks was submitted at clock-out.
const OPEN_DAY = (() => {
  for (let d = addDays(T0, -1); d >= addDays(T0, -10); d = addDays(d, -1)) if (myRecord(d)?.out_at) return d;
  return '';
})();

// What its task timers recorded that day (the sheet offers these as rows).
function openDayPrefill(): TimesheetEntry[] {
  const rec = OPEN_DAY ? myRecord(OPEN_DAY) : null;
  if (!rec) return [];
  const inMin = toMin(istHm(rec.in_at));
  const task = { id: 'tk1760600000101', title: 'Rough cut — Sunrise Jewellers Diwali film (60s + 30s)' };
  return [entry('p-sjw-diwali', inMin + 10, inMin + 150, '', task), entry('p-sjw-diwali', inMin + 230, inMin + 365, '', task)];
}

for (let d = addDays(mondayOf(T0), -14); d < T0; d = addDays(d, 1)) {
  const rec = myRecord(d);
  if (!rec?.out_at || d === OPEN_DAY) continue;
  const entries = plannedEntries(rec);
  const filled = entries.reduce((n, e) => n + (e.minutes ?? 0), 0);
  const logged = rec.worked_minutes ?? 0;
  SHEETS.set(d, { id: `hts-demo-${d}`, workDate: d, submittedAt: rec.out_at, logged, filled, buffer: Math.max(0, logged - filled), entries });
}

const cadence = () => (profile.timesheetCadence === 'weekly' ? 'weekly' : 'daily');

function prefillOn(date: string) {
  return [...taskLinesOn(date), ...(date === OPEN_DAY ? openDayPrefill() : [])];
}

function dayView(date: string): TimesheetDay & { ok: true } {
  const rec = myRecord(date);
  const sheet = SHEETS.get(date);
  const prefill = prefillOn(date);
  const entries = sheet
    ? sheet.entries.concat(prefill.filter((p) => !sheet.entries.some((e) => (p.taskId && e.taskId === p.taskId) || e.startTime === p.startTime)))
    : prefill;
  return {
    ok: true,
    cadence: cadence(),
    lastWeek: cadence() === 'weekly' ? weekStatus(addDays(mondayOf(today()), -7)) : null,
    workDate: date,
    runningTasks: runningTasks(),
    clockedIn: !!rec && !rec.out_at,
    inAt: rec ? rec.in_at : null,
    inTime: rec ? istHm(rec.in_at) : null,
    loggedMinutes: attendanceMinutes(rec),
    submitted: !!sheet,
    submittedAt: sheet ? sheet.submittedAt : null,
    bufferMinutes: sheet ? sheet.buffer : 0,
    entries,
  };
}

function weekStatus(weekStart: string): WeekStatus {
  const weekEnd = addDays(weekStart, 6);
  const worked = eachDate(weekStart, weekEnd).filter((d) => d <= today() && !!myRecord(d));
  const missing = worked.filter((d) => !SHEETS.has(d));
  return { weekStart, weekEnd, worked, missing, complete: missing.length === 0 };
}

function weekView(start: string): TimesheetWeek & { ok: true } {
  const weekStart = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(start) ? start : today());
  const days: TimesheetWeekDay[] = eachDate(weekStart, addDays(weekStart, 6)).map((date) => {
    const rec = myRecord(date);
    const s = SHEETS.get(date);
    return {
      date,
      attendanceMinutes: attendanceMinutes(rec),
      worked: !!rec,
      finished: !!rec && !!rec.out_at,
      submitted: !!s,
      filledMinutes: s ? s.filled : 0,
      bufferMinutes: s ? s.buffer : 0,
      entries: s ? s.entries : [],
    };
  });
  return { ok: true, weekStart, weekEnd: addDays(weekStart, 6), today: today(), cadence: cadence(), days };
}

// hr_timesheet.js readEntry(): every line checked, worded as the server words it.
function readEntry(raw: unknown, i: number): TimesheetEntry | { error: string } {
  const where = `Row ${i + 1}: `;
  if (!raw || typeof raw !== 'object') return { error: `${where}is not an entry.` };
  const r = raw as Record<string, unknown>;
  const startTime = String(r.startTime || '').trim();
  const endTime = String(r.endTime || '').trim();
  if (!HHMM.test(startTime)) return { error: `${where}start time must be HH:MM.` };
  if (!HHMM.test(endTime)) return { error: `${where}end time must be HH:MM.` };
  const minutes = toMin(endTime) - toMin(startTime);
  if (minutes <= 0) return { error: `${where}end time must be after the start time.` };
  const comment = String(r.comment ?? '').trim();
  if (comment.length < 3) return { error: `${where}a comment is required — say what you worked on.` };
  if (comment.length > 500) return { error: `${where}comment is too long (500 characters max).` };
  const kekaCode = String(r.kekaCode || '').trim().slice(0, 60);
  const projectName = String(r.projectName || '').trim().slice(0, 160);
  if (!kekaCode && !projectName) return { error: `${where}pick a Keka Code or project.` };
  return {
    source: r.source === 'task' ? 'task' : 'manual',
    taskId: r.taskId ? String(r.taskId) : null,
    taskTitle: r.taskTitle ? String(r.taskTitle) : null,
    projectId: r.projectId ? String(r.projectId) : null,
    kekaCode,
    projectName,
    startTime,
    endTime,
    minutes,
    comment,
  };
}

function saveDay(body: unknown) {
  const b = (body || {}) as Record<string, unknown>;
  const workDate = typeof b.workDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.workDate) ? b.workDate : today();
  if (workDate > today()) return fail('That day has not happened yet.');
  if (!Array.isArray(b.entries)) return fail('entries must be a list.');
  if (b.entries.length > 50) return fail('That is more entries than a day can hold (50 max).');
  const rows: TimesheetEntry[] = [];
  for (let i = 0; i < b.entries.length; i++) {
    const r = readEntry(b.entries[i], i);
    if ('error' in r) return fail(r.error);
    rows.push(r);
  }
  const logged = attendanceMinutes(myRecord(workDate));
  const filled = rows.reduce((n, r) => n + (r.minutes ?? 0), 0);
  const buffer = Math.max(0, logged - filled);
  const id = SHEETS.get(workDate)?.id ?? `hts${Date.now()}`;
  SHEETS.set(workDate, { id, workDate, submittedAt: nowIso(), logged, filled, buffer, entries: rows.sort((a, c) => a.startTime.localeCompare(c.startTime)) });
  return { ok: true, id, workDate, loggedMinutes: logged, filledMinutes: filled, bufferMinutes: buffer, entries: rows.length };
}

function closeWeek(body: unknown) {
  const asked = String((body as { weekStart?: string })?.weekStart || '');
  const weekStart = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today());
  const closed: string[] = [];
  let buffer = 0;
  for (const date of eachDate(weekStart, addDays(weekStart, 6))) {
    if (date > today() || SHEETS.has(date)) continue;
    const rec = myRecord(date);
    if (!rec?.out_at) continue;
    const mins = rec.worked_minutes ?? 0;
    SHEETS.set(date, { id: `hts${Date.now()}${closed.length}`, workDate: date, submittedAt: nowIso(), logged: mins, filled: 0, buffer: mins, entries: [] });
    closed.push(date);
    buffer += mins;
  }
  return { ok: true, closed: closed.length, bufferMinutes: buffer, weekStart, days: closed };
}

function mine(q: URLSearchParams) {
  const ymd = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const from = ymd(q.get('from'));
  const to = ymd(q.get('to'));
  const days = [...SHEETS.values()]
    .filter((s) => (!from || s.workDate >= from) && (!to || s.workDate <= to))
    .sort((a, b) => b.workDate.localeCompare(a.workDate))
    .map((s) => ({ id: s.id, workDate: s.workDate, loggedMinutes: s.logged, filledMinutes: s.filled, bufferMinutes: s.buffer, submittedAt: s.submittedAt, entries: s.entries }));
  const monday = mondayOf(today());
  return { ok: true, cadence: cadence(), weeks: cadence() === 'weekly' ? [weekStatus(monday), weekStatus(addDays(monday, -7))] : [], days };
}

// ── Routes ───────────────────────────────────────────────────────────────────
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const attendanceRoutes: Route[] = [
  ['GET', /^\/hr\/attendance\/settings$/, () => ({ ok: true, settings: SETTINGS })],
  ['GET', /^\/hr\/attendance\/today$/, () => todayView()],
  [
    'GET',
    /^\/hr\/attendance\/mine$/,
    (_p, _b, q) => {
      const month = q.get('month') ?? today().slice(0, 7);
      if (!MONTH_RE.test(month)) return fail('month must be YYYY-MM.');
      return { ok: true, month, records: myMonth(month) };
    },
  ],
  [
    'GET',
    /^\/hr\/attendance\/team$/,
    (_p, _b, q) => {
      const date = q.get('date') ?? today();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('date must be YYYY-MM-DD.');
      return { ok: true, date, records: teamOn(date) };
    },
  ],
  ['POST', /^\/hr\/attendance\/clock-in$/, (_p, body) => clockIn(body)],
  ['POST', /^\/hr\/attendance\/clock-out$/, (_p, body) => clockOut(body)],
  ['POST', /^\/hr\/attendance\/ping$/, (_p, body) => ping(body)],
  ['GET', /^\/hr\/locations$/, () => ({ ok: true, locations: LOCATIONS })],

  [
    'GET',
    /^\/hr\/holidays$/,
    (_p, _b, q) => {
      const year = q.get('year') ?? today().slice(0, 4);
      if (!/^\d{4}$/.test(year)) return fail('year must be YYYY.');
      const holidays: Holiday[] = holidaysFor(year);
      return { ok: true, year, holidays };
    },
  ],
  ['GET', /^\/hr\/shifts\/mine$/, () => ({ ok: true, shift: MY_SHIFT })],
  ['GET', /^\/hr\/shifts$/, () => ({ ok: true, shifts: SHIFTS })],

  ['GET', /^\/hr\/regularizations\/mine$/, () => ({ ok: true, requests: REGS })],
  ['POST', /^\/hr\/regularizations$/, (_p, body) => createReg(body)],
  [
    'POST',
    /^\/hr\/regularizations\/([^/]+)\/cancel$/,
    ([, id]) => {
      const r = REGS.find((x) => x.id === id && x.status === 'pending');
      if (!r) return fail('No pending request of yours with that id.', 404);
      r.status = 'cancelled';
      r.decided_at = nowIso();
      return { ok: true, request: r };
    },
  ],

  ['GET', /^\/hr\/timesheet\/today$/, (_p, _b, q) => dayView(/^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date')! : today())],
  ['GET', /^\/hr\/timesheet\/week$/, (_p, _b, q) => weekView(q.get('start') || today())],
  ['GET', /^\/hr\/timesheet\/mine$/, (_p, _b, q) => mine(q)],
  ['POST', /^\/hr\/timesheet$/, (_p, body) => saveDay(body)],
  ['POST', /^\/hr\/timesheet\/week$/, (_p, body) => closeWeek(body)],
];
