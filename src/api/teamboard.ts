// Team board (the website's "Team Roster", team_roster.js) and Team tasks (the website's "My Team
// Tasks"). Existing endpoints only, all behind the server's auth gate and EMPLOYEE_ROLES; every
// department route re-checks canManageTeamRoster (department admin, a granted manager, or an
// overseer), and a task PUT from a plain assignee may only carry status / startedAt / elapsedSeconds.
//
//   GET    /departments                               adminId, teamRosterEnabled, taskTypes (routes/departments.js)
//   GET    /team-roster/managers?mine=1               my own manager grants (the sidebar's MY_TR_MANAGER_DEPT_IDS)
//   GET    /team-roster/managers?departmentId=        department admin only
//   POST   /team-roster/managers                      { departmentId, employeeIds[] } → { managers }
//   DELETE /team-roster/managers/:id
//   GET    /team-roster/teams?departmentId=           { teams }
//   GET    /team-roster/teams/:id                     { team, members, projects }
//   POST   /team-roster/teams                         { departmentId, name, description, leadId, memberIds[] }
//   PUT    /team-roster/teams/:id                     { name, description, leadId, status }
//   DELETE /team-roster/teams/:id                     drops memberships and project links first
//   POST   /team-roster/teams/:id/members             { employeeIds[] } → { members }
//   DELETE /team-roster/teams/:tid/members/:mid
//   GET    /team-roster/projects?departmentId=        { projects } (+ team_count)
//   GET    /team-roster/projects/:id                  { project, teams }
//   POST   /team-roster/projects                      { departmentId, name, description, leadId, priority, status, startDate, dueDate, kekaCode, teamIds[] }
//   PUT    /team-roster/projects/:id
//   DELETE /team-roster/projects/:id                  deletes every task of the project
//   POST   /team-roster/projects/:id/teams            { teamIds[] } → { teams }
//   DELETE /team-roster/projects/:pid/teams/:tid
//   PUT    /team-roster/task-types                    { departmentId, types[] } → { types }
//   GET    /team-roster/tasks?mine=1 | ?projectId= | ?departmentId=
//   POST   /team-roster/tasks                         { projectId, parentTaskId, title, description, type, managerComment, assigneeId, priority, status, dueDate, estimatedHours }
//   PUT    /team-roster/tasks/:id                     starting one auto-pauses that person's other running task
//   DELETE /team-roster/tasks/:id                     takes its sub-works too
//   GET    /team-roster/people?departmentId=          the department's workload
//
// No route here sends an email or a WhatsApp. Reads are normalised (the server's snake_case kept),
// so a missing or odd field never reaches a screen as `undefined`.

import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

// ── Types ────────────────────────────────────────────────────────────────────
export type TrPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TrTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type TrProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';

export type TrDept = {
  id: string;
  name: string;
  adminId: string;
  teamRosterEnabled: boolean;
  taskTypes: string[];
};

export type TrManager = {
  id: string;
  department_id: string;
  employee_id: string;
  employee_name: string;
  granted_by_name: string;
  created_at: string;
};

export type TrTeam = {
  id: string;
  name: string;
  description: string;
  lead_id: string;
  lead_name: string;
  status: 'active' | 'archived';
  member_count: number;
};
export type TrTeamMember = {
  id: string;
  employee_id: string;
  employee_name: string;
};
export type TrTeamProject = {
  id: string;
  name: string;
  status: string;
  priority: string;
  due_date: string;
};
export type TrTeamDetail = {
  team: TrTeam;
  members: TrTeamMember[];
  projects: TrTeamProject[];
};

export type TrProject = {
  id: string;
  department_id: string;
  name: string;
  description: string;
  lead_id: string;
  lead_name: string;
  priority: TrPriority;
  status: TrProjectStatus;
  start_date: string;
  due_date: string;
  keka_code: string;
  team_count: number;
};
export type TrProjectTeam = {
  id: string;
  team_id: string;
  team_name: string;
  team_status: string;
};
export type TrProjectDetail = { project: TrProject; teams: TrProjectTeam[] };

export type TrTask = {
  id: string;
  department_id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string;
  type: string;
  manager_comment: string;
  assignee_id: string | null;
  assignee_name: string;
  priority: TrPriority;
  status: TrTaskStatus;
  due_date: string;
  estimated_hours: number | null;
  keka_code: string;
  elapsed_seconds: number;
  started_at: string | null;
  created_at: string;
  project_name: string;
  parent_title: string | null;
};

export type TrPerson = {
  id: string;
  name: string;
  teams: string[];
  activeTasks: number;
  estimatedHours: number;
  overdue: number;
  loggedHours: number;
};

// ── Normalising ──────────────────────────────────────────────────────────────
type Raw = Record<string, unknown>;
const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const rows = (v: unknown): Raw[] => (Array.isArray(v) ? (v.filter((x) => !!x && typeof x === 'object') as Raw[]) : []);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;
export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'] as const;

const toDept = (d: Raw): TrDept => ({
  id: str(d.id),
  name: str(d.name),
  adminId: str(d.adminId),
  teamRosterEnabled: d.teamRosterEnabled === true,
  taskTypes: Array.isArray(d.taskTypes) ? d.taskTypes.map(str).filter(Boolean) : [],
});
const toManager = (m: Raw): TrManager => ({
  id: str(m.id),
  department_id: str(m.department_id),
  employee_id: str(m.employee_id),
  employee_name: str(m.employee_name),
  granted_by_name: str(m.granted_by_name),
  created_at: str(m.created_at),
});
const toTeam = (t: Raw): TrTeam => ({
  id: str(t.id),
  name: str(t.name),
  description: str(t.description),
  lead_id: str(t.lead_id),
  lead_name: str(t.lead_name),
  status: t.status === 'archived' ? 'archived' : 'active',
  member_count: num(t.member_count),
});
const toProject = (p: Raw): TrProject => ({
  id: str(p.id),
  department_id: str(p.department_id),
  name: str(p.name),
  description: str(p.description),
  lead_id: str(p.lead_id),
  lead_name: str(p.lead_name),
  priority: oneOf(p.priority, PRIORITIES, 'medium'),
  status: oneOf(p.status, PROJECT_STATUSES, 'planning'),
  start_date: str(p.start_date).slice(0, 10),
  due_date: str(p.due_date).slice(0, 10),
  keka_code: str(p.keka_code),
  team_count: num(p.team_count),
});
export const toTask = (t: Raw): TrTask => ({
  id: str(t.id),
  department_id: str(t.department_id),
  project_id: str(t.project_id),
  parent_task_id: t.parent_task_id ? str(t.parent_task_id) : null,
  title: str(t.title),
  description: str(t.description),
  type: str(t.type),
  manager_comment: str(t.manager_comment),
  assignee_id: t.assignee_id ? str(t.assignee_id) : null,
  assignee_name: str(t.assignee_name),
  priority: oneOf(t.priority, PRIORITIES, 'medium'),
  status: oneOf(t.status, TASK_STATUSES, 'todo'),
  due_date: str(t.due_date).slice(0, 10),
  estimated_hours: t.estimated_hours == null || t.estimated_hours === '' ? null : num(t.estimated_hours),
  keka_code: str(t.keka_code),
  elapsed_seconds: Math.max(0, num(t.elapsed_seconds)),
  started_at: t.started_at ? str(t.started_at) : null,
  created_at: str(t.created_at),
  project_name: str(t.project_name),
  parent_title: t.parent_title == null ? null : str(t.parent_title),
});

// ── Keys ─────────────────────────────────────────────────────────────────────
// Everything sits under ['teamboard', <me>] so one invalidation after a write refreshes every list
// (the server auto-pauses other running tasks, so the whole picture can change on one Start).
export const tbKeys = {
  all: (u?: string) => ['teamboard', u ?? ''] as const,
  depts: (u?: string) => ['teamboard', u ?? '', 'depts'] as const,
  grants: (u?: string) => ['teamboard', u ?? '', 'grants'] as const,
  mine: (u?: string) => ['teamboard', u ?? '', 'mine'] as const,
  managers: (u: string | undefined, d: string) => ['teamboard', u ?? '', 'managers', d] as const,
  teams: (u: string | undefined, d: string) => ['teamboard', u ?? '', 'teams', d] as const,
  team: (u: string | undefined, id: string) => ['teamboard', u ?? '', 'team', id] as const,
  projects: (u: string | undefined, d: string) => ['teamboard', u ?? '', 'projects', d] as const,
  project: (u: string | undefined, id: string) => ['teamboard', u ?? '', 'project', id] as const,
  deptTasks: (u: string | undefined, d: string) => ['teamboard', u ?? '', 'dept-tasks', d] as const,
  projectTasks: (u: string | undefined, p: string) => ['teamboard', u ?? '', 'project-tasks', p] as const,
  people: (u: string | undefined, d: string) => ['teamboard', u ?? '', 'people', d] as const,
};

const useMe = () => useSession((s) => s.user?.id);

// ── Reads ────────────────────────────────────────────────────────────────────
// Fetchers are exported so the access snapshot (features/teamboard/access) can share one cache entry.
export async function fetchDepts(signal?: AbortSignal) {
  return rows(await unwrap(api.get<unknown>('/departments', signal))).map(toDept);
}
export async function fetchGrantDeptIds(signal?: AbortSignal) {
  const r = await unwrap(api.get<{ managers?: unknown }>('/team-roster/managers?mine=1', signal));
  return [
    ...new Set(
      rows(r?.managers)
        .map(toManager)
        .map((m) => m.department_id)
        .filter(Boolean),
    ),
  ];
}
export async function fetchMyTasks(signal?: AbortSignal) {
  const r = await unwrap(api.get<{ tasks?: unknown }>('/team-roster/tasks?mine=1', signal));
  return rows(r?.tasks).map(toTask);
}

/** GET /departments, with the Team Roster fields (adminId, teamRosterEnabled, taskTypes). */
export function useTbDepts(enabled = true) {
  const u = useMe();
  return useQuery({
    queryKey: tbKeys.depts(u),
    enabled: enabled && !!u,
    queryFn: ({ signal }) => fetchDepts(signal),
    staleTime: 5 * 60_000,
  });
}

/** The departments I am a granted Team Roster manager of (GET /team-roster/managers?mine=1). */
export function useMyGrantDeptIds(enabled = true) {
  const u = useMe();
  return useQuery({
    queryKey: tbKeys.grants(u),
    enabled: enabled && !!u,
    queryFn: ({ signal }) => fetchGrantDeptIds(signal),
    staleTime: 5 * 60_000,
  });
}

/** Team Roster tasks assigned to me (GET /team-roster/tasks?mine=1), due date first. */
export function useMyTrTasks(enabled = true) {
  const u = useMe();
  return useQuery({
    queryKey: tbKeys.mine(u),
    enabled: enabled && !!u,
    queryFn: ({ signal }) => fetchMyTasks(signal),
    staleTime: 60_000,
  });
}

export function useTrManagers(deptId: string, enabled = true) {
  const u = useMe();
  return useQuery({
    queryKey: tbKeys.managers(u, deptId),
    enabled: enabled && !!u && !!deptId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ managers?: unknown }>(`/team-roster/managers?departmentId=${encodeURIComponent(deptId)}`, signal));
      return rows(r?.managers).map(toManager);
    },
  });
}

export function useTrTeams(deptId: string, enabled = true) {
  const u = useMe();
  return useQuery({
    queryKey: tbKeys.teams(u, deptId),
    enabled: enabled && !!u && !!deptId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ teams?: unknown }>(`/team-roster/teams?departmentId=${encodeURIComponent(deptId)}`, signal));
      return rows(r?.teams).map(toTeam);
    },
  });
}

export function useTrTeam(id: string, enabled = true) {
  const u = useMe();
  return useQuery({
    queryKey: tbKeys.team(u, id),
    enabled: enabled && !!u && !!id,
    queryFn: async ({ signal }): Promise<TrTeamDetail> => {
      const r = await unwrap(api.get<{ team?: Raw; members?: unknown; projects?: unknown }>(`/team-roster/teams/${encodeURIComponent(id)}`, signal));
      return {
        team: toTeam(r?.team ?? {}),
        members: rows(r?.members).map((m) => ({
          id: str(m.id),
          employee_id: str(m.employee_id),
          employee_name: str(m.employee_name),
        })),
        projects: rows(r?.projects).map((p) => ({
          id: str(p.id),
          name: str(p.name),
          status: str(p.status),
          priority: str(p.priority),
          due_date: str(p.due_date).slice(0, 10),
        })),
      };
    },
  });
}

export function useTrProjects(deptId: string, enabled = true) {
  const u = useMe();
  return useQuery({
    queryKey: tbKeys.projects(u, deptId),
    enabled: enabled && !!u && !!deptId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ projects?: unknown }>(`/team-roster/projects?departmentId=${encodeURIComponent(deptId)}`, signal));
      return rows(r?.projects).map(toProject);
    },
  });
}

export function useTrProject(id: string, enabled = true) {
  const u = useMe();
  return useQuery({
    queryKey: tbKeys.project(u, id),
    enabled: enabled && !!u && !!id,
    queryFn: async ({ signal }): Promise<TrProjectDetail> => {
      const r = await unwrap(api.get<{ project?: Raw; teams?: unknown }>(`/team-roster/projects/${encodeURIComponent(id)}`, signal));
      return {
        project: toProject(r?.project ?? {}),
        teams: rows(r?.teams).map((t) => ({
          id: str(t.id),
          team_id: str(t.team_id),
          team_name: str(t.team_name),
          team_status: str(t.team_status),
        })),
      };
    },
  });
}

/** Every task in the department (Tasks tab), with project_name and parent_title. */
export function useTrDeptTasks(deptId: string, enabled = true) {
  const u = useMe();
  return useQuery({
    queryKey: tbKeys.deptTasks(u, deptId),
    enabled: enabled && !!u && !!deptId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ tasks?: unknown }>(`/team-roster/tasks?departmentId=${encodeURIComponent(deptId)}`, signal));
      return rows(r?.tasks).map(toTask);
    },
  });
}

/** Every task of one project (raw rows: no project_name / parent_title). */
export function useTrProjectTasks(projectId: string, enabled = true) {
  const u = useMe();
  return useQuery({
    queryKey: tbKeys.projectTasks(u, projectId),
    enabled: enabled && !!u && !!projectId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ tasks?: unknown }>(`/team-roster/tasks?projectId=${encodeURIComponent(projectId)}`, signal));
      return rows(r?.tasks).map(toTask);
    },
  });
}

export function useTrPeople(deptId: string, enabled = true) {
  const u = useMe();
  return useQuery({
    queryKey: tbKeys.people(u, deptId),
    enabled: enabled && !!u && !!deptId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ people?: unknown }>(`/team-roster/people?departmentId=${encodeURIComponent(deptId)}`, signal));
      return rows(r?.people).map((p): TrPerson => ({
        id: str(p.id),
        name: str(p.name),
        teams: Array.isArray(p.teams) ? p.teams.map(str).filter(Boolean) : [],
        activeTasks: num(p.activeTasks),
        estimatedHours: num(p.estimatedHours),
        overdue: num(p.overdue),
        loggedHours: num(p.loggedHours),
      }));
    },
  });
}

// ── Writes (throw ApiRequestError with the server's own sentence) ────────────
type Ok = Record<string, unknown>;
const enc = encodeURIComponent;

export const addManagers = (departmentId: string, employeeIds: string[]) =>
  unwrap(
    api.post<{ managers?: unknown }>('/team-roster/managers', {
      departmentId,
      employeeIds,
    }),
  );
export const removeManager = (id: string) => unwrap(api.del<Ok>(`/team-roster/managers/${enc(id)}`));

export type TeamBody = {
  name: string;
  description: string;
  leadId: string | null;
  status?: 'active' | 'archived';
};
export const createTeam = (departmentId: string, b: TeamBody & { memberIds: string[] }) =>
  unwrap(
    api.post<{ id: string }>('/team-roster/teams', {
      departmentId,
      name: b.name,
      description: b.description,
      leadId: b.leadId,
      memberIds: b.memberIds,
    }),
  );
export const updateTeam = (id: string, b: TeamBody) => unwrap(api.put<Ok>(`/team-roster/teams/${enc(id)}`, b));
export const deleteTeam = (id: string) => unwrap(api.del<Ok>(`/team-roster/teams/${enc(id)}`));
export const addTeamMembers = (teamId: string, employeeIds: string[]) => unwrap(api.post<Ok>(`/team-roster/teams/${enc(teamId)}/members`, { employeeIds }));
export const removeTeamMember = (teamId: string, memberId: string) => unwrap(api.del<Ok>(`/team-roster/teams/${enc(teamId)}/members/${enc(memberId)}`));

export type ProjectBody = {
  name: string;
  description: string;
  leadId: string | null;
  priority: TrPriority;
  status: TrProjectStatus;
  startDate: string | null;
  dueDate: string | null;
  kekaCode: string | null;
};
export const createProject = (departmentId: string, b: ProjectBody & { teamIds: string[] }) =>
  unwrap(api.post<{ id: string }>('/team-roster/projects', { departmentId, ...b }));
export const updateProject = (id: string, b: ProjectBody) => unwrap(api.put<Ok>(`/team-roster/projects/${enc(id)}`, b));
export const deleteProject = (id: string) => unwrap(api.del<Ok>(`/team-roster/projects/${enc(id)}`));
export const assignProjectTeam = (projectId: string, teamId: string) =>
  unwrap(
    api.post<Ok>(`/team-roster/projects/${enc(projectId)}/teams`, {
      teamIds: [teamId],
    }),
  );
export const unassignProjectTeam = (projectId: string, teamId: string) => unwrap(api.del<Ok>(`/team-roster/projects/${enc(projectId)}/teams/${enc(teamId)}`));

export const saveTaskTypes = (departmentId: string, types: string[]) =>
  unwrap(
    api.put<{ types?: unknown }>('/team-roster/task-types', {
      departmentId,
      types,
    }),
  );

export type TaskBody = {
  title: string;
  description: string;
  assigneeId: string | null;
  type: string | null;
  priority: TrPriority;
  status: TrTaskStatus;
  dueDate: string | null;
  estimatedHours: number | null;
  managerComment: string | null;
};
export const createTask = (projectId: string, parentTaskId: string | null, b: TaskBody) =>
  unwrap(
    api.post<{ id: string }>('/team-roster/tasks', {
      ...b,
      projectId,
      parentTaskId,
    }),
  );
/** A Work or a Sub work: just a name and a description (WorkFormModal). */
export const createWork = (projectId: string, parentTaskId: string | null, title: string, description: string) =>
  unwrap(
    api.post<{ id: string }>('/team-roster/tasks', {
      projectId,
      parentTaskId,
      title,
      description,
    }),
  );
export const updateTask = (id: string, b: Partial<TaskBody> & { startedAt?: string | null; elapsedSeconds?: number }) =>
  unwrap(api.put<Ok>(`/team-roster/tasks/${enc(id)}`, b));
export const deleteTask = (id: string) => unwrap(api.del<Ok>(`/team-roster/tasks/${enc(id)}`));
