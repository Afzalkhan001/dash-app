// Excel domain — the writes behind each bulk upload, on the website's own endpoints and in its order.
// Nothing new on the server. Every write is checked: a row that fails is reported by its sheet row
// number with the server's own words, and the rest carry on (PLAN §5 "two-step writes can half-fail").
//
//   Employees, upload  saveRoster (dash.html:6108): fresh GET /users /whitelist /departments → POST
//                      /departments for new names → per row (10 at a time): account → PUT /users/:id +
//                      PUT /whitelist/:id (merge, blanks never clear), invitation → PUT /whitelist/:id,
//                      new → POST /whitelist then PUT /whitelist/:id (extended fields) → POST /upload_batches.
//                      The website's "repair" passes (steps 4 / 4b, a self-heal) are NOT repeated.
//   Employees, update  applyBulkUpdate (:6365): fresh lists → PUT /users/:id and/or /whitelist/:id with
//                      only the filled cells (10 at a time). Never /users/bulk-patch (no role check).
//   Projects           saveBulkProjects (:22703): POST /projects, 10 at a time.
//   Clients            bulkUpload (:23373): POST /clients one by one, managerId / managerName = me.
//   Assets             confirmBulkUpload (:20294): POST /assets one by one → POST /upload_batches.
//   Subscriptions      SubscriptionImport run (:11426): one POST /subscriptions/import.

import { useQuery } from '@tanstack/react-query';

import { api, isApiError, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';
import type { AssetRow, ClientRow, DeptLite, EmpRow, ProjRow, RosterPerson, SubImport, UpdRow } from '@/features/excel/parse';
import { projectBody, updPayload } from '@/features/excel/parse';

export type RowFailure = { line: number; name: string; error: string };
export type Progress = (done: number, total: number) => void;

const errOf = (r: unknown) => (isApiError(r) ? r.error : null);
const pickId = (res: unknown, fallback: string): string => {
  // POST /api/whitelist answers { ok, entry: { id } } and ignores the id it was sent (routes/whitelist.js),
  // so `entry.id` must be read or the follow-up PUT misses the new row.
  const r = res as { id?: string; data?: { id?: string }[]; entry?: { id?: string }; project?: { id?: string }; asset?: { id?: string } } | { id?: string }[] | null;
  if (Array.isArray(r)) return String(r[0]?.id || fallback);
  return String(r?.entry?.id || r?.id || r?.data?.[0]?.id || r?.project?.id || r?.asset?.id || fallback);
};
const seed = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

async function inBatches<T>(items: readonly T[], size: number, run: (x: T) => Promise<void>, onProgress?: Progress) {
  let done = 0;
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(run));
    done = Math.min(items.length, i + size);
    onProgress?.(done, items.length);
  }
}

// ── Fresh roster lists ───────────────────────────────────────────────────────
export type RosterLists = { users: RosterPerson[]; whitelist: RosterPerson[]; departments: DeptLite[] };

/** GET /users, /whitelist and /departments, fresh (the website re-reads them before every check and save). */
export async function fetchRosterLists(): Promise<RosterLists> {
  const [u, w, d] = await Promise.all([api.get<RosterPerson[]>('/users'), api.get<RosterPerson[]>('/whitelist'), api.get<DeptLite[]>('/departments')]);
  if (isApiError(u)) throw new Error(u.error);
  const list = <X,>(v: unknown): X[] => (Array.isArray(v) ? (v.filter((x) => !!x && typeof x === 'object') as X[]) : []);
  return {
    users: list<RosterPerson>(u),
    whitelist: list<RosterPerson>(w),
    departments: list<DeptLite>(d).map((x) => ({ id: String(x.id), name: String(x.name || '') })),
  };
}

// ── Employees: upload ────────────────────────────────────────────────────────
export type EmpResult = { added: number; updated: number; skipped: number; departments: string[]; failures: RowFailure[]; batchSaved: boolean };

const merge = (uploaded: unknown, existing: unknown) => String(uploaded || existing || '');

export async function saveEmployees(rows: readonly EmpRow[], fileName: string, tenantId: string | null, onProgress?: Progress): Promise<EmpResult> {
  const fresh = await fetchRosterLists();
  const depts = [...fresh.departments];
  const failures: RowFailure[] = [];
  const createdDepts: string[] = [];
  const todo = rows.filter((r) => r.action !== 'skip');

  // Step 2: every department the sheet names that does not exist yet.
  const names = [...new Set(todo.map((r) => (r.deptName || r.dept || '').trim()).filter((n) => n && n.length > 1 && !/^(wl|dept|d)\d/.test(n)))];
  for (const dn of names) {
    if (depts.some((d) => d.name.toLowerCase() === dn.toLowerCase())) continue;
    const nd = { id: `d${seed()}`, name: dn, adminId: '', managerId: '' };
    const res = await api.post('/departments', nd);
    if (errOf(res)) {
      failures.push({ line: 0, name: `Department “${dn}”`, error: errOf(res)! });
      continue;
    }
    depts.push({ id: pickId(res, nd.id), name: dn });
    createdDepts.push(dn);
  }

  const idLc = (v: unknown) => String(v || '').trim().toLowerCase();
  let added = 0;
  let updated = 0;
  await inBatches(
    todo,
    10,
    async (raw) => {
      let emp = raw;
      if (emp.dept && !depts.some((d) => d.id === emp.dept)) {
        const d = depts.find((x) => x.name.toLowerCase() === emp.dept.toLowerCase());
        if (d) emp = { ...emp, dept: d.id, deptName: d.name };
      }
      const id = idLc(emp.employeeNumber);
      const email = idLc(emp.email);
      const byId = (u: RosterPerson) => !!id && (idLc(u.employeeNumber) === id || idLc(u.kekaCode) === id);
      const byEmail = (u: RosterPerson) => !!email && idLc(u.email) === email;
      const updatesFor = (ex: RosterPerson) => {
        const mob = merge(emp.mobile, ex.mobile || ex.phone);
        return {
          name: merge(emp.name, ex.name),
          dept: emp.dept || (ex.dept as string) || null,
          kekaCode: merge(emp.employeeNumber, ex.kekaCode),
          employeeNumber: merge(emp.employeeNumber, ex.employeeNumber),
          gender: merge(emp.gender, ex.gender),
          mobile: mob,
          phone: mob,
          location: merge(emp.location, ex.location),
          jobTitle: merge(emp.jobTitle, ex.jobTitle),
          jobRole: merge(emp.jobTitle, ex.jobRole || ex.jobTitle),
          reportingManager: merge(emp.reportingManager, ex.reportingManager),
          dateJoined: merge(emp.dateJoined, ex.dateJoined),
          dob: merge(emp.dob, ex.dob),
          bloodGroup: merge(emp.bloodGroup, ex.bloodGroup),
        };
      };
      const user = fresh.users.find(byId) || fresh.users.find(byEmail);
      if (user) {
        const upd = updatesFor(user);
        const wl = fresh.whitelist.find((w) => w.id === user.id) || fresh.whitelist.find(byId) || fresh.whitelist.find(byEmail);
        const [a, b] = await Promise.all([api.put(`/users/${encodeURIComponent(user.id)}`, upd), wl ? api.put(`/whitelist/${encodeURIComponent(wl.id)}`, upd) : Promise.resolve({})]);
        const e = errOf(a) || errOf(b);
        if (e) failures.push({ line: emp.line, name: emp.name, error: e });
        else updated++;
        return;
      }
      const wl = fresh.whitelist.find(byId) || fresh.whitelist.find(byEmail);
      if (wl) {
        const res = await api.put(`/whitelist/${encodeURIComponent(wl.id)}`, updatesFor(wl));
        if (errOf(res)) failures.push({ line: emp.line, name: emp.name, error: errOf(res)! });
        else updated++;
        return;
      }
      // New: an invitation only. They show as "Not signed up" until they sign in themselves.
      const entryId = `wl${seed()}`;
      const entry = {
        id: entryId,
        employeeNumber: emp.employeeNumber,
        kekaCode: emp.employeeNumber,
        name: emp.name,
        email: emp.email,
        gender: emp.gender,
        mobile: emp.mobile,
        phone: emp.mobile,
        location: emp.location,
        dept: emp.dept,
        deptName: emp.deptName,
        jobTitle: emp.jobTitle,
        jobRole: emp.jobTitle,
        reportingManager: emp.reportingManager,
        dateJoined: emp.dateJoined,
        dob: emp.dob,
        bloodGroup: emp.bloodGroup,
        role: 'employee',
        tenantId,
        status: 'active',
      };
      const res = await api.post('/whitelist', entry);
      if (errOf(res)) {
        failures.push({ line: emp.line, name: emp.name, error: errOf(res)! });
        return;
      }
      // The follow-up PUT the website makes so the extended fields are stored.
      const ext = {
        reportingManager: emp.reportingManager || '',
        jobTitle: emp.jobTitle || '',
        jobRole: emp.jobTitle || '',
        gender: emp.gender || '',
        location: emp.location || '',
        dateJoined: emp.dateJoined || '',
        dob: emp.dob || '',
        bloodGroup: emp.bloodGroup || '',
        dept: emp.dept || null,
        employeeNumber: emp.employeeNumber || '',
        kekaCode: emp.employeeNumber || '',
      };
      const put = await api.put(`/whitelist/${encodeURIComponent(pickId(res, entryId))}`, ext);
      if (errOf(put)) failures.push({ line: emp.line, name: emp.name, error: `Added, but some details were not saved: ${errOf(put)}` });
      added++;
    },
    onProgress,
  );

  const batch = {
    id: `ub${Date.now()}`,
    type: 'employees',
    fileName,
    uploadedAt: new Date().toISOString(),
    count: rows.length,
    rows: rows.map(({ key: _k, line: _l, match: _m, action: _a, issues: _i, newDept: _n, ...r }) => r),
  };
  const b = await api.post('/upload_batches', batch);
  return { added, updated, skipped: rows.length - todo.length, departments: createdDepts, failures, batchSaved: !errOf(b) };
}

// ── Employees: update ────────────────────────────────────────────────────────
export type UpdResult = { matched: number; skipped: number; notFound: string[]; failures: RowFailure[] };

export async function applyUpdates(rows: readonly UpdRow[], onProgress?: Progress): Promise<UpdResult> {
  const fresh = await fetchRosterLists();
  const byEmpNo = (arr: RosterPerson[], n: string) => arr.find((x) => String(x.employeeNumber || x.kekaCode || '').trim() === n);
  const failures: RowFailure[] = [];
  const notFound: string[] = [];
  let skipped = 0;
  let matched = 0;
  const jobs: (() => Promise<void>)[] = [];
  for (const r of rows) {
    const u = byEmpNo(fresh.users, r.empNo);
    const w = u ? fresh.whitelist.find((x) => String(x.email || '').toLowerCase() === String(u.email || '').toLowerCase()) : byEmpNo(fresh.whitelist, r.empNo);
    if (!u && !w) {
      skipped++;
      notFound.push(r.empNo);
      continue;
    }
    if (!Object.keys(r.patch).length) {
      skipped++;
      continue;
    }
    const body = updPayload(r.patch);
    jobs.push(async () => {
      const [a, b] = await Promise.all([
        u ? api.put(`/users/${encodeURIComponent(u.id)}`, body) : Promise.resolve({}),
        w ? api.put(`/whitelist/${encodeURIComponent(w.id)}`, body) : Promise.resolve({}),
      ]);
      const e = errOf(a) || errOf(b);
      if (e) failures.push({ line: r.line, name: r.matchedName || r.empNo, error: e });
      else matched++;
    });
  }
  await inBatches(jobs, 10, (fn) => fn(), onProgress);
  return { matched, skipped, notFound, failures };
}

// ── Projects, clients, assets ────────────────────────────────────────────────
export type SimpleResult = { added: number; failures: RowFailure[]; batchSaved?: boolean };

export async function saveProjects(rows: readonly ProjRow[], today: string, onProgress?: Progress): Promise<SimpleResult> {
  const failures: RowFailure[] = [];
  let added = 0;
  await inBatches(
    rows,
    10,
    async (p) => {
      const res = await api.post('/projects', projectBody(p, seed(), today));
      if (errOf(res)) failures.push({ line: p.line, name: p.name, error: errOf(res)! });
      else added++;
    },
    onProgress,
  );
  return { added, failures };
}

export async function saveClients(rows: readonly ClientRow[], me: { id: string; name: string }, onProgress?: Progress): Promise<SimpleResult> {
  const failures: RowFailure[] = [];
  let added = 0;
  let i = 0;
  for (const r of rows) {
    const body = { id: `cl${seed()}`, managerId: me.id, managerName: me.name, name: r.name, channelName: r.channelName, email: r.email, phone: r.phone, createdAt: new Date().toISOString() };
    const res = await api.post('/clients', body);
    if (errOf(res)) failures.push({ line: r.line, name: r.name, error: errOf(res)! });
    else added++;
    onProgress?.(++i, rows.length);
  }
  return { added, failures };
}

export async function saveAssets(rows: readonly AssetRow[], fileName: string, onProgress?: Progress): Promise<SimpleResult> {
  const failures: RowFailure[] = [];
  let added = 0;
  let i = 0;
  for (const r of rows) {
    const res = await api.post('/assets', r.body);
    if (errOf(res)) failures.push({ line: r.line, name: r.body.name, error: errOf(res)! });
    else added++;
    onProgress?.(++i, rows.length);
  }
  const batch = { id: `ub${Date.now()}`, type: 'assets', fileName, uploadedAt: new Date().toISOString(), count: rows.length, rows: rows.map((r) => r.body) };
  const b = await api.post('/upload_batches', batch);
  return { added, failures, batchSaved: !errOf(b) };
}

// ── Subscriptions ────────────────────────────────────────────────────────────
export type SubResult = { subscriptionsCreated: number; subscriptionsUpdated: number; paymentsCreated: number; skipped: string[] };

/** The actor travels as `performedById` in the body (api.post adds it, subscriptions.js actorIdOf). */
export async function importSubscriptions(parsed: SubImport): Promise<SubResult> {
  const r = await api.post<SubResult>('/subscriptions/import', { subscriptions: parsed.subscriptions, payments: parsed.payments });
  if (isApiError(r)) throw new Error(r.error);
  return {
    subscriptionsCreated: Number(r?.subscriptionsCreated) || 0,
    subscriptionsUpdated: Number(r?.subscriptionsUpdated) || 0,
    paymentsCreated: Number(r?.paymentsCreated) || 0,
    skipped: Array.isArray(r?.skipped) ? r.skipped.map(String) : [],
  };
}

/** Whether this person may write subscriptions (the server's canManage, GET /subscriptions). */
export function useSubscriptionsCanManage(enabled: boolean) {
  const uid = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['excel', 'subs-can-manage', uid ?? ''],
    enabled: enabled && !!uid,
    meta: { persist: false },
    queryFn: async () => {
      const r = await unwrap(api.get<{ canManage?: boolean }>(`/subscriptions?actorId=${encodeURIComponent(uid ?? '')}`));
      return !!r?.canManage;
    },
  });
}

// ── Upload history ───────────────────────────────────────────────────────────
export type UploadBatch = { id: string; type: string; fileName: string; uploadedAt: string; count: number; rows: Record<string, unknown>[] };

/** GET /upload_batches, filtered to one type (employees or assets), newest first. Never persisted. */
export function useUploadBatches(type: 'employees' | 'assets', enabled = true) {
  const uid = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['excel', 'batches', type, uid ?? ''],
    enabled: enabled && !!uid,
    meta: { persist: false },
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<UploadBatch[]>('/upload_batches', signal));
      return (Array.isArray(r) ? r : [])
        .filter((b) => !!b && b.type === type)
        .map((b) => ({ ...b, rows: Array.isArray(b.rows) ? b.rows : [], count: Number(b.count) || (Array.isArray(b.rows) ? b.rows.length : 0) }))
        .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
    },
  });
}

// ── Read-only lists for the downloads ────────────────────────────────────────
/**
 * One GET list (an array, or `{ [field]: [] }`) for a download screen. Never persisted (these hold
 * personal and company data), refetched when the screen opens.
 */
export function useApiList<T = Record<string, unknown>>(path: string | null, opts: { enabled?: boolean; field?: string } = {}) {
  const uid = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['excel', 'list', path ?? '', opts.field ?? '', uid ?? ''],
    enabled: (opts.enabled ?? true) && !!uid && !!path,
    meta: { persist: false },
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<T[]> => {
      const r = await unwrap(api.get<unknown>(path!, signal));
      const list = opts.field && r && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, unknown>)[opts.field] : r;
      return Array.isArray(list) ? (list.filter((x) => !!x && typeof x === 'object') as T[]) : [];
    },
  });
}
