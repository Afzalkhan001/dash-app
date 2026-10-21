// Work domain (wave 1) — the Inbox kinds this domain adds (docs/port/EXTENSION-POINTS.md §5):
//
//   task     "Task to review": submitted tasks of my review team (RequestsView submittedTasks,
//            dash.html:24152) — status 'submitted', not from a booking or a ticket. Detail:
//            features/work/review-detail (Approve / Send back).
//   timefix  "Time correction": pending time corrections of my review team (pendingCorrs :24153).
//            The real server stores them without a company id, so the queue is usually empty — the
//            chip only shows while something is waiting (PLAN §1.1 "hidden when empty").
//
// Both follow the RequestsView gate: nav `requests` (admin, manager, app_manager + the switch).
// Queries live under ['inbox', key, …] so the Inbox's poll and refresh cover them.

import { ClipboardCheck, Timer } from 'lucide-react-native';

import type { TeamTask, TimeCorrection } from '@/api/work';
import { useReviewTasks, useTimeCorrections, useWorkDepts, useWorkUsers } from '@/api/work';
import { ago, shortDay } from '@/features/inbox/format';
import { defineInboxKind, type InboxKindPlugin } from '@/features/plugin-types';
import { workedLabel, workedSeconds } from '@/features/tasks/model';
import { canReviewWork, reviewTeamNames } from '@/features/work/access';
import { isReviewable, TaskReviewDetail } from '@/features/work/review-detail';
import { hoursOfCorrection, isMyCorrection, TimeFixDetail } from '@/features/work/timefix-detail';
import type { Access } from '@/lib/use-access';

const str = (v: unknown) => (v == null ? '' : String(v));

/** The review team's names, read through the same queries every work screen shares. */
function useReviewNames(access: Access, on: boolean) {
  const usersQ = useWorkUsers(on);
  const deptsQ = useWorkDepts(on);
  const me = access.user;
  const ready = !!usersQ.data && !!deptsQ.data;
  const names = me && ready ? reviewTeamNames({ id: me.id, role: me.role, name: me.name, dept: me.dept }, usersQ.data ?? [], deptsQ.data ?? []) : new Set<string>();
  return { names, ready, failed: (usersQ.isError && !usersQ.data) || (deptsQ.isError && !deptsQ.data) };
}

export const inboxKinds: InboxKindPlugin[] = [
  defineInboxKind<TeamTask>({
    key: 'task',
    label: 'Tasks',
    title: 'Task to review',
    module: 'tasks',
    icon: ClipboardCheck,
    useItems: (access) => {
      const on = canReviewWork(access) && !!access.user;
      const team = useReviewNames(access, on);
      const q = useReviewTasks(on);
      const list = on && team.ready ? (q.data ?? []).filter((t) => !!t && isReviewable(t, team.names)) : [];
      return {
        visible: on,
        items: list.map((t) => ({ id: str(t.id), at: str(t.completedAt || t.lastEndedAt || t.createdAt), who: str(t.assignee) || 'Someone', record: t })),
        pending: on && q.data && team.ready ? list.length : null,
        error: on && ((q.isError && !q.data) || team.failed),
      };
    },
    row: (item, { now }) => {
      const t = item.record;
      const secs = workedSeconds(t);
      return {
        title: item.who,
        subtitle: `${str(t.title) || 'Task'} · Task`,
        meta: str(t.kekaCode) || undefined,
        value: secs ? workedLabel(secs) : undefined,
        age: ago(item.at, now),
      };
    },
    Detail: TaskReviewDetail,
  }),
  defineInboxKind<TimeCorrection>({
    key: 'timefix',
    label: 'Time fixes',
    title: 'Time correction',
    module: 'timesheets',
    icon: Timer,
    useItems: (access) => {
      const on = canReviewWork(access) && !!access.user;
      const team = useReviewNames(access, on);
      const q = useTimeCorrections(on);
      const list = on && team.ready ? (q.data ?? []).filter((c) => !!c && isMyCorrection(c, team.names)) : [];
      return {
        // Hidden while nothing is waiting (the real queue is usually empty).
        visible: on && list.length > 0,
        items: list.map((c) => ({ id: str(c.id), at: str(c.createdAt), who: str(c.assignee) || 'Someone', record: c })),
        pending: list.length,
      };
    },
    row: (item, { today, now }) => {
      const c = item.record;
      const h = hoursOfCorrection(c);
      return {
        title: item.who,
        subtitle: `${str(c.taskTitle) || 'Task'} · Time correction`,
        meta: c.taskDate ? shortDay(str(c.taskDate), today) : undefined,
        value: h ? `${h.toLocaleString('en-IN', { maximumFractionDigits: 2 })}h` : undefined,
        age: ago(item.at, now),
      };
    },
    Detail: TimeFixDetail,
  }),
];
