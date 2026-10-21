// Leaderboard — top earners of all time (GET /bounty/leaderboard, top 20). State first: my own rank
// as a Lendora RankSlider in a light hero (my coins in its info chip), then the podium, then everyone
// else as rows.

import { useQueryClient } from '@tanstack/react-query';
import { Trophy } from 'lucide-react-native';
import { View } from 'react-native';

import { type BountyLeaderRow, useBountyLeaderboard } from '@/api/bounty';
import { useSession } from '@/auth/session';
import { BountyLeaderListRow, BountyPodium, BountyRankHero, LEADER_ROW_INSET } from '@/features/bounty/components';
import { BountyGate } from '@/features/bounty/gate';
import { asArray, num } from '@/features/bounty/logic';
import { palette, radius, space } from '@/theme/tokens';
import { ActivityList, Card, EmptyState, ErrorState, NavHeader, Screen, SectionHeader, Skeleton, SkeletonList, Text } from '@/ui';

const TITLE = 'Leaderboard';

export default function BountyLeaderboardScreen() {
  return (
    <BountyGate title={TITLE}>
      <Leaderboard />
    </BountyGate>
  );
}

function Leaderboard() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  const lbQ = useBountyLeaderboard(20);

  const rows = asArray<BountyLeaderRow>(lbQ.data?.top).filter((r) => !!r && typeof r === 'object' && !!r.employeeId);
  const me = lbQ.data?.me && typeof lbQ.data.me === 'object' ? (lbQ.data.me as BountyLeaderRow) : null;
  const rest = rows.slice(3);
  const ranked = num(lbQ.data?.totalRanked) || rows.length;

  return (
    <Screen header={<NavHeader title={TITLE} />} onRefresh={() => qc.invalidateQueries({ queryKey: ['bounty', 'leaderboard'] })}>
      {lbQ.isLoading ? (
        <Skeleton height={236} radius={radius.xxl} />
      ) : lbQ.error && !lbQ.data ? (
        <Card>
          <ErrorState message={lbQ.error.message} onRetry={() => void lbQ.refetch()} />
        </Card>
      ) : !rows.length ? (
        <Card>
          <EmptyState icon={<Trophy color={palette.textMuted} />} title="No one is on the board yet" message="Finish a task to be the first." />
        </Card>
      ) : me ? (
        <BountyRankHero me={me} ranked={ranked} />
      ) : (
        <Text variant="label" muted align="center">
          Finish a task to get on the board.
        </Text>
      )}
      {lbQ.isLoading ? <Skeleton height={232} radius={radius.xl} /> : null}
      {lbQ.isLoading ? <SkeletonList rows={3} avatar /> : null}
      {rows.length ? (
        <View style={{ gap: space.xs }}>
          <SectionHeader
            title="Top earners"
            right={
              <Text variant="label" muted tabular numberOfLines={1}>
                {ranked} ranked · all time
              </Text>
            }
          />
          <BountyPodium rows={rows} meId={userId} />
        </View>
      ) : null}
      {rest.length ? (
        <ActivityList separatorInset={LEADER_ROW_INSET}>
          {rest.map((r) => (
            <BountyLeaderListRow key={r.employeeId} row={r} isMe={r.employeeId === userId} />
          ))}
        </ActivityList>
      ) : null}
    </Screen>
  );
}
