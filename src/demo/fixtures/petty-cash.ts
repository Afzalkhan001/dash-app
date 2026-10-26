// Petty Cash (server.js ~L3240-4553): expense heads, requests (the ones I am paid, raised, or own the
// Keka Code of), old-flow bills, my bill submissions, the over-advance "extra" claims, the Statement
// of Expenses, and the actions: raise (for me or a teammate — the teammate's code is 123456 in the
// demo), confirm / resend / delete an on-behalf request, approve / reject as Keka Code Owner,
// Received / Not Received, submitting bills (which raises an extra claim when they exceed the petty
// cash given against that code, exactly as pettyCashSettleOverspend does; every bill needs its receipt
// and a date within the last 180 days; the same bill twice is a 409 warning sent again with
// confirmDuplicates), and withdrawing a bill I sent (it stays on record but stops counting; the extra
// claims in its pool shrink or close, as pettyCashRebalancePool does).
//   pending_confirmation → pending_approval → pending_accounts_approval → ready_for_payment
//   → payment_processing → received | not_received          (rejected at either approval)
// By persona (demo/personas.ts): Accounts, the super admin and the master admin see every request
// (PETTY_CASH_ADMIN_ROLES). The first approval is the Keka Code Owner's alone — Accounts stands in only
// on a code with no owner — and always moves the request on to Accounts (pending_accounts_approval,
// stamped kekaApprovedById), as server.js canActAtPettyCashOwnerStage does. Accounts may reject at
// either stage; every reject needs a reason. The Nimbus and Showreel codes are the demo person's only
// while the persona owns them (Afzal Manager), so their requests follow the owner.

import type {
  ExpenseHead,
  PettyCashBill,
  PettyCashExcess,
  PettyCashHeadLine,
  PettyCashHistoryEntry,
  PettyCashRequest,
  PettyCashStatement,
  PettyCashStatementSheet,
  PettyCashSubmission,
} from '@/api/petty-cash';
import { DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { MY_CODE_PROJECTS, ownerOf, personById, profile, projectByCode, projectById } from '@/demo/fixtures/org';
import { currentPersona, onPersonaChange } from '@/demo/personas';
import { addDays, DEMO_CODE, daysAgo, epochId, fail, hex6, minutesAgo, newId, notFound, nowIso, RECEIPT_PNG, today, wrongCode, type Route } from '@/demo/state';

const T0 = today();
const ME = { id: DEMO_USER.id, name: String(DEMO_USER.name) };
const RAMESH = { id: 'u-ramesh', name: 'Ramesh Gupta' };
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Expense heads ("petty cash departments") ─────────────────────────────────
const HEADS: (ExpenseHead & { tenantId: string })[] = [
  ['pcd-food', 'Food & Beverages'],
  ['pcd-travel', 'Travel & Conveyance'],
  ['pcd-rental', 'Equipment Rental'],
  ['pcd-props', 'Props & Set Material'],
  ['pcd-location', 'Location Charges'],
  ['pcd-talent', 'Talent / Junior Artists'],
  ['pcd-fuel', 'Fuel'],
  ['pcd-misc', 'Miscellaneous'],
  ['pcd-print', 'Printing & Stationery (old)'],
].map(([id, name], i) => ({ id: id!, name: name!, active: id !== 'pcd-print', sortOrder: i + 1, tenantId: DEMO_TENANT_ID }));
const headName = (id: string) => HEADS.find((h) => h.id === id)?.name ?? 'Not specified';
const lines = (...pairs: [string, number][]): PettyCashHeadLine[] => pairs.map(([id, amount]) => ({ departmentId: id, departmentName: headName(id), amount }));

// ── Requests ─────────────────────────────────────────────────────────────────
type Req = PettyCashRequest & { tenantId: string; employeeNumber?: string; excessBatchId?: string; confirmedById?: string };

const later = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3600000).toISOString();
const hist = (status: string, at: string, by: { id: string; name: string }, extra: Partial<PettyCashHistoryEntry> = {}): PettyCashHistoryEntry => ({ status, at, byId: by.id, byName: by.name, ...extra });

function request(r: {
  seed: string;
  code: string;
  employee: string;
  requestedBy?: string;
  departments: PettyCashHeadLine[];
  remarks: string;
  status: string;
  created: string;
  extra?: (base: Req) => Partial<Req>;
}): Req {
  const p = projectByCode(r.code)!;
  const owner = ownerOf(p);
  const emp = personById(r.employee)!;
  const raiser = personById(r.requestedBy ?? r.employee)!;
  const base: Req = {
    id: epochId('pcr', r.created, r.seed),
    tenantId: DEMO_TENANT_ID,
    kekaCode: p.kekaCode,
    projectId: p.id,
    projectName: p.name,
    costCodeOwnerId: owner?.id ?? null,
    costCodeOwnerName: owner?.name ?? '',
    employeeId: emp.id,
    employeeName: emp.name,
    employeeNumber: emp.employeeNumber,
    employeeDept: emp.dept,
    requestedById: raiser.id,
    requestedByName: raiser.name,
    onBehalf: emp.id !== raiser.id,
    departments: r.departments,
    amount: round2(r.departments.reduce((s, d) => s + d.amount, 0)),
    remarks: r.remarks,
    status: r.status,
    createdAt: r.created,
    paymentHistory: [],
  };
  return { ...base, ...(r.extra ? r.extra(base) : {}) };
}

// Keka approval → Accounts authorization → payment started (→ the payee's answer).
function through(b: Req, stage: 'accounts' | 'authorized' | 'processing' | 'received', hours = [6, 24, 30, 40]) {
  const owner = { id: b.costCodeOwnerId ?? '', name: b.costCodeOwnerName ?? '' };
  const out: Partial<Req> = { kekaApprovedAt: later(b.createdAt!, hours[0]!), kekaApprovedByName: owner.name };
  if (stage === 'accounts') return out;
  const authAt = later(b.createdAt!, hours[1]!);
  const history = [hist('ready_for_payment', authAt, RAMESH)];
  Object.assign(out, { approvedAt: authAt, approvedByName: RAMESH.name, paymentHistory: history });
  if (stage === 'authorized') return out;
  const procAt = later(b.createdAt!, hours[2]!);
  const digits = (s: string) => String(parseInt(hex6(s), 16) % 10000).padStart(4, '0');
  const pay = { paymentDate: procAt.slice(0, 10), reference: `UTR ${digits(b.id)} ${digits(`${b.id}x`)} ${digits(`${b.id}y`)}`, method: 'bank_transfer' };
  history.push(hist('payment_processing', procAt, RAMESH, pay));
  Object.assign(out, { processingAt: procAt, processingByName: RAMESH.name, paymentDate: pay.paymentDate, paymentReference: pay.reference, paymentMethod: pay.method });
  if (stage === 'processing') return out;
  const recAt = later(b.createdAt!, hours[3]!);
  history.push(hist('received', recAt, { id: b.employeeId, name: b.employeeName ?? '' }));
  return { ...out, userResponse: { response: 'received', at: recAt, byName: b.employeeName, note: '' } };
}

const BATCH_KISAN = epochId('pcbb', daysAgo(26, '20:10'), 'batch-kisan');
const BATCH_SJW = epochId('pcbb', daysAgo(3, '19:30'), 'batch-sjw');

const REQUESTS: Req[] = [
  request({
    seed: 'pc-kisan',
    code: 'TM_KAG_LAUNCH',
    employee: ME.id,
    departments: lines(['pcd-food', 6000], ['pcd-travel', 5000], ['pcd-props', 4000]),
    remarks: 'Two-day Ramoji schedule for the launch film — crew meals, the tempo traveller and set dressing.',
    status: 'received',
    created: daysAgo(30, '11:00'),
    extra: (b) => through(b, 'received'),
  }),
  request({
    seed: 'pc-kisan-extra',
    code: 'TM_KAG_LAUNCH',
    employee: ME.id,
    departments: lines(['pcd-props', 1850]),
    remarks: 'Bills of ₹16850 were submitted against ₹15000 of petty cash, so ₹1850 more is needed to cover them.',
    status: 'pending_approval',
    created: daysAgo(26, '20:10'),
    extra: () => ({ kind: 'excess', excessBatchId: BATCH_KISAN, billsTotal: 16850, allocatedTotal: 15000 }),
  }),
  request({
    seed: 'pc-sjw',
    code: 'TM_SJW_DIWALI26',
    employee: ME.id,
    departments: lines(['pcd-food', 3000], ['pcd-location', 5000]),
    remarks: 'Jewellery-film shoot at the Taj Krishna suite — crew breakfast and the location deposit.',
    status: 'payment_processing',
    created: daysAgo(6, '10:15'),
    extra: (b) => through(b, 'processing', [5, 26, 120]),
  }),
  request({
    seed: 'pc-aarogya',
    code: 'TM_AAR_BRAND26',
    employee: ME.id,
    departments: lines(['pcd-rental', 4000], ['pcd-travel', 1500]),
    remarks: 'Gimbal and wireless monitor rental for the hospital walkthrough reshoot.',
    status: 'pending_approval',
    created: daysAgo(1, '12:40'),
  }),
  request({
    seed: 'pc-kathalu',
    code: 'TM_KTH_S2',
    employee: ME.id,
    departments: lines(['pcd-talent', 12000]),
    remarks: 'Junior artists for the market sequence (8 people × ₹1,500).',
    status: 'rejected',
    created: daysAgo(20, '09:30'),
    extra: (b) => ({
      rejectedStage: 'keka',
      rejectedAt: later(b.createdAt!, 7),
      rejectedByName: 'Deepa Menon',
      rejectionReason: 'Junior artists are paid by the production house for this schedule — no petty cash needed.',
    }),
  }),
  // Raised by the demo person for Kavya, waiting for her code (the demo accepts 123456).
  request({
    seed: 'pc-kavya',
    code: 'TM_INT_REEL26',
    employee: 'u-kavya',
    requestedBy: ME.id,
    departments: lines(['pcd-food', 1200], ['pcd-travel', 1800]),
    remarks: 'Pick-up shots for the showreel at Durgam Cheruvu — cab and snacks for two.',
    status: 'pending_confirmation',
    created: minutesAgo(25),
  }),
  // Waiting on the demo person as Keka Code Owner.
  request({
    seed: 'pc-sneha',
    code: 'TM_INT_REEL26',
    employee: 'u-sneha',
    departments: lines(['pcd-props', 2700], ['pcd-food', 1500]),
    remarks: 'Practical lights and backdrop paper for the showreel title shoot.',
    status: 'pending_approval',
    created: minutesAgo(5 * 60),
  }),
  request({
    seed: 'pc-farhan',
    code: 'TM_NIM_EXPL',
    employee: 'u-farhan',
    departments: lines(['pcd-rental', 9000], ['pcd-fuel', 3000]),
    remarks: 'Sony FX6 kit rental for the founder interviews (2 days) and generator fuel.',
    status: 'pending_approval',
    created: daysAgo(1, '09:50'),
  }),
  request({
    seed: 'pc-anita',
    code: 'TM_NIM_EXPL',
    employee: 'u-anita',
    departments: lines(['pcd-rental', 2500]),
    remarks: 'Studio booking for the VO pick-ups.',
    status: 'pending_accounts_approval',
    created: daysAgo(4, '15:30'),
    extra: (b) => ({ kekaApprovedAt: later(b.createdAt!, 3), kekaApprovedByName: ME.name }),
  }),
  // Other teams' requests, waiting on their own Keka Code Owners (Accounts sees them; only the owner approves).
  request({
    seed: 'pc-meera',
    code: 'TM_AAR_BRAND26',
    employee: 'u-meera',
    departments: lines(['pcd-props', 1800], ['pcd-travel', 900]),
    remarks: 'Standees and flyers for the Aarogya OPD launch, and the cab to the print shop.',
    status: 'pending_approval',
    created: minutesAgo(7 * 60),
  }),
  request({
    seed: 'pc-imran',
    code: 'TM_KTH_S2',
    employee: 'u-imran',
    departments: lines(['pcd-rental', 6500], ['pcd-fuel', 1500]),
    remarks: 'Two extra HMI lights and a genset for the night market sequence.',
    status: 'pending_approval',
    created: daysAgo(2, '17:20'),
  }),
  // A code with no owner: Accounts gives the first approval, then someone else in Accounts authorizes it.
  request({
    seed: 'pc-meera-pitch',
    code: 'TM_INT_PITCH',
    employee: 'u-meera',
    departments: lines(['pcd-misc', 1400], ['pcd-travel', 600]),
    remarks: 'Printed leave-behinds and the cab for the Kisan Agro pitch meeting.',
    status: 'pending_approval',
    created: minutesAgo(3 * 60),
  }),
];

// ── Old-flow bills (uploaded against one request) ────────────────────────────
const kisan = REQUESTS[0]!;
const BILLS: (PettyCashBill & { tenantId: string })[] = [
  {
    id: epochId('pcb', daysAgo(28, '18:00'), 'bill-gen'),
    tenantId: DEMO_TENANT_ID,
    requestId: kisan.id,
    kekaCode: kisan.kekaCode,
    projectName: kisan.projectName,
    employeeId: ME.id,
    employeeName: ME.name,
    uploadedById: ME.id,
    uploadedByName: ME.name,
    amount: 2300,
    description: 'Generator rental — day 1 (uploaded before bill submission existed)',
    status: 'approved',
    createdAt: daysAgo(28, '18:00'),
    approvedAt: daysAgo(27, '11:00'),
    hasFile: true,
  },
];

// ── Bill submissions (the expense log; one Statement of Expenses per batch) ──
type Sub = PettyCashSubmission & { tenantId: string; fileData?: string; mimeType?: string; withdrawnById?: string };
const voucher = (iso: string, seed: string) => `PCV-${iso.slice(0, 10).replace(/-/g, '')}-${hex6(seed).toUpperCase()}`;
function sub(batchId: string, created: string, seed: string, code: string, head: string, billDate: string, description: string, paidTo: string, amount: number, extra: Partial<Sub> = {}): Sub {
  const p = projectByCode(code)!;
  return {
    id: epochId('pcbs', created, seed),
    batchId,
    tenantId: DEMO_TENANT_ID,
    employeeId: ME.id,
    employeeName: ME.name,
    projectId: p.id,
    projectName: p.name,
    kekaCode: p.kekaCode,
    billDate,
    departmentId: head,
    departmentName: headName(head),
    description,
    paidTo,
    amount,
    voucherNumber: voucher(created, seed),
    fileName: `${seed}.jpg`,
    hasFile: true,
    createdAt: created,
    ...extra,
  };
}
const kisanAt = daysAgo(26, '20:10');
const sjwAt = daysAgo(3, '19:30');
const kisanDay = addDays(T0, -29);
const extraId = REQUESTS[1]!.id;
const SUBS: Sub[] = [
  sub(BATCH_KISAN, kisanAt, 'kisan-food', 'TM_KAG_LAUNCH', 'pcd-food', kisanDay, 'Lunch for 22 crew, both shoot days', 'Annapurna Caterers', 6450, { excessRequestId: extraId }),
  sub(BATCH_KISAN, kisanAt, 'kisan-travel', 'TM_KAG_LAUNCH', 'pcd-travel', kisanDay, 'Tempo Traveller for the crew — 2 days', 'Sri Sai Travels', 5200, { excessRequestId: extraId }),
  sub(BATCH_KISAN, kisanAt, 'kisan-props', 'TM_KAG_LAUNCH', 'pcd-props', addDays(kisanDay, 1), 'Diyas, marigold garlands and a brass urli for the set', 'Laxmi Stores, Begum Bazaar', 3900, { excessRequestId: extraId }),
  sub(BATCH_KISAN, kisanAt, 'kisan-fuel', 'TM_KAG_LAUNCH', 'pcd-fuel', addDays(kisanDay, 1), 'Diesel for the generator', 'HP Petrol Pump, Shamshabad', 1300, { excessRequestId: extraId }),
  sub(BATCH_SJW, sjwAt, 'sjw-food', 'TM_SJW_DIWALI26', 'pcd-food', addDays(T0, -4), 'Breakfast for the jewellery-shoot crew', 'Chutneys, Jubilee Hills', 1450),
  sub(BATCH_SJW, sjwAt, 'sjw-parking', 'TM_SJW_DIWALI26', 'pcd-location', addDays(T0, -4), 'Parking at the hotel for the location recce', 'Taj Krishna', 650, {
    status: 'rejected',
    rejectionReason: 'Parking was included in the location fee — this bill is a duplicate.',
    rejectedByName: RAMESH.name,
    rejectedAt: daysAgo(2, '12:30'),
  }),
];

// ── Rules shared by several actions ──────────────────────────────────────────
const ADVANCE = ['approved', 'ready_for_payment', 'payment_processing', 'paid', 'received', 'not_received'];
const AWAITING_RESPONSE = ['payment_processing', 'paid'];
// server.js PETTY_CASH_ADMIN_ROLES see the company's every request; PETTY_CASH_APPROVER_ROLES
// (Accounts) may approve any of them.
const PETTY_CASH_ADMIN_ROLES = ['accounts', 'super_admin', 'master_admin', 'ceo', 'coo'];
const isAccounts = () => currentPersona().role === 'accounts';
// server.js pettyCashBillCounts: a rejected or withdrawn bill is never counted as spent.
const counts = (b: Sub) => b.status !== 'rejected' && b.status !== 'withdrawn';
// PETTY_CASH_BILL_REJECTABLE_REQUEST: an extra claim whose bills can still be pulled out one by one.
const PULLABLE_CLAIM = ['pending_approval', 'pending_accounts_approval'];
const MAX_BILL_AGE_DAYS = 180;
const visible = (r: Req) =>
  PETTY_CASH_ADMIN_ROLES.includes(currentPersona().role) || r.employeeId === ME.id || r.requestedById === ME.id || r.costCodeOwnerId === ME.id;

// The Nimbus / Showreel codes change hands with the persona: re-point their requests at the owner,
// along with the owner's past Keka decisions on them.
onPersonaChange(() => {
  for (const r of REQUESTS) {
    if (!r.projectId || !MY_CODE_PROJECTS.includes(r.projectId)) continue;
    const owner = ownerOf(projectById(r.projectId));
    const was = r.costCodeOwnerName ?? '';
    const now = owner?.name ?? '';
    // The owner's first approval moves with the code, so the new persona isn't taken for its approver.
    if (r.costCodeOwnerId && r.kekaApprovedById === r.costCodeOwnerId) r.kekaApprovedById = owner?.id ?? undefined;
    r.costCodeOwnerId = owner?.id ?? null;
    r.costCodeOwnerName = now;
    if (was && r.kekaApprovedByName === was) r.kekaApprovedByName = now;
    if (was && r.rejectedStage === 'keka' && r.rejectedByName === was) r.rejectedByName = now;
  }
});

const parseAmount = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 10000000 ? round2(n) : null;
};
const receiptOk = (d: unknown) => typeof d === 'string' && /^data:(image\/(png|jpe?g|webp|heic|heif)|application\/pdf);base64,/i.test(d);

// pettyCashSettleOverspend: bills beyond the petty cash given against a code raise an "extra" request.
function settleOverspend(batchId: string, created: Sub[]): PettyCashExcess[] {
  const out: PettyCashExcess[] = [];
  const codes = [...new Set(created.map((b) => b.kekaCode || ''))];
  for (const code of codes) {
    const mine = REQUESTS.filter((r) => r.employeeId === ME.id && r.kekaCode === code);
    const allocated = round2(mine.filter((r) => r.kind !== 'excess' && ADVANCE.includes(r.status)).reduce((s, r) => s + r.amount, 0));
    if (!(allocated > 0)) continue;
    const claimed = round2(mine.filter((r) => r.kind === 'excess').reduce((s, r) => s + r.amount, 0));
    const spent = round2(SUBS.filter((b) => b.employeeId === ME.id && counts(b) && b.kekaCode === code).reduce((s, b) => s + b.amount, 0));
    const excess = round2(spent - allocated - claimed);
    if (!(excess > 0)) continue;
    const batch = created.filter((b) => b.kekaCode === code);
    const p = projectById(batch[0]!.projectId)!;
    const owner = ownerOf(p);
    const selfOwned = owner?.id === ME.id;
    let left = excess;
    const heads = new Map<string, PettyCashHeadLine>();
    for (const b of [...batch].reverse()) {
      if (left <= 0) break;
      const take = round2(Math.min(left, b.amount));
      const id = b.departmentId || '_none';
      const cur = heads.get(id) ?? { departmentId: b.departmentId || '', departmentName: b.departmentName || 'Not specified', amount: 0 };
      cur.amount = round2(cur.amount + take);
      heads.set(id, cur);
      left = round2(left - take);
    }
    const r: Req = {
      id: newId('pcr'),
      tenantId: DEMO_TENANT_ID,
      kind: 'excess',
      excessBatchId: batchId,
      billsTotal: spent,
      allocatedTotal: allocated,
      kekaCode: p.kekaCode,
      projectId: p.id,
      projectName: p.name,
      costCodeOwnerId: owner?.id ?? null,
      costCodeOwnerName: owner?.name ?? '',
      employeeId: ME.id,
      employeeName: ME.name,
      employeeDept: profile.dept,
      requestedById: ME.id,
      requestedByName: ME.name,
      onBehalf: false,
      departments: [...heads.values()],
      amount: excess,
      remarks: `Bills of ₹${spent} were submitted against ₹${allocated} of petty cash, so ₹${excess} more is needed to cover them.`,
      status: selfOwned ? 'pending_accounts_approval' : 'pending_approval',
      createdAt: nowIso(),
      paymentHistory: [],
    };
    REQUESTS.unshift(r);
    for (const b of batch) b.excessRequestId = r.id;
    out.push({ requestId: r.id, kekaCode: r.kekaCode, amount: excess, billsTotal: spent, allocated, status: r.status, ownerName: owner?.name ?? '', selfOwned });
  }
  return out;
}

function reconcile() {
  const unlinked = SUBS.filter((b) => b.employeeId === ME.id && !b.excessRequestId && counts(b)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return unlinked.length ? settleOverspend(`catchup${Date.now()}`, unlinked) : [];
}

function create(body: unknown) {
  const b = (body || {}) as Record<string, unknown>;
  const code = String(b.kekaCode || '').trim();
  const projectName = String(b.projectName || '').trim();
  const raw = Array.isArray(b.departments) ? (b.departments as Record<string, unknown>[]) : [];
  if (!code) return fail('Select a Keka Code.');
  if (!projectName) return fail('Enter a project name.');
  if (!raw.length) return fail('Select at least one department and enter an amount.');
  const departments: PettyCashHeadLine[] = [];
  for (const d of raw) {
    const head = HEADS.find((h) => h.id === d?.departmentId);
    if (!head || head.active === false) return fail('One of the selected expense heads is no longer available.');
    if (departments.some((x) => x.departmentId === head.id)) return fail(`"${head.name}" is listed more than once.`);
    const amount = parseAmount(d.amount);
    if (amount === null) return fail('Enter a valid amount for every selected department.');
    departments.push({ departmentId: head.id, departmentName: head.name, amount });
  }
  const p = projectById(String(b.projectId || '')) ?? projectByCode(code);
  if (!p) return fail('That Keka Code was not found for your company.');
  if (p.status === 'inactive') return fail('That Keka Code has been deactivated.');
  if (p.kekaCode.toLowerCase() !== code.toLowerCase()) return fail('The Keka Code does not match the selected project.');
  const employeeId = String(b.employeeId || ME.id);
  const onBehalf = employeeId !== ME.id;
  const employee = personById(employeeId);
  if (!employee) return fail('That employee was not found.', 404);
  if (onBehalf && employee.dept !== profile.dept) return fail('You can only raise petty cash on behalf of someone on your own team.', 403);
  const owner = ownerOf(p);
  const selfOwned = owner?.id === ME.id;
  const r: Req = {
    id: newId('pcr'),
    tenantId: DEMO_TENANT_ID,
    kekaCode: p.kekaCode,
    projectId: p.id,
    projectName,
    costCodeOwnerId: owner?.id ?? null,
    costCodeOwnerName: owner?.name ?? '',
    employeeId: employee.id,
    employeeName: employee.name,
    employeeNumber: employee.employeeNumber,
    employeeDept: employee.dept,
    requestedById: ME.id,
    requestedByName: ME.name,
    onBehalf,
    departments,
    amount: round2(departments.reduce((s, d) => s + d.amount, 0)),
    remarks: String(b.remarks || '').trim().slice(0, 500),
    status: onBehalf ? 'pending_confirmation' : selfOwned ? 'pending_accounts_approval' : 'pending_approval',
    createdAt: nowIso(),
    paymentHistory: [],
  };
  REQUESTS.unshift(r);
  return { ok: true, request: r };
}

const find = (id: string) => REQUESTS.find((r) => r.id === id);

function confirm(id: string, body: unknown) {
  const r = find(id);
  if (!r) return notFound('Request not found.');
  if (r.employeeId !== ME.id && r.requestedById !== ME.id) return fail('Only the employee this request is for, or the person who raised it, can confirm it.', 403);
  if (r.status !== 'pending_confirmation') return fail('This request is not waiting on a confirmation.', 409);
  if (String((body as { code?: unknown })?.code ?? '').trim() !== DEMO_CODE) return wrongCode();
  const selfOwned = !!r.costCodeOwnerId && r.costCodeOwnerId === r.requestedById;
  Object.assign(r, { status: selfOwned ? 'pending_accounts_approval' : 'pending_approval', confirmedAt: nowIso(), confirmedById: ME.id });
  return { ok: true };
}

// POST /petty_cash_requests/:id/approve and /reject — the Keka Code Owner's stage (server.js:3761-3815).
function decide(id: string, approve: boolean, body: unknown) {
  const r = find(id);
  if (!r) return notFound('Request not found.');
  if (approve) {
    // canActAtPettyCashOwnerStage: the owner only; Accounts only when the code has no owner.
    const may = r.costCodeOwnerId ? r.costCodeOwnerId === ME.id : isAccounts();
    if (!may) {
      return fail(
        isAccounts() && r.costCodeOwnerId ? `${r.costCodeOwnerName || 'The Keka Code Owner'} has to approve this first - Accounts authorizes it afterwards.` : 'Only the Keka Code Owner can approve this request.',
        403,
      );
    }
    if (r.employeeId === ME.id || r.requestedById === ME.id) return fail('You can’t approve a petty cash request that is for you or that you raised — someone else has to.', 403);
    if (r.status !== 'pending_approval') return fail('This request has already been reviewed.', 409);
    // The first of two sign-offs: it always moves on to Accounts, whoever gave it.
    Object.assign(r, {
      status: 'pending_accounts_approval',
      kekaApprovedAt: nowIso(),
      kekaApprovedById: ME.id,
      kekaApprovedByName: ME.name,
      ...(r.costCodeOwnerId ? {} : { kekaStageBy: 'accounts', kekaStageNote: 'This Keka Code has no owner, so Accounts gave the owner-stage approval.' }),
    });
    return { ok: true };
  }
  // isPettyCashApprover: the owner, or Accounts on any code — one with an owner too (Reject only there).
  if (r.costCodeOwnerId !== ME.id && !isAccounts()) return fail('Only the Keka Code Owner or Accounts can reject this request.', 403);
  const reason = String((body as { reason?: unknown })?.reason ?? '').trim();
  if (!reason) return fail('Give the reason for rejecting this request — the employee will be shown it.', 400);
  if (r.status !== 'pending_approval') return fail('This request has already been reviewed.', 409);
  Object.assign(r, { status: 'rejected', rejectedStage: 'keka', rejectedAt: nowIso(), rejectedById: ME.id, rejectedByName: ME.name, rejectionReason: reason });
  return { ok: true };
}

function respond(id: string, body: unknown) {
  const r = find(id);
  if (!r) return notFound('Request not found.');
  if (r.employeeId !== ME.id) return fail('Only the person this petty cash is for can confirm whether the money was received.', 403);
  const response = (body as { response?: unknown })?.response;
  if (response !== 'received' && response !== 'not_received') return fail('Choose Received or Not Received.');
  const from = response === 'received' ? [...AWAITING_RESPONSE, 'not_received'] : AWAITING_RESPONSE;
  if (!from.includes(r.status)) {
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
  Object.assign(r, {
    status: response,
    userResponse: { response, at, byName: ME.name, note },
    paymentHistory: [...(r.paymentHistory ?? []), hist(response, at, ME, note ? { note } : {})],
  });
  if (response === 'received') reconcile();
  return { ok: true, request: r };
}

function submitBills(body: unknown) {
  const bills = Array.isArray((body as { bills?: unknown })?.bills) ? ((body as { bills: Record<string, unknown>[] }).bills) : [];
  if (!bills.length) return fail('Add at least one bill before submitting.');
  const latest = addDays(today(), 1);
  const earliest = addDays(today(), -(MAX_BILL_AGE_DAYS + 1));
  const prepared: Sub[] = [];
  const batchId = newId('pcbb');
  for (let i = 0; i < bills.length; i++) {
    const b = bills[i] || {};
    const label = `Bill ${i + 1}`;
    const p = projectById(String(b.projectId || ''));
    if (!b.projectId) return fail(`${label}: Keka Code is required.`);
    const head = HEADS.find((h) => h.id === b.departmentId);
    if (!head || head.active === false) return fail(`${label}: select an expense head.`);
    if (!String(b.description || '').trim()) return fail(`${label}: description is required.`);
    if (!String(b.paidTo || '').trim()) return fail(`${label}: "Paid To" is required.`);
    const amount = parseAmount(b.amount);
    if (amount === null) return fail(`${label}: enter a valid amount.`);
    const billDate = String(b.billDate || '').trim();
    if (!billDate) return fail(`${label}: bill date is required.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate) || Number.isNaN(Date.parse(`${billDate}T00:00:00Z`))) return fail(`${label}: bill date is not a valid date.`);
    if (billDate > latest) return fail(`${label}: bill date cannot be in the future.`);
    if (billDate < earliest) return fail(`${label}: bill date cannot be more than ${MAX_BILL_AGE_DAYS} days ago.`);
    // Every bill needs its receipt.
    if (!b.fileData) return fail(`${label}: attach the bill/receipt.`);
    if (!receiptOk(b.fileData)) return fail(`${label}: the bill must be a photo (JPG/PNG) or a PDF.`);
    if (!p) return fail(`${label}: Keka Code could not be found.`);
    const created = nowIso();
    prepared.push({
      id: newId('pcbs'),
      batchId,
      tenantId: DEMO_TENANT_ID,
      employeeId: ME.id,
      employeeName: ME.name,
      projectId: p.id,
      projectName: p.name,
      kekaCode: p.kekaCode,
      billDate,
      departmentId: head.id,
      departmentName: head.name,
      description: String(b.description).trim().slice(0, 500),
      paidTo: String(b.paidTo).trim().slice(0, 200),
      amount,
      voucherNumber: voucher(created, `${batchId}-${i}`),
      fileName: String(b.fileName || 'bill').slice(0, 180),
      fileData: String(b.fileData),
      mimeType: String(b.mimeType || ''),
      hasFile: true,
      createdAt: created,
    });
  }
  // The same bill twice — in this submission, or one already sent and still counted — is a warning the
  // employee confirms (409 needsConfirmation), not a refusal: two identical cab rides can be genuine.
  if ((body as { confirmDuplicates?: unknown })?.confirmDuplicates !== true) {
    const keyOf = (x: Sub) => [x.projectId, x.departmentId, Number(x.amount), x.billDate, String(x.paidTo || '').trim().toLowerCase()].join('|');
    const clashes: string[] = [];
    const seen = new Map<string, number>();
    prepared.forEach((p, i) => {
      const k = keyOf(p);
      if (seen.has(k)) clashes.push(`Bill ${i + 1} looks identical to Bill ${seen.get(k)! + 1}`);
      else seen.set(k, i);
    });
    const earlier = new Map(SUBS.filter((x) => x.employeeId === ME.id && counts(x)).map((x) => [keyOf(x), x]));
    prepared.forEach((p, i) => {
      const hit = earlier.get(keyOf(p));
      if (hit) clashes.push(`Bill ${i + 1} looks identical to ${hit.voucherNumber || 'a bill you already submitted'}`);
    });
    if (clashes.length) {
      return {
        ...fail(`${clashes.join('; ')} (same Keka Code, expense head, amount, date and payee). Submit anyway only if they really are separate bills.`, 409),
        needsConfirmation: true,
        duplicates: clashes,
      };
    }
  }
  SUBS.unshift(...prepared);
  const excess = settleOverspend(batchId, prepared);
  return { ok: true, bills: prepared.map(({ fileData: _f, ...rest }) => rest), batchId, excess };
}

// GET /petty_cash_bill_submissions/statement/:batchId — one statement per Keka Code in the batch.
function statement(batchId: string, requestId: string): (PettyCashStatement & { ok: true }) | ReturnType<typeof fail> {
  const found = requestId ? SUBS.filter((b) => b.excessRequestId === requestId) : SUBS.filter((b) => b.batchId === batchId);
  if (!found.length) return notFound('Statement not found.');
  const byCode = new Map<string, Sub[]>();
  for (const b of [...found].sort((a, c) => String(a.createdAt).localeCompare(String(c.createdAt)))) {
    const k = b.kekaCode || '—';
    byCode.set(k, [...(byCode.get(k) ?? []), b]);
  }
  const statements: PettyCashStatementSheet[] = [...byCode.entries()].map(([kekaCode, all]) => {
    const bills = all.filter(counts);
    const total = round2(bills.reduce((s, b) => s + b.amount, 0));
    const totals = new Map<string, number>();
    for (const b of bills) totals.set(b.departmentId || '_none', round2((totals.get(b.departmentId || '_none') ?? 0) + b.amount));
    const heads = HEADS.filter((h) => h.active !== false).map((h) => ({ id: h.id, name: h.name, total: totals.get(h.id) ?? 0 }));
    const inflow = REQUESTS.filter((r) => r.employeeId === all[0]!.employeeId && r.kekaCode === kekaCode && ['received', 'paid'].includes(r.status))
      .map((r) => ({ date: r.paymentDate || String(r.processingAt || r.approvedAt || r.createdAt || '').slice(0, 10), amount: r.amount, reference: r.paymentReference || '' }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const advance = round2(inflow.reduce((s, i) => s + i.amount, 0));
    const shown = bills.length ? bills : all;
    const dates = shown.map((b) => b.billDate).filter((d): d is string => !!d).sort();
    const startDate = dates[0] || String(shown[0]!.createdAt || '').slice(0, 10);
    const endDate = dates[dates.length - 1] || startDate;
    const days = Math.max(1, Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1);
    return {
      kekaCode,
      projectName: all[0]!.projectName || '',
      startDate,
      days,
      submittedAt: String(all[all.length - 1]!.createdAt || ''),
      heads,
      total,
      inflow,
      advance,
      balance: round2(advance - total),
      lines: all.map((b) => ({
        id: b.id,
        hasFile: !!b.hasFile,
        voucherNumber: b.voucherNumber,
        head: b.departmentName || 'Not specified',
        amount: b.amount,
        date: b.billDate || '',
        project: b.projectName || '',
        description: b.description || '',
        paidTo: b.paidTo || '',
        status: b.status === 'rejected' ? ('rejected' as const) : b.status === 'withdrawn' ? ('withdrawn' as const) : ('active' as const),
        canReject: false,
        canWithdraw: pullable(b) && b.employeeId === ME.id,
        ...(b.status === 'rejected' ? { rejectionReason: b.rejectionReason || '', rejectedByName: b.rejectedByName || '', rejectedAt: b.rejectedAt || '' } : {}),
        ...(b.status === 'withdrawn' ? { withdrawnAt: b.withdrawnAt || '', withdrawnByName: b.withdrawnByName || '' } : {}),
      })),
    };
  });
  return {
    ok: true,
    batchId,
    employee: { name: ME.name, employeeNumber: profile.employeeNumber, designation: String(profile.jobTitle || ''), location: String(profile.location || '') },
    statements,
  };
}

const newest = <T extends { createdAt?: string }>(a: T, b: T) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

/** A bill that can still be rejected or withdrawn: counted, and not inside an extra claim already decided. */
export function pullable(b: Sub) {
  const linked = b.excessRequestId ? find(b.excessRequestId) : null;
  return counts(b) && (!linked || PULLABLE_CLAIM.includes(linked.status));
}

/**
 * pettyCashRebalancePool (server.js): once a bill is pulled out (rejected or withdrawn), every extra
 * claim of that person and code still waiting to be authorized is measured again, newest first, and can
 * only shrink; one left with nothing to claim is closed and its bills detached. Returns what changed.
 */
export function rebalanceAfterPull(bill: Sub, kind: 'rejected' | 'withdrawn', reason: string, by: { id: string; name: string } = ME) {
  const code = String(bill.kekaCode || '').toLowerCase();
  const sum = (rows: { amount: number }[]) => round2(rows.reduce((s, x) => s + x.amount, 0));
  const same = (x: { employeeId: string; kekaCode?: string }) => x.employeeId === bill.employeeId && String(x.kekaCode || '').toLowerCase() === code;
  const changes: { requestId: string; before: number; after: number; closed: boolean }[] = [];
  for (const r of REQUESTS.filter((x) => same(x) && x.kind === 'excess' && PULLABLE_CLAIM.includes(x.status)).sort(newest)) {
    const mine = REQUESTS.filter(same);
    const allocated = sum(mine.filter((x) => x.kind !== 'excess' && ADVANCE.includes(x.status)));
    const claimed = sum(mine.filter((x) => x.kind === 'excess' && x.id !== r.id));
    const spent = sum(SUBS.filter((x) => same(x) && counts(x)));
    const after = Math.min(r.amount, Math.max(0, round2(spent - allocated - claimed)));
    if (after === r.amount) continue;
    const before = r.amount;
    const live = SUBS.filter((x) => x.excessRequestId === r.id && counts(x)).sort(newest);
    let left = after;
    const heads = new Map<string, PettyCashHeadLine>();
    for (const x of live) {
      if (left <= 0) break;
      const take = round2(Math.min(left, x.amount));
      const k = x.departmentId || '_none';
      const cur = heads.get(k) ?? { departmentId: x.departmentId || '', departmentName: x.departmentName || 'Not specified', amount: 0 };
      cur.amount = round2(cur.amount + take);
      heads.set(k, cur);
      left = round2(left - take);
    }
    Object.assign(r, { amount: after, billsTotal: spent, departments: [...heads.values()] });
    if (after <= 0) {
      const own = r.id === bill.excessRequestId ? kind : 'pool';
      Object.assign(r, {
        status: 'rejected',
        rejectedStage: own === 'rejected' ? 'accounts' : own,
        rejectedAt: nowIso(),
        rejectedById: by.id,
        rejectedByName: by.name,
        rejectionReason:
          own === 'withdrawn'
            ? `Every bill in this extra claim was withdrawn by ${by.name || 'the employee'}`
            : own === 'pool'
              ? 'No longer needed: a bill that shared this petty cash was pulled out, so the petty cash already given covers the rest'
              : `Every bill in this extra claim was rejected by Accounts${reason ? ` — ${reason}` : ''}`,
      });
      // A closed claim no longer exists, so its bills are plain bills inside the petty cash again.
      for (const x of live) x.excessRequestId = undefined;
    }
    changes.push({ requestId: r.id, before, after, closed: after <= 0 });
  }
  return changes;
}

// DELETE /petty_cash_bill_submissions/:id — the employee withdraws a bill they sent (server.js:4570).
function withdrawBill(id: string) {
  const b = SUBS.find((x) => x.id === id);
  if (!b) return notFound('Bill not found.');
  if (b.employeeId !== ME.id) return fail('Only the person who submitted this bill can withdraw it.', 403);
  if (b.status === 'withdrawn') return fail('This bill has already been withdrawn.', 409);
  if (b.status === 'rejected') return fail('Accounts has already rejected this bill.', 409);
  const linked = b.excessRequestId ? find(b.excessRequestId) : null;
  if (linked && !PULLABLE_CLAIM.includes(linked.status))
    return fail(`This bill is part of an extra claim that has already been ${linked.status === 'rejected' ? 'rejected' : 'authorized'}, so it can no longer be withdrawn on its own.`, 409);
  const claimId = b.excessRequestId;
  Object.assign(b, { status: 'withdrawn', withdrawnAt: nowIso(), withdrawnById: ME.id, withdrawnByName: ME.name });
  const changes = rebalanceAfterPull(b, 'withdrawn', '');
  const own = changes.find((c) => c.requestId === claimId) ?? null;
  return { ok: true, bill: { id, status: 'withdrawn' as const }, claim: own ? { before: own.before, after: own.after, closed: own.closed } : null, otherClaimsChanged: changes.filter((c) => c !== own).length };
}

export const pettyCashRoutes: Route[] = [
  ['GET', /^\/petty_cash_departments$/, () => HEADS],
  ['GET', /^\/petty_cash_requests$/, () => REQUESTS.filter(visible).sort(newest)],
  ['POST', /^\/petty_cash_requests$/, (_p, body) => create(body)],
  ['POST', /^\/petty_cash_requests\/([^/]+)\/confirm$/, ([, id], body) => confirm(id!, body)],
  [
    'POST',
    /^\/petty_cash_requests\/([^/]+)\/resend-otp$/,
    ([, id]) => {
      const r = find(id!);
      if (!r) return notFound('Request not found.');
      if (r.status !== 'pending_confirmation') return fail('This request is not waiting on a confirmation.', 409);
      return { ok: true };
    },
  ],
  [
    'DELETE',
    /^\/petty_cash_requests\/([^/]+)$/,
    ([, id]) => {
      const r = find(id!);
      if (!r) return notFound('Request not found.');
      if (r.status !== 'pending_confirmation') return fail('This request can only be deleted while it’s waiting on the teammate’s confirmation.', 409);
      if (r.requestedById !== ME.id) return fail('Only the person who raised this request can delete it.', 403);
      REQUESTS.splice(REQUESTS.indexOf(r), 1);
      return { ok: true };
    },
  ],
  ['POST', /^\/petty_cash_requests\/([^/]+)\/approve$/, ([, id], body) => decide(id!, true, body)],
  ['POST', /^\/petty_cash_requests\/([^/]+)\/reject$/, ([, id], body) => decide(id!, false, body)],
  ['POST', /^\/petty_cash_requests\/([^/]+)\/payment\/respond$/, ([, id], body) => respond(id!, body)],

  ['GET', /^\/petty_cash_bills$/, () => BILLS],
  ['GET', /^\/petty_cash_bills\/([^/]+)\/receipt$/, ([, id]) => (BILLS.some((b) => b.id === id) ? { fileData: RECEIPT_PNG, fileName: 'generator-rental.png' } : notFound('Bill not found.'))],

  ['POST', /^\/petty_cash_bill_submissions\/reconcile$/, () => ({ ok: true, excess: reconcile() })],
  ['GET', /^\/petty_cash_bill_submissions\/mine$/, () => ({ ok: true, bills: SUBS.filter((b) => b.employeeId === ME.id).sort(newest).map(({ fileData: _f, ...rest }) => rest) })],
  ['GET', /^\/petty_cash_bill_submissions\/statement\/([^/]+)$/, ([, batchId], _b, q) => statement(batchId!, q.get('request') || '')],
  [
    'GET',
    /^\/petty_cash_bill_submissions\/([^/]+)\/receipt$/,
    ([, id]) => {
      const b = SUBS.find((x) => x.id === id);
      if (!b) return notFound('Bill not found.');
      return b.fileData ? { fileData: b.fileData, fileName: b.fileName || 'bill' } : { fileData: RECEIPT_PNG, fileName: `${(b.fileName || 'bill').replace(/\.\w+$/, '')}.png` };
    },
  ],
  ['POST', /^\/petty_cash_bill_submissions$/, (_p, body) => submitBills(body)],
  ['DELETE', /^\/petty_cash_bill_submissions\/([^/]+)$/, ([, id]) => withdrawBill(id!)],
];

// ── Exports for the domain fixtures (Wave 0, docs/port/EXTENSION-POINTS.md §10) ──
// The live petty cash stores the routes above read (requests, bills, bill submissions, expense types),
// so the Accounts desk and the requester's own screens agree.
export type DemoPettyRequest = Req;
export type DemoPettySubmission = Sub;
export const pettyStore: Req[] = REQUESTS;
export const pettyBillStore = BILLS;
export const pettySubmissionStore: Sub[] = SUBS;
export const expenseHeadStore = HEADS;

/**
 * Move a request to another stage the way the server records it: the status, any extra fields
 * (approvedByName, rejectionReason, payment…), and — for the payment stages — a paymentHistory entry
 * by `by` (the demo person by default). The caller applies the role rules first. Null when missing.
 */
export function setPettyStage(id: string, status: string, patch: Partial<Req> = {}, by: { id: string; name: string } = ME): Req | null {
  const r = find(id);
  if (!r) return null;
  const at = nowIso();
  const paying = ['ready_for_payment', 'payment_processing', 'paid', 'received', 'not_received'].includes(status);
  Object.assign(r, patch, { status }, paying ? { paymentHistory: [...(r.paymentHistory ?? []), hist(status, at, by)] } : null);
  return r;
}
