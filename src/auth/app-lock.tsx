// Optional biometric app lock (Profile → App lock writes SecureStore 'dash.appLock' = '1').
// Sessions last 15 days, so this is what keeps a lost/borrowed phone from opening DASH: on cold
// start, and when coming back after 30 s in the background, the app is covered until the person
// passes Face ID / fingerprint / device passcode. If the device has no biometrics enrolled the lock
// never engages (nothing to unlock with).
//
// Look: the pearl canvas, a glass fingerprint disc, a one-line message, then one charcoal Unlock with
// a quiet "Sign out" text link under it (never disabled, so a stuck biometric prompt can't trap
// anyone). The cover appears instantly — it hides private data — and fades away once unlocked.
//
// Nothing may sit above the cover: every sheet is closed first, and the cover is drawn in its own
// full-screen Modal, presented last. iOS can't present a Modal while another one is up or leaving,
// so there the cover is drawn in the app's own layer until the sheets have gone, then moves into its
// Modal. The splash stays up until appLockPrecheck() has read the setting, so a cold start never
// shows the app unlocked for a moment.
//
// Privacy: with the lock on, leaving the app (iOS 'inactive', any 'background') puts up a plain cover
// with the logo at once (open sheets cover themselves too), so the app switcher's snapshot shows
// nothing. Coming back within 30 s only takes it away; after that the lock engages as above.

import { Image } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Fingerprint, LockOpen, LogOut } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { onSignOut, useSession } from '@/auth/session';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { Backdrop, Banner, Button, IconBadge, isDarkScheme, Reveal, Text, useLayout } from '@/ui';
import { closeAllSheets, isAnySheetPresented, setSheetsHidden } from '@/ui/sheet';

export const APP_LOCK_KEY = 'dash.appLock';
const RELOCK_AFTER_MS = 30_000;
// The splash never waits longer than this for the setting (the lock then engages as it reads it).
const PRECHECK_TIMEOUT_MS = 2500;
// How long the cover's Modal stays up while its content fades out after unlocking.
const FADE_MS = 200;

// Whether the lock cover is up (written from an effect). The first-sign-in tour never starts under it.
const cover = { showing: false };
// The last known App lock setting (with biometrics enrolled). The privacy cover needs it at once when the
// app leaves the foreground, with no time for an async read.
const setting = { on: false };

/** True while the app lock covers the app. */
export const isAppLockShowing = () => cover.showing;

/** The App lock switch changed (features/more/security-card.tsx): the privacy cover follows it at once. */
export function noteAppLockSetting(on: boolean) {
  setting.on = on;
}

async function lockEnabled() {
  if (Platform.OS === 'web') return false;
  try {
    if ((await SecureStore.getItemAsync(APP_LOCK_KEY)) !== '1') return (setting.on = false);
    return (setting.on = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()));
  } catch {
    return (setting.on = false);
  }
}

let precheck: Promise<boolean> | null = null;
/**
 * Reads the App lock setting once at launch (the root layout keeps the splash up until it is known), so
 * a signed-in cold start opens straight onto the cover. Never rejects; false after PRECHECK_TIMEOUT_MS.
 */
export function appLockPrecheck(): Promise<boolean> {
  precheck ??= Promise.race([lockEnabled(), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PRECHECK_TIMEOUT_MS))]);
  return precheck;
}

export function AppLockGate() {
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const kind = useSession((s) => s.kind);
  const signOut = useSession((s) => s.signOut);
  // Starts locked when the precheck found the lock on, so the first frame after the splash is the cover.
  const [locked, setLocked] = useState(() => !!kind && setting.on);
  // The plain cover while the app is out of the foreground (lock on, not yet locked).
  const [privacy, setPrivacy] = useState(false);
  // iOS: a sheet's Modal is still on screen, so the cover is drawn in the app's layer for now.
  const [inline, setInline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  const busy = useRef(false);

  const shown = (locked || privacy) && !!kind;
  // Keep the Modal up briefly after unlocking, so the cover fades instead of vanishing.
  const [leaving, setLeaving] = useState(false);
  const [wasShown, setWasShown] = useState(shown);
  if (shown !== wasShown) {
    setWasShown(shown);
    setLeaving(!shown);
  }
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(false), FADE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

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

  // Lock now: close every sheet (they are Modals and would sit above the cover), cover the app, ask.
  const engage = useCallback(() => {
    const waiting = isAnySheetPresented();
    const sheetsGone = closeAllSheets();
    setInline(waiting);
    setLocked(true);
    if (waiting) void sheetsGone.then(() => setInline(false));
    void unlock();
  }, [unlock]);

  useEffect(() => {
    cover.showing = shown;
  }, [shown]);

  // Open sheets hide their content while the privacy cover is up.
  useEffect(() => {
    setSheetsHidden(privacy && !!kind);
  }, [privacy, kind]);

  // Signing out (from anywhere, including an expired session) always drops the lock.
  useEffect(
    () =>
      onSignOut(() => {
        setLocked(false);
        setPrivacy(false);
      }),
    [],
  );

  // Cold start / sign-in.
  useEffect(() => {
    if (!kind) return;
    let alive = true;
    void lockEnabled().then((on) => {
      if (!alive) return;
      if (on) engage();
      else setLocked(false); // switched off, or biometrics removed: nothing to unlock with
    });
    return () => {
      alive = false;
    };
  }, [kind, engage]);

  // Leaving the app, and back from the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') backgroundedAt.current = Date.now();
      if ((s === 'background' || s === 'inactive') && kind && setting.on) {
        if (!cover.showing) setInline(isAnySheetPresented()); // iOS: the open sheet covers itself meanwhile
        setPrivacy(true);
      }
      if (s !== 'active') return;
      const away = backgroundedAt.current;
      backgroundedAt.current = null;
      if (away && Date.now() - away > RELOCK_AFTER_MS && kind) {
        void lockEnabled().then((on) => {
          if (on) engage();
          setPrivacy(false);
        });
      } else {
        setPrivacy(false);
        void lockEnabled(); // keeps the setting fresh for the next time the app leaves
      }
    });
    return () => sub.remove();
  }, [kind, engage]);

  if (!kind || (!shown && !leaving)) return null;

  const content = shown ? (
    <Animated.View
      exiting={FadeOut.duration(FADE_MS)}
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
      {locked ? (
        <>
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
        </>
      ) : null}
    </Animated.View>
  ) : null;

  if (inline) return content;
  const modal = (
    // Back on Android keeps the cover: only Unlock (or Sign out) takes it away.
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
      {content}
    </Modal>
  );
  // iOS: a Modal the lock can't close (the chat image viewer, the desk camera) stops the cover's own Modal
  // from showing, so the same cover is also drawn in the app's layer, where it still hides the app.
  return Platform.OS === 'ios' ? (
    <>
      {content}
      {modal}
    </>
  ) : (
    modal
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
