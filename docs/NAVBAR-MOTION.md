# Tab bar: motion and icon spec

Status: implemented, 20 Oct 2026 (DESIGN.md §7.20 and §13 now point here). Two deliberate differences
from the text below: the FAB's press glow is a `boxShadow` layer rather than `shadow*` + `elevation 12`,
because on Android a child with higher elevation is drawn above the gradient instead of under it; and
the badge's zoom-in is the custom worklet on iOS/Android but an equivalent `Keyframe` on web (custom
layout-animation worklets do not run there). The kit gallery (section A) also has an icon grid to
toggle every glyph, badge steps 0 / 3 / 5 / 2 / 120, a "FAB: ×" toggle and a vendor "Approved" toggle.
Review pass (20 Oct 2026): the bar and the glyphs now follow light / dark (colours are read at render time
or through `themedStyles`; see §4.1, §9, §10 and §14), the More grid is a little smaller for optical
balance (§4.5), the tab Pressable has no side padding so a label gets the whole slot, Reduce Motion's × is
the same + turned 45° (static), the pill is released when a focused tab unmounts, and a badge whose tab is
removed is not animated out (`skipExiting`).
It answers the owner's request "work on the navbar properly — animated icons
and all". The work is the bottom bar in `src/ui/tab-bar.tsx` (`TabBarFrame`, `TabButton`, `TabFab`), the
two tab layouts (`src/app/(app)/(tabs)/_layout.tsx` and `src/app/(vendor)/portal/(tabs)/_layout.tsx`), the
kit gallery preview (`src/features/dev/kit-a.tsx`) and one new file, `src/ui/tab-glyphs.tsx`.
This document replaces the "Motion" row of DESIGN.md §7.20 and the "Tab pill" row of §13. Update both
rows to point here when this lands.

Goal: a tab bar that feels as finished as the best iOS and Android apps but stays calm. Each change of
state gets one short, meaningful animation and then the bar is still. Nothing loops and nothing idles.

Hard limits, unchanged from DESIGN.md:
- Expo Go on SDK 57. Use only `react-native-reanimated` 4.5 (`.get()`/`.set()`), `react-native-svg` 15,
  `expo-haptics` through `src/ui/haptics.ts` and the libraries already in the project. Do not add any
  dependency, including Lottie.
- React Compiler is on, so render stays pure. Animation is started from effects and event handlers and runs
  on the UI thread, and no React state changes per frame.
- Colours come from `palette` and `gradient` only. Text is Plus Jakarta Sans through the `font` tokens.
  Never set `fontWeight`.
- The bar works at 320 dp, with large text (tab labels keep `maxFontSizeMultiplier={1}`), and on Android
  (no blur) and iOS.
- Respect Reduce Motion: cross-fades only, no movement and no bounce.
- Keep `accessibilityRole="tab"`, the selected state and the badge count in the label. Keep the public API
  (`TabBarFrame` with `inline`, `TabButton`, `TabFab`). The new props are optional.

---

## 1. What the best apps do, and what DASH takes from them

| Source | Pattern | Taken for DASH |
|---|---|---|
| iOS / SF Symbols (iOS 17+) | Tab icons are outline when idle and the **filled** variant when selected. Symbol effects are *discrete*: **Bounce** plays once when a value changes and returns to rest. **Replace** is a content transition between two symbols, such as play and pause. Wiggle and Rotate came in iOS 18. | Outline to filled is the main state change. Each icon gets one discrete "beat" on selection, then rests. The FAB's + to × is a Replace-style transition. |
| iOS 26 tab bar (Liquid Glass) | A soft capsule sits under the selected item and travels between items. | The sliding brand-tinted pill (§6), with a small stretch while it travels. |
| Material 3 navigation bar | An **active indicator** pill sits behind the icon only, with the label under it. The icon switches from outlined to filled. Every destination keeps its label. M3 Expressive: 64 dp bar, 56 dp-wide indicator, 24 dp icons. | The pill is behind the icon only. Its size is 56 × 32 at most and shrinks on narrow phones. Icons are 24 dp. Labels stay on every tab. |
| Telegram (new bottom bar) | Each tab has its own small icon animation on select. A bubble indicator with a bit of bounce, an icon scale and press-down feedback with a haptic, about 250 ms. | Each icon has its own beat. Press-down scale plus a selection haptic. |
| Instagram / X / most social apps | Selection is shown by filled vs outline. Tapping the active tab again scrolls to the top. | A re-tap "nudge". Scroll to top is a follow-up (§8.3). |
| Airbnb | Brand colour plus a filled icon for the active tab, labels on all tabs, and short pictogram animations (Airbnb created Lottie for this). | Brand fill plus white details, and labels everywhere. Our animations are hand-built in SVG with Reanimated instead of Lottie. |
| Payno (REFERENCE-COMPONENTS item 5) | Frosted capsule, active icon filled in brand, brand label, and a raised round centre FAB with a soft coloured shadow. | Kept as the frame. This spec only adds motion, new icons and the pill. |

The principles that follow from this, and that every number below obeys:
1. **A state change changes shape, not only colour.** Outline becomes filled, labels go Medium → SemiBold
   and the pill appears, so colour is never the only cue (WCAG 1.4.1).
2. **One beat per selection.** It stays under 450 ms, plays once and then the icon rests. It never plays on
   app start or on mount.
3. **Motion explains where you came from.** The pill slides from the old tab to the new one.
4. **Deselecting is quiet.** The icon fades back to outline in 100 ms with no movement.
5. **Reduce Motion gets dissolves.** Fades are kept and everything that moves is dropped.

---

## 2. Anatomy and geometry

The frame does not change: a floating capsule 64 dp high with radius 32, a 1 px rim, `padX` 6, side inset
12 dp below 360 wide and 16 dp otherwise, real blur on iOS and solid `canvasTop` on Android, and `shadow.float`.

```
bar (border 1, padX 6, blur on iOS)
└─ track            NEW: flex 1, row, alignItems center, alignSelf stretch; no padding/border
   ├─ TabIndicator  NEW: absolute, first child → paints under everything
   ├─ TabButton slot (flex 1, height 56)
   │   └─ Pressable (a11y tab)  alignItems center, paddingTop 4
   │       ├─ iconZone  32 high (the pill's box), icon 24×24 centred → icon top = 8
   │       │   ├─ TabGlyph (24×24, animated layers)
   │       │   └─ TabBadge (absolute, top −6, left 14 of the 24 box)
   │       └─ labelBox  marginTop 2, height = lineHeight (14 / 15 at ≥ 412 dp)
   ├─ TabFab slot (64)  ← staff only
   └─ …
```

The track exists so that a slot's measured `onLayout` x and y share the indicator's coordinate space
exactly, with no border or padding offsets.

Slot contents are top-aligned with fixed metrics (no vertical centring maths), so the pill's top is
always the slot's y plus 4:

| Part | Value |
|---|---|
| Slot | `flex: 1, minWidth: 0, height: 56`. Centred in the 62 dp inner height, so it sits 3 dp from the top |
| Pill (indicator) | height **32**, radius 16, width `clamp(slotW − 10, 44, 56)`, centred on the slot, top = slot y + 4 |
| Icon | **24 dp**, drawn on a 24 grid at 1:1, so 1 SVG unit is 1 dp. Icon top = slot y + 8 |
| Label | 11/14 (12/15 at window width ≥ 412). Medium in muted ink, SemiBold in brand when active. `numberOfLines 1`, `adjustsFontSizeToFit`, `minimumFontScale 0.85`, `maxFontSizeMultiplier 1`. Label top = slot y + 38 |
| Content height | 4 + 32 + 2 + 15 = 53 ≤ 56 |

Slot width and pill width:

| Window | Staff (4 tabs + 64 FAB) | Pill | Vendor (4 tabs) | Pill |
|---|---|---|---|---|
| 320 | (296 − 2 − 12 − 64) / 4 = **54.5** | 44.5 | 282 / 4 = 70.5 | 56 |
| 360 | (328 − 14 − 64) / 4 = 62.5 | 52.5 | 78.5 | 56 |
| 412 | (380 − 14 − 64) / 4 = 75.5 | 56 | 91.5 | 56 |

The vendor bar before approval has 2 tabs, so slots are 141 dp and the pill is 56. "Agreements" at 11 px
is about 61 dp in Medium and about 63 dp in SemiBold, so it fits a 70.5 dp slot without shrinking.

Touch target: the whole slot (≥ 54.5 × 56) is the Pressable, which clears the 48 dp minimum.

---

## 3. Motion constants (all derived from `motion` in tokens.ts)

Put these at the top of `tab-bar.tsx` and `tab-glyphs.tsx` as plain numbers or objects, because worklets
copy what they capture. Add no new tokens.

| Name | Value | Token | Used for |
|---|---|---|---|
| `SLIDE` | spring `{ stiffness 247, damping 30, mass 1 }` | `motion.layout` | pill travel, stretch release |
| `SNAP` | spring `{ 439, 42, 1 }` (critically damped, ≈ 230 ms visible) | `motion.snap` | press release, FAB turn, tilt and swing return |
| `POP` | spring `{ 158, 20, 1 }` (ζ ≈ 0.8, about 1.6 % overshoot) | `motion.celebrate` | the settle after a pop (head, roof, badge, nudge) |
| `IN_MS` | 160 | `motion.fast` | outline → filled cross-fade, label fade-in, pill fade-in |
| `OUT_MS` | 100 | `motion.instant` | deselect fade, press-in, stretch-in |
| `STAGGER` | 40 | `motion.stagger` | More tiles |
| `BEAT_MAX` | 450 | `motion.slow` | ceiling for every icon beat; also the FAB ring pulse |
| `GLOW_OUT_MS` | 240 | `motion.base` | FAB glow release |

Easings, inside worklets: `Easing.out(Easing.quad)` (OUT_QUAD), `Easing.out(Easing.cubic)` (OUT_CUBIC),
`Easing.in(Easing.quad)` (IN_QUAD), `Easing.inOut(Easing.quad)` (INOUT_QUAD), and `Easing.linear` only
for the pen and line drawing.

How a "pop" is built: a spring with these tokens barely overshoots (`celebrate` is about 1.6 %), so the
pop comes from a short **timing overshoot followed by a spring back**:
`withSequence(withTiming(peak, { duration: 110–120, easing: OUT_QUAD }), withSpring(rest, POP))`.
This is the house style for every pop below.

---

## 4. The icon set (`src/ui/tab-glyphs.tsx`)

### 4.1 Drawing rules
- viewBox `0 0 24 24`, rendered at 24 × 24 dp. The live area is 2 to 22 (stroke included).
- Outline state: `stroke={palette.textMuted}`, `strokeWidth={1.8}`, `fill="none"`, round caps, round joins.
- Active state (duotone): the silhouette is filled with `palette.primaryText` **and** stroked with it at
  1.8, so the filled shape matches the outline's outer edge exactly. Details are drawn on top at **1.6**.
  White on a dark fill looks heavier than it is, so 1.6 keeps the counters open.
- Light / dark: `primaryText` is the brand itself in light mode and the lifted coral (`#FF9064`) in dark
  mode, where the brand fill would sit at 2.4:1 on the dark pill. Details are `onPrimary` (white) in light
  mode and `primarySoft` (the pill's own tint, a knock-out) in dark mode, because white on the coral is
  only 2.3:1 (the knock-out is 5.6:1). Colours are read in render (cached per `themeVersion()`), never in
  module-level constants, because the tokens are live.
- A part that animates in the active state has its outline copy in the **same moving group**. That way the
  cross-fade never leaves a muted "ghost" behind a moving brand part.
- Never animate SVG `fill`, `stroke` or transform props. Colour changes are opacity cross-fades of stacked
  layers. Movement is `transform` on the `Animated.View` that holds a layer (`transformOrigin` is in dp,
  so it equals the SVG coordinates). The only SVG prop that is animated is `strokeDashoffset`, through
  `useAnimatedProps` on `Animated.createAnimatedComponent(Path)`.

Draw-on rule (no stray cap dots): for an open path of length `L`, set
`strokeDasharray={[L, L + 2]}` and `strokeDashoffset = (L + 1) * (1 − d)`, with `d` going 0 → 1.
At d = 0 the path is fully hidden, cap included, and at d = 1 it is fully drawn.

### 4.2 Home (staff and vendor)

```
outline (muted, 1.8)
  body   M5 8.6 L12 3 L19 8.6 V18 A2.5 2.5 0 0 1 16.5 20.5 H7.5 A2.5 2.5 0 0 1 5 18 Z
  roof   M2.75 10.4 L12 3 L21.25 10.4
  door   M9.75 20.5 V16.25 A2.25 2.25 0 0 1 14.25 16.25 V20.5
active
  body   same path, fill primary + stroke primary 1.8
  roof   same path, stroke primary 1.8
  door   M9.75 19.7 V16.25 A2.25 2.25 0 0 1 14.25 16.25 V19.7 Z   fill onPrimary, no stroke
```
The roof eaves run along the body's top edges (both slopes are 0.8), so at rest roof and body read as one
house. When the roof hops, the body's ridge shows for a moment.

Layers, bottom to top:
1. static outline: body and door
2. static active: body
3. **roof group**, which moves: outline roof and active roof
4. **door**, which grows (active only), `transformOrigin [12, 19.7]`

### 4.3 Me (staff) and Profile (vendor), the same glyph

```
outline
  head   circle cx 12  cy 7.5  r 3.7
  bust   M5 20.5 C4.4 20.5 4.1 20 4.2 19.4 C4.9 16.2 8.1 14 12 14 C15.9 14 19.1 16.2 19.8 19.4 C19.9 20 19.6 20.5 19 20.5 Z
active
  head   same circle, fill + stroke primary
  bust   same path, fill + stroke primary
  collar M10.2 14.9 L12 16.9 L13.8 14.9           stroke onPrimary 1.6
draw-on halves (active, stroke primary 1.8, no fill), both start at the top centre
  left   M12 14 C8.1 14 4.9 16.2 4.2 19.4 C4.1 20 4.4 20.5 5 20.5 H12     L = 18.9
  right  M12 14 C15.9 14 19.1 16.2 19.8 19.4 C19.9 20 19.6 20.5 19 20.5 H12  L = 18.9
```
Head and bust are 1 dp apart (head stroke bottom 12.1, bust stroke top 13.1). That gap survives the head
pop: at 1.16× the head's bottom is at 12.84.

Layers: **head group** (moves, origin [12, 7.5]: outline and active head), bust outline, bust fill
(opacity = on × fill), the shoulder draw (both halves in one Svg), and the collar (opacity = on × collar).

### 4.4 Inbox (staff)

```
outline
  shell  M5.39 5.83 A2 2 0 0 1 7.28 4.5 H16.72 A2 2 0 0 1 18.61 5.83 L21 12.5 V18 A2.5 2.5 0 0 1 18.5 20.5 H5.5 A2.5 2.5 0 0 1 3 18 V12.5 Z
  rim    M3 12.5 H7.7 L9.3 15.5 H14.7 L16.3 12.5 H21
active
  shell  same path, fill + stroke primary
  rim    M4.6 12.5 H7.7 L9.3 15.5 H14.7 L16.3 12.5 H19.4        stroke onPrimary 1.6 (inset so no white cap reaches the edge)
  letter rect x 8.6  y 6.6  w 6.8  h 4.2  rx 1.2                 fill onPrimary
```
The top fillets are true tangent arcs between the slanted sides and the top edge. The letter exists only in
the active state ("something arrived"). It has 1.2 dp of clearance from the shell top and 0.9 dp from the
rim.

Layers: one **tray group** (it tilts, origin [12, 20.5]) holding the outline (shell and rim), the active
layer (shell fill and white rim) and the **letter** (it drops: translateY and opacity).

### 4.5 More (staff)

Four rounded squares, `rect` 6.6 × 6.6 with rx 1.9 at (3.5, 3.5), (13.9, 3.5), (13.9, 13.9) and (3.5, 13.9).
Draw them as **plain Views**, which is cheaper than SVG and pixel-identical. Each tile is an 8.4 × 8.4 box
at left/top 2.6 or 13, with `borderRadius 2.8`, so the grid spans 2.6–21.4 with 2 dp gaps. (The first
draft used 8.8 boxes spanning 2.3–21.7; four solid squares then read clearly heavier and larger than the
other glyphs, so the grid sits a little inside the live area.)
- outline tile: `borderWidth 1.8`, `borderColor textMuted`
- active tile: `backgroundColor primaryText`

The tiles are numbered **clockwise**: 0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left. A **grid
group** (24 × 24, origin at the centre) holds them and rotates.

### 4.6 Bills (vendor)

```
outline
  paper  M5 21 V5 A2 2 0 0 1 7 3 H17 A2 2 0 0 1 19 5 V21 L16.67 19.5 L14.33 21 L12 19.5 L9.67 21 L7.33 19.5 Z
  lines  M8.5 7.5 H15.5   M8.5 11 H15.5   M8.5 14.5 H12.5
active
  paper  same path, fill + stroke primary
  lines  the same three as separate paths, stroke onPrimary 1.6, draw-on   L = 7, 7, 4
```
Layers: one **receipt group** (it swings, origin [12, 3], the top centre) holding the outline (paper and
lines) and the active layer (paper fill plus the three animated line paths).

### 4.7 Agreements (vendor)

```
outline
  page   M17.5 12.5 V5.5 A2.5 2.5 0 0 0 15 3 H7 A2.5 2.5 0 0 0 4.5 5.5 V18.5 A2.5 2.5 0 0 0 7 21 H13.5
  lines  M8 7.5 H14   M8 10.5 H11.5
  sign   M7.4 15.2 C8.2 13.2 9.2 13.2 9.4 14.6 C9.6 16 10.6 16 11.2 14.8 C11.5 14.2 12 14.1 12.6 14.4      L = 8.0
  pen    M13 14.2 L15.44 14.59 L18.69 17.84 A1.45 1.45 0 0 1 18.69 19.89 A1.45 1.45 0 0 1 16.64 19.89 L13.39 16.64 Z
  band   M15.44 14.59 L13.39 16.64
active
  page   M7 3 H15 A2.5 2.5 0 0 1 17.5 5.5 V18.5 A2.5 2.5 0 0 1 15 21 H7 A2.5 2.5 0 0 1 4.5 18.5 V5.5 A2.5 2.5 0 0 1 7 3 Z   fill + stroke primary
  lines  same, stroke onPrimary 1.6
  sign   same, stroke onPrimary 1.6, draw-on
  pen    halo: pen path, stroke onPrimary 3.4, no fill (drawn first)
         body: pen path, fill + stroke primary 1.8
  band   stroke onPrimary 1.4
```
The pen lies across the page's bottom-right corner with its nib at (13, 14.2), where the signature ends.
The outline page is open there, with at least 1 dp of clear space around the pen. In the active state, the
white halo cuts a 0.8 dp gap between the brand pen and the brand page. Outside the page the halo
disappears into the bar.

Layers: static outline (page, lines and signature), static active (page fill and white lines), the
signature draw-on, and a **pen group** that moves (translate) holding the pen outline and the pen active
layer.

Every glyph was checked at 24 dp and at 5× (outline on white, active on `primarySoft`). All seven read
clearly, and none touch or clip.

---

## 5. Icon beats (select), deselect and the re-tap nudge

`on` is owned by `TabButton`: `useSharedValue(isFocused ? 1 : 0)`. On select it runs
`withTiming(1, { duration: IN_MS, easing: OUT_CUBIC })` and on deselect
`withTiming(0, { duration: OUT_MS, easing: OUT_QUAD })`, both with `reduceMotion: ReduceMotion.Never`.
`on` is passed to the glyph and drives every outline-to-active cross-fade
(`outFade = { opacity: 1 − on }`, `inFade = { opacity: on }`).

Each glyph owns the shared values for its parts. Their **rest values are the final active pose** (scale 1,
offset 0, `d` = 1), so the reduced-motion path and any frame after the beat are already correct. `play()`
first sets the start values, then animates to rest.

Times are in ms from the tap release. "→" means the value is animated to.

### Home: the roof hops and the door fills up
| Part | From | Animation | Ends |
|---|---|---|---|
| roof translateY | 0 | `withSequence(withTiming(−2, {110, OUT_QUAD}), withSpring(0, POP))` | ≈ 390 |
| door scaleY (origin 12, 19.7) | 0 | `withDelay(90, withTiming(1, {220, OUT_CUBIC}))` | 310 |

The door grows up from the threshold like a light switching on.

### Me / Profile: the head pops and the shoulders draw on
| Part | From | Animation | Ends |
|---|---|---|---|
| head scale (origin 12, 7.5) | 1 | `withSequence(withTiming(1.16, {120, OUT_QUAD}), withSpring(1, POP))` | ≈ 400 |
| shoulders `d` (both halves) | 0 | `withDelay(40, withTiming(1, {240, OUT_CUBIC}))` | 280 |
| bust `fill` | 0 | `withDelay(160, withTiming(1, {160, OUT_QUAD}))` | 320 |
| collar opacity | 0 | `withDelay(240, withTiming(1, {120, OUT_QUAD}))` | 360 |

The brand line runs from the neck down both shoulders, the body floods in, and the collar appears last.

### Inbox: a letter drops in and the tray tilts as it lands
| Part | From | Animation | Ends |
|---|---|---|---|
| letter translateY | −6 | `withTiming(0, {150, IN_QUAD})` (falls) | 150 |
| letter opacity | 0 | `withTiming(1, {90, OUT_QUAD})` | 90 |
| tray rotate (origin 12, 20.5) | 0° | `withDelay(150, withSequence(withTiming(−6, {70, OUT_QUAD}), withSpring(0, SNAP)))` | ≈ 450 |

The letter is white, so while it is above the tray it is almost invisible against the bar. It appears to
materialise as it enters the brand shell, and the tilt answers its landing.

### More: the tiles pop in clockwise while the grid turns a quarter
| Part | From | Animation | Ends |
|---|---|---|---|
| grid rotate (centre) | −90° | `withSpring(0, SLIDE)` | ≈ 400 |
| tile i scale (own centre) | 0.6 | `withDelay(i × STAGGER, withSpring(1, POP))` | ≈ 420 |
| tile i fill opacity | 0 | `withDelay(i × STAGGER, withTiming(1, {120, OUT_QUAD}))` | 240 |

A 2 × 2 grid looks the same at −90°, so the jump to the start pose is invisible. The tiles fill in the
same clockwise order the grid turns. The outline tiles fade with `on`, as usual.

### Bills: the receipt swings and prints
| Part | From | Animation | Ends |
|---|---|---|---|
| receipt rotate (origin 12, 3) | 0° | `withSequence(withTiming(−7, {80, OUT_QUAD}), withTiming(5, {100, INOUT_QUAD}), withTiming(−2.5, {90, INOUT_QUAD}), withSpring(0, SNAP))` | ≈ 420 |
| line i `d` (i = 0, 1, 2) | 0 | `withDelay(60 + i × 40, withTiming(1, {160, OUT_CUBIC}))` | 300 |

The zig-zag edge swings the most because the receipt hangs from its top.

### Agreements: the pen signs
One timeline, `t`, runs from 0 to 1 with `withTiming(1, { duration: 380, easing: Easing.linear })`, where
`T0 = 120 / 380`.
- **Pen offset** (dx, dy in dp, relative to rest), by `interpolate(t, …, Extrapolation.CLAMP)`. Over
  [0, T0] the pen slides back to the start of the signature. Over [T0, 1] it writes along the signature.
  The samples sit at equal arc-length steps, so linear interpolation gives a steady pen speed:

| t | 0 | T0 | T0 + 0.125·(1−T0) | +0.25 | +0.375 | +0.5 | +0.625 | +0.75 | +0.875 | 1 |
|---|---|---|---|---|---|---|---|---|---|---|
| dx | 0 | −5.6 | −5.15 | −4.44 | −3.71 | −3.47 | −2.74 | −1.96 | −1.36 | 0 |
| dy | 0 | 1.0 | 0.11 | −0.56 | −0.05 | 0.91 | 1.47 | 0.89 | 0.12 | 0 |

- **Signature** `d = interpolate(t, [T0, 1], [0, 1], CLAMP)`, so the ink follows the nib exactly.
- The muted signature fades out with `on` while the active one is still hidden, so the signature reads as
  being written fresh.

### Deselect (every glyph)
`on` → 0 in 100 ms (OUT_QUAD), with no movement. Any part still moving goes to rest with
`withTiming(rest, { duration: OUT_MS, easing: OUT_QUAD })`. That covers roof, head, tilt, swing, grid
rotation and the pen (`t` → 1). Values that only show in the active state (door, fill, collar, letter,
tiles and `d`) are `.set(rest)` straight away. Deselect never bounces.

### Re-tap on the active tab: the nudge
In `TabButton.onPress`, when `isFocused` is already true:
- `iconZone` scale: `withSequence(withTiming(0.86, {90, OUT_QUAD}), withSpring(1, POP))`.
- Pill: `ind.press` gets the same sequence to 0.92, so the pill and the icon squeeze together.
- No haptic, because nothing changed (haptics.ts: `select` is for a value change).

The glyph's own beat does **not** replay on a re-tap.

### Triggering rules
- A beat plays only when `isFocused` changes from false to true after mount. Use a `prev` ref compared
  inside the effect, which is also safe under StrictMode's double effects. It never plays on first mount,
  on app start, when another tab is pre-selected, or when a cached route is restored.
- A rapid re-select during a beat restarts the beat from its start values (`.set()` replaces any running
  animation).
- Glyph pattern:

```tsx
function useGlyphBeat(focused: boolean, reduced: boolean, play: () => void, settle: () => void) {
  const prev = useRef(focused);
  useEffect(() => {
    if (prev.current === focused) return;
    prev.current = focused;
    if (reduced) return; // TabButton's `on` cross-fade is the whole transition
    if (focused) play();
    else settle();
  }, [focused, reduced, play, settle]);
}
```

---

## 6. Active indicator: the sliding pill

### 6.1 Mechanism
`TabBarFrame` owns one indicator and shares it through a React context (`TabIndicatorContext`) with
shared values that never cause a re-render:

```ts
type Indicator = {
  x: SharedValue<number>;       // pill centre (track coords)
  y: SharedValue<number>;       // pill top
  w: SharedValue<number>;       // pill base width (changes only on layout)
  stretch: SharedValue<number>; // extra width while travelling (dp)
  press: SharedValue<number>;   // 1 at rest; < 1 while the focused tab is pressed / nudged
  shown: SharedValue<number>;   // opacity
  owner: SharedValue<string>;   // useId() of the focused TabButton, '' when none
};
```

- Each `TabButton` measures its outer slot View with `onLayout` (x, y, width relative to the track) into
  its own shared value. It never uses state.
- **Placing** (the focused button, in its focus effect, or in `onLayout` while focused):
  `cx = x + w/2`, `ind.w.set(clamp(w − 10, 44, 56))`, `ind.y.set(y + 4)`, `ind.owner.set(id)`.
  - If the pill is already shown, it **slides**: `ind.x.set(withSpring(cx, SLIDE))` and
    `ind.stretch.set(withSequence(withTiming(Math.min(0.15 × |cx − x₀|, 12), {OUT_MS, OUT_QUAD}), withSpring(0, SLIDE)))`.
  - If it is not shown (first layout or after hiding), it is placed without animation:
    `ind.x.set(cx)`, then `ind.shown.set(withTiming(1, {IN_MS}))`.
  - A relayout while focused (rotation, or the vendor being approved and gaining tabs) reuses the slide
    path, so the pill glides to the new slot.
- **Releasing**, in the effect that runs when a button loses focus: if `ind.owner.get() === id`, then
  `ind.shown.set(withTiming(0, {OUT_MS}))` and `owner` is cleared. Effects of the old and the new tab can
  run in either order. If the new one runs first, `owner` no longer matches and nothing happens. If the
  old one runs first, the new tab's `shown → 1` replaces the fade before the next frame. This also hides
  the pill when the route is one of the vendor's hidden triggers.
- Style (UI thread only):

```ts
const pill = useAnimatedStyle(() => {
  const w = ind.w.get();
  const sx = w > 0 ? 1 + ind.stretch.get() / w : 1;
  return {
    width: w, // only changes on layout, never per frame
    top: ind.y.get(),
    opacity: ind.shown.get(),
    transform: [{ translateX: ind.x.get() - w / 2 }, { scaleX: sx * ind.press.get() }, { scaleY: ind.press.get() }],
  };
});
// static: position 'absolute', left 0, height 32, borderRadius 16, backgroundColor palette.primarySoft
```

Stretch uses `scaleX`, not width, so nothing is laid out per frame. During the 100 ms stretch the end caps
are at most about 27 % elliptical, which is not visible in motion.

- The pill is the track's first child, so it passes **under** the raised FAB when travelling Me ⇄ Inbox.
  That depth cue costs nothing.
- If a `TabButton` is rendered outside a `TabBarFrame` (no context), it draws its own local pill with
  opacity = `on`.

### 6.2 Look
- Fill `palette.primarySoft`, no border and no shadow. On iOS it sits over the frost and blur. On Android it
  sits on the solid bar (`canvasTop` in light mode, `surface` in dark mode). The brand icon on `primarySoft` is about 4.9:1, which clears the
  3:1 needed for UI.
- The pill is behind the icon only, never the label, as in Material 3.

### 6.3 Reduce Motion
There is no shared indicator (`shown` stays 0). Every `TabButton` renders its **own** local pill with
opacity = `on`, so selection becomes a pure cross-fade between the old and new slots (fades use
`ReduceMotion.Never`). Nothing slides or stretches.

---

## 7. Labels
- Labels are shown on **every** tab, always. They help recognition, and this is the Payno, M3, iOS and
  Airbnb consensus.
- There are two stacked `Animated.Text`s in the label box. The base is Medium in `textMuted` with opacity
  `1 − on`. The overlay is absolute (left 0, right 0), SemiBold in `primaryText`, with opacity `on`. The
  result is a smooth colour **and** weight cross-fade with no re-layout jump. Both use the existing label
  style (`font.medium` or `font.semibold`, never `fontWeight`).
- Lift: label box `translateY = −1 × on`. A 1 dp rise is felt more than seen. Under Reduce Motion it is 0.
- Only the Pressable carries the accessible label. Both Texts are hidden from accessibility
  (`importantForAccessibility="no"`, `accessibilityElementsHidden`).

---

## 8. Press feedback, haptics and re-tap

### 8.1 Press
- Press-in: `iconZone` scale → 0.90 (`withTiming`, OUT_MS, OUT_QUAD). If this tab is focused, `ind.press`
  → 0.95 as well.
- Release: `withSpring(1, SNAP)` for both.
- The label does **not** scale. Text at fractional scales shimmers on Android, and a still label keeps
  the bar calm.
- Reduce Motion: no scale. The Pressable dims instead with `opacity: pressed ? 0.7 : 1`, which is not
  movement.
- The old `pressed` style (opacity 0.6) is replaced by the above.

### 8.2 Haptics (unchanged rule: at most one per action)
- Switching tabs: `haptic.select()` in `onPress` when the tab was not focused (as today).
- Re-tap on the active tab: none.
- FAB: `haptic.select()` (as today).
- Badge changes: never, because they are not the user's action.

### 8.3 Re-tap: scroll to top / pop to root
What was checked: `TabTrigger` in expo-router/ui emits `navigation.emit({ type: 'tabPress' })` on every
press, including a re-tap, before it decides whether to switch. The tab router's state type is `'tab'`,
and `expo-router` exports `useScrollToTop`. So scroll-to-top is possible, but **the app does not wire it
today**: `Screen` holds no ScrollView ref and no tab root calls `useScrollToTop`.

Decision for this pass: ship the **nudge only**. Scroll-to-top is a separate follow-up that touches
`Screen`. The follow-up would add a ref on Screen's ScrollView plus `useScrollToTop(ref)` when
`withTabBar` is set, which covers every tab root at once. Pop-to-root does not apply: tabs have no nested
stacks, and pushed screens live in the parent `(app)` Stack.

---

## 9. Badge (`TabBadge`, inside `TabButton`)

The look is unchanged: `dangerInk` fill (`danger` in dark mode, where `dangerInk` is a text red), a 2 px `palette.surface` border, `micro` white text with
`maxFontSizeMultiplier 1`, minWidth 18, height 18, radius 9, padX 4. It sits absolute at top −6, left 14
of the 24 dp icon box. It is **outside** the glyph's moving groups, so tilts and hops never carry it, and
**inside** `iconZone`, so it follows the press and nudge squeeze. Cap: `count > 99 ? '99+' : count`.

There are two nested Animated.Views. The outer one holds the layout animations and the inner one holds
the pop and wiggle transforms, so the two never fight over `transform`.

| Event | Motion |
|---|---|
| Appears (0 → n) | `entering` (custom worklet): scale 0.4 → `withSequence(withTiming(1.15, {140, OUT_QUAD}), withSpring(1, SNAP))`, opacity 0 → 1 in 120 ms |
| Grows while visible (n → m, m > n > 0) | pop: scale `withSequence(withTiming(1.22, {110, OUT_QUAD}), withSpring(1, POP))` **plus** wiggle: rotate `withSequence(withTiming(−10, {70}), withTiming(8, {90}), withTiming(−4, {80}), withTiming(0, {80}))`, about 320 ms |
| Shrinks but stays > 0 | none, the text just updates |
| Reaches 0 | `exiting`: scale 1 → 0.5 and opacity → 0, 160 ms, IN_QUAD. The last number stays visible while it leaves |
| Present when the bar first mounts | no animation: wrap the badge slot in `<LayoutAnimationConfig skipEntering skipExiting>` (`skipExiting` also stops a badge from zooming out where its tab used to be when the tab itself is removed; the web preview ignores it) |
| Reduce Motion | `entering = FadeIn.duration(160).reduceMotion(ReduceMotion.Never)`, `exiting = FadeOut.duration(120).reduceMotion(ReduceMotion.Never)`, no pop or wiggle |

The increase is detected in an effect with a `prev` ref (`count > prev && prev > 0`). The badge is
`pointerEvents="none"` and hidden from accessibility, because the count is already in the tab's label
(`"Inbox, 3 waiting"`). Changes are not announced, since live announcements of a counter would be noise.

Width check at 320: "99+" is about 28 dp wide, so the badge can reach 2 dp past the Inbox slot into
More's slot. Overflow is visible and it never reaches More's icon.

---

## 10. FAB (`TabFab`)

The look is unchanged: 58 dp, `gradient.brand`, white + (lucide `Plus` 26, stroke 2.2), raised 10 dp in a
64 dp slot, brand-tinted shadow (opacity 0.34, radius 14, y 8, elevation 8). The ring's border is
`primaryText`, so it still shows on the dark canvas.

New optional prop: **`open?: boolean`** (default false). The staff layout passes `open={creating}`, the
same state that drives `<CreateSheet visible={creating}>`, and so does the kit gallery. Add
`accessibilityState={{ expanded: open }}`. The label stays "Create".

| Behaviour | Spec |
|---|---|
| Press-in / release | Existing `PressableScale scaleTo={0.92}` (100 ms in, SNAP out) |
| + ⇄ × | A wrapper `Animated.View` around the glyph: `rotate = 45° × turn`. `turn` follows `open` with `withSpring(open ? 1 : 0, SNAP)` (about 300 ms, no overshoot). It turns as the sheet rises and turns back as the sheet fades on close. This includes closing by choosing an item, because `onClose` runs first |
| Ring pulse (once per press) | A 58 dp circle behind the FAB (sibling **before** the PressableScale inside `fabLift`), `borderWidth 2`, `borderColor primaryText`, `pointerEvents none`. `ring` **rests at 1**, which is invisible (`useSharedValue(1)`). On `onPress`: `ring.set(0)`, then `withTiming(1, {BEAT_MAX, OUT_CUBIC})`. Style: scale `1 + 0.45 × ring`, opacity `0.4 × (1 − ring)`. It plays once with no loop and no idle pulse |
| Shadow deepens on press | A glow layer as the first child **inside** the PressableScale (so it scales with the button): absolute fill, radius 29, `backgroundColor primary`, `shadowColor primary`, `shadowOpacity 0.5`, `shadowRadius 18`, `shadowOffset {0, 10}`, `elevation 12`. Its **opacity** goes 0 → 1 on press-in (OUT_MS) and → 0 on release (GLOW_OUT_MS). Only opacity is animated, never shadow props. The gradient fill covers it, so only its stronger shadow shows |
| Reduce Motion | No rotation: stack `Plus` and a second `Plus` held at a static 45° (so the × is the same size as the animated one) and cross-fade them by `turn` (160 ms, `ReduceMotion.Never`). No ring. The glow fade is kept, because it is not movement |

`TabFab`'s existing press handler order stays: `haptic.select()` first, then `onPress()`.

---

## 11. Reduce Motion matrix

Read `useReducedMotion()` once per component (Reanimated). Branch in JS, so movement is never started.
Pass `reduceMotion: ReduceMotion.Never` on the fades you keep, because Reanimated's default
(`ReduceMotion.System`) would jump them.

| Element | Normal | Reduce Motion |
|---|---|---|
| Icon outline ⇄ active | 160 / 100 ms fade + beat | same fade, no beat (rest pose is the final pose) |
| Pill | slides + stretch | per-tab local pills cross-fade |
| Label | colour/weight fade + 1 dp lift | fade only |
| Press | scale 0.90 / pill 0.95 | opacity 0.7 |
| Re-tap nudge | squeeze | none |
| Badge | pop / wiggle / zoom out | fade in / out |
| FAB | 0.92 press, rotate, ring, glow | glyph cross-fade, glow; no scale, ring or rotation |

---

## 12. Performance rules
- **No per-frame JS.** Shared values are written only from event handlers (`onPress`, `onPressIn`,
  `onPressOut`, `onLayout`) and from effects keyed on `isFocused`, `count` and `open`. Every frame runs in
  worklets.
- **No React state for animation.** Measured slot geometry lives in shared values. The previous focus and
  count live in refs that are read only inside effects. Render stays pure for the React Compiler.
- **Animate only `transform` and `opacity`.** The single exception is the pill's `width`, which changes
  only when layout changes. SVG gets `strokeDashoffset` only, on 6 paths in total (Me 2, Bills 3,
  Agreements 1).
- **Bounded SVG surfaces.** Staff: Home 5, Me 6, Inbox 3, More 0 (Views), so 14 small `Svg`s. Vendor:
  about 19. They are static except for the dash paths. A cross-fade is View opacity, which the compositor
  handles, and the SVG is not re-rasterised.
- Worklets capture plain numbers (the constants in §3) and never the `motion` object or `palette`.
- Do not animate the `BlurView`, and do not put anything animated inside it.
- When a tab bar route changes, every `TabButton` re-renders once (the `isFocused` prop). That is cheap.
  Glyphs depend only on `focused`, `reduced` and the stable `on`, so the Compiler skips them otherwise.

---

## 13. Accessibility
- Bar `accessibilityRole="tablist"`. Each `TabButton` Pressable has `accessibilityRole="tab"`,
  `accessibilityState={{ selected }}` and
  `accessibilityLabel = count ? \`${label}, ${count} waiting\` : label`. All of this is unchanged.
- Glyph layers, the pill, the badge and the ring are decorative: `pointerEvents="none"`,
  `accessible={false}`, `importantForAccessibility="no-hide-descendants"` and
  `accessibilityElementsHidden`.
- The FAB keeps `role="button"`, its label and its hint, and adds `accessibilityState={{ expanded: open }}`.
- Colour is never the only cue: the shape fills, the weight changes and the pill appears.
- Contrast: muted icon on the bar 5.9:1; brand icon on `primarySoft` about 4.9:1; white details on brand
  5.3:1; brand label on the bar 5.3:1.
- Touch targets: tab slots ≥ 54.5 × 56; FAB 58.
- Font scaling: tab labels stay at `maxFontSizeMultiplier 1`, as DESIGN §4 requires for the tab bar.
- Reduce Motion: see §11.

---

## 14. Platform notes
- **Android:** the bar is solid `canvasTop` with no blur, and the pill reads as a warm tint on it. Coloured
  elevation (`shadowColor`) needs Android 9+; older versions show a neutral shadow, which is fine.
  Children overflow by default, so the raised FAB, the ring and the badge already draw outside the bar.
  `transformOrigin` (RN ≥ 0.74) works on Android and iOS.
- **iOS:** the pill and glyphs sit over the BlurView inside the frost. Never animate blur intensity. The blur
  tint follows the scheme (`light` / `dark`).
- **Dark mode:** Android's solid bar is `surface` (canvasTop would sink into the dark canvas); see §4.1
  and §9 for the icon and badge colours.
- **Web** (kit gallery only): everything degrades gracefully. If `transformOrigin` on web differs, beats
  look slightly off-centre, which is acceptable.

---

## 15. Implementation plan

### Files
1. **`src/ui/tab-glyphs.tsx`** (new): `export type TabGlyphName = 'home' | 'me' | 'inbox' | 'more' |
   'bills' | 'agreements' | 'profile'`, plus
   `export function TabGlyph({ name, on, focused, reduced }: { name: TabGlyphName; on: SharedValue<number>; focused: boolean; reduced: boolean })`.
   It contains the geometry from §4 as constants, one internal component per glyph (`profile` renders the
   `me` glyph), the `Layer` helper below and `useGlyphBeat`.
2. **`src/ui/tab-bar.tsx`**: keep the file header comment updated and keep the exports.
   - `TabBarFrame`: same props (`children`, `inline`, forwarded ref and rest). Add the `track` View, the
     `TabIndicatorContext` provider and `<TabIndicator/>`. Wrap the badge area as described in §9.
   - `TabButton`: props become
     `Omit<TabTriggerSlotProps, 'ref'> & { label: string; badge?: number } & ({ glyph: TabGlyphName; icon?: LucideIcon } | { glyph?: undefined; icon: LucideIcon })`.
     With `glyph` it renders `TabGlyph`. With only `icon` (the old API) it renders the lucide icon as two
     cross-faded layers (muted outline / brand with `primarySoft` fill), with the pill, label, press and
     nudge but no beat. Existing callers keep working.
   - `TabBadge` (internal): §9.
   - `TabFab`: add `open?: boolean`, the rotation, ring, glow and the reduced-motion cross-fade (§10).
3. **`src/app/(app)/(tabs)/_layout.tsx`**: `glyph="home" | "me" | "inbox" | "more"` (drop the lucide
   imports) and `<TabFab open={creating} … />`.
4. **`src/app/(vendor)/portal/(tabs)/_layout.tsx`**: `glyph="home" | "bills" | "agreements" | "profile"`.
   The hidden triggers are untouched.
5. **`src/features/dev/kit-a.tsx`**: pass the same `glyph` names and `open={creating}`. Update the item
   note: "Frosted capsule, 4 tabs; the active tab gets a sliding soft-brand pill, a filled icon with a
   short animation, and a brand label; the raised centre + opens the CreateSheet and turns into ×."
6. **`docs/DESIGN.md` §7.20 and §13**: replace the "charcoal pill fades" text with a pointer to this file.

### Shared helper

```tsx
const AnimatedPath = Animated.createAnimatedComponent(Path);
const abs = StyleSheet.absoluteFill;

/** One 24×24 SVG layer stacked in the glyph box; animate the View, never the SVG node. */
function Layer({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Animated.View pointerEvents="none" style={[abs, style]}>
      <Svg width={24} height={24} viewBox="0 0 24 24">{children}</Svg>
    </Animated.View>
  );
}

/** strokeDashoffset driver for a draw-on path of length L (see §4.1). */
function useDraw(d: SharedValue<number>, L: number) {
  return useAnimatedProps(() => ({ strokeDashoffset: (L + 1) * (1 - d.get()) }));
}
// <AnimatedPath d={…} strokeDasharray={[L, L + 2]} animatedProps={drawProps} … />
```

### Home glyph sketch (the pattern every glyph follows)

```tsx
function HomeGlyph({ on, focused, reduced }: GlyphProps) {
  const roofY = useSharedValue(0);
  const door = useSharedValue(1); // rest = final active pose
  const outFade = useAnimatedStyle(() => ({ opacity: 1 - on.get() }));
  const inFade = useAnimatedStyle(() => ({ opacity: on.get() }));
  const roof = useAnimatedStyle(() => ({ transform: [{ translateY: roofY.get() }] }));
  const doorStyle = useAnimatedStyle(() => ({ opacity: on.get(), transform: [{ scaleY: door.get() }] }));

  useGlyphBeat(
    focused,
    reduced,
    () => {
      roofY.set(withSequence(withTiming(-2, { duration: 110, easing: OUT_QUAD }), withSpring(0, POP)));
      door.set(0);
      door.set(withDelay(90, withTiming(1, { duration: 220, easing: OUT_CUBIC })));
    },
    () => {
      roofY.set(withTiming(0, { duration: OUT_MS, easing: OUT_QUAD }));
      door.set(1);
    },
  );

  return (
    <View style={styles.box} pointerEvents="none">
      <Layer style={outFade}>{/* body + door outline, muted */}</Layer>
      <Layer style={inFade}>{/* body fill + stroke, primary */}</Layer>
      <Animated.View style={[abs, roof]}>
        <Layer style={outFade}>{/* roof, muted */}</Layer>
        <Layer style={inFade}>{/* roof, primary */}</Layer>
      </Animated.View>
      <Layer style={[{ transformOrigin: [12, 19.7, 0] }, doorStyle]}>{/* door, onPrimary */}</Layer>
    </View>
  );
}
```

### TabButton focus effect

```tsx
const id = useId();
const on = useSharedValue(isFocused ? 1 : 0);
const prev = useRef(isFocused);
useEffect(() => {
  if (prev.current === isFocused) return;
  prev.current = isFocused;
  on.set(
    isFocused
      ? withTiming(1, { duration: IN_MS, easing: OUT_CUBIC, reduceMotion: ReduceMotion.Never })
      : withTiming(0, { duration: OUT_MS, easing: OUT_QUAD, reduceMotion: ReduceMotion.Never }),
  );
  if (!ind || reduced) return; // local pill follows `on`
  if (isFocused) placeIndicator(ind, slot.get(), id, true);
  else releaseIndicator(ind, id);
}, [isFocused]);
```

---

## 16. QA checklist (Expo Go, both platforms)
- [ ] 320 dp (staff and vendor), 360 and 412: labels fit, the pill is centred under each icon, the FAB slot
      is untouched, and the badge "99+" does not clip.
- [ ] Largest system font: labels do not grow and nothing shifts.
- [ ] Tap each tab: one beat, ≤ 450 ms, then stillness. The previous tab fades to outline with no
      movement. The pill slides, and passes under the FAB between Me and Inbox.
- [ ] Hammer-tap between two tabs: no stuck poses, and the pill always ends under the focused tab.
- [ ] Re-tap the active tab: a squeeze, no haptic and no beat.
- [ ] Cold start on each tab and after restoring a route: no beat and no pill slide-in (the pill fades in
      once).
- [ ] Inbox count 0 → 3 (zooms in), 3 → 5 (pop and wiggle), 5 → 2 (nothing), 2 → 0 (zooms out), and 120
      shows "99+". A badge present at mount does not animate.
- [ ] Vendor unapproved (Home · Profile) → approved: the pill glides to its new slot. A hidden route
      hides the pill.
- [ ] FAB: press squeezes and the glow deepens. Release shows one ring. + turns to × as the sheet opens and
      back when it is closed by backdrop, by the Android back button or by choosing an item.
- [ ] Reduce Motion on (iOS Settings → Accessibility → Motion; Android "Remove animations"): only fades,
      pills cross-fade per tab, and the FAB glyph cross-fades.
- [ ] Kit gallery: the staff and vendor previews behave the same (inline frame, local state).
- [ ] Profiling (Perf Monitor): the JS thread stays idle during every animation.
- [ ] Dark mode (More → Appearance → Dark): the bar is the dark `surface` on Android and a dark blur on
      iOS; active icons and labels are coral (`primaryText`) with knocked-out details on the dark pill; the
      badge is `danger` red with white text; the FAB ring is visible.

---

## Sources
- Apple, WWDC23 "Animate symbols in your app" (notes): https://wwdcnotes.com/documentation/wwdc23-10258-animate-symbols-in-your-app/
- SF Symbols `symbolEffect` (bounce, replace): https://sarunw.com/posts/animate-sf-symbols-with-symboleffect/ ·
  https://appcoda.com/swiftui-symboleffect/
- Animating SF Symbols in a native iOS tab bar: https://davey.bearblog.dev/animating-sfsymbol-icons-in-the-native-ios-tab-bar
- Material 3 navigation indicator (Flutter `NavigationIndicator`, scales in on x): https://api.flutter.dev/flutter/material/NavigationIndicator-class.html
- Material Components Android bottom navigation (M3 Expressive: bar 80 → 64 dp, indicator 64 → 56 dp; 24 dp icons):
  https://gitea.com/784622644/material-components-android/src/branch/master/docs/components/BottomNavigation.md
- Telegram-style bar (bubble indicator, icon scale, press-down + haptic, 250 ms): https://pub.dev/documentation/telegram_nav_bar/latest/
- Tab bar animation patterns: https://blog.icons8.com/articles/ui-inspiration-tab-bar-animations/ · Lottie tab bar
  (per-tab animated icons): https://designcode.io/play-tab-bar-lottie-animation
- Airbnb motion and Lottie: https://blog.thenounproject.com/icons-in-motion/
- Payno bottom nav: docs/REFERENCE-COMPONENTS.md item 5.
- Verified in this repo: `node_modules/expo-router/build/ui/TabTrigger.js` emits `tabPress` on every press;
  `expo-router` exports `useScrollToTop` (`build/exports.d.ts`).
