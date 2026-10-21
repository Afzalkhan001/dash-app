// Every work screen re-checks its own gate (docs/port/PLAN.md §2.1.6): while HR access and the company
// switches load it shows a skeleton, and without the gate it goes Home — the server would let any
// signed-in person through, so the app's gate is the only one.

import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useGateReady } from '@/features/work/use-team';
import type { Access } from '@/lib/use-access';
import { radius } from '@/theme/tokens';
import { NavHeader, Screen, Skeleton, SkeletonList } from '@/ui';

export function WorkGate({ title, allow, children }: { title: string; allow: (a: Access) => boolean; children: ReactNode }) {
  const { access, ready } = useGateReady();
  if (!ready) {
    return (
      <Screen header={<NavHeader title={title} />}>
        <Skeleton height={168} radius={radius.xxl} />
        <SkeletonList rows={4} avatar />
      </Screen>
    );
  }
  if (!access.user || !allow(access)) return <Redirect href="/" />;
  return <>{children}</>;
}
