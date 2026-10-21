// Accounts domain gates — pure functions ported from dash.html and the server role lists they mirror
// (docs/port/accounts.md §0). Many of these write routes check only the role on the server, so the app
// copies the website's rules exactly, and never offers a page the server answers with a 403.
//
//   dash.html:1531  navForRaw: accounts → vendors, vendormaster, accounts-bill-review, agreements, ACN;
//                   super_admin (and ceo / coo, n.ceo = n.super_admin) → ACN_REVIEWER (Bill Approvals).
//   dash.html:16245 PETTY_CASH_ADMIN_ROLES_FE, pettyCashIsApprover (accounts only),
//                   pettyCashAccountsInBillApprovals (accounts, super_admin).
//   dash.html:17361 PaymentsPanel canActOn: vendor bills → ACCOUNTS_ROLES; petty cash / claims → accounts.
//   dash.html:34805 VendorBillApprovals: showPettyCash = accounts | super_admin; canActPc = accounts.
//   vendor_bills.js:36   ACCOUNTS_ROLES = accounts, super_admin, master_admin (accounts-all, accept, reject,
//                        payment/start, settings, by-vendor). CEO / COO get a 403, so they are not offered it.
//   reimbursements.js:28 ACCOUNTS_ACT = accounts; :29 ACCOUNTS_VIEW = accounts, super_admin, master_admin.
//   vendor_agreements.js:61 OVERRIDE_ROLES = super_admin, master_admin, accounts (company-wide list, extend).
//   vendor.js:188  requireAccounts = accounts, super_admin, master_admin — but only `accounts` has the
//                  Registrations / Vendor Master menu items, so in practice review is Accounts-only.

import type { StaffUser } from '@/auth/session';
import type { Access } from '@/lib/use-access';

type U = Pick<StaffUser, 'id' | 'role'> | null | undefined;
const role = (u: U) => (u && typeof u.role === 'string' ? u.role : '');

export const ACCOUNTS_ROLES = ['accounts', 'super_admin', 'master_admin'];
export const REIMB_ACCOUNTS_VIEW = ['accounts', 'super_admin', 'master_admin'];
export const PETTY_CASH_ADMIN_ROLES = ['accounts', 'super_admin', 'master_admin', 'ceo', 'coo'];
export const AGREEMENT_OVERSEER_ROLES = ['super_admin', 'master_admin', 'accounts'];
const LEADERS = ['super_admin', 'ceo', 'coo'];

/** pettyCashIsApprover (dash.html:16248): only Accounts signs petty cash and claims off. */
export const isAccountsActor = (u: U) => role(u) === 'accounts';
/** isPettyCashAdmin (dash.html:16246): sees every request, manages expense types. */
export const isPettyCashAdmin = (u: U) => PETTY_CASH_ADMIN_ROLES.includes(role(u));

/** Bill Approvals' vendor tab: the page (accounts-bill-review) AND a role the server serves (ACCOUNTS_ROLES). */
export const canSeeVendorBills = (a: Access) => a.web('accounts-bill-review') && ACCOUNTS_ROLES.includes(role(a.user));
/** Authorize / reject / start paying vendor bills: same as seeing them (no self-check on accept). */
export const canActVendorBills = canSeeVendorBills;

/**
 * Petty cash at Accounts' stage. Accounts and Super Admin have it on Bill Approvals; CEO and COO have the
 * same queue under Petty cash › Approvals (PettyCashAccountsQueue, view only). Only Accounts acts.
 */
export const canSeeAccountsPetty = (a: Access) =>
  (a.web('accounts-bill-review') && ['accounts', 'super_admin'].includes(role(a.user))) ||
  (['ceo', 'coo'].includes(role(a.user)) && a.web('accounts-pettycash'));
export const canActAccountsPetty = (a: Access) => canSeeAccountsPetty(a) && isAccountsActor(a.user);

/** Expense claims at Accounts' stage: Bill Approvals' Reimbursements tab (showPettyCash, ACCOUNTS_VIEW). */
export const canSeeAccountsClaims = (a: Access) =>
  a.web('accounts-bill-review') && ['accounts', 'super_admin'].includes(role(a.user)) && REIMB_ACCOUNTS_VIEW.includes(role(a.user));
export const canActAccountsClaims = (a: Access) => canSeeAccountsClaims(a) && isAccountsActor(a.user);

/** The desk exists when any of its queues does. */
export const canSeeAccountsDesk = (a: Access) => canSeeVendorBills(a) || canSeeAccountsPetty(a) || canSeeAccountsClaims(a);

/** Vendor Registrations / Vendor Master (Accounts only; both can be switched off per company). */
export const canSeeRegistrations = (a: Access) => a.web('vendors');
export const canSeeVendorMaster = (a: Access) => a.web('vendormaster');
export const canSeeVendors = (a: Access) => canSeeRegistrations(a) || canSeeVendorMaster(a);

/**
 * Agreements: Accounts' own menu item; every other staff role reaches the same AgreementsSignTab through
 * Accounts › Vendor › "Agreements Sign" (VendorSection, dash.html:33713) — anyone can be named the
 * countersigner, and anyone who drafted one may extend it. The server decides the list (`isOverseer`)
 * and who may extend or sign.
 */
export const canSeeAgreements = (a: Access) => a.web('agreements') || a.web('accounts-vendor');
/** The More row: Accounts and the leadership roles. Anyone else named to countersign gets the Inbox kind `agree-sign`. */
export const showAgreementsRow = (a: Access) => a.web('agreements') || (LEADERS.includes(role(a.user)) && a.web('accounts-vendor'));
/** ExtendDeadlineModal (dash.html:34379): the drafter or an overseer, while it waits on the vendor. */
export const canExtendAgreement = (u: U, a: { status: string; created_by?: string | null }, isOverseer: boolean) =>
  a.status === 'pending_signature' && (isOverseer || (!!u && a.created_by === u.id));

/** Company-wide expense reports and expense types: PettyCashHub's admin tabs (isPettyCashAdmin). */
export const canSeePettyAdmin = (a: Access) => isPettyCashAdmin(a.user) && role(a.user) !== 'master_admin' && a.web('accounts-pettycash');
/** Rejecting one bill in an expense report: PETTY_CASH_APPROVER_ROLES (server.js:3250), and the line says so (canReject). */
export const canRejectStatementLine = (u: U) => isAccountsActor(u);

/** Payment timeline settings: GET/PUT /vendor-bills/settings (ACCOUNTS_ROLES). */
export const canEditPaymentTimeline = canSeeVendorBills;

/** Petty cash / claims at Accounts' stage the viewer raised or is paid — "someone else has to". */
export const isOwnPetty = (u: U, r: { employeeId?: string; requestedById?: string }) => !!u && (r.employeeId === u.id || r.requestedById === u.id);
export const isOwnClaim = (u: U, r: { employee_id?: string }) => !!u && r.employee_id === u.id;
export const isOwnBill = (u: U, b: { submitted_by?: string }) => !!u && b.submitted_by === u.id;
