// What My Tasks shows, derived exactly as the web's MyTasks does (dash.html ~L26572–27030):
// my tasks + approved professional bookings that have no task yet, one row each, with the web's
// reference numbers and newest-first order. The app groups them by status in plain words:
// Paused, To do, Waiting for approval, Done (the running task has its own card on top).

import { useMemo } from 'react';

import type { Project } from '@/api/reimbursements';
import type { Booking, Task } from '@/api/tasks';
import { refNo } from '@/features/support/format';
import { dateLabel, hmLabel } from '@/features/visitors/format';
import { todayIst } from '@/lib/dates';
import type { StatusTone } from '@/theme/tokens';

export type TaskRow = {
  kind: 'task' | 'bk';
  id: string; // task id, or 'bk_' + booking id
  ticketId: string;
  title: string;
  desc: string;
  project: string;
  due: string; // YYYY-MM-DD or ''
  time: string;
  status: string;
  source: string;
  category: string;
  requesterName: string;
  dept: string;
  kekaCode: string;
  createdAt: string;
  task?: Task;
  booking?: Booking;
};

// API rows are loosely typed (and the query cache is persisted), so text fields are coerced before
// any .toLowerCase / .slice, and lists are checked with Array.isArray before .map / .filter.
const str = (v: unknown) => (v == null ? '' : String(v));
const list = <T,>(x: T[] | null | undefined): T[] => (Array.isArray(x) ? x.filter((v): v is T => v != null && typeof v === 'object') : []);

// ── timer ────────────────────────────────────────────────────────────────────────────────────────
// A task's time is elapsedSeconds (frozen whenever the timer stops) plus the stretch running since
// startedAt. "Running" is in progress AND started.
export const isRunning = (t?: Task | null) => !!t && t.status === 'in_progress' && !!t.startedAt;

export function elapsedOf(t: Task, now = Date.now()) {
  const base = Number(t.elapsedSeconds) || 0;
  if (!isRunning(t)) return base;
  const started = Date.parse(String(t.startedAt));
  if (!Number.isFinite(started)) return base;
  return base + Math.max(0, Math.floor((now - started) / 1000));
}

/** Seconds worked on a task without reading the clock (exact for any task that isn't running). */
export const workedSeconds = (t?: Pick<Task, 'elapsedSeconds'> | null) => Math.max(0, Math.floor(Number(t?.elapsedSeconds) || 0));

/** Seconds as hours with one decimal (5,400 s → 1.5), for the "1.5/3 h" figure on a task row. */
export const hoursOf = (s: number) => Math.round(Math.max(0, s) / 360) / 10;

/** Hours as the app writes a figure's unit: "1.5h", "3h" (one decimal at most). */
export const hoursText = (h: number) => `${(Number.isFinite(h) ? h : 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })}h`;

const HHMM = /^(\d{1,2}):(\d{2})/;
const minutesOf = (hm: unknown) => {
  const m = typeof hm === 'string' ? HHMM.exec(hm.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/** The booked length of a row in hours ('10:00'–'13:00' → 3), or null without both times. */
export function bookedHours(r: Pick<TaskRow, 'task' | 'booking'>): number | null {
  const start = minutesOf(r.booking?.startTime || r.task?.startTime);
  const end = minutesOf(r.booking?.endTime || r.task?.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round(((end - start) / 60) * 10) / 10;
}

// The running stopwatch, "1h 42m 05s" / "42m 05s" — a duration, written like the attendance clock's
// live timer, so it never reads like a clock time ("1:42").
export function clock(s: number) {
  const t = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h ? `${h}h ${String(m).padStart(2, '0')}m ${sec}s` : `${m}m ${sec}s`;
}

// Time worked on a stopped (paused) task, written like every other duration in the app: "1h 42m",
// "42m", "0m" in its first minute.
export function workedLabel(s: number) {
  const mins = Math.max(0, Math.floor(s / 60));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}

// ── Keka Code shown for a task ───────────────────────────────────────────────────────────────────
export function projKeka(t: Pick<Task, 'kekaCode' | 'project'>, projects: Project[]) {
  const ps = list(projects);
  return str(
    t.kekaCode ||
      ps.find((p) => p.id === t.project)?.kekaCode ||
      ps.find((p) => p.name === t.project)?.kekaCode ||
      t.project ||
      '—',
  );
}

// Booking tasks auto-created without a Keka Code read it off their booking (the web also writes
// it back to the task on load; the app only displays it).
export function taskKeka(t: Task, bookings: Booking[], projects: Project[]) {
  if (t.bookingId) {
    const bk = list(bookings).find((b) => b.id === t.bookingId);
    if (bk) {
      const k = bk.kekaCode || list(projects).find((p) => p.name === bk.project)?.kekaCode || bk.project || '';
      if (k) return str(k);
    }
  }
  return projKeka(t, projects);
}

export const dueOf = (t: Task) => str(t.startDate || t.bookingDate || t.date || '');

// ── display status ───────────────────────────────────────────────────────────────────────────────
// A submitted task that came from a professional booking waits for the booking requester's
// sign-off, not a manager's. Internal only: the screens show the plain group words below.
export function displayStatus(r: Pick<TaskRow, 'status' | 'source'>): 'Completed' | 'In progress' | 'Pending review' | 'Pending' {
  if (r.status === 'completed' || r.status === 'reviewed') return 'Completed';
  if (r.status === 'in_progress') return 'In progress';
  if (r.status === 'submitted') return r.source === 'booking' ? 'Pending review' : 'Pending';
  return 'Pending';
}

// ── groups (plain words) ─────────────────────────────────────────────────────────────────────────
// Submitted work waits on someone else (the requester, the manager, or IT closing the ticket), so it
// has its own group instead of sitting with work still to do.
export type TaskGroup = 'in_progress' | 'todo' | 'waiting' | 'done';

// The running task is shown on its own (the dark card on My tasks), so what is left under
// in_progress there is paused work — hence the plain "Paused" heading.
export const TASK_GROUPS: { key: TaskGroup; title: string }[] = [
  { key: 'in_progress', title: 'Paused' },
  { key: 'todo', title: 'To do' },
  { key: 'waiting', title: 'Waiting for approval' },
  { key: 'done', title: 'Done' },
];

export function taskGroup(r: Pick<TaskRow, 'status' | 'source'>): TaskGroup {
  if (displayStatus(r) === 'Completed') return 'done';
  if (r.status === 'in_progress') return 'in_progress';
  if (r.status === 'submitted') return 'waiting';
  return 'todo';
}

const PILL: Record<TaskGroup, { label: string; tone: StatusTone }> = {
  in_progress: { label: 'In progress', tone: 'info' },
  todo: { label: 'To do', tone: 'neutral' },
  waiting: { label: 'Waiting for approval', tone: 'pending' },
  done: { label: 'Done', tone: 'done' },
};
const PAUSED = { label: 'Paused', tone: 'neutral' as StatusTone };
/** The status word for a row; an in-progress task whose timer is stopped says "Paused". */
export const statusPill = (r: Pick<TaskRow, 'status' | 'source'> & { task?: Task }) =>
  r.task && r.task.status === 'in_progress' && !isRunning(r.task) ? PAUSED : PILL[taskGroup(r)];

/** Work still to do that is late or due today ('' otherwise): its row says "Overdue" / "Due today". */
export function dueState(r: Pick<TaskRow, 'due' | 'status' | 'source'>, today: string): 'overdue' | 'today' | '' {
  if (taskGroup(r) !== 'todo' || !YMD.test(r.due)) return '';
  return r.due < today ? 'overdue' : r.due === today ? 'today' : '';
}

// ── dates ────────────────────────────────────────────────────────────────────────────────────────
// A YYYY-MM-DD from the API as "Mon, 19 Oct" (the year only outside this year). Anything that isn't a
// real date is shown as it came, so a malformed value can never throw inside Intl.
const YMD = /^\d{4}-\d{2}-\d{2}$/;
export function safeDay(ymd: string, today?: string) {
  const s = str(ymd);
  return YMD.test(s) ? dateLabel(s, today) : s;
}

/** "Today, 10:00 AM", "Mon, 19 Oct, 10:00 AM", or '' when there is no date (callers leave it out). Pass `today` (useTodayIst) from render. */
export const dueText = (r: Pick<TaskRow, 'due' | 'time'>, today?: string) =>
  r.due ? `${today && r.due === today ? 'Today' : safeDay(r.due, today)}${r.time ? `, ${hmLabel(r.time)}` : ''}` : '';

// The plain names Help & support uses for the same requests.
export const CATEGORY_LABEL: Record<string, string> = { ticket: 'IT help', asset: 'Equipment', booking: 'Booking' };
export const categoryLabel = (c?: string) => CATEGORY_LABEL[c || ''] || (c ? c.replace(/_/g, ' ') : 'Task');

// Ticket-sourced tasks reuse the Service Desk's reference for the ticket; others get their own.
// refNo falls back to "…-000000" when the id has no digits; that reads as placeholder data, so the
// app shows no reference at all for such a record (the category still names it).
export const rowRef = (r: TaskRow) => {
  const ref = r.ticketId ? refNo(r.ticketId, r.category) : refNo(r.id, r.category === 'booking' ? 'booking' : 'task');
  return /-0+$/.test(ref) ? '' : ref;
};

/** The small line above a task's title: "TSK-1A2B · Booking", or just the category without a reference. */
export const refLine = (r: TaskRow) => [rowRef(r), r.category ? categoryLabel(r.category) : ''].filter(Boolean).join(' · ') || categoryLabel(r.category);

// ── ordering (sortTasksNewestFirst) ──────────────────────────────────────────────────────────────
const dateKey = (r: TaskRow) => `${r.due}|${r.time}|${r.createdAt}`;
export const newestFirst = (a: TaskRow, b: TaskRow) => {
  const ka = dateKey(a);
  const kb = dateKey(b);
  if (ka !== kb) return ka < kb ? 1 : -1;
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
};

// ── rows ─────────────────────────────────────────────────────────────────────────────────────────
export function buildRows(tasksArg: Task[], bookingsArg: Booking[], projects: Project[]) {
  const tasksIn = list(tasksArg);
  const bookings = list(bookingsArg);
  // Tasks whose booking was rejected/cancelled: the web deletes them on load; the app just hides them.
  const deadBookings = new Set(bookings.filter((b) => b.status === 'rejected').map((b) => b.id));
  const tasks = tasksIn.filter((t) => !(t.bookingId && deadBookings.has(t.bookingId)));
  const taskBookingIds = new Set(tasks.map((t) => t.bookingId).filter(Boolean) as string[]);
  const pendingBookings = bookings.filter((b) => b.status === 'approved' && !taskBookingIds.has(b.id));

  const rows: TaskRow[] = [
    ...tasks.map<TaskRow>((t) => {
      const keka = taskKeka(t, bookings, projects);
      return {
        kind: 'task',
        id: str(t.id),
        ticketId: str(t.ticketId),
        title: str(t.title) || 'Task',
        desc: str(t.desc || t.comments || t.reason),
        project: keka,
        due: dueOf(t),
        time: str(t.startTime),
        status: str(t.status) || 'pending',
        source: str(t.source),
        category: str(t.category) || (t.source === 'ticket' ? 'ticket' : t.source === 'resource_request' ? 'asset' : ''),
        requesterName: str(t.requesterName),
        dept: str(t.dept),
        kekaCode: str(t.kekaCode || keka),
        createdAt: str(t.createdAt),
        task: t,
      };
    }),
    ...pendingBookings.map<TaskRow>((b) => ({
      kind: 'bk',
      id: `bk_${b.id}`,
      ticketId: '',
      title: `Assigned: ${str(b.requestedBy)} — ${str(b.kekaCode || b.project) || 'Booking'}`,
      desc: str(b.comments),
      project: str(b.kekaCode || b.project) || '—',
      due: str(b.date),
      time: str(b.startTime),
      status: 'pending',
      source: 'booking',
      category: 'booking',
      requesterName: str(b.requestedBy),
      dept: '',
      kekaCode: str(b.kekaCode || b.project),
      createdAt: str(b.createdAt),
      booking: b,
    })),
  ].sort(newestFirst);

  return { rows, tasks, pendingBookings };
}

// Starting is only allowed on/after the booking's day (the web's canStart). Pass `today` (from
// useTodayIst) when calling during render so render stays pure.
export const canStartOn = (date?: string, today: string = todayIst()) => !date || date <= today;

export function useRows(tasks: Task[] | undefined, bookings: Booking[] | undefined, projects: Project[] | undefined) {
  return useMemo(() => buildRows(list(tasks), list(bookings), list(projects)), [tasks, bookings, projects]);
}

// IT & Admin department staff mostly work their own internal tickets, so the web exempts them from
// the Start/End code entirely (department name like "IT Admin", or the it_admin role).
export const isItAdminDept = (deptName: string, role?: string) => /it.*admin|admin.*it/i.test(deptName) || role === 'it_admin';
