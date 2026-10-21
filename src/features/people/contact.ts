// Reaching a colleague from their profile: phone, email, WhatsApp, or sharing their contact.

import { Alert, Linking, Share } from 'react-native';

import { haptic } from '@/ui';

const digits = (s: string) => String(s || '').replace(/\D/g, '');

async function open(url: string, what: string) {
  try {
    haptic.select();
    await Linking.openURL(url);
  } catch {
    Alert.alert(`Couldn't open ${what}`, 'Nothing on this phone can handle that.');
  }
}

/**
 * A number for display, grouped the way your own profile shows it: an Indian mobile however it was
 * stored ('+919000101048', '919000101048', '09000101048', '9000101048') reads '+91 90001 01048'.
 * Anything else (a landline, a foreign number, an extension) is shown as stored. Display only:
 * dial and message with the raw value.
 */
export function phoneDisplay(raw?: string | null) {
  const stored = String(raw || '').trim();
  const local = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(stored.replace(/[\s().-]/g, ''))?.[1];
  return local ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : stored;
}

export function callNumber(raw: string) {
  const n = String(raw || '').replace(/[^\d+]/g, '');
  if (n) void open(`tel:${n}`, 'the dialler');
}

export function sendMail(email: string) {
  const to = String(email || '').trim();
  if (to) void open(`mailto:${encodeURIComponent(to).replace(/%40/g, '@')}`, 'your mail app');
}

// DASH numbers are Indian; a bare 10-digit number gets the +91 country code (the server matches
// on the last 10 digits the same way).
function whatsAppDigits(raw: string) {
  const d = digits(raw);
  return d.length === 10 ? `91${d}` : d;
}

/** True when the number is long enough to open in WhatsApp (so the button is only shown when it works). */
export const canWhatsApp = (raw?: string | null) => whatsAppDigits(String(raw || '')).length >= 11;

export function openWhatsApp(raw: string) {
  const d = whatsAppDigits(raw);
  if (d.length >= 11) void open(`https://wa.me/${d}`, 'WhatsApp');
}

export function shareContact(p: { name?: string; title?: string; phone?: string; email?: string }) {
  const lines = [p.name, p.title, p.phone, p.email].filter((x) => !!x && String(x).trim());
  if (lines.length) void Share.share({ message: lines.join('\n') }).catch(() => {});
}
