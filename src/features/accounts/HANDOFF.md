# Accounts — hand-off (wave 1)

Checklist for the integrator (PLAN §2.1.7). Spec: `docs/port/accounts.md`.

## Filled extension points
- **More › Money** (`nav.ts workspaceRows`)
  - `accounts.desk` "Accounts desk" → `/admin/accounts` (order 10, tour `more.accounts.desk`) — Accounts, Super Admin; CEO/COO (petty cash, view only).
  - `accounts.vendors` "Vendors" → `/admin/accounts/vendors` (order 11, tour `more.accounts.vendors`) — `web('vendors') || web('vendormaster')` (Accounts only).
  - `accounts.agreements` "Vendor agreements" → `/admin/accounts/agreements` (order 12) — row: `web('agreements')`, or super_admin/ceo/coo with `accounts-vendor` (`showAgreementsRow`). The screens themselves follow the website (`canSeeAgreements` = `web('agreements') || web('accounts-vendor')`: every staff role has "Agreements Sign" under Accounts › Vendor), so a named countersigner or a drafter of any role can open them.
- **+ sheet**: none (agreement drafting waits for D4).
- **Home** (`homeCards`): `accounts.payments` (placement `needs`, order 50) — "Payments": how many approved items wait for their payment to be started / were not received. Shown to whoever can start payments (Accounts; Super Admin for vendor bills).
- **Inbox kinds** (`inbox.ts`), each with Detail + History (Past decisions):
  - `petty-acct` "Petty cash for Accounts" — `pending_accounts_approval` requests + pending old-flow petty cash bills; Accounts only, never own. (Fixes plan gap 1.)
  - `reimb-acct` "Claims for Accounts" — expense claims at Accounts' stage; Accounts only, never own.
  - `vbill` "Vendor bills" — vendor bills at Accounts' stage; Accounts + Super Admin (no self-check, as the server).
  - `agree-sign` "Agreements to sign" — `GET /vendor-agreements/pending-my-signature` for anyone with `canSeeAgreements`; Detail = the agreement screen (countersign). This is how a colleague named as countersigner (any role) reaches it on the phone. No History.
  - Proposed chip order: after the built-in `petty`. Labels can be shortened if the chip row is crowded.
- **Tour** (`tour.ts`): `accounts.desk`, `accounts.vendors` (on `/more`, only when the row shows).

## Routes added (`src/app/(app)/admin/accounts/**`)
`index` (desk) · `queue?stage=&type=` · `payments?stage=` · `item/[type]/[id]` (type = petty | pcbill | claim | bill) · `vendors/index?tab=` · `vendors/[id]` · `agreements/index` · `agreements/[id]` · `petty/tracking` · `petty/heads` · `settings` (payment timeline).
Existing file changed (owned per §2.4): `src/app/(app)/petty-cash/statement/[batchId].tsx` — a bill with `canReject` opens a menu with "Reject this bill" (ConfirmSheet + swipe, reason required, toast shows the extra claim's before → after).

## Stack options / dependencies
- No Stack options needed (default push). No new dependencies.
- Agreement drafting (`/admin/accounts/agreements/new`) is **not** built: it needs `react-native-webview` (D4). Expo-print summaries not built (optional, D4).

## Shared gates worth promoting (`features/accounts/access.ts` → `lib/access.ts`)
- `isPettyCashAdmin`, `isAccountsActor` (pettyCashIsApprover) duplicate `features/petty-cash/logic`; fine to merge.
- `ACCOUNTS_ROLES` (vendor_bills.js) — the work domain will need it if it ports the project owner's vendor bill approvals (`/vendor-bills/keka-all`).

## Demo (`src/demo/fixtures/accounts.ts`)
- Routes for vendor review, vendor bills (Accounts side), agreements (mine / pending-my-signature / draft / signatures / deadline / sign), Accounts-stage claims and petty cash, the company's bill submissions, the expense report with `canReject`, single-bill reject (shrinks the extra claim) and expense type add / switch / delete.
- **Overrides one built-in route**: `GET /petty_cash_bill_submissions/statement/:batchId` (to fill `canReject` and the real employee for colleagues' reports). Same shape as before.
- Uses exported stores only: `pettyStore`, `pettyBillStore`, `pettySubmissionStore`, `expenseHeadStore`, `setPettyStage`, `reimbursementStore`, `setReimbursementStage`, and `demo/vendor/data` `vendorRecord` / `assignVendorCode` (approving the "under review" vendor here flips the Afzal Vendor persona until it is picked again).
- Seeds added to those stores (colleagues only): 5 claims (2 waiting, 1 ready, 1 being paid, 1 not received), 6 petty cash requests (2 waiting, 1 extra claim of ₹2,400 with 4 rejectable bills, 1 ready, 1 not received, 1 received advance), 1 pending old-flow bill.
- Exported for other domains: `accountsBillsView()` (vendor bills in the server's Accounts shape).
- **Missing export to add (optional)**: none blocking. If the work domain ports `/vendor-bills/keka-all`, it should read bills through `accountsBillsView()` so both queues agree.
- `docs/DEMO-ACCOUNTS.md`, Afzal Accounts row: "Accounts desk: 3 vendor bills, 3 claims and 4 petty cash to approve (plus an old bill), 6 payments to start (3 not received), 1 registration to review (4 of 6 checks done), 1 agreement to countersign, 1 expense report with bills to reject."

## Tested
- Web preview (`accounts.localhost:8090`), 390×844 light and 320×700 dark.
- **Afzal Accounts**, end to end: Home "Payments" card and "Needs you"; Inbox chips and rows for all three kinds and `/inbox/reimb-acct/<id>`; desk, list, payments; vendor bill **approve** (swipe → success sheet, timeline updates); petty cash **start payment**; vendor registration (Waiting tab → detail → two checklist switches → **approve** swipe → tabs Details / Bills / Agreements); approved vendor's Bills tab (figures, chart, list); expense reports → Imran's report → **reject one bill** (toast: the ₹2,400 extra claim closes); agreements list and detail with the Extend sheet (prefilled now + 7 days); expense types add + switch; payment timeline screen.
- **Afzal Super Admin**: More › Money shows Accounts desk + Vendor agreements (no Vendors); petty cash and claims open as "View only"; Home payments card counts vendor bills only.
- Not swiped in the preview (the shared pane was hidden, which pauses sheet animations): extend deadline, countersign, delete expense type, save payment timeline, switch off vendor, ask for corrections, reject a claim. They use the same ConfirmSheet + swipe path as the flows above; worth one pass on a phone.
- Review pass (separate tab, `acctrev.localhost:8090`): swiped extend deadline, countersign (as Afzal Accounts and as Afzal Employee via the `agree-sign` Inbox kind), delete expense type (in use → refused; unused → deleted), save payment timeline, switch a vendor off and on, ask for corrections, reject a claim.
- Demo note: the countersign agreement names "whoever is exploring", so Afzal Employee's Inbox now also shows 1 "Agreements to sign".
- Afzal Employee: gates checked in code (no `accounts-bill-review`, `vendors`, `agreements`, leadership or petty admin), not re-checked in the preview.
