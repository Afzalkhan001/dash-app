# Insights domain — hand-off (wave 2)

Spec: `docs/port/team-ops.md` §3 (Reports) and §4 (Device monitoring). No server, website or DB change.
No new dependency. No shared file edited.

## Routes (`src/app/(app)/admin/insights/`)
- `reports/index` — People · Projects · Codes · Month, date range sheet (Today / This week / This month /
  Last month / custom), search, Share as CSV (exactly the rows on screen, `exportRows` port). Month =
  one row per person with a day strip; tap → their days.
- `reports/person/[id]?from&to` — one person's countable tasks, hours per day.
- `devices/index` — live counts (tap to filter, 15 s poll while focused), average productivity, unmatched
  banner, filter sheet with counts, search with "hidden by this filter" banner, roster. Unlinked row →
  **Link to TM360** (ConfirmSheet + swipe; admins only).
- `devices/[email]` — person card, devices with **Unpair** (swipe) and **Pair a device** (code sheet +
  swipe), date range, Summary · Activity (by hour / all entries) · Flagged · Location (Open in Maps).

Each screen re-checks its gate (`gate.tsx InsightsGate`) and redirects home. No Stack options needed.

## Extension points filled
- **More › Workspace** (`nav.ts`):
  - `insights.reports` "Reports" → `/admin/insights/reports`, section `work`, order 80, tourId
    `more.insights.reports` — `access.web('reports')` (super_admin/ceo/coo/hr global; admin/manager/app_manager team).
  - `insights.devices` "Device monitoring" → `/admin/insights/devices`, section `work` (`it` for it_admin),
    order 90, tourId `more.insights.devices` — `access.web('devices')` (TM360 admin + manager roles).
- **+ sheet**: none. **Home**: none. **Inbox kinds**: none (nothing waits on a decision).
- **Tour** (`tour.ts`): `insights.reports`, `insights.devices` (both on More, only when the row is shown).

## Gates (`access.ts`)
`canSeeReports`, `reportScopeOf` (REPORT_GLOBAL_ROLES = super_admin, ceo, coo, hr), `canSeeDevices`,
`isTm360Admin`. Pair/unpair/link follow the server's `canPair`. Engine (`reports.ts`) reuses work's
`STAFF_ROLES`, `STAFF_MGR_ROLES`, `resolveDeptIds`, `userInDepts` — good candidates to promote to `lib/access.ts`.

## Data
- `src/api/insights.ts`: Reports reuse work's `useTeamTasks('all')` (shared cache), `useWorkDepts`,
  `useTimeCorrections`, reimbursements' `useProjects`, plus its own slim `/users` (with professional
  category). TM360 calls go through `apiFetch` with a 30 s timeout (no `client.ts` edit needed), all
  `meta:{persist:false}`, gcTime 5 min.
- Kept from the website on purpose: Keka-code report is company-wide even in team scope (a caption says
  so); manager scope is by reporting-manager name; admin scope is their own department.
- Not ported: Excel exports (CSV instead for Reports; none for TM360), "Edit hours" (unreachable on the
  web), screenshots.

## Demo (`src/demo/fixtures/insights.ts`)
- ~50 completed tasks (last month → yesterday) via `createTask` for Creative, Production, Marketing, IT,
  HR; 3 still "submitted" only for Marketing/HR people (no persona's Inbox gains items); two runaway
  timers (≥ 24 h) that Reports shows empty.
- TM360 routes: GET `/tm360/health|roster|live|employee/:kind`, POST `/tm360/employees/link`,
  `/devices/claim` (codes `K7QM-4XPT`, `R2D8-HN6C`, or any `XXXX-XXXX`), `/devices/unpair`. Visibility =
  tm360.js: IT Admin / Super Admin see all and can pair; Manager sees the Creative floor (Nikhil unlinked);
  others 403.

### Needs the integrator
1. **No approved time correction in the demo**: `GET /time_corrections` is answered by work.ts (first in the
   barrel) and its store isn't exported, so the "Hours corrected" path can't be shown. Export work's
   corrections store (or add an approved row) if wanted.
2. **Afzal Admin in Device monitoring** sees the honest empty state ("Nobody reports to you…"): per the
   server rule a TM360 manager sees people whose reporting manager is them, and no one reports to Afzal Admin
   (Production reports to Deepa Menon). Changing that needs an org.ts reporting-line tweak for the admin persona.

## Tested
Web preview on its own origin (127.0.0.2:8090), 390×844 dark and 320×700 light (no horizontal overflow on any
tab), driven through the DOM; swipes fired through their accessibility `activate` handler.
- Afzal Super Admin: Reports (all four views, Month sheet, Editor filter, person drill-down); Device monitoring
  (counts, Online filter, search hidden by filter + Show everyone, Link to TM360 for Nikhil, person tabs,
  Pair with K7QM-4XPT, Unpair).
- Afzal Manager: Reports = the Creative floor; Codes caption; Device monitoring = 4 linked + Nikhil unlinked,
  no Pair/Unpair/Link.
- Afzal HR: Reports (global), no Device monitoring. Afzal Admin: Reports = Production; Device monitoring
  empty state. Afzal App Manager: Reports = IT & Admin; deep link to devices redirects home.
  Afzal IT Admin: Device monitoring under IT & office, no Reports. Afzal Employee: neither row.
Not tested: CSV share (would download a file in the preview).
`npx tsc --noEmit` and `npx expo lint` are clean.
