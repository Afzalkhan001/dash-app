# Sign-in, roles and the demo account

A plain-words guide for the DASH mobile app. It covers three things:

1. Every way to sign in to DASH.
2. Every role, and what each one sees in the app and on the website.
3. The demo account: one login that lets you try every role.

## Is 8328617610 in the DASH database?

**No.** The demo number 8328617610, the code 123456, the email `afzal.demo@tamadamedia.com` and every "Afzal" person are **not** in the DASH database.

- They live only inside the app, on your phone.
- When you use them, the app answers itself with sample data. Nothing is sent to DASH, and no real data is read or changed.
- The demo only exists in **development builds** (Expo Go or a dev build on your phone) and in **internal test builds** (the `preview` build you share with testers, when `EXPO_PUBLIC_DEMO=1` is set for it on expo.dev — see [EXPO-ENV.md](EXPO-ENV.md)). The app you publish to the Play Store or App Store has no demo at all.
- In a store build, 8328617610 is treated like any other number: DASH sends a real WhatsApp code, then says "No staff account uses this number" (unless a real staff member has that number).

We did not look inside the live database. Nothing in the server, website or database code mentions this number.

---

## 1. How many ways to sign in

### Staff: mobile number + WhatsApp code (app and website)
You type your 10-digit mobile number and tap **Send code**. DASH sends a 6-digit code on WhatsApp. You type the code and you are in. The number must belong to exactly one DASH account:
- **No account has it:** the app says "No staff account uses this number." and offers "Use email" or "Vendor? Sign in here".
- **Two or more accounts share it:** DASH asks you to sign in with email instead.

The code is valid for 10 minutes. You get 5 tries at the code, and you can resend after 20 seconds.

### Staff: email + password + code (app and website)
On the app's sign-in screen tap **Sign in with email**. Type your email and password.
- **Same email in more than one company:** you pick the company first ("Pick your company").
- **Then choose where the code goes:** by email, or on WhatsApp. For WhatsApp you type your full mobile number again; DASH only shows the last few digits, so it can check the number is yours.
- Type the 6-digit code and you are in.

A wrong email or password gives a general error; DASH never says which one was wrong.

### Forgot password
- **Staff:** website only. You enter your email; DASH shows the last 4 digits of the phone on file. You confirm that number with a WhatsApp code and set a new password. DASH emails and WhatsApps you that the password changed. The app has no "Forgot password" for staff yet.
- **Vendors:** in the app and on the website (see Vendors below).

### Change password (app and website)
Signed-in staff can change their password in the app from **More → Change password**. You need your current password.

### Google sign-in
- **Website:** yes, for staff. It works if your Google email is already a DASH user, or is on the company's approved list (a new account is then created for you). Otherwise it is refused. No extra code is asked for.
- **App: not available.** The app has no Google button.
- Vendors can also use Google on the website, but only after their vendor account is linked to that Google email.

### Sign up (website only)
A new staff member whose email is on the company's approved list can create a password on the website. After that they sign in normally. The app has no sign-up for staff.

### Trusted device and the 15-day session
- **Website:** a "Trust this device" tick box. With it you stay signed in for 15 days. Without it, 12 hours.
- **App:** always 15 days. You do not have to tick anything.
- The session does not renew itself. After 15 days you sign in again.

### Signing out
Staff use **More → Sign out**; vendors use **Profile → Sign out**. The app asks first, then forgets your sign-in on this phone. For staff, DASH itself keeps the old session until it runs out. A vendor's sign-out also ends the session on DASH.

### App lock (app only)
**More → App lock.** When it is on, the app is covered every time it opens, and again after 30 seconds in the background. It opens with your fingerprint, Face ID or phone passcode. It only works if your phone has a fingerprint or face set up. The lock screen also has a "Sign out" link, so nobody gets stuck. It is a phone setting only; DASH does not see it.

### Vendors (suppliers)
Vendors are a different kind of user with their own portal. On the app's sign-in screen they tap **"Are you a vendor? Sign in here"**.
- **Sign in:** mobile number + password.
- **Register (new vendor):** mobile number + email, then a WhatsApp code. A new vendor then creates a password and starts the registration form. If the number already started registering, they carry on where they left off.
- **Forgot password:** mobile number, then a WhatsApp code, then a new password (they can also skip and go straight in).
- **Google:** website only, and only for a vendor already linked to that Google email. It never creates a vendor.
- A vendor's sign-in lasts 12 hours; there is no 15-day option.
- A deactivated vendor cannot sign in at all.
- Developers may see a "Skip verification (dev only)" button. It only appears when a test server allows it, never on the real DASH.

### Kiosks, TVs and other screens (not in the app)
- **Office TV (news display):** the TV shows a pairing code. An admin types that code on the DASH website, and the TV stays signed in from then on. It only shows company news.
- **Older announcement screen:** works the same way (a code on the screen, claimed by an admin on the website).
- **Visitor kiosk tablet:** a Visitor Manager signs in to the DASH website on the tablet and opens **Kiosk Mode**. Guests check themselves in by scanning a QR code. Leaving Kiosk Mode needs the Visitor Manager's password.
- **Job applicants:** check their application status on the careers page with a WhatsApp code.

None of these are part of the mobile app.

---

## 2. Roles and what each one does

"System roles" (HR, Super Admin, CEO, COO, IT Admin) do not clock in and do not see their own pay, leave or timesheets in the app. They see the team or company view instead.

| Role (as shown in the app) | Who it is for | What they see and do in the app | Website only |
| --- | --- | --- | --- |
| **Employee** | Regular staff | Clock in and out, attendance, fix a missed punch, timesheets, holidays, shifts. Apply for leave or work from home. Salary, payslips, salary claims and salary advance. Expense claims, petty cash bills, My tasks, visitors, help requests, policies, People, news, bounty. | Home dashboard, Clients, Booking, team task view |
| **Professional** | Freelance crew booked for shoots | Same as Employee (whatever their department has switched on), plus their **shoot bookings** in My tasks. | Same as Employee |
| **Manager** | Runs a team | Everything an Employee has, plus: **approves the team's** leave, work from home, comp-off, attendance fixes and salary claims; sees who's in today and the team's attendance. If they own a project code: approves that project's expense claims and petty cash. Can claim bounties. | Create, assign and review tasks; Projects; Employees; Reports; Device Monitoring (own team); Team Roster; Requests |
| **Admin** | Senior manager who runs a department | Same as Manager. Still clocks in and has their own leave and pay. | Dashboard, Managers, Requests, Service Desk, Tasks, Employees, Roster, Projects, Clients, Booking, Reports, Device Monitoring, vendor accounts |
| **HR** | The HR team | No clock-in or own pay (system role). **Approves leave, work from home, comp-off, attendance fixes, salary claims and salary advances for the whole company.** Who's in across the company, shifts, holidays, the full People directory. Expense claims, petty cash, visitors, help, policies, news, bounty. No My tasks. | Employee roster, departments, projects, booking, service desk, reports; posting news; bounty admin; job openings; attendance setup, leave setup, holidays, shifts, policies; **Payroll**; vendor accounts |
| **Super Admin** | Head of the company on DASH | Same as HR, plus: sees **every expense claim** in the company and can approve any; sees every petty cash request (view only). Creates bounties but cannot claim them. | Everything for the company: users, roster, departments, projects, booking, vendors and bill approvals, bounty funding, news, service desk, reports, **Config** (feature switches), audit, subscriptions, device monitoring, Visitor Desk, HR and leave setup, Payroll |
| **CEO** / **COO** | Top leadership | System roles: no clock-in or own pay. Their own team's approvals if they run a department. Full People directory. Same More menu as Super Admin. Can create and also claim bounties. **No demo persona**: in the demo, Kiran Rao (CEO) and Arvind Menon (COO) appear as colleagues. | Same website menu as Super Admin |
| **IT Admin** | The IT team | System role: no clock-in. Approves the IT team's requests if they run IT. **IT tickets** in My tasks (start and finish without a code). All the usual tiles. | Assets, subscriptions, roster, tasks, service desk, rooms and locations, device monitoring, posting news, vendor accounts |
| **Accounts** | Finance team | Clock in, own leave and pay. **Approves petty cash for every team.** Expense claims, visitors, help, policies, People. No news, tasks or bounty. | Vendor registrations, vendor master, bill approvals, agreements; final approval and payment of expense claims; petty cash payments and statements |
| **Application Manager** | Looks after DASH itself | Clock in, own leave and pay, tasks. Bounty board **view only**. No Expense claims: DASH refuses this role, so the app hides it. | Pending reviews, dashboard, managers, requests, service desk, tasks, employees, roster, projects, clients, booking, reports, bounty oversight |
| **Visitor Manager** | Reception | Almost nothing: Help & support, People, raise a ticket. | The whole **Visitor Desk**: today's visitors, Kiosk Mode, visitor log, invites, QR code |
| **Announcements (Display)** | The shared office TV account | Almost nothing: People only. | The news display on the office TV |
| **Master Admin** | Owner of the DASH platform (all companies) | Belongs to no company, so the app is nearly empty: People only. | Companies, company wallets, company features, overrides |
| **Vendor** *(not a staff role)* | Suppliers | Register, verify ID and bank with Digio, sign the tax forms, track approval. Once approved: money due, bills, agreements to sign, change requests, profile. | Google sign-in |

**What else changes what someone sees (beyond their role):**
- **Running a department** adds that team's approvals and "Who's in today".
- **Owning a project code** adds that project's expense claims and petty cash approvals.
- **Company switches** (set on the website) can hide tasks, news, bounty or People for everyone.

---

## 3. Demo: one login, every role

### How to sign in
On a development build (Expo Go or a dev build), or an internal preview build with the demo turned on:

1. **Mobile:** type `8328617610`, tap **Send code**, then type `123456`. No WhatsApp message is sent.
2. **Or email:** tap **Sign in with email**, type `afzal.demo@tamadamedia.com` and the password `Demo@123`. Choose where the code goes (for WhatsApp, type `8328617610`), then type `123456`.
3. A popup opens: **"Explore DASH as…"**. Tap the role you want, for example **Afzal HR**. You land on that role's Home.

A wrong code or password tells you the right one. The gold pill at the top shows which role you are in, for example **DEMO · HR**.

**Vendor sign-in screen:** `8328617610` with the password `123456` (or `Demo@123`). Or tap Register / Forgot password with `8328617610` or the demo email, then the code `123456`. From here the popup shows only the vendor roles.

### The roles in the popup
CEO and COO are left out on purpose. Inbox counts below are where each role starts; they go down as you approve things.

**Staff**

| Persona | What you see | What to try |
| --- | --- | --- |
| **Afzal Employee** | Clock-in card and shortcuts on Home. Me: attendance, leave (33 days left), pay. Inbox: one visitor. All 9 tiles in More. | Apply for leave (pick a holiday and see it refused), open a payslip, tap **+** to see all 8 actions. |
| **Afzal Professional** | Like Employee, with fewer modules: payslips only under Pay, no work from home or salary advance. | Open **My tasks** to see the shoot bookings. |
| **Afzal Manager** | Runs the Creative team. Inbox about 14: the team's leave, work from home, comp-off, attendance fixes, salary claims, plus 2 project claims and 2 petty cash requests. | Approve a leave, reject a project claim with a reason, approve petty cash. Check "Who's in today". |
| **Afzal HR** | No clock-in. Inbox about 23 from the whole company, including 3 salary advances. "Your team" under Me. Full People directory. | Approve a salary advance (only HR can). Open People and see departments and employee numbers. |
| **Afzal Accounts** | Clock-in, own leave and pay. Inbox: a visitor plus 4 petty cash requests from different teams. 6 tiles; no news or bounty. | Approve one petty cash request and reject another. |
| **Afzal Super Admin** | No clock-in. Company-wide approvals. Expense claims shows every claim. Petty cash is view only. | Approve a leave. Open Bounty: 0 coins, because a super admin can't claim. |
| **Afzal Admin** | Runs the Production team. Clock-in, own leave and pay. Inbox: the Production team's 4 requests plus a visitor. | Reject a leave with a reason. Open My tasks for the Production task. |
| **Afzal IT Admin** | No clock-in. Inbox: the IT team's leave, work from home and attendance fix. | Open **My tasks** for the 2 IT tickets (no start code needed). |
| **Afzal Visitor Manager** | Almost empty: Today card, Help & support, People. | Tap **+**: only "Raise a ticket". Its real work is on the website. |
| **Afzal Announcements** (pill says **Display**) | Almost empty: People only. | See how little the TV account gets in the app. |
| **Afzal App Manager** | Clock-in, leave, pay, tasks. Bounty is view only. | Open Expense claims: you get the same "no permission" error the real app gives this role. |
| **Afzal Master Admin** | No company, so nearly empty: People (full directory). | Open People and the org chart. |

**Vendor portal** (one sample business, Afzal Studios & Co.)

| Persona | What you see | What to try |
| --- | --- | --- |
| **Afzal Vendor — Approved** | Money due, 10 bills (one in every state), 6 agreements, 3 change requests. | Sign an agreement (draw a signature, code `123456`). Ask for a bank detail change. |
| **Afzal Vendor — Registering** | Halfway through sign-up; business details next. | Fill business details, sign the two forms, send for approval. You get a new Vendor ID. |
| **Afzal Vendor — KYC pending** | Has to verify ID and bank with Digio. | Tick the consent and tap **Verify with Digio**. It finishes at once with sample details (no browser opens). |
| **Afzal Vendor — Under review** | Sent for approval; nothing can be edited. | Tap **Check status**. |
| **Afzal Vendor — Changes requested** | Accounts wants a clearer cheque and the tax form signed again. | Fix both and tap **Send again**. |

### Switching roles without signing out
- **Staff:** **More → Demo → Switch demo role**. Pick another role. The app clears the old role's data and goes to Home.
- **Vendor portal:** **Profile → Switch demo role**.
- You can switch from staff to vendor and back.
- The app remembers your role if you close and reopen it.

### Good to know
- **Not real accounts.** None of the Afzal people, the number, the email, or the vendor's PAN, GSTIN and bank accounts exist in DASH. They are answered inside the app, only in development and internal preview builds, and never touch real data.
- **Every code is 123456**: sign-in, task start and end codes, petty cash, agreement signing.
- **Changes reset when you close the app.** Until then, what you approve as one role stays approved when you switch to another.
- **Picking a vendor role always starts it fresh**, so you can repeat a registration.
- **All staff roles share one personal history**, so "my" leave, claims and help requests are the same sample items in every role.
- If today is a holiday in the demo calendar (for example Dussehra), "Who's in today" shows 0.
- Some file downloads say "Downloads are not available in the demo account."

---

*For developers:* the demo lives in `src/demo/` (`config.ts`, `personas.ts`, `server.ts`, `fixtures/`, `vendor/`) and the popup in `src/features/demo/role-picker.tsx`. It is switched on when `__DEV__` is true, or in a preview build when `EXPO_PUBLIC_DEMO` is `1` and `EXPO_PUBLIC_BUILD_PROFILE` is `preview` (see `docs/EXPO-ENV.md`); a saved demo session is dropped in store builds. See the README's "Demo account" section for the technical summary.
