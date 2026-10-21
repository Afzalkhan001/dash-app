// Assign a task, or edit one (?id=…) — web: ManagerTasksView's "+ Create Task" and "Edit Task"
// modals (dash.html:23116, create :23046, save :23047).
//
// Fields as on the web: Title, Assign to (the Team tasks team), Project code (required, active codes
// only), Date, Start and End time, Description. Assigning ends in a ConfirmSheet (You → the person, a
// summary, "Swipe to assign" — the server WhatsApps and emails them) and a SuccessSheet. The body is
// the web's plus three fields the server already reads: assigneeId (so the "approved" message
// reaches them), managerId and createdBy (so their "sent for review" message reaches you).
// `creator` is your name: that is how the server finds who reads out their Start code.
//
// Editing sends {title, assignee, assigneeId, project, kekaCode, startDate} with a plain Save — the
// server sends no message for an edit.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ClipboardList, Save, UserRoundPlus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type Project, useProjects } from '@/api/reimbursements';
import { createTeamTask, type TeamTask, taskWriteKeys, updateTeamTask, useTeamTasks, type WorkUser } from '@/api/work';
import { useTodayIst } from '@/features/attendance/use-now';
import { type PickPerson, PersonPicker } from '@/features/shared/person-picker';
import { ProjectPicker } from '@/features/shared/project-picker';
import { canSeeTeamTasks } from '@/features/work/access';
import { WorkGate } from '@/features/work/gate';
import { isMyTeamTask, minutesOfHm, taskRef } from '@/features/work/model';
import { taskHref } from '@/features/work/task-actions';
import { useWorkTeam } from '@/features/work/use-team';
import { dateLabel, hmLabel } from '@/lib/dates';
import { firstName } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  FIELD_LABEL_INSET,
  AccountRow,
  ActionBar,
  Avatar,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  DateField,
  EmptyState,
  FieldMessage,
  FieldPair,
  haptic,
  NavHeader,
  Screen,
  Skeleton,
  SuccessSheet,
  SummaryCard,
  type SummaryItem,
  Text,
  TextField,
  TimeField,
  toast,
} from '@/ui';

const SHEET_SWAP_MS = 360;
const LEAVE_MS = 280;
const str = (v: unknown) => (v == null ? '' : String(v));

export default function AssignTaskRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <WorkGate title={id ? 'Edit task' : 'Assign a task'} allow={canSeeTeamTasks}>
      <TaskForm editId={typeof id === 'string' && id ? id : null} />
    </WorkGate>
  );
}

const asPick = (u: WorkUser): PickPerson => ({ id: u.id, name: u.name, role: u.role, jobTitle: u.jobTitle || undefined, dept: u.dept || undefined, employeeNumber: u.employeeNumber || undefined, hasAvatar: u.hasAvatar });

function TaskForm({ editId }: { editId: string | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const today = useTodayIst();
  const scope = useWorkTeam();
  const me = scope.me;
  const projectsQ = useProjects();
  const activeQ = useTeamTasks('active', !!editId);
  const allQ = useTeamTasks('all', !!editId && !!activeQ.data && !(activeQ.data ?? []).some((t) => t?.id === editId));
  const editing: TeamTask | undefined = editId
    ? ((activeQ.data ?? []).find((t) => t?.id === editId) ?? (allQ.data ?? []).find((t) => t?.id === editId))
    : undefined;
  const projects = Array.isArray(projectsQ.data) ? projectsQ.data : [];

  // The form starts from the task once it has loaded (edit), or empty (assign).
  const [seeded, setSeeded] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [made, setMade] = useState<{ id: string; name: string } | null>(null);
  const [tried, setTried] = useState(false);

  if (editing && seeded !== editing.id && projectsQ.data) {
    setSeeded(editing.id);
    setTitle(str(editing.title));
    const u = scope.users.find((x) => x.name === editing.assignee);
    setPerson(editing.assignee ? { id: str(editing.assigneeId || u?.id), name: str(editing.assignee) } : null);
    setProject(
      projects.find((p) => !!editing.kekaCode && p.kekaCode === editing.kekaCode) ??
        projects.find((p) => p.name === editing.project || p.id === editing.project) ??
        null,
    );
    setDate(str(editing.startDate) || null);
    setStart(str(editing.startTime) || null);
    setEnd(str(editing.endTime) || null);
    setDesc(str(editing.desc));
  }

  const refresh = () => Promise.all(taskWriteKeys(me?.id).map((queryKey) => qc.invalidateQueries({ queryKey })));

  const create = useMutation({
    mutationFn: () => {
      const body = {
        id: `tk${Date.now()}`,
        title: title.trim(),
        project: project?.name || project?.kekaCode || '',
        kekaCode: project?.kekaCode || project?.name || '',
        assignee: person?.name ?? '',
        assigneeId: person?.id ?? '',
        managerId: me?.id ?? '',
        createdBy: me?.id ?? '',
        creator: me?.name ?? '',
        status: 'pending',
        startDate: date ?? '',
        startTime: start ?? '',
        endTime: end ?? '',
        desc: desc.trim(),
        timestamps: {},
      };
      return createTeamTask(body).then((r) => ({ id: r?.task?.id ?? body.id, name: body.assignee }));
    },
    onSuccess: (r) => {
      haptic.success();
      setMade(r);
      setConfirmOpen(false);
      setTimeout(() => setDoneOpen(true), SHEET_SWAP_MS);
      void refresh();
    },
    onError: () => haptic.error(),
  });

  const save = useMutation({
    mutationFn: () =>
      updateTeamTask(editId!, {
        title: title.trim(),
        assignee: person?.name ?? '',
        assigneeId: person?.id ?? '',
        // The web's edit never touches the code; a task whose code isn't in the list keeps its own.
        ...(project ? { project: project.name || project.kekaCode || '', kekaCode: project.kekaCode || project.name || '' } : {}),
        startDate: date ?? '',
      }),
    onSuccess: () => {
      haptic.success();
      toast.show('Task saved', 'success');
      void refresh();
      if (router.canGoBack()) router.back();
      else router.replace(taskHref(editId!));
    },
    onError: () => haptic.error(),
  });

  const header = <NavHeader title={editId ? 'Edit task' : 'Assign a task'} />;

  if (editId) {
    const stillLoading = activeQ.isPending || (allQ.isPending && allQ.fetchStatus !== 'idle') || scope.loading || projectsQ.isPending;
    const allowed = !!editing && !!me && isMyTeamTask(editing, { id: me.id, name: me.name }, scope.teamNames);
    if (stillLoading && !editing) {
      return (
        <Screen header={header}>
          <Skeleton height={420} radius={radius.xl} />
        </Screen>
      );
    }
    if (!allowed) {
      return (
        <Screen header={header}>
          <EmptyState icon={<ClipboardList />} title="Task not found" message="It may have been deleted or given to someone outside your team." />
        </Screen>
      );
    }
  }

  const team = scope.team;
  const endBeforeStart = !!start && !!end && minutesOfHm(end) <= minutesOfHm(start);
  // The web's own rule: title, person and project code are required (:23116).
  // Editing: the web's edit keeps whatever code the task has, so the code is only required when assigning.
  const missing = !title.trim() ? 'Add a title' : !person ? 'Choose who it’s for' : !project && !editId ? 'Choose a project code' : null;
  const blocker = missing ?? (endBeforeStart && !editId ? 'End time must be after the start time' : null);
  const err = (editId ? save.error : create.error)?.message;

  const facts: SummaryItem[] = [
    { key: 'task', label: 'Task', value: title.trim() },
    { key: 'code', label: 'Project code', value: project?.kekaCode || project?.name || '' },
    ...(date ? [{ key: 'date', label: 'Date', value: dateLabel(date, today) }] : []),
    ...(start || end ? [{ key: 'time', label: 'Time', value: [start, end].filter(Boolean).map((t) => hmLabel(t)).join(' – ') }] : []),
  ];
  const who = person ? firstName(person.name) || person.name : '';

  const leave = (open?: string) => {
    setDoneOpen(false);
    setTimeout(() => {
      if (open) router.replace(taskHref(open));
      else if (router.canGoBack()) router.back();
      else router.replace('/admin/work/tasks');
    }, LEAVE_MS);
  };

  return (
    <Screen
      header={header}
      automaticallyAdjustKeyboardInsets
      footer={
        <ActionBar note={tried ? blocker : null}>
          {editId ? (
            <Button title="Save changes" icon={<Save />} loading={save.isPending} onPress={() => (blocker ? setTried(true) : save.mutate())} />
          ) : (
            <Button
              title="Continue"
              disabled={tried && !!blocker}
              onPress={() => {
                setTried(true);
                if (!blocker) setConfirmOpen(true);
              }}
            />
          )}
        </ActionBar>
      }>
      <Card style={styles.fields}>
        <TextField label="Title" value={title} onChangeText={setTitle} placeholder="What needs doing" maxLength={160} error={tried && !title.trim() ? 'Add a title' : null} />
        <View style={styles.part}>
          <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
            Assign to
          </Text>
          {person ? (
            <AccountRow
              left={<Avatar name={person.name} size={40} ring={false} />}
              title={person.name}
              sub={team.find((u) => u.id === person.id || u.name === person.name)?.jobTitle || 'On your team'}
              onPress={() => setPickerOpen(true)}
              accessibilityLabel={`Assigned to ${person.name}. Change`}
            />
          ) : (
            <AccountRow
              icon={UserRoundPlus}
              module="tasks"
              title="Choose a person"
              sub={scope.loading ? 'Loading your team…' : team.length ? `${team.length} on your team` : 'No one on your team yet'}
              actionLabel="Choose"
              onPress={() => setPickerOpen(true)}
            />
          )}
          {tried && !person ? <FieldMessage error="Choose who it’s for" /> : null}
        </View>
        <ProjectPicker
          value={project}
          onChange={setProject}
          projects={projects}
          loading={projectsQ.isPending}
          error={tried && !project && !editId ? 'Choose a project code' : null}
          module="tasks"
        />
        <DateField label="Date" value={date} onChange={setDate} minimumDate={editId ? undefined : today} placeholder="Pick a day" />
        {editId ? null : (
          <FieldPair>
            <TimeField label="Start" value={start} onChange={setStart} placeholder="Start" />
            <TimeField label="End" value={end} onChange={setEnd} placeholder="End" error={endBeforeStart ? 'After the start' : null} />
          </FieldPair>
        )}
        {editId ? null : (
          <TextField label="Description" value={desc} onChangeText={setDesc} placeholder="Anything they should know" multiline maxLength={1000} counter />
        )}
      </Card>

      {editId ? <Text variant="caption" muted align="center">No message is sent when you change a task.</Text> : null}
      {err ? <Banner tone="danger" title={editId ? 'Couldn’t save the task' : 'Couldn’t assign the task'} message={err} /> : null}

      <PersonPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Assign to"
        subtitle="Your team"
        people={team.map(asPick)}
        loading={scope.loading}
        date={date ?? today}
        recentKey="work.assign"
        selectedId={person?.id}
        emptyMessage="No one on your team yet."
        onPick={(p) => setPerson({ id: p.id, name: p.name })}
      />

      <ConfirmSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Assign this task?"
        from={{ title: 'You', subtitle: 'Assigning', avatar: { name: me?.name || 'You' } }}
        to={{ title: person?.name ?? '', subtitle: 'Will do it', avatar: { name: person?.name || '?' } }}
        detailsTitle="Details"
        confirmLabel="Swipe to assign"
        onConfirm={() => create.mutate()}
        loading={create.isPending}
        disabled={!!blocker}
        note={who ? `${who} gets a WhatsApp and an email about it.` : undefined}>
        <SummaryCard rows={facts} />
        {create.error ? <Banner tone="danger" title="Couldn’t assign the task" message={create.error.message} /> : null}
      </ConfirmSheet>

      <SuccessSheet
        visible={doneOpen}
        onClose={() => leave()}
        title="Task assigned"
        subtitle={who ? `When ${who} taps Start, you’ll see a code on Home to read out.` : undefined}
        secondaryLabel={made ? 'View task' : undefined}
        onSecondary={made ? () => leave(made.id) : undefined}
        onPrimary={() => leave()}>
        <SummaryCard rows={[...(made ? [{ key: 'ref', label: 'Reference', value: taskRef({ id: made.id }) }] : []), { key: 'to', label: 'Assigned to', value: made?.name ?? '' }, ...facts.slice(1)]} />
      </SuccessSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  fields: { gap: space.md },
  part: { gap: space.xs },
}));
