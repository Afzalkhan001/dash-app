// Inbox › Time correction (/inbox/timefix/<id>) — web: RequestsView's "Time corrections"
// (dash.html:24153; approveCorrTime :24219, rejectCorrTime :24227).
//
//   Approve  PUT /time_corrections/:id {status:'approved', approvedHours, approvedBy, approvedAt} —
//            the hours can be changed first (prefilled with what was asked for, as on the web).
//   Reject   PUT /time_corrections/:id {status:'rejected', rejectedBy, rejectionNote, rejectedAt}.
// The server sends no message for either, and the sheet says so.
//
// On the real server time corrections are saved without a company id, so this queue is usually empty
// (docs/port/manager-work.md §8) — the Inbox shows the chip only when something is waiting.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Timer } from 'lucide-react-native';
import { useState } from 'react';

import type { Decision } from '@/api/inbox';
import { type TimeCorrection, updateTimeCorrection, useTimeCorrections, useWorkDepts, useWorkUsers, workKeys } from '@/api/work';
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
import { sentLine, shortDay } from '@/features/inbox/format';
import type { InboxDetailProps } from '@/features/plugin-types';
import { canReviewWork, reviewTeamNames } from '@/features/work/access';
import { useAccess } from '@/lib/use-access';
import { Card, SummaryHero, TextField } from '@/ui';

const TITLE = 'Time correction';
const str = (v: unknown) => (v == null ? '' : String(v));

export const hoursOfCorrection = (c: Pick<TimeCorrection, 'requestedHours'>) => {
  const n = Number.parseFloat(str(c.requestedHours));
  return Number.isFinite(n) ? n : 0;
};
const hoursText = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}h`;

/** A pending correction from someone in my review team (RequestsView pendingCorrs). */
export const isMyCorrection = (c: TimeCorrection, names: ReadonlySet<string>) => c.status === 'pending' && names.has(str(c.assignee));

export function TimeFixDetail({ id }: InboxDetailProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const me = useSession((s) => s.user);
  const now = useNow();
  const today = useTodayIst();
  const on = canReviewWork(access);
  const q0 = useTimeCorrections(on);
  const usersQ = useWorkUsers(on);
  const deptsQ = useWorkDepts(on);
  const outcome = useOutcome();
  const [snap, setSnap] = useState<TimeCorrection | null>(null);
  const [hours, setHours] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  const names = me ? reviewTeamNames({ id: me.id, role: me.role, name: me.name, dept: me.dept }, usersQ.data ?? [], deptsQ.data ?? []) : new Set<string>();
  const live = (q0.data ?? []).find((c) => c?.id === id);
  const fix = snap ?? (live && isMyCorrection(live, names) ? live : undefined);

  const decide = useMutation({
    mutationFn: ({ c, decision, text, approved }: { c: TimeCorrection; decision: Decision; text: string; approved: number }) =>
      updateTimeCorrection(
        c.id,
        decision === 'approve'
          ? { status: 'approved', approvedHours: approved, approvedBy: me?.name ?? '', approvedAt: new Date().toISOString() }
          : { status: 'rejected', rejectedBy: me?.name ?? '', rejectionNote: text, rejectedAt: new Date().toISOString() },
      ),
  });

  if (!on) return <MissingItem title={TITLE} />;
  if (!fix) {
    if (q0.isPending || usersQ.isPending || deptsQ.isPending) return <DetailSkeleton title={TITLE} />;
    return <MissingItem title={TITLE} />;
  }

  const asked = hoursOfCorrection(fix);
  const typed = hours ?? String(asked || '');
  const approved = Number.parseFloat(typed);
  // The web needs a number to approve (approveCorrTime returns without one); 0 to 24 hours.
  const hoursOk = Number.isFinite(approved) && approved > 0 && approved <= 24;
  const who = str(fix.assignee) || 'Someone';
  const close = () => {
    setRejecting(false);
    router.back();
  };
  const run = (decision: Decision, text: string) =>
    decide.mutate(
      { c: fix, decision, text, approved },
      {
        onSuccess: () => {
          setSnap(fix);
          noteDecision(`timefix:${fix.id}`, me?.id, decision);
          setRejecting(false);
          void qc.invalidateQueries({ queryKey: workKeys.timefix(me?.id) });
          outcome.show(
            {
              decision,
              title: decision === 'approve' ? 'Time approved' : 'Time correction rejected',
              subtitle: 'No message is sent.',
              rows: [
                { key: 'who', label: 'From', value: who },
                { key: 'task', label: 'Task', value: str(fix.taskTitle) || 'Task' },
                ...(decision === 'approve' ? [{ key: 'h', label: 'Approved', value: hoursText(approved) }] : []),
                outcomeStatus(decision),
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
                  setRejecting(true);
                },
                approving: decide.isPending && decide.variables?.decision === 'approve',
                disabled: decide.isPending || !hoursOk,
                note: hoursOk ? `Approves ${hoursText(approved)}. No message is sent.` : 'Enter the hours to approve (up to 24).',
              }
            : null
        }>
        <SummaryHero icon={Timer} module="timesheets" label="Asked for" value={asked} decimals={Number.isInteger(asked) ? 0 : 2} unit="h" sub={str(fix.taskTitle) || undefined} />
        <WhoCards from={requesterItem(who, sentLine(str(fix.createdAt) || null, now))} to={deciderItem({ mine: true, me: me?.name, role: 'Reviewer' })} />
        {fix.reason ? <NoteCard label="Reason" text={str(fix.reason)} /> : null}
        {/* The input the decision uses sits right under the reason; the task title is the hero's line. */}
        {!outcome.done ? (
          <Card tone="frostStrong">
            <TextField
              label="Hours to approve"
              value={typed}
              onChangeText={(t) => setHours(t.replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              maxLength={5}
              hint={`They asked for ${hoursText(asked)}`}
              error={!hoursOk ? 'Enter hours between 0 and 24' : null}
            />
          </Card>
        ) : null}
        <DetailsCard
          status={outcome.done ? (outcome.done.decision === 'approve' ? { label: 'Approved', tone: 'done' } : { label: 'Rejected', tone: 'failed' }) : { label: 'Waiting for you', tone: 'pending' }}
          fields={[
            { label: 'Day', value: fix.taskDate ? shortDay(str(fix.taskDate), today) : '' },
            { label: 'Project', value: str(fix.project) },
          ]}
        />
      </DecisionScreen>
      <RejectSheet
        visible={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject this time correction?"
        subtitle="No message is sent."
        note={note}
        onChangeNote={setNote}
        minLength={0}
        placeholder="Why it can’t be approved"
        busy={decide.isPending}
        onSubmit={() => run('reject', note.trim())}
      />
      <DecidedSheet outcome={outcome.done} visible={outcome.open} onDone={close} />
    </>
  );
}
