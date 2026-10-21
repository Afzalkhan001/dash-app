# Newsroom domain — hand-off (wave 2)

Spec: `docs/port/hr-people.md` §1.G, §2.4, §4.7–4.8 (posting news, office TVs).
No server, website or DB change. No new dependency. No shared file edited (only `announcements/index.tsx`, assigned in PLAN §2.4).

## What it adds

**Routes** (`src/app/(app)/admin/news/`) — plain pushed screens, no Stack options needed.
- `index` — News studio: My posts / All posts (pop-ups, scheduled, expired included), status pills, "+" New post, News settings (HR / Super Admin).
- `[id]` — one post: picture, words, every setting; Edit / Delete only on my own posts unless Super Admin (dash.html:19523). Delete swiped (permanent; "no one is notified").
- `compose` (`?id=` to edit) — `features/newsroom/compose-form.tsx`: Announcement or Pop-up (locked on edit), type, description, link + button presets / own words, file (image 1600 px; video / xlsx / ppt ≤ 8 MB), full screen, Home banner (fit 1600×400, remove / undo), publish now or IST date+time, branches (`GET /branches`), only today / expiry, TV priority. Review → ConfirmSheet + swipe, saying who sees it and that no one is emailed or messaged; emergency gets a red warning. **Edit sends only changed keys and never sends `priority` unless picked** ("Leave unchanged"), avoiding the website's silent downgrade.
- `settings` — birthday / work-anniversary auto-posts (PUT /tenants), HR WhatsApp number, "Send a test" (swiped; "sends a real WhatsApp"), "Who can post news" summary → links to company's `/admin/company/settings/access/news` for Super Admin.
- `tvs/index` — Office TVs: online/offline, branch, playlist, now showing, last seen (20 s refetch while focused); playlists read only (editor stays web); custom TV media upload (picture / video, swiped "plays on every TV") and remove (swiped).
- `tvs/add` — pair by 6-digit code (OtpBoxes), name, branch, playlist, inactivity; server error inline.
- `tvs/[id]` — status card, Show a post now (30 s – 1 h) / Back to playlist, Remote grid (Sync, Refresh, Reload, Clear cache, Back to playlist), recent log, settings sheet (PATCH), Unpair (swiped).

**Existing file changed (PLAN §2.4):** `src/app/(app)/announcements/index.tsx` — round "News studio" header button for creators.

**More › Workspace rows** (`nav.ts`)
| key | section | who |
|---|---|---|
| `newsroom.studio` (order 60) | company | `canUseNewsStudio`: web('announcements') && isAnnouncementCreator |
| `newsroom.tvs` (order 70) | it | super_admin, ceo, coo && web('config') |

tourIds `more.newsroom.studio`, `more.newsroom.tvs`.

**Create action:** `newsroom.post` "Post news" → `/admin/news/compose` (same gate as the studio).
**Inbox kinds:** none (nothing waits on a decision). **Home cards:** none.
**Tour steps:** `newsroom.studio`, `newsroom.tvs` (More), each only when its row is present.

## Gates (`access.ts`)
`canUseNewsStudio`, `canManagePost` (super_admin or createdBy === my name), `canEditCelebrations` (hr, super_admin), `canSeeOfficeTvs` (`TV_ROLES` super_admin/ceo/coo + config), `canEditNewsCreators` (web('config')). Nothing needs promoting yet.

## API (`src/api/newsroom.ts`)
Post create/update/delete (invalidate `['announcements']`; new bytes go to the in-memory media/banner caches), `useBranches`, `useCelebrationTestSend`, TV devices / playlists / media / logs (logs `persist:false`), pair, PATCH (`api.patch`), command, unpair, media upload/delete. Uses company's `useUpdateTenant` for the tenant switches.

## Demo (`src/demo/fixtures/newsroom.ts`)
Overrides `GET /announcements` (list projection: no bytes, no `priority`, no `tv_media`), `/:id/media`, `/:id/banner`; adds POST/PUT/DELETE `/announcements`, `GET /branches`, `POST /celebration/test-send`, all `tv/admin/*` (claim with **123456**, devices, PATCH, command, DELETE, logs, playlists, media GET/POST/DELETE).
Seeds via `newsStore`: Afzal HR's policy post + a post scheduled for tomorrow, Afzal IT Admin's Hyderabad-only link post, an expired emergency by Afzal Super Admin; priorities kept beside the rows. TVs: Reception (online, lobby playlist, showing the town hall) and Canteen (offline 2 days); 2 playlists (1 archived); 1 media upload; log lines.
Tenant via `patchTenant`: `hrNotifyPhone: '9876543210'`, and **Afzal Manager (TM-1042) added to `announcementCreators`** so a granted, non-admin creator can be tried.

### Needs the integrator
1. **Boot crash right now (not this domain):** the web bundle dies at start with `Cannot access 'onSignOutListeners' before initialization` — `demo/fixtures/hiring.ts` imports a value (`PUBLIC_APP_STATUSES`) from `api/hiring.ts`, which pulls in `api/query.tsx`; that calls `onSignOut` while `auth/session.ts` is still initialising (session → demo → fixtures cycle). Fixtures should import only types from `@/api/*`.
2. If `hiring` also answers `GET /branches`, theirs wins (earlier in the barrel); both return a string array, so either is fine.
3. Add to `DEMO-ACCOUNTS.md`: Afzal HR — post news, schedule one, News settings; Afzal Super Admin — pair a TV with 123456, show a post now, unpair; Afzal Manager — post through the grant, can't edit others' posts.

## Review fixes
- A new post now sends `createdBy`, `createdByRole`, `createdAt` and `tenantId` exactly as the website's save does (dash.html:19039). The server stores the body as sent (server.js:9122), so without them a phone post had no author: it never showed in "My posts" and only a Super Admin could edit or delete it. The demo POST used to fill the author from the session, which hid the bug; it now takes it from the body like the server.

## Tested
`npx tsc --noEmit` and `npx expo lint` are clean (whole project, at hand-off).
Web preview on its own origin (127.0.0.7:8090), 390×844 dark and 320×700 light (no sideways overflow on any newsroom screen; a long
link on the post screen now wraps). The boot crash in "Needs the integrator" 1 was worked around in that tab only by patching the
served bundle in memory — no file was changed for it. Swipes were run through their accessibility "activate" handler.
- **Afzal HR**: studio lists (mine 2 / all 14); new post with Emergency priority (red warning, swiped) → View post; edit
  (starts at "Nothing has changed yet", TV priority "Leave unchanged", swiped save); delete (swiped); pop-up form demands a
  picture; News settings: birthday switch off/on, Send a test (swiped). Office TVs → sent home. More shows News studio;
  News screen shows the studio button.
- **Afzal Super Admin**: TVs list (2 paired, 1 online); pair with 111111 (server's words shown) then 123456 (connected); Sync,
  Show a post now (Showing now + log update), settings sheet save, unpair (swiped), remove custom media (swiped); Edit/Delete on
  another person's post.
- **Afzal IT Admin**: studio (own post only editable; others read "Only … or a Super Admin can change this post"); settings and
  TVs → sent home.
- **Afzal Manager**: studio through the "Who can post news" grant; posted a new post.
- **Afzal Employee**: studio → sent home; no studio button on News.
Not driven (needs the OS file picker): picking a picture / file / banner / TV upload.
