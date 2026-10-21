// Hiring domain — what the website knows at boot and gates its menu on (navForRaw :1532: JOB_OPENINGS;
// ReferralHub :15274-15292: was a referral / an application forwarded to me), read from the query cache.
// The plug-in functions in features/hiring/nav.ts must not fetch; the Inbox plug-in
// (features/hiring/inbox) keeps these three queries warm for everyone on the referrals menu.
// Kept out of api/hiring.ts on purpose: the demo fixtures import that module, and api/query must not be
// pulled into the demo server's import chain (it would run before the session store exists).

import { hiringKeys, type JobOpening, type PublicApplication, type Referral } from '@/api/hiring';
import { queryClient } from '@/api/query';
import type { HiringSignals } from '@/features/hiring/access';

export function hiringSignals(userId: string | null | undefined): HiringSignals {
  if (!userId) return { jobs: 0, forwardedToMe: false, appsForwarded: false };
  const jobs = queryClient.getQueryData<JobOpening[]>(hiringKeys.jobs(userId));
  const refs = queryClient.getQueryData<Referral[]>(hiringKeys.referrals(userId));
  const apps = queryClient.getQueryData<PublicApplication[]>(hiringKeys.apps(userId));
  return {
    jobs: Array.isArray(jobs) ? jobs.length : 0,
    forwardedToMe: Array.isArray(refs) && refs.some((r) => r.forwardedToId === userId),
    appsForwarded: Array.isArray(apps) && apps.length > 0,
  };
}
