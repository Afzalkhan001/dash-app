# Port plan: Manager / Admin work (tasks, projects, clients, booking)

Read-only research for bringing the website-only **manager side of tasks, Projects (Keka codes),
Clients and Booking** into the Expo app. Line numbers are for `dash.html` (36,134 lines),
`server.js` (9,884 lines) and `routes/*.js` as they are today.

**Bottom line**
- Every feature here can be built on endpoints that already exist. **No server or database change is
  needed.** Section 8 lists three optional server fixes: two existing bugs and one security gap.
- No new native module and no new npm package is needed. Everything used (date and time pickers,
  document picker, sharing, `Linking`) is already in `mobile/package.json` and works in Expo Go SDK 57.
  `expo-print` is only an option, if we ever want PDFs (section 5).
- The hard parts are booking (slot holds, a 48-slot room grid, overlap rules) and the side effects
  that a few writes trigger: WhatsApp and email messages, tasks created and deleted automatically, and
  slot locks.

Out of scope (other domain files): Team Roster / Work Allocation (`team_roster.js`, `TeamRosterHub`),
Reports, Device Monitoring, Service Desk (IT Admin's "Tasks" page is `ITTaskOnBehalf`
dash.html:6842, which raises **tickets**), and Rooms & Locations **setup** (IT Admin's
`RoomsLocations` dash.html:21959, `BookingPurposes` :21842). Booking **uses** rooms, locations and
purposes read-only and is covered here.

---

## 1. Website features in this domain

### 1.0 Who sees what (gates)

| Nav id | Roles in `navForRaw` table (dash.html:1531; `n.ceo=n.coo=n.super_admin`) | Component that renders | Feature switch (`FEATURE_REGISTRY` :1373, `tenantFeatureOn` :1407) |
|---|---|---|---|
| `tasks` (team tasks) | admin, manager, app_manager (it_admin's `tasks` is a different page: ITTaskOnBehalf) | `ManagerTasksView` :22977 via `AdminViews` :22140, `ManagerViews` :23482, `AppManagerViews` :25943 | `tasks` |
| `requests` (approvals) | admin, manager, app_manager | `RequestsView` :24049 | `requests` |
| `home` (manager) | manager | `ManagerHome` :22837 | — |
| `home` (app_manager) | app_manager ("Pending Reviews") | `PendingReviewsMonitor` :25978 | — |
| `projects` | super_admin, ceo, coo, admin, hr, it_admin, manager, app_manager; **plus** anyone in `tenant.projectCreators` (`isProjectCreator` :11957; Sidebar append + route allowance :30504) | `ProjectsView` :22587 (also `CROSS_ROLE_VIEWS.projects` :30484) | `projects` |
| `clients` | admin, manager, employee, professional, app_manager | `ClientsView` :23331 | `clients` |
| `booking` | super_admin, ceo, coo, admin, hr, manager, employee, professional, accounts, app_manager (**not** it_admin, visitor_manager, master_admin, announcement_viewer) | `BookingMatrix` :27305 | `booking` |

- These pages are not affected by HR gates (`canSeeHrNav` :4641, `HR_SECTIONS` :5299).
- Master admin skips feature switches (`navFor` :1503).
- **The server does no role checks for any of this.** Every route below is open to any signed-in
  user in the same company (only `assertSameTenant`, server.js:1642). The role rules exist only in
  the UI, so the app must copy them.

### 1.1 Team tasks: `ManagerTasksView` (dash.html:22977–23329)

1. **Load** (:22985): `GET /tasks` (the whole company), `GET /users`, `GET /bookings`.
2. **Backfill side effect** (:22991–23010). For every professional booking that is
   `reviewed`/`completed` and has no task, the page creates a completed task with `POST /tasks` on
   every load. **Do not copy this in the app.** It is a web self-heal, and running it from two clients
   doubles the writes. The server's dedupe on `bookingId` (routes/tasks.js:47) does make it safe.
3. **Team scope** (:23017–23035):
   - Admin-type roles (`admin`, `super_admin`, `ceo`, `coo`, `app_manager`): staff (`STAFF_MGR_ROLES`
     :920 = employee, professional, manager) in the departments where `departments.adminId === me`,
     else in my own department.
   - Managers: people whose `reportingManager` or `additionalManager` is my name. People with neither
     set fall back to "same department".
   - A task counts as "mine" (`isMine`) when the assignee is in that team, or
     `creator`/`createdBy`/`approvedBy` is my name, or `managerId` is my id.
4. **KPI cards that act as filters** (:23088–23105, :23114):
   - Active: not completed, reviewed or submitted.
   - Ongoing: in_progress.
   - Completed: completed or reviewed (admins also exclude `source:'ticket'`), with an optional single-date filter.
   - Overdue: due date earlier than today and not done.
   - Due today: not completed, reviewed or in_progress.
   - No card selected shows everything, newest first (`sortTasksNewestFirst` :1754).
   - `initialKpiFilter` is used by the `taskscompleted` / `tasksongoing` routes.
5. **Table** (:23148–23215): title + `TASK-xxxx` reference, assignee avatar and designation, Keka
   code (`taskKeka`, falling back to the booking's code), due date and time, status pill, time worked
   (`elapsedSeconds` plus the live stretch since `startedAt`). The ⋯ menu has View, Edit and Delete.
6. **Create** ("+ Create Task", modal at :23116, `create` :23046). Fields: Title, Assign To
   (`EmpSearch` over the team), Keka Code (required; `ProjectSearch` :1239 shows active codes only),
   Start Date, Start Time, End Time, Description.
   - Body: `{id:'tk'+now, title, project:<project name>, kekaCode, assignee:<name>, creator:<my name>, status:'pending', startDate, startTime, endTime, desc, timestamps:{}}`.
   - It does **not** send `assigneeId`, `managerId` or `createdBy`.
7. **Edit** (:23047): `PUT /tasks/:id {title, assignee, project, startDate}`. Only title and the
   reassignment are editable. **`assigneeId` is not updated when a task is reassigned.**
8. **Mark complete** (drawer footer, :23084): `PUT /tasks/:id {status:'completed', approvedBy, approvedAt}`.
9. **Delete** (:23048): plain confirm, then `DELETE /tasks/:id`. **Cannot be undone.**
10. **Detail drawer** (:23218–23324): assignee card, date, project and time worked, description,
    completion remarks with completed-by and completed-at, and an activity timeline built from
    `createdAt`, `startedAt`, `elapsedSeconds` and `approvedAt` (:23085).
11. **Dead code, do not port**: `approve`/`reject` (:23050–23051; `approve` refers to an
    out-of-scope `setBookings`), the `rejectId` modal, and "Mark as Leave" (`leaveModal`, which posts
    `/leaves`). None of them is reachable from the UI. Approval of submitted tasks really happens in
    `RequestsView`.

### 1.2 Start and end codes (the manager's side of the task code flow)

- When the assignee taps Start or End, `POST /tasks/:id/request-otp {type}` stores
  `{type, code, expiresAt}` on the task (server.js:298, 10-minute lifetime).
- The person waiting on the work (the task's `creator`, `requestedBy` or `requesterName`, matched by
  **name**) sees the code in `PendingOtpBanner` (dash.html:26184; polls `GET /my_pending_otps` every
  20 s, routes/dashboard.js:11) and reads it out.
- The assignee then calls `POST /tasks/:id/verify-otp`.
- A professional booking's first Start uses `/bookings/:id/request-otp|verify-otp`
  (routes/bookings.js:27,35). That code goes to the booking's `requestedBy`.
- So a manager only has to **see** the live codes for tasks they created. Because the server matches
  on `creator === my name`, tasks created in the app **must** set `creator: me.name`.

### 1.3 Approvals: `RequestsView` (dash.html:24049–24500)

1. **Load** (:24083): `GET /tasks`, `GET /users`, `GET /bookings`, `GET /time_corrections`,
   `GET /resource_requests`. **The last one has no server route** (server.js:1802 only lists it in a
   sort table), so every resource-request part (`pendingRRs`, `confirmAssign` :24236, `rejectRR`)
   is dead. Refreshes every 60 s while the page is visible (:24090–24103).
2. **Scope**:
   - Approvers are `canApproveBk` (:24112): manager, admin, super_admin, ceo, coo, app_manager.
   - Admin/app_manager departments come from `adminId`, else my own department.
   - `myProfNames` (:24113): admins use staff in those departments; managers use their RM/AM reports.
3. **Queues**:
   - **Professional booking requests** (`pendingProfBks` :24127): `type:'professionals'`, the
     professional is in my scope, `status:'pending'`, and not "looks cancelled"
     (`bookingLooksCancelled` :27304: reason contains "cancel").
   - **Location booking requests** (:24131): `type:'locations'` where `locationApproverId === me`
     (or the approver name is mine).
   - **Submitted tasks** (`submittedTasks` :24152): `status:'submitted'`, source not booking or
     ticket, assignee in my scope.
   - **Time corrections** (`pendingCorrs` :24153): `status:'pending'`, assignee in my scope.
4. **Tabs** (:24701–24705):
   - Pending: all of the above.
   - Approved / Rejected: with a date filter.
   - Completed: `completed` or `reviewed`.
   - Pending Task Submissions: `pending_review`, with Today, Yesterday, This week (default
     This month) or a picked date.
   - Each tab can show cards or a list (localStorage).
5. **Booking detail** (`BkDetail` :24356): professional header; requester, department, Keka code,
   date, time, shooting location (cinematographers), hours worked and comments; a 4-step stage
   tracker; a month calendar of that professional's full, partial and free days; that day's bookings
   with **overlap warnings**; the last 3 completed bookings; Approve and Reject buttons.
6. **Actions**:
   - `approveBk` (:24190): `PUT /bookings/:id {status:'approved', approvedBy, approvedAt}`.
   - `rejectBk` (:24197): reason required. `PUT /bookings/:id {status:'rejected', reason, rejectedBy}`,
     **then `DELETE /tasks/:id` for every task with that bookingId** (:24204). Cannot be undone.
   - `approveTask` (:24208): `PUT /tasks/:id {status:'completed', approvedBy, approvedAt}`.
   - `rejectTask` (:24213): optional note. `PUT /tasks/:id {status:'in_progress', rejectedBy, rejectionNote, rejectedAt}`.
   - `approveCorrTime` (:24219): hours editable, prefilled with the requested hours.
     `PUT /time_corrections/:id {status:'approved', approvedHours, approvedBy, approvedAt}`.
   - `rejectCorrTime` (:24227): `PUT /time_corrections/:id {status:'rejected', rejectedBy, rejectionNote, rejectedAt}`.
7. Legacy components that are not routed (do not port): `DeptApprovals` (:23532) and
   `ProjectsReports` (:22326).

### 1.4 Manager Home: `ManagerHome` (dash.html:22837–22976)

- Reads: `/users`, `/tasks`, `/bookings`, `/departments`, `/leaves`.
- KPIs:
  - Ongoing Tasks opens Tasks.
  - Team Members opens Employees.
  - Pending Approvals (submitted tasks + pending professional bookings) opens Requests.
  - Tomorrow Tasks opens the "Tomorrow Schedule" screen.
- "Team Available Today" and "Team Available Tomorrow": RM/AM reports who are busy, worked out from
  approved professional bookings, active tasks and leave (`LEAVES` rows plus `user.leaveDates`).
  Free windows are rounded to whole hours, 07:00–22:00.
- Tomorrow Schedule (`showNds`):
  - A table of channel, employee and time.
  - Channel names are editable but saved **only in localStorage** (`nds_channelOverrides`).
  - Exports: PDF (jsPDF), JPEG (html2canvas) and a print window (`downloadSchedule` :22935).
- **Extend shoot time** (`extendBooking` :22948): `PUT /bookings/:id {endTime}`. **This claims no
  slot lock**, so the longer window can overlap another booking. Risky.
- Also shows `PendingOtpBanner` and the clock widget.

### 1.5 Projects (Keka codes): `ProjectsView` (dash.html:22587–22836)

1. **Load** (:22606): `/projects`, `/departments`, `/tasks`, `/users`, `/whitelist`. The last two
   feed the owner picker: signed-up users plus whitelist people who have not signed up yet.
2. **Who sees which rows** (:22650):
   - `hr`, `it_admin`, `super_admin`, `ceo`, `coo` and project creators see **all**.
   - Everyone else sees only rows where `costCodeOwner` (a name, compared case-insensitively) is mine.
3. **Who can create and edit** (:22616): `super_admin` or `isProjectCreator` (Config list
   `tenant.projectCreators = [{name, empNo}]`, matched on employeeNumber/kekaCode or name).
   **CEO and COO cannot.**
4. **List**:
   - Search by name, Keka code or owner; newest first (`projectsNewestFirst` :1236); 8 per page.
   - Columns: name, Meta 1/2/3, Keka code, owner, employee number, date, status.
5. **Create and Edit** (modals; `createProject` :22617, `saveProject` :22638):
   - Meta 1, Meta 2, Meta 3. The Keka code is worked out as `[m1,m2,m3].filter(Boolean).join('_')`.
   - Name follows Meta 3 until someone types their own name.
   - Cost code owner: type-ahead; picking a person also fills `empNo` from employeeNumber/kekaCode.
   - Date, Status (active/inactive).
   - Body: `{id:'p'+now, name, meta1, meta2, meta3, kekaCode, status, costCodeOwner, empNo, date, createdAt:<YYYY-MM-DD>}`.
6. **Deactivate / Reactivate** (`toggleProjectActive` :22627): confirm, then
   `PUT /projects/:id {status:'inactive'|'active'}`. Can be undone. **Delete was deliberately
   removed** (comment :22721): a code is referenced by tasks, bookings, tickets, claims and petty cash.
7. **Bulk upload** (:22675–22719): xlsx/xls/csv read with SheetJS; template download
   `DASH_Projects_Template.xlsx`; `POST /projects` in batches of 10.
8. **Keka code time report** (`KekaCodeReportModal` :22370): click a code. Reads `/tasks`,
   `/time_corrections`, `/bookings` and `/tickets` (whole tables). Tabs by employee, location, IT
   support and admin request, with a date range and drill-down. **Desktop report.**

### 1.6 Clients: `ClientsView` (dash.html:23331–23480)

1. `GET /clients` (the whole company) is filtered **on the client** to
   `managerId === me.id || managerName === me.name` (:23346). Everyone sees only the clients they added.
2. **Add** (`addClient` :23349): Name (required), Channel name, Email, Contact number.
   `POST /clients {id:'cl'+now, managerId, managerName, name, channelName, email, phone, createdAt}`.
3. **Edit** (:23358): `PUT /clients/:id {name, channelName, email, phone}`.
4. **Delete** (:23367): "This cannot be undone" confirm, then `DELETE /clients/:id`. **Cannot be undone.**
5. **Bulk CSV** (:23373): text split on commas; columns name, channelName, email, phone; one POST
   per row. Sample CSV download (:23419).
6. **"Book Professional"** on a card (:23413) opens `BookProfessional` inline. The client is **not**
   passed into the booking. It is only a shortcut.
7. "Raise request for client" (`raiseClientRR` :23390, `rrModal`): **dead**. The modal is never
   rendered and `/api/resource_requests` does not exist.

### 1.7 Booking: `BookingMatrix` (dash.html:27305–27345) and its flows

**Hub** (:27322–27345):
- Three cards: Book Professional, Conference Room, Shooting Location.
- "My Incoming Booking Requests" (for professionals; `resourceId === me`, pending or approved, from
  today).
- "My Booking Requests": upcoming items with **Cancel** for pending or approved ones; a History panel
  (`BookingHistoryPanel` :27154).
- **Cancel** (`cancelMyBooking` :27306):
  - `PUT /bookings/:id {status:'rejected', reason:'Cancelled by requester'}`.
  - Rooms: also `DELETE /room_slot_bookings/:id`. Locations: also `DELETE /loc_time_bookings/:id`.
  - The server frees the slot locks when the status becomes rejected (routes/bookings.js:233).
  - An already-created auto task (`atk_bk_*`) is left behind. The app's My tasks already hides it
    (mobile `features/tasks/model.ts:210`).

**Book a professional: `BookProfessional`** (:27370–27838)
- **Sections**: Search professionals, Pending reviews, My booking requests.
- **Search** (:27736): City (from users' `location`/`city`), Professional type
  (`activeProfTypes()` :1711, which come from `tenant.profTypes`), Date (required, **today to
  +7 days**, `BK_PRO_MAX_DAYS_AHEAD` :27368).
  - Results (`availProfsBase` :27448): `professionalAvailable && professionalType`, matching city
    and type, not on leave (`leaveDates`), not me, has free slots (`profHasFreeSlots`).
  - Sorted by average rating (from `booking.reviews[0].rating`), then name. Specialisation chips.
  - Cards are marked "Available" or "Partially Available".
- **Professional detail and form** (:27588–27725):
  - Rating, skills, portfolio links, that day's bookings (confirmed and pending).
  - Start and End time (`TimeInput12`) with these checks (`timeErr` :27605):
    - end after start
    - within 07:00–22:00
    - start later than now, if the date is today
    - **hard block on overlap** with pending, approved or in_progress bookings (`effEnd` uses `actualEndTime`)
    - someone else holding that time
  - A 1-hour gap is only a warning.
  - Keka code (required). Shooting location (**required for cinematographers**). Channel name.
    Comments.
  - A hold countdown banner.
- **Slot hold** (`useSlotHold` :27841):
  - When a time is picked: `POST /holds {resourceType:'pro', resourceId, date, startMin, endMin, userId, userName}`.
  - Poll others' holds with `GET /holds?...` every 10 s; renew with `POST /holds/:id/renew` every 60 s.
  - `DELETE /holds/:id` on change or unmount; `sendBeacon /holds/:id/release` when the tab closes.
- **Submit** (`submit` :27531): `POST /bookings {id:'bk'+now, type:'professionals', resource, resourceId,
  requestedBy, requestedById, date, dates:[date], startTime, endTime, project:<name>, kekaCode,
  status:'pending', reason:'', profDept, profDeptName, profType, comments, channelName,
  shootingLocation?, reviews:[], holdId}`. A 409 conflict shows the error and refetches.
- **Pending reviews** (:27772–27792):
  - "Awaiting Your Approval": my bookings with `pending_review`.
    **Approve & Complete** (`approveCompletion` :27491) does:
    - `PUT /bookings/:id {status:'completed', completedBy, completedAt}`
    - then `PUT /tasks/:linked {status:'completed', approvedBy, approvedAt, elapsedSeconds?}` (it
      fills in the booked length if no time was logged), or `POST /tasks` with a completed task if none exists.
  - "Pending Reviews": my bookings that are `completed` with no review.
    **Review** (`submitReview` :27558): stars 1–5 (required), likelihood 1–5, comments.
    `PUT /bookings/:id {reviews:[...existing, {reviewerId, reviewerName, rating, likelihood, comments, date}], status:'reviewed'}`,
    plus the same task completion.
    **Ratings live inside the booking. `/api/prof_reviews` is not used by the UI.**
- **Mark as done** (professional, `markDone` :27490):
  `PUT /bookings/:id {status:'pending_review', markedDoneBy, markedDoneAt}`. Already in the app (My tasks).

**Book a conference room: `BookRoom`** (:27955–28157)
- Active rooms (`GET /rooms?withImages=1`), date (up to +30 days), and a **48-slot, 30-minute grid**
  (`SLOTS` :27970).
- Slots are booked, held by someone else, in the past, or selected. Tapping extends or shrinks a range.
- Polls `/room_slot_bookings` every 10 s while open.
- Purpose comes from `GET /room_purposes` (IT Admin list; built-in five if missing, server.js:3186).
  A purpose's `notice` shows a warning. `requiresClient` makes Client name mandatory;
  `requiresRequirements` makes Special requirements mandatory.
- Hold: `POST /holds {resourceType:'room', startSlot, endSlot}`.
- **Submit** (:28023), two steps:
  1. `POST /room_slot_bookings {id:'rsb'+now, roomId, date, startSlot, endSlot, bookedBy, bookedById, purpose, clientName, requirements, bookingId, holdId}`. This claims the slots; 409 on conflict.
  2. `POST /bookings {id:bookingId, type:'rooms', resource:<room name>, requestedBy, requestedById,
     dates:[date], status:'approved', reason:'', purpose, purposeLabel, clientName, startSlot, endSlot, requirements}`.
- Rooms never need approval. The steps are **not atomic**: if step 2 fails, a slot row is left with
  no booking.

**Book a shooting location: `BookLocation`** (:28158–28482)
- Active locations (`GET /locations?withImages=1`) with a city filter. `GET /projects` for the Keka code.
- Date, start and end time:
  - at least 30 minutes
  - **30-minute gap** to the next booking (the server keeps a 30-minute trailing buffer, server.js:4588)
  - not held by someone else
- Channel name.
- **Submit** (`handleSubmit` :28220), two steps:
  1. `POST /loc_time_bookings {id:'ltb'+now, locationId, date, startMin, endMin, bookedBy, bookedById, project, bookingId, holdId}`.
  2. `POST /bookings {type:'locations', ..., status: location.approvalRequired ? 'pending' : 'approved', locationApproverId, locationApproverName, createdAt}`.
     A pending location booking goes to that approver's **Requests** queue (section 1.3).

### 1.8 App Manager "Pending Reviews": `PendingReviewsMonitor` (dash.html:25978)

- Read-only. Professional bookings in `pending_review`, or `completed` with no review. Requesters who
  have resigned and "looks cancelled" bookings are left out (:26045).
- Grouped by professional or by employee, with search.
- Side panel: per-pair lists, **"Download PDF"** (jsPDF `downloadReviewPdf`) and a **WhatsApp
  reminder** `https://wa.me/<phone>?text=...` link (:26160, :26187). Nothing is sent by DASH.

---

## 2. Endpoints

`P` means the route sits after the auth gate and needs a signed-in staff user. **None of these
routes calls `requireRole`.** Writes check only `assertSameTenant` (server.js:1642). `tenantId` on
create comes from `ownTenantId(req)` (:1652). Audit entries are written for every write.

### Tasks: routes/tasks.js (wired server.js:3056)

| Method and path | Line | Body | Response | Side effects and dangers |
|---|---|---|---|---|
| GET `/api/tasks[?activeOnly=1]` | :23 | — | `Task[]` for the whole company, newest first (server.js:1798). **Includes each row's `otp.code`**, so any employee can read every live code (security, section 8). `activeOnly=1` drops completed rows | Large (comment at routes/dashboard.js:42 says about 1.3 MB) |
| POST `/api/tasks` | :25 | any task fields | `{ok, task, deduped?}` | Dedupes on `ticketId`; on `bookingId` it **merges into the existing row**. Unless `source==='booking'`: **email "New Task Assigned" and WhatsApp `waTaskAssigned`** to the assignee (by `assigneeId`, falling back to name) |
| PUT `/api/tasks/:id` | :156 | merge patch; `actorId` | `{ok}` | Completion stamp (`completionRemarks`/`completedBy`): only the assignee or an elevated role (:185). Closes a timer segment into `team_roster_task_segments` (:115). **`submitted`**: email and WhatsApp to `managerId‖createdBy` (normal tasks) or to the booking requester (booking tasks). **`completed`**: "Task Approved" email and WhatsApp to the assignee (**only if `assigneeId` is set**). **`rejected`/`pending` with `rejectionNote`**: "Returned" email and WhatsApp. **The web's reject sends `status:'in_progress'`, so no rejection message is ever sent** |
| DELETE `/api/tasks/:id` | :285 | — | `{ok}` | **Hard delete, cannot be undone** |
| POST `/api/tasks/:id/request-otp` | :314 | `{type:'start'\|'submit'}` | `{ok, requested}` | Writes `otp` onto the row (server.js:298, 10 minutes) |
| POST `/api/tasks/:id/verify-otp` | :324 | `{type, otp}` | `{ok, verified}` or a 400 message | No limit on attempts for tasks (server.js:307) |
| GET `/api/my_pending_otps` | routes/dashboard.js:11 | — | `[{key, otp:{type,code,expiresAt}, assignee, title}]` for tasks where `requesterName‖requestedBy‖creator === my name` and bookings where `requestedBy === my name` | — |
| GET/PUT `/api/time_corrections[/:id]` | server.js:6953 / :6969 | PUT `{status, approvedHours\|rejectionNote, approvedBy\|rejectedBy, …At}` | rows `{id, taskId, taskTitle, taskDate, assignee, assigneeId, project, requestedHours, reason, status, approvedHours, …}` | **POST (:6954) never stores a `tenantId`, and the web doesn't send one** (dash.html:23762), so the tenant-filtered GET hides every row from anyone but master_admin. The approval queue is probably always empty in production (section 8) |

### Bookings: routes/bookings.js (wired server.js:3086)

| Method and path | Line | Body | Response | Side effects and dangers |
|---|---|---|---|---|
| GET `/api/bookings[?since=YYYY-MM-DD]` | :49 | — | `Booking[]` for the whole company (`since` filters on `dates[0]`) | — |
| POST `/api/bookings` | :54 | see 1.7 | `{ok, booking}`; 400 (more than 7 days ahead, missing shooting location, purpose fields), **409** (professional slot taken) | Professionals: claims `pro` slot locks (:103), then **email and WhatsApp the professional's Reporting Manager and Additional Manager** (`getProfessionalApprovers` server.js:898). Rooms and auto-approved locations: confirmation email and WhatsApp to the requester. Pending locations: emails and WhatsApp to the requester and the approver. Client-facing room purposes: **email and WhatsApp to every Super Admin and IT Admin** (:173) |
| PUT `/api/bookings/:id` | :193 | merge patch | `{ok}`; 400 (date moved past +7 days, shooting location removed), **409 (a rejected or cancelled booking can't be reopened)** | Status `rejected`, `cancelled`, `completed` or `reviewed` **frees all slot locks** (:233). `pending_review`: email and WhatsApp to the requester. `approved` (professional): email both sides with each other's contacts, WhatsApp both, and **create the task `atk_bk_<id>`** (:315–361). `rejected`: email and WhatsApp the requester; **the WhatsApp reason reads `rejectionReason`, but the web sends `reason`, so the WhatsApp reason is blank**. Other booking types: approved/rejected email and WhatsApp |
| DELETE `/api/bookings/:id` | :365 | — | `{ok}` | Hard delete and frees locks. **No UI uses it; don't expose it** |
| POST `/api/bookings/:id/request-otp`, `/verify-otp` | :27, :35 | as for tasks | | |
| POST `/api/bookings/:id/release-remaining` | :416 | `{excludeTaskId}` | `{ok, booking, released}` | Deletes the unused tail of the `pro` slot locks (already used by the app's My tasks) |
| POST `/api/bookings/:id/reclaim-remaining` | :474 | `{}` | `{ok, booking, reclaimed, blockedByOther}` | Re-claims locks (already used by the app) |

### Slots and holds: server.js and routes/slot_bookings.js

| Method and path | Line | Body | Response / notes |
|---|---|---|---|
| GET `/api/holds?resourceType&resourceId&date` | server.js:4725 | — | `[{holdId, resourceType, resourceId, date, slotIndex, userId, userName, expiresAt}]`, live holds only |
| POST `/api/holds` | :4749 | `{resourceType:'room'\|'loc'\|'pro', resourceId, date, userId, userName, startSlot,endSlot \| startMin,endMin \| startTime,endTime}` | `{ok, holdId, expiresAt, ttlSec:300}`; **409** with a readable "X is currently booking…" message. The caller's own older hold on that resource and date is cleared first (:4660) |
| POST `/api/holds/:id/renew` | :4773 | — | `{ok, expiresAt}` or **410** (lapsed). No tenant check (minor) |
| DELETE `/api/holds/:id`, POST `/api/holds/:id/release` | :4784, :4800 | — | `{ok}` |
| GET/POST/DELETE `/api/room_slot_bookings[/:id]` | slot_bookings.js:16 / :17 / :64 | see 1.7 | POST checks the purpose's required fields **before** claiming; **409** on conflict. DELETE frees locks |
| GET/POST/DELETE `/api/loc_time_bookings[/:id]` | :85 / :86 / :119 | see 1.7 | Claims with a 30-minute trailing buffer; 409 |
| GET `/api/rooms[?withImages=1]`, `/api/locations[?withImages=1]` | routes/rooms.js:21, routes/locations.js:15 | — | Without `withImages` you get `imageCount` only (photos are inline base64, about 2.8 MB, server.js:3122). Location fields the UI reads: `name, city/address, status, approvalRequired, approverId, approverName, images` |
| GET `/api/room_purposes` | routes/room_purposes.js:16 | — | `[{id, label, color, bg, active, requiresClient, requiresRequirements, notice, sortOrder}]` |
| GET `/api/tenants` | routes/tenants.js:30 | — | own company: `profTypes`, `projectCreators`, `featureFlags` |

### Projects and clients

| Method and path | Line | Body | Response / notes |
|---|---|---|---|
| GET `/api/projects` | routes/projects.js:14 | — | `Project[]` (`id, name, meta1-3, kekaCode, status, costCodeOwner, empNo, date, createdAt`) |
| POST `/api/projects` | :15 | see 1.5 | `{ok, project}`. **No role check**: any employee could create codes through the API. Default status is `active` |
| PUT `/api/projects/:id` | :31 | patch | `{ok}` |
| DELETE `/api/projects/:id` | :51 | — | **Hard delete; the web deliberately hides it. The app must never call it** |
| GET `/api/clients` | routes/clients.js:82 | — | `Client[]` for the whole company (`id, managerId, managerName, name, channelName, email, phone, createdAt`). Privacy: anyone can read every client's contacts |
| POST `/api/clients`, PUT `/:id`, DELETE `/:id` | :83, :98, :118 | see 1.6 | DELETE is **hard and cannot be undone** |
| GET `/api/users` | routes/users.js:108 | — | Whole company, without avatars (`hasAvatar`). The fields needed here: `role, dept, reportingManager, additionalManager, designation, professionalType, professionalAvailable, location/city, leaveDates, specializations, skills, workLinks, employeeNumber, kekaCode, phone/mobile, availability` |
| GET `/api/users/:id/avatar` | :116 | — | `{avatar}` (the app already uses it through `avatarCache`) |
| GET `/api/whitelist` | routes/whitelist.js | — | Roster people who have not signed up (owner picker only) |
| GET `/api/departments`, `/api/leaves` | | | Already used by the app |

---

## 3. What the app already has, and the gaps

**Already there (assignee side and plumbing):**
- `src/api/tasks.ts`:
  - types `Task`, `Booking`, `Client`, `PendingOtp`
  - `useMyTasks` (filters `GET /tasks` to my name), `useMyProBookings` (`/bookings?since=-60d`, my professional bookings)
  - `useClients` (**read-only, and it keeps only `id, name, phone, email`**)
  - `usePendingOtps` (20 s poll), `postTask`, `putTask`, `requestOtp`, `verifyOtp`, `putBooking`,
    `releaseRemaining`, `reclaimRemaining`
- `src/app/(app)/tasks/index.tsx` and `[id].tsx`: My tasks. `src/features/tasks/*`: `model.ts`
  (Keka code, timer, groups; hides tasks whose booking was rejected), `use-task-flow.tsx` (code gate,
  start, pause, end, the professional's "mark done" on a booking), `pending-otps.tsx`
  (**`PendingOtpsCard`: the requester's live codes**, shown on My tasks), `task-card.tsx`, `live-timer.tsx`.
- `src/features/home/needs-you.tsx:91` already shows my pending codes on Home. **So the manager's
  "read out the code" step is already covered**, as long as tasks the app creates set `creator`.
- `src/api/reimbursements.ts:142` `useProjects`, `projectIsActive`, `activeProjects`.
  `src/features/reimbursements/project-picker.tsx` `ProjectPicker` is the Keka code picker
  (active codes only, search, recent codes) and can be reused as is.
- `src/api/support.ts:122` `directoryUsersQuery` (`GET /users`, **cut down to
  id/name/email/mobile/dept**), `departmentsQuery`. `src/api/people.ts` `useDepartments`, `useLeaveDays`.
- Inbox (`src/features/inbox/use-inbox.ts`) has queues of type `hr`, `keka`, `petty` and `visitors`,
  plus the detail route `src/app/(app)/inbox/[kind]/[id].tsx`. This is the natural home for the new
  approval queues.
- `src/features/more/menu.ts`: a role nav table (`NAV`) holding only
  `tasks/mytasks/announcements/bounty/accounts/support/profile`, and **`tiles.slice(0, 9)`**: the More
  grid is capped at 9 tiles.
- `src/features/create/create-sheet.tsx`: the FAB list (8 actions; none for tasks or booking).
- Demo: `src/demo/fixtures/tasks.ts` (my tasks, 3 bookings, 4 clients, OTP routes,
  `GET /my_pending_otps`, `GET /clients`); `src/demo/fixtures/org.ts` (people, departments,
  `PROJECTS` :207, `GET /projects` :314, persona hooks).

**Gaps (nothing exists yet):**
1. Team task list, detail, create, edit, reassign, delete, mark complete.
2. Approval queues: submitted tasks, professional bookings, location bookings, time corrections, and
   the requester's "Awaiting your approval" and "Rate booking".
3. Request tracker (approved, rejected, completed and awaiting-submission history).
4. Projects: list, detail, create, edit, deactivate.
5. Clients: list (mine), add, edit, delete.
6. Booking: hub, my bookings plus cancel, book a professional (search, availability, hold, submit),
   book a room (slot grid), book a location.
7. Manager Home team availability and tomorrow's schedule. App Manager pending-reviews monitor.
8. Types: a full `User` for team and professional fields; `Project` create/edit fields; `Client`
   manager fields; `Booking` fields (`requestedById`, `reviews`, `markedDoneBy`, `locationApproverId`,
   `purpose`, `startSlot/endSlot`, `actualEndTime`, `profType`, `channelName`, `reason`);
   `Tenant.profTypes/projectCreators` (`src/api/me.ts`).
9. Access helpers in `src/lib/access.ts`: `canSeeTeamTasks`, `canApproveBookings`,
   `canSeeAllProjects`, `canEditProjects`, `canSeeClients`, `canBook`, all ported from the gates in
   section 1.0 plus the feature switches.

---

## 4. Mobile design (existing kit only; Ember tokens; Payno/Lendora layouts)

### 4.1 Where it lives
- **One More tile, "Work"** (module `tasks`, icon `BriefcaseBusiness`), shown when the person has any
  of team tasks, projects, clients or booking. The grid is capped at 9 and HR/Super Admin are near
  the cap, so one hub tile is the only way in without dropping others. The existing "My tasks" tile
  stays as it is.
- `/work` hub: `NavHeader "Work"` plus a `CategoryGrid` of the sections this person has: **Team
  tasks · Requests · Booking · Projects · Clients** (and **Pending reviews** for app_manager). Each
  tile has a count (submitted tasks, pending requests, my upcoming bookings).
- **Approvals go into the Inbox**, not into Work. New queue types in `use-inbox.ts`:
  - `task` (submitted tasks), `booking` (professional and location bookings), `timefix` (time corrections)
  - for the requester: `bkdone` ("Awaiting your approval", `pending_review` on my bookings) and
    `bkrate` (completed and not yet rated)
  - Each opens the existing `inbox/[kind]/[id]` detail.
- **FAB (CreateSheet)**: add **"Assign a task"** (team-task roles, opens `/work/tasks/new`) and
  **"Book"** (booking roles, opens `/booking`). That brings the sheet to 10 actions; CategoryGrid
  already wraps at 4 per row.

### 4.2 Screens

| Route | Content (kit components) |
|---|---|
| `/work/tasks` | `SummaryHero` (team icon, "Active" `Numeral`, info chip "3 waiting for your review ›" opening the Inbox `task` filter). `ChipRow` filters with counts: Active · Ongoing · Overdue · Due today · Completed (with a `DateField` only under Completed) · All. Search behind the header magnifier (same pattern as `tasks/index.tsx`). `MetricRow` per task: `TaskAv`→`Avatar`, title, Keka code, due date, worked/booked hours fraction, `StatusPill` (pending=To do, in_progress=In progress, submitted=Review, completed=Done), `•••` → View / Edit / Delete. `SkeletonList` while loading; `EmptyState` "No tasks in this filter"; `ErrorState` with retry. `FlashList` for long lists |
| `/work/tasks/[id]` | Header pills (`TASK-1234`, status). Assignee `AccountRow`. `SummaryCard`: date and time, Keka code, time worked (live `LiveTimer` if running), created by. Description. Completion remarks (green `Banner`). `EventTimeline` (created, assigned, started, time logged, completed). `ActionBar`: **Edit** (Sheet), **Mark complete** (`ConfirmSheet` with `FromToCards` You → Assignee and `SwipeToConfirm "Swipe to mark complete"`; warns that this sends a WhatsApp and email), **Delete** (`ConfirmSheet`, danger copy "This deletes the task and its time for good", `SwipeToConfirm`) |
| `/work/tasks/new` and edit sheet | `TextField` title. Assignee picker: Sheet with search over the team, `Avatar` rows, `AvatarTiles` for the 6 most recent. `ProjectPicker` (required). `DateField`, two `TimeField` in a `FieldPair`. Description. Then `ConfirmSheet` (FromTo You → Assignee, `SummaryCard`, `SwipeToConfirm "Swipe to assign"`), then `SuccessSheet` ("Assigned to Sanjay. When he taps Start you'll see a code on Home to read out to him."). **Body adds `assigneeId`, `managerId: me.id`, `createdBy: me.id`** next to the web's fields (section 8, client-only fix). Edit sends `{title, assignee, assigneeId, project, kekaCode, startDate}` |
| Inbox `task` detail | `SummaryHero` (task title, assignee, hours). `SummaryCard` (Keka code, date, completion remarks, description). **Approve** = `SwipeToConfirm` (`status:'completed'`). **Return for changes** = secondary button, then a Sheet with an optional note (`status:'in_progress'` and `rejectionNote`). Then `SuccessSheet` |
| Inbox `booking` detail | `SummaryHero` (professional avatar and type, date and time). `FromToCards` Requester → Professional. `SummaryCard` (Keka code, channel, shooting location, comments, department). **"That day" card**: the professional's other bookings on the date, with a red `Banner` when this request overlaps one (port `hasTimeOverlap` :24161). Drop the month calendar; offer the 7-day strip `PillBarChart` (full/partial/free) only if there is room. Approve = `SwipeToConfirm` ("Approve and notify both"). Reject = Sheet with **required** reason, then `ConfirmSheet` "This rejects the booking and deletes its task", then `SwipeToConfirm`. Send `{status:'rejected', reason, rejectionReason: reason, rejectedBy}` (the duplicate field fixes the blank WhatsApp reason without a server change), then `DELETE /tasks/:id` for linked tasks, like the web |
| Inbox `timefix` detail | `SummaryCard` (task, date, requested hours, reason). Approve uses an `AmountEntry`-style hours field (prefilled with the requested hours, `decimals=2`, no ₹) and `SwipeToConfirm`. Reject has an optional note |
| Inbox `bkdone` and `bkrate` | `bkdone`: booking summary, "Marked done by X at …", `SwipeToConfirm "Approve & complete"`; then the web's task completion or creation sequence. `bkrate`: Sheet with five 48 dp star `PressableScale` buttons (required), likelihood `Segmented` 1–5, comments, Submit |
| `/work/requests` | Read-only tracker for approvers: `Segmented` Pending · Approved · Rejected · Done · Awaiting submission, plus a `PillSelector` period (Today, Yesterday, This week, This month, Pick date) on the last tab. `ActivityList` of booking rows; a tap opens the Inbox booking detail (read-only when not pending). Replaces the web's card/list toggle |
| `/booking` | `SummaryHero` "Upcoming" count. `CategoryGrid` with three actions: Professional · Room · Location. "Needs you": `bkdone` and `bkrate` rows (also in the Inbox). "My bookings": `ActivityList` grouped Upcoming / History (newest first, `sortBookingsNewestFirst`), `•••` → **Cancel** (`ConfirmSheet`, "Cancel booking? The time is freed for others" and `SwipeToConfirm`), with the room or location slot row deleted as on the web. Professionals also get "Booked for you" (their incoming bookings; Start and Done stay in My tasks) |
| `/booking/pro` | Step 1: `DateField` (today to +7, **IST**), `SelectTiles` professional type (from `tenant.profTypes`, active only), `PillSelector` city. Step 2: results as `ListCard` rows (avatar, name, type, department · city, ★ rating, `StatusPill` Available / Partially available), specialisation `ChipRow`. Step 3 (`/booking/pro/[id]`): a profile `SummaryCard` (skills, portfolio links opened with `Linking`), "Booked that day" list, `TimeField` start and end with the inline checks from :27605, gap warning `Banner`, `ProjectPicker`, shooting location (cinematographer only, required), channel, comments, **hold countdown pill** (`HoldBanner` equivalent). Then `ConfirmSheet` (FromTo You → Professional, summary, `SwipeToConfirm "Swipe to request"`), then `SuccessSheet` "Waiting for {RM}'s approval" |
| `/booking/room` | Room `ListCard` (name, capacity, floor; photo thumbnail only via `withImages=1` when needed, see section 7). `DateField` (up to +30 days). **Slot grid**: 48 thirty-minute chips, 4 per row, 07:00–22:00 shown by default with an "Earlier / later" toggle. Booked chips are filled, held ones striped with the holder's name, past ones disabled. Tap to start and tap to extend, using the web's rules from :28009. Purpose `SelectTiles` (from `/room_purposes`), notice `Banner`, client name and requirements when required. Then `ConfirmSheet` → `SuccessSheet` |
| `/booking/location` | City `PillSelector`, location cards, `DateField`, start and end `TimeField` (30-minute minimum, 30-minute gap), `ProjectPicker`, channel. An "Needs approval by X" `Banner` when `approvalRequired`. Then `ConfirmSheet` → `SuccessSheet` |
| `/work/projects` | Search `PillField`. `Segmented` Active / Inactive / All. `ListCard` rows: Keka code (tabular), name, owner, `StatusPill`. Paged by `FlashList`, not 8 per page. **+** only for `canEditProjects`. Detail: `SummaryCard` (Meta 1–3, Keka code, owner, employee number, date, status), **Edit** (Sheet: three `TextField` with the Keka code previewed live in a `Chip`, name auto-follow rule, owner picker over users + whitelist that fills `empNo`, `DateField`, status `Segmented`), **Deactivate / Reactivate** (`ConfirmSheet` with a plain button; it can be undone, so no swipe). **No Delete** |
| `/work/clients` | `ListCard` of my clients (name, channel, phone, email). **+** opens an Add Sheet. Row `•••`: Call (`Linking tel:`), Email (`mailto:`), WhatsApp (`wa.me`), **Book a professional** (opens `/booking/pro`), Edit, Delete (`ConfirmSheet` "This cannot be undone", `SwipeToConfirm`) |
| Manager Home | Two cards under "Needs you": **"Team today"** (`AvatarTiles` of free and busy people with dots, using the web's `isDopBusyToday` logic; tap shows the person's free window) and **"Tomorrow"** (`UpcomingCards` of tomorrow's tasks and bookings, with a **Share** action that sends a plain-text schedule through RN `Share`) |
| `/work/reviews` (app_manager) | `Segmented` By professional / By employee. `ListRow` with a count. Detail lists the bookings with "waiting N days". **Remind on WhatsApp** opens `wa.me` with the web's text. No PDF |

### 4.3 What stays on the website, and why
- **Bulk upload of projects (xlsx) and the template**: needs SheetJS and a desktop file workflow.
  Clients' CSV upload could come later through `expo-document-picker` with the web's simple
  comma split, but it isn't worth the effort for a phone.
- **Keka code time report** (`KekaCodeReportModal`): downloads four whole tables (tasks, bookings,
  tickets, time corrections); a desktop analysis grid.
- **Tomorrow schedule PDF/JPEG and editable channel names**: the channel edits are browser-only
  (localStorage). The app shares plain text instead.
- **Extend shoot time** (`extendBooking`): it claims no lock, so it can silently double-book. Leave
  it out, or only allow it after checking the professional's later bookings in the app.
- **Pending reviews PDF**.
- **Web self-heal writes** (task backfill :22991; the location booking cancel matching on loose
  fields).
- **Dead or local-only parts**: resource requests (no route), the "Mark as leave" modal,
  `AssignWorkView` (state only), `DeptApprovals`, `ProjectsReports`.
- **IT Admin room, location and purpose setup** belongs to the IT Admin domain.

---

## 5. Expo Go (SDK 57) feasibility

| Need | Module | Status |
|---|---|---|
| Date and time pickers | `@react-native-community/datetimepicker` 9.1.0 (kit `DateField`/`TimeField`) | Installed; already used in leave and attendance; in Expo Go |
| Keka code and people pickers, sheets, swipe | kit (`Sheet`, `SwipeToConfirm` with gesture-handler and reanimated) | Already in the app |
| Call, email, WhatsApp links, portfolio links | `react-native` `Linking` / `expo-linking` | In Expo Go |
| Share tomorrow's schedule as text | `react-native` `Share` | Core |
| Hold heartbeat while the app is backgrounded | `AppState`. There is no `sendBeacon`, so release the hold on `background` and on unmount, and rely on the 5-minute TTL as the backstop | Core |
| Optional PDF export (schedule, reviews) | `expo-print` | **In Expo Go for SDK 57** (docs.expo.dev/versions/v57.0.0/sdk/print: "Included in Expo Go"). It would be a **new dependency**, which the kit rule ("No new dependencies", REFERENCE-COMPONENTS.md §4) forbids, so it is **not proposed** |
| Optional client CSV import | `expo-document-picker`, `expo-file-system` | Installed |
| Long lists | `@shopify/flash-list` | Installed |

**No camera, QR, WebRTC or Google sign-in. No new JS dependency.**

---

## 6. Demo fixtures (so the Afzal personas can try it)

| Persona | What it should show | Data and routes to add |
|---|---|---|
| **Afzal Manager** (Creative; the Creative floor already reports to him, org.ts:85, :257; owns the Nimbus and Showreel codes) | Team tasks for Rahul, Sneha, Sanjay, Kavya and Nikhil: about 6 tasks with `creator: DEMO_USER.name`, `managerId`/`createdBy: DEMO_USER.id` (the persona swap renames them): 2 pending, 1 in progress (running), 1 overdue, **2 submitted** (Inbox `task` queue), 2 completed. One task with a **live start code** (its `otp` on the row) so `my_pending_otps` shows a code to read out. **2 pending professional bookings** whose `resource` is a Creative professional. Projects: sees only his 2 owned codes (`costCodeOwner` is the persona name). Clients: 3 with `managerId: DEMO_USER.id` | `fixtures/tasks.ts`: add team rows marked `onlyFor:['manager']` (or always present but filtered by scope); **DELETE `/tasks/:id`**; make `GET /my_pending_otps` include `creator === ME` rows with a live `otp`. `fixtures/org.ts`: give `u-sanjay` `professionalType:'editor'`, `u-sneha` `'graphic_designer'`, `u-farhan` `'cinematographer'` (Production), all with `professionalAvailable:true`, `location:'Hyderabad'`, `specializations`, `skills` and `designation`, plus `leaveDates` on one of them. Also add `additionalManager` |
| **Afzal Admin** (runs Production) | Admin scope (`adminId`): Production tasks; **a pending booking for Afzal Professional and for Farhan (cinematographer, with shooting location)**; a pending **location** booking where `locationApproverId = DEMO_USER.id`; one time correction (with `tenantId`) | Bookings in `fixtures/tasks.ts` `BOOKINGS`; **GET/PUT `/time_corrections`** |
| **Afzal Professional** | Already has the approved DIT booking and a pending_review one. Add an incoming **pending** request (`resourceId` = me) | — |
| **Afzal Employee** | Booking hub: one upcoming professional booking (pending), one approved room booking, **one `pending_review` booking requested by me** (Inbox `bkdone`) and **one `completed` unreviewed** (Inbox `bkrate`). Clients: 2 of my own | `requestedById: DEMO_USER.id` on those rows |
| **Afzal Super Admin** | Projects: all 8 codes, **can create, edit and deactivate** (`canCreate`). Booking hub | `POST /projects`, `PUT /projects/:id` in org.ts |
| **Afzal HR / IT Admin** | Projects: all codes, read-only (no create, since neither is super_admin nor in `projectCreators`). HR: Booking. IT Admin: no Booking | — |
| **Afzal App Manager** | Team tasks and Requests with department fallback, plus Pending reviews (3 bookings grouped under 2 professionals) | Shares the booking rows above |

**New demo routes**, in a new file `src/demo/fixtures/booking.ts` registered in `demo/server.ts`. They
mirror the shapes in section 2. Every write changes in-memory state; 409 rules are copied
(overlap → `"That time at 14:00 is already booked by Deepa Menon. Please pick a different slot."`).
- `GET /rooms` (3 rooms: Board Room, Edit Suite 3, Studio A; no images)
- `GET /locations` (3: one with `approvalRequired: true, approverId: DEMO_USER.id`)
- `GET /room_purposes` (the five fallbacks from server.js:3186)
- `GET/POST/DELETE /room_slot_bookings`, `GET/POST/DELETE /loc_time_bookings`
- `GET/POST /holds`, `POST /holds/:id/renew`, `DELETE /holds/:id`
- `POST /bookings`. `PUT /bookings/:id` already exists in tasks.ts but must add: on `approved`,
  create the `atk_bk_` task; on `rejected`, release the time.
- `POST/PUT/DELETE /clients`
- `GET/PUT /time_corrections`

Tenant fixture (org.ts `TENANT`): add `profTypes` (the three defaults, dash.html:1703) and
`projectCreators: []` (already there). Add `booking`/`projects`/`clients`/`requests` to
`LIST_ROUTE` in demo/server.ts where they return arrays (`room_slot_bookings`, `loc_time_bookings`,
`rooms`, `locations`, `room_purposes`, `time_corrections`, `holds`, `whitelist`).

---

## 7. Effort and risks

| Screen / piece | Effort |
|---|---|
| Access helpers, types, API hooks (`api/work.ts`: team users, tasks, bookings, projects, clients, holds, slots) | M |
| Work hub, More tile, FAB actions | S |
| Team tasks list | M |
| Task detail, edit, delete, mark complete | M |
| Create and assign task flow | M |
| Inbox queues: task review, time correction | M |
| Inbox queue: booking approval (overlap card, reject-with-task-delete) | M |
| Inbox `bkdone` / `bkrate` (requester completion and star review) | M |
| Requests tracker | S–M |
| Booking hub, my bookings, cancel | M |
| Book a professional (search, availability maths, hold hook, form) | **L** |
| Book a room (48-slot grid, hold, two-step submit) | **L** |
| Book a location | M |
| Projects list, detail, create/edit, deactivate | M |
| Clients list, add/edit/delete, contact actions | S |
| Manager Home "Team today" and "Tomorrow" share | M |
| App Manager pending-reviews monitor | S |
| Demo fixtures (booking.ts, team tasks, professionals, projects and clients writes) | M–L |

**Risks**
1. **Whole-table reads.** `GET /tasks`, `/bookings`, `/users` and `/clients` return the whole company
   (tasks is about 1.3 MB). Mitigations:
   - Use `?activeOnly=1` for every task view except Completed; fetch the full list only when
     Completed is opened.
   - Use `/bookings?since=<today−60d IST>` for queues and the booking hub. Pending professional
     bookings are always within +7 days, so the cutoff never hides one. Only the Requests history
     tabs need the full list.
   - Set `staleTime` to at least 60 s, refetch on focus, and keep these tables out of the persisted
     query cache (size).
2. **Side effects you cannot undo.**
   - Approving or rejecting a booking, approving a task, and creating a task or booking all send
     **WhatsApp and email** to real people.
   - Rejecting a booking deletes its tasks. Task and client deletes are hard deletes.
   - Use `SwipeToConfirm` for every one of these, and spell out "notifies X" in the confirm copy.
3. **Holds on a phone.** There is no `beforeunload`, so release holds on unmount and on AppState
   `background`, renew every 60 s only while the screen is focused, and treat a 410 as "pick again".
   A stranded hold blocks others for up to 5 minutes, which is acceptable because of the server TTL.
4. **Non-atomic two-step submits** (room and location: a slot row, then the booking). If step 2
   fails, retry the `POST /bookings` with the **same id** (the server insert is keyed on id), and
   only then fall back to deleting the slot row.
5. **Client-side role gates only.** The server allows any employee to write tasks, projects, clients
   and bookings, so the app's gates are the only guard. Port them exactly (section 1.0).
6. **Name-based matching everywhere.** `reportingManager`, `creator`, `requestedBy`, `costCodeOwner`
   and the `my_pending_otps` match are all compared by display name. A renamed person drops out of
   team scope and stops seeing codes. Send ids alongside names on every new record.
7. **IST dates.** The web uses `toISOString().split('T')[0]` (UTC), which is wrong between 00:00 and
   05:30 IST. The app must use `todayIst()` / `useTodayIst()`, and the +7-day limit matches the
   server's IST rule (routes/bookings.js:403).
8. **Availability maths** (`profHasFreeSlots`, `overlapsExisting`, `effEnd`, gap per professional
   type, the room grid's selection rules) has to be ported line for line, and tested against the
   server's 409s.
9. **Reject sends no message.** The task reject (`status:'in_progress'`) never notifies the assignee.
   Keep the web's behaviour, but say so in the UI ("They'll see it in My tasks"), or agree to switch
   to `status:'pending'` (which does notify, but moves the task back to To do).

---

## 8. Server notes (not needed for the app; recommended fixes)

1. **`POST /api/time_corrections` should stamp `tenantId: ownTenantId(req)`** (server.js:6956,
   like every other create). Without it, every correction is invisible to the tenant-scoped GET, so
   the "Time corrections" approval queue (web and app) shows nothing. A one-line fix plus a backfill:
   `update time_corrections set data = data || jsonb_build_object('tenantId', <tenant>) where data->>'tenantId' is null`.
   The app's queue works without it, but it will be empty.
2. **Stop returning `otp` in `GET /api/tasks` and `GET /api/bookings`** (strip it in `getAll` for
   these tables). Today any employee can read every live start or end code, which defeats the check.
3. **Role checks on writes** (`requireRole` on `POST`/`PUT /api/projects` for super_admin + project
   creators; `DELETE /api/clients/:id` only for `managerId === me`; `DELETE /api/projects/:id` for
   super_admin only).
4. Optional: `PUT /api/bookings/:id` could read `reason` when `rejectionReason` is missing (the
   WhatsApp text). The app can avoid this by sending both fields.
5. Push notifications for new approvals belong with the deferred push work. Until then the Inbox
   polls.
