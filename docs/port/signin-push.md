# Port plan: sign-in extras and push notifications

Domain: staff **forgot password**, staff **sign-up** (the approved list), **Google sign-in**, and **push notifications**.
Research only. All line numbers are from the repo as of 21 Oct 2026. `server.js:2693` means file:line.

**Short answer**

| Feature | Server change? | Works in Expo Go (SDK 57)? | Effort |
| --- | --- | --- | --- |
| Forgot password (staff) | **None.** Every endpoint already exists and is public. | Yes | M |
| Sign-up (staff, approved list) | **None** | Yes | S–M |
| Google sign-in (staff) | **None** if the app gets a Firebase ID token itself (see §3.3). | **No.** It needs a native Google Sign-In module, so a development or preview build. | Code S, setup L |
| Push notifications | **Yes.** A table, 3 small routes and one send hook (§4.3). | **No.** Remote push was removed from Expo Go in SDK 53. Local notifications still work, which is enough for the demo. | Server S–M, app M, credentials M |

---

## 1. Website features

All four sign-in features live in one public component, `LoginForm` (`dash.html:1867`), inside `LoginPage` (`dash.html:1845`). It runs **before** sign-in, so there are no role or flag gates: no `navFor`, `canSeeHrNav`, `HR_SECTIONS`, `FEATURE_REGISTRY` or `tenantFeatureOn`. The server lists every endpoint below in `PUBLIC_API` (`server.js:1307-1331`), which lets them past the deny-by-default session gate (`server.js:1446`).

The website has no push notifications. People are told about events by email (Brevo) and WhatsApp (Pinnacle) only (§4.1).

### 1.1 Forgot password (staff)
Entry point: the "Forgot password?" link under the password field (`dash.html:2191`). It sets `tab='forgot'` and fills the email in from the login field.

State: `fpStage` = `email | phone | otp | reset | done` (`dash.html:1897-1906`).

1. **Email** (`dash.html:2236-2246`). The person types their email and taps **Send OTP**, which calls `fpLookup` (`dash.html:1907`) → `POST /auth/forgot-password/lookup {email}`.
   - On success the reply is `{ok, masked:'•••••1234'}`. The page stores `masked` and goes to stage `phone`.
   - On failure it shows the error: 404 "No account found with that email.", 400 "No phone number on file…", or 429 from the rate limiter.
2. **Phone** (a modal, `dash.html:2303-2318`). The page asks for the **full** mobile number and shows "It ends in 1234". `fpPhoneNext` (`dash.html:1915`) checks there are at least 10 digits, then goes to stage `otp`.
   - Why the full number: security finding C3. The lookup used to return the whole number, and two calls were enough to take over any account. Now the person must already know their number.
3. **OTP** (`dash.html:2320`). `OtpVerifyModal` (`dash.html:26427`) calls `POST /auth/phone/send-otp {phone, resendChallengeId?}`, which sends the code on WhatsApp and returns `{challengeId}`.
   - Six boxes take the code and submit by themselves on the sixth digit. Resend has a 20 s cooldown.
   - `POST /auth/phone/verify-otp {challengeId, code}` returns `{proofToken}`. The modal calls `onVerified(e164, proofToken)` and the form goes to stage `reset`.
4. **Reset** (`dash.html:2248-2258`). New password plus confirm, at least 4 characters, and they must match. `fpReset` (`dash.html:1920`) calls `POST /auth/forgot-password/reset {email, phone:e164, newPassword, idToken:proofToken}`.
5. **Done** (`dash.html:2259-2262`). The page says "Password reset!" and **Go to Log In** fills the email in. The person is **not** signed in by this flow.

### 1.2 Sign up (staff, approved list = `whitelist` table)
Entry point: the "Don't have an account? Sign up" link (`dash.html:2213`). It sets `tab='signup'` and shows a Log In / Sign Up toggle (`dash.html:2102-2104`).

1. **Email** (`dash.html:2278-2287`). **Continue** calls `checkEmail` (`dash.html:2062`) → `POST /auth/check-email {email}`.
   - Whitelisted: the reply is `{whitelisted:true, email, name, role, tenantId}`.
   - Not whitelisted: the page still carries on, using defaults (name taken from the email). The real gate is `/auth/signup`.
   - The note under the form reads "Your email must be added by HR or an admin before you can sign up."
2. **Set password** (`dash.html:2288-2300`). A card shows the person's name and role, then password and confirm (at least 4 characters, must match). `doSignup` (`dash.html:2079`) calls `POST /auth/signup {email, password, name, role, tenantId}`. The server reads **only** `email` and `password`. Name, role and tenant always come from the whitelist row.
   - Reply `{ok, user}`: the "Account created! You can now log in." screen (`dash.html:2265-2272`) with **Go to Log In**. **No session is returned.**
   - Error containing "already exists": the page switches to Log In with the email filled in.
3. Who controls the list: `POST /api/whitelist` needs `requireRole(USER_ADMIN_ROLES)` (`routes/whitelist.js:87`). Adding someone also sends them a Welcome email and the `dash_welcome` WhatsApp (`routes/whitelist.js:162-163`).

### 1.3 Google sign-in (staff)
The round Google button in the SSO row (`dash.html:2195-2204`) calls `doGoogle` (`dash.html:2034-2052`):
1. `ensureFirebaseInit()` (`dash.html:764`) fetches `GET /api/firebase-config` and runs `firebase.initializeApp(cfg)`. The Firebase compat SDK 10.7.1 is loaded from gstatic (`dash.html:20-21`).
2. `new firebase.auth.GoogleAuthProvider()` with `prompt:'select_account'`, then `signInWithPopup`, then `cred.user.getIdToken()`. This gives a **Firebase ID token**, not a raw Google ID token.
3. `POST /auth/google {idToken, trustDevice}`. A session payload means signed in. A closed popup shows no error.

No second factor: Google already proved who the person is. The vendor portal has its own copy, `doGoogleVendor` (`dash.html:31020`) → `/api/vendor/auth/google`. That belongs to the vendor domain, not this doc.

### 1.4 Related flows the app already has (for reference)
- Password, then a second factor: `/auth/login`, `/auth/login/send-otp`, `/auth/login/verify-otp`.
- Mobile-number sign-in: `/auth/phone/*`, then `/auth/mobile`.
- Change password: `/auth/change-password`.

All of these already exist in `mobile/src/api/auth.ts`.

---

## 2. Endpoints

| METHOD path | Server file:line | Gate | Request | Response the UI reads | Side effects / danger |
| --- | --- | --- | --- | --- | --- |
| `POST /api/auth/forgot-password/lookup` | `server.js:2693` | Public. `lookupLimiter`: 8 per 15 min, keyed by IP and by email (`server.js:1284`) | `{email}` | `{ok, masked:'•••••' + last 4}`. Errors: 404 no account, 400 no phone on file | None. **Reveals whether an account exists** (a 404 for an unknown email), so it can be used to enumerate emails. It is rate limited. It reads only `data[0]` when the same email has accounts in more than one company. |
| `POST /api/auth/phone/send-otp` | `server.js:2278` | Public. `ssoLimiter`: 40 per 15 min per IP (`server.js:1283`) | `{phone, resendChallengeId?}` | `{ok, challengeId}`. 429 cooldown (20 s) or too many sends (5). 502 if WhatsApp is not set up | **Sends a WhatsApp** `dash_otp_login` via `waOtpLogin` (`server.js:682`). The challenge is held in memory for 10 min, so a server restart drops it. |
| `POST /api/auth/phone/verify-otp` | `server.js:2317` | Public. `ssoLimiter` | `{challengeId, code}` | `{ok, proofToken}`: an HMAC token for `phoneDigits.expiresAt`, valid 10 min (`server.js:2198-2233`). Errors: 410 expired, 401 wrong code, 429 after 5 wrong codes | The challenge is single-use. The proof is only valid on the server instance that signed it. If `PHONE_OTP_SECRET` is not set, any restart makes proofs fail (`server.js:2187-2193`). |
| `POST /api/auth/forgot-password/reset` | `server.js:2719` | Public. `resetLimiter`: **5 per hour**, keyed by IP and by email (`server.js:1285`) | `{email, phone, newPassword (≥4), idToken: proofToken}` | `{ok:true}`. Errors: 401 bad, expired or missing proof; 404 no account; 400 "Verified phone does not match…" | **Irreversible overwrite** of `users.password` and of `data.password` (scrypt hash). Sends the email "Your DASH Password Was Reset" (`server.js:2750`) and the WhatsApp `dash_password_changed` (`server.js:2751`). Writes the audit entry `password_reset`. ⚠ It does **not** revoke the person's existing `auth_sessions`, so any other device stays signed in for up to 15 days. Three numbers must match on their last 10 digits: the one on file, the one submitted, and the one in the proof. |
| `POST /api/auth/check-email` | `server.js:2669` | Public. `lookupLimiter` | `{email}` | `{whitelisted:true, email, name, role, tenantId}` or `{whitelisted:false, email}` | None. It reveals the name, role and tenant of a whitelisted email, one email at a time, and is rate limited. |
| `POST /api/auth/signup` | `server.js:2618` | Public. `signupLimiter`: 10 per hour, keyed by IP and by email (`server.js:1286`) | `{email, password (≥4)}`. Any other fields are ignored | `{ok, user}`. **No token.** Errors: 403 "not whitelisted", 400 "already exists" | Creates a `users` row, or sets the password on a bulk-created row with none. It claims the first whitelisted company for this email that has no password yet. Audit `signup`. ⚠ **There is no proof that the person owns the email**: anyone who knows an unclaimed whitelisted email can claim the account. This is existing website behaviour; the app must not make it worse (§7). |
| `POST /api/auth/google` | `server.js:2526` | Public. `ssoLimiter` | `{idToken: Firebase ID token, trustDevice}` | Session payload `{ok, user, token, tokenExpiresAt}` from `completeLogin` (`server.js:2339`). 401 "Could not verify…"; 403 "not on the employee roster" | Checks the token with `Vendor.verifyFirebaseIdentity` (`vendor.js:64`), described below. If the user is new and on the whitelist, it **creates the account** (`server.js:2539-2552`, `signupMethod:'google'`). Audit `login` and `created`. |
| `GET /api/firebase-config` | `server.js:2963` | Public | — | `{apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId}`, built from `FIREBASE_*` env vars (`server.js:328-335`) | None. These are public web values. |
| `POST /api/auth/login` | `server.js:2353` | Public. `loginLimiter`: 10 per 15 min | `{email, password, trustDevice, accountId?}` | Already used by the app | Used after sign-up so the person does not have to type the password again. |

**How Google tokens are checked** (`vendor.js:64-101`). The server posts the token to `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=FIREBASE_API_KEY`. That means the token **must be a Firebase Auth ID token issued by the same Firebase project as `FIREBASE_API_KEY`**. A raw Google OAuth `id_token` is rejected. The server also rejects `emailVerified === false`, and it reads the email from Google's reply, never from the request. `FIREBASE_READY` is false when the key is missing; `/api/health` then reports `vendorAuth.google: 'MISSING'` (`server.js:2949`).

---

## 3. What the app has today, and what is missing

### 3.1 Existing files
- `src/api/auth.ts`: `sendPhoneOtp`, `verifyPhoneOtp`, `signInWithPhoneProof`, `passwordLogin`, `sendLoginEmailOtp`, `verifyLoginOtp`, `changePassword`, `last10`, `isSessionPayload`. Line 7 says "Google (Firebase) — not wired in the app yet."
- `src/auth/flow.ts`: a zustand store for the sign-in flow. `OtpPurpose = mobile | password-phone | password-email | demo`.
- `src/app/(auth)/login.tsx` (mobile number), `email.tsx` (email and password, then company, then factor, then phone), `otp.tsx` (one code screen for every purpose, with `proofRef` retry), `_layout.tsx` (Stack: login, email, otp, vendor, vendor-otp, vendor-password).
- `src/auth/auth-shell.tsx`: `AuthShell`, `BackButton`, `AuthDivider`, `AuthFooterLink`, `AuthNote`, `ResendCode`, `PhoneLead`, `maskSentTo`.
- `src/app/(app)/profile/password.tsx`: change password, a good template for the reset form.
- `src/app/(auth)/vendor.tsx` and `vendor-password.tsx`: the **vendor** forgot-password flow. It is already built and is the pattern to copy (`?reason=forgot`).
- `src/auth/session.ts`: SecureStore token and `signOut()`. There is no staff logout endpoint (README "Known limits").
- `src/api/inbox.ts`: polls `INBOX_POLL_MS = 60_000` for the tab badge. This is the only "notification" the app has today.
- `app.json` already has `scheme: "dashmobile"`, `extra.eas.projectId: "e93a7904-efb7-412a-aba1-d868194e1128"`, `owner: afzalkhan8326`, and the package and bundle id `com.tamadamedia.dashmobile`. `eas.json` has development (dev client), preview and production profiles.
- `package.json` has `expo-device`, `expo-constants`, `expo-web-browser`, `expo-linking` and `expo-secure-store`. It does **not** have `expo-notifications` or any Google sign-in module (checked in node_modules too).

### 3.2 Gaps
1. No staff "Forgot password?" in `email.tsx`. `docs/DEMO-ACCOUNTS.md:39-40` says "website only".
2. No staff sign-up screen (`docs/DEMO-ACCOUNTS.md:51-52`).
3. No Google button (`docs/DEMO-ACCOUNTS.md:46-48`).
4. No push. README "Known limits": "the server has no device-token endpoint". The server has no `push_devices` table, no route, and no Expo sender. grep for `ExponentPushToken`, `exp.host` and `push_tokens` finds nothing.

### 3.3 Google: which token can the phone produce?
- **What the server needs**: a Firebase ID token from the DASH Firebase project.
- **Without a Firebase SDK**: the app can turn a Google OAuth `id_token` into a Firebase ID token with one REST call. `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=<apiKey from /api/firebase-config>` with body `{postBody:'id_token=<GOOGLE_ID_TOKEN>&providerId=google.com', requestUri:'http://localhost', returnSecureToken:true, returnIdpCredential:true}` returns `{idToken, email, …}`. That `idToken` is then posted to `/api/auth/google`. **No server change and no new JS dependency.**
  - Firebase accepts a Google `id_token` whose `aud` is an OAuth client in the same Google Cloud project. Clients from other projects must be added under *Authentication → Sign-in method → Google → Safelist client IDs from external projects*.
  - The API key works without an HTTP referrer: the server already calls `accounts:lookup` with it from Node, with no referrer. If someone later restricts the key to the website domain, both calls break.
- **Getting the Google `id_token` on the phone**:
  - `@react-native-google-signin/google-signin`. The free "Original" API (`GoogleSignin.configure({webClientId, iosClientId})`, then `signIn()`) returns `idToken` with `aud = webClientId`. Use the **Web client ID of the DASH Firebase project**; Firebase creates it automatically. It needs a config plugin (`iosUrlScheme`) and a **development build**. Not in Expo Go.
    - Android also needs an Android OAuth client for `com.tamadamedia.dashmobile` with the SHA-1 of the EAS upload key and the Play App Signing key, in the same Google Cloud project.
    - The Credential Manager ("Universal") API in that library is paid. The Expo guide (docs.expo.dev/guides/google-authentication) also names `react-native-nitro-google-signin`. Either works, and both need a development build.
  - `expo-auth-session` is in Expo Go. But in SDK 57 its `GoogleAuthRequestConfig` is **deprecated** in favour of the native libraries, and Google does not accept `exp://` redirect URIs or custom-scheme redirects for Web clients. **Not usable in Expo Go.**
  - **Option B, Expo Go compatible, but it needs a website change.** Add a tiny public page on the DASH domain, for example `/m/google`. It runs the site's existing Firebase `signInWithRedirect`, then redirects to `dashmobile://google#idToken=…` (or to the `exp://` URL passed in `?return=`). The app opens it with `WebBrowser.openAuthSessionAsync(url, Linking.createURL('google'))`.
    - It is a static-page change, not an API or DB change. But it puts a 1-hour bearer token in a redirect URL; using a fragment keeps it out of server logs. Only do this if Google in Expo Go matters.

---

## 4. Push notifications

### 4.1 Every place the server notifies people today
Helpers: `sendEmail` (`server.js:355`, Brevo, paused by `EMAILS_ENABLED`) and `sendWhatsApp` (`server.js:569`, Pinnacle, paused by `WHATSAPP_ENABLED`), plus one `wa*()` wrapper per template (`server.js:682-807`). Modules receive `sendEmail` through `deps` (for example `vendor.js:30` and `routes/tasks.js:19`), so one hook inside `server.js` would cover them all.

Key: **E** = email, **W** = WhatsApp, **→** = recipient. The last column is the suggested deep link in the app ("web" means there is no matching screen in the app yet).

| # | Event | Route (file:line of the send) | Channel → recipient | App target |
| --- | --- | --- | --- | --- |
| 1 | Sign-in code (WhatsApp) | `POST /auth/phone/send-otp` (`server.js:2302`) | W → the typed phone | **never push** |
| 2 | Sign-in code (email) and the admin copy | `POST /auth/login/send-otp` (`server.js:2443`, `2468`, SMS `2473`) | E → user, E and SMS → `OTP_ADMIN_*` | **never push** |
| 3 | Password reset | `POST /auth/forgot-password/reset` (`server.js:2750-2751`) | E and W → user | `/profile` (security alert) |
| 4 | Added to the whitelist (welcome) | `POST /api/whitelist` (`routes/whitelist.js:162-163`) | E and W → new person | none (no app account yet) |
| 5 | Login email changed | `POST /api/employees/change-email` (`routes/users.js:374`) | E → the old address | `/profile` |
| 6 | Task assigned | `POST /api/tasks` (`routes/tasks.js:95-96`) | E and W → assignee | `/tasks/[id]` |
| 7 | Task submitted, approved or returned; booking work submitted | `PUT /api/tasks/:id` (`routes/tasks.js:243-280`) | E and W → manager, assignee or requester | `/tasks/[id]` |
| 8 | Booking requested, confirmed, pending, sent to approver; client meeting room booked | `POST /api/bookings` (`routes/bookings.js:142-188`) | E and W → approvers, requester, location approver | web (booking) |
| 9 | Booking approved or rejected; professional booked; work submitted | `PUT /api/bookings/:id` (`routes/bookings.js:267-311`) | E and W → requester, professional | web (booking) |
| 10 | Ticket or request raised (confirmation, admins, helpdesk) | `POST /api/tickets` (`routes/tickets.js:41-85`) | E and W → raiser, admins, handlers | `/support/[id]` |
| 11 | Ticket cancelled, approved, rejected, resolved, closed, status change | `PUT /api/tickets/:id` (`routes/tickets.js:185-268`) | E and W → assignee, admins, raiser | `/support/[id]` |
| 12 | Ticket rejected | `POST /api/tickets/:id/reject` (`routes/tickets.js:337-341`) | E and W → raiser | `/support/[id]` |
| 13 | Asset assigned, with acknowledge link | `PUT /api/assets/:id` (`routes/assets.js:134-140`), `POST /api/assets/:id/resend-ack` (`routes/assets.js:221-226`) | E and W → employee | web (asset ack) |
| 14 | Reimbursement submitted → cost-code owner, or → Accounts if self-owned | `POST /api/reimbursements` (`reimbursements.js:155-160`, `notifyAccounts` `:166`) | E → owner or Accounts | `/reimbursements/approvals` |
| 15 | Reimbursement approved by owner (→ Accounts) or rejected (→ employee) | `/keka-approve` (`reimbursements.js:248`), `/keka-reject` (`:267`) | E | approvals / `/reimbursements/[id]` |
| 16 | Reimbursement re-uploaded | `/reupload` (`reimbursements.js:326-332`) | E → owner or Accounts | `/reimbursements/approvals` |
| 17 | Reimbursement authorized or rejected by Accounts | `/accounts-authorize` (`:349`), `/accounts-reject` (`:368`) | E → employee | `/reimbursements/[id]` |
| 18 | Reimbursement payment not received | `/payment/respond` (`reimbursements.js:420`) | E → Accounts | web (Accounts) |
| 19 | Petty cash: confirmation for a request made on your behalf, **with a code** | `POST /api/petty_cash_requests` (`server.js:3651`), `/resend-otp` (`:3726`) | E → employee | `/petty-cash/request/[id]`, **without the code** |
| 20 | Petty cash waiting for Accounts | `notifyPettyCashAccounts` (`server.js:3358`), called at `:3657`, `:3699`, `:3760`, `:4212` | E → Accounts users | web (Accounts) |
| 21 | Petty cash not received | `notifyPettyCashFollowUp` (`server.js:3383`) via `/payment/respond` (`:3937`) | E → Accounts | web |
| 22 | Petty cash bills over the advance | `pettyCashSettleOverspendLocked` (`server.js:4215`) | E → cost-code owner | `/petty-cash` |
| 23 | Petty cash bill rejected | `POST /api/petty_cash_bill_submissions/:id/reject` (`server.js:4469`) | E → employee | `/petty-cash/bills` |
| 24 | Bounty reminder (WhatsApp first, email if that fails) | `POST /api/bounty_tasks/:id/remind` (`server.js:5907-5911`) | W or E → people who have not taken part | `/bounty/[id]` |
| 25 | Bounty redemption requested | `POST /api/bounty_redemptions` (`server.js:6692-6701`) | E and W → approvers | web (bounty admin) |
| 26 | Redemption approved, declined, coupon revealed | `/approve` (`server.js:6740-6745`), `/decline` (`:6780-6786`), `/reveal` (`:6816-6828`) | E and W → employee | `/bounty/wallet` |
| 27 | Referral forwarded | `POST /api/referrals/:id/hr-accept` (`server.js:8001`) | E → target | web |
| 28 | Careers application forwarded | `POST /api/admin/public-applications/:id/forward` (`server.js:8771`) | E → target | web |
| 29 | Careers application received | `POST /api/public/jobs/:slugOrId/apply` (`server.js:8559`) | W → **candidate**, not staff | never |
| 30 | Birthday or anniversary card | `processCelebrationAnnouncements` (`server.js:9427`, hourly `:9560`; sends `:9521`, `:9552`), and `/api/celebration/test-send` (`:2858`) | W → the tenant's `hrNotifyPhone` | `/announcements` |
| 31 | Visitor at the desk: host must let them in | `POST /api/public/visit/:tenantId/:token` (`visitors.js:386`, via `notify` `:226`) | W → host | `/visitors` (**the most valuable push**) |
| 32 | Invited guest arrived | `…/invite/:inviteId/arrive` (`visitors.js:545`) | W → host | `/visitors` |
| 33 | Visitor approved or rejected | decide helper (`visitors.js:289`) | W → **visitor** | never |
| 34 | Visitor pass and invite | `POST /api/visitors/invites` (`visitors.js:784`) | W → **guest** | never |
| 35 | Vendor bills waiting for a cost-code owner | `POST /api/vendor-bills` (`vendor_bills.js:297`) | E → owner | web (Accounts) |
| 36 | Vendor bill authorized, rejected, updated | `vendor_bills.js:505`, `:540`, `:627` | E → submitter or owner | web |
| 37 | Vendor bill payment not received | `vendor_bills.js:798` | E → Accounts | web |
| 38 | Agreement awaiting signature, deadline extended | `POST /api/vendor-agreements` (`vendor_agreements.js:253`), `PUT …/:id/deadline` (`:345`) | E → **vendor** | vendor portal (phase 2) |
| 39 | Agreement fully signed, signed, your signature needed | `vendor_agreements.js:396`, `:501`, `:512` | E → creator or next internal signer | web |
| 40 | Vendor registration submitted, approved, rejected, correction | `vendor.js:2775`, `:3514`, `:3550`, `:3593` (→ vendor), `:3740`, `:3773` (→ POC), `:3799` (→ Accounts) | E | Accounts web / vendor portal |

**No notification at all today**:
- HR leave, WFH, comp-off, regularization, HR claims and loans: there are no sends in `hr*.js` (grep finds none).
- Announcements and news.
- Meets chat messages (`meets.js` streams only to open tabs).
- Policies and payroll runs.

Push could add these later, but each needs an explicit server hook.

### 4.2 Server side: the minimal change (needs the owner's go-ahead)

**a) New SQL file `sql/push_devices.sql`.** Run it once in the Supabase SQL editor. It is safe to re-run, like `sql/kiosk_devices.sql`.
```sql
CREATE TABLE IF NOT EXISTS push_devices (
  token         TEXT PRIMARY KEY,                       -- 'ExponentPushToken[…]'
  user_id       TEXT NOT NULL,                          -- users.id (staff); vendors are phase 2
  tenant_id     TEXT,
  session_token TEXT REFERENCES auth_sessions(token) ON DELETE CASCADE,
  platform      TEXT,                                   -- 'ios' | 'android'
  device_name   TEXT,
  app_version   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error    TEXT
);
CREATE INDEX IF NOT EXISTS push_devices_user_idx ON push_devices (user_id);
ALTER TABLE push_devices ENABLE ROW LEVEL SECURITY;   -- service role only, per sql/rls_lockdown.sql
NOTIFY pgrst, 'reload schema';
```
- **Why `session_token` with a cascade.** There is no staff logout endpoint, and a 15-day session can expire while the app is closed. `purgeStaleRows` already deletes expired `auth_sessions` every hour (`server.js:~9602`). The cascade therefore stops pushes to signed-out phones automatically.
- The sender also skips any row whose session is `revoked` or past `expires_at`.

**b) Routes.** Register them after the auth gate. They are **not** public and need no `requireRole`, because every signed-in staff member may register their own phone. They use `req.authUser` and `req.session.token`, which the gate sets at `server.js:1479-1480`.
- `POST /api/push/devices {token, platform, deviceName?, appVersion?}`
  - Validate the token against `^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$` (200 characters at most).
  - Upsert by `token`, with `user_id = req.authUser.id`, `tenant_id`, `session_token = req.session.token` and `updated_at = now()`. Upserting reassigns a phone that changed hands to the new user.
  - Reply `{ok:true}`. Rate limit it like `ssoLimiter`.
- `POST /api/push/devices/remove {token}`: delete where `token` matches and `user_id` is the caller. Reply `{ok:true}`. The app calls it in `signOut()` **before** it forgets the session.
- `POST /api/push/test`: sends "Notifications are on" to the caller's own devices. Reply `{ok, sent, errors[]}`. Used by the settings row to check the whole chain works.

**c) Sender, `lib/push.js`** (about 120 lines, no new npm package; it uses `https.request` like `sendEmail`):
- `pushToUsers(userIds, {title, body, data:{url, kind}})`:
  - Look up the rows joined to live sessions.
  - Send in chunks of 100 to `POST https://exp.host/--/api/v2/push/send` with `{to, title, body, data, sound:'default', channelId, priority:'high'}`. Add the header `Authorization: Bearer EXPO_ACCESS_TOKEN` if set; turning on Expo's "enhanced push security" is recommended.
  - Handle tickets: on `DeviceNotRegistered`, delete the row; on any other error, write `last_error`.
  - Never throw. Return `{ok, sent, skipped}`, the same contract as `sendEmail`.
- `pushToEmail(email, msg)` and `pushToPhone(phone, msg)`: resolve to users through `users.email` (lowercase) or `last10(mobile|phone)`, using the user cache.
- A kill switch: `PUSH_ENABLED` env, off until rollout, mirroring `WHATSAPP_ENABLED`.
- Rate limit: Expo allows 600 per second per project, which DASH will not reach.
- Receipts are optional. A later hourly job could fetch `/--/api/v2/push/getReceipts` to catch late `DeviceNotRegistered`.

**d) Hooks. Two phases.**
- **Phase 1, one hook covering 90% of events.**
  - Inside `sendEmail` (`server.js:355`), before the `EMAILS_ENABLED` check so push works even when email is paused: `if (!opts?.noPush) Push.pushToEmail(to, {title: subject, body: firstParagraphText(html), data:{url: routeForSubject(subject)}})`. Add a 5th optional parameter `opts`.
  - Pass `{noPush:true}` at the code-carrying sends: `server.js:2443`, `2468`, `2766` (test email), and `3651`/`3726` (petty cash on-behalf code). For those two, send an explicit push **without the code** instead.
  - Vendor, POC and candidate addresses simply match no staff user, so nothing is sent.
  - Also add a push in `visitors.js notify()` (`:226`) for `visitorArrival` and `guestArrived` only, through `pushToPhone(hostPhone)`. These are WhatsApp-only today and are the most time-critical.
  - Also add one in the WhatsApp branch of the bounty reminder (`server.js:5907`), because email only fires there when WhatsApp fails.
- **Phase 2, quality.** Replace the subject-based routing with explicit `Push.pushToUsers([id], {…, data:{url:'/tasks/'+id}})` beside each send in §4.1. Also add new pushes where nothing is sent today: HR approvals waiting for you (`hr_leave.js`, `hr_time.js`, `hr_payroll.js`, so the approver's Inbox badge updates), decisions on your own leave or claim, new announcements, and Meets messages.

**Danger notes**
- Never push a code. Push text appears on lock screens. Event #2 is a deliberate account-takeover path (`server.js:2111-2121`) and must not grow a third channel.
- Amounts and names on the lock screen are a privacy trade-off. Consider an app setting to "hide details" that the server respects later.

### 4.3 App side
- **Dependency**: `npx expo install expo-notifications`, which picks the SDK 57 `~57.0.x` version. It is the only new JS dependency, and `expo-device` and `expo-constants` are already present.
- **`app.json`**:
  - Add the plugin `["expo-notifications", {"icon": "./assets/images/notification-icon.png", "color": "#C33B02"}]`. The icon is a white-on-transparent 96×96 PNG, which still has to be made. The plugin adds Android 13's `POST_NOTIFICATIONS` permission and iOS `aps-environment`.
  - Add `android.googleServicesFile: "./google-services.json"`: register an Android app `com.tamadamedia.dashmobile` in a Firebase project (the DASH web project is fine). Expo's FCM guide says this file is **required for an Android push token**. It is not a secret and may be committed.
  - `extra.eas.projectId` is already set; pass it as `getExpoPushTokenAsync({projectId: Constants.expoConfig?.extra?.eas?.projectId})`.
- **Credentials** (one-time, on expo.dev or with `eas credentials`):
  - **Android**: upload the **FCM V1 service-account key** JSON from Firebase → Service accounts. Never commit it.
  - **iOS**: an APNs key, which needs a paid Apple Developer account.
  - Then build the `development` or `preview` profile. **The owner's Expo Go cannot receive remote pushes.**
- **New and changed files**:
  - `src/api/push.ts`: `registerPushDevice`, `removePushDevice`, `sendTestPush`.
  - `src/lib/push.ts`:
    - On startup, call `setNotificationHandler`, which shows a banner when the app is in the foreground and invalidates `['inbox']` and the module's query key based on `data.kind`.
    - Create the Android channels `approvals`, `visitors` and `updates` with `setNotificationChannelAsync`, **before** asking for the token; the docs require this on Android 13+.
    - `ensurePushRegistered()` runs after sign-in, on app foreground and when permission is granted. It is skipped when `isDemoSession()` and in Expo Go (`Constants.executionEnvironment === 'storeClient'`), where `getExpoPushTokenAsync` throws on Android.
    - Tap handling: `addNotificationResponseReceivedListener` plus `getLastNotificationResponseAsync` for a cold start, then `router.push(data.url)` once the session is hydrated. Only accept URLs that start with `/` and match a known route.
    - `setBadgeCountAsync(inboxCount)`.
  - `src/auth/session.ts`: in `signOut()`, call `removePushDevice(token)` first, best effort, before clearing SecureStore.
  - `src/features/more/notifications-card.tsx`: a `ListRow` with a switch, next to `security-card.tsx` (App lock). It shows Off, On or Blocked; Blocked offers "Open settings" (`Linking.openSettings()`). It also has a "Send a test notification" action.
- **Soft ask**: a dismissible `Banner` on Home once, after first sign-in: "Get notified when a visitor arrives or a task needs you", with **Turn on**. The system prompt only appears after that tap.

---

## 5. Mobile design proposal (existing kit)

All new auth screens use `AuthShell` (Payno sign-in, `docs/REFERENCE-COMPONENTS.md` §3), `PillField`, `Button`, `Banner tone="danger"` for server errors, `OtpBoxes` with `NumericKeypad`, `ResendCode`, `BackButton` and `SuccessSheet`. Copy stays plain and short (docs/DESIGN.md).

### 5.1 Forgot password: new route `src/app/(auth)/forgot.tsx` plus an OTP purpose
- **Entry**: a text link "Forgot password?" under the password field on `email.tsx`, step `credentials`. It goes to `/forgot?email=<typed>`. Add it to the `(auth)/_layout.tsx` Stack.
- **Step `email`** (icon `KeyRound`): "Reset your password", with one muted line: "We’ll send a code on WhatsApp to the number on your profile." One mail `PillField`, then **Continue** → `lookup`.
- **Step `phone`** (icon `Smartphone`): "Confirm your number". A `PhoneLead` field with the hint "Must end in 1234." **Send code** calls `sendPhoneOtp`, then `flow.set({purpose:'forgot', phone, phoneChallengeId, sentTo})`, then `/otp`.
- **`otp.tsx`**: add `'forgot'` to `OtpPurpose`. On a good code, store `proofToken` in the flow (add `forgotProof`, `forgotEmail` to `flow.ts`), then `router.replace('/forgot?step=reset')`. Do not sign in. The subtitle and icon stay the same as WhatsApp.
- **Step `reset`** (icon `LockKeyhole`, eyebrow "Number verified"): two `PillField`s with eye toggles, errors inline per field (copy `vendor-password.tsx`), then **Save password** → `/auth/forgot-password/reset`.
  - The proof lasts 10 min. On a 401 saying "expired", the `Banner` offers **Send a new code**, which goes back to step `phone`.
- **Done**: a `SuccessSheet`: "Password changed. We’ve also sent you an email and a WhatsApp." The primary is **Sign in**, which goes to `/email` with the email filled in.
  - Optional nicety: call `passwordLogin(email, newPw)` straight away and continue at step `factor`. The server still asks for the second factor.
- No `SwipeToConfirm` is needed. Resetting your own password with proof of your phone is the whole point of the flow, and the old password is not needed.

### 5.2 Sign up: new route `src/app/(auth)/signup.tsx`
- **Entry**: on `email.tsx` step `credentials`, under the "Or" divider, add a text button "New here? Create your account". It is not on the mobile-number screen, to keep that screen to one way in.
- **Step `email`** (icon `UserPlus`): "Create your account", with the line "Use the work email HR added for you." **Continue** → `check-email`.
  - Whitelisted: next step.
  - Not whitelisted: still continue, like the website. But show a `Banner tone="warning"`: "We couldn’t find this email on your company’s list. You can still try. If it fails, ask HR to add you."
- **Step `password`**: a frosted identity card (`ListCard` with an `IconBadge` of initials, name, role) when whitelisted, then two password `PillField`s (at least 4 characters, must match), then **Create account** → `/auth/signup`.
  - 400 "already exists": a `Banner` with the action **Sign in instead**, which goes to `/email` with the email filled in.
  - Success: a `SuccessSheet` saying "Account created". **Continue** calls `passwordLogin(email, pw)` and lands on `email.tsx` step `factor`, by passing the challenge through `flow` and a `?resume=factor` param.

### 5.3 Google: a button on `login.tsx` and `email.tsx`
- **Where**: an outlined `ghost` pill "Continue with Google", using the multicolour G as an SVG through `react-native-svg`, which is already installed. Put it under `AuthDivider`, next to "Sign in with email".
- **Show it only when** `Constants.executionEnvironment !== 'storeClient'` (not Expo Go) **and** the build has `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` set. In Expo Go, show nothing, so the owner never sees a dead button.
- **Flow**:
  1. `GoogleSignin.signIn()` gives `idToken`.
  2. Fetch `GET /firebase-config` for `apiKey`.
  3. `accounts:signInWithIdp` gives the Firebase `idToken`.
  4. `POST /auth/google {idToken, trustDevice:true}`.
  5. `signIn({kind:'staff', …})`.
- **Errors**: 403 "not on the employee roster" appears as the danger `Banner`. A cancelled picker shows nothing.
- **New files**: `src/auth/google.ts` (the native call and the REST exchange) and `api/auth.ts` `signInWithGoogle(idToken)`.

### 5.4 Push
Covered in §4.3. The UI parts are the More-tab Notifications row, the Home soft-ask `Banner`, and tapping a notification to open the matching screen (`/tasks/[id]`, `/support/[id]`, `/visitors`, `/reimbursements/approvals`, `/petty-cash/request/[id]`, `/bounty/[id]`, `/inbox`). There is no separate "notification centre" screen, because the server keeps no notification history. The Inbox remains the to-do list.

### 5.5 What stays web-only, and why
- Vendor Google sign-in. It belongs to the vendor domain and needs the same native module; it can share `src/auth/google.ts` later.
- Admin-side whitelist management (Employee Roster). That is the HR domain.
- Deep links for bookings, asset acknowledgement, vendor bills and agreements, referrals and careers. The app has no screens for them yet; a push for these opens the Inbox or More until those ports land.

---

## 6. Expo Go feasibility (SDK 57)

| Need | Module | In Expo Go? | Notes |
| --- | --- | --- | --- |
| Forgot password, sign-up | none new | ✅ | Only `fetch` and existing kit components. |
| Google sign-in | `@react-native-google-signin/google-signin` (free Original API) or `react-native-nitro-google-signin` | ❌ needs a development build | Per docs.expo.dev/guides/google-authentication: "can't be used in Expo Go because they require custom native code". `expo-auth-session` is in Expo Go, but its Google config is deprecated and Google refuses `exp://` redirects. Expo Go is only possible through Option B (a website redirect page), §3.3. |
| Firebase ID token | none (REST `accounts:signInWithIdp`) | ✅ | Do not add `@react-native-firebase/*`; it is heavy and native. |
| Remote push | `expo-notifications` | ❌ | The SDK 57 Notifications doc says remote push is "unavailable in Expo Go on Android from SDK 53", and the push FAQ says "Expo Go does not support push notifications functionality" in SDK 53+. Needs a development or preview build with FCM and APNs credentials. |
| Local notifications | `expo-notifications` | ✅ | Works in Expo Go. Use it for the demo and to check the tap-to-open routing. |
| Badge count | `expo-notifications` `setBadgeCountAsync` | partly | iOS shows it; Android depends on the launcher. |

New JS dependencies: `expo-notifications` (push) and one Google sign-in library (Google only). Nothing else.

---

## 7. Demo fixtures (Afzal personas)

Requests made before sign-in never reach `demoFetch`, because `apiFetch` only redirects calls carrying a demo **token** (`src/api/client.ts:56`). So the sign-in extras need **inline demo branches** in the screens, the same way `email.tsx` (`isDemoEmail`) and `vendor.tsx` already work. Put them in one helper, `src/demo/auth-extras.ts`, so the screens stay clean. Everything is gated on `DEMO_ENABLED` (dev and preview builds only).

- **Forgot password**:
  - `afzal.demo@tamadamedia.com` → masked `•••••7610`.
  - The phone must be `8328617610`, or the screen shows the server's "does not match" wording.
  - The code is `123456`, and an `AuthNote` says so.
  - Reset accepts any password of at least 4 characters and shows the success sheet. A note says "Demo: your password stays Demo@123". Nothing is stored.
  - Then go to `/email`, with **Afzal Employee** as the default persona once signed in.
- **Sign up**: add `DEMO_SIGNUP_EMAIL = 'afzal.newjoiner@tamadamedia.com'`.
  - `check-email` returns `{whitelisted:true, name:'Afzal New Joiner', role:'employee'}`.
  - Sign-up "succeeds", then **Continue** calls `startStaffDemo('employee')` from `features/demo/role-picker.tsx`.
  - Using the existing demo email answers "An account with this email already exists. Please log in.", so the error path can be tried too.
- **Google**: in a demo build that has the native module, keep the real flow. Add a **"Demo Google account"** row in `DemoRolePicker` only if useful. In Expo Go the button is hidden, so nothing is needed.
- **Push** (demo token):
  - Add `src/demo/fixtures/push.ts` with routes `POST /push/devices`, `POST /push/devices/remove` → `{ok:true}` and `POST /push/test` → `{ok:true, sent:1, errors:[]}`.
  - In demo, `src/lib/push.ts` replaces remote registration with **local notifications** (`scheduleNotificationAsync`, 3 s delay), so the settings row and tap routing can be tried in Expo Go.
  - Per persona, from fixtures that already exist:

    | Persona | Sample notification | Opens |
    | --- | --- | --- |
    | Afzal Employee | "Task Assigned: Reel edit v2" | `/tasks/<fixture id>` from `fixtures/tasks.ts` |
    | Afzal Employee | "Visitor at reception: Ravi Kumar" | `/visitors`, `fixtures/visitors.ts` pending visit |
    | Afzal Manager | "Task Submitted: …" | `/tasks/[id]` |
    | Afzal Manager | "Reimbursement awaiting your approval" | `/reimbursements/approvals` |
    | Afzal Accounts | "Petty cash awaiting Accounts approval" | `/petty-cash` |
    | Afzal HR | "Birthday today: Priya Sharma" | `/announcements` |
    | Afzal IT Admin, Afzal Admin | "New IT ticket: Laptop not booting" | `/support/[id]` |
    | Afzal Visitor Manager | "Guest arrived" | `/visitors` |

---

## 8. Effort and risks

| Piece | Effort | Notes |
| --- | --- | --- |
| Forgot password: `forgot.tsx`, `otp.tsx` purpose, `flow.ts` fields, demo branch | **M** | Same calls as the vendor flow; about 300 lines. |
| Sign up: `signup.tsx`, auto-continue to the second factor, demo branch | **S–M** | Two calls; about 220 lines. |
| Google: button, `src/auth/google.ts`, REST exchange | code **S** | |
| Google setup: Google Cloud OAuth clients, SHA-1s, a dev or preview build, safelisting | setup **L** | |
| Push server: SQL, 3 routes, `lib/push.js`, `sendEmail` hook, visitors hook | **S–M** | About 250 lines plus 1 migration. Phase 2 explicit deep links and HR hooks: **M**. |
| Push app: `expo-notifications`, `lib/push.ts`, channels, More row, soft ask, tap routing, sign-out unregister | **M** | |
| Push credentials: `google-services.json`, FCM V1 key, APNs key, first dev or preview build | **M** | One-time, done by the owner on expo.dev, Firebase and Apple. |
| Demo fixtures: auth-extras helper, push fixture, local notifications | **S** | |

**Risks**
1. **Expo Go cannot test Google or push.** The owner tests in Expo Go (memory), so both need an EAS `preview` APK or a `development` build before anyone can see them work. Plan one build once both are ready.
2. **Sign-up has no proof of email ownership** (`server.js:2618`). Anyone who knows an unclaimed whitelisted address can claim it. The app adds no new hole, but adding the flow does make the existing one more visible.
   - Suggested future server fix, not part of this port: require `/auth/phone/verify-otp` proof that matches `whitelist.mobile`, or email a verification code.
3. **Password reset does not revoke sessions.** A stolen phone stays signed in for up to 15 days after the owner resets.
   - Suggested server fix: `update auth_sessions set revoked=true where subject_id=…` in `/auth/forgot-password/reset`. Push would then stop for those devices too, through the session join.
4. **WhatsApp proof secret.** If `PHONE_OTP_SECRET` is unset, any deploy between "verify code" and "save password" fails with "We could not confirm…". The UI must offer "Send a new code".
5. **Multi-company emails.** Forgot-password lookup and reset only touch `data[0]` (`server.js:2701`, `2734`), so a person with two company accounts resets only one of them. This matches the website.
6. **Google Firebase API key.** If someone adds an HTTP-referrer restriction to `FIREBASE_API_KEY`, the phone's `signInWithIdp` and the server's `accounts:lookup` both break. Document this next to the env var.
7. **Lock-screen content.** Never put OTP codes in a push. Petty cash event #19 needs a code-free push text. Amounts and names are visible on the lock screen.
8. **Push volume and duplicates.** Phase 1 sends one push per email, and some events email many admins (tickets #10, petty cash #20). Group them by Android channel, and consider a per-user mute in phase 2.
9. **No staff logout endpoint.** If the phone is offline at sign-out, the device row stays until the session expires. The cascade covers this, so pushes stop at expiry at the latest.
10. **`google-services.json` and Firebase project choice.** Using the same Firebase project for the website's Google sign-in, FCM and the Android OAuth client keeps the setup to one project. A second project would need the client-ID safelisting step.
