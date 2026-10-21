// New project or edit one (web: ProjectFormModal 14223 and ProjectDetailModal's edit form 14320).
// Params: dept, id (edit).
//
// Name*, Description, Project code (the website's ProjectSearch: active codes; it stores the label
// it shows, "CODE — Name", and every task under the project inherits it), Lead (someone in the
// department), Priority, Status, Start and Due (due on or after start), and — when creating — the
// department's teams to put on it. A plain Save: nothing here messages anyone.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Save, UserRoundPlus, UserRoundX } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { useProjects } from '@/api/reimbursements';
import {
  createProject,
  PRIORITIES,
  PROJECT_STATUSES,
  tbKeys,
  type TrPriority,
  type TrProject,
  type TrProjectStatus,
  updateProject,
  useTrProject,
  useTrTeams,
} from '@/api/teamboard';
import { useSession } from '@/auth/session';
import { PersonPicker } from '@/features/shared/person-picker';
import { ProjectPicker, projectLabel } from '@/features/shared/project-picker';
import { type Board, BoardGate } from '@/features/teamboard/gate';
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL } from '@/features/teamboard/model';
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
  DateField,
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

export default function ProjectFormRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <BoardGate title={id ? 'Edit project' : 'New project'}>{(b) => <ProjectForm board={b} />}</BoardGate>;
}

function ProjectForm({ board }: { board: Board }) {
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = typeof params.id === 'string' ? params.id : '';
  const q = useTrProject(editId, !!editId);
  const header = <NavHeader title={editId ? 'Edit project' : 'New project'} subtitle={board.dept.name} />;
  if (editId && q.isPending) {
    return (
      <Screen header={header}>
        <Skeleton height={420} radius={radius.xl} />
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
  return <Fields key={editId || 'new'} board={board} header={header} project={q.data?.project} />;
}

function Fields({ board, header, project }: { board: Board; header: ReactNode; project: TrProject | undefined }) {
  const router = useRouter();
  const qc = useQueryClient();
  const uid = useSession((s) => s.user?.id);
  const members = useDeptMembers(board.dept);
  const codesQ = useProjects();
  const teamsQ = useTrTeams(board.dept.id, !project);
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [code, setCode] = useState(project?.keka_code ?? '');
  const [lead, setLead] = useState<{ id: string; name: string } | null>(project?.lead_id ? { id: project.lead_id, name: project.lead_name } : null);
  const [priority, setPriority] = useState<TrPriority>(project?.priority ?? 'medium');
  const [status, setStatus] = useState<TrProjectStatus>(project?.status ?? 'planning');
  const [start, setStart] = useState<string | null>(project?.start_date || null);
  const [due, setDue] = useState<string | null>(project?.due_date || null);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [leadOpen, setLeadOpen] = useState(false);
  const [tried, setTried] = useState(false);

  const codes = codesQ.data ?? [];
  const codeMatch = codes.find((p) => projectLabel(p) === code || (!!p.kekaCode && p.kekaCode === code)) ?? null;
  const blocker = !name.trim() ? 'Add a project name' : start && due && due < start ? 'The due date can’t be before the start' : null;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim(),
        leadId: lead ? lead.id : null,
        priority,
        status,
        startDate: start || null,
        dueDate: due || null,
        kekaCode: code.trim() || null,
      };
      return project ? updateProject(project.id, body) : createProject(board.dept.id, { ...body, teamIds });
    },
    onSuccess: () => {
      haptic.success();
      toast.show(project ? 'Project saved' : 'Project created', 'success');
      void qc.invalidateQueries({ queryKey: tbKeys.all(uid) });
      router.back();
    },
    onError: () => haptic.error(),
  });

  const teams = teamsQ.data ?? [];
  return (
    <Screen
      header={header}
      automaticallyAdjustKeyboardInsets
      footer={
        <ActionBar note={tried ? blocker : null}>
          <Button
            title={project ? 'Save changes' : 'Create project'}
            icon={<Save />}
            loading={save.isPending}
            onPress={() => {
              setTried(true);
              if (!blocker) save.mutate();
            }}
          />
        </ActionBar>
      }>
      <Card style={styles.fields}>
        <TextField
          label="Project name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Q3 brand campaign"
          maxLength={160}
          error={tried && !name.trim() ? 'Add a project name' : null}
        />
        <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline maxLength={2000} />
        <ProjectPicker
          value={codeMatch}
          onChange={(p) => setCode(p ? projectLabel(p) : '')}
          projects={codes}
          loading={codesQ.isPending}
          module="tasks"
          hint={
            code && !codeMatch
              ? `Now: ${code}. Pick another to change it.`
              : 'Optional. Every task under this project takes this code, and its logged time counts against it.'
          }
        />
        {code ? <Button title="No project code" variant="text" size="md" onPress={() => setCode('')} style={styles.self} /> : null}
        <View style={styles.part}>
          <Text variant="labelStrong" muted>
            Project lead
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
        <View style={styles.part}>
          <Text variant="labelStrong" muted>
            Priority
          </Text>
          <Segmented
            options={PRIORITIES.map((p) => ({
              key: p,
              label: PRIORITY_LABEL[p],
            }))}
            value={priority}
            onChange={setPriority}
          />
        </View>
        <View style={styles.part}>
          <Text variant="labelStrong" muted>
            Status
          </Text>
          <Segmented
            options={PROJECT_STATUSES.map((s) => ({
              key: s,
              label: PROJECT_STATUS_LABEL[s],
            }))}
            value={status}
            onChange={setStatus}
          />
        </View>
        <View style={styles.row}>
          <View style={styles.flex}>
            <DateField label="Start" value={start} onChange={setStart} placeholder="Not set" />
          </View>
          {start ? <Button title="Clear" variant="text" size="md" onPress={() => setStart(null)} /> : null}
        </View>
        <View style={styles.row}>
          <View style={styles.flex}>
            <DateField
              label="Due"
              value={due}
              onChange={setDue}
              minimumDate={start ?? undefined}
              placeholder="Not set"
              error={tried && start && due && due < start ? 'Due can’t be before the start' : null}
            />
          </View>
          {due ? <Button title="Clear" variant="text" size="md" onPress={() => setDue(null)} /> : null}
        </View>
        {!project ? (
          <View style={styles.part}>
            <Text variant="labelStrong" muted>
              Teams on this project
            </Text>
            {teams.length ? (
              <View style={styles.chips}>
                {teams.map((t) => {
                  const on = teamIds.includes(t.id);
                  return <Chip key={t.id} label={t.name} selected={on} onPress={() => setTeamIds((l) => (on ? l.filter((x) => x !== t.id) : [...l, t.id]))} />;
                })}
              </View>
            ) : null}
            <FieldMessage
              hint={
                teamsQ.isPending
                  ? 'Loading teams…'
                  : teams.length
                    ? 'Optional. You can add teams later.'
                    : 'No teams in this department yet. Create one from Projects › Teams, or add it later.'
              }
            />
          </View>
        ) : null}
      </Card>
      {save.error ? <Banner tone="danger" title="Couldn’t save" message={save.error.message} /> : null}

      <PersonPicker
        visible={leadOpen}
        onClose={() => setLeadOpen(false)}
        title="Project lead"
        subtitle={board.dept.name}
        people={members.members}
        loading={members.loading}
        allowOnLeave
        selectedId={lead?.id}
        onPick={(p) => setLead({ id: p.id, name: p.name })}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  fields: { gap: space.md },
  part: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  self: { alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
}));
