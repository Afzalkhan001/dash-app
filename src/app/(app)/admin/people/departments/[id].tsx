// One department (DeptBrowserView's card + its Edit modal, dash.html:6767-6776, docs/port/hr-people.md
// §4.4). Who: navForRaw `departments`; the edits are canEditDepartments (:6782).
//   NavHeader with the department's name, Rename and "•••" (Delete);
//   the admin as an AccountRow with "Change" → the shared PersonPicker (any signed-up account, :6750)
//   → a ConfirmSheet, because the admin gets this team's approvals, its Team board and the admin
//   dashboard (adminId, :6772); "Remove admin" too;
//   a SummaryCard (members, Team board on/off, managers on file);
//   the members (employees and professionals, signed up or invited, :6747), each opening their roster
//   record; people move between departments on the roster's Edit screen.
// Delete: ConfirmSheet + SwipeToConfirm with the cascade spelled out (the server deletes the
// department's Team Roster data and HR settings, departments.js:157). An app-side safety net keeps it
// off while the department still has members.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, MoreHorizontal, Pencil, ShieldCheck, Trash2, UserMinus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type AdminDepartment, deleteDepartment, updateDepartment, useAdminDepartments, useInvalidatePeople, useRoster } from '@/api/people';
import { canEditDepartments, canSeeDepartments, canSeeRoster } from '@/features/people/access';
import { asPick, membersOf, roleLabel } from '@/features/people/roster';
import { RosterRow } from '@/features/people/roster-ui';
import { PersonPicker, type PickPerson } from '@/features/shared/person-picker';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  AccountRow,
  ActivityList,
  Avatar,
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  MenuSheet,
  NavHeader,
  Screen,
  SectionLabel,
  Sheet,
  SkeletonList,
  SummaryCard,
  TextField,
  toast,
} from '@/ui';

export default function DepartmentScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(Array.isArray(params.id) ? params.id[0] : params.id || '');
  const router = useRouter();
  const access = useAccess();
  const allowed = canSeeDepartments(access.user, access.tenant);
  const canEdit = canEditDepartments(access.user);
  const rosterOpen = canSeeRoster(access.user, access.tenant);
  const depts = useAdminDepartments(allowed);
  const roster = useRoster(allowed);
  const invalidate = useInvalidatePeople();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [picking, setPicking] = useState(false);
  const [nextAdmin, setNextAdmin] = useState<PickPerson | 'none' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!allowed) return <Redirect href="/" />;

  const dept = depts.data?.find((d) => d.id === id);
  if (!dept) {
    return (
      <Screen header={<NavHeader title="Department" />} onRefresh={() => depts.refetch()}>
        {depts.isPending ? (
          <SkeletonList key="body" rows={5} tone="surface" />
        ) : depts.isError && !depts.data ? (
          <ErrorState key="body" message={depts.error?.message ?? 'Departments could not be loaded.'} onRetry={() => void depts.refetch()} />
        ) : (
          <EmptyState
            key="body"
            icon={<Building2 color={palette.textMuted} strokeWidth={1.8} />}
            title="Department not found"
            message="It may have been deleted."
            action={<Button title="All departments" variant="accent" size="md" onPress={() => router.replace('/admin/people/departments')} />}
          />
        )}
      </Screen>
    );
  }

  const accounts = roster.data?.accounts ?? [];
  const rows = roster.data?.rows;
  const admin = dept.adminId ? accounts.find((u) => u.id === dept.adminId) : undefined;
  const members = rows ? membersOf(rows, dept) : [];
  const managers = dept.managerIds.map((m) => accounts.find((u) => u.id === m)?.name).filter(Boolean) as string[];
  const otherNames = (depts.data ?? []).filter((d) => d.id !== dept.id).map((d) => d.name.trim().toLowerCase());
  const nameTaken = otherNames.includes(name.trim().toLowerCase());

  const run = async (work: () => Promise<void>, done: string, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await invalidate();
      toast.show(done);
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const rename = () => {
    const n = name.trim();
    if (!n || nameTaken) return;
    void run(() => updateDepartment(dept, { name: n }), 'Department renamed.', () => setRenaming(false));
  };
  const saveAdmin = () => {
    if (!nextAdmin) return;
    const adminId = nextAdmin === 'none' ? '' : nextAdmin.id;
    void run(
      () => updateDepartment(dept, { adminId }),
      nextAdmin === 'none' ? `${dept.name} has no admin now.` : `${nextAdmin.name} runs ${dept.name} now.`,
      () => setNextAdmin(null),
    );
  };
  const remove = () =>
    void run(() => deleteDepartment(dept.id), `${dept.name} was deleted.`, () => {
      setDeleting(false);
      router.replace('/admin/people/departments');
    });

  const candidates = accounts
    .filter((u) => u.role !== 'master_admin' && !u.resigned)
    .map((u) => asPick(u, depts.data))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <Screen
        header={
          <NavHeader
            title={dept.name || 'Department'}
            actions={
              canEdit
                ? [
                    {
                      key: 'rename',
                      icon: Pencil,
                      label: 'Rename',
                      onPress: () => {
                        setName(dept.name);
                        setError(null);
                        setRenaming(true);
                      },
                    },
                    { key: 'more', icon: MoreHorizontal, label: 'More actions', onPress: () => setMenu(true) },
                  ]
                : undefined
            }
          />
        }
        onRefresh={() => Promise.all([depts.refetch(), roster.refetch()])}>
        <View key="admin" style={styles.block}>
          <SectionLabel title="Admin" />
          <AccountRow
            title={admin?.name || 'No admin yet'}
            sub={admin ? roleLabel(admin.role) : 'No one runs this team on DASH yet'}
            left={admin ? <Avatar name={admin.name} size={40} ring={false} /> : undefined}
            icon={admin ? undefined : ShieldCheck}
            module="people"
            actionLabel={admin ? 'Change' : 'Choose'}
            onChange={canEdit ? () => setPicking(true) : undefined}
            actionAccessibilityLabel={`${admin ? 'Change' : 'Choose'} the admin of ${dept.name}`}
          />
        </View>
        {canEdit ? (
          <Banner key="why" tone="info" title="What the admin gets" message="This team’s leave and attendance approvals, its Team board and the admin dashboard." />
        ) : null}

        <SummaryCard
          key="facts"
          rows={[
            { key: 'members', label: 'Members', value: rows ? String(members.length) : '…', hint: 'Employees and professionals' },
            { key: 'board', label: 'Team board', value: dept.teamRosterEnabled ? 'On' : 'Off', status: dept.teamRosterEnabled ? 'done' : 'neutral' },
            ...(managers.length ? [{ key: 'mgrs', label: managers.length === 1 ? 'Manager' : 'Managers', value: managers.join(', ') }] : []),
          ]}
        />

        {rows && members.length ? (
          <ActivityList key="members" title={`Members (${members.length})`}>
            {members.map((m) => (
              <RosterRow key={m.key} row={m} depts={depts.data} onPress={rosterOpen ? () => router.push(`/admin/people/${encodeURIComponent(m.key)}`) : undefined} />
            ))}
          </ActivityList>
        ) : rows ? (
          <EmptyState key="members" icon={<UserMinus color={palette.textMuted} strokeWidth={1.8} />} title="No members yet" message="Move people in from the roster: open someone, then Edit › Department." />
        ) : (
          <SkeletonList key="members" rows={3} avatar tone="surface" />
        )}
        {error && !renaming && !nextAdmin && !deleting ? <Banner key="error" tone="danger" title="Couldn’t save" message={error} /> : null}
      </Screen>

      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={dept.name}
        items={[
          ...(admin ? [{ key: 'noadmin', label: 'Remove the admin', icon: UserMinus, onPress: () => setNextAdmin('none') }] : []),
          { key: 'delete', label: 'Delete department', icon: Trash2, tone: 'danger' as const, onPress: () => setDeleting(true) },
        ]}
      />

      <Sheet
        visible={renaming}
        onClose={() => setRenaming(false)}
        title="Rename department"
        dirty={name.trim() !== dept.name}
        footer={<Button title="Save name" loading={busy} disabled={!name.trim() || nameTaken || name.trim() === dept.name} onPress={rename} />}>
        <View style={styles.block}>
          <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={60} autoFocus returnKeyType="done" onSubmitEditing={rename} error={nameTaken ? 'Another department has this name.' : null} />
          {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
        </View>
      </Sheet>

      <PersonPicker
        visible={picking}
        onClose={() => setPicking(false)}
        title={`Admin of ${dept.name}`}
        subtitle="Anyone signed up to DASH"
        people={candidates}
        loading={roster.isPending}
        allowOnLeave
        recentKey="people.deptAdmin"
        selectedId={dept.adminId || null}
        onPick={(p) => {
          // The picker's Modal closes first; then the confirm opens (iOS shows one Modal at a time).
          if (p.id !== dept.adminId) setTimeout(() => setNextAdmin(p), 320);
        }}
      />

      <AdminConfirm dept={dept} admin={admin?.name} next={nextAdmin} busy={busy} error={error} onClose={() => setNextAdmin(null)} onConfirm={saveAdmin} />

      <ConfirmSheet
        visible={deleting}
        onClose={() => setDeleting(false)}
        title="Delete department"
        subtitle="This can’t be undone."
        from={{ title: dept.name, subtitle: plural(members.length, 'member'), icon: Building2, module: 'people' }}
        to={{ title: 'Deleted', subtitle: 'With its Team board data', icon: Trash2, module: 'people' }}
        detailsTitle="What goes with it"
        confirmLabel="Swipe to delete"
        onConfirm={remove}
        loading={busy}
        disabled={members.length > 0 || !rows}
        note={members.length ? 'Move everyone out first.' : 'No one is emailed or messaged.'}>
        <Banner tone="danger" title="Also deleted" message="This team’s Team board projects, works and tasks, and its HR settings." />
        {members.length ? (
          <Banner tone="warning" title={`${plural(members.length, 'person')} still in it`} message="Move them to another department on the roster first." style={styles.gap} />
        ) : null}
        {error && deleting ? <Banner tone="danger" title="Couldn’t delete" message={error} style={styles.gap} /> : null}
      </ConfirmSheet>
    </>
  );
}

function AdminConfirm({
  dept,
  admin,
  next,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  dept: AdminDepartment;
  admin?: string;
  next: PickPerson | 'none' | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const nextName = next === 'none' ? 'No admin' : next?.name ?? '';
  return (
    <ConfirmSheet
      visible={!!next}
      onClose={onClose}
      title={next === 'none' ? 'Remove the admin' : 'Change the admin'}
      from={{ title: admin || 'No admin', subtitle: 'Now', ...(admin ? { avatar: { name: admin } } : { icon: ShieldCheck, module: 'people' as const }) }}
      to={{ title: nextName, subtitle: dept.name, ...(next && next !== 'none' ? { avatar: { name: next.name } } : { icon: ShieldCheck, module: 'people' as const }) }}
      detailsTitle="What moves"
      confirmLabel={next === 'none' ? 'Swipe to remove' : 'Swipe to change'}
      onConfirm={onConfirm}
      loading={busy}
      note="No one is emailed. They see it the next time they open DASH.">
      <SummaryCard
        rows={[
          { key: 'approvals', label: 'Team approvals', value: next === 'none' ? 'No department admin' : `Go to ${nextName}` },
          { key: 'board', label: 'Team board', value: dept.teamRosterEnabled ? (next === 'none' ? 'No admin' : nextName) : 'Off for this team' },
        ]}
      />
      {error ? <Banner tone="danger" title="Couldn’t save" message={error} style={styles.gap} /> : null}
    </ConfirmSheet>
  );
}

const styles = themedStyles(() => ({
  block: { gap: space.sm },
  gap: { marginTop: space.sm },
}));
