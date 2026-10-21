// My team (the owner's reference: Keka's "My Team" tab) — where I sit in the company, worked out only
// from what the app already reads, so nobody sees more than the server already gives them:
//   GET /org/directory   the reporting lines (features/people/org-tree: the website's own chart rules)
//   GET /users/:id       my own record (my manager, my department) — also for the console roles (HR,
//                        Super Admin, Accounts, IT Admin, App Manager, Visitor Manager) that are not
//                        in the directory, so their manager and peers still show (org-tree placeOf)
//   GET /departments     department names; GET /hr/me the departments I run
//   GET /leaves          who is off which day (api/people useLeaveDays) — never the type or reason
//
// Privacy: only CEO / COO / Super Admin / HR (orgSeesAll) get everyone's department from the server,
// so only they get a real department count and the department page. Everyone else sees their own
// department's name with the size of their own team (manager + peers + direct reports + me), and the
// card opens the org chart on their manager instead — the app never works out who sits where.
//
// The platform owner (master_admin: every company) and the shared TV login (announcement_viewer) are
// not a person on a team: they get the search and the company links only, and /leaves is never asked.
// Render stays pure: today comes from useTodayIst().

import { useHrMe, useMyProfile } from '@/api/me';
import { type Department, deptName, type DirectoryPerson, type LeaveDay, useDepartments, useLeaveDays } from '@/api/people';
import { type StaffUser, useSession } from '@/auth/session';
import { addDays, mondayOf, WEEKDAYS, weekdayOf } from '@/features/attendance/format';
import { useTodayIst } from '@/features/attendance/use-now';
import { useOrgTree } from '@/features/people/directory';
import { type OrgNode, type OrgPlace, placeOf, type ReportingFields } from '@/features/people/org-tree';
import { dateLabel } from '@/lib/dates';
import { days as dayCount } from '@/lib/format';

/** Logins that are not a person on a team: the platform owner and the office TV. */
const NO_TEAM_ROLES = ['master_admin', 'announcement_viewer'];
export const hasTeam = (role?: string | null) => !!role && !NO_TEAM_ROLES.includes(role);

/** "View upcoming leaves" covers this many days after this week. */
export const UPCOMING_DAYS = 30;

const EMPTY_PLACE: OrgPlace = { onChart: false, manager: null, peers: [], reports: [] };
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

// ── Departments ──────────────────────────────────────────────────────────────

export type DeptRef = { id: string; name: string };

/** A department as stored on a record (an id, or a name on old rows) → its id and name; null when unknown. */
export function resolveDept(raw: unknown, list: Department[] | undefined): DeptRef | null {
  const v = str(raw);
  if (!v) return null;
  const hit = (Array.isArray(list) ? list : []).find((d) => d.id === v || norm(d.name) === norm(v));
  if (hit) return { id: hit.id, name: hit.name || v };
  const name = deptName(v, list); // '' for an id that matches nothing
  return name ? { id: v, name } : null;
}

/** Whether a stored department value (id or name) is this department. */
export function inDept(raw: unknown, d: DeptRef, list: Department[] | undefined) {
  const v = str(raw);
  if (!v) return false;
  return v === d.id || norm(v) === norm(d.name) || norm(deptName(v, list)) === norm(d.name);
}

export type TeamDept = {
  key: string;
  id: string;
  name: string;
  /** How many people the card counts. */
  count: number;
  /** 'department': everyone in it (HR and leadership only). 'team': my manager, peers, reports and me. */
  scope: 'department' | 'team';
  href: string;
};

// ── Leave ────────────────────────────────────────────────────────────────────

export type OffDay = { date: string; half: boolean };
export type OffPerson = { person: OrgNode; days: OffDay[]; label: string; spoken: string; today: boolean };
export type UpcomingLeave = { key: string; person: OrgNode; from: string; to: string; label: string; amount: string; spoken: string };

/**
 * Each of these people's days off, one entry per day: an HR-approved row is matched by user id, a row
 * marked by hand on the website (name only) by the exact name, when no one else in the company
 * (`everyone`, the directory) has that name. A day is a half day only while every row for it says so.
 */
export function leaveByPerson(people: OrgNode[], leave: LeaveDay[] | undefined, everyone?: OrgNode[]): Map<string, OffDay[]> {
  const ids = new Map<string, OrgNode>();
  for (const p of Array.isArray(people) ? people : []) {
    if (!p || p.id == null || p.ghost || p.pending) continue;
    ids.set(String(p.id), p);
  }
  // A shared name is no answer: counted over the whole company, not just my team, so a namesake's
  // day off is never put on my teammate.
  const names = new Map<string, OrgNode | null>();
  for (const p of [...(Array.isArray(everyone) ? everyone : []), ...ids.values()]) {
    if (!p || p.id == null || p.ghost) continue;
    const n = norm(p.name);
    if (!n) continue;
    const had = names.get(n);
    if (had === undefined) names.set(n, p);
    else if (had && String(had.id) !== String(p.id)) names.set(n, null);
  }
  const days = new Map<string, Map<string, boolean>>();
  for (const l of Array.isArray(leave) ? leave : []) {
    if (!l || !l.date) continue;
    const hit = l.employeeId ? ids.get(l.employeeId) : (names.get(norm(l.employee)) ?? undefined);
    const who = hit ? ids.get(String(hit.id)) : undefined;
    if (!who) continue;
    const id = String(who.id);
    let m = days.get(id);
    if (!m) {
      m = new Map();
      days.set(id, m);
    }
    m.set(l.date, (m.get(l.date) ?? true) && !!l.half);
  }
  const out = new Map<string, OffDay[]>();
  for (const [id, m] of days) {
    out.set(
      id,
      [...m.entries()].map(([date, half]) => ({ date, half })).sort((a, b) => a.date.localeCompare(b.date)),
    );
  }
  return out;
}

const dayWord = (date: string, today: string) => (date === today ? 'Today' : (WEEKDAYS[weekdayOf(date)] ?? date));

/** "Thu–Fri", "Mon, Wed", "Today", "Fri (half)": short enough for a 96 dp tile. */
export function weekDaysLabel(list: OffDay[], today: string) {
  if (!list.length) return '';
  const runs: OffDay[][] = [];
  for (const d of list) {
    const run = runs[runs.length - 1];
    if (run && addDays(run[run.length - 1]!.date, 1) === d.date) run.push(d);
    else runs.push([d]);
  }
  const text = runs
    .map((r) => (r.length === 1 ? dayWord(r[0]!.date, today) : `${dayWord(r[0]!.date, today)}–${dayWord(r[r.length - 1]!.date, today)}`))
    .join(', ');
  return list.length === 1 && list[0]!.half ? `${text} (half)` : text;
}

const joinAnd = (parts: string[]) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** Who among these people is off at some point in this Monday–Sunday week (today first, then what is still to come). */
export function offThisWeek(people: OrgNode[], byPerson: Map<string, OffDay[]>, today: string): OffPerson[] {
  const mon = mondayOf(today);
  const sun = addDays(mon, 6);
  const out: OffPerson[] = [];
  for (const p of people) {
    const list = (byPerson.get(String(p.id)) ?? []).filter((d) => d.date >= mon && d.date <= sun);
    if (!list.length) continue;
    const name = p.name || 'Unnamed';
    const spokenDays = list.map((d) => `${d.date === today ? 'today' : dateLabel(d.date, today)}${d.half ? ', half day' : ''}`);
    out.push({ person: p, days: list, label: weekDaysLabel(list, today), spoken: `${name}, off ${joinAnd(spokenDays)}`, today: list.some((d) => d.date === today) });
  }
  const rank = (o: OffPerson) => (o.today ? 0 : o.days.some((d) => d.date > today) ? 1 : 2);
  const next = (o: OffPerson) => o.days.find((d) => d.date >= today)?.date ?? o.days[0]!.date;
  return out.sort((a, b) => rank(a) - rank(b) || next(a).localeCompare(next(b)) || String(a.person.name).localeCompare(String(b.person.name)));
}

const isWeekend = (ymd: string) => {
  const wd = weekdayOf(ymd);
  return wd === 0 || wd === 6;
};
/** Two leave days belong to one stretch when nothing but a weekend lies between them. */
function sameStretch(prev: string, next: string) {
  if (addDays(prev, 4) < next) return false; // more than a weekend apart
  let d = addDays(prev, 1);
  while (d < next) {
    if (!isWeekend(d)) return false;
    d = addDays(d, 1);
  }
  return true;
}

/** Leave in the UPCOMING_DAYS after this week, one row per stretch of days, soonest first. */
export function upcomingLeave(people: OrgNode[], byPerson: Map<string, OffDay[]>, today: string): UpcomingLeave[] {
  const from = addDays(mondayOf(today), 7);
  const to = addDays(from, UPCOMING_DAYS - 1);
  const out: UpcomingLeave[] = [];
  for (const p of people) {
    const list = (byPerson.get(String(p.id)) ?? []).filter((d) => d.date >= from && d.date <= to);
    const stretches: OffDay[][] = [];
    for (const d of list) {
      const run = stretches[stretches.length - 1];
      if (run && sameStretch(run[run.length - 1]!.date, d.date)) run.push(d);
      else stretches.push([d]);
    }
    for (const run of stretches) {
      const a = run[0]!.date;
      const b = run[run.length - 1]!.date;
      const n = run.reduce((sum, d) => sum + (d.half ? 0.5 : 1), 0);
      const label = a === b ? dateLabel(a, today) : `${dateLabel(a, today)} – ${dateLabel(b, today)}`;
      const amount = n === 0.5 ? 'Half day' : dayCount(n);
      out.push({ key: `${p.id}|${a}`, person: p, from: a, to: b, label, amount, spoken: `${p.name || 'Unnamed'}, off ${a === b ? dateLabel(a, today) : `from ${dateLabel(a, today)} to ${dateLabel(b, today)}`}, ${amount}` });
    }
  }
  return out.sort((x, y) => x.from.localeCompare(y.from) || String(x.person.name).localeCompare(String(y.person.name)));
}

// ── Teammates ────────────────────────────────────────────────────────────────

export type TeamGroup = 'manager' | 'peers' | 'reports';
export type TeamFilter = 'all' | TeamGroup;

/** Rows of the My team list (FlashList): group labels, people (one card per group) and notes. */
export type TeamRow =
  | { kind: 'label'; key: string; title: string; first: boolean }
  | { kind: 'person'; key: string; person: OrgNode; first: boolean; last: boolean; note?: string | null }
  | { kind: 'note'; key: string; text: string; first: boolean };

export const groupTitle = (g: TeamGroup, n: number) => (g === 'manager' ? 'Manager' : g === 'peers' ? `Peers (${n})` : `Direct reports (${n})`);

/** The teammates list, filtered by the chosen chip. `noManager` is the muted line shown when there is no manager on file. */
export function teammateRows(place: OrgPlace, filter: TeamFilter, noManager: string | null): TeamRow[] {
  const rows: TeamRow[] = [];
  const groups: [TeamGroup, OrgNode[]][] = [
    ['manager', place.manager ? [place.manager] : []],
    ['peers', place.peers],
    ['reports', place.reports],
  ];
  if (!place.manager && noManager && filter === 'all') rows.push({ kind: 'note', key: 'no-manager', text: noManager, first: true });
  for (const [g, list] of groups) {
    if (!list.length || (filter !== 'all' && filter !== g)) continue;
    rows.push({ kind: 'label', key: `label-${g}`, title: groupTitle(g, list.length), first: rows.length === 0 });
    list.forEach((p, i) =>
      rows.push({
        kind: 'person',
        key: `${g}-${p.id}`,
        person: p,
        first: i === 0,
        last: i === list.length - 1,
        note: p.ghost ? 'Not in the directory' : null,
      }),
    );
  }
  return rows;
}

// ── The hook ─────────────────────────────────────────────────────────────────

export type MyTeam = ReturnType<typeof useMyTeam>;

export function useMyTeam() {
  const user = useSession((s) => s.user);
  const role = user?.role ?? '';
  const teamOn = hasTeam(role);
  const profile = useMyProfile();
  const hrQ = useHrMe();
  const org = useOrgTree();
  const departments = useDepartments(teamOn);
  const leaveQ = useLeaveDays(teamOn);
  const today = useTodayIst();

  const rec = (profile.data ?? user) as StaffUser | null;
  const me: ReportingFields | null =
    rec && rec.id
      ? {
          id: String(rec.id),
          name: str(rec.name) || undefined,
          reportingTo: str(rec.reportingTo) || null,
          reportingManager: str(rec.reportingManager) || undefined,
          reportingToName: str(rec.reportingToName) || undefined,
        }
      : null;
  const place = teamOn && me ? placeOf(org.tree, me) : EMPTY_PLACE;
  const manager = place.manager && !place.manager.ghost ? place.manager : null;
  // Everyone around me who is a real directory row, once each (manager, peers, then reports).
  const seen = new Set<string>();
  const circle = [...(manager ? [manager] : []), ...place.peers, ...place.reports].filter((p) => {
    const k = String(p.id);
    if (seen.has(k) || p.ghost) return false;
    seen.add(k);
    return true;
  });

  // ── Department card ──
  const deptList = Array.isArray(departments.data) ? departments.data : undefined;
  const roster: DirectoryPerson[] = Array.isArray(org.roster) ? org.roster : [];
  const depts: TeamDept[] = [];
  if (teamOn && deptList && me) {
    const own = resolveDept(rec?.departmentId, deptList) ?? resolveDept(rec?.dept, deptList);
    const admins: unknown = hrQ.data?.adminsDepts;
    const runs = (Array.isArray(admins) ? admins : []).map((id) => resolveDept(id, deptList));
    const mine: DeptRef[] = [];
    for (const d of [own, ...runs]) if (d && !mine.some((x) => x.id === d.id)) mine.push(d);
    if (org.full) {
      for (const d of mine) {
        const members = roster.filter((u) => inDept(u.dept, d, deptList));
        const meToo = own?.id === d.id && !members.some((u) => String(u.id) === me.id) ? 1 : 0;
        depts.push({ key: d.id, id: d.id, name: d.name, count: members.length + meToo, scope: 'department', href: `/team/department?id=${encodeURIComponent(d.id)}` });
      }
    } else if (mine[0]) {
      // Restricted viewers: the server hides who is in which department, so the card counts my own
      // team and opens the chart on my manager (or on me, at the top of a branch).
      const d = mine[0];
      const focus = manager?.id ?? (place.onChart ? me.id : null);
      depts.push({ key: d.id, id: d.id, name: d.name, count: circle.length + 1, scope: 'team', href: focus ? `/people/org?focus=${encodeURIComponent(focus)}` : '/people/org' });
    }
  }

  // ── Off this week / upcoming ──
  const byPerson = leaveByPerson(circle, leaveQ.data, roster);
  const monday = mondayOf(today);
  const leave = {
    // Nothing to show without teammates; a failure hides the section rather than blocking the screen.
    show: teamOn && circle.length > 0 && !leaveQ.isError,
    loading: leaveQ.isPending,
    week: offThisWeek(circle, byPerson, today),
    upcoming: upcomingLeave(circle, byPerson, today),
    monday,
    sunday: addDays(monday, 6),
  };

  // No manager on file: a muted line, worded for who can fix it (not for the head of the company).
  const noManager = !teamOn || role === 'ceo' || role === 'coo' ? null : org.full ? 'No reporting manager on file yet. Add one on the DASH website.' : 'No reporting manager on your record yet.';

  const refetch = () =>
    Promise.all([org.refetch(), profile.refetch(), hrQ.refetch(), teamOn ? departments.refetch() : null, teamOn ? leaveQ.refetch() : null]);

  return { role, teamOn, full: org.full, today, me, rec, org, roster, deptList, place, manager, circle, depts, leave, noManager, refetch };
}
