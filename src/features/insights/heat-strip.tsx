// A one-line strip of day cells for a month (the phone's version of the Attendance grid's row): a
// cell is filled when hours were logged that day, stronger for more hours; weekends sit on a sunken
// tint. Each cell flexes, so 28–31 days always fit at 320 dp.

import { View } from 'react-native';

import { themedStyles } from '@/theme/themed';
import { palette, radius } from '@/theme/tokens';

export function HeatStrip({ values, weekend, max = 9, label }: { values: readonly number[]; weekend?: readonly boolean[]; max?: number; label: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      {values.map((h, i) => {
        const level = h > 0 ? Math.min(1, 0.35 + (0.65 * Math.min(h, max)) / max) : 0;
        return (
          <View key={i} style={[styles.cell, weekend?.[i] ? styles.weekend : null]}>
            {level > 0 ? <View style={[styles.fill, { opacity: level }]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row' as const, gap: 2, height: 16 },
  cell: { flex: 1, borderRadius: radius.xs / 2, backgroundColor: palette.track, overflow: 'hidden' as const },
  weekend: { backgroundColor: palette.surfaceSunken },
  fill: { flex: 1, backgroundColor: palette.coral },
}));
