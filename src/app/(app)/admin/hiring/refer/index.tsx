// Refer & earn — the website's Referral Program for everyone (ReferralHub's header + Open Positions,
// dash.html:15263 and :15746). Who: navForRaw `referrals` (every staff role except accounts and the
// visitor manager, + the company switch), shown only when the person can post openings or at least one
// posting exists (:1532); anyone else is sent home.
//   a light SummaryHero: coins earned from my paid referrals (:15310), the My referrals chip;
//   the open positions (newest first) → the position's page, where Refer starts;
//   for the people who run hiring, a header button to Hiring.

import { Redirect, useRouter } from 'expo-router';
import { BriefcaseBusiness, Gift } from 'lucide-react-native';

import { useMyReferrals } from '@/api/hiring';
import { earnedFrom, isOpen } from '@/features/hiring/model';
import { JobRow } from '@/features/hiring/ui';
import { useHiring } from '@/features/hiring/use-hiring';
import { palette, radius } from '@/theme/tokens';
import { EmptyState, ErrorState, ListCard, NavHeader, Screen, SectionHeader, Skeleton, SkeletonList, SummaryHero, Text } from '@/ui';

export default function ReferScreen() {
  const router = useRouter();
  const h = useHiring();
  const mine = useMyReferrals(h.canRefer);

  if (!h.ready) {
    return (
      <Screen header={<NavHeader title="Refer & earn" />}>
        <SkeletonList key="s" rows={5} tone="surface" />
      </Screen>
    );
  }
  if (!h.canRefer) return <Redirect href="/" />;

  const open = (h.jobs.data ?? []).filter(isOpen);
  const myCount = mine.data?.length ?? 0;
  const earned = earnedFrom(mine.data);
  const desk = h.canManage || h.canCandidates || h.canApplications;

  return (
    <Screen
      header={
        <NavHeader
          title="Refer & earn"
          actions={desk ? [{ key: 'desk', icon: BriefcaseBusiness, label: 'Hiring', onPress: () => router.push('/admin/hiring') }] : []}
        />
      }
      onRefresh={() => Promise.all([h.jobs.refetch(), mine.refetch()])}>
      {mine.isPending ? (
        <Skeleton key="hero" height={210} radius={radius.xxl} />
      ) : (
        <SummaryHero
          key="hero"
          icon={Gift}
          module="bounty"
          label="Coins earned from referrals"
          value={earned}
          unit={earned === 1 ? 'coin' : 'coins'}
          sub="Refer someone you know. When they join and stay 3 months, you get the position’s bonus."
          info={{ label: 'My referrals', value: String(myCount), onPress: () => router.push('/admin/hiring/refer/mine'), accessibilityLabel: `My referrals, ${myCount}` }}
        />
      )}
      <SectionHeader key="head" title="Open positions" />
      {h.jobs.isError && !h.jobs.data ? (
        <ErrorState key="list" message={h.jobs.error?.message ?? 'The open positions could not be loaded.'} onRetry={() => void h.jobs.refetch()} />
      ) : open.length ? (
        <ListCard key="list" tone="surface">
          {open.map((j) => (
            <JobRow key={j.id} job={j} showStatus={false} onPress={() => router.push(`/admin/hiring/refer/${encodeURIComponent(j.id)}`)} />
          ))}
        </ListCard>
      ) : (
        <EmptyState key="list" icon={<BriefcaseBusiness color={palette.textMuted} strokeWidth={1.8} />} title="No open positions right now" message="When HR posts one, it shows up here." />
      )}
      <Text key="note" variant="caption" muted align="center">
        Referral bonuses are bounty coins. Use them in Bounty.
      </Text>
    </Screen>
  );
}
