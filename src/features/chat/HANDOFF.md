# Chat (Meets text chat + attachments) — hand-off for the integrator

Wave 1, spec `docs/port/meets.md`. **Wave 3 update:** voice notes, Excel export and the thread's call button are now built; see `features/chatvoice/HANDOFF.md`. Calls themselves belong to the calls domain.

## Plug-ins filled
- [x] **More › links**: `chat.chat` "Chat" → `/chat` (tourId `more.chat`, order 10). It is labelled "Chat", not "Chat & calls", until calls ship.
- [x] **+ sheet**: `chat.new` "New chat" → `/chat/new`.
- [x] **Home header**: `useChatHeaderAction()` adds a round chat button with a red dot while `/meets/unread` has messages.
- [x] **MeetsWatcher**: owns the one live stream (`features/chat/realtime.ts`).
  - It opens the stream in the foreground and closes it in the background or on sign-out.
  - It feeds the query cache and refetches on every reconnect.
  - It shows a tappable notice for messages in a chat that isn't on screen.
  - When someone calls, it shows "X is calling · answer on the DASH website". It never sends a decline.
- [x] **Tour**: one step, `chat.chat`, on More's Chat link.
- [ ] **Inbox kinds**: none on purpose. Unread messages are a dot, not requests to decide.
- [ ] **Home cards**: none.

## Gate
- `canSeeMeets(user, tenant)` in `features/chat/access.ts` follows dash.html:7000: everyone signed in, master_admin included.
- It also honours the company switch `featureFlags.meets === false`. That is the spec's proposal, and **D6 is still open**. Flip `HONOUR_MEETS_SWITCH` if the owner says no.
- The group rules `canManageGroup`, `canRemoveMember`, `canLeaveGroup` and `canDeleteMessage` are copied from dash.html:7240 and :7269 and meets.js.

## Routes (all mine)
- `chat/index` — the list.
- `chat/new` — a person or a group; `?mode=group` opens the group form.
- `chat/[id]/index` — the thread.
- `chat/[id]/info` — members, add, remove, rename, export (.txt/.csv), leave.
- None needs Stack options.

## Needs from the integrator
- [ ] **TourTarget on IconPillGroup buttons.** `IconPillGroup` (src/ui/chrome.tsx) ignores `NavAction.tourId`, so the Home chat button (`tourId: 'home.chat'`) can't be a tour target yet. If the kit adds this, add a tour step on `home.chat`.
- [ ] **D4 `expo-audio`** for voice notes: recording and playback.
  - Today a voice note from the website shows as a "Voice message · 0:42" pill.
  - Tapping it downloads the file and opens the share sheet. The demo shows "Downloads are not available in the demo account".
- [ ] **Calls domain (wave 3).** The thread header has no phone button.
  - When calls ship, add a header slot or export from `features/calls`. I will add the button to `chat/[id]/index.tsx`, or the calls agent may if ownership moves.
  - `chatBus.callLive` (realtime.ts) silences message notices during a call. Set it from the call screen.
- [ ] **Message sends skip ConfirmSheet on purpose.** Chat messages are the conversation itself. A swipe for each message would make chat unusable.
  - These still use ConfirmSheet + SwipeToConfirm, and each says who sees what: delete for everyone, remove a member, leave a group.
- No new dependencies, fixture exports or app.json changes are needed.

## Demo (`src/demo/fixtures/chat.ts`)
- Every staff persona sees the same five chats. "Me" is DEMO_USER, so they follow the persona:
  - **Priya**: 2 unread, including a PDF.
  - **Creative Team**: 70+ messages over 4 days, so paging and day chips show. It has an image, a deleted message and 5 unread with the divider.
  - **Nimbus launch**: I own it, so rename, add and remove work.
  - **Lakshmi**: all read.
  - **Goa shoot – Sept**: I left it, so it is read-only and export works.
- About 2 s after you send a message, someone replies through `chatDemoEvents`, which stands in for the stream.
- `POST /meets/stream-ticket` answers `{error:'demo'}`. That is how realtime.ts knows to use the demo emitter.
- I did not register `/meets/meetings` (calls domain).

## Tested on
- Web preview at 390×844 and 320×700, light and dark.
- Personas: Afzal Manager and Afzal HR. Other agents switch the shared demo session, so I didn't switch roles myself. The gate is the same for every staff role.
- What I checked:
  - the list, unread pills and the Home dot;
  - the thread: paging, day chips, the "New messages" divider and the photo viewer;
  - sending, plus the demo reply arriving live;
  - the notice on Home, tapped;
  - a new direct chat and a new group;
  - rename and add people;
  - the read-only state for a former member;
  - the More link and "New chat" in the + sheet.
- Not driven end to end in the preview:
  - Swipe-to-confirm (delete, remove, leave). Synthetic drags don't reach the gesture handler there. The sheets open and show the right copy.
  - Picking files and exporting, which needs a file chooser and a download.
  - The real SSE client, because the demo has no network.
- Check these on a phone in Expo Go:
  - streaming with `expo/fetch`;
  - reconnecting after airplane mode;
  - background and foreground.
