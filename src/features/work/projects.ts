// Project codes (the web's "Keka codes", ProjectsView dash.html:22587) — pure helpers.

import type { Project } from '@/api/reimbursements';
import type { WorkProject } from '@/api/work';
import type { StatusTone } from '@/theme/tokens';

const s = (v: unknown) => (v == null ? '' : String(v));

/** kekaCode (:22613): the stored code, else Meta 1_2_3. */
export const codeOfProject = (p: Pick<WorkProject, 'kekaCode' | 'meta1' | 'meta2' | 'meta3'>) =>
  s(p.kekaCode) || [p.meta1, p.meta2, p.meta3].map(s).filter(Boolean).join('_');

/** The code a form's three parts make (createProject / saveProject). */
export const codeFromParts = (m1: string, m2: string, m3: string) => [m1, m2, m3].map((x) => x.trim()).filter(Boolean).join('_');

/** projectIsActive (:1232): anything without a status is active. */
export const isActiveProject = (p: Pick<Project, 'status'>) => s(p.status || 'active').toLowerCase() !== 'inactive';

export const projectStatus = (p: Pick<Project, 'status'>): { label: string; tone: StatusTone } =>
  isActiveProject(p) ? { label: 'Active', tone: 'done' } : { label: 'Inactive', tone: 'neutral' };

/** projectsNewestFirst (:1236): createdAt ‖ date, then id, newest first. */
export const projectsNewestFirst = (a: WorkProject, b: WorkProject) =>
  s(b.createdAt || b.date).localeCompare(s(a.createdAt || a.date)) || s(b.id).localeCompare(s(a.id));

/** The web's search (:22656): name, code or owner contains the text. */
export const projectMatches = (p: WorkProject, q: string) => {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return s(p.name).toLowerCase().includes(n) || codeOfProject(p).toLowerCase().includes(n) || s(p.costCodeOwner).toLowerCase().includes(n);
};
