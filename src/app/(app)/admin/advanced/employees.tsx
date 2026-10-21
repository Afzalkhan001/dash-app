// Employees (Admin, Manager, App Manager) — the website's sidebar "Employees" page (EmpListView,
// dash.html:22166): the team directory with each person's workload and the equipment they hold.
//   Manager      the people who report to them (reporting or additional manager, by name)
//   Admin roles  the people in the departments they run or belong to; with neither, everyone
//   Who          employees and professionals (managers too, for admins and managers) — dash.html:22303
// Read only. The website's "Add Leave" calendar on this page writes to the old /leaves table, which the
// HR leave system no longer reads (PLAN §4 "Mark as leave": dead), so it is not offered.

import { useRouter } from 'expo-router';
import { Search, Users } from 'lucide-react-native';
import { useState } from 'react';

import { useAssetList } from '@/api/people';
import { useTeamTasks, useWorkDepts, useWorkUsers } from '@/api/work';
import { canSeeEmployees, employeesFor } from '@/features/adminadvanced/access';
import { GateFallback, plural, useGate } from '@/features/adminadvanced/ui';
import { roleLabel } from '@/features/people/roster';
import { todayIst } from '@/lib/dates';
import { palette } from '@/theme/tokens';
import { Avatar, Button, EmptyState, ErrorState, ListCard, ListRow, NavHeader, PillField, Screen, SkeletonList, StatusPill, SummaryHero, Text } from '@/ui';

const DONE = ['completed', 'submitted'];
const PAGE = 40;

export default function EmployeesScreen() {
  const router = useRouter();
  const { access, pending } = useGate();
  const allowed = canSeeEmployees(access);
  const usersQ = useWorkUsers(allowed);
  const deptsQ = useWorkDepts(allowed);
  const tasksQ = useTeamTasks('active', allowed);
  const assetsQ = useAssetList(allowed);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [today] = useState(todayIst);

  const header = <NavHeader title="Employees" />;
  if (!allowed || !access.user) return <GateFallback pending={pending} header={header} />;

  const me = access.user;
  const people = (usersQ.data ?? []).filter((u) => u.active);
  const { list, scope } = employeesFor({ id: me.id, name: me.name ?? '', role: me.role ?? '', dept: String(me.dept ?? '') }, people, deptsQ.data ?? []);
  const sq = search.trim().toLowerCase();
  const rows = list
    .filter((u) => !sq || u.name.toLowerCase().includes(sq) || u.email.toLowerCase().includes(sq) || u.employeeNumber.toLowerCase().includes(sq))
    .sort((a, b) => a.name.localeCompare(b.name));
  const active = (name: string) => (tasksQ.data ?? []).filter((t) => t.assignee === name && !DONE.includes(String(t.status))).length;
  const held = (name: string) => (assetsQ.data ?? []).filter((a) => a.assignedTo === name).length;
  const month = today.slice(0, 7);
  const away = list.filter((u) => u.leaveDates.includes(today)).length;

  return (
    <Screen header={header} onRefresh={() => Promise.all([usersQ.refetch(), deptsQ.refetch(), tasksQ.refetch(), assetsQ.refetch()])}>
      {usersQ.isError && !usersQ.data ? (
        <ErrorState message={usersQ.error?.message ?? 'The team could not be loaded.'} onRetry={() => void usersQ.refetch()} />
      ) : !usersQ.data || !deptsQ.data ? (
        <SkeletonList rows={6} avatar />
      ) : (
        <>
          <SummaryHero label={scope ? `Team · ${scope}` : 'Team directory'} icon={Users} module="people" value={list.length} unit={list.length === 1 ? 'person' : 'people'} />
          {away ? (
            <Text variant="caption" muted>
              {plural(away, 'person', 'people')} on leave today.
            </Text>
          ) : null}
          <PillField
            icon={Search}
            placeholder="Name, email or employee no."
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setShown(PAGE);
            }}
            accessibilityLabel="Search employees"
          />
          {!rows.length ? (
            <EmptyState icon={<Users color={palette.textMuted} />} title={sq ? 'Nobody matches' : 'No team members found'} message={sq ? `Nobody matches “${search.trim()}”.` : undefined} />
          ) : (
            <>
              <ListCard>
                {rows.slice(0, shown).map((u) => {
                  const n = active(u.name);
                  const a = held(u.name);
                  const leave = u.leaveDates.filter((d) => d.startsWith(month)).length;
                  const off = u.leaveDates.includes(today);
                  return (
                    <ListRow
                      key={u.id}
                      left={<Avatar name={u.name} size={40} ring={false} />}
                      title={u.name}
                      subtitle={[
                        roleLabel(u.role),
                        tasksQ.data ? (n ? plural(n, 'active task') : 'No active tasks') : null,
                        assetsQ.data ? plural(a, 'item') : null,
                        leave ? `${plural(leave, 'leave day')} this month` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      subtitleLines={2}
                      right={off ? <StatusPill label="On leave" tone="pending" /> : undefined}
                      chevron
                      onPress={() => router.push(`/people/${encodeURIComponent(u.id)}`)}
                    />
                  );
                })}
              </ListCard>
              {rows.length > shown ? <Button title={`Show more (${rows.length - shown} left)`} variant="accent" size="md" onPress={() => setShown(shown + PAGE)} /> : null}
            </>
          )}
          {tasksQ.isError ? <Text variant="caption" muted>Couldn’t load tasks, so workload isn’t shown.</Text> : null}
        </>
      )}
    </Screen>
  );
}
