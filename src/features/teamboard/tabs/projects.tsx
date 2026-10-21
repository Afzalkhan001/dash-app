// Team board › Projects (TeamRosterProjectsSection, dash.html:14102): three figures (Total · Active
// · Overdue), status and priority filters, "New project", and the setup the website keeps here —
// Teams (its "Manage Teams" modal, a screen of its own on the phone) and Task types. Tap a project for
// its teams and work items.

import { useRouter } from 'expo-router';
import { FolderKanban, Plus, Tags, UsersRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { PRIORITIES, PROJECT_STATUSES, type TrPriority, type TrProjectStatus, useTrProjects } from '@/api/teamboard';
import { useTodayIst } from '@/features/attendance/use-now';
import type { Board } from '@/features/teamboard/gate';
import { dueLine, plainCount, PRIORITY_LABEL, PROJECT_STATUS_LABEL, projectIsOverdue, projectPill } from '@/features/teamboard/model';
import { type Choice, ChoiceSheet } from '@/features/teamboard/pickers';
import { projectFormHref, projectHref, teamsHref } from '@/features/teamboard/links';
import { TaskTypesSheet } from '@/features/teamboard/task-types-sheet';
import { priorityDot } from '@/features/teamboard/task-row';
import { palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { ActionRow, Button, Chip, ChipRow, EmptyState, ErrorState, MetricRow, Skeleton, SkeletonList, StatGrid, StatTile, Text } from '@/ui';

export function ProjectsTab({ board }: { board: Board }) {
  const router = useRouter();
  const today = useTodayIst();
  const dept = board.dept;
  const q = useTrProjects(dept.id);
  const [status, setStatus] = useState<TrProjectStatus | ''>('');
  const [priority, setPriority] = useState<TrPriority | ''>('');
  const [picker, setPicker] = useState<'status' | 'priority' | null>(null);
  const [typesOpen, setTypesOpen] = useState(false);

  const all = q.data ?? [];
  const shown = all.filter((p) => (!status || p.status === status) && (!priority || p.priority === priority));
  const overdue = all.filter((p) => projectIsOverdue(p, today)).length;
  const statusChoices: Choice<TrProjectStatus | ''>[] = [
    { value: '', label: 'All statuses' },
    ...PROJECT_STATUSES.map((s) => ({
      value: s,
      label: PROJECT_STATUS_LABEL[s],
    })),
  ];
  const priorityChoices: Choice<TrPriority | ''>[] = [
    { value: '', label: 'All priorities' },
    ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
  ];

  if (q.isPending && !q.data) {
    return (
      <View style={styles.gap}>
        <Skeleton height={110} radius={radius.xl} />
        <SkeletonList rows={3} />
      </View>
    );
  }
  if (q.isError && !q.data) return <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />;

  return (
    <View style={styles.gap}>
      <StatGrid columns={3}>
        <StatTile variant="light" label="Projects" value={all.length} module="tasks" />
        <StatTile variant="light" label="Active" value={all.filter((p) => p.status === 'active').length} module="tasks" />
        <StatTile variant="light" label="Overdue" value={overdue} valueColor={overdue ? palette.dangerInk : undefined} />
      </StatGrid>

      <ActionRow context="screen">
        <Button title="Teams" variant="ghost" size="md" icon={<UsersRound />} onPress={() => router.push(teamsHref(dept.id))} />
        <Button title="Task types" variant="ghost" size="md" icon={<Tags />} onPress={() => setTypesOpen(true)} />
      </ActionRow>

      <ChipRow>
        <Chip label={status ? PROJECT_STATUS_LABEL[status] : 'All statuses'} selected={!!status} onPress={() => setPicker('status')} />
        <Chip label={priority ? PRIORITY_LABEL[priority] : 'All priorities'} selected={!!priority} onPress={() => setPicker('priority')} />
      </ChipRow>

      <View style={styles.addRow}>
        <Text variant="label" muted style={styles.flex}>
          {plainCount(shown.length, 'project')}
        </Text>
        <Button title="New project" variant="accent" size="md" icon={<Plus />} onPress={() => router.push(projectFormHref(dept.id))} />
      </View>

      {!shown.length ? (
        <EmptyState
          icon={<FolderKanban color={palette.textMuted} />}
          title={all.length ? 'No projects match' : 'No projects yet'}
          message={all.length ? 'Try other filters.' : 'Create one and give it a team to start handing out work.'}
        />
      ) : (
        <View style={styles.list}>
          {shown.map((p) => {
            const sub = [p.keka_code, p.lead_name ? `Lead ${p.lead_name}` : '', dueLine(p.due_date, projectIsOverdue(p, today), today)]
              .filter(Boolean)
              .join(' · ');
            return (
              <MetricRow
                key={p.id}
                label={p.name}
                sub={sub || null}
                value={p.team_count}
                unit={p.team_count === 1 ? 'team' : 'teams'}
                dotColor={priorityDot(p.priority)}
                status={projectPill(p, today)}
                onPress={() => router.push(projectHref(dept.id, p.id))}
                accessibilityLabel={[p.name, `${PRIORITY_LABEL[p.priority]} priority`, sub, plainCount(p.team_count, 'team'), projectPill(p, today).label]
                  .filter(Boolean)
                  .join(', ')}
                hint="Opens the project"
              />
            );
          })}
        </View>
      )}

      <ChoiceSheet visible={picker === 'status'} onClose={() => setPicker(null)} title="Status" value={status} choices={statusChoices} onPick={setStatus} />
      <ChoiceSheet
        visible={picker === 'priority'}
        onClose={() => setPicker(null)}
        title="Priority"
        value={priority}
        choices={priorityChoices}
        onPick={setPriority}
      />
      <TaskTypesSheet visible={typesOpen} onClose={() => setTypesOpen(false)} dept={dept} />
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
}));
