# Layout references: Payno × Lendora (design only, not colour)

The user picked two Behance case studies for **design inspiration only**. Their colours are NOT used:
colour is the "Ember" palette (vermilion brand) chosen by a blind multi-agent vote, in
`src/theme/tokens.ts` (see docs/DESIGN.md §5). This file turns what makes those two designs feel good into rules for DASH.

- Payno — Finance Solution (Orbix Studio): https://www.behance.net/gallery/255260777
- Lendora — CRM SaaS dashboard + mobile: https://www.behance.net/gallery/228075345

## What we take from Payno (mobile banking)

1. **Calm header.** Small round avatar on the left, then two lines: a small muted "Welcome back" /
   "Good morning" and the name in a larger regular weight. One round icon button (bell) on the right.
   No centred logo or big wordmark competing with the greeting; the greeting itself is not huge.
2. **One balance-style hero.** One big number in a light weight (e.g. `$56,751.23`), a small muted
   label above it ("Available balance") and a small status line under it. Plenty of air around it.
   The primary action sits under it as a full-width pill.
3. **Quick actions row.** Four equal round icon buttons (≈52 dp circles, soft tinted fill, coloured
   icon) with a one-word label under each ("Send · Add funds · Pay bills · QR"). It sits right under the
   hero, never behind the tab bar.
4. **"Recent transactions"-style list.** Section title on the left, "See all" text link on the right.
   Rows: 40 dp avatar/icon, title (semibold) + one muted subtitle, value right-aligned (semibold) with
   a small muted time under it. Rows are separated by space or hairlines inside one white card.
5. **Onboarding/sign-in.** Big centred title ("Welcome back"), one short muted line under it,
   generously spaced inputs with leading icons, one full-width pill button, secondary sign-in options as
   outlined pills, small footer link. OTP: separate square boxes, a short "Verify" title, a muted
   resend line.
6. **Soft vertical wash.** Screens fade from white at the top to a faint tint at the bottom. Cards are
   white with a hairline and a very soft shadow; radii are large (24+).
7. **Typography.** Light/regular weights for big numbers and titles, semibold only for row titles and
   buttons. Small muted overlines.

## What we take from Lendora (CRM dashboard + mobile)

1. **Stat tiles with light numerals.** Big light number with a small superscript unit/currency on
   the left (`₹`, `h`), decimals greyed (`6.91` → `6.` ink + `91` faint), a tiny coloured delta arrow
   and a muted caption underneath ("Hours this week").
2. **Two-up mini cards.** Two equal cards side by side, each with a small title, a muted subtitle
   ("This month"), a tiny sparkline or progress bar, and a pair of small numbers at the bottom.
3. **Line chart with a soft area fill.** Single smooth line, gradient fill fading to transparent
   below it, a labelled point (pill tooltip) at the latest/peak value, muted month/day labels, no
   heavy gridlines (one or two faint dashed lines max).
4. **Light wash hero card.** A light gradient card (`gradient.sunsetLight`) with ink text, a big light
   number and a slim progress slider with a thumb marker and muted min/max labels.
5. **Lots of white space**, small muted section labels, rounded 24+ cards, tiny coloured dots as
   status markers.

## How this maps to DASH screens

### Home (`src/app/(app)/(tabs)/index.tsx`, `src/features/home/*`, `src/ui/screen.tsx` greeting)
- Header per Payno #1: avatar (coloured initials), "Good morning" small muted + first name larger, bell
  on the right. Drop the big centred wordmark from the Home header (a small logo may stay elsewhere;
  DEMO can be a small gold pill next to the name).
- Clock card = Payno balance hero (#2): label "Today", big light timer, status line, full-width
  Clock in / Clock out pill, overflow button.
- **Quick actions row** (Payno #3) right under the hero: the 4 shortcuts as round tinted
  `ModuleBadge`-style buttons with one/two-word labels (e.g. Apply leave · Payslips · Fix attendance ·
  Claim expense). This replaces the current shortcut tiles that end up behind the tab bar.
- "Needs you" = Payno transactions list (#4): title + "See all" text link; rows with avatar, title,
  subtitle, right value/time.
- Announcements / birthdays below as compact cards.
- Content must clear the floating tab bar (`withTabBar`), and the Android tab bar must be opaque
  enough that nothing reads through it.

### Me → Attendance (`src/features/me/attendance-view.tsx`, `src/features/attendance/*`)
- Clock card as on Home (same component).
- Lendora stat tiles (#1) in a two-up row: "Hours this week" and "On time this month" (or whatever the
  data supports), light numerals, greyed decimals, tiny delta.
- Week chart: Lendora line/area chart (#3) or soft bars, with a pill tooltip on today.
- Month calendar card below; action rows (Fix attendance, Timesheets, Holidays, My shift) as a
  Payno-style list with `ModuleBadge` icons.

### Me → Leave (`src/features/me/leave-view.tsx`, `src/features/leave/*`)
- Lendora two-up mini cards (#2) for leave balances (each type its own soft tint, slim progress bar,
  "x of y left").
- "Apply leave" full-width pill.
- My requests as a Payno transactions list with status pills.

### Me → Pay (`src/features/me/pay-view.tsx`, `src/app/(app)/pay/*`)
- Payno balance hero: "Latest take-home" label, big light amount with greyed paise, month under it.
- Quick actions row: Payslips · Salary details · Tax summary · Salary advance.
- Recent payslips as a transactions list (month, net pay right-aligned).
- Optional Lendora area chart of take-home over the last months, if the data is already loaded.

### Inbox (`src/app/(app)/(tabs)/inbox.tsx`, `src/features/inbox/*`)
- Payno transactions list grouped by day ("Today", "Yesterday", date), kind chips on top, rows with
  `ModuleBadge`/avatar, title, subtitle, right-aligned value (days / amount) + time.

### More (`src/app/(app)/(tabs)/more.tsx`, `src/features/more/*`)
- Profile card per Payno (avatar, name, role, small "View profile" link) on a teal hero or white card.
- Modules as a grid of quick-action style round tinted icons with labels, or a clean grouped list.
- Account / security / sign out as a grouped list at the bottom.

### Sign-in (`src/auth/auth-shell.tsx`, `src/app/(auth)/*`)
- Payno #5: centred "Welcome back" title, short muted line, roomy inputs, full-width pill, outlined
  secondary pills, OTP boxes.

## Rules that do not change
- Colour only from tokens (`palette`, `gradient`, `moduleTone`, `ModuleBadge`); never hex in screens.
- Plus Jakarta Sans only via `Text` variants / `font` tokens; never `fontWeight`.
- Plain words (docs/DESIGN.md §0B) and one format per value type (§0C).
- Keep the 4-tab structure and every existing behaviour, route and API call. Visual/layout only.
- React Compiler: render stays pure. Reanimated 4: `.get()` / `.set()`.
- Nothing outside `mobile/`. No new dependencies (react-native-svg and expo-linear-gradient exist).
