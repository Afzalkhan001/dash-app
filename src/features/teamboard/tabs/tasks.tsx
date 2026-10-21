// Team board › Tasks (TeamRosterTasksSection, dash.html:13948): every trackable task across the
// department's projects — bare Works (no assignee, no parent) are planning containers and stay hidden
// (13971). Four figures (Total · In progress · Overdue · Logged), filters by project, type and
// priority, "Add task" (pick a project first, as the website's disabled-until-picked button), and a
// row per task with its live clock. Start / Pause only on my own tasks; status, edit and delete on any.

import { useRouter } from 'expo-router';
import { ClipboardList, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type TrPriority, PRIORITIES, useTrDeptTasks, useTrProjects } from '@/api/teamboard';
import { useTodayIst } from '@/features/attendance/use-now';
import { useNow } from '@/features/tasks/live-timer';
import type { Board } from '@/features/teamboard/gate';
import { hoursLabel, isRunningTr, isTrackable, liveSeconds, plainCount, PRIORITY_LABEL, taskIsOverdue } from '@/features/teamboard/model';
import { type Choice, ChoiceSheet } from '@/features/teamboard/pickers';
import { taskFormHref } from '@/features/teamboard/links';
import { useTrTaskActions } from '@/features/teamboard/task-actions';
import { TrTaskRow } from '@/features/teamboard/task-row';
import { palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { Button, Chip, ChipRow, EmptyState, ErrorState, MenuSheet, Skeleton, SkeletonList, StatGrid, StatTile, Text } from '@/ui';

type Picker = 'project' | 'type' | 'priority' | 'add' | null;
const PAGE = 25;

export function TasksTab({ board }: { board: Board }) {
  const router = useRouter();
  const today = useTodayIst();
  const dept = board.dept;
  const tasksQ = useTrDeptTasks(dept.id);
  const projectsQ = useTrProjects(dept.id);
  const [project, setProject] = useState('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState<TrPriority | ''>('');
  const [picker, setPicker] = useState<Picker>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const all = (tasksQ.data ?? []).filter(isTrackable);
  const projects = projectsQ.data ?? [];
  const anyRunning = all.some(isRunningTr);
  const now = useNow(anyRunning, 1000);
  const actions = useTrTaskActions({ board: true, dept: dept.id });

  const shown = all.filter((t) => (!project || t.project_id === project) && (!type || t.type === type) && (!priority || t.priority === priority));
  const page = shown.slice(0, limit);
  const overdue = all.filter((t) => taskIsOverdue(t, today)).length;
  const logged = all.reduce((s, t) => s + liveSeconds(t, now), 0);
  const menuTask = menuId ? all.find((t) => t.id === menuId) : undefined;

  const projectName = projects.find((p) => p.id === project)?.name;
  const projectChoices: Choice<string>[] = [
    { value: '', label: 'All projects' },
    ...projects.map((p) => ({
      value: p.id,
      label: p.name,
      sub: p.keka_code || undefined,
    })),
  ];
  const typeChoices: Choice<string>[] = [{ value: '', label: 'All types' }, ...dept.taskTypes.map((t) => ({ value: t, label: t }))];
  const priorityChoices: Choice<TrPriority | ''>[] = [
    { value: '', label: 'All priorities' },
    ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
  ];
  const addChoices: Choice<string>[] = projects.map((p) => ({
    value: p.id,
    label: p.name,
    sub: p.keka_code || undefined,
  }));

  const addTask = () => {
    if (project) router.push(taskFormHref(dept.id, project));
    else setPicker('add');
  };

  if (tasksQ.isPending && !tasksQ.data) {
    return (
      <View style={styles.gap}>
        <Skeleton height={150} radius={radius.xl} />
        <SkeletonList rows={4} />
      </View>
    );
  }
  if (tasksQ.isError && !tasksQ.data) return <ErrorState message={tasksQ.error?.message ?? ''} onRetry={() => void tasksQ.refetch()} />;

  return (
    <View style={styles.gap}>
      <StatGrid columns={2}>
        <StatTile variant="light" label="Total" value={all.length} module="tasks" />
        <StatTile variant="light" label="In progress" value={all.filter((t) => t.status === 'in_progress').length} module="tasks" />
        <StatTile variant="light" label="Overdue" value={overdue} valueColor={overdue ? palette.dangerInk : undefined} />
        <StatTile variant="light" label="Logged" value={hoursLabel(logged)} />
      </StatGrid>

      <ChipRow>
        <Chip label={projectName ?? 'All projects'} selected={!!project} onPress={() => setPicker('project')} />
        <Chip label={type || 'All types'} selected={!!type} onPress={() => setPicker('type')} disabled={!dept.taskTypes.length} />
        <Chip label={priority ? PRIORITY_LABEL[priority] : 'All priorities'} selected={!!priority} onPress={() => setPicker('priority')} />
      </ChipRow>

      <View style={styles.addRow}>
        <Text variant="label" muted style={styles.flex}>
          {plainCount(shown.length, 'task')}
        </Text>
        <Button
          title={projectName ? `Add task to ${projectName}` : 'Add task'}
          variant="accent"
          size="md"
          icon={<Plus />}
          disabled={!projects.length}
          onPress={addTask}
          accessibilityHint={project ? undefined : 'Asks which project first'}
        />
      </View>

      {!shown.length ? (
        <EmptyState
          icon={<ClipboardList color={palette.textMuted} />}
          title={all.length ? 'No tasks match' : 'No tasks yet'}
          message={
            all.length
              ? 'Try other filters.'
              : projects.length
                ? 'Add one with “Add task”, or plan work from a project.'
                : 'No projects in this department yet. Create one in Projects first.'
          }
        />
      ) : (
        <View style={styles.list}>
          {page.map((t) => (
            <TrTaskRow
              key={t.id}
              task={t}
              today={today}
              now={now}
              onOpen={() => actions.edit(t)}
              onMore={() => {
                setMenuId(t.id);
                setMenuOpen(true);
              }}
            />
          ))}
          {shown.length > page.length ? (
            <Button
              title={`Show more (${shown.length - page.length})`}
              variant="text"
              size="md"
              onPress={() => setLimit((n) => n + PAGE)}
              style={styles.more}
            />
          ) : null}
        </View>
      )}

      <ChoiceSheet
        visible={picker === 'project'}
        onClose={() => setPicker(null)}
        title="Project"
        value={project}
        choices={projectChoices}
        onPick={setProject}
      />
      <ChoiceSheet visible={picker === 'type'} onClose={() => setPicker(null)} title="Task type" value={type} choices={typeChoices} onPick={setType} />
      <ChoiceSheet
        visible={picker === 'priority'}
        onClose={() => setPicker(null)}
        title="Priority"
        value={priority}
        choices={priorityChoices}
        onPick={setPriority}
      />
      <ChoiceSheet
        visible={picker === 'add'}
        onClose={() => setPicker(null)}
        title="Add a task to…"
        subtitle="Pick the project first"
        value={null}
        choices={addChoices}
        onPick={(id) => setTimeout(() => router.push(taskFormHref(dept.id, id)), 300)}
      />
      <MenuSheet
        visible={menuOpen && !!menuTask}
        onClose={() => setMenuOpen(false)}
        title={menuTask?.title || 'Task'}
        subtitle={menuTask ? [menuTask.assignee_name, menuTask.project_name].filter(Boolean).join(' · ') : undefined}
        items={menuTask ? actions.menu(menuTask) : []}
      />
      {actions.ui}
    </View>
  );
}

const styles = themedStyles(() => ({
  gap: { gap: space.md },
  list: { gap: space.sm },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  flex: { flex: 1, minWidth: 120 },
  more: { alignSelf: 'center' },
}));
