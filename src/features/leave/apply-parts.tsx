// Parts of the apply form (src/app/(app)/leave/apply.tsx):
//
//   LeaveTypeTiles  the leave type as Payno "Select Payment Method" tiles (the kit's SelectTiles): a
//                   thin line icon per type, its name and what is left ("6 days left", "Unpaid"). The
//                   kit holds up to 4 tiles in one radio group; a company with more types gets rows of
//                   3 (2 on a phone under 340 dp or with large text) whose tiles keep the full rows'
//                   width, so a short last row never stretches.
//   TypeTilesSkeleton  their placeholder while the types load.
//   ApplySummary    the live summary in the sticky bar right above the button, so it stays in view
//                   while the reason is typed: "3 days · 4 left after", "Half a day · unpaid", "Earns 1
//                   day off · use within 60 days of that day". Under it, in muted text, what is still
//                   missing before the request can go on, or else the next step for a known balance
//                   shortfall. The figures are previews (the server's own rules, see apply.tsx); the
//                   server counts when it is sent. The bar stays short with the keyboard open: the
//                   summary and the muted line take at most 2 lines each (the summary shrinks a little
//                   rather than being cut).

import { useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

import { palette, radius, space } from '@/theme/tokens';
import { SelectTiles, type SelectTileOption, shouldStack, Skeleton, Text, useLayout } from '@/ui';

import { themedStyles } from '@/theme/themed';

// The kit's SelectTiles column gap (tiles.tsx GAP); the chunked rows use it between rows too, so they
// read as one even grid.
const TILE_GAP = space.xs;
const KIT_MAX = 4;

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function LeaveTypeTiles({
  options,
  value,
  onChange,
}: {
  options: SelectTileOption[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const l = useLayout();
  const [width, setWidth] = useState(0);
  const list = (Array.isArray(options) ? options : []).filter(Boolean);
  if (list.length <= KIT_MAX) {
    return <SelectTiles options={list} value={value} onChange={onChange} accessibilityLabel="Leave type" />;
  }

  const per = shouldStack(l, { below: 'tight' }) ? 2 : 3;
  const rows = chunk(list, per);
  const tile = width > 0 ? (width - TILE_GAP * (per - 1)) / per : 0;
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== width) setWidth(w);
  };
  return (
    <View onLayout={onLayout} style={styles.rows}>
      {rows.map((row, i) => (
        <SelectTiles
          key={row.map((o) => o.value).join('|')}
          options={row}
          value={value}
          onChange={onChange}
          columns={per as 2 | 3}
          accessibilityLabel={rows.length > 1 ? `Leave type, ${i + 1} of ${rows.length}` : 'Leave type'}
          // A short last row keeps the full rows' tile width instead of stretching.
          style={row.length < per && tile > 0 ? { width: Math.floor(row.length * tile + TILE_GAP * (row.length - 1)) } : undefined}
        />
      ))}
    </View>
  );
}

export function TypeTilesSkeleton() {
  return (
    <View style={styles.skeleton} accessibilityLabel="Loading leave types" accessibilityRole="progressbar">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={92} radius={radius.lg} style={styles.skeletonTile} />
      ))}
    </View>
  );
}

export type SummaryLine = {
  /** The headline, e.g. "3 days" or "About 3 days". */
  main: string;
  /** What it means for the balance, e.g. "4 left after" or "2 more than you have". */
  extra?: string | null;
  /** True when `extra` is a problem (more than the balance). */
  danger?: boolean;
};

export function ApplySummary({ summary, blocker }: { summary: SummaryLine | null; blocker: string | null }) {
  if (!summary && !blocker) return null;
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      {summary ? (
        <Text variant="bodyStrong" align="center" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85} tabular>
          {summary.main}
          {summary.extra ? (
            <Text variant="body" color={summary.danger ? palette.dangerInk : palette.textMuted}>
              {` · ${summary.extra}`}
            </Text>
          ) : null}
        </Text>
      ) : null}
      {blocker ? (
        <Text variant="caption" muted align="center" numberOfLines={2}>
          {blocker}
        </Text>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  rows: { gap: TILE_GAP },
  skeleton: { flexDirection: 'row', gap: TILE_GAP },
  skeletonTile: { flex: 1 },
  wrap: { gap: 2, paddingBottom: space.xxs },
}));
