# Calls (Meets audio / video) — hand-off for the integrator

Wave 3, spec `docs/port/meets.md` §1.4–1.5, §2.2, §4.3, §5.2. Existing endpoints only. No dependency or app.json change.

## Status of WebRTC
- **react-native-webrtc is not installed** (deps report: no release is documented for SDK 57 / RN 0.86).
- So an installed app **and** Expo Go show "Available in the installed app" for now. The engine is fully written and wired.
- The **web build** runs real calls today on the browser's own WebRTC, with the same protocol as dash.html.
- **The demo account** gets a full simulated call on every platform, Expo Go included.
- **To switch calls on in a dev build:**
  1. Install a react-native-webrtc pairing that is documented for SDK 57, plus its config plugin, and add camera and microphone permissions in `app.json`.
  2. Uncomment the `require('react-native-webrtc')` in `src/lib/capabilities.ts` `loadWebRTC()`.
  3. Nothing in `features/calls` changes. `rtc.ts` picks up `RTCPeerConnection`, `mediaDevices`, `MediaStream` and `RTCView`.
  4. Background audio (iOS `UIBackgroundModes: audio, voip`) and a speaker toggle (`react-native-incall-manager`) are not done. Without them, presence lapses after 45 s in the background.

## Plug-ins filled
- [x] **More › links**: `calls.calls` "Calls" → `/call`. tourId `more.calls`, order 11, right after Chat.
- [x] **+ sheet**: `calls.start` "Start call" → `/call?start=1`, which opens the people picker. Order 120; the integrator sets the cap.
- [x] **Tour**: one step, `calls.calls`, on More's Calls link.
- [ ] **Inbox kinds**: none on purpose. The server keeps no missed calls (`missedCalls: 0`).
- [ ] **Home cards**: none.

## Routes (mine)
- `call/index` — Calls screen:
  - start a call from my chats (current member only) or with anyone in the directory (their direct chat is opened on confirm);
  - "Test call alert" (website `fireTestCallAlert`);
  - limits from `/meets/calls/config`.
- `call/[meetingId]` — the call screen. It uses the Stack options already in `_layout.tsx` (fullScreenModal, no gesture, from the bottom).
  - Params: `meetingId`, optional `title`.
  - Live, demo, or the Expo Go fallback: the call's details, "Available in the installed app", Decline (ConfirmSheet + swipe) or End for everyone if I host, and Close.

## Needs from the integrator / chat owner
- [ ] **Mount `<IncomingCallWatcher/>`** (`features/calls/incoming-call.tsx`) once, next to `<MeetsWatcher/>` in `app/(app)/_layout.tsx`.
  - Only the first watcher mounted shows a ring. The Calls screen also mounts one, so the demo ring works before the global one is mounted; mounting the global one is still required.
- [ ] **Chat watcher** (`features/chat/meets-watcher.tsx`, case `'meeting'`): drop the "Calls aren't in the app yet. Answer on the DASH website." notice once the ring above is mounted. Otherwise both show.
- [ ] **Chat thread phone button** (`app/(app)/chat/[id]/index.tsx`), shown when `canStartCall(detail)` from `features/calls/access` (website: `canPost`, dash.html:10245):
  ```tsx
  import { CALL_ICON, StartCallSheet, type CallTarget } from '@/features/calls/start-call';
  const [call, setCall] = useState<CallTarget | null>(null);
  // NavHeader action:
  { key: 'call', icon: CALL_ICON, label: 'Start call', onPress: () => setCall({ kind: 'conversation', conversationId: id, title, memberCount: current.length, group }) }
  <StartCallSheet target={call} onClose={() => setCall(null)} />
  ```
  In Expo Go the sheet explains instead of calling.
- [ ] `chatBus.callLive` is set by `features/calls/call-store.ts` while a call is open. No action is needed.
- No fixture exports, Stack options, dependencies or app.json changes needed.

## Safety rules applied
- These use ConfirmSheet + SwipeToConfirm, and each says who is told and that no email or WhatsApp is sent:
  - start a call ("Rings X … for 45 seconds");
  - decline;
  - host "Add person" (rings them);
  - Remove ("can't rejoin");
  - End for everyone ("can't be undone").
- Answering is "Swipe to answer" on the ring sheet. Leave, mute, camera and the screen-share switch are single taps; all of them are reversible.
- Role rules are the website's. Everyone signed in can call (chat's `canSeeMeets`). Host controls follow `isHost` from `/join`, and Remove is never offered for yourself.

## Demo (`src/demo/fixtures/calls.ts`)
- Covers every `/meets/meetings*` route and `/meets/calls/config`. Each one keeps meets.js's host, removed and ended checks.
- **Start a call** (any persona) from any chat:
  - the other members show as "Ringing…";
  - up to two of them "answer" after about 3 s and 6 s;
  - the rest show "didn't answer" after 45 s.
- **Host menu**:
  - Add person rings them, and they join after about 4 s;
  - Remove and End for everyone go through the demo API.
- **Test call alert** on the Calls screen: Priya Sharma calls from the "Priya Sharma" chat (`c-priya`).
  - Answer joins her call, where you are not the host.
  - Decline sends the demo decline.
- No media: the chips say "DEMO · NO SOUND SENT", and the camera shows "Camera on · not in the demo".

## Tested
- `npx tsc --noEmit` and `npx expo lint` are clean for the whole app.
- `npx expo export --platform web` builds, including the new routes.
- **Not driven in the preview.** `localhost:8090` stays blank: the bundle request never completes, which is the stale-server blocker in the deps report.
  - I couldn't restart it, so the screens are untested in the browser at 390/320 in light and dark.
  - Please re-run as Afzal Employee (start a call from Priya's chat; Test call alert → answer and decline) and Afzal Manager (host menu) once the server is restarted.
- **Needs a device and the website:**
  - phone ↔ Chrome and phone ↔ phone, once WebRTC is installed;
  - route and TURN on mobile data (spec R3/R5);
  - web-build calls against the real server.
