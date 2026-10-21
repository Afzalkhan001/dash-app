// Pieces every booking detail screen shares: finding the booking, its hero, its details, and the
// professional's other bookings that day (with the overlap warning, dash.html:24161 hasTimeOverlap).

import { CircleAlert } from 'lucide-react-native';
import { View } from 'react-native';

import { type BookingRecord, type BookUser, useAllBookings, useBookingFeed } from '@/api/booking';
import type { ProfType } from '@/api/me';
import { bookingDay, bookingLooksCancelled, bookingTimes, effEnd, hasTimeOverlap, statusOf, typeLabel } from '@/features/booking/model';
import { BOOKING_MODULE, timeRange, typeIcon } from '@/features/booking/ui';
import type { Field } from '@/features/inbox/format';
import { dateLabel, stampLabel } from '@/lib/dates';
import { palette, space } from '@/theme/tokens';
import { ActivityList, ActivityRow, Banner, SummaryHero, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';

/** The booking by id: from the feed, or the whole table when it is older than the feed. */
export function useBookingById(id: string) {
  const feed = useBookingFeed(true);
  const inFeed = feed.data?.find((b) => b.id === id) ?? null;
  const all = useAllBookings(!!feed.data && !inFeed);
  const b = inFeed ?? all.data?.find((x) => x.id === id) ?? null;
  const list = all.data ?? feed.data ?? [];
  const loading = !b && ((!feed.data && !feed.isError) || all.isLoading);
  const error = !b && !loading && (feed.isError || all.isError) ? (feed.error ?? all.error)?.message || 'Couldn’t load this booking.' : '';
  return { b, list, loading, error, refetch: () => Promise.all([feed.refetch(), all.refetch()]) };
}

/** The key figure: the booked time, big, with what and when under it. */
export function BookingHero({ b, today, types, label }: { b: BookingRecord; today: string; types: ProfType[]; label?: string }) {
  return (
    <SummaryHero
      icon={typeIcon(b.type)}
      module={BOOKING_MODULE}
      label={label ?? `${typeLabel(b, types)} booking`}
      figure={
        <Text variant="hero" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {timeRange(b)}
        </Text>
      }
      sub={`${dateLabel(bookingDay(b), today)} · ${b.resource || '—'}`}
    />
  );
}

/** What the booking says besides the hero and the From → To cards. */
export function bookingFields(b: BookingRecord, pro?: BookUser | null): Field[] {
  const room = b.type === 'rooms';
  return [
    { label: 'Project code', value: b.kekaCode || null },
    { label: 'Project', value: b.project && b.project !== b.kekaCode ? b.project : null },
    { label: 'Channel', value: b.channelName || null },
    { label: 'Shooting location', value: b.shootingLocation || null },
    { label: 'Purpose', value: room ? b.purposeLabel || b.purpose || null : null },
    { label: 'Client', value: b.clientName || null },
    { label: 'Special requirements', value: b.requirements || null },
    { label: 'Department', value: b.profDeptName || (typeof b.profDept === 'string' ? b.profDept : null) || pro?.dept || null },
    { label: 'Comments', value: b.comments || null },
    { label: 'Sent', value: b.createdAt ? stampLabel(b.createdAt) : null, tone: 'muted' },
  ];
}

/** The professional's other bookings that day; a red notice when this one overlaps one of them. */
export function ProDayCard({ b, list, today }: { b: BookingRecord; list: BookingRecord[]; today: string }) {
  if (b.type !== 'professionals') return null;
  const day = bookingDay(b);
  const t = bookingTimes(b);
  const others = list
    .filter(
      (o) =>
        o.id !== b.id &&
        o.type === 'professionals' &&
        (o.resourceId ? o.resourceId === b.resourceId : o.resource === b.resource) &&
        bookingDay(o) === day &&
        !['rejected', 'cancelled'].includes(o.status || '') &&
        !bookingLooksCancelled(o),
    )
    .sort((x, y) => String(x.startTime || '').localeCompare(String(y.startTime || '')));
  const clash = t && b.status === 'pending' ? others.filter((o) => hasTimeOverlap(t.start, t.end, o.startTime, effEnd(o))) : [];
  return (
    <View style={styles.day}>
      {clash.length ? (
        <Banner
          tone="danger"
          icon={CircleAlert}
          title="This overlaps another booking"
          message={`${b.resource || 'They'} already has ${clash.map((o) => `${timeRange(o)} (${o.requestedBy || '—'})`).join(', ')} that day.`}
        />
      ) : null}
      <ActivityList
        title={`${b.resource ? `${b.resource}’s` : 'Their'} day · ${dateLabel(day, today)}`}
        empty="Nothing else booked that day.">
        {others.map((o) => (
          <ActivityRow
            key={o.id}
            person={{ name: o.requestedBy || '' }}
            title={timeRange(o)}
            subtitle={`${o.requestedBy || '—'} · ${o.kekaCode || o.project || 'Booking'}`}
            status={statusOf(o)}
            titleColor={clash.includes(o) ? palette.dangerInk : undefined}
          />
        ))}
      </ActivityList>
    </View>
  );
}

const styles = themedStyles(() => ({
  day: { gap: space.sm },
}));
