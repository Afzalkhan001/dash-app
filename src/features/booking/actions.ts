// The booking writes, in the website's order. Several are two or more requests that can half-fail
// (PLAN §5): each runs its steps in sequence and, when a later step fails, says what already happened
// (StepError) instead of pretending nothing did.

import type { QueryClient } from '@tanstack/react-query';

import {
  type BookingRecord,
  type BookingReview,
  deleteLocSlot,
  deleteRoomSlot,
  deleteTask,
  fetchLocSlots,
  fetchRoomSlots,
  fetchTasksOf,
  postTaskStrict,
  putBookingStrict,
  putTaskStrict,
} from '@/api/booking';
import { bookingDurationSecs, completionTask } from '@/features/booking/model';

export type Me = { id: string; name: string };

/** A later step failed after an earlier one went through. `done` says what went through. */
export class StepError extends Error {
  done: string;
  constructor(done: string, cause: unknown) {
    super(cause instanceof Error && cause.message ? cause.message : 'Please try again.');
    this.done = done;
  }
}

/** Everything a booking change can touch: the feed, history, My tasks' bookings and the tasks lists. */
export function refreshBookings(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['inbox', 'booking'] });
  void qc.invalidateQueries({ queryKey: ['booking'] });
  void qc.invalidateQueries({ queryKey: ['tasks-bookings'] });
  void qc.invalidateQueries({ queryKey: ['tasks-mine'] });
}

/** dash.html:24190 approveBk. The server emails and WhatsApps both sides and creates the professional's task. */
export async function approveBooking(b: BookingRecord, me: Me) {
  await putBookingStrict(b.id, { status: 'approved', approvedBy: me.name, approvedAt: new Date().toISOString() });
}

/**
 * dash.html:24197 rejectBk, then DELETE /tasks/:id for every task made for it. `rejectionReason` repeats
 * the reason so the server's WhatsApp carries it (it reads that field; the web only sends `reason`).
 */
export async function rejectBooking(b: BookingRecord, reason: string, me: Me) {
  await putBookingStrict(b.id, { status: 'rejected', reason, rejectionReason: reason, rejectedBy: me.name });
  let removed = 0;
  try {
    const linked = await fetchTasksOf(b.id);
    for (const t of linked) {
      await deleteTask(t.id);
      removed += 1;
    }
  } catch (e) {
    throw new StepError(
      removed ? `The booking is rejected and ${removed} of its tasks were removed.` : 'The booking is rejected, but its task couldn’t be removed.',
      e,
    );
  }
  return { removed };
}

/** The task step shared by approveCompletion and submitReview (dash.html:27495–27512, :27566–27583). */
async function completeLinkedTask(b: BookingRecord, me: Me) {
  const now = new Date().toISOString();
  const linked = (await fetchTasksOf(b.id))[0];
  if (linked) {
    if (['completed', 'reviewed'].includes(String(linked.status || ''))) return;
    await putTaskStrict(linked.id, {
      status: 'completed',
      approvedBy: me.name,
      approvedAt: now,
      ...(!linked.elapsedSeconds ? { elapsedSeconds: bookingDurationSecs(String(linked.startTime || ''), String(linked.endTime || '')) } : {}),
    });
    return;
  }
  await postTaskStrict(completionTask(b, me.name, now, `atk${Date.now()}`));
}

/** dash.html:27491 approveCompletion: the booking is completed, then its task is completed (or made). */
export async function approveCompletion(b: BookingRecord, me: Me) {
  await putBookingStrict(b.id, { status: 'completed', completedBy: me.name, completedAt: new Date().toISOString() });
  try {
    await completeLinkedTask(b, me);
  } catch (e) {
    throw new StepError('The booking is complete, but its task wasn’t updated.', e);
  }
}

/** dash.html:27558 submitReview: the rating goes into the booking, then the same task step. */
export async function rateBooking(b: BookingRecord, r: { rating: number; likelihood: number; comments: string }, me: Me) {
  const review: BookingReview = { reviewerId: me.id, reviewerName: me.name, rating: r.rating, likelihood: r.likelihood, comments: r.comments, date: new Date().toISOString() };
  await putBookingStrict(b.id, { reviews: [...(Array.isArray(b.reviews) ? b.reviews : []), review], status: 'reviewed' });
  try {
    await completeLinkedTask(b, me);
  } catch (e) {
    throw new StepError('Your rating is saved, but the booking’s task wasn’t updated.', e);
  }
}

/**
 * dash.html:27306 cancelMyBooking: the booking becomes rejected ("Cancelled by requester"; the server
 * frees its locks), then a room's or location's slot row is deleted. Only the row made for this
 * booking (matched on bookingId) — the web's loose fallback match is a self-heal and is not ported.
 */
export async function cancelBooking(b: BookingRecord) {
  await putBookingStrict(b.id, { status: 'rejected', reason: 'Cancelled by requester' });
  try {
    if (b.type === 'rooms') {
      const row = (await fetchRoomSlots()).find((s) => s.bookingId === b.id);
      if (row) await deleteRoomSlot(row.id);
    } else if (b.type === 'locations') {
      const row = (await fetchLocSlots()).find((s) => s.bookingId === b.id);
      if (row) await deleteLocSlot(row.id);
    }
  } catch (e) {
    throw new StepError('The booking is cancelled, but its time slot wasn’t cleared. It frees up on its own.', e);
  }
}
