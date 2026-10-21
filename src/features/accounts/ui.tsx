// Small shared pieces of the Accounts screens: the stage pill, one list row for anything on the desk,
// a file sheet for documents / bills / agreement drafts, and the reason sheet every "reject" uses
// (a ConfirmSheet whose swipe stays off until the reason is long enough — rejecting emails someone).

import { Image } from 'expo-image';
import { FileText, type LucideIcon, Share2 } from 'lucide-react-native';
import { type ReactNode, useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import type { FilePayloadLoose } from '@/api/accounts';
import { type ApiResult, isApiError } from '@/api/client';
import { type AccountsItem, STAGE_META, type Stage, TYPE_META } from '@/features/accounts/model';
import { rowMoney, shortDate } from '@/features/petty-cash/logic';
import { saveDataUrl, shareFile } from '@/lib/files';
import { type ModuleKey, palette, radius, space, type StatusTone } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { ActivityRow, Banner, Button, ConfirmSheet, ErrorState, type FromToItem, Sheet, Skeleton, StatusPill, SummaryCard, type SummaryItem, SwitchRow, Text, TextField } from '@/ui';

export function StagePill({ stage }: { stage: Stage }) {
  const m = STAGE_META[stage];
  return <StatusPill label={m.label} tone={m.tone} />;
}

/**
 * An ActivityRow-style row whose status pill sits UNDER the text (DESIGN T5), so long titles, vendor names
 * and project codes keep the width instead of being squeezed by a pill in the right column. The right
 * column holds only the amount (or nothing). `status` is left out where the screen already says it
 * (a list filtered to one stage).
 */
export function DeskRow({
  module,
  icon,
  title,
  subtitle,
  note,
  value,
  status,
  onPress,
  accessibilityLabel,
}: {
  module: ModuleKey;
  icon: LucideIcon;
  title: string;
  subtitle?: string | null;
  note?: string | null;
  value?: string | null;
  status?: { label: string; tone: StatusTone } | null;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  // The kit's ActivityRow with the pill under the text; it also moves the amount under the text when
  // a 320 dp row would leave the title a sliver.
  return (
    <ActivityRow
      module={module}
      icon={icon}
      title={title}
      subtitle={subtitle}
      note={note}
      value={value}
      status={status}
      statusPlacement="below"
      chevron={!!onPress}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, note, value, status?.label].filter(Boolean).join(', ')}
    />
  );
}

/** One row for anything on the desk: who (or the vendor), what and its code, the amount; the stage under the text. */
export function ItemRow({ item, today, onPress, note, hideStage }: { item: AccountsItem; today: string; onPress?: () => void; note?: string | null; hideStage?: boolean }) {
  const t = TYPE_META[item.type];
  const code = item.kekaCode ? ` · ${item.kekaCode}` : '';
  const stage = STAGE_META[item.stage];
  return (
    <DeskRow
      module={t.module}
      icon={t.icon}
      title={item.title}
      subtitle={`${item.what}${code}`}
      note={note ?? `${item.type === 'bill' ? `Sent by ${item.person} · ` : ''}${shortDate(item.at, today)}${item.own ? ' · Yours' : ''}`}
      value={rowMoney(item.amount)}
      status={hideStage ? null : { label: stage.label, tone: stage.tone }}
      onPress={onPress}
      accessibilityLabel={`${item.title}, ${item.what}, ${rowMoney(item.amount)}, ${stage.label}`}
    />
  );
}

// ── Files ────────────────────────────────────────────────────────────────────
export type FileLoad = { title: string; load: () => Promise<ApiResult<FilePayloadLoose>> };

const asDataUrl = (f: FilePayloadLoose) => {
  const raw = String(f.fileData || '');
  if (raw.startsWith('data:')) return raw;
  return `data:${f.mimeType || 'application/octet-stream'};base64,${raw}`;
};
const mimeOf = (f: FilePayloadLoose) => (String(f.fileData || '').match(/^data:([^;,]+)/)?.[1] || f.mimeType || '').toLowerCase();
const extOf = (mime: string) => (mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime.startsWith('image/') ? 'jpg' : 'bin');

/**
 * A document, bill or agreement draft, fetched only when opened (never cached): images show in the
 * sheet, PDFs go to the phone's own viewer through the share sheet. Only PDFs and raster images are
 * ever shown (never SVG), like the website.
 */
export function FileSheet({ file, onClose }: { file: FileLoad | null; onClose: () => void }) {
  const [shown, setShown] = useState<FileLoad | null>(file);
  if (file && file !== shown) setShown(file);
  return (
    <Sheet visible={!!file} onClose={onClose} title={shown?.title}>
      {shown && file ? <FileBody key={shown.title} file={shown} /> : null}
    </Sheet>
  );
}

function FileBody({ file }: { file: FileLoad }) {
  const { height } = useWindowDimensions();
  const [data, setData] = useState<FilePayloadLoose | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const previewHeight = Math.round(Math.min(380, Math.max(220, height * 0.45)));

  useEffect(() => {
    let alive = true;
    void file.load().then((r) => {
      if (!alive) return;
      if (isApiError(r)) setError(r.error);
      else if (!r?.fileData) setError('No file was attached.');
      else {
        const mime = mimeOf(r);
        if (mime !== 'application/pdf' && !(mime.startsWith('image/') && !mime.includes('svg'))) setError('This file could not be shown.');
        else setData(r);
      }
    });
    return () => {
      alive = false;
    };
  }, [file, nonce]);

  const mime = data ? mimeOf(data) : '';
  const isImage = mime.startsWith('image/');
  const share = async () => {
    if (!data) return;
    setBusy(true);
    setShareError(null);
    try {
      const base = (data.fileName || file.title).replace(/\.[a-z0-9]+$/i, '');
      const uri = await saveDataUrl(asDataUrl(data), `${base}.${extOf(mime)}`);
      await shareFile(uri, mime, file.title);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Could not open the file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.fileBody}>
      {!data && !error ? <Skeleton height={previewHeight} radius={radius.md} /> : null}
      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setNonce((n) => n + 1);
          }}
        />
      ) : null}
      {data && isImage ? (
        <Image source={{ uri: asDataUrl(data) }} style={[styles.preview, { height: previewHeight }]} contentFit="contain" cachePolicy="none" accessibilityLabel={data.fileName || file.title} />
      ) : null}
      {data && !isImage ? (
        <View style={styles.pdfCard}>
          <FileText size={28} color={palette.primaryText} strokeWidth={1.8} />
          <Text variant="bodyStrong" align="center" numberOfLines={3}>
            {data.fileName || file.title}
          </Text>
          <Text variant="label" muted align="center">
            Opens in your phone’s viewer, where you can save or share it.
          </Text>
        </View>
      ) : null}
      {data ? <Button title={isImage ? 'Save or share' : 'Open'} icon={<Share2 />} loading={busy} onPress={() => void share()} /> : null}
      {shareError ? <Banner tone="danger" message={shareError} /> : null}
    </View>
  );
}

// ── Reject with a reason ─────────────────────────────────────────────────────
/**
 * Rejecting always says who is told and needs the reason they will read (`minLength` 0 = optional, for
 * the petty cash routes that take an empty one). Confirmed with a swipe, like every Accounts decision.
 */
export function ReasonConfirmSheet({
  visible,
  onClose,
  title,
  from,
  to,
  rows,
  reason,
  onReason,
  minLength,
  placeholder,
  note,
  confirmLabel,
  busy,
  onConfirm,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  from?: FromToItem;
  to?: FromToItem;
  rows?: SummaryItem[];
  reason: string;
  onReason: (s: string) => void;
  minLength: number;
  placeholder: string;
  /** Who is told, in plain words ("Priya is emailed your reason."). */
  note: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  const ok = reason.trim().length >= minLength;
  return (
    <ConfirmSheet visible={visible} onClose={onClose} title={title} from={from} to={to} confirmLabel={confirmLabel} onConfirm={onConfirm} loading={busy} disabled={!ok} note={note}>
      {rows && rows.length ? <SummaryCard rows={rows} hideEmpty /> : null}
      <TextField
        label={minLength > 0 ? 'Reason' : 'Reason (optional)'}
        value={reason}
        onChangeText={onReason}
        placeholder={placeholder}
        multiline
        maxLength={500}
        counter
        hint={minLength > 1 ? `At least ${minLength} characters` : minLength === 1 ? 'Required' : undefined}
      />
      {children}
    </ConfirmSheet>
  );
}

// ── Switch row ───────────────────────────────────────────────────────────────
// The whole row is the button (one 'switch' stop for screen readers); the Switch only shows the state.
export function ToggleRow({ label, sub, value, onChange, disabled, left }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; left?: ReactNode }) {
  return <SwitchRow title={label} subtitle={sub} value={value} onChange={onChange} disabled={disabled} left={left} subtitleLines={2} />;
}

const styles = themedStyles(() => ({
  toggle: { borderRadius: radius.md },
  pressed: { backgroundColor: palette.pressedTint },
  disabled: { opacity: 0.5 },
  fileBody: { gap: space.sm },
  preview: { width: '100%', borderRadius: radius.md, backgroundColor: palette.surfaceMuted },
  pdfCard: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: palette.surfaceMuted },
}));
