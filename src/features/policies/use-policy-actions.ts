// Acknowledge a policy, plus the "needs my acknowledgement" count for badges elsewhere (More, Home).
// Acknowledging sends the version that was on screen; if HR published a newer version meanwhile the
// server refuses (409) and — like the website's PolicyView — we reload so the latest text shows.
// One haptic per action (docs/DESIGN.md §7.24): success when it lands, error when it fails.

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { unwrap } from '@/api/client';
import { acknowledgePolicy, needsAck, usePolicies } from '@/api/policies';
import { useAccess } from '@/lib/use-access';
import { haptic } from '@/ui';

export function useAcknowledgePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => unwrap(acknowledgePolicy(id, version)),
    onSuccess: async () => {
      haptic.success();
      await qc.invalidateQueries({ queryKey: ['policies'] });
    },
    onError: () => {
      haptic.error();
      void qc.invalidateQueries({ queryKey: ['policies'] });
    },
  });
}

// How many published policies are waiting for my acknowledgement (0 when Policies is off).
export function usePolicyPendingCount() {
  const { sections } = useAccess();
  const q = usePolicies(sections.policies);
  if (!sections.policies || !Array.isArray(q.data)) return 0;
  return q.data.filter((p) => !!p && needsAck(p)).length;
}
