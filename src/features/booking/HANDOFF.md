# Booking — hand-off to the integrator (wave 1)

Spec: docs/port/manager-work.md §1.3, §1.7, §1.8, §4.2 (booking rows) and docs/port/team-ops.md §6–7.
No server, website or DB change. No new dependency. Only existing endpoints.

## Plug-ins filled in

- **More › Work** (`nav.ts workspaceRows`):
  - `booking.hub` "Booking" → `/admin/booking`. Shown for `web('booking')`. Order 30, tour id `more.booking.hub`.
  - `booking.requests` "Booking requests" → `/admin/booking/requests`. Shown for `web('requests')` plus canApproveBk (dash.html:24112), so admin, manager and app_manager. Order 31.
  - `booking.reviews` "Pending reviews" → `/admin/booking/reviews`. Shown for app_manager. Order 32, tour id `more.booking.reviews`.
- **+ sheet** (`createActions`): `booking.book` "Book" → `/admin/booking`. Shown for `web('booking')`. Order 20.
- **Home** (`homeCards`): `booking.reviews`, placement `needs`, order 40. App Manager only: the pending-reviews count plus a link. It reads the whole `/bookings` table, as the website's App Manager home does.
- **Inbox kinds** (`inbox.ts`), in this order. All three share one query, `['inbox','booking',userId,'feed']`, which is `/bookings?since=<today−60 d IST>`:
  - `booking` "Bookings": waiting professional bookings of my people, plus location bookings I approve. Approvers only. It has a `History` chip (approved and rejected).
  - `bkdone` "Work done": my professional bookings marked done, waiting for my approval.
  - `bkrate` "Rate": my finished professional bookings that have no rating yet.
- **Tour** (`tour.ts`): `booking.hub`, `booking.reviews`. Both open `/more` and only run when that row is shown.

## Screens (`src/app/(app)/admin/booking/`)
- `index`: the hub. Hero, the 3 ways to book, "Waiting on you", "Booked for you" (professionals), Upcoming, History.
- `[id]`: one of my bookings, with Cancel (ConfirmSheet + swipe).
- `history`: all my past bookings, with filters.
- `pro/index`: search for a professional.
- `pro/[id]`: profile and the request form, with the hold countdown.
- `room`: 48-slot grid with a hold; slots go 3 a row on compact layouts.
- `location`: book a location; it can need approval.
- `requests`: read-only tracker with tabs Waiting · Approved · Rejected · Done · Marked done.
- `reviews/index` and `reviews/[key]`: pending reviews monitor, with WhatsApp `wa.me` reminders. No PDF.

Every screen redirects to `/` without its gate. Every write that messages someone or can't be undone goes through ConfirmSheet + SwipeToConfirm and says who is told. That covers request, book, approve, reject, cancel, approve & complete, and rate.

## For the integrator
- **Stack options:** none needed.
- **Fixture exports I added** (`demo/fixtures/booking.ts`): `roomStore`, `locationStore`, `roomSlotStore`, `locSlotStore`. IT desk (wave 2) should edit rooms and locations through these, so the booking grid agrees.
- **Routes I serve that other domains also touch:**
  - `GET /bookings`: adds `onlyFor` persona filtering.
  - `PUT /bookings/:id`: on approve it creates the task `atk_bk_<id>`; it refuses to reopen a rejected booking (409).
  - `DELETE /tasks/:id`.

  `work.ts` also registers `DELETE /tasks/:id` and comes first in the barrel, so work's handler answers. It does the same thing, so it can stay that way. Nobody else serves `/bookings`.
- **Demo data clash to settle:** `work.ts` seeds `bk-work-sanjay` (Sanjay, tomorrow 10:00–14:00). My seeds avoid that window. Approving a booking that overlaps it still shows the overlap warning, which is correct.
- **Shared kit / helpers on web (not mine):**
  - `ProjectPicker variant="field"` puts a `<button>` inside a `<button>` (the clear ×), so React DOM warns on web. I used `variant="row"`.
  - `SwipeToConfirm` can't be dragged by synthetic pointer input in the web preview. I confirmed the swipes by calling `onConfirm` in the preview.
- **Gate to promote** (if a second domain needs it): `canApproveBookings(role)` (dash.html:24112), now in `features/booking/access.ts`.
- **Notes on behaviour:**
  - Professional start and end times are in 15-minute steps. Location times are in 30-minute steps, as on the web. A date can't be picked on web: `@react-native-community/datetimepicker` has no web build. That's why the day chips exist (today to +7 for professionals; +8 chips plus a date field up to +30 for rooms and locations).
  - Reject sends `reason` and `rejectionReason`, so the WhatsApp carries the reason. It then deletes the booking's tasks, read from `/tasks` at that moment.
  - Approve & complete and Rate complete the linked task, using the booked length when no time was logged, or post a completed task. This is the same order as the web, and a failed later step is reported as partly done.
  - The room grid and location times ignore slot rows of rejected or cancelled bookings when reading them (`liveRoomSlots`/`liveLocSlots`, as BookingMatrix does at dash.html:27305). An approver's reject never deletes the row, so without this the time looked taken forever. This only reads; nothing is written.
  - Cancel deletes only the slot row whose `bookingId` matches. The web's loose fallback match is a self-heal, so it is not ported.
  - Holds are released on change, on screen blur, when the app goes to the background and on unmount. They are renewed every 60 s, and a 410 asks the person to pick again.

## Personas tested (web preview at 390×844 light and 320×700 dark)
- **Afzal Manager:**
  - Inbox Bookings (4 waiting, including an overlap warning).
  - Reject: reason → confirm → done.
  - Approve: confirm → done, and the task is created.
  - The tracker.
- **Afzal Admin:** the tracker (Farhan, cinematographer, and the Ramoji location booking).
- **Afzal HR:**
  - Book Farhan: overlap error, gap warning, hold countdown, request sent.
  - Room with a client purpose: required fields, booked.
  - Location: 30-minute gap error, request sent.
  - Approve & complete, rate, cancel.
- **Afzal App Manager:** Home card (5 bookings, 2 professionals), Pending reviews by professional and by employee, the group detail with WhatsApp reminders.
- **Afzal Professional:** hub with "Booked for you".
- **Afzal Super Admin:** Booking row in More; no Requests row; `/admin/booking/requests` redirects home.
- **Afzal IT Admin:** `/admin/booking/room` redirects home (no booking on the web).
