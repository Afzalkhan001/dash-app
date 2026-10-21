// The live camera for the desk (expo-camera, bundled in Expo Go; on the web it needs localhost or HTTPS).
//   QrScanner     full-screen QR scanner: reception scans a guest's pass (back camera), the kiosk lets a
//                 guest hold their pass up to it (front camera). `onScanned` returns an error text to
//                 show and keep scanning, or nothing to stop.
//   PhotoCapture  full-screen live preview with a round shutter, then the web's visitShrink (≤ 640 px,
//                 ≤ 550 KB). "Use the camera app" falls back to the picker when the camera can't open.
// The camera is black with white words in both themes, like every phone's camera app. Nothing is saved:
// the photo lives in memory (and the image cache) until it is sent.

import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { Camera, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shrinkPhoto, type Selfie } from '@/features/desk/kiosk/selfie';
import { themedStyles } from '@/theme/themed';
import { radius, space } from '@/theme/tokens';
import { Button, haptic, Text } from '@/ui';

// Camera chrome colours: fixed, not themed (the preview is always dark).
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const SCRIM = 'rgba(0,0,0,0.55)';

type Facing = 'front' | 'back';

/** Asks for the camera, or explains how to allow it. Renders nothing once allowed. */
function useCameraGate() {
  const [perm, request] = useCameraPermissions();
  const granted = !!perm?.granted;
  const gate = !perm ? (
    <View style={styles.center}>
      <ActivityIndicator color={WHITE} />
    </View>
  ) : granted ? null : (
    <View style={styles.center}>
      <Text variant="bodyStrong" align="center" style={styles.white}>
        DASH needs the camera for this
      </Text>
      <Text variant="label" align="center" style={styles.dim}>
        {perm.canAskAgain ? 'Allow the camera when your phone asks.' : 'The camera is blocked for DASH. Turn it on in Settings.'}
      </Text>
      <Button
        variant="onPrimary"
        title={perm.canAskAgain ? 'Allow camera' : 'Open Settings'}
        onPress={() => (perm.canAskAgain ? void request() : void Linking.openSettings().catch(() => {}))}
      />
    </View>
  );
  return { granted, gate };
}

function TopBar({ title, onClose }: { title: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
      <Text variant="bodyStrong" numberOfLines={1} style={[styles.white, styles.flex]}>
        {title}
      </Text>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close camera" hitSlop={12} style={styles.close}>
        <X size={22} color={WHITE} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

export function QrScanner({
  visible,
  title,
  hint,
  facing = 'back',
  onScanned,
  onClose,
}: {
  visible: boolean;
  title: string;
  hint: string;
  facing?: Facing;
  /** Return an error text to show (scanning carries on), or nothing to finish. */
  onScanned: (data: string) => string | void | Promise<string | void>;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen" statusBarTranslucent>
      {visible ? <ScannerBody title={title} hint={hint} facing={facing} onScanned={onScanned} onClose={onClose} /> : null}
    </Modal>
  );
}

function ScannerBody({ title, hint, facing, onScanned, onClose }: { title: string; hint: string; facing: Facing; onScanned: (data: string) => string | void | Promise<string | void>; onClose: () => void }) {
  const { granted, gate } = useCameraGate();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [failed, setFailed] = useState('');
  const last = useRef({ data: '', at: 0 });

  const handle = async (r: BarcodeScanningResult) => {
    const data = String(r.data ?? '');
    const now = Date.now();
    // The same code is reported many times a second: act once, and wait 2 s before re-reading the same one.
    if (busy || (data === last.current.data && now - last.current.at < 2000)) return;
    last.current = { data, at: now };
    setBusy(true);
    haptic.select();
    try {
      const err = await onScanned(data);
      if (err) {
        haptic.error();
        setMsg(err);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      {granted && !failed ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing={facing}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={busy ? undefined : (r) => void handle(r)}
          onMountError={(e) => setFailed(e.message || 'The camera could not start.')}
        />
      ) : null}
      <TopBar title={title} onClose={onClose} />
      {gate ??
        (failed ? (
          <View style={styles.center}>
            <Text variant="bodyStrong" align="center" style={styles.white}>
              The camera could not start
            </Text>
            <Text variant="label" align="center" style={styles.dim}>
              {Platform.OS === 'web' ? 'This browser has no camera, or it is blocked. Type the code instead.' : failed}
            </Text>
            <Button variant="onPrimary" title="Type the code instead" onPress={onClose} />
          </View>
        ) : (
          <View style={styles.frameWrap} pointerEvents="none">
            <View style={styles.frame} />
          </View>
        ))}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
        {busy ? <ActivityIndicator color={WHITE} /> : null}
        <Text variant="body" align="center" style={styles.white} accessibilityLiveRegion="polite">
          {msg || hint}
        </Text>
      </View>
    </View>
  );
}

export function PhotoCapture({
  visible,
  title,
  facing = 'back',
  onPhoto,
  onFallback,
  onClose,
}: {
  visible: boolean;
  title: string;
  facing?: Facing;
  onPhoto: (p: Selfie) => void;
  /** The phone's camera app / photo picker, for when the live camera can't start. */
  onFallback?: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen" statusBarTranslucent>
      {visible ? <CaptureBody title={title} facing={facing} onPhoto={onPhoto} onFallback={onFallback} onClose={onClose} /> : null}
    </Modal>
  );
}

function CaptureBody({ title, facing, onPhoto, onFallback, onClose }: { title: string; facing: Facing; onPhoto: (p: Selfie) => void; onFallback?: () => void; onClose: () => void }) {
  const { granted, gate } = useCameraGate();
  const insets = useSafeAreaInsets();
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [failed, setFailed] = useState(false);

  const shoot = async () => {
    if (!cam.current || busy) return;
    setBusy(true);
    setMsg('');
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (!pic?.uri) throw new Error('');
      haptic.success();
      onPhoto(await shrinkPhoto({ uri: pic.uri, width: pic.width, height: pic.height }));
    } catch (e) {
      haptic.error();
      setMsg(e instanceof Error && e.message ? e.message : 'That photo could not be taken. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      {granted && !failed ? (
        <CameraView
          ref={cam}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mirror={facing === 'front'}
          onCameraReady={() => setReady(true)}
          onMountError={() => setFailed(true)}
        />
      ) : null}
      <TopBar title={title} onClose={onClose} />
      {gate ??
        (failed ? (
          <View style={styles.center}>
            <Text variant="bodyStrong" align="center" style={styles.white}>
              The camera could not start
            </Text>
            {onFallback ? <Button variant="onPrimary" title="Use the camera app" onPress={onFallback} /> : null}
          </View>
        ) : (
          <View style={styles.flex} />
        ))}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
        {msg ? (
          <Text variant="label" align="center" style={styles.white} accessibilityLiveRegion="polite">
            {msg}
          </Text>
        ) : null}
        {granted && !failed ? (
          <Pressable
            onPress={() => void shoot()}
            disabled={!ready || busy}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            accessibilityState={{ disabled: !ready || busy, busy }}
            style={[styles.shutter, (!ready || busy) && styles.dimmed]}>
            {busy ? <ActivityIndicator color={BLACK} /> : <Camera size={28} color={BLACK} strokeWidth={1.8} />}
          </Pressable>
        ) : null}
        {onFallback && granted && !failed ? (
          <Pressable onPress={onFallback} accessibilityRole="button" hitSlop={8}>
            <Text variant="label" style={styles.dim}>
              Use the camera app instead
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: BLACK },
  flex: { flex: 1, minWidth: 0 },
  white: { color: WHITE },
  dim: { color: 'rgba(255,255,255,0.75)' },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm, backgroundColor: SCRIM },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.xl },
  frameWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '70%', maxWidth: 300, aspectRatio: 1, borderRadius: radius.xl, borderWidth: 3, borderColor: WHITE },
  bottom: { alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingTop: space.md, backgroundColor: SCRIM },
  shutter: { width: 72, height: 72, borderRadius: 36, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)' },
  dimmed: { opacity: 0.5 },
}));
