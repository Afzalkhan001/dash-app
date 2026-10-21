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

import { api, type ApiResult, apiFetch, isApiError, unwrap } from '@/api/client';
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

// ═════════════════════════════════════════════════════════════════════════════
// Admin: the Employee roster and Departments (people domain, wave 1 — docs/port/hr-people.md §1.A,
// §1.C, §1.E, §4.2, §4.4). Gates live in features/people/access.ts; the screens are
// app/(app)/admin/people/**.
//
//   GET    /users                    routes/users.js:108  every account in my company, FULL records
//   GET    /whitelist                routes/whitelist.js:17  invitations (the roster rows), full rows
//   GET    /whitelist/:id/avatar     whitelist.js:25      { avatar } of an invited person
//   POST   /whitelist                whitelist.js:87      USER_ADMIN; upserts by email; a new row sends
//                                                         the welcome email + WhatsApp. Saves only its
//                                                         own field list (no dob / blood group / cadence
//                                                         / additional manager), so the app follows it
//                                                         with a PUT for those (the website loses them)
//   PUT    /whitelist/:id            whitelist.js:167     USER_ADMIN; role only for role assigners
//   DELETE /whitelist/:id            whitelist.js:218     NO server check: called only for DESTRUCTIVE
//                                                         roles, and only after DELETE /users succeeded
//   PUT    /users/:id                users.js:186         self or USER_ADMIN (filterUserWrite); resigned
//                                                         → bounty wallet swept to the company
//   POST   /employees/change-email   users.js:314         USER_ADMIN; emails the OLD address
//   DELETE /users/:id                users.js:383         DESTRUCTIVE_ROLES; permanent
//   POST/PUT/DELETE /departments     departments.js:25/120/149  USER_ADMIN; delete cascades into Team
//                                                         Roster data and HR settings
//   GET    /assets                   (held-asset check before resign / remove, dash.html:5713)
//   GET    /bounty/wallet/:id        server.js:5124       self or USER_ADMIN: the coins a resign sweeps
//   GET    /tasks, /bookings         (active work warning before remove, dash.html:5727)
//
// GET /users and GET /whitelist carry bank details and other private fields for everyone, so every row
// is slimmed to what the roster draws before it reaches the query cache, and the roster queries are
// kept off the phone's disk (meta.persist = false), like useLeaveDays. Photos stay in the blob caches.
// Two records per person (account + invitation, joined by email): every write goes to both, as the
// website does (dash.html:5621) — through saveRosterPerson().
// The website's silent back-fill writes on open (reportingManager from reportingTo, source:'system' on
// whitelist rows, the empty-company department sync) are deliberately NOT ported (PLAN §2.1.6).

export type RosterRecord = {
  /** The account id, or the invitation id for someone who has not signed up yet. */
  id: string;
  /** Route param: the account id, or 'wl:<invitation id>' (the directory's convention). */
  key: string;
  /** Not signed up yet: only an invitation (web `_invited`). */
  invited: boolean;
  /** The invitation that belongs to this person (same email), when there is one. */
  inviteId: string | null;
  /** That invitation's `source` ('system' = provisioned in User Management). */
  inviteSource: string | null;
  name: string;
  email: string;
  role: string;
  /** A department id (legacy rows: a department name). */
  dept: string;
  jobTitle: string;
  employeeNumber: string;
  gender: string;
  mobile: string;
  location: string;
  dateJoined: string;
  dob: string;
  bloodGroup: string;
  reportingManager: string;
  additionalManager: string;
  reportingTo: string;
  timesheetCadence: 'daily' | 'weekly';
  resigned: boolean;
  resignedAt: string;
  resignedBy: string;
  source: string;
  hasAvatar: boolean;
  avatarUpdatedBy: string;
  avatarUpdatedById: string;
  avatarUpdatedAt: string;
  professionalAvailable: boolean;
  professionalType: string;
  specializations: string[];
};

export type Roster = {
  rows: RosterRecord[];
  /** Every signed-up account, slimmed (the manager pickers and the department admin pick from these). */
  accounts: RosterRecord[];
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const nested = (raw: Record<string, unknown>) => (raw.data && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>) : {});
const field = (raw: Record<string, unknown>, ...keys: string[]) => {
  const d = nested(raw);
  for (const k of keys) {
    const v = str(raw[k]) || str(d[k]);
    if (v && v.length <= 500) return v;
  }
  return '';
};
const yes = (v: unknown) => v === true || v === 'true';

/** One account or invitation, slimmed to what the roster shows (never bank, never a photo). */
function slimRoster(raw: Record<string, unknown>, invited: boolean): RosterRecord {
  const id = str(raw.id);
  const specs = Array.isArray(raw.specializations) ? raw.specializations.map(str).filter(Boolean).slice(0, 30) : [];
  return {
    id,
    key: invited ? `wl:${id}` : id,
    invited,
    inviteId: invited ? id : null,
    inviteSource: invited ? str(raw.source) || null : null,
    name: field(raw, 'name') || 'Unnamed',
    email: field(raw, 'email').toLowerCase(),
    role: field(raw, 'role') || 'employee',
    dept: field(raw, 'dept'),
    jobTitle: field(raw, 'jobTitle', 'jobRole'),
    employeeNumber: field(raw, 'employeeNumber', 'kekaCode', 'empNum'),
    gender: field(raw, 'gender'),
    mobile: field(raw, 'mobile', 'phone'),
    location: field(raw, 'location', 'city'),
    dateJoined: field(raw, 'dateJoined'),
    dob: field(raw, 'dob'),
    bloodGroup: field(raw, 'bloodGroup'),
    reportingManager: field(raw, 'reportingManager', 'reporting_manager'),
    additionalManager: field(raw, 'additionalManager'),
    reportingTo: field(raw, 'reportingTo'),
    timesheetCadence: field(raw, 'timesheetCadence') === 'weekly' ? 'weekly' : 'daily',
    resigned: yes(raw.resigned),
    resignedAt: str(raw.resignedAt),
    resignedBy: str(raw.resignedBy),
    source: str(raw.source),
    hasAvatar: yes(raw.hasAvatar),
    avatarUpdatedBy: field(raw, 'avatarUpdatedBy'),
    avatarUpdatedById: field(raw, 'avatarUpdatedById'),
    avatarUpdatedAt: field(raw, 'avatarUpdatedAt'),
    professionalAvailable: yes(raw.professionalAvailable),
    professionalType: str(raw.professionalType),
    specializations: specs,
  };
}

/**
 * EmpRoster's list (dash.html:5530): every account except master_admin, plus the invitations whose
 * email has not signed up yet. Each account also learns its own invitation (same email), so a write
 * can be mirrored and a provisioned system login recognised.
 */
export function mergeRoster(users: Record<string, unknown>[], invites: Record<string, unknown>[]): Roster {
  const inv = invites.filter((w) => !!w && typeof w === 'object' && w.id != null).map((w) => slimRoster(w, true));
  const byEmail = new Map<string, RosterRecord>();
  for (const w of inv) if (w.email && !byEmail.has(w.email)) byEmail.set(w.email, w);
  const accounts = users
    .filter((u) => !!u && typeof u === 'object' && u.id != null)
    .map((u) => slimRoster(u, false))
    .map((u) => {
      const w = u.email ? byEmail.get(u.email) : undefined;
      return w ? { ...u, inviteId: w.id, inviteSource: w.inviteSource } : u;
    });
  const signed = new Set(accounts.map((u) => u.email).filter(Boolean));
  const rows = [
    ...accounts.filter((u) => u.role !== 'master_admin'),
    ...inv.filter((w) => w.role !== 'master_admin' && !(w.email && signed.has(w.email))),
  ];
  return { rows, accounts };
}

export const rosterKey = (userId?: string | null) => ['people', 'roster', userId ?? ''] as const;

/** The roster: GET /users + GET /whitelist, merged and slimmed. Never persisted. */
export function useRoster(enabled = true) {
  const userId = useSession((st) => st.user?.id);
  return useQuery({
    queryKey: rosterKey(userId),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }) => {
      const [u, w] = await Promise.all([
        unwrap(api.get<Record<string, unknown>[]>('/users', signal)),
        unwrap(api.get<Record<string, unknown>[]>('/whitelist', signal)),
      ]);
      if (!Array.isArray(u)) throw new Error('The roster could not be loaded.');
      return mergeRoster(u, Array.isArray(w) ? w : []);
    },
    // The website refreshes every 30 s while the roster is open; focus and pull to refresh do here.
    staleTime: 30_000,
  });
}

// Photos of invited people: GET /whitelist/:id/avatar (the accounts' come from avatarCache).
export const inviteAvatarCache = createBlobCache(async (id) => {
  const r = await api.get<{ avatar?: string }>(`/whitelist/${encodeURIComponent(id)}/avatar`);
  if (isApiError(r)) throw new Error(r.error);
  return typeof r.avatar === 'string' ? r.avatar : '';
}, 40);

/** A roster row's photo (lazy; only when the row says there is one). */
export function useRosterPhoto(row: Pick<RosterRecord, 'id' | 'invited' | 'hasAvatar'> | null | undefined) {
  const should = !!row && row.hasAvatar;
  const account = useLazyBlob(avatarCache, should && !row.invited ? row.id : null, should && !row.invited);
  const invite = useLazyBlob(inviteAvatarCache, should && row.invited ? row.id : null, should && row.invited);
  return (row?.invited ? invite.value : account.value) || null;
}

// ── Departments (full rows) ──────────────────────────────────────────────────

export type AdminDepartment = {
  id: string;
  name: string;
  adminId: string;
  managerId: string;
  managerIds: string[];
  teamRosterEnabled: boolean;
};

export const adminDepartmentsKey = (tenant?: string | null) => ['people', 'departments', 'admin', tenant ?? ''] as const;

/** GET /departments with what the admin screens need (admin, managers, Team Roster on). */
export function useAdminDepartments(enabled = true) {
  const userId = useSession((st) => st.user?.id);
  const tenantId = useSession((st) => st.user?.tenantId);
  return useQuery({
    queryKey: adminDepartmentsKey(tenantId ?? userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<Record<string, unknown>[]>('/departments', signal));
      return (Array.isArray(r) ? r : [])
        .filter((d) => !!d && d.id != null)
        .map(
          (d): AdminDepartment => ({
            id: str(d.id),
            name: str(d.name),
            adminId: str(d.adminId),
            managerId: str(d.managerId),
            managerIds: Array.isArray(d.managerIds) ? d.managerIds.map(str).filter(Boolean) : str(d.managerId) ? [str(d.managerId)] : [],
            teamRosterEnabled: yes(d.teamRosterEnabled),
          }),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 60_000,
  });
}

// ── Checks before resign / remove ────────────────────────────────────────────

export type HeldAsset = { id: string; assetId: string; name: string; serial: string; assignedTo: string; assignedToEmpNo: string; type: string; condition: string };

/** GET /assets, slimmed to what the held-asset check and the person screen show. Never persisted. */
export function useAssetList(enabled = true) {
  const userId = useSession((st) => st.user?.id);
  return useQuery({
    queryKey: ['people', 'assets', userId ?? ''],
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<Record<string, unknown>[]>('/assets', signal));
      return (Array.isArray(r) ? r : [])
        .filter((a) => !!a && a.id != null)
        .map(
          (a): HeldAsset => ({
            id: str(a.id),
            assetId: str(a.assetId),
            name: str(a.name) || 'Asset',
            serial: str(a.serial),
            assignedTo: str(a.assignedTo),
            assignedToEmpNo: str(a.assignedToEmpNo),
            type: str(a.assetType) || str(a.category),
            condition: str(a.condition),
          }),
        );
    },
    staleTime: 60_000,
  });
}

/** The coins a resignation sweeps to the company (the server reads the wallet's `available`). */
export function useWalletBalance(personId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['people', 'wallet', personId ?? ''],
    enabled: enabled && !!personId,
    meta: { persist: false },
    queryFn: async ({ signal }) => {
      const r = await api.get<{ available?: unknown }>(`/bounty/wallet/${encodeURIComponent(personId ?? '')}`, signal);
      if (isApiError(r)) return null; // no wallet, or not allowed: the confirm then says "any coins"
      const n = Number(r.available);
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    },
    staleTime: 30_000,
  });
}

const TASK_FINISHED = ['completed', 'submitted', 'reviewed', 'rejected'];
const BOOKING_OPEN = ['pending', 'approved', 'in_progress'];

/**
 * dash.html:5727 — active tasks (assignee, not finished) and bookings (resource or requester, still
 * open) under this person's name, for the remove warning. GET /tasks is large: only counted, only
 * fetched when the remove sheet opens, never persisted.
 */
export function useActiveWork(name: string | null | undefined, enabled = true) {
  const userId = useSession((st) => st.user?.id);
  return useQuery({
    queryKey: ['people', 'active-work', userId ?? '', name ?? ''],
    enabled: enabled && !!name && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }) => {
      const [t, b] = await Promise.all([
        api.get<Record<string, unknown>[]>('/tasks', signal),
        api.get<Record<string, unknown>[]>('/bookings', signal),
      ]);
      const tasks = Array.isArray(t) ? t.filter((x) => !!x && x.assignee === name && !TASK_FINISHED.includes(str(x.status))).length : 0;
      const bookings = Array.isArray(b)
        ? b.filter((x) => !!x && (x.resource === name || x.requestedBy === name) && BOOKING_OPEN.includes(str(x.status))).length
        : 0;
      return { tasks, bookings };
    },
    staleTime: 30_000,
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

function check<T>(r: ApiResult<T>, fallback: string): T {
  if (isApiError(r)) throw new Error(r.error || fallback);
  return r;
}

const actorId = () => useSession.getState().user?.id;

/** Whose two records a roster write touches. */
export type RosterTarget = Pick<RosterRecord, 'id' | 'invited' | 'inviteId'>;

/**
 * One roster write, mirrored the way the website does it (dash.html:5621-5622): an invited person gets
 * PUT /whitelist/:id; a signed-up person gets PUT /users/:id, then the same patch on their invitation.
 * The account write comes first; when only the mirror fails, `mirrorError` says so (the account is
 * saved, the invitation is not).
 */
export async function saveRosterPerson(target: RosterTarget, patch: Record<string, unknown>): Promise<{ mirrorError?: string }> {
  const long = typeof patch.avatar === 'string' && patch.avatar.length > 1000;
  const put = (path: string, body: Record<string, unknown>) =>
    apiFetch(path, { method: 'PUT', body: { ...body, performedById: actorId() }, timeoutMs: long ? 60_000 : undefined });
  if (target.invited) {
    check(await put(`/whitelist/${encodeURIComponent(target.id)}`, patch), 'The change could not be saved.');
    return {};
  }
  check(await put(`/users/${encodeURIComponent(target.id)}`, patch), 'The change could not be saved.');
  if (target.inviteId) {
    // The email joins the two records and only changes through change-email.
    const { email: _email, ...mirror } = patch;
    const r = await put(`/whitelist/${encodeURIComponent(target.inviteId)}`, mirror);
    if (isApiError(r)) return { mirrorError: r.error || 'Their invitation was not updated.' };
  }
  return {};
}

/** POST /employees/change-email: the login moves on both records; the old address gets an email. */
export async function changeEmployeeEmail(target: RosterTarget, email: string) {
  const body = target.invited ? { whitelistId: target.id, email } : { userId: target.id, email };
  return check(await api.post<{ ok: true; email?: string }>('/employees/change-email', body), 'The email could not be changed.');
}

/** What the Add form sends (dash.html:5690 `entry`). */
export type NewEmployee = {
  email: string;
  name: string;
  role: string;
  dept: string | null;
  employeeNumber: string;
  gender: string;
  mobile: string;
  location: string;
  jobTitle: string;
  reportingManager: string;
  additionalManager: string;
  dateJoined: string;
  dob: string;
  bloodGroup: string;
  timesheetCadence: 'daily' | 'weekly';
};

/**
 * Add someone to the roster: POST /whitelist (the server sends them the welcome email and WhatsApp;
 * they then sign up). POST /whitelist keeps only its own fields, so date of birth, blood group,
 * timesheet and additional manager follow with a PUT on the new invitation. `followError` = the
 * invitation exists but those extra fields were not saved.
 */
export async function addEmployee(e: NewEmployee): Promise<{ id: string; followError?: string }> {
  const tenantId = useSession.getState().user?.tenantId ?? null;
  const entry = {
    email: e.email,
    name: e.name,
    role: e.role,
    dept: e.dept,
    tenantId,
    kekaCode: e.employeeNumber,
    employeeNumber: e.employeeNumber,
    gender: e.gender,
    mobile: e.mobile,
    location: e.location,
    jobTitle: e.jobTitle,
    jobRole: e.jobTitle,
    reportingManager: e.reportingManager,
    additionalManager: e.additionalManager,
    reportingTo: null,
    dateJoined: e.dateJoined,
    dob: e.dob,
    bloodGroup: e.bloodGroup,
    timesheetCadence: e.timesheetCadence,
  };
  const r = check(await api.post<{ ok: true; entry?: { id?: string } }>('/whitelist', entry), 'They could not be added.');
  const id = str(r.entry?.id);
  if (!id) return { id };
  const extra: Record<string, unknown> = { timesheetCadence: e.timesheetCadence };
  if (e.dob) extra.dob = e.dob;
  if (e.bloodGroup) extra.bloodGroup = e.bloodGroup;
  if (e.additionalManager) extra.additionalManager = e.additionalManager;
  const f = await api.put(`/whitelist/${encodeURIComponent(id)}`, extra);
  return isApiError(f) ? { id, followError: f.error } : { id };
}

/**
 * Remove someone for good (DESTRUCTIVE roles only; see features/people/access). A signed-up person:
 * DELETE /users/:id first and, only when that succeeded, their roster invitation (never a User
 * Management one). An invited person: DELETE /whitelist/:id. `inviteError` = the account is gone but
 * the invitation is still there.
 */
export async function removeEmployee(row: Pick<RosterRecord, 'id' | 'invited' | 'inviteId' | 'inviteSource'>): Promise<{ inviteError?: string }> {
  if (row.invited) {
    check(await api.del(`/whitelist/${encodeURIComponent(row.id)}`), 'They could not be removed.');
    return {};
  }
  check(await api.del(`/users/${encodeURIComponent(row.id)}`), 'They could not be removed.');
  if (row.inviteId && row.inviteSource !== 'system') {
    const r = await api.del(`/whitelist/${encodeURIComponent(row.inviteId)}`);
    if (isApiError(r)) return { inviteError: r.error || 'Their invitation was not removed.' };
  }
  return {};
}

/** PUT /users/:id for the profile extras (professional booking, type, specialisations, reportingTo). */
export async function saveAccountFields(userId: string, patch: Record<string, unknown>) {
  check(await api.put(`/users/${encodeURIComponent(userId)}`, patch), 'The change could not be saved.');
}

/** POST /departments as DeptBrowserView creates one (:6760). Returns the new id. */
export async function createDepartment(name: string) {
  const nd = { id: `d${Date.now()}`, name, adminId: '', managerId: '' };
  const r = check(await api.post<{ ok: true; dept?: { id?: string } }>('/departments', nd), 'The department could not be created.');
  return str(r.dept?.id) || nd.id;
}

/** PUT /departments/:id as DeptBrowserView saves it (:6767): the managers are sent back unchanged. */
export async function updateDepartment(d: AdminDepartment, patch: { name?: string; adminId?: string }) {
  const managerIds = d.managerIds;
  check(
    await api.put(`/departments/${encodeURIComponent(d.id)}`, {
      name: patch.name ?? d.name,
      adminId: patch.adminId ?? d.adminId,
      managerId: managerIds[0] || '',
      managerIds,
    }),
    'The department could not be saved.',
  );
}

export async function deleteDepartment(id: string) {
  check(await api.del(`/departments/${encodeURIComponent(id)}`), 'The department could not be deleted.');
}

/** After any roster or department write: every list that shows people or departments. */
export function useInvalidatePeople() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['people'] }),
      qc.invalidateQueries({ queryKey: ['shared', 'people'] }),
      qc.invalidateQueries({ queryKey: ['user'] }),
    ]);
}
