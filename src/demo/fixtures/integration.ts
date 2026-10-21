// Integrator glue for the demo (docs/port/PLAN.md §2.5 "make cross-domain data agree"). Integrator-owned:
// the domains never edit it. demo/fixtures/index.ts runs every domain's routes through `integrate()`
// before they reach the demo server, so a clash between two domains is settled here, once, without
// editing either domain's fixture file.
//
// What it settles (integrator pass 1):
//   GET /whitelist        ONE invitations store: people.ts `whitelistStore`. work.ts and servicedesk.ts
//                         each answered with a static copy and came first in the barrel, so invitations
//                         made in the app never showed in the roster, Users or the pickers. Their GET is
//                         dropped and their sample rows live in the shared store (Tejas was already
//                         there; Divya Menon is added for Raise for someone's "not signed up yet").
//   PUT /departments/:id  routes/departments.js merges any field; people.ts's handler kept only name,
//                         admin and managers, so the company's Team Roster by department switch didn't
//                         stick. A successful save now also applies `teamRosterEnabled`.
//   GET /vendor-agreements/pending-my-signature
//                         accounts.ts names "whoever is exploring" as the countersigner, so every persona
//                         (the TV display and the platform owner aside) had an "Agreements to sign" item
//                         on Home and in Inbox. Only Afzal Accounts, Super Admin and Employee (the "any
//                         colleague can be named" case) are named now; the others get the server's
//                         empty answer.

import { DEMO_TENANT_ID } from '@/demo/config';
import { upsertDepartment } from '@/demo/fixtures/org';
import { currentPersona, type StaffPersonaId } from '@/demo/personas';
import { whitelistStore } from '@/demo/fixtures/people';
import { daysAgo, type Route } from '@/demo/state';

type Domain = 'work' | 'servicedesk' | 'people' | string;

/** Routes a domain registers that another domain's store answers instead (method + a sample path). */
const DROP: Record<Domain, [method: Route[0], sample: string][]> = {
  work: [['GET', '/whitelist']],
  servicedesk: [['GET', '/whitelist']],
};

const isError = (out: unknown) => !!out && typeof out === 'object' && typeof (out as { status?: unknown }).status === 'number' && 'error' in (out as object);

/** The personas the demo names as an agreement's countersigner. */
const COUNTERSIGNERS: StaffPersonaId[] = ['accounts', 'super_admin', 'employee'];

/** Wrappers around one domain's own handler (method + sample path). */
const WRAP: Record<Domain, [method: Route[0], sample: string, wrap: (h: Route[2]) => Route[2]][]> = {
  accounts: [
    [
      'GET',
      '/vendor-agreements/pending-my-signature',
      (h) => (p, body, q) => (COUNTERSIGNERS.includes(currentPersona().id) ? h(p, body, q) : { ok: true, agreements: [] }),
    ],
  ],
  people: [
    [
      'PUT',
      '/departments/x',
      (h) => (p, body, q) => {
        const out = h(p, body, q);
        const on = body && typeof body === 'object' ? (body as { teamRosterEnabled?: unknown }).teamRosterEnabled : undefined;
        if (!isError(out) && typeof on === 'boolean' && p[1]) upsertDepartment({ id: p[1], teamRosterEnabled: on });
        return out;
      },
    ],
  ],
};

/** A domain's routes with the clashes above settled. */
export function integrate(domain: Domain, routes: Route[]): Route[] {
  const drop = DROP[domain] ?? [];
  const wrap = WRAP[domain] ?? [];
  return routes
    .filter(([m, re]) => !drop.some(([dm, sample]) => dm === m && re.test(sample)))
    .map((r): Route => {
      const w = wrap.find(([wm, sample]) => wm === r[0] && r[1].test(sample));
      return w ? [r[0], r[1], w[2](r[2])] : r;
    });
}

// servicedesk.ts's second "not signed up yet" sample, now in the one store (Tejas is already there).
if (!whitelistStore.some((w) => w.email.toLowerCase() === 'divya.menon.demo@tamadamedia.com')) {
  whitelistStore.push({
    id: 'wl-divya',
    email: 'divya.menon.demo@tamadamedia.com',
    name: 'Divya Menon',
    role: 'employee',
    dept: 'dept-production',
    tenantId: DEMO_TENANT_ID,
    employeeNumber: 'TM-1114',
    kekaCode: 'TM-1114',
    gender: 'Female',
    mobile: '+919000188052',
    location: 'Hyderabad',
    jobTitle: 'Production Assistant',
    reportingManager: 'Deepa Menon',
    reportingTo: 'Deepa Menon',
    dateJoined: '',
    createdAt: daysAgo(2, '12:30'),
  });
}
