# Company domain — hand-off (wave 1)

Spec: `docs/port/leadership-admin.md` (company parts; master admin is the platform domain).
No server, website or DB change. No new dependency. No shared file edited.

## What it adds

**Routes** (`src/app/(app)/admin/company/`)
- `index` — Company dashboard (4 counts; People and Departments open a list)
- `users` — system logins + invitations; Change role, Remove (swipe), Add a login (swipe, says who is emailed)
- `settings/index` — company details, 4 switches (turning one off is swiped), visitors, "Who can…", earning cap, by-department links, seats
- `settings/access/[list]` — `news | bounty | projects | audit | subscriptions` grant lists (audit: 4 permission switches)
- `settings/hr` — HR by department (Super Admin with `hr.canConfigure`)
- `settings/team-roster` — Team Roster by department (Super Admin, company switch on)
- `audit/index` — activity audit (counts, find a person, type chips, dates, filters, endless list, detail sheet, Share as CSV)
- `subscriptions/index`, `subscriptions/[id]` — overview / all / payments, add, edit, record payment, delete (swipe)

No Stack options needed (plain pushed screens).

**More › Workspace rows** (`nav.ts`)
| key | section | who |
|---|---|---|
| `company.dashboard` | company | super_admin, ceo, coo |
| `company.users` | company | `web('users')` |
| `company.settings` | company | `web('config')` |
| `company.audit` | company | `web('audit')` (super_admin, or an `auditAccess` grant) |
| `company.subscriptions` | company (leadership) · it (it_admin) · money (grantees) | `web('subscriptions')` |

Each has a `tourId` `more.company.<x>`.

**Create actions:** none. **Inbox kinds:** none (nothing in this domain waits on a decision).

**Home card:** `company.glance`, placement `top`, order 10 — super_admin, ceo, coo. TourTarget `home.company.glance`.

**Tour steps** (`tour.ts`): `company.glance` (Home), `company.settings`, `company.users` (More), and for
non-leadership grantees `company.audit` / `company.subscriptions` (More).

## Gates (`access.ts`) — promote if another domain needs them
`USER_ADMIN_ROLES`, `ROLE_ASSIGNER_ROLES`, `DESTRUCTIVE_ROLES` (lib/authz.js), `auditPermission` (server
`hasAuditPermission`), `canManageSubscriptions`. Audit "Open an activity" is gated on the grant's
`viewDetail` and "Share" on `downloadReports` (the website shows both and lets the server refuse).

## Demo (`src/demo/fixtures/company.ts`)
Routes: `GET /dashboard/summary`, `PUT /tenants/t-demo` (other ids left to platform), `GET /team-roster/departments`,
`GET /hr/config/overview`, `PUT /hr/config/departments[/:id]`, all `/audit_log*`, all `/subscriptions*`.
Seeds: 4 system logins via `upsertPerson` (Swathi Reddy hr, Arjun Mehta it_admin, Anand Rao accounts,
Bhavna Kapoor app_manager; no department), their invitations + 3 unused ones (Rohit Bansal admin, Lobby TV
display, Reception Desk visitor manager) pushed into **people.ts `whitelistStore`**, ~70 audit rows, 10
subscriptions + a ledger since January. Writes here add audit rows (the active persona did it, now).

Personas: **Afzal Super Admin** everything · **Afzal HR** audit (grant: view, search, open) · **Afzal IT Admin**
subscriptions (manage) · **Afzal Accounts** subscriptions (read + share). Others are sent home.

### Needs the integrator (fixture clashes — first route in the barrel wins)
1. `GET /whitelist` is shadowed by **work.ts** (one static row) and **servicedesk.ts** (two rows), both before
   people.ts. Users › "Not signed up", the invitation half of Change role / Remove, and the grant pickers
   need people.ts's `whitelistStore` answer. Please make work/servicedesk read `whitelistStore` (or drop theirs).
2. `PUT /departments/:id` (people.ts) ignores `teamRosterEnabled`; Team Roster by department switches don't
   stick in the demo. The real route merges any field — please pass `teamRosterEnabled` through there.
3. `GET /users` / `PUT|DELETE /users/:id` / whitelist writes are people.ts's — this domain relies on them.

## Tested
Web preview (own origin 127.0.0.2:8090 so other agents' persona switches don't interfere), 390×844 and
320×700, light and dark: Afzal Super Admin (all screens; toggles, grant add/remove/permission, edit and
record payment, add subscription, role change, every confirm sheet opens with its text), Afzal HR (audit),
Afzal IT Admin (subscriptions manage; redirected from settings), Afzal Accounts (subscriptions read-only).
Every fixture route and refusal was also called directly. Review pass (127.0.0.3:8090, pane displayed, stepped
pointer drag): SwipeToConfirm completed end to end for Delete subscription, Delete payment, Company settings › turn
Org off, and Users › Remove access — each write landed and the lists updated.
`npx tsc --noEmit` and `npx expo lint` are clean.
