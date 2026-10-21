// Vendor portal endpoints — the same ones the website's vendor portal (dash.html VendorPortal,
// ~line 30535-32900) calls:
//   vendor.js             /vendor/auth/*, /vendor/me, /vendor/registration(+/submit), /vendor/documents,
//                         /vendor/declarations/:type/*, /vendor/kyc/start|status, /vendor/change-requests
//   vendor_bills.js       /vendor/bills, /vendor/bills/versions/:id/file   (read-only for vendors)
//   vendor_agreements.js  /vendor/agreements, /:id/draft, /:id/signature, /:id/sign
//
// The vendor's bearer token lives in the shared session store (kind 'vendor'). Vendor routes reply to
// a dead/expired session with 401 "Sign in to continue." and WITHOUT the client's auth_required code,
// so vcall() signs out on that exact reply (the website drops its token the same way). Other 401s —
// a wrong password, a stale WhatsApp proof while signing — are real answers and are left alone.

import { useQuery } from '@tanstack/react-query';

import { api, apiFetch, ApiRequestError, type ApiResult, isApiError, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';
import { API_URL } from '@/config';

// ── Types (vendor.js vendorSelfView ~L1496, /vendor/me ~L1764) ──────────────────
export type VendorStatus =
  | 'draft'
  | 'mobile_verified'
  | 'submitted'
  | 'pending_verification'
  | 'correction_required'
  | 'approved'
  | 'rejected'
  | 'inactive';

export type KycStage = {
  requestId?: string;
  workflowName?: string;
  gstStatus?: string;
  status?: 'in_progress' | 'completed' | 'rejected' | 'expired' | 'failed' | string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  digioStatus?: string;
  awaitingDigioApproval?: boolean;
};

export type PanVerification = { verified: boolean; verifiedAt?: string; holderName?: string; pan?: string };
export type GstVerification = {
  verified: boolean;
  verifiedAt?: string;
  legalName?: string;
  gstin?: string;
  address?: string;
  businessType?: string;
  incomplete?: boolean;
};
export type AadhaarVerification = { verified: boolean; verifiedAt?: string; nameOnAadhaar?: string; last4?: string; address?: string };
export type BankVerification = {
  verified: boolean;
  verifiedAt?: string;
  holderNameOnBank?: string;
  accountName?: string;
  accountNumber?: string; // masked in /vendor/me
  ifsc?: string;
  bankName?: string;
  branchName?: string;
  branchAddress?: string;
  incomplete?: boolean;
};

export type DocStatus = 'pending' | 'verified' | 'correction_required' | 'not_applicable';
export type VendorDocument = {
  docType: string;
  label: string;
  fileName: string;
  status: DocStatus;
  version: number;
  uploadedAt: string | null;
  remarks: string;
  generated: boolean;
  reference: string | null;
  signedAt: string | null;
  signedBy: string | null;
};

export type Declaration206ab = {
  entityType?: string;
  itrFiled2425?: string;
  itrAck2425?: string;
  itrDate2425?: string;
  itrReason2425?: string;
  itrFiled2324?: string;
  itrAck2324?: string;
  itrDate2324?: string;
  itrReason2324?: string;
  tdsOver50k?: string;
  declarantName?: string;
  declarationDate?: string;
  declarationPlace?: string;
};

export type Vendor = {
  id: string;
  status: VendorStatus;
  contactNumber: string;
  email: string | null;
  vendorCode: string | null;
  business: {
    legalEntityName: string;
    tradeName: string;
    businessType: string;
    brandName: string;
    registeredAddress: string;
    contactPerson: string;
    designation: string;
    pocEmail: string;
  };
  tax: {
    pan: string;
    panLinkedToAadhaar: boolean | null;
    panHolderType: string;
    panAadhaarCheck: { status: 'linked' | 'not_linked' | 'not_applicable' | string; at: string | null; note: string } | null;
  };
  gst: { status: '' | 'registered' | 'not_registered'; gstin: string; nonGstReason: string; nonGstReasonText: string };
  kyc: {
    status: string;
    stages: Record<string, KycStage>;
    panVerification: PanVerification | null;
    gstVerification: GstVerification | null;
    aadhaarVerification: AadhaarVerification | null;
    bankVerification: BankVerification | null;
  };
  declaration206ab: Declaration206ab;
  msme: { registered: boolean; number: string };
  bank: {
    accountName: string;
    bankName: string;
    accountNumber: string; // masked
    ifsc: string;
    branchName: string;
    verified: boolean;
    verifiedAt: string | null;
    source: string;
    holderNameOnBank: string;
  };
  documents: VendorDocument[];
  correction: { items?: string[]; comments?: string; by?: string; at?: string } | null;
  rejection: { reason: string; at: string | null; by?: string } | null;
  approvedAt: string | null;
  submittedAt: string | null;
  hasPassword: boolean;
  googleLinked: boolean;
  checklist: { docType: string; label: string; required: boolean; uploaded: boolean }[];
  profileCompletion: number;
};

export type VendorSessionPayload = {
  ok: true;
  token: string;
  expiresAt: string | null;
  vendorId: string;
  status: VendorStatus;
  isNew?: boolean;
  resumed?: boolean;
};

export type KycStatus = {
  ok: true;
  status: string;
  stages: Record<string, KycStage>;
  gstVerification: GstVerification | null;
  panVerification: PanVerification | null;
  aadhaarVerification: AadhaarVerification | null;
  bankVerification: BankVerification | null;
  digioStatus: string;
};

export type DeclarationType = 'non_gst_declaration' | 'declaration_206ab';
export type DeclarationPreview = { ok: true; type: DeclarationType; title: string; addressedTo: string; lines: string[]; facts: [string, string][] };

export type ChangeRequest = {
  id: string;
  field: string;
  prev_value: string | null;
  new_value: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  reason: string | null;
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};

// vendor_bills.js forVendorBill(): the bill row minus Keka Code / owner / submitter / payment
// internals, plus its latest version (no file data).
export type BillStatus =
  | 'pending_keka_approval'
  | 'pending_keka_reapproval'
  | 'pending_accounts_approval'
  | 'accepted'
  | 'payment_processing'
  | 'received'
  | 'not_received'
  | 'rejected_keka'
  | 'rejected_accounts';

export type BillVersion = {
  id: string;
  bill_id: string;
  version_no: number;
  amount: number | string;
  description: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  status: string;
  keka_approval_required?: boolean;
  keka_approved_at?: string | null;
  keka_rejected_at?: string | null;
  accounts_accepted_at?: string | null;
  accounts_rejected_at?: string | null;
  created_at?: string;
};

export type VendorBill = {
  id: string;
  vendor_id: string;
  status: BillStatus | string;
  current_version: number;
  is_advance?: boolean;
  created_at: string;
  updated_at?: string | null;
  version: BillVersion | null;
};

export type SignPosition = { page: number; x: number; y: number; signer?: 'vendor' | 'internal' };

// vendor_agreements.js forVendor(): no keka_code, no file data, no signer_id.
export type VendorAgreement = {
  id: string;
  vendor_id: string;
  project_name: string;
  deadline_at: string | null;
  status: 'pending_signature' | 'pending_internal_signature' | 'signed' | string;
  created_by_name: string | null;
  created_at: string;
  sign_positions: SignPosition[] | null;
  draft_file_name: string | null;
  draft_mime_type: string | null;
  signature_type: 'drawn' | 'uploaded' | null;
  signature_reference: string | null;
  signed_at: string | null;
  signer_name: string | null;
  internal_signature_reference: string | null;
  internal_signed_at: string | null;
};

export type FilePayload = { ok: true; fileName?: string; mimeType?: string; fileData: string };

// ── Session-aware call ─────────────────────────────────────────────────────────
const SESSION_GONE = 'Sign in to continue.';

async function vcall<T>(p: Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  const r = await p;
  if (isApiError(r) && r.status === 401 && r.error === SESSION_GONE && useSession.getState().kind === 'vendor') {
    void useSession.getState().signOut();
  }
  return r;
}

const vget = <T>(path: string, signal?: AbortSignal) => vcall(api.get<T>(path, signal));
const vpost = <T>(path: string, body?: unknown, timeoutMs?: number) =>
  vcall(timeoutMs ? apiFetch<T>(path, { method: 'POST', body: body ?? {}, timeoutMs }) : api.post<T>(path, body));
const vput = <T>(path: string, body?: unknown) => vcall(api.put<T>(path, body));

// ── Sign-in (no session yet) ────────────────────────────────────────────────────
export const getVendorAuthMode = () => api.get<{ ok: true; otpBypass: boolean }>('/vendor/auth/mode');

// The proof token from /auth/phone/verify-otp — the server reads the phone number from it.
export const vendorWhatsAppVerify = (body: { proofToken: string; email: string } | { devBypass: true; contactNumber: string; email: string }) =>
  api.post<VendorSessionPayload>('/vendor/auth/whatsapp-verify', body);

export const vendorPasswordLogin = (contactNumber: string, password: string) =>
  api.post<VendorSessionPayload>('/vendor/auth/login', { contactNumber, password });

// The forced "create a password" step runs right after a brand-new vendor verifies, BEFORE the
// session is stored (storing it would switch the app into the portal), so the new token is sent
// explicitly here. Same never-throws contract as apiFetch.
export async function vendorSetPasswordWithToken(token: string, password: string): Promise<ApiResult<{ ok: true }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${API_URL}/vendor/auth/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password }),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: `Server error ${res.status}: unexpected response` };
    }
    if (!res.ok && data && typeof data === 'object' && !Array.isArray(data)) {
      if (!data.error) data.error = `Server error (${res.status})`;
      data.status = res.status;
    }
    return data;
  } catch (e: any) {
    return {
      error:
        e?.name === 'AbortError'
          ? 'Request timed out — the server took too long to respond.'
          : 'Cannot reach DASH. Check your internet connection and try again.',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Signed-in vendor ────────────────────────────────────────────────────────────
export const vendorSetPassword = (password: string) => vpost<{ ok: true }>('/vendor/auth/set-password', { password });

// The server revokes the session row; whatever it answers, the app forgets the token afterwards.
export async function vendorSignOut() {
  await api.post('/vendor/auth/logout', {});
  await useSession.getState().signOut();
}

export const VENDOR_ME_KEY = ['vendor', 'me'] as const;

export function useVendorMe() {
  return useQuery({
    queryKey: VENDOR_ME_KEY,
    queryFn: async ({ signal }) => {
      const r = await vget<{ ok: true; vendor: Vendor }>('/vendor/me', signal);
      if (isApiError(r)) {
        // The account behind this session is gone — same as the website, back to sign-in.
        if (r.status === 404 && useSession.getState().kind === 'vendor') void useSession.getState().signOut();
        throw new ApiRequestError(r);
      }
      return r.vendor;
    },
    staleTime: 15_000,
  });
}

export type RegistrationBody = Record<string, unknown>;
export type FieldErrors = Record<string, string>;
export type SaveResult = ApiResult<{ ok: true; saved: true }> & { fieldErrors?: FieldErrors };
export const saveVendorRegistration = (body: RegistrationBody) => vput<{ ok: true; saved: true }>('/vendor/registration', body) as Promise<SaveResult>;

export type SubmitResult = ApiResult<{ ok: true; status: VendorStatus; vendorCode: string | null; message: string }> & {
  fieldErrors?: FieldErrors;
  missingDocuments?: { docType: string; label: string }[];
};
export const submitVendorRegistration = () =>
  vpost<{ ok: true; status: VendorStatus; vendorCode: string | null; message: string }>('/vendor/registration/submit', {}, 30000) as Promise<SubmitResult>;

// fileData is the bare base64 (the website strips the data: prefix; the server accepts either).
// Uploads of up to 8 MB on a phone network need far longer than the default 12 s.
export const uploadVendorDocument = (doc: { docType: string; fileName: string; mimeType: string; fileData: string }) =>
  vpost<{ ok: true; document: { docType: string; label: string; fileName: string; status: string; version: number } }>('/vendor/documents', doc, 120000);

export const getVendorDocument = (docType: string) =>
  vget<FilePayload & { docType: string; status: string; version: number }>(`/vendor/documents/${encodeURIComponent(docType)}`);

export const getDeclarationPreview = (type: DeclarationType) => vget<DeclarationPreview>(`/vendor/declarations/${type}/preview`);

export const signDeclaration = (type: DeclarationType, body: { signatoryName: string; designation: string; place: string; agreed: boolean }) =>
  vpost<{ ok: true; document: { reference: string; signedAt: string } }>(`/vendor/declarations/${type}/sign`, body, 30000);

export const startKyc = (body: { stage: 'identity'; gstStatus: string }) =>
  vpost<{ ok: true; redirectUrl: string; requestId: string; stage: string }>('/vendor/kyc/start', body, 30000);

export const getKycStatus = () => vget<KycStatus>('/vendor/kyc/status');

export function useVendorChangeRequests(enabled = true) {
  return useQuery({
    queryKey: ['vendor', 'change-requests'],
    enabled,
    queryFn: async ({ signal }) => (await unwrap(vget<{ ok: true; changeRequests: ChangeRequest[] }>('/vendor/change-requests', signal))).changeRequests ?? [],
  });
}

export const requestVendorChange = (body: { field: string; newValue: string; reason: string }) =>
  vpost<{ ok: true; submitted: true; message: string }>('/vendor/change-requests', body);

// ── Bills (read-only for vendors) ─────────────────────────────────────────────
export function useVendorBills(enabled = true) {
  return useQuery({
    queryKey: ['vendor', 'bills'],
    enabled,
    queryFn: async ({ signal }) => (await unwrap(vget<{ ok: true; bills: VendorBill[] }>('/vendor/bills', signal))).bills ?? [],
  });
}

export const getVendorBillFile = (versionId: string) => vget<FilePayload>(`/vendor/bills/versions/${encodeURIComponent(versionId)}/file`);

// ── Agreements ─────────────────────────────────────────────────────────────────
export function useVendorAgreements(enabled = true) {
  return useQuery({
    queryKey: ['vendor', 'agreements'],
    enabled,
    queryFn: async ({ signal }) => (await unwrap(vget<{ ok: true; agreements: VendorAgreement[] }>('/vendor/agreements', signal))).agreements ?? [],
  });
}

export const getAgreementDraft = (id: string) => vget<FilePayload>(`/vendor/agreements/${encodeURIComponent(id)}/draft`);

export const getAgreementSignature = (id: string) =>
  vget<{ ok: true; signatureType: string; mimeType: string; fileData: string; signedAt: string }>(`/vendor/agreements/${encodeURIComponent(id)}/signature`);

export const signAgreement = (id: string, body: { signatureType: 'drawn' | 'uploaded'; signatureFileData: string; proofToken: string }) =>
  vpost<{ ok: true; status: string }>(`/vendor/agreements/${encodeURIComponent(id)}/sign`, body, 45000);
