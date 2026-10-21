# Port plan — HR PEOPLE (roster, users, departments, hiring, news + office TV, bounty admin)

Research only. Nothing in the app, server or database was changed. Every line number below was read
in this pass (`dash.html`, `server.js`, `routes/*.js`, `lib/authz.js`, `tv.js` in
`dash-tamada-latest/`; the app under `mobile/`).

**Bottom line**
- Everything in this domain can be built on endpoints that already exist. **No server or database change
  is needed.**
- Five things stay on the website: Bulk Upload / Bulk Update (spreadsheets), the CSV / XLSX / PDF exports,
  the TV playlist editor, the "view a department as its admin" dashboard, and the office TV screen itself.
- No new JS dependency. Every native module needed (`expo-image-picker`, `expo-document-picker`,
  `expo-file-system`, `expo-sharing`, `expo-image-manipulator`) is already in `package.json` and already
  used in Expo Go.
- Found during the research and worth telling the owner (§7.3):
  - one existing **privilege-escalation hole** (`POST /api/users/bulk-patch`);
  - two other routes with no permission check;
  - a website bug where HR's "Remove" half-deletes a person;
  - a website bug where editing a news post silently resets its TV priority.

---

## 0. Who sees what on the website (the gates)

Sidebar = `navFor` (dash.html:1433), which wraps `navForRaw` (dash.html:1508). The role table is at
dash.html:1531 and the bounty/referral/audit filters at dash.html:1532. CEO and COO get exactly the
Super Admin menu (`n.ceo=n.super_admin`, 1531). After the role checks, company switches remove items:
`FEATURE_REGISTRY` (dash.html:1373) and `tenantFeatureOn` (dash.html:1407). Absent means on. Master
admin is exempt. Bounty reads `tenant.bountyEnabled` instead.

| Nav id (feature flag) | Label | Roles (navForRaw 1531) | Extra gate |
|---|---|---|---|
| `users` | Users (system logins) | super_admin, ceo, coo | flag `users` |
| `roster` | Employee Roster | super_admin, ceo, coo, admin, hr, it_admin, app_manager | flag `roster` |
| `departments` | Departments | super_admin, ceo, coo, hr | flag `departments` |
| `employees` | Employees (team view) | admin, manager, app_manager | flag `employees`. **Managers/Admins domain** |
| `managers` | Managers | admin, app_manager | flag `managers`. **Managers/Admins domain** |
| `announcements` | Announcements | everyone except accounts, visitor_manager, announcement_viewer, master_admin | flag `announcements`. Create/edit only if `isAnnouncementCreator` (dash.html:11867) |
| `referrals` | Referral Program | super_admin, ceo, coo, admin, hr, it_admin, manager, employee, professional, app_manager | Shown only if `isJobOpeningCreator(user) \|\| JOB_OPENINGS.length>0` (1532). Flag `referrals` |
| `bounty` | Bounty System | everyone (`canSeeBountyNav` 11936 returns true) | `bountySystemOn` (11969). Tabs are role-gated inside `BountyHub` (14869) |
| `config` → TV Displays, Announcement/Bounty Creators | Config | super_admin (ceo/coo share the menu) | Cards mounted at dash.html:3585-3594 |

**Permission helpers (web, mirrored on the server)**
- `isAnnouncementCreator` (dash.html:11867 / server.js:7615). Roles hr, it_admin, super_admin, ceo, coo,
  plus anyone on `tenant.announcementCreators` (matched by employee number or name).
- `isBountyCreator` (dash.html:11908 / `isBountyCreatorEligible` server.js:4877). Roles super_admin, ceo,
  coo, plus anyone on `tenant.bountyCreators`.
  - The Config card text at dash.html:3249 says "HR, IT Admin… always have this permission". **That is
    false.** The server's `BOUNTY_CREATOR_ROLES` (server.js:4856) is super_admin/ceo/coo only.
- `canClaimBounty` (dash.html:11895). Creators cannot claim, except ceo, coo, manager and admin.
  app_manager never claims.
- `canManageBountyCreators` (dash.html:11941): super_admin, ceo, coo, hr.
- `canManageRedemptions` (dash.html:13449): super_admin, hr, master_admin. app_manager only when
  `tenant.appManagerBountyApprovalsOn` (dash.html:11975 / server.js:4977).
- `isJobOpeningCreator` (dash.html:11955 / server.js:7605-7608): hr, super_admin, ceo, coo.

**Server role sets** (`lib/authz.js`)
- `USER_ADMIN_ROLES` (L27): master_admin, super_admin, ceo, coo, hr, admin, it_admin, app_manager.
- `ROLE_ASSIGNER_ROLES` (L29): master_admin, super_admin, ceo, coo, hr. Only these may change `role` or
  `tenantId`.
- `DESTRUCTIVE_ROLES` (L31): master_admin, super_admin, ceo, coo. Only these may delete user accounts.
- `filterUserWrite` (L63) drops fields the caller may not write:
  - never writable: `password`, `id`, `timesheetWeeklySince`;
  - admin-only: `role`, `tenantId`, `email`, `source`, `employeeNumber`, `kekaCode`, `permissions`,
    `timesheetCadence`;
  - no one may change their own department or their own role.
- The auth gate (server.js:1446-1505) overwrites `performedById` / `actorId` with the real session user
  (L1488-1497). The app can send its own id, as the web does, and cannot spoof anyone.

---

## 1. Website features, screen by screen

### 1.A Employee Roster — `EmpRoster` (dash.html:5491-5997)
Mounted for super_admin/ceo/coo (2601, 2617), hr (default view of `HRViews` 5490), it_admin (6988), admin
(22153) and app_manager. The rows open `EmpProfileModal` (29841) through `onEmpClick` (30449).

**Loading**
1. Calls `GET /departments`, `GET /users` and `GET /whitelist` in parallel (5501).
2. Repeats every 30 s while the tab is visible (5522).
3. Side writes the screen makes on its own while loading:
   - back-fills `reportingManager` from `reportingTo` with `PUT /users/:id` (5505-5506);
   - tags system whitelist rows `source:'system'` with `PUT /whitelist/:id` (5512).

**Who is listed**
- Every user except master_admin.
- Plus whitelist rows whose email has not signed up yet, shown as "Invited" / `_invited` (5528-5530).

**List**
- KPI cards (5841-5854): Total, Active (signed up and not resigned), Pending Signup (invited), Resigned.
  Each card is also a status filter.
- Search by name, email or employee number (5789).
- Department filter and Status filter (5855-5870).
- Name sort, 10 per page (5798-5801).
- A wide table with 16 columns (5871): photo, emp no, name, email, gender, mobile, location, department,
  job title, reporting manager, joined, DOB, blood group, status, role, actions.

**Add Employee** (`saveEmp` 5636-5704, modal 5964-5995)
- Fields:
  - required: first name, email;
  - optional: employee number, last name, gender, mobile, DOB, blood group, timesheet cadence
    (daily/weekly), location, job title, department, account type (employee / professional / admin /
    manager / hr), reporting manager, additional manager.
- Upsert logic:
  - if the employee number or email matches a **signed-up user**, it calls `PUT /users/:id` instead (merge);
  - if it matches a **whitelist row**, it calls `PUT /whitelist/:id`;
  - otherwise it calls `POST /whitelist` (via `addToWhitelist` 30285).
- On a new row the server sends a **welcome email plus a welcome WhatsApp** (whitelist.js:161-163).
- The person then signs up on the website.

**Edit** (`openEdit` 5580, `doEditEmp` 5596-5624, modal 5911-5963)
- Photo:
  - lazy-loaded via `GET /users/:id/avatar` or `GET /whitelist/:id/avatar`;
  - replaced through `processAvatarFile`, which checks resolution;
  - `avatarUpdatedBy` / `avatarUpdatedById` / `avatarUpdatedAt` are stamped only when the photo changes.
- Email change:
  - goes first, through `POST /employees/change-email` (5604-5611);
  - checked for duplicates on the client and again on the server;
  - **emails the old address** (users.js:373-378).
- Role: written only if `canAssignRole` (super_admin/ceo/coo/hr/master_admin, 5759) and the person is not
  a system account (`isSystemAcct` 5705).
- The rest is written with `PUT /users/:id`.
  - For a signed-up person it also mirrors to `PUT /whitelist/:id`; an invited person gets only
    `PUT /whitelist/:id`.
  - Fields: name, timesheetCadence, gender, mobile, location, dept, jobTitle/jobRole, reportingManager,
    additionalManager, `reportingTo:null`, dateJoined, employeeNumber/kekaCode, dob, bloodGroup, avatar.
  - Server side effects:
    - mobile and phone are always kept in step (users.js:226-230);
    - names and manager names are trimmed (users.js:238);
    - a change to DOB or date joined re-syncs the birthday / anniversary cards (users.js:297-303);
    - switching to a weekly timesheet stamps `timesheetWeeklySince` (users.js:180-185). Weekly
      **blocks the person's Monday clock-in** until last week's timesheet is filled.

**Inline Role ▾** (5899, `changeRoleInline` 5625)
- Choices: admin / manager / hr / employee.
- Only for `canAssignRole` users, and never on system accounts.

**Resign / Rejoin** (`toggleResign` 5760-5780)
- Who: hr, it_admin, super_admin (`canManageResign` 5754).
- Blocked while the person still holds IT assets (5713-5720, read from client-side `ASSETS`).
- Patch: `{resigned, resignedAt, resignedBy, resignedById}`. Rejoin clears the same fields.
- **Side effect:** marking someone Resigned sweeps their whole bounty wallet into the company wallet
  through the `bounty_return_to_company` RPC (users.js:270-292). That includes coins they earned.
  **This cannot be undone by Rejoin.**

**Remove** (`deleteEmp` 5721-5749)
- Refused for system accounts.
- Blocked while assets are held.
- Warns about active tasks and bookings, then confirms.
- Then **in parallel**: `DELETE /users/:id` (signed-up people only) and `DELETE /whitelist/:id` (roster
  rows only).
- ⚠ **Website bug.** `DELETE /users/:id` needs `DESTRUCTIVE_ROLES` (users.js:383). HR, IT Admin, Admin and
  App Manager therefore get 403. The parallel `DELETE /whitelist/:id` has **no permission check**
  (whitelist.js:218), so it succeeds. The person is half-removed: the invitation is gone, the account
  stays. "Delete All" was removed (5781).

**Other buttons**
- Download Template (CSV, 5630).
- Download Roster (CSV of the current filter; super_admin/hr/it_admin, 5805-5830).
- Refresh.
- Bulk Upload (super_admin/hr/it_admin/admin, 5810). It opens `BulkUpload` (5998-6557):
  - Upload: XLSX/CSV parsed with SheetJS, duplicate preview (`findRosterMatch` 6047), departments created
    with `POST /departments`, then `PUT /users` / `PUT /whitelist` / `POST /whitelist` per row, then
    `POST /upload_batches` (6298);
  - Update: matched by employee ID, blank cell means no change (6012-6020, `UPD_COLS` 6323);
  - Upload history (`GET /upload_batches`, 6021/6544).

### 1.B User Management (system logins) — `UserMgmt` (dash.html:2631-2785)
Nav `users`: super_admin, ceo, coo.

- **List**
  - Users and whitelist rows whose role is one of 11 system roles (2633), from `GET /users` and
    `GET /whitelist`.
  - On every open it silently back-fills `source:'system'` with `PUT /users/:id` and `PUT /whitelist/:id`
    (2654-2668).
  - Search, 10 per page, status Active or "Pending signup".
- **Provision User** (2675-2692)
  - Fields: name, email, role (ceo, coo, admin, hr, it_admin, manager, accounts, app_manager,
    visitor_manager, announcement_viewer). Plus a branch when the role is `announcement_viewer`.
  - Calls `POST /whitelist` with `{…, source:'system', location}`. The person then signs up.
  - The server sends the welcome email and WhatsApp.
- **Edit Role** (2739-2775)
  - Choose a role (and a branch for the TV account).
  - Calls `PUT /users/:id` and/or `PUT /whitelist/:id` with `{role, location?}`.
- **Remove** (2719-2725)
  - Calls `DELETE /users/:id` (DESTRUCTIVE) plus `DELETE /whitelist/:id`.
  - Super Admin rows read "Owner — cannot remove".

### 1.C Departments — `DeptBrowserView` (dash.html:6687-6841)
Nav `departments`: super_admin, ceo, coo, hr. The older `DeptBuckets` (6558) is not mounted anywhere.

1. **Load** `GET /departments`, `GET /users` and `GET /whitelist` (6704-6748).
   - If there are **no departments at all**, it auto-creates one per distinct `dept` string found on
     people (`POST /departments`).
   - It then rewrites every person's `dept` to the new id (`PUT /users` / `PUT /whitelist`, in batches
     of 10).
2. **Cards**, 12 per page, with search. Each card shows the name, the department admin (`adminId` →
   name), the member count (employee + professional roles, signed up + invited, 6753) and "Click to view
   dashboard".
3. **Create** `{id, name, adminId:'', managerId:''}` with `POST /departments` (6760).
4. **Edit**: name and Admin (any person) with `PUT /departments/:id`
   `{name, adminId, managerId, managerIds}` (6767-6775).
   - `adminId` matters a great deal. It gives that person the department's approvals (HR inbox), Team
     Roster (`canSeeTeamRosterNav` 11985) and the admin dashboard.
5. **Delete** with `DELETE /departments/:id` after a confirm (6776).
   - **The server cascade-deletes all Team Roster data for that department and its HR settings**
     (departments.js:157-165).
6. Edit and Delete are shown only to `canEdit`: super_admin, ceo, coo, hr, master_admin (6782). The
   server allows all of `USER_ADMIN_ROLES`.
7. **View dashboard** (6785-6810) renders `AdminHome` (21984) / `RequestsView` / `EmpListView` /
   `ManagerTasksView` *as that department's admin*. With no admin set it falls back to `DeptDashboardView`
   (6640): KPIs built from `/users`, `/tasks`, `/bookings`, `/leaves`.

Assigning a person to a department happens on the roster (Edit → Department).

### 1.D Employees / Managers views — adjacent, owned by the Managers/Admins port
- `AdminManagersView` (22097): managers in the departments I administer, with their team size and task
  count, and a "Dashboard" preview.
- `EmpListView` (22166): the team list, plus the manager marking leave days with `POST /leaves` and
  `DELETE /leaves/:id`, projects, time corrections.

They read the same endpoints but belong to the Managers domain. They are listed only so nothing falls
between the two plans.

### 1.E Employee profile modal — `EmpProfileModal` (dash.html:29841-30040)
Opened from the roster and the directory (30526). `canAdd` (30451) = manager, admin, hr, super_admin, ceo,
coo, app_manager.

- **Shows**
  - Department, employee ID, role and location.
  - Specialisations.
  - "View Timesheets", for super_admin/hr/it_admin/ceo/coo, or a manager/admin the person reports to
    (29917).
  - Calendar of leave days.
  - Assets assigned (`GET /assets`), bookings summary and tasks.
- **Edits (when `canAdd`)**
  - "Enable Professional Booking" toggle, professional type and specialisations, all through
    `PUT /users/:id`.
  - Reporting Manager for manager/admin rows, through `PUT /users/:id {reportingTo}`.
- ⚠ A manager is in `canAdd` but not in `USER_ADMIN_ROLES`, so the server answers 403. The toggle
  ignores the error (29967) and looks saved when it is not.

### 1.F Hiring: job openings, referrals, public applications — `ReferralHub` (dash.html:15263-15339)
**Tabs** (15294-15304)
- Open Positions — everyone.
- Manage Positions — `isJobOpeningCreator`.
- Referred Candidates — creators, the read-only app_manager, or anyone HR has forwarded a referral to.
- My Referrals — everyone.
- Public Applications — creators, or anyone forwarded at least one application.
- Header: "Total Coins Earned", summed from my paid referrals (15310-15315).

**Open Positions** (`OpenPositionsBoard` 15746)
1. Loads `GET /job_openings?status=open`.
2. Shows KPI tiles (`ReferralJobKPI` 15682). The image is lazy (`GET /job_openings/:id/image`).
3. Tapping a tile opens the details modal (15711).
4. "Refer a candidate" (15763-15776):
   - fields: name (required), email, phone, profile link, qualification, years of experience, current
     salary, expected salary, notice period, résumé (PDF/DOC/DOCX, required);
   - calls `POST /referrals`.

**Manage Positions** (`ManagePositionsBoard` 15813-16000; HR, Super Admin, CEO, COO)
- Shows my available Referral Coins (`GET /bounty/wallet/:me`, 15833).
- Lists all postings (`JobOpeningCard` 15624), with the filled count taken from `/referrals`.
- **Post / Edit**: form `EMPTY_JOB_FORM` (15811). Fields:
  - position and description (both required);
  - location (city chips, 15379), department (free text or picker), experience, package;
  - number of positions (required);
  - hiring manager (any active employee);
  - employment type, application deadline;
  - **Public Application** toggle — puts the posting on tamadamedia.com/careers;
  - image;
  - referral bonus in coins, **only when creating**. It is locked once posted (`PUT` strips it,
    server.js:7753).
  - Create calls `POST /job_openings`; edit calls `PUT /job_openings/:id` (15851-15873).
- **Close** with `POST /job_openings/:id/close`.
- **Reopen** with `POST /job_openings/:id/reopen`.
- **Delete permanently** (closed postings only) with `DELETE /job_openings/:id` (15874-15894).
- Share link: the careers page, through `navigator.share` or the clipboard (15636).

**Referred Candidates** (`ReferredCandidatesBoard` 16009-16225)
- Filters: position and status. HR's default status is `submitted`.
- **Lifecycle:** submitted → hr_accepted (forwarded) → shortlisted → selected → mapped → eligible →
  approved; with rejected and not_eligible as end states.
- Actions:
  - **Resume**: `GET /referrals/:id/resume`. The first open stamps `resumeViewedAt/By`.
  - **Accept & Forward**: HR picks any employee (default: the hiring manager) →
    `POST /referrals/:id/hr-accept {forwardToId}`. The server **emails the reviewer**.
  - **Shortlist**: the forwarded reviewer, `POST /referrals/:id/shortlist`.
  - **Select**: HR only, `POST /referrals/:id/select`. It **auto-closes the posting** once the number of
    positions is filled.
  - **Reject** (reason): `POST /referrals/:id/reject`.
  - **Map Employee**: HR picks the onboarded person, who must have a date joined →
    `POST /referrals/:id/map-employee`. It sets eligibility to +3 months.
  - An hourly server sweep moves mapped → eligible or not_eligible (server.js:8149-8175).
  - **Approve Referral Bonus**: `POST /referrals/:id/approve-bonus`. **This moves coins** from the
    poster's Referral Coins to the referrer (irreversible). It answers 402 if the poster is short of coins.
- Columns for HR (16121): mapped employee, eligibility dates, bonus, résumé viewed (stamp or "Not opened
  yet").

**My Referrals** (`MyReferralsBoard` 16227)
- `GET /referrals?referredById=me`. Shows status, reason and bonus.

**Public Applications** (`PublicApplicationsBoard` 15569 + `PublicApplicationsDetail` 15406)
- List: `GET /admin/public-applications?jobId&status&search`.
- Detail: `GET /admin/public-applications/:id`. Shows candidate fields, timeline, internal notes and
  `canForward`.
- Résumé: `GET /admin/public-applications/:id/resume`. This is a **binary file**, fetched as a blob with
  the Bearer token (15442-15452).
- Status: 9 states (`PUBLIC_APP_STATUS_LABELS` 15340), plus an optional note **visible to the
  candidate**, through `PUT …/:id/status`.
- Forward: `POST …/:id/forward`. **Emails the forwardee.**
- Internal note: `POST …/:id/notes`.

### 1.G News (announcements), celebrations and the office TV
**`AnnouncementsPage`** (dash.html:19390-19526)

*Everyone*
- `GET /announcements` filtered by `announcementVisible` (17812): branch, scheduled, expiry, celebration
  switches.
- Shown as a slideshow (19214).

*Creators* (`isAnnouncementCreator`)
- "Create Mode / Preview" toggle (stored in localStorage).
- **My feed** lists only my posts; **Manage All** lists everything (19486-19489).
- Cards (`AnnouncementCard` 18822) with Edit and Delete. Shown only when
  `user.role==='super_admin' || a.createdBy===user.name` (19523).
  - The server allows **any** creator to edit or delete any post in the company (server.js:9139-9197).

*HR and Super Admin only* (19405, 19498-19512)
- "Auto-schedule Birthday wishes" and "Auto-schedule Work Anniversary" toggles →
  `PUT /tenants/:id {birthdayAutoOn | anniversaryAutoOn}`. The posting itself is a server sweep.
- "HR WhatsApp" number → `PUT /tenants/:id {hrNotifyPhone}`. The birthday/anniversary share cards go
  to this number.
- "Send test" → `POST /celebration/test-send {phone}` (server.js:2831; master_admin, super_admin, hr).
  **Sends a real WhatsApp.**

**`AnnouncementForm`** (dash.html:18901-19213)
- **Kind**: Announcement or **Pop-up**. It cannot be switched after saving; the server enforces this too
  (9151-9162).
- **Pop-up**: title, frequency (once / daily / always, `ANN_POPUP_FREQ` 17844), image (required, resized
  to 1200 px), optional link and button text.
- **Announcement**:
  - type text / link / image / video / excel / ppt;
  - description (required for text); URL (required for link) or an optional "Explore" link; button text
    (presets 18888);
  - file (images resized to 1600 px JPEG; others sent raw, ≤ 20 MB on the client);
  - "full screen" for image or video;
  - **Home Banner Image** (resized to 1600×400), with Remove.
- **Common**:
  - Publish now, or schedule a date and time (`scheduledAt`);
  - branches (`GET /branches` list, or "All");
  - "Only for today" (expiry = today) or an expiry date;
  - **TV priority** for announcements: normal / high / low / **emergency**. Emergency takes over every
    TV in the selected branches.
- **Save**: `POST /announcements` (new) or `PUT /announcements/:id`. Delete: `DELETE /announcements/:id`.
- ⚠ **Website bug.** `priority` is **not** in the list projection (`ANNOUNCEMENT_LIST_FIELDS`
  server.js:8820). The edit form therefore always opens at "normal" and **saves `priority:'normal'`**,
  silently downgrading a high or emergency post on any edit. Do not copy this in the app (§4.7).
- ⚠ The client accepts up to 20 MB, but the server's JSON body limit is 12 MB (server.js:237). Large
  files fail.

**Who creates news** — `AnnouncementCreatorsCard` (dash.html:3141)
- Search a person and add or remove them → `PUT /tenants/:id {announcementCreators:[{name,empNo}]}`.
- Lives in Config (Super Admin).

**Office TV (Dash TV)** — `TvDisplaysCard` (dash.html:2864-2959), in Config only (3585)
- **Devices** (`GET /tv/admin/devices`, refreshed every 20 s): online/offline, platform, version, now
  showing, last seen, playlist.
- **Add TV** (`TvAddModal` 3012): the 6-digit code shown on the TV, a name, a branch (from `/branches`),
  a playlist, and the inactivity return time → `POST /tv/admin/claim`.
- **Manage** (`TvManageModal` 3039):
  - rename, branch, playlist, inactivity, offline threshold, offline dot → `PATCH /tv/admin/devices/:id`;
  - remote actions (Sync, Refresh, Reload, Clear cache, Return to playlist) →
    `POST /tv/admin/devices/:id/command`;
  - log → `GET …/:id/logs`;
  - **Unpair** → `DELETE /tv/admin/devices/:id`.
- **Send announcement now** (`TvSendModal` 3081): an announcement and 30 s–1 h →
  `command SHOW_ANNOUNCEMENT {announcementId, seconds}`.
- **Playlists** (`TvPlaylistModal` 3096): name, description, status, and ordered items (announcement,
  3-300 s, start date, end date) → `POST` / `PUT` / `DELETE /tv/admin/playlists[/:id]`.
- **Custom TV media** (`TvMediaSection` 2961): image or video ≤ 8 MB → `POST /tv/admin/media`; list
  with `GET`; `DELETE /tv/admin/media/:id`. Plays on every TV and never appears in the news feed.
- **Legacy displays** (`KioskDevicesCard` 2788): claim a code → `POST /kiosk/claim`; list
  `GET /kiosk_devices`; remove `DELETE /kiosk_devices/:id` (routes/kiosk.js:80/110/120).
- **The screen itself**:
  - `AnnouncementsHome` (19556), for the `announcement_viewer` login;
  - `KioskAnnouncementsDisplay` (19849) / `KioskPortal` (20028), for a TV paired with no login.
  - Both are full-screen TV renderers and are **not** for a phone.

### 1.H Bounty administration — `BountyHub` (dash.html:14869-14941)
**Tabs** (14885-14898)
- Coin Distribution — super-tier.
- Bounty Creators — creator managers or the overseer.
- Bounty Tasks — everyone except master admin.
- My Wallet — creators or super-tier.
- Redemption Requests — `canManageRedemptions` or the overseer.
- Transactions — master, super-tier, creators, overseer.
- Reports — master, super-tier, overseer.
- Company Wallet — master_admin only; **Master Admin domain**.

The leaderboard appears on top for everyone except master admin (`BountyLeaderboard` 12504).

**Coin Distribution** (`BountyDistribution` 12184-12311)
- Company balance (`GET /bounty/wallet/company?tenantId=`).
- Pick a recipient from `GET /bounty/creators-summary`: bounty creators plus job-opening creators.
- Enter Bounty Coins and/or Referral Coins and a reason → `POST /bounty/distribute`. Super Admin or master
  only (server.js:5073-5098). **Moves coins.**
- Tables:
  - Bounty Coins: allocated, reserved, spent, earned, available, tasks created, with **Revoke**
    (super_admin/master) → `POST /bounty/revoke-from-creator`;
  - Referral Coins: the same pools.
- `CoinFlowSummary` (12115) charts `/bounty_transactions`.

**Bounty Creators**
- `BountyCreatorsCard` (3201) → `PUT /tenants/:id {bountyCreators}`. Read-only for app_manager.
- Super Admin also sees `BountyMonthlyCapCard` (3271) → `PUT /tenants/:id {bountyMonthlyEarnCap}`. The
  server strips this field for anyone but super_admin and master (tenants.js:59-61).

**Bounty Tasks, admin side** (`BountyTasksBoard` 12547-13187)
- Creators see stat cards: available = allocated − reserved − spent; reserved; tasks created.
- Filters: Open / Claimed by me / Created by me / All.
- **Create** (12645-12684, modal 12911-12992). Fields:
  - title and description (both required);
  - category; department (restricts who sees and claims);
  - deadline;
  - reward, **or Phase-wise Coins** (bands up-to-N × coins; only the last band may be unlimited);
  - reference file and/or link;
  - max accepts;
  - submission type (text / link / image / video / document) and max attachments (1-10);
  - eligibility text; professional category restriction;
  - **Requires approval** toggle — when off, a submission pays out at once.
  - Calls `POST /bounty_tasks`. The server checks the creator can afford at least one acceptance.
- **Edit** (12993-13038): plain fields → `PUT /bounty_tasks/:id`. The max-accepts cap cannot go below
  the current claims.
  - **Reward** has its own button → `POST /bounty_tasks/:id/edit-reward`. Raising it **tops up
    already-paid claimants at once**; lowering it never claws back.
- **Extend deadline** → `PUT {deadline}` (12738).
- **Remind** (12578-12593):
  - `GET …/remind-preview` gives counts (WhatsApp, email-only, no contact);
  - confirm → `POST …/remind`, which **sends WhatsApp and email** to everyone in the audience who hasn't
    taken part. Allowed once per 24 h.
- **Review claims** (13114-13137):
  - `GET /bounty_tasks/:id` loads the full submissions;
  - **Approve & Pay Out** → `POST …/approve {employeeId}`. Irreversible: pays the reserved coins;
  - **Reject** with a reason and either "send back for revision" or "reject permanently" →
    `POST …/reject`. Permanent rejection releases the reserve.
  - Who may approve or reject: the creator, super_admin/master, or app_manager when the tenant switch is
    on.
- **Cancel task** (reason) → `POST …/cancel`. Releases every active reserve. Creator or super/master.
- `DELETE /bounty_tasks/:id` exists (server.js:6277) but **is not used by the website**.

**My Wallet (creator)** (`BountyWalletView` 13195)
- Balances and history (`/bounty/wallet/:me`, `/bounty_transactions?employeeId=me`).
- **Return coins to company** → `POST /bounty/return-to-company`.

**Redemption Requests** (`BountyRedemptionsView` 13455)
- `GET /bounty_redemptions`, filtered to my company. Filters: pending, approved, declined, all.
- **Approve** with an Amazon link and coupon code → `POST /bounty_redemptions/:id/approve`.
  - **Irreversible** deduction of earned coins (RPC `bounty_redeem_earned`).
  - **Emails and WhatsApps the employee** (server.js:6710-6753).
- **Decline** (reason) → `…/decline`. Also emails and WhatsApps (6755-6790).

**Transactions** (`BountyTransactionsView` 13310)
- Ledger filters: dates, type (12 types, 12004), employee, direction.
- **Cancel** a COIN_DISTRIBUTION I sent → `POST /bounty_transactions/:id/reverse` (super_admin/master;
  blocked once the coins are used).

**Reports** (13388)
- Summary plus a ledger, exported to **XLSX (SheetJS) / PDF (jsPDF)**.

**Config switches** (dash.html:3573-3578, Super Admin)
- Bounty on/off, Org on/off, App Manager approvals → `PUT /tenants/:id`.

---

## 2. Endpoints — what each does, who may call it, what it returns

`OK` = `{ok:true,...}` envelope. A bare array means `res.json([...])`. Role checks are server-side.

### 2.1 People, roster and departments
| Method + path | File:line | Server check | Body / query | Response the UI reads | Side effects, danger |
|---|---|---|---|---|---|
| GET `/api/users` | routes/users.js:108 | any signed-in user (own tenant) | — | bare array of **full** user records, avatar stripped, `hasAvatar` | Carries bank details etc. The app must slim rows like `people.ts slimPerson` |
| GET `/api/users/:id/avatar` | users.js:116 | same tenant | — | `{avatar}` data URL | — |
| GET `/api/users/:id` | users.js:164 | same tenant | — | `{ok,user}` (no password) | — |
| PUT `/api/users/:id` | users.js:186 | self, or `USER_ADMIN_ROLES` same tenant; fields filtered by `filterUserWrite` | any profile fields; `resigned*`; `avatar` (+ `avatarUpdated*`) | `{ok}` | Email changes are dropped (must use change-email). mobile→phone sync. `resigned:true` → **wallet swept to company** (L270-292). DOB/joined change → celebration resync. Weekly cadence → `timesheetWeeklySince` |
| POST `/api/users` | users.js:125 | `USER_ADMIN_ROLES` | name, email, role… | `{ok,user}` | Not used by the roster (it invites via the whitelist) |
| POST `/api/employees/change-email` | users.js:314 | `USER_ADMIN_ROLES`; Super Admin/CEO/COO accounts only by super/master | `{userId \| whitelistId, email}` | `{ok,email}` / 409 duplicate | Updates both records, audits, **emails the old address** |
| DELETE `/api/users/:id` | users.js:383 | `DESTRUCTIVE_ROLES`, same tenant | — | `{ok}` | **Permanent.** Orphans tasks, leave, audit history |
| DELETE `/api/employees/all` | users.js:411 | DESTRUCTIVE | `?tenantId` | — | **Never** from the app |
| POST `/api/users/bulk` | users.js:448 | USER_ADMIN | array | `{inserted}` | Spreadsheet only |
| POST `/api/users/bulk-patch` | users.js:477 | **none (any signed-in user)** | `[{id,...}]` | `{updated}` | ⚠ **Security hole**: bypasses `filterUserWrite`, so it can write `role`. Never use (§7.3) |
| POST `/api/users/sync-from-whitelist` | users.js:509 | **none** | — | `{updated}` | Never use |
| GET `/api/whitelist` | routes/whitelist.js:17 | any signed-in (own tenant) | — | bare array (invitations; full rows) | — |
| GET `/api/whitelist/:id/avatar` | whitelist.js:25 | same tenant | — | `{avatar}` | — |
| POST `/api/whitelist` | whitelist.js:87 | `USER_ADMIN_ROLES`; role forced to `employee` unless a role assigner | email (req), name, role, dept, employeeNumber/kekaCode, gender, mobile, location, jobTitle, reportingManager, dateJoined, (dob, bloodGroup, timesheetCadence, additionalManager, source, tenantId pass through) | `{ok,entry}` | **Upserts by email**, and also overwrites the signed-up user's HR fields. New invite → **welcome email + WhatsApp** |
| PUT `/api/whitelist/:id` | whitelist.js:167 | `USER_ADMIN_ROLES` (role/tenant only for role assigners) | partial | `{ok}` | Email changes dropped. Celebration resync |
| DELETE `/api/whitelist/:id` | whitelist.js:218 | **none** (no role, no tenant check) | — | `{ok}` | ⚠ Destroys the invitation. The app should call it only from DESTRUCTIVE roles, mirroring the user delete |
| POST `/api/whitelist/bulk` | whitelist.js:34 | USER_ADMIN | array | `{inserted,updated}` | Spreadsheet only |
| GET `/api/departments` | routes/departments.js:19 | any (tenant-scoped) | — | bare array `{id,name,adminId,managerId,managerIds,teamRosterEnabled,…}` | — |
| POST `/api/departments` | departments.js:25 | USER_ADMIN | `{id?,name,adminId,managerId}` | `{ok,dept}` | tenantId comes from the session |
| PUT `/api/departments/:id` | departments.js:120 | USER_ADMIN, same tenant | `{name,adminId,managerId,managerIds}` | `{ok}` | Changing `adminId` moves the department's approvals and Team Roster access |
| DELETE `/api/departments/:id` | departments.js:149 | USER_ADMIN, same tenant | — | `{ok}` | ⚠ **Cascades: deletes the department's Team Roster data and HR settings.** Irreversible |
| POST `/api/departments/ensure(-bulk)`, DELETE `/all/bulk` | departments.js:48/75/189 | USER_ADMIN / DESTRUCTIVE | — | — | Bulk upload only. Never from the app |
| GET `/api/branches` | routes/branches.js:16 | any | — | bare `string[]` of locations | — |
| GET/POST `/api/upload_batches` | routes/upload_batches.js:11/12 | any | — | — | Web only |
| GET `/api/org/directory` | users.js:46 | any; full rows only for super/ceo/coo/hr | — | array (people + `pending` roster rows, ids `wl:<id>`) | The app already uses this |

### 2.2 Company settings used by this domain
| Method + path | File:line | Check | Body | Notes |
|---|---|---|---|---|
| GET `/api/tenants` | routes/tenants.js:30 | tenant-scoped | — | Array; my company carries `announcementCreators`, `bountyCreators`, `bountyMonthlyEarnCap`, `birthdayAutoOn`, `anniversaryAutoOn`, `hrNotifyPhone`, `bountyEnabled`, `featureFlags`, `appManagerBountyApprovalsOn`. The app already has `useMyTenant` |
| PUT `/api/tenants/:id` | tenants.js:53 | `USER_ADMIN_ROLES`; `bountyMonthlyEarnCap` stripped unless super/master; `featureFlags` stripped unless master | partial (e.g. `{bountyCreators:[…]}`) | **Replaces the whole array field**: always send the full new list |
| POST `/api/celebration/test-send` | server.js:2831 | master_admin, super_admin, hr | `{phone, kind?}` | `{results:[{ok,skipped,error}]}`. **Sends a real WhatsApp** |

### 2.3 Hiring
| Method + path | File:line | Check | Body / query | Response | Side effects, danger |
|---|---|---|---|---|---|
| GET `/api/job_openings` | server.js:7634 | any (own tenant) | `?status=open` | bare array (`JOB_OPENING_LIST_FIELDS` 7629: id, position, experienceRequired, package, description, referralBonus, positions, status, createdBy(Id), createdAt, hasImage, location, department, hiringManagerId/Name, employmentType, applicationDeadline, isPublic) | Self-heal: may auto-close a full posting (L7655-7674) |
| GET `/api/job_openings/:id/image` | 7679 | same tenant | — | `{image}` | — |
| POST `/api/job_openings` | 7687 | `isJobOpeningCreator` | position*, description*, positions, referralBonus, location, department, hiringManagerId/Name, employmentType, applicationDeadline, isPublic, image, experienceRequired, package | `{ok,jobOpening}` | `isPublic` → **appears on the public careers site** |
| PUT `/api/job_openings/:id` | 7740 | creator, same tenant | fields; status, referralBonus and createdBy are stripped | `{ok}` | — |
| POST `/api/job_openings/:id/close` / `/reopen` | 7775 / 7799 | creator | — | merged row | Close stops referrals |
| DELETE `/api/job_openings/:id` | 7823 | creator | — | `{ok}` | **Permanent** (referral rows keep their title) |
| GET `/api/referrals` | 7846 | any; non-HR sees only own + forwarded | `?referredById=` | bare array (`REFERRAL_LIST_FIELDS` 7845) | Runs the eligibility sweep (throttled) |
| GET `/api/referrals/:id/resume` | 7867 | HR-tier, app_manager, the referrer, the forwardee | — | `{resumeFileData,resumeFileName}` (data URL) | First open **stamps resumeViewedAt** |
| POST `/api/referrals` | 7912 | any (job open, same tenant) | jobOpeningId, candidateName*, resumeFileData* (pdf/doc/docx), candidateEmail/Phone, profileLink, qualification, yearsExperience, current/expectedSalary, noticePeriod | `{ok,referral}` | — |
| POST `/api/referrals/:id/hr-accept` | 7972 | HR-tier | `{forwardToId}` | merged row | **Emails the forwardee** |
| POST `/api/referrals/:id/shortlist` | 8010 | HR-tier or forwardee | — | merged | — |
| POST `/api/referrals/:id/select` | 8053 | HR-tier | — | `{ok,referral}` | **Auto-closes the posting when full.** No undo |
| POST `/api/referrals/:id/map-employee` | 8096 | HR-tier | `{employeeId}` (must have dateJoined) | `{ok,referral}` | Starts the 3-month clock. 409 if the person is already mapped |
| POST `/api/referrals/:id/approve-bonus` | 8182 | HR-tier | — | `{ok,referral}` / 402 | **Moves Referral Coins.** Irreversible |
| POST `/api/referrals/:id/reject` | 8248 | HR-tier or forwardee | `{reason}` | merged | Final |
| DELETE `/api/referrals/:id` | 8276 | HR-tier | — | — | Not used by the website |
| GET `/api/admin/public-applications` | 8638 | HR-tier (all) plus forwarded rows | `jobId,status,search` | bare array `{id,applicationRef,jobTitle,candidateName,candidateEmail,candidatePhone,status,appliedAt,forwardedToName}` | — |
| GET `/api/admin/public-applications/:id` | 8676 | HR-tier or forwardee | — | detail + `timeline[]`, `internalNotes[]`, `canForward` | — |
| GET `/api/admin/public-applications/:id/resume` | 8702 | same | — | **binary** (Content-Type + inline filename) | Use `downloadAuthed` |
| PUT `/api/admin/public-applications/:id/status` | 8718 | same | `{status, note}` | `{ok}` | The note is **shown to the candidate** on the status page |
| POST `/api/admin/public-applications/:id/forward` | 8743 | same | `{forwardToId}` | `{ok}` | **Emails the forwardee** |
| POST `/api/admin/public-applications/:id/notes` | 8777 | same | `{note}` | `{ok}` | Internal only |

### 2.4 News and office TV
| Method + path | File:line | Check | Body | Response | Side effects, danger |
|---|---|---|---|---|---|
| GET `/api/announcements` | server.js:8909 | own tenant | — | array (list fields 8820; **no `priority`**) | The app already uses it |
| GET `/api/announcements/:id/media` · `/banner` · `/photo` | 9042 / 9110 / 9021 | same tenant | — | `{fileData,fileName}` · `{homeBannerImage}` · `{photo}` | Already in the app |
| POST `/api/announcements` | 9119 | `isAnnouncementCreator` (7615) | kind, title, body, type, linkUrl, ctaText, branches[], expiresAt, scheduledAt, fullBleed, priority, popupFrequency, fileData/fileName, homeBannerImage(Name), createdBy, createdByRole | `{ok,announcement}` | Visible company-wide **immediately** (Home banner, pop-up over every Home page). **TVs are notified** (8862). `priority:'emergency'` takes over the TVs |
| PUT `/api/announcements/:id` | 9139 | creator, same tenant | partial; kind cannot change | `{ok}` | Send only changed keys |
| DELETE `/api/announcements/:id` | 9179 | creator, same tenant | — | `{ok}` | Permanent |
| GET/POST/DELETE `/api/tv/admin/media[/:id]` | 8935 / 8948 / 8980 | USER_ADMIN | `{type:'image'\|'video', fileData, fileName}` ≤ 11 MB base64 | list `{id,type,fileName,createdAt}` | Plays on **every** TV |
| POST `/api/tv/admin/claim` | tv.js:426 | USER_ADMIN, rate-limited 30/15 min | `{code(6), name, location, playlistId, inactivityMinutes}` | `{ok,device}` | Pairs a TV to the company |
| GET `/api/tv/admin/devices` | tv.js:457 | USER_ADMIN | — | bare array `{id,name,location,platform,appVersion,status,lastSeenAt,lastSyncAt,currentAnnouncementId,config}` | — |
| PATCH `/api/tv/admin/devices/:id` | tv.js:467 | USER_ADMIN, same tenant | `{name,location,config:{playlistId,inactivityMinutes,offlineThresholdSeconds,showOfflineIndicator}}` | `{ok}` | — |
| POST `/api/tv/admin/devices/:id/command` | tv.js:488 | USER_ADMIN, 60/min | `{command: SYNC\|REFRESH\|RELOAD\|CLEAR_CACHE\|RETURN_TO_PLAYLIST\|SHOW_ANNOUNCEMENT, payload:{announcementId,seconds}}` | `{ok,commandId}` | Acts on the TV live |
| DELETE `/api/tv/admin/devices/:id` | tv.js:509 | USER_ADMIN | — | `{ok}` | **Unpairs**: the TV goes back to showing a code |
| GET `/api/tv/admin/devices/:id/logs` | tv.js:524 | USER_ADMIN | — | `[{created_at,event_type,message}]` | — |
| GET/POST/PUT/DELETE `/api/tv/admin/playlists[/:id]` | tv.js:533 / 549 / 562 / 581 | USER_ADMIN | `{name,description,status,items:[{announcementId,durationSeconds,startDate,endDate}]}` | rows `{id,name,description,status,items}` | — |
| POST `/api/kiosk/claim`, GET `/api/kiosk_devices`, DELETE `/api/kiosk_devices/:id` | routes/kiosk.js:80 / 110 / 120 | USER_ADMIN | `{code,name,location}` | — | Legacy displays |

### 2.5 Bounty admin
| Method + path | File:line | Check | Body / query | Response | Side effects, danger |
|---|---|---|---|---|---|
| GET `/api/bounty/wallet/company` | server.js:5032 | same tenant | `?tenantId` | `{available,totalAdded,totalDistributed}` | — |
| GET `/api/bounty/creators-summary` | 5289 | **any signed-in** (own tenant) | — | bare array `{id,name,employeeNumber,role,allocated,reserved,spent,earned,available,referral*,tasksCreated}` | Exposes balances to anyone who calls it (minor) |
| POST `/api/bounty/distribute` | 5073 | super_admin, master_admin | `{employeeId,bountyAmount,referralAmount,reason}` | RPC result | **Moves coins** (reversible only while unused, via `/reverse`) |
| POST `/api/bounty/revoke-from-creator` | 5191 | super_admin, master_admin | `{employeeId,amount,reason}` | — | Pulls unused coins back |
| POST `/api/bounty/return-to-company` | 5102 | a bounty creator (self) | `{amount,reason}` | — | — |
| GET `/api/bounty/wallet/:id` | 5124 | self, or USER_ADMIN same tenant | — | wallet | Already in the app |
| POST `/api/bounty/adjustment` | 5142 | super/master | — | — | Not used by the web UI. Do not add |
| POST `/api/bounty_transactions/:id/reverse` | 5241 | COIN_DISTRIBUTION: super/master | `{reason}` | — | Undoes my distribution |
| GET `/api/bounty_transactions` | 5506 | scoped by identity (overseers see all) | dateFrom, dateTo, type, employeeId, direction | bare array | — |
| GET `/api/bounty_tasks` / `/:id` | 5555 / 5665 | list: any; full: creator, super/master, app_manager | — | list rows (submissions stripped) / full with submissions | — |
| POST `/api/bounty_tasks` | 6007 | `isBountyCreatorEligible` | §1.H fields (`reward`, `phases`, `referenceFileData`…) | the task | Affordability check |
| PUT `/api/bounty_tasks/:id` | 6108 | owner or USER_ADMIN | plain fields, deadline | the task | — |
| POST `/api/bounty_tasks/:id/edit-reward` | 6223 | owner or USER_ADMIN | `{phaseWiseCoins,reward \| phases}` | the task | **Raising it pays existing claimants at once** |
| GET `…/:id/remind-preview` · POST `…/:id/remind` | 5843 / 5864 | creator/admin (`bountyLoadForRemind`) | — | counts / `{sent,failed,message}` | **Mass WhatsApp + email.** One per 24 h |
| POST `…/:id/approve` | 6592 | creator, super/master, app_manager (switch) | `{employeeId}` | list row | **Pays coins.** Irreversible |
| POST `…/:id/reject` | 6563 | same | `{employeeId,reason,allowResubmit}` | list row | Permanent rejection releases the reserve |
| POST `…/:id/cancel` | 6620 | creator, super/master | `{reason}` | list row | Closes the task, releases reserves |
| GET `/api/bounty_tasks/:id/submissions/:emp/files/:i/download` | 5725 | — | — | `{url,fileName,inline}` | Already in the app |
| GET `/api/bounty_redemptions` | 6659 | tenant-scoped | — | bare array | — |
| POST `/api/bounty_redemptions/:id/approve` | 6710 | super_admin, hr, master (+app_manager switch) | `{amazonLink,couponCode}` | `{ok,request}` | **Deducts earned coins.** **Email + WhatsApp** to the employee |
| POST `/api/bounty_redemptions/:id/decline` | 6755 | same | `{reason}` | `{ok,request}` | **Email + WhatsApp** |

---

## 3. What the app already has, and the gaps

**Already in `mobile/`**
- **People**
  - `src/api/people.ts`: `useDirectory` (GET `/org/directory`), `useDepartments`, `avatarCache`, self-edit
    `putUser` / `useSaveMyProfile`.
  - Screens: `app/(app)/people/index.tsx`, `people/[id].tsx` (read-only, from the directory row), `org.tsx`.
  - My team: `app/(app)/team/index.tsx`, `team/department.tsx`, `features/team/*`.
  - `features/people/directory.ts` mirrors `ORG_FULL_VIEW_ROLES`.
- **News**
  - `src/api/announcements.ts` (read-only feed + lazy media/banner/photo caches + `announcementVisible`).
  - Screens: `app/(app)/announcements/index.tsx`, `[id].tsx`, `features/announcements/*` (Home banner).
  - The file header says "Creating and managing announcements stays on the website".
- **Bounty (claimant side only)**
  - `src/api/bounty.ts`: tasks, wallet, transactions, redemptions (mine), leaderboard, my claims, cap,
    claim/submit/start, redeem/reveal.
  - Screens: `app/(app)/bounty/{index,tasks,claims,leaderboard,wallet}.tsx`, `bounty/[id]/{index,submit}.tsx`.
  - Logic: `features/bounty/{logic,gate,…}`. `logic.ts` already has `BOUNTY_CREATOR_ROLES` and
    `isBountyCreator` (L29-58).
- **Menu**: `features/more/menu.ts`. A grid of at most 9 tiles (L144), with role lists that mirror
  `navForRaw`. It has no roster, departments, users, referrals or admin entries.
- **Tools already present**
  - `lib/files.ts`: `pickImage` (compressed), `pickDocument` (≤ 8 MB), `downloadAuthed` (binary with
    Bearer), `saveDataUrl`, `shareFile`.
  - `lib/access.ts`: `tenantFeatureOn`, roles.
  - The UI kit (`@/ui`): Sheet, MenuSheet, ConfirmSheet, SwipeToConfirm, SuccessSheet, SelectField,
    DateField, TimeField, ChipRow, Segmented, PillSelector, SummaryHero, SummaryCard, MetricRow,
    ActivityList, KeyValueList, EmptyState, ErrorState, SkeletonList, StatusPill, EventTimeline, Banner,
    AmountEntry/keypad, OtpBoxes.
- **Demo**: `src/demo/fixtures/org.ts` already answers GET `/users`, `/departments`, `/tenants`,
  `/org/directory` and `/whitelist/:id/avatar`, but **PUT `/users/:id` refuses anyone but self** (L333).
  `fixtures/announcements.ts` and `fixtures/bounty.ts` are read and claim only.

**Gaps (nothing exists for these)**
- Roster: list, add, edit, resign, remove, role change, email change.
- System users.
- Department create, edit, delete and admin assignment.
- The whole Referral Program, including for plain employees (open positions, refer, my referrals).
- Public applications.
- News create, edit and delete; pop-ups; scheduling; creator list; celebration switches.
- TV displays.
- Every bounty admin action: create, edit, reward, extend, remind, review, approve or reject, cancel,
  distribute, revoke, return, creators list, cap, redemption approval, ledger cancel.

---

## 4. Mobile design proposal (existing kit only)

### 4.1 Way in: a "Manage" section in More
The tile grid is full (9) for most roles. Add a **"Manage" `LabelledSection`** below the grid, as a
grouped list (`GroupedRow` + `ModuleBadge`). Each row is shown only when the website would show that
nav id (extend `NAV` in `features/more/menu.ts` with `users`, `roster`, `departments`, `referrals`), and
only when `tenantFeatureOn`:

| Row | Route | Shown to |
|---|---|---|
| Employees | `/manage/roster` | navForRaw `roster`: super_admin, ceo, coo, admin, hr, it_admin, app_manager |
| System logins | `/manage/users` | `users`: super_admin, ceo, coo |
| Departments | `/manage/departments` | `departments`: super_admin, ceo, coo, hr |
| Hiring | `/manage/hiring` | `isJobOpeningCreator`, or app_manager (read-only), or anyone with forwarded items |
| News studio | `/announcements/manage` | `isAnnouncementCreator` (mirror 11867) |
| Office TVs | `/manage/tvs` | super_admin, ceo, coo (where the web shows it: Config). The server would allow every `USER_ADMIN_ROLES`, but stay with the web |
| Bounty admin | `/bounty/admin` | super-tier, creators, hr (creators list + redemptions), app_manager (read-only) |

**"Refer & earn"** (Open positions + My referrals) is for everyone on the `referrals` nav. Put it as a
row in More › Links, and as a card on the Bounty hub, because referral coins sit in the same wallet.
Show it only when `isJobOpeningCreator || openJobs.length>0`, the same rule as dash.html:1532.

New API modules:
- `src/api/roster.ts`: users + whitelist merge, slimmed like `slimPerson`; mutations.
- `src/api/departments-admin.ts`.
- `src/api/hiring.ts`.
- `src/api/announcements-admin.ts`.
- `src/api/tv.ts`.
- `src/api/bounty-admin.ts`.

All writes use TanStack mutations that invalidate the matching keys. Big data URLs stay out of the
persisted cache (`createBlobCache`), as the existing modules already do.

### 4.2 Employees (roster)
- **`/manage/roster`**
  - `SummaryHero` with Total; a `TwoUp` of `SparkCard`/`StatTile` for Active · Invited · Resigned. These
    cards double as status filters.
  - Search `PillField` + `PillSelector` for department.
  - A `FlashList` of `ListRow`: avatar, name, job title · department, status pill.
  - `SkeletonList` while loading; `EmptyState` "No one matches"; `ErrorState` with Retry.
  - FAB → **Add employee**.
- **`/manage/roster/[id]`**: the person.
  - `SummaryCard` sections: Work, Contact, Personal, Managers.
  - Actions row: Edit · Change role · Mark resigned / Rejoin · Remove.
  - Invited rows show "Not signed up yet".
- **Add / Edit sheet**: a full-height `Sheet` with three steps (Who → Work → Personal).
  - Fields: `TextField`, `SelectField` (department, account type, gender, blood group, cadence),
    `DateField` (joined, DOB), and a person picker for manager / additional manager (reuse the People
    search list in a `Sheet`).
  - Photo through `pickImage` (already compresses).
  - **Email change**: when the email differs, call change-email first, then the PUT. Show the warning
    copy from dash.html:5940 and say "the old address gets an email".
  - **Weekly timesheet**: show the clock-in consequence before saving (5951).
  - **Add**: the duplicate check uses employee number or email against the loaded lists, then
    `POST /whitelist`. Tell the user "They'll get a welcome email and WhatsApp".
- **Change role**: `MenuSheet` with employee / professional / admin / manager / hr. Only for
  `ROLE_ASSIGNER_ROLES` and non-system accounts.
- **Mark resigned**:
  - `ConfirmSheet` + **SwipeToConfirm**;
  - a `SummaryCard` that says "Their N bounty coins go back to the company wallet and are not returned
    on rejoin" (read `GET /bounty/wallet/:id`; USER_ADMIN may read it);
  - an assets check (`GET /assets` filtered by name / employee number, as dash.html:5713) that blocks
    with a list.
- **Remove** — shown **only to `DESTRUCTIVE_ROLES`** (fixes the web's half-delete):
  - first warn about active tasks, bookings and held assets (same checks: `/tasks`, `/bookings`,
    `/assets`);
  - then `ConfirmSheet` + **SwipeToConfirm** ("Swipe to delete permanently");
  - then `DELETE /users/:id`, and **only after that succeeds**, `DELETE /whitelist/:id` for a roster
    (non-system) row.
  - Everyone else sees "Mark resigned" as the way out.
- **Web-only (say so in a `Banner`)**: Bulk Upload / Bulk Update, the roster CSV, the template. Phones
  are no place for 300-row spreadsheets, and the parser (SheetJS) would be a new dependency.

### 4.3 System logins (`/manage/users`)
- List of system-role users and pending invites, with a search.
- **Provision**: name, email, role `SelectField`, branch for the display account → `POST /whitelist`
  `{source:'system'}`.
- **Edit role**: `MenuSheet` → PUT on both records.
- **Remove**: SwipeToConfirm; Super Admin rows are locked.
- Do **not** copy the web's silent `source:'system'` back-fill writes on open. The app only reads.

### 4.4 Departments (`/manage/departments`)
- List of `ListCard`s: name, admin, member count (from roster data), "Team Roster on" chip.
- Tapping one opens a detail:
  - members (an `ActivityList` of people in that department);
  - **Admin**: person picker → `PUT /departments/:id {adminId}`. Explain in a `Banner` that the admin
    gets this team's approvals.
- **Create / Rename**: a `Sheet` with one field.
- **Delete**: SwipeToConfirm, plus a red `Banner`: "Also deletes this team's Team Roster tasks and HR
  settings. Move people out first." Disable it while members > 0. This is an app-side safety net only.
- **Web-only**: the "view as department admin" dashboard (it renders four other modules as somebody
  else) and the empty-company auto-sync. That one is a one-time migration that rewrites every person.
- Moving people between departments happens on the roster Edit sheet.

### 4.5 Hiring
- **Refer & earn** (everyone):
  - `/referrals`: open-position cards (`UpcomingCards` / `ListCard` with the bonus as a `Numeral`) →
    detail → **Refer** sheet;
  - the sheet uses the same fields; the résumé comes through `pickDocument(['application/pdf',
    'application/msword', '…wordprocessingml.document'])` (≤ 8 MB);
  - `/referrals/mine`: `ActivityList` with status pills and paid bonus.
- **`/manage/hiring`** (HR tier), segments Positions · Candidates · Applications:
  - **Positions**:
    - list with open/closed pill and filled x/y;
    - Post/Edit `Sheet` (city chips via `ChipRow`, hiring manager person-picker, `DateField`, Public
      toggle, image via `pickImage`, referral bonus only when posting);
    - Close / Reopen / Delete (Delete only for closed, SwipeToConfirm);
    - Share uses React Native's built-in `Share` API with the careers URL. No clipboard dependency.
  - **Candidates**:
    - `PillSelector` for status (default "Pending review") and position;
    - a row opens the candidate: `SummaryCard` (profile, referred by, résumé viewed),
      `EventTimeline` of the stages;
    - **Résumé**: `GET …/resume` → `saveDataUrl` → `shareFile` (open in a PDF/Word viewer);
    - actions follow the status, exactly as dash.html:16147-16194:
      - Accept & Forward: person picker;
      - Select: ConfirmSheet that says "closes the posting when full";
      - Reject: reason sheet;
      - Map employee: picker of roster people who have a date joined;
      - **Approve bonus**: **SwipeToConfirm** — "Pays N coins to <referrer>". Show the poster's referral
        balance; handle 402 with the server message;
      - forwardees see only Shortlist / Reject.
  - **Applications**:
    - search, job and status filters;
    - detail with timeline and internal notes (append);
    - status `SelectField` + candidate-visible note. Label it "The candidate will see this";
    - Forward (person picker);
    - Résumé via `downloadAuthed('/admin/public-applications/:id/resume', name)` → `shareFile`.
- **app_manager**: read-only, with no action buttons (dash.html:16158).

### 4.6 Bounty admin (`/bounty/admin`, plus additions to the existing hub)
- **Creator / admin on the existing task detail `bounty/[id]`**: add a "Manage" `MenuSheet` with:
  - Edit (fields sheet);
  - Change reward: a separate sheet with the top-up warning text from 13016;
  - Extend deadline (`DateField`, min = current);
  - Remind: preview counts in a ConfirmSheet ("WhatsApp to 34, email to 3"), then SwipeToConfirm;
  - Cancel task: reason + SwipeToConfirm.
- **Review claims** `bounty/[id]/claims`:
  - a `MetricRow` per claimant;
  - submissions through the existing submission viewer and file-download route;
  - **Approve & pay**: SwipeToConfirm ("Pays N coins — cannot be undone");
  - Reject: a sheet with a "Send back for revision / Reject permanently" `Segmented`.
- **Create bounty task**: a three-step Sheet.
  1. What: title, description, category, department, deadline.
  2. Reward: flat `AmountEntry`, or a phases editor (rows of up-to / coins), with the available balance
     shown in a `SummaryHero`.
  3. Rules: submission type `SelectTiles`, max accepts, max attachments, eligibility, professional
     category, requires-approval toggle, reference file (`pickDocument`) and link.
  - Then a ConfirmSheet and a SuccessSheet.
- **`/bounty/admin`** (super-tier / hr / creators), segmented:
  - **Distribute**: company balance `SummaryHero`; recipient picker from creators-summary; two
    `AmountEntry` pools; reason. SwipeToConfirm "Give N coins to <name>".
  - **Creators**: list with balances and Revoke (super/master, SwipeToConfirm, max = revocable). Edit the
    creators list (person picker add / remove → PUT tenants with the full array). Monthly cap (Super
    Admin).
  - **Redemptions**: pending first. Approve sheet (Amazon link + coupon; "Employee gets email +
    WhatsApp") with SwipeToConfirm. Decline with a reason.
  - **Ledger**: date and type filters; "Cancel" only on my COIN_DISTRIBUTION rows (SwipeToConfirm).
  - **My coins (creator)**: the existing wallet screen, plus a **Return to company** sheet.
- **Web-only**: Reports export (XLSX/PDF, dash.html:13410-13430) and the CoinFlow chart. The app shows a
  plain summary (`KeyValueList` of added, distributed, reserved, released, rewards) computed from the
  same ledger.

### 4.7 News studio (`/announcements/manage`)
- "My posts / All" `Segmented`. Edit and Delete only on my own posts unless super_admin, as on the web.
  Scheduled / Expired pills (`announcementStatus`).
- **New post**: a Sheet. Step 1 is the kind (`SelectTiles` Announcement / Pop-up). Then:
  - **Announcement**: type `SelectTiles`; title; description; link + button preset `SelectField`; file
    — `pickImage` for image (resize 1600), `pickDocument` for video / xlsx / ppt (≤ 8 MB); full-screen
    toggle; Home banner image (pickImage, then crop/resize to 1600×400 with `expo-image-manipulator`).
  - **Pop-up**: image + frequency + link.
  - **Publish**: now / schedule (`DateField` + `TimeField`); branches (`ChipRow` from `GET /branches`);
    "Only today" / expiry `DateField`; TV priority.
  - **Emergency** needs SwipeToConfirm: "Takes over every TV in these branches".
- **Edit**: send only changed keys. **Never send `priority` unless the user touched it**, because the
  current value is unknown (it is missing from the list). Label it "TV priority — leave unchanged". This
  avoids the web's silent downgrade.
- **Delete**: SwipeToConfirm.
- **Settings** (hr / super_admin), a small sheet:
  - birthday and anniversary auto-post toggles;
  - HR WhatsApp number with "Send test" ("sends a real WhatsApp");
  - Announcement creators list (super-tier; PUT tenants with the full array).
- A `Banner` explains that the post is visible to everyone at once.

### 4.8 Office TVs (`/manage/tvs`)
A good phone task: stand in front of the TV and type its code.
- List of TVs: online dot, branch, "now showing", last seen. Pull to refresh, plus a 20 s refetch while
  focused.
- **Add TV**: `OtpBoxes` with the 6-digit code (the existing keypad), name, branch `SelectField`,
  playlist, inactivity → claim. Show the server error ("code expired") inline.
- **TV detail**:
  - settings `SummaryCard` + edit sheet;
  - "Remote" `CategoryGrid` (Sync, Refresh, Reload, Clear cache, Back to playlist);
  - **Show now**: pick a post (non-pop-up, not expired) and a duration;
  - Log (`EventTimeline`);
  - **Unpair**: SwipeToConfirm.
- **Custom TV media**: list + upload (`pickImage` or `pickDocument(['video/*'])`, ≤ 8 MB) + delete
  (SwipeToConfirm).
- **Web-only**: the **playlist editor** (ordered rows with durations and date windows: a reorderable
  table) and the legacy /kiosk display card. The app shows the playlist names read-only and lets the
  user *pick* a playlist per TV.

### 4.9 Rules carried over
- Every irreversible action uses `ConfirmSheet` + `SwipeToConfirm`:
  - coins moving (approve, distribute, revoke, approve bonus, redemption approve, reward raise);
  - permanent delete (user, department, posting, post, TV media);
  - resign (wallet sweep);
  - mass messaging (remind, test-send);
  - emergency TV.
- Every list has skeleton, empty and error states.
- The kit rules in `docs/REFERENCE-COMPONENTS.md` §4 apply: tokens only, Plus Jakarta Sans, 48 dp
  targets, 320 dp width.

---

## 5. Expo Go (SDK 57) feasibility
- **No native module beyond what `package.json` already has.**
  - Photos: `expo-image-picker` + `expo-image-manipulator`.
  - Résumés, video, xlsx, ppt: `expo-document-picker`.
  - Opening files: `expo-file-system` + `expo-sharing` (already wrapped in `lib/files.ts`).
  - All of these are part of the Expo Go SDK 57 runtime and already used by the app in Expo Go
    (expenses, petty cash, bounty submissions).
- **Sharing a careers link**: React Native's built-in `Share` (no dependency).
  - `expo-clipboard` is "Included in Expo Go" (docs.expo.dev/versions/v57.0.0/sdk/clipboard) if
    copy-to-clipboard is wanted. That would be **one optional new dependency** (`npx expo install
    expo-clipboard`). Not required.
- **TV pairing** uses a typed 6-digit code (`OtpBoxes`). No camera or QR is needed.
- **No video preview** is required for posting a video. If one is wanted later, `expo-video` is an Expo
  SDK module (new dependency; not needed for this plan).
- **Uploads**: the server takes base64 inside JSON with a 12 MB body limit (server.js:237), so the app
  caps files at 8 MB, as `lib/files.ts` already does. The web's 20 MB cap would fail anyway.
- **Not in the app on purpose**: SheetJS (bulk upload) and jsPDF (reports). These are why those features
  stay web-only.

---

## 6. Demo fixtures (Afzal personas)
Personas exist in `src/demo/personas.ts`. Use **Afzal HR** as the main one. Use **Afzal Super Admin** for
system logins, distribute / revoke, approve-any and TVs. Use **Afzal IT Admin** for roster (no role
change, no remove) and news creator. Use **Afzal App Manager** for read-only hiring and bounty. Afzal
Admin gets the roster only. Afzal Employee gets Refer & earn only.

**Sample data to add**
- **Whitelist**: 4 invited people. 2 employees, one with a `reportingManager`, and 1 system invite (a
  manager), all on the roster.
  - The org fixture already has `PENDING_ROSTER` for the directory; give those rows real `wl…` ids so the
    two lists match.
- **Users**: mark 1 user `resigned`. Give one person a held asset (fixture for GET `/assets`) so the
  resign / remove block can be tried.
- **Departments**: the existing `DEPARTMENTS` plus `adminId` on two of them. One department with 0
  members, so delete can be shown enabled.
- **Branches**: `['Hyderabad','Vijayawada','Bengaluru']`.
- **Job openings**: 3 postings.
  - 1 public open with a 500-coin bonus and 2 positions (1 filled);
  - 1 open with no bonus;
  - 1 closed.
- **Referrals**: one per status: submitted, hr_accepted (forwarded to Afzal Manager), shortlisted,
  selected, mapped (eligible in the future), eligible, approved (bonusPaid), rejected. Each has a tiny
  PDF data URL as the résumé.
- **Public applications**: 3 rows, one forwarded, with a timeline and notes.
  - The résumé route returns binary, so the demo `downloadAuthed` path needs a local stub
    (`isDemoSession` is already checked in `lib/files.ts`).
- **Announcements**: add 1 pop-up, 1 scheduled for tomorrow, 1 expired, 1 created by "Afzal HR", and
  `priority` on the full rows.
- **Tenant**:
  - `announcementCreators: [{name:'Priya Sharma',empNo:'TM-1012'}]`;
  - `bountyCreators: [{name:'Afzal Manager',…}]`;
  - `bountyMonthlyEarnCap: 2000`;
  - `birthdayAutoOn: true`;
  - `hrNotifyPhone: '9876543210'`.
- **TVs**: 2 devices (Reception online, Canteen offline), 1 playlist, 1 media upload, 5 log lines. The
  pairing code `123456` succeeds; anything else gets "invalid or expired".
- **Bounty admin**:
  - company wallet `{available: 12000}`;
  - creators-summary rows (Afzal Super Admin, Afzal Manager as a granted creator, Afzal HR with Referral
    Coins only);
  - one task created by the persona, with 3 claims: submitted, completed, rejected;
  - 2 pending redemptions from colleagues;
  - ledger rows incl. one COIN_DISTRIBUTION sent by Afzal Super Admin (reversible).

**Endpoints the demo server must answer**
- Add these to the route tables and to the `LIST_ROUTE` regex in `src/demo/server.ts` for the bare
  arrays: `whitelist`, `job_openings`, `referrals`, `branches`, `admin/public-applications`,
  `tv/admin/devices`, `tv/admin/playlists`, `tv/admin/media`, `bounty/creators-summary`.
- GET `/whitelist`.
- PUT `/users/:id` **for other people**, when the persona is in `USER_ADMIN_ROLES`. Apply the
  `filterUserWrite` rules and the resign wallet sweep. Today org.ts:333 refuses non-self.
- POST / PUT / DELETE `/whitelist[/:id]`.
- POST `/employees/change-email`.
- DELETE `/users/:id` (403 unless super_admin).
- GET `/assets` (for the held-asset check).
- POST / PUT / DELETE `/departments[/:id]`.
- GET `/branches`.
- PUT `/tenants/:id`.
- POST `/celebration/test-send` (returns `{results:[{ok:true}]}`).
- **Hiring**:
  - GET / POST / PUT / DELETE `/job_openings`, plus `/:id/image`, `/close`, `/reopen`;
  - GET / POST `/referrals`, plus `/:id/resume`, `hr-accept`, `shortlist`, `select` (auto-close),
    `map-employee`, `approve-bonus` (moves coins in the bounty fixture, 402 when short), `reject`;
  - `admin/public-applications` (list, detail, status, forward, notes).
- POST / PUT / DELETE `/announcements[/:id]`.
- **TV**: `tv/admin/*` (claim, devices, PATCH, command, DELETE, logs, playlists GET, media GET / POST /
  DELETE).
- **Bounty**:
  - `bounty/wallet/company`, `bounty/creators-summary`, `distribute`, `revoke-from-creator`,
    `return-to-company`;
  - POST / PUT `/bounty_tasks`, plus `edit-reward`, `remind-preview`, `remind`, `approve`, `reject`,
    `cancel`, and full GET `/bounty_tasks/:id` with submissions;
  - `bounty_redemptions/:id/approve` and `/decline`;
  - `bounty_transactions` scoped for overseers, plus `/:id/reverse`.
- Update `docs/DEMO-ACCOUNTS.md`: "What to try" for Afzal HR (add an employee, forward a referral,
  approve a bonus, post news, approve a redemption) and Afzal Super Admin (pair a TV with 123456,
  distribute coins).

---

## 7. Effort and risks

### 7.1 Effort (S ≈ ½–1 day, M ≈ 2–3 days, L ≈ 4–6 days, including fixtures)
| Screen / flow | Effort |
|---|---|
| More › "Manage" section + nav gating (`menu.ts`) | S |
| Roster list + filters + person detail | M |
| Add / Edit employee sheet (incl. email change, photo, managers picker) | L |
| Resign / Rejoin, Remove, Change role (with asset/task checks) | M |
| System logins (list, provision, edit role, remove) | S |
| Departments (list, detail, create / rename, admin, delete) | M |
| Refer & earn (open positions, refer with résumé, my referrals) | M |
| Hiring › Positions (post / edit / close / reopen / delete / share) | M |
| Hiring › Candidates (status-driven actions, résumé, map, approve bonus) | L |
| Hiring › Public applications (list, detail, status, forward, notes, binary résumé) | M |
| News studio (list, create / edit both kinds, media + banner, schedule, branches, priority) | L |
| News settings (celebration toggles, HR WhatsApp + test, creators list) | S |
| Office TVs (list, pair, detail, remote, show now, unpair, media) | M |
| Bounty: create task (incl. phases, reference) | L |
| Bounty: manage task (edit, reward, extend, remind, cancel) + review / approve / reject | L |
| Bounty admin: distribute / revoke / creators list + cap / redemptions / ledger cancel / return coins | L |
| Demo fixtures for all of the above | L |

### 7.2 Risks
1. **Destructive server effects the user cannot see** must be stated in the confirm copy:
   - resign sweeps coins (not undone by rejoin);
   - department delete cascades into Team Roster and HR;
   - Select auto-closes a posting;
   - approve-bonus, approve-claim, distribute and redemption-approve move coins;
   - raising a reward pays people at once;
   - remind and test-send message real people;
   - emergency priority takes over the TVs.
2. **`GET /users` returns full records** (bank, PAN-type fields) to every signed-in user. The roster must
   slim rows before they enter the persisted query cache (copy `slimPerson`). Keep the roster query
   `meta.persist=false`, like `useLeaveDays`.
3. **Two records per person** (user + whitelist, joined by email). Every write has to hit both, as the
   web does (5621-5622); a missed mirror makes the roster drift. Put this in one `saveRosterPerson()`
   helper.
4. **Name-keyed fields**: reportingManager, additionalManager, the creators lists. Matching is exact
   string matching on the server and web. Always write the exact `name` from the picked record; never
   free text.
5. **Arrays on the tenant are replaced, not merged** (PUT `/tenants`). Always send the full new list,
   and refetch before editing so two admins don't overwrite each other.
6. **Upload size**: 12 MB body limit. Keep the 8 MB cap; images go through image-manipulator.
7. **Permission drift**: the web hides some actions the server allows (departments for admin / IT / app
   manager; editing anyone's post). The app follows the **web's** visibility, so the two clients agree.
   The server stays the real check.
8. **Large lists**: roster of a few hundred people and the bounty ledger. Use `FlashList`, client-side
   filtering, and no auto-refresh more often than the web's 30 s.

### 7.3 Things to tell the owner (server-side, outside this port — no change needed for the app)
- ⚠ **`POST /api/users/bulk-patch` (routes/users.js:477) has no role check and skips `filterUserWrite`.**
  Any signed-in employee can rewrite any user's record, including `role` (for example to super_admin).
  `POST /api/users/sync-from-whitelist` (users.js:509) also has no check. **Recommend a one-line fix:
  `requireRole(DESTRUCTIVE_ROLES …)` plus the field filter.** The app will never call either route.
- ⚠ **`DELETE /api/whitelist/:id` (routes/whitelist.js:218) has no role or tenant check.** Any signed-in
  user can delete any invitation, in any company, by id. Recommend `requireRole(USER_ADMIN_ROLES)` plus
  `assertSameTenant`.
- `GET /api/bounty/creators-summary` (server.js:5289) has no role check. Minor: it shows creator wallet
  balances within the same company.
- **Website bugs the app avoids**:
  - HR's Remove half-deletes a person (§1.A);
  - editing a news post resets its TV priority to normal (§1.G);
  - the 20 MB file picker fails above 12 MB;
  - a manager's "Enable professional booking" toggle silently fails with 403 (§1.E);
  - the Bounty Creators card claims HR and IT Admin are always creators; they are not (§0).
