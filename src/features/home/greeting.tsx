// Home's hero for people who don't clock in (with a clock card, that card is the hero). The greeting
// itself ("Good morning" over the first name) is in the header (features/home/header.tsx), so this
// card only carries the day, as the Lendora wash card (kit WashStatCard look, docs/REFERENCE-
// COMPONENTS.md item 23) without the slider: the light gradient.sunsetLight wash (a warm dark wash in
// dark mode, ink text in both), a small muted "Today" with the time of day's icon in a frosted disc on
// the right, then the day of the month as the giant ExtraLight kit Numeral with the month as its tiny
// superscript ("20ᴼᶜᵗ") and the weekday under it ("Tuesday"). It never competes with a dark card.
// India time, re-read every minute (useNow), so a Home left open past noon or midnight updates its
// date and icon.

import { LinearGradient } from 'expo-linear-gradient';
import { Moon, Sun, Sunrise } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useNow } from '@/features/attendance/use-now';
import { dayLabel, istParts } from '@/lib/dates';
import { gradient, palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { Numeral, Text, useLayout } from '@/ui';

const DISC = 44;

// The time of day as an icon (same cut-offs as greeting()): a rising sun, the sun, the moon. Icons on
// a frosted disc: coral / gold / brand text colour, which all read on the light and the dark wash.
function DayIcon({ hour, size }: { hour: number; size: number }) {
  if (hour < 12) return <Sunrise size={size} color={palette.coral} strokeWidth={1.8} />;
  if (hour < 17) return <Sun size={size} color={palette.gold} strokeWidth={1.8} />;
  return <Moon size={size} color={palette.primaryText} strokeWidth={1.8} />;
}

export function TodayHero() {
  const { heroPad } = useLayout();
  const now = useNow();
  const { date: ymd, hour } = istParts(new Date(now));
  const day = String(Number(ymd.slice(8, 10)) || '');
  const month = dayLabel(ymd, { month: 'short' });
  const weekday = dayLabel(ymd, { weekday: 'long' });
  const spoken = dayLabel(ymd, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <View style={[styles.hero, { padding: heroPad }]} accessible accessibilityRole="text" accessibilityLabel={`Today, ${spoken}`}>
      {/* The warm end of the wash sits in the bottom-right corner, the pale end behind the words. */}
      <LinearGradient colors={gradient.sunsetLight} start={{ x: 1, y: 1 }} end={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.top} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text variant="label" muted numberOfLines={1} style={styles.flex}>
          Today
        </Text>
        <View style={styles.disc}>
          <DayIcon hour={hour} size={20} />
        </View>
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {day ? <Numeral value={day} unit={month} caption={weekday} animate={false} /> : null}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  hero: {
    gap: space.xs,
    borderRadius: radius.xxl,
    overflow: 'hidden',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassEdge,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: palette.glassStrong,
    borderWidth: 1,
    borderColor: palette.glassEdge,
  },
}));
