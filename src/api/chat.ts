// Meets chat (website: MeetsHub / MeetsLauncher, dash.html:7000–10393; server: meets.js). Text chat,
// groups and attachments. Calls (meetings, WebRTC) belong to the calls domain and wait for a
// development build (docs/port/PLAN.md D3), so only the call *event* is typed here.
//
// Every route sits behind the staff Bearer gate and decides by membership (no role check):
//   GET    /meets/health                                   chatReady, missingTables… (not set up → banner)
//   GET    /meets/directory                                { people: [{id,name,email,dept,jobTitle}] } — everyone but me
//   GET    /meets/conversations                            { conversations: ConversationRow[] }, newest activity first
//   GET    /meets/unread                                   { messages, people, conversations: {id: n}, capped }
//   POST   /meets/conversations                            {type:'direct',memberIds:[id]} | {type:'group',name,memberIds}
//   GET    /meets/conversations/:id                        { conversation, members }
//   PATCH  /meets/conversations/:id                        { name } — owner/admin, groups (no web UI; spec §4.2)
//   POST   /meets/conversations/:id/read                   {} → marks read
//   POST   /meets/conversations/:id/members                { memberIds } — owner/admin, groups
//   DELETE /meets/conversations/:id/members/:userId        leave (me) or remove (owner/admin, never the owner)
//   GET    /meets/conversations/:id/messages?before&limit  newest first, 50 a page
//   POST   /meets/conversations/:id/messages               { body?, attachment?: {name,type,dataUrl} }
//   DELETE /meets/conversations/:id/messages/:messageId    soft delete for everyone (sender only)
//   GET    /meets/conversations/:id/messages/:mid/attachment[?inline=1]   raw bytes (Bearer)
//   GET    /meets/attachments/policy                       { maxBytes, maxAudioBytes, types, inlineTypes, extensions }
//   GET    /meets/conversations/:id/export                 { rows, txt, truncated } — writes an audit row
//   POST   /meets/stream-ticket                            { ticket } for GET /meets/stream?ticket= (features/chat/realtime)
//
// Messages, previews and the directory are private: none of them is saved to disk (meta.persist false).

import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query';

import { api, apiFetch, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';
import { API_URL } from '@/config';

// ── Types (the fields the website reads) ─────────────────────────────────────
export type MeetsPerson = { id: string; name?: string | null; email?: string | null; dept?: string | null; jobTitle?: string | null };

export type MeetsAttachment = { name: string; type: string; size: number };

export type MeetsMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string | null;
  body: string | null;
  deleted: boolean;
  createdAt: string;
  editedAt?: string | null;
  attachment: MeetsAttachment | null;
};

export type MeetsLastMessage = {
  id: string;
  senderId: string;
  senderName?: string | null;
  body: string | null;
  deleted: boolean;
  createdAt: string;
};

export type ConversationType = 'direct' | 'group';
export type MemberRole = 'owner' | 'admin' | 'member';

export type ConversationRow = {
  id: string;
  type: ConversationType;
  name: string;
  createdAt: string;
  myRole: MemberRole | null;
  leftAt: string | null;
  unread: number;
  lastReadAt: string | null;
  memberCount: number;
  others: MeetsPerson[];
  lastMessage: MeetsLastMessage | null;
};

export type ConversationDetail = {
  id: string;
  type: ConversationType;
  name: string | null;
  created_by?: string | null;
  created_at: string;
  myRole: MemberRole | null;
  leftAt: string | null;
  canPost: boolean;
  lastReadAt: string | null;
};

export type MeetsMember = MeetsPerson & { role: MemberRole; joinedAt?: string | null; leftAt?: string | null };

export type ConversationResponse = { conversation: ConversationDetail; members: MeetsMember[] };
export type MessagesPage = { messages: MeetsMessage[]; hasMore: boolean; nextBefore: string | null };
export type UnreadResponse = { messages: number; people: number; missedCalls: number; conversations: Record<string, number>; capped?: boolean };
export type AttachmentPolicy = { maxBytes: number; maxAudioBytes: number; types: string[]; inlineTypes: string[]; extensions: string[] };
export type ChatHealth = { chatReady?: boolean; filesReady?: boolean; unreadReady?: boolean; missingTables?: string[]; runThese?: string[] };
export type ExportRow = { timestamp: string; sender: string; message: string; attachment: string };
export type ExportResponse = {
  conversation: { id: string; type: ConversationType; name: string | null };
  exportedBy?: MeetsPerson | null;
  exportedAt?: string;
  clippedTo?: string | null;
  truncated: boolean;
  rows: ExportRow[];
  txt: string;
};
export type CreatedConversation = { conversation: { id: string; type: ConversationType; name: string | null; created_at?: string; existed?: boolean } };

/** The server's own fallback when the policy has not loaded (meets.js MAX_ATTACH_BYTES / MAX_AUDIO_BYTES). */
export const DEFAULT_POLICY: AttachmentPolicy = {
  maxBytes: 8 * 1024 * 1024,
  maxAudioBytes: 3 * 1024 * 1024,
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

export const MAX_BODY = 4000;
export const MESSAGE_PAGE = 50;

// ── Query keys ───────────────────────────────────────────────────────────────
// Everything under ['chat', me] so a sign-out or persona switch never shows another person's chats.
export const chatKeys = {
  all: ['chat'] as const,
  mine: (me?: string) => ['chat', me ?? ''] as const,
  conversations: (me?: string) => ['chat', me ?? '', 'conversations'] as const,
  unread: (me?: string) => ['chat', me ?? '', 'unread'] as const,
  conversation: (me: string | undefined, id: string) => ['chat', me ?? '', 'conversation', id] as const,
  messages: (me: string | undefined, id: string) => ['chat', me ?? '', 'messages', id] as const,
  directory: (me?: string) => ['chat', me ?? '', 'directory'] as const,
  policy: (me?: string) => ['chat', me ?? '', 'policy'] as const,
  health: (me?: string) => ['chat', me ?? '', 'health'] as const,
};

const enc = encodeURIComponent;
const convPath = (id: string) => `/meets/conversations/${enc(id)}`;
const noPersist = { persist: false } as const;

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// ── Reads ────────────────────────────────────────────────────────────────────
export function useConversations(enabled = true) {
  const me = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: chatKeys.conversations(me),
    enabled: enabled && !!me,
    meta: noPersist,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ conversations: ConversationRow[] }>('/meets/conversations', signal));
      return arr<ConversationRow>(r?.conversations).filter((c) => c && typeof c.id === 'string');
    },
  });
}

/** The unread badge (Home header dot). Refreshed every minute — the same fallback the website's badge uses. */
export function useUnread(enabled = true) {
  const me = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: chatKeys.unread(me),
    enabled: enabled && !!me,
    refetchInterval: 60_000,
    staleTime: 20_000,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<UnreadResponse>('/meets/unread', signal));
      return {
        messages: Number(r?.messages) || 0,
        people: Number(r?.people) || 0,
        missedCalls: Number(r?.missedCalls) || 0,
        conversations: r?.conversations && typeof r.conversations === 'object' ? r.conversations : {},
        capped: !!r?.capped,
      } satisfies UnreadResponse;
    },
  });
}

export function useConversation(id: string, enabled = true) {
  const me = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: chatKeys.conversation(me, id),
    enabled: enabled && !!me && !!id,
    meta: noPersist,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<ConversationResponse>(convPath(id), signal));
      return { conversation: r.conversation, members: arr<MeetsMember>(r.members) };
    },
  });
}

/** History, newest first, 50 a page; older pages through `?before=<nextBefore>` (dash.html:9828). */
export function useMessages(id: string, enabled = true) {
  const me = useSession((s) => s.user?.id);
  return useInfiniteQuery({
    queryKey: chatKeys.messages(me, id),
    enabled: enabled && !!me && !!id,
    meta: noPersist,
    initialPageParam: null as string | null,
    getNextPageParam: (last: MessagesPage) => (last.hasMore && last.nextBefore ? last.nextBefore : undefined),
    queryFn: async ({ pageParam, signal }) => {
      const q = `?limit=${MESSAGE_PAGE}${pageParam ? `&before=${enc(pageParam)}` : ''}`;
      const r = await unwrap(api.get<MessagesPage>(`${convPath(id)}/messages${q}`, signal));
      return { messages: arr<MeetsMessage>(r?.messages), hasMore: !!r?.hasMore, nextBefore: r?.nextBefore ?? null } satisfies MessagesPage;
    },
  });
}

/** Everyone I can message (active users minus me), sorted by name. The server caches it for 60 s. */
export function useDirectory(enabled = true) {
  const me = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: chatKeys.directory(me),
    enabled: enabled && !!me,
    staleTime: 60_000,
    meta: noPersist,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ people: MeetsPerson[] }>('/meets/directory', signal));
      return arr<MeetsPerson>(r?.people).filter((p) => p && p.id);
    },
  });
}

export function useAttachmentPolicy(enabled = true) {
  const me = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: chatKeys.policy(me),
    enabled: enabled && !!me,
    staleTime: 60 * 60_000,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<AttachmentPolicy>('/meets/attachments/policy', signal));
      return {
        maxBytes: Number(r?.maxBytes) || DEFAULT_POLICY.maxBytes,
        maxAudioBytes: Number(r?.maxAudioBytes) || DEFAULT_POLICY.maxAudioBytes,
        types: arr<string>(r?.types).length ? arr<string>(r.types) : DEFAULT_POLICY.types,
        inlineTypes: arr<string>(r?.inlineTypes).length ? arr<string>(r.inlineTypes) : DEFAULT_POLICY.inlineTypes,
        extensions: arr<string>(r?.extensions).length ? arr<string>(r.extensions) : DEFAULT_POLICY.extensions,
      } satisfies AttachmentPolicy;
    },
  });
}

/** Whether chat is set up on the server (the list shows a banner when chatReady is false). */
export function useChatHealth(enabled = true) {
  const me = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: chatKeys.health(me),
    enabled: enabled && !!me,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => unwrap(api.get<ChatHealth>('/meets/health', signal)),
  });
}

// ── Writes (each resolves to the result or `{ error }`; callers show the server's own words) ──
export const chatApi = {
  createDirect: (personId: string) => api.post<CreatedConversation>('/meets/conversations', { type: 'direct', memberIds: [personId] }),
  createGroup: (name: string, memberIds: string[]) => api.post<CreatedConversation>('/meets/conversations', { type: 'group', name, memberIds }),
  rename: (id: string, name: string) => api.patch<{ conversation: { id: string; type: ConversationType; name: string } }>(convPath(id), { name }),
  markRead: (id: string) => api.post<{ conversationId: string; lastReadAt: string }>(`${convPath(id)}/read`, {}),
  addMembers: (id: string, memberIds: string[]) => api.post<{ added: MeetsPerson[] }>(`${convPath(id)}/members`, { memberIds }),
  removeMember: (id: string, userId: string) => api.del<{ userId: string; leftAt: string }>(`${convPath(id)}/members/${enc(userId)}`),
  /** A message with a file can take a while on a slow network (spec R10): 60 s instead of 12. */
  send: (id: string, body: string, attachment?: { name: string; type: string; dataUrl: string } | null) =>
    apiFetch<{ message: MeetsMessage }>(`${convPath(id)}/messages`, {
      method: 'POST',
      body: attachment ? { body, attachment } : { body },
      timeoutMs: attachment ? 60_000 : undefined,
    }),
  deleteMessage: (id: string, messageId: string) => api.del<{ messageId: string }>(`${convPath(id)}/messages/${enc(messageId)}`),
  exportChat: (id: string) => apiFetch<ExportResponse>(`${convPath(id)}/export`, { timeoutMs: 30_000 }),
  streamTicket: () => api.post<{ ticket: string; expiresInMs: number }>('/meets/stream-ticket', {}),
};

/** The attachment's bytes (Bearer). `inline` asks for the image / audio form the server marks inline. */
export const attachmentPath = (conversationId: string, messageId: string, inline = false) =>
  `${convPath(conversationId)}/messages/${enc(messageId)}/attachment${inline ? '?inline=1' : ''}`;
export const attachmentUrl = (conversationId: string, messageId: string, inline = false) => API_URL + attachmentPath(conversationId, messageId, inline);

// ── Cache helpers (used by the screens and by the live stream) ───────────────
type MessagesData = { pages: MessagesPage[]; pageParams: (string | null)[] };

/** Put a message into the open thread's first page (newest first), once. */
export function addMessageToCache(qc: QueryClient, me: string | undefined, msg: MeetsMessage) {
  qc.setQueryData<MessagesData>(chatKeys.messages(me, msg.conversationId), (old) => {
    if (!old || !old.pages.length) return old;
    if (old.pages.some((p) => p.messages.some((m) => m.id === msg.id))) return old;
    const [first, ...rest] = old.pages;
    return { ...old, pages: [{ ...first!, messages: [msg, ...first!.messages] }, ...rest] };
  });
}

/** Mark a message deleted in the thread cache (the body is never shown again). */
export function markDeletedInCache(qc: QueryClient, me: string | undefined, conversationId: string, messageId: string) {
  qc.setQueryData<MessagesData>(chatKeys.messages(me, conversationId), (old) =>
    old
      ? { ...old, pages: old.pages.map((p) => ({ ...p, messages: p.messages.map((m) => (m.id === messageId ? { ...m, deleted: true, body: null, attachment: null } : m)) })) }
      : old,
  );
}

/** Bump the list row in place for a new message (the website's bumpRow, dash.html:9911). */
export function bumpRowInCache(qc: QueryClient, me: string | undefined, msg: MeetsMessage, countUnread: boolean) {
  let found = false;
  qc.setQueryData<ConversationRow[]>(chatKeys.conversations(me), (old) => {
    if (!old) return old;
    const next = old.map((c) => {
      if (c.id !== msg.conversationId) return c;
      found = true;
      return {
        ...c,
        unread: countUnread ? Math.min(99, (c.unread || 0) + 1) : c.unread,
        lastMessage: { id: msg.id, senderId: msg.senderId, senderName: msg.senderName, body: msg.body ? msg.body.slice(0, 140) : msg.body, deleted: false, createdAt: msg.createdAt },
      };
    });
    const at = (c: ConversationRow) => Date.parse(c.lastMessage?.createdAt || c.createdAt) || 0;
    return next.sort((a, b) => at(b) - at(a));
  });
  return found;
}

/**
 * Clear a row's unread count (after marking it read). `at` is the new read mark (the server's
 * lastReadAt): it is written into the list row and the thread's cached detail too, so reopening the
 * thread from cache does not put the "New messages" divider back above messages already read.
 */
export function clearRowUnread(qc: QueryClient, me: string | undefined, conversationId: string, at?: string | null) {
  qc.setQueryData<ConversationRow[]>(chatKeys.conversations(me), (old) =>
    old ? old.map((c) => (c.id === conversationId ? { ...c, unread: 0, ...(at ? { lastReadAt: at } : null) } : c)) : old,
  );
  if (at) {
    qc.setQueryData<ConversationResponse>(chatKeys.conversation(me, conversationId), (old) =>
      old ? { ...old, conversation: { ...old.conversation, lastReadAt: at } } : old,
    );
  }
  qc.setQueryData<UnreadResponse>(chatKeys.unread(me), (old) => {
    if (!old) return old;
    const n = old.conversations?.[conversationId] ?? 0;
    const conversations = { ...old.conversations };
    delete conversations[conversationId];
    return { ...old, messages: Math.max(0, old.messages - n), conversations };
  });
}
