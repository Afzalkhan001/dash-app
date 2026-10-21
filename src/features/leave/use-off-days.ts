// Weekly offs and mandatory holidays for the apply form's live day count. The server counts with the
// employee's assigned shift's weekly offs, else the company attendance policy, minus non-optional
// holidays (hr.js getEffectiveSettings, hr_common.js holidaySet). The app reads whichever of those this
// person's modules allow; `exact` is false when one is missing, and the form then says "approximately".

import { useHolidays } from '@/api/hr';
import { useCompanyWeeklyOff, useMyShift } from '@/api/leave';
import { useTodayIst } from '@/features/attendance/use-now';
import { hrHas } from '@/lib/access';
import { useAccess } from '@/lib/use-access';

const SERVER_DEFAULT_WEEKLY_OFF = [0]; // hr.js DEFAULT_ATTENDANCE_SETTINGS.weeklyOff: Sunday

export function useOffDays(from: string | null, to: string | null) {
  const { hr } = useAccess();
  const shiftsOn = hrHas(hr, 'shifts');
  const attOn = hrHas(hr, 'attendance');
  const holOn = hrHas(hr, 'holidays');

  const shiftQ = useMyShift(shiftsOn);
  const companyQ = useCompanyWeeklyOff(attOn);
  const today = useTodayIst(); // a hook, so render stays pure (no clock read during render)

  // Holidays are listed per calendar year; a range can touch two (a request spans at most a year).
  const y1 = (from ?? today).slice(0, 4);
  const y2 = (to ?? from ?? today).slice(0, 4);
  const twoYears = y2 !== y1;
  const h1 = useHolidays(y1, holOn && !!from);
  const h2 = useHolidays(y2, holOn && !!from && twoYears);

  // An assigned shift's weekly offs win; the company policy applies only once we know there is no shift.
  const shift = shiftQ.data?.shift ?? null;
  const shiftSettled = !shiftsOn || shiftQ.isSuccess || shiftQ.isError;
  const weeklyOff = shift && Array.isArray(shift.weekly_off) ? shift.weekly_off : shiftSettled ? (companyQ.data ?? null) : null;

  const list = (v: unknown) => (Array.isArray(v) ? (v as { date?: string; optional?: boolean }[]) : []);
  const holidays = new Set<string>();
  for (const h of [...list(h1.data?.holidays), ...(twoYears ? list(h2.data?.holidays) : [])]) {
    if (h && !h.optional && typeof h.date === 'string') holidays.add(h.date);
  }
  const holidaysKnown = holOn && h1.isSuccess && (!twoYears || h2.isSuccess);

  return {
    weeklyOff: weeklyOff ?? SERVER_DEFAULT_WEEKLY_OFF,
    holidays,
    weeklyOffKnown: weeklyOff !== null,
    exact: weeklyOff !== null && holidaysKnown,
  };
}
