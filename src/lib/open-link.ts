// The one way out of DASH to a web page, a mail app or the dialler. A link from the server or typed by
// another person is parsed first; only https opens (http too while developing), so a javascript:,
// intent:, file: or other-app link can never be launched from a tap. Links someone else typed (an
// applicant's profile) can ask first, showing the site's name, before anything opens.

import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking, Platform } from 'react-native';

export type OpenOptions = {
  /** In-app browser (default, like most screens) or the phone's own browser / app. */
  via?: 'browser' | 'system';
  /** Add https:// to a bare "example.com" (links people paste without a scheme). */
  addScheme?: boolean;
  /** Ask "Open <host>?" first: for links typed by someone outside the company. */
  confirm?: boolean;
  browser?: WebBrowser.WebBrowserOpenOptions;
};

const MAX_URL = 2048;

/** The parsed https URL (http in development), or null when it must not be opened. */
export function webUrl(raw: unknown, addScheme = false): URL | null {
  let s = String(raw ?? '').trim();
  // Spaces and control characters only appear in links built to confuse a parser.
  if (!s || s.length > MAX_URL || /\s/.test(s) || [...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null;
  // Only a bare host gets https:// added; "javascript:…" or "intent://…" stay as they are and fail below.
  if (addScheme && !/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const ok = u.protocol === 'https:' || (__DEV__ && u.protocol === 'http:');
  // Logins in the address (https://bank.com@evil.site) only exist to mislead.
  if (!ok || !u.hostname || u.username || u.password) return null;
  return u;
}

/** "example.com" for a link, for labels and the confirm. */
export const hostOf = (u: URL) => u.hostname.replace(/^www\./i, '');

function ask(host: string): Promise<boolean> {
  const title = `Open ${host}?`;
  const message = 'This link was added by someone outside DASH. Only open it if you trust the site.';
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Open', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/**
 * Opens a web link safely. Returns false (and opens nothing) for anything that is not https, when the
 * person says no to the confirm, or when the browser could not be opened.
 */
export async function openExternal(raw: unknown, opts: OpenOptions = {}): Promise<boolean> {
  const u = webUrl(raw, opts.addScheme);
  if (!u) return false;
  if (opts.confirm && !(await ask(hostOf(u)))) return false;
  try {
    if (opts.via === 'system') await Linking.openURL(u.href);
    else await WebBrowser.openBrowserAsync(u.href, opts.browser);
    return true;
  } catch {
    return false;
  }
}

/** "mailto:name@example.com" for one plain address, or null when it isn't one. */
export function mailtoLink(email: unknown): string | null {
  const e = String(email ?? '').trim();
  // One address only: no second recipient, no ?subject= / &body= / &bcc= smuggled in.
  const m = /^([^\s@,;:?&/<>"'()]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})$/.exec(e);
  if (!m || e.length > 254) return null;
  // The name part is encoded (a "+" or "%" stays literal); the domain is plain letters, digits, dots.
  return `mailto:${encodeURIComponent(m[1]!)}@${m[2]}`;
}

/** "tel:+919848022113" for a phone number, or null. */
export function telLink(phone: unknown): string | null {
  const digits = String(phone ?? '').trim().replace(/[^\d+]/g, '');
  // Only a leading + is kept; nothing else is left that would need encoding.
  const d = digits.startsWith('+') ? `+${digits.slice(1).replace(/\+/g, '')}` : digits.replace(/\+/g, '');
  if (!/^\+?\d{3,15}$/.test(d)) return null;
  return `tel:${d}`;
}
