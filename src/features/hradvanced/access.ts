// hradvanced gates, ported from dash.html (VISIBILITY ONLY — the server re-checks what it can):
//
//   Salary structures editor   dash.html:5167 SalaryStructures inside PayrollAdminPanel (:5290), the
//                              "Salaries and Structures" tab = hrIsAdmin && hrHas('salary'); server
//                              salaryAdmin = hrAdminGate(…, 'salary') (hr_payroll.js:90): super_admin
//                              and hr only, master_admin refused.
//   Statutory & TDS editor     dash.html:5239 StatutorySettings, the "Statutory & TDS" tab =
//                              hrIsAdmin && hrHas('tax'); server hrAdminGate(…, 'tax') (hr_payroll.js:62).
//   HR database check          dash.html:5315 HrDbCheckBanner runs for hrIsAdmin(user); server
//                              GET /hr/admin/db-check is HR_ADMIN_ROLES (hr.js:437).
//   Branding, report logo and  dash.html:3540–3569 and ProfessionalCategoriesCard :3428 live on the
//   professional categories    Config page (ConfigToggles :3489) = the `config` sidebar item
//                              (navForRaw :1531: super_admin, ceo, coo; switchable per company).
//                              PUT /tenants/:id itself accepts USER_ADMIN_ROLES (routes/tenants.js:53)
//                              and has NO same-company check, so the app never offers more than Config.
//   Extend shoot time          dash.html:22948 extendBooking on ManagerHome (:22837), which only the
//                              `manager` role renders (:30513). The button sits on "Team Available
//                              Today" (:22973): reports with role employee/professional/manager whose
//                              reportingManager or additionalManager is me (:22859), each with today's
//                              approved professional booking (:22873).

import type { HrMe, Tenant } from '@/api/me';
import type { StaffUser } from '@/auth/session';
import { payrollGates } from '@/features/payroll/access';
import { hrIsAdmin, webNav } from '@/lib/access';

type U = StaffUser | null | undefined;

/** Payroll setup: the structure editor (`salary`) and the statutory editor (`tax`). */
export function payrollSetupGates(hr: HrMe, u: U) {
  const g = payrollGates(hr, u);
  return { structures: g.structures, statutory: g.statutory, dbCheck: hrIsAdmin(hr, u), any: g.structures || g.statutory };
}

/** The website's Config page (branding, report logo, professional categories). */
export const canEditCompanyConfig = (u: U, t: Tenant | null | undefined) => webNav(u, 'config', t);

/** ManagerHome is the `manager` role's home only (dash.html:30513). */
export const canExtendShoots = (u: U) => u?.role === 'manager';

/** STAFF_MGR_ROLES (dash.html:920): the people on a manager's "Team Available Today". */
export const STAFF_MGR_ROLES = ['employee', 'professional', 'manager'];

/** deptEmps (dash.html:22859): my direct reports, matched on display name as the website does. */
export function isMyReport(p: { role?: string; reportingManager?: string; additionalManager?: string }, myName: string) {
  return STAFF_MGR_ROLES.includes(String(p.role || '')) && !!myName && (p.reportingManager === myName || p.additionalManager === myName);
}
