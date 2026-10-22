// Book a conference room (web: BookRoom, dash.html:27955–28157). Pick a room and a day (up to 30 days
// ahead), then half-hour slots on a grid: tap a free slot to start, tap later to stretch, tap the ends
// to shrink (handleSlotClick :28002). Booked slots are filled, slots someone else is holding say who,
// past slots are off. The picked slots are held for you while you finish. Then the purpose (IT Admin's
// list; its notice, client name and special requirements when it asks for them).
// Booking is two steps, as on the web: POST /room_slot_bookings claims the slots (409 if someone got
// there first), then POST /bookings records it, approved. Rooms never need approval. If the second
// step fails it is retried once with the same id before telling you the slots are held but unrecorded.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { ArrowRight, DoorClosed } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { postBooking, postRoomSlot, type Room, useBookingFeed, useRoomPurposes, useRooms, useRoomSlots } from '@/api/booking';
import { useNow } from '@/features/attendance/use-now';
import { canBook } from '@/features/booking/access';
import { refreshBookings, StepError } from '@/features/booking/actions';
import { isPastSlot, liveRoomSlots, nextSelection, purposeMissing, ROOM_SLOTS, roomSlotState, type SlotSel, slotToTime } from '@/features/booking/model';
import { DayStrip, HoldNotice, typeIcon, useMe } from '@/features/booking/ui';
import { useSlotHold } from '@/features/booking/use-slot-hold';
import { dateLabel, durationLabel, hmLabel, istParts } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { palette, radius, space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  NavHeader,
  PressableScale,
  Screen,
  SelectField,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  Text,
  TextField,
  useLayout,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

/** Rows of `n` (the last one padded with negative keys, drawn as empty space). */
const rowsOf = (xs: number[], n: number) => {
  const out: number[][] = [];
  for (let i = 0; i < xs.length; i += n) {
    const row = xs.slice(i, i + n);
    while (row.length < n) row.push(-1 - row.length);
    out.push(row);
  }
  return out;
};

const MAX_DAYS = 30; // dash.html maxDate() for rooms and locations
const DAY_FIRST = 14; // 07:00
const DAY_LAST = 44; // up to 22:00

export default function BookRoomScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const me = useMe();
  const now = useNow(30_000);
  const ist = istParts(new Date(now));
  const today = ist.date;
  const nowMin = ist.hour * 60 + ist.minute;
  const allowed = canBook(access);
  // Four slots a row; three on a narrow phone or with large text, so "10:30 AM" stays whole.
  const cols = useLayout().compact ? 3 : 4;
  const rooms = useRooms(allowed);
  const purposes = useRoomPurposes(allowed);
  const [room, setRoom] = useState<Room | null>(null);
  const [date, setDate] = useState(today);
  const [sel, setSel] = useState<SlotSel>(null);
  const [allDay, setAllDay] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [client, setClient] = useState('');
  const [reqs, setReqs] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const slotRows = useRoomSlots(allowed && !!room, !!room && !done);
  const feed = useBookingFeed(allowed);
  // A cancelled or rejected booking's slot row stays on the server; the website reads past it.
  const slotData = slotRows.data && (feed.data || feed.isError) ? liveRoomSlots(slotRows.data, feed.data ?? []) : undefined;
  const hold = useSlotHold({
    type: 'room',
    resourceId: room?.id ?? '',
    date,
    payload: sel ? { startSlot: sel.start, endSlot: sel.end } : null,
    me,
    enabled: allowed && !!room && !done,
  });

  const book = useMutation({
    mutationFn: async () => {
      if (!room || !sel || !me) throw new Error('Pick a room and a time.');
      const p = purposes.data?.find((x) => x.id === purpose);
      const bookingId = `bkr${Date.now() + 1}`;
      await postRoomSlot({
        id: `rsb${Date.now()}`,
        roomId: room.id,
        date,
        startSlot: sel.start,
        endSlot: sel.end,
        bookedBy: me.name,
        bookedById: me.id,
        purpose,
        clientName: client.trim(),
        requirements: reqs || '',
        bookingId,
        holdId: hold.holdId,
      });
      hold.consume();
      const bk = {
        id: bookingId,
        type: 'rooms',
        resource: room.name || room.id,
        requestedBy: me.name,
        requestedById: me.id,
        dates: [date],
        status: 'approved',
        reason: '',
        purpose,
        purposeLabel: p?.label || '',
        clientName: client.trim(),
        startSlot: sel.start,
        endSlot: sel.end,
        requirements: reqs || '',
      };
      try {
        await postBooking(bk);
      } catch {
        try {
          await postBooking(bk);
        } catch (e2) {
          throw new StepError('The slots are yours, but the booking wasn’t recorded. Ask IT Admin to check it.', e2);
        }
      }
    },
    onSuccess: () => {
      refreshBookings(qc);
      setConfirm(false);
      setTimeout(() => setDone(true), 400);
    },
    onError: (e) => {
      setConfirm(false);
      refreshBookings(qc);
      setErr(e instanceof StepError ? e.done : e instanceof Error ? e.message : 'Couldn’t book the room.');
      if (!(e instanceof StepError)) setSel(null);
    },
  });

  if (!allowed) return <Redirect href="/" />;

  // ── Step 1: the room ──
  if (!room) {
    return (
      <Screen header={<NavHeader title="Book a room" />} onRefresh={() => rooms.refetch()}>
        <DayStrip value={date} onChange={setDate} today={today} days={8} maxDays={MAX_DAYS} />
        {rooms.isError && !rooms.data ? (
          <ErrorState message={rooms.error?.message || 'Couldn’t load the rooms.'} onRetry={() => void rooms.refetch()} />
        ) : !rooms.data ? (
          <SkeletonList rows={3} />
        ) : rooms.data.length ? (
          <ActivityList title="Rooms">
            {rooms.data.map((r) => (
              <ActivityRow
                key={r.id}
                module="tasks"
                icon={DoorClosed}
                title={r.name || r.id}
                subtitle={[r.floor, r.capacity ? `Seats ${r.capacity}` : ''].filter(Boolean).join(' · ') || undefined}
                chevron
                onPress={() => {
                  setRoom(r);
                  setSel(null);
                  setErr('');
                }}
              />
            ))}
          </ActivityList>
        ) : (
          <EmptyState icon={<DoorClosed color={palette.textMuted} />} title="No rooms yet" message="IT Admin adds conference rooms in the IT desk." />
        )}
      </Screen>
    );
  }

  // ── Step 2: the slots ──
  const state = roomSlotState({ roomId: room.id, date, slots: slotData ?? [], holds: hold.others });
  const first = allDay ? 0 : DAY_FIRST;
  const last = allDay ? ROOM_SLOTS : DAY_LAST;
  const shown = Array.from({ length: last - first }, (_, i) => first + i);
  const p = purposes.data?.find((x) => x.id === purpose) ?? null;
  const missing = purposeMissing(p, client, reqs);
  const tap = (s: number) => {
    if (state.taken(s) || isPastSlot(s, date, today, nowMin)) return;
    setErr('');
    setSel((cur) => nextSelection(cur, s, state.taken));
  };
  const range = sel ? `${hmLabel(slotToTime(sel.start))} – ${hmLabel(slotToTime(sel.end))}` : '';
  const ready = !!sel && !!purpose && !missing && !hold.holdErr;

  return (
    <>
      <Screen
        header={<NavHeader title="Book a room" />}
        onRefresh={() => Promise.all([slotRows.refetch(), feed.refetch()])}
        footer={
          <ActionBar note={sel ? `${range} · ${durationLabel((sel.end - sel.start) * 30)}${missing ? ` · ${missing} needed` : !purpose ? ' · pick a purpose' : ''}` : 'Tap a free slot to start.'}>
            <Button title="Review booking" icon={<ArrowRight />} disabled={!ready} onPress={() => setConfirm(true)} />
          </ActionBar>
        }>
        <AccountRow
          icon={DoorClosed}
          module="tasks"
          title={room.name || 'Room'}
          sub={[room.floor, room.capacity ? `Seats ${room.capacity}` : ''].filter(Boolean).join(' · ') || 'Conference room'}
          actionLabel="Change"
          onPress={() => {
            setRoom(null);
            setSel(null);
          }}
          accessibilityLabel={`${room.name || 'Room'}. Change room`}
        />
        <DayStrip
          value={date}
          onChange={(d) => {
            setDate(d);
            setSel(null);
          }}
          today={today}
          days={8}
          maxDays={MAX_DAYS}
        />
        <Card tone="frostStrong" style={styles.gridCard}>
          <Text variant="heading" accessibilityRole="header">
            {`Half-hour slots · ${dateLabel(date, today)}`}
          </Text>
          {slotRows.isError && !slotRows.data ? (
            <ErrorState message={slotRows.error?.message || 'Couldn’t load the room’s bookings.'} onRetry={() => void slotRows.refetch()} />
          ) : !slotData ? (
            <SkeletonList rows={2} />
          ) : (
            <View style={styles.grid}>
              {rowsOf(shown, cols).map((row) => (
                <View key={row[0]} style={styles.gridRow}>
                  {row.map((s) => {
                    if (s < 0) return <View key={s} style={styles.slotGap} />;
                    const booked = state.bookingAt(s);
                    const held = !booked ? state.heldAt(s) : null;
                    const past = isPastSlot(s, date, today, nowMin);
                    const on = !!sel && s >= sel.start && s < sel.end;
                    const t = hmLabel(slotToTime(s));
                    const label = booked ? `${t}, booked by ${booked.bookedBy || 'someone'}` : held ? `${t}, ${held.userName || 'someone'} is booking it` : past ? `${t}, past` : on ? `${t}, selected` : `${t}, free`;
                    return (
                      <PressableScale
                        key={s}
                        onPress={() => tap(s)}
                        disabled={!!booked || !!held || past}
                        scaleTo={0.95}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on, disabled: !!booked || !!held || past }}
                        accessibilityLabel={label}
                        style={[
                          styles.slot,
                          on && { backgroundColor: palette.primary, borderColor: palette.primary },
                          !!booked && { backgroundColor: palette.surfaceMuted, borderColor: palette.surfaceMuted },
                          !!held && { borderStyle: 'dashed', borderColor: palette.warning, backgroundColor: palette.warningSoft },
                          past && !booked && { opacity: 0.4 },
                        ]}>
                        <Text variant="caption" color={on ? palette.onPrimary : booked ? palette.textMuted : palette.text} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                          {t}
                        </Text>
                        {booked || held ? (
                          <Text variant="micro" color={held ? palette.warningInk : palette.textMuted} numberOfLines={1} maxFontSizeMultiplier={1}>
                            {booked ? 'Booked' : (held?.userName || 'Held').split(' ')[0]}
                          </Text>
                        ) : null}
                      </PressableScale>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
          <Button title={allDay ? 'Show 7 AM to 10 PM only' : 'Show earlier and later times'} variant="text" size="sm" onPress={() => setAllDay((v) => !v)} style={styles.change} />
        </Card>
        <HoldNotice secsLeft={hold.secsLeft} holdErr={hold.holdErr} />
        {err ? <Banner tone="danger" title="Couldn’t book it" message={err} /> : null}
        {sel ? (
          <Card tone="frostStrong" style={styles.form}>
            <SelectField
              label="Purpose"
              placeholder="What is the room for?"
              value={purpose || null}
              onChange={(v) => {
                setPurpose(v);
                const np = purposes.data?.find((x) => x.id === v);
                if (!np?.requiresRequirements) setReqs('');
                if (!np?.requiresClient) setClient('');
              }}
              options={(purposes.data ?? []).map((x) => ({ value: x.id, label: x.label }))}
            />
            {p?.notice ? <Banner tone="warning" title={`${p.label} booking`} message={p.notice} /> : null}
            {p?.requiresClient ? <TextField label="Client name" value={client} onChangeText={setClient} placeholder="Who is coming in" /> : null}
            {p?.requiresRequirements ? <TextField label="Special requirements" value={reqs} onChangeText={setReqs} multiline placeholder="Projector, refreshments, seating…" /> : null}
          </Card>
        ) : null}
      </Screen>

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Book this room?"
        from={{ title: 'You', subtitle: 'Booking', avatar: { name: me?.name || 'You' } }}
        to={{ title: room.name || 'Room', subtitle: room.floor || 'Conference room', icon: typeIcon('rooms'), module: 'tasks' }}
        detailsTitle="Booking"
        confirmLabel="Swipe to book"
        onConfirm={() => book.mutate()}
        loading={book.isPending}
        note={
          p?.requiresClient
            ? 'You get a confirmation by email and WhatsApp. Every Super Admin and IT Admin is told about the client visit.'
            : 'You get a confirmation by email and WhatsApp.'
        }>
        <SummaryCard
          rows={[
            { key: 'day', label: 'Date', value: dateLabel(date, today) },
            { key: 'time', label: 'Time', value: range },
            { key: 'p', label: 'Purpose', value: p?.label || null },
            { key: 'c', label: 'Client', value: client.trim() || null },
            { key: 'r', label: 'Requirements', value: reqs.trim() || null },
          ]}
          hideEmpty
        />
      </ConfirmSheet>

      <SuccessSheet
        visible={done}
        onClose={() => router.dismissTo('/admin/booking')}
        onPrimary={() => router.dismissTo('/admin/booking')}
        title="Room booked"
        subtitle={`${room.name || 'The room'} is yours on ${dateLabel(date, today)}, ${range}.`}
      />
    </>
  );
}

const styles = themedStyles(() => ({
  change: { alignSelf: 'flex-start' },
  gridCard: { gap: space.sm },
  grid: { gap: space.xs },
  gridRow: { flexDirection: 'row', gap: space.xs },
  slotGap: { flex: 1 },
  slot: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.glassLine,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  form: { gap: space.md },
}));
