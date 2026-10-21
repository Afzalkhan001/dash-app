// People: the org directory, departments, per-person photos, and saving my own profile.
//
//   GET /org/directory      routes/users.js:46 — everyone in my company that is a person (shared
//                           logins dropped), plus roster rows of people who have not signed up yet
//                           (`pending: true`, id 'wl:<id>'). Only CEO / COO / Super Admin / HR get
//                           the whole row; everyone else gets name, role, title, manager, contact,
//                           blood group and joining date. The server does that filtering, so the app
//                           must never widen it — no GET /users/:id for anybody but myself.
//   GET /departments        routes/departments.js:19 — tenant-scoped, readable by everyone
//   GET /users/:id/avatar   routes/users.js:116 — JSON { avatar: data URL | '' }, not an image
//   GET /leaves             routes/leaves.js:13 — the company leave calendar (who is off which day),
//                           readable by every staff user; only who and when is kept (useLeaveDays)
//   PUT /users/:id          routes/users.js:186 — self-edit is allowed; lib/authz.js filterUserWrite
//                           drops role/tenant/email/employee no./dept and the password server-side
//
// Photos (and other large data URLs) never go into TanStack Query: its cache is persisted to disk
// as one blob, and a few hundred base64 photos would bloat it past what AsyncStorage can hold. They
// live in a small in-memory cache instead, exactly like the web's useLazyAvatar (dash.html:1294).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useSyncExternalStore } from 'react';

import { api, apiFetch, isApiError, unwrap } from '@/api/client';
import { onSignOut, type StaffUser, useSession } from '@/auth/session';
import { todayIst, weekOf } from '@/lib/dates';

// ── Directory ────────────────────────────────────────────────────────────────

export type DirectoryPerson = {
  id: string;
  name?: string;
  role?: string;
  jobTitle?: string;
  jobRole?: string;
  reportingManager?: string;
  reportingTo?: string | null;
  reportingToName?: string;
  additionalManager?: string;
  email?: string;
  mobile?: string;
  phone?: string;
  bloodGroup?: string;
  dateJoined?: string;
  dob?: string; // full-view roles only (the restricted row has no dob)
  hasAvatar?: boolean;
  resigned?: boolean | string;
  status?: string;
  pending?: boolean; // on the Employee Roster, has not signed up for DASH yet
  dept?: string; // full-view roles only
  location?: string; // full-view roles only
  city?: string;
  employeeNumber?: string; // full-view roles only
  kekaCode?: string;
  gender?: string;
};

// The full-view row is the whole user record. Only what the people screens draw is kept, so the
// persisted query cache stays small and nobody's bank details end up stored on an HR phone.
const KEEP: (keyof DirectoryPerson)[] = [
  'name', 'role', 'jobTitle', 'jobRole', 'reportingManager', 'reportingTo', 'reportingToName', 'additionalManager',
  'email', 'mobile', 'phone', 'bloodGroup', 'dateJoined', 'dob', 'hasAvatar', 'resigned', 'status', 'pending',
  'dept', 'location', 'city', 'employeeNumber', 'kekaCode', 'gender',
];

function slimPerson(raw: Record<string, unknown>): DirectoryPerson {
  const out: Record<string, unknown> = { id: String(raw.id ?? '') };
  for (const k of KEEP) {
    const v = raw[k];
    if (v === undefined || v === null || v === '') continue;
    // Anything else that is a long string here would be an embedded file, not a profile field.
    if (typeof v === 'string' && v.length > 500) continue;
    out[k] = v;
  }
  // The legacy photoUrl field is deliberately not kept: the photo always comes from the avatar
  // route, and the shared <Avatar> sends the session token with any non-data URI it is given.
  return out as DirectoryPerson;
}

export function useDirectory(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['people', 'directory', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<Record<string, unknown>[]>('/org/directory', signal));
      if (!Array.isArray(r)) throw new Error('The directory could not be loaded.');
      return r.filter((p) => p && typeof p === 'object' && p.id != null).map(slimPerson);
    },
    staleTime: 5 * 60_000,
  });
}

// ── Departments ──────────────────────────────────────────────────────────────

export type Department = { id: string; name: string };

export function useDepartments(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  const tenantId = useSession((s) => s.user?.tenantId);
  return useQuery({
    queryKey: ['people', 'departments', tenantId ?? userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ id?: unknown; name?: unknown }[]>('/departments', signal));
      return (Array.isArray(r) ? r : [])
        .filter((d) => d && d.id != null)
        .map((d) => ({ id: String(d.id), name: String(d.name ?? '') }) satisfies Department);
    },
    staleTime: 30 * 60_000,
  });
}

// Department is stored on a person as an id (sometimes already a name on legacy rows). Same lookup
// as the web's ProfileView/EmpProfileModal: by id, then by name; a bare id that matches nothing is
// not shown as if it were a name.
export function deptName(dept: string | null | undefined, departments: Department[] | undefined) {
  if (!dept) return '';
  const d = (departments ?? []).find((x) => x.id === dept || x.name.toLowerCase() === String(dept).toLowerCase());
  if (d?.name) return d.name;
  return /^[du]\d/.test(String(dept)) ? '' : String(dept);
}

// ── Leave days (who is off when) ─────────────────────────────────────────────
// GET /leaves (routes/leaves.js, getAll tenant-scoped, any signed-in staff user): the company's leave
// calendar — the same table the website reads for "on leave today" (dash.html:1766). An approved HR
// leave writes one row per working day (hr_leave.js writeLegacyLeaves: employee name + id, date,
// reason 'HR leave' or 'Half day (first|second)'); rows marked by hand on the website may have only the
// name. The table holds years of rows, so only this week (from Monday) to 60 days ahead is kept, and
// only who and when: never the leave type or the reason. Kept off the phone's disk (meta.persist).

export type LeaveDay = {
  /** User id on HR-approved rows; '' on rows marked by hand (match those by name). */
  employeeId: string;
  employee: string;
  /** YYYY-MM-DD (India calendar day). */
  date: string;
  half: boolean;
};

const ymdPlus = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function useLeaveDays(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['people', 'leaves', userId],
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<Record<string, unknown>[]>('/leaves', signal));
      if (!Array.isArray(r)) throw new Error('Leave could not be loaded.');
      const week = weekOf(todayIst());
      const from = week[0]!;
      const to = ymdPlus(todayIst(), 60);
      const out: LeaveDay[] = [];
      for (const row of r) {
        if (!row || typeof row !== 'object') continue;
        const date = String(row.date ?? '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < from || date > to) continue;
        const employeeId = row.employeeId != null ? String(row.employeeId).trim() : '';
        const employee = String(row.employee ?? '').trim();
        if (!employeeId && !employee) continue;
        const half = row.source === 'hr' && /^half day/i.test(String(row.reason ?? '').trim());
        out.push({ employeeId, employee, date, half });
      }
      return out;
    },
    staleTime: 5 * 60_000,
  });
}

// ── Lazy blobs (photos, media) ───────────────────────────────────────────────
// A tiny keyed cache with in-flight de-duplication, readable from React through
// useSyncExternalStore. Values are strings (data URLs); '' means "has none".

type Status = 'loading' | 'error' | undefined;

const RETRY_AFTER_MS = 60_000;

export type BlobCache = {
  get: (key: string | null | undefined) => string | undefined;
  status: (key: string | null | undefined) => Status;
  staleError: (key: string) => boolean; // failed long enough ago to try again on the next view
  set: (key: string, value: string) => void;
  load: (key: string) => Promise<string>;
  retry: (key: string) => void;
  retain: (key: string) => () => void; // keeps a value on screen from being evicted
  subscribe: (fn: () => void) => () => void;
  clear: () => void;
};

export function createBlobCache(fetchOne: (key: string) => Promise<string>, max: number): BlobCache {
  const values = new Map<string, string>();
  const errors = new Map<string, number>(); // key → when it last failed
  const inflight = new Map<string, Promise<string>>();
  const inUse = new Map<string, number>(); // key → how many mounted readers
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  // Oldest first, never an entry something on screen is showing (it may then briefly hold more).
  const trim = () => {
    for (const k of values.keys()) {
      if (values.size <= max) break;
      if (!inUse.has(k)) values.delete(k);
    }
  };
  const put = (key: string, value: string) => {
    values.delete(key);
    values.set(key, value);
    trim();
  };
  const cache: BlobCache = {
    get: (key) => (key ? values.get(key) : undefined),
    status: (key) => (!key ? undefined : inflight.has(key) ? 'loading' : errors.has(key) ? 'error' : undefined),
    staleError: (key) => Date.now() - (errors.get(key) ?? 0) > RETRY_AFTER_MS,
    set: (key, value) => {
      errors.delete(key);
      put(key, value);
      emit();
    },
    load: (key) => {
      const have = values.get(key);
      if (have !== undefined) return Promise.resolve(have);
      let p = inflight.get(key);
      if (!p) {
        errors.delete(key);
        p = fetchOne(key)
          .then((v) => {
            put(key, v);
            return v;
          })
          .catch((e) => {
            errors.set(key, Date.now());
            throw e;
          })
          .finally(() => {
            inflight.delete(key);
            emit();
          });
        inflight.set(key, p);
        emit();
      }
      return p;
    },
    retry: (key) => {
      errors.delete(key);
      cache.load(key).catch(() => {});
    },
    retain: (key) => {
      inUse.set(key, (inUse.get(key) ?? 0) + 1);
      return () => {
        const n = (inUse.get(key) ?? 1) - 1;
        if (n > 0) inUse.set(key, n);
        else inUse.delete(key);
        trim();
      };
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    clear: () => {
      values.clear();
      errors.clear();
      inflight.clear();
      emit();
    },
  };
  // A different account must never see the last one's photos or files.
  onSignOut(() => cache.clear());
  return cache;
}

// Reads `key` from `cache`, fetching it once when `enabled`. Returns the value (undefined until
// loaded; '' when there is none) and the fetch status.
export function useLazyBlob(cache: BlobCache, key: string | null | undefined, enabled = true) {
  const value = useSyncExternalStore(cache.subscribe, () => cache.get(key));
  const status = useSyncExternalStore(cache.subscribe, () => cache.status(key));
  useEffect(() => (key ? cache.retain(key) : undefined), [cache, key]);
  useEffect(() => {
    if (!enabled || !key || cache.get(key) !== undefined) return;
    // A failure is not retried on every re-render — only on a later view, or by retry().
    if (cache.status(key) === 'error' && !cache.staleError(key)) return;
    cache.load(key).catch(() => {});
  }, [cache, key, enabled]);
  return { value, status, retry: () => key && cache.retry(key) };
}

// Profile photos: GET /users/:id/avatar → { avatar }. ~150 kept, enough for a few screens of the
// directory without holding every photo in the company in memory.
export const avatarCache = createBlobCache(async (id) => {
  const r = await api.get<{ avatar?: string }>(`/users/${encodeURIComponent(id)}/avatar`);
  if (isApiError(r)) throw new Error(r.error);
  return typeof r.avatar === 'string' ? r.avatar : '';
}, 150);

// The web's OrgAvatar rule (dash.html:9348): fetch only when the row says there is a photo.
// Roster-only (pending) rows and chart placeholders never fetch.
export function usePersonPhoto(p: (Pick<DirectoryPerson, 'id' | 'hasAvatar' | 'pending'> & { ghost?: boolean }) | null | undefined) {
  const should = !!p && !p.pending && !p.ghost && !!p.hasAvatar;
  const { value } = useLazyBlob(avatarCache, should ? p!.id : null, should);
  return value || null;
}

// ── My profile (self-edit) ───────────────────────────────────────────────────

// Exactly the fields the web's My Profile saves (dash.html ProfileView saveProfile ~L29043).
// Name and job title are managed by Super Admin / HR and are not sent.
export type SelfProfilePatch = {
  phone: string;
  mobile: string;
  bio: string;
  workLinks: string[];
  bankAccountNumber: string;
  bankIfscCode: string;
};

export type ProfileRecord = StaffUser & {
  avatar?: string | null;
  bio?: string;
  workLinks?: string[];
  bankAccountNumber?: string;
  bankIfscCode?: string;
  location?: string;
  city?: string;
  dateJoined?: string;
  dob?: string;
  bloodGroup?: string;
  jobRole?: string;
  reportingManager?: string;
  additionalManager?: string;
};

// A photo is a few hundred KB of base64, so that write gets longer than the 12 s default before it
// is called a timeout (slow mobile uplinks). performedById is my own id, as the web sends it.
export const putUser = (userId: string, body: Record<string, unknown>) =>
  apiFetch<{ ok: true }>(`/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: { ...body, performedById: userId },
    timeoutMs: 'avatar' in body ? 60_000 : undefined,
  });

// Writes a patch to my own record and keeps the cached profile (['user', id], see api/me.ts) and
// the directory in step.
export function useSaveMyProfile() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!userId) throw new Error('You are signed out.');
      const r = await putUser(userId, patch);
      if (isApiError(r)) throw new Error(r.error);
      return patch;
    },
    onSuccess: (patch) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.setQueryData(['user', userId], (old: ProfileRecord | undefined) => (old ? { ...old, ...patch } : old));
      if ('avatar' in patch && userId) {
        if (typeof patch.avatar === 'string' && patch.avatar) avatarCache.set(userId, patch.avatar);
        else avatarCache.set(userId, '');
      }
      void qc.invalidateQueries({ queryKey: ['user', userId] });
      void qc.invalidateQueries({ queryKey: ['people', 'directory'] });
    },
    onError: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });
}
