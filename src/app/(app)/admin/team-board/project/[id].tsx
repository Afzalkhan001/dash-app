// One Team board project (web: ProjectDetailModal, dash.html:14302).
//
//   [ hero: name, code, lead, priority, status, dates ]
//   [ Total · Done · In progress · Overdue · Logged ]   trackable tasks only (bare Works don't count)
//   Teams        assign one of the department's teams; Unassign (ConfirmSheet — existing tasks keep
//                their assignee, but new work can't go to that team's people here)
//   Work items   top-level tasks, "2/5 done"; Add work; tap → the work and its sub works
// Header: Edit, Delete (ConfirmSheet + swipe: the project, all its tasks and its team links go).
// Nothing here messages anyone.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FolderKanban, ListPlus, Pencil, Trash2, UsersRound, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import {
  assignProjectTeam,
  deleteProject,
  tbKeys,
  type TrProjectTeam,
  unassignProjectTeam,
  useTrProject,
  useTrProjectTasks,
  useTrTeams,
} from '@/api/teamboard';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { useNow } from '@/features/tasks/live-timer';
import { type Board, BoardGate } from '@/features/teamboard/gate';
import { hoursLabel, isRunningTr, isTrackable, liveSeconds, plainCount, PRIORITY_LABEL, projectPill, taskIsOverdue } from '@/features/teamboard/model';
import { projectFormHref, workHref } from '@/features/teamboard/links';
import { useTrTaskActions } from '@/features/teamboard/task-actions';
import { WorkSheet } from '@/features/teamboard/work-sheet';
import { dateLabel } from '@/lib/dates';
import { palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  haptic,
  IconButton,
  ListCard,
  ListRow,
  MenuSheet,
  MetricRow,
  NavHeader,
  Screen,
  SectionHeader,
  SelectField,
  Skeleton,
  StatGrid,
  StatTile,
  StatusPill,
  SummaryCard,
  SummaryHero,
  Text,
  toast,
} from '@/ui';

export default function ProjectRoute() {
  return <BoardGate title="Project">{(b) => <ProjectScreen board={b} />}</BoardGate>;
}

function ProjectScreen({ board }: { board: Board }) {
  const router = useRouter();
  const qc = useQueryClient();
  const uid = useSession((s) => s.user?.id);
  const me = useSession((s) => s.user);
  const today = useTodayIst();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === 'string' ? rawId : '';
  const dept = board.dept;
  const projectQ = useTrProject(id);
  const tasksQ = useTrProjectTasks(id);
  const deptTeamsQ = useTrTeams(dept.id);
  const [pickTeam, setPickTeam] = useState<string | null>(null);
  const [unassigning, setUnassigning] = useState<TrProjectTeam | null>(null);
  const [unassignOpen, setUnassignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const tasks = tasksQ.data ?? [];
  const works = tasks.filter((t) => !t.parent_task_id);
  const subsOf = (wid: string) => tasks.filter((t) => t.parent_task_id === wid);
  const trackable = tasks.filter(isTrackable);
  const now = useNow(trackable.some(isRunningTr), 1000);
  const actions = useTrTaskActions({
    board: true,
    dept: dept.id,
    subCount: (t) => subsOf(t.id).length,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: tbKeys.all(uid) });

  const assign = useMutation({
    mutationFn: (teamId: string) => assignProjectTeam(id, teamId),
    onSuccess: () => {
      haptic.success();
      setPickTeam(null);
      toast.show('Team assigned', 'success');
      void refresh();
    },
    onError: (e) => {
      haptic.error();
      toast.show(e.message, 'danger');
    },
  });
  const unassign = useMutation({
    mutationFn: (t: TrProjectTeam) => unassignProjectTeam(id, t.team_id),
    onSuccess: () => {
      haptic.success();
      setUnassignOpen(false);
      toast.show('Team unassigned', 'success');
      void refresh();
    },
    onError: () => haptic.error(),
  });
  const remove = useMutation({
    mutationFn: () => deleteProject(id),
    onSuccess: () => {
      haptic.success();
      setDeleteOpen(false);
      toast.show('Project deleted', 'success');
      void refresh();
      router.back();
    },
    onError: () => haptic.error(),
  });

  const p = projectQ.data?.project;
  const header = (
    <NavHeader
      title="Project"
      actions={
        p
          ? [
              {
                icon: Pencil,
                label: 'Edit project',
                onPress: () => router.push(projectFormHref(dept.id, id)),
              },
              {
                icon: Trash2,
                label: 'Delete project',
                onPress: () => {
                  remove.reset();
                  setDeleteOpen(true);
                },
              },
            ]
          : undefined
      }
    />
  );

  if (projectQ.isPending) {
    return (
      <Screen header={header}>
        <Skeleton height={180} radius={radius.xxl} />
        <Skeleton height={120} radius={radius.xl} />
      </Screen>
    );
  }
  if (projectQ.isError || !p) {
    return (
      <Screen header={header}>
        <ErrorState message={projectQ.error?.message ?? 'This project is gone. It may have been deleted.'} onRetry={() => void projectQ.refetch()} />
      </Screen>
    );
  }

  const teams = projectQ.data?.teams ?? [];
  const assigned = new Set(teams.map((t) => t.team_id));
  const available = (deptTeamsQ.data ?? []).filter((t) => !assigned.has(t.id));
  const pill = projectPill(p, today);
  const done = trackable.filter((t) => t.status === 'done').length;
  const overdue = trackable.filter((t) => taskIsOverdue(t, today)).length;
  const logged = trackable.reduce((s, t) => s + liveSeconds(t, now), 0);
  const active = tasks.filter((t) => t.status !== 'done').length;
  const dates = [p.start_date ? `Starts ${dateLabel(p.start_date, today)}` : '', p.due_date ? `Due ${dateLabel(p.due_date, today)}` : '']
    .filter(Boolean)
    .join(' · ');
  const menuTask = menuId ? works.find((t) => t.id === menuId) : undefined;

  return (
    <Screen header={header} onRefresh={() => refresh()}>
      <SummaryHero icon={FolderKanban} module="tasks" label={dept.name} sub={dates || undefined}>
        <View style={styles.heroText}>
          <Text variant="title" color={palette.ink} numberOfLines={3}>
            {p.name}
          </Text>
          {p.description ? (
            <Text variant="label" muted numberOfLines={4}>
              {p.description}
            </Text>
          ) : null}
          <View style={styles.pills}>
            <StatusPill label={pill.label} tone={pill.tone} />
            <StatusPill
              label={`${PRIORITY_LABEL[p.priority]} priority`}
              tone={p.priority === 'urgent' ? 'failed' : p.priority === 'high' ? 'pending' : 'neutral'}
            />
          </View>
        </View>
      </SummaryHero>
      <SummaryCard
        hideEmpty
        rows={[
          { key: 'lead', label: 'Lead', value: p.lead_name || '—' },
          { key: 'code', label: 'Project code', value: p.keka_code || null },
          { key: 'logged', label: 'Time logged', value: hoursLabel(logged) },
        ]}
      />

      <StatGrid columns={2}>
        <StatTile variant="light" label="Tasks" value={trackable.length} module="tasks" />
        <StatTile variant="light" label="Done" value={done} module="tasks" />
        <StatTile variant="light" label="In progress" value={trackable.filter((t) => t.status === 'in_progress').length} module="tasks" />
        <StatTile variant="light" label="Overdue" value={overdue} valueColor={overdue ? palette.dangerInk : undefined} />
      </StatGrid>

      <SectionHeader title={`Teams (${teams.length})`} />
      {teams.length ? (
        <ListCard>
          {teams.map((t) => (
            <ListRow
              key={t.id}
              left={<UsersRound size={20} color={palette.textMuted} />}
              title={t.team_name || 'Team'}
              subtitle={t.team_status === 'archived' ? 'Archived: its people can’t get new work here' : null}
              right={
                <IconButton
                  accessibilityLabel={`Unassign ${t.team_name || 'this team'}`}
                  onPress={() => {
                    unassign.reset();
                    setUnassigning(t);
                    setUnassignOpen(true);
                  }}>
                  <X size={18} color={palette.dangerInk} />
                </IconButton>
              }
            />
          ))}
        </ListCard>
      ) : (
        <Text variant="label" muted>
          No teams yet. Assign one before giving out tasks.
        </Text>
      )}
      <View style={styles.assignRow}>
        <View style={styles.flex}>
          <SelectField
            label="Assign a team"
            value={pickTeam}
            options={available.map((t) => ({
              value: t.id,
              label: t.name,
              hint: t.status === 'archived' ? 'Archived' : undefined,
            }))}
            onChange={setPickTeam}
            placeholder={available.length ? 'Pick a team' : 'Every team is on it already'}
            disabled={!available.length}
          />
        </View>
        <Button title="Assign" variant="accent" size="md" disabled={!pickTeam} loading={assign.isPending} onPress={() => pickTeam && assign.mutate(pickTeam)} />
      </View>

      <SectionHeader
        title={`Work items (${works.length})`}
        actionLabel="Add work"
        onAction={() => setWorkOpen(true)}
        actionAccessibilityLabel="Add a work item"
      />
      {tasksQ.isPending && !tasksQ.data ? (
        <Skeleton height={120} radius={radius.xl} />
      ) : tasksQ.isError && !tasksQ.data ? (
        <ErrorState message={tasksQ.error?.message ?? ''} onRetry={() => void tasksQ.refetch()} />
      ) : works.length ? (
        <View style={styles.list}>
          {works.map((w) => {
            const subs = subsOf(w.id);
            const subDone = subs.filter((s) => s.status === 'done').length;
            return (
              <MetricRow
                key={w.id}
                label={w.title || 'Untitled work'}
                sub={[w.assignee_name, w.description].filter(Boolean).join(' · ') || null}
                value={subs.length ? subDone : '—'}
                total={subs.length || null}
                unit={subs.length ? 'done' : undefined}
                module="tasks"
                status={subs.length ? (subDone === subs.length ? { label: 'All done', tone: 'done' } : null) : { label: 'No sub works', tone: 'neutral' }}
                onPress={() => router.push(workHref(dept.id, id, w.id))}
                onMore={() => {
                  setMenuId(w.id);
                  setMenuOpen(true);
                }}
                accessibilityLabel={`${w.title}, ${subs.length ? `${subDone} of ${plainCount(subs.length, 'sub work')} done` : 'no sub works yet'}`}
                hint="Opens the work and its sub works"
              />
            );
          })}
        </View>
      ) : (
        <EmptyState
          icon={<ListPlus color={palette.textMuted} />}
          title="No work items yet"
          message="Add one, then break it into sub works and give those to people on this project’s teams."
          action={<Button title="Add work" variant="accent" size="md" onPress={() => setWorkOpen(true)} />}
        />
      )}

      <WorkSheet visible={workOpen} onClose={() => setWorkOpen(false)} projectId={id} />
      <MenuSheet
        visible={menuOpen && !!menuTask}
        onClose={() => setMenuOpen(false)}
        title={menuTask?.title || 'Work'}
        items={
          menuTask
            ? actions.menu(menuTask, {
                open: () => router.push(workHref(dept.id, id, menuTask.id)),
                openLabel: 'Open work',
              })
            : []
        }
      />
      {actions.ui}

      {unassigning ? (
        <ConfirmSheet
          visible={unassignOpen}
          onClose={() => setUnassignOpen(false)}
          title="Unassign this team?"
          from={{
            title: unassigning.team_name || 'Team',
            subtitle: 'Team',
            icon: UsersRound,
            module: 'tasks',
          }}
          to={{
            title: p.name,
            subtitle: 'Leaves this project',
            icon: FolderKanban,
            module: 'tasks',
          }}
          confirmLabel="Swipe to unassign"
          onConfirm={() => unassign.mutate(unassigning)}
          loading={unassign.isPending}
          note="The team and its people stay as they are. No one is messaged.">
          {active ? (
            <Banner
              tone="warning"
              title={`${plainCount(active, 'active task')} on this project`}
              message={`Existing tasks keep their assignee, but you can’t give new work here to ${unassigning.team_name || 'this team'}’s people until the team is back.`}
            />
          ) : null}
          {unassign.error ? <Banner tone="danger" title="Couldn’t unassign" message={unassign.error.message} /> : null}
        </ConfirmSheet>
      ) : null}

      <ConfirmSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this project?"
        from={{
          title: 'You',
          subtitle: 'Deleting',
          avatar: { name: me?.name || 'You' },
        }}
        to={{
          title: p.name,
          subtitle: plainCount(tasks.length, 'task'),
          icon: FolderKanban,
          module: 'tasks',
        }}
        detailsTitle="What goes"
        confirmLabel="Swipe to delete"
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        note="Teams and their people are not affected. This can’t be undone. No one is messaged.">
        <SummaryCard
          rows={[
            {
              key: 'tasks',
              label: 'Tasks and sub works',
              value: tasks.length ? `${tasks.length} deleted` : 'None',
            },
            {
              key: 'teams',
              label: 'Team links',
              value: teams.length ? `${teams.length} removed` : 'None',
            },
            { key: 'time', label: 'Logged time', value: hoursLabel(logged) },
          ]}
        />
        {remove.error ? <Banner tone="danger" title="Couldn’t delete it" message={remove.error.message} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  heroText: { gap: space.xs },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.xxs,
  },
  list: { gap: space.sm },
  assignRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
}));
