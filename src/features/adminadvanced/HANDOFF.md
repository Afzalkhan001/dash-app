# Admin advanced — hand-off (wave 3, "everything in the website should be in the app")

Specs: docs/port/leadership-admin.md §1.6, it-admin.md §1.1/§7, team-ops.md §5, hr-setup-payroll.md §2a,
PLAN §4. Existing endpoints only. No new dependency (uses the integrator's `react-native-webview`).
No shared file edited.

## Files (all new)
- [x] `src/features/adminadvanced/{access,api,ui,map-html,nav,inbox,tour}.ts(x)`, `map-frame.tsx` (WebView) + `map-frame.web.tsx` (iframe)
- [x] `src/app/(app)/admin/advanced/`
  - `index` — "Delete data" hub (only the tools this person has)
  - `delete-company?company=` — master_admin. Counts what goes (logins, invitations, departments, projects),
    type the company name + swipe → DELETE /tenants/:id, then the leftovers 15 at a time (deleteTenant dash.html:2413)
  - `delete-assets` — IT Admin (`web('assets')`). Re-reads /assets, type "delete N assets" + swipe → one DELETE per asset (dash.html:20415); lists any refused
  - `delete-ticket?id=` — IT Admin, Super Admin (+ `web('servicedesk')`). Search, type the reference (TKT-…) + swipe → DELETE /tickets/:id?performedById=
  - `playlists/index`, `playlists/[id]` (`new` creates) — Super Admin/CEO/COO (newsroom's `canSeeOfficeTvs`). TvPlaylistModal (dash.html:3096): name, description, Active/Archived, posts in order with seconds (3–300) and optional first/last day, up/down/remove/change; delete swiped. Keeps a per-item `priority` the website drops.
  - `office-map` — Super Admin/HR with attendance (hrtime `canSetUpAttendance`). Leaflet/OSM map (OsmMap dash.html:3634): every office's circle; pick an office or New office, tap to place, circle size, "Use where I'm standing"; swipe → PUT/POST /hr/locations (hrtime hooks)
  - `employees` — admin, manager, app_manager (`web('employees')`): EmpListView (dash.html:22166) — team directory, active tasks, equipment held, leave days; read only
  - `managers` — admin, app_manager (`web('managers')`): AdminManagersView (dash.html:22097) — managers in my departments, team size, tasks; tap → their team
- [x] `src/demo/fixtures/adminadvanced.ts` → `adminadvancedRoutes`

## For the integrator
- [ ] **domains.ts**: register `adminadvanced` (nav, inbox, tour) — anywhere after `platform`.
- [ ] **demo/fixtures/index.ts**: add `...adminadvancedRoutes` **FIRST** in `domainRoutes`. Its GET /tenants, /users,
      /departments, /projects only match for the master persona (conditional patterns), so nobody else is affected.
      The other routes (DELETE /tenants, /tickets, POST/PUT/DELETE /tv/admin/playlists) are answered by no other fixture.
- [ ] More › Workspace rows (`nav.ts`):
  | key | section | order | who |
  |---|---|---|---|
  | `adminadvanced.managers` | work | 60 | web('managers') |
  | `adminadvanced.employees` | work | 61 | web('employees') |
  | `adminadvanced.officemap` | people | 21 | canSetUpAttendance |
  | `adminadvanced.playlists` | it | 71 | canSeeOfficeTvs |
  | `adminadvanced.delete` "Delete data" | platform (master) / it | 200 | deleteTools().any |
  tourIds `more.adminadvanced.*`. No + actions, no Home cards, no Inbox kinds.
- [ ] Tour steps: `adminadvanced.employees`, `adminadvanced.officemap` (screen /more).
- [ ] Suggested links from other domains' screens (their owners / you): platform `companies/[id]` → replace
      "To delete a company, use the DASH website." with a row to `/admin/advanced/delete-company?company=<id>`;
      service-desk `[id]` ⋯ → `/admin/advanced/delete-ticket?id=<id>` (IT Admin, Super Admin);
      it-desk assets ⋮ → `/admin/advanced/delete-assets`; news `tvs/index` "Playlists read only" → `/admin/advanced/playlists`;
      hr-time `offices` → `/admin/advanced/office-map`. Also update the "stays web" notes in platform/itdesk/newsroom HANDOFFs and role-tours copy.
- [ ] Owner decision to confirm: **delete a service request has no website button** (the route exists). The app gives it to it_admin + super_admin only.
- [ ] Map tiles: OpenStreetMap's tile servers want a Referer; the WebView's baseUrl is `DASH_URL` so it matches the website. Leaflet loads from DASH's `/public_assets/vendor/leaflet/`, falling back to unpkg `leaflet@1.9.4`.

## navFor / navForRaw sweep (dash.html:1508–1532 + navFor injections) → app
| id | app |
|---|---|
| home | Home tab |
| dashboard | `admin/company` (super/ceo/coo); admin/app_manager: Home cards (work, booking) |
| users | `admin/company/users` |
| roster, departments | `admin/people`, `admin/people/departments` |
| employees, managers | **`admin/advanced/employees`, `admin/advanced/managers` (new here)** |
| projects, clients, tasks | `admin/work/projects`, `/clients`, `/tasks` |
| mytasks, trmytasks | `tasks` (+ teamboard segment) |
| requests, booking | `admin/booking/requests`, `admin/booking` |
| rooms, assets | `admin/it-desk/rooms`, `/assets` (+ **delete all**, new here) |
| servicedesk | `admin/service-desk` (+ **delete a request**, new here) |
| announcements | `announcements`, `admin/news` (+ **TV playlists**, new here) |
| bounty, wallets, referrals | `bounty`, `admin/bounty`, `admin/platform/wallets`, `admin/hiring/refer` |
| reports, devices | `admin/insights/reports`, `/devices` |
| config, audit, subscriptions | `admin/company/settings`, `/audit`, `/subscriptions` |
| accounts, accounts-vendor, -keka-approvals, -bill-review, -pettycash, -reimbursement, vendors, vendormaster, agreements | `admin/accounts/**`, Inbox `keka`/`vbill`/`petty-acct`/`reimb-acct` |
| visitors, visitors-desk/-dashboard/-kiosk/-log/-invites/-qr | `visitors`, `admin/desk/**` |
| tenants, features | `admin/platform/companies` (+ **delete**, new here), `/features` |
| overrides | no screen on the website (nothing to port) |
| org, teamroster | `people/org`, `admin/team-board` |
| attendance, timesheets, payroll, profile, support | `attendance`, `attendance/timesheets`, `admin/payroll`, `profile`, `support` (+ `admin/it-desk/support`) |
| HR setup map | **`admin/advanced/office-map` (new here)** |
Still not ported on purpose: EmpListView "Add Leave" (old /leaves table, PLAN §4 dead), the Managers page's
"Dashboard" view-as, dead features (resource requests, Assign Work), Overrides.

## Tested
- `npx tsc --noEmit` and `npx expo lint`: clean for the whole project at hand-off.
- `npx expo export --platform android` bundles (WebView map frame included).
- **Live preview NOT run.** The 8090 Metro server hung: `/status` stopped answering for minutes, and when it came back the web
  bundle request still timed out after 280 s. Starting or stopping servers isn't allowed, so no persona, size, theme or
  swipe check was done. Please smoke-test after a `--clear` restart with the fixture registered:
  - Afzal Master Admin: More › Platform › Delete data → Nexus Productions (3 people, 3 departments, 3 projects) → type the
    name → swipe → gone from Companies. Tamada Media (Demo) is refused (409).
  - Afzal IT Admin: Delete data → all assets (type "delete 16 assets") and a service request (type its TKT-…).
  - Afzal Super Admin: TV playlists → edit "Lobby loop" (reorder, seconds, dates), new playlist, delete; Office map
    (move HQ, add an office); Delete data → service request only.
  - Afzal Admin: Managers, Employees (Production). Afzal Manager: Employees (own reports). Afzal Employee: no rows, every route redirects home.
