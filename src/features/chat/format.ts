// Chat words and formats. Pure helpers (pass `today` from useTodayIst() during render). Dates and
// times are India time through lib/dates; the "New messages" logic is the website's, line for line.

import type { ConversationRow, MeetsMessage } from '@/api/chat';
import { addDaysYmd } from '@/lib/ist';
import { dateLabel, istDateOf, timeOf } from '@/lib/dates';
import { plural } from '@/lib/format';

/** List-row time: '9:42 AM' today, 'Yesterday', otherwise 'Mon, 19 Oct' (website mtWhen, dash.html:7108). */
export function rowTime(iso: string | null | undefined, today: string) {
  const d = istDateOf(iso ?? '');
  if (!d) return '';
  if (d === today) return timeOf(iso);
  if (d === addDaysYmd(today, -1)) return 'Yesterday';
  return dateLabel(iso, today);
}

/** The day chip in a thread: Today, Yesterday, then 'Mon, 19 Oct' (website mtDayLabel, :7111). */
export function dayChip(ymd: string, today: string) {
  if (ymd === today) return 'Today';
  if (ymd === addDaysYmd(today, -1)) return 'Yesterday';
  return dateLabel(ymd, today);
}

/** Unread pill: 99+ at most (meetsCountLabel, :7126). */
export const countLabel = (n: number) => (n >= 99 ? '99+' : String(n));

/** File size the way the website writes it (mtSize, :7003). */
export function sizeLabel(n: number | null | undefined) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export const isImageType = (t?: string | null) => /^image\/(png|jpeg|gif|webp)$/i.test(String(t || ''));
export const isAudioType = (t?: string | null) => /^audio\//i.test(String(t || ''));

/** 'Voice message (0:42).webm' → '0:42' (the website names voice notes this way). */
export function voiceDuration(name?: string | null) {
  const m = /\((\d+:\d{2})\)/.exec(String(name || ''));
  return m ? m[1]! : null;
}

/** A caption equal to the file name is not shown (the server sets body = name when there is none). */
export function captionOf(m: Pick<MeetsMessage, 'body' | 'attachment'>) {
  const body = m.body ?? '';
  if (m.attachment && body.trim() === m.attachment.name) return '';
  return body;
}

/** The one-line preview under a conversation (dash.html:10210). */
export function previewLine(c: ConversationRow, meId: string | null | undefined) {
  if (c.leftAt) return 'You left this group';
  const last = c.lastMessage;
  if (!last) return c.type === 'group' ? `${plural(c.memberCount, 'member')} · No messages yet` : 'No messages yet';
  if (last.deleted) return 'Message deleted';
  const mine = !!meId && String(last.senderId) === String(meId);
  const who = mine ? 'You' : c.type === 'group' ? (last.senderName || 'Someone').split(/\s+/)[0] : '';
  const body = (last.body ?? '').replace(/\s+/g, ' ').trim();
  return who ? `${who}: ${body}` : body;
}

/** "N members" / "Direct message" under a thread's title. */
export function subtitleOf(type: string | null | undefined, memberCount: number, leftAt?: string | null) {
  const base = type === 'group' ? plural(memberCount, 'member') : 'Direct message';
  return leftAt ? `${base} · you left` : base;
}

/**
 * The read mark captured ONCE when a thread opens: the earlier of what the list row knew and what the
 * thread GET returned (dash.html:7117 meetsReadMark). Earlier wins — a divider one message too high is
 * cosmetic, a missing one loses the person's place.
 */
export function readMark(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b || null;
  if (!b) return a;
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

/** The first message (oldest first) the mark says was unread: someone else's, not deleted (:7120). */
export function firstUnreadId(oldestFirst: MeetsMessage[], mark: string | null, meId: string | null | undefined) {
  if (!mark) return null;
  const t = Date.parse(mark);
  if (Number.isNaN(t)) return null;
  for (const m of oldestFirst) {
    if (!m || m.deleted || String(m.senderId) === String(meId)) continue;
    if (Date.parse(m.createdAt) > t) return m.id;
  }
  return null;
}

// ── Picking files: the server's allowlist (meets.js ATTACH_TYPES) by extension ──
const BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
};

/**
 * The type to send for a picked file. Pickers report CSV as text/comma-separated-values, or '' /
 * application/octet-stream, so the extension decides when the reported type is not on the list
 * (spec §5.3). null = the server would refuse it ("That kind of file cannot be sent here").
 */
export function sendableType(name: string, reported: string | null | undefined, allowed: string[]) {
  const r = String(reported || '').toLowerCase().split(';')[0]!.trim();
  if (r && allowed.includes(r)) return r;
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  const byExt = BY_EXT[ext];
  return byExt && allowed.includes(byExt) ? byExt : null;
}

/** Swap the type inside a data URL (the server checks the declared type against the bytes). */
export function withType(dataUrl: string, type: string) {
  return dataUrl.replace(/^data:[^;,]*/, `data:${type}`);
}
