// Home › "Company at a glance" (the phone version of SAHome's four KPI cards, dash.html:2546): people,
// departments, open tasks and bookings waiting, from GET /dashboard/summary (exact counts, no lists).
// Super Admin, CEO and COO only (features/company/nav homeCards). Tapping it opens the dashboard.

import { useRouter } from 'expo-router';
import { Building2, CalendarClock, ClipboardList, Users } from 'lucide-react-native';
import { View } from 'react-native';

import { useDashboardSummary } from '@/api/company';
import { radius } from '@/theme/tokens';
import { ErrorState, SectionHeader, Skeleton, StatGrid, StatTile, TourTarget, useLayout } from '@/ui';

export function CompanyGlanceCard() {
  const router = useRouter();
  const { gap } = useLayout();
  const q = useDashboardSummary();
  const open = () => router.push('/admin/company');
  const d = q.data;
  return (
    <TourTarget id="home.company.glance" radius={radius.xl}>
      <View style={{ gap: gap - 4 }}>
        <SectionHeader title="Company at a glance" actionLabel="Open" onAction={open} actionAccessibilityLabel="Open the company dashboard" />
        {d ? (
          <StatGrid columns={2}>
            <StatTile variant="light" module="people" icon={Users} label="People on DASH" value={d.users} onPress={open} />
            <StatTile variant="light" module="security" icon={Building2} label="Departments" value={d.departments} onPress={open} />
            <StatTile variant="light" module="tasks" icon={ClipboardList} label="Open tasks" value={d.activeTasks} onPress={open} />
            <StatTile variant="light" module="leave" icon={CalendarClock} label="Bookings waiting" value={d.pendingBookings} onPress={open} />
          </StatGrid>
        ) : q.isError ? (
          <ErrorState message={q.error?.message ?? 'The company numbers could not be loaded.'} onRetry={() => void q.refetch()} />
        ) : (
          <StatGrid columns={2}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={128} radius={radius.xl} />
            ))}
          </StatGrid>
        )}
      </View>
    </TourTarget>
  );
}
