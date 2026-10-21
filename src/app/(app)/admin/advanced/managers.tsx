// Managers (Admin, App Manager) — the website's sidebar "Managers" page (AdminManagersView,
// dash.html:22097): the managers in the departments I run (else my own department, else all), with
// their team size and the tasks given to them or their team. Tap one for their team.
// The website's "Dashboard" button (seeing DASH as that manager) is not ported: it is a desktop-only
// "view as" (PLAN §4).

import { useRouter } from 'expo-router';
import { UserCog, Users } from 'lucide-react-native';
import { useState } from 'react';

import { type WorkUser, useTeamTasks, useWorkDepts, useWorkUsers } from '@/api/work';
import { canSeeManagers, managersFor, teamOf } from '@/features/adminadvanced/access';
import { GateFallback, plural, useGate } from '@/features/adminadvanced/ui';
import { roleLabel } from '@/features/people/roster';
import { palette } from '@/theme/tokens';
import { Avatar, Button, EmptyState, ErrorState, ListCard, ListRow, NavHeader, Screen, Sheet, SkeletonList, SummaryCard, SummaryHero } from '@/ui';

export default function ManagersScreen() {
  const router = useRouter();
  const { access, pending } = useGate();
  const allowed = canSeeManagers(access);
  const usersQ = useWorkUsers(allowed);
  const deptsQ = useWorkDepts(allowed);
  // "Tasks assigned" counts every task, finished ones too (dash.html:22128), so this is the full list.
  const tasksQ = useTeamTasks('all', allowed);
  const [open, setOpen] = useState<WorkUser | null>(null);

  const header = <NavHeader title="Managers" />;
  if (!allowed || !access.user) return <GateFallback pending={pending} header={header} />;

  const people = (usersQ.data ?? []).filter((u) => u.active);
  const depts = deptsQ.data ?? [];
  const list = managersFor({ id: access.user.id, dept: String(access.user.dept ?? '') }, people, depts).sort((a, b) => a.name.localeCompare(b.name));
  const deptName = (id: string) => depts.find((d) => d.id === id)?.name || id || '—';
  const tasksFor = (m: WorkUser, team: WorkUser[]) => (tasksQ.data ?? []).filter((t) => t.assignee === m.name || team.some((e) => e.name === t.assignee)).length;
  const team = open ? teamOf(open, people) : [];

  return (
    <Screen header={header} onRefresh={() => Promise.all([usersQ.refetch(), deptsQ.refetch(), tasksQ.refetch()])}>
      {usersQ.isError && !usersQ.data ? (
        <ErrorState message={usersQ.error?.message ?? 'The managers could not be loaded.'} onRetry={() => void usersQ.refetch()} />
      ) : !usersQ.data || !deptsQ.data ? (
        <SkeletonList rows={4} avatar />
      ) : !list.length ? (
        <EmptyState icon={<UserCog color={palette.textMuted} />} title="No managers found" message="Nobody with the Manager role is in your departments." />
      ) : (
        <>
          <SummaryHero label="Managers in your departments" icon={UserCog} module="people" value={list.length} />
          <ListCard>
            {list.map((m) => {
              const t = teamOf(m, people);
              return (
                <ListRow
                  key={m.id}
                  left={<Avatar name={m.name} size={40} ring={false} />}
                  title={m.name}
                  subtitle={[deptName(m.dept), plural(t.length, 'person', 'people'), tasksQ.data ? plural(tasksFor(m, t), 'task') : null].filter(Boolean).join(' · ')}
                  subtitleLines={2}
                  chevron
                  onPress={() => setOpen(m)}
                />
              );
            })}
          </ListCard>
        </>
      )}

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.name} subtitle={open ? deptName(open.dept) : undefined}>
        {open ? (
          <>
            <SummaryCard
              rows={[
                { key: 'email', label: 'Email', value: open.email || '—' },
                { key: 'team', label: 'Team size', value: plural(team.length, 'person', 'people') },
                { key: 'tasks', label: 'Tasks assigned', value: tasksQ.data ? String(tasksFor(open, team)) : '…', hint: 'To them or their team, finished ones too' },
              ]}
            />
            {team.length ? (
              <ListCard title="Their team">
                {team.map((u) => (
                  <ListRow
                    key={u.id}
                    left={<Avatar name={u.name} size={36} ring={false} />}
                    title={u.name}
                    subtitle={u.jobTitle || roleLabel(u.role)}
                    chevron
                    onPress={() => {
                      setOpen(null);
                      router.push(`/people/${encodeURIComponent(u.id)}`);
                    }}
                  />
                ))}
              </ListCard>
            ) : (
              <EmptyState icon={<Users color={palette.textMuted} />} title="Nobody reports to them yet" />
            )}
            <Button
              title="Open their profile"
              variant="accent"
              onPress={() => {
                const id = open.id;
                setOpen(null);
                router.push(`/people/${encodeURIComponent(id)}`);
              }}
            />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
