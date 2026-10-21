// The approver's booking lists: the requests tracker's data (web: RequestsView tabs, dash.html:24700)
// and the Inbox's Past decisions chip (approved and rejected bookings, newest first).

import { useRouter } from 'expo-router';
import { History } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type BookingRecord, useAllBookings, useBookingDepartments, useBookingUsers } from '@/api/booking';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeBookingRequests } from '@/features/booking/access';
import { profScope, type RequestBuckets, requestBuckets, statusOf, typeLabel } from '@/features/booking/model';
import { BOOKING_MODULE, StackedRow, typeIcon, useMe, useProfTypes, whenLine } from '@/features/booking/ui';
import type { ProfType } from '@/api/me';
import { useAccess } from '@/lib/use-access';
import { palette, space } from '@/theme/tokens';
import { ActivityList, Button, EmptyState, ErrorState, SkeletonList } from '@/ui';

import { themedStyles } from '@/theme/themed';

/** The approver's buckets over the whole table (the history tabs need old rows too). */
export function useRequestTracker() {
  const access = useAccess();
  const me = useMe();
  const on = canSeeBookingRequests(access);
  const all = useAllBookings(on);
  const users = useBookingUsers(on);
  const depts = useBookingDepartments(on);
  const ready = !!all.data && !!users.data && !!depts.data && !!me;
  const buckets: RequestBuckets | null = ready ? requestBuckets(all.data!, me!, profScope(me!, users.data!, depts.data!)) : null;
  const error = !ready && (all.isError || users.isError || depts.isError) ? (all.error ?? users.error ?? depts.error)?.message || 'Couldn’t load the requests.' : '';
  return {
    on,
    buckets,
    loading: on && !ready && !error,
    error,
    refetch: () => Promise.all([all.refetch(), users.refetch(), depts.refetch()]),
  };
}

/** One request in the approvers' lists: who is booked, when, who asked, its status (under the text). */
export function RequestRow({ b, today, types, hideStatus, onPress }: { b: BookingRecord; today: string; types: ProfType[]; hideStatus?: boolean; onPress: () => void }) {
  const st = statusOf(b);
  return (
    <StackedRow
      person={b.type === 'professionals' ? { name: b.resource || '' } : undefined}
      module={b.type === 'professionals' ? undefined : BOOKING_MODULE}
      icon={b.type === 'professionals' ? undefined : typeIcon(b.type)}
      title={b.resource || '—'}
      subtitle={whenLine(b, today)}
      note={`Asked by ${b.requestedBy || '—'} · ${typeLabel(b, types)}`}
      status={hideStatus ? null : st}
      onPress={onPress}
      accessibilityLabel={[b.resource, whenLine(b, today), `asked by ${b.requestedBy || 'someone'}`, st.label].join(', ')}
    />
  );
}

const PAGE = 20;

/** Inbox › Past decisions › Bookings. */
export function BookingHistory() {
  const router = useRouter();
  const today = useTodayIst();
  const types = useProfTypes();
  const t = useRequestTracker();
  const [limit, setLimit] = useState(PAGE);
  if (t.error) return <ErrorState message={t.error} onRetry={() => void t.refetch()} />;
  if (!t.buckets) return <SkeletonList rows={3} avatar />;
  const rows = [...t.buckets.approved, ...t.buckets.rejected].sort((a, b) =>
    String(b.approvedAt || b.createdAt || '').localeCompare(String(a.approvedAt || a.createdAt || '')),
  );
  if (!rows.length)
    return <EmptyState icon={<History color={palette.textMuted} strokeWidth={1.8} />} title="Nothing decided yet" message="Bookings you approve or reject show up here." />;
  return (
    <View style={styles.wrap}>
      <ActivityList>
        {rows.slice(0, limit).map((b) => (
          <RequestRow key={b.id} b={b} today={today} types={types} onPress={() => router.push(`/inbox/booking/${encodeURIComponent(b.id)}`)} />
        ))}
      </ActivityList>
      {rows.length > limit ? <Button title={`Show more (${rows.length - limit})`} variant="text" size="md" onPress={() => setLimit((n) => n + PAGE)} style={styles.more} /> : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { gap: space.md },
  more: { alignSelf: 'center' },
}));
