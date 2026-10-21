# Desk (visitor desk) — wave 1 hand-off

Spec: `docs/port/visitor-desk.md`. Gates: `features/desk/access.ts` (exact role in
`VISIT_DESK_ROLES`, dash.html:35180 / 1495 / 1531 / 35771 — CEO and COO get no desk).

## Filled extension points
- [x] **More › Reception** (`nav.ts workspaceRows`), both desk roles (visitor_manager, super_admin):
  `desk.board` Visitor desk (tourId `more.desk.board`, order 10) · `desk.log` Visitor log (20) ·
  `desk.invites` Invites (30) · `desk.qr` Check-in link (tourId `more.desk.qr`, 40).
- [x] **+ sheet** (`createActions`): `desk.invite` "Invite visitor" → `/visitors/invite`, Visitor
  Manager only (Super Admin already has the built-in "Invite a visitor").
- [x] **Home** (`homeCards`): `desk.hero`, placement `hero`, Visitor Manager only — "In the building"
  SummaryHero (TourTarget `home.desk`) + CategoryGrid (Visitor desk · Visitor log · Invites · Check-in link).
- [x] **Inbox kind** `desk` ("At reception", `decides: false`, pin `{ key: 'reception', label: 'At reception' }`
  — same group as the host's visitors), Visitor Manager only. Query `['inbox','desk',userId]`
  (GET /visitors/today, `persist:false`). Detail `/inbox/desk/<id>` = `features/desk/decide-screen.tsx`
  (swipe "Let in" with a note naming who is told; "Turn away" = ConfirmSheet + swipe). No History.
- [x] **Tour** (`tour.ts`): `desk.hero` (Home), `desk.board` (More; Visitor Manager and Super Admin),
  `desk.qr` (More; Visitor Manager).

## Routes (all re-check the gate and `Redirect` home)
`src/app/(app)/admin/desk/index.tsx` board · `log.tsx` · `invites.tsx` · `qr.tsx`.
Kiosk (`admin/desk/kiosk`, Stack options already in `_layout.tsx`) is wave 2.

## Existing files changed (PLAN §2.4)
- `src/app/(app)/visitors/invite.tsx`: comment; "Done" without history goes to `/admin/desk/invites` for desk roles.
- `src/api/visitors.ts`: `useDecideVisit` also invalidates `['inbox','desk']`.

## For the integrator
- [ ] Old copy that says the desk is web-only: `demo/personas.ts:256` note, `features/tour/role-tours.ts:268`
  intro and the visitor_manager steps (still point at Help & support / People), `docs/DEMO-ACCOUNTS.md:78,101,141`.
  Suggested note: "Visitor desk, log, invites and check-in link on the phone; kiosk next".
- [ ] PLAN §2.5: Visitor Manager's near-empty More grid → the Reception rows could become tiles.
- [ ] Order of the `desk` Inbox kind vs. the host's `visitors` (both pinned under "At reception").
- [ ] Demo quirk: the demo person's own visitors (fixtures/visitors.ts `vis-demo-01/02`, host = DEMO_USER)
  show on the board as "To meet Afzal Visitor Manager" when that persona is active (the demo server's
  id/name swap). Harmless; reassigning their host would need a visitors.ts change.
- [ ] Cancel invite (desk Invites reuses `features/visitors/invites.tsx` InviteList) still confirms with
  `Alert.alert`, not ConfirmSheet + SwipeToConfirm, although the cancel can't be undone (PLAN §2.1.6).
  It is the visitors module's file, so the desk didn't change it. Note: react-native-web's Alert is a
  no-op, so Cancel invite does nothing in the web preview.
- [ ] Wave 3 / D4: QR drawing (encoder), printable poster. Today the Check-in link screen shares the link
  and opens the public page.
- No new dependencies. No new fixture exports needed (uses `visitStore`, `inviteStore`, `makeVisit`,
  `personById`, `TENANT`, `currentPersona`). Fixture `desk.ts` also exports `deskQrToken()` for the wave-2 kiosk.

## Demo data (`src/demo/fixtures/desk.ts`)
Today: 6 tenant-wide visits (2 waiting, 1 no answer, 1 inside, 1 left, 1 turned away; qr/kiosk/invite)
plus the demo person's 2. History: ~60 visits over 30 days (photos "removed" after 28 days). Invite for
today: Kavya Reddy, code 482615. Routes: today, log, check-out, decide (host or desk role, else 403),
qr, qr/regenerate, kiosk/exit (Demo@123). Desk routes 403 for other roles.

## Tested (web preview, own origin desk.localhost:8090)
- Afzal Visitor Manager: Home hero + shortcuts, Needs you, Inbox "At reception" (4), More › Reception,
  + sheet "Invite visitor", board (chips filter), Let in, Turn away (ConfirmSheet), Check out
  (ConfirmSheet), log (search, dates, status), Invites (today's Kavya Reddy), invite form end to end,
  Check-in link (regenerate rotates the demo token).
- Afzal Super Admin: More › Reception rows, board; no desk hero, no desk Inbox kind.
- Afzal Employee: no Reception rows; /admin/desk redirects home.
- 390×844 light, 320×700 dark. Swipes were triggered through the SwipeToConfirm accessibility action
  (the pane was hidden for most of the run, so drags could not be sent).
