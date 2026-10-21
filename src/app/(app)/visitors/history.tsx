// Past visitors: a light SummaryHero (visitors this month, all of them and the last visit), then one
// frosted list per day; a row opens the full record (features/visitors/history-list.tsx).
// Same read as the Visitors screen (GET /visitors/mine), so it is usually already cached.

import { History } from 'lucide-react-native';

import { useMyVisitors } from '@/api/visitors';
import { useTodayIst } from '@/features/attendance/use-now';
import { asVisits, dateLabel } from '@/features/visitors/format';
import { HistoryList } from '@/features/visitors/history-list';
import { istDateOf } from '@/lib/dates';
import { palette } from '@/theme/tokens';
import { EmptyState, ErrorState, NavHeader, Screen, SkeletonList, SummaryHero } from '@/ui';

export default function PastVisitorsScreen() {
  const visits = useMyVisitors();
  const today = useTodayIst();
  const history = asVisits(visits.data?.history);
  const month = today.slice(0, 7);
  const thisMonth = history.filter((v) => (istDateOf(v.createdAt) || '').slice(0, 7) === month).length;
  const last = history[0];

  return (
    <Screen header={<NavHeader title="Past visitors" />} onRefresh={() => visits.refetch()}>
      {visits.data && history.length ? (
        <SummaryHero
          icon={History}
          module="visitors"
          label="Visitors this month"
          value={thisMonth}
          unit={thisMonth === 1 ? 'visitor' : 'visitors'}
          info={history.length !== thisMonth ? { label: 'All visits', value: String(history.length) } : undefined}
          sub={last ? `Last visit ${dateLabel(last.createdAt, today)}` : undefined}
        />
      ) : null}
      {visits.data ? (
        history.length ? (
          <HistoryList visits={history} />
        ) : (
          <EmptyState icon={<History color={palette.textMuted} />} title="No past visitors yet" message="People who came to see you show up here." />
        )
      ) : visits.isError ? (
        <ErrorState message={visits.error?.message ?? ''} onRetry={() => void visits.refetch()} />
      ) : (
        <SkeletonList rows={5} avatar />
      )}
    </Screen>
  );
}
