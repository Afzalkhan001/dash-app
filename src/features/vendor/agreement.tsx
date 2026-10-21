// Agreement signing pieces (web SignAgreementModal / SignaturePad / SignedAgreementView,
// dash.html ~32574-32846):
//   - where the signature goes, as one short line (sign_positions: one or more {page,x,y,signer}
//     spots; the vendor signs once and the same image appears at every vendor spot),
//   - capturing ONE signature, drawn or uploaded (PNG/JPG, max 2 MB) — the server accepts nothing
//     else (no typed-name option). The box is the one draw target (tap to sign, tap again to redo);
//     under it a single "Upload a photo instead" text link,
//   - the recorded signature image once signed.
// The signature boxes are "paper" in both themes (white; a warm off-white in dark mode, from the light
// tokens): the signature is dark ink (#0f172a, as on the website) or a photo of paper, and the box
// shows it the way it lands on the PDF.

import { Image } from 'expo-image';
import { ImageUp, PenLine } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { isApiError } from '@/api/client';
import { getAgreementSignature, type SignPosition, type VendorAgreement } from '@/api/vendor';
import { MAX_SIGNATURE_BYTES, SIGNATURE_MIME } from '@/features/vendor/constants';
import { type PickSource, pickFrom, UploadChooser } from '@/features/vendor/files';
import { dateIN } from '@/features/vendor/format';
import { SignaturePadSheet } from '@/features/vendor/signature-pad';
import { paperColor, paperInk } from '@/features/vendor/ui';
import { FileError } from '@/lib/files';
import { lightPalette, palette, radius, space } from '@/theme/tokens';
import { Button, FieldMessage, isDarkScheme, Skeleton, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';
export type CapturedSignature = { signatureType: 'drawn' | 'uploaded'; dataUrl: string };

// "page 2", "pages 1 and 3", "pages 1, 2 and 5"
function pagesText(spots: SignPosition[]) {
  const pages = [...new Set(spots.map((p) => p.page))].sort((a, b) => a - b);
  if (!pages.length) return '';
  if (pages.length === 1) return `page ${pages[0]}`;
  return `pages ${pages.slice(0, -1).join(', ')} and ${pages[pages.length - 1]}`;
}

const spotsOf = (a: VendorAgreement) =>
  (Array.isArray(a?.sign_positions) ? a.sign_positions : []).filter((p): p is SignPosition => !!p && Number.isFinite(Number(p.page)));

/** "You sign on page 2" / "You signed on pages 1 and 3" — empty when the draft has no vendor spots. */
export function mySpotsText(a: VendorAgreement): string {
  const mine = spotsOf(a).filter((p) => p.signer !== 'internal');
  if (!mine.length) return '';
  return `${a.signed_at ? 'You signed' : 'You sign'} on ${pagesText(mine)}`;
}

/** Tamada's own signature on the same agreement: done (with date), still to come, or none. */
export function countersignText(a: VendorAgreement): string {
  const internal = spotsOf(a).filter((p) => p.signer === 'internal');
  if (!internal.length) return '';
  const who = a.signer_name || 'Tamada';
  if (a.internal_signed_at) return `Signed by ${who} on ${dateIN(a.internal_signed_at)}`;
  return a.signed_at ? `Waiting for ${who} to sign` : `${who} signs after you`;
}

// ── Capture ────────────────────────────────────────────────────────────────────
export function SignatureCapture({ value, onChange, disabled }: { value: CapturedSignature | null; onChange: (s: CapturedSignature | null) => void; disabled?: boolean }) {
  const [padOpen, setPadOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(source: PickSource) {
    setError(null);
    try {
      const file = await pickFrom(source, ['image/png', 'image/jpeg']);
      if (!file) return;
      if (!SIGNATURE_MIME.includes(String(file.type || '').toLowerCase())) return setError('Your signature must be a PNG or JPG image.');
      if (file.size > MAX_SIGNATURE_BYTES) return setError('That image is too large. Please choose a smaller one.');
      setChoosing(false);
      onChange({ signatureType: 'uploaded', dataUrl: file.dataUrl });
    } catch (e) {
      setError(e instanceof FileError ? e.message : 'Could not open that image.');
    }
  }

  const draw = () => {
    setError(null);
    setChoosing(false);
    setPadOpen(true);
  };

  return (
    <View style={{ gap: space.sm }}>
      {/* The box is the one "sign here" target: tap to draw, tap again to redo. */}
      <Pressable
        onPress={draw}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={value ? 'Your signature. Tap to sign again' : 'Tap to sign here'}
        style={({ pressed }) => [styles.preview, value && styles.previewFilled, pressed && styles.previewPressed]}>
        {value ? (
          <Image source={{ uri: value.dataUrl }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
        ) : (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <PenLine size={22} color={paperInk()} strokeWidth={1.8} />
            <Text variant="label" color={paperInk()}>
              Tap to sign here
            </Text>
          </View>
        )}
      </Pressable>
      {value && !choosing ? (
        <Text variant="caption" muted align="center">
          Tap to sign again
        </Text>
      ) : null}
      {choosing ? (
        <>
          <UploadChooser onPick={pick} onCancel={() => setChoosing(false)} />
          <Text variant="caption" muted>
            PNG or JPG, up to 2 MB. Sign on plain white paper.
          </Text>
        </>
      ) : (
        <Button
          title="Upload a photo instead"
          variant="text"
          size="md"
          icon={<ImageUp />}
          onPress={() => {
            setError(null);
            setChoosing(true);
          }}
          disabled={disabled}
          style={{ alignSelf: 'center' }}
        />
      )}
      <FieldMessage error={error} />
      <SignaturePadSheet
        visible={padOpen}
        onClose={() => setPadOpen(false)}
        onDone={(dataUrl) => {
          setPadOpen(false);
          onChange({ signatureType: 'drawn', dataUrl });
        }}
      />
    </View>
  );
}

// ── The recorded signature ────────────────────────────────────────────────────────
export function RecordedSignature({ agreementId }: { agreementId: string }) {
  const [state, setState] = useState<{ uri: string } | { error: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void getAgreementSignature(agreementId).then((r) => {
      if (!alive) return;
      if (isApiError(r)) setState({ error: r.error });
      else if (!r?.fileData) setState({ error: 'The signature image is not available.' });
      else setState({ uri: `data:${r.mimeType || 'image/png'};base64,${r.fileData}` });
    });
    return () => {
      alive = false;
    };
  }, [agreementId]);

  if (!state) return <Skeleton height={110} radius={radius.md} />;
  if ('error' in state) {
    return (
      <Text variant="label" muted>
        {state.error}
      </Text>
    );
  }
  return (
    <View style={[styles.preview, styles.previewFilled, { height: 110 }]} accessible accessibilityLabel="Your recorded signature">
      <Image source={{ uri: state.uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
    </View>
  );
}

const styles = themedStyles(() => ({
  preview: {
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: isDarkScheme() ? lightPalette.textFaint : palette.textFaint,
    backgroundColor: paperColor(),
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xs,
    overflow: 'hidden',
  },
  previewFilled: { borderStyle: 'solid', borderColor: isDarkScheme() ? palette.glassLine : palette.hairline },
  previewPressed: { backgroundColor: isDarkScheme() ? lightPalette.surfaceSunken : palette.surfaceMuted },
}));
