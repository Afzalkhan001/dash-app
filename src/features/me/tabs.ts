// The Me tab's segments — Attendance | Leave | Pay — and the links that open one of them
// (/me?tab=…). The old routes /attendance, /leave and /pay redirect here (see redirect.tsx).

export type MeTab = 'attendance' | 'leave' | 'pay';

export const ME_TAB_LABEL: Record<MeTab, string> = { attendance: 'Attendance', leave: 'Leave', pay: 'Pay' };

export const isMeTab = (v: unknown): v is MeTab => v === 'attendance' || v === 'leave' || v === 'pay';

/**
 * Which segments Me shows, in order (shared by the Me tab and the first-sign-in tour, so they agree):
 * Attendance with any attendance part (clock, team view, shifts, attendance fixes), Leave with
 * useLeaveAccess().enabled, Pay with usePayAccess().pay.
 */
export function meSegmentsFor(
  sections: { attendance: boolean; clock: boolean; shifts: boolean; regularization: boolean },
  leaveEnabled: boolean,
  pay: boolean,
): MeTab[] {
  const out: MeTab[] = [];
  if (sections.attendance || sections.clock || sections.shifts || sections.regularization) out.push('attendance');
  if (leaveEnabled) out.push('leave');
  if (pay) out.push('pay');
  return out;
}

/** The link that opens Me on one segment. */
export const meHref = (tab: MeTab) => `/me?tab=${tab}`;

/**
 * Which cached queries a pull-to-refresh on a segment reloads (only the ones on screen refetch; the
 * rest are just marked stale). Same sets the old Attendance tab, Leave tab and My Pay refreshed.
 */
export function refreshesQuery(tab: MeTab | null, key: readonly unknown[]) {
  const k = String(key[0] ?? '');
  if (tab === 'attendance') return k.startsWith('att-') || k === 'holidays';
  if (tab === 'leave') return k === 'leave-balances' || k === 'leave-requests';
  if (tab === 'pay') return k === 'pay';
  return false;
}
