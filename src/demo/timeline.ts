// The demo person's working life, laid out around the day the demo starts: which past days they
// clocked in (and how), which days were leave / WFH / a weekend shoot, and today's punch. Attendance,
// timesheets, leave (comp-off) and team views all read from here, so they agree with each other.
//
// Records are shaped like hr.js shapeRow() + withPings(), with `state` from dayState():
//   'in_progress' (open today) | 'incomplete' (open, earlier day) | the closed day's status
//   ('present' ≥ 8h, 'half_day' ≥ 4h, 'short').

import type { AttendanceRow, OfficeLocation, Ping, PingState } from '@/api/attendance';
import { DEMO_USER } from '@/demo/config';
import { type Person, profile } from '@/demo/fixtures/org';
import { onLeave } from '@/demo/fixtures/team-leave';
import { clocksIn, currentPersona, onPersonaChange } from '@/demo/personas';
import {
  addDays,
  daysAgo,
  daysInMonth,
  istIso,
  isWorkingDay,
  mondayOf,
  nowMinutesIst,
  rand,
  today,
  workingDayFrom,
} from '@/demo/state';

const T0 = today();
const wd = (n: number) => workingDayFrom(T0, n); // n working days ago
const wdAhead = (n: number) => workingDayFrom(T0, -n); // n working days ahead

// Two Saturdays worked: a launch-film shoot ~6 weeks ago (already claimed as comp-off) and last
// week's (2–8 days ago, inside the 30-day claim window — so a comp-off claim can be tried).
export const LAST_SATURDAY = addDays(mondayOf(T0), -2);
export const SHOOT_SATURDAY = addDays(LAST_SATURDAY, -35);

// ── Offices ──────────────────────────────────────────────────────────────────
export const LOCATIONS: OfficeLocation[] = [
  { id: 'loc-hq', name: 'Tamada Media HQ', lat: 17.4326, lng: 78.4071, radius_m: 150, address: 'Plot 42, Road No. 36, Jubilee Hills, Hyderabad 500033' },
  { id: 'loc-studio', name: 'Gachibowli Studio', lat: 17.4401, lng: 78.3489, radius_m: 200, address: 'Unit 5, Sy. No. 115, Financial District, Gachibowli, Hyderabad 500032' },
];
const HQ = LOCATIONS[0]!;
const HOME = { lat: 17.4615, lng: 78.3647, address: 'Kondapur, Hyderabad, Telangana 500084' };
const RAMOJI = { lat: 17.2543, lng: 78.6808, address: 'Ramoji Film City, Anaspur Village, Hayathnagar, Hyderabad 501512' };

// ── Leave the demo person already has (leave.ts turns these into request rows) ──
export type LeaveSeed = {
  id: string;
  kind: 'leave' | 'wfh' | 'comp_off';
  type?: string; // leave type id
  from: string;
  to: string;
  half: 'none' | 'first' | 'second';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string;
  created: string;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
};

export const LEAVE_SEEDS: LeaveSeed[] = [
  { id: 'hlr-demo-01', kind: 'leave', type: 'lt-el', from: wdAhead(14), to: wdAhead(15), half: 'none', status: 'pending', reason: 'Sister’s engagement in Vijayawada — travelling with family', created: daysAgo(2, '11:20') },
  { id: 'hlr-demo-02', kind: 'leave', type: 'lt-cl', from: wdAhead(24), to: wdAhead(24), half: 'none', status: 'approved', reason: 'Passport renewal appointment at PSK Begumpet', created: daysAgo(6, '16:05'), decidedBy: 'Priya Sharma', decidedAt: daysAgo(5, '10:12'), note: 'Approved — please hand the Nimbus exports over to Kavya.' },
  { id: 'hlr-demo-03', kind: 'wfh', from: wd(8), to: wd(8), half: 'none', status: 'approved', reason: 'Broadband installation at home — will edit remotely', created: daysAgo(15, '18:40'), decidedBy: 'Priya Sharma', decidedAt: daysAgo(14, '09:55') },
  { id: 'hlr-demo-04', kind: 'leave', type: 'lt-cl', from: wd(20), to: wd(19), half: 'none', status: 'approved', reason: 'Cousin’s wedding in Warangal', created: daysAgo(40, '12:30'), decidedBy: 'Priya Sharma', decidedAt: daysAgo(39, '10:05') },
  { id: 'hlr-demo-05', kind: 'leave', type: 'lt-sl', from: wd(34), to: wd(34), half: 'none', status: 'approved', reason: 'Viral fever — on medication', created: daysAgo(48, '08:10'), decidedBy: 'Priya Sharma', decidedAt: daysAgo(48, '11:30'), note: 'Get well soon.' },
  { id: 'hlr-demo-06', kind: 'comp_off', from: SHOOT_SATURDAY, to: SHOOT_SATURDAY, half: 'none', status: 'approved', reason: 'Saturday shoot — Kisan Agro launch film at Ramoji Film City', created: daysAgo(40, '10:00'), decidedBy: 'Priya Sharma', decidedAt: daysAgo(39, '15:20') },
  { id: 'hlr-demo-07', kind: 'leave', type: 'lt-cl', from: wd(46), to: wd(46), half: 'second', status: 'approved', reason: 'Bank visit for home-loan documents', created: daysAgo(68, '09:45'), decidedBy: 'Priya Sharma', decidedAt: daysAgo(68, '12:00') },
  { id: 'hlr-demo-08', kind: 'wfh', from: wd(52), to: wd(52), half: 'none', status: 'rejected', reason: 'Plumbing work at home', created: daysAgo(78, '19:10'), decidedBy: 'Priya Sharma', decidedAt: daysAgo(77, '09:40'), note: 'Client colour review in the office that day — please pick another day.' },
  { id: 'hlr-demo-09', kind: 'leave', type: 'lt-cl', from: wd(40), to: wd(40), half: 'none', status: 'cancelled', reason: 'Personal work', created: daysAgo(60, '14:00') },
];

function approvedLeaveOn(date: string) {
  return LEAVE_SEEDS.find((l) => l.status === 'approved' && l.kind !== 'comp_off' && l.from <= date && l.to >= date);
}

// Days the demo person's regularization requests are about (attendance.ts builds the requests).
export const REG_DAYS = { pending: wd(3), rejected: wd(12), cancelled: wd(16), approved: wd(22) };

// ── Records ──────────────────────────────────────────────────────────────────
type Where = { lat: number; lng: number; address?: string };

function classify(worked: number) {
  if (worked >= 480) return 'present';
  if (worked >= 240) return 'half_day';
  return 'short';
}

function pingsFor(id: string, inAt: string, worked: number, at: Where): Ping[] {
  const inMs = Date.parse(inAt);
  const n = Math.min(9, Math.floor(worked / 60));
  return Array.from({ length: n }, (_, i) => ({
    slot: i + 1,
    at: new Date(inMs + (i + 1) * 3600000 + Math.floor(rand(`${id}p${i}`) * 240) * 1000).toISOString(),
    lat: Number((at.lat + (rand(`${id}a${i}`) - 0.5) * 0.0004).toFixed(6)),
    lng: Number((at.lng + (rand(`${id}b${i}`) - 0.5) * 0.0004).toFixed(6)),
    accuracy_m: 8 + Math.floor(rand(`${id}c${i}`) * 25),
  }));
}

export type RecordInput = {
  id: string;
  who: Pick<Person, 'id' | 'name'>;
  departmentId: string | null;
  date: string;
  inMin: number;
  outMin: number | null; // null = still clocked in
  mode: 'office' | 'remote';
  at?: Where;
  outMode?: string;
  regularized?: boolean;
};

export function buildRecord(r: RecordInput): AttendanceRow {
  const office = r.mode === 'office';
  const at = r.at ?? (office ? HQ : HOME);
  const inAt = istIso(r.date, r.inMin);
  const outAt = r.outMin == null ? null : istIso(r.date, r.outMin);
  const worked = r.outMin == null ? null : Math.max(0, r.outMin - r.inMin);
  const status = worked == null ? null : classify(worked);
  const state = outAt ? status ?? 'present' : r.date < today() ? 'incomplete' : 'in_progress';
  const dist = office ? 12 + Math.floor(rand(`${r.id}d`) * 40) : 4200 + Math.floor(rand(`${r.id}d`) * 900);
  const outMode = outAt ? r.outMode ?? r.mode : null;
  const geo = { lat: Number((at.lat + (rand(`${r.id}x`) - 0.5) * 0.0003).toFixed(6)), lng: Number((at.lng + (rand(`${r.id}y`) - 0.5) * 0.0003).toFixed(6)) };
  return {
    id: r.id,
    employee_id: r.who.id,
    employee_name: r.who.name,
    department_id: r.departmentId,
    work_date: r.date,
    state,
    in_at: inAt,
    in_mode: r.mode,
    in_within_fence: office,
    in_distance_m: dist,
    in_address: at.address ?? '',
    in_lat: geo.lat,
    in_lng: geo.lng,
    out_at: outAt,
    out_mode: outMode,
    out_within_fence: outAt ? outMode === 'office' : null,
    out_distance_m: outAt && outMode !== 'regularized' ? dist + 4 : null,
    out_address: outAt && outMode !== 'regularized' ? at.address ?? '' : '',
    out_lat: outAt && outMode !== 'regularized' ? geo.lat : null,
    out_lng: outAt && outMode !== 'regularized' ? geo.lng : null,
    worked_minutes: worked,
    status,
    late: r.inMin > 9 * 60 + 45, // 09:30 shift start + 15 min grace
    early_out: r.outMin != null && r.outMin < 18 * 60 + 30,
    regularized: !!r.regularized,
    in_remote: !office,
    pings: !office && worked != null ? pingsFor(r.id, inAt, worked, at) : [],
  };
}

// ── Today's punch (clock-in / clock-out change it) ───────────────────────────
export const punch: { record: AttendanceRow | null } = { record: null };

// hr.js pingState(): hourly check-ins while clocked in remotely, up to 9 hours.
export function pingStateOf(rec: AttendanceRow | null): PingState {
  const none: PingState = { active: false, nextDueAt: null, windowEndsAt: null, lastSlot: 0 };
  if (!rec || rec.out_at || rec.in_mode !== 'remote') return none;
  const inMs = Date.parse(rec.in_at);
  const pings = rec.pings ?? [];
  const lastSlot = pings.reduce((m, p) => Math.max(m, p.slot), 0);
  const windowEnds = inMs + (9 * 60 + 5) * 60000;
  if (Date.now() > windowEnds || lastSlot >= 9) return { ...none, lastSlot, windowEndsAt: new Date(windowEnds).toISOString() };
  return { active: true, nextDueAt: new Date(inMs + (lastSlot + 1) * 3600000).toISOString(), windowEndsAt: new Date(windowEnds).toISOString(), lastSlot, recorded: pings.length };
}

// ── The demo person's past days ──────────────────────────────────────────────
const JOINED = String(DEMO_USER.dateJoined || '2022-06-13');
const SPECIAL = new Set([...Object.values(REG_DAYS), LAST_SATURDAY, SHOOT_SATURDAY]);
const RECENT = wd(10);

// A few unexplained absences, never in the last two weeks and never on a day something else is about.
const isAbsent = (date: string) => date < RECENT && !SPECIAL.has(date) && rand(`${date}abs`) < 0.03;

const cache = new Map<string, AttendanceRow | null>();
// A new role is a new department on every past day (and today's punch was someone else's).
onPersonaChange(() => {
  cache.clear();
  punch.record = null;
});

function pastRecord(date: string): AttendanceRow | null {
  if (date < JOINED) return null;
  const me = { id: profile.id, name: String(DEMO_USER.name) };
  const base = { id: `ha-demo-${date}`, who: me, departmentId: String(profile.departmentId || ''), date };
  if (date === LAST_SATURDAY || date === SHOOT_SATURDAY) {
    // Outdoor shoot days: clocked in on location.
    return buildRecord({ ...base, inMin: 7 * 60 + 40, outMin: 18 * 60 + 10 + Math.floor(rand(`${date}s`) * 30), mode: 'office', at: date === SHOOT_SATURDAY ? RAMOJI : HQ });
  }
  if (!isWorkingDay(date)) return null;
  const leave = approvedLeaveOn(date);
  if (leave && leave.kind === 'leave' && leave.half === 'none') return null;
  if (isAbsent(date)) return null;

  if (date === REG_DAYS.approved) {
    // Forgot to clock out after a late export; the approved regularization set the clock-out.
    return buildRecord({ ...base, inMin: 9 * 60 + 41, outMin: 20 * 60 + 10, mode: 'office', outMode: 'regularized', regularized: true });
  }
  if (date === REG_DAYS.pending) return buildRecord({ ...base, inMin: 10 * 60 + 7, outMin: 19 * 60 + 22, mode: 'office' });
  if (date === REG_DAYS.rejected) return buildRecord({ ...base, inMin: 9 * 60 + 30, outMin: 17 * 60 + 12, mode: 'office' });
  if (leave && leave.kind === 'leave') {
    // Half-day leave: worked the other half.
    return leave.half === 'second'
      ? buildRecord({ ...base, inMin: 9 * 60 + 22, outMin: 13 * 60 + 55, mode: 'office' })
      : buildRecord({ ...base, inMin: 13 * 60 + 50, outMin: 18 * 60 + 40, mode: 'office' });
  }
  const remote = (leave && leave.kind === 'wfh') || rand(`${date}r`) < 0.12;
  const inMin = 9 * 60 + 14 + Math.floor(rand(`${date}i`) * 42);
  const outMin = 18 * 60 + 25 + Math.floor(rand(`${date}o`) * 80);
  return buildRecord({ ...base, inMin, outMin, mode: remote ? 'remote' : 'office' });
}

// One day of the demo person's attendance (today's comes from the live punch). Roles that never
// clock in (system roles, the visitor desk, the display, the master admin) have none.
export function myRecord(date: string): AttendanceRow | null {
  if (!clocksIn(currentPersona())) return null;
  const t = today();
  if (date === t) return punch.record && punch.record.work_date === t ? punch.record : null;
  if (date > t) return null;
  if (!cache.has(date)) cache.set(date, pastRecord(date));
  return cache.get(date) ?? null;
}

export function myMonth(month: string): AttendanceRow[] {
  const out: AttendanceRow[] = [];
  const days = daysInMonth(month);
  for (let d = 1; d <= days; d++) {
    const r = myRecord(`${month}-${String(d).padStart(2, '0')}`);
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.work_date.localeCompare(a.work_date));
}

// What a day's attendance counts for (timesheets): closed minutes, or minutes so far today.
export function attendanceMinutes(r: AttendanceRow | null) {
  if (!r) return 0;
  if (r.out_at) return r.worked_minutes ?? 0;
  return Math.max(0, Math.floor((Date.now() - Date.parse(r.in_at)) / 60000));
}

// ── A teammate's day (team attendance) ───────────────────────────────────────
export function teamRecord(p: Person, date: string): AttendanceRow | null {
  const t = today();
  if (date > t || !isWorkingDay(date) || date < String(p.dateJoined || '')) return null;
  // On approved leave (fixtures/team-leave.ts), so "Who's in today" agrees with My team's "Off this week".
  if (onLeave(p.id, date)) return null;
  if (rand(`${p.id}${date}abs`) < 0.06) return null;
  const inMin = 9 * 60 + 5 + Math.floor(rand(`${p.id}${date}i`) * 55);
  let outMin: number | null = 18 * 60 + 20 + Math.floor(rand(`${p.id}${date}o`) * 90);
  if (date === t) {
    const now = nowMinutesIst();
    if (now < inMin) return null; // not in yet
    if (now < outMin) outMin = null; // still working
  }
  const mode = rand(`${p.id}${date}r`) < 0.15 ? 'remote' : 'office';
  return buildRecord({ id: `ha-${p.id}-${date}`, who: p, departmentId: String(p.departmentId || ''), date, inMin, outMin, mode });
}
