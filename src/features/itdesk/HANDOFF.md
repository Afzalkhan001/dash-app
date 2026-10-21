# IT desk — hand-off (wave 2)

Spec: docs/port/it-admin.md §1.1, §1.3, §1.7, §4.3, §4.5, §4.6 (Subscriptions = company domain, Service
desk / Raise for someone = servicedesk domain, News compose = HR/newsroom). Website: AssetCatalog
dash.html:20140–20982, RoomsLocations :21959–21982 (+ :21411, :21669, BookingPurposes :21842), SupportView
:29187. No server, website or DB change. No new dependency. No shared file edited.

## Files
- [x] `src/api/itdesk.ts` — assets (list, add, assign, take back, condition, fix name, resend link, delete),
      whitelist, rooms / locations (list without photos, one with photos on the edit screen, save, open/close,
      delete), purposes, room bookings + cancel, Support Centre writes (always sends `tenantId`, spec §2.6)
- [x] `src/features/itdesk/{access,format,ui,photos,photo-strip,purpose-sheet,home-card,nav,inbox,tour}.ts(x)`
- [x] `src/app/(app)/admin/it-desk/assets/{index,[id],new}.tsx`
- [x] `src/app/(app)/admin/it-desk/rooms/{index,room,location}.tsx` (tabs Rooms · Locations · Bookings · Purposes)
- [x] `src/app/(app)/admin/it-desk/support.tsx` (Wi-Fi · Staff · Temp staff · Lists)
- [x] `src/demo/fixtures/itdesk.ts`

## Plugged in
- [x] More › IT & office: `itdesk.assets` "Assets" (order 20, `web('assets')` = it_admin + switch),
      `itdesk.rooms` "Rooms & locations" (order 30, `web('rooms')`), `itdesk.support` "Support centre"
      (order 40; `web('support')` + it_admin/super_admin/ceo/coo for Wi-Fi/staff/temp (dash.html:29219),
      admin/super_admin/ceo/coo/app_manager for request items + complaint types (:29207)). Tour ids `more.itdesk.*`.
- [x] + sheet: `itdesk.asset` "Add asset" (IT Admin), order 30.
- [x] Home: `itdesk.equipment` (placement `needs`, order 50, IT Admin): acknowledgements waiting + warranties
      ending in 60 days → Assets (`?view=ackWaiting` when some wait).
- [x] Inbox kinds: none (nothing here is a decision; equipment approvals are servicedesk's `desk-it`).
- [x] Tour: `itdesk.assets`, `itdesk.rooms`, `itdesk.support` (screen /more, gated on `ctx.workspaceRows`).

## Rules kept
- Gates ported with line refs in `access.ts`; every screen redirects home without its gate.
- Swipe + ConfirmSheet naming who is told: assign (email + WhatsApp to the person), resend link (same),
  cancel a room booking (requester, email + WhatsApp — the website has no confirm), and every delete
  (asset, room, location, purpose, Wi-Fi, contact, temp staff, list item: "no one is notified").
- No self-heal writes: the website's asset name/status fixes are not repeated; "No name found" is read only
  and fixed by hand ("Fix the employee name"). Asset history is re-read just before assign / take back.
- Cancel = PUT /bookings/:id {status:'rejected', reason} then delete the slot row by bookingId, else booker +
  date + start slot. The website's loose location-row fallback (same booker, same day) is NOT repeated.
- Photos: 900 px JPEG q0.82 (own picker, not lib/files' 1600 px), ≤ 5; `images` sent only when changed.
- `meta:{persist:false}`: assets, whitelist, locations (contacts), photo reads, room bookings.
- Stays web-only: bulk asset upload / template / history, Excel & PDF reports, "Delete all assets".

## For the integrator
- [ ] **Demo clash 1 — `GET /assets`**: people.ts answers first with its own 3 static rows, so the IT desk
      list shows only those and writes don't show. Please DROP people's `GET /assets` in `integration.ts`;
      itdesk.ts's store already contains people's three rows with the same ids (as-fx6, as-lat, as-mic).
- [ ] **Demo clash 2 — `GET /room_purposes`**: booking.ts always answers the website's five, so purposes
      added / edited / turned off in the demo don't show. DROP booking's GET; itdesk.ts's store starts with
      the same five (plus colours) and a hidden "Podcast recording". Booking's `useRoomPurposes` then reads it
      (it already filters `active`). booking.ts's `purposeError` also reads only FALLBACK_PURPOSES (demo only).
- [ ] `GET /rooms` and `/locations` are booking.ts's, over the same `roomStore` / `locationStore` I write to,
      so they agree. Demo rows keep `images` on the row, so booking's list also returns them (demo only).
- [ ] Seeds added through exports: 6 colleague room bookings in tasks.ts `bookingStore` (+ slot rows in
      booking.ts `roomSlotStore`), a closed "Podcast Studio" room, location fields (area, type, hours, rules).
- [ ] Optional `DEMO-ACCOUNTS.md`, Afzal IT Admin: "Assign the Mac mini EDIT-WS-07; send Sanjay's MacBook
      link again; fix the LaCie drive's employee 10249; cancel Priya's Board Room booking; close Podcast Studio;
      add a Wi-Fi network".
- [ ] Promote nothing yet. Stack options: none. Dependencies: none.

## Tested (web preview, own origin itdesk.localhost:8090, 390×844 light and 320×700 dark)
The two clashes above were bypassed in the test tab only, by putting itdeskRoutes in front at runtime
(`registerDemoRoutes`, no file change). Swipes were fired through SwipeToConfirm's accessibility action.
- Afzal IT Admin: More › IT & office rows; Home "Equipment" card; Assets list (KPIs, categories, search,
  16 rows); assign the Mac mini to Nikhil (swipe → success, timeline, "Waiting for Nikhil"); take it back;
  send Sanjay's link again; Fix the LaCie drive's employee 10249 → Harish Babu; condition → Not working;
  delete the drive (swipe); add an asset → open it. Rooms: list, Podcast Studio opened + amenity saved;
  Locations: Gachibowli "Needs approval" blocks save until an approver is chosen, then saves; Bookings:
  cancel Priya's Board Room (swipe; slot row freed; counts 5→4 / 1→2); Purposes: add "Interview",
  delete refused for "Shooting" (server's 409 text shown), delete "Interview". Support centre: add + delete
  a Wi-Fi network (row carries tenantId t-demo), show a hidden contact, add temp staff for 3 days.
- Afzal Super Admin: Support centre with all four tabs; add + remove an office request item; Assets
  redirects home (no row).
- Afzal Admin: only "Support centre" (Lists); Rooms redirects home.
- Afzal Employee: no IT desk rows; /admin/it-desk/support and /assets/new redirect home.
- No horizontal overflow on any IT desk screen at 320 dp. `npx tsc --noEmit` and `npx expo lint` clean.
