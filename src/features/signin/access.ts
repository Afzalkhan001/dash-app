// Signin domain (wave 1) — access.ts. This domain’s gates, ported from dash.html.
// Owner: the signin agent (docs/port/PLAN.md §2.1; spec docs/port/signin-push.md).
//
// There are no role or company gates to port: forgot password and sign-up live in the public LoginForm
// (dash.html:1867), which renders before anyone is signed in, so it has no navFor, canSeeHrNav,
// HR_SECTIONS, FEATURE_REGISTRY or tenantFeatureOn check. The website shows both links to everyone:
//   "Forgot password?"                        dash.html:2191 (under the password field)
//   "Don't have an account? Sign up"          dash.html:2213
// Every endpoint behind them is in server.js PUBLIC_API (server.js:1307-1331) and is rate limited
// there; the real gates are on the server (the approved list for /auth/signup, the WhatsApp proof plus
// the number on file for /auth/forgot-password/reset). The app shows both links on email sign-in.

/** dash.html:2191 — the forgot-password link has no condition. */
export const canUseForgotPassword = (): boolean => true;

/** dash.html:2213 — the sign-up link has no condition (/auth/signup checks the approved list). */
export const canSignUp = (): boolean => true;
