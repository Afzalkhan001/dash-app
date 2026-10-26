// Demo API for the newsroom domain (wave 2): posting news (create, edit, delete, pop-ups, schedule,
// branches, TV priority, files and Home banners), the celebration switches' test message, and the
// office TVs (pair, settings, remote, show now, unpair, log, playlists, custom media). Owner: the
// newsroom agent. Shapes and role rules mirror the real handlers (server.js:9119-9197, :8935-8995,
// :2831, routes/branches.js:16, tv.js:426-590); responses are built from the app's own API types.
//
// Shared demo data is changed only through exports: announcements.ts `newsStore` / `makeAnnouncement`
// (the very list GET /announcements reads, so a post made here shows on Home and in News at once),
// org.ts `TENANT` / `patchTenant` / `allPeople`.
//
// Who can do what in the demo:
//   Afzal HR            News studio (role), News settings (switches, HR WhatsApp, test message)
//   Afzal Super Admin   all of the above + edit anyone's post + Office TVs (pair with code 123456)
//   Afzal IT Admin      News studio (role); edits only its own posts
//   Afzal Manager       News studio through the "Who can post news" list (a grant by name/emp no)
//   everyone else       the server's own refusals (403)
//
// File bytes (pictures, files, banners) are kept beside the rows, never in the list, exactly as the
// server's list projection leaves them out; `priority` is kept beside them too (not in the list).

import type { Announcement } from '@/api/announcements';
import type { NewsPayload, TvDevice, TvLog, TvMedia, TvPlaylist } from '@/api/newsroom';
import { DEMO_TENANT_ID } from '@/demo/config';
import { makeAnnouncement, newsStore, seedBanners, seedMedia } from '@/demo/fixtures/announcements';
import { allPeople, patchTenant, TENANT } from '@/demo/fixtures/org';
import { currentPersona, personaUserId } from '@/demo/personas';
import { addDays, DEMO_CODE, daysAgo, fail, istIso, minutesAgo, newId, notFound, nowIso, type Route, today } from '@/demo/state';

// ── Who is asking ────────────────────────────────────────────────────────────
const me = () => {
  const p = currentPersona();
  return { id: personaUserId(p), name: p.label, role: p.role, employeeNumber: p.employeeNumber, tenantId: p.tenant ? DEMO_TENANT_ID : null };
};
const low = (v: unknown) => String(v ?? '').trim().toLowerCase();

const CREATOR_ROLES = ['hr', 'it_admin', 'super_admin', 'ceo', 'coo']; // server.js:7614
function isCreator() {
  const u = me();
  if (CREATOR_ROLES.includes(u.role)) return true;
  const list = Array.isArray(TENANT.announcementCreators) ? TENANT.announcementCreators : [];
  return list.some((c) => {
    const e = low(c?.empNo);
    const n = low(c?.name);
    return (!!e && e === low(u.employeeNumber)) || (!!n && n === low(u.name));
  });
}
const USER_ADMIN_ROLES = ['master_admin', 'super_admin', 'ceo', 'coo', 'hr', 'admin', 'it_admin', 'app_manager']; // lib/authz.js:27
const userAdmin = () => USER_ADMIN_ROLES.includes(me().role);

// ── Seeds ────────────────────────────────────────────────────────────────────
const T0 = today();

// "Who can post news": the website's grant list also names Afzal Manager in the demo (by name and
// employee number, never DEMO_USER's), so a non-admin creator can be tried.
if (!(TENANT.announcementCreators ?? []).some((c) => low(c?.name) === 'afzal manager')) {
  patchTenant({ announcementCreators: [...(TENANT.announcementCreators ?? []), { name: 'Afzal Manager', empNo: 'TM-1042' }] });
}
if (typeof TENANT.hrNotifyPhone !== 'string') patchTenant({ hrNotifyPhone: '9876543210' });

// Seeded with the sample posts' drawn pictures (announcements.ts), so Home's carousel has artwork.
const media = new Map<string, { fileData: string; fileName: string }>(seedMedia());
const banners = new Map<string, { homeBannerImage: string; homeBannerImageName: string }>(seedBanners());
const priority = new Map<string, string>([
  ['ann-demo-townhall', 'high'],
  ['ann-demo-nas', 'normal'],
]);

const seed = (a: Announcement, p = 'normal') => {
  if (!newsStore.some((x) => x.id === a.id)) newsStore.push(makeAnnouncement(a));
  priority.set(a.id, p);
};
seed({
  id: 'ann-demo-hr-policy',
  title: 'Updated leave policy for 2027',
  body: 'From January, casual leave can be taken in half days and up to 5 unused days carry over. The full policy is in Policies — please acknowledge it by the 30th.',
  createdBy: 'Afzal HR',
  createdByRole: 'hr',
  createdAt: daysAgo(2, '11:20'),
});
seed({
  id: 'ann-demo-diwali',
  title: 'Diwali celebrations — Friday 4 pm',
  body: 'Rangoli contest, sweets and the team photo in the main studio. Wear something festive!',
  createdBy: 'Afzal HR',
  createdByRole: 'hr',
  scheduledAt: istIso(addDays(T0, 1), '09:00'),
  expiresAt: addDays(T0, 4),
  createdAt: minutesAgo(90),
});
seed({
  id: 'ann-demo-wifi',
  type: 'link',
  title: 'New guest Wi-Fi from Monday',
  body: 'The guest network is now “TM-Guest”. Visitors get a one-day password from reception.',
  linkUrl: 'https://wifi.tamadamedia.example/guest',
  ctaText: 'Learn More',
  branches: ['Hyderabad'],
  createdBy: 'Afzal IT Admin',
  createdByRole: 'it_admin',
  createdAt: daysAgo(4, '15:40'),
});
seed(
  {
    id: 'ann-demo-fire-drill',
    title: 'Fire drill at 11 am today',
    body: 'Leave by the nearest stairs when the alarm sounds and meet at the car park. It takes 15 minutes.',
    createdBy: 'Afzal Super Admin',
    createdByRole: 'super_admin',
    expiresAt: daysAgoYmd(6),
    createdAt: daysAgo(6, '08:30'),
  },
  'emergency',
);
function daysAgoYmd(n: number) {
  return addDays(T0, -n);
}

// The list projection (ANNOUNCEMENT_LIST_FIELDS server.js:8820): no bytes, no priority, no TV uploads.
const LIST_FIELDS = [
  'id', 'title', 'body', 'type', 'linkUrl', 'ctaText', 'branches', 'expiresAt', 'createdBy', 'createdByRole', 'createdAt', 'tenantId', 'hasMedia',
  'fileName', 'hasHomeBanner', 'kind', 'scheduledAt', 'popupFrequency', 'targetName', 'years', 'targetEmployeeId', 'autoKind', 'jobTitle',
  'department', 'fullBleed', 'hasPhoto',
] as const;
const project = (a: Announcement) => {
  const out: Record<string, unknown> = {};
  for (const k of LIST_FIELDS) if ((a as Record<string, unknown>)[k] !== undefined) out[k] = (a as Record<string, unknown>)[k];
  return out as Announcement;
};

const kindOf = (v: unknown) => (v === 'popup' ? 'popup' : 'announcement');
const STRIP = ['id', 'tenantId', 'performedById', 'actorId', 'fileData', 'homeBannerImage', 'homeBannerImageName', 'priority', 'hasMedia', 'hasHomeBanner', 'createdBy', 'createdByRole'];

function applyFiles(id: string, body: NewsPayload, row: Announcement) {
  if (typeof body.fileData === 'string') {
    if (body.fileData) media.set(id, { fileData: body.fileData, fileName: body.fileName || '' });
    else media.delete(id);
    row.hasMedia = !!body.fileData;
    if (body.fileName !== undefined) row.fileName = body.fileName;
  }
  if (typeof body.homeBannerImage === 'string') {
    if (body.homeBannerImage) banners.set(id, { homeBannerImage: body.homeBannerImage, homeBannerImageName: body.homeBannerImageName || '' });
    else banners.delete(id);
    row.hasHomeBanner = !!body.homeBannerImage;
  }
}

// ── Office TVs ───────────────────────────────────────────────────────────────
type Dev = TvDevice & { live: boolean };
const DEFAULT_CFG = { inactivityMinutes: 5, offlineThresholdSeconds: 180, showOfflineIndicator: false, playlistId: null as string | null, defaultDurationSeconds: 7 };
const INACTIVITY_ALLOWED = [0, 1, 5, 10, 15, 30];

const playlists: TvPlaylist[] = [
  {
    id: 'pl-demo-lobby',
    name: 'Lobby loop',
    description: 'Town hall, holidays and the welcome posts',
    status: 'active',
    items: [
      { announcementId: 'ann-demo-townhall', durationSeconds: 15 },
      { announcementId: 'ann-demo-welcome', durationSeconds: 10 },
      { announcementId: 'ann-demo-cafeteria', durationSeconds: 10 },
    ],
  },
  { id: 'pl-demo-old', name: 'Q2 results week', description: '', status: 'archived', items: [{ announcementId: 'ann-demo-townhall', durationSeconds: 20 }] },
];

const devices: Dev[] = [
  {
    id: 'tv-demo-reception',
    name: 'Reception TV',
    location: 'Hyderabad',
    platform: 'android-tv',
    appVersion: '1.4.2',
    status: 'online',
    lastSeenAt: minutesAgo(0.3),
    lastSyncAt: minutesAgo(4),
    currentAnnouncementId: 'ann-demo-townhall',
    claimedAt: daysAgo(40, '12:10'),
    config: { ...DEFAULT_CFG, playlistId: 'pl-demo-lobby' },
    live: true,
  },
  {
    id: 'tv-demo-canteen',
    name: 'Canteen TV',
    location: '',
    platform: 'tizen',
    appVersion: '1.3.9',
    status: 'offline',
    lastSeenAt: daysAgo(2, '18:42'),
    lastSyncAt: daysAgo(2, '18:30'),
    currentAnnouncementId: null,
    claimedAt: daysAgo(25, '16:00'),
    config: { ...DEFAULT_CFG, inactivityMinutes: 10, showOfflineIndicator: true },
    live: false,
  },
];

const logs = new Map<string, TvLog[]>([
  [
    'tv-demo-reception',
    [
      { created_at: minutesAgo(4), event_type: 'sync', message: '7 items in the rotation' },
      { created_at: minutesAgo(35), event_type: 'command', message: 'REFRESH' },
      { created_at: minutesAgo(180), event_type: 'online', message: null },
      { created_at: minutesAgo(185), event_type: 'offline', message: 'No signal for 3 minutes' },
      { created_at: daysAgo(1, '09:02'), event_type: 'boot', message: 'App 1.4.2 started' },
    ],
  ],
  ['tv-demo-canteen', [{ created_at: daysAgo(2, '18:42'), event_type: 'offline', message: 'No signal for 3 minutes' }, { created_at: daysAgo(2, '09:00'), event_type: 'boot', message: 'App 1.3.9 started' }]],
]);
const logLine = (id: string, event_type: string, message: string | null = null) => {
  const list = logs.get(id) ?? [];
  list.unshift({ created_at: nowIso(), event_type, message });
  logs.set(id, list.slice(0, 100));
};

const tvMedia: (TvMedia & { fileData: string })[] = [
  { id: 'tvm-demo-1', type: 'image', fileName: 'diwali-poster.jpg', createdAt: daysAgo(3, '10:05'), fileData: '' },
];

// A paired TV reports in every few seconds; the "live" ones here stay online, the rest go quiet.
function publicDevice(d: Dev): TvDevice {
  if (d.live) d.lastSeenAt = minutesAgo(0.2);
  const cfg = { ...DEFAULT_CFG, ...(d.config ?? {}) };
  const seen = d.lastSeenAt ? Date.parse(d.lastSeenAt) : 0;
  const online = !!seen && Date.now() - seen < cfg.offlineThresholdSeconds * 1000;
  const { live: _live, ...rest } = d;
  return { ...rest, status: online ? 'online' : 'offline', config: cfg };
}
const ownDevice = (id: string) => devices.find((d) => d.id === id) ?? null;

function normalizeConfig(input: Record<string, unknown> | undefined, base: TvDevice['config']) {
  const c = { ...DEFAULT_CFG, ...(base ?? {}) };
  if (!input || typeof input !== 'object') return c;
  if ('inactivityMinutes' in input) {
    const n = Number(input.inactivityMinutes);
    if (!INACTIVITY_ALLOWED.includes(n)) throw new Error(`inactivityMinutes must be one of ${INACTIVITY_ALLOWED.join(', ')}`);
    c.inactivityMinutes = n;
  }
  if ('offlineThresholdSeconds' in input) {
    const n = Number(input.offlineThresholdSeconds);
    if (!Number.isInteger(n) || n < 60 || n > 86400) throw new Error('offlineThresholdSeconds must be a whole number between 60 and 86400');
    c.offlineThresholdSeconds = n;
  }
  if ('showOfflineIndicator' in input) c.showOfflineIndicator = !!input.showOfflineIndicator;
  if ('playlistId' in input) c.playlistId = input.playlistId ? String(input.playlistId).slice(0, 80) : null;
  if (c.playlistId && !playlists.some((p) => p.id === c.playlistId)) throw new Error('That playlist does not belong to this company.');
  return c;
}

const COMMANDS = ['REFRESH', 'SYNC', 'RELOAD', 'SHOW_ANNOUNCEMENT', 'RETURN_TO_PLAYLIST', 'CLEAR_CACHE'];

// ── Routes ───────────────────────────────────────────────────────────────────
export const newsroomRoutes: Route[] = [
  // GET /announcements (server.js:8909) — the list projection; TV uploads never appear.
  ['GET', /^\/announcements$/, () => newsStore.filter((a) => a.kind !== 'tv_media').map(project)],
  ['GET', /^\/announcements\/([^/]+)\/media$/, ([, id]) => media.get(id!) ?? { fileData: '', fileName: '' }],
  ['GET', /^\/announcements\/([^/]+)\/banner$/, ([, id]) => banners.get(id!) ?? { homeBannerImage: '', homeBannerImageName: '' }],

  // POST /announcements (server.js:9119)
  [
    'POST',
    /^\/announcements$/,
    (_p, body: NewsPayload & Record<string, unknown>) => {
      if (!isCreator()) return fail('You are not authorized to create announcements.', 403);
      const b = body ?? {};
      const kind = kindOf(b.kind);
      if (kind === 'popup' && !b.fileData) return fail('A pop-up needs an image.', 400);
      const id = newId('ann');
      const rest: Record<string, unknown> = { ...b };
      for (const k of STRIP) delete rest[k];
      // Like the server, the poster's name and role are whatever the body carries (the app sends them).
      const row = makeAnnouncement({
        ...(rest as Partial<Announcement>),
        id,
        kind,
        createdAt: typeof b.createdAt === 'string' ? b.createdAt : nowIso(),
        createdBy: typeof b.createdBy === 'string' ? b.createdBy : undefined,
        createdByRole: typeof b.createdByRole === 'string' ? b.createdByRole : undefined,
        tenantId: DEMO_TENANT_ID,
        hasMedia: false,
        hasHomeBanner: false,
      });
      applyFiles(id, b, row);
      newsStore.unshift(row);
      priority.set(id, typeof b.priority === 'string' ? b.priority : 'normal');
      if (priority.get(id) === 'emergency') for (const d of devices) if (d.live) d.currentAnnouncementId = id;
      return { ok: true, announcement: project(row) };
    },
  ],

  // PUT /announcements/:id (server.js:9139) — partial; kind can't change.
  [
    'PUT',
    /^\/announcements\/([^/]+)$/,
    ([, raw], body: NewsPayload & Record<string, unknown>) => {
      if (!isCreator()) return fail('You are not authorized to edit announcements.', 403);
      const id = raw!;
      const row = newsStore.find((a) => a.id === id);
      if (!row) return notFound('Announcement not found.');
      const b = body ?? {};
      if ('kind' in b) {
        const k = kindOf(b.kind);
        if (k === 'popup' && !b.fileData && !media.has(id) && !row.hasMedia) return fail('A pop-up needs an image.', 400);
        if (kindOf(row.kind) !== k) return fail('A pop-up and an announcement can’t be converted into each other — delete this one and create the other kind.', 400);
      }
      const rest: Record<string, unknown> = { ...b };
      for (const k of STRIP) delete rest[k];
      Object.assign(row, rest);
      applyFiles(id, b, row);
      if (typeof b.priority === 'string') priority.set(id, b.priority);
      return { ok: true };
    },
  ],

  // DELETE /announcements/:id (server.js:9179) — permanent.
  [
    'DELETE',
    /^\/announcements\/([^/]+)$/,
    ([, raw]) => {
      if (!isCreator()) return fail('You are not authorized to delete announcements.', 403);
      const id = raw!;
      const i = newsStore.findIndex((a) => a.id === id);
      if (i < 0) return notFound('Announcement not found.');
      newsStore.splice(i, 1);
      media.delete(id);
      banners.delete(id);
      priority.delete(id);
      for (const d of devices) if (d.currentAnnouncementId === id) d.currentAnnouncementId = null;
      return { ok: true };
    },
  ],

  // GET /branches (routes/branches.js:16) — distinct locations of people and invitations.
  [
    'GET',
    /^\/branches$/,
    () => {
      const set = new Set<string>(['Hyderabad', 'Vijayawada', 'Bengaluru']);
      for (const p of allPeople()) {
        const l = String((p as { location?: unknown }).location ?? '').trim();
        if (l) set.add(l);
      }
      return [...set].sort();
    },
  ],

  // POST /celebration/test-send (server.js:2831) — the demo sends nothing.
  [
    'POST',
    /^\/celebration\/test-send$/,
    (_p, body: { phone?: string }) => {
      if (!['master_admin', 'super_admin', 'hr'].includes(me().role)) return fail('You do not have permission to send a test celebration message.', 403);
      if (!String(body?.phone ?? '').trim()) return fail('A phone number is required.', 400);
      return { results: [{ kind: 'birthday', ok: true }, { kind: 'anniversary', ok: true }] };
    },
  ],

  // ── Office TVs (tv.js) ──
  ['GET', /^\/tv\/admin\/devices$/, () => (userAdmin() ? devices.map(publicDevice) : fail('You do not have permission to view TV displays.', 403))],
  [
    'POST',
    /^\/tv\/admin\/claim$/,
    (_p, body: Record<string, unknown>) => {
      if (!userAdmin()) return fail('You do not have permission to add TV displays.', 403);
      const code = String(body?.code ?? '').trim();
      if (!/^\d{6}$/.test(code)) return fail('Enter the 6-digit code shown on the TV.', 400);
      if (code !== DEMO_CODE) return fail('That code is invalid or has expired. Use the code currently shown on the TV.', 400);
      let config;
      try {
        config = normalizeConfig({ inactivityMinutes: body.inactivityMinutes ?? 5, playlistId: body.playlistId || null }, null);
      } catch (e) {
        return fail((e as Error).message, 400);
      }
      const d: Dev = {
        id: newId('tvd'),
        name: String(body.name ?? '').trim().slice(0, 80) || 'TV Display',
        location: String(body.location ?? '').trim().slice(0, 120),
        platform: 'android-tv',
        appVersion: '1.4.2',
        status: 'online',
        lastSeenAt: nowIso(),
        lastSyncAt: nowIso(),
        currentAnnouncementId: null,
        claimedAt: nowIso(),
        config,
        live: true,
      };
      devices.unshift(d);
      logLine(d.id, 'paired', `Paired by ${me().name}`);
      return { ok: true, device: { id: d.id, name: d.name, location: d.location, config } };
    },
  ],
  [
    'PATCH',
    /^\/tv\/admin\/devices\/([^/]+)$/,
    ([, raw], body: Record<string, unknown>) => {
      if (!userAdmin()) return fail('You do not have permission to edit TV displays.', 403);
      const d = ownDevice(raw!);
      if (!d) return notFound('TV not found.');
      const b = body ?? {};
      try {
        if ('config' in b) d.config = normalizeConfig(b.config as Record<string, unknown>, d.config);
      } catch (e) {
        return fail((e as Error).message, 400);
      }
      if ('name' in b) d.name = String(b.name ?? '').trim().slice(0, 80) || d.name;
      if ('location' in b) d.location = String(b.location ?? '').trim().slice(0, 120);
      logLine(d.id, 'config', 'Settings changed');
      return { ok: true };
    },
  ],
  [
    'POST',
    /^\/tv\/admin\/devices\/([^/]+)\/command$/,
    ([, raw], body: { command?: string; payload?: { announcementId?: string; seconds?: number } }) => {
      if (!userAdmin()) return fail('You do not have permission to send TV commands.', 403);
      const d = ownDevice(raw!);
      if (!d) return notFound('TV not found.');
      const command = String(body?.command ?? '');
      if (!COMMANDS.includes(command)) return fail('Unknown command.', 400);
      if (command === 'SHOW_ANNOUNCEMENT') {
        const aid = String(body?.payload?.announcementId ?? '');
        if (!newsStore.some((a) => a.id === aid)) return fail('Announcement not found in this company.', 400);
        const secs = Math.min(Math.max(Number(body?.payload?.seconds) || 30, 5), 3600);
        if (d.live) d.currentAnnouncementId = aid;
        logLine(d.id, 'command', `SHOW_ANNOUNCEMENT for ${secs} s`);
      } else {
        if (command === 'RETURN_TO_PLAYLIST' && d.live) d.currentAnnouncementId = null;
        if (command === 'SYNC' && d.live) d.lastSyncAt = nowIso();
        logLine(d.id, 'command', command);
      }
      return { ok: true, commandId: newId('tvc') };
    },
  ],
  [
    'DELETE',
    /^\/tv\/admin\/devices\/([^/]+)$/,
    ([, raw]) => {
      if (!userAdmin()) return fail('You do not have permission to unpair TV displays.', 403);
      const id = raw!;
      const i = devices.findIndex((d) => d.id === id);
      if (i < 0) return notFound('TV not found.');
      devices.splice(i, 1);
      logs.delete(id);
      return { ok: true };
    },
  ],
  [
    'GET',
    /^\/tv\/admin\/devices\/([^/]+)\/logs$/,
    ([, raw]) => {
      if (!userAdmin()) return fail('You do not have permission to view TV logs.', 403);
      const id = raw!;
      if (!ownDevice(id)) return notFound('TV not found.');
      return logs.get(id) ?? [];
    },
  ],
  ['GET', /^\/tv\/admin\/playlists$/, () => (userAdmin() ? playlists : fail('You do not have permission to view TV playlists.', 403))],

  // Custom TV media (server.js:8935-8995) — plays on every TV, never in the feed.
  [
    'GET',
    /^\/tv\/admin\/media$/,
    () => (userAdmin() ? tvMedia.map(({ fileData: _f, ...m }) => m).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) : fail('You do not have permission to view TV displays.', 403)),
  ],
  [
    'POST',
    /^\/tv\/admin\/media$/,
    (_p, body: { type?: string; fileData?: string; fileName?: string }) => {
      if (!userAdmin()) return fail('You do not have permission to upload TV display media.', 403);
      const type = body?.type;
      if (type !== 'image' && type !== 'video') return fail('type must be "image" or "video".', 400);
      const fileData = String(body?.fileData ?? '');
      if (!fileData.startsWith(`data:${type}/`)) return fail(`fileData does not look like a ${type} file.`, 400);
      if (fileData.length > 11 * 1024 * 1024) return fail('File too large -- max 8MB.', 400);
      const m = { id: newId('tvm'), type, fileName: String(body?.fileName ?? '').slice(0, 200), createdAt: nowIso(), fileData };
      tvMedia.unshift(m);
      return { ok: true, media: { id: m.id, type: m.type, fileName: m.fileName, createdAt: m.createdAt } };
    },
  ],
  [
    'DELETE',
    /^\/tv\/admin\/media\/([^/]+)$/,
    ([, raw]) => {
      if (!userAdmin()) return fail('You do not have permission to delete TV display media.', 403);
      const i = tvMedia.findIndex((m) => m.id === raw!);
      if (i < 0) return notFound('Not found.');
      tvMedia.splice(i, 1);
      return { ok: true };
    },
  ],
];
