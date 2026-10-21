// Files in and out of DASH.
//
// IN (uploads): the server has no multipart support — every upload is a base64 data URL inside the
// JSON body, and bodies are capped at 12 MB. So photos are resized + JPEG-compressed on the phone
// first, and documents are size-checked before they are read.
//
// OUT (downloads): authenticated routes (payslip PDF, receipts, passes) need the bearer header, so
// they are downloaded to the cache with expo-file-system and then opened/shared from there.

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';

import { authHeaders, isDemoSession } from '@/api/client';
import { API_URL } from '@/config';

export type PickedFile = { name: string; type: string; size: number; dataUrl: string; uri: string };

const MAX_DOC_BYTES = 8 * 1024 * 1024; // leaves room under the server's 12 MB body limit (base64 is +33%)
const MAX_IMAGE_EDGE = 1600;

export class FileError extends Error {}

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, '_').slice(-120) || 'file';
}

// Photo from camera or gallery → compressed JPEG data URL.
export async function pickImage(source: 'camera' | 'library' = 'library'): Promise<PickedFile | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new FileError('Camera permission is needed. Allow it in Settings and try again.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0]!;

  const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  const longEdge = Math.max(asset.width || 0, asset.height || 0);
  if (longEdge > MAX_IMAGE_EDGE) {
    if ((asset.width || 0) >= (asset.height || 0)) ctx.resize({ width: MAX_IMAGE_EDGE, height: null });
    else ctx.resize({ width: null, height: MAX_IMAGE_EDGE });
  }
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new FileError('Could not read that photo.');
  const base = (asset.fileName || `photo-${Date.now()}`).replace(/\.\w+$/, '');
  return {
    name: safeName(`${base}.jpg`),
    type: 'image/jpeg',
    size: Math.round((saved.base64.length * 3) / 4),
    dataUrl: `data:image/jpeg;base64,${saved.base64}`,
    uri: saved.uri,
  };
}

// Any document (PDF, image, …) → data URL. Images picked this way are NOT compressed; use
// pickImage for photos.
export async function pickDocument(types: string[] = ['application/pdf', 'image/*']): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0]!;
  if (a.size && a.size > MAX_DOC_BYTES) throw new FileError('That file is too large. Please choose one under 8 MB.');
  const b64 = await new File(a.uri).base64();
  const type = a.mimeType || 'application/octet-stream';
  return { name: safeName(a.name || 'document'), type, size: a.size ?? Math.round((b64.length * 3) / 4), dataUrl: `data:${type};base64,${b64}`, uri: a.uri };
}

// Download an authenticated API route (e.g. '/hr/payslips/123/pdf') into the cache.
export async function downloadAuthed(apiPath: string, fileName: string): Promise<string> {
  if (isDemoSession()) throw new FileError('Downloads are not available in the demo account.');
  const dest = new File(Paths.cache, safeName(fileName));
  const url = apiPath.startsWith('http') ? apiPath : `${API_URL}${apiPath.startsWith('/api/') ? apiPath.slice(4) : apiPath}`;
  try {
    const out = await File.downloadFileAsync(url, dest, { headers: authHeaders(), idempotent: true });
    return out.uri;
  } catch (e: any) {
    throw new FileError(e?.message?.includes('401') ? 'Your session has expired. Sign in again.' : 'Could not download the file. Try again.');
  }
}

// Many DASH routes return files as JSON { fileData: 'data:…;base64,…', fileName }. Write one to the cache.
export async function saveDataUrl(dataUrl: string, fileName: string): Promise<string> {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new FileError('That file could not be read.');
  const f = new File(Paths.cache, safeName(fileName));
  if (f.exists) f.delete();
  f.create();
  if (m[2]) f.write(m[3]!, { encoding: 'base64' });
  else f.write(decodeURIComponent(m[3]!));
  return f.uri;
}

// Open the system share sheet (save to Files, WhatsApp, print, …) for a local file.
export async function shareFile(uri: string, mimeType?: string, dialogTitle?: string) {
  if (!(await Sharing.isAvailableAsync())) throw new FileError('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined });
}
