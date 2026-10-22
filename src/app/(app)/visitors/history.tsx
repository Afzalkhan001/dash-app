// Past visitors: a light SummaryHero (visitors this month, all of them and the last visit), then one
// frosted list per day; a row opens the full record (features/visitors/history-list.tsx).
// Same read as the Visitors screen (GET /visitors/mine), so it is usually already cached.

import { History } from 'lucide-react-native';

import { useMyVisitors } from '@/api/visitors';
import { useTodayIst } from '@/features/attendance/use-now';
import { asVisits, dateLabel } from '@/features/visitors/format';
import { HistoryList } from '@/features/visitors/history-list';
import { istDateOf } from '@/lib/dates';
import { palette, radius } from '@/theme/tokens';
import { EmptyState, ErrorState, NavHeader, Screen, Skeleton, SkeletonList, SummaryHero } from '@/ui';
import { useSession } from '@/auth/session';
import { VISITOR_HIDDEN_ROLES } from '@/api/inbox';
import { RouteGate } from '@/features/shared/route-gate';

// Same rule as the Visitors hub: not the platform owner, the office TV or the Visitor Manager (who has the desk).
export default function PastVisitorsScreen() {
  const role = useSession((s) => s.user?.role);
  return (
    <RouteGate allow={!role || !VISITOR_HIDDEN_ROLES.includes(role)} to={role === 'visitor_manager' ? '/admin/desk' : '/'}>
      <PastVisitorsBody />
    </RouteGate>
  );
}

function PastVisitorsBody() {
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
      ) : !visits.data && !visits.isError ? (
        // The hero's placeholder in the hero's slot, so the list doesn't jump when the data lands.
        <Skeleton height={196} radius={radius.xxl} />
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
