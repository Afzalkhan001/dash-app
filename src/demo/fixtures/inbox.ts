// The HR approval queues, as the persona (demo/personas.ts) is allowed to review them:
//   hr_time.js     GET /regularizations/inbox?status=, POST /regularizations/:id/decide
//   hr_leave.js    GET /leave/inbox?kind=&status= (balance_available on pending leave), POST /requests/:id/decide
//   hr_payroll.js  GET /claims/inbox?status=, POST /claims/:id/decide; GET /loans/inbox, POST /loans/:id/decide
// A department admin (Afzal Manager → Creative, Afzal Admin → Production, Afzal IT Admin → IT &
// Admin) sees the requests of their own departments; an HR admin (Afzal HR, Afzal Super Admin) sees
// the whole company and is the only one who reviews salary advances (hr_payroll.js loanAdmin).
// Every list answers `{ requests }` for one status; deciding follows hr_common.js readDecision (a
// rejection needs a reason of 3+ characters) and refuses anything no longer pending.
// (Keka Code claims live in reimbursements.ts, visitors in visitors.ts.)

import type { HrRequest } from '@/api/inbox';
import { DEMO_USER } from '@/demo/config';
import { DEPARTMENTS, personById } from '@/demo/fixtures/org';
import { currentPersona } from '@/demo/personas';
import { addDays, addMonths, countWorkingDays, fail, istIso, isWorkingDay, minutesAgo, nowIso, today, workingDayFrom, type Route } from '@/demo/state';
import { LAST_SATURDAY, SHOOT_SATURDAY } from '@/demo/timeline';

const T0 = today();
const wd = (n: number) => workingDayFrom(T0, n);
const ahead = (n: number) => workingDayFrom(T0, -n);
const ME = String(DEMO_USER.name);

type Queue = 'regularization' | 'leave' | 'claims' | 'loans';

// Who decided an older request: the demo person for their own Creative team, otherwise the
// department's usual admin.
const USUAL_DECIDER: Record<string, string> = {
  'dept-production': 'Deepa Menon',
  'dept-marketing': 'Vikram Singh',
  'dept-it': 'Naveen Kumar',
};

function row(employeeId: string, r: Partial<HrRequest> & { id: string; status: string; created_at: string }): HrRequest {
  const decided = r.status === 'approved' || r.status === 'rejected' || r.status === 'paid' || r.status === 'closed';
  const person = personById(employeeId);
  const dept = String(person?.departmentId ?? 'dept-creative');
  return {
    employee_id: employeeId,
    employee_name: person?.name ?? 'Employee',
    department_id: dept,
    decided_by_name: decided ? (USUAL_DECIDER[dept] ?? ME) : null,
    decided_at: decided ? addHours(r.created_at, 5) : r.status === 'cancelled' ? addHours(r.created_at, 2) : null,
    decision_note: '',
    ...r,
  };
}
const addHours = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3600000).toISOString();

const leaveRow = (employeeId: string, r: Partial<HrRequest> & { id: string; status: string; created_at: string; from_date: string; to_date?: string }) => {
  const to = r.to_date ?? r.from_date;
  const half = r.half_day ?? 'none';
  return row(employeeId, { leave_type_id: null, leave_code: null, half_day: half, ...r, to_date: to, days: r.days ?? (r.kind === 'comp_off' ? 1 : countWorkingDays(r.from_date, to, half)) });
};

const QUEUES: Record<Queue, HrRequest[]> = {
  regularization: [
    row('u-kavya', {
      id: 'hrg-in-01',
      work_date: wd(1),
      in_time: '09:20',
      out_time: null,
      reason: 'I was at the Gachibowli studio for the Kisan shoot from 9:20 — the app could not get a GPS fix inside the studio.',
      status: 'pending',
      created_at: minutesAgo(190),
      previous: { in_at: istIso(wd(1), '11:02'), out_at: istIso(wd(1), '19:15'), worked_minutes: 493, status: 'present' },
    }),
    row('u-sanjay', {
      id: 'hrg-in-02',
      work_date: wd(2),
      in_time: null,
      out_time: '20:45',
      reason: 'Stayed back to finish the Aarogya cutdowns; my phone died before I could clock out.',
      status: 'pending',
      created_at: istIso(wd(1), '09:35'),
      previous: { in_at: istIso(wd(2), '09:50'), out_at: null, worked_minutes: null, status: null },
    }),
    row('u-nikhil', { id: 'hrg-in-03', work_date: wd(6), in_time: '09:30', out_time: null, reason: 'Clock-in did not register at the gate.', status: 'approved', created_at: istIso(wd(6), '12:00'), decision_note: 'Confirmed with the visitor desk log.' }),
    row('u-rahul', {
      id: 'hrg-in-04',
      work_date: wd(9),
      in_time: null,
      out_time: '21:00',
      reason: 'Colour session ran late.',
      status: 'rejected',
      created_at: istIso(wd(8), '10:15'),
      decision_note: 'No grading or export activity after 7 pm that day — please check the date.',
    }),
    row('u-anita', { id: 'hrg-in-05', work_date: wd(11), in_time: '09:10', out_time: null, reason: 'Phone was switched off at the recording studio.', status: 'cancelled', created_at: istIso(wd(11), '13:20') }),
    // Other departments (their admins, and HR, see these).
    row('u-farhan', {
      id: 'hrg-in-06',
      work_date: wd(2),
      in_time: '07:05',
      out_time: null,
      reason: 'Reached the Ramoji set at 7:05 for the Kisan shoot — there was no signal at the gate to clock in.',
      status: 'pending',
      created_at: minutesAgo(5 * 60),
      previous: { in_at: istIso(wd(2), '09:12'), out_at: istIso(wd(2), '18:40'), worked_minutes: 568, status: 'present' },
    }),
    row('u-meera', {
      id: 'hrg-in-07',
      work_date: wd(1),
      in_time: null,
      out_time: '20:30',
      reason: 'Stayed for the Aarogya campaign launch call with the client; forgot to clock out after it.',
      status: 'pending',
      created_at: minutesAgo(80),
      previous: { in_at: istIso(wd(1), '09:40'), out_at: null, worked_minutes: null, status: null },
    }),
    row('u-ravi', {
      id: 'hrg-in-08',
      work_date: wd(3),
      in_time: '08:15',
      out_time: null,
      reason: 'Came in early to patch the edit workstations before the team arrived; the app did not get a GPS fix in the server room.',
      status: 'pending',
      created_at: istIso(wd(2), '10:05'),
      previous: { in_at: istIso(wd(3), '10:20'), out_at: istIso(wd(3), '18:45'), worked_minutes: 505, status: 'present' },
    }),
    row('u-imran', { id: 'hrg-in-09', work_date: wd(7), in_time: '06:50', out_time: null, reason: 'Early lighting set-up at the Gachibowli studio.', status: 'approved', created_at: istIso(wd(7), '11:30'), decision_note: 'Matches the call sheet.' }),
  ],
  leave: [
    leaveRow('u-sneha', { id: 'hlr-in-01', kind: 'leave', leave_type_id: 'lt-cl', leave_code: 'CL', from_date: ahead(5), to_date: ahead(6), reason: 'Sister’s wedding in Chennai', status: 'pending', created_at: minutesAgo(26 * 60), balance_available: 7 }),
    leaveRow('u-rahul', { id: 'hlr-in-02', kind: 'leave', leave_type_id: 'lt-sl', leave_code: 'SL', from_date: isWorkingDay(T0) ? T0 : ahead(1), half_day: 'first', days: 0.5, reason: 'Doctor’s appointment — will be in by 2 pm', status: 'pending', created_at: minutesAgo(95), balance_available: 5.5 }),
    leaveRow('u-nikhil', { id: 'hlr-in-03', kind: 'leave', leave_type_id: 'lt-el', leave_code: 'EL', from_date: ahead(18), to_date: ahead(22), reason: 'Family trip to Goa', status: 'pending', created_at: minutesAgo(3 * 24 * 60), balance_available: 6.25 }),
    leaveRow('u-anita', { id: 'hlr-in-04', kind: 'leave', leave_type_id: 'lt-cl', leave_code: 'CL', from_date: wd(4), reason: 'House-warming ceremony', status: 'approved', created_at: istIso(wd(9), '11:00'), decision_note: 'Enjoy!' }),
    leaveRow('u-kavya', { id: 'hlr-in-05', kind: 'leave', leave_type_id: 'lt-sl', leave_code: 'SL', from_date: wd(9), reason: 'Migraine', status: 'approved', created_at: istIso(wd(9), '08:05') }),
    leaveRow('u-sanjay', { id: 'hlr-in-06', kind: 'leave', leave_type_id: 'lt-cl', leave_code: 'CL', from_date: ahead(2), reason: 'Personal work', status: 'rejected', created_at: minutesAgo(2 * 24 * 60), decision_note: 'The Aarogya delivery is due that day — can you move it to next week?' }),
    leaveRow('u-sneha', { id: 'hlr-in-07', kind: 'leave', leave_type_id: 'lt-cl', leave_code: 'CL', from_date: wd(15), reason: 'Travel plans changed', status: 'cancelled', created_at: istIso(wd(20), '15:30') }),
    leaveRow('u-anita', { id: 'hlr-in-08', kind: 'wfh', from_date: ahead(3), reason: 'Waiting for a furniture delivery at home — will mix the Nimbus VO remotely', status: 'pending', created_at: minutesAgo(5 * 60) }),
    leaveRow('u-kavya', { id: 'hlr-in-09', kind: 'wfh', from_date: wd(7), reason: 'Internet technician visit at home', status: 'approved', created_at: istIso(wd(9), '17:45') }),
    leaveRow('u-sanjay', { id: 'hlr-in-10', kind: 'wfh', from_date: wd(14), reason: 'Car at the service centre', status: 'rejected', created_at: istIso(wd(15), '18:20'), decision_note: 'Client review in the office that day.' }),
    leaveRow('u-sanjay', { id: 'hlr-in-11', kind: 'comp_off', from_date: LAST_SATURDAY, reason: 'Saturday edit for the Kisan Agro launch film', status: 'pending', created_at: minutesAgo(22 * 60) }),
    leaveRow('u-kavya', { id: 'hlr-in-12', kind: 'comp_off', from_date: SHOOT_SATURDAY, reason: 'Assisted on the Ramoji shoot (Saturday)', status: 'approved', created_at: istIso(addDays(SHOOT_SATURDAY, 2), '10:00') }),
    // Other departments.
    leaveRow('u-imran', { id: 'hlr-in-13', kind: 'leave', leave_type_id: 'lt-cl', leave_code: 'CL', from_date: ahead(4), to_date: ahead(5), reason: 'Brother’s wedding in Nizamabad', status: 'pending', created_at: minutesAgo(9 * 60), balance_available: 6 }),
    leaveRow('u-zoya', { id: 'hlr-in-14', kind: 'leave', leave_type_id: 'lt-sl', leave_code: 'SL', from_date: wd(1), reason: 'Was down with a fever — applying after the day', status: 'pending', created_at: minutesAgo(140), balance_available: 4 }),
    leaveRow('u-pooja', { id: 'hlr-in-15', kind: 'leave', leave_type_id: 'lt-cl', leave_code: 'CL', from_date: ahead(9), reason: 'Bonalu festival at home', status: 'pending', created_at: minutesAgo(26 * 60), balance_available: 7.5 }),
    leaveRow('u-naveen', { id: 'hlr-in-16', kind: 'wfh', from_date: ahead(1), reason: 'NAS migration overnight — will watch it from home and be online all day', status: 'pending', created_at: minutesAgo(4 * 60) }),
    leaveRow('u-meera', { id: 'hlr-in-17', kind: 'wfh', from_date: wd(5), reason: 'Plumber visit at home', status: 'approved', created_at: istIso(wd(7), '17:10') }),
    leaveRow('u-farhan', { id: 'hlr-in-18', kind: 'comp_off', from_date: LAST_SATURDAY, reason: 'Saturday shoot for the Kisan Agro launch film', status: 'pending', created_at: minutesAgo(30 * 60) }),
  ],
  claims: [
    row('u-kavya', { id: 'hrc-in-01', category: 'travel', claim_date: wd(2), amount: 1240, description: 'Ola to the Gachibowli studio and back for the Kisan shoot', receipt_ref: 'OLA-CRN-48817', status: 'pending', created_at: minutesAgo(7 * 60), paid_at: null }),
    row('u-nikhil', { id: 'hrc-in-02', category: 'internet', claim_date: wd(5), amount: 999, description: 'Broadband for remote editing days (September)', receipt_ref: 'ACT-INV-20391', status: 'pending', created_at: minutesAgo(30 * 60), paid_at: null }),
    row('u-anita', { id: 'hrc-in-03', category: 'food', claim_date: wd(8), amount: 860, description: 'Dinner during the late Nimbus mix session', receipt_ref: 'SWG-77120', status: 'approved', created_at: istIso(wd(7), '10:00'), paid_at: null }),
    row('u-rahul', { id: 'hrc-in-04', category: 'phone', claim_date: wd(25), amount: 599, description: 'Postpaid bill — client calls during the Aarogya grade', receipt_ref: 'JIO-AUG-3381', status: 'paid', created_at: istIso(wd(24), '11:00'), paid_at: istIso(wd(4), '12:00') }),
    row('u-sanjay', { id: 'hrc-in-05', category: 'other', claim_date: wd(12), amount: 2500, description: 'Studio headphones', receipt_ref: 'AMZ-1189', status: 'rejected', created_at: istIso(wd(11), '16:00'), decision_note: 'Equipment goes through IT asset requests, not expense claims.' }),
    row('u-sneha', { id: 'hrc-in-06', category: 'medical', claim_date: wd(18), amount: 450, description: 'Pharmacy — first-aid kit for the shoot', receipt_ref: 'APL-5512', status: 'cancelled', created_at: istIso(wd(17), '09:00'), paid_at: null }),
    // Other departments.
    row('u-farhan', { id: 'hrc-in-07', category: 'travel', claim_date: wd(3), amount: 2150, description: 'Diesel for the generator van to Ramoji (Kisan shoot)', receipt_ref: 'HPCL-88214', status: 'pending', created_at: minutesAgo(11 * 60), paid_at: null }),
    row('u-zoya', { id: 'hrc-in-08', category: 'phone', claim_date: wd(6), amount: 799, description: 'Postpaid bill — running the Aarogya Instagram live', receipt_ref: 'AIR-SEP-5521', status: 'pending', created_at: minutesAgo(2 * 24 * 60), paid_at: null }),
    row('u-imran', { id: 'hrc-in-09', category: 'food', claim_date: wd(10), amount: 640, description: 'Crew snacks during the night lighting test', receipt_ref: 'ZMT-41120', status: 'approved', created_at: istIso(wd(9), '12:00'), paid_at: null }),
  ],
  // Salary advances (hr_payroll.js publicLoan) — HR admins only.
  loans: [
    row('u-farhan', { id: 'hln-in-01', principal: 30000, emi: 5000, start_month: addMonths(T0.slice(0, 7), 1), recovered: 0, outstanding: 30000, reason: 'Down payment for a two-wheeler to get to shoots', status: 'pending', created_at: minutesAgo(6 * 60) }),
    row('u-sneha', { id: 'hln-in-02', principal: 15000, emi: 3000, start_month: addMonths(T0.slice(0, 7), 1), recovered: 0, outstanding: 15000, reason: 'My mother’s cataract surgery', status: 'pending', created_at: minutesAgo(28 * 60) }),
    row('u-ravi', { id: 'hln-in-03', principal: 12000, emi: 4000, start_month: addMonths(T0.slice(0, 7), 2), recovered: 0, outstanding: 12000, reason: 'Hostel fees for my brother', status: 'pending', created_at: minutesAgo(3 * 24 * 60) }),
    row('u-rahul', { id: 'hln-in-04', principal: 20000, emi: 4000, start_month: addMonths(T0.slice(0, 7), -2), recovered: 8000, outstanding: 12000, reason: 'House deposit', status: 'approved', created_at: istIso(wd(55), '10:00'), decision_note: 'Approved — recovered from salary over five months.' }),
  ],
};

const STATUSES: Record<Queue, string[]> = {
  regularization: ['pending', 'approved', 'rejected', 'cancelled'],
  leave: ['pending', 'approved', 'rejected', 'cancelled'],
  claims: ['pending', 'approved', 'rejected', 'cancelled', 'paid'],
  loans: ['pending', 'approved', 'rejected', 'cancelled', 'closed'],
};

// What the persona may review: an HR admin the whole company, a department admin the departments
// they run (departments.adminId is the demo person).
const myDepartments = () => DEPARTMENTS.filter((d) => d.adminId === DEMO_USER.id).map((d) => d.id);
const inScope = (r: HrRequest) => currentPersona().hr.isHrAdmin || myDepartments().includes(String(r.department_id ?? ''));
const loanAdmin = () => currentPersona().hr.isHrAdmin && currentPersona().role !== 'master_admin';

function list(queue: Queue, q: URLSearchParams, kind?: string) {
  const status = q.get('status') ?? 'pending';
  if (!STATUSES[queue].includes(status)) return fail('Unknown status.');
  const requests = QUEUES[queue]
    .filter((r) => r.status === status && (!kind || r.kind === kind) && inScope(r))
    .map((r) => (status === 'pending' ? r : { ...r, balance_available: undefined }))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { ok: true, requests };
}

function decide(queue: Queue, id: string, body: unknown, noun = 'request') {
  const b = (body || {}) as { decision?: unknown; note?: unknown };
  if (b.decision !== 'approve' && b.decision !== 'reject') return fail('decision must be approve or reject.');
  const note = String(b.note ?? '').trim().slice(0, 500);
  if (b.decision === 'reject' && note.length < 3) return fail('Give a short reason when rejecting.');
  const r = QUEUES[queue].find((x) => x.id === id && inScope(x));
  if (!r) return fail(`${noun[0]!.toUpperCase()}${noun.slice(1)} not found.`, 404);
  if (r.status !== 'pending') return fail(`This ${noun} has already been ${r.status}.`, 409);
  // Signed with the persona's own name (not the shared demo self), so a request Afzal Manager approved
  // still says "By Afzal Manager" after switching to Afzal HR.
  Object.assign(r, { status: b.decision === 'approve' ? 'approved' : 'rejected', decided_by_name: currentPersona().label, decided_at: nowIso(), decision_note: note });
  return { ok: true, request: r };
}

export const inboxRoutes: Route[] = [
  ['GET', /^\/hr\/regularizations\/inbox$/, (_p, _b, q) => list('regularization', q)],
  ['POST', /^\/hr\/regularizations\/([^/]+)\/decide$/, ([, id], body) => decide('regularization', id!, body)],
  [
    'GET',
    /^\/hr\/leave\/inbox$/,
    (_p, _b, q) => {
      const kind = q.get('kind') || '';
      if (!['leave', 'wfh', 'comp_off'].includes(kind)) return fail('kind must be leave, wfh or comp_off.');
      return list('leave', q, kind);
    },
  ],
  ['POST', /^\/hr\/leave\/requests\/([^/]+)\/decide$/, ([, id], body) => decide('leave', id!, body)],
  ['GET', /^\/hr\/claims\/inbox$/, (_p, _b, q) => list('claims', q)],
  ['POST', /^\/hr\/claims\/([^/]+)\/decide$/, ([, id], body) => decide('claims', id!, body, 'claim')],
  // Salary advances are for HR admins only (hr_payroll.js loanAdmin).
  ['GET', /^\/hr\/loans\/inbox$/, (_p, _b, q) => (loanAdmin() ? list('loans', q) : fail('You do not have permission to review loans.', 403))],
  [
    'POST',
    /^\/hr\/loans\/([^/]+)\/decide$/,
    ([, id], body) => (loanAdmin() ? decide('loans', id!, body, 'loan request') : fail('You do not have permission to review loans.', 403)),
  ],
];
