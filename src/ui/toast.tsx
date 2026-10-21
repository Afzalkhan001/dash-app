// Toast (docs/DESIGN.md §7.22): a short charcoal capsule at the top of the screen that confirms a
// success and fades away after 2.6 s (tap to dismiss). Only for replacing one-button success alerts —
// questions and errors stay as Alerts / inline Banners.
//
//   toast.show('Request sent');                 // success (default)
//   toast.show('Saved as draft', 'info');
// Mount <ToastHost /> once, in src/app/_layout.tsx.

import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { palette, shadow, space } from '@/theme/tokens';
import { Text } from '@/ui/text';

import { themedStyles } from '@/theme/themed';
export type ToastTone = 'success' | 'info' | 'danger';
type ToastItem = { id: number; message: string; tone: ToastTone };

const useToastStore = create<{ current: ToastItem | null; set: (t: ToastItem | null) => void }>()((set) => ({
  current: null,
  set: (t) => set({ current: t }),
}));

let nextId = 1;

export const toast = {
  show(message: string, tone: ToastTone = 'success') {
    if (!message) return;
    useToastStore.getState().set({ id: nextId++, message, tone });
    AccessibilityInfo.announceForAccessibility(message);
  },
  hide() {
    useToastStore.getState().set(null);
  },
};

const VISIBLE_MS = 2600;

function toastIn() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -12 }] },
    animations: {
      opacity: withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) }),
      transform: [{ translateY: withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) }) }],
    },
  };
}

function toastOut() {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }),
      transform: [{ translateY: withTiming(-8, { duration: 200, easing: Easing.in(Easing.cubic) }) }],
    },
  };
}

/** Renders the current toast. Mount once near the root, inside SafeAreaProvider. */
export function ToastHost() {
  const current = useToastStore((s) => s.current);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (!current) return;
    const id = current.id;
    const timer = setTimeout(() => {
      if (useToastStore.getState().current?.id === id) useToastStore.getState().set(null);
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [current]);

  const Icon = current?.tone === 'danger' ? CircleAlert : current?.tone === 'info' ? Info : CircleCheck;
  const iconColor = current?.tone === 'danger' ? '#FF9C94' : current?.tone === 'info' ? palette.onPrimary : palette.accent;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + space.xs, alignItems: 'center' }]}>
      {current ? (
        <Animated.View key={current.id} entering={toastIn} exiting={toastOut} style={{ maxWidth: width - 32 }}>
          <Pressable onPress={toast.hide} accessibilityRole="alert" accessibilityLabel={current.message} style={styles.toast}>
            <Icon size={16} color={iconColor} strokeWidth={2.2} />
            <Text variant="labelStrong" color={palette.onPrimary} numberOfLines={2} style={{ flexShrink: 1 }}>
              {current.message}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: palette.charcoal,
    ...shadow.float,
  },
}));
