// More › Workspace: the grouped list sections under More's app grid, built from every domain's
// workspaceRows(access) (features/<domain>/nav.ts, through features/domains). One pattern for every
// admin and desk area, in place of separate "Manage", "HR admin", "Accounts desk", "IT desk", "Admin",
// "Platform" menus (docs/port/PLAN.md §2.2.1). The 9-tile grid itself (features/more/menu.ts) is
// unchanged. Integrator-owned; domains never edit it.
//
//   ┌ Apps grid (≤ 9 tiles) ┐
//   │ links card            │  `links` rows: plain links with no section title (Chat & calls, Refer & earn)
//   Work                       one SectionHeader + one ListCard per section that has rows,
//   People & HR                in this order; a section with no rows is not drawn
//   Money · IT & office · Company · Platform · Reception
//
// Row order inside a section: `order` (low first, default 100), then registry order (features/domains).
// The section titles are the only copy here; each row's words are the domain's.

import { domainWorkspaceRows } from '@/features/domains';
import type { WorkspaceRow, WorkspaceSectionKey } from '@/features/plugin-types';
import type { Access } from '@/lib/use-access';

/** The titled sections, top to bottom. `links` has no title and sits right under the grid. */
export const WORKSPACE_SECTIONS: { key: Exclude<WorkspaceSectionKey, 'links'>; title: string }[] = [
  { key: 'work', title: 'Work' },
  { key: 'people', title: 'People & HR' },
  { key: 'money', title: 'Money' },
  { key: 'it', title: 'IT & office' },
  { key: 'company', title: 'Company' },
  { key: 'platform', title: 'Platform' },
  { key: 'reception', title: 'Reception' },
];

/**
 * Sections drawn as app-grid tiles for a role, not as a titled list (integrator pass 1): the Visitor
 * Manager's grid is otherwise Help & support, Policies and People, while reception is their whole job.
 */
const TILE_SECTIONS: Record<string, WorkspaceSectionKey[]> = { visitor_manager: ['reception'] };

export type WorkspaceSection = { key: WorkspaceSectionKey; title: string; rows: WorkspaceRow[] };

export type Workspace = {
  /**
   * Rows shown as app-grid tiles instead (PLAN §2.5's one exception to the fixed grid): the Visitor
   * Manager's Reception rows, which replace that role's near-empty grid. Put them first in the grid.
   */
  tiles: WorkspaceRow[];
  /** Plain links under the grid (no title). */
  links: WorkspaceRow[];
  /** The titled sections that have at least one row, in WORKSPACE_SECTIONS order. */
  sections: WorkspaceSection[];
  /** Every row's key, for the tour (DomainTourCtx.workspaceRows). */
  keys: string[];
};

const KNOWN = new Set<string>(['links', ...WORKSPACE_SECTIONS.map((s) => s.key)]);

/** Everything the domains offer this person in More, grouped. Pure: call it during render. */
export function buildWorkspace(access: Access): Workspace {
  const rows = domainWorkspaceRows(access).filter((r) => {
    const ok = KNOWN.has(r.section) && typeof r.label === 'string' && !!r.label && !!r.href && !!r.icon;
    if (!ok && __DEV__) console.warn(`[workspace] row "${r.key}" needs a known section, a label, an href and an icon — dropped`);
    return ok;
  });
  const asTiles = new Set(TILE_SECTIONS[access.user?.role ?? ''] ?? []);
  const tiles = rows.filter((r) => asTiles.has(r.section));
  const sections = WORKSPACE_SECTIONS.filter((s) => !asTiles.has(s.key))
    .map((s) => ({ ...s, rows: rows.filter((r) => r.section === s.key) }))
    .filter((s) => s.rows.length > 0);
  return { tiles, links: rows.filter((r) => r.section === 'links'), sections, keys: rows.map((r) => r.key) };
}
