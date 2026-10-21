// Reports › one person: their countable tasks in the chosen dates (the website's Employee Wise row,
// expanded) with the hours per day. Same engine and same scope as the list, so a person outside the
// viewer's report (a deep link) gets an empty state, not their data.

import { useLocalSearchParams } from 'expo-router';
import { CircleCheck, ClipboardList, UserRound } from 'lucide-react-native';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useReportData } from '@/api/insights';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeReports, reportScopeOf } from '@/features/insights/access';
import { presetRange, rangeLabel, shortDay } from '@/features/insights/format';
import { InsightsGate, useInsightsAccess } from '@/features/insights/gate';
import { HeatStrip } from '@/features/insights/heat-strip';
import { buildReport, hoursText, ROLE_LABEL, taskDate } from '@/features/insights/reports';
import { isYmd, ymdRange } from '@/lib/ist';
import { plural } from '@/lib/format';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Card,
  EmptyState,
  ErrorState,
  NavHeader,
  Numeral,
  NumeralRow,
  PillBarChart,
  Screen,
  Skeleton,
  SkeletonList,
  Text,
} from '@/ui';

export default function ReportPersonRoute() {
  return (
    <InsightsGate title="Reports" allow={canSeeReports}>
      <ReportPersonScreen />
    </InsightsGate>
  );
}

function ReportPersonScreen() {
  const params = useLocalSearchParams<{ id: string; from?: string; to?: string }>();
  const { access } = useInsightsAccess();
  const user = access.user;
  const today = useTodayIst();
  const fallback = presetRange('month', today);
  const from = isYmd(params.from) ? params.from : fallback.from;
  const to = isYmd(params.to) && params.to >= from ? params.to : fallback.to;
  const data = useReportData(true);
  const scope = reportScopeOf(user);
  const ready = !!data.tasks && !!data.users && !!data.depts && !!data.projects;
  const meRole = user?.role ?? '';
  const meName = String(user?.name ?? '');
  const meDept = String(user?.dept ?? '');

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
            from,
            to,
            search: '',
            gridRole: 'all',
            gridMonth: to.slice(0, 7),
          })
        : null,
    [ready, data.tasks, data.users, data.depts, data.projects, data.corrections, meRole, meName, meDept, scope, from, to],
  );
  const row = report?.personRows.find((r) => r.user.id === params.id) ?? null;
  const days = ymdRange(from, to, 62);
  const perDay = days.map((d) => (row ? row.tasks.filter((t) => taskDate(t) === d).reduce((n, t) => n + report!.hoursOf(t), 0) : 0));
  const range = { key: 'custom' as const, from, to };

  const header = <NavHeader title={row?.user.name ?? 'Reports'} subtitle={rangeLabel(range, today)} />;

  if (!report) {
    return (
      <Screen header={header}>
        {data.error ? (
          <ErrorState message={data.error.message || 'The report could not be loaded.'} onRetry={() => void data.refetch()} />
        ) : (
          <>
            <Skeleton height={120} radius={radius.xl} />
            <SkeletonList rows={5} />
          </>
        )}
      </Screen>
    );
  }
  if (!row) {
    return (
      <Screen header={header}>
        <EmptyState icon={<UserRound color={palette.textMuted} strokeWidth={1.8} />} title="Not in your report" message="This person is not one of the people your report covers." />
      </Screen>
    );
  }

  const daysWorked = perDay.filter((h) => h > 0).length;
  return (
    <Screen header={header} onRefresh={data.refetch}>
      <Card>
        <Text variant="caption" muted style={{ marginBottom: space.xs }}>
          {ROLE_LABEL[row.user.role] || row.user.role}
        </Text>
        <Numeral value={hoursText(row.hours)} caption="Hours worked" style={{ marginBottom: space.md }} />
        <NumeralRow>
          <Numeral value={row.tasks.length} size="md" caption={row.tasks.length === 1 ? 'Task' : 'Tasks'} />
          <Numeral value={daysWorked} size="md" caption={daysWorked === 1 ? 'Day' : 'Days'} />
        </NumeralRow>
      </Card>

      {days.length > 1 ? (
        <Card>
          {days.length <= 10 ? (
            <PillBarChart
              values={perDay.map((h) => Math.round(h * 10) / 10)}
              labels={days.map((d) => String(Number(d.slice(8, 10))))}
              spokenLabels={days.map((d) => shortDay(d, today))}
              formatValue={(v) => hoursText(v)}
              caption="Hours a day"
              accessibilityLabel="Hours a day"
            />
          ) : (
            <View style={{ gap: space.xs }}>
              <Text variant="label" muted>
                Hours a day
              </Text>
              <HeatStrip values={perDay} label={`${plural(daysWorked, 'day')} with hours`} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="micro" muted>
                  {shortDay(days[0]!, today)}
                </Text>
                <Text variant="micro" muted>
                  {shortDay(days[days.length - 1]!, today)}
                </Text>
              </View>
            </View>
          )}
        </Card>
      ) : null}

      <ActivityList
        title="Tasks"
        empty={
          <EmptyState icon={<ClipboardList color={palette.textMuted} strokeWidth={1.8} />} title="No hours in these dates" message="Only sent or completed tasks with their timer stopped count." />
        }>
        {row.tasks.map((t) => {
              const corrected = report.correctedIds.has(t.id);
              return (
                <ActivityRow
                  key={t.id}
                  module="tasks"
                  icon={corrected ? CircleCheck : ClipboardList}
                  title={t.title || '—'}
                  subtitle={[shortDay(taskDate(t), today), t.kekaCode || t.project].filter(Boolean).join(' · ')}
                  note={corrected ? 'Hours corrected by a manager' : undefined}
                  value={hoursText(report.hoursOf(t))}
                />
              );
        })}
      </ActivityList>
    </Screen>
  );
}
