// Check one person's work on a bounty task — the website's "Claims" modal for one claimant
// (dash.html:13114-13137) as an Inbox-style detail: what it pays, who sent it and when, what they sent,
// then "Swipe to approve & pay" (irreversible: pays the held coins) over a Reject button that asks
// "Send back for changes" or "Reject for good" (dash.html:13147). Used by the route
// /admin/bounty/tasks/<id>/claims/<emp> and by the Inbox kind `bounty-claim` (/inbox/bounty-claim/<id>).
// Who may decide: the task's creator, Master / Super Admin, or the App Manager with the company switch
// (server.js:6563 / 6592). Nobody is messaged by either decision; the person sees it on Bounty rewards.

import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { approveClaim, rejectClaim, useAdminTask, useAdminTasks, useInvalidateBountyAdmin } from '@/api/bountyadmin';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { SUBMISSION_ICON } from '@/features/bounty/components';
import { claimStatusMeta, coins, dateTimeLabel, num, submissionTypeOf, SUBMISSION_TYPE_LABEL } from '@/features/bounty/logic';
import { noteDecision } from '@/features/inbox/decided';
import { DecidedSheet, DecisionScreen, DetailSkeleton, explainDecisionError, MissingItem, outcomeStatus, requesterItem, useOutcome, WhoCards } from '@/features/inbox/detail';
import { space } from '@/theme/tokens';
import { Banner, ConfirmSheet, SectionHeader, Segmented, SummaryCard, SummaryHero, Text, TextField } from '@/ui';

import { canDecideClaim, canReviewTask } from './access';
import { SubmissionView } from './components';
import { useBountyAdmin } from './gate';
import { claimKey } from './logic';

const TITLE = 'Work to check';
type Mode = 'back' | 'final';

export function ClaimReviewScreen({ taskId, employeeId }: { taskId: string; employeeId: string }) {
  const router = useRouter();
  const today = useTodayIst();
  const uid = useSession((s) => s.user?.id);
  const { user, tenant, ready, gates } = useBountyAdmin();
  const invalidate = useInvalidateBountyAdmin();
  const listQ = useAdminTasks(gates.tasks);
  const light = Array.isArray(listQ.data) ? (listQ.data.find((t) => t?.id === taskId) ?? null) : null;
  const allowed = gates.tasks && (!light || canReviewTask(light, user));
  const q = useAdminTask(taskId, ready && allowed);
  const outcome = useOutcome();
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('back');
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  if (ready && !allowed) return <Redirect href="/" />;
  const task = q.data && typeof q.data === 'object' && q.data.id === taskId ? q.data : null;
  if (!ready || (!task && q.isLoading)) return <DetailSkeleton title={TITLE} />;
  if (!task) {
    if (q.error && !(q.error.message || '').match(/not found/i)) {
      return (
        <DecisionScreen title={TITLE}>
          <Banner tone="danger" title="Couldn’t open this" message={q.error.message} />
        </DecisionScreen>
      );
    }
    return <MissingItem title={TITLE} />;
  }
  const claim = (Array.isArray(task.claims) ? task.claims : []).find((c) => c?.employeeId === employeeId);
  if (!claim) return <MissingItem title={TITLE} />;

  const name = claim.employeeName || 'Employee';
  const reward = num(claim.reward ?? task.reward);
  const type = submissionTypeOf(task);
  const waiting = claim.status === 'submitted' && !task.cancelledAt;
  const decide = waiting && canDecideClaim(task, user, tenant) && !outcome.done;
  const status = claimStatusMeta(task, claim);
  const key = claimKey(task.id, employeeId);

  const approve = async () => {
    setApproving(true);
    try {
      await approveClaim(task.id, employeeId);
      noteDecision(`bounty-claim:${key}`, uid, 'approve');
      await invalidate();
      outcome.show({
        decision: 'approve',
        title: 'Approved and paid',
        subtitle: `${coins(reward)} coins went to ${name}. They see it on Bounty rewards.`,
        rows: [outcomeStatus('approve', { approve: 'Paid' }), { key: 'task', label: 'Task', value: task.title }],
      });
    } catch (e) {
      explainDecisionError(e, () => router.back());
    } finally {
      setApproving(false);
    }
  };

  const reject = async () => {
    setRejecting(true);
    try {
      await rejectClaim(task.id, employeeId, reason.trim(), mode === 'back');
      noteDecision(`bounty-claim:${key}`, uid, 'reject');
      await invalidate();
      setRejectOpen(false);
      outcome.show(
        {
          decision: 'reject',
          title: mode === 'back' ? 'Sent back for changes' : 'Rejected',
          subtitle: mode === 'back' ? `${name} can fix it and send it again. The coins stay held.` : `The ${coins(reward)} coins held for ${name} went back to the poster.`,
          rows: [outcomeStatus('reject', { reject: mode === 'back' ? 'Sent back' : 'Rejected' }), { key: 'task', label: 'Task', value: task.title }],
        },
        true,
      );
    } catch (e) {
      setRejectOpen(false);
      explainDecisionError(e, () => router.back());
    } finally {
      setRejecting(false);
    }
  };

  return (
    <>
      <DecisionScreen
        title={TITLE}
        decision={
          decide
            ? {
                onApprove: () => void approve(),
                onReject: () => {
                  setMode('back');
                  setReason('');
                  setRejectOpen(true);
                },
                approving,
                disabled: approving || rejecting,
                approveLabel: 'Approve & pay',
                note: `Pays ${coins(reward)} coins to ${name} now. This can’t be undone.`,
              }
            : null
        }>
        <SummaryHero
          icon={SUBMISSION_ICON[type]}
          module="bounty"
          label="Reward for this work"
          value={reward}
          unit="coins"
          info={{ label: 'Sent', value: claim.submittedAt ? dateTimeLabel(claim.submittedAt, today) : '—' }}
          sub={task.title}
        />
        <WhoCards
          from={requesterItem(name, claim.submittedAt ? 'Sent the work' : 'Took part')}
          to={decide ? { title: 'You', subtitle: 'Check and pay', avatar: { name: user?.name || 'You' } } : { title: task.creatorName || 'Poster', subtitle: status.label, avatar: { name: task.creatorName || 'Poster' } }}
        />
        {!waiting && claim.status === 'rejected' && claim.rejectReason ? <Banner tone="danger" title="Rejected" message={`“${claim.rejectReason}”`} /> : null}
        {claim.status === 'in_progress' && claim.rejectReason ? <Banner tone="warning" title="Sent back for changes" message={`“${claim.rejectReason}”`} /> : null}
        {waiting && !canDecideClaim(task, user, tenant) ? (
          <Banner tone="info" title="View only" message={gates.overseer ? 'Approving is switched off for your role in Company settings.' : 'Only the person who posted this task can check it.'} />
        ) : null}

        {/* A section, not a card: the submission's own cards (text, links, files) sit right under it. */}
        <View style={{ gap: space.sm }}>
          <SectionHeader title="What they sent" />
          <SubmissionView taskId={task.id} claim={claim} type={type} />
        </View>

        <SummaryCard
          title="Details"
          hideEmpty
          rows={[
            { key: 'status', label: 'Status', value: status.label, status: status.tone },
            { key: 'type', label: 'They send', value: SUBMISSION_TYPE_LABEL[type] },
            { key: 'pos', label: 'Joining order', value: task.phaseWiseCoins && claim.position ? `No. ${claim.position}` : null },
            { key: 'joined', label: 'Joined', value: claim.claimedAt ? dateTimeLabel(claim.claimedAt, today) : null },
            { key: 'by', label: 'Posted by', value: task.creatorName || null },
          ]}
        />
      </DecisionScreen>

      <ConfirmSheet
        visible={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Not approving this work"
        subtitle={`${name} · ${task.title}`}
        confirmLabel={mode === 'back' ? 'Swipe to send back' : 'Swipe to reject for good'}
        onConfirm={() => void reject()}
        loading={rejecting}
        note="No message is sent. They see your reason on Bounty rewards.">
        <View style={{ gap: space.md }}>
          <Segmented
            options={[
              { key: 'back', label: 'Send back' },
              { key: 'final', label: 'Reject' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <Text variant="label" muted>
            {mode === 'back'
              ? 'They can fix it and send it again. The coins stay held for them.'
              : `Rejected for good. The ${coins(reward)} coins held for them go back to the poster.`}
          </Text>
          <TextField
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={500}
            counter
            placeholder="What needs to change, or why it can’t be used"
          />
        </View>
      </ConfirmSheet>

      <DecidedSheet outcome={outcome.done} visible={outcome.open} onDone={() => router.back()} />
    </>
  );
}

/** The Inbox detail (`/inbox/bounty-claim/<taskId>~<employeeId>`). */
export function ClaimInboxDetail({ id }: { id: string }) {
  const i = String(id ?? '').lastIndexOf('~');
  if (i <= 0) return <MissingItem title={TITLE} />;
  return <ClaimReviewScreen taskId={id.slice(0, i)} employeeId={id.slice(i + 1)} />;
}
