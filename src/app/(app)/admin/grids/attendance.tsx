// Attendance month — people × days, the spreadsheet view of the website's Team attendance
// (dash.html:4436 TeamAttendance, one day at a time on the web). Gate: HR_SECTIONS attendance with
// showTeam (HR admins, department admins) — features/grids/access.ts.
//
//   GET /hr/attendance/team?date=   one call per day of the month up to today (hr.js:962; server-scoped)
//   GET /hr/attendance/settings     weekly offs, to grey those days
//   GET /hr/holidays?year=          holidays, to grey those days (when the holidays module is on)
//   GET /hr/attendance/people       HR admins only: everyone, so people who never clocked in show too
//
// Read-only; nobody is messaged.

import { CalendarRange, Search } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useAttendanceSettings } from '@/api/attendance';
import { useHolidays } from '@/api/hr';
import { useClockRules } from '@/api/hrtime';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSetUpAttendance } from '@/features/hrtime/access';
import { useMonthTeamAttendance } from '@/features/grids/api';
import { GridView } from '@/features/grids/data-grid';
import { GridGateFallback, gridCsvColumns, RowSheet, ShareCsvButton, useGridGate, useZoom } from '@/features/grids/grid-ui';
import { buildSheet, monthDays, SHEET_LEGEND, sheetColumns, sheetDayLines, type SheetPerson } from '@/features/grids/model';
import { hrHas } from '@/lib/access';
import { monthYear } from '@/lib/dates';
import { addMonthsYm } from '@/lib/ist';
import { themedStyles } from '@/theme/themed';
import { moduleTone, space } from '@/theme/tokens';
import { Banner, Chip, ChipRow, EmptyState, NavHeader, PillField, Screen, SkeletonList, SummaryCard, Text } from '@/ui';

export default function AttendanceSheetScreen() {
  const today = useTodayIst();
  const thisMonth = today.slice(0, 7);
  const { access, allowed, pending } = useGridGate('attendance');
  const { zoom, actions } = useZoom(0);
  const [ym, setYm] = useState(thisMonth);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<SheetPerson | null>(null);

  const settings = useAttendanceSettings(allowed);
  const holidays = useHolidays(ym.slice(0, 4), allowed && hrHas(access.hr, 'holidays'));
  const everyoneQ = useClockRules(allowed && canSetUpAttendance(access.hr, access.user));
  const weeklyOff = Array.isArray(settings.data?.weeklyOff) ? settings.data.weeklyOff : [0];
  const hols = Array.isArray(holidays.data?.holidays) ? holidays.data.holidays : [];
  const days = monthDays(ym, today, weeklyOff, hols);
  const asked = days.filter((d) => !d.future).map((d) => d.ymd);
  const month = useMonthTeamAttendance(asked, allowed);

  const header = <NavHeader title="Attendance" subtitle={monthYear(ym)} actions={allowed ? actions : undefined} />;
  if (!allowed) return <GridGateFallback pending={pending} header={header} />;

  const everyone = (Array.isArray(everyoneQ.data) ? everyoneQ.data : []).map((p) => ({ id: p.id, name: p.name, department: p.department }));
  const all = buildSheet(days, month.byDate, everyone);
  const s = query.trim().toLowerCase();
  const rows = all.filter((p) => !s || `${p.name} ${p.department}`.toLowerCase().includes(s));
  const { first, columns } = sheetColumns(days, month.byDate);
  const loading = month.loaded < asked.length;
  const presentDays = all.reduce((t, p) => t + p.present + p.half + p.short, 0);
  const late = all.reduce((t, p) => t + p.late, 0);
  const months = [0, -1, -2, -3, -4, -5].map((n) => addMonthsYm(thisMonth, n));

  const top = (
    <>
      <ChipRow>
        {months.map((m) => (
          <Chip key={m} label={monthYear(m, 'short')} selected={m === ym} onPress={() => setYm(m)} />
        ))}
      </ChipRow>
      <PillField icon={Search} value={query} onChangeText={setQuery} placeholder="Search by name or team" accessibilityLabel="Search people" autoCorrect={false} />
      {month.error ? <Banner tone="danger" title="Some days couldn’t load" message={month.error.message || 'Pull down to try again.'} /> : null}
      <View style={styles.line}>
        <Text variant="label" muted>
          {loading
            ? `Loading days… ${month.loaded} of ${asked.length}`
            : `${all.length} ${all.length === 1 ? 'person' : 'people'} · ${presentDays} days worked · ${late} late`}
        </Text>
        <Text variant="caption" muted>
          {SHEET_LEGEND}
        </Text>
      </View>
    </>
  );

  return (
    <Screen scroll={false} header={header} animate={false} contentStyle={styles.bleed}>
      <GridView
        rows={rows}
        rowKey={(p) => p.id}
        first={first}
        columns={columns}
        zoom={zoom}
        onRowPress={setOpen}
        rowLabel={(p) => `${p.name}: ${p.present} present, ${p.late} late, ${p.half} half days, ${p.absent} not in`}
        top={top}
        onRefresh={month.refetch}
        empty={
          loading ? (
            <SkeletonList rows={6} tone="surface" />
          ) : (
            <EmptyState
              icon={<CalendarRange color={moduleTone.attendance.fg} strokeWidth={1.8} />}
              title={s ? 'Nobody matches' : 'Nobody clocked in'}
              message={s ? 'Try another name.' : `No attendance recorded in ${monthYear(ym)} for the people you look after.`}
            />
          )
        }
        bottom={
          <>
            {!everyone.length ? (
              <Text variant="caption" muted align="center">
                Shows the people who clocked in at least once this month.
              </Text>
            ) : null}
            <ShareCsvButton fileName={`attendance-${ym}`} rows={rows} columns={gridCsvColumns(first, columns)} />
          </>
        }
      />
      <RowSheet row={open} title={open?.name ?? ''} subtitle={[open?.department, monthYear(ym)].filter(Boolean).join(' · ')} columns={columns} onClose={() => setOpen(null)}>
        {open ? (
          <SummaryCard
            title="Days"
            rows={(() => {
              const lines = sheetDayLines(open, days, today);
              return lines.length ? lines : [{ key: 'none', label: 'No clock-ins', value: 'This month' }];
            })()}
          />
        ) : null}
      </RowSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  bleed: { paddingHorizontal: 0 },
  line: { gap: space.xxs },
}));
