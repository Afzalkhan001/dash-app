// Team tasks as ManagerTasksView derives them (dash.html:22977–23329): whose tasks count as mine,
// the KPI filters, the status words, the reference number, time worked and the activity timeline.
// Pure functions; dates are IST 'YYYY-MM-DD' (callers pass useTodayIst()).

import type { Project } from '@/api/reimbursements';
import type { Booking } from '@/api/tasks';
import type { TeamTask, WorkUser } from '@/api/work';
import { elapsedOf, isRunning, taskKeka } from '@/features/tasks/model';
import type { StatusTone } from '@/theme/tokens';

const s = (v: unknown) => (v == null ? '' : String(v));

// ── Mine ─────────────────────────────────────────────────────────────────────
/**
 * ManagerTasksView `isMine` (:23036): the assignee is on my team, or I created / approved it, or I am
 * its manager. The app also stamps `createdBy: <my id>` on tasks it creates, so that counts too.
 */
export function isMyTeamTask(t: TeamTask, me: { id: string; name?: string }, teamNames: ReadonlySet<string>) {
  const name = me.name ?? '';
  return (
    teamNames.has(s(t.assignee)) ||
    (!!name && (t.creator === name || t.createdBy === name || t.approvedBy === name)) ||
    t.createdBy === me.id ||
    t.managerId === me.id
  );
}

// ── Dates and order ──────────────────────────────────────────────────────────
/** The task's working date (startDate ‖ bookingDate ‖ date), as the KPI cards read it. */
export const workDate = (t: TeamTask) => s(t.startDate || t.bookingDate || t.date);

const dateKey = (t: TeamTask) => `${s(t.bookingDate || t.startDate || t.date)}|${s(t.startTime)}|${s(t.createdAt)}`;
/** sortTasksNewestFirst (dash.html:1754). */
export const newestFirst = (a: TeamTask, b: TeamTask) => {
  const ka = dateKey(a);
  const kb = dateKey(b);
  if (ka !== kb) return ka < kb ? 1 : -1;
  const ia = s(a.id);
  const ib = s(b.id);
  return ia === ib ? 0 : ia < ib ? 1 : -1;
};

// ── KPI filters ──────────────────────────────────────────────────────────────
export type TaskFilter = 'active' | 'ongoing' | 'overdue' | 'today' | 'completed' | 'all';

const DONE = ['completed', 'reviewed'];
const OPEN_EXCLUDES = ['completed', 'reviewed', 'submitted'];

/** isCompletedStatus (:23043): admin-type roles leave resolved IT tickets out of Completed. */
export const isCompletedTask = (t: TeamTask, adminType: boolean) => DONE.includes(s(t.status)) && (!adminType || t.source !== 'ticket');

export function matchesFilter(t: TeamTask, f: TaskFilter, today: string, adminType: boolean): boolean {
  const st = s(t.status);
  const d = workDate(t);
  switch (f) {
    case 'active':
      return !OPEN_EXCLUDES.includes(st);
    case 'ongoing':
      return st === 'in_progress';
    case 'overdue':
      return !OPEN_EXCLUDES.includes(st) && d !== '' && d < today;
    case 'today':
      // "Due today" is work still to start today: in-progress work is under Ongoing (web :23070).
      return !['completed', 'reviewed', 'in_progress'].includes(st) && d === today;
    case 'completed':
      return isCompletedTask(t, adminType);
    default:
      return true;
  }
}

export const FILTERS: { key: TaskFilter; label: string; needsAll?: boolean }[] = [
  { key: 'active', label: 'Active' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Due today' },
  { key: 'completed', label: 'Done', needsAll: true },
  { key: 'all', label: 'All', needsAll: true },
];

// ── Status words ─────────────────────────────────────────────────────────────
export const isDone = (t: TeamTask) => DONE.includes(s(t.status));

/** The row's pill: late or due-today work says so; otherwise the plain status word. */
export function teamStatus(t: TeamTask, today: string): { label: string; tone: StatusTone } {
  const st = s(t.status);
  if (DONE.includes(st)) return { label: 'Done', tone: 'done' };
  if (st === 'submitted') return { label: 'Sent for review', tone: 'pending' };
  if (st === 'in_progress') return isRunning(t) ? { label: 'Working now', tone: 'info' } : { label: 'Paused', tone: 'neutral' };
  const d = workDate(t);
  if (d && d < today) return { label: 'Overdue', tone: 'failed' };
  if (d && d === today) return { label: 'Due today', tone: 'pending' };
  return { label: 'To do', tone: 'neutral' };
}

/** TASK-1234: the web's reference (the last four digits of the id). '' when the id has none. */
export function taskRef(t: Pick<TeamTask, 'id'>) {
  const digits = s(t.id).replace(/\D/g, '');
  return digits ? `TASK-${digits.slice(-4).padStart(4, '0')}` : '';
}

// ── Time ─────────────────────────────────────────────────────────────────────
const HHMM = /^(\d{1,2}):(\d{2})/;
export const minutesOfHm = (hm: unknown) => {
  const m = typeof hm === 'string' ? HHMM.exec(hm.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/** Booked length in hours from start / end time ('10:00'–'13:00' → 3), or null. */
export function bookedHoursOf(t: Pick<TeamTask, 'startTime' | 'endTime'>): number | null {
  const a = minutesOfHm(t.startTime);
  const b = minutesOfHm(t.endTime);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round(((b - a) / 60) * 10) / 10;
}

/** Seconds worked (live while running, given `now`). */
export const workedOf = (t: TeamTask, now: number) => elapsedOf(t, now);

/** The project code shown for a task (the booking's, for booking tasks with none). */
export const codeOf = (t: TeamTask, bookings: Booking[] | undefined, projects: Project[] | undefined) => {
  const k = taskKeka(t, Array.isArray(bookings) ? bookings : [], Array.isArray(projects) ? projects : []);
  return k === '—' ? '' : k;
};

// ── People ───────────────────────────────────────────────────────────────────
export const userByName = (users: readonly WorkUser[] | undefined, name: unknown) =>
  (Array.isArray(users) ? users : []).find((u) => u.name === s(name));

// ── Activity (getTimeline :23085) ────────────────────────────────────────────
export type TaskEvent = { key: string; label: string; at?: string; by?: string; tone: 'neutral' | 'good' | 'bad' | 'info' | 'wait' };

export function taskEvents(t: TeamTask, workedLabel: string): TaskEvent[] {
  const ev: TaskEvent[] = [];
  if (t.createdAt) ev.push({ key: 'created', label: 'Task created', at: s(t.createdAt), by: s(t.creator) || undefined, tone: 'neutral' });
  if (t.assignee && t.createdAt) ev.push({ key: 'assigned', label: `Given to ${s(t.assignee)}`, at: s(t.createdAt), tone: 'info' });
  const started = s(t.firstStartedAt || t.startedAt);
  if (started) ev.push({ key: 'started', label: 'Started', at: started, by: s(t.assignee) || undefined, tone: 'info' });
  if ((Number(t.elapsedSeconds) || 0) > 0) ev.push({ key: 'logged', label: `Time logged (${workedLabel})`, tone: 'neutral' });
  if (t.completedAt && (t.status === 'submitted' || DONE.includes(s(t.status)))) {
    ev.push({ key: 'sent', label: 'Sent for review', at: s(t.completedAt), by: s(t.completedBy) || undefined, tone: 'wait' });
  }
  if (t.rejectedAt) ev.push({ key: 'returned', label: 'Sent back', at: s(t.rejectedAt), by: s(t.rejectedBy) || undefined, tone: 'bad' });
  if (DONE.includes(s(t.status)) && t.approvedAt) ev.push({ key: 'done', label: 'Marked done', at: s(t.approvedAt), by: s(t.approvedBy) || undefined, tone: 'good' });
  return ev;
}
