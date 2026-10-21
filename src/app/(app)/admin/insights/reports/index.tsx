// Reports (web ReportsView, dash.html:23646) for super_admin / ceo / coo / hr (every department) and
// admin / manager / app_manager (their team). Everything is computed on the phone from the same five
// lists the website loads, by features/insights/reports.ts (a line-for-line port), so the hours match.
//
// Phone layout (docs/port/team-ops.md §3.4): People · Projects · Codes · Month, a date range and a
// search. The Month view is the Attendance grid as one row per person with a strip of days (the full
// 32-column table stays on the website, but the CSV carries every day). Share sends exactly the rows
// on screen as CSV (Excel stays web-only). Nothing is written from here; "Edit hours" is unreachable on
// the website (no staff role opens Reports) and is not ported.

import { useRouter } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, FolderKanban, Hash, Search, Share2, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useReportData } from '@/api/insights';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeReports, reportScopeOf } from '@/features/insights/access';
import { type DateRange, monthLabelOf, presetRange, rangeLabel, shortDay } from '@/features/insights/format';
import { InsightsGate, useInsightsAccess } from '@/features/insights/gate';
import { HeatStrip } from '@/features/insights/heat-strip';
import { RangeSheet } from '@/features/insights/range-sheet';
import { buildReport, exportRows, hoursText, pct, type ReportType } from '@/features/insights/reports';
import { shareCsv } from '@/lib/csv';
import { addMonthsYm } from '@/lib/ist';
import { plural } from '@/lib/format';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  IconButton,
  MetricRow,
  NavHeader,
  Numeral,
  NumeralRow,
  PillField,
  PillSelector,
  Screen,
  Segmented,
  Sheet,
  Skeleton,
  SkeletonList,
  Text,
  toast,
} from '@/ui';

const TYPES: { key: ReportType; label: string }[] = [
  { key: 'employee', label: 'People' },
  { key: 'project', label: 'Projects' },
  { key: 'keka', label: 'Codes' },
  { key: 'grid', label: 'Month' },
];

const DEFAULT_PROF_TYPES = [
  { id: 'cinematographer', label: 'Cinematographer', active: true },
  { id: 'editor', label: 'Editor', active: true },
  { id: 'graphic_designer', label: 'Graphic Designer', active: true },
];

/** How many rows are drawn at once; search narrows the rest (the CSV always has every row). */
const PAGE = 150;

export default function ReportsRoute() {
  return (
    <InsightsGate title="Reports" allow={canSeeReports}>
      <ReportsScreen />
    </InsightsGate>
  );
}

function ReportsScreen() {
  const router = useRouter();
  const { access } = useInsightsAccess();
  const user = access.user;
  const scope = reportScopeOf(user);
  const today = useTodayIst();
  const data = useReportData(true);

  const [type, setType] = useState<ReportType>('employee');
  const [range, setRange] = useState<DateRange>(() => presetRange('month', today));
  const [rangeOpen, setRangeOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [gridMonth, setGridMonth] = useState(() => today.slice(0, 7));
  const [gridRole, setGridRole] = useState('all');
  const [dayFor, setDayFor] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  // activeProfTypes (dash.html:1711): the company's professional categories still switched on.
  const profTypes = (Array.isArray(access.tenant?.profTypes) && access.tenant.profTypes.length ? access.tenant.profTypes : DEFAULT_PROF_TYPES).filter(
    (t) => t && t.active !== false,
  );

  const meRole = user?.role ?? '';
  const meName = String(user?.name ?? '');
  const meDept = String(user?.dept ?? '');
  const ready = !!data.tasks && !!data.users && !!data.depts && !!data.projects;
  const report = useMemo(
    () =>
      ready
        ? buildReport({
            tasks: data.tasks ?? [],
            users: data.users ?? [],
            depts: data.depts ?? [],
            projects: data.projects ?? [],
            corrections: data.corrections,
            me: { role: meRole, name: meName, dept: meDept },
            scope,
            from: range.from,
            to: range.to,
            search,
            gridRole,
            gridMonth,
          })
        : null,
    [ready, data.tasks, data.users, data.depts, data.projects, data.corrections, meRole, meName, meDept, scope, range.from, range.to, search, gridRole, gridMonth],
  );

  async function share() {
    if (!report) return;
    const rows = exportRows(type, report);
    if (!rows.length) {
      toast.show('Nothing to share for these dates.', 'info');
      return;
    }
    const keys = Object.keys(rows[0]!);
    setSharing(true);
    try {
      await shareCsv(`reports_${type}_${today}`, rows, keys.map((k) => ({ label: k, value: (r: Record<string, string | number>) => r[k] })), 'Share report');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'The report could not be shared.', 'danger');
    } finally {
      setSharing(false);
    }
  }

  const searchHint = type === 'keka' ? 'Search project code or project' : type === 'project' ? 'Search project' : 'Search name';
  const rangeOptions = (['today', 'week', 'month', 'lastMonth'] as const).map((k) => {
    const r = presetRange(k, today);
    return { key: k, label: rangeLabel(r, today), from: r.from, to: r.to };
  });

  const header = (
    <NavHeader
      title="Reports"
      subtitle={scope === 'global' ? 'All departments' : user?.role === 'manager' ? 'People who report to you' : 'Your department'}
      actions={[{ key: 'share', icon: Share2, label: sharing ? 'Sharing the report' : 'Share as CSV', onPress: () => void share(), disabled: !report || sharing }]}
    />
  );

  return (
    <Screen header={header} onRefresh={data.refetch}>
      <Segmented
        options={TYPES}
        value={type}
        onChange={(k) => {
          setType(k);
          setSearch('');
        }}
      />

      {type === 'grid' ? (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <IconButton accessibilityLabel="Previous month" onPress={() => setGridMonth((m) => addMonthsYm(m, -1))}>
              <ChevronLeft size={20} color={palette.ink} strokeWidth={1.8} />
            </IconButton>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="bodyStrong" color={palette.ink}>
                {monthLabelOf(gridMonth)}
              </Text>
            </View>
            <IconButton accessibilityLabel="Next month" onPress={() => setGridMonth((m) => addMonthsYm(m, 1))} disabled={gridMonth >= today.slice(0, 7)}>
              <ChevronRight size={20} color={palette.ink} strokeWidth={1.8} />
            </IconButton>
          </View>
          <ChipRow>
            <Chip label="Everyone" selected={gridRole === 'all'} onPress={() => setGridRole('all')} />
            {profTypes.map((t) => (
              <Chip key={t.id} label={t.label} selected={gridRole === t.id} onPress={() => setGridRole(t.id)} />
            ))}
          </ChipRow>
        </View>
      ) : (
        <View style={{ flexDirection: 'row' }}>
          <PillSelector icon={CalendarDays} label={rangeLabel(range, today)} onPress={() => setRangeOpen(true)} accessibilityLabel={`Dates: ${rangeLabel(range, today)}`} />
        </View>
      )}
      <PillField icon={Search} placeholder={searchHint} value={search} onChangeText={setSearch} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />

      {!report ? (
        data.error ? (
          <ErrorState message={data.error.message || 'The report could not be loaded.'} onRetry={() => void data.refetch()} />
        ) : (
          <>
            <Skeleton height={120} radius={radius.xl} />
            <SkeletonList rows={6} />
          </>
        )
      ) : type === 'employee' ? (
        <PeopleView report={report} onOpen={(id) => router.push({ pathname: '/admin/insights/reports/person/[id]', params: { id, from: range.from, to: range.to } })} searching={!!search.trim()} />
      ) : type === 'project' ? (
        report.projectRows.length ? (
          <View style={{ gap: space.sm }}>
            <Totals hours={report.projectRows.reduce((n, r) => n + r.hours, 0)} tasks={report.projectRows.reduce((n, r) => n + r.tasks.length, 0)} third={{ value: report.projectRows.length, caption: report.projectRows.length === 1 ? 'Project' : 'Projects' }} />
            {report.projectRows.slice(0, PAGE).map((r) => (
              <MetricRow
                key={r.project.id}
                module="tasks"
                label={String(r.project.name ?? '—')}
                sub={[r.project.kekaCode, plural(r.tasks.length, 'task')].filter(Boolean).join(' · ')}
                value={hoursText(r.hours)}
                status={{ label: `${pct(r.tasks)} done`, tone: r.tasks.every((t) => t.status === 'completed') ? 'done' : 'neutral' }}
              />
            ))}
            <More shown={Math.min(PAGE, report.projectRows.length)} total={report.projectRows.length} />
          </View>
        ) : (
          <EmptyState icon={<FolderKanban color={palette.textMuted} strokeWidth={1.8} />} title="No data for this period" message={search ? 'No project matches that search.' : 'No hours were logged against a project in these dates.'} />
        )
      ) : type === 'keka' ? (
        report.kekaRows.length ? (
          <View style={{ gap: space.sm }}>
            {scope === 'team' ? (
              <Text variant="caption" muted>
                Codes count everyone’s hours in the company, as on the website.
              </Text>
            ) : null}
            {report.kekaRows.slice(0, PAGE).map((g) => (
              <MetricRow
                key={g.code}
                module="timesheets"
                label={g.code}
                sub={`${g.project} · ${plural(g.tasks.length, 'task')}`}
                value={hoursText(g.hours)}
                status={{ label: `${pct(g.tasks)} done`, tone: g.tasks.every((t) => t.status === 'completed') ? 'done' : 'neutral' }}
              />
            ))}
            <More shown={Math.min(PAGE, report.kekaRows.length)} total={report.kekaRows.length} />
          </View>
        ) : (
          <EmptyState icon={<Hash color={palette.textMuted} strokeWidth={1.8} />} title="No data for this period" message={search ? 'No project code matches that search.' : 'No hours were logged against a project code in these dates.'} />
        )
      ) : report.gridRows.length ? (
        <View style={{ gap: space.sm }}>
          <Text variant="caption" muted>
            Each square is one day of {monthLabelOf(gridMonth)}. Darker means more hours. Tap a person for their days.
          </Text>
          {report.gridRows.slice(0, PAGE).map((g) => (
            <Card key={g.user.id} onPress={() => setDayFor(g.user.id)} accessibilityLabel={`${g.user.name}, ${g.total ? hoursText(g.total) : 'no hours'} in ${monthLabelOf(gridMonth)}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs }}>
                <Text variant="bodyStrong" color={palette.ink} numberOfLines={1} style={{ flex: 1 }}>
                  {g.user.name}
                </Text>
                <Text variant="bodyStrong" color={g.total ? palette.ink : palette.textMuted} tabular>
                  {g.total ? hoursText(g.total) : '—'}
                </Text>
              </View>
              <HeatStrip values={g.cells} weekend={report.gridDays.map((d) => d.weekend)} label={`${report.gridDays.filter((_, i) => (g.cells[i] ?? 0) > 0).length} days with hours`} />
            </Card>
          ))}
          <More shown={Math.min(PAGE, report.gridRows.length)} total={report.gridRows.length} />
        </View>
      ) : (
        <EmptyState icon={<Users color={palette.textMuted} strokeWidth={1.8} />} title="No one to show" message={gridRole !== 'all' ? 'No one in this category.' : search ? 'No one matches that search.' : 'No one is in this report yet.'} />
      )}

      <RangeSheet
        visible={rangeOpen}
        onClose={() => setRangeOpen(false)}
        options={rangeOptions}
        value={range}
        maxDate={today}
        onPick={(r) => setRange({ key: r.key === 'custom' ? 'custom' : r.key, from: r.from, to: r.to })}
      />

      <MonthSheet report={report} userId={dayFor} today={today} onClose={() => setDayFor(null)} />
    </Screen>
  );
}

function Totals({ hours, tasks, third }: { hours: number; tasks: number; third: { value: number; caption: string } }) {
  return (
    // The hours are the hero ("35h 48m" is too wide to share a row on a phone); the counts sit under it.
    <Card style={{ gap: space.md }}>
      <Numeral value={hoursText(hours)} caption="Hours worked" />
      <NumeralRow>
        <Numeral value={tasks} size="md" caption={tasks === 1 ? 'Task' : 'Tasks'} />
        <Numeral value={third.value} size="md" caption={third.caption} />
      </NumeralRow>
    </Card>
  );
}

function More({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  return (
    <Text variant="caption" muted align="center">
      Showing {shown} of {total}. Search to find the rest; Share has every row.
    </Text>
  );
}

function PeopleView({ report, onOpen, searching }: { report: NonNullable<ReturnType<typeof buildReport>>; onOpen: (id: string) => void; searching: boolean }) {
  const rows = report.personRows;
  if (!rows.length) {
    return (
      <EmptyState
        icon={<Users color={palette.textMuted} strokeWidth={1.8} />}
        title={searching ? 'No one matches' : 'No one to show'}
        message={searching ? 'Try another name.' : 'No one is in this report yet. Managers see the people whose reporting manager they are.'}
      />
    );
  }
  const hours = rows.reduce((n, r) => n + r.hours, 0);
  const tasks = rows.reduce((n, r) => n + r.tasks.length, 0);
  const withHours = rows.filter((r) => r.hours > 0).length;
  return (
    <View style={{ gap: space.sm }}>
      <Totals hours={hours} tasks={tasks} third={{ value: withHours, caption: withHours === 1 ? 'Person with hours' : 'People with hours' }} />
      {rows.slice(0, PAGE).map((r) => (
        <MetricRow
          key={r.user.id}
          module="people"
          label={r.user.name}
          sub={r.tasks.length ? plural(r.tasks.length, 'task') : 'No hours in these dates'}
          value={hoursText(r.hours)}
          onPress={() => onOpen(r.user.id)}
          hint="Opens their tasks"
        />
      ))}
      <More shown={Math.min(PAGE, rows.length)} total={rows.length} />
    </View>
  );
}

function MonthSheet({ report, userId, today, onClose }: { report: ReturnType<typeof buildReport> | null; userId: string | null; today: string; onClose: () => void }) {
  const row = report?.gridRows.find((g) => g.user.id === userId) ?? null;
  const days = row && report ? report.gridDays.map((d, i) => ({ ...d, hours: row.cells[i] ?? 0 })).filter((d) => d.hours > 0) : [];
  return (
    <Sheet visible={!!row} onClose={onClose} title={row?.user.name ?? ''} subtitle={row ? `${row.total ? hoursText(row.total) : 'No hours'} · ${plural(days.length, 'day')}` : undefined}>
      {days.length ? (
        <ActivityList>
          {days.map((d) => (
            <ActivityRow key={d.date} module="timesheets" icon={Clock3} title={shortDay(d.date, today)} subtitle={d.weekend ? 'Weekend' : undefined} value={hoursText(d.hours)} />
          ))}
        </ActivityList>
      ) : (
        <EmptyState title="No hours this month" />
      )}
    </Sheet>
  );
}
