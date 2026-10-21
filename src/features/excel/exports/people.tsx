// Excel downloads about people:
//   Employee roster      EmpRoster downloadRoster (dash.html:5818): the current status filter, same columns
//   My timesheet         TimesheetCard exportExcel (:28724) for me
//   Someone's timesheet  the same sheet from EmpProfileModal (:29929), for people I may see (canViewTimesheet)
//   Someone's bookings   EmployeeBookingSummary download (:29783)

import { useState } from 'react';

import { api, isApiError } from '@/api/client';
import { mergeRoster, useRoster } from '@/api/people';
import { useTodayIst } from '@/features/attendance/use-now';
import { canViewTimesheetOf } from '@/features/excel/access';
import { useApiList } from '@/features/excel/api';
import type { ExportDef } from '@/features/excel/catalog';
import { ChoiceCard, ExportShell, PickedRow, type Range, RangeCard } from '@/features/excel/export-shell';
import { xHrs } from '@/features/excel/format';
import { useExcelAccess } from '@/features/excel/gate';
import { bookingRows, type Correction, type ProjectLite, type SheetDay, TIMESHEET_HEAD, timesheetBody, timesheetRows } from '@/features/excel/work-time';
import { PersonPicker, type PickPerson, usePickablePeople } from '@/features/shared/person-picker';
import { ROLE_LABEL } from '@/lib/access';
import { letterheadRows } from '@/lib/xlsx';
import { Banner } from '@/ui';

type Dept = { id: string; name: string };
const deptName = (dept: unknown, depts: readonly Dept[]) => {
  const d = String(dept ?? '');
  return depts.find((x) => x.id === d)?.name || depts.find((x) => x.name.toLowerCase() === d.toLowerCase())?.name || (d && !/^[du]\d/.test(d) ? d : '');
};

// ── Roster ───────────────────────────────────────────────────────────────────
type RosterView = 'all' | 'active' | 'invited' | 'resigned';

export function RosterExport({ def }: { def: ExportDef }) {
  const { ready } = useExcelAccess();
  const today = useTodayIst();
  const roster = useRoster(ready);
  const depts = useApiList<Dept>('/departments', { enabled: ready });
  const [view, setView] = useState<RosterView>('all');
  const rows = roster.data?.rows ?? [];
  const pick = (v: RosterView) => rows.filter((r) => (v === 'all' ? true : v === 'resigned' ? r.resigned : v === 'invited' ? r.invited && !r.resigned : !r.invited && !r.resigned));
  const chosen = pick(view);
  return (
    <ExportShell
      def={def}
      ready={ready && !roster.isPending}
      intro="One row per person: employee ID, name, work email, gender, mobile, location, department, job title, reporting manager, joining date, birthday, blood group, status and role."
      sensitive="The file holds personal details (mobile, birthday, blood group). Share it only with people who need it."
      count={chosen.length}
      countNoun={['person', 'people']}
      disabled={!chosen.length ? 'No one matches this view.' : false}
      build={async () => {
        // Re-read the roster so the file is what the server has now.
        const [u, w] = await Promise.all([api.get<Record<string, unknown>[]>('/users'), api.get<Record<string, unknown>[]>('/whitelist')]);
        if (isApiError(u)) throw new Error(u.error);
        const fresh = mergeRoster(Array.isArray(u) ? u : [], Array.isArray(w) ? w : []).rows;
        const list = fresh.filter((r) => (view === 'all' ? true : view === 'resigned' ? r.resigned : view === 'invited' ? r.invited && !r.resigned : !r.invited && !r.resigned));
        const d = depts.data ?? [];
        const head = ['Emp No.', 'Name', 'Work Email', 'Gender', 'Mobile', 'Location', 'Department', 'Job Title', 'Reporting Manager', 'Date Joined', 'DOB', 'Blood Group', 'Status', 'Role'];
        const body = list.map((r) => [
          r.employeeNumber,
          r.name,
          r.email,
          r.gender,
          r.mobile,
          r.location,
          deptName(r.dept, d),
          r.jobTitle,
          r.reportingManager,
          r.dateJoined,
          r.dob,
          r.bloodGroup,
          r.resigned ? 'Resigned' : r.invited ? 'Pending Signup' : 'Active',
          ROLE_LABEL[r.role] || r.role,
        ]);
        const suffix = view === 'all' ? '' : `_${view === 'invited' ? 'pending' : view}`;
        return { fileName: `employee_roster${suffix}_${today}`, sheets: [{ name: 'Employee Roster', rows: [head, ...body], cols: [10, 22, 28, 9, 16, 12, 18, 26, 22, 12, 12, 10, 14, 14] }] };
      }}>
      <ChoiceCard
        title="Who"
        value={view}
        onChange={setView}
        options={[
          { key: 'all', label: 'Everyone', count: pick('all').length },
          { key: 'active', label: 'Active', count: pick('active').length },
          { key: 'invited', label: 'Not signed up', count: pick('invited').length },
          { key: 'resigned', label: 'Resigned', count: pick('resigned').length },
        ]}
      />
    </ExportShell>
  );
}

// ── Timesheets ───────────────────────────────────────────────────────────────
type Person = { id: string; name: string; empId: string; jobRole: string; dept: string; branch: string; reportingManager?: string; additionalManager?: string };

function personOf(p: PickPerson, depts: readonly Dept[]): Person {
  const x = p.extra ?? {};
  return {
    id: p.id,
    name: p.name,
    empId: String(p.employeeNumber || x.kekaCode || '') || '—',
    jobRole: p.jobTitle || String(x.jobRole || '') || '—',
    dept: deptName(p.dept, depts) || '—',
    branch: String(x.location || x.city || '') || '—',
    reportingManager: p.reportingManager || '',
    additionalManager: String(x.additionalManager || ''),
  };
}

function useTimeLists(enabled: boolean) {
  const tasks = useApiList('/tasks', { enabled });
  const bookings = useApiList('/bookings', { enabled });
  const corrections = useApiList<Correction>('/time_corrections', { enabled });
  const projects = useApiList<ProjectLite>('/projects', { enabled });
  const depts = useApiList<Dept>('/departments', { enabled });
  const loading = tasks.isPending || bookings.isPending || corrections.isPending || projects.isPending;
  return { tasks, bookings, corrections, projects, depts, loading };
}

export function TimesheetExport({ def, other }: { def: ExportDef; other: boolean }) {
  const { ready, user, access } = useExcelAccess();
  const today = useTodayIst();
  const [range, setRange] = useState<Range>({ from: `${today.slice(0, 7)}-01`, to: today });
  const lists = useTimeLists(ready);
  const people = usePickablePeople({ enabled: ready, keep: ['kekaCode', 'jobRole', 'location', 'city', 'additionalManager', 'email'] });
  const [picking, setPicking] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const viewer = user ? { role: user.role, name: user.name } : null;
  const depts = lists.depts.data ?? [];
  const meRow = (people.data ?? []).find((p) => p.id === user?.id);
  const target: Person | null = other
    ? (() => {
        const p = (people.data ?? []).find((x) => x.id === chosenId);
        return p ? personOf(p, depts) : null;
      })()
    : user
      ? meRow
        ? personOf(meRow, depts)
        : { id: user.id, name: user.name ?? '', empId: String(user.employeeNumber || user.kekaCode || '—'), jobRole: user.jobTitle || '—', dept: deptName(user.dept, depts) || '—', branch: '—' }
      : null;

  const computed =
    target && !lists.loading
      ? timesheetRows({
          person: { id: target.id, name: target.name },
          from: range.from,
          to: range.to,
          sheets: [],
          tasks: lists.tasks.data ?? [],
          bookings: lists.bookings.data ?? [],
          corrections: lists.corrections.data ?? [],
          projects: lists.projects.data ?? [],
        })
      : null;

  return (
    <ExportShell
      def={def}
      ready={ready && !lists.loading}
      intro="Every task, professional booking and submitted timesheet line in the dates you choose, with start and end times and hours. A day with a submitted timesheet is counted from that timesheet only."
      count={other && !target ? null : computed?.rows.length}
      countNoun={['row', 'rows']}
      disabled={other && !target ? 'Choose a person first.' : !range.from || !range.to ? 'Choose the dates.' : false}
      build={async () => {
        if (!target) return null;
        // Submitted timesheets: only the signed-in person's own (GET /hr/timesheet/mine). A role that
        // files none gets a refusal, which the website ignores too.
        let sheets: SheetDay[] = [];
        if (!other) {
          const r = await api.get<{ days?: SheetDay[] }>(`/hr/timesheet/mine?from=${range.from}&to=${range.to}`);
          sheets = !isApiError(r) && Array.isArray(r?.days) ? r.days : [];
        }
        const { rows, totalHours } = timesheetRows({
          person: { id: target.id, name: target.name },
          from: range.from,
          to: range.to,
          sheets,
          tasks: lists.tasks.data ?? [],
          bookings: lists.bookings.data ?? [],
          corrections: lists.corrections.data ?? [],
          projects: lists.projects.data ?? [],
        });
        const meta = [
          ['Employee ID', target.empId],
          ['Name', target.name],
          ['Job Role', target.jobRole],
          ['Department', target.dept],
          ['Branch', target.branch],
        ];
        const sheet = [...letterheadRows(access.tenant, 'Timesheet', `Period: ${range.from} to ${range.to}   ·   Total Hours: ${xHrs(totalHours)}`), ...meta, [], TIMESHEET_HEAD, ...timesheetBody(rows)];
        return { fileName: `Timesheet_${target.name.replace(/\s+/g, '_')}_${range.from}_to_${range.to}`, sheets: [{ name: 'Timesheet', rows: sheet, cols: [12, 13, 10, 28, 36, 20, 11, 11, 8, 12] }] };
      }}>
      {other ? (
        <>
          <PickedRow title={target?.name} sub={target ? `${target.empId} · ${target.dept}` : null} placeholder="Choose a person" onChange={() => setPicking(true)} />
          <PersonPicker
            visible={picking}
            onClose={() => setPicking(false)}
            title="Whose timesheet"
            people={people.data}
            loading={people.isPending}
            allowOnLeave
            recentKey="excel.timesheet"
            filter={(p) => p.id !== user?.id && canViewTimesheetOf(viewer, { reportingManager: p.reportingManager, additionalManager: String(p.extra?.additionalManager || '') })}
            emptyMessage="No one here reports to you."
            selectedId={chosenId}
            onPick={(p) => setChosenId(p.id)}
          />
        </>
      ) : null}
      <RangeCard value={range} onChange={setRange} today={today} presets={['month', 'last', '7', '30']} />
      {other ? <Banner tone="info" message="Their own submitted timesheet lines are only in the file they download themselves; this one is built from their tasks and bookings." /> : null}
    </ExportShell>
  );
}

// ── Bookings of one person ───────────────────────────────────────────────────
export function BookingsExport({ def }: { def: ExportDef }) {
  const { ready, user, access } = useExcelAccess();
  const today = useTodayIst();
  const [range, setRange] = useState<Range>({ from: '', to: '' });
  const tasks = useApiList('/tasks', { enabled: ready });
  const projects = useApiList<ProjectLite>('/projects', { enabled: ready });
  const depts = useApiList<Dept>('/departments', { enabled: ready });
  const people = usePickablePeople({ enabled: ready, keep: ['additionalManager'] });
  const [picking, setPicking] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const viewer = user ? { role: user.role, name: user.name } : null;
  const emp = (people.data ?? []).find((p) => p.id === chosenId) ?? null;
  const r = emp ? bookingRows(tasks.data ?? [], emp.name, range.from, range.to, projects.data ?? []) : null;
  const period = !range.from && !range.to ? 'Till date' : `${range.from || 'start'} to ${range.to || 'today'}`;
  return (
    <ExportShell
      def={def}
      ready={ready && !tasks.isPending}
      intro="The bookings approved for one person (each becomes a task), whether work started, and the time logged."
      count={r ? r.count : null}
      countNoun={['booking', 'bookings']}
      disabled={!emp ? 'Choose a person first.' : false}
      build={() => {
        if (!emp || !r) return null;
        const sub = `${period}   ·   Approved: ${r.count}   ·   Started: ${r.started}   ·   Not started: ${r.notStarted}`;
        const tag = !range.from && !range.to ? 'till_date' : `${range.from || 'start'}_to_${range.to || 'today'}`;
        return {
          fileName: `Bookings_${emp.name.replace(/\s+/g, '_')}_${tag}`,
          sheets: [{ name: 'Bookings', rows: [...letterheadRows(access.tenant, `Bookings — ${emp.name}`, sub), r.head, ...r.body], cols: [12, 52, 30, 14, 10, 14] }],
        };
      }}>
      <PickedRow title={emp?.name} sub={emp ? [emp.jobTitle, deptName(emp.dept, depts.data ?? [])].filter(Boolean).join(' · ') : null} placeholder="Choose a person" onChange={() => setPicking(true)} />
      <PersonPicker
        visible={picking}
        onClose={() => setPicking(false)}
        title="Whose bookings"
        people={people.data}
        loading={people.isPending}
        allowOnLeave
        recentKey="excel.bookings"
        filter={(p) => canViewTimesheetOf(viewer, { reportingManager: p.reportingManager, additionalManager: String(p.extra?.additionalManager || '') })}
        emptyMessage="No one here reports to you."
        selectedId={chosenId}
        onPick={(p) => setChosenId(p.id)}
      />
      <RangeCard value={range} onChange={setRange} today={today} presets={['all', 'month', 'last', 'fy']} />
      {r && emp ? <Banner tone="info" message={`${emp.name}: ${r.count} approved, ${r.started} started, ${r.notStarted} not started (${period.toLowerCase()}).`} /> : null}
    </ExportShell>
  );
}

