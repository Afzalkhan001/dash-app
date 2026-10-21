// Add an employee, or edit one (EmpRoster's Add Employee and Edit Employee modals, dash.html:5964 and
// :5911) — a pushed form (docs/DESIGN.md §10.3): Who · Work · Personal cards and one sticky button.
// `?id=<roster key>` edits; without it the form adds.
//
// Add (saveEmp :5636): first name and a valid email are required. Someone already on the roster with
// the same email or employee number is NOT silently merged as on the website: the form says who it is
// and opens their record. Otherwise a ConfirmSheet ("they get a welcome email and WhatsApp") →
// POST /whitelist (+ a PUT for the fields POST drops) → SuccessSheet.
// Edit (doEditEmp :5596): the email goes first through POST /employees/change-email (the old address
// is emailed, so that save is swiped); the rest is one PUT on the account mirrored to the invitation
// (api/people saveRosterPerson). The account type is only for role assigners and never on a User
// Management login (:5947). Switching to a weekly timesheet is swiped too: it can block their Monday
// clock-in (:5951). The photo is stamped with who changed it only when it changed (:5614).
// reportingTo (an id) is cleared only when the reporting manager's name changes; the website clears it
// on every save, which would undo "Their manager" on the person screen.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, ImagePlus, Mail, Save, Trash2, UserPlus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import {
  addEmployee,
  type AdminDepartment,
  changeEmployeeEmail,
  type RosterRecord,
  saveRosterPerson,
  useAdminDepartments,
  useInvalidatePeople,
  useRoster,
  useRosterPhoto,
} from '@/api/people';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { pickAvatarDataUrl } from '@/features/more/photo-sheet';
import { ACCOUNT_TYPES, BLOOD_GROUPS, canAssignRole, canChangeEmailOf, canSeeRoster } from '@/features/people/access';
import { asPick, bloodShort, deptOf, EMAIL_RE, findDuplicate, isoDay, roleLabel, splitName, systemAccount } from '@/features/people/roster';
import { PersonPicker } from '@/features/shared/person-picker';
import { FileError } from '@/lib/files';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  Avatar,
  Banner,
  Button,
  Card,
  CardHeader,
  ConfirmSheet,
  DateField,
  ErrorState,
  MenuSheet,
  NavHeader,
  Screen,
  SelectField,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  Text,
  TextField,
  toast,
} from '@/ui';

const GENDERS = ['Male', 'Female', 'Other'].map((g) => ({ value: g, label: g }));
const CADENCE = [
  { value: 'daily' as const, label: 'Daily', hint: 'Filled in at clock-out' },
  { value: 'weekly' as const, label: 'Weekly', hint: 'Due before Monday’s clock-in' },
];

type Form = {
  first: string;
  last: string;
  email: string;
  mobile: string;
  gender: string;
  employeeNumber: string;
  dateJoined: string;
  jobTitle: string;
  dept: string;
  role: string;
  location: string;
  reportingManager: string;
  additionalManager: string;
  timesheetCadence: 'daily' | 'weekly';
  dob: string;
  bloodGroup: string;
};

const EMPTY: Form = {
  first: '',
  last: '',
  email: '',
  mobile: '',
  gender: '',
  employeeNumber: '',
  dateJoined: '',
  jobTitle: '',
  dept: '',
  role: 'employee',
  location: '',
  reportingManager: '',
  additionalManager: '',
  timesheetCadence: 'daily',
  dob: '',
  bloodGroup: '',
};

function formOf(r: RosterRecord, depts: AdminDepartment[] | undefined): Form {
  const { first, last } = splitName(r.name);
  return {
    first,
    last,
    email: r.email,
    mobile: r.mobile,
    gender: r.gender,
    employeeNumber: r.employeeNumber,
    dateJoined: isoDay(r.dateJoined),
    jobTitle: r.jobTitle,
    // A legacy row stores the department's name: the picker works in ids.
    dept: deptOf(r.dept, depts)?.id ?? r.dept,
    role: r.role,
    location: r.location,
    reportingManager: r.reportingManager,
    additionalManager: r.additionalManager,
    timesheetCadence: r.timesheetCadence,
    dob: isoDay(r.dob),
    bloodGroup: bloodShort(r.bloodGroup),
  };
}

export default function EditEmployeeScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const key = String(Array.isArray(params.id) ? params.id[0] : params.id || '');
  const router = useRouter();
  const access = useAccess();
  const allowed = canSeeRoster(access.user, access.tenant);
  const roster = useRoster(allowed);
  const depts = useAdminDepartments(allowed);

  if (!allowed) return <Redirect href="/" />;

  const title = key ? 'Edit employee' : 'Add employee';
  const row = key ? roster.data?.rows.find((r) => r.key === key) : undefined;
  const ready = !!roster.data && !!depts.data;

  if (!ready || (key && !row)) {
    return (
      <Screen header={<NavHeader title={title} />}>
        {roster.isError && !roster.data ? (
          <ErrorState message={roster.error?.message ?? 'The roster could not be loaded.'} onRetry={() => void roster.refetch()} />
        ) : ready ? (
          <ErrorState title="Not on the roster" message="They may have been removed." onRetry={() => router.replace('/admin/people')} />
        ) : (
          <SkeletonList rows={6} tone="surface" />
        )}
      </Screen>
    );
  }
  // Keyed, so the form starts again from the record when another person is opened.
  return <EmployeeForm key={key || 'new'} row={row ?? null} rows={roster.data?.rows ?? []} depts={depts.data ?? []} />;
}

function EmployeeForm({ row, rows, depts }: { row: RosterRecord | null; rows: RosterRecord[]; depts: AdminDepartment[] }) {
  const router = useRouter();
  const me = useSession((s) => s.user);
  const today = useTodayIst();
  const invalidate = useInvalidatePeople();
  const editing = !!row;
  const [form, setForm] = useState<Form>(() => (row ? formOf(row, depts) : EMPTY));
  // Photo: undefined = unchanged, '' = removed, a data URL = new.
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [picker, setPicker] = useState<'reportingManager' | 'additionalManager' | null>(null);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ id: string; name: string; email: string } | null>(null);
  const currentPhoto = useRosterPhoto(row);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const name = `${form.first.trim()} ${form.last.trim()}`.trim();
  const email = form.email.trim().toLowerCase();
  const emailChanged = editing && email !== (row?.email ?? '');
  const system = row ? systemAccount(row) : false;
  const isSelf = !!row && !row.invited && row.id === me?.id;
  const roleField = canAssignRole(me) && !system && !isSelf;
  // filterUserWrite (lib/authz.js:80): only the company owner roles may move themselves to another
  // department; the server silently drops anyone else's own `dept`.
  const deptLocked = isSelf && !['master_admin', 'super_admin'].includes(String(me?.role || ''));
  const emailEditable = !editing || canChangeEmailOf(me, row?.role);
  const goingWeekly = form.timesheetCadence === 'weekly' && (row?.timesheetCadence ?? 'daily') !== 'weekly';
  // Once added, the new invitation is on the roster too: it is not a duplicate of itself.
  const dup = added ? null : findDuplicate(rows, editing && !emailChanged ? '' : email, editing ? '' : form.employeeNumber, row?.key);

  const errors = {
    first: !form.first.trim() ? 'Enter their first name.' : null,
    email: !EMAIL_RE.test(email) ? 'Enter a valid work email.' : dup && dup.email === email ? `${email} is already used by ${dup.name}.` : null,
    empNo: !editing && dup && form.employeeNumber.trim() && dup.employeeNumber.toLowerCase() === form.employeeNumber.trim().toLowerCase() ? `${dup.name} already has this employee number.` : null,
    additional: form.additionalManager && form.additionalManager === form.reportingManager ? 'Can’t be the same as the reporting manager.' : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const deptName = depts.find((d) => d.id === form.dept)?.name ?? '';

  const peopleForPicker = rows
    .filter((r) => !r.resigned && r.key !== row?.key)
    .map((r) => asPick(r, depts))
    .sort((a, b) => a.name.localeCompare(b.name));

  const choosePhoto = async (source: 'camera' | 'library') => {
    try {
      await new Promise((r) => setTimeout(r, 300)); // let the menu close: iOS won't present over it
      const url = await pickAvatarDataUrl(source);
      if (url) setPhoto(url);
    } catch (e) {
      Alert.alert('Couldn’t use that photo', e instanceof FileError ? e.message : 'Try another photo.');
    }
  };

  const submit = () => {
    setTried(true);
    setError(null);
    if (invalid) return;
    if (!editing || emailChanged || goingWeekly) setConfirm(true);
    else void save();
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!row) {
        const res = await addEmployee({
          email,
          name,
          role: roleField ? form.role : 'employee',
          dept: form.dept || null,
          employeeNumber: form.employeeNumber.trim(),
          gender: form.gender,
          mobile: form.mobile.trim(),
          location: form.location.trim(),
          jobTitle: form.jobTitle.trim(),
          reportingManager: form.reportingManager,
          additionalManager: form.additionalManager,
          dateJoined: form.dateJoined,
          dob: form.dob,
          bloodGroup: form.bloodGroup,
          timesheetCadence: form.timesheetCadence,
        });
        await invalidate();
        setConfirm(false);
        if (res.followError) toast.show(`Added, but date of birth, blood group and timesheet were not saved: ${res.followError}`, 'danger');
        setAdded({ id: res.id, name, email });
        return;
      }
      if (emailChanged) await changeEmployeeEmail(row, email);
      const upd: Record<string, unknown> = {
        name: name || row.name,
        timesheetCadence: form.timesheetCadence,
        gender: form.gender,
        mobile: form.mobile.trim() || row.mobile,
        location: form.location.trim(),
        dept: form.dept || null,
        jobTitle: form.jobTitle.trim(),
        jobRole: form.jobTitle.trim(),
        reportingManager: form.reportingManager,
        additionalManager: form.additionalManager,
        dateJoined: form.dateJoined,
        employeeNumber: form.employeeNumber.trim(),
        kekaCode: form.employeeNumber.trim(),
        dob: form.dob,
        bloodGroup: form.bloodGroup,
      };
      if (form.reportingManager !== row.reportingManager) upd.reportingTo = null;
      if (roleField && form.role && form.role !== row.role) upd.role = form.role;
      if (photo !== undefined) {
        upd.avatar = photo;
        upd.avatarUpdatedBy = me?.name || me?.email || '';
        upd.avatarUpdatedById = me?.id || '';
        upd.avatarUpdatedAt = new Date().toISOString();
      }
      const res = await saveRosterPerson(row, upd);
      await invalidate();
      setConfirm(false);
      if (res.mirrorError) toast.show(`Saved, but their invitation was not updated: ${res.mirrorError}`, 'danger');
      else toast.show(emailChanged ? `Saved. ${row.email || 'The old address'} was told about the new login.` : 'Changes saved.');
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const shownPhoto = photo !== undefined ? photo || null : currentPhoto;
  const mgrRow = (k: 'reportingManager' | 'additionalManager', label: string) => {
    const v = form[k];
    return (
      <View style={styles.field}>
        <Text variant="label" muted>
          {label}
        </Text>
        <AccountRow
          title={v || 'No one'}
          sub={v ? null : 'Optional'}
          left={<Avatar name={v || '?'} size={36} ring={false} />}
          actionLabel={v ? 'Change' : 'Choose'}
          onChange={() => setPicker(k)}
          actionAccessibilityLabel={`${v ? 'Change' : 'Choose'} ${label.toLowerCase()}`}
        />
        {v ? <Button title="Clear" variant="text" size="sm" icon={<X />} onPress={() => set(k, '')} style={styles.clear} /> : null}
        {k === 'additionalManager' && tried && errors.additional ? (
          <Text variant="caption" color={palette.dangerInk}>
            {errors.additional}
          </Text>
        ) : null}
      </View>
    );
  };

  const summary = [
    { key: 'name', label: 'Name', value: name },
    { key: 'email', label: 'Work email', value: email },
    ...(editing ? [] : [{ key: 'type', label: 'Account type', value: roleLabel(roleField ? form.role : 'employee') }]),
    { key: 'dept', label: 'Department', value: deptName || '—' },
    ...(goingWeekly ? [{ key: 'ts', label: 'Timesheet', value: 'Weekly', hint: 'Unfilled days from last week will block their Monday clock-in.' }] : []),
    ...(emailChanged ? [{ key: 'old', label: 'Old email', value: row?.email || '—', hint: 'Gets an email saying the login changed.' }] : []),
  ];

  return (
    <>
      <Screen
        header={<NavHeader title={editing ? 'Edit employee' : 'Add employee'} />}
        footer={
          <ActionBar note={tried && invalid ? 'Fix the fields marked in red.' : null}>
            <Button
              title={editing ? 'Save changes' : 'Add employee'}
              icon={editing ? <Save /> : <UserPlus />}
              loading={busy && !confirm}
              onPress={submit}
            />
          </ActionBar>
        }>
        {editing && row ? (
          <Card tone="surface" style={styles.photoCard}>
            <Avatar name={name || row.name} uri={shownPhoto} size={64} ring={false} />
            <View style={styles.photoText}>
              <Text variant="bodyStrong" numberOfLines={2}>
                Profile photo
              </Text>
              <Text variant="caption" muted numberOfLines={2}>
                {photo === '' ? 'Will be removed when you save' : photo ? 'New photo, saved with the rest' : row.avatarUpdatedBy ? `Last changed by ${row.avatarUpdatedBy}` : 'Square photos look best'}
              </Text>
            </View>
            <Button title={shownPhoto ? 'Change' : 'Add'} variant="accent" size="sm" onPress={() => setPhotoMenu(true)} />
          </Card>
        ) : null}

        {system ? <Banner tone="info" title="A system login" message="Its account type is managed in User Management, by a Super Admin." /> : null}

        <Card tone="surface" style={styles.card}>
          <CardHeader title="Who" />
          <TextField label="First name" value={form.first} onChangeText={(v) => set('first', v)} autoCapitalize="words" error={tried ? errors.first : null} />
          <TextField label="Last name" value={form.last} onChangeText={(v) => set('last', v)} autoCapitalize="words" />
          <TextField
            label="Work email"
            value={form.email}
            onChangeText={(v) => set('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={emailEditable}
            left={<Mail size={18} color={palette.textMuted} />}
            error={tried || (emailChanged && !!errors.email) ? errors.email : null}
            hint={
              !emailEditable
                ? 'Only a Super Admin can change this login.'
                : emailChanged
                  ? 'This is their login. They sign in with the new address, and the old one gets an email.'
                  : editing
                    ? 'This is their login.'
                    : 'They sign up to DASH with this address.'
            }
          />
          <TextField label="Mobile" value={form.mobile} onChangeText={(v) => set('mobile', v)} keyboardType="phone-pad" placeholder="+91 …" hint={editing ? null : 'Their welcome WhatsApp goes here.'} />
          <SelectField label="Gender" value={form.gender || null} options={GENDERS} onChange={(v) => set('gender', v)} placeholder="Choose" />
        </Card>

        <Card tone="surface" style={styles.card}>
          <CardHeader title="Work" />
          <TextField label="Employee no." value={form.employeeNumber} onChangeText={(v) => set('employeeNumber', v)} autoCapitalize="characters" placeholder="e.g. TM-001" error={tried ? errors.empNo : null} />
          <DateField label="Date joined" value={form.dateJoined || null} onChange={(v) => set('dateJoined', v)} />
          <TextField label="Job title" value={form.jobTitle} onChangeText={(v) => set('jobTitle', v)} autoCapitalize="words" placeholder="Video Editor" />
          <SelectField
            label="Department"
            value={form.dept}
            options={[{ value: '', label: 'No department' }, ...depts.map((d) => ({ value: d.id, label: d.name }))]}
            onChange={(v) => set('dept', v)}
            disabled={deptLocked}
            hint={deptLocked ? 'Someone else in HR changes your own department.' : undefined}
          />
          {roleField ? (
            <SelectField label="Account type" value={form.role} options={ACCOUNT_TYPES.map((r) => ({ value: r, label: roleLabel(r) }))} onChange={(v) => set('role', v)} />
          ) : !editing ? (
            <Text variant="caption" muted>
              New people join as Employee. HR can change the account type.
            </Text>
          ) : null}
          <TextField label="Location" value={form.location} onChangeText={(v) => set('location', v)} autoCapitalize="words" placeholder="Hyderabad" />
          {mgrRow('reportingManager', 'Reporting manager')}
          {mgrRow('additionalManager', 'Additional manager')}
          <SelectField
            label="Timesheet"
            value={form.timesheetCadence}
            options={CADENCE}
            onChange={(v) => set('timesheetCadence', v)}
            hint={form.timesheetCadence === 'weekly' ? 'Unfilled days from last week will block their clock-in.' : 'Anything not written down at clock-out counts as unlogged time.'}
          />
        </Card>

        <Card tone="surface" style={styles.card}>
          <CardHeader title="Personal" />
          <DateField label="Date of birth" value={form.dob || null} onChange={(v) => set('dob', v)} maximumDate={today} />
          <SelectField
            label="Blood group"
            value={form.bloodGroup || null}
            options={[...BLOOD_GROUPS, ...(form.bloodGroup && !BLOOD_GROUPS.includes(form.bloodGroup) ? [form.bloodGroup] : [])].map((b) => ({ value: b, label: b }))}
            onChange={(v) => set('bloodGroup', v)}
            placeholder="Choose"
          />
        </Card>

        {error && !confirm ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
        {!editing && dup ? (
          <Banner
            tone="warning"
            title={`${dup.name} is already on the roster`}
            message="Same email or employee number. Open their record to change it."
            action={{ label: 'Open their record', onPress: () => router.replace(`/admin/people/${encodeURIComponent(dup.key)}`) }}
          />
        ) : null}
      </Screen>

      <PersonPicker
        visible={!!picker}
        onClose={() => setPicker(null)}
        title={picker === 'additionalManager' ? 'Additional manager' : 'Reporting manager'}
        people={peopleForPicker}
        filter={(p) => p.name !== (picker === 'additionalManager' ? form.reportingManager : form.additionalManager)}
        allowOnLeave
        recentKey="people.manager"
        selectedId={peopleForPicker.find((p) => p.name === (picker ? form[picker] : ''))?.id}
        onPick={(p) => picker && set(picker, p.name)}
      />

      <MenuSheet
        visible={photoMenu}
        onClose={() => setPhotoMenu(false)}
        title="Profile photo"
        items={[
          { key: 'camera', label: 'Take a photo', icon: Camera, onPress: () => void choosePhoto('camera') },
          { key: 'library', label: 'Choose from photos', icon: ImagePlus, onPress: () => void choosePhoto('library') },
          ...(shownPhoto ? [{ key: 'remove', label: 'Remove photo', icon: Trash2, tone: 'danger' as const, onPress: () => setPhoto('') }] : []),
        ]}
      />

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={editing ? 'Save changes' : 'Add and invite'}
        from={
          row
            ? { title: row.name, subtitle: emailChanged ? row.email : roleLabel(row.role), avatar: { name: row.name } }
            : { title: me?.name || 'You', subtitle: 'Adding', avatar: { name: me?.name || 'You' } }
        }
        to={{ title: name || 'New employee', subtitle: emailChanged || !row ? email : 'Updated', avatar: { name: name || '?' } }}
        detailsTitle={editing ? 'What changes' : 'Their details'}
        confirmLabel={editing ? 'Swipe to save' : 'Swipe to add and invite'}
        onConfirm={() => void save()}
        loading={busy}
        note={editing ? (emailChanged ? `${row?.email || 'The old address'} gets an email about the change.` : 'No one is emailed.') : `${name ? `${name} gets` : 'They get'} a welcome email${form.mobile.trim() ? ' and WhatsApp' : ''}.`}>
        <SummaryCard rows={summary} />
        {error ? <Banner tone="danger" title="Couldn’t save" message={error} style={styles.gap} /> : null}
      </ConfirmSheet>

      <SuccessSheet
        visible={!!added}
        onClose={() => {
          setAdded(null);
          router.back();
        }}
        title="Invite sent"
        subtitle={`${added?.name || 'They'} can sign up to DASH with ${added?.email ?? 'their work email'}.`}
        secondaryLabel={added?.id ? 'Open their record' : undefined}
        onSecondary={() => {
          const id = added?.id;
          setAdded(null);
          if (id) router.replace(`/admin/people/${encodeURIComponent(`wl:${id}`)}`);
        }}
        onPrimary={() => {
          setAdded(null);
          router.back();
        }}
      />
    </>
  );
}

const styles = themedStyles(() => ({
  card: { gap: space.md },
  field: { gap: space.xs },
  clear: { alignSelf: 'flex-start' },
  photoCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  photoText: { flex: 1, minWidth: 0, gap: 2 },
  gap: { marginTop: space.sm },
}));
