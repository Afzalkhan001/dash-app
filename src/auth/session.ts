// Signed-in session for staff and vendors.
//
// The server issues a bearer token with a hard expiry (12h, or 15 days with trustDevice — the app
// always asks for the 15-day session). There is no refresh endpoint and no staff logout endpoint,
// so "signed out" means: forget the token locally (exactly what the website does).
//
// Storage: the token lives in SecureStore (Keychain/Keystore). The user record goes to AsyncStorage
// because it can be large (iOS SecureStore rejects values over ~2KB) — with heavy fields such as the
// base64 avatar stripped, since the profile screen re-fetches them anyway — and with private details
// (bank, ID numbers, salary, date of birth, address…) stripped too, so they never sit on the phone.
//
// Signing out (or a session found expired at launch) also wipes what DASH kept on the phone for that
// person: its AsyncStorage records (wipeLocalData), the files it wrote to the cache and the image cache.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import { Keyboard, Platform } from 'react-native';
import { create } from 'zustand';

import { resetSignedOutGuard, setAuthBridge } from '@/api/client';
import { DEMO_ENABLED, DEMO_TOKEN_PREFIX } from '@/demo/config';
import { personaFromToken, personaUser } from '@/demo/personas';
import { clearDashCache } from '@/lib/files';

export type SessionKind = 'staff' | 'vendor';

export type StaffUser = {
  id: string;
  name?: string;
  email?: string;
  role: string;
  tenantId?: string;
  dept?: string;
  kekaCode?: string;
  employeeNumber?: string;
  mobile?: string;
  phone?: string;
  jobTitle?: string;
  reportingTo?: string;
  [k: string]: unknown;
};

type Persisted = { kind: SessionKind; token: string; tokenExpiresAt: number | null };

type SessionState = {
  ready: boolean; // finished reading storage at launch
  kind: SessionKind | null;
  token: string | null;
  tokenExpiresAt: number | null;
  user: StaffUser | null; // staff only; vendors load their record from /vendor/me
  lastPhone: string | null; // prefill for the next sign-in after expiry
  hydrate: () => Promise<void>;
  signIn: (s: { kind: SessionKind; token: string; tokenExpiresAt?: string | number | null; user?: StaffUser | null }) => Promise<void>;
  updateUser: (u: StaffUser) => Promise<void>;
  rememberPhone: (phone: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const TOKEN_KEY = 'dash.session';

// SecureStore has no web implementation; the web build (used only for previews) falls back to
// AsyncStorage (localStorage). Phones always use the Keychain/Keystore.
const secure = {
  get: (k: string) => (Platform.OS === 'web' ? AsyncStorage.getItem(k) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (Platform.OS === 'web' ? AsyncStorage.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  del: (k: string) => (Platform.OS === 'web' ? AsyncStorage.removeItem(k) : SecureStore.deleteItemAsync(k)),
};
const USER_KEY = 'dash.user';
const PHONE_KEY = 'dash.lastPhone';
const INSTALLED_KEY = 'dash.installed';
// Everything this app keeps in the Keychain/Keystore (the app lock's switch is auth/app-lock.tsx).
const SECURE_KEYS = [TOKEN_KEY, 'dash.appLock'];

// The iOS Keychain outlives an uninstall while AsyncStorage doesn't, so a reinstall would wake up signed
// in with no user record (and the old app lock on). A fresh install has nothing in AsyncStorage: clear
// the Keychain then. An older install updating to this version has its user or phone saved: keep it.
async function forgetPreviousInstall() {
  if (Platform.OS === 'web') return;
  const [marker, userRaw, phone] = await Promise.all([
    AsyncStorage.getItem(INSTALLED_KEY),
    AsyncStorage.getItem(USER_KEY),
    AsyncStorage.getItem(PHONE_KEY),
  ]);
  if (marker) return;
  if (!userRaw && !phone) await Promise.all(SECURE_KEYS.map((k) => SecureStore.deleteItemAsync(k).catch(() => undefined)));
  await AsyncStorage.setItem(INSTALLED_KEY, '1');
}

const HEAVY_FIELDS = ['password', 'avatar', 'photo', 'photoUrl', 'profilePhoto', 'signature', 'documents'];
// Private details the app never reads from the stored user (screens that show them fetch the record):
// any key containing one of these words, or made of one of the short codes (panNumber, uan_no, pfAccount…).
// Checked against every read of the session user (bank and blood group on My profile are read from the
// fresh record; the stored one was only a fallback while it loads).
const PRIVATE_WORDS = /bank|account_?(no|num)|ifsc|aadhaa?r|passport|salary|birth|blood|address|emergency|nominee/i;
const PRIVATE_CODES = new Set(['pan', 'uan', 'pf', 'esic', 'ctc', 'dob']);
function isPrivateField(key: string) {
  if (PRIVATE_WORDS.test(key)) return true;
  // camelCase / snake_case / kebab-case parts: 'panNumber' → pan, number ('company' is not 'pan').
  const parts = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_\-.]+/);
  return parts.some((p) => PRIVATE_CODES.has(p));
}
function slimUser(u: StaffUser): StaffUser {
  const out: StaffUser = { ...u };
  for (const k of HEAVY_FIELDS) delete out[k];
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && v.length > 2000) delete out[k]; // any other embedded data: URL
    else if (isPrivateField(k)) delete out[k];
  }
  return out;
}

function toMs(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

export const useSession = create<SessionState>((set, get) => ({
  ready: false,
  kind: null,
  token: null,
  tokenExpiresAt: null,
  user: null,
  lastPhone: null,

  hydrate: async () => {
    try {
      await forgetPreviousInstall();
      const [raw, userRaw, phone] = await Promise.all([
        secure.get(TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
        AsyncStorage.getItem(PHONE_KEY),
      ]);
      const p: Persisted | null = raw ? JSON.parse(raw) : null;
      const expired = !!p?.tokenExpiresAt && p.tokenExpiresAt <= Date.now();
      // A demo session only means something in a development build (demo/config.ts).
      const deadDemo = !!p && typeof p.token === 'string' && p.token.startsWith(DEMO_TOKEN_PREFIX) && !DEMO_ENABLED;
      if (p && !expired && !deadDemo) {
        let user: StaffUser | null = p.kind === 'staff' && userRaw ? JSON.parse(userRaw) : null;
        // A record saved by an older version may still hold private details: drop them on disk too.
        if (user && Object.keys(user).some(isPrivateField)) {
          user = slimUser(user);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => undefined);
        }
        // A demo role is named by its token; the stored user is only a cache of it (and may be the
        // demo's old self from before roles existed), so a mismatch takes the role's own record.
        const persona = p.kind === 'staff' ? personaFromToken(p.token) : null;
        if (persona) {
          const own = personaUser(persona);
          if (user?.id !== own.id || user?.role !== own.role || user?.name !== own.name) user = own;
        }
        set({ kind: p.kind, token: p.token, tokenExpiresAt: p.tokenExpiresAt, user });
      } else if (p) {
        // Expired: the same clean-up as signing out (the server can't be told any more).
        await forgetSignedIn();
      }
      set({ lastPhone: phone });
    } catch {
      await forgetSignedIn();
    } finally {
      set({ ready: true });
    }
  },

  signIn: async ({ kind, token, tokenExpiresAt, user }) => {
    const exp = toMs(tokenExpiresAt ?? null);
    const slim = user ? slimUser(user) : null;
    await secure.set(TOKEN_KEY, JSON.stringify({ kind, token, tokenExpiresAt: exp } satisfies Persisted));
    if (slim) await AsyncStorage.setItem(USER_KEY, JSON.stringify(slim));
    else await AsyncStorage.removeItem(USER_KEY);
    resetSignedOutGuard();
    // The sign-in screen leaves through Stack.Protected (no navigation action, so no beforeRemove):
    // blur its field first, or Android can close the app as the keyboard hides (see (app)/_layout.tsx).
    Keyboard.dismiss();
    set({ kind, token, tokenExpiresAt: exp, user: slim });
  },

  updateUser: async (u) => {
    const slim = slimUser(u);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(slim));
    set({ user: slim });
  },

  rememberPhone: async (phone) => {
    await AsyncStorage.setItem(PHONE_KEY, phone);
    set({ lastPhone: phone });
  },

  signOut: async () => {
    // While the token still works: let hooks undo server-side state for this phone (push removes the
    // device, PLAN §2.4). Best effort and time-boxed, so signing out never waits on the network.
    await runBeforeSignOut();
    await clearStored();
    await wipeLocalData();
    Keyboard.dismiss(); // the whole signed-in stack goes (see signIn)
    set({ kind: null, token: null, tokenExpiresAt: null, user: null });
    notifySignedOut();
  },
}));

async function clearStored() {
  await Promise.allSettled([secure.del(TOKEN_KEY), AsyncStorage.removeItem(USER_KEY)]);
}

// What survives a sign-out in AsyncStorage: the next sign-in's prefill, this phone's settings and
// install marker, and the tour records (dash.tour:<user> — only "seen / skipped" per person, kept so
// the first-sign-in tour doesn't replay after every sign-in). Every other 'dash.' key is removed —
// the call log, countersigned agreements, news "seen" marks, the query cache, push upload stamp, and
// anything added later — so a new record is private by default.
const KEEP_KEYS = new Set([PHONE_KEY, INSTALLED_KEY, 'dash.themePreference', 'dash.push.softAsk', 'dash.pay.privacy', 'dash.more.open']);
const KEEP_PREFIXES = ['dash.tour:'];
const keepOnSignOut = (k: string) => !k.startsWith('dash.') || KEEP_KEYS.has(k) || KEEP_PREFIXES.some((p) => k.startsWith(p));

/** Removes what DASH kept on the phone for the person leaving. Never throws. */
async function wipeLocalData() {
  try {
    const drop = (await AsyncStorage.getAllKeys()).filter((k) => !keepOnSignOut(k));
    if (drop.length) await AsyncStorage.multiRemove(drop);
  } catch {
    // keep going: the files and images below still go
  }
  clearDashCache();
  if (Platform.OS !== 'web') {
    await Promise.allSettled([Image.clearDiskCache(), Image.clearMemoryCache()]);
  }
}

/** A session found dead at launch: forget it exactly as signing out does. */
async function forgetSignedIn() {
  await clearStored();
  await wipeLocalData();
  notifySignedOut();
}

function notifySignedOut() {
  onSignOutListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // one listener failing never stops the others
    }
  });
}

// Hooks that run at the start of signOut(), before the token is forgotten (push: remove this phone
// from the server). Each gets at most BEFORE_SIGN_OUT_MS; errors are swallowed.
const BEFORE_SIGN_OUT_MS = 3000;
const beforeSignOutHooks = new Set<() => Promise<unknown>>();
export function onBeforeSignOut(fn: () => Promise<unknown>): () => void {
  beforeSignOutHooks.add(fn);
  return () => {
    beforeSignOutHooks.delete(fn);
  };
}
async function runBeforeSignOut() {
  if (!beforeSignOutHooks.size) return;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, BEFORE_SIGN_OUT_MS));
  await Promise.race([Promise.allSettled([...beforeSignOutHooks].map((fn) => Promise.resolve().then(fn))), timeout]);
}

// Lets the query cache clear itself on sign-out without this module importing it.
const onSignOutListeners = new Set<() => void>();
export function onSignOut(fn: () => void): () => void {
  onSignOutListeners.add(fn);
  return () => {
    onSignOutListeners.delete(fn);
  };
}

setAuthBridge({
  getToken: () => {
    const { token, tokenExpiresAt } = useSession.getState();
    if (token && tokenExpiresAt && tokenExpiresAt <= Date.now()) return null;
    return token;
  },
  getActorId: () => {
    const s = useSession.getState();
    return s.kind === 'staff' ? s.user?.id ?? null : null;
  },
  onSignedOut: () => {
    void useSession.getState().signOut();
  },
});
