// The vendor demo's records — one vendor per "Afzal Vendor" persona (demo/vendor/personas.ts) — and the
// in-memory store the vendor routes (demo/vendor/routes.ts) read and change.
//
// Each record has the shape of the server's own rows (vendor.js `vendors` + vendor_documents,
// vendor_bills.js bills + versions, vendor_agreements.js, vendor_change_requests), so the routes can
// follow the server's handlers step for step and build /vendor/me with vendorSelfView's rules.
// It is one business, "Afzal Studios & Co.", at five points of its life with Tamada. Every identifier
// is made up (the PAN and GSTIN read AFZ…1234…), the bank accounts are samples, and none of it exists
// in DASH. A record is rebuilt from its starting point each time its persona is picked, so a pick
// always opens the state its name promises; changes last until the next pick or an app restart.

import type {
  AadhaarVerification,
  BankVerification,
  BillStatus,
  ChangeRequest,
  Declaration206ab,
  DocStatus,
  GstVerification,
  KycStage,
  PanVerification,
  VendorAgreement,
  VendorBill,
  VendorStatus,
} from '@/api/vendor';
import { DEMO_PHONE } from '@/demo/config';
import { addDays, hex6, istIso, RECEIPT_PNG, today } from '@/demo/state';
import { AGREEMENT_PDF, DECLARATION_PDF, DOCUMENT_PDF, INVOICE_PDF, SIGNATURE_PNG } from '@/demo/vendor/files';

export const VENDOR_PERSONA_IDS = ['approved', 'registering', 'kyc_pending', 'under_review', 'changes'] as const;
export type VendorPersonaId = (typeof VENDOR_PERSONA_IDS)[number];
export const isVendorPersonaId = (s: unknown): s is VendorPersonaId => VENDOR_PERSONA_IDS.includes(s as VendorPersonaId);

// ── Record shapes (the server's rows) ────────────────────────────────────────
type Bank = BankVerification & { supersededByManualEntry?: boolean; supersededAt?: string };

/** vendors.data — the fields the portal reads or writes (PUT /vendor/registration may add others). */
export type VendorData = {
  legalEntityName?: string;
  tradeName?: string;
  businessType?: string;
  brandName?: string;
  registeredAddress?: string;
  contactPerson?: string;
  designation?: string;
  email?: string;
  pocEmail?: string;
  pan?: string;
  panLinkedToAadhaar?: boolean | null;
  panAadhaarCheck?: { status: string; at: string | null; note: string } | null;
  gstStatus?: string;
  gstin?: string;
  nonGstReason?: string;
  nonGstReasonText?: string;
  msmeRegistered?: boolean | string;
  msmeNumber?: string;
  bankAccountName?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  branchName?: string;
  branchAddress?: string;
  bankDetailsSource?: string;
  declaration206ab?: Declaration206ab;
  kyc?: { status?: string; stages?: Record<string, KycStage> };
  panVerification?: PanVerification | null;
  gstVerification?: GstVerification | null;
  aadhaarVerification?: AadhaarVerification | null;
  bankVerification?: Bank | null;
  correction?: { items?: string[]; comments?: string; by?: string; at?: string } | null;
  rejectionReason?: string;
  rejectedAt?: string;
  approvedAt?: string;
  submittedAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
};

/** vendor_documents (the current, non-superseded row of each type). fileData is bare base64. */
export type DocRow = {
  docType: string;
  fileName: string;
  mimeType: string;
  fileData: string;
  status: DocStatus;
  version: number;
  uploadedAt: string;
  remarks: string;
  generated: boolean;
  signature: { reference: string; signedAt: string; signatoryName: string } | null;
};

export type StoredFile = { fileName: string; mimeType: string; fileData: string };
export type BillRow = { bill: VendorBill; file: StoredFile };
export type AgreementRow = VendorAgreement & { draft_file_data: string; signature_file_data: string | null; signature_mime_type: string | null };

export type VendorRecord = {
  id: string;
  status: VendorStatus;
  contactPhone: string;
  email: string;
  vendorCode: string | null;
  hasPassword: boolean;
  data: VendorData;
  docs: DocRow[];
  bills: BillRow[];
  agreements: AgreementRow[];
  changeRequests: ChangeRequest[];
};

// ── The business ─────────────────────────────────────────────────────────────
export const VENDOR_PHONE = `+91${DEMO_PHONE}`;
const EMAIL = 'hello@afzalstudios.example';
// Tamada contacts — people on the demo company's roster (fixtures/org.ts), as the server requires.
const POC_DEEPA = 'deepa.menon.demo@tamadamedia.com';
const POC_PRIYA = 'priya.sharma.demo@tamadamedia.com';

/** The firm (GST registered). */
const FIRM = {
  legalName: 'Afzal Studios & Co.',
  tradeName: 'Afzal Studios',
  pan: 'AFZFA1234D',
  panHolder: 'AFZAL STUDIOS AND CO',
  gstin: '36AFZFA1234D1Z5',
  address: 'Plot 12, Road No. 7, Film Nagar, Jubilee Hills, Hyderabad, Telangana 500096',
  bank: {
    accountName: 'AFZAL STUDIOS AND CO',
    bankName: 'HDFC Bank',
    accountNumber: '50200012345678',
    ifsc: 'HDFC0001234',
    branchName: 'Jubilee Hills',
    branchAddress: 'Road No. 36, Jubilee Hills, Hyderabad 500033',
  },
};

/** Its owner as an individual, for the not-GST-registered sign-up. */
const OWNER = {
  pan: 'AFZPA5678K',
  panHolder: 'AFZAL',
  aadhaarName: 'Afzal',
  aadhaarLast4: '4321',
  address: 'H.No. 8-2-293/82, Road No. 5, Banjara Hills, Hyderabad, Telangana 500034',
  bank: {
    accountName: 'AFZAL',
    bankName: 'State Bank of India',
    accountNumber: '30876543210',
    ifsc: 'SBIN0012345',
    branchName: 'Banjara Hills',
    branchAddress: 'Road No. 2, Banjara Hills, Hyderabad 500034',
  },
};

// ── Small helpers ────────────────────────────────────────────────────────────
/** An India-time instant `n` days from today (negative = ago). */
export const dayAt = (n: number, at = '10:30') => istIso(addDays(today(), n), at);
const ymd = (n: number) => addDays(today(), n);
const bytesOf = (b64: string) => Math.floor((b64.length * 3) / 4);
export const RECEIPT_B64 = RECEIPT_PNG.split(',')[1] ?? '';
/** 8 well-mixed hex characters from a string (FNV-1a, then a murmur-style finish). */
function hex8(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0).toString(16).padStart(8, '0');
}
/** 16 upper-case hex characters, like the server's signature references. */
export const reference = (seed: string) => `${hex8(`a|${seed}`)}${hex8(`b|${seed}`)}`.toUpperCase();

export const DOC_LABEL: Record<string, string> = {
  pan: 'PAN Card',
  aadhaar: 'Aadhaar Card',
  gst_certificate: 'GST Certificate',
  non_gst_declaration: 'Non-GST Declaration',
  msme_certificate: 'MSME / Udyam Certificate',
  bank_proof: 'Cancelled Cheque / Bank Passbook',
  declaration_206ab: 'Section 206AB Declaration',
};

/** Store a document as the current one of its type (the previous one is superseded, its version + 1). */
export function putDoc(v: VendorRecord, row: Omit<DocRow, 'version'>): DocRow {
  const prev = v.docs.find((d) => d.docType === row.docType);
  const doc: DocRow = { ...row, version: prev ? prev.version + 1 : 1 };
  v.docs = prev ? v.docs.map((d) => (d === prev ? doc : d)) : [...v.docs, doc];
  return doc;
}

const DIGIO_REMARK = 'Auto-fetched from Digio KYC verification — soft copy, not vendor-uploaded.';

/** Digio's soft copy of a document, stored once verification succeeds (vendor.js fetchAndStoreDigioDocument). */
function digioDoc(v: VendorRecord, docType: string, at: string) {
  putDoc(v, {
    docType,
    fileName: `${DOC_LABEL[docType] ?? docType} (via Digio KYC).pdf`,
    mimeType: 'application/pdf',
    fileData: DOCUMENT_PDF,
    status: 'verified',
    uploadedAt: at,
    remarks: DIGIO_REMARK,
    generated: false,
    signature: null,
  });
}

// ── Digio (simulated) ────────────────────────────────────────────────────────
/** POST /vendor/kyc/start's effect: the identity stage is running. */
export function startKycStage(v: VendorRecord, gstStatus: string, at: string) {
  const d = v.data;
  const stages = { ...(d.kyc?.stages ?? {}) };
  stages.identity = {
    requestId: `KID${Date.parse(at)}${hex6(`${v.id}:${at}`)}`.toUpperCase(),
    workflowName: gstStatus === 'registered' ? 'Vendor KYC — GST' : 'Vendor KYC — Non-GST (PAN)',
    gstStatus,
    status: 'in_progress',
    startedAt: at,
  };
  d.gstStatus = gstStatus;
  d.kyc = { ...(d.kyc ?? {}), stages, status: 'in_progress' };
  d.updatedAt = at;
}

/**
 * The Digio journey finishing (vendor.js applyDigioStageResult + fetchAndStoreDigioDocument): the
 * stage completes, PAN, GST or Aadhaar and the ₹1 bank check are verified, the bank details are copied
 * onto the record, and Digio's soft copies (PAN, GST certificate or Aadhaar, the cheque) are filed.
 */
export function completeKyc(v: VendorRecord, at: string) {
  const d = v.data;
  const stage = d.kyc?.stages?.identity;
  if (!stage) return;
  const gst = (stage.gstStatus || d.gstStatus) === 'registered';
  const bank = gst ? FIRM.bank : OWNER.bank;
  const pan: PanVerification = { verified: true, verifiedAt: at, pan: gst ? FIRM.pan : OWNER.pan, holderName: gst ? FIRM.panHolder : OWNER.panHolder };
  const gstVer: GstVerification | null = gst
    ? { verified: true, verifiedAt: at, legalName: FIRM.legalName, gstin: FIRM.gstin, address: FIRM.address, businessType: 'Firm' }
    : null;
  const aadhaar: AadhaarVerification | null = gst
    ? null
    : { verified: true, verifiedAt: at, nameOnAadhaar: OWNER.aadhaarName, last4: OWNER.aadhaarLast4, address: OWNER.address };
  const bankVer: Bank = { verified: true, verifiedAt: at, holderNameOnBank: bank.accountName, ...bank };
  const stages = { ...(d.kyc?.stages ?? {}) };
  stages.identity = { ...stage, status: 'completed', completedAt: at, digioStatus: 'success', awaitingDigioApproval: false };
  Object.assign(d, {
    panVerification: pan,
    ...(gstVer ? { gstVerification: gstVer } : {}),
    ...(aadhaar ? { aadhaarVerification: aadhaar } : {}),
    bankVerification: bankVer,
    bankAccountName: bank.accountName,
    bankName: bank.bankName,
    accountNumber: bank.accountNumber,
    ifsc: bank.ifsc,
    branchName: bank.branchName,
    branchAddress: bank.branchAddress,
    bankDetailsSource: 'digio',
    pan: pan.pan,
    gstin: gstVer?.gstin || d.gstin,
    legalEntityName: d.legalEntityName || gstVer?.legalName || '',
    // Aadhaar linking is a question for individual PANs only (vendor.js runPanAadhaarCheck).
    panAadhaarCheck: gst
      ? { status: 'not_applicable', at, note: 'PAN–Aadhaar linking applies only to individual PANs.' }
      : { status: 'linked', at, note: '' },
    kyc: { ...(d.kyc ?? {}), stages, status: 'completed' },
    updatedAt: at,
  });
  digioDoc(v, 'pan', at);
  digioDoc(v, gst ? 'gst_certificate' : 'aadhaar', at);
  digioDoc(v, 'bank_proof', at);
}

// ── Building blocks for the personas ─────────────────────────────────────────
function blank(id: VendorPersonaId, status: VendorStatus): VendorRecord {
  return {
    id: `vnd-demo-${id.replace(/_/g, '-')}`,
    status,
    contactPhone: VENDOR_PHONE,
    email: EMAIL,
    vendorCode: null,
    hasPassword: true,
    data: { email: EMAIL },
    docs: [],
    bills: [],
    agreements: [],
    changeRequests: [],
  };
}

/** The tax declaration (Annexure 1) as a complete firm fills it in. */
const firm206ab = (signedOn: string): Declaration206ab => ({
  entityType: 'Firm',
  itrFiled2425: 'yes',
  itrAck2425: '612345678901234',
  itrDate2425: '2025-07-28',
  itrReason2425: '',
  itrFiled2324: 'yes',
  itrAck2324: '598765432109876',
  itrDate2324: '2024-07-26',
  itrReason2324: '',
  tdsOver50k: 'no',
  declarantName: 'Afzal',
  declarationDate: signedOn,
  declarationPlace: 'Hyderabad',
});

/** A GST-registered firm whose registration is complete: verified with Digio, every answer given. */
function completeFirm(v: VendorRecord, o: { verifiedDaysAgo: number; msme: boolean }) {
  const startedAt = dayAt(-o.verifiedDaysAgo, '11:05');
  const at = dayAt(-o.verifiedDaysAgo, '11:12');
  Object.assign(v.data, {
    email: EMAIL,
    pocEmail: POC_DEEPA,
    gstStatus: 'registered',
    nonGstReason: '',
    nonGstReasonText: '',
  });
  startKycStage(v, 'registered', startedAt);
  completeKyc(v, at);
  Object.assign(v.data, {
    legalEntityName: FIRM.legalName,
    tradeName: FIRM.tradeName,
    businessType: 'Firm',
    brandName: FIRM.tradeName,
    registeredAddress: FIRM.address,
    contactPerson: 'Afzal',
    designation: 'Managing Partner',
    msmeRegistered: o.msme,
    msmeNumber: o.msme ? 'UDYAM-TS-02-0012345' : '',
    declaration206ab: firm206ab(ymd(-o.verifiedDaysAgo)),
  });
  if (o.msme) {
    putDoc(v, {
      docType: 'msme_certificate',
      fileName: 'Udyam-Registration-Certificate.pdf',
      mimeType: 'application/pdf',
      fileData: DOCUMENT_PDF,
      status: 'pending',
      uploadedAt: dayAt(-o.verifiedDaysAgo, '11:40'),
      remarks: '',
      generated: false,
      signature: null,
    });
  }
}

/** The signed tax declaration, as POST /vendor/declarations/declaration_206ab/sign files it. */
function signed206ab(v: VendorRecord, signedAt: string, status: DocStatus, remarks = '') {
  const ref = reference(`${v.id}:206ab:${signedAt}`);
  putDoc(v, {
    docType: 'declaration_206ab',
    fileName: `206AB-Declaration-${ref}.pdf`,
    mimeType: 'application/pdf',
    fileData: DECLARATION_PDF,
    status,
    uploadedAt: signedAt,
    remarks,
    generated: true,
    signature: { reference: ref, signedAt, signatoryName: 'Afzal' },
  });
}

// ── Bills (vendor_bills.js: raised by Tamada staff; the vendor only reads them) ─────────────
type BillSeed = {
  status: BillStatus;
  amount: number;
  description: string;
  daysAgo: number;
  file: 'pdf' | 'png';
  version?: number;
  kekaNeeded?: boolean;
  advance?: boolean;
};

const BILL_SEEDS: BillSeed[] = [
  { status: 'pending_keka_approval', amount: 48000, description: 'Colour grading — Nimbus Fintech explainer, episode 3', daysAgo: 2, file: 'pdf' },
  { status: 'pending_keka_reapproval', amount: 36500, description: 'Sound mix — Tamada Showreel 2026 (corrected bill)', daysAgo: 4, file: 'pdf', version: 2 },
  { status: 'pending_accounts_approval', amount: 12000, description: 'Studio hire — 2 days, Film Nagar floor', daysAgo: 6, file: 'png', kekaNeeded: false },
  { status: 'rejected_keka', amount: 9500, description: 'Travel — outstation recce, Warangal', daysAgo: 8, file: 'png' },
  { status: 'accepted', amount: 65000, description: 'Camera crew — Kisan Agro launch film shoot', daysAgo: 10, file: 'pdf' },
  { status: 'rejected_accounts', amount: 14750, description: 'Props and set dressing — Diwali ad film', daysAgo: 12, file: 'pdf' },
  { status: 'payment_processing', amount: 25000, description: 'Advance — Diwali ad film shoot', daysAgo: 14, file: 'pdf', advance: true },
  { status: 'not_received', amount: 22000, description: 'Gimbal and light rental — 3 days', daysAgo: 25, file: 'png' },
  { status: 'received', amount: 82500, description: 'Drone footage — Spice Route travel vlogs', daysAgo: 30, file: 'pdf' },
  { status: 'received', amount: 18000, description: 'Voice-over recording — Nimbus explainer', daysAgo: 45, file: 'pdf' },
];

const KEKA_DONE: BillStatus[] = ['pending_accounts_approval', 'accepted', 'payment_processing', 'received', 'not_received', 'rejected_accounts'];
const AUTHORISED: BillStatus[] = ['accepted', 'payment_processing', 'received', 'not_received'];

function bills(v: VendorRecord): BillRow[] {
  return BILL_SEEDS.map((s, i): BillRow => {
    const n = i + 1;
    const id = `vb-demo-${n}`;
    const versionNo = s.version ?? 1;
    const versionId = `vbv-demo-${n}-${versionNo}`;
    const kekaNeeded = s.kekaNeeded ?? true;
    const created = dayAt(-s.daysAgo, '12:15');
    const stamp = (after: number) => dayAt(-s.daysAgo + after, '16:40');
    const pdf = s.file === 'pdf';
    const fileData = pdf ? INVOICE_PDF : RECEIPT_B64;
    const fileName = pdf ? `AFZ-INV-2026-${String(100 + n).padStart(3, '0')}.pdf` : `Receipt-${String(100 + n)}.png`;
    const kekaApproved = kekaNeeded && KEKA_DONE.includes(s.status) ? stamp(1) : null;
    const accountsAccepted = AUTHORISED.includes(s.status) ? stamp(2) : null;
    const updated =
      s.status === 'received' ? stamp(6) : s.status === 'not_received' ? stamp(7) : s.status === 'payment_processing' ? stamp(3) : accountsAccepted ?? kekaApproved ?? created;
    const mimeType = pdf ? 'application/pdf' : 'image/png';
    const bill: VendorBill = {
      id,
      vendor_id: v.id,
      status: s.status,
      current_version: versionNo,
      is_advance: !!s.advance,
      created_at: created,
      updated_at: updated,
      version: {
        id: versionId,
        bill_id: id,
        version_no: versionNo,
        amount: s.amount,
        description: s.description,
        file_name: fileName,
        mime_type: mimeType,
        file_size: bytesOf(fileData),
        status: s.status,
        keka_approval_required: kekaNeeded,
        keka_approved_at: kekaApproved,
        keka_rejected_at: s.status === 'rejected_keka' ? stamp(1) : null,
        accounts_accepted_at: accountsAccepted,
        accounts_rejected_at: s.status === 'rejected_accounts' ? stamp(2) : null,
        created_at: versionNo > 1 ? dayAt(-1, '09:50') : created,
      },
    };
    return { bill, file: { fileName, mimeType, fileData } };
  });
}

// ── Agreements (vendor_agreements.js) ────────────────────────────────────────
type AgreementSeed = {
  project: string;
  by: string;
  createdDaysAgo: number;
  deadline: number | null; // days from today
  internal: string | null; // the Tamada countersigner
  signedDaysAgo?: number;
  countersignedDaysAgo?: number;
};

const AGREEMENT_SEEDS: AgreementSeed[] = [
  { project: 'Kisan Agro — Product Launch Film', by: 'Deepa Menon', createdDaysAgo: 1, deadline: 3, internal: 'Arvind Menon' },
  { project: 'Nimbus Fintech — Explainer Series, episodes 4 to 6', by: 'Priya Sharma', createdDaysAgo: 2, deadline: 9, internal: null },
  { project: 'Diwali Ad Film — Crew Agreement', by: 'Deepa Menon', createdDaysAgo: 12, deadline: -2, internal: 'Arvind Menon' },
  { project: 'Tamada Showreel 2026 — Footage Licence', by: 'Priya Sharma', createdDaysAgo: 9, deadline: -2, internal: 'Kiran Rao', signedDaysAgo: 5 },
  { project: 'Spice Route Travel Vlogs — Drone Services', by: 'Deepa Menon', createdDaysAgo: 64, deadline: -57, internal: 'Arvind Menon', signedDaysAgo: 60, countersignedDaysAgo: 58 },
  { project: 'Master Services Agreement 2026', by: 'Ramesh Gupta', createdDaysAgo: 121, deadline: null, internal: null, signedDaysAgo: 119 },
];

const slug = (s: string) =>
  s
    .replace(/[—,]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('-')
    .replace(/[^A-Za-z0-9-]/g, '');

function agreements(v: VendorRecord): AgreementRow[] {
  return AGREEMENT_SEEDS.map((s, i): AgreementRow => {
    const id = `vag-demo-${i + 1}`;
    const signedAt = s.signedDaysAgo !== undefined ? dayAt(-s.signedDaysAgo, '17:20') : null;
    const counterAt = s.countersignedDaysAgo !== undefined ? dayAt(-s.countersignedDaysAgo, '12:05') : null;
    const status = !signedAt ? 'pending_signature' : s.internal && !counterAt ? 'pending_internal_signature' : 'signed';
    return {
      id,
      vendor_id: v.id,
      project_name: s.project,
      deadline_at: s.deadline === null ? null : dayAt(s.deadline, '18:00'),
      status,
      created_by_name: s.by,
      created_at: dayAt(-s.createdDaysAgo, '15:30'),
      sign_positions: [
        { page: 2, x: 0.12, y: 0.64, signer: 'vendor' },
        ...(s.internal ? [{ page: 2, x: 0.56, y: 0.64, signer: 'internal' as const }] : []),
      ],
      draft_file_name: `${slug(s.project)}-Agreement.pdf`,
      draft_mime_type: 'application/pdf',
      signature_type: signedAt ? 'drawn' : null,
      signature_reference: signedAt ? reference(`${id}:${signedAt}`) : null,
      signed_at: signedAt,
      signer_name: s.internal,
      internal_signature_reference: counterAt ? reference(`${id}:internal:${counterAt}`) : null,
      internal_signed_at: counterAt,
      draft_file_data: AGREEMENT_PDF,
      signature_file_data: signedAt ? SIGNATURE_PNG : null,
      signature_mime_type: signedAt ? 'image/png' : null,
    };
  });
}

function changeRequests(): ChangeRequest[] {
  return [
    {
      id: 'vcr-demo-3',
      field: 'ifsc',
      prev_value: FIRM.bank.ifsc,
      new_value: 'HDFC0004321',
      status: 'pending',
      reason: 'Our account moved to the Banjara Hills branch.',
      requested_at: dayAt(-2, '10:05'),
      reviewed_at: null,
      review_note: null,
    },
    {
      id: 'vcr-demo-2',
      field: 'legalEntityName',
      prev_value: FIRM.legalName,
      new_value: 'Afzal Studios LLP',
      status: 'rejected',
      reason: 'We are converting the firm to an LLP.',
      requested_at: dayAt(-20, '14:30'),
      reviewed_at: dayAt(-18, '11:10'),
      review_note: 'Send the LLP certificate and the new PAN first. We can change the name after that.',
    },
    {
      id: 'vcr-demo-1',
      field: 'bankName',
      prev_value: 'HDFC Bank Ltd',
      new_value: FIRM.bank.bankName,
      status: 'approved',
      reason: 'To match the name on our cheque.',
      requested_at: dayAt(-40, '16:00'),
      reviewed_at: dayAt(-38, '10:20'),
      review_note: 'Updated.',
    },
  ];
}

// ── The personas' starting points ────────────────────────────────────────────
function build(id: VendorPersonaId): VendorRecord {
  switch (id) {
    // Approved since ~4 months: bills in every state, agreements to sign / expired / signed, change requests.
    case 'approved': {
      const v = blank(id, 'approved');
      completeFirm(v, { verifiedDaysAgo: 127, msme: true });
      signed206ab(v, dayAt(-126, '12:10'), 'verified');
      for (const d of v.docs) d.status = 'verified';
      v.vendorCode = 'TM/V-014';
      Object.assign(v.data, { submittedAt: dayAt(-126, '12:20'), approvedAt: dayAt(-120, '15:45'), correction: null });
      v.bills = bills(v);
      v.agreements = agreements(v);
      v.changeRequests = changeRequests();
      return v;
    }
    // Signed up as an individual (not GST registered); Digio done; business details are next.
    case 'registering': {
      const v = blank(id, 'mobile_verified');
      Object.assign(v.data, { email: EMAIL, pocEmail: POC_PRIYA, nonGstReason: 'turnover_below_limit', nonGstReasonText: '' });
      startKycStage(v, 'not_registered', dayAt(-1, '18:02'));
      completeKyc(v, dayAt(-1, '18:09'));
      return v;
    }
    // Contact details and GST answered; the Digio check (ID and bank) has not been started.
    case 'kyc_pending': {
      const v = blank(id, 'mobile_verified');
      Object.assign(v.data, { email: EMAIL, pocEmail: POC_DEEPA, gstStatus: 'registered', updatedAt: dayAt(0, '09:15') });
      return v;
    }
    // Sent for approval two days ago; Accounts has not looked yet.
    case 'under_review': {
      const v = blank(id, 'pending_verification');
      completeFirm(v, { verifiedDaysAgo: 3, msme: false });
      signed206ab(v, dayAt(-2, '19:05'), 'pending');
      v.vendorCode = 'TM/V-021';
      Object.assign(v.data, { submittedAt: dayAt(-2, '19:12'), correction: null });
      return v;
    }
    // Sent last week; yesterday Accounts asked for a clearer cheque and the tax declaration signed again.
    case 'changes': {
      const v = blank(id, 'correction_required');
      completeFirm(v, { verifiedDaysAgo: 7, msme: false });
      signed206ab(v, dayAt(-6, '13:30'), 'pending');
      v.vendorCode = 'TM/V-019';
      const correction = {
        items: ['bank_proof', 'declaration_206ab'],
        comments: 'The cheque photo is blurry. Please upload a clearer one, and sign the tax form again with the full 2024-25 acknowledgement number.',
        by: 'Ramesh Gupta',
        at: dayAt(-1, '15:40'),
      };
      Object.assign(v.data, { submittedAt: dayAt(-6, '13:35'), correction });
      v.data.declaration206ab = { ...v.data.declaration206ab, itrAck2425: '61234567890123' };
      for (const d of v.docs) {
        if (correction.items.includes(d.docType)) {
          d.status = 'correction_required';
          d.remarks = correction.comments;
        }
      }
      return v;
    }
  }
}

// ── The store ────────────────────────────────────────────────────────────────
const records = new Map<VendorPersonaId, VendorRecord>();

/** Put a persona's vendor back at its starting point (each time it is picked). */
export function resetVendor(id: VendorPersonaId): VendorRecord {
  const v = build(id);
  records.set(id, v);
  return v;
}

/** The persona's vendor as it is now (built on first use, e.g. after an app restart). */
export const vendorRecord = (id: VendorPersonaId) => records.get(id) ?? resetVendor(id);

// Vendor IDs handed out on submission (TM/V-001 style; the personas above hold 014, 019 and 021).
let nextCode = 23;
export const assignVendorCode = () => `TM/V-${String(nextCode++).padStart(3, '0')}`;
