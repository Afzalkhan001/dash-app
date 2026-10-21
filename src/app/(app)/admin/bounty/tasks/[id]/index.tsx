// One bounty task, admin side — the website's board row actions and "View Claims" (dash.html:12863-
// 12895, :13114) on one screen:
//   hero (reward, deadline, status) → the task → people who took part (tap one to check their work)
//   → details. The ••• Manage menu holds Edit, Change reward, Extend deadline, Remind and Cancel task,
//   each only when the website would show it (creator or Master / Super Admin). The App Manager sees
//   the claims read-only, and approves only with Company settings › App Manager approvals on.
// The full task (GET /bounty_tasks/:id, with submissions) loads here; until it lands the light row
// from the board shows, so the screen never waits on a blank.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { BellRing, CalendarClock, Coins, ExternalLink, MoreHorizontal, Paperclip, Pencil, Users, XCircle } from 'lucide-react-native';
import { useState } from 'react';
import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { fetchBountyReference, type BountyTask } from '@/api/bounty';
import { type AdminTask, type RemindPreview, useAdminTask, useAdminTasks } from '@/api/bountyadmin';
import { isApiError } from '@/api/client';
import { useTodayIst } from '@/features/attendance/use-now';
import { openFileSource } from '@/features/bounty/files';
import { useBountyLabels } from '@/features/bounty/hooks';
import { SUBMISSION_ICON } from '@/features/bounty/components';
import {
  claimStatusMeta,
  coins,
  dateTimeLabel,
  deadlineLabel,
  headlineReward,
  num,
  submissionTypeOf,
  SUBMISSION_TYPE_LABEL,
  taskExpired,
  taskStatusMeta,
} from '@/features/bounty/logic';
import { canDecideClaim, canEditTask, canExtendOrCancel, canRemindTask, canReviewTask } from '@/features/bountyadmin/access';
import { PhaseLines } from '@/features/bountyadmin/components';
import { useBountyAdmin } from '@/features/bountyadmin/gate';
import { sortClaims } from '@/features/bountyadmin/logic';
import { CancelTaskSheet, ExtendSheet, loadRemindPreview, RemindSheet, RewardSheet } from '@/features/bountyadmin/task-sheets';
import { MissingItem } from '@/features/inbox/detail';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Banner,
  Card,
  EmptyState,
  type MenuItem,
  MenuSheet,
  NavHeader,
  Screen,
  Skeleton,
  StatusPill,
  SummaryCard,
  SummaryHero,
  Text,
} from '@/ui';

const TITLE = 'Bounty task';
const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

export default function AdminTaskScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = typeof raw === 'string' ? raw : '';
  const router = useRouter();
  const today = useTodayIst();
  const { user, tenant, ready, gates } = useBountyAdmin();
  const { deptName, profLabel } = useBountyLabels();
  const listQ = useAdminTasks(gates.tasks);
  const light = Array.isArray(listQ.data) ? (listQ.data.find((t) => t?.id === id) ?? null) : null;
  const allowed = gates.tasks && (!light || canReviewTask(light, user));
  const fullQ = useAdminTask(id, ready && allowed);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'reward' | 'extend' | 'cancel' | null>(null);
  const [preview, setPreview] = useState<RemindPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [refBusy, setRefBusy] = useState(false);

  if (ready && !allowed) return <Redirect href="/" />;
  const full: AdminTask | null = fullQ.data && typeof fullQ.data === 'object' && fullQ.data.id === id ? fullQ.data : null;
  const task = (full ?? light) as (BountyTask & AdminTask) | null;

  if (!ready || (!task && (listQ.isLoading || fullQ.isLoading))) {
    return (
      <Screen header={<NavHeader title={TITLE} />}>
        <Skeleton height={190} radius={radius.xxl} />
        <Skeleton height={120} radius={radius.xl} />
        <Skeleton height={220} radius={radius.xl} />
      </Screen>
    );
  }
  if (!task) {
    if (fullQ.error) {
      return (
        <Screen header={<NavHeader title={TITLE} />}>
          <Banner tone="danger" title="Couldn’t open this task" message={fullQ.error.message} />
        </Screen>
      );
    }
    return <MissingItem title={TITLE} />;
  }

  const expired = taskExpired(task, today);
  const status = taskStatusMeta(task, today);
  const claims = sortClaims(Array.isArray(task.claims) ? task.claims.filter(Boolean) : []);
  const type = submissionTypeOf(task);
  const cap = num(task.maxAccepts);
  const decide = canDecideClaim(task, user, tenant);
  const items: MenuItem[] = [];
  if (canEditTask(task, user)) {
    items.push({ key: 'edit', label: 'Edit details', icon: Pencil, onPress: () => router.push(`/admin/bounty/tasks/${encodeURIComponent(id)}/edit`) });
    items.push({ key: 'reward', label: 'Change the reward', icon: Coins, onPress: () => setSheet('reward') });
  }
  if (canExtendOrCancel(task, user)) items.push({ key: 'extend', label: 'Extend the deadline', icon: CalendarClock, onPress: () => setSheet('extend') });
  if (canRemindTask(task, user, expired)) {
    items.push({
      key: 'remind',
      label: checking ? 'Checking who to remind…' : 'Remind people',
      hint: 'WhatsApp or email to people who haven’t taken part',
      icon: BellRing,
      disabled: checking,
      onPress: () => {
        setChecking(true);
        void loadRemindPreview(id)
          .then((pv) => setPreview(pv))
          .finally(() => setChecking(false));
      },
    });
  }
  if (canExtendOrCancel(task, user)) items.push({ key: 'cancel', label: 'Cancel task', icon: XCircle, tone: 'danger', onPress: () => setSheet('cancel') });

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

  const only = [deptName(task), task.targetProfType ? `${profLabel(task)} only` : null].filter(Boolean).join(' · ');

  return (
    <>
      <Screen
        header={
          <NavHeader
            title={TITLE}
            actions={items.length ? [{ key: 'manage', icon: MoreHorizontal, label: 'Manage this task', onPress: () => setMenu(true) }] : undefined}
          />
        }
        onRefresh={() => Promise.all([fullQ.refetch(), listQ.refetch()])}>
        <SummaryHero
          icon={SUBMISSION_ICON[type]}
          module="bounty"
          label={`${task.phaseWiseCoins ? 'Reward now' : 'Reward'}${task.category ? ` · ${task.category}` : ''}`}
          value={num(headlineReward(task))}
          unit="coins"
          info={{ label: task.deadline ? (expired ? 'Closed' : 'Due') : 'No deadline', value: task.deadline ? deadlineLabel(task.deadline, today) : undefined }}
          sub={cap ? `${claims.length} of ${cap} people joined` : `${claims.length} joined · no limit`}>
          <StatusPill label={status.label} tone={status.tone} style={{ alignSelf: 'flex-start' }} />
        </SummaryHero>

        {task.cancelledAt ? (
          <Banner tone="danger" title="Cancelled" message={task.cancelReason ? `“${task.cancelReason}”` : 'Coins held for people still working went back to the poster.'} />
        ) : null}
        {gates.overseer && !decide ? (
          <Banner tone="info" title="View only" message="You can see the work sent. Approving is switched off for your role in Company settings." />
        ) : null}

        <Card tone="frostStrong" style={{ gap: space.sm }}>
          <Text variant="heading" accessibilityRole="header">
            {task.title || 'Untitled task'}
          </Text>
          <Text variant="body" selectable>
            {task.desc || 'No description given.'}
          </Text>
          {task.phaseWiseCoins ? <PhaseLines task={task} /> : null}
        </Card>

        <ActivityList title="People who took part">
          {claims.length ? (
            claims.map((c) => {
              const s = claimStatusMeta(task, c);
              const waiting = c.status === 'submitted';
              const opens = waiting || c.status === 'completed' || c.status === 'rejected' || !!c.hasSubmission || !!(c as { submission?: unknown }).submission || (c.status === 'in_progress' && !!c.rejectReason);
              return (
                <ActivityRow
                  key={c.employeeId}
                  person={{ name: c.employeeName || 'Employee' }}
                  title={c.employeeName || 'Employee'}
                  subtitle={
                    waiting
                      ? `Sent ${dateTimeLabel(c.submittedAt, today)}${decide ? ' · tap to check' : ''}`
                      : c.status === 'rejected' && c.rejectReason
                        ? `Rejected: ${c.rejectReason}`
                        : c.status === 'in_progress' && c.rejectReason
                          ? `Sent back: ${c.rejectReason}`
                          : `Joined ${dateTimeLabel(c.claimedAt, today)}`
                  }
                  value={`${coins(c.reward ?? task.reward)} coins`}
                  status={s}
                  onPress={opens ? () => router.push(`/admin/bounty/tasks/${encodeURIComponent(id)}/claims/${encodeURIComponent(c.employeeId)}`) : undefined}
                  chevron={opens}
                />
              );
            })
          ) : (
            <EmptyState icon={<Users color={palette.textMuted} />} title="Nobody yet" message="When someone sends work, it shows up here." />
          )}
        </ActivityList>

        {task.hasReferenceFile || task.referenceFileData || task.referenceUrl ? (
          <ActivityList title="Reference">
            {task.hasReferenceFile || task.referenceFileData ? (
              <ActivityRow
                module="bounty"
                icon={Paperclip}
                title={task.referenceFileName || 'Reference file'}
                subtitle={refBusy ? 'Opening…' : 'Tap to open'}
                disabled={refBusy}
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
                onPress={() => void WebBrowser.openBrowserAsync(withScheme(task.referenceUrl!)).catch(() => {})}
              />
            ) : null}
          </ActivityList>
        ) : null}

        <SummaryCard
          title="Details"
          hideEmpty
          rows={[
            { key: 'send', label: 'They send', value: `${SUBMISSION_TYPE_LABEL[type]}${num(task.maxAttachments) > 1 && type !== 'text' ? ` · up to ${num(task.maxAttachments)}` : ''}` },
            { key: 'pay', label: 'Paying', value: task.requiresApproval === false ? 'At once, no check' : 'After the work is checked' },
            { key: 'only', label: 'Only for', value: only || null },
            { key: 'who', label: 'Who can do it', value: task.eligibility || null },
            { key: 'by', label: 'Posted by', value: task.creatorName || null },
            { key: 'at', label: 'Posted', value: task.createdAt ? dateTimeLabel(task.createdAt, today) : null },
            { key: 'rem', label: 'Last reminder', value: full?.lastRemindedAt ? dateTimeLabel(full.lastRemindedAt, today) : null },
          ]}
        />
      </Screen>

      <MenuSheet visible={menu} onClose={() => setMenu(false)} title="Manage this task" subtitle={task.title} items={items} />
      <RewardSheet task={task} visible={sheet === 'reward'} onClose={() => setSheet(null)} />
      <ExtendSheet task={task} visible={sheet === 'extend'} onClose={() => setSheet(null)} today={today} />
      <CancelTaskSheet task={task} visible={sheet === 'cancel'} onClose={() => setSheet(null)} />
      <RemindSheet task={task} preview={preview} onClose={() => setPreview(null)} />
    </>
  );
}
