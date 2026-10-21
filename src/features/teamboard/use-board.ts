// The data every Team board screen starts from: my departments (admin first, then granted), which
// one is picked, and its members for the pickers.

import { useSyncExternalStore } from 'react';

import { useMyGrantDeptIds, useMyTrTasks, useTbDepts } from '@/api/teamboard';
import { boardDepts, canSeeTeamBoard, canSeeTeamTasks, rosterReachable } from '@/features/teamboard/access';
import { inDept } from '@/features/teamboard/model';
import { useGateReady } from '@/features/work/use-team';
import { type PickPerson, usePickablePeople } from '@/features/shared/person-picker';

/** The board's gate: the website's sidebar test with the boot-time data loaded. */
export function useBoardGate() {
  const { access, ready } = useGateReady();
  const on = rosterReachable(access.user);
  const deptsQ = useTbDepts(on);
  const grantsQ = useMyGrantDeptIds(on && !!access.tenant?.teamRosterEnabled);
  // Without the company switch the grants never matter (canSeeTeamRosterNav returns early).
  const grants = access.tenant?.teamRosterEnabled ? grantsQ.data : [];
  const loading = !ready || (on && (deptsQ.isPending || (!!access.tenant?.teamRosterEnabled && grantsQ.isPending)));
  const failed = (deptsQ.isError && !deptsQ.data) || (grantsQ.isError && !grantsQ.data);
  const allowed = on && canSeeTeamBoard(access, deptsQ.data, grants);
  return {
    access,
    loading: loading && !failed,
    failed,
    error: deptsQ.error ?? grantsQ.error,
    allowed,
    depts: boardDepts(access.user?.id, deptsQ.data, grants),
    refetch: () => Promise.all([deptsQ.refetch(), grantsQ.refetch()]),
  };
}

/** The assignee's gate (My tasks' "Team tasks" segment). */
export function useTeamTasksGate() {
  const { access, ready } = useGateReady();
  const on = rosterReachable(access.user);
  const mineQ = useMyTrTasks(on);
  return {
    access,
    query: mineQ,
    ready: ready && !mineQ.isPending,
    allowed: on && canSeeTeamTasks(access, mineQ.data),
  };
}

// ── The picked department, shared by the hub and the screens it opens ────────
let picked: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const read = () => picked;
export function pickDept(id: string) {
  if (picked === id) return;
  picked = id;
  listeners.forEach((fn) => fn());
}

/** The department in use: the one asked for (route param), else the last picked, else the first. */
export function useBoardDept(list: ReturnType<typeof boardDepts>, wanted?: string | null) {
  const last = useSyncExternalStore(subscribe, read, read);
  return list.find((d) => d.id === wanted) ?? list.find((d) => d.id === last) ?? list[0] ?? null;
}

/** The department's people (deptEmployeesFor 13594): `dept` equal to its id or, case-insensitive, its name. */
export function useDeptMembers(dept: { id: string; name: string } | null) {
  const q = usePickablePeople({ enabled: !!dept, keep: ['dept'] });
  const all: PickPerson[] = Array.isArray(q.data) ? q.data : [];
  const members = dept ? all.filter((p) => inDept(p.extra?.dept, dept)) : [];
  return {
    members,
    all,
    loading: q.isPending,
    error: q.isError && !q.data ? q.error : null,
  };
}
