// Who sees what. Ported line-for-line from the web app so both clients agree; the server re-checks
// every request regardless, so these only decide what is SHOWN.
//   dash.html:913  RL (role labels)          dash.html:4627 hrHas / hrApproves / hrIsAdmin
//   dash.html:4637 HR_SYSTEM_ROLES           dash.html:4641 canSeeHrNav
//   dash.html:4784 HR_APPROVAL_KINDS         dash.html:5299 HR_SECTIONS
//   dash.html:1406 tenantFeatureOn

import type { HrMe, Tenant } from '@/api/me';
import type { StaffUser } from '@/auth/session';

export const ROLE_LABEL: Record<string, string> = {
  master_admin: 'Master Admin',
  super_admin: 'Super Admin',
  ceo: 'CEO',
  coo: 'COO',
  admin: 'Admin',
  hr: 'HR',
  it_admin: 'IT Admin',
  manager: 'Manager',
  employee: 'Employee',
  professional: 'Professional',
  accounts: 'Accounts',
  app_manager: 'Application Manager',
  announcement_viewer: 'Announcements (Display)',
  visitor_manager: 'Visitor Manager',
};

export const HR_SYSTEM_ROLES = ['super_admin', 'ceo', 'coo', 'hr', 'it_admin'];
export const hrIsSystemRole = (u?: StaffUser | null) => !!u && HR_SYSTEM_ROLES.includes(u.role);

export const hrHas = (hr: HrMe, m: string) => hr.enabled && hr.modules.includes(m);
export const hrApproves = (hr: HrMe, m: string) =>
  hr.enabled && hr.approverModules.includes(m) && (hr.isHrAdmin || hr.adminsDepts.length > 0);
export const hrIsAdmin = (hr: HrMe, u?: StaffUser | null) => hr.isHrAdmin && !!u && u.role !== 'master_admin';

export function canSeeHr(hr: HrMe, u?: StaffUser | null) {
  return (
    !!u &&
    u.role !== 'master_admin' &&
    hr.enabled &&
    (hr.modules.length > 0 || (hr.approverModules.length > 0 && (hr.isHrAdmin || hr.adminsDepts.length > 0)))
  );
}

// HR_SECTIONS.show — which parts of HR this person gets.
export function hrSections(hr: HrMe, u?: StaffUser | null) {
  const sys = hrIsSystemRole(u);
  return {
    attendance: hrHas(hr, 'attendance') && (!sys || hr.isHrAdmin || hr.adminsDepts.length > 0),
    // System roles never clock in (and therefore never file timesheets).
    clock: hrHas(hr, 'attendance') && !sys,
    regularization: hrHas(hr, 'regularization') && !sys,
    shifts: hrHas(hr, 'shifts'),
    holidays: hrHas(hr, 'holidays'),
    leave: (hrHas(hr, 'leave') || hrHas(hr, 'wfh') || hrHas(hr, 'comp_off')) && (!sys || hrIsAdmin(hr, u)),
    policies: hrHas(hr, 'policies'),
    pay: !sys && (hrHas(hr, 'salary') || hrHas(hr, 'payslips') || hrHas(hr, 'reimbursements')),
    timesheets: canSeeHr(hr, u) && !sys,
  };
}

// HR_APPROVAL_KINDS — the approvals inbox, one queue per kind. The labels are the Inbox's plain words
// (features/inbox/format KIND_COPY is what the screens show); keys, modules and paths are the server's.
export const HR_APPROVAL_KINDS = [
  { key: 'regularization', module: 'regularization', label: 'Attendance fix', list: '/hr/regularizations/inbox', decide: (id: string) => `/hr/regularizations/${id}/decide` },
  { key: 'leave', module: 'leave', label: 'Leave', list: '/hr/leave/inbox?kind=leave', decide: (id: string) => `/hr/leave/requests/${id}/decide` },
  { key: 'wfh', module: 'wfh', label: 'Work from home', list: '/hr/leave/inbox?kind=wfh', decide: (id: string) => `/hr/leave/requests/${id}/decide` },
  { key: 'comp_off', module: 'comp_off', label: 'Comp-off', list: '/hr/leave/inbox?kind=comp_off', decide: (id: string) => `/hr/leave/requests/${id}/decide` },
  { key: 'reimbursements', module: 'reimbursements', label: 'Salary claims', list: '/hr/claims/inbox', decide: (id: string) => `/hr/claims/${id}/decide` },
  { key: 'loans', module: 'reimbursements', label: 'Salary advance', adminOnly: true, list: '/hr/loans/inbox', decide: (id: string) => `/hr/loans/${id}/decide` },
] as const;

export function approvalKinds(hr: HrMe, u?: StaffUser | null) {
  return HR_APPROVAL_KINDS.filter((k) => hrApproves(hr, k.module) && (!('adminOnly' in k) || hrIsAdmin(hr, u)));
}

// Company feature switches (Config → Company Features). Absent means on.
export function tenantFeatureOn(t: Tenant | null | undefined, id: string) {
  if (!t) return true;
  if (id === 'bounty') return t.bountyEnabled !== false;
  const ff = t.featureFlags;
  return !ff || ff[id] !== false;
}

export const STAFF_ROLES = ['employee', 'professional'];
export const LEADERSHIP_ROLES = ['super_admin', 'ceo', 'coo'];
