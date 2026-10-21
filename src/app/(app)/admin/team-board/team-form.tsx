// New team or edit one (web: TeamFormModal 13766, TeamDetailModal's edit form 13866). Params: dept, id.
//
// Create: Name*, Description, Lead, and the first members (people in the department).
// Edit:   Name*, Description, Lead, Active / Archived (an archived team's people can't be given new work).
// A plain Save: nothing here messages anyone.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Save, UserRoundPlus, UserRoundX, X } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { createTeam, tbKeys, type TrTeam, updateTeam, useTrTeam } from '@/api/teamboard';
import { useSession } from '@/auth/session';
import { type PickPerson, PersonPicker } from '@/features/shared/person-picker';
import { type Board, BoardGate } from '@/features/teamboard/gate';
import { MultiPersonSheet } from '@/features/teamboard/pickers';
import { useDeptMembers } from '@/features/teamboard/use-board';
import { radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  AccountRow,
  ActionBar,
  Avatar,
  Banner,
  Button,
  Card,
  Chip,
  ErrorState,
  FieldMessage,
  haptic,
  NavHeader,
  Screen,
  Segmented,
  Skeleton,
  Text,
  TextField,
  toast,
} from '@/ui';

export default function TeamFormRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <BoardGate title={id ? 'Edit team' : 'New team'}>{(b) => <TeamForm board={b} />}</BoardGate>;
}

function TeamForm({ board }: { board: Board }) {
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = typeof params.id === 'string' ? params.id : '';
  const q = useTrTeam(editId, !!editId);
  const header = <NavHeader title={editId ? 'Edit team' : 'New team'} subtitle={board.dept.name} />;
  if (editId && q.isPending) {
    return (
      <Screen header={header}>
        <Skeleton height={320} radius={radius.xl} />
      </Screen>
    );
  }
  if (editId && (q.isError || !q.data)) {
    return (
      <Screen header={header}>
        <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }
  return <Fields key={editId || 'new'} board={board} header={header} team={q.data?.team} />;
}

function Fields({ board, header, team }: { board: Board; header: ReactNode; team: TrTeam | undefined }) {
  const router = useRouter();
  const qc = useQueryClient();
  const uid = useSession((s) => s.user?.id);
  const members = useDeptMembers(board.dept);
  const [name, setName] = useState(team?.name ?? '');
  const [description, setDescription] = useState(team?.description ?? '');
  const [lead, setLead] = useState<{ id: string; name: string } | null>(team?.lead_id ? { id: team.lead_id, name: team.lead_name } : null);
  const [status, setStatus] = useState<'active' | 'archived'>(team?.status ?? 'active');
  const [picked, setPicked] = useState<PickPerson[]>([]);
  const [leadOpen, setLeadOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [tried, setTried] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim(),
        leadId: lead ? lead.id : null,
      };
      return team
        ? updateTeam(team.id, { ...body, status })
        : createTeam(board.dept.id, {
            ...body,
            memberIds: picked.map((p) => p.id),
          });
    },
    onSuccess: () => {
      haptic.success();
      toast.show(team ? 'Team saved' : 'Team created', 'success');
      void qc.invalidateQueries({ queryKey: tbKeys.all(uid) });
      router.back();
    },
    onError: () => haptic.error(),
  });

  return (
    <Screen
      header={header}
      automaticallyAdjustKeyboardInsets
      footer={
        <ActionBar note={tried && !name.trim() ? 'Add a team name' : null}>
          <Button
            title={team ? 'Save changes' : 'Create team'}
            icon={<Save />}
            loading={save.isPending}
            onPress={() => {
              setTried(true);
              if (name.trim()) save.mutate();
            }}
          />
        </ActionBar>
      }>
      <Card style={styles.fields}>
        <TextField
          label="Team name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Edit floor"
          maxLength={120}
          error={tried && !name.trim() ? 'Add a team name' : null}
        />
        <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline maxLength={1000} />
        <View style={styles.part}>
          <Text variant="labelStrong" muted>
            Team lead
          </Text>
          {lead ? (
            <AccountRow
              left={<Avatar name={lead.name} size={40} ring={false} />}
              title={lead.name}
              sub="Lead"
              onPress={() => setLeadOpen(true)}
              accessibilityLabel={`Lead ${lead.name}. Change`}
            />
          ) : (
            <AccountRow icon={UserRoundPlus} module="tasks" title="No lead" sub="Optional" actionLabel="Choose" onPress={() => setLeadOpen(true)} />
          )}
          {lead ? <Button title="No lead" variant="text" size="md" icon={<UserRoundX />} onPress={() => setLead(null)} style={styles.self} /> : null}
        </View>
        {team ? (
          <View style={styles.part}>
            <Text variant="labelStrong" muted>
              Status
            </Text>
            <Segmented
              options={[
                { key: 'active', label: 'Active' },
                { key: 'archived', label: 'Archived' },
              ]}
              value={status}
              onChange={setStatus}
            />
            <FieldMessage hint={status === 'archived' ? 'Its people can’t be given new work on its projects. Tasks they already have stay.' : null} />
          </View>
        ) : (
          <View style={styles.part}>
            <Text variant="labelStrong" muted>
              Members
            </Text>
            {picked.length ? (
              <View style={styles.chips}>
                {picked.map((p) => (
                  <Chip key={p.id} label={p.name} selected icon={<X />} onPress={() => setPicked((l) => l.filter((x) => x.id !== p.id))} />
                ))}
              </View>
            ) : null}
            <Button title="Add people" variant="ghost" size="md" icon={<UserRoundPlus />} onPress={() => setMembersOpen(true)} style={styles.self} />
            <FieldMessage hint="Optional. You can add people later." />
          </View>
        )}
      </Card>
      {save.error ? <Banner tone="danger" title="Couldn’t save" message={save.error.message} /> : null}

      <PersonPicker
        visible={leadOpen}
        onClose={() => setLeadOpen(false)}
        title="Team lead"
        subtitle={board.dept.name}
        people={members.members}
        loading={members.loading}
        allowOnLeave
        selectedId={lead?.id}
        onPick={(p) => setLead({ id: p.id, name: p.name })}
      />
      <MultiPersonSheet
        visible={membersOpen}
        onClose={() => setMembersOpen(false)}
        title="Add people"
        subtitle={board.dept.name}
        people={members.members}
        exclude={new Set(picked.map((p) => p.id))}
        confirmVerb="Pick"
        onConfirm={(list) => {
          setPicked((l) => [...l, ...list]);
          setMembersOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  fields: { gap: space.md },
  part: { gap: space.xs },
  self: { alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
}));
