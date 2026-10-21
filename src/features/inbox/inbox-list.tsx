// The Inbox list in the Payno "recent transactions" style: one kit ActivityList per day — a regular
// section title (Today · Yesterday · Mon, 12 Oct) over ONE frosted card of rows with inset hairlines.
// Visitors standing at reception come first, in a group of their own ("At reception"). A row
// (InboxRequestRow) is the kind's badge in its module colour, who, what it is in plain words (the
// identifying fact first), on the right the figure over the time it came in, and the employee's
// reason across the full width under it:
//
//   Today
//   ┌───────────────────────────────────────────────┐
//   │ (leave) Sneha Iyer                     2 days │
//   │         27 – 28 Oct · Casual Leave    9:42 AM │
//   │         Family function in Pune, back on the  │
//   │         29th — handover note is in Drive      │
//   └───────────────────────────────────────────────┘
//
// The subtitle may wrap to two lines, so the dates are never cut on a narrow phone; with large text
// the right column moves under the subtitle. Rows never carry Approve / Reject: tapping opens the
// detail screen, where the decision is a swipe.

import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { groupByDay, type InboxItem, itemRow, type LeaveNames, safeTime, timeValue } from '@/features/inbox/format';
import { itemLook } from '@/features/inbox/kind-look';
import { useLeaveNames } from '@/features/inbox/leave-names';
import { InboxRequestRow } from '@/features/inbox/request-row';
import { radius, space } from '@/theme/tokens';
import { ActivityList, Skeleton, SkeletonList, TourTarget } from '@/ui';

import { themedStyles } from '@/theme/themed';

const clean = (items: InboxItem[] | null | undefined) => (Array.isArray(items) ? items : []).filter((i): i is InboxItem => !!i && typeof i === 'object');

// Visitors are standing at reception now, so they get their own group at the top whatever the day.
const RECEPTION = { key: 'reception', label: 'At reception' };
// A plug-in may pin its own group the same way (people at a desk: features/plugin-types `pin`).
const pinVisitors = (item: InboxItem) => (item.kind === 'visitors' ? RECEPTION : item.kind === 'plugin' && item.pin ? item.pin : null);

/** One Inbox row. The right column says the time it came in ('9:42 AM', the day is the group's title). */
function InboxRow({ item, today, now, names, onPress }: { item: InboxItem; today: string; now: number; names: LeaveNames; onPress: () => void }) {
  const m = itemRow(item, today, now, names);
  const look = itemLook(item);
  // A visitor always says how long they have been waiting ('5m ago') — that is what matters at the desk.
  const meta = item.kind !== 'visitors' ? (timeValue(item.at) ? safeTime(item.at) : undefined) : m.age;
  return (
    <InboxRequestRow
      module={look.module}
      icon={look.icon}
      title={m.title}
      subtitle={m.subtitle}
      detail={m.meta}
      value={m.value}
      valueMeta={meta}
      accessibilityLabel={[m.title, m.subtitle, m.value, meta, m.meta].filter(Boolean).join(', ')}
      onPress={onPress}
    />
  );
}

/** Everything in `items` (already in the Inbox's order), one titled ActivityList per day it came in. */
export function InboxGroups({ items, onOpen }: { items: InboxItem[]; onOpen?: (item: InboxItem) => void }) {
  const router = useRouter();
  const now = useNow();
  const today = useTodayIst();
  const names = useLeaveNames();
  const rows = clean(items);
  if (!rows.length) return null;
  const groups = groupByDay(rows, (i) => i.at, today, pinVisitors);
  // The tour's "Open to decide" (docs/TOUR.md): the first request on screen (visitors aren't decided).
  const firstRequest = groups.flatMap((g) => g.items).find((i) => i.kind !== 'visitors' && !(i.kind === 'plugin' && !i.decides))?.key;
  const open = (item: InboxItem) => {
    onOpen?.(item);
    router.push(item.href);
  };
  return (
    <View style={styles.groups}>
      {groups.map((g) => (
        <ActivityList key={g.key} title={g.label}>
          {g.items.map((item) =>
            item.key === firstRequest ? (
              <TourTarget key={item.key} id="inbox.firstItem">
                <InboxRow item={item} today={today} now={now} names={names} onPress={() => open(item)} />
              </TourTarget>
            ) : (
              <InboxRow key={item.key} item={item} today={today} now={now} names={names} onPress={() => open(item)} />
            ),
          )}
        </ActivityList>
      ))}
    </View>
  );
}

/** Loading placeholder shaped like a day group: a short title over a frosted card of rows (avatar + two lines, 72 high). */
export function InboxListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={styles.skeleton}>
      <View style={styles.skeletonHead}>
        <Skeleton width={72} height={14} radius={radius.pill} />
      </View>
      <SkeletonList rows={rows} avatar tone="surface" />
    </View>
  );
}

const styles = themedStyles(() => ({
  // Air between days; title-to-card is ActivityList's own.
  groups: { gap: space.lg },
  skeleton: { gap: space.xxs },
  // The same 44 dp band as the SectionHeader it stands in for.
  skeletonHead: { minHeight: 44, justifyContent: 'center' },
}));
