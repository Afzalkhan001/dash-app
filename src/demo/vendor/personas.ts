// The vendor portal's demo personas — the "Vendor portal" section of the role picker
// (features/demo/role-picker.tsx). One business, Afzal Studios & Co., at each point of its life with
// Tamada that the real portal shows:
//   Approved            approved              Home with money due, Bills, Agreements, change requests
//   Registering         mobile_verified       not GST registered, Digio done, business details next
//   KYC pending         mobile_verified       GST registered, the Digio ID and bank check not started
//   Under review        pending_verification  sent for approval, read-only until Accounts decides
//   Changes requested   correction_required   Accounts asked for a new cheque and the tax form again
// Picking one signs in to the vendor portal with the token VENDOR_DEMO_TOKEN_PREFIX + id (demo/config.ts);
// apiFetch hands that token's requests to the demo server, whose vendor routes (demo/vendor/routes.ts)
// answer from that persona's record (demo/vendor/data.ts). Each pick starts the record afresh.
// None of this exists in the DASH database: no vendor, number, PAN or bank account here is real.

import type { LucideIcon } from 'lucide-react-native';
import { BadgeCheck, ClipboardList, FilePenLine, Hourglass, ScanFace } from 'lucide-react-native';

import { DEMO_ENABLED, isDemoToken, VENDOR_DEMO_TOKEN_PREFIX } from '@/demo/config';
import { isVendorPersonaId, resetVendor, VENDOR_PHONE, type VendorPersonaId } from '@/demo/vendor/data';
import { signInVendor } from '@/features/vendor/auth-complete';

export type VendorDemoPersona = { id: VendorPersonaId; label: string; note: string; icon?: LucideIcon };

export const VENDOR_DEMO_PERSONAS: VendorDemoPersona[] = [
  { id: 'approved', label: 'Afzal Vendor — Approved', note: 'Sees bills and payments, signs agreements', icon: BadgeCheck },
  { id: 'registering', label: 'Afzal Vendor — Registering', note: 'Halfway through sign-up: business details next', icon: ClipboardList },
  { id: 'kyc_pending', label: 'Afzal Vendor — KYC pending', note: 'Still has to verify ID and bank with Digio', icon: ScanFace },
  { id: 'under_review', label: 'Afzal Vendor — Under review', note: 'Sent for approval, waiting for Accounts', icon: Hourglass },
  { id: 'changes', label: 'Afzal Vendor — Changes requested', note: 'Accounts asked for a clearer cheque and the tax form again', icon: FilePenLine },
];

export const vendorDemoToken = (id: VendorPersonaId) => `${VENDOR_DEMO_TOKEN_PREFIX}${id}`;

/** The vendor persona a token signs in as, or null (not a vendor demo token). */
export function vendorPersonaFromToken(token: string | null | undefined): VendorDemoPersona | null {
  if (!isDemoToken(token) || !token.startsWith(VENDOR_DEMO_TOKEN_PREFIX)) return null;
  const id = token.slice(VENDOR_DEMO_TOKEN_PREFIX.length);
  return isVendorPersonaId(id) ? (VENDOR_DEMO_PERSONAS.find((p) => p.id === id) ?? null) : null;
}

const FIFTEEN_DAYS = 15 * 86400000;

/** Sign in to the vendor portal as a persona, its vendor back at its starting point. */
export async function startVendorDemo(id: string): Promise<void> {
  if (!DEMO_ENABLED || !isVendorPersonaId(id)) return;
  resetVendor(id);
  await signInVendor(vendorDemoToken(id), new Date(Date.now() + FIFTEEN_DAYS).toISOString(), VENDOR_PHONE);
}
