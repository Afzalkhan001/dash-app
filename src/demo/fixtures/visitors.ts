// Visitors for the demo person (visitors.js, EMPLOYEE section): who is waiting downstairs
// (`pending` = pending | no_response), past visits (shapeVisit rows, no photo in the demo), the
// guests they invited, deciding a visit, and creating / cancelling an invitation. Deciding twice is
// refused the server's way ("This visit was already approved."). Every visit leaves through shapeVisit,
// which adds letInAt (created + 5 min) and waitedMin (minutes to the answer) like visitors.js.

import type { Invite, Visit } from '@/api/visitors';
import { DEMO_USER } from '@/demo/config';
import { addDays, daysAgo, fail, istDateOf, minutesAgo, nowIso, sixDigits, today, workingDayFrom, type Route } from '@/demo/state';

const T0 = today();
const ME = String(DEMO_USER.name);
const nextWorkingDay = workingDayFrom(T0, -1);

const visit = (v: Partial<Visit> & Pick<Visit, 'id' | 'visitorName' | 'visitorMobile' | 'purpose' | 'status' | 'createdAt'>): Visit => ({
  hostUserId: DEMO_USER.id,
  hostName: ME,
  source: 'qr',
  inviteId: null,
  decidedAt: null,
  decidedVia: '',
  decidedBy: '',
  checkOutAt: null,
  workDate: istDateOf(v.createdAt),
  photoUrl: '',
  photoPurged: false,
  ...v,
});

const VISITS: Visit[] = [
  visit({ id: 'vis-demo-01', visitorName: 'Rohan Mehta', visitorMobile: '919848022113', purpose: 'Delivering the colour-graded masters on a hard drive (Sunrise Jewellers)', status: 'pending', createdAt: minutesAgo(4), workDate: T0 }),
  visit({
    id: 'vis-demo-02',
    visitorName: 'Aditi Rao',
    visitorMobile: '919900112244',
    purpose: 'Voice-over audition for the Nimbus explainers',
    status: 'approved',
    createdAt: minutesAgo(150),
    decidedAt: minutesAgo(148),
    decidedVia: 'app',
    decidedBy: ME,
    workDate: T0,
  }),
  visit({
    id: 'vis-demo-03',
    visitorName: 'Srinivas K',
    visitorMobile: '918801234567',
    purpose: 'Client review — Kisan Agro launch film',
    source: 'invite',
    inviteId: 'inv-demo-03',
    status: 'checked_out',
    createdAt: daysAgo(6, '11:02'),
    decidedAt: daysAgo(6, '11:02'),
    decidedVia: 'app',
    decidedBy: ME,
    checkOutAt: daysAgo(6, '13:40'),
  }),
  visit({
    id: 'vis-demo-04',
    visitorName: 'Manoj (Blue Dart)',
    visitorMobile: '917702345612',
    purpose: 'Courier pickup — drives for the client',
    source: 'kiosk',
    status: 'checked_out',
    createdAt: daysAgo(9, '16:20'),
    decidedAt: daysAgo(9, '16:22'),
    decidedVia: 'whatsapp',
    decidedBy: ME,
    checkOutAt: daysAgo(9, '16:35'),
  }),
  visit({
    id: 'vis-demo-05',
    visitorName: 'Unknown sales representative',
    visitorMobile: '919123456780',
    purpose: 'Demo of editing workstations',
    status: 'rejected',
    createdAt: daysAgo(13, '12:10'),
    decidedAt: daysAgo(13, '12:12'),
    decidedVia: 'app',
    decidedBy: ME,
  }),
  // You did not answer, so the desk let them in after the wait: the history says so (desk_override).
  visit({
    id: 'vis-demo-06',
    visitorName: 'Kavitha Rao',
    visitorMobile: '919848033221',
    purpose: 'Contract papers for signature',
    status: 'checked_out',
    createdAt: daysAgo(3, '15:05'),
    decidedAt: daysAgo(3, '15:12'),
    decidedVia: 'desk_override',
    decidedBy: 'Afzal Visitor Manager',
    checkOutAt: daysAgo(3, '15:40'),
  }),
];

const invite = (i: Partial<Invite> & Pick<Invite, 'id' | 'guestName' | 'guestMobile' | 'visitDate' | 'purpose' | 'status'>): Invite => ({
  timeFrom: '',
  timeTo: '',
  code: sixDigits(),
  usedAt: null,
  createdAt: nowIso(),
  ...i,
});

const INVITES: Invite[] = [
  invite({ id: 'inv-demo-01', guestName: 'Sameer Joshi', guestMobile: '919845012345', visitDate: nextWorkingDay, timeFrom: '11:00', timeTo: '12:30', purpose: 'Edit review — Sunrise Jewellers Diwali film', status: 'active', code: '583201', createdAt: daysAgo(1, '18:05') }),
  invite({ id: 'inv-demo-02', guestName: 'Harini Venkat', guestMobile: '919701122334', visitDate: workingDayFrom(T0, -4), timeFrom: '15:00', timeTo: '16:00', purpose: 'Portfolio discussion — freelance colourist', status: 'active', code: '720946', createdAt: daysAgo(2, '10:40') }),
  invite({ id: 'inv-demo-03', guestName: 'Srinivas K', guestMobile: '918801234567', visitDate: addDays(T0, -6), timeFrom: '11:00', timeTo: '13:00', purpose: 'Client review — Kisan Agro launch film', status: 'used', code: '204517', usedAt: daysAgo(6, '11:02'), createdAt: daysAgo(8, '17:00') }),
  invite({ id: 'inv-demo-04', guestName: 'Pooja Bhatt', guestMobile: '919988776655', visitDate: addDays(T0, -11), purpose: 'Music composer meeting', status: 'cancelled', code: '661083', createdAt: daysAgo(14, '12:00') }),
];

// visitors.js normalizeWaPhone: digits, with India's 91 in front of a 10-digit number.
function waPhone(v: unknown) {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
}

function createInvite(body: unknown) {
  const b = (body || {}) as Record<string, unknown>;
  const guestName = String(b.guestName || '').trim().slice(0, 120);
  const guestMobile = waPhone(b.guestMobile);
  const visitDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.visitDate || '')) ? String(b.visitDate) : '';
  if (!guestName) return fail("Your guest's name is required.");
  if (guestMobile.length < 12) return fail('A valid mobile number is required — the code is sent to it.');
  if (!visitDate) return fail('Pick the date of the visit.');
  if (visitDate < today()) return fail('That date has already passed.');
  const i = invite({
    id: `inv${Date.now()}`,
    guestName,
    guestMobile,
    visitDate,
    timeFrom: String(b.timeFrom || '').slice(0, 5),
    timeTo: String(b.timeTo || '').slice(0, 5),
    purpose: String(b.purpose || '').trim().slice(0, 200),
    status: 'active',
    createdAt: nowIso(),
  });
  INVITES.unshift(i);
  return { ok: true, id: i.id, code: i.code, visitDate: i.visitDate, guestName: i.guestName };
}

function decide(id: string, body: unknown) {
  const decision = (body as { decision?: unknown })?.decision;
  if (decision !== 'approve' && decision !== 'reject') return fail('Say approve or reject.');
  const v = VISITS.find((x) => x.id === id);
  if (!v) return fail('Visit not found.', 404);
  if (v.status !== 'pending' && v.status !== 'no_response') return fail(`This visit was already ${String(v.status).replace('_', ' ')}.`, 409);
  Object.assign(v, { status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: nowIso(), decidedVia: 'app', decidedBy: ME });
  return { ok: true, id: v.id, status: v.status };
}

const waiting = (v: Visit) => v.status === 'pending' || v.status === 'no_response';
const newest = (a: Visit, b: Visit) => b.createdAt.localeCompare(a.createdAt);
// The store is shared with the visitor desk (visitStore below), which adds visits for other hosts:
// /visitors/mine is only the demo person's, as visitors.js scopes it to the signed-in host.
const mine = (v: Visit) => v.hostUserId === DEMO_USER.id;

export const visitorRoutes: Route[] = [
  [
    'GET',
    /^\/visitors\/mine$/,
    () => ({
      ok: true,
      pending: VISITS.filter((v) => mine(v) && waiting(v)).sort(newest).map(shapeVisit),
      history: VISITS.filter((v) => mine(v) && !waiting(v)).sort(newest).map(shapeVisit),
    }),
  ],
  ['POST', /^\/visitors\/([^/]+)\/decide$/, ([, id], body) => decide(id!, body)],
  ['GET', /^\/visitors\/invites$/, () => ({ ok: true, invites: [...INVITES].sort((a, b) => b.visitDate.localeCompare(a.visitDate)) })],
  ['POST', /^\/visitors\/invites$/, (_p, body) => createInvite(body)],
  [
    'DELETE',
    /^\/visitors\/invites\/([^/]+)$/,
    ([, id]) => {
      const i = INVITES.find((x) => x.id === id);
      if (!i) return fail('Invitation not found.', 404);
      if (i.status !== 'active') return fail(`That invitation is already ${i.status}.`, 409);
      i.status = 'cancelled';
      return { ok: true, id: i.id, status: 'cancelled' };
    },
  ],
];

// ── Exports for the domain fixtures (Wave 0, docs/port/EXTENSION-POINTS.md §10) ──
// ONE visit store for the whole demo, so the host (Inbox, Visitors) and the visitor desk agree: the
// desk adds walk-ins and checks people out here, and a host's let in / turn away shows on the desk.
// Visits for other hosts carry their own hostUserId / hostName (only the demo person's reach
// /visitors/mine). `inviteStore` is the demo person's own invitations.
export const visitStore: Visit[] = VISITS;
export const inviteStore: Invite[] = INVITES;
/** A visit row with the server's defaults (visitors.js shapeVisit), hosted by the demo person unless given. */
export const makeVisit = visit;

/** visitors.js LET_IN_AFTER_MIN: how long the host gets before the desk may let a visitor in. */
export const LET_IN_AFTER_MIN = 5;

/** A visit as the server sends it (shapeVisit): plus letInAt and waitedMin, worked out now. */
export function shapeVisit(v: Visit): Visit {
  const created = Date.parse(v.createdAt);
  const decided = v.decidedAt ? Date.parse(v.decidedAt) : NaN;
  return {
    ...v,
    letInAt: new Date(created + LET_IN_AFTER_MIN * 60_000).toISOString(),
    waitedMin: Number.isFinite(decided) ? Math.max(0, Math.round((decided - created) / 60_000)) : null,
  };
}
