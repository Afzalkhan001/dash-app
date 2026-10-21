// Accounts > Reimbursement (reimbursements.js): my claims, the claims against Keka Codes I own (the
// demo person owns TM_NIM_EXPL and TM_INT_REEL26), submit, receipt, re-upload, the Keka Code Owner's
// approve / reject, and the claimant's Received / Not Received. Rows are the real snake_case columns,
// each with the history the web's timeline is drawn from.
//   pending_keka_approval → pending_accounts_approval → ready_for_payment → payment_processing
//   → received | not_received        (rejected at either approval stage, with a reason)
// By persona (demo/personas.ts): the two codes are the demo person's only while the persona owns
// them (Afzal Manager — Priya otherwise); the super admin oversees every claim (OVERRIDE_ROLES);
// the roles reimbursements.js EVERY_ROLE leaves out (app_manager, visitor_manager,
// announcement_viewer) are refused exactly as the server refuses them.

import type { HistoryEntry, Payment, Reimbursement } from '@/api/reimbursements';
import { DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { MY_CODE_PROJECTS, ownerOf, personById, profile, projectByCode, projectById } from '@/demo/fixtures/org';
import { currentPersona, onPersonaChange } from '@/demo/personas';
import { daysAgo, epochId, fail, minutesAgo, newId, nowIso, notFound, RECEIPT_PNG, type Route } from '@/demo/state';

const ME = { id: DEMO_USER.id, name: String(DEMO_USER.name) };
const PURPOSES: Record<string, string> = { food: 'Food', fuel: 'Fuel', accommodation: 'Accommodation', transportation: 'Transportation' };
const KEKA_SKIP_NOTE = 'You own this Keka Code, so Keka Code Owner approval was skipped.';

const ev = (event: string, status: string, at: string, by: { id: string; name: string }, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  event,
  status,
  at,
  byId: by.id,
  byName: by.name,
  ...extra,
});
const who = (id: string) => {
  const p = personById(id);
  return { id, name: p?.name ?? 'Someone' };
};
const RAMESH = who('u-ramesh');

type Seed = {
  employee: string;
  code: string;
  purpose: string;
  amount: number;
  status: string;
  created: string;
  receipt: string;
  steps?: (r: Reimbursement) => Partial<Reimbursement>;
};

function seed(s: Seed, i: number): Reimbursement {
  const p = projectByCode(s.code)!;
  const owner = ownerOf(p)!;
  const emp = s.employee === ME.id ? ME : who(s.employee);
  const selfOwned = owner.id === emp.id;
  const first = selfOwned ? 'pending_accounts_approval' : 'pending_keka_approval';
  const r: Reimbursement = {
    id: epochId('rmb', s.created, `rmb-seed-${i}`),
    tenant_id: DEMO_TENANT_ID,
    employee_id: emp.id,
    employee_name: emp.name,
    employee_number: String(personById(emp.id)?.employeeNumber ?? ''),
    keka_code: p.kekaCode,
    project_id: p.id,
    project_name: p.name,
    keka_owner_user_id: owner.id,
    keka_owner_name: owner.name,
    purpose: s.purpose,
    amount: s.amount,
    status: s.status,
    receipt_name: s.receipt,
    history: [
      ev('submitted', first, s.created, emp, { amount: s.amount, purpose: s.purpose }),
      ...(selfOwned ? [ev('keka_skipped', first, s.created, emp, { note: KEKA_SKIP_NOTE })] : []),
    ],
    payment: {},
    created_at: s.created,
    updated_at: s.created,
    keka_approved_at: null,
    keka_approved_by_name: null,
    approved_at: null,
    approved_by_name: null,
    rejected_stage: null,
    rejected_at: null,
    rejected_by_name: null,
    rejection_reason: null,
  };
  return { ...r, ...(s.steps ? s.steps(r) : {}) };
}

const later = (iso: string, hours: number) => new Date(Date.parse(iso) + hours * 3600000).toISOString();

// Keka approval, Accounts authorization and payment, appended to a seed's history.
function kekaApproved(r: Reimbursement, hours = 20): Partial<Reimbursement> {
  const by = who(r.keka_owner_user_id!);
  const at = later(r.created_at, hours);
  return { keka_approved_at: at, keka_approved_by_name: by.name, history: [...(r.history ?? []), ev('keka_approved', 'pending_accounts_approval', at, by, { amount: Number(r.amount) })] };
}
function authorized(r: Reimbursement, hours: number): Partial<Reimbursement> {
  const a = r.keka_owner_user_id === r.employee_id ? {} : kekaApproved(r);
  const at = later(r.created_at, hours);
  return { ...a, approved_at: at, approved_by_name: RAMESH.name, history: [...(a.history ?? r.history ?? []), ev('authorized', 'ready_for_payment', at, RAMESH)] };
}
function paying(r: Reimbursement, hours: number, ref: string, response?: 'received' | 'not_received', respondHours = 30): Partial<Reimbursement> {
  const a = authorized(r, hours - 20);
  const at = later(r.created_at, hours);
  const payment: Payment = { paymentDate: at.slice(0, 10), reference: ref, method: 'bank_transfer', note: '', startedAt: at, startedByName: RAMESH.name, response: null };
  const history = [...(a.history ?? []), ev('payment_processing', 'payment_processing', at, RAMESH, { paymentDate: payment.paymentDate, reference: ref, method: 'bank_transfer' })];
  if (!response) return { ...a, payment, history };
  const rAt = later(r.created_at, hours + respondHours);
  const emp = { id: r.employee_id, name: r.employee_name };
  return {
    ...a,
    payment: { ...payment, response: { response, at: rAt, byName: emp.name, note: '' } },
    history: [...history, ev(response, response, rAt, emp)],
    updated_at: rAt,
  };
}
function kekaRejected(r: Reimbursement, hours: number, reason: string): Partial<Reimbursement> {
  const by = who(r.keka_owner_user_id!);
  const at = later(r.created_at, hours);
  return { rejected_stage: 'keka', rejected_at: at, rejected_by_name: by.name, rejection_reason: reason, history: [...(r.history ?? []), ev('keka_rejected', 'rejected', at, by, { note: reason })] };
}

const SEEDS: Seed[] = [
  // ── mine ──
  { employee: ME.id, code: 'TM_SJW_DIWALI26', purpose: 'transportation', amount: 1240, status: 'pending_keka_approval', created: daysAgo(2, '19:20'), receipt: 'ola-ride-receipts.pdf' },
  { employee: ME.id, code: 'TM_AAR_BRAND26', purpose: 'food', amount: 2860, status: 'pending_accounts_approval', created: daysAgo(5, '21:05'), receipt: 'team-dinner-bill.jpg', steps: (r) => kekaApproved(r) },
  { employee: ME.id, code: 'TM_INT_REEL26', purpose: 'fuel', amount: 780, status: 'pending_accounts_approval', created: daysAgo(1, '18:10'), receipt: 'hp-fuel-receipt.jpg' },
  { employee: ME.id, code: 'TM_KTH_S2', purpose: 'accommodation', amount: 4500, status: 'ready_for_payment', created: daysAgo(8, '10:30'), receipt: 'vizag-hotel-invoice.pdf', steps: (r) => authorized(r, 70) },
  { employee: ME.id, code: 'TM_KAG_LAUNCH', purpose: 'transportation', amount: 3150, status: 'payment_processing', created: daysAgo(9, '17:45'), receipt: 'ramoji-cab-bills.pdf', steps: (r) => paying(r, 170, 'UTR 4471 9930 2286') },
  { employee: ME.id, code: 'TM_SJW_DIWALI26', purpose: 'food', amount: 1960, status: 'received', created: daysAgo(24, '22:15'), receipt: 'late-edit-dinner.jpg', steps: (r) => paying(r, 120, 'UTR 3318 2077 6401', 'received') },
  {
    employee: ME.id,
    code: 'TM_KTH_S2',
    purpose: 'accommodation',
    amount: 6200,
    status: 'rejected',
    created: daysAgo(15, '09:20'),
    receipt: 'hotel-bill.jpg',
    steps: (r) => kekaRejected(r, 26, 'The hotel bill is not a GST tax invoice — please upload the invoice from the front desk.'),
  },
  // ── against codes the demo person owns ──
  { employee: 'u-sneha', code: 'TM_INT_REEL26', purpose: 'food', amount: 1180, status: 'pending_keka_approval', created: minutesAgo(190), receipt: 'showreel-shoot-lunch.jpg' },
  {
    employee: 'u-farhan',
    code: 'TM_NIM_EXPL',
    purpose: 'fuel',
    amount: 2800,
    status: 'pending_keka_approval',
    created: daysAgo(3, '18:30'),
    receipt: 'fuel-bills-corrected.pdf',
    steps: (r) => {
      const rej = kekaRejected(r, 4, 'Two of the fuel bills are from a personal trip — please remove them.');
      const at = later(r.created_at, 30);
      const history = [...(rej.history ?? []), ev('reuploaded', 'pending_keka_approval', at, who('u-farhan'), { amount: 2450, previousAmount: 2800, note: 'Re-uploaded after the Keka Code Owner rejected it.' })];
      return { amount: 2450, history, updated_at: at };
    },
  },
  { employee: 'u-anita', code: 'TM_NIM_EXPL', purpose: 'transportation', amount: 640, status: 'pending_accounts_approval', created: daysAgo(2, '13:00'), receipt: 'auto-receipts.jpg', steps: (r) => kekaApproved(r, 22) },
  { employee: 'u-kavya', code: 'TM_INT_REEL26', purpose: 'food', amount: 920, status: 'received', created: daysAgo(16, '20:40'), receipt: 'snacks-bill.jpg', steps: (r) => paying(r, 96, 'UTR 1102 5583 9917', 'received', 20) },
  {
    employee: 'u-nikhil',
    code: 'TM_NIM_EXPL',
    purpose: 'transportation',
    amount: 1500,
    status: 'rejected',
    created: daysAgo(11, '16:00'),
    receipt: 'uber-trips.pdf',
    steps: (r) => kekaRejected(r, 18, 'This trip was not for the Nimbus shoot — please claim it against the right Keka Code.'),
  },
];

const ROWS: Reimbursement[] = SEEDS.map(seed);
const RECEIPTS = new Map<string, string>(); // uploads made in the demo, by claim id

// reimbursements.js: who may use the module at all, and who oversees the Keka Code Owner stage.
const EVERY_ROLE = ['master_admin', 'super_admin', 'ceo', 'coo', 'admin', 'hr', 'it_admin', 'manager', 'employee', 'professional', 'accounts'];
const OVERRIDE_ROLES = ['super_admin', 'master_admin'];
const overseer = () => OVERRIDE_ROLES.includes(currentPersona().role);
const mayActAsOwner = (r: Reimbursement) => r.keka_owner_user_id === ME.id || overseer();
// requireRole(EVERY_ROLE, what) — lib/authz.js wording.
const gate =
  <A extends unknown[]>(what: string, fn: (...a: A) => unknown) =>
  (...a: A) =>
    EVERY_ROLE.includes(currentPersona().role) ? fn(...a) : fail(`You do not have permission to ${what}.`, 403);

// The Nimbus / Showreel codes change hands with the persona: re-point their claims at the owner,
// along with the owner's past Keka decisions on them (the history the timeline is drawn from).
onPersonaChange(() => {
  for (const r of ROWS) {
    if (!r.project_id || !MY_CODE_PROJECTS.includes(r.project_id)) continue;
    const owner = ownerOf(projectById(r.project_id));
    const was = { id: r.keka_owner_user_id ?? '', name: r.keka_owner_name ?? '' };
    const now = { id: owner?.id ?? '', name: owner?.name ?? '' };
    r.keka_owner_user_id = now.id;
    r.keka_owner_name = now.name;
    if (!was.id || was.id === now.id) continue;
    if (r.keka_approved_by_name === was.name) r.keka_approved_by_name = now.name;
    if (r.rejected_stage === 'keka' && r.rejected_by_name === was.name) r.rejected_by_name = now.name;
    for (const h of r.history ?? []) {
      if (!String(h.event).startsWith('keka_')) continue;
      // My own claim skipped the owner step only while the code was mine: for any other persona its
      // owner approved it at that moment (never "You own this Keka Code" signed by Priya), and back.
      if (r.employee_id === ME.id && (h.event === 'keka_skipped' || h.event === 'keka_approved')) {
        const mine = now.id === ME.id;
        Object.assign(h, mine ? { event: 'keka_skipped', byId: ME.id, byName: ME.name, note: KEKA_SKIP_NOTE } : { event: 'keka_approved', byId: now.id, byName: now.name, note: undefined });
        r.keka_approved_at = mine ? null : h.at;
        r.keka_approved_by_name = mine ? null : now.name;
      } else if (h.byId === was.id) Object.assign(h, { byId: now.id, byName: now.name });
    }
  }
});

// reimbursements.js parseAmount / validateReceipt (shared with petty cash).
const parseAmount = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 10000000 && Math.round(n * 100) === n * 100 ? n : null;
};
const receiptOk = (d: unknown) => typeof d === 'string' && /^data:(image\/(png|jpe?g|webp|heic|heif)|application\/pdf);base64,/i.test(d);

function submit(body: unknown) {
  const b = (body || {}) as Record<string, unknown>;
  const code = String(b.kekaCode || '').trim();
  if (!code) return fail('Select a Keka Code.');
  const purpose = String(b.purpose || '').trim().toLowerCase();
  if (!PURPOSES[purpose]) return fail('Choose a purpose: Food, Fuel, Accommodation or Transportation.');
  const amount = parseAmount(b.amount);
  if (amount === null) return fail('Enter a valid amount.');
  if (!b.fileData) return fail('Attach the bill/receipt.');
  if (!receiptOk(b.fileData)) return fail('The bill must be a photo (JPG/PNG) or a PDF.');
  const p = projectById(String(b.projectId || '')) ?? projectByCode(code);
  if (!p) return fail('That Keka Code was not found for your company.');
  if (p.status === 'inactive') return fail('That Keka Code has been deactivated.');
  if (p.kekaCode.toLowerCase() !== code.toLowerCase()) return fail('The Keka Code does not match the selected project.');
  const owner = ownerOf(p);
  if (!owner) return fail(`The Keka Code "${p.kekaCode}" has no Cost Code Owner set up in Projects — ask HR/Admin to add one before claiming against it.`);
  const selfOwned = owner.id === ME.id;
  const status = selfOwned ? 'pending_accounts_approval' : 'pending_keka_approval';
  const now = nowIso();
  const r: Reimbursement = {
    id: newId('rmb'),
    tenant_id: DEMO_TENANT_ID,
    employee_id: ME.id,
    employee_name: ME.name,
    employee_number: String(profile.employeeNumber || ''),
    keka_code: p.kekaCode,
    project_id: p.id,
    project_name: p.name,
    keka_owner_user_id: owner.id,
    keka_owner_name: owner.name,
    purpose,
    amount,
    status,
    receipt_name: String(b.fileName || 'receipt').slice(0, 180),
    history: [
      ev('submitted', status, now, ME, { amount, purpose }),
      ...(selfOwned ? [ev('keka_skipped', status, now, ME, { note: KEKA_SKIP_NOTE })] : []),
    ],
    payment: {},
    created_at: now,
    updated_at: now,
  };
  ROWS.unshift(r);
  RECEIPTS.set(r.id, String(b.fileData));
  return { ok: true, reimbursement: r };
}

function load(id: string) {
  return ROWS.find((r) => r.id === id);
}

function step(r: Reimbursement, patch: Partial<Reimbursement>, entry: HistoryEntry) {
  Object.assign(r, patch, { history: [...(r.history ?? []), entry], updated_at: entry.at });
}

function reupload(id: string, body: unknown) {
  const r = load(id);
  if (!r) return notFound('Reimbursement not found.');
  if (r.employee_id !== ME.id) return fail('Only the person who claimed this can re-upload it.', 403);
  if (r.status !== 'rejected') return fail('Only a rejected reimbursement can be re-uploaded.', 409);
  const b = (body || {}) as Record<string, unknown>;
  const amount = parseAmount(b.amount);
  if (amount === null) return fail('Enter a valid amount.');
  if (!b.fileData) return fail('Attach the corrected bill/receipt.');
  if (!receiptOk(b.fileData)) return fail('The bill must be a photo (JPG/PNG) or a PDF.');
  const prev = Number(r.amount);
  const selfOwned = r.keka_owner_user_id === ME.id;
  const toKeka = !selfOwned && !(r.rejected_stage === 'accounts' && Math.round(amount * 100) === Math.round(prev * 100));
  const status = toKeka ? 'pending_keka_approval' : 'pending_accounts_approval';
  const note = toKeka
    ? r.rejected_stage === 'accounts'
      ? `The amount changed, so the Keka Code Owner must approve it again.`
      : 'Re-uploaded after the Keka Code Owner rejected it.'
    : selfOwned
      ? 'You own this Keka Code, so it goes straight to Accounts.'
      : 'Same amount as the one the Keka Code Owner approved, so it goes straight back to Accounts.';
  RECEIPTS.set(r.id, String(b.fileData));
  step(
    r,
    {
      status,
      amount,
      receipt_name: String(b.fileName || 'receipt').slice(0, 180),
      rejected_stage: null,
      rejected_at: null,
      rejected_by_name: null,
      rejection_reason: null,
      ...(toKeka ? { keka_approved_at: null, keka_approved_by_name: null } : {}),
    },
    ev('reuploaded', status, nowIso(), ME, { amount, previousAmount: prev, kekaApprovalRequired: toKeka, note }),
  );
  return { ok: true, status, kekaApprovalRequired: toKeka };
}

function respond(id: string, body: unknown) {
  const r = load(id);
  if (!r) return notFound('Reimbursement not found.');
  if (r.employee_id !== ME.id) return fail('Only the person who claimed this reimbursement can confirm whether the money was received.', 403);
  const response = (body as { response?: unknown })?.response;
  if (response !== 'received' && response !== 'not_received') return fail('Choose Received or Not Received.');
  const from = response === 'received' ? ['payment_processing', 'not_received'] : ['payment_processing'];
  if (!from.includes(String(r.status))) {
    return fail(
      r.status === 'received'
        ? 'You have already confirmed this as received.'
        : r.status === 'not_received'
          ? 'You have already reported this as not received — Accounts is following up.'
          : 'Payment has not been started yet, so there is nothing to confirm.',
      409,
    );
  }
  const note = String((body as { note?: unknown })?.note ?? '').trim().slice(0, 500);
  const at = nowIso();
  const payment: Payment = { ...(r.payment ?? {}), response: { response, at, byName: ME.name, note } };
  step(r, { status: response, payment }, ev(response, response, at, ME, note ? { note } : {}));
  return { ok: true, status: response, payment };
}

function kekaDecide(id: string, approve: boolean, body: unknown) {
  const r = load(id);
  if (!r) return notFound('Reimbursement not found.');
  if (!mayActAsOwner(r)) return fail(`Only the Keka Code Owner can ${approve ? 'approve' : 'reject'} this reimbursement.`, 403);
  if (r.employee_id === ME.id) return fail(approve ? 'You can’t approve your own reimbursement — someone else has to.' : 'You can’t reject your own reimbursement.', 403);
  if (r.status !== 'pending_keka_approval') return fail('This reimbursement is not waiting for Keka Code Owner approval.', 409);
  const at = nowIso();
  if (approve) {
    const note = String((body as { note?: unknown })?.note ?? '').trim().slice(0, 500);
    step(r, { status: 'pending_accounts_approval', keka_approved_at: at, keka_approved_by_name: ME.name }, ev('keka_approved', 'pending_accounts_approval', at, ME, { amount: Number(r.amount), ...(note ? { note } : {}) }));
    return { ok: true, status: r.status };
  }
  const reason = String((body as { reason?: unknown })?.reason ?? '').trim().slice(0, 500);
  if (!reason) return fail('Give a reason for rejecting — the requester will see it.');
  step(r, { status: 'rejected', rejected_stage: 'keka', rejected_at: at, rejected_by_name: ME.name, rejection_reason: reason }, ev('keka_rejected', 'rejected', at, ME, { note: reason }));
  return { ok: true, status: 'rejected' };
}

const newestFirst = (a: Reimbursement, b: Reimbursement) => b.created_at.localeCompare(a.created_at);

export const reimbursementRoutes: Route[] = [
  ['GET', /^\/reimbursements\/mine$/, gate('view your reimbursements', () => ({ ok: true, reimbursements: ROWS.filter((r) => r.employee_id === ME.id).sort(newestFirst) }))],
  [
    'GET',
    /^\/reimbursements\/keka-all$/,
    gate('view reimbursements awaiting your approval', () => ({ ok: true, reimbursements: ROWS.filter((r) => overseer() || r.keka_owner_user_id === ME.id).sort(newestFirst) })),
  ],
  ['POST', /^\/reimbursements$/, gate('submit a reimbursement', (_p: string[], body: unknown) => submit(body))],
  [
    'GET',
    /^\/reimbursements\/([^/]+)\/receipt$/,
    gate('view this receipt', ([, id]: string[]) => {
      const r = load(id!);
      if (!r) return notFound('Reimbursement not found.');
      if (r.employee_id !== ME.id && !mayActAsOwner(r) && currentPersona().role !== 'accounts') return fail('You do not have permission to view this receipt.', 403);
      return { ok: true, fileData: RECEIPTS.get(r.id) ?? RECEIPT_PNG, fileName: RECEIPTS.has(r.id) ? r.receipt_name || 'receipt' : (r.receipt_name || 'receipt').replace(/\.\w+$/, '.png') };
    }),
  ],
  ['POST', /^\/reimbursements\/([^/]+)\/reupload$/, gate('reupload a reimbursement', ([, id]: string[], body: unknown) => reupload(id!, body))],
  ['POST', /^\/reimbursements\/([^/]+)\/payment\/respond$/, gate('confirm a reimbursement payment', ([, id]: string[], body: unknown) => respond(id!, body))],
  ['POST', /^\/reimbursements\/([^/]+)\/keka-approve$/, gate('approve a reimbursement', ([, id]: string[], body: unknown) => kekaDecide(id!, true, body))],
  ['POST', /^\/reimbursements\/([^/]+)\/keka-reject$/, gate('reject a reimbursement', ([, id]: string[], body: unknown) => kekaDecide(id!, false, body))],
];

// ── Exports for the domain fixtures (Wave 0, docs/port/EXTENSION-POINTS.md §10) ──
// The live expense-claim rows (every employee's) the routes above read, and receipts uploaded in the
// demo by claim id, so the Accounts desk and the claimant's screens agree.
export const reimbursementStore: Reimbursement[] = ROWS;
export const reimbursementReceipts = RECEIPTS;

/**
 * Move a claim to another stage the way reimbursements.js records it: the status and any extra fields,
 * plus one history entry (`event`, default the status) by `by` (the demo person by default). The caller
 * applies the role rules first. Null when missing.
 */
export function setReimbursementStage(
  id: string,
  status: string,
  patch: Partial<Reimbursement> = {},
  opts: { event?: string; by?: { id: string; name: string }; extra?: Partial<HistoryEntry> } = {},
): Reimbursement | null {
  const r = load(id);
  if (!r) return null;
  step(r, { ...patch, status }, ev(opts.event ?? status, status, nowIso(), opts.by ?? ME, opts.extra));
  return r;
}
