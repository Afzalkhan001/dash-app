// Demo API for the IT desk (wave 2). Shapes and refusals follow the real handlers:
//   routes/assets.js          GET /assets (bare array) · POST · PUT (notify:true + employee number = a real
//                             assignment: new ack token, acknowledged false) · DELETE · POST /:id/resend-ack
//                             (400 when not assigned)
//   routes/rooms.js, locations.js  POST · PUT (merge; leaving out `images` keeps them) · DELETE.
//                             Rows live in booking.ts's roomStore / locationStore, so the booking grid agrees.
//   routes/room_purposes.js   GET · POST / PUT (409 when the name is taken) · DELETE (409 when a booking used it)
//   routes/support.js         POST / PUT / DELETE /support_wifi, /support_staff, /support_branches (the row
//                             keeps whatever tenantId the body carries) and /support_temp_staff (days ≥ 1)
// Room bookings by colleagues are added to tasks.ts's bookingStore (booking.ts serves GET/PUT /bookings
// and the slot rows), with their slot rows in booking.ts's roomSlotStore.
//
// Shadowed in the barrel (for the integrator, see features/itdesk/HANDOFF.md): people.ts answers
// GET /assets with its own three rows and booking.ts answers GET /room_purposes with the website's
// five. This file's GETs for those two are the full stores; the integrator drops the other two.

import type { RoomPurpose } from '@/api/booking';
import { FALLBACK_PURPOSES } from '@/api/booking';
import type { ConfigItem, StaffEntry, TempStaffEntry, WifiEntry } from '@/api/support';
import { DEMO_TENANT_ID } from '@/demo/config';
import { locationStore, roomSlotStore, roomStore } from '@/demo/fixtures/booking';
import { supportConfigStore, supportStaffStore, supportTempStaffStore, supportWifiStore } from '@/demo/fixtures/support';
import { bookingStore, type DemoBooking } from '@/demo/fixtures/tasks';
import { addDays, daysAgo, fail, istIso, notFound, nowIso, today, type Route } from '@/demo/state';

const T0 = today();
const ago = (n: number) => addDays(T0, -n);
const ahead = (n: number) => addDays(T0, n);
type Body = Record<string, unknown>;
const clean = (body: unknown): Body => {
  const b = { ...((body || {}) as Body) };
  delete b.performedById;
  delete b.actorId;
  return b;
};

// ── Assets ───────────────────────────────────────────────────────────────────
type DemoAsset = {
  id: string;
  assetId: string;
  name: string;
  description?: string;
  serial: string;
  location: string;
  category: string;
  assetType: string;
  purchaseDate?: string;
  warrantyStatus?: string;
  warrantyExpiry?: string;
  condition: string;
  price: number;
  status: string;
  assignedTo: string | null;
  assignedToEmpNo: string;
  assignedToEmail?: string;
  assignmentDate?: string;
  acknowledged?: boolean;
  acknowledgedAt?: string | null;
  ackToken?: string | null;
  history: { action: string; to?: string; from?: string; note?: string; at: string }[];
  tenantId: string;
  [k: string]: unknown;
};

const mail = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.demo@tamadamedia.com`;
const given = (to: string, empNo: string, days: number, ack: boolean | 'none', extra: Partial<DemoAsset> = {}): Partial<DemoAsset> => ({
  assignedTo: to,
  assignedToEmpNo: empNo,
  assignedToEmail: mail(to),
  assignmentDate: ago(days),
  status: 'assigned',
  acknowledged: ack === true,
  acknowledgedAt: ack === true ? istIso(ago(days - 1), '10:12') : null,
  ackToken: ack === 'none' ? null : 'demo',
  history: [{ action: 'assigned', to, at: istIso(ago(days), '11:30') }],
  ...extra,
});
const stock: Partial<DemoAsset> = { assignedTo: null, assignedToEmpNo: '', assignmentDate: '', status: 'available', history: [] };

const asset = (a: Partial<DemoAsset> & { id: string; name: string }): DemoAsset =>
  ({ assetId: '', serial: '', location: 'Hyderabad', category: 'Electronics', assetType: '', condition: 'Good', price: 0, warrantyStatus: 'Active', tenantId: DEMO_TENANT_ID, ...stock, ...a }) as DemoAsset;

const ASSETS: DemoAsset[] = [
  // The three people.ts already shows on the roster (same ids), so both screens agree.
  asset({
    id: 'as-fx6',
    assetId: 'TM-CAM-014',
    name: 'Sony FX6 camera body',
    serial: 'FX6-2209-4471',
    assetType: 'Camera',
    description: 'Full-frame cinema camera, with 2 BP-U70 batteries and the top handle.',
    purchaseDate: '2024-02-12',
    warrantyExpiry: ahead(41),
    price: 548000,
    ...given('Farhan Ali', 'TM-1066', 210, true),
  }),
  asset({
    id: 'as-lat',
    assetId: 'TM-LAP-031',
    name: 'Dell Latitude 5440',
    serial: 'DL5440-88K2',
    assetType: 'Laptop',
    purchaseDate: '2024-06-01',
    warrantyExpiry: '2027-05-31',
    price: 86500,
    ...given('Ravi Teja', 'TM-1088', 500, true),
  }),
  asset({ id: 'as-mic', assetId: 'TM-AUD-007', name: 'Rode NTG5 shotgun mic', serial: 'NTG5-1123', assetType: 'Audio', condition: 'Fair', purchaseDate: '2023-08-20', warrantyExpiry: ago(60), warrantyStatus: 'Expired', price: 52000 }),
  // The rest of the inventory.
  asset({
    id: 'as-mba',
    assetId: 'ASSET/TM/2526/0012',
    name: 'MacBook Air M4',
    serial: 'C02MBA4-77QX',
    assetType: 'MacBook',
    description: 'Apple MacBook Air M4, 16 GB, 512 GB, midnight.',
    purchaseDate: '2025-04-10',
    warrantyExpiry: '2026-04-09',
    warrantyStatus: 'Expired',
    price: 114900,
    ...given('Rahul Verma', 'TM-1035', 180, true, {
      history: [
        { action: 'assigned', to: 'Sneha Iyer', at: istIso('2025-04-14', '10:00') },
        { action: 'returned', from: 'Sneha Iyer', note: 'Moved to the iMac; battery at 96%.', at: istIso(ago(181), '17:20') },
        { action: 'assigned', to: 'Rahul Verma', at: istIso(ago(180), '11:30') },
      ],
    }),
  }),
  asset({
    id: 'as-mbp',
    assetId: 'ASSET/TM/2526/0019',
    name: 'MacBook Pro 16" M4 Max',
    serial: 'C02MBP16-91LM',
    assetType: 'Mac Book Pro',
    description: '64 GB, 2 TB — the senior editor’s machine.',
    purchaseDate: '2025-09-01',
    warrantyExpiry: '2026-08-31',
    price: 389900,
    ...given('Sanjay Kumar', 'TM-1077', 3, false),
  }),
  asset({ id: 'as-macmini', assetId: 'EDIT-WS-07', name: 'Mac mini M4 Pro edit workstation', serial: 'C07MINI-3321', assetType: 'mac mini', category: 'Electronics', location: 'Hyderabad', purchaseDate: '2025-01-20', warrantyExpiry: ahead(12), price: 159900 }),
  asset({ id: 'as-mon1', assetId: 'TM-MON-021', name: 'Dell UltraSharp 27" monitor', serial: 'U2723QE-1A', assetType: 'Monitor', purchaseDate: '2024-11-02', warrantyExpiry: '2027-11-01', price: 46000, ...given('Kavya Reddy', 'TM-1083', 40, true) }),
  asset({ id: 'as-mon2', assetId: 'TM-MON-022', name: 'Dell UltraSharp 27" monitor', serial: 'U2723QE-1B', assetType: 'monitor', purchaseDate: '2024-11-02', warrantyExpiry: '2027-11-01', price: 46000 }),
  asset({ id: 'as-mon3', assetId: 'TM-MON-023', name: 'Dell UltraSharp 27" monitor', serial: 'U2723QE-1C', assetType: 'Monitor', condition: 'Not Working', description: 'Flickers after 10 minutes — sent for a warranty claim.', purchaseDate: '2024-11-02', warrantyExpiry: '2027-11-01', price: 46000 }),
  asset({ id: 'as-ups', assetId: 'TM-PWR-003', name: 'APC 3 kVA online UPS', serial: 'APC3K-5530', assetType: 'UPS', location: 'Hyderabad', purchaseDate: '2022-03-15', warrantyExpiry: ago(220), warrantyStatus: 'Expired', condition: 'Fair', price: 78000 }),
  asset({ id: 'as-print', assetId: 'TM-PRN-001', name: 'HP LaserJet Pro MFP', serial: 'HPM428-0091', assetType: 'Printer', purchaseDate: '2023-06-30', warrantyExpiry: ahead(25), price: 32500 }),
  asset({ id: 'as-ipad', assetId: 'TM-TAB-004', name: 'iPad Air (storyboards)', serial: 'DMPXIPAD-44', assetType: 'Tablet', purchaseDate: '2025-02-14', warrantyExpiry: '2026-02-13', warrantyStatus: 'Expired', price: 69900, ...given('Sneha Iyer', 'TM-1061', 90, 'none') }),
  asset({ id: 'as-chair', assetId: 'TM-FUR-112', name: 'Herman Miller Aeron chair', serial: 'AER-B-2231', category: 'Furniture', assetType: 'Chair', purchaseDate: '2024-01-08', warrantyStatus: 'Active', warrantyExpiry: '2036-01-07', price: 142000, ...given('Priya Sharma', 'TM-1007', 400, true) }),
  asset({ id: 'as-car', assetId: 'TM-VEH-002', name: 'Toyota Innova Crysta (pool car)', serial: 'TS09-EZ-4471', category: 'Vehicle', assetType: 'Car', location: 'Hyderabad', purchaseDate: '2023-12-01', warrantyExpiry: '2026-11-30', condition: 'Good', price: 2150000 }),
  asset({ id: 'as-adobe', assetId: 'TM-SW-009', name: 'DaVinci Resolve Studio licence', serial: 'DRS-7781-KEY', category: 'Software', assetType: 'Licence', purchaseDate: '2025-05-05', warrantyStatus: '', price: 29500 }),
  // Imported from the old sheet with an employee number that matches nobody (the Fix banner).
  asset({ id: 'as-hdd', assetId: 'TM-STO-018', name: 'LaCie Rugged 4 TB drive', serial: 'LRD4-0071', assetType: 'Hard Drive', location: 'Vizag', purchaseDate: '2024-09-09', warrantyExpiry: '2027-09-08', price: 18900, assignedTo: null, assignedToEmpNo: '10249', assignmentDate: '2025-01-15', status: 'assigned', acknowledged: false, ackToken: null, history: [] }),
];

function putAsset(id: string, body: unknown) {
  const a = ASSETS.find((x) => x.id === id);
  if (!a) return notFound('Asset not found');
  const changes = clean(body);
  delete changes.tenantId;
  const notify = changes.notify === true;
  delete changes.notify;
  const empNo = changes.assignedToEmpNo !== undefined ? String(changes.assignedToEmpNo || '') : a.assignedToEmpNo;
  if (notify && empNo) Object.assign(changes, { status: 'assigned', acknowledged: false, acknowledgedAt: null, ackToken: `demo${Date.now()}` });
  Object.assign(a, changes);
  return { ok: true };
}

// ── Rooms and locations (booking.ts's stores, filled out with the fields the IT desk edits) ─────────
const ROOM_EXTRA: Record<string, Body> = {
  'rm-board': { amenities: ['Projector', 'Whiteboard', 'Video Conferencing', 'AC'], internalNotes: 'HDMI and USB-C at the head of the table.' },
  'rm-edit3': { amenities: ['TV Screen', 'AC', 'Sound System'], internalNotes: '' },
  'rm-studioa': { amenities: ['AC', 'Sound System'], internalNotes: 'Lights stay rigged; ask before moving the green screen.' },
};
for (const r of roomStore) Object.assign(r, { amenities: [], images: [], internalNotes: '', ...ROOM_EXTRA[r.id] });
if (!roomStore.some((r) => r.id === 'rm-podcast')) {
  roomStore.push({ id: 'rm-podcast', name: 'Podcast Studio', floor: '2nd floor', capacity: 3, status: 'inactive', imageCount: 0, amenities: ['Sound System', 'AC'], images: [], internalNotes: 'Closed while the acoustic panels are replaced.' } as (typeof roomStore)[number]);
}
const LOC_EXTRA: Record<string, Body> = {
  'loc-ramoji': { area: 'Abdullapurmet', type: 'outdoor', openingTime: '06:00', closingTime: '19:00', slotDuration: 60, bufferTime: 30, minDuration: 120, maxDuration: 720, allowMultiple: false, description: 'Period street set; generator on site.' },
  'loc-gachi': { area: 'Gachibowli', type: 'indoor', openingTime: '07:00', closingTime: '22:00', slotDuration: 60, bufferTime: 30, minDuration: 60, maxDuration: 480, allowMultiple: true, approverName: '', approverId: '' },
  'loc-vizag': { area: 'Beach Road', type: 'outdoor', openingTime: '06:00', closingTime: '18:00', slotDuration: 120, bufferTime: 60, minDuration: 120, maxDuration: 480, allowMultiple: false },
};
for (const l of locationStore) Object.assign(l, { images: [], internalNotes: '', ...LOC_EXTRA[l.id] });

type Facility = { id: string; images?: unknown; imageCount?: number; [k: string]: unknown };
const tables = { rooms: roomStore as unknown as Facility[], locations: locationStore as unknown as Facility[] };
const facilityRoutes = (table: 'rooms' | 'locations'): Route[] => {
  const store = tables[table];
  const what = table === 'rooms' ? 'Room' : 'Location';
  const withCount = (row: Facility) => {
    if (Array.isArray(row.images)) row.imageCount = row.images.length;
    return row;
  };
  return [
    [
      'POST',
      new RegExp(`^/${table}$`),
      (_p, body) => {
        const b = clean(body);
        if (!String(b.name || '').trim()) return fail('Name is required');
        const row = withCount({ ...b, id: String(b.id || `${table[0]}${Date.now()}`), status: String(b.status || 'active'), tenantId: DEMO_TENANT_ID });
        store.push(row);
        return { ok: true, [table === 'rooms' ? 'room' : 'location']: row };
      },
    ],
    [
      'PUT',
      new RegExp(`^/${table}/([^/]+)$`),
      ([, id], body) => {
        const row = store.find((r) => r.id === id);
        if (!row) return notFound(`${what} not found`);
        const b = clean(body);
        delete b.id;
        delete b.tenantId;
        Object.assign(row, b);
        withCount(row);
        return { ok: true };
      },
    ],
    [
      'DELETE',
      new RegExp(`^/${table}/([^/]+)$`),
      ([, id]) => {
        const i = store.findIndex((r) => r.id === id);
        if (i >= 0) store.splice(i, 1);
        return { ok: true };
      },
    ],
  ];
};

// ── Booking purposes (room_purposes.js) ──────────────────────────────────────
type DemoPurpose = RoomPurpose & { color: string; bg: string; notice: string; sortOrder: number; tenantId: string };
const SWATCH: Record<string, [string, string]> = {
  business_meeting: ['#2563eb', '#dbeafe'],
  client_meeting: ['#16a34a', '#dcfce7'],
  shooting: ['#ea580c', '#fed7aa'],
  training: ['#7c3aed', '#ede9fe'],
  team_standup: ['#0891b2', '#cffafe'],
};
const PURPOSES: DemoPurpose[] = [
  ...FALLBACK_PURPOSES.map((p, i) => ({
    ...p,
    color: SWATCH[p.id]?.[0] ?? '#475569',
    bg: SWATCH[p.id]?.[1] ?? '#f1f5f9',
    notice: p.notice ?? '',
    requiresClient: !!p.requiresClient,
    requiresRequirements: !!p.requiresRequirements,
    active: true,
    sortOrder: i + 1,
    tenantId: DEMO_TENANT_ID,
  })),
  { id: 'rp_podcast_recording_demo', label: 'Podcast recording', color: '#db2777', bg: '#fce7f3', active: false, requiresClient: false, requiresRequirements: true, notice: '', sortOrder: 6, tenantId: DEMO_TENANT_ID },
];
const sameName = (label: string, exceptId?: string) => PURPOSES.find((p) => p.id !== exceptId && p.label.trim().toLowerCase() === label.trim().toLowerCase());
const purposeBody = (b: Body) => ({
  ...(b.label !== undefined && { label: String(b.label).trim().slice(0, 40) }),
  ...(b.color !== undefined && { color: String(b.color) }),
  ...(b.bg !== undefined && { bg: String(b.bg) }),
  ...(b.active !== undefined && { active: b.active !== false }),
  ...(b.requiresClient !== undefined && { requiresClient: !!b.requiresClient }),
  ...(b.requiresRequirements !== undefined && { requiresRequirements: !!b.requiresRequirements }),
  ...(b.notice !== undefined && { notice: String(b.notice || '').trim().slice(0, 400) }),
});

// ── Room bookings by colleagues (booking.ts serves /bookings; these sit in the same store) ─────────
const roomBooking = (id: string, b: Partial<DemoBooking> & { startSlot: number; endSlot: number }): DemoBooking =>
  ({ id, type: 'rooms', status: 'approved', reason: '', ...b }) as DemoBooking;
const ROOM_BOOKINGS: DemoBooking[] = [
  roomBooking('bk-it-priya', {
    resource: 'Board Room',
    resourceId: 'rm-board',
    requestedBy: 'Priya Sharma',
    requestedById: 'u-priya',
    dates: [ahead(1)],
    purpose: 'client_meeting',
    purposeLabel: 'Client Meeting',
    clientName: 'Sunrise Jewellers',
    requirements: 'Projector and the Diwali film on the big screen',
    startSlot: 20,
    endSlot: 22,
    createdAt: daysAgo(1, '15:10'),
  }),
  roomBooking('bk-it-vikram', {
    resource: 'Studio A',
    resourceId: 'rm-studioa',
    requestedBy: 'Vikram Singh',
    requestedById: 'u-vikram',
    dates: [ahead(2)],
    purpose: 'shooting',
    purposeLabel: 'Shooting',
    startSlot: 28,
    endSlot: 32,
    createdAt: daysAgo(0, '09:15'),
  }),
  roomBooking('bk-it-meera', {
    resource: 'Board Room',
    resourceId: 'rm-board',
    requestedBy: 'Meera Nair',
    requestedById: 'u-meera',
    dates: [ahead(3)],
    purpose: 'training',
    purposeLabel: 'Training',
    startSlot: 30,
    endSlot: 34,
    createdAt: daysAgo(0, '11:40'),
  }),
  roomBooking('bk-it-deepa', {
    resource: 'Edit Suite 3',
    resourceId: 'rm-edit3',
    requestedBy: 'Deepa Menon',
    requestedById: 'u-deepa',
    dates: [ahead(1)],
    purpose: 'team_standup',
    purposeLabel: 'Team Standup',
    startSlot: 19,
    endSlot: 20,
    createdAt: daysAgo(2, '18:00'),
  }),
  roomBooking('bk-it-rahul', {
    resource: 'Board Room',
    resourceId: 'rm-board',
    requestedBy: 'Rahul Verma',
    requestedById: 'u-rahul',
    dates: [ago(3)],
    purpose: 'business_meeting',
    purposeLabel: 'Business Meeting',
    startSlot: 24,
    endSlot: 26,
    createdAt: daysAgo(5, '10:00'),
  }),
  roomBooking('bk-it-zoya', {
    resource: 'Studio A',
    resourceId: 'rm-studioa',
    requestedBy: 'Zoya Khan',
    requestedById: 'u-zoya',
    dates: [ago(1)],
    status: 'rejected',
    reason: 'Cancelled by IT Admin',
    purpose: 'shooting',
    purposeLabel: 'Shooting',
    startSlot: 22,
    endSlot: 26,
    createdAt: daysAgo(4, '12:30'),
  }),
];
for (const b of ROOM_BOOKINGS) {
  if (bookingStore.some((x) => x.id === b.id)) continue;
  bookingStore.push(b);
  const day = (b.dates ?? [])[0];
  if (b.status !== 'rejected' && day && day >= T0) {
    roomSlotStore.push({
      id: `rsb-${b.id}`,
      roomId: String(b.resourceId),
      date: day,
      startSlot: Number(b.startSlot),
      endSlot: Number(b.endSlot),
      bookedBy: b.requestedBy,
      bookedById: String(b.requestedById || ''),
      purpose: String(b.purpose || ''),
      bookingId: b.id,
    });
  }
}

// ── Support Centre directory ─────────────────────────────────────────────────
const support = <T extends { id: string }>(path: string, store: T[], label: string, need: (keyof T)[]): Route[] => [
  [
    'POST',
    new RegExp(`^/${path}$`),
    (_p, body) => {
      const b = clean(body) as Partial<T> & Body;
      const missing = need.find((k) => !String(b[k as string] ?? '').trim());
      if (missing) return fail(`${String(missing)} is required`);
      const row = { ...b, id: String(b.id || `${path}${Date.now()}`) } as unknown as T;
      store.push(row);
      return { ok: true };
    },
  ],
  [
    'PUT',
    new RegExp(`^/${path}/([^/]+)$`),
    ([, id], body) => {
      const row = store.find((r) => r.id === id);
      if (!row) return notFound(`${label} not found`);
      const b = clean(body);
      delete b.id;
      Object.assign(row, b);
      return { ok: true };
    },
  ],
  [
    'DELETE',
    new RegExp(`^/${path}/([^/]+)$`),
    ([, id]) => {
      const i = store.findIndex((r) => r.id === id);
      if (i >= 0) store.splice(i, 1);
      return { ok: true };
    },
  ],
];

export const itdeskRoutes: Route[] = [
  ['GET', /^\/assets$/, () => ASSETS],
  [
    'POST',
    /^\/assets$/,
    (_p, body) => {
      const b = clean(body);
      const row = asset({ ...(b as Partial<DemoAsset>), id: String(b.id || `a${Date.now()}`), name: String(b.name || '').trim(), status: String(b.status || 'available'), tenantId: DEMO_TENANT_ID });
      ASSETS.push(row);
      return { ok: true, asset: row };
    },
  ],
  ['PUT', /^\/assets\/([^/]+)$/, ([, id], body) => putAsset(id!, body)],
  [
    'DELETE',
    /^\/assets\/([^/]+)$/,
    ([, id]) => {
      const i = ASSETS.findIndex((x) => x.id === id);
      if (i >= 0) ASSETS.splice(i, 1);
      return { ok: true };
    },
  ],
  [
    'POST',
    /^\/assets\/([^/]+)\/resend-ack$/,
    ([, id]) => {
      const a = ASSETS.find((x) => x.id === id);
      if (!a) return notFound('Asset not found');
      if (!a.assignedToEmpNo) return fail('Asset is not currently assigned');
      if (!a.assignedToEmail && !a.assignedTo) return fail('Could not find an email address for the assigned employee');
      if (!a.ackToken) a.ackToken = `demo${Date.now()}`;
      return { ok: true };
    },
  ],

  ...facilityRoutes('rooms'),
  ...facilityRoutes('locations'),

  ['GET', /^\/room_purposes$/, () => [...PURPOSES].sort((a, b) => a.sortOrder - b.sortOrder)],
  [
    'POST',
    /^\/room_purposes$/,
    (_p, body) => {
      const b = purposeBody(clean(body));
      const label = b.label ?? '';
      if (!label) return fail('Give the purpose a name.');
      if (sameName(label)) return fail(`A purpose called "${label}" already exists.`, 409);
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32);
      const row: DemoPurpose = {
        id: `rp_${slug}_${Date.now().toString(36)}`,
        label,
        color: b.color ?? '#2563eb',
        bg: b.bg ?? '#dbeafe',
        active: b.active ?? true,
        requiresClient: !!b.requiresClient,
        requiresRequirements: !!b.requiresRequirements,
        notice: b.notice ?? '',
        sortOrder: PURPOSES.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1,
        tenantId: DEMO_TENANT_ID,
      };
      PURPOSES.push(row);
      return { ok: true, purpose: row };
    },
  ],
  [
    'PUT',
    /^\/room_purposes\/([^/]+)$/,
    ([, id], body) => {
      const p = PURPOSES.find((x) => x.id === id);
      if (!p) return notFound('Purpose not found');
      const b = purposeBody(clean(body));
      if (b.label !== undefined && !b.label) return fail('Give the purpose a name.');
      if (b.label && sameName(b.label, p.id)) return fail(`A purpose called "${b.label}" already exists.`, 409);
      Object.assign(p, b);
      return { ok: true, purpose: p };
    },
  ],
  [
    'DELETE',
    /^\/room_purposes\/([^/]+)$/,
    ([, id]) => {
      const i = PURPOSES.findIndex((x) => x.id === id);
      if (i < 0) return notFound('Purpose not found');
      if (bookingStore.some((b) => b.type === 'rooms' && b.purpose === id))
        return fail("This purpose is used by existing bookings, so it can't be deleted. Turn it off instead — it will disappear from new bookings while old ones keep their label.", 409);
      PURPOSES.splice(i, 1);
      return { ok: true };
    },
  ],

  ...support<WifiEntry>('support_wifi', supportWifiStore, 'Wi-Fi entry', ['branch', 'wifiName', 'password']),
  ...support<StaffEntry>('support_staff', supportStaffStore, 'Staff entry', ['branch', 'designation', 'name', 'mobile']),
  ...support<ConfigItem>('support_branches', supportConfigStore, 'Item', ['label']),
  [
    'POST',
    /^\/support_temp_staff$/,
    (_p, body) => {
      const b = clean(body);
      const days = Number(b.days) || 0;
      if (days < 1) return fail('Enter a number of days (1 or more).');
      const created = nowIso();
      const s: TempStaffEntry = {
        id: String(b.id || `ts${Date.now()}`),
        branch: String(b.branch || ''),
        name: String(b.name || ''),
        designation: String(b.designation || ''),
        mobile: String(b.mobile || ''),
        days,
        createdAt: created,
        expiresAt: new Date(Date.parse(created) + days * 86_400_000).toISOString(),
      };
      supportTempStaffStore.push({ ...s, tenantId: DEMO_TENANT_ID } as TempStaffEntry);
      return { ok: true, s };
    },
  ],
  [
    'DELETE',
    /^\/support_temp_staff\/([^/]+)$/,
    ([, id]) => {
      const i = supportTempStaffStore.findIndex((r) => r.id === id);
      if (i >= 0) supportTempStaffStore.splice(i, 1);
      return { ok: true };
    },
  ],
];
