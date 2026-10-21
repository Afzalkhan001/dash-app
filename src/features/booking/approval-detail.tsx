// Inbox › Bookings › one request (web: RequestsView BkDetail, dash.html:24356; approveBk :24190,
// rejectBk :24197). Opened from the Inbox (decide it) or the requests tracker (read it).
//   Approve  ConfirmSheet → "Swipe to approve". The server emails and WhatsApps the professional and
//            the requester with each other's contacts and adds the work to the professional's tasks
//            (location bookings: the requester is told).
//   Reject   reason (required) → ConfirmSheet "This rejects the booking and deletes its task" → swipe.
//            PUT {status:'rejected', reason, rejectionReason, rejectedBy}, then DELETE /tasks/:id for
//            every task made for it. It can't be reopened (the server refuses with 409).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert } from 'react-native';

import { type BookingRecord, useBookingDepartments, useBookingUsers } from '@/api/booking';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeBookingRequests } from '@/features/booking/access';
import { approveBooking, refreshBookings, rejectBooking, StepError } from '@/features/booking/actions';
import { BookingHero, bookingFields, ProDayCard, useBookingById } from '@/features/booking/detail-parts';
import { bookingLooksCancelled, profScope, statusOf, typeLabel } from '@/features/booking/model';
import { BOOKING_MODULE, NotifyLine, timeRange, typeIcon, useMe, useProfTypes, whenLine } from '@/features/booking/ui';
import { noteDecision } from '@/features/inbox/decided';
import { DecidedSheet, DecisionNote, DetailsCard, explainDecisionError, outcomeStatus, RejectSheet, requesterItem, useOutcome, WhoCards } from '@/features/inbox/detail';
import type { InboxDetailProps } from '@/features/plugin-types';
import { dateLabel } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { ActionBar, ActionRow, Button, ConfirmSheet, EmptyState, ErrorState, NavHeader, Screen, SkeletonList, SummaryCard } from '@/ui';

const AFTER_SHEET_MS = 400;

export function BookingApprovalDetail({ id }: InboxDetailProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const me = useMe();
  const today = useTodayIst();
  const types = useProfTypes();
  const allowed = canSeeBookingRequests(access);
  const { b, list, loading, error, refetch } = useBookingById(id);
  const users = useBookingUsers(allowed);
  const depts = useBookingDepartments(allowed);
  const outcome = useOutcome();
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/inbox'));

  const approve = useMutation({
    mutationFn: (x: BookingRecord) => approveBooking(x, me!),
    onSuccess: (_r, x) => {
      noteDecision(`booking:${x.id}`, me?.id, 'approve');
      refreshBookings(qc);
      setConfirm(null);
      outcome.show({
        decision: 'approve',
        title: 'Booking approved',
        subtitle: x.type === 'professionals' ? `${x.resource || 'They'} and ${x.requestedBy || 'the requester'} are told, and it's in ${x.resource ? `${x.resource}’s` : 'their'} tasks.` : `${x.requestedBy || 'The requester'} is told.`,
        rows: [outcomeStatus('approve'), { key: 'when', label: 'When', value: whenLine(x, today) }],
      });
    },
    onError: (e) => {
      setConfirm(null);
      explainDecisionError(e, leave);
    },
  });
  const reject = useMutation({
    mutationFn: (x: BookingRecord) => rejectBooking(x, reason.trim(), me!),
    onSuccess: (r, x) => {
      noteDecision(`booking:${x.id}`, me?.id, 'reject');
      refreshBookings(qc);
      setConfirm(null);
      outcome.show(
        {
          decision: 'reject',
          title: 'Booking rejected',
          subtitle: `${x.requestedBy || 'The requester'} gets your reason by email and WhatsApp.`,
          rows: [outcomeStatus('reject'), { key: 'reason', label: 'Reason', value: reason.trim() }, ...(r.removed ? [{ key: 'tasks', label: 'Tasks removed', value: String(r.removed) }] : [])],
        },
        true,
      );
    },
    onError: (e) => {
      setConfirm(null);
      refreshBookings(qc);
      if (e instanceof StepError) Alert.alert('Partly done', `${e.done}\n\n${e.message}`, [{ text: 'OK', onPress: leave }]);
      else explainDecisionError(e, leave);
    },
  });

  if (!allowed) return <Redirect href="/" />;

  if (!b) {
    return (
      <Screen header={<NavHeader title="Booking request" />}>
        {loading ? (
          <SkeletonList rows={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void refetch()} />
        ) : (
          <EmptyState title="This booking isn’t here any more" message="It may have been removed. Pull to refresh the Inbox." />
        )}
      </Screen>
    );
  }

  const pro = b.resourceId ? (users.data?.find((u) => u.id === b.resourceId) ?? null) : null;
  const scope = me && users.data && depts.data ? profScope(me, users.data, depts.data) : null;
  const isLoc = b.type === 'locations';
  const inScope = isLoc
    ? !!me && ((!!b.locationApproverId && b.locationApproverId === me.id) || (!!b.locationApproverName && b.locationApproverName === me.name))
    : !!scope && scope.has(String(b.resource || ''));
  const mine = inScope && b.status === 'pending' && !bookingLooksCancelled(b) && !outcome.done;
  const st = statusOf(b);
  const decided = b.status === 'approved' || b.status === 'rejected' ? b.status : null;
  const kind = typeLabel(b, types);
  const approveNote = isLoc
    ? `${b.requestedBy || 'The requester'} gets an email and WhatsApp.`
    : `${b.resource || 'The professional'} and ${b.requestedBy || 'the requester'} get an email and WhatsApp with each other's contacts, and it's added to ${b.resource ? `${b.resource}’s` : 'their'} tasks.`;

  return (
    <>
      <Screen
        header={<NavHeader title={isLoc ? 'Location booking' : 'Booking request'} />}
        onRefresh={() => refetch()}
        footer={
          mine ? (
            <ActionBar>
              <ActionRow context="bar">
                <Button title="Reject" variant="ghost" icon={<X />} onPress={() => setRejecting(true)} disabled={approve.isPending || reject.isPending} />
                <Button title="Approve" icon={<Check />} onPress={() => setConfirm('approve')} loading={approve.isPending} />
              </ActionRow>
            </ActionBar>
          ) : undefined
        }>
        <BookingHero b={b} today={today} types={types} />
        <WhoCards
          from={requesterItem(b.requestedBy || '—', 'Asked')}
          to={
            isLoc
              ? { title: b.resource || 'Location', subtitle: kind, icon: typeIcon(b.type), module: BOOKING_MODULE }
              : { title: b.resource || '—', subtitle: kind, avatar: { name: b.resource || '' } }
          }
        />
        {decided ? (
          <DecisionNote
            status={bookingLooksCancelled(b) ? 'cancelled' : decided}
            by={decided === 'approved' ? b.approvedBy : b.rejectedBy}
            at={decided === 'approved' ? b.approvedAt : undefined}
            note={decided === 'rejected' ? b.reason : undefined}
            today={today}
          />
        ) : null}
        <DetailsCard status={st} fields={bookingFields(b, pro)} />
        <ProDayCard b={b} list={list} today={today} />
      </Screen>

      <RejectSheet
        visible={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject this booking?"
        subtitle={`${b.requestedBy || 'The requester'} sees this reason.`}
        note={reason}
        onChangeNote={setReason}
        minLength={1}
        placeholder="Why it can't go ahead"
        busy={false}
        confirmLabel="Next"
        onSubmit={() => {
          setRejecting(false);
          setTimeout(() => setConfirm('reject'), AFTER_SHEET_MS);
        }}
      />

      <ConfirmSheet
        visible={confirm === 'approve'}
        onClose={() => setConfirm(null)}
        title="Approve this booking?"
        from={{ title: b.requestedBy || '—', subtitle: 'Asked', avatar: { name: b.requestedBy || '' } }}
        to={isLoc ? { title: b.resource || 'Location', subtitle: kind, icon: typeIcon(b.type), module: BOOKING_MODULE } : { title: b.resource || '—', subtitle: kind, avatar: { name: b.resource || '' } }}
        detailsTitle="Booking"
        confirmLabel="Swipe to approve"
        onConfirm={() => approve.mutate(b)}
        loading={approve.isPending}
        note={approveNote}>
        <SummaryCard
          rows={[
            { key: 'day', label: 'Date', value: dateLabel(b.date || b.dates?.[0], today) },
            { key: 'time', label: 'Time', value: timeRange(b) },
            { key: 'code', label: 'Project code', value: b.kekaCode || b.project || null },
          ]}
        />
      </ConfirmSheet>

      <ConfirmSheet
        visible={confirm === 'reject'}
        onClose={() => setConfirm(null)}
        title="Reject the booking?"
        detailsTitle="This can't be undone"
        confirmLabel="Swipe to reject"
        onConfirm={() => reject.mutate(b)}
        loading={reject.isPending}
        note={`${b.requestedBy || 'The requester'} gets an email and WhatsApp with your reason.`}>
        <SummaryCard
          rows={[
            { key: 'what', label: 'Booking', value: `${b.resource || '—'} · ${whenLine(b, today)}` },
            { key: 'reason', label: 'Reason', value: reason.trim() },
          ]}
        />
        <NotifyLine
          text={isLoc ? 'This rejects the booking and frees the time for others.' : 'This rejects the booking, deletes the task made for it and frees the time for others.'}
        />
      </ConfirmSheet>

      <DecidedSheet outcome={outcome.done} visible={outcome.open} onDone={leave} />
    </>
  );
}
