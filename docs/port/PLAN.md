# DASH mobile: master plan for porting the website-only features

Tech-lead plan that merges the ten domain specs in this folder:
[manager-work](manager-work.md), [team-ops](team-ops.md), [hr-people](hr-people.md),
[hr-setup-payroll](hr-setup-payroll.md), [accounts](accounts.md), [leadership-admin](leadership-admin.md),
[it-admin](it-admin.md), [visitor-desk](visitor-desk.md), [meets](meets.md), [signin-push](signin-push.md).
It also draws on `docs/DEMO-ACCOUNTS.md`, `src/lib/access.ts`, `src/features/more/menu.ts` and
`src/demo/personas.ts`. This file is a plan only. No app, server or database code was changed.

**Headline**
- Everything except **push notifications** runs on endpoints that already exist. No server or DB change is needed for any screen.
- Everything except **calls (WebRTC), Google sign-in and remote push** runs in **Expo Go SDK 57**.
- Calls, Google sign-in and remote push need a **development build** plus owner decisions (section 3).
- The kit rule is "no new dependencies". About five optional Expo Go packages need a yes or no (D4).

Effort scale, as in the domain docs: **S** is about half a day to 1 day, **M** is 2–3 days, **L** is 4–6 days. Each includes its demo fixtures.

---

## 1. Feature matrix

"Endpoints" means the server routes the feature needs already exist. "Scope" says how much of the website feature the app gets:
- **full**: the whole feature;
- **simplified**: a phone-shaped version;
- **view**: read-only;
- **web**: stays on the website (section 4).

The "Agent" column names the owning domain in section 2; the number after it is the wave.

### 1.1 Managers and Admins
| Feature | Roles | Endpoints | Scope | Expo Go | Effort | Agent |
|---|---|---|---|---|---|---|
| Team tasks list/detail/edit/delete | admin, manager, app_manager | yes | full | yes | M | work·1 |
| Assign a task (+ sheet) with `assigneeId/managerId/createdBy` | same | yes | full | yes | M | work·1 |
| Review submitted tasks (Inbox `task`) | same | yes | full | yes | M | work·1 |
| Time corrections (Inbox `timefix`) | same | yes (queue empty: no tenantId on server) | full, hidden when empty | yes | S | work·1 |
| Projects (Keka codes): list, add, edit, deactivate | super_admin + Config project creators (not CEO/COO for create) | yes | simplified (no bulk xlsx, no delete) | yes | M | work·1 |
| Clients | roles with clients nav; filtered to "added by me" | yes | full (no CSV upload) | yes | S | work·1 |
| Manager Home cards (Team today, Tomorrow + share text) | manager, admin | yes | simplified | yes | S | work·1 |
| Book a professional (slot hold, availability) | booking roles | yes | full (no "extend shoot") | yes | L | booking·1 |
| Book a room (48-slot grid) / a location | booking roles | yes | full | yes | L | booking·1 |
| My bookings, cancel, approve completed (`bkdone`), rate (`bkrate`) | requester | yes | full | yes | M | booking·1 |
| Booking approvals (Inbox `booking`), reject deletes linked task | admin, manager, app_manager + `requests` switch | yes | full | yes | M | booking·1 |
| Requests tracker (history tabs) | same | yes | view | yes | S | booking·1 |
| Pending reviews monitor + WhatsApp reminders | app_manager | yes | simplified (no PDF) | yes | S | booking·1 |
| Team board (Team Roster: projects, works, timed tasks, teams, managers) | dept admin/manager via `canSeeTeamRosterNav`, tenant `teamRosterEnabled` | yes (24 routes) | full | yes | L | teamboard·2 |
| My team tasks (assignee, start/pause) | assignees | yes | full | yes | M | teamboard·2 |
| Reports (People, Projects, Codes, Month) + CSV | roles with `reports` + switch | yes (computed on the phone from `/tasks`) | simplified (no xlsx, grid as CSV) | yes | M | insights·2 |
| Device monitoring (TM360) | admins all; managers own team, read-only | yes | full (no Excel) | yes | M | insights·2 |
| Service desk (role slices, accept & assign, reject, status) | it_admin, admin, app_manager, super_admin, hr; CEO/COO read-only | yes | full (no export, no delete) | yes | L | servicedesk·1 |
| Raise a ticket for someone | it_admin | yes | full | yes | M | servicedesk·1 |
| Resource requests, "Mark as leave", Assign Work page | — | **no route / dead** | not ported | — | — | — |

### 1.2 HR
| Feature | Roles | Endpoints | Scope | Expo Go | Effort | Agent |
|---|---|---|---|---|---|---|
| Employee roster: add, edit, email change, resign/rejoin, remove, role | super_admin, ceo, coo, admin, hr, it_admin, app_manager | yes | full (no bulk upload/update) | yes | L | people·1 |
| Departments | super_admin, ceo, coo, hr | yes | full | yes | M | people·1 |
| Profile modal (HR editing someone else) | HR admins | yes | full | yes | S | people·1 |
| Office TVs (pair by 6-digit code) | super_admin, ceo, coo | yes | simplified (no playlist editor) | yes | S | newsroom·2 |
| Offices and geofence, clock-in rules, company policy | super_admin, hr (+ HR module) | yes | simplified ("use where I'm standing", no map) | yes | M | hrtime·1 |
| Shifts and assigning people | same | yes | full | yes | M | hrtime·1 |
| Holidays | same | yes | full | yes | S | hrtime·1 |
| Leave types, rules, balances, adjustments, carry forward | same | yes | simplified (no people × type grid) | yes | M | hrtime·1 |
| Write and publish policies | same | yes | full | yes | M | hrtime·1 |
| Payroll runs, line edits, lock (typed `LOCK YYYY-MM`), CSV register | super_admin, hr + `payroll` module | yes | simplified (register as CSV) | yes | L | payroll·2 |
| Salaries, tax profiles | same | yes | full | yes | M | payroll·2 |
| Salary structures, statutory/TDS | same | yes | view | yes | S | payroll·2 |
| Job openings, candidates, referral pipeline | job-opening creators; app_manager view | yes | full | yes | L | hiring·2 |
| Refer & earn (open jobs, my referrals) | everyone on `referrals` nav | yes | full | yes | M | hiring·2 |
| News studio: post, schedule, pop-up, TV priority, celebrations | announcement creators (incl. it_admin) | yes | full (keeps TV priority on edit) | yes | L | newsroom·2 |
| Bounty admin: tasks, creators, redemptions, coin distribution | super tier, creators, hr; app_manager view | yes | full | yes | L | bountyadmin·2 |

### 1.3 Accounts
| Feature | Roles | Endpoints | Scope | Expo Go | Effort | Agent |
|---|---|---|---|---|---|---|
| "With Accounts" Inbox queue (petty cash, claims, vendor bills): authorize or reject | accounts (super_admin acts on vendor bills only) | yes | full | yes | M | accounts·1 |
| Accounts desk: stage counts, one queue, item detail | accounts, super_admin; CEO/COO reduced | yes | full | yes | M | accounts·1 |
| Payments: start processing, process again | accounts | yes | full (there is no "mark paid") | yes | S | accounts·1 |
| Vendor registrations + verification detail + checklist + approve/reject/corrections | accounts | yes | full (Digio check on first open) | yes | L | accounts·1 |
| Vendor master: bills, agreements, deactivate, bank change approval | accounts | yes | simplified (KPIs + 1 chart) | yes | M | accounts·1 |
| Agreements: list, extend deadline, countersign | accounts, overseers | yes | full | yes | M | accounts·1 |
| Agreements: draft and place signature spots | accounts | yes | phase 2 | needs `react-native-webview` (in Expo Go) | L | accounts·3 |
| Petty cash statements (reject a bill), tracking, expense heads, payment-timeline setting | accounts | yes | full | yes | M | accounts·1 |
| Petty cash ledger, Excel export, full print | — | yes | web | — | — | — |

### 1.4 Super Admin, CEO and COO
| Feature | Roles | Endpoints | Scope | Expo Go | Effort | Agent |
|---|---|---|---|---|---|---|
| Company at a glance (4 KPIs on Home) | super_admin, ceo, coo | yes | simplified | yes | S | company·1 |
| Users / system logins (provision, edit, delete, invites) | super_admin, ceo, coo + `users` switch | yes | full (checks both user lists before provisioning) | yes | M | company·1 |
| Config: feature switches, "Who can…" lists, HR by department, Team Roster access, visitor settings | super_admin, ceo, coo + `config` | yes | full (no logo upload, no professional categories) | yes | M | company·1 |
| Activity audit (filters, before/after, CSV share) | super_admin + `auditAccess` grants | yes | full (endless scroll, no PDF) | yes | L | company·1 |
| Subscriptions: overview, list, payments, add/edit (`?actorId=`) | subscription admins + grants (also IT Admin) | yes | full (no Excel import/export) | yes | L | company·1 |

### 1.5 IT Admin
| Feature | Roles | Endpoints | Scope | Expo Go | Effort | Agent |
|---|---|---|---|---|---|---|
| Assets: list, KPIs, detail, add, assign/return, approvals | it_admin + `assets` | yes | full (no bulk import, no "delete all") | yes | L | itdesk·2 |
| Rooms, locations, booking purposes, cancel a booking | it_admin + `rooms` | yes | full (photos only on detail) | yes | L | itdesk·2 |
| Support Centre admin (Wi-Fi, contacts, branches) | it_admin | yes | full (always sends `tenantId`) | yes | M | itdesk·2 |
| Subscriptions | see 1.4 | yes | full | yes | — | company·1 |
| Service desk, raise for someone | see 1.1 | yes | full | yes | — | servicedesk·1 |
| Asset tag scanning | it_admin | yes | optional | `expo-camera` (in Expo Go) | S | itdesk·3 |

### 1.6 Visitor Manager
| Feature | Roles | Endpoints | Scope | Expo Go | Effort | Agent |
|---|---|---|---|---|---|---|
| Desk Home ("In the building"), Inbox "At reception" | visitor_manager (super_admin: tile only) | yes | full | yes | S | desk·1 |
| Today's board: approve for host, check out | visitor_manager, super_admin | yes | full | yes | M | desk·1 |
| Visitor log (30 days) | same | yes | full | yes | M | desk·1 |
| Invites (Visitor Manager allowed) | same | yes | full | yes | S | desk·1 |
| QR code: show, share, regenerate | same | yes | full **if a QR encoder is approved** (D4); otherwise share the link only | yes | M | desk·1/3 |
| Kiosk mode (invite codes, self check-in, auto reset) | same | yes (public routes) | full; screen pinning is done by the phone's own App pinning or Guided Access | yes (+ `expo-keep-awake`) | L | desk·2 |
| Public `/visit/...` page, host WhatsApp approve page | — | — | web | — | — | — |

### 1.7 Master Admin
| Feature | Roles | Endpoints | Scope | Expo Go | Effort | Agent |
|---|---|---|---|---|---|---|
| Companies: list, detail, create, suspend | master_admin | yes (create/delete are unguarded on the server) | simplified (no delete) | yes | M | platform·3 |
| Company wallets: add coins, cancel a credit | master_admin | yes | full (no Excel/PDF) | yes | M | platform·3 |
| Company features (switches, HR access) | master_admin | yes | full | yes | M | platform·3 |
| Overrides | — | no screen on web | not ported | — | — | — |

### 1.8 Meets
| Feature | Roles | Endpoints | Scope | Expo Go | Effort | Agent |
|---|---|---|---|---|---|---|
| Conversations, new chat/group, thread, info, rename, live updates | every signed-in user | yes (28 routes, live updates over a stream) | full; .txt/.csv export | yes (Expo's built-in streaming fetch) | L (2–3 weeks) | chat·1 |
| Attachments | same | yes | full | yes | — | chat·1 |
| Voice notes | same | yes | full | `expo-audio` (in Expo Go), **new dependency** | M | chat·3 |
| Voice and video calls, incoming-call sheet | same | yes | full | **no**: development build + `react-native-webrtc` + TURN | L (2 weeks) | calls·3 |

### 1.9 Sign-in and push
| Feature | Roles | Endpoints | Scope | Expo Go | Effort | Agent |
|---|---|---|---|---|---|---|
| Staff forgot password (WhatsApp code) | staff | yes (4 public routes) | full | yes | M | signin·1 |
| Staff sign-up (approved-list email) | staff | yes | full | yes | S–M | signin·1 |
| Google sign-in | staff | yes (Firebase ID token) | full | **no** (Option A: development build). Option B needs a website redirect page | S code, L setup | signin·3 |
| Push notifications | everyone | **no**: needs the server change in D1 | full | **no** for remote push; local notifications work in Expo Go for the demo | M app + S–M server + M credentials | push·3 |

---

## 2. Build waves and strict file ownership

### 2.1 Ownership rules (every agent gets these)
1. **One domain, one agent, one set of paths.** A domain agent may create or edit only:
   - `src/app/(app)/admin/<domain>/**`;
   - `src/features/<domain>/**`;
   - `src/api/<domain>.ts`;
   - `src/demo/fixtures/<domain>.ts`;
   - the existing files explicitly assigned to that domain in 2.4.

   Exceptions to the route folder:
   - chat and calls use `src/app/(app)/chat/**` and `src/app/(app)/call/**`;
   - sign-in uses `src/app/(auth)/forgot.tsx`, `src/app/(auth)/signup.tsx` and the auth files assigned in 2.4.
2. **Anything shared is off-limits.** No agent edits these: `src/ui/**` (the kit), `src/lib/access.ts`, `src/lib/use-access.ts`, `src/features/more/**`, `src/features/create/**`, `src/features/inbox/**`, `src/features/home/**`, `src/features/tour/**`, `src/demo/server.ts`, `src/demo/state.ts`, `src/demo/personas.ts`, the existing `src/demo/fixtures/*.ts`, `src/app/(app)/_layout.tsx`, `src/app/(app)/(tabs)/**`, `src/app/(app)/inbox/**`, `package.json` and `app.json`. Those belong to the **integrator**.
3. **Plug in through the extension points from Wave 0.** Each domain fills its own:

   | File | Exports |
   |---|---|
   | `src/features/<domain>/nav.ts` | `workspaceRows(access)`, `createActions(access)`, `homeCards(access)` |
   | `src/features/<domain>/inbox.ts` | `inboxKinds: InboxKindPlugin[]` |
   | `src/features/<domain>/tour.ts` | `tourSteps(role)` |
   | `src/features/<domain>/access.ts` | the domain's gates, as pure functions ported from `dash.html` |

   The integrator has already imported every one of these files, as stubs, so a domain's work appears without any shared edit.
4. **Demo data.** A domain registers routes only from its own `fixtures/<domain>.ts`, which exports `<domain>Routes`. Routes registered there win over the built-in ones (`registerDemoRoutes`). To read or change existing demo state, call the exported stores and mutators from Wave 0. Never edit the original fixture file. If an export is missing, list it in the hand-off note; the integrator adds it between waves.
5. **No new dependency** unless D4 approves it. Only the integrator edits `package.json` and `app.json`.
6. **Safety rules for every screen:**
   - Every irreversible or messaging action uses `ConfirmSheet` and `SwipeToConfirm`, and says who gets emailed or WhatsApped.
   - Each screen re-checks its gate and `Redirect`s home when the person lacks it.
   - Copy the website's role rules exactly, because many write routes have no server-side role check.
   - Never port the website's "self-heal" or backfill writes.
   - Dates use IST.
   - Big or sensitive queries use `meta:{persist:false}`: bank details, salary, photos, base64.
7. **Hand-off note.** Each agent ends by writing `src/features/<domain>/HANDOFF.md`, a short checklist for the integrator, not a report. It lists:
   - the menu rows, create actions, Inbox kinds and tour steps it filled in;
   - any fixture exports, Stack options or dependencies it needs;
   - which personas it tested on.

### 2.2 Wave 0: integrator only, about 2 days, done in order
Wave 0 creates the extension points so that Waves 1–3 never touch shared files.

1. **More "Workspace"** (`features/more/menu.ts`, `workspace.ts`, `(tabs)/more.tsx`):
   - Add grouped list sections under the 9-tile grid: Work · People & HR · Money · IT & office · Company · Platform · Reception.
   - Each section is built from every domain's `workspaceRows(access)`.
   - This one pattern replaces the docs' separate proposals ("Work" tile, "Manage", "HR admin", "Accounts desk", "IT desk", "Admin", "Platform", desk tiles).
   - Keep "Chat & calls" and "Refer & earn" as plain links.
2. **Access** (`lib/access.ts`, `use-access.ts`, `api/me.ts` Tenant type):
   - Port the full `navForRaw` table (dash.html:1531, with ceo/coo = super_admin) as `webNav(role, id, tenant)` for every module id: tasks, projects, clients, booking, requests, roster, departments, users, config, audit, subscriptions, reports, devices, servicedesk, assets, rooms, referrals, payroll, visitors-desk, tenants, wallets, features.
   - Add the typed Tenant fields: `subscriptionAccess`, `auditAccess`, project, announcement, bounty and job-opening creators, `profTypes`, `teamRosterDepts`.
   - Add `useAllTenants()` for master_admin.
3. **Create sheet** (`features/create/create-sheet.tsx`): append each domain's `createActions(access)` after the existing 8. This covers Assign a task, Book, New chat, Raise for someone, Add asset, Start kiosk and Invite a visitor (Visitor Manager).
4. **Inbox plugin API** (`features/inbox/use-inbox.ts`, `format.ts`, `history.tsx`, `app/(app)/inbox/[kind]/[id].tsx`):
   - Define `InboxKindPlugin = { key, label, module, useItems(access), Row, Detail, historyStatuses? }`.
   - The list, counts, 60 s polling and the detail route all dispatch to plugins.
   - The HR kinds stay as they are.
5. **Home slots** (`features/home/*`, `(tabs)/index.tsx`): `homeCards(access)` slots under "Needs you". They carry:
   - the leadership KPIs;
   - the desk hero for the Visitor Manager;
   - the manager's Team today and Tomorrow cards.
6. **Tour**: `role-tours.ts` appends each domain's `tourSteps(role)` before the demo step. Bump `TOUR_VERSION` once, at release time.
7. **Shared helpers**, new and owned by the integrator; domains may import them:
   - `src/features/shared/person-picker.tsx`: search over slim users, recent `AvatarTiles`, an "On leave" disabled state.
   - `src/lib/csv.ts`: rows → CSV → cache file → `shareFile`.
   - `src/lib/ist.ts` if `dates.ts` lacks IST helpers.
   - The project picker is moved from `features/reimbursements/project-picker.tsx` into `features/shared/`, with a re-export at the old path.
8. **Layout** (`app/(app)/_layout.tsx`):
   - Stack options for `admin/desk/kiosk` (`fullScreenModal`, no gesture, fade) and `call/[meetingId]`.
   - Mount `<MeetsWatcher/>`; it is a stub that renders null until the chat domain fills it.
   - Add a Chat icon slot in `features/home/header.tsx`, also a stub.
9. **Demo plumbing:**
   - `demo/state.ts`: add `'PATCH'` to `Method`.
   - Create a `demo/fixtures/index.ts` barrel that imports every domain fixture file. Create those files now as stubs exporting `[]`. `server.ts` imports the barrel once and never changes again.
   - Extend `LIST_ROUTE` with the new list endpoints.
10. **Demo exports** (stores and mutators) added to the existing fixtures:
    - `org.ts`: `upsertPerson`, `removePerson`, `upsertProject`, `patchTenant`, `upsertDepartment`, and "make bookable" flags for 3 professionals.
    - `tasks.ts`: `taskStore`, `createTask`, `patchTask`.
    - `support.ts`: `ticketStore`, `patchTicket`.
    - `visitors.ts`: one shared `visitStore`, so the host and the desk agree.
    - `pay.ts`: `addPayslip`.
    - `petty-cash.ts` and `reimbursements.ts`: item stores and `setStage`.
    - `bounty.ts`: `txStore`, `walletOf`.
    - `announcements.ts`: `newsStore`.
11. **Personas** (`demo/personas.ts`, `org.ts` TENANT):
    - Add the `payroll` and `tax` modules to Afzal HR and Afzal Super Admin.
    - Set `teamRosterEnabled` and turn it on for 2 departments.
    - Fill `auditAccess`, `subscriptionAccess` and the creators lists.
    - Keep "no CEO/COO persona" (owner rule).

Gate before Wave 1: `npx tsc --noEmit` and `expo lint` must be clean. The app must look identical to today, because every stub returns nothing.

### 2.3 Waves
| Wave | Runs in parallel (domain → route folder) | Why in this wave |
|---|---|---|
| **1**, about 2 weeks | **work** → `admin/work/**` (hub, team tasks, projects, clients); **booking** → `admin/booking/**` (pro, room, location, my bookings, requests, pending reviews); **servicedesk** → `admin/service-desk/**`; **people** → `admin/people/**` (roster, departments, profile edit); **hrtime** → `admin/hr-time/**`; **accounts** → `admin/accounts/**`; **company** → `admin/company/**` (dashboard, users, settings, audit, subscriptions); **desk** → `admin/desk/**` (board, log, invites, QR as share-link); **signin** → `(auth)/forgot`, `(auth)/signup`; **chat** → `chat/**` (text and attachments) | No dependencies between them. Covers the biggest daily gaps: approvals, the Visitor Manager, Accounts and HR. All Expo Go. |
| Integrator pass 1 | Merge the hand-off notes: menu order, create-sheet order, Inbox ordering and counts, tours, missing exports; a smoke test as every Afzal persona | |
| **2**, about 2 weeks | **teamboard** → `admin/team-board/**`; **insights** → `admin/insights/**` (reports, devices); **itdesk** → `admin/it-desk/**` (assets, rooms, locations, purposes, support centre); **payroll** → `admin/payroll/**`; **hiring** → `admin/hiring/**` (+ Refer & earn); **newsroom** → `admin/news/**` (studio, office TVs); **bountyadmin** → `admin/bounty/**`; **desk** (continued) → kiosk | Needs Wave-1 data: IT rooms use booking's stores, reports read work's tasks, payroll needs hrtime's leave and attendance, and the kiosk builds on the board |
| Integrator pass 2 | Same as pass 1. Also mount `hiring/refer-card.tsx` on the bounty hub and the "+" News studio entry on the News screen | |
| **3**: gated on section 3 decisions | **platform** → `admin/platform/**` (needs bountyadmin's wallet stores; no decision needed); **push** (app side `src/lib/push.ts`, `src/api/push.ts`, `features/push/**`; server side only after D1); **signin** Google (D2); **calls** → `call/**` (D3); chat voice notes (D4, `expo-audio`); desk QR render (D4, QR encoder); accounts agreement drafting (D4, WebView); optional `expo-print` PDFs, asset scanning, office map | Each item needs owner approval or a development build |
| Integrator pass 3 | Final tours, update `TOUR_VERSION` and `DEMO-ACCOUNTS.md`, persona walk-through on a phone | |

### 2.4 Existing files handed to exactly one domain
| Existing file(s) | Owner (wave) | Change |
|---|---|---|
| `src/app/(app)/attendance/holidays.tsx`, `attendance/shifts.tsx`, `policies/index.tsx` | hrtime (1) | Admin "+"/Manage entry points |
| `src/app/(app)/petty-cash/statement/**` | accounts (1) | "Reject bill" row action |
| `src/app/(app)/visitors/invite.tsx`, `src/api/visitors.ts` | desk (1) | Allow the Visitor Manager |
| `src/app/(auth)/email.tsx`, `login.tsx`, `otp.tsx`, `src/auth/flow.ts`, `src/api/auth.ts`, new `src/demo/auth-extras.ts` | signin (1, 3) | Forgot and sign-up links, `'forgot'` OTP purpose, demo branches before sign-in; Google button in wave 3 |
| `src/app/(app)/tasks/index.tsx` | teamboard (2) | "My tasks · Team tasks" segment |
| `src/app/(app)/announcements/index.tsx` | newsroom (2) | Manage entry for creators |
| `src/app/(app)/bounty/index.tsx` | bountyadmin (2) | Admin entry |
| `src/auth/session.ts` (`signOut`) | push (3) | Remove the device before forgetting the session |

### 2.5 Shared integration points (integrator only, after each wave)
- **More**: the order of Workspace sections and rows; the 9-tile grid stays unchanged. Exception: desk tiles replace the near-empty Visitor Manager grid.
- **Role gates**: promote any domain gate needed in more than one place from `features/<domain>/access.ts` into `lib/access.ts`.
- **+ Create sheet**: final order and the per-role cap. Proposed order: the existing 8, then Assign a task, Book, New chat, Raise for someone, Add asset, Start kiosk.
- **Inbox kinds**: order and labels.
  - New kinds from work: `task`, `timefix`.
  - New kinds from booking: `booking`, `bkdone`, `bkrate`.
  - New kinds from accounts: `petty-acct`, `reimb-acct`, `vbill`.
  - New kind from desk: `desk`.
  - Service desk: one `desk-it` kind for "Waiting to be assigned" and asset approvals.
  - Past decisions in `history.tsx`.
- **Home**: the order of card slots for each role.
- **Demo**:
  - add persona tweaks;
  - add missing store exports;
  - make sure each new fixture is in the barrel;
  - make cross-domain data agree, for example: approving a booking creates the task the professional sees, and locking payroll adds the payslip Afzal Employee sees.
- **Tours**: domain steps per role, `TOUR_VERSION` bump, a short `DEMO-ACCOUNTS.md` "What to try" update per persona.
- **Dependencies and `app.json` plugins** approved in D4: install them with `npx expo install`, never by hand.

---

## 3. Decisions the owner must make

**D1. Push notifications: server and DB change.**

The memory rule today is "no server/DB changes", so this one needs your yes.

Exact change list (from [signin-push §4.2](signin-push.md), merged with [meets §6](meets.md) so there is one table, not two):
1. A new file `sql/push_devices.sql`, run once in Supabase.
   - It creates the table `push_devices(token PK, user_id, tenant_id, session_token → auth_sessions ON DELETE CASCADE, platform, device_name, app_version, created_at, updated_at, last_error)`.
   - It adds an index on `user_id` and turns on RLS (service role only).
2. Three routes behind the staff auth gate, with no role check:
   - `POST /api/push/devices` (validates the token, upserts it, rate-limited);
   - `POST /api/push/devices/remove`;
   - `POST /api/push/test`.
3. A new `lib/push.js`, about 120 lines with no npm package. It calls `exp.host/--/api/v2/push/send` in chunks of 100, deletes the row on `DeviceNotRegistered` and never throws.
   - It is switched by the env `PUSH_ENABLED` (off until rollout).
   - It uses `EXPO_ACCESS_TOKEN` if set.
4. Hooks, phase 1:
   - In `sendEmail` (server.js:355), add an optional `opts` and push to the matching staff user.
   - Pass `noPush:true` at the code-carrying sends: server.js:2443, 2468 and 2766. The petty cash code sends at :3651 and :3726 also get `noPush:true`, plus a separate push without the code.
   - In `visitors.js notify()` (:226), push for `visitorArrival` and `guestArrived`.
   - Push for the bounty reminder WhatsApp branch (server.js:5907).
5. Hooks, phase 2:
   - In Meets `broadcast()` (meets.js:487), push `message` and `meeting` events to recipients with no live stream, rate-limited per conversation.
   - Push HR approvals waiting for you, decisions on your own requests, and new announcements.
   - Use explicit deep links.

What you provide:
- A Firebase Android app `com.tamadamedia.dashmobile` and its `google-services.json` (not secret).
- The **FCM V1 service-account key**, uploaded to EAS (never committed).
- An **APNs key**, which needs a paid Apple Developer account.
- A 96×96 white notification icon.
- Your choice on lock-screen detail (names and amounts, or "hide details").

Remote push cannot be tested in Expo Go; it needs a development or preview build (see D3).

**D2. Google sign-in: pick one option, or skip.**
- **Option A**: `@react-native-google-signin/google-signin` with a development build. No server change.
  - You provide the DASH Firebase project's **Web client ID** (it goes into `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`), an **iOS client ID** and its URL scheme.
  - You also provide an **Android OAuth client** for `com.tamadamedia.dashmobile` with the SHA-1 of the EAS upload key **and** of the Play App Signing key.
  - Confirm the Firebase API key is not restricted to the website's referrer.
  - Safelist the client IDs in Firebase if they live in a different Google Cloud project.
- **Option B**: works in Expo Go, but needs a small public website page `/m/google` that redirects back to the app with the token in the URL fragment. That is a website change.

**D3. Development build.** Calls, Google sign-in and remote push cannot run in Expo Go.
- Approve adding `expo-dev-client` and installing an EAS `development` build on your phone. `eas.json` already has the profile.
- **Calls** additionally need:
  - `react-native-webrtc` and its config plugin. First check that it supports RN 0.86 with the New Architecture.
  - A **TURN relay server over TCP/TLS**, because Indian mobile networks block UDP and today's relay is UDP-only. That is a hosting decision and cost.
- Optional later: native full-screen ringing on iOS (VoIP push and CallKit).

**D4. New dependencies.** The kit rule today is "no new packages". Everything below is in Expo Go unless marked.
| Package | For | Recommendation |
|---|---|---|
| Small pure-JS QR encoder (e.g. `qrcode-generator`), drawn with `react-native-svg` | Desk QR screen | **Yes**; otherwise the desk can only share the link |
| `expo-keep-awake` | Kiosk mode | Yes |
| `expo-audio` | Chat voice notes | Yes, when chat ships |
| `expo-print` | Pending-reviews, vendor summary and report PDFs | Optional; CSV and text sharing cover phase 1 |
| `react-native-webview` | Accounts agreement drafting (phase 2) | Later |
| `expo-camera` | Asset tag scanning | Later |
| `react-native-maps` | Placing an office on a map (store builds need a Google Maps key) | Later; ship "use where I'm standing" first |
| `expo-notifications` | Push (D1) | With D1 |
| `@react-native-google-signin/google-signin`, `expo-dev-client`, `react-native-webrtc` | D2, D3 | Not in Expo Go; only with D2 and D3 |

**D5. Server security holes found during research.** They are not needed by the app, but they are risky. Each one-line fix breaks the "no server change" rule, so each needs your yes.
- `POST /api/users/bulk-patch` (routes/users.js:477) has no permission check. **Any employee can make themselves Super Admin.** Fix it first.
- `DELETE /api/whitelist/:id` and `sync-from-whitelist` have no role check.
- `POST` and `DELETE /api/tenants` only check that the caller is signed in. Any employee can create or delete a company.
- `PUT /bookings`, `PUT /tasks`, `PUT /time_corrections`, and the asset, room, location, purpose and Support Centre write routes do not check roles.
- Time corrections are saved without a tenant id, so the queue is always empty.
- The Meets people directory lists users from every company.
- The public check-in limit (10 per 10 minutes per network address) will throttle a busy kiosk.

**D6. Product calls.**
- Approve the single More "Workspace" section in place of 8 separate menus.
- Allow **payroll lock**, **vendor approval** and **adding coins to a company wallet** on a phone (each with swipe-to-confirm, plus typed `LOCK YYYY-MM` for payroll)? Or should they stay web-only?
- Kiosk: keep the `android-visitor-kiosk` APK as the main lobby setup, and use the in-app kiosk as a backup.
- Leaving the in-app kiosk asks for the phone's fingerprint or PIN, not the DASH password.
- The app honours the `meets` company switch (the website ignores it). Yes or no?

---

## 4. What stays web-only (please confirm)
| Item | Why |
|---|---|
| Bulk Excel/CSV uploads: projects, employees (upload and update), assets, subscriptions | Desktop file work with SheetJS and a preview grid |
| Excel and PDF exports and letterhead reports: audit, wallets, vendor master, assets, roster, reports, TM360, Keka code time report | The phone shares CSV or plain text instead. PDFs only if `expo-print` is approved |
| Wide grids: attendance month spreadsheet, people × leave-type balances, payroll register table, petty cash ledger | 30+ columns. The phone gets row views and CSV with the same data |
| Salary-structure component editor; statutory and TDS editing | High-risk formula editing; read-only on the phone |
| Logo uploads, professional categories table | Transparent PNG at fixed sizes; a rare desktop task |
| Delete a company, purge company data, "Delete all assets", delete tickets | Cascading and irreversible; the routes are unguarded on the server |
| "Extend shoot time" | Takes no lock and can silently double-book a professional |
| TV playlist editor, the TV screen itself, "view as department admin" | Display devices and a desktop-only view |
| Public visitor check-in page `/visit/...`, host WhatsApp approve page, careers page | Used by people who don't have the app |
| Vendor Google sign-in | Vendor domain; can reuse `src/auth/google.ts` later |
| Audit backfill, "Reset Super Admin Password", Overrides | Master-only job, a button with no API, or no screen at all |
| Dead features: resource requests, "Mark as leave", Assign Work page, old approval components | No server route, or unreachable |
| Accounts agreement drafting | Web-only in phase 1; returns in wave 3 if `react-native-webview` is approved |

---

## 5. Cross-cutting risks every agent must handle
- **Data size.**
  - `/tasks` is about 1.3 MB, and `/bookings`, `/users`, payroll lines and leave rows are unpaginated. Use long `staleTime`, pull to refresh, `?since=` where it exists, and slim rows.
  - Never persist bank, salary, ID or photo data.
- **Name matching.** Reporting lines, task creators and asset assignees are matched by display name. Show the server's own error text, and never rename people on the phone without a warning.
- **Two-step writes can half-fail:** accept-and-assign, room plus slot rows, booking reject plus task delete. Run them in sequence, and on failure show what succeeded.
- **Stale replace-all lists.** Access lists and tenant arrays are replaced in full on every save. Re-fetch just before saving, and show a toast on conflict.
- **Slot holds.** They can't be released if the app is killed, so a slot stays blocked for up to 5 minutes. Show the countdown and release the hold on blur.
