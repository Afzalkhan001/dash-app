# Desk (visitor desk) — hand-off (wave 1 + wave 2 kiosk)

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
`src/app/(app)/admin/desk/index.tsx` board · `log.tsx` · `invites.tsx` · `qr.tsx` · `kiosk.tsx` (wave 2;
route name `admin/desk/kiosk`, so the integrator's Stack options apply: fullScreenModal, no gesture, fade).

## Wave 2 — Kiosk mode (spec §4.2 D; web VisitorKioskPage / VisitKioskOverlay / VisitWizard)
- Gate `canSeeKiosk` (access.ts): `web('visitors-kiosk') || web('visitors-desk')`, inside `canRunDesk`
  (exact role visitor_manager / super_admin; CEO/COO get nothing).
- Plug-ins filled: More › Reception `desk.kiosk` "Kiosk mode" (order 15, tourId `more.desk.kiosk`, both
  desk roles) · + sheet `desk.kiosk` "Start kiosk" (Visitor Manager; already in `CREATE_ORDER`) · Home desk
  hero action is now "Start kiosk" (spec §4.1; Invite stays in the + sheet and More) · tour step
  `desk.kiosk` (Visitor Manager, More).
- Files: `features/desk/kiosk/wizard.tsx` (state machine: start → host → selfie → details → waiting →
  result; code → invite_selfie → invite_done; 15 s auto reset), `kiosk/selfie.ts` (front camera via
  expo-image-picker + visitShrink port: ≤ 640 px, q 0.7 stepping to ≤ 550 KB), `kiosk/exit-sheet.tsx`
  (phone lock first via expo-local-authentication, else DASH password → POST /visitors/kiosk/exit; 403
  inline), `api/desk.ts` kiosk section (public calls through `apiFetch`, no actor id in visitor bodies,
  nothing cached; `KioskError.problem` = link | busy | offline | other).
- Safety: the visitor's check-in (WhatsApps the host) and the invite arrival (WhatsApps the host) each go
  through a ConfirmSheet + SwipeToConfirm that names who is told. Consent text is the web's, verbatim.
  A public 404 "link is not valid" (QR regenerated) stops the kiosk with "This kiosk’s check-in link was
  changed" → Exit. 429 shows the server's words in a warning banner. Offline link check retries every 10 s;
  the waiting poll shows "Can’t reach the check-in service — retrying". Android Back does nothing while
  running; the status bar is hidden.
- "Check in on your own phone" shows the poster's link as text (no QR drawing until D4 approves an encoder).

## Needs from the integrator (wave 2)
- [ ] **expo-keep-awake** (PLAN D4 "Yes"): not a direct dependency, so the kiosk does NOT keep the screen
  on yet; the intro tells the desk to set "stay on while charging". Once installed, add `useKeepAwake()` in
  `RunningKiosk` (`app/(app)/admin/desk/kiosk.tsx`). Optional: expo-navigation-bar `setHidden(true)`.
- [ ] **No live camera preview** (expo-camera not installed): the phone's camera app opens on the front
  camera, then Retake / Use this photo. Swap to `CameraView` later if expo-camera is approved.
- [ ] Exit is in the kiosk's top bar ("Exit kiosk", quiet pill, top-right), not bottom-left as on the web:
  the bottom holds the action bar / keypad.
- [ ] `docs/DEMO-ACCOUNTS.md` + persona note: Afzal Visitor Manager → "Visitor desk, kiosk, log, invites
  and check-in link on the phone". Try: + › Start kiosk › "I'm here to meet someone" › "nav" › Naveen …;
  invite code 482615 (Kavya Reddy, today, single use). A visitor named "Test …" is turned away.
- [ ] Optional server change (spec §7.1) still stands: the public 10-check-ins-per-10-min limit per
  network address will 429 a busy kiosk, as on the web.

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
  and opens the public page; the kiosk's "own phone" block shows the link as text.
- No new dependencies. No new fixture exports needed (uses `visitStore`, `inviteStore`, `makeVisit`,
  `personById`, `TENANT`, `currentPersona`). Fixture `desk.ts` also exports `deskQrToken()` for the wave-2 kiosk.

## Demo data (`src/demo/fixtures/desk.ts`)
Today: 6 tenant-wide visits (2 waiting, 1 no answer, 1 inside, 1 left, 1 turned away; qr/kiosk/invite)
plus the demo person's 2. History: ~60 visits over 30 days (photos "removed" after 28 days). Invite for
today: Kavya Reddy, code 482615. Routes: today, log, check-out, decide (host or desk role, else 403),
qr, qr/regenerate, kiosk/exit (Demo@123). Desk routes 403 for other roles.
Wave 2 public check-in routes (`/public/visit/t-demo/<token>/…`): employees?q (≥ 2 letters, ≤ 25, name +
job title only), check-in (server's validation words, ≤ 600 KB photo; lands in `visitStore` as a pending
`kiosk` visit with the selfie as its photo, so the board shows it), status (the host answers ~12 s later:
approved, or rejected when the name contains "test"; the desk can answer first), invite (today's code
only, 404/409 texts) and arrive (approved `invite` visit, invite marked used). A wrong or rotated token
gets the server's 404, so Make a new link visibly breaks a running demo kiosk.

## Tested (web preview, own origin desk.localhost:8090)
- Afzal Visitor Manager: Home hero + shortcuts, Needs you, Inbox "At reception" (4), More › Reception,
  + sheet "Invite visitor", board (chips filter), Let in, Turn away (ConfirmSheet), Check out
  (ConfirmSheet), log (search, dates, status), Invites (today's Kavya Reddy), invite form end to end,
  Check-in link (regenerate rotates the demo token).
- Afzal Super Admin: More › Reception rows, board; no desk hero, no desk Inbox kind.
- Afzal Employee: no Reception rows; /admin/desk redirects home.
- 390×844 light, 320×700 dark. Swipes were triggered through the SwipeToConfirm accessibility action
  (the pane was hidden for most of the run, so drags could not be sent).

## Tested — wave 2 kiosk (web preview, own origin desk.localhost:8090)
- Afzal Visitor Manager: Home hero "Start kiosk", More tile "Kiosk mode", + sheet "Start kiosk" · intro →
  Start kiosk · host search (no match text, "nav" → Naveen) · photo (picker on web) · details validation
  (the web's four messages) · ConfirmSheet swipe → waiting → "You are approved" → auto reset at 15 s ·
  "Test Caller" → "Sorry, not right now" · invite code: wrong code → "not valid for today", keypad
  482615 → Welcome, Kavya Reddy → swipe → "You are checked in"; same code again → "already been used" ·
  the board then shows the kiosk visits with their photos · Exit: wrong password → "That password is
  not right.", Demo@123 → intro · Make a new link while running → "This kiosk's check-in link was
  changed" → exit → restart on the new link.
- Afzal Super Admin: More › Reception "Kiosk mode" → start → exit. Afzal Employee: `/admin/desk/kiosk`
  redirects home.
- 390×844 light, 320×700 dark (no sideways overflow; the purpose chips wrap). Swipes via the
  SwipeToConfirm accessibility action; the pane was hidden, so no screenshots.
- **Blocker seen while testing (not desk's):** the app crashed on load with "Cannot access
  'onSignOutListeners' before initialization": `demo/fixtures/hiring.ts` value-imports
  `PUBLIC_APP_STATUSES` from `api/hiring.ts`, which imports `api/query.tsx` (module-level `onSignOut`)
  → cycle via `api/client → demo/server → fixtures/index`. The kiosk was tested on a locally patched
  copy of the bundle (in the browser only; no file changed). The hiring fixture should copy the list or
  import it from a file with no app imports.

## Wave 2 review (independent reviewer)
- Fixed: the waiting screen now says "We have told <first name> you are here." (the web's words; "you are
  here" was missing). Kiosk exit now posts through `api.post` like the web's `apiPost`, so the body matches
  the website (`{password}` plus the actor id).
- Re-tested in the web preview (Afzal Visitor Manager): invite code (wrong code, then 482615 → swipe → checked
  in), meet someone (validation, consent, swipe → waiting → result → reset), exit (wrong password, then
  Demo@123). 320×700 dark: no sideways scroll; the code keypad and Continue fit. The app loaded without the
  hiring import-cycle crash in this run.
