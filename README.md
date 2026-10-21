# DASH mobile app

Native Android + iOS app for DASH (Expo SDK 57, pinned so it runs in Expo Go; expo-router). It talks
to the same API as the website (`https://dash.tamadamedia.in/api`) and needs **no server or database
changes**.

## What's in the app

Four tabs, each with one job:

| Tab | What it holds |
| --- | --- |
| **Home** | Greeting, the clock in / out card, "Needs you" (up to 3 things waiting on me, opens Inbox), up to 4 shortcuts, announcements and this week's birthdays |
| **Me** | My own work in three parts: **Attendance** (clock card, this month, Fix attendance, Timesheets, Holidays, My shift), **Leave** (balance, Apply leave, my requests), **Pay** (latest take-home, payslips, salary details, tax summary, salary advance) |
| **Inbox** | Every approval in one list: leave, work from home, comp-off, attendance fixes, salary claims and advances, expense claims on projects I own, petty cash, visitors at reception. Approve / Reject happens on the item's own screen |
| **More** | My profile, the other modules (expense claims, petty cash, visitors, tasks, help & support, policies, people, news, bounty rewards), password, app lock, sign out |

Each thing lives in one place, and a section is hidden when it has nothing to show. Old links
(`/attendance`, `/leave`, `/pay`) open the matching part of Me (`/me?tab=…`). Screens use plain
words and one format for dates, times, durations and money — see `docs/DESIGN.md` §0A–0C.

The vendor portal (sign in as a vendor) has its own tabs: Home · Bills · Agreements · Profile.

## Run it on your phone (Expo Go)

1. Install **Expo Go** from the Play Store / App Store.
2. Put the phone on the same Wi-Fi as this computer.
3. In this folder:

   ```bash
   npm install
   npx expo start
   ```

4. Scan the QR code (Android: inside Expo Go; iPhone: with the Camera app).

If the phone can't reach the computer (different networks, office Wi-Fi isolation), use
`npx expo start --tunnel` instead.

Point the app at a local server with `EXPO_PUBLIC_DASH_URL=http://<your-ip>:3000` in
`mobile/.env.local` (copy `.env.example`). For EAS builds the variables live on expo.dev — see
[docs/EXPO-ENV.md](docs/EXPO-ENV.md). The server only skips the login OTP for true localhost requests, so a phone
still gets the WhatsApp/email code.

## Demo account (dev builds and internal preview builds; never store builds)

In Expo Go / a dev client — and in an internal `preview` build when `EXPO_PUBLIC_DEMO=1` is set on
expo.dev (see [docs/EXPO-ENV.md](docs/EXPO-ENV.md)) — you can explore every role on sample data
without a DASH account.
The plain-words guide (every sign-in method, every role, and the demo personas) is
[docs/DEMO-ACCOUNTS.md](docs/DEMO-ACCOUNTS.md).

- **Mobile:** `8328617610`, code `123456`.
- **Email:** `afzal.demo@tamadamedia.com`, password `Demo@123`, then either way to get the code. The WhatsApp step wants `8328617610`. The code is `123456`.
- **Vendor sign-in:** `8328617610` with the password `123456` (or `Demo@123`), or **Register / Forgot password** with `8328617610` or the demo email, then the code `123456`. This shows only the vendor roles.

After the code, **"Explore DASH as…"** lists one person per role, each named "Afzal &lt;Role&gt;". Pick one to sign straight in.

| Persona | Role | What it shows |
| --- | --- | --- |
| Afzal Employee | `employee` | Clock in, leave, payslips. Inbox: visitors only |
| Afzal Professional | `professional` | The same, plus shoot bookings in My tasks |
| Afzal Manager | `manager` | Runs Creative. Team approvals, who's in, and owns the Nimbus/Showreel codes (project claims, petty cash) |
| Afzal HR | `hr` | HR queues and salary advances for the whole company. Full People directory. No clock-in or pay of its own |
| Afzal Accounts | `accounts` | Approves anyone's petty cash. No news or bounty |
| Afzal Super Admin | `super_admin` | Company-wide queues, every expense claim and every petty cash request. Can't claim bounties |
| Afzal Admin | `admin` | Runs Production: its team's approvals and attendance |
| Afzal IT Admin | `it_admin` | IT tickets in My tasks (no start/end code). The IT team's approvals |
| Afzal Visitor Manager | `visitor_manager` | Almost nothing in the app: the visitor desk is on the website |
| Afzal Announcements | `announcement_viewer` | The TV display account: almost nothing in the app |
| Afzal App Manager | `app_manager` | Tasks and the bounty board, view only. Expense claims are refused, as the server refuses them |
| Afzal Master Admin | `master_admin` | No company, so the app is nearly empty: the website is where it works |

CEO and COO are left out on purpose.

The **Vendor portal** section is one sample business, Afzal Studios & Co., at five stages (`src/demo/vendor/`):

| Persona | Vendor status | What it shows |
| --- | --- | --- |
| Afzal Vendor — Approved | `approved` | Money due, 10 bills (one per bill status), 6 agreements (2 to sign, 1 expired, 3 signed), 3 change requests. Sign an agreement (code `123456`) or ask for a change |
| Afzal Vendor — Registering | `mobile_verified` | Not GST registered, Digio done. Business details next, then sign the non-GST and tax forms and send for approval |
| Afzal Vendor — KYC pending | `mobile_verified` | GST registered. "Verify with Digio" finishes at once on the phone (no browser), then the rest of the form |
| Afzal Vendor — Under review | `pending_verification` | Sent two days ago. Read-only until Accounts decides |
| Afzal Vendor — Changes requested | `correction_required` | Accounts wants a clearer cheque and the tax form signed again. Fix and "Send again" |

- Picking a vendor persona always starts it from that stage, so a sent registration can be shown again.
- Bills are read-only for vendors in the real portal (Tamada staff raise them), so there is no bill upload to try.
- "Not approved" (`rejected`) and "Deactivated" (`inactive`) exist in the real portal but are not demo personas.

**Switching role:**
- In the app: **More → Demo → Switch demo role**. For vendors: the portal's Profile tab.
- The gold pill names the current role, e.g. `DEMO · HR`.
- The role survives an app restart because the demo token names it.

**What stays on the phone:**
- Everything is answered on the phone (`src/demo/server.ts`, `src/demo/personas.ts`, `src/demo/fixtures/`, `src/demo/vendor/`), and nothing reaches DASH.
- Every code inside the demo is `123456`.
- Changes reset when the app restarts.

**The Afzal personas do not exist in the DASH database.**
- No user, vendor, mobile number or email for them exists on the server.
- The vendor's PAN and GSTIN (`AFZ…1234…`), Udyam number and bank accounts are made up.
- A store build (`production` profile) has no demo at all. There, 8328617610 is just a number sent to the real server.
  The demo is on only when `__DEV__` is true, or when `EXPO_PUBLIC_DEMO` is `1` **and** `EXPO_PUBLIC_BUILD_PROFILE`
  is `preview` (set per profile in `eas.json`; production sets `production`).

## Checks

```bash
npx tsc --noEmit   # types
npx expo lint      # lint
npx expo-doctor    # dependency health
```

## Layout

| Path | What |
| --- | --- |
| `src/app/` | Routes (expo-router). `(auth)` sign-in, `(app)` staff app with `(tabs)` (`index` Home, `me`, `inbox`, `more`), `(vendor)` vendor portal |
| `src/api/` | API client (`client.ts`, bearer token, same timeouts as the web) + one file per module |
| `src/auth/` | Session (SecureStore token, 15-day trusted session), sign-in flow state, app lock |
| `src/features/` | Screen building blocks per module; the tabs' own parts are in `home/`, `me/` (the Attendance, Leave and Pay views), `inbox/` and `more/` |
| `src/lib/` | Access rules ported from the web (`access.ts`), IST dates and the shared formats (`dates.ts`, `format.ts`), file helpers |
| `src/ui/` | Design system: tokens in `src/theme/tokens.ts`, components exported from `@/ui` |
| `docs/DESIGN.md` | The design spec: app structure, plain words, formats, kit, layout rules |

## Known limits (need a backend change, deliberately not done)

- **Push notifications**: the server has no device-token endpoint. Counts refresh while the app is open.
- **Sign-out** only forgets the token on the phone (the server has no staff logout endpoint — same as the website).
- **Meets calls** need a development build (`react-native-webrtc`), not Expo Go.
