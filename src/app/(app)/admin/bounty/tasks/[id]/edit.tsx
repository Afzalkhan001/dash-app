// Edit a bounty task's details — the website's "Edit Bounty Task" (dash.html:12993-13038): title, what
// to do, category, department, deadline, how many can take part (never below who already joined;
// raising it reopens a full task), who can do it, professional category and the reference link. The
// reward has its own sheet on the task screen (it moves coins). PUT /bounty_tasks/:id; the creator or
// Master / Super Admin, as on the website.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { type BountyTask, useBountyDepartments } from '@/api/bounty';
import { editBountyTask, useAdminTasks, useInvalidateBountyAdmin } from '@/api/bountyadmin';
import { useTodayIst } from '@/features/attendance/use-now';
import { asArray, claimsOf, profTypeLabel } from '@/features/bounty/logic';
import { canEditTask } from '@/features/bountyadmin/access';
import { useBountyAdmin } from '@/features/bountyadmin/gate';
import { digitsOnly } from '@/features/bountyadmin/logic';
import { MissingItem } from '@/features/inbox/detail';
import { radius, space } from '@/theme/tokens';
import { ActionBar, Button, Card, DateField, NavHeader, Screen, SelectField, Skeleton, TextField, toast } from '@/ui';

const TITLE = 'Edit task';

export default function EditTaskScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = typeof raw === 'string' ? raw : '';
  const { user, ready, gates } = useBountyAdmin();
  const q = useAdminTasks(gates.tasks);
  const task = Array.isArray(q.data) ? (q.data.find((t) => t?.id === id) ?? null) : null;
  if (ready && (!gates.tasks || (task && !canEditTask(task, user)))) return <Redirect href="/" />;
  if (!ready || (!task && q.isLoading)) {
    return (
      <Screen header={<NavHeader title={TITLE} />}>
        <Skeleton height={320} radius={radius.xl} />
      </Screen>
    );
  }
  if (!task) return <MissingItem title={TITLE} />;
  return <EditForm key={task.id} task={task} />;
}

function EditForm({ task }: { task: BountyTask }) {
  const router = useRouter();
  const today = useTodayIst();
  const invalidate = useInvalidateBountyAdmin();
  const { tenant } = useBountyAdmin();
  const depts = asArray<{ id: string; name: string }>(useBountyDepartments().data);
  const joined = claimsOf(task).length;
  const [f, setF] = useState({
    title: task.title || '',
    desc: task.desc || '',
    category: task.category || '',
    deptId: task.deptId || '',
    deadline: task.deadline || '',
    maxAccepts: task.maxAccepts == null ? '' : String(task.maxAccepts),
    eligibility: task.eligibility || '',
    targetProfType: task.targetProfType || '',
    referenceUrl: task.referenceUrl || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const profTypes = asArray<{ id?: string; active?: boolean }>(tenant?.profTypes).filter((t) => t && t.id && t.active !== false);

  // dash.html:12801 confirmEdit checks.
  const cap = f.maxAccepts === '' ? null : Math.round(Number(f.maxAccepts));
  const err = !f.title.trim()
    ? 'Task title is required.'
    : !f.desc.trim()
      ? 'Task description is required.'
      : cap != null && (!Number.isFinite(cap) || cap <= 0)
        ? 'How many can take part must be a positive number, or left blank for no limit.'
        : cap != null && cap < joined
          ? `${joined} ${joined === 1 ? 'person has' : 'people have'} already joined — the limit can’t go below that.`
          : null;

  const save = async () => {
    if (err) return;
    setSaving(true);
    try {
      await editBountyTask(task.id, {
        title: f.title.trim(),
        desc: f.desc.trim(),
        category: f.category,
        deptId: f.deptId,
        deadline: f.deadline,
        eligibility: f.eligibility,
        targetProfType: f.targetProfType,
        maxAccepts: cap,
        referenceUrl: f.referenceUrl.trim(),
      });
      await invalidate();
      toast.show('Task saved', 'success');
      router.back();
    } catch (e) {
      Alert.alert('Couldn’t save the task', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      header={<NavHeader title={TITLE} />}
      footer={
        <ActionBar note={err}>
          <Button title="Save changes" loading={saving} disabled={!!err} onPress={() => void save()} />
        </ActionBar>
      }>
      <Card style={{ gap: space.md }}>
        <TextField label="Task title" value={f.title} onChangeText={(v) => set('title', v)} maxLength={120} />
        <TextField label="What to do" value={f.desc} onChangeText={(v) => set('desc', v)} multiline maxLength={2000} counter />
        <TextField label="Category (optional)" value={f.category} onChangeText={(v) => set('category', v)} maxLength={40} placeholder="e.g. Editing, Design" />
        <SelectField
          label="Department"
          value={f.deptId || 'any'}
          options={[{ value: 'any', label: 'Anyone in the company' }, ...depts.map((d) => ({ value: d.id, label: d.name }))]}
          onChange={(v) => set('deptId', v === 'any' ? '' : v)}
          hint={f.deptId ? 'Only this department’s people will see it and can take it.' : 'Everyone can see and take it.'}
        />
        <DateField label="Deadline" value={f.deadline || null} onChange={(v) => set('deadline', v)} minimumDate={today} />
      </Card>
      <Card style={{ gap: space.md }}>
        <TextField
          label="How many people can take part (optional)"
          value={f.maxAccepts}
          onChangeText={(v) => set('maxAccepts', digitsOnly(v))}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="No limit"
          hint={`${joined} joined so far. Raising the limit on a full task opens it again.`}
        />
        <TextField label="Who can do it (optional)" value={f.eligibility} onChangeText={(v) => set('eligibility', v)} maxLength={120} placeholder="e.g. Editors only" />
        {profTypes.length ? (
          <SelectField
            label="Only for one kind of professional (optional)"
            value={f.targetProfType || 'none'}
            options={[{ value: 'none', label: 'Everyone' }, ...profTypes.map((t) => ({ value: String(t.id), label: `${profTypeLabel(String(t.id), tenant)} only` }))]}
            onChange={(v) => set('targetProfType', v === 'none' ? '' : v)}
          />
        ) : null}
        <TextField label="Reference link (optional)" value={f.referenceUrl} onChangeText={(v) => set('referenceUrl', v)} autoCapitalize="none" keyboardType="url" placeholder="https://" />
      </Card>
    </Screen>
  );
}
