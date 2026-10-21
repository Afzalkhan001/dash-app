// File helpers used by Bounty and Petty Cash on top of lib/files.ts:
//   - picking a video (bounty "Video" submissions) as a data URL, size-checked like documents,
//   - opening a file the server handed back, whether it is a data: URL (older rows, receipts) or a
//     short-lived signed https link (bounty files kept in Storage). Both land in the cache first and
//     are then opened with the system share sheet (Save to Files, open in…, print).

import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { FileError, type PickedFile, saveDataUrl, shareFile } from '@/lib/files';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
// A whole request body has to fit the server's 12 MB JSON limit (data URLs are ~4/3 of the file).
export const MAX_PAYLOAD_CHARS = 11 * 1024 * 1024;

const safeName = (name: string) => name.replace(/[^\w.\-]+/g, '_').slice(-120) || 'file';

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  html: 'text/html',
  zip: 'application/zip',
};
const EXT_BY_MIME: Record<string, string> = Object.fromEntries(Object.entries(MIME_BY_EXT).map(([e, m]) => [m, e]));

export const mimeFromName = (name: string) => MIME_BY_EXT[(/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase()];

function withExtension(name: string, mime?: string) {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  const ext = mime ? EXT_BY_MIME[mime] : undefined;
  return ext ? `${name}.${ext}` : name;
}

// Video from the library → data URL (videos are not re-encoded, so the 8 MB limit is the guard).
export async function pickVideo(): Promise<PickedFile | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1, allowsEditing: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0]!;
  const file = new File(a.uri);
  const size = a.fileSize ?? file.size ?? 0;
  if (size > MAX_FILE_BYTES) throw new FileError('That video is too large. Please choose one under 8 MB.');
  const b64 = await file.base64();
  const type = a.mimeType || 'video/mp4';
  return {
    name: safeName(withExtension(a.fileName || `video-${Date.now()}`, type)),
    type,
    size: size || Math.round((b64.length * 3) / 4),
    dataUrl: `data:${type};base64,${b64}`,
    uri: a.uri,
  };
}

async function openLocal(uri: string, name: string, mime?: string) {
  await shareFile(uri, mime || mimeFromName(name), name);
}

// A data: URL (receipt, older bounty file) → cache → share sheet.
export async function openDataUrl(dataUrl: string, fileName: string) {
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1];
  const name = withExtension(safeName(fileName || 'file'), mime);
  const uri = await saveDataUrl(dataUrl, name);
  await openLocal(uri, name, mime);
}

// A signed https link (expires in minutes) → download now → share sheet.
export async function openRemoteFile(url: string, fileName: string) {
  const name = safeName(fileName || 'file');
  let uri: string;
  try {
    const out = await File.downloadFileAsync(url, new File(Paths.cache, name), { idempotent: true });
    uri = out.uri;
  } catch {
    throw new FileError('Could not download the file. Try again.');
  }
  await openLocal(uri, name);
}

export async function openFileSource(src: string, fileName: string) {
  if (src.startsWith('data:')) return openDataUrl(src, fileName);
  if (/^https?:\/\//i.test(src)) return openRemoteFile(src, fileName);
  throw new FileError('This file is no longer available.');
}

export const fileSizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
