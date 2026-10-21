// Company dashboard (SAHome, dash.html:2518) for Super Admin, CEO and COO: the four counts from
// GET /dashboard/summary as tiles. People and Departments open a list (GET /users, GET /departments,
// as the website's KPI modals do); open tasks and bookings waiting show the number only — the full
// /tasks list is ~1.3 MB and the website loads it only on desktop. Below, the company pages this
// person may open. The website's "Bounty System" switch lives in Company settings here, and its
// write-on-view `source:'system'` tagging is deliberately not ported.

import { Redirect, useRouter } from 'expo-router';
import { Building2, CalendarClock, ClipboardList, CreditCard, History, Settings2, UserCog, Users } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useCompanyDepartments, useCompanyUsers, useDashboardSummary } from '@/api/company';
import { canSeeAudit, canSeeCompanyDashboard, canSeeCompanySettings, canSeeSubscriptionsHub, canSeeUsers } from '@/features/company/access';
import { roleLabel } from '@/features/company/format';
import { useCompanyAccess } from '@/features/company/gate';
import { plural, titleCase } from '@/lib/format';
import { radius } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  EmptyState,
  ErrorState,
  ListCard,
  ListRow,
  ModuleBadge,
  NavHeader,
  PillField,
  Screen,
  SectionHeader,
  Sheet,
  Skeleton,
  SkeletonList,
  StatGrid,
  StatTile,
} from '@/ui';

type Drill = 'people' | 'departments' | null;

export default function CompanyDashboardScreen() {
  const router = useRouter();
  const { user, tenant, ready } = useCompanyAccess();
  const allowed = canSeeCompanyDashboard(user);
  const summary = useDashboardSummary(allowed);
  const [drill, setDrill] = useState<Drill>(null);
  const users = useCompanyUsers(allowed && drill !== null);
  const depts = useCompanyDepartments(allowed && drill !== null);
  const [q, setQ] = useState('');

  if (ready && !allowed) return <Redirect href="/" />;

  const d = summary.data;
  const deptName = (id: string) => depts.data?.find((x) => x.id === id || x.name === id)?.name ?? '';
  const tid = user?.tenantId ?? null;
  const people = (users.data ?? []).filter((u) => !tid || u.tenantId === tid || !u.tenantId);
  const needle = q.trim().toLowerCase();
  const shownPeople = needle
    ? people.filter((p) => [p.name, p.email, roleLabel(p.role), deptName(p.dept)].some((v) => v.toLowerCase().includes(needle)))
    : people;

  const pages = [
    canSeeUsers(user, tenant) && { key: 'users', label: 'Users', sub: 'System logins and invitations', icon: UserCog, module: 'people' as const, href: '/admin/company/users' as const },
    canSeeCompanySettings(user, tenant) && { key: 'settings', label: 'Company settings', sub: 'Switches, and who can do what', icon: Settings2, module: 'policies' as const, href: '/admin/company/settings' as const },
    canSeeAudit(user, tenant) && { key: 'audit', label: 'Activity audit', sub: 'Who did what in DASH, and when', icon: History, module: 'security' as const, href: '/admin/company/audit' as const },
    canSeeSubscriptionsHub(user, tenant) && { key: 'subs', label: 'Subscriptions', sub: 'Software the company pays for', icon: CreditCard, module: 'vendor' as const, href: '/admin/company/subscriptions' as const },
  ].filter((x): x is Exclude<typeof x, false> => !!x);

  return (
    <Screen header={<NavHeader title="Company" subtitle={tenant?.name ?? undefined} />} onRefresh={() => summary.refetch()}>
      {d ? (
        <StatGrid columns={2}>
          <StatTile variant="light" module="people" icon={Users} label="People on DASH" value={d.users} caption="Tap for the list" onPress={() => setDrill('people')} />
          <StatTile variant="light" module="security" icon={Building2} label="Departments" value={d.departments} caption="Tap for the list" onPress={() => setDrill('departments')} />
          <StatTile variant="light" module="tasks" icon={ClipboardList} label="Open tasks" value={d.activeTasks} caption="Not yet completed" />
          <StatTile variant="light" module="leave" icon={CalendarClock} label="Bookings waiting" value={d.pendingBookings} caption="Waiting for approval" />
        </StatGrid>
      ) : summary.isError ? (
        <ErrorState message={summary.error?.message ?? 'The company numbers could not be loaded.'} onRetry={() => void summary.refetch()} />
      ) : (
        <StatGrid columns={2}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={140} radius={radius.xl} />
          ))}
        </StatGrid>
      )}

      {pages.length ? (
        <View>
          <SectionHeader title="Manage" />
          <ListCard>
            {pages.map((p) => (
              <ListRow
                key={p.key}
                left={<ModuleBadge module={p.module} icon={p.icon} />}
                title={p.label}
                subtitle={p.sub}
                subtitleLines={2}
                chevron
                onPress={() => router.push(p.href)}
              />
            ))}
          </ListCard>
        </View>
      ) : null}

      <Sheet
        visible={drill === 'people'}
        onClose={() => {
          setDrill(null);
          setQ('');
        }}
        title="People on DASH"
        subtitle={users.data ? plural(people.length, 'person', 'people') : undefined}>
        <PillField placeholder="Search name, role or department" value={q} onChangeText={setQ} autoCorrect={false} />
        {users.isPending ? (
          <SkeletonList rows={6} avatar />
        ) : users.isError ? (
          <ErrorState message={users.error?.message ?? ''} onRetry={() => void users.refetch()} />
        ) : shownPeople.length ? (
          <ActivityList>
            {shownPeople.slice(0, 200).map((p) => (
              <ActivityRow key={p.id} person={{ name: p.name }} title={p.name} subtitle={[roleLabel(p.role), deptName(p.dept)].filter(Boolean).join(' · ')} />
            ))}
          </ActivityList>
        ) : (
          <EmptyState title={people.length ? 'No one matches' : 'No one yet'} />
        )}
      </Sheet>

      <Sheet visible={drill === 'departments'} onClose={() => setDrill(null)} title="Departments" subtitle={depts.data ? plural(depts.data.length, 'department') : undefined}>
        {depts.isPending || users.isPending ? (
          <SkeletonList rows={5} />
        ) : depts.isError ? (
          <ErrorState message={depts.error?.message ?? ''} onRetry={() => void depts.refetch()} />
        ) : depts.data?.length ? (
          <ActivityList>
            {depts.data.map((x) => {
              const n = people.filter((p) => p.dept === x.id || p.dept === x.name).length;
              return <ActivityRow key={x.id} module="security" icon={Building2} title={x.name} subtitle={x.mode && x.mode !== 'regular' ? `Mode: ${titleCase(x.mode)}` : undefined} value={String(n)} meta={n === 1 ? 'member' : 'members'} />;
            })}
          </ActivityList>
        ) : (
          <EmptyState title="No departments yet" />
        )}
      </Sheet>
    </Screen>
  );
}
