// Excel domain — the pieces every import screen shares:
//   TemplateCard   "1. Get the template": the columns and a Download template button (.xlsx)
//   PickCard       "2. Choose your file": Files / Drive picker, or the demo's sample sheet
//   PreviewList    "3. Check the rows": counts, a Ready / Problems filter and one row per sheet row
//                  (tap for every field and every problem; an optional per-row Skip / Import toggle)
//   ResultCard     what happened, with each failed row by its sheet row number
// Rows with an error are never imported; warnings are shown and imported, as on the website.

import { AlertTriangle, CheckCircle2, CircleAlert, Download, FileSpreadsheet, FileUp, Info, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { isDemoSession } from '@/api/client';
import type { RowFailure } from '@/features/excel/api';
import { hasError, type RowIssue } from '@/features/excel/parse';
import type { Template } from '@/features/excel/templates';
import { plural } from '@/lib/format';
import { sampleSheet, type SampleKey } from '@/features/excel/samples';
import { type PickedSheet, pickSpreadsheet, shareXlsx } from '@/lib/xlsx';
import { themedStyles } from '@/theme/themed';
import { palette, space, type StatusTone } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  CardHeader,
  Chip,
  ChipRow,
  KeyValueList,
  Sheet,
  StatGrid,
  StatTile,
  Text,
  toast,
} from '@/ui';

/**
 * Choose a sheet (or the demo sample) and hand it to `load`, which parses and checks it. Errors are
 * shown as a toast in plain words; `busy` covers both the picking and the checking.
 */
export function useSheetPicker(load: (p: PickedSheet) => Promise<void> | void, sample?: SampleKey) {
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const run = async (get: () => Promise<PickedSheet | null> | PickedSheet | null) => {
    setBusy(true);
    try {
      const p = await get();
      if (p) {
        await load(p);
        setFileName(p.name);
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'That file could not be read.', 'danger');
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    fileName,
    reset: () => setFileName(undefined),
    pick: () => run(pickSpreadsheet),
    sample: sample ? () => run(() => sampleSheet(sample)) : undefined,
  };
}

export async function shareTemplate(t: Template) {
  try {
    await shareXlsx(t.fileName, t.sheets, 'Share template');
  } catch (e) {
    toast.show(e instanceof Error ? e.message : 'The template could not be shared.', 'danger');
  }
}

export function TemplateCard({ template, note }: { template: Template; note?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Card style={styles.gap}>
      <CardHeader title="1. Get the template" overline="Same file as the website" />
      <Text variant="caption" muted>
        {note ?? 'Fill in one row per item. Column names can be in any order; extra columns are ignored.'}
      </Text>
      <View style={styles.cols}>
        <Text variant="caption" numberOfLines={4}>
          {template.columns.join(' · ')}
        </Text>
      </View>
      <Button
        title="Download template"
        variant="ghost"
        size="md"
        icon={<Download />}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await shareTemplate(template);
          setBusy(false);
        }}
      />
    </Card>
  );
}

export function PickCard({ fileName, onPick, onSample, busy, sampleLabel = 'Use a sample sheet' }: { fileName?: string; onPick: () => void; onSample?: () => void; busy?: boolean; sampleLabel?: string }) {
  const demo = isDemoSession();
  return (
    <Card style={styles.gap}>
      <CardHeader title="2. Choose your file" overline=".xlsx, .xls or .csv, up to 8 MB" />
      {fileName ? (
        <View style={styles.fileRow}>
          <FileSpreadsheet size={20} color={palette.successInk} />
          <Text variant="bodyStrong" numberOfLines={2} style={styles.flex}>
            {fileName}
          </Text>
        </View>
      ) : (
        <Text variant="caption" muted>
          Pick it from Files, Drive, WhatsApp downloads or email attachments. Nothing is saved until you confirm.
        </Text>
      )}
      {/* Once a file is in, the sticky save is the one primary (A1); choosing again drops to a quiet button. */}
      <Button title={fileName ? 'Choose another file' : 'Choose a file'} variant={fileName ? 'ghost' : 'primary'} size={fileName ? 'md' : 'lg'} icon={<FileUp />} loading={busy} onPress={onPick} />
      {demo && onSample ? <Button title={sampleLabel} variant="ghost" size="md" icon={<Sparkles />} disabled={busy} onPress={onSample} /> : null}
    </Card>
  );
}

export type PreviewItem = {
  key: string;
  line: number;
  title: string;
  subtitle?: string;
  issues: RowIssue[];
  fields: { label: string; value: string }[];
  /** A status of the row's own (e.g. "Update" / "New"); defaults to Ready / Problem. */
  status?: { label: string; tone: StatusTone };
  /** Rows the person may leave out by hand (employees on the roster already). */
  skipped?: boolean;
};

const issueTone = (issues: RowIssue[]): StatusTone => (hasError(issues) ? 'failed' : issues.some((i) => i.level === 'warning') ? 'pending' : 'done');

/** Counts + filter + rows. `onToggleSkip` adds Import / Leave out to the row sheet. */
export function PreviewList({ items, noun, onToggleSkip }: { items: PreviewItem[]; noun: [string, string]; onToggleSkip?: (key: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'problems' | 'ready'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const errors = items.filter((i) => hasError(i.issues)).length;
  const warnings = items.filter((i) => !hasError(i.issues) && i.issues.some((x) => x.level === 'warning')).length;
  const skipped = items.filter((i) => i.skipped && !hasError(i.issues)).length;
  const ready = items.length - errors - skipped;
  const shown = items.filter((i) => (filter === 'all' ? true : filter === 'problems' ? i.issues.some((x) => x.level !== 'info') : !hasError(i.issues) && !i.skipped));
  const LIMIT = 200;
  const current = items.find((i) => i.key === open) ?? null;
  return (
    <>
      <StatGrid columns={3}>
        <StatTile label="Will import" value={ready} valueColor={palette.successInk} />
        <StatTile label="Warnings" value={warnings} valueColor={warnings ? palette.warningInk : undefined} />
        <StatTile label="Left out" value={errors + skipped} valueColor={errors ? palette.dangerInk : undefined} />
      </StatGrid>
      {errors ? (
        <Banner tone="danger" icon={CircleAlert} title={`${plural(errors, 'row')} can’t be imported`} message="Fix them in the sheet and choose it again, or import the rest now." />
      ) : null}
      <ChipRow>
        <Chip label="All" count={items.length} selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Problems" count={items.filter((i) => i.issues.some((x) => x.level !== 'info')).length} selected={filter === 'problems'} onPress={() => setFilter('problems')} />
        <Chip label="Ready" count={ready} selected={filter === 'ready'} onPress={() => setFilter('ready')} />
      </ChipRow>
      <ActivityList title={`3. Check the ${noun[1]}`} empty={<Text variant="caption" muted>Nothing here.</Text>}>
        {shown.slice(0, LIMIT).map((i) => {
          const err = hasError(i.issues);
          const status = err ? { label: 'Won’t import', tone: 'failed' as const } : i.skipped ? { label: 'Left out', tone: 'neutral' as const } : (i.status ?? { label: i.issues.some((x) => x.level === 'warning') ? 'Check' : 'Ready', tone: issueTone(i.issues) });
          const first = i.issues.find((x) => x.level !== 'info') ?? i.issues[0];
          return (
            <ActivityRow
              key={i.key}
              title={i.title}
              subtitle={i.subtitle ? `Row ${i.line} · ${i.subtitle}` : `Row ${i.line}`}
              note={first?.text}
              status={status}
              onPress={() => setOpen(i.key)}
              accessibilityHint="Shows every field and problem of this row"
            />
          );
        })}
      </ActivityList>
      {shown.length > LIMIT ? (
        <Text variant="caption" muted align="center">
          Showing the first {LIMIT} of {shown.length} {noun[1]}. All of them are imported.
        </Text>
      ) : null}
      <Sheet
        visible={!!current}
        onClose={() => setOpen(null)}
        title={current?.title ?? ''}
        subtitle={current ? `Row ${current.line} of the sheet` : undefined}
        footer={
          current && onToggleSkip && !hasError(current.issues) ? (
            <Button
              title={current.skipped ? `Import this ${noun[0]}` : `Leave this ${noun[0]} out`}
              variant={current.skipped ? 'primary' : 'ghost'}
              onPress={() => {
                onToggleSkip(current.key);
                setOpen(null);
              }}
            />
          ) : undefined
        }>
        {current ? (
          <View style={styles.gap}>
            {current.issues.map((x, n) => (
              <Banner
                key={n}
                tone={x.level === 'error' ? 'danger' : x.level === 'warning' ? 'warning' : 'info'}
                icon={x.level === 'error' ? CircleAlert : x.level === 'warning' ? AlertTriangle : Info}
                message={x.text}
              />
            ))}
            <KeyValueList rows={current.fields.map((f) => ({ key: f.label, label: f.label, value: f.value }))} />
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

export function ResultCard({ title, lines, failures, onDone, doneLabel = 'Done' }: { title: string; lines: string[]; failures: RowFailure[]; onDone?: () => void; doneLabel?: string }) {
  return (
    <Card style={styles.gap}>
      <View style={styles.fileRow}>
        <CheckCircle2 size={22} color={failures.length ? palette.warningInk : palette.successInk} />
        <Text variant="heading" style={styles.flex}>
          {title}
        </Text>
      </View>
      {lines.map((l) => (
        <Text key={l} variant="body">
          {l}
        </Text>
      ))}
      {failures.length ? (
        <Banner tone="warning" icon={AlertTriangle} title={`${plural(failures.length, 'row')} not saved`}>
          <View style={styles.failList}>
            {failures.slice(0, 30).map((f, n) => (
              <Text key={n} variant="caption">
                {f.line ? `Row ${f.line} · ` : ''}
                {f.name}: {f.error}
              </Text>
            ))}
            {failures.length > 30 ? <Text variant="caption" muted>…and {failures.length - 30} more.</Text> : null}
          </View>
        </Banner>
      ) : null}
      {onDone ? <Button title={doneLabel} variant="ghost" size="md" onPress={onDone} /> : null}
    </Card>
  );
}

/** The live counter while rows are being saved. */
export function SavingBanner({ done, total, noun }: { done: number; total: number; noun: string }) {
  return <Banner tone="info" title={`Saving ${done} of ${total} ${noun}…`} message="Keep DASH open until it finishes." />;
}

const styles = themedStyles(() => ({
  gap: { gap: space.md },
  flex: { flex: 1 },
  cols: { backgroundColor: palette.surfaceMuted, borderRadius: 14, padding: space.md },
  fileRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  failList: { gap: 4, marginTop: 4 },
}));
