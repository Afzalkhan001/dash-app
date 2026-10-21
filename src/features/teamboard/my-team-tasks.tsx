// Team tasks — the assignee's own Team Roster work (web: MyTeamRosterTasksView, dash.html:14757),
// shown in My tasks as the "Team tasks" segment.
//
//   [ hero: the task running now (its clock, Pause) — or how much is open and what is overdue ]
//   [ Total · In progress · Overdue · Logged ]
//   [ All · To do · In progress · Blocked · Done ]
//   a row per task (project, "Part of", type, due, logged vs estimate, status)
// Tap a task for its details, the manager's note, Start / Pause and the status. The server lets an
// assignee change only the status and the clock; nothing else is offered. Nothing messages anyone.

import { KanbanSquare, Pause, Play } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type TrTask, type TrTaskStatus, TASK_STATUSES, useMyTrTasks } from '@/api/teamboard';
import { useTodayIst } from '@/features/attendance/use-now';
import { useNow } from '@/features/tasks/live-timer';
import {
  dueLine,
  hms,
  hoursLabel,
  isRunningTr,
  liveSeconds,
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  taskIsOverdue,
  taskPill,
  timerVerb,
} from '@/features/teamboard/model';
import { useTrTaskActions } from '@/features/teamboard/task-actions';
import { TrTaskRow, taskSub } from '@/features/teamboard/task-row';
import { palette, radius, space, type as typeScale } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  FIELD_LABEL_INSET,
  ActionRow,
  Banner,
  Button,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  MenuSheet,
  Sheet,
  Skeleton,
  SkeletonList,
  StatGrid,
  StatTile,
  StatusPill,
  SummaryCard,
  SummaryHero,
  Text,
} from '@/ui';

type Filter = TrTaskStatus | 'all';

export function MyTeamTasks() {
  const today = useTodayIst();
  const q = useMyTrTasks();
  const tasks = q.data ?? [];
  const running = tasks.find(isRunningTr);
  const now = useNow(!!running, 1000);
  const actions = useTrTaskActions({ board: false });
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  if (q.isPending && !q.data) {
    return (
      <View style={styles.gap}>
        <Skeleton height={170} radius={radius.xxl} />
        <SkeletonList rows={3} />
      </View>
    );
  }
  if (q.isError && !q.data) return <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />;

  const shown = tasks.filter((t) => filter === 'all' || t.status === filter);
  const open = tasks.filter((t) => t.status !== 'done').length;
  const overdue = tasks.filter((t) => taskIsOverdue(t, today)).length;
  const logged = tasks.reduce((s, t) => s + liveSeconds(t, now), 0);
  const detail = openId ? tasks.find((t) => t.id === openId) : undefined;
  const menuTask = menuId ? tasks.find((t) => t.id === menuId) : undefined;

  return (
    <View style={styles.gap}>
      {running ? (
        <SummaryHero
          icon={KanbanSquare}
          module="tasks"
          label="Working on"
          onArrowPress={() => setOpenId(running.id)}
          arrowLabel={`Open ${running.title || 'task'}`}
          figure={
            <Text tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.clock, { color: palette.ink }]}>
              {hms(liveSeconds(running, now))}
            </Text>
          }>
          <View style={styles.heroText}>
            <Text variant="heading" color={palette.ink} numberOfLines={3}>
              {running.title || 'Task'}
            </Text>
            <Text variant="label" muted numberOfLines={2}>
              {taskSub(running, today, { assignee: false })}
            </Text>
          </View>
          <ActionRow context="card" style={styles.heroActions}>
            <Button
              title="Pause"
              variant="ghost"
              icon={<Pause />}
              loading={actions.busyId === running.id}
              disabled={!!actions.busyId}
              onPress={() => actions.toggleTimer(running)}
            />
          </ActionRow>
        </SummaryHero>
      ) : tasks.length ? (
        <SummaryHero
          icon={KanbanSquare}
          module="tasks"
          label="Team work to do"
          value={open}
          unit={open === 1 ? 'task' : 'tasks'}
          info={overdue ? { label: 'Overdue', value: String(overdue) } : undefined}
          sub={open ? 'Tap a task to start its clock.' : 'All done.'}
        />
      ) : null}

      <StatGrid columns={2}>
        <StatTile variant="light" label="Total" value={tasks.length} module="tasks" />
        <StatTile variant="light" label="In progress" value={tasks.filter((t) => t.status === 'in_progress').length} module="tasks" />
        <StatTile variant="light" label="Overdue" value={overdue} valueColor={overdue ? palette.dangerInk : undefined} />
        <StatTile variant="light" label="Logged" value={hoursLabel(logged)} />
      </StatGrid>

      <ChipRow>
        <Chip label="All" selected={filter === 'all'} count={tasks.length} onPress={() => setFilter('all')} />
        {TASK_STATUSES.map((s) => (
          <Chip key={s} label={TASK_STATUS_LABEL[s]} selected={filter === s} count={tasks.filter((t) => t.status === s).length} onPress={() => setFilter(s)} />
        ))}
      </ChipRow>

      {!shown.length ? (
        <EmptyState
          icon={<KanbanSquare color={palette.textMuted} />}
          title={tasks.length ? 'Nothing here' : 'No team tasks yet'}
          message={tasks.length ? 'No tasks with this status.' : 'Work your manager gives you on the team board shows up here.'}
        />
      ) : (
        <View style={styles.list}>
          {shown.map((t) => (
            <TrTaskRow
              key={t.id}
              task={t}
              today={today}
              now={now}
              sub={taskSub(t, today, { assignee: false })}
              onOpen={() => setOpenId(t.id)}
              onMore={() => {
                setMenuId(t.id);
                setMenuOpen(true);
              }}
            />
          ))}
        </View>
      )}

      <TaskDetailSheet task={detail} onClose={() => setOpenId(null)} today={today} now={now} actions={actions} />
      <MenuSheet
        visible={menuOpen && !!menuTask}
        onClose={() => setMenuOpen(false)}
        title={menuTask?.title || 'Task'}
        subtitle={menuTask?.project_name || undefined}
        items={
          menuTask
            ? actions.menu(menuTask, {
                open: () => setTimeout(() => setOpenId(menuTask.id), 420),
                openLabel: 'Open',
              })
            : []
        }
      />
      {actions.ui}
    </View>
  );
}

function TaskDetailSheet({
  task,
  onClose,
  today,
  now,
  actions,
}: {
  task: TrTask | undefined;
  onClose: () => void;
  today: string;
  now: number;
  actions: ReturnType<typeof useTrTaskActions>;
}) {
  const t = task;
  const pill = t ? taskPill(t, today) : null;
  return (
    <Sheet visible={!!t} onClose={onClose} title={t?.title || 'Task'} subtitle={t?.project_name || undefined}>
      {t ? (
        <View style={styles.gap}>
          <View style={styles.pills}>
            {pill ? <StatusPill label={pill.label} tone={pill.tone} /> : null}
            <StatusPill
              label={`${PRIORITY_LABEL[t.priority]} priority`}
              tone={t.priority === 'urgent' ? 'failed' : t.priority === 'high' ? 'pending' : 'neutral'}
            />
          </View>
          {t.description ? <Text variant="body">{t.description}</Text> : null}
          {t.manager_comment ? <Banner tone="warning" title="Note from your manager" message={t.manager_comment} /> : null}
          <SummaryCard
            hideEmpty
            rows={[
              {
                key: 'project',
                label: 'Project',
                value: t.project_name || null,
              },
              { key: 'part', label: 'Part of', value: t.parent_title || null },
              { key: 'type', label: 'Type', value: t.type || null },
              {
                key: 'code',
                label: 'Project code',
                value: t.keka_code || null,
              },
              {
                key: 'due',
                label: 'Due',
                value: t.due_date ? dueLine(t.due_date, taskIsOverdue(t, today), today) : null,
              },
              {
                key: 'est',
                label: 'Estimate',
                value: t.estimated_hours != null ? `${t.estimated_hours}h` : null,
              },
              {
                key: 'logged',
                label: isRunningTr(t) ? 'Running' : 'Time logged',
                value: hms(liveSeconds(t, now)),
              },
            ]}
          />
          {t.status !== 'done' ? (
            <Button
              title={timerVerb(t)}
              variant={isRunningTr(t) ? 'ghost' : 'primary'}
              icon={isRunningTr(t) ? <Pause /> : <Play />}
              loading={actions.busyId === t.id}
              disabled={!!actions.busyId}
              onPress={() => actions.toggleTimer(t)}
              accessibilityHint={isRunningTr(t) ? 'Stops the clock' : 'Starts the clock. Any other running team task pauses.'}
            />
          ) : null}
          <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
            Status
          </Text>
          <ChipRow wrap>
            {TASK_STATUSES.map((s) => (
              <Chip key={s} label={TASK_STATUS_LABEL[s]} selected={t.status === s} disabled={!!actions.busyId} onPress={() => actions.setStatus(t, s)} />
            ))}
          </ChipRow>
          {isRunningTr(t) ? (
            <Text variant="caption" muted>
              Changing the status stops the clock and keeps the time.
            </Text>
          ) : null}
          <Text variant="caption" muted>
            Only your manager can change the other details.
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  gap: { gap: space.md },
  list: { gap: space.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  heroText: { gap: 2 },
  heroActions: { marginTop: space.sm },
  clock: {
    fontFamily: typeScale.numeral.fontFamily,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1.3,
  },
}));
