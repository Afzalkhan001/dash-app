// Team Roster by department (TeamRosterAccessCard, dash.html:5424) — Super Admin only. A department
// can use Team Roster when both the company switch (Company settings) and its own switch are on, and
// only once it has a department admin. Disabling uses the website's own warning, swiped to confirm:
// its Team Roster managers lose access; teams, projects and tasks are kept.
// GET /team-roster/departments; PUT /departments/:id {teamRosterEnabled}.

import { Redirect, useRouter } from 'expo-router';
import { Network, Search, ToggleLeft, ToggleRight } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type TeamRosterDept, useSetTeamRosterDept, useTeamRosterDepartments } from '@/api/company';
import { canSeeTeamRosterAccess } from '@/features/company/access';
import { useCompanyAccess } from '@/features/company/gate';
import { ToggleRow } from '@/features/company/toggle-row';
import { plural } from '@/lib/format';
import { palette } from '@/theme/tokens';
import { Banner, Button, ConfirmSheet, EmptyState, ErrorState, ListCard, NavHeader, PillField, Screen, SectionHeader, SkeletonList, SummaryCard, Text, toast, useLayout } from '@/ui';

export default function TeamRosterAccessScreen() {
  const router = useRouter();
  const { gap } = useLayout();
  const { user, ready } = useCompanyAccess();
  const allowed = canSeeTeamRosterAccess(user);
  const q = useTeamRosterDepartments(allowed);
  const set = useSetTeamRosterDept();
  const [needle, setNeedle] = useState('');
  const [off, setOff] = useState<TeamRosterDept | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (ready && !allowed) return <Redirect href="/" />;

  const d = q.data;
  const n = needle.trim().toLowerCase();
  const list = (d?.departments ?? []).filter((x) => !n || x.name.toLowerCase().includes(n) || x.adminName.toLowerCase().includes(n));

  const write = (x: TeamRosterDept, enabled: boolean) => {
    setBusyId(x.id);
    set.mutate(
      { id: x.id, enabled },
      {
        onSuccess: () => {
          setOff(null);
          toast.show(`Team Roster ${enabled ? 'on' : 'off'} for ${x.name}`, 'success');
        },
        onError: (e) => toast.show(`Couldn’t save: ${e.message}`, 'danger'),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const sub = (x: TeamRosterDept) =>
    x.adminId
      ? [`Admin: ${x.adminName || 'unnamed'}`, plural(x.managerCount, 'manager'), plural(x.teamCount, 'team')].join(' · ')
      : 'Give it a department admin first';

  return (
    <Screen header={<NavHeader title="Team Roster by department" />} onRefresh={() => q.refetch()}>
      {q.isPending ? (
        <SkeletonList rows={6} />
      ) : q.isError && !d ? (
        <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />
      ) : d && !d.globalEnabled ? (
        <EmptyState
          icon={<Network color={palette.textMuted} />}
          title="Team Roster is off"
          message="Turn it on for the company in Company settings first."
          action={<Button title="Company settings" variant="accent" size="md" onPress={() => router.back()} />}
        />
      ) : d ? (
        <>
          <Text variant="body" muted>
            Departments switched on here can run teams, projects and timed tasks with the same people and roles as the rest of DASH.
          </Text>
          {d.departments.length > 6 ? <PillField icon={Search} placeholder="Search department or admin" value={needle} onChangeText={setNeedle} /> : null}
          <View style={{ gap: gap - 8 }}>
            <SectionHeader title={plural(list.length, 'department')} />
            {list.length ? (
              <ListCard>
                {list.map((x) => (
                  <ToggleRow
                    key={x.id}
                    title={x.name}
                    subtitle={sub(x)}
                    value={x.teamRosterEnabled}
                    disabled={!x.adminId}
                    busy={busyId === x.id}
                    onChange={(v) => (v ? write(x, true) : setOff(x))}
                  />
                ))}
              </ListCard>
            ) : (
              <EmptyState title={n ? 'No department matches' : 'No departments yet'} />
            )}
          </View>
        </>
      ) : null}

      <ConfirmSheet
        visible={!!off}
        onClose={() => setOff(null)}
        title={`Turn off Team Roster for ${off?.name ?? ''}?`}
        from={{ title: 'On', subtitle: off?.name, icon: ToggleRight, module: 'tasks' }}
        to={{ title: 'Off', subtitle: 'Managers lose access', icon: ToggleLeft, module: 'security' }}
        confirmLabel="Swipe to turn off"
        onConfirm={() => off && write(off, false)}
        loading={!!off && busyId === off.id}
        note="Turning it back on restores access. No one is notified.">
        <SummaryCard
          rows={[
            { key: 'who', label: 'Who loses access', value: off ? plural(off.managerCount, 'Team Roster manager') : '' },
            { key: 'kept', label: 'What is kept', value: 'Teams, projects and tasks' },
          ]}
        />
        <Banner tone="warning" message="Its Team Roster managers can’t manage anything there until it is back on." />
      </ConfirmSheet>
    </Screen>
  );
}
