// My bounty tasks (named apart from the work list "My tasks") — every bounty task I joined, as Lendora
// MetricRows (the task, my reward as a light figure, my status as a soft pill). A light hero on top
// (coins these tasks paid me, how many are still going), then a filter pill: "In progress" (not
// started, working on it, sent back, waiting for review), "Finished" (paid, rejected, expired) or
// "All" (both groups). Tapping a row opens the task, where the next step (Start / Send your work /
// view what I sent) lives.

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ListChecks } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useBountyClaimReminders, useBountyTasks } from '@/api/bounty';
import { useTodayIst } from '@/features/attendance/use-now';
import { BountyClaimMetricRow, BountyClaimReminderCard, BountyTaskListSkeleton } from '@/features/bounty/components';
import { BountyGate } from '@/features/bounty/gate';
import { useBountyLabels } from '@/features/bounty/hooks';
import { asArray, boardTasks, claimIsActive, claimReward, myClaimOf, myClaimTasks, num } from '@/features/bounty/logic';
import { FilterPill } from '@/features/petty-cash/filter-pill';
import { plural } from '@/lib/format';
import { palette, space } from '@/theme/tokens';
import { Button, Card, EmptyState, ErrorState, NavHeader, Screen, SectionHeader, SummaryHero } from '@/ui';

const TITLE = 'My bounty tasks';
type Filter = 'all' | 'active' | 'done';

export default function BountyClaimsScreen() {
  return (
    <BountyGate title={TITLE}>
      <MyTasks />
    </BountyGate>
  );
}

function MyTasks() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, canClaim } = useBountyLabels();
  const today = useTodayIst();
  const tasksQ = useBountyTasks();
  const remindQ = useBountyClaimReminders(canClaim);
  const userId = user?.id;
  const [picked, setFilter] = useState<Filter>('all');

  const mine = myClaimTasks(boardTasks(tasksQ.data), userId);
  const active = mine.filter((t) => claimIsActive(myClaimOf(t, userId)));
  const done = mine.filter((t) => !claimIsActive(myClaimOf(t, userId)));
  const paid = mine.filter((t) => myClaimOf(t, userId)?.status === 'completed').reduce((s, t) => s + num(claimReward(t, myClaimOf(t, userId))), 0);
  const open = (id: string) => router.push(`/bounty/${encodeURIComponent(id)}`);
  // A filter whose group has emptied (after a refresh) falls back to All.
  const filter: Filter = (picked === 'active' && !active.length) || (picked === 'done' && !done.length) ? 'all' : picked;
  const showActive = filter !== 'done' && active.length > 0;
  const showDone = filter !== 'active' && done.length > 0;

  const filterPill =
    active.length && done.length ? (
      <FilterPill<Filter>
        title="Show tasks"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All', count: mine.length },
          { value: 'active', label: 'In progress', count: active.length },
          { value: 'done', label: 'Finished', count: done.length },
        ]}
      />
    ) : undefined;

  return (
    <Screen
      header={<NavHeader title={TITLE} />}
      onRefresh={() => Promise.all([qc.invalidateQueries({ queryKey: ['bounty', 'tasks'] }), qc.invalidateQueries({ queryKey: ['bounty', 'my-claims'] })])}>
      {mine.length ? (
        <SummaryHero
          icon={ListChecks}
          module="bounty"
          label="Coins these tasks paid you"
          value={paid}
          unit="coins"
          info={active.length ? { label: 'Still going', value: plural(active.length, 'task') } : undefined}
          sub={`${plural(mine.length, 'task')} joined`}
        />
      ) : null}
      <BountyClaimReminderCard items={asArray(remindQ.data)} />
      {tasksQ.isLoading ? (
        <BountyTaskListSkeleton count={3} />
      ) : tasksQ.error && !Array.isArray(tasksQ.data) ? (
        <Card>
          <ErrorState message={tasksQ.error.message} onRetry={() => void tasksQ.refetch()} />
        </Card>
      ) : !mine.length ? (
        <Card>
          <EmptyState
            icon={<ListChecks color={palette.textMuted} />}
            title="Nothing here yet"
            message={canClaim ? 'Tasks you send work for show up here.' : 'Your role posts or oversees tasks, so it doesn’t take part in them.'}
            action={canClaim ? <Button title="Find tasks" variant="accent" size="md" onPress={() => router.dismissTo('/bounty')} /> : undefined}
          />
        </Card>
      ) : null}
      {/* Separate Screen children (not one fragment), so the screen's gap sits between the groups. */}
      {showActive ? (
        <View style={{ gap: space.xs }}>
          <SectionHeader title="In progress" right={filterPill} />
          {active.map((t) => (
            <BountyClaimMetricRow key={t.id} task={t} userId={userId} today={today} onPress={() => open(t.id)} />
          ))}
        </View>
      ) : null}
      {showDone ? (
        <View style={{ gap: space.xs }}>
          <SectionHeader title="Finished" right={showActive ? undefined : filterPill} />
          {done.map((t) => (
            <BountyClaimMetricRow key={t.id} task={t} userId={userId} today={today} onPress={() => open(t.id)} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
