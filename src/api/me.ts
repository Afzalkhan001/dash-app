// "Who am I" — the server has no /me route, so the app combines:
//   GET /users/:id  → full profile (role, dept, reporting manager, …)
//   GET /hr/me      → HR modules this person can use and approve (hr.js:451)
//   GET /tenants    → company feature switches (featureFlags, bountyEnabled, orgEnabled, …)

import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { type StaffUser, useSession } from '@/auth/session';

export type HrMe = {
  enabled: boolean;
  modules: string[];
  canConfigure: boolean;
  isHrAdmin: boolean;
  adminsDepts: string[];
  approverModules: string[];
};

/**
 * A named grant on the company record (Config "Who can…" lists). The website matches a person by
 * `userId`, else by employee number, else by exact name (case-insensitive) — see lib/access grantMatches.
 */
export type TenantGrant = { name?: string; empNo?: string; userId?: string };

/** User Activity Audit access (Config → User Activity Audit). Default permissions on the web: view, search, detail on; download off. */
export type AuditGrant = TenantGrant & {
  permissions?: { viewLogs?: boolean; searchUsers?: boolean; viewDetail?: boolean; downloadReports?: boolean };
};

/** A bookable professional category (Config → Professional Categories; dash.html PROF_TYPE_DEFAULTS:1703). */
export type ProfType = { id: string; label: string; dayStart?: string; dayEnd?: string; gapMinutes?: number; active?: boolean };

// The company record (GET /tenants, routes/tenants.js:30). Every array below is REPLACED WHOLE on
// PUT /tenants/:id — re-read just before saving and always send the full new list.
export type Tenant = {
  id: string;
  name?: string;
  status?: string;
  address?: string;
  phone?: string;
  logoText?: string;
  maxUsers?: number;
  featureFlags?: Record<string, boolean>;
  bountyEnabled?: boolean;
  orgEnabled?: boolean;
  /** Team Roster on for the company; each department also needs its own `teamRosterEnabled` (GET /departments). */
  teamRosterEnabled?: boolean;
  appManagerBountyApprovalsOn?: boolean;
  bountyMonthlyEarnCap?: number | null;
  birthdayAutoOn?: boolean;
  anniversaryAutoOn?: boolean;
  /** Config "Who can…" lists (matched by lib/access grantMatches). */
  announcementCreators?: TenantGrant[];
  bountyCreators?: TenantGrant[];
  projectCreators?: TenantGrant[];
  subscriptionAccess?: TenantGrant[];
  auditAccess?: AuditGrant[];
  profTypes?: ProfType[];
  visitorApprovalTimeoutMin?: number;
  visitorPhotoRetentionDays?: number;
  [k: string]: unknown;
};

export const EMPTY_HR: HrMe = { enabled: false, modules: [], canConfigure: false, isHrAdmin: false, adminsDepts: [], approverModules: [] };

export function useHrMe() {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['hr-me', userId],
    enabled: !!userId,
    queryFn: async ({ signal }) => ({ ...EMPTY_HR, ...(await unwrap(api.get<HrMe>('/hr/me', signal))) }),
    staleTime: 5 * 60_000,
  });
}

export function useMyProfile() {
  const userId = useSession((s) => s.user?.id);
  const updateUser = useSession((s) => s.updateUser);
  return useQuery({
    queryKey: ['user', userId],
    enabled: !!userId,
    meta: { persist: false }, // the full record carries the photo (~0.5 MB) — keep it off disk
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ ok: true; user: StaffUser }>(`/users/${userId}`, signal));
      if (r.user) void updateUser(r.user); // keep the stored identity (role, name) current
      return r.user;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Every company on DASH — the platform owner's (master_admin) view of GET /tenants. Same request and
 * cache entry as useMyTenant (which picks the person's own row out of it); only fetched for master_admin,
 * since everyone else's answer is their own company alone.
 */
export function useAllTenants() {
  const role = useSession((s) => s.user?.role);
  return useQuery({
    queryKey: ['tenants'],
    enabled: role === 'master_admin',
    queryFn: ({ signal }) => unwrap(api.get<Tenant[]>('/tenants', signal)),
    select: (list) => (Array.isArray(list) ? list.filter((t) => !!t && typeof t === 'object' && typeof t.id === 'string') : []),
    staleTime: 10 * 60_000,
  });
}

export function useMyTenant() {
  const tenantId = useSession((s) => s.user?.tenantId);
  return useQuery({
    queryKey: ['tenants'],
    enabled: !!tenantId,
    queryFn: ({ signal }) => unwrap(api.get<Tenant[]>('/tenants', signal)),
    select: (list) => (Array.isArray(list) ? list.find((t) => t.id === tenantId) ?? null : null),
    staleTime: 10 * 60_000,
  });
}
