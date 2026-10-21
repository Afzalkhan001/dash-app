// Demo voice notes for chat (owner: the chatvoice agent; spec docs/port/meets.md §7). The chat
// domain's fixture (fixtures/chat.ts) keeps the conversations; this file only adds voice messages to
// three of them, so every staff persona sees voice notes in context:
//   Creative Team   Sneha 0:38 (m4a), Rahul 0:12 recorded on the website (WebM: iOS shows the
//                   "open on the website" share fallback), and one of mine, 0:09
//   Lakshmi Prasad  Lakshmi 0:21
// It wraps the chat fixture's GET …/messages handler: each page gets the voice notes whose time falls
// inside that page's window (older than `before`, not older than the page's oldest message, or all the
// rest on the last page), so paging never shows one twice. Notes recorded in the demo go through the
// chat fixture's POST like any message, and play back from the phone (features/chatvoice/clips.ts).
// The demo cannot serve audio bytes, so others' notes say so when played.

import type { MeetsMessage, MessagesPage } from '@/api/chat';
import { DEMO_USER } from '@/demo/config';
import { chatRoutes } from '@/demo/fixtures/chat';
import { personById } from '@/demo/fixtures/org';
import { daysAgo, fail, type Handler, nowIso, type Route } from '@/demo/state';

const ME = DEMO_USER.id;

function note(id: string, conversationId: string, senderId: string, at: string, seconds: number, ext: 'm4a' | 'webm', size: number): MeetsMessage {
  const name = `Voice message (${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}).${ext}`;
  return {
    id,
    conversationId,
    senderId,
    senderName: senderId === ME ? DEMO_USER.name : (personById(senderId)?.name ?? 'Someone'),
    body: name,
    deleted: false,
    createdAt: at,
    editedAt: null,
    attachment: { name, type: ext === 'webm' ? 'audio/webm' : 'audio/mp4', size },
  };
}

const VOICE: MeetsMessage[] = [
  note('vn-creative-1', 'c-creative', 'u-sneha', daysAgo(2, '12:18'), 38, 'm4a', 612_000),
  note('vn-creative-2', 'c-creative', 'u-rahul', daysAgo(2, '15:41'), 12, 'webm', 96_000),
  note('vn-creative-3', 'c-creative', ME, daysAgo(2, '15:44'), 9, 'm4a', 151_000),
  note('vn-lakshmi-1', 'c-lakshmi', 'u-lakshmi', daysAgo(6, '18:05'), 21, 'm4a', 338_000),
];

const t = (iso: string) => Date.parse(iso);
const MESSAGES_RE = /^\/meets\/conversations\/([^/]+)\/messages$/;
const ONE_RE = /^\/meets\/conversations\/([^/]+)\/messages\/(vn-[^/]+)$/;

// My own demo voice note can be deleted for everyone, like any message (meets.js: sender only).
const deletedAt = new Map<string, string>();
const shown = (v: MeetsMessage): MeetsMessage => (deletedAt.has(v.id) ? { ...v, body: null, deleted: true, attachment: null } : v);

const deleteVoice: Handler = (p) => {
  const v = VOICE.find((x) => x.id === p[2] && x.conversationId === p[1]);
  if (!v || deletedAt.has(v.id)) return fail('That message is not available.', 404);
  if (v.senderId !== ME) return fail('You can only delete your own messages.', 403);
  deletedAt.set(v.id, nowIso());
  return { messageId: v.id };
};

const base: Handler | undefined = chatRoutes.find(([m, re]) => m === 'GET' && re.test('/meets/conversations/c-x/messages'))?.[2];

const withVoice: Handler = (p, body, q) => {
  const out = base ? (base(p, body, q) as MessagesPage | { error: string }) : null;
  if (!out || 'error' in out || !Array.isArray(out.messages)) return out;
  const before = q.get('before');
  const page = out.messages;
  const oldest = page.length ? page[page.length - 1]!.createdAt : null;
  const add = VOICE.filter(
    (v) => v.conversationId === p[1] && (!before || t(v.createdAt) < t(before)) && (!out.hasMore || !oldest || t(v.createdAt) >= t(oldest)),
  );
  if (!add.length) return out;
  const messages = [...page, ...add.map(shown)].sort((a, b) => t(b.createdAt) - t(a.createdAt));
  return { ...out, messages };
};

export const chatvoiceRoutes: Route[] = base
  ? [
      ['GET', MESSAGES_RE, withVoice],
      ['DELETE', ONE_RE, deleteVoice],
    ]
  : [];
