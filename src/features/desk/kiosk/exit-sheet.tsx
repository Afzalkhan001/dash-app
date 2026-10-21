// Leaving kiosk mode (web: the "Exit kiosk" password prompt, dash.html:35880-35900).
//   1. The phone's own fingerprint, face or PIN, when it has one (PLAN D6): a Visitor Manager who signs in
//      with a WhatsApp code may have no DASH password at all, and a visitor can't pass this.
//   2. Or the DASH password, checked by the server (POST /visitors/kiosk/exit): 403 "That password is not
//      right." shows under the field (never a sign-out); 10 tries per 10 minutes.
// Nothing is changed or sent by leaving, so no swipe is needed.

import * as LocalAuthentication from 'expo-local-authentication';
import { Fingerprint, Lock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { kioskExit } from '@/api/desk';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { ActionRow, Button, haptic, PillField, Sheet, Text } from '@/ui';

async function deviceLockAvailable() {
  if (Platform.OS === 'web') return false;
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export function KioskExitSheet({ visible, onClose, onExited }: { visible: boolean; onClose: () => void; onExited: () => void }) {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void deviceLockAvailable().then((ok) => {
      if (alive) setDevice(ok);
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  const close = () => {
    if (busy) return;
    setPw('');
    setMsg('');
    onClose();
  };
  const done = () => {
    haptic.success();
    setPw('');
    setMsg('');
    onExited();
  };

  const withDevice = async () => {
    try {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Exit kiosk mode', cancelLabel: 'Stay' });
      if (r.success) done();
    } catch {
      setMsg('Couldn’t check your fingerprint or PIN. Use your password instead.');
    }
  };

  const withPassword = async () => {
    if (!pw || busy) return;
    setBusy(true);
    setMsg('');
    try {
      await kioskExit(pw);
      setBusy(false);
      done();
    } catch (e) {
      setBusy(false);
      haptic.error();
      setMsg(e instanceof Error ? e.message : 'That password is not right.');
    }
  };

  return (
    <Sheet visible={visible} onClose={close} title="Exit kiosk mode" subtitle={device ? 'Use this phone’s lock, or your DASH password.' : 'Enter your DASH password to leave.'}>
      <View style={styles.body}>
        {device ? (
          <>
            <Button variant="primary" size="lg" title="Use fingerprint or PIN" icon={<Fingerprint />} onPress={() => void withDevice()} />
            <Text variant="label" muted align="center">
              Or use your password
            </Text>
          </>
        ) : null}
        <PillField
          icon={Lock}
          placeholder="Password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          value={pw}
          onChangeText={(t) => {
            setPw(t);
            if (msg) setMsg('');
          }}
          onSubmitEditing={() => void withPassword()}
          returnKeyType="go"
          error={msg || null}
          accessibilityLabel="DASH password"
        />
        <ActionRow context="sheet">
          <Button variant="ghost" title="Stay" onPress={close} disabled={busy} />
          <Button variant={device ? 'accent' : 'primary'} title="Exit" onPress={() => void withPassword()} loading={busy} disabled={!pw} />
        </ActionRow>
      </View>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  body: { gap: space.md, paddingBottom: space.sm },
}));
