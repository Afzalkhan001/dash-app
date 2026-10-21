// This week's hours (docs/REFERENCE-COMPONENTS.md §3, Me › Attendance): Payno's "Earning Activity" —
// the kit PillBarChart in one frosted card. On the left the week's total as a light Numeral ("10.1 h")
// with a small change against last week over the same finished days ("↗ +1h 20m"); on the right
// seven slim pills, Monday → Sunday. The latest day worked (today once clocked in) is the selected
// brand capsule with its time in a pill above it; tap or slide along the pills to read another day.
//
// Data: the month's own records (the same query the calendar uses, so nothing extra loads), plus the
// month before when this week or last week began in it (the 1st–13th of a month). Today's time keeps
// counting while clocked in. Left out entirely until something was worked this week.

import { View } from 'react-native';

import type { AttendanceRow } from '@/api/attendance';
import { useAttendanceMonth } from '@/api/hr';
import { addDays, mondayOf, weekdayOf } from '@/features/attendance/format';
import { useMonthDays } from '@/features/attendance/use-month-days';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { durationLabel } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { radius, space } from '@/theme/tokens';
import { Card, PillBarChart, SectionHeader, Skeleton, type VizDeltaLabel } from '@/ui';

import { themedStyles } from '@/theme/themed';

export type WeekBar = { date: string; minutes: number; today: boolean; future: boolean; off: boolean };

// The pills read Monday first, like the calendar and timesheets.
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const SPOKEN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MINUS = String.fromCharCode(0x2212);

// Minutes worked on a record: today's open day counts up to now; any other day is the server's figure.
function minutesOf(r: AttendanceRow, today: string, now: number) {
  if (r.work_date === today && !r.out_at && r.in_at) {
    const t = Date.parse(r.in_at);
    if (Number.isFinite(t)) return Math.max(0, Math.floor((now - t) / 60_000));
  }
  const m = r.worked_minutes;
  return typeof m === 'number' && Number.isFinite(m) ? Math.max(0, m) : 0;
}

export function WeekHours() {
  const access = useAccess();
  const on = access.sections.clock;
  const now = useNow();
  const today = useTodayIst();
  const month = today.slice(0, 7);
  const md = useMonthDays(month);
  const monday = mondayOf(today);
  const lastMonday = addDays(monday, -7);
  // This week (the 1st–6th) or last week (up to the 13th) began last month: that month's records too.
  // It is the same month either way, and the same cached query the calendar's month switcher uses.
  const prevMonth = lastMonday.slice(0, 7);
  const needPrev = prevMonth !== month;
  const straddles = monday.slice(0, 7) !== month;
  const prevQ = useAttendanceMonth(prevMonth, on && needPrev);

  if (md.isLoading || (straddles && prevQ.isLoading)) {
    return (
      <View style={styles.section}>
        <SectionHeader title="This week" />
        <Skeleton height={176} radius={radius.xl} />
      </View>
    );
  }
  // A failed month shows its error once, in the month section below.
  if (md.error && !md.records.length) return null;

  const prev = needPrev && Array.isArray(prevQ.data?.records) ? (prevQ.data.records as AttendanceRow[]) : [];
  const byDate = new Map<string, AttendanceRow>();
  for (const r of [...prev, ...(Array.isArray(md.records) ? md.records : [])]) {
    if (r && typeof r.work_date === 'string') byDate.set(r.work_date, r);
  }
  const kindOf = new Map((Array.isArray(md.days) ? md.days : []).map((d) => [d.date, d.kind]));
  const weeklyOff = Array.isArray(md.weeklyOff) ? md.weeklyOff : [];

  const bars: WeekBar[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const r = byDate.get(date);
    const kind = kindOf.get(date);
    return {
      date,
      minutes: r ? minutesOf(r, today, now) : 0,
      today: date === today,
      future: date > today,
      off: !r && (kind === 'weekoff' || kind === 'holiday' || (kind == null && weeklyOff.includes(weekdayOf(date)))),
    };
  });
  if (!bars.some((b) => b.minutes > 0)) return null;

  // The change against last week, over the same finished days: Monday up to yesterday, plus today once
  // it is clocked out — so a Wednesday morning isn't measured against last week's whole Wednesday.
  // Only once last week's records are in, and only when last week had time on those days.
  const todayRec = byDate.get(today);
  const upTo = (weekdayOf(today) + 6) % 7 - (todayRec?.out_at ? 0 : 1);
  const lastReady = !needPrev || (!!prevQ.data && !prevQ.isError);
  let lastWeek = 0;
  let thisWeek = 0;
  for (let i = 0; i <= upTo; i++) {
    const r = byDate.get(addDays(lastMonday, i));
    if (r) lastWeek += minutesOf(r, today, now);
    thisWeek += bars[i]?.minutes ?? 0;
  }
  const change = upTo >= 0 && lastReady && lastWeek > 0 ? thisWeek - lastWeek : null;
  return <WeekHoursCard bars={bars} change={change} />;
}

/** The card itself, from the week's seven days (Monday first) and the change in minutes against last week. */
export function WeekHoursCard({ bars, change }: { bars: WeekBar[]; change: number | null }) {
  const total = bars.reduce((n, b) => n + b.minutes, 0);
  const worked = bars.filter((b) => b.minutes > 0).length;
  const hours = Math.round(total / 6) / 10; // one decimal
  const delta: VizDeltaLabel | null =
    change == null
      ? null
      : Math.abs(change) < 1
        ? { label: 'Same as last week', direction: 'flat' }
        : { label: `${change > 0 ? '+' : MINUS}${durationLabel(Math.abs(change))}`, direction: change > 0 ? 'up' : 'down' };
  const tip = (i: number) => {
    const b = bars[i];
    if (!b) return '';
    if (b.minutes > 0) return durationLabel(b.minutes);
    return b.future ? 'Still to come' : b.off ? 'Day off' : 'No time';
  };

  return (
    <View style={styles.section}>
      <SectionHeader title="This week" />
      <Card tone="frost">
        <PillBarChart
          values={bars.map((b) => b.minutes / 60)}
          labels={LETTERS}
          spokenLabels={bars.map((b, i) => `${SPOKEN[i]}${b.today ? ' (today)' : ''}`)}
          formatValue={(_, i) => tip(i)}
          value={hours}
          unit="h"
          delta={delta}
          caption={delta && delta.direction !== 'flat' ? 'vs last week so far' : `Worked on ${worked} ${worked === 1 ? 'day' : 'days'}`}
          accessibilityLabel={`Hours worked this week: ${durationLabel(total)}, on ${worked} ${worked === 1 ? 'day' : 'days'}. Hours by day`}
        />
      </Card>
    </View>
  );
}

const styles = themedStyles(() => ({
  section: { gap: space.xs },
}));
