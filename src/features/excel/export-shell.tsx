// Excel domain — the frame every download screen uses: what the file holds, the choices (dates, a
// person, a view), a preview count, and one "Download Excel" button that builds the .xlsx on the phone
// and opens the share sheet. Downloads write nothing, so they need no swipe; the one thing they do
// is put company data in a file, so sensitive ones (pay, audit, the roster) say so first.

import { CalendarRange, Download, ShieldAlert, UserRound } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import type { ExportDef } from '@/features/excel/catalog';
import { addDaysYmd } from '@/lib/ist';
import { shareXlsx, type SheetSpec } from '@/lib/xlsx';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { AccountRow, ActionBar, Banner, Button, Card, CardHeader, Chip, ChipRow, DateField, NavHeader, Screen, SkeletonList, Text, toast } from '@/ui';

export type BuiltFile = { fileName: string; sheets: SheetSpec[] };

export function ExportShell({
  def,
  ready,
  intro,
  sensitive,
  count,
  countNoun,
  disabled,
  build,
  children,
}: {
  def: ExportDef;
  ready: boolean;
  /** What the file holds, in one or two plain sentences. */
  intro: string;
  /** A warning shown before the button (pay, personal details). */
  sensitive?: string;
  /** How many rows the main sheet will have (null while loading). */
  count?: number | null;
  countNoun?: [string, string];
  disabled?: boolean | string;
  build: () => Promise<BuiltFile | null> | BuiltFile | null;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const blocker = typeof disabled === 'string' ? disabled : null;
  const run = async () => {
    setBusy(true);
    try {
      const f = await build();
      if (!f) return;
      await shareXlsx(f.fileName, f.sheets);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'The Excel file could not be made. Try again.', 'danger');
    } finally {
      setBusy(false);
    }
  };
  const noun = countNoun ?? ['row', 'rows'];
  return (
    <Screen
      header={<NavHeader title={def.title} />}
      footer={
        ready ? (
          <ActionBar note={blocker ?? (count === 0 ? 'Nothing to list yet, so the file will only have the headings.' : null)}>
            <Button title="Download Excel" icon={<Download />} loading={busy} disabled={!!disabled} onPress={run} />
          </ActionBar>
        ) : undefined
      }>
      {!ready ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          <Card style={styles.gap}>
            <CardHeader title="What’s in the file" overline={typeof count === 'number' ? `${count.toLocaleString('en-IN')} ${count === 1 ? noun[0] : noun[1]}` : undefined} />
            <Text variant="body" muted>
              {intro}
            </Text>
          </Card>
          {children}
          {sensitive ? <Banner tone="warning" icon={ShieldAlert} title="Handle with care" message={sensitive} /> : null}
        </>
      )}
    </Screen>
  );
}

export type Range = { from: string; to: string };

/** Dates for the file: quick picks plus From / To (IST calendar days). */
export function RangeCard({ value, onChange, today, presets = ['month', 'last', '30', 'fy'], title = 'Dates' }: { value: Range; onChange: (r: Range) => void; today: string; presets?: ('month' | 'last' | '7' | '30' | 'fy' | 'all')[]; title?: string }) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastStart = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
  const fyStart = m >= 4 ? `${y}-04-01` : `${y - 1}-04-01`;
  const opts = {
    month: { label: 'This month', r: { from: monthStart, to: today } },
    last: { label: 'Last month', r: { from: lastStart, to: addDaysYmd(monthStart, -1) } },
    '7': { label: 'Last 7 days', r: { from: addDaysYmd(today, -6), to: today } },
    '30': { label: 'Last 30 days', r: { from: addDaysYmd(today, -29), to: today } },
    fy: { label: 'This financial year', r: { from: fyStart, to: `${Number(fyStart.slice(0, 4)) + 1}-03-31` } },
    all: { label: 'Everything', r: { from: '', to: '' } },
  } as const;
  return (
    <Card style={styles.gap}>
      <CardHeader title={title} />
      <ChipRow bleed="card" wrap>
        {presets.map((k) => (
          <Chip key={k} label={opts[k].label} selected={value.from === opts[k].r.from && value.to === opts[k].r.to} onPress={() => onChange(opts[k].r)} />
        ))}
      </ChipRow>
      <DateField label="From" value={value.from || null} onChange={(d) => onChange({ from: d, to: value.to && value.to < d ? d : value.to })} />
      <DateField label="To" value={value.to || null} minimumDate={value.from || undefined} onChange={(d) => onChange({ from: value.from, to: d })} />
    </Card>
  );
}

/** A set of chips for one choice (view, status). */
export function ChoiceCard<K extends string>({ title, value, options, onChange }: { title: string; value: K; options: { key: K; label: string; count?: number }[]; onChange: (k: K) => void }) {
  return (
    <Card style={styles.gap}>
      <CardHeader title={title} />
      <ChipRow bleed="card" wrap>
        {options.map((o) => (
          <Chip key={o.key} label={o.label} count={o.count} selected={value === o.key} onPress={() => onChange(o.key)} />
        ))}
      </ChipRow>
    </Card>
  );
}

/** One chosen thing (a person, a code, a chat) with a Change pill. */
export function PickedRow({ title, sub, placeholder, onChange, icon = UserRound }: { title?: string | null; sub?: string | null; placeholder: string; onChange: () => void; icon?: typeof UserRound }) {
  return (
    <View>
      <AccountRow icon={icon} module="people" title={title || placeholder} sub={sub || (title ? undefined : 'Nothing chosen yet')} actionLabel={title ? 'Change' : 'Choose'} onChange={onChange} onPress={onChange} />
    </View>
  );
}

export const RangeIcon = CalendarRange;

const styles = themedStyles(() => ({
  gap: { gap: space.sm },
}));
