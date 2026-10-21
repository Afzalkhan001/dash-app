// The manager / admin side of work (web: ManagerTasksView, RequestsView's task and time-correction
// queues, ProjectsView, ClientsView, ManagerHome). Existing endpoints only — none of them checks a
// role on the server, so the screens gate with features/work/access.ts.
//
//   GET    /tasks[?activeOnly=1]   every task in the company (activeOnly drops status 'completed')
//   POST   /tasks                  create (emails + WhatsApps the assignee unless source 'booking')
//   PUT    /tasks/:id              merge patch ('completed' → "Task approved" to the assignee when
//                                  assigneeId is set; 'submitted' → to managerId ‖ createdBy)
//   DELETE /tasks/:id              hard delete
//   GET    /users                  the company (avatars stripped) — slimmed here, never persisted
//   GET    /departments            adminId says who runs a department
//   GET    /bookings?since=        Keka code of booking tasks, the manager's Team today / Tomorrow
//   GET    /leaves                 (api/people useLeaveDays)
//   GET/PUT /time_corrections[/:id]  the time-correction queue (rows have no tenantId on the real
//                                  server, so it is usually empty — the Inbox hides it then)
//   GET/POST/PUT /projects[/:id]   Keka codes (DELETE exists but the web hides it; never called)
//   GET    /whitelist              roster people who haven't signed up (project owner picker)
//   GET/POST/PUT/DELETE /clients[/:id]

import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { type Project, reimbursementKeys } from '@/api/reimbursements';
import { type Booking, type Task, taskKeys } from '@/api/tasks';
import { useSession } from '@/auth/session';
import { addDaysYmd } from '@/lib/ist';
import { todayIst } from '@/lib/dates';

// ── Types ────────────────────────────────────────────────────────────────────
export type TeamTask = Task & {
  createdBy?: string;
  managerId?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  timestamps?: Record<string, unknown>;
};

/** One person, cut down to what the work screens read (no photos, no bank, no ids of other systems). */
export type WorkUser = {
  id: string;
  name: string;
  role: string;
  dept: string;
  jobTitle: string;
  email: string;
  phone: string;
  employeeNumber: string;
  reportingManager: string;
  additionalManager: string;
  hasAvatar: boolean;
  leaveDates: string[];
  active: boolean;
};

export type WorkDept = { id: string; name: string; adminId: string };

export type WorkProject = Project & {
  meta1?: string;
  meta2?: string;
  meta3?: string;
  date?: string;
  createdAt?: string;
};

export type WorkClient = {
  id: string;
  name: string;
  channelName: string;
  email: string;
  phone: string;
  managerId: string;
  managerName: string;
  createdAt: string;
};

export type TimeCorrection = {
  id: string;
  taskId?: string;
  taskTitle?: string;
  taskDate?: string;
  assignee?: string;
  assigneeId?: string;
  project?: string;
  requestedHours?: number | string;
  reason?: string;
  status?: string;
  approvedHours?: number;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectionNote?: string;
  rejectedAt?: string;
  createdAt?: string;
  [k: string]: unknown;
};

/** A roster person who hasn't signed up yet (owner picker only). */
export type RosterPerson = { id: string; name: string; email: string; employeeNumber: string };

const str = (v: unknown) => (v == null ? '' : String(v));
const rows = <T,>(r: unknown): T[] => (Array.isArray(r) ? (r.filter((x) => !!x && typeof x === 'object') as T[]) : []);

// ── Query keys ───────────────────────────────────────────────────────────────
// The review queues sit under ['inbox', <kind>] so the Inbox's poll, focus refresh and pull to refresh
// cover them (docs/port/EXTENSION-POINTS.md §5).
export const workKeys = {
  all: ['work'] as const,
  users: (u?: string) => ['work', 'users', u ?? ''] as const,
  depts: (u?: string) => ['work', 'depts', u ?? ''] as const,
  tasks: (u?: string, scope: 'active' | 'all' = 'active') => ['work', 'tasks', u ?? '', scope] as const,
  tasksAll: (u?: string) => ['work', 'tasks', u ?? ''] as const,
  bookings: (u?: string) => ['work', 'bookings', u ?? ''] as const,
  clients: (u?: string) => ['work', 'clients', u ?? ''] as const,
  whitelist: (u?: string) => ['work', 'whitelist', u ?? ''] as const,
  reviewTasks: (u?: string) => ['inbox', 'task', u ?? ''] as const,
  timefix: (u?: string) => ['inbox', 'timefix', u ?? ''] as const,
};

const useMe = () => useSession((s) => s.user?.id);

// ── Reads ────────────────────────────────────────────────────────────────────
function slimUser(u: Record<string, unknown>): WorkUser {
  return {
    id: str(u.id),
    name: str(u.name).trim(),
    role: str(u.role),
    dept: str(u.dept),
    jobTitle: str(u.jobTitle || u.designation),
    email: str(u.email),
    phone: str(u.mobile || u.phone),
    employeeNumber: str(u.employeeNumber || u.kekaCode),
    reportingManager: str(u.reportingManager),
    additionalManager: str(u.additionalManager),
    hasAvatar: !!u.hasAvatar,
    leaveDates: Array.isArray(u.leaveDates) ? u.leaveDates.filter((d): d is string => typeof d === 'string') : [],
    active: !(u.resigned === true || u.resigned === 'true') && (!u.status || u.status === 'active'),
  };
}

/** GET /users, slimmed (names are how the web matches teams, so they are kept exactly). */
export function useWorkUsers(enabled = true) {
  const userId = useMe();
  return useQuery({
    queryKey: workKeys.users(userId),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }) => rows<Record<string, unknown>>(await unwrap(api.get('/users', signal))).map(slimUser).filter((u) => !!u.id),
    staleTime: 10 * 60_000,
  });
}

/** GET /departments with who runs each one. */
export function useWorkDepts(enabled = true) {
  const userId = useMe();
  return useQuery({
    queryKey: workKeys.depts(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) =>
      rows<Record<string, unknown>>(await unwrap(api.get('/departments', signal)))
        .filter((d) => d.id != null)
        .map((d) => ({ id: str(d.id), name: str(d.name), adminId: str(d.adminId) }) satisfies WorkDept),
    staleTime: 30 * 60_000,
  });
}

const fetchTasks = async (active: boolean, signal?: AbortSignal) =>
  rows<TeamTask>(await unwrap(api.get(`/tasks${active ? '?activeOnly=1' : ''}`, signal)));

/**
 * The company's tasks. `scope: 'active'` (default) asks for ?activeOnly=1 (no completed rows, much
 * smaller); 'all' is the whole table (about 1.3 MB on the real server) — only for Completed / All.
 */
export function useTeamTasks(scope: 'active' | 'all' = 'active', enabled = true) {
  const userId = useMe();
  return useQuery({
    queryKey: workKeys.tasks(userId, scope),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: ({ signal }) => fetchTasks(scope === 'active', signal),
    staleTime: 60_000,
  });
}

/** Submitted tasks waiting on review (the Inbox `task` queue reads the active list). */
export function useReviewTasks(enabled: boolean) {
  const userId = useMe();
  return useQuery({
    queryKey: workKeys.reviewTasks(userId),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: ({ signal }) => fetchTasks(true, signal),
    staleTime: 30_000,
  });
}

/** Professional bookings of the last 60 days onwards (IST), for Keka codes and the manager's day. */
export function useWorkBookings(enabled = true) {
  const userId = useMe();
  return useQuery({
    queryKey: workKeys.bookings(userId),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }) => rows<Booking>(await unwrap(api.get(`/bookings?since=${addDaysYmd(todayIst(), -60)}`, signal))),
    staleTime: 60_000,
  });
}

export function useTimeCorrections(enabled: boolean) {
  const userId = useMe();
  return useQuery({
    queryKey: workKeys.timefix(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => rows<TimeCorrection>(await unwrap(api.get('/time_corrections', signal))),
    staleTime: 30_000,
  });
}

function slimClient(c: Record<string, unknown>): WorkClient {
  return {
    id: str(c.id),
    name: str(c.name),
    channelName: str(c.channelName),
    email: str(c.email),
    phone: str(c.phone),
    managerId: str(c.managerId),
    managerName: str(c.managerName),
    createdAt: str(c.createdAt),
  };
}

/** GET /clients (the whole company — the screen keeps only the person's own, as the web does). */
export function useAllClients(enabled = true) {
  const userId = useMe();
  return useQuery({
    queryKey: workKeys.clients(userId),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }) => rows<Record<string, unknown>>(await unwrap(api.get('/clients', signal))).map(slimClient).filter((c) => !!c.id),
    staleTime: 5 * 60_000,
  });
}

/** GET /whitelist → the roster people who have not signed up yet (photos never kept). */
export function useRoster(enabled: boolean) {
  const userId = useMe();
  return useQuery({
    queryKey: workKeys.whitelist(userId),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }) =>
      rows<Record<string, unknown>>(await unwrap(api.get('/whitelist', signal)))
        .map((w) => ({ id: str(w.id), name: str(w.name).trim(), email: str(w.email), employeeNumber: str(w.employeeNumber || w.kekaCode || w.empNo) }) satisfies RosterPerson)
        .filter((w) => !!w.name),
    staleTime: 10 * 60_000,
  });
}

// ── Writes (plain functions; screens wrap them in useMutation) ─────────────
const enc = encodeURIComponent;
export const createTeamTask = (task: Record<string, unknown>) => unwrap(api.post<{ ok: true; task: TeamTask }>('/tasks', task));
export const updateTeamTask = (id: string, patch: Record<string, unknown>) => unwrap(api.put<{ ok: true }>(`/tasks/${enc(id)}`, patch));
export const deleteTeamTask = (id: string) => unwrap(api.del<{ ok: true }>(`/tasks/${enc(id)}`));
export const updateTimeCorrection = (id: string, patch: Record<string, unknown>) => unwrap(api.put<{ ok: true }>(`/time_corrections/${enc(id)}`, patch));
export const createProject = (p: Record<string, unknown>) => unwrap(api.post<{ ok: true; project: WorkProject }>('/projects', p));
export const updateProject = (id: string, patch: Record<string, unknown>) => unwrap(api.put<{ ok: true }>(`/projects/${enc(id)}`, patch));
export const createClient = (c: Record<string, unknown>) => unwrap(api.post<{ ok: true }>('/clients', c));
export const updateClient = (id: string, patch: Record<string, unknown>) => unwrap(api.put<{ ok: true }>(`/clients/${enc(id)}`, patch));
export const deleteClient = (id: string) => unwrap(api.del<{ ok: true }>(`/clients/${enc(id)}`));

/** What to refresh after a task write: Team tasks, the review queue, and the assignee's own lists. */
export const taskWriteKeys = (userId?: string) => [workKeys.tasksAll(userId), workKeys.reviewTasks(userId), taskKeys.mine(userId), taskKeys.otps(userId)];
export const projectWriteKeys = (userId?: string) => [reimbursementKeys.projects(userId)];
export const clientWriteKeys = (userId?: string) => [workKeys.clients(userId), taskKeys.clients(userId)];
