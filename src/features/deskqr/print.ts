// Printable pages made on the phone: the reception check-in poster (web: VisitorQrPage "Print poster",
// dash.html:35788 — same words) and a guest's visitor pass with a QR of its code (the server's pass,
// visitors.js buildPassSvg, has the code as text only). Native: expo-print makes a PDF in the cache and the
// share sheet sends it (print, save to Files, WhatsApp…). Web: a new tab with the page, then print.
// Nothing is uploaded and nobody is messaged by making one.

import * as Print from 'expo-print';
import { Platform } from 'react-native';

import { passPayload } from '@/features/deskqr/pass';
import { qrSvgMarkup } from '@/features/deskqr/qr';
import { shareFile } from '@/lib/files';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export function posterHtml(companyName: string, url: string) {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>Visitor check-in poster</title><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;text-align:center;margin:0;padding:60px 40px;color:#0f172a}' +
    'h1{font-size:46px;margin:0 0 6px}h2{font-size:26px;font-weight:600;color:#475569;margin:0 0 36px}' +
    '.qr svg{width:420px;height:420px}p{font-size:22px;color:#334155;margin:26px 0 0;line-height:1.5}' +
    'small{display:block;margin-top:34px;font-size:15px;color:#94a3b8}</style></head><body>' +
    `<h1>Welcome to ${esc(companyName || 'our office')}</h1><h2>Please check in</h2>` +
    `<div class="qr">${qrSvgMarkup(url, 420)}</div>` +
    '<p>1. Scan this code with your phone camera<br/>2. Choose who you are meeting<br/>3. Take a quick photo and wait for approval</p>' +
    '<small>No app needed. Your photo is deleted after a short retention period.</small></body></html>'
  );
}

export type PassInfo = { company: string; guest: string; host: string; when: string; purpose: string; code: string };

export function passHtml(p: PassInfo) {
  const digits = esc(String(p.code).split('').join(' '));
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>Visitor pass</title><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:40px;color:#0f172a;background:#fff}' +
    '.card{max-width:520px;margin:0 auto;border:2px solid #e2e8f0;border-radius:28px;overflow:hidden}' +
    '.top{background:#C33B02;color:#fff;text-align:center;padding:26px 20px}.top small{letter-spacing:6px;font-weight:700;font-size:13px;opacity:.85}' +
    '.top h1{margin:8px 0 0;font-size:28px}.body{padding:26px 32px;text-align:center}.guest{font-size:32px;font-weight:800;margin:4px 0 18px}' +
    '.rows{text-align:left;margin:0 auto 18px;max-width:380px}.k{font-size:12px;letter-spacing:3px;color:#94a3b8;font-weight:700;margin-top:12px}' +
    '.v{font-size:18px;font-weight:700}.qr svg{width:240px;height:240px}.code{font-size:40px;font-weight:800;letter-spacing:4px;margin:6px 0}' +
    '.foot{font-size:15px;color:#64748b;margin-top:10px}</style></head><body><div class="card">' +
    `<div class="top"><small>VISITOR PASS</small><h1>${esc(p.company || 'Visitor pass')}</h1></div>` +
    `<div class="body"><div class="guest">${esc(p.guest)}</div><div class="rows">` +
    `<div class="k">DATE</div><div class="v">${esc(p.when)}</div>` +
    `<div class="k">MEETING WITH</div><div class="v">${esc(p.host)}</div>` +
    (p.purpose ? `<div class="k">PURPOSE</div><div class="v">${esc(p.purpose.slice(0, 48))}</div>` : '') +
    `</div><div class="qr">${qrSvgMarkup(passPayload(p.code), 240)}</div>` +
    `<div class="k">CHECK-IN CODE</div><div class="code">${digits}</div>` +
    '<div class="foot">Show this pass at the security desk</div></div></div></body></html>'
  );
}

/** Makes the page and opens the share sheet (native) or the browser's print dialog (web). */
export async function printOrShare(html: string, dialogTitle: string) {
  if (Platform.OS === 'web') {
    const w = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    if (!w) throw new Error('Your browser blocked the pop-up. Allow pop-ups to print.');
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      w.focus();
      w.print();
    }, 400);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 }); // A4 at 72 PPI
  await shareFile(uri, 'application/pdf', dialogTitle);
}

/** Straight to the phone's print dialog (AirPrint / Android print service). */
export async function printNow(html: string) {
  if (Platform.OS === 'web') return printOrShare(html, 'Print');
  await Print.printAsync({ html, width: 595, height: 842 });
}
