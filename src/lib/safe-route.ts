// Which DASH screens a path from outside the app may open: a link from another app, a web page or a
// QR code (app/+native-intent.tsx). A copy of the notification list in lib/push.ts (SAFE_PATHS /
// safePushUrl), so push.ts can switch to safeAppPath() later and keep one list.

// The screens a notification or link may open (src/app/(app)/**). Anything else opens Home.
export const SAFE_PATHS: RegExp[] = [
  /^\/inbox(\/[a-z0-9_-]+(\/[A-Za-z0-9_.:-]+)?)?$/,
  /^\/tasks(\/[A-Za-z0-9_.-]+)?$/,
  /^\/support(\/[A-Za-z0-9_.-]+)?$/,
  /^\/visitors(\/(history|invitations))?$/,
  /^\/reimbursements(\/approvals|\/[A-Za-z0-9_.-]+)?$/,
  /^\/petty-cash(\/requests|\/bills|\/request\/[A-Za-z0-9_.-]+)?$/,
  /^\/bounty(\/wallet|\/claims|\/[A-Za-z0-9_.-]+)?$/,
  /^\/announcements(\/[A-Za-z0-9_.-]+)?$/,
  /^\/chat(\/[A-Za-z0-9_.-]+)?$/,
  /^\/(profile|leave|leave\/requests|attendance|pay|policies|me|more)$/,
  /^\/admin\/push$/,
  /^\/admin\/desk(\/log|\/invites)?$/,
  /^\/admin\/service-desk(\/[A-Za-z0-9_.-]+)?$/,
  /^\/admin\/accounts(\/queue|\/payments)?$/,
];

// Only from a link: Home, the calls list (never a call itself: joining takes a tap inside the app) and
// the sign-in screens, with nothing filled in.
const LINK_ONLY_PATHS: RegExp[] = [/^\/$/, /^\/call$/, /^\/(login|email|signup|vendor)$/];

// The one filter a screen reads from its address (a tab or a list filter). Every other ?param is dropped.
const KEPT_PARAM: Record<string, string> = {
  '/inbox': 'type',
  '/visitors': 'tab',
  '/support': 'tab',
  '/bounty': 'tab',
  '/petty-cash': 'tab',
  '/me': 'tab',
  '/admin/accounts/queue': 'type',
};

/**
 * The in-app path to open for `url` ("/inbox?type=leave"), or null when it is not one of the screens
 * above. `links` also allows the link-only screens. Query params other than the screen's filter are dropped.
 */
export function safeAppPath(url: unknown, opts: { links?: boolean } = {}): string | null {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || url.length > 200) return null;
  const q = url.indexOf('?');
  const path = q < 0 ? url : url.slice(0, q);
  const query = q < 0 ? '' : url.slice(q + 1);
  const allowed = SAFE_PATHS.some((re) => re.test(path)) || (!!opts.links && LINK_ONLY_PATHS.some((re) => re.test(path)));
  if (!allowed) return null;
  const key = KEPT_PARAM[path];
  if (!key || !query) return path;
  for (const pair of query.split('&')) {
    const [k, v = ''] = pair.split('=');
    if (k === key && /^[a-z0-9_-]{1,40}$/.test(v)) return `${path}?${key}=${v}`;
  }
  return path;
}
