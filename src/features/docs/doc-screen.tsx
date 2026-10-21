// The one screen every PDF uses: what it covers (hero), its filters, a live preview of the exact page that
// will be printed, then "Share PDF" (the share sheet: Files, WhatsApp, mail, Drive) and "Print". On the
// web build both open the browser's print dialog, where "Save as PDF" is a printer.

import type { LucideIcon } from 'lucide-react-native';
import { FileDown, Printer } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { WebFrame } from '@/features/docs/web-frame';
import { FileError } from '@/lib/files';
import { type PdfDoc, pdfHtml, printPdf, sharePdf } from '@/lib/pdf';
import { palette, radius, space, type ModuleKey } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { ActionBar, Button, EmptyState, ErrorState, NavHeader, Screen, Skeleton, SummaryHero, Text, toast } from '@/ui';

export type Printable = PdfDoc | { html: string; fileName: string; landscape?: boolean; title?: string };
const htmlOf = (d: Printable) => ('html' in d ? d.html : pdfHtml(d));

/** The preview shows the printed page zoomed out to the phone's width (A4 ≈ 760 px wide; landscape 1080). */
function previewHtml(html: string, landscape?: boolean) {
  const w = landscape ? 1080 : 760;
  return html.replace(/<meta name="viewport"[^>]*>/, `<meta name="viewport" content="width=${w}">`).replace(/<body([^>]*)>/, `<body$1 style="padding:28px">`);
}

export const shareLabel = Platform.OS === 'web' ? 'Save as PDF' : 'Share PDF';

export function DocScreen({
  title,
  icon,
  module,
  heroLabel,
  value,
  unit,
  currency,
  sub,
  controls,
  doc,
  loading,
  error,
  onRetry,
  onRefresh,
  empty,
  note,
  children,
}: {
  title: string;
  icon: LucideIcon;
  module: ModuleKey;
  heroLabel: string;
  value?: number;
  unit?: string;
  currency?: string;
  sub?: string;
  /** Filters (dates, a person, a group) above the preview. */
  controls?: ReactNode;
  doc: Printable | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRefresh?: () => Promise<unknown>;
  /** Shown instead of the preview when there is nothing to print. */
  empty?: { title: string; message?: string } | null;
  /** One muted line above the buttons (who else sees the file). */
  note?: string | null;
  children?: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const [busy, setBusy] = useState<'share' | 'print' | null>(null);
  const previewH = Math.round(Math.min(620, Math.max(320, height * 0.55)));

  const run = async (what: 'share' | 'print') => {
    if (!doc || busy) return;
    setBusy(what);
    try {
      if (what === 'share') await sharePdf(doc);
      else await printPdf(doc);
    } catch (e) {
      toast.show(e instanceof FileError ? e.message : 'The PDF could not be made. Try again.', 'danger');
    } finally {
      setBusy(null);
    }
  };

  const ready = !!doc && !loading && !error && !empty;
  return (
    <Screen
      header={<NavHeader title={title} />}
      onRefresh={onRefresh}
      footer={
        ready ? (
          <ActionBar note={note}>
            <Button title={shareLabel} icon={<FileDown />} loading={busy === 'share'} disabled={!!busy} onPress={() => void run('share')} />
            {Platform.OS !== 'web' ? <Button title="Print" variant="ghost" icon={<Printer />} loading={busy === 'print'} disabled={!!busy} onPress={() => void run('print')} /> : null}
          </ActionBar>
        ) : undefined
      }>
      <SummaryHero icon={icon} module={module} label={heroLabel} value={loading ? undefined : value} currency={currency} unit={unit} sub={sub} figure={loading ? <Skeleton width={110} height={44} radius={radius.sm} /> : value === undefined ? null : undefined} />
      {controls}
      {children}
      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : loading ? (
        <Skeleton height={previewH} radius={radius.xl} />
      ) : empty ? (
        <EmptyState icon={<FileDown color={palette.textMuted} strokeWidth={1.8} />} title={empty.title} message={empty.message} />
      ) : doc ? (
        <View style={styles.preview}>
          <Text variant="labelStrong" muted>
            Preview
          </Text>
          <View style={[styles.frame, { height: previewH }]}>
            <WebFrame html={previewHtml(htmlOf(doc), 'landscape' in doc ? doc.landscape : undefined)} height={previewH} title={`Preview of ${title}`} scroll />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  preview: { gap: space.xs },
  frame: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline },
}));
