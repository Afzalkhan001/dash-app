// Submit and cancel a leave / WFH / comp-off request. Both refresh the request list and every cached
// balance year (['leave-balances'] is shared with Home) plus the Attendance calendar's copy of the
// requests (['att-leave-mine'], src/api/attendance.ts), with a success/error haptic like the clock
// (the kit's fire-and-forget `haptic`, which never throws).

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { unwrap } from '@/api/client';
import { cancelLeaveRequest, createLeaveRequest, type NewLeaveRequest } from '@/api/leave';
import { haptic } from '@/ui';

function useRefreshLeave() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['leave-requests'] });
    void qc.invalidateQueries({ queryKey: ['leave-balances'] });
    void qc.invalidateQueries({ queryKey: ['att-leave-mine'] });
  };
}

export function useSubmitLeave() {
  const refresh = useRefreshLeave();
  return useMutation({
    mutationFn: async (body: NewLeaveRequest) => (await unwrap(createLeaveRequest(body))).request,
    onSuccess: () => {
      haptic.success();
      refresh();
    },
    onError: () => {
      haptic.error();
    },
  });
}

export function useCancelLeave() {
  const refresh = useRefreshLeave();
  return useMutation({
    mutationFn: async (id: string) => (await unwrap(cancelLeaveRequest(id))).request,
    onSuccess: () => {
      haptic.success();
      refresh();
    },
    onError: () => {
      haptic.error();
    },
  });
}
