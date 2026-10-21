// The demo's answers for the sign-in extras: forgot password and sign-up (docs/port/signin-push.md §7).
// These calls are made BEFORE anyone is signed in, so they carry no demo token and never reach
// demoFetch (api/client.ts only redirects calls made with a demo token). api/signin.ts asks here first
// and only goes to DASH when the email is not one of the demo addresses below. Everything is gated on
// DEMO_ENABLED (dev and preview builds), so a store build never answers anything here.
//
// The same answers are registered as demo routes in demo/fixtures/signin.ts, so a demo-token caller
// gets the same replies (and the shapes are checked once, against the API types in api/signin.ts).
//
//   Forgot password   afzal.demo@tamadamedia.com → "•••••7610"; the number must be 8328617610 (else
//                     the server's own "does not match" wording); code 123456; any new password of
//                     at least 4 characters "saves", but nothing is stored: Demo@123 stays.
//   Sign up           afzal.newjoiner@tamadamedia.com  on the list, not signed up yet → account created
//                     afzal.demo@tamadamedia.com       on the list, already signed up → "already exists"
//                     afzal.notlisted@tamadamedia.com  not on the list → the warning, then the 403
// The wording of every refusal is copied from server.js (/api/auth/*), so the demo shows what DASH would.

import { DEMO_EMAIL, DEMO_ENABLED, DEMO_OTP, DEMO_PASSWORD, DEMO_PHONE, DEMO_TENANT_ID } from '@/demo/config';

export const DEMO_SIGNUP_EMAIL = 'afzal.newjoiner@tamadamedia.com';
export const DEMO_UNLISTED_EMAIL = 'afzal.notlisted@tamadamedia.com';
/** The proof the demo's code step hands to the reset step (a real one is an HMAC token from verify-otp). */
export const DEMO_RESET_PROOF = 'demo-reset-proof';
export { DEMO_OTP, DEMO_PASSWORD, DEMO_PHONE };

const norm = (email: unknown) => (typeof email === 'string' ? email.trim().toLowerCase() : '');
const last10 = (s: unknown) =>
  String(s ?? '')
    .replace(/\D/g, '')
    .slice(-10);

type Refusal = { error: string; status: number };
const refuse = (error: string, status = 400): Refusal => ({ error, status });

/** One of the demo's sign-in-extra addresses (never true in a store build). */
export function isDemoExtraEmail(email: unknown) {
  if (!DEMO_ENABLED) return false;
  const e = norm(email);
  return e === DEMO_EMAIL || e === DEMO_SIGNUP_EMAIL || e === DEMO_UNLISTED_EMAIL;
}

/** The forgot-password flow for the demo account (the code step has no WhatsApp message). */
export const isDemoForgotEmail = (email: unknown) => DEMO_ENABLED && norm(email) === DEMO_EMAIL;

// The approved list ("whitelist") as the demo knows it.
const LIST: Record<string, { name: string; role: string; signedUp: boolean }> = {
  [DEMO_EMAIL]: { name: 'Afzal Employee', role: 'employee', signedUp: true },
  [DEMO_SIGNUP_EMAIL]: {
    name: 'Afzal New Joiner',
    role: 'employee',
    signedUp: false,
  },
};

// ── server.js:2693 POST /auth/forgot-password/lookup ─────────────────────────
export function demoForgotLookup(email: unknown): { ok: true; masked: string } | Refusal {
  if (!norm(email)) return refuse('Email required');
  if (norm(email) !== DEMO_EMAIL) return refuse('No account found with that email.', 404);
  return { ok: true, masked: `•••••${DEMO_PHONE.slice(-4)}` };
}

/** The demo's answer to "send the code to this number": only the number on the demo profile. */
export function demoForgotPhone(phone: unknown): { ok: true } | Refusal {
  if (last10(phone) !== DEMO_PHONE) return refuse('Verified phone does not match the number on file for this account.');
  return { ok: true };
}

// ── server.js:2719 POST /auth/forgot-password/reset ──────────────────────────
export function demoForgotReset(body: { email?: unknown; phone?: unknown; newPassword?: unknown; idToken?: unknown }): { ok: true } | Refusal {
  const pw = typeof body?.newPassword === 'string' ? body.newPassword : '';
  if (!norm(body?.email) || !body?.phone || !pw) return refuse('email, phone, and newPassword required');
  if (pw.length < 4) return refuse('New password must be at least 4 characters');
  if (!body?.idToken) return refuse('Verification is required. Please request a new code.');
  if (body.idToken !== DEMO_RESET_PROOF) return refuse('We could not confirm that verification. Please request a new code and try again.', 401);
  if (norm(body.email) !== DEMO_EMAIL) return refuse('No account found with that email.', 404);
  if (last10(body.phone) !== DEMO_PHONE) return refuse('Verified phone does not match the number on file for this account.');
  // Nothing is stored: the demo password stays Demo@123.
  return { ok: true };
}

// ── server.js:2669 POST /auth/check-email ────────────────────────────────────
export function demoCheckEmail(email: unknown):
  | {
      ok: true;
      whitelisted: true;
      email: string;
      name: string;
      role: string;
      tenantId: string | null;
    }
  | { ok: true; whitelisted: false; email: string }
  | Refusal {
  const e = norm(email);
  if (!e.includes('@')) return refuse('Enter a valid email address.');
  const row = LIST[e];
  if (!row) return { ok: true, whitelisted: false, email: e };
  return {
    ok: true,
    whitelisted: true,
    email: e,
    name: row.name,
    role: row.role,
    tenantId: DEMO_TENANT_ID,
  };
}

// ── server.js:2618 POST /auth/signup ─────────────────────────────────────────
export function demoSignup(body: { email?: unknown; password?: unknown }) {
  const e = norm(body?.email);
  const pw = typeof body?.password === 'string' ? body.password : '';
  if (!e || !pw) return refuse('Email and password required');
  if (pw.length < 4) return refuse('Password must be at least 4 characters');
  const row = LIST[e];
  if (!row) return refuse('This email is not whitelisted. Contact HR or your admin.', 403);
  if (row.signedUp) return refuse('An account with this email already exists. Please log in.');
  // Nothing is stored: the new joiner "signs up" again every time, and Continue opens Afzal Employee.
  return {
    ok: true as const,
    user: {
      id: 'demo-newjoiner',
      email: e,
      name: row.name,
      role: row.role,
      tenantId: DEMO_TENANT_ID,
      dept: 'Creative',
    },
  };
}
