// All my petty cash requests (the main screen shows the latest 3), newest first. The title says what
// kind of requests these are, since several modules have "requests". A summary hero on top (what I
// asked for so far, how many still wait), a filter pill (All / Waiting / Approved / Paid / Rejected),
// then the rows; a row opens the request's own screen, where any action it needs sits in the bottom bar.

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Wallet } from 'lucide-react-native';
import { useState } from 'react';

import { usePettyCashOverview } from '@/api/petty-cash';
import { useSession } from '@/auth/session';
import { FilterPill } from '@/features/petty-cash/filter-pill';
import { PettyRequestsCard } from '@/features/petty-cash/lists';
import { amount, list, myRequests, type RequestGroup, requestGroup, roleSeesPettyCash } from '@/features/petty-cash/logic';
import { plural } from '@/lib/format';
import { palette, radius } from '@/theme/tokens';
import { Button, EmptyState, ErrorState, NavHeader, Screen, Skeleton, SkeletonList, SummaryHero } from '@/ui';

type Filter = 'all' | RequestGroup;
// The summary hero's height (label, figure, info chip, line), for its loading placeholder.
const HERO_H = 236;
const FILTERS: Filter[] = ['all', 'waiting', 'approved', 'paid', 'rejected'];
const FILTER_LABEL: Record<Filter, string> = { all: 'All requests', waiting: 'Waiting', approved: 'Approved, not paid', paid: 'Paid', rejected: 'Rejected' };

export default function PettyCashRequestsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const allowed = roleSeesPettyCash(user);
  const overviewQ = usePettyCashOverview(allowed);
  const [picked, setFilter] = useState<Filter>('all');
  const data = overviewQ.data;
  const mine = myRequests(user?.id, list(data?.requests));

  const counts: Record<Filter, number> = { all: mine.length, waiting: 0, approved: 0, paid: 0, rejected: 0 };
  for (const r of mine) counts[requestGroup(r.status)] += 1;
  const askedFor = mine.filter((r) => r.status !== 'rejected' && r.kind !== 'excess').reduce((s, r) => s + amount(r.amount), 0);
  const groupsUsed = FILTERS.filter((f) => f !== 'all' && counts[f] > 0).length;
  // A filter whose group has emptied (after a refresh) falls back to All.
  const filter: Filter = picked !== 'all' && !counts[picked] ? 'all' : picked;

  return (
    <Screen header={<NavHeader title="Petty cash requests" />} onRefresh={allowed ? () => qc.invalidateQueries({ queryKey: ['petty'] }) : undefined}>
      {!allowed ? (
        <EmptyState icon={<Wallet color={palette.textMuted} />} title="Petty cash isn’t available" message="It isn’t part of your role in DASH." />
      ) : !data ? (
        overviewQ.isLoading ? (
          // The hero's placeholder in the hero's slot; the rows' placeholder follows in the list's slot.
          <Skeleton height={HERO_H} radius={radius.xxl} />
        ) : (
          <ErrorState message={overviewQ.error?.message || 'Could not load your requests.'} onRetry={() => void overviewQ.refetch()} />
        )
      ) : mine.length ? (
        <SummaryHero
          icon={Wallet}
          module="pettyCash"
          label="Asked for so far"
          value={askedFor}
          currency="₹"
          info={counts.waiting ? { label: 'Waiting for a decision', value: plural(counts.waiting, 'request') } : undefined}
          sub={`${plural(mine.length, 'request')} in all`}
        />
      ) : (
        <EmptyState
          icon={<Wallet color={palette.textMuted} />}
          title="No requests yet"
          message="Ask for money before you spend it on office work."
          action={<Button title="Request money" variant="accent" size="md" onPress={() => router.replace('/petty-cash/new')} />}
        />
      )}
      {allowed && !data && overviewQ.isLoading ? <SkeletonList rows={5} avatar /> : null}
      {allowed && data && mine.length ? (
        <PettyRequestsCard
          data={data}
          meId={user?.id}
          title="Requests"
          filter={filter === 'all' ? undefined : (r) => requestGroup(r.status) === filter}
          empty="No requests here."
          right={
            groupsUsed > 1 ? (
              <FilterPill<Filter>
                title="Show requests"
                value={filter}
                onChange={setFilter}
                options={FILTERS.filter((f) => f === 'all' || counts[f] > 0 || f === filter).map((f) => ({ value: f, label: FILTER_LABEL[f], count: counts[f] }))}
              />
            ) : undefined
          }
        />
      ) : null}
    </Screen>
  );
}
