// All bounty tasks — the full board behind "Find tasks › See all". A light hero (the coins on offer in
// tasks I can join), the monthly-limit notice, and the list with a filter pill: "Can join" (the same
// list as Find tasks, every one of them) or "All" (also full, closed, finished and my own tasks).

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Coins, ListChecks } from 'lucide-react-native';
import { useState } from 'react';

import { useBountyCapStatus, useBountyTasks } from '@/api/bounty';
import { useTodayIst } from '@/features/attendance/use-now';
import { BountyCapBanner, BountyTaskList, BountyTaskListSkeleton } from '@/features/bounty/components';
import { BountyGate } from '@/features/bounty/gate';
import { useBountyLabels } from '@/features/bounty/hooks';
import { boardTasks, headlineReward, num, tasksToFind } from '@/features/bounty/logic';
import { FilterPill } from '@/features/petty-cash/filter-pill';
import { plural } from '@/lib/format';
import { palette } from '@/theme/tokens';
import { Button, Card, EmptyState, ErrorState, NavHeader, Screen, SummaryHero } from '@/ui';

const TITLE = 'All bounty tasks';

export default function BountyTasksScreen() {
  return (
    <BountyGate title={TITLE}>
      <AllTasks />
    </BountyGate>
  );
}

function AllTasks() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, canClaim } = useBountyLabels();
  const today = useTodayIst();
  const tasksQ = useBountyTasks();
  const capQ = useBountyCapStatus();
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const all = boardTasks(tasksQ.data);
  const open = tasksToFind(all, user?.id, today, canClaim);
  const capped = !!capQ.data?.capped;
  const visible = filter === 'open' ? open : all;
  const loaded = Array.isArray(tasksQ.data);
  const onOffer = open.reduce((s, t) => s + num(headlineReward(t)), 0);
  const openLabel = canClaim ? 'Can join' : 'Open';

  return (
    <Screen
      header={<NavHeader title={TITLE} />}
      onRefresh={() => Promise.all([qc.invalidateQueries({ queryKey: ['bounty', 'tasks'] }), qc.invalidateQueries({ queryKey: ['bounty', 'cap'] })])}>
      {loaded ? (
        <SummaryHero
          icon={Coins}
          module="bounty"
          label={canClaim ? 'Coins you can earn' : 'Coins on open tasks'}
          value={onOffer}
          unit="coins"
          info={{ label: canClaim ? 'Tasks you can join' : 'Open tasks', value: plural(open.length, 'task') }}
        />
      ) : null}
      <BountyCapBanner cap={capQ.data} />
      {tasksQ.isLoading ? (
        <BountyTaskListSkeleton count={4} />
      ) : tasksQ.error && !loaded ? (
        <Card>
          <ErrorState message={tasksQ.error.message} onRetry={() => void tasksQ.refetch()} />
        </Card>
      ) : visible.length ? (
        <BountyTaskList
          title="Tasks"
          right={
            <FilterPill<'open' | 'all'>
              title="Show tasks"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'open', label: openLabel, count: open.length },
                { value: 'all', label: 'All tasks', count: all.length },
              ]}
            />
          }
          tasks={visible}
          userId={user?.id}
          today={today}
          onOpen={(t) => router.push(`/bounty/${encodeURIComponent(t.id)}`)}
        />
      ) : (
        <Card>
          <EmptyState
            icon={<ListChecks color={palette.textMuted} />}
            title={capped ? 'No new tasks this month' : all.length ? 'No new tasks right now' : 'No tasks yet'}
            // When capped, the "Monthly limit reached" notice above already says why.
            message={
              capped
                ? undefined
                : all.length
                  ? canClaim
                    ? 'All tasks are full, closed or already yours.'
                    : 'All tasks are full or closed.'
                  : 'When someone posts a task, it shows up here.'
            }
            action={all.length && filter === 'open' ? <Button title="Show all" variant="accent" size="md" onPress={() => setFilter('all')} /> : undefined}
          />
        </Card>
      )}
    </Screen>
  );
}
