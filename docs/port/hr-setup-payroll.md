# Porting HR setup and payroll to the app

**Domain:** attendance setup (offices and geofence, company policy, per-person clock-in rules), shifts, holidays, leave setup (types, settings, company balances, adjustments, carry forward), writing and editing policies, and payroll (salary structures, salary assignments, tax profiles, statutory and TDS settings, payroll runs, locking, the register and payslips).

**Result in short:** every screen here can be built on the server as it is today. **No server or database change is needed.** Most of it fits a phone well. Three areas should stay on the website, or be read-only in the app: **Statutory and TDS settings**, the **salary-structure component editor**, and **reading the full salary register**. The only new dependency to consider is `react-native-maps`, for the office map. It is optional and is included in Expo Go for SDK 57.

Line numbers were checked against the repo at the time of writing. `dash.html` means `dash-tamada-latest/dash.html`.

---

## 0. Who can see any of this

### Server

Every route in this domain is registered by `hr.js` (`server.js:1580`, `require('./hr.js')(app, …)`) after the global auth gate. The sub-modules are loaded at `hr.js:995-1010`: `hr_time.js`, `hr_leave.js`, `hr_policies.js`, `hr_payroll.js` and `hr_timesheet.js`.

- **The two-layer switch** (`hr.js:327 checkAccess`):
  - The company must have HR turned on, with the module listed, in `hr_tenant_access`. The Master Admin sets this.
  - The user's department must have the module turned on in `hr_department_access`. The Super Admin sets this.
  - `super_admin` and `hr` skip the department check (`DEPT_GATE_BYPASS`, `hr.js:51`).
- **`hrAdminGate(what, module)`** (`hr.js:599`):
  - The role must be in `HR_ADMIN_ROLES` (`master_admin`, `super_admin`, `hr`), but **`master_admin` is refused outright**.
  - `checkAccess(module)` must also pass.
  - In practice, **every write in this domain is open to Super Admin and HR only.** CEO, COO, Admin and Manager are refused, and so are department admins.
- **Payroll helpers:**
  - `salaryAdmin` = `hrAdminGate(…, 'salary')` (`hr_payroll.js:90`).
  - `payrollAdmin` = `hrAdminGate(…, 'payroll')` (`hr_payroll.js:266`).
  - Statutory routes use the `'tax'` module (`hr_payroll.js:62`).
  - `notSelf()` (`hr_payroll.js:37`) stops anyone from setting their own salary, tax profile or payroll line.
- **Module ids** (`hr.js:53-67`) for this domain: `attendance`, `shifts`, `holidays`, `leave`, `comp_off`, `policies`, `salary`, `payroll`, `tax` and `payslips`.
- **Errors:**
  - A missing HR table returns a 503 that names the SQL file to run (`hr.js:271 fail`).
  - `GET /api/hr/admin/db-check` (`hr.js:437`, HR admins only) lists the missing tables and files.
- **Audit log:** every write calls `audit()`, which writes the audit log with module `HR` (`hr.js:281`).
- **No WhatsApp, email or push messages are sent anywhere in this domain.** I grepped `hr*.js` and found no send. The module description says payslips are "emailed", but nothing emails them. Payroll lock does not notify employees.

### Website

- `MY_HR` is loaded from `GET /api/hr/me` (`dash.html:807`, loaded at `dash.html:30303`; server at `hr.js:451`). It returns `{enabled, modules, canConfigure, isHrAdmin, adminsDepts, approverModules}`.
- `canSeeHrNav` (`dash.html:4641`) adds one sidebar item, `{id:'attendance', label:'HR'}`, inside `navFor` (`dash.html:1472`).
- The route `attendance: u => <HrHub/>` is at `dash.html:30481`.
- HR is **not** in `FEATURE_REGISTRY` (`dash.html:1373`), so `tenantFeatureOn` plays no part. Only the two-layer switch above does.
- `HrHub` (`dash.html:5329`) shows the `HR_SECTIONS` (`dash.html:5299`) entries whose `show(user)` passes. Helpers at `dash.html:4627-4640`:
  - `hrHas(m)`: the module is in `MY_HR.modules`.
  - `hrIsAdmin(u)`: `MY_HR.isHrAdmin` and the role is not `master_admin`.
  - `HR_SYSTEM_ROLES`: `super_admin`, `ceo`, `coo`, `hr`, `it_admin`.
- `HrDbCheckBanner` (`dash.html:5315`) shows HR admins which SQL files are still missing.

Admin parts of each HR section:

| HR section | Admin part shown when |
|---|---|
| Attendance → **Setup** tab (`AttendanceHub` `dash.html:4599`) | `MY_HR.isHrAdmin && role !== 'master_admin'` |
| Shifts (`ShiftsPanel` `dash.html:4686`) | `hrHas('shifts')`; the editing cards only when `hrIsAdmin` |
| Holidays (`HolidaysPanel` `dash.html:4651`) | `hrHas('holidays')`; add, edit and remove only when `hrIsAdmin` |
| Leave & WFH → **Leave setup** (`LeavePanel` `dash.html:4951`) | `hrIsAdmin && hrHas('leave')` |
| Policies → **Manage** (`PoliciesPanel` `dash.html:5023`) | `hrIsAdmin` |
| **Payroll** (`PayrollAdminPanel` `dash.html:5289`) | `hrIsAdmin && (hrHas('payroll') or 'salary' or 'tax')`. Tabs: Payroll runs (`payroll`), Salaries and Structures (`salary`), Statutory & TDS (`tax`) |

**In the app this means:** Afzal HR and Afzal Super Admin are the only personas that get any of this. CEO and COO do not, because they are not in `HR_ADMIN_ROLES`.

**Out of scope here, but a prerequisite:**
- Config → **HR Access** (`HrAccessCard` `dash.html:5377`): the Super Admin turns modules on per department. Routes: `GET /api/hr/config/overview` (`hr.js:524`) and `PUT /api/hr/config/departments[/:id]` (`hr.js:583`, `hr.js:589`).
- Master Admin **HR for a company** (`HrCompanyCard` `dash.html:5343`). Routes: `GET`/`PUT /api/hr/admin/tenants/:tenantId/access` (`hr.js:486`, `hr.js:495`).

These belong to the Config/Super Admin and Master Admin port docs.

---

## 1. Website features, step by step

### 1.1 Attendance → Setup (`AttendanceSetup`, `dash.html:4522-4597`)

The tab has three cards.

**a) Office locations (geofence).**
1. The card loads `GET /hr/locations`.
2. Each row shows the name, "N m radius" and the address, with **Edit** and **Remove** buttons. With no locations it warns: "No location yet. Nobody can clock in until you add one."
3. **+ Add location** opens an inline form:
   - Name (up to 80 characters).
   - Radius in metres (25–5000, default 150).
   - Address (optional, up to 200 characters).
   - An **OpenStreetMap/Leaflet map** (`OsmMap`, `dash.html:3634`). Clicking the map sets the centre. The other offices' circles are drawn on it.
   - **"Use my current location"** (`hrGetFix`, `dash.html:3623`, uses the browser's GPS).
4. **Save** sends `POST /hr/locations`, or `PUT /hr/locations/:id` when editing.
5. **Remove** asks "Past punches keep their record", then sends `DELETE` (a soft delete).

**b) Clock-in rules by employee** (`AttendancePeople`, `dash.html:4466`).
1. The card loads `GET /hr/attendance/people`: a searchable table of name, department, rule and locations.
2. Selection works by checkbox, a select-all for the visible rows, or each row's **Edit** button.
3. Choosing people opens an action panel:
   - Mode (labels from `HR_RULE_LABEL`, `dash.html:4463`):
     - `default` = "Company default"
     - `geofence` = "General capture scheme"
     - `flexible` = "Field capture scheme"
     - `remote` = "Permanent WFH capture scheme"
   - For geofence and flexible, the allowed offices as checkboxes. None ticked means all offices.
4. **Apply** sends `PUT /hr/attendance/people`. This is a bulk change of up to 500 people.

**c) Attendance policy.**
1. The card loads `GET /hr/attendance/settings`.
2. Fields: shift start and end (time), grace minutes, half-day minutes, full-day minutes, maximum GPS error in metres, and toggles for **Require clock-in inside an office location** and **Let people clock in remotely**.
3. **Save policy** sends a `PUT`.
4. The website does **not** show `weeklyOff` or `regularizationWindowDays`, although the server accepts both (`hr.js:120-121`, `hr.js:137-142`).

### 1.2 Shifts (`ShiftsPanel`, `dash.html:4686-4743`)

1. **My shift** card: shown to people who are not system roles.
2. **Shifts** card (admins only):
   - A table of name, hours, grace, half and full day, and weekly off.
   - **New shift** and **Edit** open an inline form: name, start, end, grace (0–240), half day (30–1440), full day (60–1440), and a weekly-off day picker (`WeekdayPicker`, `dash.html:4685`).
   - **Remove** asks to confirm. People on that shift fall back to the company default.
3. **Who works which shift** card (admins only):
   - Loads `GET /hr/shifts/assignments`.
   - A searchable list of people with checkboxes. Choosing people shows "N selected →", a shift dropdown (or "No shift") and **Apply**, which sends `PUT /hr/shifts/assignments`.

### 1.3 Holidays (`HolidaysPanel`, `dash.html:4651-4682`)

1. A year picker (last, this and next year) loads `GET /hr/holidays?year=`.
2. The table shows date, weekday, name and type (Optional or Company holiday).
3. Admins see **Add holiday** (date, name, Optional tickbox) and, on each row, **Edit** and **Remove**.
4. **Remove** asks to confirm, then hard-deletes the holiday.
5. A footnote says company holidays are not counted as leave days.

### 1.4 Leave setup (`LeaveSetup`, `dash.html:4886-4950`)

There are three cards.

**a) Leave types.**
1. A table of code, name, days per year, accrual, carry-forward limit and paid.
2. **New type** and **Edit** open a form:
   - Code (2–12 characters, upper case).
   - Name.
   - Days per year (steps of 0.5).
   - Accrual: "All at year start" or "Monthly (1/12 each month)".
   - Carry-forward maximum.
   - Paid and Half days allowed.
   - Comp-off type: only when creating. It forces the quota and carry-forward to 0, and only one comp-off type can be active.
3. **Retire** asks to confirm, then soft-deletes the type. The type's history is kept, and the app has no way to bring it back.

**b) Leave settings.**
- The leave-year start month (a dropdown that saves at once).
- Four numbers that each **save when the field loses focus**: comp-off expiry days, comp-off claim window, how many days back a request may be dated, and the longest single request.

**c) Company balances.**
1. A year field loads `GET /hr/leave/balances?year=`: a people × leave-types table of available days, with used and pending in a tooltip.
2. **Adjust a balance** opens an inline form: employee (yourself excluded), type (not comp-off), year, ± days and a reason. It sends `POST /hr/leave/adjustments`.
3. **Carry forward from previous year** asks to confirm, then sends `POST /hr/leave/carry-forward {from_year}` and reports "N carry-forward credit(s) added".

### 1.5 Policies → Manage (`PolicyManage`, `dash.html:4994-5022`; reading in `PolicyView` `dash.html:4966`)

1. The list loads `GET /hr/policies?all=1` (drafts, published and archived) and `GET /hr/policies-meta/departments` for the audience picker.
2. The table shows title and category, version, status chip, audience ("Everyone" or department names) and the actions.
3. **New policy** and **Edit** open a form:
   - Title (3–120 characters).
   - Category (up to 40 characters).
   - Body: plain text, 10 to 60,000 characters.
   - Optional link (https only).
   - "Employees must acknowledge".
   - Audience: department checkboxes. None ticked means everyone.
4. On a published policy the form warns: "Changing the title, text or link creates a new version and everyone is asked to acknowledge again".
5. Actions:
   - **Publish** (drafts only).
   - **Archive** (drafts and published), which asks to confirm first.
   - **Acknowledgements** (published policies that need acknowledgement) expands `PolicyAcks` (`dash.html:4983`): "X of Y acknowledged version N", a "Show pending only" filter and a people table.
   - Archived policies cannot be edited.

### 1.6 Payroll (`PayrollAdminPanel`, `dash.html:5289`)

**Payroll runs** (`PayrollRuns`, `dash.html:5145`).
1. A month picker (no future months) and **Run payroll** send `POST /hr/payroll/runs`. The new run opens straight away.
2. The **Loss of pay from** dropdown (`GET`/`PUT /hr/payroll/settings`) offers "Approved unpaid leave only" or "Unpaid leave + days with no attendance".
3. The table lists month, status (Draft or Locked), employees, net pay, who locked it and when, and **Open**.

**Run detail** (`PayrollRunView`, `dash.html:5104`).
1. Header: totals (employees, gross, reimbursements, deductions, net) and the number of lines with warnings.
2. **Export CSV** downloads `GET …/register.csv`.
3. On a draft only:
   - **Recompute**.
   - **Discard draft** (asks to confirm).
   - **Lock payroll**: `window.prompt` makes you type `LOCK YYYY-MM`.
4. The item table shows employee and department (with a ⚠ count), paid days out of days in the month (LOP and before-joining days in red), gross, reimbursements, deductions and net (red when negative).
5. Each row has:
   - **Details**: earnings, reimbursements, deductions, employer contributions and warnings.
   - **Edit** (drafts only): a loss-of-pay override (blank means calculated) and adjustments. Each adjustment has a label, earning or deduction, an amount in ₹ and, for earnings, a taxable flag. There can be up to 20.
   - **PDF**: the employee's payslip, marked DRAFT when the run is not locked.

**Salaries** (`SalaryPeople`, `dash.html:5205`).
1. The list loads `GET /hr/salary/people` plus the structures. A searchable table shows structure, annual CTC, monthly gross, since (and the number of revisions) and the tax summary.
2. **Set salary** or **Revise**: structure, annual CTC and effective date. It shows the warning when that month's payroll is already locked.
3. **Tax**: regime (company default, new or old), old-regime deductions per year, PT state, manual TDS per month, and "PF applies".
4. Both buttons are hidden on your own row.
5. The website never uses `DELETE /hr/salary/assign/:id`.

**Structures** (`SalaryStructures`, `dash.html:5167`).
1. A list of name, description and a one-line summary of the components.
2. **New structure** starts with BASIC (40% of CTC), HRA (50% of basic) and SPECIAL (the balance).
3. The component grid has, per row: code, name, earning or employer, calculation (fixed ₹ per month, % of CTC, % of BASIC, balance), value, taxable and PF wage. Rows can be added and removed.
4. **Preview** sends `POST /hr/salary/structures/preview` with a sample CTC and shows monthly CTC, gross and the line breakdown.
5. **Save**, and **Retire** (asks to confirm).

**Statutory & TDS** (`StatutorySettings`, `dash.html:5239`).
- A yellow warning: "No rates or slabs are built in… confirm with your CA".
- **PF:** on or off, employee %, employer %, cap at a wage ceiling of ₹ (the ceiling amount), rounding.
- **ESI:** on or off, employee %, employer %, gross limit, rounding.
- **PT:** on or off and a list of slabs (state, gross from, gross to, amount).
- **TDS:** mode (off, manual or slab). In slab mode: a default regime, and for each of the new and old regimes the standard deduction, rebate limit, rebate maximum, cess % and a list of slabs.
- **Save** reports anything still missing.

---

## 2. Endpoints

All paths are prefixed with `/api`. Every response is `{ok:true, …}` (`server.js:1153`); errors are `{error}` with a 4xx or 5xx status. "Admin" below means `hrAdminGate`, that is Super Admin or HR with the module on. Sub-module context: `hr.js:987`.

### 2.1 Attendance setup (`hr.js`)

| Method and path | Line | Gate | Request | Response | Side effects and risks |
|---|---|---|---|---|---|
| GET `/hr/attendance/settings` | 608 | `gate('attendance')` | — | `{settings:{requireGeofence, allowRemote, maxAccuracyM, shiftStart, shiftEnd, graceMinutes, halfDayMinutes, fullDayMinutes, weeklyOff[], regularizationWindowDays}}` | — |
| PUT `/hr/attendance/settings` | 611 | admin (attendance) | Any subset of the fields above. Validated by `normaliseAttendanceSettings` (`hr.js:125`): accuracy 10–1000, grace 0–240, half < full, end after start, weeklyOff at most 6 days | `{settings}` | Upsert into `hr_settings.attendance`. **Changes every punch from then on** (late, half day, fence) |
| GET `/hr/locations` | 624 | `gate('attendance')` | — | `{locations:[{id, name, lat, lng, radius_m, address}]}` (active only) | — |
| POST `/hr/locations` | 635 | admin | `{name ≤ 80, lat, lng, radius_m (integer 25–5000), address ≤ 200}` | `{location}` | Insert |
| PUT `/hr/locations/:id` | 652 | admin | Partial, merged with the current row | `{location}` | — |
| DELETE `/hr/locations/:id` | 663 | admin | — | `{}` | **Soft delete** (`active=false`). There is **no restore endpoint**. If it was the last office, nobody can clock in under the geofence rule |
| GET `/hr/attendance/people` | 674 | admin | — | `{people:[{id, name, role, department, mode:'default' or 'geofence' or 'flexible' or 'remote', location_ids[]}]}` | Reads up to 5000 users |
| PUT `/hr/attendance/people` | 693 | admin | `{employee_ids[1..500], mode, location_ids[]}` (locations only for geofence and flexible; at most 50) | `{updated}` | Bulk upsert, or bulk delete for `default`. Every id must belong to this company, otherwise 404 |

### 2.2 Shifts and holidays (`hr_time.js`)

| Method and path | Line | Gate | Request | Response | Side effects and risks |
|---|---|---|---|---|---|
| GET `/hr/holidays?year=YYYY` | 38 | `gate('holidays')` | — | `{year, holidays:[{id, date, name, optional}]}` | — |
| POST `/hr/holidays` | 47 | admin (holidays) | `{date, name 2–80, optional?}` | `{holiday}` | 409 if the date already has a holiday (`hr_holidays_tenant_date_uq`). Changes leave-day counts and payroll absence |
| PUT `/hr/holidays/:id` | 64 | admin | Partial | `{holiday}` | 409 on a duplicate date |
| DELETE `/hr/holidays/:id` | 75 | admin | — | `{}` | **Hard delete.** It can be added again |
| GET `/hr/shifts` | 105 | `gate('shifts')` | — | `{shifts:[{id, name, start_time, end_time, grace_minutes, half_day_minutes, full_day_minutes, weekly_off[]}]}` | — |
| GET `/hr/shifts/mine` | 108 | `gate('shifts')` | — | `{shift}` or `{shift:null}` | — |
| POST `/hr/shifts` | 121 | admin (shifts) | `{name 2–60, start_time, end_time (HH:MM, end after start, no overnight), grace_minutes 0–240, half_day_minutes 30–1440, full_day_minutes 60–1440 (half < full), weekly_off[]}` | `{shift}` | — |
| GET `/hr/shifts/assignments` | 133 | admin | — | `{people:[{id, name, role, departmentId, department, shift_id or null}]}` | — |
| PUT `/hr/shifts/assignments` | 143 | admin | `{employee_ids[1..500], shift_id or null}` (null means company default) | `{updated}` | Bulk |
| PUT `/hr/shifts/:id` | 173 | admin | Partial | `{shift}` | Changes late and half-day maths for everyone on the shift |
| DELETE `/hr/shifts/:id` | 185 | admin | — | `{}` | Soft-deletes the shift **and hard-deletes every assignment to it**. Re-creating the shift does not restore who was on it |

### 2.3 Leave setup (`hr_leave.js`)

| Method and path | Line | Gate | Request | Response | Side effects and risks |
|---|---|---|---|---|---|
| GET `/hr/leave/settings` | 99 | `gate('leave')` | — | `{settings:{leaveYearStartMonth, compOffExpiryDays, compOffClaimWindowDays, backdateDays, maxSpanDays}}` | — |
| PUT `/hr/leave/settings` | 102 | admin (leave) | Any subset. Ranges at `hr_leave.js:74`: month 1–12, expiry 1–730, claim window 1–365, backdate 0–365, longest request 1–366 | `{settings}` | Moving the leave-year start month changes every balance, because balances are calculated and not stored (`hr_leave.js:11`) |
| GET `/hr/leave/types` | 137 | `gate('leave')` | — | `{types:[{id, code, name, paid, annual_quota, accrual, carry_forward_max, allow_half_day, is_comp_off}]}` | — |
| POST `/hr/leave/types` | 140 | admin | `{code (2–12 characters, upper case), name, paid, annual_quota (0–365, steps of 0.5), accrual: annual or monthly, carry_forward_max, allow_half_day, is_comp_off}` | `{type}` | 409 on a duplicate active code, or a second comp-off type |
| PUT `/hr/leave/types/:id` | 159 | admin | Partial (the comp-off flag cannot be changed) | `{type}` | Changing the quota or accrual **changes everyone's balance at once** |
| DELETE `/hr/leave/types/:id` | 170 | admin | — | `{}` | Soft "retire". **There is no un-retire endpoint**; a new type can reuse the code |
| GET `/hr/leave/balances?year=` | 230 | admin | — | `{year, types[], people:[{id, name, role, departmentId, department, balances:[{leave_type_id, available, used, pending, entitlement, adjusted}]}]}` | Reads up to 50k request and adjustment rows. Heavy for big companies |
| POST `/hr/leave/adjustments` | 246 | admin | `{employee_id, leave_type_id (not comp-off), year (integer), days (±, steps of 0.5, ≤ 365), reason ≥ 3}` | `{adjustment:{id, days, year}}` | Insert. Not on yourself (403). **There is no delete or undo: you correct it with an opposite adjustment** |
| POST `/hr/leave/carry-forward` | 267 | admin | `{from_year}` (that leave year must have ended) | `{credits}` | Bulk insert of `carry_forward` credits for every person and type with `carry_forward_max > 0`. Running it twice is harmless (`hr_leave_adj_cf_uq`). **It cannot be undone through the API** |

### 2.4 Policies (`hr_policies.js`)

`admin` here = `hrAdminGate('manage HR policies','policies')` (`hr_policies.js:39`).

| Method and path | Line | Gate | Request | Response | Side effects and risks |
|---|---|---|---|---|---|
| GET `/hr/policies?all=1` | 80 | `gate('policies')`; `all=1` is honoured only for HR admins | — | `{policies:[{id, title, category, version, requires_ack, status, audience[], published_at, updated_at, link_url, acked_at}]}` | — |
| GET `/hr/policies/:id` | 96 | `gate('policies')` | — | `{policy:{…summary, body, acked_at}}` | — |
| POST `/hr/policies` | 105 | admin | `{title 3–120, category ≤ 40, body 10–60000 (plain text), link_url (https or ''), requires_ack, audience[] (department ids)}` | `{policy}` (status `draft`, v1) | — |
| PUT `/hr/policies/:id` | 119 | admin | Partial | `{policy, newVersion}` | Changing the title, body or link of a **published** policy bumps the version, so **everyone must acknowledge again**. Optimistic lock: if someone else edited first you get 409. Archived policies give 409 |
| POST `/hr/policies/:id/publish` | 139 (loop) | admin | `{}` | `{policy}` | draft → published. Employees see it at once. **There is no unpublish** (only archive) |
| POST `/hr/policies/:id/archive` | 139 (loop) | admin | `{}` | `{policy}` | draft or published → archived. **Final: it cannot be edited or restored** |
| GET `/hr/policies-meta/departments` | 174 | admin | — | `{departments:[{id, name}]}` | — |
| GET `/hr/policies/:id/acks` | 183 | admin | — | `{version, total, acknowledged, people:[{id, name, department, acked_at}]}` | — |

### 2.5 Payroll (`hr_payroll.js`, calculations in `hr_payroll_calc.js`)

Money is sent and received **in rupees** with at most 2 decimals. It is stored as integer paise.

| Method and path | Line | Gate | Request | Response | Side effects and risks |
|---|---|---|---|---|---|
| GET `/hr/statutory` | 62 | admin (`tax`) | — | `{statutory:{pf, esi, pt:{enabled, slabs[]}, tds:{mode, defaultRegime, regimes:{new, old}}}, missing[]}` (shape: `hr_payroll_calc.js:83`) | — |
| PUT `/hr/statutory` | 65 | admin (`tax`) | Partial sections (`normaliseStatutory`, `hr_payroll_calc.js:108`) | `{statutory, missing[]}` | If an enabled section is incomplete, **every payroll run is refused** until it is fixed (`hr_payroll.js:290`) |
| GET `/hr/payroll/settings` | 75 | admin (`payroll`) | — | `{settings:{lopSource}}` | — |
| PUT `/hr/payroll/settings` | 78 | admin | `{lopSource:'unpaid_leave' or 'unpaid_leave_and_absence'}` | `{settings}` | Changes loss of pay in the next recompute |
| GET `/hr/salary/structures` | 106 | admin (`salary`) | — | `{structures:[{id, name, description, components:[{code, name, kind, calc, value, taxable, pf_wage}]}]}` | — |
| POST `/hr/salary/structures/preview` | 109 | admin | `{components[], annual_ctc}` | `{breakup:{annualCtc, monthlyCtc, gross, employer, lines[]}}` | Read-only |
| POST `/hr/salary/structures` | 121 | admin | `{name, description, components[1..20]}`. Rules at `hr_payroll_calc.js:26`: BASIC required; at most one `balance`; percentages 0–100; fixed amounts in ₹ | `{structure}` | 409 on a duplicate name |
| PUT `/hr/salary/structures/:id` | 140 | admin | Partial | `{structure}` | **Does not change existing salaries.** Assignments keep a copy of the components |
| DELETE `/hr/salary/structures/:id` | 151 | admin | — | `{}` | Soft retire |
| GET `/hr/salary/people` | 217 | admin | — | `{people:[{id, name, role, departmentId, department, salary:{id, structure_id, structure_name, effective_from, annual_ctc, monthly_ctc, monthly_gross, lines[]} or null, revisions:[{id, effective_from, annual_ctc, structure_name}], profile:{regime, declarations, pt_state, pf_enabled, tds_monthly}}]}` | **Highly sensitive:** everyone's pay |
| POST `/hr/salary/assign` | 173 | admin, not on yourself | `{employee_id, structure_id, annual_ctc, effective_from}` | `{salary, warning}` (`warning` when that month is already locked) | Insert. 409 if a revision already exists on that date. **The first revision counts as the joining date** (`hr_payroll.js:313`) |
| DELETE `/hr/salary/assign/:id` | 194 | admin, not on yourself | — | `{}` | **Hard delete.** Refused (409) if a locked run used it. The website never calls this |
| PUT `/hr/salary/people/:employeeId/profile` | 228 | admin, not on yourself | `{regime: null, 'new' or 'old'; declarations; pt_state; pf_enabled; tds_monthly}` | `{profile}` | Upsert |
| GET `/hr/payroll/runs` | 365 | admin (`payroll`) | — | `{runs:[{id, month, status:'draft' or 'locked', totals:{employees, gross, deductions, reimbursements, net, warnings}, created_by_name, created_at, locked_by_name, locked_at}]}` (newest first, at most 120) | — |
| POST `/hr/payroll/runs` | 372 | admin | `{month:'YYYY-MM'}` (no future months; at most 20 per 10 minutes per user) | `{run}` | Builds every line from salary, attendance, leave, approved claims and loans (`buildItems`, `hr_payroll.js:286`). 409 if that month already exists. 409 with an exact message when statutory settings are incomplete |
| GET `/hr/payroll/runs/:id` | 389 | admin | — | `{run, items:[{id, employee_id, employee_name, department, structure_name, days_in_month, lop_days, pre_start_days, payable_days, lop_override, earnings[], reimbursements[], deductions[], employer[], adjustments[], gross, total_deductions, reimbursement_total, net, tds, warnings[]}]}` (one payload, up to 20,000 lines) | Sensitive |
| POST `/hr/payroll/runs/:id/recompute` | 397 | admin, drafts only | `{}` | `{totals}` | Rebuilds the run. Keeps manual LOP overrides and adjustments |
| PUT `/hr/payroll/runs/:id/items/:itemId` | 408 | admin, drafts only, not your own line | `{lop_override: number (0–days in month, steps of 0.5) or null, adjustments:[{id?, label ≥ 3, type:'earning' or 'deduction', amount > 0, taxable?}] (at most 20)}` | `{item, totals}` | Recomputes the **whole run** (it calls `buildItems` for everyone) |
| DELETE `/hr/payroll/runs/:id` | 443 | admin, drafts only | — | `{}` | Hard-deletes the draft and its lines (it can be run again) |
| POST `/hr/payroll/runs/:id/lock` | 454 | admin (`payroll`) | `{confirm:'LOCK YYYY-MM'}` | `{run}` | **Irreversible** (the database trigger `hr_payroll_guard`, `sql/hr_payroll.sql:116`, blocks any later update or delete). It recomputes first; it is refused if anyone's net pay is negative or the run is empty. It then marks every line locked, so **payslips become visible to employees**. It **marks the included claims `paid`**, inserts loan recoveries, and closes fully repaid loans (`finaliseRun`, `hr_payroll.js:479`). No notifications |
| POST `/hr/payroll/runs/:id/finalise` | 502 | admin | `{}` | `{}` | Finishes a lock whose side effects failed part-way. Safe to repeat. The website never calls it |
| GET `/hr/payroll/runs/:id/register.csv` | 512 | admin (`payroll`) | — | A CSV file (text/csv with a BOM; formula characters escaped) | Audited as an export. **This file holds everyone's pay** |
| GET `/hr/payslips/:itemId/pdf` | 554 | the line's own employee (`payslips` module, locked only), or an HR admin with `payroll` (drafts too, stamped "DRAFT") | — | A PDF (pdfkit) | Audited as a download |

Employee-side pay routes (`/hr/salary/mine`, `/hr/payslips/mine`, `/hr/payslips/fy-summary`, claims and loans) already exist in the app (`src/api/pay.ts`). Not part of this port.

---

## 3. What the app already has, and the gaps

**Already in the app:**
- `src/lib/access.ts`: `hrHas`, `hrIsAdmin`, `hrSections` (`HR_SECTIONS`) and `HR_SYSTEM_ROLES`.
- `src/lib/use-access.ts`: `isHrAdmin`.
- `src/api/attendance.ts`:
  - `useAttendanceSettings` → `GET /hr/attendance/settings`
  - `useMyShift`
  - `useAllShifts` → `GET /hr/shifts`
  - `useTeamAttendance`
  - types `Shift` and `AttendanceSettings`
- `src/api/hr.ts`: `useHolidays`, type `Holiday`.
- `src/api/leave.ts`: `GET /hr/leave/types`, `GET /hr/leave/settings`, types `LeaveType` and `LeaveSettings`.
- `src/api/policies.ts`: list, detail and acknowledge (employee side only), types `PolicySummary` and `Policy`.
- `src/api/pay.ts`: employee pay, `payslipPdfPath`, and the `meta.persist=false` pattern that keeps pay data out of the on-disk cache.
- `src/lib/files.ts`: `downloadAuthed` (expo-file-system with the bearer header) and `shareFile` (expo-sharing). These are enough for the register CSV and any payslip PDF.
- Screens:
  - `app/(app)/attendance/holidays.tsx`: **read-only**. Its own comment says editing stays on the website.
  - `app/(app)/attendance/shifts.tsx`: read-only. HR admins see "All shifts" and a caption saying "Create shifts and assign people to them on the DASH website".
  - `app/(app)/policies/index.tsx` and `[id].tsx`: read and acknowledge only.
  - `app/(app)/pay/*`: employee pay only.
- Menu: `src/features/more/menu.ts` (`buildMoreMenu`). The grid is capped at **9 tiles**, and Afzal HR already has 8.
- Demo:
  - `src/demo/fixtures/attendance.ts` (`SETTINGS`, `SHIFTS`, read-only routes at lines 499–557; `LOCATIONS` is in `src/demo/timeline.ts:37`).
  - `src/demo/fixtures/leave.ts` (`LEAVE_TYPES`, `LEAVE_SETTINGS`).
  - `src/demo/fixtures/policies.ts` (`POLICIES`, published only).
  - `src/demo/fixtures/pay.ts` (`SALARY` for Afzal: ₹14.4 L CTC).

**Gaps:** no admin write path exists in the app for anything in this domain. Specifically:
- No API functions for any of the POST, PUT or DELETE routes above.
- No `GET /hr/attendance/people`, `/hr/shifts/assignments`, `/hr/leave/balances`, `/hr/policies?all=1`, `/hr/policies-meta/departments`, `/hr/policies/:id/acks`, or any of the `/hr/salary/*`, `/hr/payroll/*` or `/hr/statutory` routes.
- No admin screens and no entry point.
- The demo answers none of these. Unknown GETs fall back to `{ok:true}` (`demo/server.ts:121`), so a new screen would show empty or broken until fixtures exist.
- The demo personas have no `payroll` or `tax` module: `ALL` in `demo/personas.ts:76` stops at `reimbursements`, so the payroll sections would be hidden even for Afzal HR.

---

## 4. Mobile design proposal

### 4.1 Entry point and navigation

- **More tab → a new "HR admin" section**, shown only when `access.isHrAdmin`. It uses the same `SectionHeader` and `ListCard` pattern as the "Attendance" links (`more.tsx`) and does not count toward the 9-tile limit. It has one row, **"Run HR"** ("Offices, shifts, leave rules, policies, payroll"), which opens **`/hr-admin`**.
- `/hr-admin` hub (new `app/(app)/hr-admin/index.tsx`): a `NavHeader` and frosted `ListCard` groups. Each row appears only when its module is on, using the same tests as `HR_SECTIONS` and `PayrollAdminPanel`.
  - **Time:**
    - Offices & clock-in (`attendance`)
    - Clock-in rules (`attendance`)
    - Shifts (`shifts`)
    - Holidays (`holidays`)
  - **Leave:**
    - Leave types & rules (`leave`)
    - Balances (`leave`)
  - **People:**
    - Policies (`policies`)
  - **Pay:**
    - Payroll runs (`payroll`)
    - Salaries (`salary`)
    - Structures (`salary`, read-only)
    - Statutory (`tax`, read-only)
- Shortcuts from the screens that already exist:
  - `attendance/holidays.tsx`: a "+" `IconAction` in the `NavHeader` for admins, and tapping a row opens the edit sheet.
  - `attendance/shifts.tsx`: replace the "on the website" caption with **Manage shifts** and **Assign people** rows.
  - `policies/index.tsx`: a **Manage** pill for admins.
- Optionally, a hidden-by-default banner at the top of the hub when `GET /hr/admin/db-check` reports missing files (copying `HrDbCheckBanner`), telling the admin to finish setup on the website.

### 4.2 Screens

The kit names come from `docs/REFERENCE-COMPONENTS.md`. Every list screen has a `NavHeader`, `Skeleton`/`SkeletonList` while loading, `ErrorState` with retry, and `EmptyState` when empty, and is refreshed by pull-to-refresh (`Screen onRefresh`). Every edit happens in a `Sheet` with a `footer` primary `Button`. Server error strings go into `FieldMessage`; they are already plain words. Success is shown with `toast` (`ui/toast`).

| Screen (route) | Layout | Actions |
|---|---|---|
| **Offices & clock-in** `hr-admin/offices` | A `SummaryHero` ("2 offices", info chip "Clock-in inside an office: On"); an `ActivityList` of offices (name, "150 m · address"); a "Company clock-in policy" `SummaryCard` (hours, grace, half and full day, GPS limit, remote allowed, **weekly off**) with an **Edit** pill | **Office sheet:** name and address `PillField`s; radius as a `Segmented` set of presets (50, 100, 150, 300, 500) plus a custom number; **"Use where I'm standing"** (`expo-location` with high accuracy; shows the accuracy and refuses if it is worse than ±50 m); lat and lng shown, editable under "Advanced"; optional map (see §5). **Remove** is a destructive `Button` in the sheet, then an `Alert` ("Past punches keep their record. People cannot clock in here any more."). **Policy sheet:** `TimeField` × 2, number `PillField`s, two RN `Switch` rows, and a weekly-off chip row (the server accepts `weeklyOff`; the website lacks it). The regularization window is a number field. Show a "This changes how everyone's day is marked from now on" note before saving |
| **Clock-in rules** `hr-admin/clock-rules` | A search `PillField`, a `PillSelector` filter by rule, and a `FlashList` of `ListRow`s (name, department, rule `StatusPill`, offices). A long-press or a "Select" header action turns on multi-select with ticks | A sticky `ActionBar` ("12 selected · Set rule"); a rule sheet with `SelectTiles` (Company default, Office only, Office or field, Always remote — plain names; the website's "capture scheme" labels as subtitles) and office ticks. Apply with a confirm `Alert` when more than 20 people are selected |
| **Shifts** `hr-admin/shifts` (or an upgraded `attendance/shifts.tsx`) | The existing `ActivityList`, rows now tappable; a "New shift" pill | **Shift sheet:** name, `TimeField` start and end, grace, half and full day (shown as hours and minutes, sent as minutes), weekly-off chips. **Remove**: `Alert` "N people on this shift go back to company hours; their assignment is not kept". **Assign people** `hr-admin/shift-people`: the same multi-select list as Clock-in rules, then a sheet to pick a shift or "Company hours" |
| **Holidays** (upgrade `attendance/holidays.tsx`) | Unchanged list; admins get "+" and tappable rows | **Holiday sheet:** `DateField`, name, an "Optional holiday" `Switch`; Delete with an `Alert`. A 409 is shown inline ("There is already a holiday on that date") |
| **Leave types & rules** `hr-admin/leave` | A `MetricRow` list of types (code, name, "12 / year · monthly", Paid or LOP pill); a "Rules" `SummaryCard` (leave year starts, comp-off expiry, claim window, back-dating, longest request) with **Edit** | **Type sheet:** code (auto upper case), name, days per year (± stepper in steps of 0.5), accrual `Segmented`, carry-forward maximum, Paid and Half-day `Switch`es, comp-off `Switch` (new types only; forces 0). **Retire**: `Alert` "This can't be undone in the app or on the website. History is kept." **Rules sheet**: one Save, instead of the website's save-on-blur, so there are no surprise writes from a phone keyboard |
| **Balances** `hr-admin/balances` | A year `PillSelector`; a search; a `FlashList` of people (name and department, with a trailing compact "CL 6 · SL 4 · EL 11.5", wrapping to 2 lines). Tap → a person sheet: one `MetricRow` per type (`available` as a large figure; entitlement, adjusted, used and pending in a muted line) | **Adjust** (from the person sheet): type `SelectTiles`, a ± stepper, year and reason, then a `ConfirmSheet` (FromTo: "CL 6 → 8", "+2 days for 2026") with `SwipeToConfirm`, because there is no undo. **Carry forward** (header `…` `MenuSheet`): `ConfirmSheet` "Carry unused leave from 2025 into 2026 for everyone (capped per type)" with `SwipeToConfirm`, then a toast "N credits added". The people × types grid stays on the website |
| **Policies (manage)** `hr-admin/policies` | `Segmented` Drafts / Published / Archived; `ActivityList` rows (title, category · vN, audience, and for published policies that need acknowledgement an "18/24 read" `RadialArc` or fraction) | **Editor screen** `hr-admin/policies/[id]` (a full screen, not a sheet, because the body can be long): title, category, a multi-line `TextField` for the body (plain text, character counter up to 60,000), link, an "Ask people to acknowledge" `Switch`, and an audience chip row of departments (none = everyone). For published policies, a yellow `Banner`: "Saving a change to the title, text or link asks everyone to acknowledge again" — and Save opens an `Alert` when the change counts as material. **Publish**: `ConfirmSheet` and `SwipeToConfirm` ("Everyone in {audience} will see it now"). **Archive**: `SwipeToConfirm` ("Final: it can't be edited or brought back"). **Acknowledgements** screen: `SummaryHero` "18 of 24" with a `StripedProgress`, a Pending/All `Segmented`, and a people list. A 409 on save shows "Someone else changed this policy. Reload" with a reload button |
| **Payroll runs** `hr-admin/payroll` | A `SummaryHero` for the latest run (month, status pill, net pay `Numeral`, "28 people · 2 warnings"); "Loss of pay counts" as an `AccountRow` with a **Change** pill; `ActivityList` of runs | **Run payroll**: a month `PillSelector` sheet (no future months; months that already have a run are disabled), then a primary button "Calculate {Month}". The result opens the run. A 409 for incomplete statutory settings is shown in full with "Fix on the website". **Loss of pay** sheet: two `SelectTiles` |
| **Run detail** `hr-admin/payroll/[id]` | A `SummaryCard` of totals; a warnings `Banner` with "Show only lines with warnings"; search; a `FlashList` of lines (name, department, "29.5/31 days", net on the right, ⚠ count) | Tap a line → **line detail** (the earnings, reimbursements, deductions and employer lines as `KeyValueList`s, plus the warnings) with **Payslip PDF** (`downloadAuthed` → `shareFile`) and, on drafts, **Edit line** (a sheet: LOP override stepper or "Use calculated", an adjustments list with label, earning/deduction `Segmented`, amount `PillField` (decimal pad) and a taxable `Switch`; at most 20). Header `…` `MenuSheet`: **Recompute**, **Export register (CSV)** (`downloadAuthed` + `shareFile` text/csv), **Discard draft** (`Alert`), and **Lock payroll** |
| **Lock payroll** (sheet) | A `ConfirmSheet`: FromTo "Draft → Locked", a `SummaryCard` (employees, gross, deductions, net), and a list of consequences (payslips go live, N claims marked paid, loan EMIs recorded, no edits ever) | Gate it with a `PillField` where the admin **types `LOCK 2026-09`**, as the server demands, and *then* `SwipeToConfirm`. Optionally ask for `expo-local-authentication` (already installed) first. After success: `SuccessSheet`. If the lock request fails *after* the run turned locked (re-read the run and see `status:'locked'`), offer **"Finish locking"**, which calls `POST …/finalise` |
| **Salaries** `hr-admin/salaries` | Search; a `FlashList` (name, structure, CTC, "since 1 Apr"); your own row has no actions. All queries use `meta.persist=false`; amounts are hidden until a tap if the Pay privacy toggle (`features/pay/privacy.tsx`) is reused | Person → a `SummaryCard` (current breakup lines) and a revisions `ActivityList`. **Set / revise salary** sheet: structure `SelectField`, annual CTC as `AmountEntry`, effective `DateField`, a live **Preview** (`POST /hr/salary/structures/preview` with that structure's components and the CTC) showing monthly gross, then a `ConfirmSheet` with `SwipeToConfirm` and the server's `warning` shown in a `Banner`. **Tax profile** sheet: regime `Segmented` (Company default / New / Old), declarations, PT state, manual TDS, a PF `Switch`. **Remove revision** (`DELETE /hr/salary/assign/:id`): optional, behind `SwipeToConfirm`, with a 409 shown when it was used in a locked run |
| **Structures** `hr-admin/structures` | Read-only `ActivityList`; tap → `KeyValueList` of components ("HRA · 50% of Basic · taxable") and a preview `AmountEntry` "Try a CTC", which calls `preview` | Retire with an `Alert`. **Create and edit stay on the website** (a caption says so) |
| **Statutory** `hr-admin/statutory` | Read-only `SummaryCard` per section (PF on, 12% / 12%, ceiling ₹15,000, …; TDS mode and regime) and the `missing[]` list as a red `Banner` | None. "Edit on the website — values must be confirmed with your CA" |

### 4.3 Phone versus web — what stays web-only and why

- **Statutory & TDS editing** stays web-only. It has about 40 inputs, nested slab tables (PT slabs per state, two TDS regimes with ordered slabs where the last has `upto:null`), and values that must be confirmed with a CA. A typo silently changes everyone's tax, and the web form already struggles to fit. The phone shows the settings read-only, with the missing fields.
- **Salary-structure component editor** stays web-only. It is an 8-column grid of up to 20 rows with interdependent rules (BASIC required, one balance, % of BASIC). The phone gets read-only viewing, a preview with a sample CTC, and retire.
- **The company leave-balance grid** (people × types) and the **full register table** stay web-only *as tables*. The phone shows them per person, and the register is exported as CSV through the share sheet.
- **Bulk people pickers** (clock-in rules, shift assignment) work on the phone with search and multi-select. For more than a few dozen people, the website is still the better tool, so say "For big changes the website is quicker" in the empty selection state.
- **Policy authoring** works on the phone for short policies and small fixes. Long documents are better pasted on the website. There is no rich text either way: the server stores plain text.
- Everything else (offices, policy times, shifts, holidays, leave types and rules, adjustments, carry forward, publishing and archiving, running, reviewing, editing lines and locking payroll, salary revisions, tax profiles) is fine on a phone.

---

## 5. Expo Go feasibility (SDK 57)

Checked against `mobile/package.json`: Expo `~57.0.27` and RN 0.86.3.

| Need | Status |
|---|---|
| GPS for "use where I'm standing" | `expo-location ~57.0.21` is already installed and already used by the clock card. Works in Expo Go |
| Map to place an office and draw its circle | **Optional.** `react-native-maps` is **"Included in Expo Go"** for SDK 57, with "no additional setup" in Expo Go (https://docs.expo.dev/versions/v57.0.0/sdk/map-view/). It is **not** in `package.json` yet, so it needs `npx expo install react-native-maps`, which is a **new dependency**. Store builds need a Google Maps key on Android (`androidGoogleMapsApiKey` in the config plugin). That is app configuration, not a server change. Note that the website uses OSM/Leaflet; `react-native-maps` uses Google or Apple base maps, or OSM via `UrlTile`, which must follow the OSM tile policy. **Recommendation:** ship without a map first ("use where I'm standing" plus coordinates and radius, plus a "You are N m from the centre" check), and add the map later if the owner wants it. `expo-maps` is **not** an option: it needs a dev build |
| Time and date pickers | `@react-native-community/datetimepicker 9.1.0` (kit `TimeField` / `DateField`). In Expo Go |
| Month picker | No native one. Use a `PillSelector` and a `MenuSheet` listing months. No dependency |
| CSV and PDF export | `expo-file-system ~57.0.7` and `expo-sharing ~57.0.23` through `lib/files.ts downloadAuthed` and `shareFile`. In Expo Go. (In the demo, `downloadAuthed` throws "Downloads are not available in the demo account.") |
| Re-auth before lock (optional) | `expo-local-authentication ~57.0.3` is already installed |
| Toggles | React Native core `Switch` (already used in `features/more/security-card.tsx`) |
| Long lists | `@shopify/flash-list 2.0.2` is already installed |
| Camera, QR, WebRTC, Google sign-in, push | Not needed in this domain |

**New JavaScript dependencies:** none needed. `react-native-maps` is optional, for the map only.

---

## 6. Demo fixtures (so Afzal HR and Afzal Super Admin can try it)

**Personas** (`src/demo/personas.ts`):
- Give **Afzal HR** (`id:'hr'`, line ~169) and **Afzal Super Admin** (line ~203) `[...ALL, 'payroll', 'tax']`, for example `const ADMIN_ALL = [...ALL, 'payroll', 'tax']`.
- Do **not** add these to `ALL` itself. For employees nothing visible would change, but it would misstate what their department has.
- Both personas already have `isHrAdmin: true`. Afzal Admin and Afzal Manager are department admins, not HR admins: they must see none of this, and the fixtures must return the server's 403 text ("You do not have permission to …") if they call it.

**New fixture file:** `src/demo/fixtures/hr-admin.ts`, registered in `demo/server.ts`. It should be mutable, reset on app restart like the rest, and reuse the existing constants so the employee views change too. The registration order must put specific routes before generic ones; note that `/hr/shifts/assignments` must come before `/hr/shifts/:id`, as on the server.

- **Offices:**
  - `POST`/`PUT`/`DELETE /hr/locations[/:id]` change `LOCATIONS` (`demo/timeline.ts:37`). It must be made mutable or wrapped.
  - `PUT /hr/attendance/settings` changes `SETTINGS` (`fixtures/attendance.ts`), so the clock card picks up the new hours.
  - Validation must use the server's messages (radius 25–5000, half < full, and so on).
- **Clock-in rules:**
  - `GET /hr/attendance/people`: the org users from `fixtures/org.ts`, with about three sample rules: one "remote" (a freelance editor), one "flexible" (a shoot-crew member, both offices), and the rest default.
  - `PUT` stores them in a `Map`.
- **Shifts:**
  - `POST`/`PUT`/`DELETE /hr/shifts` on `SHIFTS`.
  - `GET`/`PUT /hr/shifts/assignments`: people mapped to `hs-general`, `hs-late-edit` or `hs-shoot`. Afzal Employee is on `hs-general` (`MY_SHIFT`).
- **Holidays:**
  - `POST`/`PUT`/`DELETE /hr/holidays` as an overlay on `holidaysFor(year)`: added, edited and deleted ids.
  - 409 on a duplicate date.
- **Leave:**
  - `POST`/`PUT`/`DELETE /hr/leave/types` on `LEAVE_TYPES`, plus `PUT /hr/leave/settings` on `LEAVE_SETTINGS` (both in `fixtures/leave.ts`).
  - `GET /hr/leave/balances?year=`: about 10 people × the active types, with plausible numbers. Afzal's own row must match `balances()` from `fixtures/leave.ts`.
  - `POST /hr/leave/adjustments`: append, and change that person's available days. Refuse on yourself (403).
  - `POST /hr/leave/carry-forward`: refuse the current year ("That leave year has not ended yet."); last year returns `{credits: 7}` and refuses a second time with 0.
- **Policies** (extend `fixtures/policies.ts`):
  - `?all=1` adds one **draft** ("Travel & Per Diem") and one **archived** policy.
  - Create, update with version bump and optimistic-lock 409, publish, and archive.
  - `GET /hr/policies-meta/departments` from the org departments.
  - `GET /:id/acks`: for example 18 of 24 people for the WFH policy v2. Afzal's own acknowledgement must follow `POLICIES[].acked_at`.
- **Payroll** (new data, consistent with `fixtures/pay.ts`, where Afzal's CTC is ₹14.4 L and gross ₹1,15,891):
  - `GET /hr/payroll/settings` → `{lopSource:'unpaid_leave'}`, plus `PUT`.
  - `GET /hr/statutory`: PF on (12% / 12%, ceiling ₹15,000, nearest rupee), PT on (a TELANGANA slab: ₹200 above ₹20,000), TDS `slab` with both regimes filled in, and `missing: []`. A second variant with `missing:['PF rounding']` is worth having, to show the 409 on run.
  - `GET /hr/salary/structures`: three structures ("Creative — Senior" `hss-creative`, "Production crew", "Interns"). `preview` must port `computeBreakup` (`hr_payroll_calc.js:56-80`, pure, about 25 lines) so the numbers are real.
  - `GET /hr/salary/people`: about 10 people with salary, revisions and profile. Afzal's own row equals `SALARY`, but because the demo person **is** the HR persona's "self" after the persona swap (`demo/server.ts` swaps), refuse edits on `selfAs().id` with the server's `notSelf` message.
  - `POST /hr/salary/assign`, `DELETE /hr/salary/assign/:id`, and `PUT …/profile`.
  - **Runs:**
    - The last 3 months are **locked**, with totals that match the employee payslips in `fixtures/pay.ts`.
    - The current month has **no run**, so "Run payroll" can be tried.
    - `POST` creates a draft with about 10 lines. One line has a warning ("No PAN on file — TDS at the higher rate" or similar), one has LOP 1.5, and one includes an approved salary claim from `fixtures/reimbursements.ts` or `pay.ts` `CLAIMS`.
    - Recompute, edit line (merge LOP override and adjustments, then re-total), discard.
    - Lock checks `confirm === 'LOCK '+month`. It then sets the run to locked, **marks the included demo claims `paid`**, and appends a payslip to `payslips()` in `fixtures/pay.ts`, so switching to Afzal Employee shows the new payslip.
  - `register.csv` and `payslips/:id/pdf` need no fixture: `downloadAuthed` refuses in the demo with the existing message.

**Docs:** update `docs/DEMO-ACCOUNTS.md`:
- Afzal HR → "What to try": "More → Run HR: add a holiday, run this month's payroll and lock it".
- The HR and Super Admin rows of the "Website only" column: remove the items that move to the app, and keep Statutory editing, the structure editor and the bulk grids there.

---

## 7. Effort and risks

| Screen / piece | Effort | Notes |
|---|---|---|
| API module `src/api/hr-admin.ts` (types and mutations for §2) plus query keys and invalidation (`att-settings`, `att-shifts`, `holidays`, `leave-balances`, `policies`, `pay`) | M | Pay queries `meta.persist=false` |
| Entry: More "HR admin" section and the `/hr-admin` hub | S | |
| Holidays add/edit/delete (upgrade the existing screen) | S | |
| Shifts create/edit/delete (upgrade) | S | |
| Shift assignment (multi-select list) | M | Shared component with clock-in rules |
| Offices and attendance policy (without a map) | M | GPS-accuracy handling |
| Office map (`react-native-maps`) | M | New dependency and Android key for store builds |
| Clock-in rules (multi-select, rule sheet) | M | |
| Leave types and rules | S | |
| Company balances, adjust, carry forward | M | Large payload |
| Policy manage list, editor, publish/archive, acknowledgements | M | Long text input, version warning, 409 handling |
| Payroll runs list, new run, LOP setting | S | |
| Run detail, line detail, edit line, recompute, discard, CSV, PDF | L | Biggest screen; money formatting; whole-run recompute on each edit is slow |
| Lock flow (typed confirm, swipe, optional biometric, finalise retry) | M | |
| Salaries list, revise with preview, tax profile | M | Sensitive data handling |
| Structures read-only with preview; Statutory read-only | S | S |
| Demo fixtures (`hr-admin.ts` plus edits to attendance, leave, policies, pay and personas) | L | `computeBreakup` port; keeping numbers consistent across personas |

**Risks**

1. **Irreversible money actions on a small screen.** Payroll lock pays out claims, records loan EMIs and publishes payslips, and it can never be undone, not even in the database (trigger at `sql/hr_payroll.sql:116`). Mitigate with:
   - the typed `LOCK YYYY-MM` that the server already requires, plus `SwipeToConfirm`;
   - totals and the consequences shown in the sheet;
   - refusing to lock while a recompute or line edit is in flight;
   - optional biometric re-auth.
2. **Other actions with no undo:**
   - carry forward and leave adjustments (fix with an opposite entry);
   - retiring a leave type;
   - archiving a policy;
   - deleting a shift, which wipes its assignments;
   - removing an office.

   Each one needs plain-words consequences in its confirmation.
3. **Sensitive data on a phone.** `/hr/salary/people`, run items and the register hold everyone's pay. Keep them out of the persisted query cache (`meta.persist=false`, as in `api/pay.ts`), never log them, clear them on sign-out and demo switch, and reuse the Pay privacy blur. The CSV goes to the share sheet, so once shared it is outside DASH's control; show a warning first.
4. **Heavy payloads.** `GET /hr/leave/balances` (reads up to 50k rows) and `GET /hr/payroll/runs/:id` (up to 20k lines in one response), and `PUT …/items/:itemId` recomputes the whole run every time. Use FlashList, show progress, and disable the other actions while a save is running. This is fine for Tamada's size.
5. **Version and concurrency 409s** (policies' optimistic lock, a duplicate payroll month, duplicate holiday dates, duplicate salary dates) must show the server's message with a reload, not a generic error.
6. **GPS quality** when placing an office from the phone. Indoors, accuracy can be ±30–100 m, which would put the centre off by that much. Show the accuracy, ask the admin to stand outside or wait for a better fix, and refuse if it is worse than ±50 m. The map (§5) fixes this properly.
7. **Settings drift between web and app.** The app would expose `weeklyOff` and `regularizationWindowDays`, which the website form does not. That is harmless (the server merges partial updates), but tell the owner so the two UIs do not seem to disagree.
8. **Module gating.** Payroll screens need `payroll`, `salary` or `tax` in `/hr/me` `modules`. If the company has not been granted them (Master Admin), the hub must hide those rows, not show 403s.
9. **No server change is needed.** Nice-to-haves, not blockers:
   - an "un-retire" endpoint for leave types, shifts and offices;
   - a push or WhatsApp to employees when payroll locks (part of the deferred push work).
