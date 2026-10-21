# Grids: hand-off for the integrator

The website's wide tables, as phone tables. Each table has a header row that stays at the top, a first column that stays on the left, sideways scrolling for the other columns, and three text sizes (the − and + buttons in the header) in place of pinch-zoom. You can tap a heading to sort by it and tap a row to see all its columns. Rows load 50 at a time. Every table is read-only, sends no messages, and uses only existing endpoints.

## Register (shared files — integrator only)
- [ ] `src/features/domains.ts`: add these imports and one entry (after `calls`, or wherever you want the More order):
  ```ts
  import * as gridsInbox from '@/features/grids/inbox';
  import * as gridsNav from '@/features/grids/nav';
  import * as gridsTour from '@/features/grids/tour';
  { domain: 'grids', nav: gridsNav, inbox: gridsInbox, tour: gridsTour },
  ```
- [ ] No fixture file is needed. Every table reads routes that other domains' fixtures already serve: `hrtime` balances, `payroll` runs and salaries, `attendance` team, `accounts` / `petty-cash` / `reimbursements`, and `people` roster. `src/demo/fixtures/grids.ts` was not created, so nothing needs adding to the barrel.
- [ ] No Stack options, no new dependencies, no `app.json` change.

## What it adds
- **More › Workspace › People & HR**: a "Big tables" row (`grids.tables`, order 90, tourId `more.grids.tables`) that opens `/admin/grids`. It shows when the person can see at least one of the HR tables.
- **More › Workspace › Money**: a "Petty cash ledger" row (`grids.ledger`, order 90) that opens `/admin/grids/petty-ledger`.
- **Tour**: one step, `grids.tables`, on `/more`.
- **No** + actions, Home cards or Inbox kinds (`inbox.ts` exports `[]`).

## Routes (`src/app/(app)/admin/grids/`)
| Route | Table | Gate (`features/grids/access.ts`) | Data |
|---|---|---|---|
| `index` | Hub listing the tables this person may see | any of the below | — |
| `attendance` | Attendance month: people × days (P/L/H/S/N/W, Off, Hol) plus totals | canSeeHr + hrSections.attendance + (HR admin or department admin) | `/hr/attendance/team?date=` once per day up to today (same query key as the day screen). Also `/hr/attendance/settings`, `/hr/holidays`, and `/hr/attendance/people` (HR admins, so people who never clocked in still appear) |
| `leave-balances` | People × leave types: days left, with used and waiting under each | hrtime `canSetUpLeave` | `/hr/leave/balances?year=` |
| `payroll` | Payroll register: a column per earning, expense paid back, deduction and company-contribution code, then totals; month chips; "With warnings" filter | payroll `gates.runs` | `/hr/payroll/runs`, `/hr/payroll/runs/:id` |
| `salaries` | Salaries: structure, CTC, gross, start date, tax regime, PF, PT, TDS | payroll `gates.salaries` | `/hr/salary/people` |
| `petty-ledger` | Petty cash ledger (`dash.html:17243`, ported line for line, including how submissions are laid against requests). Tabs: Still open, Covered, Claims | `accounts-bill-review` and role `accounts` or `super_admin` | `/petty_cash_requests`, `/petty_cash_bills`, `/petty_cash_bill_submissions`, `/reimbursements/accounts-all` |
| `roster` | Employee details: every column of the web roster except the photo | people `canSeeRoster` | `/users` + `/whitelist` |

- Pay tables respect the Pay screens' eye button, which masks every amount. Their queries are never persisted.
- "Share as CSV" (`lib/csv`) on every table. For payroll, salaries and the roster it first opens a ConfirmSheet with SwipeToConfirm that says what the file holds and that it leaves DASH once shared. Nobody is messaged.
- Rows link to where edits live:
  - payroll line → `/admin/payroll/runs/:id/:itemId`;
  - salary → `/admin/payroll/salaries/:id` (not on your own row);
  - balances → `/admin/hr-time/balances`;
  - roster → `/admin/people/:key`.

## Personas tested
**Not tested in the preview yet.** The 8090 server never finished serving the web bundle; a request was still pending after 10 minutes, as in the integrator's report. Checks that did pass: `npx tsc --noEmit`, `npx expo lint`, and `npx expo export --platform web` (the bundle builds with every grids route).

To smoke-test after the server is restarted, open `/admin/grids` directly. The More rows appear only once the domain is registered.
- **Afzal HR** and **Afzal Super Admin**: every HR table. Super Admin also gets the ledger.
- **Afzal Accounts**: the ledger only.
- **Afzal Manager** and **Afzal Admin**: the attendance month, for their own department only.
- **Afzal Employee**: no rows, and the URLs redirect home.

## Notes
- The shared grid component is `features/grids/data-grid.tsx` (`GridView`), usable by any domain. Screen readers get one stop per row (a summary) plus the row sheet.
- The attendance month sheet makes up to 31 day requests, cached for 5 minutes. A month endpoint for the team would be cheaper, but that is a server change, so it was not made.
