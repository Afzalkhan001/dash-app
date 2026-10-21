// The App lock switch, as one list row on the More tab (next to Change password; More is the only
// place for both, so there is never a second switch showing a stale value). The row follows the list
// anatomy (docs/DESIGN.md §7.12) and is one switch for touch and screen readers: the whole row toggles
// it and the Switch inside only shows the state, so there is a single 'switch' stop and a full-size
// target.
//
// App lock is only the setting here: SecureStore 'dash.appLock' = '1' when on (key removed when
// off). The lock screen itself is src/auth/app-lock.tsx, which reads the same key. Turning it on
// or off asks for the face / fingerprint / passcode first, so someone holding an unlocked phone
// cannot quietly switch it off.

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Fingerprint, ScanFace } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Switch, View } from 'react-native';

import { APP_LOCK_KEY } from '@/auth/app-lock';
import { themedStyles } from '@/theme/themed';
import { palette, radius } from '@/theme/tokens';
import { haptic, isDarkScheme, ListRow, ModuleBadge, Skeleton } from '@/ui';

type Support = { hardware: boolean; enrolled: boolean; face: boolean };

function methodName(s: Support | null) {
  if (!s) return 'Face / fingerprint';
  if (Platform.OS === 'ios') return s.face ? 'Face ID' : 'Touch ID';
  return s.face ? 'Face unlock' : 'Fingerprint';
}

export function useAppLock() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [support, setSupport] = useState<Support | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [stored, hardware, enrolled, types] = await Promise.all([
          SecureStore.getItemAsync(APP_LOCK_KEY),
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
        ]);
        if (!alive) return;
        setEnabled(stored === '1');
        setSupport({ hardware, enrolled, face: types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) });
      } catch {
        if (alive) {
          setEnabled(false);
          setSupport({ hardware: false, enrolled: false, face: false });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const verify = async (promptMessage: string) => {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel' });
    return r.success;
  };

  const toggle = async (next: boolean) => {
    if (busy) return;
    if (next && !(support?.hardware && support.enrolled)) {
      Alert.alert('Set up a screen lock first', 'Add a fingerprint, face or passcode in your phone’s Settings, then try again.');
      return;
    }
    setBusy(true);
    try {
      if (!(await verify(next ? 'Turn on app lock' : 'Turn off app lock'))) return;
      if (next) await SecureStore.setItemAsync(APP_LOCK_KEY, '1');
      else await SecureStore.deleteItemAsync(APP_LOCK_KEY);
      setEnabled(next);
      haptic.success();
    } catch {
      haptic.error();
      Alert.alert('Couldn’t change app lock', 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return { enabled, support, busy, toggle, method: methodName(support) };
}

type AppLock = ReturnType<typeof useAppLock>;

/** The App lock switch as one list row (on More). Pass the screen's `useAppLock()`. */
export function AppLockRow({ lock }: { lock: AppLock }) {
  const available = !!(lock.support?.hardware && lock.support.enrolled);
  const Icon = lock.support?.face ? ScanFace : Fingerprint;
  const lockHint =
    lock.support === null ? 'Checking this phone…' : available ? `Ask for ${lock.method} to open DASH` : 'Needs a screen lock on this phone';
  const lockLoading = lock.enabled === null;
  const lockDisabled = lockLoading || lock.busy;
  // The off track: the sunken ivory in light mode; in dark the sunken tone vanishes on the card, so the
  // hairline tone. The thumb stays white on both tracks (onAccent), as the system switch draws it.
  const offTrack = isDarkScheme() ? palette.hairline : palette.surfaceSunken;
  return (
    <Pressable
      onPress={() => void lock.toggle(!lock.enabled)}
      disabled={lockDisabled}
      accessibilityRole="switch"
      accessibilityLabel="App lock"
      accessibilityHint={lockHint}
      accessibilityState={{ checked: !!lock.enabled, disabled: lockDisabled, busy: lock.busy }}
      style={({ pressed }) => [styles.toggleRow, pressed && styles.toggleRowPressed]}>
      <ListRow
        left={<ModuleBadge module="security" icon={Icon} />}
        title="App lock"
        subtitle={lockHint}
        subtitleLines={2}
        right={
          lockLoading ? (
            <Skeleton width={51} height={31} radius={16} />
          ) : (
            // Display only: the row above handles the tap, so a press can't toggle it twice.
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Switch
                value={!!lock.enabled}
                disabled={lock.busy}
                trackColor={{ false: offTrack, true: palette.accentDeep }}
                thumbColor={palette.onAccent}
                ios_backgroundColor={offTrack}
              />
            </View>
          )
        }
      />
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  toggleRow: { borderRadius: radius.md },
  toggleRowPressed: { backgroundColor: palette.pressedTint },
}));
