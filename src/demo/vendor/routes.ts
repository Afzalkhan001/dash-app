// The vendor portal's demo API: every /vendor/* route the app calls (api/vendor.ts), plus the shared
// WhatsApp code routes (/auth/phone/send-otp and /verify-otp) that agreement signing uses.
//
// demo/server.ts registers these with a way to read the token of the request being answered: the
// token names the vendor persona ('demo-vendor-token:<id>', demo/vendor/personas.ts) and that
// persona's record (demo/vendor/data.ts) answers. Each handler follows its server handler — vendor.js,
// vendor_bills.js, vendor_agreements.js — with the same guards, messages and response shapes, so the
// registration wizard, uploads, declarations, the Digio check, agreement e-sign and change requests
// work end to end and refuse what DASH refuses. Differences, all on purpose:
//   - Digio is simulated: /vendor/kyc/status finishes a started check at once (features/vendor/kyc.tsx
//     skips the browser in the demo), with the firm's or the owner's sample PAN / GST / Aadhaar / bank.
//   - Every WhatsApp code is 123456; nothing is sent anywhere, no email goes out, nothing is audited.
//   - Sign-in itself (/vendor/auth/login, /whatsapp-verify) is not here: a demo vendor signs in from
//     the role picker, never with a password or a proof token.

import type { ChangeRequest, DeclarationPreview, FilePayload, KycStatus, Vendor, VendorAgreement, VendorBill, VendorStatus } from '@/api/vendor';
import { DEMO_EMAIL, VENDOR_DEMO_TOKEN_PREFIX } from '@/demo/config';
import { PEOPLE, profile } from '@/demo/fixtures/org';
import { DEMO_CODE, type DemoBody, fail, type Handler, newId, notFound, nowIso, type Route, wrongCode } from '@/demo/state';
import { DECLARATION_PDF } from '@/demo/vendor/files';
import {
  assignVendorCode,
  completeKyc,
  DOC_LABEL,
  type DocRow,
  isVendorPersonaId,
  putDoc,
  reference,
  startKycStage,
  type VendorData,
  vendorRecord,
  type VendorRecord,
} from '@/demo/vendor/data';

// ── vendor.js constants and checks ───────────────────────────────────────────
const SESSION_GONE = 'Sign in to continue.';
const BUSINESS_TYPES = ['Ltd', 'Govt', 'Pvt Ltd', 'LLP', 'Trust', 'Individual', 'Firm', 'Others'];
const NON_GST_REASONS = ['turnover_below_limit', 'exempt_supplies', 'other'];
const ENTITY_TYPES = ['Company', 'Firm', 'Individual'];
const DOC_TYPES = Object.keys(DOC_LABEL);
const GENERATED = ['non_gst_declaration', 'declaration_206ab'];
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
const MAX_DOC_BYTES = 8 * 1024 * 1024;
const SIGNATURE_MIME = ['image/png', 'image/jpeg', 'image/jpg'];
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
const COMPANY_NAME = 'TAMADA MEDIA PRIVATE LIMITED';
const NON_GST_REASON_TEXT: Record<string, string> = {
  turnover_below_limit: 'our aggregate turnover in the State is below the threshold limit prescribed for registration',
  exempt_supplies: 'the goods and/or services supplied by us are wholly exempt from tax under the GST Act',
};

const RE = {
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  udyam: /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/,
  acct: /^\d{6,20}$/,
};
const up = (v: unknown) => String(v ?? '').trim().toUpperCase();
const str = (v: unknown) => String(v ?? '').trim();
const isPan = (v: unknown) => RE.pan.test(up(v));
const isEmail = (v: unknown) => RE.email.test(str(v));
const isIfsc = (v: unknown) => RE.ifsc.test(up(v));
const isUdyam = (v: unknown) => RE.udyam.test(up(v));
const isGstin = (v: unknown) => RE.gstin.test(up(v));
const gstinMatchesPan = (gstin: unknown, pan: unknown) => !gstin || !pan || up(gstin).slice(2, 12) === up(pan);
const last10 = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-10);
const b64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4);

const maskAccount = (n: unknown) => {
  const s = str(n);
  if (!s) return '';
  return s.length <= 4 ? 'XXXX' : 'X'.repeat(Math.max(6, s.length - 4)) + s.slice(-4);
};

const PAN_HOLDER_TYPE: Record<string, string> = {
  P: 'Individual',
  C: 'Company',
  H: 'Hindu Undivided Family',
  F: 'Firm / LLP',
  A: 'Association of Persons',
  T: 'Trust',
  B: 'Body of Individuals',
  L: 'Local Authority',
  J: 'Artificial Juridical Person',
  G: 'Government',
};
const panHolderType = (pan: unknown) => PAN_HOLDER_TYPE[up(pan).charAt(3)] ?? '';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** vendor.js fmtDate (en-IN "28 Jul 2025"). */
function fmtDate(s: unknown) {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : String(s);
}

// The Tamada contact must be on the demo company's roster (vendor.js pocOnRoster).
const POC_NOT_ON_ROSTER = "That email isn't on the Tamada employee roster. Enter your Tamada contact's work email address.";
const onRoster = (email: string) => {
  const e = email.trim().toLowerCase();
  return !!e && [...PEOPLE.map((p) => p.email), profile.email, DEMO_EMAIL].some((x) => String(x).toLowerCase() === e);
};

// ── vendor.js requiredDocs / validateRegistration / vendorSelfView ─────────────────
function requiredDocs(d: VendorData) {
  const req = ['declaration_206ab'];
  if (!d.panVerification?.verified) req.push('pan');
  req.push('bank_proof');
  if (d.gstStatus === 'registered' && !d.gstVerification?.verified) req.push('gst_certificate');
  else if (d.gstStatus === 'not_registered') req.push('non_gst_declaration');
  if (d.msmeRegistered === true || d.msmeRegistered === 'yes') req.push('msme_certificate');
  return req;
}

function validateRegistration(d: VendorData, phone: string) {
  const e: Record<string, string> = {};
  const need = (k: string, label: string) => {
    if (!str(d[k])) e[k] = `${label} is required.`;
  };
  need('legalEntityName', 'Legal Entity Name');
  need('businessType', 'Business Type');
  need('registeredAddress', 'Registered Address');
  need('contactPerson', 'Contact Person');
  if (!str(d.email)) e.email = 'Email ID is required.';
  else if (!isEmail(d.email)) e.email = 'Enter a valid email address.';
  if (!str(d.pocEmail)) e.pocEmail = 'Tamada POC Email ID is required.';
  else if (!isEmail(d.pocEmail)) e.pocEmail = 'Enter a valid Tamada POC email address.';
  if (!phone) e.contactNumber = 'A valid contact number is required.';
  if (!str(d.pan)) e.pan = 'PAN is required.';
  else if (!isPan(d.pan)) e.pan = 'PAN must look like ABCDE1234F.';
  if (d.gstStatus !== 'registered' && d.gstStatus !== 'not_registered') e.gstStatus = 'Select your GST registration status.';
  else if (d.gstStatus === 'registered') {
    if (!str(d.gstin)) e.gstin = 'GSTIN is required for a GST-registered vendor.';
    else if (!isGstin(d.gstin)) e.gstin = 'GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5.';
    else if (!gstinMatchesPan(d.gstin, d.pan)) e.gstin = 'This GSTIN does not match the PAN entered — characters 3 to 12 of a GSTIN are the PAN.';
  }
  if (d.businessType && !BUSINESS_TYPES.includes(d.businessType)) e.businessType = 'Select a business type from the list.';
  if (d.gstStatus === 'not_registered') {
    if (!d.nonGstReason) e.nonGstReason = 'Tell us why you are not registered under GST.';
    else if (!NON_GST_REASONS.includes(d.nonGstReason)) e.nonGstReason = 'Select a reason from the list.';
    else if (d.nonGstReason === 'other' && !str(d.nonGstReasonText)) e.nonGstReasonText = 'Describe the reason for non-registration.';
  }
  const a = d.declaration206ab ?? {};
  if (!a.entityType) e.entityType = 'Select your entity type.';
  else if (!ENTITY_TYPES.includes(a.entityType)) e.entityType = 'Select an entity type from the list.';
  for (const k of ['2425', '2324'] as const) {
    const fy = k === '2425' ? 'FY 2024-25' : 'FY 2023-24';
    const filed = a[`itrFiled${k}`];
    if (filed !== 'yes' && filed !== 'no') e[`itrFiled${k}`] = `Tell us whether the ${fy} return was filed.`;
    else if (filed === 'yes') {
      if (!str(a[`itrAck${k}`])) e[`itrAck${k}`] = `Enter the ${fy} ITR acknowledgement number.`;
      if (!str(a[`itrDate${k}`])) e[`itrDate${k}`] = `Enter the ${fy} filing date.`;
    } else if (!str(a[`itrReason${k}`])) e[`itrReason${k}`] = `Tell us why the ${fy} return was not filed.`;
  }
  if (a.tdsOver50k !== 'yes' && a.tdsOver50k !== 'no') e.tdsOver50k = 'Answer the TDS/TCS question.';
  if (!str(a.declarantName)) e.declarantName = 'Enter the authorised signatory name.';
  if (!str(a.declarationDate)) e.declarationDate = 'Enter the declaration date.';
  if (!str(a.declarationPlace)) e.declarationPlace = 'Enter the place of declaration.';
  if (d.msmeRegistered === true || d.msmeRegistered === 'yes') {
    if (!str(d.msmeNumber)) e.msmeNumber = 'Udyam Registration Number is required.';
    else if (!isUdyam(d.msmeNumber)) e.msmeNumber = 'Udyam number must look like UDYAM-XX-00-0000000.';
  }
  if (!d.bankVerification?.verified) {
    need('bankAccountName', 'Bank Account Name');
    need('bankName', 'Bank Name');
    need('branchName', 'Branch Name');
    const acct = str(d.accountNumber);
    if (!acct) e.accountNumber = 'Account Number is required.';
    else if (!RE.acct.test(acct)) e.accountNumber = 'Account Number should be 6 to 20 digits.';
    if (!str(d.ifsc)) e.ifsc = 'IFSC Code is required.';
    else if (!isIfsc(d.ifsc)) e.ifsc = 'IFSC must look like HDFC0001234.';
  } else if (!str(d.accountNumber)) {
    e.accountNumber = 'Bank account verification did not return an account number. Please re-run verification.';
  }
  return e;
}

const COMPLETION_FIELDS = ['legalEntityName', 'businessType', 'registeredAddress', 'contactPerson', 'email', 'pan', 'gstStatus', 'bankAccountName', 'bankName', 'accountNumber', 'ifsc', 'branchName'];

/** GET /vendor/me's vendor: vendorSelfView plus the password, checklist and completion extras. */
function selfView(v: VendorRecord): Vendor {
  const d = v.data;
  const have = new Set(v.docs.map((x) => x.docType));
  const need = requiredDocs(d);
  const done = COMPLETION_FIELDS.filter((f) => str(d[f])).length + need.filter((t) => have.has(t)).length;
  const bv = d.bankVerification;
  return {
    id: v.id,
    status: v.status,
    contactNumber: v.contactPhone,
    email: v.email,
    vendorCode: v.vendorCode,
    business: {
      legalEntityName: d.legalEntityName || '',
      tradeName: d.tradeName || '',
      businessType: d.businessType || '',
      brandName: d.brandName || '',
      registeredAddress: d.registeredAddress || '',
      contactPerson: d.contactPerson || '',
      designation: d.designation || '',
      pocEmail: d.pocEmail || '',
    },
    tax: {
      pan: d.pan || '',
      panLinkedToAadhaar: d.panLinkedToAadhaar ?? null,
      panHolderType: panHolderType(d.pan),
      panAadhaarCheck: d.panAadhaarCheck ? { status: d.panAadhaarCheck.status, at: d.panAadhaarCheck.at || null, note: d.panAadhaarCheck.note || '' } : null,
    },
    gst: {
      status: d.gstStatus === 'registered' || d.gstStatus === 'not_registered' ? d.gstStatus : '',
      gstin: d.gstin || '',
      nonGstReason: d.nonGstReason || '',
      nonGstReasonText: d.nonGstReasonText || '',
    },
    kyc: {
      status: d.kyc?.status || 'not_started',
      stages: d.kyc?.stages || {},
      panVerification: d.panVerification || null,
      gstVerification: d.gstVerification || null,
      aadhaarVerification: d.aadhaarVerification || null,
      bankVerification: bv ? { ...bv, accountNumber: maskAccount(bv.accountNumber) } : null,
    },
    declaration206ab: d.declaration206ab || {},
    msme: { registered: d.msmeRegistered === true || d.msmeRegistered === 'yes', number: d.msmeNumber || '' },
    bank: {
      accountName: d.bankAccountName || '',
      bankName: d.bankName || '',
      accountNumber: maskAccount(d.accountNumber),
      ifsc: d.ifsc || '',
      branchName: d.branchName || '',
      verified: !!bv?.verified,
      verifiedAt: bv?.verifiedAt || null,
      source: d.bankDetailsSource || (bv?.verified ? 'digio' : 'manual'),
      holderNameOnBank: bv?.holderNameOnBank || '',
    },
    documents: v.docs.map((x) => ({
      docType: x.docType,
      label: DOC_LABEL[x.docType] || x.docType,
      fileName: x.fileName,
      status: x.status,
      version: x.version,
      uploadedAt: x.uploadedAt,
      remarks: x.remarks || '',
      generated: x.generated,
      reference: x.signature?.reference || null,
      signedAt: x.signature?.signedAt || null,
      signedBy: x.signature?.signatoryName || null,
    })),
    correction: d.correction || null,
    rejection: v.status === 'rejected' ? { reason: d.rejectionReason || '', at: d.rejectedAt || null } : null,
    approvedAt: d.approvedAt || null,
    submittedAt: d.submittedAt || null,
    hasPassword: v.hasPassword,
    googleLinked: false,
    checklist: need.map((t) => ({ docType: t, label: DOC_LABEL[t] ?? t, required: true, uploaded: have.has(t) })),
    profileCompletion: Math.round((done / (COMPLETION_FIELDS.length + need.length)) * 100),
  };
}

// ── Guards shared by several routes ──────────────────────────────────────────
const UNDER_REVIEW: VendorStatus[] = ['submitted', 'pending_verification'];

/** vendor.js assertEditable: null when the registration may change, else the refusal. */
function notEditable(v: VendorRecord) {
  if (v.status === 'approved') return 'Your registration is approved. Use Request a Change to update verified details.';
  if (UNDER_REVIEW.includes(v.status)) return 'Your registration cannot be edited right now.';
  return null;
}

// PUT /vendor/registration's allowlist (vendor.js VENDOR_WRITABLE) and the annexure's own fields.
const WRITABLE = [
  'legalEntityName', 'tradeName', 'businessType', 'brandName', 'constitution', 'entityType',
  'contactPerson', 'designation', 'email', 'pocEmail', 'alternateEmail', 'alternatePhone', 'website',
  'registeredAddress', 'address', 'addressLine1', 'addressLine2', 'city', 'state', 'pincode', 'country',
  'billingAddress', 'shippingAddress',
  'pan', 'gstStatus', 'gstin', 'nonGstReason', 'nonGstReasonText',
  'msmeRegistered', 'msmeNumber', 'msmeStatus', 'udyamNumber', 'msmeCategory',
  'accountName', 'bankAccountName', 'bankName', 'accountNumber', 'confirmAccountNumber', 'ifsc', 'branchName',
  'natureOfServices', 'servicesOffered', 'categories', 'remarks', 'notes',
  'declaration206ab',
  'itrFiled2425', 'itrAck2425', 'itrDate2425', 'itrReason2425',
  'itrFiled2324', 'itrAck2324', 'itrDate2324', 'itrReason2324', 'tdsOver50k',
  'declarantName', 'declarationDate', 'declarationPlace', 'declarationCapacity',
  'currentStep', 'draftStep', 'lastSavedStep',
];
const D206_WRITABLE = ['entityType', 'itrFiled2425', 'itrAck2425', 'itrDate2425', 'itrReason2425', 'itrFiled2324', 'itrAck2324', 'itrDate2324', 'itrReason2324', 'tdsOver50k', 'declarantName', 'declarationDate', 'declarationPlace'];

// vendor.js CRITICAL_FIELDS + normalizeChangeValue.
const CRITICAL_FIELDS = ['legalEntityName', 'contactNumber', 'pan', 'gstin', 'gstStatus', 'msmeRegistered', 'msmeNumber', 'accountNumber', 'ifsc', 'bankName', 'bankAccountName'];
function normalizeChangeValue(field: string, raw: unknown): { value: string } | { error: string } {
  const s = str(raw);
  if (!s) return { error: 'Enter the new value.' };
  switch (field) {
    case 'legalEntityName':
    case 'bankName':
    case 'bankAccountName':
      return s.length > 200 ? { error: 'That is too long.' } : { value: s };
    case 'pan':
      return isPan(s) ? { value: up(s) } : { error: 'PAN must look like ABCDE1234F.' };
    case 'gstin':
      return isGstin(s) ? { value: up(s) } : { error: 'GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5.' };
    case 'ifsc':
      return isIfsc(s) ? { value: up(s) } : { error: 'IFSC must look like HDFC0001234.' };
    case 'msmeNumber':
      return isUdyam(s) ? { value: up(s) } : { error: 'Udyam number must look like UDYAM-XX-00-0000000.' };
    case 'accountNumber': {
      const digits = s.replace(/[\s-]/g, '');
      return RE.acct.test(digits) ? { value: digits } : { error: 'Account number should be 6 to 20 digits.' };
    }
    case 'gstStatus':
      return ['registered', 'not_registered'].includes(s) ? { value: s } : { error: 'GST status must be "registered" or "not_registered".' };
    case 'msmeRegistered': {
      const t = s.toLowerCase();
      if (['yes', 'true', '1'].includes(t)) return { value: 'true' };
      if (['no', 'false', '0'].includes(t)) return { value: 'false' };
      return { error: 'MSME status must be yes or no.' };
    }
    default:
      return { error: 'That field cannot be changed this way.' };
  }
}

// ── WhatsApp codes (server.js /auth/phone/*): every code is 123456 ───────────────
const challenges = new Map<string, string>();
const PROOF_PREFIX = 'demo-proof:';

// ── The routes ───────────────────────────────────────────────────────────────
type VendorHandler = (v: VendorRecord, p: string[], body: DemoBody) => unknown;

/** The vendor demo's routes; `token` gives the token of the request being answered (demo/server.ts). */
export function vendorRoutes(token: () => string | null): Route[] {
  // vendor.js requireVendor: the session's vendor, or the refusals the app knows how to handle.
  const current = (): VendorRecord | null => {
    const t = token();
    if (!t || !t.startsWith(VENDOR_DEMO_TOKEN_PREFIX)) return null;
    const id = t.slice(VENDOR_DEMO_TOKEN_PREFIX.length);
    return isVendorPersonaId(id) ? vendorRecord(id) : null;
  };
  const vendor =
    (h: VendorHandler): Handler =>
    (p, body) => {
      const v = current();
      if (!v) return fail(SESSION_GONE, 401);
      if (v.status === 'inactive') return fail('This vendor account has been deactivated. Please contact us.', 403);
      return h(v, p, body && typeof body === 'object' ? body : {});
    };
  const doc = (v: VendorRecord, docType: string) => v.docs.find((d) => d.docType === docType);
  const agreementOf = (v: VendorRecord, id: string) => v.agreements.find((a) => a.id === id);

  return [
    // ── Shared WhatsApp verification ──
    [
      'POST',
      /^\/auth\/phone\/send-otp$/,
      (_p, body) => {
        const digits = String(body?.phone ?? '').replace(/\D/g, '');
        if (digits.length < 10) return fail('Enter a valid mobile number.', 400);
        const prev = typeof body?.resendChallengeId === 'string' && challenges.has(body.resendChallengeId) ? body.resendChallengeId : null;
        const challengeId = prev ?? newId('demo-otp-');
        challenges.set(challengeId, digits.slice(-10));
        return { ok: true, challengeId };
      },
    ],
    [
      'POST',
      /^\/auth\/phone\/verify-otp$/,
      (_p, body) => {
        const id = String(body?.challengeId ?? '');
        const phone = challenges.get(id);
        if (!phone) return fail('That verification attempt has expired. Please request a new code.', 410);
        if (str(body?.code) !== DEMO_CODE) return wrongCode();
        challenges.delete(id);
        return { ok: true, proofToken: `${PROOF_PREFIX}${phone}` };
      },
    ],

    // ── Account ──
    ['GET', /^\/vendor\/auth\/mode$/, () => ({ ok: true, otpBypass: false })],
    ['POST', /^\/vendor\/auth\/logout$/, () => ({ ok: true })],
    [
      'POST',
      /^\/vendor\/auth\/set-password$/,
      vendor((v, _p, body) => {
        if (String(body.password ?? '').length < 6) return fail('Password must be at least 6 characters.', 400);
        v.hasPassword = true;
        return { ok: true };
      }),
    ],
    ['GET', /^\/vendor\/me$/, vendor((v) => ({ ok: true, vendor: selfView(v) }))],

    // ── Registration (vendor.js PUT /registration, POST /registration/submit) ──
    [
      'PUT',
      /^\/vendor\/registration$/,
      vendor((v, _p, input) => {
        if (v.status === 'approved') return fail('Your registration is approved. Use Request a Change to update verified details.', 409);
        if (UNDER_REVIEW.includes(v.status)) return fail('Your registration is being verified and cannot be edited right now.', 409);
        const body: Record<string, unknown> = {};
        for (const k of Object.keys(input)) if (WRITABLE.includes(k)) body[k] = input[k];
        if (body.declaration206ab !== undefined) {
          const src = body.declaration206ab && typeof body.declaration206ab === 'object' && !Array.isArray(body.declaration206ab) ? (body.declaration206ab as Record<string, unknown>) : {};
          body.declaration206ab = {
            ...(v.data.declaration206ab ?? {}),
            ...Object.fromEntries(Object.entries(src).filter(([k]) => D206_WRITABLE.includes(k))),
          };
        }
        if (body.pocEmail !== undefined) {
          const poc = str(body.pocEmail).toLowerCase();
          body.pocEmail = poc;
          if (poc && !isEmail(poc)) {
            return { ...fail('Enter a valid Tamada POC email address.', 400), fieldErrors: { pocEmail: 'Enter a valid Tamada POC email address.' } };
          }
          if (poc && poc !== str(v.data.pocEmail).toLowerCase() && !onRoster(poc)) {
            return { ...fail(POC_NOT_ON_ROSTER, 400), fieldErrors: { pocEmail: POC_NOT_ON_ROSTER } };
          }
        }
        if (body.confirmAccountNumber !== undefined) {
          if (str(body.confirmAccountNumber) !== str(body.accountNumber ?? v.data.accountNumber)) {
            return { ...fail('Account numbers do not match.', 400), fieldErrors: { confirmAccountNumber: 'Account numbers do not match.' } };
          }
          delete body.confirmAccountNumber;
        }
        const at = nowIso();
        const merged: VendorData = { ...v.data, ...body, updatedAt: at };
        if (merged.pan) merged.pan = up(merged.pan);
        if (merged.gstin) merged.gstin = up(merged.gstin);
        if (merged.ifsc) merged.ifsc = up(merged.ifsc);
        // A hand-typed account that differs from the penny-dropped one retires the bank's confirmation.
        const bvPrev = v.data.bankVerification;
        if (bvPrev?.verified && body.accountNumber !== undefined) {
          const typed = str(body.accountNumber);
          const typedIfsc = up(body.ifsc ?? v.data.ifsc ?? '');
          if (typed && (typed !== str(bvPrev.accountNumber) || (typedIfsc && typedIfsc !== up(bvPrev.ifsc)))) {
            merged.bankVerification = { ...bvPrev, verified: false, supersededByManualEntry: true, supersededAt: at };
            merged.bankDetailsSource = 'manual';
          }
        }
        v.data = merged;
        if (isEmail(body.email)) v.email = str(body.email);
        return { ok: true, saved: true };
      }),
    ],
    [
      'POST',
      /^\/vendor\/registration\/submit$/,
      vendor((v) => {
        if (v.status === 'approved') return fail('Your registration is already approved.', 409);
        if (UNDER_REVIEW.includes(v.status)) return fail('Your registration has already been submitted.', 409);
        const d = v.data;
        const fieldErrors = validateRegistration(d, v.contactPhone);
        if (!fieldErrors.pocEmail && d.pocEmail && !onRoster(d.pocEmail)) fieldErrors.pocEmail = POC_NOT_ON_ROSTER;
        if (Object.keys(fieldErrors).length) return { ...fail('Some details still need attention.', 400), fieldErrors };
        const have = new Set(v.docs.map((x) => x.docType));
        const missing = requiredDocs(d).filter((t) => !have.has(t));
        if (missing.length) {
          return { ...fail('Some required documents are missing.', 400), missingDocuments: missing.map((t) => ({ docType: t, label: DOC_LABEL[t] ?? t })) };
        }
        v.status = 'pending_verification';
        v.data = { ...d, submittedAt: nowIso(), correction: null };
        if (!v.vendorCode) v.vendorCode = assignVendorCode();
        return {
          ok: true,
          status: 'pending_verification',
          vendorCode: v.vendorCode,
          message: 'Your registration has been submitted and is currently under verification.',
        };
      }),
    ],

    // ── Documents (vendor.js /documents, /declarations) ──
    [
      'POST',
      /^\/vendor\/documents$/,
      vendor((v, _p, body) => {
        if (v.status === 'approved') return fail('Your registration is approved. Use Request a Change to replace a verified document.', 409);
        if (UNDER_REVIEW.includes(v.status)) return fail('Your registration is being verified and documents cannot be changed right now.', 409);
        const docType = String(body.docType ?? '');
        if (!DOC_TYPES.includes(docType)) return fail('Unknown document type.', 400);
        if (GENERATED.includes(docType)) return fail('This declaration is completed and signed in the portal — there is nothing to upload.', 409);
        if (!body.fileData) return fail('No file was received.', 400);
        const mime = String(body.mimeType ?? '').toLowerCase();
        if (mime && !ALLOWED_MIME.includes(mime)) return fail('Upload a PDF, JPG or PNG.', 400);
        const b64 = String(body.fileData).replace(/^data:[^;]+;base64,/, '');
        if (b64Bytes(b64) > MAX_DOC_BYTES) return fail('That file is larger than 8 MB. Please upload a smaller scan.', 413);
        const row = putDoc(v, {
          docType,
          fileName: String(body.fileName ?? '').slice(0, 180) || DOC_LABEL[docType] || docType,
          mimeType: mime || 'application/octet-stream',
          fileData: b64,
          status: 'pending',
          uploadedAt: nowIso(),
          remarks: '',
          generated: false,
          signature: null,
        });
        return { ok: true, document: { docType, label: DOC_LABEL[docType], fileName: row.fileName, status: 'pending', version: row.version } };
      }),
    ],
    [
      'GET',
      /^\/vendor\/documents\/([^/]+)$/,
      vendor((v, p): (FilePayload & { docType: string; status: string; version: number }) | ReturnType<typeof notFound> => {
        const d = doc(v, p[1] ?? '');
        if (!d) return notFound('Document not found.');
        return { ok: true, docType: d.docType, fileName: d.fileName, mimeType: d.mimeType, fileData: d.fileData, status: d.status, version: d.version };
      }),
    ],
    [
      'GET',
      /^\/vendor\/declarations\/([^/]+)\/preview$/,
      vendor((v, p) => {
        const type = p[1] ?? '';
        if (!GENERATED.includes(type)) return fail('Unknown declaration.', 400);
        const d = v.data;
        if (type === 'non_gst_declaration') {
          if (d.gstStatus !== 'not_registered') return fail('This declaration only applies to vendors who are not registered under GST.', 409);
          const reason = d.nonGstReason === 'other' ? str(d.nonGstReasonText) : NON_GST_REASON_TEXT[d.nonGstReason ?? ''] ?? '';
          if (!reason) return fail('Add your reason for not being registered under GST first.', 400);
          const out: DeclarationPreview = {
            ok: true,
            type,
            title: 'Declaration — Non-requirement of registration under GST',
            addressedTo: COMPANY_NAME,
            lines: [
              'We have received your communication asking us to provide details of GST registrations such as the GST registration number, GST registration certificate and the address registered under GST obtained by us.',
              `In this regard, we hereby state that since ${reason}, we are not required to get ourselves registered under the GST Act.`,
              'We request you to treat this communication as a declaration regarding non-requirement to be registered under the Act.',
            ],
            facts: [
              ['Entity', d.legalEntityName || '—'],
              ['PAN', d.pan || '—'],
              ['Reason', reason],
            ],
          };
          return out;
        }
        const a = d.declaration206ab ?? {};
        const yn = (x?: string) => (x === 'yes' ? 'Yes' : x === 'no' ? 'No' : '—');
        const out: DeclarationPreview = {
          ok: true,
          type: 'declaration_206ab',
          title: 'Declaration under Section 206AB',
          addressedTo: COMPANY_NAME,
          lines: [
            'I/We declare that the information below is true and correct to the best of my/our knowledge and belief, and will inform you of any change within 15 days.',
            `I/We undertake to indemnify ${COMPANY_NAME} against any demand of tax, interest or penalty arising from incorrect information provided here.`,
          ],
          facts: [
            ['Entity Name', d.legalEntityName || '—'],
            ['PAN', d.pan || '—'],
            ['Registered Office', d.registeredAddress || '—'],
            ['Type of Entity', a.entityType || '—'],
            ['ITR filed — FY 2024-25', yn(a.itrFiled2425)],
            ...((a.itrFiled2425 === 'yes'
              ? [
                  ['Acknowledgement (FY 2024-25)', a.itrAck2425 || '—'],
                  ['Filed on', fmtDate(a.itrDate2425)],
                ]
              : [['Reason not filed (FY 2024-25)', a.itrReason2425 || '—']]) as [string, string][]),
            ['ITR filed — FY 2023-24', yn(a.itrFiled2324)],
            ...((a.itrFiled2324 === 'yes'
              ? [
                  ['Acknowledgement (FY 2023-24)', a.itrAck2324 || '—'],
                  ['Filed on', fmtDate(a.itrDate2324)],
                ]
              : [['Reason not filed (FY 2023-24)', a.itrReason2324 || '—']]) as [string, string][]),
            ['TDS/TCS Rs. 50,000 or more', yn(a.tdsOver50k)],
          ],
        };
        return out;
      }),
    ],
    [
      'POST',
      /^\/vendor\/declarations\/([^/]+)\/sign$/,
      vendor((v, p, body) => {
        const type = p[1] ?? '';
        if (!GENERATED.includes(type)) return fail('Unknown declaration.', 400);
        if (v.status === 'approved') return fail('Your registration is approved. Use Request a Change to revise a signed declaration.', 409);
        if (UNDER_REVIEW.includes(v.status)) return fail('Your registration is being verified and cannot be changed right now.', 409);
        if (type === 'non_gst_declaration' && v.data.gstStatus !== 'not_registered') {
          return fail('This declaration only applies to vendors who are not registered under GST.', 409);
        }
        const signatoryName = str(body.signatoryName);
        const place = str(body.place);
        if (!signatoryName) return fail('Enter the name of the authorised signatory.', 400);
        if (!place) return fail('Enter the place of signing.', 400);
        if (body.agreed !== true) return fail('Tick the declaration box to confirm the details are true and correct.', 400);
        const signedAt = nowIso();
        const ref = reference(`${v.id}:${type}:${signatoryName}:${signedAt}`);
        const row: DocRow = putDoc(v, {
          docType: type,
          fileName: `${type === 'declaration_206ab' ? '206AB-Declaration-' : 'Non-GST-Declaration-'}${ref}.pdf`,
          mimeType: 'application/pdf',
          fileData: DECLARATION_PDF,
          status: 'pending',
          uploadedAt: signedAt,
          remarks: '',
          generated: true,
          signature: { reference: ref, signedAt, signatoryName },
        });
        return {
          ok: true,
          document: { docType: type, label: DOC_LABEL[type], fileName: row.fileName, status: 'pending', version: row.version, reference: ref, signedAt },
        };
      }),
    ],

    // ── KYC (Digio, simulated) ──
    [
      'POST',
      /^\/vendor\/kyc\/start$/,
      vendor((v, _p, body) => {
        const blocked = notEditable(v);
        if (blocked) return fail(blocked, 409);
        if (body.stage !== 'identity') return fail('Unknown verification stage.', 400);
        const gstStatus = body.gstStatus === 'registered' || body.gstStatus === 'not_registered' ? body.gstStatus : v.data.gstStatus;
        if (!gstStatus) {
          return { ...fail('Select your GST registration status.', 400), fieldErrors: { gstStatus: 'Select GST registered or NON GST.' } };
        }
        startKycStage(v, gstStatus, nowIso());
        const requestId = v.data.kyc?.stages?.identity?.requestId ?? '';
        // Never opened: in the demo the check finishes on the phone (features/vendor/kyc.tsx).
        return { ok: true, redirectUrl: 'about:blank', requestId, stage: 'identity' };
      }),
    ],
    [
      'GET',
      /^\/vendor\/kyc\/status$/,
      vendor((v): KycStatus => {
        // The demo's Digio: a started check is finished by the first status call.
        if (v.data.kyc?.stages?.identity?.status === 'in_progress') completeKyc(v, nowIso());
        const d = v.data;
        const stages = d.kyc?.stages ?? {};
        return {
          ok: true,
          status: stages.identity?.status === 'completed' ? 'completed' : d.kyc?.status || 'not_started',
          stages,
          gstVerification: d.gstVerification || null,
          panVerification: d.panVerification || null,
          aadhaarVerification: d.aadhaarVerification || null,
          bankVerification: d.bankVerification || null,
          digioStatus: '',
        };
      }),
    ],

    // ── Change requests (approved vendors only) ──
    [
      'GET',
      /^\/vendor\/change-requests$/,
      vendor((v) => {
        const changeRequests: ChangeRequest[] = [...v.changeRequests].sort((a, b) => Date.parse(b.requested_at) - Date.parse(a.requested_at));
        return { ok: true, changeRequests };
      }),
    ],
    [
      'POST',
      /^\/vendor\/change-requests$/,
      vendor((v, _p, body) => {
        if (v.status !== 'approved') return fail('Change requests apply to approved registrations only.', 409);
        const field = String(body.field ?? '');
        if (!CRITICAL_FIELDS.includes(field)) return fail('That field cannot be changed this way.', 400);
        if (!str(body.newValue)) return fail('Enter the new value.', 400);
        if (field === 'contactNumber') return fail('Use Change Contact Number, which verifies the new number by OTP first.', 400);
        const norm = normalizeChangeValue(field, body.newValue);
        if ('error' in norm) return { ...fail(norm.error, 400), fieldErrors: { [field]: norm.error } };
        const prev = field === 'accountNumber' ? maskAccount(v.data.accountNumber) : String(v.data[field] ?? '');
        v.changeRequests = [
          {
            id: newId('vcr'),
            field,
            prev_value: prev,
            new_value: norm.value,
            status: 'pending',
            reason: str(body.reason),
            requested_at: nowIso(),
            reviewed_at: null,
            review_note: null,
          },
          ...v.changeRequests,
        ];
        return { ok: true, submitted: true, message: 'Your change request has been sent to our Accounts team for review.' };
      }),
    ],

    // ── Bills (read-only for vendors: raised by the Tamada employee who submits them) ──
    [
      'GET',
      /^\/vendor\/bills$/,
      vendor((v) => {
        const bills: VendorBill[] = v.bills.map((b) => b.bill).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        return { ok: true, bills };
      }),
    ],
    [
      'GET',
      /^\/vendor\/bills\/versions\/([^/]+)\/file$/,
      vendor((v, p) => {
        const row = v.bills.find((b) => b.bill.version?.id === p[1]);
        if (!row) return notFound('File not found.');
        const out: FilePayload = { ok: true, ...row.file };
        return out;
      }),
    ],

    // ── Agreements (vendor_agreements.js) ──
    [
      'GET',
      /^\/vendor\/agreements$/,
      vendor((v) => {
        const agreements: VendorAgreement[] = v.agreements
          .map(({ draft_file_data: _d, signature_file_data: _s, signature_mime_type: _m, ...a }) => a)
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        return { ok: true, agreements };
      }),
    ],
    [
      'GET',
      /^\/vendor\/agreements\/([^/]+)\/draft$/,
      vendor((v, p) => {
        const a = agreementOf(v, p[1] ?? '');
        if (!a) return notFound('Agreement not found.');
        const out: FilePayload = { ok: true, fileName: a.draft_file_name ?? 'Agreement.pdf', mimeType: a.draft_mime_type ?? 'application/pdf', fileData: a.draft_file_data };
        return out;
      }),
    ],
    [
      'GET',
      /^\/vendor\/agreements\/([^/]+)\/signature$/,
      vendor((v, p) => {
        const a = agreementOf(v, p[1] ?? '');
        if (!a) return notFound('Agreement not found.');
        if (!a.signature_file_data) return notFound('This agreement has not been signed yet.');
        return { ok: true, signatureType: a.signature_type, mimeType: a.signature_mime_type || 'image/png', fileData: a.signature_file_data, signedAt: a.signed_at };
      }),
    ],
    [
      'POST',
      /^\/vendor\/agreements\/([^/]+)\/sign$/,
      vendor((v, p, body) => {
        const a = agreementOf(v, p[1] ?? '');
        if (!a) return notFound('Agreement not found.');
        if (a.status !== 'pending_signature') return fail('This agreement has already been signed.', 409);
        if (a.deadline_at && Date.now() > Date.parse(a.deadline_at)) {
          return fail('The signing deadline for this agreement has passed. Contact whoever sent it to request an extension.', 409);
        }
        const signatureType = body.signatureType === 'uploaded' ? 'uploaded' : body.signatureType === 'drawn' ? 'drawn' : null;
        if (!signatureType) return fail('signatureType must be "drawn" or "uploaded".', 400);
        if (!body.signatureFileData) return fail('A signature is required.', 400);
        const m = /^data:([^;]+);base64,(.+)$/s.exec(String(body.signatureFileData));
        const mime = m ? (m[1] ?? '').toLowerCase() : 'image/png';
        const b64 = m ? (m[2] ?? '') : String(body.signatureFileData);
        if (b64Bytes(b64) > MAX_SIGNATURE_BYTES) return fail('That signature image is too large.', 413);
        if (!SIGNATURE_MIME.includes(mime)) return fail('Signature must be a PNG or JPG image.', 400);
        const proof = str(body.proofToken);
        if (!proof) return fail('Enter the WhatsApp code to confirm your signature.', 400);
        if (!proof.startsWith(PROOF_PREFIX)) return fail('That code has expired. Please request a new one.', 401);
        if (last10(proof.slice(PROOF_PREFIX.length)) !== last10(v.contactPhone)) {
          return fail('That verification does not match your account’s mobile number.', 401);
        }
        const signedAt = nowIso();
        // With a named Tamada countersigner it waits for them; otherwise the vendor's signature finishes it.
        const status = a.signer_name ? 'pending_internal_signature' : 'signed';
        Object.assign(a, {
          status,
          signature_type: signatureType,
          signature_mime_type: mime,
          signature_file_data: b64,
          signature_reference: reference(`${a.id}:${signedAt}:${v.id}`),
          signed_at: signedAt,
        });
        return { ok: true, status };
      }),
    ],
  ];
}
