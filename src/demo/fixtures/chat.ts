// Demo API for the chat domain (Meets text chat + attachments; docs/port/meets.md §7). Owner: the chat
// agent. Every route mirrors meets.js — membership decides, never a role — and responses use the app's
// own types (api/chat.ts), so tsc checks them. "Me" is DEMO_USER (the demo server shows it as whichever
// Afzal persona is exploring), so every staff persona finds the same five conversations:
//
//   Priya Sharma      direct   2 unread: a question, then a PDF
//   Creative Team     group    ~70 messages over 4 days (paging, day chips), an image, a deleted
//                              message, 5 unread with the "New messages" divider; Priya owns it
//   Nimbus launch     group    I own it: rename, add people, remove someone
//   Lakshmi Prasad    direct   older, all read
//   Goa shoot – Sept  group    I left it: read-only, export still works
//
// Live feel: `chatDemoEvents` is the demo's stream (features/chat/realtime.ts listens to it). About 2 s
// after I send in a direct chat the other person replies; in a group, one teammate does.
// Media: the fixture cannot serve bytes, so `chatDemoImage(messageId)` gives the thread a drawn
// picture for the sample image; downloads say they are not in the demo (lib/files downloadAuthed).

import type {
  AttachmentPolicy,
  ChatHealth,
  ConversationDetail,
  ConversationResponse,
  ConversationRow,
  ConversationType,
  CreatedConversation,
  ExportResponse,
  MeetsAttachment,
  MeetsMember,
  MeetsMessage,
  MeetsPerson,
  MemberRole,
  MessagesPage,
  UnreadResponse,
} from '@/api/chat';
import { DEMO_USER } from '@/demo/config';
import { allPeople, personById } from '@/demo/fixtures/org';
import { selfAs } from '@/demo/personas';
import { daysAgo, fail, minutesAgo, newId, notFound, nowIso, type Route } from '@/demo/state';

const ME = DEMO_USER.id;

// ── The emitter (the demo's stand-in for GET /meets/stream) ──────────────────
type DemoListener = (name: string, data: unknown) => void;
const demoListeners = new Set<DemoListener>();
export const chatDemoEvents = {
  on(fn: DemoListener) {
    demoListeners.add(fn);
    return () => {
      demoListeners.delete(fn);
    };
  },
};
// Events skip the demo server's id swap, so "me" is rewritten to the persona here.
function emit(name: string, data: unknown) {
  const me = selfAs();
  const out = JSON.parse(JSON.stringify(data), (_k, v) => (v === ME ? me.id : v === DEMO_USER.name ? me.name : v));
  for (const fn of [...demoListeners]) fn(name, out);
}

// ── People ───────────────────────────────────────────────────────────────────
function publicUser(id: string): MeetsPerson | null {
  const p = personById(id);
  if (!p) return null;
  return { id: p.id, name: p.name, email: p.email ?? null, dept: p.dept ?? null, jobTitle: (p.jobTitle as string | undefined) ?? null };
}
const nameOf = (id: string) => personById(id)?.name ?? 'Former employee';

// ── State ────────────────────────────────────────────────────────────────────
type Member = { userId: string; role: MemberRole; joinedAt: string; leftAt: string | null };
type Conv = { id: string; type: ConversationType; name: string | null; createdBy: string; createdAt: string; members: Member[] };
type Msg = { id: string; conversationId: string; senderId: string; body: string; createdAt: string; deletedAt: string | null; attachment: MeetsAttachment | null };

const convs: Conv[] = [];
const msgs: Msg[] = [];
const readMark = new Map<string, string>(); // my last_read_at per conversation
const demoImages = new Set<string>();

let seq = 0;
const msgId = () => `dm-${(++seq).toString().padStart(4, '0')}`;
function say(conversationId: string, senderId: string, at: string, body: string, attachment: MeetsAttachment | null = null, deleted = false) {
  const m: Msg = { id: msgId(), conversationId, senderId, body: body || attachment?.name || '', createdAt: at, deletedAt: deleted ? at : null, attachment };
  msgs.push(m);
  return m;
}
const member = (userId: string, role: MemberRole, joinedAt: string, leftAt: string | null = null): Member => ({ userId, role, joinedAt, leftAt });

// A minute-precision IST time n days back, plus a few minutes so a day's messages keep their order.
const at = (day: number, hm: string) => daysAgo(day, hm);

// 1. Priya — direct, two unread.
{
  const id = 'c-priya';
  convs.push({ id, type: 'direct', name: null, createdBy: 'u-priya', createdAt: at(30, '10:00'), members: [member('u-priya', 'owner', at(30, '10:00')), member(ME, 'owner', at(30, '10:00'))] });
  say(id, 'u-priya', at(1, '16:05'), 'Loved the colour pass on the Nimbus teaser.');
  say(id, ME, at(1, '16:12'), 'Thanks! Rahul did most of the grade.');
  say(id, 'u-priya', at(1, '16:14'), 'Tell him. Client call is tomorrow, I’ll share notes after.');
  readMark.set(id, at(1, '16:15'));
  say(id, 'u-priya', minutesAgo(26), 'Can you share the Nimbus cut by 5?');
  say(id, 'u-priya', minutesAgo(24), '', { name: 'Nimbus_feedback.pdf', type: 'application/pdf', size: 1_258_291 });
}

// 2. Creative Team — the busy group.
{
  const id = 'c-creative';
  const team = ['u-rahul', 'u-sneha', 'u-sanjay', 'u-kavya', 'u-nikhil'];
  convs.push({
    id,
    type: 'group',
    name: 'Creative Team',
    createdBy: 'u-priya',
    createdAt: at(60, '09:30'),
    members: [member('u-priya', 'owner', at(60, '09:30')), member(ME, 'member', at(60, '09:31')), ...team.map((u) => member(u, 'member', at(60, '09:31')))],
  });
  const script: [string, string][] = [
    ['u-sanjay', 'On my way.'],
    ['u-rahul', 'Grading the Nimbus teaser today, need the final XML.'],
    [ME, 'Exporting it now, give me 10 minutes.'],
    ['u-kavya', 'Where are the B-roll selects for the café shoot?'],
    ['u-nikhil', 'Shared drive → Café → Selects_v2.'],
    ['u-kavya', 'Found them, thanks!'],
    ['u-sneha', 'Lower thirds for Nimbus are done. Please check the font size on phones.'],
    ['u-priya', 'Looks clean. Make the name line one step bigger.'],
    ['u-sneha', 'Done.'],
    ['u-sanjay', 'Render queue is free after 3 if anyone needs it.'],
    [ME, 'I’ll take the 3 o’clock slot.'],
    ['u-rahul', 'Teaser grade v1 is up for review.'],
    ['u-priya', 'Skin tones are a little warm in shot 14.'],
    ['u-rahul', 'Fixing.'],
    ['u-nikhil', 'Can someone sync the interview audio? Anita is out today.'],
    [ME, 'I can do it after lunch.'],
    ['u-kavya', 'Music licence for the reel came through.'],
    ['u-priya', 'Great, add the cue sheet to the folder.'],
    ['u-sanjay', 'Who has the LUT for the drone shots?'],
    ['u-rahul', 'In my folder: DroneLog_to_709.cube'],
  ];
  // Four days of chatter, ~18 a day, so the thread pages (50 a page) and shows day chips.
  let n = 0;
  for (const day of [4, 3, 2]) {
    say(id, 'u-priya', at(day, '09:02'), 'Morning all. Stand-up at 10 in the edit bay.');
    for (let i = 0; i < script.length; i++) {
      const [who, text] = script[(i + day * 5) % script.length]!;
      const min = 9 * 60 + 20 + i * 22 + day; // 9:20 AM onwards, in order
      say(id, who, at(day, `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`), text, null, n === 17);
      n++;
    }
  }
  // Yesterday: the image and some planning.
  say(id, 'u-priya', at(1, '10:02'), 'Storyboard for the monsoon spot is final.');
  const img = say(id, 'u-sneha', at(1, '10:20'), '', { name: 'Monsoon_storyboard.png', type: 'image/png', size: 486_211 });
  demoImages.add(img.id);
  say(id, 'u-sanjay', at(1, '10:31'), 'Frame 4 is lovely.');
  say(id, ME, at(1, '11:05'), 'I’ll rough-cut the animatic from these today.');
  say(id, 'u-priya', at(1, '17:40'), 'Thanks everyone, good day.');
  readMark.set(id, at(1, '18:00'));
  // Today: five unread.
  say(id, 'u-rahul', minutesAgo(95), 'Grade v2 of the teaser is up.');
  say(id, 'u-kavya', minutesAgo(80), 'Café reel first cut is in the review folder.');
  say(id, 'u-priya', minutesAgo(64), 'Afternoon review at 4. Bring your timelines.');
  say(id, 'u-sanjay', minutesAgo(41), 'Render queue is free till 3.');
  say(id, 'u-nikhil', minutesAgo(12), 'Interview audio is synced, thanks for the help.');
}

// 3. Nimbus launch — I own it.
{
  const id = 'c-nimbus';
  convs.push({
    id,
    type: 'group',
    name: 'Nimbus launch',
    createdBy: ME,
    createdAt: at(9, '12:00'),
    members: [member(ME, 'owner', at(9, '12:00')), member('u-vikram', 'member', at(9, '12:00')), member('u-meera', 'member', at(9, '12:00')), member('u-zoya', 'member', at(9, '12:00'))],
  });
  say(id, ME, at(9, '12:01'), 'Group for the Nimbus launch: edit, social and the press kit.');
  say(id, 'u-vikram', at(9, '12:20'), 'Launch date is the 3rd. Social teasers start a week before.');
  say(id, 'u-zoya', at(8, '15:10'), 'I need 3 vertical cut-downs: 6, 10 and 15 seconds.');
  say(id, ME, at(8, '15:30'), 'Noted. You’ll have them by Friday.');
  say(id, 'u-meera', at(2, '11:45'), '', { name: 'Nimbus_launch_copy.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 84_512 });
  say(id, 'u-meera', at(2, '11:46'), 'Captions for each cut are in the doc.');
  readMark.set(id, at(2, '12:00'));
}

// 4. Lakshmi — older, all read.
{
  const id = 'c-lakshmi';
  convs.push({ id, type: 'direct', name: null, createdBy: ME, createdAt: at(20, '11:00'), members: [member(ME, 'owner', at(20, '11:00')), member('u-lakshmi', 'owner', at(20, '11:00'))] });
  say(id, ME, at(6, '11:02'), 'Hi Lakshmi, is my address change through?');
  say(id, 'u-lakshmi', at(6, '11:30'), 'Yes, updated this morning. It shows on your next payslip.');
  say(id, ME, at(6, '11:31'), 'Thank you!');
  readMark.set(id, at(6, '11:32'));
}

// 5. Goa shoot – Sept — I left it.
{
  const id = 'c-goa';
  const left = at(14, '18:00');
  convs.push({
    id,
    type: 'group',
    name: 'Goa shoot – Sept',
    createdBy: 'u-deepa',
    createdAt: at(40, '09:00'),
    members: [member('u-deepa', 'owner', at(40, '09:00')), member(ME, 'member', at(40, '09:00'), left), member('u-farhan', 'member', at(40, '09:00')), member('u-imran', 'member', at(40, '09:00'))],
  });
  say(id, 'u-deepa', at(38, '09:15'), 'Call sheet for the Goa shoot is out. Flights on the 12th.');
  say(id, 'u-farhan', at(38, '09:40'), 'Camera kit list attached tomorrow.');
  say(id, ME, at(16, '20:10'), 'Final edit delivered. Thanks team!');
  say(id, 'u-deepa', at(15, '10:00'), 'Client approved. Great work.');
  say(id, 'u-imran', at(10, '12:00'), 'Planning the next shoot.'); // never shown: after I left
  readMark.set(id, left);
}

// ── Reading ──────────────────────────────────────────────────────────────────
const convById = (id: string) => convs.find((c) => c.id === id);
const myMembership = (c: Conv) => c.members.find((m) => m.userId === ME) ?? null;
const t = (iso: string) => Date.parse(iso) || 0;

function visibleMsgs(c: Conv, mem: Member) {
  return msgs.filter((m) => m.conversationId === c.id && (!mem.leftAt || t(m.createdAt) <= t(mem.leftAt))).sort((a, b) => t(b.createdAt) - t(a.createdAt) || (b.id < a.id ? -1 : 1));
}

function unreadIn(c: Conv, mem: Member) {
  if (mem.leftAt) return 0;
  const since = readMark.get(c.id) ?? mem.joinedAt;
  return msgs.filter((m) => m.conversationId === c.id && m.senderId !== ME && !m.deletedAt && t(m.createdAt) > t(since)).length;
}

function toMessage(m: Msg): MeetsMessage {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    senderName: nameOf(m.senderId),
    body: m.deletedAt ? null : m.body,
    deleted: !!m.deletedAt,
    createdAt: m.createdAt,
    editedAt: null,
    attachment: m.deletedAt ? null : m.attachment,
  };
}

function rowOf(c: Conv, mem: Member): ConversationRow {
  const current = c.members.filter((m) => !m.leftAt);
  const others = current.filter((m) => m.userId !== ME);
  const last = visibleMsgs(c, mem)[0];
  return {
    id: c.id,
    type: c.type,
    name: c.type === 'group' ? c.name ?? 'Group' : publicUser(others[0]?.userId ?? '')?.name ?? 'Direct message',
    createdAt: c.createdAt,
    myRole: mem.role,
    leftAt: mem.leftAt,
    unread: Math.min(99, unreadIn(c, mem)),
    lastReadAt: readMark.get(c.id) ?? null,
    memberCount: current.length,
    others: others.slice(0, 8).map((m) => publicUser(m.userId)).filter((p): p is MeetsPerson => !!p),
    lastMessage: last
      ? { id: last.id, senderId: last.senderId, senderName: nameOf(last.senderId), body: last.deletedAt ? null : last.body.slice(0, 140), deleted: !!last.deletedAt, createdAt: last.createdAt }
      : null,
  };
}

/** requireMember (meets.js:311): current for writes, current or former for reads. */
type Membership = { error: ReturnType<typeof fail> } | { c: Conv; mem: Member };
function membership(id: string, current: boolean): Membership {
  const c = convById(id);
  const mem = c ? myMembership(c) : null;
  if (!c || !mem) return { error: fail('That conversation is not available.', 403) };
  if (current && mem.leftAt) return { error: fail('You are no longer a member of this conversation.', 403) };
  return { c, mem };
}

const isGroupManager = (c: Conv, mem: Member) => c.type === 'group' && !mem.leftAt && (mem.role === 'owner' || mem.role === 'admin');

// ── Replies (the live feel) ──────────────────────────────────────────────────
const REPLIES = [
  'Sounds good 👍',
  'On it.',
  'Thanks, got it.',
  'Give me 10 minutes.',
  'Perfect, I’ll take a look.',
  'Sure, will do.',
  'Noted!',
];
let replyN = 0;
function scheduleReply(c: Conv) {
  const others = c.members.filter((m) => !m.leftAt && m.userId !== ME);
  if (!others.length) return;
  const who = others[replyN % others.length]!.userId;
  const text = REPLIES[replyN % REPLIES.length]!;
  replyN++;
  setTimeout(() => {
    const m = say(c.id, who, nowIso(), text);
    emit('message', toMessage(m));
  }, 2000);
}

/** The drawn stand-in for a sample image (the fixture cannot serve bytes). */
export function chatDemoImage(messageId: string): string | null {
  if (!demoImages.has(messageId)) return null;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">` +
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5B7FA6"/><stop offset="1" stop-color="#E7B98A"/></linearGradient></defs>` +
    `<rect width="640" height="400" fill="#F4EFE9"/>` +
    [0, 1, 2, 3]
      .map((i) => {
        const x = 20 + (i % 2) * 310;
        const y = 20 + Math.floor(i / 2) * 190;
        return (
          `<rect x="${x}" y="${y}" width="290" height="170" rx="14" fill="url(#s)"/>` +
          `<path d="M${x} ${y + 170} L${x + 90 + i * 20} ${y + 80} L${x + 170} ${y + 140} L${x + 220} ${y + 100} L${x + 290} ${y + 170} Z" fill="#2F4A3A" opacity="0.85"/>` +
          `<circle cx="${x + 230 - i * 25}" cy="${y + 45}" r="18" fill="#FFF6E5" opacity="0.9"/>` +
          `<text x="${x + 14}" y="${y + 28}" font-family="sans-serif" font-size="16" fill="#ffffff">Frame ${i + 1}</text>`
        );
      })
      .join('') +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ── Routes ───────────────────────────────────────────────────────────────────
const CONV = '/meets/conversations/([^/]+)';
const re = (s: string) => new RegExp(`^${s}$`);

const POLICY: AttachmentPolicy = {
  maxBytes: 8_388_608,
  maxAudioBytes: 3_145_728,
  types: [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'audio/webm',
    'audio/mp4',
  ],
  inlineTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'audio/webm', 'audio/mp4'],
  extensions: ['.png', '.jpg', '.gif', '.webp', '.pdf', '.txt', '.csv', '.zip', '.docx', '.xlsx', '.pptx', '.webm', '.m4a'],
};

// 2026-09-23 18:42:07 in India time (meets.js istStamp).
function istStamp(iso: string) {
  const d = new Date(t(iso) + 330 * 60_000).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 19)}`;
}
const csvSafe = (v: string) => ('=+-@'.includes(v.replace(/^\s+/, '').charAt(0)) ? `'${v}` : v);

export const chatRoutes: Route[] = [
  ['GET', re('/meets/health'), (): ChatHealth => ({ chatReady: true, filesReady: true, unreadReady: true, missingTables: [], runThese: [] })],
  ['GET', re('/meets/attachments/policy'), () => POLICY],
  // The demo has no stream: realtime.ts sees this and listens to chatDemoEvents instead.
  ['POST', re('/meets/stream-ticket'), () => fail('demo', 400)],

  [
    'GET',
    re('/meets/directory'),
    () => ({
      people: allPeople()
        .filter((p) => p.id !== ME && p.status !== 'inactive' && !p.resigned)
        .map((p) => publicUser(p.id))
        .filter((p): p is MeetsPerson => !!p)
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    }),
  ],

  [
    'GET',
    re('/meets/conversations'),
    () => {
      const rows = convs.flatMap((c) => {
        const mem = myMembership(c);
        return mem ? [rowOf(c, mem)] : [];
      });
      rows.sort((a, b) => t(b.lastMessage?.createdAt || b.createdAt) - t(a.lastMessage?.createdAt || a.createdAt));
      return { conversations: rows };
    },
  ],

  [
    'GET',
    re('/meets/unread'),
    (): UnreadResponse => {
      const per: Record<string, number> = {};
      const senders = new Set<string>();
      let total = 0;
      for (const c of convs) {
        const mem = myMembership(c);
        if (!mem || mem.leftAt) continue;
        const n = unreadIn(c, mem);
        if (!n) continue;
        per[c.id] = Math.min(99, n);
        total += n;
        const since = readMark.get(c.id) ?? mem.joinedAt;
        for (const m of msgs) if (m.conversationId === c.id && m.senderId !== ME && !m.deletedAt && t(m.createdAt) > t(since)) senders.add(m.senderId);
      }
      return { messages: total, people: senders.size, missedCalls: 0, conversations: per, capped: false };
    },
  ],

  [
    'POST',
    re('/meets/conversations'),
    (_p, body): CreatedConversation | ReturnType<typeof fail> => {
      const type = body?.type;
      if (type !== 'direct' && type !== 'group') return fail('type must be "direct" or "group".');
      const ids = [...new Set((Array.isArray(body?.memberIds) ? body.memberIds : []).map(String))].filter((id) => id !== ME) as string[];
      if (ids.some((id) => !personById(id))) return fail('One of the people you picked no longer has a DASH account.');
      const now = nowIso();
      if (type === 'direct') {
        if (ids.length !== 1) return fail('A direct chat needs exactly one other person.');
        const other = ids[0]!;
        const existing = convs.find((c) => c.type === 'direct' && c.members.some((m) => m.userId === ME) && c.members.some((m) => m.userId === other));
        if (existing) return { conversation: { id: existing.id, type: 'direct', name: null, created_at: existing.createdAt, existed: true } };
        const c: Conv = { id: newId('c-'), type: 'direct', name: null, createdBy: ME, createdAt: now, members: [member(ME, 'owner', now), member(other, 'owner', now)] };
        convs.push(c);
        return { conversation: { id: c.id, type: 'direct', name: null, created_at: now, existed: false } };
      }
      const name = String(body?.name ?? '').trim().slice(0, 100);
      if (!name) return fail('A group needs a name of 1 to 100 characters.');
      if (!ids.length) return fail('A group needs at least one other person.');
      if (ids.length + 1 > 200) return fail('A group can hold at most 200 people.');
      const c: Conv = { id: newId('c-'), type: 'group', name, createdBy: ME, createdAt: now, members: [member(ME, 'owner', now), ...ids.map((u) => member(u, 'member', now))] };
      convs.push(c);
      return { conversation: { id: c.id, type: 'group', name, created_at: now, existed: false } };
    },
  ],

  [
    'GET',
    re(CONV),
    (p): ConversationResponse | ReturnType<typeof fail> => {
      const r = membership(p[1]!, false);
      if ('error' in r) return r.error;
      const { c, mem } = r;
      const conversation: ConversationDetail = {
        id: c.id,
        type: c.type,
        name: c.name,
        created_by: c.createdBy,
        created_at: c.createdAt,
        myRole: mem.role,
        leftAt: mem.leftAt,
        canPost: !mem.leftAt,
        lastReadAt: readMark.get(c.id) ?? null,
      };
      const members: MeetsMember[] = c.members.flatMap((m) => {
        const u = publicUser(m.userId);
        return u ? [{ ...u, role: m.role, joinedAt: m.joinedAt, leftAt: m.leftAt }] : [];
      });
      return { conversation, members };
    },
  ],

  [
    'PATCH',
    re(CONV),
    (p, body) => {
      const r = membership(p[1]!, true);
      if ('error' in r) return r.error;
      if (!isGroupManager(r.c, r.mem)) return fail('Only the group owner or an admin can rename it.', 403);
      const name = String(body?.name ?? '').trim().slice(0, 100);
      if (!name) return fail('A group needs a name of 1 to 100 characters.');
      r.c.name = name;
      emit('conversation', { conversationId: r.c.id });
      return { conversation: { id: r.c.id, type: r.c.type, name } };
    },
  ],

  [
    'POST',
    re(`${CONV}/read`),
    (p) => {
      const r = membership(p[1]!, false);
      if ('error' in r) return r.error;
      const now = nowIso();
      readMark.set(r.c.id, r.mem.leftAt && t(r.mem.leftAt) < t(now) ? r.mem.leftAt : now);
      return { conversationId: r.c.id, lastReadAt: now };
    },
  ],

  [
    'POST',
    re(`${CONV}/members`),
    (p, body) => {
      const r = membership(p[1]!, true);
      if ('error' in r) return r.error;
      if (!isGroupManager(r.c, r.mem)) return fail('Only the group owner or an admin can add people.', 403);
      const ids = [...new Set((Array.isArray(body?.memberIds) ? body.memberIds : []).map(String))] as string[];
      if (!ids.length) return fail('Pick at least one person.');
      if (ids.some((id) => !personById(id))) return fail('One of the people you picked no longer has a DASH account.');
      const now = nowIso();
      const added: MeetsPerson[] = [];
      for (const id of ids) {
        const existing = r.c.members.find((m) => m.userId === id);
        if (existing) {
          if (!existing.leftAt) continue;
          existing.leftAt = null;
          existing.joinedAt = now;
        } else r.c.members.push(member(id, 'member', now));
        const u = publicUser(id);
        if (u) added.push(u);
      }
      emit('members', { conversationId: r.c.id });
      return { added };
    },
  ],

  [
    'DELETE',
    re(`${CONV}/members/([^/]+)`),
    (p) => {
      const r = membership(p[1]!, true);
      if ('error' in r) return r.error;
      const target = p[2]!;
      if (r.c.type !== 'group') return fail('You cannot leave a direct chat.', 400);
      const m = r.c.members.find((x) => x.userId === target && !x.leftAt);
      if (!m) return notFound('That person is not in this group.');
      if (target !== ME) {
        if (!isGroupManager(r.c, r.mem)) return fail('Only the group owner or an admin can remove people.', 403);
        if (m.role === 'owner') return fail('The group owner cannot be removed.', 400);
      }
      m.leftAt = nowIso();
      emit('members', { conversationId: r.c.id });
      return { userId: target, leftAt: m.leftAt };
    },
  ],

  [
    'GET',
    re(`${CONV}/messages`),
    (p, _b, q): MessagesPage | ReturnType<typeof fail> => {
      const r = membership(p[1]!, false);
      if ('error' in r) return r.error;
      const limit = Math.min(100, Math.max(1, Number(q.get('limit')) || 50));
      const before = q.get('before');
      if (before && Number.isNaN(Date.parse(before))) return fail('before must be a timestamp.');
      const list = visibleMsgs(r.c, r.mem).filter((m) => !before || t(m.createdAt) < t(before));
      const page = list.slice(0, limit);
      const hasMore = list.length > limit;
      return { messages: page.map(toMessage), hasMore, nextBefore: hasMore ? page[page.length - 1]!.createdAt : null };
    },
  ],

  [
    'POST',
    re(`${CONV}/messages`),
    (p, body) => {
      const r = membership(p[1]!, true);
      if ('error' in r) return r.error;
      const text = typeof body?.body === 'string' ? body.body.trim() : '';
      const a = body?.attachment;
      if (!text && !a) return fail('Write a message or attach a file.');
      if ([...text].length > 4000) return fail('That message is too long (4000 characters at most).');
      let attachment: MeetsAttachment | null = null;
      if (a) {
        const type = String(a.type || '').toLowerCase();
        if (!POLICY.types.includes(type)) return fail('That kind of file cannot be sent here.');
        const b64 = String(a.dataUrl || '').split(',')[1] ?? '';
        const size = Math.round((b64.length * 3) / 4);
        const cap = type.startsWith('audio/') ? POLICY.maxAudioBytes : POLICY.maxBytes;
        if (size > cap) return fail('That file is too large.');
        attachment = { name: String(a.name || 'file').slice(0, 200), type, size };
      }
      const m = say(r.c.id, ME, nowIso(), text, attachment);
      if (attachment && attachment.type.startsWith('image/')) demoImages.add(m.id);
      readMark.set(r.c.id, m.createdAt);
      scheduleReply(r.c);
      return { message: toMessage(m) };
    },
  ],

  [
    'DELETE',
    re(`${CONV}/messages/([^/]+)`),
    (p) => {
      const r = membership(p[1]!, true);
      if ('error' in r) return r.error;
      const m = msgs.find((x) => x.id === p[2] && x.conversationId === r.c.id);
      if (!m) return notFound('That message is not available.');
      if (m.senderId !== ME) return fail('You can only delete your own messages.', 403);
      if (!m.deletedAt) m.deletedAt = nowIso();
      emit('message-deleted', { conversationId: r.c.id, messageId: m.id });
      return { messageId: m.id };
    },
  ],

  [
    'GET',
    re(`${CONV}/export`),
    (p): ExportResponse | ReturnType<typeof fail> => {
      const r = membership(p[1]!, false);
      if ('error' in r) return r.error;
      const { c, mem } = r;
      const list = visibleMsgs(c, mem)
        .filter((m) => !m.deletedAt)
        .reverse();
      const rows = list.map((m) => ({ timestamp: istStamp(m.createdAt), sender: csvSafe(nameOf(m.senderId)), message: csvSafe(m.body), attachment: csvSafe(m.attachment?.name ?? '') }));
      const other = c.members.find((m) => m.userId !== ME);
      const title = c.type === 'direct' ? `Direct message with ${other ? nameOf(other.userId) : 'a colleague'}` : c.name;
      const header = [
        `${title || 'Conversation'} — exported from DASH Meets`,
        `Exported by: ${String(DEMO_USER.name)}`,
        `Exported at: ${istStamp(nowIso())} IST`,
        mem.leftAt ? `Covers: up to ${istStamp(mem.leftAt)} IST, when you left this conversation` : 'Covers: the whole conversation',
        `Messages: ${rows.length}`,
        'All times are IST (Asia/Kolkata). Deleted messages are not included.',
        'Attached files are named, not included — download them from the conversation.',
        ''.padEnd(72, '-'),
      ].join('\n');
      const txt = `${header}\n${rows.map((x) => `[${x.timestamp}] ${x.sender}: ${x.message}${x.attachment ? `  [file: ${x.attachment}]` : ''}`).join('\n')}`;
      return {
        conversation: { id: c.id, type: c.type, name: c.name },
        exportedAt: istStamp(nowIso()),
        clippedTo: mem.leftAt ? istStamp(mem.leftAt) : null,
        truncated: false,
        rows,
        txt,
      };
    },
  ],
];
