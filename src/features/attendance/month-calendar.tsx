// Month grid (Monday first): every day is a 36 dp disc tinted by what the day was, with ONE legend
// under it. The day kinds are folded into six looks a person can tell apart at a glance — present
// (attendance tint), late or short (amber), absent (red), leave (green), holiday (a solid holiday
// disc, the one strong colour) and weekly off (a quiet warm grey) — and the legend lists only the
// ones this month has. Days with nothing on them are plain numbers (faint in the future). Tapping a
// day hands its DayInfo to the caller, which opens the day sheet (where the exact state is spelled
// out). Today gets a brand ring on top of its tint.
// Cells are a seventh of the card's inner width (≈ 42 dp at 360).

import { Pressable, StyleSheet, View } from 'react-native';

import { weekdayOf } from '@/features/attendance/format';
import { type DayInfo, type DayKind, KIND_META } from '@/features/attendance/use-month-days';
import { dayLabel } from '@/lib/dates';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import { isDarkScheme, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';
const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

type Group = 'present' | 'late' | 'absent' | 'leave' | 'holiday' | 'off';
const GROUPS: Group[] = ['present', 'late', 'absent', 'leave', 'holiday', 'off'];
// bg = the disc, fg = the number on it (every pair >= 4.5:1). Read at render time, so it follows the
// light / dark tokens. The holiday disc is the one solid colour: the module's text tone in light; in
// dark that tone is a light pink that would swallow the white number, so the hero's deeper stop is used.
function groupMeta(): Record<Group, { label: string; bg: string; fg: string }> {
  return {
    present: { label: 'Present', bg: moduleTone.attendance.bg, fg: moduleTone.attendance.fg },
    late: { label: 'Late/short', bg: palette.warningSoft, fg: palette.warningInk },
    absent: { label: 'Absent', bg: palette.dangerSoft, fg: palette.dangerInk },
    leave: { label: 'Leave', bg: moduleTone.leave.bg, fg: moduleTone.leave.fg },
    holiday: { label: 'Holiday', bg: isDarkScheme() ? moduleTone.holidays.gradient[0] : moduleTone.holidays.fg, fg: palette.onPrimary },
    off: { label: 'Weekly off', bg: palette.surfaceMuted, fg: palette.textMuted },
  };
}
const GROUP_OF: Partial<Record<DayKind, Group>> = {
  present: 'present',
  remote: 'present',
  working: 'present',
  late: 'late',
  half: 'late',
  incomplete: 'absent',
  absent: 'absent',
  leave: 'leave',
  holiday: 'holiday',
  weekoff: 'off',
};

export function MonthCalendar({ days: raw, today, onPressDay }: { days: DayInfo[]; today: string; onPressDay: (d: DayInfo) => void }) {
  const days = (Array.isArray(raw) ? raw : []).filter((d) => d && typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date));
  const lead = days.length ? (weekdayOf(days[0]!.date) + 6) % 7 : 0;
  const cells: (DayInfo | null)[] = [...Array.from({ length: lead }, () => null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: (DayInfo | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const present = new Set(days.map((d) => GROUP_OF[d.kind]).filter(Boolean));
  const legend = GROUPS.filter((g) => present.has(g));
  const looks = groupMeta();

  return (
    <View style={{ gap: space.xxs }}>
      <View style={styles.week} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {HEAD.map((h, i) => (
          <View key={i} style={styles.headCell}>
            <Text variant="caption" muted maxFontSizeMultiplier={1.2}>
              {h}
            </Text>
          </View>
        ))}
      </View>
      {weeks.map((w, wi) => (
        <View key={wi} style={styles.week}>
          {w.map((d, di) => {
            if (!d) return <View key={di} style={styles.cell} />;
            const isToday = d.date === today;
            const future = d.date > today;
            const group = GROUP_OF[d.kind];
            const look = group ? looks[group] : null;
            const meta = d.kind !== 'none' ? KIND_META[d.kind] : undefined;
            const numColor = look ? look.fg : isToday ? palette.ink : future ? palette.textFaint : palette.text;
            return (
              <Pressable
                key={di}
                style={styles.cell}
                onPress={() => onPressDay(d)}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}${isToday ? ', today' : ''}${meta ? `, ${meta.label}` : ''}`}>
                {({ pressed }) => (
                  <View
                    style={[
                      styles.num,
                      look ? { backgroundColor: look.bg } : isToday ? styles.todayPlain : null,
                      isToday && styles.today,
                      pressed && (look ? styles.pressedTint : styles.pressed),
                    ]}>
                    <Text variant={isToday || group === 'holiday' ? 'labelStrong' : 'label'} tabular maxFontSizeMultiplier={1.3} color={numColor}>
                      {Number(d.date.slice(8, 10))}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
      {legend.length ? (
        // The key, in the cells' own look; it wraps to a second line rather than shrinking.
        <View style={styles.legend} accessible accessibilityLabel={`Key: ${legend.map((g) => looks[g].label).join(', ')}`}>
          {legend.map((g) => (
            <View key={g} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: looks[g].bg }]}>
                <View style={[styles.swatchDot, { backgroundColor: looks[g].fg }]} />
              </View>
              <Text variant="caption" muted numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {looks[g].label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  week: { flexDirection: 'row' },
  headCell: { flex: 1, alignItems: 'center', paddingBottom: space.xxs },
  cell: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 3 },
  num: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  todayPlain: { backgroundColor: palette.primarySoft },
  // The ring is drawn in the brand's text tone, so it reads on the dark card too.
  today: { borderWidth: 2, borderColor: palette.primaryText },
  pressed: { backgroundColor: palette.pressedTint },
  pressedTint: { opacity: 0.7 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: space.md,
    rowGap: space.xs,
    paddingTop: space.sm,
    marginTop: space.xxs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.separator,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  swatchDot: { width: 6, height: 6, borderRadius: 3 },
}));
