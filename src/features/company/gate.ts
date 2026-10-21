// The company screens re-check their own gate (PLAN §2.1.6). `ready` waits for the signed-in person,
// /hr/me and the company record, so a deep link never bounces someone home on a cold start just
// because the company's switches had not loaded yet.

import { useMyTenant } from '@/api/me';
import { useAccess } from '@/lib/use-access';

export function useCompanyAccess() {
  const access = useAccess();
  const tenantQ = useMyTenant();
  const user = access.user;
  const tenantSettled = !user?.tenantId || !tenantQ.isPending;
  return { access, user, tenant: access.tenant, ready: !!user && !access.loading && tenantSettled };
}
