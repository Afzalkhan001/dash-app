# Port plan: Visitor Desk (Visitor Manager)

Scope: the reception side of Visitor Management. That covers today's board, check-in and check-out, approving for a host, Kiosk Mode (self check-in with an invite code and an on-screen QR), the Visitor Log, Invites, the check-in QR code, and the `android-visitor-kiosk` APK.
The employee side (Visitors tab: waiting for me, invite a guest, history) is **already in the app** and is only covered here where the desk reuses it.

**Headline:** everything the desk does can be built on endpoints that already exist. No server or DB change is required.
Two optional server changes are listed in §7 (risks). They fix limits that the web kiosk has today too.

Sources: `dash.html` (website), `visitors.js` (server module, 900 lines), `server.js`, `routes/tenants.js`, `lib/authz.js`, `VISITORS_HANDOFF.md`, `test/e2e_visitors.test.js`, `android-visitor-kiosk/*`, `mobile/src/**`.

---

## 1. Website features and screens

### 1.1 Who sees the desk (gates)

| Gate | Where | Effect |
|---|---|---|
| `VISIT_DESK_ROLES=['visitor_manager','super_admin']` | dash.html:35180 | The only roles that get desk screens. The comment at 35177 says this is deliberate. The desk shows every visitor's face and mobile, so admin, HR, IT admin, CEO and COO do **not** get it. |
| Server `DESK_ROLES` (same list) | visitors.js:560-561 (`requireRole(DESK_ROLES,'manage visitors')`) | Enforced on every desk route. `requireRole` is at lib/authz.js:51 and returns 403 `You do not have permission to …`. |
| `navForRaw` role table, `visitor_manager` entry | dash.html:1531 | `visitors-dashboard` Dashboard · `visitors-kiosk` Kiosk Mode · `visitors-log` Visitor Log · `visitors-invites` Invites · `visitors-qr` QR Code · `profile` · `support`. |
| `navFor` injection | dash.html:1488-1497 | Everyone **except** `master_admin`, `announcement_viewer` and `visitor_manager` gets the employee **Visitors** tab. `VISIT_DESK_ROLES` (so only `super_admin` here) also gets **Visitor Desk** (`visitors-desk`), inserted after Profile. |
| Sidebar grouping | dash.html:1584 (`pick(['reports','servicedesk','visitors-desk','visitors'])`), 1602/1610 (`VisitorsNavBadge` on the Visitors item), 1661 (icons) | Presentation only. |
| `CROSS_ROLE_VIEWS` | dash.html:30471, visitor entries 30490-30496; `inNav` check 30499-30505 | `visitors-desk`/`visitors-dashboard` → `VisitorDesk section="today"`, `visitors-kiosk` → kiosk, `visitors-log`, `visitors-invites`, `visitors-qr`. A view is reachable only if it is in that user's `navFor`. |
| `DEFAULT_VIEW.visitor_manager='visitors-dashboard'` | dash.html:30257 | The Visitor Manager lands on the board. |
| Role dispatch | dash.html:30517 → `VisitorManagerViews` (35942) | Profile and Support only; anything else falls back to the board. |
| WhatsApp deep link `#visitors` | dash.html:30419-30422 | After login, `#visitors` opens the employee tab. Not for `master_admin` or `visitor_manager`. |
| Role plumbing | `RL` 913, `RC` 922, `_SA_SYSTEM_ROLES` 2581, `SYSTEM_ROLES` 2633, Users role dropdown 2754, `ORG_NON_STAFF_ROLES` 9342 | `visitor_manager` is a system role: not in the Employee Roster, no clock-in, not in `USER_ADMIN_ROLES`. |
| Feature flags | — | **None.** Visitors is not in `FEATURE_REGISTRY` (dash.html:1373) and not in `tenantFeatureOn`. There is no `canSeeHrNav` or `HR_SECTIONS` involvement. |
| Bounty | server.js:5779 `BOUNTY_NON_CLAIMING_ROLES` includes `visitor_manager` | Irrelevant to the desk. |

### 1.2 Screens (all in the block "VISITOR MANAGEMENT — the screens", dash.html:35168-36000)

Shared helpers:
- `VISIT_PURPOSES` (35176): Meeting, Interview, Delivery, Vendor, Personal, Other.
- `visitFetch` (35184): plain `fetch` for public routes, so a 401 does not sign the desk out.
- `visitTime`/`visitDay` (35192-35193).
- `visitMobileOk` (35196): 10 digits, 91+10, or 0+10.
- `VISIT_STATUS_META` (35197): pending "Waiting for host", approved, rejected, no_response "No response", checked_out.
- `VisitStatusBadge` (35204).
- `VisitPhoto` (35208): signed photo, "removed" once purged, otherwise initials.

**A. `VisitorDesk({user,section})`, dash.html:35924.** A tab bar with Dashboard / Kiosk Mode / Visitor Log / Invites / QR Code. The tab follows the sidebar `section`.

**B. Dashboard: `VisitorTodayBoard`, dash.html:35693-35726**
1. `GET /visitors/today` on mount, then every **10 s** (35696-35697).
2. Five stat cards (35704): Today (`stats.total`), Waiting (`waiting`), Inside now (`inside`), Rejected, No response.
3. A "Waiting for a host to answer" list: visits with `status` pending or no_response, each a `VisitCard` (35640). Each card shows a 72 px photo, name, mobile · purpose, "Arrived hh:mm", "· timed out…" and "· to meet <host>", plus **Approve** and **Reject** buttons.
   - These call `POST /visitors/:id/decide {decision}` (35698). Errors go to `alert`; the board then reloads.
   - The caption says "If the host is in a meeting you can approve or reject for them — it is recorded as you."
   - There is no confirmation dialog on the web.
4. A "Today's visitors" table: photo, name + mobile, Meeting (host), Purpose + source (`invited`/`kiosk`/`qr`), In, Out, Status.
   - The row action is **Check out**, shown only when `status==='approved' && !checkOutAt`.
   - It asks `showConfirm('Check out <name>?')`, then calls `POST /visitors/:id/check-out` (35699-35702).
5. Empty state: "No visitors yet today."

**C. Visitor Log: `VisitorLog`, dash.html:35728-35765**
- Filters: free-text `q` (searched on Enter or the Search button), From and To dates (default: 7 days ago → today, local), and Status (all or one of the 5).
- `GET /visitors/log?from&to&status&q` reloads on any date or status change (35733-35740).
- Paging is client-side with `BA_PAGE_SIZE` and `BAPager`.
- Columns: photo, name + mobile, host, purpose, date, in, out, status + "by <decidedBy> (<decidedVia>)".
- **No export** (no CSV or PDF), no detail view and no edits.

**D. Invites: `VisitorInvites`, dash.html:35577-35638.** This is the same component the employee tab uses.
- Form: guest name, mobile (`visitMobileOk`), date (today or later), optional from/to time and purpose.
- Submit calls `POST /visitors/invites`. The success box shows the 6-digit code and **Download pass**.
- The list shows "Your invitations" via `GET /visitors/invites`. Active rows have **Pass** and **Cancel**.
  - Pass is `visitDownloadPass` (35567): an authenticated `GET /visitors/invites/:id/pass` that downloads a PNG.
  - Cancel asks `showConfirm(…'They are not told')`, then calls `DELETE /visitors/invites/:id`.
- **Note:** the server lists only the caller's own invites (`host_user_id = u.id`, visitors.js:795-796). The desk's Invites tab is therefore "invites I (the desk user) created". There is no company-wide invite list anywhere.

**E. QR Code: `VisitorQrPage`, dash.html:35767-35818**
1. `GET /visitors/qr` returns `{tenantId, token, path, companyName}`. The first call mints the token.
2. The QR is drawn with qrcodejs (cdnjs) for `location.origin + path`, i.e. `https://dash.tamadamedia.in/visit/<tenantId>/<token>`.
3. Buttons:
   - **Download PNG**: canvas → dataURL.
   - **Print poster**: a popup window titled "Welcome to <company> / Please check in", with the QR at 420 px, 3 steps, and a privacy line; then `window.print()`.
   - **Copy link**.
4. **Regenerate QR code…** (`canRegen` = desk roles). It asks a strongly worded `showConfirm`: "EVERY printed poster … stops working immediately". It then calls `POST /visitors/qr/regenerate` and reloads.

**F. Kiosk Mode**
- `VisitorKioskPage` (35905) calls `GET /visitors/qr`, then **Start kiosk mode**, which calls `requestFullscreen()` and mounts `VisitKioskOverlay` (35859).
- The overlay is a full-screen two-pane layout (`VK_CSS` 35822: a reception photo plus a white card in a yellow `#FFC928` accent) that hosts `VisitWizard` with `kiosk` true.
- Every 5 minutes it checks `GET /api/version` and reloads if a new build is out and the wizard is on its welcome screen (35870-35878).
- **Exit kiosk** (bottom-left) opens a password prompt that calls `POST /visitors/kiosk/exit {password}`. A 403 means a wrong password (35880-35885).

**G. The check-in wizard: `VisitWizard({base,kiosk,onCompany,qrUrl})`, dash.html:35318-35536.** `base` = `/api/public/visit/<tenantId>/<token>`. Steps:
1. Mount: `GET base/employees` with no `q`. This validates the link and returns `companyName`; an error shows a fatal "This check-in link is not valid" (35336-35344).
2. `start` (kiosk only, 35416-35438): "How can we help you today?" with two options, "I'm here to meet someone" and "I have an invite code". There is also an **on-screen QR** (`VisitQr`, 35274) so a visitor can use their own phone.
3. `host` (35440-35456): type at least 2 letters. A 250 ms debounce, then `GET base/employees?q=`, and at most 25 matches render (name + job title).
4. `selfie` (35458): `VisitSelfie` (35225) uses `getUserMedia({facingMode:'user'})` → **Take photo**, or a file-input fallback with `capture="user"`. It then `visitShrink`s (35218) to ≤640 px wide JPEG q0.7, stepping down to ≤550 KB.
5. `details` (35463-35478):
   - Name, mobile, purpose select (+ free text for Other).
   - A **consent checkbox** with this text: "I agree that my photo, name and mobile number are recorded for security, shared with the person I am visiting, and that the result is sent to my mobile on WhatsApp. My photo is deleted after a short retention period."
   - Submit: `POST base {hostUserId, visitorName, visitorMobile, purpose, photo, consent:true, source:'kiosk'|'qr'}` (35378-35389).
6. `waiting` (35480-35515): poll `GET base/status/:visitId` every 5 s while pending (35361-35368). Results: approved "You are approved", rejected "Sorry, not right now", no_response "No response yet — speak to the security desk".
7. Invite path:
   - `code`: 6-digit input → `POST base/invite {code}`.
   - `invite_selfie`: "Welcome, <guest> — expected by <host>" → selfie → `POST base/invite/:inviteId/arrive {photo}`.
   - `invite_done`: "You are checked in".
8. In the kiosk, **auto-reset 15 s** after any result, with a "Next visitor in Ns · Done" bar (35370-35376).

**H. Public page `/visit/:tenantId/:token`**
- `IS_VISIT_PORTAL` (35539) → `VisitPortal` (35540), rendered before `App` (dash.html:36088-36091).
- This is the same wizard with `kiosk=false`, on the visitor's own phone, with no account.
- **This stays a web page:** visitors do not have the DASH app. The app's QR screen just points at it.

**I. Host decision page.** Server-rendered HTML at `GET|POST /api/public/visit/:tenantId/decide/:visitId?t=<decide_token>` (visitors.js:400-472). It is used from the host's WhatsApp link and only when `VISITOR_DECISION_LINK=1` (visitors.js:52). This is not a desk feature, so it stays as is.

**J. Super Admin → Config: `VisitorConfigCard`** (dash.html:35965, mounted at 3572)
- `visitorApprovalTimeoutMin` (1-240, default 10) and `visitorPhotoRetentionDays` (1-365, default 30) are saved with `PUT /tenants/:id`.
- There is also a read-only reference of the WhatsApp templates (`VISIT_WA_TEMPLATES` 35949).
- This belongs to the Super Admin Config port; it is listed here only for completeness.

---

## 2. Endpoints

All routes are registered by `require('./visitors.js')(app, ctx)` at server.js:1611-1631. If the module fails to load, `/api/visitors*` and `/api/public/visit/*` return **503** "The Visitor module is not loaded…". The auth gate is server.js:1451; public routes bypass it via `PUBLIC_API_PATTERNS` (server.js:1378-1390) **even if an `Authorization` header is sent**, so the app's `apiFetch` can call them.

The visit shape the UI reads comes from `shapeVisit`, visitors.js:255:
`{id, hostUserId, hostName, visitorName, visitorMobile, purpose, source:'qr'|'kiosk'|'invite', inviteId, status, createdAt, decidedAt, decidedVia:'app'|'whatsapp', decidedBy, checkOutAt, workDate, photoUrl (signed, 1 h), photoPurged}`.
This is already typed as `Visit` in `mobile/src/api/visitors.ts:21`.

### 2.1 Desk (session + `requireRole(['visitor_manager','super_admin'])`)

| Method / path | visitors.js | Body / query | Response | Side effects / danger |
|---|---|---|---|---|
| GET `/api/visitors/today` | 563 | — | `{ok, visits: Visit[], stats:{total, waiting, inside, rejected, noResponse}}`. Tenant-wide, `work_date = IST today`, newest first. `inside` = approved and no `check_out_at`. | Read. It signs one photo URL per row. |
| GET `/api/visitors/log` | 586 | `from`, `to` (YYYY-MM-DD, on `work_date`), `status` (one of 5), `q` (≤60 chars; matched in memory on name, mobile, host, purpose) | `{ok, visits: Visit[]}`. **Limit 2000**, no paging. | Read. Up to 2000 signed URLs per call, so keep ranges short. |
| POST `/api/visitors/:id/check-out` | 603 | `{}` | `{ok, id, status:'checked_out'}`. 404 for another tenant; **409** "already checked out". | **Irreversible**: there is no un-check-out endpoint. It does **not** check that the visit was approved (the web hides the button otherwise; the app must too). Audit log entry. |
| GET `/api/visitors/qr` | 623 | — | `{ok, tenantId, token, path:'/visit/<tid>/<token>', companyName}` | **Writes on first call**: it mints `tenants.data.visitorPublicToken` if missing. |
| POST `/api/visitors/qr/regenerate` | 652 | `{}` | `{ok, token, path}` | **Dangerous and irreversible**: every printed poster, saved QR and **running kiosk** (which holds the old token in `base`) stops working. Audit log entry. |
| POST `/api/visitors/kiosk/exit` | 638 | `{password}` | `{ok}`; 400 empty; **403** "That password is not right." (never 401, so the app does not sign out) | Rate limit **10 per 10 min**. Uses `verifyPassword` against the desk user's own `users.password`. |

### 2.2 Employee routes the desk also uses (session only, with an in-handler check)

| Method / path | visitors.js | Role check | Body | Response / side effects |
|---|---|---|---|---|
| POST `/api/visitors/:id/decide` | 683 | The host, **or** `DESK_ROLES` in the same tenant (694); otherwise 403 "Only the person being visited can decide this." | `{decision:'approve'\|'reject'}` (no note) | `{ok, id, status}`. **409** if already decided (normal; reload). The `pending` and `no_response` states can both be decided. `decideVisit` (273) records `decided_via:'app'` and `decided_by` = the **desk user's name**. **It sends WhatsApp** `visitorApproved`/`visitorRejected` to the visitor (288-294), so it is irreversible. Audit log entry. |
| GET `/api/visitors/invites` | 792 | Own invites only | — | `{ok, invites:[{id, guestName, guestMobile, visitDate, timeFrom, timeTo, purpose, code, status, usedAt, createdAt}]}`, limit 200. |
| POST `/api/visitors/invites` | 744 | Any signed-in user (the desk user becomes the host) | `{guestName, guestMobile, visitDate, timeFrom?, timeTo?, purpose?}` | `{ok, id, code, visitDate, guestName}`. It renders a pass PNG (resvg) and stores it in `visitor-photos/<t>/passes/<date>/`. **It sends WhatsApp** to the guest, trying in order: `visitorInvite` (image) → `visitorInviteText` → `visitorInviteCode` (780-786). Every send is logged in `wa_messages`. |
| DELETE `/api/visitors/invites/:id` | 810 | Host or `DESK_ROLES` | — | `{ok, id, status:'cancelled'}`. **The guest is not told** (by design). Irreversible. 409 if not active. |
| GET `/api/visitors/invites/:id/pass` | 711 | Host or `DESK_ROLES`; active only | — | `image/png` attachment (1080×1500). 409 once used or cancelled; 503 if it cannot be drawn. |
| GET `/api/visitors/mine` | 670 | Self | — | `{pending, history}`, where the user is the host. Not a desk screen (the web hides the Visitors tab for `visitor_manager`). |

### 2.3 Public (no session; `requirePublicTenant` checks the tenant token with `timingSafeEqual`, visitors.js:169-185)

A wrong tenant and a wrong token both return the same **404**: "This check-in link is not valid. Ask the security desk for the current QR code." Rate limits are **per IP** (`rateLimit`, server.js:1243; `clientIp` 1217 honours `x-forwarded-for` only when `TRUST_PROXY=1`).

| Method / path | visitors.js | Limit | Body / query | Response | Side effects |
|---|---|---|---|---|---|
| GET `/api/public/visit/:tid/:token/employees` | 305 | 60/min | `q` (fewer than 2 chars returns an empty list) | `{ok, employees:[{id, name, jobTitle, dept, hasAvatar}] (≤25, active, not master_admin/announcement_viewer), companyName}` | Read. No phone or email, by design. |
| POST `/api/public/visit/:tid/:token` | 331 | **10 / 10 min** | `{hostUserId, visitorName (≤120), visitorMobile (10-15 digits after normalizeWaPhone), purpose (≤200), photo:'data:image/…;base64,…' (≤600 KB), consent:true, source:'kiosk'\|'qr'}` | `{ok, visitId, status:'pending', hostName, hostHasMobile}` | Uploads the selfie to the private `visitor-photos` bucket and inserts a `visits` row. **It sends WhatsApp** `visitorArrival` with the selfie to the host (24 h signed URL). If the photo upload fails, the visit is still created without a photo. |
| GET `/api/public/visit/:tid/:token/status/:visitId` | 476 | 240 / 10 min | — | `{ok, status, hostName}` only | — |
| POST `/api/public/visit/:tid/:token/invite` | 491 | 12 / 10 min | `{code}` (6 digits, must be **today's** invite) | `{ok, inviteId, guestName, hostName, timeFrom, timeTo}`; 404 invalid; 409 used or cancelled | — |
| POST `/api/public/visit/:tid/:token/invite/:inviteId/arrive` | 511 | 12 / 10 min | `{photo}` | `{ok, visitId, status:'approved', hostName}` | Creates an **already-approved** visit (`source:'invite'`) and marks the invite `used` (single use). **It sends WhatsApp** `guestArrived` with the selfie to the host. |

### 2.4 Background (no UI, but affects what the desk sees)
- `sweepNoResponse` runs every 60 s (visitors.js:832, 895). A pending visit older than `visitorApprovalTimeoutMin` becomes `no_response`. The desk can still decide it.
- `sweepPhotos` runs every 6 h (850, 896). After `visitorPhotoRetentionDays`, the photo object is deleted and the row gets `photo_purged_at` (the UI shows "removed"). Passes are swept too (879).
- WhatsApp template keys and ids: server.js:474-482 and 527-541. Templates must exist in WhatsApp Manager, otherwise the send is "skipped" and the flow continues.
- Covered by `test/e2e_visitors.test.js` (246 lines; persona "Vimal Desk", role `visitor_manager`).

---

## 3. What the mobile app has today, and the gaps

**Already built (employee side, reusable):**
- `src/api/visitors.ts`: `Visit` and `Invite` types; `useMyVisitors`, `useMyInvites`, `useDecideVisit` (invalidates `['inbox','visitors']`), `useCreateInvite`, `useCancelInvite`, `shareInvitePass` (downloadAuthed + share sheet).
- `src/app/(app)/visitors/index.tsx` (waiting for me), `history.tsx`, `invitations.tsx`, `invite.tsx` (form → ConfirmSheet with SwipeToConfirm → SuccessSheet with the code and Share pass).
- `src/features/visitors/`:
  - `format.ts` (`VISIT_STATUS`, `phoneLabel`, `mobileOk`, `clockOf`, `stampLabel`, `timeWindow`, `initials`)
  - `visit-photo.tsx` (`VisitPhoto`, cached by visit id, handles purged)
  - `visit-card.tsx` (AccountRow + "Respond")
  - `history-list.tsx`
  - `invites.tsx` (`InviteList`, `InviteSheet`, `CodeBoxes`, `useSharePass`)
  - `invite-form.tsx`
- Inbox decision UI for visitors: `src/app/(app)/inbox/[kind]/[id].tsx:534-640` (`VisitorItem`, "Let in" / "Turn away", `VisitorHero`), using `src/features/inbox/detail.tsx:142`.
- Demo: `src/demo/fixtures/visitors.ts`, host side only (`/visitors/mine`, decide, invites CRUD).

**For the Visitor Manager: nothing.**
- `features/more/menu.ts:50` gives `visitor_manager: ['profile','support']`, and menu.ts:108 hides the Visitors tile for it.
- `api/inbox.ts:136` sets `VISITOR_HIDDEN_ROLES`.
- The persona note at `demo/personas.ts:248` says "the visitor desk itself is on the website".
- The tour at `features/tour/role-tours.ts:273` says the same.
- `docs/DEMO-ACCOUNTS.md:78,101,141` says the same.
- The Super Admin does not get a desk entry either.

**Gaps (every one has an existing endpoint):**

| Gap | Endpoint(s) |
|---|---|
| Desk API hooks (`useDeskToday`, `useVisitorLog`, `useCheckOut`, `useDeskQr`, `useRegenerateQr`, `kioskExit`) | §2.1 |
| Desk access helper (`canRunDesk(user)` = exact role in `['visitor_manager','super_admin']`; **not** ceo/coo, even though menu.ts maps them to SUPER) | — |
| Today board, visit detail and check-out | today, decide, check-out |
| Visitor log with filters | log |
| QR code screen (render, share, poster, regenerate) | qr, qr/regenerate |
| Kiosk mode (whole wizard + invite-code path + exit) | qr + 5 public routes + kiosk/exit |
| Desk "waiting" in Inbox / Home "Needs you" for the Visitor Manager | today + decide |
| Desk entry for Super Admin (More tile) | — |
| Demo fixtures for all of the above | — |

---

## 4. Mobile design proposal (existing `@/ui` kit only)

### 4.1 Navigation

**Visitor Manager** (the role has almost nothing in the app today, so the desk becomes its app):
- **Home:** the light "Today" hero is replaced by a **DeskHero**: a `SummaryHero` with module `visitors`, icon `DoorOpen`, label "In the building", value = `stats.inside`, an info chip "Waiting · N" that opens the board, and the action **Open kiosk**.
  - Below it, a `CategoryGrid` with 4 tiles: Visitor desk, Kiosk mode, Visitor log, QR code.
  - **Needs you** lists the desk's waiting visitors (pending and no_response from `/visitors/today`), the same rows as Inbox.
- **Inbox:** a new queue kind `desk` (label "At reception"). It is fed by `/visitors/today` filtered to pending or no_response and reuses `VisitorItem` (`inbox/[kind]/[id].tsx`). The "Their host" card becomes "<hostName>" and the decider becomes "You, for <host>".
  - `useInbox` needs a branch: `canRunDesk(user)` → desk queue, alongside the host queue for super_admin.
- **More:** tiles Visitor desk · Kiosk mode · Visitor log · QR code · Invites · Help & support · People. Edit `menu.ts:50` and add desk tiles under the `canRunDesk` check.
- **+ (CreateSheet):** "Invite a visitor" (→ `/visitors/invite`, now allowed for the Visitor Manager) and "Start kiosk".

**Super Admin:** More gets a **Visitor desk** tile (`navFor` injects `visitors-desk` for desk roles). It keeps its own Visitors tile. Inbox keeps the host queue only (the desk queue is opt-in via the board, to avoid flooding the owner's inbox).

**Routes (new):**
- `src/app/(app)/desk/index.tsx` (board)
- `desk/log.tsx`
- `desk/qr.tsx`
- `desk/kiosk.tsx` (registered with `presentation:'fullScreenModal'`, `gestureEnabled:false`, `animation:'fade'` in `(app)/_layout.tsx`)

Every desk screen starts with `if (!canRunDesk(user)) return <Redirect href="/" />` (the server still enforces 403).

### 4.2 Screens

**A. Visitor desk board: `desk/index.tsx`** (web: VisitorTodayBoard)
- `Screen` + `NavHeader title="Visitor desk"`, pull-to-refresh, and `refetchInterval: 10_000` while `useIsFocused()` (the web polls every 10 s).
- `SummaryHero`: "Inside now" = `stats.inside`, with the sub-line "N today · N waiting".
- `TwoUp` of `StatTile`s: Waiting / No answer / Rejected / Total. A tap filters the list.
- **Waiting for a host** (shown only when there are any): `AccountRow`s reusing `VisitCard`'s look, with sub = "to meet <host> · Arrived 10:42 AM · purpose" and action pill "Respond". The row opens a **VisitSheet**:
  - a large `VisitPhoto` (96)
  - a `SummaryCard`: Phone (tap → `Linking.openURL('tel:')`), Meeting, Purpose, Arrived, Source
  - a muted line: "You're answering for <host> — it's recorded as you, and the visitor gets a WhatsApp."
  - footer `ActionRow`: **Turn away** (secondary, `Alert.alert` confirmation, as the Inbox does) and **Let in** (`SwipeToConfirm` "Swipe to let in").
  - A 409 shows a toast "Already decided" and refreshes.
- **Inside now:** an `ActivityList` of approved visits not yet checked out. The row opens VisitSheet with footer **Check out** in a `ConfirmSheet` ("Check out Rohan Mehta?", FromTo "Inside → Left", `SwipeToConfirm` "Swipe to check out"). This is irreversible.
- **Earlier today:** an `ActivityList` of the rest with a `StatusPill` (reuse `visitStatus`), "by <decidedBy> (<via>)".
- Empty: `EmptyState` "No visitors yet today", with a "Start kiosk" button. Error: `ErrorState` with retry. Loading: `SkeletonList avatar`.

**B. Visitor log: `desk/log.tsx`** (web: VisitorLog)
- Filter row:
  - `PillSelector` range: Today · 7 days (default) · 30 days · Custom. Custom opens a `Sheet` with two `@react-native-community/datetimepicker` dates (already installed).
  - `PillSelector` status: All / Waiting / Approved / Rejected / No answer / Left.
  - `PillField` search, leading search icon; submit on return, plus a 400 ms debounce.
- The list is a FlashList (`@shopify/flash-list`, installed) grouped by day like `history-list.tsx`. Rows reuse the history row style, and a row opens a read-only VisitSheet.
- A footer count: "Showing N visits". If N = 2000, show a banner: "Showing the newest 2,000 — narrow the dates."
- **Web-only:** none. The web has no export either. A CSV export is **not proposed** (it would add expo-sharing of a generated file; possible later with no server change).

**C. QR code: `desk/qr.tsx`** (web: VisitorQrPage)
- `Card` with the QR drawn in `react-native-svg` from a pure-JS encoder (see §5). The URL is `DASH_URL + path` (`src/config.ts`), **not** a hard-coded host.
  - Company name above it, the link in a muted mono line.
- Buttons:
  - **Share link**: React Native `Share.share`, no dependency.
  - **Share QR image**: `react-native-view-shot` `captureRef` → `shareFile(uri,'image/png')` (the existing `lib/files.ts` helper).
  - **Poster (PDF)**: `expo-print` `printToFileAsync({html})` with the poster HTML from dash.html:35788 and the QR as inline SVG → `shareFile(pdf)`. `Print.printAsync` is an alternative for direct printing.
- **Regenerate QR code**: a danger `Button` → `ConfirmSheet` titled "Make a new QR code?" with a red `Banner`: "Every printed poster, saved QR image **and any running kiosk** stops working now." Then `SwipeToConfirm` "Swipe to regenerate", then a toast. It also invalidates the kiosk's cached QR query.

**D. Kiosk mode: `desk/kiosk.tsx`** (web: VisitorKioskPage + VisitKioskOverlay + VisitWizard). Phone or tablet, portrait (app.json `orientation: portrait`; iOS `supportsTablet:false`).
- **Entry:** a pre-screen card that explains it, as the web does, then **Start kiosk**. Fetch `/visitors/qr` once to build `base = /public/visit/<tid>/<token>`, then call `GET base/employees` to validate the link and get `companyName`.
- **Chrome:**
  - `useKeepAwake()` (expo-keep-awake)
  - `<StatusBar hidden />` (expo-status-bar)
  - Android `NavigationBar.setHidden(true)` (expo-navigation-bar), restored on exit
  - `BackHandler` returns true (Back does nothing)
  - `gestureEnabled:false`; the tab bar is not shown (modal route)
- **Steps** (state machine ported from VisitWizard). Big type and targets ≥ 64 dp; the visitors palette accent comes from tokens, not `#FFC928`.
  1. `start`: "How can we help you today?" with two large `ListRow`/`AccountRow` options, "I'm here to meet someone" and "I have an invite code". Below: "Or check in on your own phone" with the QR (the same component as screen C).
  2. `host`: a `PillField` "Type a name…". At 2+ letters, wait 250 ms, then `GET base/employees?q=`. Results are `ListRow`s with `Avatar` initials + job title. Empty: "Nobody matches that name. Check the spelling, or ask the security desk."
  3. `selfie`: a live front-camera `CameraView` (expo-camera) with a round shutter, then `takePictureAsync({quality:0.8})`, then `ImageManipulator` resize to width 640 and save as JPEG 0.7 base64. Re-encode lower if over 550 KB.
     - Preview with Retake / **Use this photo**.
     - Fallback when permission is denied: `ImagePicker.launchCameraAsync({cameraType: front})` via `lib/files.ts pickImage('camera')` (needs a 640 px variant).
  4. `details`: `PillField`s for name and mobile (`mobileOk`); `SelectTiles` for the 6 purposes; a `PillField` when the purpose is Other; a consent row (Switch + **exact web consent text**). Button "Notify <first name>".
  5. `waiting`: a large illustration (reuse a kit empty-state icon on a frosted circle) and "Waiting for <host>". Poll `base/status/:id` every 5 s.
  6. Result screen (approved / rejected / no response) with the web's copy and the bar "Next visitor in 15s · Done" (auto reset).
  7. `code`: the kit's **`OtpBoxes` + `NumericKeypad`**. This is exactly Payno's code UI: 6 digits, no system keyboard. Calls `POST base/invite`.
  8. `invite_selfie` → `POST base/invite/:id/arrive` → `invite_done` "You are checked in", with auto reset.
- **Errors:**
  - A 404 from any public call means the token was rotated or is invalid. Show "This kiosk's QR was regenerated — exit and start again".
  - A 429 shows the server's message ("Too many attempts. Please wait N minutes…") on a calm card.
  - Network failure shows a "Can't reach the check-in service — retrying" card that retries every 10 s, like the APK.
- **Exit:** a small, low-contrast "Exit kiosk" text button bottom-left opens a `Sheet` with a password `PillField` → `POST /visitors/kiosk/exit`. A 403 shows inline "That password is not right." The limit is 10 attempts per 10 min.
  - Option, recommended: offer device authentication first (`expo-local-authentication`, already used by `auth/app-lock.tsx`), then fall back to the password.
  - Reason: a Visitor Manager who signs in by **WhatsApp OTP may have no DASH password at all**, so a server-password-only exit could trap them.
- **Hard lock:** Expo Go cannot call Android `startLockTask`. Tell the desk to turn on the OS-level **App pinning** (Android Settings → Security) or **Guided Access** (iOS). Both work with any app and need no code.
- **Uses `apiFetch`, not raw fetch.** Public routes ignore the bearer (server.js:1451), never return `auth_required`, and so cannot sign the desk out. They also flow through the demo server automatically.

**E. Invites (desk).** Reuse `/visitors/invite` and `/visitors/invitations` as they are; they show the desk user's own invites, the same as the web's Invites tab. Changes needed:
- allow `visitor_manager` into those two routes (they are not gated today; only the menu hides them)
- add the More tile and the CreateSheet entry

**F. Stays web-only:**
- the public `/visit/...` wizard (visitors have no app)
- the host WhatsApp decision HTML page
- the Super Admin **WhatsApp template reference**: copy-paste text for WhatsApp Manager setup, a desktop task

The two Config numbers (timeout, retention) could be a small Super Admin sheet (`PUT /tenants/:id`); that belongs to the Config port.

---

## 5. Expo Go (SDK 57) feasibility and dependencies

`package.json`: `expo ~57.0.27`, RN 0.86.3.

| Need | Module | In Expo Go (v57 docs) | Installed? | Action |
|---|---|---|---|---|
| Live selfie preview | `expo-camera` (`CameraView facing="front"`, `takePictureAsync({base64, quality})`) | Yes ("Included in Expo Go"). Only one preview at a time; shoot after `onCameraReady`. | No | `npx expo install expo-camera`. JS only for Expo Go; add the config plugin camera-permission text later for store builds. |
| Selfie fallback / resize | `expo-image-picker`, `expo-image-manipulator` | Yes | Yes | — |
| Keep screen on | `expo-keep-awake` (`useKeepAwake`) | Yes | Transitive only (`expo` depends on `~57.0.2`) | `npx expo install expo-keep-awake` to make it a direct dependency. |
| Hide Android nav bar | `expo-navigation-bar` `setHidden(true)` (setVisibilityAsync is deprecated in 57) | Yes | No | `npx expo install expo-navigation-bar`. Optional; with edge-to-edge it may be cosmetic. Verify on device. |
| Hide status bar / block Back | `expo-status-bar`, RN `BackHandler` | Yes | Yes | — |
| Exit via device auth | `expo-local-authentication` | Yes | Yes | — |
| **Draw a QR** | none in Expo; `react-native-svg` is installed (15.15.4) | n/a | — | **New pure-JS dependency**: a QR encoder such as `qrcode-generator` (MIT, no native code, no deps), rendered as `<Path>` in react-native-svg. Pin an exact version. `react-native-qrcode-svg` also works, but it pulls in `qrcode` + `text-encoding`. **This needs owner sign-off**, because REFERENCE-COMPONENTS.md §4 says "No new dependencies". Without it, the QR screen and the kiosk's "own phone" QR can only share the link. |
| Share QR as PNG | `react-native-view-shot` `captureRef({format:'png', result:'tmpfile'})` | Yes | No | `npx expo install react-native-view-shot`. Optional; PDF poster or link sharing are alternatives. |
| Poster PDF / print | `expo-print` (`printToFileAsync({html})` → PDF uri, `printAsync`) | Yes | No | `npx expo install expo-print`. Optional. |
| Share sheet | `expo-sharing` (via `lib/files.ts shareFile`) | Yes | Yes | — |
| QR **scanning** | `expo-camera` barcode (`barcodeScannerSettings:{barcodeTypes:['qr']}`) | Yes | — | **Not needed.** Invite passes carry a typed 6-digit code, not a QR, and visitors scan the poster with their own phones. |
| Screen pinning / lock task | native `Activity.startLockTask` | **No** (needs a dev build + native module) | — | Use OS App pinning / Guided Access instead (§4.2 D). |
| Landscape kiosk on a tablet | `expo-screen-orientation` `unlockAsync` | Yes | No | Optional. The design is portrait-first; iOS `supportsTablet:false` means an iPad runs it as a phone app. |

---

## 6. Demo fixtures (persona "Afzal Visitor Manager", `demo/personas.ts:243`)

The persona already exists: role `visitor_manager`, id `demo-visitor-manager` via `personaUserId`, `hr([])`, no punch.

1. Update its `note` and the role tour (`role-tours.ts:273,378`), and `docs/DEMO-ACCOUNTS.md` lines 78, 101 and 141. Afzal Visitor Manager becomes: "Visitor desk, kiosk, log, QR on the phone".
2. New file `src/demo/fixtures/visitor-desk.ts` (spread into `routes` in `demo/server.ts`):
   - **`GET /visitors/today`**: about 7 tenant-wide visits for today, for hosts from `fixtures/org.ts` (e.g. Naveen Kumar `u-naveen`, Arvind Menon `u-arvind`, Deepa `u-deepa`) plus one for `DEMO_USER`:
     - 2 `pending` (one 3 min old, one 8 min old)
     - 1 `no_response`
     - 2 `approved` with no checkout (Inside)
     - 1 `checked_out`
     - 1 `rejected`
     - one `source` each of qr, kiosk and invite
     - `photoUrl:''` (initials) and one `photoPurged:true`
     - `stats` computed the server's way (visitors.js:570-581)
   - **`GET /visitors/log`**: 30 days of about 60 visits from the same generator. Apply `from`/`to`/`status`/`q` exactly like visitors.js:586-600 (filter on `workDate`, `q` over name, mobile, host and purpose).
   - **`POST /visitors/:id/check-out`**: 404 for an unknown id, 409 "That visitor is already checked out.", otherwise set `checked_out` and `checkOutAt`.
   - **`POST /visitors/:id/decide`**: the existing handler in `fixtures/visitors.ts:129` only searches the host's `VISITS`. Either export one shared tenant array that the host fixture filters by `hostUserId === DEMO_USER.id`, or have the desk fixture try its own array first. Keep the 409 text.
   - **`GET /visitors/qr`**: `{ok, tenantId: DEMO_TENANT_ID, token:'demo-qr-token', path:'/visit/<tid>/demo-qr-token', companyName:'Tamada Media (Demo)'}`.
   - **`POST /visitors/qr/regenerate`**: rotate to `demo-qr-<n>`. The public handlers must then 404 the old token, so regenerating visibly breaks a running demo kiosk.
   - **`POST /visitors/kiosk/exit`**: accept the demo password `Demo@123` (the email sign-in demo), otherwise 403 "That password is not right."
   - **Public routes** (paths arrive as `/public/visit/...`):
     - `GET …/employees?q` matches `fixtures/org.ts` people, keeping only `{id, name, jobTitle, dept, hasAvatar:false}`, ≤25, and returns `[]` when `q` is shorter than 2.
     - `POST …/:token`: validate as the server does (name, mobile 10-15 digits after normalising, purpose, `consent===true`), push a `pending` visit to the shared array, and return `{visitId, status:'pending', hostName, hostHasMobile:true}`.
     - `GET …/status/:id`: auto-decide ~12 s after creation (approve most; reject when the visitor name contains "test"), so the kiosk shows a result in the demo.
     - `POST …/invite {code}`: match the host's `INVITES` whose `visitDate === today()`. Add one active invite **for today** (code `482615`, guest "Kavya Reddy") because the current fixtures only have future and past ones. Return 404/409 with the server's texts.
     - `POST …/invite/:id/arrive`: create an `approved`, `source:'invite'` visit and mark the invite `used`.
3. Pass download stays unavailable in demo (`downloadAuthed` throws "Downloads are not available in the demo account.", lib/files.ts:74). QR, PNG and PDF are generated on the phone, so they work in the demo.
4. Optionally give the Super Admin persona the same desk fixtures (they are tenant-wide, so no persona switch logic is needed).

---

## 7. Effort and risks

| Screen / piece | Effort |
|---|---|
| `api/visitor-desk.ts` hooks + `canRunDesk` + menu, CreateSheet and Home entries | S |
| Desk board + VisitSheet + check-out ConfirmSheet | M |
| Inbox / Needs-you desk queue for the Visitor Manager | S–M |
| Visitor log (filters, FlashList, day groups) | M |
| QR screen (encoder + svg, share link, view-shot PNG, print PDF, regenerate) | M |
| Kiosk mode (camera selfie, wizard state machine, invite code with OtpBoxes/keypad, polling, auto-reset, exit, chrome lock) | **L** |
| Invites for the desk (reuse) | S |
| Demo fixtures (desk + public + shared visit store) | M |
| Docs / persona / tour copy | S |

**Risks and notes**
1. **Public rate limits are per IP**, and a lobby device is one IP: **10 check-ins / 10 min**, 12 invite codes / 10 min, 60 name lookups / min (server.js:1243; visitors.js:306, 332, 492, 512).
   - A busy morning on one kiosk, or many visitors on office Wi-Fi behind one NAT, gets 429s. The web kiosk has the same limit today.
   - Optional server change: let a request carrying a valid **desk session** (`visitor_manager`/`super_admin` of that tenant) skip or raise the public check-in limiter, or key it by `ip + tenant token`. In visitors.js:331-332, wrap `rateLimit` in a middleware that checks `req.headers.authorization`.
   - This is **not required** for the port.
2. **Kiosk exit needs a DASH password.** OTP-only users may not have one. Device auth is proposed as the primary path (client-side only). If parity with the web's server-side check is mandatory, the Visitor Manager must set a password first (Profile → Password exists: `/auth/change-password`).
3. **There is no real lock in Expo Go** (no `startLockTask`, Home and Recents still work). Rely on OS App pinning or Guided Access. The `android-visitor-kiosk` APK remains the hardened option.
4. **Regenerating the QR kills running kiosks** (the old token is held in `base`). The kiosk must handle a 404 gracefully, and the regenerate copy must say so.
5. **Check-out is unguarded server-side.** It accepts any status (visitors.js:603-612). The app must only offer it for approved visits with no `checkOutAt`. It cannot be undone.
6. **Deciding sends a WhatsApp message to the visitor** and is recorded as the desk user. Use SwipeToConfirm for Let in, and a confirmation for Turn away.
7. The log returns up to 2000 rows, each with a freshly signed photo URL. Default to 7 days. `VisitPhoto` already caches by visit id (`cacheKey`), so re-signed URLs do not re-download.
8. **CEO/COO:** `menu.ts` treats them like super_admin, but the desk server check does not. `canRunDesk` must test the exact role.
9. **Privacy:** the desk shows faces and mobiles. Keep the desk queries out of the persisted TanStack cache (`query-async-storage-persister`) with a `meta`/`gcTime` opt-out, so visitor photos and phones are not written to disk on a shared lobby device.
10. **Selfie size:** the server rejects photos over 600 KB (visitors.js:60, 193). Always resize to 640 px and JPEG ≤0.7, and step quality down until ≤550 KB, as `visitShrink` does.
11. Adding the QR encoder is a new JS dependency. It needs approval (REFERENCE-COMPONENTS §4).

---

## 8. `android-visitor-kiosk/`: what it is and how it authenticates

- **What:** a ~200-line Java WebView shell (`src/com/tamadamedia/dashvisitors/MainActivity.java`, `KioskWebViewClient.java`, `KioskChromeClient.java`, `AndroidManifest.xml`). It is built **without Gradle** by `build.sh` (aapt2 → javac → d8 → zipalign → apksigner).
  - minSdk 21, targetSdk 34, version via `VERSION_CODE`/`VERSION_NAME`.
  - Signing key in `~/.dash-android/` (`dash-visitors.jks` + `keystore.properties`; git-ignored, must be backed up).
  - Output goes to `dist/` (`dash-visitors-latest.apk`).
- **It has no visitor logic.** It opens `START_URL` (default `https://dash.tamadamedia.in/`, baked into `assets/start_url.txt`, must be https; MainActivity.java:58, 91-100). Every dash.html deploy reaches the tablet without a reinstall.
- **Authentication: none of its own.**
  - The Visitor Manager **signs in to the DASH website inside the WebView** (README "Set up a tablet" step 3). The normal web session is then used: the bearer token in WebView `localStorage` (`dash_token`, dash.html:30060, plus `dash_session`), via `setDomStorageEnabled(true)` (MainActivity.java:66). Cookies are accepted (line 72).
  - The session survives restarts and APK updates signed with the same key.
  - The staff member then opens **Kiosk Mode → Start kiosk mode**. The kiosk calls the public `/api/public/visit/<tenant>/<token>` routes with the token from `GET /visitors/qr`.
  - Leaving kiosk mode uses the web's `POST /visitors/kiosk/exit` password check.
  - The user-agent gets the suffix `DASHVisitorKiosk/1` (line 71), but **nothing on the server or in dash.html reads it**.
- **What the shell adds:**
  - `FLAG_KEEP_SCREEN_ON` (56)
  - immersive sticky full screen (160-171)
  - `startLockTask()` screen pinning (88)
  - Back disabled (158)
  - camera permission asked up front, and granted to `PermissionRequest`s **only from the DASH host** and only for video (79-81, 115-128)
  - a file chooser for the `<input capture>` fallback (KioskChromeClient 66-78)
  - only same-host navigation (`about:`, `blob:` and `data:` allowed, everything else swallowed; KioskWebViewClient 16-26)
  - a friendly offline page with a 10 s retry (103-112)
  - renderer-crash `recreate()` (KioskWebViewClient 38-43)
  - `allowBackup=false`, no cleartext, file and content access off, WebView debugging off
- **Relation to the Expo port:** the app's Kiosk mode (§4.2 D) can replace it for ad-hoc use on a phone or tablet in Expo Go. However, the APK's lock-task pinning and always-on behaviour cannot be done from Expo Go. Keep the APK as the recommended lobby setup until the app has a dev or store build with a lock-task module. Nothing in the APK needs to change for this port.
