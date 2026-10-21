// Signed-in session for staff and vendors.
//
// The server issues a bearer token with a hard expiry (12h, or 15 days with trustDevice — the app
// always asks for the 15-day session). There is no refresh endpoint and no staff logout endpoint,
// so "signed out" means: forget the token locally (exactly what the website does).
//
// Storage: the token lives in SecureStore (Keychain/Keystore). The user record goes to AsyncStorage
// because it can be large (iOS SecureStore rejects values over ~2KB) — with heavy fields such as the
// base64 avatar stripped, since the profile screen re-fetches them anyway.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { resetSignedOutGuard, setAuthBridge } from '@/api/client';
import { DEMO_ENABLED, DEMO_TOKEN_PREFIX } from '@/demo/config';
import { personaFromToken, personaUser } from '@/demo/personas';

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

const HEAVY_FIELDS = ['password', 'avatar', 'photo', 'photoUrl', 'profilePhoto', 'signature', 'documents'];
function slimUser(u: StaffUser): StaffUser {
  const out: StaffUser = { ...u };
  for (const k of HEAVY_FIELDS) delete out[k];
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && v.length > 2000) delete out[k]; // any other embedded data: URL
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
        // A demo role is named by its token; the stored user is only a cache of it (and may be the
        // demo's old self from before roles existed), so a mismatch takes the role's own record.
        const persona = p.kind === 'staff' ? personaFromToken(p.token) : null;
        if (persona) {
          const own = personaUser(persona);
          if (user?.id !== own.id || user?.role !== own.role || user?.name !== own.name) user = own;
        }
        set({ kind: p.kind, token: p.token, tokenExpiresAt: p.tokenExpiresAt, user });
      } else if (p) {
        await clearStored();
      }
      set({ lastPhone: phone });
    } catch {
      await clearStored();
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
    set({ kind: null, token: null, tokenExpiresAt: null, user: null });
    onSignOutListeners.forEach((fn) => fn());
  },
}));

async function clearStored() {
  await Promise.allSettled([secure.del(TOKEN_KEY), AsyncStorage.removeItem(USER_KEY)]);
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
