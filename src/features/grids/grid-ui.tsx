// Pieces every grid screen shares: the gate fallback (skeleton while /hr/me loads, then home — PLAN
// §2.1.6), the text-size buttons for the header (the pinch-free zoom), the row sheet that lists every
// column in plain words, and the "Share as CSV" button (with a warning first when the table holds pay).

import { Redirect } from 'expo-router';
import { FileSpreadsheet, ZoomIn, ZoomOut } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { useHrMe, useMyTenant } from '@/api/me';
import { gridGates, type GridGates } from '@/features/grids/access';
import { type GridColumn, cellText, type Zoom, ZOOM_LABEL } from '@/features/grids/data-grid';
import { useAccess } from '@/lib/use-access';
import { type CsvColumn, shareCsv } from '@/lib/csv';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { Banner, Button, ConfirmSheet, type NavAction, Screen, Sheet, SkeletonList, SummaryCard, Text, toast } from '@/ui';

// ── Gate ─────────────────────────────────────────────────────────────────────
/** Each grid re-checks its own gate; a cold start waits for /hr/me and the company before deciding. */
export function useGridGate(which: keyof GridGates) {
  const access = useAccess();
  const hrQ = useHrMe();
  const tenantQ = useMyTenant();
  const gates = gridGates(access);
  return { access, gates, allowed: gates[which], pending: hrQ.isPending || (tenantQ.isPending && tenantQ.fetchStatus !== 'idle') };
}

export function GridGateFallback({ pending, header }: { pending: boolean; header: ReactNode }) {
  if (!pending) return <Redirect href="/" />;
  return (
    <Screen header={header}>
      <SkeletonList rows={6} tone="surface" />
    </Screen>
  );
}

// ── Text size (zoom) ─────────────────────────────────────────────────────────
export function useZoom(initial: Zoom = 1) {
  const [zoom, setZoom] = useState<Zoom>(initial);
  const actions: NavAction[] = [
    {
      key: 'zoom-out',
      icon: ZoomOut,
      label: zoom === 0 ? 'Smallest text' : `Smaller text (now ${ZOOM_LABEL[zoom].toLowerCase()})`,
      disabled: zoom === 0,
      onPress: () => setZoom((z) => (z > 0 ? ((z - 1) as Zoom) : z)),
    },
    {
      key: 'zoom-in',
      icon: ZoomIn,
      label: zoom === 2 ? 'Largest text' : `Bigger text (now ${ZOOM_LABEL[zoom].toLowerCase()})`,
      disabled: zoom === 2,
      onPress: () => setZoom((z) => (z < 2 ? ((z + 1) as Zoom) : z)),
    },
  ];
  return { zoom, actions };
}

// ── Row sheet ────────────────────────────────────────────────────────────────
/** Every column of one row, label → value, in one SummaryCard (plus anything the screen adds). */
export function RowSheet<T>({
  row,
  title,
  subtitle,
  columns,
  children,
  onClose,
}: {
  row: T | null;
  title: string;
  subtitle?: string;
  columns: GridColumn<T>[];
  children?: ReactNode;
  onClose: () => void;
}) {
  // Keep the last row on screen while the sheet slides away.
  const [last, setLast] = useState<T | null>(row);
  if (row && row !== last) setLast(row);
  const shown = row ?? last;
  return (
    <Sheet visible={!!row} onClose={onClose} title={title} subtitle={subtitle}>
      {shown ? (
        <View style={styles.gap}>
          <SummaryCard
            rows={columns
              .filter((c) => c.inSheet !== false)
              .map((c) => ({ key: c.key, label: c.long ?? c.label, value: cellText(c.cell(shown)) }))}
          />
          {children}
        </View>
      ) : null}
    </Sheet>
  );
}

// ── Share as CSV ─────────────────────────────────────────────────────────────
export function gridCsvColumns<T>(first: GridColumn<T>, columns: GridColumn<T>[]): CsvColumn<T>[] {
  return [first, ...columns].map((c) => ({ label: c.long ?? c.label, value: (r: T) => { const t = cellText(c.cell(r)); return t === '—' ? '' : t; } }));
}

/**
 * "Share as CSV". With `sensitive` (pay, salaries) it first says what is in the file and that it
 * leaves DASH once shared (hr-setup-payroll.md §6.3), behind a swipe.
 */
export function ShareCsvButton<T>({
  fileName,
  rows,
  columns,
  sensitive,
  what,
}: {
  fileName: string;
  rows: T[];
  columns: CsvColumn<T>[];
  sensitive?: boolean;
  /** "everyone's pay for October 2026" — used in the warning. */
  what?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await shareCsv(fileName, rows, columns, 'Share table');
      setAsk(false);
      toast.show(`${rows.length} ${rows.length === 1 ? 'row' : 'rows'} ready to share.`);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The file could not be made. Try again.');
    } finally {
      setBusy(false);
    }
  };
  if (!rows.length) return null;
  return (
    <>
      <Button title="Share as CSV" variant="accent" icon={<FileSpreadsheet />} loading={busy && !ask} onPress={() => (sensitive ? (setError(null), setAsk(true)) : void run())} />
      {error && !ask ? <Banner tone="danger" title="Couldn’t share" message={error} /> : null}
      {sensitive ? (
        <ConfirmSheet
          visible={ask}
          onClose={() => setAsk(false)}
          title="Share this table?"
          subtitle={what}
          confirmLabel="Swipe to make the file"
          onConfirm={() => void run()}
          loading={busy}
          note="Nobody is messaged. Once shared, the file is outside DASH.">
          <SummaryCard
            rows={[
              { label: 'Rows', value: String(rows.length) },
              { label: 'Holds', value: what ?? 'Pay details' },
              { label: 'Where it goes', value: 'Your phone’s share sheet: you choose the app' },
            ]}
          />
          <Text variant="caption" muted>
            Share it only with people allowed to see what it holds.
          </Text>
          {error ? <Banner tone="danger" title="Couldn’t share" message={error} /> : null}
        </ConfirmSheet>
      ) : null}
    </>
  );
}

/** "Swipe sideways" hint shown above an empty-state-free grid on first use. */
export function GridNote({ children }: { children: string }) {
  return (
    <Text variant="caption" muted>
      {children}
    </Text>
  );
}

const styles = themedStyles(() => ({
  gap: { gap: space.sm },
}));
