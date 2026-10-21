// Bounty System (server.js ~L5005-6900, sql/bounty_coins_update4.sql): the task board (list rows —
// submissions stripped, `hasSubmission` / `hasReferenceFile` flags), my wallet, my ledger rows, the
// company's redemption requests, the leaderboard, my accepted-but-not-started claims, this month's
// earning cap, and the actions: accept-and-submit in one go (the normal path), the legacy start /
// submit, my submission, a reference file, redeeming coins and revealing a coupon.
// A task with requiresApproval === false pays out on submit, as bounty_task_approve_claim does.

import type {
  BountyClaim,
  BountyClaimReminder,
  BountyLeaderboard,
  BountyLeaderRow,
  BountyRedemption,
  BountySubmission,
  BountyTask,
  BountyTxn,
  BountyWallet,
} from '@/api/bounty';
import { DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { personById } from '@/demo/fixtures/org';
import { currentPersona } from '@/demo/personas';
import { addDays, daysAgo, fail, minutesAgo, newId, notFound, nowIso, RECEIPT_PNG, today, type Route } from '@/demo/state';

const T0 = today();
const MONTH = T0.slice(0, 7);
const ME = { id: DEMO_USER.id, name: String(DEMO_USER.name) };
const CAP = 3000;
const REDEEM_MIN = 500;

// Somewhere earlier this month (never before the 1st, never in the future).
const thisMonthAgo = (maxDays: number) => {
  const since = Date.now() - Date.parse(`${MONTH}-01T00:00:00+05:30`);
  return new Date(Date.now() - Math.min(maxDays * 86400000, since / 2)).toISOString();
};

type Claim = BountyClaim & { submission?: BountySubmission; approvedAt?: string };
type Task = Omit<BountyTask, 'claims'> & { claims: Claim[]; referenceFileData?: string };

const by = (id: string) => ({ employeeId: id, employeeName: personById(id)?.name ?? 'Employee' });
const done = (id: string, reward: number, position: number, days: number): Claim => ({
  ...by(id),
  status: 'completed',
  reward,
  position,
  claimedAt: daysAgo(days, '11:00'),
  startedAt: daysAgo(days, '11:00'),
  submittedAt: daysAgo(days, '11:00'),
  approvedAt: daysAgo(Math.max(0, days - 1), '16:00'),
  submitNote: '',
  submission: { text: 'Submitted.' },
});
const sent = (id: string, reward: number, position: number, iso: string, submission: BountySubmission, submitNote = ''): Claim => ({
  ...by(id),
  status: 'submitted',
  reward,
  position,
  claimedAt: iso,
  startedAt: iso,
  submittedAt: iso,
  submitNote,
  submission,
});

const KIRAN = { creatorId: 'u-kiran', creatorName: 'Kiran Rao' };
const ARVIND = { creatorId: 'u-arvind', creatorName: 'Arvind Menon' };
const task = (t: Omit<Task, 'tenantId' | 'status' | 'claims'> & Partial<Task>): Task => ({ tenantId: DEMO_TENANT_ID, status: 'open', claims: [], requiresApproval: true, maxAttachments: 1, ...t });

const claimedAt = minutesAgo(3 * 60 + 10);

const TASKS: Task[] = [
  task({
    id: 'bt-demo-captions',
    title: 'Write 3 caption options for the Diwali film teaser',
    desc: 'Three Instagram captions (under 150 characters each) for the Sunrise Jewellers Diwali teaser — one emotional, one playful, one Telugu-English. Hashtags optional.',
    category: 'Copywriting',
    submissionType: 'text',
    reward: 150,
    maxAccepts: 10,
    deadline: addDays(T0, 5),
    ...KIRAN,
    createdAt: daysAgo(3, '10:00'),
    claims: [done('u-meera', 150, 1, 2), sent('u-zoya', 150, 2, daysAgo(1, '18:30'), { text: '…' })],
  }),
  task({
    id: 'bt-demo-folk',
    title: 'Find 5 royalty-free Telugu folk tracks for Kathalu S2',
    desc: 'Share links to five royalty-free (or CC-BY) Telugu folk tracks we could license for the market and village sequences. Add the licence type next to each link in your note.',
    category: 'Research',
    submissionType: 'link',
    reward: 150,
    maxAttachments: 5,
    phaseWiseCoins: true,
    phases: [
      { name: 'First 3', upTo: 3, coins: 400 },
      { name: 'Next 5', upTo: 8, coins: 250 },
      { name: 'Everyone else', upTo: '', coins: 150 },
    ],
    deadline: addDays(T0, 9),
    ...ARVIND,
    createdAt: daysAgo(4, '12:30'),
    claims: [done('u-anita', 400, 1, 3)],
  }),
  task({
    id: 'bt-demo-poster',
    title: 'Design an A3 poster for the internal film club',
    desc: 'Poster for the monthly film-club screening in the main studio. Use the brief for the film, date and the club logo. Up to three options.',
    category: 'Design',
    submissionType: 'image',
    reward: 500,
    maxAttachments: 3,
    deptIds: ['dept-creative'],
    referenceFileName: 'film-club-brief.png',
    referenceFileData: RECEIPT_PNG,
    deadline: addDays(T0, 12),
    ...KIRAN,
    createdAt: daysAgo(2, '09:45'),
  }),
  task({
    id: 'bt-demo-sop',
    title: 'Draft an SOP for media backup and archival',
    desc: 'A two-page SOP: card offload on set, checksum verification, the 3-2-1 backup rule on our NAS, and when raw footage moves to cold storage. PDF or Word.',
    category: 'Process',
    submissionType: 'document',
    reward: 800,
    deadline: addDays(T0, 14),
    ...ARVIND,
    createdAt: daysAgo(5, '15:00'),
  }),
  task({
    id: 'bt-demo-tip',
    title: 'Share one tip that saved you time this month',
    desc: 'A shortcut, preset or workflow trick that saved you time. The best ones go into the Friday newsletter. Coins are paid as soon as you submit.',
    category: 'Knowledge sharing',
    submissionType: 'text',
    reward: 50,
    requiresApproval: false,
    maxAccepts: null,
    deadline: addDays(T0, 20),
    ...KIRAN,
    createdAt: daysAgo(8, '10:00'),
    claims: [done('u-sneha', 50, 1, 6), done('u-rahul', 50, 2, 5), done('u-imran', 50, 3, 3)],
  }),
  // ── the demo person's own claims ──
  task({
    id: 'bt-demo-vo',
    title: 'Write the voice-over script for a 30-second Showreel 2026 teaser',
    desc: 'About 75 words, confident and warm, ending on the line “Stories, well told.”',
    category: 'Copywriting',
    submissionType: 'text',
    reward: 600,
    maxAccepts: 3,
    deadline: addDays(T0, 4),
    ...KIRAN,
    createdAt: daysAgo(6, '11:15'),
    claims: [
      sent(
        ME.id,
        600,
        1,
        daysAgo(2, '17:20'),
        {
          text: 'Every frame starts with a question. What does a mother feel on Diwali morning? How does a farmer hear about a new seed? At Tamada Media we chase those answers — across brand films, explainers and web series, in Telugu, Hindi and English. Fifty-two projects this year. One promise every time. Stories, well told.',
        },
        'Kept it to 72 words so there is room for the music sting at the end.',
      ),
      sent('u-farhan', 600, 2, daysAgo(1, '12:05'), { text: '…' }),
    ],
  }),
  task({
    id: 'bt-demo-name',
    title: 'Suggest a name for the new edit suite',
    desc: 'The new grading-and-edit suite on the 2nd floor needs a name. One suggestion per person, with a line on why.',
    category: 'Culture',
    submissionType: 'text',
    reward: 200,
    maxAccepts: 1,
    deadline: addDays(T0, -1),
    status: 'closed',
    ...KIRAN,
    createdAt: daysAgo(12, '10:00'),
    claims: [
      {
        ...by(ME.id),
        status: 'completed',
        reward: 200,
        position: 1,
        claimedAt: daysAgo(11, '12:40'),
        startedAt: daysAgo(11, '12:40'),
        submittedAt: daysAgo(11, '12:40'),
        approvedAt: thisMonthAgo(3),
        submitNote: '',
        submission: { text: '“The Cutting Room” — it is where the story finally gets decided, and it is a nod to the old film editors who literally cut film.' },
      },
    ],
  }),
  task({
    id: 'bt-demo-translate',
    title: 'Translate the Nimbus explainer tagline and CTA lines into Hindi',
    desc: 'Translate the tagline and the three CTA lines from the Nimbus explainer script into Hindi, following the brand glossary.',
    category: 'Translation',
    submissionType: 'text',
    reward: 300,
    maxAccepts: 2,
    deadline: addDays(T0, 2),
    ...ARVIND,
    createdAt: daysAgo(9, '14:00'),
    claims: [
      {
        ...by(ME.id),
        status: 'rejected',
        reward: 300,
        position: 1,
        claimedAt: daysAgo(7, '19:00'),
        startedAt: daysAgo(7, '19:00'),
        submittedAt: daysAgo(7, '19:00'),
        submitNote: '',
        rejectReason: 'The glossary keeps “EMI” and “UPI” in English — the translation changed both. Thanks for trying!',
        submission: { text: 'आपका पैसा, आपके नियम। …' },
      },
    ],
  }),
  task({
    id: 'bt-demo-story',
    title: 'Create a 15-second Instagram story template for Showreel 2026',
    desc: 'A reusable story template (1080×1920) with a slot for a 5-second clip and the showreel title card.',
    category: 'Design',
    submissionType: 'image',
    reward: 350,
    maxAttachments: 2,
    deadline: addDays(T0, 6),
    ...KIRAN,
    createdAt: daysAgo(1, '10:30'),
    claims: [{ ...by(ME.id), status: 'claimed', reward: 350, position: 1, claimedAt, claimExpiresAt: new Date(Date.parse(claimedAt) + 24 * 3600000).toISOString() }],
  }),
  task({
    id: 'bt-demo-blog',
    title: 'Write a 300-word behind-the-scenes post on the Diwali shoot',
    desc: 'For the company blog: what it took to light a jewellery film, with one or two fun moments from the set.',
    category: 'Copywriting',
    submissionType: 'text',
    reward: 250,
    maxAccepts: 2,
    deadline: addDays(T0, 7),
    ...KIRAN,
    createdAt: daysAgo(10, '09:00'),
    claims: [
      {
        ...by(ME.id),
        status: 'in_progress',
        reward: 250,
        position: 1,
        claimedAt: daysAgo(8, '10:00'),
        startedAt: daysAgo(8, '10:00'),
        submittedAt: daysAgo(5, '18:00'),
        rejectReason: 'Good draft — please add two quotes from the director and trim the intro.',
        submission: { text: 'Lighting gold is harder than it looks…' },
      },
    ],
  }),
  task({
    id: 'bt-demo-stream',
    title: 'Volunteer: run the town hall live stream',
    desc: 'Two volunteers to set up the OBS stream and the backup recording for the town hall.',
    category: 'Events',
    submissionType: 'text',
    reward: 300,
    maxAccepts: 2,
    status: 'closed',
    deadline: addDays(T0, 3),
    ...ARVIND,
    createdAt: daysAgo(4, '09:00'),
    claims: [done('u-imran', 300, 1, 3), done('u-farhan', 300, 2, 3)],
  }),
  task({
    id: 'bt-demo-vendor',
    title: 'Nominate a venue for the year-end party',
    desc: 'Suggest a venue in Hyderabad for 60 people, with an estimate per head.',
    category: 'Culture',
    submissionType: 'text',
    reward: 100,
    deadline: addDays(T0, -2),
    ...ARVIND,
    createdAt: daysAgo(16, '15:00'),
    claims: [done('u-zoya', 100, 1, 10)],
  }),
];

// ── Wallet, ledger, redemptions ──────────────────────────────────────────────
const wallet: BountyWallet = {
  id: ME.id,
  name: ME.name,
  allocated: 0,
  reserved: 0,
  spent: 0,
  earned: 0,
  redeemed: 1000,
  available: 0,
  referralAllocated: 0,
  referralReserved: 0,
  referralSpent: 0,
  referralEarned: 500,
};

const txn = (t: Omit<BountyTxn, 'status'> & Partial<BountyTxn>): BountyTxn & { tenantId: string } => ({ status: 'completed', tenantId: DEMO_TENANT_ID, ...t });
const TXNS: (BountyTxn & { tenantId: string })[] = [
  txn({ id: 'btx-demo-05', type: 'BOUNTY_REWARD_TRANSFER', amount: 1000, fromWalletId: 'u-kiran', fromWalletName: 'Kiran Rao', toWalletId: ME.id, toWalletName: ME.name, taskName: 'Edit of the month — July', reason: 'Edit of the month', performedBy: 'Kiran Rao', createdAt: daysAgo(85, '17:00') }),
  txn({ id: 'btx-demo-04', type: 'REFERRAL_BONUS_TRANSFER', amount: 500, fromWalletId: `company_${DEMO_TENANT_ID}`, fromWalletName: 'Company wallet', toWalletId: ME.id, toWalletName: ME.name, reason: 'Referral bonus — Sanjay Kumar joined as Video Editor', performedBy: 'Lakshmi Prasad', createdAt: daysAgo(70, '12:00') }),
  txn({ id: 'btx-demo-03', type: 'BOUNTY_REWARD_TRANSFER', amount: 450, fromWalletId: 'u-arvind', fromWalletName: 'Arvind Menon', toWalletId: ME.id, toWalletName: ME.name, taskId: 'bt-old-thumbs', taskName: 'Thumbnail set for Kathalu S1', performedBy: 'Arvind Menon', createdAt: daysAgo(50, '16:20') }),
  txn({ id: 'btx-demo-02', type: 'REDEMPTION', amount: 1000, fromWalletId: ME.id, fromWalletName: ME.name, reason: 'Redeemed for an Amazon voucher', performedBy: 'Lakshmi Prasad', createdAt: daysAgo(41, '11:10') }),
];

// Rewards for claims already completed on the board are on the ledger too (and in the wallet).
for (const t of TASKS) {
  for (const c of t.claims) {
    if (c.employeeId !== ME.id || c.status !== 'completed') continue;
    TXNS.push(txn({ id: `btx-${t.id}`, type: 'BOUNTY_REWARD_TRANSFER', amount: Number(c.reward ?? t.reward), fromWalletId: t.creatorId, fromWalletName: t.creatorName, toWalletId: ME.id, toWalletName: ME.name, taskId: t.id, taskName: t.title, performedBy: t.creatorName, createdAt: c.approvedAt ?? nowIso() }));
  }
}
wallet.earned = TXNS.filter((x) => x.toWalletId === ME.id).reduce((s, x) => s + x.amount, 0);

// balanceAfter from the employee's side: redeemable coins after each movement, oldest first.
function rebalance() {
  let bal = 0;
  for (const x of [...TXNS].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    bal += x.toWalletId === ME.id ? x.amount : x.fromWalletId === ME.id ? -x.amount : 0;
    x.balanceAfter = bal;
  }
}
rebalance();

const REDEMPTIONS: (BountyRedemption & { tenantId: string })[] = [
  {
    id: 'br-demo-01',
    userId: ME.id,
    userName: ME.name,
    tenantId: DEMO_TENANT_ID,
    coins: 1000,
    status: 'approved',
    requestedAt: daysAgo(43, '10:30'),
    approvedAt: daysAgo(41, '11:10'),
    approvedBy: 'Lakshmi Prasad',
    amazonLink: 'https://www.amazon.in/',
    couponCode: 'AMZ-TMD-7Q2K-91XP',
    codeRevealedAt: daysAgo(41, '18:00'),
    codeExpiresAt: new Date(Date.parse(daysAgo(41, '18:00')) + 20 * 3600000).toISOString(),
  },
  { id: 'br-demo-02', userId: 'u-meera', userName: 'Meera Nair', tenantId: DEMO_TENANT_ID, coins: 1500, status: 'pending', requestedAt: daysAgo(1, '15:00') },
];

// ── Leaderboard: everyone's earnings, with the demo person's live total ──────
const OTHERS: [string, number][] = [
  ['u-meera', 3250],
  ['u-farhan', 2900],
  ['u-anita', 2400],
  ['u-sneha', 1800],
  ['u-zoya', 1450],
  ['u-kavya', 1200],
  ['u-rahul', 950],
  ['u-imran', 700],
  ['u-sanjay', 600],
  ['u-nikhil', 300],
];
function leaderboard(limit: number): BountyLeaderboard & { ok: true } {
  const rows: BountyLeaderRow[] = [...OTHERS.map(([id, total]) => ({ id, total })), ...(takesPart() ? [{ id: ME.id, total: Number(wallet.earned) }] : [])]
    .sort((a, b) => b.total - a.total)
    .map((r, i) => ({ rank: i + 1, employeeId: r.id, name: personById(r.id)?.name ?? 'Employee', hasAvatar: false, source: 'users', total: r.total }));
  const topN = Math.max(1, Math.min(20, Math.round(limit) || 5));
  return { ok: true, top: rows.slice(0, topN), me: rows.find((r) => r.employeeId === ME.id) ?? null, totalRanked: rows.length };
}

function earnedThisMonth() {
  if (!takesPart()) return 0;
  return TXNS.filter((x) => x.toWalletId === ME.id && ['BOUNTY_REWARD_TRANSFER', 'REFERRAL_BONUS_TRANSFER'].includes(x.type) && String(x.createdAt).slice(0, 7) >= MONTH).reduce((s, x) => s + x.amount, 0);
}
const capStatus = () => {
  const earned = earnedThisMonth();
  return { ok: true, cap: CAP, earned, capped: earned >= CAP };
};

// ── Board rows (bountyTaskListRow) ───────────────────────────────────────────
function listRow(t: Task): BountyTask {
  const { referenceFileData, claims, ...rest } = t;
  return {
    ...rest,
    hasReferenceFile: !!referenceFileData,
    claims: claims.filter((c) => notMine(c.employeeId)).map(({ submission, approvedAt: _a, ...c }) => ({ ...c, hasSubmission: !!submission })),
  };
}

const expired = (t: Task) => !!t.deadline && t.deadline < today();
// server.js BOUNTY_NON_CLAIMING_ROLES: these roles never claim and have no wallet of their own, so the
// demo person's claims, coins, ledger rows, redemptions and rank are not theirs (App Manager oversees).
// The Super Admin is a Bounty Task Creator the server never lets claim (see claim below), so the
// demo person's claims, earnings and rank can't be theirs either.
const NON_CLAIMING = ['master_admin', 'app_manager', 'announcement_viewer', 'visitor_manager', 'super_admin'];
const takesPart = () => !NON_CLAIMING.includes(currentPersona().role);
const notMine = (id: string | null | undefined) => takesPart() || id !== ME.id;
const mineOn = (t: Task) => (takesPart() ? t.claims.find((c) => c.employeeId === ME.id) : undefined);

function rewardFor(t: Task, position: number) {
  if (!t.phaseWiseCoins || !t.phases?.length) return t.reward;
  for (const p of t.phases) {
    const upTo = p.upTo === '' || p.upTo == null ? null : Number(p.upTo);
    if (upTo == null || position <= upTo) return p.coins;
  }
  return t.reward;
}

function checkSubmission(t: Task, sub: BountySubmission) {
  const type = t.submissionType || 'text';
  if (type === 'text' && !String(sub.text || '').trim()) return 'Enter the text content requested for this task.';
  if (type === 'link' && !String(sub.linkUrl || '').trim()) return 'Enter a link for this task.';
  if ((type === 'image' || type === 'video' || type === 'document') && !sub.fileData) return `Upload the ${type} requested for this task.`;
  const cap = Math.min(10, Math.max(1, Math.floor(Number(t.maxAttachments)) || 1));
  const count = type === 'link' ? (Array.isArray(sub.links) ? sub.links.filter((u) => String(u || '').trim()).length : sub.linkUrl ? 1 : 0) : Array.isArray(sub.files) ? sub.files.length : sub.fileData ? 1 : 0;
  if (count > cap) return `This task accepts at most ${cap} ${type === 'link' ? 'link' : type}${cap > 1 ? 's' : ''}.`;
  return null;
}

// bounty_task_approve_claim: pays the claim's reward into my wallet and writes the ledger row.
function payOut(t: Task, c: Claim) {
  const at = nowIso();
  c.status = 'completed';
  c.approvedAt = at;
  const amount = Number(c.reward ?? t.reward);
  wallet.earned = Number(wallet.earned) + amount;
  TXNS.push(txn({ id: newId('btx'), type: 'BOUNTY_REWARD_TRANSFER', amount, fromWalletId: t.creatorId, fromWalletName: t.creatorName, toWalletId: ME.id, toWalletName: ME.name, taskId: t.id, taskName: t.title, performedBy: t.creatorName, createdAt: at }));
  rebalance();
}

function claimAndSubmit(id: string, body: unknown) {
  const t = TASKS.find((x) => x.id === id);
  if (!t) return notFound('Bounty task not found.');
  if (t.creatorId === ME.id) return fail('You cannot submit for your own bounty task.');
  // server.js: the oversight role never claims; creators (super admin) can't either, unlike CEO/COO.
  const role = currentPersona().role;
  if (role === 'app_manager') return fail('This role can only monitor bounty tasks, not claim them.', 403);
  if (['super_admin'].includes(role)) return fail('Bounty Task Creators cannot claim bounty tasks.', 403);
  if (t.cancelledAt || t.status !== 'open') return fail('This task is no longer accepting new claims.');
  if (expired(t)) return fail(`This bounty task closed on ${t.deadline}. Ask whoever created it to extend the deadline if it is still going.`, 409);
  if (capStatus().capped) return fail(`You've reached this month's Bounty Coins earning cap of ${CAP} coins — new bounty tasks will be available again next month.`, 403);
  if (mineOn(t)) return fail('You have already submitted for this task.');
  if (t.maxAccepts != null && t.claims.length >= t.maxAccepts) return fail('This task has already reached its maximum number of acceptances.');
  const b = (body || {}) as { submitNote?: unknown; submission?: BountySubmission };
  const sub = b.submission || {};
  const problem = checkSubmission(t, sub);
  if (problem) return fail(problem);
  const at = nowIso();
  const position = t.claims.length + 1;
  const c: Claim = { ...by(ME.id), status: 'submitted', claimedAt: at, startedAt: at, submittedAt: at, submission: sub, submitNote: String(b.submitNote ?? ''), reward: rewardFor(t, position), position };
  t.claims.push(c);
  if (t.maxAccepts != null && t.claims.length >= t.maxAccepts) t.status = 'closed';
  if (t.requiresApproval === false) payOut(t, c);
  return { ok: true, ...listRow(t) };
}

function submitExisting(id: string, body: unknown) {
  const t = TASKS.find((x) => x.id === id);
  if (!t) return notFound('Bounty task not found.');
  const c = mineOn(t);
  if (!c) return fail('You have not accepted this task.', 403);
  if (c.status !== 'claimed' && c.status !== 'in_progress') return fail('This claim is not in a submittable state.', 409);
  const b = (body || {}) as { submitNote?: unknown; submission?: BountySubmission };
  const sub = b.submission || {};
  const problem = checkSubmission(t, sub);
  if (problem) return fail(problem);
  Object.assign(c, { status: 'submitted', submitNote: String(b.submitNote ?? ''), submission: sub, submittedAt: nowIso() });
  if (t.requiresApproval === false) payOut(t, c);
  return { ok: true, ...listRow(t) };
}

function start(id: string) {
  const t = TASKS.find((x) => x.id === id);
  if (!t) return notFound('Bounty task not found.');
  const c = mineOn(t);
  if (!c) return fail('You have not accepted this task.', 403);
  if (c.status !== 'claimed') return fail('This claim is no longer in a claimed state.', 409);
  Object.assign(c, { status: 'in_progress', startedAt: nowIso() });
  return { ok: true, ...listRow(t) };
}

function submissionFiles(sub?: BountySubmission) {
  if (!sub) return [];
  if (Array.isArray(sub.files) && sub.files.length) return sub.files;
  return sub.fileData ? [{ fileData: sub.fileData, fileName: sub.fileName }] : [];
}

function redeem(body: unknown) {
  const amt = Math.round(Number((body as { coins?: unknown })?.coins));
  if (!amt || amt < REDEEM_MIN) return fail(`Minimum redemption is ${REDEEM_MIN} coins.`);
  const redeemable = takesPart() ? Math.max(0, Number(wallet.earned || 0) - Number(wallet.redeemed || 0)) : 0;
  if (amt > redeemable) return fail(`You only have ${redeemable} redeemable coins.`);
  if (REDEMPTIONS.some((r) => r.userId === ME.id && r.status === 'pending')) return fail('You already have a redemption request in progress.', 409);
  const rec = { id: `br${Date.now()}`, userId: ME.id, userName: ME.name, tenantId: DEMO_TENANT_ID, coins: amt, status: 'pending', requestedAt: nowIso() };
  REDEMPTIONS.unshift(rec);
  return { ok: true, ...rec };
}

function reveal(id: string) {
  const r = REDEMPTIONS.find((x) => x.id === id);
  if (!r) return notFound('Redemption request not found.');
  if (r.userId !== ME.id || !takesPart()) return fail('This is not your redemption request.', 403);
  if (r.status !== 'approved') return fail('This coupon is not ready yet.');
  const now = nowIso();
  r.codeRevealedAt = r.codeRevealedAt || now;
  r.codeExpiresAt = r.codeExpiresAt || new Date(Date.now() + 20 * 3600000).toISOString();
  return { ok: true, request: r };
}

export const bountyRoutes: Route[] = [
  ['GET', /^\/bounty_tasks$/, () => TASKS.map(listRow)],
  [
    'GET',
    /^\/bounty_tasks\/my_claims$/,
    () =>
      TASKS.flatMap((t): BountyClaimReminder[] => {
        const c = mineOn(t);
        if (!c || c.status !== 'claimed' || t.cancelledAt) return [];
        return [{ id: t.id, title: t.title, category: t.category || '', reward: Number(c.reward ?? t.reward), deadline: t.deadline || '', claimedAt: c.claimedAt || '', claimExpiresAt: c.claimExpiresAt || '' }];
      }).sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')),
  ],
  [
    'GET',
    /^\/bounty_tasks\/([^/]+)\/reference$/,
    ([, id]) => {
      const t = TASKS.find((x) => x.id === id);
      return t ? { fileData: t.referenceFileData || '', fileName: t.referenceFileName || '' } : notFound('Bounty task not found.');
    },
  ],
  [
    'GET',
    /^\/bounty_tasks\/([^/]+)\/my_submission$/,
    ([, id]) => {
      const t = TASKS.find((x) => x.id === id);
      if (!t) return notFound('Bounty task not found.');
      const c = mineOn(t);
      if (!c || !c.submission) return notFound('You have not submitted anything on this task.');
      const { approvedAt: _a, ...claim } = c;
      return { ok: true, ...claim, submissionType: t.submissionType || 'text', taskTitle: t.title || '' };
    },
  ],
  [
    'GET',
    /^\/bounty_tasks\/([^/]+)\/submissions\/([^/]+)\/files\/(\d+)\/download$/,
    ([, id, emp, idx]) => {
      const t = TASKS.find((x) => x.id === id);
      if (!t) return notFound('Bounty task not found.');
      const c = t.claims.find((x) => x.employeeId === emp);
      if (!c || c.employeeId !== ME.id) return fail('You do not have access to this submission.', 403);
      const f = submissionFiles(c.submission)[Number(idx)];
      if (!f || !f.fileData) return notFound('This submission has no such file.');
      return { ok: true, url: f.fileData, fileName: f.fileName || 'submission', inline: true };
    },
  ],
  ['POST', /^\/bounty_tasks\/([^/]+)\/claim_and_submit$/, ([, id], body) => claimAndSubmit(id!, body)],
  ['POST', /^\/bounty_tasks\/([^/]+)\/submit$/, ([, id], body) => submitExisting(id!, body)],
  ['POST', /^\/bounty_tasks\/([^/]+)\/start$/, ([, id]) => start(id!)],
  [
    'GET',
    /^\/bounty\/wallet\/([^/]+)$/,
    // A role with no wallet gets the server's empty one ({ id, allocated: 0, … }).
    ([, id]) =>
      id !== ME.id
        ? fail('You are not authorized to view this wallet.', 403)
        : takesPart()
          ? { ok: true, ...wallet }
          : { ok: true, id: ME.id, allocated: 0, reserved: 0, spent: 0, earned: 0, available: 0 },
  ],
  [
    'GET',
    /^\/bounty_transactions$/,
    () =>
      [...TXNS]
        .filter((x) => takesPart() && (x.fromWalletId === ME.id || x.toWalletId === ME.id))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  ],
  ['GET', /^\/bounty_redemptions$/, () => REDEMPTIONS.filter((r) => notMine(r.userId))],
  ['POST', /^\/bounty_redemptions$/, (_p, body) => redeem(body)],
  ['POST', /^\/bounty_redemptions\/([^/]+)\/reveal$/, ([, id]) => reveal(id!)],
  ['GET', /^\/bounty\/leaderboard$/, (_p, _b, q) => leaderboard(Number(q.get('limit')) || 5)],
  ['GET', /^\/bounty\/monthly-status\/([^/]+)$/, ([, id]) => (id === ME.id ? capStatus() : fail('You are not authorized to view this.', 403))],
];

// ── Exports for the domain fixtures (Wave 0, docs/port/EXTENSION-POINTS.md §10) ──
// The live bounty board, ledger and use-coins requests the routes above read, so bounty admin (coin
// distribution, creators, approvals) and the employee's own Bounty screens agree.
export const bountyTaskStore = TASKS;
export const txStore = TXNS;
export const redemptionStore = REDEMPTIONS;

// Wallets of people other than the demo person, made on first use (all zero, earnings from the ledger).
const OTHER_WALLETS = new Map<string, BountyWallet>();

/** The wallet of `id`: the demo person's own live wallet, or another person's (created empty on first use). */
export function walletOf(id: string, name?: string): BountyWallet {
  if (id === ME.id) return wallet;
  let w = OTHER_WALLETS.get(id);
  if (!w) {
    const earned = TXNS.filter((x) => x.toWalletId === id).reduce((s, x) => s + x.amount, 0);
    w = { id, name: name ?? personById(id)?.name ?? 'Employee', allocated: 0, reserved: 0, spent: 0, earned, redeemed: 0, available: 0, referralAllocated: 0, referralReserved: 0, referralSpent: 0, referralEarned: 0 };
    OTHER_WALLETS.set(id, w);
  }
  return w;
}

/** Write one ledger row (status 'completed', this company) and recompute the demo person's balances. */
export function addTx(t: Omit<BountyTxn, 'status'> & Partial<BountyTxn>): BountyTxn {
  const row = txn(t);
  TXNS.unshift(row);
  rebalance();
  return row;
}
