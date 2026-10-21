// Rooms & locations (web: RoomsLocations, dash.html:21959–21982) — the IT Admin's four tabs:
//   Rooms       every conference room, open or closed (no photos in the list: GET /rooms sends a count)
//   Locations   every shooting location
//   Bookings    room bookings only (type 'rooms'), Upcoming / Cancelled / Done — "done" is worked out
//               from the date and end slot (isRoomBookingPast, India time). Cancel an upcoming one:
//               a reason (default "Cancelled by IT Admin") and a swipe. The website does it with no
//               confirmation; here it says who is told — the requester gets an email and a WhatsApp.
//   Purposes    what people pick when they book a room: add, edit, turn off, delete
// "+" adds a room, a location or a purpose, depending on the tab.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, CalendarX, DoorOpen, MapPin, Plus, Tags } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { BookingRecord } from '@/api/booking';
import { type Purpose, useCancelRoomBooking, useItLocations, useItRooms, usePurposes, useRoomBookings } from '@/api/itdesk';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { canSeeRooms } from '@/features/itdesk/access';
import { isRoomBookingPast, slotHm } from '@/features/itdesk/format';
import { PurposeSheet } from '@/features/itdesk/purpose-sheet';
import { PurposeDot, StatusRow } from '@/features/itdesk/ui';
import { dateLabel, hmLabel } from '@/lib/dates';
import { firstName, plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  ActivityList,
  Button,
  Chip,
  ChipRow,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  NavHeader,
  Screen,
  Segmented,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  Text,
  TextField,
  toast,
  useLayout,
} from '@/ui';

type Tab = 'rooms' | 'locations' | 'bookings' | 'purposes';
type BkTab = 'upcoming' | 'rejected' | 'completed';
const TABS: Tab[] = ['rooms', 'locations', 'bookings', 'purposes'];
const TAB_OPTIONS: { key: Tab; label: string }[] = [
  { key: 'rooms', label: 'Rooms' },
  { key: 'locations', label: 'Locations' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'purposes', label: 'Purposes' },
];
const DEFAULT_REASON = 'Cancelled by IT Admin';

export default function RoomsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const access = useAccess();
  const allowed = canSeeRooms(access);
  const today = useTodayIst();
  const now = useNow();
  const { compact } = useLayout();
  const [tab, setTab] = useState<Tab>(TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'rooms');
  const [bkTab, setBkTab] = useState<BkTab>('upcoming');
  const rooms = useItRooms(allowed && tab === 'rooms');
  const locations = useItLocations(allowed && tab === 'locations');
  const bookings = useRoomBookings(allowed && tab === 'bookings');
  const purposes = usePurposes(allowed && (tab === 'purposes' || tab === 'bookings'));
  const cancel = useCancelRoomBooking();
  const [purposeOpen, setPurposeOpen] = useState<{ key: string; purpose: Purpose | null } | null>(null);
  const [cancelling, setCancelling] = useState<BookingRecord | null>(null);
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [cancelled, setCancelled] = useState<{ who: string; warn?: string } | null>(null);

  if (access.user && !allowed) return <Redirect href="/" />;

  const add = () => {
    if (tab === 'rooms') router.push('/admin/it-desk/rooms/room');
    else if (tab === 'locations') router.push('/admin/it-desk/rooms/location');
    else if (tab === 'purposes') setPurposeOpen({ key: `new-${now}`, purpose: null });
  };
  const addLabel = tab === 'rooms' ? 'Add a room' : tab === 'locations' ? 'Add a location' : 'Add a purpose';

  // dash.html:21971 — the three sub-tabs, sorted the website's way.
  const all = bookings.data ?? [];
  const past = (b: BookingRecord) => isRoomBookingPast(b, now);
  const inBk = (b: BookingRecord, t: BkTab) => (t === 'rejected' ? b.status === 'rejected' : t === 'completed' ? b.status !== 'rejected' && past(b) : b.status !== 'rejected' && !past(b));
  const day = (b: BookingRecord) => (b.dates ?? [])[0] ?? '';
  const bkRows = all
    .filter((b) => inBk(b, bkTab))
    .sort((a, b) => {
      const ad = day(a);
      const bd = day(b);
      if (bkTab === 'upcoming') return ad !== bd ? ad.localeCompare(bd) : (a.startSlot ?? 0) - (b.startSlot ?? 0);
      return ad !== bd ? bd.localeCompare(ad) : (b.startSlot ?? 0) - (a.startSlot ?? 0);
    });
  const purposeOf = (b: BookingRecord) => (purposes.data ?? []).find((p) => p.id === b.purpose);
  const timeOfBooking = (b: BookingRecord) => (b.startSlot != null ? `${hmLabel(slotHm(b.startSlot))} – ${hmLabel(slotHm(b.endSlot))}` : '');

  const confirmCancel = () => {
    const b = cancelling;
    if (!b) return;
    const why = reason.trim() || DEFAULT_REASON;
    cancel.mutate(
      { booking: b, reason: why },
      {
        onSuccess: (r) => {
          setCancelling(null);
          setCancelled({ who: b.requestedBy || 'The person who booked', warn: r.slotError ? `The booking is cancelled and ${firstName(b.requestedBy || '') || 'they'} is told, but the room’s time is still blocked (${r.slotError}). Free it on the DASH website.` : undefined });
        },
        onError: (e) => {
          setCancelling(null);
          toast.show(`Couldn’t cancel: ${e.message}`, 'danger');
        },
      },
    );
  };

  const loadingOr = (q: { isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown; data?: unknown }) =>
    q.isPending ? <SkeletonList rows={5} avatar /> : q.isError && !q.data ? <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} /> : null;

  return (
    <Screen
      header={<NavHeader title="Rooms & locations" actions={tab === 'bookings' ? [] : [{ key: 'add', icon: Plus, label: addLabel, onPress: add }]} />}
      onRefresh={() => (tab === 'rooms' ? rooms.refetch() : tab === 'locations' ? locations.refetch() : tab === 'bookings' ? bookings.refetch() : purposes.refetch())}>
      {/* Four tabs fit a segmented control from 380 dp; on a narrower phone (or with large text) its
          labels were cut ("Locati…", "Bookin…"), so the same tabs scroll as chips there. */}
      {compact ? (
        <ChipRow>
          {TAB_OPTIONS.map((o) => (
            <Chip key={o.key} label={o.label} selected={tab === o.key} onPress={() => setTab(o.key)} />
          ))}
        </ChipRow>
      ) : (
        <Segmented<Tab> options={TAB_OPTIONS} value={tab} onChange={setTab} />
      )}

      {tab === 'rooms' ? (
        loadingOr(rooms) ??
        ((rooms.data ?? []).length ? (
          <ActivityList title={plural(rooms.data!.length, 'conference room')}>
            {rooms.data!.map((r) => (
              <StatusRow
                key={r.id}
                module="support"
                icon={DoorOpen}
                title={r.name || 'Unnamed room'}
                subtitle={[r.capacity ? `${r.capacity} people` : '', r.floor].filter(Boolean).join(' · ') || undefined}
                note={[r.amenities.slice(0, 3).join(', '), r.imageCount ? plural(r.imageCount, 'photo') : 'No photos'].filter(Boolean).join(' · ')}
                // Open is the usual state; only a closed room carries a pill.
                status={r.status === 'active' ? null : { label: 'Closed', tone: 'neutral' }}
                chevron
                onPress={() => router.push(`/admin/it-desk/rooms/room?id=${encodeURIComponent(r.id)}`)}
              />
            ))}
          </ActivityList>
        ) : (
          <EmptyState
            icon={<DoorOpen color={palette.textMuted} />}
            title="No rooms yet"
            message="Add the first one so people can book it."
            action={<Button title="Add a room" variant="accent" size="md" icon={<Plus />} onPress={add} />}
          />
        ))
      ) : null}

      {tab === 'locations' ? (
        loadingOr(locations) ??
        ((locations.data ?? []).length ? (
          <ActivityList title={plural(locations.data!.length, 'shooting location')}>
            {locations.data!.map((l) => (
              <StatusRow
                key={l.id}
                module="support"
                icon={MapPin}
                title={l.name || 'Unnamed location'}
                subtitle={[[l.area, l.city].filter(Boolean).join(', '), l.type === 'outdoor' ? 'Outdoor' : 'Indoor'].filter(Boolean).join(' · ')}
                note={[l.approvalRequired ? `Approved by ${l.approverName || 'someone'}` : 'No approval needed', l.imageCount ? plural(l.imageCount, 'photo') : 'No photos'].join(' · ')}
                status={l.status === 'active' ? null : { label: 'Closed', tone: 'neutral' }}
                chevron
                onPress={() => router.push(`/admin/it-desk/rooms/location?id=${encodeURIComponent(l.id)}`)}
              />
            ))}
          </ActivityList>
        ) : (
          <EmptyState
            icon={<MapPin color={palette.textMuted} />}
            title="No locations yet"
            message="Add a shooting location so teams can book it."
            action={<Button title="Add a location" variant="accent" size="md" icon={<Plus />} onPress={add} />}
          />
        ))
      ) : null}

      {tab === 'bookings' ? (
        <View style={styles.block}>
          <ChipRow>
            {(['upcoming', 'rejected', 'completed'] as BkTab[]).map((t) => (
              <Chip
                key={t}
                label={t === 'upcoming' ? 'Upcoming' : t === 'rejected' ? 'Cancelled' : 'Done'}
                count={bookings.data ? all.filter((b) => inBk(b, t)).length : undefined}
                selected={bkTab === t}
                onPress={() => setBkTab(t)}
              />
            ))}
          </ChipRow>
          {bkTab === 'upcoming' && bkRows.length ? (
            <Text variant="caption" muted>
              Need a room for something more important? Tap a booking to cancel it. The person who booked is told.
            </Text>
          ) : null}
          {loadingOr(bookings) ??
            (bkRows.length ? (
              <ActivityList>
                {bkRows.map((b) => {
                  const p = purposeOf(b);
                  const label = p?.label || b.purposeLabel || '';
                  // The website keeps a booking the person cancelled themselves under Upcoming (it only
                  // sets `rejected` aside). There is nothing left to cancel, so it is shown, not offered.
                  const canCancel = bkTab === 'upcoming' && b.status !== 'cancelled';
                  return (
                    <StatusRow
                      key={b.id}
                      module="support"
                      icon={bkTab === 'rejected' ? CalendarX : Building2}
                      title={b.resource || 'Room'}
                      // When first, then who and why: the day and time never wrap out of view.
                      subtitle={[dateLabel(day(b), today), timeOfBooking(b)].filter(Boolean).join(' · ')}
                      note={[b.requestedBy, label, b.clientName ? `Client: ${b.clientName}` : ''].filter(Boolean).join(' · ') || undefined}
                      // A pill only where it adds to the tab: "Booked" and "Done" are what the tab already says.
                      status={
                        bkTab === 'rejected'
                          ? { label: /cancel/i.test(String(b.reason || '')) ? 'Cancelled' : 'Rejected', tone: 'failed' }
                          : bkTab === 'completed'
                            ? null
                            : b.status === 'cancelled'
                              ? { label: 'Cancelled by them', tone: 'neutral' }
                              : b.status === 'pending'
                                ? { label: 'Waiting', tone: 'pending' }
                                : null
                      }
                      chevron={canCancel}
                      accessibilityHint={canCancel ? 'Opens cancel' : undefined}
                      onPress={
                        canCancel
                          ? () => {
                              setReason(DEFAULT_REASON);
                              setCancelling(b);
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </ActivityList>
            ) : (
              <EmptyState
                icon={<Building2 color={palette.textMuted} />}
                title={bkTab === 'upcoming' ? 'No upcoming room bookings' : bkTab === 'rejected' ? 'Nothing cancelled' : 'No past bookings'}
                message={bkTab === 'upcoming' ? 'New room bookings show up here.' : undefined}
              />
            ))}
        </View>
      ) : null}

      {tab === 'purposes' ? (
        loadingOr(purposes) ??
        ((purposes.data ?? []).length ? (
          <ActivityList title="What people book rooms for">
            {purposes.data!.map((p) => (
              <StatusRow
                key={p.id}
                left={<PurposeDot color={p.color} bg={p.bg} />}
                title={p.label}
                subtitle={[p.requiresClient ? 'Needs a client name' : '', p.requiresRequirements ? 'Needs special requirements' : ''].filter(Boolean).join(' · ') || 'Nothing extra needed'}
                note={p.notice || undefined}
                status={p.active ? null : { label: 'Hidden', tone: 'neutral' }}
                chevron
                accessibilityLabel={`${p.label}, ${p.active ? 'shown' : 'hidden'} for new bookings`}
                onPress={() => setPurposeOpen({ key: p.id, purpose: p })}
              />
            ))}
          </ActivityList>
        ) : (
          <EmptyState
            icon={<Tags color={palette.textMuted} />}
            title="No purposes yet"
            message="Until you add some, people choose from the five standard ones."
            action={<Button title="Add a purpose" variant="accent" size="md" icon={<Plus />} onPress={add} />}
          />
        ))
      ) : null}

      {purposeOpen ? <PurposeSheet key={purposeOpen.key} visible onClose={() => setPurposeOpen(null)} purpose={purposeOpen.purpose} /> : null}

      <ConfirmSheet
        visible={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancel this booking?"
        from={{ title: cancelling?.resource || 'Room', subtitle: cancelling ? [dateLabel(day(cancelling), today), timeOfBooking(cancelling)].filter(Boolean).join(' · ') : undefined, icon: Building2, module: 'support' }}
        to={{ title: cancelling?.requestedBy || 'The person who booked', subtitle: 'Email and WhatsApp', avatar: { name: cancelling?.requestedBy || '?' } }}
        confirmLabel="Swipe to cancel booking"
        loading={cancel.isPending}
        disabled={!reason.trim()}
        onConfirm={confirmCancel}
        note={`${cancelling?.requestedBy ? firstName(cancelling.requestedBy) : 'The person who booked'} gets an email and a WhatsApp saying it was cancelled, with this reason. It can’t be undone.`}>
        <View style={styles.block}>
          {cancelling ? (
            <SummaryCard
              rows={[
                { key: 'p', label: 'Purpose', value: purposeOf(cancelling)?.label || cancelling.purposeLabel || '—' },
                ...(cancelling.clientName ? [{ key: 'c', label: 'Client', value: cancelling.clientName }] : []),
              ]}
            />
          ) : null}
          <TextField label="Reason" value={reason} onChangeText={setReason} maxLength={200} multiline error={!reason.trim() ? 'Say why' : null} />
        </View>
      </ConfirmSheet>

      <SuccessSheet
        visible={!!cancelled}
        onClose={() => setCancelled(null)}
        title="Booking cancelled"
        subtitle={cancelled?.warn ?? `${cancelled?.who ?? 'The person who booked'} gets an email and a WhatsApp. The time is free again.`}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  block: { gap: space.sm },
}));
