# Calls (Meets audio / video) — hand-off for the integrator

Wave 3, spec `docs/port/meets.md` §1.4–1.5, §2.2, §4.3, §5.2. Existing endpoints only, no server change.

## Status: done (installed Android app, web build, demo)
- **Installed app (preview / store / development build):**
  - Real calls over `react-native-webrtc` **124.0.8**, with `@config-plugins/react-native-webrtc` **15.0.2** in `app.json`.
  - `lib/capabilities.ts` `loadWebRTC()` requires it through `lib/webrtc-module.ts`. The web build gets `webrtc-module.web.ts` (null), so Metro never resolves the package for the browser.
- **Expo Go:** unchanged. `hasWebRTC()` is false, so the call screen shows "Available in the installed app" with Decline / End and Close.
- **Web build:** unchanged. It uses the browser's own WebRTC, with the same protocol as dash.html.
- **Demo account:** unchanged. A simulated call runs everywhere. On a phone, the Speaker button also flips, with no sound.

### Speaker and call audio — `features/calls/call-service.ts` (`CallSession`)
- Uses `react-native-incall-manager` **4.3.0**, called through `NativeModules.InCallManager` (no package JS is bundled).
  - It is a legacy bridge module and runs through the New Architecture interop layer.
- **When a call connects:** `start('audio', auto=true)`. That gives communication audio mode, audio focus, the screen kept on, and a partial wake lock.
  - Voice calls start on the **earpiece**. The screen goes off when the phone is held to the ear (proximity, earpiece only).
  - A **wired or Bluetooth headset** takes over by itself. A headset plugged in while the speaker was forced on also wins.
  - **Camera on** moves the sound to the **speaker**, unless a headset is in or the user chose. Camera off moves it back.
- **Speaker button** in the call controls (`call/[meetingId].tsx`):
  - shown when `state.canSwitchSpeaker`;
  - 56 pt round control using the live tokens;
  - `setForceSpeakerphoneOn(1 | 0)`, where 0 means automatic: headset, Bluetooth, else the earpiece.
  - Chips say "Sound on Bluetooth" or "Sound on headset".
- **Android 12+:** "Nearby devices" (`BLUETOOTH_CONNECT`) is asked once, after the microphone and before `/join`, so Bluetooth headsets can carry calls. Saying no is fine.
- **Hang-up, removal, end, or the screen closing:** `stop()` gives the phone's audio back.

### Background calls — `modules/dash-call` (local Expo module, Kotlin, Android only)
- **`DashCallService`:** a foreground service of type **microphone**, plus **camera** while the camera is on (Android 11+).
  - The camera type is only asked for when the camera permission is granted. Otherwise the service falls back to microphone only.
  - Manifest: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `FOREGROUND_SERVICE_CAMERA`, `WAKE_LOCK`, `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH_CONNECT`. These are also listed in `app.json`.
  - The service sets `stopWithTask="true"`.
- **The notification:**
  - its own silent channel `dash-calls`, "Calls in progress";
  - ongoing, with the text "DASH call in progress" and "<call> · Tap to return", plus a call timer;
  - tapping it brings the app back to the call screen;
  - its **Leave call** action ends the call ("You left the call from the notification.").
- **Keep-alive:** React Native pauses JS timers in the background (JavaTimerManager) unless a headless JS task is running.
  - The module opens the headless task `DashCallKeepAlive` for the length of the call, so the heartbeat, stats and stream reconnects keep running past the 45 s presence limit.
  - A native **`onTick` every 5 s** also drives the heartbeat (`LiveEngine` heartbeats when one is due), so presence holds even if the task can't start.
- **Started** when the call goes live (`LiveEngine.startSession`).
- **Updated** when the camera turns on or off, and when the title loads.
- **Stopped:**
  - on hang-up, removal, end, or the screen closing (`LiveEngine.stop`);
  - when the React instance is destroyed (reload, fatal error: module `OnDestroy`);
  - when the app is swiped away from Recents (`onTaskRemoved` → JS leaves → service stops).
- **The chat stream** (call signals) stays open in the background while a call is open (`chat/meets-watcher.tsx`). It is closed if the call ends while the app is still in the background (`engine.ts`, `call-store.ts`).
- `expo-notifications` and its channels are untouched. The call channel is separate.

### Across networks
- Phones and browsers on networks that block direct routes need a TURN relay. The owner sets it up on the website host; the app needs no change.
- Owner guide: `docs/CALLS-TURN.md` (`MEETS_TURN_URLS`, `MEETS_TURN_SECRET`, ExpressTURN Premium or coturn).
- The Calls screen shows "Other networks: Relay on / Direct only". IT and super admins see which setting is missing.

## Plug-ins filled
- [x] **More › links**: `calls.calls` "Calls" → `/call`. tourId `more.calls`, order 11, right after Chat.
- [x] **+ sheet**: `calls.start` "Start call" → `/call?start=1`, which opens the people picker. Order 120; the integrator sets the cap.
- [x] **Tour**: one step, `calls.calls`, on More's Calls link.
- [x] **Global ring**: `<IncomingCallWatcher/>` is mounted in `(app)/_layout.tsx`. Chat's "Calls aren't in the app yet" notice is gone.
- [x] **Chat thread phone button**: StartCallSheet in a chat.
- [ ] **Inbox kinds**: none on purpose. The server keeps no missed calls (`missedCalls: 0`).
- [ ] **Home cards**: none.

## Routes (mine)
- `call/index` — Calls screen:
  - start a call from my chats (current member only) or with anyone in the directory (their direct chat is opened on confirm);
  - "Test call alert" (website `fireTestCallAlert`);
  - limits and relay state from `/meets/calls/config`.
- `call/[meetingId]` — the call screen. It uses the Stack options already in `_layout.tsx` (fullScreenModal, no gesture, from the bottom).
  - Params: `meetingId`, optional `title`.
  - Controls: Mute, Camera, Flip (camera on), Speaker (installed app and demo on a phone), Leave.
  - Expo Go: the call's details, "Available in the installed app", Decline (ConfirmSheet + swipe) or End for everyone if I host, and Close.

## Safety rules applied
- These use ConfirmSheet + SwipeToConfirm, and each says who is told and that no email or WhatsApp is sent:
  - start a call ("Rings X … for 45 seconds");
  - decline;
  - host "Add person" (rings them);
  - Remove ("can't rejoin");
  - End for everyone ("can't be undone").
- Answering is "Swipe to answer" on the ring sheet.
- Single taps, all reversible: Leave, mute, camera, speaker, and the screen-share switch.
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
- No media: the chips say "DEMO · NO SOUND SENT", and the camera shows "Camera on · not in the demo". No foreground service starts for the demo.

## Tested
- `npx tsc --noEmit` and `npx expo lint` are clean for the whole app.
- `npx expo export --platform android` contains react-native-webrtc and the call session. `--platform web` builds without it.
- Metro: web preview `/` is 200, and the android `entry.bundle` is 200.
- EAS preview build (Android) — see the commit log for the build that passed.
- **Needs a device and the website:**
  - phone ↔ Chrome and phone ↔ phone;
  - speaker, earpiece and headset switching;
  - leaving the app for more than 45 s mid-call;
  - TURN on mobile data, once the relay is set (`docs/CALLS-TURN.md`).
