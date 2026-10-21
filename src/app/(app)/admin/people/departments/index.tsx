// Departments — the website's DeptBrowserView (dash.html:6687) for the phone. Who: navForRaw
// `departments` (super_admin, ceo, coo, hr + the company switch); anyone else is sent home. Creating
// is for canEditDepartments (:6782), the same roles plus master_admin.
//   NavHeader "Departments" with "+" (Add department);
//   a search PillField; a light SummaryHero (how many departments; how many have no admin);
//   the departments as rows in one card: name, "Admin: <name> · N members" (members = employees and
//   professionals, signed up or invited, :6747) and "Team board on" under it for Team Roster.
// The website's "view as the department's admin" dashboard and its empty-company auto-sync (which
// rewrites every person's department) stay on the website (docs/port/hr-people.md §4.4).

import { Redirect, useRouter } from 'expo-router';
import { Building2, Plus, Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { createDepartment, useAdminDepartments, useInvalidatePeople, useRoster } from '@/api/people';
import { canEditDepartments, canSeeDepartments } from '@/features/people/access';
import { membersOf } from '@/features/people/roster';
import { useAccess } from '@/lib/use-access';
import { plural } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { moduleTone, palette, space } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  hitSlopFor,
  NavHeader,
  PillField,
  Screen,
  Sheet,
  SkeletonList,
  SummaryHero,
  TextField,
  toast,
} from '@/ui';

export default function DepartmentsScreen() {
  const router = useRouter();
  const access = useAccess();
  const allowed = canSeeDepartments(access.user, access.tenant);
  const canEdit = canEditDepartments(access.user);
  const depts = useAdminDepartments(allowed);
  const roster = useRoster(allowed);
  const invalidate = useInvalidatePeople();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!allowed) return <Redirect href="/" />;

  const loaded = !!depts.data;
  const list = Array.isArray(depts.data) ? depts.data : [];
  const needle = q.trim().toLowerCase();
  const shown = needle ? list.filter((d) => d.name.toLowerCase().includes(needle)) : list;
  const accounts = roster.data?.accounts ?? [];
  const rows = roster.data?.rows;
  const adminName = (id: string) => (id ? accounts.find((u) => u.id === id)?.name ?? '' : '');
  const noAdmin = list.filter((d) => !adminName(d.adminId)).length;
  const taken = list.some((d) => d.name.trim().toLowerCase() === name.trim().toLowerCase());

  const create = async () => {
    const n = name.trim();
    if (!n || taken) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createDepartment(n);
      await invalidate();
      setAdding(false);
      setName('');
      toast.show(`${n} was added.`);
      router.push(`/admin/people/departments/${encodeURIComponent(id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen
        header={<NavHeader title="Departments" actions={canEdit ? [{ key: 'add', icon: Plus, label: 'Add department', onPress: () => setAdding(true) }] : undefined} />}
        onRefresh={() => Promise.all([depts.refetch(), roster.refetch()])}>
        <PillField
          key="search"
          icon={Search}
          value={q}
          onChangeText={setQ}
          placeholder="Search departments"
          accessibilityLabel="Search departments"
          autoCorrect={false}
          trailing={
            q ? (
              <Pressable onPress={() => setQ('')} hitSlop={hitSlopFor(32)} style={styles.clear} accessibilityRole="button" accessibilityLabel="Clear search">
                <X size={18} color={palette.textMuted} />
              </Pressable>
            ) : null
          }
        />
        {depts.isPending ? <SkeletonList key="loading" rows={6} tone="surface" /> : null}
        {depts.isError && !depts.data ? (
          <ErrorState key="error" message={depts.error?.message ?? 'Departments could not be loaded.'} onRetry={() => void depts.refetch()} />
        ) : null}
        {loaded && !needle && list.length ? (
          <SummaryHero
            key="hero"
            icon={Building2}
            module="people"
            label="In the company"
            value={list.length}
            unit={list.length === 1 ? 'department' : 'departments'}
            sub={noAdmin ? `${plural(noAdmin, 'department')} without an admin` : 'Every department has an admin'}
          />
        ) : null}
        {loaded && shown.length ? (
          <ActivityList key="list" title={needle ? `${plural(shown.length, 'department')} found` : 'All departments'}>
            {shown.map((d) => {
              const admin = adminName(d.adminId);
              const members = rows ? membersOf(rows, d).length : null;
              return (
                <ActivityRow
                  key={d.id}
                  module="people"
                  icon={Building2}
                  title={d.name || 'Unnamed'}
                  subtitle={[admin ? `Admin: ${admin}` : 'No admin yet', members == null ? '' : plural(members, 'member')].filter(Boolean).join(' · ')}
                  note={d.teamRosterEnabled ? 'Team board on' : null}
                  chevron
                  onPress={() => router.push(`/admin/people/departments/${encodeURIComponent(d.id)}`)}
                />
              );
            })}
          </ActivityList>
        ) : null}
        {loaded && !shown.length ? (
          <Card key="empty" tone="surface">
            <EmptyState
              icon={<Building2 color={moduleTone.people.fg} strokeWidth={1.8} />}
              title={needle ? 'No department matches' : 'No departments yet'}
              message={needle ? 'Check the spelling, or clear the search.' : canEdit ? 'Add the first one to group your people.' : 'Nobody has added a department yet.'}
              action={
                needle ? (
                  <Button title="Clear search" variant="accent" size="md" onPress={() => setQ('')} />
                ) : canEdit ? (
                  <Button title="Add department" icon={<Plus />} size="md" onPress={() => setAdding(true)} />
                ) : undefined
              }
            />
          </Card>
        ) : null}
        {loaded ? <Banner key="web" tone="info" title="Each admin’s dashboard" message="Viewing a department as its admin is on the DASH website." /> : null}
      </Screen>

      <Sheet
        visible={adding}
        onClose={() => {
          setAdding(false);
          setError(null);
        }}
        title="Add department"
        dirty={!!name.trim()}
        footer={<Button title="Add department" icon={<Plus />} loading={busy} disabled={!name.trim() || taken} onPress={() => void create()} />}>
        <View style={styles.sheet}>
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="e.g. Video Editing"
            autoFocus
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={() => void create()}
            error={taken ? 'A department with this name already exists.' : null}
            hint="Pick its admin after it is added."
          />
          {error ? <Banner tone="danger" title="Couldn’t add" message={error} /> : null}
        </View>
      </Sheet>
    </>
  );
}

const styles = themedStyles(() => ({
  clear: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheet: { gap: space.md },
}));
