// Hrtime domain gates: who may set up attendance, shifts, holidays, leave and policies. Ported line for
// line from dash.html (VISIBILITY ONLY — every write is re-checked by hr.js hrAdminGate, which allows
// super_admin and hr only, refuses master_admin, and needs the module switched on):
//
//   dash.html:4641 canSeeHrNav           the HR page is in the sidebar at all          → canSeeHr
//   dash.html:4602 AttendanceHub         showSetup = MY_HR.isHrAdmin && role !== 'master_admin',
//                                        inside HR_SECTIONS attendance (:5302, hrHas('attendance'))
//   dash.html:4687 ShiftsPanel           admin = hrIsAdmin(user), inside HR_SECTIONS shifts (hrHas('shifts'))
//   dash.html:4656 HolidaysPanel         admin = hrIsAdmin(user), inside HR_SECTIONS holidays (hrHas('holidays'))
//   dash.html:4952 LeavePanel            admin = hrIsAdmin(user) && hrHas('leave')
//   dash.html:5024 PoliciesPanel         admin = hrIsAdmin(user), inside HR_SECTIONS policies (hrHas('policies'))
//
// Payroll (PayrollAdminPanel, dash.html:5289) is the payroll domain's, not this one.

import type { HrMe } from '@/api/me';
import type { StaffUser } from '@/auth/session';
import { canSeeHr, hrHas, hrIsAdmin, hrSections } from '@/lib/access';

type U = StaffUser | null | undefined;

/** Attendance → Setup tab: offices, clock-in rules, the company clock-in policy. */
export const canSetUpAttendance = (hr: HrMe, u: U) => canSeeHr(hr, u) && hrSections(hr, u).attendance && hrIsAdmin(hr, u);

/** Shifts panel, admin half: create, edit, remove shifts and assign people. */
export const canManageShifts = (hr: HrMe, u: U) => canSeeHr(hr, u) && hrHas(hr, 'shifts') && hrIsAdmin(hr, u);

/** Holidays panel, admin half: add, edit, remove. */
export const canManageHolidays = (hr: HrMe, u: U) => canSeeHr(hr, u) && hrHas(hr, 'holidays') && hrIsAdmin(hr, u);

/** Leave & WFH → Leave setup: types, rules, company balances, adjustments, carry forward. */
export const canSetUpLeave = (hr: HrMe, u: U) => canSeeHr(hr, u) && hrSections(hr, u).leave && hrIsAdmin(hr, u) && hrHas(hr, 'leave');

/** Policies → Manage: write, publish, archive, see who has read them. */
export const canManagePolicies = (hr: HrMe, u: U) => canSeeHr(hr, u) && hrHas(hr, 'policies') && hrIsAdmin(hr, u);

/** Every gate at once, for the hub and the plug-ins. */
export function hrTimeGates(hr: HrMe, u: U) {
  const g = {
    attendance: canSetUpAttendance(hr, u),
    shifts: canManageShifts(hr, u),
    holidays: canManageHolidays(hr, u),
    leave: canSetUpLeave(hr, u),
    policies: canManagePolicies(hr, u),
  };
  return { ...g, any: g.attendance || g.shifts || g.holidays || g.leave || g.policies };
}

export type HrTimeGates = ReturnType<typeof hrTimeGates>;
