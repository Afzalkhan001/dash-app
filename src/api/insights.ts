// Insights: Reports (web ReportsView, dash.html:23646) and Device monitoring (web Tm360Hub,
// dash.html:10902). Existing endpoints only (docs/port/team-ops.md §3–4).
//
// Reports read five whole lists and compute everything on the phone, exactly as the website does:
//   GET /tasks             every task in the company (shared cache with the work domain: useTeamTasks('all'))
//   GET /users             slimmed here (names, roles, departments, reporting lines, professional category)
//   GET /departments       (work domain's useWorkDepts)
//   GET /projects          (reimbursements' useProjects)
//   GET /time_corrections  (work domain's useTimeCorrections)
// Nothing is written from Reports.
//
// Device monitoring proxies TM360 through tm360.js. The server decides who sees whom (visibilityFor:
// IT & Admin and leadership see everyone and may pair; a manager or admin sees only the people whose
// reporting manager is them, read-only) and answers readable sentences on failure.
//   GET  /tm360/roster                  people, TM360 link, devices
//   GET  /tm360/live                    the "System activity" counts + live state per email
//   GET  /tm360/employee/:kind          summary | activity | restrictions | location (email, from, to)
//   POST /tm360/employees/link          creates a TM360 account (another system) — admins only
//   POST /tm360/devices/claim           pairs a machine to a person — admins only
//   POST /tm360/devices/unpair          stops a machine reporting — admins only
// TM360 answers can be slow (the website comments mention timeouts), so these calls get 30 s, and
// none of it is ever written to the phone's disk cache (meta.persist false, short gcTime).

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api, apiFetch, unwrap } from '@/api/client';
import { useProjects } from '@/api/reimbursements';
import { type TimeCorrection, useTeamTasks, useTimeCorrections, useWorkDepts } from '@/api/work';
import { useSession } from '@/auth/session';

const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v.filter((x) => !!x && typeof x === 'object') as T[]) : []);

const useMe = () => useSession((s) => s.user?.id);

export const insightsKeys = {
  users: (u?: string) => ['insights', 'users', u ?? ''] as const,
  roster: (u?: string) => ['insights', 'tm360', u ?? '', 'roster'] as const,
  live: (u?: string) => ['insights', 'tm360', u ?? '', 'live'] as const,
  tm360: (u?: string) => ['insights', 'tm360', u ?? ''] as const,
  employee: (u: string | undefined, kind: Tm360Kind, email: string, from: string, to: string) =>
    ['insights', 'tm360', u ?? '', 'employee', kind, email, from, to] as const,
};

// ── Reports ──────────────────────────────────────────────────────────────────
/** One person as Reports reads them (ReportsView: name, role, dept, reporting lines, Booking category). */
export type ReportUser = {
  id: string;
  name: string;
  role: string;
  dept: string;
  reportingManager: string;
  additionalManager: string;
  professionalAvailable: boolean;
  professionalType: string;
};

function slimReportUser(u: Record<string, unknown>): ReportUser {
  return {
    id: str(u.id),
    name: str(u.name),
    role: str(u.role),
    dept: str(u.dept),
    reportingManager: str(u.reportingManager),
    additionalManager: str(u.additionalManager),
    professionalAvailable: !!u.professionalAvailable,
    professionalType: str(u.professionalType),
  };
}

/** GET /users, slimmed to what Reports reads (no photos, contact or bank details; never persisted). */
export function useReportUsers(enabled = true) {
  const userId = useMe();
  return useQuery({
    queryKey: insightsKeys.users(userId),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }) => list<Record<string, unknown>>(await unwrap(api.get('/users', signal))).map(slimReportUser).filter((u) => !!u.id),
    staleTime: 10 * 60_000,
  });
}

/**
 * Everything ReportsView loads on mount, as one result. `/tasks` is the whole company history
 * (about 1.3 MB on the real server): it is shared with Team tasks' "All" cache and kept for 10 min.
 */
const NO_CORRECTIONS: TimeCorrection[] = [];

export function useReportData(enabled: boolean) {
  const tasks = useTeamTasks('all', enabled);
  const users = useReportUsers(enabled);
  const depts = useWorkDepts(enabled);
  const projects = useProjects(enabled);
  const corrections = useTimeCorrections(enabled);
  const parts = [tasks, users, depts, projects];
  return {
    tasks: tasks.data,
    users: users.data,
    depts: depts.data,
    projects: projects.data,
    // The corrections list is optional: the website shows its reports without it.
    corrections: corrections.data ?? NO_CORRECTIONS,
    pending: parts.some((q) => q.isPending),
    error: parts.find((q) => q.isError && !q.data)?.error ?? null,
    refetch: () => Promise.all([tasks.refetch(), users.refetch(), depts.refetch(), projects.refetch(), corrections.refetch()]),
  };
}

// ── Device monitoring (TM360) ────────────────────────────────────────────────
export type Tm360DeviceStatus = 'ACTIVE' | 'PENDING' | 'REVOKED' | string;
export type Tm360Device = { id: string; hostname: string; status: Tm360DeviceStatus; lastSeenAt: string; platform: string };
export type Tm360Employee = {
  id: string;
  email: string;
  name: string;
  dept: string;
  jobTitle: string;
  employeeNumber: string;
  role: string;
  reportingManager: string;
  pendingSignup: boolean;
  matched: boolean;
  tm360: { id: string; role: string; status: string } | null;
  devices: Tm360Device[];
};
export type Tm360Roster = {
  scope: string;
  canPair: boolean;
  employees: Tm360Employee[];
  unassignedDevices: Tm360Device[];
  matchedCount: number;
  unmatchedCount: number;
};
export type Tm360LiveState = 'online' | 'idle' | 'offline' | 'unpaired' | string;
export type Tm360Live = {
  scope: string;
  tracked: number | null;
  online: number | null;
  idle: number | null;
  notPaired: number | null;
  avgProductivity: number | null;
  status: Record<string, { state: Tm360LiveState; lastActiveAt: string; productivityScore: number | null }>;
};

export type Tm360Kind = 'summary' | 'activity' | 'restrictions' | 'location';
export type Tm360Named = { name: string; seconds: number };
export type Tm360DailyScore = {
  date: string;
  score: number | null;
  productiveMinutes: number | null;
  neutralMinutes: number | null;
  unproductiveMinutes: number | null;
  idleMinutes: number | null;
  activeMinutes: number | null;
};
export type Tm360Summary = {
  activeSeconds: number;
  idleSeconds: number;
  sampledRows: number;
  sampleCapped: boolean;
  topApps: Tm360Named[];
  topDomains: Tm360Named[];
  byCategory: Tm360Named[];
  dailyScores: Tm360DailyScore[];
};
export type Tm360Activity = {
  id: string;
  occurredAt: string;
  appName: string;
  domain: string;
  windowTitle: string;
  url: string;
  durationSeconds: number;
  isIdle: boolean;
  category: string;
  deviceId: string;
};
export type Tm360Restriction = { id: string; occurredAt: string; kind: string; matched: string; pattern: string; outcome: string };
export type Tm360Location = {
  deviceId: string;
  hostname: string;
  status: string;
  platform: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMetres: number | null;
  source: string;
  reportedAt: string;
  lastSeenAt: string;
};
export type Tm360EmployeeData = {
  summary: Tm360Summary;
  activity: { activity: Tm360Activity[] };
  restrictions: { events: Tm360Restriction[] };
  location: { locations: Tm360Location[] };
};

const TM360_TIMEOUT = 30_000;
const tmGet = <T,>(path: string, signal?: AbortSignal) => unwrap(apiFetch<T>(path, { signal, timeoutMs: TM360_TIMEOUT }));
const tmPost = <T,>(path: string, body: Record<string, unknown>) => unwrap(apiFetch<T>(path, { method: 'POST', body, timeoutMs: TM360_TIMEOUT }));

function slimDevice(d: Record<string, unknown>): Tm360Device {
  return { id: str(d.id), hostname: str(d.hostname), status: str(d.status), lastSeenAt: str(d.lastSeenAt), platform: str(d.platform) };
}

function slimEmployee(e: Record<string, unknown>): Tm360Employee {
  const t = e.tm360 && typeof e.tm360 === 'object' ? (e.tm360 as Record<string, unknown>) : null;
  return {
    id: str(e.id),
    email: str(e.email),
    name: str(e.name),
    dept: str(e.dept),
    jobTitle: str(e.jobTitle),
    employeeNumber: str(e.employeeNumber),
    role: str(e.role),
    reportingManager: str(e.reportingManager),
    pendingSignup: !!e.pendingSignup,
    matched: !!e.matched,
    tm360: t ? { id: str(t.id), role: str(t.role), status: str(t.status) } : null,
    devices: list<Record<string, unknown>>(e.devices).map(slimDevice),
  };
}

const named = (v: unknown): Tm360Named[] =>
  list<Record<string, unknown>>(v).map((x) => ({ name: str(x.name), seconds: num(x.seconds) ?? 0 }));

function slimEmployeeData(kind: Tm360Kind, r: Record<string, unknown>): Tm360EmployeeData[Tm360Kind] {
  if (kind === 'summary') {
    return {
      activeSeconds: num(r.activeSeconds) ?? 0,
      idleSeconds: num(r.idleSeconds) ?? 0,
      sampledRows: num(r.sampledRows) ?? 0,
      sampleCapped: !!r.sampleCapped,
      topApps: named(r.topApps),
      topDomains: named(r.topDomains),
      byCategory: named(r.byCategory),
      dailyScores: list<Record<string, unknown>>(r.dailyScores).map((d) => ({
        date: str(d.date),
        score: num(d.score),
        productiveMinutes: num(d.productiveMinutes),
        neutralMinutes: num(d.neutralMinutes),
        unproductiveMinutes: num(d.unproductiveMinutes),
        idleMinutes: num(d.idleMinutes),
        activeMinutes: num(d.activeMinutes),
      })),
    } satisfies Tm360Summary;
  }
  if (kind === 'activity') {
    return {
      activity: list<Record<string, unknown>>(r.activity).map((a, i) => ({
        id: str(a.id) || String(i),
        occurredAt: str(a.occurredAt),
        appName: str(a.appName),
        domain: str(a.domain),
        windowTitle: str(a.windowTitle),
        url: str(a.url),
        durationSeconds: num(a.durationSeconds) ?? 0,
        isIdle: !!a.isIdle,
        category: str(a.category),
        deviceId: str(a.deviceId),
      })),
    };
  }
  if (kind === 'restrictions') {
    return {
      events: list<Record<string, unknown>>(r.events).map((e, i) => ({
        id: str(e.id) || String(i),
        occurredAt: str(e.occurredAt),
        kind: str(e.kind),
        matched: str(e.matched),
        pattern: str(e.pattern),
        outcome: str(e.outcome),
      })),
    };
  }
  return {
    locations: list<Record<string, unknown>>(r.locations).map((l) => ({
      deviceId: str(l.deviceId),
      hostname: str(l.hostname),
      status: str(l.status),
      platform: str(l.platform),
      address: str(l.address),
      latitude: num(l.latitude),
      longitude: num(l.longitude),
      accuracyMetres: num(l.accuracyMetres),
      source: str(l.source),
      reportedAt: str(l.reportedAt),
      lastSeenAt: str(l.lastSeenAt),
    })),
  };
}

// Monitoring data is sensitive: memory only, and dropped five minutes after the screen closes.
const TM_CACHE = { meta: { persist: false }, gcTime: 5 * 60_000 } as const;

export function useTm360Roster(enabled: boolean) {
  const userId = useMe();
  return useQuery({
    queryKey: insightsKeys.roster(userId),
    enabled: enabled && !!userId,
    ...TM_CACHE,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const r = await tmGet<Record<string, unknown>>('/tm360/roster', signal);
      return {
        scope: str(r.scope),
        canPair: !!r.canPair,
        employees: list<Record<string, unknown>>(r.employees).map(slimEmployee).filter((e) => !!e.email),
        unassignedDevices: list<Record<string, unknown>>(r.unassignedDevices).map(slimDevice),
        matchedCount: num(r.matchedCount) ?? 0,
        unmatchedCount: num(r.unmatchedCount) ?? 0,
      } satisfies Tm360Roster;
    },
  });
}

/** The live counts, re-asked every 15 s while `poll` (the screen is open and focused), like the website. */
export function useTm360Live(enabled: boolean, poll: boolean) {
  const userId = useMe();
  return useQuery({
    queryKey: insightsKeys.live(userId),
    enabled: enabled && !!userId,
    ...TM_CACHE,
    staleTime: 10_000,
    refetchInterval: poll ? 15_000 : false,
    queryFn: async ({ signal }) => {
      const r = await tmGet<Record<string, unknown>>('/tm360/live', signal);
      const status: Tm360Live['status'] = {};
      const raw = r.status && typeof r.status === 'object' ? (r.status as Record<string, Record<string, unknown>>) : {};
      for (const [email, s] of Object.entries(raw)) {
        if (s && typeof s === 'object') status[email] = { state: str(s.state), lastActiveAt: str(s.lastActiveAt), productivityScore: num(s.productivityScore) };
      }
      return {
        scope: str(r.scope),
        tracked: num(r.tracked),
        online: num(r.online),
        idle: num(r.idle),
        notPaired: num(r.notPaired),
        avgProductivity: num(r.avgProductivity),
        status,
      } satisfies Tm360Live;
    },
  });
}

/**
 * One tab of the employee drill-down, asked only when that tab is open (the activity list alone can
 * run to 2,000 rows). `from` / `to` are IST days, sent as real instants (Tm360EmployeePanel 10670).
 */
export function useTm360Employee<K extends Tm360Kind>(kind: K, email: string, from: string, to: string, enabled: boolean) {
  const userId = useMe();
  return useQuery({
    queryKey: insightsKeys.employee(userId, kind, email, from, to),
    enabled: enabled && !!userId && !!email && !!from && !!to,
    ...TM_CACHE,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const fromIso = new Date(`${from}T00:00:00+05:30`).toISOString();
      const toIso = new Date(`${to}T23:59:59.999+05:30`).toISOString();
      const qs = `?email=${encodeURIComponent(email)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
      const r = await tmGet<Record<string, unknown>>(`/tm360/employee/${kind}${qs}`, signal);
      return slimEmployeeData(kind, r) as Tm360EmployeeData[K];
    },
  });
}

export type Tm360LinkResult = { created?: boolean; alreadyExisted?: boolean; tm360UserId?: string; role?: string; managerEmail?: string };
export type Tm360ClaimResult = { deviceId?: string; hostname?: string };

export const linkToTm360 = (userId: string) => tmPost<Tm360LinkResult>('/tm360/employees/link', { userId });
export const claimTm360Device = (code: string, employeeEmail: string) => tmPost<Tm360ClaimResult>('/tm360/devices/claim', { code, employeeEmail });
export const unpairTm360Device = (deviceId: string) => tmPost<Record<string, unknown>>('/tm360/devices/unpair', { deviceId });
