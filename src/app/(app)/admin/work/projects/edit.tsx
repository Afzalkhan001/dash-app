// Add a project code, or edit one (?id=…) — web: ProjectsView's create / edit modals
// (createProject :22617, saveProject :22638). Super Admin and Config project creators only (:22616).
//
// Meta 1, Meta 2, Meta 3 make the code ("TM_NIM_EXPL", previewed live); the name follows Meta 3
// until someone types their own. The owner is picked from everyone signed up plus roster people who
// haven't signed up yet; picking one also fills the employee number. Date, and Active / Inactive.
// A plain Save: nothing is messaged, and a code is never deleted.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Save, UserRound, UserRoundPlus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useProjects } from '@/api/reimbursements';
import { createProject, projectWriteKeys, updateProject, useRoster, useWorkUsers, type WorkProject } from '@/api/work';
import { useTodayIst } from '@/features/attendance/use-now';
import { type PickPerson, PersonPicker } from '@/features/shared/person-picker';
import { canEditProjects, canSeeProjects } from '@/features/work/access';
import { WorkGate } from '@/features/work/gate';
import { codeFromParts, isActiveProject } from '@/features/work/projects';
import { useAccess } from '@/lib/use-access';
import { radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  FIELD_LABEL_INSET,
  AccountRow,
  ActionBar,
  Banner,
  Button,
  Card,
  Chip,
  DateField,
  EmptyState,
  haptic,
  NavHeader,
  Screen,
  Segmented,
  Skeleton,
  Text,
  TextField,
  toast,
} from '@/ui';

const str = (v: unknown) => (v == null ? '' : String(v));

export default function ProjectEditRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = typeof id === 'string' && id ? id : null;
  return (
    <WorkGate title={editId ? 'Edit project code' : 'Add a project code'} allow={(a) => canSeeProjects(a) && canEditProjects(a.user, a.tenant)}>
      <ProjectForm editId={editId} />
    </WorkGate>
  );
}

function ProjectForm({ editId }: { editId: string | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const today = useTodayIst();
  const access = useAccess();
  const q0 = useProjects();
  const usersQ = useWorkUsers();
  const [pickerOpen, setPickerOpen] = useState(false);
  const rosterQ = useRoster(pickerOpen);
  const editing = editId ? ((Array.isArray(q0.data) ? q0.data : []).find((p) => p?.id === editId) as WorkProject | undefined) : undefined;

  const [seeded, setSeeded] = useState<string | null>(null);
  const [m1, setM1] = useState('');
  const [m2, setM2] = useState('');
  const [m3, setM3] = useState('');
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [empNo, setEmpNo] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [tried, setTried] = useState(false);

  if (editing && seeded !== editing.id) {
    setSeeded(editing.id);
    setM1(str(editing.meta1));
    setM2(str(editing.meta2));
    setM3(str(editing.meta3));
    setName(str(editing.name));
    setOwner(str(editing.costCodeOwner));
    setEmpNo(str(editing.empNo));
    const d = str(editing.date || editing.createdAt).slice(0, 10);
    setDate(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
    setStatus(isActiveProject(editing) ? 'active' : 'inactive');
  }

  const code = codeFromParts(m1, m2, m3);
  // The web's name rule: while the name is empty or still equals Meta 3, it follows Meta 3.
  const setMeta3 = (v: string) => {
    if (!name || name === m3) setName(v);
    setM3(v);
  };

  const done = () => {
    haptic.success();
    void Promise.all(projectWriteKeys(access.user?.id).map((queryKey) => qc.invalidateQueries({ queryKey })));
    if (router.canGoBack()) router.back();
    else router.replace('/admin/work/projects');
  };
  const save = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), meta1: m1.trim(), meta2: m2.trim(), meta3: m3.trim(), kekaCode: code, status, costCodeOwner: owner, empNo, date: date ?? '' };
      if (editId) return updateProject(editId, body);
      return createProject({ id: `p${Date.now()}`, ...body, createdAt: today });
    },
    onSuccess: () => {
      toast.show(editId ? 'Project code saved' : 'Project code added', 'success');
      done();
    },
    onError: () => haptic.error(),
  });

  const header = <NavHeader title={editId ? 'Edit project code' : 'Add a project code'} />;
  if (editId && !editing) {
    return (
      <Screen header={header}>
        {q0.isPending ? <Skeleton height={420} radius={radius.xl} /> : <EmptyState title="Code not found" message="It may have been changed on the website." />}
      </Screen>
    );
  }

  const blocker = !name.trim() ? 'Add a name' : null;
  const signedUp = Array.isArray(usersQ.data) ? usersQ.data : [];
  const emails = new Set(signedUp.map((u) => u.email.toLowerCase()).filter(Boolean));
  const people: PickPerson[] = [
    ...signedUp.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, role: u.role, jobTitle: u.jobTitle || undefined, dept: u.dept || undefined, employeeNumber: u.employeeNumber || undefined, hasAvatar: u.hasAvatar })),
    ...(Array.isArray(rosterQ.data) ? rosterQ.data : [])
      .filter((w) => !w.email || !emails.has(w.email.toLowerCase()))
      .map((w) => ({ id: `wl:${w.id || w.name}`, name: w.name, jobTitle: 'Not signed up yet', employeeNumber: w.employeeNumber || undefined })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Screen
      header={header}
      automaticallyAdjustKeyboardInsets
      footer={
        <ActionBar note={tried ? blocker : null}>
          <Button title={editId ? 'Save changes' : 'Add code'} icon={<Save />} loading={save.isPending} onPress={() => (blocker ? setTried(true) : save.mutate())} />
        </ActionBar>
      }>
      <Card style={styles.fields}>
        <TextField label="Meta 1" value={m1} onChangeText={setM1} placeholder="e.g. TM" autoCapitalize="characters" autoCorrect={false} />
        <TextField label="Meta 2" value={m2} onChangeText={setM2} placeholder="e.g. NIM" autoCapitalize="characters" autoCorrect={false} />
        <TextField label="Meta 3" value={m3} onChangeText={setMeta3} placeholder="e.g. EXPL" autoCorrect={false} />
        <View style={styles.preview} accessible accessibilityLabel={code ? `Project code will be ${code}` : 'Fill Meta 1 to 3 to make the code'}>
          <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
            Project code
          </Text>
          {code ? <Chip label={code} selected /> : <Text variant="label" muted>Made from Meta 1, 2 and 3</Text>}
        </View>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="What the code is for" error={tried && !name.trim() ? 'Add a name' : null} />
      </Card>

      <Card style={styles.fields}>
        <View style={styles.part}>
          <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
            Project owner
          </Text>
          <AccountRow
            icon={owner ? UserRound : UserRoundPlus}
            module="tasks"
            title={owner || 'Choose the owner'}
            sub={owner ? (empNo ? `Employee number ${empNo}` : 'No employee number') : 'Approves claims against this code'}
            actionLabel={owner ? 'Change' : 'Choose'}
            onPress={() => setPickerOpen(true)}
          />
          {owner ? (
            <Button
              title="No owner"
              variant="text"
              size="sm"
              onPress={() => {
                setOwner('');
                setEmpNo('');
              }}
              style={styles.clear}
            />
          ) : null}
        </View>
        <DateField label="Date" value={date} onChange={setDate} placeholder="Pick a date" />
        <View style={styles.part}>
          <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
            Status
          </Text>
          <Segmented
            options={[
              { key: 'active', label: 'Active' },
              { key: 'inactive', label: 'Inactive' },
            ]}
            value={status}
            onChange={setStatus}
          />
        </View>
      </Card>

      {save.error ? <Banner tone="danger" title="Couldn’t save the code" message={save.error.message} /> : null}

      <PersonPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Project owner"
        people={people}
        loading={usersQ.isPending}
        allowOnLeave
        recentKey="work.projectOwner"
        selectedId={people.find((p) => p.name === owner)?.id}
        onPick={(p) => {
          setOwner(p.name);
          setEmpNo(p.employeeNumber ?? '');
        }}
      />
      <Text variant="caption" muted align="center" style={styles.note}>
        Changes show everywhere the code is used. No message is sent.
      </Text>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  fields: { gap: space.md },
  part: { gap: space.xs },
  preview: { gap: space.xs, alignItems: 'flex-start' },
  clear: { alignSelf: 'flex-start' },
  note: { marginTop: -space.xs },
}));
