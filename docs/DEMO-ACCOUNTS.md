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
- **Staff (app and website):** on the email sign-in screen tap **Forgot password?**. You enter your email; DASH shows the last 4 digits of the phone on file. You type that full number, confirm it with a WhatsApp code and set a new password. You swipe to confirm, because DASH then emails and WhatsApps you that the password changed. The app takes you back to email sign-in with your email filled in.
- **Vendors:** in the app and on the website (see Vendors below).

### Change password (app and website)
Signed-in staff can change their password in the app from **More → Change password**. You need your current password.

### Google sign-in
- **Website:** yes, for staff. It works if your Google email is already a DASH user, or is on the company's approved list (a new account is then created for you). Otherwise it is refused. No extra code is asked for.
- **App: not available.** The app has no Google button.
- Vendors can also use Google on the website, but only after their vendor account is linked to that Google email.

### Sign up (app and website)
A new staff member whose email is on the company's approved list can create a password. In the app: email sign-in screen, then **New here? Create your account**. Type the email, then a password (at least 4 characters) twice. Nobody is messaged. **Continue** then signs you in with a code, as usual. An email that already has an account is told to sign in instead; an email that is not on the list is refused with DASH's own words.

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
- **Office TV (news display):** the TV shows a pairing code. A Super Admin types that code on the DASH website or in the app (**More → Office TVs → Pair a TV**), and the TV stays signed in from then on. It only shows company news.
- **Older announcement screen:** works the same way (a code on the screen, claimed by an admin on the website).
- **Visitor kiosk tablet:** a Visitor Manager signs in to the DASH website on the tablet and opens **Kiosk Mode**, or signs in to the app and taps **+ → Start kiosk**. Guests check themselves in (a photo, who they are meeting, their details) or type their invite code. Leaving Kiosk Mode needs the phone's lock or the Visitor Manager's password. The app does not yet keep the screen awake by itself or draw the QR code; the kiosk shows the check-in link as text.
- **Job applicants:** check their application status on the careers page with a WhatsApp code.

Apart from the kiosk and pairing a TV, none of these are part of the mobile app.

---

## 2. Roles and what each one does

"System roles" (HR, Super Admin, CEO, COO, IT Admin) do not clock in and do not see their own pay, leave or timesheets in the app. They see the team or company view instead.

| Role (as shown in the app) | Who it is for | What they see and do in the app | Website only |
| --- | --- | --- | --- |
| **Employee** | Regular staff | Clock in and out, attendance, fix a missed punch, timesheets, holidays, shifts. Apply for leave or work from home. Salary, payslips, salary claims and salary advance. Expense claims, petty cash bills, My tasks, visitors, help requests, policies, People, news, bounty. **Chat** with colleagues. **Booking** (a professional, a room or a location) and their own **Clients**. Countersigns a vendor agreement when named. | Home dashboard, team task view |
| **Professional** | Freelance crew booked for shoots | Same as Employee (whatever their department has switched on), plus their **shoot bookings** in My tasks. | Same as Employee |
| **Manager** | Runs a team | Everything an Employee has, plus: **approves the team's** leave, work from home, comp-off, attendance fixes and salary claims; sees who's in today and the team's attendance. If they own a project code: approves that project's expense claims and petty cash. Can claim bounties. **Team tasks** (assign, edit, review submitted tasks and time fixes), **Team today / Tomorrow** on Home, **Booking requests** (approve or reject the team's bookings), Project codes, Clients. **Team board** (Team Roster) for the departments they run or are granted, **Reports** and **Device monitoring** for their own team. | Excel exports |
| **Admin** | Senior manager who runs a department | Same as Manager (Team tasks, Booking requests, Project codes, Clients), plus **Employees** (edit only) and the **Service desk** (equipment requests; approves them when they run IT & Admin). Still clocks in and has their own leave and pay. | Dashboard, Managers, Roster, Reports, Device Monitoring, vendor accounts |
| **HR** | The HR team | No clock-in or own pay (system role). **Approves leave, work from home, comp-off, attendance fixes, salary claims and salary advances for the whole company.** Who's in across the company, shifts, holidays, the full People directory. Expense claims, petty cash, visitors, help, policies, news, bounty. No My tasks. **Employees** (add, edit, mark leavers), **Departments**, **HR setup** (offices, clock-in rules, shifts, holidays, leave types and balances, policies), Behaviour & work complaints in the **Service desk**, Booking, Project codes; the activity audit when granted. **Payroll** (runs, lock, salaries, tax profiles), **Hiring** (job openings, referred candidates, careers-page applications), **News studio** and news settings, **Bounty admin** (task posters, use-coins requests), **Reports**. | Statutory and salary-structure editing; vendor accounts |
| **Super Admin** | Head of the company on DASH | Same as HR, plus: sees **every expense claim** in the company and can approve any; sees every petty cash request (view only). Creates bounties but cannot claim them. **Company dashboard** ("Company at a glance" on Home), **Users**, **Company settings**, **Activity audit**, **Subscriptions**, the **Accounts desk** (approves vendor bills), vendor agreements, the whole **Service desk**, the **Visitor desk** and kiosk, Employees, Departments, HR setup, Booking, Project codes. **Payroll**, **Hiring**, **Bounty admin** (give and take back coins, ledger, summary), **News studio**, **Office TVs**, **Reports**, **Device monitoring**, the IT **Support centre**. | Vendors, the wallet reports as Excel/PDF |
| **CEO** / **COO** | Top leadership | System roles: no clock-in or own pay. Their own team's approvals if they run a department. Full People directory. Same More menu as Super Admin. Can create and also claim bounties. **No demo persona**: in the demo, Kiran Rao (CEO) and Arvind Menon (COO) appear as colleagues. | Same website menu as Super Admin |
| **IT Admin** | The IT team | System role: no clock-in. Approves the IT team's requests if they run IT. **IT tickets** in My tasks (start and finish without a code). All the usual tiles. The **Service desk** (assign tickets, approve equipment, reject), **Raise for someone**, **Employees** (edit, mark leavers), **Subscriptions**. **Assets** (add, assign, take back), **Rooms & locations** (and booking purposes), the **Support centre**, **Device monitoring**, Equipment on Home. | Bulk asset upload and reports; vendor accounts |
| **Accounts** | Finance team | Clock in, own leave and pay. **Approves petty cash for every team.** Expense claims, visitors, help, policies, People. No news, tasks or bounty. The **Accounts desk**: petty cash, expense claims and vendor bills at Accounts' stage, starting payments, petty cash tracking and expense types; **Vendors** (check registrations); **Vendor agreements** (countersign, extend); Subscriptions (view). | Drafting agreements, vendor list export and print, the petty cash ledger |
| **Application Manager** | Looks after DASH itself | Clock in, own leave and pay, tasks. Bounty board **view only**. No Expense claims: DASH refuses this role, so the app hides it. **Pending reviews** (with a count on Home), Team tasks, Booking and Booking requests, Project codes, Clients, Employees (edit), Service desk (equipment), **Reports**, Bounty admin and Hiring **view only**. | Dashboard, managers, roster |
| **Visitor Manager** | Reception | The **visitor desk**: "In the building" on Home, visitors waiting in Inbox (let in or turn away), check out, the visitor log, invites (invite a visitor from **+**), the check-in link and **Kiosk mode** (**+ → Start kiosk**). Help & support, People. | The printable QR poster |
| **Announcements (Display)** | The shared office TV account | Almost nothing: People only. | The news display on the office TV |
| **Master Admin** | Owner of the DASH platform (all companies) | Belongs to no company. **Companies on DASH** on Home; **Companies** (register a company and invite its Super Admin, edit details and seat limit, suspend), **Company wallets** (add coins, cancel an unused credit), **Company features** (switch features and HR modules per company). | Deleting a company, password resets, overrides |
| **Vendor** *(not a staff role)* | Suppliers | Register, verify ID and bank with Digio, sign the tax forms, track approval. Once approved: money due, bills, agreements to sign, change requests, profile. | Google sign-in |

**What else changes what someone sees (beyond their role):**
- **Running a department** adds that team's approvals and "Who's in today".
- **Owning a project code** adds that project's expense claims and petty cash approvals.
- **Company switches** (Company settings in the app, or the website) can hide tasks, news, bounty or People for everyone.
- **Being named** on a vendor agreement as its countersigner puts it in that person's Inbox, whatever their role.
- **Every role** can chat (More, Chat), unless the company switched Meets off.

---

## 3. Demo: one login, every role

### How to sign in
On a development build (Expo Go or a dev build), or an internal preview build with the demo turned on:

1. **Mobile:** type `8328617610`, tap **Send code**, then type `123456`. No WhatsApp message is sent.
2. **Or email:** tap **Sign in with email**, type `afzal.demo@tamadamedia.com` and the password `Demo@123`. Choose where the code goes (for WhatsApp, type `8328617610`), then type `123456`.
3. A popup opens: **"Explore DASH as…"**. Tap the role you want, for example **Afzal HR**. You land on that role's Home.

A wrong code or password tells you the right one. The gold pill at the top shows which role you are in, for example **DEMO · HR**.

**Forgot password and sign-up (staff):** on the email screen, **Forgot password?** with `afzal.demo@tamadamedia.com`, then the number `8328617610`, the code `123456` and any new password of 4 or more characters (nothing changes: `Demo@123` still works). **New here? Create your account** with `afzal.newjoiner@tamadamedia.com` creates an account, and **Continue** opens Afzal Employee; `afzal.demo@tamadamedia.com` says the account already exists; `afzal.notlisted@tamadamedia.com` is refused because it is not on the list.

**Vendor sign-in screen:** `8328617610` with the password `123456` (or `Demo@123`). Or tap Register / Forgot password with `8328617610` or the demo email, then the code `123456`. From here the popup shows only the vendor roles.

### The roles in the popup
CEO and COO are left out on purpose. Inbox counts below are where each role starts; they go down as you approve things.

**Staff**

| Persona | What you see | What to try |
| --- | --- | --- |
| **Afzal Employee** | Clock-in card and shortcuts on Home. Me: attendance, leave (33 days left), pay. Inbox about 4: a visitor, an agreement to countersign, booking work to approve and one to rate. All 9 tiles in More, plus Chat, Refer & earn, Booking and Clients; My tasks has a Team tasks tab. | Apply for leave (pick a holiday and see it refused), open a payslip, tap **+** (8 actions plus Book and New chat). Countersign the vendor agreement from Inbox. Book a professional, a room or a location. Send Priya a chat: a reply arrives. **Refer & earn**: refer someone for the Motion Designer opening. Start a Team task's timer, then clock out: the clock-out sheet offers to stop it. |
| **Afzal Professional** | Like Employee, with fewer modules: payslips only under Pay, no work from home or salary advance. | Open **My tasks** to see the shoot bookings. More, Booking shows "Booked for you". |
| **Afzal Manager** | Runs the Creative team. Home: Team today and Tomorrow. Inbox about 23: the team's leave, work from home, comp-off, attendance fixes, salary claims, 2 project claims, 2 petty cash requests, 2 tasks to review, a time fix and 4 bookings. More, Work: Team tasks, Booking, Booking requests, Project codes, Clients. | Approve a leave, reject a project claim with a reason, approve petty cash. Approve a submitted task, or send it back. Approve a booking (it becomes the professional's task) or reject one with a reason. Tap **+**, **Assign task**. **Team board**: start your own task's timer, assign a sub work, add a manager. Shortlist Rohit, the candidate HR forwarded (Inbox, Referrals). Approve Kavya's bounty teaser and pay her, or post a bounty task (**+ → Post task**). Post news through the "Who can post news" grant. |
| **Afzal HR** | No clock-in. Inbox about 26 from the whole company, including 3 salary advances and a Behaviour & work complaint. "Your team" under Me. Full People directory. More, People & HR: Employees, Departments, HR setup; Activity audit (granted). | Approve a salary advance (only HR can). **+**, **Add employee**, and invite someone. Mark Farhan Ali as resigned (blocked: he still holds a camera). In HR setup add a holiday, a shift or a leave type, adjust a leave balance, publish the draft policy. **Payroll**: run this month, check a line, type `LOCK YYYY-MM` and swipe (Afzal Employee then has the new payslip). **Hiring**: approve the referral bonus waiting in Inbox, accept and forward a new referral, post a job (**+ → Post job**). Approve Meera's use-coins request. Post news, schedule one, change News settings. |
| **Afzal Accounts** | Clock-in, own leave and pay. Inbox about 17: a visitor, 4 petty cash requests at the project owner's stage, 5 petty cash items at Accounts' stage, 3 claims, 3 vendor bills and an agreement to countersign. Home: Payments (3 to start, 3 not received). More, Money: Accounts desk, Vendors, Vendor agreements, Subscriptions (view). | Approve one petty cash request and reject another. Approve a vendor bill, then start its payment. Check the waiting vendor's registration and approve it. Reject one bill in Imran's expense report. Extend an agreement's deadline. |
| **Afzal Super Admin** | No clock-in. Company-wide approvals (Inbox about 33, with vendor bills and the service desk). Home: Company at a glance. More: Booking, Project codes; Employees, Departments, HR setup; Accounts desk, Vendor agreements; Service desk; Company dashboard, Users, Company settings, Activity audit, Subscriptions; the Visitor desk. Petty cash is view only. | Approve a leave. Open Bounty: 0 coins, because a super admin can't claim. Turn a company switch off and on in Company settings. Remove a login in Users. Mark the stationery request resolved in the Service desk. Delete a subscription payment. **Bounty admin**: give coins, take some back, cancel the 1,000-coin distribution in the Ledger, approve Sneha's thumbnails. Pair an office TV with `123456` and show a post now. Reports, and Device monitoring (pair a device with `K7QM-4XPT`). |
| **Afzal Admin** | Runs the Production team. Clock-in, own leave and pay. Inbox about 11: the Production team's requests, a visitor, a task to review, a time fix and 2 bookings (Farhan, cinematographer, and the Ramoji location). More: Team tasks, Team board (Production, with Managers), Booking, Booking requests, Project codes, Clients, Reports, Employees (edit), Service desk (equipment, view only), Support centre lists. Device monitoring is empty: nobody reports to this persona. | Reject a leave with a reason. Open My tasks for the Production task. Approve the Ramoji location booking. |
| **Afzal IT Admin** | No clock-in. Inbox about 11: the IT team's leave, work from home and attendance fix, plus 7 in the Service desk. Home: Equipment (acknowledgements and warranties). More: Employees, Service desk, Raise for someone, Assets, Rooms & locations, Support centre, Subscriptions, Device monitoring. | Open **My tasks** for the 2 IT tickets (no start code needed). Assign Zoya's VPN ticket to Ravi, approve Kavya's 2 monitors, reject the printer jam with a reason. **+**, **Raise for someone**, for Tejas (not signed up yet). Assign the Mac mini EDIT-WS-07, send Sanjay's MacBook link again, fix the LaCie drive's employee to 10249, cancel Priya's Board Room booking, close Podcast Studio, add a Wi-Fi network. |
| **Afzal Visitor Manager** | Home: "In the building" with Start kiosk and the desk shortcuts. Inbox: visitors at reception. More: Visitor desk, Kiosk mode, Visitor log, Invites and Check-in link as tiles, plus Help & support and My team. | Let a waiting visitor in (swipe) or turn one away. Check someone out on the Visitor desk. Search the log. **+**, **Invite visitor**. Make a new check-in link. **+ → Start kiosk**: "I'm here to meet someone", type "nav" for Naveen, add a photo and details, swipe; or type the invite code `482615` (Kavya Reddy). A visitor named "Test …" is turned away. Leave the kiosk with `Demo@123`. |
| **Afzal Announcements** (pill says **Display**) | Almost empty: People and Chat. | See how little the TV account gets in the app. |
| **Afzal App Manager** | Clock-in, leave, pay, tasks. Bounty is view only. Home: Pending reviews (5 bookings with 2 professionals). More: Team tasks, Booking, Booking requests, Pending reviews, Project codes, Clients, Reports, Employees, Service desk, Hiring (candidates, read only), Bounty admin (read only). | Open Expense claims: you get the same "no permission" error the real app gives this role. Open Pending reviews and send a WhatsApp reminder. |
| **Afzal Master Admin** | Home: Companies on DASH (3 companies, one suspended). More, Platform: Companies, Company wallets, Company features. | Register a company (the real DASH emails its Super Admin). Switch a feature off for Tamada Media (Demo). Add coins to Nexus Productions. Cancel the 20,000-coin Diwali credit (the 50,000 one is refused: those coins were already given out). |

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
- **Anything you swipe to confirm** (approve, reject, remove, cancel, publish) changes only the sample data. The note under the swipe says who the real DASH would email or WhatsApp; in the demo nobody is messaged.

---

*For developers:* the demo lives in `src/demo/` (`config.ts`, `personas.ts`, `server.ts`, `fixtures/`, `vendor/`) and the popup in `src/features/demo/role-picker.tsx`. It is switched on when `__DEV__` is true, or in a preview build when `EXPO_PUBLIC_DEMO` is `1` and `EXPO_PUBLIC_BUILD_PROFILE` is `preview` (see `docs/EXPO-ENV.md`); a saved demo session is dropped in store builds. See the README's "Demo account" section for the technical summary.
