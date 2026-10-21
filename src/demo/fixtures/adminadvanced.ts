// Demo answers for the admin advanced screens (features/adminadvanced). Shared demo data is reached
// only through other fixtures' exports and their own route handlers — no other fixture file is edited.
//
//   DELETE /tenants/:id            master only here (the real route checks nothing): the company leaves
//                                  master's GET /tenants and GET /users; the demo company itself is refused,
//                                  so the other personas keep working
//   GET /tenants, /users           master only, after a delete: platform.ts's answer minus deleted companies
//   GET /departments, /projects    master only: the demo company's rows plus a few of Nexus and Lumen, so
//                                  "What will be deleted" has real counts
//   DELETE /departments|projects|users/:id   rows of a deleted demo company: gone with it (no-op)
//   DELETE /tickets/:id            removes the request from support.ts's ticketStore (desk and raiser agree)
//   POST/PUT/DELETE /tv/admin/playlists[/:id]   writes newsroom.ts's playlist list in place (it only
//                                  answers GET), with the server's checks (tv.js normalizeItems)
//   DELETE /assets/:id             already itdesk.ts's
//
// Routes whose pattern is `only(cond, re)` match only while `cond()` holds, so every other persona falls
// through to the usual fixture. Register this file FIRST in demo/fixtures/index.ts (see HANDOFF.md).

import { newsStore } from '@/demo/fixtures/announcements';
import { newsroomRoutes } from '@/demo/fixtures/newsroom';
import { orgRoutes } from '@/demo/fixtures/org';
import { platformRoutes } from '@/demo/fixtures/platform';
import { ticketStore } from '@/demo/fixtures/support';
import { DEMO_TENANT_ID } from '@/demo/config';
import { currentPersona } from '@/demo/personas';
import { fail, newId, notFound, nowIso, type Route } from '@/demo/state';

type Row = Record<string, unknown>;
type Handler = Route[2];

const role = () => currentPersona().role;
const isMaster = () => role() === 'master_admin';
const USER_ADMIN_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo', 'hr', 'admin', 'it_admin', 'app_manager']; // lib/authz.js:27
const userAdmin = () => USER_ADMIN_ROLES.includes(role());

/** A route pattern that matches only while `cond()` holds (the demo server calls exec / test). */
function only(cond: () => boolean, re: RegExp): RegExp {
  return { exec: (s: string) => (cond() ? re.exec(s) : null), test: (s: string) => cond() && re.test(s) } as unknown as RegExp;
}
function handlerOf(list: Route[], method: Route[0], path: string): Handler | null {
  return list.find(([m, re]) => m === method && re.test(path))?.[2] ?? null;
}
const call = (h: Handler | null, p: string[], body: unknown, q: URLSearchParams) => (h ? h(p, body, q) : []);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

// ── Companies ────────────────────────────────────────────────────────────────
const deleted = new Set<string>();
const masterAfterDelete = () => isMaster() && deleted.size > 0;
const keep = (r: Row) => !deleted.has(String(r.tenantId ?? r.id ?? ''));

const platformTenants = handlerOf(platformRoutes, 'GET', '/tenants');
const platformUsers = handlerOf(platformRoutes, 'GET', '/users');
const orgDepartments = handlerOf(orgRoutes, 'GET', '/departments');
const orgProjects = handlerOf(orgRoutes, 'GET', '/projects');

const OTHER_DEPARTMENTS: Row[] = [
  { id: 'nx-dept-post', name: 'Post-production', tenantId: 't-nexus', adminId: 'nx-rohan' },
  { id: 'nx-dept-shoot', name: 'Shoots', tenantId: 't-nexus', adminId: '' },
  { id: 'nx-dept-acc', name: 'Accounts', tenantId: 't-nexus', adminId: '' },
  { id: 'ls-dept-grade', name: 'Grading', tenantId: 't-lumen', adminId: '' },
];
const OTHER_PROJECTS: Row[] = [
  { id: 'nx-prj-1', name: 'Aurora web series', kekaCode: 'NX-AUR', tenantId: 't-nexus', status: 'active' },
  { id: 'nx-prj-2', name: 'Monsoon ad film', kekaCode: 'NX-MON', tenantId: 't-nexus', status: 'active' },
  { id: 'nx-prj-3', name: 'Retail catalogue', kekaCode: 'NX-RET', tenantId: 't-nexus', status: 'completed' },
  { id: 'ls-prj-1', name: 'Feature grade — Kaagaz', kekaCode: 'LS-KGZ', tenantId: 't-lumen', status: 'active' },
];
/** The demo company's own rows carry no tenantId in the seed; give them one so counts are right. */
const tagged = (rows: Row[]) => rows.map((r) => (r.tenantId ? r : { ...r, tenantId: DEMO_TENANT_ID }));

const deleteTenant: Handler = ([, id]) => {
  if (!isMaster()) return fail('Only the platform owner can delete a company.', 403);
  const tid = String(id);
  if (tid === DEMO_TENANT_ID) return fail('The demo company can’t be deleted in the demo. Try Nexus Productions or Lumen Studios.', 409);
  const known = arr(call(platformTenants, ['/tenants'], {}, new URLSearchParams())).some((t) => t.id === tid);
  if (!known || deleted.has(tid)) return notFound('Company not found.');
  deleted.add(tid);
  return { ok: true };
};
const goneRow = (list: Row[]) => (([, id]) => {
  const row = list.find((r) => r.id === id);
  return row && deleted.has(String(row.tenantId)) ? { ok: true } : notFound();
}) as Handler;

// ── Service requests ─────────────────────────────────────────────────────────
const deleteTicket: Handler = ([, id]) => {
  const i = ticketStore.findIndex((t) => t.id === id);
  if (i < 0) return notFound('Ticket not found.');
  ticketStore.splice(i, 1);
  return { ok: true };
};

// ── TV playlists ─────────────────────────────────────────────────────────────
type Playlist = { id: string; name: string; description?: string; status?: string; items?: Row[]; updated_at?: string };
const newsroomPlaylists = handlerOf(newsroomRoutes, 'GET', '/tv/admin/playlists');
/** newsroom.ts's own playlist array (its GET hands back the live list to a user admin). */
const playlists = (): Playlist[] | null => {
  const r = call(newsroomPlaylists, ['/tv/admin/playlists'], {}, new URLSearchParams());
  return Array.isArray(r) ? (r as Playlist[]) : null;
};
const PRIORITIES = ['emergency', 'high', 'normal', 'low'];
/** tv.js normalizeItems + checkItemsInTenant. Throws the server's own words. */
function normalizeItems(items: unknown): Row[] {
  if (!Array.isArray(items)) throw new Error('items must be a list');
  if (items.length > 200) throw new Error('A playlist can hold at most 200 items');
  const dateOk = (d: unknown) => d == null || d === '' || /^\d{4}-\d{2}-\d{2}$/.test(String(d));
  return items.map((raw, i) => {
    const it = (raw ?? {}) as Row;
    const announcementId = String(it.announcementId ?? '').slice(0, 120);
    if (!announcementId) throw new Error(`Item ${i + 1} has no announcement`);
    const dur = it.durationSeconds == null ? null : Number(it.durationSeconds);
    if (dur != null && (!Number.isInteger(dur) || dur < 3 || dur > 300)) throw new Error(`Item ${i + 1}: duration must be 3–300 seconds`);
    if (!dateOk(it.startDate) || !dateOk(it.endDate)) throw new Error(`Item ${i + 1}: dates must be YYYY-MM-DD`);
    const priority = it.priority == null ? null : String(it.priority);
    if (priority != null && !PRIORITIES.includes(priority)) throw new Error(`Item ${i + 1}: invalid priority`);
    if (!newsStore.some((a) => a.id === announcementId)) throw new Error(`Announcement "${announcementId}" is not in this company.`);
    return { announcementId, durationSeconds: dur, displayOrder: i, startDate: it.startDate || null, endDate: it.endDate || null, priority };
  });
}
const withList = (fn: (list: Playlist[]) => unknown, what: string) => {
  if (!userAdmin()) return fail(`You do not have permission to ${what} TV playlists.`, 403);
  const list = playlists();
  if (!list) return fail('The demo could not reach the playlists.', 500);
  try {
    return fn(list);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Invalid playlist.', 400);
  }
};
const createPlaylist: Handler = (_p, body: Row) =>
  withList((list) => {
    const name = String(body?.name ?? '').slice(0, 80).trim();
    if (!name) return fail('Playlist name is required.', 400);
    const row: Playlist = { id: newId('pl'), name, description: String(body?.description ?? '').slice(0, 300), status: 'active', items: normalizeItems(body?.items ?? []) };
    list.unshift(row);
    return { ok: true, playlist: row };
  }, 'create');
const updatePlaylist: Handler = ([, id], body: Row) =>
  withList((list) => {
    const p = list.find((x) => x.id === id);
    if (!p) return notFound('Playlist not found.');
    if ('status' in body && !['active', 'archived'].includes(String(body.status))) return fail('Invalid status.', 400);
    const items = 'items' in body ? normalizeItems(body.items) : p.items;
    if ('name' in body) p.name = String(body.name ?? '').slice(0, 80).trim() || p.name;
    if ('description' in body) p.description = String(body.description ?? '').slice(0, 300);
    if ('status' in body) p.status = String(body.status);
    p.items = items;
    p.updated_at = nowIso();
    return { ok: true };
  }, 'edit');
const deletePlaylist: Handler = ([, id]) =>
  withList((list) => {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return notFound('Playlist not found.');
    list.splice(i, 1);
    return { ok: true };
  }, 'delete');

export const adminadvancedRoutes: Route[] = [
  ['DELETE', /^\/tenants\/([^/]+)$/, deleteTenant],
  ['GET', only(masterAfterDelete, /^\/tenants$/), (p, b, q) => arr(call(platformTenants, p, b, q)).filter(keep)],
  ['GET', only(masterAfterDelete, /^\/users$/), (p, b, q) => arr(call(platformUsers, p, b, q)).filter(keep)],
  ['GET', only(isMaster, /^\/departments$/), (p, b, q) => [...tagged(arr(call(orgDepartments, p, b, q))), ...OTHER_DEPARTMENTS].filter(keep)],
  ['GET', only(isMaster, /^\/projects$/), (p, b, q) => [...tagged(arr(call(orgProjects, p, b, q))), ...OTHER_PROJECTS].filter(keep)],
  ['DELETE', only(masterAfterDelete, /^\/departments\/([^/]+)$/), goneRow(OTHER_DEPARTMENTS)],
  ['DELETE', only(masterAfterDelete, /^\/projects\/([^/]+)$/), goneRow(OTHER_PROJECTS)],
  ['DELETE', /^\/tickets\/([^/]+)$/, deleteTicket],
  ['POST', /^\/tv\/admin\/playlists$/, createPlaylist],
  ['PUT', /^\/tv\/admin\/playlists\/([^/]+)$/, updatePlaylist],
  ['DELETE', /^\/tv\/admin\/playlists\/([^/]+)$/, deletePlaylist],
];
