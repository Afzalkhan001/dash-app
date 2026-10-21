# Port plan: Leadership & platform admin (Super Admin · CEO · COO · Master Admin)

Scope: the company **Dashboard**, **Users** (system-user management), **Config** (company settings
and switches), **User Activity Audit**, **Subscriptions**, and the Master Admin console
(**Tenants/Companies**, **Company Wallets**, **Company Features**, **Overrides**).
Out of scope (other port docs): Employee Roster, Departments, Projects, Booking, Reports, Service
Desk, Accounts/Vendors, Bounty task admin (Coin Distribution, Creators, Redemptions), Visitor Desk,
News posting, TV/kiosk pairing. They appear in the same sidebar for these roles and are only listed
here where Config touches them.

Hard rule kept: **every screen below works on existing endpoints. No server or DB change is
required.** Section 2.9 lists server bugs found while reading (not blockers; flagged for the owner).

All line numbers are from `dash.html` (website), `server.js` and the module files as of this
review. "Web-only" means: do not build in the app; link the person to the website instead.

---

## 1. Website features in this domain

### 1.0 Who sees what (nav gates)

`navForRaw` (dash.html:1508–1532) and `navFor` (dash.html:1433–1507):

| Role | Sidebar items in this domain | Notes |
|---|---|---|
| `super_admin` | Dashboard, Users, Config, User Activity Audit, Subscriptions | `n.super_admin` list, dash.html:1531. Audit always (`auditVisible = role==='super_admin' \|\| canSeeAuditNav`, :1532). Subscriptions injected right after Accounts (:1532). |
| `ceo`, `coo` | Dashboard, Users, Config, Subscriptions; Audit **only if granted** | `n.ceo = n.coo = n.super_admin` (:1531) so they get the Super Admin menu, but `AN` (audit) is filtered out unless `canSeeAuditNav` (dash.html:11946) finds them in `tenant.auditAccess`. Subscriptions appended at the end (:1532). |
| `master_admin` | Tenants, Company Wallets (id `bounty`), Company Features, Overrides | `n.master_admin` (:1531). Feature flags never filter master admin (:1503). No Audit item (canSeeAuditNav is false: no tenant), though `MasterAdmin` would render it (dash.html:2460). Subscriptions explicitly removed (:1532). |
| any other role | Audit if in `tenant.auditAccess`; Subscriptions if `it_admin` or in `tenant.subscriptionAccess` | `canSeeAuditNav` dash.html:11946, `canSeeSubscriptionsNav` dash.html:11174 (`SUBSCRIPTION_ADMIN_ROLES` = it_admin, super_admin, ceo, coo, master_admin, :11172). Routed via `CROSS_ROLE_VIEWS` (dash.html:30471) once `navFor` lists them. |

Company feature switches (`FEATURE_REGISTRY` dash.html:1373–1399, `tenantFeatureOn` :1407) that
can hide items in this domain for a whole company: `users`, `subscriptions`, `audit`, `config`
(plus `bounty`, which reads `tenant.bountyEnabled`). Dashboard is deliberately not switchable
(:1370). Only master admin may set `featureFlags` (server strips it for others,
routes/tenants.js:67–71).

Role → component routing (dash.html:30500–30513): `master_admin` → `MasterAdmin` (2384);
`super_admin` → `SuperAdminDash` (2580); `ceo`/`coo` → `CeoCooDash` (2615). Cross-role views
(`audit`, `subscriptions`, `bounty`) go through `CROSS_ROLE_VIEWS` first.

`hr.js` gives these roles no clock-in and no own pay (system roles, `HR_SYSTEM_ROLES`
mobile/src/lib/access.ts:34) — unchanged by this port.

### 1.1 Super Admin / CEO / COO Dashboard — `SAHome` (dash.html:2518–2579)

Rendered by `SuperAdminDash` (2613) and `CeoCooDash` (2629, with `bountyOn={false}` and a no-op
setter, so CEO/COO get no bounty toggle).

Step by step:
1. On mount: `GET /api/dashboard/summary` (4 counts), `GET /api/users`, `GET /api/departments`
   (2531–2533).
2. Shows `BountyPayoutTicker` (19292) and `HomeAnnouncementBanner` (19322) above the page, then
   `PendingOtpBanner` (26184 — polls `GET /api/my_pending_otps` every 20 s; codes the caller must
   read out to someone finishing their task/booking).
3. Header action (Super Admin only): **Bounty System** toggle → `toggleBounty` (dash.html:30277)
   → `PUT /api/tenants/:id {bountyEnabled}` + localStorage.
4. Four KPI cards: Total Users, Departments, Active Tasks, Pending Bookings (2546–2551). Tapping
   one opens a modal table (2552–2563):
   - Users: name / role badge / department (from the `/users` list filtered to the tenant).
   - Departments: name / mode (`bucket||mode`) / member count.
   - Active Tasks: lazily `GET /api/tasks` (full table, ~1.3 MB) then `status!=='completed'`.
   - Pending Bookings: lazily `GET /api/bookings` then `status==='pending'`.
5. "Bounty coins active across platform" note when the toggle is on.

`SuperAdminDash` also runs a **write-on-view side effect** on every mount (2584–2599): it loads
`/whitelist` and `/users` and fires `PUT /api/whitelist/:id {source:'system'}` / `PUT
/api/users/:id {source:'system'}` for every system-role row not yet tagged. `UserMgmt` repeats this
(2653–2669). The app must **not** copy this.

### 1.2 Users — `UserMgmt` (dash.html:2631–2785)

Same component for Super Admin, CEO, COO (2600, 2616). "System users" only: roles in
`SYSTEM_ROLES` = super_admin, ceo, coo, admin, hr, it_admin, manager, accounts, app_manager,
announcement_viewer, visitor_manager (2633). Employees/professionals are managed in Employee Roster
(other doc).

1. Load `GET /api/users` → signed-up system users of my tenant; `GET /api/whitelist` → system-role
   invitations of my tenant whose email has no user yet = **Pending signup** (2647–2673).
2. Search box over name / email / role label (2694–2695). Paged 10 per page (2696–2699).
3. Table: Name, Email, Role badge, Status (Active / "Pending signup"), Action (2708–2730).
   `super_admin` rows say "Owner — cannot remove" (2715–2716).
4. **Edit** → modal "Edit Role" (2739–2775): role select (CEO, COO, Admin, HR, IT Admin, Manager,
   Application Manager, Visitor Manager, Announcements (Display) — note: *Accounts is missing from
   Edit but present in Provision*). If `announcement_viewer`: Branch select (`ALL_BRANCHES` or a
   location found on users/whitelist rows). Save → `PUT /api/users/:id {role, location?}` if signed
   up, and `PUT /api/whitelist/:wlId {role, location?}` if an invitation exists.
5. **Remove** (no confirm on the web!) (2719–2725) → `DELETE /api/users/:id` if signed up, then
   `DELETE /api/whitelist/:id` for the matching email.
6. **+ Provision User** → modal (2776–2784): Full name*, Email*, Role (adds Accounts), Branch for the
   display role. Client-side duplicate check against signed-up users only (2680–2681). Save →
   `POST /api/whitelist {id:'wl'+now, email, name, role, dept:null, kekaCode:'', tenantId,
   status:'active', source:'system', location}` (2683–2684). Message "whitelisted — they can now
   sign up".

### 1.3 Config — `ConfigToggles` (dash.html:3489–3595)

Same component for Super Admin and CEO/COO (2606, 2628). One long page of cards; every save is a
`PUT /api/tenants/:id` with just the changed keys (merge on the server) unless noted. It reads
`TENANTS[0]` (for a non-master user `/api/tenants` returns only their own company, so that is
their tenant).

| Card | dash.html | What it does | Endpoint / body |
|---|---|---|---|
| Company Information | 3535–3539 | Name, Contact Email (**stored as `tenant.superAdmin`**), Phone, Address → "Save Company Data". These print as the letterhead on every export. | `PUT /tenants/:id {name, superAdmin, address, phone}` |
| Branding | 3540–3553 | Logo text; logo image (FileReader → data URL, max 2 MB, transparent PNG recommended); remove logo. | `PUT {logoUrl, logoText}` / `{logoUrl:null}` |
| Report Logo | 3556–3569 | Separate letterhead logo for PDF exports. | `PUT {reportLogoUrl}` |
| Visitor Management | `VisitorConfigCard` 35965 | Approval wait 1–240 min, photo retention 1–365 days. | `PUT {visitorApprovalTimeoutMin, visitorPhotoRetentionDays}` |
| Bounty Works System | 3573–3578 | Toggles: Bounty Coins System (`bountyEnabled`, via the root `toggleBounty`), Org (`orgEnabled`, 3494–3499), App Manager may approve bounty submissions (`appManagerBountyApprovalsOn`, 3528–3529). | `PUT {bountyEnabled}` / `{orgEnabled}` / `{appManagerBountyApprovalsOn}` |
| Platform Limits | 3579–3583 | Read-only: Max users (set by Master Admin), current users (count of loaded `USERS`), seat bar. | — |
| TV Displays | `TvDisplaysCard` 2864 | Dash TV pairing, playlists, commands. | `/api/tv/admin/*` (tv.js:426–581, `USER_ADMIN_ROLES`) — *other doc (News/TV)* |
| Display Devices | `KioskDevicesCard` 2788 | Legacy /kiosk pairing by 6-digit code. | `POST /api/kiosk/claim`, `GET/DELETE /api/kiosk_devices` (routes/kiosk.js:80–120) — *other doc* |
| Announcement Creators | 3141–3200 | Named grants `{name, empNo}`; add via employee search, remove. | `PUT {announcementCreators:[...]}` |
| Bounty Task Creators | 3201–3265 | Same pattern. | `PUT {bountyCreators:[...]}` |
| Project Creators | 3297–3353 | Same pattern. | `PUT {projectCreators:[...]}` |
| User Activity Audit Access | `AuditAccessCard` 3355–3420 | Grants `{name, empNo, userId, permissions:{viewLogs, searchUsers, viewDetail, downloadReports}}`, default `{true,true,true,false}`; per-grant checkboxes. Server writes a permission audit row per change (routes/tenants.js:103–137). | `PUT {auditAccess:[...]}` |
| Subscriptions Access | `SubscriptionAccessCard` 11817–11880 | Read+export grants `{name, empNo, userId}`. | `PUT {subscriptionAccess:[...]}` |
| Professional Categories | `ProfessionalCategoriesCard` 3428–3488 | Editable table: label, day start/end, gap minutes, offered on/off; id derived once from label. | `PUT {profTypes:[...]}` |
| HR Access | `HrAccessCard` 5377–5414 | Per-department HR on/off + module checkboxes (only modules the platform owner granted the company). Enable/Disable all shown. | `GET /api/hr/config/overview`; `PUT /api/hr/config/departments/:id {enabled, modules?}`; bulk `PUT /api/hr/config/departments {departmentIds, enabled}` (hr.js:518–596) |
| Team Roster Access | `TeamRosterAccessCard` 5424–5489 | Global switch (`teamRosterEnabled` on tenant) + per-department switch (needs a department admin; confirm before disabling). | `GET /api/team-roster/departments` (team_roster.js:163); `PUT /tenants/:id {teamRosterEnabled}`; `PUT /api/departments/:id {teamRosterEnabled}` (routes/departments.js:120) |
| Monthly Earning Cap | `BountyMonthlyCapCard` 3271–3296 | Shown inside Bounty → Creators for Super Admin, not on Config. Blank/0 = no cap. | `PUT {bountyMonthlyEarnCap}` (server: super_admin/master_admin only, routes/tenants.js:60–62) |

Grant-list cards build their employee search from `GET /api/users` + `GET /api/whitelist`
(same-tenant, deduped by email). Matching is by `userId` or `empNo` (or name for some lists), so a
grant survives a person signing up later.

### 1.4 User Activity Audit — `UserActivityAudit` (dash.html:15020–15218)

Constants: `AUDIT_TABS` (14955: All, Bookings, Service Requests, Profile, Tasks, Approvals, Reports,
Configuration, Other), `ACTION_ICON`/`AUDIT_ACTIONS` (14966–14967), `auditActionClass` (14971).
`AuditUserSearch` (14979–15019).

1. KPI row from `GET /api/audit_log/summary` (Total, Today, Active users, Bookings, Service
   requests, Profile changes, Report downloads) — re-fetched on every filter change (15040–15046).
2. **Find an Employee**: debounced `GET /api/audit_log/user-search?q&dept&role` → pick →
   `GET /api/audit_log/user/:id` → profile panel (employee ID, department, designation, total
   activities) and the list narrows to that person (`userId`).
3. Type tabs (activityType), filter bar: From/To + presets (Today, Yesterday, 7 d, 30 d), Module,
   Activity type, Action, Department, Role, Status (success/failed), free-text Search, Clear.
4. List: `GET /api/audit_log?page&pageSize=15&...` grouped by day (actor name, description, action
   badge) with numbered pager.
5. Tap row → "Activity Detail" modal: actor + role + email, affected user, module, action,
   description, entity, date/time, IP, status, **BEFORE / AFTER** key lists.
6. Downloads: Excel (SheetJS + letterhead), PDF (jsPDF autotable), CSV — all from
   `POST /api/audit_log/export {filters}`; "Download Complete Audit Report" for super/master with no
   filters. **Each export writes its own audit row** ("downloaded").
7. "Backfill Historical Activity" button for super_admin and master_admin (15134) — but the server
   accepts **master_admin only** (server.js:7478–7484), so it always fails for Super Admin.

### 1.5 Subscriptions — `SubscriptionsHub` (dash.html:11523–11810)

Supporting: `SUB_PERIODS`, `SUB_STATUS_META` (11188–11193), `currentFyRange` (11200),
`renewalTone` (11208), `SubStat` (11216), `SubscriptionForm` (11229–11345), `PaymentForm`
(11475), `SubscriptionImport` + `parseSubscriptionWorkbook` (11347–11522).

1. Loads in parallel `GET /api/subscriptions?actorId=`, `GET /api/subscriptions/payments?from&to`,
   `GET /api/subscriptions/summary?from&to` (11538–11553). A 403 shows the server's message
   ("Ask an IT Admin to grant it…").
2. Renewal banner above the tabs: active subs renewing ≤ 30 days (overdue first, red) as chips.
3. Date range (default: current Indian FY to date) with presets This FY / This month / All time.
4. Tabs: **Overview** (6 stat tiles: Active, Per month, Per year, Not-using waste, Spent in range,
   Missing Keka code; By-department table; month-by-month bars), **Subscriptions** (search +
   department + status filters; 11-column table; Edit/Delete for managers), **Payments**
   (ledger for the range; Delete for managers), **Upload past data** (managers; Excel import).
5. Buttons: Export Excel (3 sheets), Record payment (managers), Add subscription (managers).
6. Add/Edit form: name*, department (free text + datalist), plan, period, status, INR, USD,
   renewal date, Keka code, account email, login URL, payee, payment mode, owner, comments. No
   passwords are stored.
7. Delete subscription keeps its payment history (confirm); delete payment (confirm).

`canManage` (add/edit/delete/import) = it_admin, super_admin, ceo, coo, master_admin; grantees
read and export only (subscriptions.js:21–28, 112–123).

### 1.6 Master Admin — Tenants (`MasterAdmin` default view, dash.html:2384–2507)

1. `GET /api/tenants` (all companies for master admin) (2388).
2. Grid of company cards: logo initials, status badge, **Delete**, name, super-admin email, users,
   max users, capacity bar, chips "Bounty ON" / Active|Suspended.
   - `t.users` is the value stored at creation (`users:0`, routes/tenants.js:35) and is **never
     updated** anywhere, so the count and capacity bar are always 0 on the web.
3. **+ Register Company** modal (2464–2478): name*, max users, super-admin name*, super-admin
   email*, tax ID, address, Enable Bounty. Save (2395–2412): `POST /api/tenants {...}` then
   `POST /api/whitelist {email, name, role:'super_admin', tenantId, status:'active',
   source:'system'}` → that person can sign up. Server sends the welcome email (side effect).
4. **Delete** → confirm modal ("permanently delete all users, departments, whitelist entries, and
   projects… cannot be undone") (2479–2483) → `deleteTenant` (2413–2455): fetches /users,
   /whitelist, /departments, /projects, calls `DELETE /api/tenants/:id` (which already cascades
   ~20 tables server-side, routes/tenants.js:163–257), then *also* deletes each user / whitelist /
   department / project from the client in batches of 15.
5. Tap card → `TenantDetail` (2509–2517): company name, super-admin email, address, tax ID; max
   users; status Active/Suspended; Save → `PUT /api/tenants/:id` (whole object). "Reset Super Admin
   Password" button **does nothing** (sets a local flag and shows "email sent"; no API call).
   `status` and `maxUsers` are **not enforced** anywhere on the server (grep finds no reader).
6. `WhitelistView` (2508) is a fake form (no API) and is not reachable from the nav.

### 1.7 Master Admin — Company Wallets (`BountyHub` as master, dash.html:14869–14953)

Tabs for master: Company Wallet, Transactions, Reports (14884–14895). No leaderboard.
- **Company Wallet** — `BountyCompanyOverview` (12016–12105): company picker (`GET /api/tenants`),
  stat cards Total added / Total distributed / Available (`GET /api/bounty/wallet/company?tenantId`),
  **Add Bounty Coins** form (amount, reason) → `POST /api/bounty/company/add-coins {tenantId,
  amount, reason}`; "Recent Company Credits" table (`GET /api/bounty_transactions?type=COMPANY_CREDIT
  &tenantId=`) with **Cancel** per row → `POST /api/bounty_transactions/:id/reverse {reason}`
  (works only if none of it was distributed/spent).
- **Transactions** — `BountyTransactionsView` (13310–13386): for master locked to
  `type=COMPANY_CREDIT`, all companies, date/direction/search filters, Cancel.
- **Reports** — `BountyReportsView` (13388–13438): Excel/PDF of COMPANY_CREDIT rows with totals.

### 1.8 Master Admin — Company Features (`TenantFeaturesView`, dash.html:2326–2383)

1. Company picker. Count of features switched off.
2. `HrCompanyCard` (5343–5375): HR (HRMS) on/off for the company and the module catalogue
   (grouped Time / People / Payroll; unavailable modules greyed) — `GET/PUT
   /api/hr/admin/tenants/:tenantId/access {enabled, modules?}` (hr.js:486–516).
3. One card per `FEATURE_REGISTRY` group (People, Work, Workplace, Communication, Programmes,
   Finance, Oversight) with a toggle per feature (25 features). Toggle →
   `PUT /api/tenants/:id {featureFlags:{[id]:bool}}`, except `bounty` → `{bountyEnabled}`. Server
   merges flags and writes one audit row per flag that changed (routes/tenants.js:72–96).

### 1.9 Master Admin — Overrides

Nav item exists (dash.html:1531) but `MasterAdmin` has **no `overrides` branch** (2456–2461), so
it falls through to the Tenants grid. Nothing to port.

---

## 2. Endpoints

Auth: every route below sits behind the session gate (server.js:1446–1505), which **overwrites
`performedById`/`actorId` in the body (and in the query when present) with the real session user**
(server.js:1484–1493). The app's `api.post/put` already add `performedById` (mobile
src/api/client.ts `withActor`). On Express 4 (`package.json` ^4.18.2) `req.body` is `{}` even on GET,
so the stamp also reaches body-reading GET handlers; still send `?performedById=1` (audit) and
`?actorId=1` (subscriptions) on GETs to match the web and stay safe if Express is upgraded.
Response helper `ok()` = `{ok:true, ...extra}` (server.js:1153).

### 2.1 Dashboard

| Method path | File:line | Role check | Request | Response the UI reads | Side effects |
|---|---|---|---|---|---|
| GET `/api/dashboard/summary` | routes/dashboard.js:46 | any signed-in user; tenant-scoped (master: all tenants) | — | `{users, departments, activeTasks, pendingBookings}` (plain JSON, no `ok`) | none |
| GET `/api/my_pending_otps` | routes/dashboard.js:11 | own codes only | — | `[{key, otp:{code,expiresAt}, assignee, title}]` | none (already used by mobile Home "Needs you") |
| GET `/api/users` | routes/users.js:108 | tenant-scoped (master: everyone); lite rows, avatar stripped (`hasAvatar`) | — | array of user records | none |
| GET `/api/departments` | routes/departments.js:19 | tenant-scoped | — | array `{id, name, bucket/mode, adminId,…}` | none |
| GET `/api/tasks?activeOnly=1` | routes/tasks.js:24 | (tasks doc) | — | array | none — use `activeOnly=1`, never the full 1.3 MB table |
| PUT `/api/tenants/:id {bountyEnabled}` | routes/tenants.js:53 | `USER_ADMIN_ROLES` | `{bountyEnabled:bool}` | `{ok}` | audit row; hides Bounty for the whole company |

### 2.2 Users

| Method path | File:line | Role check | Request | Response | Side effects / danger |
|---|---|---|---|---|---|
| GET `/api/whitelist` | routes/whitelist.js:17 | tenant-scoped (master: all) | — | array (lite) `{id,email,name,role,tenantId,location,source,…}` | — |
| POST `/api/whitelist` | routes/whitelist.js:87 | `USER_ADMIN_ROLES`; role forced to `employee` unless `ROLE_ASSIGNER_ROLES` (master, super, ceo, coo, hr); `master_admin` only by master | `{email*, name, role, dept:null, kekaCode:'', tenantId, location}` (`tenantId` **taken from the body**, not the session) | `{ok, entry}` | **Upserts by email**: if the email is already invited it overwrites that row *and* copies role/dept/tenant into the signed-up user (whitelist.js:116–122). Sends **welcome email** and a **WhatsApp welcome** if a mobile is present (whitelist.js:162–163). Audit row. |
| PUT `/api/whitelist/:id` | routes/whitelist.js:167 | `USER_ADMIN_ROLES`; `role`/`tenantId` dropped unless role-assigner | `{role, location?}` | `{ok}` | Audit row. No same-tenant check. |
| DELETE `/api/whitelist/:id` | routes/whitelist.js:218 | **none beyond sign-in** | — | `{ok}` | Irreversible. Audit row. |
| PUT `/api/users/:id` | routes/users.js:186 | self or `USER_ADMIN_ROLES`, same tenant; `filterUserWrite` (lib/authz.js:58–82): role needs role-assigner, nobody changes their own role, only master mints master | `{role, location?}` | `{ok}` | Audit row; auth cache dropped so the new role applies on the next request. |
| DELETE `/api/users/:id` | routes/users.js:383 | `DESTRUCTIVE_ROLES` (master, super, ceo, coo), same tenant | — | `{ok}` | **Irreversible** account deletion. Audit row. |

### 2.3 Config

| Method path | File:line | Role check | Request | Response | Side effects / danger |
|---|---|---|---|---|---|
| GET `/api/tenants` | routes/tenants.js:30 | any; non-master sees only own row; `visitorPublicToken` stripped | — | array of tenant records (all config fields: `name, superAdmin, address, phone, logoText, logoUrl, reportLogoUrl, maxUsers, bountyEnabled, orgEnabled, teamRosterEnabled, appManagerBountyApprovalsOn, bountyMonthlyEarnCap, featureFlags, announcementCreators, bountyCreators, projectCreators, auditAccess, subscriptionAccess, profTypes, visitorApprovalTimeoutMin, visitorPhotoRetentionDays`) | — |
| PUT `/api/tenants/:id` | routes/tenants.js:53–161 | `USER_ADMIN_ROLES` (master, super, ceo, coo, hr, admin, it_admin, app_manager). Strips `featureFlags` unless master; strips `bountyMonthlyEarnCap` unless super/master; never writes `visitorPublicToken`. **No same-tenant check.** | any subset of tenant fields | `{ok}` | Shallow merge into the row. `featureFlags` deep-merged. Audit rows (per flag, per auditAccess grantee, plus one generic diff). Arrays (grant lists, `profTypes`) are **replaced wholesale** — send the full list. |
| GET `/api/hr/config/overview` | hr.js:518 | master/super | (`?tenantId` for master) | `{tenant:{enabled,modules}, catalogue:[{id,label,group,desc,available,granted}], departments:[{id,name,adminName,enabled,modules}]}` | — |
| PUT `/api/hr/config/departments/:id` | hr.js:583 | super (master refused inside `setDeptAccess`, hr.js:552) | `{enabled, modules?}` | `{ok, departments:[{id,enabled,modules}]}` | Turns HR on/off for a whole department immediately (clock-in, leave…). Audit row. |
| PUT `/api/hr/config/departments` | hr.js:589 | super | `{departmentIds[1–200], enabled, modules?}` | same | bulk |
| GET `/api/hr/me` | hr.js:~451 | any | — | `{canConfigure,…}` (already used) | — |
| GET `/api/team-roster/departments` | team_roster.js:163 | `['master_admin','super_admin']` | — | `{globalEnabled, departments:[{id,name,adminId,adminName,managerCount,teamCount,teamRosterEnabled}]}` | — |
| PUT `/api/departments/:id` | routes/departments.js:120 | `USER_ADMIN_ROLES` | `{teamRosterEnabled}` | `{ok}` | Disabling removes Team Roster Managers' access (records kept). |

### 2.4 Audit

All in server.js; permission via `hasAuditPermission` (7233–7241): super_admin and master_admin
always; others need a grant in `tenant.auditAccess` with the named permission. Tenant-scoped for
non-master.

| Method path | Line | Permission | Request | Response |
|---|---|---|---|---|
| GET `/api/audit_log` | 7300 | `viewLogs` | `?page&pageSize(≤500)&dateFrom&dateTo&module&activityType&action&dept&role&status&userId&search` (no filters ⇒ last 90 days) | `{ok, rows:[{id,createdAt,actorName,actorRole,actorEmail,affectedUserName,affectedUserEmpId,module,activityType,action,description,entityType,entityId,previousData,newData,ipAddress,status}], total (estimated), page, pageSize}` |
| GET `/api/audit_log/summary` | 7344 | `viewLogs` | same filters | `{ok,totalActivities,activitiesToday,activeUsers,bookingsActivity,serviceRequestActivity,profileChanges,reportDownloads}` |
| GET `/api/audit_log/user-search` | 7365 | `searchUsers` | `?q&dept&role` | **quirk**: `ok(res, array)` spreads the array into `{ok:true, "0":{…}, "1":{…}}` — rebuild it like the web's `unwrapArrayResponse` (dash.html:14949). Rows: `{id,name,email,dept,role,employeeNumber,…}` |
| GET `/api/audit_log/user/:userId` | 7375 | `viewLogs`, same tenant | — | `{ok,user,totalActivities,lastActivityAt,timeline[]}` |
| POST `/api/audit_log/export` | 7401 | `downloadReports` | `{filters:{…}}` | `{ok, rows[]}` — **writes an audit row "downloaded"** |
| POST `/api/audit_log/backfill` | 7478 | **master_admin only** | — | `{ok,totalWritten,…}` — scans every table of every company; web-only |

No PUT/DELETE exists: the trail is immutable through the API (7433).

### 2.5 Subscriptions (subscriptions.js)

Permissions: `permissions(req)` (subscriptions.js:252–263) resolves the actor from
`body.performedById|body.actorId|query.actorId|query.performedById`. Read = admin roles or
`tenant.subscriptionAccess` grant; write = it_admin/super/ceo/coo/master. Rows filtered to the
actor's tenant (untenanted rows visible to all; master sees all).

| Method path | Line | Request | Response |
|---|---|---|---|
| GET `/api/subscriptions` | 625 | `?actorId=` | `{ok, subscriptions:[publicSub], canManage, periods[], statuses[]}`; `publicSub` (subscriptions.js:271): `id,name,department,plan,period,periodLabel,status,statusLabel,accountEmail,loginUrl,amountInr,amountUsd,monthlyInr,yearlyInr,renewalDate,daysToRenewal,payee,paymentMode,kekaCode,kekaMissing,owner,comments,createdByName,updatedAt,updatedByName` |
| GET `/api/subscriptions/summary` | 481 | `?from&to&actorId` | `{ok, totals:{activeCount,notUsingCount,cancelledCount,monthlyInr,yearlyInr,wastedMonthlyInr,wastedYearlyInr,kekaMissingCount,spendInRangeInr,spendInRangeUsd,paymentsInRange}, byDepartment:[…], byMonth:[{month,amountInr}], range}` |
| GET `/api/subscriptions/payments` | 494 | `?from&to&actorId` | `{ok, payments:[{id,subscriptionId,name,department,plan,paidOn,amountInr,amountUsd,kekaCode,kekaMissing,comments,source}], canManage}` |
| POST `/api/subscriptions` | 644 | `{name*,department,plan,period,status,accountEmail,loginUrl,amountInr,amountUsd,renewalDate,payee,paymentMode,kekaCode,owner,comments}` | `{ok, subscription}`; audit row |
| PUT `/api/subscriptions/:id` | 661 | same, partial (omitted keep old) | `{ok, subscription}`; audit row; **no same-tenant check** |
| DELETE `/api/subscriptions/:id` | 684 | — | `{ok, deleted}`; payments kept; audit row |
| POST `/api/subscriptions/payments` | 511 | `{name*, paidOn*, subscriptionId, department, plan, period, amountInr, amountUsd, kekaCode, comments}` | `{ok, payment}`; audit row |
| DELETE `/api/subscriptions/payments/:id` | 529 | — | `{ok, deleted}`; irreversible; audit row |
| POST `/api/subscriptions/import` | 549 | `{subscriptions[], payments[]}` (already parsed rows) | counts; payments **not de-duplicated** — re-import doubles spend. Web-only. |

No notifications are sent by this module.

### 2.6 Master Admin — companies

| Method path | File:line | Role check | Request | Response | Side effects / danger |
|---|---|---|---|---|---|
| GET `/api/tenants` | routes/tenants.js:30 | master sees all rows | — | array | — |
| POST `/api/tenants` | routes/tenants.js:31 | **none beyond sign-in** (see 2.9) | `{name*, maxUsers, superAdmin, superAdminName, address, tax, bountyEnabled}` (`id` optional) | `{ok, tenant}` | audit row |
| POST `/api/whitelist` (super admin invite) | routes/whitelist.js:87 | master is a role-assigner | `{email, name, role:'super_admin', tenantId, status:'active', source:'system'}` | `{ok, entry}` | **welcome email** |
| PUT `/api/tenants/:id` | routes/tenants.js:53 | `USER_ADMIN_ROLES` | `{name, superAdmin, address, tax, maxUsers, status}` | `{ok}` | audit row |
| DELETE `/api/tenants/:id` | routes/tenants.js:163 | **none beyond sign-in** (see 2.9) | — | `{ok}` | **Cascades and permanently deletes** bookings, slot locks, tasks, tickets, reviews, departments, rooms, locations, projects, clients, assets, whitelist, upload batches, support data, announcements, every user, then the tenant. No undo. |
| DELETE `/api/tenants/:id/data` | routes/tenants.js:259 | `DESTRUCTIVE_ROLES` | `?keepEmail=` | `{ok}` | Purges everything but the tenant and one super admin. Not used by the web UI. |
| GET `/api/users` (all tenants for master) | routes/users.js:108 | — | — | array | used to compute real user counts per tenant |

### 2.7 Master Admin — wallets (server.js)

| Method path | Line | Role check | Request | Response | Side effects / danger |
|---|---|---|---|---|---|
| GET `/api/bounty/wallet/company?tenantId=` | 5032 | `assertSameTenant` (master any) | — | `{id, tenantId, name, totalAdded, totalDistributed, available}` (no `ok` when the row exists; `{ok,…}` default) | — |
| POST `/api/bounty/company/add-coins` | 5044 | actor must be `master_admin` (re-read from DB) | `{tenantId, amount>0 (integer), reason}` | `{ok, transaction,…}` | **Credits real coins** via RPC `bounty_add_company_coins`; audit row. Reversible only while unused. |
| GET `/api/bounty_transactions?type=COMPANY_CREDIT&tenantId=&dateFrom&dateTo&direction` | 5506 | overseer roles see company/all; master may filter by tenantId | — | bare array `[{id,createdAt,type,amount,performedBy,reason,reversedAt,toWalletName,fromWalletId,toWalletId,status}]` | — |
| POST `/api/bounty_transactions/:id/reverse` | 5241 | COMPANY_CREDIT: master only | `{reason}` | `{ok,…}` | Takes the coins back (RPC `bounty_reverse_company_credit`); fails if any were distributed; audit row. |

### 2.8 Master Admin — features (routes/tenants.js, hr.js)

| Method path | Line | Role check | Request | Response | Side effects |
|---|---|---|---|---|---|
| PUT `/api/tenants/:id {featureFlags:{id:bool}}` | routes/tenants.js:53, 67–96 | master only (others stripped) | one key per toggle | `{ok}` | merged; audit `permission_granted/revoked` per changed flag; feature disappears for everyone in that company (website nav, mobile More menu) |
| PUT `/api/tenants/:id {bountyEnabled}` | same | `USER_ADMIN_ROLES` | | `{ok}` | |
| GET `/api/hr/admin/tenants/:tenantId/access` | hr.js:486 | master only | — | `{ok, enabled, modules, catalogue:[{id,label,group,available,desc}]}` (catalogue = `HR_MODULES` hr.js:50) | — |
| PUT `/api/hr/admin/tenants/:tenantId/access` | hr.js:494 | master only | `{enabled:bool, modules?}` (on with no modules ⇒ `['attendance']`) | `{ok, enabled, modules}` | upsert `hr_tenant_access`; audit row; turning HR off hides every HR feature for the company |

### 2.9 Server issues noticed (not blockers — owner decision; no change made)

1. `POST /api/tenants` and `DELETE /api/tenants/:id` (routes/tenants.js:31, 163) have **no role
   check**: any signed-in employee can create a company or cascade-delete one. Fix would be
   `requireRole(['master_admin'], …)` on both. The app must only show these to master admin and
   should keep Delete web-only regardless.
2. `DELETE /api/whitelist/:id` (routes/whitelist.js:218) has no role or tenant check.
3. `PUT /api/tenants/:id`, `PUT /api/whitelist/:id`, `PUT/DELETE /api/subscriptions/:id` have no
   same-tenant check (an admin in company A could edit company B by id).
4. `POST /api/whitelist` takes `tenantId` from the body (not `ownTenantId`).
5. Cosmetic: tenant `users` count never maintained; `status:'suspended'` and `maxUsers` not
   enforced; "Reset Super Admin Password" is a no-op; audit Backfill button shown to Super Admin
   but refused by the server; Overrides has no screen.

---

## 3. What the mobile app has today, and the gaps

Existing pieces this domain reuses:
- `src/lib/access.ts` — `ROLE_LABEL`, `HR_SYSTEM_ROLES`, `tenantFeatureOn`, `LEADERSHIP_ROLES`
  (`['super_admin','ceo','coo']`, defined but unused for admin screens).
- `src/lib/use-access.ts` — user + `/hr/me` + own tenant (`feature(id)`).
- `src/api/me.ts` — `Tenant` type, `useMyTenant()` (GET `/tenants`, **disabled when the user has no
  tenantId**, so master admin never loads tenants today).
- `src/api/client.ts` — `api.get/post/put/del`, `withActor`, `unwrap`; 30 s timeout already set for
  `/audit_log` and `/bounty`.
- `src/features/more/menu.ts` — `NAV` gives `master_admin: []` and leadership only
  accounts/bounty/news/support; grid capped at 9 tiles.
- `src/app/(app)/(tabs)/more.tsx`, `index.tsx` (Home: `TodayHero` for system roles, `NeedsYouCard`
  already shows `/my_pending_otps` codes), `inbox.tsx` (leadership approvals already work).
- People: `src/app/(app)/people/*`, `src/api/people.ts` (GET `/org/directory`, `/departments`) —
  usable as the person picker for grant lists.
- Files: `src/lib/files.ts` `saveDataUrl` + `shareFile` (CSV export), `pickImage`.
- Kit `@/ui`: `NavHeader`, `Screen`, `SummaryHero`, `StatGrid`/`StatTile`, `Numeral`, `ListCard`/
  `ListRow`/`GroupedRow`, `ActivityList`/`ActivityRow`, `MetricRow`, `Segmented`, `ChipRow`,
  `PillSelector`, `PillField`, `TextField`, `SelectField`, `DateField`, `Sheet`, `MenuSheet`,
  `ConfirmSheet`, `SwipeToConfirm`, `SuccessSheet`, `SummaryCard`, `KeyValueList`, `StatusPill`,
  `AmountEntry`/`useAmountKeypad`, `HairlineBars`/`BarStrip`, `StripedProgress`, `EmptyState`,
  `ErrorState`, `SkeletonList`, `Banner`, `ToastHost`. React Native `Switch` (as in
  `features/attendance/clock-card.tsx`) for toggles inside `ListRow`.
- Demo: `src/demo/personas.ts` has **Afzal Super Admin** and **Afzal Master Admin**; no CEO/COO
  persona (by design). `src/demo/fixtures/org.ts` serves one `TENANT` and `GET /tenants`,
  `/users`, `/departments`; `src/demo/fixtures/bounty.ts:571` serves `/bounty_transactions`.

Gaps (nothing below exists in the app): no `src/api` module for tenants/whitelist/users-admin,
audit, subscriptions, dashboard summary, company wallet, HR tenant/department access, team-roster
access; no admin screens; no `FEATURE_REGISTRY` copy; no master-admin tenants query; demo has no
whitelist, audit, subscriptions, multi-company or wallet fixtures, and its `PUT /users/:id` only
allows self-edit.

---

## 4. Mobile design proposal

### 4.1 Navigation

- **More → new "Admin" section** (a `SectionHeader` + one frosted `ListCard` of `ListRow`s with
  `ModuleBadge`s) placed between the Apps grid and "Attendance". It does not touch the 9-tile grid.
  Built in `features/more/menu.ts` as `menu.admin: MenuItem[]` with the website's gates:
  - Company dashboard — super_admin, ceo, coo.
  - Users — super_admin, ceo, coo, and `tenantFeatureOn('users')`.
  - Company settings — super_admin, ceo, coo, and `tenantFeatureOn('config')`.
  - Activity audit — super_admin always; anyone in `tenant.auditAccess` (userId / empNo match,
    as `canSeeAuditNav`); and `tenantFeatureOn('audit')`.
  - Subscriptions — `SUBSCRIPTION_ADMIN_ROLES` (excluding master) or a `subscriptionAccess`
    grant; and `tenantFeatureOn('subscriptions')`.
- **Master admin** gets a "Platform" section in More instead: Companies, Company wallets, Company
  features. Home for master admin: a `SummaryHero` "Companies on DASH" (count) with info chip
  "Total users N" (from GET `/users` counted per tenant) and three `ListRow` shortcuts. Add a
  `useAllTenants()` query (GET `/tenants`, enabled for master_admin) next to `useMyTenant`.
- **Home for super_admin/ceo/coo**: under `TodayHero`, a "Company at a glance" `StatGrid` of the
  four `/dashboard/summary` numbers (tap → the drill-in screens below). This is the phone version of
  `SAHome`; the Bounty toggle moves to Company settings.
- New routes (expo-router, `src/app/(app)/admin/...` and `src/app/(app)/platform/...`):
  `admin/index` (dashboard), `admin/users`, `admin/settings/index`, `admin/settings/access/[list]`,
  `admin/settings/hr`, `admin/settings/team-roster`, `admin/audit/index`, `admin/audit/[id]`
  (or a detail Sheet), `admin/subscriptions/index`, `admin/subscriptions/[id]`,
  `platform/companies/index`, `platform/companies/[id]`, `platform/wallets`, `platform/features`.
  Each screen re-checks its gate and `Redirect`s home when the person lacks it (as other screens do).

### 4.2 Screens

**A. Company dashboard** (`admin/index`) — S
- `NavHeader` "Company". `StatGrid` of Users, Departments, Active tasks, Pending bookings
  (`Numeral`s; skeletons while loading; `ErrorState` with retry).
- Users tile → Users screen (A→B). Departments tile → a `Sheet` list of departments with member
  counts (from `/departments` + `/users`). Active tasks / Pending bookings → their module screens
  when the Tasks/Booking port lands; until then the tile shows the number only (no 1.3 MB fetch).
- Pull to refresh.

**B. Users** (`admin/users`) — M
- `NavHeader` "Users" with a "+" action (Provision). Search `PillField`; `ChipRow` filter: All /
  Active / Pending signup / by role. `FlashList` of `ActivityRow`s: avatar initials, name, role
  label (`ROLE_LABEL`), email muted, `StatusPill` (Active / Pending signup).
- Tap → `Sheet` with a `SummaryCard` (email, role, status, branch for displays) and actions:
  - **Change role** → `SelectField` (the website's 9 roles + Accounts, minus Super Admin), Branch
    `SelectField` when "Announcements (Display)". Confirm with a plain primary button (reversible).
    Calls PUT `/users/:id` and/or PUT `/whitelist/:id` like the web. Hide for own row and
    `super_admin` rows ("Company owner").
  - **Remove access** → `ConfirmSheet` (from "Name" → "Removed", details: "Their account and
    invitation are deleted. This cannot be undone.") + **SwipeToConfirm**. DELETE `/users/:id`
    (only offered to `DESTRUCTIVE_ROLES`) then DELETE `/whitelist/:id`.
- **Provision** `Sheet`: Full name, Work email, Role `SelectField`, Branch (display role). Before
  posting, check the email against **both** `/users` and `/whitelist` (the server upserts
  silently and would change an existing person's role). Footer note: "They get a welcome email
  and can sign up on the website." `SuccessSheet` after.
- Never perform the web's `source:'system'` retro-tag writes.
- Empty: "No system users yet — tap + to add one." Error: `ErrorState`.

**C. Company settings** (`admin/settings`) — M overall (sum of parts)
Grouped `ListCard`s:
1. *Company* — `KeyValueList` of name, contact email, phone, address with "Edit" → `Sheet` form
   (PUT name/superAdmin/address/phone). Warn in the sheet that "Contact email" is the company's
   Super Admin email on record. S
2. *Switches* — `ListRow` + `Switch` for Bounty coins (`bountyEnabled`), Org directory
   (`orgEnabled`), App Manager can approve bounties (`appManagerBountyApprovalsOn`), Team Roster
   (`teamRosterEnabled`). Optimistic toggle, revert + toast on error, invalidate `['tenants']` so
   the More menu updates. Turning **off** Bounty or Org shows a small confirm (`Alert`) because it
   hides a module for the whole company. S
3. *Visitors* — approval wait / photo retention steppers (validate 1–240, 1–365). S
4. *Who can…* — rows "Post news", "Create bounty tasks", "Create projects", "Open the activity
   audit", "View subscriptions" each showing a count → `admin/settings/access/[list]`: list of
   grantees (`ActivityRow` + Remove with confirm), "Add person" opens a people picker `Sheet`
   (search over `/users` + `/whitelist` of my tenant, deduped by email). For `auditAccess` each
   grantee row expands to four `Switch`es (view logs, search people, view detail, download).
   Always PUT the full array (server replaces it). M
5. *Bounty earning cap* (super_admin only) — number field. S
6. *HR by department* (super_admin only; when `/hr/me.canConfigure`) → `admin/settings/hr`: list of
   departments with `Switch`, tap → `Sheet` of the company's granted modules as checkboxes.
   "Enable all / Disable all" via `MenuSheet` with confirm. Disabling a department →
   `ConfirmSheet` ("Clock-in, leave and pay requests stop for N people"). M
7. *Team Roster by department* (super_admin) → list with `Switch` per department (disabled with a
   hint when there is no department admin); disabling uses the website's confirm text. S
8. *Platform limits* — read-only `StripedProgress` "N / max seats". S

Web-only (with a `Banner` "Change these on the website"): Branding logo and Report logo
(transparent PNG at exact sizes; `pickImage` re-encodes to JPEG and drops transparency),
Professional Categories (multi-column table editing), TV displays / display devices (other doc).

**D. Activity audit** (`admin/audit`) — L
- `SummaryHero` "Activity" with total and info chip "N today · M people active"; a `StatGrid` row
  for Bookings / Service requests / Profile changes / Downloads (collapsible).
- `Segmented`/`ChipRow` of `AUDIT_TABS`. `PillSelector`s: date preset (Today, Yesterday, 7 days,
  30 days, Custom → two `DateField`s), "Filters" → `Sheet` (module, action, department, role,
  status, search). "Find a person" `PillField` → debounced user-search (unwrap the object quirk) →
  person header card (employee ID, department, title, total) with "Clear".
- List: `FlashList` with day section headers (`SectionHeader` "21 OCT 2026"), `ActivityRow`
  (actor, description 2 lines, action `StatusPill` tinted by `auditActionClass` mapping to
  `statusTone`). Infinite scroll (page 1..n, pageSize 30) instead of the numbered pager.
- Tap → detail `Sheet`: `SummaryCard` (actor + role, affected user, module, action, entity, time,
  IP, status) and a "What changed" `KeyValueList` showing before → after per key (only keys that
  differ first).
- Export: "Share as CSV" in the header `MenuSheet`, only with `downloadReports` (super/master or
  grant). POST `/audit_log/export`, build CSV with the website's 16 columns, `saveDataUrl` +
  `shareFile`. Tell the person "This download is recorded in the audit log." Excel/PDF and
  Backfill stay web-only.
- Empty: "No activity matches these filters." Error: `ErrorState`. Denied (403): `EmptyState`
  with the server's message.

**E. Subscriptions** (`admin/subscriptions`) — L
- Renewal `Banner` (overdue red / due in 30 days amber) with up to 3 names and "See all".
- `Segmented`: Overview · Subscriptions · Payments. `PillSelector` for range (This FY / This month /
  All time / Custom).
- Overview: `SummaryHero` "Per month ₹…" (info chip "₹… a year"), `StatGrid` (Active, Not using
  ₹/mo, Spent in range, Missing Keka code), "By department" `MetricRow`s, "Month by month"
  `HairlineBars`/`BarStrip`.
- Subscriptions: search + department/status chips, `ActivityRow` per subscription (name, dept ·
  plan, amount + period, renewal chip). Tap → `admin/subscriptions/[id]` `SummaryCard` of every
  field; "Open login page" (`Linking.openURL`), copy account email; Edit / Delete for `canManage`.
- Payments: list for the range, total in the header; Delete for `canManage` (`ConfirmSheet` +
  `SwipeToConfirm`, irreversible).
- Add/Edit `Sheet` (`TextField`, `SelectField` for period/status, `DateField` renewal, amounts) and
  "Record payment" `Sheet` (pick subscription → prefill, date, amounts). Delete subscription →
  `ConfirmSheet` "Payment history is kept" + SwipeToConfirm.
- Read-only grantees see no add/edit/delete. 403 → `EmptyState` with the server's message.
- Web-only: Excel import (SheetJS parsing, preview) and 3-sheet Excel export; offer "Share as CSV"
  of the visible list instead (optional).

**F. Companies** (master; `platform/companies`) — M
- `SummaryHero` "Companies" count. List of `ActivityRow`s: logo initials, name, super-admin email,
  users N / max (computed from GET `/users` by `tenantId`, since `tenant.users` is always 0),
  `StatusPill` Active/Suspended, chip "Bounty on".
- Detail `platform/companies/[id]`: `SummaryCard` + Edit `Sheet` (name, super-admin email, address,
  tax ID, max users, status). Note under status: "Suspended is a label only today; it does not
  block sign-in." Links: "Features for this company" (→ G with it selected), "Wallet" (→ H).
- "Register company" `Sheet` (name, max users, super-admin name + email, tax, address, bounty
  switch) → POST `/tenants` then POST `/whitelist` (role super_admin, `tenantId` from the response).
  `SuccessSheet`: "Invite sent to … — they sign up on the website."
- **Delete company: web-only** (irreversible ~20-table cascade, unguarded endpoint). Detail screen
  shows a muted line "To delete a company use the website."
- Do not port "Reset Super Admin Password" (no-op) or Overrides (no screen).

**G. Company features** (master; `platform/features`) — M
- `PillSelector` company picker. `Banner` "N features off for this company".
- Card "HR (HRMS)" with a `Switch` and, when on, module checkboxes grouped by Time/People/Payroll
  (unavailable greyed) — GET/PUT `/hr/admin/tenants/:id/access`. Turning HR off → `ConfirmSheet`.
- One `ListCard` per registry group with a `Switch` row per feature (label + "On/Off"). Turning a
  feature **off** → `Alert` confirm "Hides X for everyone at <company>". `bounty` writes
  `bountyEnabled`, the rest `featureFlags:{id}`. Needs `FEATURE_REGISTRY` copied into
  `src/lib/access.ts` (ids/labels/groups, dash.html:1373–1399) so the menu and this screen share it.

**H. Company wallets** (master; `platform/wallets`) — M
- Company `PillSelector`. `SummaryHero` "Available coins" (`Numeral`), info chip "Added N ·
  Distributed M".
- Primary pill "Add coins" → `AmountEntry` + `useAmountKeypad` (integer only) + reason
  `TextField` → `ConfirmSheet` (from "Platform" → "<Company> wallet", amount) + **SwipeToConfirm**
  → `SuccessSheet`.
- "Company credits" `ActivityList` (date, +amount, performed by, reason; "Cancelled" pill). Row tap
  → `Sheet` with "Cancel this credit" (`ConfirmSheet` + SwipeToConfirm; server refuses if any coins
  were used — show its message).
- "All companies" toggle shows every COMPANY_CREDIT (no tenantId). Excel/PDF report: web-only.

### 4.3 Shared states and patterns
- Loading: `SkeletonList`/`Skeleton`. Errors: `ErrorState` with retry. 403s: `EmptyState` with the
  server text (it already says who can grant access).
- Irreversible actions (remove user, delete payment/subscription, add/cancel coins, HR off for a
  department/company) → `ConfirmSheet` + `SwipeToConfirm` (accessible button fallback built in).
  Reversible switches → immediate with toast + undo-by-toggling.
- After any tenant write invalidate `['tenants']` (and `['hr-me']` after HR config) so `useAccess`
  and the More menu refresh.
- New API modules: `src/api/admin.ts` (dashboard summary, users/whitelist admin, tenant PUT, HR
  config, team roster), `src/api/audit.ts`, `src/api/subscriptions.ts`, `src/api/platform.ts`
  (tenants list/create, wallet, credits, reverse, HR tenant access). Typed, TanStack Query, header
  comments citing server lines like the existing modules.

### 4.4 Stays web-only (and why)
| Feature | Why |
|---|---|
| Logo / report-logo upload | Needs transparent PNG at fixed sizes; the app's image path re-encodes to JPEG. |
| Professional Categories editor | Multi-column time/gap table; rare, desktop task. |
| Audit Excel/PDF + "Complete report" + Backfill | Letterhead SheetJS/jsPDF exports; backfill is a platform-wide master job. CSV share covers the phone need. |
| Subscriptions Excel import / Excel export | Spreadsheet parsing with preview; desktop task. |
| Delete company / purge company data | Irreversible cascade; endpoint unguarded server-side. |
| Wallet Excel/PDF report | Spreadsheet output. |
| TV / kiosk display pairing, Overrides, Reset Super Admin Password | Other doc / no real feature behind them. |

---

## 5. Expo Go feasibility (SDK 57)

- **No native module needed.** Everything is lists, forms, switches and JSON calls.
- CSV export: `expo-file-system` + `expo-sharing` (both already in mobile/package.json and used by
  `src/lib/files.ts`; Expo docs v57 list expo-sharing as "Included in Expo Go", local-file sharing
  works on Android and iOS).
- Open subscription login URL: `Linking` (react-native) / `expo-web-browser` (already present).
- Copy email to clipboard would need `expo-clipboard` (in Expo Go, but **not** in package.json) —
  optional; skip it or use the system share sheet (`Share` from react-native) instead.
- **No new JS dependency.** CSV is built by hand (escape `"`/`,`/newline as the web does). Excel
  would need SheetJS — deliberately not added.
- No camera, QR, WebRTC or Google sign-in in this domain.

---

## 6. Demo fixtures

Personas: **Afzal Super Admin** (covers Super Admin; CEO/COO behave the same except audit is
hidden unless granted, no earning-cap card and subscriptions sit last) and **Afzal Master Admin**.
New file `src/demo/fixtures/admin.ts` (+ `platform.ts`), registered in `src/demo/server.ts`;
add `whitelist` to `LIST_ROUTE`.

Super Admin (`demo-super-admin`):
- Add system users to `PEOPLE` (or a separate `SYSTEM_USERS` merged into GET `/users` only, since
  `/org/directory` drops console roles): e.g. HR lead (hr), IT admin (it_admin), Accounts (accounts),
  App manager (app_manager), Lobby TV (announcement_viewer, location Hyderabad), Reception
  (visitor_manager); Kiran Rao (ceo) and Arvind Menon (coo) already exist.
- `WHITELIST` store: those people's invitations plus 2 pending (e.g. a new manager, a new admin).
  Routes: GET `/whitelist`, POST `/whitelist` (upsert by email, role kept only for role-assigners),
  PUT/DELETE `/whitelist/:id`.
- Extend PUT `/users/:id` in org.ts: when the persona is a role-assigner and the id is not self,
  allow `role`/`location` on another person; DELETE `/users/:id` for `DESTRUCTIVE_ROLES`.
- GET `/dashboard/summary` from the live stores (users count, `DEPARTMENTS.length`, active tasks
  from fixtures/tasks.ts, pending bookings e.g. 3).
- PUT `/tenants/:id`: merge into `TENANT` (deep-merge `featureFlags`, drop it unless master, drop
  `bountyMonthlyEarnCap` unless super/master); seed `TENANT.auditAccess` with one grantee,
  `subscriptionAccess` with one, `announcementCreators`/`projectCreators` with one each, `phone`,
  `superAdmin`, `maxUsers: 60`, `visitorApprovalTimeoutMin: 10`, `visitorPhotoRetentionDays: 30`.
- GET `/hr/config/overview` (every module granted; Creative, Production, Marketing on; Leadership
  off), PUT `/hr/config/departments[/:id]`; GET `/team-roster/departments` (global off, counts),
  PUT `/departments/:id`.
- Audit: ~60 generated rows over the last 30 days across all `AUDIT_TABS` types and actions
  (leave approved, profile updated, booking created, feature toggled, report downloaded, one
  `failed`), with `previousData/newData` on the updates. GET `/audit_log` (filters + paging),
  `/audit_log/summary`, `/audit_log/user-search` (return the spread-object shape the real server
  returns, so the unwrap is exercised), `/audit_log/user/:id`, POST `/audit_log/export` (append a
  "downloaded" row). Writes from other demo fixtures need not log.
- Subscriptions: ~10 (Adobe CC, Canva Pro, Frame.io, Google Workspace, ChatGPT Team, Midjourney
  not_using, Dropbox cancelled, one with no Keka code, one overdue renewal, one due in 5 days) and
  ~25 payments over the FY. All 9 routes; compute `summary` with the same formulas
  (subscriptions.js `runRate`/`summarise`) — copy them into the fixture.

Master Admin (`demo-master-admin`):
- GET `/tenants` returns 3 companies when the persona is master (Tamada Media (Demo), "Nexus
  Productions" with bounty off and two flags off, "Lumen Studios" suspended); otherwise just
  `TENANT`. POST `/tenants`, PUT `/tenants/:id` (featureFlags allowed).
- GET `/users` for master: all companies' people (add ~6 users to the other two tenants).
- GET/PUT `/hr/admin/tenants/:id/access` with the `HR_MODULES` catalogue.
- Wallets: GET `/bounty/wallet/company?tenantId`, POST `/bounty/company/add-coins` (adds a
  COMPANY_CREDIT row and raises `totalAdded/available`), GET `/bounty_transactions?type=COMPANY_CREDIT`
  (extend bounty.ts:571 to honour `type` and `tenantId`), POST `/bounty_transactions/:id/reverse`
  (refuse when `amount > available` with the server's wording). 4 seeded credits, one cancelled.
- Update docs/DEMO-ACCOUNTS.md rows for both personas ("What to try": flip a feature off and see
  the menu change after switching to Afzal Super Admin; add coins with the swipe).

---

## 7. Effort and risks

| Screen | Effort |
|---|---|
| More "Admin"/"Platform" sections + gates + `FEATURE_REGISTRY` in access.ts | S |
| Company dashboard (A) + Home "Company at a glance" | S |
| Users (B) | M |
| Company settings (C) — company info, switches, visitors, cap, limits | S |
| Settings — "Who can…" grant lists (5 lists, audit permissions) | M |
| Settings — HR by department | M |
| Settings — Team Roster by department | S |
| Activity audit (D) incl. CSV share | L |
| Subscriptions (E) | L |
| Companies (F) | M |
| Company features (G) | M |
| Company wallets (H) | M |
| Demo fixtures (admin.ts + platform.ts) | M–L |

Risks:
- **Company-wide blast radius.** Settings and feature switches change what every employee sees;
  a stray tap on a phone is likelier than on desktop. Mitigate with confirm on every "off".
- **Grant lists are replaced wholesale** by PUT `/tenants/:id`: the app must start from the
  freshest tenant row (refetch before editing) or it can drop a grant another admin just added.
- **POST /whitelist upserts silently** and can change an existing person's role; the app must
  pre-check both lists.
- **Unguarded server routes** (2.9): the app must never surface tenant create/delete or whitelist
  delete to roles that are not meant to have them, since the server will not stop them.
- Audit list relies on an **estimated** total — use infinite scroll, not "page X of Y".
- `/audit_log/user-search` returns an object, not an array (unwrap needed).
- Subscriptions data can be large for master admin (all tenants); fine for now.
- Master admin has no tenant: anything reading `useMyTenant()` must not assume one (current
  `enabled: !!tenantId` guard already holds).
- Leadership roles also expect Roster, Departments, Projects, Booking, Reports, Service Desk on
  the website menu — those ports live in other docs; until they land, the dashboard tiles for
  tasks/bookings show numbers only.
