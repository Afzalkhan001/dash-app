// The domain registry: every domain's extension-point files, imported once, so the shared screens
// (More, the + sheet, Home, Inbox, the tour) pick up a domain's work without anyone editing them
// (docs/port/PLAN.md §2.1.3, docs/port/EXTENSION-POINTS.md). Integrator-owned.
//
// Each domain has, under src/features/<domain>/ (created as stubs in Wave 0):
//   nav.ts     workspaceRows(access) · createActions(access) · homeCards(access)
//   inbox.ts   inboxKinds: InboxKindPlugin[]
//   tour.ts    tourSteps(ctx)
//   access.ts  its own gates (not read here)
// and src/demo/fixtures/<domain>.ts exporting <domain>Routes (read by demo/fixtures/index.ts).
//
// Consumers: features/more/workspace.ts (domainWorkspaceRows), features/create/create-sheet.tsx
// (domainCreateActions), app/(app)/(tabs)/index.tsx (domainHomeCards), features/inbox/use-inbox.ts and
// the Inbox routes (inboxPlugins / inboxPlugin), features/tour/role-tours.ts (domainTourSteps).
//
// Adding a NEW domain (integrator only): copy any domain's four stub
// files, add its three imports and one line to DOMAINS below, and add its fixture to the barrel.
// Domains are listed in the order their + actions should appear (PLAN §2.5): work, booking, chat,
// servicedesk, itdesk, desk, then the rest.

import * as workInbox from '@/features/work/inbox';
import * as workNav from '@/features/work/nav';
import * as workTour from '@/features/work/tour';
import * as bookingInbox from '@/features/booking/inbox';
import * as bookingNav from '@/features/booking/nav';
import * as bookingTour from '@/features/booking/tour';
import * as chatInbox from '@/features/chat/inbox';
import * as chatNav from '@/features/chat/nav';
import * as chatTour from '@/features/chat/tour';
import * as servicedeskInbox from '@/features/servicedesk/inbox';
import * as servicedeskNav from '@/features/servicedesk/nav';
import * as servicedeskTour from '@/features/servicedesk/tour';
import * as itdeskInbox from '@/features/itdesk/inbox';
import * as itdeskNav from '@/features/itdesk/nav';
import * as itdeskTour from '@/features/itdesk/tour';
import * as deskInbox from '@/features/desk/inbox';
import * as deskNav from '@/features/desk/nav';
import * as deskTour from '@/features/desk/tour';
import * as peopleInbox from '@/features/people/inbox';
import * as peopleNav from '@/features/people/nav';
import * as peopleTour from '@/features/people/tour';
import * as hrtimeInbox from '@/features/hrtime/inbox';
import * as hrtimeNav from '@/features/hrtime/nav';
import * as hrtimeTour from '@/features/hrtime/tour';
import * as accountsInbox from '@/features/accounts/inbox';
import * as accountsNav from '@/features/accounts/nav';
import * as accountsTour from '@/features/accounts/tour';
import * as companyInbox from '@/features/company/inbox';
import * as companyNav from '@/features/company/nav';
import * as companyTour from '@/features/company/tour';
import * as signinInbox from '@/features/signin/inbox';
import * as signinNav from '@/features/signin/nav';
import * as signinTour from '@/features/signin/tour';
import * as teamboardInbox from '@/features/teamboard/inbox';
import * as teamboardNav from '@/features/teamboard/nav';
import * as teamboardTour from '@/features/teamboard/tour';
import * as insightsInbox from '@/features/insights/inbox';
import * as insightsNav from '@/features/insights/nav';
import * as insightsTour from '@/features/insights/tour';
import * as payrollInbox from '@/features/payroll/inbox';
import * as payrollNav from '@/features/payroll/nav';
import * as payrollTour from '@/features/payroll/tour';
import * as hiringInbox from '@/features/hiring/inbox';
import * as hiringNav from '@/features/hiring/nav';
import * as hiringTour from '@/features/hiring/tour';
import * as newsroomInbox from '@/features/newsroom/inbox';
import * as newsroomNav from '@/features/newsroom/nav';
import * as newsroomTour from '@/features/newsroom/tour';
import * as bountyadminInbox from '@/features/bountyadmin/inbox';
import * as bountyadminNav from '@/features/bountyadmin/nav';
import * as bountyadminTour from '@/features/bountyadmin/tour';
import * as platformInbox from '@/features/platform/inbox';
import * as platformNav from '@/features/platform/nav';
import * as platformTour from '@/features/platform/tour';
import * as pushInbox from '@/features/push/inbox';
import * as pushNav from '@/features/push/nav';
import * as pushTour from '@/features/push/tour';
import * as callsInbox from '@/features/calls/inbox';
import * as callsNav from '@/features/calls/nav';
import * as callsTour from '@/features/calls/tour';

import type { Access, CreateAction, DomainTourCtx, HomeCard, InboxKindPlugin, TourStep, WorkspaceRow } from '@/features/plugin-types';

type NavModule = {
  workspaceRows?: (access: Access) => WorkspaceRow[];
  createActions?: (access: Access) => CreateAction[];
  homeCards?: (access: Access) => HomeCard[];
};
type InboxModule = { inboxKinds?: InboxKindPlugin[] };
type TourModule = { tourSteps?: (ctx: DomainTourCtx) => TourStep[] };
type Domain = { domain: string; nav: NavModule; inbox: InboxModule; tour: TourModule };

// Registry order = the order of create actions, Workspace rows and tour steps when `order` ties.
// The modules are read when called, never at load time, so an import cycle through a domain file
// (a Home card that reads the Inbox, say) cannot leave a list half-built.
const DOMAINS: Domain[] = [
  { domain: 'work', nav: workNav, inbox: workInbox, tour: workTour },
  { domain: 'booking', nav: bookingNav, inbox: bookingInbox, tour: bookingTour },
  { domain: 'chat', nav: chatNav, inbox: chatInbox, tour: chatTour },
  { domain: 'servicedesk', nav: servicedeskNav, inbox: servicedeskInbox, tour: servicedeskTour },
  { domain: 'itdesk', nav: itdeskNav, inbox: itdeskInbox, tour: itdeskTour },
  { domain: 'desk', nav: deskNav, inbox: deskInbox, tour: deskTour },
  { domain: 'people', nav: peopleNav, inbox: peopleInbox, tour: peopleTour },
  { domain: 'hrtime', nav: hrtimeNav, inbox: hrtimeInbox, tour: hrtimeTour },
  { domain: 'accounts', nav: accountsNav, inbox: accountsInbox, tour: accountsTour },
  { domain: 'company', nav: companyNav, inbox: companyInbox, tour: companyTour },
  { domain: 'signin', nav: signinNav, inbox: signinInbox, tour: signinTour },
  { domain: 'teamboard', nav: teamboardNav, inbox: teamboardInbox, tour: teamboardTour },
  { domain: 'insights', nav: insightsNav, inbox: insightsInbox, tour: insightsTour },
  { domain: 'payroll', nav: payrollNav, inbox: payrollInbox, tour: payrollTour },
  { domain: 'hiring', nav: hiringNav, inbox: hiringInbox, tour: hiringTour },
  { domain: 'newsroom', nav: newsroomNav, inbox: newsroomInbox, tour: newsroomTour },
  { domain: 'bountyadmin', nav: bountyadminNav, inbox: bountyadminInbox, tour: bountyadminTour },
  { domain: 'platform', nav: platformNav, inbox: platformInbox, tour: platformTour },
  { domain: 'push', nav: pushNav, inbox: pushInbox, tour: pushTour },
  { domain: 'calls', nav: callsNav, inbox: callsInbox, tour: callsTour },
];

export const DOMAIN_NAMES = DOMAINS.map((d) => d.domain);

// One domain's mistake must not take More, Home, the + sheet or the tour down with it.
function collect<T>(what: string, run: (d: Domain) => T[] | undefined | null): T[] {
  const out: T[] = [];
  for (const d of DOMAINS) {
    try {
      const got = run(d);
      if (Array.isArray(got)) for (const x of got) if (x && typeof x === 'object') out.push(x);
    } catch (e) {
      if (__DEV__) console.warn(`[domains] ${d.domain} ${what} failed`, e);
    }
  }
  return out;
}

const byOrder = <T extends { order?: number }>(list: T[]) =>
  list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (a.x.order ?? 100) - (b.x.order ?? 100) || a.i - b.i)
    .map(({ x }) => x);

// Keys must be unique app-wide: the first one wins, a duplicate is dropped (and reported in development).
function uniqueBy<T extends { key: string }>(what: string, list: T[], reserved: readonly string[] = []): T[] {
  const seen = new Set<string>(reserved);
  return list.filter((x) => {
    if (typeof x.key !== 'string' || !x.key || seen.has(x.key)) {
      if (__DEV__) console.warn(`[domains] ${what}: key "${String(x.key)}" is missing, reserved or used twice — dropped`);
      return false;
    }
    seen.add(x.key);
    return true;
  });
}

/** More › Workspace rows for this person, every domain, sorted by `order` (features/more/workspace groups them). */
export function domainWorkspaceRows(access: Access): WorkspaceRow[] {
  return uniqueBy('workspace row', byOrder(collect('workspaceRows', (d) => d.nav.workspaceRows?.(access))));
}

// ── Integrator order (PLAN §2.5, pass 1) ─────────────────────────────────────
// The domains' own `order` sorts inside a domain; these lists fix the order ACROSS domains. A key not
// listed keeps its domain's `order`, after the listed ones.

/** + sheet, after the built-in 8: Assign task, Book, New chat, Raise for someone, Add asset, Start kiosk, … */
export const CREATE_ORDER: readonly string[] = ['work.assign', 'booking.book', 'chat.new', 'servicedesk.raise', 'itdesk.asset', 'desk.kiosk', 'desk.invite', 'people.add'];

/** At most this many round actions in the + sheet (3 rows of 4); the domain actions are trimmed first. */
export const CREATE_CAP = 12;

/**
 * Inbox chips, top to bottom (also the order of the queues, Past decisions and the hooks): people at
 * reception first, then the HR kinds, money, work, bookings and the service desk. Built-in kinds are
 * here too, so a plug-in can sit right next to its built-in neighbour (Accounts' petty cash after the
 * project owner's).
 */
export const INBOX_CHIP_ORDER: readonly string[] = [
  'visitors',
  'desk',
  'leave',
  'wfh',
  'comp_off',
  'regularization',
  'reimbursements',
  'loans',
  'keka',
  'petty',
  'petty-acct',
  'reimb-acct',
  'vbill',
  'agree-sign',
  'task',
  'timefix',
  'booking',
  'bkdone',
  'bkrate',
  'desk-it',
];

/** Sort by a fixed key list; unlisted keys keep their current order, after the listed ones. */
export function byKeyList<T>(list: T[], keys: readonly string[], keyOf: (x: T) => string): T[] {
  const at = (x: T) => {
    const i = keys.indexOf(keyOf(x));
    return i < 0 ? keys.length : i;
  };
  return list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => at(a.x) - at(b.x) || a.i - b.i)
    .map(({ x }) => x);
}

/**
 * + sheet actions for this person, after the built-in ones (features/create/create-sheet), in
 * CREATE_ORDER. A domain action that opens the same screen as a built-in one is dropped too.
 */
export function domainCreateActions(access: Access, builtInKeys: readonly string[] = [], builtInHrefs: readonly string[] = []): CreateAction[] {
  const list = uniqueBy('create action', byOrder(collect('createActions', (d) => d.nav.createActions?.(access))), builtInKeys);
  return byKeyList(
    list.filter((a) => !builtInHrefs.includes(String(a.href))),
    CREATE_ORDER,
    (a) => a.key,
  );
}

/** Home cards for this person (app/(app)/(tabs)/index.tsx places them by `placement`). */
export function domainHomeCards(access: Access): HomeCard[] {
  return uniqueBy(
    'home card',
    byOrder(collect('homeCards', (d) => d.nav.homeCards?.(access))).filter((c) => typeof c.Card === 'function' || (typeof c.Card === 'object' && !!c.Card)),
  );
}

/** Tour steps from every domain, in registry order (features/tour/role-tours appends them). */
export function domainTourSteps(ctx: DomainTourCtx): TourStep[] {
  return collect('tourSteps', (d) => d.tour.tourSteps?.(ctx));
}

/** Inbox kinds the app already has; a plug-in may not reuse these keys (nor 'history', a route). */
export const BUILT_IN_INBOX_KINDS = ['regularization', 'leave', 'wfh', 'comp_off', 'reimbursements', 'loans', 'keka', 'petty', 'visitors', 'history', 'all'] as const;

let inboxCache: InboxKindPlugin[] | null = null;

/**
 * Every Inbox plug-in, in INBOX_CHIP_ORDER (then registry order). Read once and then fixed for the life of the bundle (Fast
 * Refresh of a domain file re-runs this module too), so features/inbox/use-inbox can call each one's
 * useItems hook in the same order on every render.
 */
export function inboxPlugins(): InboxKindPlugin[] {
  if (!inboxCache) {
    const all = byKeyList(collect('inboxKinds', (d) => d.inbox.inboxKinds), INBOX_CHIP_ORDER, (p) => String(p?.key));
    inboxCache = uniqueBy('inbox kind', all, BUILT_IN_INBOX_KINDS).filter((p) => {
      const ok = typeof p.useItems === 'function' && typeof p.row === 'function' && !!p.Detail && /^[a-z0-9-]+$/.test(p.key);
      if (!ok && __DEV__) console.warn(`[domains] inbox kind "${p.key}" needs a url-safe key, useItems, row and Detail — dropped`);
      return ok;
    });
  }
  return inboxCache;
}

/** One plug-in by its key, or null. */
export const inboxPlugin = (key: string | null | undefined) => (key ? inboxPlugins().find((p) => p.key === key) ?? null : null);
