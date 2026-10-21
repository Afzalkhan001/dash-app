// Booking (web: BookingMatrix dash.html:27305, BookProfessional :27370, BookRoom :27955, BookLocation
// :28158, RequestsView :24049, PendingReviewsMonitor :25978). Server: routes/bookings.js,
// routes/slot_bookings.js, server.js holds (:4725–4800), routes/rooms.js, routes/locations.js,
// routes/room_purposes.js. No server route checks a role: the app's gates (features/booking/access)
// are the only guard, ported exactly from the website.
//
//   GET    /bookings[?since=YYYY-MM-DD]       every booking in the company (since filters on dates[0])
//   POST   /bookings                          409 when a professional's time is taken; messages people
//   PUT    /bookings/:id                      merge; approved → task atk_bk_<id>; 409 reopening a rejected one
//   GET    /users  /departments  /tenants      scope, professionals, approvers
//   GET    /rooms  /locations  /room_purposes  (no ?withImages — photos are ~2.8 MB of base64)
//   GET    /room_slot_bookings  /loc_time_bookings ; POST (claims, 409) ; DELETE /:id
//   GET    /holds?resourceType&resourceId&date ; POST /holds (409) ; POST /holds/:id/renew (410) ; DELETE /holds/:id
//   GET    /tasks  (only at the moment of a decision, to find the booking's task) ; PUT/POST /tasks ; DELETE /tasks/:id

import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { Booking, Task } from '@/api/tasks';
import { useSession } from '@/auth/session';
import { addDaysYmd } from '@/lib/ist';
import { todayIst } from '@/lib/dates';

// ── Types (the server's own rows; every field optional, as the table is schemaless JSON) ────────────
export type BookingReview = { reviewerId?: string; reviewerName?: string; rating?: number; likelihood?: number; comments?: string; date?: string };

export type BookingRecord = Booking & {
  requestedById?: string;
  reviews?: BookingReview[];
  reason?: string;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  markedDoneBy?: string;
  markedDoneAt?: string;
  completedBy?: string;
  completedAt?: string;
  actualEndTime?: string;
  profType?: string;
  profDeptName?: string;
  channelName?: string;
  // rooms
  purpose?: string;
  purposeLabel?: string;
  clientName?: string;
  requirements?: string;
  startSlot?: number;
  endSlot?: number;
  // locations
  locationId?: string;
  locationApproverId?: string;
  locationApproverName?: string;
};

/** GET /users, cut down to what booking reads (no photos, no bank, no salary). */
export type BookUser = {
  id: string;
  name: string;
  role: string;
  dept: string;
  departmentId?: string | null;
  reportingManager: string;
  additionalManager: string;
  professionalAvailable: boolean;
  professionalType: string;
  location: string;
  leaveDates: string[];
  specializations: string[];
  skills: string[];
  workLinks: string[];
  designation: string;
  employeeNumber: string;
  phone: string;
  resigned: boolean;
};

export type BookDept = { id: string; name: string; adminId: string };

export type Room = { id: string; name?: string; floor?: string; capacity?: number | string; status?: string; amenities?: string[] | string; imageCount?: number };
export type Location = {
  id: string;
  name?: string;
  city?: string;
  address?: string;
  status?: string;
  approvalRequired?: boolean;
  approverId?: string;
  approverName?: string;
  contact?: string;
  phone?: string;
  email?: string;
  description?: string;
};
export type RoomPurpose = { id: string; label: string; active?: boolean; requiresClient?: boolean; requiresRequirements?: boolean; notice?: string; sortOrder?: number };
export type RoomSlotBooking = { id: string; roomId: string; date: string; startSlot: number; endSlot: number; bookedBy?: string; bookedById?: string; purpose?: string; bookingId?: string };
export type LocTimeBooking = { id: string; locationId: string; date: string; startMin: number; endMin: number; bookedBy?: string; bookedById?: string; project?: string; bookingId?: string };
export type Hold = { holdId: string; resourceType: string; resourceId: string; date: string; slotIndex: number; userId?: string; userName?: string; expiresAt?: string };
export type HoldResource = 'room' | 'loc' | 'pro';

// The five purposes the website falls back to when IT Admin has none (dash.html:897, server.js:3186).
export const FALLBACK_PURPOSES: RoomPurpose[] = [
  { id: 'business_meeting', label: 'Business Meeting', active: true },
  { id: 'client_meeting', label: 'Client Meeting', active: true, requiresClient: true, requiresRequirements: true },
  {
    id: 'shooting',
    label: 'Shooting',
    active: true,
    notice: 'If any employee needs this conference room at the same time for a business purpose, your booking may be cancelled by the IT Admin without any prior notice.',
  },
  { id: 'training', label: 'Training', active: true },
  { id: 'team_standup', label: 'Team Standup', active: true },
];

// ── Keys ─────────────────────────────────────────────────────────────────────
// The feed sits under ['inbox', 'booking', …] so the Inbox's one-minute poll and pull to refresh
// cover it; the three Inbox kinds (booking, bkdone, bkrate) and the hub all read the same entry.
export const bookingKeys = {
  feed: (userId?: string) => ['inbox', 'booking', userId ?? '', 'feed'] as const,
  all: (userId?: string) => ['booking', 'all', userId ?? ''] as const,
  users: (userId?: string) => ['booking', 'users', userId ?? ''] as const,
  depts: (userId?: string) => ['booking', 'departments', userId ?? ''] as const,
  rooms: ['booking', 'rooms'] as const,
  locations: ['booking', 'locations'] as const,
  purposes: ['booking', 'purposes'] as const,
  roomSlots: ['booking', 'room-slots'] as const,
  locSlots: ['booking', 'loc-slots'] as const,
  holds: (type: HoldResource, id: string, date: string) => ['booking', 'holds', type, id, date] as const,
};

/** How far back the feed reads (IST). Pending professional bookings are at most 7 days ahead. */
export const FEED_DAYS = 60;

const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x.filter((r) => !!r && typeof r === 'object') as T[]) : []);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const strList = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : []);

export async function fetchBookings(since?: string, signal?: AbortSignal) {
  const q = since ? `?since=${encodeURIComponent(since)}` : '';
  return arr<BookingRecord>(await unwrap(api.get<BookingRecord[]>(`/bookings${q}`, signal))).filter((b) => typeof b.id === 'string');
}

/** Bookings from FEED_DAYS ago onward (future ones included). */
export function useBookingFeed(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: bookingKeys.feed(userId),
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => fetchBookings(addDaysYmd(todayIst(), -FEED_DAYS), signal),
    staleTime: 30_000,
    meta: { persist: false },
  });
}

/** The whole table: only the history screens read it (the requests tracker, booking history). */
export function useAllBookings(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: bookingKeys.all(userId),
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => fetchBookings(undefined, signal),
    staleTime: 60_000,
    meta: { persist: false },
  });
}

function slimUser(u: Record<string, unknown>): BookUser {
  return {
    id: str(u.id),
    name: str(u.name),
    role: str(u.role) || 'employee',
    dept: str(u.dept),
    departmentId: typeof u.departmentId === 'string' ? u.departmentId : null,
    reportingManager: str(u.reportingManager),
    additionalManager: str(u.additionalManager),
    professionalAvailable: !!u.professionalAvailable,
    professionalType: str(u.professionalType),
    location: str(u.location || u.city).trim(),
    leaveDates: strList(u.leaveDates),
    specializations: strList(u.specializations),
    skills: strList(u.skills),
    workLinks: strList(u.workLinks),
    designation: str(u.designation || u.jobTitle),
    employeeNumber: str(u.employeeNumber || u.kekaCode),
    phone: str(u.phone || u.mobile),
    resigned: !!u.resigned,
  };
}

export function useBookingUsers(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: bookingKeys.users(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => arr<Record<string, unknown>>(await unwrap(api.get('/users', signal))).filter((u) => typeof u.id === 'string').map(slimUser),
    staleTime: 5 * 60_000,
    meta: { persist: false },
  });
}

export function useBookingDepartments(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: bookingKeys.depts(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) =>
      arr<Record<string, unknown>>(await unwrap(api.get('/departments', signal)))
        .filter((d) => d.id != null)
        .map((d): BookDept => ({ id: str(d.id), name: str(d.name), adminId: str(d.adminId) })),
    staleTime: 30 * 60_000,
  });
}

const isActive = (r: { status?: string }) => r.status === 'active' || !r.status;

export function useRooms(enabled = true) {
  return useQuery({
    queryKey: bookingKeys.rooms,
    enabled,
    queryFn: async ({ signal }) => arr<Room>(await unwrap(api.get('/rooms', signal))).filter(isActive),
    staleTime: 10 * 60_000,
  });
}

export function useLocations(enabled = true) {
  return useQuery({
    queryKey: bookingKeys.locations,
    enabled,
    queryFn: async ({ signal }) => arr<Location>(await unwrap(api.get('/locations', signal))).filter(isActive),
    staleTime: 10 * 60_000,
  });
}

/** Active purposes; the website's five when IT Admin has set none (or the list fails). */
export function useRoomPurposes(enabled = true) {
  return useQuery({
    queryKey: bookingKeys.purposes,
    enabled,
    queryFn: async ({ signal }) => {
      const r = arr<RoomPurpose>(await api.get('/room_purposes', signal));
      const list = r.length ? r : FALLBACK_PURPOSES;
      return [...list].filter((p) => p.active !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    },
    staleTime: 10 * 60_000,
  });
}

/** Confirmed room slots; refreshed every 10 s while a grid is open (dash.html:27978). */
export function useRoomSlots(enabled = true, poll = false) {
  return useQuery({
    queryKey: bookingKeys.roomSlots,
    enabled,
    queryFn: async ({ signal }) => arr<RoomSlotBooking>(await unwrap(api.get('/room_slot_bookings', signal))),
    refetchInterval: poll ? 10_000 : false,
    staleTime: 5_000,
    meta: { persist: false },
  });
}

export function useLocSlots(enabled = true, poll = false) {
  return useQuery({
    queryKey: bookingKeys.locSlots,
    enabled,
    queryFn: async ({ signal }) => arr<LocTimeBooking>(await unwrap(api.get('/loc_time_bookings', signal))),
    refetchInterval: poll ? 10_000 : false,
    staleTime: 5_000,
    meta: { persist: false },
  });
}

/** Other people's live holds on one resource and day (polled every 10 s while the form is open). */
export function useHolds(type: HoldResource, resourceId: string, date: string, enabled: boolean) {
  return useQuery({
    queryKey: bookingKeys.holds(type, resourceId, date),
    enabled: enabled && !!resourceId && !!date,
    queryFn: async ({ signal }) =>
      arr<Hold>(
        await unwrap(
          api.get(`/holds?resourceType=${encodeURIComponent(type)}&resourceId=${encodeURIComponent(resourceId)}&date=${encodeURIComponent(date)}`, signal),
        ),
      ),
    refetchInterval: enabled ? 10_000 : false,
    staleTime: 0,
    meta: { persist: false },
  });
}

// ── Writes (no hooks; the screens wrap them in mutations) ────────────────────
const enc = encodeURIComponent;
export const postBooking = (b: Record<string, unknown>) => unwrap(api.post<{ ok: true; booking?: BookingRecord }>('/bookings', b));
export const putBookingStrict = (id: string, body: Record<string, unknown>) => unwrap(api.put<{ ok: true }>(`/bookings/${enc(id)}`, body));
export const postRoomSlot = (row: Record<string, unknown>) => unwrap(api.post<{ ok: true }>('/room_slot_bookings', row));
export const deleteRoomSlot = (id: string) => unwrap(api.del<{ ok: true }>(`/room_slot_bookings/${enc(id)}`));
export const postLocSlot = (row: Record<string, unknown>) => unwrap(api.post<{ ok: true }>('/loc_time_bookings', row));
export const deleteLocSlot = (id: string) => unwrap(api.del<{ ok: true }>(`/loc_time_bookings/${enc(id)}`));
export const fetchRoomSlots = async () => arr<RoomSlotBooking>(await unwrap(api.get('/room_slot_bookings')));
export const fetchLocSlots = async () => arr<LocTimeBooking>(await unwrap(api.get('/loc_time_bookings')));

export const postHold = (body: Record<string, unknown>) => unwrap(api.post<{ ok: true; holdId: string; expiresAt: string; ttlSec?: number }>('/holds', body));
export const renewHold = (holdId: string) => unwrap(api.post<{ ok: true; expiresAt: string }>(`/holds/${enc(holdId)}/renew`, {}));
export const releaseHold = (holdId: string) => api.del(`/holds/${enc(holdId)}`);

/** The whole task table, read only at the moment a decision needs a booking's task (as the web does). */
export async function fetchTasksOf(bookingId: string) {
  const all = arr<Task>(await unwrap(api.get<Task[]>('/tasks')));
  return all.filter((t) => t.bookingId === bookingId);
}
export const deleteTask = (id: string) => unwrap(api.del<{ ok: true }>(`/tasks/${enc(id)}`));
export const putTaskStrict = (id: string, body: Record<string, unknown>) => unwrap(api.put<{ ok: true }>(`/tasks/${enc(id)}`, body));
export const postTaskStrict = (body: Record<string, unknown>) => unwrap(api.post<{ ok: true; task?: Task }>('/tasks', body));
