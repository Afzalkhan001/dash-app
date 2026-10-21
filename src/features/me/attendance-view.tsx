// Me › Attendance (was the Attendance tab), in the Payno × Lendora layout (docs/REFERENCE-COMPONENTS.md
// §3). State, then action, then links — each part under a Payno SectionHeader:
//   1. today's clock card (clock in / out lives here; the screen's one bold card),
//   2. This week: Payno's pill bar chart — the hours worked as a light figure with the change against
//      the same days last week, over seven slim pills (week-hours.tsx), once something was worked,
//   3. the month on screen (title + month switcher): a Lendora two-up — a spark card of the hours
//      each day with Late · Present · Leave under it, and the average day — over the month calendar
//      (tap a day to see it, or fix it). The two-up only once there is a first clock-in,
//   4. one frosted list of links: Who's in today (managers, first), Fix attendance, Timesheets,
//      Holidays, My shift.
// Each part keeps today's gate. People who don't clock in (system roles) get only their links, always
// under a title — "Your team" when they can see the team, else "Company" — so company tools never
// read as "my attendance" under the Me title.
// Renders inside the Me screen (no Screen or header of its own).

import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, ClipboardList, Clock, type LucideIcon, Palmtree, PencilLine, Users } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type AttendanceRow, type TodayFull, useMyRegularizations, useTeamAttendance } from '@/api/attendance';
import { useAttendanceToday, useHolidays } from '@/api/hr';
import { ClockCard } from '@/features/attendance/clock-card';
import { DaySheet } from '@/features/attendance/day-sheet';
import { addMonths, monthLabel, prettyHm, shortDay } from '@/features/attendance/format';
import { MonthCalendar } from '@/features/attendance/month-calendar';
import { type DayInfo, useMonthDays } from '@/features/attendance/use-month-days';
import { useTodayIst } from '@/features/attendance/use-now';
import { WeekHours } from '@/features/attendance/week-hours';
import { durationLabel } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { type ModuleKey, moduleTone, palette, radius, space } from '@/theme/tokens';
import { ActivityList, ActivityRow, Card, ErrorState, IconButton, ProgressBar, SectionHeader, Skeleton, SparkCard, StatTile, TourTarget, TwoUp, useLayout } from '@/ui';

import { themedStyles } from '@/theme/themed';
// Whole days from one YYYY-MM-DD to another (both read as UTC dates, so no timezone can shift them).
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function AttendanceView() {
  const access = useAccess();
  const { compact } = useLayout();
  const personal = access.sections.clock;
  const showTeam = access.sections.attendance && (access.isHrAdmin || access.hr.adminsDepts.length > 0);
  return (
    // Sections get more air than the cards inside them (24 / 20 between, 8 within).
    <View style={{ gap: compact ? space.lg : space.xl }}>
      {personal ? <ClockCard /> : null}
      {personal ? <WeekHours /> : null}
      {personal ? <MyMonth /> : null}
      <AttendanceLinks showTeam={showTeam} personal={personal} title={personal ? 'Quick links' : showTeam ? 'Your team' : 'Company'} />
    </View>
  );
}

// The month on screen: its title with the switcher, the two-up and the calendar; a day opens its sheet.
function MyMonth() {
  const access = useAccess();
  const today = useTodayIst();
  const current = today.slice(0, 7);
  const [month, setMonth] = useState(current);
  const [day, setDay] = useState<DayInfo | null>(null);
  const md = useMonthDays(month);
  const atLatest = month >= current;
  const records = Array.isArray(md.records) ? md.records : [];
  const days = Array.isArray(md.days) ? md.days : [];

  const switcher = (
    <View style={styles.switcher}>
      <IconButton accessibilityLabel="Previous month" onPress={() => setMonth(addMonths(month, -1))}>
        <ChevronLeft size={20} color={palette.text} strokeWidth={1.8} />
      </IconButton>
      <IconButton accessibilityLabel="Next month" disabled={atLatest} onPress={() => setMonth(addMonths(month, 1))}>
        <ChevronRight size={20} color={atLatest ? palette.textFaint : palette.text} strokeWidth={1.8} />
      </IconButton>
    </View>
  );

  return (
    <View style={styles.section}>
      <SectionHeader title={monthLabel(month)} right={switcher} />
      {md.error && !records.length ? (
        <Card tone="frost">
          <ErrorState message={md.error.message} onRetry={() => void md.refetch()} />
        </Card>
      ) : (
        <View style={styles.month}>
          {/* The figures only once there is something to count — no cards of zeros on day one. */}
          {md.isLoading ? (
            <TwoUp>
              <Skeleton height={196} radius={radius.xl} />
              <Skeleton height={196} radius={radius.xl} />
            </TwoUp>
          ) : records.length ? (
            <MonthSummary records={records} days={days} workingSoFar={md.workingSoFar} leaveTracked={md.leaveTracked} />
          ) : null}
          {/* The calendar card is the tour's "Your month" (docs/TOUR.md), once it has loaded. */}
          <TourTarget id={md.isLoading ? null : 'me.calendar'} radius={radius.xl}>
            <Card tone="frost">
              {md.isLoading ? (
                <Skeleton height={300} />
              ) : (
                <MonthCalendar
                  days={days}
                  today={today}
                  // A future day with nothing on it has nothing to show.
                  onPressDay={(d) => (d.date > today && d.kind === 'none' ? undefined : setDay(d))}
                />
              )}
            </Card>
          </TourTarget>
        </View>
      )}
      <DaySheet info={day} onClose={() => setDay(null)} canRegularize={access.sections.regularization} regWindowDays={md.regWindowDays} />
    </View>
  );
}

// The month as a Lendora two-up: a spark card of the hours worked each day with the three counts under
// it (Late · Present · Leave, Present emphasised in the middle), and the average day as a light tile
// with how many of the working days so far you were in. Leave reads "Absent" for people whose leave
// isn't tracked here (the leave module is off), so the third figure is never a meaningless 0.
function MonthSummary({
  records: raw,
  days,
  workingSoFar,
  leaveTracked,
}: {
  records: AttendanceRow[];
  days: DayInfo[];
  workingSoFar: number;
  leaveTracked: boolean;
}) {
  const records = (Array.isArray(raw) ? raw : []).filter(Boolean);
  const late = records.filter((r) => r.late).length;
  const closed = records
    .filter((r) => typeof r.work_date === 'string' && (r.worked_minutes ?? 0) > 0)
    .sort((a, b) => a.work_date.localeCompare(b.work_date));
  const total = closed.reduce((n, r) => n + (r.worked_minutes ?? 0), 0);
  const avg = closed.length ? total / closed.length : 0;
  const outOf = Number.isFinite(workingSoFar) && workingSoFar > 0 ? workingSoFar : 0;
  const list = Array.isArray(days) ? days : [];
  const third = leaveTracked
    ? { label: 'Leave', value: list.filter((d) => d.kind === 'leave').length }
    : { label: 'Absent', value: list.filter((d) => d.kind === 'absent').length };
  return (
    <TwoUp>
      <SparkCard
        title="Attendance"
        subtitle="Hours each day"
        values={closed.map((r) => (r.worked_minutes ?? 0) / 60)}
        highlight={closed.length - 1}
        color={moduleTone.attendance.fg}
        footer={[{ label: 'Late', value: late }, { label: 'Present', value: records.length }, third]}
        accessibilityLabel={`This month: present ${records.length} ${records.length === 1 ? 'day' : 'days'}, late ${late}, ${third.label.toLowerCase()} ${third.value}`}
      />
      <StatTile
        variant="light"
        label="Average day"
        value={avg ? durationLabel(avg) : '—'}
        caption={outOf ? `In ${records.length} of ${outOf} working days` : null}
        // The bar closes the tile at the bottom, level with the spark card's figures.
        footer={
          outOf ? (
            <View style={styles.bar}>
              <ProgressBar
                value={Math.min(1, records.length / outOf)}
                color={moduleTone.attendance.fg}
                accessibilityLabel={`In ${records.length} of ${outOf} working days`}
              />
            </View>
          ) : null
        }
      />
    </TwoUp>
  );
}

// The rest of attendance, as one frosted list — each row only when its module is on, with a live
// hint. "Who's in today" comes first for whoever may see it (managers look for it here).
type LinkRow = { key: string; title: string; subtitle: string; module: ModuleKey; icon: LucideIcon; href: string };
function AttendanceLinks({ showTeam, personal, title }: { showTeam: boolean; personal: boolean; title: string }) {
  const router = useRouter();
  const { sections, isHrAdmin } = useAccess();
  const today = useTodayIst();
  const regsQ = useMyRegularizations(sections.regularization);
  const holQ = useHolidays(today.slice(0, 4), sections.holidays);
  const todayQ = useAttendanceToday(sections.clock);
  const teamQ = useTeamAttendance(today, showTeam);

  const regs = Array.isArray(regsQ.data) ? regsQ.data : [];
  const holidays = Array.isArray(holQ.data?.holidays) ? holQ.data.holidays : [];
  const team = Array.isArray(teamQ.data) ? teamQ.data : [];
  const waiting = regs.filter((r) => r?.status === 'pending').length;
  const next = holidays
    .filter((h) => typeof h?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const inDays = next ? daysBetween(today, next.date) : null;
  const s = (todayQ.data as unknown as TodayFull | undefined)?.settings;
  const late = team.filter((r) => r?.late).length;
  const inOffice = team.filter((r) => r?.in_mode === 'office').length;

  const teamRow: LinkRow | null = showTeam
    ? {
        key: 'team',
        title: 'Who’s in today',
        subtitle: teamQ.isLoading ? 'Loading…' : teamQ.error ? 'See who clocked in' : `${inOffice} in office${late ? ` · ${late} late` : ''}`,
        module: 'people',
        icon: Users,
        href: '/attendance/team',
      }
    : null;
  const fixRow: LinkRow | null = sections.regularization
    ? {
        key: 'fix',
        title: 'Fix attendance',
        subtitle: waiting ? `${waiting} waiting for approval` : 'Missed a clock-in or clock-out?',
        module: 'attendance',
        icon: PencilLine,
        href: '/attendance/regularize',
      }
    : null;
  const tsRow: LinkRow | null = sections.timesheets
    ? {
        key: 'ts',
        title: 'Timesheets',
        subtitle: 'Hours you logged, by project',
        module: 'timesheets',
        icon: ClipboardList,
        href: '/attendance/timesheets',
      }
    : null;
  const holRow: LinkRow | null = sections.holidays
    ? {
        key: 'hol',
        title: 'Holidays',
        subtitle: next
          ? `Next: ${next.name} · ${shortDay(next.date)}${inDays === 0 ? ' · today' : inDays === 1 ? ' · tomorrow' : ''}`
          : 'Company holiday list',
        module: 'holidays',
        icon: Palmtree,
        href: '/attendance/holidays',
      }
    : null;
  const shiftRow: LinkRow | null = sections.shifts
    ? {
        key: 'shift',
        // Named as the screen it opens is (HR admins manage every shift there).
        title: isHrAdmin ? 'Shifts' : 'My shift',
        subtitle: s?.shiftName ? `${s.shiftName} · ${prettyHm(s.shiftStart)} – ${prettyHm(s.shiftEnd)}` : 'Shift timings and weekly offs',
        module: 'shifts',
        icon: Clock,
        href: '/attendance/shifts',
      }
    : null;
  // People who clock in: their own links after the team. Others (system roles): team tools first.
  const ordered = personal ? [teamRow, fixRow, tsRow, holRow, shiftRow] : [teamRow, shiftRow, holRow, fixRow, tsRow];
  const rows = ordered.filter((r): r is LinkRow => !!r);
  if (!rows.length) return null;

  return (
    <ActivityList title={title}>
      {rows.map((r) => (
        <ActivityRow key={r.key} module={r.module} icon={r.icon} title={r.title} subtitle={r.subtitle} chevron onPress={() => router.push(r.href)} />
      ))}
    </ActivityList>
  );
}

const styles = themedStyles(() => ({
  section: { gap: space.xs },
  month: { gap: space.sm },
  switcher: { flexDirection: 'row', gap: space.xs },
  bar: { marginTop: 'auto', paddingTop: space.sm },
}));
