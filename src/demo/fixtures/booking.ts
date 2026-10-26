// Demo API for the booking domain. Shapes and refusals follow the real handlers:
//   routes/bookings.js        GET /bookings[?since] · POST /bookings (7-day window, cinematographer's
//                             shooting location, 409 when the professional's time is taken) ·
//                             PUT /bookings/:id (409 reopening a rejected one; approved → task atk_bk_<id>)
//   routes/slot_bookings.js   GET/POST/DELETE /room_slot_bookings and /loc_time_bookings (409 on a clash;
//                             a location keeps 30 minutes free after every booking)
//   server.js :4725–4800      GET/POST /holds, POST /holds/:id/renew (410 lapsed), DELETE /holds/:id
//   routes/rooms.js, locations.js, room_purposes.js (no purposes configured → the website's five)
//   routes/tasks.js           DELETE /tasks/:id (rejecting a booking deletes its task)
// Bookings live in tasks.ts's bookingStore (My tasks reads the same rows). Rows carry `onlyFor`: the
// demo person's own requests belong to the personas that can book (Afzal Admin gets its own, since the
// first one names a Production professional it would approve). The demo person's id and name are shown
// as the persona's by demo/server.ts. Two "someone else is booking" holds never lapse, so the room grid
// and the professional form always show one.

import type { Hold, LocTimeBooking, Location, Room, RoomSlotBooking } from '@/api/booking';
import { FALLBACK_PURPOSES } from '@/api/booking-purposes';
import { DEMO_USER } from '@/demo/config';
import { personById } from '@/demo/fixtures/org';
import { bookingStore, createTask, type DemoBooking, removeTask, taskStore } from '@/demo/fixtures/tasks';
import { currentPersona, selfAs, type StaffPersonaId } from '@/demo/personas';
import { addDays, daysAgo, fail, hm, istIso, minutesAgo, notFound, nowIso, today, workingDayFrom, type Route } from '@/demo/state';

const ME = String(DEMO_USER.name);
const MY_ID = DEMO_USER.id;
const T0 = today();
const ahead = (n: number) => workingDayFrom(T0, -n); // n working days from today
const back = (n: number) => workingDayFrom(T0, n); // n working days ago

type Row = DemoBooking & { onlyFor?: StaffPersonaId[] };
const BOOKERS: StaffPersonaId[] = ['employee', 'professional', 'manager', 'hr', 'accounts', 'super_admin', 'app_manager', 'admin'];
const NOT_ADMIN = BOOKERS.filter((p) => p !== 'admin');

const pro = (r: Partial<Row> & { id: string }): Row =>
  ({ type: 'professionals', reason: '', reviews: [], dates: r.date ? [r.date] : [], createdAt: daysAgo(2, '11:20'), ...r }) as Row;

// ── Seeds ────────────────────────────────────────────────────────────────────
const SEEDS: Row[] = [
  // The demo person's own requests.
  pro({
    id: 'bkf-my-farhan',
    onlyFor: NOT_ADMIN,
    status: 'pending',
    resource: 'Farhan Ali',
    resourceId: 'u-farhan',
    profType: 'cinematographer',
    profDept: 'Production',
    profDeptName: 'Production',
    requestedBy: ME,
    requestedById: MY_ID,
    date: ahead(2),
    startTime: '10:00',
    endTime: '14:00',
    project: 'Kisan Agro — Product Launch Film',
    kekaCode: 'TM_KAG_LAUNCH',
    channelName: 'Kisan Agro',
    shootingLocation: 'Necklace Road, Hyderabad',
    comments: 'B-roll of the tractor demo; bring the gimbal.',
    createdAt: daysAgo(0, '09:40'),
  }),
  pro({
    id: 'bkf-my-sanjay-adm',
    onlyFor: ['admin'],
    status: 'pending',
    resource: 'Sanjay Kumar',
    resourceId: 'u-sanjay',
    profType: 'editor',
    profDept: 'Creative',
    profDeptName: 'Creative',
    requestedBy: ME,
    requestedById: MY_ID,
    date: ahead(4),
    startTime: '10:00',
    endTime: '14:00',
    project: 'Kisan Agro — Product Launch Film',
    kekaCode: 'TM_KAG_LAUNCH',
    comments: 'First assembly from the launch shoot.',
    createdAt: daysAgo(0, '09:40'),
  }),
  {
    id: 'bkf-my-room',
    onlyFor: BOOKERS,
    type: 'rooms',
    status: 'approved',
    resource: 'Board Room',
    requestedBy: ME,
    requestedById: MY_ID,
    dates: [addDays(T0, 1)],
    purpose: 'business_meeting',
    purposeLabel: 'Business Meeting',
    startSlot: 22,
    endSlot: 24,
    reason: '',
    createdAt: daysAgo(1, '16:05'),
  } as Row,
  pro({
    id: 'bkf-my-done',
    onlyFor: BOOKERS,
    status: 'pending_review',
    resource: 'Sanjay Kumar',
    resourceId: 'u-sanjay',
    profType: 'editor',
    profDept: 'Creative',
    requestedBy: ME,
    requestedById: MY_ID,
    date: back(2),
    startTime: '10:00',
    endTime: '13:00',
    project: 'Sunrise Jewellers — Diwali Brand Film',
    kekaCode: 'TM_SJW_DIWALI26',
    comments: 'Cut-downs for Instagram.',
    approvedBy: 'Priya Sharma',
    approvedAt: daysAgo(4, '12:00'),
    markedDoneBy: 'Sanjay Kumar',
    markedDoneAt: istIso(back(2), '12:58'),
    createdAt: daysAgo(5, '10:15'),
  }),
  pro({
    id: 'bkf-my-rate',
    onlyFor: BOOKERS,
    status: 'completed',
    resource: 'Sneha Iyer',
    resourceId: 'u-sneha',
    profType: 'graphic_designer',
    profDept: 'Creative',
    requestedBy: ME,
    requestedById: MY_ID,
    date: back(6),
    startTime: '14:00',
    endTime: '17:00',
    project: 'Nimbus Fintech — Explainer Series',
    kekaCode: 'TM_NIM_EXPL',
    approvedBy: 'Priya Sharma',
    markedDoneBy: 'Sneha Iyer',
    markedDoneAt: istIso(back(6), '17:02'),
    completedBy: ME,
    completedAt: istIso(back(5), '10:30'),
    createdAt: daysAgo(9, '15:00'),
  }),
  {
    id: 'bkf-my-old-room',
    onlyFor: BOOKERS,
    type: 'rooms',
    status: 'rejected',
    reason: 'Cancelled by requester',
    resource: 'Studio A',
    requestedBy: ME,
    requestedById: MY_ID,
    dates: [back(8)],
    purpose: 'training',
    purposeLabel: 'Training',
    startSlot: 28,
    endSlot: 32,
    createdAt: daysAgo(12, '09:00'),
  } as Row,
  {
    id: 'bkf-my-old-loc',
    onlyFor: BOOKERS,
    type: 'locations',
    status: 'approved',
    reason: '',
    resource: 'Gachibowli Studio — Floor 2',
    locationId: 'loc-gachi',
    requestedBy: ME,
    requestedById: MY_ID,
    date: back(10),
    dates: [back(10)],
    startTime: '09:00',
    endTime: '13:00',
    project: 'Aarogya Hospitals — Brand Campaign',
    kekaCode: 'TM_AAR_BRAND26',
    channelName: 'Aarogya Health',
    createdAt: daysAgo(15, '11:00'),
  } as Row,
  pro({
    id: 'bkf-my-reviewed',
    onlyFor: BOOKERS,
    status: 'reviewed',
    resource: 'Sanjay Kumar',
    resourceId: 'u-sanjay',
    profType: 'editor',
    requestedBy: ME,
    requestedById: MY_ID,
    date: back(12),
    startTime: '11:00',
    endTime: '15:00',
    project: 'Kathalu S2 — Web Series',
    kekaCode: 'TM_KTH_S2',
    completedBy: ME,
    completedAt: istIso(back(11), '10:00'),
    reviews: [{ reviewerId: MY_ID, reviewerName: ME, rating: 5, likelihood: 5, comments: 'Fast and careful with the notes.', date: istIso(back(11), '10:05') }],
    createdAt: daysAgo(16, '10:00'),
  }),
  // Afzal Professional: a request waiting on their manager (resourceId = the demo person).
  pro({
    id: 'bkf-pro-in',
    onlyFor: ['professional'],
    status: 'pending',
    resource: ME,
    resourceId: MY_ID,
    // Afzal Professional is a freelance cinematographer (demo/personas.ts).
    profType: 'cinematographer',
    profDept: 'Production',
    requestedBy: 'Vikram Singh',
    requestedById: 'u-vikram',
    date: ahead(1),
    startTime: '11:00',
    endTime: '15:00',
    project: 'Aarogya Hospitals — Brand Campaign',
    kekaCode: 'TM_AAR_BRAND26',
    comments: 'Doctors’ Day follow-up shoot.',
    createdAt: daysAgo(0, '08:50'),
  }),

  // The Creative floor's bookings (Afzal Manager approves them; Sanjay and Sneha report to him).
  pro({
    id: 'bkf-cr-1',
    status: 'pending',
    resource: 'Sanjay Kumar',
    resourceId: 'u-sanjay',
    profType: 'editor',
    profDept: 'Creative',
    profDeptName: 'Creative',
    requestedBy: 'Meera Nair',
    requestedById: 'u-meera',
    date: ahead(2),
    startTime: '10:00',
    endTime: '13:00',
    project: 'Aarogya Hospitals — Brand Campaign',
    kekaCode: 'TM_AAR_BRAND26',
    channelName: 'Aarogya Health',
    comments: 'Three 30-second patient stories from the shoot.',
    createdAt: minutesAgo(95),
  }),
  pro({
    id: 'bkf-cr-2',
    status: 'approved',
    resource: 'Sanjay Kumar',
    resourceId: 'u-sanjay',
    profType: 'editor',
    profDept: 'Creative',
    requestedBy: 'Vikram Singh',
    requestedById: 'u-vikram',
    date: ahead(3),
    startTime: '12:00',
    endTime: '15:00',
    project: 'Sunrise Jewellers — Diwali Brand Film',
    kekaCode: 'TM_SJW_DIWALI26',
    approvedBy: 'Priya Sharma',
    approvedAt: daysAgo(1, '18:10'),
    createdAt: daysAgo(2, '12:30'),
  }),
  pro({
    id: 'bkf-cr-3',
    status: 'pending',
    resource: 'Sanjay Kumar',
    resourceId: 'u-sanjay',
    profType: 'editor',
    profDept: 'Creative',
    requestedBy: 'Zoya Khan',
    requestedById: 'u-zoya',
    date: ahead(3),
    startTime: '14:00',
    endTime: '16:00',
    project: 'Nimbus Fintech — Explainer Series',
    kekaCode: 'TM_NIM_EXPL',
    comments: 'Reels for the launch week. Overlaps an approved booking — check before approving.',
    createdAt: minutesAgo(40),
  }),
  pro({
    id: 'bkf-cr-4',
    status: 'pending',
    resource: 'Sneha Iyer',
    resourceId: 'u-sneha',
    profType: 'graphic_designer',
    profDept: 'Creative',
    requestedBy: 'Deepa Menon',
    requestedById: 'u-deepa',
    date: ahead(2),
    startTime: '14:00',
    endTime: '17:00',
    project: 'Kathalu S2 — Web Series',
    kekaCode: 'TM_KTH_S2',
    channelName: 'Kathalu',
    comments: 'End-card and lower thirds for episode 3.',
    createdAt: daysAgo(0, '10:05'),
  }),
  pro({
    id: 'bkf-cr-5',
    status: 'rejected',
    reason: 'Clashes with the Kathalu S2 delivery.',
    rejectedBy: 'Priya Sharma',
    resource: 'Sneha Iyer',
    resourceId: 'u-sneha',
    profType: 'graphic_designer',
    profDept: 'Creative',
    requestedBy: 'Imran Shaikh',
    requestedById: 'u-imran',
    date: back(1),
    startTime: '10:00',
    endTime: '12:00',
    project: 'Kisan Agro — Product Launch Film',
    kekaCode: 'TM_KAG_LAUNCH',
    createdAt: daysAgo(4, '17:20'),
  }),
  pro({
    id: 'bkf-cr-6',
    status: 'pending_review',
    resource: 'Sanjay Kumar',
    resourceId: 'u-sanjay',
    profType: 'editor',
    profDept: 'Creative',
    requestedBy: 'Imran Shaikh',
    requestedById: 'u-imran',
    date: back(3),
    startTime: '10:00',
    endTime: '14:00',
    project: 'Kisan Agro — Product Launch Film',
    kekaCode: 'TM_KAG_LAUNCH',
    approvedBy: 'Priya Sharma',
    markedDoneBy: 'Sanjay Kumar',
    markedDoneAt: istIso(back(3), '14:05'),
    createdAt: daysAgo(6, '11:00'),
  }),
  pro({
    id: 'bkf-cr-7',
    status: 'pending_review',
    resource: 'Sanjay Kumar',
    resourceId: 'u-sanjay',
    profType: 'editor',
    profDept: 'Creative',
    requestedBy: 'Imran Shaikh',
    requestedById: 'u-imran',
    date: back(7),
    startTime: '15:00',
    endTime: '18:00',
    project: 'Kisan Agro — Product Launch Film',
    kekaCode: 'TM_KAG_LAUNCH',
    approvedBy: 'Priya Sharma',
    markedDoneBy: 'Sanjay Kumar',
    markedDoneAt: istIso(back(7), '18:02'),
    createdAt: daysAgo(10, '11:00'),
  }),
  pro({
    id: 'bkf-cr-8',
    status: 'completed',
    resource: 'Sneha Iyer',
    resourceId: 'u-sneha',
    profType: 'graphic_designer',
    profDept: 'Creative',
    requestedBy: 'Vikram Singh',
    requestedById: 'u-vikram',
    date: back(4),
    startTime: '11:00',
    endTime: '13:00',
    project: 'Nimbus Fintech — Explainer Series',
    kekaCode: 'TM_NIM_EXPL',
    markedDoneBy: 'Sneha Iyer',
    markedDoneAt: istIso(back(4), '13:00'),
    completedBy: 'Vikram Singh',
    completedAt: istIso(back(3), '09:30'),
    createdAt: daysAgo(7, '14:00'),
  }),
  pro({
    id: 'bkf-cr-9',
    status: 'reviewed',
    resource: 'Sneha Iyer',
    resourceId: 'u-sneha',
    profType: 'graphic_designer',
    profDept: 'Creative',
    requestedBy: 'Meera Nair',
    requestedById: 'u-meera',
    date: back(9),
    startTime: '10:00',
    endTime: '12:00',
    project: 'Aarogya Hospitals — Brand Campaign',
    kekaCode: 'TM_AAR_BRAND26',
    completedBy: 'Meera Nair',
    completedAt: istIso(back(8), '10:00'),
    reviews: [{ reviewerId: 'u-meera', reviewerName: 'Meera Nair', rating: 4, likelihood: 5, comments: 'Lovely title cards, one round of fixes.', date: istIso(back(8), '10:02') }],
    createdAt: daysAgo(13, '10:00'),
  }),
  // Production (Afzal Admin runs it): Farhan, a cinematographer, with a shooting location.
  pro({
    id: 'bkf-pr-1',
    status: 'pending',
    resource: 'Farhan Ali',
    resourceId: 'u-farhan',
    profType: 'cinematographer',
    profDept: 'Production',
    profDeptName: 'Production',
    requestedBy: 'Priya Sharma',
    requestedById: 'u-priya',
    date: ahead(1),
    startTime: '09:00',
    endTime: '13:00',
    project: 'Sunrise Jewellers — Diwali Brand Film',
    kekaCode: 'TM_SJW_DIWALI26',
    shootingLocation: 'Gachibowli Studio, Floor 2',
    channelName: 'Sunrise Jewellers',
    comments: 'Product macro shots on the turntable.',
    createdAt: minutesAgo(150),
  }),
  // A location booking waiting on the demo person, named as its approver when it was made (new
  // bookings of the street set go to Deepa Menon, the location's approver now).
  {
    id: 'bkf-loc-1',
    type: 'locations',
    status: 'pending',
    reason: '',
    resource: 'Ramoji Film City — Street set',
    locationId: 'loc-ramoji',
    requestedBy: 'Vikram Singh',
    requestedById: 'u-vikram',
    date: ahead(2),
    dates: [ahead(2)],
    startTime: '07:00',
    endTime: '11:00',
    project: 'Kathalu S2 — Web Series',
    kekaCode: 'TM_KTH_S2',
    channelName: 'Kathalu',
    locationApproverId: MY_ID,
    locationApproverName: ME,
    createdAt: minutesAgo(220),
  } as Row,
];
for (const s of SEEDS) if (!bookingStore.some((b) => b.id === s.id)) bookingStore.push(s);

// The task the professional is already working on for the work marked done (completing it fills its time).
if (!taskStore.some((t) => t.bookingId === 'bkf-my-done')) {
  createTask({
    id: 'atk_bk_bkf-my-done',
    title: `Assigned: ${ME} — TM_SJW_DIWALI26 (10:00–13:00)`,
    assignee: 'Sanjay Kumar',
    assigneeId: 'u-sanjay',
    project: 'TM_SJW_DIWALI26',
    kekaCode: 'TM_SJW_DIWALI26',
    status: 'in_progress',
    dept: 'Creative',
    bookingId: 'bkf-my-done',
    bookingDate: back(2),
    startTime: '10:00',
    endTime: '13:00',
    requestedBy: ME,
    source: 'booking',
    elapsedSeconds: 2 * 3600 + 40 * 60,
    createdAt: daysAgo(4, '12:00'),
  });
}

// ── Rooms, locations, purposes ───────────────────────────────────────────────
const ROOMS: Room[] = [
  { id: 'rm-board', name: 'Board Room', floor: '3rd floor', capacity: 12, status: 'active', imageCount: 0 },
  { id: 'rm-edit3', name: 'Edit Suite 3', floor: '2nd floor', capacity: 4, status: 'active', imageCount: 0 },
  { id: 'rm-studioa', name: 'Studio A', floor: 'Ground floor', capacity: 20, status: 'active', imageCount: 0 },
];
const LOCATIONS: Location[] = [
  { id: 'loc-ramoji', name: 'Ramoji Film City — Street set', city: 'Hyderabad', address: 'Abdullapurmet, Hyderabad', status: 'active', approvalRequired: true, approverId: 'u-deepa', approverName: 'Deepa Menon' },
  {
    id: 'loc-gachi',
    name: 'Gachibowli Studio — Floor 2',
    city: 'Hyderabad',
    address: 'Gachibowli, Hyderabad',
    status: 'active',
    approvalRequired: false,
    contact: 'Ravi (studio manager)',
    phone: '+919000177010',
    email: 'studio@tamadamedia.example',
  },
  { id: 'loc-vizag', name: 'RK Beach promenade', city: 'Visakhapatnam', address: 'Beach Road, Visakhapatnam', status: 'active', approvalRequired: false },
];

const ROOM_SLOTS: RoomSlotBooking[] = [
  { id: 'rsb-my-room', roomId: 'rm-board', date: addDays(T0, 1), startSlot: 22, endSlot: 24, bookedBy: ME, bookedById: MY_ID, purpose: 'business_meeting', bookingId: 'bkf-my-room' },
  { id: 'rsb-demo-room', roomId: 'rm-edit3', date: addDays(T0, 1), startSlot: 22, endSlot: 26, bookedBy: 'Rahul Verma', bookedById: 'u-rahul', purpose: 'business_meeting', bookingId: 'bk-demo-room' },
  { id: 'rsb-1', roomId: 'rm-board', date: T0, startSlot: 20, endSlot: 22, bookedBy: 'Priya Sharma', bookedById: 'u-priya', purpose: 'client_meeting' },
  { id: 'rsb-2', roomId: 'rm-board', date: T0, startSlot: 30, endSlot: 33, bookedBy: 'Deepa Menon', bookedById: 'u-deepa', purpose: 'team_standup' },
  { id: 'rsb-3', roomId: 'rm-studioa', date: addDays(T0, 1), startSlot: 18, endSlot: 24, bookedBy: 'Farhan Ali', bookedById: 'u-farhan', purpose: 'shooting' },
];
const LOC_SLOTS: LocTimeBooking[] = [
  { id: 'ltb-loc-1', locationId: 'loc-ramoji', date: ahead(2), startMin: 7 * 60, endMin: 11 * 60, bookedBy: 'Vikram Singh', bookedById: 'u-vikram', project: 'Kathalu S2 — Web Series', bookingId: 'bkf-loc-1' },
  { id: 'ltb-gachi', locationId: 'loc-gachi', date: T0, startMin: 13 * 60, endMin: 17 * 60, bookedBy: 'Deepa Menon', bookedById: 'u-deepa', project: 'Sunrise Jewellers — Diwali Brand Film' },
];

// ── Holds (server.js slot_locks with kind 'hold') ────────────────────────────
type HoldRow = { holdId: string; resourceType: string; resourceId: string; date: string; slotIndex: number; userId: string; userName: string; expiresAt: number };
let HOLDS: HoldRow[] = [];
const TTL = 300_000;
const SLOT_MIN: Record<string, number> = { room: 30, loc: 5, pro: 5 };
const TRAIL: Record<string, number> = { room: 0, loc: 30, pro: 0 };

function slotRange(type: string, startMin: number, endMin: number) {
  const size = SLOT_MIN[type] ?? 5;
  const end = endMin + (TRAIL[type] ?? 0);
  const out: number[] = [];
  for (let s = Math.floor(startMin / size); s <= Math.ceil(end / size) - 1; s++) out.push(s);
  return out;
}
const slotLabel = (type: string, idx: number) => hm(idx * (SLOT_MIN[type] ?? 5));
const toMin = (t?: string) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : NaN);

// Someone else always mid-booking: Studio A tomorrow 15:00–16:00, and Sanjay next working day 15:00–16:00.
function fakeHolds(): HoldRow[] {
  const exp = Date.now() + 4 * 60_000;
  return [
    ...[30, 31].map((slotIndex) => ({ holdId: 'hld-demo-room', resourceType: 'room', resourceId: 'rm-studioa', date: addDays(T0, 1), slotIndex, userId: 'u-rahul', userName: 'Rahul Verma', expiresAt: exp })),
    ...slotRange('pro', 15 * 60, 16 * 60).map((slotIndex) => ({
      holdId: 'hld-demo-pro',
      resourceType: 'pro',
      resourceId: 'u-sanjay',
      date: ahead(1),
      slotIndex,
      userId: 'u-kavya',
      userName: 'Kavya Reddy',
      expiresAt: exp,
    })),
  ];
}
const liveHolds = () => {
  const now = Date.now();
  HOLDS = HOLDS.filter((h) => h.expiresAt > now);
  return [...HOLDS, ...fakeHolds()];
};

const LIVE_PRO = ['pending', 'approved', 'in_progress', 'pending_review'];
// Names inside a sentence aren't swapped by demo/server.ts (only whole values), so say the persona's.
const said = (name: string) => (name === ME ? selfAs().name : name);
const looksCancelled = (b: Row) => /cancel/i.test(String(b.reason || ''));

/** The slots already taken for good on this resource and day (bookings, not holds). */
function bookedSlots(type: string, id: string, date: string): { slot: number; who: string }[] {
  const out: { slot: number; who: string }[] = [];
  if (type === 'room') {
    for (const r of ROOM_SLOTS) if (r.roomId === id && r.date === date) for (let s = r.startSlot; s < r.endSlot; s++) out.push({ slot: s, who: r.bookedBy || 'someone' });
  } else if (type === 'loc') {
    for (const r of LOC_SLOTS) if (r.locationId === id && r.date === date) for (const s of slotRange('loc', r.startMin, r.endMin)) out.push({ slot: s, who: r.bookedBy || 'someone' });
  } else {
    for (const b of bookingStore as Row[]) {
      if (b.type !== 'professionals' || b.resourceId !== id || b.date !== date || !LIVE_PRO.includes(b.status || '') || looksCancelled(b)) continue;
      const end = String(b.actualEndTime || b.endTime || '');
      for (const s of slotRange('pro', toMin(b.startTime), toMin(end))) out.push({ slot: s, who: b.requestedBy || 'someone' });
    }
  }
  return out;
}

/** claimSlots (server.js:4612): null when free, else the refusal. Own holds (and `holdId`) never block. */
function clash(type: string, id: string, date: string, slots: number[], userId: string, holdId?: string) {
  const want = new Set(slots);
  const booked = bookedSlots(type, id, date).find((b) => want.has(b.slot));
  if (booked) return fail(`That time at ${slotLabel(type, booked.slot)} is already booked by ${said(booked.who)}. Please pick a different slot.`, 409);
  const held = liveHolds().find((h) => h.resourceType === type && h.resourceId === id && h.date === date && want.has(h.slotIndex) && h.userId !== userId && h.holdId !== holdId);
  if (held) return fail(`${said(held.userName || 'another user')} is currently booking this time at ${slotLabel(type, held.slotIndex)}. It will free up in a few minutes if they don't confirm.`, 409);
  return null;
}
const dropHold = (holdId?: string) => {
  if (holdId) HOLDS = HOLDS.filter((h) => h.holdId !== holdId);
};

function holdSlots(body: Record<string, unknown>): number[] {
  const type = String(body.resourceType || '');
  if (type === 'room') {
    const a = Number(body.startSlot);
    const b = Number(body.endSlot);
    return Number.isFinite(a) && Number.isFinite(b) && b > a ? Array.from({ length: b - a }, (_, i) => a + i) : [];
  }
  const s = Number.isFinite(Number(body.startMin)) ? Number(body.startMin) : toMin(String(body.startTime || ''));
  const e = Number.isFinite(Number(body.endMin)) ? Number(body.endMin) : toMin(String(body.endTime || ''));
  return Number.isFinite(s) && Number.isFinite(e) && e > s ? slotRange(type, s, e) : [];
}

// ── Bookings ─────────────────────────────────────────────────────────────────
const forPersona = (b: Row) => !b.onlyFor || b.onlyFor.includes(currentPersona().id);
const out = ({ onlyFor: _o, otp: _t, ...b }: Row) => b;
const istPlus = (n: number) => addDays(T0, n);

function purposeError(purpose: unknown, client: unknown, reqs: unknown) {
  const p = FALLBACK_PURPOSES.find((x) => x.id === purpose);
  if (p?.requiresClient && !String(client || '').trim()) return fail(`Client name is required for a ${p.label} booking.`);
  if (p?.requiresRequirements && !String(reqs || '').trim()) return fail(`Special requirements are required for a ${p.label} booking.`);
  return null;
}

export const bookingRoutes: Route[] = [
  [
    'GET',
    /^\/bookings$/,
    (_p, _b, q) => {
      const since = q.get('since') || '';
      const isPro = currentPersona().id === 'professional';
      return (bookingStore as Row[])
        .filter(forPersona)
        .filter((b) => (isPro || b.resourceId !== MY_ID) && (!/^\d{4}-\d{2}-\d{2}$/.test(since) || String(b.dates?.[0] ?? b.date ?? '') >= since))
        .map(out);
    },
  ],
  [
    'POST',
    /^\/bookings$/,
    (_p, body) => {
      const { performedById: _a, holdId, ...rest } = (body || {}) as Record<string, unknown>;
      const b = { id: `bk${Date.now()}`, status: 'pending', reason: '', createdAt: nowIso(), ...rest } as Row;
      if (bookingStore.some((x) => x.id === b.id)) return { ok: true, booking: out(bookingStore.find((x) => x.id === b.id) as Row) };
      if (b.type === 'professionals') {
        const last = istPlus(7);
        const bad = [b.date, ...(b.dates ?? [])].filter(Boolean).find((d) => String(d) > last);
        if (bad) return fail(`Professionals can only be booked up to 7 days ahead, so the last bookable date is ${last}. ${bad} is further out than that.`);
        if (personById(String(b.resourceId || ''))?.professionalType === 'cinematographer' && !String(b.shootingLocation || '').trim())
          return fail('Shooting Location is required for a Cinematographer booking.');
        const s = toMin(b.startTime);
        const e = toMin(b.endTime);
        if (!(e > s)) return fail('End time must be after start time.');
        const c = clash('pro', String(b.resourceId || ''), String(b.date || ''), slotRange('pro', s, e), String(b.requestedById || ''), String(holdId || ''));
        if (c) return c;
        dropHold(String(holdId || ''));
      }
      if (b.type === 'rooms') {
        const pe = purposeError(b.purpose, b.clientName, b.requirements);
        if (pe) return pe;
      }
      bookingStore.push(b);
      return { ok: true, booking: out(b) };
    },
  ],
  [
    'PUT',
    /^\/bookings\/([^/]+)$/,
    ([, id], body) => {
      const b = bookingStore.find((x) => x.id === id) as Row | undefined;
      if (!b) return notFound('Booking not found');
      const { performedById: _p, actorId: _a, ...changes } = (body || {}) as Record<string, unknown>;
      const next = changes.status;
      if (['rejected', 'cancelled'].includes(String(b.status)) && next !== undefined && !['rejected', 'cancelled'].includes(String(next)))
        return fail('This booking was already cancelled and cannot be reopened.', 409);
      Object.assign(b, changes);
      // routes/bookings.js:315 — approving a professional booking creates the professional's task.
      if (next === 'approved' && b.type === 'professionals' && !taskStore.some((t) => t.bookingId === b.id)) {
        const code = String(b.kekaCode || b.project || '');
        createTask({
          id: `atk_bk_${b.id}`,
          title: `Assigned: ${b.requestedBy || ''} — ${code || 'Booking'}${b.startTime && b.endTime ? ` (${b.startTime}–${b.endTime})` : ''}`,
          assignee: b.resource || '',
          assigneeId: b.resourceId || '',
          project: code,
          kekaCode: code,
          status: 'pending',
          dept: typeof b.profDept === 'string' ? b.profDept : null,
          bookingId: b.id,
          bookingDate: b.date || '',
          startTime: b.startTime || '',
          endTime: b.endTime || '',
          requestedBy: b.requestedBy || '',
          creator: b.requestedBy || '',
          shootingLocation: b.shootingLocation || '',
          source: 'booking',
        });
      }
      return { ok: true };
    },
  ],
  ['DELETE', /^\/tasks\/([^/]+)$/, ([, id]) => (removeTask(id!) ? { ok: true } : notFound('Task not found'))],

  ['GET', /^\/rooms$/, () => ROOMS],
  ['GET', /^\/locations$/, () => LOCATIONS],
  ['GET', /^\/room_purposes$/, () => FALLBACK_PURPOSES],

  ['GET', /^\/room_slot_bookings$/, () => ROOM_SLOTS],
  [
    'POST',
    /^\/room_slot_bookings$/,
    (_p, body) => {
      const r = { id: `rsb${Date.now()}`, ...(body || {}) } as RoomSlotBooking & { holdId?: string; clientName?: string; requirements?: string; performedById?: string };
      const pe = purposeError(r.purpose, r.clientName, r.requirements);
      if (pe) return pe;
      const slots = Array.from({ length: Math.max(0, r.endSlot - r.startSlot) }, (_, i) => r.startSlot + i);
      if (!slots.length) return fail('resourceId, date and a time range are required');
      const c = clash('room', r.roomId, r.date, slots, String(r.bookedById || ''), r.holdId);
      if (c) return c;
      dropHold(r.holdId);
      const { holdId: _h, performedById: _pp, ...row } = r;
      ROOM_SLOTS.push(row);
      return { ok: true };
    },
  ],
  [
    'DELETE',
    /^\/room_slot_bookings\/([^/]+)$/,
    ([, id]) => {
      const i = ROOM_SLOTS.findIndex((r) => r.id === id);
      if (i >= 0) ROOM_SLOTS.splice(i, 1);
      return { ok: true };
    },
  ],
  ['GET', /^\/loc_time_bookings$/, () => LOC_SLOTS],
  [
    'POST',
    /^\/loc_time_bookings$/,
    (_p, body) => {
      const r = { id: `ltb${Date.now()}`, ...(body || {}) } as LocTimeBooking & { holdId?: string; performedById?: string };
      if (!(r.endMin > r.startMin)) return fail('resourceId, date and a time range are required');
      const c = clash('loc', r.locationId, r.date, slotRange('loc', r.startMin, r.endMin), String(r.bookedById || ''), r.holdId);
      if (c) return c;
      dropHold(r.holdId);
      const { holdId: _h, performedById: _pp, ...row } = r;
      LOC_SLOTS.push(row);
      return { ok: true };
    },
  ],
  [
    'DELETE',
    /^\/loc_time_bookings\/([^/]+)$/,
    ([, id]) => {
      const i = LOC_SLOTS.findIndex((r) => r.id === id);
      if (i >= 0) LOC_SLOTS.splice(i, 1);
      return { ok: true };
    },
  ],

  [
    'GET',
    /^\/holds$/,
    (_p, _b, q) => {
      const type = q.get('resourceType');
      const id = q.get('resourceId');
      const date = q.get('date');
      return liveHolds()
        .filter((h) => (!type || h.resourceType === type) && (!id || h.resourceId === id) && (!date || h.date === date))
        .map((h): Hold => ({ ...h, expiresAt: new Date(h.expiresAt).toISOString() }));
    },
  ],
  [
    'POST',
    /^\/holds$/,
    (_p, body) => {
      const b = (body || {}) as Record<string, unknown>;
      const type = String(b.resourceType || '');
      const id = String(b.resourceId || '');
      const date = String(b.date || '');
      const userId = String(b.userId || '');
      const slots = holdSlots(b);
      if (!id || !date || !slots.length || !SLOT_MIN[type]) return fail('resourceId, date and a time range are required');
      // The caller's own older hold on this resource and day is cleared first (server.js:4660).
      HOLDS = HOLDS.filter((h) => !(h.resourceType === type && h.resourceId === id && h.date === date && h.userId === userId));
      const c = clash(type, id, date, slots, userId);
      if (c) return c;
      const holdId = `hld${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
      const expiresAt = Date.now() + TTL;
      for (const slotIndex of slots) HOLDS.push({ holdId, resourceType: type, resourceId: id, date, slotIndex, userId, userName: String(b.userName || ''), expiresAt });
      return { ok: true, holdId, expiresAt: new Date(expiresAt).toISOString(), ttlSec: TTL / 1000 };
    },
  ],
  [
    'POST',
    /^\/holds\/([^/]+)\/renew$/,
    ([, id]) => {
      const mine = HOLDS.filter((h) => h.holdId === id && h.expiresAt > Date.now());
      if (!mine.length) return fail('Your hold on this time slot expired. Please re-select your time.', 410);
      const expiresAt = Date.now() + TTL;
      for (const h of mine) h.expiresAt = expiresAt;
      return { ok: true, expiresAt: new Date(expiresAt).toISOString(), ttlSec: TTL / 1000 };
    },
  ],
  [
    'DELETE',
    /^\/holds\/([^/]+)$/,
    ([, id]) => {
      dropHold(id);
      return { ok: true };
    },
  ],
  [
    'POST',
    /^\/holds\/([^/]+)\/release$/,
    ([, id]) => {
      dropHold(id);
      return { ok: true };
    },
  ],
];

// ── Exports for other domains (IT desk's rooms and locations reuse these stores) ──
export const roomStore = ROOMS;
export const locationStore = LOCATIONS;
export const roomSlotStore = ROOM_SLOTS;
export const locSlotStore = LOC_SLOTS;
