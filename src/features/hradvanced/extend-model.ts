// Extend shoot time (dash.html:22948 extendBooking on ManagerHome): PUT /bookings/:id {endTime}.
// The website takes no slot lock and checks nothing, so a longer window can silently overlap the
// professional's next booking. The app adds a double-booking check (PLAN §4 "only allow it after
// checking the professional's later bookings"), run on fresh data just before saving:
//   - the new end must be after the current end, and inside the category's bookable day (profDayEnd);
//   - it must not run into another live booking of the same professional that day, counting the
//     category's gap (buffer after a booking, dash.html:3460);
//   - it must not cover time someone else is holding right now (GET /holds);
// and the extra time is then claimed with POST /holds while the save runs, so the server itself
// refuses (409) if anyone else got there first. The hold is released straight after.

import type { BookingRecord, BookUser, Hold } from '@/api/booking';
import type { ProfType } from '@/api/me';
import { bookingDay, bookingLooksCancelled, effEnd, profTypesOf, toMin } from '@/features/booking/model';
import { isMyReport } from '@/features/hradvanced/access';
import { hmLabel } from '@/lib/dates';

/** Statuses that own their time (booking/model LIVE, plus in_progress). */
const LIVE = ['approved', 'in_progress', 'pending'];

export type TeamShoot = { booking: BookingRecord; person: BookUser };

/** todayDopBks (dash.html:22873): today's approved professional bookings of my reports. */
export function teamShootsToday(list: BookingRecord[], users: BookUser[], meName: string, today: string): TeamShoot[] {
  const team = users.filter((u) => isMyReport(u, meName));
  const out: TeamShoot[] = [];
  for (const b of list) {
    if (b.type !== 'professionals' || b.status !== 'approved' || bookingDay(b) !== today) continue;
    const person = team.find((u) => u.name === b.resource);
    if (person) out.push({ booking: b, person });
  }
  return out.sort((a, b) => String(a.booking.startTime || '').localeCompare(String(b.booking.startTime || '')));
}

export function dayWindow(types: ProfType[], typeId: string | undefined) {
  const t = profTypesOf(types).find((x) => x.id === typeId);
  return { start: toMin(t?.dayStart || '07:00') ?? 420, end: toMin(t?.dayEnd || '22:00') ?? 1320, gap: Math.max(0, Math.min(480, Number(t?.gapMinutes) || 0)) };
}

/** The professional's other live bookings that day (not this one). */
export function otherBookings(list: BookingRecord[], b: BookingRecord) {
  return list.filter(
    (x) =>
      x.id !== b.id &&
      x.type === 'professionals' &&
      (x.resourceId ? x.resourceId === b.resourceId : x.resource === b.resource) &&
      bookingDay(x) === bookingDay(b) &&
      LIVE.includes(String(x.status || '')) &&
      !bookingLooksCancelled(x),
  );
}

/** The latest end this booking can reach: the next booking's start minus the gap, or the day's end. */
export function latestEnd(list: BookingRecord[], b: BookingRecord, types: ProfType[]) {
  const win = dayWindow(types, b.profType);
  const cur = toMin(effEnd(b)) ?? 0;
  let limit = win.end;
  let next: BookingRecord | null = null;
  for (const x of otherBookings(list, b)) {
    const s = toMin(x.startTime);
    if (s === null || s < cur) continue;
    if (s - win.gap < limit) {
      limit = s - win.gap;
      next = x;
    }
  }
  return { limit, next, gap: win.gap, dayEnd: win.end };
}

/** Why `newEnd` can't be used (plain words), or '' when it is clear. */
export function extendError(o: { list: BookingRecord[]; booking: BookingRecord; newEnd: number; types: ProfType[]; holds: Hold[]; meId?: string }) {
  const { list, booking: b, newEnd, types } = o;
  // Finished early (POST /bookings/:id/release-remaining sets actualEndTime and frees the tail): a new
  // endTime would not move the effective end, so the save would look done and change nothing.
  if (b.actualEndTime) return `This shoot was marked finished early at ${hmLabel(b.actualEndTime)}. Book a new slot instead.`;
  const cur = toMin(effEnd(b));
  if (cur === null) return 'This booking has no end time to extend.';
  if (newEnd <= cur) return 'Pick a time after the current end.';
  const win = dayWindow(types, b.profType);
  if (newEnd > win.end) return `Bookings for this category end by ${hmLabel(minHm(win.end))}.`;
  for (const x of otherBookings(list, b)) {
    const s = toMin(x.startTime);
    const e = toMin(effEnd(x));
    if (s === null || e === null) continue;
    // A booking still running after the current end must stay clear of [cur, newEnd) plus the gap.
    if (e > cur && newEnd + win.gap > s) {
      const who = x.requestedBy ? ` for ${x.requestedBy}` : '';
      return `${b.resource || 'They'} ${x.status === 'pending' ? 'has a request waiting' : 'is booked'}${who} from ${hmLabel(x.startTime)} to ${hmLabel(effEnd(x))}${win.gap ? ` (with a ${win.gap}-minute gap)` : ''}. That would double-book them.`;
    }
  }
  const held = o.holds.find((h) => h.userId !== o.meId && h.slotIndex * 5 < newEnd && (h.slotIndex + 1) * 5 > cur);
  if (held) return `${held.userName || 'Someone'} is booking ${b.resource || 'them'} at ${hmLabel(minHm(held.slotIndex * 5))} right now. Try again in a few minutes.`;
  return '';
}

export const minHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
