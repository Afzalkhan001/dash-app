// The platform owner's console (master_admin): every company on DASH, each company's coin wallet and
// its feature switches. Every route below already exists on the server:
//
//   GET    /tenants                               routes/tenants.js:30   master_admin: every company
//   POST   /tenants                               routes/tenants.js:31   { name*, maxUsers, superAdmin, superAdminName, address, tax, bountyEnabled }
//                                                                        → { ok, tenant } — NO role check on the server: the app offers it to master_admin only
//   PUT    /tenants/:id                           routes/tenants.js:53   shallow merge; featureFlags deep-merged and kept only from master_admin
//   GET    /users                                 routes/users.js:108    master_admin: everyone (counts per company; avatars stripped)
//   GET    /whitelist                             routes/whitelist.js:17 master_admin: every invitation
//   POST   /whitelist                             routes/whitelist.js:87 UPSERTS BY EMAIL (can change an existing person's role) and
//                                                                        sends the welcome email — the app checks both lists first
//   GET    /hr/admin/tenants/:tenantId/access     hr.js:486              master only: { ok, enabled, modules, catalogue }
//   PUT    /hr/admin/tenants/:tenantId/access     hr.js:494              master only: { enabled, modules? } → { ok, enabled, modules }
//   GET    /bounty/wallet/company?tenantId=       server.js:5032         { id, tenantId, name, totalAdded, totalDistributed, available }
//   POST   /bounty/company/add-coins              server.js:5044         master only: { tenantId, amount (whole, > 0), reason } — credits real coins
//   GET    /bounty_transactions?type=COMPANY_CREDIT[&tenantId=]  server.js:5506  bare array, newest first
//   POST   /bounty_transactions/:id/reverse       server.js:5241         COMPANY_CREDIT: master only; refused once any coin was used
//
// Not here on purpose (web only): DELETE /tenants/:id (a ~20-table cascade with no role check on the
// server), DELETE /tenants/:id/data, "Reset Super Admin Password" (no API), Overrides (no screen), the
// wallet Excel/PDF reports. People lists stay off the phone's disk (meta: { persist: false }).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiRequestError, isApiError, unwrap } from '@/api/client';
import type { Tenant } from '@/api/me';
import { useSession } from '@/auth/session';

// ── Keys ─────────────────────────────────────────────────────────────────────
export const platformKeys = {
  all: ['platform'] as const,
  users: (uid: string) => ['platform', 'users', uid] as const,
  whitelist: (uid: string) => ['platform', 'whitelist', uid] as const,
  hr: (tenantId: string) => ['platform', 'hr', tenantId] as const,
  wallet: (tenantId: string) => ['platform', 'wallet', tenantId] as const,
  credits: (tenantId: string) => ['platform', 'credits', tenantId || 'all'] as const,
};

function useUid() {
  return useSession((s) => s.user?.id) ?? '';
}
function useIsMaster() {
  return useSession((s) => s.user?.role) === 'master_admin';
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** A write that resolves its answer or throws the server's own words. */
async function write<T = { ok: true }>(p: Promise<unknown>): Promise<T> {
  const r = await p;
  if (isApiError(r)) throw new ApiRequestError(r);
  return r as T;
}

// ── Companies ────────────────────────────────────────────────────────────────
/** The company fields this console reads and edits (the rest of the record is never sent back). */
export type CompanyEdit = { name: string; superAdmin: string; address: string; tax: string; maxUsers: number; status: 'active' | 'suspended' };

export const companyName = (t: Tenant | null | undefined) => str(t?.name) || 'Unnamed company';
export const companyEmail = (t: Tenant | null | undefined) => str(t?.superAdmin).toLowerCase();
/** The website's logo initials (MasterAdmin initials, dash.html:2393): first letters of the first two words. */
export const companyInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';
export const companyStatus = (t: Tenant | null | undefined): 'active' | 'suspended' => (str(t?.status) === 'suspended' ? 'suspended' : 'active');

/** One login (GET /users) or invitation (GET /whitelist), slimmed: who, which company, which role. */
export type PlatformPerson = { id: string; name: string; email: string; role: string; tenantId: string };

async function fetchPeople(path: '/users' | '/whitelist', signal?: AbortSignal): Promise<PlatformPerson[]> {
  const r = await unwrap(api.get<Record<string, unknown>[]>(path, signal));
  if (!Array.isArray(r)) throw new Error('The list could not be loaded.');
  return r
    .filter((u) => !!u && typeof u === 'object' && u.id != null)
    .map((u) => ({ id: str(u.id), name: str(u.name), email: str(u.email).toLowerCase(), role: str(u.role) || 'employee', tenantId: str(u.tenantId) }));
}

/** Everyone on DASH (master_admin's GET /users): the real head count per company (`tenant.users` is never kept up to date). */
export function usePlatformUsers(enabled = true) {
  const uid = useUid();
  const master = useIsMaster();
  return useQuery({
    queryKey: platformKeys.users(uid),
    enabled: enabled && master && !!uid,
    meta: { persist: false },
    queryFn: ({ signal }) => fetchPeople('/users', signal),
    staleTime: 5 * 60_000,
  });
}

/** Every invitation on DASH (master_admin's GET /whitelist). */
export function usePlatformWhitelist(enabled = true) {
  const uid = useUid();
  const master = useIsMaster();
  return useQuery({
    queryKey: platformKeys.whitelist(uid),
    enabled: enabled && master && !!uid,
    meta: { persist: false },
    queryFn: ({ signal }) => fetchPeople('/whitelist', signal),
    staleTime: 5 * 60_000,
  });
}

/** People per company id (signed-up logins; master_admin rows have no company and are left out). */
export function countByCompany(people: PlatformPerson[] | undefined) {
  const out = new Map<string, number>();
  for (const p of people ?? []) if (p.tenantId && p.role !== 'master_admin') out.set(p.tenantId, (out.get(p.tenantId) ?? 0) + 1);
  return out;
}

/**
 * Where an email already is on DASH (a login, or an invitation), so registering a company never
 * overwrites someone: POST /whitelist upserts by email and would move that person into the new company.
 */
export function findEmail(email: string, users: PlatformPerson[] | undefined, invites: PlatformPerson[] | undefined) {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const u = (users ?? []).find((x) => x.email === e);
  if (u) return { kind: 'user' as const, person: u };
  const w = (invites ?? []).find((x) => x.email === e);
  return w ? { kind: 'invite' as const, person: w } : null;
}

export type RegisterInput = { name: string; maxUsers: number; superAdminName: string; superAdmin: string; tax: string; address: string; bountyEnabled: boolean };
/** What registering did: the company is made first; the invite can still fail on its own. */
export type RegisterResult = { tenant: Tenant; inviteError: string | null };

/**
 * Register a company (MasterAdmin addTenant, dash.html:2395): POST /tenants, then invite its Super Admin
 * with POST /whitelist (role super_admin, the new company's id — the server sends the welcome email).
 * Run in order; when the invite fails the company stays registered and the result says so.
 */
export function useRegisterCompany() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (v: RegisterInput): Promise<RegisterResult> => {
      const email = v.superAdmin.trim().toLowerCase();
      const r = await write<{ ok: true; tenant?: Tenant; id?: string }>(
        api.post('/tenants', {
          id: `t${Date.now()}`,
          name: v.name.trim(),
          logo: companyInitials(v.name),
          maxUsers: v.maxUsers,
          status: 'active',
          superAdmin: email,
          superAdminName: v.superAdminName.trim(),
          address: v.address.trim(),
          tax: v.tax.trim(),
          bountyEnabled: v.bountyEnabled,
        }),
      );
      const tenant: Tenant = r?.tenant && typeof r.tenant.id === 'string' ? r.tenant : { id: str(r?.id), name: v.name.trim() };
      if (!tenant.id) throw new Error('The company was saved but the server did not say its id. Pull to refresh the list.');
      let inviteError: string | null = null;
      try {
        await write(inviteBody(tenant.id, email, v.superAdminName));
      } catch (e) {
        inviteError = e instanceof Error ? e.message : 'The invite could not be sent.';
      }
      return { tenant, inviteError };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tenants'] });
      void qc.invalidateQueries({ queryKey: platformKeys.whitelist(uid) });
    },
  });
}

function inviteBody(tenantId: string, email: string, name: string) {
  const e = email.trim().toLowerCase();
  return api.post('/whitelist', {
    id: `wl${Date.now()}`,
    email: e,
    name: name.trim() || e.split('@')[0],
    role: 'super_admin',
    dept: null,
    kekaCode: '',
    tenantId,
    status: 'active',
    source: 'system',
  });
}

/** Send a company's Super Admin the sign-up invite again (after it failed when the company was registered). */
export function useInviteSuperAdmin() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (v: { tenantId: string; email: string; name: string }) => write(inviteBody(v.tenantId, v.email, v.name)),
    onSettled: () => void qc.invalidateQueries({ queryKey: platformKeys.whitelist(uid) }),
  });
}

/**
 * PUT /tenants/:id with just the changed keys (the server merges them; arrays and other fields are left
 * alone). The cached list changes at once and is put back if the server says no.
 */
export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { tenantId: string; patch: Partial<Tenant> }) => write(api.put(`/tenants/${encodeURIComponent(v.tenantId)}`, v.patch)),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['tenants'] });
      const before = qc.getQueryData<Tenant[]>(['tenants']);
      if (Array.isArray(before)) {
        qc.setQueryData<Tenant[]>(
          ['tenants'],
          before.map((t) => {
            if (!t || t.id !== v.tenantId) return t;
            const { featureFlags, ...rest } = v.patch;
            return { ...t, ...rest, ...(featureFlags ? { featureFlags: { ...(t.featureFlags ?? {}), ...featureFlags } } : null) };
          }),
        );
      }
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(['tenants'], ctx.before);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['tenants'] }),
  });
}

// ── HR for a whole company ───────────────────────────────────────────────────
export type HrModule = { id: string; label: string; group: string; desc: string; available: boolean };
export type HrTenantAccess = { enabled: boolean; modules: string[]; catalogue: HrModule[] };

export function useHrTenantAccess(tenantId: string | null | undefined) {
  const master = useIsMaster();
  const id = tenantId ?? '';
  return useQuery({
    queryKey: platformKeys.hr(id),
    enabled: master && !!id,
    queryFn: async ({ signal }): Promise<HrTenantAccess> => {
      const r = await unwrap(api.get<Record<string, unknown>>(`/hr/admin/tenants/${encodeURIComponent(id)}/access`, signal));
      const cat = Array.isArray(r?.catalogue) ? (r.catalogue as Record<string, unknown>[]) : [];
      return {
        enabled: r?.enabled === true,
        modules: Array.isArray(r?.modules) ? (r.modules as unknown[]).map(str).filter(Boolean) : [],
        catalogue: cat
          .filter((m) => !!m && typeof m === 'object' && m.id)
          .map((m) => ({ id: str(m.id), label: str(m.label) || str(m.id), group: str(m.group) || 'Other', desc: str(m.desc), available: m.available !== false })),
      };
    },
    staleTime: 2 * 60_000,
  });
}

/** PUT /hr/admin/tenants/:id/access. `modules` left out keeps the current list (or Attendance when switching on from none). */
export function useSetHrTenantAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { tenantId: string; enabled: boolean; modules?: string[] }) => {
      const body = v.modules === undefined ? { enabled: v.enabled } : { enabled: v.enabled, modules: v.modules };
      return write<{ ok: true; enabled: boolean; modules: string[] }>(api.put(`/hr/admin/tenants/${encodeURIComponent(v.tenantId)}/access`, body));
    },
    onSuccess: (r, v) => {
      qc.setQueryData<HrTenantAccess>(platformKeys.hr(v.tenantId), (old) =>
        old ? { ...old, enabled: r?.enabled === true, modules: Array.isArray(r?.modules) ? r.modules.map(str) : old.modules } : old,
      );
    },
    onSettled: (_r, _e, v) => void qc.invalidateQueries({ queryKey: platformKeys.hr(v.tenantId) }),
  });
}

// ── Company wallets ──────────────────────────────────────────────────────────
export type CompanyWallet = { id: string; tenantId: string; name: string; totalAdded: number; totalDistributed: number; available: number };

export function useCompanyWallet(tenantId: string | null | undefined) {
  const master = useIsMaster();
  const id = tenantId ?? '';
  return useQuery({
    queryKey: platformKeys.wallet(id),
    enabled: master && !!id,
    queryFn: async ({ signal }): Promise<CompanyWallet> => {
      const r = await unwrap(api.get<Record<string, unknown>>(`/bounty/wallet/company?tenantId=${encodeURIComponent(id)}`, signal));
      return {
        id: str(r?.id) || `company_${id}`,
        tenantId: str(r?.tenantId) || id,
        name: str(r?.name),
        totalAdded: num(r?.totalAdded),
        totalDistributed: num(r?.totalDistributed),
        available: num(r?.available),
      };
    },
    staleTime: 60_000,
  });
}

/** One COMPANY_CREDIT row of the coin ledger. */
export type CompanyCredit = {
  id: string;
  tenantId: string;
  createdAt: string;
  amount: number;
  performedBy: string;
  reason: string;
  toWalletName: string;
  reversedAt: string;
  reversedBy: string;
};

/** Company credits, newest first: one company's, or every company's (`tenantId` empty). */
export function useCompanyCredits(tenantId: string | null | undefined, enabled = true) {
  const master = useIsMaster();
  const id = tenantId ?? '';
  return useQuery({
    queryKey: platformKeys.credits(id),
    enabled: enabled && master,
    queryFn: async ({ signal }): Promise<CompanyCredit[]> => {
      const q = id ? `&tenantId=${encodeURIComponent(id)}` : '';
      const r = await unwrap(api.get<Record<string, unknown>[]>(`/bounty_transactions?type=COMPANY_CREDIT${q}`, signal));
      if (!Array.isArray(r)) throw new Error('The credits could not be loaded.');
      return r
        .filter((t) => !!t && typeof t === 'object' && t.id && t.type === 'COMPANY_CREDIT')
        .map((t) => ({
          id: str(t.id),
          tenantId: str(t.tenantId),
          createdAt: str(t.createdAt),
          amount: num(t.amount),
          performedBy: str(t.performedBy),
          reason: str(t.reason),
          toWalletName: str(t.toWalletName),
          reversedAt: str(t.reversedAt),
          reversedBy: str(t.reversedBy),
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    staleTime: 60_000,
  });
}

function useRefreshWallet() {
  const qc = useQueryClient();
  return (tenantId: string) => {
    void qc.invalidateQueries({ queryKey: platformKeys.wallet(tenantId) });
    void qc.invalidateQueries({ queryKey: ['platform', 'credits'] });
  };
}

/** POST /bounty/company/add-coins — real coins into that company's wallet (whole coins only). */
export function useAddCompanyCoins() {
  const refresh = useRefreshWallet();
  return useMutation({
    mutationFn: (v: { tenantId: string; amount: number; reason: string }) =>
      write<{ ok: true; transaction?: Record<string, unknown> }>(api.post('/bounty/company/add-coins', { tenantId: v.tenantId, amount: Math.round(v.amount), reason: v.reason.trim() })),
    onSettled: (_r, _e, v) => refresh(v.tenantId),
  });
}

/** POST /bounty_transactions/:id/reverse — takes an unused credit back (the server refuses once any of it was used). */
export function useCancelCompanyCredit() {
  const refresh = useRefreshWallet();
  return useMutation({
    mutationFn: (v: { id: string; tenantId: string; reason?: string }) =>
      write(api.post(`/bounty_transactions/${encodeURIComponent(v.id)}/reverse`, { reason: (v.reason ?? '').trim() || 'Cancelled by Master Admin' })),
    onSettled: (_r, _e, v) => refresh(v.tenantId),
  });
}
