// Labels, option lists and wording for the vendor portal. Option VALUES, field keys and statuses are
// the website's (dash.html ~30546-30600, 32077, 33379) and must stay in sync with it; the words the
// vendor reads are plain-language versions (vendors are external and not technical: no "Keka",
// "Annexure", "POC" or "penny drop").

import type { BillStatus, DocStatus, VendorAgreement, VendorStatus } from '@/api/vendor';
import type { StatusTone } from '@/theme/tokens';

// ── Registration wizard ────────────────────────────────────────────────────────
// The website's eight steps (Mobile, GST Status, Verify, Business, Summary, Non-GST Decl., Annexure 1,
// Review), in plain words. No 'Bank' step: the Rs 1 test payment inside the Digio check verifies the
// account during 'Verify'. Step 5 (Summary) is skipped in the app (the last step shows the same with
// Edit links) and step 6 only applies to vendors who are not GST registered — see isStepApplicable.
export const VP_STEPS = [
  'Contact details',
  'GST',
  'Verify ID and bank',
  'Business details',
  'Check details',
  'Non-GST form',
  'Tax declaration',
  'Check and send',
] as const;
export const STEP_COUNT = VP_STEPS.length;

export const NON_GST_REASONS: [string, string][] = [
  ['turnover_below_limit', 'My turnover is below the GST limit'],
  ['exempt_supplies', 'What I supply is exempt from GST'],
  ['other', 'Other reason'],
];

export const ENTITY_TYPES: [string, string][] = [
  ['Company', 'Company'],
  ['Firm', 'Firm'],
  ['Individual', 'Individual'],
];

export const BUSINESS_TYPES: [string, string][] = [
  ['Ltd', 'Ltd'],
  ['Govt', 'Govt'],
  ['Pvt Ltd', 'Pvt Ltd'],
  ['LLP', 'LLP'],
  ['Trust', 'Trust'],
  ['Individual', 'Individual'],
  ['Firm', 'Firm'],
  ['Others', 'Others'],
];

export const DOC_LABEL: Record<string, string> = {
  pan: 'PAN card',
  aadhaar: 'Aadhaar card',
  gst_certificate: 'GST certificate',
  non_gst_declaration: 'Non-GST declaration',
  msme_certificate: 'Udyam (MSME) certificate',
  bank_proof: 'Cancelled cheque or passbook',
  declaration_206ab: 'Tax declaration (206AB)',
};

// One short line each (they sit under the document name).
export const DOC_HINT: Record<string, string> = {
  pan: 'A clear photo or scan of the PAN card.',
  aadhaar: 'Fetched by Digio when you verify. Nothing to upload.',
  gst_certificate: 'Your GST certificate (Form GST REG-06).',
  non_gst_declaration: 'Written from your answers. Sign it here.',
  msme_certificate: 'Your Udyam registration certificate.',
  bank_proof: 'It must show the account number and IFSC.',
  declaration_206ab: 'Written from your answers. Sign it here.',
};

/** A document's name as the vendor reads it: our plain label, else the server's, else the key. */
export const docLabel = (docType: string, serverLabel?: string | null) => DOC_LABEL[docType] ?? (serverLabel || docType);

/** One item Accounts asked the vendor to fix (a document key or a field key such as bank_account). */
export const fixItemLabel = (item: string) => DOC_LABEL[item] ?? String(item ?? '').replace(/_/g, ' ');

/** The list of things to fix from vendor.correction.items (API data guarded), joined for one line. */
export function fixItemsText(items: unknown) {
  return (Array.isArray(items) ? items : [])
    .filter((i): i is string => typeof i === 'string' && !!i)
    .map(fixItemLabel)
    .join(', ');
}

// Generated from the vendor's answers and e-signed in the portal — never uploaded.
export const GENERATED_DECLARATIONS = ['declaration_206ab', 'non_gst_declaration'];

export const D206_KEYS = [
  'entityType',
  'itrFiled2425',
  'itrAck2425',
  'itrDate2425',
  'itrReason2425',
  'itrFiled2324',
  'itrAck2324',
  'itrDate2324',
  'itrReason2324',
  'tdsOver50k',
  'declarantName',
  'declarationDate',
  'declarationPlace',
] as const;

// Same regexes the web wizard and vendor.js validate with.
export const RE = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  udyam: /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/,
  acct: /^[0-9]{6,20}$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
};

// Statuses in which vendor.js still accepts PUT /vendor/registration and /registration/submit.
export const EDITABLE_STATUSES: VendorStatus[] = ['draft', 'mobile_verified', 'correction_required', 'rejected'];

export const UPLOAD_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const SIGNATURE_MIME = ['image/png', 'image/jpeg', 'image/jpg'];
export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

// Shared by the Digio consent gate on the Verify step (web: DigioTermsBody).
export const DIGIO_TERMS_INTRO =
  'By proceeding, you authorize Tamada Media Pvt Ltd to verify your business and banking details through Digio, our KYC verification partner, and you confirm that:';
export const DIGIO_TERMS: [string, string][] = [
  [
    'Verification scope.',
    'This process will verify your GST certificate or PAN (as applicable), your Aadhaar details via DigiLocker, and your bank account via a ₹1 penny-drop confirmation. Digio may share the verified name, address, and bank details it retrieves with Tamada Media Pvt Ltd to complete your vendor onboarding.',
  ],
  [
    'Accuracy.',
    'All information and documents you provide are true, accurate, and belong to you or your business. Providing false information may result in rejection of your vendor registration.',
  ],
  [
    'Consent to data sharing.',
    'You consent to Digio collecting, processing, and sharing your KYC data (GST/PAN, Aadhaar, bank details) with Tamada Media Pvt Ltd solely for the purpose of vendor verification and onboarding. This data will not be used for any unrelated purpose.',
  ],
  [
    'Third-party processing.',
    "Digio is an independent, RBI/UIDAI-compliant verification service. Your use of DigiLocker and Aadhaar-based verification is also governed by Digio's own Privacy Policy and UIDAI's terms for Aadhaar-based authentication.",
  ],
  [
    'One-time use.',
    'The Aadhaar and bank verification session is used only to confirm your identity and banking details for this registration — Tamada Media Pvt Ltd does not store your Aadhaar number, only the verified name/address it returns.',
  ],
  [
    'Payments.',
    'Payments will be made only to the bank account verified through this process, unless you request a change through our Accounts team after approval.',
  ],
];

// ── Registration status ────────────────────────────────────────────────────────
export const VENDOR_STATUS: Record<VendorStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Not finished', tone: 'info' },
  mobile_verified: { label: 'Not finished', tone: 'info' },
  submitted: { label: 'Waiting for approval', tone: 'pending' },
  pending_verification: { label: 'Waiting for approval', tone: 'pending' },
  correction_required: { label: 'Changes needed', tone: 'pending' },
  approved: { label: 'Approved', tone: 'done' },
  rejected: { label: 'Not approved', tone: 'failed' },
  inactive: { label: 'Deactivated', tone: 'neutral' },
};

// An unknown (or missing) status from the API still renders a readable pill, never an empty one.
const humanize = (s: unknown) => {
  const t = String(s ?? '').replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Unknown';
};
const own = <T>(map: Record<string, T>, key: unknown): T | undefined =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

export const vendorStatus = (s: string) => own(VENDOR_STATUS, s) ?? { label: humanize(s), tone: 'neutral' as StatusTone };

export function docStatus(status: DocStatus | string, uploaded = true): { label: string; tone: StatusTone } | null {
  if (status === 'verified') return { label: 'Verified', tone: 'done' };
  if (status === 'correction_required') return { label: 'Needs a new copy', tone: 'pending' };
  if (status === 'not_applicable') return { label: 'Not needed', tone: 'neutral' };
  return uploaded ? { label: 'Uploaded', tone: 'info' } : null;
}

// ── Bills (web VENDOR_BILL_STATUS_LABEL / _CLASS, dash.html ~33379) ────────────────
// "Keka" approval is the project owner's approval, so the vendor reads it as "project approval".
export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  pending_keka_approval: 'Waiting for project approval',
  pending_keka_reapproval: 'Waiting for project approval',
  pending_accounts_approval: 'Waiting for Accounts',
  accepted: 'Approved for payment',
  payment_processing: 'Payment in progress',
  received: 'Paid',
  not_received: 'Payment not received',
  rejected_keka: 'Rejected',
  rejected_accounts: 'Rejected',
};

const BILL_STATUS_TONE: Record<BillStatus, StatusTone> = {
  pending_keka_approval: 'pending',
  pending_keka_reapproval: 'pending',
  pending_accounts_approval: 'info',
  accepted: 'info',
  payment_processing: 'info',
  received: 'done',
  not_received: 'failed',
  rejected_keka: 'failed',
  rejected_accounts: 'failed',
};

export const billStatus = (s: string) => ({
  label: own(BILL_STATUS_LABEL, s) ?? humanize(s),
  tone: own(BILL_STATUS_TONE, s) ?? ('pending' as StatusTone),
});

// "Pending" (shown as "Waiting") = still moving through approval; "Approved" = authorised by
// Accounts, whatever stage its payment is at; "Received" (shown as "Paid") = the submitter confirmed
// the money arrived.
export const BILL_PENDING: string[] = ['pending_keka_approval', 'pending_keka_reapproval', 'pending_accounts_approval'];
export const BILL_AUTHORIZED: string[] = ['accepted', 'payment_processing', 'received', 'not_received'];

// ── Agreements ─────────────────────────────────────────────────────────────────
// Pass `now` from useNow() when calling this during render, so render stays pure (React Compiler) and
// a screen left open past the deadline still flips to "Expired".
export const agreementExpired = (a: Pick<VendorAgreement, 'deadline_at'>, now?: number) => {
  if (!a?.deadline_at) return false;
  const at = new Date(a.deadline_at).getTime();
  return Number.isFinite(at) && (now ?? Date.now()) > at;
};
export const agreementPending = (a: VendorAgreement) => a?.status === 'pending_signature';
// Once the vendor has signed, an internal countersignature still to come is DASH's own follow-up —
// from the vendor's side it reads as Signed either way.
export const agreementSigned = (a: VendorAgreement) => a?.status === 'signed' || a?.status === 'pending_internal_signature';

// ── Profile change requests (web VendorDashboard CRITICAL) ────────────────────────
export const CHANGE_FIELDS: [string, string][] = [
  ['legalEntityName', 'Legal entity name'],
  ['pan', 'PAN'],
  ['gstin', 'GSTIN'],
  ['bankAccountName', 'Account holder name'],
  ['bankName', 'Bank name'],
  ['accountNumber', 'Account number'],
  ['ifsc', 'IFSC code'],
];
export const changeFieldLabel = (f: string) => CHANGE_FIELDS.find((c) => c[0] === f)?.[1] ?? f;
