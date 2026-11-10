// Every link that opens DASH from outside (another app, a web page, a QR code, a launch URL) passes
// through here before Expo Router sees it (expo-router "native intent", phones only).
//   - Google's sign-in return (com.tamadamedia.dashmobile:/oauthredirect?code=…) passes untouched:
//     expo-auth-session reads the code itself; the route only steps back to the sign-in screen.
//   - A link that is too long or won't decode opens Home. Expo Router's query-string parser uses
//     decode-uri-component 0.2.2, which can hang on crafted %-sequences (no fix before SDK 58).
//   - Only the screens in lib/safe-route.ts open, with nothing but their tab / filter param, so a link
//     can't prefill a form (the sign-in email) or start anything.
//   - A call link (/call/<id>) opens the calls list: joining a call always takes a tap inside the app.
// Never throws: an error here would crash the app at launch.

import { safeAppPath } from '@/lib/safe-route';

const MAX_LINK = 512;
// Google's return carries a long scope list, so it gets more room.
const MAX_GOOGLE_RETURN = 2048;

const SCHEMES = /^(?:dashmobile|com\.tamadamedia\.dashmobile):\/*/i;
const GOOGLE_RETURN = /^(?:(?:dashmobile|com\.tamadamedia\.dashmobile):\/*|\/)oauthredirect(?=[/?#]|$)/i;

const decodes = (s: string) => {
  try {
    decodeURIComponent(s);
    return true;
  } catch {
    return false;
  }
};

/** "/chat/123?x=1" from any form the link arrives in, or null for a scheme that isn't ours. */
function appPathOf(url: string): string | null {
  let rest: string;
  if (url.startsWith('/')) rest = url.slice(1);
  else if (SCHEMES.test(url)) rest = url.replace(SCHEMES, '');
  // Expo Go while testing: exp://192.168.1.5:8081/--/chat/123
  else if (/^exps?:\/\//i.test(url)) rest = /^exps?:\/\/[^/]*\/--\/(.*)$/i.exec(url)?.[1] ?? '';
  // A web link to the app (https://host/chat/123): only its path counts.
  else if (/^https?:\/\//i.test(url)) rest = url.replace(/^https?:\/\/[^/?#]*\/?/i, '');
  else return null;
  // Fragments never mean anything to a screen.
  return `/${rest.split('#')[0]!.replace(/^\/+/, '')}`;
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (typeof path !== 'string' || !path) return '/';
    if (GOOGLE_RETURN.test(path)) return path.length <= MAX_GOOGLE_RETURN && decodes(path) ? path : '/oauthredirect';
    if (path.length > MAX_LINK || !decodes(path)) return '/';
    const inApp = appPathOf(path);
    if (!inApp) return '/';
    // A call from outside never joins: the calls list, where the person chooses.
    if (/^\/call\/[^?]/.test(inApp)) return '/call';
    return safeAppPath(inApp, { links: true }) ?? '/';
  } catch {
    return '/';
  }
}
