// Newsroom (wave 2): posting news and running the office TVs. Existing endpoints only
// (docs/port/hr-people.md §2.4); the read-only feed stays in api/announcements.ts.
//
//   POST   /announcements                 server.js:9119  isAnnouncementCreator   { ok, announcement }
//   PUT    /announcements/:id             server.js:9139  creator, same company   only the changed keys;
//                                                                                kind can't change
//   DELETE /announcements/:id             server.js:9179  creator                 permanent
//   GET    /branches                      routes/branches.js:16  any              string[] of locations
//   POST   /celebration/test-send         server.js:2831  master/super/hr         sends a REAL WhatsApp
//   GET    /tv/admin/devices              tv.js:457       USER_ADMIN              bare array
//   POST   /tv/admin/claim                tv.js:426       USER_ADMIN, 30/15 min   pairs a TV
//   PATCH  /tv/admin/devices/:id          tv.js:467       USER_ADMIN              name, location, config
//   POST   /tv/admin/devices/:id/command  tv.js:488       USER_ADMIN, 60/min      acts on the TV live
//   DELETE /tv/admin/devices/:id          tv.js:509       USER_ADMIN              unpairs (TV shows a code)
//   GET    /tv/admin/devices/:id/logs     tv.js:524       USER_ADMIN              last 100 lines
//   GET    /tv/admin/playlists            tv.js:533       USER_ADMIN              read only on the phone
//   GET/POST/DELETE /tv/admin/media[/:id] server.js:8935 USER_ADMIN              plays on EVERY TV
//
// The list never carries `priority` (ANNOUNCEMENT_LIST_FIELDS server.js:8820), so an edit sends
// `priority` only when the person changed it — the website always sends 'normal' and silently
// downgrades high / emergency posts (spec §1.G). File bytes (fileData, homeBannerImage) never enter
// the query cache.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { annBannerCache, annMediaCache } from '@/api/announcements';
import { api, ApiRequestError, isApiError, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

export const newsroomKeys = {
  branches: (uid: string) => ['newsroom', 'branches', uid] as const,
  tvDevices: (uid: string) => ['newsroom', 'tv', 'devices', uid] as const,
  tvPlaylists: (uid: string) => ['newsroom', 'tv', 'playlists', uid] as const,
  tvMedia: (uid: string) => ['newsroom', 'tv', 'media', uid] as const,
  tvLogs: (uid: string, id: string) => ['newsroom', 'tv', 'logs', uid, id] as const,
};

function useUid() {
  return useSession((s) => s.user?.id) ?? '';
}

/** A write that resolves the server's JSON or throws the server's own words. */
async function write<T = { ok: true }>(p: Promise<unknown>): Promise<T> {
  const r = await p;
  if (isApiError(r)) throw new ApiRequestError(r);
  return r as T;
}

// ── Posts ────────────────────────────────────────────────────────────────────

export type NewsKind = 'announcement' | 'popup';
export type NewsType = 'text' | 'link' | 'image' | 'video' | 'excel' | 'ppt';
export type NewsPriority = 'normal' | 'high' | 'low' | 'emergency';
export type PopupFrequency = 'once' | 'daily' | 'always';

/** What POST / PUT /announcements accept (AnnouncementForm save, dash.html:19044). */
export type NewsPayload = {
  kind?: NewsKind;
  title?: string;
  body?: string;
  type?: NewsType;
  linkUrl?: string;
  ctaText?: string;
  branches?: string[];
  expiresAt?: string | null;
  scheduledAt?: string | null;
  fullBleed?: boolean;
  priority?: NewsPriority;
  popupFrequency?: PopupFrequency;
  fileData?: string;
  fileName?: string;
  homeBannerImage?: string;
  homeBannerImageName?: string;
  createdBy?: string;
  createdByRole?: string;
  createdAt?: string;
  tenantId?: string | null;
};

const invalidateNews = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['announcements'] });

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewsPayload) => write<{ ok: true; announcement?: { id: string } }>(api.post('/announcements', body)),
    onSettled: () => void invalidateNews(qc),
  });
}

export function useUpdatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: NewsPayload }) => write(api.put(`/announcements/${encodeURIComponent(v.id)}`, v.patch)),
    onSuccess: (_r, v) => {
      // A new picture or banner replaces the one the feed has cached (in memory only).
      if (typeof v.patch.fileData === 'string') annMediaCache.set(v.id, v.patch.fileData);
      if (typeof v.patch.homeBannerImage === 'string') annBannerCache.set(v.id, v.patch.homeBannerImage);
    },
    onSettled: () => void invalidateNews(qc),
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => write(api.del(`/announcements/${encodeURIComponent(id)}`)),
    onSettled: () => void invalidateNews(qc),
  });
}

/** Branch names for "Visible to" and a TV's location (the web loads them only for the form). */
export function useBranches(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: newsroomKeys.branches(uid),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<string[]>('/branches', signal));
      return Array.isArray(r) ? r.filter((b) => typeof b === 'string' && b.trim()) : [];
    },
    staleTime: 10 * 60_000,
  });
}

export type TestSendResult = { results?: { kind?: string; ok?: boolean; skipped?: string; error?: string }[] };

/** Sends a sample birthday and anniversary card to `phone` on WhatsApp (a real message). */
export function useCelebrationTestSend() {
  return useMutation({
    mutationFn: async (phone: string) => {
      const r = await write<TestSendResult>(api.post('/celebration/test-send', { phone }));
      const results = Array.isArray(r?.results) ? r.results : [];
      if (!results.some((x) => x && x.ok)) {
        const first = results[0];
        throw new Error(String(first?.skipped || first?.error || 'The message was not sent.'));
      }
      return r;
    },
  });
}

// ── Office TVs ───────────────────────────────────────────────────────────────

export type TvConfig = {
  playlistId?: string | null;
  inactivityMinutes?: number;
  offlineThresholdSeconds?: number;
  showOfflineIndicator?: boolean;
  defaultDurationSeconds?: number;
};

export type TvDevice = {
  id: string;
  name?: string | null;
  location?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  status?: 'online' | 'offline' | string;
  lastSeenAt?: string | null;
  lastSyncAt?: string | null;
  currentAnnouncementId?: string | null;
  claimedAt?: string | null;
  config?: TvConfig | null;
};

export type TvPlaylist = { id: string; name: string; description?: string; status?: 'active' | 'archived' | string; items?: unknown[] };
export type TvMedia = { id: string; type: 'image' | 'video' | string; fileName?: string; createdAt?: string };
export type TvLog = { created_at: string; event_type: string; message?: string | null };
export type TvCommand = 'SYNC' | 'REFRESH' | 'RELOAD' | 'CLEAR_CACHE' | 'RETURN_TO_PLAYLIST' | 'SHOW_ANNOUNCEMENT';

const list = <T,>(r: unknown): T[] => (Array.isArray(r) ? (r.filter((x) => x && typeof x === 'object') as T[]) : []);

/** Paired TVs. `poll` refetches every 20 s (the website's own refresh) while the screen is on top. */
export function useTvDevices(enabled = true, poll = false) {
  const uid = useUid();
  return useQuery({
    queryKey: newsroomKeys.tvDevices(uid),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => list<TvDevice>(await unwrap(api.get<TvDevice[]>('/tv/admin/devices', signal))).filter((d) => d.id),
    refetchInterval: enabled && poll ? 20_000 : false,
    staleTime: 15_000,
  });
}

export function useTvPlaylists(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: newsroomKeys.tvPlaylists(uid),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => list<TvPlaylist>(await unwrap(api.get<TvPlaylist[]>('/tv/admin/playlists', signal))).filter((p) => p.id),
    staleTime: 60_000,
  });
}

export function useTvMedia(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: newsroomKeys.tvMedia(uid),
    enabled: enabled && !!uid,
    queryFn: async ({ signal }) => list<TvMedia>(await unwrap(api.get<TvMedia[]>('/tv/admin/media', signal))).filter((m) => m.id),
    staleTime: 60_000,
  });
}

export function useTvLogs(id: string, enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: newsroomKeys.tvLogs(uid, id),
    enabled: enabled && !!uid && !!id,
    queryFn: async ({ signal }) => list<TvLog>(await unwrap(api.get<TvLog[]>(`/tv/admin/devices/${encodeURIComponent(id)}/logs`, signal))),
    meta: { persist: false },
    staleTime: 10_000,
  });
}

const invalidateTv = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['newsroom', 'tv'] });

export type ClaimInput = { code: string; name: string; location: string; playlistId: string | null; inactivityMinutes: number };

export function usePairTv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ClaimInput) => write<{ ok: true; device?: TvDevice }>(api.post('/tv/admin/claim', v)),
    onSettled: () => void invalidateTv(qc),
  });
}

export type TvPatch = { name?: string; location?: string; config?: TvConfig };

export function useUpdateTv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: TvPatch }) => write(api.patch(`/tv/admin/devices/${encodeURIComponent(v.id)}`, v.patch)),
    onSettled: () => void invalidateTv(qc),
  });
}

export function useTvCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; command: TvCommand; payload?: { announcementId: string; seconds: number } }) =>
      write<{ ok: true; commandId?: string }>(api.post(`/tv/admin/devices/${encodeURIComponent(v.id)}/command`, { command: v.command, payload: v.payload ?? {} })),
    onSettled: () => void invalidateTv(qc),
  });
}

export function useUnpairTv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => write(api.del(`/tv/admin/devices/${encodeURIComponent(id)}`)),
    onSettled: () => void invalidateTv(qc),
  });
}

export function useUploadTvMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { type: 'image' | 'video'; fileData: string; fileName: string }) => write(api.post('/tv/admin/media', v)),
    onSettled: () => void invalidateTv(qc),
  });
}

export function useDeleteTvMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => write(api.del(`/tv/admin/media/${encodeURIComponent(id)}`)),
    onSettled: () => void invalidateTv(qc),
  });
}
