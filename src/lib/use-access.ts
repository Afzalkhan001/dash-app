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

import { EMPTY_HR, useHrMe, useMyTenant } from '@/api/me';
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

export function useAccess() {
  const user = useSession((s) => s.user);
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
    web: (id: WebNavId, extra?: WebNavExtra) => webNav(user, id, tenant, { hr, ...extra }),
    /** The website's sidebar for this person, flat (lib/access webNavList), without the data-driven ids. */
    nav: webNavList(user, tenant, { hr }),
    refetch: () => Promise.all([hrQ.refetch(), tenantQ.refetch()]),
  };
}

/** What every plug-in receives (features/plugin-types.ts). */
export type Access = ReturnType<typeof useAccess>;
