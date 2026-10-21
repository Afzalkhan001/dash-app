// One team task (web: ManagerTasksView's detail drawer, dash.html:23218): a light hero with the
// reference and the time worked (ticking while it runs), the person who has it (call them), the
// facts, the description, the completion note and the activity. The bottom bar: Edit and Mark done
// (a swipe that says who is messaged); Delete is the header's bin (a swipe too — it can't be undone).

import { useLocalSearchParams, useRouter } from 'expo-router';
import { CircleCheck, ClipboardList, Pencil, SearchX, Trash2 } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useProjects } from '@/api/reimbursements';
import { type TeamTask, useTeamTasks, useWorkBookings } from '@/api/work';
import { useTodayIst } from '@/features/attendance/use-now';
import { callNumber } from '@/features/people/contact';
import { LiveTimer } from '@/features/tasks/live-timer';
import { dueText, workedLabel, workedSeconds } from '@/features/tasks/model';
import { canSeeTeamTasks } from '@/features/work/access';
import { WorkGate } from '@/features/work/gate';
import { bookedHoursOf, codeOf, isDone, isMyTeamTask, taskEvents, taskRef, teamStatus, userByName, workDate } from '@/features/work/model';
import { useTeamTaskActions } from '@/features/work/task-actions';
import { useWorkTeam } from '@/features/work/use-team';
import { hmLabel, stampLabel } from '@/lib/dates';
import { font, palette, radius, space, type as typeScale } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  AccountRow,
  ActionBar,
  ActionRow,
  Avatar,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  EventTimeline,
  NavHeader,
  Screen,
  Skeleton,
  StatusPill,
  SummaryCard,
  type SummaryItem,
  SummaryHero,
  Text,
} from '@/ui';

export default function TeamTaskRoute() {
  return (
    <WorkGate title="Task" allow={canSeeTeamTasks}>
      <TeamTaskDetail />
    </WorkGate>
  );
}

const str = (v: unknown) => (v == null ? '' : String(v));

function TitledCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card tone="frostStrong" style={styles.card}>
      <Text variant="heading" color={palette.ink} numberOfLines={2} accessibilityRole="header" style={styles.cardTitle}>
        {title}
      </Text>
      {children}
    </Card>
  );
}

function TeamTaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const today = useTodayIst();
  const scope = useWorkTeam();
  const activeQ = useTeamTasks('active');
  const inActive = (Array.isArray(activeQ.data) ? activeQ.data : []).find((t) => t?.id === id);
  // A finished task isn't in the active list: the whole table is read only then.
  const allQ = useTeamTasks('all', !!activeQ.data && !inActive);
  const task: TeamTask | undefined = inActive ?? (Array.isArray(allQ.data) ? allQ.data : []).find((t) => t?.id === id);
  const projectsQ = useProjects();
  const bookingsQ = useWorkBookings();
  const code = (t: TeamTask) => codeOf(t, bookingsQ.data, projectsQ.data);
  const actions = useTeamTaskActions({ code, onDeleted: () => (router.canGoBack() ? router.back() : router.replace('/admin/work/tasks')) });

  const me = scope.me;
  // Only the tasks Team tasks lists are open here (the same isMine rule).
  const visible = !!task && !!me && !scope.loading && isMyTeamTask(task, { id: me.id, name: me.name }, scope.teamNames);
  const loading = activeQ.isPending || (!inActive && allQ.isPending && !!activeQ.data) || scope.loading;
  const failed = (activeQ.isError && !activeQ.data) || (allQ.isError && !allQ.data);

  const header = (
    <NavHeader
      title="Task"
      actions={visible && task ? [{ icon: Trash2, label: 'Delete task', onPress: () => actions.openDelete(task) }] : undefined}
    />
  );

  if (!visible || !task) {
    return (
      <Screen header={<NavHeader title="Task" />} onRefresh={() => Promise.all([activeQ.refetch(), allQ.refetch()])}>
        {loading ? (
          <View style={styles.gap}>
            <Skeleton height={196} radius={radius.xxl} />
            <Skeleton height={184} radius={radius.xl} />
          </View>
        ) : failed ? (
          <ErrorState message={(activeQ.error ?? allQ.error)?.message ?? ''} onRetry={() => void activeQ.refetch()} />
        ) : (
          <EmptyState icon={<SearchX color={palette.textMuted} />} title="Task not found" message="It may have been deleted or given to someone outside your team." />
        )}
      </Screen>
    );
  }

  const st = teamStatus(task, today);
  const worked = workedSeconds(task);
  const started = task.status === 'in_progress' || worked > 0;
  const figure = !started ? undefined : task.status === 'in_progress' ? (
    <LiveTimer task={task} size={44} color={palette.ink} showPaused={false} />
  ) : (
    <Text tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.15} style={styles.worked} accessibilityLabel={`${workedLabel(worked)} worked`}>
      {workedLabel(worked)}
    </Text>
  );
  const person = userByName(scope.users, task.assignee);
  const projectCode = code(task);
  const booked = bookedHoursOf(task);
  const times = task.startTime && task.endTime ? `${hmLabel(str(task.startTime))} – ${hmLabel(str(task.endTime))}` : '';
  const date = dueText({ due: workDate(task), time: times ? '' : str(task.startTime) }, today);
  const facts: SummaryItem[] = [
    ...(date ? [{ key: 'date', label: 'Date', value: date }] : []),
    ...(times ? [{ key: 'time', label: 'Time', value: times, hint: booked != null ? `${booked}h booked` : null }] : []),
    ...(projectCode ? [{ key: 'code', label: 'Project code', value: projectCode }] : []),
    ...(task.creator ? [{ key: 'by', label: 'Created by', value: str(task.creator) }] : []),
    ...(task.createdAt ? [{ key: 'on', label: 'Created', value: stampLabel(str(task.createdAt), today) }] : []),
  ];
  const events = taskEvents(task, workedLabel(worked)).map((e) => ({ ...e, at: e.at ? stampLabel(e.at, today) : undefined }));
  const done = isDone(task);

  return (
    <Screen
      header={header}
      footer={
        <ActionBar>
          <ActionRow context="bar">
            <Button title="Edit" variant="ghost" icon={<Pencil />} onPress={() => actions.edit(task)} />
            {!done ? <Button title="Mark done" variant="primary" icon={<CircleCheck />} onPress={() => actions.openComplete(task)} /> : null}
          </ActionRow>
        </ActionBar>
      }
      onRefresh={() => Promise.all([activeQ.refetch(), inActive ? null : allQ.refetch(), scope.refetch()])}>
      <SummaryHero icon={ClipboardList} module="tasks" label={taskRef(task) || 'Task'} figure={figure}>
        <View style={styles.heroText}>
          <Text variant="heading" color={palette.ink} numberOfLines={4} accessibilityRole="header">
            {str(task.title) || 'Task'}
          </Text>
          <StatusPill label={st.label} tone={st.tone} />
        </View>
      </SummaryHero>

      {task.status === 'submitted' ? (
        <Banner tone="warning" title="Sent for review" message="Approve it or send it back from the Inbox." action={{ label: 'Open Inbox', onPress: () => router.push('/inbox?type=task') }} />
      ) : task.rejectionNote && !done ? (
        <Banner tone="danger" title="Sent back" message={str(task.rejectionNote)} />
      ) : null}

      <AccountRow
        left={<Avatar name={str(task.assignee) || '?'} size={40} ring={false} />}
        title={str(task.assignee) || 'No one yet'}
        sub={person?.jobTitle || 'Assigned to'}
        actionLabel={person?.phone ? 'Call' : 'Edit'}
        onPress={person?.phone ? () => callNumber(person.phone) : () => actions.edit(task)}
        accessibilityLabel={person?.phone ? `Call ${str(task.assignee)}` : `Change who has this task`}
      />

      <SummaryCard rows={facts} />

      {task.desc ? (
        <TitledCard title="Details">
          <Text variant="body" selectable>
            {str(task.desc)}
          </Text>
        </TitledCard>
      ) : null}

      {task.completionRemarks || task.completedBy ? (
        <Banner tone="success" title="Completion note" message={str(task.completionRemarks) || 'No note added.'}>
          {task.completedBy ? (
            <Text variant="caption" muted>
              {[`By ${str(task.completedBy)}`, stampLabel(str(task.completedAt), today)].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </Banner>
      ) : null}

      {events.length ? (
        <TitledCard title="Activity">
          <EventTimeline events={events} />
        </TitledCard>
      ) : null}

      {actions.ui}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  gap: { gap: space.md },
  heroText: { gap: space.xs, alignItems: 'flex-start' },
  worked: { ...typeScale.numeral, fontSize: 44, lineHeight: 50, color: palette.ink },
  card: { gap: space.sm },
  cardTitle: { fontFamily: font.regular, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
}));
