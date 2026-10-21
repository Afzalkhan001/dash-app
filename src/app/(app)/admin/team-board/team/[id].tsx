// One team (web: TeamDetailModal, dash.html:13821): its lead and status, its people (add one at a time
// from the department → POST members; Remove → ConfirmSheet), and the projects it is on (read only:
// managed from each project). Header: Edit, Delete (ConfirmSheet + swipe — the team is taken off its
// projects first and its member list goes; people's own profiles and tasks are untouched).
// Nothing here messages anyone.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FolderKanban, Pencil, Trash2, UserRoundMinus, UsersRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { addTeamMembers, deleteTeam, removeTeamMember, tbKeys, type TrProjectStatus, type TrTeamMember, useTrTeam } from '@/api/teamboard';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { PersonPicker } from '@/features/shared/person-picker';
import { type Board, BoardGate } from '@/features/teamboard/gate';
import { teamFormHref } from '@/features/teamboard/links';
import { plainCount, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from '@/features/teamboard/model';
import { useDeptMembers } from '@/features/teamboard/use-board';
import { dateLabel } from '@/lib/dates';
import { palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  Avatar,
  Banner,
  ConfirmSheet,
  ErrorState,
  haptic,
  IconButton,
  ListCard,
  ListRow,
  NavHeader,
  Screen,
  SectionHeader,
  Skeleton,
  StatusPill,
  SummaryCard,
  SummaryHero,
  Text,
  toast,
} from '@/ui';

export default function TeamRoute() {
  return <BoardGate title="Team">{(b) => <TeamScreen board={b} />}</BoardGate>;
}

function TeamScreen({ board }: { board: Board }) {
  const router = useRouter();
  const qc = useQueryClient();
  const uid = useSession((s) => s.user?.id);
  const me = useSession((s) => s.user);
  const today = useTodayIst();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === 'string' ? rawId : '';
  const dept = board.dept;
  const q = useTrTeam(id);
  const people = useDeptMembers(dept);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<TrTeamMember | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: tbKeys.all(uid) });

  const add = useMutation({
    mutationFn: (empId: string) => addTeamMembers(id, [empId]),
    onSuccess: () => {
      haptic.success();
      toast.show('Added to the team', 'success');
      void refresh();
    },
    onError: (e) => {
      haptic.error();
      toast.show(e.message, 'danger');
    },
  });
  const remove = useMutation({
    mutationFn: (m: TrTeamMember) => removeTeamMember(id, m.id),
    onSuccess: () => {
      haptic.success();
      setRemoveOpen(false);
      toast.show('Removed from the team', 'success');
      void refresh();
    },
    onError: () => haptic.error(),
  });
  const del = useMutation({
    mutationFn: () => deleteTeam(id),
    onSuccess: () => {
      haptic.success();
      setDeleteOpen(false);
      toast.show('Team deleted', 'success');
      void refresh();
      router.back();
    },
    onError: () => haptic.error(),
  });

  const team = q.data?.team;
  const header = (
    <NavHeader
      title={team?.name || 'Team'}
      subtitle={dept.name}
      actions={
        team
          ? [
              {
                icon: Pencil,
                label: 'Edit team',
                onPress: () => router.push(teamFormHref(dept.id, id)),
              },
              {
                icon: Trash2,
                label: 'Delete team',
                onPress: () => {
                  del.reset();
                  setDeleteOpen(true);
                },
              },
            ]
          : undefined
      }
    />
  );

  if (q.isPending) {
    return (
      <Screen header={header}>
        <Skeleton height={160} radius={radius.xxl} />
        <Skeleton height={200} radius={radius.xl} />
      </Screen>
    );
  }
  if (q.isError || !team) {
    return (
      <Screen header={header}>
        <ErrorState message={q.error?.message ?? 'This team is gone. It may have been deleted.'} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }

  const members = q.data?.members ?? [];
  const projects = q.data?.projects ?? [];
  const onTeam = new Set(members.map((m) => m.employee_id));

  return (
    <Screen header={header} onRefresh={() => q.refetch()}>
      <SummaryHero
        icon={UsersRound}
        module="tasks"
        label="Team"
        value={members.length}
        unit={members.length === 1 ? 'person' : 'people'}
        sub={team.lead_name ? `Lead ${team.lead_name}` : 'No lead'}>
        <View style={styles.heroText}>
          {team.description ? (
            <Text variant="label" muted numberOfLines={4}>
              {team.description}
            </Text>
          ) : null}
          <StatusPill label={team.status === 'active' ? 'Active' : 'Archived'} tone={team.status === 'active' ? 'done' : 'neutral'} />
        </View>
      </SummaryHero>
      {team.status === 'archived' ? (
        <Banner tone="warning" title="This team is archived" message="Its people can’t be given new work on its projects. Make it active again from Edit." />
      ) : null}

      <SectionHeader
        title={`Members (${members.length})`}
        actionLabel="Add person"
        onAction={() => setAddOpen(true)}
        actionAccessibilityLabel="Add a person to this team"
      />
      {members.length ? (
        <ListCard>
          {members.map((m) => (
            <ListRow
              key={m.id}
              left={<Avatar name={m.employee_name || '?'} size={40} ring={false} />}
              title={m.employee_name || m.employee_id}
              below={team.lead_id && m.employee_id === team.lead_id ? <StatusPill label="Lead" tone="info" /> : undefined}
              right={
                <IconButton
                  accessibilityLabel={`Remove ${m.employee_name || 'this person'} from the team`}
                  onPress={() => {
                    remove.reset();
                    setRemoving(m);
                    setRemoveOpen(true);
                  }}>
                  <UserRoundMinus size={18} color={palette.dangerInk} />
                </IconButton>
              }
            />
          ))}
        </ListCard>
      ) : (
        <Text variant="label" muted>
          No members yet.
        </Text>
      )}
      {add.isPending ? (
        <Text variant="label" muted>
          Adding…
        </Text>
      ) : null}

      <SectionHeader title={`Projects (${projects.length})`} />
      <Text variant="label" muted>
        Managed from each project’s own page, under Projects.
      </Text>
      {projects.length ? (
        <ListCard>
          {projects.map((p) => {
            const st = (Object.keys(PROJECT_STATUS_LABEL) as TrProjectStatus[]).includes(p.status as TrProjectStatus) ? (p.status as TrProjectStatus) : null;
            return (
              <ListRow
                key={p.id}
                left={<FolderKanban size={20} color={palette.textMuted} />}
                title={p.name}
                subtitle={p.due_date ? `Due ${dateLabel(p.due_date, today)}` : null}
                below={st ? <StatusPill label={PROJECT_STATUS_LABEL[st]} tone={PROJECT_STATUS_TONE[st]} /> : undefined}
              />
            );
          })}
        </ListCard>
      ) : (
        <Text variant="label" muted>
          Not on any project yet.
        </Text>
      )}

      <PersonPicker
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add to the team"
        subtitle={dept.name}
        people={people.members}
        loading={people.loading}
        filter={(p) => !onTeam.has(p.id)}
        allowOnLeave
        recentKey="teamboard.member"
        emptyMessage="Everyone in this department is on the team already."
        onPick={(p) => add.mutate(p.id)}
      />

      {removing ? (
        <ConfirmSheet
          visible={removeOpen}
          onClose={() => setRemoveOpen(false)}
          title="Remove from the team?"
          from={{
            title: removing.employee_name || 'This person',
            subtitle: 'Leaves',
            avatar: { name: removing.employee_name || '?' },
          }}
          to={{
            title: team.name,
            subtitle: 'Team',
            icon: UsersRound,
            module: 'tasks',
          }}
          confirmLabel="Swipe to remove"
          onConfirm={() => remove.mutate(removing)}
          loading={remove.isPending}
          note="Their profile and task history are not affected. You can add them back. No one is messaged.">
          {remove.error ? <Banner tone="danger" title="Couldn’t remove them" message={remove.error.message} /> : null}
        </ConfirmSheet>
      ) : null}

      <ConfirmSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this team?"
        from={{
          title: 'You',
          subtitle: 'Deleting',
          avatar: { name: me?.name || 'You' },
        }}
        to={{
          title: team.name,
          subtitle: plainCount(members.length, 'member'),
          icon: UsersRound,
          module: 'tasks',
        }}
        detailsTitle="What goes"
        confirmLabel="Swipe to delete"
        onConfirm={() => del.mutate()}
        loading={del.isPending}
        note="People’s own profiles and task history are not affected. This can’t be undone. No one is messaged.">
        <SummaryCard
          rows={[
            {
              key: 'members',
              label: 'Member list',
              value: members.length ? `${members.length} removed` : 'Empty',
            },
            {
              key: 'projects',
              label: 'Projects',
              value: projects.length ? `Taken off ${plainCount(projects.length, 'project')}` : 'On none',
            },
          ]}
        />
        {del.error ? <Banner tone="danger" title="Couldn’t delete it" message={del.error.message} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  heroText: { gap: space.xs, alignItems: 'flex-start' },
}));
