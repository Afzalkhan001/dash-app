// Demo API for the visitor desk (visitors.js DESK section :556-665, docs/port/visitor-desk.md §6).
// Tenant-wide visits live in the ONE shared visit store (fixtures/visitors.ts visitStore), so the desk
// and the hosts agree: a host's Let in shows on the board, and the desk's answer reaches the host. This
// file adds today's walk-ins for other hosts and ~30 days of history, plus one invitation for today.
//
//   GET  /visitors/today             today's visits (IST work date) + stats (with letIn), serverNow, letInAfterMin
//   GET  /visitors/log               from / to (work date), status, by (host | desk | override), q (name, mobile,
//                                    host, reason, who decided), ≤ 2000
//   POST /visitors/:id/check-out     404 unknown · 409 "That visitor is already checked out."
//   POST /visitors/:id/decide        the host ('app'), or a desk role (else 403): turn away any time ('desk'),
//                                    let in only after 5 minutes (else the server's 409 "Give <host> a chance to
//                                    answer first …" + waitMoreMin, letInAfterMin), then 'desk_override'; 409 once
//                                    decided; recorded as the signed-in person (DEMO_USER, shown as the persona)
//   GET  /visitors/kiosk/board       the lobby board: waiting + answered in the last 5 min (short names only)
//   GET  /visitors/qr                { tenantId, token, path, companyName }
//   POST /visitors/qr/regenerate     rotates the token (demo-qr-<n>)
//   POST /visitors/kiosk/exit        demo password Demo@123
// The desk routes answer 403 to anyone but visitor_manager / super_admin, like requireRole(DESK_ROLES).
//
// Kiosk mode calls the PUBLIC check-in routes (visitors.js:305-530), answered here too. They check the
// company and the CURRENT token (so "Make a new link" visibly breaks a running demo kiosk with the
// server's 404), and a check-in lands in the shared visit store, so it shows on the board at once:
//   GET  /public/visit/:t/:token/employees?q        >= 2 letters, name only, <= 25 (+ companyName)
//   POST /public/visit/:t/:token                    the server's checks and words; a pending visit
//   GET  /public/visit/:t/:token/status/:id         the host "answers" ~20 s after arrival (turned away
//                                                   when the visitor's name has "test" in it), unless
//                                                   the desk or the host answered first. The kiosk frees
//                                                   itself after 12 s, so the board (which runs the same
//                                                   answer) announces it.
//   POST /public/visit/:t/:token/invite             today's code (Kavya Reddy: 482615)
//   POST /public/visit/:t/:token/invite/:id/arrive  an approved 'invite' visit; the invite is used

import type { Invite, Visit } from '@/api/visitors';
import { DEMO_PASSWORD, DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { allPeople, personById, TENANT } from '@/demo/fixtures/org';
import { inviteStore, LET_IN_AFTER_MIN, makeVisit, shapeVisit, visitStore } from '@/demo/fixtures/visitors';
import { currentPersona } from '@/demo/personas';
import { addDays, fail, isWeeklyOff, istDateOf, istIso, minutesAgo, newId, nowIso, rand, today, type Route } from '@/demo/state';
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
  // Nobody answered for Deepa, so the desk let the visitor in after the wait (stats.letIn).
  makeVisit({
    id: 'vis-desk-07',
    ...hostOf('u-deepa'),
    visitorName: 'Imran Shaikh',
    visitorMobile: '919959012233',
    purpose: 'Lens repair pickup',
    source: 'kiosk',
    status: 'approved',
    createdAt: minutesAgo(48),
    decidedAt: minutesAgo(41),
    decidedVia: 'desk_override',
    decidedBy: 'Afzal Visitor Manager',
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
      // About a quarter were answered at the desk: a turn-away is 'desk'; a let-in came after the host's
      // 5 minutes ran out ('desk_override', 6-14 minutes after arrival).
      const byDesk = decided && rand(`${seed}:d`) < 0.25;
      const override = byDesk && status !== 'rejected';
      const answeredAfter = override ? 6 + Math.floor(rand(`${seed}:w`) * 9) : 2;
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
          decidedAt: decided ? istIso(day, inMin + answeredAfter) : null,
          decidedVia: !decided ? '' : override ? 'desk_override' : byDesk ? 'desk' : viaWa ? 'whatsapp' : 'app',
          decidedBy: decided ? (byDesk ? 'Afzal Visitor Manager' : hostName) : '',
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
  settleKioskArrivals();
  const rows = visitStore.filter((v) => workDateOf(v) === today()).sort(newest);
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return {
    ok: true,
    visits: rows.map(shapeVisit),
    stats: {
      total: rows.length,
      waiting: count('pending'),
      inside: rows.filter((r) => r.status === 'approved' && !r.checkOutAt).length,
      rejected: count('rejected'),
      noResponse: count('no_response'),
      letIn: rows.filter((r) => r.decidedVia === 'desk_override').length,
    },
    serverNow: nowIso(),
    letInAfterMin: LET_IN_AFTER_MIN,
  };
}

// The lobby board (visitors.js /visitors/kiosk/board): "First L.", the host's first name, a status, a time.
const shortName = (n: string) => {
  const p = String(n || '').trim().split(/\s+/).filter(Boolean);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]![0]!.toUpperCase()}.` : p[0] || 'Visitor';
};
const firstOf = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';
const BOARD_RECENT_MS = 5 * 60 * 1000;

function kioskBoard() {
  settleKioskArrivals();
  const now = Date.now();
  const rows = visitStore.filter((v) => workDateOf(v) === today()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const waiting = rows.filter((r) => r.status === 'pending').map((r) => ({ id: r.id, name: shortName(r.visitorName), host: firstOf(r.hostName), createdAt: r.createdAt }));
  const recent = rows
    .filter((r) => ['approved', 'rejected', 'no_response'].includes(String(r.status)) && !r.checkOutAt)
    .map((r) => ({ r, at: r.decidedAt || r.createdAt }))
    .filter((x) => now - Date.parse(x.at) <= BOARD_RECENT_MS)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map((x) => ({ id: x.r.id, name: shortName(x.r.visitorName), host: firstOf(x.r.hostName), status: x.r.status, at: x.at, letIn: x.r.decidedVia === 'desk_override' }));
  return { ok: true, waiting, recent, serverNow: nowIso() };
}

function log(query: URLSearchParams) {
  const from = ymd(query.get('from'));
  const to = ymd(query.get('to'));
  const status = String(query.get('status') || '');
  const by = String(query.get('by') || '');
  const byOk = (v: Visit) =>
    !by ||
    (by === 'host'
      ? ['app', 'whatsapp'].includes(String(v.decidedVia))
      : by === 'desk'
        ? ['desk', 'desk_override'].includes(String(v.decidedVia))
        : by === 'override'
          ? v.decidedVia === 'desk_override'
          : true);
  const needle = String(query.get('q') || '').trim().slice(0, 60).toLowerCase();
  const rows = visitStore
    .filter((v) => (!from || workDateOf(v) >= from) && (!to || workDateOf(v) <= to))
    .filter((v) => !STATUSES.includes(status) || v.status === status)
    .sort(newest)
    .slice(0, 2000)
    .filter((v) => byOk(v) && (!needle || [v.visitorName, v.visitorMobile, v.hostName, v.purpose, v.decidedBy].some((x) => String(x || '').toLowerCase().includes(needle))));
  return { ok: true, visits: rows.map(shapeVisit), letInAfterMin: LET_IN_AFTER_MIN };
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
  // The host's own answer is 'app'; the desk may turn away at any time ('desk') but let in only after the
  // host's LET_IN_AFTER_MIN minutes ('desk_override') — the server checks that before "already decided".
  let via = 'app';
  if (!isHost) {
    via = 'desk';
    if (decision === 'approve') {
      const waitedMs = Date.now() - Date.parse(v.createdAt);
      if (waitedMs < LET_IN_AFTER_MIN * 60_000) {
        const left = Math.ceil((LET_IN_AFTER_MIN * 60_000 - waitedMs) / 60_000);
        return {
          ...fail(`Give ${v.hostName || 'the host'} a chance to answer first - you can let this visitor in after ${LET_IN_AFTER_MIN} minutes (about ${left} more).`, 409),
          waitMoreMin: left,
          letInAfterMin: LET_IN_AFTER_MIN,
        };
      }
      via = 'desk_override';
    }
  }
  if (v.status !== 'pending' && v.status !== 'no_response') return fail(`This visit was already ${String(v.status).replace('_', ' ')}.`, 409);
  Object.assign(v, { status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: nowIso(), decidedVia: via, decidedBy: String(DEMO_USER.name) });
  return { ok: true, id: v.id, status: v.status, via };
}

let token = 'demo-qr-token';
let rotations = 0;
const qrPath = () => `/visit/${DEMO_TENANT_ID}/${token}`;

export const deskRoutes: Route[] = [
  ['GET', /^\/visitors\/today$/, () => (isDesk() ? todayBoard() : deskOnly())],
  ['GET', /^\/visitors\/log$/, (_p, _b, query) => (isDesk() ? log(query) : deskOnly())],
  ['POST', /^\/visitors\/([^/]+)\/check-out$/, ([, id]) => (isDesk() ? checkOut(id!) : deskOnly())],
  ['POST', /^\/visitors\/([^/]+)\/decide$/, ([, id], body) => decide(id!, body)],
  ['GET', /^\/visitors\/kiosk\/board$/, () => (isDesk() ? kioskBoard() : deskOnly())],
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
      return pw === DEMO_PASSWORD ? { ok: true } : fail(`That password is not right. The demo password is ${DEMO_PASSWORD}.`, 403);
    },
  ],
];

/** The current demo check-in token (an old token must 404 on the public routes). */
export const deskQrToken = () => token;

// ── Public check-in (kiosk) ──────────────────────────────────────────────────
const BAD_LINK = 'This check-in link is not valid. Ask the security desk for the current QR code.';
const linkOk = (tid?: string, tok?: string) => decodeURIComponent(tid ?? '') === DEMO_TENANT_ID && decodeURIComponent(tok ?? '') === token;
const companyName = () => TENANT.name ?? 'Tamada Media';
const clip = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
/** normalizeWaPhone: digits; a 10-digit Indian number gets 91, a leading 0 is dropped. */
function waPhone(v: unknown) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? `91${d}` : d;
}
const MAX_PHOTO = 600 * 1024; // visitors.js MAX_PHOTO_BYTES
function photoProblem(photo: unknown) {
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(String(photo || ''));
  if (!m) return 'The photo could not be read. Take it again.';
  const bytes = Math.floor((m[2]!.length * 3) / 4);
  if (!bytes) return 'The photo was empty. Take it again.';
  if (bytes > MAX_PHOTO) return 'That photo is too large. Take it again.';
  return '';
}
// The demo "host" answers this long after a kiosk check-in, if nobody has answered yet: after the kiosk has
// freed itself (12 s), so the answer shows on the kiosk's board.
const HOST_ANSWERS_AFTER_MS = 20_000;
const kioskArrivals = new Map<string, number>();

/** Lets the demo hosts answer every kiosk check-in that has waited long enough (the polls and the board). */
function settleKioskArrivals() {
  for (const [id, at] of kioskArrivals) {
    const v = visitStore.find((x) => x.id === id);
    if (!v || v.status !== 'pending') {
      kioskArrivals.delete(id);
      continue;
    }
    if (Date.now() - at < HOST_ANSWERS_AFTER_MS) continue;
    const approve = !/test/i.test(v.visitorName);
    Object.assign(v, { status: approve ? 'approved' : 'rejected', decidedAt: nowIso(), decidedVia: 'whatsapp', decidedBy: v.hostName });
    kioskArrivals.delete(id);
  }
}

function findHosts(query: URLSearchParams) {
  const q = clip(query.get('q'), 60).toLowerCase();
  if (q.length < 2) return { ok: true, employees: [], companyName: companyName() };
  const employees = allPeople()
    .filter((u) => u.name && String(u.resigned) !== 'true' && u.status !== 'inactive' && !['master_admin', 'announcement_viewer'].includes(String(u.role)))
    .filter((u) => String(u.name).toLowerCase().includes(q))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .slice(0, 25)
    .map((u) => ({ id: u.id, name: u.name, jobTitle: u.jobTitle || '', dept: u.dept || '', hasAvatar: false }));
  return { ok: true, employees, companyName: companyName() };
}

function publicCheckIn(body: unknown) {
  const b = (body || {}) as Record<string, unknown>;
  const visitorName = clip(b.visitorName, 120);
  const visitorMobile = waPhone(b.visitorMobile);
  const purpose = clip(b.purpose, 200);
  if (!visitorName) return fail('Your name is required.');
  if (visitorMobile.length < 10 || visitorMobile.length > 15) return fail('A valid mobile number is required so we can send you the result.');
  if (!purpose) return fail('Tell us the purpose of your visit.');
  if (b.consent !== true) return fail('Please accept the photo and WhatsApp consent to continue.');
  const host = personById(clip(b.hostUserId, 80));
  if (!host) return fail('Choose who you are here to meet.');
  const bad = photoProblem(b.photo);
  if (bad) return fail(bad);
  const id = newId('vis');
  visitStore.push(
    makeVisit({
      id,
      hostUserId: host.id,
      hostName: host.name,
      visitorName,
      visitorMobile,
      purpose,
      source: b.source === 'kiosk' ? 'kiosk' : 'qr',
      status: 'pending',
      createdAt: nowIso(),
      workDate: today(),
      // The demo keeps the selfie in memory so the board shows the face, as the real one does.
      photoUrl: String(b.photo),
    }),
  );
  kioskArrivals.set(id, Date.now());
  return { ok: true, visitId: id, status: 'pending', hostName: host.name, hostHasMobile: true };
}

function publicStatus(id: string) {
  const v = visitStore.find((x) => x.id === id);
  if (!v) return fail('Visit not found.', 404);
  settleKioskArrivals();
  return { ok: true, status: v.status, hostName: v.hostName };
}

function publicInvite(body: unknown) {
  const code = clip((body as { code?: unknown })?.code, 10).replace(/\D/g, '');
  if (code.length !== 6) return fail('Enter the 6-digit code from your invitation.');
  const inv = inviteStore.find((i) => i.code === code && i.visitDate === today());
  if (!inv) return fail('That code is not valid for today. Please check with your host.', 404);
  if (inv.status === 'used') return fail('That code has already been used.', 409);
  if (inv.status === 'cancelled') return fail('That invitation was cancelled. Please contact your host.', 409);
  return { ok: true, inviteId: inv.id, guestName: inv.guestName, hostName: String(DEMO_USER.name), timeFrom: inv.timeFrom ?? '', timeTo: inv.timeTo ?? '' };
}

function publicArrive(inviteId: string, body: unknown) {
  const inv = inviteStore.find((i) => i.id === inviteId);
  if (!inv) return fail('That invitation no longer exists.', 404);
  if (inv.status !== 'active') return fail('That invitation is no longer active.', 409);
  if (inv.visitDate !== today()) return fail('That invitation is not valid today.', 409);
  const photo = (body as { photo?: unknown })?.photo;
  const bad = photoProblem(photo);
  if (bad) return fail(bad);
  const id = newId('vis');
  const hostName = String(DEMO_USER.name);
  visitStore.push(
    makeVisit({
      id,
      visitorName: inv.guestName,
      visitorMobile: inv.guestMobile || '',
      purpose: inv.purpose || 'Invited guest',
      source: 'invite',
      inviteId: inv.id,
      status: 'approved',
      createdAt: nowIso(),
      decidedAt: nowIso(),
      decidedVia: 'app',
      decidedBy: hostName,
      workDate: today(),
      photoUrl: String(photo),
    }),
  );
  Object.assign(inv, { status: 'used', usedAt: nowIso() });
  return { ok: true, visitId: id, status: 'approved', hostName };
}

const pub = (rest: string) => new RegExp(`^\\/public\\/visit\\/([^/]+)\\/([^/]+)${rest}$`);
type PubHandler = (p: string[], body: unknown, query: URLSearchParams) => unknown;
/** requirePublicTenant: a wrong company or an old token both get the same 404. */
const guarded = (h: PubHandler): PubHandler => (p, body, query) => (linkOk(p[1], p[2]) ? h(p, body, query) : fail(BAD_LINK, 404));

deskRoutes.push(
  ['GET', pub('\\/employees'), guarded((_p, _b, query) => findHosts(query))],
  ['GET', pub('\\/status\\/([^/]+)'), guarded((p) => publicStatus(decodeURIComponent(p[3]!)))],
  ['POST', pub('\\/invite'), guarded((_p, body) => publicInvite(body))],
  ['POST', pub('\\/invite\\/([^/]+)\\/arrive'), guarded((p, body) => publicArrive(decodeURIComponent(p[3]!), body))],
  ['POST', pub(''), guarded((_p, body) => publicCheckIn(body))],
);
