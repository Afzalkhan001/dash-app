// The file type to hand the share sheet for a file someone else sent (a chat attachment, an
// announcement's file). The sender chooses that type, so only everyday document, image, audio and video
// types pass; anything else goes as a plain download (application/octet-stream), which no app opens
// as something more dangerous (an installer, a web page, a contact card).

const SAFE_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
  'audio/aac',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/ogg',
  'audio/webm',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
]);

export const OCTET_STREAM = 'application/octet-stream';

/** The sender's MIME type when it is an everyday file type, else application/octet-stream. */
export function safeMime(raw: unknown): string {
  // "Text/Plain; charset=utf-8" → "text/plain"
  const mime = String(raw ?? '').split(';')[0]!.trim().toLowerCase();
  if (mime === 'image/jpg') return 'image/jpeg';
  return SAFE_MIME.has(mime) ? mime : OCTET_STREAM;
}
