// Viewing a receipt. Receipts are data URLs fetched on demand (they never ride along in lists):
// images open in a sheet, PDFs go straight to the system share sheet (preview / save / print).
// Same safety check as the website's PettyCashReceiptLink: only a base64 image or PDF, never SVG.

import { useState } from 'react';
import { Alert } from 'react-native';

import { isApiError } from '@/api/client';
import { fetchBillReceipt, fetchSubmissionReceipt } from '@/api/petty-cash';
import { openDataUrl } from '@/features/bounty/files';

import { ReceiptImageSheet } from './components';

const SAFE = /^data:(image\/[a-z0-9.+-]+|application\/pdf);base64,/i;

export function useReceiptViewer() {
  const [img, setImg] = useState<{ dataUrl: string; name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const open = async (kind: 'submission' | 'bill', id: string, name?: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const r = kind === 'submission' ? await fetchSubmissionReceipt(id) : await fetchBillReceipt(id);
      if (isApiError(r)) throw new Error(r.error);
      const src = typeof r?.fileData === 'string' ? r.fileData : '';
      if (!SAFE.test(src) || /svg/i.test(src.slice(0, 40))) throw new Error('This receipt could not be shown.');
      const fileName = (typeof r.fileName === 'string' && r.fileName) || name || 'receipt';
      if (src.startsWith('data:image/')) setImg({ dataUrl: src, name: fileName });
      else await openDataUrl(src, fileName);
    } catch (e) {
      Alert.alert('Couldn’t open the receipt', e instanceof Error ? e.message : 'This receipt could not be shown.');
    } finally {
      setBusyId(null);
    }
  };

  const sheet = (
    <ReceiptImageSheet
      dataUrl={img?.dataUrl ?? null}
      title={img?.name}
      onClose={() => setImg(null)}
      onShare={() => {
        if (!img) return;
        openDataUrl(img.dataUrl, img.name).catch((e: unknown) => Alert.alert('Couldn’t share', e instanceof Error ? e.message : 'Could not share this receipt.'));
      }}
    />
  );

  return { open, busyId, sheet };
}
