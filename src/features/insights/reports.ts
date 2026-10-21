// The Reports engine — a line-for-line port of ReportsView's calculations (dash.html:23678–23799) as
// pure functions, so the phone shows exactly the website's numbers. Only the legacy `tasks` table
// counts (Team Roster tasks are not in Reports on the website either).
//
// Hours rule (23698–23710): an approved time correction's `approvedHours` wins; otherwise a task counts
// only when its status is `submitted` or `completed` and 60 ≤ elapsedSeconds < 86 400 (a timer left
// running for a day is shown empty, not as a runaway number). Task date = bookingDate ‖ startDate ‖ date.
// Hours read H:MM, floored (23768).
//
// Kept as on the website, on purpose (docs/port/team-ops.md §3.7):
//   - Keka Code wise is not cut down to the team even in team scope (23713 uses every countable task),
//     so a manager sees company-wide hours per code;
//   - team scope for a manager is name-based (reportingManager / additionalManager = my name);
//   - team scope for an admin / app manager is their OWN department (resolveDeptIds(user.dept)), not
//     the departments they run.

import type { ReportUser } from '@/api/insights';
import type { Project } from '@/api/reimbursements';
import type { Task } from '@/api/tasks';
import type { TimeCorrection } from '@/api/work';
import { resolveDeptIds, STAFF_MGR_ROLES, STAFF_ROLES, type ScopeDept, userInDepts } from '@/features/work/access';
import type { ReportScope } from '@/features/insights/access';
import { daysInMonthYm, weekdayShort } from '@/features/insights/format';
import { durationLabel } from '@/lib/dates';

export type ReportType = 'employee' | 'project' | 'keka' | 'grid';

export type ReportMe = { role: string; name: string; dept: string } | null;

export type ReportInput = {
  tasks: readonly Task[];
  users: readonly ReportUser[];
  depts: readonly ScopeDept[];
  projects: readonly Project[];
  corrections: readonly TimeCorrection[];
  me: ReportMe;
  scope: ReportScope;
  /** 'YYYY-MM-DD' (IST), inclusive. */
  from: string;
  to: string;
  search: string;
  /** Attendance grid: 'all' or a professional category id (cinematographer, editor…). */
  gridRole: string;
  /** Attendance grid: 'YYYY-MM'. */
  gridMonth: string;
};

export type KekaRow = { code: string; project: string; tasks: Task[]; hours: number };
export type ProjectRow = { project: Project; tasks: Task[]; hours: number };
export type PersonRow = { user: ReportUser; tasks: Task[]; hours: number };
export type GridDay = { day: number; dow: string; date: string; weekend: boolean };
export type GridRow = { user: ReportUser; cells: number[]; total: number };

export type ReportResult = {
  kekaRows: KekaRow[];
  projectRows: ProjectRow[];
  personRows: PersonRow[];
  gridDays: GridDay[];
  gridRows: GridRow[];
  /** Everyone in scope (deptEmps), before the search. */
  people: ReportUser[];
  hoursOf: (t: Task) => number;
  correctedIds: ReadonlySet<string>;
};

const s = (v: unknown) => (v == null ? '' : String(v));

/** taskDate (23696). */
export const taskDate = (t: Pick<Task, 'bookingDate' | 'startDate' | 'date'>) => s(t.bookingDate || t.startDate || t.date);

/** fmtHrs (23768): H:MM, floored; '—' under a minute. */
export function fmtHrs(h: number) {
  if (!h) return '—';
  const sec = Math.round(h * 3600);
  if (sec < 60) return '—';
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  return `${hh}:${String(mm).padStart(2, '0')}`;
}

/** Hours on screen in the app's one duration format (DESIGN §0C): "35h 48m", "8h", "50m"; '—' under a
 *  minute. fmtHrs's "H:MM" stays for the shared CSV only, so it matches the website's export. */
export function hoursText(h: number) {
  const sec = Math.round((h || 0) * 3600);
  if (sec < 60) return '—';
  const m = Math.floor(sec / 60);
  return m % 60 === 0 ? `${m / 60}h` : durationLabel(m);
}

/** pct (23680): share of tasks marked completed, '—' for none. */
export function pct(ts: readonly Task[]) {
  if (!ts.length) return '—';
  const done = ts.filter((t) => t.status === 'completed').length;
  return `${Math.round((done / ts.length) * 100)}%`;
}

/** 0..1 for a progress bar (NaN-safe). */
export const completion = (ts: readonly Task[]) => (ts.length ? ts.filter((t) => t.status === 'completed').length / ts.length : 0);

const sumHours = (ts: readonly Task[], hoursOf: (t: Task) => number) => ts.reduce((n, t) => n + hoursOf(t), 0);

/** deptEmps / deptEmpsAnyRole (23683–23695). */
export function scopePeople(users: readonly ReportUser[], depts: readonly ScopeDept[], me: ReportMe, scope: ReportScope) {
  if (scope === 'global') return { people: users.filter((u) => STAFF_ROLES.includes(u.role)), anyRole: [...users] };
  if (me?.role === 'manager') {
    const mine = (u: ReportUser) => u.reportingManager === me.name || u.additionalManager === me.name;
    return { people: users.filter((u) => STAFF_MGR_ROLES.includes(u.role) && mine(u)), anyRole: users.filter(mine) };
  }
  const ids = resolveDeptIds(me?.dept, depts);
  return {
    people: users.filter((u) => STAFF_ROLES.includes(u.role) && userInDepts(u, ids, depts)),
    anyRole: users.filter((u) => userInDepts(u, ids, depts)),
  };
}

export function buildReport(input: ReportInput): ReportResult {
  const { tasks, users, depts, projects, corrections, me, scope, from, to } = input;
  const inRange = (d: string) => !!d && d >= from && d <= to;
  const needle = input.search.trim().toLowerCase();
  const matches = (v: unknown) => !needle || s(v).toLowerCase().includes(needle);

  const { people, anyRole } = scopePeople(users, depts, me, scope);

  // corrections.find(c => c.taskId === t.id && c.status === 'approved') — the first approved one wins.
  const approved = new Map<string, TimeCorrection>();
  for (const c of corrections) {
    if (c.status === 'approved' && c.taskId && !approved.has(String(c.taskId))) approved.set(String(c.taskId), c);
  }
  const hoursOf = (t: Task) => {
    const corr = approved.get(t.id);
    if (corr) return Number(corr.approvedHours) || 0;
    const e = Number(t.elapsedSeconds) || 0;
    if (!['submitted', 'completed'].includes(s(t.status)) || !e || e < 60) return 0;
    if (e >= 86400) return 0;
    return e / 3600;
  };
  const countable = tasks.filter((t) => {
    const e = Number(t.elapsedSeconds) || 0;
    return approved.has(t.id) || (['submitted', 'completed'].includes(s(t.status)) && e >= 60 && e < 86400);
  });
  const countableInRange = countable.filter((t) => inRange(taskDate(t)));

  // Keka map (23714–23715): every project with a code, tasks matching the project name or the code.
  const kekaMap = new Map<string, KekaRow>();
  for (const p of projects) {
    if (!p.kekaCode) continue;
    const pt = countableInRange.filter((t) => t.project === p.name || t.kekaCode === p.kekaCode);
    if (!pt.length) continue;
    const row = kekaMap.get(p.kekaCode) ?? { code: p.kekaCode, project: s(p.name), tasks: [], hours: 0 };
    row.tasks.push(...pt);
    kekaMap.set(p.kekaCode, row);
  }
  const kekaRows = [...kekaMap.values()]
    .map((r) => ({ ...r, hours: sumHours(r.tasks, hoursOf) }))
    .sort((a, b) => b.hours - a.hours)
    .filter((g) => matches(g.code) || matches(g.project));

  const peopleNames = new Set(people.map((e) => e.name));
  const visibleProjects =
    scope === 'global' ? projects : projects.filter((p) => countable.some((t) => t.project === p.name && peopleNames.has(s(t.assignee))));
  const projectRows = visibleProjects
    .map((p) => {
      const pt = countableInRange.filter((t) => t.project === p.name && peopleNames.has(s(t.assignee)));
      return { project: p, tasks: pt, hours: sumHours(pt, hoursOf) };
    })
    .filter((r) => r.tasks.length > 0)
    .sort((a, b) => b.hours - a.hours)
    .filter((r) => matches(r.project.name));

  const byAssignee = new Map<string, Task[]>();
  for (const t of countableInRange) {
    const k = s(t.assignee);
    const arr = byAssignee.get(k);
    if (arr) arr.push(t);
    else byAssignee.set(k, [t]);
  }
  const personRows = people
    .map((u) => {
      const ut = [...(byAssignee.get(u.name) ?? [])].sort((a, b) => taskDate(b).localeCompare(taskDate(a)));
      return { user: u, tasks: ut, hours: sumHours(ut, hoursOf) };
    })
    .sort((a, b) => b.hours - a.hours)
    .filter((r) => matches(r.user.name));

  // Attendance grid (23733–23741): 'all' = the usual roster; a category = the wider any-role pool.
  const gridPeople = (input.gridRole === 'all' ? people : anyRole.filter((e) => e.professionalAvailable && e.professionalType === input.gridRole)).filter((e) =>
    matches(e.name),
  );
  const ym = input.gridMonth;
  const nDays = daysInMonthYm(ym);
  const gridDays: GridDay[] = Array.from({ length: nDays }, (_, i) => {
    const date = `${ym}-${String(i + 1).padStart(2, '0')}`;
    const dow = weekdayShort(date);
    return { day: i + 1, dow, date, weekend: dow === 'Sa' || dow === 'Su' };
  });
  const monthPrefix = `${ym}-`;
  const cellIndex = new Map<string, number[]>();
  for (const t of countable) {
    const d = taskDate(t);
    // getCellHrs compares taskDate(t) === 'YYYY-MM-DD' exactly: a stamped value never lands in a cell.
    if (d.length !== 10 || !d.startsWith(monthPrefix)) continue;
    const day = Number(d.slice(8, 10));
    if (!(day >= 1 && day <= nDays)) continue;
    const k = s(t.assignee);
    const arr = cellIndex.get(k) ?? Array.from({ length: nDays }, () => 0);
    arr[day - 1]! += hoursOf(t);
    cellIndex.set(k, arr);
  }
  const gridRows = gridPeople.map((u) => {
    const cells = cellIndex.get(u.name) ?? Array.from({ length: nDays }, () => 0);
    return { user: u, cells, total: cells.reduce((n, h) => n + h, 0) };
  });

  return { kekaRows, projectRows, personRows, gridDays, gridRows, people, hoursOf, correctedIds: new Set(approved.keys()) };
}

/** Role labels (RL, dash.html:913). */
export const ROLE_LABEL: Record<string, string> = {
  master_admin: 'Master Admin',
  super_admin: 'Super Admin',
  ceo: 'CEO',
  coo: 'COO',
  admin: 'Admin',
  hr: 'HR',
  it_admin: 'IT Admin',
  manager: 'Manager',
  employee: 'Employee',
  professional: 'Professional',
  accounts: 'Accounts',
  app_manager: 'Application Manager',
  announcement_viewer: 'Announcements (Display)',
  visitor_manager: 'Visitor Manager',
};

type ExportRow = Record<string, string | number>;

/** exportRows (23774–23799): exactly the rows on screen for the chosen report. */
export function exportRows(type: ReportType, r: ReportResult): ExportRow[] {
  if (type === 'keka') return r.kekaRows.map((g) => ({ 'Keka Code': g.code, Project: g.project, Tasks: g.tasks.length, 'Hours Worked': fmtHrs(g.hours), Completion: pct(g.tasks) }));
  if (type === 'project') return r.projectRows.map((x) => ({ Project: s(x.project.name), Tasks: x.tasks.length, 'Hours Worked': fmtHrs(x.hours), Completion: pct(x.tasks) }));
  if (type === 'employee') {
    const rows: ExportRow[] = [];
    for (const { user: u, tasks: ut } of r.personRows) {
      const role = ROLE_LABEL[u.role] || u.role;
      if (!ut.length) {
        rows.push({ Employee: u.name, Role: role, Task: '', Date: '', 'Project (Keka)': '', 'Time Worked': '—' });
        continue;
      }
      for (const t of ut) {
        // The website's export reads the raw elapsed seconds here (not the 24 h rule): mirrored.
        const secs = r.correctedIds.has(t.id) ? Math.round(r.hoursOf(t) * 3600) : Number(t.elapsedSeconds) || 0;
        rows.push({
          Employee: u.name,
          Role: role,
          Task: t.title || '—',
          Date: taskDate(t),
          'Project (Keka)': s(t.kekaCode || t.project),
          'Time Worked': secs && secs >= 60 ? `${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}` : '—',
        });
      }
    }
    return rows;
  }
  return r.gridRows.map((g) => {
    const row: ExportRow = { Employee: g.user.name };
    r.gridDays.forEach((d, i) => {
      const h = g.cells[i] ?? 0;
      row[`${d.day} ${d.dow}`] = h > 0 ? fmtHrs(h) : '';
    });
    row.Total = g.total ? fmtHrs(g.total) : '—';
    return row;
  });
}
