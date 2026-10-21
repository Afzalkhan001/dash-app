// One bounty task — what it is, what it pays, when it closes, and the one thing to do next. The
// actions are the website's board actions for the person looking at it (dash.html BountyTasksBoard ~L12547):
//   not taken yet  -> Send your work (accept + send in one call, POST /claim_and_submit)
//   claimed        -> Start task (legacy claims from before one-step submit)
//   in progress    -> Send your work (also a task sent back for changes)
//   waiting / paid / rejected / expired -> status only, plus "View what I sent".
// The task comes from the cached board (there is no per-task read for employees).
//
// Layout: light summary hero (the reward as the big figure, the deadline in its info chip, my status)
// → at most one notice → the task itself (title + what to do) → reference files → reward by order
// (stage-wise rewards) → details (a SummaryCard). The one action sits in the sticky bottom bar.

import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ban, CircleCheck, CircleX, Clock, Download, ExternalLink, FileSearch, FileText, Hourglass, Paperclip, Play, Send, Undo2 } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { type BountyPhase, type BountyTask, fetchBountyReference, startBountyClaim, useBountyTasks } from '@/api/bounty';
import { isApiError } from '@/api/client';
import { useNow } from '@/features/attendance/use-now';
import { openFileSource } from '@/features/bounty/files';
import { useBountyLabels, useMergeBountyTask } from '@/features/bounty/hooks';
import {
  asArray,
  claimReward,
  claimsOf,
  claimStatusMeta,
  claimTimeLeft,
  coins,
  currentPhase,
  deadlineLabel,
  headlineReward,
  myClaimOf,
  num,
  phaseRangeLabel,
  submissionTypeOf,
  SUBMISSION_TYPE_LABEL,
  taskExpired,
  taskStatusMeta,
} from '@/features/bounty/logic';
import { SUBMISSION_ICON } from '@/features/bounty/components';
import { MySubmissionSheet } from '@/features/bounty/submission-sheet';
import { istParts } from '@/lib/dates';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import {
  ActionBar,
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  haptic,
  NavHeader,
  Screen,
  Skeleton,
  StatusPill,
  SummaryCard,
  SummaryHero,
  Text,
  toast,
} from '@/ui';

import { themedStyles } from '@/theme/themed';
const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);
// A reward stage's name in plain words: the website's default "Phase 2" reads "Stage 2" here.
const stageName = (name: unknown, i: number) => (typeof name === 'string' && name.trim() ? name.trim().replace(/^phase\b/i, 'Stage') : `Stage ${i + 1}`);

export default function BountyTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tasksQ = useBountyTasks();
  const { user, deptName, profLabel, canClaim, isCreator } = useBountyLabels();
  const merge = useMergeBountyTask();
  // One clock for the screen: the claim countdown and "expired" both read it, so render stays pure.
  const now = useNow();
  const [showSub, setShowSub] = useState(false);
  const [refBusy, setRefBusy] = useState(false);

  const task = asArray<BountyTask>(tasksQ.data).find((t) => !!t && typeof t === 'object' && t.id === id);

  const start = useMutation({
    mutationFn: async (taskId: string) => {
      const r = await startBountyClaim(taskId);
      if (isApiError(r)) throw new Error(r.error);
      return r;
    },
    onSuccess: (r) => {
      haptic.success();
      merge(r);
      toast.show('Task started');
    },
    onError: (e: Error) => {
      haptic.error();
      Alert.alert('Couldn’t start this task', e.message);
    },
  });

  // "Bounty task", so it never reads as the work item of the same name under My tasks.
  const header = <NavHeader title="Bounty task" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/bounty'));

  if (!task) {
    return (
      <Screen header={header} onRefresh={() => tasksQ.refetch()}>
        {tasksQ.isLoading || tasksQ.isFetching ? (
          <View style={{ gap: space.md }}>
            <Skeleton height={240} radius={radius.xxl} />
            <Skeleton height={120} radius={radius.xl} />
          </View>
        ) : tasksQ.error ? (
          <ErrorState message={tasksQ.error.message} onRetry={() => void tasksQ.refetch()} />
        ) : (
          <EmptyState
            icon={<FileSearch color={palette.textMuted} />}
            title="Task not found"
            message="It may have been removed, or it isn’t open to your team."
            action={<Button title="Go back" variant="accent" size="md" onPress={back} />}
          />
        )}
      </Screen>
    );
  }

  const today = istParts(new Date(now)).date;
  const userId = user?.id;
  const mine = myClaimOf(task, userId);
  const type = submissionTypeOf(task);
  const expired = taskExpired(task, today);
  const phase = currentPhase(task);
  const phases = asArray<BountyPhase>(task.phases).filter((p) => !!p && typeof p === 'object');
  const open = task.status === 'open' && !task.cancelledAt && !expired;
  // No pill for a plain open task: the button at the bottom already says what to do.
  const status = mine ? claimStatusMeta(task, mine) : open ? null : taskStatusMeta(task, today);
  const reward = num(mine ? claimReward(task, mine) : headlineReward(task));
  const only = [deptName(task), profLabel(task)].filter(Boolean).join(' · ');
  const accepted = claimsOf(task).length;
  const maxAccepts = num(task.maxAccepts);
  const maxAttachments = num(task.maxAttachments) || 1;
  const isOwnTask = !!userId && task.creatorId === userId;
  const canSubmitNew = task.status === 'open' && !task.cancelledAt && !expired && !mine && !isOwnTask && canClaim;
  // Accepted claims ('claimed' and 'in_progress') expire 24h after accepting unless the work is sent
  // (server.js processBountyClaimExpiry). Shown once, in the notice under the hero.
  const timeLeft = mine?.status === 'claimed' || mine?.status === 'in_progress' ? claimTimeLeft(mine.claimExpiresAt, now) : null;
  const reviewer = task.creatorName || 'The task owner';

  const openReference = async () => {
    setRefBusy(true);
    try {
      const r = await fetchBountyReference(task.id);
      if (isApiError(r) || !r?.fileData) throw new Error(isApiError(r) ? r.error : 'That file could not be loaded.');
      await openFileSource(r.fileData, r.fileName || task.referenceFileName || 'reference');
    } catch (e) {
      Alert.alert('Reference file', e instanceof Error ? e.message : 'That file could not be loaded.');
    } finally {
      setRefBusy(false);
    }
  };

  // The one action for this person, pinned to the bottom of the screen.
  let footer: ReactNode;
  if (canSubmitNew) {
    footer = (
      <ActionBar note={task.requiresApproval === false ? 'Coins are paid as soon as you send it.' : `${reviewer} checks it, then pays the coins.`}>
        <Button title="Send your work" icon={<Send />} onPress={() => router.push(`/bounty/${encodeURIComponent(task.id)}/submit?direct=1`)} />
      </ActionBar>
    );
  } else if (mine?.status === 'claimed') {
    footer = (
      <ActionBar>
        <Button title="Start task" icon={<Play />} loading={start.isPending} onPress={() => start.mutate(task.id)} />
      </ActionBar>
    );
  } else if (mine?.status === 'in_progress') {
    footer = (
      <ActionBar>
        <Button title="Send your work" icon={<Send />} onPress={() => router.push(`/bounty/${encodeURIComponent(task.id)}/submit`)} />
      </ActionBar>
    );
  }

  const sendAs = `${SUBMISSION_TYPE_LABEL[type] ?? 'Text'}${maxAttachments > 1 && type !== 'text' ? ` · up to ${maxAttachments}` : ''}`;

  return (
    <>
      <Screen header={header} footer={footer} onRefresh={() => tasksQ.refetch()}>
        {/* Hero: what it pays, when it closes, where I stand */}
        <SummaryHero
          icon={SUBMISSION_ICON[type] ?? FileText}
          module="bounty"
          label={`${mine ? 'Your reward' : 'Reward'}${task.category ? ` · ${task.category}` : ''}`}
          value={reward}
          unit="coins"
          info={{ label: task.deadline ? (expired ? 'Closed' : 'Due') : 'No deadline', value: task.deadline ? deadlineLabel(task.deadline, today) : undefined }}
          sub={
            !mine && phase && open
              ? `${phase.remaining != null ? `${phase.remaining} ${phase.remaining === 1 ? 'spot' : 'spots'} left at this reward` : 'No limit at this reward'}${
                  phase.next ? ` · then ${coins(phase.next.coins)} coins` : ''
                }`
              : undefined
          }>
          {status ? <StatusPill label={status.label} tone={status.tone} style={styles.pill} /> : null}
        </SummaryHero>

        {/* Where this person stands (at most one notice) */}
        <ClaimStatus
          mine={mine}
          timeLeft={timeLeft}
          canSubmitNew={canSubmitNew}
          expired={expired}
          cancelled={!!task.cancelledAt}
          full={task.status === 'closed'}
          isOwnTask={isOwnTask}
          canClaim={canClaim}
          isCreator={isCreator}
          role={user?.role}
          reviewer={reviewer}
          reward={reward}
          onViewSubmission={() => setShowSub(true)}
        />

        <Card tone="frostStrong" style={{ gap: space.sm }}>
          <Text variant="heading" accessibilityRole="header">
            {task.title || 'Untitled task'}
          </Text>
          <View style={{ gap: space.xxs }}>
            <Text variant="labelStrong" muted>
              What to do
            </Text>
            <Text variant="body" selectable>
              {task.desc || 'No description given.'}
            </Text>
          </View>
        </Card>

        {task.hasReferenceFile || task.referenceUrl ? (
          <ActivityList title="Reference">
            {task.hasReferenceFile ? (
              <ActivityRow
                module="bounty"
                icon={Paperclip}
                title={task.referenceFileName || 'Reference file'}
                subtitle={refBusy ? 'Opening…' : 'Tap to open'}
                right={refBusy ? <ActivityIndicator color={palette.primaryText} /> : <Download size={18} color={palette.textMuted} strokeWidth={1.8} />}
                disabled={refBusy}
                accessibilityLabel={`Open reference file ${task.referenceFileName || ''}`.trim()}
                onPress={() => void openReference()}
              />
            ) : null}
            {task.referenceUrl ? (
              <ActivityRow
                module="bounty"
                icon={ExternalLink}
                title="Reference link"
                subtitle={task.referenceUrl}
                chevron
                accessibilityLabel={`Open reference link ${task.referenceUrl}`}
                onPress={() => void WebBrowser.openBrowserAsync(withScheme(task.referenceUrl!)).catch(() => {})}
              />
            ) : null}
          </ActivityList>
        ) : null}

        {task.phaseWiseCoins && phases.length ? (
          <Card tone="frostStrong" style={{ gap: space.sm }}>
            <View style={{ gap: 2 }}>
              <Text variant="heading" accessibilityRole="header">
                Reward by order
              </Text>
              <Text variant="caption" muted numberOfLines={2}>
                Your reward is fixed when you join.
              </Text>
            </View>
            <View style={{ gap: space.xxs }}>
              {phases.map((p, i) => {
                const current = !mine && phase?.currentIndex === i && open;
                const name = stageName(p.name, i);
                return (
                  <View
                    key={i}
                    style={[styles.phaseRow, current && styles.phaseRowOn]}
                    accessible
                    accessibilityLabel={`${name}, ${phaseRangeLabel(p)}, ${coins(p.coins)} coins${current ? ', now' : ''}`}>
                    <View style={[styles.phaseDot, { backgroundColor: current ? palette.success : moduleTone.bounty.fg }]} />
                    <View style={styles.flexText}>
                      <Text variant="labelStrong" numberOfLines={1}>
                        {name}
                      </Text>
                      <Text variant="caption" color={current ? palette.successInk : palette.textMuted} numberOfLines={1}>
                        {phaseRangeLabel(p)}
                        {current ? ' · now' : ''}
                      </Text>
                    </View>
                    <Text variant="labelStrong" tabular numberOfLines={1} style={{ flexShrink: 0 }}>
                      {coins(p.coins)} coins
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        ) : null}

        <SummaryCard
          title="Details"
          hideEmpty
          rows={[
            { key: 'spots', label: 'Spots', value: maxAccepts ? `${accepted} of ${maxAccepts} taken` : `${accepted} joined · no limit` },
            { key: 'as', label: 'Send as', value: sendAs },
            { key: 'only', label: 'Only for', value: only || null },
            { key: 'who', label: 'Who can do it', value: task.eligibility || null },
            { key: 'by', label: 'Posted by', value: task.creatorName || null },
          ]}
        />
      </Screen>
      <MySubmissionSheet task={task} visible={showSub} onClose={() => setShowSub(false)} />
    </>
  );
}

function ClaimStatus(p: {
  mine?: ReturnType<typeof myClaimOf>;
  timeLeft: string | null;
  canSubmitNew: boolean;
  expired: boolean;
  cancelled: boolean;
  full: boolean;
  isOwnTask: boolean;
  canClaim: boolean;
  isCreator: boolean;
  role?: string;
  reviewer: string;
  reward: number;
  onViewSubmission: () => void;
}) {
  const { mine } = p;
  const viewSubmission = mine?.hasSubmission ? { label: 'View what I sent', onPress: p.onViewSubmission } : undefined;

  if (mine) {
    switch (mine.status) {
      case 'claimed':
        return (
          <Banner
            tone="warning"
            icon={Clock}
            title="Not started yet"
            message={p.timeLeft ? `Send your work in time, or you lose your spot. ${p.timeLeft}.` : 'Send your work within 24 hours of accepting, or you lose your spot.'}
          />
        );
      case 'in_progress':
        return mine.rejectReason ? (
          <Banner tone="warning" icon={Undo2} title="Sent back for changes" message={mine.rejectReason} action={viewSubmission} />
        ) : (
          <Banner tone="info" icon={Hourglass} title="In progress" message={p.timeLeft ? `${p.timeLeft}.` : 'Send your work when it’s ready.'} action={viewSubmission} />
        );
      case 'submitted':
        return <Banner tone="info" icon={Hourglass} title="Waiting for review" message={`${p.reviewer} will check it.`} action={viewSubmission} />;
      case 'completed':
        return <Banner tone="success" icon={CircleCheck} title={`You earned ${coins(p.reward)} coins`} message="Added to your coins." action={viewSubmission} />;
      case 'rejected':
        return <Banner tone="danger" icon={CircleX} title="Rejected" message={mine.rejectReason || 'Your work was not approved.'} action={viewSubmission} />;
      case 'expired':
        return <Banner tone="danger" icon={Clock} title="Expired" message="Not sent within 24 hours of accepting." />;
      default:
        return null;
    }
  }

  if (p.canSubmitNew) return null;

  // Why there is nothing to do here. A cancelled, closed or full task needs no notice: the hero's
  // pill (Cancelled / Expired / Full) and its "Closed …" line already say so.
  if (p.isOwnTask) return <Banner tone="info" icon={Ban} title="Your task" message="You posted this task. Review the work on the DASH website." />;
  if (p.cancelled || p.expired || p.full || p.canClaim) return null;
  const reason =
    p.role === 'app_manager' ? 'Your role can only view tasks.' : p.isCreator ? 'People who post tasks can’t take part in them.' : 'You can’t take part in this task.';
  return <Banner tone="info" icon={Ban} title="Not open to you" message={reason} />;
}

const styles = themedStyles(() => ({
  flexText: { flex: 1, minWidth: 0 },
  pill: { alignSelf: 'flex-start' },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  phaseRowOn: { backgroundColor: palette.successSoft },
  phaseDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
}));
