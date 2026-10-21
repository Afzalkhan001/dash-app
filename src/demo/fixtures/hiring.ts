// Demo API for the hiring domain (wave 2): job openings, the referral pipeline and Public Careers
// applications, answered the way server.js:7605-8790 answers them (role checks, status gates, the
// "already reviewed" 409s, the 402 when the poster is short of Referral Coins, the 3-month eligibility
// sweep on GET /referrals). Everything is in memory and resets when the app restarts.
//
// Who is asking: the demo person is stored once as DEMO_USER ('demo-user', 'Afzal Employee') and
// demo/server.ts shows it as whichever persona is active, so "my" referrals and "my" postings follow the
// role being explored. A referral forwarded to a specific persona keeps that persona's own id
// ('demo-manager'): only Afzal Manager sees it as forwarded to them.
//
// Sample data (docs/port/hr-people.md §6):
//   Postings  Motion Designer (open, public, 500-coin bonus, 2 positions, 1 filled) · Social Media Manager
//             (open, no bonus) · Junior Video Editor (closed, 300 coins) · Senior Video Editor (closed, 2025).
//             The demo person posted the Motion Designer and Junior Video Editor ones, so the persona pays
//             those bonuses from their own Referral Coins (Afzal HR has 2,500 left, from bountyadmin.ts;
//             Afzal Super Admin has none, so approving as them shows the server's 402).
//   Referrals one per status: submitted (×2), hr_accepted (forwarded to Afzal Manager), shortlisted,
//             selected, mapped (Harini Rao, joined 40 days ago — added to the company here), eligible,
//             approved (bonus paid, the same 500 coins as the bounty ledger), rejected. Three of them are
//             the demo person's own, for My referrals.
//   Public applications  three for Motion Designer, one forwarded to Afzal Manager, with a timeline and notes.

import type { JobOpening, PublicAppEvent, PublicApplication, PublicApplicationDetail, PublicAppNote, Referral } from '@/api/hiring';
import { DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { addTx, walletOf } from '@/demo/fixtures/bounty';
import { personById, upsertPerson } from '@/demo/fixtures/org';
import { currentPersona, personaUserId, STAFF_PERSONAS } from '@/demo/personas';
import { addDays, daysAgo, fail, newId, notFound, nowIso, type Route, today } from '@/demo/state';
import { JOB_OPENING_CREATOR_ROLES } from '@/lib/access';

const ME = { id: DEMO_USER.id, name: String(DEMO_USER.name) };
// PUBLIC_APP_STATUSES (server.js:8630), the same list as api/hiring.ts. Copied, not imported: a demo
// fixture takes only types from @/api/*, so the demo server never pulls an API module in while the
// session store is still loading (integrator pass 2).
const PUBLIC_APP_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'SELECTED', 'REJECTED', 'ON_HOLD', 'WITHDRAWN'] as const;
const RESUME_PDF =
  'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMzAwIDIwMF0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggODk+PnN0cmVhbQpCVCAvRjEgMTQgVGYgMjQgMTUwIFRkIChEZW1vIHJlc3VtZSkgVGogMCAtMjQgVGQgL0YxIDEwIFRmIChUYW1hZGEgTWVkaWEgREFTSCBkZW1vKSBUaiBFVAplbmRzdHJlYW0gZW5kb2JqCjUgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+CiUlRU9G';

// ── Who is asking ────────────────────────────────────────────────────────────
const role = () => currentPersona().role;
const isCreator = () => JOB_OPENING_CREATOR_ROLES.includes(role());
const meIds = () => new Set([ME.id, personaUserId(currentPersona())]);
const isMe = (id?: string | null) => !!id && meIds().has(id);
/** Who did it, as a name that stays put when the persona changes ("Afzal HR", not the swapped demo name). */
const actor = () => currentPersona().label;

/** A person by id: the company, or one of the Afzal personas (forwarding can name them). */
function who(id: string): { id: string; name: string; dateJoined?: string; resigned?: boolean; employeeNumber?: string } | null {
  const p = personById(id);
  if (p) return { id: p.id, name: p.name, dateJoined: p.dateJoined ? String(p.dateJoined) : undefined, resigned: p.resigned === true, employeeNumber: p.employeeNumber };
  const persona = STAFF_PERSONAS.find((x) => personaUserId(x) === id);
  return persona ? { id, name: persona.label, dateJoined: DEMO_USER.dateJoined ? String(DEMO_USER.dateJoined) : undefined, employeeNumber: persona.employeeNumber } : null;
}

const AFZAL_MANAGER = { id: 'demo-manager', name: 'Afzal Manager' };

// ── A recent joiner, so a referral can be "in the 3-month service period" ────
const HARINI_JOINED = addDays(today(), -40);
upsertPerson({
  id: 'u-harini',
  name: 'Harini Rao',
  role: 'employee',
  jobTitle: 'Junior Video Editor',
  dept: 'Creative',
  reportingTo: 'u-sanjay',
  reportingManager: 'Sanjay Kumar',
  employeeNumber: 'TM-1131',
  kekaCode: 'TM-1131',
  dateJoined: HARINI_JOINED,
  gender: 'Female',
  bloodGroup: 'O+ (O Positive)',
  mobile: '+919000101131',
  phone: '+919000101131',
});

// ── Postings ─────────────────────────────────────────────────────────────────
type DemoJob = JobOpening & { tenantId: string; image?: string };

const job = (j: Omit<DemoJob, 'tenantId' | 'hasImage'>): DemoJob => ({ tenantId: DEMO_TENANT_ID, hasImage: !!j.image, ...j });

const JOBS: DemoJob[] = [
  job({
    id: 'job-motion',
    position: 'Motion Designer',
    experienceRequired: '2-4 years',
    package: '6-9 LPA',
    description:
      'Design and animate explainers, title sequences and social cut-downs for brand films.\n\nYou know After Effects inside out, can storyboard a 30-second idea on paper, and enjoy working with editors and colourists.',
    referralBonus: 500,
    positions: 2,
    status: 'open',
    createdBy: ME.name,
    createdById: ME.id,
    createdAt: daysAgo(21, '11:00'),
    location: 'Hyderabad, Bengaluru',
    department: 'Creative',
    hiringManagerId: 'u-priya',
    hiringManagerName: 'Priya Sharma',
    employmentType: 'Full Time',
    applicationDeadline: addDays(today(), 18),
    isPublic: true,
  }),
  job({
    id: 'job-social',
    position: 'Social Media Manager',
    experienceRequired: '3+ years',
    package: '7-10 LPA',
    description: 'Own the content calendar for three client brands: plan, post, reply and report. Instagram and YouTube first.',
    referralBonus: null,
    positions: 1,
    status: 'open',
    createdBy: 'Lakshmi Prasad',
    createdById: 'u-lakshmi',
    createdAt: daysAgo(12, '15:30'),
    location: 'Hyderabad',
    department: 'Marketing',
    hiringManagerId: 'u-vikram',
    hiringManagerName: 'Vikram Singh',
    employmentType: 'Full Time',
    applicationDeadline: '',
    isPublic: false,
  }),
  job({
    id: 'job-junior-editor',
    position: 'Junior Video Editor',
    experienceRequired: '0-2 years',
    package: '3.5-5 LPA',
    description: 'Cut first assemblies, sync rushes and prepare deliverables for the senior editors.',
    referralBonus: 300,
    positions: 2,
    status: 'closed',
    createdBy: ME.name,
    createdById: ME.id,
    createdAt: daysAgo(160, '10:00'),
    updatedAt: daysAgo(45, '17:00'),
    location: 'Hyderabad',
    department: 'Creative',
    hiringManagerId: 'u-sanjay',
    hiringManagerName: 'Sanjay Kumar',
    employmentType: 'Full Time',
    applicationDeadline: '',
    isPublic: false,
  }),
  job({
    id: 'job-senior-editor',
    position: 'Senior Video Editor',
    experienceRequired: '5+ years',
    package: '10-14 LPA',
    description: 'Lead edits on long-form brand films and documentaries.',
    referralBonus: 500,
    positions: 1,
    status: 'closed',
    createdBy: 'Lakshmi Prasad',
    createdById: 'u-lakshmi',
    createdAt: '2025-01-10T05:30:00.000Z',
    updatedAt: '2025-02-20T05:30:00.000Z',
    location: 'Hyderabad',
    department: 'Creative',
    hiringManagerId: 'u-priya',
    hiringManagerName: 'Priya Sharma',
    employmentType: 'Full Time',
    applicationDeadline: '',
    isPublic: false,
  }),
];

const jobById = (id: string) => JOBS.find((j) => j.id === id);
const jobRow = (j: DemoJob): JobOpening => {
  const { image: _img, ...rest } = j;
  return { ...rest, hasImage: !!j.image };
};

// ── Referrals ────────────────────────────────────────────────────────────────
type DemoReferral = Referral & { tenantId: string; resumeFileData: string };

const ref = (r: Omit<DemoReferral, 'tenantId' | 'resumeFileData' | 'hasResume' | 'bonusPaid'> & Partial<DemoReferral>): DemoReferral => ({
  tenantId: DEMO_TENANT_ID,
  resumeFileData: RESUME_PDF,
  resumeFileName: `${r.candidateName.replace(/\s+/g, '_')}_Resume.pdf`,
  hasResume: true,
  bonusPaid: false,
  ...r,
});

const REFS: DemoReferral[] = [
  ref({
    id: 'ref-aditya',
    jobOpeningId: 'job-motion',
    jobOpeningTitle: 'Motion Designer',
    candidateName: 'Aditya Kulkarni',
    candidateEmail: 'aditya.k@example.com',
    candidatePhone: '+91 98480 11223',
    profileLink: 'behance.net/adityak',
    qualification: 'B.Des, NID',
    yearsExperience: 3,
    currentSalary: '5.5 LPA',
    expectedSalary: '8 LPA',
    noticePeriod: '30 days',
    referredBy: 'Sneha Iyer',
    referredById: 'u-sneha',
    status: 'submitted',
    createdAt: daysAgo(2, '12:40'),
  }),
  ref({
    id: 'ref-pallavi',
    jobOpeningId: 'job-social',
    jobOpeningTitle: 'Social Media Manager',
    candidateName: 'Pallavi Joshi',
    candidateEmail: 'pallavi.joshi@example.com',
    candidatePhone: '+91 99890 44556',
    qualification: 'MBA, Marketing',
    yearsExperience: 4,
    noticePeriod: '2 months',
    referredBy: ME.name,
    referredById: ME.id,
    status: 'submitted',
    createdAt: daysAgo(1, '18:05'),
  }),
  ref({
    id: 'ref-rohit',
    jobOpeningId: 'job-motion',
    jobOpeningTitle: 'Motion Designer',
    candidateName: 'Rohit Sen',
    candidateEmail: 'rohit.sen@example.com',
    candidatePhone: '+91 90100 77881',
    profileLink: 'linkedin.com/in/rohitsen',
    qualification: 'BFA, Animation',
    yearsExperience: 2,
    currentSalary: '4.8 LPA',
    expectedSalary: '6.5 LPA',
    noticePeriod: 'Immediate',
    referredBy: 'Anita Desai',
    referredById: 'u-anita',
    status: 'hr_accepted',
    createdAt: daysAgo(6, '10:15'),
    forwardedToId: AFZAL_MANAGER.id,
    forwardedToName: AFZAL_MANAGER.name,
    forwardedBy: 'Lakshmi Prasad',
    forwardedById: 'u-lakshmi',
    forwardedAt: daysAgo(4, '11:30'),
    resumeViewedAt: daysAgo(4, '11:20'),
    resumeViewedBy: 'u-lakshmi',
    resumeViewedByName: 'Lakshmi Prasad',
  }),
  ref({
    id: 'ref-divya',
    jobOpeningId: 'job-social',
    jobOpeningTitle: 'Social Media Manager',
    candidateName: 'Divya Krishnan',
    candidateEmail: 'divya.k@example.com',
    candidatePhone: '+91 97000 22114',
    qualification: 'BA, Mass Communication',
    yearsExperience: 5,
    expectedSalary: '9 LPA',
    noticePeriod: '45 days',
    referredBy: 'Meera Nair',
    referredById: 'u-meera',
    status: 'shortlisted',
    createdAt: daysAgo(9, '09:50'),
    forwardedToId: 'u-vikram',
    forwardedToName: 'Vikram Singh',
    forwardedBy: 'Lakshmi Prasad',
    forwardedById: 'u-lakshmi',
    forwardedAt: daysAgo(8, '12:00'),
    shortlistedBy: 'Vikram Singh',
    shortlistedAt: daysAgo(5, '16:45'),
    resumeViewedAt: daysAgo(8, '11:40'),
    resumeViewedBy: 'u-lakshmi',
    resumeViewedByName: 'Lakshmi Prasad',
  }),
  ref({
    id: 'ref-karthik',
    jobOpeningId: 'job-motion',
    jobOpeningTitle: 'Motion Designer',
    candidateName: 'Karthik Iyer',
    candidateEmail: 'karthik.iyer@example.com',
    candidatePhone: '+91 98660 33445',
    qualification: 'B.Sc, Multimedia',
    yearsExperience: 4,
    noticePeriod: '30 days',
    referredBy: ME.name,
    referredById: ME.id,
    status: 'selected',
    createdAt: daysAgo(19, '14:20'),
    forwardedToId: 'u-priya',
    forwardedToName: 'Priya Sharma',
    forwardedBy: 'Lakshmi Prasad',
    forwardedById: 'u-lakshmi',
    forwardedAt: daysAgo(17, '10:00'),
    shortlistedBy: 'Priya Sharma',
    shortlistedAt: daysAgo(14, '15:10'),
    selectedBy: 'Lakshmi Prasad',
    selectedAt: daysAgo(10, '17:30'),
    resumeViewedAt: daysAgo(17, '09:45'),
    resumeViewedBy: 'u-lakshmi',
    resumeViewedByName: 'Lakshmi Prasad',
  }),
  ref({
    id: 'ref-harini',
    jobOpeningId: 'job-junior-editor',
    jobOpeningTitle: 'Junior Video Editor',
    candidateName: 'Harini Rao',
    candidateEmail: 'harini.rao@example.com',
    candidatePhone: '+91 90000 11310',
    qualification: 'B.Sc, Visual Communication',
    yearsExperience: 1,
    noticePeriod: 'Immediate',
    referredBy: 'Rahul Verma',
    referredById: 'u-rahul',
    status: 'mapped',
    createdAt: daysAgo(75, '11:00'),
    selectedBy: 'Lakshmi Prasad',
    selectedAt: daysAgo(55, '16:00'),
    mappedEmployeeId: 'u-harini',
    mappedEmployeeName: 'Harini Rao',
    mappedEmployeeNumber: 'TM-1131',
    joiningDate: HARINI_JOINED,
    mappedBy: 'Lakshmi Prasad',
    mappedById: 'u-lakshmi',
    mappedAt: daysAgo(38, '10:30'),
    resumeViewedAt: daysAgo(74, '10:00'),
    resumeViewedBy: 'u-lakshmi',
    resumeViewedByName: 'Lakshmi Prasad',
  }),
  ref({
    id: 'ref-kavya',
    jobOpeningId: 'job-junior-editor',
    jobOpeningTitle: 'Junior Video Editor',
    candidateName: 'Kavya Reddy',
    candidateEmail: 'kavya.reddy@example.com',
    candidatePhone: '+91 90000 10830',
    qualification: 'B.A, Film Studies',
    yearsExperience: 1,
    referredBy: 'Farhan Ali',
    referredById: 'u-farhan',
    status: 'eligible',
    createdAt: '2025-06-02T06:00:00.000Z',
    selectedBy: 'Lakshmi Prasad',
    selectedAt: '2025-06-20T10:00:00.000Z',
    mappedEmployeeId: 'u-kavya',
    mappedEmployeeName: 'Kavya Reddy',
    mappedEmployeeNumber: 'TM-1083',
    joiningDate: '2025-07-01',
    mappedBy: 'Lakshmi Prasad',
    mappedById: 'u-lakshmi',
    mappedAt: '2025-07-03T06:00:00.000Z',
    eligibleAt: daysAgo(3, '01:00'),
    resumeViewedAt: '2025-06-03T05:30:00.000Z',
    resumeViewedBy: 'u-lakshmi',
    resumeViewedByName: 'Lakshmi Prasad',
  }),
  ref({
    id: 'ref-sanjay',
    jobOpeningId: 'job-senior-editor',
    jobOpeningTitle: 'Senior Video Editor',
    candidateName: 'Sanjay Kumar',
    candidateEmail: 'sanjay.k@example.com',
    candidatePhone: '+91 90000 10770',
    qualification: 'B.Sc, Film & Video',
    yearsExperience: 7,
    referredBy: ME.name,
    referredById: ME.id,
    status: 'approved',
    createdAt: '2025-01-22T06:00:00.000Z',
    selectedBy: 'Lakshmi Prasad',
    selectedAt: '2025-02-20T06:00:00.000Z',
    mappedEmployeeId: 'u-sanjay',
    mappedEmployeeName: 'Sanjay Kumar',
    mappedEmployeeNumber: 'TM-1077',
    joiningDate: '2025-03-03',
    mappedBy: 'Lakshmi Prasad',
    mappedById: 'u-lakshmi',
    mappedAt: '2025-03-04T06:00:00.000Z',
    eligibleAt: '2025-06-03T06:00:00.000Z',
    approvedBy: 'Lakshmi Prasad',
    approvedById: 'u-lakshmi',
    approvedAt: daysAgo(70, '12:00'),
    bonusPaid: true,
    bonusAmount: 500,
    bonusTxnId: 'btx-demo-04',
    resumeViewedAt: '2025-01-23T06:00:00.000Z',
    resumeViewedBy: 'u-lakshmi',
    resumeViewedByName: 'Lakshmi Prasad',
  }),
  ref({
    id: 'ref-manoj',
    jobOpeningId: 'job-social',
    jobOpeningTitle: 'Social Media Manager',
    candidateName: 'Manoj Pillai',
    candidateEmail: 'manoj.p@example.com',
    qualification: 'BBA',
    yearsExperience: 1,
    referredBy: ME.name,
    referredById: ME.id,
    status: 'rejected',
    createdAt: daysAgo(11, '13:00'),
    rejectReason: 'We need someone with 3+ years of running brand accounts.',
    rejectedBy: 'Afzal HR',
    rejectedAt: daysAgo(9, '15:00'),
  }),
];
// The eligibility dates follow the joining dates (server.js:8124).
for (const r of REFS) if (r.joiningDate && !r.eligibilityDate) r.eligibilityDate = plus3Months(r.joiningDate);

function plus3Months(ymd: string) {
  const d = new Date(ymd);
  d.setMonth(d.getMonth() + 3);
  return d.toISOString();
}

const strip = ({ resumeFileData: _r, ...rest }: DemoReferral): Referral => rest;
const refById = (id: string) => REFS.find((r) => r.id === id);

// processReferralEligibility (server.js:8149): mapped → eligible once the date has passed and the
// employee is still active, or not_eligible when they left.
function sweep() {
  const now = Date.now();
  for (const r of REFS) {
    if (r.status !== 'mapped' || !r.eligibilityDate || Date.parse(r.eligibilityDate) > now) continue;
    const emp = r.mappedEmployeeId ? who(r.mappedEmployeeId) : null;
    if (emp && !emp.resigned) Object.assign(r, { status: 'eligible', eligibleAt: nowIso() });
    else Object.assign(r, { status: 'not_eligible', notEligibleAt: nowIso(), notEligibleReason: 'Mapped employee is no longer active before completing the 3-month service period.' });
  }
}

// ── Referral Coins (the poster's pool) ───────────────────────────────────────
// A poster pays bonuses from the Referral Coins Super Admin distributed to them. The persona's pool lives
// in bounty.ts's wallet store under the persona's own id (bountyadmin.ts seeds Afzal HR with 3,000 and
// lays it over GET /bounty/wallet/<me>), so this file reads and spends the same numbers.
const myPool = () => walletOf(personaUserId(currentPersona()), currentPersona().label);
const poolAvailable = () => {
  const w = myPool();
  return Math.max(0, Number(w.referralAllocated || 0) - Number(w.referralReserved || 0) - Number(w.referralSpent || 0));
};

// ── Public applications ──────────────────────────────────────────────────────
type DemoApp = PublicApplicationDetail & { forwardedById?: string };

const APPS: DemoApp[] = [
  {
    id: 'pa-sana',
    applicationRef: 'TMC-26-0418',
    jobId: 'job-motion',
    jobTitle: 'Motion Designer',
    candidateName: 'Sana Fatima',
    candidateEmail: 'sana.fatima@example.com',
    candidatePhone: '919849012345',
    profileLink: 'https://www.behance.net/sanafatima',
    hasResume: true,
    resumeFileName: 'Sana_Fatima_CV.pdf',
    qualification: 'B.Des, Communication Design',
    yearsExperience: 3,
    currentSalary: '6 LPA',
    expectedSalary: '8.5 LPA',
    noticePeriod: '30 days',
    status: 'SUBMITTED',
    appliedAt: daysAgo(1, '21:10'),
    forwardedToId: '',
    forwardedToName: '',
    timeline: [{ status: 'SUBMITTED', note: '', changedBy: '', at: daysAgo(1, '21:10') }],
    internalNotes: [],
  },
  {
    id: 'pa-vivek',
    applicationRef: 'TMC-26-0402',
    jobId: 'job-motion',
    jobTitle: 'Motion Designer',
    candidateName: 'Vivek Rao',
    candidateEmail: 'vivek.rao@example.com',
    candidatePhone: '919966554433',
    profileLink: 'vimeo.com/vivekrao',
    hasResume: true,
    resumeFileName: 'Vivek_Rao_Resume.pdf',
    qualification: 'BFA, Applied Art',
    yearsExperience: 2,
    currentSalary: '4.2 LPA',
    expectedSalary: '6 LPA',
    noticePeriod: 'Immediate',
    status: 'UNDER_REVIEW',
    appliedAt: daysAgo(5, '10:05'),
    forwardedToId: AFZAL_MANAGER.id,
    forwardedToName: AFZAL_MANAGER.name,
    forwardedBy: 'Lakshmi Prasad',
    forwardedById: 'u-lakshmi',
    forwardedAt: daysAgo(3, '12:15'),
    timeline: [
      { status: 'SUBMITTED', note: '', changedBy: '', at: daysAgo(5, '10:05') },
      { status: 'UNDER_REVIEW', note: 'Thanks for applying — our team is looking at your reel.', changedBy: 'Lakshmi Prasad', at: daysAgo(3, '12:10') },
      { status: 'UNDER_REVIEW', note: '', changedBy: 'Lakshmi Prasad', at: daysAgo(3, '12:15') },
    ],
    internalNotes: [{ id: 'pnote-1', note: 'Strong 2D work. Ask about 3D in the interview.', authorName: 'Lakshmi Prasad', at: daysAgo(3, '12:12') }],
  },
  {
    id: 'pa-neha',
    applicationRef: 'TMC-26-0377',
    jobId: 'job-motion',
    jobTitle: 'Motion Designer',
    candidateName: 'Neha Gupta',
    candidateEmail: 'neha.gupta@example.com',
    candidatePhone: '919700112233',
    hasResume: true,
    resumeFileName: 'Neha_Gupta.pdf',
    qualification: 'B.Tech + Arena Animation diploma',
    yearsExperience: 4,
    currentSalary: '7 LPA',
    expectedSalary: '9 LPA',
    noticePeriod: '60 days',
    status: 'INTERVIEW_SCHEDULED',
    appliedAt: daysAgo(14, '16:40'),
    forwardedToId: 'u-priya',
    forwardedToName: 'Priya Sharma',
    forwardedBy: 'Lakshmi Prasad',
    forwardedById: 'u-lakshmi',
    forwardedAt: daysAgo(12, '11:00'),
    timeline: [
      { status: 'SUBMITTED', note: '', changedBy: '', at: daysAgo(14, '16:40') },
      { status: 'UNDER_REVIEW', note: '', changedBy: 'Lakshmi Prasad', at: daysAgo(12, '10:50') },
      { status: 'SHORTLISTED', note: 'You have been shortlisted.', changedBy: 'Priya Sharma', at: daysAgo(8, '14:00') },
      { status: 'INTERVIEW_SCHEDULED', note: 'Interview on Monday at 11 AM at our Hyderabad office.', changedBy: 'Priya Sharma', at: daysAgo(4, '17:20') },
    ],
    internalNotes: [
      { id: 'pnote-3', note: 'Portfolio test sent on WhatsApp.', authorName: 'Priya Sharma', at: daysAgo(6, '10:00') },
      { id: 'pnote-2', note: 'Notice period is long; check for buyout.', authorName: 'Lakshmi Prasad', at: daysAgo(11, '09:30') },
    ],
  },
];

const appById = (id: string) => APPS.find((a) => a.id === id);
const canManageApp = (a: DemoApp) => isCreator() || isMe(a.forwardedToId);
const appListRow = (a: DemoApp): PublicApplication => ({
  id: a.id,
  applicationRef: a.applicationRef,
  jobId: a.jobId,
  jobTitle: a.jobTitle,
  candidateName: a.candidateName,
  candidateEmail: a.candidateEmail,
  candidatePhone: a.candidatePhone,
  status: a.status,
  appliedAt: a.appliedAt,
  forwardedToId: a.forwardedToId || '',
  forwardedToName: a.forwardedToName || '',
});

// ── Handlers ─────────────────────────────────────────────────────────────────
const NOT_CREATOR_POST = fail('You are not authorized to post job openings.', 403);
const NOT_CREATOR = fail('You are not authorized to manage job openings.', 403);
const HR_ONLY = (what: string) => fail(`Only HR (or Super Admin/CEO/COO) can ${what}.`, 403);
const ALREADY = fail('This candidate has already been reviewed.', 409);

function createJob(body: Record<string, unknown>) {
  if (!isCreator()) return NOT_CREATOR_POST;
  const position = String(body.position ?? '').trim();
  const description = String(body.description ?? '').trim();
  if (!position) return fail('Job position is required.');
  if (!description) return fail('Job description is required.');
  let bonus: number | null = null;
  if (body.referralBonus !== undefined && body.referralBonus !== null && body.referralBonus !== '') {
    bonus = Math.round(Number(body.referralBonus));
    if (!Number.isFinite(bonus) || bonus <= 0) return fail('Referral bonus must be a positive number.');
  }
  const positions = body.positions === undefined || body.positions === '' ? 1 : Math.round(Number(body.positions));
  if (!Number.isFinite(positions) || positions <= 0) return fail('Number of Positions must be a positive whole number.');
  const image = typeof body.image === 'string' ? body.image : '';
  const rec = job({
    id: newId('job'),
    position,
    experienceRequired: String(body.experienceRequired ?? ''),
    package: String(body.package ?? ''),
    description,
    image,
    referralBonus: bonus,
    positions,
    location: String(body.location ?? ''),
    department: String(body.department ?? ''),
    hiringManagerId: String(body.hiringManagerId ?? ''),
    hiringManagerName: String(body.hiringManagerName ?? ''),
    employmentType: String(body.employmentType || 'Full Time'),
    applicationDeadline: String(body.applicationDeadline ?? ''),
    isPublic: !!body.isPublic,
    status: 'open',
    createdBy: ME.name,
    createdById: ME.id,
    createdAt: nowIso(),
  });
  JOBS.unshift(rec);
  return { ok: true, jobOpening: jobRow(rec) };
}

function updateJob(id: string, body: Record<string, unknown>) {
  if (!isCreator()) return NOT_CREATOR;
  const j = jobById(id);
  if (!j) return notFound('Job opening not found.');
  const { status: _s, referralBonus: _b, createdById: _c, createdBy: _cb, tenantId: _t, performedById: _p, actorId: _a, ...changes } = body;
  if ('positions' in changes) {
    const p = Math.round(Number(changes.positions));
    if (!Number.isFinite(p) || p <= 0) return fail('Number of Positions must be a positive whole number.');
    changes.positions = p;
  }
  Object.assign(j, changes, { updatedAt: nowIso() });
  if ('image' in changes) j.hasImage = !!j.image;
  return { ok: true };
}

function setJobStatus(id: string, to: 'open' | 'closed') {
  if (!isCreator()) return NOT_CREATOR;
  const j = jobById(id);
  if (!j) return notFound('Job opening not found.');
  if (to === 'closed' && j.status !== 'open') return fail('This position is not currently open.', 409);
  if (to === 'open' && j.status !== 'closed') return fail('This position is not currently closed.', 409);
  Object.assign(j, { status: to, updatedAt: nowIso() });
  return { ok: true, ...jobRow(j) };
}

function deleteJob(id: string) {
  if (!isCreator()) return NOT_CREATOR;
  const i = JOBS.findIndex((j) => j.id === id);
  if (i >= 0) JOBS.splice(i, 1);
  return { ok: true };
}

function listReferrals(q: URLSearchParams) {
  sweep();
  let rows = [...REFS];
  const jobId = q.get('jobOpeningId');
  const by = q.get('referredById');
  if (jobId) rows = rows.filter((r) => r.jobOpeningId === jobId);
  if (by) rows = rows.filter((r) => r.referredById === by);
  // GET /api/referrals visibility (server.js:7858): HR-tier and app_manager see all; anyone else their own + forwarded.
  if (!isCreator() && !['app_manager', 'master_admin'].includes(role())) rows = rows.filter((r) => isMe(r.referredById) || isMe(r.forwardedToId));
  return rows.map(strip);
}

function resume(id: string) {
  const r = refById(id);
  if (!r) return notFound('Referral not found');
  const can = isCreator() || ['app_manager', 'master_admin'].includes(role()) || isMe(r.referredById) || isMe(r.forwardedToId);
  if (!can) return fail('You are not authorized to view this resume.', 403);
  // The first open by anyone but the Application Manager stamps "viewed" (server.js:7895).
  if (!r.resumeViewedAt && role() !== 'app_manager') Object.assign(r, { resumeViewedAt: nowIso(), resumeViewedBy: ME.id, resumeViewedByName: actor() });
  return { resumeFileData: r.resumeFileData, resumeFileName: r.resumeFileName || '' };
}

function refer(body: Record<string, unknown>) {
  const jobOpeningId = String(body.jobOpeningId ?? '');
  const candidateName = String(body.candidateName ?? '').trim();
  const fileName = String(body.resumeFileName ?? '');
  if (!jobOpeningId) return fail('Select which position you are referring this candidate for.');
  if (!candidateName) return fail("The candidate's name is required.");
  if (!body.resumeFileData) return fail("The candidate's resume is required.");
  if (!/\.(pdf|docx?|doc)$/.test(fileName.toLowerCase())) return fail('Resume must be a PDF, DOC, or DOCX file.');
  const j = jobById(jobOpeningId);
  if (!j) return notFound('Job opening not found.');
  if (j.status !== 'open') return fail('This position is no longer open for referrals.');
  const t = (v: unknown, n: number) => String(v == null ? '' : v).trim().slice(0, n);
  const yrsRaw = body.yearsExperience;
  const yrs = yrsRaw === '' || yrsRaw == null ? null : Number(yrsRaw);
  const rec: DemoReferral = {
    id: newId('ref'),
    jobOpeningId,
    jobOpeningTitle: j.position,
    candidateName,
    candidateEmail: t(body.candidateEmail, 200),
    candidatePhone: t(body.candidatePhone, 40),
    profileLink: t(body.profileLink, 300),
    qualification: t(body.qualification, 160),
    yearsExperience: yrs !== null && Number.isFinite(yrs) && yrs >= 0 && yrs <= 70 ? yrs : null,
    currentSalary: t(body.currentSalary, 80),
    expectedSalary: t(body.expectedSalary, 80),
    noticePeriod: t(body.noticePeriod, 80),
    resumeFileData: String(body.resumeFileData),
    resumeFileName: fileName,
    hasResume: true,
    referredBy: ME.name,
    referredById: ME.id,
    tenantId: DEMO_TENANT_ID,
    status: 'submitted',
    bonusPaid: false,
    createdAt: nowIso(),
  };
  REFS.unshift(rec);
  return { ok: true, referral: strip(rec) };
}

const openJobFor = (r: DemoReferral) => {
  const j = jobById(r.jobOpeningId);
  return !j || j.status === 'open';
};

function hrAccept(id: string, body: Record<string, unknown>) {
  if (!isCreator()) return HR_ONLY('accept a referral and forward it for review');
  const forwardToId = String(body.forwardToId ?? '');
  if (!forwardToId) return fail('Choose who to forward this candidate to.');
  const r = refById(id);
  if (!r) return notFound('Referral not found.');
  const target = who(forwardToId);
  if (!target) return notFound('The selected employee record was not found.');
  if (!openJobFor(r)) return fail('This position has already been filled and is no longer accepting new reviews.', 409);
  if (!['submitted', 'hr_accepted'].includes(r.status)) return ALREADY;
  Object.assign(r, { status: 'hr_accepted', forwardedToId: target.id, forwardedToName: target.name, forwardedBy: actor(), forwardedById: ME.id, forwardedAt: nowIso() });
  return strip(r);
}

const canReview = (r: DemoReferral) => isCreator() || isMe(r.forwardedToId);

function shortlist(id: string) {
  const r = refById(id);
  if (!r) return notFound('Referral not found.');
  if (!canReview(r)) return fail('You are not authorized to review this referred candidate.', 403);
  if (!openJobFor(r)) return fail('This position has already been filled and is no longer accepting new shortlisting.', 409);
  if (r.status !== 'hr_accepted') return ALREADY;
  Object.assign(r, { status: 'shortlisted', shortlistedBy: actor(), shortlistedAt: nowIso() });
  return strip(r);
}

function select(id: string) {
  if (!isCreator())
    return fail('Only HR (or Super Admin/CEO/COO) can make the final selection — a Hiring Manager or other forwarded reviewer can Shortlist or Reject a candidate for HR to review.', 403);
  const r = refById(id);
  if (!r) return notFound('Referral not found.');
  const j = jobById(r.jobOpeningId);
  if (j && j.status !== 'open') return fail('This position has already been filled and is no longer accepting selections.', 409);
  if (!['submitted', 'hr_accepted', 'shortlisted'].includes(r.status)) return ALREADY;
  Object.assign(r, { status: 'selected', selectedBy: actor(), selectedAt: nowIso() });
  if (j) {
    const selected = REFS.filter((x) => x.jobOpeningId === j.id && x.status === 'selected').length;
    if (selected >= (j.positions || 1)) Object.assign(j, { status: 'closed', updatedAt: nowIso() });
  }
  return { ok: true, referral: strip(r) };
}

function reject(id: string, body: Record<string, unknown>) {
  const r = refById(id);
  if (!r) return notFound('Referral not found.');
  if (!canReview(r)) return fail('You are not authorized to review this referred candidate.', 403);
  if (!['submitted', 'hr_accepted', 'shortlisted'].includes(r.status)) return ALREADY;
  Object.assign(r, { status: 'rejected', rejectReason: String(body.reason ?? ''), rejectedBy: actor(), rejectedById: ME.id, rejectedAt: nowIso() });
  return strip(r);
}

function mapEmployee(id: string, body: Record<string, unknown>) {
  if (!isCreator()) return HR_ONLY('map an onboarded employee to a referral');
  const employeeId = String(body.employeeId ?? '');
  if (!employeeId) return fail('Select the employee record to map.');
  const r = refById(id);
  if (!r) return notFound('Referral not found.');
  if (r.status !== 'selected') return fail('Only a Selected candidate can be mapped to an employee record.');
  const emp = who(employeeId);
  if (!emp) return notFound('Employee record not found.');
  if (!emp.dateJoined) return fail(`${emp.name} has no Joining Date on file — set it in Employee Roster first, then map again.`);
  if (Number.isNaN(Date.parse(emp.dateJoined))) return fail(`${emp.name}'s Joining Date ("${emp.dateJoined}") could not be read as a date — fix it in Employee Roster first.`);
  const clash = REFS.find((x) => x.id !== id && x.mappedEmployeeId === emp.id && !['rejected', 'not_eligible'].includes(x.status));
  if (clash) return fail(`${emp.name} is already mapped to another referral (${clash.candidateName || '—'}).`, 409);
  Object.assign(r, {
    status: 'mapped',
    mappedEmployeeId: emp.id,
    mappedEmployeeName: emp.name,
    mappedEmployeeNumber: emp.employeeNumber || '',
    joiningDate: emp.dateJoined,
    eligibilityDate: plus3Months(emp.dateJoined),
    mappedBy: actor(),
    mappedById: ME.id,
    mappedAt: nowIso(),
  });
  return { ok: true, referral: strip(r) };
}

function approveBonus(id: string) {
  if (!isCreator()) return HR_ONLY('approve a referral bonus');
  const r = refById(id);
  if (!r) return notFound('Referral not found.');
  if (r.status !== 'eligible') return fail('This referral is not yet eligible for bonus approval.');
  if (r.bonusPaid) return fail('This referral bonus has already been paid.', 409);
  const emp = r.mappedEmployeeId ? who(r.mappedEmployeeId) : null;
  if (!emp || emp.resigned) {
    Object.assign(r, { status: 'not_eligible', notEligibleAt: nowIso(), notEligibleReason: 'Mapped employee is no longer active as of approval time.' });
    return fail(`${r.mappedEmployeeName || 'The mapped employee'} is no longer active — this referral has been marked Not Eligible instead of approved.`, 409);
  }
  const j = jobById(r.jobOpeningId);
  const bonus = j && Number.isFinite(Number(j.referralBonus)) ? Math.round(Number(j.referralBonus)) : 0;
  const stamp = { status: 'approved', approvedBy: actor(), approvedById: ME.id, approvedAt: nowIso() };
  if (bonus <= 0) {
    Object.assign(r, stamp);
    return { ok: true, referral: strip(r) };
  }
  // The poster's Referral Coins pay (referral_bonus_transfer). Only the demo person has a pool.
  const poster = j?.createdById || '';
  const posterAvailable = poster === ME.id && isCreator() ? poolAvailable() : 0;
  if (bonus > posterAvailable) {
    return fail(
      `Cannot approve this bonus: Insufficient Referral Coins (available ${posterAvailable}, needed ${bonus}). Ask Super Admin to distribute more Referral Coins to ${poster === ME.id ? actor() : j?.createdBy || 'the position poster'}, then try again.`,
      402,
    );
  }
  const pool = myPool();
  pool.referralSpent = Number(pool.referralSpent || 0) + bonus;
  const referrer = r.referredById || '';
  const w = walletOf(referrer, r.referredBy);
  w.earned = Number(w.earned || 0) + bonus;
  w.referralEarned = Number(w.referralEarned || 0) + bonus;
  const tx = addTx({
    id: newId('btx'),
    type: 'REFERRAL_BONUS_TRANSFER',
    amount: bonus,
    fromWalletId: `${poster}:referral`,
    fromWalletName: j?.createdBy || 'Referral coins',
    toWalletId: referrer,
    toWalletName: r.referredBy,
    reason: `Referral bonus — ${r.candidateName} joined as ${r.jobOpeningTitle || j?.position || 'a new hire'}`,
    performedBy: actor(),
    createdAt: nowIso(),
  });
  Object.assign(r, stamp, { bonusPaid: true, bonusAmount: bonus, bonusTxnId: tx.id });
  return { ok: true, referral: strip(r) };
}

function listApps(q: URLSearchParams) {
  let rows = APPS.filter(canManageApp);
  const jobId = q.get('jobId');
  const status = q.get('status');
  const search = (q.get('search') || '').toLowerCase();
  if (jobId) rows = rows.filter((a) => a.jobId === jobId);
  if (status) rows = rows.filter((a) => a.status === status);
  if (search) rows = rows.filter((a) => [a.candidateName, a.candidateEmail, a.candidatePhone, a.applicationRef].some((v) => String(v || '').toLowerCase().includes(search)));
  return rows.sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt))).map(appListRow);
}

function appDetail(id: string): PublicApplicationDetail | ReturnType<typeof fail> {
  const a = appById(id);
  if (!a) return notFound('Application not found.');
  if (!canManageApp(a)) return fail('You are not authorized to view this application.', 403);
  const { forwardedById: _f, ...rest } = a;
  return { ...rest, canForward: isCreator(), timeline: [...a.timeline], internalNotes: [...a.internalNotes] };
}

function appStatus(id: string, body: Record<string, unknown>) {
  const status = String(body.status ?? '');
  if (!(PUBLIC_APP_STATUSES as readonly string[]).includes(status)) return fail('Invalid status.');
  const a = appById(id);
  if (!a) return notFound('Application not found.');
  if (!canManageApp(a)) return fail('You are not authorized to manage this application.', 403);
  a.status = status;
  const ev: PublicAppEvent = { status, note: String(body.note ?? '').trim(), changedBy: actor(), at: nowIso() };
  a.timeline.push(ev);
  return { ok: true };
}

function appForward(id: string, body: Record<string, unknown>) {
  const forwardToId = String(body.forwardToId ?? '');
  if (!forwardToId) return fail('Choose who to forward this candidate to.');
  const a = appById(id);
  if (!a) return notFound('Application not found.');
  if (!canManageApp(a)) return fail('You are not authorized to manage this application.', 403);
  const target = who(forwardToId);
  if (!target) return notFound('The selected employee record was not found.');
  Object.assign(a, { forwardedToId: target.id, forwardedToName: target.name, forwardedBy: actor(), forwardedById: ME.id, forwardedAt: nowIso() });
  a.timeline.push({ status: a.status, note: '', changedBy: actor(), at: nowIso() });
  return { ok: true };
}

function appNote(id: string, body: Record<string, unknown>) {
  const note = String(body.note ?? '').trim();
  if (!note) return fail('Note cannot be empty.');
  const a = appById(id);
  if (!a) return notFound('Application not found.');
  // server.js:8781 reads only job_id here, so a forwarded reviewer (not HR-tier) is refused.
  if (!isCreator()) return fail('You are not authorized to manage this application.', 403);
  const n: PublicAppNote = { id: newId('pnote'), note, authorName: actor(), at: nowIso() };
  a.internalNotes.unshift(n);
  return { ok: true };
}

const body = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});

export const hiringRoutes: Route[] = [
  ['GET', /^\/job_openings$/, (_p, _b, q) => (q.get('status') ? JOBS.filter((j) => j.status === q.get('status')) : JOBS).map(jobRow)],
  [
    'GET',
    /^\/job_openings\/([^/]+)\/image$/,
    ([, id]) => {
      const j = jobById(id!);
      return j ? { image: j.image || '' } : notFound('Job opening not found');
    },
  ],
  ['POST', /^\/job_openings$/, (_p, b) => createJob(body(b))],
  ['PUT', /^\/job_openings\/([^/]+)$/, ([, id], b) => updateJob(id!, body(b))],
  ['POST', /^\/job_openings\/([^/]+)\/close$/, ([, id]) => setJobStatus(id!, 'closed')],
  ['POST', /^\/job_openings\/([^/]+)\/reopen$/, ([, id]) => setJobStatus(id!, 'open')],
  ['DELETE', /^\/job_openings\/([^/]+)$/, ([, id]) => deleteJob(id!)],

  ['GET', /^\/referrals$/, (_p, _b, q) => listReferrals(q)],
  ['GET', /^\/referrals\/([^/]+)\/resume$/, ([, id]) => resume(id!)],
  ['POST', /^\/referrals$/, (_p, b) => refer(body(b))],
  ['POST', /^\/referrals\/([^/]+)\/hr-accept$/, ([, id], b) => hrAccept(id!, body(b))],
  ['POST', /^\/referrals\/([^/]+)\/shortlist$/, ([, id]) => shortlist(id!)],
  ['POST', /^\/referrals\/([^/]+)\/select$/, ([, id]) => select(id!)],
  ['POST', /^\/referrals\/([^/]+)\/reject$/, ([, id], b) => reject(id!, body(b))],
  ['POST', /^\/referrals\/([^/]+)\/map-employee$/, ([, id], b) => mapEmployee(id!, body(b))],
  ['POST', /^\/referrals\/([^/]+)\/approve-bonus$/, ([, id]) => approveBonus(id!)],

  ['GET', /^\/admin\/public-applications$/, (_p, _b, q) => listApps(q)],
  ['GET', /^\/admin\/public-applications\/([^/]+)$/, ([, id]) => appDetail(id!)],
  ['PUT', /^\/admin\/public-applications\/([^/]+)\/status$/, ([, id], b) => appStatus(id!, body(b))],
  ['POST', /^\/admin\/public-applications\/([^/]+)\/forward$/, ([, id], b) => appForward(id!, body(b))],
  ['POST', /^\/admin\/public-applications\/([^/]+)\/notes$/, ([, id], b) => appNote(id!, body(b))],
];
