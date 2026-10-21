// HR setup (the hrtime domain): offices and the company clock-in policy, per-person clock-in rules,
// shifts and who works them, holidays, leave types and rules, company leave balances, and writing
// policies. Every route already exists on the server (docs/port/hr-setup-payroll.md §2.1–2.4):
//   hr.js           PUT /hr/attendance/settings ~L611, /hr/locations ~L624–663, /hr/attendance/people ~L674–693
//   hr_time.js      /hr/holidays ~L47–75, /hr/shifts ~L121–185, /hr/shifts/assignments ~L133–143
//   hr_leave.js     PUT /hr/leave/settings ~L102, /hr/leave/types ~L140–170, GET /hr/leave/balances ~L230,
//                   POST /hr/leave/adjustments ~L246, POST /hr/leave/carry-forward ~L267
//   hr_policies.js  GET ?all=1 ~L80, POST/PUT ~L105–119, publish/archive ~L139, -meta/departments ~L174, acks ~L183
// Writes are hrAdminGate on the server: Super Admin and HR only, with the module switched on.
// Reads the app already had (attendance settings, shifts, holidays, leave types/settings, one policy)
// stay in api/attendance, api/hr, api/leave and api/policies; the writes here invalidate their keys.
//
// No message of any kind (WhatsApp, email, push) is sent by any of these routes (spec §0).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AttendanceSettings, OfficeLocation, Shift } from '@/api/attendance';
import { api, unwrap } from '@/api/client';
import type { Holiday } from '@/api/hr';
import type { LeaveSettings, LeaveType } from '@/api/leave';
import type { Policy, PolicySummary } from '@/api/policies';
import { useSession } from '@/auth/session';
import { haptic } from '@/ui';

const useUid = () => useSession((s) => s.user?.id);
const enc = encodeURIComponent;

// ── Types (the handlers' own shapes) ─────────────────────────────────────────
export type ClockMode = 'default' | 'geofence' | 'flexible' | 'remote';
export type ClockRulePerson = { id: string; name: string; role: string; department: string; mode: ClockMode; location_ids: string[] };
export type ShiftPerson = { id: string; name: string; role: string; departmentId: string | null; department: string; shift_id: string | null };
export type CompanyBalance = { leave_type_id: string; available: number; used: number; pending: number; entitlement: number; adjusted: number };
export type BalancePerson = { id: string; name: string; role: string; departmentId: string | null; department: string; balances: CompanyBalance[] };
export type CompanyBalances = { year: number; types: LeaveType[]; people: BalancePerson[] };
export type PolicyDepartment = { id: string; name: string };
export type PolicyAcks = { version: number; total: number; acknowledged: number; people: { id: string; name: string; department: string; acked_at: string | null }[] };

export type OfficeInput = { name: string; lat: number; lng: number; radius_m: number; address: string };
export type ShiftInput = Omit<Shift, 'id'>;
export type HolidayInput = { date: string; name: string; optional: boolean };
export type LeaveTypeInput = Omit<LeaveType, 'id'>;
export type PolicyInput = { title: string; category: string; body: string; link_url: string; requires_ack: boolean; audience: string[] };

// ── Query keys ───────────────────────────────────────────────────────────────
// Everything new sits under ['hrtime', …]; the shared keys belong to the employee screens.
export const hrtimeKeys = {
  locations: ['hrtime', 'locations'] as const,
  clockRules: ['hrtime', 'clock-rules'] as const,
  shiftPeople: ['hrtime', 'shift-people'] as const,
  balances: ['hrtime', 'balances'] as const,
  policies: ['policies'] as const,
};

// ── Reads ────────────────────────────────────────────────────────────────────
export function useOffices(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: [...hrtimeKeys.locations, userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ locations: OfficeLocation[] }>('/hr/locations', signal))).locations ?? [],
  });
}

export function useClockRules(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: [...hrtimeKeys.clockRules, userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ people: ClockRulePerson[] }>('/hr/attendance/people', signal))).people ?? [],
    // Up to 5000 people: kept in memory only.
    meta: { persist: false },
  });
}

export function useShiftPeople(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: [...hrtimeKeys.shiftPeople, userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ people: ShiftPerson[] }>('/hr/shifts/assignments', signal))).people ?? [],
    meta: { persist: false },
  });
}

/** Everyone's leave balances for a leave year (heavy on the server: up to 50k rows read). */
export function useCompanyBalances(year: number | null, enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: [...hrtimeKeys.balances, userId, year],
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => unwrap(api.get<CompanyBalances>(`/hr/leave/balances${year ? `?year=${year}` : ''}`, signal)),
    meta: { persist: false },
    staleTime: 60_000,
  });
}

/** Drafts, published and archived (HR admins; the server ignores all=1 for anyone else). */
export function useAllPolicies(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: ['policies', 'all', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ policies: PolicySummary[] }>('/hr/policies?all=1', signal))).policies ?? [],
  });
}

export function usePolicyDepartments(enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: ['policies', 'departments', userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => (await unwrap(api.get<{ departments: PolicyDepartment[] }>('/hr/policies-meta/departments', signal))).departments ?? [],
    staleTime: 10 * 60_000,
  });
}

export function usePolicyAcks(id: string | undefined, enabled = true) {
  const userId = useUid();
  return useQuery({
    queryKey: ['policies', 'acks', userId, id],
    enabled: enabled && !!userId && !!id,
    queryFn: ({ signal }) => unwrap(api.get<PolicyAcks>(`/hr/policies/${enc(id!)}/acks`, signal)),
    meta: { persist: false },
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────
// One hook per area. Each mutation unwraps `{ error }` into a thrown Error carrying the server's own
// words (screens show `error.message`), gives one haptic, and refreshes every screen that shows the data.

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: readonly (readonly string[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [...k] })));
}

const ok = () => haptic.success();
const bad = () => haptic.error();

/** Offices (geofence) and the company clock-in policy. */
export function useAttendanceSetupActions() {
  const refresh = useInvalidate();
  const after = () => refresh(hrtimeKeys.locations, ['att-today'], ['att-settings'], ['leave-weekly-off'], hrtimeKeys.clockRules);
  return {
    saveOffice: useMutation({
      mutationFn: ({ id, input }: { id?: string; input: OfficeInput }) =>
        unwrap(id ? api.put<{ location: OfficeLocation }>(`/hr/locations/${enc(id)}`, input) : api.post<{ location: OfficeLocation }>('/hr/locations', input)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    removeOffice: useMutation({
      mutationFn: (id: string) => unwrap(api.del(`/hr/locations/${enc(id)}`)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    savePolicy: useMutation({
      mutationFn: (patch: Partial<AttendanceSettings>) => unwrap(api.put<{ settings: AttendanceSettings }>('/hr/attendance/settings', patch)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    setRules: useMutation({
      mutationFn: (body: { employee_ids: string[]; mode: ClockMode; location_ids: string[] }) => unwrap(api.put<{ updated: number }>('/hr/attendance/people', body)),
      onSuccess: () => (ok(), refresh(hrtimeKeys.clockRules, ['att-today'])),
      onError: bad,
    }),
  };
}

/** Shifts and who works them. */
export function useShiftActions() {
  const refresh = useInvalidate();
  const after = () => refresh(['att-shifts'], ['att-shift-mine'], ['leave-shift'], ['att-today'], hrtimeKeys.shiftPeople);
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: string; input: ShiftInput }) =>
        unwrap(id ? api.put<{ shift: Shift }>(`/hr/shifts/${enc(id)}`, input) : api.post<{ shift: Shift }>('/hr/shifts', input)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    remove: useMutation({
      mutationFn: (id: string) => unwrap(api.del(`/hr/shifts/${enc(id)}`)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    assign: useMutation({
      mutationFn: (body: { employee_ids: string[]; shift_id: string | null }) => unwrap(api.put<{ updated: number }>('/hr/shifts/assignments', body)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
  };
}

/** Holidays: add, edit, remove (a hard delete; it can be added again). */
export function useHolidayActions() {
  const refresh = useInvalidate();
  const after = () => refresh(['holidays']);
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: string; input: HolidayInput }) =>
        unwrap(id ? api.put<{ holiday: Holiday }>(`/hr/holidays/${enc(id)}`, input) : api.post<{ holiday: Holiday }>('/hr/holidays', input)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    remove: useMutation({
      mutationFn: (id: string) => unwrap(api.del(`/hr/holidays/${enc(id)}`)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
  };
}

/** Leave types, the leave rules, adjustments and carry forward. */
export function useLeaveSetupActions() {
  const refresh = useInvalidate();
  const after = () => refresh(['leave-types'], ['leave-settings'], ['leave-balances'], hrtimeKeys.balances);
  return {
    saveType: useMutation({
      mutationFn: ({ id, input }: { id?: string; input: LeaveTypeInput }) =>
        unwrap(id ? api.put<{ type: LeaveType }>(`/hr/leave/types/${enc(id)}`, input) : api.post<{ type: LeaveType }>('/hr/leave/types', input)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    retireType: useMutation({
      mutationFn: (id: string) => unwrap(api.del(`/hr/leave/types/${enc(id)}`)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    saveRules: useMutation({
      mutationFn: (patch: Partial<LeaveSettings>) => unwrap(api.put<{ settings: LeaveSettings }>('/hr/leave/settings', patch)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    adjust: useMutation({
      mutationFn: (body: { employee_id: string; leave_type_id: string; year: number; days: number; reason: string }) =>
        unwrap(api.post<{ adjustment: { id: string; days: number; year: number } }>('/hr/leave/adjustments', body)),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
    carryForward: useMutation({
      mutationFn: (fromYear: number) => unwrap(api.post<{ credits: number }>('/hr/leave/carry-forward', { from_year: fromYear })),
      onSuccess: () => (ok(), after()),
      onError: bad,
    }),
  };
}

/** Writing policies: create, edit (a material edit of a published one is a new version), publish, archive. */
export function usePolicyAdminActions() {
  const refresh = useInvalidate();
  const after = () => refresh(hrtimeKeys.policies);
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: string; input: PolicyInput }) =>
        unwrap(
          id
            ? api.put<{ policy: Policy; newVersion: boolean }>(`/hr/policies/${enc(id)}`, input)
            : api.post<{ policy: Policy; newVersion?: boolean }>('/hr/policies', input),
        ),
      onSuccess: () => (ok(), after()),
      onError: () => (bad(), after()),
    }),
    publish: useMutation({
      mutationFn: (id: string) => unwrap(api.post<{ policy: Policy }>(`/hr/policies/${enc(id)}/publish`, {})),
      onSuccess: () => (ok(), after()),
      onError: () => (bad(), after()),
    }),
    archive: useMutation({
      mutationFn: (id: string) => unwrap(api.post<{ policy: Policy }>(`/hr/policies/${enc(id)}/archive`, {})),
      onSuccess: () => (ok(), after()),
      onError: () => (bad(), after()),
    }),
  };
}
