// Confirm and success flows (docs/REFERENCE-COMPONENTS.md #28–30, Payno "Confirm Transfer" / "Bill Paid"):
//   FromToCards     two frosted cards (icon or avatar, title, sub) with a round arrow between them
//   SwipeToConfirm  flat brand pill track, white knob (»), centred label, › at the end; drag past 85 % to confirm
//   ConfirmSheet    Sheet with a floating ×, title, FromToCards, a details slot and SwipeToConfirm
//   SuccessSheet    floating ×, a frosted circle with a green ✓, big title, subtitle, details, two buttons
// SwipeToConfirm becomes a normal primary Button when a screen reader or Reduce Motion is on.

import { ArrowDown, ArrowRight, Check, ChevronRight, ChevronsRight, type LucideIcon } from 'lucide-react-native';
import { type ReactNode, useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, type StyleProp, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { font, type ModuleKey, moduleTone, motion, palette, radius, shadow, space } from '@/theme/tokens';
import { ActionRow } from '@/ui/actions';
import { haptic } from '@/ui/haptics';
import { shouldStack, useLayout } from '@/ui/layout';
import { Avatar, Button } from '@/ui/primitives';
import { Sheet } from '@/ui/sheet';
import { isDarkScheme, useSurface } from '@/ui/surface';
import { Text } from '@/ui/text';

import { themedStyles } from '@/theme/themed';
const IOS = Platform.OS === 'ios';
/** The frosted rim: a bright edge on iOS, a hairline on Android (read in the themedStyles factory). */
const rim = () => (IOS ? palette.glassEdge : palette.glassLine);
const SNAP = motion.snap;
const SETTLE = motion.layout;

/**
 * Whether a screen reader (VoiceOver / TalkBack) is running; follows changes while mounted. On web
 * react-native-web can't tell and always answers "yes", so it is ignored there (dev gallery only).
 */
function useScreenReader() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => {
        if (alive) setOn(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (v: boolean) => setOn(v));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

// ── FromToCards ──────────────────────────────────────────────────────────────
export type FromToItem = {
  title: string;
  subtitle?: string;
  /** Line icon in a round badge (tinted with `module` when given). */
  icon?: LucideIcon;
  module?: ModuleKey;
  /** A person instead of an icon: photo or initials. */
  avatar?: { name: string; uri?: string | null };
};

/** One FromTo card: centred column side by side, or icon-left row when the pair is stacked. */
function FromToCard({ item, sheet, row }: { item: FromToItem; sheet: boolean; row: boolean }) {
  const Icon = item.icon;
  const tone = item.module ? moduleTone[item.module] : null;
  const align = row ? 'left' : 'center';
  return (
    <View style={[styles.ftCard, row ? styles.ftCardRow : styles.ftCardSide, sheet ? styles.ftCardSheet : styles.ftCardFrost]}>
      {item.avatar ? (
        <Avatar name={item.avatar.name} uri={item.avatar.uri} size={48} ring={false} />
      ) : Icon ? (
        <View style={[styles.ftIcon, { backgroundColor: tone?.bg ?? palette.surfaceMuted }]}>
          <Icon size={22} color={tone?.fg ?? palette.ink} strokeWidth={1.6} />
        </View>
      ) : null}
      <View style={row ? styles.ftTextRow : styles.ftText}>
        <Text variant="body" align={align} numberOfLines={2} style={styles.ftTitle}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text variant="caption" muted align={align} numberOfLines={2}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Two frosted cards with a round arrow between them (Payno "Payno Card → Courtney Henry"):
 *   <FromToCards from={{ title: 'Casual leave', subtitle: '6 days left', icon: Plane, module: 'leave' }}
 *                to={{ title: 'Meera Iyer', subtitle: 'Approver', avatar: { name: 'Meera Iyer' } }} />
 * Side by side; on a narrow phone or with large text they stack as icon-left rows with a ↓ between.
 */
export function FromToCards({ from, to, style }: { from: FromToItem; to: FromToItem; style?: StyleProp<ViewStyle> }) {
  const l = useLayout();
  const sheet = useSurface() === 'sheet';
  const stacked = shouldStack(l, { below: 'tight' });
  const Arrow = stacked ? ArrowDown : ArrowRight;
  const spoken = `From ${from.title}${from.subtitle ? `, ${from.subtitle}` : ''}, to ${to.title}${to.subtitle ? `, ${to.subtitle}` : ''}`;
  return (
    <View style={[stacked ? styles.ftColumn : styles.ftRow, style]} accessible accessibilityRole="summary" accessibilityLabel={spoken}>
      <FromToCard item={from} sheet={sheet} row={stacked} />
      <FromToCard item={to} sheet={sheet} row={stacked} />
      <View style={[styles.ftArrowWrap, stacked && styles.ftArrowWrapRow]} pointerEvents="none">
        <View style={styles.ftArrow}>
          <Arrow size={18} color={palette.ink} strokeWidth={1.6} />
        </View>
      </View>
    </View>
  );
}

// ── SwipeToConfirm ───────────────────────────────────────────────────────────
const KNOB = 52;
const INSET = 4;
const TRACK = KNOB + 2 * INSET;
const THRESHOLD = 0.85;

/** "Swipe to apply leave" → "Apply leave" (the label of the screen-reader / Reduce Motion button). */
function buttonLabelFrom(label: string) {
  const rest = label.replace(/^swipe\s+(to\s+)?/i, '').trim();
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : 'Confirm';
}

/** Swipes that throw something away or turn it off get the destructive (red) track by default. */
const DESTRUCTIVE = /^swipe\s+(to\s+)?(reject|delete|remove|discard|decline|deny|revoke|cancel|deactivate|disable|switch off|turn off|end|terminate|block|void|withdraw)(\s|$)/i;

export type SwipeToConfirmProps = {
  /** Centred label, e.g. "Swipe to apply leave". */
  label?: string;
  /** Runs once the knob is dragged past ~85 % (after a success haptic). */
  onConfirm: () => void;
  /** While true the knob stays at the end with a spinner; when it turns false the knob springs back. */
  loading?: boolean;
  disabled?: boolean;
  /** Label of the plain button shown to screen-reader / Reduce Motion users (default: derived from `label`). */
  buttonLabel?: string;
  /**
   * 'primary' (brand) or 'destructive' (red track, like the destructive Button) — default: destructive
   * when the label starts "Swipe to reject / delete / remove / switch off …", primary otherwise.
   */
  tone?: 'primary' | 'destructive';
  style?: StyleProp<ViewStyle>;
};

/**
 * Payno "Swipe to Continue": for irreversible submits (apply leave, submit claim, approve, clock out).
 * Drag the white knob to the right; past ~85 % it confirms with a success haptic, otherwise it springs
 * back. With a screen reader or Reduce Motion on it renders a normal primary Button instead.
 *   <SwipeToConfirm label="Swipe to apply leave" onConfirm={submit} loading={saving} />
 */
export function SwipeToConfirm({ label = 'Swipe to confirm', onConfirm, loading, disabled, buttonLabel, tone, style }: SwipeToConfirmProps) {
  const reduced = useReducedMotion();
  const destructive = (tone ?? (DESTRUCTIVE.test(label) ? 'destructive' : 'primary')) === 'destructive';
  // The track is the matching Button fill; the knob is always white (both themes), its icon the fill colour.
  const fill = destructive ? (isDarkScheme() ? palette.danger : palette.dangerInk) : palette.charcoal;
  const screenReader = useScreenReader();
  const [trackW, setTrackW] = useState(0);
  const [armed, setArmed] = useState(false);
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const max = Math.max(0, trackW - KNOB - 2 * INSET);

  // A ref, not just `armed`: two activations in one frame (a double tap on the screen-reader button, or a
  // fast re-swipe) would both see the stale state and send the request twice. A shared value rather than a
  // ref: `confirm` is handed to the pan gesture while rendering, which the refs lint forbids.
  const firing = useSharedValue(false);
  const confirm = () => {
    if (firing.get()) return;
    firing.set(true);
    haptic.success();
    setArmed(true);
    onConfirm();
  };

  // After a confirm, once the work is done (or straight away when there is no `loading`), slide back.
  useEffect(() => {
    if (!armed || loading) return;
    const t = setTimeout(() => {
      x.set(withSpring(0, SETTLE));
      setArmed(false);
      firing.set(false);
    }, 600);
    return () => clearTimeout(t);
  }, [armed, loading, x, firing]);

  const pan = Gesture.Pan()
    .enabled(!disabled && !loading && !armed && max > 0)
    .activeOffsetX([-8, 8])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      start.set(x.get());
    })
    .onUpdate((e) => {
      x.set(Math.min(max, Math.max(0, start.get() + e.translationX)));
    })
    .onFinalize(() => {
      if (max > 0 && x.get() >= max * THRESHOLD) {
        x.set(withSpring(max, SNAP));
        scheduleOnRN(confirm);
      } else {
        x.set(withSpring(0, SNAP));
      }
    });

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  // The lighter trail behind the knob only shows once it moves (at rest the knob sits flush, as in Payno).
  const fillStyle = useAnimatedStyle(() => ({ width: x.get() + INSET + KNOB / 2, opacity: Math.min(1, x.get() / 16) }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: max > 0 ? Math.max(0, 1 - x.get() / (max * 0.6)) : 1 }));

  if (screenReader || reduced) {
    return (
      <Button
        title={buttonLabel ?? buttonLabelFrom(label)}
        variant={destructive ? 'destructive' : 'primary'}
        onPress={confirm}
        loading={loading}
        disabled={disabled}
        style={style}
      />
    );
  }

  const busy = !!loading;
  // The label gets the track minus the knob and the end chevron: ~8 dp per character at 15 px. A longer
  // label drops to 13 px over up to 2 lines instead of being cut ("Swipe to lock October payroll").
  const labelRoom = trackW - (KNOB + INSET + space.sm) - 44;
  const long = trackW > 0 && label.length * 8 > labelRoom;
  return (
    <GestureHandlerRootView style={[styles.swipeRoot, disabled && styles.swipeDisabled, style]}>
      <View
        onLayout={(e) => setTrackW(Math.round(e.nativeEvent.layout.width))}
        style={[styles.track, { backgroundColor: fill }]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Swipe right to confirm"
        accessibilityState={{ disabled: !!disabled, busy }}
        accessibilityActions={[{ name: 'activate', label: buttonLabel ?? buttonLabelFrom(label) }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'activate' && !disabled && !busy && !armed) confirm();
        }}>
        <Animated.View style={[styles.trackFill, fillStyle]} pointerEvents="none" />
        <Animated.View style={[styles.labelWrap, fadeStyle]} pointerEvents="none">
          <Text
            variant={long ? 'label' : 'body'}
            color={palette.onPrimary}
            align="center"
            numberOfLines={long ? 2 : 1}
            maxFontSizeMultiplier={1.2}
            style={styles.label}>
            {label}
          </Text>
        </Animated.View>
        <Animated.View style={[styles.endChevron, fadeStyle]} pointerEvents="none">
          <ChevronRight size={20} color={palette.onPrimaryMuted} strokeWidth={1.8} />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.knob, knobStyle]}>
            {busy ? <ActivityIndicator color={fill} /> : <ChevronsRight size={22} color={fill} strokeWidth={1.6} />}
          </Animated.View>
        </GestureDetector>
      </View>
    </GestureHandlerRootView>
  );
}

// ── ConfirmSheet ─────────────────────────────────────────────────────────────
export type ConfirmSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Sheet title ("Confirm leave"). */
  title: string;
  subtitle?: string;
  from?: FromToItem;
  to?: FromToItem;
  /** Muted label above the details ("Leave details"). */
  detailsTitle?: string;
  /** The details — usually a SummaryCard of key → value rows. */
  children?: ReactNode;
  /** SwipeToConfirm label ("Swipe to apply leave"). */
  confirmLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Short muted line under the swipe ("You can cancel it until it is approved"). */
  note?: string;
  /** The swipe's tone (default: from `confirmLabel`, see SwipeToConfirm). */
  tone?: 'primary' | 'destructive';
};

/**
 * Payno "Confirm Transfer": a sheet with a floating round × above it, a title, FromToCards, a details
 * slot and a SwipeToConfirm pinned at the bottom. It can't be closed while `loading`.
 *   <ConfirmSheet visible={open} onClose={close} title="Confirm leave" from={…} to={…}
 *     detailsTitle="Leave details" confirmLabel="Swipe to apply leave" onConfirm={submit} loading={saving}>
 *     <SummaryCard rows={…} />
 *   </ConfirmSheet>
 */
export function ConfirmSheet({
  visible,
  onClose,
  title,
  subtitle,
  from,
  to,
  detailsTitle,
  children,
  confirmLabel = 'Swipe to confirm',
  onConfirm,
  loading,
  disabled,
  note,
  tone,
}: ConfirmSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={loading ? () => {} : onClose}
      title={title}
      subtitle={subtitle}
      floatingClose
      footer={
        <>
          <SwipeToConfirm label={confirmLabel} onConfirm={onConfirm} loading={loading} disabled={disabled} tone={tone} />
          {note ? (
            <Text variant="caption" muted align="center" numberOfLines={2}>
              {note}
            </Text>
          ) : null}
        </>
      }>
      {from && to ? <FromToCards from={from} to={to} /> : null}
      {detailsTitle ? (
        <Text variant="label" muted numberOfLines={1} style={styles.detailsTitle}>
          {detailsTitle}
        </Text>
      ) : null}
      {children}
    </Sheet>
  );
}

// ── SuccessSheet ─────────────────────────────────────────────────────────────
/** Frosted circle with a green ✓ that springs in (a little bounce; static with Reduce Motion). */
function SuccessMark() {
  const sheet = useSurface() === 'sheet';
  const reduced = useReducedMotion();
  const s = useSharedValue(reduced ? 1 : 0.6);
  useEffect(() => {
    if (reduced) {
      s.set(1);
      return;
    }
    s.set(withSpring(1, motion.celebrate));
  }, [reduced, s]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }], opacity: Math.min(1, (s.get() - 0.6) / 0.25) }));
  return (
    <Animated.View style={[styles.mark, sheet ? styles.markSheet : styles.markFrost, pop]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Check size={36} color={palette.accent} strokeWidth={1.6} />
    </Animated.View>
  );
}

export type SuccessSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Big title ("Leave applied"). */
  title: string;
  /** Muted line under it ("Meera will review it soon."). */
  subtitle?: string;
  /** Details — usually a SummaryCard (Request ID, Type, Dates, Status). */
  children?: ReactNode;
  /** Primary button (default "Done", closes the sheet). */
  primaryLabel?: string;
  onPrimary?: () => void;
  /** Optional frosted secondary button on the left ("View request"). */
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/**
 * Payno "Bill Paid": floating ×, a frosted circle with a green ✓, a big title, a muted subtitle, a
 * details slot and two buttons side by side (frosted secondary + primary) that stack on a 320 dp
 * phone or with large text.
 *   <SuccessSheet visible={done} onClose={close} title="Leave applied" subtitle="Meera will review it."
 *     secondaryLabel="View request" onSecondary={open}><SummaryCard … /></SuccessSheet>
 */
export function SuccessSheet({ visible, onClose, title, subtitle, children, primaryLabel = 'Done', onPrimary, secondaryLabel, onSecondary }: SuccessSheetProps) {
  const l = useLayout();
  const stacked = shouldStack(l, { below: 'tight' });
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(subtitle ? `${title}. ${subtitle}` : title);
  }, [visible, title, subtitle]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      floatingClose
      footer={
        <ActionRow context="sheet" stacked={stacked}>
          {secondaryLabel ? <Button variant="ghost" title={secondaryLabel} onPress={onSecondary ?? onClose} /> : null}
          <Button variant="primary" title={primaryLabel} onPress={onPrimary ?? onClose} />
        </ActionRow>
      }>
      <View style={styles.successHead}>
        <SuccessMark />
        <Text variant="title" align="center" numberOfLines={3} accessibilityRole="header" style={styles.successTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" muted align="center" numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  // FromTo
  ftRow: { flexDirection: 'row', gap: space.xs, alignItems: 'stretch' },
  ftColumn: { flexDirection: 'column', gap: space.xs },
  ftCard: {
    alignItems: 'center',
    gap: space.xxs,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  ftCardFrost: { backgroundColor: palette.frostStrong, borderColor: rim(), ...(IOS ? shadow.soft : null) },
  ftCardSheet: { backgroundColor: palette.surface, borderColor: palette.glassLine, ...(IOS ? shadow.soft : null) },
  ftIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: rim() },
  ftCardSide: { flex: 1, minWidth: 0 },
  ftCardRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  ftText: { alignItems: 'center', gap: 2, marginTop: space.xs, alignSelf: 'stretch' },
  ftTextRow: { flex: 1, minWidth: 0, gap: 2, paddingRight: space.xxxl },
  ftTitle: { fontFamily: font.medium },
  ftArrowWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ftArrowWrapRow: { alignItems: 'flex-end', paddingRight: space.lg },
  ftArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassLine,
    ...shadow.soft,
  },

  // Swipe
  swipeRoot: { alignSelf: 'stretch', flexGrow: 0 },
  swipeDisabled: { opacity: 0.45 },
  // The same flat brand fill as the primary Button (Payno: the swipe track is the primary pill).
  track: { height: TRACK, borderRadius: radius.pill, overflow: 'hidden', justifyContent: 'center', backgroundColor: palette.charcoal },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.pill, backgroundColor: palette.frostOnDark },
  labelWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', paddingLeft: KNOB + INSET + space.sm, paddingRight: 44 },
  label: { fontFamily: font.medium },
  endChevron: { position: 'absolute', right: space.lg, top: 0, bottom: 0, justifyContent: 'center' },
  knob: {
    position: 'absolute',
    left: INSET,
    top: INSET,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Always white (REFERENCE-COMPONENTS #29), also in dark mode where `surface` is a dark umber.
    backgroundColor: '#FFFFFF',
    ...shadow.soft,
  },

  // Confirm
  detailsTitle: { marginBottom: -space.xs, paddingHorizontal: space.xxs },

  // Success
  successHead: { alignItems: 'center', gap: space.xs, paddingTop: space.xs, paddingBottom: space.xxs },
  successTitle: { marginTop: space.sm },
  // Payno "Bill Paid": one frosted circle with a bright rim, a soft shadow and a thin green ✓.
  mark: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  markFrost: { backgroundColor: palette.frostStrong, borderColor: rim(), ...shadow.soft },
  markSheet: { backgroundColor: palette.surface, borderColor: palette.glassLine, ...shadow.soft },
}));
