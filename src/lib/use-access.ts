// One hook for "what can the signed-in person see": their user record, HR access (/hr/me), the
// company's feature switches, and the derived HR sections / approval queues. Screens use this
// instead of calling the access helpers by hand.

import { EMPTY_HR, useHrMe, useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { approvalKinds, canSeeHr, hrIsAdmin, hrIsSystemRole, hrSections, tenantFeatureOn } from '@/lib/access';

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
    refetch: () => Promise.all([hrQ.refetch(), tenantQ.refetch()]),
  };
}
