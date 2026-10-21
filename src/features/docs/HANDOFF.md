# Docs — hand-off (wave 3: PDFs, documents, agreement drafting)

Checklist for the integrator (PLAN §2.1.7). Specs: `docs/port/accounts.md` §1.5/§5, `team-ops.md`, `manager-work.md`.
Owner decision applied: the website's PDF exports and agreement drafting are no longer web-only.

## Register the new domain (integrator)
- `src/features/domains.ts`: add `docs` (imports `@/features/docs/nav`, `@/features/docs/inbox`, `@/features/docs/tour`), anywhere after `accounts`.
- `src/demo/fixtures/index.ts`: add `...docsRoutes` from `@/demo/fixtures/docs` (no clash: only `POST /vendor-agreements`, which nobody else answers).
- `CREATE_ORDER`: `docs.agreement` after `people.add` (or leave it to the cap).

## Filled extension points
- **More › links** (`nav.ts`): `docs.hub` "Documents" → `/admin/docs` (order 50, tour `more.docs.hub`). Shown when any document gate passes (`canSeeDocsHub`) — in practice every staff person (own timesheet, own petty cash statements).
- **+ sheet**: `docs.agreement` "Agreement" → `/admin/accounts/agreements/new` — `canDraftAgreement` = accounts' `canSeeAgreements` (every staff role has Agreements Sign on the web; the server takes EMPLOYEE_ROLES).
- **Home / Inbox**: none. **Tour**: `docs.hub` (only when the row shows).

## Routes added
- `src/app/(app)/admin/docs/index.tsx` — the hub (reports this person may make, "Draft an agreement", signed copies).
- `src/app/(app)/admin/docs/[kind].tsx` — `timesheet`, `petty?batchId=&request=`, `schedule`, `reviews?person=`, `bounty`, `audit`, `asset?id=`, `vendors`, `vendor?id=`.
- `src/app/(app)/admin/docs/agreement/[id].tsx` — signed copy of an agreement (stamped pages + signature certificate).
- `src/app/(app)/admin/accounts/agreements/new.tsx` — drafting (owned by docs per accounts HANDOFF). Static route beats `[id]`.
- No Stack options needed.

## Shared helper (new, import freely)
`src/lib/pdf.ts`: `PdfDoc` model → `pdfHtml()` with the company letterhead (`letterheadOf(tenant)`, dash.html:822),
`sharePdf(doc)` (expo-print → named file in cache → share sheet), `printPdf(doc)`, `savePdf`, `shareServerPdf(apiPath, name)`
(server PDFs such as the payslip), `shareDataUrlPdf`, `htmlToPdfDataUrl`, `esc`, `printedLine`. Web build: a hidden iframe +
the browser print dialog ("Save as PDF").

## Links the owning domains should add (one button each, I did not edit their files)
- **accounts** `agreements/index.tsx`: a "New agreement" button → `/admin/accounts/agreements/new` and change the hero sub
  "New agreements are drafted on the DASH website." → e.g. "Draft new ones with New agreement."; vendor screen Agreements tab →
  `/admin/accounts/agreements/new?vendorId=<id>`; `agreement-detail.tsx` (signed) → "Signed copy (PDF)" →
  `/admin/docs/agreement/<id>`; vendor detail → "Summary PDF" → `/admin/docs/vendor?id=<id>`; Vendors list → `/admin/docs/vendors`.
- **accounts** `petty-cash/statement/[batchId].tsx`: "PDF" → `/admin/docs/petty?batchId=<batchId>&request=<request>`.
- **booking** `admin/booking/reviews/[key].tsx` (by employee): "PDF" → `/admin/docs/reviews?person=<group key>`.
- **work** `TomorrowCard`: next to Share, "PDF" → `/admin/docs/schedule`.
- **bountyadmin** Reports/summary → `/admin/docs/bounty`; **company** audit → `/admin/docs/audit`; **itdesk** asset detail → `/admin/docs/asset?id=<id>`.

## Gates (copied from the website; `features/docs/access.ts`)
Reviews PDF app_manager · schedule manager (ManagerHome) / admin (AdminHome next-day) · bounty report `bountyAdminGates().summary`
· audit `canSeeAudit && auditPermission('downloadReports')` (getting the rows is the recorded POST /audit_log/export, run only on a
tap) · asset `web('assets')` · vendor master `web('vendormaster')` · vendor summary `canSeeVendors` · timesheet / petty statement
every staff role (server decides the statement) · signed copy and drafting `canSeeAgreements`.

## Expo Go
react-native-webview (in Expo Go) for the pdf.js page viewer (cdnjs pdf.js 3.11.174, base64 put in the page) and the previews;
expo-print for every PDF. No native module outside Expo Go. Web build uses an iframe (`web-frame.web.tsx`).

## Demo (`src/demo/fixtures/docs.ts`)
- `POST /vendor-agreements` with the server's checks; the new agreement is pushed onto `vendorRecord('approved').agreements`, so
  Accounts' lists and the Afzal Vendor portal see it waiting for the vendor.
- **Missing export (accounts fixture)**: accounts keeps `AGREEMENT_EXTRAS` private and fills it by list index, so a drafted
  agreement shows Keka Code `p-admin`'s and drafter `u-ramesh` (Accounts / Super Admin still see it as overseers; a drafter of
  another role won't find it under "Agreements you drafted"). Please export `registerAgreementExtra(id, { project_id, keka_code,
  created_by, signer_id })` from `demo/fixtures/accounts.ts`; then add one call to it in `docs.ts`, right after `v.agreements.push`.
- In the drafting screen the demo shows "Use a sample agreement (demo)" (the vendor demo's 2-page `AGREEMENT_PDF`), because a
  demo phone may have no PDF to pick.
- Timesheet PDF in the demo uses tasks and bookings (the demo's `/hr/timesheet/mine` answers `weeks` only, no `days`).

## Tested
- `npx tsc --noEmit` and `npx expo lint`: clean.
- `npx expo export --platform web` and `--platform android` both bundle with these files (web 11 MB, android 17 MB).
- **Not tested in the preview**: the 8090 server (pid 40472, the stale one from the deps install) accepts requests but never
  finishes a bundle (the request hangs for over 10 minutes), so no persona walk-through was possible. Needed on a phone or after a
  `--clear` restart: Afzal Accounts (draft with the sample PDF, tap 2 spots on page 2, name a countersigner, swipe to send; vendor
  master + vendor summary PDFs; signed copy of a signed agreement), Afzal Employee (timesheet, petty statement), Afzal Manager
  (tomorrow's schedule), App Manager persona (pending reviews), Afzal Super Admin (bounty, audit report, signed copy),
  IT Admin (asset report); 390×844 and 320×700, light and dark.

## Review notes (independent reviewer)
- Drafting and signed copies are limited to vendor_agreements.js EMPLOYEE_ROLES. app_manager has the Accounts menu on the website, but every agreement route returns 403 for that role, so the app does not show the form.
- The signed-copy certificate leaves out the Keka Code (the copy is often forwarded to the vendor; the website's certificate leaves it out too).
- The petty cash statement opened with only `?request=` now shows loading, not "No bills submitted yet".
- The demo POST /vendor-agreements checks in the server's order and uses the server's words.
