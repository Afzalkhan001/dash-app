// Work hub (docs/port/manager-work.md §4.1): the work areas this person has, as one CategoryGrid —
// Team tasks, Assign task, To review (the Inbox's task queue), Project codes, Clients — each only
// with its website gate (features/work/access.ts). More › Workspace links each area directly; this
// screen is the landing from Home's team card.

import { type Href, useRouter } from 'expo-router';
import { BriefcaseBusiness, ClipboardCheck, ClipboardList, ClipboardPlus, UsersRound } from 'lucide-react-native';

import { useAllClients, useTeamTasks } from '@/api/work';
import { canReviewWork, canSeeClients, canSeeProjects, canSeeTeamTasks, isMyClient } from '@/features/work/access';
import { WorkGate } from '@/features/work/gate';
import { isMyTeamTask, matchesFilter } from '@/features/work/model';
import { useWorkTeam } from '@/features/work/use-team';
import { useTodayIst } from '@/features/attendance/use-now';
import type { Access } from '@/lib/use-access';
import { CategoryGrid, type CategoryItem, NavHeader, Screen, SummaryHero } from '@/ui';

const anyWork = (a: Access) => canSeeTeamTasks(a) || canSeeProjects(a) || canSeeClients(a);

export default function WorkHubRoute() {
  return (
    <WorkGate title="Work" allow={anyWork}>
      <WorkHub />
    </WorkGate>
  );
}

function WorkHub() {
  const router = useRouter();
  const today = useTodayIst();
  const scope = useWorkTeam();
  const a = scope.access;
  const teamOn = canSeeTeamTasks(a);
  const reviewOn = canReviewWork(a);
  const tasksQ = useTeamTasks('active', teamOn || reviewOn);
  // Without Team tasks the hero is the person's clients (the same read the Clients screen makes).
  const clientsHero = !teamOn && canSeeClients(a);
  const clientsQ = useAllClients(clientsHero);
  const myClients = (Array.isArray(clientsQ.data) ? clientsQ.data : []).filter((c) => isMyClient(c, a.user)).length;
  const me = scope.me;
  const tasks = me ? (tasksQ.data ?? []).filter((t) => !!t && isMyTeamTask(t, { id: me.id, name: me.name }, scope.teamNames)) : [];
  const open = tasks.filter((t) => matchesFilter(t, 'active', today, scope.adminType)).length;
  const waiting = reviewOn
    ? (tasksQ.data ?? []).filter((t) => !!t && t.status === 'submitted' && t.source !== 'booking' && t.source !== 'ticket' && scope.reviewNames.has(String(t.assignee || ''))).length
    : 0;
  const go = (href: Href) => () => router.push(href);

  const items: CategoryItem[] = [
    ...(teamOn ? [{ key: 'tasks', label: 'Team tasks', icon: ClipboardList, module: 'tasks' as const, onPress: go('/admin/work/tasks'), badge: open || undefined }] : []),
    ...(teamOn ? [{ key: 'assign', label: 'Assign task', icon: ClipboardPlus, module: 'tasks' as const, onPress: go('/admin/work/tasks/new') }] : []),
    ...(reviewOn ? [{ key: 'review', label: 'To review', icon: ClipboardCheck, module: 'tasks' as const, onPress: go('/inbox?type=task'), badge: waiting || undefined }] : []),
    ...(canSeeProjects(a) ? [{ key: 'projects', label: 'Project codes', icon: BriefcaseBusiness, module: 'tasks' as const, onPress: go('/admin/work/projects') }] : []),
    ...(canSeeClients(a) ? [{ key: 'clients', label: 'Clients', icon: UsersRound, module: 'tasks' as const, onPress: go('/admin/work/clients') }] : []),
  ];

  return (
    <Screen header={<NavHeader title="Work" />} onRefresh={() => Promise.all([tasksQ.refetch(), scope.refetch(), clientsHero ? clientsQ.refetch() : null])}>
      {teamOn && tasksQ.data ? (
        <SummaryHero
          icon={ClipboardList}
          module="tasks"
          label="Team work open"
          value={open}
          unit={open === 1 ? 'task' : 'tasks'}
          onArrowPress={go('/admin/work/tasks')}
          arrowLabel="Open Team tasks"
          info={waiting ? { label: 'Waiting for your review', value: String(waiting), onPress: go('/inbox?type=task') } : undefined}
        />
      ) : clientsHero && clientsQ.data ? (
        <SummaryHero
          icon={UsersRound}
          module="tasks"
          label="Your clients"
          value={myClients}
          unit={myClients === 1 ? 'client' : 'clients'}
          onArrowPress={go('/admin/work/clients')}
          arrowLabel="Open Clients"
          sub={myClients ? 'Only you see the clients you add.' : 'Add the clients you work with, to call or email them from here.'}
        />
      ) : null}
      <CategoryGrid items={items} />
    </Screen>
  );
}
