// Demo API for the signin domain (wave 1): staff forgot password and sign-up. Owner: the signin agent.
//
// These screens run before sign-in, so their calls carry no demo token and are answered inline by
// demo/auth-extras.ts (through api/signin.ts), never by demoFetch. The same answers are registered
// here too, so a call made with a demo token (any Afzal persona) gets the identical reply instead of
// the server's generic fallback, and tsc checks the shapes against the app's API types.
// Nothing here reads or changes shared demo state: a reset or a sign-up stores nothing.

import type { CheckEmail, ForgotLookup, ForgotReset, SignupResult } from '@/api/signin';
import { demoCheckEmail, demoForgotLookup, demoForgotReset, demoSignup } from '@/demo/auth-extras';
import type { DemoError, Route } from '@/demo/state';

type Reply<T> = T | DemoError;

export const signinRoutes: Route[] = [
  ['POST', /^\/auth\/forgot-password\/lookup$/, (_p, b): Reply<ForgotLookup> => demoForgotLookup(b?.email)],
  ['POST', /^\/auth\/forgot-password\/reset$/, (_p, b): Reply<ForgotReset> => demoForgotReset(b ?? {})],
  ['POST', /^\/auth\/check-email$/, (_p, b): Reply<CheckEmail> => demoCheckEmail(b?.email)],
  ['POST', /^\/auth\/signup$/, (_p, b): Reply<SignupResult> => demoSignup(b ?? {})],
];
