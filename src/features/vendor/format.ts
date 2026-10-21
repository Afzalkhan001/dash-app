// Small formatters for the vendor portal, in the app's one way (lib/dates, lib/format): money in list
// rows in whole rupees with Indian grouping (₹1,24,500); dates 'Mon, 19 Oct' (the year only when it
// isn't this year) and times '4:30 PM', India time.

import { dateLabel, stampLabel } from '@/lib/dates';
import { inr } from '@/lib/format';

// A list row's amount: whole rupees, ₹0 when missing.
export function rupees(n: number | string | null | undefined) {
  const v = Number(n || 0);
  return inr(Number.isFinite(v) ? v : 0, { decimals: false });
}

// 'Mon, 19 Oct' ('—' when missing or malformed).
export const dateIN = (iso?: string | null) => dateLabel(iso);

// 'Mon, 19 Oct, 4:30 PM' ('—' when missing or malformed).
export const dateTimeIN = (iso?: string | null) => stampLabel(iso);

// For a YYYY-MM-DD calendar date typed into the wizard.
export function ymdLabel(ymd?: string | null) {
  if (!ymd) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? dateIN(ymd) : ymd;
}

// Everything but the last four characters, as the website masks account numbers.
export const maskTail = (s?: string | null) => (s ? s.replace(/.(?=.{4})/g, 'X') : '');

// +919876543210 → +91 98765 43210
export function prettyPhone(p?: string | null) {
  const d = (p || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : p || '';
}

// Files from the API sometimes have no extension; the share sheet needs one to know what it is.
export function withExtension(name: string, mime?: string | null) {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime?.startsWith('image/') ? 'jpg' : '';
  return ext ? `${name}.${ext}` : name;
}

export function fileSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
