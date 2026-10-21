// Who gets which document — the website's own gates for each export, reused from the owning domains so
// the rules stay in one place (pure; safe during render).
//
//   Draft an agreement     NewAgreementModal from AgreementVendorProfile in AgreementsSignTab (dash.html:34211),
//                          reached by every staff role (Accounts › Vendor › "Agreements Sign"); the server takes
//                          any staff role (vendor_agreements.js:192 EMPLOYEE_ROLES). = canSeeAgreements.
//   Signed copy            "View Signed Document" (SignedAgreementView :32574) on the same lists.
//   Pending reviews PDF    PendingReviewsMonitor (:26136) — App Manager only.
//   Tomorrow schedule PDF  ManagerHome (:22950) — managers; AdminHome "Next Day Schedule" (:22064) — admins.
//   Bounty report          BountyReportsView, Bounty › Reports tab (:14939) — super tier and App Manager.
//   Audit report           ActivityAudit export (:15108) — the audit page plus "Download reports" (or Super Admin).
//   Asset report           Asset detail "Download PDF" (:20977) — the Assets page.
//   Timesheet              TimesheetCard on the person's own profile (:29084) — every staff person.
//   Vendor master / one vendor   VendorMaster export (:25882) / "Print Summary" (:25489) — Accounts.
//   Petty cash statement   Statement of Expenses "Print / Save as PDF" (:16466) — whoever may open the
//                          statement; the server decides (GET /petty_cash_bill_submissions/statement/:batchId).
//   Payslip                server PDF (hr_payroll.js:554) — already shared from Me › Pay; nothing new here.

import { canSeeAgreements, canSeeVendorMaster, canSeeVendors } from '@/features/accounts/access';
import { canSeePendingReviews } from '@/features/booking/access';
import { bountyAdminGates } from '@/features/bountyadmin/access';
import { auditPermission, canSeeAudit } from '@/features/company/access';
import { canSeeAssets } from '@/features/itdesk/access';
import { roleSeesPettyCash } from '@/features/petty-cash/logic';
import { hasManagerHome } from '@/features/work/access';
import type { Access } from '@/lib/use-access';

const roleOf = (a: Access) => String(a.user?.role || '');
const NOT_STAFF = ['master_admin', 'vendor', ''];
// The TV display login has no profile page on the website (AnnouncementsHome replaces the app), so no timesheet.
const NO_PROFILE = [...NOT_STAFF, 'announcement_viewer'];

// vendor_agreements.js:56 EMPLOYEE_ROLES — every agreement route (and /vendor-bills/vendors) refuses any
// other role. app_manager has the Accounts menu on the website but every request there is a 403, so the
// app doesn't offer a form that can only fail.
const AGREEMENT_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo', 'admin', 'hr', 'it_admin', 'manager', 'employee', 'professional', 'accounts'];
export const canDraftAgreement = (a: Access) => !!a.user && AGREEMENT_ROLES.includes(roleOf(a)) && canSeeAgreements(a);
export const canSignedCopy = canDraftAgreement;
export const canReviewsPdf = (a: Access) => canSeePendingReviews(a.user);
export const canManagerSchedulePdf = (a: Access) => hasManagerHome(a);
export const canAdminSchedulePdf = (a: Access) => roleOf(a) === 'admin' && !!a.user?.tenantId;
export const canSchedulePdf = (a: Access) => canManagerSchedulePdf(a) || canAdminSchedulePdf(a);
export const canBountyPdf = (a: Access) => bountyAdminGates(a.user, a.tenant).summary;
export const canAuditPdf = (a: Access) => canSeeAudit(a.user, a.tenant) && auditPermission(a.user, a.tenant, 'downloadReports');
export const canAssetPdf = (a: Access) => canSeeAssets(a);
export const canTimesheetPdf = (a: Access) => !!a.user?.tenantId && !NO_PROFILE.includes(roleOf(a));
export const canVendorMasterPdf = (a: Access) => canSeeVendorMaster(a);
export const canVendorSummaryPdf = (a: Access) => canSeeVendors(a);
// Only roles with Accounts › Petty Cash on the website can have submitted a bill (not the Visitor Manager or the TV login).
export const canPettyStatementPdf = (a: Access) => !!a.user?.tenantId && !NOT_STAFF.includes(roleOf(a)) && roleSeesPettyCash(a.user);

export type DocKind = 'reviews' | 'schedule' | 'bounty' | 'audit' | 'asset' | 'timesheet' | 'vendors' | 'vendor' | 'petty' | 'agreement';

/** The gate for each /admin/docs/<kind> screen. */
export const DOC_GATES: Record<DocKind, (a: Access) => boolean> = {
  reviews: canReviewsPdf,
  schedule: canSchedulePdf,
  bounty: canBountyPdf,
  audit: canAuditPdf,
  asset: canAssetPdf,
  timesheet: canTimesheetPdf,
  vendors: canVendorMasterPdf,
  vendor: canVendorSummaryPdf,
  petty: canPettyStatementPdf,
  agreement: canSignedCopy,
};

/** Whether the Documents hub has anything for this person. */
export const canSeeDocsHub = (a: Access) => Object.values(DOC_GATES).some((g) => g(a)) || canDraftAgreement(a);
