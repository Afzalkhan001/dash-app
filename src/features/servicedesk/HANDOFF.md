# Servicedesk — hand-off (wave 1)

Spec: docs/port/team-ops.md §5, docs/port/it-admin.md §1.4–1.5 / §4.1–4.2. Website: ServiceDesk
dash.html:21036–21410, ITTaskOnBehalf dash.html:6842–6987. Server: routes/tickets.js, routes/tasks.js.
Existing endpoints only; no new dependencies; no shared file edited.

## Files
- [x] `src/app/(app)/admin/service-desk/index.tsx` — the desk (role tabs, search, filter sheet, "Waiting on you" chip, day groups, 30 at a time)
- [x] `src/app/(app)/admin/service-desk/[id].tsx` — one request (wraps `features/servicedesk/ticket-detail.tsx`)
- [x] `src/app/(app)/admin/service-desk/raise.tsx` — Raise for someone (IT Admin)
- [x] `src/api/servicedesk.ts` — queries, `reconcileTickets` (display only), assign / reject / status / raise mutations
- [x] `src/features/servicedesk/{access,format,use-desk,ticket-detail,desk-row,nav,inbox,tour}.ts(x)`
- [x] `src/demo/fixtures/servicedesk.ts`

## Plugged in
- [x] More › IT & office: `servicedesk.desk` "Service desk" (order 10, tourId `more.servicedesk`) for `access.web('servicedesk')`;
      `servicedesk.raise` "Raise for someone" (order 11, tourId `more.servicedesk.raise`) for it_admin + `web('tasks')`.
      Spec team-ops put the desk under "Work"; I used `it` (IT & office). Move it if you prefer.
- [x] + sheet: `servicedesk.raise` "Raise for someone" (IT Admin). The label is 3 words, like "Invite a visitor"; shorten if the cap needs it.
- [x] Inbox kind `desk-it` "Service desk" (module support, Headset). What waits on me: IT Admin unassigned tickets + equipment to approve (when approver);
      Admin / App Manager equipment to approve (only as the IT & Admin dept admin); Super Admin open office requests + complaints; HR open
      Behaviour & Work complaints. CEO/COO: none (read-only desk). `decided` from rejectedBy / approvedBy / statusUpdatedBy; `noteDecision('desk-it:<id>')`.
      No `History` chip (no list of "my decisions" exists on the server).
- [x] Tour: `servicedesk.desk` and `servicedesk.raise` (screen /more), gated on `ctx.workspaceRows`.
- [x] Home: nothing of its own (the Inbox kind already feeds "Needs you").

## Rules kept (please keep when merging)
- Gates ported from dash.html with line refs in `access.ts`: `deskSlice`, `baseItems`, `isDeptApprover` (dept.adminId; no approver → any Admin, never any IT Admin), tabs, `rowAction`.
- CEO/COO get the IT slice but no Accept & assign (server refuses their status change — team-ops §5.2 "web bug").
- Every action ends in ConfirmSheet + SwipeToConfirm naming who is emailed / WhatsApped; then SuccessSheet.
- Accept & assign = POST /tasks, then PUT /tickets; if the PUT fails the screen says the task exists and retry reuses it (server de-dupes by ticketId).
- `healResolvedTickets` and the "System Repair" orphan-task writes are NOT ported. `/tickets`, `/tasks`, `/whitelist` queries are `meta:{persist:false}`.

## For the integrator
- [ ] Promote nothing yet; `isBehaviourWork` / `deskSlice` live in `features/servicedesk/access.ts` (only this domain uses them).
- [ ] Demo `GET /whitelist` (2 not-signed-up people) is registered here. If the people domain also serves `/whitelist`, keep one store and
      make sure it has at least one person not on `/users` (for the "Not signed up yet" path).
- [ ] Demo `PUT /tickets/:id` is overridden here with the server's full status matrix (routes/tickets.js:91–145) using `currentPersona().role`;
      it keeps the raiser's cancel and the assignee's resolve from My tasks working.
- [ ] Optional: put one IT & Admin person (Pooja Rao) on leave today in `team-leave.ts` to show the picker's "On leave" state.
- [ ] Optional `DEMO-ACCOUNTS.md` "What to try": IT Admin — assign Zoya's VPN ticket to Ravi, approve Kavya's 2× Monitor, reject the printer
      jam, raise a ticket for Tejas (not signed up); Super Admin — mark the stationery request resolved; HR — the Behaviour & work complaint.
- Stack options: none needed. Dependencies: none.

## Tested (web preview, demo data)
- Afzal IT Admin: desk list, filters/search, accept & assign (Ravi), approve & assign (Pooja) from `/inbox/desk-it/<id>`, reject with reason,
  Raise for someone (whitelist person, project code, success), "Raised by you", More rows, Inbox chip + Home "Needs you".
- Afzal Super Admin: all five tabs, office request status change (open → resolved), equipment read-only ("Waiting for Naveen Kumar").
- Afzal HR: one tab, only the Behaviour & Work complaint; Inbox `?type=desk-it`.
- Afzal Admin: equipment only, read-only, "Waiting for approval by Naveen Kumar".
- Afzal Employee: `/admin/service-desk` redirects home; no More row.
- 390×844 light, 320×700 and 280 wide dark: no horizontal overflow. `npx tsc --noEmit` and `npx expo lint` clean.
