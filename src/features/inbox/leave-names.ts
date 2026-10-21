// Leave type names by code ('CL' → 'Casual Leave'), so an approver reads "12 – 14 Oct · Casual Leave"
// instead of a bare code. The names come from the leave types (GET /hr/leave/types — the same query
// and key Apply leave uses), and, for any code still missing, the balances Me › Leave loaded
// (['leave-balances', userId] — each balance carries its type's code and name).
//
// The types are fetched only for someone who reviews leave and has the leave module themselves (the
// server's gate('leave') for that read is exactly hr/me's `modules`), so no request the server would
// refuse is ever sent; anyone else reads whatever is already cached. The read is cached for 10 minutes
// and shared with Apply leave. Unknown codes read as plain "Leave" (leaveTypeLabel), never as a code.

import { useLeaveBalances } from '@/api/hr';
import { useLeaveTypes } from '@/api/leave';
import type { LeaveNames } from '@/features/inbox/format';
import { hrHas } from '@/lib/access';
import { useAccess } from '@/lib/use-access';

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function useLeaveNames(): LeaveNames {
  const access = useAccess();
  const approvals = Array.isArray(access.approvals) ? access.approvals : [];
  const reviewsLeave = approvals.some((k) => !!k && k.key === 'leave');
  const typesQ = useLeaveTypes(reviewsLeave && hrHas(access.hr, 'leave'));
  // Cache only: the balances are Me › Leave's own read.
  const balancesQ = useLeaveBalances(false);
  const types = Array.isArray(typesQ.data?.types) ? typesQ.data.types : [];
  const balances = Array.isArray(balancesQ.data?.balances) ? balancesQ.data.balances : [];
  const names = new Map<string, string>();
  for (const t of [...types, ...balances]) {
    if (!t || typeof t !== 'object') continue;
    const code = text(t.code);
    const name = text(t.name);
    if (code && name && !names.has(code)) names.set(code, name);
  }
  return names;
}
