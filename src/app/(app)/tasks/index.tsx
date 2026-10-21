// My tasks (web: MyTasks). Everything assigned to me — tasks, IT tickets, asset requests and
// professional bookings — in the Payno / Lendora style:
//
//   [ codes I must read out to someone starting / ending work I raised — only while one is live ]
//   [ light hero: the task running now (its timer, Pause / End task), or how much work is open ]
//   Paused                 MetricRows (soonest first, 5, "Show more")
//   To do                  MetricRows (soonest first: overdue and today on top; 5, "Show more")
//   Waiting for approval   ActivityList (newest 3)
//   Done                   ActivityList (newest 3)
//
// Each open task is a MetricRow: hours worked / booked ("1.5/3 h"), a soft status pill (Overdue,
// Due today, To do, Paused) and a ••• with that task's next steps (Start / Pause / Resume / End task,
// with the same rules as the task's own bottom bar). Tapping a row opens the task.
// Search sits behind the magnifier in the header: while it holds text the groups give way to one
// flat list of every task whose title or project code matches, each with its status.
// Start and End may ask for the requester's 6-digit code (see use-task-flow).
//
// Team board (teamboard domain, PLAN §2.4): someone with Team Roster tasks (the website's "My Team
// Tasks", canSeeMyTeamTasksNav) gets a "My tasks · Team tasks" switch at the top; Team tasks is
// features/teamboard/my-team-tasks. `?view=team` opens on it.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { ListChecks, Pause, Search, SearchX, Square, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useProjects } from '@/api/reimbursements';
import { useDirectoryUsers } from '@/api/support';
import { type Task, useMyProBookings, useMyTasks } from '@/api/tasks';
import { useTodayIst } from '@/features/attendance/use-now';
import { LiveTimer, useNow } from '@/features/tasks/live-timer';
import {
  bookedHours,
  dueState,
  elapsedOf,
  hoursOf,
  hoursText,
  isRunning,
  TASK_GROUPS,
  type TaskGroup,
  taskGroup,
  type TaskRow,
  useRows,
} from '@/features/tasks/model';
import { PendingOtpsCard, useLiveCodes } from '@/features/tasks/pending-otps';
import { rowSubtitle, TaskActivityRow, type TaskFlow, taskIcon, taskMenu, TaskMetricRow } from '@/features/tasks/task-card';
import { useTaskFlow } from '@/features/tasks/use-task-flow';
import { MyTeamTasks } from '@/features/teamboard/my-team-tasks';
import { useTeamTasksGate } from '@/features/teamboard/use-board';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActionRow,
  ActivityList,
  Button,
  EmptyState,
  ErrorState,
  MenuSheet,
  NavHeader,
  PillField,
  Screen,
  SectionHeader,
  Segmented,
  Skeleton,
  SkeletonList,
  StripedProgress,
  SummaryHero,
  Text,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

// How many rows each group shows before "Show more" (which adds MORE at a time).
const FIRST: Record<TaskGroup, number> = {
  in_progress: 5,
  todo: 5,
  waiting: 3,
  done: 3,
};
const MORE = 20;
// Open work is a stack of MetricRows; waiting and done work is a quieter list.
const AS_METRICS: Record<TaskGroup, boolean> = {
  in_progress: true,
  todo: true,
  waiting: false,
  done: false,
};

// Work still to do reads soonest first — overdue and today's on top, then upcoming, undated last —
// so today's work is never hidden behind "Show more". Display order only; the other groups stay
// newest first (the order rows arrive in). Dates are YYYY-MM-DD and times HH:MM, so text order works.
const NO_DATE = '9999-99-99';
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const soonestFirst = (a: TaskRow, b: TaskRow) => cmp(a.due || NO_DATE, b.due || NO_DATE) || cmp(a.time, b.time);
const SOONEST_FIRST: Record<TaskGroup, boolean> = {
  in_progress: true,
  todo: true,
  waiting: false,
  done: false,
};

/** Title or project code contains the search text (as the web's MyTasks search). */
const matches = (r: TaskRow, q: string) => {
  const s = q.trim().toLowerCase();
  return !s || r.title.toLowerCase().includes(s) || r.project.toLowerCase().includes(s);
};

const tasksWord = (n: number) => (n === 1 ? 'task' : 'tasks');

/** The task running right now, as the light hero: its live timer, what it is, and Pause / End task. */
function RunningHero({ task, row, flow, today, onOpen }: { task: Task; row: TaskRow | undefined; flow: TaskFlow; today: string; onOpen: () => void }) {
  const busy = flow.busyId === task.id;
  const sub = row ? rowSubtitle(row, today) : '';
  // Booked work also shows how much of its booked time is used (Payno's limit bar), refreshed twice a minute.
  const booked = row ? bookedHours(row) : null;
  const now = useNow(booked != null, 30_000);
  return (
    <SummaryHero
      icon={taskIcon(row?.category ?? task.category)}
      module="tasks"
      label="Working on"
      onArrowPress={onOpen}
      arrowLabel={`Open ${task.title || 'task'}`}
      figure={<LiveTimer task={task} size={44} color={palette.ink} showPaused={false} />}>
      <View style={styles.heroText}>
        <Text variant="heading" color={palette.ink} numberOfLines={3}>
          {task.title || 'Task'}
        </Text>
        {sub ? (
          <Text variant="label" muted numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {booked != null ? (
        <StripedProgress label="Booked time" used={hoursOf(elapsedOf(task, now))} total={booked} formatValue={hoursText} style={styles.heroProgress} />
      ) : null}
      <ActionRow context="card" style={styles.heroActions}>
        <Button title="Pause" variant="ghost" loading={busy} disabled={!!flow.busyId} icon={<Pause />} onPress={() => flow.act(task.id, 'pause')} />
        <Button title="End task" variant="primary" disabled={!!flow.busyId} icon={<Square />} onPress={() => flow.openComplete(task)} />
      </ActionRow>
    </SummaryHero>
  );
}

export default function MyTasksScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const teamGate = useTeamTasksGate();
  const [view, setView] = useState<'mine' | 'team'>(params.view === 'team' ? 'team' : 'mine');
  const teamView = teamGate.allowed && view === 'team';
  const tasksQ = useMyTasks();
  const bookingsQ = useMyProBookings();
  const projectsQ = useProjects();
  useDirectoryUsers(); // warms the account list the Start/End code check reads
  const flow = useTaskFlow();
  const today = useTodayIst();
  const codes = useLiveCodes();
  const { rows, tasks } = useRows(tasksQ.data, bookingsQ.data, projectsQ.data);
  const [limits, setLimits] = useState(FIRST);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const running = tasks.find(isRunning);
  const anyRunning = !!running;
  const hasData = !!tasksQ.data;
  const query = searchOpen ? q.trim() : '';
  const found = query ? rows.filter((r) => matches(r, query)) : [];
  // The running task is the hero, so it isn't listed again under Paused.
  const groups = TASK_GROUPS.map((g) => {
    const inGroup = rows.filter((r) => taskGroup(r) === g.key && !(running && r.id === String(running.id)));
    return {
      ...g,
      rows: SOONEST_FIRST[g.key] ? inGroup.slice().sort(soonestFirst) : inGroup,
    };
  }).filter((g) => g.rows.length > 0);

  const openWork = groups.filter((g) => AS_METRICS[g.key]).reduce((n, g) => n + g.rows.length, 0);
  const waitingN = groups.find((g) => g.key === 'waiting')?.rows.length ?? 0;
  const overdue = rows.filter((r) => dueState(r, today) === 'overdue').length;
  const dueToday = rows.filter((r) => dueState(r, today) === 'today').length;

  const open = (id: string) => router.push(`/tasks/${encodeURIComponent(id)}`);
  const more = (key: TaskGroup) => setLimits((l) => ({ ...l, [key]: l[key] + MORE }));
  const toggleSearch = () => {
    if (searchOpen) setQ('');
    setSearchOpen((v) => !v);
  };
  const menuRow = menuId ? rows.find((r) => r.id === menuId) : undefined;
  const showMenu = (r: TaskRow) => {
    setMenuId(r.id);
    setMenuOpen(true);
  };

  const hero =
    hasData && !query ? (
      running ? (
        <RunningHero task={running} row={rows.find((r) => r.id === String(running.id))} flow={flow} today={today} onOpen={() => open(String(running.id))} />
      ) : rows.length ? (
        <SummaryHero
          icon={ListChecks}
          module="tasks"
          label="Work to do"
          value={openWork}
          unit={tasksWord(openWork)}
          info={overdue ? { label: 'Overdue', value: String(overdue) } : dueToday ? { label: 'Due today', value: String(dueToday) } : undefined}
          sub={waitingN ? `${waitingN} waiting for approval` : openWork ? undefined : 'All caught up.'}
        />
      ) : null
    ) : null;

  return (
    <Screen
      header={
        <NavHeader
          title="My tasks"
          actions={
            !teamView && hasData && rows.length
              ? [
                  {
                    icon: searchOpen ? X : Search,
                    label: searchOpen ? 'Close search' : 'Search tasks',
                    onPress: toggleSearch,
                  },
                ]
              : undefined
          }
        />
      }
      onRefresh={() => Promise.all([tasksQ.refetch(), bookingsQ.refetch(), teamGate.query.refetch()])}>
      {teamGate.allowed ? (
        <Segmented
          options={[
            { key: 'mine', label: 'My tasks' },
            { key: 'team', label: 'Team tasks' },
          ]}
          value={teamView ? 'team' : 'mine'}
          onChange={setView}
        />
      ) : null}
      {teamView ? <MyTeamTasks /> : null}
      {!teamView && hasData && rows.length && searchOpen ? (
        <PillField
          icon={Search}
          value={q}
          onChangeText={setQ}
          autoFocus
          placeholder="Search tasks or project codes"
          accessibilityLabel="Search tasks or project codes"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      ) : null}

      {/* Each piece below is its own Screen child (not one fragment), so the Screen's gap and staggered
          entrance apply between the code card, the hero and every group.
          Codes someone is waiting for me to read out (also on Home's "Needs you"), only while one is live. */}
      {!teamView && codes.list.length ? <PendingOtpsCard codes={codes} /> : null}

      {teamView ? null : hero}
      {!teamView && tasksQ.isLoading && !hasData ? (
        <View style={styles.loading}>
          <Skeleton height={176} radius={radius.xxl} />
          <SkeletonList rows={4} avatar />
        </View>
      ) : null}
      {!teamView && tasksQ.isError && !hasData ? <ErrorState message={tasksQ.error?.message ?? ''} onRetry={() => tasksQ.refetch()} /> : null}
      {!teamView && hasData && !rows.length ? (
        <EmptyState icon={<ListChecks color={palette.textMuted} />} title="No tasks yet" message="Work assigned to you shows up here." />
      ) : null}

      {!teamView && hasData && query && found.length ? (
        <ActivityList title="Results" overline={found.length === 1 ? '1 task' : `${found.length} tasks`}>
          {found.map((r: TaskRow) => (
            <TaskActivityRow key={r.id} row={r} today={today} showStatus onOpen={() => open(r.id)} />
          ))}
        </ActivityList>
      ) : null}
      {!teamView && hasData && query && !found.length ? (
        <EmptyState
          icon={<SearchX color={palette.textMuted} />}
          title="No tasks found"
          message={`Nothing matches “${query}”.`}
          action={<Button title="Clear search" variant="accent" size="md" onPress={() => setQ('')} />}
        />
      ) : null}

      {!teamView && hasData && !query
        ? groups.map((g) => {
            const shown = g.rows.slice(0, limits[g.key]);
            const left = g.rows.length - shown.length;
            const showMore =
              left > 0 ? <Button title={`Show more (${left})`} variant="text" size="md" onPress={() => more(g.key)} style={styles.more} /> : null;
            if (AS_METRICS[g.key]) {
              return (
                <View key={g.key} style={styles.metricGroup}>
                  <SectionHeader title={g.title} overline={left > 0 ? `${g.rows.length} ${tasksWord(g.rows.length)}` : undefined} />
                  {shown.map((r: TaskRow) => (
                    <TaskMetricRow key={r.id} row={r} today={today} onOpen={() => open(r.id)} onMore={() => showMenu(r)} />
                  ))}
                  {showMore}
                </View>
              );
            }
            return (
              <View key={g.key}>
                <ActivityList title={g.title} overline={left > 0 ? `${g.rows.length} ${tasksWord(g.rows.length)}` : undefined}>
                  {shown.map((r: TaskRow) => (
                    <TaskActivityRow key={r.id} row={r} today={today} onOpen={() => open(r.id)} />
                  ))}
                </ActivityList>
                {showMore}
              </View>
            );
          })
        : null}

      {flow.ui}
      <MenuSheet
        visible={menuOpen && !!menuRow}
        onClose={() => setMenuOpen(false)}
        title={menuRow?.title || 'Task'}
        subtitle={menuRow ? rowSubtitle(menuRow, today) || undefined : undefined}
        items={menuRow ? taskMenu(menuRow, flow, anyRunning, today, () => open(menuRow.id)) : []}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  heroText: { gap: 2 },
  heroActions: { marginTop: space.sm },
  heroProgress: { marginTop: space.xs },
  metricGroup: { gap: space.sm },
  loading: { gap: space.md },
  more: { alignSelf: 'center' },
}));
