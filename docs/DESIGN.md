# DASH mobile: design specification

Version 3 (19 Oct 2026). Covers everything under `mobile/src` except `src/demo/**`. The kit (section 15, K1–K17) is implemented; §7.0 is the API reference for what was built. Sections 0A–0C describe the simplified app (four tabs: Home · Me · Inbox · More), the plain words it uses and its one way of writing dates, times, durations and money. Read them first: the owner found the earlier, busier version confusing, so the goal of every screen is **simple** — one primary action, plain words, nothing shown twice, short text, the same pattern everywhere.

This file is the single source of truth for the visual and UX pass. If the code and this file disagree, this file wins. Where this file says nothing, copy the nearest existing pattern in `src/ui`. The numbers here are final. Use them as written and don't work them out again.

Inputs: Apple HIG (buttons, tab bars, sheets, layout, typography, accessibility), Material 3 tokens (buttons, chips, lists, navigation bar, sheets, motion), WCAG 2.2, NN/g (empty states, confirmations, glassmorphism), Workday Canvas Action Bar, SAP Fiori approvals/footer, Keka, Darwinbox, BambooHR, Zoho People, Deel, Revolut, Monzo, Apple Wallet, the ZIXO Banking direction the user chose, and an audit of the current `src/ui` and screens. All contrast ratios were computed. The width maths uses Plus Jakarta Sans at about 0.55 em per character (8.3 dp per character at 15 px).

---

## 0. How to use this document

**Priorities, in order**

- **P0 (fit).** At 360 dp wide and at font scale 1.3, nothing overlaps, clips or scrolls sideways, and no button label is truncated or wrapped. This is the user's main complaint.
- **P1 (consistency).** Every screen is built from the kit components and tokens below, and no screen keeps its own hand-made version of a kit component.
- **P2 (polish).** Motion, haptics and toasts.

**Ownership**

- Only the agent assigned the kit task edits `src/theme/tokens.ts` and `src/ui/**`. Screen agents import everything from `'@/ui'`.
- If a kit component from section 15 is not in `src/ui/index.ts` yet, build that layout inline from tokens, following the rules here, and add `// TODO(kit): <ComponentName>`. Don't create a second shared copy inside `src/features`.

**Hard constraints (repeated from the brief)**

- Change only the visuals and UX. API calls, request bodies, query keys, gating, permissions and route paths stay as they are.
- The app runs in Expo Go SDK 57. Install no packages and add no native modules.
- React Compiler: render stays pure. Don't call `Date.now()`, `new Date()` or `Math.random()` in render. Use `useNow()` / `useTodayIst()`.
- Never edit `src/demo/**`. Don't change exported names or props unless you update every caller. New optional props are fine.

---

## 0A. App structure: four tabs

The staff app has four fixed tabs, in this order: **Home · Me · Inbox · More** (`src/app/(app)/(tabs)`, bar in `src/ui/tab-bar.tsx`). Every other screen is pushed on top of them. The vendor portal has its own four: Home · Bills · Agreements · Profile.

| Tab | Route | Its one job |
|---|---|---|
| Home | `/` | The few things people open the app for, then out of the way |
| Me | `/me?tab=attendance\|leave\|pay` | My own attendance, leave and pay |
| Inbox | `/inbox?type=<kind>` | Everything waiting for my decision, in one list |
| More | `/more` | Everything else: profile, secondary modules, account |

**Rules that hold the structure together**

- **Each thing lives in one place.** Attendance, leave and pay are in Me. Every approval is in Inbox (Home's "Needs you" is only a preview that links there). Everything else is in More. Holidays and Timesheets are rows in Me › Attendance, and More lists them only for people who don't have that segment.
- **Old links keep working.** `/attendance`, `/leave` and `/pay` redirect into the matching Me segment (`features/me/redirect.tsx`). Build links with `meHref('pay')` from `features/me/tabs.ts`, never by hand.
- **Only the Inbox tab carries a number** (the red badge). Home's bell shows a dot, never a count. More's only badge is "policies to read" on the Policies tile.
- **Gates don't change.** Each section, segment, tile and shortcut shows only when the website would show it to this person (the same access helpers as before). A section with nothing to show is left out, not shown empty.

### Home (`(tabs)/index.tsx`, `features/home/*`)

`BrandHeader`: avatar (→ My profile), logo, bell (→ Inbox, with a dot when something waits). Then, in this order, each section left out entirely when it has nothing:

1. **Greeting** (`home/greeting.tsx`): "Good morning, Priya". Today's date sits above it only when there is no clock card.
2. **Clock card** (`attendance/clock-card.tsx`): only for people who clock in. It is the screen's one dark card.
3. **Needs you** (`home/needs-you.tsx`): at most 3 rows. First, start or end codes I have to read out. Then the Inbox's own rows, in the Inbox's order and words. Then "N policies to read" if there is room. "See all" opens Inbox. The rows carry no buttons.
4. **Shortcuts** (`home/shortcuts.tsx`): one row of up to 4 round buttons: Apply leave (or Work from home / Claim comp-off), Payslips, Attendance, Claim expense. Each needs its module, and the row shows only with 2 or more.
5. **News** (`announcements/home-banner.tsx`): the announcement banner.
6. **Celebrations** (`people/celebrations.tsx`): this week's birthdays and work anniversaries.

Nothing else goes on Home. There is no hours chart, team strip, recent-days list, leave summary or pay snapshot; those live in Me.

### Me (`(tabs)/me.tsx`, `features/me/*`)

`GreetingHeader` with my name as the overline and "Me" as the title. The privacy eye shows only while Pay is open. Under it, a `Segmented` **Attendance | Leave | Pay** stays put while the segment scrolls. It lists only the segments this person has, and it is hidden when there is just one. With none, an EmptyState offers "View my profile" (plus an "Open Inbox" text button for approvers). The open segment follows `?tab=`.

| Segment | File | Top to bottom |
|---|---|---|
| Attendance | `me/attendance-view.tsx` | 1. Clock card. 2. This month: three figures (Present, Late, Avg / day; only after the first clock-in) over the month calendar with a month switcher; tap a day for the day sheet (fix it from there). 3. One list of links: Who's in today (managers), Fix attendance, Timesheets, Holidays, My shift. People who don't clock in get only the links, under "Your team" or "Company" |
| Leave | `me/leave-view.tsx` | 1. Leave balance: one small tile per type with a balance (tap for how it adds up). 2. The one primary, "Apply leave" (or the first kind they can request); the other kinds are list links under it. 3. Leave requests: the latest 3, waiting first, with "See all"; a row opens the request sheet (cancel lives there) |
| Pay | `me/pay-view.tsx` | 1. Dark card: take-home of the latest payslip with "View payslip" (or the monthly gross before the first payslip). 2. Up to 3 earlier payslips with "See all". 3. Links: Salary details, Tax summary, Salary advance, Salary claims (only for people with old claims) |

### Inbox (`(tabs)/inbox.tsx`, `features/inbox/*`)

One list of everything waiting on me: leave, work from home, comp-off, attendance fixes, salary claims and salary advances (HR approvals), expense claims on projects I own (as project owner), petty cash waiting on me, and visitors at reception.

- **Header:** "N waiting on you" overline, "Inbox" title.
- **Order:** at most one notice (`Banner`), the "N policies to read" row, chips (All first, then each type with its count; only when there are 2 or more types), the list (pages of 30, then "Show N more"), and a quiet "Past decisions" text button (`/inbox/history`).
- **Rows** (`InboxGroups`, `InboxRequestRow`): avatar, who, then the fact that identifies it (dates or amount) before the kind word, and a one-line note. The right column has the figure over how long ago it came in. No Approve or Reject in rows.
- **Detail** (`/inbox/[kind]/[id]`, `DecisionScreen`): the only place anything is approved or rejected. A sticky `DecisionBar` holds `[Reject: danger] [Approve: primary]` (a visitor: Turn away / Let in). Expense claims and petty cash send their approvers here too.
- **Empty:** "You're all caught up".
- `/inbox?type=<kind>` opens on one chip: `leave`, `wfh`, `comp_off`, `regularization`, `reimbursements`, `loans`, `keka`, `petty`, `visitors`.

### More (`(tabs)/more.tsx`, `features/more/*`)

`GreetingHeader` with the company name as the overline and "More" as the title. Then:

1. **Profile card** (the only dark card): photo, name and title; tap for My profile.
2. **One grid** of at most 9 tiles, 3 columns, each only when the website shows that module (`features/more/menu.ts`): Expense claims, Petty cash, Visitors, My tasks, Help & support, Policies, My team, News, Bounty rewards. The only badge is "policies to read".
3. **Holidays and Timesheets** as plain rows, only for people without Me › Attendance.
4. **My account** in a list of its own: Change password, App lock, Sign out (red text, with a confirm). Sign out is never next to a link.
5. The app version, centred.

---

## 0B. Plain words

Screens use everyday words. Code identifiers, routes, query keys and API fields keep their old names; only the text on screen changes.

| Never on screen | Say instead |
|---|---|
| Regularize, Regularization | Fix attendance (a request is an "attendance fix") |
| Keka Code, Cost Code | Project code |
| Keka Code Owner, Cost Code Owner, Keka Owner | Project owner |
| Buffer | Unlogged time |
| Statement (of expenses) | Expense report |
| Redeem, Redemption | Use coins |
| Loans | Salary advance |
| CTC | Annual salary (CTC) |
| FY | Financial year (e.g. "Financial year 2026-27") |
| TDS | Income tax (TDS) |
| Expense heads | Expense type |
| Voucher number | Bill number |
| Pending | Waiting |
| Phase | Stage |
| "Advance" on its own | Say which one: Salary advance, Money given (petty cash) or Vendor advance |
| Website menu paths ("Accounts → …", "Config → …", "Attendance → Setup") | "on the DASH website" |

Write short: one idea per line, sentence case, no jargon, and say a thing once (if the hero shows it, the list below doesn't repeat it). Request statuses are **Waiting / Approved / Rejected / Cancelled**.

---

## 0C. Formats: one way everywhere

Use the shared helpers. Feature helpers may wrap them, but never re-implement them.

| Value | Write it as | Helper |
|---|---|---|
| Date | "Mon, 19 Oct"; add the year only when it isn't this year ("Sun, 19 Oct 2025") | `dateLabel(value, today)` in `src/lib/dates.ts` (pass `useTodayIst()` during render) |
| Clock time | "9:42 AM" | `timeOf(iso)`; a stored "HH:MM" with `hmLabel()` |
| Date and time | "Mon, 19 Oct, 9:42 AM" | `stampLabel(iso, today)` |
| Duration | "7h 50m", "50m". **Never "7:50"** | `durationLabel(minutes)` |
| Running timer | "2h 14m 05s" | `hms()` in `features/attendance/format.ts` |
| Month | "October 2026" ("Oct 2026" where tight) | `monthYear(ym, style)` |
| Money in lists and rows | No decimals: "₹1,24,500" | `inr(n, { decimals: false })` |
| Money on detail and hero screens | 2 decimals: "₹1,24,500.00" | `inr(n)`, or `Amount` (greyed decimals) |
| Days | "1 day", "2.5 days" | `days(n)` in `src/lib/format.ts` |
| Unit next to a figure (`Metric`, `StatTile`) | "h" or "h/day"; never "hrs" or "hours" | — |
| Status in a list | One `StatusPill`, under the title or in the right column; never inline after a long title | `StatusPill` |

Indian digit grouping everywhere (`en-IN`). Everything is India time, whatever the phone's timezone.

---

## 1. Principles

1. **Fit first.** Design every screen for a 360 dp window, then check 320 dp and font scale 1.3. When space runs out, change the layout (stack, fewer columns, an overflow menu). Don't shrink the content.
2. **One primary action per view.** A view has at most 2 prominent buttons. Fill style shows priority (charcoal, then white pill, then text); size never does. Same-row buttons share one height.
3. **Monochrome with colour for meaning.** About 90% of every screen is pearl, white glass and charcoal ink. Green means good or done, red means bad or failed, amber means waiting. Colour is always paired with a word or an icon.
4. **One typeface.** Plus Jakarta Sans throughout. Light (300) is used only for figures 24 px and larger. Big numbers are the hero: Light, tightly tracked, tabular, with greyed decimals.
5. **Real blur only on chrome** (tab bar, sheets). Content cards imitate glass with translucent white, a bright rim and a whisper of shadow.
6. **Status, then action, then history.** Each tab reads top to bottom as: a hero showing state, its one main action, then lists.
7. **Disclose progressively.** Secondary actions go in an overflow `MenuSheet` or in text links, not in another row of buttons.
8. **Motion explains change.** Animations are quick (150 to 350 ms), have little or no bounce, play once on mount, and respect Reduce Motion.
9. **Say it once, in plain words.** Each thing has one home (section 0A), one name (0B) and one format (0C). Don't add a second card, link or figure for something the screen already shows.

---

## 2. Breakpoints and layout grid

### 2.1 `useLayout()` (new, `src/ui/layout.ts`, exported from `@/ui`)

```ts
import { useWindowDimensions } from 'react-native';
import { layout } from '@/theme/tokens';

export function useLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const compact = shouldStack({ width, fontScale }, { below: 'compact' }); // < 380 dp or text > 115 %
  return {
    width,
    height,
    fontScale,
    compact,
    gutter: compact ? layout.gutterCompact : layout.gutter,        // 16 | 20  screen side padding
    cardPad: compact ? layout.cardPadCompact : layout.cardPad,      // 16 | 20  Card padding
    heroPad: compact ? layout.heroPadCompact : layout.heroPad,      // 20 | 24  dark hero Card padding
    gap: compact ? layout.stackGapCompact : layout.stackGap,        // 12 | 16  between Screen children / cards
  };
}
```

`useWindowDimensions` is a hook, so it is safe under the React Compiler. Use `useLayout()` wherever a size depends on the screen. Never hard-code `space.lg` as the screen gutter.

**One stack rule: `shouldStack(l, rule)`** (also in `layout.ts`). Every layout that changes shape with the window (stacks, moves a pill under the text, swaps a switch for chips) asks it, with named breakpoints from `layout.breakpoint` (`compact` 380, `narrow` 360, `tight` 340, `tiny` 300 dp) and `layout.textScale` (`large` 1.15, `huge` 1.3). Never compare the window with a bare number.

| Rule | Means | Used by |
|---|---|---|
| `{ below: 'compact' }` | < 380 dp or text > 115 % | `useLayout().compact` |
| `{ below: 'narrow' }` | < 360 dp or text > 115 % | leave filter chips, Home code rows, celebration pills |
| `{ below: 'tight' }` | < 340 dp or text > 115 % | `TwoUp` (default) |
| `{ below: 'tiny' }` | < 300 dp or text > 115 % | leave balance and Me › Attendance tile pairs (`TwoUp stackBelow="tiny"`) |
| `{ below: 'tight', text: false }` | < 340 dp only | `FieldPair` |
| `{ below: 'narrow', belowText: 'large', text: 'huge' }` | text > 130 %, or > 115 % under 360 dp | `ActivityRow` right column |
| `{ below: 'narrow', text: false }` | < 360 dp only | `ActivityRow` / `InboxRequestRow` pill under the text |
| `{ text: 'huge' }` / `{ text: 'large' }` | text > 130 % / > 115 % | `InboxRequestRow`, shift facts / visitor time fields |
| `perText: true` | compares `below` with width ÷ font scale | vendor bill and agreement rows, vendor money hero |

### 2.2 Width budget

These numbers are exact. Inside an ActionRow, buttons use 16 dp side padding. One character is 8.3 dp at 15 px SemiBold. At font scale 1.3, divide the character counts by 1.3.

| Window | Mode | Content (W − 2·gutter) | Card inner | Dark hero inner | Half button in card | Label room, md, no icon / with icon |
|---|---|---|---|---|---|---|
| 320 | compact | 288 | 256 | 248 | 122 | 90 dp (10 ch) / 64 dp (7 ch) |
| **360** | compact | **328** | **296** | **288** | **142** | **110 dp (13 ch) / 84 dp (10 ch)** |
| 375 | compact | 343 | 311 | 303 | 149 | 117 dp (14 ch) / 91 dp (10 ch) |
| 390 | regular | 350 | 310 | 302 | 149 | 117 dp (14 ch) / 91 dp (10 ch) |
| 412 | regular | 372 | 332 | 324 | 160 | 128 dp (15 ch) / 102 dp (12 ch) |
| 430 | regular | 390 | 350 | 342 | 169 | 137 dp (16 ch) / 111 dp (13 ch) |

Where the figures come from: a card inner is content minus 2·cardPad, a half button is (inner − 12)/2, and the label room is the half button minus 2×16 padding, minus 26 when there is an icon (an 18 dp icon plus an 8 dp gap).

### 2.3 Spacing ramp (4 dp grid)

Use only 4, 8, 12, 16, 20, 24, 32 and 40, through the `space.*` tokens. The only off-grid values allowed are 1 (hairline), 2 (between stacked lines of text), 3 (inside a pill) and 6 (dot-to-label gap, and label-to-field gap).

| Relationship | Value |
|---|---|
| Label to value, title to subtitle, icon to small text inside a pill | 4 (2 between text lines) |
| Inside a group: chip to chip, icon to label in a button, stacked meta lines | 8 |
| Between blocks inside a content card; between paired or stacked buttons; section title to its content; row element gap | 12 |
| Between blocks inside a dark hero card; between form fields; list row horizontal padding | 16 |
| Between Screen children (cards) | `layout.gap`: 12 compact / 16 regular |
| Between sections (SectionTitle adds `marginTop: 8` on top of the stack gap) | 20 / 24 |
| Between field groups (separate cards) | the stack gap (12 / 16) |
| From the last content block to an in-card ActionRow | 16 |

### 2.4 Vertical frame

| Thing | Rule |
|---|---|
| Screen content top | 4 below the header |
| Screen content bottom, tab screens | `TAB_BAR_SPACE` (= 88: bar 64 + 24) + `Math.max(insets.bottom − 4, 10)` |
| Screen content bottom, screens with a `footer` (ActionBar) | measured footer height + 24 |
| Screen content bottom, other pushed screens | 24 + `insets.bottom` |
| Header heights | GreetingHeader ≈ 72 (8 top + 18 overline + 2 + 32 title + 12 bottom); BrandHeader 56; TitleHeader 56 (8 + 40 + 8) |

### 2.5 Grids

| Grid | Compact (< 380 or text > 1.15) | Regular |
|---|---|---|
| Stat tiles | 2 columns | 2 columns. Use 3 or 4 only when every value is 4 characters or fewer and there are exactly 3 or 4 tiles |
| More menu tiles | 3 columns (at most 9 tiles), width = floor((W − 2·gutter − 2·12)/3) ≈ 101 dp at 360 | 3 columns, same formula |
| Home shortcuts | One row of 2–4 round buttons (48 dp disc over a 13 px label), sharing the row evenly | same |
| Me › Leave balance tiles | Compact tiles, wrapping | same |
| Two cards side by side (each with a chart, avatar grid or more than one line of figures) | **never**; stack them | **never**; stack them |

---

## 3. Tokens: target values for `src/theme/tokens.ts`

Token names stay the same and only their values change. New tokens are marked NEW.

```ts
export const palette = {
  canvas: '#EEEEEC',
  canvasTop: '#F8F8F7',
  canvasBottom: '#E4E4E1',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F1EF',
  surfaceSunken: '#E4E4E1',

  glass: 'rgba(255,255,255,0.62)',          // card fill on iOS
  glassAndroid: 'rgba(255,255,255,0.80)',   // NEW card fill on Android (no shadow there, so the card needs more body)
  glassStrong: 'rgba(255,255,255,0.82)',    // ActionBar, selected glass
  glassEdge: 'rgba(255,255,255,0.95)',
  glassLine: 'rgba(20,20,19,0.06)',

  primary: '#2A2A29',
  primaryDeep: '#161615',
  primarySoft: '#E9E9E6',
  onPrimary: '#FFFFFF',
  onPrimaryMuted: 'rgba(255,255,255,0.6)',  // 6.2:1 on #2A2A29
  onPrimaryFaint: 'rgba(255,255,255,0.45)', // NEW decimals and units on dark (≥ 24 px only)
  charcoal: '#414140',                      // primary button fill (white text 10.2:1)
  charcoalPressed: '#2A2A29',               // NEW

  accent: '#38BC37',                        // green FILL/DOT/ICON only, never text on light, never under white text
  accentDeep: '#2E9E2D',
  accentSoft: '#E6F6E5',
  onAccent: '#FFFFFF',                      // DEPRECATED for text (white on #38BC37 = 2.5:1); only for icons ≥ 18 on accent fills

  ink: '#161615',
  text: '#1C1C1B',
  textMuted: '#666663',   // was #7A7A77 (failed: 3.71:1 on canvas). Now 5.76 white / 4.96 canvas / 5.33 glass
  textFaint: '#858581',   // was #ABABA7 (2.3:1). Now 3.70 white / 3.19 canvas. Placeholders, chevrons, greyed decimals ≥ 24 px, disabled
  hairline: '#E2E2DF',
  separator: 'rgba(22,22,21,0.08)',         // NEW list separators
  track: 'rgba(22,22,21,0.06)',             // NEW segmented track, progress track, empty bars
  pressedTint: 'rgba(22,22,21,0.04)',       // NEW pressed list rows

  success: '#38BC37',
  successSoft: '#E6F6E5',
  successInk: '#237A22',  // NEW text: 5.41 white / 4.66 canvas / 4.82 on successSoft
  danger: '#F44336',
  dangerSoft: '#FDEAE8',
  dangerInk: '#C62828',   // NEW text, badge fill, destructive fill: 5.62 white / 4.84 canvas / 4.85 on dangerSoft
  warning: '#E39B2B',
  warningSoft: '#FBF1E0',
  warningInk: '#8F5A0B',  // NEW text: 5.78 white / 4.97 canvas / 5.16 on warningSoft
  info: '#414140',
  infoSoft: '#ECECE9',

  overlay: 'rgba(22,22,21,0.36)',
} as const;

export const radius = {
  xs: 8,     // was 10: tiny inner elements, progress bars
  sm: 12,    // was 14: tiles and panels nested inside a card, skeleton default, inline alerts
  md: 16,    // was 20: inputs, select fields, inner panels in dark heroes
  lg: 20,    // was 24: standalone small tiles (menu tiles, stat tiles)
  xl: 24,    // was 30: Card, ListCard, sheets' inner cards
  xxl: 28,   // NEW: dark hero cards, sheet top corners
  pill: 999,
} as const;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40 } as const; // unchanged

export const layout = {   // NEW
  compactWidth: 380,
  largeTextScale: 1.15,
  gutter: 20, gutterCompact: 16,
  cardPad: 20, cardPadCompact: 16,
  heroPad: 24, heroPadCompact: 20,
  sheetPad: 20,
  stackGap: 16, stackGapCompact: 12,
  hit: 48,                                  // minimum effective touch target (dp)
  control: { lg: 52, md: 44, sm: 36 },      // button heights
  tabBar: { height: 64, inset: 16, insetNarrow: 12, slot: 48, slotNarrow: 44, pill: 48, padX: 6 },
  tabBarSpace: 88,                          // bar height + 24 clearance (bottom inset added separately)
} as const;

export const type = {
  display:     { fontFamily: font.light,    fontSize: 46, lineHeight: 52, letterSpacing: -1.2 },
  hero:        { fontFamily: font.light,    fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  title:       { fontFamily: font.regular,  fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  heading:     { fontFamily: font.medium,   fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  body:        { fontFamily: font.regular,  fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  bodyStrong:  { fontFamily: font.semibold, fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  label:       { fontFamily: font.regular,  fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  labelStrong: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  caption:     { fontFamily: font.regular,  fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },  // was 11/14
  micro:       { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.2 },  // NEW: badges, counts only
} as const;

export const shadow = {
  soft: { shadowColor: '#1A1A18', shadowOpacity: 0.05, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },   // iOS only
  float: { shadowColor: '#1A1A18', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 }, // was elevation 10
} as const;

// statusTone gains `dot`; `fg` becomes the accessible ink.
export const statusTone = {
  pending: { fg: '#8F5A0B', dot: '#E39B2B', bg: 'rgba(255,255,255,0.7)', border: '#F1D9B0' },
  done:    { fg: '#237A22', dot: '#38BC37', bg: 'rgba(255,255,255,0.7)', border: '#BFE6BE' },
  failed:  { fg: '#C62828', dot: '#F44336', bg: 'rgba(255,255,255,0.7)', border: '#F7C3BF' },
  info:    { fg: '#414140', dot: '#414140', bg: 'rgba(255,255,255,0.7)', border: '#DADAD6' },
  neutral: { fg: '#666663', dot: '#858581', bg: 'rgba(255,255,255,0.7)', border: '#E2E2DF' },
};

export const motion = {
  // durations (ms)
  instant: 100, fast: 160, base: 240, enter: 320 /* was 460 */, slow: 450, countUp: 700, countUpdate: 400,
  stagger: 40 /* was 55 */, staggerMax: 5, enterOffset: 12,
  // easings: Easing.bezier(...motion.easeOut) on the JS side; inside worklets use Easing.out(Easing.cubic) / Easing.in(Easing.cubic)
  easeOut: [0.16, 1, 0.3, 1], easeIn: [0.3, 0, 0.8, 0.15], easeStandard: [0.2, 0, 0, 1],
  // springs (mass 1)
  snap:      { stiffness: 439, damping: 42, mass: 1 },  // ≈300 ms, no bounce: press release, toggles
  layout:    { stiffness: 247, damping: 30, mass: 1 },  // ≈400 ms, 5 % bounce: tab pill, segmented thumb, expand
  sheet:     { stiffness: 195, damping: 26, mass: 1 },  // ≈450 ms, 8 % bounce: sheets
  smooth:    { stiffness: 158, damping: 25, mass: 1 },  // ≈500 ms, no bounce: large moves
  celebrate: { stiffness: 158, damping: 20, mass: 1 },  // 20 % bounce: success check only, rare
  // legacy names kept, retuned (previous values had 27–42 % bounce)
  spring:     { stiffness: 247, damping: 30, mass: 1 },
  springSoft: { stiffness: 158, damping: 25, mass: 1 },
  press:      { stiffness: 439, damping: 42, mass: 1 },
} as const;
```

`font` stays the same; the 700 Bold face stays loaded but is not used in new code. **Never set `fontWeight`** with Plus Jakarta Sans. Choose the weight through `fontFamily` only, because on Android `fontWeight` falls back to Roboto.

---

## 4. Typography

### 4.1 Scale and usage

| Variant | Size/line | Weight | Tracking | Use | maxFontSizeMultiplier (default set by `Text`) |
|---|---|---|---|---|---|
| display | 46/52 | Light 300 | −1.2 | One hero figure per screen (timer, take-home pay, leave days, inbox total) | 1.15 |
| hero | 32/38 | Light 300 | −0.8 | Secondary figures: stat tiles, card figures, "Not clocked in" | 1.2 |
| title | 26/32 | Regular | −0.5 | Tab root screen title (GreetingHeader) | 1.3 |
| heading | 18/24 | Medium | −0.2 | Card titles, section titles, sheet titles, pushed-screen title | 1.4 |
| body | 15/22 | Regular | −0.1 | Paragraphs, values | 1.6 |
| bodyStrong | 15/22 | SemiBold | −0.1 | Row titles, button labels, emphasised values | 1.6 (buttons 1.3) |
| label | 13/18 | Regular | 0 | Subtitles, overlines (the muted line above a title), helper text | 1.6 |
| labelStrong | 13/18 | SemiBold | 0 | Field labels, small button labels, pill values | 1.6 (chips, segments 1.2) |
| caption | 12/16 | Regular | +0.1 | Meta lines, timestamps, legend, chart captions | 1.4 |
| micro | 11/14 | SemiBold | +0.2 | **Only** badges, counters and weekday initials under date discs | 1.1 |

Rules:

- **Weights.** Light only at 24 px or more. Below 20 px use Regular, Medium or SemiBold. A single card uses at most 3 type sizes and at most 3 weights.
- **No text below 11 px**, anywhere. That includes `fontSize: 9` or `10` overrides. Use `micro`. SVG chart labels may stay at 11.
- **Overlines** are `label` in muted colour, sentence case, placed above the title. Don't use uppercase eyebrows.
- **Inputs** are 16 px Regular, so iOS doesn't zoom.

### 4.2 Text component changes (`src/ui/text.tsx`)

- Apply the per-variant `maxFontSizeMultiplier` default from the table above. A `maxFontSizeMultiplier` prop overrides it.
- Android: `includeFontPadding: false` on every Text. This fixes the low-sitting labels inside pills and buttons.
- `display` and `hero` automatically get `fontVariant: ['tabular-nums']`. The bundled Jakarta 300/400/500/600 TTFs contain `tnum`.
- New prop `tabular?: boolean` adds `fontVariant: ['tabular-nums']` to any variant. Use it on timers, clocks, amounts in rows, counts, and every count-up.
- `allowFontScaling` stays on. Never set it to false.

### 4.3 Big numbers (Amount, Metric, hero figures)

- Lay out a single parent `<Text>` with nested `<Text>` runs, so everything shrinks together: currency, integer, decimals, unit.
- Integer: variant colour (`text` on light, `onPrimary` on dark), tabular.
- Currency symbol `₹`: same variant at **60% font size** (`fontSize: round(size*0.6)`), muted (`textMuted` on light, `onPrimaryMuted` on dark), no space before the integer.
- Decimals, including the dot: same size as the integer, greyed (`textFaint` on light, `onPrimaryFaint` on dark). This keeps the ZIXO look.
- Unit (`h`, `days`, `h/day`; never `hrs`): `label` 13 or `body` 15, muted, with a leading space.
- Parent Text: `numberOfLines={1}`, `adjustsFontSizeToFit`, `minimumFontScale={0.7}`, maxFontSizeMultiplier from the variant. Indian grouping: `toLocaleString('en-IN')`.
- Inside a stat tile, cap the figure at `hero` (32).

### 4.4 Truncation budget

| Text | Max lines | Notes |
|---|---|---|
| Row title | 1 | ellipsize at the tail |
| Row subtitle | 1 (2 for hint or description rows such as "Time" links) | |
| Row meta | 1 | |
| Card title | 1 | |
| Screen title, pushed | 1 | |
| Screen title, tab root | 1 | |
| Hero name (person) | 2 | full name in `accessibilityLabel` |
| Empty-state message | 2 (rewrite copy so it fits in about 90 characters) | |
| Descriptions or notes in cards | unlimited | they wrap; no fixed heights |
| Button, chip, pill, tab, segment labels | 1 | must fit (section 8); never ellipsized in normal use |

`ellipsizeMode` is always `'tail'`. It is the only mode Android supports on multi-line text.

---

## 5. Colour roles

Colour pass (Oct 2026): the app was too monochrome; the user rejected indigo/purple, a navy brand and a teal+gold palette, and asked for the best palette to be chosen by an unbiased multi-agent vote. Seven agents proposed palettes from different angles; each was rendered as phone mockups, anonymised and ranked by six independent judges (Borda count, shuffled order), the top three were refined and re-voted by six fresh judges. Winner: **Ember** — vermilion brand `#C33B02` with a vermilion → crimson-wine hero, orange/rose/honey-gold highlights, an emerald Pay hero and cool blue/teal module tones for balance, on a warm ivory canvas. Every text pair is WCAG AA. Values live in `src/theme/tokens.ts`; Payno/Lendora inspire layout only (docs/LAYOUT-REFS.md).

| Role | Token | Where |
|---|---|---|
| Canvas | `canvasTop → canvas → canvasBottom` gradient plus a white glow (`Backdrop`) | behind every screen |
| Content card | `glass` (iOS) / `glassAndroid` (Android), rim `glassEdge` (iOS) or border `glassLine` (Android) | cards, list cards |
| Solid surface | `surface` | sheets' inner fields, white pills, menu tiles |
| Primary text | `text` | everything by default |
| Secondary text | `textMuted` | subtitles, labels, overlines, helper text |
| Tertiary / decorative | `textFaint` | placeholders, chevrons, greyed decimals (24 px or more), disabled, future calendar days |
| Brand | `primary` vermilion `#C33B02`, soft `primarySoft`; warm highlights `sunset` (orange), `coral` (rose), `gold` (honey) (+ `Ink` for text, `Soft` for tints) | active tab, selected segment and chip, links, focus |
| Primary action fill | `charcoal` (vermilion `#C33B02`), pressed `charcoalPressed` | the one primary button on light surfaces |
| Hero | `gradient.brand` vermilion → crimson plus the `gradient.glow` corner (`Card tone="primary"`), or `Card tone="primary" gradient={moduleTone[x].gradient}`. Light heroes: `gradient.sunsetLight` with ink text | at most 1 per screen, at the top |
| Module colour | `moduleTone[x]`: `fg` icon/text ink, `bg` soft tint, `gradient` hero. Use `<ModuleBadge module icon />` for leading icons | every module tile, row icon, chart series |
| Text on dark | `onPrimary` / `onPrimaryMuted` / `onPrimaryFaint` | inside dark cards |
| Good | fill/dot/icon `success`; text `successInk`; soft bg `successSoft` | done, approved, present, positive delta |
| Bad | fill/dot/icon `danger`; text, badge fill, destructive fill `dangerInk`; soft bg `dangerSoft` | errors, rejected, absent, negative delta, destructive actions |
| Waiting | fill/dot/icon `warning`; text `warningInk`; soft bg `warningSoft` | pending, half day, late |
| Selected (chip, segment, tab) | `primary` vermilion fill with white SemiBold text | |
| Badges | `dangerInk` fill with white `micro` text; only the Inbox tab and critical counts | |
| Neutral counts (menu tile "new", segment counts) | `charcoal` fill with white `micro` text | |

**Forbidden:**

- White text on `accent` or `success` (2.50:1) or on `danger` (3.68:1). That includes `palette.onAccent` used as **text**. Use a white pill and `ink` text on dark cards, a `successSoft` background with `successInk` text on light cards, or a charcoal badge with white text.
- Using `palette.success`, `accent`, `accentDeep`, `warning` or `danger` as the **colour of text on a light surface**. Use `successInk`, `warningInk` or `dangerInk` instead. The bright tones stay for dots, icons (18 px or more), fills, bars and the calendar legend.
- Exception: on the charcoal hero, green or red text is allowed only at 15 px SemiBold or larger. Otherwise use a coloured dot with a white label.
- A coloured fill as the only cue (WCAG 1.4.1). Every status colour comes with a word or an icon.
- Green and red filled buttons side by side.
- More than 1 dark hero card per screen.

---

## 6. Surfaces and elevation

| Surface | Radius | Padding | Fill / edge | Shadow |
|---|---|---|---|---|
| `Card` surface (glass) | `xl` 24 | `cardPad` (16/20) | iOS: `glass` + 1 px `glassEdge`. Android: `glassAndroid` + 1 px `glassLine` | iOS `shadow.soft`; Android none (elevation 0 on translucent fills) |
| `Card` muted | 24 | cardPad | `rgba(255,255,255,0.34)` + 1 px `rgba(255,255,255,0.75)` | none |
| `Card` accent (solid white) | 24 | cardPad | `surface` + rim | iOS soft |
| `Card` primary / ink (dark hero) | `xxl` 28 | `heroPad` (20/24) | gradient `#3A3A38 → #1E1E1D` (ink: `#262625 → #0F0F0E`), 1 px `rgba(255,255,255,0.07)` | none |
| Inner panel in a dark hero | `md` 16 | 12 | `rgba(255,255,255,0.10)` (selected 0.20) | none |
| Inline alert in a dark hero | `sm` 12 | 12 | `surface` with ink or dangerInk text | none |
| Tile nested in a card | `sm` 12 | 12 | `surfaceMuted` or `rgba(255,255,255,0.7)` | none |
| Standalone small tile (menu, stat) | `lg` 20 | 16 (menu: 12) | glass / `surface` | iOS soft |
| Input | `md` 16 | 16 horizontal | `rgba(255,255,255,0.7)` (in sheets: `surfaceMuted`) | none |
| Sheet | top 28 | `sheetPad` 20 | `#FAFAF9`, 1 px top rim | backdrop `overlay` |
| Tab bar | 32 | 6 horizontal | iOS: `rgba(255,255,255,0.55)` over BlurView 45 light. Android: `rgba(250,250,249,0.96)` | `shadow.float` (Android elevation 8) |
| ActionBar | 0 | 12 top / gutter sides | iOS: BlurView 40 light + `glassStrong`. Android: `rgba(250,250,249,0.96)` | 1 px top `glassLine` |

Nesting:

- Cards nest at most one level. Inside a card, use hairlines or `surfaceMuted` tiles, never another `Card`.
- Inner radius = outer radius − padding, with a minimum of 8. The values above already follow this.
- A section with more than 5 items is a `ListCard` (rows separated by hairlines), not a stack of cards.

Real `BlurView` appears in only 3 places: the tab bar, the ActionBar and the sheet header (sheet blur is optional). Never put one inside a ScrollView or a FlashList item.

---

## 7. Components

Every measurement includes its effective touch target. The minimum target is 48 dp, made up of the visual size plus `hitSlop`, where hitSlop per side is (48 − visual)/2. Adjacent targets need a gap of at least the sum of their hitSlops, and at least 8.

### 7.0 Kit API reference (as built, 19 Oct 2026)

K1–K17 are implemented. Everything below is exported from `'@/ui'` (except the tab bar, which the two tab layouts import from `'@/ui/tab-bar'`). Every prop that existed before this pass still works; the new ones are optional. Where this reference and a later subsection disagree, this reference describes the code.

**Layout, text, motion, haptics**

| Export | File | Signature / notes |
|---|---|---|
| `useLayout()` | `layout.ts` | `→ { width, height, fontScale, compact, gutter, cardPad, heroPad, gap }`. `compact` = width < 380 or fontScale > 1.15 |
| `shouldStack(l, rule?)`, types `StackRule`, `Breakpoint`, `TextSize` | `layout.ts` | `l` = `{ width, fontScale }` (a `useLayout()` result). `rule` = `{ below?: Breakpoint \| number, belowText?: TextSize, text?: TextSize \| false = 'large', perText? }` → true below `below` (there only above `belowText` when set) or above `text` at any width. See §2.1 |
| `hitSlopFor(size, min = 0)` | `layout.ts` | Per-side hitSlop that pads `size` to 48 dp |
| `Text` | `text.tsx` | `variant?: 'display' \| 'hero' \| 'title' \| 'heading' \| 'body' \| 'bodyStrong' \| 'label' \| 'labelStrong' \| 'caption' \| 'micro'`, `color?`, `muted?`, `align?`, **`tabular?`** + all RN Text props. Sets the per-variant `maxFontSizeMultiplier` (`MAX_FONT_SCALE`), `includeFontPadding: false` on Android, tabular digits for display/hero |
| `Reveal` | `motion.tsx` | `{ index?, delay?, style?, children }`. Fade + 12 dp rise (240/320 ms), 40 ms × min(index, 5) |
| `PressableScale` | `motion.tsx` | Pressable + `scaleTo?` (default 0.97). 100 ms press-in, `motion.snap` release; no scale under Reduce Motion |
| `useCountUp(target, duration?)` | `motion.tsx` | First show 0 → target over `duration ?? 700` ms (0 = no animation). Later: 400 ms glide only if the change is ≥ 5 % and \|target\| ≥ 10, else jump. Reduce Motion: jump. Non-finite targets are ignored |
| `GrowIn` | `motion.tsx` | `{ delay = 120, style?, children }`, 600 ms scaleY from the bottom |
| `haptic` | `haptics.ts` | `haptic.select() / impact() / success() / warning() / error()`, never throws |
| `SurfaceContext`, `useSurface()` | `surface.ts` | `'screen' \| 'sheet'`; `Sheet` provides `'sheet'` so fields switch to the `surfaceMuted` fill |

**Screen and headers** (`screen.tsx`)

| Export | Props |
|---|---|
| `Screen` | ScrollView props + `header?`, **`footer?`** (pinned, measured, inside a KeyboardAvoidingView; content bottom padding = footer height + 24), `withTabBar?` (bottom = 88 + max(insets.bottom − 4, 10)), `scroll?` (false for FlashList screens; gutter still applied, and bottom padding = footer height when there is a footer), `onRefresh?`, `contentStyle?`, `animate?`. Gutter and child gap from `useLayout()`. `keyboardDismissMode` defaults to interactive (iOS) / on-drag (Android) |
| `TAB_BAR_SPACE` | `88` |
| `GreetingHeader` | `{ overline, title, actions? }` — ≤ 2 IconButtons |
| `BrandHeader` | `{ left?, center?, right? }` — 48 dp side slots, 56 high |
| `TitleHeader` | `{ title, right?, onBack?, rightSlots?: 1 \| 2 }` — side slots 40 or 88 so the title stays centred; the right slot is a `minWidth`, so wider content never overlaps the title |
| `SectionTitle` | `{ title, overline?, right? }` |
| `Section` | `{ title, overline?, right?, style?, children }` — gap 12, one Screen child |
| `SectionLabel` | `{ title, right?, style? }` — the small muted label over a white card: `labelStrong` muted, up to 2 lines, 4 dp in from the card edge; with `right` (one control) the row is 44 high. Alone as a FlashList section header |
| `LabelledSection` | `{ title, right?, style?, children? }` — a SectionLabel over its card, gap 8, one Screen child |
| `Backdrop` | the pearl canvas |

**Cards, buttons, figures** (`primitives.tsx`)

| Export | Props |
|---|---|
| `Card` | View props + `tone?: 'surface' \| 'muted' \| 'accent' \| 'primary' \| 'ink'`, `padded?`, `onPress?`. Radius 24 (dark 28); padding `cardPad` / `heroPad` |
| `Button` | `{ title, variant?, size?, icon?, loading?, disabled?, style?: StyleProp<ViewStyle> }` + Pressable props. `variant: 'primary' \| 'accent' \| 'ghost' \| 'onPrimary' \| 'danger' \| 'destructive' \| 'text' \| 'ink'`; `size: 'lg' \| 'md' \| 'sm'`. Types `ButtonProps`, `ButtonVariant`, `ButtonSize` exported. The icon is cloned with the variant's colour, size 18 (sm 16) and strokeWidth 2, so pass `icon={<Plus />}` with no colour. Disabled = opacity 0.4; loading keeps the width (spinner centred) |
| `IconButton` | `{ children, accessibilityLabel, tone?: 'muted' \| 'surface' \| 'onPrimary', size? = 40, dot?, disabled?, style? }`; hitSlop = `hitSlopFor(size, 4)`; dev warning without a label |
| `PillButton` | `{ label, icon?, chevron? = true, onPress?, tone?: 'glass' \| 'onPrimary', style?, accessibilityLabel? }` — 36 high, centred by default |
| `ViewAllPill` | `{ label? = 'View all', onPress?, accessibilityLabel? }` — 32 high, hitSlop 8/4 |
| `CardHeader` | `{ title, overline?, right?, onDark? }` |
| `Amount` | `{ value, currency? = '₹', decimals? = 2, variant?, color?, mutedColor?, animate? = true, prefix?, onDark?, style? }` — ₹ at 60 % (variants ≥ 24 px), muted; decimals greyed; one line, `adjustsFontSizeToFit` 0.7; full value in `accessibilityLabel`. On dark pass `onDark` or a white `color` |
| `Metric` | `{ value, decimals? = 0, unit?, variant? = 'display', color?, animate? = true, onDark?, style? }` — unit in body 15 (label 13 for heading), muted |
| `StatusPill` | `{ label, tone: StatusTone, style? }` — dot `statusTone[tone].dot`, text `statusTone[tone].fg` |
| `DeltaChip` | `{ value, onDark? }` — successInk / dangerInk on light |
| `Avatar` | `{ name?, uri?, size? = 40, ring? = true }` (default was 44) |
| `AvatarStack` | `{ people: { name?, uri? }[], max? = 5, size? = 32, style? }` |
| `IconAction` | `{ icon: LucideIcon, label, onPress?, tone?: 'surface' \| 'primary' \| 'onPrimary', size? = 48, disabled? }` |
| `Skeleton` | `{ height, width?: DimensionValue, radius? = 12, style? }` — Reanimated pulse, static under Reduce Motion |
| `EmptyState` | `{ title, message?, icon?, action?, messageLines? = 4, style? }` — the icon is resized to 28 (its colour is kept). Write messages for 2 lines (~90 characters); up to `messageLines` are shown so legacy copy is never cut mid-sentence |
| `ErrorState` | `{ message, onRetry?, title? = 'Couldn’t load this' }` — CloudOff icon, message max 3 lines, "Try again" (`accent md`) |
| `Row` | View with `flexDirection: 'row', alignItems: 'center'` |

**Actions** (`actions.tsx`)

| Export | Props |
|---|---|
| `ActionRow` | `{ context?: 'card' \| 'hero' \| 'bar' \| 'sheet' \| 'screen' = 'card', stacked?, style?, children }`. Children in row order (secondary first). Side by side when both labels fit (formula in 7.2), otherwise stacked with the primary on top. While one child is `loading`, the others are disabled. Children that carried a legacy `style={{ flex: 1 }}` are neutralised when stacked |
| `ActionBar` | `{ note?: string \| null, style?, children }` — pass as `Screen footer` |

**Lists** (`list.tsx`)

| Export | Props |
|---|---|
| `ListRow` | `{ title, subtitle?, meta?, left?, right?, onPress?, chevron?, numberOfLines? = 1, subtitleLines? (defaults to numberOfLines), size?: 'md' \| 'lg', value?, valueMeta?, valueColor?, titleColor?, disabled?, accessibilityLabel? }`. `value`/`valueMeta` render the right-hand figure column (bodyStrong tabular + caption); the right column is `flexShrink: 0, maxWidth: '45%'` |
| `ListCard` | `{ title?, right?, separatorInset? = 68, style?, children }` |
| `IconBadge` | `{ children, bg?, size? = 40, style? }` |
| `GroupedRow` / `GroupedSeparator` | `{ first?, last?, tone?: ListTone = 'glass', hairline?, inset? = 68, style?, children }` / no props. `hairline`: every row after the first draws its own inset hairline on top (no ItemSeparatorComponent) |
| `SkeletonList` | `{ rows? = 3, avatar?, style? }` |
| `LIST_INSET` | `68` |
| `WHITE_CARD` | `{ backgroundColor: surface, borderColor: glassLine }` — the Payno white card; `tone="surface"` uses it, and `<Card tone="accent" style={[WHITE_CARD, …]}>` matches it |

**Controls and inputs** (`controls.tsx`, `inputs.tsx`)

| Export | Props |
|---|---|
| `Segmented` | `{ options: { key, label, badge? }[], value, onChange }` — unchanged API. > 4 options or any label > 10 characters → ChipRow of Chips (badge → count) |
| `Chip` | `{ label, selected?, onPress?, icon?, count?, disabled? }` — the icon is recoloured (white when selected) and sized 14 |
| `ChipRow` | `{ bleed?: 'screen' \| 'card' \| 'none' = 'screen', wrap?, style?, children }` |
| `SelectField` | `{ label?, value, options, onChange, placeholder?, error?, hint?, disabled? }` |
| `DateField` | `{ label?, value, onChange, minimumDate?, maximumDate?, placeholder?, error?, hint? }` — always stack date fields |
| `TimeField` | `{ label?, value, onChange, placeholder?, error?, hint? }` |
| `FieldPair` | `{ children, style? }` — two TimeFields, each `flex: 1`; stacks below 340 dp (`shouldStack` `{ below: 'tight', text: false }`) |
| `FieldMessage` | `{ error?, hint? }` — the error row (CircleAlert 14 + dangerInk caption) or the hint, as used under every field |
| `TextField` | TextInput props + `{ label?, error?, hint?, left?, right?, counter? }` (`counter` + `multiline` + `maxLength` shows "n/max"). 52 high; multiline 112 |
| `OtpInput` | `{ value, onChange, length? = 6, autoFocus? = true }` |

**Sheets, notices, data display**

| Export | File | Props |
|---|---|---|
| `Sheet` | `sheet.tsx` | `{ visible, onClose, title?, subtitle?, footer?, scroll? = true, dirty?, children }` |
| `MenuSheet` | `sheet.tsx` | `{ visible, onClose, title?, subtitle?, items: MenuItem[] }`, `MenuItem = { key, label, icon?: LucideIcon, onPress, hint?, tone?: 'default' \| 'danger', disabled? }` |
| `Banner` | `banner.tsx` | `{ tone?: 'info' \| 'success' \| 'warning' \| 'danger', title?, message?, action?: ReactNode \| { label, onPress, loading? }, icon?: LucideIcon, style?, children? }` |
| `EventTimeline` | `timeline.tsx` | `{ events: { key, label, at?, by?, detail?, note?, tone?: 'neutral' \| 'good' \| 'bad' \| 'info' \| 'wait' }[] }` |
| `StatTile` | `stats.tsx` | `{ label, value: string \| number, unit?, caption?, footer?, tone?: 'surface' \| 'primary', valueColor?, onPress?, style? }` |
| `StatGrid` | `stats.tsx` | `{ columns?: 2 \| 3 \| 4 = 2, style?, children }` |
| `KeyValueRow` | `key-value.tsx` | `{ label, value: string \| number \| null \| undefined, hint?, tone?: 'default' \| 'muted' \| 'success' \| 'warning' \| 'danger', strong?, tabular?, onPress?, action?, selectable?, divider?, style? }` — an empty value shows "—". Standalone rows draw no separator; pass `divider` on every row after the first |
| `KeyValueList` | `key-value.tsx` | `{ rows: (KeyValueRowProps & { key? })[], hideEmpty?, style? }` — adds the dividers itself |
| `toast`, `ToastHost` | `toast.tsx` | `toast.show(message, tone?: 'success' \| 'info' \| 'danger')`, `toast.hide()`; `ToastHost` is mounted in `src/app/_layout.tsx` |
| `HairlineBars`, `DotMatrix`, `BarStrip`, `LineChart` | `charts.tsx` | Unchanged props. Input arrays are guarded (non-arrays become `[]`, NaN becomes 0) |

**Payno / Lendora additions (20 Oct 2026, docs/LAYOUT-REFS.md).** All exported from `'@/ui'`; every older prop still works.

| Export | File | Signature / notes |
|---|---|---|
| `HomeHeader` | `screen.tsx` | `{ greeting, name?, avatarName?, avatarUri?, onAvatarPress?, avatarLabel? = 'Your profile', onBellPress?, bellDot?, bellLabel? = 'Inbox', right?, demo? }`. Avatar 44 (initials in `avatarTone`) left; muted `label` greeting over the name (regular 22, 1 line) with the gold DEMO pill beside it (auto for the demo session); bell IconButton 44 `surface` with dot right. No logo. Pass `greeting` in (`greeting(new Date(useNow()))`) so render stays pure. `BrandHeader` is unchanged |
| `QuickActions`, type `QuickAction` | `quick-actions.tsx` | `{ items: { key, label, icon: LucideIcon, module: ModuleKey, onPress, badge?: number \| true, hint?, accessibilityLabel?, disabled? }[], columns?: 3 \| 4 = 4, size? = 54, style? }`. 54 dp `moduleTone` discs, 12 px Medium labels (2 lines, centred). Row while every label fits without breaking a word; 11 px at default text on very narrow phones; 2 per row with large text. Width is measured, so it fits inside cards too |
| `ActivityList` | `list.tsx` | `{ title?, overline?, onSeeAll?, seeAllLabel? = 'See all', seeAllAccessibilityLabel?, right?, loading?, loadingRows? = 3, empty?, tone?: 'surface' \| 'glass' = 'surface', separatorInset?, style?, children }` — one Screen child: title (heading, 2 lines) + "See all" text link over ONE white card with hairlines. Renders nothing with no rows, no `loading` and no `empty` |
| `ActivityRow`, type `ActivityRowProps` | `list.tsx` | `{ title, subtitle?, note?, left? \| module?+icon? \| person?: { name?, uri? }, value?, valueColor?, meta?, status?: { label, tone: StatusTone }, right?, onPress?, chevron?, titleLines? = 2, subtitleLines? = 2, titleColor?, disabled?, accessibilityLabel?, accessibilityHint? }` — a ListRow `size="lg"`: value over muted `meta` or a StatusPill on the right. < 360 dp with value + status: the pill goes under the text. > 130 % text: the whole right column goes under the text |
| `SeeAllLink` | `list.tsx` | `{ label? = 'See all', onPress?, accessibilityLabel? }` — labelStrong in `primary`, 44 high |
| `ListRow` (new props) | `list.tsx` | `below?: ReactNode` (one element under the text), `stackRight?: boolean`, `accessibilityHint?` |
| `ListCard`, `SkeletonList` (new prop) | `list.tsx` | `tone?: 'glass' \| 'surface'` (`ListTone`); `surface` = solid white + hairline |
| `StatTile variant="light"` | `stats.tsx` | Lendora white tile: `prefix?` (superscript, e.g. '₹'), the figure (light 40/32/26/24 by length, greyed decimals; numbers take `decimals?`), `unit?` (superscript), `delta?: number \| DeltaSpec`, then `label` as the muted caption, `caption?`, `footer?`, `module?`+`icon?` (badge on top), `valueColor?`, `onPress?` |
| `DeltaTag`, types `DeltaSpec`, `DeltaDirection` | `stats.tsx` | `{ value?: number (signed %) , label?, direction?: 'up' \| 'down' \| 'flat', good?, style? }` — tiny arrow chip: successInk/successSoft when good, dangerInk/dangerSoft when bad, grey when flat |
| `TwoUp` | `stats.tsx` | `{ children (2), stackBelow?: Breakpoint \| number = 'tight', style? }` — two equal tiles at equal height, gap 12; stacked below 340 dp (`stackBelow`) or text > 115 % |
| `AreaChart` | `charts.tsx` | `{ values, labels?, highlight?, formatPoint?: (v, i) => string, guide?, guideLabel?, color? = palette.sunset, height? = 140, zeroBased? = true, accessibilityLabel?, style? }` — smooth line over a fill fading to transparent, ink pill tooltip on the highlighted point, muted x labels (+22 dp), at most one faint dashed guide |
| Tab bar | `tab-bar.tsx` | Android bar is now solid `palette.surface` (opaque) with a `glassLine` hairline; iOS keeps the blur |

**Examples**

```tsx
// Detail screen with a sticky decision bar
<Screen
  header={<TitleHeader title="Leave request" />}
  footer={canAct ? (
    <ActionBar>
      <ActionRow context="bar">
        <Button variant="danger" title="Reject" icon={<X />} onPress={openReject} />
        <Button variant="primary" title="Approve" icon={<Check />} loading={approving} onPress={approve} />
      </ActionRow>
    </ActionBar>
  ) : undefined}>
  <Card><KeyValueList rows={[{ label: 'From', value: from }, { label: 'Days', value: days, tabular: true }]} hideEmpty /></Card>
  <Card><EventTimeline events={history} /></Card>
</Screen>

// Form with a blocker note
<Screen header={<TitleHeader title="Apply leave" />}
        footer={<ActionBar note={blocker}><Button title="Send for approval" icon={<Send />} disabled={!!blocker} loading={busy} onPress={submit} /></ActionBar>}>
  <Segmented options={kinds} value={kind} onChange={setKind} />
  <Card style={{ gap: 16 }}>
    <SelectField label="Leave type" value={typeId} options={types} onChange={setTypeId} hint={typeHint} />
    <DateField label="From" value={from} onChange={setFrom} />
    <DateField label="To" value={to} onChange={setTo} />
  </Card>
  {error ? <Banner tone="danger" title="Couldn’t send" message={error} /> : null}
</Screen>

// FlashList rows as one card
<FlashList data={rows} ItemSeparatorComponent={GroupedSeparator}
  renderItem={({ item, index }) => (
    <GroupedRow first={index === 0} last={index === rows.length - 1}>
      <ListRow size="lg" left={<Avatar name={item.name} uri={item.photo} />} title={item.name} subtitle={item.role} chevron onPress={() => open(item.id)} />
    </GroupedRow>
  )} />

// Stat tiles
<StatGrid columns={2}>
  <StatTile label="Days present" value={present} unit={`/ ${working}`} tone="primary" />
  <StatTile label="Late in" value={late} valueColor={late > 0 ? palette.warningInk : undefined} />
</StatGrid>

// Overflow menu
<IconButton accessibilityLabel="More actions" onPress={() => setMenu(true)}><MoreHorizontal size={20} color={palette.text} /></IconButton>
<MenuSheet visible={menu} onClose={() => setMenu(false)} items={[
  { key: 'share', label: 'Share', icon: Share2, onPress: share },
  { key: 'withdraw', label: 'Withdraw request', icon: Undo2, tone: 'danger', onPress: withdraw },
]} />
```

### 7.1 Button (`src/ui/primitives.tsx`)

| Size | minHeight (never `height`) | paddingHorizontal | Label | Icon | Icon gap | hitSlop |
|---|---|---|---|---|---|---|
| `lg` (default) | 52 | 24 (16 inside an ActionRow pair) | 15/20 SemiBold | 18 | 8 | 0 |
| `md` | 44 | 16 | 15/20 SemiBold | 18 | 8 | 2 |
| `sm` (NEW) | 36 | 14 | 13/18 SemiBold | 16 | 6 | 6 |

Every size is a capsule (radius = height/2).

| Variant | Fill | Label/icon | Border | Pressed | Use |
|---|---|---|---|---|---|
| `primary` | `charcoal` | white | `charcoal` | fill `charcoalPressed` | **The** main action on light surfaces: Submit, Approve, Save, Download, Continue |
| `accent` | `surface` white | `ink` | 1 px `rgba(22,22,21,0.08)`, iOS soft shadow | fill `surfaceMuted` | Secondary action on light surfaces; **the** main action on a dark hero (Clock in, Apply leave in the hero) |
| `ghost` | `rgba(255,255,255,0.55)` | `text` | 1 px `glassEdge` | fill `rgba(255,255,255,0.75)` | Low-emphasis action on light surfaces: Try again, Go back, See all N |
| `onPrimary` (NEW) | `rgba(255,255,255,0.12)` | white | 1 px `rgba(255,255,255,0.16)` | fill `rgba(255,255,255,0.20)` | Secondary action inside a dark hero (Pause, Skip) |
| `danger` | `surface` white | `dangerInk` | 1 px `rgba(198,40,40,0.20)` | fill `dangerSoft` | Reject, Withdraw, Cancel request, Delete, Sign out, Not received. **Never filled** |
| `destructive` (NEW) | `dangerInk` | white (5.62:1) | `dangerInk` | `#A82020` | **Only** the single confirm button inside a reason or confirmation sheet ("Reject request", "Delete bill") |
| `text` (NEW) | none | `charcoal` | none | opacity 0.6 | Tertiary links shown as their own line: "Timesheet entry", "View payslips", "Clear search". minHeight 44, padX 12, `alignSelf: 'flex-start'` unless centred |
| `ink` | legacy: renders exactly like `primary` | | | | Don't use in new code |

Behaviour:

- **Icons are recoloured by the Button.** `Button` clones a valid `icon` element with `{ color: fg, size: 18|16, strokeWidth: 2 }`. Callers pass the icon without a colour (`icon={<Plus />}`), so an `accent` button never gets a white-on-white icon.
- **Label:** `numberOfLines={1}`, `flexShrink: 1`, `maxFontSizeMultiplier={1.3}`. The label must fit by the rules in section 8; never rely on the ellipsis.
- **Disabled:** opacity 0.4, no shadow, no press scale.
- **Loading:** the label stays in layout at `opacity: 0`, and an `ActivityIndicator` in the fg colour is absolutely centred, so the width never jumps. Set `accessibilityState={{ busy: true }}`. Other buttons in the same ActionRow or ActionBar are disabled while it loads.
- **Width:** the button stretches in column layouts. To size it to its content, the caller passes `style={{ alignSelf: 'flex-start' }}`.
- **Press:** scale 0.97 (PressableScale). `onPress` fires immediately, not after the animation.
- Existing props (`title, variant, loading, disabled, icon, style, size`) stay the same. `size` gains `'sm'`, and `variant` gains `'onPrimary' | 'destructive' | 'text'`.

### 7.2 ActionRow (NEW, `src/ui/actions.tsx`)

This is the only way to put two labelled buttons together. Never hand-roll `flexDirection: 'row'` with `style={{ flex: 1 }}` on Buttons.

```tsx
<ActionRow context="card">                {/* 'card' | 'hero' | 'bar' | 'sheet' | 'screen' */}
  <Button variant="danger" title="Reject" icon={<X />} onPress={…} />      {/* secondary FIRST */}
  <Button variant="primary" title="Approve" icon={<Check />} onPress={…} /> {/* primary LAST */}
</ActionRow>
```

The decision is deterministic and needs no measuring:

```ts
const { width, fontScale, gutter, cardPad, heroPad } = useLayout();
const outer = { screen: 2 * gutter, bar: 2 * gutter, card: 2 * gutter + 2 * cardPad, hero: 2 * gutter + 2 * heroPad, sheet: 2 * layout.sheetPad }[context];
const half = (width - outer - 12) / 2;
const room = (b: ButtonProps) => half - 2 * 16 - (b.icon ? 26 : 0);
const need = (b: ButtonProps) => b.title.length * 8.3 * Math.min(fontScale, 1.3) * (b.size === 'sm' ? 0.87 : 1);
const side = buttons.length === 2 && buttons.every((b) => need(b) <= room(b));
```

| Case | Result |
|---|---|
| Side by side | `flexDirection: 'row'`, gap 12. Each child is cloned with `style: [child.style, { flex: 1 }]` and padX 16. Both buttons have the same height |
| Stacked | `flexDirection: 'column'`, gap 12. Children render in **reverse** so the primary is on top, each full width |
| 1 child | full-width single button |
| 3 or more children | dev `console.warn` and render stacked. Section 8, rule A7, says to use an overflow menu instead |

### 7.3 ActionBar (NEW, `src/ui/actions.tsx`) and `Screen footer`

This is the sticky commit bar for pushed detail and form screens.

```tsx
<Screen header={…} footer={<ActionBar note={blocker}><Button variant="primary" title="Send for approval" … /></ActionBar>}>
```

- Layout: `paddingTop 12`, `paddingHorizontal gutter`, `paddingBottom Math.max(insets.bottom, 16)`, `gap 8`, top border 1 px `glassLine`. iOS: `BlurView intensity={40} tint="light"` under a `glassStrong` fill. Android: `rgba(250,250,249,0.96)`.
- `note?: string`: a `caption` muted, centred, max 2 lines, shown above the buttons. Use it for blockers ("Pick a leave type first") or hints ("Opens the share sheet").
- Children: one `Button` (lg) or one `ActionRow context="bar"`.
- `Screen` gets a new `footer?: ReactNode` prop. It renders the footer pinned to the bottom, outside the ScrollView. It measures the footer height with `onLayout` and sets the scroll content `paddingBottom = footerHeight + 24`. When `footer` is present, `Screen` wraps the screen in a `KeyboardAvoidingView` (`behavior` is `'padding'` on iOS and `'height'` on Android, matching `Sheet`), so the bar rides above the keyboard.
- Never use it together with `withTabBar`. Never on tab roots.
- `DecisionBar` (in `features/inbox/detail.tsx`) is `ActionBar` + `ActionRow`; `DecisionScreen` passes it as the `footer`.

### 7.4 IconButton

- Default `size` is **40** (was 44). Sizes: 40 for headers, cards and month switchers. 52 next to an lg Button inside a hero, as in the ClockCard locate button, which is 54 today.
- `hitSlop = Math.max(4, (48 - size) / 2)`.
- The icon child is 20 px with strokeWidth 1.8. The caller sets the colour: `palette.text` on light, `palette.onPrimary` on dark, `palette.textFaint` when disabled.
- `accessibilityLabel` is required by convention. The kit logs a dev-only `console.warn` when it is missing.
- Dot (unread): 8 dp `dangerInk`, 2 px border `canvasTop` (`primary` on dark), at top 6, right 6.
- Press scale 0.92. Tones: `muted` (default), `surface`, `onPrimary`.
- Two adjacent IconButtons need a gap of 8 or more (hitSlop 4 + 4).

### 7.5 PillButton, ViewAllPill, CardHeader

- **PillButton:** minHeight 36, padX 14, radius pill, label `labelStrong` 13, `numberOfLines={1}` with flexShrink 1, icon 14–16, chevron 14, gap 6, `hitSlop={6}`, `maxWidth: '100%'`, maxFontSizeMultiplier 1.2.
- **ViewAllPill:** minHeight 32, padX 12, label `label` 13 in `text` colour, `numberOfLines={1}`, `flexShrink: 0`, `hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}`, maxFontSizeMultiplier 1.2. The default label is "View all". It is the only control allowed in a card header besides a chevron IconButton.
- **CardHeader:** a row with gap 12. The left column has `flex: 1, minWidth: 0`, with an optional overline (`label` muted, 1 line) and then the title (`heading`, 1 line). The right wrapper has `flexShrink: 0` and holds at most 1 control.

### 7.6 Chip and ChipRow

**Chip:**

- minHeight 34, padX 14, radius pill, gap 6. Label 13: `label` Medium when unselected, `labelStrong` when selected. `numberOfLines={1}`, maxFontSizeMultiplier 1.2. Optional icon of 14.
- New optional `count?: number`: a `micro` badge, minWidth 18, height 18. It is `rgba(22,22,21,0.08)` with ink text when unselected and `rgba(255,255,255,0.22)` with white text when selected. It is hidden when undefined; 0 is shown as "0".
- Unselected: iOS `glass` + 1 px `glassEdge`; Android `glassAndroid` + 1 px `glassLine`. Selected: `charcoal` fill with white text.
- `hitSlop={{ top: 7, bottom: 7 }}`, `accessibilityRole="button"`, `accessibilityState={{ selected }}`. It fires `haptic.select()` when pressed while unselected.

**ChipRow (NEW):** a horizontal ScrollView with `showsHorizontalScrollIndicator={false}`, `keyboardShouldPersistTaps="handled"` and `contentContainerStyle={{ gap: 8, paddingHorizontal: bleedPad }}`, plus `style={{ marginHorizontal: -bleedPad }}`, where `bleedPad` is the gutter (`bleed="screen"`, the default) or `cardPad` (`bleed="card"`). The last chip may be clipped at the edge, which is the intended peek. With `wrap` set, it renders a `View` with `flexDirection: 'row', flexWrap: 'wrap', gap: 8` instead. Use `wrap` only in forms and filter sheets.

### 7.7 Segmented (rebuilt)

- **Automatic fallback.** When `options.length > 4` or any `label.length > 10`, Segmented renders as a `ChipRow` of `Chip`s (with `count` taken from `badge`). The API doesn't change, so `inbox.tsx`'s queue selector becomes scrolling chips with no call-site change.
- **Track:** no ScrollView. minHeight 40, radius pill, padding 4, fill `palette.track`, `flexDirection: 'row'`.
- **Thumb:** an absolutely positioned animated View, `height: 32`, width = (trackWidth − 8)/n, radius pill, `surface` fill. iOS shadow is opacity 0.08, radius 6, y 2; Android elevation 1. `translateX` moves with the spring `motion.layout`. The track width comes from `onLayout`, and the thumb is hidden until it is measured.
- **Segments:** `flex: 1, flexBasis: 0`, minHeight 32, padX 8, row with gap 6, centred. Each is a `Pressable` with `hitSlop={{ top: 4, bottom: 4 }}`, `accessibilityRole="tab"` and `accessibilityState={{ selected }}`.
- **Label:** 13, `numberOfLines={1}`, `adjustsFontSizeToFit`, `minimumFontScale={0.85}`, maxFontSizeMultiplier 1.2. Selected is `labelStrong` in `ink`. Unselected is Medium 13 (`label` with `fontFamily: font.medium`) in `textMuted`. The second cue (weight and colour) is required because the white thumb on the track alone is only 1.3:1.
- **Badge:** `micro`, minWidth 16, height 16, radius 8, `charcoal` fill with white text.
- Fires `haptic.select()` on change.
- **Copy rule:** segment labels are 10 characters or fewer, and 4 segments at most. Use short local labels (see section 11). Don't edit shared label maps such as `KIND_LABEL` or `HALF_LABEL`, which other screens use.

### 7.8 StatusPill and DeltaChip

- **StatusPill:** minHeight 24, padX 10, paddingVertical 3, gap 6, dot 6 in `statusTone[tone].dot`. Label 12/16 SemiBold (`caption` with `fontFamily: font.semibold`) in `statusTone[tone].fg`. `numberOfLines={1}`, `flexShrink: 0`, `alignSelf: 'flex-start'`, maxFontSizeMultiplier 1.2. Background `bg`, 1 px `border`. It always carries a word. A list row has at most 1 pill, in the right column or under the title, never inline after a long title.
- **DeltaChip:** arrow icon 14 with strokeWidth 2.4, gap 2, label `labelStrong`. On light: `successInk` up and `dangerInk` down. On dark: `#8EE58D` and `#FF9C94` (unchanged).

### 7.9 Card, Section, SectionTitle

- **Card:** see section 6. Card reads `useLayout()` to pick `cardPad` or `heroPad`, and `padded={false}` still turns padding off. `onPress` gives a press scale of 0.985. Don't nest a Card inside a Card.
- **Content gap inside a Card:** 12 for surface and muted cards, 16 for primary and ink cards. The caller sets it through `style={{ gap }}`, as today.
- **SectionTitle:** a row with `alignItems: 'flex-end'`, `marginTop: 8` and gap 12. The left column (`flex: 1, minWidth: 0`) has an optional overline (`label` muted, 1 line) and the title (`heading`, 1 line). The right side has at most 1 control (`ViewAllPill`, or a pair of 40 chevron IconButtons for a month switcher).
- **Section (NEW):** `<Section title overline? right?>{children}</Section>` is a `View` with gap 12 holding a SectionTitle and then the children. Use it so a title and its content count as one Screen child: they animate together, and the title-to-content spacing is 12.

### 7.10 StatTile and StatGrid (NEW, `src/ui/stats.tsx`)

```tsx
<StatGrid columns={2}>   {/* clamps to 2 when compact; >2 only if every value ≤ 4 chars */}
  <StatTile label="Days present" value="18" unit="/ 21" caption="2 half day" tone="primary" />
  <StatTile label="Avg / day" value="8h 24m" />
</StatGrid>
```

Kit components: no tab root uses StatTile today (Me › Attendance shows its three month figures as plain text columns).

- **StatGrid:** `flexDirection: 'row', flexWrap: 'wrap', gap: 12`. It clones each tile with `flexGrow: 1` and `flexBasis` set to `'47%'` for 2 columns, `'30%'` for 3 or `'22%'` for 4. The effective columns are `compact ? 2 : columns`, and 2 whenever any value is longer than 4 characters.
- **StatTile:** radius `lg` 20, padding 16, gap 4. The label is `label` muted, 1 line. Then a row with `alignItems: 'baseline'` and gap 4 holding the value (`hero` 32, tabular, `numberOfLines={1}`, `adjustsFontSizeToFit`, `minimumFontScale={0.7}`, `flexShrink: 1`) and the unit (`label` muted, `flexShrink: 0`). The caption is `caption` muted, max 2 lines. An optional `footer` slot holds a 6 dp split bar. `tone` is `'surface'` (glass) or `'primary'` (dark, with onPrimary text tokens). `valueColor` takes an ink token for status (for example, late count uses `warningInk`).

### 7.11 KeyValueList and KeyValueRow (NEW, `src/ui/key-value.tsx`)

Use these for every label/value list; never a fixed-width label column. Feature wrappers such as `vendor/ui.tsx InfoRows` and `inbox/detail.tsx FieldsCard` build on them.

```tsx
<KeyValueList rows={[{ label: 'From', value: 'Mon, 12 Oct 2026' }, { label: 'Days', value: '3', tone: 'muted' }]} hideEmpty />
<KeyValueRow label="Net pay" value="₹48,250.00" strong tabular />
```

- **Row:** paddingVertical 12, with a hairline (`separator`) between rows (none above the first). `KeyValueList` draws these itself; standalone `KeyValueRow`s draw one only when given `divider`. An empty value renders as "—".
- **Inline layout** applies when `!compact` and `value.length <= 24`, or when `compact` and `value.length <= 18`, and there is no `hint` longer than the value. It is a row with gap 12:
  - label: `label` muted, `flex: 0.42`, `numberOfLines={2}`
  - value column: `flex: 0.58, alignItems: 'flex-end'`, with the value in `bodyStrong` right-aligned, `numberOfLines={3}`, and the hint in `caption` muted right-aligned
- **Stacked layout** is used otherwise: the label (`label` muted) is above the value (`bodyStrong`, left-aligned, no line limit) with a gap of 4, and the hint is below it.
- Props: `tone?: 'default' | 'muted' | 'success' | 'warning' | 'danger'`, which maps to `text`, `textMuted` or the `*Ink` tokens. `strong` puts both label and value in `bodyStrong` (for totals). `tabular` sets tabular numbers. `onPress` makes the row a pressable with a chevron, the `pressedTint` background and minHeight 48. `action?: ReactNode` is rendered under the value. `selectable` defaults to `true` when there is no `onPress`.

### 7.12 ListRow, ListCard, IconBadge, GroupedRow

Row anatomy (all values are final):

```
[ left 40 ] 12 [ text column: flex 1, minWidth 0 ] 12 [ right: flexShrink 0, maxWidth '45%', alignItems flex-end, gap 2 ] [ chevron 18 ]
paddingVertical 12 · paddingHorizontal 16 · minHeight 56 (title only) / 64 (title + subtitle) / 72 (avatar 40 + 2 lines: pass size="lg")
```

- Title: `bodyStrong`, `numberOfLines` (default 1). Subtitle: `label` muted, with its own `subtitleLines` prop (default 1; 2 for hint rows). Meta: `caption` muted, 1 line. Every text has `flexShrink: 1`.
- Right: at most 2 elements, meaning one of: value plus meta, one StatusPill, one 40 IconButton, or a chevron.
  - Value: `bodyStrong` with `tabular`, 1 line.
  - Meta: `caption` muted, 1 line.
- Pressed: `pressedTint` background, no scale. The row Pressable has `accessible` and an `accessibilityLabel` built from title, subtitle and value, so the row is one focus stop.
- Separator inset: 16 + 40 + 12 = **68**. Use `separator` colour and `StyleSheet.hairlineWidth`.
- `IconBadge`: default size **40** (was 44), icon 20, circle. Fill is `rgba(255,255,255,0.85)` with a rim (iOS shadow soft). Use a tinted fill only for status or a module's tint in menus.
- `ListCard`: radius 24, paddingVertical 4. The optional title row is `heading` (1 line) plus at most 1 right control, padded 16 horizontal, 12 top and 8 bottom.
- `GroupedRow` (NEW) is for FlashList, where rows can't sit inside a single ListCard:

```tsx
renderItem={({ item, index }) => (
  <GroupedRow tone="surface" hairline first={index === 0} last={index === data.length - 1}><ActivityRow … /></GroupedRow>
)}
```

`GroupedRow` paints the card fill (glass, or `WHITE_CARD` with `tone="surface"`). When `first`, it has top radius 24 and paddingTop 4. When `last`, it has bottom radius 24 and paddingBottom 4. With `hairline`, every row after the first draws the inset hairline (68, `inset`) on top of itself, so no `ItemSeparatorComponent` is needed and section labels in the same list never get a stray separator (People, News, Team, Leave requests). `GroupedSeparator` (glass, for `ItemSeparatorComponent`) paints the same fill with that hairline.

### 7.13 Avatar, AvatarStack, IconAction

- **Avatar sizes:** 40 in rows, 48 in detail headers, 56 in profile cards, 88 on the profile hero. The ring stays. Initials use `labelStrong` scaled (current formula).
- **AvatarStack (NEW):** `<AvatarStack people={[{ name, uri }]} max={5} size={32} />`. Avatars overlap by −8 with a 2 px `canvasTop` ring. A `+N` disc follows (`surfaceMuted` with `micro` ink text). Its accessibilityLabel is "N people".
- **IconAction (NEW):** `<IconAction icon={Phone} label="Call" onPress tone="surface" | "primary" | "onPrimary" size={48} />` is a column with gap 8: a 48 circle holding a 20–22 icon, with a `caption` label below it (12 px, Medium, 1 line, centred, max 10 characters). A row holds at most 4, and the row uses `justifyContent: 'space-around'`. Hide an action when its data is missing; don't disable it.

### 7.14 Inputs (`src/ui/inputs.tsx`, `src/ui/controls.tsx`)

| Part | Spec |
|---|---|
| Field label | `labelStrong` muted, 6 above the field |
| Field box | minHeight **52** (was 56), radius `md` 16, padX 16, gap 8, fill `rgba(255,255,255,0.7)` (inside sheets `surfaceMuted`), 1 px `rgba(22,22,21,0.07)` |
| Focus | 1.5 px `charcoal` border, `surface` fill |
| Error | 1.5 px `dangerInk` border. Below the field: a row with gap 6 holding a `CircleAlert` 14 icon in `dangerInk` and the error text in `caption` `dangerInk` |
| Helper (NEW `hint` prop on TextField, SelectField, DateField, TimeField) | `caption` muted, 6 below the field. It replaces negative-margin hacks such as `marginTop: -6` in `leave/apply.tsx` |
| Input text | 16 Regular `text`, placeholder `textFaint` |
| Multiline | minHeight 112, paddingTop 14, `textAlignVertical: 'top'`; counter `caption` muted right-aligned |
| Select, Date and Time value | `body`, `numberOfLines={1}`, `flex: 1, minWidth: 0` |
| PickerField outer | **remove `flex: 1`** (it is a column child). It flexes only inside `FieldPair` |
| Field spacing | 16 between fields in a group, groups in separate cards |

- **FieldPair (NEW):** `<FieldPair>{<TimeField …/>}{<TimeField …/>}</FieldPair>` is a row with gap 12, each child `flex: 1, minWidth: 0`, and it stacks when `width < 340`. It is only for TimeFields. **DateFields always stack**: a date label such as "Wed, 22 Oct 2026" needs about 186 dp per field, which no phone has side by side.
- **OtpInput:** box `maxWidth: 52`, gap 8, digit 26 px.
- **Keyboard:** screens with inputs use `Screen` (which already sets `keyboardShouldPersistTaps="handled"`). Add `keyboardDismissMode="interactive"` on iOS and `"on-drag"` on Android. With a `footer`, the KAV above keeps the submit button visible.

### 7.15 Sheet and MenuSheet (`src/ui/sheet.tsx`)

**Sheet:**

- Top radius 28, background `#FAFAF9`, 1 px top rim, `maxHeight: 90%`.
- Handle 36×5, radius 3, `rgba(22,22,21,0.14)`, in a 48 dp touch zone (handle area minHeight 24 plus `hitSlop` 12).
- Header: paddingHorizontal 20, gap 2, paddingBottom 12. The title is `heading` (1 line) and the subtitle is `label` muted (max 2 lines).
- Body: paddingHorizontal 20, gap 16, paddingBottom 16.
- Footer: paddingHorizontal 20, paddingTop 12, paddingBottom `insets.bottom + 12`. If there is no footer, the body gets that bottom padding. A footer with 2 buttons uses `ActionRow context="sheet"`.
- **Open:** migrate from RN `Animated` to Reanimated, `translateY` from window height to 0 with `withSpring(0, motion.sheet)`. With Reduce Motion, skip the translate and use the Modal's fade only.
- **Close:** the Modal's native fade, unchanged.
- Show one sheet at a time. To go from a sheet to another sheet or route, close first, then act 280 ms later (MenuSheet does this for you).
- New optional prop `dirty?: boolean`. When true, the backdrop or handle close asks `Alert.alert('Discard changes?', …, [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: onClose }])`.
- A sheet holds at most 6 form fields. Longer forms belong on a pushed screen.

**MenuSheet (NEW):** the overflow menu, opened by a `MoreHorizontal` IconButton.

```tsx
<MenuSheet visible onClose title? subtitle? items={[{ key, label, icon: LucideIcon, onPress, hint?, tone?: 'default' | 'danger' }]} />
```

It renders a `ListCard` of `ListRow`s: IconBadge 40 with a neutral fill, the icon 20 in `primary` (or `dangerInk` with a `danger` tone), and the label in `bodyStrong` (`dangerInk` text with a `danger` tone). Pressing an item calls `onClose()` and then `setTimeout(item.onPress, 280)`. It holds 1 to 7 items, and the destructive item goes last.

### 7.16 Banner (NEW, `src/ui/banner.tsx`)

This is the inline notice; screens use it directly (there are no feature `Notice` wrappers). A screen shows at most one notice at a time.

```tsx
<Banner tone="info" | "success" | "warning" | "danger" title? message? action?>{children?}</Banner>
```

- Layout: radius `sm` 12, padding 12, row with gap 12.
- Background: `infoSoft`, `successSoft`, `warningSoft` or `dangerSoft`.
- Icon 18, strokeWidth 2.2: `Info` in `info`, `CircleCheck` in `success`, `TriangleAlert` in `warning`, `CircleAlert` in `danger`.
- Text column (`flex: 1, minWidth: 0`, gap 4): the title in `labelStrong` (`text` colour; `dangerInk` for danger) and the message in `label` (`text`).
- The action goes below the text and is a `Button size="sm"` (variant `ghost`, or `danger` for danger).
- It is never used as the only feedback for a failed submit. Section 12 covers errors.

### 7.17 EventTimeline (NEW, `src/ui/timeline.tsx`)

This replaces the 3 feature `Timeline` copies (`inbox/detail.tsx`, `reimbursements/timeline.tsx`, `petty-cash/components.tsx HistoryTimeline`), which become wrappers. The kit name differs on purpose so it doesn't collide with those exports.

```tsx
<EventTimeline events={[{ key, label, at?: string, by?: string, detail?: string, note?: string, tone: 'neutral' | 'good' | 'bad' | 'info' | 'wait' }]} />
```

- Rail: a column 16 wide holding an 8 dp dot (bright tone; neutral uses `textFaint`) and a 2 dp connector in `separator` colour.
- Body: paddingBottom 16 except on the last item. The label is `bodyStrong`, in `warningInk` when `wait`. Meta is `caption` muted ("12 Oct, 10:42 · Priya"). Detail is `label`, and the note is `label` muted in quotes.

### 7.18 EmptyState, ErrorState, Skeleton

**EmptyState:**

- `paddingVertical: 40`, paddingHorizontal 24, gap 8, centred.
- Icon badge 64 circle (`glass` + rim) holding a 28 icon in `textMuted`, with marginBottom 8.
- Title: `heading`, centred, 40 characters or fewer.
- Message: `label` muted, centred, `maxWidth: 300`. Write it for 2 lines (about 90 characters). The kit shows up to `messageLines` (default 4) so older, longer copy is never cut mid-sentence.
- Action: at most one, a `Button size="md" variant="accent"`, marginTop 8.

The three things an empty state does: say what the status is, say what will appear here, and give a direct path when one exists.

**ErrorState:** the EmptyState layout with a neutral `CloudOff` or `CircleAlert` icon (no red fill), the title "Couldn't load this", the server's message (max 3 lines) and a "Try again" button (`md`, `accent`).

**Skeleton:**

- Default radius `sm` 12 and fill `rgba(22,22,21,0.07)`.
- Pulse: opacity 0.45 to 0.9 over a 1.4 s cycle (700 ms each way). With Reduce Motion, use a static 0.6.
- Skeletons mirror the final layout's shapes and heights:

| Thing | Skeleton |
|---|---|
| Card | height = the real card's height (clock card 280, stat tile 104, list card rows × 64), radius 24 (hero 28) |
| `SkeletonList` (NEW) `<SkeletonList rows={3} avatar />` | Per row: a 40 circle, then a column of 2 bars (12 h at 60% and 12 h at 40%, radius 6, gap 8). Rows are 64 high (72 with `avatar`), padded 12/16, inside a glass ListCard |

Never render EmptyState or "no records" while the query is loading.

### 7.19 Headers (`src/ui/screen.tsx`)

| Header | Layout |
|---|---|
| `GreetingHeader` (Me, Inbox, More) | paddingHorizontal gutter, paddingTop 8, paddingBottom 12, gap 12. Left column (`flex: 1, minWidth: 0`): overline `label` muted 1 line with DemoChip, then title `title` 26 1 line. Right: **at most 2** IconButtons (40), gap 8, `flexShrink: 0`. No text buttons. The title is the tab's name |
| `BrandHeader` (Home) | paddingHorizontal gutter, height 56. Left slot 48 (Avatar 40 inside a Pressable with hitSlop 4), centred logo 92×34, right slot 48 (bell IconButton 40) |
| `TitleHeader` (pushed) | paddingHorizontal gutter, paddingVertical 8, gap 8. Back IconButton 40 (ChevronLeft 22). Title `heading` centred, 1 line, `flex: 1, minWidth: 0`. Right slot. New optional prop `rightSlots?: 1 \| 2` (default 1): both side slots get `width: rightSlots === 2 ? 88 : 40`, so the title stays centred. More than 2 actions go into a `MoreHorizontal` IconButton and a MenuSheet |

`DemoChip` text uses `micro`.

### 7.20 Tab bar (`src/ui/tab-bar.tsx`)

A frosted capsule with four equal slots. Every slot shows its icon with its name under it (no bare icons); the active one gets a soft brand pill behind its icon that slides over from the previous tab. The two tab layouts build it from `TabBarFrame`, `TabButton` (with `glyph`) and, for staff, `TabFab`. Icons, motion, the badge and the FAB are specified in [docs/NAVBAR-MOTION.md](NAVBAR-MOTION.md).

| Part | Spec |
|---|---|
| Wrap | absolute; `left`/`right` = `width < 360 ? 12 : 16`; `bottom = Math.max(insets.bottom − 4, 10)` |
| Bar | height **64**, radius 32, paddingHorizontal **6**, 1 px `glassEdge`. iOS: `rgba(255,255,255,0.55)` + `BlurView intensity={45} tint="light"`. Android: `rgba(250,250,249,0.96)`. `shadow.float` |
| Slot | `flex: 1, minWidth: 0`, height 56, measured by the bar's inner track. Top-aligned: pill box 32 at +4 (icon 24 centred in it), label at +38 (NAVBAR-MOTION.md §2) |
| Icon | 24, from `src/ui/tab-glyphs.tsx`: `textMuted` outline at 1.8 when idle, filled `primary` with white details at 1.6 when active (NAVBAR-MOTION.md §4) |
| Label | 11/14 Medium (SemiBold when active), 12/15 when `width >= 412`, letterSpacing 0, `primary` when active, `textMuted` otherwise (cross-faded, NAVBAR-MOTION.md §7). `numberOfLines={1}`, `adjustsFontSizeToFit`, `minimumFontScale={0.85}`, `maxFontSizeMultiplier={1}` |
| Active pill | one shared pill behind the icon only: height 32, radius 16, width `clamp(slot − 10, 44, 56)`, fill `primarySoft`; slides between tabs and passes under the FAB (NAVBAR-MOTION.md §6) |
| Fit check | 360: 328 − 12 − 2 = 314, / 4 = 78 dp per slot, 70 dp for the label. 320: 296 − 14 = 282, / 4 = 70 dp, 62 dp for the label. The longest label, "Agreements" (vendor), needs ≈ 61 dp at 11 px, so it fits without shrinking |
| Badge | on the icon: absolute top −6, left 14. minWidth 18, height 18, radius 9, padX 4. Fill `dangerInk`, 2 px border `#FAFAF9`. `micro` white text, maxFontSizeMultiplier 1. Cap "99+", hidden at 0. Staff app: only Inbox has one |
| Motion | See [docs/NAVBAR-MOTION.md](NAVBAR-MOTION.md): one short icon beat on select (≤ 450 ms), a quiet 100 ms fade on deselect, the sliding pill, press squeeze and re-tap nudge, badge zoom/pop, FAB + → ×; Reduce Motion keeps only fades. `haptic.select()` when the tab changes (not on re-tap) |
| A11y | `accessibilityRole="tab"` (the bar is a `tablist`), `accessibilityState={{ selected }}`, `accessibilityLabel = badge ? \`${label}, ${badge} waiting\` : label` |

Labels: Home, Me, Inbox, More (vendor: Home, Bills, Agreements, Profile; until a vendor is approved only Home and Profile show). The tab bar never holds actions.

### 7.21 Amount and Metric (`src/ui/primitives.tsx`)

- Build them as described in 4.3: currency at 60% size and muted, greyed decimals, unit muted, tabular, `adjustsFontSizeToFit` with `minimumFontScale 0.7`.
- `useCountUp` rules (section 13).
- On dark cards, decimals use `onPrimaryFaint` and the unit uses `onPrimaryMuted`. The existing `color` and `mutedColor` props keep working.

### 7.22 Toast (NEW, P2, `src/ui/toast.tsx`)

`toast.show(message: string, tone: 'success' | 'info' | 'danger' = 'success')`, backed by a zustand store. Mount `<ToastHost />` once in `src/app/_layout.tsx`.

- Visual: absolute at top `insets.top + 8`, centred, `maxWidth: width − 32`. Charcoal fill with `shadow.float`, radius pill, padding 16 horizontal and 10 vertical, gap 8.
- Icon 16: `CircleCheck` in `accent` for success, `Info` in white, `CircleAlert` in `#FF9C94` for danger. Text is `labelStrong` white, max 2 lines.
- Motion: enters with opacity and translateY −12 to 0 over 250 ms, exits in 200 ms, auto-hides after 2600 ms, and a tap dismisses it. Call `AccessibilityInfo.announceForAccessibility(message)`.
- Screens may replace an `Alert.alert` with a toast **only** when the alert has exactly one OK-style button and reports a success. Alerts that ask a question or report an error stay as they are.

### 7.23 Charts

No structural change.

- `GrowIn`: scaleY from 0.04 to 1 over **600 ms** (was 720) with `Easing.out(Easing.cubic)`, opacity over 200 ms, delay 120.
- Bars and lines idle at `#C9C9C5` on light and `rgba(255,255,255,0.28)` on dark. The highlighted datum is `ink` or white. Red appears only on a negative series or a delta.
- SVG labels stay at 11 px.

### 7.24 Haptics (NEW, `src/ui/haptics.ts`)

```ts
export const haptic = {
  select: () => void Haptics.selectionAsync().catch(() => {}),
  impact: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};
```

| Event | Haptic |
|---|---|
| Tab, segment, chip or picker value change | `select` |
| Clock in or out committed (button press) | `impact` |
| Clock-in recorded, approve succeeded, request submitted, payslip downloaded | `success` |
| Reject succeeded; submit blocked by validation | `warning` |
| Request failed | `error` |
| Scroll, plain navigation, opening a sheet | none |

At most one haptic per user action.

---

## 8. Action layout rules: how to stop the cramping

| # | Rule |
|---|---|
| **A1** | **One primary per view region.** At most 1 `primary` (charcoal) button visible per screen region, and at most 2 prominent buttons (primary or accent) per screen. |
| **A2** | **Variant depends on the surface.** On light surfaces, the main action is `primary`, the secondary is `accent` (white pill) and the tertiary is `ghost` or `text`. On a dark hero card, the main action is `accent` (white) and the secondary is `onPrimary`. Never put a charcoal button on a charcoal card. |
| **A3** | **Destructive is never the filled main button.** Reject, Withdraw, Delete, Sign out and Not received use `danger` (a white pill with red text). Only the single confirm button inside a reason or confirmation sheet uses `destructive` (filled), and its label states the outcome ("Reject request", never "Yes"). |
| **A4** | **At most 2 labelled buttons side by side, always through `ActionRow`.** Never 3 labelled buttons in a row at any phone width. |
| **A5** | **ActionRow decides row or stack** with the formula in 7.2. In a row, the secondary is on the left and the primary on the right, both `flex: 1` with the same height. Stacked, the primary is on top, both full width, gap 12. |
| **A6** | **Pass children in row order:** secondary first, primary last. ActionRow reverses them when it stacks. |
| **A7** | **3 or more actions** means 1 primary plus at most 1 secondary as buttons. Everything else goes into a `MoreHorizontal` IconButton (40) that opens a `MenuSheet` (1–7 items), or becomes a `text` button on its own line. |
| **A8** | **One button plus one icon is fine.** A `flex: 1` lg Button next to a 52 IconButton, with gap 12, is allowed (ClockCard: Clock in plus locate). |
| **A9** | **Icon-only action rows:** up to 4 `IconAction`s (48 circle with a 12 px label), spread evenly with `space-around`. Use this for call, email, WhatsApp and copy on profiles. |
| **A10** | **Screen header:** at most 2 IconButtons and never a text button. More actions go into the overflow MenuSheet. |
| **A11** | **Card header:** at most 1 control (ViewAllPill, a chevron, or a 2-chevron month switcher counted as one control). |
| **A12** | **List rows never contain labelled buttons.** The right side holds a chevron, one StatusPill, or one 40 IconButton. Approve and Reject live on the detail screen's ActionBar. Exception: a card that *is* a live task (the running-task hero, VisitCard for a visitor standing at reception, petty-cash or expense-claim "did you receive it?" banners) may end with **one** `ActionRow context="card"`, 16 below its content, full card width. |
| **A13** | **Sticky ActionBar** on pushed detail and form screens whose commit action is the reason for the screen (submit, approve or reject, save, download, continue). Never on tab roots, and never stacked over the tab bar. Content `paddingBottom` = bar height + 24 (Screen does this). |
| **A14** | **While working:** the busy button shows its spinner and keeps its width, its siblings are disabled, and the bar stays put. |
| **A15** | **Text links are `Button variant="text"`**, at least 44 high, on their own line. Never a bare `Pressable` with tiny `labelStrong` text. A section's "See all" is a `ViewAllPill` in its header. |
| **A16** | **Button copy:** start with a verb, use sentence case, and keep it to 12 characters or fewer for anything that might pair, and 22 or fewer for single buttons. Destructive confirms name the outcome. Don't use "Yes", "No" or "OK" for decisions. |
| **A17** | **Spacing:** 12 between paired or stacked buttons, and 16 between the last content block and an in-card ActionRow. |
| **A18** | **Confirm only destructive or irreversible actions**, through a sheet (when a reason is needed) or an Alert whose buttons are labelled with the outcome. Routine actions don't get a confirm. |

**Decision table**

| You have… | Do this |
|---|---|
| 1 action | One full-width Button (`lg` in a bar or hero; `md` in a content card) |
| 2 actions with short labels | `ActionRow`, which goes side by side |
| 2 actions with a long label, or text larger than 1.3 | `ActionRow`, which stacks automatically (primary on top) |
| 3 or more actions | 1 primary plus 1 secondary in an `ActionRow`, plus a `MoreHorizontal` IconButton opening a `MenuSheet` |
| Contact actions (call, mail, chat, copy) | Up to 4 `IconAction`s in a row |
| A header needs a 3rd icon | Replace the extra icons with one `MoreHorizontal` and a `MenuSheet` |
| Per-item decisions in a list | Open the detail screen; its `ActionBar` holds Reject and Approve |
| Filters with more than 4 options, or long labels | `ChipRow` (Segmented does this automatically) |

---

## 9. Text-fit rules (row anatomy)

React Native defaults `flexShrink` to 0, so text in a row pushes its neighbours off-screen unless you tell it to shrink.

| # | Rule |
|---|---|
| **T1** | Every `Text` inside a horizontal row has `flexShrink: 1` (or `flex: 1`) and a `numberOfLines`. |
| **T2** | The text column `View` in a row is `flex: 1, minWidth: 0`. |
| **T3** | Trailing elements (amount, age, pill, chevron, icon button) get `flexShrink: 0`. A trailing *text* column also gets `maxWidth: '45%'`. |
| **T4** | No fixed `width` or `height` on anything that contains text. Use `minWidth`/`minHeight`, flex ratios (0.42/0.58) or `KeyValueRow`. |
| **T5** | At most 2 trailing elements in a row. With title + pill + amount, move the pill under the title. |
| **T6** | Never rely on `justifyContent: 'space-between'` alone to separate two texts. One of them gets `flex: 1`. |
| **T7** | Hero figures and amounts use `numberOfLines={1}`, `adjustsFontSizeToFit` and `minimumFontScale={0.7}`, so ₹12,34,567.00 never wraps at 360. |
| **T8** | Groups that may run past one line (legends, metadata pills, hero pills) use `flexWrap: 'wrap'` with `rowGap: 8, columnGap: 8` (legend `columnGap: 16`), or a `ChipRow`. |
| **T9** | A person's name or an amount may be ellipsized only if its full value is in `accessibilityLabel`. |
| **T10** | Decorative absolute layers (rings, glows) get `pointerEvents="none"`, sit inside a parent with `overflow: 'hidden'`, never sit above interactive content, and get `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`. |
| **T11** | Every API array is guarded before `.map`, `.filter` or `.length`: `const rows = Array.isArray(x) ? x : []`. |

---

## 10. Screen templates

### 10.1 Tab root

```tsx
<Screen withTabBar onRefresh={refresh} header={<GreetingHeader overline="…" title="Me" actions={/* ≤ 2 IconButtons */} />}>
  <HeroCard />                     {/* 0–1 dark Card: the state + its one main action (accent) */}
  <Section title="…" right={<ViewAllPill label="See all" … />}>…</Section>
  <ListCard>…</ListCard>           {/* links: one list, not a second grid */}
</Screen>
```

The order is state, then the action, then lists. Keep it short (Home has at most 6 sections, a Me segment 3). Hide a section that has no data instead of showing an empty card. The exception is the tab's main list (Inbox, Me's request and payslip lists), which shows an EmptyState. Each tab root is described in section 0A; don't add sections that repeat another tab.

### 10.2 Detail (pushed)

```tsx
<Screen header={<TitleHeader title="…" right={/* ≤ 2 icons, e.g. Share, privacy eye */} />}
        footer={canAct ? <ActionBar><ActionRow context="bar">{secondary}{primary}</ActionRow></ActionBar> : undefined}>
  <Card tone="primary">  {/* who/what: Avatar 48 + name (bodyStrong 1 line) + overline; StatusPill right; key figure (display/hero); caption */}
  <Card><KeyValueList rows={…} hideEmpty /></Card>
  <Card>{/* note: labelStrong muted label + body text */}</Card>
  <Card><EventTimeline events={…} /></Card>
</Screen>
```

### 10.3 Form (pushed)

```tsx
<Screen header={<TitleHeader title="…" />} footer={<ActionBar note={blocker ?? undefined}><Button variant="primary" title="…" loading={…} disabled={!!blocker} /></ActionBar>}>
  {kinds > 1 ? <Segmented … /> : null}
  <Card style={{ gap: 16 }}>{/* group 1: fields single column */}</Card>
  <Card style={{ gap: 16 }}>{/* group 2 */}</Card>
  {/* live summary card, Banners (warnings), submit error Banner (tone danger) as the LAST content block */}
</Screen>
```

- Single column always. Errors appear inline under fields, never as an `Alert`.
- The submit lives in the ActionBar, never inline at the end of the scroll.
- Explain why a disabled submit is disabled through `ActionBar note`.

### 10.4 List (pushed, FlashList)

```tsx
<Screen scroll={false} header={<TitleHeader title="…" right={…} />}>
  <View style={{ gap: 12, paddingBottom: 12 }}>
    <TextField left={<Search />} … />            {/* optional, 52 h */}
    <ChipRow>…</ChipRow> or <Segmented … />      {/* optional */}
    <Text variant="caption" muted>{count}</Text> {/* optional */}
  </View>
  {loading ? <SkeletonList rows={6} avatar /> : error ? <ErrorState … /> : (
    <FlashList
      data={rows}
      renderItem={({ item, index }) => <GroupedRow first={index === 0} last={index === rows.length - 1}><ListRow … /></GroupedRow>}
      ItemSeparatorComponent={GroupedSeparator}
      ListEmptyComponent={<EmptyState … />}
      contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
      keyboardDismissMode="on-drag"
    />
  )}
</Screen>
```

`Screen scroll={false}` already applies the gutter. Never animate FlashList rows beyond the Screen's own fade.

### 10.5 Unavailable or not enabled

Show an `EmptyState` with a neutral icon, a title stating the fact ("Leave isn't enabled for you"), a message of at most 2 lines saying who can enable it, and at most one way out (`accent md`, for example "Requests waiting in Inbox").

---

## 11. Screen-by-screen directives

What each tab root holds is in section 0A. These notes add the details that apply on top of the general rules.

### Home: `(tabs)/index.tsx`, `features/home/*`

- **Order and contents:** section 0A. Greeting, clock card, Needs you, shortcuts, news, celebrations, each left out when empty. Nothing else is added to Home.
- **BrandHeader:** Avatar 40 (→ My profile), logo 92×34, bell IconButton 40 (→ Inbox) with a dot, never a number.
- **Needs you:** a `ListCard` with "See all" (`ViewAllPill`, → Inbox) in its header, at most 3 rows. Inbox rows use the Inbox's own `itemRow()` words, so a request reads the same in both places. A code row (start or end code to read out) shows the code itself and is not a link.
- **Shortcuts:** 48 dp white discs with the icon over a 13 px label (up to 2 lines, centred); the whole tile is the touch target. Each opens one thing ("Apply leave" opens the form on that kind; "Attendance" opens Me › Attendance).

### ClockCard: `features/attendance/clock-card.tsx` (Home and Me › Attendance)

- Dark hero (radius 28, heroPad), the screen's one dark card.
- **Top to bottom:** the date and status, the figure (a running timer while clocked in, "2h 14m 05s"; the worked time when done, with "Worked today · 9:42 AM – 6:31 PM"), one line of detail, then **at most one message**, picked by priority: a missed clock-out ("Open timesheets"), an error, the remote switch, where you are (or no office), the hourly remote location.
- **Action row:** one `Button lg` (`accent`: "Clock in" / "Clock out") with one round "…" IconButton (52, `onPrimary`) beside it. Everything else ("Add timesheet entry", "Clock in remotely", "Check my location") is in the "…" `MenuSheet`. Done shows the check and "Done for today", and the row keeps its height.
- Clocking in and out both end with a toast. The loading skeleton (`ClockSkeleton`) has the same height as the card.

### Me: `(tabs)/me.tsx`, `features/me/*`

- **Segments:** section 0A. The `Segmented` sits in the header block, not in the scroll, so it never moves. Switching segments swaps one keyed child (it fades in); pull-to-refresh reloads only that segment's queries (`refreshesQuery`).
- **Attendance:** the month `Section` title is the month with 2 chevron IconButtons (40, gap 8) on the right; next is disabled at the current month. The three figures are `heading` tabular over a `caption` label (Present; Late, in `warningInk` when above 0; Avg / day as a duration such as "7h 50m"). Calendar cells are inner/7 (about 42 at 360), a 34 disc with a 7 dp dot; today has a 1.5 `primary` ring. Link rows use `subtitleLines={2}` and a chevron.
- **Day sheet and punch history:** each punch row is 2 lines: the label (`labelStrong`, flex 1) with the time and map link (`flexShrink: 0`), then the note (`caption` muted, max 2 lines). A past day inside the fix window offers "Request a fix", which opens Fix attendance on that day; on a day with a problem it is the main action.
- **Leave:** balance tiles, then the one primary, "Apply leave", then the other kinds as list rows (named only; what each kind means is said once, on the form), then "Leave requests" with a `ViewAllPill` "See all" (→ `/leave/requests`). If HR has set up no leave types, one line says so instead of the button.
- **Pay:** the dark card holds the take-home of the latest payslip and "View payslip"; the list under it starts from the payslip before, so the same one isn't offered twice. The privacy eye in the header hides every amount in the segment.

### Leave apply: `leave/apply.tsx` (form template)

- One form, one kind: `/leave/apply?kind=leave|wfh|comp_off` fixes the kind and the title ("Apply leave", "Work from home", "Claim comp-off"). There is no kind switch.
- Fields in one card: leave type (a sheet listing each type with "N days left"), From, To (always stacked), Full day | 1st half | 2nd half (only for one day of a type that allows it), reason. Don't edit the shared `HALF_LABEL` or `KIND_LABEL` maps.
- At most one notice. The sticky `ActionBar` holds the live summary ("3 days · 4 left after"), what is still missing, and the one primary.

### Inbox: `(tabs)/inbox.tsx`, `features/inbox/*`

- **Layout:** section 0A. One list for every type; the chips are the only filter (All first, each with its count). There is no hero card, no second selector and no per-queue tiles.
- **Rows** (`InboxRequestRow`): Avatar 40, the name (1 line), then the fact that identifies it before the kind word ("27 – 28 Oct · Casual Leave", which may wrap to 2 lines so dates are never cut), then a one-line note. The right column (`flexShrink: 0`) has the figure ("2 days", "₹1,24,500") over the age ("3h ago"). Rows are at least 72 high and never hold buttons.
- **Visitors at reception** are rows like everything else; Let in / Turn away is on the detail screen.

### Inbox detail: `inbox/[kind]/[id].tsx`, `features/inbox/detail.tsx`

- `DecisionScreen` passes `DecisionBar` (`ActionBar` + `ActionRow context="bar"`: `[Reject: danger] [Approve: primary]`) as the `Screen footer`. `rejectLabel` / `approveLabel` rename them where "Approve" doesn't fit the thing (a visitor: "Turn away" / "Let in").
- Approve success calls `haptic.success()` and reject success `haptic.warning()`.
- **RejectSheet:** the footer Button is `destructive` and names the outcome ("Reject request"). It stays disabled until the minimum length is met, with the counter caption.
- The detail never says a thing twice: whatever `DetailHero` shows (the figure, the dates, when it was sent) is not listed again in `FieldsCard` (`Card` + `KeyValueList`). History is `Timeline` (an `EventTimeline` wrapper) inside a Card. Money here has 2 decimals.

### More: `(tabs)/more.tsx`, `features/more/*`

- **Order and contents:** section 0A.
- **ProfileCard** (the only dark card here): Avatar 56 in a 3 dp ring, name `heading` 1 line, title `label` 1 line, chevron.
- **MenuGrid:** tile width floor((W − 2·gutter − 24)/3) ≈ 101 at 360, padding 12, IconBadge 40 (icon 20), title `labelStrong` with `numberOfLines={2}`, and an optional caption of a few plain words when the name alone doesn't say what it is for ("Get back money you spent"). Every tile reserves two label lines (and two caption lines when any tile has a caption), so the grid stays even. The count badge is `charcoal` with white `micro` text. Tile names fit a tile without breaking mid-word ("News", not "Announcements").
- **Account list:** Change password, App lock, then Sign out as a `ListRow` in `dangerInk` with the existing confirm Alert.

### Pay screens: `pay/*`, `features/pay/*`

- **Payslip detail:** the take-home first, then how it adds up (`KeyValueRow` with `tabular`; deductions `tone="danger"`, salary claims paid `tone="success"`, take-home `strong`), then "Save or share PDF" as the one primary in the `ActionBar`.
- **Payslip list:** one Section per financial year ("Financial year 2026-27"), one row per month with the take-home right-aligned (no decimals) and a chevron.
- **Salary advance** (`pay/loans.tsx`), **Salary details** (`pay/salary.tsx`) and **Tax summary** (`pay/fy.tsx`) use the words from section 0B: "Salary advance", "Annual salary (CTC)", "Financial year", "Income tax (TDS)".

### People: `people/*`, `features/people/*`

- **My team** (`team/index.tsx`, `features/team/*`, the More tile): my avatar + "Search your colleagues", the "My department" card, "Off this week" (GET /leaves, dates only), then chips and Manager / Peers / Direct reports lists; "Company" links to the directory and the org chart. Department page (`team/department.tsx`) only for HR / leadership (the head of the company first, then one group per manager). The platform owner and the office TV have no team: their More tile stays "People" (the directory).
- **Directory:** search first (52 high), then department chips as a `ChipRow` (only for roles that see departments), then one list (`GroupedRow` + `ListRow`, Avatar 40, `size="lg"`). The org chart is the first row while nothing is searched.
- **Profile:** avatar, name and role with round Call / Email `IconAction`s; then Contact (mobile first), Work and their team. WhatsApp, Share contact and Show on org chart are in the "•••" menu.

### Tasks, petty cash, expense claims, visitors, bounty, support

- Every labelled button pair is an `ActionRow`.
- On the running-task dark card, Pause is `onPrimary` and End is `accent` (`ActionRow context="hero"`).
- "Received" / "Not received" use `[Not received: danger] [Received: primary]` (`accent` when the pair sits on a dark card).
- Bounty `CoinBadge` text is `successInk` on `successSoft`. Coins are spent with "Use coins".
- Petty cash: "Money given" for an advance, "Expense report" for a statement, "Bill number" and "Expense type" on bills. Expense claims: "Project code" and "Project owner".

### Vendor portal: `(vendor)/**`, `features/vendor/*`

- The 4 tabs use the same tab bar, and "Agreements" fits.
- `InfoRows` wraps `KeyValueList`. Notices are the kit `Banner`. `ChoiceButtons` keeps equal widths (2 options; stack when a label is longer than 12 characters).
- **Registration wizard:** Back and Continue go in `footer` as `ActionBar` + `ActionRow [Back: accent] [Continue: primary]`. Save draft stays a header IconButton.
- Bill and agreement detail follow the detail template.

### Auth: `(auth)/*`, `src/auth/*`

- Single column. Fields are 52 high. The primary is lg full width. Links ("Use email instead", "Vendor sign in") use `Button variant="text"`. Content sits in a KAV so the primary stays visible with the keyboard up at 360×640.

---

## 12. States

| State | Rule |
|---|---|
| Loading | Skeletons with the final layout's shapes (7.18). Pull-to-refresh uses the `charcoal` tint. Never EmptyState while loading. When data arrives, content replaces the skeleton in the same Screen slot, so the entrance doesn't replay |
| Empty (list) | `EmptyState`: status, then what will appear, then at most one action. Examples: Inbox "You're all caught up" (no button). Leave requests "No leave requests yet" + "Apply leave". Payslips "Your payslips appear after your first payroll" (no button). Search "No one matches "q"" + "Clear search" |
| Empty (Home or dashboard section) | Hide the section |
| Error (screen or section) | `ErrorState` with the server message and "Try again". In a card, put it inside the Card. Never a red-filled card |
| Error (submit) | A danger `Banner` as the last content block, `haptic.error()`, and the ActionBar stays. Field errors appear inline under the field |
| Disabled feature | Section 10.5 |
| Disabled control | Opacity 0.4, plus a reason given in the ActionBar note or a helper line |
| Data guards | Rule T11. Use `Number.isFinite` before formatting numbers and `?? ''` on strings from the API |

---

## 13. Motion

| What | Spec |
|---|---|
| Screen entrance (`Reveal` / Screen stagger) | A custom `entering` worklet: opacity 0→1 over **240 ms** with `Easing.out(Easing.quad)`, and translateY **12→0** over **320 ms** with `Easing.out(Easing.cubic)`. Stagger is **40 ms** per child, index capped at **5**, so the last child starts at 200 ms or earlier and the screen settles within 520 ms. It runs on mount only (tabs stay mounted, so no replay on refocus). It replaces `FadeInDown`, whose 25 px travel is too far |
| Press | Press-in `withTiming(scaleTo, { duration: 100, easing: Easing.out(Easing.quad) })`. Release `withSpring(1, motion.snap)`. Scale: buttons and pills 0.97, icon buttons 0.92, cards 0.985. List rows use a tint and no scale |
| Tab bar | Specified in [docs/NAVBAR-MOTION.md](NAVBAR-MOTION.md): the pill slides with `motion.layout` (stretching while it travels), icons and labels cross-fade 160 ms in / 100 ms out, each icon plays one beat on select; slots never change width |
| Segmented thumb | `withSpring(x, motion.layout)`, with the label colour switching instantly |
| Sheet | Open: `withSpring(0, motion.sheet)`. Close: native Modal fade. Backdrop fades with the Modal |
| Expand or collapse, list insert or remove | `LinearTransition.springify().stiffness(247).damping(30).mass(1)` |
| Count-up (`useCountUp`) | **700 ms** ease-out cubic from 0, on first mount only. On later changes, animate from the previous value over **400 ms** only if the change is 5% or more and the target is 10 or more; otherwise jump. Always tabular. Reduce Motion means jump |
| Chart grow | 600 ms ease-out cubic, delay 120 |
| Skeleton | 1.4 s opacity pulse; static with Reduce Motion |
| Toast | in 250 ms, out 200 ms |
| Limits | No UI transition over 500 ms except count-up. Animate only transform and opacity. Linear easing only for progress |
| Reduce Motion | Reanimated 4 defaults every `withTiming`, `withSpring` and layout animation to `ReduceMotion.System` (they jump to the end), which is acceptable. JS-driven or RN `Animated` motion must check `useReducedMotion()` from `react-native-reanimated`: `useCountUp` jumps, `Skeleton` stays static, `Sheet` skips the translate. Don't animate blur |
| Purity | Any timer or clock logic reads time in effects or event handlers, never during render (`useNow()` / `useTodayIst()`) |

---

## 14. Accessibility

- **Targets:** at least 48×48 dp effective, using hitSlop = (48 − visual)/2. Neighbours keep at least 8 dp between them, and adjacent hit areas never overlap. RN's touch area can't extend past the parent's bounds, so the parent needs that much room.
- **Labels:** every icon-only control has `accessibilityLabel` and `accessibilityRole="button"`. Tabs and segments use `role="tab"` with `accessibilityState={{ selected }}`. Chips, switches and toggles use `accessibilityState` (`selected` or `checked`). Buttons use `accessibilityState={{ disabled, busy }}`. Headers use `accessibilityRole="header"` on the screen title.
- **Rows** are one focus stop: `accessible` on the Pressable, and an `accessibilityLabel` that joins the title, subtitle and value.
- **Contrast:** text must reach 4.5:1 below 24 px (3:1 for 24 px and larger). Icons, state indicators and borders that carry meaning must reach 3:1. Use the inks from section 3. `textFaint` is never used for meaningful text below 24 px.
- **Font scaling:** `allowFontScaling` stays on. The caps in 4.1 apply. Containers with text use `minHeight`, so they grow instead of clipping. At font scale 1.3, layouts change shape (`compact` becomes true, ActionRows stack) rather than overflowing.
- **Colour** is never the only cue (WCAG 1.4.1).
- **Reduce Motion:** see section 13.

---

## 15. Kit change list (ordered; owned by the kit agent)

All new components are exported from `src/ui/index.ts`. Kit names avoid collisions with feature exports: features already export `Timeline`, `RejectSheet`, `ReceiptButton`, `Meter` and `OtpConfirmSheet`.

Status (19 Oct 2026): K1–K17 are all implemented. See §7.0 for the API as built. TimeField pairs (the Fix attendance form, `features/attendance/timesheet-sheet.tsx`) use `FieldPair`. Since then the tab bar moved to four equal slots (7.20) for Home · Me · Inbox · More.

| # | Pri | File | Change |
|---|---|---|---|
| K1 | P0 | `src/theme/tokens.ts` | Section 3 values: palette inks and new neutrals, radius scale, `layout`, `type` (caption 12/16, `micro`, display/hero/title retune), `shadow.float` elevation 8, `statusTone` inks plus `dot`, the `motion` presets (legacy names retuned) |
| K2 | P0 | `src/ui/layout.ts` (new) | `useLayout()` (2.1) |
| K3 | P0 | `src/ui/text.tsx` | Per-variant `maxFontSizeMultiplier` defaults, Android `includeFontPadding: false`, tabular for display/hero, `tabular` prop, `micro` variant |
| K4 | P0 | `src/ui/primitives.tsx` Button | minHeight sizes plus `sm`; variants `onPrimary`, `destructive`, `text`; `ink` becomes the primary look; `danger` restyled as a white pill; **icon recolouring through `cloneElement`**; label `numberOfLines 1` and flexShrink; loading keeps the width |
| K5 | P0 | `src/ui/actions.tsx` (new) | `ActionRow`, `ActionBar` |
| K6 | P0 | `src/ui/screen.tsx` | `footer` prop (pinned, measured, KAV); gutter and stack gap from `useLayout`; `TAB_BAR_SPACE = 88` with bottom = `TAB_BAR_SPACE + Math.max(insets.bottom − 4, 10)`; SectionTitle `minWidth: 0` and 1-line title; `Section`; `TitleHeader rightSlots`; header paddings from 7.19 |
| K7 | P0 | `src/ui/tab-bar.tsx` | Geometry from 7.20 (four equal slots, icon over label, fading charcoal pill), `dangerInk` `micro` badge, a11y label with the count |
| K8 | P0 | `src/ui/controls.tsx` | Segmented rebuild (7.7) with automatic chips; Chip sizes, `count`, haptic; `ChipRow`; PickerField `flex: 1` removed; `hint` on Select/Date/Time; `FieldPair` |
| K9 | P0 | `src/ui/list.tsx` | ListRow anatomy (7.12: right `flexShrink: 0` and `maxWidth: '45%'`, `subtitleLines`, `size="lg"`, a11y grouping, separator inset 68); IconBadge default 40; `GroupedRow` and `GroupedSeparator` |
| K10 | P0 | `src/ui/primitives.tsx` | Card radius and padding from `useLayout`, Android glass; CardHeader; ViewAllPill (32 + hitSlop); PillButton; IconButton (default 40, computed hitSlop, dot); StatusPill inks and dot; DeltaChip inks; Amount and Metric (4.3) |
| K11 | P1 | `src/ui/inputs.tsx` | Field minHeight 52, radius `md`, error row with icon, `hint`, multiline 112 |
| K12 | P1 | new files | `stats.tsx` (StatTile, StatGrid), `key-value.tsx` (KeyValueList, KeyValueRow), `banner.tsx` (Banner), `timeline.tsx` (EventTimeline), `MenuSheet` (in `sheet.tsx`), `IconAction` and `AvatarStack` (in `primitives.tsx`), `SkeletonList` |
| K13 | P1 | `src/ui/sheet.tsx` | Radius 28, padding 20, footer padding, handle zone 48, Reanimated spring, reduce motion, `dirty` |
| K14 | P1 | `src/ui/primitives.tsx` | EmptyState and ErrorState (7.18); Skeleton default radius and reduce motion |
| K15 | P2 | `src/ui/motion.tsx` | Reveal custom entering (12 dp, 240/320 ms, 40 ms stagger, cap 5); PressableScale timing then snap; `useCountUp` rules and reduced motion; GrowIn 600 ms |
| K16 | P2 | `src/ui/haptics.ts` (new) | `haptic` helper (7.24) |
| K17 | P2 | `src/ui/toast.tsx` (new) + `src/app/_layout.tsx` | `toast`, `ToastHost` |

With K1 to K10 in place, these needed **no** call-site changes: white-on-white icons (K4), tab label truncation (K7), muted text contrast (K1) and status-pill contrast (K1/K10). Section 11 covers the per-screen details.

---

## 16. Screen checklist (run on every screen you touch, before finishing)

**Devices and settings.** Test at least at **360×640 with font scale 1.0**, **360×640 with font scale 1.3** and **412×915 with font scale 1.0** (plus 320 if you can). On an Android emulator: `adb shell wm size 1080x2340 && adb shell wm density 480` gives 360 dp, and `adb shell settings put system font_scale 1.3`. Reset with `wm size reset`, `wm density reset` and `font_scale 1.0`. On iOS: Settings › Accessibility › Display & Text Size › Larger Text.

**Fit (P0)**
- [ ] Nothing scrolls horizontally except ChipRows and charts.
- [ ] No two elements overlap. No label clips at the bottom of a pill or button.
- [ ] No button, chip, tab or segment label is truncated or wrapped.
- [ ] Nothing hides under the tab bar, the ActionBar, the home indicator or the keyboard (focused field and submit both visible).
- [ ] Every row has one `flex: 1, minWidth: 0` text column whose Texts have `numberOfLines`. Trailing items are `flexShrink: 0` and there are at most 2.
- [ ] No fixed `width` or `height` on a text container: `grep -nE "width: [0-9]{2,3}\b|height: [0-9]{2,3}\b" <file>` and check each hit.

**Actions**
- [ ] At most 1 primary (charcoal) per region and at most 2 prominent buttons on the screen. No charcoal button on a dark card.
- [ ] Destructive actions are `danger` (not filled), except the sheet confirm, which is `destructive` and labelled with the outcome.
- [ ] Every labelled button pair is an `ActionRow`: `grep -n "style={{ flex: 1 }}" <file> | grep Button` returns nothing.
- [ ] Header has at most 2 icons, card header at most 1 control, and no labelled buttons inside list rows (except the A12 cases).
- [ ] Commit actions on pushed detail and form screens are in the `ActionBar`.

**Colour and type**
- [ ] No status colour as text on light surfaces: `grep -nE "color=\{palette\.(success|warning|danger|accent|accentDeep|onAccent)\}" <file>`. Each hit must be an icon, dot, fill or text on a dark card.
- [ ] No white text on green or red fills.
- [ ] No text below 11 px. Light weight only at 24 px or more. No `fontWeight`.
- [ ] Hero figures use `adjustsFontSizeToFit`, and amounts, timers and counts are tabular.

**States**
- [ ] Loading shows a skeleton of the final shape, empty shows an EmptyState (or the section hides), error shows an ErrorState with Try again.
- [ ] Every API array is guarded before `.map` (T11).

**Accessibility and motion**
- [ ] Every icon-only control has `accessibilityLabel`, and effective targets are at least 48.
- [ ] With Reduce Motion on, nothing translates or scales, and count-ups jump to the final value.
- [ ] Render stays pure: no `Date.now()`, `new Date()` or `Math.random()` in render.

**Verify**
- [ ] `npx tsc --noEmit` reports 0 errors in your files.
- [ ] `npx eslint <your files>` reports 0 errors.

---

## 17. Out of scope for this pass

These are deliberately excluded. Don't build them now.

- Sticky headers that blur on scroll.
- Drag-to-dismiss sheets and swipe actions on rows.
- Bulk approval or selection mode.
- A fifth tab, or new Home sections ("Who's out today", an hours chart, a team strip). Home stays as section 0A lists it.
- A dark theme.
- Any change to API calls, query keys, gating or route paths.
- New packages or native modules.
- Changes to `src/demo/**`.
