// Demo API for the servicedesk domain (docs/port/team-ops.md §5.6, it-admin.md "Service desk").
// Changes shared demo data only through the Wave 0 exports (support.ts ticketStore / patchTicket,
// tasks.ts taskStore / createTask, org.ts personById); the built-in GET/POST /tickets and POST /tasks
// (de-duplicated by ticketId) keep answering.
//
// Seeds the company's desk with colleagues' requests (not the demo person's own), so every role finds
// work in its slice:
//   Afzal IT Admin      runs IT & Admin, so is the equipment approver: 3 new tickets to assign (+ Sneha's
//                       monitor already there), 2 equipment requests to approve, one in progress with
//                       Ravi, one resolved, one shown resolved because its task is finished, one rejected,
//                       one cancelled; "Raised by you" has one
//   Afzal Super Admin   everything, plus 2 office requests and 2 complaints to answer
//   Afzal HR            the Behaviour & work complaint only
//   Afzal Admin / App Manager   equipment requests, read-only ("Waiting for approval by Naveen Kumar")
//
// Routes (mine win over support.ts):
//   PUT  /tickets/:id         the server's status matrix (routes/tickets.js:91–145) for the active persona
//   POST /tickets/:id/reject  reason required, 409 when already rejected / cancelled / resolved,
//                             the same role matrix (routes/tickets.js:283–345)
//   GET  /whitelist           two people invited but not signed up yet (Raise for someone)

import type { Ticket } from '@/api/support';
import type { Task } from '@/api/tasks';
import { DEMO_TENANT_ID, DEMO_USER } from '@/demo/config';
import { personById } from '@/demo/fixtures/org';
import { patchTicket, ticketStore } from '@/demo/fixtures/support';
import { createTask, taskStore } from '@/demo/fixtures/tasks';
import { currentPersona } from '@/demo/personas';
import { daysAgo, fail, istDateOf, minutesAgo, notFound, nowIso, type Route } from '@/demo/state';

const ME = String(DEMO_USER.name);

// A colleague's request, with their real directory details (org.ts PEOPLE).
function by(id: string) {
  const p = personById(id);
  const name = p?.name ?? 'Colleague';
  return {
    from: name,
    raisedByName: name,
    fromEmail: String(p?.email ?? ''),
    fromId: id,
    raisedById: id,
    fromPhone: String(p?.mobile ?? ''),
    dept: String(p?.dept ?? ''),
    tenantId: DEMO_TENANT_ID,
  };
}
const at = (iso: string) => ({ createdAt: iso, date: istDateOf(iso) });

const SEED: Ticket[] = [
  // ── IT help: waiting to be assigned ──
  {
    id: 'tk1760900000101',
    category: 'ticket',
    type: 'technical',
    subject: 'VPN won’t connect from home',
    desc: 'FortiClient says “credential or SSL VPN configuration is wrong” since this morning. I need the shared drive for the Aarogya captions today.',
    priority: 'high',
    status: 'open',
    kekaCode: 'TM_AAR_BRAND26',
    ...by('u-zoya'),
    ...at(minutesAgo(40)),
  },
  {
    id: 'tk1760900000102',
    category: 'ticket',
    type: 'hardware',
    subject: 'Printer jam on the 2nd floor',
    desc: 'The Canon near the production bay jams on every page. Call sheets for tomorrow’s shoot need printing by 5 PM.',
    priority: 'medium',
    status: 'open',
    kekaCode: 'TM_KAG_LAUNCH',
    ...by('u-imran'),
    ...at(minutesAgo(150)),
  },
  {
    id: 'tk1760900000103',
    category: 'ticket',
    type: 'access',
    subject: 'Access to the Adobe Stock team library',
    desc: 'Meera needs the team licence for the Diwali campaign mood boards. Raised for her at the desk.',
    priority: 'low',
    status: 'open',
    kekaCode: 'TM_SJW_DIWALI26',
    raisedOnBehalfBy: ME,
    raisedOnBehalfById: DEMO_USER.id,
    ...by('u-meera'),
    ...at(daysAgo(1, '16:20')),
  },
  // ── IT help: in progress, resolved, rejected, cancelled ──
  {
    id: 'tk1760900000104',
    category: 'ticket',
    type: 'hardware',
    subject: 'Audio interface not detected in Suite 1',
    desc: 'The Focusrite 18i20 shows no inputs in Pro Tools after the macOS update. Dubbing session on Thursday.',
    priority: 'high',
    status: 'in_progress',
    assignedTo: 'Ravi Teja',
    acceptedAt: daysAgo(1, '12:10'),
    kekaCode: 'TM_KTH_S2',
    ...by('u-anita'),
    ...at(daysAgo(1, '11:30')),
  },
  {
    id: 'tk1760900000105',
    category: 'ticket',
    type: 'software',
    subject: 'Calibrate the grading monitor',
    desc: 'The FSI in the grading suite drifts warm. Needs a fresh calibration before the Sunrise Jewellers grade.',
    priority: 'medium',
    status: 'resolved',
    assignedTo: 'Ravi Teja',
    acceptedAt: daysAgo(3, '10:15'),
    resolvedAt: daysAgo(2, '17:00'),
    resolvedBy: 'Ravi Teja',
    resolutionNote: 'Calibrated with the i1Display Pro and saved a new LUT on the monitor.',
    kekaCode: 'TM_SJW_DIWALI26',
    ...by('u-rahul'),
    ...at(daysAgo(3, '09:40')),
  },
  {
    // Its task is finished, so the desk shows it resolved (reconcileTickets) though the row says in progress.
    id: 'tk1760900000106',
    category: 'ticket',
    type: 'software',
    subject: 'Install the Neat Video plug-in',
    desc: 'Need Neat Video 5 for Premiere on EDIT-WS-04 for the night exteriors.',
    priority: 'medium',
    status: 'in_progress',
    assignedTo: 'Naveen Kumar',
    acceptedAt: daysAgo(2, '11:00'),
    kekaCode: 'TM_NIM_EXPL',
    ...by('u-sanjay'),
    ...at(daysAgo(2, '10:20')),
  },
  {
    id: 'tk1760900000107',
    category: 'ticket',
    type: 'software',
    subject: 'Personal streaming app on the edit machine',
    desc: 'Want to install a streaming app on EDIT-WS-09 to check references.',
    priority: 'low',
    status: 'rejected',
    rejectedAt: daysAgo(4, '15:30'),
    rejectedBy: 'Naveen Kumar',
    rejectionReason: 'Personal streaming apps can’t go on work machines. Use the review room’s Apple TV for references.',
    ...by('u-nikhil'),
    ...at(daysAgo(4, '13:05')),
  },
  {
    id: 'tk1760900000108',
    category: 'ticket',
    type: 'hardware',
    subject: 'Mouse double-clicks on its own',
    desc: 'The Logitech mouse on desk 7 double-clicks.',
    priority: 'low',
    status: 'cancelled',
    cancelledAt: daysAgo(5, '12:00'),
    cancelledBy: 'Kavya Reddy',
    ...by('u-kavya'),
    ...at(daysAgo(5, '11:20')),
  },
  // ── Equipment: two waiting for approval, one approved and in progress ──
  {
    id: 'tk1760900000201',
    category: 'asset',
    assetType: 'Monitor',
    quantity: 2,
    urgency: 'normal',
    reason: 'A second pair of screens for the assist station — the timeline and the client preview side by side.',
    status: 'pending_approval',
    kekaCode: 'TM_INT_REEL26',
    ...by('u-kavya'),
    ...at(minutesAgo(200)),
  },
  {
    id: 'tk1760900000202',
    category: 'asset',
    assetType: 'Laptop',
    quantity: 1,
    urgency: 'urgent',
    reason: 'My laptop’s battery swells and it shuts down off the charger. Need one for the Kathalu location recce on Monday.',
    status: 'pending_approval',
    kekaCode: 'TM_KTH_S2',
    ...by('u-nikhil'),
    ...at(daysAgo(1, '10:05')),
  },
  {
    id: 'tk1760900000203',
    category: 'asset',
    assetType: 'Hard Drive',
    quantity: 1,
    urgency: 'urgent',
    reason: '2 TB SSD for the Kisan Agro rushes.',
    status: 'in_progress',
    approvedBy: 'Naveen Kumar',
    approvedAt: daysAgo(2, '15:10'),
    assignedTo: 'Ravi Teja',
    acceptedAt: daysAgo(2, '15:10'),
    kekaCode: 'TM_KAG_LAUNCH',
    ...by('u-farhan'),
    ...at(daysAgo(2, '14:30')),
  },
  // ── Office requests (Super Admin) ──
  {
    id: 'tk1760900000301',
    category: 'admin_request',
    itemType: 'Stationery Kit',
    quantity: 3,
    urgency: 'normal',
    reason: 'For the three new interns joining Marketing on Monday.',
    status: 'open',
    kekaCode: 'TM_INT_ADMIN',
    ...by('u-zoya'),
    ...at(minutesAgo(95)),
  },
  {
    id: 'tk1760900000302',
    category: 'admin_request',
    itemType: 'ID Card Reprint',
    quantity: 1,
    urgency: 'urgent',
    reason: 'Lost my ID card at the Ramoji shoot.',
    status: 'in_progress',
    statusUpdatedBy: 'Kiran Rao',
    statusUpdatedAt: daysAgo(1, '14:00'),
    acceptedAt: daysAgo(1, '14:00'),
    kekaCode: 'TM_INT_ADMIN',
    ...by('u-imran'),
    ...at(daysAgo(1, '09:50')),
  },
  // ── Complaints (Super Admin; HR sees the Behaviour & Work one) ──
  {
    id: 'tk1760900000401',
    category: 'complaint',
    type: 'Behaviour & Work',
    subject: 'Late-night calls from a client lead',
    desc: 'A client lead keeps calling me after 11 PM about edits, even on weekends. I’d like help setting boundaries with the account.',
    status: 'open',
    ...by('u-anita'),
    ...at(minutesAgo(260)),
  },
  {
    id: 'tk1760900000402',
    category: 'complaint',
    type: 'Facilities',
    subject: 'Lift got stuck twice this week',
    desc: 'The lift near the edit floor stopped between floors on Monday and again today, with equipment inside.',
    status: 'open',
    ...by('u-sanjay'),
    ...at(daysAgo(1, '18:10')),
  },
];

// The tasks behind the tickets that were assigned (My tasks of Ravi / Naveen), as Accept & assign
// creates them (dash.html:21268). One is completed: the desk shows its ticket as resolved.
const TASKS: (Partial<Task> & { ticketId: string })[] = [
  { ticketId: 'tk1760900000104', assignee: 'Ravi Teja', status: 'in_progress', creator: 'Naveen Kumar' },
  { ticketId: 'tk1760900000203', assignee: 'Ravi Teja', status: 'pending', creator: 'Naveen Kumar' },
  { ticketId: 'tk1760900000106', assignee: 'Naveen Kumar', status: 'completed', creator: 'Naveen Kumar', completedAt: minutesAgo(100), completedBy: 'Naveen Kumar' },
];

function seed() {
  for (const t of SEED) if (!ticketStore.some((x) => x.id === t.id)) ticketStore.push({ ...t });
  for (const k of TASKS) {
    if (taskStore.some((x) => x.ticketId === k.ticketId)) continue;
    const t = SEED.find((x) => x.id === k.ticketId);
    if (!t) continue;
    createTask({
      id: `tk${k.ticketId.slice(2)}9`,
      title: t.category === 'ticket' ? t.subject || 'IT Support Task' : `${t.quantity}x ${t.assetType} — Asset Request`,
      desc: t.desc || t.reason || '',
      source: 'ticket',
      category: String(t.category),
      startDate: String(t.date || ''),
      requesterName: t.from,
      requesterPhone: t.fromPhone,
      requesterEmail: t.fromEmail,
      dept: t.dept,
      kekaCode: t.kekaCode,
      urgency: t.urgency || t.priority || '',
      ...k,
    });
  }
}
seed();

// ── The server's rules (routes/tickets.js) for the persona being explored ─────
const DECIDE_ROLES = ['it_admin', 'admin', 'super_admin', 'app_manager'];
const isBehaviour = (t: Ticket) => /behaviou?r.*work|work.*behaviou?r/i.test(String(t.type || ''));
const isReqType = (t: Ticket) => t.category === 'admin_request' || t.category === 'complaint';
const mayDecide = (t: Ticket, role: string) =>
  isReqType(t) ? role === 'super_admin' || (role === 'hr' && t.category === 'complaint' && isBehaviour(t)) : DECIDE_ROLES.includes(role);

function update(id: string, body: unknown) {
  const t = ticketStore.find((x) => x.id === id);
  if (!t) return notFound('Ticket not found.');
  const b = { ...((body || {}) as Record<string, unknown>) };
  delete b.performedById;
  delete b.actorId;
  delete b.tenantId;
  if (b.status === 'rejected' && t.status !== 'rejected') return fail('Use the Reject action — a rejection reason is required.');
  if (b.status && b.status !== t.status) {
    const role = currentPersona().role;
    const isRaiser = String(t.raisedById) === DEMO_USER.id || String(t.userId) === DEMO_USER.id;
    const raiserAllowed = isRaiser && b.status === 'cancelled';
    // The assignee may move their own ticket through the working states (tickets.js:136–142).
    const assigned = String(t.assignedTo || '');
    const isAssignee = !isReqType(t) && ((!!assigned && (assigned === ME || assigned === DEMO_USER.id)) || String(t.assignedToId || '') === DEMO_USER.id);
    const assigneeAllowed = isAssignee && ['in_progress', 'resolved'].includes(String(b.status));
    if (!mayDecide(t, role) && !raiserAllowed && !assigneeAllowed) return fail('You are not authorised to change the status of this request.', 403);
  }
  patchTicket(id, b as Partial<Ticket>);
  return { ok: true };
}

function reject(id: string, body: unknown) {
  const reason = String((body as { reason?: unknown } | null)?.reason ?? '').trim();
  if (!reason) return fail('A rejection reason is required.');
  const t = ticketStore.find((x) => x.id === id);
  if (!t) return notFound('Request not found.');
  if (t.status === 'rejected') return fail('This request has already been rejected.', 409);
  if (t.status === 'cancelled') return fail('This request was cancelled by the requester.', 409);
  if (t.status === 'resolved') return fail('This request has already been resolved.', 409);
  if (!mayDecide(t, currentPersona().role)) return fail('You are not authorised to reject this request.', 403);
  const now = nowIso();
  const done = patchTicket(id, {
    status: 'rejected',
    rejectionReason: reason,
    rejectedBy: ME,
    rejectedById: DEMO_USER.id,
    rejectedAt: now,
    statusUpdatedBy: ME,
    statusUpdatedAt: now,
  });
  return { ok: true, ticket: done ? { ...done } : null };
}

// People invited to DASH who have not signed up yet (routes/whitelist.js rows).
const WHITELIST = [
  {
    id: 'wl-tejas',
    name: 'Tejas Kulkarni',
    email: 'tejas.kulkarni.demo@tamadamedia.com',
    role: 'employee',
    dept: 'dept-creative',
    deptName: 'Creative',
    mobile: '+919000188041',
    tenantId: DEMO_TENANT_ID,
  },
  {
    id: 'wl-divya',
    name: 'Divya Menon',
    email: 'divya.menon.demo@tamadamedia.com',
    role: 'employee',
    dept: 'dept-production',
    deptName: 'Production',
    mobile: '+919000188052',
    tenantId: DEMO_TENANT_ID,
  },
];

export const servicedeskRoutes: Route[] = [
  ['PUT', /^\/tickets\/([^/]+)$/, ([, id], body) => update(id!, body)],
  ['POST', /^\/tickets\/([^/]+)\/reject$/, ([, id], body) => reject(id!, body)],
  ['GET', /^\/whitelist$/, () => WHITELIST],
];
