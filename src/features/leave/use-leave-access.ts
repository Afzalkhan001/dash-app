// Which leave requests this person can make, decided exactly like the web:
//   - the request kinds come from the HR modules (LeaveRequestForm, dash.html:4842);
//   - the whole personal area hides for system roles (LeavePanel 4951: they set leave up, they do not
//     request it — and Leave setup is website-only), via useAccess().sections.leave + isSystemRole.
// The server re-checks every request; this only decides what is shown.

import type { LeaveKind } from '@/api/leave';
import { useHrMe } from '@/api/me';
import { hrHas } from '@/lib/access';
import { useAccess } from '@/lib/use-access';

const ALL_KINDS: LeaveKind[] = ['leave', 'wfh', 'comp_off'];

export function useLeaveAccess() {
  const a = useAccess();
  const hrQ = useHrMe();
  const kinds = ALL_KINDS.filter((k) => hrHas(a.hr, k));
  return {
    hr: a.hr,
    kinds,
    hasLeave: kinds.includes('leave'),
    hasWfh: kinds.includes('wfh'),
    hasCompOff: kinds.includes('comp_off'),
    // The personal "My leave" area (balances, requests, apply).
    enabled: a.sections.leave && !a.isSystemRole && kinds.length > 0,
    // A system role that is an HR admin: on the web it only gets Leave setup, which the app leaves to the website.
    managesOnly: a.sections.leave && a.isSystemRole,
    // Approves other people's leave / WFH / comp-off (those queues live in Inbox).
    reviews: (Array.isArray(a.approvals) ? a.approvals : []).some((k) => k?.key === 'leave' || k?.key === 'wfh' || k?.key === 'comp_off'),
    loading: hrQ.isLoading,
    error: !hrQ.data && hrQ.isError ? hrQ.error : null,
    refetch: hrQ.refetch,
  };
}
