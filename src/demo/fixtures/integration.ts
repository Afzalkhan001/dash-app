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
//
// What it settles (integrator pass 2):
//   GET /assets           ONE asset store: itdesk.ts. people.ts answered first with its 3 static rows, so
//                         the IT desk's list, adds and assignments never showed. itdesk.ts's store holds
//                         the same three rows (same ids), so the roster's held-asset check still works.
//   GET /room_purposes    ONE purposes store: itdesk.ts. booking.ts always answered the website's five,
//                         so purposes added, edited or turned off on the IT desk never reached booking.
//   GET /bounty/wallet/company, GET /bounty_transactions, POST /bounty_transactions/:id/reverse
//                         bountyadmin.ts answers these for the demo company only. For the platform owner
//                         (Afzal Master Admin) they go to platform.ts, which keeps every company's wallet
//                         and credits, so each company shows its own wallet and a credit can be cancelled.
//                         One demo-company wallet: platform.ts's credits (what Master Admin added or
//                         cancelled) and bountyadmin.ts's distributions (what Super Admin gave out) now
//                         move the same numbers, and both ledgers list the same credit rows (bountyadmin's
//                         own two seeded credits are replaced by the platform's).
//   GET /whitelist        the real route is scoped to the caller's company (master_admin sees all); the
//                         people.ts store also holds invitations the platform owner sent for other
//                         companies, so everyone else now gets only the demo company's.
//   GET /time_corrections work.ts keeps only pending ones, so Reports' "Hours corrected by a manager"
//                         could never show. One approved correction is added (Priya Sharma corrected one
//                         of Sanjay Kumar's finished tasks from insights.ts), for the personas who see
//                         Creative's reports.

import { DEMO_TENANT_ID } from '@/demo/config';
import { upsertDepartment } from '@/demo/fixtures/org';
import { currentPersona, type StaffPersonaId } from '@/demo/personas';
import { whitelistStore } from '@/demo/fixtures/people';
import { txStore } from '@/demo/fixtures/bounty';
import { bountyCompanyWallet } from '@/demo/fixtures/bountyadmin';
import { companyCreditStore, companyWalletOf, isPlatformOwnerPersona, platformBountyHandlers } from '@/demo/fixtures/platform';
import { taskStore } from '@/demo/fixtures/tasks';
import { daysAgo, type Route } from '@/demo/state';

type Domain = 'work' | 'servicedesk' | 'people' | string;

/** Routes a domain registers that another domain's store answers instead (method + a sample path). */
const DROP: Record<Domain, [method: Route[0], sample: string][]> = {
  work: [['GET', '/whitelist']],
  servicedesk: [['GET', '/whitelist']],
  people: [['GET', '/assets']],
  booking: [['GET', '/room_purposes']],
};

// ── One demo-company wallet (bountyadmin.ts + platform.ts) ───────────────────
const platformWallet = companyWalletOf(DEMO_TENANT_ID);
const idOf = (x: unknown) => (x && typeof x === 'object' ? String((x as { id?: unknown }).id ?? '') : '');
/** Platform credit rows of the demo company that bounty.ts's ledger doesn't list yet go into it (same objects). */
function shareDemoCredits() {
  const have = new Set(txStore.map((t) => t.id));
  for (const r of companyCreditStore) if (r.tenantId === DEMO_TENANT_ID && !have.has(r.id)) txStore.push(r);
}
/** After Super Admin moved coins (bountyadmin.ts): the platform's copy follows. */
function fromBountyAdmin() {
  platformWallet.totalDistributed = bountyCompanyWallet.totalDistributed;
  platformWallet.available = bountyCompanyWallet.available;
}
/** After Master Admin added or cancelled a credit (platform.ts): bountyadmin's copy follows. */
function fromPlatform() {
  bountyCompanyWallet.totalAdded = platformWallet.totalAdded;
  bountyCompanyWallet.available = platformWallet.available;
  shareDemoCredits();
}
{
  // bountyadmin.ts seeded its own two "DASH platform" credits; the platform's ledger holds the real ones.
  for (let i = txStore.length - 1; i >= 0; i--) {
    const t = txStore[i]!;
    if (t.type === 'COMPANY_CREDIT' && t.toWalletId === `company_${DEMO_TENANT_ID}` && !companyCreditStore.some((r) => r.id === t.id)) txStore.splice(i, 1);
  }
  platformWallet.totalDistributed = bountyCompanyWallet.totalDistributed;
  platformWallet.available = platformWallet.totalAdded - platformWallet.totalDistributed;
  fromPlatform();
}
const afterWrite =
  (sync: () => void) =>
  (h: Route[2]): Route[2] =>
  (p, body, q) => {
    const out = h(p, body, q);
    if (!isError(out)) sync();
    return out;
  };

/** The platform owner's answer for one of bountyadmin's company-wallet routes, else bountyadmin's own. */
const forPlatformOwner =
  (which: keyof typeof platformBountyHandlers) =>
  (h: Route[2]): Route[2] =>
  (p, body, q) => {
    if (!isPlatformOwnerPersona()) {
      const out = h(p, body, q);
      if (which === 'reverse' && !isError(out)) fromBountyAdmin();
      return out;
    }
    const out = platformBountyHandlers[which](p, body, q);
    if (which === 'reverse' && !isError(out)) fromPlatform();
    // The platform ledger lists its own rows and bounty.ts's; the shared credit rows are in both.
    if (which === 'ledger' && Array.isArray(out)) return out.filter((r, i, all) => all.findIndex((x) => idOf(x) === idOf(r)) === i);
    return out;
  };

const isError = (out: unknown) => !!out && typeof out === 'object' && typeof (out as { status?: unknown }).status === 'number' && 'error' in (out as object);

/** The personas the demo names as an agreement's countersigner. */
const COUNTERSIGNERS: StaffPersonaId[] = ['accounts', 'super_admin', 'employee'];

/** Wrappers around one domain's own handler (method + sample path). */
const WRAP: Record<Domain, [method: Route[0], sample: string, wrap: (h: Route[2]) => Route[2]][]> = {
  work: [
    [
      'GET',
      '/time_corrections',
      (h) => (p, body, q) => {
        const out = h(p, body, q);
        const fix = approvedCorrection();
        return Array.isArray(out) && fix && !out.some((c: { id?: string }) => c?.id === fix.id) ? [...out, fix] : out;
      },
    ],
  ],
  accounts: [
    [
      'GET',
      '/vendor-agreements/pending-my-signature',
      (h) => (p, body, q) => (COUNTERSIGNERS.includes(currentPersona().id) ? h(p, body, q) : { ok: true, agreements: [] }),
    ],
  ],
  bountyadmin: [
    ['GET', '/bounty/wallet/company', forPlatformOwner('wallet')],
    ['GET', '/bounty_transactions', forPlatformOwner('ledger')],
    ['POST', '/bounty_transactions/x/reverse', forPlatformOwner('reverse')],
    ['POST', '/bounty/distribute', afterWrite(fromBountyAdmin)],
    ['POST', '/bounty/revoke-from-creator', afterWrite(fromBountyAdmin)],
    ['POST', '/bounty/return-to-company', afterWrite(fromBountyAdmin)],
  ],
  platform: [
    ['POST', '/bounty/company/add-coins', afterWrite(fromPlatform)],
    ['POST', '/bounty_transactions/x/reverse', afterWrite(fromPlatform)],
  ],
  people: [
    [
      'GET',
      '/whitelist',
      (h) => (p, body, q) => {
        const out = h(p, body, q);
        if (isPlatformOwnerPersona() || !Array.isArray(out)) return out;
        return out.filter((w: { tenantId?: string }) => !w?.tenantId || w.tenantId === DEMO_TENANT_ID);
      },
    ],
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

/** One approved time correction on a finished Reports task (made on first read, then kept). */
let approvedFix: Record<string, unknown> | null | undefined;
function approvedCorrection(): Record<string, unknown> | null {
  if (approvedFix !== undefined) return approvedFix;
  const t = taskStore.find((x) => String(x.id).startsWith('tki') && x.assigneeId === 'u-sanjay' && x.status === 'completed');
  if (!t) return (approvedFix = null);
  const was = (Number(t.elapsedSeconds) || 0) / 3600;
  approvedFix = {
    id: 'tc-integrator-approved',
    tenantId: DEMO_TENANT_ID,
    taskId: t.id,
    taskTitle: t.title,
    taskDate: t.date,
    assignee: t.assignee,
    assigneeId: t.assigneeId,
    project: t.kekaCode ?? t.project,
    requestedHours: Math.round((was + 1.5) * 4) / 4,
    approvedHours: Math.round((was + 1) * 4) / 4,
    reason: 'The timer stopped when the laptop slept during the export. I kept working on the conform.',
    status: 'approved',
    approvedBy: 'Priya Sharma',
    approvedAt: String(t.completedAt ?? t.lastEndedAt ?? ''),
    createdAt: String(t.lastEndedAt ?? ''),
  };
  return approvedFix;
}

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
