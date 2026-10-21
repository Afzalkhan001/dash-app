// Who gets Accounts > Reimbursement: exactly the roles reimbursements.js lets through (EVERY_ROLE,
// minus master_admin, who has no company of their own). The website's menu also lists the App
// Manager, but the server refuses that role ("You do not have permission to view your
// reimbursements"), so the app hides the tile, the Home shortcut and the + action for it.
// Visibility only — reimbursements.js re-checks every request.

import type { StaffUser } from '@/auth/session';

export const REIMBURSEMENT_ROLES = ['super_admin', 'ceo', 'coo', 'admin', 'hr', 'it_admin', 'manager', 'employee', 'professional', 'accounts'];
export const canSeeReimbursements = (u?: Pick<StaffUser, 'role'> | null) => !!u && REIMBURSEMENT_ROLES.includes(u.role);
