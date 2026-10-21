// The platform screens re-check their own gate (PLAN §2.1.6). The platform owner belongs to no company,
// so nothing here waits for a company record: `ready` is just "the signed-in person is known".

import { useAllTenants } from '@/api/me';
import { useSession } from '@/auth/session';

export function usePlatformGate() {
  const user = useSession((s) => s.user);
  const tenantsQ = useAllTenants();
  return { user, ready: !!user, tenantsQ, tenants: tenantsQ.data ?? [] };
}

/** Whole coins, Indian grouping ("1,20,000"). */
export const coins = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-IN') : '0');
