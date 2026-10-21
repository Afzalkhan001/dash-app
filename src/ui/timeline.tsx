// Vertical event history (docs/DESIGN.md §7.17): a rail of tone dots joined by a hairline, each event
// with its label, "when · who" meta, an optional detail and a quoted note. Named EventTimeline so it
// doesn't collide with the feature-level `Timeline` components (which can wrap this one).

import { View } from 'react-native';

import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { Text } from '@/ui/text';

export type TimelineTone = 'neutral' | 'good' | 'bad' | 'info' | 'wait';

export type TimelineEvent = {
  key: string;
  label: string;
  /** Pre-formatted time, e.g. "12 Oct, 10:42". */
  at?: string | null;
  by?: string | null;
  detail?: string | null;
  note?: string | null;
  tone?: TimelineTone;
};

/** The rail dot's colour for a tone, read from the live theme at render time. */
function dotColor(tone: TimelineTone): string {
  switch (tone) {
    case 'good':
      return palette.success;
    case 'bad':
      return palette.danger;
    case 'info':
      return palette.info;
    case 'wait':
      return palette.warning;
    default:
      return palette.textFaint;
  }
}

/**   <EventTimeline events={[{ key: 'sub', label: 'Submitted', at: '12 Oct, 10:42', by: 'Priya', tone: 'neutral' }]} /> */
export function EventTimeline({ events }: { events: TimelineEvent[] }) {
  const list = (Array.isArray(events) ? events : []).filter(Boolean);
  return (
    <View>
      {list.map((e, i) => {
        const last = i === list.length - 1;
        const tone = e.tone ?? 'neutral';
        const meta = [e.at, e.by].filter(Boolean).join(' · ');
        return (
          <View key={e.key ?? i} style={styles.item}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: dotColor(tone) }]} />
              {!last ? <View style={styles.line} /> : null}
            </View>
            <View style={[styles.body, !last && { paddingBottom: space.md }]}>
              <Text variant="bodyStrong" color={tone === 'wait' ? palette.warningInk : palette.text}>
                {e.label}
              </Text>
              {meta ? (
                <Text variant="caption" muted>
                  {meta}
                </Text>
              ) : null}
              {e.detail ? <Text variant="label">{e.detail}</Text> : null}
              {e.note ? (
                <Text variant="label" muted>
                  “{e.note}”
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  item: { flexDirection: 'row', gap: space.sm },
  rail: { width: 16, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  line: { flex: 1, width: 2, borderRadius: 1, backgroundColor: palette.separator, marginTop: 4 },
  body: { flex: 1, minWidth: 0, gap: 2 },
}));
