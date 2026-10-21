// Servicedesk domain — the Inbox kind "Service desk" (key 'desk-it', PLAN §2.5): what is waiting on the
// signed-in person at the desk (team-ops.md §5.4, features/servicedesk/access needsMe):
//   IT Admin                unassigned tickets to accept and assign, equipment to approve (if approver)
//   Admin / App Manager     equipment to approve, when they are the IT & Admin department's admin
//   Super Admin             open office requests and complaints
//   HR                      open Behaviour & Work complaints
// CEO/COO have a read-only desk and nothing here. A row opens /inbox/desk-it/<id>: the desk's own
// ticket screen (features/servicedesk/ticket-detail).

import { Headset } from 'lucide-react-native';

import { type DeskTicket, useDeskDepartments, useDeskTickets } from '@/api/servicedesk';
import { ago } from '@/features/inbox/format';
import { type Decision, defineInboxKind, type InboxKindPlugin } from '@/features/plugin-types';
import { baseItems, deskSlice, isAdminRole, isDeptApprover, needsMe, rowAction } from '@/features/servicedesk/access';
import { findItDept, kindLabel, raiserOf, whatOf, whenOf } from '@/features/servicedesk/format';
import { InboxTicketDetail } from '@/features/servicedesk/ticket-detail';

const QUEUE_ROLES = ['it_admin', 'admin', 'app_manager', 'super_admin', 'hr'];

type Row = DeskTicket & { _action: string };

const NEXT: Record<string, string> = { approve: 'To approve', accept: 'To assign', status: 'To answer' };

export const inboxKinds: InboxKindPlugin[] = [
  defineInboxKind<Row>({
    key: 'desk-it',
    label: 'Service desk',
    title: 'Service desk',
    module: 'support',
    icon: Headset,
    useItems: (access) => {
      const user = access.user;
      const role = user?.role;
      const on = !!user && QUEUE_ROLES.includes(String(role)) && access.web('servicedesk');
      const needApprover = on && (role === 'it_admin' || isAdminRole(role));
      const tickets = useDeskTickets(on);
      const depts = useDeskDepartments(needApprover);
      const approverId = needApprover ? (depts.data ? findItDept(depts.data)?.adminId || null : undefined) : null;
      const approver = isDeptApprover(role, user?.id, approverId);
      const rows = tickets.data ?? [];
      const mine = baseItems(rows, deskSlice(role), approver).filter((t) => needsMe(t, role, approver));
      // What this person decided, from the same list ("Done today").
      const me = user?.name || '';
      const decided = me
        ? rows.flatMap((t): { id: string; at: string; decision: Decision }[] => {
            if (t.status === 'rejected' && t.rejectedAt && (t.rejectedById === user?.id || t.rejectedBy === me)) return [{ id: t.id, at: t.rejectedAt, decision: 'reject' }];
            if (t.approvedAt && t.approvedBy === me) return [{ id: t.id, at: t.approvedAt, decision: 'approve' }];
            if (t.statusUpdatedAt && t.statusUpdatedBy === me && t.status !== 'rejected') return [{ id: t.id, at: t.statusUpdatedAt, decision: 'approve' }];
            return [];
          })
        : [];
      return {
        visible: on,
        items: mine.map((t) => ({ id: t.id, at: whenOf(t), who: raiserOf(t), record: { ...t, _action: rowAction(t, role, approver) } })),
        pending: tickets.data ? mine.length : null,
        error: tickets.isError && !tickets.data,
        discovering: on && (tickets.isLoading || (needApprover && depts.isLoading)),
        decided,
      };
    },
    row: (item, { now }) => ({
      title: item.who,
      subtitle: `${whatOf(item.record)} · ${kindLabel(item.record)}`,
      meta: NEXT[item.record._action] ?? undefined,
      age: ago(item.at, now),
    }),
    Detail: InboxTicketDetail,
  }),
];
