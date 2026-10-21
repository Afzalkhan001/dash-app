// Staff forgot password and sign-up (docs/port/signin-push.md §1.1–1.2, §2). Every endpoint is public
// (server.js PUBLIC_API) and rate limited, and the bodies are the website's own (dash.html LoginForm
// fpLookup / fpReset / checkEmail / doSignup). The WhatsApp code in the middle of "forgot password"
// uses sendPhoneOtp / verifyPhoneOtp from api/auth.ts, as the website does.
//
// The in-app demo (dev and preview builds) answers its own addresses on the phone: these calls run
// before sign-in, so they carry no demo token and demoFetch never sees them (demo/auth-extras.ts).

import { api, type ApiResult } from '@/api/client';
import type { StaffUser } from '@/auth/session';
import { demoCheckEmail, demoForgotLookup, demoForgotReset, demoSignup, isDemoExtraEmail } from '@/demo/auth-extras';

export type ForgotLookup = { ok: true; masked: string };
export type ForgotReset = { ok: true };
export type CheckEmail =
  | {
      ok?: true;
      whitelisted: true;
      email: string;
      name: string;
      role: string;
      tenantId: string | null;
    }
  | { ok?: true; whitelisted: false; email: string };
export type SignupResult = { ok: true; user: StaffUser };

const lc = (email: string) => email.trim().toLowerCase();

/** server.js:2693 — does the account exist, and the last 4 digits of its number ("•••••1234"). */
export async function forgotLookup(email: string): Promise<ApiResult<ForgotLookup>> {
  if (isDemoExtraEmail(email)) return demoForgotLookup(email);
  // The website sends the email as typed; the server lower-cases and trims it.
  return api.post<ForgotLookup>('/auth/forgot-password/lookup', {
    email: email.trim(),
  });
}

/**
 * server.js:2719 — the irreversible step: overwrites the password (email + WhatsApp to the person).
 * `phone` is the full number the code went to, `proofToken` the WhatsApp proof from verify-otp (10 min).
 */
export async function forgotReset(email: string, phone: string, newPassword: string, proofToken: string): Promise<ApiResult<ForgotReset>> {
  const body = { email: email.trim(), phone, newPassword, idToken: proofToken };
  if (isDemoExtraEmail(email)) return demoForgotReset(body);
  return api.post<ForgotReset>('/auth/forgot-password/reset', body);
}

/** server.js:2669 — is this email on the approved list, and what to prefill. A miss is not an error. */
export async function checkEmail(email: string): Promise<ApiResult<CheckEmail>> {
  if (isDemoExtraEmail(email)) return demoCheckEmail(email);
  return api.post<CheckEmail>('/auth/check-email', { email: lc(email) });
}

/**
 * server.js:2618 — creates the account (no session is returned). The server reads only email and
 * password; name, role and company always come from the approved list. The other fields are sent
 * because the website sends them.
 */
export async function signUp(
  match: {
    email: string;
    name?: string;
    role?: string;
    tenantId?: string | null;
  },
  password: string,
): Promise<ApiResult<SignupResult>> {
  const body = {
    email: match.email,
    password,
    name: match.name || '',
    role: match.role || 'employee',
    tenantId: match.tenantId || null,
  };
  if (isDemoExtraEmail(match.email)) return demoSignup(body);
  return api.post<SignupResult>('/auth/signup', body);
}

/** The website's test for "the account already exists — log in instead" (dash.html doSignup). */
export const isAlreadyExists = (error: string) => {
  const e = error.toLowerCase();
  return e.includes('already exists') || e.includes('already exist') || e.includes('duplicate');
};
