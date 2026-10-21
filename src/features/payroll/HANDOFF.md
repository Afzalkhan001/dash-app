# payroll — hand-off to the integrator

Payroll for **Super Admin and HR** (with the `payroll`, `salary` or `tax` module): monthly payroll
runs (run, check, edit a line, recalculate, discard, lock, finish a half-done lock, export the
register), the loss-of-pay setting, salaries (set, revise, remove a revision) and tax profiles,
salary structures (read, try a CTC, retire) and statutory/TDS settings (read only).

## Plug-ins filled in
- [x] **More › Workspace:** one row, `payroll.hub`.
  - Section `people`, `order: 30` (after `hrtime.setup` at 20), label "Payroll", `href: /admin/payroll`, module `pay`.
  - The subtitle lists only the parts this person's modules switch on ("Monthly runs, salaries and statutory").
  - Wrapped in `tourId: more.payroll.hub`.
  - Gate: `payrollGates(hr, user).any` (`features/payroll/access.ts`). This is the same test as `lib/access.ts canSeePayrollAdmin` plus `canSeeHr`.
- [x] **+ sheet:** none, on purpose. A payroll run is monthly, not a daily "start something".
- [x] **Home cards:** none.
- [x] **Inbox kinds:** none, on purpose. Nothing in payroll waits on anyone, and the server sends no messages. A draft that isn't locked yet is shown on the hub.
- [x] **Tour:** one step, `payroll.hub`, on `/more`.
  - It targets `more.payroll.hub`.
  - It shows only when `ctx.workspaceRows` has `payroll.hub`.

## Routes (all under `src/app/(app)/admin/payroll/`)
- `index`: the hub. It has the latest run as a SummaryHero with "Run payroll", the "Loss of pay counts" setting, the list of runs, and links to Salaries, Structures and Statutory. Each part shows only when its module is on.
- `runs/[id]/index`: one run. It shows the totals, a Draft/Locked banner, the people list (search, "with warnings" filter) and "Lock payroll". The ••• menu has Recalculate, Export register (CSV) and Discard draft.
- `runs/[id]/[itemId]`: one person's line. It shows earnings, reimbursements, deductions and employer contributions, plus warnings. It also has the Payslip PDF and "Edit line" (loss-of-pay override and up to 20 adjustments).
- `salaries/index`: everyone's salary (search, "without a salary" filter).
- `salaries/[id]`: one person. It shows the current salary, the monthly breakup, the tax profile and the salary history. Revise/Set salary has a live preview. There is also the Tax profile sheet and "Remove" on a revision.
- `structures`: read only. Tapping a structure shows its parts and "Try a CTC" (`/preview`), plus Retire.
- `statutory`: read only. The `missing[]` list is shown in red.

Every screen re-checks its own gate. It shows a skeleton while `/hr/me` loads, then sends anyone without the gate home.

## Safety (PLAN §2.1.6)
These actions go through ConfirmSheet + SwipeToConfirm, and each says "Nobody is messaged":
- **Lock payroll.** The sheet shows the totals and the consequences: recalculated first, payslips go live, N claims marked paid, N advance EMIs recorded, never undone. The swipe stays disabled until `LOCK YYYY-MM` is typed, and also while a recalculation or line save is running. If the lock fails, the run is re-read. If it turned out locked anyway, a "Finish locking" banner calls `/finalise`.
- **Discard draft.**
- **Save a salary revision.** The server's locked-month `warning` is then shown as a banner.
- **Remove a revision.** A 409 shows the server's words.
- **Retire a structure.**

Other notes:
- Line edits, the tax profile and the loss-of-pay setting can be changed again, so they use plain Save buttons.
- Before the CSV is shared, a sheet warns that it holds everyone's pay.
- Your own row has no actions ("Ask another HR admin"), matching dash.html :5235 and the server's `notSelf`.
- Every query is `meta: { persist: false }`.
- Amounts follow Pay's "Hide amounts" eye (`features/pay/privacy`), which is in every payroll header.
- Dates are IST (`useTodayIst`, `dateLabel`).

## Gates (`features/payroll/access.ts`)
- `canSeePayroll` ports dash.html:5312 and :4641.
- `payrollGates()` returns `runs`, `salaries`, `structures`, `statutory` and `any`, following the tabs at dash.html:5290.
- `isDraft` follows dash.html:5119.
- `isSelf` follows dash.html:5235.
- Nothing needs promoting.

## Demo (`src/demo/fixtures/payroll.ts`)
- It answers every `/hr/statutory`, `/hr/payroll/*` and `/hr/salary/*` route (except `/hr/salary/mine`, which stays in `pay.ts`).
- Refusals use the server's words. Anyone other than super_admin or hr gets "You do not have permission to …" (403). Your own pay gets the `notSelf` 403.
- `hr_payroll_calc.js` is ported line for line in paise: `validateComponents`, `computeBreakup`, `statutoryMissing` and `computeItem` with PF, PT and slab TDS. So every figure is calculated, not typed in.

Seed:
- Three structures: Creative — Senior (`hss-creative`), Production crew and Interns.
- 23 salaries. Nikhil has none, so "Set salary" can be tried.
- Statutory settings are complete: PF 12%/12% capped at ₹15,000, Telangana professional tax, and both the new and old regimes for TDS.
- Zoya has no PT state, so her line carries the engine's own warning.
- Ramesh is on the old regime. Kavya (intern) has no PF.
- The **last three months are locked** runs (by Lakshmi Prasad). This month has no run.
- Unpaid days: Farhan 1.5 and Rahul 1 this month.
- With "Leave + absence", Imran and Meera also lose days.
- Farhan's approved travel claim and Afzal's approved food claim (`hrc-demo-03`) ride in this month's run.

How it ties to the employee side:
- The demo person's breakup is `salaryStore`.
- The seeded runs' lines for the demo person **are** the payslips: same ids `hpi-demo-<month>`, written back with `addPayslip`. They include the half-day loss of pay, the reimbursed claim `hrc-demo-02` and the advance EMI.
- Locking a run:
  - marks the included `hrClaimStore` claims paid;
  - records the EMI on `loanStore` (recovered/outstanding, closed when done);
  - calls `addPayslip`, so Afzal Employee sees the new month in Pay › Payslips.

Integrator please check:
- [ ] **TDS in the seeded months is close to, not exactly, pay.ts's flat ₹6,704.** It is calculated with year-to-date figures, so the three seeded payslips may move by a few rupees. That's deliberate: run and payslip agree.
- [ ] **Downloads are refused in the demo.** This covers the CSV register and payslip PDFs, which go through `downloadAuthed` ("Downloads are not available in the demo account."). The screens show that message.

## Uses from other domains (import only, nothing edited)
- `features/hrtime/ui` `ToggleRow` and `Stepper`. Worth promoting to `features/shared/` if more domains want them.
- `features/pay/privacy` `usePayMoney` and `usePrivacyAction`.

## Needs nothing new
- No dependencies.
- No Stack options.
- No new fixture exports.

## Website-only (kept on the website)
- Statutory & TDS editing.
- The structure component editor (create/edit).
- The wide register table (the phone exports it as CSV).

## Personas tested
See the agent report. Lock was tested through the swipe's accessibility "activate" action.
