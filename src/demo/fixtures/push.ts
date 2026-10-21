// Demo API for the push domain (wave 3). Already in the fixtures barrel (demo/fixtures/index.ts), so
// these routes are live with no shared edit and win over the built-in fixtures. Owner: the push agent.
//
// Mirrors the server branch feature/mobile-push (routes/push.js):
//   POST /push/devices          validates the Expo token like the server, remembers it per role
//   POST /push/devices/remove   forgets it
//   POST /push/test             {ok, sent, errors} — the app sends a local sample instead (lib/push.ts)
// Demo only (no server route): GET /push/demo-samples — the sample notifications for the active role,
// built at call time from the shared stores so every link opens a record that exists.

import type { PushOk, PushSample, PushTestResult } from '@/api/push';
import { newsStore } from '@/demo/fixtures/announcements';
import { bountyTaskStore } from '@/demo/fixtures/bounty';
import { pettyStore } from '@/demo/fixtures/petty-cash';
import { reimbursementStore } from '@/demo/fixtures/reimbursements';
import { ticketStore } from '@/demo/fixtures/support';
import { taskStore } from '@/demo/fixtures/tasks';
import { visitStore } from '@/demo/fixtures/visitors';
import { currentPersona, type StaffPersonaId } from '@/demo/personas';
import { fail, type Route } from '@/demo/state';

const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/;

/** This phone's token per demo role, as the server's push_devices would hold it. */
export const pushDeviceStore = new Map<StaffPersonaId, { token: string; platform: string; at: string }>();

const short = (s: string | undefined, n = 60) => {
  const t = String(s ?? '').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

function samplesFor(role: StaffPersonaId): PushSample[] {
  const out: PushSample[] = [];
  const add = (s: PushSample) => out.push(s);

  const myTask = taskStore.find((t) => t.status === 'pending' || t.status === 'in_progress') ?? taskStore[0];
  const submitted = taskStore.find((t) => t.status === 'submitted');
  const waitingVisit = visitStore.find((v) => v.status === 'pending');
  const ticket = ticketStore.find((t) => !/closed|resolved|rejected|cancel/i.test(String(t.status))) ?? ticketStore[0];
  const reimb = reimbursementStore.find((r) => /pending/i.test(String(r.status)));
  const petty = pettyStore.find((r) => /pending_accounts/i.test(String(r.status))) ?? pettyStore[0];
  const bounty = bountyTaskStore[0];
  const news = newsStore[0];

  const visitor = (title: string) =>
    add({
      id: 'visitor',
      title,
      body: waitingVisit ? `${short(waitingVisit.purpose, 70)}. Let them in or turn them away.` : 'Let them in or turn them away.',
      url: role === 'visitor_manager' ? '/admin/desk' : '/visitors',
      kind: 'visitors',
    });

  switch (role) {
    case 'employee':
    case 'professional':
      if (myTask) add({ id: 'task', title: `New Task Assigned: ${short(myTask.title, 50)}`, body: 'Open it to see the details and start the work.', url: `/tasks/${myTask.id}`, kind: 'updates' });
      visitor(`${waitingVisit?.visitorName ?? 'Ravi Kumar'} is at reception`);
      if (bounty) add({ id: 'bounty', title: 'Reminder: a bounty task is still open', body: `${short(bounty.title, 70)}`, url: `/bounty/${bounty.id}`, kind: 'updates' });
      break;
    case 'manager':
      if (submitted) add({ id: 'task-review', title: `Task Submitted: ${short(submitted.title, 50)}`, body: 'Review it and approve or send it back.', url: `/tasks/${submitted.id}`, kind: 'approvals' });
      add({ id: 'reimb', title: 'Reimbursement awaiting your approval', body: reimb ? `${reimb.employee_name} · ${reimb.project_name ?? reimb.keka_code}` : 'A claim on your project code needs you.', url: '/reimbursements/approvals', kind: 'approvals' });
      visitor(`${waitingVisit?.visitorName ?? 'Ravi Kumar'} is at reception`);
      break;
    case 'accounts':
      add({ id: 'petty', title: 'Petty cash awaiting Accounts approval', body: petty ? `${petty.employeeName ?? 'A request'} · ₹${petty.amount}` : 'A request is waiting for Accounts.', url: '/admin/accounts', kind: 'approvals' });
      add({ id: 'reimb-acct', title: 'Reimbursement awaiting Accounts authorization', body: 'Approved by the project owner. Your turn.', url: '/admin/accounts', kind: 'approvals' });
      break;
    case 'hr':
      add({ id: 'birthday', title: 'Birthday today: Priya Sharma', body: 'The card is on Announcements.', url: news ? `/announcements/${news.id}` : '/announcements', kind: 'updates' });
      add({ id: 'leave', title: 'Leave waiting for your approval', body: 'Open your Inbox to decide.', url: '/inbox', kind: 'approvals' });
      break;
    case 'it_admin':
    case 'admin':
    case 'app_manager':
      if (ticket) add({ id: 'ticket', title: `New IT ticket: ${short(ticket.subject, 50)}`, body: `${ticket.raisedByName ?? 'Someone'} raised it.`, url: `/support/${ticket.id}`, kind: 'approvals' });
      visitor(`${waitingVisit?.visitorName ?? 'Ravi Kumar'} is at reception`);
      break;
    case 'visitor_manager':
      visitor(`${waitingVisit?.visitorName ?? 'Aditi Rao'} is waiting for a host`);
      add({ id: 'guest', title: 'Your guest has arrived', body: 'They checked in with their invite code.', url: '/admin/desk', kind: 'visitors' });
      break;
    case 'super_admin':
    case 'announcements':
    case 'master_admin':
    default:
      add({ id: 'news', title: news ? `New announcement: ${short(news.title, 50)}` : 'New announcement', body: 'Open it to read the whole post.', url: news ? `/announcements/${news.id}` : '/announcements', kind: 'updates' });
      if (ticket && role === 'super_admin') add({ id: 'ticket', title: `New IT ticket: ${short(ticket.subject, 50)}`, body: `${ticket.raisedByName ?? 'Someone'} raised it.`, url: `/support/${ticket.id}`, kind: 'approvals' });
      break;
  }
  return out;
}

export const pushRoutes: Route[] = [
  [
    'POST',
    /^\/push\/devices$/,
    (_p, body): PushOk | ReturnType<typeof fail> => {
      const token = String(body?.token ?? '');
      if (!TOKEN_RE.test(token) || token.length > 200) return fail('That is not a valid Expo push token.', 400);
      pushDeviceStore.set(currentPersona().id, { token, platform: String(body?.platform ?? ''), at: new Date().toISOString() });
      return { ok: true };
    },
  ],
  [
    'POST',
    /^\/push\/devices\/remove$/,
    (_p, body): PushOk | ReturnType<typeof fail> => {
      if (!body?.token) return fail('token required', 400);
      const mine = pushDeviceStore.get(currentPersona().id);
      if (mine?.token === body.token) pushDeviceStore.delete(currentPersona().id);
      return { ok: true };
    },
  ],
  ['POST', /^\/push\/test$/, (): PushTestResult => ({ ok: true, sent: pushDeviceStore.has(currentPersona().id) ? 1 : 0, errors: [] })],
  ['GET', /^\/push\/demo-samples$/, (): PushSample[] => samplesFor(currentPersona().id)],
];
