// hradvanced writes and the one extra read. Every route already exists on the server:
//   POST /hr/salary/structures            hr_payroll.js ~L121 (salary)  409 on a duplicate name
//   PUT  /hr/salary/structures/:id        hr_payroll.js ~L140 (salary)  never changes existing salaries
//   PUT  /hr/statutory                    hr_payroll.js ~L65  (tax)     partial sections, returns missing[]
//   GET  /hr/admin/db-check               hr.js:437 (HR_ADMIN_ROLES)    which HR SQL files still need running
//   PUT  /tenants/:id                     routes/tenants.js:53          logoUrl / logoText / reportLogoUrl / profTypes
//   GET  /bookings?since, GET /holds, POST /holds, DELETE /holds/:id, PUT /bookings/:id {endTime}
//                                         routes/bookings.js:193, server.js holds ~L4725–4800
// None of these sends any message (hr*.js sends nothing; PUT /bookings only emails on a status change).
// Pay and tax data is `meta.persist = false` (kept out of the on-disk cache), as in api/payroll.ts.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchBookings, type Hold, postHold, putBookingStrict, releaseHold } from '@/api/booking';
import { api, unwrap } from '@/api/client';
import { payrollKeys, type SalaryComponent, type SalaryStructure, type Statutory, type StatutoryAnswer } from '@/api/payroll';
import { useSession } from '@/auth/session';
import { haptic } from '@/ui';

const enc = encodeURIComponent;

export type StructureBody = { name: string; description: string; components: SalaryComponent[] };

export function useStructureSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string | null; body: StructureBody }) => {
      const r = await unwrap(
        id ? api.put<{ structure?: SalaryStructure }>(`/hr/salary/structures/${enc(id)}`, body) : api.post<{ structure?: SalaryStructure }>('/hr/salary/structures', body),
      );
      return r?.structure ?? null;
    },
    onSuccess: () => {
      haptic.success();
      void qc.invalidateQueries({ queryKey: payrollKeys.structures });
    },
    onError: () => haptic.error(),
  });
}

/** Fresh statutory settings, straight from the server (to compare with what the form started from). */
export async function fetchStatutory(): Promise<StatutoryAnswer> {
  const r = await unwrap(api.get<StatutoryAnswer>('/hr/statutory'));
  return { statutory: r.statutory, missing: Array.isArray(r.missing) ? r.missing : [] };
}

export function useStatutorySave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Statutory) => {
      const r = await unwrap(api.put<Partial<StatutoryAnswer>>('/hr/statutory', body));
      return { statutory: r?.statutory ?? null, missing: Array.isArray(r?.missing) ? r.missing : null };
    },
    onSuccess: () => {
      haptic.success();
      void qc.invalidateQueries({ queryKey: payrollKeys.statutory });
      void qc.invalidateQueries({ queryKey: payrollKeys.runs });
    },
    onError: () => haptic.error(),
  });
}

export type DbCheck = { ok: boolean; runFiles: string[]; order: string[]; results: { table: string; ok: boolean; missing?: string | null; file?: string; problem?: string }[] };

export function useHrDbCheck(enabled: boolean) {
  const uid = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: ['hradvanced', 'db-check', uid],
    enabled: enabled && !!uid,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<Partial<DbCheck>>('/hr/admin/db-check', signal));
      return {
        ok: r?.ok !== false,
        runFiles: Array.isArray(r?.runFiles) ? r.runFiles : [],
        order: Array.isArray(r?.order) ? r.order : [],
        results: Array.isArray(r?.results) ? r.results : [],
      } as DbCheck;
    },
  });
}

// ── Extend shoot time ────────────────────────────────────────────────────────
export async function fetchHolds(resourceId: string, date: string): Promise<Hold[]> {
  const r = await unwrap(api.get<Hold[]>(`/holds?resourceType=pro&resourceId=${enc(resourceId)}&date=${enc(date)}`));
  return Array.isArray(r) ? r : [];
}

export { fetchBookings };

/**
 * Hold the extra time, save the new end, let the hold go. The hold makes the server refuse (409) when
 * the time was taken a moment ago; the booking's own end is the only thing changed.
 */
export async function extendBooking(o: { bookingId: string; resourceId: string; date: string; fromMin: number; toMin: number; endTime: string; me: { id?: string; name?: string } }) {
  let holdId: string | null = null;
  if (o.resourceId) {
    const h = await postHold({ resourceType: 'pro', resourceId: o.resourceId, date: o.date, userId: o.me.id, userName: o.me.name, startMin: o.fromMin, endMin: o.toMin });
    holdId = h?.holdId ?? null;
  }
  try {
    await putBookingStrict(o.bookingId, { endTime: o.endTime });
  } finally {
    if (holdId) void releaseHold(holdId).catch(() => {});
  }
}
