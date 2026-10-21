# DASH mobile: first-login tour (coach marks)

Version 1 (21 Oct 2026). Status: **built**: engine in `src/ui/tour/`, role tours in `src/features/tour/` (`role-tours.ts` steps and copy, `hosts.tsx` context, `use-role-tour.ts` first-run start and replay, `replay-row.tsx` "Show me around"). Built differences from this spec: the demo account gets one extra step before "See this again" ("Try another role", pointing at Switch demo role), so demo tours can have 9 steps; "Open to decide" points at the first request, never a visitor at reception; a target filling 40 % or more of the screen docks the card at the bottom (no arrow) rather than squeezing its text; on a narrow phone Back and Next share a row unless text is at 130 % or more. Covers the staff app (`src/app/(app)`) and the vendor portal (`src/app/(vendor)`). Read docs/DESIGN.md first (0A app structure, 0B plain words, 13 motion, 14 accessibility); this file only adds what is new.

Every step below points at something the person **actually sees**. Each was checked against the real screens and gates: `src/lib/access.ts`, `src/features/more/menu.ts`, `src/features/create/create-sheet.tsx`, `src/features/inbox/use-inbox.ts`, `src/features/home/*`, `src/features/me/*`, `src/app/(app)/(tabs)/*`, `src/app/(vendor)/portal/**` and the demo personas (`src/demo/personas.ts`, `src/demo/vendor/personas.ts`).

---

## 0. In one paragraph

The first time someone signs in, DASH offers a one-minute tour. The screen dims. A spotlight opens around one control, a white arrow points at it, and a small card says what it is in one or two plain sentences. The card has "2 of 7", step dots, **Back / Next** and **Skip**. Each role gets its own 5–8 steps, and the tour switches tabs when it needs to. A step whose control isn't on this person's screen is skipped without anyone noticing. The tour shows once per person (remembered per user id and tour version). It can be skipped at any step and replayed from **More → Show me around** (vendors: **Profile → Show me around**). It never sits between a person and their work.

---

## 1. What we take from good first-run tours

These are patterns, not copies. The app's own words and look (Ember tokens, Plus Jakarta Sans, the kit) stay.

| Pattern | Seen in | What DASH does with it |
|---|---|---|
| Point at the bottom bar first, because that is how people get around | Keka, Darwinbox (bottom-bar HR apps) | Every staff tour spends steps on Me, +, Inbox and More, in that order of use |
| A different tour for each role | Darwinbox, Keka (manager vs employee home) | 14 staff roles map to 12 tours; vendors get 3, one per registration state |
| Short tooltips with progress dots and Skip on every step | Revolut | "2 of 7", dots, Skip in the card's top corner on every step |
| One highlighted thing per step, with a short message | Material "feature discovery" | One spotlight, one title (≤ 4 words), at most two short sentences |
| Let people come back to it later | Notion (getting-started is always reachable) | More → Show me around; vendor Profile → Show me around |
| Upfront tutorials get skipped and forgotten, so keep them short, relevant and optional | NN/g research on onboarding | At most 8 steps, about a minute, a Skip that is never more than one tap away, and an intro card that says how long it takes |

---

## 2. Rules (behaviour)

### 2.1 When it shows

- **Once per person.** The first time a signed-in person reaches a tab root (staff: Home; vendor: Home) and has no tour record on this phone.
- **Remembered** in AsyncStorage under `dash.tour:<kind>:<id>`. Staff use `user.id` (session). Vendors use `vendor.id` (`/vendor/me`). The record looks like `{ "tour": "manager", "v": 1, "state": "done" | "skipped" | "started", "at": "<ISO>" }`. Records are per phone (no server change is allowed). Signing out does not clear them.
- **Shows again only when** one of these is true:
  - **Tour version.** `TOUR_VERSION` (in `steps.ts`) is higher than the record's `v`. Bump it only when the steps change in a way people should see.
  - **Role change.** `tourIdFor(person)` is no longer the recorded `tour`, for example an employee who became a manager, or a vendor who was just approved. The intro then reads "You're now a Manager. Here's what's new for you." Vendors see "You're approved. Here's where your bills and agreements are."
  - **Interrupted.** The record says `started` because the app was killed or a link took over mid-tour. The tour shows once more, then never again.
- **Waits until the screen is calm.** All of these must hold, and then it waits another **700 ms** (Home's entrance settles within 520 ms):
  - The fonts and theme are loaded. The app lock is not covering the app.
  - Access is known: `useHrMe().isPending` is false and `useInboxSummary().discovering` is false. Vendors need `useVendorMe()` to have data.
  - The person is on a tab root. No pushed screen is on top, and no Sheet, Alert or MenuSheet is open.
  - The app is in the foreground.
- **Not shown** to a deactivated vendor (403 or `inactive`), and never while the demo role picker is open.
- **Demo:** each "Afzal <Role>" persona has its own user id (`personaUserId`), so every persona gets its tour on first open. That makes it easy to test: sign in with 8328617610 → 123456, or "Try a demo role", then use More → Switch demo role.

### 2.2 Skipping, ending, replaying

- **Skip** is on every step, including the intro. It ends the tour, saves `skipped`, and shows one toast: "You can see the tour again in More." (vendor: "…in Profile.").
- **Done** (the last step's Next) saves `done`. No toast.
- **Android back**, the iOS escape gesture (two-finger Z) and **Esc** on web all mean Skip. Back never navigates the app while the tour is open.
- **After the tour ends**, the person goes back to the tab and Me segment where the tour started. That is Home on first sign-in, and More (or vendor Profile) on a replay.
- **Replay:** a new row in **More → Account**, "Show me around", subtitled "A one-minute tour of the app". It sits under Appearance. Vendors get the same row in **Profile → Account**, above Sign out. Replay skips the intro card and starts at step 1 on the step's own screen. Replay never changes the stored record.

### 2.3 Never blocks a required action

- Skip is always one tap away, and the intro offers it first.
- The tour **never starts** on top of a pushed screen, a sheet or the app lock. If a notification or deep link opens a screen mid-tour, the tour closes and is saved as `started`.
- **Tap-through targets.** On a target marked tap-through (see 6.1: the Clock in / Clock out pill, the bottom-bar tabs and the + button), tapping inside the spotlight **does the real thing**: it clocks in, opens the tab or opens the + sheet. The tour then ends and is saved as `done`. So someone who opens DASH at 9:30 to clock in is never held up.
- **Any other spotlight**: a tap means Next.
- **Dim area**: a tap does nothing, so a stray tap can't skip or advance by accident.
- **The tour never acts for anyone.** It never clocks in, approves, opens a form or opens a sheet. The + step describes what's inside the sheet instead of opening it.
- **App lock** engages (30 s in the background): the tour stays where it was under the lock cover (TourHost is below AppLockGate) and carries on after unlocking.
- **Sign-out, a 401, or a demo role switch**: the tour closes at once.

### 2.4 Steps that aren't there are skipped

Two layers, so the dots are right from the start and the tour still never points at nothing:

1. **`when(ctx)`** on each step uses the same gates the screen uses (6.2). It decides up front which steps this person gets, and so the dot count.
2. **At run time**, before a step shows, the host:
   - goes to the step's screen;
   - asks the target to scroll itself into view;
   - measures it.

   If the target hasn't registered or measured to a non-zero size within **600 ms**, or less than 80 % of it is visible between the header and the tab bar (48 dp of its height for targets taller than the window), the step is dropped. The count shrinks with it ("3 of 6"). Back skips dropped steps too.

If a tour ends up with no steps, nothing shows and the record is saved as `done`.

---

## 3. Look and motion

### 3.1 Anatomy

```
 ┌────────────────────────────────────┐
 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ▓ = scrim (dimmed app)
 │▓▓▓▓ ┌──────────────────────────┐ ▓▓▓│
 │▓▓▓▓ │  spotlight (the target,  │ ▓▓▓│  hole = target + 6 dp, white 2 dp ring
 │▓▓▓▓ │  e.g. the Clock in pill) │ ▓▓▓│
 │▓▓▓▓ └──────────────────────────┘ ▓▓▓│
 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ⤴ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  arrow: white, points at the hole
 │▓▓ ┌──────────────────────────────┐ ▓│
 │▓▓ │ 1 of 8                  Skip │ ▓│  counter (caption, muted) · Skip (text button)
 │▓▓ │ Clock in here                │ ▓│  title (heading)
 │▓▓ │ Tap Clock in when you start  │ ▓│  body (body), max 2 sentences
 │▓▓ │ work. Tap Clock out when…    │ ▓│
 │▓▓ │ ━ • • • • • • •   Back  Next │ ▓│  dots (decorative) · Back (ghost) · Next (primary)
 │▓▓ └──────────────────────────────┘ ▓│
 │▓▓▓▓▓▓ ( Home  Me  (+)  Inbox  More )│  the tab bar is dimmed too
 └────────────────────────────────────┘
```

**Intro card** (first sign-in only, no spotlight, centred on the scrim):

- Title "Welcome, {first name}" (vendor: the trade name).
- Body: the role line (section 7) plus "It takes about a minute."
- Buttons, always stacked: **Show me around** (primary, full width), then **Skip** (text) under it.
- The intro has no counter or dots, and it is not counted as a step.

### 3.2 Parts

| Part | Spec |
|---|---|
| Scrim | Full window, new token `palette.tourScrim`: light `rgba(28,18,12,0.66)`, dark `rgba(6,4,3,0.76)` (in `theme/tokens.ts` and `theme/dark.ts`, owned by the kit). Drawn with **react-native-svg**: one `Path` with `fillRule="evenodd"` (window rect plus a rounded-rect hole), so the hole is a true cut-out on iOS, Android and web |
| Hole | The target's measured rect plus 6 dp each side. It is never smaller than 48 × 48 (grown around its centre). Corners: `shape: 'circle'` gives a circle (the + button, round icon buttons); otherwise the target's radius + 6 (default `radius.md` + 6) |
| Ring | 2 dp stroke around the hole in `palette.onPrimary` at 90 % (white in both schemes) |
| Arrow | A short curved arrow, about 40 × 40 dp, 3 dp stroke with round caps and an open chevron head, in `palette.onPrimary`. It runs from the card's edge towards the hole and stops 6 dp short of the ring. It is mirrored when the hole is left of the card's centre, and flipped when the card is above the hole. Its x is the hole's centre, clamped to 28 dp inside the card's edges. It is decorative (hidden from screen readers) |
| Card | `palette.surface`, `radius.xl`, `shadow.float`, 1 dp `palette.glassLine` rim (it separates the umber card from the dark scrim). Padding `layout.cardPad` (`cardPadCompact` when compact). Width `min(window − 32, 360)` with 16 dp gutters, centred on the hole and clamped to the gutters |
| Counter | "2 of 7", Text `caption`, muted |
| Skip | Button `text`, size `sm`, 48 dp hit area, top-right of the card |
| Title | Text `heading`, `accessibilityRole="header"`, at most 4 words |
| Body | Text `body`, at most 2 short sentences (about 120 characters) |
| Dots | One per step this person gets (from `when`). The current one is a 16 × 6 pill in `palette.primaryText`; the others are 6 × 6 dots in `palette.textFaint`. Decorative: the counter already says it |
| Back / Next | Button `ghost` + Button `primary`, size `md`, same height. Back is hidden on step 1. The last step's Next reads **Done** |

Only Text variants are used, so Plus Jakarta Sans everywhere. Every colour is read at render time or through `themedStyles` (the tokens are live), never in a module-level constant.

### 3.3 Where the card goes

1. **R** is the window minus the safe-area top and bottom insets.
2. **Below** the hole when the room below is at least card height + arrow (40) + 16. Otherwise **above** when the room above is. Bottom-bar targets always get the card above, with the arrow pointing down.
3. **Neither fits** (a tall target such as the clock card at large text): the card goes on the side with more room. Its body scrolls inside, with a minimum height of 160 dp.
4. **Still no room**: the card docks to the bottom of R over the scrim, the arrow is hidden, and the hole is scrolled so its top 96 dp stays visible above the card.
5. **Measurement** uses `measureInWindow` for both the target and TourHost (subtract the host's offset, normally 0). The host re-measures when the window changes size (rotation, web resize) and when the target's `onLayout` fires.

### 3.4 Motion (all on the UI thread; shared values are written only in effects and handlers)

| What | Spec |
|---|---|
| Tour in | Scrim opacity 0 → 1 over 240 ms. The card uses the Reveal entrance: opacity over 240 ms, translateY 12 → 0 over 320 ms |
| Next or Back on the same screen | The hole's x, y, w, h and radius glide with `withSpring(…, motion.layout)`. The old card fades out in 100 ms and the new one fades in over 160 ms. The arrow redraws |
| Next or Back across a tab switch | Card and arrow fade out (100 ms) and the hole closes into the scrim. Then navigate, scroll, measure. The hole opens and the card fades in (160 ms) |
| Arrow | Draws in over 240 ms (stroke dash), then nudges 6 dp towards the target twice (300 ms out, 300 ms back, `Easing.inOut(Easing.quad)`), then rests. It does not loop |
| Pulse | Once per step, a 2 dp ring grows from the hole edge to 1.25× while fading 0.5 → 0, over 450 ms (like TabFab's press ring) |
| Tour out | Everything fades out in 200 ms |
| Reduce Motion (`useReducedMotion()`) or a screen reader on | Opacity only (160 ms cross-fades). No glide (the hole jumps), no nudge, no pulse, and the arrow is static |
| Haptics | `haptic.select()` on Next, Back, Skip and Show me around. Nothing on a dropped step |

### 3.5 Light / dark, 320 dp, large text

- **Light / dark:** the scrim token differs per scheme. The card is `surface`, with `text` / `textMuted` inks and a `glassLine` rim. The arrow and ring are white in both schemes. Next is the primary Button (brand text in dark uses `primaryText`, as the kit already does). Check each step in both schemes.
- **Fonts:** the title's `heading` caps at 1.4× and the body's `body` at 1.6× (MAX_FONT_SCALE). The card uses `minHeight`, never a fixed height, and its body scrolls inside when it can't grow.
- **When compact** (`shouldStack(layout, { below: 'narrow' })`, or text at 1.3× and up): Next goes full width, then a row with Back (text) on the left. The dots move onto their own line above the buttons.
- **At 320 dp** the card is 288 dp wide. Copy limits: titles at most 4 words (about 22 characters) and bodies at most 2 sentences, so 1× text never needs more than 4 body lines at 320 dp.
- **Small targets:** the hole is at least 48 × 48. Next, Back and Skip have 48 dp hit areas with 8 dp between them.

---

## 4. Accessibility

- **Modal for screen readers.** While the tour shows, TourHost has `accessibilityViewIsModal`. The app's root Stack wrapper gets `importantForAccessibility="no-hide-descendants"` (Android) and `accessibilityElementsHidden` (iOS), so focus can't wander into the dimmed app. On web, the overlay gets `role="dialog"` and `aria-modal`.
- **Each step is announced:** `AccessibilityInfo.announceForAccessibility("Step 2 of 7. Your Inbox. Visitors at reception and policies to read show here.")`. Focus then moves to the title (`setAccessibilityFocus`). On Android the card also has `accessibilityLiveRegion="polite"`.
- **Focus order:** title → body → Back → Next → Skip. Skip is also the escape action (`onAccessibilityEscape`), the Android back button and Esc on web, so it is always reachable without hunting.
- **The body names the control** as it reads on screen ("the Inbox tab", "the + button in the middle", "your photo"), because a screen-reader user can't see the spotlight. Scrim, hole, ring, arrow, pulse and dots are decorative (`DECOR`: no pointer events, hidden).
- **Tap-through needs no extra stop.** It is a shortcut for sighted users; screen-reader users finish with Next or Done.
- **Reduce Motion and screen readers:** see 3.4.
- **Contrast:** the card text uses the standard inks on `surface`, which meet 4.5:1. The white arrow and ring on the scrim are well above 3:1 in both schemes.

---

## 5. Copy rules

- Second person, plain words (DESIGN.md 0B): "Waiting", not "Pending". "Attendance fix", not "Regularization". "Project owner", not "Keka Code Owner".
- Say "tap", never "click". Name buttons exactly as they read ("Clock in", "Show me around").
- Titles: at most 4 words, sentence case, no full stop. Bodies: at most 2 short sentences.
- Say what it's for, not how it's built. Don't say what the person can't do, except where the website is the only place for their work (visitor manager, display, master admin, section 7).
- Every string lives in `src/features/tour/steps.ts`. Screens don't hold tour copy.
- `{…}` marks a value filled at run time from data the app already has.

**The + step's body is built at run time** from `useCreateActions()`, so it is always true for this person. It takes the first three labels, mapped to verbs:

| Action label | Verb phrase |
|---|---|
| Apply leave | apply for leave |
| Work from home | ask to work from home |
| Fix attendance | fix attendance |
| Claim expense | claim an expense |
| Petty cash bill | add a petty cash bill |
| Raise a ticket | raise a ticket |
| Invite a visitor | invite a visitor |
| Salary advance | ask for a salary advance |

The phrases are joined "A, B or C", with "and more" added when there are more than three. For example: "Tap + to apply for leave, fix attendance or claim an expense, and more."

---

## 6. Targets

A **target id** is a stable name for one control. Screens mark them with `<TourTarget id="…">` (a View wrapper) or `useTourTarget(id, opts)` (ref + onLayout, for components that already forward a ref or can't take a wrapper, such as tab buttons).

### 6.1 Catalogue

**Staff: tab bar** (`src/ui/tab-bar.tsx` adds `tourId` to TabButton and TabFab; `(tabs)/_layout.tsx` passes the ids). All of these are **tap-through**.

| Target id | What it is | Tap-through does |
|---|---|---|
| `tabs.home` | Home tab | open Home |
| `tabs.me` | Me tab | open Me |
| `tabs.create` | the raised + button (circle) | open the Create sheet |
| `tabs.inbox` | Inbox tab, with its badge | open Inbox |
| `tabs.more` | More tab | open More |

**Staff: Home** (`(tabs)/index.tsx`, `features/home/*`)

| Target id | What it is | Present when |
|---|---|---|
| `home.avatar` | my photo in the header (→ My profile), circle | always |
| `home.clockButton` | the Clock in / Clock out pill in ClockCard (`features/attendance/clock-card.tsx`). **Tap-through:** runs the pill's own press | `sections.clock` |
| `home.shortcuts` | the shortcut grid | `useShortcuts().length ≥ 2` |
| `home.needsYou` | the "Needs you" card | `useNeedsYou().rows.length > 0` |
| `home.whosIn` | "Who's in today" tiles | `useWhosIn() != null` (HR and department admins) |

**Staff: Me** (`(tabs)/me.tsx`, `features/me/*`)

| Target id | What it is | Present when |
|---|---|---|
| `me.calendar` | the month calendar in Me › Attendance | `sections.clock` |
| `me.leaveBalance` | the Leave balance hero in Me › Leave | `useLeaveAccess().enabled && hasLeave` (and HR has set up leave types) |

**Staff: Inbox** (`(tabs)/inbox.tsx`, `features/inbox/*`)

| Target id | What it is | Present when |
|---|---|---|
| `inbox.summary` | the Waiting · Done today cards | `hasInboxSummary(queues)` |
| `inbox.chips` | the kind filter chips | 2 or more kinds waiting |
| `inbox.firstItem` | the first row of the list (first ActivityRow in `InboxGroups`) | at least 1 item |
| `inbox.history` | the round Past decisions button in the header (TabRootHeader `actions` gets `tourId`), circle | someone who reviews requests or project claims |

**Staff: More** (`(tabs)/more.tsx`; tiles get `tourId` from `MenuItem` in `features/more/menu.ts`)

| Target id | What it is | Present when |
|---|---|---|
| `more.expenseClaims` | "Expense claims" tile | `webNavHas(role, 'accounts')` |
| `more.pettyCash` | "Petty cash" tile | same |
| `more.myTasks` | "My tasks" tile | `mytasks` or `tasks` in the role's menu |
| `more.support` | "Help & support" tile | `support` in the role's menu |
| `more.myTeam` | "My team" tile | org on and `hasTeam(role)` |
| `more.people` | "People" tile (directory, for no-team logins) | org on and not `hasTeam(role)` (master admin, display) |
| `more.news` | "News" tile | `canSeeAnnouncements` |
| `more.bounty` | "Bounty rewards" tile | `bounty` in the role's menu and switched on |
| `more.appLock` | the App lock row | always shown; the step needs `support.hardware && support.enrolled` |
| `more.appearance` | the Appearance row | always |
| `more.showMeAround` | **new** "Show me around" row (Account list, under Appearance) | always |

**Vendor: tab bar** (`(vendor)/portal/(tabs)/_layout.tsx`). All of these are **tap-through**.

| Target id | What it is | Present when |
|---|---|---|
| `vtabs.home` | Home tab | always |
| `vtabs.bills` | Bills tab | approved |
| `vtabs.agreements` | Agreements tab (badge = waiting to sign) | approved |
| `vtabs.profile` | Profile tab | always |

**Vendor: Home** (`features/vendor/home.tsx`)

| Target id | What it is | Present when |
|---|---|---|
| `vendor.duesHero` | the "Due to you" hero | approved and at least 1 bill |
| `vendor.vendorId` | the Vendor ID chip on that hero | approved, with a `vendorCode` |
| `vendor.toSign` | the "To sign" list | approved and an agreement still signable |
| `vendor.registrationHero` | the "Your registration" hero | not approved |
| `vendor.stepProgress` | StepProgress on that hero | `draft` / `mobile_verified` |
| `vendor.registrationButton` | the hero's primary pill: Continue registration, Fix details or Update details | `EDITABLE_STATUSES` |
| `vendor.checkStatus` | the "Check status" button | `submitted` / `pending_verification` |
| `vendor.todoKyc` | the "Verify ID and bank" row in Still to do | filling in, and KYC not done |
| `vendor.todoDocs` | the first document row in Still to do | filling in, and a document missing |

**Vendor: Profile** (`(vendor)/portal/(tabs)/profile.tsx`)

| Target id | What it is | Present when |
|---|---|---|
| `vendor.profileDetails` | the "Your details" list | always |
| `vendor.profileDocuments` | the "Documents" list | at least 1 document |
| `vendor.showMeAround` | **new** "Show me around" row in Account | always |

### 6.2 Step context (`ctx`)

TourHost builds `ctx` once per tour, from hooks the screens already use. It fires no new requests and reads only cached or shared queries.

- **Who and access:** `role`, `useAccess()` (sections, approvals, isHrAdmin, isSystemRole, `feature()`), `useLeaveAccess()`, `usePayAccess()`.
- **Me:** `meSegments`. Move the Me tab's rule (`attendance || clock || shifts || regularization` / `leave.enabled` / `pay.pay`) into a shared `useMeSegments()` in `features/me/tabs.ts` so Me and the tour can't disagree.
- **Home:** `shortcuts = useShortcuts().length`, `whosIn = useWhosIn() != null`, `needsYou = useNeedsYou().rows.length`.
- **+ sheet:** `createActions = useCreateActions()`.
- **Inbox:** `inbox` from `useInboxSummary()`: item count, kinds waiting, `reviews` (has Past decisions), `withSummary`.
- **More:** `moreTiles = buildMoreMenu(access).tiles.map(t => t.key)`, and `lockAvailable` from `useAppLock()`.
- **Vendor:** `status`, `kycState` and `openDocs` (the same logic as `RegistrationHome`, moved into a shared helper), `approved`, `toSign`, `bills`, `vendorCode`.

---

## 7. Tours

**Tour ids.** `tourIdFor(person)` maps each person to one tour:

| Role or state | Tour |
|---|---|
| `employee`, and any unknown role (menus fall back to employee) | `employee` |
| `professional` | `professional` |
| `manager` | `manager` |
| `admin` | `admin` |
| `hr` | `hr` |
| `super_admin`, `ceo`, `coo` | `leadership` |
| `it_admin` | `it_admin` |
| `accounts` | `accounts` |
| `app_manager` | `app_manager` |
| `visitor_manager` | `visitor_manager` |
| `announcement_viewer` | `display` |
| `master_admin` | `platform` |
| Vendor, `approved` | `vendor.approved` |
| Vendor, `draft`, `mobile_verified`, `submitted`, `pending_verification` | `vendor.onboarding` |
| Vendor, `correction_required`, `rejected` | `vendor.changes` |
| Vendor, `inactive` | no tour |

**Reading the tables.** **Screen** is where the tour takes the person before the step; "—" means stay where you are (bottom-bar targets are visible everywhere). **When** is the `when(ctx)` gate; each step also needs its target on screen (2.4).

### 7.0 Shared steps (used by several tours)

| Key | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| S-CLOCK | `home.clockButton` | Home | Clock in here | Tap Clock in when you start work. Tap Clock out when you leave. | `sections.clock` |
| S-ME | `tabs.me` | — | Your own work | Your attendance, leave and pay are on Me. *(the words follow `meSegments`: e.g. "Your attendance, leave and payslips are on Me.")* | `meSegments` has personal parts (clock, leave or pay) |
| S-ME-TEAM | `tabs.me` | — | Team attendance | Who's in today, holidays and shifts are on Me. | `meSegments` = attendance only and `isSystemRole` |
| S-CREATE | `tabs.create` | — | Start something new | Tap + to {first three create actions}, and more. *(5)* | `createActions.length ≥ 1` |
| S-INBOX | `tabs.inbox` | — | Your Inbox | Anything waiting on you shows here. The red number says how many. | always |
| S-OPEN | `inbox.firstItem` | Inbox | Open to decide | Tap a request to see it in full. Approve or reject it there. | `inbox.items ≥ 1` |
| S-CHIPS | `inbox.chips` | Inbox | Filter by type | Tap a type to see only those, like Leave or Petty cash. | `inbox.kinds ≥ 2` |
| S-TEAM | `more.myTeam` | More | My team | Your manager, teammates and who is off this week. | `moreTiles` has `people` and `hasTeam` |
| S-REPLAY | `more.showMeAround` | More | See this again | Tap Show me around any time to replay this tour. *(button: Done)* | always |

### 7.1 Employee (`employee`): 8 steps

Intro: "Here's where to clock in, apply for leave and find your payslips. It takes about a minute."

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `home.clockButton` | Home | Clock in here | *S-CLOCK* | `sections.clock` |
| 2 | `home.shortcuts` | Home | One-tap shortcuts | Apply for leave, open payslips or claim an expense from here. | `shortcuts ≥ 2` |
| 3 | `tabs.me` | — | Your own work | *S-ME* | S-ME |
| 4 | `me.leaveBalance` | Me › Leave | Your leave balance | Days you have left, by leave type. Tap Apply leave to ask for time off. | `leave.enabled && hasLeave` |
| 5 | `tabs.create` | — | Start something new | *S-CREATE* | S-CREATE |
| 6 | `tabs.inbox` | — | Your Inbox | Visitors waiting for you at reception and policies to read show here. | always |
| 7 | `more.myTeam` | More | My team | *S-TEAM* | S-TEAM |
| 8 | `more.showMeAround` | More | See this again | *S-REPLAY* | always |

### 7.2 Professional (`professional`): 8 steps

Intro: "Here's where to clock in, see your bookings and find your payslips. It takes about a minute."

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `home.clockButton` | Home | Clock in here | Tap Clock in when your work starts. Tap Clock out when it ends. | `sections.clock` |
| 2 | `tabs.me` | — | Your own work | Your attendance, leave and payslips are on Me. | S-ME |
| 3 | `me.calendar` | Me › Attendance | Your month | Each day shows if you were in, late or on leave. Tap a day to see it or fix it. | `sections.clock` |
| 4 | `tabs.create` | — | Start something new | *S-CREATE* | S-CREATE |
| 5 | `tabs.inbox` | — | Your Inbox | Visitors at reception and policies to read show here. | always |
| 6 | `more.myTasks` | More | Your tasks | Shoot bookings and tasks given to you are here. Start and end each one from its card. | `moreTiles` has `tasks` |
| 7 | `more.myTeam` | More | My team | See who you report to and who is off this week. | S-TEAM |
| 8 | `more.showMeAround` | More | See this again | *S-REPLAY* | always |

### 7.3 Manager (`manager`): 8 steps

The Inbox carries approvals and "My team" carries the people.

Intro: "Here's where to clock in, approve your team's requests and see who's in. It takes about a minute."

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `home.clockButton` | Home | Clock in here | *S-CLOCK* | `sections.clock` |
| 2 | `home.whosIn` | Home | Who's in today | Teammates who clocked in today, and who is late. Tap See all for the full list. | `whosIn` |
| 3 | `tabs.inbox` | — | Approve in Inbox | Your team's leave, attendance fixes and claims wait here. The red number says how many. | `approvals.length > 0` or `inbox.items > 0` |
| 4 | `inbox.firstItem` | Inbox | Open to decide | *S-OPEN* | S-OPEN |
| 5 | `tabs.me` | — | Your own work | Your own attendance, leave and pay are on Me. | S-ME |
| 6 | `tabs.create` | — | Start something new | *S-CREATE* | S-CREATE |
| 7 | `more.myTeam` | More | My team | Your direct reports, peers and who is off this week. | S-TEAM |
| 8 | `more.showMeAround` | More | See this again | *S-REPLAY* | always |

### 7.4 Admin (`admin`): 8 steps

The department admin, for example Production.

Intro: "Here's where to clock in, approve your team's requests and find your tasks. It takes about a minute."

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `home.clockButton` | Home | Clock in here | *S-CLOCK* | `sections.clock` |
| 2 | `home.whosIn` | Home | Who's in today | See who in your team clocked in, and who is late. | `whosIn` |
| 3 | `tabs.inbox` | — | Approve in Inbox | Leave, attendance fixes and claims from your team wait here. | `approvals.length > 0` or `inbox.items > 0` |
| 4 | `inbox.firstItem` | Inbox | Open to decide | *S-OPEN* | S-OPEN |
| 5 | `tabs.me` | — | Your own work | *S-ME* | S-ME |
| 6 | `tabs.create` | — | Start something new | *S-CREATE* | S-CREATE |
| 7 | `more.myTasks` | More | My tasks | Tasks given to you are here. Start, pause and end each one from its card. | `moreTiles` has `tasks` |
| 8 | `more.showMeAround` | More | See this again | *S-REPLAY* | always |

### 7.5 HR (`hr`): 8 steps

Company-wide approvals and people. HR is a system role: it has no clock, no own leave and no pay in the app.

Intro: "Here's where requests from every team wait for you, and where to find people. It takes about a minute."

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `home.needsYou` | Home | Needs you | The newest requests waiting for you. Tap one to open it. | `needsYou > 0` |
| 2 | `home.whosIn` | Home | Who's in today | Who clocked in across the company, and who is late. | `whosIn` |
| 3 | `tabs.inbox` | — | Company approvals | Leave, attendance fixes, salary claims and salary advances from every team wait here. | always |
| 4 | `inbox.chips` | Inbox | Filter by type | Tap a type to see only those, like Salary advance. | S-CHIPS |
| 5 | `inbox.history` | Inbox | Past decisions | Everything you approved or rejected is here. | `inbox.reviews` |
| 6 | `tabs.me` | — | Team attendance | *S-ME-TEAM* | S-ME-TEAM |
| 7 | `more.myTeam` | More | People and teams | Find anyone, see each department and open the org chart. | S-TEAM |
| 8 | `more.showMeAround` | More | See this again | *S-REPLAY* | always |

### 7.6 Super Admin, CEO, COO (`leadership`): 8 steps

Intro: "Here's where approvals from every team wait, and how to see who's in. It takes about a minute."

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `home.needsYou` | Home | Needs you | The newest requests waiting for you. Tap one to open it. | `needsYou > 0` |
| 2 | `home.whosIn` | Home | Who's in today | Who clocked in across the company today, and who is late. | `whosIn` |
| 3 | `tabs.inbox` | — | All approvals | Requests from every team that wait for you are here. | always |
| 4 | `inbox.summary` | Inbox | Waiting and done | How much is waiting, for how long, and what you decided today. | `inbox.withSummary` |
| 5 | `tabs.me` | — | Team attendance | Who's in today and the holiday list are on Me. | S-ME-TEAM |
| 6 | `more.news` | More | Company news | Read company announcements here. New ones also show on Home. | `moreTiles` has `announcements` |
| 7 | `more.myTeam` | More | People and teams | Find anyone, see each department and open the org chart. | S-TEAM |
| 8 | `more.showMeAround` | More | See this again | *S-REPLAY* | always |

CEO and COO have no demo persona. Their real access comes from `/hr/me`, so `when` and the run-time check trim whatever they don't have.

### 7.7 IT Admin (`it_admin`): 8 steps

Intro: "Here's where your team's requests and your IT tickets are. It takes about a minute."

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `home.needsYou` | Home | Needs you | The newest requests waiting for you. Tap one to open it. | `needsYou > 0` |
| 2 | `tabs.inbox` | — | Approve in Inbox | Leave, work from home and attendance fixes from your team wait here. | `approvals.length > 0` |
| 3 | `inbox.firstItem` | Inbox | Open to decide | *S-OPEN* | S-OPEN |
| 4 | `tabs.me` | — | Team attendance | Who's in today and the holiday list are on Me. | S-ME-TEAM |
| 5 | `tabs.create` | — | Start something new | *S-CREATE* (claim an expense, add a petty cash bill or raise a ticket…) | S-CREATE |
| 6 | `more.myTasks` | More | Tickets and tasks | IT tickets and tasks given to you are here. Start and end each one from its card. | `moreTiles` has `tasks` |
| 7 | `more.myTeam` | More | My team | Your IT team and who is off this week. | S-TEAM |
| 8 | `more.showMeAround` | More | See this again | *S-REPLAY* | always |

### 7.8 Accounts (`accounts`): 8 steps

The petty cash queue for every team. Project expense claims show up in the same Inbox when the server sends them (they appear as a chip).

Intro: "Here's where to sign off petty cash and find your own work. It takes about a minute."

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `home.clockButton` | Home | Clock in here | *S-CLOCK* | `sections.clock` |
| 2 | `tabs.inbox` | — | Sign off petty cash | Petty cash requests from every team wait here. The red number says how many. | always |
| 3 | `inbox.firstItem` | Inbox | Open to decide | Check the amount and the reason. Approve or reject it there. | S-OPEN |
| 4 | `inbox.chips` | Inbox | Filter by type | Tap a type to see only those, like Petty cash. | S-CHIPS |
| 5 | `tabs.me` | — | Your own work | *S-ME* | S-ME |
| 6 | `more.pettyCash` | More | Petty cash | Money you were given, your bills and expense reports are here. | `moreTiles` has `petty-cash` |
| 7 | `more.expenseClaims` | More | Expense claims | Claim back money you spent, and see what was paid. | `moreTiles` has `reimbursements` |
| 8 | `more.showMeAround` | More | See this again | *S-REPLAY* | always |

### 7.9 Application Manager (`app_manager`): 8 steps

Intro: "Here's where to clock in, apply for leave and keep an eye on tasks and bounties. It takes about a minute."

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `home.clockButton` | Home | Clock in here | *S-CLOCK* | `sections.clock` |
| 2 | `home.shortcuts` | Home | One-tap shortcuts | Apply for leave, open payslips or see your attendance from here. | `shortcuts ≥ 2` |
| 3 | `tabs.me` | — | Your own work | *S-ME* | S-ME |
| 4 | `tabs.create` | — | Start something new | *S-CREATE* | S-CREATE |
| 5 | `tabs.inbox` | — | Your Inbox | *S-INBOX* | always |
| 6 | `more.myTasks` | More | Tasks at a glance | See tasks and how they are going. Open one for its details. | `moreTiles` has `tasks` |
| 7 | `more.bounty` | More | Bounty rewards | See open bounties, claims and the leaderboard. | `moreTiles` has `bounty` |
| 8 | `more.showMeAround` | More | See this again | *S-REPLAY* | always |

### 7.10 Visitor Manager (`visitor_manager`): 7 steps

The app gives this role **no reception screen**. `canSeeVisitors` and More's Visitors tile both leave it out on purpose, because the visitor desk runs on the website. So the tour says that once, up front, and then shows what is on the phone. It never points at a reception screen that isn't there.

Intro: "The visitor desk runs on the DASH website. Here's what's on your phone. It takes about a minute."

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `home.avatar` | Home | Your profile | Tap your photo to see and update your details. | always |
| 2 | `tabs.create` | — | Ask for help | Tap + to raise a ticket with HR, IT or admin. | S-CREATE |
| 3 | `tabs.inbox` | — | Your Inbox | Anything that needs you will show up here. | always |
| 4 | `more.support` | More | Help & support | Your help requests, the office Wi-Fi and staff contacts are here. | `moreTiles` has `support` |
| 5 | `more.myTeam` | More | My team | See who you report to and find any colleague. | S-TEAM |
| 6 | `more.appearance` | More | Light or dark | Choose how DASH looks on this phone. | always |
| 7 | `more.showMeAround` | More | See this again | *S-REPLAY* | always |

### 7.11 Display: Announcements viewer (`display`): 5 steps

This is the shared office-TV login. The app gives it **no news screen** (the role's menu is empty, so `canSeeAnnouncements` is false); its news plays on the reception TV. It has nothing to clock, request or approve.

Intro: "This is the office display account. News shows on the reception TV, not in this app."

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `home.avatar` | Home | Account details | Tap here to see this account's details. | always |
| 2 | `tabs.more` | — | Settings and people | The company directory and settings are in More. | always |
| 3 | `more.people` | More | Find people | Search the company directory to find anyone. | `moreTiles` has `people` |
| 4 | `more.appearance` | More | Light or dark | Choose how DASH looks on this screen. | always |
| 5 | `more.showMeAround` | More | See this again | *S-REPLAY* | always |

### 7.12 Master Admin (`platform`): 6 steps

The platform owner belongs to no company (`/hr/me` → disabled). Company setup, wallets and features are website-only.

Intro: "Company setup, wallets and features are on the DASH website. Here's what's on your phone."

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `home.avatar` | Home | Your profile | Tap your photo to see your details. | always |
| 2 | `tabs.inbox` | — | Your Inbox | Anything that needs you will show up here. | always |
| 3 | `tabs.more` | — | Everything else | The people directory and your settings are in More. | always |
| 4 | `more.people` | More | Find people | Search the people directory. | `moreTiles` has `people` |
| 5 | `more.appLock` | More | App lock | Ask for your fingerprint or face each time DASH opens. | `lockAvailable` |
| 6 | `more.showMeAround` | More | See this again | *S-REPLAY* | always |

---

## 8. Vendor tours

The vendor portal has no + button and no Inbox. Its bar is Home · Bills · Agreements · Profile once approved, and Home · Profile before that.

### 8.1 Approved (`vendor.approved`): 7 steps

Intro: "Here's where to see what you're owed, your bills and agreements to sign. It takes about a minute." (After a status change: "You're approved. Here's where your bills and agreements are.")

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `vendor.duesHero` | Home | Money due to you | What Tamada still owes you, split into waiting and to be paid. | `bills ≥ 1` |
| 2 | `vendor.vendorId` | Home | Your Vendor ID | Quote this ID when you contact our Accounts team. | `vendorCode` |
| 3 | `vendor.toSign` | Home | Agreements to sign | Agreements waiting for your signature show here. Tap one to read and sign it. | `toSign ≥ 1` |
| 4 | `vtabs.bills` | — | Your bills | Every bill raised for you, with its status. Filter by waiting, approved or paid. | always |
| 5 | `vtabs.agreements` | — | Agreements | Read, sign and open your agreements. The red number says how many wait for you. | always |
| 6 | `vendor.profileDetails` | Profile | Your details | Your business, tax and bank details. Tap one to ask for a change. | always |
| 7 | `vendor.showMeAround` | Profile | See this again | Tap Show me around any time to replay this tour. *(Done)* | always |

### 8.2 Not approved yet (`vendor.onboarding`): registering, KYC pending, under review

One tour. `when` picks the steps by status, so someone filling in the form gets 7 steps and someone under review gets 5.

Intro, while filling in: "Here's how to finish your registration and see where it stands. It takes about a minute." Under review: "Here's how to check where your registration stands."

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `vendor.registrationHero` | Home | Your registration | Filling in: "This shows where your sign-up stands and the one thing to do next." Under review: "Our Accounts team is checking your details. We'll email you once you're approved." | always |
| 2 | `vendor.stepProgress` | Home | Steps to finish | Each bar is one step. You'll pick up where you stopped. | `draft` / `mobile_verified` |
| 3 | `vendor.registrationButton` | Home | Continue here | Tap Continue registration for the next step. Use Save draft to stop and come back later. | `draft` / `mobile_verified` |
| 4 | `vendor.todoKyc` | Home | Verify ID and bank | It takes a few minutes with Digio, our checking partner. Tap here to start. | filling in and `kycState ≠ done` (the "KYC pending" persona) |
| 5 | `vendor.todoDocs` | Home | Documents to add | Upload a clear photo or PDF of each one. *(Only declarations left, signed during registration: "Forms to sign" / "You’ll sign these during registration. Tap one to carry on.")* | filling in and `openDocs ≥ 1` |
| 6 | `vendor.checkStatus` | Home | Check your status | Tap here to see if you've been approved. | `submitted` / `pending_verification` |
| 7 | `vtabs.home` | — | After approval | Your bills, payments and agreements will show here once you're approved. | `submitted` / `pending_verification` |
| 8 | `vtabs.profile` | — | Your profile | The details and documents you sent, and your password. | always |
| 9 | `vendor.showMeAround` | Profile | See this again | Tap Show me around any time to replay this tour. *(Done)* | always |

Who gets which steps:

- **Registering** (`draft`): 1, 2, 3, 5, 8, 9, plus 4 if KYC isn't done. 6–7 steps.
- **KYC pending**: 1, 2, 3, 4, 5, 8, 9. 6–7 steps.
- **Under review**: 1, 6, 7, 8, 9. 5 steps.

### 8.3 Changes requested (`vendor.changes`): `correction_required`, `rejected`

Intro: "Our Accounts team asked for a few changes. Here's where to make them." (rejected: "Your registration wasn't approved. Here's how to update it and send it again.")

| # | Target | Screen | Title | Body | When |
|---|---|---|---|---|---|
| 1 | `vendor.registrationHero` | Home | What to fix | Changes: "Accounts listed what to change. Their note is in quotes." Rejected: "Read the reason here, then update your details." | always |
| 2 | `vendor.registrationButton` | Home | Fix your details | Tap Fix details, make the changes, then send your registration again. (rejected: "Tap Update details, …") | always (editable) |
| 3 | `vtabs.profile` | — | Your profile | Check the details and documents you sent. | always |
| 4 | `vendor.profileDocuments` | Profile | Your documents | A document marked "Needs a new copy" must be uploaded again. | `docs ≥ 1` |
| 5 | `vendor.showMeAround` | Profile | See this again | Tap Show me around any time to replay this tour. *(Done)* | always |

---

## 9. Build plan

The changes stay inside `mobile/`. No new dependencies: react-native-svg, Reanimated 4, AsyncStorage and expo-haptics are already there. No server, website or database changes.

### 9.1 New files (`src/features/tour/`)

| File | Holds |
|---|---|
| `steps.ts` | `TOUR_VERSION = 1`, `tourIdFor()`, every tour from sections 7 and 8 as data, the intro lines, the + verb map (5) and all tour copy |
| `store.ts` | A zustand store: `active` (tour id, step list, index, `replay`), the **target registry** (`id → { measure, scrollIntoView, shape, radius, activate? }`), and `readRecord` / `writeRecord` (AsyncStorage, each in try/catch, never throwing) |
| `target.tsx` | `<TourTarget id shape radius activate?>` (a View wrapper with `collapsable={false}`) and `useTourTarget(id, opts)` (ref + onLayout). They register in an effect and unregister on unmount. `scrollIntoView` comes from the Screen context (9.2) |
| `overlay.tsx` | The scrim with its evenodd hole, the ring, the pulse and the arrow (react-native-svg + Reanimated). It also draws the touch zones: four blocking zones around the hole, and the hole itself (Next, or `activate()` + end for tap-through targets) |
| `card.tsx` | The coach card and the intro card (kit Button and Text only) |
| `host.tsx` | `TourHost`: the start conditions (2.1), building `ctx`, filtering by `when`, the step loop (navigate → wait for focus → scroll → measure, 600 ms timeout → drop), Back / Next / Skip / Done, announcements, the hardware back / escape handling, interruptions, and restoring the starting tab |
| `use-tour.ts` | `useStartTour()`, used by the "Show me around" rows |

Steps are plain data:

```ts
type TourStep = {
  key: string;                    // 'manager.inbox'
  target: TourTargetId;
  screen?: TourScreen;            // 'home' | 'me.attendance' | 'me.leave' | 'me.pay' | 'inbox' | 'more' | 'vendor.home' | 'vendor.profile'…; omit = stay
  title: string | ((ctx: TourCtx) => string);
  body: string | ((ctx: TourCtx) => string);
  when?: (ctx: TourCtx) => boolean;
};
```

**Screen → route**, all through `router.navigate`:

| Screen | Route |
|---|---|
| `home` | `/` |
| `me.leave` | `meHref('leave')` |
| `inbox` | `/inbox` |
| `more` | `/more` |
| `vendor.home` | `/portal` |
| `vendor.profile` | `/portal/profile` |

### 9.2 Changes to existing files

- **`src/app/_layout.tsx`:**
  - Render `<TourHost />` after the Stack (above the app, below AppLockGate, which renders later and so stays on top). It is not a Modal, so tap-through targets work natively and sheets can't stack under it.
  - Wrap the Stack in a View whose accessibility is hidden while a tour is active.
- **`src/ui/screen.tsx`:** a small `ScreenScrollContext` (the ScrollView ref and its content view), so `TourTarget` can `measureLayout` against the content and call `scrollTo({ y: max(0, y − header clearance) })`.
- **`src/ui/tab-bar.tsx`:** an optional `tourId` on TabButton (registered on its slot View, with `activate` = the trigger's onPress) and on TabFab (circle, `activate` = onPress).
- **`src/ui/controls.tsx` / `chrome.tsx` / tiles:** optional `tourId` props, so a single child can be marked without a wrapper. They go on the TabRootHeader `actions` item (`inbox.history`), the CategoryGrid / MenuGrid item (from `MenuItem.tourId`) and the HomeHeader avatar. All are new optional props, so existing callers keep working.
- **Tab layouts:** `(app)/(tabs)/_layout.tsx` and `(vendor)/portal/(tabs)/_layout.tsx` pass the `tabs.*` and `vtabs.*` ids.
- **Screens and features**, wrapping the targets in 6.1:
  - `features/attendance/clock-card.tsx` (the pill, tap-through `activate`)
  - `features/home/{header,shortcuts,needs-you,whos-in}.tsx`
  - `features/me/{attendance-view,leave-view}.tsx`
  - `(tabs)/inbox.tsx` and `features/inbox/inbox-list.tsx` (first row only)
  - `(tabs)/more.tsx` and `features/more/menu.ts` (`tourId` per tile)
  - `features/vendor/home.tsx` and `(vendor)/portal/(tabs)/profile.tsx`
- **Shared helpers:**
  - `useMeSegments()` in `features/me/tabs.ts`, used by `me.tsx` and the tour.
  - The vendor `kycState` / `openDocs` helper, moved out of `RegistrationHome` so Home and the tour share it.
- **"Show me around" rows:** in More → Account (under Appearance), and in vendor Profile → Account (above Sign out). Each is a ListRow with a ModuleBadge and a chevron, and runs `useStartTour()` with `{ replay: true }`.
- **Tokens:** `tourScrim` in `theme/tokens.ts` and `theme/dark.ts`.

### 9.3 House rules that apply here

- **Pure render (React Compiler).** Timestamps (`at`) are taken in handlers. Measuring and timers run in effects. Nothing reads time in render.
- **Colours** are never read in module-level constants: use `themedStyles` or read at render time.
- **One tour at a time.** `TourHost` renders `null` when idle, and targets cost only a ref plus one registry entry.

---

## 10. Test checklist

- **Every staff persona:** More → Switch demo role → Afzal Employee, Professional, Manager, HR, Accounts, Super Admin, Admin, IT Admin, Visitor Manager, Announcements, App Manager and Master Admin. Each:
  - shows its own tour once, on its first open;
  - never shows a step pointing at nothing;
  - has a dot count that matches the steps it shows.
- **Every vendor persona:** Approved, Registering, KYC pending, Under review, Changes requested. Each gets the right tour, and there are no Bills or Agreements steps before approval.
- **Skip:**
  - Skip on step 1, a middle step and the intro: the tour doesn't come back on relaunch, and the toast names where to find it.
  - Android back and Esc behave like Skip.
- **Done and replay:**
  - Done saves `done`, and the person lands back on the tab they started from.
  - Replay from More (vendor: Profile) works any number of times and never changes the record.
- **Tap-through:** tapping the spotlit Clock in clocks in and ends the tour. Tapping a spotlit tab opens it and ends the tour. Tapping the dim area does nothing.
- **Interruptions:**
  - Kill the app mid-tour: the tour shows once more on relaunch, then never again.
  - App lock: background for over 30 s, unlock, and the tour is still on the same step.
- **Role change** (switch persona on the same user id in a test build, or edit the record): the new role's tour shows once with the "You're now…" intro.
- **Display:** 390 × 844 and 320 × 700, light and dark, font scale 1.0 and 1.3:
  - the card never clips and never covers its own target;
  - buttons stack when compact;
  - the arrow points at the hole.
- **Screen readers** (TalkBack / VoiceOver):
  - each step is announced and focus lands on the title;
  - Skip, Back and Next are reachable;
  - the dimmed app can't be focused.
- **Reduce Motion:** no glide, nudge or pulse; fades only.
- **Checks:** `npx tsc --noEmit` and `npx expo lint` are clean.

---

## 11. Notes for the owner

- **Visitor Manager.** In the app this role has no reception screen: the website runs the visitor desk, and the app hides Visitors for this role on purpose (`VISITOR_HIDDEN_ROLES`). So the tour says so in its intro and shows profile, help, team and settings instead. A real reception step would need a reception screen first.
- **Display (Announcements viewer).** The app gives this login no news screen; its news plays on the office TV. So the tour says that up front and stays to 5 small steps.
- **App Manager.** More shows the "Expense claims" and "Petty cash" tiles for this role (the website's menu has them), but the server refuses this role's claims. The tour doesn't point at either tile. Hiding the Expense claims tile for App Manager in `menu.ts`, as `features/reimbursements/access.ts` intends, is a separate fix.
- **Per phone.** The "seen" record lives on the phone, because no server change is allowed. On a new phone, or after a reinstall, the tour is offered once more (and can be skipped in one tap).
