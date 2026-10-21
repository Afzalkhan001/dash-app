// All my past bookings (web: BookingHistoryPanel, dash.html:27154): type and status filters, search on
// what was booked, the project or the reason, newest first, a page at a time. Reads the whole table.

import { Redirect, useRouter } from 'expo-router';
import { History, Search } from 'lucide-react-native';
import { useState } from 'react';

import { useAllBookings } from '@/api/booking';
import { useTodayIst } from '@/features/attendance/use-now';
import { canBook } from '@/features/booking/access';
import { bookingLooksCancelled, isMine, needsReview, splitMine } from '@/features/booking/model';
import { BookingRow, useMe, useProfTypes } from '@/features/booking/ui';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette } from '@/theme/tokens';
import { ActivityList, Button, Chip, ChipRow, EmptyState, ErrorState, NavHeader, PillField, Screen, SkeletonList } from '@/ui';

type TypeF = 'all' | 'professionals' | 'rooms' | 'locations';
type StatusF = 'all' | 'approved' | 'completed' | 'cancelled' | 'pending' | 'review';
const TYPES: { key: TypeF; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'professionals', label: 'Professionals' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'locations', label: 'Locations' },
];
const STATUSES: { key: StatusF; label: string }[] = [
  { key: 'all', label: 'Any status' },
  { key: 'approved', label: 'Approved' },
  { key: 'completed', label: 'Completed' },
  { key: 'review', label: 'Needs review' },
  { key: 'pending', label: 'Waiting' },
  { key: 'cancelled', label: 'Cancelled' },
];
const PAGE = 15;

// dash.html:27168 normStatus.
function norm(s?: string) {
  if (s === 'rejected' || s === 'cancelled') return 'cancelled';
  if (s === 'completed' || s === 'reviewed') return 'completed';
  return s || '';
}

export default function BookingHistoryScreen() {
  const router = useRouter();
  const access = useAccess();
  const me = useMe();
  const today = useTodayIst();
  const types = useProfTypes();
  const allowed = canBook(access);
  const all = useAllBookings(allowed);
  const [type, setType] = useState<TypeF>('all');
  const [status, setStatus] = useState<StatusF>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);

  if (!allowed) return <Redirect href="/" />;

  const past = splitMine((all.data ?? []).filter((b) => isMine(b, me)), today).past;
  const needle = q.trim().toLowerCase();
  const rows = past.filter((b) => {
    if (type !== 'all' && b.type !== type) return false;
    const st = bookingLooksCancelled(b) ? 'cancelled' : norm(b.status);
    if (status === 'review' ? !needsReview(b) || st === 'cancelled' : status !== 'all' && st !== status) return false;
    if (needle && ![b.resource, b.reason, b.project, b.kekaCode].some((v) => String(v || '').toLowerCase().includes(needle))) return false;
    return true;
  });

  return (
    <Screen header={<NavHeader title="Booking history" />} onRefresh={() => all.refetch()}>
      <PillField
        icon={Search}
        value={q}
        onChangeText={(v) => {
          setQ(v);
          setLimit(PAGE);
        }}
        placeholder="Search bookings"
        accessibilityLabel="Search bookings"
        returnKeyType="search"
      />
      <ChipRow>
        {TYPES.map((t) => (
          <Chip
            key={t.key}
            label={t.label}
            selected={type === t.key}
            onPress={() => {
              setType(t.key);
              setLimit(PAGE);
            }}
          />
        ))}
      </ChipRow>
      <ChipRow>
        {STATUSES.map((t) => (
          <Chip
            key={t.key}
            label={t.label}
            selected={status === t.key}
            onPress={() => {
              setStatus(t.key);
              setLimit(PAGE);
            }}
          />
        ))}
      </ChipRow>
      {all.isError && !all.data ? (
        <ErrorState message={all.error?.message || 'Couldn’t load your bookings.'} onRetry={() => void all.refetch()} />
      ) : !all.data ? (
        <SkeletonList rows={5} />
      ) : rows.length ? (
        <ActivityList>
          {rows.slice(0, limit).map((b) => (
            <BookingRow
              key={b.id}
              b={b}
              today={today}
              types={types}
              // One status picked: every row would say the same thing.
              hideStatus={status !== 'all' && status !== 'review'}
              onPress={() => router.push(`/admin/booking/${encodeURIComponent(b.id)}`)}
            />
          ))}
        </ActivityList>
      ) : (
        <EmptyState icon={<History color={palette.textMuted} strokeWidth={1.8} />} title="No bookings here" message={past.length ? 'Nothing matches these filters.' : 'Past bookings show up here.'} />
      )}
      {rows.length > limit ? <Button title={`Show more (${rows.length - limit})`} variant="text" size="md" onPress={() => setLimit((n) => n + PAGE)} style={styles.more} /> : null}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  more: { alignSelf: 'center' },
}));
