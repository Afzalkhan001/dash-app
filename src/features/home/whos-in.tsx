// "Who's in today" on Home, for the people who may see it in Me › Attendance (HR admins and
// department admins, with attendance on — the very gate and query that screen uses, so the server
// never refuses it): a sideways row of frosted kit AvatarTiles (docs/REFERENCE-COMPONENTS.md item 7,
// Payno "Recent Recipients"), one per person who clocked in today, earliest first, with "See all"
// → Who's in today (/attendance/team, where a tap opens that person's day). A tile opens that list too.
//
// Each tile: the initials avatar with a small status dot, the name (2 lines) and one short muted line
// that fits the 96 dp tile: the time they came in ("9:12 AM", green dot — the section says "who's
// in"), or the word for the amber / grey dot ("Late", "Left"), so the colour is never the only signal.
// Screen readers hear the whole story ("Priya Sharma, in since 9:42 AM, late, remote"); the times of a
// late or finished day are one tap away on the team screen. The tiles grow with large text, and the
// row scrolls sideways, so a 320 dp phone shows two and a half of them.
//
// useWhosIn() returns null when there is nothing to show (not allowed, still loading, failed, or
// nobody in yet), so Home leaves the section out instead of keeping an empty slot.

import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { type AttendanceRow, useTeamAttendance } from '@/api/attendance';
import { clockTime } from '@/features/attendance/format';
import { useTodayIst } from '@/features/attendance/use-now';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { type AvatarTileItem, AvatarTiles, SectionHeader } from '@/ui';

const MAX_TILES = 12;

export type WhosIn = { tiles: AvatarTileItem[]; total: number; late: number };

const instant = (iso?: string | null) => {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
};

export function useWhosIn(): WhosIn | null {
  const access = useAccess();
  const today = useTodayIst();
  // Exactly Me › Attendance's gate for its "Who's in today" row.
  const allowed = access.sections.attendance && (access.isHrAdmin || (Array.isArray(access.hr?.adminsDepts) && access.hr.adminsDepts.length > 0));
  const q = useTeamAttendance(today, allowed);
  if (!allowed || !Array.isArray(q.data)) return null;
  const rows = q.data.filter((r): r is AttendanceRow => !!r && typeof r === 'object' && !!r.in_at && !!(r.employee_name || '').trim());
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => instant(a.in_at) - instant(b.in_at));
  const tiles: AvatarTileItem[] = sorted.slice(0, MAX_TILES).map((r, i) => {
    const name = String(r.employee_name).trim();
    const left = !!r.out_at;
    const sub = left ? 'Left' : r.late ? 'Late' : clockTime(r.in_at);
    const spoken = left
      ? `${name}, came in at ${clockTime(r.in_at)}, left at ${clockTime(r.out_at)}`
      : `${name}, in since ${clockTime(r.in_at)}${r.late ? ', late' : ''}${r.in_mode === 'remote' ? ', remote' : ''}`;
    return {
      key: String(r.id ?? r.employee_id ?? `${name}-${i}`),
      name,
      sub,
      dot: left ? 'neutral' : r.late ? 'pending' : 'done',
      accessibilityLabel: spoken,
    };
  });
  return { tiles, total: rows.length, late: rows.filter((r) => r.late).length };
}

/** The section. Pass useWhosIn()'s result; render it only when that is not null. */
export function WhosInToday({ data }: { data: WhosIn }) {
  const router = useRouter();
  const openTeam = () => router.push('/attendance/team');
  // A tile looks like a button (Payno recipients), so it is one: it opens the full list, where that
  // person's day is one more tap.
  const tiles = (Array.isArray(data?.tiles) ? data.tiles : []).map((t) => ({ ...t, onPress: openTeam, hint: 'Opens Who’s in today' }));
  if (!tiles.length) return null;
  const summary = `${data.total} in${data.late ? ` · ${data.late} late` : ''}`;
  return (
    <View style={styles.section}>
      <SectionHeader
        title="Who’s in today"
        overline={summary}
        onAction={openTeam}
        actionAccessibilityLabel={`See all ${plural(data.total, 'person', 'people')} in today`}
      />
      <AvatarTiles items={tiles} accessibilityLabel="Who’s in today" />
    </View>
  );
}

const styles = themedStyles(() => ({
  section: { gap: space.xxs },
}));
