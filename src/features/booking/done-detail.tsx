// Inbox › Work done › one booking (web: BookProfessional "Awaiting Your Approval", dash.html:27772;
// approveCompletion :27491). The professional marked the work done; the requester approves it:
// PUT /bookings/:id {status:'completed', completedBy, completedAt}, then the booking's task is
// completed (with the booked length when no time was logged) — or a completed task is made when there
// is none. Completing the task sends the professional "Task approved" by email and WhatsApp.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { CircleCheckBig } from 'lucide-react-native';
import { useState } from 'react';
import { Alert } from 'react-native';

import type { BookingRecord } from '@/api/booking';
import { useTodayIst } from '@/features/attendance/use-now';
import { canBook } from '@/features/booking/access';
import { approveCompletion, refreshBookings, StepError } from '@/features/booking/actions';
import { BookingHero, bookingFields, useBookingById } from '@/features/booking/detail-parts';
import { bookingLooksCancelled, statusOf } from '@/features/booking/model';
import { timeRange, useMe, useProfTypes, whenLine } from '@/features/booking/ui';
import { noteDecision } from '@/features/inbox/decided';
import { DecidedSheet, DetailsCard, explainDecisionError, outcomeStatus, useOutcome, WhoCards } from '@/features/inbox/detail';
import type { InboxDetailProps } from '@/features/plugin-types';
import { stampLabel } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { ActionBar, Banner, Button, ConfirmSheet, EmptyState, ErrorState, NavHeader, Screen, SkeletonList, SummaryCard } from '@/ui';

export function BookingDoneDetail({ id }: InboxDetailProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const me = useMe();
  const today = useTodayIst();
  const types = useProfTypes();
  const allowed = canBook(access);
  const { b, loading, error, refetch } = useBookingById(id);
  const outcome = useOutcome();
  const [confirm, setConfirm] = useState(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/inbox'));

  const done = useMutation({
    mutationFn: (x: BookingRecord) => approveCompletion(x, me!),
    onSuccess: (_r, x) => {
      noteDecision(`bkdone:${x.id}`, me?.id, 'approve');
      refreshBookings(qc);
      setConfirm(false);
      outcome.show({
        decision: 'approve',
        title: 'Work approved',
        subtitle: `The booking is complete. Rate ${x.resource ? `${x.resource}’s` : 'their'} work next from the Inbox.`,
        rows: [outcomeStatus('approve', { approve: 'Completed' }), { key: 'when', label: 'Booking', value: whenLine(x, today) }],
      });
    },
    onError: (e) => {
      setConfirm(false);
      refreshBookings(qc);
      if (e instanceof StepError) Alert.alert('Partly done', `${e.done}\n\n${e.message}`, [{ text: 'OK', onPress: leave }]);
      else explainDecisionError(e, leave);
    },
  });

  if (!allowed) return <Redirect href="/" />;
  if (!b) {
    return (
      <Screen header={<NavHeader title="Booking work done" />}>
        {loading ? <SkeletonList rows={4} /> : error ? <ErrorState message={error} onRetry={() => void refetch()} /> : <EmptyState title="This booking isn’t here any more" message="Pull to refresh the Inbox." />}
      </Screen>
    );
  }

  const mine = !!me && b.requestedById === me.id && b.status === 'pending_review' && !bookingLooksCancelled(b) && !outcome.done;
  const pro = b.resource || 'The professional';

  return (
    <>
      <Screen
        header={<NavHeader title="Booking work done" />}
        onRefresh={() => refetch()}
        footer={
          mine ? (
            <ActionBar note="Check the work first. This completes the booking.">
              <Button title="Approve & complete" icon={<CircleCheckBig />} onPress={() => setConfirm(true)} loading={done.isPending} />
            </ActionBar>
          ) : undefined
        }>
        <BookingHero b={b} today={today} types={types} label="Work marked done" />
        <WhoCards from={{ title: b.resource || '—', subtitle: 'Marked it done', avatar: { name: b.resource || '' } }} to={{ title: 'You', subtitle: 'Approve it', avatar: { name: me?.name || 'You' } }} />
        {b.markedDoneAt || b.markedDoneBy ? (
          <Banner tone="info" icon={CircleCheckBig} title={`Marked done by ${b.markedDoneBy || pro}`} message={b.markedDoneAt ? stampLabel(b.markedDoneAt, today) : undefined} />
        ) : null}
        <DetailsCard status={statusOf(b)} fields={bookingFields(b)} />
      </Screen>

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Approve the work?"
        from={{ title: 'You', subtitle: 'Approve', avatar: { name: me?.name || 'You' } }}
        to={{ title: b.resource || '—', subtitle: 'Did the work', avatar: { name: b.resource || '' } }}
        detailsTitle="Booking"
        confirmLabel="Swipe to approve"
        onConfirm={() => done.mutate(b)}
        loading={done.isPending}
        note={`${pro} gets an email and WhatsApp that the work is approved.`}>
        <SummaryCard
          rows={[
            { key: 'when', label: 'When', value: whenLine(b, today) },
            { key: 'time', label: 'Booked time', value: timeRange(b) },
            { key: 'code', label: 'Project code', value: b.kekaCode || b.project || null },
          ]}
        />
      </ConfirmSheet>

      <DecidedSheet outcome={outcome.done} visible={outcome.open} onDone={leave} />
    </>
  );
}
