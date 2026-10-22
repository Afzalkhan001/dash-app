// Grids domain gates: who sees each wide table. Every one is the gate of the website page the table
// lives on (VISIBILITY ONLY — the server re-checks every read), reusing the owning domain's own gate
// where one exists so the two never drift apart:
//
//   Attendance month sheet  dash.html:4600 AttendanceHub showTeam = MY_HR.isHrAdmin || adminsDepts.length,
//                           inside HR_SECTIONS attendance (canSeeHr + hrSections.attendance). The data is
//                           GET /hr/attendance/team?date= (hr.js:962), one day at a time: HR admins get the
//                           company, a department admin only the departments they run (server-scoped).
//   Leave balances table    dash.html:4945 LeaveSetup "Company balances" (hrtime canSetUpLeave);
//                           GET /hr/leave/balances (hr_leave.js:230, hrAdminGate 'leave').
//   Payroll register        dash.html:5136 PayrollRunView lines table (payroll gates.runs);
//                           GET /hr/payroll/runs[/:id] (hr_payroll.js:365/389, payrollAdmin).
//   Salaries table          dash.html:5232 SalaryPeople (payroll gates.salaries); GET /hr/salary/people.
//   Petty cash ledger       dash.html:34804 VendorBillApprovals showPettyCash =
//                           pettyCashAccountsInBillApprovals(user) (accounts, super_admin) on the
//                           accounts-bill-review page; ledger :17243 built from /petty_cash_requests,
//                           /petty_cash_bills, /petty_cash_bill_submissions and /reimbursements/accounts-all.
//   Employee roster table   dash.html:5871 EmpRoster table (people canSeeRoster = webNav 'roster').

import { canSetUpLeave } from '@/features/hrtime/access';
import { payrollGates } from '@/features/payroll/access';
import { canSeeRoster } from '@/features/people/access';
import { canSeeHr, hrSections } from '@/lib/access';
import type { Access } from '@/lib/use-access';

const role = (a: Access) => (a.user && typeof a.user.role === 'string' ? a.user.role : '');

export const canSeeAttendanceSheet = (a: Access) =>
  canSeeHr(a.hr, a.user) && hrSections(a.hr, a.user).attendance && (a.hr.isHrAdmin || a.hr.adminsDepts.length > 0);
export const canSeeBalancesGrid = (a: Access) => canSetUpLeave(a.hr, a.user);
export const canSeePayrollRegister = (a: Access) => payrollGates(a.hr, a.user).runs;
export const canSeeSalaryGrid = (a: Access) => payrollGates(a.hr, a.user).salaries;
export const canSeePettyLedger = (a: Access) => a.web('accounts-bill-review') && ['accounts', 'super_admin'].includes(role(a));
export const canSeeRosterGrid = (a: Access) => canSeeRoster(a.user, a.tenant);

export function gridGates(a: Access) {
  const g = {
    attendance: canSeeAttendanceSheet(a),
    balances: canSeeBalancesGrid(a),
    payroll: canSeePayrollRegister(a),
    salaries: canSeeSalaryGrid(a),
    ledger: canSeePettyLedger(a),
    roster: canSeeRosterGrid(a),
  };
  // `tables`: the People & HR tables — the ones behind More › Workspace › "Big tables" (nav.ts), so the
  // hub opens only for people offered it (the petty cash ledger has its own Money row and route).
  const tables = g.attendance || g.balances || g.payroll || g.salaries || g.roster;
  return { ...g, tables, any: tables || g.ledger };
}
export type GridGates = ReturnType<typeof gridGates>;
