// Hiring domain — the screens' one hook for "what can I see here", from live data (the plug-in functions
// read the same facts from the query cache instead, features/hiring/signals).
//
// ReferralHub (dash.html:15263) learns two things before it draws its tabs: whether HR forwarded me a
// referral (GET /referrals, :15274) and whether I was forwarded a public application (GET
// /admin/public-applications, :15285). The menu itself also needs JOB_OPENINGS.length (:1532).
// `ready` is false until those are known, so a screen never redirects on a guess.

import { useIsRestoring } from '@tanstack/react-query';

import { useJobOpenings, usePublicApplications, useReferrals } from '@/api/hiring';
import {
  canManagePositions,
  canSeeApplications,
  canSeeCandidates,
  canSeeReferrals,
  type HiringSignals,
  isHiringOverseer,
  isJobOpeningCreator,
} from '@/features/hiring/access';
import { useAccess } from '@/lib/use-access';

export function useHiring() {
  const access = useAccess();
  const user = access.user;
  const tenant = access.tenant;
  // On the referrals menu by role and company switch (the data part is decided below).
  const onMenu = canSeeReferrals(user, tenant, 1);
  const creator = isJobOpeningCreator(user);
  const jobs = useJobOpenings(onMenu);
  const refs = useReferrals(onMenu);
  const apps = usePublicApplications({}, onMenu && !creator);
  const signals: HiringSignals = {
    jobs: jobs.data?.length ?? 0,
    forwardedToMe: !!user && (refs.data ?? []).some((r) => r.forwardedToId === user.id),
    appsForwarded: creator || (apps.data?.length ?? 0) > 0,
  };
  // The tenant decides the company switch; jobs decide the menu for non-creators; the forwarded checks
  // decide two tabs. Failed loads count as known (nothing to show), never as "still loading" forever.
  // (While the saved cache is being restored, queries sit idle with no data — that is not "known".)
  const restoring = useIsRestoring();
  const settled = (q: { data?: unknown; isError: boolean }) => q.data !== undefined || q.isError;
  const ready = !!user && !restoring && !access.loading && (!onMenu || (settled(jobs) && settled(refs) && (creator || settled(apps))));
  return {
    access,
    user,
    tenant,
    ready,
    signals,
    jobs,
    refs,
    creator,
    overseer: isHiringOverseer(user),
    canRefer: canSeeReferrals(user, tenant, signals.jobs),
    canManage: canManagePositions(user, tenant, signals),
    canCandidates: canSeeCandidates(user, tenant, signals),
    canApplications: canSeeApplications(user, tenant, signals),
  };
}
