// Reads the grids need that no other module has. Every route already exists; nothing here writes.
//
// The attendance month sheet has no month route for a team: the website's Team view is one day at a
// time (GET /hr/attendance/team?date=, hr.js:962). The sheet asks for each day of the month up to
// today, under the same query key as the day screen (api/attendance useTeamAttendance: ['att-team',
// user, date]), so a day already opened elsewhere is not fetched again. The server scopes each answer
// (HR admins: the company; a department admin: their departments).

import { useQueries } from '@tanstack/react-query';

import type { AttendanceRow } from '@/api/attendance';
import { api, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

export function useMonthTeamAttendance(dates: string[], enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQueries({
    queries: dates.map((date) => ({
      queryKey: ['att-team', userId, date],
      enabled: enabled && !!userId,
      staleTime: 5 * 60_000,
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        (await unwrap(api.get<{ date: string; records: AttendanceRow[] }>(`/hr/attendance/team?date=${encodeURIComponent(date)}`, signal))).records ?? [],
    })),
    combine: (results) => ({
      byDate: Object.fromEntries(dates.map((d, i) => [d, Array.isArray(results[i]?.data) ? (results[i]!.data as AttendanceRow[]) : null])) as Record<string, AttendanceRow[] | null>,
      loaded: results.filter((r) => r.data !== undefined).length,
      pending: results.some((r) => r.isPending && r.fetchStatus !== 'idle'),
      error: (results.find((r) => r.error)?.error as Error | undefined) ?? null,
      refetch: () => Promise.all(results.map((r) => r.refetch())),
    }),
  });
}
