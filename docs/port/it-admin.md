# Porting the IT Admin website screens to the app

This doc covers the IT Admin's work that today exists only on the website (`dash.html`):

- **Assets**: the inventory, plus assigning and returning items.
- **Software subscriptions.**
- **Rooms and shooting locations**, with booking purposes and booking cancellation.
- **IT tickets:** the Service Desk, plus "raise a ticket on someone's behalf".
- **Posting news.** IT Admin is allowed to post.
- **Support Centre directory:** branch Wi-Fi and the staff lists. These are side items.

Everything below was read from the code. Line numbers refer to `dash.html`, `server.js`, `routes/*.js`, `subscriptions.js` and `mobile/src/**` as they stand today (2026-10-21).

**Hard rule:** the app may use only existing endpoints. **Result:** every IT Admin feature here can be built with **no server or database change**. Some server holes are listed in §7 as *optional* hardening. The app does not need them to work.

---

## 0. Who sees what on the website

| Item | Website nav source | Role gate | Feature switch (`FEATURE_REGISTRY` dash.html:1373) |
|---|---|---|---|
| Assets (IT Admin's landing page, `DEFAULT_VIEW.it_admin='assets'` dash.html:30257) | `navForRaw` IT Admin list, dash.html:1531 (`{id:'assets'}`) | **only `it_admin`** has it in the nav | `assets` (dash.html:1386) |
| Subscriptions | injected in `navForRaw` dash.html:1532, placed right after Assets for `it_admin` | `canSeeSubscriptionsNav` dash.html:11174: `SUBSCRIPTION_ADMIN_ROLES` = it_admin, super_admin, ceo, coo, master_admin (dash.html:11172) **or** a person named in `tenant.subscriptionAccess` (Config → Subscriptions Access, `SubscriptionAccessCard` dash.html:11817). master_admin is filtered out of the nav. | `subscriptions` (dash.html:1394) |
| Rooms & Locations | IT Admin list dash.html:1531 (`{id:'rooms'}`), drawn under "System" by `navOrganize` dash.html:1586 | **only `it_admin`** | `rooms` (dash.html:1385) |
| Service Desk | IT Admin list dash.html:1531. Super Admin, CEO and COO get it through `n.ceo=n.super_admin`. Admin, HR and app_manager also have it. | Each role sees a different slice (§1.4) | `servicedesk` (dash.html:1387) |
| Tasks (= "raise on behalf", not a task list) | IT Admin list dash.html:1531 (`{id:'tasks'}`), which renders `ITTaskOnBehalf` (dash.html:6988 → 6842) | it_admin | `tasks` (dash.html:1380) |
| Announcements (post) | every role's list. Creating needs `ANNOUNCEMENT_CREATOR_ROLES` = hr, it_admin, super_admin, ceo, coo (dash.html:11866), or a name in `tenant.announcementCreators` | it_admin may post | `announcements` (dash.html:1388) |
| Device Monitoring | `navFor` injection dash.html:1448 (next to Assets) | TM360 roles | `devices`. **Out of scope:** covered by the Managers/Admins port doc. |
| Employee Roster | IT Admin list | — | **Out of scope:** covered by the HR port doc. |

`tenantFeatureOn` (dash.html:1407) treats a missing flag as on. The app already ports it as `mobile/src/lib/access.ts` `tenantFeatureOn`.

**Routing:**
- Role views go through `ITAdminViews` (dash.html:6988), called at dash.html:30512.
- Subscriptions goes through `CROSS_ROLE_VIEWS.subscriptions` (dash.html:30477). It opens only when `navFor` lists it.

---

## 1. Website features, step by step

### 1.1 Assets: `AssetCatalog` (dash.html:20140–20982)

**Helpers**
- `AST_ICONS` / `astIconFor` (dash.html:20106–20138) pick a category icon from the type text (laptop, desktop, phone, tablet, monitor, printer, power, furniture, vehicle, software, box).
- `EMPTY_FLT` is defined at 20139.

**On load**
1. `GET /assets` into the global `ASSETS` (20176–20183). On failure it shows the "Could not load assets / Retry" empty state.
2. `GET /users` and `GET /whitelist` are fetched fresh into `USERS`/`WHITELIST` (20167–20174). This builds the employee-number → name lookup `empNameFor` (20142). The lookup normalises "10249.0" to "10249" and allows a fuzzy suffix match for IDs of 3+ characters.
3. **Self-heal write** (20187–20206). For every asset that has `assignedToEmpNo` but `status!=='assigned'` or no `assignedTo`, it sends `PUT /assets/:id {status:'assigned', assignedTo, assignedToEmail}`. The server does the same in the background on GET (routes/assets.js:48–64). **The app should not repeat these writes** (§7).
4. `GET /upload_batches` is filtered to `type==='assets'` (20230). It feeds the bulk-upload history.

**Tabs** (`TABS` 20494)

*Summary* (20651)
- Six KPIs, each clickable to a filtered list: Total (with total ₹ value), Assigned, Available, Pending acknowledgement, Warranty expiring within 60 days, Warranty expired.
- A "By category" table (Total / Assigned / Available).

*Assigned Assets* (20667)
- A search box and a table: Employee (with a "⚠ No record found · Fix" link when the employee number matches nobody), Asset, Asset ID, Assigned On, Acknowledgement, and a ⋮ menu.

*Asset Acknowledgement* (20672)
- Chips: All assigned / Pending / Acknowledged, with counts.
- The same table as Assigned Assets.

*Asset List* (the default, 20573)
- **Left rail:** categories grouped by `catLabel`/`kindOf` (20460–20469). The grouping:
  - merges the Mac family under one "Mac" type (`MAC_FAMILY_RE`);
  - merges labels that differ only in case or spaces.
- **Filters:** Location, Condition, Status, Warranty status, a warranty-expiry date range, and free-text search (Asset ID / name / serial / employee number / employee name). "Clear N filters" resets them.
- **Table:** Name + serial, Asset ID, Location, Condition badge, Assignment status, Acknowledgement, Warranty, Assigned employee, ⋮.
- **Paging:** 10, 25, 50 or 100 rows per page.
- **Header buttons:** "+ Add {type}", "Bulk Add Inventory", "⬇ Export" (filtered view).
- **⋮ More menu:** "Download bulk-add template", and **"Delete all assets…"** (20608–20612 → `deleteAllAssets` 20403, which sends one `DELETE` per asset).

*Asset Categories & Types* (20679)
- Category → type tree with counts. Clicking a row opens the filtered list.

*Reports* (20698)
- Four Excel downloads: complete register, assigned, pending acknowledgements, warranty expiring within 60 days. They are built by `exportAssetsExcel` (20419), which uses SheetJS plus a letterhead.
- Bulk upload history, with a re-download of each original sheet.

**Header:** "⬇ Export Report" with two options, filtered view or complete data (20558–20572).

**Row ⋮ menu actions** (20718–20730)

- **View details:** a modal (20926–20980).
  - A description banner and a 15-field grid. The acknowledgement field shows only if `ackToken` is set.
  - An **Assignment Timeline** built from `history[]`. If the asset is assigned but has no history, one entry is made up from `assignmentDate`.
  - Buttons: **Download Excel** (CSV report, `downloadExcel` 20367), **Download PDF** (jsPDF + autoTable, `downloadPDF` 20384), **Resend Acknowledgment Email** (shown only when pending).
- **Change condition** (`saveCondition` 20355): sends `PUT /assets/:id {condition}`. Values are Good, Fair, Not Working, plus any legacy value already on the asset.
- **Assign to employee** (modal 20759–20812, `doAssign` 20767).
  1. Search employees by employee number or name. The search covers USERS with role employee, professional, manager or admin (`STAFF_MGR_ADMIN_ROLES` dash.html:921), plus whitelist-only people, who get a "Not signed up" badge.
  2. Pick one and press Assign. This sends `PUT /assets/:id {assignedTo:name, assignedToEmpNo, assignedToEmail, assignmentDate:today, status:'assigned', acknowledged:false, acknowledgedAt:null, history:[...old, {action:'assigned', to:name, at}], notify:true}`.
- **Return asset** (modal 20813, `doReturn` 20322).
  1. Enter optional remarks.
  2. Press "Confirm Return". This sends `PUT /assets/:id {assignedTo:null, assignedToEmpNo:'', assignedToEmail:'', status:'available', acknowledged:false, acknowledgedAt:null, ackToken:null, returnNote, returnedFrom, returnedAt, history:[...old, {action:'returned', from, note, at}]}`.
- **Resend acknowledgement email** (`resendAck` 20332): sends `POST /assets/:id/resend-ack {}`.
- **Fix employee link** (modal 20835, `linkEmployeeToAsset` 20347): sends `PUT /assets/:id {assignedTo, assignedToEmail}`.
- **Delete asset…** (`deleteAsset` 20393): asks to confirm, then sends `DELETE /assets/:id`.

**Add Asset** (modal 20731–20758)
- Fields:
  - Asset ID
  - **Name\***
  - **Serial\***
  - Location (default Hyderabad)
  - Category: Electronics, Furniture, Vehicle, Machinery, Software or Other (`ASSET_CATEGORIES` 20232)
  - Type (free text)
  - Purchased On
  - Value ₹
  - Warranty Expires On
  - Warranty Status: Active or Expired
  - Condition
  - Description
- Saving sends `POST /assets` with the full record: `{id:'a'+Date.now(), …, assignedTo:null, assignedToEmpNo:'', assignmentDate:'', status:'available', history:[]}`.
- **There is no "Edit asset" form on the website.** Only condition, assign, return and fix-link change an asset.

**Bulk Add** (modal 20858–20925; `parseFile` 20250, `confirmBulkUpload` 20294)
1. Read an .xlsx/.csv with SheetJS. The 14-column template comes from `dlSample` (20233).
2. Show a preview.
3. Save. This sends one `POST /assets` per row, then `POST /upload_batches {type:'assets', fileName, count, rows}`.

### 1.2 Subscriptions: `SubscriptionsHub` (dash.html:11523–11811)

**On load**
- In parallel: `GET /subscriptions?actorId=me`, `GET /subscriptions/payments?actorId&from&to`, `GET /subscriptions/summary?actorId&from&to` (11540–11555).
- `GET /departments` for the department suggestions (11557).
- If the response is `error`, the screen shows the "denied" card with the server's message (11605).

**Date range** (applies to every tab except Import)
- Pickers for "Spend from" and "to".
- Quick buttons: This financial year (`currentFyRange`, 1 April → today), This month, All time.

**Renewal banner** (11630)
- Active subscriptions with `daysToRenewal ≤ 30`, overdue first.
- Shown in red if any are overdue, otherwise amber. At most 12 chips.

**Overview tab**
- Six stat tiles (`SubStat`): Active, Per month, Per year, Not using (₹/mo and /yr), Spent in range, Missing Keka code.
- A "By department" table with a totals footer.
- A "Month by month" bar list from `summary.byMonth`.

**Subscriptions tab**
- Search across name, team, Keka code, email, owner and comments.
- Department and Status filters.
- Table columns: name + comments, department, plan, status pill, amount + period + USD, per month, per year, renews (coloured by `renewalTone` 11203), Keka code (or a red MISSING tag), login link + account email.
- For managers, an Edit/Delete column.
- Delete asks "Delete X? Its payment history is kept." It sends `DELETE /subscriptions/:id`.

**Payments tab**
- A ledger table: date, software, department, plan, INR, USD, Keka code, comments.
- Managers also see Delete, which asks to confirm and sends `DELETE /subscriptions/payments/:id`.

**Upload past data tab** (managers only; `SubscriptionImport` 11409, parser `parseSubscriptionWorkbook`)
- Reads both sheet shapes: "Renewal Date" → subscriptions, "Transaction Date" → payments.
- Shows a preview, then sends `POST /subscriptions/import {subscriptions[], payments[]}`.

**Header buttons**
- **Export Excel** (3 sheets: Subscriptions, Payments, By Department).
- **Record payment** (`PaymentForm` 11475):
  - Optionally link it to a tracked subscription, which pre-fills name, department, plan, period, Keka code and amounts.
  - Fields: Software\*, Paid on\*, Department, INR, USD, Keka code, Comments.
  - Sends `POST /subscriptions/payments`.
- **Add subscription** (`SubscriptionForm` 11229, also used for Edit):
  - Fields: Name\*, Department (with a datalist), Plan, Billing period (monthly, quarterly, half_yearly, yearly, one_time), Status (active, not_using, cancelled), INR, USD, Next renewal, Keka code, Account email, Login URL, Payee, Payment mode, Owner, Comments.
  - Sends `POST /subscriptions` or `PUT /subscriptions/:id`.
  - **DASH stores no passwords.**

### 1.3 Rooms & Locations: `RoomsLocations` (dash.html:21959–21982)

On load: `GET /rooms?withImages=1` and `GET /locations?withImages=1`. The response includes the base64 photos.

**Conference Rooms tab**
- Table: room, capacity, floor, status, an **active/inactive toggle** (`PUT /rooms/:id {status}`), Edit, and Delete (`window.confirm` → `DELETE /rooms/:id`).
- **"+ Add Room"** opens `AddConferenceRoomPage` (dash.html:21669), a full page:
  - **Name\***, **Capacity\***, **Floor\***.
  - Up to 5 images (JPEG/PNG ≤10 MB, shrunk to 900 px at quality 0.82 on a canvas).
  - Amenities: Projector, Whiteboard, TV Screen, Video Conferencing, AC, Sound System.
  - Internal notes.
  - Sends `POST /rooms {id, status:'active', name, capacity, floor, amenities[], images[], internalNotes}`, or `PUT /rooms/:id` when editing.

**Shooting Locations tab**
- Table: name, city, address, type, image thumbnails, status, toggle, Edit, Delete.
- **"+ Add Location"** opens `AddShootingLocationPage` (dash.html:21411):
  - **Name\***, **City\*** (Hyderabad, Bangalore, Chennai, Mumbai, Delhi, Pune, Kolkata), **Area\***, Type (indoor/outdoor), **Full address\***.
  - Up to 5 images.
  - Availability: opening and closing time, slot length (30/60/120), buffer (0/15/30/60).
  - Booking rules: minimum duration (30/60/120), maximum duration (120/240/480/720), "approval required" plus an approver picked from manager/admin users, "allow multiple".
  - Description; contact person, phone and email; internal notes.
  - Sends `POST /locations` or `PUT /locations/:id`.

**Booking Requests tab**
- Shows **only `type==='rooms'` bookings** from the shared `globalBks` list (the app's `GET /bookings`).
- Sub-tabs: Upcoming, Rejected, Completed. "Past" means `isRoomBookingPast` (dash.html:21820).
- Columns: room, requested by, date, purpose chip, client, slot time (half-hour slot index → HH:MM), status.
- **"Cancel Booking"** (dash.html:21971–21974) runs **with no confirmation** and does three things:
  1. `PUT /bookings/:id {status:'rejected', reason:'Cancelled by IT Admin'}`
  2. `DELETE /room_slot_bookings/:id` for the matching slot row
  3. `DELETE /loc_time_bookings/:id` for the matching time row
- A banner reads: "IT Admin can cancel any booking when the resource is needed for higher-priority use."

**Booking Purposes tab** (`BookingPurposes` dash.html:21842)
- Table: chip, required fields (client name / special requirements), notice, status, show toggle (`PUT /room_purposes/:id {active}`), Edit, Delete.
- Delete asks to confirm, then sends `DELETE /room_purposes/:id`. The server refuses with 409 if any booking uses the purpose.
- The Add/Edit modal has:
  - Name\* (max 40)
  - Colour: 9 swatches (`PURPOSE_SWATCHES` 21835)
  - `requiresClient`, `requiresRequirements`
  - Warning notice (max 400)
  - "Available for new bookings"

### 1.4 Service Desk: `ServiceDesk` (dash.html:21036–21410)

**On load**
1. `GET /tickets` and `GET /tasks`, folded by `reconcileTickets` (20999). A ticket whose task is completed shows as `resolved`.
2. `healResolvedTickets` (21026) writes `PUT /tickets/:id {status:'resolved', …}` back once per page load.
3. `GET /users`, `/departments` and `/leaves` find the **IT & Admin department**: its name matches `/it.*admin|admin.*it/i`, otherwise `/\bit\b/`.
4. That department gives two things:
   - the assignable team: department members, minus Admin-role users, minus anyone on leave today (`isOnLeaveToday` dash.html:1766);
   - **`deptApproverId = itDept.adminId`**.
5. A second effect (21106) re-creates missing tasks for in-progress assigned tickets ("System Repair").

**Who sees which rows** (`baseItems` 21155)
- **Super Admin:** everything.
- **HR:** only "Behaviour & Work" complaints.
- **Admin / app_manager:** only asset requests.
- **IT Admin:** tickets and asset requests. Asset requests still `pending_approval` are visible only if the IT Admin is the department approver (`isDeptApprover` 21144).

**Filters**
- Tabs: All Items / Tickets / Asset Requests. Super Admin also gets Admin Requests / Complaints. Admin gets All / Open / Resolved instead.
- Search: ref no, subject, requester, department.
- Category, Department, Status, Date.
- Export CSV or Excel of exactly what is shown.
- 8 rows per page.

**Columns**
- ID (`refNo` dash.html:1793), category badge, subject or item ("2x Laptop"), comments, from + phone, department, Keka code, date.
- Timeline: received, accepted, resolved and rejected times.
- Status, plus the rejection reason and who rejected it.
- Assigned to, action.

**Actions**
- **Unassigned open ticket or asset request:** "Accept & Assign" or "Reject".
- **`pending_approval` asset request, for the department approver:** "Approve & Assign" or "Reject". Everyone else sees "Awaiting approval by {name}".
- **Accept / Approve & Assign** (`acceptAndAssign` 21261). The modal shows requester details, and a picker lists the IT team. On confirm:
  1. `POST /tasks {id:'tk'+now, title: subject or "2x Laptop — Asset Request", desc, assignee:name, creator:me, status:'pending', source:'ticket', ticketId, startDate:today, requesterName/Phone/Email, dept, kekaCode, urgency, category}`. **If this fails, it stops.**
  2. `PUT /tickets/:id {status:'in_progress', assignedTo:name, acceptedAt, [approvedBy, approvedAt]}`.
- **Reject:** a modal with a **mandatory reason**, then `POST /tickets/:id/reject {reason}`.
- **Admin requests and complaints** (Super Admin, and HR for B&W) use a status dropdown: open, in_progress, resolved, closed, rejected. Choosing rejected opens the reject modal. Otherwise it sends `PUT /tickets/:id {status, statusUpdatedBy, statusUpdatedAt, acceptedAt|resolvedAt}`.
- The assigned IT person finishes the work in **My Tasks**. That flow already exists in the app.

### 1.5 Raise on behalf: `ITTaskOnBehalf` (dash.html:6842–6987)

**Who can be picked**
- `GET /users`, `/whitelist`, `/projects`, `/tickets`.
- Anyone except master_admin and announcement_viewer, plus whitelist-only people ("Not signed up yet — will show in their history once they log in").

**Raise Ticket**
- Fields: Employee, Type (technical, hardware, software, access, other), Priority (low, medium, high, critical), Subject, **Keka code\*** (ProjectSearch), Description.
- Sends `POST /tickets {category:'ticket', status:'open', date, createdAt, kekaCode, from, raisedByName, fromEmail, fromId, raisedById, fromPhone, dept, raisedOnBehalfBy, raisedOnBehalfById}`.

**Asset Request**
- Fields: Employee, Asset type (Laptop, Monitor, Keyboard, Mouse, Headset, Camera, Microphone, Hard Drive, USB Hub, Other), Quantity, Urgency (normal/urgent), **Keka code\***, Reason.
- Sends `POST /tickets {category:'asset', status:'pending_approval', …}`.

**"Recently Raised by You"**
- Tickets where `raisedOnBehalfById===me`.

### 1.6 Posting news: `AnnouncementsPage` (dash.html:19390) / `AnnouncementForm` (dash.html:18901)

- IT Admin is a creator (dash.html:11866, server.js:7614). The form is shared with HR and leadership:
  - Announcement or Pop-up
  - Type: text, link, image, video, file
  - Branches, expiry, schedule, Home banner image, CTA
- The images are shrunk on a canvas before upload.
- **This screen is specified in the HR port doc ("posting news").** IT Admin reuses the same compose screen. The only IT-specific detail is the gate, which must include `it_admin`.

### 1.7 Support Centre directory, admin side: `SupportView` (dash.html:29187)

Applies when `isITAdmin` (it_admin, super_admin, ceo, coo; dash.html:29219).

- **Wi-Fi:** add `{branch, wifiName, password}` with `POST /support_wifi`; delete with `DELETE /support_wifi/:id` (29276–29277).
- **Office staff:** add (`POST /support_staff`), edit (`PUT`), toggle active, delete.
- **Temp staff:** `POST /support_temp_staff {…, days≥1}`. The entry expires after N days. Delete is also available.
- **Office request items and complaint types** (Admin/Super Admin only): `POST` and `DELETE /support_branches`.
- The app today shows these **read-only**: `mobile/src/app/(app)/support/contacts.tsx`, whose header says "Adding or editing entries is an IT Admin task on the website".

### 1.8 Related employee-facing item

- The website Profile has an "Assigned Assets" card: `ASSETS.filter(a=>a.assignedTo===user.name)`, dash.html:28989.
- The app has no "my assets" view. It is a cheap add-on using the same `GET /assets` (§4.6).

---

## 2. Endpoints

**Notes that apply to every endpoint below**
- Every route sits behind the bearer gate. The gate **overwrites `performedById`/`actorId` with the real session id**:
  - in the body (server.js:1488–1492);
  - in the query, **only if that key is present** (server.js:1494–1496).
- `ok()` returns `{ok:true, …extra}` (server.js:1153).
- `assertSameTenant` (server.js:1642) and `ownTenantId` (server.js:1652) are tenant guards only, **not role checks**.

### 2.1 Assets (`routes/assets.js`, mounted server.js:3075)

| Method / path | Line | Role check | Body / query | Response the UI reads | Side effects |
|---|---|---|---|---|---|
| GET `/api/assets` | 22 | **none**, tenant-filtered | — | bare array of assets: `id, assetId, name, description, serial, location, category, assetType, purchaseDate, warrantyStatus, warrantyExpiry, condition, price, status, assignedTo, assignedToEmpNo, assignedToEmail, assignmentDate, acknowledged, acknowledgedAt, ackToken, history[], returnNote…` | In the background it writes fixed names/statuses to the database (48–64) |
| POST `/api/assets` | 67 | **none** | full record; `id` defaults to `'a'+now`, `status:'available'`; tenantId comes from the session | `{ok, asset}` | audit log |
| PUT `/api/assets/:id` | 86 | **none**, same tenant | partial merge (`sbUpdate`). `notify:true` + an employee number means a real assignment: the server mints `ackToken`, sets `status:'assigned', acknowledged:false` | `{ok}` | **Email** (`emailAssetAssigned`, with a one-time ack link hard-coded to `https://dash.tamadamedia.in/api/assets/:id/acknowledge?token=` at line 133) **and WhatsApp** (`waAssetAssigned`) to the assignee; audit |
| DELETE `/api/assets/:id` | 145 | **none**, same tenant | — | `{ok}` | **hard delete**, cannot be undone; audit |
| POST `/api/assets/:id/resend-ack` | 208 | **none**, and **no tenant check** | `{}` | `{ok}` or 400/404 | email + WhatsApp again (re-uses the token) |
| GET `/api/assets/:id/acknowledge?token=` | 168 | **public** (server.js:1371) | — | server-rendered HTML | sets `acknowledged`. The employee clicks this from the email; the app never calls it |
| GET/POST `/api/upload_batches` | routes/upload_batches.js:11/12 | none | — | — | bulk history (web only) |
| GET `/api/users`, `/api/whitelist` | routes/users.js:108, routes/whitelist.js:17 | none (tenant) | — | the assign picker | — |

### 2.2 Subscriptions (`subscriptions.js`, mounted server.js:1686)

**Permission rule.** Permission comes from **`actorId`/`performedById` in the body or query** (`actorIdOf` subscriptions.js:224, `permissions` :249):
- `canAccess`: SUBSCRIPTION_ADMIN_ROLES (:43) or a grant.
- `canManage`: SUBSCRIPTION_ADMIN_ROLES only.

**Pitfall for the app:** `api.get` sends no `actorId`, so every GET would come back as **403 "nobody"**. The app **must append `?actorId=<my id>`**. The gate replaces the value with the true id. DELETE works without it: Express 4's body-parser gives `{}`, and the gate stamps it.

| Method / path | Line | Check | Request | Response |
|---|---|---|---|---|
| GET `/api/subscriptions?actorId` | 625 | canAccess | — | `{ok, subscriptions:[publicSub], canManage, periods:[{id,label}], statuses:[{id,label}]}`. `publicSub` (:271): `id, name, department, plan, period, periodLabel, status, statusLabel, accountEmail, loginUrl, amountInr, amountUsd, monthlyInr, yearlyInr, renewalDate, daysToRenewal, payee, paymentMode, kekaCode, kekaMissing, owner, comments, createdAt/ByName, updatedAt/ByName` |
| GET `/api/subscriptions/summary?actorId&from&to` | 481 | canAccess | dates as YYYY-MM-DD | `{ok, totals:{activeCount, notUsingCount, cancelledCount, monthlyInr, yearlyInr, wastedMonthlyInr, wastedYearlyInr, kekaMissingCount, spendInRangeInr, spendInRangeUsd, paymentsInRange}, byDepartment:[{department, activeCount, notUsingCount, monthlyInr, yearlyInr, wastedMonthlyInr, spendInRangeInr}], byMonth:[{month, amountInr}], range}` |
| GET `/api/subscriptions/payments?actorId&from&to` | 494 | canAccess | — | `{ok, payments:[publicPayment (:308)], canManage}` |
| POST `/api/subscriptions` | 644 | canManage | form fields; `name` required | `{ok, subscription}`; audit |
| PUT `/api/subscriptions/:id` | 661 | canManage | partial; omitted fields keep their old values (`buildSub` :335) | `{ok, subscription}`; audit |
| DELETE `/api/subscriptions/:id` | 684 | canManage | — | `{ok, deleted}`. **Hard delete**; payments are kept |
| POST `/api/subscriptions/payments` | 511 | canManage | `name` and `paidOn` required | `{ok, payment}` |
| DELETE `/api/subscriptions/payments/:id` | 529 | canManage | — | **hard delete** of spend history |
| POST `/api/subscriptions/import` | 549 | canManage | `{subscriptions[], payments[]}` | `{ok, subscriptionsCreated, subscriptionsUpdated, paymentsCreated, skipped[]}`. Payments are **not de-duplicated**: importing twice doubles the spend |

No emails or WhatsApp. A missing table returns 503 with a setup message (:213).

### 2.3 Rooms, locations, purposes, bookings

| Method / path | File:line | Check | Notes |
|---|---|---|---|
| GET `/api/rooms[?withImages=1]` | routes/rooms.js:21 → `listWithOptionalImages` server.js:3126 | tenant only | Without `withImages`, `images` is replaced by `imageCount` (`stripRowImages` server.js:3122). On production, 4 rooms ≈ 391 KB and 10 locations ≈ 2.4 MB with images. **There is no GET by id.** |
| POST `/api/rooms` | rooms.js:24 | **none** | `{name, capacity, floor, amenities[], images[] (data-URL jpeg), internalNotes, status}` → `{ok, room}` |
| PUT `/api/rooms/:id` | rooms.js:41 | **none**, same tenant | partial merge; leaving out `images` keeps them |
| DELETE `/api/rooms/:id` | rooms.js:61 | **none**, same tenant | hard delete |
| GET/POST/PUT/DELETE `/api/locations[/:id]` | routes/locations.js:15/16/31/51 | same as rooms | fields as in §1.3 |
| GET `/api/room_purposes` | routes/room_purposes.js:16 | tenant | array `{id, label, color, bg, active, requiresClient, requiresRequirements, notice, sortOrder}` |
| POST `/api/room_purposes` | :20 | **none** | `label` required, 409 if the name is taken → `{ok, purpose}` |
| PUT `/api/room_purposes/:id` | :55 | **none**, same tenant | 409 if the name is taken |
| DELETE `/api/room_purposes/:id` | :90 | **none** | **409 if any booking uses it** ("Turn it off instead") |
| GET `/api/bookings[?since=YYYY-MM-DD]` | routes/bookings.js:49 | tenant | array. Room bookings have `type:'rooms', resource, requestedBy, requestedById, dates[], startSlot, endSlot, purpose, purposeLabel, clientName, status` |
| PUT `/api/bookings/:id` | bookings.js:193 | **none**, same tenant | `{status:'rejected', reason}`. Rejected/cancelled is final (409, :223). It releases slot locks (:234) and **emails and WhatsApps the requester "Booking Rejected"** (:303 onward) |
| GET/DELETE `/api/room_slot_bookings[/:id]` | routes/slot_bookings.js:16/64 | tenant | DELETE frees the slot locks |
| GET/DELETE `/api/loc_time_bookings[/:id]` | slot_bookings.js:85/119 | tenant | same |

### 2.4 Tickets and tasks (Service Desk)

| Method / path | File:line | Check | Notes / side effects |
|---|---|---|---|
| GET `/api/tickets` | routes/tickets.js:20 | tenant | the whole company's tickets |
| POST `/api/tickets` | tickets.js:21 | none | `{id:'tkt'+now, status:'open', createdAt, …body}`. **Email + WhatsApp** to the raiser (confirmation). Tickets go to IT Admins; asset, admin and complaint requests go to Super Admins; B&W complaints also go to HR |
| PUT `/api/tickets/:id` | tickets.js:91 | **status changes are guarded** (109–145). `canDecide` = it_admin / admin / super_admin / app_manager for tickets and assets. The raiser may only `cancelled`; the assignee may move to `in_progress`/`resolved`. `rejected` is refused here (100) | **Emails and WhatsApps**: approval of a pending asset request (`in_progress`) → the raiser "Asset Request Approved"; `resolved`/`closed` → the raiser; cancel → the handler. Audit |
| POST `/api/tickets/:id/reject` | tickets.js:283 | same matrix (302–305). Reason required. 409 if already rejected, cancelled or resolved | `{ok, ticket}`. **Email + WhatsApp to the raiser** |
| DELETE `/api/tickets/:id` | tickets.js:346 | none | Not used by the UI. **Do not port.** |
| POST `/api/tasks` | routes/tasks.js:25 | none | **De-duplicated by `ticketId`** (31–37): if a task exists, it returns `{ok, task, deduped:true}`. Otherwise it **emails and WhatsApps the assignee "New Task Assigned"** (96–104) |
| GET `/api/tasks`, `/api/users`, `/api/departments`, `/api/leaves`, `/api/projects` | — | tenant | team picker, approver, leave filter, Keka code |

### 2.5 Announcements (server.js)

| Path | Line | Check |
|---|---|---|
| GET `/api/announcements` | 8909 | tenant |
| POST `/api/announcements` | 9119 | `isAnnouncementCreator` (7615). A pop-up needs an image |
| PUT `/api/announcements/:id` | 9139 | creator, same tenant; kind can't change |
| DELETE `/api/announcements/:id` | 9179 | creator; hard delete |

The payload is base64 `fileData` / `homeBannerImage`, with a 12 MB body cap. These screens are shown company-wide on Home, pop-ups and the TV.

### 2.6 Support Centre directory (`routes/support.js`)

| Endpoints | Notes |
|---|---|
| `support_wifi` (68/83/101), `support_staff` (120/135/153), `support_branches` (16/31/49) | **No role check, and POST does not stamp `tenantId`** (`{id, ...req.body}`). The GETs are `tenantScoped` (`sbGetAllFrom` filters `data->>tenantId`), so a row created without a `tenantId` in the body is **invisible to everyone except master_admin**. If the app ports this, it must send `tenantId: user.tenantId` in the body. The server keeps it, and that is still not a server change. PUT/DELETE also have no tenant check. |
| `support_temp_staff` (171/184/208/236) | POST uses `ownTenantId`, requires `days ≥ 1`, and returns `{ok, s}`. GET deletes expired rows itself. |

---

## 3. What the app has today, and what's missing

**Already in the app**
- `src/api/support.ts`: tickets (own only, `useMyTickets`), `useCreateTicket`, `useCancelTicket`, the read-only directory queries, `useDirectoryUsers` (`/users`), `useDepartments`.
- `src/features/support/format.ts`: `refNo`, `ticketStatus`, `typeLabel`, `subjectLabel`, `priorityLabel`, already ported from the website.
- `src/api/tasks.ts` + `src/app/(app)/tasks/*`: the IT person **works** assigned tickets in My Tasks. Start/end needs no code for IT tickets, and `PUT /tickets/:id {status:'resolved'}` runs at the end.
- `src/app/(app)/support/{index,new,requests,[id],contacts}.tsx`: raise, history and the read-only Wi-Fi/contacts.
- `src/app/(app)/announcements/*`: **read-only** news.
- `src/lib/access.ts` (`tenantFeatureOn`, `ROLE_LABEL`), `src/features/more/menu.ts` (`NAV.it_admin = ['tasks','announcements','bounty','accounts','support']`), `src/lib/files.ts` (`pickImage` → compressed data URL; download/share through expo-file-system + expo-sharing).
- Demo: persona **Afzal IT Admin** (`src/demo/personas.ts:226`, dept `dept-it` "IT & Admin", `runs:['dept-it']`). Because of `runs`, `DEPARTMENTS['dept-it'].adminId` is the persona (`src/demo/fixtures/org.ts:250`), so he **is** the asset-request approver.
  - IT team: Naveen Kumar (IT Manager), Ravi Teja, Pooja Rao (org.ts:61–75).
  - Two IT tickets are assigned to him (`fixtures/support.ts`, `fixtures/tasks.ts:180–214`).

**Missing:** everything in §1.1–§1.5 and §1.7 admin side.
- No `/assets`, `/subscriptions`, `/rooms`, `/locations`, `/room_purposes`, `/room_slot_bookings`, `/loc_time_bookings` client.
- No company-wide ticket list, no assign/reject.
- No "raise on behalf", no news compose.

**More tab:**
- IT Admin already fills the **9-tile cap** (`buildMoreMenu` slices to 9): Expense claims, Petty cash, Visitors, My tasks, Help & support, Policies, My team, News, Bounty.
- New IT tools therefore need their own section.

**Demo routes:**
- `src/demo/server.ts` `LIST_ROUTE` lacks `assets|rooms|locations|room_purposes|room_slot_bookings|loc_time_bookings|whitelist`.
- The demo `PUT /tickets/:id` (`fixtures/support.ts` ~line 121) only allows the raiser to cancel or anyone else to resolve. It would refuse "Accept & Assign" (`in_progress`).
- There is no `POST /tickets/:id/reject`.

---

## 4. Mobile design proposal (existing `@/ui` kit only)

### 4.0 Entry point and navigation

**More tab**
- Add a section **"IT desk"** under "Apps".
- It is a `SectionHeader` + `ListCard` of `ListRow`s with a `ModuleBadge`, or a second `CategoryGrid`.
- Each row is shown only when the website would show it. Add a `features/more/admin-menu.ts` beside `menu.ts` that ports the §0 gates:
  - **Service desk:** it_admin / admin / app_manager / super_admin / ceo / coo / hr, if feature `servicedesk` is on.
  - **Assets:** it_admin, if `assets` is on.
  - **Subscriptions:** `canSeeSubscriptionsNav` (needs `tenant.subscriptionAccess` from `useMyTenant`), if `subscriptions` is on, and not master_admin.
  - **Rooms & locations:** it_admin, if `rooms` is on.
  - **Raise for someone:** it_admin, if `tasks` is on.
  - **Post news:** `isAnnouncementCreator`, if `announcements` is on. Better placed as a "+" in the News screen's `NavHeader`.

Row subtitles carry live counts:
- "3 waiting to be assigned"
- "2 asset requests to approve"
- "1 renewal overdue"
- "4 acknowledgements pending"

**Home "Needs you" / Inbox (optional, phase 2)**
- Add pending asset approvals and unassigned tickets to Home's "Needs you" (`features/home/needs-you.tsx`) for IT Admin.
- The data comes from `GET /tickets` with the same `baseItems` rule.
- Do not mix them into the HR approvals Inbox, which is built on `/hr/*` queues.

**FAB `CreateSheet`**
- For IT Admin, add "Raise for someone" and "Add asset".

**New routes (expo-router), under `src/app/(app)/`**

```
service-desk/index.tsx          service-desk/[id].tsx          service-desk/raise.tsx   (on behalf)
assets/index.tsx                assets/[id].tsx                assets/new.tsx
subscriptions/index.tsx         subscriptions/[id].tsx         subscriptions/edit.tsx  subscriptions/payments.tsx
rooms/index.tsx                 rooms/room/[id].tsx            rooms/location/[id].tsx
rooms/bookings.tsx              rooms/purposes.tsx
announcements/compose.tsx       (shared with the HR doc)
support/manage.tsx              (phase 3, Support Centre admin)
```

**New API modules**
- `src/api/assets.ts`, `src/api/subscriptions.ts`, `src/api/facilities.ts` (rooms, locations, purposes, room bookings, slot rows), `src/api/service-desk.ts` (company tickets, reject, accept-and-assign).
- All are TanStack Query hooks using `unwrap()`. Writes invalidate the list keys.
- Subscription and asset queries take `meta:{persist:false}`. Room/location queries with images also take `meta:{persist:false}`: that keeps megabytes of base64 and account emails out of AsyncStorage.

### 4.1 Service desk (S/M/L: **L**)

**List screen**
- `NavHeader` "Service desk" + filter `IconButton`.
- `SummaryHero`: big Numeral "Open" and an info chip "2 need approval · 3 unassigned".
- A `Segmented` control: All / Tickets / Asset requests. Super Admin also gets Office requests and Complaints; Admin gets All / Open / Resolved.
- A `PillSelector` row: Status, Department, Category, Date (`DateField`), and search.
- Then a `FlashList` of `ActivityRow`s:
  - category icon (re-use `features/support/format` `KIND`);
  - subject or "2× Laptop";
  - requester · department · `raisedShort`;
  - a right-hand `StatusPill`. Use "Needs approval" for `pending_approval`.
- Port `reconcileTickets` as a **read-only fold**: tickets whose task is completed show as Resolved. **Do not** port the heal writes or the "System Repair" task re-creation; the website keeps doing those.

**Detail screen**
- A `SummaryCard`: Ref (`refNo`), category, Keka code, raised date, priority/urgency, quantity.
- `FromToCards`: requester → assignee.
- The description.
- An `EventTimeline` of Received, Accepted, Approved by, Resolved and Rejected (with the reason).
- Requester contact actions (call / WhatsApp / email) re-using `features/people/contact.ts`.

**Primary action**
- For an asset request in `pending_approval`, only for the department approver: **"Approve & assign"**.
- For an open, unassigned ticket or asset request: **"Accept & assign"**.
- Either one opens a `Sheet` with a radio list of the IT team: `GET /users` + `/departments` + `/leaves`, the same filter as the web, with on-leave people hidden and the reason shown.
- Then a `ConfirmSheet` (FromTo "Ticket → Ravi Teja", a SummaryCard) and **`SwipeToConfirm`**. It sends emails and WhatsApps, and creates a task.
- Implementation:
  1. `POST /tasks` (body identical to the web).
  2. Stop on error.
  3. `PUT /tickets/:id`.
- Show a `SuccessSheet` at the end.

**Reject**
- A secondary frosted button.
- A `Sheet` with a required `TextField` for the reason, plus `SwipeToConfirm`.
- Sends `POST /tickets/:id/reject`.

**Office requests and complaints** (Super Admin / HR slice)
- A status `MenuSheet` (open / in progress / resolved / closed / reject…).

**Export**
- Web-only for now. Optional CSV via share, see §5.

**Empty states**
- "No tickets waiting".
- The non-approver sees "Awaiting approval by {name}" as an info `Banner`.

### 4.2 Raise for someone (**M**)

`service-desk/raise.tsx`:
1. A `Segmented` control: Ticket or Asset request.
2. A person picker (`Sheet` + search over `/users` + `/whitelist`, with the "Not signed up" `Chip`).
3. `SelectTiles` for the type or asset item.
4. Priority or urgency `Segmented`; a quantity stepper.
5. Keka code through the existing `features/reimbursements/project-picker.tsx`.
6. Subject and description `TextField`s.
7. `ConfirmSheet` + `SwipeToConfirm`, because it emails the IT/Super Admin and the person. The body is the same as the website's `identityFor` (dash.html:6862).

A "Raised by you" list sits on the same screen, filtered to `raisedOnBehalfById===me`.

### 4.3 Assets (**L** for the list and detail; assign/return **M**)

**List screen**
- `NavHeader` "Assets", with "+" (Add) and filter buttons.
- `SummaryHero`: Total count + "₹X total value" chip.
- A horizontal `StatGrid` / `UpcomingCards` row of the KPIs: Assigned, Available, Pending acknowledgement, Warranty ≤ 60 days, Expired. **Tapping one sets the filter**, as on the web.
- A `Segmented` control: All / Assigned / Acknowledgement.
- A category `ChipRow`, using the web's `catLabel`/`kindOf`/Mac-family grouping ported as pure functions in `features/assets/grouping.ts`.
- A filter `Sheet`: location, condition, status, warranty status, warranty-expiry range.
- Search over Asset ID, name, serial, employee number and name.
- A `FlashList` of `MetricRow`/`ActivityRow`:
  - icon from `astIconFor` → lucide (Laptop, Monitor, Smartphone, Tablet, Printer, Zap, Armchair, Car, AppWindow, Package);
  - name, serial · Asset ID;
  - assignee or "In stock";
  - condition `StatusPill`;
  - an acknowledgement dot.
- No paging needed: FlashList handles hundreds of rows.

**Detail screen** (`assets/[id]`, read from the cached list; there is no GET by id)
- A `KeyValueList` of all 15 fields.
- A `Banner` "⚠ Employee number 10249 matches nobody · Fix".
- The assignment `EventTimeline`, including the synthesised entry.
- An `ActionBar`:
  - **Assign** or **Return**, depending on state;
  - **Change condition** (`SelectTiles` Good / Fair / Not working);
  - **Resend acknowledgement** (when pending; confirm first, since it emails and WhatsApps);
  - a ⋮ `MenuSheet` with Fix employee link and **Delete**.

**Assign**
- A person picker over the same pool as the web (STAFF_MGR_ADMIN_ROLES users + whitelist-only).
- Then `ConfirmSheet` (FromTo "MacBook Air → Rahul Verma") + `SwipeToConfirm`. It emails and WhatsApps the employee.
- `PUT` with `notify:true` and the **freshly fetched** `history`: refetch the list first, then append.

**Return**
- A `Sheet` with an optional remarks `TextField` + `SwipeToConfirm`.

**Delete**
- `ConfirmSheet` + `SwipeToConfirm` (danger copy: "This cannot be undone").

**Add asset** (`assets/new.tsx`)
- A one-screen form: `TextField`s, `SelectTiles` for category, `SelectField` for condition and warranty status, `DateField` × 2, a numeric value field.
- Validation: name and serial required.
- Sends `POST /assets`.

**Stays web-only**
- Bulk Add from Excel, the template download and upload history. File parsing needs SheetJS; spreadsheet work is a desk job.
- **"Delete all assets"**: far too dangerous for a phone.
- The Excel/PDF per-asset and register reports. Optionally, a CSV share of the filtered list via expo-file-system + expo-sharing (no new dependency).

### 4.4 Subscriptions (**L**)

**List screen**
- `NavHeader` "Subscriptions"; "+" only when `canManage`.
- A **renewal `Banner`** (red if overdue, amber within 30 days) with tappable chips.
- `SummaryHero` "Per month ₹X" + chip "₹Y/yr · N active".
- `TwoUp` `SparkCard`/`StatTile`s: Not using ₹/mo, Spent in range, Missing Keka code.
- A range `PillSelector`: This FY / This month / All time / Custom (two `DateField`s). The range drives summary + payments.
- `Segmented`: Overview / Subscriptions / Payments.

**Overview tab**
- By-department `MetricRow`s, with per-year and not-using values.
- Month-by-month as a `PillBarChart`/`BarStrip` from `byMonth`.

**Subscriptions tab**
- Search plus department and status chips.
- Rows: name, department · plan, ₹ amount/period, a renewal `DeltaChip` ("in 5d" / "12d overdue"), a status pill, and a MISSING Keka tag.

**Payments tab**
- `ActivityList` grouped by month.
- Swipe or ⋮ → Delete (managers, with `ConfirmSheet`).

**Detail screen**
- `KeyValueList`.
- "Open login" through `expo-web-browser` (already installed).
- Account email with a Share action, or Copy if expo-clipboard is added.
- Edit / Delete for managers.

**Forms**
- **Edit/Add form:** the same 16 fields; period and status as `SelectTiles`; renewal as a `DateField`.
- **Record payment:** a `SelectField` for "Against subscription" (pre-fills the rest), `AmountEntry` + keypad for INR, and a paid-on `DateField`.
- A granted (non-admin) viewer sees everything read-only. `canManage` comes from the response.

**Every GET carries `?actorId=`** (§2.2).

**Stays web-only:** "Upload past data" (xlsx parse) and the Excel export. Optional CSV share.

### 4.5 Rooms & locations (**L** overall)

`rooms/index.tsx` uses a `Segmented` control: Rooms / Locations / Bookings / Purposes.

**Rooms and Locations lists**
- Load **without images** (fast; uses `imageCount`).
- Rows show name, capacity · floor (or city · area · type), an image count, and an inline `Switch`-style toggle (active/inactive, sends `PUT {status}`).

**Room/Location detail and edit screen**
- Fetches `?withImages=1` once (`persist:false`) to show the photo strip.
- Edit form sections follow the website: details, photos, amenities (rooms), availability and rules (locations).
- Times use the `TimeField` picker; slot, buffer and duration values use `SelectTiles`.
- The approver picker covers manager/admin users.
- **Photos** use `pickImage` from `lib/files.ts`, set to 900 px / quality 0.82 to match the web. Up to 5 per resource.
- **On edit, send `images` only if the photos changed.** The PUT merges, so leaving the field out keeps the existing images and saves megabytes of upload.
- Body size limit is 12 MB. With 5 × ~150 KB that is fine.

**Delete room/location**
- `ConfirmSheet` + `SwipeToConfirm`.

**Bookings**
- Sub-segments: Upcoming / Rejected / Completed (port `isRoomBookingPast`).
- Rows: room, requester, date, slot time (`startSlot/2` → HH:MM), purpose chip, client.
- **Cancel** is improved over the web (which has no confirmation): a `Sheet` with an optional reason (default "Cancelled by IT Admin") + **`SwipeToConfirm`**. The copy says "Riya will get an email and WhatsApp".
- Calls:
  1. `PUT /bookings/:id {status:'rejected', reason}`.
  2. Find the matching `room_slot_bookings` / `loc_time_bookings` row (`GET` both; match `bookingId`, otherwise booker + date + slot, as the web does) and `DELETE` it.

**Purposes**
- A list of chips with an active toggle.
- An Add/Edit `Sheet`: name, colour swatches (the 9 web colour pairs live in tokens as a `PURPOSE_SWATCHES` constant), the two "required" switches, a notice `TextField`, and active.
- Delete shows the server's 409 text as-is.

**Empty states:** "No rooms yet — add the first one" with an Add button.

### 4.6 Small extras

- **News compose:** reuse the HR doc's compose screen; extend its gate to `it_admin`. **M** if not already built.
- **"My assets" card on Profile** for every employee: `GET /assets` filtered by `assignedTo===me.name`, or by employee number for a better match. A read-only list. **S.**
- **Support Centre admin** (phase 3, **M**): add/edit/delete Wi-Fi and staff, and temp staff with days, in `support/manage.tsx`. For Wi-Fi, staff and config-list POSTs, **send `tenantId`** (§2.6).

---

## 5. Expo Go (SDK 57) feasibility

`mobile/package.json` already has everything the core port needs:
- **expo-image-picker** + **expo-image-manipulator**: room/location photos.
- **expo-file-system** + **expo-sharing**: CSV export and share.
- **expo-web-browser**: subscription login URL.
- **@react-native-community/datetimepicker**: dates and times.
- **@shopify/flash-list**: long asset lists.
- **expo-haptics**, **react-native-gesture-handler**: SwipeToConfirm.

**No new dependency is needed for the proposal above.** Optional extras, all checked against https://docs.expo.dev/versions/v57.0.0/ as "Included in Expo Go":

| Need | Module | In Expo Go 57? | Why / verdict |
|---|---|---|---|
| Scan an asset's serial barcode or QR tag to find it | `expo-camera` (`CameraView` + `barcodeScannerSettings`) | Yes | Nice for stock-taking. Phase 2. Install with `npx expo install expo-camera`. |
| Per-asset PDF report (web uses jsPDF) | `expo-print` (`printToFileAsync` HTML → PDF) | Yes | Optional; CSV/share covers most needs. |
| Copy an account email or Wi-Fi password | `expo-clipboard` | Yes | Optional; `Share.share` works today with no dependency. |
| Real .xlsx export / import | `xlsx` (SheetJS, pure JS) | Works, it's JS | **Not recommended.** It adds ~1 MB, and bulk import should stay on the website. Use CSV instead. |

**No native module outside Expo Go is required.** QR here means *reading* asset tags. The visitor QR belongs to another doc.

---

## 6. Demo fixtures (persona **Afzal IT Admin**, `src/demo/personas.ts:226`)

**New file `src/demo/fixtures/it-admin.ts`**, registered in `src/demo/server.ts`. Also add `assets|rooms|locations|room_purposes|room_slot_bookings|loc_time_bookings|whitelist|upload_batches` to `LIST_ROUTE`.

**Assets** (~14 rows): `GET /assets`, `POST /assets`, `PUT /assets/:id`, `DELETE /assets/:id`, `POST /assets/:id/resend-ack` → `{ok:true}`.
- MacBook Air M4 assigned to Rahul Verma (acknowledged).
- MacBook Pro assigned to Sanjay Kumar (**pending** ack, `ackToken:'demo'`).
- Mac mini edit workstation EDIT-WS-07 (available).
- Dell 27" monitors ×3 (one "Not Working").
- Sony FX3 camera assigned to Farhan Ali.
- Rode mic, UPS, HP printer.
- An office chair (Furniture).
- A pool car (Vehicle).
- One row with `assignedToEmpNo:'10249'` that matches nobody, to show the **Fix** banner.
- Warranty dates spread so the "≤ 60 days" and "expired" KPIs are non-zero.
- `history[]` entries on a few rows.
- On `notify:true`, set `ackToken`/`acknowledged:false`.

**Subscriptions:** `GET /subscriptions`, `/subscriptions/summary`, `/subscriptions/payments`, `POST/PUT/DELETE /subscriptions[/:id]`, `POST /subscriptions/payments`, `DELETE /subscriptions/payments/:id`.
- ~10 rows: Adobe CC (yearly, Creative), Frame.io, Canva Pro, Google Workspace, Midjourney (`not_using`), Dropbox (renewal in 4 days), Notion (renewal 3 days **overdue**), Zoom (cancelled), a one-time LUT pack, one with an empty `kekaCode`.
- ~20 payments across the current financial year.
- **Compute `totals`/`byDepartment`/`byMonth` with a copy of the server's `summarise`** (subscriptions.js:399; it is pure and exported) so the numbers agree.
- `canManage = persona.role ∈ {it_admin, super_admin}`.
- Other personas get `fail(DENY_READ, 403)`, which shows the denied state.

**Rooms / locations / purposes / bookings**
- Rooms: "Board Room" (12, 3rd floor), "Edit Bay Huddle" (4), "Podcast Studio" (inactive).
- Locations: "Banjara Hills Rooftop" (outdoor), "Studio A — HITEC City" (indoor).
- Images: empty arrays, or one tiny bundled JPEG data URL, to keep the bundle small.
- Purposes: the web FALLBACK five, with "Client meeting" `requiresClient`.
- Make `DELETE /room_purposes/:id` return 409 for a purpose that is in use.
- The current `GET /bookings` fixture (`fixtures/tasks.ts` ~468) lacks room bookings. Add ~6 `type:'rooms'` bookings across upcoming, past and rejected, requested by colleagues.
- Add `GET /room_slot_bookings`, `GET /loc_time_bookings`, and both `DELETE`s → `{ok:true}`.

**Service desk** (extend `fixtures/support.ts`)
- Add company tickets **not** raised by the demo person:
  - 2 open unassigned tickets (Sneha: "VPN won't connect from home", Imran: "Printer jam 2F");
  - 2 asset requests `pending_approval` (Farhan "1× Hard Drive", Kavya "2× Monitor");
  - 1 resolved ticket and 1 rejected one.
- Change `update()` so the demo IT Admin can move a ticket to `in_progress` with `assignedTo`. Mirror tickets.js:109–145 by role, using `currentPersona().role`.
- Add `POST /tickets/:id/reject`: require a reason, set `status:'rejected', rejectionReason, rejectedBy, rejectedAt`, return `{ok, ticket}`.
- `POST /tasks` already de-duplicates by `ticketId` (fixtures/tasks.ts:441).
- `GET /leaves`: add a fixture route returning `[]`, or one IT teammate on leave today (Pooja Rao) to show the on-leave exclusion.
- **Whitelist:** `GET /whitelist` with 2 not-yet-signed-up people, for the "Not signed up" badge.

**News:** the creator gate already allows it_admin. Compose needs `POST /announcements` in `fixtures/announcements.ts`, which currently only has GETs. Shared with the HR doc.

**Docs:** add to `docs/DEMO-ACCOUNTS.md` under Afzal IT Admin: "Try: approve Farhan's hard-drive request and assign Ravi; assign the spare MacBook; cancel a Board Room booking; mark Midjourney Not using".

---

## 7. Effort and risks

### Effort

| Screen | Size |
|---|---|
| IT desk section in More + gates (`admin-menu.ts`) | S |
| Service desk list + detail + accept/approve-assign + reject | L |
| Raise for someone (ticket / asset request) | M |
| Assets list + KPIs + filters + grouping | L |
| Asset detail + assign / return / condition / resend / fix / delete | M |
| Add asset | S |
| Subscriptions overview / list / payments | L |
| Subscription add/edit + record payment + delete | M |
| Rooms & locations lists + toggles | M |
| Room / location add-edit with photos | M |
| Room booking requests + cancel | M |
| Booking purposes | S |
| My assets card (all staff) | S |
| News compose (if not done by the HR port) | M |
| Support Centre admin | M |
| Demo fixtures (it-admin.ts + support.ts changes) | M |

The core (service desk, assets, subscriptions, rooms) is about 3–4 L-weeks of one developer.

### Risks

1. **No server role checks on several writes:**
   - `/api/assets` POST/PUT/DELETE/resend-ack (routes/assets.js:67/86/145/208);
   - rooms, locations and room_purposes writes;
   - `PUT /bookings/:id`;
   - `support_*` writes.

   Any signed-in user in the company can call them. App gating is cosmetic, as it is on the web. Not needed for the port.

   *Optional server hardening*, if the owner wants it later: `requireRole(['it_admin','super_admin','ceo','coo','master_admin'])` on those write routes. Add a tenant check to `resend-ack` and `support_*` PUT/DELETE, and stamp `ownTenantId` on `support_*` POSTs.
2. **Subscriptions return 403 without `?actorId=`** on GETs (server.js:1494–1496 + subscriptions.js:224). Easy to miss, so the API module must add it.
3. **Accept & Assign is two non-atomic writes:** POST task, then PUT ticket.
   - The app must keep the web order and stop when the task fails.
   - A failed second write leaves the task in place. The ticket then shows as unassigned, and a retry de-duplicates by `ticketId`.
   - Assignment is by **name** (`assignedTo`/`assignee`), so two people with the same name collide. This is inherited from the web.
4. **Asset `history[]` is read-modify-write on the client.** A web and an app edit at the same time can lose an entry. Refetch just before assign or return.
5. **Emails and WhatsApps fire on:** assign, resend-ack, ticket approve/reject/resolve, task create, booking cancel. Every one gets a ConfirmSheet with `SwipeToConfirm`, and the copy names who is notified.
6. **Irreversible actions:** asset delete, room/location delete, subscription and payment delete (spend history changes), booking cancel (final, 409 on reopen), ticket reject (final).
   - `DELETE /tickets/:id` and "Delete all assets" are **not** ported.
7. **Payload weight:**
   - `/rooms?withImages=1` and `/locations?withImages=1` (~2.8 MB on production) must load only on the detail screen, with `persist:false`.
   - `/assets` and `/tickets` return the whole company; `/users` and `/whitelist` are large but already stripped of avatars.
8. **The web self-heals data** (asset name/status, ticket resolved-from-task, orphan tasks). The app reads the folded view but must not write those fixes. Otherwise two clients heal at once.
9. **The asset acknowledgement link** in the email is hard-coded to `dash.tamadamedia.in` (routes/assets.js:133). It is fine on production and wrong on staging, which is inherited.
10. **`support_*` rows posted without `tenantId` become invisible** (§2.6). The app must send `tenantId` if it ports Support Centre admin. The website has the same latent bug today.
11. **More-tab tile cap (9)** is already full for IT Admin, so the new tools need the separate "IT desk" section rather than more tiles.
