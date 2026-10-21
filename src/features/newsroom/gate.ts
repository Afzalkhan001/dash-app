// Every newsroom screen re-checks its own gate (PLAN §2.1.6). `ready` waits for the signed-in person,
// /hr/me and the company record, so a deep link never bounces someone home on a cold start just because
// the company's switches or "Who can post news" list had not loaded yet.

import { useMyTenant } from '@/api/me';
import { canEditCelebrations, canSeeOfficeTvs, canUseNewsStudio } from '@/features/newsroom/access';
import { useAccess } from '@/lib/use-access';

export function useNewsroomAccess() {
  const access = useAccess();
  const tenantQ = useMyTenant();
  const user = access.user;
  const tenant = access.tenant;
  const tenantSettled = !user?.tenantId || !tenantQ.isPending;
  return {
    user,
    tenant,
    ready: !!user && !access.loading && tenantSettled,
    studio: canUseNewsStudio(user, tenant),
    celebrations: canEditCelebrations(user),
    tvs: canSeeOfficeTvs(user, tenant),
  };
}
