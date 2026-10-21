// Accounts desk endpoints — exactly the ones the website's Accounts screens call (docs/port/accounts.md §2):
//   vendor.js             /accounts/vendors(+/:id, documents, pan-aadhaar-check|status, verification,
//                         approve, reject, request-correction, status), /accounts/change-requests/:id
//   vendor_bills.js       /vendor-bills/vendors, accounts-all, :id/accounts-accept|reject, :id/payment/start,
//                         settings (GET/PUT), by-vendor/:id, :id (history), versions/:id/file
//   vendor_agreements.js  /vendor-agreements/mine, pending-my-signature, :id/draft|signature|internal-signature,
//                         :id/deadline, :id/sign
//   reimbursements.js     /reimbursements/accounts-all, :id/accounts-authorize|reject, :id/payment/start
//   server.js             /petty_cash_requests/:id/accounts-approve|reject, :id/payment/start,
//                         /petty_cash_bills/:id/approve|reject, /petty_cash_bill_submissions (+/:id/reject),
//                         /petty_cash_departments (POST / PUT / DELETE)
//
// Rules kept from the plan (PLAN §2.1.6, §5):
//   - the queues that feed the Inbox live under ['inbox', <kind>, …] so the Inbox poll refreshes them;
//   - vendor records (PAN, Aadhaar last 4, the UNMASKED account number), documents and every big list are
//     memory-only (meta: { persist: false });
//   - the vendor detail GET has side effects on the server (a paid Digio check on first open), so it is
//     never prefetched from a list;
//   - no "self-heal" writes: the website's POST /petty_cash_bill_submissions/reconcile is not called here.

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api, apiFetch, type ApiResult, unwrap } from '@/api/client';
import type { PettyCashBill, PettyCashHistoryEntry, PettyCashRequest, PettyCashSubmission, ExpenseHead } from '@/api/petty-cash';
import type { Reimbursement } from '@/api/reimbursements';
import type { BillVersion, ChangeRequest, Declaration206ab, SignPosition } from '@/api/vendor';
import { useSession } from '@/auth/session';

const NO_PERSIST = { persist: false } as const;
const enc = encodeURIComponent;
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// ── Vendors (vendor.js) ──────────────────────────────────────────────────────
export type PanAadhaarState = 'linked' | 'not_linked' | 'not_applicable' | 'unchecked';

/** GET /accounts/vendors row (vendor.js:3127). */
export type AccountsVendorRow = {
  id: string;
  vendorCode: string;
  legalEntityName: string;
  tradeName: string;
  contactPerson: string;
  pocEmail: string;
  contactNumber: string;
  email: string;
  pan: string;
  gstStatus: string;
  gstin: string;
  msmeRegistered: boolean;
  msmeNumber: string;
  panAadhaar: PanAadhaarState | string;
  submittedAt: string | null;
  approvedAt: string | null;
  status: string;
  createdAt: string;
};

export type PanAadhaarCheck = { status: string; at: string | null; note?: string; source?: string; by?: string };

export type AccountsVendorDoc = {
  id: string;
  doc_type: string;
  label: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  status: string;
  version: number;
  superseded: boolean;
  uploaded_at: string;
  generated: boolean;
  remarks?: string;
  signature?: { reference?: string; signedAt?: string; signatoryName?: string; designation?: string; place?: string } | null;
};

export type VendorAuditRow = {
  action: string;
  field?: string | null;
  prev_value?: string | null;
  new_value?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  created_at: string;
};

export type VendorDuplicate = { id: string; legalEntityName: string; contactNumber: string; matchedOn: string[]; status: string };

/** GET /accounts/vendors/:id → vendor (vendor.js:3226). */
export type AccountsVendor = {
  id: string;
  vendorCode: string | null;
  status: string;
  contactNumber: string;
  email: string | null;
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
  tax: { pan: string; panLinkedToAadhaar: boolean | null; panHolderType: string; panIsIndividual: boolean; panAadhaarCheck: PanAadhaarCheck | null };
  gst: { status: string; gstin: string; gstinMatchesPan: boolean; nonGstReason: string; nonGstReasonText: string };
  kyc: {
    status: string;
    panVerification: { verified: boolean; verifiedAt?: string; holderName?: string } | null;
    gstVerification: { verified: boolean; verifiedAt?: string; legalName?: string } | null;
    aadhaarVerification: { verified: boolean; verifiedAt?: string; nameOnAadhaar?: string; last4?: string; address?: string } | null;
    bankVerification: { verified: boolean; verifiedAt?: string } | null;
  };
  declaration206ab: Declaration206ab;
  msme: { registered: boolean; number: string };
  bank: {
    accountName: string;
    bankName: string;
    /** Unmasked — never cached to disk, masked on screen until revealed. */
    accountNumber: string;
    ifsc: string;
    branchName: string;
    branchAddress?: string;
    verified: boolean;
    verifiedAt: string | null;
    source: string;
    holderNameOnBank: string;
    nameMatchScore: number | null;
  };
  documents: AccountsVendorDoc[];
  verification: Record<string, { verified?: boolean; by?: string; at?: string; remarks?: string }>;
  applicableChecks: string[];
  correction: { items?: string[]; comments?: string; by?: string; at?: string } | null;
  rejection: { reason: string; by: string; at: string | null };
  approval: { by: string; at: string | null };
  submittedAt: string | null;
  possibleDuplicates: VendorDuplicate[];
  history: VendorAuditRow[];
  changeRequests: ChangeRequest[];
};

export type VendorListFilters = {
  status?: string;
  q?: string;
  gst?: '' | 'registered' | 'not_registered';
  msme?: '' | 'yes' | 'no';
  aadhaar?: '' | 'not_linked';
  from?: string;
  to?: string;
};

const qs = (o: Record<string, string | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => !!v && v !== 'all') as [string, string][];
  return p.length ? `?${p.map(([k, v]) => `${k}=${enc(v)}`).join('&')}` : '';
};

export const accountsKeys = {
  all: ['accounts'] as const,
  vendors: (uid?: string, f?: VendorListFilters) => ['accounts', 'vendors', uid, f ?? {}] as const,
  vendor: (uid?: string, id?: string) => ['accounts', 'vendor', uid, id] as const,
  billVendors: (uid?: string) => ['accounts', 'bill-vendors', uid] as const,
  settings: (uid?: string) => ['accounts', 'bill-settings', uid] as const,
  vendorBills: (uid?: string, vendorId?: string) => ['accounts', 'vendor-bills', uid, vendorId] as const,
  bill: (uid?: string, id?: string) => ['accounts', 'bill', uid, id] as const,
  agreements: (uid?: string, f?: Record<string, string>) => ['accounts', 'agreements', uid, f ?? {}] as const,
  subs: (uid?: string, f?: Record<string, string>) => ['accounts', 'subs', uid, f ?? {}] as const,
  heads: (uid?: string) => ['accounts', 'heads', uid] as const,
  // The three queues the Inbox polls (and the desk reads from the same cache).
  petty: (uid?: string) => ['inbox', 'petty-acct', uid] as const,
  reimb: (uid?: string) => ['inbox', 'reimb-acct', uid] as const,
  bills: (uid?: string) => ['inbox', 'vbill', uid] as const,
  // Agreements waiting for the viewer's countersignature (Inbox kind `agree-sign`).
  pendingSign: (uid?: string) => ['inbox', 'agree-sign', uid] as const,
};

const useUid = () => useSession((s) => s.user?.id);

export function useAccountsVendors(filters: VendorListFilters, enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: accountsKeys.vendors(uid, filters),
    enabled: enabled && !!uid,
    meta: NO_PERSIST,
    // Typing in the search keeps the last list on screen until the new one arrives.
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const r = await unwrap(
        api.get<{ vendors: AccountsVendorRow[]; count: number }>(
          `/accounts/vendors${qs({ status: filters.status, q: filters.q?.trim(), gst: filters.gst, msme: filters.msme, aadhaar: filters.aadhaar, from: filters.from, to: filters.to })}`,
          signal,
        ),
      );
      return arr<AccountsVendorRow>(r?.vendors);
    },
  });
}

/** One vendor's full record. Opens only from the detail screen — the server runs a Digio check on first open. */
export function useAccountsVendor(id: string, enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: accountsKeys.vendor(uid, id),
    enabled: enabled && !!uid && !!id,
    meta: NO_PERSIST,
    staleTime: 15_000,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ vendor: AccountsVendor }>(`/accounts/vendors/${enc(id)}`, signal))).vendor,
  });
}

export type FilePayloadLoose = { fileName?: string; mimeType?: string; fileData: string; version?: number };

export const fetchVendorDocument = (vendorId: string, docId: string) =>
  apiFetch<FilePayloadLoose & { docType?: string }>(`/accounts/vendors/${enc(vendorId)}/documents/${enc(docId)}`, { timeoutMs: 120_000 });
export const runPanAadhaarCheck = (vendorId: string, force = false) =>
  api.post<{ panAadhaarCheck: PanAadhaarCheck; panHolderType?: string }>(`/accounts/vendors/${enc(vendorId)}/pan-aadhaar-check`, force ? { force: true } : {});
export const recordPanAadhaar = (vendorId: string, linked: boolean) =>
  api.put<{ panAadhaarCheck: PanAadhaarCheck }>(`/accounts/vendors/${enc(vendorId)}/pan-aadhaar-status`, { linked });
export const setVerification = (vendorId: string, item: string, verified: boolean) =>
  api.put<{ verification: AccountsVendor['verification'] }>(`/accounts/vendors/${enc(vendorId)}/verification`, { item, verified });
export const approveVendor = (vendorId: string) =>
  api.post<{ status: string; outstanding?: { item: string; label: string }[] }>(`/accounts/vendors/${enc(vendorId)}/approve`, {});
export const rejectVendor = (vendorId: string, reason: string) => api.post<{ status: string }>(`/accounts/vendors/${enc(vendorId)}/reject`, { reason });
export const requestCorrection = (vendorId: string, items: string[], comments: string) =>
  api.post<{ status: string }>(`/accounts/vendors/${enc(vendorId)}/request-correction`, { items, comments });
export const setVendorStatus = (vendorId: string, status: 'inactive' | 'approved', reason?: string) =>
  api.put<{ status: string }>(`/accounts/vendors/${enc(vendorId)}/status`, reason ? { status, reason } : { status });
export const decideChangeRequest = (id: string, decision: 'approved' | 'rejected', note?: string) =>
  api.put<{ status: string }>(`/accounts/change-requests/${enc(id)}`, note ? { decision, note } : { decision });

// ── Vendor bills (vendor_bills.js) ───────────────────────────────────────────
export type BillPayment = {
  paymentDate?: string;
  reference?: string;
  method?: string;
  note?: string;
  startedAt?: string;
  startedByName?: string;
  response?: { response: 'received' | 'not_received' | string; at?: string; byName?: string; note?: string } | null;
};

export type AccountsBillVersion = BillVersion & {
  keka_approved_amount?: number | string | null;
  keka_approved_by_name?: string | null;
  keka_reject_reason?: string | null;
  accounts_accepted_by_name?: string | null;
  accounts_reject_reason?: string | null;
};

/** A vendor bill as Accounts sees it (vendor_bills.js accounts-all / by-vendor). */
export type AccountsBill = {
  id: string;
  vendor_id: string;
  keka_code: string;
  project_id?: string | null;
  keka_owner_name?: string | null;
  keka_owner_user_id?: string | null;
  submitted_by: string;
  submitted_by_name?: string | null;
  submitted_by_email?: string | null;
  status: string;
  is_advance?: boolean;
  created_at: string;
  updated_at?: string | null;
  current_version?: number;
  payment?: BillPayment | null;
  payment_history?: PettyCashHistoryEntry[];
  version: AccountsBillVersion | null;
};

export type BillVendor = { id: string; legalEntityName: string; tradeName?: string };
export type BillSettings = { payment_timeline_days: number; payment_message: string };

/** Every vendor bill that has reached Accounts (Inbox kind `vbill` and the desk share it). */
export function useAccountsBills(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: accountsKeys.bills(uid),
    enabled: enabled && !!uid,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => arr<AccountsBill>((await unwrap(api.get<{ bills: AccountsBill[] }>('/vendor-bills/accounts-all', signal)))?.bills),
  });
}

/** Approved vendors of the company: names for bill rows and agreements. */
export function useBillVendors(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: accountsKeys.billVendors(uid),
    enabled: enabled && !!uid,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => arr<BillVendor>((await unwrap(api.get<{ vendors: BillVendor[] }>('/vendor-bills/vendors', signal)))?.vendors),
  });
}

export function useBillSettings(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: accountsKeys.settings(uid),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ settings: BillSettings }>('/vendor-bills/settings', signal))).settings,
  });
}

export const saveBillSettings = (paymentTimelineDays: number, paymentMessage: string) =>
  api.put<{ settings: BillSettings }>('/vendor-bills/settings', { paymentTimelineDays, paymentMessage });

export function useVendorBills(vendorId: string, enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: accountsKeys.vendorBills(uid, vendorId),
    enabled: enabled && !!uid && !!vendorId,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => arr<AccountsBill>((await unwrap(api.get<{ bills: AccountsBill[] }>(`/vendor-bills/by-vendor/${enc(vendorId)}`, signal)))?.bills),
  });
}

export function useBillHistory(id: string, enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: accountsKeys.bill(uid, id),
    enabled: enabled && !!uid && !!id,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => unwrap(api.get<{ bill: AccountsBill; versions: AccountsBillVersion[] }>(`/vendor-bills/${enc(id)}`, signal)),
  });
}

export const fetchBillFile = (versionId: string) =>
  apiFetch<FilePayloadLoose>(`/vendor-bills/versions/${enc(versionId)}/file`, { timeoutMs: 120_000 });
export const acceptBill = (id: string) => api.post<{ status: string }>(`/vendor-bills/${enc(id)}/accounts-accept`, {});
export const rejectBill = (id: string, reason: string) => api.post<{ status: string }>(`/vendor-bills/${enc(id)}/accounts-reject`, { reason });

// ── Expense claims at Accounts' stage (reimbursements.js) ────────────────────
export function useAccountsReimbursements(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: accountsKeys.reimb(uid),
    enabled: enabled && !!uid,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) =>
      arr<Reimbursement>((await unwrap(api.get<{ reimbursements: Reimbursement[] }>('/reimbursements/accounts-all', signal)))?.reimbursements),
  });
}

export const authorizeReimbursement = (id: string) => api.post<{ status: string }>(`/reimbursements/${enc(id)}/accounts-authorize`, {});
export const rejectReimbursement = (id: string, reason: string) => api.post<{ status: string }>(`/reimbursements/${enc(id)}/accounts-reject`, { reason });

// ── Petty cash at Accounts' stage (server.js) ────────────────────────────────
export type AccountsPetty = { requests: PettyCashRequest[]; bills: PettyCashBill[] };

/** Every petty cash request the person may see, and the old-flow receipts (Bill Approvals loads both). */
export function useAccountsPetty(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: accountsKeys.petty(uid),
    enabled: enabled && !!uid,
    meta: NO_PERSIST,
    queryFn: async ({ signal }): Promise<AccountsPetty> => {
      const [requests, bills] = await Promise.all([
        unwrap(api.get<PettyCashRequest[]>('/petty_cash_requests', signal)),
        unwrap(api.get<PettyCashBill[]>('/petty_cash_bills', signal)),
      ]);
      return { requests: arr<PettyCashRequest>(requests), bills: arr<PettyCashBill>(bills) };
    },
  });
}

export const authorizePetty = (id: string) => api.post(`/petty_cash_requests/${enc(id)}/accounts-approve`, {});
export const rejectPetty = (id: string, reason: string) => api.post(`/petty_cash_requests/${enc(id)}/accounts-reject`, { reason });
export const approvePettyBill = (id: string) => api.post(`/petty_cash_bills/${enc(id)}/approve`, {});
export const rejectPettyBill = (id: string, reason: string) => api.post(`/petty_cash_bills/${enc(id)}/reject`, { reason });

// ── Payments: start (or start again) — there is no "mark paid" anywhere ─────
export type PayKind = 'petty' | 'claim' | 'bill';
const PAY_BASE: Record<PayKind, string> = { petty: '/petty_cash_requests', claim: '/reimbursements', bill: '/vendor-bills' };
/** One tap after a confirm: the server stamps who and when (web startPaymentFlow posts `{}`). */
export const startPayment = (kind: PayKind, id: string) => api.post(`${PAY_BASE[kind]}/${enc(id)}/payment/start`, {});

// ── Expense reports, company-wide (admins) ───────────────────────────────────
export type SubmissionFilters = { dateFrom?: string; dateTo?: string; projectName?: string; employeeName?: string };

export function useAllSubmissions(filters: SubmissionFilters, enabled = true) {
  const uid = useUid();
  const f = { dateFrom: filters.dateFrom ?? '', dateTo: filters.dateTo ?? '', projectName: filters.projectName ?? '', employeeName: filters.employeeName ?? '' };
  return useQuery({
    queryKey: accountsKeys.subs(uid, f),
    enabled: enabled && !!uid,
    meta: NO_PERSIST,
    queryFn: async ({ signal }) => arr<PettyCashSubmission>(await unwrap(api.get<PettyCashSubmission[]>(`/petty_cash_bill_submissions${qs(f)}`, signal))),
  });
}

export const rejectSubmission = (id: string, reason: string) =>
  api.post<{ bill: { id: string; status: string }; claim: { before: number; after: number; closed: boolean } | null }>(
    `/petty_cash_bill_submissions/${enc(id)}/reject`,
    { reason },
  );

// ── Expense types ("petty cash departments") ─────────────────────────────────
/** Every expense type, inactive ones too (the user-facing hook in api/petty-cash drops them). */
export function useAllExpenseHeads(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: accountsKeys.heads(uid),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => arr<ExpenseHead>(await unwrap(api.get<ExpenseHead[]>('/petty_cash_departments', signal))),
  });
}

export const addExpenseHead = (name: string) => api.post<ExpenseHead>('/petty_cash_departments', { name });
export const setExpenseHeadActive = (id: string, active: boolean) => api.put<ExpenseHead>(`/petty_cash_departments/${enc(id)}`, { active });
export const deleteExpenseHead = (id: string) => api.del(`/petty_cash_departments/${enc(id)}`);

// ── Agreements (vendor_agreements.js) ────────────────────────────────────────
export type AccountsAgreement = {
  id: string;
  vendor_id: string;
  project_id?: string | null;
  project_name: string;
  keka_code?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  deadline_at: string | null;
  status: 'pending_signature' | 'pending_internal_signature' | 'signed' | string;
  sign_positions?: SignPosition[] | null;
  draft_file_name?: string | null;
  signer_id?: string | null;
  signer_name?: string | null;
  signed_at?: string | null;
  internal_signed_at?: string | null;
  signature_reference?: string | null;
  internal_signature_reference?: string | null;
  created_at: string;
};

export function useAgreements(filters: { vendorId?: string; projectId?: string; kekaCode?: string } = {}, enabled = true) {
  const uid = useUid();
  const f = { vendorId: filters.vendorId ?? '', projectId: filters.projectId ?? '', kekaCode: filters.kekaCode ?? '' };
  return useQuery({
    queryKey: accountsKeys.agreements(uid, f),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ agreements: AccountsAgreement[]; isOverseer?: boolean }>(`/vendor-agreements/mine${qs(f)}`, signal));
      return { agreements: arr<AccountsAgreement>(r?.agreements), isOverseer: !!r?.isOverseer };
    },
  });
}

export function usePendingMySignature(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: accountsKeys.pendingSign(uid),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => arr<AccountsAgreement>((await unwrap(api.get<{ agreements: AccountsAgreement[] }>('/vendor-agreements/pending-my-signature', signal)))?.agreements),
  });
}

export const fetchAgreementDraft = (id: string): Promise<ApiResult<FilePayloadLoose>> =>
  apiFetch<FilePayloadLoose>(`/vendor-agreements/${enc(id)}/draft`, { timeoutMs: 120_000 });
export const fetchAgreementSignature = (id: string, internal = false) =>
  apiFetch<FilePayloadLoose & { signatureType?: string; signedAt?: string; signerName?: string }>(
    `/vendor-agreements/${enc(id)}/${internal ? 'internal-signature' : 'signature'}`,
    { timeoutMs: 60_000 },
  );
export const extendAgreementDeadline = (id: string, deadlineAt: string) => api.put<{ deadlineAt: string }>(`/vendor-agreements/${enc(id)}/deadline`, { deadlineAt });
export const countersignAgreement = (id: string, signatureType: 'drawn' | 'uploaded', signatureFileData: string) =>
  apiFetch<{ status: string }>(`/vendor-agreements/${enc(id)}/sign`, { method: 'POST', body: { signatureType, signatureFileData }, timeoutMs: 60_000 });
