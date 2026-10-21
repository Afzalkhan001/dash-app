// One open position, for referring someone (ReferralJobDetailsModal, dash.html:15711). Who: the Refer &
// earn audience (features/hiring/access canSeeReferrals); anyone else is sent home.
//   a light SummaryHero: the referral bonus per hire (or the number of openings when there is none);
//   the picture; the description; the facts the posting has (:15715 chips);
//   while it is open, a sticky "Refer someone" → /admin/hiring/refer/new?job=<id>.

import { Image } from 'expo-image';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { BriefcaseBusiness, Gift, UserPlus } from 'lucide-react-native';

import { useJobImage } from '@/api/hiring';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { bonusOf, citiesOf, coins, employmentTypeLabel, isOpen, jobRef, positionsOf } from '@/features/hiring/model';
import { useHiring } from '@/features/hiring/use-hiring';
import { ago } from '@/features/inbox/format';
import { dateLabel } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { ActionBar, Button, Card, CardHeader, EmptyState, NavHeader, Screen, SkeletonList, SummaryCard, SummaryHero, Text } from '@/ui';

export default function ReferJobScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(Array.isArray(params.id) ? params.id[0] : params.id || '');
  const router = useRouter();
  const today = useTodayIst();
  const now = useNow();
  const h = useHiring();
  const job = (h.jobs.data ?? []).find((j) => j.id === id) ?? null;
  const img = useJobImage(job);

  if (!h.ready || (!job && h.jobs.isFetching)) {
    return (
      <Screen header={<NavHeader title="Open position" />}>
        <SkeletonList key="s" rows={5} tone="surface" />
      </Screen>
    );
  }
  if (!h.canRefer) return <Redirect href="/" />;
  if (!job) {
    return (
      <Screen header={<NavHeader title="Open position" />} onRefresh={() => h.jobs.refetch()}>
        <EmptyState
          key="none"
          icon={<BriefcaseBusiness color={palette.textMuted} strokeWidth={1.8} />}
          title="Position not found"
          message="It may have been filled or taken down."
          action={<Button title="See open positions" variant="accent" size="md" onPress={() => router.replace('/admin/hiring/refer')} />}
        />
      </Screen>
    );
  }

  const open = isOpen(job);
  const bonus = bonusOf(job);
  const total = positionsOf(job);
  const facts = [
    { key: 'n', label: 'Openings', value: String(total) },
    { key: 'where', label: 'Where', value: citiesOf(job.location).join(', ') },
    { key: 'dept', label: 'Department', value: job.department },
    { key: 'exp', label: 'Experience', value: job.experienceRequired },
    { key: 'pkg', label: 'Package', value: job.package },
    { key: 'type', label: 'Type', value: employmentTypeLabel(job.employmentType) || null },
    { key: 'by', label: 'Apply by', value: job.applicationDeadline ? dateLabel(job.applicationDeadline, today) : '' },
    { key: 'id', label: 'Job ID', value: jobRef(job.id), hint: job.createdAt ? `Posted ${ago(job.createdAt, now)}` : null },
  ].filter((r) => !!r.value);

  return (
    <Screen
      header={<NavHeader title="Open position" />}
      footer={
        open ? (
          <ActionBar note={bonus ? `Earn ${coins(bonus)} when they join and stay 3 months.` : 'Help build the team.'}>
            <Button title="Refer someone" icon={<UserPlus />} onPress={() => router.push(`/admin/hiring/refer/new?job=${encodeURIComponent(job.id)}`)} />
          </ActionBar>
        ) : undefined
      }
      onRefresh={() => h.jobs.refetch()}>
      <SummaryHero
        key="hero"
        icon={bonus ? Gift : BriefcaseBusiness}
        module={bonus ? 'bounty' : 'people'}
        label={job.position}
        value={bonus || total}
        unit={bonus ? 'coins bonus per hire' : total === 1 ? 'opening' : 'openings'}
        sub={open ? 'Open for referrals' : 'Closed. No more referrals for it.'}
      />
      {img.data ? <Image key="img" source={{ uri: img.data }} style={styles.image} contentFit="cover" cachePolicy="none" accessibilityLabel={`${job.position} picture`} /> : null}
      {job.description ? (
        <Card key="desc" tone="frostStrong" style={styles.card}>
          <CardHeader title="About the role" />
          <Text variant="body">{job.description}</Text>
        </Card>
      ) : null}
      <SummaryCard key="facts" title="Details" rows={facts} />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  card: { gap: space.sm },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.xl },
}));
