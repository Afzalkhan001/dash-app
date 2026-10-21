// Team board's words and sums, ported from dash.html 13525–13547 (labels, taskIsOverdue,
// taskLiveSeconds, fmtHours, projectIsOverdue). Pure: the clock comes in as `now`, today as `today`
// (IST, useTodayIst), so render never reads Date.now().

import type { TrPriority, TrProject, TrProjectStatus, TrTask, TrTaskStatus } from '@/api/teamboard';
import { hms as runningClock } from '@/features/attendance/format';
import { dateLabel, durationLabel } from '@/lib/dates';
import type { StatusTone } from '@/theme/tokens';

export const PRIORITY_LABEL: Record<TrPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};
export const TASK_STATUS_LABEL: Record<TrTaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};
export const PROJECT_STATUS_LABEL: Record<TrProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const TASK_STATUS_TONE: Record<TrTaskStatus, StatusTone> = {
  todo: 'neutral',
  in_progress: 'info',
  blocked: 'failed',
  done: 'done',
};
export const PROJECT_STATUS_TONE: Record<TrProjectStatus, StatusTone> = {
  planning: 'neutral',
  active: 'info',
  on_hold: 'pending',
  completed: 'done',
  cancelled: 'neutral',
};

/** taskIsOverdue (13537): a due date before today (IST) and not done. */
export const taskIsOverdue = (t: Pick<TrTask, 'due_date' | 'status'>, today: string) => !!(t.due_date && t.status !== 'done' && t.due_date < today);

/** projectIsOverdue (13547): due before today and not completed / cancelled. */
export const projectIsOverdue = (p: Pick<TrProject, 'due_date' | 'status'>, today: string) =>
  !!(p.due_date && p.status !== 'completed' && p.status !== 'cancelled' && p.due_date < today);

/** taskLiveSeconds (13543): the frozen total plus the running segment. */
export function liveSeconds(t: Pick<TrTask, 'elapsed_seconds' | 'started_at'>, now: number) {
  const base = t.elapsed_seconds || 0;
  if (!t.started_at) return base;
  const from = Date.parse(t.started_at);
  return Number.isFinite(from) ? base + Math.max(0, Math.floor((now - from) / 1000)) : base;
}

export const isRunningTr = (t: Pick<TrTask, 'started_at'>) => !!t.started_at;

/** Logged time in the app's one duration format (DESIGN §0C): "16h 52m", "45m", "0m". The website's
 *  fmtHours (13546) shows decimal hours ("16.87h"); the phone never does. */
export function hoursLabel(seconds: number) {
  return minutesLabel(Math.floor((seconds || 0) / 60));
}

/** durationLabel without a trailing "0m" on whole hours: 60 → "1h", 110 → "1h 50m", 45 → "45m". */
export function minutesLabel(min: number) {
  const m = Math.max(0, Math.round(min || 0));
  return m >= 60 && m % 60 === 0 ? `${m / 60}h` : durationLabel(m);
}

/** A running clock (DESIGN §0C): "2h 14m 05s", "4m 09s" — never "02:14:05" (the website's fmtHMS 13545). */
export const hms = runningClock;

/** A bare Work (no assignee, no parent) is a planning container, not trackable work (13971). */
export const isTrackable = (t: Pick<TrTask, 'assignee_id' | 'parent_task_id'>) => !!(t.assignee_id || t.parent_task_id);

/** The status a row shows: Overdue wins over To do / In progress / Blocked. */
export function taskPill(t: TrTask, today: string): { label: string; tone: StatusTone } {
  if (taskIsOverdue(t, today)) return { label: 'Overdue', tone: 'failed' };
  return {
    label: TASK_STATUS_LABEL[t.status],
    tone: TASK_STATUS_TONE[t.status],
  };
}

export function projectPill(p: TrProject, today: string): { label: string; tone: StatusTone } {
  if (projectIsOverdue(p, today)) return { label: 'Overdue', tone: 'failed' };
  return {
    label: PROJECT_STATUS_LABEL[p.status],
    tone: PROJECT_STATUS_TONE[p.status],
  };
}

/** "Due Mon, 19 Oct" / "Overdue since Mon, 12 Oct" / '' without a date. */
export function dueLine(due: string, overdue: boolean, today: string) {
  if (!due) return '';
  return `${overdue ? 'Overdue since' : 'Due'} ${dateLabel(due, today)}`;
}

/** "Start" / "Resume" / "Pause" — the website's timer button (14083). */
export const timerVerb = (t: TrTask) => (t.started_at ? 'Pause' : t.elapsed_seconds > 0 ? 'Resume' : 'Start');

/** The website's Start payload (14006): status moves to in progress only from To do. */
export function startBody(t: TrTask, nowIso: string) {
  return t.status === 'todo' ? { startedAt: nowIso, status: 'in_progress' as const } : { startedAt: nowIso };
}

/** Pause (14018): freeze the live total and stop the clock. */
export const pauseBody = (t: TrTask, now: number) => ({
  elapsedSeconds: liveSeconds(t, now),
  startedAt: null,
});

/** A status change also freezes a running clock in the same request (13996, 14786). */
export function statusBody(t: TrTask, status: TrTaskStatus, now: number) {
  return t.started_at ? { status, elapsedSeconds: liveSeconds(t, now), startedAt: null } : { status };
}

/** The priority's dot colour key (PROJECT_PRIORITY_COLORS 13524), mapped to theme tokens by the caller. */
export const priorityRank: Record<TrPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

/** Department members, matched by id or by name (case-insensitive) — the server's inDept(). */
export function inDept(rawDept: unknown, dept: { id: string; name: string } | null | undefined) {
  if (!dept) return false;
  const d = typeof rawDept === 'string' ? rawDept : '';
  const nameLower = (dept.name || '').toLowerCase();
  return d === dept.id || (!!nameLower && d.toLowerCase() === nameLower);
}

export const plainCount = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
