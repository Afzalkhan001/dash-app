// Pay mutations: request / cancel a salary advance, cancel a pending HR claim. Each one refreshes
// the list it changed before it settles, so the screen never shows the old state after success.
// One haptic per action (docs/DESIGN.md §7.24): success when it lands, error when it fails.

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { unwrap } from '@/api/client';
import { cancelClaim, cancelLoan, type LoanRequest, requestLoan } from '@/api/pay';
import { haptic } from '@/ui';

export function useRequestLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: LoanRequest) => (await unwrap(requestLoan(body))).loan,
    onSuccess: async () => {
      haptic.success();
      await qc.invalidateQueries({ queryKey: ['pay', 'loans'] });
    },
    onError: haptic.error,
  });
}

export function useCancelLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await unwrap(cancelLoan(id))).loan,
    onSuccess: async () => {
      haptic.success();
      await qc.invalidateQueries({ queryKey: ['pay', 'loans'] });
    },
    onError: haptic.error,
  });
}

export function useCancelClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await unwrap(cancelClaim(id))).claim,
    onSuccess: async () => {
      haptic.success();
      await qc.invalidateQueries({ queryKey: ['pay', 'claims'] });
    },
    onError: haptic.error,
  });
}
