// Team tasks (web: ManagerTasksView, dash.html:22977) for admin, manager and app_manager:
//
//   [ light hero: open team work, and "N waiting for your review ›" into the Inbox ]
//   [ chips: Active · Ongoing · Overdue · Due today · Done · All  (the web's KPI cards, with counts) ]
//   [ Done only: an optional "On" date ]
//   MetricRows, newest first (sortTasksNewestFirst), 20 at a time, "Show more"
//
// The open filters read GET /tasks?activeOnly=1; Done and All need the whole table, so it is only
// fetched when one of them is picked. Search (title, person, project code) sits behind the header's
// magnifier. The + in the header (and in the + sheet) assigns a new task. The website's load-time
// "backfill" of booking tasks is a self-heal write and is deliberately not done here.

import { useRouter } from 'expo-router';
import { ClipboardList, Plus, Search, SearchX, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useProjects } from '@/api/reimbursements';
import { type TeamTask, useTeamTasks, useWorkBookings } from '@/api/work';
import { useTodayIst } from '@/features/attendance/use-now';
import { useNow } from '@/features/tasks/live-timer';
import { isRunning } from '@/features/tasks/model';
import { canReviewWork, canSeeTeamTasks } from '@/features/work/access';
import { WorkGate } from '@/features/work/gate';
import { codeOf, FILTERS, isMyTeamTask, matchesFilter, newestFirst, type TaskFilter, workDate } from '@/features/work/model';
import { taskHref, useTeamTaskActions } from '@/features/work/task-actions';
import { TeamTaskRow } from '@/features/work/task-row';
import { useWorkTeam } from '@/features/work/use-team';
import { plural } from '@/lib/format';
import { palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  Button,
  Chip,
  ChipRow,
  DateField,
  EmptyState,
  ErrorState,
  MenuSheet,
  NavHeader,
  PillField,
  Screen,
  Skeleton,
  SkeletonList,
  SummaryHero,
  Text,
} from '@/ui';

const PAGE = 20;

export default function TeamTasksRoute() {
  return (
    <WorkGate title="Team tasks" allow={canSeeTeamTasks}>
      <TeamTasks />
    </WorkGate>
  );
}

function TeamTasks() {
  const router = useRouter();
  const today = useTodayIst();
  const scope = useWorkTeam();
  const [filter, setFilter] = useState<TaskFilter>('active');
  const [doneOn, setDoneOn] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const needsAll = FILTERS.find((f) => f.key === filter)?.needsAll ?? false;
  const activeQ = useTeamTasks('active');
  const allQ = useTeamTasks('all', needsAll);
  const projectsQ = useProjects();
  const bookingsQ = useWorkBookings();
  const listQ = needsAll ? allQ : activeQ;

  const me = scope.me;
  const mine = (list: TeamTask[] | undefined) =>
    me ? (Array.isArray(list) ? list : []).filter((t) => !!t && isMyTeamTask(t, { id: me.id, name: me.name }, scope.teamNames)) : [];
  const active = mine(activeQ.data);
  const all = needsAll ? mine(allQ.data) : [];
  const anyRunning = active.some(isRunning);
  const now = useNow(anyRunning, 30_000);
  const code = (t: TeamTask) => codeOf(t, bookingsQ.data, projectsQ.data);
  const actions = useTeamTaskActions({ code });

  const countOf = (f: TaskFilter) => {
    const src = FILTERS.find((x) => x.key === f)?.needsAll ? (allQ.data ? mine(allQ.data) : null) : active;
    return src ? src.filter((t) => matchesFilter(t, f, today, scope.adminType)).length : undefined;
  };

  const source = needsAll ? all : active;
  const needle = searchOpen ? q.trim().toLowerCase() : '';
  const shown = source
    .filter((t) => matchesFilter(t, filter, today, scope.adminType))
    .filter((t) => filter !== 'completed' || !doneOn || workDate(t) === doneOn)
    .filter((t) => !needle || [t.title, t.assignee, code(t)].some((v) => String(v || '').toLowerCase().includes(needle)))
    .sort(newestFirst);
  const page = shown.slice(0, limit);

  const reviewOn = canReviewWork(scope.access);
  const waiting = reviewOn
    ? active.filter((t) => t.status === 'submitted' && t.source !== 'booking' && t.source !== 'ticket' && scope.reviewNames.has(String(t.assignee || ''))).length
    : 0;
  const openCount = countOf('active') ?? 0;
  const overdue = countOf('overdue') ?? 0;

  const loading = (listQ.isPending || scope.loading) && !listQ.data;
  const failed = (listQ.isError && !listQ.data) || !!scope.error;
  const menuTask = menuId ? source.find((t) => t.id === menuId) : undefined;
  const open = (id: string) => router.push(taskHref(id));
  const pick = (f: TaskFilter) => {
    setFilter(f);
    setLimit(PAGE);
  };
  const toggleSearch = () => {
    if (searchOpen) setQ('');
    setSearchOpen((v) => !v);
  };

  return (
    <Screen
      header={
        <NavHeader
          title="Team tasks"
          actions={[
            { icon: searchOpen ? X : Search, label: searchOpen ? 'Close search' : 'Search team tasks', onPress: toggleSearch },
            { icon: Plus, label: 'Assign a task', onPress: () => router.push('/admin/work/tasks/new') },
          ]}
        />
      }
      onRefresh={() => Promise.all([listQ.refetch(), scope.refetch(), bookingsQ.refetch()])}>
      {searchOpen ? (
        <PillField
          icon={Search}
          value={q}
          onChangeText={setQ}
          autoFocus
          placeholder="Search tasks, people or project codes"
          accessibilityLabel="Search tasks, people or project codes"
          autoCorrect={false}
          returnKeyType="search"
        />
      ) : null}

      {activeQ.data && !scope.loading && !needle ? (
        <SummaryHero
          icon={ClipboardList}
          module="tasks"
          label="Team work open"
          value={openCount}
          unit={openCount === 1 ? 'task' : 'tasks'}
          info={
            waiting
              ? {
                  label: 'Waiting for your review',
                  value: String(waiting),
                  onPress: () => router.push('/inbox?type=task'),
                  accessibilityLabel: `${waiting} waiting for your review. Opens the Inbox`,
                }
              : overdue
                ? { label: 'Overdue', value: String(overdue) }
                : undefined
          }
          sub={scope.team.length ? `${plural(scope.team.length, 'person', 'people')} on your team` : undefined}
        />
      ) : null}

      <ChipRow>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} count={countOf(f.key)} selected={filter === f.key} onPress={() => pick(f.key)} />
        ))}
      </ChipRow>

      {filter === 'completed' ? (
        <View style={styles.dateRow}>
          <View style={styles.flex}>
            <DateField label="Done on" value={doneOn} onChange={setDoneOn} maximumDate={today} placeholder="Any day" />
          </View>
          {doneOn ? <Button title="Any day" variant="text" size="md" onPress={() => setDoneOn(null)} /> : null}
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <Skeleton height={64} radius={radius.xl} />
          <SkeletonList rows={4} />
        </View>
      ) : failed ? (
        <ErrorState message={(listQ.error ?? scope.error)?.message ?? ''} onRetry={() => void Promise.all([listQ.refetch(), scope.refetch()])} />
      ) : !shown.length ? (
        needle ? (
          <EmptyState
            icon={<SearchX color={palette.textMuted} />}
            title="No tasks found"
            message={`Nothing matches “${q.trim()}”.`}
            action={<Button title="Clear search" variant="accent" size="md" onPress={() => setQ('')} />}
          />
        ) : (
          <EmptyState
            icon={<ClipboardList color={palette.textMuted} />}
            title="No tasks in this filter"
            message={scope.team.length ? 'Try another filter, or assign a task with +.' : 'No one on your team yet.'}
          />
        )
      ) : (
        <View style={styles.list}>
          <Text variant="label" muted>
            {plural(shown.length, 'task')}
          </Text>
          {page.map((t) => (
            <TeamTaskRow
              key={t.id}
              task={t}
              code={code(t)}
              today={today}
              now={now}
              onOpen={() => open(t.id)}
              onMore={() => {
                setMenuId(t.id);
                setMenuOpen(true);
              }}
            />
          ))}
          {shown.length > page.length ? (
            <Button title={`Show more (${shown.length - page.length})`} variant="text" size="md" onPress={() => setLimit((n) => n + PAGE)} style={styles.more} />
          ) : null}
        </View>
      )}

      <MenuSheet
        visible={menuOpen && !!menuTask}
        onClose={() => setMenuOpen(false)}
        title={menuTask ? String(menuTask.title || 'Task') : 'Task'}
        subtitle={menuTask ? String(menuTask.assignee || '') || undefined : undefined}
        items={menuTask ? actions.menu(menuTask, () => open(menuTask.id)) : []}
      />
      {actions.ui}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  list: { gap: space.sm },
  loading: { gap: space.md },
  more: { alignSelf: 'center' },
  dateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
}));
