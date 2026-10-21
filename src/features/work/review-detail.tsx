// Inbox › Task to review (/inbox/task/<id>) — web: RequestsView's "Submitted tasks"
// (dash.html:24152; approveTask :24208, rejectTask :24213).
//
//   Approve    PUT /tasks/:id {status:'completed', approvedBy, approvedAt}. The server WhatsApps and
//              emails "Task approved" to the assignee — only when the task carries assigneeId; the bar
//              says which.
//   Send back  PUT /tasks/:id {status:'in_progress', rejectedBy, rejectionNote, rejectedAt} — exactly
//              the web's body. With status in_progress the server sends no message, so the sheet says
//              so: they see it (and your note) in My tasks.
//
// Only a submitted task (not from a booking or a ticket) of someone in my review team is decidable
// here (features/work/access reviewTeamNames) — the server checks nothing, so this is the guard.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ClipboardCheck } from 'lucide-react-native';
import { useState } from 'react';

import { type TeamTask, updateTeamTask, taskWriteKeys, useReviewTasks, useWorkBookings, useWorkDepts, useWorkUsers } from '@/api/work';
import { useProjects } from '@/api/reimbursements';
import { useSession } from '@/auth/session';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { noteDecision } from '@/features/inbox/decided';
import {
  DecidedSheet,
  DecisionScreen,
  DetailSkeleton,
  DetailsCard,
  deciderItem,
  explainDecisionError,
  MissingItem,
  NoteCard,
  outcomeStatus,
  RejectSheet,
  requesterItem,
  useOutcome,
  WhoCards,
} from '@/features/inbox/detail';
import { sentLine } from '@/features/inbox/format';
import type { InboxDetailProps } from '@/features/plugin-types';
import { dueText, workedLabel, workedSeconds } from '@/features/tasks/model';
import { canReviewWork, reviewTeamNames } from '@/features/work/access';
import { bookedHoursOf, codeOf, taskRef, workDate } from '@/features/work/model';
import { doneNotice } from '@/features/work/task-actions';
import { hmLabel } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import type { Decision } from '@/api/inbox';
import { palette } from '@/theme/tokens';
import { SummaryHero, Text } from '@/ui';

const TITLE = 'Task to review';
const str = (v: unknown) => (v == null ? '' : String(v));

/** A submitted task that is mine to review (the queue's own rule). */
export const isReviewable = (t: TeamTask, names: ReadonlySet<string>) =>
  t.status === 'submitted' && t.source !== 'booking' && t.source !== 'ticket' && names.has(str(t.assignee));

export function TaskReviewDetail({ id }: InboxDetailProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const me = useSession((s) => s.user);
  const now = useNow();
  const today = useTodayIst();
  const on = canReviewWork(access);
  const tasksQ = useReviewTasks(on);
  const usersQ = useWorkUsers(on);
  const deptsQ = useWorkDepts(on);
  const projectsQ = useProjects(on);
  const bookingsQ = useWorkBookings(on);
  const outcome = useOutcome();
  const [snap, setSnap] = useState<TeamTask | null>(null);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState('');

  const names = me ? reviewTeamNames({ id: me.id, role: me.role, name: me.name, dept: me.dept }, usersQ.data ?? [], deptsQ.data ?? []) : new Set<string>();
  const live = (tasksQ.data ?? []).find((t) => t?.id === id);
  const task = snap ?? (live && isReviewable(live, names) ? live : undefined);

  const decide = useMutation({
    mutationFn: ({ t, decision, text }: { t: TeamTask; decision: Decision; text: string }) =>
      updateTeamTask(
        t.id,
        decision === 'approve'
          ? { status: 'completed', approvedBy: me?.name ?? '', approvedAt: new Date().toISOString() }
          : { status: 'in_progress', rejectedBy: me?.name ?? '', rejectionNote: text, rejectedAt: new Date().toISOString() },
      ),
  });

  if (!on) return <MissingItem title={TITLE} />;
  if (!task) {
    if (tasksQ.isPending || usersQ.isPending || deptsQ.isPending) return <DetailSkeleton title={TITLE} />;
    return <MissingItem title={TITLE} />;
  }

  const who = str(task.assignee) || 'Someone';
  const worked = workedSeconds(task);
  const code = codeOf(task, bookingsQ.data, projectsQ.data);
  const booked = bookedHoursOf(task);
  const times = task.startTime && task.endTime ? `${hmLabel(str(task.startTime))} – ${hmLabel(str(task.endTime))}` : '';
  const close = () => {
    setReturning(false);
    router.back();
  };
  const run = (decision: Decision, text: string) =>
    decide.mutate(
      { t: task, decision, text },
      {
        onSuccess: () => {
          setSnap(task);
          noteDecision(`task:${task.id}`, me?.id, decision);
          setReturning(false);
          void Promise.all(taskWriteKeys(me?.id).map((queryKey) => qc.invalidateQueries({ queryKey })));
          outcome.show(
            {
              decision,
              title: decision === 'approve' ? 'Task approved' : 'Task sent back',
              subtitle: decision === 'approve' ? doneNotice(task) : `It’s back in ${who}’s My tasks${text ? ' with your note' : ''}.`,
              rows: [
                { key: 'who', label: 'From', value: who },
                { key: 'task', label: 'Task', value: str(task.title) || 'Task' },
                outcomeStatus(decision, { reject: 'Sent back' }),
              ],
            },
            decision === 'reject',
          );
        },
        onError: (e) => explainDecisionError(e, close),
      },
    );

  return (
    <>
      <DecisionScreen
        title={TITLE}
        decision={
          !outcome.done
            ? {
                onApprove: () => run('approve', ''),
                onReject: () => {
                  setNote('');
                  setReturning(true);
                },
                approving: decide.isPending && decide.variables?.decision === 'approve',
                disabled: decide.isPending,
                rejectLabel: 'Send back',
                note: doneNotice(task),
              }
            : null
        }>
        <SummaryHero
          icon={ClipboardCheck}
          module="tasks"
          label={taskRef(task) ? `${taskRef(task)} · Time worked` : 'Time worked'}
          figure={
            <Text variant="numeral" color={palette.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} tabular accessibilityLabel={`${workedLabel(worked)} worked`}>
              {workedLabel(worked)}
            </Text>
          }
          sub={str(task.title) || undefined}
          info={booked != null ? { label: 'Booked', value: `${booked}h` } : undefined}
        />
        <WhoCards from={requesterItem(who, sentLine(str(task.completedAt || task.lastEndedAt) || null, now))} to={deciderItem({ mine: true, me: me?.name, role: 'Reviewer' })} />
        {task.completionRemarks ? <NoteCard label="Their note" text={str(task.completionRemarks)} /> : null}
        {task.rejectionNote ? <NoteCard label="Sent back earlier" text={str(task.rejectionNote)} tone="warning" /> : null}
        <DetailsCard
          status={outcome.done ? (outcome.done.decision === 'approve' ? { label: 'Approved', tone: 'done' } : { label: 'Sent back', tone: 'failed' }) : { label: 'Waiting for you', tone: 'pending' }}
          fields={[
            { label: 'Project code', value: code },
            { label: 'Date', value: dueText({ due: workDate(task), time: '' }, today) },
            { label: 'Time', value: times },
            { label: 'Given by', value: str(task.creator) },
          ]}
        />
        {task.desc ? <NoteCard label="Details" text={str(task.desc)} /> : null}
      </DecisionScreen>
      <RejectSheet
        visible={returning}
        onClose={() => setReturning(false)}
        title="Send it back?"
        subtitle={`It goes back to In progress in ${who}’s My tasks. No message is sent.`}
        note={note}
        onChangeNote={setNote}
        minLength={0}
        placeholder="What needs to change"
        busy={decide.isPending}
        confirmLabel="Send back"
        onSubmit={() => run('reject', note.trim())}
      />
      <DecidedSheet outcome={outcome.done} visible={outcome.open} onDone={close} />
    </>
  );
}
