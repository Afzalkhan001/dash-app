// Directory rules, ported from the web's Org screens (dash.html ~L9300-9720) so both clients list,
// search and label people the same way. The server (routes/users.js /org/directory) is what
// withholds restricted fields; these rules only decide what the screens try to draw.

import { useMemo } from 'react';

import { deptName, type Department, type DirectoryPerson, useDirectory } from '@/api/people';
import { useSession } from '@/auth/session';
import { buildOrgTree, type OrgTree } from '@/features/people/org-tree';
import { dateLabel } from '@/features/visitors/format';
import { ROLE_LABEL } from '@/lib/access';

// Who gets the whole record (mirrors ORG_FULL_VIEW_ROLES in routes/users.js).
export const ORG_FULL_VIEW_ROLES = ['super_admin', 'ceo', 'coo', 'hr'];
export const orgSeesAll = (role?: string | null) => !!role && (ORG_FULL_VIEW_ROLES.includes(role) || role === 'master_admin');

// A login, not a person: shared mailboxes and console roles are in neither the directory nor the
// chart. 'admin' is deliberately absent — real managers hold it.
const ORG_NON_STAFF_ROLES = ['master_admin', 'super_admin', 'accounts', 'hr', 'it_admin', 'app_manager', 'announcement_viewer', 'visitor_manager'];
export const orgIsStaff = (u?: { role?: string } | null) => !ORG_NON_STAFF_ROLES.includes(String(u?.role || '').trim());
export const orgIsActive = (u?: DirectoryPerson | null) =>
  !!u && u.role !== 'master_admin' && String(u.resigned) !== 'true' && u.status !== 'inactive';

// Blood group is recorded as 'O+ (O Positive)', a bare 'O+', or 'Not Available'. Reduced to a code
// or nothing. The same function reads the search box, so 'B+' never matches 'AB+'.
const BLOOD_RE = /^(A1B|A2B|A1|A2|AB|A|B|O)\s*(\+|-|P(?:OS(?:ITIVE)?)?|N(?:EG(?:ATIVE)?)?)$/i;
export function bloodCode(v?: string | null) {
  const head = String(v || '').split('(')[0]!.trim().replace(/\s+/g, ' ');
  const m = head ? BLOOD_RE.exec(head) : null;
  return m ? m[1]!.toUpperCase() + (/^[+p]/i.test(m[2]!) ? '+' : '-') : '';
}

const MONTH_MS = 1000 * 60 * 60 * 24 * 30.44;

// `now` (ms) lets a screen pass the ticking value from useNow() so render stays pure; without it the
// clock is read here (fine in effects and event handlers).
function tenureParts(d?: string | null, now?: number) {
  const t = Date.parse(String(d || ''));
  const at = Number.isFinite(now) ? (now as number) : Date.now();
  if (!Number.isFinite(t) || t > at) return null;
  const months = Math.max(0, Math.floor((at - t) / MONTH_MS));
  return { y: Math.floor(months / 12), m: months % 12 };
}

// Time at this company from the joining date, in words: '4 years here', '5 months here', or ''
// in the first month (the joining date says enough). Not a career total.
export function tenureHere(d?: string | null, now?: number) {
  const p = tenureParts(d, now);
  if (!p) return '';
  if (p.y >= 1) return `${p.y} ${p.y === 1 ? 'year' : 'years'} here`;
  if (p.m >= 1) return `${p.m} ${p.m === 1 ? 'month' : 'months'} here`;
  return '';
}

// "Tamada" from "Tamada Media Pvt Ltd" — short enough for a chip.
export function companyShortName(name?: unknown) {
  const first = String(name || '').trim().split(/\s+/)[0];
  return first || 'the company';
}

export function personTitle(u?: { jobTitle?: string; jobRole?: string; role?: string } | null) {
  if (!u) return '';
  return u.jobTitle || u.jobRole || (u.role ? ROLE_LABEL[u.role] || u.role : '') || '';
}

export const personPhone = (u?: { mobile?: string; phone?: string } | null) => String(u?.mobile || u?.phone || '').trim();

// Joining date the app's one way: 'Fri, 12 Mar 2021' (the year only outside this year). Stored as
// YYYY-MM-DD or ISO; read as a calendar date. Pass `today` (useTodayIst()) from render.
export function joinedLabel(d?: string | null, today?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  if (!m) return '';
  const label = dateLabel(`${m[1]}-${m[2]}-${m[3]}`, today);
  return label === '—' ? '' : label;
}

// The directory as OrgHub splits it (dash.html ~L9733): active staff with an account, and roster
// rows of staff who have not signed up yet. Both are listed; the chart treats pending as extras.
export function splitDirectory(rows: DirectoryPerson[]) {
  const all = (Array.isArray(rows) ? rows : []).filter((p) => p && typeof p === 'object');
  const people = all.filter((p) => !p.pending && orgIsActive(p) && orgIsStaff(p));
  const pending = all.filter((p) => p.pending && orgIsStaff(p));
  return { people, pending, roster: people.concat(pending) };
}

// OrgDirectoryView's search (dash.html ~L9658): a query that reads as a blood group searches only
// that; otherwise free text over the fields this viewer is allowed to see. Sorted by name.
export function searchDirectory(
  roster: DirectoryPerson[],
  q: string,
  dept: string,
  full: boolean,
  departments: Department[] | undefined,
) {
  const needle = String(q || '').trim().toLowerCase();
  const bq = bloodCode(q);
  const depts = Array.isArray(departments) ? departments : undefined;
  return (Array.isArray(roster) ? roster : [])
    .filter((u) => {
      if (full && dept && String(u.dept || '') !== dept) return false;
      if (bq) return bloodCode(u.bloodGroup) === bq;
      if (!needle) return true;
      const fields = full
        ? [u.name, u.email, u.jobTitle, u.employeeNumber, u.kekaCode, u.location, deptName(u.dept, depts), u.reportingManager, u.mobile, u.phone]
        : [u.name, u.email, u.jobTitle, u.reportingManager, u.mobile, u.phone];
      return fields.some((v) => String(v || '').toLowerCase().includes(needle));
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

// Department filter options: only for full viewers (offering to narrow by a hidden column would
// leak exactly what hiding it withheld).
export function departmentOptions(roster: DirectoryPerson[], departments: Department[] | undefined) {
  const list = Array.isArray(roster) ? roster : [];
  const depts = Array.isArray(departments) ? departments : undefined;
  return [...new Set(list.map((u) => u.dept).filter((d): d is string => typeof d === 'string' && !!d))]
    .map((id) => ({ id, name: deptName(id, depts) || id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function usePeople(enabled = true) {
  const q = useDirectory(enabled);
  const role = useSession((s) => s.user?.role);
  const split = useMemo(() => splitDirectory(Array.isArray(q.data) ? q.data : []), [q.data]);
  return { ...q, ...split, full: orgSeesAll(role) };
}

// One tree per directory payload, shared by every screen that needs it.
const treeCache = new WeakMap<DirectoryPerson[], OrgTree>();
const EMPTY: DirectoryPerson[] = [];

export function useOrgTree() {
  const p = usePeople();
  const data = p.data;
  const tree = useMemo(() => {
    const key = Array.isArray(data) ? data : EMPTY;
    let t = treeCache.get(key);
    if (!t) {
      t = buildOrgTree(p.people, p.pending);
      treeCache.set(key, t);
    }
    return t;
  }, [data, p.people, p.pending]);
  return { ...p, tree };
}
