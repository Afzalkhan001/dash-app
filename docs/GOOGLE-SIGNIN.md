# Google sign-in in the DASH app: what the owner sets up

This is a plain-words checklist. When it is done, staff can tap **Continue with Google** on the app's
sign-in screens, the same way they use the round Google button on the website.

**Short answer**

- **No server change and no database change.** The app uses the endpoints the website already uses.
- **No website redirect page is needed** for the installed app (the APK or store app). You only need a
  page if Google sign-in must also work inside **Expo Go**. That page isn't built (see "Expo Go").
- In Google Cloud you make **one Android and one iOS OAuth client** (plus a Web one if you want the web
  preview on a computer). They go in the **same Google Cloud project as DASH's Firebase project**.
- You copy the client ids into three expo.dev variables, then make a new build.

## How it works (for reference)

The server only accepts a **Firebase** sign-in token from the DASH Firebase project
(`server.js` `POST /api/auth/google` → `vendor.js` `verifyFirebaseIdentity`). The website gets one
from the Firebase popup. The app gets one in three steps:

1. The app opens Google's own sign-in page in the phone's browser (`expo-auth-session`). The person
   picks their account, and Google sends them back to the app.
2. The app asks Firebase (with the public key from `GET /api/firebase-config`, the same one the
   website loads) to turn that Google sign-in into a Firebase token.
3. The app sends it to `POST /api/auth/google`. The rules are the website's: a DASH user signs in;
   someone on HR's approved list gets an account made; anyone else sees *"This Google account is not
   on the employee roster. Ask HR to add you, then sign in again."* There is no extra code to type.

## Before you start

- Find the DASH Firebase project. Open `https://dash.tamadamedia.in/api/firebase-config` in a
  browser; `projectId` is its name. Every step below is done **in this same project** in the Firebase
  console (console.firebase.google.com) and in Google Cloud (console.cloud.google.com, project picker
  at the top).
- In Firebase → **Authentication** → **Sign-in method**, **Google** must be **Enabled**. It already
  is if the website's Google button works.

## Step 1. The consent screen

Google Cloud → **APIs & Services** → **OAuth consent screen** (also called **Google Auth Platform** →
**Branding / Audience**).

- It already exists if the website's Google button works. Check that it is **In production** (not
  "Testing"), or only listed test users can sign in.
- Scopes needed: `openid`, `email`, `profile` (the basic ones; no review needed).

## Step 2. The Android client

1. Get the **SHA-1** of the app's signing key:
   - Run `npx eas-cli@latest credentials --platform android` in the `mobile` folder, pick the
     **preview** (and later **production**) build profile, and copy **SHA1 Fingerprint** of the
     keystore EAS made. If there is no keystore yet, run one `preview` build first; EAS makes it.
   - After the app is on Google Play, also note **Play Console** → the app → **Test and release** →
     **App integrity** → **App signing key certificate** → **SHA-1**.
2. Google Cloud → **APIs & Services** → **Credentials** → **Create credentials** →
   **OAuth client ID** → Application type **Android**.
   - **Name:** `DASH app (Android)`
   - **Package name:** `com.tamadamedia.dashmobile`
   - **SHA-1 certificate fingerprint:** the EAS keystore SHA-1 from step 1.
   - Click **Create**.
3. Open the new client → **Advanced settings** → tick **Enable custom URI scheme** → **Save**.
   This is required: it lets Google send people back to `com.tamadamedia.dashmobile:/oauthredirect`.
   Without it Google shows "Error 400: invalid_request" after the account is picked.
4. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`).
   - Optional: for the Play Store build, make a second Android client the same way with the **App
     signing key** SHA-1. This sign-in opens in the browser, so Google does not check the SHA-1 when
     someone signs in; it only needs one to create the client. The app uses one Android client id.

## Step 3. The iOS client (only if you ship on iPhone)

Google Cloud → **Credentials** → **Create credentials** → **OAuth client ID** → **iOS**.

- **Name:** `DASH app (iOS)`
- **Bundle ID:** `com.tamadamedia.dashmobile`
- App Store ID and Team ID can stay empty for now.
- Copy the **Client ID**.

iOS clients accept the bundle id as the return address (`com.tamadamedia.dashmobile:/oauthredirect`),
so no extra setting is needed.

## Step 4. The Web client (optional: the web preview on a computer)

The developers' web preview (`http://localhost:8090`) is the only thing that uses this. Skip it if
nobody needs Google there.

Use Google Cloud → **Credentials** → the existing **Web client (auto created by Google Service)**, or
make a new **Web application** client:

- **Authorised JavaScript origins:** `http://localhost:8090`
- **Authorised redirect URIs:** `http://localhost:8090/login`

Don't touch the redirect URIs the website already has. Just add these two.

## Step 5. Only if the clients are in a different project

If you made the clients in a Google Cloud project that is **not** the Firebase project, Firebase will
refuse them. Firebase → **Authentication** → **Sign-in method** → **Google** → **Safelist client IDs
from external projects** → add each client id → **Save**. If everything is in one project, skip this.

## Step 6. Check the Firebase key isn't locked to the website

Google Cloud → **APIs & Services** → **Credentials** → **API keys** → the key whose value matches
`apiKey` in `/api/firebase-config`.

- **Application restrictions** must be **None**. A "Websites (HTTP referrers)" restriction stops both
  the phone and the server's own check from working, including the website's Google button.
- If **API restrictions** are on, the list must include **Identity Toolkit API**.

## Step 7. Add the client ids on expo.dev

expo.dev → project **dash** → **Environment variables** → **Add Variables**, all **Plain text**
(client ids are not secrets; never add a client *secret*):

| Name | Environments | Value |
|---|---|---|
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | preview, production | Android client id (step 2) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | preview, production | iOS client id (step 3) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | (local `.env.local` only) | Web client id (step 4) |

## Step 8. Build and test

1. The developers must first add the return address to `app.json` (one line; see
   `src/features/googlesignin/HANDOFF.md`). A new build is needed after that change.
2. `npx eas-cli@latest build --profile preview --platform android`, install the APK.
3. On the sign-in screen, tap **Continue with Google**, pick a work account:
   - a DASH user signs straight in;
   - an address on the approved list gets an account and signs in;
   - any other address sees the "not on the employee roster" message.

The `development` build profile can't be used yet (it needs `expo-dev-client`, which the app
doesn't include), so test with **preview**.

## Expo Go

Real Google sign-in **cannot finish inside Expo Go**. Google only sends people back to an address the
app owns (`com.tamadamedia.dashmobile:/…`) or to a web page, and Expo Go's `exp://` address is neither.
In Expo Go the button opens a **sample account picker** instead (demo only, nothing is sent), with the
note "Real Google sign-in · Available in the installed app".

To make the real thing work in Expo Go you would need a **website change**: a small public page on the
DASH site (for example `/m/google`) that runs the website's Firebase sign-in and then sends the token
back to the app. It isn't built, because the installed app doesn't need it and it would carry a
sign-in token in a link. Ask for it only if Google in Expo Go matters.

## If it fails

| What the person sees | Why | Fix |
|---|---|---|
| No Google button at all (store build) | That platform's `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` isn't set, or the build is older than the variable | Step 7, then build again |
| Google shows "Error 400: invalid_request" or "redirect_uri_mismatch" | Custom URI scheme is off, or `app.json` lacks the scheme | Step 2.3, HANDOFF to-do |
| Google says "Access blocked: app is in testing" | Consent screen still in Testing | Step 1 |
| "Google sign-in isn't set up for this app yet…" | Firebase refused the client (other project, or key restricted) | Steps 5 and 6 |
| "Google sign-in isn't set up on DASH yet…" | The server has no `FIREBASE_API_KEY`, or Google is off in Firebase | Server env and Firebase → Sign-in method |
| "Could not verify that Google account." | The server's Firebase check failed | Step 6; check `/api/health` → `vendorAuth.google` |
| "…not on the employee roster…" | Working as designed | HR adds the email to the roster or the approved list |

## Where this lives in the code

- `src/features/signin/google.ts`: the client ids, when the button shows, the Firebase exchange.
- `src/features/googlesignin/google-button.tsx`: the button, the Google page, and the demo picker.
- `src/api/auth.ts`: `signInWithGoogle` (`POST /api/auth/google`) and `getFirebaseConfig`.
- `src/demo/fixtures/googlesignin.ts`: the demo's sample Google accounts.
