// Demo data for Google sign-in (googlesignin domain). Owner: the googlesignin agent.
//
// Google sign-in runs before anyone is signed in, so nothing here is a demo route (there is no demo
// token to route by). The demo Google button (features/googlesignin/google-button.tsx) shows these
// sample Google accounts in a picker and answers each one the way server.js:2526 POST /api/auth/google
// would for that address. The wording of every refusal is copied from server.js.
//
//   afzal.demo@tamadamedia.com       a DASH user already           → signed in, then "Explore DASH as…"
//   afzal.newjoiner@tamadamedia.com  on the approved list, no account yet → account created, Afzal Employee
//   afzal.khan.personal@gmail.com    not on the roster             → the server's 403 wording
//
// None of these Google accounts are real or are ever sent to Google: the demo picker never opens Google.

import { DEMO_EMAIL } from '@/demo/config';
import { DEMO_SIGNUP_EMAIL } from '@/demo/auth-extras';

export type DemoGoogleOutcome = 'existing' | 'created' | 'not-listed';

export type DemoGoogleAccount = {
  email: string;
  name: string;
  /** One plain line under the name in the picker. */
  note: string;
  outcome: DemoGoogleOutcome;
};

export const DEMO_GOOGLE_ACCOUNTS: DemoGoogleAccount[] = [
  {
    email: DEMO_EMAIL,
    name: 'Afzal Khan',
    note: 'Already on DASH · signs straight in',
    outcome: 'existing',
  },
  {
    email: DEMO_SIGNUP_EMAIL,
    name: 'Afzal New Joiner',
    note: 'On the approved list · first sign-in creates the account',
    outcome: 'created',
  },
  {
    email: 'afzal.khan.personal@gmail.com',
    name: 'Afzal (personal)',
    note: 'Not on the employee roster',
    outcome: 'not-listed',
  },
];

// server.js:2545 — the 403 for an address that is neither a user nor on the approved list.
export const DEMO_GOOGLE_NOT_LISTED =
  'This Google account is not on the employee roster. Ask HR to add you, then sign in again.';

// What the person sees after the first Google sign-in made their account (server audit line:
// "<name> created their DASH account with Google").
export const DEMO_GOOGLE_CREATED = 'Your DASH account was created with Google.';
