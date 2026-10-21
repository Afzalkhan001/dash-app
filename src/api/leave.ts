// Leave, work from home and comp-off (hr_leave.js). Shapes are the handlers' own: publicType ~L119,
// computeBalances ~L192, publicReq ~L294, POST /requests ~L304 (body + validation), cancel ~L412.
// Module gates on the server: types, settings and balances need the 'leave' module; requests/mine
// needs any of leave/wfh/comp_off; POST /requests checks the module of the request's kind.
// The weekly-off/holiday reads at the bottom only feed the apply form's day estimate.

import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { LeaveBalance } from '@/api/hr';
import { useSession } from '@/auth/session';

export type LeaveKind = 'leave' | 'wfh' | 'comp_off';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type HalfDay = 'none' | 'first' | 'second';

export type LeaveType = {
  id: string;
  code: string;
  name: string;
  paid: boolean; // false = loss of pay, never limited by balance
  annual_quota: number;
  accrual: 'annual' | 'monthly';
  carry_forward_max: number;
  allow_half_day: boolean;
  is_comp_off: boolean;
};

// One row of /hr/leave/balances/mine: hr.ts's LeaveBalance plus the fields it leaves out.
export type LeaveBalanceRow = LeaveBalance & {
  accrual?: 'annual' | 'monthly';
  carry_forward_max?: number;
  year?: number;
  expiring?: string | null; // comp-off only: the earliest unexpired credit's expiry date
};
export type LeaveBalances = { year: number; period?: { from: string; to: string }; balances: LeaveBalanceRow[] };

export type LeaveRequest = {
  id: string;
  kind: LeaveKind;
  employee_id: string;
  employee_name?: string;
  department_id?: string | null;
  leave_type_id: string | null;
  leave_code: string | null;
  from_date: string; // YYYY-MM-DD; for comp-off, the day worked
  to_date: string;
  half_day: HalfDay;
  days: number; // counted by the server
  reason: string;
  status: LeaveStatus;
  created_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string;
};

export type LeaveSettings = {
  leaveYearStartMonth: number;
  compOffExpiryDays: number;
  compOffClaimWindowDays: number;
  backdateDays: number;
  maxSpanDays: number;
};

// Exactly the bodies LeaveRequestForm (dash.html:4849) sends.
export type NewLeaveRequest =
  | { kind: 'comp_off'; worked_date: string; reason: string }
  | { kind: 'leave' | 'wfh'; leave_type_id?: string; from_date: string; to_date: string; half_day: HalfDay; reason: string };

export function useLeaveTypes(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['leave-types', userId],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => unwrap(api.get<{ types: LeaveType[] }>('/hr/leave/types', signal)),
    staleTime: 10 * 60_000,
  });
}

export function useLeaveSettings(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['leave-settings', userId],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => unwrap(api.get<{ settings: LeaveSettings }>('/hr/leave/settings', signal)),
    staleTime: 30 * 60_000,
  });
}

export function useMyLeaveRequests(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['leave-requests', userId],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => unwrap(api.get<{ requests: LeaveRequest[] }>('/hr/leave/requests/mine', signal)),
  });
}

// Balances for a specific leave year (a request dated in next year's leave year is checked against
// that year). Shares the ['leave-balances'] prefix, so invalidating it refreshes these too.
export function useLeaveBalancesForYear(year: number | null, enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['leave-balances', userId, year],
    enabled: enabled && !!userId && year != null,
    queryFn: ({ signal }) => unwrap(api.get<LeaveBalances>(`/hr/leave/balances/mine?year=${year}`, signal)),
    staleTime: 5 * 60_000,
  });
}

export const createLeaveRequest = (body: NewLeaveRequest) => api.post<{ ok: true; request: LeaveRequest }>('/hr/leave/requests', body);

export const cancelLeaveRequest = (id: string) => api.post<{ ok: true; request: LeaveRequest }>(`/hr/leave/requests/${id}/cancel`, {});

// ── Inputs for the day estimate (the server counts: calendar days − weekly offs − mandatory holidays) ──
// Weekly offs come from the assigned shift (hr_time.js /shifts/mine, 'shifts' module) or else the
// company attendance policy (hr.js /attendance/settings, 'attendance' module).
export type MyShift = { id: string; name: string; start_time: string; end_time: string; grace_minutes: number; weekly_off: number[] };

export function useMyShift(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['leave-shift', userId],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => unwrap(api.get<{ shift: MyShift | null }>('/hr/shifts/mine', signal)),
    staleTime: 30 * 60_000,
  });
}

export function useCompanyWeeklyOff(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['leave-weekly-off', userId],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => unwrap(api.get<{ settings: { weeklyOff?: number[] } }>('/hr/attendance/settings', signal)),
    select: (r) => (Array.isArray(r.settings?.weeklyOff) ? r.settings.weeklyOff : null),
    staleTime: 30 * 60_000,
  });
}
