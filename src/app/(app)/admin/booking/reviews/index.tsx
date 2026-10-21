// Pending reviews — the App Manager's monitor (web: PendingReviewsMonitor, dash.html:25978). Professional
// bookings still owed by their requester: work marked done waiting for approval, or finished and not
// rated. Cancelled-looking bookings and requesters who resigned or were removed are left out. Grouped
// by professional (busiest first) or by employee (who owes the most); a group opens its bookings and a
// WhatsApp reminder. Read-only: DASH sends nothing. "Share list" sends a plain-text summary.

import { Redirect, useRouter } from 'expo-router';
import { ClipboardList, Search, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Share } from 'react-native';

import { useAllBookings, useBookingUsers } from '@/api/booking';
import { useNow } from '@/features/attendance/use-now';
import { canSeePendingReviews } from '@/features/booking/access';
import { daysWaiting, pendingReviewItems, reviewGroups, waitingLabel, waitingSince } from '@/features/booking/model';
import { useProfTypes } from '@/features/booking/ui';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { palette, radius } from '@/theme/tokens';
import { EmptyState, ErrorState, MetricRow, NavHeader, PillField, Screen, Segmented, Skeleton, SkeletonList, SummaryHero } from '@/ui';

export default function PendingReviewsScreen() {
  const router = useRouter();
  const access = useAccess();
  const now = useNow();
  const types = useProfTypes();
  const allowed = canSeePendingReviews(access.user);
  const all = useAllBookings(allowed);
  const users = useBookingUsers(allowed);
  const [by, setBy] = useState<'pro' | 'emp'>('pro');
  const [q, setQ] = useState('');

  if (!allowed) return <Redirect href="/" />;

  const items = all.data ? pendingReviewItems(all.data, users.data ?? null) : [];
  const groups = reviewGroups(items, by, users.data ?? [], types);
  const needle = q.trim().toLowerCase();
  const shown = needle ? groups.filter((g) => g.name.toLowerCase().includes(needle)) : groups;
  const approvals = items.filter((b) => b.kind === 'approval').length;

  const share = () => {
    const lines = groups.map((g) => `${g.name}: ${plural(g.items.length, 'review')}`);
    void Share.share({ message: `Pending booking reviews (${items.length})\n${by === 'pro' ? 'By professional' : 'By employee'}\n\n${lines.join('\n')}` });
  };

  return (
    <Screen
      header={<NavHeader title="Pending reviews" actions={items.length ? [{ icon: Share2, label: 'Share list', onPress: share }] : undefined} />}
      onRefresh={() => Promise.all([all.refetch(), users.refetch()])}>
      <SummaryHero
        icon={ClipboardList}
        module="tasks"
        label="Bookings waiting on the requester"
        value={all.data ? items.length : undefined}
        figure={all.data ? undefined : all.isError ? null : <Skeleton width={120} height={48} radius={radius.sm} />}
        sub={all.data ? `${plural(approvals, 'approval')} · ${plural(items.length - approvals, 'rating')}` : undefined}
      />
      <Segmented
        value={by}
        onChange={setBy}
        options={[
          { key: 'pro', label: 'By professional' },
          { key: 'emp', label: 'By employee' },
        ]}
      />
      <PillField icon={Search} value={q} onChangeText={setQ} placeholder={by === 'pro' ? 'Search professionals' : 'Search employees'} accessibilityLabel="Search" />
      {all.isError && !all.data ? (
        <ErrorState message={all.error?.message || 'Couldn’t load the bookings.'} onRetry={() => void all.refetch()} />
      ) : !all.data ? (
        <SkeletonList rows={4} />
      ) : shown.length ? (
        shown.map((g) => {
          const oldest = Math.max(...g.items.map((b) => daysWaiting(waitingSince(b), now) ?? 0));
          return (
            <MetricRow
              key={g.key}
              module="tasks"
              label={g.name}
              sub={`${g.sub} · oldest waiting ${waitingLabel(oldest)}`}
              value={g.items.length}
              unit={g.items.length === 1 ? 'review' : 'reviews'}
              onPress={() => router.push(`/admin/booking/reviews/${encodeURIComponent(g.key)}?by=${by}`)}
            />
          );
        })
      ) : (
        <EmptyState icon={<ClipboardList color={palette.textMuted} strokeWidth={1.8} />} title={items.length ? 'No match' : 'All caught up'} message={items.length ? 'Nobody matches this search.' : 'No booking work is waiting for a review.'} />
      )}
    </Screen>
  );
}
