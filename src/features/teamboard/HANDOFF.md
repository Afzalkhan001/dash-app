# Teamboard domain — hand-off (wave 2)

Team Roster from the website (`team_roster.js`, dash.html 13525–14865), named **Team board** (manager hub)
and **Team tasks** (assignee list) in the app, so it never clashes with "My team" (org chart).
No shared file was edited except `src/app/(app)/tasks/index.tsx`, which PLAN §2.4 hands to this domain.

## Filled extension points
- **More › Workspace** (`nav.ts`), section `work`: `teamboard.board` "Team board" → `/admin/team-board`
  (order 20, tourId `more.teamboard.board`). Shown only when `webNav('teamroster')` passes with the
  boot data (`canSeeTeamRosterNav` 11985: company switch AND a Team-Roster department I administer or
  am a granted manager of). Super Admin passes the server check but not the website's sidebar, so no row (parity).
- **+ sheet / Home**: nothing (the website has no quick add outside a project).
- **Inbox** (`inbox.ts`): kind `team-board`, always `visible: false` (no chip, count or rows; Team Roster
  has no approvals). Its hook only warms the boot-time loads the website makes at 30303
  (`GET /departments`, `/team-roster/managers?mine=1`, `/team-roster/tasks?mine=1`) so the pure More /
  tour plug-ins can read them from the query cache (`access.ts gateSnapshot`). Not under `['inbox', …]`,
  `poll: false`. **Integrator:** if a non-visible kind is unwelcome in the registry, move this warm-up
  into any always-mounted hook; the gate works the same.
- **Tour** (`tour.ts`): `teamboard.board` on More, only when the row is shown.

## Routes
`src/app/(app)/admin/team-board/`: `index` (Tasks · Projects · People · Managers, department pill when > 1),
`project/[id]`, `project-form` (`?id=` edit), `work/[id]`, `task` (`?project=&id=|parent=`), `teams`,
`team/[id]`, `team-form`. Every screen re-checks the gate (`features/teamboard/gate.tsx`) and carries
`?dept=`. No Stack options needed.
`src/app/(app)/tasks/index.tsx`: "My tasks · Team tasks" `Segmented` when `webNav('trmytasks')`
(≥ 1 Team Roster task); `?view=team` opens on it. Team tasks = `features/teamboard/my-team-tasks.tsx`.

## Rules ported
- Gates: `canSeeTeamRosterNav`, `canSeeMyTeamTasksNav`, TeamRosterHub department order (admin first,
  "(Admin)/(Manager)"), Managers tab only for the department admin (13583–13584), department members by
  id or name (`inDept`).
- Timer: Start/Resume only on my own task (14083), `{startedAt, status:'in_progress' if todo}`; Pause
  freezes `elapsedSeconds`; a status change while running freezes the clock in the same PUT (13996, 14786).
  Every list refetches after Start (the server auto-pauses my other running task).
- Assignee sees only status + clock controls (server whitelist). A new top-level task needs an assignee (14668).
- Irreversible deletes (task, work + sub-works, project + all tasks, team) use `ConfirmSheet` +
  `SwipeToConfirm` and say "No one is messaged" (team_roster.js sends nothing). Remove manager /
  unassign team / remove member use a plain destructive confirm (re-addable).
- Server errors are shown in its own words (e.g. "The assignee must be a member of an active team
  assigned to this project.").
- Web-only: the Super Admin "Team Roster Access" config (config domain). No exports exist on the website.

## Demo (`src/demo/fixtures/teamboard.ts`)
- Task types for Creative / Production via `upsertDepartment`. Teams Edit floor, Audio, Motion (2024,
  archived), Shoot crew; Priya granted on Creative; Afzal Manager granted on Production.
- Projects: Nimbus explainer series (active), Showreel 2026 (planning), Sunrise Jewellers Diwali promo
  (overdue), Kisan Agro launch shoot (Production); work items + sub-works across every status, Sneha's
  timer running, two overdue.
- Every route in team-ops §2.2 except `/team-roster/departments`, with the server's 400/403 sentences,
  the assignee-on-active-team check, the assignee field whitelist, auto-pause and the delete cascades.
  Rows tied to the demo person carry `onlyFor` so each persona sees only their own.
- **New export for the integrator:** `runningTeamBoardTasks(): RunningTask[]` — the demo person's
  running Team Roster timers. Append it to `tasks.ts runningTasks()` (or in attendance's `/timesheet`
  day) so the demo clock-out sheet offers to pause / end them, as on the website. `tasks.ts:485`'s
  `PUT /team-roster/tasks/:id` stub is now shadowed by these routes (domain routes win) and can go.

## Personas tested (preview, 390×844 dark and 320×700 light)
- **Afzal Manager**: More shows Team board; Creative (Admin) with Managers tab, Production (Manager)
  without; Start own task, delete a task (swipe), assign a sub-work (refused for Harini — not on a team —
  then saved for Anita), add a manager, teams list + team detail, People workload; Team tasks shows his sub-work.
- **Afzal Admin**: Production with the Managers tab.
- **Afzal Employee**: no Team board; Team tasks with 3 sub-works, manager's note, Start, Done while running.
- **Afzal Super Admin**: no Team board (parity).

## Notes
- The hub's 4 tabs (admin only) scroll as chips below 360 dp or with large text, so "Managers" is never
  cut off. The task form's status control already renders as chips ("In progress" is over 10 letters).
- A bare Work's ••• offers only Open work and Delete, as the website's project page.
- Gates to consider promoting to `lib/access.ts`: none needed elsewhere today.
- No new dependencies, no persona tweaks, no missing store exports.
