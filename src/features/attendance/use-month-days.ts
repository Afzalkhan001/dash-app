// One month of "my attendance" as calendar days. Days with a record get its state; the rest are read
// the way the server's own payroll reads them (hr_payroll.js absenceDays): a past working day with no
// record is an absence — unless it is a weekly off (the assigned shift's, else the company's), a
// company holiday, or covered by approved leave/WFH. Nothing is marked absent until those inputs have
// loaded, so the calendar never flashes red over a holiday.

import { type Holiday, useAttendanceMonth, useHolidays } from '@/api/hr';
import { type AttendanceRow, type LeaveRequestLite, useAttendanceSettings, useMyLeaveRequests, useMyShift } from '@/api/attendance';
import { useSession } from '@/auth/session';
import { daysInMonth, eachDate, weekdayOf, ymdPrefix } from '@/features/attendance/format';
import { useTodayIst } from '@/features/attendance/use-now';
import { useAccess } from '@/lib/use-access';
import { moduleTone, palette } from '@/theme/tokens';

export type DayKind = 'present' | 'late' | 'half' | 'remote' | 'working' | 'incomplete' | 'absent' | 'leave' | 'holiday' | 'weekoff' | 'none';
export type DayInfo = { date: string; kind: DayKind; record?: AttendanceRow; holiday?: Holiday; leave?: LeaveRequestLite };

// A label and colour per kind: the calendar's screen-reader labels use the label (the calendar folds
// the kinds into six tinted looks, see month-calendar.tsx; the day sheet spells the day out in a note).
// The colours are getters, so they are read from the live tokens (light or dark) each time.
type KindMeta = { label: string; readonly color: string; ring?: boolean };
export const KIND_META: Record<Exclude<DayKind, 'none'>, KindMeta> = {
  present: { label: 'Present', get color() { return moduleTone.attendance.fg; } },
  late: { label: 'Late', get color() { return palette.warning; } },
  half: { label: 'Half day or short', get color() { return palette.warning; }, ring: true },
  remote: { label: 'Remote', get color() { return moduleTone.attendance.fg; } },
  working: { label: 'Working', get color() { return moduleTone.attendance.fg; }, ring: true },
  incomplete: { label: 'No clock-out', get color() { return palette.danger; }, ring: true },
  absent: { label: 'Absent', get color() { return palette.danger; } },
  leave: { label: 'Leave or work from home', get color() { return moduleTone.leave.fg; }, ring: true },
  holiday: { label: 'Holiday', get color() { return moduleTone.holidays.fg; } },
  weekoff: { label: 'Weekly off', get color() { return palette.textFaint; } },
};

// Crash guard: an API field that should be an array but is missing or malformed reads as empty.
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]).filter((x) => x != null) : []);

// A record's one-dot summary: problems first, then lateness, then where.
export function recordKind(r: AttendanceRow): DayKind {
  if (r.state === 'incomplete') return 'incomplete';
  if (r.state === 'in_progress') return 'working';
  if (r.state === 'half_day' || r.state === 'short') return 'half';
  if (r.late) return 'late';
  if (r.in_mode === 'remote') return 'remote';
  return 'present';
}

export function useMonthDays(month: string) {
  const access = useAccess();
  const user = useSession((s) => s.user);
  const on = access.sections.clock;
  const today = useTodayIst();

  const monthQ = useAttendanceMonth(month, on);
  const settingsQ = useAttendanceSettings(on);
  const shiftOn = on && access.sections.shifts;
  const shiftQ = useMyShift(shiftOn);
  const holOn = on && access.sections.holidays;
  const holQ = useHolidays(month.slice(0, 4), holOn);
  const leaveOn = on && access.hr.enabled && (access.hr.modules.includes('leave') || access.hr.modules.includes('wfh'));
  const leaveQ = useMyLeaveRequests(leaveOn);

  const settled = (q: { isPending: boolean; isError: boolean }, enabled: boolean) => !enabled || !q.isPending || q.isError;
  const offReady = settled(settingsQ, on) && settled(shiftQ, shiftOn) && settled(holQ, holOn) && settled(leaveQ, leaveOn);

  // An assigned shift's weekly offs replace the company's (hr.js getEffectiveSettings).
  const weeklyOff = Array.isArray(shiftQ.data?.weekly_off)
    ? shiftQ.data.weekly_off
    : Array.isArray(settingsQ.data?.weeklyOff)
      ? settingsQ.data.weeklyOff
      : [0];
  const holidays = new Map(arr<Holiday>(holQ.data?.holidays).map((h) => [h.date, h]));
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  const leaveBy = new Map<string, LeaveRequestLite>();
  for (const l of arr<LeaveRequestLite>(leaveQ.data)) {
    if (typeof l.from_date !== 'string' || typeof l.to_date !== 'string') continue;
    if (l.status !== 'approved' || (l.kind !== 'leave' && l.kind !== 'wfh')) continue;
    const a = l.from_date < first ? first : l.from_date;
    const b = l.to_date > last ? last : l.to_date;
    if (a > b) continue;
    for (const d of eachDate(a, b)) if (!leaveBy.has(d)) leaveBy.set(d, l);
  }
  const records = arr<AttendanceRow>(monthQ.data?.records);
  const byDate = new Map(records.map((r) => [r.work_date, r]));
  const joined = ymdPrefix(user?.dateJoined);

  const days: DayInfo[] = eachDate(first, last).map((date) => {
    const record = byDate.get(date);
    if (record) return { date, kind: recordKind(record), record, holiday: holidays.get(date), leave: leaveBy.get(date) };
    const holiday = holidays.get(date);
    if (holiday) return { date, kind: 'holiday', holiday };
    if (weeklyOff.includes(weekdayOf(date))) return { date, kind: 'weekoff' };
    const leave = leaveBy.get(date);
    if (leave) return { date, kind: 'leave', leave };
    if (date < today && offReady && (!joined || date >= joined)) return { date, kind: 'absent' };
    return { date, kind: 'none' };
  });

  // Working days so far — what "days present" is out of.
  const workingSoFar = days.filter((d) => d.date <= today && (!joined || d.date >= joined) && d.kind !== 'holiday' && d.kind !== 'weekoff').length;

  // A full day's minutes (company policy): the scale of the week's bars, so a normal day fills its bar.
  const fullDay = settingsQ.data?.fullDayMinutes;

  return {
    days,
    records,
    weeklyOff,
    workingSoFar,
    // Whether approved leave / work from home is read at all (the leave module is on for this person).
    leaveTracked: leaveOn,
    fullDayMinutes: typeof fullDay === 'number' && Number.isFinite(fullDay) && fullDay > 0 ? fullDay : 480,
    regWindowDays: settingsQ.data?.regularizationWindowDays ?? 30,
    isLoading: monthQ.isLoading,
    error: monthQ.error as Error | null,
    refetch: () => monthQ.refetch(),
  };
}
