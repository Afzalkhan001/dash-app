# Porting plan: Team Ops (Team Roster, Reports, Device Monitoring, Service Desk, Requests)

Research only. Nothing in the app, the server or the database was changed. All line numbers are from
`dash.html` (36,134 lines), `server.js`, `team_roster.js`, `tm360.js` and `routes/*.js` in
`dash-tamada-latest`, as of 2026-10-21.

**Hard rule check:** every feature in this domain can be built in the app with the endpoints that exist
today. No server or database change is required. Two old website features are already broken on the
server (Resource Requests and Time Corrections, see §5 and §6). The plan leaves them out instead of
asking for a server fix.

---

## 0. What "Team Ops" means in DASH (scope and boundaries)

| Website nav id | Label | Component (dash.html) | Covered here |
|---|---|---|---|
| `teamroster` | Team Roster | `TeamRosterHub` 13554 (+ sections 13627–14751) | yes |
| `trmytasks` | My Team Tasks | `MyTeamRosterTasksView` 14757 | yes (it is the employee half of Team Roster) |
| `reports` | Reports | `ReportsView` 23646 | yes |
| `devices` | Device Monitoring | `Tm360Hub` 10902 (+ 10404–10900) | yes |
| `servicedesk` | Service Desk | `ServiceDesk` 21036 | yes |
| `requests` / `approvals` | Requests | `RequestsView` 24049 | yes |
| `home` (app_manager only) | Pending Reviews | `PendingReviewsMonitor` 25978 | yes (it is the App Manager's approvals monitor) |

**"Team Roster" is not shift rostering.** In DASH, Team Roster (`team_roster.js`) is a per-department
board of teams, projects, work items and timed tasks. Shift definitions and shift assignments are in HR:
`ShiftsPanel` dash.html:4686, `hr_time.js` 105–185 (`/api/hr/shifts`, `/api/hr/shifts/assignments`,
`hrAdminGate`). Those belong in the HR port doc, not here.

**Report-like screens that belong to other domains** (listed so nothing is lost):

| Screen | Where | Owner doc |
|---|---|---|
| Bounty reports | `BountyReportsView` 13388 | bounty |
| Keka Code report (per project code: employee, location, IT support, admin requests) | `KekaCodeReportModal` 22370, opened at 22835 from Projects | projects |
| Timesheets (own week) | `TimesheetsView` 3711 | HR (the app already has it: `attendance/timesheets.tsx`) |
| Subscriptions spend | `SubscriptionsHub` 11523 | IT admin / subscriptions |
| Petty cash statements | `VendorAccountsHub section="pettycash"` | accounts |
| `ProjectsReports` 22326 | **dead code**: defined, never rendered (grep finds no `<ProjectsReports`) | nobody; skip |
| `ResourceRequestView` 23956 | **dead code**: defined, never rendered | nobody; skip |

---

## 1. Who sees what on the website (gates)

All gates are UI only. The server re-checks (or, in a few places noted below, does **not**).

### 1.1 Sidebar table (`navForRaw` dash.html:1508–1532)

`n.ceo = n.super_admin; n.coo = n.super_admin` (1531), so CEO and COO get exactly the Super Admin menu.

| Role | requests | servicedesk | reports | devices (injected) | teamroster (injected) |
|---|---|---|---|---|---|
| super_admin / ceo / coo | – | ✓ | ✓ (scope **global**) | ✓ admin view | if dept admin / granted |
| admin | ✓ | ✓ | ✓ (scope **team**) | ✓ own reports only | if dept admin / granted |
| app_manager | ✓ (via `AdminViews`) | ✓ | ✓ (team) | – | if dept admin / granted |
| manager | ✓ | – | ✓ (team) | ✓ own reports only | if dept admin / granted |
| hr | – | ✓ | ✓ (global) | – | if dept admin / granted |
| it_admin | – | ✓ | – | ✓ admin view | if dept admin / granted |
| employee / professional / accounts | – | – | – | – | if dept admin / granted |

Plus `trmytasks` (My Team Tasks) for anyone with at least one Team Roster task assigned.

### 1.2 Injections in `navFor` (dash.html:1433–1507)

- **Device Monitoring** 1448–1452: `canSeeTm360Nav(user)` (10407) = role in `TM360_ADMIN_ROLES`
  (`it_admin, super_admin, ceo, coo, master_admin`, 10404) or `TM360_MANAGER_ROLES` (`manager, admin`, 10405).
- **Team Roster** 1464–1468: `canSeeTeamRosterNav` (11985):
  `tenant.teamRosterEnabled` (`teamRosterSystemOn` 11984) **and** (a department with `adminId === me`
  and `teamRosterEnabled`, **or** a department in `MY_TR_MANAGER_DEPT_IDS` with `teamRosterEnabled`).
  `MY_TR_MANAGER_DEPT_IDS` (804) is filled at boot from `GET /team-roster/managers?mine=1` (30303, 30331).
- **My Team Tasks** 1498–1502: `canSeeMyTeamTasksNav` (11995) = `MY_TR_TASKS.length > 0`, filled at boot
  from `GET /team-roster/tasks?mine=1` (30303, 30332).
- **Feature switches** 1503–1506: every id in `FEATURE_REGISTRY` (1373–1399) is dropped when
  `tenantFeatureOn(tenant, id)` (1407) is false. In this domain: `requests`, `servicedesk`, `devices`,
  `reports`. `teamroster`, `trmytasks` are **not** in the registry (only the tenant/department toggles
  above switch them). master_admin is exempt.

### 1.3 Route resolution

- `CROSS_ROLE_VIEWS` 30471: `devices → Tm360Hub` (30478), `teamroster → TeamRosterHub` (30480),
  `trmytasks → MyTeamRosterTasksView` (30483). They open only if `navFor` lists them (`inNav`, 30504).
- Per-role routers:
  - `SuperAdminDash` 2610 `ReportsView scope="global"` (no `user` prop), 2611 `ServiceDesk`.
  - `CeoCooDash` 2624 `ReportsView scope="global" user`, 2627 `ServiceDesk`.
  - `HRViews` 5490: `ServiceDesk`, `ReportsView scope='global'` (no `user`).
  - `ITAdminViews` 6988: `ServiceDesk`.
  - `AdminViews` 22142 `RequestsView`, 22143 `ServiceDesk`, 22161 `ReportsView scope='team'`.
  - `ManagerViews` 23483 `RequestsView`, 23497 `ReportsView scope='team'`.
  - `AppManagerViews` 25943: `home → PendingReviewsMonitor` (25944), everything else falls to `AdminViews`.

`HR_SECTIONS` (5299) and `canSeeHrNav` (4641) do **not** gate anything in this domain.

---

## 2. Team Roster (`teamroster`) and My Team Tasks (`trmytasks`)

### 2.1 Website, step by step

**Hub** `TeamRosterHub` 13554–13624
1. Loads `/departments` and `/users` if the globals are empty (13560–13563).
2. My departments = departments where `adminId === me && teamRosterEnabled` (admin) first, then
   departments in `MY_TR_MANAGER_DEPT_IDS` with `teamRosterEnabled` (manager only) (13565–13571).
3. None → empty card: "You don't have Team Roster access… ask your Super Admin… Config → Team Roster
   Access" (13586–13590).
4. More than one → department `<select>` in the page header, each labelled "(Admin)" or "(Manager)" (13610–13613).
5. Tabs (13600): **Managers** (only when I am the department's admin, 13583), **Tasks**, **Projects**,
   **People**. A granted manager is pushed off Managers to Tasks (13584).
6. Department "members" for every picker = users whose `dept` equals the department id or its name
   (case-insensitive) (13594–13598), the same dual match as the server's `inDept()`.

**Managers tab** `TeamRosterManagersSection` 13627–13714 (department admin only)
1. `GET /team-roster/managers?departmentId=` → table Employee / Granted By / Since (13636–13688).
2. Two stat cards: employees in department, number of managers.
3. "+ Add Manager" modal: type-ahead over department members not already managers, multi-select chips,
   "Confirm & Save" → `POST /team-roster/managers {departmentId, employeeIds}`; response replaces the list.
4. "Remove" → confirm ("Their existing teams, projects and tasks will not be deleted…") →
   `DELETE /team-roster/managers/:id`.

**Tasks tab** `TeamRosterTasksSection` 13948–14098 (the daily screen)
1. `GET /team-roster/tasks?departmentId=` + `GET /team-roster/projects?departmentId=` (13960–13974).
   Hides bare "Work" containers (no assignee and no parent) (13971).
2. 4 stat cards: Total, In Progress, Overdue (`taskIsOverdue`: due date before IST today and not done,
   13537), Time Logged (`taskLiveSeconds` 13543 = `elapsed_seconds` + running segment).
3. Filters: project, type (department `taskTypes`), priority. "Manage Task Types". "+ Add Task" is
   disabled until a project is picked (14061).
4. Each row: title, project, "Part of: <work>", assignee, type chip, Keka code, priority, due/overdue,
   estimate; live timer (1 s display tick only while something runs, 13980–13984).
5. Row actions: **Start/Pause/Resume** only on my own tasks (14083); status `<select>` (To Do / In
   Progress / Blocked / Done) for any task; **Delete** (confirm).
   - Start: `PUT /team-roster/tasks/:id {startedAt: now, status: 'in_progress' if todo}` (14006–14017).
     The server auto-pauses that person's other running task.
   - Pause: `PUT {elapsedSeconds: live, startedAt: null}` (14018–14024).
   - Status change: `PUT {status}` and, if running, also freezes the clock (13996–14005).
   - Delete: confirm → `DELETE /team-roster/tasks/:id` (14025–14031).
6. Tapping a row opens `TaskFormModal` (14644) after `GET /team-roster/projects/:projectId` (for the
   project's teams and Keka code) (13990–13994).

**Projects tab** `TeamRosterProjectsSection` 14102–14174
1. `GET /team-roster/projects?departmentId=`; 3 stat cards (Total, Active, Overdue via `projectIsOverdue` 13547).
2. Filters status / priority. Buttons: **Manage Teams** (opens `TeamRosterTeamsSection` in a wide
   modal, 14168–14170), **Manage Task Types**, **+ Create Project**.
3. Table: name + Keka code chip + description, lead, team count, priority, status, due (red if overdue), Manage.

**Create Project** `ProjectFormModal` 14223–14299: name*, description, Keka code (`ProjectSearch` over
`PROJECTS`), lead (department member), priority (low/medium/high/urgent), status
(planning/active/on_hold/completed/cancelled, labels 13525), start, due (≥ start), team checkboxes
(`GET /team-roster/teams?departmentId=`) → `POST /team-roster/projects`.

**Project detail** `ProjectDetailModal` 14302–14525
1. `GET /team-roster/projects/:id`, `GET /team-roster/teams?departmentId=`, `GET /team-roster/tasks?projectId=`.
2. Edit (same fields as create) → `PUT /team-roster/projects/:id`. Delete → confirm ("removes the
   project, its tasks, and its team assignments") → `DELETE /team-roster/projects/:id`.
3. Stats: Total / Completed / In Progress / Overdue / Time Logged (only "trackable" tasks).
4. Assigned Teams: pick + Assign → `POST /team-roster/projects/:id/teams {teamIds:[id]}`; Unassign →
   confirm (warns about active tasks) → `DELETE /team-roster/projects/:pid/teams/:tid`.
5. Work Items (top-level tasks): "+ Add Work" (`WorkFormModal` 14531: name + description →
   `POST /team-roster/tasks {projectId, parentTaskId:null, title, description}`); row shows
   "x/y sub-works done"; Delete (warns that sub-works go too).

**Work detail** `WorkDetailModal` 14560–14639: edit name/description (`PUT /team-roster/tasks/:id
{title, description}`), delete (with sub-works), list Sub Works (assignee or "Unassigned", type,
priority, status, due, estimate, logged/running time), "+ Add Sub Work" (`WorkFormModal` with
`parentTaskId`), "Assign" / tap → `TaskFormModal`, Delete per sub-work.

**Task form** `TaskFormModal` 14644–14716: title*, description, assignee (department member; server
requires them to be on an **active** team assigned to the project), type, priority, status, due date,
estimated hours, "Comments" = `managerComment` (shown to the assignee). Creating from the Tasks tab
requires an assignee (14668). Edit → `PUT`, create → `POST` with `projectId`, `parentTaskId`.

**Task types** `TaskTypesModal` 14182: add/remove chips, Save → `PUT /team-roster/task-types {departmentId, types}`.

**Teams** `TeamRosterTeamsSection` 13719 + `TeamFormModal` 13766 + `TeamDetailModal` 13821
- List (`GET /team-roster/teams?departmentId=`): name/description, lead, members, Active/Archived, Manage.
- Create: name*, description, lead, initial members → `POST /team-roster/teams`.
- Detail: `GET /team-roster/teams/:id` → members + assigned projects (read only). Edit name, description,
  lead, status active/archived → `PUT /team-roster/teams/:id`. Add member (type-ahead) →
  `POST /team-roster/teams/:id/members {employeeIds:[id]}`. Remove member (confirm) →
  `DELETE /team-roster/teams/:tid/members/:mid`. Delete team (confirm, warns about project links) →
  `DELETE /team-roster/teams/:id`.

**People tab** `TeamRosterPeopleSection` 14721–14751: `GET /team-roster/people?departmentId=` → table
Name, Teams, Active Tasks, Est. Hours, Logged, Overdue. Read only.

**My Team Tasks** `MyTeamRosterTasksView` 14757–14865 (any assignee)
1. `GET /team-roster/tasks?mine=1`; 4 stats (Total, In Progress, Overdue, Time Logged); status filter.
2. Row: title, description, project, "Part of", type, Keka code, priority, due, estimate, and the
   manager's note in a yellow box ("Note from your manager:").
3. Start/Pause/Resume and status select (same payloads as the Tasks tab). No edit, no delete.

There are **no exports** anywhere in Team Roster, and **no emails or WhatsApp** messages.

### 2.2 Endpoints (all in `team_roster.js`, registered at server.js:1596, behind the auth gate)

Common gate: `requireRole(EMPLOYEE_ROLES)` (49: every staff role except visitor_manager /
announcement_viewer), then `canManageTeamRoster(actor, dept)` (141–147): Overseers (`master_admin`,
`super_admin`) of the same tenant always pass; otherwise the department must have
`teamRosterEnabled === true`, the tenant `teamRosterEnabled === true`, and the actor is the department's
`adminId` or has a `team_roster_managers` row. `canManageDept` (109) is the narrower "department admin
or overseer" test.

| Method + path | file:line | Extra check | Body | Response (fields the UI reads) | Side effects |
|---|---|---|---|---|---|
| GET `/api/team-roster/departments` | 163 | `OVERSEER_ROLES` only | – | `{globalEnabled, departments:[{id,name,adminId,adminName,teamRosterEnabled,managerCount,teamCount}]}` | – (Super Admin config screen; config domain) |
| GET `/api/team-roster/managers?mine=1` | 219 | none (own rows) | – | `{managers:[{id,department_id,employee_id,employee_name,granted_by_name,created_at}]}` | – |
| GET `/api/team-roster/managers?departmentId=` | 219 | `canManageDept` | – | same | – |
| POST `/api/team-roster/managers` | 243 | `canManageDept`, dept enabled, employees must be in dept | `{departmentId, employeeIds[]}` | `{managers}` (full list) | audit `permission_granted` |
| DELETE `/api/team-roster/managers/:id` | 314 | `canManageDept` | – | `{removed:true}` | audit |
| GET `/api/team-roster/teams?departmentId=` | 349 | `canManageTeamRoster` | – | `{teams:[{id,name,description,lead_id,lead_name,status,member_count}]}` | – |
| GET `/api/team-roster/teams/:id` | 370 | same | – | `{team, members:[{id,employee_id,employee_name}], projects:[{id,name,status,priority,due_date}]}` | – |
| POST `/api/team-roster/teams` | 393 | same; lead + members in dept | `{departmentId,name,description,leadId,memberIds[]}` | `{id}` | audit |
| PUT `/api/team-roster/teams/:id` | 462 | same | `{name?,description?,leadId?,status?:'active'|'archived'}` | `{}` | audit |
| DELETE `/api/team-roster/teams/:id` | 511 | same | – | `{deleted:true}` | **deletes project links and all memberships first** (527–529) |
| POST `/api/team-roster/teams/:id/members` | 544 | same; in dept | `{employeeIds[]}` | `{members}` | audit |
| DELETE `/api/team-roster/teams/:tid/members/:mid` | 595 | same | – | `{removed:true}` | audit |
| GET `/api/team-roster/projects?departmentId=` | 641 | same | – | `{projects:[{id,name,description,lead_id,lead_name,priority,status,start_date,due_date,keka_code,team_count}]}` | – |
| GET `/api/team-roster/projects/:id` | 663 | same | – | `{project, teams:[{id,team_id,team_name,team_status}]}` | – |
| POST `/api/team-roster/projects` | 677 | same; lead in dept; teams in dept | `{departmentId,name,description,leadId,priority,status,startDate,dueDate,kekaCode,teamIds[]}` | `{id}` | audit |
| PUT `/api/team-roster/projects/:id` | 752 | same | any of the above (camelCase) | `{}` | audit |
| DELETE `/api/team-roster/projects/:id` | 808 | same | – | `{deleted:true}` | **deletes every task of the project** (821) and its team links |
| POST `/api/team-roster/projects/:id/teams` | 841 | same | `{teamIds[]}` | `{teams}` | audit |
| DELETE `/api/team-roster/projects/:pid/teams/:tid` | 884 | same | – | `{removed:true}` | audit |
| PUT `/api/team-roster/task-types` | 926 | same | `{departmentId, types[]}` (max 40) | `{types}` | writes `departments.data.taskTypes` |
| GET `/api/team-roster/tasks?mine=1` | 987/990 | none (own) | – | `{tasks:[{…row, project_name, parent_title}]}` ordered by due date | – |
| GET `/api/team-roster/tasks?projectId=` | 1020 | same | – | `{tasks}` (raw rows) | – |
| GET `/api/team-roster/tasks?departmentId=` | 1037 | same | – | `{tasks:[{…row, project_name, parent_title}]}` | – |
| POST `/api/team-roster/tasks` | 1061 | same; assignee on an active team of the project (971–985); parent in same project and not itself a sub-work | `{projectId,parentTaskId,title,description,type,managerComment,assigneeId,priority,status,dueDate,estimatedHours}` | `{id}` | audit; `keka_code` copied from project |
| PUT `/api/team-roster/tasks/:id` | 1141 | manager: all fields; **assignee: only `status, startedAt, elapsedSeconds`** (1165–1169) | any of title, description, assigneeId, priority, status, dueDate, estimatedHours, startedAt, elapsedSeconds, type, managerComment | `{}` | writes a `team_roster_task_segments` row when a timer stops (1230); **auto-pauses that assignee's other running tasks** (1242–1260) |
| DELETE `/api/team-roster/tasks/:id` | 1274 | same | – | `{deleted:true}` | **deletes its sub-works too** (1287–1291) |
| GET `/api/team-roster/people?departmentId=` | 1314 | same | – | `{people:[{id,name,teams[],activeTasks,estimatedHours,overdue,loggedHours}]}` | – |

Task row fields (snake_case from Postgres): `id, tenant_id, department_id, project_id, parent_task_id,
title, description, type, manager_comment, assignee_id, assignee_name, priority (low|medium|high|urgent),
status (todo|in_progress|blocked|done), due_date, estimated_hours, keka_code, elapsed_seconds,
started_at, created_by, created_by_name, created_at, updated_at, completed_at`.

**Dangerous / irreversible:** delete project (takes all its tasks), delete work (takes sub-works), delete
team (drops memberships and project links), remove manager. None of these can be undone.

### 2.3 What the app already has

- `src/api/attendance.ts:279–287` `stopTask()` already pauses/ends a running Team Roster timer at clock-out
  (`PUT /team-roster/tasks/:id`), and the demo has a stub (`src/demo/fixtures/tasks.ts:485`).
- `src/features/tasks/live-timer.tsx` (`useNow`, `LiveTimer`) and `features/tasks/model.ts`
  (`hoursText`) can be reused for the display tick.
- `Tenant.teamRosterEnabled` is already typed (`src/api/me.ts:26`); the demo tenant has it **false**
  (`src/demo/fixtures/org.ts:181`).
- **Name clash:** the app's "My team" (`src/app/(app)/team/*`, `features/team/team.ts`) is the
  org-chart team (manager, peers, reports, who is off). It is not Team Roster. Use the name
  **"Team board"** for the manager hub and **"Team tasks"** for the assignee list.

**Gaps:** everything in 2.1. No API module, no screens, no access rule, no fixtures.

### 2.4 Mobile design

Access (add to `src/lib/access.ts` + a hook):
- `canSeeTeamBoard(user, tenant, departments, myGrants)` = port of `canSeeTeamRosterNav`. Needs
  `GET /departments` (already loaded by `api/people` / `api/support`) and `GET /team-roster/managers?mine=1`.
- `canSeeTeamTasks` = `GET /team-roster/tasks?mine=1` returns ≥ 1 task.

Entry points:
- **More › new "Work" section** (a `ListCard` under the Apps grid, because `buildMoreMenu` caps the grid
  at 9 tiles, `features/more/menu.ts:140`): row "Team board" (module `tasks`, icon `KanbanSquare` or
  `LayoutList`), shown only when `canSeeTeamBoard`.
- **My tasks screen** (`src/app/(app)/tasks/index.tsx`): add a "Team tasks" section (or a `Segmented`
  "My tasks · Team tasks") when the person has Team Roster tasks, so assignees find them where they
  already look for work. Running Team Roster timers already show in the clock-out sheet.

Screens (expo-router, under `src/app/(app)/team-board/`):
1. `index.tsx` **Team board**: `NavHeader` "Team board" with a `PillSelector` for the department
   (only if > 1; "(Admin)/(Manager)" in the sheet). `Segmented`: Tasks · Projects · People · Managers
   (last only for the department admin). Empty state = the website's no-access text.
   - **Tasks**: `StatGrid`/`TwoUp` of 4 `StatTile`s (Total, In progress, Overdue, Logged). `ChipRow`
     filters (project, type, priority) in a filter `Sheet`. List of `MetricRow`s: title, assignee,
     project, priority dot, `StatusPill` (To do / In progress / Blocked / Done / Overdue), `LiveTimer`
     right. `•••` → `MenuSheet`: Start/Pause (only my own), Change status, Edit, Delete. FAB-style
     "Add task" `PillButton` opens the project picker then the task sheet.
   - **Projects**: `MetricRow` per project (team count, due, status pill). Tap → project detail.
     Header `IconButton`s: "Teams", "Task types". "New project" pill.
   - **People**: `ActivityList` rows: name, teams (sub), right side "3 active · 12.5h", overdue as a red
     `DeltaChip`. Read only.
   - **Managers**: `ListCard` of managers with "Remove" in `•••`; "Add manager" opens a searchable
     multi-select `Sheet` over department members.
2. `project/[id].tsx`: `SummaryHero` (name, Keka code chip, lead, due) + 5-figure `SparkCard` footer
   (Total | Done | In progress | Overdue | Logged). Sections: Teams (`ListRow` + Unassign; "Assign team"
   `SelectField`), Work items (`MetricRow` "2/5 done"). `NavHeader` actions: Edit (sheet), Delete
   (ConfirmSheet).
3. `work/[id].tsx`: description, Sub works list (Unassigned in amber), "Add sub work", tap → task sheet.
4. `teams.tsx` + `team/[id].tsx`: list and detail (members with Remove, add-member search, edit sheet,
   archive toggle, delete).
5. **Sheets** (`Sheet` + `TextField`, `SelectField`, `DateField`, `Segmented` for priority/status):
   ProjectSheet, WorkSheet (name + description), TaskSheet (title, description, assignee picker scoped to
   department members with the hint "must be on one of this project's teams: …", type, priority, status,
   due, estimate, comments), TeamSheet, TaskTypesSheet (chips + add field).
6. `src/app/(app)/team-tasks/index.tsx` **Team tasks** (assignee): `SummaryHero` with the running task
   (big `LiveTimer`, Pause pill) or "x open"; list of `MetricRow`s; manager's note as a soft `Banner`
   inside the task detail sheet; Start/Pause button and a status `Segmented` (To do / In progress /
   Blocked / Done). "Done" while running freezes the clock in the same PUT (as 14786–14787).

Irreversible actions → `ConfirmSheet` with `SwipeToConfirm`: delete project ("deletes N tasks"), delete
work ("and N sub-works"), delete team, delete task. Remove manager / unassign team / remove member →
plain `ConfirmSheet` with a destructive button (reversible by re-adding).

Errors: show the server's own sentence in a `Banner` (e.g. "The assignee must be a member of an active
team assigned to this project."). Loading: `SkeletonList`. Empty: `EmptyState` with the website's copy.

Simplified for phone: no wide tables; filters live in a sheet; the "Manage Teams" modal-inside-a-modal
becomes its own screen. Nothing stays web-only except the Super Admin "Team Roster Access" toggles
(config domain).

### 2.5 Expo Go

Nothing native. Existing kit + `react-native-gesture-handler` (SwipeToConfirm). No new dependency.

### 2.6 Demo fixtures

New `src/demo/fixtures/team-roster.ts`, registered in `src/demo/server.ts`; remove/replace the stub at
`fixtures/tasks.ts:485` (keep `runningTasks()` aware of Team Roster tasks for the clock-out sheet).
- `org.ts`: `TENANT.teamRosterEnabled = true`; `dept-creative` and `dept-production` get
  `teamRosterEnabled: true` and `taskTypes: ['Edit', 'Grade', 'Sound', 'Motion', 'Review']`.
- **Afzal Manager** (admin of `dept-creative` via `runs`): sees Managers tab. Data: 2 teams ("Edit floor"
  lead Sanjay with Rahul/Sneha/Kavya/Nikhil; "Audio" with Anita), 1 granted manager (Priya), 3 projects
  (Nimbus brand film active, Showreel planning, Diwali promo overdue) with Keka codes from the org fixture,
  ~4 work items and ~10 sub-works across statuses, one running timer (Sneha), one overdue.
- **Afzal Admin** (admin of `dept-production`): 1 team, 1 project, a few tasks.
- **Afzal Employee** / **Afzal Professional**: 3 sub-works assigned to the demo person (one with a
  manager comment) so `?mine=1` is non-empty and "Team tasks" appears.
- **Afzal Super Admin**: overseer — passes `canManageTeamRoster` on any department, but the website's nav
  still needs admin/grant, so the app should not show it unless they run a department (parity).
- Routes to answer: every row of the table in 2.2 (except `/departments` overview). Enforce the same
  400s for assignee-not-on-team and the assignee-only field whitelist so the demo teaches the real rules.

### 2.7 Effort

| Screen | Effort |
|---|---|
| API module `src/api/team-roster.ts` + access hook | S |
| Team board › Tasks tab (list, filters, timer actions) | M |
| Projects list + project detail (teams, work items) | L |
| Work detail + sub-works | M |
| Task / project / work / team sheets | M |
| Teams list + team detail | M |
| People tab, Managers tab, Task types | S each |
| Team tasks (assignee) + My tasks integration | M |
| Demo fixture | M |

Risks: the deepest nested flow in the domain (project → work → sub-work → task sheet) needs careful
navigation on a phone; assignee validity is only known server-side (show the server error well); the
server auto-pauses other running tasks, so always refetch the whole list after Start.

---

## 3. Reports (`reports`)

### 3.1 Website, step by step — `ReportsView` 23646–23954

Loads five whole tables on mount (23671–23677): `GET /tasks`, `/users`, `/departments`, `/projects`,
`/time_corrections`. **Everything is computed in the browser.** Only the legacy `tasks` table counts;
Team Roster tasks are not in Reports at all.

Scope (23681–23695):
- `global` (super_admin, ceo, coo, hr): employees = every `employee`/`professional`.
- `team`, role `manager`: employees/professionals/managers whose `reportingManager` or
  `additionalManager` equals my **name**.
- `team`, admin / app_manager: `employee`/`professional` in **my own** `dept` (`resolveDeptIds(user.dept)`
  1758) — not the departments I administer (unlike Requests, 24109).

Hours rule (23698–23710): an approved time correction's `approvedHours` wins; otherwise a task counts
only if `status` is `submitted` or `completed` and `60 ≤ elapsedSeconds < 86400`. Task date =
`bookingDate || startDate || date` (23696). Format `H:MM`, floored (23768).

Report types (23716), chosen by buttons:
1. **Keka Code Wise**: per project with a `kekaCode`, countable tasks in range matching project name or
   code → Keka Code, Project, Tasks, Hours Worked, Completion (% completed). Sorted by hours.
   **Quirk:** not scoped to the team even in `team` scope (23713 uses all `countableTasks`), so a manager
   sees company-wide hours per code.
2. **Project Wise**: global = all projects; team = projects where my people have countable tasks. Project,
   Tasks, Hours, Completion.
3. **Employee Wise** (default): each person with total hours (sorted desc), expanded into task rows
   (title, date, Keka/project, time; "✓ corrected").
4. **Attendance Grid**: month navigator (‹ ›), employees × days (weekend columns shaded), cell = hours
   that day, Total column; "designation" filter = Booking's professional categories (`activeProfTypes`)
   which switches the pool to `professionalAvailable && professionalType` of any role (23733–23737).

Filters: search box (Keka code / project / employee name, 23721); From/To date (default 1st of month →
today) with Today / This Month buttons (hidden for the grid).

Export (23774–23819): "Download ▾" → CSV (with BOM) or Excel (`window.XLSX`) of exactly the rows on
screen; file `reports_<type>_<date>`.

"Edit Hours" (time-correction request, 23745–23765, 23828–23845): only when `STAFF_ROLES.includes(role)`
(employee/professional). **No such role has the Reports page**, so this is unreachable in practice.

No server writes from Reports for anyone who can open it. No notifications.

### 3.2 Endpoints

| Method + path | file:line | Server role check | Response used |
|---|---|---|---|
| GET `/api/tasks` | routes/tasks.js:23 | auth + tenant only (`getAll` tenantScoped). Every staff member can read every task of the company. | `id,title,assignee,status,elapsedSeconds,bookingDate,startDate,date,project,kekaCode` |
| GET `/api/users` | routes/users.js:108 | auth + tenant; avatars stripped | `id,name,role,dept,reportingManager,additionalManager,professionalAvailable,professionalType` |
| GET `/api/departments` | routes/departments.js:19 | auth + tenant | `id,name` |
| GET `/api/projects` | routes/projects.js:14 | auth + tenant | `id,name,kekaCode` |
| GET `/api/time_corrections` | server.js:6953 | auth + tenant | `taskId,status,approvedHours` |

Note: `/tasks` is paged 1000 rows per page server-side (server.js ~1830) and returns the whole company
history. Professional categories come from the tenant/config (`activeProfTypes`), already readable.

### 3.3 What the app already has

`useProjects` (`src/api/reimbursements.ts`), `useDirectoryUsers` / `useDepartments` (`src/api/support.ts`),
the `Task` type (`src/api/tasks.ts`), `hoursText` (`features/tasks/model.ts`), charts (`PillBarChart`,
`GlowLineChart`, `DotMatrix`, `HairlineBars`), `saveDataUrl` / `shareFile` (`src/lib/files.ts`). No
Reports screen.

### 3.4 Mobile design

Entry: More › Work › "Reports" (module `timesheets`, icon `BarChart3`), gated by the nav table in 1.1 +
`feature('reports')`.

`src/app/(app)/reports/index.tsx`:
- `NavHeader` "Reports" with a share `IconButton` (Export CSV).
- `Segmented`: People · Projects · Codes · Month (the four report types, in phone order).
- Date range: `PillSelector` "This month ⌄" → sheet with Today / This week / This month / Last month /
  Custom (two `DateField`s). Search `PillField` under it.
- **People**: `NumeralRow` hero (total hours, people with hours, tasks) then `MetricRow` per person
  (`12:30` hours, "8 tasks"); tap → `reports/person/[id].tsx` with that person's task `ActivityList`
  and a `PillBarChart` of hours per day in the range.
- **Projects / Codes**: `MetricRow` per project / code: hours, tasks, completion `StatusPill` (%), small
  `ProgressBar`.
- **Month** (Attendance Grid, simplified): month `PillSelector` (‹ ›), designation filter chip; one row
  per person with total hours and a 28–31 cell `DotMatrix` strip (shaded = worked, intensity = hours).
  Tap a person → their month as a day list. The full employee × day spreadsheet stays **web-only**
  (it is a ~32-column table) — but the same rows go into the CSV export, so nothing is lost.
- Empty: "No data for this period". Error: `ErrorState` with retry.

Export: build the same rows as `exportRows()` 23774 → CSV text → write to cache → `shareFile`. Excel is
web-only (CSV opens in Excel and Google Sheets).

Performance: compute in a `useMemo` off the TanStack caches; keep `/tasks` with a long `staleTime`;
pull-to-refresh re-fetches.

### 3.5 Expo Go

CSV: `expo-file-system` + `expo-sharing` (both in `package.json`, both in Expo Go). Needs one small helper
in `src/lib/files.ts` (`saveText(name, text)`). XLSX would need the `xlsx` (SheetJS) package — pure JS,
works in Expo Go, but not recommended (extra weight; CSV is enough). No native module.

### 3.6 Demo fixtures

- `/tasks` (fixtures/tasks.ts) needs ~30 more **completed/submitted** tasks over the current and previous
  month for the Creative floor (Rahul, Sneha, Sanjay, Kavya, Nikhil, Anita), Production (Farhan, Imran)
  and Marketing (Meera, Zoya), with `elapsedSeconds` 1–9 h, Keka codes from `org.ts`, a couple with
  `elapsedSeconds ≥ 86400` (excluded) and one with an approved time correction.
- Add `GET /time_corrections` → 1–2 rows (and add `time_corrections` to `LIST_ROUTE` in `server.ts`).
- Personas: **Afzal Manager** (team: Creative floor reports to the demo person when this persona is
  active, per org.ts CREATIVE_FLOOR), **Afzal Admin** (team: Production dept), **Afzal HR** and **Afzal
  Super Admin** (global), **Afzal App Manager** (team: IT & Admin dept — mostly empty, which is honest).
- Professional categories: add `profTypes` to the tenant fixture if the Month filter is built.

### 3.7 Effort and risks

| Screen | Effort |
|---|---|
| Report engine (port of 23678–23799 as pure functions + tests) | M |
| Reports screen (4 views, range, search) | M |
| Person drill-down | S |
| CSV export | S |

Risks: downloading the whole task table on mobile data (thousands of rows); name-based reporting lines
(two people with the same name see each other's reports); the Keka-wise scope quirk (port it as is for
parity, or scope it to the team — decide with the owner); `scope="global"` is rendered without `user`
for Super Admin and HR (harmless; mirror it).

---

## 4. Device Monitoring (`devices`) — TM360

### 4.1 Website, step by step — `Tm360Hub` 10902–11161 (+ helpers 10404–10900)

1. On open: `GET /tm360/roster` and `GET /tm360/live`; live is polled every 15 s (10933).
2. **System activity** cards (`Tm360LiveCards` 10859): Tracked employees, Online now, Idle right now,
   Device not paired, Average productivity. The first four are tappable filters.
3. Banner when `unmatchedCount > 0`: "N of M people have no TM360 account on their DASH email address…"
4. Toolbar: search (name, email, department, job title, employee no.), filter select with counts
   (Linked — default, Tracked, Online, Idle, Device not paired, With a paired device, Not linked,
   Everyone), "N shown"; hint row when a search is hidden by the filter ("Show everyone").
5. Table: Employee (+ "Pending signup" badge), Department (`tmDept` resolves id → name, 10431), Devices
   (status badge Paired / Awaiting pairing / Unpaired + hostname; **Unpair** for admins), Last seen
   (live badge Active/Idle/Offline/Not paired + time), Actions.
6. Admin actions (`canPair` from the server):
   - **Link to TM360** (not linked rows): confirm text about flat billing → `POST /tm360/employees/link
     {userId}` → flash "Created a TM360 account for X as manager/employee" (10985–11000).
   - **Pair device**: `Tm360PairModal` 10462: one field "XXXX-XXXX" (upper-cased), lists machines waiting
     to be paired → `POST /tm360/devices/claim {code, employeeEmail}`.
   - **Unpair**: confirm "The agent on that machine stops reporting until it is paired again" →
     `POST /tm360/devices/unpair {deviceId}`.
7. **View activity** (linked rows) → `Tm360EmployeePanel` 10658 (right drawer): date range (default last
   7 days, local days converted to ISO instants, 10670), tabs:
   - Summary: Active time, Idle time, Days scored, Rows sampled; "sample capped" warning; Top
     applications, Top sites, By category; Daily productivity table (score, productive / neutral /
     unproductive / idle minutes).
   - Activity (`Tm360Activity` 10508): grouped by hour (per app/site sums), or raw list.
   - Blocked / Flagged: When, Kind, Matched, Rule, Outcome.
   - Location: per device hostname, status, address, reported time, accuracy, source, "Open in Maps".
   - Export Excel of the tabs already opened (10689–10713).
8. Roster Export Excel (11010) and Refresh.
9. Managers get the same page read-only, limited to their reports; empty text: "Nobody reports to you in
   DASH… Ask HR to set your name as the Reporting Manager…".

### 4.2 Endpoints (`tm360.js`, registered server.js:1723, behind the auth gate)

Gate `gate()` 349 → `visibilityFor()` 309: admin roles → everyone (`canPair: true`); `manager`/`admin`
→ only users whose `reportingManager`/`additionalManager` equals my name (case-insensitive) (`canPair:
false`); anyone else → 403. Pair/unpair/link need `canPair`. Every call proxies to TM360's partner API
with a server-only key; caches 15–60 s.

| Method + path | line | Request | Response used | Side effects |
|---|---|---|---|---|
| GET `/api/tm360/health` | 402 | – | `{configured, canPair, scope, visibleEmployees}` | – (unused by the page) |
| GET `/api/tm360/roster` | 422 | – | `{scope, canPair, employees:[{id,email,name,dept,jobTitle,employeeNumber,role,reportingManager,pendingSignup,matched,tm360:{id,role,status},devices:[{id,hostname,status,lastSeenAt,platform}]}], unassignedDevices, matchedCount, unmatchedCount, inTm360ButNotVisible}` | – |
| GET `/api/tm360/live` | 526 | – | `{scope, tracked, online, idle, notPaired, avgProductivity, status:{[email]:{state,lastActiveAt,productivityScore}}}` | – |
| GET `/api/tm360/employee/:kind` | 612 | query `email, from, to, limit`; kind = summary / activity / restrictions / location / screenshots | summary `{activeSeconds, idleSeconds, sampledRows, sampleCapped, topApps[], topDomains[], byCategory[], dailyScores[]}`; activity `{activity:[{occurredAt,appName,domain,windowTitle,url,durationSeconds,isIdle,category,deviceId}]}`; restrictions `{events:[{id,occurredAt,kind,matched,pattern,outcome}]}`; location `{locations:[{deviceId,hostname,status,platform,address,latitude,longitude,accuracyMetres,source,reportedAt,lastSeenAt}]}`; screenshots get a `viewToken` each | – |
| GET `/api/tm360/screenshot/:id` | 658 | query `email, t` (view token) | image bytes | – (the website never shows screenshots) |
| POST `/api/tm360/employees/link` | 734 | `{userId, firstName?, lastName?}` | `{created, alreadyExisted, tm360UserId, role, managerEmail}` | **creates an account in TM360** (external system); audit |
| POST `/api/tm360/devices/claim` | 857 | `{code, employeeEmail}` | `{deviceId, hostname, …}` | **pairs a machine** in TM360; audit |
| POST `/api/tm360/devices/unpair` | 888 | `{deviceId}` | TM360's answer | **stops monitoring** that machine; audit |

Errors come back as readable sentences (`upstreamErr` 343), e.g. 501 "TM360 does not have the live-status
endpoint yet."

### 4.3 What the app already has

Nothing. Note `src/api/client.ts:31` `timeoutFor()` gives every path 12 s; TM360 calls can be slower
(the page comments mention timeouts), so add `/tm360` → 30 s there (app-only change).

### 4.4 Mobile design

Entry: More › Work › "Device monitoring" (module `security`, icon `MonitorSmartphone`), gated by
`canSeeTm360Nav` roles + `feature('devices')`.

1. `src/app/(app)/devices/index.tsx`: `NavHeader` "Device monitoring" (subtitle "Your team" for
   managers). `StatGrid` of the live cards (Tracked, Online, Idle, Not paired) as tappable `StatTile`s +
   one `Numeral` for average productivity. `PillSelector` filter + search `PillField`. Rows:
   `ListRow` with `Avatar`, name, department, live `StatusPill` (Active / Idle / Offline / Not paired),
   "Last seen 10:42". `Banner` for unmatched people (admin text vs manager text). Live poll with
   `refetchInterval: 15000` only while focused.
2. `devices/[email].tsx` employee detail: header (name, email, dept, job title), date range
   `PillSelector` (Last 7 days ⌄), `Segmented`: Summary · Activity · Flagged · Location.
   - Summary: `NumeralRow` (Active, Idle), `ListCard`s for top apps / sites / categories with
     `HairlineBars`, `PillBarChart` of daily score; capped-sample `Banner`.
   - Activity: hour-grouped `ActivityList` (expand an hour to see apps), same grouping as 10512.
   - Flagged: `ActivityList` (kind, matched, rule, outcome).
   - Location: one `Card` per device with address, accuracy, "Open in Maps" (`Linking.openURL`).
   - Device list with **Unpair** (admins only, `ConfirmSheet` + `SwipeToConfirm`).
3. Admin actions on the roster row (`•••` `MenuSheet`): **Link to TM360** (ConfirmSheet with the billing
   sentence, SwipeToConfirm because it creates an account on another system), **Pair device** (Sheet with
   a code `TextField`, auto upper-case, shows waiting machines).

Web-only: the Excel exports (roster and per-employee). The phone can offer a CSV of the roster at most;
recommend leaving exports on the website. Screenshots: not shown on the website either — keep it that
way (privacy).

### 4.5 Expo Go

Nothing native: lists, charts, `Linking` (expo-linking installed). If screenshots were ever added,
`expo-image` with `headers` (installed) can load `/tm360/screenshot/:id` with the bearer header. No new
dependency.

### 4.6 Demo fixtures

New `src/demo/fixtures/tm360.ts`:
- `GET /tm360/roster`: for **Afzal IT Admin** and **Afzal Super Admin** → the whole demo company (≈22
  people) with `canPair: true`, 12 matched, 8 with paired devices (hostnames like `EDIT-WS-07`,
  `PROD-MBP-02`), 2 `unassignedDevices`; for **Afzal Manager** → only the Creative floor (5 reports),
  `canPair: false`; for **Afzal Admin** → Production reports; everyone else → `{error, status: 403}`.
- `GET /tm360/live`: counts + `status` map consistent with the roster (3 online, 4 idle, 1 not paired,
  avg 72%).
- `GET /tm360/employee/:kind`: generated summary (top apps Premiere Pro, DaVinci, Chrome, Slack…),
  ~2 days of activity rows, 2 flagged events, 1 location in Hyderabad.
- `POST /tm360/employees/link`, `/devices/claim` (accept `123456` style or any `XXXX-XXXX`), `/devices/unpair`
  → mutate the in-memory roster.

### 4.7 Effort and risks

| Screen | Effort |
|---|---|
| API module + access | S |
| Roster screen with live cards, filters | M |
| Employee detail (4 tabs, hour grouping) | M |
| Link / pair / unpair flows | S |
| Demo fixture | M |

Risks: upstream TM360 latency/outages (show the server's sentence, keep the roster usable when live
fails, as the web does); monitoring data on a phone is sensitive (no caching to disk: set `gcTime` low /
exclude these queries from the persisted cache); name-based visibility for managers.

---

## 5. Service Desk (`servicedesk`)

### 5.1 Website, step by step — `ServiceDesk` 21036–21410

Loading:
1. `GET /tickets` + `GET /tasks` → `reconcileTickets()` 20999: a ticket whose task (`source: 'ticket'`,
   `ticketId`) is completed is shown as **resolved** (never moves a rejected/cancelled/resolved ticket).
2. `healResolvedTickets()` 21026 then **writes** `PUT /tickets/:id {status:'resolved', resolvedBy,
   resolvedAt}` for each such row (if the viewer may close tickets) — this emails + WhatsApps the raiser
   "Resolved" (routes/tickets.js:242–250).
3. `GET /users`, `/departments`, `/leaves` → finds the IT & Admin department by name regex
   `/it.*admin|admin.*it/i` (21085); assignable people = its members minus `admin` role minus anyone on
   leave today (`isOnLeaveToday` 1766); the department's `adminId` is the **asset approver** (21099).
4. Once per page load, a self-heal re-creates missing tasks for tickets that are `in_progress` with an
   assignee but no task (`POST /tasks`, 21103–21128).

What each role sees (21129–21168):
- **Super Admin**: everything. Tabs All Items / Tickets / Asset Requests / Admin Requests / Complaints.
- **HR**: only complaints whose type matches "Behaviour & Work". One tab.
- **Admin / App Manager**: only asset requests (all states). Tabs All / Open Requests / Resolved Requests.
- **IT Admin** (and CEO/COO, who fall into this branch): tickets + asset requests; assets still
  `pending_approval` are hidden unless I am the asset approver. Tabs All Items / Tickets / Asset Requests.

Filters (21171–21195): search (reference no. via `refNo` 1793, subject, raiser, department); Category
(labels, de-duplicated), Department, Status, Date; Clear. Sorted newest first. 8 per page with pager.

Table columns (21321): ID, Category, Subject / Item (`quantity x assetType` for assets), Comments /
Reason, From (+ phone), Department, Keka Code, Date, Timeline (Received / Accepted / Resolved / Rejected
stamps), Status (+ rejection reason and who), Assigned To, Action.

Actions (21343–21362):
- Cancelled → "Cancelled by Employee" (no action).
- **Admin request / complaint** → status `<select>` open / in_progress / resolved / closed / rejected;
  choosing *rejected* opens the reject modal; others → `PUT /tickets/:id {status, statusUpdatedBy,
  statusUpdatedAt, acceptedAt?|resolvedAt?}` (21224–21234).
- **Asset request awaiting approval** → approver: **Approve & Assign** (assign modal) + **Reject**;
  others: "Awaiting Approval by <name>".
- **Unassigned ticket / approved asset** (not Admin role) → **Accept & Assign** + **Reject**.
- Assigned → "In Progress"; resolved/rejected → label.

Accept & Assign (21261–21292): pick an IT / Admin member → `POST /tasks {id:'tk'+now, title (subject or
"Nx Asset — Asset Request"), desc, assignee: NAME, creator, status:'pending', source:'ticket', ticketId,
startDate, requester name/phone/email, dept, kekaCode, urgency, category}` (server de-dupes by
ticketId) → if OK, `PUT /tickets/:id {status:'in_progress', assignedTo: NAME, acceptedAt,
approvedBy?, approvedAt?}`. A re-entrancy guard prevents double tasks.

Reject (21245–21260, modal 21372): reason required ("The requester sees this reason…") →
`POST /tickets/:id/reject {performedById, reason}`.

Export (21196–21213): CSV / Excel of the filtered rows (ID, Category, Subject, From, Department,
KekaCode, Date, Status, AssignedTo).

The IT person then works the task in **My Tasks** (already in the app); finishing the task resolves the
ticket.

### 5.2 Endpoints (`routes/tickets.js`, registered server.js:4816)

| Method + path | line | Server role check | Body | Response | Side effects |
|---|---|---|---|---|---|
| GET `/api/tickets` | 20 | auth + tenant only (**every staff member can read every ticket, including complaints**) | – | array of tickets | – |
| POST `/api/tickets` | 21 | none | full record | `{t}` | email + WhatsApp to raiser; Super Admins (admin requests, complaints, assets) or IT Admins (tickets); HR CC on Behaviour & Work |
| PUT `/api/tickets/:id` | 91 | status changes: `admin_request`/`complaint` → super_admin, or HR for Behaviour & Work complaints; tickets/assets → `it_admin, admin, super_admin, app_manager`; raiser may only cancel; assignee may move own ticket to in_progress/resolved; `rejected` refused here (400) | partial | `{ok}` | asset approval (pending_approval → in_progress) emails + WhatsApps raiser "Approved"; resolved/closed notify raiser; admin request/complaint: **any** status change emails + WhatsApps raiser; audit |
| POST `/api/tickets/:id/reject` | 283 | same matrix; reason required; 409 if already rejected/cancelled/resolved | `{performedById, reason}` | `{ticket}` | email + WhatsApp raiser "Rejected"; audit |
| DELETE `/api/tickets/:id` | 346 | tenant only | – | `{ok}` | not used by the Service Desk UI |
| POST `/api/tasks` | routes/tasks.js:25 | none (de-dupes on `ticketId`) | task record | `{task, deduped?}` | email + WhatsApp "New Task Assigned" to the assignee |
| GET `/api/tasks` / `/users` / `/departments` / `/leaves` | see 3.2; routes/leaves.js:13 | auth + tenant | – | – | – |

**Web bug worth knowing:** CEO/COO get Accept & Assign buttons, but the server refuses their ticket
status change (not in the role list) — the task gets created and the ticket stays "open". The app should
show CEO/COO a read-only desk.

### 5.3 What the app already has

- Employee side complete: raise, follow, cancel (`src/api/support.ts`, `src/app/(app)/support/*`,
  `features/support/*` incl. `refNo`, `ticketStatus`, `subjectLabel`, `CATEGORY`).
- IT ticket tasks are already worked in My tasks (start/end without a code), and ending one resolves the
  ticket (`src/api/tasks.ts` header: `PUT /tickets/:id {status:'resolved'}`).
- `useDirectoryUsers`, `useDepartments`, `useLeaveDays` (`api/people`) for the assignee picker.
- **Gap:** no desk (triage) for IT Admin / Admin / HR / Super Admin; no reject; no assign; no status
  control for admin requests / complaints.

### 5.4 Mobile design

Entry: More › Work › "Service desk" (module `support`, icon `Headset`), gated by the nav table +
`feature('servicedesk')`. Plus an **Inbox queue** "Service desk" counting what needs *me*: unassigned
open tickets (IT Admin), assets awaiting my approval (approver), open admin requests/complaints (Super
Admin, HR's slice). Add `type: 'desk'` to `InboxQueue` (`features/inbox/use-inbox.ts:37`).

1. `src/app/(app)/service-desk/index.tsx`: `NavHeader` with search + filter icons. `Segmented` with the
   role's tabs (exact labels from 21218–21222). Summary `SparkCard`/`NumeralRow`: Open · In progress ·
   Resolved this month. `ActivityList` grouped by day: category icon (`CATEGORY`), subject, raiser +
   department, `StatusPill`, `refNo`. Filter `Sheet`: category, department, status, date. Infinite
   scroll instead of pages.
2. `service-desk/[id].tsx`: `SummaryHero` (category, subject, ref), `SummaryCard` (raised by, phone with
   tap-to-call, email, department, Keka code, date, priority/urgency, quantity), description, `EventTimeline`
   (Received / Accepted / Resolved / Rejected with names), assigned to. Bottom `ActionBar` per role:
   - **Accept & assign** / **Approve & assign** → Sheet: assignee picker (IT & Admin members, minus
     admins and people on leave today, with "On leave" shown disabled), then `ConfirmSheet` + `SwipeToConfirm`
     ("Assign to Ravi Teja") because it emails and WhatsApps people.
   - **Reject** → Sheet with required reason (`TextField`, ≥ 1 char; show "The requester sees this
     reason") → SwipeToConfirm.
   - **Admin request / complaint** (Super Admin, HR for Behaviour & Work) → `Segmented` status picker
     (Open / In progress / Resolved / Closed) + Reject; each change confirms first, since the raiser is
     messaged on every change.
   - Read-only roles (CEO/COO, non-approver Admins) see "Awaiting approval by <name>".
3. Reuse `reconcileTickets` logic for **display only**. Do **not** port `healResolvedTickets` or the
   orphan-task self-heal: both write (and the first sends messages) every time the page opens; the
   website already does it.

Web-only: CSV/Excel export (could be added as CSV later; low value on a phone).

### 5.5 Expo Go

Nothing native. `Linking` for tel:/mailto: (installed). No new dependency.

### 5.6 Demo fixtures

Extend `src/demo/fixtures/support.ts` `TICKETS`:
- 3 unassigned open tickets (network, software, access), 1 in progress (assigned to Ravi Teja), 2
  resolved, 1 rejected with reason, 1 cancelled.
- 2 asset requests `pending_approval` (Laptop ×1, Monitor ×2) + 1 approved in progress.
- 2 admin requests (Stationery, ID card) and 2 complaints (one "Behaviour & Work", one "Facilities").
- Handlers: `POST /tickets/:id/reject` (role matrix + 409s), `PUT /tickets/:id` status matrix (port of
  91–145), `POST /tasks` de-dupe by `ticketId` (the tasks fixture), `GET /leaves` already exists.
- Personas: **Afzal IT Admin** (runs `dept-it`, so it is the asset approver: "Approve & assign" shows),
  **Afzal Super Admin** (everything + admin requests/complaints), **Afzal HR** (Behaviour & Work only),
  **Afzal Admin** and **Afzal App Manager** (asset requests, read-only because IT's admin is not them).
- The IT department name "IT & Admin" already matches the web regex.

### 5.7 Effort and risks

| Screen | Effort |
|---|---|
| Desk list + filters + role tabs | M |
| Ticket detail + timeline | S |
| Assign / approve / reject / status flows | M |
| Inbox "Service desk" queue | S |
| Demo fixture extension | M |

Risks: every action messages real people (email + WhatsApp) — confirm sheets are mandatory; `/tickets`
returns the whole company's tickets including complaints (existing server behaviour; the app must
filter by role exactly like 21152–21163 and never show complaints to roles that should not see them);
assignee stored by **name** (`assignedTo`), not id.

---

## 6. Requests (`requests`) — manager/admin approvals outside HR

### 6.1 Website, step by step — `RequestsView` 24049–24821

Full-screen page "Requests — Manage professional and location booking requests". Loads
`/resource_requests`, `/tasks`, `/users`, `/bookings`, `/time_corrections` (24082–24088), re-polled
every 60 s while visible (24100). Grid/List toggle remembered in `localStorage` (24062).

Who is "mine" (24104–24158):
- `isAdmin` = admin, super_admin, ceo, coo, app_manager. Admin/App Manager use the departments they
  administer (`DEPARTMENTS.adminId === me`), falling back to their own department.
- Admins: professionals = employees/professionals/managers in those departments; managers: people whose
  reporting/additional manager is me.
- `canApproveBk` = manager, admin, super_admin, ceo, coo, app_manager.

Queues:
1. **Professional bookings** of my people (`type:'professionals'`, `resource` name in my set):
   pending / approved / rejected (incl. "looks cancelled" 27304) / Completed (`completed|reviewed`) /
   "Pending Task Submissions" (`pending_review`, with Today / Yesterday / This Week / This Month / date
   filter, 24135–24145).
2. **Location bookings** where I am the location's approver (`locationApproverId` or name) (24131–24134).
3. **Task submissions**: tasks `status:'submitted'` of my people, excluding booking and ticket tasks (24152).
4. **Time corrections** pending for my people (24153) — see the note below.
5. **Resource requests** (24154) — see the note below.

Tabs (24700–24706): Pending (sum of all pending), Approved, Rejected, Completed, Pending Task Submissions;
date filter on Approved/Rejected/Completed.

Actions:
- **Approve booking**: `PUT /bookings/:id {status:'approved', approvedBy, approvedAt}` (24190).
- **Reject booking** (reason required): `PUT /bookings/:id {status:'rejected', reason, rejectedBy}`, then
  **`DELETE /tasks/:id` for every task linked to the booking** (24197–24207).
- Booking detail `BkDetail` (24356+): progress steps (Submitted → Pending → Approved → Completed),
  requester, department, project/Keka, date, times, shooting location, hours worked, comments, a month
  calendar of that professional's load (none/partial/full, 24165–24171) with the bookings of the chosen
  day, each with Approve/Reject.
- **Approve task**: `PUT /tasks/:id {status:'completed', approvedBy, approvedAt}` (24208).
- **Reject task** (note): `PUT /tasks/:id {status:'in_progress', rejectedBy, rejectionNote, rejectedAt}` (24213).
- **Time correction**: approve with editable hours `PUT /time_corrections/:id {status:'approved',
  approvedHours, approvedBy, approvedAt}`; reject with note (24219–24235).
- **Resource request**: Approve & Assign (pick an employee of the target department) / Reject with reason
  → `PUT /resource_requests/:id` (24236–24251).

**Two dead queues (do not port):**
- **Resource requests:** the server has **no** `/api/resource_requests` route (only a sort entry at
  server.js:1802); the catch-all answers 404 "No API route" (server.js:9833). The list is always empty and
  writes fail. `ResourceRequestView` (the only creator) is never rendered. Reviving it would need new
  GET/POST/PUT routes in server.js — a server change we do not need.
- **Time corrections:** routes exist (server.js:6953–6999) but the only creator is "Edit Hours" in
  Reports, which no role can reach (§3.1), and `POST` does not stamp `tenantId` (6956), so the
  tenant-scoped `GET` (`getAll` pushes `data->>tenantId = …` down, server.js:2000) would not return new
  rows anyway. Show existing pending ones read-only at most; recommended: skip.

### 6.2 Endpoints

| Method + path | file:line | Server role check | Body | Side effects |
|---|---|---|---|---|
| GET `/api/bookings` (`?since=YYYY-MM-DD`) | routes/bookings.js:49 | auth + tenant | – | – |
| PUT `/api/bookings/:id` | routes/bookings.js:193 | **none** beyond tenant (any signed-in user can approve any booking via the API); refuses reopening rejected/cancelled (221) | `{status, approvedBy, approvedAt}` or `{status:'rejected', reason, rejectedBy}` | approve (professional): emails + WhatsApps professional and requester with each other's contacts; **auto-creates the professional's task** `atk_bk_<id>` (315–361); reject: email + WhatsApp requester; location: email (+WA) requester; frees slot locks on reject/complete (233) |
| DELETE `/api/tasks/:id` | routes/tasks.js:285 | tenant only | – | **irreversible**; audit |
| PUT `/api/tasks/:id` | routes/tasks.js:156 | tenant; completion-stamp check only applies to `completionRemarks`/`completedBy` | `{status:'completed', approvedBy, approvedAt}` / `{status:'in_progress', rejectedBy, rejectionNote, rejectedAt}` | approve: email + WhatsApp "Task Approved" to assignee (264, needs `assigneeId`); reject: the "Returned for Revision" message only fires for status `rejected`/`pending` (274) — the web sends `in_progress`, so **no message is sent** (keep parity) |
| GET/PUT `/api/time_corrections` | server.js:6953/6969 | **none** (not even tenant on PUT) | see above | audit |
| `/api/resource_requests` | — | **does not exist** | — | — |

**Dangerous:** booking reject (deletes linked tasks; status cannot be reopened, 221–224); booking
approve (creates a task and messages two people). The server does not check who approves — the app must
gate exactly like the web.

### 6.3 What the app already has

- `src/api/tasks.ts`: `Task` and `Booking` types, `/bookings?since=`, `PUT /tasks/:id`; the professional's
  side of bookings (Start/End codes) in My tasks.
- Inbox infrastructure (`src/api/inbox.ts`, `features/inbox/*`, `src/app/(app)/inbox/[kind]/[id].tsx`)
  with SwipeToConfirm approve/reject, history, badge counts — currently HR queues, Keka claims, petty
  cash, visitors only.
- **Gap:** no booking approvals, no task-submission review, no location approvals.

### 6.4 Mobile design

These are approvals, so they belong in the **Inbox** (the app's single "waiting on me" place) — not a new
More page. Add three queue types to `InboxQueue` (`features/inbox/use-inbox.ts:37`) and three item kinds
to `src/app/(app)/inbox/[kind]/[id].tsx`:

| Queue | Label | Count | Item screen |
|---|---|---|---|
| `booking` | Shoot bookings | pending professional bookings of my people + location bookings I approve | `SummaryHero` (professional, profession, date, time), `FromToCards` (Requester → Professional), `SummaryCard` (project/Keka, shooting location, comments), a compact week strip of that professional's load (`DotMatrix`/`BarStrip`, from `/bookings`), **Approve** = `SwipeToConfirm`, **Reject** = sheet with required reason + warning "This also removes the task created for it" → SwipeToConfirm |
| `taskReview` | Work to review | submitted tasks of my people (not booking/ticket tasks) | task details, hours worked (`elapsedSeconds`), completion remarks; Approve (SwipeToConfirm) / Return with a note (sheet) |
| `reviewDue` (read-only) | Awaiting the requester | `pending_review` bookings of my people | list only ("Today / This week / This month" `ChipRow`), no actions — matches the web tab |

"Past decisions" (`inbox/history.tsx`) gets Approved / Rejected / Completed bookings with a date
`PillSelector`, mirroring the Approved / Rejected / Completed tabs.

Gate: role in `canApproveBk` list + `feature('requests')` + the role has `requests` in the nav table
(admin, manager, app_manager). Super Admin / CEO / COO have no Requests page on the web — do not add the
queues for them (parity).

Polling: reuse `INBOX_POLL_MS` (60 s, same as the web). `/bookings?since=<30 days ago>` keeps payloads
small for counts; the history fetches wider when opened.

### 6.5 Expo Go

Nothing native. No new dependency.

### 6.6 Demo fixtures

In `fixtures/tasks.ts` (bookings live there):
- **Afzal Manager**: 3 pending professional bookings whose `resource` is a Creative report who is
  bookable (e.g. Sanjay as editor, Rahul as colourist) requested by Production/Marketing people; 1
  approved, 1 rejected with reason, 2 `pending_review`, 2 completed; 2 submitted manual tasks from the
  Creative floor (`source` empty, `assigneeId` set).
- **Afzal Admin**: the Production department's bookings (Farhan, Imran), plus 1 **location booking** with
  `locationApproverId` = the persona id (swapped by `demo/server.ts`).
- **Afzal App Manager**: IT & Admin department — 1 submitted task (Ravi Teja).
- Handlers: `PUT /bookings/:id` (approve → push the `atk_bk_<id>` task into TASKS; reject → status
  only), `DELETE /tasks/:id`, `PUT /tasks/:id` for approve/return.

### 6.7 Effort and risks

| Piece | Effort |
|---|---|
| Queue logic (port of 24104–24158, pure + tests) | M |
| Booking item screen (with load strip) | M |
| Task review item screen | S |
| Awaiting-requester list + history tabs | S |
| Demo fixtures | M |

Risks: name-based matching (`resource` name, reporting manager name); stale-client corruption the web
works around (`bookingLooksCancelled`) must be ported; no server-side authorization on booking/task
approvals; reject is destructive (deletes tasks).

---

## 7. Pending Reviews monitor (App Manager home)

### 7.1 Website — `PendingReviewsMonitor` 25978–26176

App Manager's landing page ("Pending Reviews — Booking work awaiting review"). `GET /bookings` + `GET
/users`. Pending = professional bookings not cancelled, requester not resigned/deleted, and either
`pending_review` ("Awaiting Approval") or `completed` with no `reviews[]` ("Awaiting Rating").
Two views (`Segmented`-like tabs): **By professional** (busiest first) and **By employee** (who owes
reviews). Select a row → detail panel grouped by the other axis, with "days pending". Actions are
monitoring only: **Download PDF** (`downloadReviewPdf` 25957, jsPDF + autoTable, letterhead) per group or
all, and **WhatsApp reminder** links (`https://wa.me/<phone>?text=…`, pre-filled text).

Endpoints: `GET /api/bookings`, `GET /api/users` (see 3.2/6.2). No writes, no server messages.

### 7.2 Mobile design

Entry: for App Manager, More › Work › "Pending reviews" (and a Home card with the count). Screen:
`Segmented` By professional · By employee; `MetricRow` per group with count and oldest age; detail screen
lists bookings (project/Keka, date, Needs: Approval / Rating, pending since). Actions:
- "Remind on WhatsApp" → `Linking.openURL('https://wa.me/…?text=…')` (opens WhatsApp; nothing sent by
  the app itself).
- "Share list" → plain-text share (`Share` from react-native) **or** PDF via `expo-print`
  `printToFileAsync({html})` + `shareFile`.

### 7.3 Expo Go

`expo-print` is **not** in `package.json` but is "Included in Expo Go" for SDK 57 (checked at
docs.expo.dev/versions/v57.0.0/sdk/print). Adding it is optional: `npx expo install expo-print`. Plain
text share needs nothing.

### 7.4 Demo and effort

Persona **Afzal App Manager**; reuse the `pending_review`/`completed` bookings from 6.6, add `reviews`
to some completed ones. Effort: S (list + detail), S (PDF).

---

## 8. Shared plumbing for the whole domain

1. **Nav table in the app.** `features/more/menu.ts` `NAV` (line 38) has only `tasks, mytasks,
   announcements, bounty, accounts, support, profile`. Add `requests`, `servicedesk`, `reports`,
   `devices` with the per-role lists in §1.1, and add those four to `SWITCHABLE` (they are
   `FEATURE_REGISTRY` ids). CEO/COO already map to `SUPER`.
2. **More › "Work" section** (new `ListCard` between Apps and Attendance): Team board, Requests (if not
   only in Inbox), Service desk, Reports, Device monitoring, Pending reviews — each row only when the
   website would show it. The 9-tile grid stays as is.
3. **API modules**: `src/api/team-roster.ts`, `src/api/reports.ts` (pure calculators + queries),
   `src/api/tm360.ts`, `src/api/service-desk.ts` (extends `api/support.ts` types), and requests queues in
   `src/api/inbox.ts`.
4. **Client timeout**: `/tm360` → 30 s in `src/api/client.ts` `timeoutFor`.
5. **Persisted cache**: exclude `tm360` and `service-desk` queries from the AsyncStorage persister
   (sensitive data).
6. **File helper**: `saveText()` in `src/lib/files.ts` for CSV.

## 9. Server changes

**None required.** Everything above uses existing routes. For the record:
- Resource Requests would need new `/api/resource_requests` routes (server.js) — not recommended; the
  feature is dead on the website too.
- Time corrections would need `tenantId` stamped on `POST /api/time_corrections` (server.js:6956) — not
  needed because nothing creates them. (If ever needed, a client can send `tenantId` in the body; the
  server spreads the body into the row.)
- Optional hardening, not needed for the app: role checks on `PUT /api/bookings/:id`,
  `PUT /api/time_corrections/:id`, and a role-scoped `GET /api/tickets`.
- Push notifications (for new tickets, booking requests, task submissions) remain part of the deferred
  push-notification server change.

## 10. Effort summary

| Feature | Effort | Order |
|---|---|---|
| Requests → Inbox queues (bookings, task review, awaiting requester) | M–L | 1 (highest daily value for managers) |
| Service desk (desk + Inbox queue) | M–L | 2 |
| Team board + Team tasks | L | 3 |
| Reports | M | 4 |
| Device monitoring | M | 5 |
| Pending reviews | S | 6 |
| Shared plumbing (§8) | S | first |

Biggest risks across the domain: actions that message real people (bookings, tickets, tasks) or delete
data (booking reject, Team Roster deletes) — every one needs a confirm sheet; several write routes have
no server-side role check, so the app's gates must match the website exactly; name-based reporting
lines and assignees; whole-table downloads (`/tasks`, `/bookings`, `/tickets`, `/users`) on mobile data.
