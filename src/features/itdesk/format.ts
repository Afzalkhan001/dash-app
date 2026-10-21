// IT desk — pure helpers ported from the website's AssetCatalog (dash.html:20106–20520) and
// RoomsLocations (dash.html:21820–21982). No hooks, no clock: callers pass `today` / `now`.

import type { LucideIcon } from 'lucide-react-native';
import { AppWindow, Armchair, Car, CircleAlert, CircleCheck, CircleMinus, CircleX, Computer, Laptop, Monitor, Package, Printer, Smartphone, Tablet, Zap } from 'lucide-react-native';

import type { Asset, Invitee } from '@/api/itdesk';
import type { PickPerson } from '@/features/shared/person-picker';
import { addDaysYmd, istIsoAt } from '@/lib/ist';
import { istDateOf } from '@/lib/dates';
import type { StatusTone } from '@/theme/tokens';

// ── Lists the website offers ─────────────────────────────────────────────────
/** dash.html:20232 */
export const ASSET_CATEGORIES = ['Electronics', 'Furniture', 'Vehicle', 'Machinery', 'Software', 'Other'];
/** dash.html:20233 */
export const ASSET_CONDITIONS = ['Good', 'Fair', 'Not Working'];
/** dash.html:21677 */
export const ROOM_AMENITIES = ['Projector', 'Whiteboard', 'TV Screen', 'Video Conferencing', 'AC', 'Sound System'];
/** dash.html:21413 */
export const LOCATION_CITIES = ['Hyderabad', 'Bangalore', 'Chennai', 'Mumbai', 'Delhi', 'Pune', 'Kolkata'];
export const SLOT_LENGTHS = [30, 60, 120];
export const BUFFERS = [0, 15, 30, 60];
export const MIN_DURATIONS = [30, 60, 120];
export const MAX_DURATIONS = [120, 240, 480, 720];

/**
 * dash.html:21835 PURPOSE_SWATCHES — the nine colour pairs a booking purpose can carry. These are
 * stored data (the website and the booking forms draw the purpose chip in them), not app colours.
 */
export const PURPOSE_SWATCHES: { color: string; bg: string; name: string }[] = [
  { color: '#2563eb', bg: '#dbeafe', name: 'Blue' },
  { color: '#16a34a', bg: '#dcfce7', name: 'Green' },
  { color: '#ea580c', bg: '#fed7aa', name: 'Orange' },
  { color: '#7c3aed', bg: '#ede9fe', name: 'Violet' },
  { color: '#0891b2', bg: '#cffafe', name: 'Teal' },
  { color: '#db2777', bg: '#fce7f3', name: 'Pink' },
  { color: '#ca8a04', bg: '#fef9c3', name: 'Yellow' },
  { color: '#dc2626', bg: '#fee2e2', name: 'Red' },
  { color: '#475569', bg: '#f1f5f9', name: 'Grey' },
];

// ── Asset state ──────────────────────────────────────────────────────────────
/** dash.html:20430 assetStatus — an employee number means "assigned", whatever the stored status. */
export const assetStatus = (a: Asset) => (a.assignedToEmpNo ? 'assigned' : a.status || 'available');
export const isAssigned = (a: Asset) => !!a.assignedToEmpNo;

/** dash.html:20504 ackCell: acknowledged / waiting (a link was sent) / not sent. */
export type AckState = 'none' | 'done' | 'waiting' | 'not-sent';
export function ackState(a: Asset): AckState {
  if (!a.assignedToEmpNo) return 'none';
  if (a.acknowledged) return 'done';
  if (a.ackToken) return 'waiting';
  return 'not-sent';
}
export const ACK_WORDS: Record<AckState, { label: string; tone: StatusTone }> = {
  none: { label: 'In stock', tone: 'neutral' },
  done: { label: 'Acknowledged', tone: 'done' },
  waiting: { label: 'Waiting for them', tone: 'pending' },
  'not-sent': { label: 'Link not sent', tone: 'neutral' },
};

/** dash.html:20503 condBadge colours, as status tones. */
export function conditionTone(c: string): StatusTone {
  if (c === 'Good') return 'done';
  if (c === 'Poor' || c === 'Not Working') return 'failed';
  return c ? 'pending' : 'neutral';
}
export const conditionWords = (c: string) => (c === 'Not Working' ? 'Not working' : c || '—');
/** The condition picker's tile icons (the word is always under it). */
export const conditionIcon = (c: string): LucideIcon => (c === 'Good' ? CircleCheck : c === 'Fair' ? CircleMinus : c === 'Not Working' ? CircleX : CircleAlert);

/** A warranty date as 'YYYY-MM-DD' (IST), or '' — the website's `dnum` accepts loose text too. */
export function warrantyYmd(v: string) {
  const s = String(v || '').trim();
  if (!s) return '';
  const direct = istDateOf(s.slice(0, 10)) || istDateOf(s);
  if (direct) return direct;
  const t = Date.parse(s);
  return Number.isFinite(t) ? istDateOf(new Date(t).toISOString()) : '';
}

/** dash.html:20480–20481: expiring within 60 days (today counts), and already expired. */
export const warrantySoon = (a: Asset, today: string) => {
  const d = warrantyYmd(a.warrantyExpiry);
  return !!d && d >= today && d <= addDaysYmd(today, 60);
};
export const warrantyGone = (a: Asset, today: string) => {
  const d = warrantyYmd(a.warrantyExpiry);
  return !!d && d < today;
};

export type AssetKpis = { total: number; value: number; assigned: number; available: number; ackWaiting: number; ackDone: number; soon: number; expired: number };

/** dash.html:20477–20482 */
export function assetKpis(list: Asset[], today: string): AssetKpis {
  const assigned = list.filter(isAssigned);
  return {
    total: list.length,
    value: list.reduce((s, a) => s + (Number(a.price) || 0), 0),
    assigned: assigned.length,
    available: list.length - assigned.length,
    ackWaiting: assigned.filter((a) => !a.acknowledged && a.ackToken).length,
    ackDone: assigned.filter((a) => a.acknowledged).length,
    soon: list.filter((a) => warrantySoon(a, today)).length,
    expired: list.filter((a) => warrantyGone(a, today)).length,
  };
}

// ── Icons (dash.html:20106 astIconFor) ───────────────────────────────────────
export function assetIcon(type: string, cat: string): LucideIcon {
  const t = String(type || '').toLowerCase();
  const c = String(cat || '').toLowerCase();
  if (/macbook|laptop|notebook/.test(t)) return Laptop;
  if (/mini ?pc|desktop|cpu|tower|workstation/.test(t)) return Computer;
  if (/phone|mobile|iphone|handset/.test(t)) return Smartphone;
  if (/\btab\b|tablet|ipad/.test(t)) return Tablet;
  if (/\btv\b|monitor|display|screen|projector/.test(t)) return Monitor;
  if (/printer|scanner|copier/.test(t)) return Printer;
  if (/\bups\b|power|battery|inverter/.test(t)) return Zap;
  if (/furniture/.test(c)) return Armchair;
  if (/vehicle/.test(c)) return Car;
  if (/software/.test(c)) return AppWindow;
  return Package;
}

// ── Grouping (dash.html:20456–20469): the Mac family is one kind, case/space variants one label ──
const MAC_FAMILY_RE = /mac\s*book|mackbook|\bmb[ap]\b|\bimac\b|mac\s*mini|mac\s*pro\b|mac\s*studio/i;
const tidy = (v: string) => String(v || '').trim().replace(/\s+/g, ' ');
const rawKind = (a: Asset) => (MAC_FAMILY_RE.test([a.name, a.assetType].filter(Boolean).join(' ')) ? 'Mac' : tidy(a.assetType));

function canonLabels(vals: string[]) {
  const cnt = new Map<string, Map<string, number>>();
  vals.forEach((v) => {
    if (!v) return;
    const k = v.toLowerCase();
    const m = cnt.get(k) ?? new Map<string, number>();
    m.set(v, (m.get(v) ?? 0) + 1);
    cnt.set(k, m);
  });
  const out = new Map<string, string>();
  cnt.forEach((m, k) => out.set(k, [...m.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]![0]));
  return out;
}

export type Grouping = { catOf: (a: Asset) => string; kindOf: (a: Asset) => string };

/** Builds the website's category / kind labels for one asset list. */
export function grouping(list: Asset[]): Grouping {
  const kindLabels = canonLabels(list.map(rawKind));
  const catLabels = canonLabels(list.map((a) => tidy(a.category)));
  const macCount = new Map<string, number>();
  list.forEach((a) => {
    if (rawKind(a) !== 'Mac') return;
    const c = tidy(a.category);
    if (c) macCount.set(c, (macCount.get(c) ?? 0) + 1);
  });
  const top = [...macCount.entries()].sort((x, y) => y[1] - x[1])[0];
  const macCategory = top ? catLabels.get(top[0].toLowerCase()) || top[0] : '';
  const kindOf = (a: Asset) => {
    const k = rawKind(a);
    return k ? kindLabels.get(k.toLowerCase()) || k : '';
  };
  const catOf = (a: Asset) => {
    if (macCategory && rawKind(a) === 'Mac') return macCategory;
    const c = tidy(a.category);
    return c ? catLabels.get(c.toLowerCase()) || c : 'Uncategorised';
  };
  return { catOf, kindOf };
}

/** dash.html:20484 groups: category → total / assigned, sorted by name. */
export function categoryCounts(list: Asset[], g: Grouping) {
  const m = new Map<string, { cat: string; total: number; assigned: number }>();
  list.forEach((a) => {
    const c = g.catOf(a);
    const row = m.get(c) ?? { cat: c, total: 0, assigned: 0 };
    row.total++;
    if (isAssigned(a)) row.assigned++;
    m.set(c, row);
  });
  return [...m.values()].sort((x, y) => x.cat.localeCompare(y.cat));
}

// ── Employee-number lookup (dash.html:20142 empNameFor) ──────────────────────
type Directory = { users: PickPerson[]; invitees: Invitee[] };
const normNo = (v: unknown) => String(v ?? '').trim().replace(/\.0+$/, '').toLowerCase();
const userNos = (u: PickPerson) => [u.employeeNumber, u.extra?.kekaCode, u.extra?.employeeNumber].filter((v) => v !== undefined && v !== null && v !== '').map(normNo);
const inviteeNos = (w: Invitee) => [w.employeeNumber, w.kekaCode].filter(Boolean).map(normNo);
const emailOf = (u: PickPerson) => (typeof u.extra?.email === 'string' ? (u.extra.email as string) : '');

/** Exact employee number first (users, then invitations), then the website's suffix match for 3+ characters. */
export function empNameFor(empNo: string, dir: Directory): { name: string; email: string } | null {
  const target = normNo(empNo);
  if (!target) return null;
  let u = dir.users.find((x) => userNos(x).includes(target));
  if (u) return { name: u.name, email: emailOf(u) };
  let w = dir.invitees.find((x) => inviteeNos(x).includes(target));
  if (w) return { name: w.name, email: w.email };
  if (target.length >= 3) {
    const fuzzy = (c: string) => c.length >= 3 && (c.endsWith(target) || target.endsWith(c));
    u = dir.users.find((x) => userNos(x).some(fuzzy));
    if (u) return { name: u.name, email: emailOf(u) };
    w = dir.invitees.find((x) => inviteeNos(x).some(fuzzy));
    if (w) return { name: w.name, email: w.email };
  }
  return null;
}

/** dash.html:20502 empNameOf — the stored name, else the lookup; '' = "No record found". */
export const holderOf = (a: Asset, dir: Directory | null) => a.assignedTo || (dir ? empNameFor(a.assignedToEmpNo, dir)?.name ?? '' : '');

/**
 * dash.html:20760–20763: the assign / fix-link pool — signed-up employees, professionals, managers and
 * admins, plus invited people with those roles who have not signed up (matched by email).
 */
export type AssignCandidate = PickPerson & { email: string; notSignedUp: boolean };
export function assignPool(users: PickPerson[], invitees: Invitee[], roles: string[]): AssignCandidate[] {
  const signed = users.filter((u) => roles.includes(String(u.role)) && !u.resigned);
  const emails = new Set(signed.map((u) => emailOf(u).toLowerCase()).filter(Boolean));
  const invited = invitees
    .filter((w) => roles.includes(w.role) && !(w.email && emails.has(w.email.toLowerCase())))
    .map(
      (w): AssignCandidate => ({
        id: `wl_${w.id}`,
        name: w.name || w.email || 'Invited person',
        role: w.role,
        employeeNumber: w.employeeNumber || w.kekaCode || undefined,
        jobTitle: 'Not signed up yet',
        email: w.email,
        notSignedUp: true,
      }),
    );
  return [...signed.map((u): AssignCandidate => ({ ...u, email: emailOf(u), notSignedUp: false })), ...invited].sort((a, b) => a.name.localeCompare(b.name));
}

// ── Search (dash.html:20473 matchQ) ──────────────────────────────────────────
export function matchesAsset(a: Asset, q: string, holder: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [a.assetId, a.name, a.serial, a.assignedToEmpNo, holder].filter(Boolean).join(' ').toLowerCase().includes(needle);
}

/** Barcodes an asset tag can carry: the QR and the common printed 1-D labels and Data Matrix. */
export const ASSET_TAG_CODES = ['qr', 'code128', 'code39', 'code93', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'codabar', 'datamatrix', 'pdf417'] as const;

const tagKey = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/**
 * What a scanned asset tag says: the text itself, or — for a QR holding a link — the last part of the
 * link's path (…/assets/<id>) and any id=, asset=, serial= or tag= value in it.
 */
export function tagCandidates(raw: string): string[] {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  const out = new Set<string>([tagKey(text)]);
  if (/^https?:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      const last = u.pathname.split('/').filter(Boolean).pop();
      if (last) out.add(tagKey(decodeURIComponent(last)));
      for (const k of ['id', 'asset', 'assetId', 'serial', 'tag']) {
        const v = u.searchParams.get(k);
        if (v) out.add(tagKey(v));
      }
    } catch {
      // Not a link after all: the text alone is the tag.
    }
  }
  return [...out].filter(Boolean);
}

/**
 * The assets a scanned tag names, by asset ID, serial number or record id (exact, ignoring case and
 * spaces), and the field text that matched (to search by when several share it).
 */
export function assetsForTag(list: Asset[], raw: string): { assets: Asset[]; term: string } {
  const want = new Set(tagCandidates(raw));
  let term = '';
  const assets = want.size
    ? list.filter((a) => {
        const hit = [a.assetId, a.serial, a.id].find((v) => v && want.has(tagKey(v)));
        if (hit && !term) term = hit;
        return !!hit;
      })
    : [];
  return { assets, term };
}

// ── Room bookings ────────────────────────────────────────────────────────────
/** Half-hour slot index → 'HH:MM' (dash.html:21971 s2t). */
export const slotHm = (s: number | null | undefined) => (s == null || !Number.isFinite(s) ? '' : `${String(Math.floor(s / 2)).padStart(2, '0')}:${s % 2 === 0 ? '00' : '30'}`);

/**
 * dash.html:21820 isRoomBookingPast — a room booking never gets a "completed" status, so it is past once
 * its end slot (else its start, else the end of the day) is behind us. India time.
 */
export function isRoomBookingPast(b: { dates?: string[]; startSlot?: number; endSlot?: number }, now: number) {
  const ds = (b.dates ?? [])[0];
  if (!ds || !/^\d{4}-\d{2}-\d{2}$/.test(ds)) return false;
  const slot = b.endSlot ?? b.startSlot;
  const hm = slot != null && Number.isFinite(slot) ? slotHm(slot) : '23:59';
  const at = Date.parse(istIsoAt(ds, hm === '24:00' ? '23:59' : hm));
  return Number.isFinite(at) && at < now;
}
