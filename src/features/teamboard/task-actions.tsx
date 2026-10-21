// What can be done to one Team Roster task, shared by the board's lists and the assignee's list:
//
//   Start / Resume  PUT {startedAt: now, status: 'in_progress' if To do} (14006). Only on my own task,
//                   never on a done one. The server pauses my other running task, so every list refreshes.
//   Pause           PUT {elapsedSeconds: live, startedAt: null} (14018).
//   Change status   PUT {status} — a running clock is frozen in the same request (13996, 14786).
//   Edit            the task form (board only).
//   Delete          ConfirmSheet + swipe → DELETE (board only). A Work takes its sub-works with it.
//
// None of these sends a message (team_roster.js has no email or WhatsApp). Errors show the server's
// own sentence in a toast.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ListChecks, Pause, Pencil, Play, SquareArrowOutUpRight, Trash2 } from 'lucide-react-native';
import { useState } from 'react';

import { deleteTask, tbKeys, type TrTask, type TrTaskStatus, TASK_STATUSES, updateTask } from '@/api/teamboard';
import { useSession } from '@/auth/session';
import { hms, hoursLabel, isRunningTr, liveSeconds, pauseBody, startBody, statusBody, TASK_STATUS_LABEL, timerVerb } from '@/features/teamboard/model';
import { taskFormHref } from '@/features/teamboard/links';
import { Banner, ConfirmSheet, haptic, type MenuItem, MenuSheet, SummaryCard, type SummaryItem, toast } from '@/ui';

// A sheet opened from a MenuSheet waits for the menu to finish closing (iOS shows one Modal at a time).
const AFTER_MENU_MS = 420;

type Opts = {
  /** The board (manager) view: Edit and Delete are offered. */
  board: boolean;
  /** The department id the task form opens in (board only). */
  dept?: string;
  /** How many sub-works a task has (a Work's delete warns about them). */
  subCount?: (t: TrTask) => number;
  onDeleted?: (t: TrTask) => void;
};

export function useTrTaskActions({ board, dept = '', subCount, onDeleted }: Opts) {
  const qc = useQueryClient();
  const router = useRouter();
  const me = useSession((s) => s.user);
  const [statusFor, setStatusFor] = useState<TrTask | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleting, setDeleting] = useState<TrTask | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: tbKeys.all(me?.id) });

  // The clock is read when the write runs (never during render): Start stamps now, Pause and a status
  // change freeze the live total at that moment.
  const write = useMutation({
    mutationFn: async (v: { t: TrTask; status?: TrTaskStatus }) => {
      const now = Date.now();
      if (v.status) {
        await updateTask(v.t.id, statusBody(v.t, v.status, now));
        return `Moved to ${TASK_STATUS_LABEL[v.status]}`;
      }
      if (isRunningTr(v.t)) {
        await updateTask(v.t.id, pauseBody(v.t, now));
        return `Paused at ${hms(liveSeconds(v.t, now))}`;
      }
      await updateTask(v.t.id, startBody(v.t, new Date(now).toISOString()));
      return v.t.elapsed_seconds > 0 ? 'Resumed' : 'Started';
    },
    onSuccess: (done) => {
      haptic.success();
      toast.show(done, 'success');
    },
    onError: (e) => {
      haptic.error();
      toast.show(e instanceof Error ? e.message : 'That didn’t work. Try again.', 'danger');
    },
    onSettled: () => void refresh(),
  });
  const remove = useMutation({
    mutationFn: (t: TrTask) => deleteTask(t.id),
    onSuccess: (_r, t) => {
      haptic.success();
      setDeleteOpen(false);
      toast.show(t.parent_task_id || t.assignee_id ? 'Task deleted' : 'Work deleted', 'success');
      onDeleted?.(t);
      void refresh();
    },
    onError: () => haptic.error(),
  });

  const mine = (t: TrTask) => !!me && t.assignee_id === me.id;
  const canTime = (t: TrTask) => mine(t) && t.status !== 'done';

  const toggleTimer = (t: TrTask) => {
    if (!write.isPending) write.mutate({ t });
  };
  const setStatus = (t: TrTask, s: TrTaskStatus) => {
    if (s !== t.status) write.mutate({ t, status: s });
  };

  const openStatus = (t: TrTask, fromMenu = false) => {
    setStatusFor(t);
    if (fromMenu) setTimeout(() => setStatusOpen(true), AFTER_MENU_MS);
    else setStatusOpen(true);
  };
  const openDelete = (t: TrTask, fromMenu = false) => {
    remove.reset();
    setDeleting(t);
    if (fromMenu) setTimeout(() => setDeleteOpen(true), AFTER_MENU_MS);
    else setDeleteOpen(true);
  };
  const edit = (t: TrTask) => router.push(taskFormHref(dept || t.department_id, t.project_id, { id: t.id }));

  /** The ••• menu of a task row. `open` adds "Open" first (e.g. a sub-work's form). */
  const menu = (t: TrTask, extra: { open?: () => void; openLabel?: string } = {}): MenuItem[] => {
    const items: MenuItem[] = [];
    if (extra.open)
      items.push({
        key: 'open',
        label: extra.openLabel ?? 'Open',
        icon: SquareArrowOutUpRight,
        onPress: extra.open,
      });
    // A bare Work (no assignee, no parent) is a planning container: the website's project page only
    // opens or deletes it (14508–14515); its name is edited on the work's own page.
    const bareWork = !t.assignee_id && !t.parent_task_id;
    if (canTime(t))
      items.push({
        key: 'timer',
        label: timerVerb(t),
        icon: isRunningTr(t) ? Pause : Play,
        onPress: () => toggleTimer(t),
      });
    if (!bareWork)
      items.push({
        key: 'status',
        label: 'Change status',
        icon: ListChecks,
        onPress: () => openStatus(t, true),
      });
    if (board) {
      if (!bareWork)
        items.push({
          key: 'edit',
          label: 'Edit',
          icon: Pencil,
          onPress: () => edit(t),
        });
      items.push({
        key: 'delete',
        label: 'Delete',
        icon: Trash2,
        tone: 'danger',
        onPress: () => openDelete(t, true),
      });
    }
    return items;
  };

  const subs = deleting && subCount ? subCount(deleting) : 0;
  const isWork = !!deleting && !deleting.parent_task_id && !deleting.assignee_id;
  const facts: SummaryItem[] = deleting
    ? [
        {
          key: 'what',
          label: isWork ? 'Work' : 'Task',
          value: deleting.title || 'Untitled',
        },
        ...(deleting.project_name ? [{ key: 'project', label: 'Project', value: deleting.project_name }] : []),
        ...(isWork
          ? [
              {
                key: 'subs',
                label: 'Sub works',
                value: subs ? `${subs} deleted too` : 'None',
              },
            ]
          : []),
        ...(!isWork
          ? [
              {
                key: 'time',
                label: 'Time logged',
                value: deleting.elapsed_seconds || deleting.started_at ? hoursLabel(deleting.elapsed_seconds) : 'None',
              },
            ]
          : []),
      ]
    : [];

  const ui = (
    <>
      <MenuSheet
        visible={statusOpen && !!statusFor}
        onClose={() => setStatusOpen(false)}
        title="Change status"
        subtitle={statusFor ? statusFor.title : undefined}
        items={TASK_STATUSES.map((s) => ({
          key: s,
          label: TASK_STATUS_LABEL[s],
          hint: statusFor?.status === s ? 'Current status' : s === 'done' && statusFor && isRunningTr(statusFor) ? 'Stops the clock' : undefined,
          disabled: statusFor?.status === s,
          onPress: () => statusFor && setStatus(statusFor, s),
        }))}
      />
      {deleting ? (
        <ConfirmSheet
          visible={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          title={isWork ? 'Delete this work?' : 'Delete this task?'}
          from={{
            title: 'You',
            subtitle: 'Deleting',
            avatar: { name: me?.name || 'You' },
          }}
          to={
            isWork
              ? {
                  title: deleting.title || 'Work',
                  subtitle: subs ? `and ${subs} sub ${subs === 1 ? 'work' : 'works'}` : 'No sub works',
                  icon: Trash2,
                  module: 'tasks',
                }
              : {
                  title: deleting.assignee_name || 'Unassigned',
                  subtitle: 'Assigned to',
                  avatar: { name: deleting.assignee_name || '?' },
                }
          }
          detailsTitle="Details"
          confirmLabel="Swipe to delete"
          onConfirm={() => remove.mutate(deleting)}
          loading={remove.isPending}
          note={
            isWork && subs
              ? `This removes ${subs} sub ${subs === 1 ? 'work' : 'works'} too, with their logged time. It can’t be undone. No one is messaged.`
              : 'This deletes it and its logged time for good. No one is messaged.'
          }>
          <SummaryCard rows={facts} />
          {remove.error ? <Banner tone="danger" title="Couldn’t delete it" message={remove.error.message} /> : null}
        </ConfirmSheet>
      ) : null}
    </>
  );

  return {
    ui,
    menu,
    toggleTimer,
    setStatus,
    openStatus,
    openDelete,
    edit,
    mine,
    canTime,
    busyId: write.isPending ? (write.variables?.t.id ?? null) : null,
  };
}
