// Vendor review words (dash.html:24830 VENDOR_STATUS_META, :24843 CHECK_LABELS, :24846 CORRECTION_LABELS,
// :25793 PAN_AADHAAR_LABEL) in the app's plain words. The ids are the server's.

import type { StatusTone } from '@/theme/tokens';

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  mobile_verified: { label: 'Not sent yet', tone: 'neutral' },
  submitted: { label: 'Waiting', tone: 'pending' },
  pending_verification: { label: 'Waiting', tone: 'pending' },
  correction_required: { label: 'Corrections asked', tone: 'pending' },
  approved: { label: 'Approved', tone: 'done' },
  rejected: { label: 'Rejected', tone: 'failed' },
  inactive: { label: 'Switched off', tone: 'neutral' },
};
export const vendorStatusMeta = (s: string) => STATUS[s] ?? { label: String(s || '—').replace(/_/g, ' '), tone: 'neutral' as StatusTone };

/** The checks Accounts ticks before approving (vendor.js VERIFICATION_ITEMS). */
export const CHECK_LABELS: Record<string, string> = {
  pan: 'PAN checked',
  contact_number: 'Contact number checked',
  bank_details: 'Bank details checked',
  bank_proof: 'Cancelled cheque checked',
  gst: 'GST (or why not) checked',
  aadhaar: 'Aadhaar checked',
  msme: 'MSME certificate checked',
  declaration_206ab: 'Section 206AB declaration checked',
};
export const checkLabel = (k: string) => CHECK_LABELS[k] ?? k.replace(/_/g, ' ');

/** What a vendor can be asked to correct (vendor.js CORRECTION_ITEMS). */
export const CORRECTION_LABELS: [string, string][] = [
  ['pan', 'PAN'],
  ['gst', 'GST'],
  ['msme', 'MSME'],
  ['bank_account', 'Bank account'],
  ['bank_proof', 'Cancelled cheque'],
  ['non_gst_declaration', 'Non-GST declaration'],
  ['declaration_206ab', '206AB declaration'],
  ['business_information', 'Business details'],
  ['contact_information', 'Contact details'],
  ['other', 'Other'],
];
export const correctionLabel = (k: string) => CORRECTION_LABELS.find(([id]) => id === k)?.[1] ?? k.replace(/_/g, ' ');

const PAN_AADHAAR: Record<string, { label: string; tone: StatusTone }> = {
  linked: { label: 'Linked', tone: 'done' },
  not_linked: { label: 'PAN not linked to Aadhaar', tone: 'failed' },
  not_applicable: { label: 'Doesn’t apply', tone: 'neutral' },
  unchecked: { label: 'Not checked', tone: 'pending' },
};
export const panAadhaarLabel = (s: string) => (PAN_AADHAAR[s] ?? PAN_AADHAAR.unchecked!).label;
export const panAadhaarTone = (s: string) => (PAN_AADHAAR[s] ?? PAN_AADHAAR.unchecked!).tone;

export const NON_GST_REASON: Record<string, string> = {
  turnover_below_limit: 'Turnover in the state is below the taxable limit',
  exempt_supplies: 'What they supply is exempt from GST',
  other: 'Other',
};

/** Review is open while the registration waits on Accounts (dash.html:25476 canAct). */
export const REVIEWABLE = ['pending_verification', 'submitted', 'correction_required'];

/** "50200012345678" → "XXXXXXXXXX5678" (the website's mask). */
export const maskAccount = (n?: string | null) => (n ? n.replace(/.(?=.{4})/g, 'X') : '');

export const yesNo = (v?: string | null) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : null);

// ── Agreements (vendor_agreements.js statuses; dash.html:34373 agreementExpired) ──
export const agreementExpired = (a: { status: string; deadline_at?: string | null }, now: number) =>
  a.status === 'pending_signature' && !!a.deadline_at && Date.parse(a.deadline_at) < now;

export function agreementStatus(a: { status: string; deadline_at?: string | null }, now: number): { label: string; tone: StatusTone } {
  if (agreementExpired(a, now)) return { label: 'Deadline passed', tone: 'failed' };
  if (a.status === 'pending_signature') return { label: 'Waiting for the vendor', tone: 'pending' };
  if (a.status === 'pending_internal_signature') return { label: 'Waiting for countersign', tone: 'pending' };
  if (a.status === 'signed') return { label: 'Signed', tone: 'done' };
  return { label: String(a.status || '—').replace(/_/g, ' '), tone: 'neutral' };
}
