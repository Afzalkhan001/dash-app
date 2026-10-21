// Add or edit a Team board task (web: TaskFormModal, dash.html:14644). Params: dept, project, and
// id (edit) or parent (a sub-work under a Work).
//
// Fields as on the website: Title*, Description, Assignee (anyone in the department — the server
// only accepts someone on an ACTIVE team assigned to this project, and says so in its own words),
// Type (the department's task types), Priority, Status, Due date, Estimated hours and Comments (the
// note the assignee sees). A new task straight from the Tasks tab needs an assignee (14668), or it
// would vanish as a bare container. A plain Save: nothing here messages anyone.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ClipboardList, Save, UserRoundPlus, UserRoundX } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import {
  createTask,
  PRIORITIES,
  TASK_STATUSES,
  tbKeys,
  type TrPriority,
  type TrTask,
  type TrTaskStatus,
  updateTask,
  useTrProject,
  useTrProjectTasks,
} from '@/api/teamboard';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { type PickPerson, PersonPicker } from '@/features/shared/person-picker';
import { type Board, BoardGate } from '@/features/teamboard/gate';
import { useNow } from '@/features/tasks/live-timer';
import { hms, liveSeconds, PRIORITY_LABEL, TASK_STATUS_LABEL } from '@/features/teamboard/model';
import { FormChoice } from '@/features/teamboard/pickers';
import { useDeptMembers } from '@/features/teamboard/use-board';
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
  DateField,
  ErrorState,
  FieldMessage,
  haptic,
  NavHeader,
  Screen,
  SelectField,
  Skeleton,
  Text,
  TextField,
  toast,
} from '@/ui';

const NONE = '__none__';

export default function TeamBoardTaskRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <BoardGate title={id ? 'Edit task' : 'Add task'}>{(b) => <TaskForm board={b} />}</BoardGate>;
}

function TaskForm({ board }: { board: Board }) {
  const params = useLocalSearchParams<{
    project?: string;
    id?: string;
    parent?: string;
  }>();
  const projectId = typeof params.project === 'string' ? params.project : '';
  const editId = typeof params.id === 'string' ? params.id : '';
  const projectQ = useTrProject(projectId);
  const tasksQ = useTrProjectTasks(projectId, !!editId);
  const task = editId ? (tasksQ.data ?? []).find((t) => t.id === editId) : undefined;
  const title = editId ? 'Edit task' : 'Add task';
  const header = <NavHeader title={title} subtitle={projectQ.data?.project.name || undefined} />;

  if (!projectId) {
    return (
      <Screen header={header}>
        <ErrorState title="No project picked" message="Open a project first, then add the task there." />
      </Screen>
    );
  }
  // A sub work added a moment ago may not be in the cached list yet: wait for the refetch, never
  // call it "gone" while it is still on its way.
  if (projectQ.isPending || (editId && (tasksQ.isPending || (!task && tasksQ.isFetching)))) {
    return (
      <Screen header={header}>
        <Skeleton height={420} radius={radius.xl} />
      </Screen>
    );
  }
  if (projectQ.isError || !projectQ.data || (editId && !task)) {
    return (
      <Screen header={header}>
        <ErrorState
          message={projectQ.error?.message ?? tasksQ.error?.message ?? (editId ? 'This task is gone. It may have been deleted.' : '')}
          onRetry={() => void Promise.all([projectQ.refetch(), tasksQ.refetch()])}
        />
      </Screen>
    );
  }
  return (
    <TaskFields
      key={editId || 'new'}
      board={board}
      header={header}
      task={task}
      projectId={projectId}
      detail={projectQ.data}
      parent={typeof params.parent === 'string' ? params.parent : null}
    />
  );
}

function TaskFields({
  board,
  header,
  task,
  projectId,
  detail,
  parent,
}: {
  board: Board;
  header: ReactNode;
  task: TrTask | undefined;
  projectId: string;
  detail: NonNullable<ReturnType<typeof useTrProject>['data']>;
  parent: string | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const uid = useSession((s) => s.user?.id);
  const today = useTodayIst();
  const members = useDeptMembers(board.dept);
  const editing = !!task;
  const now = useNow(!!task?.started_at, 1000);

  const [name, setName] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [assignee, setAssignee] = useState<{ id: string; name: string } | null>(task?.assignee_id ? { id: task.assignee_id, name: task.assignee_name } : null);
  const [type, setType] = useState(task?.type ?? '');
  const [priority, setPriority] = useState<TrPriority>(task?.priority ?? 'medium');
  const [status, setStatus] = useState<TrTaskStatus>(task?.status ?? 'todo');
  const [due, setDue] = useState<string | null>(task?.due_date || null);
  const [est, setEst] = useState(task?.estimated_hours != null ? String(task.estimated_hours) : '');
  const [comment, setComment] = useState(task?.manager_comment ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tried, setTried] = useState(false);

  // The website's own rule (14668): only a brand-new top-level task must name someone.
  const needAssignee = !editing && !parent;
  const estNum = est.trim() === '' ? null : Number(est.replace(',', '.'));
  const estBad = estNum != null && (!Number.isFinite(estNum) || estNum < 0);
  const blocker = !name.trim()
    ? 'Add a title'
    : needAssignee && !assignee
      ? 'Pick who it’s for, or add it as a work item from the project if you don’t know yet'
      : estBad
        ? 'Estimated hours must be 0 or more'
        : null;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: name.trim(),
        description: description.trim(),
        assigneeId: assignee ? assignee.id : null,
        type: type || null,
        priority,
        status,
        dueDate: due || null,
        estimatedHours: estNum,
        managerComment: comment.trim() || null,
      };
      return task ? updateTask(task.id, body) : createTask(projectId, parent, body);
    },
    onSuccess: () => {
      haptic.success();
      toast.show(task ? 'Task saved' : 'Task added', 'success');
      void qc.invalidateQueries({ queryKey: tbKeys.all(uid) });
      router.back();
    },
    onError: () => haptic.error(),
  });

  const teamNames = detail.teams.map((t) => t.team_name).filter(Boolean);
  const typeOptions = [{ value: NONE, label: 'None' }, ...board.dept.taskTypes.map((t) => ({ value: t, label: t }))];
  if (type && !board.dept.taskTypes.includes(type)) typeOptions.push({ value: type, label: type });
  const hasTime = !!task && (task.elapsed_seconds > 0 || !!task.started_at);

  return (
    <Screen
      header={header}
      automaticallyAdjustKeyboardInsets
      footer={
        <ActionBar note={tried ? blocker : null}>
          <Button
            title={task ? 'Save changes' : 'Add task'}
            icon={<Save />}
            loading={save.isPending}
            onPress={() => {
              setTried(true);
              if (!blocker) save.mutate();
            }}
          />
        </ActionBar>
      }>
      {detail.project.keka_code ? (
        <Banner tone="info" title={`Project code ${detail.project.keka_code}`} message="Taken from this project. Time logged on this task counts against it." />
      ) : null}
      <Card style={styles.fields}>
        <TextField
          label="Title"
          value={name}
          onChangeText={setName}
          placeholder="What needs doing"
          maxLength={160}
          error={tried && !name.trim() ? 'Add a title' : null}
        />
        <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline maxLength={2000} />
        <View style={styles.part}>
          <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
            Assignee
          </Text>
          {assignee ? (
            <AccountRow
              left={<Avatar name={assignee.name} size={40} ring={false} />}
              title={assignee.name}
              sub={members.members.find((m) => m.id === assignee.id)?.jobTitle || board.dept.name}
              onPress={() => setPickerOpen(true)}
              accessibilityLabel={`Assigned to ${assignee.name}. Change`}
            />
          ) : (
            <AccountRow
              icon={UserRoundPlus}
              module="tasks"
              title="Choose a person"
              sub={members.loading ? 'Loading the department…' : `${members.members.length} in ${board.dept.name}`}
              actionLabel="Choose"
              onPress={() => setPickerOpen(true)}
            />
          )}
          <FieldMessage
            error={tried && needAssignee && !assignee ? 'Pick who it’s for' : null}
            hint={`Must be on one of this project’s teams: ${teamNames.join(', ') || 'none yet'}.`}
          />
          {assignee && !needAssignee ? (
            <Button title="Leave unassigned" variant="text" size="md" icon={<UserRoundX />} onPress={() => setAssignee(null)} style={styles.self} />
          ) : null}
        </View>
        <SelectField
          label="Type"
          value={type || NONE}
          options={typeOptions}
          onChange={(v) => setType(v === NONE ? '' : v)}
          hint={board.dept.taskTypes.length ? null : 'No task types yet. Add some from Projects › Task types.'}
        />
        <View style={styles.part}>
          <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
            Priority
          </Text>
          <FormChoice
            options={PRIORITIES.map((p) => ({
              key: p,
              label: PRIORITY_LABEL[p],
            }))}
            value={priority}
            onChange={setPriority}
          />
        </View>
        <View style={styles.part}>
          <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
            Status
          </Text>
          <FormChoice
            options={TASK_STATUSES.map((s) => ({
              key: s,
              label: TASK_STATUS_LABEL[s],
            }))}
            value={status}
            onChange={setStatus}
          />
          {task?.started_at && status !== task.status ? (
            <FieldMessage hint="Changing the status here doesn’t stop the clock. Use Pause on the task for that." />
          ) : null}
        </View>
        <View style={styles.row}>
          <View style={styles.flex}>
            <DateField label="Due date" value={due} onChange={setDue} placeholder="No due date" />
          </View>
          {due ? <Button title="Clear" variant="text" size="md" onPress={() => setDue(null)} /> : null}
        </View>
        <TextField
          label="Estimated hours"
          value={est}
          onChangeText={setEst}
          placeholder="e.g. 4"
          keyboardType="decimal-pad"
          maxLength={6}
          error={tried && estBad ? 'Use a number, 0 or more' : null}
        />
        {task && hasTime ? (
          <Text variant="label" muted>
            Time logged so far: {hms(liveSeconds(task, now))}
            {task.started_at ? ' (running now — tracked from Team tasks)' : ''}
          </Text>
        ) : null}
        <TextField
          label="Comments"
          value={comment}
          onChangeText={setComment}
          placeholder="Notes or instructions for the assignee"
          hint="The assignee sees this."
          multiline
          maxLength={2000}
        />
      </Card>
      {save.error ? <Banner tone="danger" title="Couldn’t save" message={save.error.message} /> : null}
      {!detail.teams.length ? (
        <Banner
          tone="warning"
          icon={ClipboardList}
          title="No team on this project yet"
          message="Assign a team to the project first, or nobody can be given this task."
        />
      ) : null}

      <PersonPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Assign to"
        subtitle={teamNames.length ? `On ${teamNames.join(', ')}` : board.dept.name}
        people={members.members}
        loading={members.loading}
        allowOnLeave
        date={due ?? today}
        recentKey="teamboard.assign"
        selectedId={assignee?.id}
        onPick={(p: PickPerson) => setAssignee({ id: p.id, name: p.name })}
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
}));
