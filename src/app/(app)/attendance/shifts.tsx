// My shift — the app's ShiftsPanel (dash.html ~L4686), read-only. "My shift" comes from
// GET /hr/shifts/mine, which returns a shift only when one is really assigned (the company's default
// hours are deliberately not dressed up as a shift). Payno layout: NavHeader, then one light
// SummaryHero — the shift's name as its label, the hours as the big light figure, when you count as
// late in the info chip and the weekly off under it. HR admins also see every shift (a frosted list
// under a SectionHeader), as on the web, and — with the Shifts module on — "Manage shifts" and "Who
// works which shift", which open HR setup (app/(app)/admin/hr-time, the hrtime domain).

import { useRouter } from 'expo-router';
import { Clock, Settings2, UsersRound } from 'lucide-react-native';

import { useAllShifts, useMyShift } from '@/api/attendance';
import { duration, prettyHm, tsFmt, WEEKDAYS } from '@/features/attendance/format';
import { canManageShifts } from '@/features/hrtime/access';
import { useAccess } from '@/lib/use-access';
import { moduleTone, palette, radius } from '@/theme/tokens';
import { ActivityList, ActivityRow, Card, EmptyState, ErrorState, NavHeader, Screen, Skeleton, SkeletonList, SummaryHero, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';

// Day numbers are 0 = Sunday … 6 = Saturday (the server's). The app reads weeks Monday first, like
// the month calendar and timesheets, so a weekend off reads "Sat, Sun", not "Sun, Sat".
const mondayFirst = (i: number) => (i + 6) % 7;
// Crash guard: weekly offs are day numbers 0–6; anything else reads as none. Duplicates are dropped.
const offDays = (v: unknown): number[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((i): i is number => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i <= 6))].sort(
        (a, b) => mondayFirst(a) - mondayFirst(b),
      )
    : [];
const offLabel = (days: number[]) => days.map((i) => WEEKDAYS[i]).join(', ');

function addMinutes(hm: string | null | undefined, mins: number) {
  const m = /^(\d{2}):(\d{2})/.exec(String(hm ?? ''));
  if (!m) return '';
  const t = Number(m[1]) * 60 + Number(m[2]) + (Number.isFinite(mins) ? mins : 0);
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export default function ShiftsScreen() {
  const router = useRouter();
  const access = useAccess();
  const on = access.sections.shifts;
  // HR setup (hrtime): Super Admin and HR manage shifts in the app now (dash.html ShiftsPanel admin).
  const canManage = canManageShifts(access.hr, access.user);
  const personal = on && !access.isSystemRole;
  const mineQ = useMyShift(personal);
  const allQ = useAllShifts(on && access.isHrAdmin);
  const SHIFT = moduleTone.shifts;
  const header = <NavHeader title={access.isHrAdmin ? 'Shifts' : 'My shift'} />;

  if (!on) {
    return (
      <Screen header={header}>
        <EmptyState icon={<Clock color={SHIFT.fg} strokeWidth={1.8} />} title="Shifts aren’t on" message="Shifts aren’t switched on for your account." />
      </Screen>
    );
  }

  if (!personal && !access.isHrAdmin) {
    // A system role does not work a shift, and only HR admins manage them.
    return (
      <Screen header={header}>
        <EmptyState icon={<Clock color={SHIFT.fg} strokeWidth={1.8} />} title="Nothing to show" message="Shifts are worked by employees and managed by HR." />
      </Screen>
    );
  }

  const m = mineQ.data && typeof mineQ.data === 'object' ? mineQ.data : null;
  const mineOff = offDays(m?.weekly_off);
  const grace = Number.isFinite(m?.grace_minutes) ? (m?.grace_minutes as number) : 0;
  const lateAfter = m ? addMinutes(m.start_time, grace) : '';
  const shifts = (Array.isArray(allQ.data) ? allQ.data : []).filter((s) => s && typeof s === 'object');

  return (
    <Screen header={header} onRefresh={() => Promise.all([personal ? mineQ.refetch() : null, access.isHrAdmin ? allQ.refetch() : null])}>
      {personal ? (
        mineQ.isLoading ? (
          <Skeleton height={200} radius={radius.xxl} />
        ) : mineQ.error ? (
          <Card tone="frost">
            <ErrorState message={(mineQ.error as Error)?.message ?? ''} onRetry={() => void mineQ.refetch()} />
          </Card>
        ) : m ? (
          <SummaryHero
            icon={Clock}
            module="shifts"
            // "My shift" is the screen's title already; HR admins' screen is "Shifts", so it says whose.
            label={access.isHrAdmin ? `My shift · ${m.name || 'Shift'}` : m.name || 'Shift'}
            figure={
              <Text variant="hero" color={palette.ink} tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.hours}>
                {prettyHm(m.start_time)} – {prettyHm(m.end_time)}
              </Text>
            }
            info={lateAfter ? { label: 'Late after', value: prettyHm(lateAfter) } : { label: 'Grace', value: tsFmt(grace) }}
            sub={`Weekly off · ${offLabel(mineOff) || 'None'}`}
          />
        ) : (
          // Loaded, and there is genuinely no shift. Saying so beats inventing one.
          <Card tone="frost">
            <EmptyState
              icon={<Clock color={SHIFT.fg} strokeWidth={1.8} />}
              title="No shift assigned yet"
              message="Your company’s normal hours apply."
            />
          </Card>
        )
      ) : null}

      {access.isHrAdmin ? (
        allQ.isLoading ? (
          <SkeletonList rows={4} avatar tone="surface" />
        ) : allQ.error ? (
          <Card tone="frost">
            <ErrorState message={(allQ.error as Error)?.message ?? ''} onRetry={() => void allQ.refetch()} />
          </Card>
        ) : !shifts.length ? (
          <EmptyState
            icon={<Clock color={SHIFT.fg} strokeWidth={1.8} />}
            title="No shifts yet"
            message="Everyone follows the company’s normal hours."
          />
        ) : (
          <ActivityList title="All shifts">
            {shifts.map((s, i) => {
              const off = offLabel(offDays(s.weekly_off));
              return (
                <ActivityRow
                  key={s.id ?? i}
                  module="shifts"
                  icon={Clock}
                  title={s.name || 'Shift'}
                  // Two-line budget (§4.4): hours, grace and weekly off wrap within 2 lines even at font
                  // scale 1.3; the half/full-day thresholds are short enough for the 1-line note.
                  subtitle={`${prettyHm(s.start_time)} – ${prettyHm(s.end_time)} · grace ${tsFmt(Number(s.grace_minutes) || 0)} · ${off ? `off ${off}` : 'no weekly off'}`}
                  note={`Half day ${duration(s.half_day_minutes)} · full day ${duration(s.full_day_minutes)}`}
                />
              );
            })}
          </ActivityList>
        )
      ) : null}

      {canManage ? (
        <ActivityList title="Manage">
          <ActivityRow module="shifts" icon={Settings2} title="Manage shifts" subtitle="Add, change or remove shifts" chevron onPress={() => router.push('/admin/hr-time/shifts')} />
          <ActivityRow
            module="shifts"
            icon={UsersRound}
            title="Who works which shift"
            subtitle="Put people on a shift or back on company hours"
            chevron
            onPress={() => router.push('/admin/hr-time/shift-people')}
          />
        </ActivityList>
      ) : null}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  hours: { flexShrink: 1 },
}));
