# hrtime — hand-off to the integrator

HR setup for **Super Admin and HR**: offices and the company clock-in policy, clock-in rules, shifts and who works them, holidays, leave types and rules, company leave balances (adjust, carry forward), and writing policies. Payroll is not part of this domain.

## Plug-ins filled in
- [x] **More › Workspace:** one row.
  - `hrtime.setup` is in section `people` with `order: 20`, label "HR setup" and `href: /admin/hr-time`.
  - Its subtitle lists only the parts this person's modules switch on.
  - It is wrapped in `tourId: more.hrtime.setup`.
  - Gate: `hrTimeGates(hr, user).any` (`features/hrtime/access.ts`).
- [x] **+ sheet:** none, on purpose: nothing here is a daily "start something".
- [x] **Home cards:** none.
- [x] **Inbox kinds:** none, on purpose: there is no queue and nothing is sent.
- [x] **Tour:** one step, `hrtime.setup`, on `/more`.
  - It targets `more.hrtime.setup`.
  - It shows only when `ctx.workspaceRows` has `hrtime.setup`.

## Routes (all under `src/app/(app)/admin/hr-time/`)
- `index` is the hub.
- `offices` covers offices, the company clock-in policy and the weekly off.
- `clock-rules`
- `shifts` covers managing shifts.
- `shift-people` covers who works which shift.
- `leave` covers leave types and rules.
- `balances`
- `policies/index`
- `policies/[id]/index` is the editor; `new` creates a policy.
- `policies/[id]/acks`

Every screen re-checks its gate and sends the person home without it, showing a skeleton while `/hr/me` loads.

## Existing files changed (PLAN §2.4)
- `attendance/holidays.tsx`: admins get a "+" in the header and tappable rows, which open `features/hrtime/holiday-sheet`.
- `attendance/shifts.tsx`: the "on the website" caption is now a "Manage" list with "Manage shifts" and "Who works which shift".
- `policies/index.tsx`: admins get a pencil header action, "Manage policies".

## Gates (`features/hrtime/access.ts`, ported from dash.html with line numbers)
- `canSetUpAttendance`, `canManageShifts`, `canManageHolidays`, `canSetUpLeave`, `canManagePolicies`.
- `hrTimeGates()` returns all of them together.
- None needs promoting to `lib/access.ts` yet.

## Demo (`src/demo/fixtures/hrtime.ts`)
These routes shadow the built-in ones:
- `GET /hr/shifts`, `/hr/shifts/mine`, `/hr/holidays` and `/hr/locations`;
- all of `/hr/policies*`, including the employee list, detail and acknowledge. The policies come from one store, seeded from `policyRoutes`, plus a draft ("Travel & Per Diem 2027", for Production and Creative) and an archived policy.

Shared demo data is changed **in place, through exports**, so employee screens follow:
- `LOCATIONS` from `demo/timeline` (offices, used by the clock card);
- `SETTINGS` from `fixtures/attendance` (company policy);
- `LEAVE_TYPES` and `LEAVE_SETTINGS` from `fixtures/leave` (Apply leave).

My own balance row is read from `leaveRoutes` `/hr/leave/balances/mine`.

Integrator please check:
- [ ] **Holidays only partly follow.** A holiday added or removed here doesn't change leave-day counting (`state.ts holidaysFor`/`isMandatoryHoliday`) or Home's "Coming up". To make them follow, export a holiday overlay from `state.ts`.
- [ ] **Shift changes only partly follow.** Changing or assigning shifts doesn't change the clock card's hours (`fixtures/attendance` `todayView` uses `MY_SHIFT`). `/hr/shifts/mine` does follow.
- [ ] **No 409 on policies.** The policy "someone else changed it" 409 can't happen in the demo, because there is a single editor. The app shows the server's words with a Reload button.

Seeds:
- Clock-in rules:
  - Zoya: always remote;
  - Farhan: office or field, both offices;
  - Imran: office only, at the studio.
- Shifts: the Creative floor is on the General shift, Rahul and Anita on Late edit, and Deepa, Farhan and Imran on Shoot crew.
- Leave: an opening adjustment of +2 CL for Nikhil.
- Carry forward: last year can be carried forward once; running it again adds 0.

## Personas tested (web preview, 390×844)
- **Afzal HR:**
  - hub;
  - offices: edit, add with coordinates, remove by swipe;
  - company policy: save, and the half ≥ full error shown;
  - clock-in rules: set for 2 people;
  - shifts: add, remove by swipe;
  - who works which shift: 7 people moved;
  - holidays: add, a 409 on a duplicate date, remove by swipe;
  - leave types: add;
  - balances (320 px, dark): adjust +1.5 CL by swipe, carry forward from last year (28 credits) by swipe;
  - policies: list, save a non-material edit, acknowledgements screen, new draft that opens its own id, publish by swipe, material edit that saves as version 2 by swipe.
- **Afzal Employee:**
  - sees the newly published Production/Creative policy under "Waiting for you";
  - gets no Manage action;
  - `/admin/hr-time` sends them home.
- **Afzal Super Admin:** the Workspace row shows, and Shifts shows the Manage list.
- **Afzal Manager:** no Workspace row, and `/admin/hr-time` sends them home.
- **Not run in the browser:** retiring a leave type and archiving a policy, because the pane was hidden at the time. They use the same ConfirmSheet and swipe path that worked for the others.
- **Browser setup:** I used my own origin, `hrtime.localhost:8090`, so other agents' persona switches didn't affect it.

## Needs nothing new
- No new dependencies.
- No Stack options.
- No new exports.

## Website-only parts (kept on the website)
- the office map;
- the people × leave-type grid;
- bulk changes for hundreds of people, which also work on the phone but are slow;
- Statutory and payroll, which belong to the payroll domain.

## Note for the owner
The app's company policy sheet also edits `weeklyOff` and `regularizationWindowDays`. The server accepts both, but the website form doesn't show them.
