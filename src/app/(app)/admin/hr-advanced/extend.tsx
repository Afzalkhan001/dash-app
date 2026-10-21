// Extend shoot time — the website's ManagerHome "Extend Shoot Time" (dash.html:22948 extendBooking,
// the modal at :22959), for the `manager` role: today's approved professional bookings of my direct
// reports, and a later end time for one of them.
//   PUT /bookings/:id {endTime}   routes/bookings.js:193 (emails only go out on a status change)
// The website saves without any check and can silently double-book the professional. Here the new
// end is checked against the professional's other bookings that day (with the category's gap), the
// category's day end and anyone else's live hold — on data read again just before saving — and the
// extra time is held (POST /holds) while the save runs, so the server refuses if it was just taken.
// ConfirmSheet + SwipeToConfirm; nobody is messaged, so the sheet says to tell the professional.

import { router } from 'expo-router';
import { Clapperboard, Clock, Timer } from 'lucide-react-native';
import { useState } from 'react';

import { type BookingRecord, type BookUser, useBookingFeed, useBookingUsers } from '@/api/booking';
import { useTodayIst } from '@/features/attendance/use-now';
import { effEnd, profTypeLabel, profTypesOf, toMin } from '@/features/booking/model';
import { canExtendShoots } from '@/features/hradvanced/access';
import { extendBooking, fetchBookings, fetchHolds } from '@/features/hradvanced/api';
import { extendError, latestEnd, minHm, type TeamShoot, teamShootsToday } from '@/features/hradvanced/extend-model';
import { errorText, GateFallback } from '@/features/hradvanced/ui';
import { Stepper } from '@/features/hrtime/ui';
import { hmLabel } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { ActivityList, ActivityRow, Banner, Button, ConfirmSheet, NavHeader, Screen, Sheet, SummaryCard, toast } from '@/ui';

export default function ExtendShootScreen() {
  const access = useAccess();
  const allowed = canExtendShoots(access.user);
  const feed = useBookingFeed(allowed);
  const users = useBookingUsers(allowed);
  const today = useTodayIst();
  const [openId, setOpenId] = useState<string | null>(null);
  const header = <NavHeader title="Extend a shoot" />;
  if (!allowed) return <GateFallback pending={!access.user || access.loading} header={header} />;

  const types = profTypesOf(access.tenant?.profTypes);
  const list = Array.isArray(feed.data) ? feed.data : [];
  const shoots = teamShootsToday(list, Array.isArray(users.data) ? users.data : [], String(access.user?.name || ''), today);
  const open = shoots.find((s) => s.booking.id === openId) ?? null;
  const loading = feed.isPending || users.isPending;
  const err = (feed.error && !feed.data) || (users.error && !users.data) ? (feed.error ?? users.error) : null;

  return (
    <Screen header={header} onRefresh={() => Promise.all([feed.refetch(), users.refetch()])}>
      <Banner
        tone="info"
        icon={Timer}
        title="Shoot running long?"
        message="Give one of your team’s bookings today a later end. The app checks their next booking first, so nobody is double-booked."
      />
      {err ? <Banner tone="danger" title="Couldn’t load today’s shoots" message={errorText(err)} action={{ label: 'Retry', onPress: () => void Promise.all([feed.refetch(), users.refetch()]) }} /> : null}
      <ActivityList title="Your team’s shoots today" loading={loading} empty={err ? 'Couldn’t load.' : 'None of your team has an approved booking today.'}>
        {shoots.map(({ booking: b, person }) => {
          const l = latestEnd(list, b, types);
          const cur = toMin(effEnd(b)) ?? 0;
          const room = l.limit - cur;
          return (
            <ActivityRow
              key={b.id}
              person={{ name: person.name }}
              title={person.name}
              subtitle={`${hmLabel(b.startTime)} – ${hmLabel(effEnd(b))} · ${b.project || b.kekaCode || 'Booking'}`}
              meta={profTypeLabel(types, b.profType)}
              status={
                b.actualEndTime
                  ? { label: 'Finished early', tone: 'failed' }
                  : room >= 15
                    ? { label: `Free till ${hmLabel(minHm(l.limit))}`, tone: 'done' }
                    : { label: l.next ? 'Booked right after' : 'Day is over', tone: 'failed' }
              }
              chevron
              onPress={() => setOpenId(b.id)}
              accessibilityHint="Choose a later end time"
            />
          );
        })}
      </ActivityList>
      <Button title="Book a professional" variant="ghost" icon={<Clapperboard />} onPress={() => router.push('/admin/booking')} />
      {open ? <ExtendSheet key={open.booking.id} shoot={open} list={list} onClose={() => setOpenId(null)} onDone={() => void feed.refetch()} /> : null}
    </Screen>
  );
}

function ExtendSheet({ shoot, list, onClose, onDone }: { shoot: TeamShoot; list: BookingRecord[]; onClose: () => void; onDone: () => void }) {
  const access = useAccess();
  const me = access.user;
  const types = profTypesOf(access.tenant?.profTypes);
  const b = shoot.booking;
  const person: BookUser = shoot.person;
  const cur = toMin(effEnd(b)) ?? 0;
  const l = latestEnd(list, b, types);
  const room = b.actualEndTime ? 0 : Math.max(0, l.limit - cur);
  const [extra, setExtra] = useState(() => Math.min(60, Math.max(15, Math.floor(room / 15) * 15)));
  const [confirming, setConfirming] = useState(false);
  const [checking, setChecking] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const newEnd = cur + extra;
  const localErr = extendError({ list, booking: b, newEnd, types, holds: [], meId: me?.id });
  const date = String(b.date || b.dates?.[0] || '');

  const review = async () => {
    setBlocked(null);
    setError(null);
    setChecking(true);
    try {
      const [fresh, holds] = await Promise.all([fetchBookings(date), b.resourceId ? fetchHolds(b.resourceId, date) : Promise.resolve([])]);
      const now = fresh.find((x) => x.id === b.id);
      if (!now || now.status !== 'approved') {
        setBlocked('This booking changed a moment ago (it is no longer approved). Pull to refresh.');
        return;
      }
      if ((now.actualEndTime || now.endTime) !== effEnd(b)) {
        setBlocked(`Someone already changed its end to ${hmLabel(now.actualEndTime || now.endTime)}. Pull to refresh.`);
        return;
      }
      const e = extendError({ list: fresh, booking: now, newEnd, types, holds, meId: me?.id });
      if (e) {
        setBlocked(e);
        return;
      }
      setConfirming(true);
    } catch (e) {
      setBlocked(errorText(e));
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await extendBooking({ bookingId: b.id, resourceId: String(b.resourceId || ''), date, fromMin: cur, toMin: newEnd, endTime: minHm(newEnd), me: { id: me?.id, name: me?.name } });
      toast.show(`${person.name}’s booking now ends at ${hmLabel(minHm(newEnd))}.`);
      setConfirming(false);
      onDone();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet
        visible={!confirming}
        onClose={onClose}
        title={`Extend ${person.name}’s shoot`}
        subtitle={`${b.project || b.kekaCode || 'Booking'} · now ${hmLabel(b.startTime)} – ${hmLabel(effEnd(b))}`}
        footer={<Button title="Check and continue" icon={<Clock />} onPress={() => void review()} loading={checking} disabled={room < 15 || !!localErr} />}>
        {room < 15 ? (
          <Banner
            tone="danger"
            title="No time to add"
            message={b.actualEndTime ? `This shoot was marked finished early at ${hmLabel(b.actualEndTime)}. Book a new slot instead.` : l.next ? `${person.name} is booked again at ${hmLabel(l.next.startTime)}${l.gap ? ` (with a ${l.gap}-minute gap)` : ''}. Ask ${l.next.requestedBy || 'that booker'} to move it first.` : `Bookings for this category end by ${hmLabel(minHm(l.dayEnd))}.`}
          />
        ) : (
          <>
            <Stepper label="Extra time" value={extra} onChange={setExtra} step={15} min={15} max={Math.max(15, Math.floor(room / 15) * 15)} unit="min" hint={`New end: ${hmLabel(minHm(newEnd))}. Latest possible: ${hmLabel(minHm(l.limit))}.`} />
            {localErr ? <Banner tone="danger" title="That would double-book" message={localErr} /> : null}
          </>
        )}
        {blocked ? <Banner tone="danger" title="Can’t extend to that time" message={blocked} /> : null}
        <SummaryCard
          rows={[
            { label: 'Category', value: profTypeLabel(types, b.profType) },
            { label: 'Booked by', value: b.requestedBy || '—' },
            { label: 'Next booking today', value: l.next ? `${hmLabel(l.next.startTime)} for ${l.next.requestedBy || 'someone'}` : 'None' },
            ...(l.gap ? [{ label: 'Gap kept after a booking', value: `${l.gap} min` }] : []),
          ]}
        />
      </Sheet>
      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Extend this shoot?"
        subtitle={b.project || b.kekaCode || undefined}
        from={{ title: hmLabel(effEnd(b)), subtitle: 'Ends now', icon: Clock, module: 'tasks' }}
        to={{ title: hmLabel(minHm(newEnd)), subtitle: `+${extra} min`, icon: Timer, module: 'tasks' }}
        confirmLabel="Swipe to extend"
        onConfirm={() => void submit()}
        loading={saving}
        note={`Nobody is messaged — tell ${person.name} yourself.`}>
        <SummaryCard
          rows={[
            { label: 'Professional', value: person.name },
            { label: 'Date', value: 'Today' },
            { label: 'New time', value: `${hmLabel(b.startTime)} – ${hmLabel(minHm(newEnd))}` },
            { label: 'Double-booking check', value: 'Clear', status: 'done' },
          ]}
        />
        {error ? <Banner tone="danger" title="Couldn’t extend" message={error} /> : null}
      </ConfirmSheet>
    </>
  );
}
