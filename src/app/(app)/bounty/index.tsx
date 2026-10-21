// Bounty rewards — "Earn coins for extra tasks". The employee side of dash.html's BountyHub (~L14869),
// cut down to what a first-time user needs (Payno list screen):
//   1. the light coins hero (coins I can use, earned this month in its info chip) whose corner arrow
//      opens My coins,
//   2. at most one notice: a task I accepted and haven't started, or the monthly limit,
//   3. Find tasks: the latest 3 tasks I can still join, "See all" for the full board,
//   4. links: My bounty tasks (what I joined and where it stands; hidden for people who can't take
//      part and never did) and Leaderboard.
// Shown only while the company has Bounty switched on and the role has it (BountyGate).
// Old links /bounty?tab=claims|leaderboard|wallet open the matching screen.

import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ListChecks, Search, Trophy } from 'lucide-react-native';
import { View } from 'react-native';

import {
  type BountyClaimReminder,
  type BountyLeaderRow,
  useBountyCapStatus,
  useBountyClaimReminders,
  useBountyLeaderboard,
  useBountyTasks,
  useBountyTransactions,
  useBountyWallet,
} from '@/api/bounty';
import { useTodayIst } from '@/features/attendance/use-now';
import { BountyCapBanner, BountyClaimReminderCard, BountyCoinsHero, BountyCoinsHeroSkeleton, BountyTaskList, BountyTaskListSkeleton } from '@/features/bounty/components';
import { BountyGate } from '@/features/bounty/gate';
import { useBountyLabels } from '@/features/bounty/hooks';
import { asArray, boardTasks, claimIsActive, coins, earnedThisMonth, myClaimOf, num, tasksToFind } from '@/features/bounty/logic';
import { palette } from '@/theme/tokens';
import { ActivityList, ActivityRow, Card, EmptyState, ErrorState, NavHeader, Screen, SectionHeader } from '@/ui';

const TITLE = 'Bounty rewards';
const PREVIEW = 3;
const LEGACY_TAB: Record<string, string> = { claims: '/bounty/claims', leaderboard: '/bounty/leaderboard', wallet: '/bounty/wallet' };

export default function BountyScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const legacy = typeof params.tab === 'string' ? LEGACY_TAB[params.tab] : undefined;
  if (legacy) return <Redirect href={legacy} />;
  return (
    <BountyGate title={TITLE}>
      <BountyHub />
    </BountyGate>
  );
}

function BountyHub() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, canClaim } = useBountyLabels();
  const today = useTodayIst();
  const userId = user?.id;

  const walletQ = useBountyWallet();
  const txnsQ = useBountyTransactions();
  const lbQ = useBountyLeaderboard(20);
  const remindQ = useBountyClaimReminders(canClaim);
  const tasksQ = useBountyTasks();
  const capQ = useBountyCapStatus();

  const wallet = walletQ.data && typeof walletQ.data === 'object' ? walletQ.data : undefined;
  const redeemable = Math.max(0, num(wallet?.earned) - num(wallet?.redeemed));
  const month = earnedThisMonth(asArray(txnsQ.data), userId ?? '', today.slice(0, 7));
  const me = lbQ.data?.me && typeof lbQ.data.me === 'object' ? (lbQ.data.me as BountyLeaderRow) : null;
  const myRank = me ? num(me.rank) || null : null;

  const all = boardTasks(tasksQ.data);
  const loaded = Array.isArray(tasksQ.data);
  const toFind = tasksToFind(all, userId, today, canClaim);
  const mine = all.filter((t) => !!myClaimOf(t, userId));
  const active = mine.filter((t) => claimIsActive(myClaimOf(t, userId))).length;
  const reminders = asArray<BountyClaimReminder>(remindQ.data);

  // One notice at a time: an accepted task that isn't started beats the monthly limit. With several,
  // the notice has no button of its own: "My bounty tasks" below is the way to them.
  const capped = !!capQ.data?.capped;
  const notice = reminders.length ? (
    <BountyClaimReminderCard items={reminders} />
  ) : capped ? (
    <BountyCapBanner cap={capQ.data} />
  ) : null;

  const findTitle = canClaim ? 'Find tasks' : 'Open tasks';
  const seeAll = loaded && all.length > Math.min(toFind.length, PREVIEW);

  return (
    <Screen header={<NavHeader title={TITLE} />} onRefresh={() => qc.invalidateQueries({ queryKey: ['bounty'] })}>
      {walletQ.isLoading ? (
        <BountyCoinsHeroSkeleton />
      ) : walletQ.error && !wallet ? (
        <Card>
          <ErrorState title="Couldn’t load your coins" message={walletQ.error.message} onRetry={() => void walletQ.refetch()} />
        </Card>
      ) : (
        <BountyCoinsHero
          redeemable={redeemable}
          info={month > 0 ? { label: 'Earned this month', value: `+${coins(month)}` } : undefined}
          caption={month > 0 ? undefined : 'Earn coins for extra tasks'}
          onArrowPress={() => router.push('/bounty/wallet')}
          arrowLabel="Open My coins"
        />
      )}

      {notice}

      {tasksQ.isLoading ? (
        <View style={{ gap: 4 }}>
          <SectionHeader title={findTitle} />
          <BountyTaskListSkeleton count={PREVIEW} />
        </View>
      ) : tasksQ.error && !loaded ? (
        <View style={{ gap: 4 }}>
          <SectionHeader title={findTitle} />
          <Card>
            <ErrorState message={tasksQ.error.message} onRetry={() => void tasksQ.refetch()} />
          </Card>
        </View>
      ) : toFind.length ? (
        <BountyTaskList
          title={findTitle}
          onSeeAll={seeAll ? () => router.push('/bounty/tasks') : undefined}
          tasks={toFind.slice(0, PREVIEW)}
          userId={userId}
          today={today}
          onOpen={(t) => router.push(`/bounty/${encodeURIComponent(t.id)}`)}
        />
      ) : (
        <View style={{ gap: 4 }}>
          <SectionHeader
            title={findTitle}
            actionLabel="See all"
            actionAccessibilityLabel="See all bounty tasks"
            onAction={seeAll ? () => router.push('/bounty/tasks') : undefined}
          />
          <Card>
            <EmptyState
              icon={<Search color={palette.textMuted} />}
              title={capped ? 'No new tasks this month' : 'No new tasks right now'}
              message={
                capped
                  ? reminders.length
                    ? 'You reached this month’s limit. New tasks come back next month.'
                    : undefined // the "Monthly limit reached" notice above already says why
                  : all.length
                    ? canClaim
                      ? 'All tasks are full, closed or already yours.'
                      : 'All tasks are full or closed.'
                    : 'When someone posts a task, it shows up here.'
              }
            />
          </Card>
        </View>
      )}

      <ActivityList>
        {canClaim || mine.length ? (
          <ActivityRow
            module="bounty"
            icon={ListChecks}
            title="My bounty tasks"
            subtitle={!loaded ? 'Tasks you took part in' : active ? `${active} in progress or waiting` : mine.length ? `${mine.length} finished` : 'Nothing yet'}
            chevron
            onPress={() => router.push('/bounty/claims')}
          />
        ) : null}
        <ActivityRow
          module="bounty"
          icon={Trophy}
          title="Leaderboard"
          subtitle={myRank ? `You’re No. ${myRank}` : 'Top earners'}
          chevron
          onPress={() => router.push('/bounty/leaderboard')}
        />
      </ActivityList>
    </Screen>
  );
}
