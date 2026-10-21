// My bills: every bill I added against a project code, newest first. A summary hero on top (what my
// bills add up to, with "Add bills" — the one action), the one notice about bills that went over my
// petty cash, a filter pill (All / Extra claims / Rejected), then the rows. A bill opens its receipt (or
// asks: receipt or expense report).

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Camera, ReceiptText, Wallet } from 'lucide-react-native';
import { useState } from 'react';

import { type PettyCashSubmission, usePettyCashOverview } from '@/api/petty-cash';
import { useSession } from '@/auth/session';
import { FilterPill } from '@/features/petty-cash/filter-pill';
import { PettyBillsCard, PettyExcessBanner } from '@/features/petty-cash/lists';
import { amount, list, roleSeesPettyCash } from '@/features/petty-cash/logic';
import { plural } from '@/lib/format';
import { palette, radius } from '@/theme/tokens';
import { EmptyState, ErrorState, NavHeader, Screen, Skeleton, SkeletonList, SummaryHero } from '@/ui';

type Filter = 'all' | 'extra' | 'rejected';
// The summary hero's height (label, figure, info chip, line, Add bills), for its loading placeholder.
const HERO_H = 300;
const FILTER_LABEL: Record<Filter, string> = { all: 'All bills', extra: 'Extra claims', rejected: 'Rejected' };
const groupOf = (b: PettyCashSubmission): Filter => (b.status === 'rejected' ? 'rejected' : b.excessRequestId ? 'extra' : 'all');

export default function PettyCashBillsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const allowed = roleSeesPettyCash(user);
  const overviewQ = usePettyCashOverview(allowed);
  const [picked, setFilter] = useState<Filter>('all');
  const data = overviewQ.data;
  const ready = allowed && !!data;
  const bills = list(data?.subs).filter(Boolean);
  const hasBills = bills.length > 0;

  const counts: Record<Filter, number> = { all: bills.length, extra: 0, rejected: 0 };
  for (const b of bills) {
    const g = groupOf(b);
    if (g !== 'all') counts[g] += 1;
  }
  // A filter whose group has emptied (after a refresh) falls back to All.
  const filter: Filter = picked !== 'all' && !counts[picked] ? 'all' : picked;
  const inBills = bills.filter((b) => b.status !== 'rejected').reduce((s, b) => s + amount(b.amount), 0);
  const addBills = () => router.push('/petty-cash/bills/new');

  return (
    <Screen header={<NavHeader title="My bills" />} onRefresh={allowed ? () => qc.invalidateQueries({ queryKey: ['petty'] }) : undefined}>
      {!allowed ? (
        <EmptyState icon={<Wallet color={palette.textMuted} />} title="Petty cash isn’t available" message="It isn’t part of your role in DASH." />
      ) : !data ? (
        overviewQ.isLoading ? (
          // The hero's placeholder in the hero's slot; the rows' placeholder follows in the list's slot.
          <Skeleton height={HERO_H} radius={radius.xxl} />
        ) : (
          <ErrorState message={overviewQ.error?.message || 'Could not load your bills.'} onRetry={() => void overviewQ.refetch()} />
        )
      ) : (
        <SummaryHero
          icon={ReceiptText}
          module="pettyCash"
          label="Your bills add up to"
          value={inBills}
          currency="₹"
          info={counts.rejected ? { label: 'Not counted', value: `${counts.rejected} rejected` } : undefined}
          sub={hasBills ? plural(bills.length, 'bill') : 'Add a photo of each bill you paid with petty cash.'}
          action={{ title: 'Add bills', icon: <Camera />, onPress: addBills }}
        />
      )}
      {allowed && !data && overviewQ.isLoading ? <SkeletonList rows={5} avatar /> : null}
      {/* Only mounted when it shows: an empty Screen child would still take a gap. */}
      {ready && list(data.excess).some((x) => !!x && typeof x === 'object') ? <PettyExcessBanner excess={data.excess} /> : null}
      {ready && hasBills ? (
        <PettyBillsCard
          data={data}
          title="Bills"
          filter={filter === 'all' ? undefined : (b) => groupOf(b) === filter}
          empty="No bills here."
          right={
            counts.extra || counts.rejected ? (
              <FilterPill<Filter>
                title="Show bills"
                value={filter}
                onChange={setFilter}
                options={(['all', 'extra', 'rejected'] as const)
                  .filter((f) => f === 'all' || counts[f] > 0 || f === filter)
                  .map((f) => ({ value: f, label: FILTER_LABEL[f], count: counts[f] }))}
              />
            ) : undefined
          }
        />
      ) : null}
      {ready && !hasBills ? <EmptyState icon={<ReceiptText color={palette.textMuted} />} title="No bills yet" message="Bills you add show up here." /> : null}
    </Screen>
  );
}
