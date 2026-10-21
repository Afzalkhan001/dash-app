// Payroll domain gates, ported from dash.html (VISIBILITY ONLY — every route is re-checked by hr.js
// hrAdminGate: super_admin and hr only, master_admin refused, the module switched on; and notSelf):
//
//   dash.html:4641 canSeeHrNav          the HR page is in the sidebar at all                 → canSeeHr
//   dash.html:5312 HR_SECTIONS payroll  show = hrIsAdmin(u) && (hrHas('payroll')||'salary'||'tax')
//   dash.html:5290 PayrollAdminPanel    tabs: Payroll runs = hrHas('payroll'); Salaries and Structures
//                                       = hrHas('salary'); Statutory & TDS = hrHas('tax')
//   dash.html:5119 PayrollRunView       Recompute / Discard draft / Lock only while run.status==='draft';
//                  :5140                Edit (a line) only on a draft
//   dash.html:5235 SalaryPeople         Set salary / Revise / Tax hidden on your own row (p.id!==user.id)
//
// lib/access.ts canSeePayrollAdmin is the same test as `any` below (it feeds access.web('payroll')).

import type { HrMe } from '@/api/me';
import type { StaffUser } from '@/auth/session';
import { canSeeHr, canSeePayrollAdmin, hrHas, hrIsAdmin } from '@/lib/access';

type U = StaffUser | null | undefined;

/** The Payroll section of the HR page (dash.html:5312, inside canSeeHrNav :4641). */
export const canSeePayroll = (hr: HrMe, u: U) => canSeeHr(hr, u) && canSeePayrollAdmin(hr, u);

/** Every gate at once, for the hub, the screens and the plug-ins. */
export function payrollGates(hr: HrMe, u: U) {
  const any = canSeePayroll(hr, u);
  const admin = any && hrIsAdmin(hr, u);
  const g = {
    runs: admin && hrHas(hr, 'payroll'),
    salaries: admin && hrHas(hr, 'salary'),
    structures: admin && hrHas(hr, 'salary'),
    statutory: admin && hrHas(hr, 'tax'),
  };
  return { ...g, any: any && (g.runs || g.salaries || g.statutory) };
}
export type PayrollGates = ReturnType<typeof payrollGates>;

/** A draft run can be recomputed, edited, discarded and locked; a locked one never again (dash.html:5119). */
export const isDraft = (run: { status?: string } | null | undefined) => run?.status === 'draft';

/** Nobody sets their own salary, tax profile or payroll line (dash.html:5235; hr_payroll.js notSelf). */
export const isSelf = (employeeId: string | null | undefined, u: U) => !!u && !!employeeId && String(employeeId) === String(u.id);
