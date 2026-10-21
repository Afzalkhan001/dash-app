// Hiring domain (wave 2) — the gates of the website's Referral Program (ReferralHub, dash.html:15263),
// ported line for line. VISIBILITY ONLY: the server re-checks every write (server.js:7605-8790), so
// these decide what is shown and never stand in for the server.
//
//   The menu        navForRaw `referrals` (:1531-1532): super_admin, ceo, coo, admin, hr, it_admin,
//                   manager, employee, professional, app_manager + the company switch, and only when
//                   isJobOpeningCreator(user) || JOB_OPENINGS.length > 0.
//   Tabs (:15294)   Open positions + My referrals: everyone on the menu.
//                   Manage positions: isJobOpeningCreator (hr, super_admin, ceo, coo — :11955 / server.js:7605).
//                   Referred candidates: creators, app_manager (read-only), or anyone HR forwarded one to.
//                   Public applications: creators, or anyone forwarded at least one application.
//   Actions         ReferredCandidatesBoard (:16147-16194), PublicApplicationsDetail (:15500-15560).

import type { Tenant } from '@/api/me';
import type { JobOpening, Referral } from '@/api/hiring';
import { isJobOpeningCreator, type NavUser, webNav } from '@/lib/access';

type U = NavUser | null | undefined;
type T = Tenant | null | undefined;

export { isJobOpeningCreator };

/** What the website reads from data it loaded (JOB_OPENINGS, the forwarded checks at :15274-15292). */
export type HiringSignals = { jobs: number; forwardedToMe: boolean; appsForwarded: boolean };

/** navForRaw `referrals` with JOB_OPENINGS.length (any status — the boot list is unfiltered, :30330). */
export const canSeeReferrals = (u: U, t: T, jobs: number) => webNav(u, 'referrals', t, { jobOpenings: jobs });

/** ReferralHub isOverseer (:15271): the Application Manager reads Referred Candidates, never acts. */
export const isHiringOverseer = (u: U) => !!u && u.role === 'app_manager';

/** Manage Positions (:15296). */
export const canManagePositions = (u: U, t: T, s: HiringSignals) => canSeeReferrals(u, t, s.jobs) && isJobOpeningCreator(u);

/** Referred Candidates (:15297). */
export const canSeeCandidates = (u: U, t: T, s: HiringSignals) =>
  canSeeReferrals(u, t, s.jobs) && (isJobOpeningCreator(u) || s.forwardedToMe || isHiringOverseer(u));

/** Public Applications (:15303). */
export const canSeeApplications = (u: U, t: T, s: HiringSignals) => canSeeReferrals(u, t, s.jobs) && (isJobOpeningCreator(u) || s.appsForwarded);

/** Anything beyond Refer & earn: the Hiring workspace (positions, candidates, applications). */
export const canSeeHiringDesk = (u: U, t: T, s: HiringSignals) => canManagePositions(u, t, s) || canSeeCandidates(u, t, s) || canSeeApplications(u, t, s);

// ── Referred candidates: what this person may do with one referral ──────────
// ReferredCandidatesBoard (:16147-16194). `job` is the posting (a filled or closed one takes no more
// reviews: isFilled :16049). Exactly one set of buttons per status; app_manager gets words, never buttons.
export type ReferralAction = 'forward' | 'select' | 'reject' | 'shortlist' | 'map' | 'approve';

export const isFilledFor = (job: Pick<JobOpening, 'status'> | null | undefined) => !!job && job.status !== 'open';

export function referralActions(u: U, r: Referral, job: Pick<JobOpening, 'status'> | null | undefined): ReferralAction[] {
  if (!u) return [];
  const hr = isJobOpeningCreator(u);
  const filled = isFilledFor(job);
  const mine = !!r.forwardedToId && r.forwardedToId === u.id;
  switch (r.status) {
    case 'submitted':
      return !filled && hr ? ['forward', 'select', 'reject'] : [];
    case 'hr_accepted':
      if (filled) return [];
      if (hr) return ['select', 'forward', 'reject'];
      return mine && !isHiringOverseer(u) ? ['shortlist', 'reject'] : [];
    case 'shortlisted':
      return !filled && hr ? ['select', 'reject'] : [];
    case 'selected':
      return hr ? ['map'] : [];
    case 'eligible':
      return hr ? ['approve'] : [];
    default:
      return [];
  }
}

/** The muted line the website shows instead of buttons (:16152-16192). */
export function referralWaitingNote(u: U, r: Referral, job: Pick<JobOpening, 'status'> | null | undefined): string | null {
  const hr = isJobOpeningCreator(u);
  const filled = isFilledFor(job);
  if (['submitted', 'hr_accepted', 'shortlisted'].includes(r.status) && filled) return 'The position is filled, so this candidate can’t move on.';
  switch (r.status) {
    case 'submitted':
      return hr ? null : 'Waiting for HR to look at it.';
    case 'hr_accepted':
      return hr ? null : r.forwardedToId === u?.id && !isHiringOverseer(u) ? null : `With ${r.forwardedToName || 'a reviewer'} to review.`;
    case 'shortlisted':
      return hr ? null : 'Shortlisted. Waiting for HR’s decision.';
    case 'selected':
      return hr ? null : 'Selected. Waiting for HR to link their employee record.';
    case 'mapped':
      return 'In the 3-month service period.';
    case 'eligible':
      return hr ? null : 'Ready for HR to approve the bonus.';
    case 'not_eligible':
      return r.notEligibleReason || 'Not eligible for the bonus.';
    default:
      return null;
  }
}

/** The Mapped employee / Eligibility / Bonus / Résumé-viewed columns (:16121): creators; résumé-viewed also app_manager. */
export const seesHrColumns = (u: U) => isJobOpeningCreator(u);
export const seesResumeViewed = (u: U) => isJobOpeningCreator(u) || isHiringOverseer(u);

/** PublicApplicationsDetail: Forward is offered only when the server says canForward (HR-tier, :8697). */
export const canForwardApplication = (detail: { canForward?: boolean } | null | undefined) => !!detail?.canForward;
