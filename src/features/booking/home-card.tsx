// Home card for the App Manager, whose website home is the Pending Reviews page (dash.html:25944):
// how many professional bookings still wait on the requester, and a way in.

import { useRouter } from 'expo-router';
import { ClipboardList } from 'lucide-react-native';

import { useAllBookings, useBookingUsers } from '@/api/booking';
import { pendingReviewItems } from '@/features/booking/model';
import { plural } from '@/lib/format';
import { ListCard, ListRow, ModuleBadge, SkeletonList } from '@/ui';

export function PendingReviewsCard() {
  const router = useRouter();
  const all = useAllBookings(true);
  const users = useBookingUsers(true);
  if (!all.data && !all.isError) return <SkeletonList rows={1} />;
  const items = all.data ? pendingReviewItems(all.data, users.data ?? null) : [];
  const pros = new Set(items.map((b) => b.resourceId || b.resource)).size;
  return (
    <ListCard>
      <ListRow
        size="lg"
        left={<ModuleBadge module="tasks" icon={ClipboardList} />}
        title="Pending reviews"
        subtitle={!all.data ? 'Couldn’t load the bookings. Open to try again.' : items.length ? `${plural(items.length, 'booking')} with ${plural(pros, 'professional')} wait on the requester` : 'No booking work is waiting for a review.'}
        subtitleLines={2}
        value={items.length ? String(items.length) : undefined}
        chevron
        onPress={() => router.push('/admin/booking/reviews')}
      />
    </ListCard>
  );
}
