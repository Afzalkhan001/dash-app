# Excel (Import & export): hand-off for the integrator

Owner decision: "everything in the website should be in the app". This domain moves PLAN §4's first two
web-only rows (bulk Excel/CSV uploads, and Excel exports) into the app. It uses only existing endpoints,
needs no server or DB change, and adds no dependency (`xlsx` 0.20.3 was installed by you). SheetJS is
loaded with a lazy `require` the first time a workbook is used, so it adds nothing to app start-up.

## Files (all new)
- [x] `src/lib/xlsx.ts`: `shareXlsx(fileName, sheets)` (.xlsx → share sheet; a download on web),
      `letterheadRows` (port of the website's `xlsxLetterheadRows`), `objectsToRows`, `workbookBase64`,
      `pickSpreadsheet()` (.xlsx/.xls/.csv up to 8 MB, native and web), `readWorkbook`, `readCsvText`,
      `sheetObjects`, `sheetMatrix`. Other domains may use it. Chat already has its own
      `features/chatvoice/excel.ts`; it could switch to this later.
- [x] `src/features/excel/`: `access.ts` (every gate, with dash.html refs), `catalog.ts`, `parse.ts`
      (line-for-line ports of the website's sheet readers, plus validation), `templates.ts`, `api.ts`
      (writes + `useApiList`, `useUploadBatches`), `work-time.ts` (timesheet, bookings and Keka-code
      maths), `format.ts` (IST cell formats), `ui.tsx`, `export-shell.tsx`, `gate.ts`, `samples.ts`,
      `exports/{people,work,money,it,company}.tsx`, `nav.ts`, `inbox.ts`, `tour.ts`.
- [x] Routes `src/app/(app)/admin/import/`: `index` (hub), `employees` (Add new · Update), `projects`,
      `clients`, `assets`, `subscriptions`, `history`, `export/[key]`.
- [x] `src/demo/fixtures/excel.ts`: sample sheets for every import, plus `excelRoutes`.

## Please register
- [ ] **`src/features/domains.ts`**: add `excel` with `features/excel/{nav,inbox,tour}` (import the
      three modules and add one `DOMAINS` line after `calls`).
- [ ] **`src/demo/fixtures/index.ts`**: add `...excelRoutes` **last**, so it never shadows the POST
      handlers that people.ts (whitelist, departments, users), work.ts (projects, clients) and
      itdesk.ts (assets) already have. It answers only `GET/POST /upload_batches` (seeded with one
      employee and one asset batch) and `POST /subscriptions/import`. Until it is in the barrel,
      upload history is empty in the demo and the subscription import reports 0 rows.
- [ ] Optional: the subscription import in the demo only counts rows. company.ts's subscription store
      isn't exported, so imported rows don't appear in Subscriptions. Export `SUBS` (or an
      `importSubs`) from company.ts if you want them to appear.

## Plugged in
- [x] More › Workspace, section `work`: one row, `excel.hub` "Import & export" (order 95, tour id
      `more.excel.hub`). It shows when the person has any import or export. Almost every staff role has
      one, because "My timesheet" and "A chat" are downloads for everyone.
- [x] Tour: `excel.hub`, only for super_admin / hr / it_admin / admin (the people who upload).
- [x] No + actions, no Home cards, no Inbox kinds.

## What is in it (website ref → app)
Uploads, each with template download → pick a file (or the demo sample) → validated preview (Ready /
Problems, per-row details, Leave out) → ConfirmSheet + SwipeToConfirm that says who is messaged → result
with failed rows by their sheet row number:
- Employees, Add new (BulkUpload 5998). Roster match by ID, then email; new departments are created
  first; new people → POST /whitelist + PUT (DASH emails each a **welcome**, as the confirm says);
  POST /upload_batches. **Not ported:** the website's step 4/4b "repair" passes (a self-heal).
- Employees, Update (applyBulkUpdate 6365): by employee ID, filled cells only, PUT /users + /whitelist.
  Never `/users/bulk-patch`.
- Projects (22660), Clients (23373, also reads .xlsx), Assets (20250, + upload history), Subscriptions
  "Upload past data" (11409; the server's `canManage` decides, read-only grantees see a notice).
- Upload history (employees, assets): download any past batch again.

Downloads (real .xlsx, the website's columns, sheet and file names):
roster (5818), my timesheet (28724), someone's timesheet / bookings (29929, 30032; canViewTimesheet),
reports ×4 or all-in-one (23812, reuses features/insights/reports), Keka code time (22370, all tabs as
sheets; the website shares one tab as CSV), payroll register (register.csv → xlsx; the demo builds the
same columns from the run's lines), subscriptions (3 sheets), vendor master (no bank), bounty coins
report (master: top-ups only), asset register ×4 + one asset's history, service desk (the viewer's
slice, via servicedesk's `useDesk`), device monitoring roster, TM360 for one person (all 4 tabs loaded
for the dates), activity audit (POST /audit_log/export), a chat (GET …/export).

## Deliberate differences
- Someone else's timesheet leaves out *submitted timesheet lines*. The website calls
  `/hr/timesheet/mine` there, which returns the **viewer's** sheets, not the employee's. The phone only
  uses it for "My timesheet". The screen says so.
- "Someone's bookings" uses the timesheet viewer rule. On the website, it is whoever can open the
  employee profile modal.
- Destructive admin actions (delete all assets, and so on) are not here. They belong to their own domains.

## Checks
- `npx tsc --noEmit` and `npx expo lint` are clean. `npx expo export --platform android` bundles.
- All six parsers were run in Node against the demo sample sheets, and gave the expected rows,
  matches and warnings. The month-heading date correction and the CSV-to-xlsx conversion also worked.
- **Not checked in the preview.** Every load of the 8090 server hung on `entry.bundle`, in my tab and
  in other agents' tabs. Please walk through these personas once the server is restarted:
  - HR: Employees (sample), roster export
  - IT Admin: Assets (sample), asset register, service desk, history
  - Super Admin: Projects, subscriptions import and export, audit, reports, Keka code
  - Accounts: vendor master
  - Employee: My timesheet, chat
  - Manager: someone's timesheet
  - Master Admin: bounty report
