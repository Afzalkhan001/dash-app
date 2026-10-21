// Every insights screen re-checks its own gate (docs/port/PLAN.md §2.1.6): while HR access and the
// company's switches load it shows a skeleton, and without the gate it goes Home. The TM360 server
// re-checks too; Reports reads lists every signed-in person can read, so the app's gate is the only one.

import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useMyTenant } from '@/api/me';
import { useAccess, type Access } from '@/lib/use-access';
import { radius } from '@/theme/tokens';
import { NavHeader, Screen, Skeleton, SkeletonList } from '@/ui';

export function useInsightsAccess() {
  const access = useAccess();
  const tenantQ = useMyTenant();
  const waiting = access.loading || (!!access.user?.tenantId && tenantQ.isPending);
  return { access, ready: !waiting };
}

export function InsightsGate({ title, allow, children }: { title: string; allow: (a: Access) => boolean; children: ReactNode }) {
  const { access, ready } = useInsightsAccess();
  if (!ready) {
    return (
      <Screen header={<NavHeader title={title} />}>
        <Skeleton height={140} radius={radius.xxl} />
        <SkeletonList rows={5} avatar />
      </Screen>
    );
  }
  if (!access.user || !allow(access)) return <Redirect href="/" />;
  return <>{children}</>;
}
