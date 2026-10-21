// The bill for a claim, camera first: one big "Take a photo" tile, and a quiet "Upload a photo or PDF"
// link under it for a bill that is already on the phone (gallery photo, or a PDF up to 8 MB). Photos
// are resized and compressed on the phone (lib/files) so they stay under the server's body limit.
//
// Once a file is attached the tile becomes a row with its thumbnail, a plain title ("Bill photo" for
// a photo — camera file names mean nothing to people — or the PDF's own name) and its size, and a remove
// button; removing it brings the camera tile back. If camera access was turned off, the alert offers
// to open Settings. The upload choice is a native Alert, not a sheet,
// because this picker also sits inside the "Fix and resend" sheet.

import { Image } from 'expo-image';
import { Camera, FileText, Upload, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, View } from 'react-native';

import { MAX_DATA_URL_CHARS } from '@/api/reimbursements';
import { FileError, pickDocument, pickImage, type PickedFile } from '@/lib/files';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import { FIELD_LABEL_INSET, Button, FieldMessage, haptic, hitSlopFor, isDarkScheme, ModuleBadge, PressableScale, Text, useSurface, withAlpha } from '@/ui';

import { themedStyles } from '@/theme/themed';
export const fileSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const REMOVE = 32;
const TOO_BIG = 'That file is too big. Try a smaller one.';
// lib/files throws a FileError with this wording when camera access is denied.
const isCameraDenied = (e: unknown) => e instanceof FileError && /camera permission/i.test(e.message);

export function ReceiptPicker({
  label = 'Bill photo',
  value,
  onChange,
  error,
}: {
  label?: string;
  value: PickedFile | null;
  onChange: (f: PickedFile | null) => void;
  error?: string | null;
}) {
  const [busy, setBusy] = useState<'camera' | 'library' | 'pdf' | null>(null);
  const surface = useSurface();
  // The kit field fill: solid in a sheet; on the canvas a white veil (light) or the stronger frost (dark).
  const fill = surface === 'sheet' ? palette.surfaceMuted : isDarkScheme() ? palette.frostStrong : withAlpha(palette.surface, 0.7);

  const pick = async (kind: 'camera' | 'library' | 'pdf') => {
    if (busy) return;
    setBusy(kind);
    try {
      const f = kind === 'pdf' ? await pickDocument(['application/pdf']) : await pickImage(kind);
      if (!f) return;
      if (String(f.dataUrl || '').length > MAX_DATA_URL_CHARS) {
        haptic.warning();
        Alert.alert('File too big', TOO_BIG);
        return;
      }
      haptic.select();
      onChange(f);
    } catch (e: any) {
      haptic.error();
      if (isCameraDenied(e)) {
        Alert.alert('Allow the camera', 'Turn on the camera for DASH in Settings to photograph the bill.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => void Linking.openSettings().catch(() => {}) },
        ]);
        return;
      }
      Alert.alert('Couldn’t add the file', e instanceof FileError ? e.message : e?.message || 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  const upload = () =>
    // Android lays three buttons out as neutral (far left), negative, positive (far right), so Cancel
    // goes first and the usual choice last; iOS still moves the cancel-style button to the bottom.
    Alert.alert('Upload the bill', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'PDF file', onPress: () => void pick('pdf') },
      { text: 'Photo from gallery', onPress: () => void pick('library') },
    ]);

  const isImage = !!value && String(value.type || '').startsWith('image/');
  const spinner = busy ? (
    <View style={styles.busy} pointerEvents="none" accessibilityLiveRegion="polite">
      <ActivityIndicator color={palette.primaryText} />
      <Text variant="caption" muted>
        Adding…
      </Text>
    </View>
  ) : null;

  return (
    <View style={styles.wrap}>
      <Text variant="labelStrong" muted numberOfLines={2} style={FIELD_LABEL_INSET}>
        {label}
      </Text>
      {value ? (
        <View style={[styles.box, styles.chosen, { backgroundColor: fill }, !!error && styles.boxError]}>
          {isImage ? (
            <Image source={{ uri: value.uri }} style={styles.thumb} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.thumb, styles.docThumb]}>
              <FileText size={22} color={moduleTone.expenses.fg} />
            </View>
          )}
          <View style={styles.fileText}>
            <Text variant="bodyStrong" numberOfLines={1} style={styles.shrink}>
              {isImage ? 'Bill photo' : value.name || 'Bill'}
            </Text>
            <Text variant="caption" muted numberOfLines={1} style={styles.shrink}>
              {isImage ? 'Photo' : 'PDF'} · {fileSize(Number(value.size) || 0)}
            </Text>
          </View>
          <Pressable
            hitSlop={hitSlopFor(REMOVE)}
            onPress={() => onChange(null)}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityLabel="Remove the bill"
            style={({ pressed }) => [styles.remove, pressed && { backgroundColor: palette.surfaceMuted }]}>
            <X size={16} color={palette.textMuted} strokeWidth={2.2} />
          </Pressable>
        </View>
      ) : (
        <PressableScale
          onPress={() => void pick('camera')}
          disabled={!!busy}
          scaleTo={0.985}
          accessibilityRole="button"
          accessibilityLabel="Take a photo of the bill"
          style={[styles.box, styles.camera, { backgroundColor: fill }, !!error && styles.boxError]}>
          <ModuleBadge module="expenses" icon={Camera} size={52} />
          <Text variant="bodyStrong" align="center" numberOfLines={1}>
            Take a photo
          </Text>
          <Text variant="caption" muted align="center" numberOfLines={1}>
            of the bill or receipt
          </Text>
          {spinner}
        </PressableScale>
      )}
      {!value ? <Button title="Upload a photo or PDF" variant="text" size="md" icon={<Upload />} disabled={!!busy} onPress={upload} style={styles.upload} /> : null}
      <FieldMessage error={error} />
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { gap: 6 },
  box: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: withAlpha(palette.ink, 0.07),
    padding: space.sm,
  },
  boxError: { borderWidth: 1.5, borderColor: palette.dangerInk },
  camera: { alignItems: 'center', justifyContent: 'center', gap: space.xxs, minHeight: 132, paddingVertical: space.md },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, flexShrink: 0 },
  docThumb: { backgroundColor: moduleTone.expenses.bg, alignItems: 'center', justifyContent: 'center' },
  fileText: { flex: 1, minWidth: 0, gap: 2 },
  shrink: { flexShrink: 1 },
  remove: {
    width: REMOVE,
    height: REMOVE,
    borderRadius: REMOVE / 2,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassLine,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  upload: { alignSelf: 'center' },
  busy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.lg,
    backgroundColor: withAlpha(palette.surface, 0.9),
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
}));
