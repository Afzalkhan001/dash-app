// Small visual pieces used by the Bounty screens: the row of small figures at the foot of the light
// coins hero (Earned · Used · Referrals). Everything else (rows, notices, summaries, skeletons) comes
// straight from the UI kit.

import { StyleSheet, View } from 'react-native';

import { palette, space } from '@/theme/tokens';
import { shouldStack, Text, useLayout, withAlpha } from '@/ui';

import { themedStyles } from '@/theme/themed';

/**
 * Two or three small figures side by side (muted caption over a tabular figure), with a hairline above
 * them. On a very narrow phone or with large text they wrap two per row instead of squeezing.
 */
export function CoinStats({ items }: { items: { label: string; value: string }[] }) {
  const l = useLayout();
  const list = (Array.isArray(items) ? items : []).filter((i) => i && i.label);
  const wrap = list.length > 2 && shouldStack(l, { below: 'tiny', text: 'large' });
  if (!list.length) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.rule} />
      <View style={[styles.row, wrap && styles.rowWrap]}>
        {list.map((s) => (
          <View key={s.label} style={[styles.cell, wrap && styles.cellHalf]} accessible accessibilityLabel={`${s.label}: ${s.value}`}>
            <Text variant="caption" muted numberOfLines={1}>
              {s.label}
            </Text>
            <Text variant="bodyStrong" color={palette.ink} tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {s.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { gap: space.sm },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: withAlpha(palette.ink, 0.12) },
  row: { flexDirection: 'row', gap: space.sm },
  rowWrap: { flexWrap: 'wrap', rowGap: space.sm },
  cell: { flex: 1, minWidth: 0, gap: 2 },
  cellHalf: { flexBasis: '45%' },
}));
