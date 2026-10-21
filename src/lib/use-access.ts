// One hook for "what can the signed-in person see": their user record, HR access (/hr/me), the
// company's feature switches, and the derived HR sections / approval queues. Screens use this
// instead of calling the access helpers by hand.
//
// EXTENSION POINT (Wave 0, docs/port/EXTENSION-POINTS.md §2). `Access` (this hook's result) is what
// every domain plug-in receives — workspaceRows(access), createActions(access), homeCards(access),
// InboxKindPlugin.useItems(access). Besides the HR fields it carries:
//   web(id, extra?)  the website's sidebar test (lib/access webNav) for this person and company, with
//                    /hr/me already filled in. Ids that the web gates on data it loaded at boot (job
//                    openings, Team Roster departments and tasks, owning a project code) stay false
//                    unless the caller passes that data in `extra`.
//   nav              the same sidebar as a flat id list (webNavList), without `extra`.
// Domain-specific gates live in features/<domain>/access.ts; a gate needed by two domains is promoted
// into lib/access.ts by the integrator.
//
// Boot data (integrator pass 2). The website draws its menu after loading a few lists at boot: the job
// openings (Refer & earn), referrals and applications forwarded to me (Hiring), and the Team Roster
// departments, grants and my tasks (Team board, Team tasks). The app loads the same lists from the
// Inbox plug-ins' hooks, and the pure plug-ins read them from the query cache. `bootData` changes when
// any of them arrives, so More, the + sheet and the tour redraw then (and not before: nothing is shown
// on a guess). `jobOpenings` is filled into `web()` once the job list is known, so
// `access.web('referrals')` is the website's test as is.

import { useSyncExternalStore } from 'react';

import { hiringKeys } from '@/api/hiring';
import { EMPTY_HR, useHrMe, useMyTenant } from '@/api/me';
import { queryClient } from '@/api/query';
import { tbKeys } from '@/api/teamboard';
import { useSession } from '@/auth/session';
import {
  approvalKinds,
  canSeeHr,
  hrIsAdmin,
  hrIsSystemRole,
  hrSections,
  tenantFeatureOn,
  webNav,
  type WebNavExtra,
  type WebNavId,
  webNavList,
} from '@/lib/access';

const bootKeys = (uid: string) => [hiringKeys.jobs(uid), hiringKeys.referrals(uid), hiringKeys.apps(uid), tbKeys.depts(uid), tbKeys.grants(uid), tbKeys.mine(uid)];
/** The query cache tells us about queries created while another component renders (a boot list built
 *  with its data in place). Passing that straight to React updates every useAccess() reader in the
 *  middle of someone else's render ("Cannot update a component while rendering a different
 *  component"), so the change is passed on a moment later, once per burst. */
const subscribeCache = (onChange: () => void) => {
  let queued = false;
  let live = true;
  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (live) onChange();
    });
  });
  return () => {
    live = false;
    unsubscribe();
  };
};
/** When each boot list last arrived ('' before sign-in): a cheap string, so React compares it by value. */
const bootStamp = (uid: string | undefined) => (uid ? bootKeys(uid).map((k) => queryClient.getQueryState(k)?.dataUpdatedAt ?? 0).join('|') : '');
/** JOB_OPENINGS.length once the job list is loaded, else undefined (navForRaw then hides Refer & earn). */
const jobOpeningsKnown = (uid: string | undefined) => {
  const jobs = uid ? queryClient.getQueryData<unknown[]>(hiringKeys.jobs(uid)) : undefined;
  return Array.isArray(jobs) ? jobs.length : undefined;
};

export function useAccess() {
  const user = useSession((s) => s.user);
  const bootData = useSyncExternalStore(
    subscribeCache,
    () => bootStamp(user?.id),
    () => '',
  );
  const jobOpenings = bootData ? jobOpeningsKnown(user?.id) : undefined;
  const hrQ = useHrMe();
  const tenantQ = useMyTenant();
  const hr = hrQ.data ?? EMPTY_HR;
  const tenant = tenantQ.data ?? null;
  return {
    user,
    hr,
    tenant,
    loading: hrQ.isLoading,
    hrVisible: canSeeHr(hr, user),
    sections: hrSections(hr, user),
    approvals: approvalKinds(hr, user),
    isHrAdmin: hrIsAdmin(hr, user),
    isSystemRole: hrIsSystemRole(user),
    feature: (id: string) => tenantFeatureOn(tenant, id),
    /** The website's sidebar test for this person (lib/access webNav), /hr/me included. */
    web: (id: WebNavId, extra?: WebNavExtra) => webNav(user, id, tenant, { hr, jobOpenings, ...extra }),
    /** JOB_OPENINGS.length once the job list has loaded (undefined before). */
    jobOpenings,
    /** Changes whenever a boot list arrives (see the header): the plug-ins that read the cache redraw. */
    bootData,
    /** The website's sidebar for this person, flat (lib/access webNavList), without the data-driven ids. */
    nav: webNavList(user, tenant, { hr }),
    refetch: () => Promise.all([hrQ.refetch(), tenantQ.refetch()]),
  };
}

/** What every plug-in receives (features/plugin-types.ts). */
export type Access = ReturnType<typeof useAccess>;
