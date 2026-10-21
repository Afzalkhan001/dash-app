// Push notifications on this phone (spec docs/port/signin-push.md §4.3, owner steps docs/PUSH.md).
//
// What runs where:
//   - Installed app (development / preview / store build) on a real phone: remote push. After
//     sign-in, on foreground and when permission is granted, ensurePushRegistered() gets the Expo
//     push token for the EAS project and sends it to POST /push/devices. Sign-out removes it first
//     (onBeforeSignOut in auth/session.ts).
//   - Expo Go: remote push does not exist there (removed in SDK 53), so nothing registers and the
//     settings screen says UNAVAILABLE_IN_EXPO_GO. The demo still works: it sends LOCAL
//     notifications (sendDemoNotification), which Expo Go supports, so the tap routing can be tried.
//   - Web preview: no notifications at all; the demo shows an in-app preview banner instead.
//
// expo-notifications is required lazily (notificationsModule) so nothing touches it on web, and in
// Expo Go only once the demo or the settings screen asks — Expo Go warns as soon as it loads.
//
// Taps: a notification carries data {url, kind}. Only URLs that match a screen the app has
// (safePushUrl) are opened, after the session is ready; anything else opens the Inbox.
//
// Android channels (created before asking for permission, as Android 13+ requires): approvals
// ("Needs your approval"), visitors ("Visitors at reception", loudest), updates ("Updates"), plus the
// "default" channel app.json names for anything without a channel.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { type Href, router } from 'expo-router';
import { AppState, Linking, Platform } from 'react-native';
import { create } from 'zustand';

import { isApiError, isDemoSession } from '@/api/client';
import { type PushData, type PushKind, type PushSample, registerPushDevice, removePushDevice, sendTestPush } from '@/api/push';
import { queryClient } from '@/api/query';
import { onBeforeSignOut, useSession } from '@/auth/session';
import { hasLocalNotifications, hasRemotePush, isExpoGo, isWeb } from '@/lib/capabilities';

type NotificationsModule = typeof import('expo-notifications');
type NotificationResponse = import('expo-notifications').NotificationResponse;

// ── The module, loaded on first use ─────────────────────────────────────────
let loaded: NotificationsModule | null | undefined;
export function notificationsModule(): NotificationsModule | null {
  if (loaded !== undefined) return loaded;
  if (!hasLocalNotifications()) {
    loaded = null;
    return loaded;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-notifications') as NotificationsModule;
  } catch {
    loaded = null;
  }
  return loaded;
}

// ── What this phone can do ──────────────────────────────────────────────────
/**
 *   remote    installed app on a real phone, signed in for real: the full chain
 *   demo      the demo account on a phone (Expo Go included): local notifications only
 *   web       the web preview: an in-app preview banner only
 *   expo-go   Expo Go with a real account: nothing (UNAVAILABLE_IN_EXPO_GO)
 *   simulator an installed app on a simulator / emulator without push
 */
export type PushSupport = 'remote' | 'demo' | 'web' | 'expo-go' | 'simulator';
export function pushSupport(): PushSupport {
  if (isWeb()) return 'web';
  if (isDemoSession()) return 'demo';
  if (isExpoGo()) return 'expo-go';
  return hasRemotePush() ? 'remote' : 'simulator';
}

// ── State the screens read ──────────────────────────────────────────────────
export type PushPermission = 'unknown' | 'granted' | 'undetermined' | 'denied' | 'unavailable';
type PushState = {
  permission: PushPermission;
  /** The OS will still show its prompt (false once the person said no twice on Android, or once on iOS). */
  canAskAgain: boolean;
  /** This phone's token reached DASH in this session. */
  registered: boolean;
  /** POST /push/devices answered 404 or 503: the server change is not deployed yet. */
  serverMissing: boolean;
  busy: boolean;
  /** The Home soft ask: 'unknown' until storage is read. */
  softAsk: 'unknown' | 'show' | 'hidden';
  /** Web preview only: the demo notification being shown in the page. */
  webPreview: (PushSample & { at: number }) | null;
};
export const usePushState = create<PushState>(() => ({
  permission: 'unknown',
  canAskAgain: true,
  registered: false,
  serverMissing: false,
  busy: false,
  softAsk: 'unknown',
  webPreview: null,
}));
const setState = (p: Partial<PushState>) => usePushState.setState(p);

const TOKEN_KEY = 'dash.push.token';
const UPLOADED_KEY = 'dash.push.uploaded'; // `${userId}|${token}|${epoch ms}`
const SOFT_ASK_KEY = 'dash.push.softAsk'; // 'hidden' once dismissed or answered
const REUPLOAD_MS = 24 * 3600 * 1000;

// ── Android channels ────────────────────────────────────────────────────────
export const PUSH_CHANNELS: { id: PushKind | 'default'; name: string; description: string }[] = [
  { id: 'approvals', name: 'Needs your approval', description: 'Leave, claims, bills and requests waiting on you' },
  { id: 'visitors', name: 'Visitors at reception', description: 'Someone is at the desk to meet you' },
  { id: 'updates', name: 'Updates', description: 'Tasks, tickets, coins and decisions on your requests' },
  { id: 'default', name: 'Other', description: 'Anything else from DASH' },
];

async function setupChannels(N: NotificationsModule) {
  if (Platform.OS !== 'android') return;
  const importance: Record<string, number> = {
    approvals: N.AndroidImportance.HIGH,
    visitors: N.AndroidImportance.MAX,
    updates: N.AndroidImportance.DEFAULT,
    default: N.AndroidImportance.DEFAULT,
  };
  await Promise.all(
    PUSH_CHANNELS.map((c) =>
      N.setNotificationChannelAsync(c.id, { name: c.name, description: c.description, importance: importance[c.id] ?? N.AndroidImportance.DEFAULT, lightColor: '#C33B02' }).catch(() => null),
    ),
  );
}

// ── Permission ──────────────────────────────────────────────────────────────
function permissionOf(p: { granted: boolean; status?: string; canAskAgain?: boolean; ios?: { status?: number } }, N: NotificationsModule): PushPermission {
  if (p.granted) return 'granted';
  if (Platform.OS === 'ios' && p.ios?.status === N.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  if (p.status === 'denied') return 'denied';
  return 'undetermined';
}

export async function refreshPushPermission(): Promise<PushPermission> {
  const support = pushSupport();
  if (support === 'web' || support === 'expo-go') {
    setState({ permission: 'unavailable' });
    return 'unavailable';
  }
  const N = notificationsModule();
  if (!N) {
    setState({ permission: 'unavailable' });
    return 'unavailable';
  }
  try {
    const p = await N.getPermissionsAsync();
    const permission = permissionOf(p, N);
    setState({ permission, canAskAgain: p.canAskAgain !== false });
    return permission;
  } catch {
    setState({ permission: 'unavailable' });
    return 'unavailable';
  }
}

/** Shows the system prompt (after the app has explained why), then registers when allowed. */
export async function requestPushPermission(): Promise<PushPermission> {
  const N = notificationsModule();
  if (!N || pushSupport() === 'web' || pushSupport() === 'expo-go') return refreshPushPermission();
  setState({ busy: true });
  try {
    await setupChannels(N);
    const p = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    const permission = permissionOf(p, N);
    setState({ permission, canAskAgain: p.canAskAgain !== false });
    if (permission === 'granted') await ensurePushRegistered({ force: true });
    await hideSoftAsk();
    return permission;
  } catch {
    return refreshPushPermission();
  } finally {
    setState({ busy: false });
  }
}

/** Blocked: the only way back is the phone's settings for DASH. */
export function openPushSettings() {
  void Linking.openSettings().catch(() => {});
}

// ── Registration ────────────────────────────────────────────────────────────
function projectId(): string | undefined {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromExtra ?? Constants.easConfig?.projectId ?? undefined;
}

const demoToken = (userId: string) => `ExponentPushToken[demo_${userId.replace(/[^A-Za-z0-9_-]/g, '_').padEnd(10, '_')}]`;

let registering: Promise<boolean> | null = null;
/**
 * Sends this phone's push token to DASH when it has permission. Cheap to call often: it re-sends at
 * most once a day per person and token. Never throws; resolves true when DASH has the token.
 */
export function ensurePushRegistered(opts: { force?: boolean } = {}): Promise<boolean> {
  if (registering) return registering;
  registering = (async () => {
    try {
      const { token: session, user, kind } = useSession.getState();
      if (!session || kind !== 'staff' || !user?.id) return false;
      const support = pushSupport();
      if (support === 'web' || support === 'expo-go' || support === 'simulator') return false;
      const N = notificationsModule();
      if (!N) return false;
      if ((await refreshPushPermission()) !== 'granted') return false;
      await setupChannels(N);

      let token: string;
      if (support === 'demo') token = demoToken(user.id);
      else {
        const t = await N.getExpoPushTokenAsync({ projectId: projectId() });
        token = t.data;
      }
      await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});

      const last = (await AsyncStorage.getItem(UPLOADED_KEY).catch(() => null)) ?? '';
      const [lastUser, lastToken, lastAt] = last.split('|');
      if (!opts.force && lastUser === user.id && lastToken === token && Date.now() - Number(lastAt) < REUPLOAD_MS) {
        setState({ registered: true });
        return true;
      }
      const r = await registerPushDevice({
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        deviceName: Device.deviceName ?? Device.modelName ?? undefined,
        appVersion: Constants.expoConfig?.version ?? undefined,
      });
      if (isApiError(r)) {
        setState({ registered: false, serverMissing: r.status === 404 || r.status === 503 });
        return false;
      }
      await AsyncStorage.setItem(UPLOADED_KEY, `${user.id}|${token}|${Date.now()}`).catch(() => {});
      setState({ registered: true, serverMissing: false });
      return true;
    } catch {
      return false;
    } finally {
      registering = null;
    }
  })();
  return registering;
}

/** "Send a test notification": the whole chain, server included. */
export async function sendPushTest(): Promise<{ ok: boolean; message: string }> {
  const r = await sendTestPush();
  if (isApiError(r)) {
    if (r.status === 404) return { ok: false, message: 'Notifications aren’t switched on for DASH yet. Ask your admin.' };
    return { ok: false, message: r.error };
  }
  if (r.sent > 0) return { ok: true, message: 'Sent. It should arrive in a few seconds.' };
  if (r.skipped && /paused|PUSH_ENABLED/i.test(r.skipped)) return { ok: false, message: 'DASH isn’t sending notifications yet. Ask your admin to switch them on.' };
  return { ok: false, message: r.errors?.[0] || 'Nothing was sent. Try turning notifications off and on.' };
}

// Before the session is forgotten: this phone stops getting pushes for the person who left.
onBeforeSignOut(async () => {
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  await AsyncStorage.removeItem(UPLOADED_KEY).catch(() => {});
  setState({ registered: false });
  if (token) await removePushDevice(token);
  const N = loaded;
  if (N) await N.setBadgeCountAsync(0).catch(() => false);
});

// ── Taps → screens ──────────────────────────────────────────────────────────
// The screens a notification may open (src/app/(app)/**). Anything else opens the Inbox.
const SAFE_PATHS: RegExp[] = [
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
/** The path to open for a notification's `url`, or null when it is not one of the app's screens. */
export function safePushUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || url.length > 200) return null;
  const [path, query = ''] = url.split('?', 2) as [string, string?];
  if (!SAFE_PATHS.some((re) => re.test(path))) return null;
  if (!query) return path;
  // Only the Inbox's own filter survives (/inbox?type=leave).
  const m = /^type=([a-z0-9_-]{1,40})$/.exec(query);
  return path === '/inbox' && m ? `/inbox?type=${m[1]}` : path;
}

let pendingUrl: string | null = null;
function openFromNotification(data: PushData | undefined) {
  const url = safePushUrl(data?.url) ?? '/inbox';
  const { ready, token } = useSession.getState();
  if (!ready || !token) {
    pendingUrl = url;
    return;
  }
  try {
    router.push(url as Href);
  } catch {
    pendingUrl = url;
  }
}

function onResponse(N: NotificationsModule, response: NotificationResponse | null) {
  if (!response || response.actionIdentifier !== N.DEFAULT_ACTION_IDENTIFIER) return;
  openFromNotification(response.notification.request.content.data as PushData | undefined);
  void N.clearLastNotificationResponseAsync().catch(() => {});
}

// What a notification refreshes when it lands while DASH is open.
function refreshFor(data: PushData | undefined) {
  void queryClient.invalidateQueries({ queryKey: ['inbox'] });
  const first = safePushUrl(data?.url)?.split(/[/?]/)[1];
  if (first && first !== 'inbox') void queryClient.invalidateQueries({ queryKey: [first] });
}

// ── The bridge: started once, from <PushBridge/> (features/push/bridge.tsx) ──
let started = false;
let teardown: (() => void) | null = null;
/**
 * Idempotent. Sets the foreground handler, listens for taps (cold start included), re-registers on
 * foreground and after sign-in, and opens a tap that arrived before the session was ready.
 * In Expo Go with a real account it only watches the session (nothing to do there).
 */
export function startPushBridge(): () => void {
  if (started) return () => {};
  started = true;
  const subs: (() => void)[] = [];

  const wire = () => {
    const N = notificationsModule();
    if (!N || wired) return;
    wired = true;
    N.setNotificationHandler({
      handleNotification: async (n) => {
        refreshFor(n.request.content.data as PushData | undefined);
        return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
      },
    });
    const sub = N.addNotificationResponseReceivedListener((r) => onResponse(N, r));
    subs.push(() => sub.remove());
    void N.getLastNotificationResponseAsync()
      .then((r) => onResponse(N, r))
      .catch(() => {});
  };
  let wired = false;
  const canWire = () => {
    const s = pushSupport();
    return s === 'remote' || s === 'demo' || s === 'simulator';
  };

  const onSession = () => {
    const { ready, token } = useSession.getState();
    if (!ready || !token) return;
    if (canWire()) {
      wire();
      void ensurePushRegistered();
    } else void refreshPushPermission();
    if (pendingUrl) {
      const url = pendingUrl;
      pendingUrl = null;
      setTimeout(() => {
        try {
          router.push(url as Href);
        } catch {
          /* the Inbox is one tap away */
        }
      }, 0);
    }
  };
  onSession();
  subs.push(useSession.subscribe((s, prev) => (s.token !== prev.token || s.ready !== prev.ready ? onSession() : undefined)));

  const app = AppState.addEventListener('change', (s) => {
    if (s === 'active' && useSession.getState().token) {
      if (canWire()) void ensurePushRegistered();
      else void refreshPushPermission();
    }
  });
  subs.push(() => app.remove());

  void loadSoftAsk();
  teardown = () => {
    subs.forEach((f) => f());
    started = false;
    teardown = null;
  };
  return teardown;
}

// ── Badge ───────────────────────────────────────────────────────────────────
/** The app icon's number: the Inbox count (iOS always; Android only on launchers that show it). */
export function setAppBadge(count: number) {
  const N = loaded; // never loads the module just for this
  if (!N || pushSupport() === 'web' || pushSupport() === 'expo-go') return;
  void N.setBadgeCountAsync(Math.max(0, Math.floor(count))).catch(() => false);
}

// ── Home soft ask ───────────────────────────────────────────────────────────
async function loadSoftAsk() {
  const v = await AsyncStorage.getItem(SOFT_ASK_KEY).catch(() => null);
  setState({ softAsk: v === 'hidden' ? 'hidden' : 'show' });
}
export async function hideSoftAsk() {
  setState({ softAsk: 'hidden' });
  await AsyncStorage.setItem(SOFT_ASK_KEY, 'hidden').catch(() => {});
}

// ── Demo: a sample notification to this phone ───────────────────────────────
export const DEMO_DELAY_S = 3;
let webTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * Demo only. On a phone (Expo Go included) a local notification arrives in DEMO_DELAY_S seconds —
 * lock the phone or leave the app to see it as a real one; tapping it opens `sample.url`. On the web
 * preview the same notification appears as a banner inside the page.
 */
export async function sendDemoNotification(sample: PushSample): Promise<{ ok: boolean; message: string }> {
  if (pushSupport() === 'web') {
    if (webTimer) clearTimeout(webTimer);
    webTimer = setTimeout(() => setState({ webPreview: { ...sample, at: Date.now() } }), DEMO_DELAY_S * 1000);
    return { ok: true, message: `Arriving in ${DEMO_DELAY_S} seconds` };
  }
  const N = notificationsModule();
  if (!N) return { ok: false, message: 'Notifications don’t work on this device.' };
  wireForDemo(N);
  if ((await refreshPushPermission()) !== 'granted') return { ok: false, message: 'Turn on notifications first.' };
  await setupChannels(N);
  try {
    await N.scheduleNotificationAsync({
      content: { title: sample.title, body: sample.body, data: { url: sample.url, kind: sample.kind }, sound: 'default' },
      trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: DEMO_DELAY_S, channelId: sample.kind },
    });
    return { ok: true, message: `Arriving in ${DEMO_DELAY_S} seconds. Lock your phone to see it on the lock screen.` };
  } catch {
    return { ok: false, message: 'Couldn’t send the sample. Try again.' };
  }
}

// The demo may start before the bridge wired the handler (e.g. straight from the settings screen).
function wireForDemo(N: NotificationsModule) {
  if (demoWired || started) return;
  demoWired = true;
  N.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  N.addNotificationResponseReceivedListener((r) => onResponse(N, r));
}
let demoWired = false;

/** Web preview: the in-page banner's tap. */
export function openWebPreview() {
  const p = usePushState.getState().webPreview;
  setState({ webPreview: null });
  if (p) openFromNotification({ url: p.url, kind: p.kind });
}
export function dismissWebPreview() {
  setState({ webPreview: null });
}
