// Excel domain — the demo's sample sheets as opened workbooks (demo/fixtures/excel). Only offered in the
// demo session (features/excel/ui PickCard), where there is no file on the phone to pick.

import { DEMO_SAMPLE_SHEETS } from '@/demo/fixtures/excel';
import { type PickedSheet, readWorkbook, workbookBase64 } from '@/lib/xlsx';

export type SampleKey = keyof typeof DEMO_SAMPLE_SHEETS;

export function sampleSheet(key: SampleKey): PickedSheet {
  const s = DEMO_SAMPLE_SHEETS[key];
  const b64 = workbookBase64(s.sheets);
  return { name: s.fileName, size: Math.round((b64.length * 3) / 4), book: readWorkbook(b64, s.fileName) };
}
