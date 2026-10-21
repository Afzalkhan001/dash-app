# Desk QR — hand-off (wave 3: real QR codes, pass scanning, kiosk keep-awake)

Spec: `docs/port/visitor-desk.md` §4.2 C/D, §5. No server or DB change. It uses existing endpoints only:
`GET /visitors/qr`, `POST /public/visit/<t>/<token>/invite`, and `…/invite/<id>/arrive`. Expo Go safe:
expo-camera, expo-print, expo-keep-awake and react-native-qrcode-svg are all in Expo Go. No WebRTC.

## What was built
- **Real QR codes** (`features/deskqr/qr.tsx`, react-native-qrcode-svg). They are black on white in both
  themes, with a quiet zone. `qrSvgMarkup()` draws the same code as SVG text for printing.
  - Check-in QR screen (`admin/desk/qr.tsx`, title "Check-in QR"): the QR of `DASH_URL + path`, then
    **Print** (expo-print `printAsync`) and **Poster PDF** (`printToFileAsync` → share sheet). The poster
    uses the web's words (dash.html:35788). On web both open a new tab and print. Share link, Open page
    and Make a new link are unchanged. The old "poster is on the website" banner was removed.
  - Kiosk start screen: "Check in on your own phone" now shows the QR of the link.
- **Visitor passes with a QR** (`features/deskqr/pass-sheet.tsx`, `pass.ts`). The QR holds only
  `DASHPASS:<6-digit code>`, and the server still checks the code. Desk Invites gets a "Passes with a QR"
  ListCard listing active upcoming invites → sheet with the QR, the code, the details, **Print** and
  **Share pass** (a PDF made on the phone). The desk chooses the recipient in the share sheet; DASH sends
  nothing. The server's own pass PNG (code as text only) is unchanged.
- **Scan a pass at reception**, new route `admin/desk/scan.tsx` (`DESKQR_ROUTES.scan`):
  1. The back-camera scanner (`features/deskqr/camera.tsx` QrScanner), or the 6-digit code typed into OtpBoxes.
  2. `POST …/invite` with the desk's own link, showing the server's words for a wrong or used code.
  3. A guest photo, which the arrival requires: the live camera (PhotoCapture), the camera app, or a chosen photo.
  4. ConfirmSheet + SwipeToConfirm, naming the host who gets the WhatsApp → `…/arrive`. The board and log
     are refreshed, then "Scan the next pass". A QR that isn't a pass gets a plain message. A changed link
     says "pull down to refresh".
- **Kiosk**:
  - `useKeepAwake('dash-kiosk')` while the kiosk runs, including on the "link changed" screen. The intro
    tip was updated to match.
  - The code step has "Scan my pass instead": the front camera reads the pass QR and the normal code check runs.
  - The selfie step uses a **live front-camera preview** with a round shutter. "Use the camera app instead"
    and "Choose a photo" stay as fallbacks. The photo is shrunk the web's way (`shrinkPhoto`, now exported
    from `features/desk/kiosk/selfie.ts`).
- **Leave kiosk with device auth**: already in place from wave 2 (`kiosk/exit-sheet.tsx`: the phone's lock
  first via expo-local-authentication, else the DASH password). Not changed.

## Gate
`features/deskqr/access.ts` `canScanPass = canRunDesk && canSeeKiosk`. Scanning a pass does exactly what
the kiosk's invite path does, so it is open to the same people: visitor_manager, plus super_admin through
visitors-desk. CEO and COO get nothing. The scan route re-checks the gate and `Redirect`s home.

## Filled extension points (in `features/desk/nav.ts`, already registered)
- [x] More › Reception `desk.scan` "Scan a pass" (order 17), both desk roles. `desk.qr` is renamed "Check-in QR".
- [x] + sheet `desk.scan` "Scan a pass" (Visitor Manager). **Integrator:** place it in `CREATE_ORDER`
  after "Start kiosk".
- [x] Board: a "Scan a pass" row under the chips. The header action is relabelled "Check-in QR".
  Desk Invites: a header action "Scan a pass".
- No new Inbox kinds. No new tour steps. Optional: a `desk.scan` step for the Visitor Manager.

## Needs from the integrator
- [ ] Register `src/demo/fixtures/deskqr.ts` in `src/demo/fixtures/index.ts` (`deskqrRoutes`, an empty list).
  Importing it seeds two more of today's invites for the demo person:
  - Rahul Menon, code 361904, 11:00–12:00
  - Ananya Iyer, code 905218, 17:00–18:00

  Until it is imported, only Kavya Reddy (482615, from desk.ts) is there.
- [ ] No `features/deskqr/nav|inbox|tour.ts`: the rows live in desk's nav.ts, so `domains.ts` needs nothing.
- [ ] `docs/DEMO-ACCOUNTS.md` and the persona note for Afzal Visitor Manager. Add: "Check-in QR + poster,
  QR passes, Scan a pass, kiosk keeps the screen on".
- [ ] `role-tours.ts` copy that says the QR poster is web-only, if any is left.
- [ ] Rate limits are per network address, as on the web: 12 code checks or arrivals per 10 min. A busy
  reception desk can hit 429; the screen shows the server's words.
- Stack options: `admin/desk/scan` is a normal pushed screen. The camera opens in its own full-screen Modal.

## Files
New:
- `features/deskqr/` `qr.tsx`, `qr-matrix.d.ts`, `pass.ts`, `print.ts`, `camera.tsx`, `pass-sheet.tsx`,
  `access.ts`, `routes.ts`
- `app/(app)/admin/desk/scan.tsx`
- `demo/fixtures/deskqr.ts`

Changed:
- `app/(app)/admin/desk/` `qr.tsx`, `kiosk.tsx`, `invites.tsx`, `index.tsx`
- `features/desk/` `nav.ts`, `kiosk/wizard.tsx`, `kiosk/selfie.ts` (exports `shrinkPhoto`)

## Tested
- `npx tsc --noEmit` and `npx expo lint` are clean.
- `npx expo export --platform web` bundles. The QR encoder was checked in node: a pass is a 21×21 QR, the
  link is 33×33.
- **Not tested on a running app yet.** The shared 8090 server (pid 40472) never served a bundle in this run.
  It hung, then returned 500, and the page stayed blank. It needs `expo start --web --port 8090 --clear`.
  The personas below are the checklist for the first run after that.
- Personas to test:
  - Afzal Visitor Manager: Check-in QR, Invites › Passes with a QR, Scan a pass (type 482615 → photo →
    swipe), Kiosk › "Scan my pass instead".
  - Afzal Super Admin: the More › Reception rows.
  - Afzal Employee: `/admin/desk/scan` redirects home.
