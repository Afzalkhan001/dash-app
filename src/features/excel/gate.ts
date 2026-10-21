// Excel domain — every screen re-checks its own gate (PLAN §2.1.6). `ready` waits for the signed-in
// person, /hr/me and the company record, so a deep link never bounces someone home on a cold start
// just because the company's switches had not loaded yet.

import { useHrMe, useMyTenant } from '@/api/me';
import { excelGates } from '@/features/excel/access';
import { useAccess } from '@/lib/use-access';

export function useExcelAccess() {
  const access = useAccess();
  const hrQ = useHrMe();
  const tenantQ = useMyTenant();
  const user = access.user;
  const tenantSettled = !user?.tenantId || !tenantQ.isPending;
  const gates = excelGates(access);
  // hrQ.isPending (not access.loading = isLoading): a paused or not-yet-started /hr/me is pending too.
  return { access, user, gates, ready: !!user && !hrQ.isPending && tenantSettled };
}
