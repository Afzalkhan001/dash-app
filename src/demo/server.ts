// A tiny in-memory stand-in for the DASH API, used only by the demo account (see demo/config.ts).
// apiFetch hands every request made with the demo token to demoFetch() instead of the network.
//
// Each area of the app has its own fixture file under demo/fixtures/ exporting a routes array of
// [method, pattern, handler] (the type lives in demo/state.ts). Response shapes mirror the real
// handlers (hr*.js, reimbursements.js, visitors.js, routes/*.js, server.js) and are built from the
// app's own exported API types, so `tsc` checks that every screen gets what it reads. Writes change
// the in-memory state, so the main flows can be tried end to end; everything resets when the app
// restarts.
//
// Roles (demo/personas.ts): the request's token names the persona ("demo-session-token:hr"), which is
// applied before the fixtures answer, so the role survives a restart with no extra storage. The
// fixtures store the demo person once, as DEMO_USER ('demo-user', 'Afzal Employee'); this file shows
// that id and name as the persona's ('demo-hr', 'Afzal HR') in every response and maps them back in
// every path, query and body, so "my" records follow whichever role is being explored.
//
// EXTENSION POINT (Wave 0, docs/port/EXTENSION-POINTS.md §10): the domains' fixtures come in through
// one barrel (demo/fixtures/index.ts → domainRoutes), placed in front of the built-in fixtures so a
// domain's handlers win. This file does not change when a domain adds routes. Methods: GET, POST, PUT,
// PATCH, DELETE (demo/state Method).

import { announcementRoutes } from '@/demo/fixtures/announcements';
import { attendanceRoutes } from '@/demo/fixtures/attendance';
import { bountyRoutes } from '@/demo/fixtures/bounty';
import { inboxRoutes } from '@/demo/fixtures/inbox';
import { leaveRoutes } from '@/demo/fixtures/leave';
import { orgRoutes } from '@/demo/fixtures/org';
import { payRoutes } from '@/demo/fixtures/pay';
import { pettyCashRoutes } from '@/demo/fixtures/petty-cash';
import { policyRoutes } from '@/demo/fixtures/policies';
import { reimbursementRoutes } from '@/demo/fixtures/reimbursements';
import { supportRoutes } from '@/demo/fixtures/support';
import { taskRoutes } from '@/demo/fixtures/tasks';
import { visitorRoutes } from '@/demo/fixtures/visitors';
import { DEMO_USER } from '@/demo/config';
import { domainRoutes } from '@/demo/fixtures/index';
import { applyPersona, currentPersona, personaFromToken, selfAs } from '@/demo/personas';
import { type Handler, type Method, type Route } from '@/demo/state';
import { vendorRoutes } from '@/demo/vendor/routes';

// Domain routes first: they win over the built-in ones (PLAN §2.1.4).
const routes: Route[] = [
  ...domainRoutes,
  ...orgRoutes,
  ...attendanceRoutes,
  ...leaveRoutes,
  ...inboxRoutes,
  ...payRoutes,
  ...policyRoutes,
  ...announcementRoutes,
  ...visitorRoutes,
  ...reimbursementRoutes,
  ...supportRoutes,
  ...taskRoutes,
  ...bountyRoutes,
  ...pettyCashRoutes,
];

// Routes whose real handler answers a bare array (getAll and friends). Only these fall back to [];
// every other unknown request gets a plain `{ ok: true }` object — never an Array carrying `ok`,
// whose prototype methods (entries, keys, find…) would read as fields to code expecting an object.
// The second line is the bare-array lists the ported domains read (getAll, or a handler that answers
// `res.json(rows)`: rooms.js, locations.js, room_purposes.js, slot_bookings.js, whitelist.js, assets.js,
// server.js holds / time_corrections / job_openings / referrals / bounty_entries, prof_reviews.js,
// upload_batches.js).
const LIST_ROUTE = new RegExp(
  '^/(' +
    'users|tenants|departments|projects|org/directory|leaves|tasks|bookings|clients|tickets|support_branches|support_wifi|support_staff|support_temp_staff|announcements|my_pending_otps|bounty_tasks|bounty_tasks/my_claims|bounty_transactions|bounty_redemptions|petty_cash_requests|petty_cash_bills|petty_cash_departments' +
    '|rooms|locations|room_purposes|room_slot_bookings|loc_time_bookings|holds|whitelist|time_corrections|assets|job_openings|referrals|bounty_entries|prof_reviews|upload_batches' +
    ')$',
);

const safeDecode = (s: string | undefined) => {
  if (s === undefined) return '';
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

// Every fixture has registered for persona switches by now: settle the starting persona once.
applyPersona(currentPersona());

// The demo person's stored id/name ⇄ the persona's. Exact string values only, never parts of text.
type Swap = (s: string) => string;
function swaps(): { inbound: Swap; outbound: Swap } | null {
  const me = selfAs();
  const store = { id: DEMO_USER.id, name: String(DEMO_USER.name) };
  if (me.id === store.id && me.name === store.name) return null;
  return {
    inbound: (s) => (s === me.id ? store.id : s === me.name ? store.name : s),
    outbound: (s) => (s === store.id ? me.id : s === store.name ? me.name : s),
  };
}

// A deep copy (responses are always copies, so nothing the app does to a result reaches the demo's
// state) with every string value passed through `swap`.
const copyWith = <T>(x: T, swap?: Swap): T =>
  x === undefined ? x : JSON.parse(JSON.stringify(x), swap ? (_k, v) => (typeof v === 'string' ? swap(v) : v) : undefined);

function mapPath(path: string, swap: Swap) {
  return path
    .split('/')
    .map((seg) => {
      const raw = safeDecode(seg);
      const next = swap(raw);
      return next === raw ? seg : encodeURIComponent(next);
    })
    .join('/');
}

/** The token of the request being answered (vendor fixtures read their persona from it). */
let requestToken: string | null = null;
export const demoRequestToken = () => requestToken;

export async function demoFetch(method: string, rawPath: string, body: unknown, token?: string | null): Promise<any> {
  await new Promise((r) => setTimeout(r, 120 + Math.floor(Math.random() * 120))); // feel like a network call
  requestToken = token ?? null;
  // The token names the role; switching it here (not only in the picker) keeps a restored session right.
  const persona = personaFromToken(token);
  if (persona) applyPersona(persona);
  const swap = swaps();
  const [path0 = '', qs] = rawPath.split('?') as [string, string | undefined];
  const path = swap ? mapPath(path0, swap.inbound) : path0;
  const query = new URLSearchParams(qs || '');
  if (swap) for (const [k, v] of [...query.entries()]) query.set(k, swap.inbound(v));
  const input = swap ? copyWith(body ?? {}, swap.inbound) : body ?? {};
  for (const [mth, re, handler] of routes) {
    if (mth !== method) continue;
    const m = re.exec(path);
    if (!m) continue;
    try {
      const out = handler(Array.from(m, (x, i) => (i === 0 ? x : safeDecode(x))), input, query);
      return out === undefined ? { ok: true } : copyWith(out, swap?.outbound);
    } catch (e) {
      if (__DEV__) console.warn('[demo] fixture failed for', method, path, e);
      return { error: 'The demo could not answer that request.', status: 500 };
    }
  }
  if (__DEV__) console.warn('[demo] no fixture for', method, path);
  if (method !== 'GET') return { ok: true };
  return LIST_ROUTE.test(path) ? [] : { ok: true };
}

// Lets other code add routes without editing the fixture files (they win over the built-in ones).
export function registerDemoRoutes(extra: [Method, RegExp, Handler][]) {
  routes.unshift(...extra);
}

// The vendor portal's demo (demo/vendor/*): its routes read the vendor persona from the request's token.
registerDemoRoutes(vendorRoutes(demoRequestToken));
