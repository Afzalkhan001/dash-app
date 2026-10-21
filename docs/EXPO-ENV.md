# Expo environment variables for DASH

A plain-words guide for the owner. It covers what to add on expo.dev, why there are no secret keys,
and how to make a test build and a store build afterwards.

## The short answer

You add **two variables** on expo.dev. Both are **Plain text**. Neither is a secret.

| Name | development | preview | production | Visibility | What it does |
|---|---|---|---|---|---|
| `EXPO_PUBLIC_DASH_URL` | `https://dash.tamadamedia.in` | `https://dash.tamadamedia.in` | `https://dash.tamadamedia.in` | Plain text | The DASH server address the app talks to. |
| `EXPO_PUBLIC_DEMO` | do not add | `1` | **never add** | Plain text | Turns on the demo account ("Try a demo role", 8328617610 → 123456) in test builds you share with testers. |

One more value, `EXPO_PUBLIC_BUILD_PROFILE`, is already written in `eas.json` for each build
(`development`, `preview`, `production`). **Do not add it on expo.dev.**

## Why there are no secret keys

- Each person signs in with their own mobile number (or email) and a code. DASH then gives the app a
  personal token, which the app keeps locked on the phone. Nothing is shared between users.
- The app has no API key, database password, Google key or payment key inside it.
- Anything that starts with `EXPO_PUBLIC_` is written into the app when it is built. Anyone who
  installs the app could read it. So these values must never be passwords. The two values above are
  safe to show: one is the public website address, the other is an on/off switch.
- Expo's "Secret" type only protects values used on Expo's build servers. It adds nothing for values
  that end up inside the app, so we don't use it.

## Add the variables on expo.dev (step by step)

1. Open **https://expo.dev** and sign in with the Expo account this app lives on.
2. In the account switcher (top left), pick that account.
3. Open **Projects** → **dash**.
4. Open **Project settings** → **Environment variables**.
   (Direct link: https://expo.dev/accounts/afzalkhan8326/projects/dash/environment-variables)
5. Click **Add Variables**.
6. Fill in the first variable:
   - **Name:** `EXPO_PUBLIC_DASH_URL`
   - **Value:** `https://dash.tamadamedia.in` (no slash at the end)
   - **Environments:** tick **development**, **preview** and **production**
   - **Visibility:** **Plain text**
   - Click **Save**.
7. Click **Add Variables** again and fill in the second one:
   - **Name:** `EXPO_PUBLIC_DEMO`
   - **Value:** `1`
   - **Environments:** tick **preview only** (leave development and production unticked)
   - **Visibility:** **Plain text**
   - Click **Save**.
8. Check the list. You should see `EXPO_PUBLIC_DASH_URL` in all three environments and
   `EXPO_PUBLIC_DEMO` in **preview** only.

Add them to the **dash** project, not to the whole account.

### Things not to do

- Don't add `EXPO_PUBLIC_DEMO` to **production**. (Even if it happens by mistake, the store app still
  has no demo: it also needs `EXPO_PUBLIC_BUILD_PROFILE=preview`, and the production build sets
  `production` in `eas.json`. But keep it out anyway.)
- Don't add `EXPO_PUBLIC_BUILD_PROFILE` on expo.dev. It lives in `eas.json`.
- Don't put passwords, tokens or keys in any `EXPO_PUBLIC_` variable.
- Don't upload a `.env` file. The app doesn't need one, and git ignores `.env` and `.env.local`.

## The same thing from the command line (optional)

If you prefer the terminal, run these from the `mobile` folder. You only need **one** way, the
website or the terminal. These are for you to run yourself; nothing here was run for you.

```bash
npx eas-cli@latest login

npx eas-cli@latest env:set --name EXPO_PUBLIC_DASH_URL --value https://dash.tamadamedia.in \
  --environment development --environment preview --environment production \
  --visibility plaintext --scope project

npx eas-cli@latest env:set --name EXPO_PUBLIC_DEMO --value 1 \
  --environment preview --visibility plaintext --scope project

# Check what each environment has
npx eas-cli@latest env:list --environment preview
npx eas-cli@latest env:list --environment production
```

- `env:set` creates the variable, or changes it if it already exists.
- Older versions of the Expo command line called this `eas env:create`, with the same flags.
- On Windows PowerShell, put each command on one line (drop the `\` line breaks).

## Optional: Google sign-in (three more variables)

Only add these after the Google Cloud steps in `docs/GOOGLE-SIGNIN.md`. Without them the app simply
has no "Continue with Google" button (test builds still show a sample one for the demo).

| Name | development | preview | production | Visibility | What it is |
|---|---|---|---|---|---|
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | optional | yes | yes | Plain text | The **Android** OAuth client id, ends in `.apps.googleusercontent.com` |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | optional | yes | yes | Plain text | The **iOS** OAuth client id |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | optional | optional | do not add | Plain text | The **Web** client id. Only the web preview on a computer uses it |

- A client id is **not a secret**. Google prints it in every sign-in link. Never add a *client secret*.
- A phone build shows the Google button only when its own platform's id is set.
- Expo Go never shows the real Google button (Google refuses Expo Go's return address). See
  `docs/GOOGLE-SIGNIN.md`, "Expo Go".
- Changed one? Build again.

## How each build picks its variables

`eas.json` ties each build type to one environment on expo.dev:

| Build profile | Uses environment | `EXPO_PUBLIC_BUILD_PROFILE` (in eas.json) | Demo account |
|---|---|---|---|
| `development` | development | `development` | Yes (always on in dev builds) |
| `preview` | preview | `preview` | Yes, when `EXPO_PUBLIC_DEMO=1` is set on expo.dev |
| `production` | production | `production` | **Never** |

The demo turns on in a build only when **both** are true:

1. `EXPO_PUBLIC_DEMO` is `1` (set on expo.dev, preview only), and
2. `EXPO_PUBLIC_BUILD_PROFILE` is `preview` (set in `eas.json`).

A store build fails the second check, so the demo cannot appear in it. Expo Go and dev builds
always have the demo, the same as before.

When you start a build, the Expo command line lists the variables it loaded. Check that
`EXPO_PUBLIC_DEMO` shows up for preview builds only.

## Make a test build for your team (preview)

```bash
cd mobile
npx eas-cli@latest build --profile preview --platform android
```

- You get a link to an **APK** file. Testers open the link on an Android phone and install it.
- The login screen shows **Try a demo role**. Real accounts work too.
- iPhone test builds also work (`--platform ios`), but each tester's iPhone has to be registered
  first with `npx eas-cli@latest device:create`, and you need a paid Apple Developer account.

## Make the store build (production)

```bash
cd mobile
npx eas-cli@latest build --profile production --platform android   # Play Store file (.aab)
npx eas-cli@latest build --profile production --platform ios       # App Store build

# Send to the stores when ready
npx eas-cli@latest submit --profile production --platform android
npx eas-cli@latest submit --profile production --platform ios
```

- The version number goes up by itself on each production build (it is kept on expo.dev).
- The store app has no demo. 8328617610 there is just a normal number sent to the real server.

## Before the first build

1. **Replace the app icons.** `assets/images/icon.png`, the Android icon images
   (`android-icon-foreground.png`, `android-icon-background.png`, `android-icon-monochrome.png`)
   and `assets/expo.icon` (iPhone) are still Expo's sample icon. The build works, but the phone will
   show the Expo logo instead of DASH.
2. **Save the `mobile` folder in git.** EAS uploads the project the way git sees it, and right now
   the `mobile` folder is not committed in the main repo. Commit it before you build.
3. **Use Expo Go instead of the `development` build.** The `development` profile needs a package
   called `expo-dev-client`, which this app doesn't include, so that build would fail. Expo Go is
   fine for day-to-day testing; use `preview` for testers.
4. **Changed a variable? Build again.** Values are written into the app when it is built, so a change
   on expo.dev only shows up in the next build. (This app has no over-the-air updates.)

## Running on your computer (developers)

- Expo Go needs nothing: without any variable the app uses `https://dash.tamadamedia.in`.
- To point Expo Go at a local server, copy `.env.example` to `.env.local` and set
  `EXPO_PUBLIC_DASH_URL=http://<your-computer-ip>:3000`. `.env.local` is never committed.
- Or pull the development values from expo.dev into `.env.local`:
  `npx eas-cli@latest env:pull --environment development`

## Where this lives in the code

- `src/config.ts` reads `EXPO_PUBLIC_DASH_URL` (falls back to `https://dash.tamadamedia.in`).
- `src/demo/config.ts` reads `EXPO_PUBLIC_DEMO` and `EXPO_PUBLIC_BUILD_PROFILE` (`DEMO_ENABLED`).
- `src/features/signin/google.ts` reads the three `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` values.
- `eas.json` sets `environment` and `EXPO_PUBLIC_BUILD_PROFILE` for each build profile.
- `.env.example` is the committed template.

Expo docs: https://docs.expo.dev/eas/environment-variables/ ·
https://docs.expo.dev/eas/environment-variables/manage/ · https://docs.expo.dev/eas/json/ ·
https://docs.expo.dev/guides/environment-variables/
