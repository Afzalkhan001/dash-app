// Demo API for the teamboard domain (wave 2): Team Roster (team_roster.js) — managers, teams,
// projects, work items, timed tasks, task types and the workload view — with the server's own rules
// and sentences, so the demo teaches the real thing:
//   canManageDept       department admin (or an overseer) for the Managers routes;
//   canManageTeamRoster company switch + department switch + admin or granted manager (overseers pass);
//   assertAssigneeOnProject  the assignee must be on an ACTIVE team assigned to the project;
//   assignee whitelist  a plain assignee may only send status / startedAt / elapsedSeconds;
//   auto-pause          starting a task pauses that person's other running task;
//   cascades            a project takes its tasks, a work its sub works, a team its links.
//
// Who sees what (the demo person is DEMO_USER in here; personas decide what they run):
//   Afzal Manager   admin of Creative (Managers tab, Priya granted) and a granted manager of
//                   Production — two departments, "(Admin)" / "(Manager)"; one sub work of his own.
//   Afzal Admin     admin of Production (Afzal Manager shows as its granted manager).
//   Afzal Employee  on Creative's Edit floor: three sub works (one with a manager's note, one paused).
//   Afzal Professional  on Production's Shoot crew: three sub works (one blocked).
//   Everyone else   no board (Super Admin passes the server's check but the website's nav still
//                   needs a department, so the app shows nothing — parity).
// Rows tied to the demo person carry `onlyFor` (persona ids) so each persona sees only their own.

import type { RunningTask } from '@/api/attendance';
import { DEMO_USER } from '@/demo/config';
import { allPeople, DEPARTMENTS, personById, PROJECTS, TENANT, upsertDepartment } from '@/demo/fixtures/org';
import { currentPersona, personaUserId, STAFF_PERSONAS, type StaffPersonaId } from '@/demo/personas';
import { addDays, fail, istHm, newId, notFound, today, type Route } from '@/demo/state';

type Only = { onlyFor?: StaffPersonaId[] };
type Manager = Only & { id: string; department_id: string; employee_id: string; employee_name: string; granted_by_name: string; created_at: string };
type Team = {
  id: string;
  department_id: string;
  name: string;
  description: string | null;
  lead_id: string | null;
  lead_name: string;
  status: 'active' | 'archived';
  created_at: string;
};
type Member = Only & { id: string; team_id: string; employee_id: string; employee_name: string; created_at: string };
type Project = {
  id: string;
  department_id: string;
  name: string;
  description: string | null;
  lead_id: string | null;
  lead_name: string;
  priority: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
  keka_code: string | null;
  created_at: string;
};
type ProjectTeam = { id: string; project_id: string; team_id: string };
type Task = Only & {
  id: string;
  department_id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  type: string | null;
  manager_comment: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  estimated_hours: number | null;
  keka_code: string | null;
  elapsed_seconds: number;
  started_at: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const T0 = today();
const ME = DEMO_USER.id;
const ME_NAME = String(DEMO_USER.name);
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const daysAgoIso = (n: number) => `${addDays(T0, -n)}T05:30:00.000Z`;
const nameOf = (id: string | null | undefined) => (id ? (id === ME ? ME_NAME : (personById(id)?.name ?? '')) : '');
const code = (pid: string) => PROJECTS.find((p) => p.id === pid)?.kekaCode ?? null;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'];
const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];

// ── The persona ──────────────────────────────────────────────────────────────
const persona = () => currentPersona();
const visible = (r: Only) => !r.onlyFor || r.onlyFor.includes(persona().id);
/** The demo person, whichever way an id names them (stored as DEMO_USER, or as a persona's own id). */
const isMe = (id: string | null | undefined) => !!id && (id === ME || id === personaUserId(persona()));
const OVERSEERS = ['master_admin', 'super_admin'];

// ── Departments: switches and task types (org.ts already turns Team Roster on for Creative + Production) ──
upsertDepartment({ id: 'dept-creative', taskTypes: ['Edit', 'Grade', 'Sound', 'Motion', 'Review'] } as Parameters<typeof upsertDepartment>[0]);
upsertDepartment({ id: 'dept-production', taskTypes: ['Shoot', 'Lighting', 'Offload'] } as Parameters<typeof upsertDepartment>[0]);
const dept = (id: string | null | undefined) => DEPARTMENTS.find((d) => d.id === id) ?? null;
const inDept = (u: { dept?: string; departmentId?: string | null }, d: { id: string; name: string }) =>
  u.dept === d.id || u.departmentId === d.id || (!!d.name && String(u.dept || '').toLowerCase() === d.name.toLowerCase());

// ── Seed ─────────────────────────────────────────────────────────────────────
const managers: Manager[] = [
  {
    id: 'trm-priya',
    department_id: 'dept-creative',
    employee_id: 'u-priya',
    employee_name: 'Priya Sharma',
    granted_by_name: ME_NAME,
    created_at: daysAgoIso(40),
  },
  // Afzal Manager is a granted manager of Production (named by his own persona id, as Config grants are).
  {
    id: 'trm-afzal-mgr',
    department_id: 'dept-production',
    employee_id: personaUserId(STAFF_PERSONAS.find((p) => p.id === 'manager')!),
    employee_name: 'Afzal Manager',
    granted_by_name: 'Deepa Menon',
    created_at: daysAgoIso(12),
  },
];

const team = (id: string, d: string, name: string, description: string, lead: string, status: Team['status'] = 'active'): Team => ({
  id,
  department_id: d,
  name,
  description,
  lead_id: lead,
  lead_name: nameOf(lead),
  status,
  created_at: daysAgoIso(60),
});
const teams: Team[] = [
  team('trt-edit', 'dept-creative', 'Edit floor', 'Long-form edits, cut-downs and conform', 'u-sanjay'),
  team('trt-audio', 'dept-creative', 'Audio', 'Dialogue, music and the final mix', 'u-anita'),
  team('trt-motion24', 'dept-creative', 'Motion (2024)', 'Last year’s motion pod', 'u-sneha', 'archived'),
  team('trt-crew', 'dept-production', 'Shoot crew', 'Camera, lights and data on set', 'u-farhan'),
];

let memberSeq = 0;
const member = (team_id: string, employee_id: string, onlyFor?: StaffPersonaId[]): Member => ({
  id: `trtm-${++memberSeq}`,
  team_id,
  employee_id,
  employee_name: nameOf(employee_id),
  created_at: daysAgoIso(50 - memberSeq),
  ...(onlyFor ? { onlyFor } : null),
});
const members: Member[] = [
  member('trt-edit', 'u-sanjay'),
  member('trt-edit', 'u-rahul'),
  member('trt-edit', 'u-sneha'),
  member('trt-edit', 'u-kavya'),
  member('trt-edit', 'u-nikhil'),
  member('trt-edit', ME, ['employee', 'manager']),
  member('trt-audio', 'u-anita'),
  member('trt-motion24', 'u-sneha'),
  member('trt-crew', 'u-farhan'),
  member('trt-crew', 'u-imran'),
  member('trt-crew', ME, ['professional']),
];

const project = (id: string, d: string, name: string, p: Partial<Project>): Project => ({
  id,
  department_id: d,
  name,
  description: null,
  lead_id: null,
  lead_name: '',
  priority: 'medium',
  status: 'active',
  start_date: null,
  due_date: null,
  keka_code: null,
  created_at: daysAgoIso(30),
  ...p,
  ...(p.lead_id ? { lead_name: nameOf(p.lead_id) } : null),
});
const projects: Project[] = [
  project('trp-nimbus', 'dept-creative', 'Nimbus explainer series', {
    description: 'Four 90-second explainers for Nimbus Fintech, plus social cut-downs.',
    lead_id: 'u-sanjay',
    priority: 'high',
    start_date: addDays(T0, -20),
    due_date: addDays(T0, 12),
    keka_code: code('p-nimbus'),
  }),
  project('trp-reel', 'dept-creative', 'Showreel 2026', {
    description: 'The studio’s internal showreel.',
    lead_id: 'u-sneha',
    status: 'planning',
    due_date: addDays(T0, 40),
    keka_code: code('p-reel'),
  }),
  project('trp-diwali', 'dept-creative', 'Sunrise Jewellers Diwali promo', {
    description: 'TV spot and reels for the Diwali campaign.',
    lead_id: 'u-rahul',
    priority: 'urgent',
    start_date: addDays(T0, -15),
    due_date: addDays(T0, -3),
    keka_code: code('p-sjw-diwali'),
  }),
  project('trp-kisan', 'dept-production', 'Kisan Agro launch shoot', {
    description: 'Two-day product shoot and farmer interviews.',
    lead_id: 'u-farhan',
    start_date: addDays(T0, -5),
    due_date: addDays(T0, 6),
    keka_code: code('p-kisan'),
  }),
];
const projectTeams: ProjectTeam[] = [
  { id: 'tpt-1', project_id: 'trp-nimbus', team_id: 'trt-edit' },
  { id: 'tpt-2', project_id: 'trp-nimbus', team_id: 'trt-audio' },
  { id: 'tpt-3', project_id: 'trp-reel', team_id: 'trt-edit' },
  { id: 'tpt-4', project_id: 'trp-diwali', team_id: 'trt-edit' },
  { id: 'tpt-5', project_id: 'trp-kisan', team_id: 'trt-crew' },
];

const projectOf = (id: string | null | undefined) => projects.find((p) => p.id === id) ?? null;
const task = (id: string, project_id: string, title: string, p: Partial<Task> = {}): Task => {
  const pr = projectOf(project_id)!;
  const assignee = p.assignee_id ?? null;
  return {
    id,
    department_id: pr.department_id,
    project_id,
    parent_task_id: null,
    title,
    description: null,
    type: null,
    manager_comment: null,
    assignee_id: assignee,
    assignee_name: assignee ? nameOf(assignee) : null,
    priority: 'medium',
    status: 'todo',
    due_date: null,
    estimated_hours: null,
    keka_code: pr.keka_code,
    elapsed_seconds: 0,
    started_at: null,
    created_by: ME,
    created_by_name: ME_NAME,
    created_at: daysAgoIso(10),
    updated_at: daysAgoIso(2),
    completed_at: p.status === 'done' ? daysAgoIso(1) : null,
    ...p,
  };
};
const H = 3600;
const tasks: Task[] = [
  // Nimbus — work items and their sub works.
  task('trk-w-rough', 'trp-nimbus', 'Rough cut', { description: 'Episode 1 and 2 assemblies.', created_at: daysAgoIso(18) }),
  task('trk-selects', 'trp-nimbus', 'Assemble selects', {
    parent_task_id: 'trk-w-rough',
    assignee_id: 'u-kavya',
    status: 'done',
    type: 'Edit',
    estimated_hours: 6,
    elapsed_seconds: 5.5 * H,
  }),
  task('trk-rough1', 'trp-nimbus', 'Rough cut v1', {
    parent_task_id: 'trk-w-rough',
    assignee_id: 'u-sanjay',
    status: 'in_progress',
    type: 'Edit',
    priority: 'high',
    due_date: addDays(T0, 2),
    estimated_hours: 8,
    elapsed_seconds: 3 * H + 12 * 60,
  }),
  task('trk-titles', 'trp-nimbus', 'Title animation', {
    parent_task_id: 'trk-w-rough',
    assignee_id: 'u-sneha',
    status: 'in_progress',
    type: 'Motion',
    due_date: addDays(T0, 3),
    estimated_hours: 5,
    elapsed_seconds: 2 * H + 10 * 60,
    started_at: ago(25),
  }),
  task('trk-social', 'trp-nimbus', 'Social cut-downs (3 × 15s)', {
    parent_task_id: 'trk-w-rough',
    assignee_id: ME,
    onlyFor: ['employee'],
    type: 'Edit',
    priority: 'high',
    due_date: addDays(T0, 3),
    estimated_hours: 5,
    manager_comment: 'Use the 9:16 safe area. The client wants captions burned in.',
  }),
  task('trk-w-sound', 'trp-nimbus', 'Sound', { description: 'Clean-up, music and the mix.', created_at: daysAgoIso(16) }),
  task('trk-dialogue', 'trp-nimbus', 'Dialogue clean-up', {
    parent_task_id: 'trk-w-sound',
    assignee_id: 'u-anita',
    type: 'Sound',
    due_date: addDays(T0, 2),
    estimated_hours: 4,
  }),
  task('trk-music', 'trp-nimbus', 'Music licensing check', { parent_task_id: 'trk-w-sound', description: 'Check the two stock tracks cover broadcast.' }),
  task('trk-mixreview', 'trp-nimbus', 'Review the final mix', {
    parent_task_id: 'trk-w-sound',
    assignee_id: ME,
    onlyFor: ['manager'],
    type: 'Review',
    due_date: addDays(T0, 4),
    estimated_hours: 1,
  }),
  task('trk-w-colour', 'trp-nimbus', 'Colour', { created_at: daysAgoIso(14) }),
  task('trk-grade', 'trp-nimbus', 'Grade hero shots', {
    parent_task_id: 'trk-w-colour',
    assignee_id: 'u-rahul',
    status: 'blocked',
    type: 'Grade',
    estimated_hours: 6,
    elapsed_seconds: 45 * 60,
    manager_comment: 'Waiting on the LUT from the client.',
  }),
  task('trk-conform', 'trp-nimbus', 'Conform for grade', {
    parent_task_id: 'trk-w-colour',
    assignee_id: ME,
    onlyFor: ['employee'],
    status: 'in_progress',
    type: 'Edit',
    due_date: addDays(T0, 1),
    estimated_hours: 3,
    elapsed_seconds: H + 20 * 60,
  }),
  task('trk-export', 'trp-nimbus', 'Export review link', {
    assignee_id: 'u-nikhil',
    status: 'done',
    type: 'Edit',
    estimated_hours: 1,
    elapsed_seconds: 50 * 60,
  }),
  // Showreel.
  task('trk-w-shots', 'trp-reel', 'Shot list', { description: 'The best of this year’s work.', created_at: daysAgoIso(6) }),
  task('trk-pull', 'trp-reel', 'Pull best shots of 2026', {
    parent_task_id: 'trk-w-shots',
    assignee_id: 'u-nikhil',
    type: 'Edit',
    due_date: addDays(T0, 10),
    estimated_hours: 6,
  }),
  task('trk-reel60', 'trp-reel', 'Edit the 60-second reel', {
    parent_task_id: 'trk-w-shots',
    assignee_id: ME,
    onlyFor: ['employee'],
    type: 'Edit',
    priority: 'low',
    due_date: addDays(T0, 20),
    estimated_hours: 8,
  }),
  // Diwali promo — running late.
  task('trk-w-promo', 'trp-diwali', 'Promo edit', { created_at: daysAgoIso(14) }),
  task('trk-tv30', 'trp-diwali', '30-second TV spot', {
    parent_task_id: 'trk-w-promo',
    assignee_id: 'u-sanjay',
    status: 'in_progress',
    priority: 'urgent',
    type: 'Edit',
    due_date: addDays(T0, -3),
    estimated_hours: 6,
    elapsed_seconds: 4 * H,
  }),
  task('trk-insta', 'trp-diwali', 'Instagram reel', {
    parent_task_id: 'trk-w-promo',
    assignee_id: 'u-kavya',
    priority: 'high',
    type: 'Edit',
    due_date: addDays(T0, -1),
    estimated_hours: 3,
  }),
  // Production — Kisan Agro.
  task('trk-w-shoot', 'trp-kisan', 'Shoot day', { description: 'Day 1 at the Medak farm.', created_at: daysAgoIso(5) }),
  task('trk-lights', 'trp-kisan', 'Lighting plan', {
    parent_task_id: 'trk-w-shoot',
    assignee_id: 'u-imran',
    status: 'done',
    type: 'Lighting',
    estimated_hours: 2,
    elapsed_seconds: 2.25 * H,
  }),
  task('trk-camprep', 'trp-kisan', 'Camera prep', {
    parent_task_id: 'trk-w-shoot',
    assignee_id: 'u-farhan',
    status: 'in_progress',
    type: 'Shoot',
    due_date: addDays(T0, 1),
    estimated_hours: 3,
    elapsed_seconds: 1.5 * H,
  }),
  task('trk-broll', 'trp-kisan', 'B-roll capture', {
    parent_task_id: 'trk-w-shoot',
    assignee_id: ME,
    onlyFor: ['professional'],
    type: 'Shoot',
    priority: 'high',
    due_date: addDays(T0, 2),
    estimated_hours: 6,
    manager_comment: 'Bring the gimbal and two extra batteries.',
  }),
  task('trk-interview', 'trp-kisan', 'Interview set-up', {
    parent_task_id: 'trk-w-shoot',
    assignee_id: ME,
    onlyFor: ['professional'],
    type: 'Shoot',
    due_date: addDays(T0, 1),
    estimated_hours: 2,
  }),
  task('trk-offload', 'trp-kisan', 'Footage offload and backup', {
    parent_task_id: 'trk-w-shoot',
    assignee_id: ME,
    onlyFor: ['professional'],
    status: 'blocked',
    type: 'Offload',
    estimated_hours: 1,
    manager_comment: 'The second RAID is at the office — pick it up first.',
  }),
];

// ── Rules (team_roster.js) ───────────────────────────────────────────────────
const overseer = () => OVERSEERS.includes(persona().role);
type Dept = NonNullable<ReturnType<typeof dept>>;
/** canManageDept (109): an overseer, or this department's admin. */
const canManageDept = (d: Dept) => overseer() || d.adminId === ME;
const granted = (d: Dept) => managers.some((m) => m.department_id === d.id && isMe(m.employee_id) && visible(m));
/** canManageTeamRoster (141): overseers always; else both switches and admin or grant. */
function canManage(d: Dept) {
  if (overseer()) return true;
  if (!d.teamRosterEnabled || !TENANT.teamRosterEnabled) return false;
  return d.adminId === ME || granted(d);
}
const NO_ACCESS = () => fail('You do not have Team Roster access to this department.', 403);
const staffOnly = () => (['visitor_manager', 'announcement_viewer'].includes(persona().role) ? fail('You do not have permission to view tasks.', 403) : null);

const visibleMembers = (teamId: string) => members.filter((m) => m.team_id === teamId && visible(m));
const people = () => allPeople();
const personIn = (id: string, d: Dept) => {
  const p = id === ME ? people().find((x) => x.id === ME) : personById(id);
  return p && inDept(p, d) ? p : null;
};

function assertAssigneeOnProject(assigneeId: string, projectId: string) {
  const all = projectTeams.filter((r) => r.project_id === projectId).map((r) => r.team_id);
  if (!all.length) return 'This project has no teams assigned yet — assign a team before allocating tasks.';
  const active = teams.filter((t) => all.includes(t.id) && t.status === 'active').map((t) => t.id);
  if (!active.length) return 'This project has no active teams assigned — assign an active team before allocating tasks.';
  const on = members.some((m) => visible(m) && (m.employee_id === assigneeId || (isMe(assigneeId) && isMe(m.employee_id))) && active.includes(m.team_id));
  return on ? null : 'The assignee must be a member of an active team assigned to this project.';
}

const withNames = (list: Task[]) => {
  const titleById = new Map(tasks.map((t) => [t.id, t.title]));
  return list.map((t) => ({
    ...t,
    project_name: projectOf(t.project_id)?.name ?? '',
    parent_title: t.parent_task_id ? (titleById.get(t.parent_task_id) ?? '') : null,
  }));
};
const teamRow = (t: Team) => ({ ...t, member_count: visibleMembers(t.id).length });
const projectRow = (p: Project) => ({ ...p, team_count: projectTeams.filter((r) => r.project_id === p.id).length });
const projectTeamsFor = (pid: string) =>
  projectTeams
    .filter((r) => r.project_id === pid)
    .map((r) => {
      const t = teams.find((x) => x.id === r.team_id);
      return { id: r.id, team_id: r.team_id, team_name: t?.name ?? '', team_status: t?.status ?? '' };
    });
const live = (t: Task, now = Date.now()) => t.elapsed_seconds + (t.started_at ? Math.max(0, Math.floor((now - Date.parse(t.started_at)) / 1000)) : 0);
const removeWhere = <T>(list: T[], pred: (x: T) => boolean) => {
  for (let i = list.length - 1; i >= 0; i--) if (pred(list[i]!)) list.splice(i, 1);
};
const str = (v: unknown) => String(v ?? '').trim();
const dateOrNull = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/**
 * The demo person's running Team Roster timers, shaped as the clock-out sheet's RunningTask
 * (taskSource 'team_roster'). For the integrator: attendance's /timesheet day can append these to
 * tasks.ts runningTasks() so clock-out offers to pause / end them, as the website's
 * ClockOutTimesheetModal does. Read only.
 */
export function runningTeamBoardTasks(): RunningTask[] {
  const now = Date.now();
  return tasks
    .filter((t) => visible(t) && isMe(t.assignee_id) && !!t.started_at)
    .map((t) => {
      const started = String(t.started_at);
      const ms = Date.parse(started);
      return {
        id: t.id,
        taskSource: 'team_roster' as const,
        title: t.title || 'Untitled task',
        elapsedSeconds: t.elapsed_seconds || 0,
        startedAt: started,
        startedTime: Number.isFinite(ms) ? istHm(started) : '',
        runningMinutes: Number.isFinite(ms) ? Math.max(0, Math.floor((now - ms) / 60000)) : 0,
      };
    });
}

// ── Routes ───────────────────────────────────────────────────────────────────
export const teamboardRoutes: Route[] = [
  // Managers
  [
    'GET',
    /^\/team-roster\/managers$/,
    (_p, _b, q) => {
      const refused = staffOnly();
      if (refused) return refused;
      if (q.get('mine') === '1') return { managers: managers.filter((m) => visible(m) && isMe(m.employee_id)) };
      const d = dept(q.get('departmentId'));
      if (!q.get('departmentId')) return fail('A departmentId is required.');
      if (!d) return notFound('Department not found.');
      if (!canManageDept(d)) return fail('You do not administer this department.', 403);
      return { managers: managers.filter((m) => m.department_id === d.id && visible(m)) };
    },
  ],
  [
    'POST',
    /^\/team-roster\/managers$/,
    (_p, body) => {
      const d = dept(body?.departmentId);
      const ids: string[] = Array.isArray(body?.employeeIds) ? ([...new Set(body.employeeIds.map(String).filter(Boolean))] as string[]) : [];
      if (!body?.departmentId) return fail('departmentId is required.');
      if (!ids.length) return fail('Select at least one employee.');
      if (!d) return notFound('Department not found.');
      if (!canManageDept(d)) return fail('You do not administer this department.', 403);
      if (!d.teamRosterEnabled) return fail('Team Roster is not enabled for this department.', 409);
      const outside = ids.filter((id) => !personIn(id, d));
      if (outside.length) return fail(`${outside.map((id) => nameOf(id) || id).join(', ')} — not in this department.`);
      for (const id of ids) {
        if (managers.some((m) => m.department_id === d.id && m.employee_id === id && visible(m))) continue;
        managers.unshift({
          id: newId('trm'),
          department_id: d.id,
          employee_id: id,
          employee_name: nameOf(id),
          granted_by_name: ME_NAME,
          created_at: new Date().toISOString(),
        });
      }
      return { managers: managers.filter((m) => m.department_id === d.id && visible(m)) };
    },
  ],
  [
    'DELETE',
    /^\/team-roster\/managers\/([^/]+)$/,
    ([, id]) => {
      const m = managers.find((x) => x.id === id && visible(x));
      if (!m) return notFound('Manager assignment not found.');
      const d = dept(m.department_id);
      if (!d) return notFound('Department not found.');
      if (!canManageDept(d)) return fail('You do not administer this department.', 403);
      removeWhere(managers, (x) => x.id === id);
      return { removed: true };
    },
  ],

  // Teams
  [
    'GET',
    /^\/team-roster\/teams$/,
    (_p, _b, q) => {
      const d = dept(q.get('departmentId'));
      if (!q.get('departmentId')) return fail('departmentId is required.');
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      return { teams: teams.filter((t) => t.department_id === d.id).map(teamRow) };
    },
  ],
  [
    'GET',
    /^\/team-roster\/teams\/([^/]+)$/,
    ([, id]) => {
      const t = teams.find((x) => x.id === id);
      if (!t) return notFound('Team not found.');
      const d = dept(t.department_id);
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      const pids = projectTeams.filter((r) => r.team_id === t.id).map((r) => r.project_id);
      return {
        team: teamRow(t),
        members: visibleMembers(t.id).map(({ id: mid, employee_id, employee_name }) => ({ id: mid, employee_id, employee_name })),
        projects: projects
          .filter((p) => pids.includes(p.id))
          .map(({ id: pid, name, status, priority, due_date }) => ({ id: pid, name, status, priority, due_date })),
      };
    },
  ],
  [
    'POST',
    /^\/team-roster\/teams$/,
    (_p, body) => {
      const d = dept(body?.departmentId);
      const name = str(body?.name);
      if (!body?.departmentId) return fail('departmentId is required.');
      if (!name) return fail('Team name is required.');
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      const leadId = str(body?.leadId) || null;
      if (leadId && !personIn(leadId, d)) return fail('The team lead must be an employee in this department.');
      const memberIds: string[] = Array.isArray(body?.memberIds) ? ([...new Set(body.memberIds.map(String).filter(Boolean))] as string[]) : [];
      const outside = memberIds.filter((id) => !personIn(id, d));
      if (outside.length) return fail(`${outside.map((id) => nameOf(id) || id).join(', ')} — not in this department.`);
      const t: Team = {
        id: newId('trt'),
        department_id: d.id,
        name,
        description: str(body?.description) || null,
        lead_id: leadId,
        lead_name: nameOf(leadId),
        status: 'active',
        created_at: new Date().toISOString(),
      };
      teams.push(t);
      for (const id of memberIds) members.push({ ...member(t.id, id), ...(isMe(id) ? { employee_id: ME, onlyFor: [persona().id] } : null) });
      return { id: t.id };
    },
  ],
  [
    'PUT',
    /^\/team-roster\/teams\/([^/]+)$/,
    ([, id], body) => {
      const t = teams.find((x) => x.id === id);
      if (!t) return notFound('Team not found.');
      const d = dept(t.department_id);
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      if ('name' in (body ?? {})) {
        const name = str(body.name);
        if (!name) return fail('Team name is required.');
        t.name = name;
      }
      if ('description' in (body ?? {})) t.description = str(body.description) || null;
      if ('status' in (body ?? {})) {
        if (!['active', 'archived'].includes(body.status)) return fail('status must be "active" or "archived".');
        t.status = body.status;
      }
      if ('leadId' in (body ?? {})) {
        const leadId = str(body.leadId) || null;
        if (leadId && !personIn(leadId, d)) return fail('The team lead must be an employee in this department.');
        t.lead_id = leadId;
        t.lead_name = nameOf(leadId);
      }
      return {};
    },
  ],
  [
    'DELETE',
    /^\/team-roster\/teams\/([^/]+)$/,
    ([, id]) => {
      const t = teams.find((x) => x.id === id);
      if (!t) return notFound('Team not found.');
      const d = dept(t.department_id);
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      removeWhere(projectTeams, (r) => r.team_id === id);
      removeWhere(members, (m) => m.team_id === id);
      removeWhere(teams, (x) => x.id === id);
      return { deleted: true };
    },
  ],
  [
    'POST',
    /^\/team-roster\/teams\/([^/]+)\/members$/,
    ([, id], body) => {
      const t = teams.find((x) => x.id === id);
      if (!t) return notFound('Team not found.');
      const d = dept(t.department_id);
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      const ids: string[] = Array.isArray(body?.employeeIds) ? ([...new Set(body.employeeIds.map(String).filter(Boolean))] as string[]) : [];
      if (!ids.length) return fail('Select at least one employee.');
      const outside = ids.filter((x) => !personIn(x, d));
      if (outside.length) return fail(`${outside.map((x) => nameOf(x) || x).join(', ')} — not in this department.`);
      for (const eid of ids) {
        if (visibleMembers(t.id).some((m) => m.employee_id === eid || (isMe(eid) && isMe(m.employee_id)))) continue;
        members.push({ ...member(t.id, eid), ...(isMe(eid) ? { employee_id: ME, employee_name: ME_NAME, onlyFor: [persona().id] } : null) });
      }
      return { members: visibleMembers(t.id).map(({ id: mid, employee_id, employee_name }) => ({ id: mid, employee_id, employee_name })) };
    },
  ],
  [
    'DELETE',
    /^\/team-roster\/teams\/([^/]+)\/members\/([^/]+)$/,
    ([, tid, mid]) => {
      const t = teams.find((x) => x.id === tid);
      if (!t) return notFound('Team not found.');
      const d = dept(t.department_id);
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      if (!members.some((m) => m.id === mid && m.team_id === tid && visible(m))) return notFound('This person is not on the team.');
      removeWhere(members, (m) => m.id === mid);
      return { removed: true };
    },
  ],

  // Projects
  [
    'GET',
    /^\/team-roster\/projects$/,
    (_p, _b, q) => {
      const d = dept(q.get('departmentId'));
      if (!q.get('departmentId')) return fail('departmentId is required.');
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      return {
        projects: projects
          .filter((p) => p.department_id === d.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map(projectRow),
      };
    },
  ],
  [
    'GET',
    /^\/team-roster\/projects\/([^/]+)$/,
    ([, id]) => {
      const p = projectOf(id);
      if (!p) return notFound('Project not found.');
      const d = dept(p.department_id);
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      return { project: p, teams: projectTeamsFor(p.id) };
    },
  ],
  [
    'POST',
    /^\/team-roster\/projects$/,
    (_p, body) => {
      const d = dept(body?.departmentId);
      const name = str(body?.name);
      if (!body?.departmentId) return fail('departmentId is required.');
      if (!name) return fail('Project name is required.');
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      const leadId = str(body?.leadId) || null;
      if (leadId && !personIn(leadId, d)) return fail('The project lead must be an employee in this department.');
      const teamIds: string[] = Array.isArray(body?.teamIds) ? ([...new Set(body.teamIds.map(String).filter(Boolean))] as string[]) : [];
      if (teamIds.some((tid) => !teams.some((t) => t.id === tid))) return fail('One or more selected teams could not be found.');
      if (teamIds.some((tid) => teams.find((t) => t.id === tid)?.department_id !== d.id)) return fail('Selected teams must belong to this same department.');
      const p: Project = {
        id: newId('trp'),
        department_id: d.id,
        name,
        description: str(body?.description) || null,
        lead_id: leadId,
        lead_name: nameOf(leadId),
        priority: PRIORITIES.includes(body?.priority) ? body.priority : 'medium',
        status: PROJECT_STATUSES.includes(body?.status) ? body.status : 'planning',
        start_date: dateOrNull(body?.startDate),
        due_date: dateOrNull(body?.dueDate),
        keka_code: str(body?.kekaCode) || null,
        created_at: new Date().toISOString(),
      };
      projects.unshift(p);
      for (const tid of teamIds) projectTeams.push({ id: newId('tpt'), project_id: p.id, team_id: tid });
      return { id: p.id };
    },
  ],
  [
    'PUT',
    /^\/team-roster\/projects\/([^/]+)$/,
    ([, id], body) => {
      const p = projectOf(id);
      if (!p) return notFound('Project not found.');
      const d = dept(p.department_id);
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      const b = body ?? {};
      if ('name' in b) {
        if (!str(b.name)) return fail('Project name is required.');
        p.name = str(b.name);
      }
      if ('description' in b) p.description = str(b.description) || null;
      if ('priority' in b) {
        if (!PRIORITIES.includes(b.priority)) return fail('Invalid priority.');
        p.priority = b.priority;
      }
      if ('status' in b) {
        if (!PROJECT_STATUSES.includes(b.status)) return fail('Invalid status.');
        p.status = b.status;
      }
      if ('startDate' in b) p.start_date = dateOrNull(b.startDate);
      if ('dueDate' in b) p.due_date = dateOrNull(b.dueDate);
      if ('kekaCode' in b) p.keka_code = str(b.kekaCode) || null;
      if ('leadId' in b) {
        const leadId = str(b.leadId) || null;
        if (leadId && !personIn(leadId, d)) return fail('The project lead must be an employee in this department.');
        p.lead_id = leadId;
        p.lead_name = nameOf(leadId);
      }
      return {};
    },
  ],
  [
    'DELETE',
    /^\/team-roster\/projects\/([^/]+)$/,
    ([, id]) => {
      const p = projectOf(id);
      if (!p) return notFound('Project not found.');
      const d = dept(p.department_id);
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      removeWhere(tasks, (t) => t.project_id === id);
      removeWhere(projectTeams, (r) => r.project_id === id);
      removeWhere(projects, (x) => x.id === id);
      return { deleted: true };
    },
  ],
  [
    'POST',
    /^\/team-roster\/projects\/([^/]+)\/teams$/,
    ([, id], body) => {
      const p = projectOf(id);
      if (!p) return notFound('Project not found.');
      const d = dept(p.department_id);
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      const teamIds: string[] = Array.isArray(body?.teamIds) ? ([...new Set(body.teamIds.map(String).filter(Boolean))] as string[]) : [];
      if (!teamIds.length) return fail('Select at least one team.');
      if (teamIds.some((tid) => !teams.some((t) => t.id === tid))) return fail('One or more selected teams could not be found.');
      if (teamIds.some((tid) => teams.find((t) => t.id === tid)?.department_id !== d.id)) return fail('Selected teams must belong to this same department.');
      for (const tid of teamIds)
        if (!projectTeams.some((r) => r.project_id === id && r.team_id === tid)) projectTeams.push({ id: newId('tpt'), project_id: id!, team_id: tid });
      return { teams: projectTeamsFor(id!) };
    },
  ],
  [
    'DELETE',
    /^\/team-roster\/projects\/([^/]+)\/teams\/([^/]+)$/,
    ([, pid, tid]) => {
      const p = projectOf(pid);
      if (!p) return notFound('Project not found.');
      const d = dept(p.department_id);
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      removeWhere(projectTeams, (r) => r.project_id === pid && r.team_id === tid);
      return { removed: true };
    },
  ],

  // Task types
  [
    'PUT',
    /^\/team-roster\/task-types$/,
    (_p, body) => {
      const d = dept(body?.departmentId);
      if (!body?.departmentId) return fail('departmentId is required.');
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      const types = Array.isArray(body?.types) ? ([...new Set(body.types.map((t: unknown) => str(t)).filter(Boolean))] as string[]).slice(0, 40) : [];
      upsertDepartment({ id: d.id, taskTypes: types } as Parameters<typeof upsertDepartment>[0]);
      return { types };
    },
  ],

  // Tasks
  [
    'GET',
    /^\/team-roster\/tasks$/,
    (_p, _b, q) => {
      const refused = staffOnly();
      if (refused) return refused;
      if (q.get('mine') === '1') {
        const mine = tasks.filter((t) => visible(t) && isMe(t.assignee_id));
        // Due date first, undated last (the server's order).
        mine.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
        return { tasks: withNames(mine) };
      }
      const projectId = q.get('projectId');
      if (projectId) {
        const p = projectOf(projectId);
        if (!p) return notFound('Project not found.');
        const d = dept(p.department_id);
        if (!d) return notFound('Department not found.');
        if (!canManage(d)) return NO_ACCESS();
        return { tasks: tasks.filter((t) => t.project_id === projectId && visible(t)).sort((a, b) => b.created_at.localeCompare(a.created_at)) };
      }
      const departmentId = q.get('departmentId');
      if (!departmentId) return fail('projectId or departmentId is required.');
      const d = dept(departmentId);
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      const pids = projects.filter((p) => p.department_id === d.id).map((p) => p.id);
      return { tasks: withNames(tasks.filter((t) => pids.includes(t.project_id) && visible(t)).sort((a, b) => b.created_at.localeCompare(a.created_at))) };
    },
  ],
  [
    'POST',
    /^\/team-roster\/tasks$/,
    (_p, body) => {
      const b = body ?? {};
      const projectId = str(b.projectId);
      const title = str(b.title);
      if (!projectId) return fail('projectId is required.');
      if (!title) return fail('Task title is required.');
      const p = projectOf(projectId);
      if (!p) return notFound('Project not found.');
      const d = dept(p.department_id);
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      const est = b.estimatedHours != null && b.estimatedHours !== '' ? Number(b.estimatedHours) : null;
      if (est != null && (!Number.isFinite(est) || est < 0)) return fail('Estimated hours must be a non-negative number.');
      let assigneeId: string | null = null;
      if (b.assigneeId) {
        const err = assertAssigneeOnProject(String(b.assigneeId), projectId);
        if (err) return fail(err);
        assigneeId = isMe(String(b.assigneeId)) ? ME : String(b.assigneeId);
      }
      let parent: string | null = null;
      if (b.parentTaskId) {
        const par = tasks.find((t) => t.id === b.parentTaskId);
        if (!par) return notFound('Parent work item not found.');
        if (par.project_id !== projectId) return fail('The parent work item must be in the same project.');
        if (par.parent_task_id) return fail('A sub-work cannot itself have sub-works — pick the top-level work item instead.');
        parent = par.id;
      }
      const status = TASK_STATUSES.includes(b.status) ? b.status : 'todo';
      const now = new Date().toISOString();
      const t: Task = {
        ...task(newId('trk'), projectId, title),
        parent_task_id: parent,
        description: str(b.description) || null,
        type: str(b.type) || null,
        manager_comment: str(b.managerComment) || null,
        assignee_id: assigneeId,
        assignee_name: assigneeId ? nameOf(assigneeId) : null,
        priority: PRIORITIES.includes(b.priority) ? b.priority : 'medium',
        status,
        due_date: dateOrNull(b.dueDate),
        estimated_hours: est,
        created_at: now,
        updated_at: now,
        completed_at: status === 'done' ? now : null,
        // A task given to the demo person belongs to whoever is playing them now.
        ...(assigneeId === ME ? { onlyFor: [persona().id] } : null),
      };
      tasks.unshift(t);
      return { id: t.id };
    },
  ],
  [
    'PUT',
    /^\/team-roster\/tasks\/([^/]+)$/,
    ([, id], body) => {
      const t = tasks.find((x) => x.id === id && visible(x));
      if (!t) return notFound('Task not found.');
      const d = dept(t.department_id);
      if (!d) return notFound('Department not found.');
      const manager = canManage(d);
      const assignee = isMe(t.assignee_id);
      if (!manager && !assignee) return fail('You do not have access to this task.', 403);
      const b = body ?? {};
      const allowed = manager
        ? ['title', 'description', 'assigneeId', 'priority', 'status', 'dueDate', 'estimatedHours', 'startedAt', 'elapsedSeconds', 'type', 'managerComment']
        : ['status', 'startedAt', 'elapsedSeconds'];
      const bad = Object.keys(b).filter((k) => !allowed.includes(k) && !['performedById', 'actorId'].includes(k));
      if (bad.length) return fail(`You can only update: ${allowed.join(', ')}.`, 403);
      const next: Partial<Task> = {};
      if ('title' in b) {
        if (!str(b.title)) return fail('Task title is required.');
        next.title = str(b.title);
      }
      if ('description' in b) next.description = str(b.description) || null;
      if ('type' in b) next.type = str(b.type) || null;
      if ('managerComment' in b) next.manager_comment = str(b.managerComment) || null;
      if ('priority' in b) {
        if (!PRIORITIES.includes(b.priority)) return fail('Invalid priority.');
        next.priority = b.priority;
      }
      if ('status' in b) {
        if (!TASK_STATUSES.includes(b.status)) return fail('Invalid status.');
        next.status = b.status;
        next.completed_at = b.status === 'done' ? new Date().toISOString() : null;
      }
      if ('dueDate' in b) next.due_date = dateOrNull(b.dueDate);
      if ('estimatedHours' in b) {
        const hrs = b.estimatedHours != null && b.estimatedHours !== '' ? Number(b.estimatedHours) : null;
        if (hrs != null && (!Number.isFinite(hrs) || hrs < 0)) return fail('Estimated hours must be a non-negative number.');
        next.estimated_hours = hrs;
      }
      if ('startedAt' in b) {
        if (!b.startedAt) next.started_at = null;
        else {
          const at = Date.parse(String(b.startedAt));
          if (!Number.isFinite(at)) return fail('Invalid startedAt.');
          next.started_at = new Date(at).toISOString();
        }
      }
      if ('elapsedSeconds' in b) {
        const secs = Number(b.elapsedSeconds);
        if (!Number.isFinite(secs) || secs < 0) return fail('elapsedSeconds must be a non-negative number.');
        next.elapsed_seconds = Math.floor(secs);
      }
      if ('assigneeId' in b && (b.assigneeId || null) !== t.assignee_id && !(isMe(b.assigneeId) && t.assignee_id === ME)) {
        if (!b.assigneeId) {
          next.assignee_id = null;
          next.assignee_name = null;
        } else {
          const err = assertAssigneeOnProject(String(b.assigneeId), t.project_id);
          if (err) return fail(err);
          const aid = isMe(String(b.assigneeId)) ? ME : String(b.assigneeId);
          next.assignee_id = aid;
          next.assignee_name = nameOf(aid);
          if (aid === ME) next.onlyFor = [persona().id];
        }
      }
      Object.assign(t, next, { updated_at: new Date().toISOString() });
      // Starting this one pauses the same person's other running task (1242–1260).
      if (next.started_at && t.assignee_id) {
        const now = Date.now();
        for (const o of tasks) {
          if (o.id === t.id || !o.started_at || o.assignee_id !== t.assignee_id) continue;
          o.elapsed_seconds = live(o, now);
          o.started_at = null;
          o.updated_at = new Date(now).toISOString();
        }
      }
      return {};
    },
  ],
  [
    'DELETE',
    /^\/team-roster\/tasks\/([^/]+)$/,
    ([, id]) => {
      const t = tasks.find((x) => x.id === id && visible(x));
      if (!t) return notFound('Task not found.');
      const d = dept(t.department_id);
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      removeWhere(tasks, (x) => x.id === id || x.parent_task_id === id);
      return { deleted: true };
    },
  ],

  // Workload
  [
    'GET',
    /^\/team-roster\/people$/,
    (_p, _b, q) => {
      const d = dept(q.get('departmentId'));
      if (!q.get('departmentId')) return fail('departmentId is required.');
      if (!d) return notFound('Department not found.');
      if (!canManage(d)) return NO_ACCESS();
      const active = teams.filter((t) => t.department_id === d.id && t.status === 'active');
      const byId = new Map<
        string,
        { id: string; name: string; teams: string[]; activeTasks: number; estimatedHours: number; overdue: number; loggedHours: number }
      >();
      for (const t of active) {
        for (const m of visibleMembers(t.id)) {
          const cur = byId.get(m.employee_id) ?? {
            id: m.employee_id,
            name: m.employee_name,
            teams: [],
            activeTasks: 0,
            estimatedHours: 0,
            overdue: 0,
            loggedHours: 0,
          };
          cur.teams.push(t.name);
          byId.set(m.employee_id, cur);
        }
      }
      const now = Date.now();
      const todayStr = today();
      for (const t of tasks) {
        if (t.department_id !== d.id || !t.assignee_id || !visible(t)) continue;
        const p = byId.get(t.assignee_id);
        if (!p) continue;
        p.loggedHours += live(t, now) / 3600;
        if (t.status === 'done') continue;
        p.activeTasks += 1;
        p.estimatedHours += Number(t.estimated_hours) || 0;
        if (t.due_date && t.due_date < todayStr) p.overdue += 1;
      }
      const list = [...byId.values()].map((p) => ({ ...p, loggedHours: Math.round(p.loggedHours * 100) / 100 }));
      return { people: list.sort((a, b) => a.name.localeCompare(b.name)) };
    },
  ],
];
