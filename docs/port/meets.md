# Port plan: Meets (team chat + calls)

Read-only research, 21 Oct 2026. Sources: `dash.html` (website), `meets.js` (all `/api/meets/*` routes),
`server.js` (auth gate and how Meets is registered), `turn.js` / `stun.js`, `claude/meets.md` (the
original design log), and the mobile app under `mobile/src`.

How sure each claim is:
- **Confirmed**: read in the code.
- **Likely**: inferred, not run.
- **Unknown**: needs a test on a real device.

**Bottom line**
- **Chat** can be built in **Expo Go** today with **no server change**.
  - Live updates use the SSE stream, read with `expo/fetch` streaming. That is already the global
    `fetch` on native and is included in Expo Go.
  - Voice notes need one Expo SDK package, `expo-audio`. It is also in Expo Go.
- **Calls** need a **development build**: `react-native-webrtc` plus `@config-plugins/react-native-webrtc`
  plus `expo-dev-client`. Neither native module is in Expo Go.
  - The server already provides everything a call needs: signalling, presence, invite, remove, end,
    and the ICE/TURN config.
- **One thing truly needs a server change: push.** Without it:
  - a message reaches the phone only while the app is open (foreground);
  - a call rings only while the app is open.

---

## 1. Website features: where, who, what

### 1.1 Who sees Meets (gates)

| Gate | Where | What it does |
| --- | --- | --- |
| `canSeeMeetsNav(user)` returns `!!user` | dash.html:7000 | Everyone who is signed in, in every role. |
| `FEATURE_REGISTRY` entry `{id:'meets', label:'Meets (chat & calls)'}` | dash.html:1394 | Adds a company switch to Config. |
| `navFor` filter, `tenantFeatureOn(t, item.id)` | dash.html:1407, 1506 | Hides switched-off nav items. |
| Nav comment | dash.html:1443–1447 | Says Meets is reached from the floating launcher, **not** the sidebar. |
| Launcher and call watcher mounts | dash.html:30523 (`<MeetsCallWatcher>`), 30525 (`<MeetsLauncher>`) | Mounted for every signed-in user, above the router. |
| `CROSS_ROLE_VIEWS.meets` | dash.html:30479 | Maps the `#meets` route to `<MeetsHub>`, but only when `inNav` holds (dash.html:30504). |
| Server auth | server.js:1446–1505 (auth gate), server.js:1765–1786 (Meets registered after the gate) | Every `/api/meets/*` route needs a staff Bearer session. No route uses `requireRole`. |
| Stream exception | server.js:1362 (in `PUBLIC_API`) | `GET /api/meets/stream` is public. It carries its own ticket. |
| Vendor tokens | server.js:1468 | A vendor's token gets 401 from the gate, because `subject_kind` is not `'user'`. |

Findings about these gates:

- **The Meets switch hides nothing (Confirmed).** No nav list ever contains `id:'meets'`, so the
  `tenantFeatureOn` filter has nothing to remove. The launcher (dash.html:8828) and the server never
  check the switch either.
- **"Open full page" probably does not open Meets (Likely).** Because `meets` is never in `navFor`,
  `inNav` is false for `#meets`. The router then falls through to the role's own view. For staff that
  is `EmpViews` (dash.html:26177), which has no `meets` case and shows the role's home page.
- **Server-side permission is membership only.** `canAccessConversation()` and `requireMember()`
  (meets.js:288, 311) decide everything for chat. `canJoinMeeting()` (meets.js:1849) decides
  everything for calls.

### 1.2 Floating launcher: `MeetsLauncher` (dash.html:8828–~9230; same code as `meets_launcher.jsx`)

1. A round button bottom-right (`MeetsBot` icon, dash.html:8773). It carries an unread badge from
   `GET /meets/unread` (dash.html:8857).
2. The badge refreshes:
   - every 60 s;
   - when the window gets focus;
   - within 400 ms of any stream event (dash.html:8888–8923).
3. Clicking opens a panel holding `<MeetsHub embedded>` (dash.html:9170).
   - On desktop the panel can be dragged and resized; its size and position are kept in
     `localStorage` under `meetsPanelBox`.
   - Below 760 px wide it is full screen.
4. The panel has an "Open full page" link to `#meets` (see the finding in 1.1).

### 1.3 Chat hub: `MeetsHub` (dash.html:9768–10393)

**Toolbar** (dash.html:10127–10146)
- **Test call alert**: fires a sample notification and ringtone (`fireTestCallAlert`, dash.html:8509),
  then shows OS-specific help (dash.html:10148–10184).
- **New chat**, **New group**.

**Conversation list** (dash.html:10192–10227), loaded by `GET /meets/conversations`
- A search box filters by conversation name and by the names of other members (dash.html:9940).
- Each row shows:
  - an initials avatar;
  - the name (a direct chat is named after the other person);
  - the time of the last message (`mtWhen`);
  - a preview line: "you left this group", "message deleted", "Sender: body", or "N members" /
    "No messages yet";
  - an unread pill that reads 99+ at most.
- Live updates (dash.html:9911–9931):
  - a new message updates its row in place (`bumpRow`);
  - a deleted message, or any `conversation` / `members` / `meeting` / `meeting-ended` event,
    reloads the whole list.

**Thread** (dash.html:10230–10380)
- **Header**: avatar, name, "N members" or "Direct message", and "· you left this group" when it applies.
- **Header buttons**:

  | Button | Shown when | What it does |
  | --- | --- | --- |
  | Start call | `canPost` | `POST /meets/meetings {conversationId}`, then opens the call window (dash.html:10096). |
  | Members | Groups only | Opens `MeetsMembersModal`. |
  | Excel / .txt | Always | Export, see below. |
  | Leave | Group, and `canPost` | `confirm()`, then `DELETE /members/<me>` (dash.html:10088). |

- **History**:
  - Loads 50 messages at a time, newest first, and reverses them for display (dash.html:9828).
  - "Load earlier messages" pages with `?before=<nextBefore>`.
- **Separators**:
  - Day labels: Today, Yesterday, then dd MMM yyyy.
  - A red **"New messages"** divider, placed from the read mark captured once when the thread opens
    (`meetsReadMark` and `meetsFirstUnreadId`, dash.html:7117–7125).
  - The thread scrolls to that divider once, otherwise to the bottom (dash.html:9897).
- **Bubbles**:
  - Mine on the right in brand colour; others on the left with an avatar.
  - The sender's name shows in groups.
  - The text is a text node (XSS-safe; `test/meets.test.js` checks this).
- **Attachments**:
  - Images and voice notes show inline through `MeetsInlineMedia` (dash.html:7035). Its fetch is
    lazy (IntersectionObserver) and calls `GET .../attachment?inline=1` with the bearer token, then
    uses a blob URL.
  - Other files show a download row that calls `openFile` (dash.html:10060), which fetches a blob
    and saves it with `a.download`.
  - When an image or voice note has no caption, its body equals its filename and the text is hidden.
- **Delete my message**: a "delete" link under my own bubbles, then `confirm("Delete this message for
  everyone?")`, then `DELETE .../messages/:id` (dash.html:10081).
- **Mark read** (dash.html:9881–9895) calls `POST /conversations/:id/read`:
  - on open, once the read mark has been captured;
  - when a message lands in the open thread;
  - when the tab becomes visible again.

  `meetsBus.viewing` stops the badge and chime for the thread on screen.

**Composer** (dash.html:10316–10377), shown only when `canPost`. Otherwise: "You are no longer a
member… You can still read and export".
- **📎 any file**:
  - The picker uses `accept` from `GET /meets/attachments/policy`.
  - Size and type are checked on the client.
  - The file is read with FileReader into a data URL and staged (dash.html:9964).
- **🖼 image**: images only.
- **🎤 voice note** (dash.html:9996–10050):
  - Uses `MediaRecorder` (webm/opus on Chrome, mp4 on Safari); 2 minutes maximum.
  - Disabled during a call.
  - The finished clip is staged with play / Send / Discard.
  - Its name is `"Voice message (m:ss).webm|m4a"`.
- **Text**: a textarea of up to 4000 characters. Enter sends, Shift+Enter adds a new line. Pasting a
  file stages it.
- **Send** (dash.html:9946): `POST .../messages {body, attachment?:{name,type,dataUrl}}`. The new
  message is added to the thread at once.

**Export** (dash.html:10104)
- Calls `GET /conversations/:id/export`.
- `.txt` saves `r.txt` as is.
- Excel uses `window.XLSX` (SheetJS on the page) with columns Timestamp, Sender and Message.
- If the export was capped, the page warns that it was truncated.

**Modals**
- `MeetsNewModal` (dash.html:7176):
  - Direct mode picks one person; group mode needs a name (≤ 100 characters) and picks several.
  - `POST /meets/conversations`.
  - If the direct chat already exists, the server returns it.
- `MeetsPeoplePicker` (dash.html:7140): searches name, email and department; shows at most 200.
- `MeetsMembersModal` (dash.html:7224):
  - Lists current members with role and department.
  - The owner or an admin can **Add people** (`POST .../members`).
  - The owner or an admin can **Remove** (`confirm()`, then `DELETE .../members/:userId`). The owner
    cannot be removed.
- **Not on the website**: renaming a group. `PATCH /meets/conversations/:id` exists on the server
  (meets.js:947) but no UI calls it.

### 1.4 Ringing and alerts: `MeetsCallWatcher` (dash.html:8612–8683)

**The one SSE connection for the whole app** (dash.html:8626–8646)
1. `POST /meets/stream-ticket`.
2. `new EventSource(API+'/meets/stream?ticket=…')`.
3. Every event is re-published on `meetsBus` (dash.html:7329). The events are: `message`,
   `message-deleted`, `conversation`, `members`, `read`, `meeting`, `meeting-started`,
   `meeting-ended`, and the `CALL_EVENTS` (dash.html:7341).
4. On error it reconnects after 5 s with a fresh ticket. If the ticket itself fails, it retries after 15 s.

**Ringing**
- A `meeting` event (sent to the other members only) sets the ring.
- `MeetsIncomingCall` (dash.html:8380):
  - shows a full-screen card with avatar, name, department and title;
  - offers **Decline** and **Accept**;
  - gives up after a 45 s countdown (`RING_SECONDS`, dash.html:8127).
- While ringing it also:
  - plays an oscillator ringtone (dash.html:8137);
  - flashes the tab title (dash.html:8370);
  - turns the favicon red (dash.html:8332);
  - shows a desktop Notification (dash.html:8210).
- **Accept** opens `MeetsCall` and navigates to `meets`.
- **Decline** that the person clicked sends `POST /meetings/:id/decline`. A ring that simply times
  out sends nothing.
- `meeting-started` (my own other tab) and `meeting-ended` clear the ring.

**Message alerts** (`useMessageAlert`, dash.html:8281)
- A chime (dash.html:8248) plus a desktop Notification, at most one every 2.5 s.
- Silent when:
  - the message is my own;
  - a call is live;
  - the thread is on screen.
- Clicking the notification opens that chat.

**Permission prompt**: `MeetsNotifyPrompt` (dash.html:8558) asks to turn on desktop notifications.
"Not now" hides it for a week.

### 1.5 Calls: `MeetsCall` (dash.html:7350–7942), plus `MeetsPeerTile` (8019) and `MeetsAddPersonModal` (7974)

This is peer-to-peer WebRTC as a mesh. There is no SFU.

**Joining**
1. Ask for the microphone with `getUserMedia({audio:true})`. The camera is off by default.
2. `POST /meetings/:id/join`. The response carries `iceServers`, `self`, `peers`, `expected`,
   `isHost`, `screenShareAllowed` and `maxParticipants`.
3. Heartbeat `POST /heartbeat` every `heartbeatSeconds` (15). Each heartbeat reconciles the peer list:
   - calls anyone new;
   - drops anyone who is no longer listed.

**Who calls whom** (`callsFirst`, dash.html:7344)
- The earlier `joinedAt` places the call. A tie breaks on the lower user id.
- The caller is the impolite side. "Perfect negotiation" settles offers that cross (dash.html:7554–7587).

**Three fixed media slots** (dash.html:7314)
- The **caller** creates three transceivers in this order: 0 audio, 1 camera, 2 screen
  (dash.html:7467–7473).
- Camera and screen go on and off with `replaceTrack`. There is no renegotiation.
- The answerer must set each slot's `direction='sendrecv'` (dash.html:7446). Without this, the
  answerer is silently mute and blind.

**Signal envelope**
- Sent with `POST /signal {to, kind, payload}`.
- `kind` is one of `offer`, `answer`, `ice`, `bye`, `state`.
- `payload` is:
  - `pc.localDescription` for an offer or answer;
  - `candidate.toJSON()` for ICE;
  - `{mic, cam, screen}` for `state`.
- Signals arrive over SSE as `meet-signal`, with `from` written by the server.

**If a connection fails**: one retry with `iceTransportPolicy:'relay'` and `restartIce` (only by the
impolite side), and only when a TURN server is configured. After that the peer is marked dead and a
red bar appears (dash.html:7483–7500, 7869).

**Controls**
- Mute, Camera on/off, Share screen (desktop only, `getDisplayMedia`), Leave.
- Host only:
  - **+ Add person** (picker filled from `/meets/directory`), which sends `POST /invite`;
  - **Allow / Disable screen share**, which sends `PATCH /meetings/:id {screenShareAllowed}`;
  - **Remove** on a tile, after `confirm()`, which sends `POST /remove`;
  - **End for everyone**, after `confirm()`, which sends `POST /end`.

**Tiles**
- Layout:
  - A stage plus a strip of small tiles. A shared screen auto-pins to the stage.
  - Clicking a tile pins it. Fullscreen is available.
- Audio uses its own `<audio>` element per peer. When autoplay is blocked, the tile shows a
  "Click to hear" button.
- Each tile shows:
  - "connecting… / live · route / no route";
  - the route type from `getStats`, polled every 3 s (dash.html:7376);
  - "muted" from the peer's `state` signal.

**Leaving**: cleanup sends `bye` to every peer, closes the connections, stops the tracks and posts
`/leave` (dash.html:7655–7662).

---

## 2. Endpoints (all in `meets.js`; every one sits behind the staff Bearer gate except `/stream`)

No route uses `requireRole`. Access is decided by membership:
- `requireMember` (meets.js:311): "current" for writes, "current or former" for reads; group owner
  or admin for management.
- `canJoinMeeting` (meets.js:1849) for calls.

Errors come back as `{error}`. A missing migration gives a 503 that names the `sql/meets*.sql` file
(meets.js:383).

### 2.1 Chat

| Method and path | meets.js | Check | Request | Response (fields the UI reads) | Side effects |
| --- | --- | --- | --- | --- | --- |
| GET `/api/meets/health` | 568 | Any user | — | `chatReady, callsReady, filesReady, unreadReady, driveConfigured, driveMissing, missingTables[], runThese[]` | None. The website does not call it. |
| GET `/api/meets/directory` | 610 | Any user | — | `{people:[{id,name,email,dept,jobTitle}]}`: active users minus me, sorted by name | None. Cached 60 s. **No tenant filter** (risk R6). |
| GET `/api/meets/conversations` | 675 | Own memberships | — | `{conversations:[{id,type:'direct'\|'group',name,createdAt,myRole,leftAt,unread(≤99),lastReadAt,memberCount,others[≤8 publicUser],lastMessage:{id,senderId,senderName,body(≤140)\|null,deleted,createdAt}\|null}]}`, newest activity first | None. |
| GET `/api/meets/unread` | 779 | Own | — | `{messages, people, missedCalls:0, conversations:{[id]:n}, capped}` | None. Gives 503 if `meets_read_state` is missing. |
| POST `/api/meets/conversations/:id/read` | 809 | Member, current or former | `{}` | `{conversationId,lastReadAt}` | Upsert into `meets_read_state`. SSE `read` to my own other sessions. |
| POST `/api/meets/conversations` | 825 | Any user. Rate limit 10/min. | `{type:'direct', memberIds:[id]}` or `{type:'group', name(1–100), memberIds:[…]}`, at most 200 people | `{conversation:{id,type,name,created_at,existed}}` | Inserts the conversation and its members. Audit row `conversation.create`. SSE `conversation` to everyone involved. A direct chat that already exists is returned with `existed:true`. |
| GET `/api/meets/conversations/:id` | 906 | Member, current or former | — | `{conversation:{id,type,name,created_by,created_at,myRole,leftAt,canPost,lastReadAt}, members:[{id,name,email,dept,jobTitle,role,joinedAt,leftAt}]}` | None. |
| PATCH `/api/meets/conversations/:id` | 947 | Current owner or admin. Groups only. | `{name}` | `{conversation:{id,type,name}}` | Audit `conversation.rename`. SSE `conversation`. **No web UI.** |
| POST `/api/meets/conversations/:id/members` | 968 | Current owner or admin. Groups only. | `{memberIds:[…]}` | `{added:[publicUser]}` | Upsert members. A person re-added gets a fresh `joined_at`. Audit `member.add`. SSE `members`. |
| DELETE `/api/meets/conversations/:id/members/:userId` | 1023 | Leaving: any current member. Removing someone: owner or admin, and never the owner. Groups only. | — | `{userId,leftAt}` | Sets `left_at`. The person keeps read access to history up to then and **cannot post again** unless re-added. Audit. SSE `members`, including to the person removed. |
| GET `/api/meets/conversations/:id/messages?before=<iso>&limit=≤100` | 1073 | Member, current or former. History is clipped to `left_at`. | — | `{messages:[{id,conversationId,senderId,senderName,body\|null,deleted,createdAt,editedAt,attachment:{name,type,size}\|null}], hasMore, nextBefore}`, newest first | None. |
| GET `/api/meets/attachments/policy` | 1214 | Any user | — | `{maxBytes:8388608, maxAudioBytes:3145728, types[], inlineTypes[], extensions[]}` | None. |
| GET `/api/meets/conversations/:id/messages/:messageId/attachment[?inline=1]` | 1334 | Member, current or former. Clipped to `left_at`. | — | **Raw bytes**, streamed from Google Drive (or a legacy Supabase bucket). `Content-Disposition` is `inline` only for image and audio types. `Cache-Control: no-store`. | None. Returns 410 if the message was deleted. |
| POST `/api/meets/conversations/:id/messages` | 1409 | Current member. Rate limits: 30 sends/min, 12 attachments/min. | `{body?: ≤4000 code points, attachment?:{name,type,dataUrl}}` (see attachment rules below) | `{message:{id,conversationId,senderId,senderName,body,deleted:false,createdAt,editedAt:null,attachment}}` | Inserts the message. **Uploads the file to the Drive folder `MEETS_DRIVE_FOLDER_ID`** (never shared; meets.js:1291). SSE `message` to every current member, including my own other sessions. |
| DELETE `/api/meets/conversations/:id/messages/:messageId` | 1475 | Current member, and only the sender | — | `{messageId}` | **Soft delete for everyone. The user cannot undo it.** The body is never returned again. The Drive file stays in Drive but is refused with 410. Audit `message.delete`. SSE `message-deleted`. |
| GET `/api/meets/conversations/:id/export` | 1594 | Member, current or former (clipped). Rate limit 6/min. | — | `{conversation:{id,type,name}, exportedBy, exportedAt, clippedTo, truncated, rows:[{timestamp(IST),sender,message,attachment}] (formula-safe), txt}` | **Writes an audit row `export`.** Reads up to 20 000 rows. |
| POST `/api/meets/stream-ticket` | 1500 | Any user. Rate limit 20/min. | `{}` | `{ticket, expiresInMs:30000}`. The ticket is `userId.exp.hmac`, single-use. | None. |
| GET `/api/meets/stream?ticket=…` | 1519 | **Ticket only** (server.js:1362) | — | `text/event-stream` (format below) | Adds the connection to the in-memory `_streams` map for that user. Events also cross instances via a Supabase Realtime broadcast (meets.js:467). |

**Attachment rules** (`acceptAttachment`, meets.js:1247)
- `attachment.dataUrl` must be a `data:<type>;base64,…` URL.
- `type` must be one of: png, jpeg, gif, webp, pdf, txt, csv, zip, docx, xlsx, pptx, `audio/webm`,
  `audio/mp4`.
- The file's first bytes must match its claimed type ("magic bytes").
- Size limits: 8 MB for files, 3 MB for audio.
- If there is no caption, the body becomes the filename.
- The JSON body limit is 12 MB (server.js:236–237).

**SSE frame format** (meets.js:450)
- Each event is `event: <name>\ndata: <json>\n\n`.
- A `ready` event comes first.
- A `: ping` comment line arrives every 25 s.

**SSE events for chat**

| Event | Payload |
| --- | --- |
| `message` | Same shape as the send response. |
| `message-deleted` | `{conversationId, messageId}` |
| `conversation` | `{conversationId}` |
| `members` | `{conversationId}` |
| `read` | `{conversationId, at}` |

### 2.2 Calls

| Method and path | meets.js | Check | Request | Response | Side effects |
| --- | --- | --- | --- | --- | --- |
| GET `/api/meets/calls/config` | 2019 | Any user | — | `{configured:true, iceServers, hasStun, hasTurn, ownStun, turnState:'on'\|'off'\|'missing-secret'\|'missing-urls', maxParticipants, heartbeatSeconds}` | Mints a TURN credential (expires in 1 h) when TURN is configured. The website does not call it. |
| POST `/api/meets/meetings` | 2034 | Any user. If tied to a conversation: must be a **current** member. Rate limit 10/min. | `{conversationId?, title?, expiresInMinutes?}` | `{meeting:{id(192-bit base64url),conversation_id,host_id,title,created_at,expires_at,screen_share_allowed}}` | Inserts the meeting. Audit. **SSE `meeting` (the ring) to the other current members**, and `meeting-started` to my own other sessions. |
| GET `/api/meets/meetings/:meetingId` | 2088 | `canJoinMeeting` | — | `{meeting:{id,title,conversationId,host,isHost,screenShareAllowed,expiresAt,maxParticipants}, participants:[peerCard]}` | None. Useful for a lobby; the website does not call it. |
| POST `.../:meetingId/join` | 2118 | `canJoinMeeting`. Mesh cap: at most 8 people (env `MEETS_MAX_PEERS`, never above 12), or the conversation's size. Returns 409 when full. | `{}` | `{self, peers[], iceServers, ownStun, isHost, screenShareAllowed, maxParticipants, expected[], heartbeatSeconds}` | Upsert presence. SSE `meet-peer-join` to the people already in the call. Audit. |
| POST `.../decline` | 2173 | `canJoinMeeting` | `{}` | `{declined:true}` | SSE `meet-declined {by}` to the host. Nothing is written. |
| POST `.../heartbeat` | 2193 | `canJoinMeeting` | `{}` | `{peers[], screenShareAllowed, maxParticipants, expected[]}` | Refreshes `last_seen_at`. **Presence lapses after 45 s.** |
| POST `.../signal` | 2231 | `canJoinMeeting`. Sender and recipient must both be live in this call. Rate limit 900/min. Payload ≤ 16 KB. | `{to, kind:'offer'\|'answer'\|'ice'\|'bye'\|'state', payload}` | `{delivered:true}` | SSE `meet-signal {meetingId, from(server-set), kind, payload}` to `to`. |
| POST `.../leave` | 2275 | Any user (no join check) | `{}` | `{left:true}` | Sets `left_at`. SSE `meet-peer-leave`. |
| POST `.../invite` | 2302 | **Host only** | `{userId}` | `{invited:publicUser}` | Adds a participant row for this meeting only (no chat access). SSE `meeting` (ring) to the person invited, and `meet-invited` to the room. Audit. |
| PATCH `/api/meets/meetings/:meetingId` | 2370 | **Host only** | `{screenShareAllowed:boolean}` | `{screenShareAllowed}` | SSE `meet-config`. Audit. |
| POST `.../remove` | 2397 | **Host only**, and never the host themselves | `{userId}` | `{userId}` | **That person cannot rejoin this meeting, and re-inviting is refused.** SSE `meet-removed` to them, and `meet-peer-leave {removed:true}` to the others. Audit. |
| POST `.../end` | 2432 | **Host only** | `{}` | `{meetingId}` | **Ends the meeting for everyone. It cannot be undone.** SSE `meeting-ended` to the people in the call and to every conversation member. Audit. |

**ICE servers** (`iceServersFor`, meets.js:1797)
- STUN comes from `MEETS_STUN_URLS`. When that is not set, it falls back to Google STUN.
- TURN is offered only when both `MEETS_TURN_URLS` and `MEETS_TURN_SECRET` are set.
- The TURN credential uses the REST scheme: username is `<expiry>:<userId>`, password is an HMAC-SHA1.
- `turn.js` relays **UDP only** (turn.js:416). There is no TURN over TCP or TLS on port 443.

**Side effects, overall**
- No WhatsApp, email or wallet effects anywhere in Meets.
- The external writes are Google Drive uploads (attachments) and `meets_audit_log` rows.
- **What the user cannot undo**:
  - deleting a message;
  - ending a meeting for everyone;
  - removing someone from a meeting.
- **Hard to undo**:
  - leaving a group (someone must re-add you);
  - removing a group member.

---

## 3. What the mobile app has today, and the gaps

**Confirmed: the app has nothing for Meets.**
- No route, API file, fixture or menu entry. `grep -i "meets|chat|EventSource|webrtc"` over
  `mobile/src` finds nothing relevant.

**Pieces to reuse**

| Piece | Where | Use for Meets |
| --- | --- | --- |
| `apiFetch` / `api` / `unwrap` | `src/api/client.ts` | Calls the API with the Bearer token. `api` has no `patch` helper yet; `apiFetch(path, {method:'PATCH'})` works. |
| `authHeaders()` | `client.ts:131` | Feeds expo-image sources and file downloads. |
| `pickImage` | `src/lib/files.ts` | Produces a compressed JPEG data URL. JPEG is on the server's allowlist, and HEIC never reaches the server. |
| `pickDocument` | `src/lib/files.ts` | 8 MB cap, which matches the server. |
| `downloadAuthed` | `src/lib/files.ts` | Fetches with Bearer into the cache. Refuses in demo sessions. |
| `saveDataUrl`, `shareFile` | `src/lib/files.ts` | Write a file to the cache and open the share sheet. |
| TanStack Query | `src/api/query.tsx` | Persisted cache. AppState drives focus, so screens refetch on resume. |
| UI kit | `@/ui` | `NavHeader`, `ListCard` / `ListRow` / `ActivityList`, `Avatar`, `AvatarStack`, `Sheet` / `MenuSheet`, `ConfirmSheet`, `SwipeToConfirm`, `SuccessSheet`, `PillField`, `EmptyState`, `ErrorState`, `SkeletonList`, `Banner`, `toast`, `HomeHeader` with `IconPillGroup` actions (`src/ui/chrome.tsx:227`, `screen.tsx:242`). |
| Access | `src/lib/access.ts` `tenantFeatureOn`, `src/lib/use-access.ts` | Feature switch check. |
| Android permission | `app.json` | `RECORD_AUDIO` is already listed. |
| EAS dev profile | `eas.json` | A `development` profile with `developmentClient: true` exists, **but `expo-dev-client` is not in package.json**. |

**Gaps**
- The API client: `src/api/meets.ts`.
- A realtime (SSE) client.
- All the screens: list, thread, composer, new chat, info, call.
- Voice recording and playback: no `expo-audio` in package.json.
- Calls: no WebRTC module.
- Ringing and alerts while the app is in the background: no push (needs a server change).
- Demo fixtures, plus a `'PATCH'` value in the demo `Method` type (`src/demo/state.ts:16`).

---

## 4. Mobile design proposal (Ember palette, Payno × Lendora kit)

### 4.1 Where it lives (no new tab: the rules keep Home · Me · (+) · Inbox · More)

**Home header (main entry)**
- Add a **Chat** action (lucide `MessageCircle`) to the `IconPillGroup`, in `features/home/header.tsx`,
  through `actions=[chatAction, inboxAction]`.
- It shows a **red dot when `/meets/unread` has `messages > 0`**. The rule is dots, not numbers.

**More**
- The tile grid is capped at 9, and the Employee role already fills all 9.
- So add **"Chat & calls"** as a plain link row under the grid (`menu.ts` `links`), for everyone.
- Gate it on `tenantFeatureOn(tenant,'meets')`. See R7: the website ignores this switch; honouring it
  in the app is stricter and does no harm.
- For `master_admin` the website still shows the launcher. Show the link there too; the directory works.

**Create sheet (+)**: add a **"New chat"** action (any role), which opens `/chat/new`.

**Notifications from the stream**
- A message for a conversation that is not on screen shows an in-app `toast`: sender name plus 1 line,
  tap to open.
- It also gives a light haptic.
- It stays silent while a call screen is open. This mirrors `useMessageAlert`.

**Incoming call overlay**
- Mounted once in `src/app/(app)/_layout.tsx`, above the Stack, the same as `MeetsCallWatcher`.
- It owns the single SSE connection and the ring.

### 4.2 Routes and files

| Route or file | What it does | Effort |
| --- | --- | --- |
| `src/api/meets.ts` | Typed client for every endpoint in §2, plus query keys: `useConversations`, `useUnread`, `useConversation(id)`, `useMessages(id)` as an infinite query on `before`, `useDirectory` (staleTime 60 s), `useAttachmentPolicy`, and the mutations. | M |
| `src/features/meets/realtime.ts` | SSE client and a module-level bus (like `meetsBus`). See §5.1. It feeds the query cache: `message` appends to the thread and bumps the row; `read` clears the row; `members` / `conversation` / `message-deleted` invalidate. | M |
| `src/features/meets/meets-watcher.tsx` | Mounted in `(app)/_layout.tsx`. It: opens and closes the stream on AppState changes; shows toasts; shows the incoming-call sheet; tracks `viewing` and `callLive`. | M |
| `app/(app)/chat/index.tsx` | **Conversation list.** See below. | M |
| `app/(app)/chat/new.tsx` | **New chat or group.** See below. | M |
| `app/(app)/chat/[id].tsx` | **Thread.** See below. | L |
| `features/meets/composer.tsx` | Composer. See below. | M |
| `features/meets/voice.tsx` | Record and play voice notes. See below. | M |
| `app/(app)/chat/[id]/info.tsx` | **Conversation info.** See below. | M |
| `app/(app)/call/[meetingId].tsx` | **Call screen, development build only.** See §4.3. | L |
| `features/meets/incoming-call.tsx` | Full-screen sheet: `Avatar` 72, caller name and department, title, a 45 s countdown, a **Decline** frosted pill and an **Accept** brand pill. Repeating `expo-haptics` pulses instead of a ringtone (Expo Go has no tone generator; a short bundled ringtone would need `expo-audio`). Accept opens the call route. In Expo Go it opens the fallback below. Decline sends `POST /decline`; a timeout sends nothing. | S |

**Conversation list** (`chat/index.tsx`)
- `NavHeader` titled "Chat", with right actions: search, and a **+** that opens a `MenuSheet` with
  "New chat" and "New group".
- A `PillField` search filters on the device, the same as the website.
- Rows come from `ActivityList` / `ListRow`:
  - an `Avatar` (initials; `AvatarStack` of `others` for groups);
  - the name;
  - a 1-line preview ("Sender: …", "message deleted", "you left");
  - the time;
  - an unread `StatusPill`-style count, 99+ at most.
- `FlashList` (already a dependency) handles long lists.
- Pull to refresh.
- **Empty**: `EmptyState` "No conversations yet", with a "Start a chat" button.
- **Error**: `ErrorState` with retry.
- **Not set up**: if `/meets/health` says `chatReady:false`, a `Banner` saying "Chat isn't set up on
  DASH yet" (the server's own text).

**New chat or group** (`chat/new.tsx`)
- A `SelectTiles` switch between **Person** and **Group**.
- Group mode adds a `PillField` "Group name" (100 characters at most).
- A searchable people list from `/meets/directory` (name, email, department), with a checkmark for
  each person picked in group mode.
- A sticky primary pill: "Start chat" or "Create group (n)".
- `POST /meets/conversations`, then `router.replace('/chat/<id>')`.
- If the direct chat already exists (`existed:true`), it simply opens.

**Thread** (`chat/[id].tsx`)
- `NavHeader`: the name and a subtitle ("N members" / "Direct message"). Right side:
  - a **phone** button (Start call). Shown only when `canPost`; in Expo Go it shows the
    development-build notice from §5.2;
  - an **info** button.
- **Message list**:
  - `FlashList` v2, with `maintainVisibleContentPosition` and `startRenderingFromBottom`. Note that
    v2 has no `inverted` prop.
  - Older pages load when the person reaches the top (`onStartReached`).
- **Separators**: day chips, and the "New messages" divider placed with the same
  `meetsReadMark` / `meetsFirstUnreadId` logic, copied from dash.html:7117.
- **Bubbles**:
  - Mine in brand colour on the right; others frosted on the left, with the sender's name in groups.
  - Images: `expo-image` with `source={{uri: API_URL+'/meets/conversations/:id/messages/:mid/attachment?inline=1', headers: authHeaders()}}` and `cachePolicy:'memory'` (the server sends `no-store`). Tapping an image opens it full screen.
  - Voice notes: a play/pause pill with a duration taken from the name.
  - Files: a row with an icon, the name and the size. Tapping it runs `downloadAuthed`, then
    `shareFile` (Open in…).
- **Long-press my own message**: a `MenuSheet` with "Delete for everyone". This opens a
  `ConfirmSheet` with a `SwipeToConfirm` labelled "Swipe to delete", because the delete cannot be
  undone.
- **Mark read**: when the thread is opened, when a message arrives while it is focused, and when the
  app comes back to the foreground. Use `useFocusEffect` together with AppState.
- **Former member**: the composer is replaced by a muted note: "You left this conversation. You can
  still read and export it."

**Composer** (`features/meets/composer.tsx`)
- A multi-line `TextInput`, up to 4000 characters. The **Send** button sends; Enter adds a new line.
- A **+** opens an attach `MenuSheet`:
  - Photo (library), via `pickImage('library')`;
  - Camera, via `pickImage('camera')`;
  - File, via `pickDocument(policy.types)` with types mapped (§5.3).
- A hold-to-record **mic** for voice notes (see below).
- A staged attachment shows as a chip with a × to remove it.
- Server errors (size, type, rate limit) show as a `toast`.

**Voice notes** (`features/meets/voice.tsx`)
- Recording uses `expo-audio` `useAudioRecorder(RecordingPresets.HIGH_QUALITY)`, which gives
  AAC in `.m4a` and is sent as `audio/mp4`. That type passes the server's `ftyp` byte check.
- Recording stops at 2 minutes and at 3 MB.
- The finished clip is staged with play, Discard and Send.
- The name is `Voice message (m:ss).m4a`, the same as the website, so the duration can be read from it.
- Playback: download to the cache with `downloadAuthed`, then `createAudioPlayer(fileUri)`.
- Recording is disabled while a call is live.

**Conversation info** (`chat/[id]/info.tsx`)
- `SummaryCard`: type, created, member count.
- A member list with roles.
- **Owner or admin of a group** gets:
  - "Add people", using the same picker filtered to people not already in;
  - a "Remove" swipe or row action, through `ConfirmSheet`; never offered for the owner;
  - **"Rename group"**, a `Sheet` with a `PillField` that sends `PATCH`. This is new compared with
    the website (the endpoint exists).
- **Leave group**, through `ConfirmSheet` with `SwipeToConfirm`.
- **Export chat**:
  - `GET /export`, then write `txt` to the cache with `saveDataUrl` or File, then `shareFile`.
  - Also offer **CSV** built from `rows`. The rows are already formula-safe, so no library is needed.
  - **Excel stays website-only**: it needs SheetJS, a new dependency, for little gain on a phone.

### 4.3 Calls on the phone (development build)

**What it is**: one screen on a dark surface.
- **One other person**: their tile (camera view or a big avatar) fills the screen, with my small
  preview in a corner.
- **Group**: a 2-column grid of tiles. A shared screen from a desktop takes over the top half when it
  arrives (only when `screenShareAllowed`).
- **Bottom bar** of round buttons: Mute, Camera, Speaker/earpiece, Flip camera, End (red).
- **Top bar**: the title, "N in the call", and a **Host** pill.
- **Host `MenuSheet`**:
  - "Add person" (the directory picker, then `/invite`);
  - "Allow / Turn off screen share" (`PATCH`);
  - "Remove …" (a `ConfirmSheet`);
  - **"End for everyone"** (a `ConfirmSheet` with `SwipeToConfirm`).
- **Status lines**:
  - "Ringing Priya…" when nobody has joined (from `expected`);
  - "connecting… / live / no route" for each peer;
  - the red "No audio or video is flowing" `Banner` when a peer's connection fails.
- **Expo Go fallback**: the Accept and Start-call buttons open a `Sheet` saying calls need the full
  DASH app build. It offers only **Decline**, so the caller gets a real "declined" notice and is not
  left waiting.

**Protocol that must match the website exactly** (otherwise phone ↔ browser calls break)
1. Ask for the microphone first. Then `POST /join`, then build each peer connection with
   `new RTCPeerConnection({iceServers: j.iceServers, bundlePolicy:'max-bundle'})`.
2. The caller is chosen by `callsFirst` (earlier `joinedAt`, then the lower user id).
   - The caller adds three transceivers in this order: audio, video, video.
   - The polite side is `!caller`.
3. The answerer, after `setRemoteDescription(offer)`, sets every transceiver to `direction='sendrecv'`
   and calls `sender.replaceTrack()` for its own tracks.
4. Payloads:
   - offer and answer as `{type, sdp}`;
   - ICE as `{candidate, sdpMid, sdpMLineIndex}`;
   - `state` as `{mic, cam, screen}`.
   - Hold ICE candidates that arrive before the remote description, as the website does
     (dash.html:7570).
5. Follow the perfect-negotiation rules in dash.html:7575–7585. If a parameterless
   `setLocalDescription()` is not supported, use explicit `createOffer()` / `createAnswer()` instead.
6. Heartbeat every `heartbeatSeconds` and reconcile peers from the response. On leaving: send `bye`
   to each peer, close the connections, stop the tracks, and `POST /leave`.
7. Slot 2 (screen): **receive only on the phone.** Sending a screen from iOS needs a ReplayKit
   broadcast extension (L, out of scope). Keep slot 2 empty (`replaceTrack(null)`).
8. Phone defaults: camera off (the same as the website). When the camera is turned on, ask for about
   640×360 and 15 fps, because the mesh sends one stream up per peer.

---

## 5. Expo Go feasibility (SDK 57; `mobile/package.json` has expo ~57.0.27, RN 0.86.3)

### 5.1 Chat realtime (SSE): works in Expo Go, no new dependency

**Why it works**
- React Native has no `EventSource`.
- `expo/fetch` supports streaming response bodies, through `resp.body.getReader()`. On Android and
  iOS it is installed as the **global `fetch`**, and it is "Included in Expo Go" (docs for
  v57.0.0, `sdk/expo`).

**Client loop**
1. `POST /meets/stream-ticket` with `apiFetch`.
2. Fetch `${API_URL}/meets/stream?ticket=…` with header `Accept: text/event-stream`, and keep an
   `AbortController` for it.
3. Read chunks, decode them with `TextDecoder`, split on a blank line, then parse the `event:` and
   `data:` lines. Ignore lines starting with `:`.
4. On a read error or end of stream: wait 5 s, then get a **new** ticket and reconnect. Tickets are
   single-use and last 30 s; the ticket endpoint allows 20 per minute.
5. **When the app goes to the background**: abort the stream. iOS suspends JavaScript anyway.
6. **When the app returns to the foreground**: reconnect and then invalidate the
   `conversations` / `unread` / open-thread queries, because events missed while away are not replayed.
7. While the stream is down, poll `/meets/unread` every 60 s. This is the same fallback the website's
   badge uses.

**Risks to check on a device**
- `TextDecoder` with `{stream:true}` under Hermes: Likely. If it is missing, decode the bytes by
  hand (UTF-8).
- Whether an Android proxy buffers the stream: the server sends `X-Accel-Buffering: no`. Unknown.
- **Fallback**: if streaming misbehaves, use the pure-JS `react-native-sse` (XHR-based; a new JS
  dependency, works in Expo Go), or drop to polling `/messages` every 5 s while a thread is open.

### 5.2 Calls: not in Expo Go; needs a development build

| Need | Package | In Expo Go? | Notes |
| --- | --- | --- | --- |
| WebRTC | `react-native-webrtc` and `@config-plugins/react-native-webrtc` | **No.** The library's own README says so. | Add the plugin to `app.json` with `cameraPermission` / `microphonePermission`, then `eas build --profile development`. Unified Plan only (fine). Screen capture is supported natively but not needed. **Unknown**: whether the current release works on RN 0.86 with the New Architecture. Check the release notes before you commit to it. |
| Dev client | `expo-dev-client` | n/a | Missing from package.json, although the `development` profile in eas.json expects it. |
| Speaker/earpiece, proximity | `react-native-incall-manager` (a native module) | No | Optional. Without it, iOS audio-only calls play through the **earpiece** (Likely, from the WebRTC audio session), and there is no speaker toggle. |
| Keep the screen awake during a call | `expo-keep-awake` | Yes | Comes with the Expo SDK. Add it with `npx expo install`. |
| Call keeps running in the background | iOS `UIBackgroundModes: ["audio","voip"]`; an Android foreground service | n/a (needs a build) | Without these, iOS suspends JavaScript, the heartbeat stops, and **presence lapses after 45 s**, so the phone drops out of the call. |
| Ring when the app is closed | Push (+ CallKit/ConnectionService for a native ring) | No (and **needs a server change**, §6) | Deferred. |

Guard the import so Expo Go never crashes:
`isRunningInExpoGo()` (from `expo`), or `try { require('react-native-webrtc') } catch`.
`call/[meetingId].tsx` then shows the fallback sheet.

### 5.3 Attachments and voice: work in Expo Go

**Already installed and in Expo Go**: `expo-image`, `expo-image-picker`, `expo-image-manipulator`,
`expo-document-picker`, `expo-file-system`, `expo-sharing`.

**New dependency: `expo-audio`** (`npx expo install expo-audio`; "Included in Expo Go")
- Records `.m4a` (AAC on iOS and Android).
- Its config plugin sets the iOS microphone text, through `microphonePermission`.
- Android `RECORD_AUDIO` is already in `app.json`.
- Needs the owner's approval: `REFERENCE-COMPONENTS.md` §4 says "No new dependencies".

**Voice notes recorded on the website**
- **iOS cannot play `audio/webm` (Opus)** recorded in Chrome. AVFoundation has no WebM support
  (Likely; test it).
- On iOS, show "Voice message: open on the website" with a Share/Save fallback.
- Android plays WebM/Opus (Likely).
- Notes recorded on the phone (m4a) play everywhere, including Chrome.

**Document picker MIME types**
- Android may report a CSV as `text/comma-separated-values`. Some pickers report `''` or
  `application/octet-stream`.
- Map by file extension to the server's allowlist before sending. Otherwise the server answers 400
  "That kind of file cannot be sent here".
- Old `.doc` / `.xls` files are refused by the server.

**Desktop features that stay web-only**
- Excel export: needs SheetJS. Offer `.txt` or `.csv` through the share sheet instead.
- Sending a screen share (iOS needs a broadcast extension).
- The draggable launcher window.
- Notification-permission diagnostics and "Test call alert".

---

## 6. The server change that is truly needed (and only this one)

**Push notifications for messages and incoming calls when the app is closed or in the background**

This matches the deferred item in the owner's list. **Chat and foreground calls work without it.**

**Minimum change**
1. Store tokens:
   - **New table** `meets_push_tokens(user_id text, token text, platform text, updated_at)`, with
     `UNIQUE(token)`;
   - or a field in `users.data`.
2. **New route** `POST /api/meets/push-token {token, platform}`, behind the gate, with
   `user_id = req.authUser.id`. Plus `DELETE` on sign-out.
3. In `broadcast()` (meets.js:487), for the `message` and `meeting` events only: for each recipient
   with no live stream in `_streams`, send to the Expo Push API (`https://exp.host/--/api/v2/push/send`):
   - title: sender's name;
   - body: the first 100 characters, or "Incoming call";
   - data: `{conversationId|meetingId}`.
   - Batch the sends. Rate-limit them per conversation, the same idea as the 2.5 s chime throttle.
4. App side:
   - `expo-notifications` (a new dependency);
   - an EAS `projectId` (already in `app.json`);
   - FCM credentials for Android and APNs for iOS.
   - **Remote push does not work in Expo Go on Android from SDK 53**, so it needs the development
     build as well.

**Optional, bigger**: VoIP push plus CallKit, for a native full-screen ring on iOS. Not proposed now.

Nothing else in this domain needs the server. Everything in §4 uses existing endpoints.

---

## 7. Demo fixtures (persona: every staff persona; main one **Afzal Employee**)

**How the demo must work**
- Meets is for everyone (`canSeeMeetsNav` returns `!!user`), so every staff persona sees it.
- The fixtures store "me" as `DEMO_USER.id` (`'demo-user'`). `server.ts` swaps that for the
  persona's id, so senders and members follow the chosen persona automatically.

**New file `src/demo/fixtures/meets.ts`**: export `meetsRoutes`, and register it in `demo/server.ts`.

Sample data:

| Conversation | Type | Members | My role | State |
| --- | --- | --- | --- | --- |
| **Priya Sharma** (`u-priya`) | Direct | Priya and me | owner | 2 unread: "Can you share the Nimbus cut by 5?", then a 1.2 MB PDF "Nimbus_feedback.pdf". |
| **Creative Team** | Group | Priya (owner), me, `u-rahul`, `u-sneha`, `u-sanjay`, `u-kavya`, `u-nikhil` | member | About 25 messages over 3 days (so paging and day chips show), one image, one deleted message, 5 unread with the divider. |
| **Nimbus launch** | Group | me (owner), `u-vikram`, `u-meera`, `u-zoya` | owner | Lets the demo try rename, add and remove. |
| **Lakshmi Prasad** (`u-lakshmi`) | Direct | Lakshmi and me | owner | Old messages, all read. |
| **Goa shoot – Sept** | Group | — | former member | `leftAt` set. Shows the read-only state and export. |

The people come from `fixtures/org.ts`. The directory is the org roster minus me.

**Routes to answer**
- **Read routes**:
  - `GET /meets/health`, `/meets/directory`, `/meets/conversations`, `/meets/unread`,
    `/meets/attachments/policy`, `/meets/calls/config`;
  - `GET /meets/conversations/:id`, `/meets/conversations/:id/messages` (honour `before`, page size 50).
- **Write routes**:
  - `POST /meets/conversations`, `/meets/conversations/:id/messages`, `/meets/conversations/:id/read`,
    `/meets/conversations/:id/members`;
  - `DELETE /meets/conversations/:id/messages/:mid`, `/meets/conversations/:id/members/:uid`.
- **Rename**: `PATCH /meets/conversations/:id`. **This needs `'PATCH'` added to `Method` in
  `demo/state.ts`.**
- **Export**: `GET /meets/conversations/:id/export`, returning `txt` and `rows`.
- **Calls**:
  - `POST /meets/meetings` returns a fake id;
  - `POST /meets/meetings/:id/decline` and `/leave` return `{ok:true}`.
- **Stream ticket**: `POST /meets/stream-ticket` returns `{error:'demo', status:400}`, so the
  realtime client knows to use the demo bus instead of the network.

**Live feel in the demo**
- `fixtures/meets.ts` exports a tiny emitter. `realtime.ts` subscribes to it when `isDemoSession()`.
- About 2 s after I send a message in a direct chat, the other person "replies" with a `message`
  event.
- A **"Try an incoming call"** row (demo only, in More → Demo) emits a `meeting` ring from Priya:
  - Accept shows the call screen in a **demo mode**: no WebRTC, Priya's avatar tile, a timer, and
    working mute and end buttons.
  - Decline closes the ring.

**Media in the demo**
- `downloadAuthed` already refuses in demo, with "Downloads are not available in the demo account".
- Inline images need a bundled local asset or a placeholder, because the fixture cannot serve bytes.
- Voice notes: show the pill with the duration; playback shows the same "not in demo" toast.

---

## 8. Effort and risks

### Effort

| Item | Size |
| --- | --- |
| `api/meets.ts` + types + query keys | M |
| SSE client (`realtime.ts`) + watcher + toasts + unread dot | M |
| Conversation list | M |
| New chat / group | M |
| Thread (FlashList bottom-anchored, paging, divider, bubbles, inline media, delete) | L |
| Composer (text, photo, camera, file with MIME mapping) | M |
| Voice notes record + play (`expo-audio`) | M |
| Info / members / rename / leave / export (txt + csv) | M |
| Incoming-call sheet + Expo Go fallback | S |
| Demo fixtures + demo bus + demo call | M |
| **Calls in a dev build** (react-native-webrtc, the protocol port, tiles, host controls, audio routing, background modes) | L, plus device testing across networks |
| Push (server change §6 + `expo-notifications` + credentials) | M, plus the server work |

Rough total: **chat about 2–3 weeks; calls about 2 more weeks; push about 1 week.**

### Risks

| # | Risk | Detail |
| --- | --- | --- |
| R1 | No background delivery | With no push, messages and rings reach the phone only while DASH is open. Set expectations in the UI: an "Open DASH to get calls" line in the call fallback and in info. |
| R2 | SSE on mobile networks | The stream drops when the phone sleeps, switches network or goes to the background. Events are not replayed, so every reconnect must refetch. Unknown: proxy buffering on some carriers. |
| R3 | Calls connecting on mobile data | Indian mobile carriers often use CGNAT or symmetric NAT. STUN alone will fail for many phone ↔ office pairs. `turn.js` is **UDP only**, and the environment variables may be unset (`turnState`). Treat a real TURN deployment (ideally with TCP/TLS on 443, e.g. coturn) as a prerequisite before releasing calls. Show `turnState` to admins only. |
| R4 | Mesh limits | Up to 8 peers means 7 uplinks from a phone. Keep the camera off by default and the video small. |
| R5 | Matching the protocol exactly | The 3-slot order, setting `direction` on the answerer, and the perfect-negotiation roles. Any mismatch gives a "connected but silent" call. Test phone ↔ Chrome, phone ↔ Safari, and phone ↔ phone. |
| R6 | **Directory has no tenant scope (server, Confirmed)** | `loadDirectory()` (meets.js:215) selects **all** users with no tenant filter. In a multi-company DASH, staff can see and message other companies' staff. This is not caused by the app, but the app makes it more visible. Flag it to the owner. Any fix is a server change. |
| R7 | **Feature switch is ignored on the web** | The Config switch "Meets (chat & calls)" hides nothing on the website (§1.1). If the app honours it, the two clients behave differently. Decide one rule. |
| R8 | WebM voice notes on iOS | Website-recorded WebM probably cannot be played on iOS. Use the share or open-on-website fallback. |
| R9 | New dependencies need sign-off | `expo-audio` (works in Expo Go); `react-native-webrtc` + its config plugin + `expo-dev-client` (+ `react-native-incall-manager`) for calls; `expo-notifications` for push. The kit's rule currently says "No new dependencies". |
| R10 | Attachment size | Attachments are base64 inside JSON: 8 MB files and 3 MB audio, under a 12 MB body limit. Large photos must be compressed first (`pickImage` already does this). Uploads over a slow network can take longer than `apiFetch`'s **12 s timeout**. Pass `timeoutMs: 60000` for sends that carry an attachment. |
| R11 | Things the user cannot undo | Delete message, end meeting, remove from meeting, leave group. Each needs a ConfirmSheet with SwipeToConfirm. |
