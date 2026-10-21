// Every Bounty admin screen re-checks its own gate (PLAN §2.1.6) and sends the person home without it.
// `ready` waits for the signed-in person, /hr/me and the company record, so a deep link on a cold
// start never bounces someone just because the company's switches had not loaded yet.

import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useMyTenant } from '@/api/me';
import { useAccess } from '@/lib/use-access';
import { radius } from '@/theme/tokens';
import { NavHeader, Screen, Skeleton } from '@/ui';

import { bountyAdminGates } from './access';

export function useBountyAdmin() {
  const access = useAccess();
  const tenantQ = useMyTenant();
  const user = access.user;
  const tenant = access.tenant;
  const ready = !!user && !access.loading && (!user.tenantId || !tenantQ.isPending);
  return { access, user, tenant, ready, gates: bountyAdminGates(user, tenant) };
}

/** Renders `children` once the gate is known: a skeleton while loading, home without `allow`. */
export function AdminGate({ allow, ready, title, children }: { allow: boolean; ready: boolean; title: string; children: ReactNode }) {
  if (!ready) {
    return (
      <Screen header={<NavHeader title={title} />}>
        <Skeleton height={168} radius={radius.xxl} />
        <Skeleton height={220} radius={radius.xl} />
      </Screen>
    );
  }
  if (!allow) return <Redirect href="/" />;
  return <>{children}</>;
}
