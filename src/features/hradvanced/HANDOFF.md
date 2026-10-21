# hradvanced — hand-off to the integrator (wave 3)

The owner said "everything in the website should be in the app". This domain covers these items, which
PLAN §4 had kept website-only:

- the salary-structure editor;
- statutory and TDS editing;
- the logo and report-logo uploads;
- the professional categories table;
- "Extend shoot time", with a double-booking check;
- the HR database check banner (`HrDbCheckBanner`), which wasn't ported yet.

It uses existing endpoints only. It adds no dependency and no Stack options.

## 1. Register the domain (you have to do this; nothing shows until you do)
- [ ] `src/features/domains.ts`: add `hradvanced` (nav, inbox and tour) to `DOMAINS`.
- [ ] `src/demo/fixtures/index.ts`: add `hradvancedRoutes` from `@/demo/fixtures/hradvanced`, **before `...payrollRoutes`**.
  - The overlay's `GET /hr/salary/structures` has to win over payroll's.
  - Without that, created and edited structures never show in the demo.
  - `PUT /hr/statutory`, `POST`/`PUT /hr/salary/structures` and the db-check work in any order, because payroll doesn't answer them.
  - **Until it is registered**, those writes reach the demo server's fallback. It answers `{ ok: true }`, so a save "succeeds" but changes nothing. The 3 seeded shoots for "Extend a shoot" also won't exist.

## 2. Plug-ins filled in
**More › Workspace rows** (`nav.ts`):

| Key | Section | Order | Gate | Route |
|---|---|---|---|---|
| `hradvanced.payroll-setup` "Payroll setup" | people | 31 (after `payroll.hub`, 30) | `payrollSetupGates().any`: Super Admin / HR with `salary` or `tax` | `/admin/hr-advanced/payroll-setup` |
| `hradvanced.branding` "Branding" | company | 60 | `webNav(user,'config',tenant)`: super_admin / ceo / coo, feature `config` | `/admin/hr-advanced/branding` |
| `hradvanced.categories` "Professional categories" | company | 61 | same | `/admin/hr-advanced/categories` |
| `hradvanced.extend` "Extend a shoot" | work | 35 | role `manager` (dash.html:30513 ManagerHome) | `/admin/hr-advanced/extend` |

- **Tour** (`tour.ts`): 3 steps on `/more`, each shown only when its row is shown.
  - `hradvanced.payroll` → `more.hradvanced.payroll`
  - `hradvanced.branding` → `more.hradvanced.branding`
  - `hradvanced.extend` → `more.hradvanced.extend`
- **+ sheet, Home cards, Inbox kinds:** none, on purpose. Nothing here waits on anyone or messages anyone.

## 3. Screens (`src/app/(app)/admin/hr-advanced/`)
- `payroll-setup`: the hub.
  - The HR database check banner (`GET /hr/admin/db-check`), shown only when something is missing.
  - Rows for Salary structures (with the active count) and Statutory and TDS (shows "N missing" or "Complete").
- `structures/index`: active structures, "New structure", and a link to payroll's read-only screen for Retire and "Try a CTC".
- `structures/[id]` (`new` creates a structure): one card per part (code, name, who pays, how it's worked out, value, taxable, counts for PF).
  - Rows are checked with the server's rules.
  - A live preview with a sample CTC.
  - Saving opens a ConfirmSheet that lists every change. The swipe stays locked until the **structure's name is typed**.
- `statutory`: PF, ESI, professional tax slabs, and TDS (mode, default regime, both regimes with slabs). The body is the website's own (`dash.html:5245`).
  - Field errors use the server's rules.
  - The `missing[]` list is shown live.
  - The settings are **read again before the confirm**. If someone else saved meanwhile, the swipe is blocked and "Load the latest" is offered.
  - The swipe stays locked until **`CHANGE TAX`** is typed.
- `branding`: logo text, sidebar logo and report logo. Each can be chosen (PNG/JPG, at most 2 MB), replaced or removed.
  - The file is sent exactly as picked (`pickDocument` → data URL), so transparent PNGs stay transparent.
  - The preview shows the logo on a light strip and a dark strip.
  - Each save or remove goes through ConfirmSheet + swipe: "Everyone sees it straight away".
- `categories`: the website's `ProfessionalCategoriesCard` rules, line for line.
  - The id is derived from the label once and then fixed.
  - A blank row is skipped. Two rows can't share an id.
  - The day must end after it starts. The gap is 0–480 minutes.
  - At least one category stays.
  - The company record is read again before saving (the list is replaced whole), and a conflict blocks the save.
- `extend`: today's approved professional bookings of my reports (`deptEmps`, matched by name as on the web).
  - A Stepper adds time in 15-minute steps, up to the latest free end. That end allows for the next booking, the category's gap and the category's day end.
  - "Check and continue" re-reads `/bookings?since=today` and `/holds`, and stops if the booking changed or the time is taken.
  - Saving takes a `POST /holds` on the extra time, so the server refuses with 409 if it was just taken. It then runs `PUT /bookings/:id {endTime}` and releases the hold.
  - The ConfirmSheet says nobody is messaged ("tell X yourself"). `PUT /bookings` only emails on a status change.

Every screen re-checks its gate. It shows a skeleton while loading, then sends anyone without the gate to `/`. Pay and tax queries reuse `api/payroll` (`persist:false`). Writes are in `features/hradvanced/api.ts`.

## 4. Please also do (shared or other domains' files)
- [ ] **Payroll's read-only screens still say "Change these on the DASH website".**
  - `admin/payroll/statutory.tsx` banner: add "Edit" → `/admin/hr-advanced/statutory`.
  - `admin/payroll/structures.tsx` caption: add "Create or edit" → `/admin/hr-advanced/structures`.
  - Also update payroll HANDOFF's "Website-only" list.
- [ ] **Better demo glue (optional):** export `STRUCTURES`, `STATUTORY` and the structure lookup from `fixtures/payroll.ts`. Then `hradvanced.ts` can drop its overlay, and `POST /hr/salary/assign` can use a structure created in the app.
  - Today a structure created in the app can be listed, edited, previewed and retired, but **assigning it to a salary answers "Structure not found."** in the demo only.
  - Statutory edits already change payroll's live settings, so the next run uses them.
- [ ] `docs/DEMO-ACCOUNTS.md` "What to try":
  - Afzal HR / Super Admin → More › Payroll setup.
  - Super Admin → Branding, Professional categories.
  - Afzal Manager → Extend a shoot. Sanjay's 10:00–13:00 can only go to 14:00 because he is booked 14:00–17:30. Sneha's 11:00–15:00 can run long.
- [ ] Bump `TOUR_VERSION` at release.

## 5. Demo (`src/demo/fixtures/hradvanced.ts`)
- **Structures:** the `hr_payroll_calc.validateComponents` and `readStructure` rules are ported. A duplicate name gets a 409 with the server's words. Created and edited structures go in an overlay over payroll's list, and retire goes through payroll's own handler.
- **`PUT /hr/statutory`:** `normaliseStatutory` and `statutoryMissing` are ported. It changes payroll.ts's live settings object in place.
- **`GET /hr/admin/db-check`:** every table is present for master_admin, super_admin and hr. Anyone else gets a 403.
- **3 approved shoots today:**
  - Sanjay, two bookings with a clash.
  - Sneha, free after hers.
  - They are pushed into `tasks.ts bookingStore`. Approved by the demo person, so Afzal Manager sees them.
- Branding and categories need no routes: `company.ts` answers `PUT /tenants/:id` for every key.
- No fixture file of another domain was edited.

## 6. Checks
- `npx tsc --noEmit` and `npx expo lint` are clean.
- `npx expo export --platform web` bundles.
- The pure rules were run in node: structure validation, the statutory round trip, missing fields and the change list, and the category id/clash rules.
- **Not smoke-tested in the preview.** `localhost:8090` answers `/status`, but the web bundle request never returns (5+ minutes; this is the stale-server blocker the integrator reported). Please walk through the personas on 8090 after the restart:
  - Afzal HR: payroll setup, structure create/edit, statutory with `CHANGE TAX`.
  - Afzal Super Admin: branding, categories.
  - Afzal Manager: extend.
  - Afzal Employee: no rows, and deep links redirect home.

## 7. Independent review (fixes applied)
- Extend: a shoot already "finished early" (`actualEndTime`, set by release-remaining) can't be extended. A new `endTime` wouldn't move its real end, so the save would look done but change nothing. Its row says "Finished early".
- Statutory and categories: if reading the latest values again fails, the confirm sheet doesn't open. Before this fix the swipe was still offered without the check for someone else's save.
- Statutory: switched-off sections and non-slab TDS regimes are now checked too. The server validates the whole body, so a bad hidden value used to come back as an error with no field to point at. A banner now names the section.
- Payroll setup: pull-to-refresh only re-reads what this person may see. Before, HR with only `tax` got a 403 from structures and a false "Couldn't load" banner.
- Known and unchanged (same as the website): the extended time is held only while saving. It isn't added to the booking's `slot_locks`, because `PUT /bookings` doesn't re-claim slots. Booking screens that read the bookings list still see it.
