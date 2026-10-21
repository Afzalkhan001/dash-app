// A task's stopwatch. Only the running task ticks (once a second, "1h 42m 05s" like the attendance
// clock); a paused one shows the time worked so far, "1h 42m paused". Big timers (≥ 28 px) use the
// Light weight and shrink to fit one line; hero timers (≥ 36 px) use the giant-numeral face
// (type.numeral, ExtraLight). Every size uses tabular digits so the numbers don't jitter while they
// tick. Colours are read at render time, so the timer follows the light / dark scheme.

import { useEffect, useState } from 'react';
import { type TextStyle, View } from 'react-native';

import type { Task } from '@/api/tasks';
import { clock, elapsedOf, isRunning, workedLabel } from '@/features/tasks/model';
import { font, moduleTone, palette, type as typeScale } from '@/theme/tokens';
import { Text } from '@/ui';

import { themedStyles } from '@/theme/themed';

// The current time, refreshed every `every` ms while `active` (and straight away when it becomes
// active, so a clock that sat idle is never shown stale). Also used by Home's "Needs you".
export function useNow(active: boolean, every = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), every);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [active, every]);
  return now;
}

export function LiveTimer({ task, size = 15, color, showPaused = true }: { task: Task; size?: number; color?: string; showPaused?: boolean }) {
  const running = isRunning(task);
  const now = useNow(running);
  const s = elapsedOf(task, now);
  const big = size >= 28;
  const numeral = size >= 36;
  const fg = color ?? (running ? moduleTone.tasks.fg : palette.textMuted);
  const style: TextStyle = {
    fontFamily: numeral ? typeScale.numeral.fontFamily : big ? font.light : font.semibold,
    fontSize: size,
    lineHeight: Math.round(size * (numeral ? 1.14 : 1.2)),
    letterSpacing: numeral ? -Math.round(size * 0.03 * 10) / 10 : big ? -0.5 : 0.3,
    color: fg,
  };
  const shown = running ? clock(s) : workedLabel(s);
  return (
    <View style={[styles.row, big && styles.rowBig]} accessible accessibilityLabel={`${running ? 'Running' : 'Paused'}, ${shown}`}>
      <Text
        tabular
        numberOfLines={1}
        adjustsFontSizeToFit={big}
        minimumFontScale={0.7}
        maxFontSizeMultiplier={big ? 1.15 : 1.3}
        style={[style, big && styles.shrink]}>
        {shown}
      </Text>
      {!running && showPaused ? (
        <Text variant="caption" color={color ?? palette.textMuted} numberOfLines={1} style={styles.paused}>
          paused
        </Text>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 0 },
  rowBig: { flexShrink: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  paused: { flexShrink: 0 },
}));
