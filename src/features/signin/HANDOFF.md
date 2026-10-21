# Signin (wave 1): hand-off checklist

Scope: staff **forgot password** and **sign-up**. Google sign-in and push stay in wave 3. Spec: `docs/port/signin-push.md`.

## What it adds
- [x] `src/app/(auth)/forgot.tsx`: email → full number → WhatsApp code (`/otp`, purpose `forgot`) → new password → **ConfirmSheet + SwipeToConfirm** → SuccessSheet → email sign-in with the email filled in.
  - The confirm step says the person gets an email and a WhatsApp.
  - A 401 on the proof offers "Send a new code".
- [x] `src/app/(auth)/signup.tsx`: email → check-email → password → `/auth/signup` → SuccessSheet.
  - "Continue" runs `/auth/login` and hands the challenge to email sign-in at "Get a sign-in code".
  - "Already exists" offers "Sign in instead".
  - No ConfirmSheet, because nobody is notified.
- [x] `(auth)/email.tsx`:
  - a "Forgot password?" link under the password;
  - "New here? Create your account" under the "Or" divider;
  - it accepts `?email=…&n=…&resume=factor` (applied during render, no effect).
- [x] `(auth)/otp.tsx`: purpose `'forgot'`. It verifies the code, stores the proof in the flow, goes back and signs nobody in.
- [x] `auth/flow.ts`: `'forgot'` purpose plus `forgotEmail`, `forgotMasked`, `forgotProof` and `forgotDemo`.
- [x] `api/signin.ts`: `forgotLookup`, `forgotReset`, `checkEmail`, `signUp` and `isAlreadyExists`. These are existing public endpoints only, with the website's request bodies.
- [x] `features/signin/access.ts`: no gates. LoginForm is public (dash.html:1867, links at :2191 and :2213). `rules.ts` holds the website's checks: at least 4 characters, the passwords must match, and the email needs an `@`.

## Extension points
- **More rows / + actions / Home cards / Inbox kinds / tour steps: none.** The feature runs before sign-in. The stubs are left empty on purpose.

## Integrator to-dos
- [ ] **Stack options: none needed.** I did not edit `(auth)/_layout.tsx`, because §2.4 does not assign it to signin. `forgot` and `signup` use the Stack's default `screenOptions`. Add `<Stack.Screen name="forgot" />` and `<Stack.Screen name="signup" />` only if you want them listed.
- [ ] **No fixture exports and no dependencies needed.**
- [ ] `docs/DEMO-ACCOUNTS.md` lines 39–40 and 51–52 still say "website only". Update them to the demo paths below.
- [ ] Existing app behaviour, not mine: `ThemeProvider` remounts the whole tree with `key={scheme}`. Changing light/dark while signed out (or the browser pane re-syncing its colour scheme) resets any sign-in flow to `/login`.

## Demo (no token before sign-in → `demo/auth-extras.ts`; same answers in `demo/fixtures/signin.ts`)
- **Forgot:**
  - `afzal.demo@tamadamedia.com` → "ends in 7610";
  - 8328617610 (another number shows the "does not end in 7610" or mismatch wording);
  - code 123456;
  - any password of at least 4 characters. Nothing is sent or stored, and Demo@123 stays.
- **Sign-up:**
  - `afzal.newjoiner@tamadamedia.com` → Afzal New Joiner (Employee) → account created → Continue opens **Afzal Employee**;
  - `afzal.demo@tamadamedia.com` → "already exists" → Sign in instead;
  - `afzal.notlisted@tamadamedia.com` → "not on the list" warning → the server's 403 wording.

## Tested on
- Web preview at 390×844 and 320×700, light and dark. Personas: signed out, then Afzal Employee via sign-up Continue.
- I used my own origin, `http://signin.localhost:8090`, so I never signed out the other agents' `localhost` sessions.
- Fast Refresh from other agents' edits keeps resetting signed-out flows to `/login`. To test a long flow, call `disable()` on the HMR client module through `__r.getModules()`.
- `npx tsc --noEmit` and `npx eslint` are clean for every signin file. Other domains' errors were present at the time and are not touched.
