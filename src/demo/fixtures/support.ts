// Support (routes/tickets.js, routes/support.js): every ticket in the company (the app keeps the
// demo person's own), raising one (the client-built record is stored as sent, like the server's
// `{ id, status: 'open', createdAt, ...body }`), withdrawing one (the raiser may only cancel; a task
// for an IT ticket may resolve it), and the Support Centre directory: config lists, branch Wi-Fi,
// office staff and temporary staff.

import type { ConfigItem, StaffEntry, TempStaffEntry, Ticket, WifiEntry } from '@/api/support';
import { DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { addDays, daysAgo, fail, istDateOf, minutesAgo, notFound, nowIso, today, type Route } from '@/demo/state';

const T0 = today();
const ME = String(DEMO_USER.name);
const raiser = {
  from: ME,
  raisedByName: ME,
  fromEmail: String(DEMO_USER.email),
  fromId: DEMO_USER.id,
  raisedById: DEMO_USER.id,
  fromPhone: String(DEMO_USER.mobile),
  dept: 'Creative',
  tenantId: DEMO_TENANT_ID,
};
const at = (iso: string) => ({ createdAt: iso, date: istDateOf(iso) });
// A colleague's ticket (the IT desk's work: assigned to the demo person, worked as Afzal IT Admin).
const raisedBy = (id: string, name: string, dept: string) => ({
  from: name,
  raisedByName: name,
  fromEmail: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.demo@tamadamedia.com`,
  fromId: id,
  raisedById: id,
  fromPhone: '',
  dept,
  tenantId: DEMO_TENANT_ID,
});

const TICKETS: Ticket[] = [
  {
    id: 'tk1760700000011',
    category: 'ticket',
    type: 'network',
    subject: 'Wi-Fi keeps dropping in Edit Suite 2',
    desc: 'The access point near Edit Suite 2 drops every few minutes, so uploads to the client Drive keep failing.',
    priority: 'high',
    status: 'open',
    assignedTo: ME,
    ...raisedBy('u-sneha', 'Sneha Iyer', 'Creative'),
    ...at(minutesAgo(75)),
  },
  {
    id: 'tk1760700000012',
    category: 'ticket',
    type: 'hardware',
    subject: 'Laptop for the Ramoji shoot (DaVinci + LUTs)',
    desc: 'Field laptop for on-set DIT: DaVinci Resolve, the show LUTs and a 2 TB SSD formatted exFAT. Pick-up on Thursday morning.',
    priority: 'medium',
    status: 'in_progress',
    assignedTo: ME,
    acceptedAt: daysAgo(1, '15:05'),
    kekaCode: 'TM_KAG_LAUNCH',
    ...raisedBy('u-farhan', 'Farhan Ali', 'Production'),
    ...at(daysAgo(1, '11:15')),
  },
  {
    id: 'tk1760512800001',
    category: 'ticket',
    type: 'software',
    subject: 'Premiere Pro crashes when exporting 4K ProRes',
    desc: 'Since the macOS update, Premiere Pro 25.4 quits at around 60% of every 4K ProRes 422 HQ export on EDIT-WS-07. H.264 exports are fine. Crash report attached in the email to IT.',
    priority: 'high',
    status: 'in_progress',
    assignedTo: 'Naveen Kumar',
    acceptedAt: daysAgo(1, '11:40'),
    kekaCode: 'TM_SJW_DIWALI26',
    ...raiser,
    ...at(daysAgo(1, '10:55')),
  },
  {
    id: 'tk1760339400002',
    category: 'asset',
    assetType: 'Hard Drive',
    quantity: 2,
    urgency: 'urgent',
    reason: '4 TB external SSDs for the Kathalu S2 raw footage — the current drives are full and the shoot resumes next week.',
    status: 'pending_approval',
    kekaCode: 'TM_KTH_S2',
    ...raiser,
    ...at(daysAgo(3, '15:20')),
  },
  {
    id: 'tk1759993800003',
    category: 'admin_request',
    itemType: 'Ergonomic Chair',
    quantity: 1,
    urgency: 'normal',
    reason: 'The chair in Edit Suite 3 is broken (the height lever does not hold).',
    status: 'resolved',
    assignedTo: 'Naveen Kumar',
    acceptedAt: daysAgo(6, '12:00'),
    resolvedAt: daysAgo(5, '16:30'),
    resolvedBy: 'Naveen Kumar',
    resolutionNote: 'Replaced with a new chair from the store room.',
    kekaCode: 'TM_INT_ADMIN',
    ...raiser,
    ...at(daysAgo(7, '10:10')),
  },
  {
    id: 'tk1759821000004',
    category: 'complaint',
    type: 'Facilities',
    subject: 'AC in Edit Suite 3 not cooling',
    desc: 'The AC has been blowing warm air since Monday afternoon. It gets very warm with three workstations running.',
    status: 'open',
    ...raiser,
    ...at(minutesAgo(80)),
  },
  {
    id: 'tk1759216200005',
    category: 'ticket',
    type: 'software',
    subject: 'DaVinci Resolve Studio licence',
    desc: 'Need a Resolve Studio licence for noise reduction on the night shots.',
    priority: 'medium',
    status: 'rejected',
    rejectedAt: daysAgo(14, '14:00'),
    rejectedBy: 'Naveen Kumar',
    rejectionReason: 'Rahul’s grading suite already has Studio — please send the clips to him for NR.',
    ...raiser,
    ...at(daysAgo(15, '11:10')),
  },
  {
    id: 'tk1758870600006',
    category: 'ticket',
    type: 'access',
    subject: 'Access to the shared Frame.io workspace',
    desc: 'Need edit access to the Aarogya project on Frame.io.',
    priority: 'low',
    status: 'cancelled',
    cancelledAt: daysAgo(19, '10:00'),
    cancelledBy: ME,
    ...raiser,
    ...at(daysAgo(19, '09:40')),
  },
  // Someone else's (the app shows only the demo person's own).
  {
    id: 'tk1760425800007',
    category: 'ticket',
    type: 'hardware',
    subject: 'Second monitor flickering',
    desc: 'Dell U2723QE on desk 14 flickers every few minutes.',
    priority: 'medium',
    status: 'open',
    from: 'Sneha Iyer',
    raisedByName: 'Sneha Iyer',
    fromEmail: 'sneha.iyer.demo@tamadamedia.com',
    fromId: 'u-sneha',
    raisedById: 'u-sneha',
    dept: 'Creative',
    tenantId: DEMO_TENANT_ID,
    ...at(minutesAgo(5 * 60)),
  },
];

const CONFIG: ConfigItem[] = [
  ...['Ergonomic Chair', 'Desk Lamp', 'Whiteboard', 'Stationery Kit', 'Locker Key', 'ID Card Reprint', 'Parking Sticker'].map((label, i) => ({ id: `sb-item-${i + 1}`, listType: 'admin_item', label })),
  ...['Facilities', 'Housekeeping', 'Cafeteria', 'Transport', 'Behaviour & Work', 'Other'].map((label, i) => ({ id: `sb-cmp-${i + 1}`, listType: 'complaint_type', label })),
].map((c) => ({ ...c, tenantId: DEMO_TENANT_ID }));

const WIFI: WifiEntry[] = [
  { id: 'wifi-1', branch: 'Jubilee Hills HQ', wifiName: 'TM-Staff-5G', password: 'Tamada@2026' },
  { id: 'wifi-2', branch: 'Jubilee Hills HQ', wifiName: 'TM-Guest', password: 'welcome2tm' },
  { id: 'wifi-3', branch: 'Jubilee Hills HQ', wifiName: 'TM-EditBay', password: 'Render!Fast26' },
  { id: 'wifi-4', branch: 'Gachibowli Studio', wifiName: 'TM-Studio', password: 'Lights#Camera9' },
  { id: 'wifi-5', branch: 'Vizag Office', wifiName: 'TM-Vizag', password: 'Beach@Road26' },
].map((w) => ({ ...w, tenantId: DEMO_TENANT_ID }));

const STAFF: StaffEntry[] = [
  { id: 'ss-1', branch: 'Jubilee Hills HQ', designation: 'Front Desk', name: 'Swathi Goud', mobile: '+919000155101', active: true },
  { id: 'ss-2', branch: 'Jubilee Hills HQ', designation: 'IT Support', name: 'Naveen Kumar', mobile: '+919000101019', active: true },
  { id: 'ss-3', branch: 'Jubilee Hills HQ', designation: 'Driver', name: 'Yadagiri', mobile: '+919000155103', active: true },
  { id: 'ss-4', branch: 'Jubilee Hills HQ', designation: 'Housekeeping', name: 'Lalitha', mobile: '+919000155104', active: true },
  { id: 'ss-5', branch: 'Jubilee Hills HQ', designation: 'Security', name: 'Mallesh', mobile: '+919000155105', active: true },
  { id: 'ss-6', branch: 'Gachibowli Studio', designation: 'Studio Manager', name: 'Prakash Rao', mobile: '+919000155106', active: true },
  { id: 'ss-7', branch: 'Gachibowli Studio', designation: 'Security', name: 'Anjaiah', mobile: '+919000155107', active: true },
  { id: 'ss-8', branch: 'Vizag Office', designation: 'Office Assistant', name: 'Ravi Teja', mobile: '+919000155108', active: true },
  { id: 'ss-9', branch: 'Jubilee Hills HQ', designation: 'Driver', name: 'Shankar (left)', mobile: '+919000155109', active: false },
].map((s) => ({ ...s, tenantId: DEMO_TENANT_ID }));

const TEMP_STAFF: TempStaffEntry[] = [
  { id: 'tss-1', branch: 'Gachibowli Studio', designation: 'Driver', name: 'Mahesh (Kisan shoot)', mobile: '+919000155110', active: true, days: 7, createdAt: daysAgo(2, '09:00'), expiresAt: `${addDays(T0, 5)}T18:30:00.000Z` },
];

function create(body: unknown) {
  const b = { ...((body || {}) as Record<string, unknown>) };
  delete b.performedById;
  const t: Ticket = { id: `tkt${Date.now()}`, status: 'open', createdAt: nowIso(), ...(b as Partial<Ticket>), tenantId: DEMO_TENANT_ID } as Ticket;
  TICKETS.unshift(t);
  return { ok: true, t };
}

function update(id: string, body: unknown) {
  const t = TICKETS.find((x) => x.id === id);
  if (!t) return notFound('Ticket not found.');
  const b = { ...((body || {}) as Record<string, unknown>) };
  delete b.performedById;
  delete b.tenantId;
  if (b.status === 'rejected' && t.status !== 'rejected') return fail('Use the Reject action — a rejection reason is required.');
  if (b.status && b.status !== t.status) {
    const mine = t.raisedById === DEMO_USER.id || t.fromId === DEMO_USER.id;
    // The raiser may only withdraw it; resolving is for whoever works it (here: a task for the ticket).
    const allowed = (mine && b.status === 'cancelled') || (!mine && b.status === 'resolved');
    if (!allowed) return fail('You do not have permission to move this request to that status.', 403);
  }
  Object.assign(t, b);
  return { ok: true };
}

export const supportRoutes: Route[] = [
  ['GET', /^\/tickets$/, () => TICKETS],
  ['POST', /^\/tickets$/, (_p, body) => create(body)],
  ['PUT', /^\/tickets\/([^/]+)$/, ([, id], body) => update(id!, body)],
  ['GET', /^\/support_branches$/, () => CONFIG],
  ['GET', /^\/support_wifi$/, () => WIFI],
  ['GET', /^\/support_staff$/, () => STAFF],
  ['GET', /^\/support_temp_staff$/, () => TEMP_STAFF.filter((s) => !s.expiresAt || s.expiresAt > nowIso())],
];
