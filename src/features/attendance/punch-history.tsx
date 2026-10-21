// Everything recorded for one attendance day — clock-in, hourly remote check-ins, clock-out — with a
// map link for each position (dash.html PunchHistory + GeoLinks). Remote days also list the hourly
// slots that were due but never arrived.
//
// Each event is two lines (docs/DESIGN.md §11): the dot, label and time on the first, the note under
// it. The Map link sits in its own right-hand column, centred against both lines: a 32 dp pill inside
// a 44 x 48 dp press area, so it is a full-size touch target without stretching line 1. No fixed
// column widths, so long labels and large text wrap instead of colliding.

import { ExternalLink } from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import type { AttendanceRow, Ping } from '@/api/attendance';
import { clockTime, mapsUrl, missedSlots, modeShort } from '@/features/attendance/format';
import { useNow } from '@/features/attendance/use-now';
import { palette, radius, space } from '@/theme/tokens';
import { Text } from '@/ui';

import { themedStyles } from '@/theme/themed';
type Tone = 'in' | 'out' | 'ping' | 'missed';
type Ev = { k: string; label: string; at: string; lat?: number | null; lng?: number | null; note: string; tone: Tone };

// Clock in green, clock out the brand, the hourly remote check-ins a warm sunset, a missed hour red.
// Read at render time (light / dark); the brand dot uses its text tone so it shows on the dark card.
function dotColor(tone: Tone) {
  return tone === 'in' ? palette.success : tone === 'out' ? palette.primaryText : tone === 'ping' ? palette.sunset : palette.danger;
}

function MapLink({ lat, lng, label }: { lat?: number | null; lng?: number | null; label: string }) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return (
    <Pressable
      onPress={() => void Linking.openURL(mapsUrl(lat, lng)).catch(() => {})}
      hitSlop={{ top: 2, bottom: 2 }}
      style={styles.map}
      accessibilityRole="link"
      accessibilityLabel={`Open the ${label.toLowerCase()} position in Maps`}>
      {({ pressed }) => (
        <View style={[styles.mapPill, pressed && styles.mapPillPressed]}>
          <Text variant="labelStrong" color={palette.primaryText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            Map
          </Text>
          <ExternalLink size={14} color={palette.primaryText} strokeWidth={2} />
        </View>
      )}
    </Pressable>
  );
}

function EventRow({ e, first }: { e: Ev; first: boolean }) {
  const missed = e.tone === 'missed';
  return (
    <View style={[styles.row, !first && styles.sep]}>
      <View style={styles.body}>
        <View style={styles.line}>
          <View style={[styles.dot, { backgroundColor: dotColor(e.tone) }]} />
          <Text variant="labelStrong" color={missed ? palette.dangerInk : palette.text} numberOfLines={1} style={styles.flexText}>
            {e.label}
          </Text>
          <Text variant="label" tabular color={missed ? palette.dangerInk : palette.text} numberOfLines={1} style={styles.fixed}>
            {clockTime(e.at)}
          </Text>
        </View>
        {e.note ? (
          <Text variant="caption" muted numberOfLines={2} style={styles.note}>
            {e.note}
          </Text>
        ) : null}
      </View>
      <MapLink lat={e.lat} lng={e.lng} label={e.label} />
    </View>
  );
}

export function PunchHistory({ r }: { r: AttendanceRow }) {
  const now = useNow();
  if (!r) return null;
  const pings = (Array.isArray(r.pings) ? r.pings : []).filter((p): p is Ping => !!p && typeof p === 'object');
  const ev: Ev[] = [];
  if (r.in_at) {
    ev.push({ k: 'in', label: 'Clock in', at: r.in_at, lat: r.in_lat, lng: r.in_lng, note: r.in_mode ? modeShort(r.in_mode) : '', tone: 'in' });
  }
  for (const p of pings) {
    ev.push({ k: `p${p.slot}`, label: `Hour ${p.slot} location`, at: p.at, lat: p.lat, lng: p.lng, note: p.accuracy_m != null ? `±${p.accuracy_m} m` : '', tone: 'ping' });
  }
  if (r.out_at) {
    ev.push({ k: 'out', label: 'Clock out', at: r.out_at, lat: r.out_lat, lng: r.out_lng, note: r.out_mode ? modeShort(r.out_mode) : '', tone: 'out' });
  }
  ev.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
  const remote = r.in_mode === 'remote';
  const m = remote ? missedSlots({ ...r, pings }, now) : null;
  const missed = Array.isArray(m?.missed) ? m.missed : [];
  const all: Ev[] = ev.concat(missed.map((x) => ({ k: `m${x.slot}`, label: `Hour ${x.slot} missed`, at: x.at, note: 'no location came in', tone: 'missed' as const })));

  return (
    <View>
      {all.length ? (
        all.map((e, i) => <EventRow key={e.k} e={e} first={i === 0} />)
      ) : (
        <Text variant="label" muted style={styles.empty}>
          Nothing recorded.
        </Text>
      )}
      {m ? (
        <Text variant="caption" muted numberOfLines={2} style={styles.footnote}>
          Hourly location: {pings.length} of {m.due} sent{missed.length ? ` · ${missed.length} missed` : ''}. It is only sent while DASH is open.
        </Text>
      ) : null}
    </View>
  );
}

const DOT_SIZE = 8;
const LINE_GAP = space.sm;

const styles = themedStyles(() => ({
  // The text column and the Map column are centred against each other; every row is at least as tall
  // as the Map press area, so rows with and without a Map link line up.
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xxs, minHeight: 52 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator },
  body: { flex: 1, minWidth: 0, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: LINE_GAP },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, flexShrink: 0 },
  flexText: { flex: 1, minWidth: 0, flexShrink: 1 },
  fixed: { flexShrink: 0 },
  // The note lines up under the label, past the dot.
  note: { marginLeft: DOT_SIZE + LINE_GAP },
  // 44 high x ≥ 48 wide press area (48 dp tall with the 2 dp hitSlop) around a 32 dp pill.
  map: { minHeight: 44, minWidth: 48, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    minHeight: 32,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.primarySoft,
  },
  mapPillPressed: { opacity: 0.7 },
  empty: { paddingVertical: space.sm },
  footnote: { marginTop: space.xs },
}));
