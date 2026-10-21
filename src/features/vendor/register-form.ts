// The registration wizard's form model, ported from the website's VendorRegistrationFlow
// (dash.html ~31290): initial values from /vendor/me, the PUT /vendor/registration body (saveDraft),
// per-step validation with the same messages, and the derived facts every step reads (is the bank
// account penny-drop verified, which address Digio returned, which documents are still needed).

import type { BankVerification, Vendor } from '@/api/vendor';
import { D206_KEYS, RE, STEP_COUNT, VP_STEPS } from '@/features/vendor/constants';

export type RegForm = {
  legalEntityName: string;
  tradeName: string;
  businessType: string;
  brandName: string;
  registeredAddress: string;
  contactPerson: string;
  designation: string;
  email: string;
  pocEmail: string;
  pan: string;
  panLinkedToAadhaar: boolean | null;
  gstStatus: string;
  gstin: string;
  nonGstReason: string;
  nonGstReasonText: string;
  addressSource: '' | 'aadhaar' | 'manual';
  msmeRegistered: '' | 'yes' | 'no';
  msmeNumber: string;
  bankAccountName: string;
  bankName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifsc: string;
  branchName: string;
  entityType: string;
  itrFiled2425: string;
  itrAck2425: string;
  itrDate2425: string;
  itrReason2425: string;
  itrFiled2324: string;
  itrAck2324: string;
  itrDate2324: string;
  itrReason2324: string;
  tdsOver50k: string;
  declarantName: string;
  declarationDate: string;
  declarationPlace: string;
};

export type RegErrors = Partial<Record<string, string>>;

export function initForm(vendor: Vendor): RegForm {
  const b = vendor.business || ({} as Vendor['business']);
  const t = vendor.tax || ({} as Vendor['tax']);
  const g = vendor.gst || ({} as Vendor['gst']);
  const m = vendor.msme || ({} as Vendor['msme']);
  const bk = vendor.bank || ({} as Vendor['bank']);
  const d = vendor.declaration206ab || {};
  return {
    legalEntityName: b.legalEntityName || '',
    tradeName: b.tradeName || '',
    businessType: b.businessType || '',
    brandName: b.brandName || '',
    registeredAddress: b.registeredAddress || '',
    contactPerson: b.contactPerson || '',
    designation: b.designation || '',
    email: vendor.email || '',
    pocEmail: b.pocEmail || '',
    pan: t.pan || '',
    panLinkedToAadhaar: t.panLinkedToAadhaar ?? null,
    gstStatus: g.status || '',
    gstin: g.gstin || '',
    nonGstReason: g.nonGstReason || '',
    nonGstReasonText: g.nonGstReasonText || '',
    addressSource: '',
    msmeRegistered: m.registered ? 'yes' : m.registered === false ? 'no' : '',
    msmeNumber: m.number || '',
    bankAccountName: bk.accountName || '',
    bankName: bk.bankName || '',
    // The stored account number is masked — never prefill it into an editable field.
    accountNumber: '',
    confirmAccountNumber: '',
    ifsc: bk.ifsc || '',
    branchName: bk.branchName || '',
    entityType: d.entityType || '',
    itrFiled2425: d.itrFiled2425 || '',
    itrAck2425: d.itrAck2425 || '',
    itrDate2425: d.itrDate2425 || '',
    itrReason2425: d.itrReason2425 || '',
    itrFiled2324: d.itrFiled2324 || '',
    itrAck2324: d.itrAck2324 || '',
    itrDate2324: d.itrDate2324 || '',
    itrReason2324: d.itrReason2324 || '',
    tdsOver50k: d.tdsOver50k || '',
    declarantName: d.declarantName || '',
    declarationDate: d.declarationDate || '',
    declarationPlace: d.declarationPlace || '',
  };
}

export type RegContext = {
  bankVer: BankVerification | null;
  bankCorrectionAsked: boolean;
  bankVerified: boolean;
  kycAddress: string;
  kycAddressLabel: string;
  identityStatus: string | undefined;
  identityStarted: boolean;
  uploaded: Set<string>;
  docStatus: Record<string, string>;
  needDocs: string[];
};

export function regContext(vendor: Vendor, f: RegForm): RegContext {
  const kyc = vendor.kyc || ({} as Vendor['kyc']);
  const identity = kyc.stages?.identity;
  const bankVer = kyc.bankVerification || null;
  // A rejection, or Accounts asking for a bank correction, reopens the bank fields even after a
  // penny drop — otherwise the vendor would be asked to fix something the form gives no way to fix.
  const items: unknown = vendor.correction?.items;
  const bankCorrectionAsked = vendor.status === 'rejected' || (Array.isArray(items) ? items : []).some((i) => i === 'bank_account' || i === 'bank_proof');
  const bankVerified = !!(bankVer && bankVer.verified && bankVer.accountNumber) && !bankCorrectionAsked;
  // GST vendors' address comes from the GST certificate OCR; non-GST vendors' from DigiLocker.
  const kycAddress = f.gstStatus === 'registered' ? kyc.gstVerification?.address || '' : kyc.aadhaarVerification?.address || '';
  const kycAddressLabel = f.gstStatus === 'registered' ? 'GST certificate address' : 'Aadhaar address';
  // API data: guard before mapping (a non-array here crashed the timesheet screen in the same way).
  const docs = (Array.isArray(vendor.documents) ? vendor.documents : []).filter((d) => d && typeof d.docType === 'string');
  const uploaded = new Set(docs.map((d) => d.docType));
  const docStatus = Object.fromEntries(docs.map((d) => [d.docType, d.status]));
  const needDocs = ['declaration_206ab'];
  if (!kyc.panVerification?.verified) needDocs.push('pan');
  if (!bankVerified) needDocs.push('bank_proof');
  if (f.gstStatus === 'registered' && !kyc.gstVerification?.verified) needDocs.push('gst_certificate');
  else if (f.gstStatus === 'not_registered') needDocs.push('non_gst_declaration');
  if (f.msmeRegistered === 'yes') needDocs.push('msme_certificate');
  return {
    bankVer,
    bankCorrectionAsked,
    bankVerified,
    kycAddress,
    kycAddressLabel,
    identityStatus: identity?.status,
    identityStarted: !!identity?.requestId,
    uploaded,
    docStatus,
    needDocs,
  };
}

// Step 5 (the web's read-only "Summary") is skipped: the last step shows the same details with Edit
// links, so the app asks the vendor to check everything once, not twice. Step 6 (non-GST declaration)
// only applies to vendors who are not GST registered.
export const isStepApplicable = (n: number, f: RegForm) => n !== 5 && (n !== 6 || f.gstStatus === 'not_registered');

/** The steps this vendor goes through, in order, with their plain names. */
export function stepsFor(f: RegForm) {
  return VP_STEPS.map((label, i) => ({ n: i + 1, label: label as string })).filter((s) => isStepApplicable(s.n, f));
}

/**
 * Where a registration that is still being filled in picks up: the first step whose answers are not
 * complete yet (same checks as Continue), or a declaration step whose form is not signed yet, else the
 * last step. A registration sent back (corrections / not approved) starts from the top, so the vendor
 * walks through what was asked. Pure: the same vendor always gives the same step (Home shows it too).
 */
export function resumeStep(vendor: Vendor, f: RegForm): number {
  if (vendor.status === 'correction_required' || vendor.status === 'rejected') return 1;
  const ctx = regContext(vendor, f);
  for (const s of stepsFor(f)) {
    if (s.n === STEP_COUNT) return s.n;
    if (Object.keys(validateStep(s.n, f, ctx)).length) return s.n;
    if (s.n === 6 && !ctx.uploaded.has('non_gst_declaration')) return s.n;
    if (s.n === 7 && !ctx.uploaded.has('declaration_206ab')) return s.n;
  }
  return STEP_COUNT;
}

export function nextApplicableStep(from: number, f: RegForm, count: number) {
  let n = from + 1;
  while (n <= count && !isStepApplicable(n, f)) n++;
  return Math.min(count, n);
}

export function prevApplicableStep(from: number, f: RegForm) {
  let n = from - 1;
  while (n >= 1 && !isStepApplicable(n, f)) n--;
  return Math.max(1, n);
}

// PUT /vendor/registration body — exactly what the website's saveDraft() sends.
export function draftBody(f: RegForm, bankVerified: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = { ...f, msmeRegistered: f.msmeRegistered === 'yes' };
  body.declaration206ab = Object.fromEntries(D206_KEYS.map((k) => [k, f[k]]));
  D206_KEYS.forEach((k) => delete body[k]);
  if (!body.accountNumber) delete body.accountNumber;
  // Sent so the server can run its typo check; it strips it before storing.
  if (!body.confirmAccountNumber) delete body.confirmAccountNumber;
  // A penny-dropped account belongs to the server, and the copy here is masked: never send it back.
  if (bankVerified) ['accountNumber', 'confirmAccountNumber', 'bankAccountName', 'bankName', 'ifsc', 'branchName'].forEach((k) => delete body[k]);
  return body;
}

// Client-side gate per step (the server re-validates everything on submit).
export function validateStep(n: number, f: RegForm, ctx: RegContext): RegErrors {
  const e: RegErrors = {};
  if (n === 1) {
    if (!f.email.trim()) e.email = 'Enter an email address.';
    else if (!RE.email.test(f.email.trim())) e.email = 'That email address does not look right.';
    if (!f.pocEmail.trim()) e.pocEmail = "Enter your Tamada contact's email address.";
    else if (!RE.email.test(f.pocEmail.trim())) e.pocEmail = 'That email address does not look right.';
  }
  if (n === 2) {
    if (!f.gstStatus) e.gstStatus = 'Tell us if you are registered for GST.';
  }
  if (n === 3) {
    if (ctx.identityStatus !== 'completed') e.identityVerify = 'Finish the Digio check before you continue.';
    else if (!ctx.bankVerified) {
      if (!f.bankAccountName.trim()) e.bankAccountName = 'Enter the account holder name.';
      if (!f.bankName.trim()) e.bankName = 'Enter the bank name.';
      if (!f.accountNumber.trim()) e.accountNumber = 'Enter the account number.';
      else if (!RE.acct.test(f.accountNumber.trim())) e.accountNumber = 'Account number should be 6-20 digits.';
      if (!f.confirmAccountNumber.trim()) e.confirmAccountNumber = 'Re-enter the account number.';
      else if (f.confirmAccountNumber.trim() !== f.accountNumber.trim()) e.confirmAccountNumber = 'Account numbers do not match.';
      if (!f.ifsc.trim()) e.ifsc = 'Enter the IFSC code.';
      else if (!RE.ifsc.test(f.ifsc.trim().toUpperCase())) e.ifsc = 'That does not look like a valid IFSC code.';
      if (!ctx.uploaded.has('bank_proof')) e.bankProof = 'Upload a cancelled cheque or passbook copy.';
    }
  }
  if (n === 4) {
    if (!f.legalEntityName.trim()) e.legalEntityName = 'Enter the legal entity name exactly as it appears on the PAN.';
    if (!f.businessType) e.businessType = 'Select your business type.';
    if (!f.registeredAddress.trim()) e.registeredAddress = 'Enter your registered address.';
    if (!f.contactPerson.trim()) e.contactPerson = 'Enter a contact person.';
    if (!f.msmeRegistered) e.msmeRegistered = 'Tell us if you are registered as MSME (Udyam).';
    if (f.msmeRegistered === 'yes') {
      if (!f.msmeNumber.trim()) e.msmeNumber = 'Enter your Udyam number.';
      else if (!RE.udyam.test(f.msmeNumber.trim().toUpperCase())) e.msmeNumber = 'Udyam number should look like UDYAM-KA-03-0001234.';
    }
  }
  if (n === 7) {
    if (!f.entityType) e.entityType = 'Select your entity type.';
    (['2425', '2324'] as const).forEach((k) => {
      const filed = f[`itrFiled${k}`];
      if (!filed) e[`itrFiled${k}`] = 'Tell us whether the return was filed.';
      else if (filed === 'yes') {
        if (!String(f[`itrAck${k}`] || '').trim()) e[`itrAck${k}`] = 'Enter the acknowledgement number.';
        if (!f[`itrDate${k}`]) e[`itrDate${k}`] = 'Enter the filing date.';
      } else if (!String(f[`itrReason${k}`] || '').trim()) e[`itrReason${k}`] = 'Tell us why it was not filed.';
    });
    if (!f.tdsOver50k) e.tdsOver50k = 'Please answer this.';
    if (!String(f.declarantName || '').trim()) e.declarantName = 'Enter the name of the person signing.';
    if (!f.declarationDate) e.declarationDate = 'Enter the declaration date.';
    if (!String(f.declarationPlace || '').trim()) e.declarationPlace = 'Enter the place.';
  }
  return e;
}
