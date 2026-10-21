// Team board routes (src/app/(app)/admin/team-board/**). Every screen carries the department as
// ?dept= so a deep link opens on the right one.

const e = encodeURIComponent;

export const boardHref = (dept?: string, tab?: 'tasks' | 'projects' | 'people' | 'managers') =>
  `/admin/team-board${dept || tab ? `?${[dept ? `dept=${e(dept)}` : '', tab ? `tab=${tab}` : ''].filter(Boolean).join('&')}` : ''}` as const;
export const projectHref = (dept: string, id: string) => `/admin/team-board/project/${e(id)}?dept=${e(dept)}` as const;
export const projectFormHref = (dept: string, id?: string) => `/admin/team-board/project-form?dept=${e(dept)}${id ? `&id=${e(id)}` : ''}` as const;
export const workHref = (dept: string, projectId: string, id: string) => `/admin/team-board/work/${e(id)}?dept=${e(dept)}&project=${e(projectId)}` as const;
export const teamsHref = (dept: string) => `/admin/team-board/teams?dept=${e(dept)}` as const;
export const teamHref = (dept: string, id: string) => `/admin/team-board/team/${e(id)}?dept=${e(dept)}` as const;
export const teamFormHref = (dept: string, id?: string) => `/admin/team-board/team-form?dept=${e(dept)}${id ? `&id=${e(id)}` : ''}` as const;
export function taskFormHref(dept: string, projectId: string, opts: { id?: string; parent?: string } = {}) {
  const q = [`dept=${e(dept)}`, `project=${e(projectId)}`];
  if (opts.id) q.push(`id=${e(opts.id)}`);
  if (opts.parent) q.push(`parent=${e(opts.parent)}`);
  return `/admin/team-board/task?${q.join('&')}` as const;
}
