// Demo API for the platform domain (wave 3): what Afzal Master Admin sees and changes. Already in the
// fixtures barrel (demo/fixtures/index.ts); these routes win over the built-in fixtures. Shapes follow the
// real handlers (routes/tenants.js, hr.js, server.js bounty routes, sql/bounty_coins_tables.sql).
//
//   GET    /tenants                         master: the demo company (org.ts TENANT, live) + Nexus Productions
//                                           (bounty off, two features off) + Lumen Studios (suspended); others: TENANT
//   POST   /tenants                         as routes/tenants.js:31 (no role check there either)
//   PUT    /tenants/:id                     the OTHER companies (company.ts answers for the demo company)
//   GET    /users                           master: everyone in the demo company + the other companies' people;
//                                           everyone else: org.ts's own answer, unchanged
//   GET    /hr/admin/tenants/:id/access     master only, HR_MODULES catalogue (hr.js:50)
//   PUT    /hr/admin/tenants/:id/access     master only
//   GET    /bounty/wallet/company?tenantId  master: any company; others: their own (assertSameTenant)
//   POST   /bounty/company/add-coins        master only (bounty_add_company_coins)
//   GET    /bounty_transactions             master, or type=COMPANY_CREDIT for the company's overseers: this
//                                           ledger (+ bounty.ts's rows); everyone else: bounty.ts's answer
//   POST   /bounty_transactions/:id/reverse a COMPANY_CREDIT: master only, refused once the coins were used
//
// Seeds: 4 company credits (one cancelled, with its ADJUSTMENT row); the demo company has given out
// 38,500 coins, so its first 50,000 credit can no longer be cancelled but the later 20,000 one can.
// Invitations made here go through people.ts (POST /whitelist, whitelistStore) like every other invite.

import type { BountyTxn } from '@/api/bounty';
import type { Tenant } from '@/api/me';
import { DEMO_TENANT_ID } from '@/demo/config';
import { bountyRoutes, txStore } from '@/demo/fixtures/bounty';
import { orgRoutes, TENANT } from '@/demo/fixtures/org';
import { currentPersona, personaUserId } from '@/demo/personas';
import { clone, daysAgo, fail, newId, notFound, nowIso, type Route } from '@/demo/state';

const role = () => currentPersona().role;
const isMaster = () => role() === 'master_admin';
const me = () => ({ id: personaUserId(currentPersona()), name: currentPersona().label });

// routes/tenants.js USER_ADMIN_ROLES; server.js LEDGER_OVERSEER_ROLES.
const USER_ADMIN_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo', 'hr', 'admin', 'it_admin', 'app_manager'];
const LEDGER_OVERSEER_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo', 'app_manager'];

// ── Companies ────────────────────────────────────────────────────────────────
const OTHER_TENANTS: Tenant[] = [
  {
    id: 't-nexus',
    name: 'Nexus Productions',
    logo: 'NP',
    status: 'active',
    maxUsers: 40,
    users: 0,
    superAdmin: 'meera.iyer@nexusproductions.demo',
    superAdminName: 'Meera Iyer',
    address: '3rd floor, Cyber Pearl, Hitec City, Hyderabad 500081',
    tax: '36AAECN4821K1Z5',
    bountyEnabled: false,
    orgEnabled: true,
    featureFlags: { vendors: false, devices: false },
  },
  {
    id: 't-lumen',
    name: 'Lumen Studios',
    logo: 'LS',
    status: 'suspended',
    maxUsers: 25,
    users: 0,
    superAdmin: 'rahul.verma@lumenstudios.demo',
    superAdminName: 'Rahul Verma',
    address: '14 MG Road, Bengaluru 560001',
    tax: '29AAFCL7710Q1Z2',
    bountyEnabled: true,
    orgEnabled: true,
    featureFlags: {},
  },
];

const allTenants = (): Tenant[] => [TENANT, ...OTHER_TENANTS];
const tenantById = (id: string) => allTenants().find((t) => t.id === id) ?? null;

// The other companies' people (GET /users for the platform owner only).
type Row = { id: string; name: string; email: string; role: string; tenantId: string; jobTitle: string; status: string; hasAvatar: boolean };
const person = (id: string, name: string, roleName: string, tenantId: string, jobTitle: string, domain: string): Row => ({
  id,
  name,
  email: `${name.toLowerCase().replace(/\s+/g, '.')}@${domain}`,
  role: roleName,
  tenantId,
  jobTitle,
  status: 'active',
  hasAvatar: false,
});
const OTHER_USERS: Row[] = [
  person('nx-meera', 'Meera Iyer', 'super_admin', 't-nexus', 'Managing Director', 'nexusproductions.demo'),
  person('nx-karthik', 'Karthik Nair', 'hr', 't-nexus', 'HR Lead', 'nexusproductions.demo'),
  person('nx-pooja', 'Pooja Das', 'manager', 't-nexus', 'Production Manager', 'nexusproductions.demo'),
  person('nx-divya', 'Divya Rao', 'employee', 't-nexus', 'Video Editor', 'nexusproductions.demo'),
  person('nx-imran', 'Imran Sheikh', 'employee', 't-nexus', 'Camera Operator', 'nexusproductions.demo'),
  person('ls-rahul', 'Rahul Verma', 'super_admin', 't-lumen', 'Founder', 'lumenstudios.demo'),
  person('ls-sana', 'Sana Khan', 'employee', 't-lumen', 'Colourist', 'lumenstudios.demo'),
];

/** The first route of `list` answering METHOD path (to keep another fixture's answer for everyone else). */
function handlerOf(list: Route[], method: Route[0], path: string) {
  return list.find(([m, re]) => m === method && re.test(path))?.[2] ?? null;
}
const orgUsers = handlerOf(orgRoutes, 'GET', '/users');
const bountyLedger = handlerOf(bountyRoutes, 'GET', '/bounty_transactions');

// routes/tenants.js:31 — the record exactly as the server builds it.
function postTenant(body: Record<string, unknown>) {
  const name = String(body.name || '').trim();
  if (!name) return fail('name required');
  const id = String(body.id || `t${Date.now()}`);
  if (tenantById(id)) return fail('A company with this id already exists.', 409);
  const nt: Tenant = {
    id,
    name,
    logo: String(body.logo || name.slice(0, 2).toUpperCase()),
    status: 'active',
    maxUsers: Number(body.maxUsers) || 50,
    superAdmin: String(body.superAdmin || ''),
    superAdminName: String(body.superAdminName || ''),
    address: String(body.address || ''),
    tax: String(body.tax || ''),
    bountyEnabled: !!body.bountyEnabled,
    users: 0,
  };
  OTHER_TENANTS.push(nt);
  return { ok: true, tenant: clone(nt) };
}

// routes/tenants.js:53 for the other companies: shallow merge, featureFlags deep-merged and kept only
// from master_admin, the earning cap only from super / master.
function putTenant(id: string, body: Record<string, unknown>) {
  if (!USER_ADMIN_ROLES.includes(role())) return fail('You do not have permission to change company settings.', 403);
  const t = OTHER_TENANTS.find((x) => x.id === id);
  if (!t) return notFound('Tenant not found');
  const patch: Record<string, unknown> = { ...body };
  for (const k of ['id', 'performedById', 'actorId', 'visitorPublicToken']) delete patch[k];
  if (!isMaster()) delete patch.featureFlags;
  if (role() !== 'super_admin' && !isMaster()) delete patch.bountyMonthlyEarnCap;
  const { featureFlags, ...rest } = patch as Partial<Tenant>;
  Object.assign(t, rest);
  if (featureFlags && typeof featureFlags === 'object') t.featureFlags = { ...(t.featureFlags ?? {}), ...featureFlags };
  return { ok: true };
}

// ── HR for a whole company (hr.js:50 HR_MODULES, :486 / :494) ────────────────
const HR_MODULES = [
  { id: 'attendance', label: 'Clock In / Out & Attendance', group: 'Time', available: true, desc: 'Geofenced clock in/out on OpenStreetMap, daily attendance, late and early-out flags.' },
  { id: 'regularization', label: 'Attendance Regularization', group: 'Time', available: true, desc: 'Missed-punch and correction requests with manager approval.' },
  { id: 'shifts', label: 'Shifts & Rosters', group: 'Time', available: true, desc: 'Shift definitions, rotations, weekly offs.' },
  { id: 'holidays', label: 'Holiday Calendar', group: 'Time', available: true, desc: 'Company/location holiday calendar, optional holidays.' },
  { id: 'leave', label: 'Leave Management', group: 'Time', available: true, desc: 'Leave types, accrual, carry-forward, balances, approval chain.' },
  { id: 'wfh', label: 'Work From Home', group: 'Time', available: true, desc: 'WFH requests and approvals; links to remote clock-in.' },
  { id: 'comp_off', label: 'Comp-Off', group: 'Time', available: true, desc: 'Credit for work on weekly offs/holidays, expiry, redemption.' },
  { id: 'policies', label: 'HR Policies', group: 'People', available: true, desc: 'Policy documents with employee acknowledgement.' },
  { id: 'salary', label: 'Salary Structure & Breakup', group: 'Payroll', available: true, desc: 'CTC, components (Basic/HRA/allowances), employee salary assignment.' },
  { id: 'payroll', label: 'Payroll Processing', group: 'Payroll', available: true, desc: 'Monthly run from attendance + leave, LOP, arrears, lock.' },
  { id: 'tax', label: 'Statutory & Tax', group: 'Payroll', available: true, desc: 'PF, ESI, Professional Tax, TDS (old/new regime), Form 16.' },
  { id: 'payslips', label: 'Payslips', group: 'Payroll', available: true, desc: 'Auto-generated PDF payslips, employee download, email.' },
  { id: 'reimbursements', label: 'Reimbursements & Loans', group: 'Payroll', available: true, desc: 'Expense claims and salary advances/loans with recovery.' },
];
const HR_IDS = HR_MODULES.map((m) => m.id);

const HR_ACCESS = new Map<string, { enabled: boolean; modules: string[] }>([
  [DEMO_TENANT_ID, { enabled: true, modules: [...HR_IDS] }],
  ['t-nexus', { enabled: true, modules: ['attendance', 'regularization', 'holidays', 'leave'] }],
  ['t-lumen', { enabled: false, modules: [] }],
]);
const hrAccessOf = (id: string) => HR_ACCESS.get(id) ?? { enabled: false, modules: [] };

const ONLY_OWNER = 'Only the platform owner can manage company HR access.';

function getHr(id: string) {
  if (!isMaster()) return fail(ONLY_OWNER, 403);
  if (!tenantById(id)) return notFound('Company not found.');
  return { ok: true, ...clone(hrAccessOf(id)), catalogue: HR_MODULES };
}

function putHr(id: string, body: Record<string, unknown>) {
  if (!isMaster()) return fail(ONLY_OWNER, 403);
  if (!tenantById(id)) return notFound('Company not found.');
  if (typeof body.enabled !== 'boolean') return fail('enabled must be true or false.');
  const before = hrAccessOf(id);
  let modules = before.modules;
  if ('modules' in body) {
    if (!Array.isArray(body.modules)) return fail('modules must be a list.');
    const list = [...new Set((body.modules as unknown[]).map(String))];
    const bad = list.find((m) => !HR_IDS.includes(m));
    if (bad) return fail(`Unknown HR module: ${bad}`);
    modules = list;
  } else if (body.enabled && !before.modules.length) {
    modules = ['attendance'];
  }
  HR_ACCESS.set(id, { enabled: body.enabled, modules });
  return { ok: true, enabled: body.enabled, modules: [...modules] };
}

// ── Company wallets and credits ──────────────────────────────────────────────
type Wallet = { id: string; tenantId: string; name: string; totalAdded: number; totalDistributed: number; available: number; updatedAt?: string };
type LedgerRow = BountyTxn & { tenantId: string; performedById?: string; reversalOf?: string; reversedBy?: string; reversedById?: string };

const walletName = (t: Tenant) => `${t.name || t.id} — Company Wallet`;
const WALLETS = new Map<string, Wallet>();
/** The company wallet of a company, made on first use (all zero), as bounty_wallet_lock does. */
export function companyWalletOf(tenantId: string): Wallet {
  let w = WALLETS.get(tenantId);
  if (!w) {
    const t = tenantById(tenantId);
    w = { id: `company_${tenantId}`, tenantId, name: t ? walletName(t) : 'Company Wallet', totalAdded: 0, totalDistributed: 0, available: 0 };
    WALLETS.set(tenantId, w);
  }
  return w;
}

const LEDGER: LedgerRow[] = [];
const credit = (tenantId: string, id: string, amount: number, reason: string, at: string): LedgerRow => {
  const t = tenantById(tenantId)!;
  const w = companyWalletOf(tenantId);
  const row: LedgerRow = {
    id,
    tenantId,
    type: 'COMPANY_CREDIT',
    amount,
    toWalletId: w.id,
    toWalletName: walletName(t),
    performedBy: 'Afzal Master Admin',
    performedById: 'demo-master-admin',
    balanceBefore: w.available,
    balanceAfter: w.available + amount,
    reason,
    status: 'completed',
    createdAt: at,
  };
  w.totalAdded += amount;
  w.available += amount;
  LEDGER.push(row);
  return row;
};
const reverse = (row: LedgerRow, reason: string, at: string, by = 'Afzal Master Admin', byId = 'demo-master-admin') => {
  const w = companyWalletOf(row.tenantId);
  const before = w.available;
  w.totalAdded = Math.max(0, w.totalAdded - row.amount);
  w.available = before - row.amount;
  w.updatedAt = at;
  row.reversedAt = at;
  row.reversedBy = by;
  row.reversedById = byId;
  const adj: LedgerRow = {
    id: newId('btx'),
    tenantId: row.tenantId,
    type: 'ADJUSTMENT',
    amount: -row.amount,
    toWalletId: w.id,
    toWalletName: 'Company Wallet',
    reversalOf: row.id,
    performedBy: by,
    performedById: byId,
    balanceBefore: before,
    balanceAfter: w.available,
    reason,
    status: 'completed',
    createdAt: at,
  };
  LEDGER.push(adj);
  return adj;
};

// Seeds: the demo company's budget for the year and a Diwali top-up (38,500 coins already given out to
// bounty creators, so only the later credit can still be cancelled), a mistyped credit that was taken
// back, and Nexus Productions' starting budget (bounty is still off there).
credit(DEMO_TENANT_ID, 'btx-co-demo-1', 50000, 'FY 2026–27 bounty budget', daysAgo(120, '11:00'));
const typo = credit(DEMO_TENANT_ID, 'btx-co-demo-2', 5000, 'Monsoon contest prizes (typed 5,000 instead of 500)', daysAgo(64, '15:30'));
reverse(typo, 'Cancelled unused company credit', daysAgo(64, '15:42'));
credit(DEMO_TENANT_ID, 'btx-co-demo-3', 20000, 'Diwali bounty top-up', daysAgo(9, '10:15'));
credit('t-nexus', 'btx-co-nexus-1', 10000, 'Starting budget for the pilot', daysAgo(30, '12:00'));
{
  const w = companyWalletOf(DEMO_TENANT_ID);
  w.totalDistributed = 38500;
  w.available -= 38500;
}

function getWallet(q: URLSearchParams) {
  const tenantId = q.get('tenantId') || '';
  if (!tenantId) return fail('tenantId is required.', 400);
  if (!isMaster() && tenantId !== (currentPersona().tenant ? DEMO_TENANT_ID : '')) return fail('You can only see company wallets of your own company.', 403);
  return clone(companyWalletOf(tenantId));
}

function addCoins(body: Record<string, unknown>) {
  if (!isMaster()) return fail('Only Master Admin can add company bounty coins.', 403);
  const tenantId = String(body.tenantId || '');
  if (!tenantId) return fail('Select which registered company to add coins to.', 400);
  const t = tenantById(tenantId);
  if (!t) return notFound('Company not found.');
  const amt = Math.round(Number(body.amount));
  if (!amt || amt <= 0) return fail('Enter a positive coin amount.', 400);
  const row = credit(tenantId, newId('btx'), amt, String(body.reason || ''), nowIso());
  row.performedBy = me().name;
  row.performedById = me().id;
  const w = companyWalletOf(tenantId);
  w.name = walletName(t);
  w.updatedAt = row.createdAt;
  return { ok: true, wallet: clone(w), transaction: clone(row) };
}

function reverseCredit(id: string, body: Record<string, unknown>) {
  const row = LEDGER.find((x) => x.id === id);
  if (!row) return notFound('Transaction not found.');
  if (row.reversedAt) return fail('This has already been cancelled.', 409);
  if (row.type !== 'COMPANY_CREDIT') return fail('Only a company credit or coin distribution can be cancelled this way.', 400);
  if (!isMaster()) return fail('Only Master Admin can cancel a company coin credit — Super Admin only receives it.', 403);
  if (companyWalletOf(row.tenantId).available < row.amount) return fail('These coins have already been distributed or spent and can no longer be cancelled.', 400);
  const adj = reverse(row, String(body.reason || '').trim() || 'Cancelled unused company credit', nowIso(), me().name, me().id);
  return { ok: true, wallet: clone(companyWalletOf(row.tenantId)), transaction: clone(adj) };
}

// server.js:5506 for the rows this file keeps (plus bounty.ts's own, which are the demo company's).
function ledger(q: URLSearchParams) {
  let rows: LedgerRow[] = [...LEDGER, ...(txStore as LedgerRow[])];
  const dateFrom = q.get('dateFrom');
  const dateTo = q.get('dateTo');
  const type = q.get('type');
  const direction = q.get('direction');
  if (dateFrom) rows = rows.filter((t) => (t.createdAt || '') >= dateFrom);
  if (dateTo) rows = rows.filter((t) => (t.createdAt || '') <= `${dateTo}T23:59:59.999Z`);
  if (type) rows = rows.filter((t) => t.type === type);
  if (direction === 'credit') rows = rows.filter((t) => t.toWalletId);
  if (direction === 'debit') rows = rows.filter((t) => t.fromWalletId);
  if (!isMaster()) rows = rows.filter((t) => t.tenantId === DEMO_TENANT_ID);
  else if (q.get('tenantId')) rows = rows.filter((t) => t.tenantId === q.get('tenantId'));
  return rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export const platformRoutes: Route[] = [
  ['GET', /^\/tenants$/, () => (isMaster() ? allTenants() : [TENANT])],
  ['POST', /^\/tenants$/, (_p, body) => postTenant(body ?? {})],
  // The demo company itself is company.ts's (it writes the company's audit rows); every other id is here.
  ['PUT', new RegExp(`^/tenants/(?!${DEMO_TENANT_ID}$)([^/]+)$`), ([, id], body) => putTenant(id!, body ?? {})],
  ['GET', /^\/users$/, (p, body, q) => (isMaster() ? [...((orgUsers?.(p, body, q) as unknown[]) ?? []), ...OTHER_USERS] : orgUsers?.(p, body, q))],
  ['GET', /^\/hr\/admin\/tenants\/([^/]+)\/access$/, ([, id]) => getHr(id!)],
  ['PUT', /^\/hr\/admin\/tenants\/([^/]+)\/access$/, ([, id], body) => putHr(id!, body ?? {})],
  ['GET', /^\/bounty\/wallet\/company$/, (_p, _b, q) => getWallet(q)],
  ['POST', /^\/bounty\/company\/add-coins$/, (_p, body) => addCoins(body ?? {})],
  [
    'GET',
    /^\/bounty_transactions$/,
    (p, body, q) =>
      isMaster() || (q.get('type') === 'COMPANY_CREDIT' && LEDGER_OVERSEER_ROLES.includes(role())) ? ledger(q) : (bountyLedger?.(p, body, q) ?? []),
  ],
  ['POST', /^\/bounty_transactions\/([^/]+)\/reverse$/, ([, id], body) => reverseCredit(id!, body ?? {})],
];

// ── For the integrator / bounty admin (coin distribution debits the same company wallet) ──
/** Every company credit and its cancellation rows (all companies). */
export const companyCreditStore = LEDGER;
/** Every company record the platform owner sees (the demo company is org.ts TENANT). */
export const platformTenants = allTenants;
/**
 * For integration.ts: bountyadmin.ts registers GET /bounty/wallet/company, GET /bounty_transactions and
 * POST /bounty_transactions/:id/reverse and comes first in the barrel, so the platform owner's company
 * wallets get the demo company's answer. Wrapping those three with "master_admin → these" makes the
 * platform screens work; one shared wallet/ledger (companyWalletOf / companyCreditStore) is the full fix.
 */
export const platformBountyHandlers: Record<'wallet' | 'ledger' | 'reverse', Route[2]> = {
  wallet: (_p, _b, q) => getWallet(q),
  ledger: (_p, _b, q) => ledger(q),
  reverse: ([, id], body) => reverseCredit(String(id ?? ''), (body ?? {}) as Record<string, unknown>),
};
export const isPlatformOwnerPersona = isMaster;
