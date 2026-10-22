// One person on the roster (EmpRoster's row + EmpProfileModal's editable parts, dash.html:5871 and
// :29841). `id` is the account id, or 'wl:<invitation id>' for someone who has not signed up.
//   NavHeader "Employee" with Edit and "•••" (Account type · Mark resigned / Rejoin · Remove for good,
//   each only for the roles the website gives it — features/people/access);
//   the profile hero (photo, name, title, round Call / Email);
//   a Banner for what is special about them: not signed up yet, resigned (when, by whom), or a login
//   managed in User Management (its role and removal are changed there, :5899);
//   Work · Contact · Personal SummaryCards; Booking and Their manager (HR editing the profile);
//   the IT assets assigned to them (GET /assets).

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Mail, MoreHorizontal, PackageCheck, Pencil, Phone, Trash2, UserCheck, UserCog, UserX } from 'lucide-react-native';
import { useState } from 'react';

import { useAdminDepartments, useAssetList, useRoster } from '@/api/people';
import { useTodayIst } from '@/features/attendance/use-now';
import { BookingCard, ManagerLineCard } from '@/features/people/booking-card';
import { callNumber, phoneDisplay, sendMail } from '@/features/people/contact';
import { canAssignRole, canEditBooking, canManageResign, canRemoveEmployee, canSeeRoster } from '@/features/people/access';
import { type ContactAction, PersonHeader, PersonHeaderSkeleton } from '@/features/people/person-ui';
import { bloodShort, deptLabel, heldAssets, isoDay, roleLabel, systemAccount } from '@/features/people/roster';
import { RemoveSheet, ResignSheet, RoleSheet } from '@/features/people/roster-actions';
import { dateLabel, stampLabel } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { palette } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  type MenuItem,
  MenuSheet,
  NavHeader,
  Screen,
  SkeletonList,
  SummaryCard,
  type SummaryItem,
} from '@/ui';

const ZWSP = String.fromCharCode(0x200b);
const filled = (rows: SummaryItem[]) => rows.filter((r) => r.value != null && r.value !== '');

export default function RosterPersonScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const key = String(Array.isArray(params.id) ? params.id[0] : params.id || '');
  const router = useRouter();
  const today = useTodayIst();
  const access = useAccess();
  const me = access.user;
  const allowed = canSeeRoster(me, access.tenant);
  const roster = useRoster(allowed);
  const depts = useAdminDepartments(allowed);
  const assets = useAssetList(allowed);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'resign' | 'role' | 'remove' | null>(null);

  if (!allowed) return <Redirect href="/" />;

  const row = roster.data?.rows.find((r) => r.key === key);
  const deptList = depts.data;
  const close = () => setSheet(null);

  if (!row) {
    return (
      <Screen header={<NavHeader title="Employee" />} onRefresh={() => roster.refetch()}>
        {roster.isPending ? (
          <PersonHeaderSkeleton key="hero" />
        ) : roster.isError && !roster.data ? (
          <ErrorState key="hero" message={roster.error?.message ?? 'The roster could not be loaded.'} onRetry={() => void roster.refetch()} />
        ) : (
          <EmptyState
            key="hero"
            icon={<UserX color={palette.textMuted} strokeWidth={1.8} />}
            title="Not on the roster"
            message="They may have been removed."
            action={<Button title="Back to Employees" variant="accent" size="md" onPress={() => router.replace('/admin/people')} />}
          />
        )}
        {roster.isPending ? <SkeletonList key="rows" rows={4} tone="surface" /> : null}
      </Screen>
    );
  }

  const system = systemAccount(row);
  const roleable = canAssignRole(me) && !system;
  const resignable = canManageResign(me);
  const removable = canRemoveEmployee(me) && !system;
  const isSelf = !row.invited && row.id === me?.id;
  const assigned = heldAssets(row, assets.data);

  const openEdit = () => {
    router.push(`/admin/people/edit?id=${encodeURIComponent(row.key)}`);
  };
  const items: MenuItem[] = [
    { key: 'edit', label: 'Edit details', icon: Pencil, onPress: () => openEdit() },
    ...(roleable && !isSelf ? [{ key: 'role', label: 'Change account type', icon: UserCog, onPress: () => setSheet('role') }] : []),
    ...(resignable && !isSelf
      ? [
          row.resigned
            ? { key: 'rejoin', label: 'Rejoin', icon: UserCheck, onPress: () => setSheet('resign') }
            : { key: 'resign', label: 'Mark as resigned', icon: UserX, onPress: () => setSheet('resign') },
        ]
      : []),
    ...(removable && !isSelf ? [{ key: 'remove', label: 'Remove for good', icon: Trash2, tone: 'danger' as const, onPress: () => setSheet('remove') }] : []),
  ];

  const phone = row.mobile;
  const actions: ContactAction[] = [
    ...(phone ? [{ key: 'call', icon: Phone, label: 'Call', primary: true, onPress: () => callNumber(phone) }] : []),
    ...(row.email ? [{ key: 'mail', icon: Mail, label: 'Email', onPress: () => sendMail(row.email) }] : []),
  ];

  const joined = isoDay(row.dateJoined);
  const dob = isoDay(row.dob);
  const work = filled([
    { key: 'empno', label: 'Employee no.', value: row.employeeNumber },
    { key: 'dept', label: 'Department', value: deptLabel(row.dept, deptList) },
    { key: 'type', label: 'Account type', value: roleLabel(row.role) },
    { key: 'title', label: 'Job title', value: row.jobTitle },
    { key: 'mgr', label: 'Reports to', value: row.reportingManager },
    { key: 'mgr2', label: 'Additional manager', value: row.additionalManager },
    { key: 'joined', label: 'Joined', value: joined ? dateLabel(joined, today) : row.dateJoined },
    { key: 'loc', label: 'Location', value: row.location },
    {
      key: 'ts',
      label: 'Timesheet',
      value: row.timesheetCadence === 'weekly' ? 'Weekly' : 'Daily',
      hint: row.timesheetCadence === 'weekly' ? 'Due before Monday’s clock-in' : 'Filled in at clock-out',
    },
  ]);
  const contact = filled([
    // A zero-width space after @ and dots lets a long address wrap on a 320 dp phone.
    { key: 'email', label: 'Work email', value: row.email.replace(/([@.])/g, `$1${ZWSP}`) },
    { key: 'mobile', label: 'Mobile', value: phoneDisplay(phone) },
  ]);
  const personal = filled([
    { key: 'gender', label: 'Gender', value: row.gender },
    { key: 'dob', label: 'Date of birth', value: dob ? dateLabel(dob, today) : row.dob },
    { key: 'blood', label: 'Blood group', value: bloodShort(row.bloodGroup) },
  ]);

  const showBooking = canEditBooking(me) && !row.invited && !row.resigned;
  const isManagerRow = row.role === 'manager' || row.role === 'admin';

  return (
    <>
      <Screen
        header={
          <NavHeader
            title="Employee"
            actions={[
              { key: 'edit', icon: Pencil, label: 'Edit details', onPress: openEdit },
              ...(items.length > 1 ? [{ key: 'more', icon: MoreHorizontal, label: 'More actions', onPress: () => setMenu(true) }] : []),
            ]}
          />
        }
        onRefresh={() => Promise.all([roster.refetch(), assets.refetch()])}>
        <PersonHeader
          key="hero"
          person={{ id: row.id, name: row.name, hasAvatar: row.hasAvatar, pending: row.invited }}
          name={row.name}
          subtitle={[row.jobTitle || roleLabel(row.role), deptLabel(row.dept, deptList)].filter(Boolean).join(' · ') || null}
          actions={actions}
        />

        {row.resigned ? (
          <Banner
            key="resigned"
            tone="danger"
            icon={UserX}
            title="Resigned"
            message={[row.resignedAt ? `On ${stampLabel(row.resignedAt, today)}` : '', row.resignedBy ? `by ${row.resignedBy}` : ''].filter(Boolean).join(' ') || 'They are on the Resigned list.'}
          />
        ) : row.invited ? (
          <Banner key="invited" tone="info" title="Not signed up yet" message={`They were sent a welcome email${row.mobile ? ' and WhatsApp' : ''}. They sign up with this work email.`} />
        ) : null}
        {system ? (
          <Banner key="system" tone="info" title="A system login" message="Its account type and removal are managed in User Management, by a Super Admin." />
        ) : null}

        {work.length ? <SummaryCard key="work" title="Work" rows={work} /> : null}
        {contact.length ? <SummaryCard key="contact" title="Contact" rows={contact} /> : null}
        {personal.length ? <SummaryCard key="personal" title="Personal" rows={personal} /> : null}

        {showBooking ? <BookingCard key="booking" row={row} profTypes={access.tenant?.profTypes} /> : null}
        {showBooking && isManagerRow ? <ManagerLineCard key="line" row={row} accounts={roster.data?.accounts} /> : null}

        {assigned.length ? (
          <ActivityList key="assets" title={`IT assets with them (${assigned.length})`}>
            {assigned.map((a) => (
              <ActivityRow
                key={a.id}
                module="support"
                icon={PackageCheck}
                title={a.name}
                subtitle={[a.type, a.assetId, a.serial].filter(Boolean).join(' · ') || null}
                meta={a.condition || null}
              />
            ))}
          </ActivityList>
        ) : null}

        {row.avatarUpdatedBy ? (
          <Banner
            key="photo"
            tone="info"
            title="Photo"
            message={`Last changed by ${row.avatarUpdatedBy}${row.avatarUpdatedById === row.id ? ' (themselves)' : ''}${row.avatarUpdatedAt ? ` on ${stampLabel(row.avatarUpdatedAt, today)}` : ''}.`}
          />
        ) : null}
      </Screen>

      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={row.name}
        subtitle={roleLabel(row.role)}
        items={items}
      />
      <ResignSheet row={row} visible={sheet === 'resign'} onClose={close} />
      <RoleSheet row={row} visible={sheet === 'role'} onClose={close} />
      <RemoveSheet row={row} visible={sheet === 'remove'} onClose={close} onRemoved={() => router.replace('/admin/people')} />
    </>
  );
}
