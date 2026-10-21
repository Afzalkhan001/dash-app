// Booking (web: BookingMatrix, dash.html:27305). In the order you need it:
//   1. a light hero: how many bookings are coming up, and the next one;
//   2. the three ways to book — a professional, a conference room, a shooting location;
//   3. what waits on you: work marked done to approve, finished bookings to rate (also in the Inbox);
//   4. professionals: what you've been booked for (Start and Done stay in My tasks);
//   5. your upcoming bookings (tap one to see it or cancel it), then the latest history with "See all".
// Approvers get a row into Booking requests; the App Manager one into Pending reviews.

import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { CalendarCheck2, CalendarDays, ClipboardList, Clapperboard, DoorClosed, MapPin } from 'lucide-react-native';

import { useBookingFeed } from '@/api/booking';
import { useTodayIst } from '@/features/attendance/use-now';
import { canBook, canSeeBookingRequests, canSeePendingReviews, isProfessional } from '@/features/booking/access';
import { incomingFor, isMine, requesterQueues, splitMine } from '@/features/booking/model';
import { BookingRow, useMe, useProfTypes, whenLine } from '@/features/booking/ui';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { radius } from '@/theme/tokens';
import { ActivityList, CategoryGrid, ErrorState, ListCard, ListRow, ModuleBadge, NavHeader, Screen, Skeleton, SkeletonList, SummaryHero } from '@/ui';

const HISTORY_ROWS = 5;

export default function BookingHubScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const me = useMe();
  const today = useTodayIst();
  const types = useProfTypes();
  const allowed = canBook(access);
  const feed = useBookingFeed(allowed);

  if (!allowed) return <Redirect href="/" />;

  const list = feed.data ?? [];
  const mine = list.filter((b) => isMine(b, me));
  const { upcoming, past } = splitMine(mine, today);
  const queues = requesterQueues(list, me?.id);
  const incoming = isProfessional(access.user) ? incomingFor(list, me?.id, today) : [];
  // Soonest first for what is coming up (the web lists newest first; history keeps that).
  const soonest = [...upcoming].reverse();
  const next = soonest[0];
  const waiting = queues.approve.length + queues.rate.length;
  const loaded = !!feed.data;

  return (
    <Screen header={<NavHeader title="Booking" />} onRefresh={() => qc.invalidateQueries({ queryKey: ['inbox', 'booking'] })}>
      <SummaryHero
        icon={CalendarDays}
        module="tasks"
        label="Your upcoming bookings"
        value={loaded ? upcoming.length : undefined}
        unit={upcoming.length === 1 ? 'booking' : 'bookings'}
        figure={loaded ? undefined : feed.isError ? null : <Skeleton width={120} height={48} radius={radius.sm} />}
        sub={loaded ? (next ? `Next: ${next.resource || '—'} · ${whenLine(next, today)}` : 'Nothing booked yet. Pick what you need below.') : undefined}
        info={waiting ? { label: 'Waiting on you', value: plural(waiting, 'booking') } : undefined}
      />

      <CategoryGrid
        columns={3}
        items={[
          { key: 'pro', label: 'Professional', icon: Clapperboard, module: 'tasks', hint: 'Book an editor, cinematographer or designer', onPress: () => router.push('/admin/booking/pro') },
          { key: 'room', label: 'Room', icon: DoorClosed, module: 'tasks', hint: 'Book a conference room by the half hour', onPress: () => router.push('/admin/booking/room') },
          { key: 'loc', label: 'Location', icon: MapPin, module: 'tasks', hint: 'Book a shooting location', onPress: () => router.push('/admin/booking/location') },
        ]}
      />

      {feed.isError && !loaded ? <ErrorState message={feed.error?.message || 'Couldn’t load your bookings.'} onRetry={() => void feed.refetch()} /> : null}

      {waiting ? (
        <ActivityList title="Waiting on you">
          {queues.approve.map((b) => (
            <BookingRow key={b.id} b={b} today={today} types={types} who="resource" onPress={() => router.push(`/inbox/bkdone/${encodeURIComponent(b.id)}`)} />
          ))}
          {queues.rate.map((b) => (
            <BookingRow key={b.id} b={b} today={today} types={types} who="resource" onPress={() => router.push(`/inbox/bkrate/${encodeURIComponent(b.id)}`)} />
          ))}
        </ActivityList>
      ) : null}

      {incoming.length ? (
        <ActivityList title="Booked for you">
          {incoming.map((b) => (
            <BookingRow key={b.id} b={b} today={today} types={types} who="requester" onPress={() => router.push(`/admin/booking/${encodeURIComponent(b.id)}`)} />
          ))}
        </ActivityList>
      ) : null}

      <ActivityList title="Upcoming" loading={!loaded && !feed.isError} empty={loaded ? 'No upcoming bookings.' : undefined}>
        {soonest.map((b) => (
          <BookingRow key={b.id} b={b} today={today} types={types} onPress={() => router.push(`/admin/booking/${encodeURIComponent(b.id)}`)} />
        ))}
      </ActivityList>

      {loaded ? (
        <ActivityList title="History" onSeeAll={() => router.push('/admin/booking/history')} seeAllAccessibilityLabel="See all your past bookings" empty="Nothing here yet.">
          {past.slice(0, HISTORY_ROWS).map((b) => (
            <BookingRow key={b.id} b={b} today={today} types={types} onPress={() => router.push(`/admin/booking/${encodeURIComponent(b.id)}`)} />
          ))}
        </ActivityList>
      ) : (
        <SkeletonList rows={2} />
      )}

      {canSeeBookingRequests(access) || canSeePendingReviews(access.user) ? (
        <ListCard>
          {canSeeBookingRequests(access) ? (
            <ListRow
              left={<ModuleBadge module="tasks" icon={CalendarCheck2} />}
              title="Booking requests"
              subtitle="Your team's bookings to approve, and what was decided"
              subtitleLines={2}
              chevron
              onPress={() => router.push('/admin/booking/requests')}
            />
          ) : null}
          {canSeePendingReviews(access.user) ? (
            <ListRow
              left={<ModuleBadge module="tasks" icon={ClipboardList} />}
              title="Pending reviews"
              subtitle="Booking work waiting for approval or a rating"
              subtitleLines={2}
              chevron
              onPress={() => router.push('/admin/booking/reviews')}
            />
          ) : null}
        </ListCard>
      ) : null}
    </Screen>
  );
}
