// Employee roster and departments — pure helpers shared by the admin/people screens (search, status,
// counts, department lookup, the held-asset and duplicate checks). Ported from EmpRoster
// (dash.html:5491-5997) and DeptBrowserView (:6687-6841); no fetching, no clock.

import type { AdminDepartment, HeldAsset, RosterRecord } from '@/api/people';
import type { PickPerson } from '@/features/shared/person-picker';
import { ROLE_LABEL } from '@/lib/access';
import { isSystemAccount, MEMBER_ROLES } from '@/features/people/access';

export type RosterStatus = 'active' | 'invited' | 'resigned';
export type StatusFilter = '' | RosterStatus;

/** dash.html:5893: Resigned wins, then Invited (not signed up), else Active. */
export const statusOf = (r: Pick<RosterRecord, 'resigned' | 'invited'>): RosterStatus => (r.resigned ? 'resigned' : r.invited ? 'invited' : 'active');

export const STATUS_LABEL: Record<RosterStatus, string> = { active: 'Active', invited: 'Not signed up', resigned: 'Resigned' };

export const roleLabel = (role: string | null | undefined) => ROLE_LABEL[String(role || '')] || String(role || '') || 'Employee';

/** The department a row belongs to: by id, else by name (legacy rows store the name). */
export function deptOf(dept: string | null | undefined, depts: AdminDepartment[] | undefined) {
  const v = String(dept || '').trim();
  if (!v) return null;
  const list = Array.isArray(depts) ? depts : [];
  return list.find((d) => d.id === v) ?? list.find((d) => d.name.toLowerCase() === v.toLowerCase()) ?? null;
}

/** The department's name for display ("" for an id that matches nothing). */
export function deptLabel(dept: string | null | undefined, depts: AdminDepartment[] | undefined) {
  const d = deptOf(dept, depts);
  if (d) return d.name;
  const v = String(dept || '').trim();
  return /^[du]\d/.test(v) ? '' : v;
}

export const inDept = (row: Pick<RosterRecord, 'dept'>, d: AdminDepartment) => {
  const v = String(row.dept || '').trim();
  return !!v && (v === d.id || v.toLowerCase() === d.name.toLowerCase());
};

/** dash.html:5786 — search (name, email, employee no.) and department; the status filter is separate. */
export function scopeRoster(rows: RosterRecord[], q: string, deptId: string, depts: AdminDepartment[] | undefined) {
  const needle = q.trim().toLowerCase();
  const d = deptId ? (Array.isArray(depts) ? depts : []).find((x) => x.id === deptId) : null;
  return rows.filter((u) => {
    const ms = !needle || u.name.toLowerCase().includes(needle) || u.email.includes(needle) || u.employeeNumber.toLowerCase().includes(needle);
    const md = !deptId || (d ? inDept(u, d) : u.dept === deptId);
    return ms && md;
  });
}

/** The KPI counts over the searched scope (dash.html:5820): they track search + department. */
export function rosterCounts(scope: RosterRecord[]) {
  let active = 0;
  let invited = 0;
  let resigned = 0;
  for (const r of scope) {
    const st = statusOf(r);
    if (st === 'active') active += 1;
    else if (st === 'invited') invited += 1;
    else resigned += 1;
  }
  return { total: scope.length, active, invited, resigned };
}

export const byStatus = (scope: RosterRecord[], status: StatusFilter) =>
  (status ? scope.filter((r) => statusOf(r) === status) : scope).slice().sort((a, b) => a.name.localeCompare(b.name));

/** empAssignedAssets (dash.html:5713): by the assignee's name, or their employee number. */
export function heldAssets(row: Pick<RosterRecord, 'name' | 'employeeNumber'>, assets: HeldAsset[] | undefined) {
  const empNo = row.employeeNumber;
  return (Array.isArray(assets) ? assets : []).filter((a) => a.assignedTo === row.name || (!!empNo && a.assignedToEmpNo === empNo));
}

/** saveEmp's match (dash.html:5648): the same employee number or email on anyone already listed. */
export function findDuplicate(rows: RosterRecord[], email: string, empNo: string, exceptKey?: string) {
  const e = email.trim().toLowerCase();
  const n = empNo.trim().toLowerCase();
  return (
    rows.find((r) => r.key !== exceptKey && ((!!e && r.email === e) || (!!n && r.employeeNumber.toLowerCase() === n))) ?? null
  );
}

/** deptEmps (dash.html:6747): employees and professionals in the department, signed up or invited. */
export const membersOf = (rows: RosterRecord[] | undefined, d: AdminDepartment) =>
  (Array.isArray(rows) ? rows : []).filter((r) => MEMBER_ROLES.includes(r.role) && inDept(r, d)).sort((a, b) => a.name.localeCompare(b.name));

export const systemAccount = (r: RosterRecord) => isSystemAccount(r, r.inviteSource);

/** A roster row as the shared PersonPicker shows it (invited people have no account photo). */
export const asPick = (r: RosterRecord, depts?: AdminDepartment[]): PickPerson => ({
  id: r.key,
  name: r.name,
  role: r.role,
  jobTitle: r.jobTitle || undefined,
  dept: deptLabel(r.dept, depts) || undefined,
  employeeNumber: r.employeeNumber || undefined,
  hasAvatar: !r.invited && r.hasAvatar,
  resigned: r.resigned,
});

const MONTH: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

/** toISODate (dash.html:5571): Keka's "22-Dec-2016" or ISO, as YYYY-MM-DD ('' when unreadable). */
export function isoDay(raw: string | null | undefined) {
  const v = String(raw || '').trim();
  if (!v) return '';
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  if (iso) return iso[1]!;
  const dm = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(v);
  if (dm) {
    const m = MONTH[dm[2]!.toLowerCase()];
    if (m) return `${dm[3]}-${m}-${dm[1]!.padStart(2, '0')}`;
  }
  return '';
}

/** "A+ (A Positive)" → "A+" (rows imported from Keka carry the long form). */
export const bloodShort = (v: string | null | undefined) => {
  const m = /^(AB|A|B|O)\s*([+-])/i.exec(String(v || '').trim());
  return m ? `${m[1]!.toUpperCase()}${m[2]}` : String(v || '').trim();
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const splitName = (name: string) => {
  const parts = String(name || '').trim().split(/\s+/);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') };
};
