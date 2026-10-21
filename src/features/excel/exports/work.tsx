// Excel downloads about work and time:
//   Reports          ReportsView export (dash.html:23812, one "Report" sheet per type; the phone can
//                    also put all four in one file). Computed by features/insights/reports (the same
//                    port the Reports screen uses), so the hours match.
//   Keka code time   KekaCodeReportModal (:22370): the website shares one tab as CSV; here every tab is
//                    a sheet of one workbook (people, their task lines, locations, IT tickets, admin requests).

import { Hash, Search } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useReportData } from '@/api/insights';
import { useTodayIst } from '@/features/attendance/use-now';
import { seesAllCodes } from '@/features/excel/access';
import { useApiList } from '@/features/excel/api';
import type { ExportDef } from '@/features/excel/catalog';
import { ChoiceCard, ExportShell, PickedRow, type Range, RangeCard } from '@/features/excel/export-shell';
import { useExcelAccess } from '@/features/excel/gate';
import { type Correction, kekaReport } from '@/features/excel/work-time';
import { reportScopeOf } from '@/features/insights/access';
import { buildReport, exportRows, type ReportType } from '@/features/insights/reports';
import { ownsProject } from '@/features/work/access';
import { objectsToRows } from '@/lib/xlsx';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { ListCard, ListRow, Sheet, Text, TextField } from '@/ui';

const TYPES: { key: ReportType | 'all'; label: string; sheet: string }[] = [
  { key: 'employee', label: 'People', sheet: 'People' },
  { key: 'project', label: 'Projects', sheet: 'Projects' },
  { key: 'keka', label: 'Keka codes', sheet: 'Keka codes' },
  { key: 'grid', label: 'Month grid', sheet: 'Month grid' },
  { key: 'all', label: 'All four', sheet: '' },
];

export function ReportsExport({ def }: { def: ExportDef }) {
  const { ready, access } = useExcelAccess();
  const today = useTodayIst();
  const data = useReportData(ready);
  const [type, setType] = useState<ReportType | 'all'>('employee');
  const [range, setRange] = useState<Range>({ from: `${today.slice(0, 7)}-01`, to: today });
  const user = access.user;
  const loaded = !!data.tasks && !!data.users && !!data.depts && !!data.projects;
  const report = loaded
    ? buildReport({
        tasks: data.tasks ?? [],
        users: data.users ?? [],
        depts: data.depts ?? [],
        projects: data.projects ?? [],
        corrections: data.corrections,
        me: user ? { role: user.role, name: String(user.name ?? ''), dept: String(user.dept ?? '') } : null,
        scope: reportScopeOf(user),
        from: range.from,
        to: range.to,
        search: '',
        gridRole: 'all',
        gridMonth: (range.from || today).slice(0, 7),
      })
    : null;
  const count = report ? (type === 'all' ? exportRows('employee', report).length : exportRows(type, report).length) : null;
  return (
    <ExportShell
      def={def}
      ready={ready && loaded}
      intro={
        reportScopeOf(user) === 'global'
          ? 'Hours and tasks for everyone in the company, from the same numbers as the Reports screen. The month grid uses the month of the From date.'
          : 'Hours and tasks for your team, from the same numbers as the Reports screen. The month grid uses the month of the From date.'
      }
      count={count}
      disabled={!range.from || !range.to ? 'Choose the dates.' : false}
      build={() => {
        if (!report) return null;
        const types = type === 'all' ? (['employee', 'project', 'keka', 'grid'] as ReportType[]) : [type];
        const sheets = types.map((t) => {
          const rows = exportRows(t, report);
          return { name: type === 'all' ? (TYPES.find((x) => x.key === t)?.sheet ?? t) : 'Report', rows: rows.length ? objectsToRows(rows) : [['Nothing in these dates']] };
        });
        return { fileName: `reports_${type}_${today}`, sheets };
      }}>
      <ChoiceCard title="Report" value={type} onChange={setType} options={TYPES.map((t) => ({ key: t.key, label: t.label }))} />
      <RangeCard value={range} onChange={setRange} today={today} presets={['month', 'last', '7', '30']} />
    </ExportShell>
  );
}

// ── One Keka code ────────────────────────────────────────────────────────────
type Proj = { id: string; name?: string; kekaCode?: string; costCodeOwner?: string; status?: string };

export function KekaExport({ def }: { def: ExportDef }) {
  const { ready, access } = useExcelAccess();
  const today = useTodayIst();
  const projects = useApiList<Proj>('/projects', { enabled: ready });
  const tasks = useApiList('/tasks', { enabled: ready });
  const bookings = useApiList('/bookings', { enabled: ready });
  const tickets = useApiList('/tickets', { enabled: ready });
  const corrections = useApiList<Correction>('/time_corrections', { enabled: ready });
  const [range, setRange] = useState<Range>({ from: `${today.slice(0, 7)}-01`, to: today });
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [codeId, setCodeId] = useState<string | null>(null);
  const all = seesAllCodes(access);
  const mine = (projects.data ?? []).filter((p) => all || ownsProject(p, { name: access.user?.name }));
  const chosen = mine.find((p) => p.id === codeId) ?? null;
  const needle = q.trim().toLowerCase();
  const matches = mine.filter((p) => !needle || String(p.name ?? '').toLowerCase().includes(needle) || String(p.kekaCode ?? '').toLowerCase().includes(needle)).slice(0, 80);
  const loading = projects.isPending || tasks.isPending || bookings.isPending;
  const rep =
    chosen && !loading
      ? kekaReport({
          code: String(chosen.kekaCode ?? ''),
          project: String(chosen.name ?? ''),
          from: range.from,
          to: range.to,
          tasks: tasks.data ?? [],
          bookings: bookings.data ?? [],
          tickets: tickets.data ?? [],
          corrections: corrections.data ?? [],
        })
      : null;
  return (
    <ExportShell
      def={def}
      ready={ready && !loading}
      intro="For one Keka code: who worked on it (days, hours, tasks) with each task line, the shoot locations booked against it, and the IT tickets and admin requests raised on it."
      count={rep ? rep.counts.tasks + rep.counts.bookings + rep.counts.tickets + rep.counts.admin : null}
      countNoun={['record', 'records']}
      disabled={!chosen ? 'Choose a Keka code first.' : !range.from || !range.to ? 'Choose the dates.' : false}
      build={() => {
        if (!chosen || !rep) return null;
        return {
          fileName: `${String(chosen.kekaCode || 'code').replace(/[^\w.-]+/g, '_')}_report_${range.from}_to_${range.to}`,
          sheets: [
            { name: 'Employees', rows: rep.employees, cols: [24, 12, 12, 8] },
            { name: 'Employee tasks', rows: rep.employeeDetail, cols: [22, 13, 11, 11, 8, 40] },
            { name: 'Locations', rows: rep.locations, cols: [24, 12, 12, 10] },
            { name: 'IT support', rows: rep.itSupport, cols: [13, 36, 20, 10, 12, 30] },
            { name: 'Admin requests', rows: rep.adminRequests, cols: [13, 30, 20, 10, 12, 30] },
          ],
        };
      }}>
      <PickedRow icon={Hash} title={chosen?.kekaCode || chosen?.name} sub={chosen ? chosen.name : null} placeholder="Choose a Keka code" onChange={() => setPicking(true)} />
      <RangeCard value={range} onChange={setRange} today={today} presets={['month', 'last', '30', 'fy']} />
      <Sheet visible={picking} onClose={() => setPicking(false)} title="Keka code" subtitle={all ? 'Every project code' : 'The codes you own'}>
        <View style={styles.gap}>
          <TextField placeholder="Search code or project" value={q} onChangeText={setQ} left={<Search size={18} />} autoCorrect={false} />
          {matches.length ? (
            <ListCard>
              {matches.map((p) => (
                <ListRow
                  key={p.id}
                  title={String(p.kekaCode || p.name || '')}
                  subtitle={[p.name, p.costCodeOwner].filter(Boolean).join(' · ')}
                  onPress={() => {
                    setCodeId(p.id);
                    setPicking(false);
                  }}
                />
              ))}
            </ListCard>
          ) : (
            <Text variant="caption" muted>
              No code matches.
            </Text>
          )}
        </View>
      </Sheet>
    </ExportShell>
  );
}

const styles = themedStyles(() => ({ gap: { gap: space.sm } }));
