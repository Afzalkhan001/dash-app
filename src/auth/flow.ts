// In-progress sign-in state shared between the sign-in screens. Kept in memory (not in route
// params) because it carries OTP challenge ids; it is wiped once sign-in completes.

import { create } from 'zustand';

import type { LoginChannel } from '@/api/auth';

export type OtpPurpose =
  | 'mobile' // mobile-number sign-in: phone OTP → /auth/mobile
  | 'password-phone' // password 2nd factor over WhatsApp: phone OTP → /auth/login/verify-otp {idToken}
  | 'password-email' // password 2nd factor over email: /auth/login/verify-otp {code}
  | 'demo' // the in-app demo account (dev builds only) — nothing is sent anywhere
  | 'forgot'; // forgot password: phone OTP → proofToken kept in `forgotProof`, then back to /forgot (no sign-in)

type FlowState = {
  purpose: OtpPurpose | null;
  phone: string; // full number the code went to (WhatsApp purposes)
  phoneChallengeId: string | null; // /auth/phone/* challenge
  loginChallengeId: string | null; // /auth/login challenge (password flows)
  channels: LoginChannel[];
  sentTo: string; // masked destination shown on the OTP screen
  name: string;
  // Demo only: a role picked on the login screen BEFORE signing in ("Try a demo role"). The code
  // screen signs straight in as it once 123456 is entered, instead of showing the role picker.
  demoPersona: { kind: 'staff' | 'vendor'; id: string } | null;
  // Forgot password ((auth)/forgot.tsx): the account's email and its masked number ("•••••1234"),
  // the WhatsApp proof the code screen hands back (valid 10 minutes on the server), and
  // whether this is the demo account (no WhatsApp message; the code is 123456).
  forgotEmail: string;
  forgotMasked: string;
  forgotProof: string | null;
  forgotDemo: boolean;
  set: (p: Partial<Omit<FlowState, 'set' | 'reset'>>) => void;
  reset: () => void;
};

const initial = {
  purpose: null,
  phone: '',
  phoneChallengeId: null,
  loginChallengeId: null,
  channels: [],
  sentTo: '',
  name: '',
  demoPersona: null,
  forgotEmail: '',
  forgotMasked: '',
  forgotProof: null,
  forgotDemo: false,
};

export const useAuthFlow = create<FlowState>((set) => ({
  ...initial,
  set: (p) => set(p),
  reset: () => set(initial),
}));
