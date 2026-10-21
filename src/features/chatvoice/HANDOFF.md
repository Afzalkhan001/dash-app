# Chat voice notes, Excel export and call entry: hand-off for the integrator

Wave 3, spec `docs/port/meets.md` §1.3, §4.2, §5.3 and §7. This extends the chat domain (`features/chat/HANDOFF.md`).

## Built
- **Record a voice note** (`chatvoice/recorder.tsx`, opened from the composer's mic):
  - The mic shows while the draft is empty and nothing is staged. Recording starts with a red dot and a timer, with Discard and Stop.
  - It stops by itself at 2 minutes, like the website. Clips over 3 MB are refused before upload.
  - The clip is then staged with Play, Discard and Send. Nothing uploads until Send.
  - Phones send `audio/mp4` `.m4a`; the web build sends `audio/webm`. The name matches the website: `Voice message (m:ss).ext`.
  - The mic is refused while `chatBus.callLive` is set, because the website disables it during a call.
- **Play voice notes** (`chatvoice/voice-player.tsx`):
  - Each thread has one shared player, so starting a note stops the previous one. Bubbles show a play/pause pill with progress and m:ss.
  - A source is either my own clip, played from the phone (`clips.ts`), or `GET …/attachment?inline=1` with the Bearer header.
  - On iOS, WebM notes from the website can't be played. Their pill opens the share sheet instead (spec R8).
- **Excel export** (`chatvoice/excel.ts`): Chat details › Export now offers Excel (.xlsx) alongside .txt and .csv. Same workbook as the website: one sheet "Messages", columns Timestamp, Sender, Message; file `DASH_Meets_<name>_<IST date>`. SheetJS is lazy-loaded as its own chunk.
- **Call button** (reviewer fix): the thread header's phone button now opens the calls domain's `StartCallSheet` (`features/calls/start-call.tsx`), shown when `canStartCall` (website: `canPost`).
  - It confirms with a swipe and says who rings (no email or WhatsApp), runs a demo call in the demo, real calls on the web build, and "Available in the installed app" in Expo Go.
  - `chatvoice/call-entry.tsx` is now an empty stub (nothing imports it); the integrator can remove it.
- **Recorder and calls:** a take in progress stops (and stays staged) when a call opens (`useInCall`), like the website. Playing a note while recording is refused with a toast. A take under 1 second is dropped, like the website.
- **Not built, because neither the server nor the website has them:** reactions, message edits, in-thread search, pinned messages and read receipts.
  - meets.js has no routes for them, and `editedAt` is never set.
  - Chat-list search already exists (wave 1).

## Needs from the integrator
- [ ] **Register `chatvoiceRoutes`** from `src/demo/fixtures/chatvoice.ts` in `src/demo/fixtures/index.ts`, **before `...chatRoutes`**. It wraps chat's GET `…/messages` to add 4 demo voice notes.
- Calls: nothing needed. The thread uses `StartCallSheet`, and `features/calls/call-store.ts` already sets `chatBus.callLive`.
- No menu rows, + actions, Inbox kinds or tour steps were added, so there are no nav/inbox/tour/access files to register.
- No new dependencies: expo-audio, expo-file-system and xlsx are already installed. The microphone text is in app.json from the integrator.

## Demo (`src/demo/fixtures/chatvoice.ts`)
- **Creative Team** (2 days ago):
  - Sneha, 0:38, m4a;
  - Rahul, 0:12, WebM, recorded on the website (the iOS fallback);
  - one of mine, 0:09.
- **Lakshmi Prasad**: Lakshmi, 0:21.
- The demo can't serve audio bytes. Playing someone else's note shows the toast "Voice messages from others can't play in the demo account. Record one and play it back."
- A note recorded in the demo is sent through chat's POST and plays back from the phone.
- My own demo note (Creative Team, 0:09) can be deleted for everyone; the fixture handles `DELETE …/messages/vn-*`.

## Tested
- `npx tsc --noEmit` and `npx expo lint` are clean.
- `npx expo export` builds for both web and Android. xlsx comes out as its own lazy web chunk.
- **Not driven in the preview.** The 8090 server is still stale: the page stays blank and the bundle request returns 500 or never finishes, as the integrator reported. It needs `--clear` and a restart.
- Check after the restart, as Afzal Employee and Afzal Manager, at 390×844 and 320×700, in light and dark:
  - mic → record → stop → play back → send;
  - discard;
  - the 2-minute auto-stop;
  - a demo note's toast;
  - the phone button sheet;
  - Export › Excel.
- Check on a phone in Expo Go:
  - the microphone permission prompt;
  - playback through the speaker on iOS (the recorder resets `allowsRecording:false` after it stops);
  - streaming a real m4a with the Bearer header.
