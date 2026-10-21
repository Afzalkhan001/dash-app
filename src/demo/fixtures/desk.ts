// Demo API for the visitor desk (visitors.js DESK section :556-665, docs/port/visitor-desk.md §6).
// Tenant-wide visits live in the ONE shared visit store (fixtures/visitors.ts visitStore), so the desk
// and the hosts agree: a host's Let in shows on the board, and the desk's answer reaches the host. This
// file adds today's walk-ins for other hosts and ~30 days of history, plus one invitation for today.
//
//   GET  /visitors/today             today's visits (IST work date) + stats, computed the server's way
//   GET  /visitors/log               from / to (work date), status, q (name, mobile, host, reason), ≤ 2000
//   POST /visitors/:id/check-out     404 unknown · 409 "That visitor is already checked out."
//   POST /visitors/:id/decide        the host, or a desk role (else 403); 409 once decided; recorded as the
//                                    signed-in person (DEMO_USER, which the demo server shows as the persona)
//   GET  /visitors/qr                { tenantId, token, path, companyName }
//   POST /visitors/qr/regenerate     rotates the token (demo-qr-<n>)
//   POST /visitors/kiosk/exit        demo password Demo@123 (kiosk mode is wave 2)
// The desk routes answer 403 to anyone but visitor_manager / super_admin, like requireRole(DESK_ROLES).

import type { Invite, Visit } from '@/api/visitors';
import { DEMO_PASSWORD, DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { personById, TENANT } from '@/demo/fixtures/org';
import { inviteStore, makeVisit, visitStore } from '@/demo/fixtures/visitors';
import { currentPersona } from '@/demo/personas';
import { addDays, fail, isWeeklyOff, istDateOf, istIso, minutesAgo, nowIso, rand, today, type Route } from '@/demo/state';
import { VISIT_DESK_ROLES } from '@/lib/access';

const T0 = today();

const hostOf = (id: string) => ({ hostUserId: id, hostName: personById(id)?.name ?? 'Host' });

// ── Today: one of each state, for hosts across the company (spec §6.2) ─────────
// The demo person's own two visits (fixtures/visitors.ts: one waiting, one inside) are on the board too.
const TODAY: Visit[] = [
  makeVisit({
    id: 'vis-desk-01',
    ...hostOf('u-naveen'),
    visitorName: 'Suresh Babu',
    visitorMobile: '919866012345',
    purpose: 'Network cabling quote for the edit suites',
    source: 'kiosk',
    status: 'pending',
    createdAt: minutesAgo(3),
    workDate: T0,
  }),
  makeVisit({
    id: 'vis-desk-02',
    ...hostOf('u-deepa'),
    visitorName: 'Lakshmi Narayana',
    visitorMobile: '919700223344',
    purpose: 'Location scout — farmhouse shoot',
    source: 'qr',
    status: 'pending',
    createdAt: minutesAgo(8),
    workDate: T0,
  }),
  makeVisit({
    id: 'vis-desk-03',
    ...hostOf('u-lakshmi'),
    visitorName: 'Ananya Gupta',
    visitorMobile: '918977665544',
    purpose: 'Interview — junior editor',
    source: 'qr',
    status: 'no_response',
    createdAt: minutesAgo(26),
    workDate: T0,
  }),
  makeVisit({
    id: 'vis-desk-04',
    ...hostOf('u-priya'),
    visitorName: 'Karthik Reddy',
    visitorMobile: '919912345670',
    purpose: 'Client review — Sunrise Jewellers Diwali film',
    source: 'invite',
    inviteId: 'inv-desk-00',
    status: 'approved',
    createdAt: minutesAgo(95),
    decidedAt: minutesAgo(95),
    decidedVia: 'app',
    decidedBy: 'Priya Sharma',
    workDate: T0,
  }),
  makeVisit({
    id: 'vis-desk-05',
    ...hostOf('u-ramesh'),
    visitorName: 'Venkat (Bharat Courier)',
    visitorMobile: '917702334455',
    purpose: 'Delivery — signed cheques',
    source: 'qr',
    status: 'checked_out',
    createdAt: minutesAgo(210),
    decidedAt: minutesAgo(207),
    decidedVia: 'whatsapp',
    decidedBy: 'Ramesh Gupta',
    checkOutAt: minutesAgo(190),
    workDate: T0,
  }),
  makeVisit({
    id: 'vis-desk-06',
    ...hostOf('u-vikram'),
    visitorName: 'Unknown sales caller',
    visitorMobile: '919123400011',
    purpose: 'Printer leasing offer',
    source: 'kiosk',
    status: 'rejected',
    createdAt: minutesAgo(130),
    decidedAt: minutesAgo(127),
    decidedVia: 'app',
    decidedBy: 'Vikram Singh',
    photoPurged: false,
    workDate: T0,
  }),
];

// ── History: about 60 visits over the last 30 days (deterministic) ────────────
const HOSTS = ['u-naveen', 'u-deepa', 'u-lakshmi', 'u-priya', 'u-ramesh', 'u-vikram', 'u-sanjay', 'u-kiran', 'u-arvind'];
const GUESTS: [string, string, string][] = [
  ['Rohit Kulkarni', '919845011122', 'Client review — Kisan Agro launch film'],
  ['Neha Joshi', '919900334455', 'Interview — motion designer'],
  ['Arjun Das', '918801223344', 'Camera rental return'],
  ['Fatima Begum', '919701556677', 'Voice-over session'],
  ['Mahesh (DTDC)', '917702889900', 'Courier pickup'],
  ['Divya Menon', '919866778899', 'Vendor meeting — studio lights'],
  ['Prakash Rao', '919912003344', 'Payment follow-up'],
  ['Sana Mirza', '918977112233', 'Brand workshop'],
  ['Aditya Varma', '919849556600', 'Music composer meeting'],
  ['Gayathri S', '919000112233', 'Interview — HR executive'],
  ['Kiran Kumar', '917013445566', 'AC servicing'],
  ['Meghana Reddy', '919885667788', 'Client briefing — Nimbus explainers'],
];
const SOURCES = ['qr', 'kiosk', 'invite'] as const;

function history(): Visit[] {
  const out: Visit[] = [];
  for (let n = 1; n <= 30; n++) {
    const day = addDays(T0, -n);
    if (isWeeklyOff(day) && rand(`${day}:w`) < 0.7) continue;
    const count = 1 + Math.floor(rand(`${day}:n`) * 3);
    for (let i = 0; i < count; i++) {
      const seed = `${day}:${i}`;
      const [visitorName, visitorMobile, purpose] = GUESTS[Math.floor(rand(`${seed}:g`) * GUESTS.length)]!;
      const host = HOSTS[Math.floor(rand(`${seed}:h`) * HOSTS.length)]!;
      const inMin = 9 * 60 + 30 + Math.floor(rand(`${seed}:t`) * 8 * 60);
      const roll = rand(`${seed}:s`);
      const status = roll < 0.72 ? 'checked_out' : roll < 0.84 ? 'approved' : roll < 0.94 ? 'rejected' : 'no_response';
      const source = SOURCES[Math.floor(rand(`${seed}:src`) * SOURCES.length)]!;
      const createdAt = istIso(day, inMin);
      const decided = status !== 'no_response';
      const hostName = personById(host)?.name ?? 'Host';
      const viaWa = rand(`${seed}:v`) < 0.35;
      out.push(
        makeVisit({
          id: `vis-log-${day}-${i}`,
          hostUserId: host,
          hostName,
          visitorName,
          visitorMobile,
          purpose,
          source,
          status,
          createdAt,
          workDate: day,
          decidedAt: decided ? istIso(day, inMin + 2) : null,
          decidedVia: decided ? (viaWa ? 'whatsapp' : 'app') : '',
          decidedBy: decided ? (rand(`${seed}:d`) < 0.25 ? 'Afzal Visitor Manager' : hostName) : '',
          checkOutAt: status === 'checked_out' ? istIso(day, inMin + 30 + Math.floor(rand(`${seed}:o`) * 120)) : null,
          // Photos older than the retention period (30 days on the demo company) are purged.
          photoPurged: n >= 28,
        }),
      );
    }
  }
  return out;
}

// Seed once (Fast Refresh may re-run this module: never add twice).
if (!visitStore.some((v) => v.id === 'vis-desk-01')) visitStore.push(...TODAY, ...history());

// An invitation for today, so the desk's Invites (and the wave-2 kiosk's invite code) has one due now.
const KAVYA: Invite = {
  id: 'inv-desk-01',
  guestName: 'Kavya Reddy',
  guestMobile: '919848215263',
  visitDate: T0,
  timeFrom: '15:00',
  timeTo: '16:00',
  purpose: 'Portfolio review — freelance editor',
  code: '482615',
  status: 'active',
  usedAt: null,
  createdAt: minutesAgo(60 * 20),
};
if (!inviteStore.some((i) => i.id === KAVYA.id)) inviteStore.unshift(KAVYA);

// ── Handlers ─────────────────────────────────────────────────────────────────
const isDesk = () => VISIT_DESK_ROLES.includes(currentPersona().role);
const deskOnly = () => fail('You do not have permission to manage visitors.', 403);
const newest = (a: Visit, b: Visit) => b.createdAt.localeCompare(a.createdAt);
const workDateOf = (v: Visit) => v.workDate || istDateOf(v.createdAt);
const STATUSES = ['pending', 'approved', 'rejected', 'no_response', 'checked_out'];
const ymd = (v: string | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

function todayBoard() {
  const rows = visitStore.filter((v) => workDateOf(v) === today()).sort(newest);
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return {
    ok: true,
    visits: rows,
    stats: {
      total: rows.length,
      waiting: count('pending'),
      inside: rows.filter((r) => r.status === 'approved' && !r.checkOutAt).length,
      rejected: count('rejected'),
      noResponse: count('no_response'),
    },
  };
}

function log(query: URLSearchParams) {
  const from = ymd(query.get('from'));
  const to = ymd(query.get('to'));
  const status = String(query.get('status') || '');
  const needle = String(query.get('q') || '').trim().slice(0, 60).toLowerCase();
  const rows = visitStore
    .filter((v) => (!from || workDateOf(v) >= from) && (!to || workDateOf(v) <= to))
    .filter((v) => !STATUSES.includes(status) || v.status === status)
    .sort(newest)
    .slice(0, 2000)
    .filter((v) => !needle || [v.visitorName, v.visitorMobile, v.hostName, v.purpose].some((x) => String(x || '').toLowerCase().includes(needle)));
  return { ok: true, visits: rows };
}

function checkOut(id: string) {
  const v = visitStore.find((x) => x.id === id);
  if (!v) return fail('Visit not found.', 404);
  if (v.checkOutAt) return fail('That visitor is already checked out.', 409);
  Object.assign(v, { status: 'checked_out', checkOutAt: nowIso() });
  return { ok: true, id: v.id, status: 'checked_out' };
}

function decide(id: string, body: unknown) {
  const decision = (body as { decision?: unknown })?.decision;
  if (decision !== 'approve' && decision !== 'reject') return fail('Say approve or reject.');
  const v = visitStore.find((x) => x.id === id);
  if (!v) return fail('Visit not found.', 404);
  const isHost = v.hostUserId === DEMO_USER.id;
  if (!isHost && !isDesk()) return fail('Only the person being visited can decide this.', 403);
  if (v.status !== 'pending' && v.status !== 'no_response') return fail(`This visit was already ${String(v.status).replace('_', ' ')}.`, 409);
  Object.assign(v, { status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: nowIso(), decidedVia: 'app', decidedBy: String(DEMO_USER.name) });
  return { ok: true, id: v.id, status: v.status };
}

let token = 'demo-qr-token';
let rotations = 0;
const qrPath = () => `/visit/${DEMO_TENANT_ID}/${token}`;

export const deskRoutes: Route[] = [
  ['GET', /^\/visitors\/today$/, () => (isDesk() ? todayBoard() : deskOnly())],
  ['GET', /^\/visitors\/log$/, (_p, _b, query) => (isDesk() ? log(query) : deskOnly())],
  ['POST', /^\/visitors\/([^/]+)\/check-out$/, ([, id]) => (isDesk() ? checkOut(id!) : deskOnly())],
  ['POST', /^\/visitors\/([^/]+)\/decide$/, ([, id], body) => decide(id!, body)],
  ['GET', /^\/visitors\/qr$/, () => (isDesk() ? { ok: true, tenantId: DEMO_TENANT_ID, token, path: qrPath(), companyName: TENANT.name ?? 'Tamada Media' } : deskOnly())],
  [
    'POST',
    /^\/visitors\/qr\/regenerate$/,
    () => {
      if (!isDesk()) return fail('You do not have permission to regenerate the visitor QR.', 403);
      rotations += 1;
      token = `demo-qr-${rotations}`;
      return { ok: true, token, path: qrPath() };
    },
  ],
  [
    'POST',
    /^\/visitors\/kiosk\/exit$/,
    (_p, body) => {
      if (!isDesk()) return deskOnly();
      const pw = String((body as { password?: unknown })?.password ?? '');
      if (!pw) return fail('Enter your password to exit kiosk mode.', 400);
      return pw === DEMO_PASSWORD ? { ok: true } : fail('That password is not right.', 403);
    },
  ],
];

/** The current demo check-in token (for the wave-2 kiosk's public routes: an old token must 404). */
export const deskQrToken = () => token;
