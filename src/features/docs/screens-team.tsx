// Team documents: pending reviews (App Manager), tomorrow's schedule (managers, admins) and a person's
// own timesheet. Each reads the same lists its owning screen does, and builds the website's PDF.

import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { CalendarDays, ClipboardList, Timer } from 'lucide-react-native';
import { useState } from 'react';

import { useAllBookings, useBookingUsers } from '@/api/booking';
import { api, unwrap } from '@/api/client';
import { useMyProfile } from '@/api/me';
import { useProjects } from '@/api/reimbursements';
import { type Booking, type Task, useMyProBookings, useMyTasks } from '@/api/tasks';
import { type TeamTask, useTeamTasks, useWorkBookings } from '@/api/work';
import { useSession } from '@/auth/session';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { pendingReviewItems, reviewGroups, waitingSince } from '@/features/booking/model';
import { useProfTypes } from '@/features/booking/ui';
import { canAdminSchedulePdf, canManagerSchedulePdf, canReviewsPdf, canTimesheetPdf } from '@/features/docs/access';
import { DocScreen } from '@/features/docs/doc-screen';
import { hoursLabel, reviewsDoc, scheduleDoc, type ScheduleItem, timesheetDoc, type TimesheetRow } from '@/features/docs/templates';
import { deptsIRun, managerReports, userInDepts } from '@/features/work/access';
import { codeOf } from '@/features/work/model';
import { useWorkTeam } from '@/features/work/use-team';
import { dayLabel, hmLabel, istDateOf, timeOf } from '@/lib/dates';
import { addDaysYmd } from '@/lib/ist';
import { plural } from '@/lib/format';
import { letterheadOf } from '@/lib/pdf';
import { useAccess } from '@/lib/use-access';
import { DateField, FieldMessage, FieldPair, SelectField } from '@/ui';

const str = (v: unknown) => (v == null ? '' : String(v));

// ── Pending reviews ──────────────────────────────────────────────────────────
export function ReviewsPdfScreen({ person }: { person?: string }) {
  const access = useAccess();
  const now = useNow();
  const today = useTodayIst();
  const types = useProfTypes();
  const allowed = canReviewsPdf(access);
  const all = useAllBookings(allowed);
  const users = useBookingUsers(allowed);
  const [pick, setPick] = useState(person || '');
  if (!allowed) return <Redirect href="/" />;

  const items = all.data ? pendingReviewItems(all.data, users.data ?? null) : [];
  const byEmp = reviewGroups(items, 'emp', users.data ?? [], types);
  const chosen = byEmp.find((g) => g.key === pick) ?? byEmp[0] ?? null;
  const groups = chosen
    ? reviewGroups(chosen.items, 'pro', users.data ?? [], types).map((g) => ({
        name: g.name,
        profession: g.sub,
        items: g.items.map((b) => ({ project: str(b.project), kekaCode: str(b.kekaCode), date: str(b.date || b.dates?.[0]), kind: b.kind, since: waitingSince(b) })),
      }))
    : [];
  const doc = chosen ? reviewsDoc({ employeeName: chosen.name, employeePhone: chosen.phone, groups, letterhead: letterheadOf(access.tenant), today, now, by: access.user?.name }) : null;

  return (
    <DocScreen
      title="Pending reviews PDF"
      icon={ClipboardList}
      module="tasks"
      heroLabel={chosen ? `Owed by ${chosen.name}` : 'Reviews owed'}
      value={all.data ? (chosen ? chosen.items.length : 0) : undefined}
      unit={chosen?.items.length === 1 ? 'review' : 'reviews'}
      sub={chosen ? `Across ${plural(groups.length, 'professional')}` : undefined}
      loading={all.isPending || users.isPending}
      error={all.isError && !all.data ? all.error?.message || 'Couldn’t load the bookings.' : null}
      onRetry={() => void all.refetch()}
      onRefresh={() => Promise.all([all.refetch(), users.refetch()])}
      empty={!byEmp.length ? { title: 'No pending reviews', message: 'Every booking has been approved and rated.' } : null}
      note="The PDF is only made on this phone. Nobody is messaged."
      controls={
        byEmp.length ? (
          <SelectField
            label="Employee"
            value={chosen?.key ?? ''}
            options={byEmp.map((g) => ({ value: g.key, label: `${g.name} · ${plural(g.items.length, 'review')}` }))}
            onChange={setPick}
          />
        ) : null
      }
      doc={doc}
    />
  );
}

// ── Tomorrow's schedule ──────────────────────────────────────────────────────
const DONE = ['completed', 'submitted', 'reviewed'];
const isApprovedProOn = (b: Booking, day: string) => b.type === 'professionals' && b.status === 'approved' && (b.dates?.[0] === day || b.date === day);
const span = (a?: unknown, b?: unknown) => (a && b ? `${hmLabel(str(a))} – ${hmLabel(str(b))}` : a ? hmLabel(str(a)) : b ? hmLabel(str(b)) : '');

export function SchedulePdfScreen() {
  const access = useAccess();
  const today = useTodayIst();
  const manager = canManagerSchedulePdf(access);
  const admin = canAdminSchedulePdf(access);
  const allowed = manager || admin;
  const scope = useWorkTeam(allowed);
  const tasksQ = useTeamTasks('active', allowed);
  const bookingsQ = useWorkBookings(allowed);
  const projectsQ = useProjects(allowed);
  if (!allowed) return <Redirect href="/" />;

  const tomorrow = addDaysYmd(today, 1);
  const label = dayLabel(tomorrow, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  const me = scope.me;
  const tasks: TeamTask[] = Array.isArray(tasksQ.data) ? tasksQ.data : [];
  const bookings: Booking[] = Array.isArray(bookingsQ.data) ? bookingsQ.data : [];
  const code = (t: TeamTask) => codeOf(t, bookings, projectsQ.data) || str(t.kekaCode || t.project) || '—';

  let deptName = '';
  let items: ScheduleItem[] = [];
  if (me && manager) {
    // ManagerHome (:22858): the manager's reports; their open tasks dated tomorrow + approved bookings.
    const reports = managerReports({ id: me.id, role: me.role, name: me.name }, scope.users);
    const names = new Set(reports.map((p) => p.name));
    const myDept = scope.depts.find((d) => d.id === me.dept || d.name === me.dept);
    deptName = myDept?.name || str(me.dept);
    items = [
      ...tasks
        .filter((t) => names.has(str(t.assignee)) && t.startDate === tomorrow && !DONE.includes(str(t.status)))
        .map((t) => ({ channel: code(t), who: str(t.assignee), time: span(t.startTime, t.endTime), booked: false, sort: str(t.startTime) })),
      ...bookings
        .filter((b) => isApprovedProOn(b, tomorrow) && names.has(str(b.resource)))
        .map((b) => ({ channel: str(b.kekaCode || b.project) || '—', who: str(b.resource), time: span(b.startTime, b.endTime), booked: true, sort: str(b.startTime) })),
    ]
      .sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0))
      .map(({ sort: _s, ...i }) => i);
  } else if (me && admin) {
    // AdminHome Next Day Schedule (:22064): the department this admin runs; tasks dated tomorrow, still open.
    const runs = deptsIRun(me, scope.depts);
    const dept = scope.depts.find((d) => d.id === runs[0]);
    deptName = dept?.name || '';
    const team = new Set(scope.users.filter((u) => userInDepts(u, runs.slice(0, 1), scope.depts)).map((u) => u.name));
    items = tasks
      .filter((t) => team.has(str(t.assignee)) && t.startDate === tomorrow && !DONE.includes(str(t.status)))
      .map((t) => ({ channel: code(t), who: str(t.assignee), time: span(t.startTime, t.endTime), booked: false, desc: str(t.desc) }));
  }

  const doc = scheduleDoc({
    title: manager ? 'Tomorrow schedule' : 'Next day schedule',
    dayLabel: label,
    ymd: tomorrow,
    deptName,
    items,
    withDescription: !manager,
    letterhead: letterheadOf(access.tenant),
    by: access.user?.name,
  });
  const loading = scope.loading || (tasksQ.isPending && !tasksQ.data) || (manager && bookingsQ.isPending && !bookingsQ.data);
  return (
    <DocScreen
      title="Tomorrow’s schedule"
      icon={CalendarDays}
      module="tasks"
      heroLabel={label}
      value={loading ? undefined : items.length}
      unit={items.length === 1 ? 'item' : 'items'}
      sub={deptName ? `Department: ${deptName}` : manager ? 'Your team' : 'The department you run'}
      loading={!!loading}
      error={tasksQ.isError && !tasksQ.data ? tasksQ.error?.message || 'Couldn’t load the tasks.' : null}
      onRetry={() => void tasksQ.refetch()}
      onRefresh={() => Promise.all([tasksQ.refetch(), bookingsQ.refetch(), scope.refetch()])}
      doc={doc}
    />
  );
}

// ── Timesheet ────────────────────────────────────────────────────────────────
type SheetEntry = { taskId?: string; taskTitle?: string; kekaCode?: string; projectName?: string; startTime?: string; endTime?: string; minutes?: number; comment?: string };
type SheetDay = { workDate: string; entries?: SheetEntry[] };

/** refNo (dash.html): a short reference from an id. */
const refNo = (id: string, kind: 'task' | 'booking') => `${kind === 'task' ? 'T' : 'B'}-${String(id || '').replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase() || '—'}`;
const clock = (iso?: string | null) => (iso ? timeOf(iso) : '—');

export function TimesheetPdfScreen() {
  const access = useAccess();
  const today = useTodayIst();
  const userId = useSession((s) => s.user?.id);
  const allowed = canTimesheetPdf(access);
  const [from, setFrom] = useState(() => `${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const profile = useMyProfile();
  const tasksQ = useMyTasks();
  const proQ = useMyProBookings(allowed);
  // The website ignores a failure here on purpose: a role that fills no timesheets gets a 403 (:28605).
  const sheetsQ = useQuery({
    queryKey: ['docs', 'timesheet', userId, from, to],
    enabled: allowed && !!userId && from <= to,
    queryFn: async ({ signal }) => {
      try {
        const r = await unwrap(api.get<{ days?: SheetDay[] }>(`/hr/timesheet/mine?from=${from}&to=${to}`, signal));
        return Array.isArray(r?.days) ? r.days : [];
      } catch {
        return [];
      }
    },
  });
  if (!allowed) return <Redirect href="/" />;

  const me = access.user;
  const inRange = (d?: string) => !!d && d >= from && d <= to;
  const tasks: Task[] = Array.isArray(tasksQ.data) ? tasksQ.data : [];
  const taskDate = (t: Task) => str(t.bookingDate || t.startDate || t.date);
  const rows: TimesheetRow[] = [];
  for (const sh of sheetsQ.data ?? []) {
    if (!inRange(sh.workDate)) continue;
    for (const e of sh.entries ?? []) {
      const t = e.taskId ? tasks.find((x) => x.id === e.taskId) : undefined;
      rows.push({
        id: e.taskId ? refNo(e.taskId, 'task') : '—',
        date: sh.workDate,
        type: 'Timesheet',
        project: e.kekaCode || e.projectName || '—',
        title: e.taskTitle || e.comment || '—',
        by: t?.creator || '—',
        start: hmLabel(e.startTime),
        end: hmLabel(e.endTime),
        hours: (Number(e.minutes) || 0) / 60,
        status: 'submitted',
      });
    }
  }
  for (const t of tasks.filter((x) => x.source !== 'booking' && inRange(taskDate(x)))) {
    rows.push({
      id: refNo(t.id, 'task'),
      date: taskDate(t),
      type: 'Task',
      project: str(t.kekaCode || t.project) || '—',
      title: t.title || '—',
      by: t.creator || '—',
      start: clock(t.firstStartedAt || t.startedAt),
      end: clock(t.lastEndedAt || t.completedAt),
      hours: (Number(t.elapsedSeconds) || 0) / 3600,
      status: str(t.status),
    });
  }
  for (const b of (proQ.data ?? []).filter((x) => inRange(str(x.dates?.[0] || x.date)))) {
    const linked = tasks.find((t) => t.source === 'booking' && t.bookingId === b.id);
    rows.push({
      id: refNo(b.id, 'booking'),
      date: str(b.dates?.[0] || b.date),
      type: 'Booking',
      project: str(b.kekaCode || b.project) || '—',
      title: str(b.channelName) || 'Professional booking',
      by: str(b.requestedBy) || '—',
      start: linked ? clock(linked.firstStartedAt || linked.startedAt) : hmLabel(b.startTime),
      end: linked ? clock(linked.lastEndedAt || linked.completedAt) : hmLabel(b.endTime),
      hours: linked ? (Number(linked.elapsedSeconds) || 0) / 3600 : 0,
      status: str(b.status),
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const total = rows.reduce((n, r) => n + r.hours, 0);
  const p = profile.data;
  const meta: [string, string][] = [
    ['Employee ID', str(p?.employeeNumber || p?.kekaCode || me?.employeeNumber || me?.kekaCode) || '—'],
    ['Name', str(me?.name)],
    ['Job role', str(p?.jobRole || p?.jobTitle || me?.jobTitle) || '—'],
    ['Department', str(p?.deptName || me?.dept) || '—'],
    ['Branch', str(p?.location || p?.city) || '—'],
  ];
  const badRange = from > to ? 'The start date must be on or before the end date.' : null;
  const doc = badRange ? null : timesheetDoc({ name: str(me?.name) || 'Me', from, to, meta, rows, letterhead: letterheadOf(access.tenant), by: me?.name });
  const loading = (tasksQ.isPending && !tasksQ.data) || (sheetsQ.isPending && !sheetsQ.data && !badRange);

  return (
    <DocScreen
      title="Timesheet PDF"
      icon={Timer}
      module="timesheets"
      heroLabel={`${dayLabel(istDateOf(from), { day: 'numeric', month: 'short' })} – ${dayLabel(istDateOf(to), { day: 'numeric', month: 'short', year: 'numeric' })}`}
      value={loading ? undefined : rows.length}
      unit={rows.length === 1 ? 'entry' : 'entries'}
      sub={`Total ${hoursLabel(total)}`}
      loading={!!loading}
      error={tasksQ.isError && !tasksQ.data ? tasksQ.error?.message || 'Couldn’t load your tasks.' : null}
      onRetry={() => void tasksQ.refetch()}
      onRefresh={() => Promise.all([tasksQ.refetch(), sheetsQ.refetch(), proQ.refetch()])}
      controls={
        <>
          <FieldPair>
            <DateField label="From" value={from} onChange={setFrom} maximumDate={today} />
            <DateField label="To" value={to} onChange={setTo} maximumDate={today} />
          </FieldPair>
          <FieldMessage error={badRange} />
        </>
      }
      doc={doc}
    />
  );
}
