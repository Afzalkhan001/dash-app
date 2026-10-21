# People domain — hand-off for the integrator (wave 1)

Scope: Employee roster, Departments, HR editing someone else's profile (docs/port/hr-people.md §1.A,
§1.C, §1.E, §4.2, §4.4). System logins (User Management) are the company domain's.

## Plugged in
- [ ] **More › People & HR** (`nav.ts workspaceRows`):
  - `people.roster` "Employees" → `/admin/people` (order 10, `tourId` `more.people.roster`) — navForRaw `roster`
    (super_admin, ceo, coo, admin, hr, it_admin, app_manager + company switch).
  - `people.departments` "Departments" → `/admin/people/departments` (order 20) — navForRaw `departments`
    (super_admin, ceo, coo, hr + switch).
- [ ] **+ sheet** (`createActions`): `people.add` "Add employee" → `/admin/people/edit` (order 60), roster roles.
  Drop it if the per-role cap needs the room (the roster hero has the same button).
- [ ] **Inbox kinds**: none (nothing waits on anyone). **Home cards**: none.
- [ ] **Tour** (`tour.ts`): `people.roster` on More's Employees row, when `ctx.workspaceRows` has it.

## Routes (all under `src/app/(app)/admin/people/`, default Stack options)
`index` (roster) · `[id]` (person; id = account id or `wl:<invitation id>`) · `edit` (`?id=` edits, none adds) ·
`departments/index` · `departments/[id]`. Each re-checks its gate and `Redirect`s to `/`.

## Shared code used (no edits)
`features/shared/person-picker` (PersonPicker), `features/more/photo-sheet` (`pickAvatarDataUrl`),
`features/people/person-ui` (mine), `lib/access webNav`.

## Things to promote / decide
- [ ] Gates other domains may want (`features/people/access.ts`): `USER_ADMIN_ROLES`, `ROLE_ASSIGNER_ROLES`,
  `DESTRUCTIVE_ROLES`, `canAssignRole`, `canManageResign`, `canRemoveEmployee`, `canEditDepartments` —
  the company domain's User Management needs the first three; promote them to `lib/access.ts`.
- [ ] Optional: a "Manage on the roster" item on `app/(app)/people/[id].tsx` (not mine) for `canSeeRoster`,
  linking to `/admin/people/<id>` — the website opens the same edit modal from the directory.

## Demo (`src/demo/fixtures/people.ts`) — overlaps to settle
- [ ] **Blocking: `GET /whitelist` is answered by four domains** — work.ts (1 row), servicedesk.ts, people.ts and
  company.ts. work and servicedesk come first in the barrel, so the roster shows only work's 1 invitation and
  invitations added in the app don't appear (POST/PUT/DELETE go to people's store). Please keep ONE store: people's
  exported `whitelistStore` (Tejas `wl-tejas` is the same person as work's row), and have work / servicedesk /
  company read it (or drop their GET). I tested the invite flows by putting people's whitelist routes first at
  runtime in my own tab only (no file change).
- [ ] It answers **`/whitelist` (GET/POST/PUT/DELETE)**, **`PUT /users/:id` for other people**, **`DELETE /users/:id`**,
  **`POST /employees/change-email`**, **`POST/PUT/DELETE /departments`**. These are generic (system logins with
  `source:'system'` included), so the company domain's User Management can rely on them; it can import
  `whitelistStore` from this file. People comes before company in the barrel, so these win.
- [ ] It answers **`GET /assets`** with 3 sample rows (Farhan Ali holds a camera → resign/remove blocked). When
  itdesk ships its asset store (wave 2), remove this route and keep one asset assigned to Farhan Ali.
- [ ] It answers **`GET /bounty/wallet/:id` for other people** (USER_ADMIN, as server.js:5124; not `company`,
  not me). bountyadmin can reuse it.
- [ ] It overrides **`GET /org/directory`**: the built-in rows, with its "not signed up yet" rows taken from the
  whitelist store (so Tejas, Ishita, Kabir show in both lists). Rohan (system invite) is left out, as manager
  rows from User Management are on the server.
- [ ] Missing mutator: there is no `removeDepartment` in `org.ts`; DELETE `/departments/:id` splices the exported
  `DEPARTMENTS` array. Please add `removeDepartment(id)` and I'll switch to it.
- [ ] Known demo limit: org.ts's persona listener resets every department's `adminId` on a role switch, so a
  changed department admin reverts when the persona changes.
- Seeds (through org.ts / bounty.ts exports): Dev Patel (resigned), department "Interns" (no members), wallets
  Sneha 320 / Rahul 140 coins, 4 invitations (Tejas, Ishita, Kabir, Rohan = system login).
- No new dependencies. No persona changes needed. No Stack options needed.

## Tested (web preview, own tab)
- Afzal HR, 390×844 light: roster list and filters, person screen, edit (job title; email change with clash check and
  swipe confirm), add + invite + success sheet + open the new invitation, resign (320 coins swept) and rejoin,
  account type change, held-asset block (Farhan Ali), professional booking on/off, type, specialisations;
  departments list, create, rename (duplicate name refused), change admin, delete, moving someone in from Edit.
- Afzal Super Admin: Remove for good (Imran; Sanjay shows "1 active booking"), system login Rohan has no
  type/remove and the banner. Afzal IT Admin: Edit + Mark as resigned only, no booking card, Departments redirect.
  Afzal Admin / App Manager: Edit only + booking card, Departments redirect. Afzal Employee: no rows, redirect.
- 320×700 dark: roster, person (long email wraps), edit form, departments. No horizontal overflow (the status
  chips scroll sideways by design).
- The swipes were confirmed through SwipeToConfirm's own onConfirm (synthetic drags don't reach the gesture on web).
