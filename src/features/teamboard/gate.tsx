// Every Team board screen re-checks the website's own gate (canSeeTeamRosterNav, PLAN §2.1.6): while
// it loads a skeleton shows, without it the screen goes Home. The server re-checks every route too
// (canManageTeamRoster), and its refusal is shown in its own words.

import { Redirect, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import type { BoardDept } from '@/features/teamboard/access';
import { useBoardDept, useBoardGate } from '@/features/teamboard/use-board';
import type { Access } from '@/lib/use-access';
import { radius } from '@/theme/tokens';
import { ErrorState, NavHeader, Screen, Skeleton, SkeletonList } from '@/ui';

export type Board = { access: Access; depts: BoardDept[]; dept: BoardDept };

export function BoardGate({ title, children }: { title: string; children: (b: Board) => ReactNode }) {
  const params = useLocalSearchParams<{ dept?: string }>();
  const gate = useBoardGate();
  const dept = useBoardDept(gate.depts, typeof params.dept === 'string' ? params.dept : null);
  if (gate.loading) {
    return (
      <Screen header={<NavHeader title={title} />}>
        <Skeleton height={120} radius={radius.xxl} />
        <SkeletonList rows={4} />
      </Screen>
    );
  }
  if (gate.failed) {
    return (
      <Screen header={<NavHeader title={title} />}>
        <ErrorState message={gate.error?.message ?? ''} onRetry={() => void gate.refetch()} />
      </Screen>
    );
  }
  if (!gate.access.user || !gate.allowed || !dept) return <Redirect href="/" />;
  return <>{children({ access: gate.access, depts: gate.depts, dept })}</>;
}
