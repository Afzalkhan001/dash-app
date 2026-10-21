// Excel in and out of DASH (excel domain). SheetJS (`xlsx` 0.20.3, from cdn.sheetjs.com) is pure JS,
// so it runs in Expo Go, on Android, iOS and the web build. It is about 1 MB of code, so it is loaded
// the first time a workbook is built or read (`lib()` below), never when the app starts.
//
//   OUT  await shareXlsx('Asset_Report_All_2026-10-21', [{ name: 'Assets', rows: [header, ...body], cols: [22, 20] }]);
//        → a real .xlsx in the cache → the share sheet (a download on the web).
//   IN   const picked = await pickSpreadsheet();        // .xlsx / .xls / .csv, up to 8 MB
//        const rows = sheetObjects(picked.book);       // first sheet as [{ 'Header': 'value' }]
//
// The website builds the same files with window.XLSX (dash.html: xlsxLetterheadRows 876 and every
// XLSX.writeFile call); column names, sheet names and file names here are copied from it.
// Cells are written as typed values (text stays text), so nothing in a sheet is ever run as a formula.

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { FileError, shareFile } from '@/lib/files';

type XLSXModule = typeof import('xlsx');
let cached: XLSXModule | null = null;
/** SheetJS, loaded on first use (keeps ~1 MB of parsing code out of app start-up). */
function lib(): XLSXModule {
  if (!cached) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('xlsx') as XLSXModule;
  }
  return cached;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_SHEET_BYTES = 8 * 1024 * 1024;

export type Cell = string | number | boolean | Date | null | undefined;
export type SheetSpec = {
  /** Tab name (Excel allows 31 characters and no : \ / ? * [ ]). */
  name: string;
  /** Rows of cells, the header row included. */
  rows: Cell[][];
  /** Column widths in characters (SheetJS `wch`), optional. */
  cols?: number[];
};

const sheetName = (name: string, taken: Set<string>) => {
  let base = String(name || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let n = 2;
  const first = base;
  while (taken.has(base.toLowerCase())) base = `${first.slice(0, 28)} ${n++}`;
  taken.add(base.toLowerCase());
  return base;
};

const cleanCell = (v: Cell): Cell => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  if (typeof v === 'string') return v.length > 32000 ? `${v.slice(0, 32000)}…` : v; // Excel's cell limit is 32 767
  return v;
};

/** Objects (one per row) → header + rows, like SheetJS json_to_sheet: the header is the first row's keys plus any later ones. */
export function objectsToRows(list: readonly Record<string, Cell>[], header?: readonly string[]): Cell[][] {
  const keys: string[] = header ? [...header] : [];
  if (!header) for (const r of list) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  return [keys, ...list.map((r) => keys.map((k) => r[k]))];
}

/** Build a workbook in memory (SheetJS types never leak out of this file). */
function buildBook(sheets: readonly SheetSpec[]) {
  const X = lib();
  const wb = X.utils.book_new();
  const taken = new Set<string>();
  const list = sheets.length ? sheets : [{ name: 'Sheet1', rows: [['Nothing to export']] }];
  for (const s of list) {
    const ws = X.utils.aoa_to_sheet((Array.isArray(s.rows) ? s.rows : []).map((r) => (Array.isArray(r) ? r.map(cleanCell) : [])));
    if (s.cols?.length) ws['!cols'] = s.cols.map((wch) => ({ wch }));
    X.utils.book_append_sheet(wb, ws, sheetName(s.name, taken));
  }
  return wb;
}

/** A safe file name ending in .xlsx (letters, digits, dot, dash, underscore). */
export function xlsxName(name: string) {
  const base = String(name || 'export').replace(/\.xlsx?$/i, '').replace(/[^\w.\-]+/g, '_').slice(-110) || 'export';
  return `${base}.xlsx`;
}

/** The workbook as base64 (what the native file write takes). */
export function workbookBase64(sheets: readonly SheetSpec[]): string {
  return lib().write(buildBook(sheets), { type: 'base64', bookType: 'xlsx', compression: true }) as string;
}

/** Sheets → .xlsx → the share sheet (a download on the web). Throws a FileError with a plain message. */
export async function shareXlsx(fileName: string, sheets: readonly SheetSpec[], dialogTitle = 'Share Excel file') {
  const name = xlsxName(fileName);
  if (Platform.OS === 'web') {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) throw new FileError('Downloading is not available here.');
    const bytes = lib().write(buildBook(sheets), { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  let uri: string;
  try {
    const b64 = workbookBase64(sheets);
    const f = new File(Paths.cache, name);
    if (f.exists) f.delete();
    f.create();
    f.write(b64, { encoding: 'base64' });
    uri = f.uri;
  } catch {
    throw new FileError('The Excel file could not be saved on this phone. Try again.');
  }
  await shareFile(uri, XLSX_MIME, dialogTitle);
}

/**
 * The website's letterhead rows (xlsxLetterheadRows, dash.html:876): company name, address, contact
 * line, a blank row, the title, an optional subtitle, a blank row.
 */
export function letterheadRows(
  tenant: { name?: string | null; logoText?: string | null; address?: string | null; phone?: string | null; superAdmin?: string | null } | null | undefined,
  title: string,
  subtitle?: string,
): Cell[][] {
  const t = tenant ?? {};
  const rows: Cell[][] = [[t.name || t.logoText || 'Company']];
  if (t.address) rows.push([t.address]);
  const contact = [t.phone, t.superAdmin].filter(Boolean).join('   ');
  if (contact) rows.push([contact]);
  rows.push([]);
  rows.push([title]);
  if (subtitle) rows.push([subtitle]);
  rows.push([]);
  return rows;
}

// ── Reading ──────────────────────────────────────────────────────────────────
/** An opened workbook: its sheet names and a reader for each (SheetJS's own object stays private). */
export type Workbook = { sheetNames: string[]; _wb: unknown };
export type PickedSheet = { name: string; size: number; book: Workbook };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** One cell as the text a person typed: dates as YYYY-MM-DD, numbers without float noise. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : ymd(v);
  if (typeof v === 'number') return Number.isFinite(v) ? String(Number.isInteger(v) ? v : Number(v.toPrecision(12))) : '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v).trim();
}

/** Parse workbook bytes (base64 or an ArrayBuffer). Throws a FileError when it is not a spreadsheet. */
export function readWorkbook(data: string | ArrayBuffer, fileName = ''): Workbook {
  const X = lib();
  try {
    const wb = typeof data === 'string' ? X.read(data, { type: 'base64', cellDates: true }) : X.read(new Uint8Array(data), { type: 'array', cellDates: true });
    if (!wb.SheetNames.length) throw new Error('empty');
    return { sheetNames: [...wb.SheetNames], _wb: wb };
  } catch {
    throw new FileError(`${fileName || 'That file'} could not be read. Choose an .xlsx, .xls or .csv file.`);
  }
}

/** CSV text (e.g. a server's export) → a workbook; numbers in the CSV become numbers. */
export function readCsvText(text: string): Workbook {
  const wb = lib().read(String(text || '').replace(/^﻿/, ''), { type: 'string', raw: false });
  return { sheetNames: [...wb.SheetNames], _wb: wb };
}

type SheetJsBook = { SheetNames: string[]; Sheets: Record<string, unknown> };
const sheetOf = (book: Workbook, which: number | string) => {
  const wb = book._wb as SheetJsBook;
  const name = typeof which === 'number' ? wb.SheetNames[which] : which;
  return name ? wb.Sheets[name] : undefined;
};

/** A sheet (default the first) as one object per row, keyed by the header row; every value is text. */
export function sheetObjects(book: Workbook, which: number | string = 0): Record<string, string>[] {
  const ws = sheetOf(book, which);
  if (!ws) return [];
  const raw = lib().utils.sheet_to_json<Record<string, unknown>>(ws as never, { defval: '', raw: true });
  return raw.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) out[k] = cellText(v);
    return out;
  });
}

/** A sheet as a grid of raw cells (numbers, Dates, text or null), the website's `header:1, raw:true`. */
export function sheetMatrix(book: Workbook, which: number | string = 0): unknown[][] {
  const ws = sheetOf(book, which);
  if (!ws) return [];
  return lib().utils.sheet_to_json<unknown[]>(ws as never, { header: 1, raw: true, defval: null });
}

/**
 * Pick a spreadsheet from Files / Drive / the downloads folder and open it. Null when the person
 * cancels. Throws a FileError (too big, unreadable) with words to show.
 */
export async function pickSpreadsheet(): Promise<PickedSheet | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [
      XLSX_MIME,
      'application/vnd.ms-excel',
      'text/csv',
      'text/comma-separated-values',
      'application/csv',
      'application/octet-stream',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0]!;
  const name = a.name || 'sheet.xlsx';
  if (!/\.(xlsx|xlsm|xls|csv)$/i.test(name)) throw new FileError('Choose an Excel (.xlsx, .xls) or .csv file.');
  if (a.size && a.size > MAX_SHEET_BYTES) throw new FileError('That file is too large. Please choose one under 8 MB.');
  let book: Workbook;
  if (Platform.OS === 'web') {
    const webFile = (a as { file?: Blob }).file;
    if (!webFile) throw new FileError('That file could not be opened here.');
    book = readWorkbook(await webFile.arrayBuffer(), name);
  } else {
    let b64: string;
    try {
      b64 = await new File(a.uri).base64();
    } catch {
      throw new FileError('That file could not be opened. Try again.');
    }
    book = readWorkbook(b64, name);
  }
  return { name, size: a.size ?? 0, book };
}
