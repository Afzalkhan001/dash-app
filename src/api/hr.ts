// HR self-service endpoints used by Home and the attendance/leave screens. Shapes are taken from
// the handlers (hr.js shapeRow ~L889, /attendance/today ~L909, hr_leave.js computeBalances ~L194,
// hr_time.js publicHoliday ~L30).

import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

export type AttendanceRecord = {
  id: string;
  work_date: string; // YYYY-MM-DD (IST)
  state?: string;
  in_at: string;
  in_mode: 'office' | 'remote' | 'outside' | string;
  in_within_fence?: boolean;
  in_distance_m?: number | null;
  in_address?: string;
  out_at: string | null;
  out_mode?: string | null;
  out_address?: string;
  worked_minutes: number | null;
  status: string | null;
  late: boolean;
  early_out: boolean;
  regularized: boolean;
};

export type AttendanceToday = {
  serverTime: string;
  today: string;
  rule: { mode: string; remoteOnly: boolean };
  settings: {
    requireGeofence: boolean;
    allowRemote: boolean;
    wfhToday: boolean;
    maxAccuracyM: number;
    shiftStart?: string;
    shiftEnd?: string;
    graceMinutes?: number;
    shiftName?: string | null;
  };
  locations: { id: string; name: string; lat?: number; lng?: number; radius_m?: number }[];
  record: AttendanceRecord | null;
  ping?: unknown;
};

export type LeaveBalance = {
  id: string;
  code: string;
  name: string;
  paid: boolean;
  annual_quota: number;
  allow_half_day: boolean;
  is_comp_off: boolean;
  entitlement: number;
  adjusted: number;
  used: number;
  pending: number;
  available: number;
};

export type Holiday = { id: string; date: string; name: string; optional: boolean };

const uid = () => useSession.getState().user?.id;

export function useAttendanceToday(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['att-today', userId],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => unwrap(api.get<AttendanceToday & { ok: true }>('/hr/attendance/today', signal)),
    refetchInterval: 60_000,
  });
}

export function useAttendanceMonth(month: string, enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['att-month', userId, month],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) =>
      unwrap(api.get<{ month: string; records: AttendanceRecord[] }>(`/hr/attendance/mine?month=${month}`, signal)),
  });
}

export function useLeaveBalances(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['leave-balances', userId],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => unwrap(api.get<{ year: number; balances: LeaveBalance[] }>('/hr/leave/balances/mine', signal)),
    staleTime: 5 * 60_000,
  });
}

export function useHolidays(year: string, enabled = true) {
  return useQuery({
    queryKey: ['holidays', uid(), year],
    enabled,
    queryFn: ({ signal }) => unwrap(api.get<{ year: string; holidays: Holiday[] }>(`/hr/holidays?year=${year}`, signal)),
    staleTime: 60 * 60_000,
  });
}

export type ClockFix = { lat: number; lng: number; accuracy: number; mode: 'office' | 'remote' };
export const clockIn = (fix: ClockFix) => api.post<{ ok: true; record: AttendanceRecord }>('/hr/attendance/clock-in', fix);
export const clockOut = (fix: ClockFix) => api.post<{ ok: true; record: AttendanceRecord }>('/hr/attendance/clock-out', fix);
