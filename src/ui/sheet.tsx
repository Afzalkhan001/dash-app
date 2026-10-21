// Bottom sheet built on RN Modal (works in Expo Go, no extra native module) — docs/DESIGN.md §7.15.
// The backdrop fades with the Modal and the sheet springs up from the bottom on the UI thread
// (Reanimated, motion.sheet); with Reduce Motion it only fades. Tapping the backdrop or the handle
// closes it — or, with `dirty`, first asks before discarding changes.
// MenuSheet is the overflow menu ("•••" → a list of actions).

import { Check, type LucideIcon, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { themedStyles } from '@/theme/themed';
import { layout, motion, palette, radius, shadow, space } from '@/theme/tokens';
import { IconBadge, ListCard, ListRow } from '@/ui/list';
import { isDarkScheme, SurfaceContext, withAlpha } from '@/ui/surface';
import { Text } from '@/ui/text';

const SHEET_SPRING = motion.sheet;
/** How far a floatingClose sheet sits in from the screen edges. */
const FLOAT_INSET = space.xs;

// How many sheets are open right now (written from effects only). The first-sign-in tour waits while
// any is up, because a sheet's Modal would sit on top of the tour.
const openSheets = { count: 0 };

/** True while any Sheet (or MenuSheet) is showing. */
export const isAnySheetOpen = () => openSheets.count > 0;

/**
 * Bottom sheet: title (1 line) + subtitle (2 lines), a scrolling body (gap 16) and an optional pinned
 * `footer` (one Button, or `<ActionRow context="sheet">`). Holds at most ~6 form fields — longer
 * forms belong on a pushed screen. `dirty` asks "Discard changes?" before closing.
 * `floatingClose` (Payno confirm / success sheets) swaps the handle for a round × floating above the
 * sheet and insets the sheet as a card rounded on every corner.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  scroll = true,
  dirty,
  floatingClose,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  /** When true, closing by backdrop / handle / back button asks before discarding. */
  dirty?: boolean;
  /** A round × above the sheet instead of the handle; the sheet floats inset from the screen edges. */
  floatingClose?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const y = useSharedValue(reduced ? 0 : height);

  useEffect(() => {
    if (!visible) return;
    openSheets.count += 1;
    return () => {
      openSheets.count = Math.max(0, openSheets.count - 1);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      // Park the sheet off-screen once the Modal's fade-out has finished, so the next open starts there.
      if (reduced) return;
      const t = setTimeout(() => y.set(height), 350);
      return () => clearTimeout(t);
    }
    if (reduced) {
      y.set(0);
      return;
    }
    y.set(height);
    y.set(withSpring(0, SHEET_SPRING));
  }, [visible, height, reduced, y]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  const requestClose = () => {
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert('Discard changes?', 'What you entered here will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  };

  // With a pinned footer, a body that scrolls fades out above the footer until its end is reached, so
  // content under the swipe / button (a typed confirmation, the end of a card) visibly continues.
  const [box, setBox] = useState({ view: 0, content: 0, y: 0 });
  const more = !!footer && scroll && hasMore(box);
  // Re-render only when "is there more below" flips, not on every scroll frame.
  const track = (patch: Partial<typeof box>) => setBox((b) => {
    const next = { ...b, ...patch };
    return hasMore(next) === hasMore(b) && patch.y != null ? b : next;
  });
  const sheetBg = isDarkScheme() ? palette.surface : palette.canvasTop;

  const float = !!floatingClose;
  const bottomPad = float ? Math.max(insets.bottom - FLOAT_INSET, 0) + space.md : insets.bottom + space.sm;
  const maxHeight = Math.round(height * 0.92);

  const content = (
    <>
      {float ? (
        <View style={styles.floatTop} />
      ) : (
        <Pressable onPress={requestClose} hitSlop={12} style={styles.handleArea} accessibilityRole="button" accessibilityLabel="Close">
          <View style={styles.handle} />
        </Pressable>
      )}
      {title || subtitle ? (
        <View style={styles.head}>
          {title ? (
            <Text variant="heading" numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="label" muted numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      {scroll ? (
        <View style={styles.scrollWrap}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={[styles.body, !footer && { paddingBottom: bottomPad }]}
            showsVerticalScrollIndicator={!!footer && more}
            scrollEventThrottle={32}
            onLayout={footer ? (e) => track({ view: Math.round(e.nativeEvent.layout.height) }) : undefined}
            onContentSizeChange={footer ? (_w, h) => track({ content: Math.round(h) }) : undefined}
            onScroll={footer ? (e) => track({ y: Math.round(e.nativeEvent.contentOffset.y) }) : undefined}>
            {children}
          </ScrollView>
          {more ? <LinearGradient colors={[withAlpha(sheetBg, 0), sheetBg]} style={styles.moreFade} pointerEvents="none" /> : null}
        </View>
      ) : (
        <View style={[styles.body, !footer && { paddingBottom: bottomPad }]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: bottomPad }]}>{footer}</View> : null}
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={requestClose} statusBarTranslucent navigationBarTranslucent>
      <SurfaceContext.Provider value="sheet">
        {/* The sheet sits in a flex column that ends above the keyboard and starts below the status bar,
            so it can never grow past the top of the screen — the body scrolls instead. */}
        <KeyboardAvoidingView style={[styles.frame, { paddingTop: insets.top + space.lg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.backdrop} onPress={requestClose} accessibilityRole="button" accessibilityLabel="Close" />
          {float ? (
            <Animated.View style={[styles.floatWrap, { maxHeight }, slide]} accessibilityViewIsModal>
              <Pressable onPress={requestClose} style={styles.floatClose} accessibilityRole="button" accessibilityLabel="Close">
                <X size={22} color={palette.ink} strokeWidth={1.8} />
              </Pressable>
              <View style={[styles.sheet, styles.sheetFloat]}>{content}</View>
            </Animated.View>
          ) : (
            <Animated.View style={[styles.sheet, { maxHeight }, slide]} accessibilityViewIsModal>
              {content}
            </Animated.View>
          )}
        </KeyboardAvoidingView>
      </SurfaceContext.Provider>
    </Modal>
  );
}

/** A scrolling sheet body still has content below its visible part. */
function hasMore(b: { view: number; content: number; y: number }) {
  return b.view > 0 && b.content > b.view + 4 && b.y + b.view < b.content - 4;
}

export type MenuItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  hint?: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** The current choice in a picker menu: a ✓ on the right (and "selected" for screen readers). */
  selected?: boolean;
};

/**
 * Overflow menu in a sheet, opened by a MoreHorizontal IconButton. 1–7 items, destructive last. As a
 * picker (a filter, a sort) mark the current item `selected` (a ✓) — never "(showing)" in the label.
 * Pressing an item closes the sheet, then runs `onPress` 280 ms later (after the close animation).
 */
export function MenuSheet({
  visible,
  onClose,
  title,
  subtitle,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  items: MenuItem[];
}) {
  const list = Array.isArray(items) ? items : [];
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <ListCard>
        {list.map((it) => {
          const danger = it.tone === 'danger';
          const Icon = it.icon;
          return (
            <ListRow
              key={it.key}
              left={
                Icon ? (
                  <IconBadge bg={danger ? palette.dangerSoft : palette.primarySoft}>
                    <Icon size={20} color={danger ? palette.dangerInk : palette.primaryText} strokeWidth={1.8} />
                  </IconBadge>
                ) : undefined
              }
              title={it.label}
              titleColor={danger ? palette.dangerInk : undefined}
              subtitle={it.hint}
              subtitleLines={2}
              disabled={it.disabled}
              selected={it.selected}
              right={it.selected ? <Check size={20} color={palette.primaryText} strokeWidth={2.2} /> : undefined}
              onPress={() => {
                onClose();
                setTimeout(it.onPress, 280);
              }}
            />
          );
        })}
      </ListCard>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: palette.overlay },
  frame: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    flexShrink: 1,
    // Light: the near-white canvas top. Dark: the raised card colour, so the sheet lifts above the dimmed
    // screen and its fields (surfaceMuted) read as recessed, as they do in light mode.
    backgroundColor: isDarkScheme() ? palette.surface : palette.canvasTop,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: palette.glassEdge,
  },
  handleArea: { alignItems: 'center', justifyContent: 'center', minHeight: 24, paddingTop: 10, paddingBottom: 9 },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: withAlpha(palette.ink, 0.14) },
  head: { paddingHorizontal: layout.sheetPad, paddingBottom: space.sm, gap: 2 },
  body: { paddingHorizontal: layout.sheetPad, paddingBottom: space.md, gap: space.md },
  scrollWrap: { flexShrink: 1, minHeight: 0 },
  moreFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: space.xxl },
  footer: { paddingHorizontal: layout.sheetPad, paddingTop: space.sm, gap: space.sm },
  // floatingClose: the × rides above an inset card rounded on every corner.
  floatWrap: { flexShrink: 1, marginHorizontal: FLOAT_INSET, marginBottom: FLOAT_INSET },
  floatClose: {
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassEdge,
    ...shadow.float,
  },
  sheetFloat: { borderRadius: radius.xxl, borderBottomWidth: 1 },
  floatTop: { height: space.lg },
}));
