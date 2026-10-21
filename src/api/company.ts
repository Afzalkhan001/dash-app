// Company admin (Super Admin · CEO · COO, plus the Config grantees): the dashboard counts, system logins
// (users + invitations), the company record's switches and "Who can…" lists, HR and Team Roster by
// department, the activity audit and the subscriptions tracker. Every route below already exists:
//
//   GET    /dashboard/summary                 routes/dashboard.js:46   { users, departments, activeTasks, pendingBookings }
//   GET    /users                             routes/users.js:108      tenant rows (avatars stripped)
//   PUT    /users/:id                         routes/users.js:186      { role, location? } — role needs a role-assigner
//   DELETE /users/:id                         routes/users.js:383      DESTRUCTIVE_ROLES, same company; irreversible
//   GET    /whitelist                         routes/whitelist.js:17   invitations of my company
//   POST   /whitelist                         routes/whitelist.js:87   UPSERTS BY EMAIL; sends the welcome email (+ WhatsApp)
//   PUT    /whitelist/:id                     routes/whitelist.js:167  { role, location? }
//   DELETE /whitelist/:id                     routes/whitelist.js:218  irreversible (no role check on the server)
//   GET    /departments                       routes/departments.js:19
//   PUT    /departments/:id                   routes/departments.js:120 { teamRosterEnabled }
//   PUT    /tenants/:id                       routes/tenants.js:53     shallow merge; arrays replaced WHOLE
//   GET    /hr/config/overview                hr.js:524                master/super only
//   PUT    /hr/config/departments[/:id]       hr.js:583 / :589         super only
//   GET    /team-roster/departments           team_roster.js:163       master/super only
//   GET    /audit_log, /summary, /user-search, /user/:id; POST /audit_log/export   server.js:7300–7401
//   GET    /subscriptions, /summary, /payments; POST/PUT/DELETE …                 subscriptions.js
//
// The audit and subscription routes resolve the caller from performedById / actorId (the session gate
// overwrites both with the real user); the GETs send them in the query exactly like the website.
// Sensitive or big answers (people lists, audit rows with before/after data, a person's full record)
// stay off the phone's disk (meta: { persist: false }).

import { keepPreviousData, type QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiRequestError, isApiError, unwrap } from '@/api/client';
import type { AuditGrant, Tenant, TenantGrant } from '@/api/me';
import { useSession } from '@/auth/session';

// ── Keys ─────────────────────────────────────────────────────────────────────
export const companyKeys = {
  all: ['company'] as const,
  summary: (uid: string) => ['company', 'summary', uid] as const,
  users: (uid: string) => ['company', 'users', uid] as const,
  whitelist: (uid: string) => ['company', 'whitelist', uid] as const,
  departments: (uid: string) => ['company', 'departments', uid] as const,
  hrConfig: (uid: string) => ['company', 'hr-config', uid] as const,
  teamRoster: (uid: string) => ['company', 'team-roster', uid] as const,
  audit: (uid: string) => ['company', 'audit', uid] as const,
  subs: (uid: string) => ['company', 'subs', uid] as const,
};

function useUid() {
  return useSession((s) => s.user?.id) ?? '';
}

const qs = (params: Record<string, string | number | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** A write that resolves `{ ok }` or throws the server's own words. */
async function write<T = { ok: true }>(p: Promise<unknown>): Promise<T> {
  const r = await p;
  if (isApiError(r)) throw new ApiRequestError(r);
  return r as T;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export type DashboardSummary = { users: number; departments: number; activeTasks: number; pendingBookings: number };

export function useDashboardSummary(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: companyKeys.summary(uid),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<DashboardSummary>('/dashboard/summary', signal));
      const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      return { users: n(r?.users), departments: n(r?.departments), activeTasks: n(r?.activeTasks), pendingBookings: n(r?.pendingBookings) };
    },
    staleTime: 2 * 60_000,
  });
}

// ── People: users and invitations (slimmed: never photos, bank details or anything long) ──
/** One login, signed up (GET /users) or invited (GET /whitelist), as these screens read it. */
export type CompanyPerson = {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
  location: string;
  /** Department id on the real server (a name in some older rows). */
  dept: string;
  employeeNumber: string;
  jobTitle: string;
  status: string;
  resigned: boolean;
};

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));

function slimPerson(raw: Record<string, unknown>): CompanyPerson {
  return {
    id: s(raw.id),
    name: s(raw.name),
    email: s(raw.email).toLowerCase(),
    role: s(raw.role) || 'employee',
    tenantId: s(raw.tenantId) || null,
    location: s(raw.location),
    dept: s(raw.departmentId) || s(raw.dept),
    employeeNumber: s(raw.employeeNumber) || s(raw.kekaCode) || s(raw.empNum),
    jobTitle: s(raw.jobTitle) || s(raw.designation),
    status: s(raw.status) || 'active',
    resigned: raw.resigned === true || raw.resigned === 'true',
  };
}

async function fetchPeople(path: '/users' | '/whitelist', signal?: AbortSignal) {
  const r = await unwrap(api.get<Record<string, unknown>[]>(path, signal));
  if (!Array.isArray(r)) throw new Error('The list could not be loaded.');
  return r.filter((u) => !!u && typeof u === 'object' && u.id != null).map(slimPerson);
}

export function useCompanyUsers(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: companyKeys.users(uid),
    enabled: enabled && !!uid,
    meta: { persist: false },
    queryFn: ({ signal }) => fetchPeople('/users', signal),
    staleTime: 5 * 60_000,
  });
}

export function useWhitelist(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: companyKeys.whitelist(uid),
    enabled: enabled && !!uid,
    meta: { persist: false },
    queryFn: ({ signal }) => fetchPeople('/whitelist', signal),
    staleTime: 5 * 60_000,
  });
}

export type CompanyDepartment = {
  id: string;
  name: string;
  mode: string;
  adminId: string;
  teamRosterEnabled: boolean;
};

export function useCompanyDepartments(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: companyKeys.departments(uid),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<Record<string, unknown>[]>('/departments', signal));
      return (Array.isArray(r) ? r : [])
        .filter((d) => !!d && d.id != null)
        .map(
          (d): CompanyDepartment => ({
            id: s(d.id),
            name: s(d.name) || 'Unnamed',
            mode: s(d.bucket) || s(d.mode),
            adminId: s(d.adminId),
            teamRosterEnabled: d.teamRosterEnabled === true,
          }),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 10 * 60_000,
  });
}

/** Re-read both lists from the server (provision checks them fresh: POST /whitelist upserts silently). */
export async function fetchFreshPeople(qc: QueryClient, uid: string) {
  const [users, whitelist] = await Promise.all([
    qc.fetchQuery({ queryKey: companyKeys.users(uid), queryFn: ({ signal }) => fetchPeople('/users', signal), staleTime: 0 }),
    qc.fetchQuery({ queryKey: companyKeys.whitelist(uid), queryFn: ({ signal }) => fetchPeople('/whitelist', signal), staleTime: 0 }),
  ]);
  return { users, whitelist };
}

export type ProvisionInput = { name: string; email: string; role: string; location: string | null; tenantId: string };

/** UserMgmt.provision (dash.html:2675): one whitelist row, the website's exact body. */
export function useProvisionUser() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (v: ProvisionInput) =>
      write<{ ok: true; entry?: Record<string, unknown> }>(
        api.post('/whitelist', {
          id: `wl${Date.now()}`,
          email: v.email.trim().toLowerCase(),
          name: v.name.trim(),
          role: v.role,
          dept: null,
          kekaCode: '',
          tenantId: v.tenantId,
          status: 'active',
          source: 'system',
          location: v.location,
        }),
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.whitelist(uid) });
      void qc.invalidateQueries({ queryKey: companyKeys.summary(uid) });
    },
  });
}

/** Edit Role (dash.html:2768): PUT /users/:id when signed up, PUT /whitelist/:wlId when invited — both when both exist. */
export function useChangeRole() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (v: { userId: string | null; whitelistId: string | null; role: string; location: string | null }) => {
      const body: Record<string, unknown> = { role: v.role, ...(v.role === 'announcement_viewer' ? { location: v.location || 'ALL_BRANCHES' } : null) };
      const done: string[] = [];
      try {
        if (v.userId) {
          await write(api.put(`/users/${encodeURIComponent(v.userId)}`, body));
          done.push('account');
        }
        if (v.whitelistId) {
          await write(api.put(`/whitelist/${encodeURIComponent(v.whitelistId)}`, body));
          done.push('invitation');
        }
      } catch (e) {
        throw new PartialError(e instanceof Error ? e.message : 'The change failed.', done);
      }
      return done;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.users(uid) });
      void qc.invalidateQueries({ queryKey: companyKeys.whitelist(uid) });
    },
  });
}

/** A two-step write that stopped part-way: `done` says which steps went through. */
export class PartialError extends Error {
  done: string[];
  constructor(message: string, done: string[]) {
    super(message);
    this.done = done;
  }
}

/** Remove (dash.html:2719): DELETE /users/:id when signed up, then DELETE /whitelist/:id for the same email. */
export function useRemoveAccess() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (v: { userId: string | null; whitelistIds: string[] }) => {
      const done: string[] = [];
      try {
        if (v.userId) {
          await write(api.del(`/users/${encodeURIComponent(v.userId)}`));
          done.push('account');
        }
        for (const id of v.whitelistIds) {
          await write(api.del(`/whitelist/${encodeURIComponent(id)}`));
          done.push('invitation');
        }
      } catch (e) {
        throw new PartialError(e instanceof Error ? e.message : 'Removing failed.', done);
      }
      return done;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.users(uid) });
      void qc.invalidateQueries({ queryKey: companyKeys.whitelist(uid) });
      void qc.invalidateQueries({ queryKey: companyKeys.summary(uid) });
    },
  });
}

// ── The company record ───────────────────────────────────────────────────────
/** GET /tenants again, now (the "Who can…" lists and other arrays are replaced whole on save). */
export async function fetchFreshTenant(qc: QueryClient, tenantId: string): Promise<Tenant | null> {
  const list = await qc.fetchQuery({
    queryKey: ['tenants'],
    queryFn: ({ signal }) => unwrap(api.get<Tenant[]>('/tenants', signal)),
    staleTime: 0,
  });
  return Array.isArray(list) ? (list.find((t) => t && t.id === tenantId) ?? null) : null;
}

/**
 * PUT /tenants/:id with just the changed keys (the server merges them). The cached company row is
 * updated at once and put back if the server says no; the More menu and every gate follow the cache.
 */
export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { tenantId: string; patch: Partial<Tenant> }) => write(api.put(`/tenants/${encodeURIComponent(v.tenantId)}`, v.patch)),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['tenants'] });
      const before = qc.getQueryData<Tenant[]>(['tenants']);
      if (Array.isArray(before)) {
        qc.setQueryData<Tenant[]>(
          ['tenants'],
          before.map((t) => (t && t.id === v.tenantId ? { ...t, ...v.patch } : t)),
        );
      }
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(['tenants'], ctx.before);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
}

export type GrantListKey = 'announcementCreators' | 'bountyCreators' | 'projectCreators' | 'auditAccess' | 'subscriptionAccess';
export type AnyGrant = TenantGrant & Partial<Pick<AuditGrant, 'permissions'>>;

// ── HR by department ─────────────────────────────────────────────────────────
export type HrModuleInfo = { id: string; label: string; group: string; desc?: string; available: boolean; granted: boolean };
export type HrDeptAccess = { id: string; name: string; adminName: string; enabled: boolean; modules: string[] };
export type HrConfigOverview = { tenant: { enabled: boolean; modules: string[] }; catalogue: HrModuleInfo[]; departments: HrDeptAccess[] };

export function useHrConfig(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: companyKeys.hrConfig(uid),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<HrConfigOverview & { ok?: boolean }>('/hr/config/overview', signal));
      return {
        tenant: { enabled: !!r?.tenant?.enabled, modules: Array.isArray(r?.tenant?.modules) ? r.tenant.modules : [] },
        catalogue: Array.isArray(r?.catalogue) ? r.catalogue : [],
        departments: Array.isArray(r?.departments) ? r.departments.map((d) => ({ ...d, modules: Array.isArray(d.modules) ? d.modules : [] })) : [],
      } satisfies HrConfigOverview;
    },
    staleTime: 60_000,
  });
}

/** HrAccessCard.set (dash.html:5381): one department, or several at once. */
export function useSetHrDepartments() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (v: { ids: string[]; enabled: boolean; modules?: string[] }) => {
      const body: Record<string, unknown> = v.ids.length > 1 ? { departmentIds: v.ids, enabled: v.enabled } : { enabled: v.enabled };
      if (v.modules !== undefined) body.modules = v.modules;
      return v.ids.length > 1
        ? write(api.put('/hr/config/departments', body))
        : write(api.put(`/hr/config/departments/${encodeURIComponent(v.ids[0] ?? '')}`, body));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.hrConfig(uid) });
      void qc.invalidateQueries({ queryKey: ['hr-me'] });
    },
  });
}

// ── Team Roster by department ────────────────────────────────────────────────
export type TeamRosterDept = {
  id: string;
  name: string;
  adminId: string;
  adminName: string;
  managerCount: number;
  teamCount: number;
  teamRosterEnabled: boolean;
};

export function useTeamRosterDepartments(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: companyKeys.teamRoster(uid),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ globalEnabled?: boolean; departments?: Partial<TeamRosterDept>[] }>('/team-roster/departments', signal));
      return {
        globalEnabled: !!r?.globalEnabled,
        departments: (Array.isArray(r?.departments) ? r.departments : []).map(
          (d): TeamRosterDept => ({
            id: s(d.id),
            name: s(d.name) || 'Unnamed',
            adminId: s(d.adminId),
            adminName: s(d.adminName),
            managerCount: Number(d.managerCount) || 0,
            teamCount: Number(d.teamCount) || 0,
            teamRosterEnabled: d.teamRosterEnabled === true,
          }),
        ),
      };
    },
    staleTime: 60_000,
  });
}

/** TeamRosterAccessCard.toggleDept (dash.html:5452): PUT /departments/:id { teamRosterEnabled }. */
export function useSetTeamRosterDept() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => write(api.put(`/departments/${encodeURIComponent(v.id)}`, { teamRosterEnabled: v.enabled })),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.teamRoster(uid) });
      void qc.invalidateQueries({ queryKey: companyKeys.departments(uid) });
    },
  });
}

// ── Activity audit ───────────────────────────────────────────────────────────
export type AuditRow = {
  id: string;
  createdAt?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  actorEmail?: string;
  affectedUserId?: string;
  affectedUserName?: string;
  affectedUserEmpId?: string;
  module?: string;
  activityType?: string;
  action?: string;
  description?: string;
  entityType?: string;
  entityId?: string | null;
  previousData?: unknown;
  newData?: unknown;
  ipAddress?: string;
  userAgent?: string;
  status?: string;
};

export type AuditFilters = {
  dateFrom?: string;
  dateTo?: string;
  module?: string;
  activityType?: string;
  action?: string;
  dept?: string;
  role?: string;
  status?: string;
  search?: string;
  userId?: string;
};

export type AuditSummary = {
  totalActivities: number;
  activitiesToday: number;
  activeUsers: number;
  bookingsActivity: number;
  serviceRequestActivity: number;
  profileChanges: number;
  reportDownloads: number;
};

export const AUDIT_PAGE_SIZE = 30;

const auditQs = (uid: string, f: AuditFilters, extra: Record<string, string | number> = {}) => qs({ performedById: uid, ...extra, ...f });

export function useAuditSummary(filters: AuditFilters, enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: [...companyKeys.audit(uid), 'summary', filters],
    enabled: enabled && !!uid,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<AuditSummary & { ok?: boolean }>(`/audit_log/summary${auditQs(uid, filters)}`, signal));
      const n = (v: unknown) => Number(v) || 0;
      return {
        totalActivities: n(r?.totalActivities),
        activitiesToday: n(r?.activitiesToday),
        activeUsers: n(r?.activeUsers),
        bookingsActivity: n(r?.bookingsActivity),
        serviceRequestActivity: n(r?.serviceRequestActivity),
        profileChanges: n(r?.profileChanges),
        reportDownloads: n(r?.reportDownloads),
      } satisfies AuditSummary;
    },
    staleTime: 30_000,
  });
}

/** The trail, page by page (the server's total is an estimate, so it scrolls on until a short page). */
export function useAuditLog(filters: AuditFilters, enabled = true) {
  const uid = useUid();
  return useInfiniteQuery({
    queryKey: [...companyKeys.audit(uid), 'list', filters],
    enabled: enabled && !!uid,
    meta: { persist: false },
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const r = await unwrap(
        api.get<{ rows?: AuditRow[]; total?: number; page?: number }>(`/audit_log${auditQs(uid, filters, { page: pageParam, pageSize: AUDIT_PAGE_SIZE })}`, signal),
      );
      const rows = Array.isArray(r?.rows) ? r.rows.filter((x) => !!x && x.id != null).map((x) => ({ ...x, id: String(x.id) })) : [];
      return { rows, total: Number(r?.total) || 0, page: pageParam };
    },
    getNextPageParam: (last) => (last.rows.length < AUDIT_PAGE_SIZE ? undefined : last.page + 1),
    staleTime: 30_000,
  });
}

export type AuditPerson = { id: string; name: string; email: string; dept: string; role: string; employeeNumber: string; jobTitle: string };

/**
 * GET /audit_log/user-search answers `ok(res, array)`, which SPREADS the array into the object
 * ({ ok: true, "0": {…}, "1": {…} }) — rebuilt here like the website's unwrapArrayResponse (dash.html:14949).
 */
export function unwrapSpreadArray<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (!r || typeof r !== 'object') return [];
  return Object.keys(r)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => (r as Record<string, T>)[k]!)
    .filter(Boolean);
}

const slimAuditPerson = (u: Record<string, unknown>): AuditPerson => ({
  id: s(u.id),
  name: s(u.name) || s(u.email),
  email: s(u.email),
  dept: s(u.deptName) || s(u.dept),
  role: s(u.role),
  employeeNumber: s(u.employeeNumber) || s(u.kekaCode),
  jobTitle: s(u.jobTitle) || s(u.jobRole),
});

export function useAuditPeopleSearch(q: string, enabled = true) {
  const uid = useUid();
  const needle = q.trim();
  return useQuery({
    queryKey: [...companyKeys.audit(uid), 'people', needle],
    enabled: enabled && !!uid && needle.length > 0,
    meta: { persist: false },
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<unknown>(`/audit_log/user-search${qs({ performedById: uid, q: needle })}`, signal));
      return unwrapSpreadArray<Record<string, unknown>>(r).map(slimAuditPerson).slice(0, 30);
    },
    staleTime: 60_000,
  });
}

export function useAuditPerson(userId: string | null) {
  const uid = useUid();
  return useQuery({
    queryKey: [...companyKeys.audit(uid), 'person', userId ?? ''],
    enabled: !!uid && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }) => {
      const r = await unwrap(
        api.get<{ user?: Record<string, unknown>; totalActivities?: number; lastActivityAt?: string | null }>(
          `/audit_log/user/${encodeURIComponent(userId ?? '')}${qs({ performedById: uid })}`,
          signal,
        ),
      );
      return {
        user: slimAuditPerson(r?.user ?? {}),
        totalActivities: Number(r?.totalActivities) || 0,
        lastActivityAt: typeof r?.lastActivityAt === 'string' ? r.lastActivityAt : null,
      };
    },
  });
}

/** POST /audit_log/export — the whole filtered set. The server records the download in the audit itself. */
export async function exportAudit(uid: string, filters: AuditFilters) {
  const r = await write<{ rows?: AuditRow[] }>(api.post('/audit_log/export', { performedById: uid, filters }));
  return Array.isArray(r?.rows) ? r.rows : [];
}

// ── Subscriptions ────────────────────────────────────────────────────────────
export type SubStatus = 'active' | 'not_using' | 'cancelled';
export type SubPeriod = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'one_time';

export type Subscription = {
  id: string;
  name: string;
  department: string;
  plan: string;
  period: SubPeriod | string;
  periodLabel: string;
  status: SubStatus | string;
  statusLabel: string;
  accountEmail: string;
  loginUrl: string;
  amountInr: number;
  amountUsd: number;
  monthlyInr: number;
  yearlyInr: number;
  renewalDate: string;
  daysToRenewal: number | null;
  payee: string;
  paymentMode: string;
  kekaCode: string;
  kekaMissing: boolean;
  owner: string;
  comments: string;
  createdByName?: string;
  updatedAt?: string;
  updatedByName?: string;
};

export type SubPayment = {
  id: string;
  subscriptionId: string;
  name: string;
  department: string;
  plan: string;
  paidOn: string;
  amountInr: number;
  amountUsd: number;
  kekaCode: string;
  kekaMissing: boolean;
  comments: string;
  source: string;
};

export type SubTotals = {
  activeCount: number;
  notUsingCount: number;
  cancelledCount: number;
  monthlyInr: number;
  yearlyInr: number;
  wastedMonthlyInr: number;
  wastedYearlyInr: number;
  kekaMissingCount: number;
  spendInRangeInr: number;
  spendInRangeUsd: number;
  paymentsInRange: number;
};

export type SubDeptRow = {
  department: string;
  activeCount: number;
  notUsingCount: number;
  monthlyInr: number;
  yearlyInr: number;
  wastedMonthlyInr: number;
  spendInRangeInr: number;
};

export type SubSummary = { totals: SubTotals; byDepartment: SubDeptRow[]; byMonth: { month: string; amountInr: number }[]; range: { from: string; to: string } };

export type SubRange = { from: string; to: string };

export function useSubscriptions(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: [...companyKeys.subs(uid), 'list'],
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ subscriptions?: Subscription[]; canManage?: boolean }>(`/subscriptions${qs({ actorId: uid })}`, signal));
      return { subscriptions: Array.isArray(r?.subscriptions) ? r.subscriptions.filter((x) => !!x && !!x.id) : [], canManage: !!r?.canManage };
    },
    staleTime: 60_000,
  });
}

export function useSubPayments(range: SubRange, enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: [...companyKeys.subs(uid), 'payments', range.from, range.to],
    enabled: enabled && !!uid,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ payments?: SubPayment[]; canManage?: boolean }>(`/subscriptions/payments${qs({ actorId: uid, from: range.from, to: range.to })}`, signal));
      return Array.isArray(r?.payments) ? r.payments.filter((p) => !!p && !!p.id) : [];
    },
    staleTime: 60_000,
  });
}

export function useSubSummary(range: SubRange, enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: [...companyKeys.subs(uid), 'summary', range.from, range.to],
    enabled: enabled && !!uid,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<SubSummary & { ok?: boolean }>(`/subscriptions/summary${qs({ actorId: uid, from: range.from, to: range.to })}`, signal));
      return {
        totals: r?.totals ?? EMPTY_TOTALS,
        byDepartment: Array.isArray(r?.byDepartment) ? r.byDepartment : [],
        byMonth: Array.isArray(r?.byMonth) ? r.byMonth : [],
        range: r?.range ?? range,
      } satisfies SubSummary;
    },
    staleTime: 60_000,
  });
}

const EMPTY_TOTALS: SubTotals = {
  activeCount: 0,
  notUsingCount: 0,
  cancelledCount: 0,
  monthlyInr: 0,
  yearlyInr: 0,
  wastedMonthlyInr: 0,
  wastedYearlyInr: 0,
  kekaMissingCount: 0,
  spendInRangeInr: 0,
  spendInRangeUsd: 0,
  paymentsInRange: 0,
};

/** What the add / edit form sends (SubscriptionForm, dash.html:11229; amounts as numbers). */
export type SubInput = {
  name: string;
  department: string;
  plan: string;
  period: string;
  status: string;
  accountEmail: string;
  loginUrl: string;
  amountInr: number;
  amountUsd: number;
  renewalDate: string;
  payee: string;
  paymentMode: string;
  kekaCode: string;
  owner: string;
  comments: string;
};

export type PaymentInput = {
  subscriptionId: string;
  name: string;
  department: string;
  plan: string;
  period: string;
  paidOn: string;
  amountInr: number;
  amountUsd: number;
  kekaCode: string;
  comments: string;
};

function useSubsWrite<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.subs(uid) });
    },
  });
}

export const useSaveSubscription = () =>
  useSubsWrite((v: { id?: string; body: SubInput }) =>
    v.id ? write<{ subscription?: Subscription }>(api.put(`/subscriptions/${encodeURIComponent(v.id)}`, v.body)) : write<{ subscription?: Subscription }>(api.post('/subscriptions', v.body)),
  );
export const useDeleteSubscription = () => useSubsWrite((id: string) => write(api.del(`/subscriptions/${encodeURIComponent(id)}`)));
export const useRecordPayment = () => useSubsWrite((body: PaymentInput) => write(api.post('/subscriptions/payments', body)));
export const useDeletePayment = () => useSubsWrite((id: string) => write(api.del(`/subscriptions/payments/${encodeURIComponent(id)}`)));
