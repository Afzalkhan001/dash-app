# Full design revamp — components taken from Payno × Lendora

The owner asked for a **full design revamp** that takes **components and ideas** (not colours) from two
Behance case studies. Colour stays the **Ember** palette in `src/theme/tokens.ts` (vermilion brand,
emerald Pay, warm ivory canvas — chosen by a blind multi-agent vote). This document is the catalogue of
what those two designs actually contain, studied at full resolution, and where each piece goes in DASH.

- Payno — Finance Solution (Orbix Studio): https://www.behance.net/gallery/255260777
  Full-res screens: `https://mir-s3-cdn-cf.behance.net/project_modules/max_3840/<id>` with ids
  `7fa625255260777.6a9ae1bce936e.jpg` (sign-in, create account, verify OTP, home),
  `ff5463255260777.6a9ae1bcec73f.jpg` (home, transactions, send money + keypad, confirm sheet, add money,
  pay bills, provider list, payment confirm, bill paid), `d9ad9d255260777.6a9ae1bcf175a.jpg` (wallet,
  cards, card details, profile), `e2c37d255260777.6a9ae1bcef8f5.jpg` (onboarding).
- Lendora — CRM SaaS + mobile: https://www.behance.net/gallery/228075345
  Full-res: `1f090b228075345.684c385385943.jpg` (mobile: rates analytics, your rank, shuffle status),
  `35c34d228075345.684c3853852c1.jpg` (wash stat card + slider), `4f7f61228075345.684c385387e37.jpg`
  (phone in hand), `1f1992228075345.684c385384a59.jpg` (desktop dashboard).

## 1. The overall look (what makes them feel premium)

**Payno**
- The whole screen sits on a **vertical wash**: almost white at the top, getting noticeably deeper
  toward the bottom (Payno: pale grey-blue → steel blue). Everything on it is **frosted**: translucent
  white surfaces (≈55–80 % white) with a bright 1 px white rim and a very soft, wide shadow. No hard
  borders, no flat grey boxes. Radii are large (cards 24–28, tiles 20, pills full).
- Text is calm: titles in a light/regular weight (never bold), numbers huge and light, labels small and
  muted. Only row titles and buttons use a medium/semibold weight.
- **One dark element per screen** at most: the centre FAB, the primary pill, or the keypad wash.
- Top bar on stack screens: **centred title** (regular, ~22 px) between a **round frosted back button**
  on the left and a **round frosted action button** (bell with red dot / search) on the right.

**Lendora**
- Warm ivory background (#FBF9F4-ish), cards a hair lighter with no visible border and a big radius.
- **Giant ultra-light numerals** (ExtraLight) with a tiny **superscript unit** at top-left (`%`, `₹`,
  `h`), **decimals in a very light grey**, and a tiny **coloured arrow** (up = warm, down = red) at the
  top-right of the number. A muted caption sits under it.
- Charts **glow**: a smooth line whose colour shifts along its length, a soft wide halo under the line,
  dashed drop-lines, and **white pill labels with a shadow** on key points (`↑ 3,64% F.R.`).
- Small **dots** as legends/status markers; status pills in soft tints (grey Active, yellow Complete,
  coral Overdue); `•••` overflow on rows.

In DASH this becomes: Ember warm ivory at the top → a **deeper warm wash** (`palette.canvasWash`) at the
bottom of the Backdrop; **frosted** cards (`palette.frost`, `frostStrong`, `glassEdge` rim); giant
numerals in `type.numeral` (`font.thin`); glow charts in `palette.sunset` / `coral`.

## 2. Component catalogue (build all of these in the kit)

Each item: what it looks like in the reference → the DASH component name → where DASH uses it.

### Chrome & surfaces
1. **FrostCard** — translucent white card, white rim, soft wide shadow, radius 24. Variants `frost`
   (0.58) and `strong` (0.80). Replaces the old glass Card look everywhere (keep `Card` API; add
   `tone="frost"` and make it the default surface).
2. **SummaryHero** (Payno "Available Balance" / "Total Due Payments" / "Monthly Limit" card) — a LIGHT
   frosted hero: top row = small round white icon circle + muted label on the left, a **round corner
   arrow button** (filled brand, white ↗) on the right; then a **huge light number** with greyed
   decimals and an optional eye toggle; then an **info chip** (ⓘ "Available Limit • $3,600 Left ›" —
   frosted pill) or a muted sub-line ("Next Due • Tomorrow"); optional **full-width primary pill**
   inside the card ("Pay Now"); optional **striped progress bar with a % thumb pill** (Wallet). DASH:
   Leave balance, Pay take-home (light variant), petty cash balance, bounty coins, vendor dues, team
   attendance summary. The vermilion gradient `Card tone="primary"` stays only for the **Home clock card**
   (the one bold colour moment) and the emerald **Pay** hero.
3. **NavHeader** — centred title, round frosted back button (left), up to two round frosted action
   buttons (right) — bell with dot, search, filter, calendar. Used on every pushed (stack) screen.
4. **IconPillGroup** (Lendora header) — one frosted pill holding 2 icon buttons (bell, mail) each with a
   red unread dot, next to a photo avatar. Home header right side.
5. **TabBarWithFab** (Payno bottom nav) — frosted capsule, 4 tabs with icon + label (active icon filled
   in brand, label brand), and a **raised round centre FAB** (brand fill, white +, soft coloured shadow)
   sitting between tab 2 and tab 3. DASH: Home · Me · (+) · Inbox · More. The FAB opens a **CreateSheet**:
   a frosted bottom sheet with a **CategoryGrid** of the things a person can start — Apply leave,
   Work from home, Fix attendance, Claim expense, Petty cash bill, Raise a ticket, Invite a visitor,
   Salary advance — each only if that person has access (reuse the same access rules the screens use).

### Lists & tiles
6. **SectionHeader** — section title (regular, ~16 px, ink) on the left, muted "See all"/"View All"
   text link on the right.
7. **AvatarTiles** (Payno "Recent Recipients") — a horizontal row of frosted rounded-square tiles
   (~96×100): photo/initials avatar circle centred + name under it; last tile "Add New" with a + circle.
   DASH: Home "Who's in today" / birthdays, More → People shortcuts, approver picker.
8. **ActivityRow / ActivityList** (Payno "Recent transactions") — already in the kit; restyle to sit
   inside one frosted card, avatar photo/initials, name medium, time muted, amount right (+ green /
   − ink).
9. **CategoryGrid** (Payno "Bill Pay": Electricity, Internet, Water, Mobile, Gas, TV, Card, More) — 4 per
   row of frosted circles (~56) with thin line icons (module colour) and a label under each; last item can
   be "More •••". DASH: More modules grid, CreateSheet, Home quick actions (same component as
   QuickActions — merge).
10. **UpcomingCards** (Payno "Upcoming Payments") — horizontally scrolling frosted cards (~170×130):
    icon circle top-left, title, amount right, muted sub ("Due Tomorrow"). DASH: Home "Coming up"
    (next holiday, approved leave, payday, shift), Me → Pay "Upcoming" (next payslip, advance EMI).
11. **SelectTiles** (Payno "Select Payment Method": Payno Card / Bank Account / Visa / Master Card) —
    4 equal frosted square tiles with an icon and label; selected tile gets a brand rim + brand icon.
    DASH: leave type picker (Casual / Sick / WFH / Comp-off), expense category, support request type,
    clock-in mode (Office / Remote).
12. **AccountRow** (Payno "Payno Card •••• 4125 [Change]") — frosted row: icon circle, title + masked
    sub, a small frosted **"Change"** pill on the right. DASH: chosen project code, approver, payslip
    month, bank account on Pay.
13. **SummaryCard** (Payno "Transfer Summary" / "Transfer Details") — frosted card of key → value rows,
    keys muted left, values right; one emphasised total row larger; optional status pill value
    ("• Completed"). DASH: every detail screen and confirm sheet.
14. **MetricRow** (Lendora "Phone Call's 6/20 [Active] •••") — frosted row: dot + label, a light big
    fraction with the denominator greyed (`12/12`), a soft status pill, `•••`. DASH: timesheet entries,
    task list, bounty submissions, leave balance by type.
15. **PillSelector** (Payno currency pill "🇺🇸 USD ⌄", Lendora "This Week ⌄") — small frosted pill with
    optional leading glyph and chevron that opens a picker. DASH: month pickers, filters.

### Data visualisation (Lendora + Payno Wallet)
16. **Numeral** — `type.numeral` giant figure: superscript unit/prefix, greyed decimals, optional tiny
    delta arrow (warm up / red down) top-right, caption below. Two or three side by side wrap cleanly.
17. **GlowLineChart** — smooth line with a colour ramp (sunset → coral), a soft blurred halo band under
    it, dashed horizontal guide(s) with tiny muted y labels, dashed drop-lines from labelled points, and
    **white floating point labels** with a shadow (`↑ 8.2h Mon`). Month/day x labels muted.
18. **PillBarChart** (Payno "Earning Activity") — 7 slim vertical rounded pills (S M T W T F S), the
    selected day a dark brand capsule with a white dot at its top, others frosted/striped; a big number
    (`$7.3K`) with a small delta (`↗ +4.2%`) to the left. DASH: Attendance "This week" hours.
19. **SparkCard** (Lendora "Prospective Clients / Clients in Processing") — half-width card: title +
    muted "This month", a glowing squiggle sparkline with one highlighted dot and a dotted drop-line, and
    a 3-figure footer (`Process 11 | Applications 914 | Soon 23`, centre figure emphasised). Used in a
    TwoUp. DASH: Leave (Taken | Balance | Planned), Inbox summary (Waiting | Approved | Rejected),
    Timesheets (Logged | Required | Unlogged).
20. **StripedProgress** (Payno Wallet "Transaction Limit $6,400 / $10,000") — a track whose filled part
    is diagonal-striped (or brand fill) with a small **% thumb pill** riding at the end of the fill and
    a `used / total` label above it on the right. DASH: leave used, salary advance repaid, timesheet
    logged vs required, petty cash spent vs advance.
21. **RankSlider** (Lendora "Your Rank No.1 26") — big centred value with a small prefix, a thin track
    with a marker (▲) and end labels (`No. 50 … No. 1`). DASH: Bounty leaderboard rank.
22. **RadialArc** (Lendora "Shuffle Status") — partial ring/arc progress with legend dots and a
    `15/45` fraction. DASH: attendance month completion, policy acknowledgement.
23. **WashStatCard** (Lendora "65.91" card) — light gradient wash card (`gradient.sunsetLight`) with a
    giant numeral, a thin slider with a triangle marker, muted `0% · 50% · 100%` ticks and a caption.
    DASH: Home "This month" attendance score when there is no clock card.

### Inputs & flows (Payno)
24. **PillField** — fully rounded frosted input (~54 high) with a leading thin icon, placeholder muted,
    trailing eye toggle for passwords. Sign-in and every form.
25. **OtpBoxes** — 6 separate rounded squares (white frost), the active one with a brand rim and caret.
26. **NumericKeypad** — 4×3 frosted glass keys (1–9, `.`/blank, 0, ⌫) on a **deep wash** at the bottom
    of the screen (fades from transparent into `gradient.brandDeep` or a deep warm tone), white digits.
    Used by the OTP screens and by **AmountEntry**.
27. **AmountEntry** (Payno "Enter Amount $250.00|") — muted label, giant light amount with a blinking
    caret, a muted helper chip (ⓘ "Estimated delivery") and right meta; driven by NumericKeypad. DASH:
    expense claim amount, petty cash bill amount, salary advance amount.
28. **ConfirmSheet** (Payno "Confirm Transfer") — bottom sheet with a **floating round close (×)
    button above it**, a title, **FromTo cards** (two frosted cards with an arrow circle between them:
    e.g. "You → Approver", "Casual leave → 2 days"), a SummaryCard of details, and a
    **SwipeToConfirm** at the bottom.
29. **SwipeToConfirm** — brand pill track with a white round knob (»), centred label ("Swipe to
    submit"), a › at the end; dragging past ~85 % confirms with a haptic, otherwise springs back.
    Must have an accessible fallback (screen readers: a normal button). Use for irreversible submits:
    apply leave, submit claim, request advance, approve/reject in Inbox, clock out.
30. **SuccessSheet** (Payno "Bill Paid") — floating close (×), a frosted circle with a green ✓, big
    title ("Leave applied"), muted subtitle, a SummaryCard (Request ID, Type, Dates, Status • Pending),
    and two buttons side by side: frosted secondary ("View request") + primary ("Done").

## 3. Screen-by-screen mapping

- **Home**: Payno header (photo/initials avatar, "Welcome back 👋"/"Good morning" muted, name) + Lendora
  IconPillGroup (bell + inbox) → **Clock card** (vermilion gradient hero, big timer as Numeral, white
  pill) → **CategoryGrid** quick actions (4) → **UpcomingCards** "Coming up" → "Needs you" ActivityList
  → **AvatarTiles** "Who's in today"/birthdays → news. Tab bar with FAB.
- **Me → Attendance**: clock card → **PillBarChart** "This week" with total Numeral + delta → TwoUp of
  **SparkCard**/Numeral tiles (Present · Late · Leave) → **RadialArc** month completion or calendar card →
  action rows (Fix attendance, Timesheets, Holidays, My shift) as a frosted list.
- **Me → Leave**: **SummaryHero** (light) "Leave balance" big Numeral + StripedProgress "used / total" +
  "Apply leave" pill → **SelectTiles**-style balance by type (or MetricRows) → requests ActivityList with
  status pills. **Apply leave flow**: SelectTiles for type, date fields as PillFields, → **ConfirmSheet**
  (FromTo: type → dates, SummaryCard, SwipeToConfirm) → **SuccessSheet**.
- **Me → Pay**: emerald **gradient hero** take-home (Numeral, greyed paise, info chip "Credited 30 Sep") →
  CategoryGrid (Payslips, Salary, Tax, Advance) → UpcomingCards (next payday, EMI) → payslips
  ActivityList → **GlowLineChart** of take-home if data is loaded. Salary advance: AmountEntry + keypad →
  ConfirmSheet → SuccessSheet.
- **Inbox**: NavHeader-style centred title on the tab root (no back) → TwoUp **SparkCard** summary
  (Waiting | Done today) → PillSelector filter → day-grouped ActivityList. Detail: SummaryHero for the
  request, FromTo (Requester → You), SummaryCard, then Approve via **SwipeToConfirm** (Reject as frosted
  secondary) → SuccessSheet.
- **More**: profile card (Payno profile: photo, name, role, "View profile ›") → **CategoryGrid** of all
  modules → grouped frosted list (Account, App lock, Password, Sign out).
- **Expenses / Petty cash / Bounty / Visitors / Tasks / Support / People / Policies / News**: each list
  screen = NavHeader + SummaryHero (module icon, key figure, info chip) + PillSelector filters +
  ActivityList/MetricRows. Create flows use SelectTiles + AmountEntry/keypad + ConfirmSheet + SuccessSheet.
  Bounty leaderboard uses **RankSlider**.
- **Sign-in**: centred DASH/Tamada logo, "Welcome back" (regular ~28), muted 2-line subtitle,
  **PillFields** with leading icons, Remember + underlined "Forgot password", primary pill, "Or" divider,
  outlined frosted pills for the other sign-in method, footer "Are you a vendor? **Sign in here**".
  **OTP**: back circle, icon in frosted circle, "Verify it's you", muted line with the masked number,
  **OtpBoxes**, primary pill, "↻ Resend code", **NumericKeypad** on the deep wash (system keyboard
  hidden).
- **Vendor portal**: same chrome; SummaryHero for dues; ActivityList for bills; agreements with
  SuccessSheet after e-sign.

## 4. Rules (unchanged)
- Colour only via tokens (`palette`, `gradient`, `moduleTone`, `ModuleBadge`, `statusTone`) — no hex in
  screens. Payno/Lendora colours are NOT used.
- Plus Jakarta Sans only (Text variants / `font`), never `fontWeight`. `type.numeral` only ≥ 36 px.
- Keep every behaviour, route, API call, permission check; keep Home · Me · Inbox · More (+ FAB).
- 320 dp + large text must work; nothing behind the tab bar/FAB; touch targets ≥ 48 dp.
- React Compiler (pure render; `useNow`/`useTodayIst`), Reanimated 4 (`.get()/.set()`), Gesture
  Handler for SwipeToConfirm. No new dependencies. Nothing outside `mobile/`. No commits.
