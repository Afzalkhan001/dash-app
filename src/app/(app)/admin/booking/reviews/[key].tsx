// One group of pending reviews (web: PendingReviewsMonitor side panel, dash.html:26100–26190). A
// professional's group lists their bookings by employee, each employee with a WhatsApp reminder; an
// employee's group lists what they owe by professional, with one reminder for all of it. "Remind on
// WhatsApp" opens WhatsApp with the website's text (wa.me) — DASH itself sends nothing. No PDF.

import { Redirect, useLocalSearchParams } from 'expo-router';
import { ClipboardList, MessageCircle } from 'lucide-react-native';
import { Linking, View } from 'react-native';

import { useAllBookings, useBookingUsers } from '@/api/booking';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { canSeePendingReviews } from '@/features/booking/access';
import {
  daysWaiting,
  pendingReviewItems,
  remindAboutProText,
  remindEmployeeText,
  reviewGroups,
  waitingLabel,
  waitingSince,
  waLink,
} from '@/features/booking/model';
import { StackedRow, useProfTypes, whenLine } from '@/features/booking/ui';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { ActivityList, Banner, Button, EmptyState, ErrorState, NavHeader, Screen, SkeletonList, SummaryHero, Text, toast } from '@/ui';

export default function PendingReviewGroupScreen() {
  const params = useLocalSearchParams<{ key: string; by?: string }>();
  const key = String(params.key || '');
  const by = params.by === 'emp' ? 'emp' : 'pro';
  const access = useAccess();
  const now = useNow();
  const today = useTodayIst();
  const types = useProfTypes();
  const allowed = canSeePendingReviews(access.user);
  const all = useAllBookings(allowed);
  const users = useBookingUsers(allowed);

  if (!allowed) return <Redirect href="/" />;

  const items = all.data ? pendingReviewItems(all.data, users.data ?? null) : [];
  const group = reviewGroups(items, by, users.data ?? [], types).find((g) => g.key === key) ?? null;
  // The other axis inside the group.
  const subs = group ? reviewGroups(group.items, by === 'pro' ? 'emp' : 'pro', users.data ?? [], types) : [];
  const remind = (phone: string, text: string) => void Linking.openURL(waLink(phone, text)).catch(() => toast.show('Couldn’t open WhatsApp on this phone.', 'danger'));

  return (
    <Screen header={<NavHeader title={group?.name || 'Pending reviews'} />} onRefresh={() => Promise.all([all.refetch(), users.refetch()])}>
      {all.isError && !all.data ? (
        <ErrorState message={all.error?.message || 'Couldn’t load the bookings.'} onRetry={() => void all.refetch()} />
      ) : !all.data ? (
        <SkeletonList rows={4} />
      ) : !group ? (
        <EmptyState title="All caught up" message="Nothing is waiting here any more." />
      ) : (
        <>
          <SummaryHero
            icon={ClipboardList}
            module="tasks"
            label={by === 'pro' ? `${group.sub} · reviews waiting` : 'Reviews they owe'}
            value={group.items.length}
            sub={by === 'pro' ? `${plural(subs.length, 'employee')} to remind` : `Across ${plural(subs.length, 'professional')}`}
            action={
              by === 'emp' && group.phone
                ? { title: 'Remind on WhatsApp', icon: <MessageCircle />, onPress: () => remind(group.phone, remindEmployeeText(group.name, group.items.length, subs.map((s) => s.name))) }
                : undefined
            }
          />
          {by === 'emp' && !group.phone ? <Banner tone="info" title="No phone on file" message="Their DASH profile has no mobile number to remind them on." /> : null}
          {subs.map((sg) => (
            <View key={sg.key} style={styles.group}>
              <ActivityList title={`${sg.name} · ${sg.items.length}`}>
                {[...sg.items]
                  .sort((a, b) => String(b.markedDoneAt || '').localeCompare(String(a.markedDoneAt || '')))
                  .map((b) => (
                    <StackedRow
                      key={b.id}
                      module="tasks"
                      icon={ClipboardList}
                      title={b.kekaCode || b.project || 'Booking'}
                      subtitle={whenLine(b, today)}
                      value={waitingLabel(daysWaiting(waitingSince(b), now))}
                      valueMeta="waiting"
                      status={b.kind === 'approval' ? { label: 'Needs approval', tone: 'pending' } : { label: 'Needs rating', tone: 'info' }}
                    />
                  ))}
              </ActivityList>
              {by === 'pro' && !sg.phone ? (
                <Text variant="caption" muted>
                  {`No phone on file for ${sg.name}.`}
                </Text>
              ) : null}
              {by === 'pro' && sg.phone ? (
                <Button
                  title={`Remind ${sg.name.split(' ')[0]} on WhatsApp`}
                  variant="ghost"
                  size="md"
                  icon={<MessageCircle />}
                  onPress={() => remind(sg.phone, remindAboutProText(sg.name, group.name, sg.items.length))}
                />
              ) : null}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  group: { gap: space.xs },
}));
