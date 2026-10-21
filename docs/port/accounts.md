# Port plan: Accounts (website only today, to be added to the app)

Scope: vendor registration review, Vendor Master, vendor bill approvals, agreements (draft, send for e-sign, extend, countersign), the Accounts stage of expense claims (reimbursements: authorize, reject, start payment), and the Accounts side of petty cash (authorize, payments, receipts, statements, ledger, expense heads).

Hard rule kept: **everything below works on endpoints that already exist.** Section 8 lists the only server changes worth asking for, and none of them blocks the port.

File references: `dash.html:<line>` is the website. Server references are `server.js`, `vendor.js`, `vendor_bills.js`, `vendor_agreements.js` and `reimbursements.js`. Mobile paths are relative to `mobile/`.

---

## 0. Who sees what on the website (gates)

| Gate | Where | Effect |
| --- | --- | --- |
| `navForRaw` role table | dash.html:1531 | The `accounts` role menu is: **Vendor Registrations** (`vendors`), **Vendor Master** (`vendormaster`), **Bill Approvals** (`accounts-bill-review`), **Agreements** (`agreements`), Profile, the **Accounts** group (ACN), Support. The default view for `accounts` is `vendors` (dash.html:30257). |
| `ACN` | dash.html:1521 | The Accounts group holds Vendor (`accounts-vendor`), Approvals (`accounts-keka-approvals`, only when `isKekaCodeOwner`, dash.html:1424/1520), Petty Cash (`accounts-pettycash`) and Reimbursement (`accounts-reimbursement`). Every staff role gets ACN except master_admin, visitor_manager and announcement_viewer. |
| `ACN_REVIEWER` | dash.html:1530 | The same group plus **Bill Approvals**. Used by super_admin, and by CEO/COO through `n.ceo=n.super_admin` (dash.html:1531). |
| `FEATURE_REGISTRY` and `tenantFeatureOn` | dash.html:1373, 1391-1392, 1406 | Only `vendors` and `vendormaster` can be switched off per company. `agreements`, `accounts` and `accounts-*` cannot. navFor applies this filter at dash.html:1500-1505 (master_admin is exempt). |
| `CROSS_ROLE_VIEWS` | dash.html:30471, 30484-30488 | Routes `accounts-vendor`, `accounts-keka-approvals`, `accounts-bill-review`, `accounts-pettycash` and `accounts-reimbursement` for any role whose navFor (including `children`) has them (inNav check at dash.html:30499-30505). |
| `AccountsViews` | dash.html:25917 | The `accounts` role's own switch: `vendormaster` opens VendorMaster, `agreements` opens AgreementsSignTab, anything else opens VendorRegistrations. Opening a vendor swaps to VendorVerification. |
| Petty cash role helpers | dash.html:16245-16256 | `PETTY_CASH_ADMIN_ROLES_FE` = accounts, super_admin, master_admin, ceo, coo (see everything). `pettyCashIsApprover` = **accounts only** (signs off). `pettyCashAccountsInBillApprovals` = accounts and super_admin (Bill Approvals shows the petty cash and reimbursement tabs). |
| HR gates (`canSeeHrNav`, `HR_SECTIONS`) | dash.html:4641, 5299 | **Not involved.** Accounts screens are role-gated only. |

Quirks worth knowing:
- Super Admin has no `vendors` or `vendormaster` nav item, although the server lets super_admin in (`vendor.js:188`). In practice, registration review is Accounts-only.
- CEO and COO see Bill Approvals, but `/vendor-bills/accounts-all` is `ACCOUNTS_ROLES` = accounts, super_admin, master_admin (`vendor_bills.js:36`). They get a 403, so the page is empty. The app should not offer it to them.
- Super Admin on Bill Approvals: can authorize and pay **vendor bills** (in ACCOUNTS_ROLES). Petty cash and reimbursements are **view only** (`canActPc` = accounts, dash.html:34805; server `PETTY_CASH_APPROVER_ROLES=['accounts']` server.js:3250, `ACCOUNTS_ACT=['accounts']` reimbursements.js:28).

---

## 1. Website features, step by step

### 1.1 Vendor Registrations (`VendorRegistrations`, dash.html:24954)
- **Registration link card.** Shows `location.origin + '/vendor'`, with **Copy Link** (clipboard) and **Open** buttons.
- **Status tabs:** Pending (`pending_verification`), Correction Required, Approved, Rejected, All.
- **Filters:**
  - Search (debounced 350 ms) on name, vendor ID, contact number (any format), PAN, GSTIN and email.
  - GST: registered or non-GST.
  - MSME: yes or no.
  - From and To dates.
  - Clear.
- **Table columns:** Vendor ID (`vendorCode`), Vendor (legal and trade name), Contact Person, Number, Email, PAN, GST, MSME, Submitted, Status (`VStatus`, meta at dash.html:24830), and a **Review** button that opens VendorVerification.
- **Errors:** an error banner. A "Sign in / permission" error adds the hint "Sign out and back in".

### 1.2 Vendor Verification, the detail screen (`VendorVerification`, dash.html:25399)
Loads `GET /accounts/vendors/:id`.
- **Header:** legal name, vendor code chip, phone and email, submitted time, status pill, "N of M checks complete", "Approved by".
  - **Print Summary** (`printVendorSummary`, dash.html:25093) builds an HTML page in a hidden iframe. It prints every section, then every live document: images as-is and PDFs rasterised with pdf.js (up to 15 pages each). The account number stays masked unless it was revealed on screen. Each document fetch is audit-logged as "document viewed".
- **Possible duplicates** banner (`possibleDuplicates`). Never merged.
- **Outstanding correction** banner (`correction.items` and `comments`).
- **Approved vendors only:** tabs Details, **Agreements** (`VendorMasterAgreementsTab`, dash.html:25230) and **Bills** (`VendorMasterBillsTab`, dash.html:25291).
- **Sections:**
  - Business.
  - Contact.
  - Tax: PAN and holder type. For non-GST vendors, **PAN–Aadhaar link** (`PanAadhaarLink`, dash.html:24879) with:
    - **Verify / Re-check with Digio**,
    - **Ask Digio anyway** for not_applicable PANs,
    - on failure, **Record as Linked / Not Linked** by hand.
  - Aadhaar (non-GST only: name, last 4 digits, address, verified on).
  - GST: status, reason, GSTIN, a warning when the GSTIN does not match the PAN, and the Digio GST verification.
  - MSME.
  - 206AB declaration, with a red warning for a "specified person".
  - Bank: penny-drop verified or vendor-entered. The account number is masked with a **Show/Hide** toggle.
  - Compliance Documents: label, E-SIGNED tag, file, version, size, signature attestation, status, **View** (image inline or PDF iframe), plus a collapsible list of superseded versions.
  - Registration History (audit rows).
- **Verification Checklist** (`applicableChecks`, labels at dash.html:24843). Checkboxes are enabled only while status is pending_verification, submitted or correction_required. Each toggle sends `PUT .../verification`.
- **Actions:**
  - **Approve Vendor.** Disabled until every check is done. A server 400 lists what is outstanding.
  - **Request Correction.** A modal with a checklist of `CORRECTION_LABELS` (dash.html:24846) and required comments.
  - **Reject.** A modal with a required reason that is emailed to the vendor.
  - **Deactivate Vendor** (approved only, behind `window.confirm`).
  - **Reactivate Vendor** (inactive only).
- **Pending Change Requests** (vendor-raised): field, old value to new value, reason, **Approve** or **Reject**.

### 1.3 Vendor Master (`VendorMaster`, dash.html:25830)
- `GET /accounts/vendors?status=approved`. Search is debounced 250 ms and guarded against out-of-order replies.
- **Filters:** "Aadhaar PAN not linked" and "GST inactive (not registered)".
- **Columns:** Vendor ID, Vendor, Contact, Number, Email, PAN, Aadhaar-PAN pill (linked, not linked, N/A, not checked), GST, MSME, **Open** (goes to VendorVerification).
- **Export** of the rows on screen as **Excel** (SheetJS `window.XLSX`) or **PDF** (jsPDF autotable, landscape) through `exportVendorMaster` (dash.html:25802). Bank details are deliberately left out.
- **Approved vendor > Agreements tab:** `GET /vendor-agreements/mine?vendorId=` (Accounts is an overseer, so it sees company-wide). Status filter, project, raised by, deadline (EXPIRED tag), **View Draft**, or **View Signed Document** (`SignedAgreementView`, dash.html:32574).
- **Approved vendor > Bills tab:** `GET /vendor-bills/by-vendor/:id`.
  - KPI cards (`VM_BILL_KPIS`, dash.html:25285): Submitted, Approved, Pending and Rejected, with counts and amounts. Clicking a card filters.
  - A stacked share bar.
  - "Billed per month" (6 months), "By Keka Code" (top 6) and "By submitter" (top 6, POC tagged).
  - Chips: stage filter, "Raised by POC", status select.
  - Table: Submitted, By, Keka Code, Amount (ADVANCE tag), Description, Status, **View Bill**, **History** (`BillHistoryModal`, dash.html:33897, which calls `GET /vendor-bills/:id`).

### 1.4 Bill Approvals (`VendorBillApprovals`, dash.html:34803)
One page for every item waiting on Accounts. Shared stage vocabulary (`PAYMENT_STAGE_META`, dash.html:16960): Awaiting Authorization, Ready for Processing, Processing, Received, Not Received (follow-up), Rejected.

- **Loads in parallel:** `/vendor-bills/vendors`, `/vendor-bills/accounts-all` and `/vendor-bills/settings`. When the role is accounts or super_admin, it also loads `/petty_cash_requests`, `/petty_cash_bills`, `/petty_cash_bill_submissions` and `/reimbursements/accounts-all`.
- **Header:** Last updated, **Petty Cash Ledger** toggle, **Payment Timeline** (settings modal, dash.html:35137), Refresh.
- **Six KPI cards.** Clicking one sets the status filter. Counts always match the filters.
- **Filters:** search, Keka Code, Project, Employee, Status, and Date (today, 7 days, 30 days, this month). Clear Filters.
- **Tabs with counts:** Petty Cash Requests, Vendor Bills, Reimbursements, Payments. 10 rows per page (`BA_PAGE_SIZE`, dash.html:17105).
  - **Petty cash tab.** Requests at Accounts' stage onward (`pettyCashStage`, dash.html:16968), excluding the viewer's own, plus old-flow receipts (`petty_cash_bills`).
    - Awaiting rows: **Authorize** (confirm, then `POST /petty_cash_requests/:id/accounts-approve`) or **Reject** (optional reason, `accounts-reject`).
    - Receipts: **Approve** or **Reject** (`/petty_cash_bills/:id/approve|reject`).
    - Rows in payment: "Open in Payments" and **History** (`PettyCashHistoryModal`).
    - `PettyCashExcessTag` marks extra claims.
  - **Vendor bills tab.**
    - Columns: Vendor (ADVANCE tag), Keka Code, Project, Keka Owner, Submitted By, Submitted Amount, Keka Approved Amount, Submitted On, Status.
    - Actions: View Bill (`GET /vendor-bills/versions/:versionId/file`), History, **Authorize** (confirm, then `accounts-accept`) and **Reject** (required reason via `RejectReasonModal`, then `accounts-reject`).
  - **Reimbursements tab.**
    - Columns: RMB reference, Keka Code, Project, Employee, Purpose, Amount, Keka Approved (or "Own Keka Code"), Submitted, Status.
    - Actions: receipt link (`/reimbursements/:id/receipt`), History, **Authorize** (`accounts-authorize`) and **Reject** (reason **required**, `accounts-reject`). The claimant's own claims are view-only.
  - **Payments tab** (`PaymentsPanel`, dash.html:17360). Every authorized petty cash request, reimbursement and vendor bill, grouped Ready, Processing, Received or Not Received.
    - Columns: Item, Keka, Raised By, Amount, Stage, Payment (date, reference, by, method), Requester's Response.
    - **Start Processing** or **Process Again** is one click after a confirm (`startPaymentFlow`, dash.html:17069). It posts `{}` to `/petty_cash_requests|reimbursements|vendor-bills/:id/payment/start`.
    - Hidden on the viewer's own items ("Someone else must process this").
    - **There is no "Mark paid".** Only the requester's Received or Not Received answer completes a payment.
- **Petty Cash Ledger** (`PettyCashLedger`, dash.html:17243). Read-only. Raised versus bills covered versus outstanding, per request, over a date range. It is built from data that is already loaded.

### 1.5 Agreements (`AgreementsSignTab`, dash.html:34511)
The `accounts` role reaches this from the top-level **Agreements** item. Every other role reaches it through Accounts > Vendor > "Agreements Sign" (`VendorSection`, dash.html:33713).
- **Pending Your Signature** card (`/vendor-agreements/pending-my-signature`) with **Review & Sign**, which opens `InternalSignAgreementModal` (dash.html:34321). It renders the PDF page with the vendor's signature at each vendor spot, then `SignaturePad` (dash.html:32778) posts `POST /vendor-agreements/:id/sign`.
- **Find a Vendor:** a client-side search over `/vendor-bills/vendors`. It opens `AgreementVendorProfile` (dash.html:34415), which loads `/vendor-agreements/vendor-profile/:id` and `/vendor-agreements/mine?vendorId=`.
- **New Agreement** (`NewAgreementModal`, dash.html:34211):
  - Keka Code (ProjectSearch over `/projects`).
  - Project name the vendor sees.
  - Deadline (datetime, must be in the future).
  - **Draft PDF** (8 MB maximum, PDF only).
  - Optional **internal signer** (search over `/users`).
  - Then, on a pdf.js render (`PdfPageViewer`, dash.html:32408), **tap to mark one or more sign spots** `{page,x,y,signer}` with x and y as 0..1 fractions. Prev/Next page. Each spot can be assigned to Vendor or to the internal signer.
  - **Send for Signature** posts `POST /vendor-agreements`.
- **"My Agreements" / "Company Agreements"** list (overseer when `isOverseer`). Keka/Project filter, status, deadline with EXPIRED tag, View Draft or View Signed Document, and **Extend Deadline** (`ExtendDeadlineModal`, dash.html:34379), which sends `PUT /vendor-agreements/:id/deadline`. Extend is shown to the drafter or an overseer while status is `pending_signature`. The default is now + 7 days, and the new deadline must be later than both the current one and now.

### 1.6 Petty Cash, Accounts' view (`PettyCashHub`, dash.html:16277)
- **Tabs:** My Petty Cash, Bill Submission, **Approvals**, **Tracking**, and **Expense Heads** (admins).
- **Approvals** (`PettyCashApprovalsBoard`, dash.html:17547): requests at `pending_approval` that the viewer may approve. For Accounts that is **any** request: `POST /petty_cash_requests/:id/approve` sends it straight to `ready_for_payment` (server.js:3741-3769). The Accounts-stage queue lives on Bill Approvals for accounts and super_admin; CEO/COO get `PettyCashAccountsQueue` here.
- **Tracking** (`PettyCashTrackingBoard`, dash.html:17613):
  - Filters: date from and to, project, and employee name (admins only).
  - Calls `POST /petty_cash_bill_submissions/reconcile` first.
  - Then loads `/petty_cash_requests`, `/petty_cash_bills`, `/petty_cash_bill_submissions/owned` and, for admins, `/petty_cash_bill_submissions`.
  - Opens a **Statement of Expenses** per batch.
- **Statement of Expenses** (`PettyCashStatementModal`, dash.html:16427). `GET /petty_cash_bill_submissions/statement/:batchId[?request=]`.
  - **Print / Save as PDF** (window.print).
  - A side list of bills. Accounts can **Reject one bill** with a required reason (`POST /petty_cash_bill_submissions/:id/reject`). The server shrinks or closes a linked extra claim and emails the employee.
- **Expense Heads** (`PettyCashDepartmentsCard`, dash.html:17750). Add (`POST /petty_cash_departments`), Activate/Deactivate (`PUT`), and **Delete** (`DELETE`, a hard delete that is refused when the head is in use).

### 1.7 Reimbursement hub (`ReimbursementHub`, dash.html:33683)
My Reimbursements and Approvals (the Keka-owner stage via `/reimbursements/keka-all`). Both already exist in the app (section 3). Accounts' stage is the Bill Approvals tab in 1.4.

### 1.8 Adjacent, owned by the Manager/Keka-owner port: `VendorKekaApprovals` (dash.html:34626)
Keka-owner approval of vendor bills: `/vendor-bills/keka-all` and `POST /vendor-bills/keka-approve|keka-reject {billIds[]}`. It also handles extra petty cash claims. It is listed here only because it sits in the Accounts group. Port it with the Manager domain.

---

## 2. Endpoints

Every route needs the staff bearer token. The mobile client already sends it (`src/api/client.ts`), and staff sessions are `auth_sessions` rows with `subject_kind:'user'` (server.js:2343). That is what `requireAccounts` checks (vendor.js:255). Note that it checks the **session's** role from login time.

### 2.1 vendor.js (Accounts review). Gate: `requireAccounts`, ACCOUNTS_ROLES = accounts, super_admin, master_admin (vendor.js:188). Tenant check: `assertSameVendorTenant` (vendor.js:315).

| Method and path | Line | Body / query | Response the UI reads | Side effects / danger |
| --- | --- | --- | --- | --- |
| GET `/api/accounts/vendors` | 3114 | `status, q, gst(registered,not_registered), msme(yes,no), aadhaar(not_linked), from, to` | `{vendors:[{id,vendorCode,legalEntityName,tradeName,contactPerson,pocEmail,contactNumber,email,pan,gstStatus,gstin,msmeRegistered,msmeNumber,panAadhaar,submittedAt,approvedAt,status,createdAt}],count}` | None. Unpaginated; filtered in memory. |
| GET `/api/accounts/vendors/:id` | 3181 | none | `{vendor:{id,vendorCode,status,contactNumber,email,business{...},tax{pan,panHolderType,panIsIndividual,panAadhaarCheck},gst{status,gstin,gstinMatchesPan,nonGstReason,nonGstReasonText},kyc{panVerification,gstVerification,aadhaarVerification,bankVerification},declaration206ab,msme{registered,number},bank{accountName,bankName,accountNumber(UNMASKED),ifsc,branchName,branchAddress?,verified,verifiedAt,source,holderNameOnBank,nameMatchScore},documents[{id,doc_type,label,file_name,mime_type,file_size,status,version,superseded,uploaded_at,generated,signature}],verification,applicableChecks,requiredDocuments,correction,rejection{reason,by,at},approval{by,at},submittedAt,possibleDuplicates[{id,legalEntityName,contactNumber,matchedOn[],status}],history[],changeRequests[]}}` | **A GET with side effects:** the first open runs a Digio PAN–Aadhaar check (`ensurePanAadhaarChecked`, a paid API call, once per vendor), backfills Digio documents and may assign a vendor code. |
| GET `/api/accounts/vendors/:id/documents/:docId` | 3280 | none | `{docType,fileName,mimeType,fileData(base64),version}` | Audit "document_viewed". Up to 8 MB of base64. |
| POST `/api/accounts/vendors/:id/pan-aadhaar-check` | 3400 | `{force?}` | `{panAadhaarCheck,panHolderType}` or a 502 error | **Paid Digio call** (`runPanAadhaarCheck`, vendor.js:3316). |
| PUT `/api/accounts/vendors/:id/pan-aadhaar-status` | 3415 | `{linked:true/false, remarks?}` | `{panAadhaarCheck}` | Manual record plus audit. |
| PUT `/api/accounts/vendors/:id/verification` | 3436 | `{item, verified, remarks?}`; item in pan, contact_number, bank_details, bank_proof, gst, aadhaar, msme, declaration_206ab | `{verification}` | Audit. |
| PUT `/api/accounts/vendors/:id/documents/:docId/status` | 3455 | `{status: pending/verified/correction_required/not_applicable, remarks}` | `{status}` | Not used by the web UI. |
| POST `/api/accounts/vendors/:id/approve` | 3484 | `{}` | `{status:'approved'}`; 400 `{error, outstanding:[{item,label}]}` or `{fieldErrors}` | **Irreversible in effect:** the vendor can sign in, all live documents are marked verified, a vendor code is assigned, the **vendor is emailed** and the **POC is emailed** (`notifyPocOfDecision`, vendor.js:3722). |
| POST `/api/accounts/vendors/:id/reject` | 3529 | `{reason}` required | `{status:'rejected'}` | **Terminal.** The vendor and the POC are emailed the reason. Only allowed for reviewable statuses. |
| POST `/api/accounts/vendors/:id/request-correction` | 3563 | `{items[], comments}`; items in pan, gst, msme, bank_account, bank_proof, non_gst_declaration, declaration_206ab, business_information, contact_information, other | `{status:'correction_required'}` | **Vendor emailed.** The matching documents are flagged. |
| PUT `/api/accounts/vendors/:id/status` | 3607 | `{status:'inactive'/'approved', reason}` | `{status}` | Deactivate **revokes every vendor session immediately**. Reactivate works only from inactive. |
| PUT `/api/accounts/change-requests/:id` | 3625 | `{decision:'approved'/'rejected', note?}` | `{status}` | Approving **writes the vendor's bank or contact data** (`applyChangeToData`) and may retire verifications. |
| GET `/api/accounts/vendors/:id/audit` | 3656 | none | `{audit:[...]}` | Not used by the web UI. `history` on the detail route covers it. |

### 2.2 vendor_bills.js. ACCOUNTS_ROLES = accounts, super_admin, master_admin (vendor_bills.js:36). Tenant-scoped.

| Method and path | Line | Role | Body | Response | Side effects |
| --- | --- | --- | --- | --- | --- |
| GET `/api/vendor-bills/vendors` | 151 | all staff | none | `{vendors:[{id,legalEntityName,tradeName}]}` (approved, own company) | none |
| GET `/api/vendor-bills/accounts-queue` | 446 | ACCOUNTS_ROLES | none | `{bills}` pending only | none |
| GET `/api/vendor-bills/accounts-all` | 464 | ACCOUNTS_ROLES | none | `{bills:[{id,vendor_id,keka_code,project_id,keka_owner_name,submitted_by,submitted_by_name,status,is_advance,created_at,payment{paymentDate,reference,method,note,startedAt,startedByName,response{response,at,byName,note}},payment_history,version{id,amount,keka_approved_amount,description,file_name,...}}]}` | none. Unpaginated. |
| POST `/api/vendor-bills/:id/accounts-accept` | 475 | ACCOUNTS_ROLES | `{}` | `{status:'accepted'}` | **Submitter emailed** with the payment-timeline message. No self-check here (payment/start has one). |
| POST `/api/vendor-bills/:id/accounts-reject` | 515 | ACCOUNTS_ROLES | `{reason}` required | `{status:'rejected_accounts'}` | Submitter emailed. They can re-upload (`/reupload`, 551). |
| POST `/api/vendor-bills/:id/payment/start` | 710 | ACCOUNTS_ROLES | `{}` (optional paymentDate, reference ≤100, method, note) | `{status:'payment_processing',payment}` | No undo endpoint. Refused on own bill. Conditional update (returns 409 on a race). |
| POST `/api/vendor-bills/:id/payment/respond` | 754 | submitter only | `{response,note}` | `{status,payment}` | "Not received" emails Accounts. Not an Accounts action. |
| GET `/api/vendor-bills/settings` | 802 | ACCOUNTS_ROLES | none | `{settings:{payment_timeline_days,payment_message}}` | none |
| PUT `/api/vendor-bills/settings` | 811 | ACCOUNTS_ROLES | `{paymentTimelineDays>0, paymentMessage}` | `{settings}` | Changes every future authorization email for the company. |
| GET `/api/vendor-bills/by-vendor/:vendorId` | 832 | ACCOUNTS_ROLES | none | `{bills:[...+submitted_by_email]}` | none |
| GET `/api/vendor-bills/versions/:versionId/file` | 647 | submitter, keka owner or Accounts | none | `{fileName,mimeType,fileData}` | none |
| GET `/api/vendor-bills/:id` | 855 | same | none | `{bill,versions[]}` (history) | none |
| GET `/api/vendor-bills/keka-all`, POST `/keka-approve` and `/keka-reject` | 346, 383, 415 | keka owner | `{billIds[]}` (+reason) | | Manager domain (1.8). |

### 2.3 vendor_agreements.js. EMPLOYEE_ROLES = every staff role (vendor_agreements.js:56). OVERRIDE_ROLES = super_admin, master_admin, **accounts** (:61).

| Method and path | Line | Rule | Body | Response | Side effects |
| --- | --- | --- | --- | --- | --- |
| GET `/api/vendor-agreements/vendor-profile/:vendorId` | 151 | approved vendor, same company | none | `{vendor:{id,legalEntityName,tradeName,contactPerson,contactNumber,email,gstStatus}}` | none |
| GET `/api/vendor-agreements/mine` | 174 | own drafts; overseers see the company | `vendorId?, projectId?, kekaCode?` | `{agreements:[{id,vendor_id,project_id,project_name,keka_code,created_by,created_by_name,deadline_at,status(pending_signature/pending_internal_signature/signed),sign_positions,draft_file_name,signer_id,signer_name,signed_at,internal_signed_at,signature_reference,created_at}],isOverseer}` | none |
| POST `/api/vendor-agreements` | 192 | any staff | `{vendorId, projectId, projectName, deadlineAt(ISO, future), signPositions:[{page>=1,x 0..1,y 0..1,signer}], fileName, mimeType:'application/pdf', fileData(data URL ≤8 MB), signerId?}` | `{id}` | **The vendor is emailed** "New Agreement Awaiting Your Signature". No delete or withdraw endpoint exists, so **a sent agreement cannot be recalled**. |
| GET `/api/vendor-agreements/:id/draft` | 262 | drafter, signer or overseer | none | `{fileName,mimeType,fileData}` | none |
| GET `/api/vendor-agreements/:id/signature` | 272 | same | none | `{signatureType,mimeType,fileData,signedAt}` | none |
| GET `/api/vendor-agreements/pending-my-signature` | 287 | named signer | none | `{agreements}` | none |
| GET `/api/vendor-agreements/:id/internal-signature` | 297 | same | none | `{...,signerName}` | none |
| PUT `/api/vendor-agreements/:id/deadline` | 314 | drafter or overseer, while pending_signature | `{deadlineAt}` (later than current, in the future) | `{deadlineAt}` | Vendor emailed. |
| POST `/api/vendor-agreements/:id/sign` | 358 | the named signer, while pending_internal_signature | `{signatureType:'drawn'/'uploaded', signatureFileData: PNG/JPG data URL ≤2 MB}` | `{status:'signed'}` | **Final.** The drafter is emailed. No OTP is asked (unlike the vendor side). |

### 2.4 reimbursements.js. ACCOUNTS_ACT = accounts (:28). ACCOUNTS_VIEW = accounts, super_admin, master_admin (:29).

| Method and path | Line | Body | Response | Side effects |
| --- | --- | --- | --- | --- |
| GET `/api/reimbursements/accounts-all` | 204 | none | `{reimbursements:[Reimbursement]}`: Accounts-stage statuses, plus rejections made by Accounts | none |
| GET `/api/reimbursements/:id/receipt` | 216 | none | `{fileData: data URL, fileName}` | none |
| POST `/api/reimbursements/:id/accounts-authorize` | 338 | `{}` | `{status:'ready_for_payment'}` | Claimant emailed. Refused on own claim. |
| POST `/api/reimbursements/:id/accounts-reject` | 355 | `{reason}` **required** | `{status:'rejected'}` | Claimant emailed. They can re-upload. |
| POST `/api/reimbursements/:id/payment/start` | 375 | `{}` (optional details through `validatePayment`) | `{status,payment}` | No undo. Refused on own claim. |
| POST `/api/reimbursements/:id/payment/respond` | 399 | claimant only | | Already in the app. |

"Mark paid" does not exist for Accounts anywhere: reimbursements.js header lines 1-20, server.js:3820-3825, and PaymentsPanel. The request's "authorise, mark paid" maps to **Authorize, then Start Processing**. HR salary claims (`/hr/claims`, hr_payroll.js:656-665) are paid by a payroll lock, which belongs to the HR domain.

### 2.5 server.js petty cash. PETTY_CASH_ADMIN_ROLES (server.js:3246) and PETTY_CASH_APPROVER_ROLES = accounts (:3250).

| Method and path | Line | Role | Body | Response | Side effects |
| --- | --- | --- | --- | --- | --- |
| GET `/api/petty_cash_requests` | 3522 | any; admins see the company | `projectName, employeeName(admin), dateFrom, dateTo, status, pendingMyApproval` | bare array of requests (shape in `src/api/petty-cash.ts` PettyCashRequest) | none |
| POST `/api/petty_cash_requests/:id/approve` | 3741 | Keka owner or Accounts | `{}` | `{ok}` | For Accounts it goes **straight to ready_for_payment**. Otherwise Accounts is emailed (`notifyPettyCashAccounts`, :3358). Refused on own request. |
| POST `/api/petty_cash_requests/:id/reject` | 3771 | Keka owner or Accounts | `{reason?}` | `{ok}` | rejectedStage = keka |
| POST `/api/petty_cash_requests/:id/accounts-approve` | 3796 | accounts | `{}` | `{ok}` | Moves pending_accounts_approval to ready_for_payment. Refused on own request. |
| POST `/api/petty_cash_requests/:id/accounts-reject` | 3817 | accounts | `{reason?}` | `{ok}` | No self-check on reject. |
| POST `/api/petty_cash_requests/:id/payment/start` | 3884 | accounts | `{}` | `{request}` | No undo. Refused on own request. |
| GET `/api/petty_cash_bills`; POST `/:id/approve` and `/:id/reject` | 3971, 4057, 4089 | approve/reject: accounts | `{}` / `{reason?}` | `{ok}` | Approve re-checks the allocation total (409). |
| GET `/api/petty_cash_bill_submissions` | 4237 | PETTY_CASH_ADMIN_ROLES | `dateFrom, dateTo, projectName, employeeName` | array (no fileData, `hasFile`) | none |
| GET `/api/petty_cash_bill_submissions/owned` | 4286 | any | same | `{owns,codes,bills}` | none |
| POST `/api/petty_cash_bill_submissions/reconcile` | 4281 | any | `{}` | `{excess}` | **Write on read:** raises any extra claim still owed. |
| GET `/api/petty_cash_bill_submissions/statement/:batchId` | 4308 | viewer of the bills | `?request=` | `PettyCashStatement` (lines carry `canReject`) | none |
| POST `/api/petty_cash_bill_submissions/:id/reject` | 4433 | accounts | `{reason}` required | `{bill,claim:{before,after,closed}}` | **Shrinks or closes an extra claim.** Employee emailed. Not reversible. |
| GET/POST/PUT/DELETE `/api/petty_cash_departments` | 3439, 3443, 3467, 3494 | write: PETTY_CASH_ADMIN_ROLES | `{name}` / `{active}` | | **DELETE is a hard delete** (refused when the head is in use). |

**No WhatsApp messages are sent by any Accounts action.** All notifications are emails. The only WhatsApp in this area is the vendor's own signing OTP.

---

## 3. What the app already has, and the gaps

Already there:
- `src/api/petty-cash.ts`: overview (reconcile, requests, bills, `/mine` submissions), expense heads (read), projects, statement, Keka-owner approve/reject, payment respond.
- `src/api/reimbursements.ts`: mine, keka-all, submit, re-upload, respond, Keka decision, receipt.
- `src/api/inbox.ts` and `src/features/inbox/use-inbox.ts`: the Accounts persona's Inbox shows petty cash **at `pending_approval` only** (`awaitingMyApproval`, `src/features/petty-cash/logic.ts`). Approving uses `/approve`, which for Accounts jumps straight to ready_for_payment (`src/app/(app)/inbox/[kind]/[id].tsx:~397`).
- `src/api/vendor.ts` and `src/features/vendor/*`: the **vendor portal** side. It has types reusable here (`Vendor`, `VendorBill`, `BillVersion`, `VendorAgreement`, `SignPosition`, `ChangeRequest`, `FilePayload`), status labels (`features/vendor/constants.ts`), a **signature pad** (`features/vendor/signature-pad.tsx`, react-native-svg plus PanResponder, renders a PNG through `png.ts`), `SignatureCapture`, a file viewer (`features/vendor/files.tsx`: images inline, PDFs through the system viewer), and a timeline.
- `src/app/(app)/petty-cash/statement/[batchId].tsx`: statement view plus "Share report" as HTML.
- More menu (`src/features/more/menu.ts`): `accounts` gets Expense claims, Petty cash, Visitors, Help, Policies, People. There is nothing for vendors, bills or agreements.

Gaps, all website-only today:
1. **Accounts-stage petty cash is missing in the app.** Requests at `pending_accounts_approval` (already approved by a Keka owner, or self-owned) never appear for Accounts, and `accounts-approve` / `accounts-reject` are not called anywhere. This is a functional hole, not just a missing nicety.
2. Old-flow petty cash receipts approve/reject (`/petty_cash_bills/:id/approve|reject`).
3. Reimbursements: `accounts-all`, `accounts-authorize`, `accounts-reject`.
4. The Payments board: `payment/start` for all three kinds.
5. Vendor bills: `accounts-all`, accept/reject, settings, history, file.
6. Vendor registrations list, verification detail, checklist, approve/correct/reject, deactivate/reactivate, change requests, PAN–Aadhaar.
7. Vendor Master list, exports, per-vendor Bills and Agreements tabs.
8. Agreements: list, extend deadline, countersign, draft new.
9. Statement line reject (`canReject`), company-wide Tracking, Ledger, Expense Heads admin.

---

## 4. Mobile design proposal (existing `@/ui` kit)

### Entry points
- **More, new tile "Accounts desk"** (`module: 'expenses'` tone, icon `Landmark` or `BadgeIndianRupee`). Shown to role `accounts`, super_admin, ceo and coo; CEO/COO get a reduced desk (see the role matrix). The grid has 6 tiles for Accounts today, so there is room under the 9-tile cap.
- **Inbox:** add a queue chip **"With Accounts"**. It lists items at stage `awaiting` across petty cash requests (`pending_accounts_approval`), receipts, reimbursements and vendor bills, using the same 60-second poll and `['inbox', …]` keys. The approve/reject detail reuses `inbox/[kind]/[id].tsx` patterns. New kinds: `petty-acct`, `reimb-acct`, `vbill`. This fixes gap 1 where approvers already look.
- Home "Needs you": the count of the same items.

### Screens (expo-router, new folder `src/app/(app)/accounts/`)
| Route | Content | Kit pieces |
| --- | --- | --- |
| `accounts/index.tsx`, the desk | `SummaryHero` with the amount awaiting authorization. A `StatGrid` of the 6 stage counts; tapping a tile opens the queue filtered. `CategoryGrid`: Approvals, Payments, Vendors, Registrations, Agreements, Petty cash tools. | SummaryHero, StatGrid/StatTile, CategoryGrid |
| `accounts/queue.tsx?stage=&type=` | One list for petty cash, reimbursements and vendor bills. `Segmented` for type (All, Petty cash, Claims, Vendor bills). A `ChipRow` for stage. Search `PillField`. A filter `Sheet` with Keka code, project, employee and date preset. `FlashList` of `ListRow` (type badge, name, Keka code, `Amount`, `StatusPill`). | Segmented, ChipRow, PillField, Sheet, ListRow, StatusPill, SkeletonList, EmptyState, ErrorState |
| `accounts/item/[type]/[id].tsx` | `KeyValueList` (who, Keka code and owner, amounts submitted versus Keka-approved, purpose or heads, remarks). Receipt or bill viewer (reuse `features/vendor/files.tsx` FileViewer and `features/reimbursements/receipt-viewer.tsx`). `EventTimeline` built from history or paymentHistory. `ActionBar`: **Authorize** goes through `SwipeToConfirm` (sends money onward and emails the person). **Reject** opens a `ConfirmSheet` with a reason (required for vendor bills and claims, optional for petty cash). Own items show "Someone else in Accounts has to act". | KeyValueList, EventTimeline, ActionBar, SwipeToConfirm, ConfirmSheet, SuccessSheet |
| `accounts/payments.tsx` | Segmented: Ready, Processing, Not received, Received. Each row shows the requester's response. Detail action **Start processing** / **Process again** via `SwipeToConfirm`, with copy taken from `startPaymentFlow` ("…they confirm Received or Not Received — Accounts cannot mark it complete"). | same |
| `accounts/vendors/index.tsx?tab=` | `Segmented`: Pending, Corrections, Approved (= Vendor Master), Rejected, All. Search. A filter sheet with GST, MSME, Aadhaar-not-linked and date range. A header card **"Share registration link"** that uses the RN `Share` API with `${WEB_URL}/vendor` (no new dependency). | |
| `accounts/vendors/[id].tsx` | Hero: name, vendor code, status, "4 of 7 checks". Collapsible `Section`s matching the web. Bank number masked; **Show** asks for `expo-local-authentication` first (already a dependency). Documents list opens the FileViewer, and superseded versions sit behind "Older versions". The **Checklist** is a list of `ListRow`s with switches, optimistic (`PUT verification`). Sticky `ActionBar`: **Approve** (`SwipeToConfirm`, disabled until all checks are done, and the server's `outstanding` list is shown as a FieldMessage), **Ask for corrections** (a Sheet with multi-select chips of CORRECTION_LABELS and comments), **Reject** (ConfirmSheet with a required reason and the wording "the vendor is emailed this"). Approved vendors: overflow menu **Deactivate** (`SwipeToConfirm`, "signs them out immediately") and tabs Details, Bills, Agreements. Banners: possible duplicates, outstanding correction, GSTIN/PAN mismatch, 206AB warning. PAN–Aadhaar row: **Check with Digio** plus the manual record buttons on failure. Pending change requests: cards with Approve (`SwipeToConfirm`, since it rewrites bank details) and Reject. | Section, KeyValueRow, Banner, Chip, Sheet, SwipeToConfirm |
| `accounts/vendors/[id]/bills.tsx` | KPI `StatGrid` (4 cards that filter), a `PillBarChart` for 6 months, `SplitBar` by Keka code (top 6), a POC chip, a list, and bill detail with the history timeline. | PillBarChart, SplitBar |
| `accounts/agreements/index.tsx` | "Pending your signature" cards first. Then the company list with a status chip, an EXPIRED pill, and a Keka/project filter sheet. | |
| `accounts/agreements/[id].tsx` | Facts, draft (FileViewer, which hands PDFs to the system viewer), the signed view (signature images plus reference), **Extend deadline** (DateField and TimeField, default now + 7 days, validated later than both current and now), and **Countersign**: `SignaturePadSheet` or upload, then `SwipeToConfirm`, then `POST sign`. | DateField, TimeField |
| `accounts/agreements/new.tsx` (phase 2) | Steps: vendor picker, Keka code (reuse `features/reimbursements/project-picker.tsx`), project name, deadline, PDF (`pickDocument(['application/pdf'])`, 8 MB), optional internal signer, **place the spots** (a WebView page, section 5), review, then **Send** (`SwipeToConfirm`: "The vendor is emailed. A sent agreement can't be withdrawn."). | |
| `accounts/petty/statement` | Extend the existing `petty-cash/statement/[batchId].tsx`: when `line.canReject`, show a **Reject bill** row action (a ConfirmSheet with a required reason). The success toast shows the server's `claim.before → after`. | |
| `accounts/petty/tracking.tsx` | Company-wide submissions plus an employee filter (admins) and links to statements. | |
| `accounts/petty/heads.tsx` | List with an active switch, an add row, and Delete through `ConfirmSheet` (a hard delete). | |
| `accounts/settings/payment-timeline.tsx` | Days `NumericKeypad` or TextField, the message, and a live preview ("What a submitter will read"). | |

States for every list: `SkeletonList` while loading, `EmptyState` with the web's own empty copy (for example "Nothing waiting on Accounts right now."), `ErrorState` with retry, and a 409 conflict shown as a toast "Someone else just updated this — refreshed" followed by an invalidate.

### Stays web-only, and why
- **Vendor summary print with the full documents** (pdf.js rasterises every document into a print iframe). On a phone, offer **Share summary as PDF** (`expo-print` `printToFileAsync` from an HTML summary, without document images) and open each document on its own.
- **Excel export of Vendor Master** (needs SheetJS, a big file, and is a desktop task). Phone alternative: PDF via expo-print, or CSV through expo-file-system plus expo-sharing (both present).
- **Petty Cash Ledger** (a wide reconciliation table over date ranges). Keep it on the web in phase 1. A phone version would be per-request cards, which is low value.
- **Drafting a new agreement** in phase 1. Pin placement needs a rendered PDF and precise taps. Phase 2 can do it through a WebView with pdf.js (section 5).
- Vendor Master Bills analytics beyond the KPIs and one chart.

---

## 5. Expo Go (SDK 57) feasibility

From `mobile/package.json` and `node_modules/expo/bundledNativeModules.json`:

| Need | Module | In Expo Go 57? | Already a dependency? |
| --- | --- | --- | --- |
| Pick a draft PDF or signature photo | expo-document-picker, expo-image-picker | yes | yes |
| Show images, base64 data URLs | expo-image | yes | yes |
| Open a PDF (draft, KYC doc, bill) | expo-file-system plus expo-sharing (system viewer), as `features/vendor/files.tsx` already does | yes | yes |
| Draw a signature | react-native-svg plus PanResponder (`features/vendor/signature-pad.tsx`) | yes | yes |
| Biometric before revealing a bank account | expo-local-authentication | yes | yes |
| Share the registration link | RN `Share` (core) | yes | n/a |
| **Render PDF pages in the app and tap sign spots** (agreement drafting, phase 2), and show the vendor signature overlay when countersigning | **react-native-webview 13.16.1**, listed as "Included in Expo Go" (docs.expo.dev/versions/v57.0.0/sdk/webview); pdf.js loaded inside the WebView from cdnjs 3.11.174 (same as the web, dash.html:25125) | yes | **no. New: `npx expo install react-native-webview`** |
| Vendor summary or statement as a real PDF | **expo-print ~57.0.2** (`printToFileAsync`, HTML to PDF; "Included in Expo Go", docs.expo.dev/versions/v57.0.0/sdk/print) | yes | **no. New, optional** |
| Copy the link to the clipboard (instead of Share) | expo-clipboard ~57.0.2 | yes | no (optional; RN Share is enough) |
| Camera or QR | not needed | | |

No module outside Expo Go is needed. The only new JS dependencies are react-native-webview (phase 2 drafting and an optional in-app PDF preview) and, optionally, expo-print. SheetJS is not recommended. Notes on the WebView: pdf.js needs network access to the CDN. Pass the PDF in as base64 through `injectJavaScript` or `postMessage`, not by URL, because the draft is never at a public URL. Return taps as `{page,x,y}` fractions, which is exactly what the server stores.

---

## 6. Demo fixtures (persona **Afzal Accounts**, `src/demo/personas.ts` id `accounts`)

Add `src/demo/fixtures/accounts.ts` (plus `vendor-bills.ts` and `agreements.ts`, or a single file) and register it in `src/demo/server.ts` (`routes`). Add bare-array routes to `LIST_ROUTE` where the real route returns an array (`petty_cash_bill_submissions` admin list).

- **Registrations and Vendor Master** (`/accounts/vendors`, `/accounts/vendors/:id`, documents, verification, approve, reject, request-correction, status, change-requests, pan-aadhaar-check/status): reuse **`src/demo/vendor/data.ts`** (Afzal Studios & Co. at five life stages). Expose them as five rows: registering = `mobile_verified` (hidden from the Pending tab), kyc_pending = `draft`, under_review = **`pending_verification`**, changes = **`correction_required`**, approved = **`approved`**. Add 3 or 4 made-up approved vendors for the Master list:
  - one non-GST with `panAadhaar:'not_linked'`,
  - one MSME,
  - one `inactive`,
  - one **possible duplicate** of Afzal Studios (same PAN, different phone).
  
  Make the under-review record 5 of 7 checks done so that approving needs two taps. Documents reuse `DOCUMENT_PDF` and `RECEIPT_PNG`. The PAN–Aadhaar check answers `linked` instantly. Optionally share the store with the vendor portal, so that approving as Accounts flips the vendor persona's status until the next pick.
- **Vendor bills** (`/vendor-bills/accounts-all`, `/vendors`, `/settings` GET/PUT, `/:id/accounts-accept|reject`, `/:id/payment/start`, `/by-vendor/:id`, `/:id`, `/versions/:id/file`): reuse the 10 bills in `demo/vendor/data.ts` (one per status, `INVOICE_PDF`). Add 2 bills from other vendors at `pending_accounts_approval`, one of them an advance, so the awaiting count is 3. The submitters are colleagues (Priya, Deepa), never the persona, so actions are allowed.
- **Reimbursements** (`/reimbursements/accounts-all`, `/:id/accounts-authorize|reject`, `/:id/payment/start`): extend `fixtures/reimbursements.ts`.
  - `accounts-all` returns the Accounts-stage rows.
  - Seed at least 3 colleague claims at `pending_accounts_approval` (u-anita already exists at line 156), 1 at `ready_for_payment`, 1 at `payment_processing`, 1 at `not_received` (with a response note), and 1 at `received`.
  - The persona's own `pending_accounts_approval` claims must answer 403 "You can't authorize your own reimbursement", as the server does.
- **Petty cash** (`/petty_cash_requests/:id/accounts-approve|reject`, `/payment/start`, `/petty_cash_bills/:id/approve|reject`, `/petty_cash_bill_submissions` admin list, `/statement` with `canReject:true` for Accounts, `/petty_cash_bill_submissions/:id/reject`, `/petty_cash_departments` POST/PUT/DELETE): extend `fixtures/petty-cash.ts`.
  - It already has one `pending_accounts_approval` (line 210). Add 2 more, plus one **extra claim** (`kind:'excess'`) at `pending_accounts_approval` whose statement bills can be rejected (with the claim shrinking).
  - Add one `ready_for_payment` and one `not_received`.
  - Add one pending old-flow receipt.
- **Agreements** (`/vendor-agreements/mine` with `isOverseer:true`, `/pending-my-signature`, `/:id/draft|signature|internal-signature`, `/:id/deadline`, `/:id/sign`, `/vendor-profile/:id`, POST `/vendor-agreements`): reuse the vendor demo's 6 agreements (`AGREEMENT_PDF`, `SIGNATURE_PNG`).
  - Make one `pending_internal_signature` with `signer_id` = the persona, so "Pending your signature" shows.
  - Make one expired `pending_signature` so Extend can be tried.
  - Accept POST with any PDF.
- **Super Admin persona:** same data. Vendor bills can be acted on. Petty cash and reimbursements show "View only — Accounts acts on this". Registrations are hidden, matching the web nav.
- **Downloads:** follow the existing "Downloads are not available in the demo account." where the real flow would save a file.
- Update `docs/DEMO-ACCOUNTS.md`, the Afzal Accounts row: "Accounts desk: 3 vendor bills, 3 claims and 3 petty cash to authorize, payments to start, 1 registration to review, 1 agreement to countersign".

---

## 7. Effort and risks

| Screen / piece | Effort |
| --- | --- |
| API client `src/api/accounts.ts` (vendors, bills, agreements, accounts-stage reimbursements and petty cash, payments, settings, heads) plus types | M |
| Inbox "With Accounts" queue plus detail kinds (fixes gap 1) | M |
| Accounts desk hub plus the unified queue list and filters | M |
| Item detail (3 types) with authorize/reject | M |
| Payments board plus start or process again | S |
| Registrations list | S |
| Vendor verification detail (sections, docs, checklist, approve/correct/reject, change requests, PAN–Aadhaar, deactivate) | L |
| Vendor Master (list plus filters) | S |
| Vendor > Bills tab (KPIs, chart, list, history) | M |
| Vendor > Agreements tab | S |
| Agreements list, extend deadline, countersign | M |
| New agreement with WebView pdf.js spot placement (phase 2) | L |
| Statement line reject plus company tracking | S |
| Expense heads admin | S |
| Payment timeline settings | S |
| Summary PDF via expo-print (optional) | S |
| Demo fixtures (vendors, bills, agreements, accounts-stage petty cash and claims) | M-L |

Risks:
- **Heavy payloads.** `accounts-all` (bills and claims) and `/accounts/vendors` are unpaginated. `/petty_cash_requests` returns the whole company for admins. Documents are base64 up to 8 MB per GET. Mitigations: TanStack cache, fetching files only on tap with a 60-120 s timeout (as `fetchReceipt` does), and never persisting document or file queries to AsyncStorage.
- **Sensitive data on a phone.** The unmasked account number, PAN, Aadhaar last 4 and KYC documents. Mask by default, require biometric to reveal, and exclude these queries from the persisted cache (`src/api/query.tsx`).
- **The detail GET has side effects** (a Digio check and a document backfill on first open). This is the same as the web. Do not prefetch vendor detail from the list.
- **Irreversible or outward-facing actions:** vendor approve, reject, correction, deactivate, change-request approve, bill accept/reject, payment start (no undo endpoint), agreement send (no withdraw) and countersign, statement-line reject (shrinks a claim), expense head delete (hard delete), settings PUT (changes every future email). All of them must go through `SwipeToConfirm` or `ConfirmSheet` and state who gets emailed.
- **Races.** The server uses conditional updates and returns 409. Handle that with a refetch.
- **Session-role snapshot.** `requireAccounts` reads the session's role from login time. A role change needs a fresh sign-in, so show the server's "Sign out and back in" hint as the web does.
- **CEO/COO.** The web shows them Bill Approvals, but the server returns 403. In the app, gate the desk with `ACCOUNTS_ROLES` for vendor bills and `ACCOUNTS_VIEW` for claims.
- The **Keka-owner vendor bill approvals** (1.8) are not in this doc's scope. Coordinate with the Manager port so the Inbox does not grow two separate "bills" queues.

## 8. Server changes (none required)
Everything above works on existing endpoints. Optional later improvements, **not needed** for the port:
- (a) Pagination or a `?status=` filter on `/vendor-bills/accounts-all` and `/reimbursements/accounts-all`, for phone data use.
- (b) A light `GET /api/accounts/summary` with stage counts, for the badge.
- (c) Push notifications for "new item awaiting Accounts", which is part of the already-deferred push work.
