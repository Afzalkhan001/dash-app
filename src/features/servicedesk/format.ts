// Service desk words and small pure helpers (web: ServiceDesk dash.html:21170–21195, 21321–21362).
// Labels reuse Support's (features/support/format: refNo, ticketStatus, subjectLabel, CATEGORY), so a
// request reads the same on the employee's side and on the desk. India time throughout.

import type { DeskDepartment, DeskTicket } from '@/api/servicedesk';
import { CATEGORY, refNo, subjectLabel, TICKET_TYPES } from '@/features/support/format';
import { istDateOf } from '@/lib/dates';

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const cap = (v: string) => (v ? v[0]!.toUpperCase() + v.slice(1) : v);

/** Who raised it (the web's `t.from || t.raisedByName`). */
export const raiserOf = (t: DeskTicket) => s(t.from) || s(t.raisedByName) || 'Someone';

/** The department it was raised from. */
export const deptOf = (t: DeskTicket) => s(t.dept) || s(t.deptName);

/**
 * dash.html:21180 categoryLabelFor — the subtype the Category column shows and filters on: the ticket
 * type's label, the equipment, the office item, the complaint type.
 */
export function categoryLabelFor(t: DeskTicket) {
  if (t.category === 'ticket') {
    const raw = s(t.type);
    return TICKET_TYPES.find((x) => x.value === raw.toLowerCase())?.label || cap(raw) || 'IT help';
  }
  if (t.category === 'asset') return s(t.assetType) || 'Equipment';
  if (t.category === 'admin_request') return s(t.itemType) || 'Office request';
  if (t.category === 'complaint') return s(t.type) || 'Complaint';
  return cap(s(t.category));
}

/** The four kinds in plain words ("IT help", "Equipment", "Office request", "Complaint"). */
export const kindLabel = (t: DeskTicket) => CATEGORY[t.category || '']?.label ?? 'Request';
export const kindIcon = (t: DeskTicket) => CATEGORY[t.category || '']?.icon ?? CATEGORY.ticket!.icon;

/** What it is about (the Subject / Item column: "2x Laptop", or the subject). */
export const whatOf = (t: DeskTicket) => subjectLabel(t);

/** The reference the employee sees (TKT-…, AST-…). */
export const refOf = (t: DeskTicket) => refNo(t.id, t.category);

/** The India calendar day it was raised (the web's Date column and date filter). */
export function dayOf(t: DeskTicket) {
  const d = s(t.date).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return istDateOf(t.createdAt) ?? '';
}

/** When it came in, for sorting and day groups (createdAt, else the day it was raised). */
export const whenOf = (t: DeskTicket) => s(t.createdAt) || (dayOf(t) ? `${dayOf(t)}T06:30:00.000Z` : '');

/** dash.html:21189 search: reference, subject, who raised it, department. */
export function matchesSearch(t: DeskTicket, q: string) {
  const sq = q.trim().toLowerCase();
  if (!sq) return true;
  return [refOf(t), s(t.subject), whatOf(t), raiserOf(t), deptOf(t)].some((v) => v.toLowerCase().includes(sq));
}

/** Case-insensitively de-duplicated options, keeping a properly capitalised variant (dash.html:21185). */
export function uniqueOptions(values: string[]) {
  const byKey = new Map<string, string>();
  for (const l of values) {
    if (!l) continue;
    const k = l.toLowerCase();
    const existing = byKey.get(k);
    if (!existing || (existing === existing.toLowerCase() && l !== l.toLowerCase())) byKey.set(k, l);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * dash.html:21085 — the IT & Admin department: a name with "it … admin" or "admin … it", else one
 * with the word "IT".
 */
export function findItDept(depts: DeskDepartment[] | undefined | null) {
  const list = Array.isArray(depts) ? depts : [];
  return list.find((d) => /it.*admin|admin.*it/i.test(d.name || '')) ?? list.find((d) => /\bit\b/i.test(d.name || '')) ?? null;
}

/**
 * dash.html:21091–21095 — who can be assigned: the IT & Admin department's members (by department id
 * or name), or every IT Admin when there is no such department; never an Admin-role user. People on
 * leave today are shown in the picker but can't be chosen.
 */
export function isAssignable(p: { role?: string; dept?: string; extra?: Record<string, unknown> }, itDept: DeskDepartment | null) {
  if (p.role === 'admin') return false;
  if (!itDept) return p.role === 'it_admin';
  const raw = s(p.extra?.dept) || s(p.dept);
  const name = itDept.name.toLowerCase();
  return raw === itDept.id || (!!name && raw.toLowerCase() === name);
}

/** "Mon, 19 Oct" → the status words for a status the picker offers. */
export const STATUS_WORDS: Record<string, string> = {
  open: 'Open',
  pending_approval: 'Waiting for approval',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};
export const statusWords = (st?: string) => STATUS_WORDS[st || ''] || cap(String(st || '').replace(/_/g, ' ')) || '—';

/**
 * Whether the server can message the person who raised it: it looks them up by raisedById / userId
 * (routes/tickets.js getUserById), so a request raised for someone invited but not signed up yet
 * ("wl_…", dash.html:6861) reaches nobody.
 */
export function raiserReachable(t: DeskTicket) {
  const id = s(t.raisedById) || s(t.userId);
  return !!id && !id.startsWith('wl_');
}

/** First name, for short lines ("Sneha gets an email…"). */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
