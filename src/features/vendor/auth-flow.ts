// In-progress vendor sign-in, shared by /vendor → /vendor-otp → /vendor-password. Kept in memory
// (never in route params) because it carries the WhatsApp challenge id and, for a brand-new vendor,
// the fresh session token that the forced "create a password" step uses before it is stored.
// `demo` marks the in-app demo (development builds only, demo/config.ts): the demo number or email was
// typed, so no WhatsApp message goes out, the code is 123456 and the vendor role picker follows.

import { create } from 'zustand';

import { onSignOut } from '@/auth/session';

type VendorAuthFlow = {
  phone: string; // +91XXXXXXXXXX — the number the WhatsApp code went to
  email: string;
  challengeId: string | null;
  sentTo: string; // "+91 98765 43210"
  pending: { token: string; expiresAt: string | null } | null; // new vendor, before the password step
  demo: boolean; // the demo account: no code is sent, 123456 opens the role picker
  set: (p: Partial<Omit<VendorAuthFlow, 'set' | 'reset'>>) => void;
  reset: () => void;
};

const initial = { phone: '', email: '', challengeId: null, sentTo: '', pending: null, demo: false };

export const useVendorAuthFlow = create<VendorAuthFlow>((set) => ({
  ...initial,
  set: (p) => set(p),
  reset: () => set(initial),
}));

// Nothing from a previous sign-in (challenge id, the new vendor's first token) outlives the session.
onSignOut(() => useVendorAuthFlow.getState().reset());
