# Website → app parity audit (integrator pass 3)

Owner decision: "everything in the website should be in the app". This audit walks the website's full
menu — `navForRaw` (dash.html:1508, every role's list), the items `navFor` injects (dash.html:1433:
devices, org, teamroster, attendance/HR, timesheets, visitors, visitors-desk, trmytasks, Meets), the
`CROSS_ROLE_VIEWS` table (dash.html:30471) and every role's views component (MasterAdmin, SuperAdminDash,
CeoCooDash, AdminViews, HRViews, ITAdminViews, ManagerViews, AccountsViews, AppManagerViews, EmpViews,
VisitorManagerViews), plus the HR hub's sections (`HR_SECTIONS`, dash.html:5299) and the pages outside
the sidebar (sign-in, Meets, public pages).

Audited against the website at **935a761 (26 Oct 2026)**, including every change since 5e3d500: petty
cash bill rules, withdrawals and the shared pool, Accounts controls, user phone and Edit user, the visitor
desk's 5-minute let-in, decision lines and log filter, the kiosk board, and assets lent to third parties.

Status:
- **done** — the website feature is in the app, with the website's role rules.
- **partial** — in the app, with a stated gap.
- **blocked** — built, but cannot work until something outside the app exists (a native build, a
  server deploy, owner credentials).
- **n/a** — nothing to port: no server route, no website screen, or a page for people who don't have the app.

Routes are under `src/app/(app)/` unless they start with `(auth)` or `(vendor)`. "More ›" names the More
tab row (registry: `src/features/domains.ts`).

## 1. Every role's home and dashboard

| Website (nav id → component) | Roles | App | Status |
|---|---|---|---|
| `home` EmpHome / default | employee, professional, accounts, app_manager | Home tab `(tabs)/index.tsx`: clock card, Needs you, shortcuts, news, birthdays | done |
| `home` ManagerHome (team today, tomorrow, next-day schedule) | manager | Home cards `features/work/home-cards.tsx` (Team today, Tomorrow + Share + PDF via Documents) | done |
| `dashboard` AdminHome | admin | Home cards (work, booking) + `admin/work` hub | done |
| `dashboard` SuperAdmin / CEO / COO dashboard | super_admin, ceo, coo | Home "Company at a glance" (`features/company/glance-card.tsx`) + `admin/company/index.tsx` | done |
| `home` PendingReviewsMonitor | app_manager | Home card + `admin/booking/reviews/index.tsx`, `[key].tsx` | done |
| Visitor Manager `visitors-dashboard` | visitor_manager | Home desk hero + `admin/desk/index.tsx` | done |
| `tenants` Tenant management | master_admin | Home "Companies on DASH" + `admin/platform/companies/index.tsx`, `[id].tsx` | done |
| AnnouncementsHome (display account) | announcement_viewer | People + Chat only (the TV display itself is a separate screen, see §9) | done |
| "View as department admin" (Departments › Dashboard) and the Managers page's Dashboard view-as | super_admin, admin | — | partial: not ported (desktop-only impersonated view; the data is in Employees, Managers, Reports) |

## 2. Work: tasks, projects, clients, bookings

| Website | Roles | App | Status |
|---|---|---|---|
| `tasks` ManagerTasksView (+ `tasksongoing`, `taskscompleted` KPI filters) | admin, manager, app_manager | `admin/work/tasks/index.tsx`, `[id].tsx`, `new.tsx`; Inbox `task`, `timefix` | done |
| `mytasks` MyTasks (start/pause/submit, OTP codes, shoot bookings) | employee, professional, manager, app_manager, it_admin | `tasks/index.tsx`, `tasks/[id].tsx` | done |
| `trmytasks` MyTeamRosterTasksView | Team Roster members | `tasks/index.tsx` "Team tasks" segment (`features/teamboard/my-team-tasks.tsx`) | done |
| `teamroster` TeamRosterHub (projects, works, teams, managers) | Team Roster admins | `admin/team-board/**` | done |
| `projects` ProjectsView (+ Keka codes) | most staff roles, project creators | `admin/work/projects/**` | done |
| Projects bulk upload | super_admin, hr, admin… | `admin/import/projects.tsx` | done |
| `clients` ClientsView (+ .xlsx upload) | admin, manager, staff | `admin/work/clients/index.tsx`, `admin/import/clients.tsx` | done |
| `booking` BookingMatrix (professional, room, location) | every staff role | `admin/booking/index.tsx`, `pro/**`, `room.tsx`, `location.tsx`, `history.tsx`, `[id].tsx` | done |
| `requests` / `approvals` RequestsView (booking requests) | admin, manager | `admin/booking/requests.tsx`; Inbox `booking`, `bkdone`, `bkrate` | done |
| "Extend shoot time" | manager | More › Extend a shoot `admin/hr-advanced/extend.tsx` (with a double-booking hold) | done |
| `assignwork` AssignWorkView | admin | — | n/a: dead feature (no server route) |
| `employees` EmpListView (team directory, tasks, equipment, leave) | admin, manager, app_manager | More › Employees `admin/advanced/employees.tsx` | done |
| EmpListView "Add Leave" | admin, manager | — | n/a: writes the old `/leaves` table (dead) |
| `managers` AdminManagersView | admin, app_manager | More › Managers `admin/advanced/managers.tsx` | done |
| `reports` ReportsView (people, projects, Keka codes, month grid) | super_admin, ceo, coo, hr, admin, manager, app_manager | `admin/insights/reports/**`; Excel in `admin/import/export/[key]` | done |
| Keka code time report (Excel/CSV) | same | `admin/import/export/[key].tsx` (all tabs as sheets) | done |
| `devices` Tm360Hub (pair, roster, per-person tabs) | it_admin, managers | `admin/insights/devices/**`; TM360 Excel export | done |
| Pending reviews PDF | app_manager | Documents `admin/docs/reviews` | done |

## 3. People and HR

| Website | Roles | App | Status |
|---|---|---|---|
| `roster` EmpRoster (list, edit, leaver, invite) | super_admin, ceo, coo, hr, admin, it_admin | `admin/people/index.tsx`, `[id].tsx`, `edit.tsx`; + Add employee | done |
| Roster bulk upload / bulk update (BulkUpload, applyBulkUpdate) | super_admin, hr, admin | `admin/import/employees.tsx` (Add new · Update) | done (the website's "repair" self-heal passes are left out on purpose) |
| Roster download (Excel) and the wide roster table | super_admin, hr, it_admin | Import & export › roster; Big tables › roster `admin/grids/roster.tsx` | done |
| Upload history | hr, it_admin | `admin/import/history.tsx` | done |
| `departments` DeptBrowserView | super_admin, ceo, coo, hr | `admin/people/departments/**` | done |
| `org` OrgHub (directory, tree) | everyone (unless switched off) | `people/index.tsx`, `people/org.tsx`, `team/**` | done |
| `attendance` HrHub › Attendance (my month, team, setup) | per HR modules | Me › Attendance, `attendance/**`, `admin/hr-time/offices.tsx`, `clock-rules.tsx` | done |
| Attendance month spreadsheet | HR admins, department admins | Big tables › `admin/grids/attendance.tsx` | done |
| Office map (OsmMap) for geofences | super_admin, hr (+ attendance) | `admin/advanced/office-map.tsx` (linked from HR setup › Offices) | done |
| HR › Regularization | staff | `attendance/regularize.tsx`, `attendance/fix.tsx`; Inbox `regularization` | done |
| HR › Shifts, Holidays | per modules | `attendance/shifts.tsx`, `attendance/holidays.tsx`, `admin/hr-time/shifts.tsx`, `shift-people.tsx` | done |
| HR › Leave & WFH (apply, types, rules, balances, adjust, carry forward) | per modules | `leave/**`, Me › Leave, `admin/hr-time/leave.tsx`, `balances.tsx`; Inbox `leave`, `wfh`, `comp_off` | done |
| People × leave-type balances grid | HR admins | Big tables › `admin/grids/leave-balances.tsx` (linked from Balances) | done |
| HR › Policies (read, acknowledge, write, publish) | per modules | `policies/**`, `admin/hr-time/policies/**` | done |
| HR › My Pay (payslips, salary, claims, advances, tax) | staff | Me › Pay, `pay/**`; Inbox `reimbursements`, `loans` | done |
| HR › Payroll (runs, line edits, lock, salaries, tax profiles) | HR admins + payroll modules | `admin/payroll/**` | done |
| Payroll register table | same | Big tables › `admin/grids/payroll.tsx` (linked from a run) + Excel | done |
| Salaries table | same | Big tables › `admin/grids/salaries.tsx` | done |
| Salary-structure editor | HR + `salary` | More › Payroll setup › `admin/hr-advanced/structures/**` (type the name to save) | done |
| Statutory and TDS editing | HR + `tax` | `admin/hr-advanced/statutory.tsx` (type `CHANGE TAX`; linked from Payroll › Statutory) | done |
| HrDbCheckBanner | HR admins | `admin/hr-advanced/payroll-setup.tsx` | done |
| HR › Approvals (ApprovalsPanel) | approvers | Inbox tab (every kind) + `inbox/history.tsx` | done |
| `timesheets` TimesheetsView | everyone who clocks in | `attendance/timesheets.tsx`; Documents timesheet PDF; Excel | done |
| Someone's timesheet / bookings (Excel) | canViewTimesheet | Import & export | partial: leaves out the employee's submitted timesheet lines. No server route returns them: `/hr/timesheet/mine`, `/today` and `/week` (hr_timesheet.js) all read the signed-in person's own sheets, so it needs a new server route |
| `referrals` ReferralHub (open jobs, refer, my referrals) | everyone with openings | `admin/hiring/refer/**`, Bounty screen card | done |
| Job openings, candidates, careers applications | job-opening creators, app_manager (view) | `admin/hiring/**`; Inbox `referral` | done |

## 4. Money: Accounts, vendors, petty cash, claims

| Website | Roles | App | Status |
|---|---|---|---|
| `accounts-bill-review` VendorBillApprovals | accounts, super_admin | Inbox `vbill`, `petty-acct`, `reimb-acct`; `admin/accounts/queue.tsx`, `item/[type]/[id].tsx` | done |
| `accounts-keka-approvals` VendorKekaApprovals | Keka code owners | Inbox `keka` | done |
| `accounts-vendor` / `accounts-pettycash` / `accounts-reimbursement` (VendorAccountsHub) | Accounts menu roles | `admin/accounts/index.tsx`, `payments.tsx`, `petty/tracking.tsx`, `petty/heads.tsx`, `settings.tsx` | done |
| `vendors` Vendor registrations (verification, checklist, approve) | accounts | `admin/accounts/vendors/**` | done |
| `vendormaster` VendorMaster (KPIs, bills, agreements, bank change) | accounts | `admin/accounts/vendors/**` (KPIs + chart); Documents vendor master + vendor summary PDFs; Excel vendor master | done |
| `agreements` list, extend, countersign | accounts, overseers, named countersigners | `admin/accounts/agreements/index.tsx`, `[id].tsx`; Inbox `agree-sign` | done |
| Draft an agreement + signature spots (NewAgreementModal) | EMPLOYEE_ROLES with Agreements | `admin/accounts/agreements/new.tsx` (header + on the list, + sheet "Agreement") | done |
| Signed agreement copy (certificate PDF) | same | `admin/docs/agreement/[id].tsx`; the agreement page's "Signed copy" row and success sheet | done: a countersigner who is neither drafter nor overseer reopens it from "You countersigned" (Vendor agreements) or Documents: the phone keeps the agreement's details when they sign (`features/docs/countersigned.ts`) and the server still serves them the files. The countersignature's certificate number is only on copies the lists carry |
| Petty cash: request, bills, statements, reject a bill | staff, approvers | `petty-cash/**`; Inbox `petty`, `petty-acct`; statement PDF in Documents | done |
| Petty cash bill rules: a photo or PDF on every bill, a bill date within the last 180 days, the "looks identical" warning with Submit anyway (`confirmDuplicates`) | staff | `petty-cash/bills/new.tsx` (date picker floor, swipe becomes "Swipe to submit anyway") | done |
| Withdraw a bill sent by mistake; withdrawn and rejected bills never count, and the extra claims sharing that petty cash shrink or close | staff | My bills menu and the expense report (`features/petty-cash/withdraw.tsx`); totals, reports, ledger and tracking leave withdrawn bills out | done |
| Two sign-offs on a request: only the code's owner gives the first approval (Accounts only on a code with no owner), it always goes on to Accounts, whoever gave it can't authorize it, every reject needs a reason | owners, accounts | `features/petty-cash/logic.ts` canApprove; Inbox `petty`, `petty-acct` ("You gave the first approval": Reject only) | partial: Accounts can't reject a request still at an owned code's owner stage (the server allows it); the Inbox offers Reject only to whoever can approve |
| Vendor bills: nobody approves or rejects a bill they sent; every Accounts reject needs a reason | accounts, super_admin | `features/accounts/item-detail.tsx` ("This one is yours") | done |
| `ledger` PettyCashLedger (+ custom range, Excel, print) | accounts, super_admin | Big tables › `admin/grids/petty-ledger.tsx` (CSV): a row opens its bills with "View receipt" and the request's History; a claim opens its bill and History | done |
| Expense claims (reimbursements) | staff, approvers | `reimbursements/**`; Inbox `reimbursements`, `reimb-acct` | done |
| `subscriptions` SubscriptionsHub (overview, list, payments, add/edit) | subscription admins + grants, it_admin | `admin/company/subscriptions/**` | done |
| Subscriptions Excel import / export | same | `admin/import/subscriptions.tsx`, Excel export (3 sheets) | done |
| `bounty` BountyHub (tasks, claims, wallet, leaderboard) | staff with bounty | `bounty/**` | done |
| Bounty admin (post/check tasks, creators, coins, redemptions, ledger, summary) | super tier, creators, hr; app_manager view | `admin/bounty/**`; Inbox `bounty-claim`, `bounty-coins` | done |
| Bounty coins report (Excel / PDF) | summary viewers, master_admin | Import & export › bounty; Documents › bounty | done |
| `bounty` Company Wallets (master) | master_admin | `admin/platform/wallets/**` | done |

## 5. IT and office

| Website | Roles | App | Status |
|---|---|---|---|
| `assets` AssetCatalog (list, KPIs, detail, add, assign/return, approvals) | it_admin + assets | `admin/it-desk/assets/**`; Inbox `desk-it` | done |
| Allocate to a third party, return from a third party, Comments (list, detail, Add asset, registers, PDF) | it_admin + assets | `admin/it-desk/assets/[id].tsx`, `index.tsx` ("With third parties"), `new.tsx`; `features/excel/exports/it.tsx`, `features/docs/templates.ts` | done |
| One Asset ID per company (Add asset and bulk import refuse a used one) | it_admin | `admin/it-desk/assets/new.tsx`, `features/excel/parse.ts` | done |
| Asset bulk upload + history | it_admin | `admin/import/assets.tsx`, `history.tsx` | done |
| Asset register reports (Excel / PDF) | it_admin | Import & export (4 registers + one asset's history); Documents › asset | done |
| "Delete all assets" | it_admin | More › Delete data › `admin/advanced/delete-assets.tsx` (type "delete N assets") | done |
| Asset tag scanning | it_admin | Assets: the scan button in the search field (`features/deskqr/camera.tsx` QrScanner with barcodes) opens the asset by asset ID, serial or a link to it; Add an asset scans the serial and asset ID | done |
| `rooms` RoomsLocations (rooms, locations, purposes, cancel a booking) | it_admin + rooms | `admin/it-desk/rooms/**` | done |
| `servicedesk` ServiceDesk (assign, approve, reject, status) | per slice | `admin/service-desk/**`; Inbox `desk-it` | done |
| `tasks` ITTaskOnBehalf (raise for someone) | it_admin | `admin/service-desk/raise.tsx`; + Raise for someone | done |
| Delete a service request | it_admin, super_admin | Request ⋯ (trash) → `admin/advanced/delete-ticket.tsx` (type the TKT- reference). The website has the route but no button: owner to confirm | done |
| Service desk Excel | per slice | Import & export | done |
| `support` SupportView (Wi-Fi, contacts, branches, my requests) | everyone; it_admin edits | `support/**`, `admin/it-desk/support.tsx` | done |

## 6. Company administration

| Website | Roles | App | Status |
|---|---|---|---|
| `users` UserMgmt (provision, edit, delete, invites) | super_admin, ceo, coo + users | `admin/company/users.tsx` | done |
| Optional phone when adding a login; Edit user (name, email through change-email, phone, role with Accounts, display branch) | same | `admin/company/users.tsx`, `api/company.ts` useEditUser | done |
| `config` ConfigToggles: feature switches, "Who can…" lists, HR by department, Team Roster, visitor settings, App Manager approvals | super_admin, ceo, coo + config | `admin/company/settings/**` | done |
| Config: logo text, sidebar logo, report logo | same | More › Branding `admin/hr-advanced/branding.tsx` | done |
| Config: professional categories | same | More › Professional categories `admin/hr-advanced/categories.tsx` | done |
| `audit` UserActivityAudit (filters, before/after) | super_admin + grants | `admin/company/audit/index.tsx` | done |
| Audit Excel / PDF | downloadReports grant | Import & export › audit; Documents › audit | done |
| `announcements` AnnouncementsPage (read) | everyone | `announcements/**`; video posts play in the post (`features/announcements/video.tsx`, expo-video, loaded on tap) and can still be saved | done |
| News studio (post, schedule, pop-up, TV priority, celebrations, settings) | announcement creators | `admin/news/**`; + Post news | done |
| Office TVs (pair, choose playlist, custom media) | super_admin, ceo, coo | `admin/news/tvs/**` | done |
| TV playlist editor (TvPlaylistModal) | same | `admin/advanced/playlists/**` (linked from Office TVs) | done |

## 7. Reception (visitors)

| Website | Roles | App | Status |
|---|---|---|---|
| `visitors` MyVisitorsHub (waiting for me, invite, history) | everyone except master, display, visitor_manager | `visitors/**`; Inbox `visitors` | done |
| `visitors-desk` / `-dashboard` Today's board (approve for host, check out) | visitor_manager, super_admin | `admin/desk/index.tsx`; Inbox `desk` | done |
| Desk let-in only after the host's 5 minutes ("Let in after m:ss"), who-decided lines (let in without the host, desk, invite, host by WhatsApp/app), "Let in by desk" count, Check out on Inside now | same | `features/desk/decide-screen.tsx`, `visit-row.tsx`, `visit-sheet.tsx`, `features/visitors/history-list.tsx` | done |
| `visitors-log` | same | `admin/desk/log.tsx` | done |
| Log "Decided by" filter (host, without the host, any desk decision) and search by who decided | same | `admin/desk/log.tsx` | done |
| `visitors-invites` | same | `admin/desk/invites.tsx` (+ Passes with a QR) | done |
| `visitors-qr` QR code + poster | same | `admin/desk/qr.tsx` (real QR, Print, Poster PDF, share, new link) | done |
| `visitors-kiosk` Kiosk mode | same | `admin/desk/kiosk.tsx` (keep-awake, QR pass scan, live selfie, device-auth exit) | done |
| Kiosk board: the waiting screen frees itself after 12 s, a "waiting for their host" pill and a banner after each answer (`/visitors/kiosk/board`) | same | `features/desk/kiosk/board.tsx`, `wizard.tsx` | done |
| Kiosk tablet layout and logo | same | — | n/a: a large-screen layout; the phone kiosk shows the same board |
| Check out from the host's WhatsApp page | hosts | — | n/a: a public page outside the app |
| Scan a visitor pass | same | `admin/desk/scan.tsx`; + Scan a pass | done (the server's WhatsApp pass image still has no QR; those guests type their code) |

## 8. Meets, sign-in and notifications

| Website | Roles | App | Status |
|---|---|---|---|
| `meets` MeetsHub: chats, groups, thread, info, rename, live updates, attachments | everyone | `chat/**`, `features/chat/meets-watcher.tsx` | done |
| Voice notes | everyone | `features/chatvoice/recorder.tsx`, `voice-player.tsx` | done (iOS can't play the website's WebM notes; they open the share sheet) |
| Chat export (.txt, .csv, Excel) | everyone | Chat details › Export | done |
| Voice and video calls, incoming ring, host controls | everyone | `call/index.tsx`, `call/[meetingId].tsx`, `IncomingCallWatcher` in `(app)/_layout.tsx`, StartCallSheet in a chat | blocked on phones: needs an installed build with `react-native-webrtc` (Expo Go shows "Available in the installed app"); works on the web build and in the demo |
| Staff sign-in (mobile + WhatsApp code, email + password + code) | staff | `(auth)/login.tsx`, `email.tsx`, `otp.tsx` | done |
| Forgot password, sign up | staff | `(auth)/forgot.tsx`, `signup.tsx` | done |
| Google sign-in (staff) | staff | `features/googlesignin/google-button.tsx` on login and email | blocked: needs the owner's Google client ids and a new build (`docs/GOOGLE-SIGNIN.md`); dev/preview builds use the demo picker |
| Profile (photo, details, change password) | everyone | `profile/**`, More | done |
| Notifications | everyone | More › Notifications `admin/push/index.tsx`, `PushBridge`, app badge | blocked: the device routes live on the unmerged server branch `feature/mobile-push` (`docs/PUSH.md`); the website has none |

## 9. Platform, vendor portal and public pages

| Website | Roles | App | Status |
|---|---|---|---|
| `tenants` register, edit, seat limit, suspend | master_admin | `admin/platform/companies/**` | done |
| Delete a company (deleteTenant) | master_admin | Company › Delete this company → `admin/advanced/delete-company.tsx` (type the name; your own company is refused) | done |
| `features` TenantFeaturesView (switches, HR modules) | master_admin | `admin/platform/features.tsx` | done |
| `whitelist` WhitelistView (master, no menu item) | master_admin | Company detail invitations (`admin/platform/companies/[id].tsx`) | done |
| `overrides` | master_admin | — | n/a: the menu item has no screen on the website |
| "Reset Super Admin Password" | master_admin | — | n/a: the button has no API behind it |
| Audit backfill | master_admin | — | n/a: a one-off maintenance job (PLAN §2.1.6 bans self-heal writes) |
| Vendor portal (register, KYC with Digio, forms, bills, agreements, change requests, profile) | vendors | `(vendor)/portal/**`, `(auth)/vendor*.tsx` | done |
| Vendor Google sign-in | vendors linked to Google | — | partial: not built (staff Google only); vendors use mobile + password |
| Resource requests, "Mark as leave", old approval components | — | — | n/a: dead features (no server route or unreachable) |
| Public `/visit/...` check-in page, host WhatsApp approve page, careers page, TV display screen | guests, applicants, display devices | — (the kiosk covers the reception side) | n/a: pages for people and screens without the app |

## Totals

| Status | Count |
|---|---|
| done | 114 |
| partial | 4 |
| blocked | 3 |
| n/a | 9 |
| **Total rows** | **130** |

Of the 121 rows that have something to port (all but n/a), 114 are done (94%), 4 partial and 3 blocked
only by things outside the app (a native build, a server deploy, owner credentials).

### Small gaps fixed in this pass
- Stale "on the DASH website" copy replaced by links to the app's own screens: payroll statutory (Edit),
  structures (Create or edit), the run's register (Open the full register table), leave balances (the
  grid), Office TVs (playlists), HR setup › Offices (map), roster (Import & export), platform company
  (Delete this company), companies list, Company settings (Branding), vendor agreements (New agreement),
  vendor agreements tab, IT assets empty state, booking rooms/locations, leave setup, Pay, Bounty own task,
  reporting manager.
- Service desk request: a Delete action (IT Admin, Super Admin) opening the typed-reference delete.
- Chat's "Calls aren't in the app yet" notice removed now that the global ring sheet is mounted.
- Demo: an agreement drafted in the app now records its real Keka Code, drafter and countersigner.

### Still open (not small)
- Calls on phones: install `react-native-webrtc` for SDK 57 with its config plugin, a TURN relay over
  TCP/TLS, background audio (`docs/port/PLAN.md` D3).
- Push: deploy `feature/mobile-push`, run `sql/push_devices.sql`, set `PUSH_ENABLED=1`, add the FCM/APNs
  keys (`docs/PUSH.md`).
- Google: client ids + new build (`docs/GOOGLE-SIGNIN.md`).
- Partial rows above: someone else's timesheet lines (needs a server route), vendor Google (owner's
  client ids and a build), department view-as (a desktop-only impersonated view; the data is in Employees,
  Managers and Reports), Accounts rejecting a petty cash request at an owned code's owner stage.

### Closed in pass 4
- Asset tag scanning: Assets › the scan button in the search field reads a QR or printed barcode (asset ID,
  serial number, or a link ending in either) and opens that asset; Add an asset can scan its serial and
  asset ID. Uses the desk's QrScanner, now taking `barcodeTypes`.
- Petty cash ledger: each bill shows "View receipt" (`…/receipt`, the web's PettyCashReceiptLink) and the
  request's History; a claim shows its bill and History.
- Signed copy for a countersigner who isn't the drafter or an overseer: kept on the phone at signing
  (`features/docs/countersigned.ts`), listed under "You countersigned" and in Documents; the agreement page
  links the signed copy.
- Inline video in news posts: `expo-video` (added with `npx expo install`; in Expo Go for SDK 57).
