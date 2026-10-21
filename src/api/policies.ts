// HR policies with employee acknowledgement (hr_policies.js):
//   GET  /hr/policies                  ~L79   published policies meant for me, each with my acked_at
//   GET  /hr/policies/:id              ~L95   the full text (`body`, PLAIN TEXT) + my acked_at
//   POST /hr/policies/:id/acknowledge  ~L150  { version } — must be the version that was displayed;
//                                             a newer version is refused with 409 ("updated since…")
// Policies carry no file attachment in this version; `link_url` (https only) points at a full
// document elsewhere and is opened in the browser, as the website does.

import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

export type PolicyStatus = 'draft' | 'published' | 'archived';

export type PolicySummary = {
  id: string;
  title: string;
  category: string;
  version: number;
  requires_ack: boolean;
  status: PolicyStatus;
  audience: string[];
  published_at: string | null;
  updated_at: string;
  link_url: string;
  acked_at: string | null; // my acknowledgement of THIS version
};

export type Policy = PolicySummary & { body: string };

export type AckResult = { ok: true; acked_at?: string; version?: number; already?: boolean };

export function usePolicies(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['policies', 'list', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ policies: PolicySummary[] }>('/hr/policies', signal))).policies ?? [],
  });
}

export function usePolicy(id: string | undefined, enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['policies', 'detail', userId, id],
    enabled: enabled && !!userId && !!id,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ policy: Policy }>(`/hr/policies/${encodeURIComponent(id!)}`, signal))).policy,
  });
}

export const acknowledgePolicy = (id: string, version: number) =>
  api.post<AckResult>(`/hr/policies/${encodeURIComponent(id)}/acknowledge`, { version });

// Same rule as the website (PoliciesPanel): needs me = requires_ack and not yet acknowledged.
export const needsAck = (p: Pick<PolicySummary, 'requires_ack' | 'acked_at'>) => p.requires_ack && !p.acked_at;
