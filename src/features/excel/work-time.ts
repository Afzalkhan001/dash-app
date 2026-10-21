// Excel domain — the website's time sheets, computed on the phone from the same lists. Pure.
//   timesheetRows   TimesheetCard (dash.html:28597–28732): submitted timesheet lines win their day;
//                   other days come from my tasks (not a booking's own task) and professional
//                   bookings where I am the one booked. Room / location bookings are not work.
//   bookingRows     EmployeeBookingSummary (dash.html:29760–29800): booking-born tasks of one person.
//   kekaReport      KekaCodeReportModal (dash.html:22370–22500): one code's people, locations,
//                   IT tickets and admin requests for a date range.
// Clock times are India time (the website shows the browser's local time).

import { refNo } from '@/features/support/format';
import { hmMinutes, istMinutes, xDate, xHm, xHms, xHrs, xTime } from '@/features/excel/format';

type Any = Record<string, any>;
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export type ProjectLite = { id?: string; name?: string; kekaCode?: string };
export const projKeka = (r: Any, projects: readonly ProjectLite[]) =>
  s(r.kekaCode) || projects.find((p) => p.id === r.project)?.kekaCode || projects.find((p) => p.name === r.project)?.kekaCode || s(r.project) || '—';

const taskDate = (t: Any) => s(t.bookingDate || t.startDate || t.date);
const bookingDate = (b: Any) => s(b.date || (Array.isArray(b.dates) ? b.dates[0] : '') || '');
const inRangeOf = (from: string, to: string) => (d: string) => !!d && (!from || d >= from) && (!to || d <= to);

const fmtClock = (iso: unknown) => (iso ? xTime(iso) || '—' : '—');

export type Correction = { taskId?: string; status?: string; approvedHours?: number | string };

/** TimesheetCard's hours: an approved correction, else a sane timer, else the shown start → end. */
function workedHrsLoose(t: Any, corrections: readonly Correction[]) {
  const corr = corrections.find((c) => c.taskId === t.id && c.status === 'approved');
  if (corr) return Number(corr.approvedHours) || 0;
  const el = Number(t.elapsedSeconds) || 0;
  if (['submitted', 'completed'].includes(s(t.status)) && el >= 60 && el < 86400) return el / 3600;
  const sm = t.firstStartedAt || t.startedAt ? istMinutes(t.firstStartedAt || t.startedAt) : hmMinutes(t.startTime);
  let em: number | null;
  if (t.lastEndedAt || t.completedAt) em = istMinutes(t.lastEndedAt || t.completedAt);
  else if (t.startedAt && el) em = istMinutes(new Date(new Date(t.startedAt).getTime() + el * 1000).toISOString());
  else em = hmMinutes(t.endTime);
  return sm != null && em != null && em > sm ? (em - sm) / 60 : 0;
}

/** KekaCodeReport's stricter hours: only an approved correction or a 1 min – 24 h timer on finished work. */
function workedHrsStrict(t: Any, corrections: readonly Correction[]) {
  const corr = corrections.find((c) => c.taskId === t.id && c.status === 'approved');
  if (corr) return Number(corr.approvedHours) || 0;
  const el = Number(t.elapsedSeconds) || 0;
  if (!['submitted', 'completed'].includes(s(t.status)) || el < 60 || el >= 86400) return 0;
  return el / 3600;
}

const actualStart = (t: Any) => (t.firstStartedAt || t.startedAt ? fmtClock(t.firstStartedAt || t.startedAt) : t.startTime ? xHm(t.startTime) : '—');
function actualEnd(t: Any) {
  if (t.lastEndedAt || t.completedAt) return fmtClock(t.lastEndedAt || t.completedAt);
  if (t.startedAt && t.elapsedSeconds) return fmtClock(new Date(new Date(t.startedAt).getTime() + Number(t.elapsedSeconds) * 1000).toISOString());
  if (t.endTime) return xHm(t.endTime);
  return '—';
}
const timeToMin = (t: unknown) => hmMinutes(t);
const bookingHrs = (b: Any) => {
  const sm = timeToMin(b.startTime);
  const em = timeToMin(b.endTime);
  return sm != null && em != null && em > sm ? (em - sm) / 60 : 0;
};

export type SheetDay = { workDate: string; entries?: { taskId?: string; kekaCode?: string; projectName?: string; taskTitle?: string; comment?: string; startTime?: string; endTime?: string; minutes?: number }[] };

export type TimesheetRow = { id: string; date: string; type: string; project: string; title: string; by: string; start: string; end: string; hours: number; status: string };

export function timesheetRows(input: {
  person: { id: string; name: string };
  from: string;
  to: string;
  sheets: readonly SheetDay[];
  tasks: readonly Any[];
  bookings: readonly Any[];
  corrections: readonly Correction[];
  projects: readonly ProjectLite[];
}): { rows: TimesheetRow[]; totalHours: number } {
  const { person, from, to, sheets, tasks, bookings, corrections, projects } = input;
  const inRange = inRangeOf(from, to);
  const sheetDays = new Set(sheets.filter((x) => inRange(x.workDate)).map((x) => x.workDate));
  const myTasks = tasks.filter((t) => t.assignee === person.name && inRange(taskDate(t)) && !(t.source === 'booking' && t.bookingId) && !sheetDays.has(taskDate(t)));
  const myPro = bookings.filter(
    (b) => b.type === 'professionals' && (b.resourceId === person.id || b.resource === person.name) && !['rejected', 'cancelled'].includes(s(b.status)) && inRange(bookingDate(b)) && !sheetDays.has(bookingDate(b)),
  );
  const sheetRows: TimesheetRow[] = [];
  for (const sh of sheets) {
    if (!inRange(sh.workDate)) continue;
    for (const e of sh.entries || []) {
      const t = e.taskId ? tasks.find((x) => x.id === e.taskId) : null;
      sheetRows.push({
        id: e.taskId ? refNo(e.taskId, 'task') : '—',
        date: sh.workDate,
        type: 'Timesheet',
        project: e.kekaCode || e.projectName || '—',
        title: e.taskTitle || e.comment || '—',
        by: (t && s(t.creator)) || '—',
        start: xHm(e.startTime),
        end: xHm(e.endTime),
        hours: (Number(e.minutes) || 0) / 60,
        status: 'submitted',
      });
    }
  }
  const rows: TimesheetRow[] = [
    ...sheetRows,
    ...myTasks.map((t) => ({
      id: refNo(s(t.id), 'task'),
      date: taskDate(t),
      type: 'Task',
      project: projKeka(t, projects),
      title: s(t.title) || '—',
      by: s(t.creator) || '—',
      start: actualStart(t),
      end: actualEnd(t),
      hours: workedHrsLoose(t, corrections),
      status: s(t.status),
    })),
    ...myPro.map((b) => {
      const linked = tasks.find((t) => t.source === 'booking' && t.bookingId === b.id);
      return {
        id: refNo(s(b.id), 'booking'),
        date: bookingDate(b),
        type: 'Booking',
        project: projKeka(b, projects),
        title: s(b.channelName) || 'Professional Booking',
        by: s(b.requestedBy) || '—',
        start: linked ? actualStart(linked) : xHm(b.startTime),
        end: linked ? actualEnd(linked) : xHm(b.endTime),
        hours: linked ? workedHrsLoose(linked, corrections) : bookingHrs(b),
        status: s(b.status),
      };
    }),
  ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return { rows, totalHours: rows.reduce((n, r) => n + r.hours, 0) };
}

export const TIMESHEET_HEAD = ['Ref ID', 'Date', 'Type', 'Project / Keka Code', 'Task / Booking', 'Assigned By / Booked By', 'Start Time', 'End Time', 'Hours', 'Status'];
export const timesheetBody = (rows: readonly TimesheetRow[]) => rows.map((r) => [r.id, xDate(r.date) || '—', r.type, r.project, r.title, r.by, r.start, r.end, xHrs(r.hours), r.status]);

// ── Bookings of one person ───────────────────────────────────────────────────
const bkTaskDate = (t: Any) => s(t?.bookingDate || t?.startDate).slice(0, 10);
const bkStarted = (t: Any) => !!(t && (t.firstStartedAt || t.startedAt || Number(t.elapsedSeconds) > 0 || ['in_progress', 'submitted', 'completed'].includes(s(t.status))));

export function bookingRows(tasks: readonly Any[], name: string, from: string, to: string, projects: readonly ProjectLite[]) {
  const all = !from && !to;
  const rows = tasks
    .filter((t) => t.assignee === name && t.bookingDate)
    .filter((t) => {
      const d = bkTaskDate(t);
      if (!d) return all; // undated work belongs to no month and no range
      return (!from || d >= from) && (!to || d <= to);
    })
    .sort((a, b) => bkTaskDate(a).localeCompare(bkTaskDate(b)));
  const started = rows.filter(bkStarted).length;
  return {
    started,
    notStarted: rows.length - started,
    count: rows.length,
    head: ['Date', 'Task', 'Project / Keka Code', 'Status', 'Started', 'Time logged'],
    body: rows.map((t) => [xDate(bkTaskDate(t)) || '—', s(t.title), projKeka(t, projects), s(t.status) || '—', bkStarted(t) ? 'Yes' : 'No', Number(t.elapsedSeconds) > 0 ? xHms(Number(t.elapsedSeconds)) : '—']),
  };
}

// ── One Keka code ────────────────────────────────────────────────────────────
export function kekaReport(input: { code: string; project: string; from: string; to: string; tasks: readonly Any[]; bookings: readonly Any[]; tickets: readonly Any[]; corrections: readonly Correction[] }) {
  const { code, project, from, to, tasks, bookings, tickets, corrections } = input;
  const inRange = inRangeOf(from, to);
  const onCode = (r: Any) => r.kekaCode === code || (!!project && r.project === project);
  const approved = new Set(corrections.filter((c) => c.status === 'approved').map((c) => c.taskId));
  const el = (t: Any) => Number(t.elapsedSeconds) || 0;
  const codeTasks = tasks.filter((t) => onCode(t) && (approved.has(t.id) || (['submitted', 'completed'].includes(s(t.status)) && el(t) >= 60 && el(t) < 86400)) && inRange(taskDate(t)));
  const codeBookings = bookings.filter((b) => b.type === 'locations' && onCode(b) && !['rejected', 'cancelled'].includes(s(b.status)) && inRange(bookingDate(b)));
  const reqDate = (r: Any) => s(r.date || s(r.createdAt).split('T')[0]);
  const codeTickets = tickets.filter((r) => r.category === 'ticket' && onCode(r) && inRange(reqDate(r)));
  const codeAdmin = tickets.filter((r) => r.category === 'admin_request' && onCode(r) && inRange(reqDate(r)));

  const byEmp = new Map<string, { days: Set<string>; hours: number; tasks: number }>();
  for (const t of codeTasks) {
    const name = s(t.assignee) || '—';
    const e = byEmp.get(name) ?? { days: new Set<string>(), hours: 0, tasks: 0 };
    const d = taskDate(t);
    if (d) e.days.add(d);
    e.hours += workedHrsStrict(t, corrections);
    e.tasks += 1;
    byEmp.set(name, e);
  }
  const emp = [...byEmp.entries()].map(([name, e]) => ({ name, days: e.days.size, hours: e.hours, tasks: e.tasks })).sort((a, b) => b.hours - a.hours);
  const byLoc = new Map<string, { days: Set<string>; hours: number; bookings: number }>();
  for (const b of codeBookings) {
    const name = s(b.resource) || '—';
    const e = byLoc.get(name) ?? { days: new Set<string>(), hours: 0, bookings: 0 };
    const d = bookingDate(b);
    if (d) e.days.add(d);
    e.hours += bookingHrs(b);
    e.bookings += 1;
    byLoc.set(name, e);
  }
  const loc = [...byLoc.entries()].map(([name, e]) => ({ name, days: e.days.size, hours: e.hours, bookings: e.bookings })).sort((a, b) => b.hours - a.hours);
  const empDays = new Set(codeTasks.map(taskDate).filter(Boolean)).size;
  const locDays = new Set(codeBookings.map(bookingDate).filter(Boolean)).size;
  const sum = (xs: { hours: number }[]) => xs.reduce((n, x) => n + x.hours, 0);
  return {
    counts: { tasks: codeTasks.length, bookings: codeBookings.length, tickets: codeTickets.length, admin: codeAdmin.length },
    employees: [['Employee', 'Days Worked', 'Hours Worked', 'Tasks'], ...emp.map((r) => [r.name, r.days, xHrs(r.hours), r.tasks]), ['TOTAL', empDays, xHrs(sum(emp)), codeTasks.length]],
    employeeDetail: [
      ['Employee', 'Date', 'Start', 'End', 'Hours', 'Task'],
      ...codeTasks
        .slice()
        .sort((a, b) => taskDate(b).localeCompare(taskDate(a)))
        .map((t) => [s(t.assignee) || '—', xDate(taskDate(t)), actualStart(t), actualEnd(t), xHrs(workedHrsStrict(t, corrections)), s(t.title) || '—']),
    ],
    locations: [['Location', 'Days Booked', 'Hours Booked', 'Bookings'], ...loc.map((r) => [r.name, r.days, xHrs(r.hours), r.bookings]), ['TOTAL', locDays, xHrs(sum(loc)), codeBookings.length]],
    itSupport: [['Date', 'Subject', 'Raised By', 'Priority', 'Status', 'Rejection Reason'], ...codeTickets.map((r) => [xDate(reqDate(r)), s(r.subject), s(r.from || r.raisedByName), s(r.priority), s(r.status), s(r.rejectionReason)])],
    adminRequests: [
      ['Date', 'Item', 'Raised By', 'Urgency', 'Status', 'Rejection Reason'],
      ...codeAdmin.map((r) => [xDate(reqDate(r)), `${s(r.quantity)}x ${s(r.itemType)}`, s(r.from || r.raisedByName), s(r.urgency), s(r.status), s(r.rejectionReason)]),
    ],
  };
}
