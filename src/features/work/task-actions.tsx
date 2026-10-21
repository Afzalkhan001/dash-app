// The manager's actions on one team task, shared by Team tasks (the ••• menu) and the task screen:
//
//   Mark done   PUT /tasks/:id {status:'completed', approvedBy, approvedAt} (web markComplete :23084).
//               The server then sends "Task approved" by WhatsApp and email to the assignee — only when
//               the task carries assigneeId (tasks made on the website don't), so the sheet says which.
//   Delete      DELETE /tasks/:id (web del :23048). A hard delete: the task and its logged time go.
//   Edit        opens the task form (/admin/work/tasks/new?id=…).
//
// Both writes are a ConfirmSheet with a swipe (docs/port/PLAN.md §2.1.6), then a toast.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CircleCheck, ClipboardList, Pencil, SquareArrowOutUpRight, Trash2 } from 'lucide-react-native';
import { useState } from 'react';

import { deleteTeamTask, type TeamTask, taskWriteKeys, updateTeamTask } from '@/api/work';
import { useSession } from '@/auth/session';
import { workedLabel, workedSeconds } from '@/features/tasks/model';
import { isDone } from '@/features/work/model';
import { firstName } from '@/lib/format';
import { Banner, ConfirmSheet, haptic, type MenuItem, SummaryCard, type SummaryItem, toast } from '@/ui';

// A sheet opened from a MenuSheet waits for the menu to finish closing (iOS shows one Modal at a time).
const AFTER_MENU_MS = 420;

type Pending = { kind: 'complete' | 'delete'; task: TeamTask } | null;

export const taskEditHref = (id: string) => `/admin/work/tasks/new?id=${encodeURIComponent(id)}` as const;
export const taskHref = (id: string) => `/admin/work/tasks/${encodeURIComponent(id)}` as const;

/** Who hears about "Mark done": the server messages the assignee only when the task has assigneeId. */
export function doneNotice(t: TeamTask) {
  if (!t.assigneeId) return 'No message is sent: this task isn’t linked to their account.';
  const who = firstName(String(t.assignee || ''));
  return who ? `${who} gets a WhatsApp and an email saying it’s approved.` : 'They get a WhatsApp and an email saying it’s approved.';
}

export function useTeamTaskActions({ onDeleted, code }: { onDeleted?: (id: string) => void; code?: (t: TeamTask) => string } = {}) {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useSession((s) => s.user);
  const [pending, setPending] = useState<Pending>(null);
  const [open, setOpen] = useState(false);

  const refresh = () => Promise.all(taskWriteKeys(me?.id).map((queryKey) => qc.invalidateQueries({ queryKey })));

  const complete = useMutation({
    mutationFn: (t: TeamTask) => updateTeamTask(t.id, { status: 'completed', approvedBy: me?.name ?? '', approvedAt: new Date().toISOString() }),
    onSuccess: () => {
      haptic.success();
      setOpen(false);
      toast.show('Marked done', 'success');
      void refresh();
    },
    onError: () => haptic.error(),
  });
  const remove = useMutation({
    mutationFn: (t: TeamTask) => deleteTeamTask(t.id),
    onSuccess: (_r, t) => {
      haptic.success();
      setOpen(false);
      toast.show('Task deleted', 'success');
      onDeleted?.(t.id);
      void refresh();
    },
    onError: () => haptic.error(),
  });

  const show = (kind: 'complete' | 'delete', task: TeamTask, fromMenu = false) => {
    complete.reset();
    remove.reset();
    setPending({ kind, task });
    if (fromMenu) setTimeout(() => setOpen(true), AFTER_MENU_MS);
    else setOpen(true);
  };

  const t = pending?.task;
  const busy = complete.isPending || remove.isPending;
  const err = pending?.kind === 'complete' ? complete.error : remove.error;
  const facts: SummaryItem[] = t
    ? [
        { key: 'task', label: 'Task', value: String(t.title || 'Task') },
        ...(code && code(t) ? [{ key: 'code', label: 'Project code', value: code(t) }] : []),
        { key: 'worked', label: 'Time worked', value: workedSeconds(t) ? workedLabel(workedSeconds(t)) : 'Not started' },
      ]
    : [];

  const ui = t ? (
    <ConfirmSheet
      visible={open}
      onClose={() => setOpen(false)}
      title={pending?.kind === 'delete' ? 'Delete this task?' : 'Mark this task done?'}
      from={{ title: 'You', subtitle: pending?.kind === 'delete' ? 'Deleting' : 'Approving', avatar: { name: me?.name || 'You' } }}
      to={{ title: String(t.assignee || 'No one'), subtitle: 'Assigned to', avatar: { name: String(t.assignee || '?') } }}
      detailsTitle="Details"
      confirmLabel={pending?.kind === 'delete' ? 'Swipe to delete' : 'Swipe to mark done'}
      onConfirm={() => (pending?.kind === 'delete' ? remove.mutate(t) : complete.mutate(t))}
      loading={busy}
      note={pending?.kind === 'delete' ? 'This deletes the task and its logged time for good. No message is sent.' : doneNotice(t)}>
      <SummaryCard rows={facts} />
      {err ? <Banner tone="danger" title={pending?.kind === 'delete' ? 'Couldn’t delete it' : 'Couldn’t mark it done'} message={err.message} /> : null}
    </ConfirmSheet>
  ) : null;

  /** The ••• menu of a task in a list. */
  const menu = (task: TeamTask, openTask: () => void): MenuItem[] => [
    { key: 'open', label: 'Open task', icon: SquareArrowOutUpRight, onPress: openTask },
    { key: 'edit', label: 'Edit', icon: Pencil, onPress: () => router.push(taskEditHref(task.id)) },
    ...(isDone(task) ? [] : [{ key: 'done', label: 'Mark done', icon: CircleCheck, onPress: () => show('complete', task, true) }]),
    { key: 'delete', label: 'Delete', icon: Trash2, tone: 'danger' as const, onPress: () => show('delete', task, true) },
  ];

  return {
    ui,
    menu,
    busy,
    openComplete: (task: TeamTask) => show('complete', task),
    openDelete: (task: TeamTask) => show('delete', task),
    edit: (task: TeamTask) => router.push(taskEditHref(task.id)),
    icon: ClipboardList,
  };
}
