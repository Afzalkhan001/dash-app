// One of my bookings (web: My Booking Requests row + BookingHistoryPanel detail, dash.html:27322, :27280).
// What, when, its status and history. While it is waiting or approved its requester can cancel it
// (cancelMyBooking :27306): PUT {status:'rejected', reason:'Cancelled by requester'} — the server frees
// the time and emails and WhatsApps the requester — then a room's or location's slot row is deleted.
// Work marked done or waiting for a rating opens its Inbox item.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarX2, CircleCheckBig, Star } from 'lucide-react-native';
import { useState } from 'react';
import { Alert } from 'react-native';

import { useTodayIst } from '@/features/attendance/use-now';
import { canBook } from '@/features/booking/access';
import { cancelBooking, refreshBookings, StepError } from '@/features/booking/actions';
import { BookingHero, bookingFields, ProDayCard, useBookingById } from '@/features/booking/detail-parts';
import { canCancel, isMine, needsReview, statusOf, typeLabel } from '@/features/booking/model';
import { BOOKING_MODULE, typeIcon, useMe, useProfTypes, whenLine } from '@/features/booking/ui';
import { DetailsCard, WhoCards } from '@/features/inbox/detail';
import type { TimelineEvent } from '@/features/inbox/format';
import { stampLabel } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { space } from '@/theme/tokens';
import { ActionBar, Banner, Button, Card, ConfirmSheet, EmptyState, ErrorState, EventTimeline, NavHeader, Screen, SkeletonList, SuccessSheet, SummaryCard, Text } from '@/ui';

export default function MyBookingScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const me = useMe();
  const today = useTodayIst();
  const types = useProfTypes();
  const { b, list, loading, error, refetch } = useBookingById(String(id));
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const cancel = useMutation({
    mutationFn: cancelBooking,
    onSuccess: () => {
      refreshBookings(qc);
      setConfirm(false);
      setTimeout(() => setDone(true), 400);
    },
    onError: (e) => {
      setConfirm(false);
      refreshBookings(qc);
      if (e instanceof StepError) Alert.alert('Booking cancelled', `${e.done}`);
      else Alert.alert('Couldn’t cancel', e instanceof Error ? e.message : 'Please try again.');
    },
  });

  if (!canBook(access)) return <Redirect href="/" />;
  if (!b) {
    return (
      <Screen header={<NavHeader title="Booking" />}>
        {loading ? <SkeletonList rows={4} /> : error ? <ErrorState message={error} onRetry={() => void refetch()} /> : <EmptyState title="This booking isn’t here any more" message="It may have been removed." />}
      </Screen>
    );
  }

  const mine = isMine(b, me);
  const forMe = !!me && b.resourceId === me.id;
  const st = statusOf(b);
  const kind = typeLabel(b, types);
  const cancellable = mine && canCancel(b) && !cancel.isSuccess;
  const toApprove = mine && b.status === 'pending_review';
  const toRate = mine && b.status === 'completed' && needsReview(b);

  const events: TimelineEvent[] = [
    { key: 'sent', label: `Booked by ${b.requestedBy || '—'}`, at: b.createdAt ? stampLabel(b.createdAt, today) : undefined, tone: 'neutral' },
    ...(b.approvedAt || b.approvedBy ? [{ key: 'ok', label: `Approved${b.approvedBy ? ` by ${b.approvedBy}` : ''}`, at: b.approvedAt ? stampLabel(b.approvedAt, today) : undefined, tone: 'good' as const }] : []),
    ...(b.status === 'rejected' ? [{ key: 'no', label: st.label === 'Cancelled' ? 'Cancelled' : `Rejected${b.rejectedBy ? ` by ${b.rejectedBy}` : ''}`, note: b.reason || undefined, tone: 'bad' as const }] : []),
    ...(b.markedDoneAt ? [{ key: 'mk', label: `Marked done by ${b.markedDoneBy || b.resource || '—'}`, at: stampLabel(b.markedDoneAt, today), tone: 'info' as const }] : []),
    ...(b.completedAt ? [{ key: 'cp', label: `Completed${b.completedBy ? ` by ${b.completedBy}` : ''}`, at: stampLabel(b.completedAt, today), tone: 'good' as const }] : []),
    ...(Array.isArray(b.reviews) && b.reviews[0]
      ? [{ key: 'rv', label: `Rated ${b.reviews[0].rating ?? '—'} of 5 by ${b.reviews[0].reviewerName || '—'}`, at: b.reviews[0].date ? stampLabel(b.reviews[0].date, today) : undefined, tone: 'good' as const }]
      : []),
  ];

  const footer = cancellable ? (
    <ActionBar>
      <Button title="Cancel booking" variant="danger" icon={<CalendarX2 />} onPress={() => setConfirm(true)} loading={cancel.isPending} />
    </ActionBar>
  ) : toApprove ? (
    <ActionBar note="The work is marked done. Check it and approve it.">
      <Button title="Review the work" icon={<CircleCheckBig />} onPress={() => router.push(`/inbox/bkdone/${encodeURIComponent(b.id)}`)} />
    </ActionBar>
  ) : toRate ? (
    <ActionBar>
      <Button title="Rate this booking" icon={<Star />} onPress={() => router.push(`/inbox/bkrate/${encodeURIComponent(b.id)}`)} />
    </ActionBar>
  ) : undefined;

  return (
    <>
      <Screen header={<NavHeader title="Booking" />} onRefresh={() => refetch()} footer={footer}>
        <BookingHero b={b} today={today} types={types} />
        <WhoCards
          from={forMe ? { title: b.requestedBy || '—', subtitle: 'Booked you', avatar: { name: b.requestedBy || '' } } : { title: mine ? 'You' : b.requestedBy || '—', subtitle: 'Booked', avatar: { name: mine ? me?.name || 'You' : b.requestedBy || '' } }}
          to={
            b.type === 'professionals'
              ? { title: forMe ? 'You' : b.resource || '—', subtitle: kind, avatar: { name: forMe ? me?.name || 'You' : b.resource || '' } }
              : { title: b.resource || '—', subtitle: kind, icon: typeIcon(b.type), module: BOOKING_MODULE }
          }
        />
        {b.status === 'pending' && b.type === 'locations' && b.locationApproverName ? (
          <Banner tone="info" title={`Waiting for ${b.locationApproverName}`} message="They approve bookings of this location." />
        ) : null}
        <DetailsCard status={st} fields={[...bookingFields(b), ...(b.status === 'rejected' && b.reason ? [{ label: 'Reason', value: b.reason }] : [])]} />
        <Card tone="frostStrong" style={{ gap: space.sm }}>
          <Text variant="heading" accessibilityRole="header">
            History
          </Text>
          <EventTimeline events={events.map((e) => ({ key: e.key, label: e.label, at: e.at, note: e.note, tone: e.tone }))} />
        </Card>
        {forMe ? <ProDayCard b={b} list={list} today={today} /> : null}
      </Screen>

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Cancel booking?"
        detailsTitle="The time is freed for others"
        confirmLabel="Swipe to cancel"
        onConfirm={() => cancel.mutate(b)}
        loading={cancel.isPending}
        note="You get an email and WhatsApp that it’s cancelled. This can’t be undone.">
        <SummaryCard
          rows={[
            { key: 'what', label: kind, value: b.resource || '—' },
            { key: 'when', label: 'When', value: whenLine(b, today) },
          ]}
        />
      </ConfirmSheet>

      <SuccessSheet visible={done} onClose={() => router.back()} onPrimary={() => router.back()} title="Booking cancelled" subtitle="The time is free for others to book." />
    </>
  );
}
