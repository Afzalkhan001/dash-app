// Admin advanced — the reads and writes behind the last website-only admin features. Every route below
// already exists on the server; nothing new is asked of it.
//
//   DELETE /tenants/:id               routes/tenants.js:163  cascades ~20 tables (bookings, tasks, tickets,
//                                                            departments, rooms, projects, assets, whitelist,
//                                                            support data, announcements, every user) — NO role
//                                                            check on the server; master_admin only in the app
//   GET    /users /whitelist /departments /projects           what is left of the company afterwards; the
//                                                            website then deletes each leftover row
//                                                            (deleteTenant dash.html:2413–2455, batches of 15)
//   DELETE /users/:id /whitelist/:id /departments/:id /projects/:id
//   GET    /assets, DELETE /assets/:id routes/assets.js       "Delete all assets" = one DELETE per asset
//                                                            (dash.html:20415); no role check on the server
//   DELETE /tickets/:id               routes/tickets.js:346  tenant check only; audit row "deleted service request"
//   GET/POST /tv/admin/playlists, PUT/DELETE /tv/admin/playlists/:id   tv.js:533–590 (USER_ADMIN_ROLES, same company)
//
// People lists never reach the phone's disk (meta: { persist: false }).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiRequestError, isApiError, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const enc = encodeURIComponent;
const rows = (r: unknown): Record<string, unknown>[] => (Array.isArray(r) ? r.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);

async function write<T = { ok: true }>(p: Promise<unknown>): Promise<T> {
  const r = await p;
  if (isApiError(r)) throw new ApiRequestError(r);
  return r as T;
}

const useUid = () => useSession((s) => s.user?.id) ?? '';

export const advancedKeys = {
  companyData: (uid: string) => ['adminadvanced', 'company-data', uid] as const,
};

// ── Delete a company ─────────────────────────────────────────────────────────
/** One row the company still owns: a login, an invitation, a department or a project. */
export type CompanyRow = { table: 'users' | 'whitelist' | 'departments' | 'projects'; id: string; tenantId: string; role: string };

async function companyRows(signal?: AbortSignal): Promise<CompanyRow[]> {
  const tables = ['users', 'whitelist', 'departments', 'projects'] as const;
  const lists = await Promise.all(tables.map((t) => unwrap(api.get(`/${t}`, signal))));
  return tables.flatMap((table, i) =>
    rows(lists[i])
      .filter((r) => r.id != null)
      .map((r) => ({ table, id: str(r.id), tenantId: str(r.tenantId), role: str(r.role) })),
  );
}

/** Every login, invitation, department and project on DASH (master_admin sees all companies). */
export function useCompanyData(enabled: boolean) {
  const uid = useUid();
  return useQuery({
    queryKey: advancedKeys.companyData(uid),
    enabled: enabled && !!uid,
    meta: { persist: false },
    queryFn: ({ signal }) => companyRows(signal),
    staleTime: 30_000,
  });
}

/** What would go with this company (the website skips master_admin rows, dash.html:2421). */
export function companyCounts(list: CompanyRow[] | undefined, tenantId: string) {
  const mine = (list ?? []).filter((r) => r.tenantId === tenantId && r.role !== 'master_admin');
  const n = (t: CompanyRow['table']) => mine.filter((r) => r.table === t).length;
  return { users: n('users'), invites: n('whitelist'), departments: n('departments'), projects: n('projects'), rows: mine };
}

export type DeleteProgress = { step: 'company' | 'leftovers' | 'done'; done: number; total: number };
/** `checked: false` — the company is gone but the follow-up read failed, so leftovers weren't tidied. */
export type DeleteCompanyResult = { leftovers: number; failed: number; checked: boolean };

/**
 * deleteTenant (dash.html:2413): DELETE /tenants/:id (the server cascades), then the company's
 * remaining logins, invitations, departments and projects, 15 at a time. Leftovers are re-read after
 * the cascade, so only rows the server did not already remove are sent.
 */
export function useDeleteCompany() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async ({ tenantId, onProgress }: { tenantId: string; onProgress?: (p: DeleteProgress) => void }): Promise<DeleteCompanyResult> => {
      onProgress?.({ step: 'company', done: 0, total: 0 });
      // performedById: the server's audit row names who deleted it (routes/tenants.js reads req.query).
      await write(api.del(`/tenants/${enc(tenantId)}?performedById=${enc(uid)}`));
      // The company is gone from here on: a failed re-read must not be reported as "Couldn't delete".
      let left: CompanyRow[];
      try {
        left = companyCounts(await companyRows(), tenantId).rows;
      } catch {
        onProgress?.({ step: 'done', done: 0, total: 0 });
        return { leftovers: 0, failed: 0, checked: false };
      }
      let done = 0;
      let failed = 0;
      onProgress?.({ step: 'leftovers', done, total: left.length });
      for (let i = 0; i < left.length; i += 15) {
        const batch = left.slice(i, i + 15);
        const out = await Promise.all(batch.map((r) => api.del(`/${r.table}/${enc(r.id)}`)));
        failed += out.filter(isApiError).length;
        done += batch.length;
        onProgress?.({ step: 'leftovers', done, total: left.length });
      }
      onProgress?.({ step: 'done', done, total: left.length });
      return { leftovers: left.length, failed, checked: true };
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['tenants'] }),
        qc.invalidateQueries({ queryKey: ['platform'] }),
        qc.invalidateQueries({ queryKey: ['adminadvanced'] }),
      ]),
  });
}

// ── Delete all assets ────────────────────────────────────────────────────────
export type AssetLite = { id: string; name: string; assignedTo: string };

/** deleteAllAssets (dash.html:20415): the list is re-read first, then one DELETE per asset (10 at a time). */
export function useDeleteAllAssets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ expected, onProgress }: { expected: number; onProgress?: (done: number, total: number) => void }) => {
      const list = rows(await unwrap(api.get('/assets'))).filter((a) => a.id != null);
      // The typed words name a count; if the catalogue changed since, delete nothing and say so.
      if (list.length !== expected) {
        throw new Error(`The catalogue now has ${list.length} asset${list.length === 1 ? '' : 's'}, not ${expected}. Nothing was deleted. Close this, check the list and try again.`);
      }
      const failed: AssetLite[] = [];
      let done = 0;
      onProgress?.(0, list.length);
      for (let i = 0; i < list.length; i += 10) {
        const batch = list.slice(i, i + 10);
        const out = await Promise.all(batch.map((a) => api.del(`/assets/${enc(str(a.id))}`)));
        out.forEach((r, k) => {
          const a = batch[k]!;
          if (isApiError(r)) failed.push({ id: str(a.id), name: str(a.name), assignedTo: str(a.assignedTo) });
        });
        done += batch.length;
        onProgress?.(done, list.length);
      }
      return { total: list.length, deleted: list.length - failed.length, failed };
    },
    onSettled: () =>
      Promise.all([qc.invalidateQueries({ queryKey: ['itdesk', 'assets'] }), qc.invalidateQueries({ queryKey: ['people', 'assets'] })]),
  });
}

// ── Delete one service request ───────────────────────────────────────────────
/** DELETE /tickets/:id. The server reads the actor from the query (a DELETE carries no body here). */
export function useDeleteTicket() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (id: string) => write(api.del(`/tickets/${enc(id)}?performedById=${enc(uid)}`)),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['inbox', 'desk-it'] }),
        qc.invalidateQueries({ queryKey: ['support-tickets'] }),
        qc.invalidateQueries({ queryKey: ['servicedesk'] }),
      ]),
  });
}

// ── TV playlists ─────────────────────────────────────────────────────────────
/** One playlist row (tv.js normalizeItems): a post, its seconds on screen (3–300), optional dates. */
export type PlaylistItem = { announcementId: string; durationSeconds: number; startDate: string | null; endDate: string | null; priority?: string };
export type PlaylistBody = { name: string; description: string; items: PlaylistItem[]; status?: 'active' | 'archived' };

export function usePlaylistWrites() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['newsroom', 'tv'] });
  return {
    create: useMutation({
      mutationFn: (body: PlaylistBody) => write<{ ok: true; playlist?: { id: string } }>(api.post('/tv/admin/playlists', body)),
      onSettled: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: PlaylistBody }) => write(api.put(`/tv/admin/playlists/${enc(id)}`, body)),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => write(api.del(`/tv/admin/playlists/${enc(id)}`)),
      onSettled: refresh,
    }),
  };
}

/** A playlist's rows as the editor holds them (the website's TvPlaylistModal state, dash.html:3101). */
export function itemsOf(raw: unknown): PlaylistItem[] {
  return rows(raw).map((i) => ({
    announcementId: str(i.announcementId),
    durationSeconds: Number(i.durationSeconds) || 15,
    startDate: str(i.startDate) || null,
    endDate: str(i.endDate) || null,
    // A per-item priority the website editor can't see (tv.js normalizeItems): kept, never dropped on save.
    ...(i.priority != null && str(i.priority) ? { priority: str(i.priority) } : {}),
  }));
}
