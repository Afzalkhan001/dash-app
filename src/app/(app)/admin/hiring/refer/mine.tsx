// My referrals (MyReferralsBoard, dash.html:16227): everyone I referred, newest first — the position,
// when, where it stands, why it was rejected or not eligible, when the bonus can be approved, and the
// bonus once paid. Who: the Refer & earn audience; anyone else is sent home.

import { Redirect, useRouter } from 'expo-router';
import { Gift, UserPlus } from 'lucide-react-native';

import { useMyReferrals } from '@/api/hiring';
import { useTodayIst } from '@/features/attendance/use-now';
import { coins, earnedFrom, referralStatusLabel, referralStatusTone } from '@/features/hiring/model';
import { useHiring } from '@/features/hiring/use-hiring';
import { dateLabel } from '@/lib/dates';
import { palette } from '@/theme/tokens';
import { ActivityList, ActivityRow, Button, EmptyState, ErrorState, NavHeader, Screen, SkeletonList, Text } from '@/ui';

export default function MyReferralsScreen() {
  const router = useRouter();
  const today = useTodayIst();
  const h = useHiring();
  const q = useMyReferrals(h.canRefer);

  if (!h.ready) {
    return (
      <Screen header={<NavHeader title="My referrals" />}>
        <SkeletonList key="s" rows={5} avatar tone="surface" />
      </Screen>
    );
  }
  if (!h.canRefer) return <Redirect href="/" />;

  const rows = q.data ?? [];
  const earned = earnedFrom(rows);

  const noteOf = (r: (typeof rows)[number]) => {
    if (r.status === 'rejected') return r.rejectReason || null;
    if (r.status === 'not_eligible') return r.notEligibleReason || null;
    if (r.status === 'mapped' && r.eligibilityDate) return `Bonus can be approved from ${dateLabel(r.eligibilityDate, today)}`;
    return null;
  };

  return (
    <Screen header={<NavHeader title="My referrals" />} onRefresh={() => q.refetch()}>
      {q.isPending ? (
        <SkeletonList key="list" rows={5} avatar tone="surface" />
      ) : q.isError && !q.data ? (
        <ErrorState key="list" message={q.error?.message ?? 'Your referrals could not be loaded.'} onRetry={() => void q.refetch()} />
      ) : rows.length ? (
        <ActivityList key="list" title={`${rows.length} ${rows.length === 1 ? 'referral' : 'referrals'}`}>
          {rows.map((r) => (
            <ActivityRow
              key={r.id}
              person={{ name: r.candidateName }}
              title={r.candidateName}
              subtitle={[r.jobOpeningTitle, r.createdAt ? `Referred ${dateLabel(r.createdAt, today)}` : ''].filter(Boolean).join(' · ')}
              note={noteOf(r)}
              value={r.bonusPaid ? `+${Number(r.bonusAmount) || 0}` : null}
              status={{ label: referralStatusLabel(r), tone: referralStatusTone(r.status) }}
              subtitleLines={2}
            />
          ))}
        </ActivityList>
      ) : (
        <EmptyState
          key="list"
          icon={<UserPlus color={palette.textMuted} strokeWidth={1.8} />}
          title="You haven’t referred anyone yet"
          message="Know someone for an open position? Refer them and earn coins."
          action={<Button title="See open positions" variant="accent" size="md" onPress={() => router.replace('/admin/hiring/refer')} />}
        />
      )}
      {earned ? (
        <Text key="earned" variant="caption" muted align="center">
          {`You have earned ${coins(earned)} from referrals. They are in your Bounty wallet.`}
        </Text>
      ) : null}
      {rows.length ? <Button key="more" title="Refer someone else" variant="ghost" icon={<Gift />} onPress={() => router.replace('/admin/hiring/refer')} /> : null}
    </Screen>
  );
}
