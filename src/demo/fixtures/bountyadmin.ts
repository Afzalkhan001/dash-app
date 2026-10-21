// Demo API for Bounty admin (wave 2): the admin half of the Bounty System (server.js ~L5032-6790,
// sql/bounty_coins_*.sql). It works on bounty.ts's live stores (bountyTaskStore, txStore,
// redemptionStore, walletOf, addTx) so the employee's own Bounty screens and these agree.
//
// Who sees what (Afzal personas):
//   Afzal Super Admin  company wallet 12,000; give / revoke coins; creators + monthly cap; every task
//                      (its own "3 YouTube thumbnails" has 1 to check); use-coins approvals; the ledger
//                      (one recent distribution to Afzal Manager can still be cancelled).
//   Afzal Manager      a granted creator: 5,000 coins received, "30-second teaser" with 3 claims
//                      (waiting, paid, rejected); return coins; my coin history.
//   Afzal HR           creators list (edit), use-coins approvals (Meera 1,500, Sneha 500 waiting);
//                      Referral Coins 3,000.
//   Afzal App Manager  read-only: creators, tasks with claims, approvals list, ledger, summary (approves
//                      only when Company settings › App Manager approvals is on).
//
// The demo person is stored once as DEMO_USER ('demo-user'); the demo server shows it as the active
// persona and maps it back on the way in. Persona-owned records here use the persona's OWN id
// ('demo-manager', 'demo-super-admin', 'demo-hr'), so they stay with that persona whoever is exploring.

import type { BountyClaim, BountySubmission, BountyTask, BountyTxn, BountyWallet } from '@/api/bounty';
import type { CompanyWallet, CreatorSummary, RemindPreview } from '@/api/bountyadmin';
import { DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { addTx, bountyRoutes, bountyTaskStore, redemptionStore, txStore, walletOf } from '@/demo/fixtures/bounty';
import { allPeople, personById, TENANT } from '@/demo/fixtures/org';
import { currentPersona, personaUserId, selfAs, STAFF_PERSONAS } from '@/demo/personas';
import { daysAgo, fail, minutesAgo, newId, notFound, nowIso, RECEIPT_PNG, today, addDays, type Route } from '@/demo/state';
import { isBountyCreator, JOB_OPENING_CREATOR_ROLES } from '@/lib/access';

type Task = (typeof bountyTaskStore)[number];
type Claim = Task['claims'][number] & { submission?: BountySubmission; approvedAt?: string };
type Txn = (typeof txStore)[number] & { approvedAt?: string; releasedAt?: string };

const ME = DEMO_USER.id;
const T0 = today();
const COMPANY_ID = `company_${DEMO_TENANT_ID}`;
const ADMIN_ROLES = ['master_admin', 'super_admin'];
const SUPER = ['super_admin', 'master_admin'];
const OVERSEERS = ['master_admin', 'super_admin', 'ceo', 'coo', 'app_manager'];
// bounty.ts NON_CLAIMING: these personas' answers never include the shared demo person's own claims.
const NON_CLAIMING = ['master_admin', 'app_manager', 'announcement_viewer', 'visitor_manager', 'super_admin'];
const BOUNTY_CREATOR_ROLES = ['super_admin', 'ceo', 'coo'];
const REMIND_COOLDOWN_MS = 24 * 3600000;

const role = () => currentPersona().role;
const me = () => selfAs();
const isMe = (id: unknown) => id === ME || id === me().id;
const takesPart = () => !NON_CLAIMING.includes(role());

/** The persona as a NavUser, for the website's creator test. */
const meAsUser = () => ({ id: me().id, role: role(), name: me().name, employeeNumber: currentPersona().employeeNumber });

// ── People ───────────────────────────────────────────────────────────────────
type Who = { id: string; name: string; role: string; employeeNumber: string; dept?: string; mobile?: string; email?: string; resigned?: boolean; professionalAvailable?: boolean; professionalType?: string };

const PERSONA_PEOPLE: Who[] = STAFF_PERSONAS.filter((p) => ['super_admin', 'manager', 'hr'].includes(p.id)).map((p) => ({
  id: personaUserId(p),
  name: p.label,
  role: p.role,
  employeeNumber: p.employeeNumber,
  dept: p.dept,
}));
function companyPeople(): Who[] {
  const rows = allPeople()
    .filter((p) => p.id !== ME && ((p as { tenantId?: string }).tenantId ?? DEMO_TENANT_ID) === DEMO_TENANT_ID)
    .map((p) => {
      const x = p as unknown as Who;
      return { ...x, role: String(x.role || 'employee'), employeeNumber: String(x.employeeNumber || '') };
    });
  return [...PERSONA_PEOPLE.filter((p) => !rows.some((r) => r.id === p.id)), ...rows];
}
// The demo server maps the active persona's id to DEMO_USER's on the way in: map it back.
const whoById = (id: string): Who | null => {
  const real = id === ME ? me().id : id;
  return companyPeople().find((p) => p.id === real) ?? null;
};
const creatorEligible = (p: Who) => BOUNTY_CREATOR_ROLES.includes(p.role) || isBountyCreator({ id: p.id, role: p.role, name: p.name, employeeNumber: p.employeeNumber }, TENANT);
const referralEligible = (p: Who) => JOB_OPENING_CREATOR_ROLES.includes(p.role);

// ── Wallets ──────────────────────────────────────────────────────────────────
const COMPANY: CompanyWallet & { totalAdded: number; totalDistributed: number; available: number } = {
  id: COMPANY_ID,
  tenantId: DEMO_TENANT_ID,
  name: 'Company Wallet',
  totalAdded: 38000,
  totalDistributed: 26000,
  available: 12000,
};
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fundsLeft = (w: BountyWallet) => Math.max(0, n(w.allocated) - n(w.reserved) - n(w.spent));
const set = (id: string, name: string, patch: Partial<BountyWallet>) => Object.assign(walletOf(id, name), patch);

set('demo-super-admin', 'Afzal Super Admin', { allocated: 6000, reserved: 1000, spent: 0 });
set('demo-manager', 'Afzal Manager', { allocated: 5000, reserved: 600, spent: 600 });
set('demo-hr', 'Afzal HR', { referralAllocated: 3000, referralSpent: 500 });
set('u-kiran', 'Kiran Rao', { allocated: 8000, reserved: 900, spent: 1950 });
set('u-arvind', 'Arvind Menon', { allocated: 4000, reserved: 0, spent: 1550 });
// Colleagues asking to use coins have earned at least that much (leaderboard totals).
set('u-meera', 'Meera Nair', { earned: 3250, redeemed: 1000 });
set('u-sneha', 'Sneha Iyer', { earned: 1800, redeemed: 500 });
set('u-zoya', 'Zoya Khan', { earned: 1450, redeemed: 500 });
set('u-rahul', 'Rahul Verma', { earned: 950, redeemed: 0 });

// ── Ledger seeds (oldest first) ──────────────────────────────────────────────
const seedTx = (t: Omit<BountyTxn, 'status' | 'id'> & Partial<BountyTxn>) => addTx({ id: newId('btx'), ...t });
const fromCompany = { fromWalletId: COMPANY_ID, fromWalletName: 'Company Wallet' };
seedTx({ type: 'COMPANY_CREDIT', amount: 30000, toWalletId: COMPANY_ID, toWalletName: 'Company Wallet', reason: 'FY 2026-27 bounty budget', performedBy: 'DASH platform', createdAt: daysAgo(80, '11:00') });
seedTx({ type: 'COIN_DISTRIBUTION', amount: 8000, ...fromCompany, toWalletId: 'u-kiran', toWalletName: 'Kiran Rao', reason: 'Leadership task budget', performedBy: 'Afzal Super Admin', createdAt: daysAgo(70, '12:00') });
seedTx({ type: 'COIN_DISTRIBUTION', amount: 4000, ...fromCompany, toWalletId: 'u-arvind', toWalletName: 'Arvind Menon', reason: 'Operations task budget', performedBy: 'Afzal Super Admin', createdAt: daysAgo(70, '12:05') });
seedTx({ type: 'COIN_DISTRIBUTION', amount: 6000, ...fromCompany, toWalletId: 'demo-super-admin', toWalletName: 'Afzal Super Admin', reason: 'Company-wide tasks', performedBy: 'Afzal Super Admin', createdAt: daysAgo(40, '10:00') });
seedTx({ type: 'REFERRAL_COIN_DISTRIBUTION', amount: 3000, ...fromCompany, toWalletId: 'demo-hr', toWalletName: 'Afzal HR', reason: 'Referral bonuses this quarter', performedBy: 'Afzal Super Admin', createdAt: daysAgo(35, '16:30') });
seedTx({ type: 'COIN_DISTRIBUTION', amount: 4000, ...fromCompany, toWalletId: 'demo-manager', toWalletName: 'Afzal Manager', reason: 'Creative team tasks', performedBy: 'Afzal Super Admin', createdAt: daysAgo(20, '11:30') });
seedTx({ type: 'COMPANY_CREDIT', amount: 8000, toWalletId: COMPANY_ID, toWalletName: 'Company Wallet', reason: 'Diwali top-up', performedBy: 'DASH platform', createdAt: daysAgo(12, '09:30') });
// Unused, so Super Admin can still cancel it from the ledger.
seedTx({ type: 'COIN_DISTRIBUTION', amount: 1000, ...fromCompany, toWalletId: 'demo-manager', toWalletName: 'Afzal Manager', reason: 'Extra for the Kathalu S2 teaser', performedBy: 'Afzal Super Admin', createdAt: daysAgo(2, '15:10') });

// ── Tasks owned by personas ──────────────────────────────────────────────────
const by = (id: string) => ({ employeeId: id, employeeName: personById(id)?.name ?? 'Employee' });
const task = (t: Omit<Task, 'tenantId' | 'status' | 'claims'> & Partial<Task>): Task => ({
  tenantId: DEMO_TENANT_ID,
  status: 'open',
  claims: [],
  requiresApproval: true,
  maxAttachments: 1,
  ...t,
});
const MANAGER = { creatorId: 'demo-manager', creatorName: 'Afzal Manager' };
const SUPERADMIN = { creatorId: 'demo-super-admin', creatorName: 'Afzal Super Admin' };

const TEASER: Task = task({
  id: 'bt-demo-teaser',
  title: 'Cut a 30-second teaser from the Kathalu S2 rushes',
  desc: 'Pick the strongest moments from the episode 1–3 rushes and cut a 30-second vertical teaser for Instagram. Share a Drive link to the export (1080×1920, under 60 MB) and the project file.',
  category: 'Editing',
  submissionType: 'link',
  maxAttachments: 2,
  reward: 600,
  maxAccepts: 5,
  deptIds: ['dept-creative'],
  deadline: addDays(T0, 6),
  ...MANAGER,
  createdAt: daysAgo(6, '10:15'),
  claims: [
    {
      ...by('u-kavya'),
      status: 'submitted',
      reward: 600,
      position: 3,
      claimedAt: daysAgo(1, '18:40'),
      startedAt: daysAgo(1, '18:40'),
      submittedAt: daysAgo(1, '18:40'),
      submitNote: 'Opened on the market chase and ended on the title card. The second link is the Premiere project.',
      submission: { linkUrl: 'https://drive.google.com/file/d/kathalu-teaser-kavya', links: ['https://drive.google.com/file/d/kathalu-teaser-kavya', 'https://drive.google.com/file/d/kathalu-teaser-kavya-prproj'] },
    } as Claim,
    {
      ...by('u-sanjay'),
      status: 'completed',
      reward: 600,
      position: 1,
      claimedAt: daysAgo(5, '12:00'),
      startedAt: daysAgo(5, '12:00'),
      submittedAt: daysAgo(4, '17:30'),
      approvedAt: daysAgo(3, '10:00'),
      submitNote: '',
      submission: { linkUrl: 'https://drive.google.com/file/d/kathalu-teaser-sanjay', links: ['https://drive.google.com/file/d/kathalu-teaser-sanjay'] },
    } as Claim,
    {
      ...by('u-nikhil'),
      status: 'rejected',
      reward: 600,
      position: 2,
      claimedAt: daysAgo(4, '11:00'),
      startedAt: daysAgo(4, '11:00'),
      submittedAt: daysAgo(3, '19:10'),
      rejectReason: 'This one runs 48 seconds and is horizontal. The brief asks for 30 seconds, vertical.',
      submitNote: '',
      submission: { linkUrl: 'https://drive.google.com/file/d/kathalu-teaser-nikhil', links: ['https://drive.google.com/file/d/kathalu-teaser-nikhil'] },
    } as Claim,
  ],
});

const THUMBS: Task = task({
  id: 'bt-demo-thumbs',
  title: 'Design 3 YouTube thumbnails for Showreel 2026',
  desc: 'Three thumbnail options (1280×720) for the Showreel 2026 upload: bold title, one face, our orange. PNG or JPG.',
  category: 'Design',
  submissionType: 'image',
  maxAttachments: 3,
  reward: 500,
  phaseWiseCoins: true,
  phases: [
    { name: 'First 2', upTo: 2, coins: 500 },
    { name: 'Everyone else', upTo: '', coins: 300 },
  ],
  deadline: addDays(T0, 8),
  ...SUPERADMIN,
  createdAt: daysAgo(3, '09:30'),
  claims: [
    {
      ...by('u-sneha'),
      status: 'submitted',
      reward: 500,
      position: 1,
      claimedAt: minutesAgo(26 * 60),
      startedAt: minutesAgo(26 * 60),
      submittedAt: minutesAgo(5 * 60 + 20),
      submitNote: 'Option 2 is my favourite — it reads well at phone size.',
      submission: {
        fileData: RECEIPT_PNG,
        fileName: 'showreel-thumb-1.png',
        files: [
          { fileData: RECEIPT_PNG, fileName: 'showreel-thumb-1.png' },
          { fileData: RECEIPT_PNG, fileName: 'showreel-thumb-2.png' },
        ],
      },
    } as Claim,
    {
      ...by('u-rahul'),
      status: 'in_progress',
      reward: 500,
      position: 2,
      claimedAt: minutesAgo(9 * 60),
      startedAt: minutesAgo(9 * 60),
      claimExpiresAt: new Date(Date.now() + 15 * 3600000).toISOString(),
    } as Claim,
  ],
});
bountyTaskStore.unshift(TEASER, THUMBS);

// Holds and payouts on the ledger for the claims above.
seedTx({ type: 'BOUNTY_RESERVE', amount: 600, fromWalletId: 'demo-manager', fromWalletName: 'Afzal Manager', taskId: TEASER.id, taskName: TEASER.title, performedBy: 'Sanjay Kumar', createdAt: daysAgo(5, '12:00'), status: 'completed' });
seedTx({ type: 'BOUNTY_REWARD_TRANSFER', amount: 600, fromWalletId: 'demo-manager', fromWalletName: 'Afzal Manager', toWalletId: 'u-sanjay', toWalletName: 'Sanjay Kumar', taskId: TEASER.id, taskName: TEASER.title, performedBy: 'Afzal Manager', createdAt: daysAgo(3, '10:00') });
seedTx({ type: 'BOUNTY_RESERVE', amount: 600, fromWalletId: 'demo-manager', fromWalletName: 'Afzal Manager', taskId: TEASER.id, taskName: TEASER.title, performedBy: 'Nikhil Jain', createdAt: daysAgo(4, '11:00'), status: 'cancelled' });
seedTx({ type: 'BOUNTY_RELEASE', amount: 600, toWalletId: 'demo-manager', toWalletName: 'Afzal Manager', taskId: TEASER.id, taskName: TEASER.title, performedBy: 'Afzal Manager', reason: 'Rejected permanently', createdAt: daysAgo(3, '09:40') });
seedTx({ type: 'BOUNTY_RESERVE', amount: 600, fromWalletId: 'demo-manager', fromWalletName: 'Afzal Manager', taskId: TEASER.id, taskName: TEASER.title, performedBy: 'Kavya Reddy', createdAt: daysAgo(1, '18:40') });
seedTx({ type: 'BOUNTY_RESERVE', amount: 500, fromWalletId: 'demo-super-admin', fromWalletName: 'Afzal Super Admin', taskId: THUMBS.id, taskName: THUMBS.title, performedBy: 'Sneha Iyer', createdAt: minutesAgo(26 * 60) });
seedTx({ type: 'BOUNTY_RESERVE', amount: 500, fromWalletId: 'demo-super-admin', fromWalletName: 'Afzal Super Admin', taskId: THUMBS.id, taskName: THUMBS.title, performedBy: 'Rahul Verma', createdAt: minutesAgo(9 * 60) });
// Mark which reserve rows belong to which claimant (the SQL keys them on performedById).
for (const t of txStore as Txn[]) {
  if (t.type !== 'BOUNTY_RESERVE' || !t.performedBy) continue;
  const p = allPeople().find((x) => x.name === t.performedBy);
  if (p) (t as Txn & { performedById?: string }).performedById = p.id;
  // A hold that was paid out carries its approval time (dash.html:13321 reads approvedAt).
  if (t.status === 'completed' && !t.approvedAt && t.taskId === TEASER.id) t.approvedAt = daysAgo(3, '10:00');
}

// ── Use-coins requests from colleagues ───────────────────────────────────────
type Redemption = (typeof redemptionStore)[number] & { declinedBy?: string; approvedById?: string };
const seedRedemption = (r: Redemption) => {
  if (!redemptionStore.some((x) => x.id === r.id)) redemptionStore.push(r);
};
seedRedemption({ id: 'br-demo-sneha', userId: 'u-sneha', userName: 'Sneha Iyer', tenantId: DEMO_TENANT_ID, coins: 500, status: 'pending', requestedAt: daysAgo(3, '12:20') });
seedRedemption({
  id: 'br-demo-zoya',
  userId: 'u-zoya',
  userName: 'Zoya Khan',
  tenantId: DEMO_TENANT_ID,
  coins: 500,
  status: 'approved',
  requestedAt: daysAgo(18, '10:00'),
  approvedAt: daysAgo(17, '15:30'),
  approvedBy: 'Lakshmi Prasad',
  amazonLink: 'https://amzn.to/demo-zoya',
  couponCode: 'AMZ-TMD-4K8Q-22LM',
  codeRevealedAt: daysAgo(17, '18:00'),
});
seedRedemption({
  id: 'br-demo-rahul',
  userId: 'u-rahul',
  userName: 'Rahul Verma',
  tenantId: DEMO_TENANT_ID,
  coins: 1000,
  status: 'declined',
  requestedAt: daysAgo(25, '11:00'),
  declinedAt: daysAgo(24, '12:00'),
  declinedBy: 'Lakshmi Prasad',
  declineReason: 'Only 950 coins were earned when this was checked. Please ask again for 500.',
});

seedTx({ type: 'REDEMPTION', amount: 500, fromWalletId: 'u-zoya', fromWalletName: 'Zoya Khan', reason: 'Bounty coin redemption', performedBy: 'Lakshmi Prasad', createdAt: daysAgo(17, '15:30') });

// ── Helpers ──────────────────────────────────────────────────────────────────
const findTask = (id: string) => bountyTaskStore.find((t) => t.id === id) ?? null;
const claimsOf = (t: Task) => t.claims as Claim[];
const canManage = (t: Task) => isMe(t.creatorId) || ADMIN_ROLES.includes(role());
const amOn = () => role() === 'app_manager' && !!TENANT.appManagerBountyApprovalsOn;
const LAST_REMINDED = new Map<string, string>();
const expired = (t: Task) => !!t.deadline && t.deadline < today();

/** bountyTaskListRow: no submissions or reference file; `hasSubmission` / `hasReferenceFile` flags. */
function listRow(t: Task): BountyTask & { ok: true } {
  const { referenceFileData, claims, ...rest } = t;
  return {
    ok: true,
    ...rest,
    hasReferenceFile: !!referenceFileData,
    claims: (claims as Claim[])
      .filter((c) => takesPart() || c.employeeId !== ME)
      .map(({ submission, approvedAt: _a, ...c }): BountyClaim => ({ ...c, hasSubmission: !!submission })),
  };
}

const rewardOf = (t: Task, c: Claim) => n(c.reward ?? t.reward);

/** Pay a claim (bounty_task_approve_claim): the creator's hold becomes spent, the claimant earns it. */
function payClaim(t: Task, c: Claim) {
  const amount = rewardOf(t, c);
  const at = nowIso();
  c.status = 'completed';
  c.approvedAt = at;
  const cw = walletOf(String(t.creatorId), t.creatorName);
  cw.reserved = Math.max(0, n(cw.reserved) - amount);
  cw.spent = n(cw.spent) + amount;
  const w = walletOf(c.employeeId, c.employeeName);
  w.earned = n(w.earned) + amount;
  for (const x of txStore as (Txn & { performedById?: string })[]) {
    if (x.type === 'BOUNTY_RESERVE' && x.taskId === t.id && x.performedById === c.employeeId && x.status !== 'cancelled') {
      x.status = 'completed';
      x.approvedAt = at;
    }
  }
  addTx({ id: newId('btx'), type: 'BOUNTY_REWARD_TRANSFER', amount, fromWalletId: t.creatorId, fromWalletName: t.creatorName, toWalletId: c.employeeId, toWalletName: c.employeeName, taskId: t.id, taskName: t.title, performedBy: me().name, createdAt: at });
}

/** Hand a claim's hold back to the creator (permanent reject / cancel). */
function releaseClaim(t: Task, c: Claim, reason: string) {
  const amount = rewardOf(t, c);
  const at = nowIso();
  const cw = walletOf(String(t.creatorId), t.creatorName);
  cw.reserved = Math.max(0, n(cw.reserved) - amount);
  for (const x of txStore as (Txn & { performedById?: string })[]) {
    if (x.type === 'BOUNTY_RESERVE' && x.taskId === t.id && x.performedById === c.employeeId && x.status !== 'completed') {
      x.status = 'cancelled';
      x.releasedAt = at;
    }
  }
  addTx({ id: newId('btx'), type: 'BOUNTY_RELEASE', amount, toWalletId: t.creatorId, toWalletName: t.creatorName, taskId: t.id, taskName: t.title, performedBy: me().name, reason, createdAt: at });
}

type PhaseIn = { name?: unknown; upTo?: unknown; coins?: unknown };
/** The server's phase checks (server.js:6020-6040). */
function cleanPhases(phases: unknown): { phases: { name: string; upTo: number | null; coins: number }[] } | { error: string } {
  if (!Array.isArray(phases) || !phases.length) return { error: 'Add at least one reward phase, or turn off Phase-wise Coins.' };
  let prev = 0;
  const out: { name: string; upTo: number | null; coins: number }[] = [];
  for (let i = 0; i < phases.length; i++) {
    const p = (phases[i] || {}) as PhaseIn;
    const c = Math.round(Number(p.coins));
    if (!c || c <= 0) return { error: `Phase ${i + 1}: Coins Per Employee must be a positive number.` };
    let upTo: number | null = null;
    if (p.upTo !== undefined && p.upTo !== null && p.upTo !== '') {
      upTo = Math.round(Number(p.upTo));
      if (!Number.isFinite(upTo) || upTo <= prev) return { error: `Phase ${i + 1}: "Up To" must be a number greater than the previous phase's.` };
    } else if (i !== phases.length - 1) {
      return { error: `Phase ${i + 1}: only the last phase can be left blank/unlimited for "Up To".` };
    }
    out.push({ name: String(p.name || '').trim() || `Phase ${i + 1}`, upTo, coins: c });
    if (upTo !== null) prev = upTo;
  }
  return { phases: out };
}
const rewardAt = (phases: { upTo: number | null; coins: number }[], position: number) => {
  for (const p of phases) if (p.upTo == null || position <= p.upTo) return p.coins;
  return phases[phases.length - 1]?.coins ?? 0;
};

function cleanUrl(v: unknown): string | { error: string } {
  const s = String(v ?? '').trim();
  if (!s) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.toString();
  } catch {
    return { error: 'The reference link doesn’t look like a web address.' };
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────
function createTask(body: Record<string, unknown>) {
  if (!String(body.title ?? '').trim()) return fail('Task title is required.');
  if (!String(body.desc ?? '').trim()) return fail('Task description is required.');
  if (!creatorEligible({ ...meAsUser(), employeeNumber: currentPersona().employeeNumber })) return fail('You are not authorized to create bounty tasks.', 403);
  const usePhases = !!body.phaseWiseCoins;
  let phases: { name: string; upTo: number | null; coins: number }[] = [];
  let amt: number;
  if (usePhases) {
    const r = cleanPhases(body.phases);
    if ('error' in r) return fail(r.error);
    phases = r.phases;
    amt = phases[0]!.coins;
  } else {
    amt = Math.round(Number(body.reward));
    if (!amt || amt <= 0) return fail('Bounty reward must be a positive number.');
  }
  let cap: number | null = null;
  if (body.maxAccepts !== undefined && body.maxAccepts !== null && body.maxAccepts !== '') {
    cap = Math.round(Number(body.maxAccepts));
    if (!Number.isFinite(cap) || cap <= 0) return fail('How many can accept must be a positive number, or left blank for unlimited.');
  }
  const url = cleanUrl(body.referenceUrl);
  if (typeof url !== 'string') return fail(url.error);
  const cheapest = usePhases ? Math.min(...phases.map((p) => p.coins)) : amt;
  if (cheapest > fundsLeft(walletOf(me().id, me().name))) return fail('Insufficient bounty coin balance to cover even one acceptance.');
  const type = ['text', 'link', 'image', 'video', 'document'].includes(String(body.submissionType)) ? (String(body.submissionType) as BountyTask['submissionType']) : 'text';
  const maxAtt = Math.min(10, Math.max(1, Math.floor(Number(body.maxAttachments)) || 1));
  const t: Task = task({
    id: newId('bt'),
    title: String(body.title).trim(),
    desc: String(body.desc).trim(),
    category: String(body.category ?? '').trim(),
    deptId: String(body.deptId ?? '') || undefined,
    deadline: String(body.deadline ?? '') || undefined,
    reward: amt,
    eligibility: String(body.eligibility ?? '').trim(),
    targetProfType: String(body.targetProfType ?? '') || undefined,
    submissionType: type,
    requiresApproval: body.requiresApproval !== false,
    maxAccepts: cap,
    maxAttachments: type === 'text' ? 1 : maxAtt,
    phaseWiseCoins: usePhases,
    phases: usePhases ? phases.map((p) => ({ ...p, upTo: p.upTo ?? '' })) : undefined,
    referenceFileName: String(body.referenceFileName ?? '') || undefined,
    referenceFileData: String(body.referenceFileData ?? '') || undefined,
    referenceUrl: url || undefined,
    creatorId: me().id,
    creatorName: me().name,
    createdAt: nowIso(),
  });
  bountyTaskStore.unshift(t);
  return listRow(t);
}

const EDITABLE = ['title', 'desc', 'category', 'deptId', 'deadline', 'eligibility', 'targetProfType', 'maxAccepts', 'referenceUrl'] as const;
function editTask(id: string, body: Record<string, unknown>) {
  const t = findTask(id);
  if (!t) return notFound('That bounty task no longer exists.');
  // server.js:6122: the owner, or a USER_ADMIN role.
  if (!isMe(t.creatorId) && !['master_admin', 'super_admin', 'ceo', 'coo', 'hr', 'admin', 'it_admin', 'app_manager'].includes(role())) {
    return fail('Only the person who created this bounty task can edit it.', 403);
  }
  if ('title' in body && !String(body.title ?? '').trim()) return fail('Task title is required.');
  if ('desc' in body && !String(body.desc ?? '').trim()) return fail('Task description is required.');
  const patch: Partial<Task> = {};
  for (const k of EDITABLE) {
    if (!(k in body)) continue;
    if (k === 'maxAccepts') {
      const v = body.maxAccepts;
      if (v === null || v === '' || v === undefined) patch.maxAccepts = null;
      else {
        const cap = Math.round(Number(v));
        if (!Number.isFinite(cap) || cap <= 0) return fail('How many can accept must be a positive number, or left blank for unlimited.');
        if (cap < t.claims.length) return fail(`${t.claims.length} employee(s) have already accepted — the cap cannot go below that.`);
        patch.maxAccepts = cap;
      }
    } else if (k === 'referenceUrl') {
      const url = cleanUrl(body.referenceUrl);
      if (typeof url !== 'string') return fail(url.error);
      patch.referenceUrl = url || undefined;
    } else if (k === 'deadline') {
      patch.deadline = String(body.deadline ?? '') || undefined;
    } else {
      (patch as Record<string, unknown>)[k] = typeof body[k] === 'string' ? String(body[k]).trim() : body[k];
    }
  }
  Object.assign(t, patch);
  // Raising the cap on a full task reopens it; a lower cap that is now reached closes it.
  if (!t.cancelledAt) {
    if (t.maxAccepts == null || t.claims.length < n(t.maxAccepts)) t.status = 'open';
    else t.status = 'closed';
  }
  return listRow(t);
}

function editReward(id: string, body: Record<string, unknown>) {
  const t = findTask(id);
  if (!t) return notFound('That bounty task no longer exists.');
  if (!isMe(t.creatorId) && !['master_admin', 'super_admin', 'ceo', 'coo', 'hr', 'admin', 'it_admin', 'app_manager'].includes(role())) {
    return fail('Only the person who created this bounty task can edit its reward.', 403);
  }
  const usePhases = !!body.phaseWiseCoins;
  let phases: { name: string; upTo: number | null; coins: number }[] = [];
  let flat = 0;
  if (usePhases) {
    const r = cleanPhases(body.phases);
    if ('error' in r) return fail(r.error);
    phases = r.phases;
  } else {
    flat = Math.round(Number(body.reward));
    if (!flat || flat <= 0) return fail('Bounty reward must be a positive number.');
  }
  // Raising pays already-paid claimants the difference now; lowering never claws back.
  const paid = claimsOf(t).filter((c) => c.status === 'completed');
  const topUps = paid.map((c) => ({ c, diff: Math.max(0, (usePhases ? rewardAt(phases, n(c.position) || 1) : flat) - rewardOf(t, c)) })).filter((x) => x.diff > 0);
  const total = topUps.reduce((s, x) => s + x.diff, 0);
  const cw = walletOf(String(t.creatorId), t.creatorName);
  if (total > fundsLeft(cw)) return fail(`Raising the reward pays ${total} more coins to people already paid, but only ${fundsLeft(cw)} are available.`);
  for (const { c, diff } of topUps) {
    cw.spent = n(cw.spent) + diff;
    const w = walletOf(c.employeeId, c.employeeName);
    w.earned = n(w.earned) + diff;
    c.reward = rewardOf(t, c) + diff;
    addTx({ id: newId('btx'), type: 'BOUNTY_REWARD_TRANSFER', amount: diff, fromWalletId: t.creatorId, fromWalletName: t.creatorName, toWalletId: c.employeeId, toWalletName: c.employeeName, taskId: t.id, taskName: t.title, reason: 'Reward raised — top-up', performedBy: me().name, createdAt: nowIso() });
  }
  if (usePhases) {
    t.phaseWiseCoins = true;
    t.phases = phases.map((p) => ({ ...p, upTo: p.upTo ?? '' }));
    t.reward = phases[0]!.coins;
  } else {
    t.phaseWiseCoins = false;
    t.phases = undefined;
    t.reward = flat;
  }
  return listRow(t);
}

function remindAudience(t: Task) {
  const taken = new Set(t.claims.map((c) => c.employeeId));
  const depts = ([] as string[]).concat(t.deptIds || [], t.deptId || []).filter(Boolean);
  let alreadyTookPart = 0;
  const pool: Who[] = [];
  for (const p of companyPeople()) {
    if (depts.length && !depts.includes(String((p as { departmentId?: string }).departmentId || ''))) continue;
    if (t.targetProfType && !(p.professionalAvailable && p.professionalType === t.targetProfType)) continue;
    const creatorLike = creatorEligible(p);
    if (p.resigned || NON_CLAIMING.includes(p.role) || p.id === t.creatorId || (creatorLike && !['ceo', 'coo', 'manager', 'admin'].includes(p.role))) continue;
    if (taken.has(p.id)) {
      alreadyTookPart++;
      continue;
    }
    pool.push(p);
  }
  return { pool, alreadyTookPart, depts };
}

function remindBlocked(t: Task) {
  if (t.cancelledAt) return 'This bounty task was cancelled, so there is nothing to remind anyone about.';
  if (t.status !== 'open') return 'This bounty task is no longer accepting people (it is full or closed), so a reminder would send them to something they cannot join.';
  if (expired(t)) return `This bounty task closed on ${t.deadline}. Extend the deadline first if it is still going.`;
  const last = LAST_REMINDED.get(t.id);
  if (last && Date.parse(last) + REMIND_COOLDOWN_MS > Date.now()) {
    return `A reminder for this task was already sent ${new Date(last).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}. You can send another after ${new Date(Date.parse(last) + REMIND_COOLDOWN_MS).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`;
  }
  return '';
}
const canRemind = (t: Task) => isMe(t.creatorId) || ADMIN_ROLES.includes(role());

function remindPreview(id: string): RemindPreview | ReturnType<typeof fail> {
  const t = findTask(id);
  if (!t) return notFound('Bounty task not found.');
  if (!canRemind(t)) return fail('Only the person who created this bounty task, or an admin, can send reminders for it.', 403);
  const blocked = remindBlocked(t);
  const { pool, alreadyTookPart, depts } = remindAudience(t);
  const wa = pool.filter((p) => !!p.mobile).length;
  const emailOnly = pool.filter((p) => !p.mobile && !!p.email).length;
  return {
    canSend: !blocked && pool.length > 0,
    blockedReason: blocked || (!pool.length ? 'Everyone this task is for has already taken part, so there is nobody to remind.' : ''),
    willRemind: wa + emailOnly,
    viaWhatsApp: wa,
    emailOnly,
    noContact: pool.length - wa - emailOnly,
    alreadyTookPart,
    audience: { departments: depts, professionalTypes: t.targetProfType ? [t.targetProfType] : [] },
    lastRemindedAt: LAST_REMINDED.get(t.id) ?? null,
  };
}

function remind(id: string) {
  const t = findTask(id);
  if (!t) return notFound('Bounty task not found.');
  if (!canRemind(t)) return fail('Only the person who created this bounty task, or an admin, can send reminders for it.', 403);
  const blocked = remindBlocked(t);
  if (blocked) return fail(blocked, LAST_REMINDED.has(t.id) ? 429 : 409);
  const { pool } = remindAudience(t);
  if (!pool.length) return { ok: true, sent: 0, failed: 0, message: 'Everyone this task is for has already taken part, so nobody was reminded.' };
  LAST_REMINDED.set(t.id, nowIso());
  const wa = pool.filter((p) => !!p.mobile).length;
  const em = pool.filter((p) => !p.mobile && !!p.email).length;
  const sent = wa + em;
  return { ok: true, sent, viaWhatsApp: wa, viaEmail: em, failed: 0, message: `Reminder sent to ${sent} employee${sent === 1 ? '' : 's'}${em ? ` (${wa} on WhatsApp, ${em} by email)` : wa ? ' on WhatsApp' : ''}.` };
}

function decideClaim(id: string, body: Record<string, unknown>, approve: boolean) {
  const t = findTask(id);
  if (!t) return notFound('Bounty task not found.');
  const emp = String(body.employeeId ?? '');
  if (!emp) return fail(approve ? "Which claimant's submission is being approved?" : "Which claimant's submission is being reviewed?");
  if (!canManage(t) && !amOn()) return fail(approve ? 'Only the task creator can approve this submission.' : 'Only the task creator can review this submission.', 403);
  const c = claimsOf(t).find((x) => x.employeeId === emp);
  if (!c) return notFound('That person has not accepted this task.');
  if (c.status !== 'submitted') return fail('This submission is no longer waiting for review.', 409);
  if (approve) {
    payClaim(t, c);
  } else if (body.allowResubmit !== false) {
    c.status = 'in_progress';
    c.rejectReason = String(body.reason ?? '');
  } else {
    c.status = 'rejected';
    c.rejectReason = String(body.reason ?? '');
    releaseClaim(t, c, 'Rejected permanently');
  }
  return listRow(t);
}

function cancelTask(id: string, body: Record<string, unknown>) {
  const t = findTask(id);
  if (!t) return notFound('Bounty task not found.');
  if (!canManage(t)) return fail('Only the task creator can cancel this bounty task.', 403);
  if (t.cancelledAt) return fail('This bounty task is already cancelled.', 409);
  const reason = String(body.reason ?? '');
  for (const c of claimsOf(t)) {
    if (!['claimed', 'in_progress', 'submitted'].includes(c.status)) continue;
    releaseClaim(t, c, reason || 'Task cancelled');
    c.status = 'rejected';
    c.rejectReason = reason || 'Task cancelled';
  }
  Object.assign(t, { status: 'closed', cancelledAt: nowIso(), cancelReason: reason });
  return listRow(t);
}

function fullTask(id: string) {
  const t = findTask(id);
  if (!t) return notFound('Bounty task not found.');
  if (!ADMIN_ROLES.includes(role()) && role() !== 'app_manager' && !isMe(t.creatorId)) {
    return fail('Only the person who created this bounty task can review its claims.', 403);
  }
  return { ok: true, ...t, claims: claimsOf(t).filter((c) => takesPart() || c.employeeId !== ME), lastRemindedAt: LAST_REMINDED.get(t.id) ?? null };
}

const myFileHandler = bountyRoutes.find(([m, re]) => m === 'GET' && re.test('/bounty_tasks/x/submissions/y/files/0/download'))?.[2];
function claimFile(p: string[], body: unknown, q: URLSearchParams) {
  const [, id, emp, idx] = p;
  const t = findTask(id!);
  if (!t) return notFound('Bounty task not found.');
  if (emp === ME && myFileHandler) return myFileHandler(p, body, q);
  if (!canManage(t) && role() !== 'app_manager') return fail('You do not have access to this submission.', 403);
  const c = claimsOf(t).find((x) => x.employeeId === emp);
  const sub = c?.submission;
  const files = sub ? (Array.isArray(sub.files) && sub.files.length ? sub.files : sub.fileData ? [{ fileData: sub.fileData, fileName: sub.fileName }] : []) : [];
  const f = files[Number(idx)];
  if (!f || !f.fileData) return notFound('This submission has no such file.');
  return { ok: true, url: f.fileData, fileName: f.fileName || 'submission', inline: true };
}

// ── Coins ────────────────────────────────────────────────────────────────────
function distribute(body: Record<string, unknown>) {
  if (!SUPER.includes(role())) return fail('Only Super Admin can distribute coins.', 403);
  const emp = whoById(String(body.employeeId ?? ''));
  if (!emp) return notFound('Employee not found.');
  const amt = (v: unknown) => (v === undefined || v === null || v === '' ? 0 : Math.round(Number(v)));
  const b = amt(body.bountyAmount);
  const r = amt(body.referralAmount);
  if (b < 0 || r < 0) return fail('Amounts cannot be negative.');
  if (!b && !r) return fail('Enter a positive amount for Bounty Coins, Referral Coins, or both.');
  if (b > 0 && !creatorEligible(emp)) return fail(`${emp.name} is not an authorized Bounty Task Creator.`);
  if (r > 0 && !referralEligible(emp)) return fail(`${emp.name} is not authorized to post job openings — cannot receive Referral Coins.`);
  if (b + r > COMPANY.available) return fail(`The company wallet has only ${COMPANY.available} coins left.`);
  const w = walletOf(emp.id, emp.name);
  const reason = String(body.reason ?? '').trim();
  const at = nowIso();
  COMPANY.available -= b + r;
  COMPANY.totalDistributed += b + r;
  let transaction: BountyTxn | undefined;
  if (b) {
    w.allocated = n(w.allocated) + b;
    transaction = addTx({ id: newId('btx'), type: 'COIN_DISTRIBUTION', amount: b, ...fromCompany, toWalletId: emp.id, toWalletName: emp.name, reason, performedBy: me().name, toBalanceAfter: fundsLeft(w), createdAt: at });
  }
  if (r) {
    w.referralAllocated = n(w.referralAllocated) + r;
    transaction = addTx({ id: newId('btx'), type: 'REFERRAL_COIN_DISTRIBUTION', amount: r, ...fromCompany, toWalletId: emp.id, toWalletName: emp.name, reason, performedBy: me().name, createdAt: at });
  }
  return { ok: true, transaction };
}

function backToCompany(emp: Who, amount: number, reason: string, type = 'COIN_RETURN') {
  const w = walletOf(emp.id, emp.name);
  w.allocated = Math.max(0, n(w.allocated) - amount);
  COMPANY.available += amount;
  COMPANY.totalDistributed = Math.max(0, COMPANY.totalDistributed - amount);
  return addTx({ id: newId('btx'), type, amount, fromWalletId: emp.id, fromWalletName: emp.name, toWalletId: COMPANY_ID, toWalletName: 'Company Wallet', reason, performedBy: me().name, createdAt: nowIso() });
}

function revoke(body: Record<string, unknown>) {
  if (!SUPER.includes(role())) return fail('Only Super Admin can revoke coins from a Bounty Task Creator.', 403);
  if (!body.employeeId) return fail('Select a Bounty Task Creator.');
  const emp = whoById(String(body.employeeId));
  if (!emp) return notFound('That employee could not be found.');
  const amount = Math.round(Number(body.amount));
  if (!amount || amount <= 0) return fail('Enter a positive coin amount.');
  const revocable = fundsLeft(walletOf(emp.id, emp.name));
  if (amount > revocable) return fail(`Only ${revocable} coin(s) are available to revoke — coins ${emp.name} has already earned from completed bounty tasks can't be revoked.`);
  return { ok: true, transaction: backToCompany(emp, amount, String(body.reason ?? '').trim() || `Revoked by ${me().name}`) };
}

function returnToCompany(body: Record<string, unknown>) {
  const self: Who = { id: me().id, name: me().name, role: role(), employeeNumber: currentPersona().employeeNumber };
  if (!creatorEligible(self)) return fail('Only Bounty Task Creators can return coins to the company wallet.', 403);
  const amount = Math.round(Number(body.amount));
  if (!amount || amount <= 0) return fail('Enter a positive coin amount.');
  const left = fundsLeft(walletOf(self.id, self.name));
  if (amount > left) return fail(`You only have ${left} coins available.`);
  return { ok: true, transaction: backToCompany(self, amount, String(body.reason ?? '').trim() || 'Returned to company wallet') };
}

function reverse(id: string, body: Record<string, unknown>) {
  const t = (txStore as Txn[]).find((x) => x.id === id);
  if (!t) return notFound('Transaction not found.');
  if (t.reversedAt) return fail('This has already been cancelled.', 409);
  if (t.type === 'COMPANY_CREDIT') return fail('Only Master Admin can cancel a company coin credit — Super Admin only receives it.', 403);
  if (t.type !== 'COIN_DISTRIBUTION') return fail('Only a company credit or coin distribution can be cancelled this way.');
  if (!SUPER.includes(role())) return fail("Only Super Admin can cancel a coin distribution — the recipient can't cancel coins they received.", 403);
  const emp = whoById(String(t.toWalletId)) ?? { id: String(t.toWalletId), name: String(t.toWalletName || 'Employee'), role: 'employee', employeeNumber: '' };
  if (fundsLeft(walletOf(emp.id, emp.name)) < n(t.amount)) return fail('Some of these coins have already been used, so this distribution can’t be cancelled.');
  t.reversedAt = nowIso();
  backToCompany(emp, n(t.amount), String(body.reason ?? '').trim() || 'Cancelled unused coin distribution');
  return { ok: true };
}

function creatorsSummary(): CreatorSummary[] {
  return companyPeople()
    .filter((p) => creatorEligible(p) || referralEligible(p))
    .map((p) => {
      const w = walletOf(p.id, p.name);
      return {
        id: p.id,
        name: p.name,
        employeeNumber: p.employeeNumber,
        role: p.role,
        allocated: n(w.allocated),
        reserved: n(w.reserved),
        spent: n(w.spent),
        earned: n(w.earned),
        available: fundsLeft(w),
        referralAllocated: n(w.referralAllocated),
        referralReserved: n(w.referralReserved),
        referralSpent: n(w.referralSpent),
        referralEarned: n(w.referralEarned),
        tasksCreated: bountyTaskStore.filter((t) => t.creatorId === p.id).length,
      };
    });
}

/** GET /bounty_transactions scoped like server.js:5506: overseers see the company, others their own rows. */
function ledger(q: URLSearchParams) {
  const mineId = me().id;
  const part = takesPart();
  let rows = (txStore as Txn[]).filter((t) => (t.tenantId ?? DEMO_TENANT_ID) === DEMO_TENANT_ID);
  // The shared demo person's own rows belong to the claiming personas only.
  if (!part) rows = rows.filter((t) => t.fromWalletId !== ME && t.toWalletId !== ME);
  if (!OVERSEERS.includes(role())) rows = rows.filter((t) => (part && (t.fromWalletId === ME || t.toWalletId === ME)) || t.fromWalletId === mineId || t.toWalletId === mineId);
  const from = q.get('dateFrom');
  const to = q.get('dateTo');
  const type = q.get('type');
  const emp = q.get('employeeId');
  const dir = q.get('direction');
  if (from) rows = rows.filter((t) => String(t.createdAt || '') >= from);
  if (to) rows = rows.filter((t) => String(t.createdAt || '') <= `${to}T23:59:59.999Z`);
  if (type) rows = rows.filter((t) => t.type === type);
  if (emp) {
    const ids = emp === ME ? [ME, mineId] : [emp];
    rows = rows.filter((t) => ids.includes(String(t.fromWalletId)) || ids.includes(String(t.toWalletId)));
  }
  if (dir === 'credit') rows = rows.filter((t) => !!t.toWalletId);
  if (dir === 'debit') rows = rows.filter((t) => !!t.fromWalletId);
  return [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// My own wallet: bounty.ts's answer, with the persona's creator funds (allocated / reserved / spent and
// referral pools) laid over it — the coins Super Admin gave this persona to fund tasks.
const myWalletHandler = bountyRoutes.find(([m, re]) => m === 'GET' && re.test(`/bounty/wallet/${ME}`))?.[2];
function myWallet(p: string[], body: unknown, q: URLSearchParams) {
  const base = (myWalletHandler ? myWalletHandler(p, body, q) : { ok: true, id: ME }) as Record<string, unknown>;
  if (!base || typeof base !== 'object' || 'error' in base || me().id === ME) return base;
  const f = walletOf(me().id, me().name);
  return {
    ...base,
    allocated: n(f.allocated),
    reserved: n(f.reserved),
    spent: n(f.spent),
    referralAllocated: n(f.referralAllocated),
    referralReserved: n(f.referralReserved),
    referralSpent: n(f.referralSpent),
    referralEarned: n(base.referralEarned) + n(f.referralEarned),
  };
}

const canDecideRedemptions = () => ['super_admin', 'hr', 'master_admin'].includes(role()) || amOn();
function decideRedemption(id: string, body: Record<string, unknown>, approve: boolean) {
  if (!canDecideRedemptions()) return fail(`Only Super Admin or HR can ${approve ? 'approve' : 'decline'} redemption requests.`, 403);
  const r = redemptionStore.find((x) => x.id === id) as Redemption | undefined;
  if (!r) return notFound('Redemption request not found.');
  const at = nowIso();
  if (approve) {
    const link = String(body.amazonLink ?? '').trim();
    const code = String(body.couponCode ?? '').trim();
    if (!link) return fail('Enter the Amazon affiliate purchase link.');
    if (!code) return fail('Enter the coupon code.');
    if (r.status !== 'pending') return fail('This request is no longer pending.', 409);
    const w = walletOf(r.userId, r.userName);
    const left = Math.max(0, n(w.earned) - n(w.redeemed));
    if (left < n(r.coins)) return fail(`Approval reverted — coin redemption failed: ${r.userName} has only ${left} earned coins. Please try again.`);
    w.redeemed = n(w.redeemed) + n(r.coins);
    Object.assign(r, { status: 'approved', amazonLink: link, couponCode: code, approvedAt: at, approvedBy: me().name, approvedById: me().id });
    addTx({ id: newId('btx'), type: 'REDEMPTION', amount: n(r.coins), fromWalletId: r.userId, fromWalletName: r.userName, reason: 'Bounty coin redemption', performedBy: me().name, createdAt: at });
  } else {
    if (r.status !== 'pending') return fail('This request is no longer pending.', 409);
    Object.assign(r, { status: 'declined', declineReason: String(body.reason ?? '').trim(), declinedAt: at, declinedBy: me().name });
  }
  return { ok: true, request: r };
}

// ── Routes (they come before bounty.ts's, so they win) ───────────────────────
const NOT_MY_CLAIMS = '(?!my_claims$)';
/** The demo company's wallet (for integration.ts, which keeps it in step with platform.ts's). */
export const bountyCompanyWallet = COMPANY;

export const bountyadminRoutes: Route[] = [
  ['GET', /^\/bounty\/wallet\/company$/, () => ({ ok: true, ...COMPANY })],
  ['GET', /^\/bounty\/creators-summary$/, () => creatorsSummary()],
  ['POST', /^\/bounty\/distribute$/, (_p, body) => distribute(body ?? {})],
  ['POST', /^\/bounty\/revoke-from-creator$/, (_p, body) => revoke(body ?? {})],
  ['POST', /^\/bounty\/return-to-company$/, (_p, body) => returnToCompany(body ?? {})],
  ['POST', /^\/bounty_transactions\/([^/]+)\/reverse$/, ([, id], body) => reverse(id!, body ?? {})],
  ['GET', /^\/bounty_transactions$/, (_p, _b, q) => ledger(q)],
  ['GET', new RegExp(`^/bounty/wallet/(${ME})$`), (p, b, q) => myWallet(p, b, q)],
  ['POST', /^\/bounty_tasks$/, (_p, body) => createTask(body ?? {})],
  ['GET', new RegExp(`^/bounty_tasks/${NOT_MY_CLAIMS}([^/]+)$`), ([, id]) => fullTask(id!)],
  ['PUT', /^\/bounty_tasks\/([^/]+)$/, ([, id], body) => editTask(id!, body ?? {})],
  ['POST', /^\/bounty_tasks\/([^/]+)\/edit-reward$/, ([, id], body) => editReward(id!, body ?? {})],
  ['GET', /^\/bounty_tasks\/([^/]+)\/remind-preview$/, ([, id]) => remindPreview(id!)],
  ['POST', /^\/bounty_tasks\/([^/]+)\/remind$/, ([, id]) => remind(id!)],
  ['POST', /^\/bounty_tasks\/([^/]+)\/approve$/, ([, id], body) => decideClaim(id!, body ?? {}, true)],
  ['POST', /^\/bounty_tasks\/([^/]+)\/reject$/, ([, id], body) => decideClaim(id!, body ?? {}, false)],
  ['POST', /^\/bounty_tasks\/([^/]+)\/cancel$/, ([, id], body) => cancelTask(id!, body ?? {})],
  ['GET', /^\/bounty_tasks\/([^/]+)\/submissions\/([^/]+)\/files\/(\d+)\/download$/, (p, b, q) => claimFile(p, b, q)],
  ['POST', /^\/bounty_redemptions\/([^/]+)\/approve$/, ([, id], body) => decideRedemption(id!, body ?? {}, true)],
  ['POST', /^\/bounty_redemptions\/([^/]+)\/decline$/, ([, id], body) => decideRedemption(id!, body ?? {}, false)],
];
