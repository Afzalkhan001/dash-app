// Google sign-in for staff — the plain (no React) half: which client ids this build has, which way
// in this copy of the app can use, and the token hand-over the server needs.
//
// What the server accepts (server.js:2526 POST /api/auth/google → vendor.js:64 verifyFirebaseIdentity):
// a FIREBASE ID token from the same Firebase project as the server's FIREBASE_API_KEY. A raw Google
// id_token is rejected. The website gets one from the Firebase SDK popup (dash.html:2034 doGoogle).
// The app has no Firebase SDK, so it does the same in three plain steps:
//   1. expo-auth-session opens Google's own sign-in page in the system browser and gets a Google
//      credential (native: authorization code + PKCE → id_token; web preview: an access token);
//   2. Firebase's public REST call accounts:signInWithIdp, with the apiKey from GET /api/firebase-config
//      (the same public config the website loads), swaps it for a Firebase ID token;
//   3. POST /api/auth/google {idToken, trustDevice:true} → the usual session payload.
// No server or database change. Setup steps for the owner: docs/GOOGLE-SIGNIN.md.
//
// When the button shows (features/googlesignin/google-button.tsx):
//   'real'  the platform's client id is set (EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID / _IOS_ / _WEB_) and
//           this is not Expo Go — Google refuses Expo Go's exp:// return address, so Expo Go can never
//           finish a real Google sign-in without a website redirect page (not built: docs/GOOGLE-SIGNIN.md).
//   'demo'  no real way in here, but this is a demo build (dev / preview): a sample Google account picker.
//   'off'   neither: the button is hidden, so nobody sees a dead button.

import { Platform } from 'react-native';

import { isExpoGo } from '@/lib/capabilities';
import { DEMO_ENABLED } from '@/demo/config';

// Read with dot notation on purpose: that is the only form Expo writes into the app at build time.
const clean = (v: string | undefined) => (v || '').trim();
export const GOOGLE_CLIENT_IDS = {
  web: clean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  android: clean(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
  ios: clean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
};

/** The OAuth client this platform signs in with ('' when the build has none). */
export function googleClientId(): string {
  if (Platform.OS === 'web') return GOOGLE_CLIENT_IDS.web;
  if (Platform.OS === 'ios') return GOOGLE_CLIENT_IDS.ios;
  if (Platform.OS === 'android') return GOOGLE_CLIENT_IDS.android;
  return '';
}

export type GoogleMode = 'real' | 'demo' | 'off';

export function googleMode(): GoogleMode {
  const real = !!googleClientId() && !isExpoGo();
  if (real) return 'real';
  return DEMO_ENABLED ? 'demo' : 'off';
}

/** True when a client id is set but this is Expo Go (the demo sheet says so). */
export const googleNeedsInstalledApp = () => !!(GOOGLE_CLIENT_IDS.android || GOOGLE_CLIENT_IDS.ios) && isExpoGo();

// The return address Google sends the person back to after they pick an account.
//   Android + iOS: the app id as a URL scheme, "com.tamadamedia.dashmobile:/oauthredirect". Google lets
//     an iOS client use its bundle id, and an Android client its package name once "Custom URI scheme"
//     is turned on for it. app.json must list that scheme (HANDOFF.md, integrator to-do).
//   Web (preview only): this page's own address, e.g. http://localhost:8090/login.
export const GOOGLE_NATIVE_REDIRECT = 'com.tamadamedia.dashmobile:/oauthredirect';

export const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

/** What Google handed back: an id_token (native code flow) or an access token (web implicit flow). */
export type GoogleCredential = { idToken: string } | { accessToken: string };

// ── Plain-words errors ──────────────────────────────────────────────────────────
export const GOOGLE_FAILED = 'Google sign-in didn’t work. Please try again.';
export const GOOGLE_NOT_SET_UP = 'Google sign-in isn’t set up on DASH yet. Sign in with your mobile number or email.';
export const GOOGLE_WRONG_PROJECT = 'Google sign-in isn’t set up for this app yet. Ask your admin, or sign in with your mobile number.';

type FirebaseConfig = { apiKey?: string };
type IdpReply = { idToken?: string; email?: string; error?: { message?: string } };

/**
 * Step 2: swap Google's credential for a Firebase ID token (identitytoolkit accounts:signInWithIdp,
 * the same call the Firebase SDK makes inside the website's popup). Returns the token or an error line.
 */
export async function firebaseTokenFromGoogle(
  cred: GoogleCredential,
  loadConfig: () => Promise<FirebaseConfig | { error: string }>,
): Promise<{ idToken: string } | { error: string }> {
  const cfg = await loadConfig();
  if ('error' in cfg && typeof cfg.error === 'string') return { error: cfg.error };
  const apiKey = typeof (cfg as FirebaseConfig).apiKey === 'string' ? (cfg as FirebaseConfig).apiKey!.trim() : '';
  // The server's FIREBASE_API_KEY is missing: the website's Google button cannot work either.
  if (!apiKey) return { error: GOOGLE_NOT_SET_UP };
  const postBody =
    'idToken' in cred
      ? `id_token=${encodeURIComponent(cred.idToken)}&providerId=google.com`
      : `access_token=${encodeURIComponent(cred.accessToken)}&providerId=google.com`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postBody, requestUri: 'http://localhost', returnSecureToken: true, returnIdpCredential: true }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as IdpReply;
    if (res.ok && typeof data.idToken === 'string' && data.idToken) return { idToken: data.idToken };
    const msg = String(data.error?.message || '');
    // The Google client is in another Google Cloud project and not safelisted in Firebase, or the
    // key has an HTTP-referrer restriction (docs/GOOGLE-SIGNIN.md, "If it fails").
    if (/INVALID_IDP_RESPONSE|INVALID_CLIENT|API_KEY|referer|PERMISSION_DENIED/i.test(msg)) return { error: GOOGLE_WRONG_PROJECT };
    if (/OPERATION_NOT_ALLOWED/i.test(msg)) return { error: GOOGLE_NOT_SET_UP };
    if (/USER_DISABLED/i.test(msg)) return { error: 'This Google account has been turned off. Ask your admin.' };
    return { error: GOOGLE_FAILED };
  } catch {
    return { error: 'Couldn’t reach Google. Check your connection and try again.' };
  } finally {
    clearTimeout(timer);
  }
}
