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

export type Tenant = {
  id: string;
  name?: string;
  featureFlags?: Record<string, boolean>;
  bountyEnabled?: boolean;
  orgEnabled?: boolean;
  teamRosterEnabled?: boolean;
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
