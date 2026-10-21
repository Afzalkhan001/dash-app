// Roster building blocks for the admin/people screens: one roster row (photo, name, "job title ·
// department", a status pill under the text when not plainly active) and the status → pill mapping. Colours only from
// tokens at render time (light / dark).

import type { AdminDepartment, RosterRecord } from '@/api/people';
import { useRosterPhoto } from '@/api/people';
import { deptLabel, STATUS_LABEL, statusOf } from '@/features/people/roster';
import type { StatusTone } from '@/theme/tokens';
import { Avatar, ListRow, StatusPill } from '@/ui';

// Resigned is not a failure: grey, not red. Not signed up is still waiting on them: amber.
export const STATUS_TONE: Record<ReturnType<typeof statusOf>, StatusTone> = { active: 'done', invited: 'pending', resigned: 'neutral' };

export function RosterAvatar({ row, size = 40 }: { row: Pick<RosterRecord, 'id' | 'invited' | 'hasAvatar' | 'name'>; size?: number }) {
  const uri = useRosterPhoto(row);
  return <Avatar name={row.name} uri={uri} size={size} ring={false} />;
}

/** "Video Editor · Creative" — what they do and where. */
export const rosterSubtitle = (r: RosterRecord, depts: AdminDepartment[] | undefined) =>
  [r.jobTitle, deptLabel(r.dept, depts)].filter(Boolean).join(' · ') || null;

export function RosterRow({ row, depts, onPress }: { row: RosterRecord; depts: AdminDepartment[] | undefined; onPress?: () => void }) {
  const st = statusOf(row);
  const sub = rosterSubtitle(row, depts);
  const pill = st === 'active' ? null : { label: STATUS_LABEL[st], tone: STATUS_TONE[st] };
  // The pill goes under the text (DESIGN §0C), so "Production Assistant · Production" is never cut
  // short to make room for it on the right. ActivityRow can't put it there, so this is its ListRow.
  return (
    <ListRow
      size="lg"
      titleWeight="medium"
      left={<RosterAvatar row={row} />}
      title={row.name}
      subtitle={sub ?? undefined}
      meta={row.employeeNumber || undefined}
      numberOfLines={2}
      subtitleLines={2}
      below={pill ? <StatusPill label={pill.label} tone={pill.tone} /> : undefined}
      chevron={!!onPress}
      onPress={onPress}
      accessibilityLabel={[row.name, sub, row.employeeNumber, pill?.label].filter(Boolean).join(', ')}
    />
  );
}
