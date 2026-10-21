// Roster building blocks for the admin/people screens: one roster row (photo, name, "job title ·
// department", a status pill when not plainly active) and the status → pill mapping. Colours only from
// tokens at render time (light / dark).

import type { AdminDepartment, RosterRecord } from '@/api/people';
import { useRosterPhoto } from '@/api/people';
import { deptLabel, STATUS_LABEL, statusOf } from '@/features/people/roster';
import type { StatusTone } from '@/theme/tokens';
import { ActivityRow, Avatar } from '@/ui';

export const STATUS_TONE: Record<ReturnType<typeof statusOf>, StatusTone> = { active: 'done', invited: 'pending', resigned: 'failed' };

export function RosterAvatar({ row, size = 40 }: { row: Pick<RosterRecord, 'id' | 'invited' | 'hasAvatar' | 'name'>; size?: number }) {
  const uri = useRosterPhoto(row);
  return <Avatar name={row.name} uri={uri} size={size} ring={false} />;
}

/** "Video Editor · Creative" — what they do and where. */
export const rosterSubtitle = (r: RosterRecord, depts: AdminDepartment[] | undefined) =>
  [r.jobTitle, deptLabel(r.dept, depts)].filter(Boolean).join(' · ') || null;

export function RosterRow({ row, depts, onPress }: { row: RosterRecord; depts: AdminDepartment[] | undefined; onPress?: () => void }) {
  const st = statusOf(row);
  return (
    <ActivityRow
      left={<RosterAvatar row={row} />}
      title={row.name}
      subtitle={rosterSubtitle(row, depts)}
      note={row.employeeNumber || null}
      status={st === 'active' ? null : { label: STATUS_LABEL[st], tone: STATUS_TONE[st] }}
      chevron={!!onPress}
      onPress={onPress}
    />
  );
}
