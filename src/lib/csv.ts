// Rows → CSV → a file in the cache → the share sheet (Wave 0 shared helper, integrator-owned; any domain
// may import it). The phone's answer to the website's Excel exports (docs/port/PLAN.md §4): Files,
// WhatsApp, mail or Drive take it from the share sheet, and Excel / Sheets open it.
//
//   await shareCsv('team-tasks-2026-10-21', tasks, [
//     { label: 'Task', value: (t) => t.title },
//     { label: 'Assigned to', value: (t) => t.assignee },
//     { label: 'Due', value: (t) => t.dueDate },          // keep dates as 'YYYY-MM-DD' (IST) in exports
//   ]);
//
// - UTF-8 with a byte-order mark, so Excel shows ₹ and Indian names correctly; CRLF line ends.
// - Every cell is quoted when it needs to be, and a cell starting with = + - @ (or a tab / CR) gets a
//   leading apostrophe, so a spreadsheet never runs it as a formula (CSV injection).
// - Never export bank, salary, ID or photo data unless the screen's own gate allows it.
// - On the web build the file is downloaded instead of shared.

import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { FileError, shareFile } from '@/lib/files';

export type CsvColumn<T> = { label: string; value: (row: T) => unknown };

const FORMULA = /^[=+\-@\t\r]/;

/** One cell as CSV text: numbers as they are, everything else as text, quoted when needed. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'string' ? v : JSON.stringify(v);
  if (typeof v === 'string' && FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text: a header line from the column labels, then one line per row. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const list = Array.isArray(rows) ? rows : [];
  const head = columns.map((c) => csvCell(c.label)).join(',');
  const body = list.map((r) =>
    columns
      .map((c) => {
        try {
          return csvCell(c.value(r));
        } catch {
          return '';
        }
      })
      .join(','),
  );
  return [head, ...body].join('\r\n');
}

// A file name the phone accepts: letters, digits, dot, dash and underscore, ending in .csv.
function csvName(name: string) {
  const base = String(name || 'export').replace(/\.csv$/i, '').replace(/[^\w.\-]+/g, '_').slice(-100) || 'export';
  return `${base}.csv`;
}

/** Write CSV text to the cache; returns the file's uri (the web build has no file system: use shareCsv). */
export function saveCsv(fileName: string, csv: string): string {
  const f = new File(Paths.cache, csvName(fileName));
  if (f.exists) f.delete();
  f.create();
  f.write(`﻿${csv}`);
  return f.uri;
}

/** Rows → CSV → the share sheet (a download on the web). Throws a FileError with a plain message. */
export async function shareCsv<T>(fileName: string, rows: readonly T[], columns: readonly CsvColumn<T>[], dialogTitle = 'Share CSV') {
  const csv = toCsv(rows, columns);
  if (Platform.OS === 'web') {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) throw new FileError('Downloading is not available here.');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = csvName(fileName);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  let uri: string;
  try {
    uri = saveCsv(fileName, csv);
  } catch {
    throw new FileError('The file could not be saved on this phone. Try again.');
  }
  await shareFile(uri, 'text/csv', dialogTitle);
}
