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

/** "Afzal Visitor Manager in the app" / "Naveen Kumar on WhatsApp" (web: "by <decidedBy> (<via>)"). */
export function decidedByLine(v: Pick<Visit, 'decidedBy' | 'decidedVia'>) {
  const by = str(v.decidedBy);
  if (!by) return '';
  const via = v.decidedVia === 'whatsapp' ? 'on WhatsApp' : v.decidedVia === 'app' ? 'in the app' : '';
  return via ? `${by} ${via}` : by;
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
