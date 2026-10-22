// One work item and its sub works (web: WorkDetailModal, dash.html:14560). Params: id, project, dept.
//
//   [ the work's name and description ]                       header: Edit (name + description), Delete
//   Sub works   each a full task: who has it (Unassigned in amber), type, priority, status, due,
//               estimate, time logged / running. Tap → the task form (assign, edit). ••• for Start /
//               Pause (only my own), status, edit, delete. "Add sub work" asks for a name first.
// Deleting the work takes its sub works with it (ConfirmSheet + swipe). Nothing here messages anyone.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { ListPlus, ListTree, Pencil, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useTrProject, useTrProjectTasks } from '@/api/teamboard';
import { useTodayIst } from '@/features/attendance/use-now';
import { useNow } from '@/features/tasks/live-timer';
import { type Board, BoardGate } from '@/features/teamboard/gate';
import { isRunningTr, plainCount } from '@/features/teamboard/model';
import { taskFormHref } from '@/features/teamboard/links';
import { useTrTaskActions } from '@/features/teamboard/task-actions';
import { TrTaskRow, taskSub } from '@/features/teamboard/task-row';
import { WorkSheet } from '@/features/teamboard/work-sheet';
import { palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { Button, EmptyState, ErrorState, MenuSheet, NavHeader, Screen, SectionHeader, Skeleton, SummaryHero, Text } from '@/ui';

export default function WorkRoute() {
  return <BoardGate title="Work">{(b) => <WorkScreen board={b} />}</BoardGate>;
}

function WorkScreen({ board }: { board: Board }) {
  const router = useRouter();
  const today = useTodayIst();
  const params = useLocalSearchParams<{ id: string; project?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const projectId = typeof params.project === 'string' ? params.project : '';
  const dept = board.dept;
  const projectQ = useTrProject(projectId);
  const tasksQ = useTrProjectTasks(projectId);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const tasks = tasksQ.data ?? [];
  const work = tasks.find((t) => t.id === id);
  const subs = tasks.filter((t) => t.parent_task_id === id);
  const now = useNow(subs.some(isRunningTr), 1000);
  const actions = useTrTaskActions({
    board: true,
    dept: dept.id,
    subCount: (t) => tasks.filter((x) => x.parent_task_id === t.id).length,
    onDeleted: (t) => {
      if (t.id === id) router.back();
    },
  });

  const header = (
    <NavHeader
      title={work?.title || 'Work'}
      subtitle={projectQ.data?.project.name || undefined}
      actions={
        work
          ? [
              {
                icon: Pencil,
                label: 'Edit work',
                onPress: () => setEditOpen(true),
              },
              {
                icon: Trash2,
                label: 'Delete work',
                onPress: () =>
                  actions.openDelete({
                    ...work,
                    project_name: projectQ.data?.project.name ?? '',
                  }),
              },
            ]
          : undefined
      }
    />
  );

  // A work item is read through its project (?project=); a link without one has nothing to load.
  if (!projectId) {
    return (
      <Screen header={header}>
        <ErrorState message="Open this work item from its project on the Team board." />
      </Screen>
    );
  }
  if (tasksQ.isPending) {
    return (
      <Screen header={header}>
        <Skeleton height={140} radius={radius.xxl} />
        <Skeleton height={200} radius={radius.xl} />
      </Screen>
    );
  }
  if (tasksQ.isError || !work) {
    return (
      <Screen header={header}>
        <ErrorState message={tasksQ.error?.message ?? 'This work item is gone. It may have been deleted.'} onRetry={() => void tasksQ.refetch()} />
        {actions.ui}
      </Screen>
    );
  }

  const done = subs.filter((s) => s.status === 'done').length;
  const menuTask = menuId ? subs.find((t) => t.id === menuId) : undefined;
  const openTask = (tid: string) => router.push(taskFormHref(dept.id, projectId, { id: tid }));

  return (
    <Screen header={header} onRefresh={() => tasksQ.refetch()}>
      <SummaryHero
        icon={ListTree}
        module="tasks"
        label="Work item"
        value={done}
        unit={`of ${plainCount(subs.length, 'sub work')} done`}
        sub={projectQ.data?.project.name || undefined}>
        <Text variant="label" muted numberOfLines={6}>
          {work.description || 'No description.'}
        </Text>
      </SummaryHero>

      <SectionHeader
        title={`Sub works (${subs.length})`}
        actionLabel="Add sub work"
        onAction={() => setAddOpen(true)}
        actionAccessibilityLabel="Add a sub work"
      />
      {subs.length ? (
        <View style={styles.list}>
          {subs.map((t) => (
            <TrTaskRow
              key={t.id}
              task={t}
              today={today}
              now={now}
              sub={taskSub(t, today, { project: false, parent: false })}
              onOpen={() => openTask(t.id)}
              onMore={() => {
                setMenuId(t.id);
                setMenuOpen(true);
              }}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          icon={<ListPlus color={palette.textMuted} />}
          title="No sub works yet"
          message="Add one, then give it to someone on one of this project’s teams."
          action={<Button title="Add sub work" variant="accent" size="md" onPress={() => setAddOpen(true)} />}
        />
      )}

      <WorkSheet visible={editOpen} onClose={() => setEditOpen(false)} projectId={projectId} work={work} />
      <WorkSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        projectId={projectId}
        parentId={id}
        onDone={(newId) => {
          // Straight on to "who does it", as the website's Assign button.
          if (newId) setTimeout(() => openTask(newId), 350);
        }}
      />
      <MenuSheet
        visible={menuOpen && !!menuTask}
        onClose={() => setMenuOpen(false)}
        title={menuTask?.title || 'Sub work'}
        subtitle={menuTask ? menuTask.assignee_name || 'Unassigned' : undefined}
        items={menuTask ? actions.menu(menuTask, menuTask.assignee_id ? {} : { open: () => openTask(menuTask.id), openLabel: 'Assign' }) : []}
      />
      {actions.ui}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  list: { gap: space.sm },
}));
