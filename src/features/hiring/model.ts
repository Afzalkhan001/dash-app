// Hiring domain — words, tones and small sums shared by the hiring screens. Pure.

import type { JobOpening, PublicAppStatus, Referral } from '@/api/hiring';
import type { StatusTone } from '@/theme/tokens';

/** The careers page every share link points at (dash.html:30046 CAREERS_PUBLIC_ORIGIN, :15637). */
export const CAREERS_URL = 'https://tamadamedia.com/careers';

/** JobOpeningCard's "Employment Type" options (:15944). */
export const EMPLOYMENT_TYPES = ['Full Time', 'Part Time', 'Contract', 'Internship'] as const;
/** The stored type ("Full Time", the website's value) in sentence case for the screen ("Full time"). */
export const employmentTypeLabel = (v?: string | null) => {
  const t = String(v ?? '').trim();
  return t ? t.charAt(0) + t.slice(1).toLowerCase() : '';
};

/** The description's limit on the website (:15952). */
export const DESCRIPTION_MAX = 2000;

// ── Referral status ──────────────────────────────────────────────────────────
// The website's status filter labels (:16099-16108), in plain words.
export const REFERRAL_STATUS_LABEL: Record<string, string> = {
  submitted: 'Waiting for HR',
  hr_accepted: 'With a reviewer',
  shortlisted: 'Shortlisted',
  selected: 'Selected',
  mapped: 'Joined, in service period',
  eligible: 'Bonus ready to approve',
  approved: 'Bonus approved',
  not_eligible: 'Not eligible',
  rejected: 'Rejected',
};

/** The filter chips, in the website's order (:16099). */
export const REFERRAL_FILTERS: { key: string; label: string }[] = [
  { key: 'submitted', label: 'Waiting for HR' },
  { key: 'hr_accepted', label: 'With a reviewer' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'selected', label: 'Selected' },
  { key: 'mapped', label: 'In service period' },
  { key: 'eligible', label: 'Bonus to approve' },
  { key: 'approved', label: 'Bonus paid' },
  { key: 'not_eligible', label: 'Not eligible' },
  { key: 'rejected', label: 'Rejected' },
];

export function referralStatusLabel(r: Pick<Referral, 'status' | 'bonusPaid'>) {
  if (r.status === 'approved') return r.bonusPaid ? 'Bonus paid' : 'Approved';
  return REFERRAL_STATUS_LABEL[r.status] ?? String(r.status || 'Unknown').replace(/_/g, ' ');
}

// SB (:956): active-looking green, in-progress blue, pending amber, inactive red.
export function referralStatusTone(status: string): StatusTone {
  switch (status) {
    case 'submitted':
      return 'pending';
    case 'hr_accepted':
    case 'shortlisted':
    case 'mapped':
      return 'info';
    case 'selected':
    case 'eligible':
    case 'approved':
      return 'done';
    case 'rejected':
    case 'not_eligible':
      return 'failed';
    default:
      return 'neutral';
  }
}

// ── Public application status ────────────────────────────────────────────────
// PUBLIC_APP_STATUS_LABELS (:15340).
export const PUBLIC_APP_LABEL: Record<PublicAppStatus, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW_SCHEDULED: 'Interview scheduled',
  INTERVIEW_COMPLETED: 'Interview done',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
  ON_HOLD: 'On hold',
  WITHDRAWN: 'Withdrawn',
};

export const publicAppLabel = (s: string) => PUBLIC_APP_LABEL[s as PublicAppStatus] ?? s;

export function publicAppTone(s: string): StatusTone {
  switch (s) {
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return 'pending';
    case 'SHORTLISTED':
    case 'INTERVIEW_SCHEDULED':
    case 'INTERVIEW_COMPLETED':
      return 'info';
    case 'SELECTED':
      return 'done';
    case 'REJECTED':
      return 'failed';
    default:
      return 'neutral';
  }
}

// ── Jobs ─────────────────────────────────────────────────────────────────────
export const positionsOf = (j: Pick<JobOpening, 'positions'>) => Math.max(1, Math.round(Number(j.positions) || 1));
export const isOpen = (j: Pick<JobOpening, 'status'> | null | undefined) => j?.status === 'open';

/** filledCountFor (:15834): referrals marked Selected for the posting. */
export const filledCount = (jobId: string, refs: Referral[] | undefined) =>
  (refs ?? []).filter((r) => r.jobOpeningId === jobId && r.status === 'selected').length;

export const bonusOf = (j: Pick<JobOpening, 'referralBonus'> | null | undefined) => {
  const n = Math.round(Number(j?.referralBonus) || 0);
  return n > 0 ? n : 0;
};

export const coins = (n: number) => `${Math.round(n).toLocaleString('en-IN')} ${Math.round(n) === 1 ? 'coin' : 'coins'}`;

/** Cities stored as one comma-joined string (CityTagInput :15379). */
export const citiesOf = (location?: string | null) =>
  String(location || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** "Hyderabad · Creative" — where and which team. */
export const whereLine = (j: Pick<JobOpening, 'location' | 'department'>) => [citiesOf(j.location).join(', '), j.department].filter(Boolean).join(' · ');

/** "2-4 years · 6-9 LPA · Full Time" — the facts line. */
export const factsLine = (j: Pick<JobOpening, 'experienceRequired' | 'package' | 'employmentType'>) =>
  [j.experienceRequired, j.package, employmentTypeLabel(j.employmentType)].filter((s) => !!s && String(s).trim()).join(' · ');

/** Sum of my paid referral bonuses (ReferralHub "Total Coins Earned", :15310). */
export const earnedFrom = (refs: Referral[] | undefined) => (refs ?? []).reduce((s, r) => s + (r.bonusPaid ? Number(r.bonusAmount) || 0 : 0), 0);

/** "4 yrs · notice 30 days · B.Des" — the candidate line under the name (:16112). */
export function candidateLine(r: Pick<Referral, 'qualification' | 'yearsExperience' | 'noticePeriod'>) {
  const y = r.yearsExperience;
  const yrs = y !== null && y !== undefined && y !== '' ? `${y} yr${Number(y) === 1 ? '' : 's'}` : '';
  return [r.qualification, yrs, r.noticePeriod ? `notice ${r.noticePeriod}` : ''].filter(Boolean).join(' · ');
}

/** map-employee's eligibility date: joining date + 3 calendar months (server.js:8124), as YYYY-MM-DD. */
export function eligibilityFrom(dateJoined: string) {
  const d = new Date(dateJoined);
  if (Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

/** A résumé's extension is what the server checks (server.js:7920). */
export const RESUME_RE = /\.(pdf|docx?|doc)$/i;
export const RESUME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** Last 4 digits of the id, as the website's "Job ID" (:15720). */
export const jobRef = (id: string) => String(id).replace(/\D/g, '').slice(-4) || id;

/** A link the person typed, made openable (profile links are often pasted without https://). */
export const openableUrl = (s?: string | null) => {
  const v = String(s || '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};
