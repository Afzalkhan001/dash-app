// Words and small helpers for the visitor desk. The status words, dates, times and phone numbers are
// the Visitors screens' own (features/visitors/format), so the desk and the host read the same.

import type { Visit } from '@/api/visitors';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export const visitorName = (v: Pick<Visit, 'visitorName'>) => str(v.visitorName) || 'Visitor';
export const hostName = (v: Pick<Visit, 'hostName'>) => str(v.hostName) || 'their host';
export const purposeOf = (v: Pick<Visit, 'purpose'>) => str(v.purpose);

/** pending or no_response: still waiting for someone to answer (the server's own test). */
export const isWaiting = (v: Pick<Visit, 'status'>) => v.status === 'pending' || v.status === 'no_response';

/** In the building: approved and not checked out (visitors.js:578). Check out is offered only for these. */
export const isInside = (v: Pick<Visit, 'status' | 'checkOutAt'>) => v.status === 'approved' && !v.checkOutAt;

/** How they checked in (web: "invited" / the source as is). */
export function sourceLabel(source?: string | null) {
  switch (source) {
    case 'invite':
      return 'Invite code';
    case 'kiosk':
      return 'Kiosk';
    case 'qr':
      return 'Their phone (QR code)';
    default:
      return str(source);
  }
}

/**
 * The desk's let-in clock (web: VisitCard, dash.html:35821). The host gets `afterMin` minutes to answer;
 * after that the desk may let the visitor in. `now` is the SERVER's time (Date.now() + skew), so a phone
 * whose clock is off neither unlocks early (the server would refuse) nor late.
 */
export function letInClock(v: Pick<Visit, 'createdAt' | 'letInAt'>, now: number, afterMin: number) {
  const created = Date.parse(String(v.createdAt));
  const sent = Date.parse(String(v.letInAt ?? ''));
  const opensAt = Number.isFinite(sent) ? sent : Number.isFinite(created) ? created + afterMin * 60_000 : now;
  const waitedMs = Number.isFinite(created) ? Math.max(0, now - created) : 0;
  const leftMs = Math.max(0, opensAt - now);
  return { canLetIn: leftMs <= 0, leftMs, waitedMs };
}

/** "4:05" for a span in ms, "2 h 0 min" past an hour (web: visitClock). */
export function mmss(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Digits to dial ('tel:'), or '' when there is no usable number. */
export function dialOf(mobile?: string | null) {
  const d = String(mobile ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  return d.length >= 6 ? d : '';
}

/** Today's visits in the board's three groups (the server sends newest first; waiting = oldest first). */
export function splitToday(list: Visit[]) {
  const all = Array.isArray(list) ? list : [];
  const waiting = all.filter(isWaiting).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const inside = all.filter(isInside);
  const earlier = all.filter((v) => !isWaiting(v) && !isInside(v));
  return { waiting, inside, earlier };
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
