// My expense reports: one for each time I sent bills (the website's "Statement of Expenses"),
// newest first, under a summary hero (what they add up to). A row opens the report, which can be
// shared, saved or printed.

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Camera, FileSpreadsheet, Wallet } from 'lucide-react-native';

import { usePettyCashOverview } from '@/api/petty-cash';
import { useSession } from '@/auth/session';
import { PettyReportsCard } from '@/features/petty-cash/lists';
import { billBatches, list, roleSeesPettyCash } from '@/features/petty-cash/logic';
import { plural } from '@/lib/format';
import { palette, radius } from '@/theme/tokens';
import { Button, EmptyState, ErrorState, NavHeader, Screen, Skeleton, SkeletonList, SummaryHero } from '@/ui';

// The summary hero's height (label, figure, info chip), for its loading placeholder.
const HERO_H = 196;

export default function PettyCashReportsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const allowed = roleSeesPettyCash(user);
  const overviewQ = usePettyCashOverview(allowed);
  const data = overviewQ.data;
  const batches = billBatches(list(data?.subs));
  const count = batches.length;
  const total = batches.reduce((s, b) => s + b.total, 0);
  const bills = batches.reduce((s, b) => s + b.count - b.rejected, 0);

  return (
    <Screen header={<NavHeader title="Expense reports" />} onRefresh={allowed ? () => qc.invalidateQueries({ queryKey: ['petty'] }) : undefined}>
      {!allowed ? (
        <EmptyState icon={<Wallet color={palette.textMuted} />} title="Petty cash isn’t available" message="It isn’t part of your role in DASH." />
      ) : !data ? (
        overviewQ.isLoading ? (
          // The hero's placeholder in the hero's slot; the rows' placeholder follows in the list's slot.
          <Skeleton height={HERO_H} radius={radius.xxl} />
        ) : (
          <ErrorState message={overviewQ.error?.message || 'Could not load your expense reports.'} onRetry={() => void overviewQ.refetch()} />
        )
      ) : count ? (
        <SummaryHero
          icon={FileSpreadsheet}
          module="pettyCash"
          label="Spent, in all your reports"
          value={total}
          currency="₹"
          info={{ label: plural(count, 'report'), value: plural(bills, 'bill') }}
        />
      ) : (
        <EmptyState
          icon={<FileSpreadsheet color={palette.textMuted} />}
          title="No expense reports yet"
          message="You get one each time you send bills."
          action={<Button title="Add bills" variant="accent" size="md" icon={<Camera />} onPress={() => router.replace('/petty-cash/bills/new')} />}
        />
      )}
      {allowed && !data && overviewQ.isLoading ? <SkeletonList rows={4} avatar /> : null}
      {allowed && data && count ? <PettyReportsCard data={data} title="Reports" /> : null}
    </Screen>
  );
}
