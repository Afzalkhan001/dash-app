// The desk as one hook: the company's tickets folded with their tasks (reconcileTickets, display only),
// cut to this viewer's slice (dash.html:21155 baseItems), newest first, plus who approves equipment
// (the IT & Admin department's admin) and who can be assigned. Used by the desk list, the ticket screen
// and Raise for someone's "Raised by you".

import { type DeskTicket, reconcileTickets, useDeskDepartments, useDeskTickets, useTicketTasks } from '@/api/servicedesk';
import { useSession } from '@/auth/session';
import { baseItems, deskSlice, isDeptApprover } from '@/features/servicedesk/access';
import { findItDept, whenOf } from '@/features/servicedesk/format';
import { usePickablePeople } from '@/features/shared/person-picker';

const newestFirst = (a: DeskTicket, b: DeskTicket) => {
  const ka = whenOf(a);
  const kb = whenOf(b);
  if (ka !== kb) return ka < kb ? 1 : -1;
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
};

export function useDesk({ enabled, people = false }: { enabled: boolean; people?: boolean }) {
  const user = useSession((s) => s.user);
  const role = user?.role;
  const slice = deskSlice(role);
  // Who approves equipment: needed by every slice that sees equipment (only IT Admin / Admin / App
  // Manager can be the approver; Super Admin and CEO/COO see "Waiting for approval by …").
  const needApprover = enabled && slice !== 'hr';
  const tickets = useDeskTickets(enabled);
  const tasks = useTicketTasks(enabled);
  const depts = useDeskDepartments(needApprover || (enabled && people));
  // GET /users (slimmed, with the raw department for the IT-team rule): the approver's name and the
  // people who can be assigned.
  const users = usePickablePeople({ enabled: enabled && (people || needApprover), keep: ['dept'] });

  const itDept = findItDept(depts.data);
  // undefined while the departments are loading: nobody may approve until we know who does.
  const approverId = depts.data ? itDept?.adminId || null : undefined;
  const approver = isDeptApprover(role, user?.id, approverId);
  const approverName = approverId ? (users.data ?? []).find((p) => p.id === approverId)?.name || '' : '';

  const all = reconcileTickets(tickets.data ?? [], tasks.data);
  const items = baseItems(all, slice, approver).sort(newestFirst);

  return {
    role,
    slice,
    items,
    all,
    tickets,
    tasks,
    users,
    itDept,
    approver,
    approverName,
    /** Still finding out who approves (the action buttons wait). */
    approverLoading: needApprover && depts.isLoading,
    refetch: () => Promise.all([tickets.refetch(), tasks.refetch(), needApprover ? depts.refetch() : null]),
  };
}

export type Desk = ReturnType<typeof useDesk>;
