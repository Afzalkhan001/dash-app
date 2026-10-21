// Design tokens. Every colour, radius, spacing step, layout constant, type style and motion preset in
// the app comes from here. The numbers are specified in docs/DESIGN.md §3 and §5 — change them there first.
//
// Colour (Oct 2026): "Ember" — a vermilion brand (#C33B02) that deepens into crimson-wine
// (#A41A35) on the hero, a warm orange highlight (#DE6A1C), rose and honey-gold as the two
// secondary warm accents, on a warm near-neutral canvas (#FCFBF9 → #F1ECE7) with a warm
// near-black ink. Modules fall into nine deliberate families (brand, rose, blue, cerulean, teal, emerald,
// olive, slate, plus butter-gold for bounty) so cool tones balance the warm brand. Chosen by a blind
// multi-agent vote: several agents proposed palettes, the finalists were refined and shown to separate
// judge agents only as anonymous options, and the top-voted option won. Every text pair (white on each
// fill and gradient stop, every *Ink and module fg on white and on its tint) is WCAG AA (>= 4.5:1).
// No indigo, no purple.
// Layout and feel (not colour) take inspiration from the Payno and Lendora Behance case studies.
//
// Token NAMES are shared by every screen, so they never change — only their values do:
//   primary   → brand vermilion (hero cards with white text, active tab, selected segment and chip)
//   charcoal  → the primary button fill (vermilion, same as primary; the name is historical)
//   sunset (orange) / coral (rose) / gold → warm highlights (charts, glows, celebrations); *Ink for text
//   accent / success / danger / warning → meaning only; *Ink variants are the text colours
//   moduleTone[x] / <ModuleBadge> → each module's own colour for icons, tiles and heroes

import { darkGradient, darkModuleTone, darkPalette, darkShadow, darkStatusTone } from '@/theme/dark';

export const lightPalette = {
  // Warm near-neutral canvas (faint ivory → sand), so white glass cards lift off it.
  canvas: '#F7F4F0', // flat fallback behind the gradient (midpoint of top and bottom)
  canvasTop: '#FCFBF9',
  canvasBottom: '#F1ECE7',
  surface: '#FFFFFF', // solid white: sheets' inner fields, white pills, menu tiles
  surfaceMuted: '#F6F2EE', // inputs inside sheets, nested tiles
  surfaceSunken: '#ECE5DF',

  // Payno-style frosted surfaces: translucent white with a bright rim, stacked on the canvas wash.
  frost: 'rgba(255,255,255,0.58)', // frosted tiles, quick-action circles, keypad keys on light
  frostStrong: 'rgba(255,255,255,0.80)', // frosted hero / summary cards, pill inputs
  frostOnDark: 'rgba(255,255,255,0.14)', // keypad keys and chips on the deep wash
  frostEdgeOnDark: 'rgba(255,255,255,0.22)',
  canvasWash: '#EAD8CC', // Payno-style deeper warm wash at the very bottom of a screen (Backdrop) — never under text directly
  glass: 'rgba(255,255,255,0.66)', // card fill on iOS
  glassAndroid: 'rgba(255,255,255,0.86)', // card fill on Android (no shadow there, so it needs more body)
  glassStrong: 'rgba(255,255,255,0.88)', // ActionBar, selected glass
  glassEdge: 'rgba(255,255,255,0.95)', // the bright rim that sells the glass
  glassLine: 'rgba(72,40,22,0.08)', // hairline outline so glass reads on light backgrounds (Android rim)

  // Brand: vermilion, deep enough for white text (5.3:1) and for text on white, canvas and primarySoft.
  primary: '#C33B02', // hero cards, tab pill, selected segment and chip
  primaryText: '#C33B02', // brand-coloured TEXT and links on surfaces (dark mode lifts it for contrast)
  primaryDeep: '#8F2E0E',
  primarySoft: '#FDEDE5',
  onPrimary: '#FFFFFF',
  onPrimaryMuted: 'rgba(255,255,255,0.80)',
  onPrimaryFaint: 'rgba(255,255,255,0.58)', // decimals and units on dark (>= 24 px only)
  charcoal: '#C33B02', // primary button fill (vermilion, 5.3:1; the name is historical)
  charcoalPressed: '#A33103',

  // Warm highlights only (charts, glows, celebrations, "new"): orange, rose and honey gold.
  sunset: '#DE6A1C', // warm orange highlight: chart lines, hero glow, dots (fill/icon only, never small text)
  sunsetSoft: '#FDEBDC',
  coral: '#E0587A', // rose: chart highlight, birthdays (fill/icon only)
  coralInk: '#B42A52', // text 6.1:1 on white
  coralSoft: '#FDE6EE',
  gold: '#D09B1C', // honey gold: podium crown, anniversaries (fill/icon only)
  goldInk: '#83600A', // text 5.7:1 on white
  goldSoft: '#FFF0D6',

  accent: '#25A15A', // green FILL / DOT / ICON only (positive)
  accentDeep: '#1A884A',
  accentSoft: '#E0F4E8',
  onAccent: '#FFFFFF', // icons >= 18 on accent fills only

  ink: '#1E1A17', // warm near-black
  text: '#26201C',
  textMuted: '#6B625B', // 5.9:1 on white
  textFaint: '#8C8178', // placeholders, chevrons, greyed decimals >= 24 px, disabled
  hairline: '#E9E3DD',
  separator: 'rgba(72,40,22,0.08)', // list separators
  track: 'rgba(72,40,22,0.07)', // segmented track, progress track, empty bars
  pressedTint: 'rgba(72,40,22,0.05)', // pressed list rows

  success: '#25A15A',
  successSoft: '#E0F4E8',
  successInk: '#157A3F', // text 5.4:1 on white
  danger: '#EE4146',
  dangerSoft: '#FDE7E8',
  dangerInk: '#A50E1F', // text, badge fill, destructive fill (deep crimson, kept apart from the brand)
  warning: '#F2A516',
  warningSoft: '#FDF1D9',
  warningInk: '#8A5700', // text 6.0:1 on white
  // Info / in progress is a calm blue (the leave family), never the brand: a vermilion "In progress"
  // pill or notice read as an error next to the crimson "Rejected".
  info: '#1F5FB5', // icon, dot (text 6.4:1 on white)
  infoSoft: '#E6EFFB',

  overlay: 'rgba(28,18,12,0.42)',
} as const;

// Brand and module colour. Hero cards use a gradient; every module has its own tone so icons, tiles
// and charts are recognisable at a glance.
export const lightGradient = {
  // Dark heroes (white text). `brand` is vermilion → crimson-wine; Card tone="primary" adds a soft orange glow.
  brand: ['#C33B02', '#A41A35'] as [string, string],
  brandDeep: ['#8F2E0E', '#5C1425'] as [string, string],
  glow: ['rgba(222,106,28,0)', 'rgba(222,106,28,0.10)'] as [string, string], // a faint orange bloom over the dark hero (kept low so the wine corner never reads as error red)
  // Light heroes (ink text, never white): apricot wash → ivory → blush wash.
  sunsetLight: ['#FDE3CF', '#FBF6F0', '#F9DEE6'] as [string, string, string],
  // Module heroes (white text).
  ocean: ['#0B6E9E', '#1B4E99'] as [string, string], // cerulean → blue
  mint: ['#0E7D57', '#0A5550'] as [string, string], // emerald → deep teal
  sunrise: ['#B4530C', '#A8321A'] as [string, string], // amber → ember
  berry: ['#B42A52', '#7A1A3C'] as [string, string], // rose → wine
} as const;

export type ModuleKey =
  | 'attendance'
  | 'leave'
  | 'pay'
  | 'expenses'
  | 'pettyCash'
  | 'visitors'
  | 'tasks'
  | 'support'
  | 'policies'
  | 'people'
  | 'news'
  | 'bounty'
  | 'holidays'
  | 'timesheets'
  | 'shifts'
  | 'profile'
  | 'security'
  | 'vendor';

// Nine families around the vermilion brand (no indigo, no purple): brand (attendance, people, profile),
// rose (expenses, holidays), blue (leave, shifts), cerulean (tasks, timesheets, news), teal (visitors,
// support), emerald (pay), olive (pettyCash, vendor), slate (policies, security) and butter-gold for
// bounty. Shared tones are deliberate. fg = icon / text ink (>= 4.5:1 on bg and on white), bg = soft tint
// behind the icon, gradient = that module's hero (both stops >= 4.5:1 under white text).
export const lightModuleTone: Record<ModuleKey, { fg: string; bg: string; gradient: [string, string] }> = {
  attendance: { fg: '#B23E10', bg: '#FFE6D8', gradient: ['#C33B02', '#A41A35'] },
  leave: { fg: '#1F5FB5', bg: '#E3EEFC', gradient: ['#2B6CC8', '#1B4E99'] },
  pay: { fg: '#096849', bg: '#DCF4E8', gradient: ['#0E7D57', '#08664A'] },
  expenses: { fg: '#B42A52', bg: '#FDE6EE', gradient: ['#C4304F', '#8E1C3A'] },
  pettyCash: { fg: '#567004', bg: '#EEF6D8', gradient: ['#4A7A14', '#2F5E14'] },
  visitors: { fg: '#0B706A', bg: '#D9F3EF', gradient: ['#0F7A72', '#0A5550'] },
  tasks: { fg: '#0A6A99', bg: '#DDF1FA', gradient: ['#0C72A3', '#08506F'] },
  support: { fg: '#0B706A', bg: '#D9F3EF', gradient: ['#0E766E', '#0B4F5A'] },
  policies: { fg: '#4B5866', bg: '#ECEFF3', gradient: ['#526170', '#34404C'] },
  people: { fg: '#B23E10', bg: '#FFE6D8', gradient: ['#C33B02', '#A41A35'] },
  news: { fg: '#0A6A99', bg: '#DDF1FA', gradient: ['#0B6E9E', '#0A4F70'] },
  bounty: { fg: '#B23E10', bg: '#FFF0D6', gradient: ['#B4530C', '#B5340F'] },
  holidays: { fg: '#B42A52', bg: '#FDE6EE', gradient: ['#C4304F', '#A31C3E'] },
  timesheets: { fg: '#0A6A99', bg: '#DDF1FA', gradient: ['#0C72A3', '#0F7A72'] },
  shifts: { fg: '#1F5FB5', bg: '#E3EEFC', gradient: ['#2563B8', '#173F7A'] },
  profile: { fg: '#B23E10', bg: '#FFE6D8', gradient: ['#C33B02', '#A41A35'] },
  security: { fg: '#4B5866', bg: '#ECEFF3', gradient: ['#526170', '#2E3843'] },
  vendor: { fg: '#567004', bg: '#EEF6D8', gradient: ['#527414', '#3B5A10'] },
};

export const radius = {
  xs: 8, // tiny inner elements, progress bars
  sm: 12, // tiles and panels nested inside a card, skeleton default, inline alerts (Banner)
  md: 16, // inputs, select fields, inner panels in dark heroes
  lg: 20, // standalone small tiles (menu tiles, stat tiles)
  xl: 24, // Card, ListCard, inner cards in sheets
  xxl: 28, // dark hero cards, sheet top corners
  pill: 999,
} as const;

// 4 dp grid. Off-grid values allowed only for 1 (hairline), 2 (between stacked text lines), 3 (inside
// a pill) and 6 (dot-to-label, label-to-field).
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

// Where layouts change shape: window widths (dp) and system text sizes. Read them through
// shouldStack() in src/ui/layout.ts — never compare the window with a bare number.
const breakpoint = {
  compact: 380, // the kit's compact numbers (gutter, card padding, gaps)
  narrow: 360, // pills, codes and filter chips move under / out of the way
  tight: 340, // two-up tiles and field pairs stack
  tiny: 300, // pairs of very short figures stack
} as const;
const textScale = {
  large: 1.15, // everything that stacks on a narrow phone also stacks above this
  huge: 1.3, // list rows move their right column under the text
} as const;

// Screen geometry. Read it through useLayout() (src/ui/layout.ts) wherever a size depends on the
// window — never hard-code space.lg as the screen gutter.
export const layout = {
  breakpoint,
  textScale,
  compactWidth: breakpoint.compact, // below this (or text above largeTextScale) the layout is "compact"
  largeTextScale: textScale.large,
  gutter: 20,
  gutterCompact: 16,
  cardPad: 20,
  cardPadCompact: 16,
  heroPad: 24,
  heroPadCompact: 20,
  sheetPad: 20,
  stackGap: 16,
  stackGapCompact: 12,
  hit: 48, // minimum effective touch target (dp)
  control: { lg: 52, md: 44, sm: 36 }, // button heights
  tabBar: { height: 64, inset: 16, insetNarrow: 12, slot: 48, slotNarrow: 44, pill: 48, padX: 6 },
  tabBarSpace: 88, // bar height + 24 clearance (bottom inset added separately)
} as const;

// One typeface everywhere — Plus Jakarta Sans. Choose the weight through fontFamily only: never set
// fontWeight (on Android it falls back to Roboto). The 'serif' keys are kept so old code keeps working.
export const font = {
  thin: 'PlusJakartaSans_200ExtraLight', // Lendora-style giant numerals only (>= 36 px)
  light: 'PlusJakartaSans_300Light',
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold', // loaded, but not used in new code
  serif: 'PlusJakartaSans_300Light',
  serifItalic: 'PlusJakartaSans_300Light_Italic',
} as const;

// Light (300) only at 24 px and up. Nothing below 11 px anywhere (micro is the floor).
export const type = {
  // Lendora-style giant figure: ExtraLight, tight tracking. Pair with greyed decimals and a small superscript unit.
  numeral: { fontFamily: font.thin, fontSize: 48, lineHeight: 54, letterSpacing: -1.6 },
  display: { fontFamily: font.light, fontSize: 46, lineHeight: 52, letterSpacing: -1.2 },
  hero: { fontFamily: font.light, fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  title: { fontFamily: font.regular, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  heading: { fontFamily: font.medium, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  label: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  labelStrong: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
  micro: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.2 }, // badges, counts only
} as const;

export const lightShadow = {
  // Glass cards get a whisper of shadow (iOS only — Android elevation on translucent fills looks muddy);
  // floating chrome (tab bar, toast) a bit more.
  soft: {
    shadowColor: '#1A1A18',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  float: {
    shadowColor: '#1A1A18',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;

export type StatusTone = 'pending' | 'done' | 'failed' | 'info' | 'neutral';

// fg = the accessible text ink, dot = the bright status colour (dots, icons).
export const lightStatusTone: Record<StatusTone, { fg: string; dot: string; bg: string; border: string }> = {
  pending: { fg: '#8A5700', dot: '#F2A516', bg: 'rgba(255,255,255,0.75)', border: '#FADBA2' },
  done: { fg: '#157A3F', dot: '#25A15A', bg: 'rgba(255,255,255,0.75)', border: '#B3DEC5' },
  failed: { fg: '#A50E1F', dot: '#EE4146', bg: 'rgba(255,255,255,0.75)', border: '#F9BCBE' },
  // In progress / open / live: calm blue, so it never reads as the brand or an alert.
  info: { fg: '#1F5FB5', dot: '#2B6CC8', bg: 'rgba(255,255,255,0.75)', border: '#BCD3F2' },
  neutral: { fg: '#6B625B', dot: '#8C8178', bg: 'rgba(255,255,255,0.75)', border: '#E9E3DD' },
};

// Motion: one set of durations, easings and springs so the whole app moves the same way. Quick (150–
// 350 ms), little or no bounce. Easings are cubic-bezier control points: on the JS side use
// Easing.bezier(...motion.easeOut); inside worklets use Easing.out(Easing.cubic) / Easing.in(Easing.cubic).
export const motion = {
  // durations (ms)
  instant: 100,
  fast: 160,
  base: 240,
  enter: 320,
  slow: 450,
  countUp: 700,
  countUpdate: 400,
  stagger: 40,
  staggerMax: 5,
  enterOffset: 12,
  // easings
  easeOut: [0.16, 1, 0.3, 1],
  easeIn: [0.3, 0, 0.8, 0.15],
  easeStandard: [0.2, 0, 0, 1],
  // springs (mass 1)
  snap: { stiffness: 439, damping: 42, mass: 1 }, // ≈300 ms, no bounce: press release, toggles
  layout: { stiffness: 247, damping: 30, mass: 1 }, // ≈400 ms, barely any bounce: tab pill, segmented thumb, expand
  sheet: { stiffness: 195, damping: 26, mass: 1 }, // ≈450 ms: sheets
  smooth: { stiffness: 158, damping: 25, mass: 1 }, // ≈500 ms, no bounce: large moves
  celebrate: { stiffness: 158, damping: 20, mass: 1 }, // a little bounce: success check only, rare
  // legacy names kept, retuned (the previous values bounced 27–42 %)
  spring: { stiffness: 247, damping: 30, mass: 1 },
  springSoft: { stiffness: 158, damping: 25, mass: 1 },
  press: { stiffness: 439, damping: 42, mass: 1 },
} as const;

// ── Live theme ───────────────────────────────────────────────────────────────
// palette, gradient, moduleTone, statusTone and shadow are LIVE objects: applyColorScheme() swaps their
// values in place for light or dark (src/theme/theme-provider.tsx calls it and remounts the app). Read
// them at render time — inside a component, or inside a themedStyles(() => ({ ... })) factory
// (src/theme/themed.ts) — never in a module-level constant, or that value stays frozen in whichever
// scheme was active when the module loaded.
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends readonly [unknown, unknown, unknown]
      ? [string, string, string]
      : T extends readonly [unknown, unknown]
        ? [string, string]
        : { -readonly [K in keyof T]: Widen<T[K]> };

export type Palette = Widen<typeof lightPalette>;
export type Gradient = Widen<typeof lightGradient>;
export type Shadow = Widen<typeof lightShadow>;
export type ModuleToneMap = typeof lightModuleTone;
export type StatusToneMap = typeof lightStatusTone;

export const palette: Palette = { ...lightPalette };
export const gradient: Gradient = { ...lightGradient };
export const moduleTone: ModuleToneMap = { ...lightModuleTone };
export const statusTone: StatusToneMap = { ...lightStatusTone };
export const shadow: Shadow = { ...lightShadow };

export type ColorScheme = 'light' | 'dark';

const THEMES = {
  light: { palette: lightPalette, gradient: lightGradient, moduleTone: lightModuleTone, statusTone: lightStatusTone, shadow: lightShadow },
  dark: { palette: darkPalette, gradient: darkGradient, moduleTone: darkModuleTone, statusTone: darkStatusTone, shadow: darkShadow },
};

let scheme: ColorScheme = 'light';
let version = 0;

/** Swap every live token object to `next`. Call it only from the ThemeProvider (it remounts the app). */
export function applyColorScheme(next: ColorScheme) {
  if (next === scheme) return;
  const t = THEMES[next];
  Object.assign(palette, t.palette);
  Object.assign(gradient, t.gradient);
  Object.assign(moduleTone, t.moduleTone);
  Object.assign(statusTone, t.statusTone);
  Object.assign(shadow, t.shadow);
  scheme = next;
  version += 1;
}

/** The scheme the live tokens currently hold. */
export const currentColorScheme = (): ColorScheme => scheme;

/** Bumps on every scheme change; themedStyles uses it to rebuild cached styles. */
export const themeVersion = () => version;
