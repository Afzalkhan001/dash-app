# Work domain — hand-off (wave 1)

Checklist for the integrator (PLAN §2.1.7). No shared file was edited.

## Filled extension points
- **More › Workspace** (`nav.ts workspaceRows`), section `work`:
  - `work.tasks` Team tasks → `/admin/work/tasks` (order 10, tourId `more.work.tasks`) — admin, manager, app_manager + nav `tasks`
  - `work.projects` Project codes → `/admin/work/projects` (order 60) — nav `projects` (incl. Config project creators)
  - `work.clients` Clients → `/admin/work/clients` (order 70) — nav `clients`
- **+ sheet** (`createActions`): `work.assign` "Assign task" → `/admin/work/tasks/new` (Team tasks roles).
- **Home** (`homeCards`, placement `needs`): `work.teamToday` (order 10, TourTarget `home.work.team`) and `work.tomorrow` (order 11) — role `manager` only (the web's ManagerHome is the manager's home).
- **Inbox kinds** (`inbox.ts`): `task` "Tasks" / "Task to review" (module tasks); `timefix` "Time fixes" / "Time correction" (module timesheets, visible only while something is waiting — the real queue is empty because the server stores no tenantId). Gate for both: nav `requests` for admin, manager, app_manager. No `History` component (no Past decisions chip).
- **Tour** (`tour.ts`): `work.teamToday` (Home), `work.tasks` (More).

## Routes (all under `src/app/(app)/admin/work/`)
`index` (hub), `tasks/index`, `tasks/[id]`, `tasks/new` (assign, or edit with `?id=`), `projects/index`, `projects/[id]`, `projects/edit` (add, or edit with `?id=`), `clients/index`. Each re-checks its gate (`features/work/gate.tsx`) and redirects home without it. No Stack options needed.

## Cross-domain links to confirm
- Clients ••• "Book a professional" pushes `/admin/booking/pro` (booking domain) — shown only with nav `booking`.
- Hub "To review" and Team tasks hero chip open `/inbox?type=task`.

## Gates to consider promoting to `lib/access.ts`
`canSeeAllProjects`, `canEditProjects` (ProjectsView), `taskTeam` / `reviewTeamNames` (team scope), `STAFF_ROLES` / `STAFF_MGR_ROLES`, `resolveDeptIds` / `userInDepts` — booking (requests scope) and insights (reports) will need the same.

## Notes / deviations
- Team scope matches departments by id **or** name (web `userInDepts`), where ManagerTasksView compares raw ids; the demo stores names.
- New tasks send `assigneeId`, `managerId`, `createdBy` (server already reads them) besides the web body; `creator` = my name.
- Editing a task never forces a project code (the web's edit leaves the code alone); the code is sent only when one is picked.
- Team scope for "mine" includes the manager themself when the web's own rule does (no RM / AM, same department); the person picker still leaves them out.
- Task "Send back" keeps the web body (`status:'in_progress'`), so no message is sent — the UI says so.
- Not ported (web-only per PLAN §4): booking backfill self-heal, project bulk upload, Keka code time report, client CSV upload, schedule PDF/JPEG, extend shoot, project delete.

## Demo (`src/demo/fixtures/work.ts`)
- Team tasks added to `taskStore` with `onlyFor` (manager: Creative floor; admin: Production; app_manager: IT & Admin), incl. a running task, overdue, submitted (one without `assigneeId`), done, and two for tomorrow.
- Time corrections (manager, admin), clients (manager 3, employee 2, admin 1), whitelist (Tejas), one approved booking for Sanjay tomorrow (`bk-work-sanjay`), Rahul on leave tomorrow (`upsertPerson`).
- Routes: DELETE `/tasks/:id`; GET/PUT `/time_corrections`; POST/PUT `/projects` (DELETE refused); GET/POST/PUT/DELETE `/clients`; GET `/whitelist`.
- No missing store exports. No persona tweaks needed. No new dependencies.

## Tested personas
Afzal Manager, Afzal Admin, Afzal App Manager, Afzal Super Admin, Afzal HR, Afzal Employee (see report for what was verified in the preview).
