// Booking's Inbox kinds (docs/port/EXTENSION-POINTS.md §5; spec manager-work.md §4.1, team-ops.md §6.4).
//   booking  Bookings to approve — pending professional bookings of my people and location bookings
//            I approve (RequestsView, dash.html:24104–24134). Approvers only: canApproveBk + the
//            `requests` sidebar item and switch (admin, manager, app_manager).
//   bkdone   Work marked done on my professional bookings, waiting for my OK (dash.html:27488).
//   bkrate   My finished professional bookings with no rating yet (dash.html:27484).
// All three read one query (the booking feed, under ['inbox', 'booking', …]), so they cost one request.

import { CalendarCheck2, CircleCheckBig, Star } from 'lucide-react-native';

import { type BookingRecord, useBookingDepartments, useBookingFeed, useBookingUsers } from '@/api/booking';
import { canBook, canSeeBookingRequests } from '@/features/booking/access';
import { BookingApprovalDetail } from '@/features/booking/approval-detail';
import { BookingDoneDetail } from '@/features/booking/done-detail';
import { BookingHistory } from '@/features/booking/history';
import { bookingDay, profScope, PROF_TYPE_DEFAULTS, requestBuckets, requesterQueues, typeLabel } from '@/features/booking/model';
import { BookingRateDetail } from '@/features/booking/rate-detail';
import { whenLine } from '@/features/booking/ui';
import { ago } from '@/features/inbox/format';
import { type Access, defineInboxKind, type InboxKindPlugin, type InboxPluginItem, type InboxPluginResult } from '@/features/plugin-types';

type Item = InboxPluginItem<BookingRecord>;

const atOf = (iso: string | undefined, b: BookingRecord) => iso || b.createdAt || `${bookingDay(b) || '1970-01-01'}T09:00:00+05:30`;

function useApprovalQueue(access: Access): InboxPluginResult<BookingRecord> {
  const on = canSeeBookingRequests(access);
  const feed = useBookingFeed(on);
  const users = useBookingUsers(on);
  const depts = useBookingDepartments(on);
  const me = access.user;
  const ready = !!feed.data && !!users.data && !!depts.data;
  let items: Item[] = [];
  if (on && ready && me) {
    const scope = profScope({ id: me.id, name: me.name || '', role: me.role, dept: me.dept }, users.data!, depts.data!);
    items = requestBuckets(feed.data!, { id: me.id, name: me.name || '', role: me.role }, scope).pending.map((b) => ({
      id: b.id,
      at: atOf(undefined, b),
      who: b.requestedBy || '—',
      record: b,
    }));
  }
  return {
    visible: on,
    items,
    pending: on && ready ? items.length : null,
    error: on && !ready && (feed.isError || users.isError || depts.isError),
  };
}

function useRequesterQueue(access: Access, which: 'approve' | 'rate'): InboxPluginResult<BookingRecord> {
  const on = canBook(access);
  const feed = useBookingFeed(on);
  const me = access.user;
  const q = feed.data && me ? requesterQueues(feed.data, me.id)[which] : [];
  const items: Item[] = q.map((b) => ({
    id: b.id,
    at: atOf(which === 'approve' ? b.markedDoneAt : b.completedAt, b),
    who: b.resource || '—',
    record: b,
  }));
  return { visible: on, items, pending: on && feed.data ? items.length : null, error: on && feed.isError && !feed.data };
}

const useDoneQueue = (access: Access) => useRequesterQueue(access, 'approve');
const useRateQueue = (access: Access) => useRequesterQueue(access, 'rate');

export const inboxKinds: InboxKindPlugin[] = [
  defineInboxKind<BookingRecord>({
    key: 'booking',
    label: 'Bookings',
    title: 'Booking request',
    module: 'tasks',
    icon: CalendarCheck2,
    useItems: useApprovalQueue,
    row: (item, { today, now }) => ({
      title: item.who,
      subtitle: `${item.record.resource || '—'} · ${typeLabel(item.record, PROF_TYPE_DEFAULTS)}`,
      meta: whenLine(item.record, today),
      age: ago(item.at, now),
    }),
    Detail: BookingApprovalDetail,
    History: BookingHistory,
  }),
  defineInboxKind<BookingRecord>({
    key: 'bkdone',
    label: 'Work done',
    title: 'Booking work done',
    module: 'tasks',
    icon: CircleCheckBig,
    useItems: useDoneQueue,
    row: (item, { today, now }) => ({
      title: item.who,
      subtitle: `Marked done · ${item.record.kekaCode || item.record.project || 'Booking'}`,
      meta: whenLine(item.record, today),
      age: ago(item.at, now),
    }),
    Detail: BookingDoneDetail,
  }),
  defineInboxKind<BookingRecord>({
    key: 'bkrate',
    label: 'Rate',
    title: 'Rate a booking',
    module: 'tasks',
    icon: Star,
    useItems: useRateQueue,
    row: (item, { today, now }) => ({
      title: item.who,
      subtitle: `Rate their work · ${item.record.kekaCode || item.record.project || 'Booking'}`,
      meta: whenLine(item.record, today),
      age: ago(item.at, now),
    }),
    Detail: BookingRateDetail,
  }),
];
