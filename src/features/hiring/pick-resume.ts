// Hiring domain — choose a résumé (PDF, DOC or DOCX) as a data URL for POST /referrals.
// On a phone this is lib/files pickDocument (size-checked, read with expo-file-system). In a web
// browser expo-file-system can't read the picked file, so the browser's own File is read instead —
// that keeps the referral flow working in the web preview too.

import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

import { RESUME_TYPES } from '@/features/hiring/model';
import { FileError, pickDocument, type PickedFile } from '@/lib/files';

const MAX_BYTES = 8 * 1024 * 1024;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new FileError('That file could not be read.'));
    r.readAsDataURL(file);
  });
}

export async function pickResume(): Promise<PickedFile | null> {
  if (Platform.OS !== 'web') return pickDocument(RESUME_TYPES);
  const res = await DocumentPicker.getDocumentAsync({ type: RESUME_TYPES, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0]!;
  const file = (a as { file?: File }).file;
  if (!file) throw new FileError('That file could not be read.');
  if (file.size > MAX_BYTES) throw new FileError('That file is too large. Please choose one under 8 MB.');
  const dataUrl = await readAsDataUrl(file);
  return { name: a.name || file.name || 'resume', type: a.mimeType || file.type || 'application/octet-stream', size: file.size, dataUrl, uri: a.uri };
}
