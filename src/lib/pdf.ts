// PDFs made on the phone (expo-print), the app's answer to the website's jsPDF / window.print exports
// (docs/port/PLAN.md §4: payslip, pending reviews, schedules, petty cash statement, reports…).
// Shared helper owned by the docs domain; any domain may import it.
//
//   const doc: PdfDoc = {
//     fileName: 'Bounty_Report_2026-10-21',
//     title: 'Bounty report',
//     subtitle: '42 transactions',
//     letterhead: letterheadOf(access.tenant),
//     landscape: true,
//     sections: [{ table: { head: ['Date', 'Amount'], rows: [['Mon, 19 Oct', '120']] } }],
//   };
//   await sharePdf(doc);      // a PDF in the cache → the share sheet (save to Files, WhatsApp, mail…)
//   await printPdf(doc);      // the system print dialog
//
// - Every document carries the company letterhead like the website's pdfLetterhead (dash.html:822): the
//   report logo (or the sidebar logo), the company name, address and contact line, then the title.
// - Pages are A4 (595 × 842 pt), landscape when asked. All text is HTML-escaped here; pass plain strings.
// - Images must be data URLs (iOS cannot print local asset URLs).
// - On the web build there is no file system: both actions open the browser's print dialog on a hidden
//   frame holding the document, where "Save as PDF" is one of the printers.
// - Server-made PDFs (the payslip, GET /hr/payslips/:id/pdf) are not rebuilt here: shareServerPdf()
//   downloads them with the bearer header and opens the share sheet.

import * as Print from 'expo-print';
import { Platform } from 'react-native';

import { isDemoSession } from '@/api/client';
import { downloadAuthed, FileError, saveDataUrl, shareFile } from '@/lib/files';

export type PdfCell = string | number | null | undefined;
export type PdfAlign = 'left' | 'right' | 'center';

export type PdfTable = {
  head: string[];
  rows: PdfCell[][];
  /** Column widths as CSS ('18%', '90px'); omitted columns share the rest. */
  widths?: (string | undefined)[];
  align?: (PdfAlign | undefined)[];
  /** Per-row tint: 'good' (green, the website's booked rows), 'bad' (red), 'muted' (grey). */
  tones?: ('good' | 'bad' | 'muted' | null | undefined)[];
  /** Shown as one row when there are no rows. */
  empty?: string;
  /** A bold last row (totals). */
  total?: PdfCell[];
  /** Smaller type for wide tables (audit: 16 columns). */
  dense?: boolean;
};

export type PdfImage = { src: string; caption?: string; maxHeight?: number };

export type PdfSection = {
  heading?: string;
  /** Label → value pairs laid out in a grid (the website's meta blocks). */
  meta?: [string, PdfCell][];
  /** Plain paragraphs. */
  text?: string[];
  table?: PdfTable;
  images?: PdfImage[];
  /** Start this section on a new page. */
  pageBreak?: boolean;
};

export type PdfLetterhead = { name: string; address?: string; contact?: string; logo?: string };

export type PdfDoc = {
  /** Without .pdf; letters, digits, dot, dash and underscore are kept. */
  fileName: string;
  title: string;
  subtitle?: string;
  letterhead?: PdfLetterhead | null;
  /** Label → value pairs under the title. */
  meta?: [string, PdfCell][];
  sections: PdfSection[];
  landscape?: boolean;
  /** Small print at the end ("Printed … by …"). */
  footer?: string;
};

/** HTML-escape one value. */
export function esc(v: unknown): string {
  const s = v === null || v === undefined ? '' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

const cell = (v: PdfCell) => (v === null || v === undefined || v === '' ? '—' : esc(v));
const isImageDataUrl = (s: unknown): s is string => typeof s === 'string' && /^data:image\/(png|jpe?g|webp);base64,/i.test(s);

/**
 * The company letterhead from the tenant record (dash.html:822 pdfLetterhead): report logo or sidebar
 * logo, name (or logo text), address, and "phone · super admin email".
 */
export function letterheadOf(tenant: Record<string, unknown> | null | undefined): PdfLetterhead {
  const t = tenant ?? {};
  const str = (k: string) => (typeof t[k] === 'string' ? String(t[k]).trim() : '');
  const logo = [str('reportLogoUrl'), str('logoUrl')].find(isImageDataUrl);
  return {
    name: str('name') || str('logoText') || 'Company',
    address: str('address') || undefined,
    contact: [str('phone'), str('superAdmin')].filter(Boolean).join('   ·   ') || undefined,
    logo,
  };
}

/** A file name the phone accepts, ending in .pdf. */
export function pdfFileName(name: string) {
  const base = String(name || 'document').replace(/\.pdf$/i, '').replace(/[^\w.\-]+/g, '_').slice(-100) || 'document';
  return `${base}.pdf`;
}

/** The printable stamp the website writes under its exports, in India time. */
export function printedLine(by?: string | null, now = new Date()) {
  const p = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(now);
  return `Printed ${p} IST${by ? ` by ${by}` : ''}`;
}

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#0f172a;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{padding:0;font-size:11px;line-height:1.4}
.lh{display:flex;align-items:center;gap:14px;padding-bottom:10px;border-bottom:1px solid #e2e8f0;margin-bottom:14px}
.lh img{max-width:150px;max-height:60px;object-fit:contain}
.lh .n{font-size:15px;font-weight:700}
.lh .s{font-size:9.5px;color:#64748b;margin-top:2px}
h1{font-size:18px;margin:0 0 3px}
.sub{color:#64748b;font-size:11px;margin:0 0 12px}
h2{font-size:13px;margin:16px 0 6px}
.meta{display:flex;flex-wrap:wrap;gap:8px 22px;margin:4px 0 12px}
.meta div{min-width:110px}
.meta .l{color:#94a3b8;font-size:9px;text-transform:uppercase;letter-spacing:.03em}
.meta .v{font-weight:600;font-size:11px}
p{margin:0 0 6px}
table{width:100%;border-collapse:collapse;margin:4px 0 8px;page-break-inside:auto}
tr{page-break-inside:avoid}
thead{display:table-header-group}
th{background:#0f172a;color:#fff;text-align:left;font-weight:600;padding:6px 7px;font-size:10px}
td{padding:5px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top;word-break:break-word}
tbody tr:nth-child(even) td{background:#f8fafc}
tr.good td{color:#15803d;background:#f0fdf4}
tr.bad td{color:#b91c1c}
tr.muted td{color:#94a3b8}
tr.total td{font-weight:700;border-top:2px solid #0f172a;background:#fff}
table.dense th{font-size:7.5px;padding:4px}
table.dense td{font-size:7.5px;padding:3px 4px}
td.r,th.r{text-align:right}
td.c,th.c{text-align:center}
.empty{color:#94a3b8;text-align:center;padding:16px}
.img{margin:6px 0 10px;page-break-inside:avoid}
.img img{max-width:100%;display:block}
.img .cap{color:#64748b;font-size:9.5px;margin-top:3px}
.pb{page-break-before:always}
footer{margin-top:18px;color:#94a3b8;font-size:9px;border-top:1px solid #e2e8f0;padding-top:6px}
`;

function tableHtml(t: PdfTable) {
  const a = (i: number) => {
    const al = t.align?.[i];
    return al === 'right' ? ' class="r"' : al === 'center' ? ' class="c"' : '';
  };
  const cols = t.widths?.some(Boolean) ? `<colgroup>${t.head.map((_, i) => `<col${t.widths?.[i] ? ` style="width:${esc(t.widths[i])}"` : ''}>`).join('')}</colgroup>` : '';
  const head = `<thead><tr>${t.head.map((h, i) => `<th${a(i)}>${esc(h)}</th>`).join('')}</tr></thead>`;
  const rows = t.rows.length
    ? t.rows.map((r, ri) => `<tr${t.tones?.[ri] ? ` class="${t.tones[ri]}"` : ''}>${t.head.map((_, i) => `<td${a(i)}>${cell(r[i])}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="empty" colspan="${t.head.length}">${esc(t.empty || 'Nothing to show.')}</td></tr>`;
  const total = t.total ? `<tr class="total">${t.head.map((_, i) => `<td${a(i)}>${t.total?.[i] === undefined || t.total?.[i] === null ? '' : esc(t.total[i])}</td>`).join('')}</tr>` : '';
  return `<table${t.dense ? ' class="dense"' : ''}>${cols}${head}<tbody>${rows}${total}</tbody></table>`;
}

const metaHtml = (m: [string, PdfCell][]) => `<div class="meta">${m.map(([l, v]) => `<div><div class="l">${esc(l)}</div><div class="v">${cell(v)}</div></div>`).join('')}</div>`;

/** The whole document as one HTML page, ready for expo-print or a preview frame. */
export function pdfHtml(doc: PdfDoc): string {
  const lh = doc.letterhead;
  const letter = lh
    ? `<div class="lh">${lh.logo && isImageDataUrl(lh.logo) ? `<img src="${lh.logo}" alt="">` : ''}<div><div class="n">${esc(lh.name)}</div>${lh.address ? `<div class="s">${esc(lh.address)}</div>` : ''}${lh.contact ? `<div class="s">${esc(lh.contact)}</div>` : ''}</div></div>`
    : '';
  const sections = doc.sections
    .map((s) => {
      const parts = [
        s.heading ? `<h2>${esc(s.heading)}</h2>` : '',
        s.meta?.length ? metaHtml(s.meta) : '',
        ...(s.text ?? []).map((p) => `<p>${esc(p)}</p>`),
        s.table ? tableHtml(s.table) : '',
        ...(s.images ?? [])
          .filter((im) => isImageDataUrl(im.src))
          .map((im) => `<div class="img"><img src="${im.src}" alt="" style="max-height:${im.maxHeight ?? 900}px">${im.caption ? `<div class="cap">${esc(im.caption)}</div>` : ''}</div>`),
      ].join('');
      return `<section${s.pageBreak ? ' class="pb"' : ''}>${parts}</section>`;
    })
    .join('');
  const page = `@page{size:A4 ${doc.landscape ? 'landscape' : 'portrait'};margin:12mm}`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.title)}</title><style>${page}${CSS}</style></head><body>${letter}<h1>${esc(doc.title)}</h1>${doc.subtitle ? `<div class="sub">${esc(doc.subtitle)}</div>` : ''}${doc.meta?.length ? metaHtml(doc.meta) : ''}${sections}${doc.footer ? `<footer>${esc(doc.footer)}</footer>` : ''}</body></html>`;
}

/** A4 in points: portrait 595 × 842. */
const pageSize = (landscape?: boolean) => (landscape ? { width: 842, height: 595 } : { width: 595, height: 842 });

type Printable = PdfDoc | { html: string; fileName: string; landscape?: boolean };
const htmlOf = (d: Printable) => ('html' in d ? d.html : pdfHtml(d));

// The web build: print a hidden frame holding the document (the browser offers "Save as PDF").
function printOnWeb(html: string) {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) throw new FileError('Printing is not available here.');
  const frame = doc.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
  doc.body.appendChild(frame);
  return new Promise<void>((resolve, reject) => {
    frame.onload = () => {
      // Pictures must decode first, or the page prints blank (dash.html:25220).
      setTimeout(() => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          resolve();
        } catch (e) {
          reject(new FileError(e instanceof Error ? e.message : 'Could not open the print dialog.'));
        }
        setTimeout(() => frame.remove(), 60_000);
      }, 350);
    };
    frame.srcdoc = html;
  });
}

/** Render to a PDF file in the cache with a readable name; returns its uri and page count (phones only). */
export async function savePdf(d: Printable): Promise<{ uri: string; pages: number }> {
  if (Platform.OS === 'web') throw new FileError('Saving a PDF file is done from the print dialog on the web.');
  const r = await Print.printToFileAsync({ html: htmlOf(d), ...pageSize(d.landscape), base64: true });
  if (!r.base64) return { uri: r.uri, pages: r.numberOfPages };
  const uri = await saveDataUrl(`data:application/pdf;base64,${r.base64}`, pdfFileName(d.fileName));
  return { uri, pages: r.numberOfPages };
}

/** Make the PDF and open the share sheet (the print dialog on the web). Throws a FileError with plain words. */
export async function sharePdf(d: Printable, dialogTitle = 'Share PDF') {
  if (Platform.OS === 'web') return printOnWeb(htmlOf(d));
  try {
    const { uri } = await savePdf(d);
    await shareFile(uri, 'application/pdf', dialogTitle);
  } catch (e) {
    if (e instanceof FileError) throw e;
    throw new FileError('The PDF could not be made. Try again.');
  }
}

/** Open the system print dialog for the document. */
export async function printPdf(d: Printable) {
  if (Platform.OS === 'web') return printOnWeb(htmlOf(d));
  try {
    await Print.printAsync({ html: htmlOf(d), ...pageSize(d.landscape), orientation: d.landscape ? Print.Orientation.landscape : Print.Orientation.portrait });
  } catch (e) {
    // iOS rejects when the dialog is closed without printing: not an error for the person.
    if (Platform.OS === 'ios' && /cancel|did not complete|not complete/i.test(String((e as Error)?.message || ''))) return;
    throw new FileError('The print dialog could not be opened.');
  }
}

/** A PDF the server makes (the payslip): download with the bearer header, then the share sheet. */
export async function shareServerPdf(apiPath: string, fileName: string, dialogTitle = 'Share PDF') {
  if (isDemoSession()) throw new FileError('Downloads are not available in the demo account. The real app opens the PDF here.');
  const uri = await downloadAuthed(apiPath, pdfFileName(fileName));
  await shareFile(uri, 'application/pdf', dialogTitle);
}

/** Share a PDF already in hand as a data URL (a signed agreement copy made in the app). */
export async function shareDataUrlPdf(dataUrl: string, fileName: string, dialogTitle = 'Share PDF') {
  if (Platform.OS === 'web') {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) throw new FileError('Downloading is not available here.');
    const a = doc.createElement('a');
    a.href = dataUrl;
    a.download = pdfFileName(fileName);
    a.click();
    return;
  }
  const uri = await saveDataUrl(dataUrl, pdfFileName(fileName));
  await shareFile(uri, 'application/pdf', dialogTitle);
}

/** Render HTML (pages of images, say) to a PDF data URL on a phone; null on the web. */
export async function htmlToPdfDataUrl(html: string, landscape?: boolean): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const r = await Print.printToFileAsync({ html, ...pageSize(landscape), base64: true });
  return r.base64 ? `data:application/pdf;base64,${r.base64}` : null;
}
