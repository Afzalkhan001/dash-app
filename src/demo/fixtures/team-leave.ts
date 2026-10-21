// Colleagues' approved leave, laid out around the week the demo is opened in, so "Off this week" and
// "View upcoming leaves" on My team have something true to show for every persona, and "Who's in
// today" (timeline.ts teamRecord) agrees with them. Shaped like the rows GET /leaves returns
// (routes/leaves.js): an approved HR leave writes one row per working day (hr_leave.js
// writeLegacyLeaves: employee name + id, date, 'HR leave' or 'Half day (first|second)', source 'hr');
// a day marked by hand on the website carries only the name and a free-text reason.
//
// Who sees whom (their manager, peers and direct reports, fixtures/org.ts):
//   Employee      Anita (the last two working days), Sneha (today, or the next working day);
//                 Rahul in two weeks
//   Manager       Sneha this week; Rahul and Kavya coming up
//   Professional  Imran (the first two working days, marked by hand)
//   HR            Gopal this week; Farah next week
//   Admin / IT    Arvind half a day on the last working day; Vikram next week
//   App Manager / Visitor Manager  Pooja this week; Ravi in two weeks
//   Accounts      nobody (the empty state)
// Imports only demo/state and demo/config, so timeline.ts can read it without an import cycle.

import { DEMO_TENANT_ID } from '@/demo/config';
import { addDays, eachDate, isWorkingDay, mondayOf, today } from '@/demo/state';

type Plan = { id: string; name: string; dates: string[]; half?: 'first' | 'second'; byHand?: boolean; approver: string };

export type TeamLeaveRow = {
  id: string;
  employee: string;
  employeeId?: string;
  date: string;
  type: string;
  reason: string;
  markedBy: string;
  markedAt: string;
  tenantId: string;
  source?: 'hr';
  hrRequestId?: string;
};

/** The first `n` working days from `from` (inclusive). */
function workingFrom(from: string, n: number) {
  const out: string[] = [];
  let d = from;
  for (let guard = 0; out.length < n && guard < 40; guard++) {
    if (isWorkingDay(d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

function plan(t: string): Plan[] {
  const mon = mondayOf(t);
  const week = eachDate(mon, addDays(mon, 6)).filter(isWorkingDay);
  if (!week.length) return [];
  const first = week[0]!;
  const last = week[week.length - 1]!;
  const third = week[Math.min(2, week.length - 1)]!;
  const nextWorking = isWorkingDay(t) ? t : (week.find((d) => d > t) ?? first);
  return [
    { id: 'u-anita', name: 'Anita Desai', dates: week.slice(-2), approver: 'Priya Sharma' },
    { id: 'u-sneha', name: 'Sneha Iyer', dates: [nextWorking], approver: 'Priya Sharma' },
    { id: 'u-imran', name: 'Imran Shaikh', dates: week.slice(0, 2), byHand: true, approver: 'Deepa Menon' },
    { id: 'u-gopal', name: 'Gopal Krishna', dates: [third], approver: 'Lakshmi Prasad' },
    { id: 'u-arvind', name: 'Arvind Menon', dates: [last], half: 'second', approver: 'Kiran Rao' },
    { id: 'u-pooja', name: 'Pooja Rao', dates: [third], approver: 'Naveen Kumar' },
    // Coming up (after this week).
    { id: 'u-farah', name: 'Farah Siddiqui', dates: workingFrom(addDays(mon, 8), 1), approver: 'Lakshmi Prasad' },
    { id: 'u-vikram', name: 'Vikram Singh', dates: workingFrom(addDays(mon, 9), 2), approver: 'Arvind Menon' },
    { id: 'u-meera', name: 'Meera Nair', dates: workingFrom(addDays(mon, 10), 2), approver: 'Vikram Singh' },
    { id: 'u-rahul', name: 'Rahul Verma', dates: workingFrom(addDays(mon, 14), 3), approver: 'Priya Sharma' },
    { id: 'u-ravi', name: 'Ravi Teja', dates: workingFrom(addDays(mon, 15), 1), approver: 'Naveen Kumar' },
    { id: 'u-kavya', name: 'Kavya Reddy', dates: workingFrom(addDays(mon, 23), 2), approver: 'Sanjay Kumar' },
  ];
}

const compact = (ymd: string) => ymd.replace(/-/g, '');

function rowsFor(t: string): TeamLeaveRow[] {
  const markedAt = new Date(`${addDays(mondayOf(t), -5)}T10:30:00+05:30`).toISOString();
  return plan(t).flatMap((p) =>
    [...new Set(p.dates)].map((date): TeamLeaveRow => {
      if (p.byHand) {
        // Marked on the website by the manager: no user id, a free-text reason.
        return { id: `lv${compact(date)}${p.id.slice(2)}`, employee: p.name, date, type: 'casual', reason: 'Family function', markedBy: p.approver, markedAt, tenantId: DEMO_TENANT_ID };
      }
      const req = `hlr-team-${p.id.slice(2)}`;
      return {
        id: `lvhr${req.slice(-12)}${compact(date)}`,
        employee: p.name,
        employeeId: p.id,
        date,
        type: 'cl',
        reason: p.half ? `Half day (${p.half})` : 'HR leave',
        markedBy: p.approver,
        markedAt,
        tenantId: DEMO_TENANT_ID,
        source: 'hr',
        hrRequestId: req,
      };
    }),
  );
}

let cached: { day: string; rows: TeamLeaveRow[]; away: Set<string> } | null = null;

function current() {
  const t = today();
  if (!cached || cached.day !== t) {
    // Whole days off, by person id (rows marked by hand carry only the name, so read the plan).
    const away = new Set(plan(t).flatMap((p) => (p.half ? [] : p.dates.map((d) => `${p.id}|${d}`))));
    cached = { day: t, rows: rowsFor(t), away };
  }
  return cached;
}

/** Colleagues' leave rows (the demo person's own come from fixtures/leave.ts). */
export const teamLeaveRows = (): TeamLeaveRow[] => current().rows;

/** True when this colleague is on leave for the whole of `date` (a half day still comes in). */
export const onLeave = (personId: string, date: string) => current().away.has(`${personId}|${date}`);
