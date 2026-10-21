// Files in the vendor portal.
//   IN:  an inline Camera / Photos / Files chooser (no modal on top of a modal) and the document
//        upload row from the registration wizard (web VPDocRow) → POST /vendor/documents.
//   OUT: every vendor file comes back as JSON { fileName, mimeType, fileData(base64) }. Documents and
//        bills open in a sheet (images are previewed there); PDFs are written to the cache and handed to
//        the share sheet, where the phone's own PDF app / Files / WhatsApp can take them. The agreement
//        PDF skips the sheet: one tap on its row hands it straight to the phone (openAgreementDraft).

import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Camera, ChevronRight, FileText, FolderOpen, Images, Share2, Upload, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';

import { type ApiResult, isApiError } from '@/api/client';
import { type FilePayload, getAgreementDraft, getVendorBillFile, getVendorDocument, uploadVendorDocument, VENDOR_ME_KEY } from '@/api/vendor';
import { DOC_HINT, DOC_LABEL, docStatus, MAX_UPLOAD_BYTES, UPLOAD_MIME } from '@/features/vendor/constants';
import { withExtension } from '@/features/vendor/format';
import { useLastValue, useOpenCount } from '@/features/vendor/ui';
import { FileError, pickDocument, pickImage, type PickedFile, saveDataUrl, shareFile } from '@/lib/files';
import { palette, radius, space } from '@/theme/tokens';
import { Banner, Button, ErrorState, FieldMessage, haptic, IconButton, ModuleBadge, Sheet, Skeleton, StatusPill, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';
// ── Picking ──────────────────────────────────────────────────────────────────
export type PickSource = 'camera' | 'library' | 'file';

export async function pickFrom(source: PickSource, fileTypes: string[]): Promise<PickedFile | null> {
  if (source === 'file') return pickDocument(fileTypes);
  return pickImage(source);
}

export function UploadChooser({ onPick, onCancel, busy }: { onPick: (s: PickSource) => void; onCancel: () => void; busy?: boolean }) {
  const items: { key: PickSource; label: string; Icon: typeof Camera }[] = [
    { key: 'camera', label: 'Camera', Icon: Camera },
    { key: 'library', label: 'Photos', Icon: Images },
    { key: 'file', label: 'Files', Icon: FolderOpen },
  ];
  return (
    <View style={styles.chooser}>
      {items.map(({ key, label, Icon }) => (
        <Pressable
          key={key}
          disabled={busy}
          onPress={() => onPick(key)}
          accessibilityRole="button"
          accessibilityLabel={`Choose from ${label}`}
          style={({ pressed }) => [styles.chooserItem, pressed && { backgroundColor: palette.surfaceSunken }, busy && { opacity: 0.4 }]}>
          <Icon size={20} color={palette.primaryText} strokeWidth={1.8} />
          <Text variant="labelStrong" numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {label}
          </Text>
        </Pressable>
      ))}
      <IconButton accessibilityLabel="Cancel" onPress={onCancel}>
        <X size={20} color={palette.text} />
      </IconButton>
    </View>
  );
}

// ── Document upload row (web VPDocRow) ───────────────────────────────────────────
export function DocUploadRow({ docType, uploaded, status, disabled }: { docType: string; uploaded: boolean; status?: string; disabled?: boolean }) {
  const qc = useQueryClient();
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chip = docStatus(status ?? 'pending', uploaded);

  async function pick(source: PickSource) {
    setError(null);
    let file: PickedFile | null = null;
    try {
      file = await pickFrom(source, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    } catch (e) {
      setError(e instanceof FileError ? e.message : 'Could not open that file.');
      return;
    }
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) return setError('That file is over 8 MB. Please choose a smaller one.');
    if (!UPLOAD_MIME.includes(String(file.type || '').toLowerCase())) return setError('Upload a PDF, JPG or PNG.');
    setBusy(true);
    const r = await uploadVendorDocument({ docType, fileName: file.name, mimeType: file.type, fileData: file.dataUrl.split(',')[1] ?? '' });
    setBusy(false);
    if (isApiError(r)) {
      haptic.error();
      return setError(r.error);
    }
    haptic.success();
    setChoosing(false);
    await qc.invalidateQueries({ queryKey: VENDOR_ME_KEY });
  }

  return (
    <View style={styles.docRow}>
      {/* The status sits under the name (not beside it): "Correction Required" is ~150 dp wide and
          would leave the document name a few characters per line at 360 dp. */}
      <View style={{ gap: 2 }}>
        <Text variant="bodyStrong">
          {DOC_LABEL[docType] ?? docType}
          <Text variant="bodyStrong" color={palette.dangerInk}>
            {' *'}
          </Text>
        </Text>
        {DOC_HINT[docType] ? (
          <Text variant="caption" muted>
            {DOC_HINT[docType]}
          </Text>
        ) : null}
      </View>
      {chip ? <StatusPill label={chip.label} tone={chip.tone} /> : null}
      {!disabled && !choosing ? (
        uploaded ? (
          <Button
            title="Replace"
            variant="text"
            size="sm"
            icon={<Upload />}
            onPress={() => {
              setError(null);
              setChoosing(true);
            }}
          />
        ) : (
          <Button
            title="Upload"
            variant="accent"
            size="md"
            icon={<Upload />}
            onPress={() => {
              setError(null);
              setChoosing(true);
            }}
            style={{ alignSelf: 'flex-start' }}
          />
        )
      ) : null}
      {!disabled && choosing ? (
        busy ? (
          <View style={styles.busy} accessibilityLiveRegion="polite">
            <ActivityIndicator color={palette.primaryText} />
            <Text variant="label" muted>
              Uploading…
            </Text>
          </View>
        ) : (
          <UploadChooser onPick={pick} onCancel={() => setChoosing(false)} />
        )
      ) : null}
      <FieldMessage error={error} />
    </View>
  );
}

// ── A file attachment row (bill / agreement detail) ──────────────────────────────
/** Pressable attachment: file icon, name (2 lines), a muted meta line and a chevron (a spinner while `loading`). */
export function FileRow({ name, meta, onPress, loading }: { name: string; meta?: string; onPress: () => void; loading?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessible
      accessibilityRole="button"
      accessibilityState={{ busy: !!loading }}
      accessibilityLabel={`${name}${meta ? `, ${meta}` : ''}. Opens the file`}
      style={({ pressed }) => [styles.fileRow, pressed && { backgroundColor: palette.pressedTint }]}>
      <ModuleBadge module="vendor" icon={FileText} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {name}
        </Text>
        {meta ? (
          <Text variant="caption" muted numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {loading ? (
        <ActivityIndicator color={palette.primaryText} style={{ flexShrink: 0 }} />
      ) : (
        <ChevronRight size={18} color={palette.textFaint} style={{ flexShrink: 0 }} />
      )}
    </Pressable>
  );
}

// ── Viewing / downloading ────────────────────────────────────────────────────────
export type FileSource = { kind: 'document'; docType: string; title: string } | { kind: 'bill'; versionId: string; title: string };

function loadFile(s: FileSource): Promise<ApiResult<FilePayload>> {
  if (s.kind === 'document') return getVendorDocument(s.docType);
  return getVendorBillFile(s.versionId);
}

// Writes the file to the cache and opens the share sheet (save to Files, open in a PDF viewer, …).
export async function openFile(f: FilePayload, fallbackName: string) {
  const mime = f.mimeType || 'application/octet-stream';
  const name = withExtension(f.fileName || fallbackName, mime);
  const uri = await saveDataUrl(`data:${mime};base64,${f.fileData}`, name);
  await shareFile(uri, mime, name);
}

/**
 * The agreement PDF in one tap: fetch it and hand it straight to the phone (share sheet → PDF app),
 * with no preview sheet in between. Resolves to an error message, or null once it opened.
 */
export async function openAgreementDraft(agreementId: string, fallbackName: string): Promise<string | null> {
  const r = await getAgreementDraft(agreementId);
  if (isApiError(r)) return r.error;
  if (!r?.fileData) return 'No file was attached.';
  try {
    await openFile(r, fallbackName);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not open the file.';
  }
}

const sourceKey = (s: FileSource) => (s.kind === 'document' ? `d:${s.docType}` : `b:${s.versionId}`);

export function FileViewerSheet({ source, onClose }: { source: FileSource | null; onClose: () => void }) {
  const shown = useLastValue(source);
  const session = useOpenCount(!!source);
  return (
    <Sheet visible={!!source} onClose={onClose} title={shown?.title}>
      {shown ? <FileViewerBody key={`${session}:${sourceKey(shown)}`} source={shown} /> : null}
    </Sheet>
  );
}

function FileViewerBody({ source }: { source: FileSource }) {
  const { height } = useWindowDimensions();
  const [file, setFile] = useState<FilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const previewHeight = Math.round(Math.min(380, Math.max(220, height * 0.45)));

  useEffect(() => {
    let alive = true;
    void loadFile(source).then((r) => {
      if (!alive) return;
      if (isApiError(r)) setError(r.error);
      else if (!r?.fileData) setError('No file was attached.');
      else setFile(r);
    });
    return () => {
      alive = false;
    };
  }, [source, nonce]);

  const isImage = !!file && String(file.mimeType || '').startsWith('image/');

  async function share() {
    if (!file) return;
    setSharing(true);
    setShareError(null);
    try {
      await openFile(file, source.title);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Could not open the file.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      {!file && !error ? <Skeleton height={previewHeight} radius={radius.md} /> : null}
      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setNonce((n) => n + 1);
          }}
        />
      ) : null}
      {file && isImage ? (
        <Image
          source={{ uri: `data:${file.mimeType};base64,${file.fileData}` }}
          style={{ width: '100%', height: previewHeight, borderRadius: radius.md, backgroundColor: palette.surfaceMuted }}
          contentFit="contain"
          accessibilityLabel={file.fileName || source.title}
        />
      ) : null}
      {file && !isImage ? (
        <View style={styles.pdfCard}>
          <View style={styles.pdfIcon}>
            <FileText size={28} color={palette.primaryText} strokeWidth={1.8} />
          </View>
          <Text variant="bodyStrong" align="center" numberOfLines={3}>
            {file.fileName || source.title}
          </Text>
          <Text variant="label" muted align="center">
            Opens in your phone&apos;s viewer, where you can save or share it.
          </Text>
        </View>
      ) : null}
      {file ? <Button title={isImage ? 'Save or share' : 'Open'} icon={<Share2 />} loading={sharing} onPress={share} /> : null}
      {shareError ? <Banner tone="danger" message={shareError} /> : null}
    </>
  );
}

const styles = themedStyles(() => ({
  chooser: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  chooserItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: space.sm,
    paddingHorizontal: space.xxs,
    borderRadius: radius.md,
    backgroundColor: palette.primarySoft,
  },
  docRow: { gap: space.sm, paddingVertical: space.sm },
  busy: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    marginHorizontal: -space.xs,
    borderRadius: radius.sm,
  },
  pdfCard: { alignItems: 'center', gap: space.xs, padding: space.xl, borderRadius: radius.md, backgroundColor: palette.surfaceMuted },
  pdfIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
}));
