// Optional biometric app lock (Profile → App lock writes SecureStore 'dash.appLock' = '1').
// Sessions last 15 days, so this is what keeps a lost/borrowed phone from opening DASH: on cold
// start, and when coming back after 30 s in the background, the app is covered until the person
// passes Face ID / fingerprint / device passcode. If the device has no biometrics enrolled the lock
// never engages (nothing to unlock with).
//
// Look: the pearl canvas, a glass fingerprint disc, a one-line message, then one charcoal Unlock with
// a quiet "Sign out" text link under it (never disabled, so a stuck biometric prompt can't trap
// anyone). The cover appears instantly — it hides private data — and fades away once unlocked.

import { Image } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Fingerprint, LockOpen, LogOut } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { onSignOut, useSession } from '@/auth/session';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { Backdrop, Banner, Button, IconBadge, isDarkScheme, Reveal, Text, useLayout } from '@/ui';

export const APP_LOCK_KEY = 'dash.appLock';
const RELOCK_AFTER_MS = 30_000;

// Whether the lock cover is up (written from an effect). The first-sign-in tour never starts under it.
const cover = { showing: false };

/** True while the app lock covers the app. */
export const isAppLockShowing = () => cover.showing;

async function lockEnabled() {
  try {
    if ((await SecureStore.getItemAsync(APP_LOCK_KEY)) !== '1') return false;
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export function AppLockGate() {
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const kind = useSession((s) => s.kind);
  const signOut = useSession((s) => s.signOut);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  const busy = useRef(false);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock DASH', cancelLabel: 'Cancel' });
      if (r.success) setLocked(false);
      else if (r.error !== 'user_cancel' && r.error !== 'system_cancel') setError('That didn’t work. Try again.');
    } catch {
      setError('That didn’t work. Try again.');
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    cover.showing = locked && !!kind;
  }, [locked, kind]);

  // Signing out (from anywhere, including an expired session) always drops the lock.
  useEffect(() => onSignOut(() => setLocked(false)), []);

  // Cold start / sign-in.
  useEffect(() => {
    if (!kind) return;
    let alive = true;
    void lockEnabled().then((on) => {
      if (alive && on) {
        setLocked(true);
        void unlock();
      }
    });
    return () => {
      alive = false;
    };
  }, [kind, unlock]);

  // Back from background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') backgroundedAt.current = Date.now();
      if (s === 'active' && backgroundedAt.current && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS && kind) {
        backgroundedAt.current = null;
        void lockEnabled().then((on) => {
          if (on) {
            setLocked(true);
            void unlock();
          }
        });
      }
    });
    return () => sub.remove();
  }, [kind, unlock]);

  if (!locked || !kind) return null;
  return (
    <Animated.View
      exiting={FadeOut.duration(200)}
      accessibilityViewIsModal
      style={[styles.cover, { paddingTop: insets.top + space.xxl, paddingBottom: Math.max(insets.bottom, space.md) + space.xs, paddingHorizontal: gutter }]}>
      <Backdrop />
      {/* The wordmark is black; in dark mode it is drawn in the parchment ink so it shows on the espresso canvas. */}
      <Image
        source={require('@/assets/images/brand-logo-stacked.png')}
        style={styles.logo}
        contentFit="contain"
        tintColor={isDarkScheme() ? palette.ink : undefined}
        accessibilityLabel="DASH"
      />
      <View style={styles.spacer} />
      <Reveal style={styles.message}>
        <IconBadge size={88} style={styles.badge}>
          <Fingerprint size={36} color={palette.primaryText} strokeWidth={1.6} />
        </IconBadge>
        <Text variant="title" align="center" accessibilityRole="header">
          DASH is locked
        </Text>
        <Text variant="body" muted align="center" style={styles.body}>
          Use your fingerprint, face or phone passcode.
        </Text>
        {error ? <Banner tone="danger" message={error} style={styles.error} /> : null}
      </Reveal>
      <View style={styles.spacer} />
      <Reveal index={1} style={styles.actions}>
        <Button title="Unlock" icon={<LockOpen />} onPress={unlock} />
        <Button title="Sign out" variant="text" size="md" icon={<LogOut />} onPress={() => signOut()} style={styles.signOut} />
      </Reveal>
    </Animated.View>
  );
}

const styles = themedStyles(() => ({
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.canvas,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  logo: { width: 180, height: 70 },
  spacer: { flex: 1, minHeight: space.xl },
  message: { alignItems: 'center', gap: space.sm, alignSelf: 'stretch' },
  badge: { marginBottom: space.xs },
  body: { maxWidth: 320 },
  error: { alignSelf: 'stretch', marginTop: space.xxs },
  actions: { alignSelf: 'stretch', gap: space.xs },
  signOut: { alignSelf: 'center' },
}));
