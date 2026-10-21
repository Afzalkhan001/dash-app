// Team board (web: TeamRosterHub, dash.html:13554) — "Team Roster" on the website. Not shift rostering:
// a department's teams, projects, work items and timed tasks.
//
//   [ department pill — only with more than one, "(Admin)" / "(Manager)" as on the website ]
//   [ Tasks · Projects · People · Managers ]   Managers only for the department's admin (13583)
//
// Reached from More › Work › Team board (canSeeTeamRosterNav). The website opens on Managers for an
// admin; the phone opens on Tasks, the daily screen.

import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Building2 } from 'lucide-react-native';
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { tbKeys } from '@/api/teamboard';
import { useSession } from '@/auth/session';

import { type Board, BoardGate } from '@/features/teamboard/gate';
import { type Choice, ChoiceSheet } from '@/features/teamboard/pickers';
import { ManagersTab } from '@/features/teamboard/tabs/managers';
import { PeopleTab } from '@/features/teamboard/tabs/people';
import { ProjectsTab } from '@/features/teamboard/tabs/projects';
import { TasksTab } from '@/features/teamboard/tabs/tasks';
import { pickDept } from '@/features/teamboard/use-board';
import { Chip, ChipRow, NavHeader, PillSelector, Screen, Segmented, type Segment } from '@/ui';

type Tab = 'tasks' | 'projects' | 'people' | 'managers';

export default function TeamBoardRoute() {
  return <BoardGate title="Team board">{(b) => <TeamBoard board={b} />}</BoardGate>;
}

function TeamBoard({ board }: { board: Board }) {
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const uid = useSession((s) => s.user?.id);
  const wanted = (['tasks', 'projects', 'people', 'managers'] as const).find((t) => t === params.tab) ?? 'tasks';
  const [tab, setTab] = useState<Tab>(wanted);
  const [deptOpen, setDeptOpen] = useState(false);
  const win = useWindowDimensions();
  const { dept, depts } = board;
  // A granted manager is never on Managers (13584): the tab is not offered, and a stale choice falls back.
  const shownTab: Tab = tab === 'managers' && !dept.admin ? 'tasks' : tab;
  const tabs: Segment<Tab>[] = [
    { key: 'tasks', label: 'Tasks' },
    { key: 'projects', label: 'Projects' },
    { key: 'people', label: 'People' },
    ...(dept.admin ? [{ key: 'managers' as const, label: 'Managers' }] : []),
  ];
  const deptChoices: Choice<string>[] = depts.map((d) => ({
    value: d.id,
    label: d.name,
    sub: d.admin ? 'Admin' : 'Manager',
  }));

  return (
    <Screen
      header={<NavHeader title="Team board" subtitle={depts.length > 1 ? undefined : dept.name} />}
      onRefresh={() => qc.invalidateQueries({ queryKey: tbKeys.all(uid) })}>
      {depts.length > 1 ? (
        <PillSelector
          icon={Building2}
          label={`${dept.name} (${dept.admin ? 'Admin' : 'Manager'})`}
          onPress={() => setDeptOpen(true)}
          accessibilityLabel={`Department: ${dept.name}, ${dept.admin ? 'admin' : 'manager'}. Change department`}
        />
      ) : null}
      {/* Four equal tabs don't fit "Managers" on a 320 dp phone or with large text: there they scroll as chips. */}
      {tabs.length > 3 && (win.width < 360 || win.fontScale > 1.15) ? (
        <ChipRow>
          {tabs.map((t) => (
            <Chip key={t.key} label={t.label} selected={t.key === shownTab} onPress={() => setTab(t.key)} />
          ))}
        </ChipRow>
      ) : (
        <Segmented options={tabs} value={shownTab} onChange={setTab} />
      )}
      {shownTab === 'tasks' ? <TasksTab key={dept.id} board={board} /> : null}
      {shownTab === 'projects' ? <ProjectsTab key={dept.id} board={board} /> : null}
      {shownTab === 'people' ? <PeopleTab key={dept.id} board={board} /> : null}
      {shownTab === 'managers' ? <ManagersTab key={dept.id} board={board} /> : null}
      <ChoiceSheet
        visible={deptOpen}
        onClose={() => setDeptOpen(false)}
        title="Department"
        value={dept.id}
        choices={deptChoices}
        onPick={(id) => {
          pickDept(id);
          router.setParams({ dept: id });
        }}
      />
    </Screen>
  );
}
