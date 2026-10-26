// IT desk (wave 2): the IT Admin's assets, rooms, shooting locations, booking purposes, room booking
// cancellation and the Support Centre directory. Website: AssetCatalog dash.html:20140–20982,
// RoomsLocations :21959–21982 (AddShootingLocationPage :21411, AddConferenceRoomPage :21669,
// BookingPurposes :21842), SupportView :29187. Server: routes/assets.js, rooms.js, locations.js,
// room_purposes.js, bookings.js, slot_bookings.js, support.js. Existing endpoints only.
//
//   GET    /assets                         every asset in the company (bare array). Never persisted
//   POST   /assets                         the full record (id 'a'+now, status available, history [])
//   PUT    /assets/:id                     partial merge. notify:true + an employee number = a real
//                                          assignment: the server emails + WhatsApps the employee.
//                                          Taking it back from someone e-mails them "Asset Recovered";
//                                          allocating to / returning from a third party with an e-mail
//                                          e-mails them "Asset Assigned" / "Asset Recovered".
//                                          409 when the Asset ID is already used in the company;
//                                          400 for a bad third-party allocation (routes/assets.js:37–48)
//   DELETE /assets/:id                     hard delete
//   POST   /assets/:id/resend-ack          emails + WhatsApps the acknowledgement link again
//   GET    /users  /whitelist              the assign picker and the employee-number lookup
//   GET    /rooms[?withImages=1]  POST /rooms  PUT|DELETE /rooms/:id          (same for /locations)
//   GET    /room_purposes  POST  PUT|DELETE /room_purposes/:id (409 when the name is taken / in use)
//   PUT    /bookings/:id {status:'rejected', reason}  emails + WhatsApps the requester "Booking Rejected"
//   GET|DELETE /room_slot_bookings[/:id], /loc_time_bookings[/:id]          frees the time
//   /support_wifi, /support_staff, /support_branches  POST does NOT stamp tenantId, so the app sends it
//   /support_temp_staff                   POST uses the session's tenant, needs days ≥ 1
//
// Rules kept from the spec (docs/port/it-admin.md §7): no self-heal writes (the website's asset
// name/status fixes are not repeated), asset history is read fresh just before assign / return, photos
// and the asset list are never written to the phone's disk.

import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { bookingKeys, type BookingRecord } from '@/api/booking';
import { api, unwrap } from '@/api/client';
import { supportKeys, type ConfigItem, type StaffEntry, type TempStaffEntry, type WifiEntry } from '@/api/support';
import { useSession } from '@/auth/session';

// ── Types (the server's rows; schemaless JSON, so everything is optional and checked) ──────────────
export type AssetHistory = {
  action: 'assigned' | 'returned' | 'allocated' | string;
  to?: string;
  from?: string;
  /** The third party's organisation (an 'allocated' entry). */
  org?: string;
  note?: string;
  at?: string;
  /** A 'returned' entry for an asset that came back from a third party. */
  thirdParty?: boolean;
};

/**
 * Someone outside DASH the asset is allocated to (status 'allocated'): a vendor, client or contractor.
 * `commentsLabel` is the "Allocated to X (Org) — note" text put at the front of the asset's Comments.
 */
export type ThirdParty = { name: string; organisation: string; phone: string; email: string; note: string; allocatedAt: string; commentsLabel: string };

export type Asset = {
  id: string;
  assetId: string;
  name: string;
  description: string;
  serial: string;
  location: string;
  category: string;
  assetType: string;
  purchaseDate: string;
  warrantyStatus: string;
  warrantyExpiry: string;
  condition: string;
  price: number;
  status: string;
  assignedTo: string;
  assignedToEmpNo: string;
  assignedToEmail: string;
  assignmentDate: string;
  acknowledged: boolean;
  acknowledgedAt: string;
  ackToken: boolean; // only whether one exists: the token itself never leaves this module
  history: AssetHistory[];
  returnNote: string;
  returnedFrom: string;
  returnedAt: string;
  thirdParty: ThirdParty | null;
  comments: string;
};

export type ItRoom = {
  id: string;
  name: string;
  capacity: number | null;
  floor: string;
  status: string;
  amenities: string[];
  internalNotes: string;
  imageCount: number;
  images?: string[];
};

export type ItLocation = {
  id: string;
  name: string;
  city: string;
  area: string;
  address: string;
  type: string;
  status: string;
  openingTime: string;
  closingTime: string;
  slotDuration: number;
  bufferTime: number;
  minDuration: number;
  maxDuration: number;
  approvalRequired: boolean;
  allowMultiple: boolean;
  approverName: string;
  approverId: string;
  description: string;
  contact: string;
  phone: string;
  email: string;
  internalNotes: string;
  imageCount: number;
  images?: string[];
};

export type Purpose = {
  id: string;
  label: string;
  color: string;
  bg: string;
  active: boolean;
  requiresClient: boolean;
  requiresRequirements: boolean;
  notice: string;
  sortOrder: number;
};

/** GET /whitelist, slimmed: invited people who may not have signed up yet. */
export type Invitee = { id: string; name: string; email: string; role: string; employeeNumber: string; kekaCode: string };

// ── Helpers ──────────────────────────────────────────────────────────────────
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object') : []);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return v === '' || v == null || !Number.isFinite(n) ? d : n;
};
const yes = (v: unknown) => v === true || v === 'true';
const imgs = (v: unknown) => (Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && u.startsWith('data:image')) : []);
const enc = encodeURIComponent;

function toAsset(a: Record<string, unknown>): Asset {
  return {
    id: str(a.id),
    assetId: str(a.assetId),
    name: str(a.name).trim() || 'Unnamed asset',
    description: str(a.description),
    serial: str(a.serial),
    location: str(a.location).trim(),
    category: str(a.category),
    assetType: str(a.assetType),
    purchaseDate: str(a.purchaseDate),
    warrantyStatus: str(a.warrantyStatus),
    warrantyExpiry: str(a.warrantyExpiry),
    condition: str(a.condition),
    price: num(a.price),
    status: str(a.status),
    assignedTo: str(a.assignedTo),
    assignedToEmpNo: str(a.assignedToEmpNo).trim(),
    assignedToEmail: str(a.assignedToEmail),
    assignmentDate: str(a.assignmentDate),
    acknowledged: yes(a.acknowledged),
    acknowledgedAt: str(a.acknowledgedAt),
    ackToken: !!a.ackToken,
    history: arr(a.history).map((h) => ({
      action: str(h.action),
      to: str(h.to) || undefined,
      from: str(h.from) || undefined,
      org: str(h.org) || undefined,
      note: str(h.note) || undefined,
      at: str(h.at) || undefined,
      thirdParty: h.thirdParty === true ? true : undefined,
    })),
    returnNote: str(a.returnNote),
    returnedFrom: str(a.returnedFrom),
    returnedAt: str(a.returnedAt),
    thirdParty: toThirdParty(a.thirdParty),
    comments: str(a.comments),
  };
}

function toThirdParty(v: unknown): ThirdParty | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Record<string, unknown>;
  const name = str(t.name).trim();
  if (!name) return null;
  return {
    name,
    organisation: str(t.organisation).trim(),
    phone: str(t.phone).trim(),
    email: str(t.email).trim(),
    note: str(t.note).trim(),
    allocatedAt: str(t.allocatedAt),
    commentsLabel: str(t.commentsLabel),
  };
}

function toRoom(r: Record<string, unknown>): ItRoom {
  const images = imgs(r.images);
  const amen = Array.isArray(r.amenities) ? r.amenities.map(str).filter(Boolean) : typeof r.amenities === 'string' ? r.amenities.split(',').map((x) => x.trim()).filter(Boolean) : [];
  return {
    id: str(r.id),
    name: str(r.name),
    capacity: r.capacity === '' || r.capacity == null ? null : num(r.capacity, 0),
    floor: str(r.floor),
    status: str(r.status) || 'active',
    amenities: amen,
    internalNotes: str(r.internalNotes),
    imageCount: Array.isArray(r.images) ? images.length : num(r.imageCount),
    ...(Array.isArray(r.images) ? { images } : null),
  };
}

function toLocation(l: Record<string, unknown>): ItLocation {
  const images = imgs(l.images);
  return {
    id: str(l.id),
    name: str(l.name),
    city: str(l.city),
    area: str(l.area),
    address: str(l.address),
    type: str(l.type) || 'indoor',
    status: str(l.status) || 'active',
    openingTime: str(l.openingTime) || '07:00',
    closingTime: str(l.closingTime) || '22:00',
    slotDuration: num(l.slotDuration, 60),
    bufferTime: num(l.bufferTime, 30),
    minDuration: num(l.minDuration, 60),
    maxDuration: num(l.maxDuration, 480),
    approvalRequired: yes(l.approvalRequired),
    allowMultiple: yes(l.allowMultiple),
    approverName: str(l.approverName),
    approverId: str(l.approverId),
    description: str(l.description),
    contact: str(l.contact),
    phone: str(l.phone),
    email: str(l.email),
    internalNotes: str(l.internalNotes),
    imageCount: Array.isArray(l.images) ? images.length : num(l.imageCount),
    ...(Array.isArray(l.images) ? { images } : null),
  };
}

function toPurpose(p: Record<string, unknown>): Purpose {
  return {
    id: str(p.id),
    label: str(p.label) || 'Purpose',
    color: str(p.color),
    bg: str(p.bg),
    active: p.active !== false,
    requiresClient: yes(p.requiresClient),
    requiresRequirements: yes(p.requiresRequirements),
    notice: str(p.notice),
    sortOrder: num(p.sortOrder),
  };
}

// ── Keys ─────────────────────────────────────────────────────────────────────
export const itdeskKeys = {
  assets: (userId?: string) => ['itdesk', 'assets', userId ?? ''] as const,
  whitelist: (userId?: string) => ['itdesk', 'whitelist', userId ?? ''] as const,
  rooms: (userId?: string) => ['itdesk', 'rooms', userId ?? ''] as const,
  locations: (userId?: string) => ['itdesk', 'locations', userId ?? ''] as const,
  roomPhotos: (id: string) => ['itdesk', 'room-photos', id] as const,
  locationPhotos: (id: string) => ['itdesk', 'location-photos', id] as const,
  purposes: (userId?: string) => ['itdesk', 'purposes', userId ?? ''] as const,
  bookings: (userId?: string) => ['itdesk', 'bookings', userId ?? ''] as const,
};

// ── Assets ───────────────────────────────────────────────────────────────────
export async function fetchAssets(signal?: AbortSignal) {
  return arr(await unwrap(api.get('/assets', signal)))
    .filter((a) => a.id != null)
    .map(toAsset);
}

/** The whole company's assets (GET /assets). Serials and emails: never on disk. */
export function useAssets(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: itdeskKeys.assets(userId),
    enabled: enabled && !!userId,
    queryFn: ({ signal }) => fetchAssets(signal),
    staleTime: 60_000,
    meta: { persist: false },
  });
}

/** GET /whitelist with the employee numbers (the assign pool and the employee-number lookup). */
export function useInvitees(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: itdeskKeys.whitelist(userId),
    enabled: enabled && !!userId,
    meta: { persist: false },
    queryFn: async ({ signal }): Promise<Invitee[]> =>
      arr(await unwrap(api.get('/whitelist', signal)))
        .filter((w) => w.id != null)
        .map((w) => ({
          id: str(w.id),
          name: str(w.name).trim(),
          email: str(w.email),
          role: str(w.role) || 'employee',
          employeeNumber: str(w.employeeNumber),
          kekaCode: str(w.kekaCode),
        })),
    staleTime: 10 * 60_000,
  });
}

/** Re-reads one asset just before a read-modify-write of its history (spec §7 risk 4). */
async function freshAsset(qc: QueryClient, userId: string | undefined, id: string) {
  const all = await qc.fetchQuery({ queryKey: itdeskKeys.assets(userId), queryFn: ({ signal }) => fetchAssets(signal), staleTime: 0 });
  const a = all.find((x) => x.id === id);
  if (!a) throw new Error('This asset is gone. Someone may have deleted it.');
  return a;
}

const historyOut = (h: AssetHistory[]) => h.map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)));

export type AssetForm = {
  assetId: string;
  name: string;
  description: string;
  location: string;
  category: string;
  assetType: string;
  purchaseDate: string;
  warrantyStatus: string;
  warrantyExpiry: string;
  condition: string;
  serial: string;
  price: string;
  comments: string;
};

/** The Allocate form (dash.html:20516 TP_BLANK). Everything but the name is optional. */
export type TpInput = { name: string; org: string; phone: string; email: string; note: string };
export const TP_BLANK: TpInput = { name: '', org: '', phone: '', email: '', note: '' };

const TP_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** dash.html:20517 tpEmailOk — blank is fine. */
export const tpEmailOk = (t: TpInput) => !t.email.trim() || TP_EMAIL_RE.test(t.email.trim());
/** dash.html:20519 tpLabel: "Allocated to Ravi Kumar (Sai Studios)". */
export const tpLabel = (t: TpInput) => `Allocated to ${t.name.trim()}${t.org.trim() ? ` (${t.org.trim()})` : ''}`;
/** The Comments label (dash.html:20522): the tpLabel, then " — remarks" when there are any. */
export const tpCommentsLabel = (t: TpInput) => tpLabel(t) + (t.note.trim() ? ` — ${t.note.trim()}` : '');

/** routes/assets.js:39 thirdPartyProblem, in the server's words: '' when the allocation is fine. */
export function tpProblem(t: TpInput) {
  if (t.name.trim().length < 2) return 'Say who the asset is allocated to.';
  if (t.email.trim() && !TP_EMAIL_RE.test(t.email.trim())) return 'Enter a valid e-mail address for the third party, or leave it blank.';
  if (t.name.trim().length > 120 || t.email.length > 120 || t.org.length > 120 || t.phone.length > 30 || t.note.length > 300) return 'The third-party details are too long.';
  return '';
}

/** dash.html:20521 allocChanges — what allocating changes on an asset (the Allocate sheet and Add asset). */
function allocChanges(a: { comments?: string; history: AssetHistory[] }, t: TpInput) {
  const now = new Date().toISOString();
  const label = tpCommentsLabel(t);
  const prev = (a.comments || '').trim();
  return {
    status: 'allocated',
    thirdParty: { name: t.name.trim(), organisation: t.org.trim(), phone: t.phone.trim(), email: t.email.trim(), note: t.note.trim(), allocatedAt: now, commentsLabel: label },
    assignedTo: null,
    assignedToEmpNo: '',
    assignedToEmail: '',
    assignmentDate: now.slice(0, 10),
    acknowledged: false,
    acknowledgedAt: null,
    ackToken: null,
    comments: prev ? `${label} · ${prev}` : label,
    history: historyOut([...a.history, { action: 'allocated', to: t.name.trim(), org: t.org.trim(), note: t.note.trim(), at: now }]),
  };
}

/** dash.html:20408: the Comments without the "Allocated to …" label; anything IT wrote there stays. */
export function commentsWithoutLabel(a: Pick<Asset, 'comments' | 'thirdParty'>) {
  const lab = a.thirdParty?.commentsLabel || '';
  const cm = a.comments || '';
  return lab && cm.startsWith(lab) ? cm.slice(lab.length).replace(/^\s*·\s*/, '') : cm;
}

/** An asset held by a third party (dash.html:20518 isAllocated). */
const withThirdParty = (a: Asset) => a.status === 'allocated' && !!a.thirdParty?.name;

/** dash.html:20864: the Asset ID must be unique in the company (case and outer spaces ignored). */
export function assetIdTaken(list: readonly Pick<Asset, 'id' | 'assetId' | 'name' | 'serial'>[], assetId: string, exceptId?: string) {
  const want = assetId.trim().toLowerCase();
  if (!want) return null;
  return list.find((x) => x.id !== exceptId && x.assetId.trim().toLowerCase() === want) ?? null;
}
/** The server's 409 (routes/assets.js:33 dupMsg). */
export const assetIdTakenMessage = (assetId: string, clash: Pick<Asset, 'name' | 'serial'>) =>
  `Asset ID "${assetId.trim()}" is already used by "${clash.name || clash.serial || 'another asset'}". Enter a different Asset ID.`;

export function useAssetWrites() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  const refresh = () => qc.invalidateQueries({ queryKey: ['itdesk', 'assets'] });
  const refreshPeople = () => qc.invalidateQueries({ queryKey: ['people', 'assets'] });

  /**
   * dash.html:20876 — the Add Asset record, exactly as the website builds it; with `allocate`, it is
   * added already allocated to that third party (allocChanges on the new record).
   */
  const create = useMutation({
    mutationFn: async ({ allocate, ...f }: AssetForm & { allocate?: TpInput | null }) => {
      const id = `a${Date.now()}`;
      const comments = f.comments.trim();
      await unwrap(
        api.post<{ ok: true; asset?: unknown }>('/assets', {
          id,
          assetId: f.assetId.trim(),
          name: f.name.trim(),
          description: f.description || '',
          location: f.location.trim(),
          category: f.category,
          assetType: f.assetType.trim(),
          purchaseDate: f.purchaseDate,
          warrantyStatus: f.warrantyStatus,
          warrantyExpiry: f.warrantyExpiry,
          condition: f.condition,
          serial: f.serial.trim(),
          price: +f.price || 0,
          assignedTo: null,
          assignedToEmpNo: '',
          assignmentDate: '',
          status: 'available',
          history: [],
          comments,
          ...(allocate ? allocChanges({ comments, history: [] }, allocate) : null),
        }),
      );
      return id;
    },
    onSettled: () => Promise.all([refresh(), refreshPeople()]),
  });

  /** doAssign dash.html:20767 — with the history read fresh first; the server emails + WhatsApps. */
  const assign = useMutation({
    mutationFn: async (v: { id: string; person: { name: string; employeeNumber: string; email: string }; today: string }) => {
      const a = await freshAsset(qc, userId, v.id);
      if (a.assignedToEmpNo) throw new Error(`This asset is already with ${a.assignedTo || `employee ${a.assignedToEmpNo}`}. Return it first.`);
      if (withThirdParty(a)) throw new Error(`This asset is with ${a.thirdParty?.name} (a third party). Return it first.`);
      const at = new Date().toISOString();
      const history = [...a.history, { action: 'assigned', to: v.person.name, at }];
      return unwrap(
        api.put<{ ok: true }>(`/assets/${enc(v.id)}`, {
          assignedTo: v.person.name,
          assignedToEmpNo: v.person.employeeNumber,
          assignedToEmail: v.person.email || '',
          assignmentDate: v.today,
          status: 'assigned',
          acknowledged: false,
          acknowledgedAt: null,
          history: historyOut(history),
          notify: true,
        }),
      );
    },
    onSettled: () => Promise.all([refresh(), refreshPeople()]),
  });

  /** Allocate to a third party (dash.html:20889) — history read fresh first. E-mails them only if an address is given. */
  const allocate = useMutation({
    mutationFn: async (v: { id: string; tp: TpInput }) => {
      const problem = tpProblem(v.tp);
      if (problem) throw new Error(problem);
      const a = await freshAsset(qc, userId, v.id);
      if (a.assignedToEmpNo) throw new Error(`This asset is with ${a.assignedTo || `employee ${a.assignedToEmpNo}`}. Return it first.`);
      if (withThirdParty(a)) throw new Error(`This asset is already with ${a.thirdParty?.name}. Return it first.`);
      return unwrap(api.put<{ ok: true }>(`/assets/${enc(v.id)}`, allocChanges(a, v.tp)));
    },
    onSettled: () => Promise.all([refresh(), refreshPeople()]),
  });

  /**
   * doReturn dash.html:20400 — from an employee or from a third party; history read fresh first. The
   * server e-mails the employee (or a third party with an e-mail) "Asset Recovered" with the remarks.
   * From a third party the "Allocated to …" label comes back out of Comments.
   */
  const giveBack = useMutation({
    mutationFn: async (v: { id: string; note: string }) => {
      const a = await freshAsset(qc, userId, v.id);
      const fromTp = withThirdParty(a);
      if (!a.assignedToEmpNo && !fromTp) throw new Error('This asset is already back in stock.');
      const from = fromTp ? (a.thirdParty?.name ?? '') : a.assignedTo;
      const at = new Date().toISOString();
      const history = [...a.history, { action: 'returned', from, note: v.note || 'No remarks', at, ...(fromTp ? { thirdParty: true } : null) }];
      return unwrap(
        api.put<{ ok: true }>(`/assets/${enc(v.id)}`, {
          assignedTo: null,
          assignedToEmpNo: '',
          assignedToEmail: '',
          status: 'available',
          acknowledged: false,
          acknowledgedAt: null,
          ackToken: null,
          returnNote: v.note,
          returnedFrom: from,
          returnedAt: at,
          history: historyOut(history),
          ...(fromTp ? { thirdParty: null, comments: commentsWithoutLabel(a) } : null),
        }),
      );
    },
    onSettled: () => Promise.all([refresh(), refreshPeople()]),
  });

  /** saveCondition dash.html:20355 — only the condition changes. */
  const condition = useMutation({
    mutationFn: (v: { id: string; condition: string }) => unwrap(api.put<{ ok: true }>(`/assets/${enc(v.id)}`, { condition: v.condition })),
    onSettled: refresh,
  });

  /** linkEmployeeToAsset dash.html:20347 — attach the right name to an unmatched employee number. */
  const link = useMutation({
    mutationFn: (v: { id: string; name: string; email: string }) => unwrap(api.put<{ ok: true }>(`/assets/${enc(v.id)}`, { assignedTo: v.name, assignedToEmail: v.email || '' })),
    onSettled: () => Promise.all([refresh(), refreshPeople()]),
  });

  /** resendAck dash.html:20332 — the server emails + WhatsApps the link again. */
  const resend = useMutation({
    mutationFn: (id: string) => unwrap(api.post<{ ok: true }>(`/assets/${enc(id)}/resend-ack`, {})),
  });

  /** deleteAsset dash.html:20393 — hard delete. */
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.del<{ ok: true }>(`/assets/${enc(id)}`)),
    onSettled: () => Promise.all([refresh(), refreshPeople()]),
  });

  return { create, assign, allocate, giveBack, condition, link, resend, remove };
}

// ── Rooms and locations ──────────────────────────────────────────────────────
/** Every room, active or not, without photos (the server sends `imageCount` instead). */
export function useItRooms(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: itdeskKeys.rooms(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => arr(await unwrap(api.get('/rooms', signal))).filter((r) => r.id != null).map((r) => ({ ...toRoom(r), images: undefined })),
    staleTime: 60_000,
  });
}

export function useItLocations(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: itdeskKeys.locations(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => arr(await unwrap(api.get('/locations', signal))).filter((l) => l.id != null).map((l) => ({ ...toLocation(l), images: undefined })),
    staleTime: 60_000,
    meta: { persist: false }, // contact phone and email
  });
}

/**
 * One room with its photos. There is no GET by id: this reads ?withImages=1 (every room's photos)
 * once, only on the edit screen, and never writes it to disk.
 */
export function useRoomWithPhotos(id: string, enabled = true) {
  return useQuery({
    queryKey: itdeskKeys.roomPhotos(id),
    enabled: enabled && !!id,
    queryFn: async ({ signal }) => {
      const r = arr(await unwrap(api.get('/rooms?withImages=1', signal))).find((x) => str(x.id) === id);
      return r ? toRoom(r) : null;
    },
    staleTime: 0,
    gcTime: 60_000,
    meta: { persist: false },
  });
}

export function useLocationWithPhotos(id: string, enabled = true) {
  return useQuery({
    queryKey: itdeskKeys.locationPhotos(id),
    enabled: enabled && !!id,
    queryFn: async ({ signal }) => {
      const l = arr(await unwrap(api.get('/locations?withImages=1', signal))).find((x) => str(x.id) === id);
      return l ? toLocation(l) : null;
    },
    staleTime: 0,
    gcTime: 60_000,
    meta: { persist: false },
  });
}

export type RoomBody = { name: string; capacity: number; floor: string; amenities: string[]; internalNotes: string; images?: string[] };
export type LocationBody = Omit<ItLocation, 'id' | 'status' | 'imageCount' | 'images'> & { images?: string[]; status?: string };

export function useFacilityWrites() {
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['itdesk', 'rooms'] }),
      qc.invalidateQueries({ queryKey: ['itdesk', 'locations'] }),
      qc.invalidateQueries({ queryKey: ['itdesk', 'room-photos'] }),
      qc.invalidateQueries({ queryKey: ['itdesk', 'location-photos'] }),
      qc.invalidateQueries({ queryKey: bookingKeys.rooms }),
      qc.invalidateQueries({ queryKey: bookingKeys.locations }),
    ]);

  /** AddConferenceRoomPage handleSave (dash.html:21699): POST with status active, or PUT (merge). */
  const saveRoom = useMutation({
    mutationFn: (v: { id?: string; body: RoomBody }) =>
      v.id ? unwrap(api.put<{ ok: true }>(`/rooms/${enc(v.id)}`, v.body)) : unwrap(api.post<{ ok: true }>('/rooms', { id: `r${Date.now()}`, status: 'active', ...v.body })),
    onSettled: refresh,
  });
  /** AddShootingLocationPage handleSave (dash.html:21447). */
  const saveLocation = useMutation({
    mutationFn: (v: { id?: string; body: LocationBody }) =>
      v.id
        ? unwrap(api.put<{ ok: true }>(`/locations/${enc(v.id)}`, v.body))
        : unwrap(api.post<{ ok: true }>('/locations', { id: `l${Date.now()}`, ...v.body, status: 'active' })),
    onSettled: refresh,
  });
  /** The active / inactive switch (RoomsLocations `tog`, dash.html:21959). */
  const setStatus = useMutation({
    mutationFn: (v: { table: 'rooms' | 'locations'; id: string; status: 'active' | 'inactive' }) => unwrap(api.put<{ ok: true }>(`/${v.table}/${enc(v.id)}`, { status: v.status })),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (v: { table: 'rooms' | 'locations'; id: string }) => unwrap(api.del<{ ok: true }>(`/${v.table}/${enc(v.id)}`)),
    onSettled: refresh,
  });
  return { saveRoom, saveLocation, setStatus, remove };
}

// ── Booking purposes ─────────────────────────────────────────────────────────
/** Every purpose IT Admin has set up, on or off (BookingPurposes reload, dash.html:21852). */
export function usePurposes(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: itdeskKeys.purposes(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) =>
      arr(await unwrap(api.get('/room_purposes', signal)))
        .filter((p) => p.id != null)
        .map(toPurpose)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    staleTime: 60_000,
  });
}

export type PurposeBody = { label: string; color: string; bg: string; active: boolean; requiresClient: boolean; requiresRequirements: boolean; notice: string };

export function usePurposeWrites() {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['itdesk', 'purposes'] }), qc.invalidateQueries({ queryKey: bookingKeys.purposes })]);
  const save = useMutation({
    mutationFn: (v: { id?: string; body: PurposeBody }) =>
      v.id ? unwrap(api.put<{ ok: true }>(`/room_purposes/${enc(v.id)}`, v.body)) : unwrap(api.post<{ ok: true }>('/room_purposes', v.body)),
    onSettled: refresh,
  });
  const setActive = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => unwrap(api.put<{ ok: true }>(`/room_purposes/${enc(v.id)}`, { active: v.active })),
    onSettled: refresh,
  });
  /** 409 "Turn it off instead" when a booking used it: the server's text is shown as is. */
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.del<{ ok: true }>(`/room_purposes/${enc(id)}`)),
    onSettled: refresh,
  });
  return { save, setActive, remove };
}

// ── Room bookings (the Booking Requests tab) ─────────────────────────────────
/** Room bookings only (`type === 'rooms'`), from the whole table, as the website's tab reads it. */
export function useRoomBookings(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: itdeskKeys.bookings(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) =>
      arr(await unwrap(api.get('/bookings', signal)))
        .filter((b) => typeof b.id === 'string' && b.type === 'rooms')
        .map((b) => b as unknown as BookingRecord),
    staleTime: 30_000,
    meta: { persist: false },
  });
}

/** What happened when a booking was cancelled: the booking always; the time row when found. */
export type CancelResult = { slotFreed: boolean; slotError?: string };

/**
 * dash.html:21971–21974, in the same order: PUT /bookings/:id {status:'rejected', reason} (the server
 * emails + WhatsApps the requester), then delete the room's slot row so the time is free again. The
 * slot row is matched by bookingId, else by booker + date + start slot (the website's own fallback).
 * The website's loose location-row fallback (same booker, same day) is not repeated: on a room
 * booking it can only ever hit an unrelated location booking.
 */
export function useCancelRoomBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { booking: BookingRecord; reason: string }): Promise<CancelResult> => {
      const b = v.booking;
      await unwrap(api.put<{ ok: true }>(`/bookings/${enc(b.id)}`, { status: 'rejected', reason: v.reason, rejectionReason: v.reason }));
      try {
        const [slots, times] = await Promise.all([unwrap(api.get('/room_slot_bookings')), unwrap(api.get('/loc_time_bookings'))]);
        const rows = arr(slots);
        const day = (b.dates ?? [])[0];
        const rsb = rows.find((s) => s.bookingId === b.id) ?? rows.find((s) => s.bookedBy === b.requestedBy && s.date === day && num(s.startSlot, -1) === b.startSlot);
        const ltb = arr(times).find((s) => s.bookingId === b.id);
        if (rsb) await unwrap(api.del(`/room_slot_bookings/${enc(str(rsb.id))}`));
        if (ltb) await unwrap(api.del(`/loc_time_bookings/${enc(str(ltb.id))}`));
        return { slotFreed: !!(rsb || ltb) };
      } catch (e) {
        return { slotFreed: false, slotError: e instanceof Error ? e.message : 'The time could not be freed.' };
      }
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['itdesk', 'bookings'] }),
        qc.invalidateQueries({ queryKey: ['booking'] }),
        qc.invalidateQueries({ queryKey: ['inbox', 'booking'] }),
      ]),
  });
}

// ── Support Centre directory (admin side) ────────────────────────────────────
export type WifiBody = { branch: string; wifiName: string; password: string };
export type StaffBody = { branch: string; designation: string; name: string; mobile: string };
export type TempStaffBody = StaffBody & { days: number };

/**
 * SupportView's add / edit / delete (dash.html:29262–29300). The website posts without `tenantId`, and
 * routes/support.js does not stamp it, so such a row would be invisible to everyone: the app sends the
 * signed-in person's tenantId in the body (spec §2.6). Temp staff are stamped by the server.
 */
export function useSupportWrites() {
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const tenantId = user?.tenantId;
  const refresh = (key: readonly unknown[]) => qc.invalidateQueries({ queryKey: key });
  const needTenant = () => {
    if (!tenantId) throw new Error('Your company could not be found. Sign out and in again, then try once more.');
    return tenantId;
  };

  const addWifi = useMutation({
    mutationFn: (b: WifiBody) => unwrap(api.post<{ ok: true }>('/support_wifi', { id: `wifi${Date.now()}`, ...b, tenantId: needTenant() } satisfies WifiEntry & { tenantId: string })),
    onSettled: () => refresh(supportKeys.wifi(user?.id)),
  });
  const removeWifi = useMutation({
    mutationFn: (id: string) => unwrap(api.del<{ ok: true }>(`/support_wifi/${enc(id)}`)),
    onSettled: () => refresh(supportKeys.wifi(user?.id)),
  });

  const addStaff = useMutation({
    mutationFn: (b: StaffBody) =>
      unwrap(api.post<{ ok: true }>('/support_staff', { id: `sd${Date.now()}`, ...b, active: true, tenantId: needTenant() } satisfies StaffEntry & { tenantId: string })),
    onSettled: () => refresh(supportKeys.staff(user?.id)),
  });
  /** saveEditStaff / toggleStaffActive — PUT merges. */
  const editStaff = useMutation({
    mutationFn: (v: { id: string; changes: Partial<StaffBody> & { active?: boolean } }) => unwrap(api.put<{ ok: true }>(`/support_staff/${enc(v.id)}`, v.changes)),
    onSettled: () => refresh(supportKeys.staff(user?.id)),
  });
  const removeStaff = useMutation({
    mutationFn: (id: string) => unwrap(api.del<{ ok: true }>(`/support_staff/${enc(id)}`)),
    onSettled: () => refresh(supportKeys.staff(user?.id)),
  });

  /** addTempStaff dash.html:29281 — expires after `days`; the server needs days ≥ 1. */
  const addTemp = useMutation({
    mutationFn: (b: TempStaffBody) => {
      const now = Date.now();
      const row: TempStaffEntry = {
        id: `ts${now}`,
        ...b,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + b.days * 86_400_000).toISOString(),
      };
      return unwrap(api.post<{ ok: true; s?: TempStaffEntry }>('/support_temp_staff', row));
    },
    onSettled: () => refresh(supportKeys.tempStaff(user?.id)),
  });
  const removeTemp = useMutation({
    mutationFn: (id: string) => unwrap(api.del<{ ok: true }>(`/support_temp_staff/${enc(id)}`)),
    onSettled: () => refresh(supportKeys.tempStaff(user?.id)),
  });

  /** addConfigItem / delConfigItem dash.html:29246–29256 — office request items and complaint types. */
  const addListItem = useMutation({
    mutationFn: (v: { listType: 'admin_item' | 'complaint_type'; label: string }) =>
      unwrap(api.post<{ ok: true }>('/support_branches', { id: `br${Date.now()}`, listType: v.listType, label: v.label.trim(), tenantId: needTenant() } satisfies ConfigItem & { tenantId: string })),
    onSettled: () => refresh(supportKeys.config(user?.id)),
  });
  const removeListItem = useMutation({
    mutationFn: (id: string) => unwrap(api.del<{ ok: true }>(`/support_branches/${enc(id)}`)),
    onSettled: () => refresh(supportKeys.config(user?.id)),
  });

  return { addWifi, removeWifi, addStaff, editStaff, removeStaff, addTemp, removeTemp, addListItem, removeListItem };
}
