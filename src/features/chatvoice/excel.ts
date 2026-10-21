// The chat export as an Excel workbook, the same as the website's "Excel" button (dash.html:10104): one
// sheet "Messages", columns Timestamp, Sender, Message, from GET …/export rows (already formula-safe
// and IST on the server). SheetJS is loaded only when someone exports, so it never weighs on app start.

import { Platform } from 'react-native';

import { type ExportRow } from '@/api/chat';
import { FileError, saveDataUrl, shareFile } from '@/lib/files';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function shareChatXlsx(baseName: string, rows: readonly ExportRow[]) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({ Timestamp: r.timestamp, Sender: r.sender, Message: r.message })));
  ws['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 70 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Messages');
  const fileName = `${baseName}.xlsx`;

  if (Platform.OS === 'web') {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) throw new FileError('Downloading is not available here.');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([out], { type: XLSX_TYPE }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
  let uri: string;
  try {
    uri = await saveDataUrl(`data:${XLSX_TYPE};base64,${b64}`, fileName);
  } catch {
    throw new FileError('The file could not be saved on this phone. Try again.');
  }
  await shareFile(uri, XLSX_TYPE, 'Share chat');
}
