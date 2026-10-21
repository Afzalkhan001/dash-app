# Push: hand-off checklist for the integrator

## Plug-ins (already wired through `features/domains.ts`; no new registration needed)

- **Workspace row:** `push.settings`, "Notifications", in section `links`, at `/admin/push`, with module `security` and
  `tourId: more.push.settings`.
  - [ ] Optional: move it next to App lock in More's own settings card. `features/push/settings-screen.tsx`
    is the screen, and a row there can simply push `PUSH_ROUTES.settings`.
- **Home card:** `push.ask`, placement `top`, order 5. This is the one-time soft ask. It renders `null` once
  the ask is answered or dismissed, or when notifications can't arrive (web, or Expo Go with a real account).
  That breaks the EXTENSION-POINTS §6 "never null" rule. Home uses flex `gap`, so nothing shows; please confirm
  that is acceptable.
- **Tour step:** `push.settings` on `/more`, "Notifications".
- **+ actions:** none. **Inbox kinds:** none.

## Shared edits I need

- [ ] **Mount `<PushBridge/>`** from `features/push/bridge` once in `src/app/(app)/_layout.tsx`, next to
  `<MeetsWatcher/>`. It is idempotent and renders nothing. Until then the bridge starts when Home's card
  or the Notifications screen mounts, so a tap that cold-starts the app still routes, just slightly later.
- [ ] **Badge:** call `setAppBadge(count)` from `lib/push` wherever the Inbox tab badge count is computed
  (`features/inbox/use-inbox`). It never loads expo-notifications just to set the badge.
- [ ] `app.json`, once the owner provides the files (see `docs/PUSH.md`):
  - `android.googleServicesFile: "./google-services.json"`;
  - `"icon": "./assets/images/notification-icon.png"` in the `expo-notifications` plugin.
- No new dependencies. No new fixture exports. I read `taskStore`, `visitStore`, `ticketStore`,
  `reimbursementStore`, `pettyStore`, `bountyTaskStore`, `newsStore` and `currentPersona`.
- No Stack options.

## Files

- **App:** `src/lib/push.ts`, `src/api/push.ts`, `src/features/push/*`, `src/app/(app)/admin/push/index.tsx`,
  `src/demo/fixtures/push.ts`.
- `src/auth/session.ts` now has `onBeforeSignOut(fn)`. `signOut()` runs the hooks first, while the token still
  works, capped at 3 s. Push uses it to remove the phone from the server.
- **Docs:** `docs/PUSH.md` (owner steps), `docs/SERVER-CHANGES.md` (the local server branch).
- **Server:** local branch `feature/mobile-push` in the company repo, as worktree `../dash-mobile-push`. It has
  2 commits and is not pushed.

## Behaviour

- **Endpoints:** the app calls `POST /push/devices`, `/push/devices/remove` and `/push/test`. These exist only on
  the new server branch. A 404 shows "DASH isn't sending notifications yet" and nothing else breaks.
- **Expo Go with a real account:** "Available in the installed app". Nothing registers, and
  expo-notifications is never loaded.
- **Demo:** "Try a sample" (from `GET /push/demo-samples`, demo only) sends a local notification after 3 s, and
  tapping it opens the record. On the web preview the sample shows as a banner inside the page.
- **Taps:** they open only whitelisted app paths (`safePushUrl`); anything else opens `/inbox`. A tap that
  arrives before the session is ready is opened afterwards.

## Tested

- **Checks:** `npx tsc --noEmit` and `npx expo lint` are clean. `npx expo export --platform web` builds (into a
  scratch directory).
- **Server:** `test/push_and_security.test.js` passes 18 of 18. The existing offline suite has the same 30
  failures as the base commit.
- **Not done: visual check in the preview.** The 8090 server never served the bundle: the entry bundle request
  hung for more than 5 minutes, and the integrator had reported 8090 as stale. Please run this once 8090 is
  restarted:
  1. Sign in with the demo, then go to "Try a demo role" › Afzal Employee › More › Notifications.
  2. Tap "Try a sample". A banner should appear after 3 s; tapping it opens the task.
  3. Repeat as Manager, Accounts, HR, IT Admin and Visitor Manager. Each role gets its own samples from
     `fixtures/push.ts`.
  4. Check at 390×844 and 320×700, in light and dark.
