// My expense reports: one for each time I sent bills (the website's "Statement of Expenses"),
// newest first, under a summary hero (what they add up to). A row opens the report, which can be
// shared, saved or printed.

import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Wallet } from 'lucide-react-native';

import { usePettyCashOverview } from '@/api/petty-cash';
import { useSession } from '@/auth/session';
import { PettyReportsCard } from '@/features/petty-cash/lists';
import { billBatches, list, roleSeesPettyCash } from '@/features/petty-cash/logic';
import { plural } from '@/lib/format';
import { palette } from '@/theme/tokens';
import { EmptyState, ErrorState, NavHeader, Screen, SkeletonList, SummaryHero } from '@/ui';

export default function PettyCashReportsScreen() {
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
          <SkeletonList rows={4} avatar />
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
        <EmptyState icon={<FileSpreadsheet color={palette.textMuted} />} title="No expense reports yet" message="You get one each time you send bills." />
      )}
      {allowed && data && count ? <PettyReportsCard data={data} title="Reports" /> : null}
    </Screen>
  );
}
