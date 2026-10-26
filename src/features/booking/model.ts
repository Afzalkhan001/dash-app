// Booking rules, ported line for line from dash.html (cited per function). Pure: no hooks, no clock —
// "today" and "now" (IST) are always passed in, so screens stay pure under the React Compiler.

import type { ProfType } from '@/api/me';
import type { BookDept, BookingRecord, BookUser, Hold, LocTimeBooking, RoomPurpose, RoomSlotBooking } from '@/api/booking';
import { hmLabel } from '@/lib/dates';
import { addDaysYmd } from '@/lib/ist';
import type { StatusTone } from '@/theme/tokens';

// ── Basics ───────────────────────────────────────────────────────────────────
/** dash.html:27304 — a booking whose reason says "cancel" is treated as cancelled everywhere. */
export const bookingLooksCancelled = (b: Pick<BookingRecord, 'reason'>) => /cancel/i.test(String(b.reason || ''));

/** The booking's day (dash.html:1751 bookingDateKey). */
export const bookingDay = (b: Pick<BookingRecord, 'date' | 'dates'>) => String(b.date || (Array.isArray(b.dates) ? b.dates[0] : '') || '');

const desc = (a: string, b: string) => (a === b ? 0 : a < b ? 1 : -1);
const dateKey = (b: BookingRecord) => `${bookingDay(b)}|${b.startTime || ''}|${b.createdAt || ''}`;
/** dash.html:1755 sortBookingsNewestFirst. */
export const sortBookingsNewestFirst = (a: BookingRecord, b: BookingRecord) => desc(dateKey(a), dateKey(b)) || desc(String(a.id || ''), String(b.id || ''));

/** "HH:MM" → minutes, or null. */
export function toMin(t?: string | null): number | null {
  if (!t || typeof t !== 'string') return null;
  const [h, m] = t.split(':').map(Number);
  if (h == null || Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m as number) ? 0 : (m ?? 0));
}
export const minToHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Room slot index (30 minutes each) → "HH:MM" (dash.html BookingMatrix slotToTime). */
export const slotToTime = (s: number) => `${String(Math.floor(s / 2)).padStart(2, '0')}:${s % 2 === 0 ? '00' : '30'}`;

/** A booking's start and end as "HH:MM" (rooms keep slots, not times). */
export function bookingTimes(b: BookingRecord): { start: string; end: string } | null {
  if (b.startTime && b.endTime) return { start: b.startTime, end: b.endTime };
  if (typeof b.startSlot === 'number' && typeof b.endSlot === 'number') return { start: slotToTime(b.startSlot), end: slotToTime(b.endSlot) };
  return null;
}

/** dash.html:1734 bookingDurationSecs — the booked length, never negative. */
export function bookingDurationSecs(start?: string, end?: string) {
  const s = toMin(start);
  const e = toMin(end);
  if (s == null || e == null) return 0;
  return e - s > 0 ? (e - s) * 60 : 0;
}

/** dash.html:24161 hasTimeOverlap. */
export const hasTimeOverlap = (s1?: string, e1?: string, s2?: string, e2?: string) => (toMin(s1) ?? -1) < (toMin(e2) ?? -1) && (toMin(e1) ?? -1) > (toMin(s2) ?? -1);

export const isMine = (b: BookingRecord, me: { id?: string; name?: string } | null | undefined) =>
  !!me && ((!!me.id && b.requestedById === me.id) || (!!me.name && b.requestedBy === me.name));

// ── Professional types (dash.html:1703 PROF_TYPE_DEFAULTS, :1711–1722) ───────
export const PROF_TYPE_DEFAULTS: ProfType[] = [
  { id: 'cinematographer', label: 'Cinematographer', dayStart: '07:00', dayEnd: '22:00', gapMinutes: 60, active: true },
  { id: 'editor', label: 'Editor', dayStart: '07:00', dayEnd: '22:00', gapMinutes: 0, active: true },
  { id: 'graphic_designer', label: 'Graphic Designer', dayStart: '07:00', dayEnd: '22:00', gapMinutes: 0, active: true },
];
export const CINEMATOGRAPHER = 'cinematographer';

export const profTypesOf = (tenantTypes?: ProfType[] | null) => (Array.isArray(tenantTypes) && tenantTypes.length ? tenantTypes : PROF_TYPE_DEFAULTS);
export const activeProfTypes = (types: ProfType[]) => types.filter((t) => t.active !== false);
export const profTypeLabel = (types: ProfType[], id?: string | null) => types.find((t) => t.id === id)?.label || id || 'Professional';
export function profGapMinutes(types: ProfType[], id?: string | null) {
  const t = types.find((x) => x.id === id);
  return t && t.gapMinutes != null ? Number(t.gapMinutes) || 0 : 0;
}

// ── Labels and status ────────────────────────────────────────────────────────
export function typeLabel(b: BookingRecord, types: ProfType[]) {
  if (b.type === 'professionals') return b.profType ? profTypeLabel(types, b.profType) : 'Professional';
  if (b.type === 'rooms') return 'Conference room';
  return 'Shooting location';
}

/** Needs the requester: approving work marked done, or rating a finished booking (dash.html:27170). */
export const needsReview = (b: BookingRecord) => b.status === 'pending_review' || (b.status === 'completed' && !(Array.isArray(b.reviews) && b.reviews.length));

/** One status, in plain words (docs/DESIGN.md §0B: Waiting / Approved / Rejected / Cancelled). */
export function statusOf(b: BookingRecord): { label: string; tone: StatusTone } {
  const s = b.status || '';
  if (s === 'rejected' || s === 'cancelled' || (s === 'approved' && bookingLooksCancelled(b)))
    return bookingLooksCancelled(b) || s === 'cancelled' ? { label: 'Cancelled', tone: 'neutral' } : { label: 'Rejected', tone: 'failed' };
  if (s === 'pending') return { label: 'Waiting', tone: 'pending' };
  if (s === 'approved') return { label: 'Approved', tone: 'done' };
  if (s === 'in_progress') return { label: 'In progress', tone: 'info' };
  if (s === 'pending_review') return { label: 'Marked done', tone: 'info' };
  if (s === 'completed') return needsReview(b) ? { label: 'To rate', tone: 'info' } : { label: 'Completed', tone: 'neutral' };
  if (s === 'reviewed') return { label: 'Completed', tone: 'neutral' };
  return { label: s ? s.replace(/_/g, ' ') : '—', tone: 'neutral' };
}

/** Pending or approved bookings can be cancelled by their requester (dash.html:27322 canCancel). */
export const canCancel = (b: BookingRecord) => b.status === 'pending' || b.status === 'approved';

/** dash.html:27326 — upcoming = from today and not finished; everything else is history. */
export function splitMine(list: BookingRecord[], today: string) {
  const done = ['completed', 'reviewed', 'rejected'];
  const sorted = [...list].sort(sortBookingsNewestFirst);
  return {
    upcoming: sorted.filter((b) => bookingDay(b) >= today && !done.includes(b.status || '')),
    past: sorted.filter((b) => bookingDay(b) < today || done.includes(b.status || '')),
  };
}

/** dash.html:27305 incomingRequests — a professional's own bookings, pending or approved, from today. */
export function incomingFor(list: BookingRecord[], meId: string | undefined, today: string) {
  if (!meId) return [];
  return list
    .filter((b) => b.resourceId === meId && b.type === 'professionals' && ['pending', 'approved'].includes(b.status || '') && bookingDay(b) >= today)
    .sort((a, b) => bookingDay(a).localeCompare(bookingDay(b)) || String(a.startTime || '').localeCompare(String(b.startTime || '')));
}

/** dash.html:27484–27488 — what waits on the requester. */
export function requesterQueues(list: BookingRecord[], meId: string | undefined) {
  const pro = list.filter((b) => b.type === 'professionals' && !bookingLooksCancelled(b) && !!meId && b.requestedById === meId);
  return {
    approve: pro.filter((b) => b.status === 'pending_review').sort(sortBookingsNewestFirst),
    rate: pro.filter((b) => b.status === 'completed' && !(Array.isArray(b.reviews) && b.reviews.length)).sort(sortBookingsNewestFirst),
  };
}

// ── Approvers' scope (dash.html:24104–24158 RequestsView) ────────────────────
export const STAFF_ROLES = ['employee', 'professional'];
export const STAFF_MGR_ROLES = ['employee', 'professional', 'manager'];

/** dash.html:1758 resolveDeptIds. */
export function resolveDeptIds(deptVal: string | null | undefined, depts: BookDept[]) {
  if (!deptVal) return [];
  const byId = depts.find((d) => d.id === deptVal);
  if (byId) return [byId.id];
  const byName = depts.find((d) => d.name.toLowerCase() === String(deptVal).toLowerCase());
  return byName ? [byName.id] : [];
}
/** dash.html:1759 userInDepts. */
export function userInDepts(u: Pick<BookUser, 'dept'>, deptIds: string[], depts: BookDept[]) {
  if (!deptIds.length) return false;
  return deptIds.some((id) => {
    if (u.dept === id) return true;
    const d = depts.find((x) => x.id === id);
    return !!d && u.dept.toLowerCase() === d.name.toLowerCase();
  });
}

export type ScopeMe = { id: string; name: string; role: string; dept?: string | null };

/** Whose professional bookings this approver sees (myProfNames, dash.html:24113). */
export function profScope(me: ScopeMe, users: BookUser[], depts: BookDept[]): Set<string> {
  const isAdmin = ['admin', 'super_admin', 'ceo', 'coo', 'app_manager'].includes(me.role);
  const owned = me.role === 'admin' || me.role === 'app_manager' ? depts.filter((d) => d.adminId === me.id).map((d) => d.id) : [];
  const deptIds = owned.length ? owned : resolveDeptIds(me.dept, depts);
  const people = isAdmin
    ? users.filter((u) => STAFF_MGR_ROLES.includes(u.role) && userInDepts(u, deptIds, depts))
    : users.filter((u) => STAFF_MGR_ROLES.includes(u.role) && (u.reportingManager === me.name || u.additionalManager === me.name));
  return new Set(people.map((u) => u.name));
}

const isLocApprover = (b: BookingRecord, me: ScopeMe) =>
  (!!b.locationApproverId && !!me.id && b.locationApproverId === me.id) || (!!b.locationApproverName && b.locationApproverName === me.name);

export type RequestBuckets = {
  pending: BookingRecord[];
  approved: BookingRecord[];
  rejected: BookingRecord[];
  done: BookingRecord[];
  awaiting: BookingRecord[];
};

/** The requests tracker's buckets (dash.html:24117–24151), newest first. */
export function requestBuckets(list: BookingRecord[], me: ScopeMe, profNames: Set<string>): RequestBuckets {
  const prof = list.filter((b) => b.type === 'professionals' && profNames.has(String(b.resource || '')));
  const loc = list.filter((b) => b.type === 'locations' && isLocApprover(b, me));
  const both = [...prof, ...loc];
  const s = sortBookingsNewestFirst;
  return {
    pending: both.filter((b) => b.status === 'pending' && !bookingLooksCancelled(b)).sort(s),
    approved: both.filter((b) => b.status === 'approved' && !bookingLooksCancelled(b)).sort(s),
    rejected: both.filter((b) => b.status === 'rejected' || (b.status === 'approved' && bookingLooksCancelled(b))).sort(s),
    done: prof.filter((b) => ['completed', 'reviewed'].includes(b.status || '')).sort(s),
    awaiting: prof.filter((b) => b.status === 'pending_review').sort(s),
  };
}

export type AwaitPeriod = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'date';
/** dash.html:24135 completedProfBks — the "awaiting submission" period filter (IST days). */
export function inPeriod(b: BookingRecord, period: AwaitPeriod, today: string, picked?: string) {
  const d = bookingDay(b);
  if (period === 'date') return !!picked && d === picked;
  if (period === 'today') return d === today;
  if (period === 'yesterday') return d === addDaysYmd(today, -1);
  if (period === 'this_week') return d >= addDaysYmd(today, -7);
  return d >= `${today.slice(0, 7)}-01`;
}

// ── A professional's day (dash.html:27424–27470) ─────────────────────────────
const LIVE = ['approved', 'in_progress', 'pending'];
export const effEnd = (b: BookingRecord) => b.actualEndTime || b.endTime;

export function proBookingsOn(list: BookingRecord[], uid: string, date: string, statuses = LIVE) {
  return list.filter((b) => b.type === 'professionals' && b.resourceId === uid && b.date === date && !bookingLooksCancelled(b) && statuses.includes(b.status || ''));
}

/** dash.html:27437 profHasFreeSlots — a gap of at least 2 hours between 07:00 and 22:00. */
export function profHasFreeSlots(list: BookingRecord[], uid: string, date: string, gap: number) {
  const bks = proBookingsOn(list, uid, date);
  if (!bks.length) return true;
  const MIN = 120;
  const DS = 7 * 60;
  const DE = 22 * 60;
  const nn = (x: number | null): x is number => x !== null;
  const times = [
    DS,
    ...bks.flatMap((b) => [toMin(b.startTime), toMin(effEnd(b))]).filter(nn),
    ...bks.flatMap((b) => [toMin(b.startTime) !== null ? toMin(b.startTime)! - gap : null, toMin(effEnd(b)) !== null ? toMin(effEnd(b))! + gap : null]).filter(nn),
    DE,
  ]
    .filter((x) => x >= DS && x <= DE)
    .sort((a, b) => a - b);
  for (let i = 0; i < times.length - 1; i++) {
    const s = times[i]!;
    const e = times[i + 1]!;
    if (e - s < MIN) continue;
    const mid = (s + e) / 2;
    const blocked = bks.some((b) => {
      const bs = toMin(b.startTime);
      const be = toMin(effEnd(b));
      return bs !== null && be !== null && mid >= bs - gap && mid < be + gap;
    });
    if (!blocked) return true;
  }
  return false;
}

/** dash.html:27447 getRating — the first review of each reviewed booking, averaged. */
export function ratingOf(list: BookingRecord[], uid: string): { avg: number; count: number } | null {
  const bks = list.filter((b) => b.resourceId === uid && Array.isArray(b.reviews) && b.reviews.length);
  if (!bks.length) return null;
  const total = bks.reduce((s, b) => s + (Number(b.reviews?.[0]?.rating) || 0), 0);
  return { avg: Math.round((total / bks.length) * 10) / 10, count: bks.length };
}

export type ProSearch = { city: string; type: string; date: string; meId?: string };

/** dash.html:27448 availProfsBase — bookable, matching, not away, not me, with a free stretch; best rated first. */
export function availablePros(users: BookUser[], list: BookingRecord[], rated: BookingRecord[], q: ProSearch, types: ProfType[]) {
  const city = q.city.trim().toLowerCase();
  return users
    .filter(
      (u) =>
        u.professionalAvailable &&
        !!u.professionalType &&
        (!city || u.location.toLowerCase() === city) &&
        (!q.type || u.professionalType === q.type) &&
        !u.leaveDates.includes(q.date) &&
        u.id !== q.meId &&
        profHasFreeSlots(list, u.id, q.date, profGapMinutes(types, u.professionalType)),
    )
    .sort((a, b) => {
      const va = ratingOf(rated, a.id)?.avg ?? -1;
      const vb = ratingOf(rated, b.id)?.avg ?? -1;
      if (vb !== va) return vb - va;
      return a.name.localeCompare(b.name);
    });
}

/** Cities on anyone's record (dash.html:27417). */
export const citiesOf = (users: BookUser[]) => [...new Set(users.map((u) => u.location).filter(Boolean))].sort();

/** Specialisations held by someone in the results (dash.html:27466). */
export function specsOf(pros: BookUser[]) {
  const seen = new Map<string, string>();
  for (const u of pros) for (const s of u.specializations) if (!seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Holds as readable ranges: 5-minute slot rows → [startMin, endMin) (dash.html:27519). */
export function holdRanges(holds: Hold[], slotMinutes = 5) {
  const m = new Map<string, { name: string; min: number; max: number }>();
  for (const h of holds) {
    const e = m.get(h.holdId) ?? { name: h.userName || 'Someone', min: h.slotIndex, max: h.slotIndex };
    e.min = Math.min(e.min, h.slotIndex);
    e.max = Math.max(e.max, h.slotIndex);
    m.set(h.holdId, e);
  }
  return [...m.values()].map((e) => ({ name: e.name, startMin: e.min * slotMinutes, endMin: (e.max + 1) * slotMinutes }));
}

/** The time checks of the professional form (dash.html:27605 timeErr), in order. */
export function proTimeError(o: {
  list: BookingRecord[];
  uid: string;
  date: string;
  start: string;
  end: string;
  /** Minutes past midnight now, IST, when the date is today; otherwise null. */
  nowMin: number | null;
  held: { name: string; startMin: number; endMin: number }[];
}) {
  if (!o.start || !o.end) return '';
  const s = toMin(o.start)!;
  const e = toMin(o.end)!;
  if (e <= s) return 'End time must be after start time.';
  if (s < 7 * 60 || e > 22 * 60) return 'Bookings are only available between 7:00 AM and 10:00 PM.';
  if (o.nowMin !== null && s <= o.nowMin) return 'Start time must be later than the time now.';
  const overlap = proBookingsOn(o.list, o.uid, o.date).some((b) => {
    const bs = toMin(b.startTime);
    const be = toMin(effEnd(b));
    return bs !== null && be !== null && s < be && e > bs;
  });
  if (overlap) return 'This overlaps another booking for this professional.';
  const h = o.held.find((x) => s < x.endMin && e > x.startMin);
  if (h) return `${h.name} is booking ${hmLabel(minToHm(h.startMin))} – ${hmLabel(minToHm(h.endMin))} right now. Pick another time or try again in a few minutes.`;
  return '';
}

/** dash.html:27482 gapWarningFor — within an hour of a neighbouring booking (a warning only). */
export function proGapWarning(list: BookingRecord[], uid: string, date: string, start: string, end: string) {
  const s = toMin(start);
  const e = toMin(end);
  if (s === null || e === null) return false;
  return proBookingsOn(list, uid, date).some((b) => {
    const bs = toMin(b.startTime);
    const be = toMin(effEnd(b));
    if (bs === null || be === null) return false;
    return (s >= be && s - be < 60) || (bs >= e && bs - e < 60);
  });
}

/** The professional's approvers, who get the request (server.js:898 getProfessionalApprovers). */
export const approversOf = (pro: Pick<BookUser, 'reportingManager' | 'additionalManager'> | null | undefined) =>
  pro ? [pro.reportingManager, pro.additionalManager].filter((n, i, a) => !!n && a.indexOf(n) === i) : [];

// ── Slot rows of cancelled bookings (dash.html:27305 BookingMatrix load) ─────
// A rejected or cancelled booking keeps its room or location slot row (an approver's reject never
// deletes it), so the website drops those rows when it reads them. Read-only: nothing is written.
const isDead = (b: BookingRecord) => b.status === 'rejected' || b.status === 'cancelled';
const hmToMinLoose = (t?: string) => toMin(t) ?? -1;

export function liveRoomSlots(rows: RoomSlotBooking[], bookings: BookingRecord[]) {
  const dead = bookings.filter((b) => isDead(b) && b.type === 'rooms');
  const deadIds = new Set(dead.map((b) => b.id));
  return rows.filter(
    (s) => !(s.bookingId && deadIds.has(s.bookingId)) && !dead.some((b) => b.requestedBy === s.bookedBy && (b.dates || [])[0] === s.date && b.startSlot === s.startSlot),
  );
}

export function liveLocSlots(rows: LocTimeBooking[], bookings: BookingRecord[]) {
  const deadIds = new Set(bookings.filter(isDead).map((b) => b.id));
  const dead = bookings.filter((b) => isDead(b) && b.type === 'locations');
  return rows.filter(
    (s) => !(s.bookingId && deadIds.has(s.bookingId)) && !dead.some((b) => b.requestedBy === s.bookedBy && (b.dates || [])[0] === s.date && hmToMinLoose(b.startTime) === s.startMin),
  );
}

// ── Rooms (dash.html:27955–28020) ────────────────────────────────────────────
export const ROOM_SLOTS = 48;
export type SlotSel = { start: number; end: number } | null;

export function roomSlotState(o: { roomId: string; date: string; slots: RoomSlotBooking[]; holds: Hold[] }) {
  const booked = o.slots.filter((b) => b.roomId === o.roomId && b.date === o.date);
  const held = new Map(o.holds.map((h) => [h.slotIndex, h]));
  return {
    /** The day's bookings for this room, earliest first (the "Booked on this day" list). */
    booked: [...booked].sort((a, b) => a.startSlot - b.startSlot),
    bookingAt: (s: number) => booked.find((b) => s >= b.startSlot && s < b.endSlot) ?? null,
    heldAt: (s: number) => held.get(s) ?? null,
    taken: (s: number) => booked.some((b) => s >= b.startSlot && s < b.endSlot) || held.has(s),
  };
}

/** dash.html:28001 isPastSlot — only today, by the IST clock. */
export const isPastSlot = (s: number, date: string, today: string, nowMin: number) => date === today && Math.floor(s / 2) * 60 + (s % 2 === 0 ? 0 : 30) <= nowMin;

/** dash.html:28002 handleSlotClick — tap to start, tap again to grow, shrink or restart a range. */
export function nextSelection(sel: SlotSel, s: number, taken: (s: number) => boolean): SlotSel {
  const anyTaken = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i).some(taken);
  if (!sel) return { start: s, end: s + 1 };
  const { start, end } = sel;
  if (s === start && end === s + 1) return null;
  if (s >= end) return anyTaken(end, s - end + 1) ? { start: s, end: s + 1 } : { start, end: s + 1 };
  if (s < start) return anyTaken(s, start - s) ? { start: s, end: s + 1 } : { start: s, end };
  if (s === start) return s + 1 >= end ? null : { start: s + 1, end };
  if (s === end - 1) return { start, end: s };
  return { start: s, end: s + 1 };
}

/** What a purpose still needs before booking (dash.html:28101). */
export function purposeMissing(p: RoomPurpose | null | undefined, clientName: string, requirements: string) {
  if (p?.requiresClient && !clientName.trim()) return 'Client name';
  if (p?.requiresRequirements && !requirements.trim()) return 'Special requirements';
  return '';
}

// ── Locations (dash.html:28174–28235) ────────────────────────────────────────
/** 06:00 to 23:30 in 30-minute steps (dash.html:28178). */
export const LOC_TIMES: string[] = Array.from({ length: 36 }, (_, i) => minToHm(6 * 60 + i * 30));

export const cityOfLocation = (l: { city?: string; address?: string }) => l.city || (String(l.address || '').split(',').pop() || '').trim();

/** dash.html:28181 checkOverlap — a 30-minute gap either side of every confirmed window. */
export function locConflict(rows: LocTimeBooking[], locId: string, date: string, sm: number, em: number) {
  return rows.filter((b) => b.locationId === locId && b.date === date).find((b) => sm < b.endMin + 30 && em > b.startMin - 30) ?? null;
}

/** dash.html:28220 handleSubmit — the location checks in order. */
export function locTimeError(o: { rows: LocTimeBooking[]; locId: string; date: string; start: string; end: string; held: { name: string; startMin: number; endMin: number }[] }) {
  if (!o.start || !o.end) return '';
  const sm = toMin(o.start)!;
  const em = toMin(o.end)!;
  if (em <= sm) return 'End time must be after start time.';
  if (em - sm < 30) return 'A booking is at least 30 minutes.';
  const c = locConflict(o.rows, o.locId, o.date, sm, em);
  if (c) return `Clashes with a booking from ${hmLabel(minToHm(c.startMin))} to ${hmLabel(minToHm(c.endMin))}. Leave a 30-minute gap.`;
  const h = o.held.find((x) => sm < x.endMin && em + 30 > x.startMin);
  if (h) return `${h.name} is booking an overlapping time right now. Pick a different window or try again in a few minutes.`;
  return '';
}

// ── The requester's completion (dash.html:27491 approveCompletion, :27558 submitReview) ──
/** The completed task the web posts when a booking has none (dash.html:27509). */
export function completionTask(b: BookingRecord, meName: string, nowIso: string, id: string) {
  const time = b.startTime && b.endTime ? ` (${b.startTime}–${b.endTime})` : '';
  const code = b.kekaCode || b.project || '';
  return {
    id,
    title: `Assigned: ${b.requestedBy || meName} — ${code || 'Booking'}${time}`,
    assignee: b.resource || '',
    assigneeId: b.resourceId || '',
    project: code,
    kekaCode: code,
    status: 'completed',
    dept: b.profDept || null,
    bookingId: b.id,
    bookingDate: b.date || '',
    startTime: b.startTime || '',
    endTime: b.endTime || '',
    requestedBy: b.requestedBy || '',
    shootingLocation: b.shootingLocation || '',
    source: 'booking',
    approvedBy: meName,
    approvedAt: nowIso,
    elapsedSeconds: bookingDurationSecs(b.startTime, b.endTime),
    timestamps: {},
  };
}

// ── Pending reviews monitor (dash.html:25978–26070) ──────────────────────────
export type ReviewItem = BookingRecord & { kind: 'approval' | 'rating' };
export type ReviewGroup = { key: string; name: string; sub: string; phone: string; items: ReviewItem[] };

/** dash.html:776 toE164Phone. */
export function toE164(raw?: string | null) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
}

export function pendingReviewItems(list: BookingRecord[], users: BookUser[] | null): ReviewItem[] {
  const byId = new Map((users ?? []).map((u) => [u.id, u]));
  const resigned = (b: BookingRecord) => {
    const u = b.requestedById ? byId.get(b.requestedById) : null;
    if (u) return u.resigned;
    return !!users && !!b.requestedById;
  };
  return list
    .filter((b) => b.type === 'professionals' && !bookingLooksCancelled(b) && !resigned(b) && needsReview(b))
    .map((b) => ({ ...b, kind: b.status === 'pending_review' ? ('approval' as const) : ('rating' as const) }));
}

export function reviewGroups(items: ReviewItem[], by: 'pro' | 'emp', users: BookUser[], types: ProfType[]): ReviewGroup[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  const groups = new Map<string, ReviewGroup>();
  for (const b of items) {
    const key = by === 'pro' ? b.resourceId || b.resource || '—' : b.requestedById || b.requestedBy || '—';
    let g = groups.get(key);
    if (!g) {
      const phone = by === 'emp' ? toE164(b.requestedById ? byId.get(b.requestedById)?.phone : '') : '';
      g =
        by === 'pro'
          ? { key, name: b.resource || 'Unknown', sub: b.profType ? profTypeLabel(types, b.profType) : 'Professional', phone, items: [] }
          : { key, name: b.requestedBy || 'Unknown', sub: 'Owes reviews', phone, items: [] };
      groups.set(key, g);
    }
    g.items.push(b);
  }
  return [...groups.values()].sort((a, b) => b.items.length - a.items.length);
}

/** When the review started waiting (dash.html:26158). */
export const waitingSince = (b: BookingRecord) => b.completedAt || b.markedDoneAt || '';

/** Whole days since `iso` (dash.html:26045 daysSince); null when there is no date. */
export function daysWaiting(iso: string, now: number) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}
export const waitingLabel = (d: number | null) => (d === null ? '—' : d <= 0 ? 'today' : d === 1 ? '1 day' : `${d} days`);

/** The website's reminder texts (dash.html:26137, :26164). */
export const remindEmployeeText = (name: string, count: number, pros: string[]) =>
  `Hi ${name}, this is a reminder that you have ${count} pending review(s) across ${pros.length} professional(s) (${pros.join(', ')}). Could you take a look when you get a chance?`;
export const remindAboutProText = (name: string, proName: string, count: number) =>
  `Hi ${name}, this is a reminder that ${proName} has ${count} pending review(s) waiting on your booking(s). Could you take a look when you get a chance?`;
export const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(text)}`;
