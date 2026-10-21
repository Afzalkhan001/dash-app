// Visitors (web: MyVisitorsHub), in the order you need it:
//   1. a light SummaryHero: how many people are waiting for me at reception, a "Past visits" chip and
//      the one main action, "Invite a guest" (the form is its own screen, /visitors/invite);
//   2. who is waiting — each row opens the visitor in the Inbox, where Let in / Turn away live (one home
//      for the decision). When nobody is waiting this slot is simply empty;
//   3. the latest visitors with "See all" (/visitors/history), and a link to my invitations.
// Waiting visitors refresh every 30 s while this screen is in front (the web polls too), so someone
// standing at the desk shows up without a pull-to-refresh. Old links ?tab=invite|history still work.

import { Redirect, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { DoorOpen, Ticket, UserPlus } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';

import { useMyVisitors } from '@/api/visitors';
import { asVisits } from '@/features/visitors/format';
import { RecentVisitors } from '@/features/visitors/history-list';
import { VisitCard } from '@/features/visitors/visit-card';
import { motion, radius, space } from '@/theme/tokens';
import { ErrorState, ListCard, ListRow, ModuleBadge, NavHeader, Screen, SectionHeader, Skeleton, SummaryHero } from '@/ui';

// A visitor who arrives while the screen is open (30 s poll) fades in; rows leaving the list
// (approved / rejected) fade out and the rest glide into place (§13). The first render skips the
// entering fade — the Screen's own entrance already plays then (also when the first visitor arrives
// on an empty screen: the slot mounts and fades up). When the last row goes, the slot goes with it.
const LIST_MOTION = LinearTransition.springify().stiffness(247).damping(30).mass(1);
const ARRIVE = FadeIn.duration(motion.base);
const LEAVE = FadeOut.duration(200);

export default function VisitorsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const focused = useIsFocused();
  const visits = useMyVisitors({ poll: focused });

  if (params.tab === 'invite') return <Redirect href="/visitors/invite" />;
  if (params.tab === 'history') return <Redirect href="/visitors/history" />;

  const pending = asVisits(visits.data?.pending);
  const history = asVisits(visits.data?.history);
  const waiting = pending.length > 0;
  const loaded = !!visits.data;
  const openHistory = () => router.push('/visitors/history');

  return (
    <Screen header={<NavHeader title="Visitors" />} onRefresh={() => visits.refetch()}>
      {/* 1 · State + the one action. The hero is there in every state, so "Invite a guest" is always
          one tap away; only its figure waits for the data. */}
      <SummaryHero
        icon={DoorOpen}
        module="visitors"
        label="Waiting for you at reception"
        value={loaded ? pending.length : undefined}
        unit={pending.length === 1 ? 'visitor' : 'visitors'}
        figure={loaded ? undefined : visits.isError ? null : <Skeleton width={120} height={48} radius={radius.sm} />}
        sub={
          loaded
            ? waiting
              ? 'Tap a visitor to let them in or turn them away.'
              : 'Nobody is waiting for you right now.'
            : undefined
        }
        info={loaded && history.length ? { label: 'Past visits', value: String(history.length), onPress: openHistory } : undefined}
        action={{ title: 'Invite a guest', icon: <UserPlus />, onPress: () => router.push('/visitors/invite') }}
      />

      {/* 2 · Who is at reception for me — nothing at all when nobody is (hide empty). One Screen slot
          for every state, so the entrance plays once and not again when the data lands (§12). */}
      {loaded ? (
        waiting ? (
          // skipExiting: when the screen goes away, the rows must not play their fade-out.
          <LayoutAnimationConfig skipEntering skipExiting>
            <View style={{ gap: space.sm }}>
              {/* The hero already says how many; the heading doesn't count them again. */}
              <SectionHeader title="Waiting for you" />
              {pending.map((v, i) => (
                <Animated.View key={v.id ?? i} layout={LIST_MOTION} entering={ARRIVE} exiting={LEAVE}>
                  <VisitCard visit={v} />
                </Animated.View>
              ))}
            </View>
          </LayoutAnimationConfig>
        ) : null
      ) : visits.isError ? (
        <ErrorState message={visits.error?.message ?? ''} onRetry={() => void visits.refetch()} />
      ) : null}

      {/* 3 · History, one tap away. */}
      {loaded ? <RecentVisitors visits={history} onSeeAll={openHistory} /> : null}

      <ListCard>
        <ListRow
          left={<ModuleBadge module="visitors" icon={Ticket} />}
          title="Your invitations"
          subtitle="Codes and passes for your guests"
          subtitleLines={2}
          chevron
          onPress={() => router.push('/visitors/invitations')}
        />
      </ListCard>
    </Screen>
  );
}
