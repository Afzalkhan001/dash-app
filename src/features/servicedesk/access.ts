// Servicedesk domain — the gates, ported line for line from the website's ServiceDesk
// (dash.html:21036–21410) and ITTaskOnBehalf (dash.html:6842–6987). Pure functions: no hooks, no
// clock. Every write route behind these (routes/tickets.js) re-checks the role, but the website's
// rules are copied exactly anyway, because POST /tasks (the "assign" half) has no role check at all.
//
// Who opens the desk at all is the website's sidebar: access.web('servicedesk') (navForRaw
// dash.html:1508–1532 + the `servicedesk` company switch, dash.html:1387). "Raise for someone" is the
// IT Admin's `tasks` item, which renders ITTaskOnBehalf (dash.html:6988).

import type { Ticket } from '@/api/support';

type Role = string | null | undefined;

/**
 * Which slice of the company's tickets a role sees (dash.html:21129–21163 `baseItems`):
 *   super  Super Admin: everything (tabs All / Tickets / Asset Requests / Admin Requests / Complaints)
 *   hr     HR: only "Behaviour & Work" complaints (one tab)
 *   admin  Admin and App Manager: only asset requests (tabs All / Open / Resolved)
 *   it     everyone else who reaches the desk — IT Admin, and CEO/COO, who fall into this branch:
 *          tickets + asset requests, an asset still waiting for approval only for the approver
 */
export type DeskSlice = 'super' | 'hr' | 'admin' | 'it';

export function deskSlice(role: Role): DeskSlice {
  if (role === 'super_admin') return 'super'; // 21129 isSuperAdmin
  if (role === 'hr') return 'hr'; // 21130 isHR
  if (role === 'admin' || role === 'app_manager') return 'admin'; // 21137 isAdminRole
  return 'it';
}

/** dash.html:21137 — Admin and App Manager. */
export const isAdminRole = (role: Role) => role === 'admin' || role === 'app_manager';

/**
 * dash.html:21144 isDeptApprover — the IT & Admin department's admin (Department.adminId) approves
 * asset requests. Only an Admin / App Manager / IT Admin can be it; with nobody assigned yet any Admin
 * (never any IT Admin) may act, so requests don't get stuck. `approverId` undefined = still loading
 * (treated as "nobody can approve yet"), null = loaded, nobody assigned.
 */
export function isDeptApprover(role: Role, userId: string | null | undefined, approverId: string | null | undefined) {
  if (approverId === undefined) return false;
  if (!(isAdminRole(role) || role === 'it_admin')) return false;
  return approverId ? !!userId && userId === approverId : isAdminRole(role);
}

/** dash.html:21154 — "Behaviour & Work" complaints (also routes/tickets.js:108, :298). */
export const isBehaviourWork = (t: Pick<Ticket, 'type'> | null | undefined) => /behaviou?r.*work|work.*behaviou?r/i.test(String(t?.type || ''));

/** dash.html:21155 */
export const isPendingApproval = (t: Pick<Ticket, 'category' | 'status'>) => t.category === 'asset' && t.status === 'pending_approval';

/** Admin requests and complaints use a status picker instead of Accept & Assign (dash.html:21341). */
export const isRequestType = (t: Pick<Ticket, 'category'>) => t.category === 'admin_request' || t.category === 'complaint';

/** dash.html:21155–21163 baseItems: the rows this slice may see (the server returns every ticket). */
export function baseItems<T extends Ticket>(items: T[], slice: DeskSlice, approver: boolean): T[] {
  const list = Array.isArray(items) ? items.filter((t) => !!t && typeof t === 'object') : [];
  if (slice === 'super') return list;
  if (slice === 'hr') return list.filter((i) => i.category === 'complaint' && isBehaviourWork(i));
  if (slice === 'admin') return list.filter((i) => i.category === 'asset');
  return list.filter((i) => i.category !== 'admin_request' && i.category !== 'complaint' && (!isPendingApproval(i) || approver));
}

/** The tabs, by slice (dash.html:21218–21222), in the app's plain words. */
export type DeskTab = 'all' | 'ticket' | 'asset' | 'adminreq' | 'complaint' | 'open' | 'resolved';

export function deskTabs(slice: DeskSlice): { key: DeskTab; label: string }[] {
  if (slice === 'hr') return [{ key: 'all', label: 'Behaviour & work' }];
  if (slice === 'admin') {
    return [
      { key: 'all', label: 'All' },
      { key: 'open', label: 'Open' },
      { key: 'resolved', label: 'Resolved' },
    ];
  }
  return [
    { key: 'all', label: 'All' },
    { key: 'ticket', label: 'IT help' },
    { key: 'asset', label: 'Equipment' },
    ...(slice === 'super'
      ? [
          { key: 'adminreq' as const, label: 'Office' },
          { key: 'complaint' as const, label: 'Complaints' },
        ]
      : []),
  ];
}

const TAB_CATEGORY: Partial<Record<DeskTab, string>> = { ticket: 'ticket', asset: 'asset', adminreq: 'admin_request', complaint: 'complaint' };

/** dash.html:21166–21168 visibleUnsorted: Admin's tabs filter by status, everyone else's by category. */
export function inTab(t: Ticket, slice: DeskSlice, tab: DeskTab) {
  if (tab === 'all') return true;
  if (slice === 'admin') {
    if (tab === 'open') return t.status === 'pending_approval' || t.status === 'in_progress';
    if (tab === 'resolved') return t.status === 'resolved';
    return true;
  }
  const cat = TAB_CATEGORY[tab];
  return cat ? t.category === cat : true;
}

/**
 * The website's tickets/assets decision roles (routes/tickets.js:113, :304 canDecide). CEO/COO reach
 * the IT slice and get Accept & Assign buttons on the website, but the server refuses their status
 * change (the task is created and the ticket stays open) — the app shows them a read-only desk.
 */
export const DECIDE_ROLES = ['it_admin', 'admin', 'super_admin', 'app_manager'];

/**
 * What the Action column offers for one row (dash.html:21341–21362), for this viewer:
 *   cancelled  "Cancelled by the employee" (no action)
 *   status     admin request / complaint: the status picker (open … closed) + Reject — only for
 *              Super Admin, and HR on Behaviour & Work complaints (routes/tickets.js:111–112)
 *   approve    asset waiting for approval, I am the approver: Approve & assign + Reject
 *   awaiting   asset waiting for approval, someone else approves ("Waiting for approval by …")
 *   accept     unassigned and not finished: Accept & assign + Reject (not Admin / App Manager,
 *              who see "—"; not CEO/COO, read-only in the app)
 *   none       resolved, rejected, assigned ("In progress"), or nothing this viewer may do
 */
export type RowAction = 'cancelled' | 'status' | 'approve' | 'awaiting' | 'accept' | 'none';

export function rowAction(t: Ticket, role: Role, approver: boolean): RowAction {
  if (t.status === 'cancelled') return 'cancelled';
  if (isRequestType(t)) {
    const may = role === 'super_admin' || (role === 'hr' && t.category === 'complaint' && isBehaviourWork(t));
    return may ? 'status' : 'none';
  }
  if (isPendingApproval(t)) return approver ? 'approve' : 'awaiting';
  if (t.status === 'resolved' || t.status === 'rejected') return 'none';
  if (t.assignedTo) return 'none';
  if (isAdminRole(role)) return 'none';
  return DECIDE_ROLES.includes(String(role)) ? 'accept' : 'none';
}

/** The status picker's choices (dash.html:21223 REQ_STATUSES); "rejected" goes through the reason sheet. */
export const REQUEST_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** routes/tickets.js:294–296: a request already rejected, cancelled or resolved can't be rejected (409). */
export const canStillReject = (t: Pick<Ticket, 'status'>) => !['rejected', 'cancelled', 'resolved'].includes(String(t.status || ''));

/**
 * What needs this viewer now (the Inbox queue and the desk's "Waiting on you"), per the spec
 * (team-ops.md §5.4): unassigned tickets to accept (IT Admin), assets to approve (the approver), and
 * open admin requests / complaints (Super Admin; HR's Behaviour & Work slice).
 */
export function needsMe(t: Ticket, role: Role, approver: boolean) {
  const a = rowAction(t, role, approver);
  if (a === 'approve') return true;
  if (a === 'accept') return role === 'it_admin';
  if (a === 'status') return t.status === 'open';
  return false;
}

/** "Raise for someone" (ITTaskOnBehalf): the IT Admin's `tasks` sidebar item (dash.html:1531, 6988). */
export const canRaiseForSomeone = (role: Role, webTasks: boolean) => role === 'it_admin' && webTasks;

/** dash.html:6858 — who can't be picked as the employee in Raise for someone. */
export const NON_PERSON_ROLES = ['master_admin', 'announcement_viewer'];
