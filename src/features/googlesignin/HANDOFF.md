# Google sign-in (wave 3): hand-off checklist

Scope: staff "Continue with Google", exactly as the website's round Google button (dash.html:2034
doGoogle → server.js:2526 `POST /api/auth/google`). Specs: `docs/port/signin-push.md` §1.3, §3.3, §5.3.
Owner setup: `docs/GOOGLE-SIGNIN.md`. Env vars: `docs/EXPO-ENV.md`, `.env.example`.

## What it adds
- [x] `src/features/signin/google.ts`: client ids from `EXPO_PUBLIC_GOOGLE_{ANDROID,IOS,WEB}_CLIENT_ID`,
  `googleMode()` (`real` / `demo` / `off`), the return address, and the Firebase exchange
  (identitytoolkit `accounts:signInWithIdp` with the apiKey from `GET /api/firebase-config`).
- [x] `src/api/auth.ts`: `signInWithGoogle(firebaseIdToken)` → `/auth/google {idToken, trustDevice:true}`,
  and `getFirebaseConfig()`. Both are existing public endpoints (server.js PUBLIC_API).
- [x] `src/features/googlesignin/google-button.tsx`: `<GoogleButton onError disabled />`.
  - **real**: expo-auth-session with the generic `useAuthRequest` (not the deprecated Google provider).
    Phones use code + PKCE → `exchangeCodeAsync` → Google id_token. The web preview uses an access token.
    A cancelled picker shows nothing; errors use the server's own words in the screen's danger Banner.
  - **demo**: shown in dev and preview builds when the real flow can't run here (always in Expo Go).
    It opens a "Choose an account" sheet with three sample accounts (`demo/fixtures/googlesignin.ts`):
    - `afzal.demo@…` signs in, then "Explore DASH as…" (staff personas);
    - `afzal.newjoiner@…` shows "account created" and opens Afzal Employee;
    - `afzal.khan.personal@gmail.com` shows the server's 403 "not on the employee roster" wording.
    When client ids are set but this is Expo Go, the sheet adds "Real Google sign-in · Available in the installed app".
  - **off**: store builds without ids render nothing.
- [x] `(auth)/login.tsx` and `(auth)/email.tsx` (credentials step): the button sits under the other
  outlined pill after the "Or" divider. Errors feed the screens' existing `setError` Banner.
- [x] `(auth)/oauthredirect.tsx`: Google's phone return link also reaches Expo Router. This route
  steps straight back, so nobody sees "page not found".
- No ConfirmSheet: signing yourself in notifies nobody, the same as the website.
- No role gates: LoginForm is public, and the server decides via the roster and the approved list.

## Plug-in files
None. Google runs before sign-in, so there are no More rows, + actions, Home cards, Inbox kinds or
tour steps, and nothing to register in `src/features/domains.ts`. No demo routes either. The fixture
file only holds data, so it needs no entry in `demo/fixtures/index.ts`.

## Integrator to-dos
- [ ] **app.json** (needed before real Google works on phones): add the app-id scheme next to the
  existing one: `"scheme": ["dashmobile", "com.tamadamedia.dashmobile"]`. Google sends people back to
  `com.tamadamedia.dashmobile:/oauthredirect` on both Android and iOS. This needs a new build.
- [ ] Optional: add `<Stack.Screen name="oauthredirect" options={{ animation: 'none' }} />` to
  `(auth)/_layout.tsx`.
- [ ] `src/lib/capabilities.ts`: `hasNativeGoogleSignIn()` stays false, which is correct because no
  native module is used. Its comment mentions "the website's redirect page"; that page isn't needed
  for installed builds (see `docs/GOOGLE-SIGNIN.md`, "Expo Go").
- [ ] `docs/DEMO-ACCOUNTS.md` lines 46–48 still say "App: not available". Change this to: installed app
  with client ids = real Google; dev/preview = the sample picker above.
- [ ] Owner: follow `docs/GOOGLE-SIGNIN.md` (Android client with **custom URI scheme on**, SHA-1 of the
  EAS keystore, iOS client, optional Web client with `http://localhost:8090/login`, same project as Firebase).

## Not verified / known limits
- **The preview was not tested.** The 8090 server never finished a web bundle during this run: the
  page stayed blank and the bundle request hung or returned 500. This is the restart blocker the
  integrator reported. Instead, `npx expo export --platform android` built cleanly (17 MB) with these
  files in it.
- A real Google round trip was not run: no client ids exist yet, and Expo Go can't finish it.
- The web-preview path (access token → `signInWithIdp`) follows Firebase's documented REST body but
  has not run against the DASH Firebase project.
- `npx tsc --noEmit`: no errors in googlesignin or signin files. The remaining errors belong to other
  domains still in progress (e.g. `features/grids/model.ts`, `features/chatvoice/call-entry.tsx`).
  `npx eslint` is clean on every file I touched.
