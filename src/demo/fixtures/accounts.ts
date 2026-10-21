// Demo API for the Accounts domain (docs/port/accounts.md §6). Persona: Afzal Accounts (`accounts`); Afzal
// Super Admin sees the same data (vendor bills to act on, petty cash and claims view only, no
// registrations — the website's own menu). Every other persona is refused exactly as the server refuses.
//
//   vendor.js            /accounts/vendors (+ detail, documents, PAN–Aadhaar, checklist, approve, reject,
//                        corrections, deactivate / reactivate), /accounts/change-requests/:id
//   vendor_bills.js      /vendor-bills/vendors, accounts-all, accept / reject, payment/start, settings,
//                        by-vendor, :id history, versions/:id/file
//   vendor_agreements.js /vendor-agreements/mine, pending-my-signature, draft / signatures, deadline, sign
//   reimbursements.js    /reimbursements/accounts-all, accounts-authorize / reject, payment/start
//   server.js            petty cash accounts-approve / reject, payment/start, old bills approve / reject,
//                        the company's bill submissions, the expense report (with `canReject`), rejecting one
//                        bill (which shrinks or closes an extra claim), expense types (add, switch, delete)
//
// Shared data is read and changed only through the exported stores: the vendor portal's records
// (demo/vendor/data vendorRecord — approving a registration here flips the vendor persona until it is
// picked again), petty cash (pettyStore, pettyBillStore, pettySubmissionStore, expenseHeadStore,
// setPettyStage) and expense claims (reimbursementStore, setReimbursementStage). Colleagues' items are
// added to those stores once, below. Nothing is emailed; the screens say who would be.

import type {
  AccountsAgreement,
  AccountsBill,
  AccountsBillVersion,
  AccountsVendor,
  AccountsVendorDoc,
  AccountsVendorRow,
  BillPayment,
  BillSettings,
  PanAadhaarCheck,
  VendorAuditRow,
  VendorDuplicate,
} from '@/api/accounts';
import type { PettyCashHeadLine, PettyCashHistoryEntry, PettyCashStatement, PettyCashStatementSheet } from '@/api/petty-cash';
import type { HistoryEntry, Reimbursement } from '@/api/reimbursements';
import type { ChangeRequest, VendorBill } from '@/api/vendor';
import { DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { ownerOf, personById, projectByCode, projectById } from '@/demo/fixtures/org';
import {
  type DemoPettyRequest,
  type DemoPettySubmission,
  expenseHeadStore,
  pettyBillStore,
  pettyStore,
  pettySubmissionStore,
  setPettyStage,
} from '@/demo/fixtures/petty-cash';
import { reimbursementStore, setReimbursementStage } from '@/demo/fixtures/reimbursements';
import { currentPersona } from '@/demo/personas';
import { addDays, daysAgo, epochId, fail, hex6, newId, notFound, nowIso, RECEIPT_PNG, type Route, today } from '@/demo/state';
import { assignVendorCode, DOC_LABEL, type DocRow, reference, type VendorPersonaId, vendorRecord, type VendorRecord } from '@/demo/vendor/data';
import { DOCUMENT_PDF, INVOICE_PDF } from '@/demo/vendor/files';

const ME = { id: DEMO_USER.id, name: String(DEMO_USER.name) };
const RAMESH = { id: 'u-ramesh', name: 'Ramesh Gupta' };
const role = () => currentPersona().role;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const later = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3600000).toISOString();
const who = (id: string) => ({ id, name: personById(id)?.name ?? 'Someone' });
const bytesOf = (b64: string) => Math.floor((b64.length * 3) / 4);
const RECEIPT_B64 = RECEIPT_PNG.split(',')[1] ?? '';

// Server role lists (docs/port/accounts.md §2).
const ACCOUNTS_ROLES = ['accounts', 'super_admin', 'master_admin']; // vendor.js:188, vendor_bills.js:36
const REIMB_VIEW = ['accounts', 'super_admin', 'master_admin']; // reimbursements.js:29
const PETTY_ADMIN = ['accounts', 'super_admin', 'master_admin', 'ceo', 'coo']; // server.js:3246
const OVERSEERS = ['super_admin', 'master_admin', 'accounts']; // vendor_agreements.js:61
const isAccounts = () => role() === 'accounts';
const deny = (what: string) => fail(`You do not have permission to ${what}.`, 403);
const gate =
  <A extends unknown[]>(roles: string[], what: string, fn: (...a: A) => unknown) =>
  (...a: A) =>
    roles.includes(role()) ? fn(...a) : deny(what);

// ══ Vendors ══════════════════════════════════════════════════════════════════
// The vendor portal's five "Afzal Studios & Co." records, plus four made-up approved vendors for the
// Vendor Master: one not GST registered whose PAN is not linked to Aadhaar, one MSME, one deactivated,
// and a possible duplicate of Afzal Studios (same PAN, another phone).
const PERSONA_VENDORS: VendorPersonaId[] = ['under_review', 'changes', 'approved', 'registering', 'kyc_pending'];

const FIRM_PAN = 'AFZFA1234D';

type Extra = {
  id: string;
  code: string;
  status: VendorRecord['status'];
  phone: string;
  email: string;
  legal: string;
  trade: string;
  type: string;
  address: string;
  person: string;
  designation: string;
  pan: string;
  holder: string;
  gstin: string;
  msme: string;
  bank: { accountName: string; bankName: string; accountNumber: string; ifsc: string; branchName: string };
  panAadhaar: 'linked' | 'not_linked' | 'not_applicable';
  submitted: number;
  approved: number;
  poc: string;
};

const docRow = (docType: string, at: string, generated = false): DocRow => ({
  docType,
  fileName: `${DOC_LABEL[docType] ?? docType}.pdf`,
  mimeType: 'application/pdf',
  fileData: DOCUMENT_PDF,
  status: 'verified',
  version: 1,
  uploadedAt: at,
  remarks: '',
  generated,
  signature: generated ? { reference: reference(`${docType}:${at}`), signedAt: at, signatoryName: 'Authorised signatory' } : null,
});

function extraVendor(e: Extra): VendorRecord {
  const gst = !!e.gstin;
  const sub = daysAgo(e.submitted, '11:20');
  const appr = daysAgo(e.approved, '16:10');
  const docs = [
    docRow('pan', sub),
    docRow(gst ? 'gst_certificate' : 'aadhaar', sub),
    docRow('bank_proof', sub),
    docRow('declaration_206ab', sub, true),
    ...(gst ? [] : [docRow('non_gst_declaration', sub, true)]),
    ...(e.msme ? [docRow('msme_certificate', sub)] : []),
  ];
  return {
    id: e.id,
    status: e.status,
    contactPhone: e.phone,
    email: e.email,
    vendorCode: e.code,
    hasPassword: true,
    data: {
      email: e.email,
      pocEmail: e.poc,
      legalEntityName: e.legal,
      tradeName: e.trade,
      businessType: e.type,
      brandName: e.trade,
      registeredAddress: e.address,
      contactPerson: e.person,
      designation: e.designation,
      pan: e.pan,
      panAadhaarCheck: { status: e.panAadhaar, at: sub, note: e.panAadhaar === 'not_applicable' ? 'PAN–Aadhaar linking applies only to individual PANs.' : '' },
      panLinkedToAadhaar: e.panAadhaar === 'linked' ? true : e.panAadhaar === 'not_linked' ? false : null,
      gstStatus: gst ? 'registered' : 'not_registered',
      gstin: e.gstin,
      nonGstReason: gst ? '' : 'turnover_below_limit',
      nonGstReasonText: '',
      msmeRegistered: !!e.msme,
      msmeNumber: e.msme,
      bankAccountName: e.bank.accountName,
      bankName: e.bank.bankName,
      accountNumber: e.bank.accountNumber,
      ifsc: e.bank.ifsc,
      branchName: e.bank.branchName,
      bankDetailsSource: 'digio',
      panVerification: { verified: true, verifiedAt: sub, pan: e.pan, holderName: e.holder },
      gstVerification: gst ? { verified: true, verifiedAt: sub, legalName: e.legal, gstin: e.gstin } : null,
      aadhaarVerification: gst ? null : { verified: true, verifiedAt: sub, nameOnAadhaar: e.person, last4: '7782', address: e.address },
      bankVerification: { verified: true, verifiedAt: sub, holderNameOnBank: e.bank.accountName },
      declaration206ab: { entityType: gst ? 'Firm' : 'Individual', itrFiled2425: 'yes', itrAck2425: '601234567890123', itrDate2425: '2025-07-30', itrFiled2324: 'yes', itrAck2324: '591234567890123', itrDate2324: '2024-07-29', tdsOver50k: 'no', declarantName: e.person, declarationDate: sub.slice(0, 10), declarationPlace: 'Hyderabad' },
      submittedAt: sub,
      approvedAt: appr,
      approvedBy: RAMESH.name,
      correction: null,
    },
    docs,
    bills: [],
    agreements: [],
    changeRequests: [],
  };
}

const EXTRA_VENDORS: VendorRecord[] = [
  extraVendor({
    id: 'vnd-acct-lakshmi',
    code: 'TM/V-007',
    status: 'approved',
    phone: '+919849012345',
    email: 'lakshmi.lightgrip@example.com',
    legal: 'Lakshmi Light & Grip',
    trade: 'Lakshmi Light & Grip',
    type: 'Individual',
    address: '4-1-12, Ameerpet, Hyderabad, Telangana 500016',
    person: 'Lakshmi Narayana',
    designation: 'Proprietor',
    pan: 'LKNPN4821Q',
    holder: 'LAKSHMI NARAYANA',
    gstin: '',
    msme: '',
    bank: { accountName: 'LAKSHMI NARAYANA', bankName: 'Canara Bank', accountNumber: '1203101098765', ifsc: 'CNRB0001203', branchName: 'Ameerpet' },
    panAadhaar: 'not_linked',
    submitted: 210,
    approved: 205,
    poc: 'deepa.menon.demo@tamadamedia.com',
  }),
  extraVendor({
    id: 'vnd-acct-deccan',
    code: 'TM/V-011',
    status: 'approved',
    phone: '+919000123456',
    email: 'accounts@deccandrone.example',
    legal: 'Deccan Drone Works LLP',
    trade: 'Deccan Drone Works',
    type: 'LLP',
    address: 'Unit 5, Cyber Pearl, HITEC City, Hyderabad, Telangana 500081',
    person: 'Rohit Varma',
    designation: 'Designated Partner',
    pan: 'DDWFD3310K',
    holder: 'DECCAN DRONE WORKS LLP',
    gstin: '36DDWFD3310K1Z2',
    msme: 'UDYAM-TS-02-0045678',
    bank: { accountName: 'DECCAN DRONE WORKS LLP', bankName: 'ICICI Bank', accountNumber: '025105004321', ifsc: 'ICIC0000251', branchName: 'HITEC City' },
    panAadhaar: 'not_applicable',
    submitted: 160,
    approved: 154,
    poc: 'deepa.menon.demo@tamadamedia.com',
  }),
  extraVendor({
    id: 'vnd-acct-royal',
    code: 'TM/V-004',
    status: 'inactive',
    phone: '+919912345670',
    email: 'royalcaterers@example.com',
    legal: 'Royal Caterers',
    trade: 'Royal Caterers',
    type: 'Firm',
    address: 'Lakdikapul, Hyderabad, Telangana 500004',
    person: 'Syed Ameer',
    designation: 'Partner',
    pan: 'RYLFR2201M',
    holder: 'ROYAL CATERERS',
    gstin: '36RYLFR2201M1Z9',
    msme: '',
    bank: { accountName: 'ROYAL CATERERS', bankName: 'Axis Bank', accountNumber: '917020045671234', ifsc: 'UTIB0000045', branchName: 'Lakdikapul' },
    panAadhaar: 'not_applicable',
    submitted: 400,
    approved: 395,
    poc: 'priya.sharma.demo@tamadamedia.com',
  }),
  extraVendor({
    id: 'vnd-acct-afzal-rentals',
    code: 'TM/V-016',
    status: 'approved',
    phone: '+919700011223',
    email: 'rentals@afzalstudios.example',
    legal: 'Afzal Studio Rentals',
    trade: 'Afzal Studio Rentals',
    type: 'Firm',
    address: 'Plot 12, Road No. 7, Film Nagar, Jubilee Hills, Hyderabad, Telangana 500096',
    person: 'Afzal',
    designation: 'Partner',
    pan: FIRM_PAN,
    holder: 'AFZAL STUDIOS AND CO',
    gstin: '36AFZFA1234D2Z4',
    msme: '',
    bank: { accountName: 'AFZAL STUDIOS AND CO', bankName: 'HDFC Bank', accountNumber: '50200087654321', ifsc: 'HDFC0001234', branchName: 'Jubilee Hills' },
    panAadhaar: 'not_applicable',
    submitted: 90,
    approved: 86,
    poc: 'deepa.menon.demo@tamadamedia.com',
  }),
];

const allVendors = (): VendorRecord[] => [...PERSONA_VENDORS.map((id) => vendorRecord(id)), ...EXTRA_VENDORS];
const findVendor = (id: string) => allVendors().find((v) => v.id === id) ?? null;

// vendor.js applicableChecks / panAadhaarState / helpers.
const VERIFICATION_ITEMS = ['pan', 'contact_number', 'bank_details', 'bank_proof', 'gst', 'aadhaar', 'msme', 'declaration_206ab'];
const CORRECTION_ITEMS = ['pan', 'gst', 'msme', 'bank_account', 'bank_proof', 'non_gst_declaration', 'declaration_206ab', 'business_information', 'contact_information', 'other'];
const CHECK_LABEL: Record<string, string> = {
  pan: 'PAN Verified',
  contact_number: 'Contact Number Verified',
  bank_details: 'Bank Details Verified',
  bank_proof: 'Bank Proof Verified',
  gst: 'GST / Non-GST Verified',
  aadhaar: 'Aadhaar Verified',
  msme: 'MSME Certificate Verified',
  declaration_206ab: '206AB Declaration Verified',
};
const msmeOn = (d: VendorRecord['data']) => d.msmeRegistered === true || d.msmeRegistered === 'yes';
function applicableChecks(d: VendorRecord['data']) {
  const items = ['pan', 'contact_number', 'bank_details', 'bank_proof', 'declaration_206ab', 'gst'];
  if (d.gstStatus !== 'registered') items.push('aadhaar');
  if (msmeOn(d)) items.push('msme');
  return items;
}
function panAadhaarState(d: VendorRecord['data']) {
  const st = d.panAadhaarCheck?.status;
  if (st === 'linked' || st === 'not_linked' || st === 'not_applicable') return st;
  if (d.panLinkedToAadhaar === true) return 'linked';
  if (d.panLinkedToAadhaar === false) return 'not_linked';
  return 'unchecked';
}
const HOLDER: Record<string, string> = { P: 'Individual', F: 'Firm', C: 'Company', H: 'HUF', A: 'Association of Persons', T: 'Trust', B: 'Body of Individuals', L: 'Local Authority', J: 'Artificial Juridical Person', G: 'Government' };
const panHolderType = (pan: string) => HOLDER[String(pan || '').charAt(3).toUpperCase()] ?? '';
const REVIEWABLE = ['pending_verification', 'submitted', 'correction_required'];

type Verification = AccountsVendor['verification'];
const verificationOf = (v: VendorRecord): Verification => {
  const d = v.data as VendorRecord['data'] & { verification?: Verification };
  if (!d.verification) {
    // The record under review has most checks ticked already, so approving takes two more taps.
    const done =
      v.status === 'approved' || v.status === 'inactive'
        ? applicableChecks(d)
        : v.status === 'pending_verification'
          ? ['pan', 'contact_number', 'gst', 'declaration_206ab']
          : v.status === 'correction_required'
            ? ['pan', 'contact_number', 'gst']
            : [];
    const at = String(d.submittedAt || nowIso());
    d.verification = Object.fromEntries(done.map((k) => [k, { verified: true, by: RAMESH.name, at: later(at, 20) }]));
  }
  return d.verification;
};

// Registration history (vendor_audit), newest first; actions taken here are added on top.
const AUDIT = new Map<string, VendorAuditRow[]>();
function auditOf(v: VendorRecord): VendorAuditRow[] {
  const mine = AUDIT.get(v.id) ?? [];
  const d = v.data;
  const base: VendorAuditRow[] = [];
  if (d.approvedAt && (v.status === 'approved' || v.status === 'inactive')) base.push({ action: 'approved', actor_name: String(d.approvedBy || RAMESH.name), actor_role: 'accounts', created_at: String(d.approvedAt) });
  if (d.correction?.at) base.push({ action: 'correction_requested', field: (d.correction.items ?? []).join(', '), actor_name: d.correction.by || RAMESH.name, actor_role: 'accounts', created_at: d.correction.at });
  if (d.submittedAt) base.push({ action: 'submitted', actor_name: String(d.contactPerson || 'Vendor'), actor_role: 'vendor', created_at: String(d.submittedAt) });
  return [...mine, ...base].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
const audit = (v: VendorRecord, action: string, extra: Partial<VendorAuditRow> = {}) =>
  AUDIT.set(v.id, [{ action, actor_name: ME.name, actor_role: role(), created_at: nowIso(), ...extra }, ...(AUDIT.get(v.id) ?? [])]);

function duplicatesOf(v: VendorRecord): VendorDuplicate[] {
  const pan = String(v.data.pan || '');
  if (!pan) return [];
  // The persona records are one business at five points in time, not five businesses: they are
  // compared only with the made-up vendors.
  const pool = EXTRA_VENDORS.includes(v) ? [vendorRecord('under_review'), ...EXTRA_VENDORS] : EXTRA_VENDORS;
  return pool
    .filter((o) => o !== v && String(o.data.pan || '') === pan && o.contactPhone !== v.contactPhone)
    .map((o) => ({ id: o.id, legalEntityName: String(o.data.legalEntityName || ''), contactNumber: o.contactPhone, matchedOn: ['PAN'], status: o.status }));
}

const docId = (d: DocRow) => d.docType;
const createdAt = (v: VendorRecord) => String(v.data.submittedAt || v.data.updatedAt || daysAgo(1));

function listRow(v: VendorRecord): AccountsVendorRow {
  const d = v.data;
  return {
    id: v.id,
    vendorCode: v.vendorCode || '',
    legalEntityName: String(d.legalEntityName || ''),
    tradeName: String(d.tradeName || ''),
    contactPerson: String(d.contactPerson || ''),
    pocEmail: String(d.pocEmail || ''),
    contactNumber: v.contactPhone,
    email: v.email || '',
    pan: String(d.pan || ''),
    gstStatus: String(d.gstStatus || ''),
    gstin: String(d.gstin || ''),
    msmeRegistered: msmeOn(d),
    msmeNumber: String(d.msmeNumber || ''),
    panAadhaar: panAadhaarState(d),
    submittedAt: d.submittedAt ? String(d.submittedAt) : null,
    approvedAt: d.approvedAt ? String(d.approvedAt) : null,
    status: v.status,
    createdAt: createdAt(v),
  };
}

function detail(v: VendorRecord): AccountsVendor {
  const d = v.data;
  const pan = String(d.pan || '');
  const gstin = String(d.gstin || '');
  const docs: AccountsVendorDoc[] = v.docs.map((x) => ({
    id: docId(x),
    doc_type: x.docType,
    label: DOC_LABEL[x.docType] ?? x.docType,
    file_name: x.fileName,
    mime_type: x.mimeType,
    file_size: bytesOf(x.fileData),
    status: x.status,
    version: x.version,
    superseded: false,
    uploaded_at: x.uploadedAt,
    generated: x.generated,
    remarks: x.remarks,
    signature: x.signature,
  }));
  const bank = d.bankVerification;
  return {
    id: v.id,
    vendorCode: v.vendorCode,
    status: v.status,
    contactNumber: v.contactPhone,
    email: v.email,
    business: {
      legalEntityName: String(d.legalEntityName || ''),
      tradeName: String(d.tradeName || ''),
      businessType: String(d.businessType || ''),
      brandName: String(d.brandName || ''),
      registeredAddress: String(d.registeredAddress || ''),
      contactPerson: String(d.contactPerson || ''),
      designation: String(d.designation || ''),
      pocEmail: String(d.pocEmail || ''),
    },
    tax: {
      pan,
      panLinkedToAadhaar: (d.panLinkedToAadhaar as boolean | null | undefined) ?? null,
      panHolderType: panHolderType(pan),
      panIsIndividual: pan.charAt(3).toUpperCase() === 'P',
      panAadhaarCheck: (d.panAadhaarCheck as PanAadhaarCheck | null | undefined) ?? null,
    },
    gst: {
      status: String(d.gstStatus || ''),
      gstin,
      gstinMatchesPan: !gstin || !pan || gstin.slice(2, 12).toUpperCase() === pan.toUpperCase(),
      nonGstReason: String(d.nonGstReason || ''),
      nonGstReasonText: String(d.nonGstReasonText || ''),
    },
    kyc: {
      status: String(d.kyc?.status || 'not_started'),
      panVerification: d.panVerification ?? null,
      gstVerification: d.gstVerification ?? null,
      aadhaarVerification: d.aadhaarVerification ?? null,
      bankVerification: bank ? { verified: !!bank.verified, verifiedAt: bank.verifiedAt } : null,
    },
    declaration206ab: d.declaration206ab ?? {},
    msme: { registered: msmeOn(d), number: String(d.msmeNumber || '') },
    bank: {
      accountName: String(d.bankAccountName || ''),
      bankName: String(d.bankName || ''),
      accountNumber: String(d.accountNumber || ''),
      ifsc: String(d.ifsc || ''),
      branchName: String(d.branchName || ''),
      branchAddress: d.branchAddress ? String(d.branchAddress) : undefined,
      verified: !!bank?.verified,
      verifiedAt: bank?.verifiedAt ?? null,
      source: String(d.bankDetailsSource || (bank?.verified ? 'digio' : 'manual')),
      holderNameOnBank: String(bank?.holderNameOnBank || ''),
      nameMatchScore: bank?.verified ? 100 : null,
    },
    documents: docs,
    verification: verificationOf(v),
    applicableChecks: applicableChecks(d),
    correction: d.correction ?? null,
    rejection: { reason: String(d.rejectionReason || ''), by: String(d.rejectedBy || ''), at: d.rejectedAt ? String(d.rejectedAt) : null },
    approval: { by: String(d.approvedBy || (v.status === 'approved' ? RAMESH.name : '')), at: d.approvedAt ? String(d.approvedAt) : null },
    submittedAt: d.submittedAt ? String(d.submittedAt) : null,
    possibleDuplicates: duplicatesOf(v),
    history: auditOf(v),
    changeRequests: v.changeRequests,
  };
}

function listVendors(q: URLSearchParams) {
  const status = q.get('status') || '';
  const needle = String(q.get('q') || '').trim().toLowerCase();
  const flat = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const digits = needle.replace(/\D/g, '');
  let rows = allVendors()
    .filter((v) => !status || status === 'all' || v.status === status)
    .map(listRow);
  if (needle)
    rows = rows.filter(
      (r) =>
        (flat(needle) && flat(r.vendorCode).includes(flat(needle))) ||
        [r.pocEmail, r.legalEntityName, r.tradeName, r.contactPerson, r.email, r.pan, r.gstin].some((x) => x.toLowerCase().includes(needle)) ||
        (!!digits && r.contactNumber.replace(/\D/g, '').includes(digits)),
    );
  const gst = q.get('gst');
  if (gst === 'registered') rows = rows.filter((r) => r.gstStatus === 'registered');
  if (gst === 'not_registered') rows = rows.filter((r) => r.gstStatus === 'not_registered');
  if (q.get('aadhaar') === 'not_linked') rows = rows.filter((r) => r.panAadhaar === 'not_linked');
  if (q.get('msme') === 'yes') rows = rows.filter((r) => r.msmeRegistered);
  if (q.get('msme') === 'no') rows = rows.filter((r) => !r.msmeRegistered);
  const from = q.get('from');
  const to = q.get('to');
  if (from) rows = rows.filter((r) => (r.submittedAt || r.createdAt || '') >= from);
  if (to) rows = rows.filter((r) => (r.submittedAt || r.createdAt || '') <= `${to}T23:59:59Z`);
  rows.sort((a, b) => String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt)));
  return { ok: true, vendors: rows, count: rows.length };
}

const withVendor =
  (fn: (v: VendorRecord, body: Record<string, unknown>, p: string[]) => unknown) =>
  (p: string[], body: unknown) => {
    const v = findVendor(p[1] ?? '');
    if (!v) return notFound('Vendor not found.');
    return fn(v, (body || {}) as Record<string, unknown>, p);
  };

function approve(v: VendorRecord) {
  if (!REVIEWABLE.includes(v.status)) return fail('This registration is not waiting for review.', 409);
  const ver = verificationOf(v);
  const outstanding = applicableChecks(v.data)
    .filter((k) => !ver[k]?.verified)
    .map((item) => ({ item, label: CHECK_LABEL[item] ?? item }));
  if (outstanding.length) return { ...fail('Complete every verification check before approving.', 400), outstanding };
  const at = nowIso();
  v.status = 'approved';
  if (!v.vendorCode) v.vendorCode = assignVendorCode();
  for (const doc of v.docs) doc.status = 'verified';
  Object.assign(v.data, { approvedAt: at, approvedBy: ME.name, correction: null });
  audit(v, 'approved');
  return { ok: true, status: 'approved' };
}

function reject(v: VendorRecord, body: Record<string, unknown>) {
  const reason = String(body.reason || '').trim();
  if (!reason) return fail('Give the reason — the vendor is emailed it.', 400);
  if (!REVIEWABLE.includes(v.status)) return fail('Only a registration waiting for review can be rejected.', 409);
  v.status = 'rejected';
  Object.assign(v.data, { rejectionReason: reason, rejectedBy: ME.name, rejectedAt: nowIso() });
  audit(v, 'rejected', { new_value: reason });
  return { ok: true, status: 'rejected' };
}

const DOC_FOR_ITEM: Record<string, string> = { pan: 'pan', gst: 'gst_certificate', msme: 'msme_certificate', bank_proof: 'bank_proof', non_gst_declaration: 'non_gst_declaration', declaration_206ab: 'declaration_206ab' };
function correction(v: VendorRecord, body: Record<string, unknown>) {
  const items = (Array.isArray(body.items) ? body.items : []).map(String).filter((i) => CORRECTION_ITEMS.includes(i));
  const comments = String(body.comments || '').trim();
  if (!items.length) return fail('Pick at least one thing to correct.', 400);
  if (!comments) return fail('Add a comment for the vendor.', 400);
  if (!REVIEWABLE.includes(v.status)) return fail('This registration is not waiting for review.', 409);
  v.status = 'correction_required';
  v.data.correction = { items, comments, by: ME.name, at: nowIso() };
  for (const doc of v.docs) {
    if (items.some((i) => DOC_FOR_ITEM[i] === doc.docType)) {
      doc.status = 'correction_required';
      doc.remarks = comments;
    }
  }
  audit(v, 'correction_requested', { field: items.join(', ') });
  return { ok: true, status: 'correction_required' };
}

function setStatus(v: VendorRecord, body: Record<string, unknown>) {
  const next = String(body.status || '');
  if (next === 'inactive') {
    if (v.status !== 'approved') return fail('Only an approved vendor can be deactivated.', 409);
    v.status = 'inactive';
    audit(v, 'deactivated', { new_value: String(body.reason || '') });
  } else if (next === 'approved') {
    if (v.status !== 'inactive') return fail('Only a deactivated vendor can be reactivated.', 409);
    v.status = 'approved';
    audit(v, 'reactivated');
  } else return fail('Unknown status.', 400);
  return { ok: true, status: v.status };
}

const CHANGE_FIELD_TO_DATA: Record<string, string> = { ifsc: 'ifsc', bankName: 'bankName', accountNumber: 'accountNumber', bankAccountName: 'bankAccountName', branchName: 'branchName', legalEntityName: 'legalEntityName', tradeName: 'tradeName', contactPerson: 'contactPerson', email: 'email', registeredAddress: 'registeredAddress' };
function decideChange(id: string, body: Record<string, unknown>) {
  const v = allVendors().find((x) => x.changeRequests.some((c) => c.id === id));
  const c = v?.changeRequests.find((x) => x.id === id) as ChangeRequest | undefined;
  if (!v || !c) return notFound('Change request not found.');
  if (c.status !== 'pending') return fail('This change request has already been decided.', 409);
  const decision = String(body.decision || '');
  if (decision !== 'approved' && decision !== 'rejected') return fail('Decision must be approved or rejected.', 400);
  Object.assign(c, { status: decision, reviewed_at: nowIso(), review_note: String(body.note || '') || null });
  if (decision === 'approved') {
    const key = CHANGE_FIELD_TO_DATA[c.field] ?? c.field;
    (v.data as Record<string, unknown>)[key] = c.new_value;
  }
  audit(v, decision === 'approved' ? 'change_approved' : 'change_rejected', { field: c.field, prev_value: c.prev_value, new_value: c.new_value });
  return { ok: true, status: decision };
}

function panAadhaarCheck(v: VendorRecord, body: Record<string, unknown>) {
  const pan = String(v.data.pan || '');
  if (!pan) return fail('No PAN on record for this vendor yet.', 400);
  const at = nowIso();
  const individual = pan.charAt(3).toUpperCase() === 'P';
  let check: PanAadhaarCheck;
  if (!individual && !body.force) check = { status: 'not_applicable', at, note: 'PAN–Aadhaar linking applies only to individual PANs.', source: 'pan', by: ME.name };
  else if (!individual) check = { status: 'not_applicable', at, note: 'Digio reports that this PAN is not an individual’s, so Aadhaar linking does not apply.', source: 'digio', by: ME.name };
  else check = { status: panAadhaarState(v.data) === 'not_linked' ? 'not_linked' : 'linked', at, note: '', source: 'digio', by: ME.name };
  Object.assign(v.data, { panAadhaarCheck: check, panLinkedToAadhaar: check.status === 'linked' ? true : check.status === 'not_linked' ? false : null });
  audit(v, 'pan_aadhaar_checked', { new_value: check.status });
  return { ok: true, panAadhaarCheck: check, panHolderType: panHolderType(pan) };
}

// ══ Vendor bills ═════════════════════════════════════════════════════════════
// The approved vendor persona's ten bills (one per status), with the internal fields only Accounts sees,
// plus two bills from other vendors waiting on Accounts (one a vendor advance).
type BillExtra = Pick<AccountsBill, 'keka_code' | 'project_id' | 'keka_owner_name' | 'keka_owner_user_id' | 'submitted_by' | 'submitted_by_name' | 'submitted_by_email' | 'payment' | 'payment_history'> & {
  keka_approved_by_name?: string | null;
  accounts_accepted_by_name?: string | null;
  accounts_reject_reason?: string | null;
};
type StoredBill = { bill: VendorBill; file: { fileName: string; mimeType: string; fileData: string } };

const PROJECT_FOR_BILL = ['p-nimbus', 'p-reel', 'p-kathalu', 'p-kathalu', 'p-kisan', 'p-sjw-diwali', 'p-sjw-diwali', 'p-kisan', 'p-spice', 'p-nimbus'];
const BILL_EXTRAS = new Map<string, BillExtra>();
let settings: BillSettings = { payment_timeline_days: 7, payment_message: 'The amount will be credited within {days} working days.' };

function payFor(id: string, at: string, response?: 'received' | 'not_received'): { payment: BillPayment; history: PettyCashHistoryEntry[] } {
  const ref = `UTR ${String(parseInt(hex6(id), 16) % 100000000).padStart(8, '0')}`;
  const payment: BillPayment = { paymentDate: at.slice(0, 10), reference: ref, method: 'bank_transfer', note: '', startedAt: at, startedByName: RAMESH.name, response: null };
  const history: PettyCashHistoryEntry[] = [{ status: 'payment_processing', at, byId: RAMESH.id, byName: RAMESH.name, paymentDate: payment.paymentDate, reference: ref, method: 'bank_transfer' }];
  if (response) {
    const rAt = later(at, 30);
    const by = 'Deepa Menon';
    const note = response === 'not_received' ? 'The vendor says nothing has reached their account yet.' : '';
    payment.response = { response, at: rAt, byName: by, note };
    history.push({ status: response, at: rAt, byId: 'u-deepa', byName: by, ...(note ? { note } : {}) });
  }
  return { payment, history };
}

function extraFor(b: VendorBill, i: number): BillExtra {
  let x = BILL_EXTRAS.get(b.id);
  if (x) return x;
  const p = projectById(PROJECT_FOR_BILL[i % PROJECT_FOR_BILL.length]) ?? projectById('p-kisan')!;
  const owner = ownerOf(p);
  const by = i % 2 === 0 ? who('u-deepa') : who('u-priya');
  const paid = ['payment_processing', 'received', 'not_received'].includes(b.status);
  const pay = paid ? payFor(b.id, later(b.updated_at || b.created_at, -6), b.status === 'payment_processing' ? undefined : (b.status as 'received' | 'not_received')) : null;
  x = {
    keka_code: p.kekaCode,
    project_id: p.id,
    keka_owner_name: owner?.name ?? '',
    keka_owner_user_id: owner?.id ?? null,
    submitted_by: by.id,
    submitted_by_name: by.name,
    submitted_by_email: personById(by.id)?.email ?? null,
    payment: pay?.payment ?? null,
    payment_history: pay?.history ?? [],
    keka_approved_by_name: owner?.name ?? null,
    accounts_accepted_by_name: ['accepted', 'payment_processing', 'received', 'not_received'].includes(b.status) ? RAMESH.name : null,
    accounts_reject_reason: b.status === 'rejected_accounts' ? 'The GST on this invoice is charged at 18% — props are billed at 12%. Please ask the vendor for a corrected invoice.' : null,
  };
  BILL_EXTRAS.set(b.id, x);
  return x;
}

function otherBill(id: string, vendorId: string, projectId: string, by: string, amount: number, description: string, daysBack: number, advance = false): StoredBill {
  const p = projectById(projectId)!;
  const owner = ownerOf(p);
  const created = daysAgo(daysBack, '12:40');
  const sub = who(by);
  const bill: VendorBill = {
    id,
    vendor_id: vendorId,
    status: 'pending_accounts_approval',
    current_version: 1,
    is_advance: advance,
    created_at: created,
    updated_at: later(created, 26),
    version: {
      id: `${id}-v1`,
      bill_id: id,
      version_no: 1,
      amount,
      description,
      file_name: `${id.toUpperCase()}.pdf`,
      mime_type: 'application/pdf',
      file_size: bytesOf(INVOICE_PDF),
      status: 'pending_accounts_approval',
      keka_approval_required: true,
      keka_approved_at: later(created, 26),
      created_at: created,
    },
  };
  BILL_EXTRAS.set(id, {
    keka_code: p.kekaCode,
    project_id: p.id,
    keka_owner_name: owner?.name ?? '',
    keka_owner_user_id: owner?.id ?? null,
    submitted_by: sub.id,
    submitted_by_name: sub.name,
    submitted_by_email: personById(sub.id)?.email ?? null,
    payment: null,
    payment_history: [],
    keka_approved_by_name: owner?.name ?? null,
  });
  return { bill, file: { fileName: `${id.toUpperCase()}.pdf`, mimeType: 'application/pdf', fileData: INVOICE_PDF } };
}

const OTHER_BILLS: StoredBill[] = [
  otherBill('vb-acct-deccan-1', 'vnd-acct-deccan', 'p-kisan', 'u-deepa', 72000, 'Aerial shots — Kisan Agro launch film, 2 days with a pilot and spare batteries', 3),
  otherBill('vb-acct-lakshmi-1', 'vnd-acct-lakshmi', 'p-sjw-diwali', 'u-priya', 15000, 'Vendor advance — lights and grip for the Diwali film shoot', 1, true),
];

function allBills(): StoredBill[] {
  const persona = vendorRecord('approved').bills as StoredBill[];
  persona.forEach((row, i) => extraFor(row.bill, i));
  return [...OTHER_BILLS, ...persona];
}

function view(row: StoredBill): AccountsBill {
  const x = BILL_EXTRAS.get(row.bill.id);
  const v = row.bill.version;
  const version: AccountsBillVersion | null = v
    ? {
        ...v,
        keka_approved_amount: v.keka_approved_at ? Number(v.amount) : null,
        keka_approved_by_name: v.keka_approved_at ? (x?.keka_approved_by_name ?? null) : null,
        accounts_accepted_by_name: v.accounts_accepted_at ? (x?.accounts_accepted_by_name ?? RAMESH.name) : null,
        accounts_reject_reason: x?.accounts_reject_reason ?? null,
      }
    : null;
  return {
    id: row.bill.id,
    vendor_id: row.bill.vendor_id,
    keka_code: x?.keka_code ?? '',
    project_id: x?.project_id ?? null,
    keka_owner_name: x?.keka_owner_name ?? null,
    keka_owner_user_id: x?.keka_owner_user_id ?? null,
    submitted_by: x?.submitted_by ?? '',
    submitted_by_name: x?.submitted_by_name ?? null,
    submitted_by_email: x?.submitted_by_email ?? null,
    status: row.bill.status,
    is_advance: !!row.bill.is_advance,
    created_at: row.bill.created_at,
    updated_at: row.bill.updated_at ?? null,
    current_version: row.bill.current_version,
    payment: x?.payment ?? null,
    payment_history: x?.payment_history ?? [],
    version,
  };
}

const ACCOUNTS_STAGE = ['pending_accounts_approval', 'accepted', 'payment_processing', 'received', 'not_received', 'rejected_accounts'];
const findBill = (id: string) => allBills().find((r) => r.bill.id === id) ?? null;
const touch = (row: StoredBill, status: string, version: Partial<NonNullable<VendorBill['version']>> = {}) => {
  const at = nowIso();
  row.bill.status = status;
  row.bill.updated_at = at;
  if (row.bill.version) Object.assign(row.bill.version, { status }, version);
  return at;
};

function acceptBill(id: string) {
  const row = findBill(id);
  if (!row) return notFound('Bill not found.');
  if (row.bill.status !== 'pending_accounts_approval') return fail('This bill is not pending Accounts approval.', 409);
  touch(row, 'accepted', { accounts_accepted_at: nowIso() });
  const x = BILL_EXTRAS.get(id);
  if (x) x.accounts_accepted_by_name = ME.name;
  return { ok: true, status: 'accepted' };
}

function rejectBill(id: string, body: Record<string, unknown>) {
  const reason = String(body.reason || '').trim();
  if (!reason) return fail('A rejection reason is required.', 400);
  const row = findBill(id);
  if (!row) return notFound('Bill not found.');
  if (row.bill.status !== 'pending_accounts_approval') return fail('This bill is not pending Accounts approval.', 409);
  touch(row, 'rejected_accounts', { accounts_rejected_at: nowIso() });
  const x = BILL_EXTRAS.get(id);
  if (x) x.accounts_reject_reason = reason;
  return { ok: true, status: 'rejected_accounts' };
}

function startBillPayment(id: string) {
  const row = findBill(id);
  if (!row) return notFound('Bill not found.');
  const x = BILL_EXTRAS.get(id);
  if (x?.submitted_by === ME.id) return fail('You can’t handle the payment of a bill you submitted — someone else in Accounts has to.', 403);
  if (!['accepted', 'not_received'].includes(row.bill.status))
    return fail(row.bill.status === 'payment_processing' ? 'Payment has already been started — waiting for the person who submitted it to confirm.' : 'This bill has not been authorized for payment yet.', 409);
  const followUp = row.bill.status === 'not_received';
  const at = touch(row, 'payment_processing');
  const payment: BillPayment = { paymentDate: at.slice(0, 10), reference: '', method: '', note: '', startedAt: at, startedByName: ME.name, response: null };
  if (x) {
    x.payment = payment;
    x.payment_history = [...(x.payment_history ?? []), { status: 'payment_processing', at, byId: ME.id, byName: ME.name, ...(followUp ? { followUp: true } : {}) }];
  }
  return { ok: true, status: 'payment_processing', payment };
}

// ══ Agreements ═══════════════════════════════════════════════════════════════
// The approved vendor's six agreements. The footage licence (signed by the vendor) waits on the demo
// person's countersignature; the Diwali crew agreement has passed its deadline, so Extend can be tried.
type AgreementExtra = { project_id: string; keka_code: string; created_by: string; signer_id: string | null; internal_file?: string; internal_type?: string };
const AGREEMENT_EXTRAS = new Map<string, AgreementExtra>();
const AGREEMENT_PROJECTS = ['p-kisan', 'p-nimbus', 'p-sjw-diwali', 'p-reel', 'p-spice', 'p-admin'];
const AGREEMENT_BY: Record<string, string> = { 'Deepa Menon': 'u-deepa', 'Priya Sharma': 'u-priya', 'Ramesh Gupta': 'u-ramesh' };
const SIGNER_ID: Record<string, string> = { 'Arvind Menon': 'u-arvind', 'Kiran Rao': 'u-kiran' };

type AgreementRow = ReturnType<typeof vendorRecord>['agreements'][number];
function agreementRows(): AgreementRow[] {
  const rows = vendorRecord('approved').agreements;
  rows.forEach((a, i) => {
    if (AGREEMENT_EXTRAS.has(a.id)) return;
    const p = projectById(AGREEMENT_PROJECTS[i] ?? 'p-admin')!;
    const mine = a.status === 'pending_internal_signature';
    if (mine) a.signer_name = ME.name; // the countersigner is whoever is exploring
    AGREEMENT_EXTRAS.set(a.id, {
      project_id: p.id,
      keka_code: p.kekaCode,
      created_by: AGREEMENT_BY[a.created_by_name ?? ''] ?? 'u-ramesh',
      signer_id: mine ? ME.id : a.signer_name ? (SIGNER_ID[a.signer_name] ?? null) : null,
    });
  });
  return rows;
}

function agreementView(a: AgreementRow): AccountsAgreement {
  const x = AGREEMENT_EXTRAS.get(a.id);
  return {
    id: a.id,
    vendor_id: a.vendor_id,
    project_id: x?.project_id ?? null,
    project_name: a.project_name,
    keka_code: x?.keka_code ?? null,
    created_by: x?.created_by ?? null,
    created_by_name: a.created_by_name,
    deadline_at: a.deadline_at,
    status: a.status,
    sign_positions: a.sign_positions,
    draft_file_name: a.draft_file_name,
    signer_id: x?.signer_id ?? null,
    signer_name: a.signer_name,
    signed_at: a.signed_at,
    internal_signed_at: a.internal_signed_at,
    signature_reference: a.signature_reference,
    internal_signature_reference: a.internal_signature_reference,
    created_at: a.created_at,
  };
}

const overseer = () => OVERSEERS.includes(role());
const mayView = (a: AgreementRow) => {
  const x = AGREEMENT_EXTRAS.get(a.id);
  return overseer() || x?.created_by === ME.id || x?.signer_id === ME.id;
};
const findAgreement = (id: string) => agreementRows().find((a) => a.id === id) ?? null;

function extendDeadline(id: string, body: Record<string, unknown>) {
  const a = findAgreement(id);
  if (!a) return notFound('Agreement not found.');
  const x = AGREEMENT_EXTRAS.get(id);
  if (!overseer() && x?.created_by !== ME.id) return fail('Only the person who drafted this agreement, or Accounts, can extend it.', 403);
  if (a.status !== 'pending_signature') return fail('Only an agreement still waiting on the vendor’s signature can be extended.', 409);
  const next = Date.parse(String(body.deadlineAt || ''));
  if (!Number.isFinite(next)) return fail('Pick a valid date and time.', 400);
  const floor = Math.max(Date.parse(a.deadline_at || '') || 0, Date.now());
  if (next <= floor) return fail('The new deadline must be later than the current one and in the future.', 400);
  a.deadline_at = new Date(next).toISOString();
  return { ok: true, deadlineAt: a.deadline_at };
}

function countersign(id: string, body: Record<string, unknown>) {
  const a = findAgreement(id);
  if (!a) return notFound('Agreement not found.');
  const x = AGREEMENT_EXTRAS.get(id);
  if (x?.signer_id !== ME.id) return fail('Only the person named to countersign can sign this agreement.', 403);
  if (a.status !== 'pending_internal_signature') return fail(a.status === 'signed' ? 'This agreement is already signed.' : 'The vendor has not signed this agreement yet.', 409);
  const type = body.signatureType === 'uploaded' ? 'uploaded' : body.signatureType === 'drawn' ? 'drawn' : null;
  if (!type) return fail('signatureType must be "drawn" or "uploaded".', 400);
  const m = /^data:(image\/(png|jpe?g));base64,(.+)$/s.exec(String(body.signatureFileData || ''));
  if (!m) return fail('The signature must be a PNG or JPG image.', 400);
  if (bytesOf(m[3] ?? '') > 2 * 1024 * 1024) return fail('That signature image is too large.', 413);
  const at = nowIso();
  Object.assign(a, { status: 'signed', internal_signed_at: at, internal_signature_reference: reference(`${id}:internal:${at}`), signer_name: ME.name });
  if (x) Object.assign(x, { internal_file: m[3], internal_type: m[1] });
  return { ok: true, status: 'signed' };
}

// ══ Expense claims (reimbursements.js, Accounts' stage) ═══════════════════════
const ev = (event: string, status: string, at: string, by: { id: string; name: string }, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({ event, status, at, byId: by.id, byName: by.name, ...extra });

function colleagueClaim(seed: string, employee: string, code: string, purpose: string, amount: number, created: string, stage: 'accounts' | 'ready' | 'paying' | 'not_received', note = ''): Reimbursement {
  const p = projectByCode(code)!;
  const owner = ownerOf(p)!;
  const emp = who(employee);
  const history: HistoryEntry[] = [ev('submitted', 'pending_keka_approval', created, emp, { amount, purpose }), ev('keka_approved', 'pending_accounts_approval', later(created, 18), owner, { amount })];
  const r: Reimbursement = {
    id: epochId('rmb', created, seed),
    tenant_id: DEMO_TENANT_ID,
    employee_id: emp.id,
    employee_name: emp.name,
    employee_number: String(personById(emp.id)?.employeeNumber ?? ''),
    keka_code: p.kekaCode,
    project_id: p.id,
    project_name: p.name,
    keka_owner_user_id: owner.id,
    keka_owner_name: owner.name,
    purpose,
    amount,
    status: 'pending_accounts_approval',
    receipt_name: `${seed}.jpg`,
    history,
    payment: null,
    created_at: created,
    updated_at: later(created, 18),
    keka_approved_at: later(created, 18),
    keka_approved_by_name: owner.name,
  };
  if (stage === 'accounts') return r;
  const authAt = later(created, 40);
  Object.assign(r, { status: 'ready_for_payment', approved_at: authAt, approved_by_name: RAMESH.name });
  history.push(ev('authorized', 'ready_for_payment', authAt, RAMESH));
  if (stage === 'ready') return r;
  const payAt = later(created, 64);
  const ref = `UTR ${String(parseInt(hex6(seed), 16) % 100000000).padStart(8, '0')}`;
  r.payment = { paymentDate: payAt.slice(0, 10), reference: ref, method: 'bank_transfer', note: '', startedAt: payAt, startedByName: RAMESH.name, response: null };
  r.status = 'payment_processing';
  history.push(ev('payment_processing', 'payment_processing', payAt, RAMESH, { paymentDate: payAt.slice(0, 10), reference: ref, method: 'bank_transfer' }));
  if (stage === 'paying') return r;
  const rAt = later(payAt, 28);
  r.status = 'not_received';
  r.payment.response = { response: 'not_received', at: rAt, byName: emp.name, note };
  history.push(ev('not_received', 'not_received', rAt, emp, note ? { note } : {}));
  return r;
}

reimbursementStore.push(
  colleagueClaim('acct-claim-meera', 'u-meera', 'TM_AAR_BRAND26', 'food', 1640, daysAgo(3, '20:10'), 'accounts'),
  colleagueClaim('acct-claim-rahul', 'u-rahul', 'TM_SJW_DIWALI26', 'transportation', 2310, daysAgo(2, '18:45'), 'accounts'),
  colleagueClaim('acct-claim-imran', 'u-imran', 'TM_KTH_S2', 'accommodation', 6800, daysAgo(7, '11:00'), 'ready'),
  colleagueClaim('acct-claim-zoya', 'u-zoya', 'TM_AAR_BRAND26', 'fuel', 1150, daysAgo(9, '17:30'), 'paying'),
  colleagueClaim('acct-claim-sanjay', 'u-sanjay', 'TM_KAG_LAUNCH', 'food', 980, daysAgo(12, '21:15'), 'not_received', 'Nothing has come into my salary account yet.'),
);

const findClaim = (id: string) => reimbursementStore.find((r) => r.id === id) ?? null;

function authorizeClaim(id: string) {
  const r = findClaim(id);
  if (!r) return notFound('Reimbursement not found.');
  if (r.employee_id === ME.id) return fail('You can’t authorize your own reimbursement — someone else in Accounts has to.', 403);
  if (r.status !== 'pending_accounts_approval') return fail('This reimbursement is not waiting for Accounts authorization.', 409);
  const at = nowIso();
  setReimbursementStage(id, 'ready_for_payment', { approved_at: at, approved_by_name: ME.name }, { event: 'authorized' });
  return { ok: true, status: 'ready_for_payment' };
}

function rejectClaim(id: string, body: Record<string, unknown>) {
  const r = findClaim(id);
  if (!r) return notFound('Reimbursement not found.');
  if (r.employee_id === ME.id) return fail('You can’t reject your own reimbursement.', 403);
  if (r.status !== 'pending_accounts_approval') return fail('This reimbursement is not waiting for Accounts authorization.', 409);
  const reason = String(body.reason || '').trim();
  if (!reason) return fail('Give a reason for rejecting — the requester will see it.', 400);
  setReimbursementStage(id, 'rejected', { rejected_stage: 'accounts', rejected_at: nowIso(), rejected_by_name: ME.name, rejection_reason: reason }, { event: 'accounts_rejected', extra: { note: reason } });
  return { ok: true, status: 'rejected' };
}

function startClaimPayment(id: string) {
  const r = findClaim(id);
  if (!r) return notFound('Reimbursement not found.');
  if (r.employee_id === ME.id) return fail('You can’t handle the payment of your own reimbursement — someone else in Accounts has to.', 403);
  if (!['ready_for_payment', 'not_received'].includes(String(r.status)))
    return fail(
      r.status === 'payment_processing' ? 'Payment has already been started — waiting for the requester to confirm.' : r.status === 'received' ? 'This reimbursement is already complete — the money was received.' : 'This reimbursement has not been authorized for payment yet.',
      409,
    );
  const followUp = r.status === 'not_received';
  const at = nowIso();
  const payment = { paymentDate: at.slice(0, 10), reference: '', method: '', note: '', startedAt: at, startedByName: ME.name, response: null };
  setReimbursementStage(id, 'payment_processing', { payment }, { extra: { paymentDate: payment.paymentDate, ...(followUp ? { followUp: true } : {}) } });
  return { ok: true, status: 'payment_processing', payment };
}

// ══ Petty cash (server.js, Accounts' stage) ════════════════════════════════════
const headName = (id: string) => expenseHeadStore.find((h) => h.id === id)?.name ?? 'Not specified';
const lines = (...pairs: [string, number][]): PettyCashHeadLine[] => pairs.map(([id, amount]) => ({ departmentId: id, departmentName: headName(id), amount }));
const hist = (status: string, at: string, by: { id: string; name: string }, extra: Partial<PettyCashHistoryEntry> = {}): PettyCashHistoryEntry => ({ status, at, byId: by.id, byName: by.name, ...extra });

function colleaguePetty(seed: string, employee: string, code: string, departments: PettyCashHeadLine[], remarks: string, created: string, stage: 'accounts' | 'ready' | 'received' | 'not_received', extra: Partial<DemoPettyRequest> = {}): DemoPettyRequest {
  const p = projectByCode(code)!;
  const owner = ownerOf(p);
  const emp = personById(employee)!;
  const r: DemoPettyRequest = {
    id: epochId('pcr', created, seed),
    tenantId: DEMO_TENANT_ID,
    kekaCode: p.kekaCode,
    projectId: p.id,
    projectName: p.name,
    costCodeOwnerId: owner?.id ?? null,
    costCodeOwnerName: owner?.name ?? '',
    employeeId: emp.id,
    employeeName: emp.name,
    employeeNumber: emp.employeeNumber,
    employeeDept: emp.dept,
    requestedById: emp.id,
    requestedByName: emp.name,
    onBehalf: false,
    departments,
    amount: round2(departments.reduce((s, d) => s + d.amount, 0)),
    remarks,
    status: 'pending_accounts_approval',
    createdAt: created,
    kekaApprovedAt: later(created, 5),
    kekaApprovedByName: owner?.name ?? '',
    paymentHistory: [],
    ...extra,
  };
  if (stage === 'accounts') return r;
  const authAt = later(created, 22);
  Object.assign(r, { status: 'ready_for_payment', approvedAt: authAt, approvedByName: RAMESH.name, paymentHistory: [hist('ready_for_payment', authAt, RAMESH)] });
  if (stage === 'ready') return r;
  const procAt = later(created, 30);
  const ref = `UTR ${String(parseInt(hex6(seed), 16) % 100000000).padStart(8, '0')}`;
  Object.assign(r, { status: 'payment_processing', processingAt: procAt, processingByName: RAMESH.name, paymentDate: procAt.slice(0, 10), paymentReference: ref, paymentMethod: 'bank_transfer' });
  r.paymentHistory!.push(hist('payment_processing', procAt, RAMESH, { paymentDate: procAt.slice(0, 10), reference: ref, method: 'bank_transfer' }));
  const rAt = later(procAt, 26);
  const note = stage === 'not_received' ? 'Not credited yet — I checked my bank app this morning.' : '';
  Object.assign(r, { status: stage, userResponse: { response: stage, at: rAt, byName: emp.name, note } });
  r.paymentHistory!.push(hist(stage, rAt, emp, note ? { note } : {}));
  return r;
}

// Imran's Kathalu schedule: ₹8,000 of petty cash (received), then bills of ₹10,400 — so an extra ₹2,400
// claim waits on Accounts, and its bills can be rejected one by one.
const IMRAN_ADV = colleaguePetty('acct-pc-imran-adv', 'u-imran', 'TM_KTH_S2', lines(['pcd-rental', 5000], ['pcd-fuel', 3000]), 'Night market sequence — light rental and genset fuel.', daysAgo(14, '10:10'), 'received');
const IMRAN_BATCH = epochId('pcbb', daysAgo(4, '19:40'), 'acct-batch-imran');
const IMRAN_EXTRA = colleaguePetty('acct-pc-imran-extra', 'u-imran', 'TM_KTH_S2', lines(['pcd-food', 1250], ['pcd-fuel', 1150]), 'Bills of ₹10400 were submitted against ₹8000 of petty cash, so ₹2400 more is needed to cover them.', daysAgo(4, '19:40'), 'accounts', {
  kind: 'excess',
  excessBatchId: IMRAN_BATCH,
  billsTotal: 10400,
  allocatedTotal: 8000,
  costCodeOwnerId: 'u-deepa',
});

pettyStore.push(
  colleaguePetty('acct-pc-rahul', 'u-rahul', 'TM_SJW_DIWALI26', lines(['pcd-props', 2400], ['pcd-travel', 800]), 'Jewellery trays, velvet backdrop and a cab to Abids for the product close-ups.', daysAgo(2, '11:30'), 'accounts'),
  colleaguePetty('acct-pc-zoya', 'u-zoya', 'TM_AAR_BRAND26', lines(['pcd-misc', 1850]), 'Printing and standees for the Aarogya OPD social shoot.', daysAgo(1, '15:05'), 'accounts'),
  IMRAN_EXTRA,
  IMRAN_ADV,
  colleaguePetty('acct-pc-sanjay', 'u-sanjay', 'TM_KAG_LAUNCH', lines(['pcd-rental', 3500]), 'Edit suite hard drives for the launch film (two 4 TB).', daysAgo(5, '09:40'), 'ready'),
  colleaguePetty('acct-pc-farhan', 'u-farhan', 'TM_KAG_LAUNCH', lines(['pcd-travel', 2200], ['pcd-food', 900]), 'Recce at Shadnagar — cab and lunch for three.', daysAgo(11, '08:50'), 'not_received'),
);

function imranSub(seed: string, head: string, day: number, description: string, paidTo: string, amount: number): DemoPettySubmission {
  const p = projectByCode('TM_KTH_S2')!;
  const created = daysAgo(4, '19:40');
  return {
    id: epochId('pcbs', created, seed),
    batchId: IMRAN_BATCH,
    tenantId: DEMO_TENANT_ID,
    employeeId: 'u-imran',
    employeeName: 'Imran Shaikh',
    projectId: p.id,
    projectName: p.name,
    kekaCode: p.kekaCode,
    billDate: addDays(today(), -day),
    departmentId: head,
    departmentName: headName(head),
    description,
    paidTo,
    amount,
    voucherNumber: `PCV-${created.slice(0, 10).replace(/-/g, '')}-${hex6(seed).toUpperCase()}`,
    fileName: `${seed}.jpg`,
    hasFile: true,
    createdAt: created,
    excessRequestId: IMRAN_EXTRA.id,
  };
}

pettySubmissionStore.push(
  imranSub('acct-imran-hmi', 'pcd-rental', 9, 'Two 1.2K HMI lights — 2 nights', 'Hyderabad Light House', 5400),
  imranSub('acct-imran-genset', 'pcd-fuel', 9, 'Diesel for the 25 kVA genset', 'IOCL, Begum Bazaar', 2650),
  imranSub('acct-imran-tea', 'pcd-food', 8, 'Tea and snacks for the night crew', 'Nimrah Café', 1250),
  imranSub('acct-imran-fuel2', 'pcd-fuel', 8, 'Top-up diesel, second night', 'IOCL, Begum Bazaar', 1100),
);

pettyBillStore.push({
  id: epochId('pcb', daysAgo(2, '17:15'), 'acct-old-bill'),
  tenantId: DEMO_TENANT_ID,
  requestId: pettyStore.find((r) => r.employeeId === 'u-sanjay')?.id ?? '',
  kekaCode: 'TM_KAG_LAUNCH',
  projectName: projectByCode('TM_KAG_LAUNCH')?.name,
  employeeId: 'u-sanjay',
  employeeName: 'Sanjay Kumar',
  uploadedById: 'u-sanjay',
  uploadedByName: 'Sanjay Kumar',
  amount: 1150,
  description: 'Courier for the edit drives to the client office',
  status: 'pending',
  createdAt: daysAgo(2, '17:15'),
  hasFile: true,
} as (typeof pettyBillStore)[number]);

const findPetty = (id: string) => pettyStore.find((r) => r.id === id) ?? null;
const ownPetty = (r: DemoPettyRequest) => r.employeeId === ME.id || r.requestedById === ME.id;

function authorizePetty(id: string) {
  const r = findPetty(id);
  if (!r) return notFound('Request not found.');
  if (ownPetty(r)) return fail('You can’t give Accounts approval on a petty cash request that is for you or that you raised — someone else has to.', 403);
  if (r.status !== 'pending_accounts_approval') return fail('This request has already been reviewed.', 409);
  setPettyStage(id, 'ready_for_payment', { approvedAt: nowIso(), approvedByName: ME.name });
  return { ok: true };
}

function rejectPetty(id: string, body: Record<string, unknown>) {
  const r = findPetty(id);
  if (!r) return notFound('Request not found.');
  if (r.status !== 'pending_accounts_approval') return fail('This request has already been reviewed.', 409);
  setPettyStage(id, 'rejected', { rejectedStage: 'accounts', rejectedAt: nowIso(), rejectedByName: ME.name, rejectionReason: String(body.reason || '').trim() });
  return { ok: true };
}

function startPettyPayment(id: string) {
  const r = findPetty(id);
  if (!r) return notFound('Request not found.');
  if (ownPetty(r)) return fail('You can’t handle the payment of petty cash that is for you or that you raised — someone else has to.', 403);
  if (!['ready_for_payment', 'approved', 'not_received'].includes(r.status))
    return fail(r.status === 'payment_processing' || r.status === 'paid' ? 'Payment has already been started — waiting for the person it is for to confirm.' : 'This request has not been authorized for payment yet.', 409);
  const followUp = r.status === 'not_received';
  const at = nowIso();
  const out = setPettyStage(id, 'payment_processing', { processingAt: at, processingByName: ME.name, paymentDate: at.slice(0, 10), paymentReference: '', paymentMethod: '', userResponse: null });
  const last = out?.paymentHistory?.[out.paymentHistory.length - 1];
  if (last) Object.assign(last, { paymentDate: at.slice(0, 10), ...(followUp ? { followUp: true } : {}) });
  return { ok: true, request: out };
}

function decideOldBill(id: string, approve: boolean, body: Record<string, unknown>) {
  const b = pettyBillStore.find((x) => x.id === id);
  if (!b) return notFound('Bill not found.');
  if (approve && (b.uploadedById === ME.id || b.employeeId === ME.id)) return fail('You can’t approve a bill that is yours or that you uploaded — someone else has to.', 403);
  if (b.status !== 'pending') return fail('This bill has already been reviewed.', 409);
  const at = nowIso();
  Object.assign(b, approve ? { status: 'approved', approvedAt: at } : { status: 'rejected', rejectedAt: at, rejectionReason: String(body.reason || '').trim() });
  return { ok: true };
}

// The company's bill submissions (admins), without the receipts.
function allSubmissions(q: URLSearchParams) {
  const from = q.get('dateFrom') || '';
  const to = q.get('dateTo') || '';
  const project = String(q.get('projectName') || '').trim().toLowerCase();
  const employee = String(q.get('employeeName') || '').trim().toLowerCase();
  return pettySubmissionStore
    .filter((b) => (!from || String(b.createdAt || '').slice(0, 10) >= from) && (!to || String(b.createdAt || '').slice(0, 10) <= to))
    .filter((b) => !project || `${b.projectName || ''} ${b.kekaCode || ''}`.toLowerCase().includes(project))
    .filter((b) => !employee || String(b.employeeName || '').toLowerCase().includes(employee))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .map(({ fileData: _f, ...rest }) => rest);
}

// GET /petty_cash_bill_submissions/statement/:batchId — server.js:4308, with `canReject` for Accounts.
const REJECTABLE_CLAIM = ['pending_approval', 'pending_accounts_approval'];
function statement(batchId: string, requestId: string): (PettyCashStatement & { ok: true }) | ReturnType<typeof fail> {
  const found = requestId ? pettySubmissionStore.filter((b) => b.excessRequestId === requestId) : pettySubmissionStore.filter((b) => b.batchId === batchId);
  if (!found.length) return notFound('Statement not found.');
  const first = found[0]!;
  const owner = (code: string) => ownerOf(projectByCode(code));
  if (!PETTY_ADMIN.includes(role()) && first.employeeId !== ME.id && owner(first.kekaCode || '')?.id !== ME.id) return fail('Not authorized.', 403);
  const mayReject = isAccounts();
  const byCode = new Map<string, DemoPettySubmission[]>();
  for (const b of [...found].sort((a, c) => String(a.createdAt).localeCompare(String(c.createdAt)))) byCode.set(b.kekaCode || '—', [...(byCode.get(b.kekaCode || '—') ?? []), b]);
  const statements: PettyCashStatementSheet[] = [...byCode.entries()].map(([kekaCode, all]) => {
    const bills = all.filter((b) => b.status !== 'rejected');
    const total = round2(bills.reduce((s, b) => s + b.amount, 0));
    const totals = new Map<string, number>();
    for (const b of bills) totals.set(b.departmentId || '_none', round2((totals.get(b.departmentId || '_none') ?? 0) + b.amount));
    const heads = expenseHeadStore.filter((h) => h.active !== false).map((h) => ({ id: h.id, name: h.name, total: totals.get(h.id) ?? 0 }));
    const inflow = pettyStore
      .filter((r) => r.employeeId === first.employeeId && r.kekaCode === kekaCode && ['received', 'paid'].includes(r.status))
      .map((r) => ({ date: r.paymentDate || String(r.processingAt || r.approvedAt || r.createdAt || '').slice(0, 10), amount: r.amount, reference: r.paymentReference || '' }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const advance = round2(inflow.reduce((s, i) => s + i.amount, 0));
    const shown = bills.length ? bills : all;
    const dates = shown.map((b) => b.billDate).filter((d): d is string => !!d).sort();
    const startDate = dates[0] || String(shown[0]!.createdAt || '').slice(0, 10);
    const endDate = dates[dates.length - 1] || startDate;
    const days = Math.max(1, Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1);
    return {
      kekaCode,
      projectName: all[0]!.projectName || '',
      startDate,
      days,
      submittedAt: String(all[all.length - 1]!.createdAt || ''),
      heads,
      total,
      inflow,
      advance,
      balance: round2(advance - total),
      lines: all.map((b) => {
        const rejected = b.status === 'rejected';
        const linked = b.excessRequestId ? findPetty(b.excessRequestId) : null;
        return {
          id: b.id,
          hasFile: !!b.hasFile,
          voucherNumber: b.voucherNumber,
          head: b.departmentName || 'Not specified',
          amount: b.amount,
          date: b.billDate || '',
          project: b.projectName || '',
          description: b.description || '',
          paidTo: b.paidTo || '',
          status: rejected ? ('rejected' as const) : ('active' as const),
          canReject: mayReject && !rejected && b.employeeId !== ME.id && (!linked || REJECTABLE_CLAIM.includes(linked.status)),
          ...(rejected ? { rejectionReason: b.rejectionReason || '', rejectedByName: b.rejectedByName || '', rejectedAt: b.rejectedAt || '' } : {}),
        };
      }),
    };
  });
  const emp = personById(first.employeeId);
  return {
    ok: true,
    batchId,
    employee: { name: emp?.name ?? String(first.employeeName || ''), employeeNumber: String(emp?.employeeNumber || ''), designation: String(emp?.jobTitle || ''), location: String(emp?.location || 'Hyderabad') },
    statements,
  };
}

// POST /petty_cash_bill_submissions/:id/reject — server.js:4433 + pettyCashRebalanceExtra (:4398).
const ADVANCE = ['approved', 'ready_for_payment', 'payment_processing', 'paid', 'received', 'not_received'];
function rejectSubmission(id: string, body: Record<string, unknown>) {
  const b = pettySubmissionStore.find((x) => x.id === id);
  if (!b) return notFound('Bill not found.');
  const reason = String(body.reason || '').trim().slice(0, 500);
  if (!reason) return fail('Give the reason for rejecting this bill — the employee will be shown it.', 400);
  if (b.status === 'rejected') return fail('This bill has already been rejected.', 409);
  if (b.employeeId === ME.id) return fail('You can’t reject a bill that is yours — someone else in Accounts has to.', 403);
  const linked = b.excessRequestId ? findPetty(b.excessRequestId) : null;
  if (linked && !REJECTABLE_CLAIM.includes(linked.status))
    return fail(`This bill is part of an extra claim that has already been ${linked.status === 'rejected' ? 'rejected' : 'authorized'}, so it can no longer be rejected on its own.`, 409);
  Object.assign(b, { status: 'rejected', rejectedAt: nowIso(), rejectedByName: ME.name, rejectionReason: reason });
  let claim: { before: number; after: number; closed: boolean } | null = null;
  if (linked) {
    const code = String(linked.kekaCode || '').toLowerCase();
    const spent = round2(pettySubmissionStore.filter((x) => x.employeeId === linked.employeeId && String(x.kekaCode || '').toLowerCase() === code && x.status !== 'rejected').reduce((s, x) => s + x.amount, 0));
    const own = pettyStore.filter((x) => x.employeeId === linked.employeeId && String(x.kekaCode || '').toLowerCase() === code);
    const allocated = round2(own.filter((x) => x.kind !== 'excess' && ADVANCE.includes(x.status)).reduce((s, x) => s + x.amount, 0));
    const elsewhere = round2(own.filter((x) => x.kind === 'excess' && x.id !== linked.id).reduce((s, x) => s + x.amount, 0));
    const owed = Math.max(0, round2(spent - allocated - elsewhere));
    const before = linked.amount;
    const after = Math.min(before, owed);
    let left = after;
    const heads = new Map<string, PettyCashHeadLine>();
    for (const x of pettySubmissionStore.filter((s) => s.excessRequestId === linked.id && s.status !== 'rejected').sort((p, q) => String(q.createdAt).localeCompare(String(p.createdAt)))) {
      if (left <= 0) break;
      const take = round2(Math.min(left, x.amount));
      const k = x.departmentId || '_none';
      const cur = heads.get(k) ?? { departmentId: x.departmentId || '', departmentName: x.departmentName || 'Not specified', amount: 0 };
      cur.amount = round2(cur.amount + take);
      heads.set(k, cur);
      left = round2(left - take);
    }
    Object.assign(linked, { amount: after, billsTotal: spent, departments: [...heads.values()] });
    if (after <= 0) Object.assign(linked, { status: 'rejected', rejectedStage: 'accounts', rejectedAt: nowIso(), rejectedByName: ME.name, rejectionReason: `Every bill in this extra claim was rejected by Accounts — ${reason}` });
    claim = { before, after, closed: after <= 0 };
  }
  return { ok: true, bill: { id, status: 'rejected' }, claim };
}

// Expense types (petty cash "departments"), server.js:3443-3520.
function addHead(body: Record<string, unknown>) {
  const name = String(body.name || '').trim().slice(0, 80);
  if (!name) return fail('Enter a name for the expense type.', 400);
  if (expenseHeadStore.some((h) => h.name.toLowerCase() === name.toLowerCase())) return fail(`"${name}" already exists.`, 409);
  const head = { id: newId('pcd'), name, active: true, sortOrder: expenseHeadStore.length + 1, tenantId: DEMO_TENANT_ID };
  expenseHeadStore.push(head);
  return head;
}
function patchHead(id: string, body: Record<string, unknown>) {
  const h = expenseHeadStore.find((x) => x.id === id);
  if (!h) return notFound('Expense type not found.');
  if (typeof body.active === 'boolean') h.active = body.active;
  if (typeof body.name === 'string' && body.name.trim()) h.name = body.name.trim().slice(0, 80);
  return h;
}
function deleteHead(id: string) {
  const i = expenseHeadStore.findIndex((x) => x.id === id);
  if (i < 0) return notFound('Expense type not found.');
  const used = pettyStore.some((r) => (r.departments ?? []).some((d) => d.departmentId === id)) || pettySubmissionStore.some((b) => b.departmentId === id);
  if (used) return fail('This expense type is already used by petty cash requests or bills, so it can’t be deleted. Switch it off instead.', 409);
  expenseHeadStore.splice(i, 1);
  return { ok: true };
}

// ══ Routes ═══════════════════════════════════════════════════════════════════
const b = (x: unknown) => (x || {}) as Record<string, unknown>;
const A = ACCOUNTS_ROLES;

export const accountsRoutes: Route[] = [
  // vendor.js
  ['GET', /^\/accounts\/vendors$/, gate(A, 'review vendors', (_p: string[], _b: unknown, q: URLSearchParams) => listVendors(q))],
  ['GET', /^\/accounts\/vendors\/([^/]+)$/, gate(A, 'review vendors', withVendor((v) => ({ ok: true, vendor: detail(v) })))],
  [
    'GET',
    /^\/accounts\/vendors\/([^/]+)\/documents\/([^/]+)$/,
    gate(
      A,
      'review vendors',
      withVendor((v, _b, p) => {
        const d = v.docs.find((x) => docId(x) === p[2]);
        if (!d) return notFound('Document not found.');
        return { ok: true, docType: d.docType, fileName: d.fileName, mimeType: d.mimeType, fileData: d.fileData, version: d.version };
      }),
    ),
  ],
  ['POST', /^\/accounts\/vendors\/([^/]+)\/pan-aadhaar-check$/, gate(A, 'review vendors', withVendor((v, body) => panAadhaarCheck(v, body)))],
  [
    'PUT',
    /^\/accounts\/vendors\/([^/]+)\/pan-aadhaar-status$/,
    gate(
      A,
      'review vendors',
      withVendor((v, body) => {
        if (typeof body.linked !== 'boolean') return fail('linked must be true or false.', 400);
        const check: PanAadhaarCheck = { status: body.linked ? 'linked' : 'not_linked', at: nowIso(), note: String(body.remarks || ''), source: 'manual', by: ME.name };
        Object.assign(v.data, { panAadhaarCheck: check, panLinkedToAadhaar: body.linked });
        audit(v, 'pan_aadhaar_recorded', { new_value: check.status });
        return { ok: true, panAadhaarCheck: check };
      }),
    ),
  ],
  [
    'PUT',
    /^\/accounts\/vendors\/([^/]+)\/verification$/,
    gate(
      A,
      'review vendors',
      withVendor((v, body) => {
        const item = String(body.item || '');
        if (!VERIFICATION_ITEMS.includes(item)) return fail('Unknown verification item.', 400);
        if (!REVIEWABLE.includes(v.status)) return fail('This registration is not waiting for review.', 409);
        const ver = verificationOf(v);
        ver[item] = { verified: !!body.verified, by: ME.name, at: nowIso() };
        audit(v, 'verification_updated', { field: item, new_value: body.verified ? 'verified' : 'not verified' });
        return { ok: true, verification: ver };
      }),
    ),
  ],
  ['POST', /^\/accounts\/vendors\/([^/]+)\/approve$/, gate(A, 'approve vendors', withVendor((v) => approve(v)))],
  ['POST', /^\/accounts\/vendors\/([^/]+)\/reject$/, gate(A, 'reject vendors', withVendor((v, body) => reject(v, body)))],
  ['POST', /^\/accounts\/vendors\/([^/]+)\/request-correction$/, gate(A, 'request corrections', withVendor((v, body) => correction(v, body)))],
  ['PUT', /^\/accounts\/vendors\/([^/]+)\/status$/, gate(A, 'change a vendor’s status', withVendor((v, body) => setStatus(v, body)))],
  ['PUT', /^\/accounts\/change-requests\/([^/]+)$/, gate(A, 'decide change requests', ([, id]: string[], body: unknown) => decideChange(id!, b(body)))],

  // vendor_bills.js
  ['GET', /^\/vendor-bills\/vendors$/, () => ({ ok: true, vendors: allVendors().filter((v) => v.status === 'approved').map((v) => ({ id: v.id, legalEntityName: String(v.data.legalEntityName || ''), tradeName: String(v.data.tradeName || '') })) })],
  ['GET', /^\/vendor-bills\/accounts-all$/, gate(A, 'view the Accounts vendor bill queue', () => ({ ok: true, bills: allBills().filter((r) => ACCOUNTS_STAGE.includes(r.bill.status)).map(view).sort((x, y) => y.created_at.localeCompare(x.created_at)) }))],
  ['GET', /^\/vendor-bills\/settings$/, gate(A, 'view the payment timeline', () => ({ ok: true, settings }))],
  [
    'PUT',
    /^\/vendor-bills\/settings$/,
    gate(A, 'change the payment timeline', (_p: string[], body: unknown) => {
      const days = Number(b(body).paymentTimelineDays);
      const message = String(b(body).paymentMessage || '').trim();
      if (!Number.isInteger(days) || days <= 0 || days > 365) return fail('Enter the number of working days (1 or more).', 400);
      if (!message) return fail('Enter the message submitters will read.', 400);
      settings = { payment_timeline_days: days, payment_message: message.slice(0, 500) };
      return { ok: true, settings };
    }),
  ],
  ['GET', /^\/vendor-bills\/by-vendor\/([^/]+)$/, gate(A, 'view vendor bills', ([, id]: string[]) => ({ ok: true, bills: allBills().filter((r) => r.bill.vendor_id === id).map(view).sort((x, y) => y.created_at.localeCompare(x.created_at)) }))],
  [
    'GET',
    /^\/vendor-bills\/versions\/([^/]+)\/file$/,
    ([, vid]) => {
      const row = allBills().find((r) => r.bill.version?.id === vid);
      if (!row) return notFound('File not found.');
      const fileData = row.file.fileData.startsWith('data:') ? (row.file.fileData.split(',')[1] ?? '') : row.file.fileData;
      return { ok: true, fileName: row.file.fileName, mimeType: row.file.mimeType, fileData: fileData || RECEIPT_B64 };
    },
  ],
  ['POST', /^\/vendor-bills\/([^/]+)\/accounts-accept$/, gate(A, 'accept vendor bills', ([, id]: string[]) => acceptBill(id!))],
  ['POST', /^\/vendor-bills\/([^/]+)\/accounts-reject$/, gate(A, 'reject vendor bills', ([, id]: string[], body: unknown) => rejectBill(id!, b(body)))],
  ['POST', /^\/vendor-bills\/([^/]+)\/payment\/start$/, gate(A, 'start vendor bill payment', ([, id]: string[]) => startBillPayment(id!))],
  [
    'GET',
    /^\/vendor-bills\/([^/]+)$/,
    ([, id]) => {
      const row = findBill(id!);
      if (!row) return notFound('Bill not found.');
      const x = BILL_EXTRAS.get(id!);
      if (!A.includes(role()) && x?.submitted_by !== ME.id && x?.keka_owner_user_id !== ME.id) return fail('You do not have permission to view this bill.', 403);
      const bill = view(row);
      return { ok: true, bill, versions: bill.version ? [bill.version] : [] };
    },
  ],

  // vendor_agreements.js
  [
    'GET',
    /^\/vendor-agreements\/mine$/,
    (_p, _b, q) => {
      const vendorId = q.get('vendorId') || '';
      const projectId = q.get('projectId') || '';
      const kekaCode = (q.get('kekaCode') || '').toLowerCase();
      const isOverseer = overseer();
      const rows = agreementRows()
        .filter((a) => isOverseer || AGREEMENT_EXTRAS.get(a.id)?.created_by === ME.id)
        .map(agreementView)
        .filter((a) => (!vendorId || a.vendor_id === vendorId) && (!projectId || a.project_id === projectId) && (!kekaCode || String(a.keka_code || '').toLowerCase() === kekaCode))
        .sort((x, y) => y.created_at.localeCompare(x.created_at));
      return { ok: true, agreements: rows, isOverseer };
    },
  ],
  ['GET', /^\/vendor-agreements\/pending-my-signature$/, () => ({ ok: true, agreements: agreementRows().filter((a) => a.status === 'pending_internal_signature' && AGREEMENT_EXTRAS.get(a.id)?.signer_id === ME.id).map(agreementView) })],
  [
    'GET',
    /^\/vendor-agreements\/([^/]+)\/draft$/,
    ([, id]) => {
      const a = findAgreement(id!);
      if (!a) return notFound('Agreement not found.');
      if (!mayView(a)) return fail('You do not have permission to view this agreement.', 403);
      return { ok: true, fileName: a.draft_file_name ?? 'Agreement.pdf', mimeType: a.draft_mime_type ?? 'application/pdf', fileData: a.draft_file_data };
    },
  ],
  [
    'GET',
    /^\/vendor-agreements\/([^/]+)\/signature$/,
    ([, id]) => {
      const a = findAgreement(id!);
      if (!a) return notFound('Agreement not found.');
      if (!mayView(a)) return fail('You do not have permission to view this agreement.', 403);
      if (!a.signature_file_data) return notFound('This agreement has not been signed yet.');
      return { ok: true, signatureType: a.signature_type, mimeType: a.signature_mime_type || 'image/png', fileData: a.signature_file_data, signedAt: a.signed_at };
    },
  ],
  [
    'GET',
    /^\/vendor-agreements\/([^/]+)\/internal-signature$/,
    ([, id]) => {
      const a = findAgreement(id!);
      const x = AGREEMENT_EXTRAS.get(id!);
      if (!a) return notFound('Agreement not found.');
      if (!mayView(a)) return fail('You do not have permission to view this agreement.', 403);
      if (!a.internal_signed_at) return notFound('This agreement has not been countersigned yet.');
      return { ok: true, signatureType: x?.internal_type ? 'drawn' : 'drawn', mimeType: x?.internal_type || 'image/png', fileData: x?.internal_file || a.signature_file_data || '', signedAt: a.internal_signed_at, signerName: a.signer_name };
    },
  ],
  ['PUT', /^\/vendor-agreements\/([^/]+)\/deadline$/, ([, id], body) => extendDeadline(id!, b(body))],
  ['POST', /^\/vendor-agreements\/([^/]+)\/sign$/, ([, id], body) => countersign(id!, b(body))],

  // reimbursements.js (Accounts' stage)
  [
    'GET',
    /^\/reimbursements\/accounts-all$/,
    gate(REIMB_VIEW, 'view the Accounts reimbursement queue', () => ({
      ok: true,
      reimbursements: reimbursementStore
        .filter((r) => ['pending_accounts_approval', 'ready_for_payment', 'payment_processing', 'received', 'not_received'].includes(String(r.status)) || (r.status === 'rejected' && r.rejected_stage === 'accounts'))
        .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at))),
    })),
  ],
  ['POST', /^\/reimbursements\/([^/]+)\/accounts-authorize$/, gate(['accounts'], 'authorize reimbursements', ([, id]: string[]) => authorizeClaim(id!))],
  ['POST', /^\/reimbursements\/([^/]+)\/accounts-reject$/, gate(['accounts'], 'reject reimbursements', ([, id]: string[], body: unknown) => rejectClaim(id!, b(body)))],
  ['POST', /^\/reimbursements\/([^/]+)\/payment\/start$/, gate(['accounts'], 'start reimbursement payment', ([, id]: string[]) => startClaimPayment(id!))],

  // server.js petty cash (Accounts' stage)
  ['POST', /^\/petty_cash_requests\/([^/]+)\/accounts-approve$/, gate(['accounts'], 'give Accounts approval on petty cash', ([, id]: string[]) => authorizePetty(id!))],
  ['POST', /^\/petty_cash_requests\/([^/]+)\/accounts-reject$/, gate(['accounts'], 'reject petty cash at the Accounts stage', ([, id]: string[], body: unknown) => rejectPetty(id!, b(body)))],
  ['POST', /^\/petty_cash_requests\/([^/]+)\/payment\/start$/, gate(['accounts'], 'start petty cash payment', ([, id]: string[]) => startPettyPayment(id!))],
  ['POST', /^\/petty_cash_bills\/([^/]+)\/approve$/, gate(['accounts'], 'approve petty cash bills', ([, id]: string[], body: unknown) => decideOldBill(id!, true, b(body)))],
  ['POST', /^\/petty_cash_bills\/([^/]+)\/reject$/, gate(['accounts'], 'reject petty cash bills', ([, id]: string[], body: unknown) => decideOldBill(id!, false, b(body)))],
  ['GET', /^\/petty_cash_bill_submissions$/, gate(PETTY_ADMIN, 'view every petty cash bill', (_p: string[], _b: unknown, q: URLSearchParams) => allSubmissions(q))],
  ['GET', /^\/petty_cash_bill_submissions\/statement\/([^/]+)$/, ([, batchId], _b, q) => statement(batchId!, q.get('request') || '')],
  ['POST', /^\/petty_cash_bill_submissions\/([^/]+)\/reject$/, gate(['accounts'], 'reject a petty cash bill', ([, id]: string[], body: unknown) => rejectSubmission(id!, b(body)))],
  ['POST', /^\/petty_cash_departments$/, gate(PETTY_ADMIN, 'manage expense types', (_p: string[], body: unknown) => addHead(b(body)))],
  ['PUT', /^\/petty_cash_departments\/([^/]+)$/, gate(PETTY_ADMIN, 'manage expense types', ([, id]: string[], body: unknown) => patchHead(id!, b(body)))],
  ['DELETE', /^\/petty_cash_departments\/([^/]+)$/, gate(PETTY_ADMIN, 'manage expense types', ([, id]: string[]) => deleteHead(id!))],
];

// For the other domains (e.g. the project owner's vendor bill approvals in the work domain): the same
// vendor bills Accounts sees, in the server's Accounts shape.
export const accountsBillsView = () => allBills().map(view);
