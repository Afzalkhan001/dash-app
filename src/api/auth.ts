// Staff sign-in endpoints (server.js ~2278-2600). Three ways in, all ending in the same session
// payload `{ ok, user, token, tokenExpiresAt }` from completeLogin():
//   1. Mobile number only:   phone/send-otp → phone/verify-otp → /auth/mobile
//   2. Email + password:     /auth/login → (chooseAccount?) → 2nd factor → /auth/login/verify-otp
//        2nd factor by WhatsApp: phone/send-otp + phone/verify-otp, then verify-otp with idToken
//        2nd factor by email:    /auth/login/send-otp, then verify-otp with code
//   3. Google: a Firebase ID token → /auth/google (features/signin/google.ts has the token steps).
// The app always sends trustDevice:true, which gives the 15-day session.

import { api, type ApiResult } from '@/api/client';
import type { StaffUser } from '@/auth/session';

export type SessionPayload = { ok: true; user: StaffUser; token: string | null; tokenExpiresAt: string | number | null };

export type LoginChannel = { id: 'email' | 'mobile'; label: string; to: string };
export type LoginStep1 =
  | { ok: true; otpRequired: true; challengeId: string; channels: LoginChannel[]; name: string; hasMobile: boolean }
  | { ok: true; chooseAccount: true; accounts: { accountId: string; tenantId: string | null; companyName: string; name: string; role: string }[] }
  | SessionPayload; // only from localhost dev, where OTP is skipped

// WhatsApp OTP — shared by "mobile number" sign-in, the password 2nd factor and forgot-password.
export const sendPhoneOtp = (phone: string, resendChallengeId?: string) =>
  api.post<{ ok: true; challengeId: string }>('/auth/phone/send-otp', { phone, resendChallengeId });

export const verifyPhoneOtp = (challengeId: string, code: string) =>
  api.post<{ ok: true; proofToken: string }>('/auth/phone/verify-otp', { challengeId, code });

export const signInWithPhoneProof = (proofToken: string): Promise<ApiResult<SessionPayload>> =>
  api.post('/auth/mobile', { idToken: proofToken, trustDevice: true });

// Email + password.
export const passwordLogin = (email: string, password: string, accountId?: string): Promise<ApiResult<LoginStep1>> =>
  api.post('/auth/login', { email: email.trim().toLowerCase(), password, trustDevice: true, ...(accountId ? { accountId } : {}) });

export const sendLoginEmailOtp = (challengeId: string) =>
  api.post<{ ok: true; sentTo: string }>('/auth/login/send-otp', { challengeId, channel: 'email' });

export const verifyLoginOtp = (challengeId: string, proof: { code: string } | { idToken: string }): Promise<ApiResult<SessionPayload>> =>
  api.post('/auth/login/verify-otp', { challengeId, ...proof });

// Google (server.js:2526). `idToken` must be a FIREBASE ID token (not Google's own id_token): the
// server checks it with Firebase accounts:lookup. A new person on the approved list gets an account.
// 401 "Could not verify that Google account." · 403 "…not on the employee roster…"
export const signInWithGoogle = (firebaseIdToken: string): Promise<ApiResult<SessionPayload>> =>
  api.post('/auth/google', { idToken: firebaseIdToken, trustDevice: true });

// The public Firebase web config the website loads before sign-in (server.js:2963). Only apiKey is used.
export const getFirebaseConfig = () =>
  api.get<{ apiKey?: string; authDomain?: string; projectId?: string }>('/firebase-config');

export const changePassword = (userId: string, currentPassword: string, newPassword: string) =>
  api.post('/auth/change-password', { userId, currentPassword, newPassword });

// Phone helpers — the server compares the last 10 digits, so normalise the same way for display.
export const digitsOnly = (s: string) => s.replace(/\D/g, '');
export const last10 = (s: string) => digitsOnly(s).slice(-10);

export const isSessionPayload = (r: unknown): r is SessionPayload =>
  !!r && typeof r === 'object' && 'user' in r && 'token' in r;
