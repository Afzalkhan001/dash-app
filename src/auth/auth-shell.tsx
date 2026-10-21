// Shared frame for the sign-in screens, built from the Payno sign-in and verify screens
// (docs/REFERENCE-COMPONENTS.md §3 "Sign-in" / "OTP"):
//   sign-in   the centred Tamada logo, a big regular "Welcome back", a muted line of at most two lines,
//             PillFields with a leading icon, one full-width primary pill, an "Or" divider with the
//             other way in as an outlined frosted pill, and a small footer link at the bottom
//             ("Are you a vendor? Sign in here")
//   steps     a round frosted back button top-left, the step's icon in a frosted circle, the title
//             and the muted line, then the form
//   code      the same as a step, plus `keypad`: a NumericKeypad pinned to the bottom of the screen on
//             the deep KeypadWash, so the system keyboard stays down (tapping the code boxes still
//             opens it for paste and autofill; the keypad steps aside while it is up)
//
// The page sits on the kit Backdrop (ivory → warm wash, espresso in dark mode) with a faint brand glow
// at the top. Keep every step dead simple: one field (or one pair, like email + password), one primary
// right under it, and any alternative under the form (AuthDivider + an outlined `ghost` pill, or a
// text link). The logo shows on screens without an `icon`; it is tinted parchment in dark mode.
//
// Layout (docs/DESIGN.md §11 Auth): single column, gutter from useLayout(), 54 dp pill fields 20 apart,
// the primary lg and full width. Keyboard: the shell sits in a KeyboardAvoidingView and, while the
// keyboard is up, scrolls down so the form block — down to its main button — sits just above it. It
// never scrolls the focused field under the status bar and never scrolls up, so a page the user moved
// stays put. The keypad counts as the keyboard: on a short phone the form scrolls up above it (never
// past the code boxes). Large text on a short phone leaves the icon circle out so the form stays in reach.
//
//   children  the form: fields, an error Banner, the primary button and anything needed while typing
//             (a code screen's resend line); kept in view with the keyboard up
//   extra     the alternatives under the form (AuthDivider + an outlined pill, or one text link)
//   footer    a separate way in, pinned to the bottom of the page (AuthFooterLink; or Terms)
//   keypad    a NumericKeypad for code screens, drawn on a KeypadWash at the bottom of the screen
//   stepKey   change it when the screen swaps steps so the headline and form fade up again
//   icon      the step's icon for the frosted circle above the title (screens without the logo)

import { Image } from 'expo-image';
import { ChevronLeft, type LucideIcon, type LucideProps, RotateCw, Smartphone } from 'lucide-react-native';
import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, type StyleProp, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { layout, palette, shadow, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { Backdrop, Button, IconButton, isDarkScheme, KeypadWash, Reveal, Text, useLayout } from '@/ui';

/** Fallback when a sign-in call returns something unexpected (no error text, no session). */
export const SIGN_IN_FAILED = 'Couldn’t sign you in. Please try again.';

const IOS = Platform.OS === 'ios';

type Block = { y: number; h: number };

/** Room above a focused input for its field label (label line at large text, the 6 dp gap, the box edge). */
const FIELD_HEAD = 36;
/** Usable height (window minus status and navigation bars) under which large text drops the icon circle. */
const SHORT_USABLE = 600;
/** Code screens: under this usable height the keypad leaves little room, so the head tightens up. */
const KEYPAD_ROOMY = 800;
/** The step icon's frosted circle. */
const MARK = 64;
/** The keypad wash's soft top edge: as tall as the room allows, between these two. */
const FADE_MIN = 24;
const FADE_MAX = 112;

/** The brand wash at the top of the sign-in pages: a warm sunset glow top-right, a faint brand one top-left. */
function BrandGlow({ width, height }: { width: number; height: number }) {
  const h = Math.max(1, Math.round(height * 0.55));
  const w = Math.max(1, Math.round(width));
  const dark = isDarkScheme();
  return (
    <View style={styles.glow} pointerEvents="none">
      <Svg width={w} height={h}>
        <Defs>
          <RadialGradient id="authCool" cx="8%" cy="18%" rx="70%" ry="55%">
            <Stop offset="0" stopColor={palette.primary} stopOpacity={dark ? 0.16 : 0.1} />
            <Stop offset="1" stopColor={palette.primary} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="authWarm" cx="92%" cy="4%" rx="75%" ry="55%">
            <Stop offset="0" stopColor={palette.sunset} stopOpacity={dark ? 0.18 : 0.3} />
            <Stop offset="0.6" stopColor={palette.sunset} stopOpacity={dark ? 0.05 : 0.08} />
            <Stop offset="1" stopColor={palette.sunset} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill="url(#authCool)" />
        <Rect x={0} y={0} width={w} height={h} fill="url(#authWarm)" />
      </Svg>
    </View>
  );
}

const keyboardY = (y: unknown) => (typeof y === 'number' && Number.isFinite(y) && y > 0 ? Math.round(y) : 0);

/**
 * Top edge of the keyboard in window coordinates while it is up, else null. 0 means "up, position
 * unknown" (iOS with cross-fade transitions reports screenY 0). Starts from the keyboard that is
 * already up, so a screen pushed over a focused field (login → code) still knows about it.
 */
function useKeyboardTop() {
  const [top, setTop] = useState<number | null>(() => (Keyboard.isVisible() ? keyboardY(Keyboard.metrics()?.screenY) : null));
  useEffect(() => {
    const show = Keyboard.addListener(IOS ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setTop(keyboardY(e?.endCoordinates?.screenY)));
    const hide = Keyboard.addListener(IOS ? 'keyboardWillHide' : 'keyboardDidHide', () => setTop(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return top;
}

/** The Tamada wordmark, centred. It is black artwork, so dark mode draws it in the parchment ink. */
function Logo() {
  return (
    <Image
      source={require('@/assets/images/brand-logo-stacked.png')}
      style={styles.logo}
      contentFit="contain"
      tintColor={isDarkScheme() ? palette.ink : undefined}
      accessibilityLabel="Tamada Media DASH"
    />
  );
}

export function AuthShell({
  overline,
  title,
  subtitle,
  children,
  extra,
  footer,
  top,
  keypad,
  stepKey,
  icon: Icon,
}: {
  /** Optional small brand-coloured eyebrow above the title (e.g. "Number verified"). */
  overline?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** The alternatives under the form (AuthDivider + an outlined pill, or a text link). Not kept above the keyboard. */
  extra?: ReactNode;
  /** A separate way in (AuthFooterLink: vendor sign-in; or Terms), pinned to the bottom of the page. */
  footer?: ReactNode;
  /** The round back button (BackButton), top-left. */
  top?: ReactNode;
  /** A NumericKeypad, shown on the deep KeypadWash at the bottom of the screen while the system keyboard is down. */
  keypad?: ReactNode;
  /** Change when the screen moves to another step, so the headline and form animate in again. */
  stepKey?: string;
  /** The step's icon, in a frosted circle above the title. Without one the screen shows the logo. */
  icon?: LucideIcon;
}) {
  const insets = useSafeAreaInsets();
  const { gutter, fontScale, width, height } = useLayout();
  const scrollRef = useRef<ScrollView>(null);
  const formRef = useRef<ComponentRef<typeof View>>(null);
  const offsetRef = useRef(0);
  const keyboardTop = useKeyboardTop();
  const [viewport, setViewport] = useState(0);
  const [block, setBlock] = useState<Block | null>(null);
  // Keypad screens: the root's height, the page's natural height and the keypad's, to size the wash's fade.
  const [rootH, setRootH] = useState(0);
  const [pageH, setPageH] = useState(0);
  const [padH, setPadH] = useState(0);

  // Large text on a short phone: the icon circle would push the form below the fold, so it is left out.
  // A code screen on a phone under ~720 dp usable does the same, and tightens its gaps, so the boxes and
  // the main button stay above the keypad (an SE-sized phone shows them without scrolling).
  const usable = height - insets.top - insets.bottom;
  const cramped = fontScale > layout.largeTextScale && usable < SHORT_USABLE;
  const tight = !!keypad && usable < KEYPAD_ROOMY;
  const withMark = !!Icon && !cramped && !tight;
  const withLogo = !Icon;
  // The keypad steps aside while the system keyboard is up (the person tapped the boxes to paste).
  const showKeypad = !!keypad && keyboardTop === null;
  const bottomPad = Math.max(insets.bottom, space.md);
  const fade = Math.round(Math.max(FADE_MIN, Math.min(FADE_MAX, rootH && pageH && padH ? rootH - pageH - padH - bottomPad : FADE_MAX)));
  // The form block in scroll-content coordinates: its layout y is measured inside the page wrapper,
  // which starts below the content's top padding.
  const contentTop = insets.top + space.xs;
  const formTop = block ? block.y + contentTop : -1;
  const formH = block ? block.h : 0;

  // Keyboard up: scroll down until the form's bottom (its main button) sits just above the keyboard,
  // but never so far that the focused field's label goes under the status bar — a form taller than
  // the space left shows from the focused field down. The visible height comes from the keyboard's
  // top edge, so the first run (iOS fires keyboardWillShow before the KeyboardAvoidingView has shrunk
  // the ScrollView) already aims at the right spot and the run after the shrink lands on the same one.
  // It only ever scrolls down: a page the user scrolled further keeps its place, and a banner clearing
  // never pulls it back. Re-runs when the visible area or the form changes size (a banner, a step).
  useEffect(() => {
    const form = formRef.current;
    if (keyboardTop === null || viewport <= 0 || formTop < 0 || !form) return;
    let live = true;
    form.measureInWindow((_fx, formWinY) => {
      if (!live || !Number.isFinite(formWinY)) return;
      const offset = offsetRef.current;
      // Where the ScrollView starts on screen, how much of it the keyboard leaves visible, and how
      // much of its top the status bar covers.
      const viewTop = formWinY - formTop + offset;
      const visible = keyboardTop > 0 ? Math.min(viewport, keyboardTop - viewTop) : viewport;
      if (visible <= 0) return;
      const covered = Math.max(0, insets.top - viewTop);
      const toBottom = formTop + formH + space.md - visible;
      const go = (keepTop: number) => {
        if (!live) return;
        const y = Math.round(Math.max(0, Math.min(toBottom, keepTop - covered - space.xs)));
        if (y > offset + 1) scrollRef.current?.scrollTo({ y, animated: true });
      };
      const input = TextInput.State.currentlyFocusedInput();
      if (!input) {
        go(formTop);
        return;
      }
      input.measureInWindow((_ix, inputWinY) => {
        // The focused input's top in content coordinates; keep its label in view. An input outside
        // the form block falls back to the form's top.
        const inputY = formTop + (inputWinY - formWinY);
        const inForm = Number.isFinite(inputY) && inputY >= formTop && inputY <= formTop + formH;
        go(inForm ? Math.max(formTop, inputY - FIELD_HEAD) : formTop);
      });
    });
    return () => {
      live = false;
    };
  }, [keyboardTop, viewport, formTop, formH, insets.top]);

  // The keypad is a code screen's keyboard, so the same rule applies to it: on a short phone, where
  // the bottom of the form (the main button, the resend line, or a button an error Banner pushed
  // down) would sit behind the keypad, scroll down just enough to show it — never past the top of
  // the form, so the code boxes stay in view. Only ever scrolls down.
  useEffect(() => {
    if (!showKeypad || viewport <= 0 || formTop < 0) return;
    const y = Math.round(Math.min(formTop - space.xs, formTop + formH + space.md - viewport));
    if (y > offsetRef.current + 1) scrollRef.current?.scrollTo({ y, animated: true });
  }, [showKeypad, viewport, formTop, formH]);

  // A code screen types on its own keypad: put away the keyboard the previous screen left up (its field
  // keeps focus across the push), so key presses can't land in that field and the keypad shows at once.
  const hasKeypad = !!keypad;
  useEffect(() => {
    if (hasKeypad) Keyboard.dismiss();
  }, [hasKeypad]);

  const step = stepKey ?? 'only';

  return (
    <View style={styles.root} onLayout={(e) => setRootH(Math.round(e.nativeEvent.layout.height))}>
      <Backdrop />
      <BrandGlow width={width} height={height} />
      <KeyboardAvoidingView style={styles.flex} behavior={IOS ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          onLayout={(e) => setViewport(Math.round(e.nativeEvent.layout.height))}
          onScroll={(e) => {
            offsetRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={IOS ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + space.xs,
            paddingBottom: keypad ? space.md : insets.bottom + space.lg,
          }}>
          <View onLayout={(e) => setPageH(Math.round(e.nativeEvent.layout.height + insets.top + space.xs + space.md))}>
            {top ? <View style={[styles.topRow, { paddingHorizontal: gutter }]}>{top}</View> : null}

            <Reveal
              key={`head-${step}`}
              index={1}
              style={[styles.head, { paddingHorizontal: gutter }, top ? (tight ? null : styles.headAfterTop) : styles.headPlain]}>
              {withLogo ? (
                <View style={styles.logoSlot}>
                  <Logo />
                </View>
              ) : null}
              {withMark && Icon ? (
                <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Icon size={26} color={palette.primaryText} strokeWidth={1.6} />
                </View>
              ) : null}
              {overline ? (
                <Text variant="labelStrong" color={palette.primaryText} align="center" numberOfLines={2}>
                  {overline}
                </Text>
              ) : null}
              <Text variant="title" align="center" accessibilityRole="header" maxFontSizeMultiplier={1.2} style={tight ? null : styles.title}>
                {title}
              </Text>
              {subtitle ? (
                <Text variant="body" muted align="center" style={styles.subtitle}>
                  {subtitle}
                </Text>
              ) : null}
            </Reveal>

            <View
              ref={formRef}
              collapsable={false}
              style={[styles.form, { paddingHorizontal: gutter }, tight && styles.formTight]}
              onLayout={(e) => {
                const y = Math.round(e.nativeEvent.layout.y);
                const h = Math.round(e.nativeEvent.layout.height);
                setBlock((prev) => (prev && prev.y === y && prev.h === h ? prev : { y, h }));
              }}>
              <Reveal key={`form-${step}`} index={2} style={[styles.stack, tight && styles.stackTight]}>
                {children}
              </Reveal>
            </View>

            {extra ? (
              <Reveal key={`extra-${step}`} index={3} style={[styles.extra, { paddingHorizontal: gutter }]}>
                {extra}
              </Reveal>
            ) : null}
          </View>

          <View style={styles.spacer} />

          {footer ? (
            <Reveal index={4} style={[styles.footer, { marginHorizontal: gutter }]}>
              {footer}
            </Reveal>
          ) : null}
        </ScrollView>

        {showKeypad ? (
          <KeypadWash fade={fade}>
            <View onLayout={(e) => setPadH(Math.round(e.nativeEvent.layout.height))}>{keypad}</View>
          </KeypadWash>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Small pieces shared by the sign-in screens ──────────────────────────────

/** Round frosted back button for the shell's `top` slot (44 dp, 48 dp touch target). */
export function BackButton({ onPress, label = 'Back' }: { onPress: () => void; label?: string }) {
  return (
    <IconButton accessibilityLabel={label} tone="muted" size={44} onPress={onPress}>
      <ChevronLeft size={22} color={palette.text} strokeWidth={1.8} />
    </IconButton>
  );
}

/**
 * Leading "icon" for mobile-number PillFields: the phone glyph, "+91" and a hairline, in the field's
 * icon colour (it turns brand when the field is focused). Pass it as the PillField `icon`.
 */
function PhoneLeadIcon({ color, style }: LucideProps) {
  return (
    <View style={[styles.phoneLead, style as StyleProp<ViewStyle>]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Smartphone size={20} color={color} strokeWidth={1.6} />
      <Text variant="bodyStrong" color={palette.text} tabular maxFontSizeMultiplier={1.4}>
        +91
      </Text>
      <View style={styles.phoneRule} />
    </View>
  );
}
export const PhoneLead = PhoneLeadIcon as unknown as LucideIcon;

/** Centred context note in a small frosted box with an icon ("Sample data only · the code is 123456"). Wraps instead of overflowing. */
export function AuthNote({ icon: Icon, iconColor, children }: { icon: LucideIcon; iconColor?: string; children: string }) {
  return (
    <View style={styles.note}>
      <Icon size={18} color={iconColor ?? palette.primaryText} strokeWidth={1.8} style={{ flexShrink: 0 }} />
      <Text variant="labelStrong" muted align="center" style={{ flexShrink: 1 }}>
        {children}
      </Text>
    </View>
  );
}

/** "Or" between the main form and the outlined secondary pills (Payno): two hairlines and a muted word. */
export function AuthDivider({ label = 'Or' }: { label?: string }) {
  return (
    <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.dividerLine} />
      <Text variant="label" muted maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

/**
 * Small footer link (Payno "Don't have an account? Sign Up"): a muted prompt and a text button on one
 * centred line, e.g. "Are you a vendor? Sign in here". The line wraps (the button drops under the
 * prompt, still centred) when it doesn't fit, so large text never pushes it off a 320 dp screen.
 */
export function AuthFooterLink({ prompt, label, onPress, disabled }: { prompt: string; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <View style={styles.footerLink}>
      <Text variant="label" muted align="center" style={styles.footerPrompt}>
        {prompt}
      </Text>
      <Button variant="text" size="md" title={label} onPress={onPress} disabled={disabled} style={styles.footerButton} />
    </View>
  );
}

/**
 * "+91 98765 43210" → "+91 ••••• 43210" for the code screens; anything else (an email the server
 * already masked) as it is. No-break spaces, so the number never splits over two lines.
 */
export function maskSentTo(sentTo: string) {
  const m = /^\+91\s*\d{5}\s*(\d{5})$/.exec(sentTo);
  return m ? `+91\u00A0•••••\u00A0${m[1]}` : sentTo;
}

/** "45s", "1m 05s": a countdown written the app's way, never like a clock time ("0:45"). */
const countdown = (seconds: number) => (seconds >= 60 ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`);

/**
 * Payno's "↻ Resend code" under a code form: a muted "Resend code in 25s" while the cooldown runs, then
 * a "Resend code" text button (with its own spinner) in the same centred 44 dp slot, so nothing jumps.
 */
export function ResendCode({ seconds, onPress, loading, disabled }: { seconds: number; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <View style={styles.resend}>
      {seconds > 0 ? (
        <View style={styles.resendWait} accessible accessibilityLabel={`You can ask for a new code in ${seconds} seconds`}>
          <RotateCw size={16} color={palette.textMuted} strokeWidth={1.8} />
          <Text variant="label" muted tabular align="center" style={styles.footerPrompt}>
            Resend code in {countdown(seconds)}
          </Text>
        </View>
      ) : (
        <Button variant="text" size="md" title="Resend code" icon={<RotateCw />} onPress={onPress} loading={loading} disabled={disabled} style={styles.resendButton} />
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: palette.canvas },
  flex: { flex: 1 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  head: { alignItems: 'center', gap: space.xs },
  headPlain: { marginTop: space.xxxl },
  headAfterTop: { marginTop: space.sm },
  logoSlot: { alignItems: 'center', marginBottom: space.lg },
  logo: { width: 144, height: 56 },
  // Payno's verify icon: a frosted circle with a bright rim and a soft shadow, a thin brand line icon.
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    marginBottom: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.frostStrong,
    borderWidth: 1,
    borderColor: IOS ? palette.glassEdge : palette.glassLine,
    ...(IOS ? shadow.soft : null),
  },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  subtitle: { maxWidth: 320 },
  form: { marginTop: space.xl },
  formTight: { marginTop: space.md },
  stack: { gap: space.lg },
  stackTight: { gap: space.sm },
  extra: { marginTop: space.lg, gap: space.md },
  spacer: { flex: 1, minHeight: space.xl },
  footer: { alignItems: 'center', gap: space.xxs },
  phoneLead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  phoneRule: { width: StyleSheet.hairlineWidth, height: 20, marginLeft: space.xxs, backgroundColor: palette.hairline },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    alignSelf: 'center',
    maxWidth: '100%',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    // Not a full pill: the note wraps to two lines on a 320 dp phone.
    borderRadius: 16,
    backgroundColor: palette.frostStrong,
    borderWidth: 1,
    borderColor: IOS ? palette.glassEdge : palette.glassLine,
  },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 24 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: palette.separator },
  footerLink: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', maxWidth: '100%' },
  footerPrompt: { flexShrink: 1 },
  // The text button's own 12 dp padding is the gap after the prompt; -4 keeps the pair optically centred.
  footerButton: { alignSelf: 'center', marginLeft: -space.xxs },
  resend: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  resendWait: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, maxWidth: '100%' },
  resendButton: { alignSelf: 'center' },
}));
