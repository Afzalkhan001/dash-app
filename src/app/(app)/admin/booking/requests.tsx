// Booking requests — the approver's tracker (web: RequestsView tabs, dash.html:24700). Read-only: the
// decisions live in the Inbox (a waiting row opens it there, where Approve and Reject are). Tabs:
// Waiting · Approved · Rejected · Done (completed or rated) · Marked done (work the professional marked
// done that the requester hasn't approved yet, with Today / Yesterday / This week / This month / a day).
// Who is "mine": admins and the App Manager — the departments they run, else their own; managers — the
// people who report to them; plus location bookings they approve. Not for Super Admin / CEO / COO
// (the website gives them no Requests page).

import { Redirect, useRouter } from 'expo-router';
import { CalendarCheck2, CalendarDays } from 'lucide-react-native';
import { useState } from 'react';

import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeBookingRequests } from '@/features/booking/access';
import { RequestRow, useRequestTracker } from '@/features/booking/history';
import { type AwaitPeriod, inPeriod } from '@/features/booking/model';
import { useProfTypes } from '@/features/booking/ui';
import { dateLabel } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, radius } from '@/theme/tokens';
import { ActivityList, Button, DateField, EmptyState, ErrorState, MenuSheet, NavHeader, PillSelector, Row, Screen, Segmented, Skeleton, SkeletonList, SummaryHero } from '@/ui';

type Tab = 'pending' | 'approved' | 'rejected' | 'done' | 'awaiting';
const PERIODS: { key: AwaitPeriod; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: 'date', label: 'Pick a day' },
];
const EMPTY: Record<Tab, string> = {
  pending: 'Nothing is waiting for you.',
  approved: 'No approved bookings yet.',
  rejected: 'No rejected or cancelled bookings.',
  done: 'No finished bookings yet.',
  awaiting: 'No work marked done in this period.',
};
const PAGE = 20;

export default function BookingRequestsScreen() {
  const router = useRouter();
  const access = useAccess();
  const today = useTodayIst();
  const types = useProfTypes();
  const t = useRequestTracker();
  const [tab, setTab] = useState<Tab>('pending');
  const [period, setPeriod] = useState<AwaitPeriod>('this_month');
  const [picked, setPicked] = useState('');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  if (!canSeeBookingRequests(access)) return <Redirect href="/" />;

  const b = t.buckets;
  const awaiting = b ? b.awaiting.filter((x) => inPeriod(x, period, today, picked)) : [];
  const rows = !b ? [] : tab === 'awaiting' ? awaiting : b[tab];
  const open = (id: string) => router.push(`/inbox/booking/${encodeURIComponent(id)}`);

  return (
    <>
      <Screen header={<NavHeader title="Booking requests" />} onRefresh={() => t.refetch()}>
        <SummaryHero
          icon={CalendarCheck2}
          module="tasks"
          label="Waiting for you"
          value={b ? b.pending.length : undefined}
          unit={b?.pending.length === 1 ? 'booking' : 'bookings'}
          figure={b ? undefined : t.error ? null : <Skeleton width={120} height={48} radius={radius.sm} />}
          sub={b ? 'Approve or reject them in the Inbox.' : undefined}
          action={b?.pending.length ? { title: 'Open the Inbox', onPress: () => router.push('/inbox?type=booking') } : undefined}
        />
        <Segmented<Tab>
          value={tab}
          onChange={(k) => {
            setTab(k);
            setLimit(PAGE);
          }}
          options={[
            { key: 'pending', label: 'Waiting', badge: b?.pending.length },
            { key: 'approved', label: 'Approved', badge: b?.approved.length },
            { key: 'rejected', label: 'Rejected', badge: b?.rejected.length },
            { key: 'done', label: 'Done', badge: b?.done.length },
            { key: 'awaiting', label: 'Marked done', badge: b?.awaiting.length },
          ]}
        />
        {tab === 'awaiting' ? (
          <Row>
            <PillSelector
              icon={CalendarDays}
              label={period === 'date' && picked ? dateLabel(picked, today) : (PERIODS.find((p) => p.key === period)?.label ?? 'This month')}
              onPress={() => setPeriodOpen(true)}
              accessibilityLabel="Period"
            />
          </Row>
        ) : null}
        {tab === 'awaiting' && period === 'date' ? <DateField label="Day" value={picked || null} onChange={setPicked} maximumDate={today} /> : null}

        {t.error ? (
          <ErrorState message={t.error} onRetry={() => void t.refetch()} />
        ) : !b ? (
          <SkeletonList rows={5} avatar />
        ) : rows.length ? (
          <ActivityList>
            {rows.slice(0, limit).map((x) => (
              <RequestRow key={x.id} b={x} today={today} types={types} hideStatus={tab === 'pending'} onPress={() => open(x.id)} />
            ))}
          </ActivityList>
        ) : (
          <EmptyState icon={<CalendarCheck2 color={palette.textMuted} strokeWidth={1.8} />} title="Nothing here" message={EMPTY[tab]} />
        )}
        {rows.length > limit ? <Button title={`Show more (${rows.length - limit})`} variant="text" size="md" onPress={() => setLimit((n) => n + PAGE)} style={styles.more} /> : null}
      </Screen>
      <MenuSheet
        visible={periodOpen}
        onClose={() => setPeriodOpen(false)}
        title="Marked done"
        items={PERIODS.map((p) => ({
          key: p.key,
          label: p.label,
          onPress: () => {
            setPeriod(p.key);
            if (p.key === 'date' && !picked) setPicked(today);
            setPeriodOpen(false);
          },
        }))}
      />
    </>
  );
}

const styles = themedStyles(() => ({
  more: { alignSelf: 'center' },
}));
