// Dark-mode design tokens: "Ember Night" (applied by applyColorScheme in src/theme/tokens.ts).
//
// Ember Night is the light "Ember" brand at night. The vermilion stays the same (#C33B02) and the
// warm ivory canvas becomes a warm espresso (#1C1511 → #100C0A). Cards are an opaque umber
// (#2B2522), and ink is a soft parchment (#F5EEE6, 13.1:1 on cards, which avoids the glare of pure
// white). Every module keeps its light-mode colour family. Its icon disc is a dark tint of that hue,
// and all nine tints sit at the same OKLab lightness (about 1.28:1 against the card), so each disc
// reads clearly. Module hero gradients are the light ones unchanged, except that the brand modules
// use the dark hero. Chosen by a blind vote of five judges (option C), then refined with their fixes.
// Every text pair is WCAG AA or better: white on every fill and gradient stop, and ink, textMuted,
// primaryText, every *Ink and every module fg on the card and on its own tint. No colour falls in
// the 230°–320° hue band (no indigo, violet or purple).
//
// Key names and shapes match tokens.ts exactly (palette / gradient / moduleTone / statusTone /
// shadow). The `satisfies` clauses check that at compile time. The one addition is described next.
//
// NEW KEY: primaryText. In dark mode the brand FILL (`primary`, white text 5.32:1) is too dark to
// use as TEXT on a dark card (2.84:1). Brand-coloured text, links ("See all"), icons, outlines and
// rings drawn on a dark surface must use `primaryText` (#FF9064, 6.8:1). `primaryText` must also be
// ADDED to the light `palette` in tokens.ts with the light primary value: primaryText: '#C33B02'.
// After that, code can always use palette.primaryText for brand-coloured text in both themes.
// (grep: `color={palette.primary}` / `borderColor: palette.primary` has about 27 hits to move over.)
//
// Dark-mode integration notes (spots where light-mode code assumes light values):
//  - ui/tab-bar.tsx badge: white text on `dangerInk`. In dark mode dangerInk is light text red, so
//    the badge fill must use `danger` (#D43A40, white 4.69:1) instead.
//  - ui/tiles.tsx count: white text on `ink`. In dark mode ink is near-white, so use `surface` as the
//    text colour (13.1:1), or `charcoal` as the fill.
//  - ui/actions.tsx Android barFill is hard-coded 'rgba(250,250,249,0.96)'. In dark mode use
//    `tabBar`-like 'rgba(48,42,38,0.97)'.
//  - features/attendance/week-hours.tsx tip (surface text on ink fill) already works both ways.

import type { ModuleKey, StatusTone, gradient, palette, shadow } from '@/theme/tokens';

type Shape<T> = { readonly [K in keyof T]: string };

export const darkPalette = {
  // Warm espresso canvas (the ivory canvas turned down), so the umber cards lift off it (1.19–1.29:1).
  canvas: '#16110E', // flat fallback behind the gradient (midpoint of top and bottom)
  canvasTop: '#1C1511',
  canvasBottom: '#100C0A',
  surface: '#2B2522', // opaque card colour: sheets, white-pill equivalents, menu tiles (ink 13.1:1)
  surfaceMuted: '#231D1A', // inputs inside sheets, nested tiles: recessed a step toward the canvas
  surfaceSunken: '#1A1513', // pressed fills, switch off-track, photo placeholders (1.20:1 under the card)

  // Frosted surfaces: translucent warm-LIGHT veils over the dark canvas (they lighten what's behind).
  frost: 'rgba(255,240,228,0.07)', // frosted tiles, quick-action circles, keypad keys
  frostStrong: 'rgba(255,240,228,0.10)', // frosted hero / summary cards, pill inputs
  frostOnDark: 'rgba(255,255,255,0.10)', // keypad keys, swipe-track fill on the brand fill (white text 4.55:1 over charcoal)
  frostEdgeOnDark: 'rgba(255,255,255,0.18)', // key rim / pressed key on the brandDeep wash (white 5.4:1)
  canvasWash: '#0C0907', // deepest warm tone at the very bottom of a screen (Backdrop); never pure black
  glass: 'rgba(255,240,228,0.07)', // card fill on iOS (over the canvas ≈ the opaque surface)
  glassAndroid: 'rgba(255,240,228,0.09)', // card fill on Android (no shadow, so a little more body)
  glassStrong: 'rgba(255,240,228,0.10)', // ActionBar, selected glass (textFaint still 4.57:1 over canvasTop)
  glassEdge: 'rgba(255,236,220,0.10)', // faint light rim that sells the glass
  glassLine: 'rgba(255,236,220,0.08)', // hairline outline (Android rim), same as the card edge

  // Brand: the exact light vermilion for FILLS (white 5.32:1). Brand-coloured TEXT uses primaryText.
  primary: '#C33B02', // hero cards, tab pill, selected segment and chip (fill only in dark)
  primaryText: '#FF9064', // NEW: brand text / links / icons / rings on dark surfaces (6.8:1 on surface)
  primaryDeep: '#9A3207', // white 7.4:1
  primarySoft: '#4E2A1B', // dark ember tint for selected backgrounds (primaryText 5.6:1, ink 10.9:1)
  onPrimary: '#FFFFFF',
  onPrimaryMuted: 'rgba(255,255,255,0.80)',
  onPrimaryFaint: 'rgba(255,255,255,0.58)', // decimals and units on dark (>= 24 px only)
  charcoal: '#C33B02', // primary button fill (vermilion, white 5.32:1; the name is historical)
  charcoalPressed: '#A33103', // white 7.0:1

  // Warm highlights (charts, glows, celebrations): orange, rose and honey gold, lifted for the dark.
  sunset: '#FF9A45', // warm orange highlight: chart lines, glow, dots (fill/icon only)
  sunsetSoft: '#48301B', // dark amber tint (sunset 5.8:1 on it)
  coral: '#E26C8C', // rose: chart highlight, birthdays (fill/icon only; 4.9:1 on surface)
  coralInk: '#F393AE', // text 6.9:1 on surface, 5.4:1 on coralSoft
  coralSoft: '#5C2633',
  gold: '#E4AD3C', // honey gold: podium crown, anniversaries (fill/icon only)
  goldInk: '#F0BE67', // text 8.8:1 on surface, 6.8:1 on goldSoft
  goldSoft: '#4A3510',

  accent: '#2FA866', // green FILL / DOT / ICON only (5.0:1 on surface; white icons >= 18 px 3.0:1)
  accentDeep: '#22914F', // switch on-track (white thumb 4.0:1), icons on surface (3.8:1)
  accentSoft: '#1A3F2A',
  onAccent: '#FFFFFF', // icons >= 18 on accent fills only

  ink: '#F5EEE6', // warm parchment (13.1:1 on surface; no halation)
  text: '#ECE4DB', // 12.0:1 on surface
  textMuted: '#BCB0A5', // 7.1:1 on surface
  textFaint: '#9E9288', // placeholders, chevrons, greyed decimals, disabled (5.0:1 on surface, 4.57:1 on any veil)
  hairline: '#3A332E',
  separator: 'rgba(255,236,220,0.07)', // list separators
  track: 'rgba(255,236,220,0.09)', // segmented track, progress track, empty bars
  pressedTint: 'rgba(255,236,220,0.06)', // pressed list rows (a light lift, not a dark dip)

  success: '#2FA866', // dot / icon (same as accent)
  successSoft: '#1A3F2A',
  successInk: '#6AD596', // text 8.3:1 on surface, 6.5:1 on successSoft
  danger: '#D43A40', // dot / icon AND destructive / badge FILL in dark (white 4.69:1)
  dangerSoft: '#4A2224',
  dangerInk: '#FC6C6A', // TEXT only in dark: true red, 5.4:1 on surface, kept apart from the brand link
  warning: '#F2A516',
  warningSoft: '#46360F',
  warningInk: '#F8C74E', // text 9.5:1 on surface, 7.4:1 on warningSoft
  info: '#8BB8F5', // calm blue: banner icon on infoSoft, in-progress dots (7.6:1 on surface)
  infoSoft: '#1E2C40',

  overlay: 'rgba(6,4,3,0.64)', // sheet scrim: deeper than light mode so the sheet edge still separates
} as const satisfies Shape<typeof palette> & { primaryText: string };

export const darkGradient = {
  // Dark heroes (white text). A touch quieter than the light brand hero (#C33B02 → #A41A35) so it
  // glows rather than glares at night; 80 % white captions reach 4.0:1 on the start stop.
  brand: ['#C03A04', '#9A1934'] as [string, string],
  brandDeep: ['#8F2E0E', '#5C1425'] as [string, string],
  glow: ['rgba(255,146,72,0)', 'rgba(255,146,72,0.10)'] as [string, string], // soft orange bloom, capped at 0.10
  // "Light" heroes become warm dark washes (ink text, never white): ember → umber → wine.
  sunsetLight: ['#40271A', '#2B2522', '#3F2229'] as [string, string, string],
  // Module heroes (white text): identical to light mode.
  ocean: ['#0B6E9E', '#1B4E99'] as [string, string],
  mint: ['#0E7D57', '#0A5550'] as [string, string],
  sunrise: ['#B4530C', '#A8321A'] as [string, string],
  berry: ['#B42A52', '#7A1A3C'] as [string, string],
} as const satisfies { readonly [K in keyof typeof gradient]: readonly string[] };

// Same nine families as light mode. fg = icon / text (>= 5.2:1 on bg, >= 6.7:1 on surface),
// bg = a dark tint of that hue (all at OKLab L ≈ 0.34, 1.27–1.30:1 against the card),
// gradient = that module's hero (both stops >= 4.5:1 under white text).
export const darkModuleTone: Record<ModuleKey, { fg: string; bg: string; gradient: [string, string] }> = {
  attendance: { fg: '#FF9A6C', bg: '#5C2814', gradient: ['#C03A04', '#9A1934'] },
  leave: { fg: '#8BB8F5', bg: '#21385A', gradient: ['#2B6CC8', '#1B4E99'] },
  pay: { fg: '#56D3A8', bg: '#17402A', gradient: ['#0E7D57', '#08664A'] },
  expenses: { fg: '#F78DA8', bg: '#5C2633', gradient: ['#C4304F', '#8E1C3A'] },
  pettyCash: { fg: '#B6D16C', bg: '#313C1A', gradient: ['#4A7A14', '#2F5E14'] },
  visitors: { fg: '#5FD1C3', bg: '#123F3D', gradient: ['#0F7A72', '#0A5550'] },
  tasks: { fg: '#6DC5EE', bg: '#123C50', gradient: ['#0C72A3', '#08506F'] },
  support: { fg: '#5FD1C3', bg: '#123F3D', gradient: ['#0E766E', '#0B4F5A'] },
  policies: { fg: '#AAB7C5', bg: '#2D3844', gradient: ['#526170', '#34404C'] },
  people: { fg: '#FF9A6C', bg: '#5C2814', gradient: ['#C03A04', '#9A1934'] },
  news: { fg: '#6DC5EE', bg: '#123C50', gradient: ['#0B6E9E', '#0A4F70'] },
  bounty: { fg: '#FBA95B', bg: '#4A3510', gradient: ['#B4530C', '#B5340F'] },
  holidays: { fg: '#F78DA8', bg: '#5C2633', gradient: ['#C4304F', '#A31C3E'] },
  timesheets: { fg: '#6DC5EE', bg: '#123C50', gradient: ['#0C72A3', '#0F7A72'] },
  shifts: { fg: '#8BB8F5', bg: '#21385A', gradient: ['#2563B8', '#173F7A'] },
  profile: { fg: '#FF9A6C', bg: '#5C2814', gradient: ['#C03A04', '#9A1934'] },
  security: { fg: '#AAB7C5', bg: '#2D3844', gradient: ['#526170', '#2E3843'] },
  vendor: { fg: '#B6D16C', bg: '#313C1A', gradient: ['#527414', '#3B5A10'] },
};

// On dark cards a shadow barely shows, so it is pure black, larger and softer, and only strong enough
// to separate floating chrome from the canvas. Lift mostly comes from the lighter surface.
export const darkShadow = {
  soft: {
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  float: {
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
} as const satisfies { readonly [K in keyof typeof shadow]: unknown };

// fg = the accessible text ink (>= 4.5:1 on bg AND on surface), dot = the bright status colour,
// bg = a dark tint of the status hue, border = a mid tone of the same hue (visible rim on the card).
export const darkStatusTone: Record<StatusTone, { fg: string; dot: string; bg: string; border: string }> = {
  pending: { fg: '#F8C74E', dot: '#F2A516', bg: '#3D2F12', border: '#6A5121' },
  done: { fg: '#6AD596', dot: '#2FA866', bg: '#173A27', border: '#2C6844' },
  failed: { fg: '#FC6C6A', dot: '#D43A40', bg: '#44201F', border: '#7A3433' },
  info: { fg: '#8BB8F5', dot: '#6FA3EE', bg: '#1E2C40', border: '#34507A' },
  neutral: { fg: '#BCB0A5', dot: '#9E9288', bg: '#332C28', border: '#4A413B' },
};
