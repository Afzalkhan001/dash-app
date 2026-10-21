// Attendance endpoints beyond the shared ones in src/api/hr.ts (today/month/holidays/clock-in/out).
// Shapes are taken from the handlers so the app reads exactly what the server sends:
//   hr.js             shapeRow + withPings (~L889/L405), pingState (~L415), GET /attendance/team (~L962),
//                     GET /attendance/settings (~L608), POST /attendance/ping (~L867)
//   hr_time.js        GET /shifts/mine, GET /shifts, regularizations (/mine, POST, /:id/cancel)
//   hr_timesheet.js   GET /timesheet/today, POST /timesheet, GET+POST /timesheet/week, GET /timesheet/mine
//   hr_leave.js       GET /leave/requests/mine (approved leave/WFH days are not absences, as in payroll)
//   routes/projects.js GET /projects (Keka Codes for the timesheet picker)
//   routes/tasks.js PUT /tasks/:id and team_roster.js PUT /team-roster/tasks/:id (stop a running timer)
// Query keys all start with 'att-' so the attendance screens can refresh them together.

import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { AttendanceRecord, AttendanceToday } from '@/api/hr';
import { useSession } from '@/auth/session';

// ── Types ────────────────────────────────────────────────────────────────────
export type Ping = { slot: number; at: string; lat: number; lng: number; accuracy_m: number | null };

// A record from /attendance/mine or /attendance/team: shapeRow() plus the hourly pings.
export type AttendanceRow = AttendanceRecord & {
  employee_id?: string;
  employee_name?: string;
  department_id?: string | null;
  in_lat?: number | null;
  in_lng?: number | null;
  out_lat?: number | null;
  out_lng?: number | null;
  out_within_fence?: boolean | null;
  out_distance_m?: number | null;
  in_remote?: boolean;
  pings?: Ping[];
};

export type PingState = { active: boolean; nextDueAt: string | null; windowEndsAt: string | null; lastSlot: number; recorded?: number };

export type OfficeLocation = { id: string; name: string; lat: number; lng: number; radius_m: number; address?: string };

// GET /hr/attendance/today as the server actually sends it (hr.ts types the common subset).
export type TodayFull = Omit<AttendanceToday, 'record' | 'ping' | 'locations'> & {
  record: AttendanceRow | null;
  ping?: PingState;
  locations: OfficeLocation[];
};

// Company attendance policy (hr.js DEFAULT_ATTENDANCE_SETTINGS). An assigned shift overrides the times
// and weekly offs; /shifts/mine says which.
export type AttendanceSettings = {
  requireGeofence: boolean;
  allowRemote: boolean;
  maxAccuracyM: number;
  shiftStart: string;
  shiftEnd: string;
  graceMinutes: number;
  halfDayMinutes: number;
  fullDayMinutes: number;
  weeklyOff: number[]; // 0 = Sunday … 6 = Saturday
  regularizationWindowDays: number;
};

export type MyShift = { id: string; name: string; start_time: string; end_time: string; grace_minutes: number; weekly_off: number[] };
export type Shift = MyShift & { half_day_minutes: number; full_day_minutes: number };

export type RegStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type Regularization = {
  id: string;
  work_date: string;
  in_time: string | null;
  out_time: string | null;
  reason: string;
  status: RegStatus;
  created_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string;
};

export type TimesheetEntry = {
  source: 'task' | 'manual';
  taskId: string | null;
  taskSource?: string;
  taskTitle: string | null;
  projectId: string | null;
  kekaCode: string;
  projectName: string;
  startTime: string; // HH:MM, IST wall clock
  endTime: string;
  minutes?: number;
  comment: string;
};

export type RunningTask = {
  id: string;
  taskSource: 'tasks' | 'team_roster';
  title: string;
  elapsedSeconds: number;
  startedAt: string;
  startedTime: string;
  runningMinutes: number;
};

export type WeekStatus = { weekStart: string; weekEnd: string; worked: string[]; missing: string[]; complete: boolean };
export type Cadence = 'daily' | 'weekly';

export type TimesheetDay = {
  cadence: Cadence;
  lastWeek: WeekStatus | null;
  workDate: string;
  runningTasks: RunningTask[];
  clockedIn: boolean;
  inAt: string | null;
  inTime: string | null;
  loggedMinutes: number;
  submitted: boolean;
  submittedAt: string | null;
  bufferMinutes: number;
  entries: TimesheetEntry[];
};

export type TimesheetWeekDay = {
  date: string;
  attendanceMinutes: number;
  worked: boolean;
  finished: boolean;
  submitted: boolean;
  filledMinutes: number;
  bufferMinutes: number;
  entries: TimesheetEntry[];
};
export type TimesheetWeek = { weekStart: string; weekEnd: string; today: string; cadence: Cadence; days: TimesheetWeekDay[] };

export type Project = { id: string; name?: string; kekaCode?: string; status?: string };

export type LeaveRequestLite = {
  id: string;
  kind: 'leave' | 'wfh' | 'comp_off';
  leave_code: string | null;
  from_date: string;
  to_date: string;
  half_day: string;
  status: string;
};

// ── Queries ──────────────────────────────────────────────────────────────────
const useUid = () => useSession((s) => s.user?.id);

export function useAttendanceSettings(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: ['att-settings', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ settings: AttendanceSettings }>('/hr/attendance/settings', signal))).settings,
    staleTime: 10 * 60_000,
  });
}

export function useMyShift(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: ['att-shift-mine', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ shift: MyShift | null }>('/hr/shifts/mine', signal))).shift ?? null,
    staleTime: 10 * 60_000,
  });
}

export function useAllShifts(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: ['att-shifts', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ shifts: Shift[] }>('/hr/shifts', signal))).shifts ?? [],
    staleTime: 10 * 60_000,
  });
}

export function useTeamAttendance(date: string, enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: ['att-team', userId, date],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) =>
      (await unwrap(api.get<{ date: string; records: AttendanceRow[] }>(`/hr/attendance/team?date=${encodeURIComponent(date)}`, signal))).records ?? [],
  });
}

export function useMyRegularizations(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: ['att-regs', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ requests: Regularization[] }>('/hr/regularizations/mine', signal))).requests ?? [],
  });
}

// What the clock-out / entry sheet shows for one day. Never cached for long: it carries the live
// clocked-in minutes and running timers.
export function useTimesheetDay(date: string | null, enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: ['att-ts-day', userId, date ?? 'today'],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) =>
      unwrap(api.get<TimesheetDay>(`/hr/timesheet/today${date ? `?date=${encodeURIComponent(date)}` : ''}`, signal)),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

// `start` is always a Monday (the server would round to one anyway), which keeps cache keys stable.
export function useTimesheetWeek(start: string, enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: ['att-ts-week', userId, start],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => unwrap(api.get<TimesheetWeek>(`/hr/timesheet/week?start=${encodeURIComponent(start)}`, signal)),
  });
}

// For someone on a weekly timesheet: this week's and last week's status (what blocks Monday's clock-in).
export function useTimesheetOwed(from: string, to: string, enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: ['att-ts-owed', userId, from, to],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) =>
      unwrap(api.get<{ cadence: Cadence; weeks: WeekStatus[] }>(`/hr/timesheet/mine?from=${from}&to=${to}`, signal)),
  });
}

// Keka Codes / projects for the timesheet picker. Deactivated codes are dropped here, once, like the
// web's ProjectSearch does.
export function useProjects(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: ['att-projects', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const list = await unwrap(api.get<Project[]>('/projects', signal));
      return (Array.isArray(list) ? list : []).filter((p) => String(p.status || 'active').toLowerCase() !== 'inactive');
    },
    staleTime: 10 * 60_000,
  });
}

export function useMyLeaveRequests(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: ['att-leave-mine', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ requests: LeaveRequestLite[] }>('/hr/leave/requests/mine', signal))).requests ?? [],
    staleTime: 5 * 60_000,
  });
}

// ── Writes (never throw; callers check isApiError) ───────────────────────────
export const createRegularization = (body: { work_date: string; in_time: string | null; out_time: string | null; reason: string }) =>
  api.post<{ ok: true; request: Regularization }>('/hr/regularizations', body);

export const cancelRegularization = (id: string) => api.post<{ ok: true; request: Regularization }>(`/hr/regularizations/${id}/cancel`, {});

export const submitTimesheet = (workDate: string, entries: Omit<TimesheetEntry, 'minutes' | 'taskSource'>[]) =>
  api.post<{ ok: true; id: string; bufferMinutes: number }>('/hr/timesheet', { workDate, entries });

export const submitTimesheetWeek = (weekStart: string) =>
  api.post<{ ok: true; closed: number; bufferMinutes: number; days?: string[] }>('/hr/timesheet/week', { weekStart });

export const sendPing = (fix: { lat: number; lng: number; accuracy: number }) =>
  api.post<{ ok: true; ping?: Ping; duplicate?: boolean }>('/hr/attendance/ping', fix);

// Pause or end a running task timer before clocking out — the same two routes the web's
// ClockOutTimesheetModal.settle() uses. Sending a pause to the wrong system silently does nothing.
export function stopTask(t: RunningTask, end: boolean, user: { id: string; name?: string }) {
  const live = (t.elapsedSeconds || 0) + Math.max(0, Math.floor((Date.now() - new Date(t.startedAt).getTime()) / 1000));
  const nowIso = new Date().toISOString();
  if (t.taskSource === 'tasks') {
    // Ending the older kind is a completion stamp, checked against the assignee in their own name.
    const payload: Record<string, unknown> = { startedAt: null, elapsedSeconds: live, lastEndedAt: nowIso };
    if (end) Object.assign(payload, { status: 'completed', completedBy: user.name || '', completedAt: nowIso, actorId: user.id });
    return api.put(`/tasks/${t.id}`, payload);
  }
  const payload: Record<string, unknown> = { elapsedSeconds: live, startedAt: null };
  if (end) payload.status = 'done';
  return api.put(`/team-roster/tasks/${t.id}`, payload);
}
